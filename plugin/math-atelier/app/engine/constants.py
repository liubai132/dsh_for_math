"""数学常数：用 mpmath 算到任意位数。"""

from __future__ import annotations

import mpmath as mp

CONSTANTS = {
    "pi": ("圆周率 π", lambda: mp.pi, "圆周长与直径之比，3.14159…"),
    "e": ("自然常数 e", lambda: mp.e, "复利与增长的极限，2.71828…"),
    "phi": ("黄金比例 φ", lambda: (1 + mp.sqrt(5)) / 2, "1.61803…，满足 φ² = φ + 1"),
    "sqrt2": ("根号 2", lambda: mp.sqrt(2), "第一个被发现的无理数，1.41421…"),
    "gamma": ("欧拉常数 γ", lambda: mp.euler, "调和级数与对数的差，0.57721…"),
    "catalan": ("卡塔兰常数 G", lambda: mp.catalan, "0.91596…"),
    "ln2": ("自然对数 ln 2", lambda: mp.log(2), "0.69314…"),
    "zeta3": ("阿佩里常数 ζ(3)", lambda: mp.zeta(3), "1.20205…"),
    "khinchin": ("辛钦常数 K", lambda: getattr(mp, "khinchin", mp.mpf("2.6854520010")), "2.68545…"),
}

DEFAULT_DIGITS = 120
MAX_DIGITS = 2000


def digits_of(name: str, count: int = DEFAULT_DIGITS) -> dict:
    if name not in CONSTANTS:
        raise KeyError(name)
    count = max(10, min(int(count), MAX_DIGITS))
    label, maker, blurb = CONSTANTS[name]
    mp.mp.dps = count + 20
    value = maker()
    text = mp.nstr(value, count + 1, strip_zeros=False)
    if "e" in text.lower():
        text = mp.nstr(value, count + 1)

    whole, _, frac = text.partition(".")
    frac = (frac + "0" * count)[:count]
    groups = [frac[i:i + 10] for i in range(0, len(frac), 10)]

    freq = {str(d): frac.count(str(d)) for d in range(10)}
    return {
        "name": name,
        "label": label,
        "blurb": blurb,
        "digits": count,
        "value": f"{whole}.{frac}",
        "whole": whole,
        "fraction": frac,
        "groups": groups,
        "digit_freq": freq,
        "latex": f"{whole}.{frac}",
    }


def catalogue() -> list[dict]:
    return [{"name": key, "label": value[0], "blurb": value[2]} for key, value in CONSTANTS.items()]


def render_latex(name: str) -> str:
    """给前端一个简短符号。"""
    symbols = {
        "pi": r"\pi",
        "e": "e",
        "phi": r"\varphi",
        "sqrt2": r"\sqrt{2}",
        "gamma": r"\gamma",
        "catalan": "G",
        "ln2": r"\ln 2",
        "zeta3": r"\zeta(3)",
        "khinchin": "K_0",
    }
    return symbols.get(name, name)
