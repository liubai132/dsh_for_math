"""表达式安全解析。

这里不直接用 eval / sympify(raw)，而是：
1. 只允许数学字符（数字、字母、四则运算、括号、等号、比较符）；
2. 禁用一切可能触发代码执行的关键字；
3. 在受限命名空间里解析，并把 __builtins__ 置空。

它挡不住所有攻击（本工具定位是本地教学工具），但足以防住常见的注入写法。
"""

from __future__ import annotations

import re

import sympy as sp
from sympy.parsing.sympy_parser import (
    convert_xor,
    implicit_multiplication_application,
    parse_expr,
    standard_transformations,
)

TRANSFORMS = standard_transformations + (
    implicit_multiplication_application,
    convert_xor,
)

MAX_LEN = 400

_CHARS = re.compile(r"^[0-9A-Za-z+\-*/^().,<>=!|&\s]+$")
_BAD_WORDS = re.compile(
    r"(__|import|exec|eval|open|compile|globals|locals|class|def|lambda|"
    r"assert|del|global|nonlocal|yield|async|await|try|except|raise|with)\b",
    re.IGNORECASE,
)

# 允许直接写的变量名
SYMBOL_NAMES = (
    "x y z t n k m a b c d u v w r s p q f g h j l alpha beta gamma "
    "delta theta phi psi omega lam mu_ sigma_ tau_".split()
)
SYMBOL_NAMES = [name.strip("_") for name in SYMBOL_NAMES]

_LOCALS = {name: sp.Symbol(name) for name in SYMBOL_NAMES}

# 只暴露 sympy 的公开名字 + 少量别名
_GLOBALS: dict[str, object] = {}
for _name in dir(sp):
    if _name.startswith("_"):
        continue
    try:
        _GLOBALS[_name] = getattr(sp, _name)
    except Exception:  # pragma: no cover - 个别属性取不到
        pass
_GLOBALS.update(
    {
        "ln": sp.log,
        "abs": sp.Abs,
        "sqrt": sp.sqrt,
        "pi": sp.pi,
        "E": sp.E,
        "I": sp.I,
        "oo": sp.oo,
        "inf": sp.oo,
    }
)
_GLOBALS["__builtins__"] = {}


class ParseError(ValueError):
    """输入不合法，应作为 400 返回给前端。"""


def clean(raw: str) -> str:
    """去掉首尾空白，并把常见的中文/全角符号换成 ASCII。"""
    text = (raw or "").strip()
    table = str.maketrans(
        {
            "（": "(",
            "）": ")",
            "，": ",",
            "×": "*",
            "÷": "/",
            "−": "-",
            "–": "-",
            "π": "pi",
            "≤": "<=",
            "≥": ">=",
            "∞": "oo",
        }
    )
    return text.translate(table)


def check(raw: str) -> str:
    text = clean(raw)
    if not text:
        raise ParseError("表达式是空的。")
    if len(text) > MAX_LEN:
        raise ParseError(f"表达式太长，最多 {MAX_LEN} 个字符。")
    if not _CHARS.match(text):
        raise ParseError("包含不支持的字符，只允许数字、字母、+ - * / ^ ( ) , = < > 和空格。")
    if _BAD_WORDS.search(text):
        raise ParseError("包含不允许的关键字。")
    return text


def parse_math(raw: str, var: str | None = None) -> sp.Expr:
    """把字符串解析成 sympy 表达式。"""
    text = check(raw)
    local = dict(_LOCALS)
    if var:
        var = var.strip()
        if not var.isidentifier():
            raise ParseError("变量名不合法。")
        local[var] = sp.Symbol(var)
    try:
        return parse_expr(
            text,
            local_dict=local,
            global_dict=dict(_GLOBALS),
            transformations=TRANSFORMS,
            evaluate=True,
        )
    except ParseError:
        raise
    except Exception as exc:  # noqa: BLE001 - 交给上层转成 400
        raise ParseError(f"无法解析这个表达式：{exc}") from exc


def split_equation(raw: str) -> tuple[str, str]:
    """把 "左边=右边" 拆开；没有等号时右边视为 0。"""
    text = check(raw)
    if "=" in text:
        parts = text.split("=")
        if len(parts) != 2:
            raise ParseError("等号只能有一个。")
        left, right = parts[0].strip(), parts[1].strip()
        if not left or not right:
            raise ParseError("等号两边都要有内容。")
        return left, right
    return text, "0"
