import { describe, it, expect } from "vitest";
import { validate } from "../src/validator";
import basicJson from "../../../examples/basic.json";
import academicJson from "../../../examples/academic-roadmap.json";
import brokenMissingIdJson from "../../../examples/broken-missing-id.json";
import brokenBadDateJson from "../../../examples/broken-bad-date.json";
import brokenDanglingDepJson from "../../../examples/broken-dangling-dependency.json";

describe("Jantt Schema Validator", () => {
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

  it("fails on broken-missing-id.json with specific message", () => {
    const result = validate(brokenMissingIdJson);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    const idError = result.errors.find((e) => e.code === "MISSING_TASK_ID");
    expect(idError).toBeDefined();
    expect(idError?.message).toContain("missing a required 'id' string");
  });

  it("fails on broken-bad-date.json with specific date range error", () => {
    const result = validate(brokenBadDateJson);
    expect(result.valid).toBe(false);
    const dateRangeError = result.errors.find((e) => e.code === "INVALID_DATE_RANGE");
    expect(dateRangeError).toBeDefined();
    expect(dateRangeError?.taskId).toBe("postech");
    expect(dateRangeError?.message).toContain("end date cannot be earlier than start date");
  });

  it("fails on broken-dangling-dependency.json naming missing task id", () => {
    const result = validate(brokenDanglingDepJson);
    expect(result.valid).toBe(false);
    const depError = result.errors.find((e) => e.code === "DANGLING_DEPENDENCY");
    expect(depError).toBeDefined();
    expect(depError?.taskId).toBe("anu");
    expect(depError?.message).toContain("dependsOn: 'ielts-exam-2' but no task with id 'ielts-exam-2' exists");
  });

  it("detects circular dependencies", () => {
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
});
