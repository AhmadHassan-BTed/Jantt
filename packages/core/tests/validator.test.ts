import { describe, it, expect } from "vitest";
import { validate } from "../src/validator";
import basicJson from "../../../examples/basic.json";
import academicJson from "../../../examples/academic-roadmap.json";
import constructionJson from "../../../examples/construction-enterprise.json";
import brokenMissingIdJson from "../../../examples/broken-missing-id.json";
import brokenBadDateJson from "../../../examples/broken-bad-date.json";
import brokenDanglingDepJson from "../../../examples/broken-dangling-dependency.json";
import cheatsheetJson from "../../../examples/cheatsheet-default.json";
import masterTemplateJson from "../../../examples/master-template.json";
import schemaJson from "../../../schema/jantt.schema.json";
import playgroundSchemaJson from "../../../apps/playground/public/schema/v1.json";
import { MAX_DEPENDENCY_LAG_DAYS } from "../src/dependencies";
import { CALENDAR_PRESETS, isSupportedRegion } from "../src/calendar";

const VALID_EXAMPLES: Record<string, unknown> = {
  "basic.json": basicJson,
  "academic-roadmap.json": academicJson,
  "construction-enterprise.json": constructionJson,
  "cheatsheet-default.json": cheatsheetJson,
  "master-template.json": masterTemplateJson
};

type SchemaValidator = ((data: unknown) => boolean) & { errors?: unknown };
type AjvConstructor = new (options: Record<string, unknown>) => { compile(schema: unknown): SchemaValidator };
// Optional: only present transitively today (see the schema contract suite)
const ajvModule = "ajv";
const Ajv: AjvConstructor | null = await import(/* @vite-ignore */ ajvModule)
  .then((m: { default?: AjvConstructor }) => m.default ?? (m as unknown as AjvConstructor))
  .catch(() => null);

describe("Jantt Schema Validator", () => {
  // ─── Valid fixture acceptance ──────────────────────────────────────────

  it("passes valid basic.json example", () => {
    const result = validate(basicJson);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("passes valid academic-roadmap.json example", () => {
    const result = validate(academicJson);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("passes valid construction-enterprise.json (large dependency chain with milestones)", () => {
    const result = validate(constructionJson);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("passes minimal valid data (single task, no meta, no categories)", () => {
    const result = validate({
      tasks: [
        { id: "only-task", category: "uncategorized", start: "2026-09-01", end: "2026-09-05" }
      ]
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("passes milestone tasks where start === end", () => {
    const result = validate({
      tasks: [
        { id: "m1", category: "ms", start: "2026-12-25", end: "2026-12-25", milestone: true }
      ]
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  // ─── SCHEMA_MISMATCH ──────────────────────────────────────────────────

  it("rejects null input with SCHEMA_MISMATCH", () => {
    const result = validate(null);
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe("SCHEMA_MISMATCH");
  });

  it("rejects undefined input with SCHEMA_MISMATCH", () => {
    const result = validate(undefined);
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe("SCHEMA_MISMATCH");
  });

  it("rejects primitive string input with SCHEMA_MISMATCH", () => {
    const result = validate("not an object" as unknown);
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe("SCHEMA_MISMATCH");
  });

  it("rejects numeric input with SCHEMA_MISMATCH", () => {
    const result = validate(42 as unknown);
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe("SCHEMA_MISMATCH");
  });

  // ─── MISSING_TASKS ────────────────────────────────────────────────────

  it("rejects object without tasks array with MISSING_TASKS", () => {
    const result = validate({ meta: { title: "Empty" } });
    expect(result.valid).toBe(false);
    const err = result.errors.find(e => e.code === "MISSING_TASKS");
    expect(err).toBeDefined();
    expect(err?.message).toContain("tasks");
  });

  it("rejects object where tasks is a string with MISSING_TASKS", () => {
    const result = validate({ tasks: "not-an-array" });
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe("MISSING_TASKS");
  });

  // ─── INVALID_TASK_OBJECT ──────────────────────────────────────────────

  it("rejects non-object items inside tasks array", () => {
    const result = validate({ tasks: [null, 42, "string-task"] });
    expect(result.valid).toBe(false);
    const invalidObjectErrors = result.errors.filter(e => e.code === "INVALID_TASK_OBJECT");
    expect(invalidObjectErrors.length).toBe(3);
  });

  // ─── MISSING_TASK_ID ──────────────────────────────────────────────────

  it("fails on broken-missing-id.json with specific message", () => {
    const result = validate(brokenMissingIdJson);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    const idError = result.errors.find((e) => e.code === "MISSING_TASK_ID");
    expect(idError).toBeDefined();
    expect(idError?.message).toContain("missing a required 'id' string");
  });

  it("rejects task with empty-string id", () => {
    const result = validate({
      tasks: [
        { id: "", category: "dev", start: "2026-09-01", end: "2026-09-05" }
      ]
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === "MISSING_TASK_ID")).toBe(true);
  });

  it("rejects task with whitespace-only id", () => {
    const result = validate({
      tasks: [
        { id: "   ", category: "dev", start: "2026-09-01", end: "2026-09-05" }
      ]
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === "MISSING_TASK_ID")).toBe(true);
  });

  // ─── DUPLICATE_TASK_ID ────────────────────────────────────────────────

  it("detects duplicate task IDs", () => {
    const duplicateData = {
      tasks: [
        { id: "task-1", category: "gen", start: "2026-09-01", end: "2026-09-05" },
        { id: "task-1", category: "gen", start: "2026-09-06", end: "2026-09-10" }
      ]
    };
    const result = validate(duplicateData);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "DUPLICATE_TASK_ID")).toBe(true);
  });

  it("detects multiple different duplicate IDs in one pass", () => {
    const result = validate({
      tasks: [
        { id: "dup-a", category: "g", start: "2026-09-01", end: "2026-09-02" },
        { id: "dup-b", category: "g", start: "2026-09-01", end: "2026-09-02" },
        { id: "dup-a", category: "g", start: "2026-09-03", end: "2026-09-04" },
        { id: "dup-b", category: "g", start: "2026-09-03", end: "2026-09-04" }
      ]
    });
    expect(result.valid).toBe(false);
    const dupErrors = result.errors.filter(e => e.code === "DUPLICATE_TASK_ID");
    expect(dupErrors.length).toBe(2);
  });

  // ─── MISSING_CATEGORY ─────────────────────────────────────────────────

  it("rejects task missing a category field", () => {
    const result = validate({
      tasks: [
        { id: "no-cat", start: "2026-09-01", end: "2026-09-05" }
      ]
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === "MISSING_CATEGORY")).toBe(true);
  });

  // ─── UNKNOWN_CATEGORY ─────────────────────────────────────────────────

  it("rejects task referencing an undefined category when categories map exists", () => {
    const result = validate({
      categories: {
        dev: { label: "Development", color: "#3B82F6" }
      },
      tasks: [
        { id: "t1", category: "nonexistent", start: "2026-09-01", end: "2026-09-05" }
      ]
    });
    expect(result.valid).toBe(false);
    const catErr = result.errors.find(e => e.code === "UNKNOWN_CATEGORY");
    expect(catErr).toBeDefined();
    expect(catErr?.message).toContain("nonexistent");
    expect(catErr?.message).toContain("dev");
  });

  // ─── INVALID_DATE_FORMAT ──────────────────────────────────────────────

  it("rejects tasks with completely invalid date strings", () => {
    const result = validate({
      tasks: [
        { id: "bad-dates", category: "dev", start: "tomorrow", end: "next-week" }
      ]
    });
    expect(result.valid).toBe(false);
    const dateErrors = result.errors.filter(e => e.code === "INVALID_DATE_FORMAT");
    expect(dateErrors.length).toBe(2);
  });

  it("rejects task missing start date entirely", () => {
    const result = validate({
      tasks: [
        { id: "no-start", category: "dev", end: "2026-09-10" }
      ]
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === "INVALID_DATE_FORMAT" && e.message.includes("start"))).toBe(true);
  });

  it("rejects impossible calendar dates like Feb 30", () => {
    const result = validate({
      tasks: [
        { id: "impossible", category: "dev", start: "2026-02-30", end: "2026-03-01" }
      ]
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === "INVALID_DATE_FORMAT")).toBe(true);
  });

  // ─── INVALID_DATE_RANGE ───────────────────────────────────────────────

  it("fails on broken-bad-date.json with specific date range error", () => {
    const result = validate(brokenBadDateJson);
    expect(result.valid).toBe(false);
    const dateRangeError = result.errors.find((e) => e.code === "INVALID_DATE_RANGE");
    expect(dateRangeError).toBeDefined();
    expect(dateRangeError?.taskId).toBe("postech");
    expect(dateRangeError?.message).toContain("end date cannot be earlier than start date");
  });

  it("rejects task where end is before start by one day", () => {
    const result = validate({
      tasks: [
        { id: "backwards", category: "dev", start: "2026-09-10", end: "2026-09-09" }
      ]
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === "INVALID_DATE_RANGE")).toBe(true);
  });

  // ─── INVALID_PROGRESS ─────────────────────────────────────────────────

  it("rejects progress values outside 0.0-1.0 range", () => {
    const result = validate({
      tasks: [
        { id: "over", category: "dev", start: "2026-09-01", end: "2026-09-05", progress: 1.5 },
        { id: "under", category: "dev", start: "2026-09-01", end: "2026-09-05", progress: -0.1 }
      ]
    });
    expect(result.valid).toBe(false);
    const progressErrors = result.errors.filter(e => e.code === "INVALID_PROGRESS");
    expect(progressErrors.length).toBe(2);
  });

  it("accepts valid progress values at boundaries (0.0 and 1.0)", () => {
    const result = validate({
      tasks: [
        { id: "zero", category: "dev", start: "2026-09-01", end: "2026-09-05", progress: 0 },
        { id: "full", category: "dev", start: "2026-09-06", end: "2026-09-10", progress: 1.0 }
      ]
    });
    expect(result.valid).toBe(true);
  });

  it("rejects non-numeric progress (string '50%')", () => {
    const result = validate({
      tasks: [
        { id: "str-prog", category: "dev", start: "2026-09-01", end: "2026-09-05", progress: "50%" }
      ]
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === "INVALID_PROGRESS")).toBe(true);
  });

  // ─── DANGLING_DEPENDENCY ──────────────────────────────────────────────

  it("fails on broken-dangling-dependency.json naming missing task id", () => {
    const result = validate(brokenDanglingDepJson);
    expect(result.valid).toBe(false);
    const depError = result.errors.find((e) => e.code === "DANGLING_DEPENDENCY");
    expect(depError).toBeDefined();
    expect(depError?.taskId).toBe("anu");
    expect(depError?.message).toContain("dependsOn: 'ielts-exam-2' but no task with id 'ielts-exam-2' exists");
  });

  // ─── CIRCULAR_DEPENDENCY ──────────────────────────────────────────────

  it("detects simple A->B->C->A circular dependency", () => {
    const circularData = {
      tasks: [
        { id: "A", category: "gen", start: "2026-09-01", end: "2026-09-05", dependsOn: "C" },
        { id: "B", category: "gen", start: "2026-09-06", end: "2026-09-10", dependsOn: "A" },
        { id: "C", category: "gen", start: "2026-09-11", end: "2026-09-15", dependsOn: "B" }
      ]
    };
    const result = validate(circularData);
    expect(result.valid).toBe(false);
    const circError = result.errors.find((e) => e.code === "CIRCULAR_DEPENDENCY");
    expect(circError).toBeDefined();
    expect(circError?.message).toContain("Circular dependency detected");
  });

  it("detects self-dependency (A depends on A)", () => {
    const result = validate({
      tasks: [
        { id: "self", category: "gen", start: "2026-09-01", end: "2026-09-05", dependsOn: "self" }
      ]
    });
    expect(result.valid).toBe(false);
    const circError = result.errors.find(e => e.code === "CIRCULAR_DEPENDENCY");
    expect(circError).toBeDefined();
  });

  // ─── Multi-error accumulation ─────────────────────────────────────────

  it("accumulates multiple distinct errors on a single badly-formed task", () => {
    const result = validate({
      categories: { dev: { label: "Dev", color: "#000" } },
      tasks: [
        { id: "multi-bad", category: "unknown-cat", start: "not-a-date", end: "also-bad", progress: 5 }
      ]
    });
    expect(result.valid).toBe(false);
    const codes = new Set(result.errors.map(e => e.code));
    expect(codes.has("UNKNOWN_CATEGORY")).toBe(true);
    expect(codes.has("INVALID_DATE_FORMAT")).toBe(true);
    expect(codes.has("INVALID_PROGRESS")).toBe(true);
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
  });

  // ─── Return shape contract ────────────────────────────────────────────

  it("always returns { valid: boolean, errors: ValidationError[] } shape", () => {
    const valid = validate(basicJson);
    expect(valid).toHaveProperty("valid");
    expect(valid).toHaveProperty("errors");
    expect(Array.isArray(valid.errors)).toBe(true);

    const invalid = validate(null);
    expect(invalid).toHaveProperty("valid");
    expect(invalid).toHaveProperty("errors");
    expect(Array.isArray(invalid.errors)).toBe(true);
  });

  it("every error object contains required path, code, and message fields", () => {
    const result = validate({
      tasks: [
        { id: "", category: "", start: "bad", end: "bad", progress: -1, dependsOn: "ghost" }
      ]
    });
    expect(result.valid).toBe(false);
    for (const err of result.errors) {
      expect(err).toHaveProperty("path");
      expect(err).toHaveProperty("code");
      expect(err).toHaveProperty("message");
      expect(typeof err.path).toBe("string");
      expect(typeof err.code).toBe("string");
      expect(typeof err.message).toBe("string");
    }
  });

  // ─── Shipped examples & schema copies ──────────────────────────────────

  it("accepts every valid shipped example without errors or warnings", () => {
    for (const [name, example] of Object.entries(VALID_EXAMPLES)) {
      const result = validate(example);
      expect({ name, errors: result.errors, warnings: result.warnings }).toEqual({ name, errors: [], warnings: [] });
    }
  });

  it("keeps the playground schema copy identical to schema/jantt.schema.json", () => {
    expect(playgroundSchemaJson).toEqual(schemaJson);
  });

  // ─── Cycle detection robustness ───────────────────────────────────────

  it("reports one error per cycle and no false cycles for tasks that merely depend on a cycle", () => {
    const result = validate({
      tasks: [
        { id: "A", category: "g", start: "2026-09-01", end: "2026-09-05", dependsOn: "B" },
        { id: "B", category: "g", start: "2026-09-01", end: "2026-09-05", dependsOn: "A" },
        { id: "C", category: "g", start: "2026-09-01", end: "2026-09-05", dependsOn: "A" }
      ]
    });
    const cycles = result.errors.filter((e) => e.code === "CIRCULAR_DEPENDENCY");
    expect(cycles).toHaveLength(1);
    expect(cycles[0].message).toContain("A -> B -> A");
    expect(cycles[0].message).not.toMatch(/(^|[ >])C( |$)/);
    expect(cycles[0].path).toBe("tasks[0].dependsOn");
  });

  it("reports a self-dependency exactly once", () => {
    const result = validate({
      tasks: [{ id: "self", category: "g", start: "2026-09-01", end: "2026-09-05", dependsOn: "self" }]
    });
    expect(result.errors.filter((e) => e.code === "CIRCULAR_DEPENDENCY")).toHaveLength(1);
  });

  it("does not throw on null task entries combined with a cycle", () => {
    const result = validate({
      tasks: [
        null,
        { id: "A", category: "g", start: "2026-09-01", end: "2026-09-05", dependsOn: "B" },
        { id: "B", category: "g", start: "2026-09-01", end: "2026-09-05", dependsOn: "A" }
      ]
    });
    expect(result.valid).toBe(false);
    expect(result.errors.find((e) => e.code === "CIRCULAR_DEPENDENCY")?.path).toBe("tasks[1].dependsOn");
  });

  it("validates very long reverse-ordered chains without overflowing the stack", () => {
    const tasks = Array.from({ length: 8000 }, (_, i) => ({
      id: `t${i}`,
      category: "g",
      start: "2026-09-01",
      end: "2026-09-02",
      dependsOn: i > 0 ? `t${i - 1}` : null
    })).reverse();
    expect(validate({ tasks }).valid).toBe(true);
  });

  // ─── Strict field formats ─────────────────────────────────────────────

  it("rejects dates with garbage suffixes or padding but accepts well-formed timestamps", () => {
    const result = validate({
      tasks: [
        { id: "a", category: "g", start: "2026-01-01T99:99garbage", end: "2026-01-05" },
        { id: "b", category: "g", start: " 2026-01-01", end: "2026-01-05" },
        { id: "c", category: "g", start: "2026-01-01T09:00:00Z", end: "2026-01-05" }
      ]
    });
    const dateErrors = result.errors.filter((e) => e.code === "INVALID_DATE_FORMAT");
    expect(dateErrors.map((e) => e.taskId)).toEqual(["a", "b"]);
  });

  it("rejects NaN progress", () => {
    const result = validate({
      tasks: [{ id: "n", category: "g", start: "2026-01-01", end: "2026-01-05", progress: Number.NaN }]
    });
    expect(result.errors.some((e) => e.code === "INVALID_PROGRESS")).toBe(true);
  });

  it("rejects invalid meta dates", () => {
    const result = validate({
      meta: { start: "2026-13-01", chartEnd: "soon" },
      tasks: [{ id: "a", category: "g", start: "2026-01-01", end: "2026-01-05" }]
    });
    expect(result.errors.filter((e) => e.code === "INVALID_DATE_FORMAT").map((e) => e.path)).toEqual([
      "meta.start",
      "meta.chartEnd"
    ]);
  });

  it("reports malformed dependency entries with INVALID_DEPENDENCY", () => {
    const base = { category: "g", start: "2026-01-10", end: "2026-01-12" };
    const result = validate({
      tasks: [
        { id: "A", category: "g", start: "2026-01-01", end: "2026-01-05" },
        { id: "num", ...base, dependsOn: 5 },
        { id: "type", ...base, dependsOn: { id: "A", type: "XX" } },
        { id: "huge", ...base, dependsOn: { id: "A", lag: 1e9 } },
        { id: "token", ...base, dependsOn: "A:XX" },
        { id: "shorthand", ...base, dependsOn: "A:FS+99999999d" },
        { id: "ok", ...base, dependsOn: ["A:SS+2d", { id: "A", type: "FF", lag: -1 }] }
      ]
    });
    const invalid = result.errors.filter((e) => e.code === "INVALID_DEPENDENCY").map((e) => e.taskId);
    expect(invalid).toEqual(["num", "type", "huge", "token", "shorthand"]);
    // The unrecognised token is not double-reported as a dangling dependency
    expect(result.errors.some((e) => e.code === "DANGLING_DEPENDENCY")).toBe(false);
  });

  it("accepts ids that look like lag shorthand when the task exists", () => {
    const result = validate({
      tasks: [
        { id: "model-3d", category: "g", start: "2026-01-01", end: "2026-01-05" },
        { id: "B", category: "g", start: "2026-01-10", end: "2026-01-12", dependsOn: "model-3d" }
      ]
    });
    expect(result.valid).toBe(true);
  });

  // ─── Non-blocking warnings ────────────────────────────────────────────

  it("warns about locked tasks that violate their dependencies (DEP_TIMING_CONFLICT)", () => {
    const result = validate({
      meta: { defaultGapDays: 2 },
      tasks: [
        { id: "A", category: "g", start: "2026-01-01", end: "2026-01-10" },
        { id: "L", category: "g", start: "2026-01-05", end: "2026-01-08", dependsOn: "A", locked: true },
        { id: "U", category: "g", start: "2026-01-05", end: "2026-01-08", dependsOn: "A" }
      ]
    });
    expect(result.valid).toBe(true);
    const conflicts = result.warnings!.filter((w) => w.code === "DEP_TIMING_CONFLICT");
    expect(conflicts.map((w) => w.taskId)).toEqual(["L"]);
    expect(conflicts[0].message).toContain("2026-01-12");
  });

  it("warns about every dependency violation in Strict mode (autoCascade: false)", () => {
    const result = validate({
      meta: { autoCascade: false, defaultGapDays: 0 },
      tasks: [
        { id: "A", category: "g", start: "2026-01-01", end: "2026-01-10" },
        { id: "U", category: "g", start: "2026-01-05", end: "2026-01-08", dependsOn: "A:SS" },
        { id: "V", category: "g", start: "2026-01-05", end: "2026-01-08", dependsOn: "A" }
      ]
    });
    expect(result.warnings!.filter((w) => w.code === "DEP_TIMING_CONFLICT").map((w) => w.taskId)).toEqual(["V"]);
  });

  it("warns about milestones with a duration, bad calendars and an invalid targetDate", () => {
    const result = validate({
      meta: { targetDate: "Q4", calendar: { workingDays: [], region: "XX" } },
      calendars: { site: { workingDays: ["Mon", "Funday"], holidays: ["2026-02-30"] } },
      people: [{ id: "p1", name: "Pat", calendar: "night-shift" }],
      tasks: [
        { id: "m", category: "g", start: "2026-01-01", end: "2026-01-03", milestone: true, calendarId: "missing" }
      ]
    });
    expect(result.valid).toBe(true);
    const codes = result.warnings!.map((w) => `${w.code}:${w.path}`);
    expect(codes).toEqual(
      expect.arrayContaining([
        "MILESTONE_HAS_DURATION:tasks[0].end",
        "INVALID_CALENDAR:tasks[0].calendarId",
        "INVALID_DATE_FORMAT:meta.targetDate",
        "INVALID_CALENDAR:meta.calendar.workingDays",
        "INVALID_CALENDAR:meta.calendar.region",
        "INVALID_CALENDAR:calendars.site.workingDays",
        "INVALID_CALENDAR:calendars.site.holidays",
        "INVALID_CALENDAR:people[0].calendar"
      ])
    );
  });

  it("warns about malformed categories and optional task fields without blocking the plan", () => {
    const result = validate({
      categories: { g: { label: "General" } },
      tasks: [{ id: "a", category: "g", start: "2026-01-01", end: "2026-01-05", gapDays: "2" }]
    });
    expect(result.valid).toBe(true);
    expect(result.warnings!.map((w) => w.path)).toEqual(expect.arrayContaining(["categories.g", "tasks[0].gapDays"]));
  });

  it("rejects people and teams entries without a string id and name", () => {
    const result = validate({
      people: [{ name: "No Id" }, null, { id: "p2", name: "Ok" }],
      teams: [{ id: "t" }, { id: " ", name: "Blank id" }],
      tasks: [{ id: "a", category: "g", start: "2026-01-01", end: "2026-01-05" }]
    });
    expect(result.valid).toBe(false);
    expect(result.errors.filter((e) => e.code === "SCHEMA_MISMATCH").map((e) => e.path)).toEqual([
      "people[0]",
      "people[1]",
      "teams[0]",
      "teams[1]"
    ]);
  });

  // ─── Render-sensitive fields (advisory: the sinks sanitize and escape on their own) ──

  describe("render-sensitive field checks", () => {
    const task = (extra: Record<string, unknown> = {}) => ({ id: "a", category: "g", start: "2026-01-01", end: "2026-01-05", ...extra });
    const warningsAt = (result: ReturnType<typeof validate>, code: string) =>
      result.warnings!.filter((w) => w.code === code).map((w) => w.path);

    it("warns about colors that fail the shared CSS color allow-list but keeps the plan valid", () => {
      const result = validate({
        categories: { g: { label: "G", color: "url(x)" }, ok: { label: "Ok", color: "#4FAE93" } },
        people: [{ id: "p", name: "P", color: 'red"><img src=x>' }],
        teams: [{ id: "t", name: "T", color: "rgb(1,2,3);background:url(x)" }],
        notes: [{ id: "n", title: "N", content: "", color: "var(--x);x" }],
        tasks: [task({ color: "expression(alert(1))" }), { ...task({ color: "oklch(70% 0.1 200)" }), id: "b" }]
      });
      expect(result.valid).toBe(true);
      expect(warningsAt(result, "INVALID_COLOR")).toEqual([
        "tasks[0].color",
        "categories.g.color",
        "people[0].color",
        "teams[0].color",
        "notes[0].color"
      ]);
    });

    it("warns about non-numeric costs, over-long ids and non-string text", () => {
      const longId = "x".repeat(300);
      const result = validate({
        tasks: [
          task({ estimatedCost: "5,000", actualCost: Number.NaN, label: 42 }),
          { ...task({ estimatedCost: 5000, actualCost: null }), id: longId }
        ]
      });
      expect(result.valid).toBe(true);
      const paths = result.warnings!.filter((w) => w.code === "SCHEMA_MISMATCH").map((w) => w.path);
      expect(paths).toEqual(["tasks[0].estimatedCost", "tasks[0].actualCost", "tasks[0].label", "tasks[1].id"]);
      const cost = result.warnings!.find((w) => w.path === "tasks[0].estimatedCost")!;
      expect(cost.message).toContain('"5,000"');
      // Messages carry a short preview of hostile values, never the whole payload
      const id = result.warnings!.find((w) => w.path === "tasks[1].id")!;
      expect(id.message.length).toBeLessThan(250);
    });

    it("warns about avatars that are neither initials nor https URLs", () => {
      const result = validate({
        people: [
          { id: "a", name: "A", avatar: "AH" },
          { id: "b", name: "B", avatar: "https://avatars.githubusercontent.com/u/1" },
          { id: "c", name: "C", avatar: "http://evil.test/a.png" },
          { id: "d", name: "D", avatar: "javascript:alert(1)" },
          { id: "e", name: "E", avatar: "//evil.test/a.png" },
          { id: "f", name: "F", avatar: 7 }
        ],
        tasks: [task()]
      });
      expect(result.valid).toBe(true);
      expect(result.warnings!.map((w) => w.path)).toEqual([
        "people[2].avatar",
        "people[3].avatar",
        "people[4].avatar",
        "people[5].avatar"
      ]);
    });

    it("warns about dates in implausible years", () => {
      const result = validate({
        meta: { start: "1026-01-01", targetDate: "3026-06-01" },
        tasks: [task({ end: "2301-01-05", baseline: { start: "1800-01-01", end: "2026-01-05" } })]
      });
      expect(result.valid).toBe(true);
      expect(warningsAt(result, "INVALID_DATE_RANGE")).toEqual([
        "tasks[0].end",
        "tasks[0].baseline.start",
        "meta.start",
        "meta.targetDate"
      ]);
    });

    it("validates a fully hostile plan without throwing and flags every color", () => {
      const XSS = '"><img src=x onerror="window.__xss=1">';
      const hostile = {
        meta: { title: XSS, baselines: XSS },
        categories: { [XSS]: { label: XSS, color: XSS } },
        people: [{ id: XSS, name: XSS, color: XSS, avatar: XSS }],
        teams: [{ id: XSS, name: XSS, color: XSS }],
        notes: [{ id: XSS, title: XSS, content: XSS, color: XSS, tags: [XSS], task_ids: [XSS, `${XSS}-missing`] }],
        tasks: [{ id: XSS, label: XSS, category: XSS, start: "2026-01-01", end: "2026-01-02", color: XSS, estimatedCost: XSS, assignee: XSS, dependsOn: XSS }]
      };
      const result = validate(JSON.parse(JSON.stringify(hostile)));
      expect(result.valid).toBe(false); // the dangling dependency is still an error
      expect(result.warnings!.filter((w) => w.code === "INVALID_COLOR")).toHaveLength(5);
      expect(result.warnings!.some((w) => w.path === "tasks[0].estimatedCost")).toBe(true);
      expect(result.warnings!.some((w) => w.code === "DANGLING_REFERENCE")).toBe(true);
    });
  });

  // ─── Notes and baseline snapshots ─────────────────────────────────────

  describe("notes and baseline snapshots", () => {
    const tasks = [{ id: "t1", category: "g", start: "2026-01-01", end: "2026-01-05" }];

    it("rejects notes whose title, content or tags have the wrong type", () => {
      const result = validate({
        tasks,
        notes: [
          { id: "n1", title: 5, content: "ok" },
          { id: "n2", title: "ok", content: null },
          { id: "n3", title: "ok", content: "ok", tags: ["a", 1] },
          { id: "n4", title: "ok", content: "ok", tags: "a" }
        ]
      });
      expect(result.valid).toBe(false);
      expect(result.errors.map((e) => e.path)).toEqual([
        "notes[0].title",
        "notes[1].content",
        "notes[2].tags",
        "notes[3].tags"
      ]);
    });

    it("warns about bad note timestamps and task_ids that reference missing tasks", () => {
      const result = validate({
        tasks,
        notes: [
          { id: "n1", title: "a", content: "", createdAt: "yesterday", updatedAt: "2026-08-25T10:00:00.000Z", task_ids: ["t1", "gone"] },
          { id: "n2", title: "b", content: "", task_ids: ["gone"], _deleted: true }
        ]
      });
      expect(result.valid).toBe(true);
      expect(result.warnings!.map((w) => `${w.code}:${w.path}`)).toEqual([
        "INVALID_DATE_FORMAT:notes[0].createdAt",
        "DANGLING_REFERENCE:notes[0].task_ids"
      ]);
      expect(result.warnings![1].message).toContain("gone");
    });

    it("warns about malformed baseline snapshots without blocking the plan", () => {
      const result = validate({
        meta: {
          baselines: [
            { id: "ok", name: "Ok", createdAt: "2026-01-01T00:00:00Z", tasks: [{ taskId: "t1", start: "2026-01-01", end: "2026-01-05", estimatedCost: 10 }] },
            { id: "bad-entries", tasks: [{ taskId: "t1", start: "soon", end: "2026-01-05" }, { start: "2026-01-01" }, { taskId: "t1", start: "2026-01-01", end: "2026-01-02", estimatedCost: "10" }] },
            { name: "no id", tasks: [] },
            { id: "no-tasks" }
          ]
        },
        tasks
      });
      expect(result.valid).toBe(true);
      expect(result.warnings!.map((w) => w.path)).toEqual(["meta.baselines[1]", "meta.baselines[2]", "meta.baselines[3]"]);
      expect(result.warnings![0].message).toContain("3 malformed task entries");
      // RTDB may return arrays as objects keyed by index
      const objectForm = validate({ meta: { baselines: { 0: { id: "b", tasks: { 0: { taskId: "t1", start: "2026-01-01", end: "2026-01-02" } } } } }, tasks });
      expect(objectForm.warnings).toEqual([]);
      expect(validate({ meta: { baselines: "x" }, tasks }).warnings!.map((w) => w.path)).toEqual(["meta.baselines"]);
    });
  });

  // ─── Schema contract (schema/jantt.schema.json vs core types and examples) ──

  describe("schema contract", () => {
    const definitions = (schemaJson as any).definitions;

    it("describes the same dependency link shapes the parser accepts", () => {
      expect(definitions.dependencyType.enum).toEqual(["FS", "SS", "FF", "SF"]);
      for (const key of ["lag", "lagDays"]) {
        expect(definitions.dependencyObject.properties[key].minimum).toBe(-MAX_DEPENDENCY_LAG_DAYS);
        expect(definitions.dependencyObject.properties[key].maximum).toBe(MAX_DEPENDENCY_LAG_DAYS);
      }
      const forms = definitions.dependsOn.oneOf.map((f: any) => f.type ?? f.$ref);
      expect(forms).toEqual(["null", "string", "#/definitions/dependencyObject", "array"]);
    });

    it("lists the regions and calendar presets the engine implements", () => {
      const region: string = definitions.workingCalendar.properties.region.description;
      for (const code of ["US", "UK", "GB", "EU", "CA", "AU"]) {
        expect(isSupportedRegion(code)).toBe(true);
        expect(region).toContain(code);
      }
      for (const preset of Object.keys(CALENDAR_PRESETS)) {
        expect(definitions.calendarRef.description).toContain(preset);
      }
    });

    it("accepts every dependsOn form through validate()", () => {
      const result = validate({
        tasks: [
          { id: "A", category: "g", start: "2026-01-01", end: "2026-01-05" },
          { id: "B", category: "g", start: "2026-01-10", end: "2026-01-12", dependsOn: null },
          { id: "C", category: "g", start: "2026-01-10", end: "2026-01-12", dependsOn: "A:SS+2d, B" },
          { id: "D", category: "g", start: "2026-01-10", end: "2026-01-12", dependsOn: { id: "A", type: "FF", lag: -1 } },
          { id: "E", category: "g", start: "2026-01-20", end: "2026-01-22", dependsOn: ["A+2d", { id: "D", lagDays: 0 }] }
        ]
      });
      expect(result.errors).toEqual([]);
    });

    // ajv is not a declared dependency of @jantt/core yet; the structural checks above always run.
    it.skipIf(!Ajv)("validates every shipped example against the JSON schema (and broken ones fail validate())", () => {
      const ajv = new Ajv!({ allErrors: true, strict: false, logger: false });
      const check = ajv.compile(schemaJson);
      for (const [name, example] of Object.entries(VALID_EXAMPLES)) {
        const ok = check(example);
        expect({ name, errors: ok ? null : check.errors }).toEqual({ name, errors: null });
      }
      const link = { category: "g", start: "2026-01-10", end: "2026-01-12" };
      expect(check({ tasks: [{ id: "A", ...link, dependsOn: ["A0:SS+2d", { id: "A1", type: "FF", lag: -1 }] }, { id: "B", ...link, dependsOn: { id: "A", lagDays: 0 } }] })).toBe(true);
      expect(check({ tasks: [{ id: "A", ...link, dependsOn: { id: "B", lag: 99999 } }] })).toBe(false);
      expect(check({ tasks: [{ id: "A", category: "g" }] })).toBe(false);
      for (const broken of [brokenMissingIdJson, brokenBadDateJson, brokenDanglingDepJson]) {
        expect(validate(broken).valid).toBe(false);
      }
    });
  });

  describe("minute-precision validation", () => {
    it("accepts YYYY-MM-DDTHH:mm timestamps and flags same-day inverted times", () => {
      const validRes = validate({
        meta: { scale: "minute", timeFormat: "12h" },
        tasks: [{ id: "A", category: "g", start: "2026-09-01T09:00", end: "2026-09-01T10:30" }]
      });
      expect(validRes.valid).toBe(true);

      const invertedTime = validate({
        tasks: [{ id: "A", category: "g", start: "2026-09-01T14:00", end: "2026-09-01T09:00" }]
      });
      expect(invertedTime.valid).toBe(false);
      expect(invertedTime.errors.some((e) => e.code === "INVALID_DATE_RANGE")).toBe(true);
    });

    it("detects sub-day locked dependency conflicts in minutes", () => {
      const res = validate({
        tasks: [
          { id: "A", category: "g", start: "2026-09-01T09:00", end: "2026-09-01T11:00" },
          { id: "B", category: "g", start: "2026-09-01T10:30", end: "2026-09-01T12:00", locked: true, dependsOn: "A:FS+30m" }
        ]
      });
      expect(res.warnings?.some((w) => w.code === "DEP_TIMING_CONFLICT")).toBe(true);
    });
  });
});
