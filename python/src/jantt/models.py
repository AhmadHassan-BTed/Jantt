"""
Jantt Data Models
Specification for Python Gantt chart objects conforming to Jantt JSON Schema.
"""

from __future__ import annotations
import json
from dataclasses import dataclass, field, asdict
from typing import Any, Dict, List, Optional, Union


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
        return d


@dataclass
class JanttPlan:
    tasks: List[Task] = field(default_factory=list)
    meta: Dict[str, Any] = field(default_factory=dict)
    categories: Dict[str, Dict[str, str]] = field(default_factory=dict)
    people: List[Dict[str, Any]] = field(default_factory=list)
    teams: List[Dict[str, Any]] = field(default_factory=list)

    def add_task(self, task: Union[Task, Dict[str, Any]]) -> Task:
        if isinstance(task, dict):
            t = Task(
                id=str(task.get("id", f"task_{len(self.tasks) + 1}")),
                label=task.get("label") or task.get("name") or task.get("id"),
                category=str(task.get("category", "general")),
                start=str(task.get("start", "")),
                end=str(task.get("end", "")),
                depends_on=task.get("dependsOn") or task.get("depends_on"),
                progress=task.get("progress"),
                milestone=bool(task.get("milestone", False)),
                priority=task.get("priority"),
                assignee=task.get("assignee"),
            )
            self.tasks.append(t)
            return t
        elif isinstance(task, Task):
            self.tasks.append(task)
            return task
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
        return json.dumps(self.to_dict(), indent=indent)
