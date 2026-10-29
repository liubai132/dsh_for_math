"""数学库目录：把引擎里公开的函数列出来，供界面浏览和跳转。

用 introspection 直接从模块拿签名和第一行 docstring，不维护第二份清单，
所以新增函数会自动出现在目录里。
"""

from __future__ import annotations

import inspect

from . import cas, constants, integrate, interp, numbers, phase, research

MODULE_TITLES = {
    "interp": ("插值与凸组合", "向量之间的线性插值、凸组合、轨迹生成"),
    "cas": ("符号计算", "化简、解方程、求导、积分、极限、级数、矩阵、绘图"),
    "numbers": ("数论与整数", "质因数分解、数论函数、连分数、科拉茨、区间扫描"),
    "research": ("研究工具", "序列分析、常数识别、猜想检验"),
    "constants": ("数学常数", "高精度常数与数字分布"),
    "phase": ("相图", "向量场、轨线、平衡点与稳定性分类"),
    "integrate": ("数值积分", "梯形法、中点法、辛普森法与误差收敛阶"),
}

MODULES = {
    "interp": interp,
    "cas": cas,
    "numbers": numbers,
    "research": research,
    "constants": constants,
    "phase": phase,
    "integrate": integrate,
}


def _summary(obj) -> str:
    doc = inspect.getdoc(obj) or ""
    for line in doc.splitlines():
        line = line.strip()
        if line:
            return line
    return ""


def _function_entry(name: str, func) -> dict:
    try:
        signature = f"{name}{inspect.signature(func)}"
    except (TypeError, ValueError):
        signature = f"{name}(...)"
    try:
        source_file = inspect.getsourcefile(func) or ""
    except TypeError:
        source_file = ""
    return {
        "name": name,
        "id": "",
        "signature": signature,
        "summary": _summary(func),
        "doc": inspect.getdoc(func) or "",
        "params": [p for p in inspect.signature(func).parameters] if _has_signature(func) else [],
        "source": source_file,
    }


def _has_signature(func) -> bool:
    try:
        inspect.signature(func)
        return True
    except (TypeError, ValueError):
        return False


def _public_functions(module) -> list[dict]:
    entries = []
    for name, obj in inspect.getmembers(module, inspect.isfunction):
        if name.startswith("_"):
            continue
        # 只要这个模块自己定义的函数，不要 import 进来的
        if getattr(obj, "__module__", "") != module.__name__:
            continue
        entries.append(_function_entry(name, obj))
    entries.sort(key=lambda item: item["name"])
    return entries


def catalogue() -> dict:
    modules = []
    total = 0
    for key, module in MODULES.items():
        title, blurb = MODULE_TITLES[key]
        functions = _public_functions(module)
        for entry in functions:
            entry["id"] = f"{key}.{entry['name']}"
            entry["module"] = key
        total += len(functions)
        modules.append(
            {
                "id": key,
                "title": title,
                "blurb": blurb,
                "count": len(functions),
                "functions": functions,
            }
        )
    return {"ok": True, "total": total, "modules": modules}


def lookup(identifier: str) -> dict:
    """按 "module.function" 或 "function" 查找。"""
    text = (identifier or "").strip()
    if not text:
        raise KeyError("请给出函数名，例如 interp.trajectory。")

    if "." in text:
        module_key, _, func_name = text.partition(".")
    else:
        module_key, func_name = "", text

    candidates = MODULES if not module_key else ({module_key: MODULES[module_key]} if module_key in MODULES else {})
    if not candidates:
        raise KeyError(f"没有这个模块：{module_key}")

    for key, module in candidates.items():
        func = getattr(module, func_name, None)
        if func is None or not inspect.isfunction(func):
            continue
        entry = _function_entry(func_name, func)
        entry["id"] = f"{key}.{func_name}"
        entry["module"] = key
        entry["module_title"] = MODULE_TITLES[key][0]
        entry["doc"] = inspect.getdoc(func) or ""
        return entry

    raise KeyError(f"没有这个函数：{text}")
