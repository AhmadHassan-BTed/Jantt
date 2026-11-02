"""
Jantt Interactive Renderer
Renders Jantt timelines inside Jupyter Notebooks, Streamlit apps, or standalone HTML files.
"""

from __future__ import annotations
import json
import uuid
from typing import Any, Dict, Optional, Union
from .models import JanttPlan
from .converter import from_dataframe


def to_html(
    plan_or_df: Any,
    height: str = "600px",
    theme: str = "zinc",
    standalone: bool = True,
    cdn_version: str = "1.0.0",
) -> str:
    """
    Renders an interactive HTML snippet with the complete Jantt Gantt chart engine.
    """
    if isinstance(plan_or_df, JanttPlan):
        plan_dict = plan_or_df.to_dict()
    elif isinstance(plan_or_df, dict):
        plan_dict = plan_or_df
    else:
        plan_dict = from_dataframe(plan_or_df).to_dict()

    plan_json = json.dumps(plan_dict)
    container_id = f"jantt_container_{uuid.uuid4().hex[:8]}"

    html_content = f"""
<div id="{container_id}" style="width: 100%; height: {height}; min-height: 400px; border-radius: 8px; overflow: hidden; background: #ffffff;"></div>
<link rel="stylesheet" href="https://unpkg.com/@jantt/standalone@{cdn_version}/dist/style.css">
<script src="https://unpkg.com/@jantt/standalone@{cdn_version}/dist/jantt.standalone.iife.js"></script>
<script>
(function() {{
  function initChart() {{
    var container = document.getElementById("{container_id}");
    if (!container) return;
    if (typeof window.Jantt !== "undefined" && typeof window.Jantt.mount === "function") {{
      window.Jantt.mount(container, {plan_json}, {{
        themeClassName: "jantt-theme-{theme}",
        autoCascade: true
      }});
    }} else {{
      setTimeout(initChart, 50);
    }}
  }}
  if (document.readyState === "complete" || document.readyState === "interactive") {{
    initChart();
  }} else {{
    document.addEventListener("DOMContentLoaded", initChart);
  }}
}})();
</script>
"""

    if standalone:
        return f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>{plan_dict.get('meta', {}).get('title', 'Jantt Timeline')}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body {{ margin: 0; padding: 16px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }}
  </style>
</head>
<body>
{html_content}
</body>
</html>"""

    return html_content


def show(
    plan_or_df: Any,
    height: str = "600px",
    theme: str = "zinc",
) -> Any:
    """
    Displays an interactive Jantt Gantt chart in a JupyterLab / IPython notebook.
    """
    html = to_html(plan_or_df, height=height, theme=theme, standalone=False)
    try:
        from IPython.display import HTML  # type: ignore
        return HTML(html)
    except ImportError:
        return html


def streamlit(
    plan_or_df: Any,
    height: int = 600,
    theme: str = "zinc",
) -> Any:
    """
    Renders an interactive Jantt Gantt chart inside a Streamlit application.
    """
    try:
        import streamlit.components.v1 as components  # type: ignore
        html = to_html(plan_or_df, height=f"{height}px", theme=theme, standalone=False)
        return components.html(html, height=height, scrolling=True)
    except ImportError as e:
        raise ImportError("Streamlit is required to use jantt.streamlit(). Run: pip install streamlit") from e
