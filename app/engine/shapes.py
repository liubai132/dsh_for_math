"""衣服轮廓：用少量控制点描述，再按弧长均匀重采样。

两个轮廓要互相变形（morph），前提是点数相同、且第 i 个点在两条边上
"沿边走的比例"一致——这正是匀速（等弧长）插值的用处。
"""

from __future__ import annotations

from . import interp

# 控制点用 0~1 归一化坐标，y 向下
SHAPES = {
    "shirt": {
        "name": "短袖",
        "points": [
            [0.30, 0.12], [0.70, 0.12], [0.78, 0.20], [0.96, 0.36],
            [0.84, 0.46], [0.72, 0.38], [0.70, 0.90], [0.30, 0.90],
            [0.28, 0.38], [0.16, 0.46], [0.04, 0.36], [0.22, 0.20],
        ],
    },
    "dress": {
        "name": "长裙",
        "points": [
            [0.36, 0.10], [0.64, 0.10], [0.68, 0.22], [0.70, 0.40],
            [0.92, 0.94], [0.08, 0.94], [0.30, 0.40], [0.32, 0.22],
        ],
    },
    "coat": {
        "name": "大衣",
        "points": [
            [0.34, 0.10], [0.66, 0.10], [0.72, 0.24], [0.80, 0.50],
            [0.86, 0.94], [0.14, 0.94], [0.20, 0.50], [0.28, 0.24],
        ],
    },
}


def catalogue() -> dict:
    return {
        "ok": True,
        "shapes": [
            {"id": key, "name": value["name"], "points": value["points"]}
            for key, value in SHAPES.items()
        ],
    }


def prepare(from_id: str, to_id: str, count: int = 160, uniform: bool = True) -> dict:
    if from_id not in SHAPES:
        raise KeyError(f"没有这个形状：{from_id}")
    if to_id not in SHAPES:
        raise KeyError(f"没有这个形状：{to_id}")
    count = max(16, min(int(count), 400))

    source = SHAPES[from_id]
    target = SHAPES[to_id]

    if uniform:
        left = interp.resample_closed(source["points"], count)
        right = interp.resample_closed(target["points"], count)
    else:
        left = interp.resample_closed(source["points"], count, uniform=False)
        right = interp.resample_closed(target["points"], count, uniform=False)

    return {
        "ok": True,
        "from": from_id,
        "to": to_id,
        "from_name": source["name"],
        "to_name": target["name"],
        "uniform": bool(uniform),
        "count": count,
        "a": [[round(x, 6), round(y, 6)] for x, y in left],
        "b": [[round(x, 6), round(y, 6)] for x, y in right],
        "perimeter_a": round(interp.polygon_perimeter(left), 6),
        "perimeter_b": round(interp.polygon_perimeter(right), 6),
        "note": "两边点数相同、且第 i 个点的沿边比例一致，才可以直接插值",
    }
