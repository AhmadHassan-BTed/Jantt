"""
Unit tests for Jantt Python Bridge.
"""

import datetime
import json
import sys
import warnings
from pathlib import Path

# Add src to sys.path so tests run seamlessly in both monorepo and standalone
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

import unittest

import jantt
from jantt import THEMES, Task, JanttPlan, from_records, from_dataframe, to_dataframe, to_html

try:
    import pandas as pd
except ImportError:  # pragma: no cover - optional dependency
    pd = None

try:
    import polars as pl
except ImportError:  # pragma: no cover - optional dependency
    pl = None

NAN = float("nan")


def strict_loads(text):
    """json.loads that rejects NaN/Infinity, like JavaScript's JSON.parse."""
    def reject(token):
        raise ValueError(f"invalid JSON constant {token}")
    return json.loads(text, parse_constant=reject)


def mounted_config(html):
    """Extracts the JSON config passed to the browser-side mount script."""
    start = html.index("var config = ") + len("var config = ")
    end = html.index(";\n", start)
    return json.loads(html[start:end])


class TestModels(unittest.TestCase):
    def test_task_model_to_dict(self):
        task = Task(
            id="t1",
            label="Backend Architecture",
            category="dev",
            start="2026-11-01",
            end="2026-11-05",
            depends_on="t0",
            progress=0.75,
            priority="high",
        )
        d = task.to_dict()
        self.assertEqual(d["id"], "t1")
        self.assertEqual(d["label"], "Backend Architecture")
        self.assertEqual(d["category"], "dev")
        self.assertEqual(d["start"], "2026-11-01")
        self.assertEqual(d["end"], "2026-11-05")
        self.assertEqual(d["dependsOn"], "t0")
        self.assertEqual(d["progress"], 0.75)
        self.assertEqual(d["priority"], "high")

    def test_plan_add_task_and_json(self):
        plan = JanttPlan(meta={"title": "Q4 Engineering Plan"})
        t1 = plan.add_task({
            "id": "t1",
            "label": "Design Spec",
            "category": "design",
            "start": "2026-11-01",
            "end": "2026-11-04",
        })
        self.assertEqual(t1.id, "t1")
        self.assertEqual(len(plan.tasks), 1)

        json_str = plan.to_json()
        self.assertIn("Q4 Engineering Plan", json_str)
        self.assertIn("Design Spec", json_str)

    def test_add_task_dict_keeps_costs_fields_locked_and_notes(self):
        plan = JanttPlan()
        source = {
            "id": "t1", "category": "dev", "start": "2026-11-01", "end": "2026-11-04",
            "locked": True, "notes": "Vendor gate", "estimatedCost": 1200, "actualCost": 900.5,
            "fields": {"owner": "Sam"}, "status": "in-progress", "baseline": {"start": "2026-10-30", "end": "2026-11-03"},
        }
        d = plan.add_task(source).to_dict()
        for key in ("locked", "notes", "estimatedCost", "actualCost", "fields", "status", "baseline"):
            self.assertEqual(d[key], source[key], key)

    def test_to_json_rejects_nan(self):
        plan = JanttPlan(tasks=[Task(id="t1", progress=NAN)])
        with self.assertRaises(ValueError):
            plan.to_json()


class TestRecordConversion(unittest.TestCase):
    def test_from_records_converter(self):
        records = [
            {"id": "t1", "name": "Task 1", "category": "dev", "start": "2026-11-01", "end": "2026-11-04"},
            {"id": "t2", "name": "Task 2", "category": "qa", "start": "2026-11-05", "end": "2026-11-08", "depends_on": "t1"},
        ]
        plan = from_records(records)
        self.assertEqual(len(plan.tasks), 2)
        self.assertEqual(plan.tasks[1].depends_on, "t1")

    def test_nan_cells_are_treated_as_missing(self):
        records = [{
            "id": "t1", "label": NAN, "category": "dev", "start": "2026-11-01", "end": "2026-11-04",
            "depends_on": NAN, "milestone": NAN, "locked": NAN, "priority": NAN, "assignee": NAN,
            "notes": NAN, "progress": NAN,
        }]
        task = from_records(records).tasks[0]
        self.assertIsNone(task.depends_on)
        self.assertFalse(task.milestone)
        self.assertFalse(task.locked)
        self.assertEqual(task.label, "t1")
        d = strict_loads(from_records(records).to_json())["tasks"][0]
        for key in ("dependsOn", "milestone", "locked", "priority", "assignee", "notes", "progress"):
            self.assertNotIn(key, d)

    def test_ids_keep_zero_and_drop_float_noise(self):
        plan = from_records([
            {"id": 0, "category": "dev", "start": "2026-11-01", "end": "2026-11-02"},
            {"id": 3.0, "category": "dev", "start": "2026-11-01", "end": "2026-11-02", "dependsOn": 0},
            {"id": NAN, "category": "dev", "start": "2026-11-01", "end": "2026-11-02"},
        ])
        self.assertEqual([t.id for t in plan.tasks], ["0", "3", "t3"])
        self.assertEqual(plan.tasks[1].depends_on, "0")

    def test_progress_is_normalized_to_a_fraction(self):
        rows = [0.3, 75, "50%", 150, -2, "1"]
        plan = from_records([
            {"id": f"t{i}", "category": "dev", "start": "2026-11-01", "end": "2026-11-02", "progress": p}
            for i, p in enumerate(rows)
        ])
        self.assertEqual([t.progress for t in plan.tasks], [0.3, 0.75, 0.5, 1.0, 0.0, 1.0])

    def test_dates_are_normalized(self):
        values = [
            datetime.date(2026, 11, 1),
            datetime.datetime(2026, 11, 1, 9, 30),
            "2026/11/01",
            "2026-11-01T08:00:00Z",
            "1 Nov 2026",
            "Nov 1, 2026",
            1793491200000,  # 2026-11-01T00:00:00Z in milliseconds
            1793491200,
        ]
        plan = from_records([
            {"id": f"t{i}", "category": "dev", "start": v} for i, v in enumerate(values)
        ])
        self.assertEqual({t.start for t in plan.tasks}, {"2026-11-01"})
        self.assertEqual({t.end for t in plan.tasks}, {"2026-11-01"})

    def test_ambiguous_or_invalid_dates_raise_with_location(self):
        with self.assertRaises(ValueError) as ctx:
            from_records([
                {"id": "a", "category": "dev", "start": "2026-11-01"},
                {"id": "b", "category": "dev", "start": "11/01/2026"},
            ])
        self.assertIn("row 1", str(ctx.exception))
        self.assertIn("'start'", str(ctx.exception))
        with self.assertRaises(ValueError):
            from_records([{"id": "c", "category": "dev", "start": "2026-02-30"}])
        with self.assertRaises(ValueError) as ctx:  # nanosecond epoch: out of range, not a crash
            from_records([{"id": "d", "category": "dev", "start": 1793491200000000000}])
        self.assertIn("seconds or milliseconds", str(ctx.exception))

    def test_column_mapping_can_swap_names(self):
        plan = from_dataframe(
            [{"id": "Build", "label": "t1", "category": "dev", "start": "2026-11-01"}],
            id_col="label", label_col="id",
        )
        self.assertEqual((plan.tasks[0].id, plan.tasks[0].label), ("t1", "Build"))

    def test_booleans_are_parsed_strictly(self):
        plan = from_records([
            {"id": "a", "category": "dev", "start": "2026-11-01", "milestone": "yes", "locked": 0},
            {"id": "b", "category": "dev", "start": "2026-11-01", "milestone": "FALSE", "locked": True},
        ])
        self.assertEqual([(t.milestone, t.locked) for t in plan.tasks], [(True, False), (False, True)])
        with self.assertRaises(ValueError):
            from_records([{"id": "c", "category": "dev", "start": "2026-11-01", "milestone": "maybe"}])

    def test_unknown_columns_become_custom_fields(self):
        task = from_records([{
            "id": "a", "category": "dev", "start": "2026-11-01", "owner_email": "sam@example.com",
            "risk": NAN, "wbs": "1.2",
        }]).tasks[0]
        self.assertEqual(task.fields, {"owner_email": "sam@example.com"})
        self.assertEqual(task.to_dict()["wbs"], "1.2")

    def test_plan_round_trip_through_records_is_lossless(self):
        original = {
            "meta": {"title": "Round trip"},
            "categories": {"dev": {"label": "Dev", "color": "#3B82F6"}},
            "people": [],
            "teams": [],
            "tasks": [
                {
                    "id": "t1", "category": "dev", "start": "2026-11-01", "end": "2026-11-05", "label": "Build",
                    "progress": 0.5, "locked": True, "estimatedCost": 1000.0, "actualCost": 250.0,
                    "notes": "Note", "fields": {"owner": "Sam"}, "status": "in-progress",
                },
                {
                    "id": "t2", "category": "dev", "start": "2026-11-06", "end": "2026-11-06", "label": "Ship",
                    "dependsOn": ["t1"], "milestone": True,
                },
            ],
        }
        records = to_dataframe(original, return_type="records")
        rebuilt = from_records(records, meta=original["meta"], categories=original["categories"]).to_dict()
        self.assertEqual(rebuilt, original)

    def test_to_dataframe_validates_return_type(self):
        with self.assertRaises(ValueError):
            to_dataframe({"tasks": []}, return_type="excel")


class TestRendering(unittest.TestCase):
    records = [{"id": "t1", "label": "Setup", "category": "dev", "start": "2026-11-01", "end": "2026-11-03"}]

    def test_to_html_rendering(self):
        html = to_html(self.records, theme="dark", height="500px", standalone=True)
        self.assertIn("<!DOCTYPE html>", html)
        self.assertIn(f"https://unpkg.com/@jantt/standalone@{jantt.__version__}/dist/jantt.standalone.iife.js", html)
        self.assertIn("jantt-theme-dark", html)
        self.assertIn("api.mount", html)
        self.assertIn("height: 500px", html)

    def test_default_theme_is_a_real_engine_theme(self):
        self.assertIn("jantt-theme-light", to_html(self.records))
        self.assertIn("light", THEMES)

    def test_legacy_theme_names_warn_and_fall_back(self):
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            html = to_html(self.records, theme="zinc")
        self.assertIn("jantt-theme-light", html)
        self.assertTrue(any(issubclass(w.category, FutureWarning) for w in caught))

    def test_unknown_theme_raises(self):
        with self.assertRaises(ValueError) as ctx:
            to_html(self.records, theme='x"; alert(1); "')
        self.assertIn("nordic-frost", str(ctx.exception))

    def test_plan_data_cannot_break_out_of_the_script(self):
        payload = "</script><img src=x onerror=alert(1)>"
        html = to_html([{**self.records[0], "label": payload}], standalone=False)
        self.assertNotIn(payload, html)
        self.assertNotIn("</script><img", html)
        self.assertEqual(mounted_config(html)["plan"]["tasks"][0]["label"], payload)

    def test_title_is_escaped_and_missing_meta_is_tolerated(self):
        html = to_html({"meta": {"title": "<b>Q4</b> & more"}, "tasks": []})
        self.assertIn("<title>&lt;b&gt;Q4&lt;/b&gt; &amp; more</title>", html)
        self.assertIn("<title>Jantt Timeline</title>", to_html({"meta": None, "tasks": []}))

    def test_height_is_validated(self):
        self.assertIn("height: 450px", to_html(self.records, height=450))
        self.assertIn("height: 80vh", to_html(self.records, height="80vh"))
        with self.assertRaises(ValueError):
            to_html(self.records, height="500px; background:url(x)")
        with self.assertRaises(ValueError):
            to_html(self.records, height=float("nan"))

    def test_cdn_version_is_validated(self):
        self.assertIn("@jantt/standalone@1.0.0/", to_html(self.records, cdn_version="1.0.0"))
        with self.assertRaises(ValueError):
            to_html(self.records, cdn_version='1.0.0"><script>alert(1)</script>')

    def test_stylesheet_falls_back_to_vite8_name_and_loading_gives_up(self):
        html = to_html(self.records)
        self.assertIn("/dist/style.css", html)
        self.assertIn("/dist/standalone.css", html)
        self.assertIn('crossorigin="anonymous"', html)
        self.assertIn("Failed to load the Jantt engine", html)
        self.assertIn("var maxAttempts = 200;", html)

    def test_nan_in_raw_plan_dict_fails_fast(self):
        with self.assertRaises(ValueError):
            to_html({"tasks": [{"id": "a", "progress": NAN}]})


@unittest.skipUnless(pd is not None, "pandas is not installed")
class TestPandas(unittest.TestCase):
    def test_readme_dataframe_with_gaps_produces_valid_json(self):
        df = pd.DataFrame([
            {"id": "t1", "label": "Architecture", "category": "dev", "start": "2026-11-01", "end": "2026-11-05"},
            {"id": "t2", "label": "Implementation", "category": "dev", "start": "2026-11-06", "end": "2026-11-15", "depends_on": "t1", "milestone": True},
        ])
        data = strict_loads(from_dataframe(df).to_json())
        t1, t2 = data["tasks"]
        self.assertNotIn("dependsOn", t1)
        self.assertNotIn("milestone", t1)
        self.assertEqual(t2["dependsOn"], "t1")
        self.assertTrue(t2["milestone"])

    def test_datetime_columns_and_nat(self):
        df = pd.DataFrame({
            "id": ["a", "b"],
            "category": ["dev", "dev"],
            "start": pd.to_datetime(["2026-11-01", None]),
            "end": pd.to_datetime(["2026-11-03", "2026-11-09"]),
        })
        a, b = from_dataframe(df).tasks
        self.assertEqual((a.start, a.end), ("2026-11-01", "2026-11-03"))
        self.assertEqual((b.start, b.end), ("", "2026-11-09"))

    def test_column_mapping_arguments_are_applied(self):
        df = pd.DataFrame({
            "code": ["A1", "A2"],
            "title": ["Plan", "Build"],
            "kickoff": ["2026-11-01", "2026-11-04"],
            "due": ["2026-11-03", "2026-11-08"],
            "stream": ["ops", "dev"],
            "after": [None, "A1"],
        })
        plan = from_dataframe(
            df, id_col="code", label_col="title", start_col="kickoff", end_col="due",
            category_col="stream", depends_on_col="after", categories={"dev": {"label": "Dev"}},
        )
        first, second = plan.tasks
        self.assertEqual((first.id, first.label, first.start, first.end, first.category), ("A1", "Plan", "2026-11-01", "2026-11-03", "ops"))
        self.assertEqual(second.depends_on, "A1")
        self.assertIsNone(first.depends_on)
        self.assertEqual(first.fields, {})
        self.assertEqual(plan.categories, {"dev": {"label": "Dev"}})

    def test_numpy_height_is_accepted(self):
        import numpy as np
        self.assertIn("height: 480px", to_html([{"id": "a", "category": "dev", "start": "2026-11-01"}], height=np.int64(480)))

    def test_missing_mapped_column_raises(self):
        df = pd.DataFrame({"id": ["a"], "start": ["2026-11-01"]})
        with self.assertRaises(KeyError):
            from_dataframe(df, start_col="kickoff")

    def test_dataframe_round_trip_keeps_costs_and_fields(self):
        plan = JanttPlan(tasks=[
            Task(id="t1", category="dev", start="2026-11-01", end="2026-11-02", estimated_cost=500.0, fields={"owner": "Sam"}, locked=True),
            Task(id="t2", category="dev", start="2026-11-03", end="2026-11-04", depends_on="t1", notes="Ship it"),
        ])
        df = to_dataframe(plan)
        self.assertIsInstance(df, pd.DataFrame)
        self.assertEqual(from_dataframe(df).to_dict()["tasks"], plan.to_dict()["tasks"])


@unittest.skipUnless(pl is not None, "polars is not installed")
class TestPolars(unittest.TestCase):
    def test_polars_round_trip(self):
        plan = from_records([
            {"id": "a", "category": "dev", "start": "2026-11-01", "end": "2026-11-02"},
            {"id": "b", "category": "dev", "start": "2026-11-03", "end": "2026-11-04", "dependsOn": "a"},
        ])
        df = to_dataframe(plan, return_type="polars")
        self.assertIsInstance(df, pl.DataFrame)
        self.assertEqual(from_dataframe(df).to_dict()["tasks"], plan.to_dict()["tasks"])


class TestPackaging(unittest.TestCase):
    def test_version_matches_monorepo_release(self):
        package_json = Path(__file__).resolve().parents[2] / "package.json"
        if not package_json.exists():
            self.skipTest("not running inside the Jantt monorepo")
        self.assertEqual(jantt.__version__, json.loads(package_json.read_text(encoding="utf-8"))["version"])


if __name__ == "__main__":
    unittest.main()
