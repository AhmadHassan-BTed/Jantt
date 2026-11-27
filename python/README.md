# jantt (Python)

Universal Python bridge for the **Jantt** JSON Gantt chart engine.

Render interactive, zero-lag timeline Gantt charts directly in **Jupyter Notebooks**, **Streamlit apps**, and HTML with 1-line integration from **pandas** and **Polars** DataFrames.

## Installation

```bash
pip install jantt
```

Or with optional dependencies:

```bash
pip install "jantt[all]"  # includes pandas, polars, ipython, streamlit
```

Requires Python 3.9 or newer.

## Quick Start

### 1. In Jupyter Notebook / Lab

```python
import jantt
import pandas as pd

df = pd.DataFrame([
    {"id": "t1", "label": "Architecture", "category": "dev", "start": "2026-11-01", "end": "2026-11-05"},
    {"id": "t2", "label": "Implementation", "category": "dev", "start": "2026-11-06", "end": "2026-11-15", "depends_on": "t1"},
    {"id": "t3", "label": "QA & Review", "category": "qa", "start": "2026-11-16", "end": "2026-11-20", "depends_on": "t2"},
])

# Renders an interactive Jantt Gantt chart in the notebook cell
jantt.show(df, height="500px", theme="dark")
```

### 2. In Streamlit

```python
import streamlit as st
import jantt

st.title("Project Milestone Tracker")

data = [
    {"id": "s1", "label": "Sprint 1", "category": "dev", "start": "2026-11-01", "end": "2026-11-14"},
    {"id": "s2", "label": "Sprint 2", "category": "dev", "start": "2026-11-15", "end": "2026-11-28", "depends_on": "s1"},
]

jantt.streamlit(data, height=550, theme="nordic-frost")
```

### 3. Generate Standalone Interactive HTML

```python
import jantt

html_str = jantt.to_html(my_dataframe, theme="midnight-rose", standalone=True)
with open("timeline.html", "w", encoding="utf-8") as f:
    f.write(html_str)
```

## Mapping your columns

`from_dataframe()` (used automatically by `show`, `streamlit` and `to_html`) recognizes the Jantt keys and common aliases:

| Jantt field | Accepted columns |
| :--- | :--- |
| `id` | `id`, `task_id` |
| `label` | `label`, `name`, `task` |
| `category` | `category`, `team`, `phase` |
| `start` / `end` | `start`, `start_date` / `end`, `end_date`, `finish` |
| `dependsOn` | `dependsOn`, `depends_on`, `predecessors` |
| other | `progress`, `milestone`, `locked`, `priority`, `assignee`, `notes`, `estimatedCost` / `estimated_cost`, `actualCost` / `actual_cost`, `fields` |

Use the `*_col` arguments when your columns are named differently:

```python
plan = jantt.from_dataframe(df, id_col="code", label_col="title", start_col="kickoff", end_col="due",
                            category_col="stream", depends_on_col="after")
jantt.show(plan)
```

Conversion rules:

- Missing cells (`None`, `NaN`, `NaT`, blank strings) are treated as absent, never as values.
- Dates may be `date`/`datetime`/`pandas.Timestamp` values, Unix timestamps, or strings such as `2026-11-01`, `2026/11/01`, or `1 Nov 2026`. Ambiguous strings like `11/01/2026` raise a `ValueError` naming the row and column; convert them first with `pandas.to_datetime(...)`.
- `progress` accepts fractions (`0.75`) or percentages (`75`, `"75%"`).
- Columns that are not part of the Jantt schema are kept as custom `fields` on each task.
- `to_dataframe(plan)` returns a pandas DataFrame; pass `return_type="polars"` or `return_type="records"` for a Polars DataFrame or a list of dicts. `from_dataframe(to_dataframe(plan))` gives back the same tasks.

## Themes

`theme` accepts any name in `jantt.THEMES`: `light` (default), `dark`, `nordic-frost`, `cyber-emerald`, `midnight-rose`, `sunset-crimson`, `beenie`. Unknown names raise a `ValueError`.

## How the chart is loaded

Pass `locale="zh-CN"` to `jantt.to_html`, `jantt.show`, or `jantt.streamlit` to render the chart in Simplified Chinese. The default is `en`.

The rendered HTML loads the Jantt engine from unpkg (`@jantt/standalone`), pinned to the same version as this package; pass `cdn_version="x.y.z"` to pin another release. The viewer needs network access to unpkg.com. If the engine cannot be loaded within about 10 seconds (offline, blocked by a proxy or content security policy), the chart area shows an error message instead of staying blank.

Plan data is embedded with HTML-safe escaping, so labels and notes from untrusted DataFrames cannot inject markup or scripts into the notebook or Streamlit page.

## License

MIT © Ahmad Hassan
