# Jantt Algorithms & Mathematical Specifications

This document outlines the core scheduling, graph traversal, and coordinate routing algorithms implemented in `@jantt/core`.

---

## 1. Schedule Cascade & Constraint Resolver

The schedule resolver (`resolveSchedule`, and `CascadeResolveStage` inside `SchedulePipeline`) moves every unlocked task to the **earliest start its dependencies allow**, preserving its duration. It never moves a task earlier, and it never moves a task that has no dependencies: there is no implicit pacing between tasks that merely share a category.

### Dates and durations

- Dates are whole UTC days in `YYYY-MM-DD` form.
- $\text{dur}(T) = T.\text{end} - T.\text{start}$ in days; a task with `milestone: true` has $\text{dur} = 0$ (its finish is its start).
- Bars are drawn through the end day (the end date is inclusive on screen), so a finish-to-start link with gap $g$ leaves $g - 1$ empty days between two bars. The default gap of 2 leaves one free day.

### Dependency graph

Built once per run by `buildDependencyGraph` (shared with the CPM, the cycle guard and the validator):

1. Live tasks only (`_deleted` tombstones are skipped). If an id is duplicated, the first occurrence is scheduled and later copies are returned unchanged (with a diagnostic).
2. Each `dependsOn` is parsed once. Links to unknown ids and self-links are ignored. A token that exactly matches an existing id is always read as that id (so `"model-3d"` is not misread as `"model"` with a 3-day lead).
3. Strongly connected components are found with an iterative Tarjan pass. Links **inside** a cycle cannot be satisfied: they are ignored and reported in the diagnostics, while links into and out of a cycle are still honored. This keeps cyclic plans stable instead of pushing them further into the future on every edit.
4. The resolver relaxes all tasks in a **single pass in topological order**: $O(V + E)$, deterministic and idempotent (resolving the result again changes nothing), whatever the order of the input array.

### Link constraints

For predecessor $P$, successor $T$ and effective lag $L$:

| Type | Constraint | Earliest start of $T$ |
|---|---|---|
| FS (finish-to-start) | $T.\text{start} \ge P.\text{finish} + L$ | $P.\text{finish} + L$ |
| SS (start-to-start) | $T.\text{start} \ge P.\text{start} + L$ | $P.\text{start} + L$ |
| FF (finish-to-finish) | $T.\text{finish} \ge P.\text{finish} + L$ | $P.\text{finish} + L - \text{dur}(T)$ |
| SF (start-to-finish) | $T.\text{finish} \ge P.\text{start} + L$ | $P.\text{start} + L - \text{dur}(T)$ |

**Lag rule.** A lag written on the link wins, including an explicit zero (`"A:FS+0"`, `{ "id": "A", "lag": 0 }`). Without one, FS links use the successor's gap, $\text{gap}(T) = T.\text{gapDays} \;??\; T.\text{minGapDays} \;??\; \text{meta.defaultGapDays} \;??\; 2$, and SS/FF/SF links use 0. Lags are whole days, clamped to ±3650.

$$\text{minStart}(T) = \max_{\text{links } P \to T} \text{earliestStart}(P, T)$$

If $T.\text{start} < \text{minStart}(T)$, then $T.\text{start} := \text{minStart}(T)$ and $T.\text{end} := T.\text{start} + \text{dur}(T)$.

### Working calendars

When working days are enabled (`meta.useWorkingDays`, or a project `meta.calendar`), or when a task has its own `calendar` / `calendarId`, the same constraints are evaluated with working-day arithmetic on the task's calendar, resolved as task → assignee (person) → project → Monday-Friday. Statutory holidays (US federal, UK/GB England & Wales, EU, CA federal, AU national) include weekend substitute days, and calendars are compiled once and cached.

### Locked tasks, Strict mode and bad data

- **Locked tasks** (`locked: true`) are never moved. If a dependency now requires a later start, a `DEP_TIMING_CONFLICT` diagnostic is emitted (and `validate()` reports a warning).
- **Strict mode** (`autoCascade: false`) returns unchanged copies; `validate()` then reports every violated link as a warning.
- Tasks with invalid dates are neither moved nor used as constraints, and are reported.

---

## 2. Critical Path Analysis

`calculateCriticalPath` runs on the same graph with the **same lag rule, default gap, and working-calendar rules** as the cascade (pass `meta.defaultGapDays` and calendar options; the default gap is 2), so it agrees with the dates the cascade produced. Without a working calendar, arithmetic runs on integer calendar days.

### Formulation

1. **Forward Pass (Early Dates)**, in topological order:
   $$ES(T) = \max\Big(T.\text{start},\; \max_{P \to T} \text{earliestStart}(P, T)\Big), \qquad EF(T) = ES(T) + \text{dur}(T)$$
   where `earliestStart` is the table above evaluated with $ES(P)$ / $EF(P)$. Project early finish: $T_E = \max_T EF(T)$.

2. **Backward Pass (Late Dates)**, in reverse order. The late-finish reference is $T_L = $ `targetDate` when it is a valid date (invalid values are ignored with a warning), otherwise $T_E$:
   $$LF(P) = \min\Big(T_L,\; \min_{P \to S} \text{latestFinish}(P, S)\Big), \qquad LS(P) = LF(P) - \text{dur}(P)$$
   with $\text{latestFinish}$ = $LS(S) - L$ (FS), $LS(S) - L + \text{dur}(P)$ (SS), $LF(S) - L$ (FF), $LF(S) - L + \text{dur}(P)$ (SF).

3. **Total Float**: $TF(T) = LS(T) - ES(T)$. **Free Float**: the smallest slack to any successor link, clamped to $[0, TF(T)]$ (equal to $TF$ for terminal tasks).

4. **Critical Set**: $\{\, T \mid TF(T) \le 0 \;\lor\; TF(T) = \min_U TF(U) \,\}$. With a target later than $T_E$ the minimum float is positive, the longest chain is still critical and its label reads "Critical · Nd to deadline".

5. **Near-Critical**: not critical and $TF(T) - \max(\min_U TF(U), 0) \le$ `nearCriticalThresholdDays` (default 3).

6. **Critical links** connect two critical tasks where the link drives the successor's early start. **Critical paths** are enumerated along critical links (iterative, capped at 25 paths, with a warning when truncated).

CPM uses each task's resolved working calendar for duration and float when a calendar applies (following the same activation rules as the cascade: `meta.useWorkingDays`, a project `meta.calendar`, or a task's own `calendar` / `calendarId`). Dependency lags use the successor's calendar. Tasks without a working calendar use calendar days. Across mixed calendars with positive deadline slack, criticality is determined from a tight longest-path pass anchored at $T_E$ so heterogeneous working-day floats never split a driving chain. Links inside a cycle are ignored here as well, so cyclic input never crashes and every task still gets finite metrics.

### PERT risk (`calculatePertRisk`)

Each task's three-point estimate comes from `getTaskPertBounds`, the same reader Monte Carlo uses: `task.pert` / `fields.pert`, `fields.optimisticDuration` / `mostLikelyDuration` / `pessimisticDuration`, or `optimistic` / `mostLikely` / `pessimistic`, defaulting to $O = 0.8d$, $M = d$, $P = 1.35d$ of the planned duration $d$. Milestones on the path add neither duration nor variance. Per task, $\mu = (O + 4M + P)/6$ and $\sigma^2 = ((P - O)/6)^2$. Among the critical paths, the one with the largest variance is used:

$$\text{expectedFinish} = EF(\text{last}) + \sum \mu - \sum d, \qquad z = \frac{\text{target} - \text{expectedFinish}}{\sqrt{\sum \sigma^2}}$$

The on-time probability is $\Phi(z)$, measured against `targetDate`, or against the planned finish $T_E$ when no target is given. The expected duration keeps the gaps and lags along the path.

---

## 3. 90-Degree Orthogonal Step Line Router

Dependency connector paths are generated using crisp 90-degree orthogonal step lines:

```
Case A: Forward Flow (toX >= fromX + 28px)

 (fromX, fromY) ─────────┐ (midX, fromY)
                         │
                         │ (midX, toY)
                         └────────► (toX, toY)

 Path: M fromX fromY L midX fromY L midX toY L toX toY
```

```
Case B: Reverse / Lane Bypass Flow (toX < fromX + 28px)

 (fromX, fromY) ────┐ (fromX + 14, fromY)
                    │
 (toX - 14, midY) ┌─┘ (fromX + 14, midY)
                  │
                  └───────► (toX, toY)

 Path: M fromX fromY L (fromX+14) fromY L (fromX+14) midY L (toX-14) midY L (toX-14) toY L toX toY
```

---

## 4. Cursor-Anchored Zoom Transformation

When expanding or contracting the timeline (via Ctrl+Wheel, zoom slider, or column header drag), Jantt guarantees that the exact calendar date or column beneath the mouse pointer remains stationary:

1. **Mouse Content Coordinate**:
   $$X_{\text{mouse}} = \text{clientX} - \text{bodyRect.left}$$
   $$X_{\text{content}} = X_{\text{mouse}} + \text{bodyWrap.scrollLeft}$$

2. **Scale Ratio Calculation**:
   $$\text{ratio} = \frac{\text{newDayWidth}}{\text{prevDayWidth}}$$

3. **New Scroll Anchor**:
   $$\text{newScrollLeft} = \max\left(0, X_{\text{content}} \times \text{ratio} - X_{\text{mouse}}\right)$$

This mathematical transform completely eliminates visual jumping and orientation loss during zooming.

---

## 5. Assignee & Owner Auto-Discovery Engine

To support zero-friction import of raw schedule plans (e.g. from AI models, spreadsheets, or student pipelines), Jantt implements an automated entity inference engine:

1. **Scanning**:
   - Extract primary candidate/lead from `data.meta.person` $\to$ default role `"Project Lead / Owner"`.
   - Extract all unique non-empty string values from `data.tasks[].assignee`.
   - Extract all unique non-empty string values from `data.documents[].owner`.

2. **Deduplication & Slug Generation**:
   - Normalize names case-insensitively.
   - Generate URL-safe kebab slugs: $\text{slug} = \text{toLowerCase}(name) \to \text{regex replace } [^a-z0-9]+ \to -$.
   - Cross-check against explicit entries in `data.people[]`.

3. **Avatar & Metadata Assignment**:
   - Discovered members not in `data.people[]` are tagged `isInferred: true`.
   - Stable deterministic color assignment from the curated 8-color palette:
     $$\text{color} = \text{PALETTE}[\text{index} \pmod 8]$$
   - Discovered members immediately populate member filters, Kanban squad cards, and the People Manager modal with 1-click JSON persistence.

