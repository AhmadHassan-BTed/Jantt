"""
Unit tests for Jantt Python Bridge.
"""

import unittest
from jantt import Task, JanttPlan, from_records, from_dataframe, to_dataframe, to_html


class TestJanttPython(unittest.TestCase):
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

    def test_from_records_converter(self):
        records = [
            {"id": "t1", "name": "Task 1", "category": "dev", "start": "2026-11-01", "end": "2026-11-04"},
            {"id": "t2", "name": "Task 2", "category": "qa", "start": "2026-11-05", "end": "2026-11-08", "depends_on": "t1"},
        ]
        plan = from_records(records)
        self.assertEqual(len(plan.tasks), 2)
        self.assertEqual(plan.tasks[1].depends_on, "t1")

    def test_to_html_rendering(self):
        records = [
            {"id": "t1", "label": "Setup", "category": "dev", "start": "2026-11-01", "end": "2026-11-03"}
        ]
        html = to_html(records, theme="zinc", height="500px", standalone=True)
        self.assertIn("<!DOCTYPE html>", html)
        self.assertIn("https://unpkg.com/@jantt/standalone@1.0.0", html)
        self.assertIn("jantt-theme-zinc", html)
        self.assertIn("window.Jantt.mount", html)


if __name__ == "__main__":
    unittest.main()
