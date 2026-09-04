# Jantt Algorithms & Mathematical Specifications

This document outlines the core scheduling, graph traversal, and coordinate routing algorithms implemented in `@jantt/core`.

---

## 1. Schedule Cascade & Constraint Resolver

The schedule resolver (`resolveSchedule`) operates as a multi-pass topological relaxation solver that ensures all dependency timing constraints and category pacing rules are satisfied while strictly preserving task durations.

### Pacing Constraints

1. **Explicit Dependency Constraint**:
   For any task $T$ with prerequisite $P = \text{dependsOn}(T)$:
   $$\text{minStart}(T) = P.\text{end} + \text{gapDays}(T)$$
   If $T.\text{start} < \text{minStart}(T)$, $T.\text{start}$ is adjusted to $\text{minStart}(T)$, and $T.\text{end}$ is shifted to maintain duration:
   $$T.\text{end} = T.\text{start} + \text{duration}(T)$$

2. **Implicit Category Pacing Constraint**:
   Tasks within the same category that do not have an explicit `dependsOn` link are sorted chronologically by their initial start date. Each subsequent task $T_i$ is paced after $T_{i-1}$:
   $$T_i.\text{start} \ge T_{i-1}.\text{end} + \text{defaultGapDays}$$

3. **Locked Tasks**:
   Tasks with `locked: true` are fixed reference anchors; their `start` and `end` dates are never mutated.

---

## 2. Critical Path Analysis

The critical path is the continuous sequence of dependent tasks with **zero total float (slack)** that directly determines the earliest possible project completion date.

### Formulation

1. **Forward Pass (Early Dates)**:
   - Early Start ($ES$) and Early Finish ($EF$):
     $$ES(T) = \max_{P \in \text{Prereqs}(T)} \left( EF(P) + \text{gap}(P, T) \right)$$
     $$EF(T) = ES(T) + \text{duration}(T)$$
   - Project Completion Time:
     $$T_{\max} = \max_{T} EF(T)$$

2. **Backward Pass (Late Dates)**:
   - For terminal tasks (tasks with no successors):
     $$LF(T) = T_{\max}$$
   - For predecessor tasks:
     $$LF(T) = \min_{S \in \text{Successors}(T)} \left( LS(S) - \text{gap}(T, S) \right)$$
     $$LS(T) = LF(T) - \text{duration}(T)$$

3. **Total Float (Slack)**:
   $$\text{Slack}(T) = LS(T) - ES(T) = LF(T) - EF(T)$$

4. **Critical Set**:
   $$\text{CriticalTasks} = \{ T \mid \text{Slack}(T) \le 0 \lor T.\text{end} = T_{\max} \}$$

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

