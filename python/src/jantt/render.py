"""
Jantt Interactive Renderer
Renders Jantt timelines inside Jupyter Notebooks, Streamlit apps, or standalone HTML files.
"""

from __future__ import annotations

import html
import json
import math
import numbers
import re
import uuid
import warnings
from typing import Any, Dict, Mapping, Optional, Union

from .models import JanttPlan
from .converter import from_dataframe

#: Theme names understood by the Jantt engine (each maps to a ``jantt-theme-<name>`` CSS class).
THEMES = ("light", "dark", "nordic-frost", "cyber-emerald", "midnight-rose", "sunset-crimson", "beenie")

# Names shown in early README examples. They never matched an engine theme, so they always
# rendered with the light defaults; keep accepting them (with a warning) instead of breaking callers.
_LEGACY_THEMES = {"zinc": "light", "slate": "light", "amber": "light"}

_CSS_LENGTH = re.compile(r"^\d+(\.\d+)?(px|%|vh|vw|em|rem)$")
_CDN_VERSION = re.compile(r"^[0-9A-Za-z][0-9A-Za-z.+-]*$")
_CDN_BASE = "https://unpkg.com/@jantt/standalone@{version}/dist/"
_POLL_INTERVAL_MS = 50
_LOAD_TIMEOUT_MS = 10000

_MOUNT_SCRIPT = """
(function () {
  var config = __CONFIG__;
  var attempts = 0;
  var maxAttempts = __MAX_ATTEMPTS__;
  function initChart() {
    var container = document.getElementById(config.containerId);
    if (!container) return;
    var api = window.Jantt && (window.Jantt.default || window.Jantt);
    if (api && typeof api.mount === "function") {
      try {
        api.mount(container, config.plan, { themeClassName: config.themeClassName, autoCascade: true, locale: config.locale });
      } catch (err) {
        container.textContent = config.renderError + (err && err.message ? err.message : err);
      }
    } else if (++attempts < maxAttempts) {
      setTimeout(initChart, __POLL_MS__);
    } else {
      container.textContent = config.loadError;
    }
  }
  if (document.readyState === "complete" || document.readyState === "interactive") {
    initChart();
  } else {
    document.addEventListener("DOMContentLoaded", initChart);
  }
})();
"""


def _script_json(value: Any) -> str:
    """Serializes ``value`` as JSON that is safe to embed inside an HTML <script> element."""
    try:
        text = json.dumps(value, allow_nan=False)  # ensure_ascii (the default) also escapes U+2028/U+2029
    except ValueError as e:
        raise ValueError(
            "The plan contains NaN or infinite numbers, which are not valid JSON. Clean the data first, "
            "or build the plan with jantt.from_dataframe(), which drops missing values."
        ) from e
    return text.replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026")


def _resolve_theme(theme: str) -> str:
    if theme in THEMES:
        return theme
    if theme in _LEGACY_THEMES:
        warnings.warn(
            f"theme={theme!r} is not a Jantt engine theme; using 'light'. Valid themes: {', '.join(THEMES)}.",
            FutureWarning,
            stacklevel=3,
        )
        return _LEGACY_THEMES[theme]
    raise ValueError(f"Unknown theme {theme!r}. Valid themes: {', '.join(THEMES)}.")


def _css_height(height: Union[str, int, float]) -> str:
    if isinstance(height, numbers.Real) and not isinstance(height, bool):  # includes numpy numbers
        if not math.isfinite(height) or height <= 0:
            raise ValueError(f"height must be a positive number of pixels, got {height!r}")
        return f"{float(height):g}px"
    text = str(height).strip()
    if not _CSS_LENGTH.match(text):
        raise ValueError(f"Invalid height {height!r}; use a number of pixels or a CSS length such as '600px', '80vh' or '100%'.")
    return text


def _plan_dict(plan_or_df: Any) -> Dict[str, Any]:
    if isinstance(plan_or_df, JanttPlan):
        return plan_or_df.to_dict()
    if isinstance(plan_or_df, Mapping):
        return dict(plan_or_df)
    return from_dataframe(plan_or_df).to_dict()


def to_html(
    plan_or_df: Any,
    height: Union[str, int] = "600px",
    theme: str = "light",
    standalone: bool = True,
    cdn_version: Optional[str] = None,
    locale: str = "en",
) -> str:
    """
    Renders an interactive HTML snippet with the complete Jantt Gantt chart engine.

    ``height`` is a CSS length ('600px', '80vh', '100%') or a number of pixels. ``theme`` is one of
    ``jantt.THEMES``. ``cdn_version`` pins the @jantt/standalone release loaded from unpkg and
    defaults to this package's version. Pass ``locale="zh-CN"`` for a Simplified Chinese chart.
    """
    from . import __version__

    plan_dict = _plan_dict(plan_or_df)
    theme_class = f"jantt-theme-{_resolve_theme(theme)}"
    css_height = _css_height(height)
    version = cdn_version or __version__
    if not _CDN_VERSION.match(version):
        raise ValueError(f"Invalid cdn_version {version!r}; expected a version such as '1.1.0'.")

    base = _CDN_BASE.format(version=version)
    script_url = base + "jantt.standalone.iife.js"
    # Releases ship dist/style.css; Vite 8 builds made without build.lib.cssFileName emit dist/standalone.css.
    css_url, css_fallback_url = base + "style.css", base + "standalone.css"
    container_id = f"jantt_container_{uuid.uuid4().hex[:8]}"

    requested_locale = locale.strip().lower()
    use_chinese = requested_locale in ("zh", "zh-cn", "zh-hans") or requested_locale.startswith("zh-hans-")
    chart_locale = "zh-CN" if use_chinese else "en"
    config = {
        "containerId": container_id,
        "plan": plan_dict,
        "themeClassName": theme_class,
        "scriptUrl": script_url,
        "locale": chart_locale,
        "renderError": "Jantt 无法渲染此计划：" if use_chinese else "Jantt could not render this plan: ",
        "loadError": (
            f"无法从 {script_url} 加载 Jantt。请检查网络连接、代理或内容安全策略。"
            if use_chinese
            else f"Failed to load the Jantt engine from {script_url}. Check your network connection, proxy, or content security policy."
        ),
    }
    mount_script = (
        _MOUNT_SCRIPT.replace("__CONFIG__", _script_json(config))
        .replace("__MAX_ATTEMPTS__", str(_LOAD_TIMEOUT_MS // _POLL_INTERVAL_MS))
        .replace("__POLL_MS__", str(_POLL_INTERVAL_MS))
    )

    html_content = f"""
<div id="{container_id}" lang="{chart_locale}" style="width: 100%; height: {css_height}; min-height: 400px; border-radius: 8px; overflow: hidden; background: #ffffff;"></div>
<link rel="stylesheet" href="{html.escape(css_url)}" crossorigin="anonymous" onerror="this.onerror=null;this.href='{html.escape(css_fallback_url)}';">
<script src="{html.escape(script_url)}" crossorigin="anonymous"></script>
<script>{mount_script}</script>
"""

    if standalone:
        title = html.escape(str((plan_dict.get("meta") or {}).get("title") or ("Jantt 时间轴" if use_chinese else "Jantt Timeline")))
        return f"""<!DOCTYPE html>
<html lang="{chart_locale}">
<head>
  <meta charset="utf-8">
  <title>{title}</title>
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
    height: Union[str, int] = "600px",
    theme: str = "light",
    locale: str = "en",
) -> Any:
    """
    Displays an interactive Jantt Gantt chart in a JupyterLab / IPython notebook.
    """
    html_snippet = to_html(plan_or_df, height=height, theme=theme, standalone=False, locale=locale)
    try:
        from IPython.display import HTML  # type: ignore
        return HTML(html_snippet)
    except ImportError:
        return html_snippet


def streamlit(
    plan_or_df: Any,
    height: int = 600,
    theme: str = "light",
    locale: str = "en",
) -> Any:
    """
    Renders an interactive Jantt Gantt chart inside a Streamlit application. ``height`` is in pixels.
    """
    try:
        import streamlit.components.v1 as components  # type: ignore
    except ImportError as e:
        raise ImportError("Streamlit is required to use jantt.streamlit(). Run: pip install streamlit") from e
    if isinstance(height, bool) or not isinstance(height, numbers.Integral) or height <= 0:
        raise ValueError(f"height must be a positive number of pixels, got {height!r}")
    height = int(height)  # numpy integers -> int for Streamlit
    html_snippet = to_html(plan_or_df, height=height, theme=theme, standalone=False, locale=locale)
    return components.html(html_snippet, height=height, scrolling=True)
