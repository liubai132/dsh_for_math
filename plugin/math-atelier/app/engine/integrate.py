"""数值积分：梯形、中点、辛普森，以及误差随步长的收敛阶。

用法上只关心三件事：
- 给定表达式和区间，算出一个近似值
- 和精确值比较，看误差
- 把 n 翻倍，看误差缩小的速度（阶）
"""

from __future__ import annotations

import math

import sympy as sp

METHODS = {
    "trapezoid": "梯形法",
    "midpoint": "中点法",
    "simpson": "辛普森法",
}


def _parse(expression: str):
    x = sp.Symbol("x")
    try:
        expr = sp.sympify(expression)
    except (sp.SympifyError, TypeError) as exc:
        raise ValueError(f"表达式解析失败：{expression}") from exc
    if x not in expr.free_symbols - {x}:
        pass
    func = sp.lambdify(x, expr, "math")
    return expr, func


def _sample(func, t: float) -> float:
    value = func(t)
    if isinstance(value, complex):
        raise ValueError("区间内出现复数，检查表达式")
    return float(value)


def integrate(expression: str, a: float, b: float, n: int = 100, method: str = "trapezoid") -> dict:
    """用指定方法在 [a, b] 上积分。"""
    if n < 1:
        raise ValueError("n 必须是正整数")
    if method not in METHODS:
        raise ValueError(f"method 只能是 {', '.join(METHODS)}")
    if method == "simpson" and n % 2 == 1:
        raise ValueError("辛普森法要求 n 为偶数")

    expr, func = _parse(expression)
    a = float(a)
    b = float(b)
    if b < a:
        a, b = b, a
    h = (b - a) / n

    if method == "trapezoid":
        total = 0.5 * (_sample(func, a) + _sample(func, b))
        for i in range(1, n):
            total += _sample(func, a + i * h)
        value = total * h
    elif method == "midpoint":
        total = 0.0
        for i in range(n):
            total += _sample(func, a + (i + 0.5) * h)
        value = total * h
    else:
        total = _sample(func, a) + _sample(func, b)
        for i in range(1, n):
            total += (4 if i % 2 == 1 else 2) * _sample(func, a + i * h)
        value = total * h / 3.0

    exact = exact_value(expr, a, b)
    error = abs(value - exact) if exact is not None else None

    return {
        "ok": True,
        "expression": str(expr),
        "method": method,
        "methodName": METHODS[method],
        "a": a,
        "b": b,
        "n": n,
        "h": h,
        "value": round(value, 10),
        "exact": round(exact, 10) if exact is not None else None,
        "error": round(error, 12) if error is not None else None,
    }


def exact_value(expr, a: float, b: float):
    """能积就给出精确值，积不出来返回 None。"""
    x = sp.Symbol("x")
    try:
        antiderivative = sp.integrate(expr, x)
        if antiderivative.has(sp.Integral):
            return None
        value = antiderivative.subs(x, b) - antiderivative.subs(x, a)
        return float(sp.N(value))
    except Exception:  # noqa: BLE001
        return None


def order_table(expression: str, a: float, b: float, ns: list[int] | None = None) -> dict:
    """把 n 逐个翻倍，给出各方法的误差与实测收敛阶。"""
    if ns is None:
        ns = [4, 8, 16, 32, 64, 128]

    expr, _ = _parse(expression)
    exact = exact_value(expr, a, b)

    rows = []
    previous = {}
    for n in ns:
        row = {"n": n}
        for method in METHODS:
            m = n if method != "simpson" else max(2, n - (n % 2))
            result = integrate(expression, a, b, m, method)
            error = result["error"]
            row[method] = round(result["value"], 10)
            row[method + "Error"] = error
            if error and error > 0 and method in previous and previous[method] > 0:
                ratio = previous[method] / error
                row[method + "Order"] = round(math.log2(ratio), 2) if ratio > 0 else None
            else:
                row[method + "Order"] = None
            previous[method] = error if error is not None else None
        rows.append(row)

    return {
        "ok": True,
        "expression": str(expr),
        "a": float(a),
        "b": float(b),
        "exact": round(exact, 10) if exact is not None else None,
        "methods": [{"id": key, "name": value} for key, value in METHODS.items()],
        "rows": rows,
    }
