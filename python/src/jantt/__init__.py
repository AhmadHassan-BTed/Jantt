"""
Jantt Python Bridge
Universal Python bindings for the Jantt JSON Gantt chart engine.
"""

# Single source of truth for the package version: pyproject.toml reads it via
# [tool.setuptools.dynamic], and to_html() uses it as the default CDN engine version.
__version__ = "1.1.0"

from .models import Task, JanttPlan
from .converter import from_dataframe, from_records, to_dataframe
from .render import THEMES, show, to_html, streamlit

__all__ = [
    "Task",
    "JanttPlan",
    "THEMES",
    "from_dataframe",
    "from_records",
    "to_dataframe",
    "show",
    "to_html",
    "streamlit",
]
