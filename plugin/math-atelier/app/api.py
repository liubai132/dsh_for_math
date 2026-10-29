"""HTTP 接口层。"""

from __future__ import annotations

from fastapi import FastAPI, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

import sympy as sp

from .engine import cas, catalog, constants, fold, interp, numbers, phase, research, shapes
from .engine.cas import MathTimeout
from .engine.safety import ParseError

app = FastAPI(
    title="数学引擎",
    version="1.0.0",
    description="一个用来做科普数学和数字研究的开源数学引擎。",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

OPERATIONS = [
    {"key": "simplify", "label": "化简", "hint": "把式子整理成最简形式"},
    {"key": "expand", "label": "展开", "hint": "把括号和乘方全部乘开"},
    {"key": "factor", "label": "因式分解", "hint": "拆成因式或质数的乘积"},
    {"key": "solve", "label": "解方程", "hint": "写成 x^2-4=0 这种形式"},
    {"key": "diff", "label": "求导", "hint": "支持高阶导数"},
    {"key": "integrate", "label": "积分", "hint": "填了上下限就是定积分"},
    {"key": "limit", "label": "极限", "hint": "趋近点可以写 oo"},
    {"key": "series", "label": "级数展开", "hint": "泰勒/洛朗展开"},
    {"key": "evaluate", "label": "求值", "hint": "代入数值并给出小数"},
    {"key": "matrix.det", "label": "矩阵行列式", "hint": "写作 1,2;3,4"},
    {"key": "matrix.inv", "label": "矩阵求逆", "hint": "写作 1,2;3,4"},
    {"key": "matrix.rref", "label": "行最简形", "hint": "高斯消元"},
    {"key": "matrix.eigen", "label": "特征值", "hint": "特征多项式与特征值"},
    {"key": "matrix.rank", "label": "秩", "hint": "矩阵的秩"},
    {"key": "plot", "label": "函数图像", "hint": "画出 y = f(x)"},
]


class CasRequest(BaseModel):
    op: str = Field(default="simplify")
    expr: str = Field(default="", description="表达式，例如 x^2 - 4")
    var: str = Field(default="x")
    order: int = Field(default=1)
    lower: str | None = None
    upper: str | None = None
    point: str | None = None
    direction: str = "+-"
    digits: int = 15
    subs: str | None = None
    start: float = -10
    end: float = 10
    samples: int = 400


def _fail(exc: Exception):
    if isinstance(exc, ParseError):
        return HTTPException(status_code=400, detail=str(exc))
    if isinstance(exc, MathTimeout):
        return HTTPException(status_code=408, detail=str(exc))
    if isinstance(exc, ValueError):
        return HTTPException(status_code=400, detail=str(exc))
    if isinstance(exc, KeyError):
        return HTTPException(status_code=404, detail="没有这个对象。")
    return HTTPException(status_code=500, detail=f"计算失败：{exc}")


@app.get("/api/health")
def health() -> dict:
    return {"ok": True, "name": "数学引擎", "version": app.version}


@app.get("/api/ops")
def ops() -> dict:
    return {"operations": OPERATIONS}


@app.post("/api/cas")
def compute(req: CasRequest) -> dict:
    payload = req.model_dump(exclude_none=True)
    op = payload.pop("op", "simplify")
    try:
        return cas.run(op, payload)
    except Exception as exc:  # noqa: BLE001
        raise _fail(exc) from exc


@app.get("/api/number/{n}")
def number(n: str) -> dict:
    try:
        value = int(str(n).strip().replace(",", "").replace("_", ""))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="请输入一个整数。") from exc
    try:
        return numbers.analyze(value)
    except Exception as exc:  # noqa: BLE001
        raise _fail(exc) from exc


@app.get("/api/primes")
def primes(limit: int = Query(default=200, ge=2, le=20000)) -> dict:
    return {"limit": limit, "primes": numbers.primes_upto(limit)}


@app.get("/api/scan")
def scan(
    start: int = Query(default=1, ge=1, le=10**7),
    end: int = Query(default=1000, ge=1, le=10**7),
) -> dict:
    try:
        return numbers.scan(start, end)
    except Exception as exc:  # noqa: BLE001
        raise _fail(exc) from exc


@app.get("/api/constants")
def constants_list() -> dict:
    return {"constants": constants.catalogue()}


@app.get("/api/constant/{name}")
def constant(name: str, digits: int = Query(default=120, ge=10, le=2000)) -> dict:
    try:
        data = constants.digits_of(name, digits)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=f"没有常数 {name}。") from exc
    data["latex_symbol"] = constants.render_latex(name)
    return data


# ---------------------------------------------------------------- 研究接口


class SequenceRequest(BaseModel):
    terms: str = Field(default="", description="逗号或空格分隔的整数序列")
    oeis: bool = True


class IdentifyRequest(BaseModel):
    value: str = Field(default="", description="要识别的数值")
    digits: int = Field(default=30, ge=10, le=200)


class InterpRequest(BaseModel):
    a: list[float] = Field(default_factory=lambda: [0.0, 0.0])
    b: list[float] = Field(default_factory=lambda: [4.0, 3.0])
    frames: int = Field(default=80, ge=8, le=600)
    mode: str = Field(default="roundtrip")


class CurveRequest(BaseModel):
    kind: str = Field(default="linear")
    a: list[float] = Field(default_factory=lambda: [0.0, 0.0])
    b: list[float] = Field(default_factory=lambda: [4.0, 3.0])
    frames: int = Field(default=140, ge=8, le=600)
    mode: str = Field(default="roundtrip")
    bulge: float = Field(default=0.45, ge=-2.0, le=2.0)
    amp: float = Field(default=0.18, ge=0.0, le=1.0)
    cycles: float = Field(default=2.0, ge=0.0, le=8.0)
    turns: float = Field(default=1.5, ge=0.0, le=8.0)
    uniform: bool = Field(default=False)


@app.post("/api/interp/curve")
def interpolate_curve(req: CurveRequest) -> dict:
    try:
        return interp.curve(
            kind=req.kind,
            a=req.a,
            b=req.b,
            frames=req.frames,
            mode=req.mode,
            bulge=req.bulge,
            amp=req.amp,
            cycles=req.cycles,
            turns=req.turns,
            uniform=req.uniform,
        )
    except Exception as exc:  # noqa: BLE001
        raise _fail(exc) from exc


@app.post("/api/interp")
def interpolate(req: InterpRequest) -> dict:
    try:
        return interp.trajectory(req.a, req.b, frames=req.frames, mode=req.mode)
    except Exception as exc:  # noqa: BLE001
        raise _fail(exc) from exc


class MorphRequest(BaseModel):
    source: str = Field(default="shirt")
    target: str = Field(default="dress")
    count: int = Field(default=160, ge=16, le=400)
    uniform: bool = Field(default=True)


class FoldRequest(BaseModel):
    pleats: int = Field(default=18, ge=3, le=64)
    radius: float = Field(default=0.215, gt=0.0, le=10.0)
    layers: int = Field(default=3, ge=2, le=4)


@app.post("/api/fold/skirt")
def fold_skirt(req: FoldRequest) -> dict:
    try:
        return fold.fold_cross_section(req.pleats, req.radius, req.layers)
    except Exception as exc:  # noqa: BLE001
        raise _fail(exc) from exc


class PhaseRequest(BaseModel):
    system: str = Field(default="oscillator")
    xmin: float = Field(default=-2.0)
    xmax: float = Field(default=2.0)
    ymin: float = Field(default=-2.0)
    ymax: float = Field(default=2.0)
    grid: int = Field(default=13, ge=4, le=40)
    t_end: float = Field(default=8.0, gt=0.0, le=60.0)
    dt: float = Field(default=0.02, gt=0.0, le=0.2)


@app.get("/api/phase/systems")
def phase_systems() -> dict:
    return phase.catalogue()


@app.post("/api/phase/portrait")
def phase_portrait(req: PhaseRequest) -> dict:
    try:
        bounds = {"xmin": req.xmin, "xmax": req.xmax, "ymin": req.ymin, "ymax": req.ymax}
        return phase.portrait(req.system, bounds, grid=req.grid, t_end=req.t_end, dt=req.dt)
    except Exception as exc:  # noqa: BLE001
        raise _fail(exc) from exc


@app.post("/api/phase/trajectory")
def phase_trajectory(req: PhaseRequest, start: list[float] | None = None) -> dict:
    try:
        return phase.trajectory(req.system, start or [1.0, 0.0], t_end=req.t_end, dt=req.dt)
    except Exception as exc:  # noqa: BLE001
        raise _fail(exc) from exc


@app.get("/api/morph/shapes")
def morph_shapes() -> dict:
    return shapes.catalogue()


@app.post("/api/morph/prepare")
def morph_prepare(req: MorphRequest) -> dict:
    try:
        return shapes.prepare(req.source, req.target, count=req.count, uniform=req.uniform)
    except Exception as exc:  # noqa: BLE001
        raise _fail(exc) from exc


@app.get("/api/library")
def library() -> dict:
    return catalog.catalogue()


@app.get("/api/library/{identifier}")
def library_function(identifier: str) -> dict:
    try:
        return catalog.lookup(identifier)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/api/conjectures")
def conjectures() -> dict:
    return {"conjectures": research.conjecture_catalogue()}


@app.get("/api/conjecture/{key}")
def conjecture(key: str, limit: int = Query(default=0, ge=0)) -> dict:
    try:
        return research.test_conjecture(key, limit)
    except Exception as exc:  # noqa: BLE001
        raise _fail(exc) from exc


@app.post("/api/sequence")
def sequence(req: SequenceRequest) -> dict:
    try:
        return research.analyze_sequence(req.terms, use_oeis=req.oeis)
    except Exception as exc:  # noqa: BLE001
        raise _fail(exc) from exc


@app.post("/api/identify")
def identify(req: IdentifyRequest) -> dict:
    try:
        return research.identify(req.value, digits=req.digits)
    except Exception as exc:  # noqa: BLE001
        raise _fail(exc) from exc


def _csv(rows: list[list], header: list[str]) -> Response:
    lines = [",".join(header)]
    for row in rows:
        lines.append(",".join(str(cell) for cell in row))
    body = "\ufeff" + "\n".join(lines) + "\n"
    return Response(
        content=body,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="math-atelier.csv"'},
    )


@app.get("/api/export/number-table.csv")
def export_number_table(start: int = Query(default=1, ge=1), end: int = Query(default=200, ge=1)) -> Response:
    """导出一张整数表：n、是否素数、τ、φ、最大质因数、科拉茨步数。"""
    if end < start:
        raise HTTPException(status_code=400, detail="终点必须不小于起点。")
    if end - start > 5000:
        raise HTTPException(status_code=400, detail="一次最多导出 5000 行。")
    rows = []
    for n in range(start, end + 1):
        factor = sp.factorint(n) if n >= 2 else {}
        largest = max(factor) if factor else ""
        rows.append(
            [
                n,
                1 if (n >= 2 and sp.isprime(n)) else 0,
                int(sp.divisor_count(n)),
                int(sp.totient(n)),
                largest,
                numbers.collatz_steps(n),
            ]
        )
    return _csv(
        rows,
        ["n", "is_prime", "tau", "phi", "largest_prime_factor", "collatz_steps"],
    )


@app.get("/api/export/conjecture.csv")
def export_conjecture(key: str, limit: int = Query(default=0, ge=0)) -> Response:
    try:
        data = research.test_conjecture(key, limit)
    except Exception as exc:  # noqa: BLE001
        raise _fail(exc) from exc
    labels = data.get("series_label") or ["x", "y"]
    return _csv(data.get("series") or [], labels)
