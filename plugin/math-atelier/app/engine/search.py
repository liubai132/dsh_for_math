"""网格寻路：BFS / Dijkstra / A* / 贪心，以及迷宫生成。

约定：
- 网格是 cols × rows 的一维数组，1 表示墙，0 表示可走
- 8 邻接，斜走代价 √2，禁止贴角穿墙（斜走要求两条直角边都通）
- BFS 的代价按「步数」算（每步 1），所以它最优的是步数，不是距离；
  Dijkstra / A* 最优的是距离；贪心只按启发式排序，不保证最优。
"""

from __future__ import annotations

import heapq
import math
import random

SQRT2 = math.sqrt(2.0)

DIRS8 = [
    (1, 0, 1.0),
    (-1, 0, 1.0),
    (0, 1, 1.0),
    (0, -1, 1.0),
    (1, 1, SQRT2),
    (1, -1, SQRT2),
    (-1, 1, SQRT2),
    (-1, -1, SQRT2),
]

ALGOS = {
    "bfs": "BFS（步数最优）",
    "dijkstra": "Dijkstra（距离最优）",
    "astar": "A*（距离最优，探索更少）",
    "greedy": "贪心（快，不保证最优）",
}


def _passable(walls: list[int], cols: int, rows: int, x: int, y: int) -> bool:
    return 0 <= x < cols and 0 <= y < rows and not walls[y * cols + x]


def _can_step(walls: list[int], cols: int, rows: int, x: int, y: int, nx: int, ny: int) -> bool:
    if not _passable(walls, cols, rows, nx, ny):
        return False
    if nx == x or ny == y:
        return True
    return _passable(walls, cols, rows, nx, y) and _passable(walls, cols, rows, x, ny)


def _octile(x: int, y: int, ex: int, ey: int) -> float:
    dx = abs(x - ex)
    dy = abs(y - ey)
    return dx + dy + (SQRT2 - 2.0) * min(dx, dy)


def solve(
    walls: list[int],
    cols: int,
    rows: int,
    start: int,
    end: int,
    algo: str = "astar",
) -> dict:
    """在网格上跑一次搜索，返回访问顺序、路径、代价。"""
    if algo not in ALGOS:
        raise ValueError(f"algo 只能是 {', '.join(ALGOS)}")
    if len(walls) != cols * rows:
        raise ValueError("walls 长度必须等于 cols × rows")
    if not (0 <= start < cols * rows and 0 <= end < cols * rows):
        raise ValueError("起点或终点越界")

    total = cols * rows
    best = [math.inf] * total
    parent = [-1] * total
    closed = [False] * total
    order: list[int] = []

    sx, sy = start % cols, start // cols
    ex, ey = end % cols, end // cols
    found = False

    if start == end:
        order.append(start)
        found = True
    elif not _passable(walls, cols, rows, sx, sy) or not _passable(walls, cols, rows, ex, ey):
        pass
    elif algo == "bfs":
        queue = [start]
        head = 0
        best[start] = 0.0
        while head < len(queue):
            cur = queue[head]
            head += 1
            if closed[cur]:
                continue
            closed[cur] = True
            order.append(cur)
            if cur == end:
                found = True
                break
            cx, cy = cur % cols, cur // cols
            for dx, dy, _w in DIRS8:
                nx, ny = cx + dx, cy + dy
                if not _can_step(walls, cols, rows, cx, cy, nx, ny):
                    continue
                ni = ny * cols + nx
                if closed[ni] or best[ni] != math.inf:
                    continue
                best[ni] = best[cur] + 1.0
                parent[ni] = cur
                queue.append(ni)
    else:
        heap: list[tuple[float, int]] = []
        best[start] = 0.0
        heapq.heappush(heap, (0.0, start))
        while heap:
            _key, cur = heapq.heappop(heap)
            if closed[cur]:
                continue
            closed[cur] = True
            order.append(cur)
            if cur == end:
                found = True
                break
            cx, cy = cur % cols, cur // cols
            for dx, dy, w in DIRS8:
                nx, ny = cx + dx, cy + dy
                if not _can_step(walls, cols, rows, cx, cy, nx, ny):
                    continue
                ni = ny * cols + nx
                if closed[ni]:
                    continue
                tentative = best[cur] + w
                if tentative < best[ni] - 1e-9:
                    best[ni] = tentative
                    parent[ni] = cur
                    if algo == "dijkstra":
                        key = tentative
                    elif algo == "greedy":
                        key = _octile(nx, ny, ex, ey) + tentative * 0.001
                    else:
                        key = tentative + _octile(nx, ny, ex, ey)
                    heapq.heappush(heap, (key, ni))

    path: list[int] = []
    cost = 0.0
    if found:
        cur = end
        while cur != -1:
            path.append(cur)
            if cur == start:
                break
            cur = parent[cur]
        path.reverse()
        if not path or path[0] != start:
            path = []
            found = False
    if len(path) > 1:
        for a, b in zip(path, path[1:]):
            ax, ay = a % cols, a // cols
            bx, by = b % cols, b // cols
            cost += SQRT2 if (ax != bx and ay != by) else 1.0

    return {
        "algo": algo,
        "found": found,
        "order": order,
        "path": path,
        "cost": round(cost, 4),
        "steps": max(0, len(path) - 1),
        "visited": len(order),
    }


def _border(walls: list[int], cols: int, rows: int) -> None:
    for x in range(cols):
        walls[x] = 1
        walls[(rows - 1) * cols + x] = 1
    for y in range(rows):
        walls[y * cols] = 1
        walls[y * cols + cols - 1] = 1


def _clear_around(walls: list[int], cols: int, rows: int, idx: int) -> None:
    cx, cy = idx % cols, idx // cols
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            x, y = cx + dx, cy + dy
            if 0 < x < cols - 1 and 0 < y < rows - 1:
                walls[y * cols + x] = 0


def empty_grid(cols: int, rows: int, start: int, end: int) -> list[int]:
    walls = [0] * (cols * rows)
    _border(walls, cols, rows)
    _clear_around(walls, cols, rows, start)
    _clear_around(walls, cols, rows, end)
    return walls


def generate_maze(cols: int, rows: int, start: int, end: int, seed: int | None = None) -> dict:
    """随机散墙 + 房间，再用 A* 自查：必须「需要绕路」才接受。"""
    cols = max(5, min(int(cols), 60))
    rows = max(5, min(int(rows), 60))
    start = max(0, min(int(start), cols * rows - 1))
    end = max(0, min(int(end), cols * rows - 1))
    rng = random.Random(seed)

    sx, sy = start % cols, start // cols
    ex, ey = end % cols, end // cols
    direct = _octile(sx, sy, ex, ey)
    total = cols * rows

    for _attempt in range(80):
        walls = [1 if rng.random() < 0.22 else 0 for _ in range(total)]

        # 房间数量跟面积走，小网格少放几间，否则密度必然超上限
        room_count = max(3, int(total / 55) + int(rng.random() * 3))
        for _k in range(room_count):
            rw = 2 + int(rng.random() * 4)
            rh = 2 + int(rng.random() * 3)
            x = 2 + int(rng.random() * max(1, cols - 4 - rw))
            y = 2 + int(rng.random() * max(1, rows - 4 - rh))
            for ry in range(rh):
                for rx in range(rw):
                    if x + rx < cols - 1 and y + ry < rows - 1:
                        walls[(y + ry) * cols + x + rx] = 1

        _border(walls, cols, rows)
        _clear_around(walls, cols, rows, start)
        _clear_around(walls, cols, rows, end)

        density = sum(walls) / total
        if density < 0.16 or density > 0.45:
            continue

        probe = solve(walls, cols, rows, start, end, "astar")
        if not probe["found"]:
            continue
        if probe["visited"] < total * 0.12 or probe["visited"] > total * 0.55:
            continue
        if probe["cost"] < direct * 1.12:
            continue

        return {
            "ok": True,
            "cols": cols,
            "rows": rows,
            "start": start,
            "end": end,
            "walls": walls,
            "density": round(density, 4),
            "seed": seed,
        }

    return {
        "ok": True,
        "cols": cols,
        "rows": rows,
        "start": start,
        "end": end,
        "walls": empty_grid(cols, rows, start, end),
        "density": 0.0,
        "seed": seed,
        "fallback": True,
    }


def compare(walls: list[int], cols: int, rows: int, start: int, end: int) -> dict:
    """同一张图上跑四种搜索，给出访问数、代价、路径的对比。"""
    runs = {}
    for algo in ALGOS:
        runs[algo] = solve(walls, cols, rows, start, end, algo)

    astar = runs["astar"]
    dijkstra = runs["dijkstra"]
    bfs = runs["bfs"]
    greedy = runs["greedy"]

    rows_out = []
    for algo, result in runs.items():
        rows_out.append(
            {
                "algo": algo,
                "name": ALGOS[algo],
                "found": result["found"],
                "visited": result["visited"],
                "cost": result["cost"],
                "steps": result["steps"],
                "optimal": abs(result["cost"] - dijkstra["cost"]) < 1e-6 if result["found"] else None,
            }
        )

    return {
        "ok": True,
        "cols": cols,
        "rows": rows,
        "start": start,
        "end": end,
        "runs": rows_out,
        "detail": runs,
        "summary": {
            "optimalCost": dijkstra["cost"],
            "bfsSteps": bfs["steps"],
            "astarVisited": astar["visited"],
            "dijkstraVisited": dijkstra["visited"],
            "greedyVisited": greedy["visited"],
        },
    }
