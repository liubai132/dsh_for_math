"""引擎与接口的单元测试。

    python -m unittest discover -s tests -v
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient  # noqa: E402

from app.api import app  # noqa: E402
from app.engine import cas, constants, interp, numbers  # noqa: E402
from app.engine.safety import ParseError  # noqa: E402


class SafetyTests(unittest.TestCase):
    def test_rejects_dunder_and_import(self):
        for bad in ["__import__('os')", "eval('1')", "open('x')", "1 if 1 else 2"]:
            with self.assertRaises(ParseError):
                cas.simplify(bad)

    def test_rejects_garbage(self):
        with self.assertRaises(ParseError):
            cas.simplify("x + ")
        with self.assertRaises(ParseError):
            cas.simplify("")

    def test_accepts_unicode_operators(self):
        result = cas.simplify("2×3 + 4")
        self.assertEqual(result["result_text"], "10")


class CasTests(unittest.TestCase):
    def test_simplify(self):
        self.assertEqual(cas.simplify("x + x")["result_text"], "2*x")

    def test_expand(self):
        self.assertIn("x**2 + 2*x + 1", cas.expand("(x+1)^2")["result_text"])

    def test_factor_integer(self):
        result = cas.factor("2^10 - 1")
        self.assertIn("3", result["result_text"])

    def test_solve(self):
        result = cas.solve("x^2 - 4 = 0")
        self.assertIn("-2", result["result_text"])
        self.assertIn("2", result["result_text"])

    def test_second_derivative(self):
        result = cas.diff("x^3", order=2)
        self.assertEqual(result["result_text"], "6*x")

    def test_definite_integral(self):
        result = cas.integrate("x^2", lower="0", upper="1")
        self.assertIn(r"\frac{1}{3}", result["result_latex"])

    def test_limit(self):
        self.assertEqual(cas.limit("sin(x)/x", point="0")["result_text"], "1")

    def test_series(self):
        result = cas.series("exp(x)", order=4)
        self.assertIn(r"\frac{x^{3}}{6}", result["result_latex"])

    def test_matrix_det(self):
        self.assertEqual(cas.matrix("1,2;3,4", op="det")["result_text"], "-2")

    def test_matrix_inverse_rejects_singular(self):
        with self.assertRaises(ParseError):
            cas.matrix("1,2;2,4", op="inv")

    def test_plot_samples(self):
        result = cas.plot("sin(x)", -3, 3)
        self.assertGreater(len(result["points"]), 100)
        self.assertEqual(result["operation"], "plot")

    def test_unknown_operation(self):
        with self.assertRaises(ParseError):
            cas.run("nonsense", {"expr": "x"})


class NumberTests(unittest.TestCase):
    def test_1729(self):
        data = numbers.analyze(1729)
        self.assertEqual(data["divisor_total"], 8)
        self.assertEqual(data["phi"], 1296)
        self.assertEqual(data["factorization_latex"], "7 \\cdot 13 \\cdot 19")
        self.assertTrue(data["squarefree"])

    def test_perfect_number(self):
        self.assertIn("完美数", numbers.analyze(496)["classifications"])

    def test_collatz(self):
        self.assertEqual(numbers.collatz(27)["steps"], 111)

    def test_scan(self):
        data = numbers.scan(1, 2000)
        self.assertEqual(data["prime"]["count"], 303)
        self.assertEqual(data["prime"]["max_gap"]["gap"], 34)
        self.assertEqual(data["perfect"], [6, 28, 496])

    def test_scan_range_guard(self):
        with self.assertRaises(ValueError):
            numbers.scan(1, 10**7)

    def test_small_numbers_do_not_crash(self):
        for n in (0, 1, 2):
            self.assertEqual(numbers.analyze(n)["n"], n)

    def test_roman(self):
        self.assertEqual(numbers.analyze(2024)["bases"]["roman"], "MMXXIV")


class ConstantTests(unittest.TestCase):
    def test_pi_digits(self):
        data = constants.digits_of("pi", 30)
        self.assertTrue(data["value"].startswith("3.1415926535"))
        self.assertEqual(len(data["fraction"]), 30)

    def test_unknown_constant(self):
        with self.assertRaises(KeyError):
            constants.digits_of("nope", 10)


class InterpTests(unittest.TestCase):
    def test_oneway_endpoints(self):
        data = interp.trajectory([0, 0], [4, 3], frames=21, mode="oneway")
        self.assertEqual(data["frames"][0]["point"], [0.0, 0.0])
        self.assertEqual(data["frames"][-1]["point"], [4.0, 3.0])
        self.assertAlmostEqual(data["length"], 5.0)

    def test_roundtrip_returns(self):
        data = interp.trajectory([0, 0], [4, 3], frames=21)
        self.assertEqual(data["frames"][0]["point"], data["frames"][-1]["point"])
        self.assertEqual(data["frames"][10]["point"], [4.0, 3.0])

    def test_convex_combination_midpoint(self):
        mid = interp.convex_combination([0, 0], [4, 3], 0.5)
        self.assertEqual(mid, [2.0, 1.5])

    def test_rejects_degenerate_or_short(self):
        with self.assertRaises(ValueError):
            interp.trajectory([1, 1], [1, 1])
        with self.assertRaises(ValueError):
            interp.trajectory([0, 0], [1, 1], frames=2)
        with self.assertRaises(ValueError):
            interp.trajectory([0, 0], [1, 1, 2, 3])

    def test_on_segment(self):
        result = interp.is_convex_combination([0, 0], [4, 0], [2, 0])
        self.assertTrue(result["on_segment"])
        self.assertAlmostEqual(result["lambda"], 0.5)

    def test_api(self):
        client = TestClient(app)
        response = client.post("/api/interp", json={"a": [0, 0], "b": [4, 3], "frames": 9})
        self.assertEqual(response.status_code, 200)
        self.assertAlmostEqual(response.json()["length"], 5.0)

    def test_curve_kinds(self):
        for kind in ("linear", "arc", "bezier", "wave", "spiral"):
            data = interp.curve(kind, [0, 0], [4, 3], frames=9, mode="oneway")
            self.assertEqual(data["kind"], kind)
            self.assertEqual(len(data["frames"]), 9)

    def test_arc_is_circular(self):
        data = interp.curve("arc", [0, 0], [4, 0], frames=21, mode="oneway", bulge=0.5)
        points = [frame["point"] for frame in data["frames"]]
        mid = points[10]
        self.assertGreater(abs(mid[1]), 0.5)
        # 三个不共线的点确定一个圆，验证中间点也在同一圆上
        (x1, y1), (x2, y2), (x3, y3) = points[0], points[10], points[-1]
        d = 2 * (x1 * (y2 - y3) + x2 * (y3 - y1) + x3 * (y1 - y2))
        ux = ((x1**2 + y1**2) * (y2 - y3) + (x2**2 + y2**2) * (y3 - y1) + (x3**2 + y3**2) * (y1 - y2)) / d
        uy = ((x1**2 + y1**2) * (x3 - x2) + (x2**2 + y2**2) * (x1 - x3) + (x3**2 + y3**2) * (x2 - x1)) / d
        radius = ((x1 - ux) ** 2 + (y1 - uy) ** 2) ** 0.5
        for x, y in points[::4]:
            self.assertAlmostEqual(((x - ux) ** 2 + (y - uy) ** 2) ** 0.5, radius, places=5)

    def test_slerp_stays_on_unit_circle(self):
        for t in (0, 0.25, 0.5, 1):
            point = interp.slerp([1, 0], [0, 1], t)
            self.assertAlmostEqual((point[0] ** 2 + point[1] ** 2) ** 0.5, 1.0, places=9)

    def test_curve_api(self):
        client = TestClient(app)
        response = client.post("/api/interp/curve", json={"kind": "arc", "a": [0, 0], "b": [4, 3]})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["kind"], "arc")

    def test_uniform_steps_are_equal(self):
        data = interp.curve("bezier", [0, 0], [4, 3], frames=25, mode="oneway", uniform=True)
        steps = [b["s"] - a["s"] for a, b in zip(data["frames"], data["frames"][1:])]
        self.assertLess(max(steps) - min(steps), 1e-3)

    def test_path_length_at_least_chord(self):
        for kind in ("linear", "arc", "bezier", "wave"):
            data = interp.curve(kind, [0, 0], [4, 3], frames=60)
            self.assertGreaterEqual(data["path_length"], data["chord_length"] - 1e-6)

    def test_integrate_trapezoid_error(self):
        from app.engine import integrate

        result = integrate.integrate('x**2', 0.0, 1.0, 100, 'trapezoid')
        self.assertAlmostEqual(result['value'], 1 / 3, places=4)
        self.assertLess(result['error'], 2e-5)

    def test_integrate_simpson_exact_on_quadratic(self):
        from app.engine import integrate

        result = integrate.integrate('x**2', 0.0, 1.0, 10, 'simpson')
        self.assertAlmostEqual(result['value'], 1 / 3, places=10)

    def test_integrate_convergence_orders(self):
        from app.engine import integrate

        table = integrate.order_table('sin(x)', 0.0, 3.141592653589793, [16, 32, 64])
        last = table['rows'][-1]
        self.assertAlmostEqual(last['trapezoidOrder'], 2.0, places=1)
        self.assertAlmostEqual(last['simpsonOrder'], 4.0, places=1)

    def test_integrate_rejects_odd_simpson(self):
        from app.engine import integrate

        with self.assertRaises(ValueError):
            integrate.integrate('x', 0.0, 1.0, 7, 'simpson')

    def test_integrate_api(self):
        client = TestClient(app)
        response = client.post('/api/integrate', json={'expression': 'x**2', 'a': 0, 'b': 1, 'n': 100})
        self.assertEqual(response.status_code, 200)
        self.assertAlmostEqual(response.json()['value'], 1 / 3, places=3)
        table = client.post('/api/integrate/table', json={'expression': 'x**2', 'a': 0, 'b': 1, 'ns': [8, 16, 32]})
        self.assertEqual(table.status_code, 200)
        self.assertEqual(len(table.json()['rows']), 3)

    def test_phase_oscillator_equilibrium(self):
        from app.engine import phase

        data = phase.portrait('oscillator', {'xmin': -2, 'xmax': 2, 'ymin': -2, 'ymax': 2}, grid=9)
        self.assertEqual(len(data['equilibria']), 1)
        point = data['equilibria'][0]
        self.assertAlmostEqual(point['x'], 0.0, places=5)
        self.assertEqual(point['kind'], '焦点')
        self.assertTrue(point['stable'])

    def test_phase_saddle_classification(self):
        from app.engine import phase

        data = phase.portrait('saddle', {'xmin': -2, 'xmax': 2, 'ymin': -2, 'ymax': 2}, grid=7)
        kinds = [p['kind'] for p in data['equilibria']]
        self.assertIn('鞍点', kinds)

    def test_phase_lotka_center(self):
        from app.engine import phase

        data = phase.portrait('lotka', {'xmin': 0.2, 'xmax': 3, 'ymin': 0.2, 'ymax': 3}, grid=7)
        kinds = [p['kind'] for p in data['equilibria']]
        self.assertIn('中心', kinds)

    def test_phase_trajectory_methods(self):
        from app.engine import phase

        euler = phase.trajectory('saddle', [1.0, 1.0], t_end=1.0, dt=0.01, method='euler')
        rk4 = phase.trajectory('saddle', [1.0, 1.0], t_end=1.0, dt=0.01, method='rk4')
        self.assertGreater(len(euler['points']), 2)
        self.assertGreater(len(rk4['points']), 2)

    def test_phase_api(self):
        client = TestClient(app)
        response = client.get('/api/phase/systems')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()['systems'])
        response = client.post('/api/phase/portrait', json={'system': 'oscillator'})
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()['arrows'])

    def test_fold_cross_section_is_isometric(self):
        from app.engine import fold

        data = fold.fold_cross_section(18, 0.215, 3)
        self.assertAlmostEqual(data['segment_chord'], data['visible_width'], places=6)
        self.assertAlmostEqual(data['fabric_ratio'], 3.0, places=6)
        self.assertGreater(data['depth'], 0.0)

    def test_fold_depth_grows_with_fewer_pleats(self):
        from app.engine import fold

        coarse = fold.fold_cross_section(12, 0.215, 3)['depth']
        fine = fold.fold_cross_section(24, 0.215, 3)['depth']
        self.assertGreater(coarse, fine)

    def test_fit_radius_from_fabric(self):
        from app.engine import fold

        data = fold.fit_radius(18, 2.0, 3)
        self.assertAlmostEqual(data['fabric_length'], 2.0, places=6)
        self.assertGreater(data['radius'], 0.0)

    def test_fold_api(self):
        client = TestClient(app)
        response = client.post('/api/fold/skirt', json={'pleats': 18, 'radius': 0.215})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['pleats'], 18)

    def test_resample_closed_keeps_spacing(self):
        square = [[0, 0], [1, 0], [1, 1], [0, 1]]
        out = interp.resample_closed(square, 40)
        self.assertEqual(len(out), 40)
        steps = [interp.distance(out[i], out[(i + 1) % 40]) for i in range(40)]
        self.assertLess(max(steps) - min(steps), 1e-6)

    def test_morph_polygons_midpoint(self):
        a = [[0, 0], [1, 0], [1, 1], [0, 1]]
        b = [[0, 0], [2, 0], [2, 2], [0, 2]]
        mid = interp.morph_polygons(a, b, 0.5)
        self.assertEqual(mid[1], [1.5, 0.0])

    def test_shapes_prepare_same_count(self):
        from app.engine import shapes

        data = shapes.prepare('shirt', 'dress', count=64)
        self.assertEqual(len(data['a']), 64)
        self.assertEqual(len(data['b']), 64)
        self.assertGreater(data['perimeter_a'], 0)

    def test_linear_length_ratio_is_one(self):
        data = interp.curve("linear", [0, 0], [4, 3], frames=20)
        self.assertAlmostEqual(data["length_ratio"], 1.0, places=5)


class ApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def test_health(self):
        response = self.client.get("/api/health")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["ok"])

    def test_number_endpoint(self):
        response = self.client.get("/api/number/97")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["prime"]["is_prime"])

    def test_number_rejects_text(self):
        self.assertEqual(self.client.get("/api/number/abc").status_code, 400)

    def test_cas_bad_input(self):
        response = self.client.post("/api/cas", json={"op": "simplify", "expr": "__import__"})
        self.assertEqual(response.status_code, 400)

    def test_cas_ok(self):
        response = self.client.post(
            "/api/cas", json={"op": "diff", "expr": "x^2", "var": "x"}
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("2 x", response.json()["result_latex"])

    def test_scan_endpoint(self):
        response = self.client.get("/api/scan?start=1&end=100")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["prime"]["count"], 25)


if __name__ == "__main__":
    unittest.main(verbosity=2)
