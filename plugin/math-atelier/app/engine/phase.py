"""相图：把二维自治系统 y' = f(y) 画成向量场 + 轨线 + 平衡点。

用途：
- 直观看出解的走向（往哪走、绕着谁转、最后停在哪儿）
- 平衡点用数值方法找，再用雅可比矩阵的迹/行列式分类
"""

from __future__ import annotations

import math

SYSTEMS = {
    "oscillator": {
        "name": "阻尼振子",
        "formula": "x' = y,   y' = −x − 0.3y",
        "f": lambda x, y: (y, -x - 0.3 * y),
    },
    "saddle": {
        "name": "鞍点",
        "formula": "x' = x,   y' = −y",
        "f": lambda x, y: (x, -y),
    },
    "lotka": {
        "name": "捕食者-猎物",
        "formula": "x' = x(1 − y),   y' = y(x − 1)",
        "f": lambda x, y: (x * (1.0 - y), y * (x - 1.0)),
    },
    "pendulum": {
        "name": "单摆",
        "formula": "x' = y,   y' = −sin x − 0.2y",
        "f": lambda x, y: (y, -math.sin(x) - 0.2 * y),
    },
}


def catalogue() -> dict:
    return {
        "ok": True,
        "systems": [
            {"id": key, "name": value["name"], "formula": value["formula"]}
            for key, value in SYSTEMS.items()
        ],
    }


def _resolve(system: str):
    if system not in SYSTEMS:
        raise KeyError(f"没有这个系统：{system}")
    return SYSTEMS[system]


def field(system: str, bounds: dict, grid: int = 13) -> dict:
    """在矩形区域上采样向量场。"""
    spec = _resolve(system)
    xmin, xmax = float(bounds["xmin"]), float(bounds["xmax"])
    ymin, ymax = float(bounds["ymin"]), float(bounds["ymax"])
    grid = max(4, min(int(grid), 40))

    arrows = []
    for i in range(grid):
        for j in range(grid):
            x = xmin + (xmax - xmin) * i / (grid - 1)
            y = ymin + (ymax - ymin) * j / (grid - 1)
            dx, dy = spec["f"](x, y)
            arrows.append(
                {
                    "x": round(x, 6),
                    "y": round(y, 6),
                    "dx": round(dx, 6),
                    "dy": round(dy, 6),
                }
            )
    return {"ok": True, "system": system, "grid": grid, "arrows": arrows}


def trajectory(
    system: str,
    start: list[float],
    t_end: float = 8.0,
    dt: float = 0.02,
    method: str = "rk4",
) -> dict:
    """从初值出发积分出一条轨线（欧拉 / 中点 / RK4）。"""
    spec = _resolve(system)
    x, y = float(start[0]), float(start[1])
    dt = max(1e-4, min(float(dt), 0.2))
    steps = max(1, min(int(float(t_end) / dt), 20000))
    method = (method or "rk4").lower()
    if method not in {"euler", "midpoint", "rk4"}:
        raise ValueError("method 只能是 euler / midpoint / rk4")

    points = [[round(x, 6), round(y, 6)]]
    for _ in range(steps):
        if method == "euler":
            dx, dy = spec["f"](x, y)
            x += dt * dx
            y += dt * dy
        elif method == "midpoint":
            k1x, k1y = spec["f"](x, y)
            k2x, k2y = spec["f"](x + 0.5 * dt * k1x, y + 0.5 * dt * k1y)
            x += dt * k2x
            y += dt * k2y
        else:
            k1x, k1y = spec["f"](x, y)
            k2x, k2y = spec["f"](x + 0.5 * dt * k1x, y + 0.5 * dt * k1y)
            k3x, k3y = spec["f"](x + 0.5 * dt * k2x, y + 0.5 * dt * k2y)
            k4x, k4y = spec["f"](x + dt * k3x, y + dt * k3y)
            x += dt * (k1x + 2 * k2x + 2 * k3x + k4x) / 6.0
            y += dt * (k1y + 2 * k2y + 2 * k3y + k4y) / 6.0
        if not (math.isfinite(x) and math.isfinite(y)) or abs(x) > 1e6 or abs(y) > 1e6:
            break
        points.append([round(x, 6), round(y, 6)])

    return {"ok": True, "system": system, "method": method, "points": points}


def _jacobian(spec, x: float, y: float, h: float = 1e-5) -> list[list[float]]:
    fx1, fy1 = spec["f"](x + h, y)
    fx0, fy0 = spec["f"](x - h, y)
    gx1, gy1 = spec["f"](x, y + h)
    gx0, gy0 = spec["f"](x, y - h)
    return [
        [(fx1 - fx0) / (2 * h), (gx1 - gx0) / (2 * h)],
        [(fy1 - fy0) / (2 * h), (gy1 - gy0) / (2 * h)],
    ]


def classify(jac: list[list[float]]) -> dict:
    """按迹和行列式分类平衡点。"""
    a, b = jac[0]
    c, d = jac[1]
    trace = a + d
    det = a * d - b * c
    disc = trace * trace - 4 * det

    if det < -1e-9:
        kind = "鞍点"
        stable = False
    elif det > 0 and abs(trace) < 1e-9:
        kind = "中心"
        stable = True
    elif det > 0:
        if disc > 1e-9:
            kind = "结点"
        elif disc < -1e-9:
            kind = "焦点"
        else:
            kind = "退化结点"
        stable = trace < -1e-9
    else:
        kind = "非双曲（需更高阶判断）"
        stable = trace < 0

    return {
        "trace": round(trace, 6),
        "det": round(det, 6),
        "disc": round(disc, 6),
        "kind": kind,
        "stable": bool(stable),
    }


def equilibria(system: str, bounds: dict, grid: int = 9) -> dict:
    """网格播种 + 牛顿法找平衡点，并分类。"""
    spec = _resolve(system)
    xmin, xmax = float(bounds["xmin"]), float(bounds["xmax"])
    ymin, ymax = float(bounds["ymin"]), float(bounds["ymax"])
    grid = max(3, min(int(grid), 20))

    found = []
    for i in range(grid):
        for j in range(grid):
            x = xmin + (xmax - xmin) * (i + 0.5) / grid
            y = ymin + (ymax - ymin) * (j + 0.5) / grid
            for _ in range(30):
                fx, fy = spec["f"](x, y)
                jac = _jacobian(spec, x, y)
                det = jac[0][0] * jac[1][1] - jac[0][1] * jac[1][0]
                if abs(det) < 1e-9:
                    break
                # 解 J·Δ = −f
                dx = (-fx * jac[1][1] + fy * jac[0][1]) / det
                dy = (-fy * jac[0][0] + fx * jac[1][0]) / det
                x += dx
                y += dy
                if abs(dx) + abs(dy) < 1e-10:
                    break
            fx, fy = spec["f"](x, y)
            if abs(fx) > 1e-6 or abs(fy) > 1e-6:
                continue
            if not (xmin - 0.5 <= x <= xmax + 0.5 and ymin - 0.5 <= y <= ymax + 0.5):
                continue
            if any(abs(x - p["x"]) < 1e-4 and abs(y - p["y"]) < 1e-4 for p in found):
                continue
            info = classify(_jacobian(spec, x, y))
            found.append({"x": round(x, 6), "y": round(y, 6), **info})

    return {"ok": True, "system": system, "points": found}


def portrait(
    system: str,
    bounds: dict,
    grid: int = 13,
    seeds: list[list[float]] | None = None,
    t_end: float = 8.0,
    dt: float = 0.02,
) -> dict:
    """一张完整的相图：向量场 + 若干轨线 + 平衡点。"""
    spec = _resolve(system)
    xmin, xmax = float(bounds["xmin"]), float(bounds["xmax"])
    ymin, ymax = float(bounds["ymin"]), float(bounds["ymax"])

    if not seeds:
        seeds = [
            [xmin + (xmax - xmin) * (i + 1) / 6, ymin + (ymax - ymin) * (j + 1) / 6]
            for i in range(5)
            for j in range(5)
        ]

    curves = []
    for seed in seeds[:36]:
        data = trajectory(system, seed, t_end=t_end, dt=dt, method="rk4")
        if len(data["points"]) > 2:
            curves.append(data["points"])

    return {
        "ok": True,
        "system": system,
        "name": spec["name"],
        "formula": spec["formula"],
        "bounds": {"xmin": xmin, "xmax": xmax, "ymin": ymin, "ymax": ymax},
        "arrows": field(system, bounds, grid)["arrows"],
        "curves": curves,
        "equilibria": equilibria(system, bounds)["points"],
    }
