"""
Jantt Data Models
Specification for Python Gantt chart objects conforming to Jantt JSON Schema.
"""

from __future__ import annotations

import datetime
import json
import math
import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Mapping, Optional, Union

# Accepted input keys for each modeled field, in priority order (Jantt camelCase first).
_ALIASES: Dict[str, tuple] = {
    "id": ("id", "task_id"),
    "label": ("label", "name", "task"),
    "category": ("category", "team", "phase"),
    "start": ("start", "start_date"),
    "end": ("end", "end_date", "finish"),
    "depends_on": ("dependsOn", "depends_on", "predecessors"),
    "progress": ("progress",),
    "milestone": ("milestone",),
    "locked": ("locked",),
    "priority": ("priority",),
    "assignee": ("assignee",),
    "notes": ("notes",),
    "estimated_cost": ("estimatedCost", "estimated_cost"),
    "actual_cost": ("actualCost", "actual_cost"),
    "fields": ("fields",),
}
_ALIAS_KEYS = frozenset(key for keys in _ALIASES.values() for key in keys)

# Jantt task keys the dataclass does not model. They are carried through unchanged (see Task.extra)
# so plan -> DataFrame -> plan round trips are lossless. Any other unknown key becomes a custom field.
_PASSTHROUGH_KEYS = frozenset({
    "wbs", "phase", "status", "urgent", "teamId", "calendar", "calendarId", "gapDays", "minGapDays",
    "baseline", "description", "fieldTimestamps", "updatedAt", "updatedBy", "_deleted", "deletedAt",
    "pert", "optimistic", "pessimistic",
})

_ISO_DATE = re.compile(r"^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:$|[T\s])")
_NAMED_MONTH_FORMATS = ("%d %b %Y", "%d %B %Y", "%b %d %Y", "%B %d %Y", "%b %d, %Y", "%B %d, %Y")
_TRUE_STRINGS = frozenset({"true", "yes", "y", "1", "x"})
_FALSE_STRINGS = frozenset({"false", "no", "n", "0"})


def clean_value(value: Any) -> Any:
    """Returns None for missing-value markers, otherwise the value as a plain Python object.

    Missing markers are None, blank strings, float NaN, pandas NA/NaT and numpy NaN/NaT.
    numpy scalars become Python scalars and numpy arrays become lists.
    """
    if value is None:
        return None
    if isinstance(value, str):
        return value if value.strip() else None
    type_name = type(value).__name__
    if type_name in ("NAType", "NaTType"):
        return None
    if type(value).__module__ == "numpy":
        if type_name == "ndarray":
            return value.tolist()
        if type_name != "datetime64" and getattr(value, "ndim", None) == 0:
            value = value.item()
    if isinstance(value, float):
        return None if math.isnan(value) else value
    try:
        if value != value:  # NaN-like objects (e.g. numpy.datetime64("NaT")) never equal themselves
            return None
    except Exception:  # comparison is ambiguous for some container types: keep the value
        pass
    return value


def _where(row: Optional[int], column: str) -> str:
    return f" in row {row}, column '{column}'" if row is not None else f" in '{column}'"


def format_date(value: Any, where: str = "") -> str:
    """Normalizes a date-like value to 'YYYY-MM-DD' ('' when missing).

    Accepts date/datetime objects (including pandas.Timestamp), numpy.datetime64, Unix timestamps
    in seconds or milliseconds, ISO-style strings ('2026-11-01', '2026/11/01', '2026-11-01T09:00')
    and month-name strings ('1 Nov 2026', 'Nov 1, 2026'). Ambiguous forms such as '11/01/2026'
    raise ValueError instead of being guessed.
    """
    value = clean_value(value)
    if value is None:
        return ""
    if isinstance(value, datetime.datetime):
        return value.strftime("%Y-%m-%d")
    if isinstance(value, datetime.date):
        return value.isoformat()
    if type(value).__name__ == "datetime64":
        return str(value)[:10]
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if abs(value) < 1e9:
            raise ValueError(
                f"Unrecognized date {value!r}{where}; use 'YYYY-MM-DD', a date object, or a Unix timestamp."
            )
        seconds = value / 1000 if abs(value) >= 1e11 else value
        try:
            return datetime.datetime.fromtimestamp(seconds, tz=datetime.timezone.utc).strftime("%Y-%m-%d")
        except (OverflowError, OSError, ValueError):  # e.g. nanosecond epochs or infinity
            raise ValueError(
                f"Unrecognized date {value!r}{where}; Unix timestamps must be in seconds or milliseconds."
            ) from None

    text = str(value).strip()
    match = _ISO_DATE.match(text)
    if match:
        year, month, day = (int(part) for part in match.groups())
        try:
            return datetime.date(year, month, day).isoformat()
        except ValueError as err:
            raise ValueError(f"Invalid date {text!r}{where}: {err}.") from None
    for fmt in _NAMED_MONTH_FORMATS:
        try:
            return datetime.datetime.strptime(text, fmt).date().isoformat()
        except ValueError:
            continue
    raise ValueError(
        f"Unrecognized date {text!r}{where}; use 'YYYY-MM-DD' or pass date/datetime values "
        "(e.g. pandas.to_datetime(df['start']))."
    )


def _to_progress(value: Any, where: str) -> Optional[float]:
    """Progress as a 0.0-1.0 fraction. Percentages (75, '75%') are scaled; out-of-range values are clamped."""
    value = clean_value(value)
    if value is None:
        return None
    percent = False
    if isinstance(value, str):
        text = value.strip()
        percent = text.endswith("%")
        try:
            number = float(text.rstrip("%").strip())
        except ValueError:
            raise ValueError(f"Invalid progress {value!r}{where}; expected a number such as 0.5 or '50%'.") from None
    elif isinstance(value, (int, float)) and not isinstance(value, bool):
        number = float(value)
    else:
        raise ValueError(f"Invalid progress {value!r}{where}; expected a number such as 0.5 or '50%'.")
    if percent or 1 < number <= 100:
        number /= 100
    return min(max(number, 0.0), 1.0)


def _to_bool(value: Any, where: str) -> bool:
    value = clean_value(value)
    if value is None:
        return False
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)) and value in (0, 1):
        return bool(value)
    if isinstance(value, str):
        text = value.strip().lower()
        if text in _TRUE_STRINGS or text in _FALSE_STRINGS:
            return text in _TRUE_STRINGS
    raise ValueError(f"Invalid boolean {value!r}{where}; expected true/false, yes/no or 1/0.")


def _to_number(value: Any, where: str) -> Optional[float]:
    value = clean_value(value)
    if value is None:
        return None
    if isinstance(value, bool):
        raise ValueError(f"Invalid number {value!r}{where}.")
    try:
        return float(value)
    except (TypeError, ValueError):
        raise ValueError(f"Invalid number {value!r}{where}.") from None


def _to_id(value: Any) -> str:
    if isinstance(value, float) and value.is_integer():
        value = int(value)  # integer ids read from a pandas column with gaps arrive as floats
    return str(value).strip()


def _to_dependencies(value: Any) -> Any:
    value = clean_value(value)
    if value is None:
        return None
    if isinstance(value, (list, tuple)):
        items = [clean_value(item) for item in value]
        return [item if isinstance(item, Mapping) else _to_id(item) for item in items if item is not None] or None
    if isinstance(value, Mapping):
        return dict(value)
    return _to_id(value)


def _to_json_value(value: Any) -> Any:
    if isinstance(value, datetime.datetime):
        return value.date().isoformat() if value.time() == datetime.time(0) and value.tzinfo is None else value.isoformat()
    if isinstance(value, datetime.date):
        return value.isoformat()
    return value


@dataclass
class Task:
    id: str
    category: str = "general"
    start: str = ""
    end: str = ""
    label: Optional[str] = None
    name: Optional[str] = None
    depends_on: Optional[Union[str, List[str], List[Dict[str, Any]]]] = None
    progress: Optional[float] = None
    milestone: bool = False
    locked: bool = False
    priority: Optional[str] = None
    assignee: Optional[str] = None
    estimated_cost: Optional[float] = None
    actual_cost: Optional[float] = None
    notes: Optional[str] = None
    fields: Dict[str, Any] = field(default_factory=dict)
    # Other Jantt task keys (status, wbs, baseline, ...) passed through unchanged.
    extra: Dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, record: Mapping[str, Any], default_id: str = "", row: Optional[int] = None) -> "Task":
        """Builds a Task from a Jantt task dict or a DataFrame row.

        Accepts Jantt camelCase keys, snake_case variants and common aliases (``name``, ``task_id``,
        ``start_date``, ``finish``, ``predecessors`` ...). pandas/polars/numpy missing markers count
        as absent. Unknown Jantt keys are kept in ``extra``; any other column becomes a custom field.
        Raises ValueError (naming the row and column) for values that cannot be converted.
        """
        used = set()

        def pick(name: str) -> Any:
            for key in _ALIASES[name]:
                if key in record:
                    value = clean_value(record[key])
                    if value is not None:
                        used.add(key)
                        return value
            return None

        def where(name: str) -> str:
            column = next((key for key in _ALIASES[name] if key in used), _ALIASES[name][0])
            return _where(row, column)

        raw_id = pick("id")
        task_id = _to_id(raw_id) if raw_id is not None else default_id
        if not task_id:
            raise ValueError(f"Task{_where(row, 'id')} has no id.")
        label = pick("label")
        category = pick("category")
        start = format_date(pick("start"), where("start"))
        end = format_date(pick("end"), where("end")) or start
        priority, assignee, notes = pick("priority"), pick("assignee"), pick("notes")

        explicit_fields = pick("fields")
        if explicit_fields is not None and not isinstance(explicit_fields, Mapping):
            raise ValueError(f"Custom fields{where('fields')} must be a dict, got {type(explicit_fields).__name__}.")

        extra: Dict[str, Any] = {}
        custom: Dict[str, Any] = {}
        for key, raw in record.items():
            if key in used:
                continue
            value = clean_value(raw)
            if value is None:
                continue
            if key in _PASSTHROUGH_KEYS:
                extra[key] = _to_json_value(value)
            elif key not in _ALIAS_KEYS:
                custom[str(key)] = _to_json_value(value)
        custom.update(explicit_fields or {})

        return cls(
            id=task_id,
            label=str(label) if label is not None else task_id,
            category=str(category) if category is not None else "general",
            start=start,
            end=end,
            depends_on=_to_dependencies(pick("depends_on")),
            progress=_to_progress(pick("progress"), where("progress")),
            milestone=_to_bool(pick("milestone"), where("milestone")),
            locked=_to_bool(pick("locked"), where("locked")),
            priority=str(priority) if priority is not None else None,
            assignee=str(assignee) if assignee is not None else None,
            estimated_cost=_to_number(pick("estimated_cost"), where("estimated_cost")),
            actual_cost=_to_number(pick("actual_cost"), where("actual_cost")),
            notes=str(notes) if notes is not None else None,
            fields=custom,
            extra=extra,
        )

    def to_dict(self) -> Dict[str, Any]:
        d: Dict[str, Any] = {
            "id": self.id,
            "category": self.category,
            "start": self.start,
            "end": self.end,
        }
        if self.label:
            d["label"] = self.label
        elif self.name:
            d["label"] = self.name
        else:
            d["label"] = self.id

        if self.depends_on is not None:
            d["dependsOn"] = self.depends_on
        if self.progress is not None:
            d["progress"] = self.progress
        if self.milestone:
            d["milestone"] = True
        if self.locked:
            d["locked"] = True
        if self.priority:
            d["priority"] = self.priority
        if self.assignee:
            d["assignee"] = self.assignee
        if self.estimated_cost is not None:
            d["estimatedCost"] = self.estimated_cost
        if self.actual_cost is not None:
            d["actualCost"] = self.actual_cost
        if self.notes:
            d["notes"] = self.notes
        if self.fields:
            d["fields"] = self.fields
        for key, value in self.extra.items():
            d.setdefault(key, value)
        return d


@dataclass
class JanttPlan:
    tasks: List[Task] = field(default_factory=list)
    meta: Dict[str, Any] = field(default_factory=dict)
    categories: Dict[str, Dict[str, str]] = field(default_factory=dict)
    people: List[Dict[str, Any]] = field(default_factory=list)
    teams: List[Dict[str, Any]] = field(default_factory=list)

    def add_task(self, task: Union[Task, Dict[str, Any]]) -> Task:
        if isinstance(task, Task):
            self.tasks.append(task)
            return task
        if isinstance(task, Mapping):
            t = Task.from_dict(task, default_id=f"task_{len(self.tasks) + 1}")
            self.tasks.append(t)
            return t
        raise ValueError(f"Invalid task input: {task}")

    def to_dict(self) -> Dict[str, Any]:
        return {
            "meta": self.meta,
            "categories": self.categories,
            "people": self.people,
            "teams": self.teams,
            "tasks": [t.to_dict() for t in self.tasks],
        }

    def to_json(self, indent: int = 2) -> str:
        # allow_nan=False: NaN/Infinity are not valid JSON and would break JSON.parse in the engine.
        return json.dumps(self.to_dict(), indent=indent, allow_nan=False)
