"""平面折叠：布带按 2:1 打点后折成刀褶，再围成裙摆。

一个刀褶在截面上有三段布：**可见面 w、回折层 w、搭叠层 w**（合计 3w），
它们绕一圈必须正好占满一个褶的角度 Δ = 2π/N。

折成锯齿后，三段布变成三条弦。若三段等长（都是 w），
三条弦的张角也必须相等 → α = Δ/3，
弦长由半径差 d 决定：

    chord(R + d, R, α) = w

解出 d 就是**折叠的深度**——它由「布长必须塞进一个褶的角度里」决定，
不是随手指定的。布长不够 → 折痕浅；布长多了 → 折痕撑开。

张力：布长固定时，若腰围要求更小的 R，同一角度里塞不下 w，
只能让 d 变大（褶撑开）；`fit_radius` 就是从布长反推最小可见半径。
"""

from __future__ import annotations

import math


def chord(r1: float, r2: float, angle: float) -> float:
    """两条半径夹角为 angle 时的弦长。"""
    return math.sqrt(max(0.0, r1 * r1 + r2 * r2 - 2 * r1 * r2 * math.cos(angle)))


def _solve_depth(radius: float, angle: float, target: float) -> float:
    """解 d，使 chord(radius + d, radius, angle) == target。"""
    lo, hi = 0.0, radius * 8.0
    for _ in range(100):
        mid = (lo + hi) * 0.5
        if chord(radius + mid, radius, angle) < target:
            lo = mid
        else:
            hi = mid
    return (lo + hi) * 0.5


def fold_cross_section(n: int, radius: float, layers: int = 3) -> dict:
    """解一个褶的折叠几何：三段等长，张角均分，求折痕深度。"""
    if n < 3:
        raise ValueError("褶数至少为 3。")
    if radius <= 0:
        raise ValueError("半径必须为正。")
    if layers < 2:
        raise ValueError("至少两层。")

    delta = 2.0 * math.pi / n
    alpha = delta / layers
    visible = 2.0 * math.pi * radius / n        # 每褶可见宽度 w
    depth = _solve_depth(radius, alpha, visible)

    per_segment = chord(radius + depth, radius, alpha)
    return {
        "ok": True,
        "pleats": n,
        "layers": layers,
        "radius": round(radius, 6),
        "delta": round(delta, 6),
        "visible_width": round(visible, 6),
        "segment_angle": round(alpha, 6),
        "depth": round(depth, 6),
        "segment_chord": round(per_segment, 6),
        "fabric_length": round(per_segment * layers * n, 6),
        "fabric_ratio": round((per_segment * layers) / visible, 6),
    }


def fit_radius(n: int, fabric_length: float, layers: int = 3) -> dict:
    """给定布长，反推能把它折进 N 个褶的最小可见半径（张力撑开的结果）。"""
    if n < 3:
        raise ValueError("褶数至少为 3。")
    if fabric_length <= 0:
        raise ValueError("布长必须为正。")

    per_segment = fabric_length / (layers * n)
    # 弦长 = 2 R sin(α/2)，α = Δ/layers
    alpha = 2.0 * math.pi / n / layers
    radius = per_segment / (2.0 * math.sin(alpha / 2.0))
    section = fold_cross_section(n, radius, layers)
    return {**section, "fabric_length": round(fabric_length, 6)}
