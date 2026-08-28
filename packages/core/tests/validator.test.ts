import { describe, it, expect } from "vitest";
import { validate } from "../src/validator";
import basicJson from "../../../examples/basic.json";
import academicJson from "../../../examples/academic-roadmap.json";
import constructionJson from "../../../examples/construction-enterprise.json";
import brokenMissingIdJson from "../../../examples/broken-missing-id.json";
import brokenBadDateJson from "../../../examples/broken-bad-date.json";
import brokenDanglingDepJson from "../../../examples/broken-dangling-dependency.json";

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
});
