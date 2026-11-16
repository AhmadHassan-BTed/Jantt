import { describe, it, expect } from "vitest";
import {
  resolvePersonById,
  resolveTeamById,
  resolveTaskAssignee,
  Person,
  Team,
  Task
} from "../src";

describe("Team & Member Resolver", () => {
  const sampleTeams: Team[] = [
    { id: "team-eng", name: "Core Engineering", color: "#38BDF8", description: "Frontend and Backend platform" },
    { id: "team-design", name: "Product Design", color: "#F43F5E", description: "UI/UX and Brand" }
  ];

  const samplePeople: Person[] = [
    { id: "person-alex", name: "Alex Morgan", role: "Tech Lead", teamId: "team-eng", color: "#4FAE93" },
    { id: "person-sarah", name: "Sarah Chen", role: "Design Lead", teamId: "team-design", color: "#F59E0B" },
    { id: "person-john", name: "John Doe", role: "General Contributor", color: "#A78BFA" }
  ];

  describe("resolvePersonById", () => {
    it("resolves person by exact ID", () => {
      const person = resolvePersonById(samplePeople, "person-alex");
      expect(person).toBeDefined();
      expect(person?.name).toBe("Alex Morgan");
      expect(person?.role).toBe("Tech Lead");
    });

    it("resolves person by exact or case-insensitive name fallback", () => {
      const person1 = resolvePersonById(samplePeople, "Sarah Chen");
      expect(person1?.id).toBe("person-sarah");

      const person2 = resolvePersonById(samplePeople, "alex morgan");
      expect(person2?.id).toBe("person-alex");
    });

    it("returns undefined for non-existent ID or name", () => {
      expect(resolvePersonById(samplePeople, "unknown-id")).toBeUndefined();
      expect(resolvePersonById(undefined, "person-alex")).toBeUndefined();
      expect(resolvePersonById(samplePeople, "")).toBeUndefined();
    });
  });

  describe("resolveTeamById", () => {
    it("resolves team by exact ID", () => {
      const team = resolveTeamById(sampleTeams, "team-eng");
      expect(team).toBeDefined();
      expect(team?.name).toBe("Core Engineering");
      expect(team?.color).toBe("#38BDF8");
    });

    it("resolves team by name fallback", () => {
      const team = resolveTeamById(sampleTeams, "product design");
      expect(team?.id).toBe("team-design");
    });

    it("returns undefined for unknown team", () => {
      expect(resolveTeamById(sampleTeams, "unknown")).toBeUndefined();
      expect(resolveTeamById(undefined, "team-eng")).toBeUndefined();
    });
  });

  describe("resolveTaskAssignee", () => {
    it("resolves full person, team, and initials from member ID", () => {
      const task: Task = {
        id: "task-1",
        label: "Build API",
        category: "dev",
        start: "2026-09-01",
        end: "2026-09-05",
        assignee: "person-alex"
      };

      const resolved = resolveTaskAssignee(task, samplePeople, sampleTeams);
      expect(resolved.person?.id).toBe("person-alex");
      expect(resolved.displayName).toBe("Alex Morgan");
      expect(resolved.role).toBe("Tech Lead");
      expect(resolved.team?.id).toBe("team-eng");
      expect(resolved.team?.name).toBe("Core Engineering");
      expect(resolved.avatarColor).toBe("#4FAE93");
      expect(resolved.initials).toBe("AM");
    });

    it("resolves person by name fallback if assignee contains name", () => {
      const task: Task = {
        id: "task-2",
        label: "Create Mockups",
        category: "design",
        start: "2026-09-01",
        end: "2026-09-05",
        assignee: "Sarah Chen"
      };

      const resolved = resolveTaskAssignee(task, samplePeople, sampleTeams);
      expect(resolved.person?.id).toBe("person-sarah");
      expect(resolved.team?.name).toBe("Product Design");
      expect(resolved.initials).toBe("SC");
    });

    it("handles direct task teamId when member has no team", () => {
      const task: Task = {
        id: "task-3",
        label: "General Work",
        category: "dev",
        start: "2026-09-01",
        end: "2026-09-05",
        assignee: "person-john",
        teamId: "team-eng"
      };

      const resolved = resolveTaskAssignee(task, samplePeople, sampleTeams);
      expect(resolved.person?.id).toBe("person-john");
      expect(resolved.team?.name).toBe("Core Engineering");
    });

    it("handles unassigned tasks gracefully", () => {
      const task: Task = {
        id: "task-4",
        label: "Unassigned Task",
        category: "dev",
        start: "2026-09-01",
        end: "2026-09-05"
      };

      const resolved = resolveTaskAssignee(task, samplePeople, sampleTeams);
      expect(resolved.person).toBeUndefined();
      expect(resolved.team).toBeUndefined();
      expect(resolved.displayName).toBe("Unassigned");
    });
  });

  describe("hardening against untrusted plan data", () => {
    const baseTask: Task = { id: "t", category: "dev", start: "2026-09-01", end: "2026-09-05" };

    it("never returns an avatar color that could break out of a style attribute", () => {
      const people = [
        { id: "p1", name: "Mallory", color: 'red" onmouseover="alert(1)', teamId: "team-design" },
        { id: "p2", name: "Eve", color: "url(javascript:alert(1))" }
      ] as Person[];
      expect(resolveTaskAssignee({ ...baseTask, assignee: "p1" }, people, sampleTeams).avatarColor).toBe("#F43F5E");
      expect(resolveTaskAssignee({ ...baseTask, assignee: "p2" }, people, sampleTeams).avatarColor).toBe("#38BDF8");
    });

    it("falls back past hostile person and team colors to the default (markup, url(), declarations)", () => {
      const payloads = ['red"><img src=x onerror=alert(1)>', "url(https://attacker.example/x)", "red; background: url(x)", "#12345", 42, null];
      for (const color of payloads) {
        const teams = [{ id: "tm", name: "Team", color }] as unknown as Team[];
        const people = [{ id: "p", name: "P", teamId: "tm", color }] as unknown as Person[];
        expect(resolveTaskAssignee({ ...baseTask, assignee: "p" }, people, teams).avatarColor).toBe("#38BDF8");
      }
    });

    it("accepts hex, rgb()/hsl(), named colors and theme tokens", () => {
      for (const color of ["#abc", "#A1B2C3", "#a1b2c3d4", "rgb(10, 20, 30)", "hsla(120deg 50% 50% / 0.5)", "teal", "var(--jantt-accent)"]) {
        const people = [{ id: "p", name: "P", color }] as Person[];
        expect(resolveTaskAssignee({ ...baseTask, assignee: "p" }, people).avatarColor).toBe(color);
      }
    });

    it("tolerates null holes, nameless entries, object-form lists and non-string assignees", () => {
      const people = [null, { id: "x" }, ...samplePeople] as unknown as Person[];
      const teams = { a: null, b: { id: "y" }, c: sampleTeams[0] } as unknown as Team[];
      expect(resolvePersonById(people, "sarah chen")?.id).toBe("person-sarah");
      expect(resolveTeamById(teams, "core engineering")?.id).toBe("team-eng");
      expect(() => resolveTaskAssignee({ ...baseTask, assignee: 42 as unknown as string }, people, teams)).not.toThrow();
      expect(resolveTaskAssignee({ ...baseTask, assignee: 42 as unknown as string }, people, teams).displayName).toBe("42");
    });

    it("resolves people by username with or without '@'", () => {
      const people = [{ id: "u-1", name: "Ahmad", username: "@ahmad" }] as Person[];
      expect(resolvePersonById(people, "ahmad")?.id).toBe("u-1");
      expect(resolvePersonById(people, "@Ahmad")?.id).toBe("u-1");
    });

    it("builds initials from code points and ignores '@' handle prefixes", () => {
      const initials = (name: string) => resolveTaskAssignee({ ...baseTask, assignee: name }).initials;
      expect(initials("@octocat")).toBe("O");
      expect(initials("😀 Smile")).toBe("😀S");
      expect(initials("𠮷野 家")).toBe("𠮷家");
    });
  });
});
