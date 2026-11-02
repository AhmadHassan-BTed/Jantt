"""
Jantt DataFrame & Record Converters
Converts pandas/polars DataFrames and dictionary lists into JanttPlan specifications.
"""

from __future__ import annotations
import datetime
from typing import Any, Dict, List, Optional, Union
from .models import JanttPlan, Task


def _format_date(val: Any) -> str:
    if val is None or (isinstance(val, float) and str(val) == "nan"):
        return ""
    if isinstance(val, (datetime.date, datetime.datetime)):
        return val.strftime("%Y-%m-%d")
    # String or timestamp
    s = str(val).split("T")[0].split(" ")[0].strip()
    return s


def from_records(
    records: List[Dict[str, Any]],
    meta: Optional[Dict[str, Any]] = None,
    categories: Optional[Dict[str, Dict[str, str]]] = None,
) -> JanttPlan:
    """Converts a list of dict records into a JanttPlan."""
    plan = JanttPlan(meta=meta or {}, categories=categories or {})
    for i, r in enumerate(records):
        task_id = str(r.get("id") or r.get("task_id") or f"t{i + 1}")
        label = r.get("label") or r.get("name") or r.get("task") or task_id
        category = str(r.get("category") or r.get("team") or r.get("phase") or "general")
        start = _format_date(r.get("start") or r.get("start_date"))
        end = _format_date(r.get("end") or r.get("end_date") or r.get("finish") or start)
        depends_on = r.get("dependsOn") or r.get("depends_on") or r.get("predecessors")

        task = Task(
            id=task_id,
            label=label,
            category=category,
            start=start,
            end=end,
            depends_on=depends_on,
            progress=float(r["progress"]) if "progress" in r and r["progress"] is not None else None,
            milestone=bool(r.get("milestone", False)),
            locked=bool(r.get("locked", False)),
            priority=r.get("priority"),
            assignee=r.get("assignee"),
            notes=r.get("notes"),
        )
        plan.add_task(task)
    return plan


def from_dataframe(
    df: Any,
    id_col: Optional[str] = None,
    label_col: Optional[str] = None,
    start_col: Optional[str] = None,
    end_col: Optional[str] = None,
    category_col: Optional[str] = None,
    depends_on_col: Optional[str] = None,
    meta: Optional[Dict[str, Any]] = None,
) -> JanttPlan:
    """
    Converts a pandas or Polars DataFrame into a JanttPlan.
    Intelligently discovers columns by standard naming heuristics.
    """
    # Polars DataFrame detection
    if hasattr(df, "to_dicts"):
        records = df.to_dicts()
        return from_records(records, meta=meta)

    # Pandas DataFrame detection
    if hasattr(df, "to_dict"):
        records = df.to_dict(orient="records")
        return from_records(records, meta=meta)

    # Fallback if list of dicts passed
    if isinstance(df, list):
        return from_records(df, meta=meta)

    raise TypeError(f"Expected pandas/polars DataFrame or list of dicts, got {type(df)}")


def to_dataframe(plan: Union[JanttPlan, Dict[str, Any]], return_type: str = "pandas") -> Any:
    """
    Converts a JanttPlan or dict specification back to a pandas or Polars DataFrame.
    """
    plan_dict = plan.to_dict() if isinstance(plan, JanttPlan) else plan
    tasks = plan_dict.get("tasks", [])

    if return_type == "polars":
        try:
            import polars as pl
            return pl.DataFrame(tasks)
        except ImportError:
            pass

    try:
        import pandas as pd
        return pd.DataFrame(tasks)
    except ImportError:
        # Fallback to list of dicts if pandas is not installed
        return tasks
