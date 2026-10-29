"""线性插值与凸组合。

核心只有一条式子：

    z(λ) = λx + (1 − λ)y

λ = 0 时得到 y，λ = 1 时得到 x，λ ∈ (0, 1) 时得到两点之间的一点。
逐坐标分开算，就是 z_i(λ) = λx_i + (1 − λ)y_i。

λ 限制在 [0, 1] 内，扫出的是线段；放开到整个实数轴，扫出的是整条直线。
凸集的定义正是：任意两点之间这段线段，一点都不能跑到集合外面去。
"""

from __future__ import annotations

import math

MAX_DIM = 3
MAX_FRAMES = 600
MAX_COORD = 1e6


def _vector(values, name: str) -> list[float]:
    if not isinstance(values, (list, tuple)) or not values:
        raise ValueError(f"{name} 必须是坐标列表，例如 [0, 0]。")
    if len(values) > MAX_DIM:
        raise ValueError(f"{name} 最多 {MAX_DIM} 维。")
    out = []
    for value in values:
        try:
            number = float(value)
        except (TypeError, ValueError) as exc:
            raise ValueError(f"{name} 里有不是数字的值：{value!r}") from exc
        if not math.isfinite(number):
            raise ValueError(f"{name} 里有非法数值：{value!r}")
        if abs(number) > MAX_COORD:
            raise ValueError(f"{name} 的坐标不能超过 {MAX_COORD:g}。")
        out.append(number)
    return out


def convex_combination(x: list[float], y: list[float], lam: float) -> list[float]:
    """λx + (1 − λ)y，逐分量计算。"""
    if len(x) != len(y):
        raise ValueError("两个向量的维数必须相同。")
    return [lam * xi + (1 - lam) * yi for xi, yi in zip(x, y)]


def lerp(a: list[float], b: list[float], t: float) -> list[float]:
    """从 a 走到 b 的插值：(1 − t)a + t b。"""
    return convex_combination(b, a, t)


def distance(a: list[float], b: list[float]) -> float:
    return math.sqrt(sum((ai - bi) ** 2 for ai, bi in zip(a, b)))


def trajectory(
    a: list[float],
    b: list[float],
    frames: int = 80,
    mode: str = "roundtrip",
) -> dict:
    """生成一条动画轨迹。

    mode = "oneway"    时间 t 从 0 到 1，点从 a 走到 b；
    mode = "roundtrip" 时间 t 从 0 到 1 再回到 0，点从 a 走到 b 再返回 a。
    """
    start = _vector(a, "a")
    end = _vector(b, "b")
    if len(start) != len(end):
        raise ValueError("a 和 b 的维数必须相同。")
    if distance(start, end) < 1e-12:
        raise ValueError("a 和 b 是同一个点，插值没有意义。")

    frames = int(frames)
    if frames < 8 or frames > MAX_FRAMES:
        raise ValueError(f"帧数要在 8 到 {MAX_FRAMES} 之间。")

    mode = (mode or "roundtrip").strip().lower()
    if mode not in {"oneway", "roundtrip"}:
        raise ValueError("mode 只能是 oneway 或 roundtrip。")

    times = []
    for index in range(frames):
        t = index / (frames - 1)
        if mode == "roundtrip":
            t = 1 - abs(2 * t - 1)  # 0 → 1 → 0
        times.append(t)

    points = []
    for t in times:
        points.append(
            {
                "t": round(t, 6),
                "point": [round(value, 6) for value in lerp(start, end, t)],
                "lam": round(t, 6),
            }
        )

    return {
        "ok": True,
        "a": start,
        "b": end,
        "dim": len(start),
        "mode": mode,
        "frames": points,
        "length": round(distance(start, end), 6),
        "midpoint": [round(value, 6) for value in lerp(start, end, 0.5)],
        "formula": "z(λ) = λx + (1 − λ)y",
    }


def is_convex_combination(x, y, point, tol: float = 1e-9) -> dict:
    """判断 point 是否落在 x、y 的线段上，并给出对应的 λ。"""
    px = _vector(x, "x")
    py = _vector(y, "y")
    pp = _vector(point, "point")
    if not (len(px) == len(py) == len(pp)):
        raise ValueError("三个向量的维数必须相同。")

    diff = [b - a for a, b in zip(px, py)]
    denom = sum(d * d for d in diff)
    if denom < 1e-18:
        raise ValueError("x 和 y 是同一个点。")

    lam = sum((p - a) * d for p, a, d in zip(pp, px, diff)) / denom
    projected = convex_combination(py, px, lam)
    error = distance(projected, pp)
    return {
        "lambda": round(lam, 9),
        "on_segment": bool(0 <= lam <= 1 and error <= tol),
        "error": round(error, 9),
        "projection": [round(value, 9) for value in projected],
    }


# ---------------------------------------------------------------- 更有趣的轨迹


def _norm(vector: list[float]) -> float:
    return math.sqrt(sum(value * value for value in vector))


def slerp(a: list[float], b: list[float], t: float) -> list[float]:
    """球面线性插值：单位向量 a、b 之间走大圆。

    轨迹必然落在单位球的大圆上——也就是 3D 里的“圆”。
    """
    if len(a) != len(b):
        raise ValueError("两个向量的维数必须相同。")
    length_a = _norm(a)
    length_b = _norm(b)
    if length_a < 1e-12 or length_b < 1e-12:
        raise ValueError("slerp 要求向量非零。")
    unit_a = [value / length_a for value in a]
    unit_b = [value / length_b for value in b]
    dot = max(-1.0, min(1.0, sum(x * y for x, y in zip(unit_a, unit_b))))
    omega = math.acos(dot)
    if omega < 1e-6:
        return lerp(a, b, t)
    sin_omega = math.sin(omega)
    return [
        (math.sin((1 - t) * omega) * x + math.sin(t * omega) * y) / sin_omega
        for x, y in zip(unit_a, unit_b)
    ]


def _perpendicular(vector: list[float]) -> list[float]:
    """二维向量逆时针转 90°。"""
    return [-vector[1], vector[0]]


def arc(a: list[float], b: list[float], t: float, bulge: float = 0.45) -> list[float]:
    """经过 a、b 的圆弧（插值角度而不是位置）。

    bulge 是拱高相对弦长的比例：0 退化成直线，越大弯得越厉害。
    半径 R = (d²/4 + s²) / (2s)，圆心落在弦的中垂线上。
    """
    start = _vector(a, "a")
    end = _vector(b, "b")
    if len(start) != 2 or len(end) != 2:
        raise ValueError("圆弧插值目前只支持二维。")
    chord = [end[0] - start[0], end[1] - start[1]]
    d = _norm(chord)
    if d < 1e-12:
        raise ValueError("a 和 b 是同一个点。")
    if abs(bulge) < 1e-6:
        return lerp(start, end, t)

    sagitta = bulge * d
    radius = (d * d / 4 + sagitta * sagitta) / (2 * abs(sagitta))
    unit = [chord[0] / d, chord[1] / d]
    normal = _perpendicular(unit)
    side = 1.0 if sagitta > 0 else -1.0
    mid = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2]
    center = [
        mid[0] - side * normal[0] * (radius - abs(sagitta)),
        mid[1] - side * normal[1] * (radius - abs(sagitta)),
    ]

    theta_a = math.atan2(start[1] - center[1], start[0] - center[0])
    theta_m = math.atan2(side * normal[1], side * normal[0])
    delta = 2 * wrap_angle(theta_m - theta_a)
    theta = theta_a + t * delta
    return [center[0] + radius * math.cos(theta), center[1] + radius * math.sin(theta)]


def wrap_angle(value: float) -> float:
    import math as _math

    out = value % (2 * _math.pi)
    if out > _math.pi:
        out -= 2 * _math.pi
    return out


def bezier(control: list[list[float]], t: float) -> list[float]:
    """de Casteljau：任意阶贝塞尔曲线（2~4 个控制点）。"""
    if not isinstance(control, (list, tuple)) or len(control) < 2 or len(control) > 4:
        raise ValueError("贝塞尔需要 2 到 4 个控制点。")
    points = [_vector(point, "控制点") for point in control]
    dim = len(points[0])
    if any(len(point) != dim for point in points):
        raise ValueError("控制点的维数必须相同。")

    current = [list(point) for point in points]
    while len(current) > 1:
        current = [
            [(1 - t) * a[i] + t * b[i] for i in range(dim)]
            for a, b in zip(current, current[1:])
        ]
    return current[0]


def spiral(center: list[float], r0: float, r1: float, t: float, turns: float = 1.5) -> list[float]:
    """阿基米德螺旋：半径随角度线性增长。"""
    c = _vector(center, "center")
    if len(c) != 2:
        raise ValueError("螺旋目前只支持二维。")
    theta = 2 * math.pi * turns * t
    radius = r0 + (r1 - r0) * t
    return [c[0] + radius * math.cos(theta), c[1] + radius * math.sin(theta)]


def wave(a: list[float], b: list[float], t: float, amp: float = 0.18, cycles: float = 2.0) -> list[float]:
    """直线前进，同时在垂直方向上正弦摆动。"""
    start = _vector(a, "a")
    end = _vector(b, "b")
    if len(start) != 2 or len(end) != 2:
        raise ValueError("波动插值目前只支持二维。")
    chord = [end[0] - start[0], end[1] - start[1]]
    d = _norm(chord)
    if d < 1e-12:
        raise ValueError("a 和 b 是同一个点。")
    normal = [-chord[1] / d, chord[0] / d]
    offset = amp * d * math.sin(2 * math.pi * cycles * t)
    base = lerp(start, end, t)
    return [base[0] + normal[0] * offset, base[1] + normal[1] * offset]


def polygon_perimeter(points: list[list[float]]) -> float:
    """闭合多边形的周长。"""
    if len(points) < 2:
        return 0.0
    return polyline_length(list(points) + [points[0]])


def _rotate_to_top(points: list[list[float]]) -> list[list[float]]:
    """把最靠上（y 最小）的点转到开头，让两个轮廓的起点大致对应。"""
    if not points:
        return points
    index = min(range(len(points)), key=lambda i: (points[i][1], points[i][0]))
    return points[index:] + points[:index]


def resample_closed(
    points: list[list[float]],
    count: int,
    uniform: bool = True,
) -> list[list[float]]:
    """闭合轮廓重采样到 count 个点。

    uniform=True  按弧长等距取点，点沿边均匀分布；
    uniform=False 按原来的点序等距取点，疏密会跟着原始点走（对照用）。

    取完后把最靠上的点转到开头，两条轮廓的起点就对应上了。
    """
    if len(points) < 3:
        raise ValueError("至少需要 3 个点才能构成闭合轮廓。")
    count = max(3, int(count))
    ring = [list(point) for point in points]
    ring.append(list(ring[0]))

    cumulative = [0.0]
    for a, b in zip(ring, ring[1:]):
        cumulative.append(cumulative[-1] + distance(a, b))
    total = cumulative[-1]
    if total <= 1e-12:
        raise ValueError("轮廓退化成一个点。")

    if uniform:
        samples = []
        cursor = 0
        for index in range(count):
            target = total * index / count
            while cursor < len(cumulative) - 2 and cumulative[cursor + 1] < target:
                cursor += 1
            span = cumulative[cursor + 1] - cumulative[cursor]
            ratio = 0.0 if span <= 1e-12 else (target - cumulative[cursor]) / span
            samples.append(lerp(ring[cursor], ring[cursor + 1], ratio))
    else:
        samples = []
        for index in range(count):
            position = index / count * (len(ring) - 1)
            low = int(position)
            ratio = position - low
            samples.append(lerp(ring[low], ring[min(low + 1, len(ring) - 1)], ratio))

    return _rotate_to_top(samples)


def morph_polygons(a: list[list[float]], b: list[list[float]], t: float) -> list[list[float]]:
    """两个已经对应好的轮廓之间做线性插值。"""
    if len(a) != len(b):
        raise ValueError("两个轮廓点数必须相同，请先做等弧长重采样。")
    return [lerp(p, q, t) for p, q in zip(a, b)]


def polyline_length(points: list[list[float]]) -> float:
    """折线总长（弧长）。"""
    return math.fsum(distance(a, b) for a, b in zip(points, points[1:]))


def resample_uniform(points: list[list[float]], count: int) -> list[list[float]]:
    """按弧长等距重采样：每一段走的距离相同。

    两点之间的曲线长度恒有 L ≥ |ab|，等号只在直线时成立，所以这里只能做到
    “总长等于曲线自己的长度、每步等距”，不可能让曲线和直线一样长。
    """
    if count < 2 or len(points) < 2:
        return [list(point) for point in points]
    cumulative = [0.0]
    for a, b in zip(points, points[1:]):
        cumulative.append(cumulative[-1] + distance(a, b))
    total = cumulative[-1]
    if total <= 1e-12:
        return [list(points[0]) for _ in range(count)]

    out = []
    cursor = 0
    for index in range(count):
        target = total * index / (count - 1)
        while cursor < len(cumulative) - 2 and cumulative[cursor + 1] < target:
            cursor += 1
        span = cumulative[cursor + 1] - cumulative[cursor]
        ratio = 0.0 if span <= 1e-12 else (target - cumulative[cursor]) / span
        out.append(lerp(points[cursor], points[cursor + 1], ratio))
    return out


CURVE_KINDS = ("linear", "arc", "bezier", "wave", "spiral")


def curve(
    kind: str = "linear",
    a: list[float] | None = None,
    b: list[float] | None = None,
    frames: int = 120,
    mode: str = "roundtrip",
    bulge: float = 0.45,
    amp: float = 0.18,
    cycles: float = 2.0,
    turns: float = 1.5,
    uniform: bool = False,
) -> dict:
    """按 kind 生成一条可动画的轨迹，返回结构跟 trajectory 一致。

    linear  直线（仿射组合）
    arc     过 a、b 的圆弧——插值角度，轨迹必然是圆
    bezier  二次贝塞尔，控制点在中垂线上
    wave    直线 + 垂直方向正弦
    spiral  以 a 为心的阿基米德螺旋
    """
    start = _vector(a if a is not None else [0, 0], "a")
    end = _vector(b if b is not None else [4, 3], "b")
    if len(start) != len(end):
        raise ValueError("a 和 b 的维数必须相同。")
    kind = (kind or "linear").strip().lower()
    if kind not in CURVE_KINDS:
        raise ValueError(f"kind 只能是 {' / '.join(CURVE_KINDS)}。")
    dim = len(start)
    if kind != "linear" and dim != 2:
        raise ValueError(f"{kind} 目前只支持二维，linear 支持任意维。")

    frames = int(frames)
    if frames < 8 or frames > MAX_FRAMES:
        raise ValueError(f"帧数要在 8 到 {MAX_FRAMES} 之间。")
    mode = (mode or "roundtrip").strip().lower()
    if mode not in {"oneway", "roundtrip"}:
        raise ValueError("mode 只能是 oneway 或 roundtrip。")

    d = distance(start, end)
    if d < 1e-12:
        raise ValueError("a 和 b 是同一个点，轨迹没有意义。")

    chord = [end[0] - start[0], end[1] - start[1]]
    unit = [chord[0] / d, chord[1] / d]
    normal = _perpendicular(unit)
    mid = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2]
    control = [mid[0] + normal[0] * bulge * d, mid[1] + normal[1] * bulge * d]

    def sample(t: float) -> list[float]:
        if kind == "linear":
            return lerp(start, end, t)
        if kind == "arc":
            return arc(start, end, t, bulge=bulge)
        if kind == "bezier":
            return bezier([start, control, end], t)
        if kind == "wave":
            return wave(start, end, t, amp=amp, cycles=cycles)
        return spiral(start, distance(start, end) * 0.12, distance(start, end) * 0.75, t, turns=turns)

    raw_points = []
    raw_params = []
    for index in range(frames):
        raw = index / (frames - 1)
        t = 1 - abs(2 * raw - 1) if mode == "roundtrip" else raw
        raw_points.append(sample(t))
        raw_params.append(t)

    if uniform:
        samples = resample_uniform(raw_points, frames)
        params = [index / (frames - 1) for index in range(frames)]
    else:
        samples = raw_points
        params = raw_params

    points = []
    travelled = 0.0
    for index, point in enumerate(samples):
        if index:
            travelled += distance(samples[index - 1], point)
        points.append(
            {
                "t": round(params[index], 6),
                "point": [round(value, 6) for value in point],
                "lam": round(params[index], 6),
                "s": round(travelled, 6),
            }
        )

    chord_length = distance(start, end)
    one_way = [sample(index / 199) for index in range(200)]
    path_length = polyline_length(one_way)
    travel_length = polyline_length(samples)
    return {
        "ok": True,
        "kind": kind,
        "a": start,
        "b": end,
        "dim": dim,
        "mode": mode,
        "uniform": bool(uniform),
        "frames": points,
        "length": round(chord_length, 6),
        "chord_length": round(chord_length, 6),
        "path_length": round(path_length, 6),
        "travel_length": round(travel_length, 6),
        "length_ratio": round(path_length / chord_length, 6) if chord_length > 1e-12 else 1.0,
        "midpoint": [round(value, 6) for value in lerp(start, end, 0.5)],
        "params": {"bulge": bulge, "amp": amp, "cycles": cycles, "turns": turns, "uniform": bool(uniform)},
        "formula": "θ(λ) = θₐ + λ(θ_b − θₐ),  p(λ) = c + R(cos θ, sin θ)"
        if kind == "arc"
        else "z(λ) = λx + (1 − λ)y",
    }
