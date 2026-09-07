import { Task } from "../../types";
import { getTaskDependencies } from "../../cpm";
import { IPipelineStage, PipelineContext } from "../contracts";

/**
 * CycleGuardStage:
 * Detects circular dependencies using Kahn's topological sort algorithm.
 * If cycles are found, it safely isolates the circular edges to prevent infinite cascade loops.
 */
export class CycleGuardStage implements IPipelineStage<Task[], Task[]> {
  public readonly name = "CycleGuardStage";

  public process(tasks: Task[], context: PipelineContext): Task[] {
    if (!tasks || tasks.length <= 1) return tasks;

    const liveTasks = tasks.filter((t) => !t._deleted);
    const byId = new Set(liveTasks.map((t) => t.id));
    const inDegree = new Map<string, number>();
    const adj = new Map<string, string[]>();

    liveTasks.forEach((t) => {
      inDegree.set(t.id, 0);
      adj.set(t.id, []);
    });

    liveTasks.forEach((t) => {
      const deps = getTaskDependencies(t).filter((d) => byId.has(d));
      inDegree.set(t.id, deps.length);
      deps.forEach((d) => {
        adj.get(d)?.push(t.id);
      });
    });

    const queue: string[] = [];
    inDegree.forEach((deg, id) => {
      if (deg === 0) queue.push(id);
    });

    let visited = 0;
    while (queue.length > 0) {
      const curr = queue.shift()!;
      visited++;
      const successors = adj.get(curr) || [];
      for (const s of successors) {
        const newDeg = (inDegree.get(s) || 1) - 1;
        inDegree.set(s, newDeg);
        if (newDeg === 0) {
          queue.push(s);
        }
      }
    }

    // If all tasks were visited, graph is acyclic and safe
    if (visited === liveTasks.length) {
      return tasks;
    }

    // Graph contains a cycle! Record diagnostic warning
    context.diagnostics?.push("Circular dependency cycle detected in schedule graph.");

    // If options specify to break cycles automatically, prune edges from nodes with non-zero in-degree
    if (context.options?.breakCycles) {
      return tasks.map((task) => {
        if ((inDegree.get(task.id) || 0) > 0) {
          return { ...task, dependsOn: null };
        }
        return task;
      });
    }

    return tasks;
  }
}
