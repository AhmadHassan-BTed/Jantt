import { JanttData, Task, ValidationError, ValidationResult } from "./types";
import { isStrictISODate, toEpochDay, fromEpochDay } from "./date-math";
import {
  buildDependencyGraph,
  getDependsOnItems,
  inspectDependencyItem,
  resolveRelationLag,
  relationEarliestStartDay
} from "./dependencies";
import { CALENDAR_PRESETS, normalizeWorkingDays, isSupportedRegion } from "./calendar";
import { getEffectiveGap, sanitizeCssColor } from "./utils";
import { DEFAULT_GAP_DAYS } from "./constants";

const DEPENDENCY_SUGGESTION =
  "Use a task id ('task-a'), typed shorthand ('task-a:SS+2d'), or an object { \"id\": \"task-a\", \"type\": \"FS\", \"lag\": 0 } (lag within ±3650 days).";
const COLOR_SUGGESTION = "Use a hex color such as '#3B82F6', rgb()/hsl(), or a named color such as 'teal'.";

/** Longest task id the renderers, storage keys and sync paths are designed for. */
const MAX_TASK_ID_LENGTH = 256;
/** Dates outside these years are almost always typos (e.g. '3026'); the timeline span is capped anyway. */
const MIN_PLAN_YEAR = 1900;
const MAX_PLAN_YEAR = 2200;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPresent(value: unknown): boolean {
  return value !== undefined && value !== null && value !== "";
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Short, single-line rendering of an untrusted value for messages (never the whole payload). */
function preview(value: unknown): string {
  const text = String(value).replace(/\s+/g, " ");
  return text.length > 60 ? `${text.slice(0, 57)}...` : text;
}

/** Avatars are initials (no URL syntax) or an absolute https: URL; anything else is not loaded. */
function isSafeAvatarValue(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!/[:/\\]/.test(trimmed)) return true;
  try {
    return new URL(trimmed).protocol === "https:";
  } catch {
    return false;
  }
}

/** [key, item] pairs of an array, or of the object form RTDB returns for arrays; null otherwise. */
function listEntries(value: unknown): [string, unknown][] | null {
  if (Array.isArray(value)) return value.map((item, i) => [String(i), item]);
  return isPlainObject(value) ? Object.entries(value) : null;
}

/**
 * Validates a Jantt data object and returns an array of LLM-friendly diagnostic errors.
 *
 * Each error specifies the task ID (if applicable), the property path, a human-readable
 * self-correction message, and a suggested fix. `errors` make the plan invalid; `warnings`
 * describe problems the engine tolerates (e.g. a locked task that violates its dependencies).
 */
export function validate(json: unknown): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  if (!json || typeof json !== "object") {
    errors.push({
      path: "$",
      code: "SCHEMA_MISMATCH",
      message: "The provided Jantt data is not a valid JSON object.",
      suggestion: "Provide a JSON object containing at least a 'tasks' array."
    });
    return { valid: false, errors, warnings };
  }

  const data = json as Partial<JanttData>;

  if (!Array.isArray(data.tasks)) {
    errors.push({
      path: "tasks",
      code: "MISSING_TASKS",
      message: "Root object is missing the required 'tasks' array.",
      suggestion: "Add a 'tasks': [...] array to the top level of your JSON."
    });
    return { valid: false, errors, warnings };
  }

  const definedCategories = new Set<string>();
  if (data.categories && typeof data.categories === "object") {
    Object.keys(data.categories).forEach((catKey) => definedCategories.add(catKey));
  }
  const namedCalendars = isPlainObject(data.calendars) ? data.calendars : {};

  /** Checks a calendar reference (preset name, named calendar or inline object). */
  const checkCalendarRef = (value: unknown, path: string, taskId?: string) => {
    if (!isPresent(value)) return;
    if (typeof value === "string") {
      if (!(value in CALENDAR_PRESETS) && !(value in namedCalendars)) {
        warnings.push({
          path,
          taskId,
          code: "INVALID_CALENDAR",
          message: `Calendar '${value}' is neither a preset (${Object.keys(CALENDAR_PRESETS).join(", ")}) nor defined in 'calendars'; the standard Mon-Fri calendar is used.`,
          suggestion: `Define "${value}" in the top-level 'calendars' object or use a preset name.`
        });
      }
      return;
    }
    if (!isPlainObject(value)) {
      warnings.push({
        path,
        taskId,
        code: "INVALID_CALENDAR",
        message: "A calendar must be a preset name or an object { workingDays, holidays, region, exceptions }.",
        suggestion: "Replace it with e.g. \"standard\" or { \"workingDays\": [1, 2, 3, 4, 5] }."
      });
      return;
    }
    const warn = (subPath: string, message: string, suggestion: string) =>
      warnings.push({ path: `${path}.${subPath}`, taskId, code: "INVALID_CALENDAR", message, suggestion });

    if (value.workingDays !== undefined) {
      const raw = value.workingDays;
      const invalid = Array.isArray(raw) ? raw.filter((d) => normalizeWorkingDays([d]) === null) : [raw];
      if (!Array.isArray(raw) || normalizeWorkingDays(raw) === null) {
        warn("workingDays", "Calendar 'workingDays' contains no valid weekday, so Monday-Friday is used instead.", "Use weekday numbers 0 (Sun) - 6 (Sat) or names like \"Mon\", e.g. [1, 2, 3, 4, 5].");
      } else if (invalid.length > 0) {
        warn("workingDays", `Calendar 'workingDays' has unrecognised entries that are ignored: ${invalid.map(String).join(", ")}.`, "Use weekday numbers 0 (Sun) - 6 (Sat) or names like \"Mon\".");
      }
    }
    if (value.holidays !== undefined) {
      const list = Array.isArray(value.holidays) ? value.holidays : null;
      const bad = list ? list.filter((h) => !isStrictISODate(typeof h === "string" ? h : isPlainObject(h) ? h.date : h)) : [];
      if (!list || bad.length > 0) {
        warn("holidays", "Calendar 'holidays' must be an array of 'YYYY-MM-DD' strings or { date, name } objects; invalid entries are ignored.", "Fix or remove the invalid holiday dates.");
      }
    }
    if (value.exceptions !== undefined) {
      const list = Array.isArray(value.exceptions) ? value.exceptions : null;
      const bad = list ? list.filter((ex) => !isPlainObject(ex) || !isStrictISODate(ex.date) || typeof ex.isWorkingDay !== "boolean") : [];
      if (!list || bad.length > 0) {
        warn("exceptions", "Calendar 'exceptions' must be an array of { date: 'YYYY-MM-DD', isWorkingDay: boolean } objects; invalid entries are ignored.", "Fix or remove the invalid exceptions.");
      }
    }
    if (isPresent(value.region) && !isSupportedRegion(value.region)) {
      warn("region", `Region '${String(value.region)}' has no statutory holiday rules, so no public holidays are applied.`, "Use one of US, UK, GB, EU, CA, AU, or list the holidays explicitly.");
    }
  };

  /** A `calendarId` must name an entry of the top-level `calendars` map. */
  const checkCalendarId = (value: unknown, path: string, taskId?: string) => {
    if (!isPresent(value) || (typeof value === "string" && value in namedCalendars)) return;
    warnings.push({
      path,
      taskId,
      code: "INVALID_CALENDAR",
      message: `calendarId '${String(value)}' is not defined in the top-level 'calendars' object, so it is ignored.`,
      suggestion: `Add "${String(value)}": { "workingDays": [1, 2, 3, 4, 5] } to 'calendars' or remove the calendarId.`
    });
  };

  /** Colors reach `style` and markup in every renderer; only the shared allow-list may pass. */
  const checkColor = (value: unknown, path: string, taskId?: string) => {
    if (!isPresent(value) || sanitizeCssColor(value) !== undefined) return;
    warnings.push({
      path,
      taskId,
      code: "INVALID_COLOR",
      message: `${path} '${preview(value)}' is not a plain CSS color, so the default color is shown instead.`,
      suggestion: COLOR_SUGGESTION
    });
  };

  /** A valid date in an implausible year (e.g. '3026-01-01') is almost always a typo. */
  const checkDateYear = (value: unknown, path: string, taskId?: string) => {
    if (typeof value !== "string" || !isStrictISODate(value)) return;
    const year = Number(value.slice(0, 4));
    if (year >= MIN_PLAN_YEAR && year <= MAX_PLAN_YEAR) return;
    warnings.push({
      path,
      taskId,
      code: "INVALID_DATE_RANGE",
      message: `${path} '${value}' lies outside the supported years ${MIN_PLAN_YEAR}-${MAX_PLAN_YEAR}; the timeline may not show it.`,
      suggestion: "Check the year for a typo."
    });
  };

  /** Snapshots in meta.baselines (tolerated when malformed: bad entries are skipped by analytics). */
  const checkBaselineSnapshots = (raw: unknown) => {
    if (raw === undefined || raw === null) return;
    const snapshots = listEntries(raw);
    if (!snapshots) {
      warnings.push({ path: "meta.baselines", code: "SCHEMA_MISMATCH", message: "meta.baselines must be an array of baseline snapshots; it is ignored.", suggestion: "Freeze a baseline from the app, or remove meta.baselines." });
      return;
    }
    for (const [key, snap] of snapshots) {
      const path = `meta.baselines[${key}]`;
      const entries = isPlainObject(snap) ? listEntries(snap.tasks) : null;
      if (!isPlainObject(snap) || typeof snap.id !== "string" || !snap.id.trim() || !entries) {
        warnings.push({
          path,
          code: "SCHEMA_MISMATCH",
          message: `${path} must be an object with a non-empty string 'id' and a 'tasks' array; the snapshot is ignored.`,
          suggestion: "Use { \"id\": \"bl-1\", \"name\": \"...\", \"createdAt\": \"<ISO>\", \"tasks\": [ { \"taskId\", \"start\", \"end\" } ] }."
        });
        continue;
      }
      const malformed = entries.filter(([, entry]) =>
        !isPlainObject(entry) ||
        typeof entry.taskId !== "string" || !entry.taskId ||
        !isStrictISODate(entry.start) || !isStrictISODate(entry.end) ||
        (entry.estimatedCost !== undefined && entry.estimatedCost !== null && !isFiniteNumber(entry.estimatedCost))
      ).length;
      if (malformed > 0 || (snap.name !== undefined && typeof snap.name !== "string") || (snap.createdAt !== undefined && typeof snap.createdAt !== "string")) {
        warnings.push({
          path,
          code: "SCHEMA_MISMATCH",
          message: `Baseline '${preview(snap.id)}' has ${malformed} malformed task entr${malformed === 1 ? "y" : "ies"} or non-string name/createdAt; malformed entries are ignored.`,
          suggestion: "Each entry needs a string 'taskId', 'YYYY-MM-DD' 'start' and 'end', and an optional numeric 'estimatedCost'."
        });
      }
    }
  };

  const checkMetaAndCollections = () => {
    if (data.meta !== undefined && data.meta !== null) {
      if (!isPlainObject(data.meta)) {
        errors.push({ path: "meta", code: "SCHEMA_MISMATCH", message: "'meta' must be an object.", suggestion: "Use \"meta\": { \"title\": \"...\" }." });
      } else {
        const meta = data.meta;
        for (const key of ["start", "end", "chartStart", "chartEnd"] as const) {
          if (isPresent(meta[key]) && !isStrictISODate(meta[key])) {
            errors.push({
              path: `meta.${key}`,
              code: "INVALID_DATE_FORMAT",
              message: `meta.${key} '${String(meta[key])}' is not a valid calendar date in 'YYYY-MM-DD' format.`,
              suggestion: `Format meta.${key} as 'YYYY-MM-DD' (e.g. '2026-09-01') or remove it.`
            });
          } else {
            checkDateYear(meta[key], `meta.${key}`);
          }
        }
        if (isPresent(meta.targetDate) && !isStrictISODate(meta.targetDate)) {
          warnings.push({
            path: "meta.targetDate",
            code: "INVALID_DATE_FORMAT",
            message: `meta.targetDate '${String(meta.targetDate)}' is not a valid 'YYYY-MM-DD' date and is ignored by critical path and risk analysis.`,
            suggestion: "Format the deadline as 'YYYY-MM-DD' (e.g. '2026-12-18')."
          });
        } else {
          checkDateYear(meta.targetDate, "meta.targetDate");
        }
        checkBaselineSnapshots(meta.baselines);
        if (meta.defaultGapDays !== undefined && meta.defaultGapDays !== null &&
            (typeof meta.defaultGapDays !== "number" || !Number.isFinite(meta.defaultGapDays))) {
          warnings.push({
            path: "meta.defaultGapDays",
            code: "SCHEMA_MISMATCH",
            message: `meta.defaultGapDays must be a number of days; '${String(meta.defaultGapDays)}' is not.`,
            suggestion: "Set it to a whole number such as 2."
          });
        }
        checkCalendarRef(meta.calendar, "meta.calendar");
      }
    }

    if (data.categories !== undefined && data.categories !== null) {
      if (!isPlainObject(data.categories)) {
        warnings.push({ path: "categories", code: "SCHEMA_MISMATCH", message: "'categories' must be an object mapping category keys to { label, color }.", suggestion: "Use \"categories\": { \"dev\": { \"label\": \"Development\", \"color\": \"#3B82F6\" } }." });
      } else {
        for (const [key, cat] of Object.entries(data.categories)) {
          if (!isPlainObject(cat) || typeof cat.label !== "string" || typeof cat.color !== "string") {
            warnings.push({
              path: `categories.${key}`,
              code: "SCHEMA_MISMATCH",
              message: `Category '${key}' should be an object with string 'label' and 'color'.`,
              suggestion: `Use "${key}": { "label": "...", "color": "#hex" }.`
            });
          } else {
            checkColor(cat.color, `categories.${key}.color`);
          }
        }
      }
    }

    for (const listKey of ["people", "teams"] as const) {
      const list = data[listKey];
      if (list === undefined || list === null) continue;
      if (!Array.isArray(list)) {
        warnings.push({ path: listKey, code: "SCHEMA_MISMATCH", message: `'${listKey}' must be an array.`, suggestion: `Use "${listKey}": [ { "id": "...", "name": "..." } ].` });
        continue;
      }
      list.forEach((entry: unknown, i: number) => {
        // Views index and display these registries directly, so a malformed entry is an error
        if (!isPlainObject(entry) || typeof entry.id !== "string" || !entry.id.trim() || typeof entry.name !== "string") {
          errors.push({
            path: `${listKey}[${i}]`,
            code: "SCHEMA_MISMATCH",
            message: `${listKey}[${i}] must be an object with a non-empty string 'id' and a string 'name'.`,
            suggestion: "Add the missing 'id' and 'name' fields, or remove the entry."
          });
          return;
        }
        checkColor(entry.color, `${listKey}[${i}].color`);
        if (listKey === "people") {
          if (isPresent(entry.avatar) && !isSafeAvatarValue(entry.avatar)) {
            warnings.push({
              path: `people[${i}].avatar`,
              code: "SCHEMA_MISMATCH",
              message: `people[${i}].avatar '${preview(entry.avatar)}' is neither initials nor an https: URL and should not be loaded as an image.`,
              suggestion: "Use an https:// image URL or leave 'avatar' empty."
            });
          }
          checkCalendarRef(entry.calendar, `people[${i}].calendar`);
          checkCalendarId(entry.calendarId, `people[${i}].calendarId`);
        }
      });
    }

    if (data.calendars !== undefined && data.calendars !== null) {
      if (!isPlainObject(data.calendars)) {
        warnings.push({ path: "calendars", code: "INVALID_CALENDAR", message: "'calendars' must be an object mapping calendar ids to calendar definitions.", suggestion: "Use \"calendars\": { \"site\": { \"workingDays\": [1, 2, 3, 4, 5, 6] } }." });
      } else {
        for (const [key, cal] of Object.entries(data.calendars)) {
          checkCalendarRef(cal, `calendars.${key}`);
        }
      }
    }
  };

  const idToTaskMap = new Map<string, Task>();
  const idToIndex = new Map<string, number>();

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
    if (task._deleted) return; // Skip soft-deleted tombstones defensively
    const taskId = task.id;

    if (!taskId || typeof taskId !== "string" || taskId.trim() === "") {
      errors.push({
        path: `${path}.id`,
        code: "MISSING_TASK_ID",
        message: `Task at index ${index} (label: "${task.label || task.name || "unnamed"}") is missing a required 'id' string.`,
        suggestion: "Add a unique string 'id' to this task (e.g. \"id\": \"task-name\")."
      });
    } else if (idToTaskMap.has(taskId)) {
      errors.push({
        path: `${path}.id`,
        taskId,
        code: "DUPLICATE_TASK_ID",
        message: `Duplicate task id '${taskId}' found at tasks[${index}]. Every task id must be unique across the plan.`,
        suggestion: `Change the id '${taskId}' on tasks[${index}] to a distinct unique identifier.`
      });
    } else {
      idToTaskMap.set(taskId, task);
      idToIndex.set(taskId, index);
    }
    if (typeof taskId === "string" && taskId.length > MAX_TASK_ID_LENGTH) {
      warnings.push({
        path: `${path}.id`,
        taskId,
        code: "SCHEMA_MISMATCH",
        message: `Task id '${preview(taskId)}' is ${taskId.length} characters long; ids longer than ${MAX_TASK_ID_LENGTH} characters are not supported by every view and export.`,
        suggestion: "Use a short, unique id (e.g. \"design-review\") and put the description in 'label'."
      });
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
    const hasValidStart = isStrictISODate(task.start);
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
    const hasValidEnd = isStrictISODate(task.end);
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
      const days = toEpochDay(task.end) - toEpochDay(task.start);
      if (days < 0) {
        errors.push({
          path: `${path}.end`,
          taskId,
          code: "INVALID_DATE_RANGE",
          message: `Task '${taskId || `index ${index}`}' has start: '${task.start}' and end: '${task.end}' (end date cannot be earlier than start date).`,
          suggestion: `Ensure 'end' is on or after 'start' (duration is currently ${days} days).`
        });
      } else if (days > 0 && task.milestone === true) {
        warnings.push({
          path: `${path}.end`,
          taskId,
          code: "MILESTONE_HAS_DURATION",
          message: `Milestone '${taskId || `index ${index}`}' spans ${task.start} to ${task.end}; milestones are drawn as a single point and scheduled with zero duration.`,
          suggestion: "Set 'end' equal to 'start', or set 'milestone' to false for a task with a duration."
        });
      }
    }
    checkDateYear(task.start, `${path}.start`, taskId);
    checkDateYear(task.end, `${path}.end`, taskId);

    // Progress validation
    if (task.progress !== undefined && task.progress !== null) {
      if (typeof task.progress !== "number" || !Number.isFinite(task.progress) || task.progress < 0 || task.progress > 1) {
        errors.push({
          path: `${path}.progress`,
          taskId,
          code: "INVALID_PROGRESS",
          message: `Task '${taskId || `index ${index}`}' has invalid progress value ${task.progress}. Progress must be a number between 0.0 and 1.0 (or null).`,
          suggestion: "Set 'progress' to a decimal between 0.0 and 1.0 (e.g. 0.5 for 50%)."
        });
      }
    }

    // Optional scalar fields (tolerated by the engine, reported as warnings)
    for (const key of ["gapDays", "minGapDays"] as const) {
      const value = task[key];
      if (value !== undefined && value !== null && (typeof value !== "number" || !Number.isFinite(value))) {
        warnings.push({
          path: `${path}.${key}`,
          taskId,
          code: "SCHEMA_MISMATCH",
          message: `Task '${taskId || `index ${index}`}' has non-numeric ${key} '${String(value)}'.`,
          suggestion: `Set '${key}' to a number of days (or null to use meta.defaultGapDays).`
        });
      }
    }
    for (const key of ["estimatedCost", "actualCost"] as const) {
      const value = task[key];
      if (value !== undefined && value !== null && !isFiniteNumber(value)) {
        warnings.push({
          path: `${path}.${key}`,
          taskId,
          code: "SCHEMA_MISMATCH",
          message: `Task '${taskId || `index ${index}`}' ${key} must be a number (got ${JSON.stringify(preview(value))}); it is not counted as a cost.`,
          suggestion: `Set '${key}' to a plain number such as 5000 (no currency symbol or thousands separator).`
        });
      }
    }
    // Text shown by every view; non-strings are tolerated by the core renderers but not by all hosts
    for (const key of ["label", "name", "assignee", "description", "notes"] as const) {
      const value = task[key];
      if (value !== undefined && value !== null && typeof value !== "string") {
        warnings.push({
          path: `${path}.${key}`,
          taskId,
          code: "SCHEMA_MISMATCH",
          message: `Task '${taskId || `index ${index}`}' has a non-string '${key}' (${Array.isArray(value) ? "array" : typeof value}).`,
          suggestion: `Set '${key}' to a string.`
        });
      }
    }
    checkColor(task.color, `${path}.color`, taskId);
    for (const key of ["milestone", "locked"] as const) {
      if (task[key] !== undefined && typeof task[key] !== "boolean") {
        warnings.push({
          path: `${path}.${key}`,
          taskId,
          code: "SCHEMA_MISMATCH",
          message: `Task '${taskId || `index ${index}`}' has non-boolean '${key}' value '${String(task[key])}'.`,
          suggestion: `Set '${key}' to true or false.`
        });
      }
    }
    checkCalendarRef(task.calendar, `${path}.calendar`, taskId);
    checkCalendarId(task.calendarId, `${path}.calendarId`, taskId);

    // Baseline validation
    if (task.baseline) {
      const bStartValid = isStrictISODate(task.baseline.start);
      const bEndValid = isStrictISODate(task.baseline.end);
      if (!bStartValid || !bEndValid) {
        errors.push({
          path: `${path}.baseline`,
          taskId,
          code: "INVALID_BASELINE_DATE",
          message: `Task '${taskId || `index ${index}`}' has invalid baseline dates (start: '${task.baseline.start}', end: '${task.baseline.end}').`,
          suggestion: "Ensure baseline 'start' and 'end' are valid 'YYYY-MM-DD' calendar date strings."
        });
      } else if (toEpochDay(task.baseline.end) < toEpochDay(task.baseline.start)) {
        errors.push({
          path: `${path}.baseline.end`,
          taskId,
          code: "INVALID_BASELINE_RANGE",
          message: `Task '${taskId || `index ${index}`}' has baseline end date earlier than baseline start date.`,
          suggestion: "Ensure baseline 'end' is on or after baseline 'start'."
        });
      } else {
        checkDateYear(task.baseline.start, `${path}.baseline.start`, taskId);
        checkDateYear(task.baseline.end, `${path}.baseline.end`, taskId);
      }
    }
  });

  // Second pass: dependency syntax, self references and dangling links
  data.tasks.forEach((task, index) => {
    if (!task || typeof task !== "object" || !task.id || typeof task.id !== "string" || task._deleted) return;
    const path = `tasks[${index}].dependsOn`;

    for (const item of getDependsOnItems(task.dependsOn)) {
      const { relation, issue } = inspectDependencyItem(item, idToTaskMap);
      if (issue) {
        errors.push({
          path,
          taskId: task.id,
          code: "INVALID_DEPENDENCY",
          message: `Task '${task.id}' has an invalid dependency: ${issue}`,
          suggestion: DEPENDENCY_SUGGESTION
        });
      }
      if (!relation || (issue && !idToTaskMap.has(relation.id))) continue;
      const depId = relation.id;

      // 0. Self-dependency check
      if (depId === task.id) {
        errors.push({
          path,
          taskId: task.id,
          code: "CIRCULAR_DEPENDENCY",
          message: `Task '${task.id}' cannot depend on itself.`,
          suggestion: `Remove '${depId}' from '${task.id}.dependsOn'.`
        });
        continue;
      }

      // 1. Dangling dependency check
      if (!idToTaskMap.has(depId)) {
        errors.push({
          path,
          taskId: task.id,
          code: "DANGLING_DEPENDENCY",
          message: `Task '${task.id}' has dependsOn: '${depId}' but no task with id '${depId}' exists in the plan.`,
          suggestion: `Either create a task with id '${depId}' or update '${task.id}.dependsOn' to match an existing task id.`
        });
      }
    }
  });

  // Circular dependencies: one error per strongly connected component, with a concrete loop
  const graph = buildDependencyGraph(data.tasks);
  for (const members of graph.cycles) {
    const loop = findDependencyLoop(members, graph.predecessors);
    const startId = loop[0];
    const lastLink = loop[loop.length - 2];
    errors.push({
      path: `tasks[${idToIndex.get(startId) ?? -1}].dependsOn`,
      taskId: startId,
      code: "CIRCULAR_DEPENDENCY",
      message: `Circular dependency detected involving tasks: ${loop.join(" -> ")}. A task cannot directly or indirectly depend on itself.`,
      suggestion: `Break the cycle by removing the dependsOn link between '${lastLink}' and '${startId}'.`
    });
  }

  // Dependency timing conflicts the cascade will not fix: locked tasks, or every task in Strict mode
  const meta = isPlainObject(data.meta) ? data.meta : {};
  const gapDefault = typeof meta.defaultGapDays === "number" && Number.isFinite(meta.defaultGapDays)
    ? meta.defaultGapDays
    : DEFAULT_GAP_DAYS;
  const strictMode = meta.autoCascade === false;
  graph.nodes.forEach((task, id) => {
    if (task.locked !== true && !strictMode) return;
    const start = toEpochDay(task.start);
    const finish = task.milestone ? start : toEpochDay(task.end);
    if (Number.isNaN(start) || Number.isNaN(finish)) return;
    const gap = getEffectiveGap(task, gapDefault);
    for (const rel of graph.predecessors.get(id)!) {
      if (graph.isCyclicEdge(rel.id, id)) continue;
      const pred = graph.nodes.get(rel.id)!;
      const ps = toEpochDay(pred.start);
      const pf = pred.milestone ? ps : toEpochDay(pred.end);
      if (Number.isNaN(ps) || Number.isNaN(pf)) continue;
      const min = relationEarliestStartDay(rel.type, ps, pf, Math.max(finish - start, 0), resolveRelationLag(rel, gap));
      if (start < min) {
        warnings.push({
          path: `tasks[${idToIndex.get(id) ?? -1}].start`,
          taskId: id,
          code: "DEP_TIMING_CONFLICT",
          message: `${task.locked === true ? "Locked task" : "Task"} '${id}' starts ${task.start}, but its ${rel.type} link to '${rel.id}' requires ${fromEpochDay(min)} or later.`,
          suggestion: task.locked === true
            ? `Move '${id}', unlock it so the cascade can reschedule it, or reduce the link lag/gap.`
            : `Move '${id}' to ${fromEpochDay(min)} or enable auto-cascade.`
        });
      }
    }
  });

  checkMetaAndCollections();

  // Validate notes collection if present
  if (data.notes !== undefined) {
    if (!Array.isArray(data.notes)) {
      errors.push({
        path: "notes",
        code: "SCHEMA_MISMATCH",
        message: "The 'notes' property must be an array of note items.",
        suggestion: "Ensure 'notes' is formatted as [ { id, title, content } ]."
      });
    } else {
      const noteIds = new Set<string>();
      data.notes.forEach((note, nIdx) => {
        if (!note || typeof note !== "object") {
          errors.push({
            path: `notes[${nIdx}]`,
            code: "SCHEMA_MISMATCH",
            message: `Note at index ${nIdx} is not a valid object.`,
            suggestion: "Ensure each note object contains { id, title, content }."
          });
          return;
        }
        if (!note.id || typeof note.id !== "string" || note.id.trim() === "") {
          errors.push({
            path: `notes[${nIdx}].id`,
            code: "SCHEMA_MISMATCH",
            message: `Note at index ${nIdx} is missing a required string 'id'.`,
            suggestion: "Add a unique string id (e.g. \"note-1\")."
          });
        } else if (noteIds.has(note.id)) {
          errors.push({
            path: `notes[${nIdx}].id`,
            code: "SCHEMA_MISMATCH",
            message: `Duplicate note id '${note.id}' at index ${nIdx}.`,
            suggestion: "Ensure each note has a unique id."
          });
        } else {
          noteIds.add(note.id);
        }

        const label = typeof note.id === "string" && note.id ? note.id : String(nIdx);
        // The Notes view reads these directly, so wrong types are errors
        for (const key of ["title", "content"] as const) {
          if (note[key] !== undefined && typeof note[key] !== "string") {
            errors.push({
              path: `notes[${nIdx}].${key}`,
              code: "SCHEMA_MISMATCH",
              message: `Note '${label}' field '${key}' must be a string.`,
              suggestion: `Set '${key}' to text (use "" for an empty ${key}).`
            });
          }
        }
        if (note.tags !== undefined && (!Array.isArray(note.tags) || !note.tags.every((tag) => typeof tag === "string"))) {
          errors.push({
            path: `notes[${nIdx}].tags`,
            code: "SCHEMA_MISMATCH",
            message: `Note '${label}' field 'tags' must be an array of strings.`,
            suggestion: "Provide tags like [\"ADR\", \"Spec\"]."
          });
        }
        for (const key of ["createdAt", "updatedAt"] as const) {
          if (isPresent(note[key]) && !isStrictISODate(note[key])) {
            warnings.push({
              path: `notes[${nIdx}].${key}`,
              code: "INVALID_DATE_FORMAT",
              message: `Note '${label}' field '${key}' '${preview(note[key])}' is not an ISO 8601 date or timestamp.`,
              suggestion: "Use a timestamp such as '2026-08-25T10:00:00.000Z'."
            });
          }
        }
        checkColor(note.color, `notes[${nIdx}].color`);

        if (note.task_ids !== undefined) {
          if (!Array.isArray(note.task_ids) || !note.task_ids.every((tid) => typeof tid === "string")) {
            errors.push({
              path: `notes[${nIdx}].task_ids`,
              code: "SCHEMA_MISMATCH",
              message: `Note '${note.id || nIdx}' field 'task_ids' must be an array of string task IDs.`,
              suggestion: "Provide an array of task IDs like [\"T1\", \"T2\"]."
            });
          } else if (!note._deleted) {
            const missing = note.task_ids.filter((tid) => !idToTaskMap.has(tid));
            if (missing.length > 0) {
              warnings.push({
                path: `notes[${nIdx}].task_ids`,
                code: "DANGLING_REFERENCE",
                message: `Note '${label}' is attached to task(s) that do not exist in the plan: ${missing.slice(0, 5).map(preview).join(", ")}${missing.length > 5 ? ` and ${missing.length - 5} more` : ""}.`,
                suggestion: "Remove the missing ids from 'task_ids' or restore the tasks."
              });
            }
          }
        }
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Finds a concrete dependency loop inside a cycle (strongly connected component) by BFS along
 * dependsOn links, starting and ending at the component's first member: [A, C, B, A] means
 * A depends on C, C on B, and B on A.
 */
function findDependencyLoop(
  members: string[],
  predecessors: Map<string, { id: string }[]>
): string[] {
  const inCycle = new Set(members);
  const start = members[0];
  const parent = new Map<string, string>();
  const queue: string[] = [start];
  for (let head = 0; head < queue.length; head++) {
    const curr = queue[head];
    for (const rel of predecessors.get(curr) || []) {
      if (!inCycle.has(rel.id)) continue;
      if (rel.id === start) {
        const path = [curr];
        let node = curr;
        while (node !== start) {
          node = parent.get(node)!;
          path.push(node);
        }
        return [...path.reverse(), start];
      }
      if (!parent.has(rel.id)) {
        parent.set(rel.id, curr);
        queue.push(rel.id);
      }
    }
  }
  return [...members, start];
}
