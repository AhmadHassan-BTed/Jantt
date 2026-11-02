"""
Jantt Python Bridge
Universal Python bindings for the Jantt JSON Gantt chart engine.
"""

from .models import Task, JanttPlan
from .converter import from_dataframe, from_records, to_dataframe
from .render import show, to_html, streamlit

__version__ = "1.0.0"

__all__ = [
    "Task",
    "JanttPlan",
    "from_dataframe",
    "from_records",
    "to_dataframe",
    "show",
    "to_html",
    "streamlit",
]
