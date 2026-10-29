"""数字实验室：把一个整数彻底拆开来看。

输出全部是普通 Python 类型，可以直接 JSON 化。
"""

from __future__ import annotations

import math

import sympy as sp

MAX_N = 10**15
MAX_DIVISORS = 400
COLLATZ_MAX_STEPS = 2000

_ROMAN = [
    (1000, "M"), (900, "CM"), (500, "D"), (400, "CD"),
    (100, "C"), (90, "XC"), (50, "L"), (40, "XL"),
    (10, "X"), (9, "IX"), (5, "V"), (4, "IV"), (1, "I"),
]


def to_roman(num: int) -> str | None:
    if not 0 < num < 4000:
        return None
    out = []
    rest = num
    for value, symbol in _ROMAN:
        while rest >= value:
            out.append(symbol)
            rest -= value
    return "".join(out)


def _is_square(n: int) -> tuple[bool, int]:
    root = math.isqrt(n)
    return root * root == n, root


def _is_cube(n: int) -> tuple[bool, int]:
    if n < 0:
        return False, 0
    root = round(n ** (1 / 3))
    for candidate in (root - 1, root, root + 1):
        if candidate >= 0 and candidate ** 3 == n:
            return True, candidate
    return False, 0


def _triangular_index(n: int) -> int | None:
    if n <= 0:
        return None
    disc = 8 * n + 1
    root = math.isqrt(disc)
    if root * root != disc:
        return None
    k = (root - 1) // 2
    return k if k * (k + 1) // 2 == n else None


def _fibonacci_index(n: int) -> int | None:
    if n < 0:
        return None
    a, b, idx = 1, 1, 1
    while a < n and idx < 100:
        a, b = b, a + b
        idx += 1
    return idx if a == n else None


def sqrt_continued_fraction(n: int, max_period: int = 300) -> dict:
    a0 = math.isqrt(n)
    if a0 * a0 == n:
        return {"a0": a0, "period": [], "period_len": 0}
    m, d, a = 0, 1, a0
    period: list[int] = []
    for _ in range(max_period):
        m = d * a - m
        d = (n - m * m) // d
        a = (a0 + m) // d
        period.append(a)
        if a == 2 * a0:
            break
    return {"a0": a0, "period": period, "period_len": len(period)}


def collatz(n: int) -> dict:
    if n < 1:
        return {"steps": 0, "max": n, "sequence": [n], "converged": n == 1}
    sequence = [n]
    value = n
    steps = 0
    peak = n
    while value != 1 and steps < COLLATZ_MAX_STEPS:
        value = value // 2 if value % 2 == 0 else 3 * value + 1
        sequence.append(value)
        peak = max(peak, value)
        steps += 1
        if value > 10**30:  # 防止天文数字拖死前端
            break
    return {
        "steps": steps,
        "max": peak,
        "sequence": sequence[:120],
        "converged": value == 1,
    }


def goldbach(n: int) -> dict | None:
    if n < 4 or n % 2 != 0 or n > 10**6:
        return None
    count = 0
    first = None
    for p in sp.primerange(2, n // 2 + 1):
        if sp.isprime(n - p):
            count += 1
            if first is None:
                first = (int(p), int(n - p))
    if first is None:
        return None
    return {"p": first[0], "q": first[1], "count": count}


def analyze(n: int) -> dict:
    if n < 0:
        raise ValueError("这里只研究非负整数，换一个吧。")
    if n > MAX_N:
        raise ValueError(f"数字太大，上限是 {MAX_N:,}。")

    warnings: list[str] = []
    facts: list[dict] = []

    digits_text = str(n)
    digit_count = len(digits_text) if n > 0 else 1

    # ---- 质因数分解
    if n < 2:
        factor_map = {}
    else:
        try:
            factor_map = {int(p): int(e) for p, e in sp.factorint(n).items()}
        except Exception as exc:  # noqa: BLE001
            raise ValueError(f"分解失败：{exc}") from exc

    factors = [{"prime": p, "exp": e} for p, e in sorted(factor_map.items())]
    if factors:
        factor_latex = " \\cdot ".join(
            (f"{p}^{{{e}}}" if e > 1 else str(p)) for p, e in sorted(factor_map.items())
        )
    else:
        factor_latex = "1"

    is_prime = bool(sp.isprime(n)) if n >= 2 else False

    # ---- 约数
    divisors = sorted(int(d) for d in sp.divisors(n)) if n >= 1 else []
    divisor_sum = int(sp.divisor_sigma(n)) if n >= 1 else 0
    proper = divisor_sum - n
    aliquot = proper

    classifications = []
    if n > 1:
        if aliquot == n:
            classifications.append("完美数")
        elif aliquot > n:
            classifications.append("盈数")
        else:
            classifications.append("亏数")

    # ---- 数论函数
    phi = int(sp.totient(n)) if n >= 1 else 0
    mu = int(sp.mobius(n)) if n >= 1 else 0
    radical = int(sp.rad(n)) if n >= 1 else 0
    omega = len(factor_map)
    big_omega = sum(factor_map.values()) if factor_map else 0

    # ---- 素数信息
    prime_info = {"is_prime": is_prime}
    if n >= 2:
        if is_prime:
            try:
                prime_info["index"] = int(sp.primepi(n))
            except Exception:  # noqa: BLE001
                pass
            prime_info["prev"] = int(sp.prevprime(n)) if n > 2 else None
            prime_info["next"] = int(sp.nextprime(n))
        else:
            prime_info["prev"] = int(sp.prevprime(n)) if n > 2 else None
            prime_info["next"] = int(sp.nextprime(n))

    # ---- 进制与罗马数字
    bases = {
        "binary": bin(n),
        "octal": oct(n),
        "hex": hex(n),
        "roman": to_roman(n),
    }

    # ---- 数字形态
    digit_values = [int(ch) for ch in digits_text]
    digit_sum = sum(digit_values)
    digital_root = 0 if n == 0 else (1 + (n - 1) % 9)
    digit_freq = {str(d): digit_values.count(d) for d in range(10)}
    is_palindrome = digits_text == digits_text[::-1] and n > 0
    armstrong = False
    if n > 0:
        armstrong = sum(d ** digit_count for d in digit_values) == n
    harshad = n > 0 and digit_sum > 0 and n % digit_sum == 0

    square, square_root = _is_square(n)
    cube, cube_root = _is_cube(n)
    triangular = _triangular_index(n)
    fib_index = _fibonacci_index(n)
    squarefree = mu != 0 if n >= 1 else False

    # ---- 科拉茨
    collatz_info = collatz(n) if n >= 1 else {"steps": 0, "max": n, "sequence": [n], "converged": True}

    # ---- 连分数
    cf = sqrt_continued_fraction(n) if n >= 2 else {"a0": 0, "period": [], "period_len": 0}

    # ---- 哥德巴赫
    gb = goldbach(n)
    if n >= 4 and n % 2 == 0 and gb is None:
        warnings.append("哥德巴赫分解没找到（应当不会发生），可能是数字超出计算范围。")

    # ---- 科普式结论
    if n == 0:
        facts.append({"title": "零", "detail": "0 既不是正数也不是负数，任何数乘 0 都得 0，它也没有质因数分解。"})
    if n == 1:
        facts.append({"title": "一", "detail": "1 既不是素数也不是合数，它是所有整数的约数，也是乘法单位元。"})
    if is_prime:
        facts.append({"title": "素数", "detail": f"{n} 只能被 1 和它自己整除，是数论里的“原子”。"})
    elif n > 1:
        fact_terms = " × ".join(
            (f"{p}^{e}" if e > 1 else str(p)) for p, e in sorted(factor_map.items())
        )
        facts.append({"title": "合数", "detail": f"{n} = {fact_terms}，可以拆成更小的素数相乘。"})
    if len(factors) == 2 and all(e == 1 for _, e in factor_map.items()):
        facts.append({"title": "半素数", "detail": "它恰好是两个不同素数的乘积，这类数在密码学里很常见。"})
    if classifications:
        if classifications[0] == "完美数":
            facts.append({
                "title": "完美数",
                "detail": f"它的真约数之和正好等于它自己：{proper} = {n}。",
            })
        elif classifications[0] == "盈数":
            facts.append({
                "title": "盈数",
                "detail": f"真约数之和 {proper:,} 超过了它本身 {n:,}，多出 {proper - n:,}。",
            })
        else:
            facts.append({
                "title": "亏数",
                "detail": f"真约数之和 {proper:,} 小于它本身 {n:,}。",
            })
    if triangular is not None and n > 2:
        facts.append({"title": "三角数", "detail": f"它可以摆成第 {triangular} 个三角形：1+2+…+{triangular}。"})
    if square and square_root > 1:
        facts.append({"title": "完全平方数", "detail": f"{square_root}² = {n}。"})
    if cube and cube_root > 1:
        facts.append({"title": "完全立方数", "detail": f"{cube_root}³ = {n}。"})
    if is_palindrome and n > 9:
        facts.append({"title": "回文数", "detail": "正着读和倒着读是同一个数。"})
    if armstrong:
        facts.append({"title": "水仙花数", "detail": f"各位数字的 {digit_count} 次方之和等于它自己。"})
    if harshad:
        facts.append({"title": "哈沙德数", "detail": f"它能被各位数字之和 {digit_sum} 整除。"})
    if squarefree and n > 1:
        facts.append({"title": "无平方因子", "detail": "它的质因数分解里没有重复的素数。"})
    if cf["period_len"] > 0:
        head = "[" + str(cf["a0"]) + "; " + ", ".join(str(x) for x in cf["period"][:12])
        if cf["period_len"] > 12:
            head += ", …"
        head += "]"
        facts.append({
            "title": "平方根的连分数",
            "detail": f"√{n} = {head}，循环节长度 {cf['period_len']}。",
        })
    if gb:
        facts.append({
            "title": "哥德巴赫分解",
            "detail": f"{n} = {gb['p']} + {gb['q']}，这样的写法一共有 {gb['count']} 种。",
        })
    if collatz_info["converged"] and n >= 2:
        facts.append({
            "title": "3n+1 轨迹",
            "detail": f"从 {n} 出发，{collatz_info['steps']} 步到达 1，途中最高冲到 {collatz_info['max']:,}。",
        })
    if prime_info.get("next"):
        gap = prime_info["next"] - n
        facts.append({"title": "与相邻素数的距离", "detail": f"下一个素数是 {prime_info['next']:,}，相差 {gap:,}。"})

    return {
        "n": n,
        "digits": digit_count,
        "factorization": factors,
        "factorization_latex": factor_latex,
        "divisors": divisors[:MAX_DIVISORS],
        "divisor_total": len(divisors),
        "divisor_sum": divisor_sum,
        "aliquot_sum": aliquot,
        "abundance": aliquot - n,
        "classifications": classifications,
        "phi": phi,
        "mu": mu,
        "radical": radical,
        "omega": omega,
        "big_omega": big_omega,
        "prime": prime_info,
        "bases": bases,
        "digit_sum": digit_sum,
        "digital_root": digital_root,
        "digit_freq": digit_freq,
        "is_palindrome": is_palindrome,
        "armstrong": armstrong,
        "harshad": harshad,
        "square": square,
        "square_root": square_root if square else None,
        "cube": cube,
        "cube_root": cube_root if cube else None,
        "triangular_index": triangular,
        "fibonacci_index": fib_index,
        "squarefree": squarefree,
        "collatz": collatz_info,
        "sqrt_cf": cf,
        "goldbach": gb,
        "facts": facts,
        "warnings": warnings,
    }


def primes_upto(limit: int) -> list[int]:
    limit = max(2, min(int(limit), 20000))
    return [int(p) for p in sp.primerange(2, limit + 1)]


def _collatz_steps(n: int, cap: int = 1000) -> int:
    steps = 0
    while n != 1 and steps < cap:
        n = n // 2 if n % 2 == 0 else 3 * n + 1
        steps += 1
    return steps


def collatz_steps(n: int, cap: int = 1000) -> int:
    """公开版本：只要步数，不保留轨迹。"""
    return _collatz_steps(n, cap)


def scan(start: int, end: int, top: int = 5) -> dict:
    """扫描一个区间，找素数与间隙、科拉茨步数冠军、约数冠军。"""
    start, end = int(start), int(end)
    if start < 1:
        start = 1
    if end < start:
        raise ValueError("区间的终点必须不小于起点。")
    if end - start > 20000:
        raise ValueError("一次最多扫描 20000 个数，把区间缩小一点。")
    if end > 10**7:
        raise ValueError("上限是 10^7。")

    primes = [int(p) for p in sp.primerange(start, end + 1)]
    gaps = [(a, b - a) for a, b in zip(primes, primes[1:])]
    max_gap = max(gaps, key=lambda item: item[1]) if gaps else None

    collatz_rank = sorted(
        ((_collatz_steps(n), n) for n in range(start, end + 1)), reverse=True
    )[:top]
    tau_rank = sorted(
        ((int(sp.divisor_count(n)), n) for n in range(start, end + 1)), reverse=True
    )[:top]

    perfect = [n for n in range(start, end + 1) if n > 1 and int(sp.divisor_sigma(n)) - n == n]

    return {
        "start": start,
        "end": end,
        "count": end - start + 1,
        "prime": {
            "count": len(primes),
            "density": round(len(primes) / max(end - start + 1, 1), 6),
            "first": primes[:top],
            "last": primes[-top:],
            "max_gap": {"gap": max_gap[1], "after": max_gap[0]} if max_gap else None,
        },
        "gaps": [[g[0], g[1]] for g in gaps][:3000],
        "collatz_top": [{"n": n, "steps": steps} for steps, n in collatz_rank],
        "tau_top": [{"n": n, "tau": tau} for tau, n in tau_rank],
        "perfect": perfect,
    }
