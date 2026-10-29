"""研究工具：序列识别、常数反推、猜想检验。

这三件事是实验数学的日常动作：
拿到一串数想知道它是什么；拿到一个数值想猜它的闭式；
拿到一个猜想想用算力找证据或者反例。
"""

from __future__ import annotations

import json
import urllib.parse
import urllib.request
from fractions import Fraction

import mpmath as mp
import sympy as sp

MAX_TERMS = 60
MAX_VALUE = 10**15


# ---------------------------------------------------------------- 常数识别


def _parse_number(raw: str) -> str:
    text = (raw or "").strip().replace(" ", "").replace("，", ",")
    if not text:
        raise ValueError("请给一个数值，比如 3.14159265。")
    allowed = set("0123456789.+-eE")
    if not set(text) <= allowed:
        raise ValueError("只接受十进制数值（可以写 1e-3 这种科学计数法）。")
    return text


def _significant_digits(text: str) -> int:
    digits = "".join(ch for ch in text if ch.isdigit())
    digits = digits.lstrip("0")
    return max(len(digits), 3)


def identify(raw: str, digits: int = 30) -> dict:
    text = _parse_number(raw)
    digits = max(10, min(int(digits or 30), 200))
    sig = min(_significant_digits(text), digits)
    tolerance = mp.mpf(10) ** (-(sig - 2))

    mp.mp.dps = sig + 5
    try:
        value = mp.mpf(text)
    except Exception as exc:  # noqa: BLE001
        raise ValueError(f"这不是一个有效数值：{exc}") from exc
    if not mp.isfinite(value):
        raise ValueError("数值必须有限。")

    guesses: list[dict] = []
    seen: set[str] = set()

    def add(item: dict) -> None:
        key = item["text"].replace(" ", "")
        if key in seen or len(guesses) >= 5:
            return
        seen.add(key)
        guesses.append(item)

    # 1) 闭式：先让 PSLQ 试，再让 SymPy 化简
    constant_pool = [
        "pi", "e", "log(2)", "log(10)", "sqrt(2)", "sqrt(3)", "sqrt(5)",
        "phi", "gamma", "zeta(3)", "catalan", "khinchin",
    ]
    try:
        found = mp.identify(value, constant_pool, tol=tolerance, maxcoeff=10**6)
    except Exception:  # noqa: BLE001
        found = None
    if found and found != str(value)[:len(found)]:
        add(
            {
                "text": found,
                "latex": _to_latex(found),
                "kind": "闭式",
                "note": "PSLQ 整数关系算法在给定精度内找到",
            }
        )

    try:
        simplified = sp.nsimplify(
            sp.Float(text, sig),
            constants=[sp.pi, sp.E, sp.log(2), sp.sqrt(2), sp.sqrt(3), sp.sqrt(5),
                       sp.GoldenRatio, sp.EulerGamma, sp.Catalan, sp.zeta(3)],
            tolerance=sp.Float(tolerance),
            rational=False,
        )
    except Exception:  # noqa: BLE001
        simplified = None
    if simplified is not None and simplified != sp.Float(text, sig):
        candidate = sp.simplify(simplified)
        add(
            {
                "text": str(candidate),
                "latex": sp.latex(candidate),
                "kind": "化简形式",
                "note": "SymPy 在给定精度内找到的等价表达式",
            }
        )
        if len(candidate.free_symbols) == 0 and candidate.is_algebraic and not candidate.is_rational:
            try:
                poly = sp.minimal_polynomial(candidate)
                add(
                    {
                        "text": f"最小多项式 {poly} = 0",
                        "latex": sp.latex(poly) + " = 0",
                        "kind": "代数数",
                        "note": f"次数 {sp.degree(poly)}",
                    }
                )
            except Exception:  # noqa: BLE001
                pass

    # 2) 有理数：只在分母不大时才值得一说
    approx = sp.Rational(text).limit_denominator(10**4)
    if approx.q != 1:
        error = abs(float(value) - float(approx))
        if error <= float(tolerance) * 10:
            add(
                {
                    "text": f"{approx.p}/{approx.q}",
                    "latex": sp.latex(approx),
                    "kind": "有理数",
                    "note": f"分母 {approx.q}，误差 {error:.1e}",
                }
            )
    elif float(value).is_integer():
        add(
            {
                "text": str(int(value)),
                "latex": str(int(value)),
                "kind": "整数",
                "note": "就是一个整数",
            }
        )

    cf = []
    try:
        cf = [int(x) for x in mp.continued_fraction(value)[:20]]
    except Exception:  # noqa: BLE001
        pass

    if not guesses:
        guesses.append(
            {
                "text": mp.nstr(value, sig),
                "latex": mp.nstr(value, sig),
                "kind": "未识别",
                "note": "没有找到简洁的闭式，可能需要更多位数，或者它本来就没有闭式。",
            }
        )

    return {
        "ok": True,
        "input": text,
        "digits": sig,
        "value": mp.nstr(value, sig),
        "guesses": guesses,
        "continued_fraction": cf,
        "notes": [
            f"按 {sig} 位有效数字识别，容差约 {mp.nstr(tolerance, 2)}。",
            "识别结果是“候选”，不是证明；位数越多越可靠。",
        ],
    }


def _to_latex(text: str) -> str:
    try:
        return sp.latex(sp.sympify(text))
    except Exception:  # noqa: BLE001
        return text


# ---------------------------------------------------------------- 序列分析


def _parse_terms(raw: str) -> list[int]:
    text = (raw or "").replace("\n", ",").replace(" ", ",").replace("，", ",")
    parts = [p for p in text.split(",") if p.strip()]
    if len(parts) < 3:
        raise ValueError("至少给 3 项，用逗号或空格分隔。")
    if len(parts) > MAX_TERMS:
        raise ValueError(f"最多 {MAX_TERMS} 项。")
    terms = []
    for part in parts:
        try:
            value = Fraction(part.strip())
        except Exception as exc:  # noqa: BLE001
            raise ValueError(f"第 {len(terms) + 1} 项不认识：{part.strip()}") from exc
        if value.denominator != 1:
            raise ValueError("目前只支持整数序列。")
        if abs(value.numerator) > MAX_VALUE:
            raise ValueError(f"数值太大，上限 {MAX_VALUE:,}。")
        terms.append(int(value.numerator))
    return terms


def _known_sequence(terms: list[int]) -> dict | None:
    """和一批常见序列的前缀比对。"""
    library: dict[str, tuple[str, list[int]]] = {
        "素数": ("A000040", [int(p) for p in sp.primerange(2, 500)][:30]),
        "平方数": ("A000290", [n * n for n in range(1, 31)]),
        "立方数": ("A000578", [n ** 3 for n in range(1, 21)]),
        "三角数": ("A000217", [n * (n + 1) // 2 for n in range(1, 31)]),
        "斐波那契数": ("A000045", [int(sp.fibonacci(n)) for n in range(1, 31)]),
        "阶乘": ("A000142", [int(sp.factorial(n)) for n in range(1, 16)]),
        "二的幂": ("A000079", [2 ** n for n in range(0, 30)]),
        "卡塔兰数": ("A000108", [int(sp.catalan(n)) for n in range(0, 20)]),
        "贝尔数": ("A000110", [int(sp.bell(n)) for n in range(0, 16)]),
        "分拆数": ("A000041", [int(sp.partition(n)) for n in range(0, 30)]),
        "欧拉 φ(n)": ("A000010", [int(sp.totient(n)) for n in range(1, 31)]),
        "约数个数 τ(n)": ("A000005", [int(sp.divisor_count(n)) for n in range(1, 31)]),
    }
    for name, (oeis_id, prefix) in library.items():
        span = min(len(terms), len(prefix), 10)
        if span >= 4 and terms[:span] == prefix[:span]:
            return {
                "name": name,
                "oeis": oeis_id,
                "offset": _find_offset(terms, prefix),
                "matched": span,
            }
    return None


def _find_offset(terms: list[int], prefix: list[int]) -> int:
    for start in range(0, max(len(prefix) - len(terms) + 1, 1)):
        if prefix[start:start + len(terms)] == terms:
            return start
    return 0


def _fit_recurrence(seq: list[Fraction], order: int) -> list[int] | None:
    """用 seq 解出 order 阶常系数线性递推，要求系数是整数。"""
    rows, rhs = [], []
    for i in range(order, len(seq)):
        rows.append([seq[i - j - 1] for j in range(order)])
        rhs.append(seq[i])
    if len(rows) < order:
        return None
    matrix = sp.Matrix(
        [[sp.Rational(x.numerator, x.denominator) for x in row] for row in rows]
    )
    target = sp.Matrix([sp.Rational(x.numerator, x.denominator) for x in rhs])
    try:
        solution = matrix.gauss_jordan_solve(target)[0]
    except Exception:  # noqa: BLE001
        return None
    coefficients = []
    for value in solution:
        simplified = sp.nsimplify(value)
        if not simplified.is_Integer:
            return None
        coefficients.append(int(simplified))
    if all(c == 0 for c in coefficients):
        return None
    return coefficients


def _berlekamp_massey(terms: list[int], max_order: int = 6) -> list[int] | None:
    """在有理数域上找线性递推：a(n) = c1·a(n-1) + ... + ck·a(n-k)。

    为了不把有限项硬凑出来，留最后两项做验证：
    先用前面的项解系数，再看能不能预测出这两项。
    """
    seq = [Fraction(x) for x in terms]
    n = len(seq)
    if n < 6:
        return None

    for order in range(1, min(max_order, (n - 2) // 2) + 1):
        coefficients = _fit_recurrence(seq[: n - 2], order)
        if coefficients is None:
            continue
        ok = True
        for i in range(n - 2, n):
            predicted = sum(coefficients[j] * seq[i - j - 1] for j in range(order))
            if predicted != seq[i]:
                ok = False
                break
        if not ok:
            continue

        # 再外推一步，防止系数导致符号翻转之类的假模型
        if all(t > 0 for t in terms):
            first = sum(coefficients[j] * seq[n - j - 1] for j in range(order))
            if first <= 0:
                continue
        return coefficients
    return None


def analyze_sequence(raw: str, use_oeis: bool = True) -> dict:
    terms = _parse_terms(raw)

    table = [terms]
    while len(table) < 7 and len(table[-1]) > 1 and any(x != 0 for x in table[-1]):
        last = table[-1]
        table.append([b - a for a, b in zip(last, last[1:])])

    notes: list[str] = []

    # 多项式：某一阶差分全相等
    poly = None
    degree = None
    for level in range(1, len(table)):
        if len(set(table[level])) == 1 and len(table[level]) >= 2:
            degree = level
            break
    if degree is not None:
        n = sp.Symbol("n")
        points = [(i, terms[i]) for i in range(min(len(terms), degree + 2))]
        poly_expr = sp.interpolate(points, n)
        poly = sp.factor(sp.expand(poly_expr))
        notes.append(f"第 {degree} 阶差分恒定，所以这是一个 {degree} 次多项式。")

    # 线性递推
    recurrence = _berlekamp_massey(terms)
    if recurrence:
        notes.append(
            "找到一个 " + str(len(recurrence)) + " 阶线性递推：a(n) = "
            + " + ".join(f"{c}·a(n-{i + 1})" for i, c in enumerate(recurrence))
        )

    known = _known_sequence(terms)

    # 预测后续项
    next_terms: list[int] = []
    if recurrence:
        history = list(terms)
        for _ in range(5):
            nxt = sum(c * history[-i - 1] for i, c in enumerate(recurrence))
            history.append(nxt)
        next_terms = history[len(terms):]
    elif poly is not None:
        n = sp.Symbol("n")
        next_terms = [int(poly.subs(n, len(terms) + i)) for i in range(5)]

    # OEIS
    oeis = None
    if use_oeis:
        oeis = _query_oeis(terms, notes)

    return {
        "ok": True,
        "terms": terms,
        "differences": table[1:],
        "polynomial": sp.latex(poly) if poly is not None else None,
        "polynomial_text": str(poly) if poly is not None else None,
        "degree": degree,
        "recurrence": recurrence,
        "known": known,
        "next_terms": next_terms,
        "oeis": oeis,
        "notes": notes,
    }


def _query_oeis(terms: list[int], notes: list[str]) -> dict | None:
    query = ",".join(str(t) for t in terms[:12])
    url = "https://oeis.org/search?fmt=json&q=" + urllib.parse.quote(query)
    try:
        request = urllib.request.Request(url, headers={"User-Agent": "math-atelier/1.0"})
        with urllib.request.urlopen(request, timeout=6) as response:
            payload = json.loads(response.read().decode("utf-8", "replace"))
    except Exception as exc:  # noqa: BLE001
        notes.append(f"OEIS 查询失败（{type(exc).__name__}），可能是没联网。")
        return None
    results = payload.get("results") or []
    if not results:
        notes.append("OEIS 里没有匹配的序列。")
        return {"found": 0, "items": []}
    items = []
    for item in results[:5]:
        items.append(
            {
                "id": item.get("number"),
                "name": (item.get("name") or "").strip(),
                "data": (item.get("data") or "")[:80],
            }
        )
    return {"found": payload.get("count", len(results)), "items": items}


# ---------------------------------------------------------------- 猜想检验

CONJECTURES = [
    {
        "key": "goldbach",
        "title": "哥德巴赫猜想",
        "statement": "每个大于 2 的偶数都能写成两个素数之和。",
        "limit_hint": "检验到多大的偶数（最多 20000）",
        "default_limit": 2000,
    },
    {
        "key": "twin",
        "title": "孪生素数",
        "statement": "相差 2 的素数对（如 11 与 13）是否无穷多？这里统计它们的数量和最大间隙。",
        "limit_hint": "统计到多大（最多 200000）",
        "default_limit": 20000,
    },
    {
        "key": "legendre",
        "title": "勒让德猜想",
        "statement": "对每个 n，n² 与 (n+1)² 之间至少有一个素数。",
        "limit_hint": "检验到多大的 n（最多 2000）",
        "default_limit": 200,
    },
    {
        "key": "bertrand",
        "title": "伯特兰公设",
        "statement": "对每个 n > 1，n 与 2n 之间至少有一个素数（已证明，可用来练手）。",
        "limit_hint": "检验到多大的 n（最多 5000）",
        "default_limit": 1000,
    },
    {
        "key": "collatz",
        "title": "3n+1（科拉茨）",
        "statement": "任何正整数反复做 3n+1 / n÷2，最终都会到 1。",
        "limit_hint": "验证到多大的 n（最多 100000）",
        "default_limit": 10000,
    },
    {
        "key": "euler_poly",
        "title": "欧拉素数多项式",
        "statement": "n² + n + 41 在 n = 0,1,2,… 时是否总是素数？",
        "limit_hint": "检验到多大的 n（最多 10000）",
        "default_limit": 100,
    },
    {
        "key": "prime_gap",
        "title": "素数间隙",
        "statement": "相邻素数的间隔最大能有多大？把实测最大值和 log²p 的启发式比较。",
        "limit_hint": "统计到多大（最多 500000）",
        "default_limit": 50000,
    },
]


def _clamp(limit: int, low: int, high: int) -> int:
    return max(low, min(int(limit), high))


def test_conjecture(key: str, limit: int = 0) -> dict:
    key = (key or "").strip().lower()

    if key == "goldbach":
        limit = _clamp(limit, 10, 20000)
        primes = set(int(p) for p in sp.primerange(2, limit + 1))
        counts = []
        first_counterexample = None
        for n in range(4, limit + 1, 2):
            ways = sum(1 for p in primes if p <= n // 2 and (n - p) in primes)
            counts.append([n, ways])
            if ways == 0 and first_counterexample is None:
                first_counterexample = n
        verdict = "未发现反例" if first_counterexample is None else f"反例：{first_counterexample}"
        return {
            "ok": True,
            "key": key,
            "title": "哥德巴赫猜想",
            "statement": CONJECTURES[0]["statement"],
            "checked": len(counts),
            "verdict": verdict,
            "stats": {
                "检验偶数个数": len(counts),
                "最小表示数": min(c for _, c in counts) if counts else 0,
                "平均表示数": round(sum(c for _, c in counts) / max(len(counts), 1), 2),
            },
            "series": counts,
            "series_label": ["偶数", "表示方法的个数"],
            "notes": ["表示方法的个数随 n 增长，这就是“哥德巴赫 comet”的雏形。"],
        }

    if key == "twin":
        limit = _clamp(limit, 100, 200000)
        primes = [int(p) for p in sp.primerange(2, limit + 1)]
        pairs = [(a, b) for a, b in zip(primes, primes[1:]) if b - a == 2]
        gaps = [(a, b - a) for a, b in zip(primes, primes[1:])]
        max_gap = max(gaps, key=lambda item: item[1]) if gaps else (0, 0)
        return {
            "ok": True,
            "key": key,
            "title": "孪生素数",
            "statement": CONJECTURES[1]["statement"],
            "checked": len(primes),
            "verdict": f"找到 {len(pairs)} 对孪生素数",
            "stats": {
                "素数个数": len(primes),
                "孪生素数对": len(pairs),
                "最后 3 对": "、".join(f"({a},{b})" for a, b in pairs[-3:]) or "无",
                "最大间隙": max_gap[1],
            },
            "series": [[i + 1, g] for i, (_, g) in enumerate(gaps)][:3000],
            "series_label": ["第几个素数", "与上一个的间隔"],
            "notes": ["张益唐 2013 年证明了存在无穷多对间隔有界的素数，目前这个界被压到 246。"],
        }

    if key == "legendre":
        limit = _clamp(limit, 5, 2000)
        failures = []
        for n in range(1, limit + 1):
            low, high = n * n, (n + 1) * (n + 1)
            candidate = int(sp.nextprime(low))
            if candidate >= high:
                failures.append(n)
        return {
            "ok": True,
            "key": key,
            "title": "勒让德猜想",
            "statement": CONJECTURES[2]["statement"],
            "checked": limit,
            "verdict": "未发现反例" if not failures else f"反例：n = {failures[:5]}",
            "stats": {"检验的 n": limit, "反例个数": len(failures)},
            "series": [],
            "series_label": [],
            "notes": ["这个猜想至今未证明。它的一个弱化版本（n² 与 (n+1)² 间有素数）已被部分结果逼近。"],
        }

    if key == "bertrand":
        limit = _clamp(limit, 5, 5000)
        failures = [n for n in range(2, limit + 1) if int(sp.nextprime(n)) >= 2 * n]
        return {
            "ok": True,
            "key": key,
            "title": "伯特兰公设",
            "statement": CONJECTURES[3]["statement"],
            "checked": limit - 1,
            "verdict": "未发现反例" if not failures else f"反例：{failures[:5]}",
            "stats": {"检验的 n": limit - 1, "反例个数": len(failures)},
            "series": [],
            "series_label": [],
            "notes": ["切比雪夫在 1852 年证明了它，所以这里只可能“未发现反例”。"],
        }

    if key == "collatz":
        limit = _clamp(limit, 10, 100000)
        best = (0, 1)
        hits = 0
        series = []
        for n in range(1, limit + 1):
            steps = 0
            value = n
            while value != 1 and steps < 2000:
                value = value // 2 if value % 2 == 0 else 3 * value + 1
                steps += 1
            if value == 1:
                hits += 1
            if steps > best[0]:
                best = (steps, n)
            if n % max(limit // 200, 1) == 0:
                series.append([n, steps])
        return {
            "ok": True,
            "key": key,
            "title": "3n+1（科拉茨）",
            "statement": CONJECTURES[4]["statement"],
            "checked": limit,
            "verdict": f"全部 {hits} 个起点都落到了 1" if hits == limit else "有起点在 2000 步内没到 1",
            "stats": {
                "验证个数": limit,
                "步数冠军": f"{best[1]}（{best[0]} 步）",
            },
            "series": series,
            "series_label": ["n", "到 1 的步数"],
            "notes": ["已经验证到 2^68 以上，但猜想仍未证明。"],
        }

    if key == "euler_poly":
        limit = _clamp(limit, 10, 10000)
        first_composite = None
        values = []
        for n in range(0, limit + 1):
            value = n * n + n + 41
            prime = bool(sp.isprime(value))
            values.append([n, 1 if prime else 0])
            if not prime and first_composite is None:
                first_composite = (n, value)
        return {
            "ok": True,
            "key": key,
            "title": "欧拉素数多项式",
            "statement": CONJECTURES[5]["statement"],
            "checked": limit + 1,
            "verdict": (
                f"n = {first_composite[0]} 时得到 {first_composite[1]}，不是素数"
                if first_composite
                else "这一段里全是素数"
            ),
            "stats": {
                "检验的 n": limit + 1,
                "首次失效": f"n={first_composite[0]}" if first_composite else "无",
            },
            "series": values,
            "series_label": ["n", "是否素数（1/0）"],
            "notes": ["n 从 0 到 39 全是素数，n=40 时得到 1681 = 41²。这个多项式是二次域类数理论的著名例子。"],
        }

    if key == "prime_gap":
        limit = _clamp(limit, 1000, 500000)
        primes = [int(p) for p in sp.primerange(2, limit + 1)]
        gaps = [[a, b - a] for a, b in zip(primes, primes[1:])]
        if not gaps:
            raise ValueError("区间里素数太少。")
        max_gap = max(gaps, key=lambda item: item[1])
        import math

        heuristic = max_gap[1] / (math.log(max_gap[0]) ** 2)
        return {
            "ok": True,
            "key": key,
            "title": "素数间隙",
            "statement": CONJECTURES[6]["statement"],
            "checked": len(primes),
            "verdict": f"最大间隙 {max_gap[1]}，出现在 {max_gap[0]} 之后",
            "stats": {
                "素数个数": len(primes),
                "最大间隙": max_gap[1],
                "位置": max_gap[0],
                "最大间隙 / log²p": round(heuristic, 2),
            },
            "series": gaps[:3000],
            "series_label": ["素数", "间隙"],
            "notes": ["克拉梅尔猜想预测最大间隙约为 log²p，实测比值会随着范围缓慢增长。"],
        }

    raise ValueError(f"没有这个猜想：{key}")


def conjecture_catalogue() -> list[dict]:
    return CONJECTURES
