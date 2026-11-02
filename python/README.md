# jantt (Python)

Universal Python bridge for the **Jantt** JSON Gantt chart engine.

Render interactive, zero-lag timeline Gantt charts directly in **Jupyter Notebooks**, **Streamlit apps**, and HTML with 1-line integration from **pandas** and **Polars** DataFrames.

## Installation

```bash
pip install jantt
```

Or with optional dependencies:

```bash
pip install "jantt[all]"  # includes pandas, ipython, streamlit
```

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
jantt.show(df, height="500px", theme="zinc")
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

jantt.streamlit(data, height=550, theme="slate")
```

### 3. Generate Standalone Interactive HTML

```python
import jantt

html_str = jantt.to_html(my_dataframe, theme="amber", standalone=True)
with open("timeline.html", "w") as f:
    f.write(html_str)
```

## License

MIT © Ahmad Hassan
