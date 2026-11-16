"""
Jantt DataFrame & Record Converters
Converts pandas/polars DataFrames and dictionary lists into JanttPlan specifications.
"""

from __future__ import annotations

from typing import Any, Dict, Iterable, List, Mapping, Optional, Union

from .models import JanttPlan, Task

_RETURN_TYPES = ("pandas", "polars", "records")


def from_records(
    records: Iterable[Mapping[str, Any]],
    meta: Optional[Dict[str, Any]] = None,
    categories: Optional[Dict[str, Dict[str, str]]] = None,
) -> JanttPlan:
    """Converts a list of dict records into a JanttPlan.

    Each record may use Jantt keys (``id``, ``label``, ``category``, ``start``, ``end``, ``dependsOn``,
    ``progress``, ``estimatedCost`` ...), their snake_case forms, or common aliases (``name``,
    ``task_id``, ``start_date``, ``finish``, ``predecessors``). Missing values (None, NaN, NaT) are
    ignored, dates are normalized to YYYY-MM-DD, and percentages such as 75 become 0.75.
    Columns that are not part of the Jantt schema are kept as custom ``fields``.
    """
    plan = JanttPlan(meta=dict(meta or {}), categories=dict(categories or {}))
    for i, record in enumerate(records):
        if not isinstance(record, Mapping):
            raise TypeError(f"Record {i} must be a dict, got {type(record).__name__}")
        plan.add_task(Task.from_dict(record, default_id=f"t{i + 1}", row=i))
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
    categories: Optional[Dict[str, Dict[str, str]]] = None,
) -> JanttPlan:
    """
    Converts a pandas or Polars DataFrame (or a list of dicts) into a JanttPlan.

    Columns are discovered by standard names (see ``from_records``). Use the ``*_col`` arguments to
    map differently named columns, e.g. ``from_dataframe(df, start_col="kickoff", end_col="due")``.
    A mapped column that does not exist raises KeyError.
    """
    if hasattr(df, "to_dicts"):  # Polars
        records: List[Mapping[str, Any]] = df.to_dicts()
        columns: Optional[List[Any]] = list(df.columns)
    elif hasattr(df, "to_dict") and hasattr(df, "columns"):  # pandas
        records = df.to_dict(orient="records")
        columns = list(df.columns)
    elif isinstance(df, (list, tuple)):
        records = list(df)
        columns = None
    else:
        raise TypeError(f"Expected pandas/polars DataFrame or list of dicts, got {type(df)}")

    mapping = {
        source: target
        for source, target in (
            (id_col, "id"),
            (label_col, "label"),
            (start_col, "start"),
            (end_col, "end"),
            (category_col, "category"),
            (depends_on_col, "dependsOn"),
        )
        if source
    }
    if mapping:
        if columns is None:
            columns = sorted({key for r in records if isinstance(r, Mapping) for key in r}, key=str)
        missing = [source for source in mapping if source not in columns]
        if missing and records:
            raise KeyError(f"Column(s) {missing} not found; available columns: {[str(c) for c in columns]}")
        records = [_rename_columns(r, mapping) if isinstance(r, Mapping) else r for r in records]

    return from_records(records, meta=meta, categories=categories)


def _rename_columns(record: Mapping[str, Any], mapping: Dict[str, str]) -> Dict[str, Any]:
    # Read every mapped value from the original record, so mappings that swap names
    # (id_col="label", label_col="id") work. A mapped column wins over one already using the target name.
    renamed = {key: value for key, value in record.items() if key not in mapping}
    for source, target in mapping.items():
        renamed[target] = record.get(source)
    return renamed


def to_dataframe(plan: Union[JanttPlan, Dict[str, Any]], return_type: str = "pandas") -> Any:
    """
    Converts a JanttPlan or dict specification to a pandas DataFrame (default), a Polars DataFrame
    (``return_type="polars"``) or the plain list of task dicts (``return_type="records"``).
    Raises ImportError when the requested library is not installed.
    """
    if return_type not in _RETURN_TYPES:
        raise ValueError(f"return_type must be one of {_RETURN_TYPES}, got {return_type!r}")

    plan_dict = plan.to_dict() if isinstance(plan, JanttPlan) else plan
    tasks = list(plan_dict.get("tasks") or [])

    if return_type == "records":
        return tasks

    if return_type == "polars":
        try:
            import polars as pl
        except ImportError as e:
            raise ImportError("polars is required for return_type='polars'. Install it with: pip install \"jantt[polars]\"") from e
        return pl.from_dicts(tasks, infer_schema_length=None)

    try:
        import pandas as pd
    except ImportError as e:
        raise ImportError(
            "pandas is required for to_dataframe(). Install it with: pip install \"jantt[pandas]\", "
            "or pass return_type='records' for a list of dicts."
        ) from e
    return pd.DataFrame(tasks)
