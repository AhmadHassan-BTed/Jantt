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
