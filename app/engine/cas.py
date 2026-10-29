"""符号计算引擎：化简、展开、因式分解、解方程、求导、积分、极限、级数、矩阵、绘图。

所有对用户输入的解析都走 safety.parse_math，不会执行任意代码。
每个操作都有超时保护，避免 SymPy 卡死把服务拖住。
"""

from __future__ import annotations

import math
import time
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeout

import sympy as sp

from .safety import ParseError, parse_math, split_equation

DEFAULT_TIMEOUT = 12
MAX_ORDER = 12


class MathTimeout(RuntimeError):
    """计算超时。"""


def run_with_timeout(fn, timeout: float = DEFAULT_TIMEOUT):
    executor = ThreadPoolExecutor(max_workers=1)
    future = executor.submit(fn)
    try:
        return future.result(timeout=timeout)
    except FutureTimeout as exc:
        raise MathTimeout(f"这一步计算超过 {timeout:g} 秒，已中止。可以换个更简单的输入。") from exc
    finally:
        executor.shutdown(wait=False, cancel_futures=True)


def _latex(value) -> str:
    try:
        return sp.latex(value)
    except Exception:  # noqa: BLE001
        return str(value)


def _text(value, limit: int = 1500) -> str:
    text = str(value)
    return text if len(text) <= limit else text[:limit] + " …"


def _ok(op: str, expr, result, notes=None, steps=None) -> dict:
    return {
        "ok": True,
        "operation": op,
        "input_latex": _latex(expr),
        "input_text": _text(expr, 400),
        "result_latex": _latex(result),
        "result_text": _text(result),
        "notes": notes or [],
        "steps": steps or [],
    }


def _symbol(var: str) -> sp.Symbol:
    var = (var or "x").strip()
    if not var.isidentifier() or len(var) > 12:
        raise ParseError("变量名不合法。")
    return sp.Symbol(var)


# ---------------------------------------------------------------- 基本变换


def simplify(raw: str, **_) -> dict:
    expr = parse_math(raw)
    result = run_with_timeout(lambda: sp.simplify(expr))
    notes = []
    try:
        before, after = sp.count_ops(expr), sp.count_ops(result)
        if before != after:
            notes.append(f"表达式规模：{before} 个运算节点 → {after} 个。")
    except Exception:  # noqa: BLE001
        pass
    if result == expr and notes == []:
        notes.append("它已经是最简形式了。")
    return _ok("simplify", expr, result, notes)


def expand(raw: str, **_) -> dict:
    expr = parse_math(raw)
    result = run_with_timeout(lambda: sp.expand(expr))
    return _ok("expand", expr, result, ["把乘法和幂全部展开，项数会变多。"])


def factor(raw: str, **_) -> dict:
    expr = parse_math(raw)
    if expr.is_Integer and abs(expr) > 1:
        result = run_with_timeout(lambda: sp.factorint(int(expr)))
        pairs = sorted(result.items())
        parts = []
        for prime, exp in pairs:
            parts.append(f"{prime}^{exp}" if exp > 1 else str(prime))
        notes = ["整数分解为素数幂的乘积。"]
        latex = " \\cdot ".join(
            (f"{p}^{{{e}}}" if e > 1 else f"{p}") for p, e in pairs
        )
        return {
            "ok": True,
            "operation": "factor",
            "input_latex": _latex(expr),
            "input_text": str(expr),
            "result_latex": latex,
            "result_text": " × ".join(parts),
            "notes": notes,
            "steps": [],
        }
    result = run_with_timeout(lambda: sp.factor(expr))
    steps = []
    try:
        steps.append({"title": "展开验证", "latex": _latex(sp.expand(result))})
    except Exception:  # noqa: BLE001
        pass
    return _ok("factor", expr, result, ["因式分解是展开的逆运算。"], steps)


# ---------------------------------------------------------------- 方程


def solve(raw: str, var: str = "x", **_) -> dict:
    left, right = split_equation(raw)
    sym = _symbol(var)
    lhs = parse_math(left, var=str(sym))
    rhs = parse_math(right, var=str(sym))
    equation = sp.Eq(lhs, rhs)

    solutions = run_with_timeout(lambda: sp.solve(equation, sym))
    notes = []
    steps = [{"title": "方程", "latex": _latex(equation)}]

    if not solutions:
        # 换一种写法：在实数范围内求
        real_set = run_with_timeout(
            lambda: sp.solveset(equation, sym, domain=sp.S.Reals), timeout=10
        )
        if real_set is sp.S.EmptySet or real_set == sp.S.EmptySet:
            notes.append("在实数范围内无解。")
        else:
            notes.append("solve 没有给出显式解，下面是解集：")
        return {
            "ok": True,
            "operation": "solve",
            "input_latex": _latex(equation),
            "input_text": _text(equation),
            "result_latex": _latex(real_set),
            "result_text": _text(real_set),
            "notes": notes,
            "steps": steps,
        }

    notes.append(f"共 {len(solutions)} 个解。")
    steps.append({"title": "解", "latex": ", ".join(_latex(s) for s in solutions)})
    return {
        "ok": True,
        "operation": "solve",
        "input_latex": _latex(equation),
        "input_text": _text(equation),
        "result_latex": _latex(solutions),
        "result_text": _text(solutions),
        "notes": notes,
        "steps": steps,
    }


# ---------------------------------------------------------------- 微积分


def diff(raw: str, var: str = "x", order: int = 1, **_) -> dict:
    sym = _symbol(var)
    expr = parse_math(raw, var=str(sym))
    order = max(1, min(int(order or 1), MAX_ORDER))
    result = run_with_timeout(lambda: sp.diff(expr, sym, order))
    steps = [{"title": "原函数", "latex": _latex(expr)}]
    if order > 1:
        steps.append({"title": f"{order} 阶导数", "latex": _latex(result)})
    notes = ["对变量 %s 求 %d 阶导数。" % (sym, order)]
    return _ok("diff", expr, result, notes, steps)


def integrate(
    raw: str,
    var: str = "x",
    lower: str | None = None,
    upper: str | None = None,
    **_,
) -> dict:
    sym = _symbol(var)
    expr = parse_math(raw, var=str(sym))

    if lower not in (None, "") and upper not in (None, ""):
        a = parse_math(str(lower), var=str(sym))
        b = parse_math(str(upper), var=str(sym))
        antiderivative = run_with_timeout(lambda: sp.integrate(expr, sym))
        result = run_with_timeout(lambda: sp.integrate(expr, (sym, a, b)))
        bracket = (
            r"\left. " + _latex(antiderivative) + r" \right|_{" + _latex(a)
            + "}^{" + _latex(b) + "}"
        )
        steps = [
            {"title": "原函数 F(x)", "latex": _latex(antiderivative)},
            {"title": "牛顿-莱布尼茨公式", "latex": bracket},
        ]
        notes = []
        if isinstance(result, sp.Integral):
            notes.append("求不出精确的原函数，结果是留待数值计算的积分。")
        else:
            try:
                notes.append(f"数值约为 {sp.N(result, 10)}。")
            except Exception:  # noqa: BLE001
                pass
        return _ok("integrate", expr, result, notes, steps)

    result = run_with_timeout(lambda: sp.integrate(expr, sym))
    notes = []
    if isinstance(result, sp.Integral):
        notes.append("这个积分没有初等原函数（或超出当前算法范围），结果保留为积分形式。")
    else:
        notes.append("结果是不定积分，记得加常数 C。")
    return _ok("integrate", expr, result, notes)


def limit(raw: str, var: str = "x", point: str = "0", direction: str = "+-", **_) -> dict:
    sym = _symbol(var)
    expr = parse_math(raw, var=str(sym))
    target = parse_math(str(point or "0"), var=str(sym))
    dir_map = {"+-": "+-", "+": "+", "-": "-", "both": "+-", "left": "-", "right": "+"}
    d = dir_map.get(str(direction or "+-").strip().lower(), "+-")
    result = run_with_timeout(lambda: sp.limit(expr, sym, target, d))
    notes = [f"让 {sym} 趋近 {target}（方向 {d}）。"]
    return _ok("limit", expr, result, notes)


def series(raw: str, var: str = "x", point: str = "0", order: int = 6, **_) -> dict:
    sym = _symbol(var)
    expr = parse_math(raw, var=str(sym))
    target = parse_math(str(point or "0"), var=str(sym))
    n = max(1, min(int(order or 6), 20))
    expansion = run_with_timeout(lambda: sp.series(expr, sym, target, n))
    result = expansion.removeO()
    steps = [
        {"title": "带余项的展开", "latex": _latex(expansion)},
        {"title": "去掉余项", "latex": _latex(result)},
    ]
    return _ok("series", expr, result, [f"在 {target} 处展开到 {n} 阶。"], steps)


def evaluate(raw: str, subs: str | None = None, digits: int = 15, var: str = "x", **_) -> dict:
    sym = _symbol(var)
    expr = parse_math(raw, var=str(sym))
    notes = []
    value = expr
    if subs:
        mapping = {}
        for piece in str(subs).split(","):
            if "=" not in piece:
                raise ParseError("代入格式应为 x=2, y=3。")
            name, _, val = piece.partition("=")
            name = name.strip()
            if not name.isidentifier():
                raise ParseError(f"变量名 {name!r} 不合法。")
            mapping[sp.Symbol(name)] = parse_math(val.strip(), var=name)
        value = expr.subs(mapping)
        notes.append("代入：" + "，".join(f"{k}={v}" for k, v in mapping.items()))
    digits = max(2, min(int(digits or 15), 200))
    numeric = value.evalf(digits)
    notes.append(f"保留 {digits} 位有效数字。")
    return _ok("evaluate", expr, numeric, notes, [{"title": "精确形式", "latex": _latex(value)}])


# ---------------------------------------------------------------- 矩阵


def matrix(raw: str, op: str = "det", **_) -> dict:
    text = (raw or "").strip()
    if not text:
        raise ParseError("矩阵不能为空，例如 1,2;3,4 表示两行两列。")
    rows = [r for r in text.split(";") if r.strip()]
    data = []
    for row in rows:
        cells = [c for c in row.split(",") if c.strip()]
        if not cells:
            continue
        data.append([parse_math(c.strip()) for c in cells])
    if not data:
        raise ParseError("没读到任何数字。")
    width = len(data[0])
    if any(len(r) != width for r in data):
        raise ParseError("每一行的元素个数必须相同。")
    if len(data) > 6 or width > 6:
        raise ParseError("矩阵最多 6×6。")

    m = sp.Matrix(data)
    op = (op or "det").strip().lower()
    notes = []
    steps = [{"title": "矩阵 A", "latex": _latex(m)}]

    if op == "inv":
        if m.det() == 0:
            raise ParseError("行列式为 0，矩阵不可逆。")
        result = m.inv()
        notes.append("A·A⁻¹ = I。")
    elif op == "rref":
        result, pivots = m.rref()
        notes.append(f"主元列：{', '.join(str(i + 1) for i in pivots) or '无'}。")
    elif op == "rank":
        result = m.rank()
        notes.append(f"矩阵有 {m.rows} 行 {m.cols} 列。")
    elif op == "trace":
        if m.rows != m.cols:
            raise ParseError("只有方阵才有迹。")
        result = m.trace()
    elif op == "transpose":
        result = m.T
    elif op == "eigen":
        if m.rows != m.cols:
            raise ParseError("只有方阵才有特征值。")
        values = m.eigenvals()
        parts = []
        for value, mult in values.items():
            parts.append(f"λ = {value}（代数重数 {mult}）")
        result = sp.Matrix(m)
        notes = parts
        return {
            "ok": True,
            "operation": "matrix.eigen",
            "input_latex": _latex(m),
            "input_text": _text(m, 400),
            "result_latex": ",\\quad ".join(_latex(v) for v in values),
            "result_text": "；".join(parts),
            "notes": notes,
            "steps": steps + [{"title": "特征多项式", "latex": _latex(m.charpoly().as_expr())}],
        }
    else:  # det
        if m.rows != m.cols:
            raise ParseError("只有方阵才有行列式。")
        result = m.det()
        notes.append("行列式为 0 说明矩阵不可逆。" if result == 0 else "行列式不为 0，矩阵可逆。")

    return _ok(f"matrix.{op}", m, result, notes, steps)


# ---------------------------------------------------------------- 绘图


def plot(raw: str, start: float = -10, end: float = 10, samples: int = 400, var: str = "x", **_) -> dict:
    sym = _symbol(var)
    expr = parse_math(raw, var=str(sym))
    if expr.free_symbols - {sym}:
        raise ParseError(f"绘图只支持单个变量 {sym} 的函数。")

    try:
        f = sp.lambdify(sym, expr, modules=["math"])
        test = f(0.5)
    except Exception:  # noqa: BLE001
        f = sp.lambdify(sym, expr, modules=["numpy"])
        test = f(0.5)

    start, end = float(start), float(end)
    if not math.isfinite(start) or not math.isfinite(end):
        raise ParseError("区间端点必须是有限数。")
    if start >= end:
        raise ParseError("左端点必须小于右端点。")
    samples = max(32, min(int(samples or 400), 2000))

    step = (end - start) / (samples - 1)
    points: list[list[float | None]] = []
    for i in range(samples):
        x = start + i * step
        try:
            value = f(x)
            if isinstance(value, complex):
                if abs(value.imag) > 1e-9:
                    points.append([x, None])
                    continue
                value = value.real
            value = float(value)
            points.append([x, value if math.isfinite(value) else None])
        except Exception:  # noqa: BLE001
            points.append([x, None])

    finite = [p[1] for p in points if p[1] is not None]
    y_min = y_max = 0.0
    if finite:
        ordered = sorted(finite)
        low = ordered[int(len(ordered) * 0.02)]
        high = ordered[int(len(ordered) * 0.98)]
        span = max(high - low, 1e-9)
        y_min, y_max = low - span * 0.15, high + span * 0.15

    # 跳变处断开，避免把渐近线画成竖线
    jumps = []
    valid = [(i, p[1]) for i, p in enumerate(points) if p[1] is not None]
    if len(valid) > 2:
        diffs = sorted(abs(valid[i + 1][1] - valid[i][1]) for i in range(len(valid) - 1))
        typical = diffs[len(diffs) // 2] or 1e-9
        limit_jump = max(typical * 40, (y_max - y_min) * 0.6)
        for i in range(len(valid) - 1):
            if abs(valid[i + 1][1] - valid[i][1]) > limit_jump:
                jumps.append(valid[i][0])

    for idx in jumps:
        points[idx][1] = None

    return {
        "ok": True,
        "operation": "plot",
        "expr_latex": _latex(expr),
        "points": points,
        "x_range": [start, end],
        "y_range": [y_min, y_max],
        "sample": float(step),
    }


OPS = {
    "simplify": simplify,
    "expand": expand,
    "factor": factor,
    "solve": solve,
    "diff": diff,
    "integrate": integrate,
    "limit": limit,
    "series": series,
    "evaluate": evaluate,
    "matrix": matrix,
    "plot": plot,
}


def run(op: str, payload: dict) -> dict:
    """统一入口：按操作名分派，并记录耗时。

    payload 里的 "expr" 会映射成各操作的 raw 参数。
    """
    key = (op or "").strip().lower()
    payload = dict(payload or {})
    if "expr" in payload:
        payload["raw"] = payload.pop("expr")

    started = time.perf_counter()
    if key.startswith("matrix"):
        sub = key.split(".", 1)[1] if "." in key else "det"
        result = matrix(op=sub, **payload)
    elif key in OPS:
        result = OPS[key](**payload)
    else:
        raise ParseError(f"不支持的操作：{op}")
    result["elapsed_ms"] = round((time.perf_counter() - started) * 1000, 1)
    return result
