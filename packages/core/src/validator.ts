import { JanttData, Task, ValidationError, ValidationResult } from "./types";
import { isValidISODate, diffDays } from "./date-math";
import { getTaskDependencies } from "./resolver";

/**
 * Validates a Jantt data object and returns an array of LLM-friendly diagnostic errors.
 *
 * Each error specifies the task ID (if applicable), the property path, a human-readable
 * self-correction message, and a suggested fix.
 */
export function validate(json: unknown): ValidationResult {
  const errors: ValidationError[] = [];

  if (!json || typeof json !== "object") {
    errors.push({
      path: "$",
      code: "SCHEMA_MISMATCH",
      message: "The provided Jantt data is not a valid JSON object.",
      suggestion: "Provide a JSON object containing at least a 'tasks' array."
    });
    return { valid: false, errors };
  }

  const data = json as Partial<JanttData>;

  if (!Array.isArray(data.tasks)) {
    errors.push({
      path: "tasks",
      code: "MISSING_TASKS",
      message: "Root object is missing the required 'tasks' array.",
      suggestion: "Add a 'tasks': [...] array to the top level of your JSON."
    });
    return { valid: false, errors };
  }

  const definedCategories = new Set<string>();
  if (data.categories && typeof data.categories === "object") {
    Object.keys(data.categories).forEach((catKey) => definedCategories.add(catKey));
  }

  const taskIds = new Set<string>();
  const idToTaskMap = new Map<string, Task>();

  // First pass: validate task structure, IDs, categories, dates, and progress
  data.tasks.forEach((rawTask, index) => {
    const path = `tasks[${index}]`;

    if (!rawTask || typeof rawTask !== "object") {
      errors.push({
        path,
        code: "INVALID_TASK_OBJECT",
        message: `Task at index ${index} is not a valid object.`,
        suggestion: "Ensure each item in 'tasks' is an object with { id, category, start, end }."
      });
      return;
    }

    const task = rawTask as Task;
    const taskId = task.id;

    if (!taskId || typeof taskId !== "string" || taskId.trim() === "") {
      errors.push({
        path: `${path}.id`,
        code: "MISSING_TASK_ID",
        message: `Task at index ${index} (label: "${task.label || task.name || "unnamed"}") is missing a required 'id' string.`,
        suggestion: "Add a unique string 'id' to this task (e.g. \"id\": \"task-name\")."
      });
    } else if (taskIds.has(taskId)) {
      errors.push({
        path: `${path}.id`,
        taskId,
        code: "DUPLICATE_TASK_ID",
        message: `Duplicate task id '${taskId}' found at tasks[${index}]. Every task id must be unique across the plan.`,
        suggestion: `Change the id '${taskId}' on tasks[${index}] to a distinct unique identifier.`
      });
    } else {
      taskIds.add(taskId);
      idToTaskMap.set(taskId, task);
    }

    // Category validation
    if (!task.category || typeof task.category !== "string") {
      errors.push({
        path: `${path}.category`,
        taskId,
        code: "MISSING_CATEGORY",
        message: `Task '${taskId || `index ${index}`}' is missing a required 'category' string.`,
        suggestion: "Add a 'category' matching a key in your 'categories' object."
      });
    } else if (definedCategories.size > 0 && !definedCategories.has(task.category)) {
      errors.push({
        path: `${path}.category`,
        taskId,
        code: "UNKNOWN_CATEGORY",
        message: `Task '${taskId || `index ${index}`}' references category '${task.category}', but '${task.category}' is not defined in the top-level 'categories' map (known: ${Array.from(definedCategories).join(", ")}).`,
        suggestion: `Define "${task.category}": { "label": "...", "color": "#hex" } in the 'categories' object or assign a defined category.`
      });
    }

    // Start Date validation
    const hasValidStart = isValidISODate(task.start);
    if (!task.start || typeof task.start !== "string") {
      errors.push({
        path: `${path}.start`,
        taskId,
        code: "INVALID_DATE_FORMAT",
        message: `Task '${taskId || `index ${index}`}' is missing a 'start' date.`,
        suggestion: "Set 'start' to an ISO date string formatted as 'YYYY-MM-DD'."
      });
    } else if (!hasValidStart) {
      errors.push({
        path: `${path}.start`,
        taskId,
        code: "INVALID_DATE_FORMAT",
        message: `Task '${taskId || `index ${index}`}' has invalid start date '${task.start}'. Dates must be valid calendar dates in 'YYYY-MM-DD' format.`,
        suggestion: "Format 'start' as 'YYYY-MM-DD' (e.g. '2026-09-01')."
      });
    }

    // End Date validation
    const hasValidEnd = isValidISODate(task.end);
    if (!task.end || typeof task.end !== "string") {
      errors.push({
        path: `${path}.end`,
        taskId,
        code: "INVALID_DATE_FORMAT",
        message: `Task '${taskId || `index ${index}`}' is missing an 'end' date.`,
        suggestion: "Set 'end' to an ISO date string formatted as 'YYYY-MM-DD'."
      });
    } else if (!hasValidEnd) {
      errors.push({
        path: `${path}.end`,
        taskId,
        code: "INVALID_DATE_FORMAT",
        message: `Task '${taskId || `index ${index}`}' has invalid end date '${task.end}'. Dates must be valid calendar dates in 'YYYY-MM-DD' format.`,
        suggestion: "Format 'end' as 'YYYY-MM-DD' (e.g. '2026-09-10')."
      });
    }

    // Date range validation
    if (hasValidStart && hasValidEnd) {
      const days = diffDays(task.start, task.end);
      if (days < 0) {
        errors.push({
          path: `${path}.end`,
          taskId,
          code: "INVALID_DATE_RANGE",
          message: `Task '${taskId || `index ${index}`}' has start: '${task.start}' and end: '${task.end}' (end date cannot be earlier than start date).`,
          suggestion: `Ensure 'end' is on or after 'start' (duration is currently ${days} days).`
        });
      }
    }

    // Progress validation
    if (task.progress !== undefined && task.progress !== null) {
      if (typeof task.progress !== "number" || task.progress < 0 || task.progress > 1) {
        errors.push({
          path: `${path}.progress`,
          taskId,
          code: "INVALID_PROGRESS",
          message: `Task '${taskId || `index ${index}`}' has invalid progress value ${task.progress}. Progress must be a number between 0.0 and 1.0 (or null).`,
          suggestion: "Set 'progress' to a decimal between 0.0 and 1.0 (e.g. 0.5 for 50%)."
        });
      }
    }
  });

  // Second pass: Dependency resolution, dangling check, and cycle detection
  data.tasks.forEach((task, index) => {
    if (!task || !task.id) return;

    const depIds = getTaskDependencies(task);
    depIds.forEach((depId) => {
      // 1. Dangling dependency check
      if (!idToTaskMap.has(depId)) {
        errors.push({
          path: `tasks[${index}].dependsOn`,
          taskId: task.id,
          code: "DANGLING_DEPENDENCY",
          message: `Task '${task.id}' has dependsOn: '${depId}' but no task with id '${depId}' exists in the plan.`,
          suggestion: `Either create a task with id '${depId}' or update '${task.id}.dependsOn' to match an existing task id.`
        });
      }
    });
  });

  // Check for circular dependencies across arbitrary multi-dependency graphs
  const visited = new Set<string>();
  const recStack = new Set<string>();

  function checkCycle(currId: string, pathAcc: string[]): boolean {
    visited.add(currId);
    recStack.add(currId);
    pathAcc.push(currId);

    const task = idToTaskMap.get(currId);
    if (task) {
      const depIds = getTaskDependencies(task);
      for (const nextId of depIds) {
        if (!idToTaskMap.has(nextId)) continue;
        if (!visited.has(nextId)) {
          if (checkCycle(nextId, pathAcc)) return true;
        } else if (recStack.has(nextId)) {
          pathAcc.push(nextId);
          const cycleStr = pathAcc.join(" -> ");
          errors.push({
            path: `tasks[${data.tasks!.findIndex((t) => t.id === currId)}].dependsOn`,
            taskId: currId,
            code: "CIRCULAR_DEPENDENCY",
            message: `Circular dependency detected involving tasks: ${cycleStr}. A task cannot directly or indirectly depend on itself.`,
            suggestion: `Break the cycle by removing the dependsOn link between '${currId}' and '${nextId}'.`
          });
          return true;
        }
      }
    }

    recStack.delete(currId);
    pathAcc.pop();
    return false;
  }

  for (const taskId of idToTaskMap.keys()) {
    if (!visited.has(taskId)) {
      checkCycle(taskId, []);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
