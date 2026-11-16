import { Task } from "../../types";
import { buildDependencyGraph, filterDependsOn } from "../../dependencies";
import { IPipelineStage, PipelineContext } from "../contracts";

/**
 * CycleGuardStage:
 * Detects circular dependencies (strongly connected components of the dependency graph, plus
 * self references) and reports each one in the diagnostics.
 * With `options.breakCycles`, it removes only the links that lie inside a cycle; links into or
 * out of a cycle, and every other link, are kept exactly as written. Each removed link is
 * recorded in the diagnostics.
 */
export class CycleGuardStage implements IPipelineStage<Task[], Task[]> {
  public readonly name = "CycleGuardStage";

  public process(tasks: Task[], context: PipelineContext): Task[] {
    if (!Array.isArray(tasks) || tasks.length === 0) return tasks;

    const graph = buildDependencyGraph(tasks);
    if (graph.cycles.length === 0 && graph.selfReferences.length === 0) {
      return tasks;
    }

    for (const cycle of graph.cycles) {
      context.diagnostics?.push(
        `Circular dependency cycle detected in schedule graph between tasks: ${cycle.join(", ")}.`
      );
    }
    for (const id of graph.selfReferences) {
      context.diagnostics?.push(`Circular dependency cycle detected in schedule graph: task "${id}" depends on itself.`);
    }

    if (!context.options?.breakCycles) {
      return tasks;
    }

    return tasks.map((task) => {
      if (!task || graph.nodes.get(task.id) !== task) return task;
      const next = filterDependsOn(
        task.dependsOn,
        (rel) => rel.id !== task.id && !graph.isCyclicEdge(rel.id, task.id),
        graph.nodes
      );
      if (next === task.dependsOn) return task;
      context.diagnostics?.push(`Removed circular dependency link(s) from task "${task.id}".`);
      return { ...task, dependsOn: next ?? null };
    });
  }
}
