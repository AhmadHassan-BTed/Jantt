import { describe, it, expect } from "vitest";
import { exportMsProjectXml, importMsProjectXml } from "../src/ms-project.js";
import type { JanttData } from "@jantt/core";

describe("Microsoft Project XML Interoperability", () => {
  const samplePlan: JanttData = {
    meta: { title: "Falcon Heavy Launch" },
    tasks: [
      { id: "t1", label: "Structural Test", category: "test", start: "2026-11-01", end: "2026-11-04", progress: 1.0 },
      { id: "t2", label: "Avionics Integration", category: "test", start: "2026-11-05", end: "2026-11-10", progress: 0.5, dependsOn: "t1" },
      {
        id: "t3",
        label: "Cryogenic Static Fire",
        category: "test",
        start: "2026-11-12",
        end: "2026-11-15",
        progress: 0.1,
        dependsOn: [{ id: "t2", type: "FS", lagDays: 2 }]
      }
    ]
  };

  it("exports compliant MS Project XML with tasks and dependencies", () => {
    const xml = exportMsProjectXml(samplePlan, { projectName: "Falcon Heavy Launch", author: "SpaceX" });

    expect(xml).toContain("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>");
    expect(xml).toContain("<Title>Falcon Heavy Launch</Title>");
    expect(xml).toContain("<Author>SpaceX</Author>");
    expect(xml).toContain("<Name>Structural Test</Name>");
    expect(xml).toContain("<PercentComplete>100</PercentComplete>");
    expect(xml).toContain("<Name>Avionics Integration</Name>");
    expect(xml).toContain("<PercentComplete>50</PercentComplete>");
    expect(xml).toContain("<PredecessorUID>1</PredecessorUID>");
    // 2 days lag = 9600 tenths of a minute
    expect(xml).toContain("<LinkLag>9600</LinkLag>");
  });

  it("round-trips MS Project XML back into JanttData losslessly", () => {
    const xml = exportMsProjectXml(samplePlan);
    const parsed = importMsProjectXml(xml);

    expect(parsed.meta?.title).toBe("Falcon Heavy Launch");
    expect(parsed.tasks).toHaveLength(3);
    expect(parsed.tasks[0].label).toBe("Structural Test");
    expect(parsed.tasks[0].progress).toBe(1.0);
    expect(parsed.tasks[0].start).toBe("2026-11-01");
    expect(parsed.tasks[0].end).toBe("2026-11-04");

    expect(parsed.tasks[1].label).toBe("Avionics Integration");
    expect(parsed.tasks[1].progress).toBe(0.5);
    expect(parsed.tasks[1].dependsOn).toBe("t1");

    expect(parsed.tasks[2].label).toBe("Cryogenic Static Fire");
    expect(parsed.tasks[2].dependsOn).toEqual([{ id: "t2", type: "FS", lagDays: 2 }]);
  });

  it("maps link types per the MSPDI schema (2 = SF, 3 = SS)", () => {
    const plan: JanttData = {
      tasks: [
        { id: "a", category: "dev", start: "2026-11-02", end: "2026-11-06" },
        { id: "b", category: "dev", start: "2026-11-03", end: "2026-11-09", dependsOn: [{ id: "a", type: "SS", lagDays: 1 }] },
        { id: "c", category: "dev", start: "2026-11-03", end: "2026-11-09", dependsOn: "a:SF" },
        { id: "d", category: "dev", start: "2026-11-03", end: "2026-11-06", dependsOn: "a:FF" }
      ]
    };
    const xml = exportMsProjectXml(plan);
    const types = [...xml.matchAll(/<Type>(\d)<\/Type>/g)].map((m) => m[1]);
    expect(types).toEqual(["3", "2", "0"]);

    const parsed = importMsProjectXml(xml);
    expect(parsed.tasks[1].dependsOn).toEqual([{ id: "a", type: "SS", lagDays: 1 }]);
    // Zero lags are left out so links keep the plan's default gap semantics.
    expect(parsed.tasks[2].dependsOn).toEqual([{ id: "a", type: "SF" }]);
    expect(parsed.tasks[3].dependsOn).toEqual([{ id: "a", type: "FF" }]);
  });

  it("writes task elements in MSPDI schema order (Active and Manual right after Name)", () => {
    const xml = exportMsProjectXml({ tasks: [{ id: "a", label: "A", category: "dev", start: "2026-11-02", end: "2026-11-06" }] });
    expect(xml).toContain("<Name>A</Name>\n      <Active>1</Active>\n      <Manual>0</Manual>\n      <OutlineLevel>1</OutlineLevel>");
    const order = ["<UID>", "<Name>", "<Active>", "<OutlineLevel>", "<Start>", "<Duration>", "<Milestone>", "<PercentComplete>", "<ConstraintType>", "<ExtendedAttribute>"];
    const task = xml.slice(xml.indexOf("<Task>"));
    const positions = order.map((tag) => task.indexOf(tag));
    expect(positions.every((pos, i) => pos >= 0 && (i === 0 || pos > positions[i - 1]))).toBe(true);
  });

  it("writes durations and a Start No Earlier Than constraint so MS Project keeps the dates", () => {
    const xml = exportMsProjectXml({
      tasks: [
        { id: "w", category: "dev", start: "2026-11-02", end: "2026-11-13" }, // Mon..Fri next week = 10 workdays
        { id: "m", category: "dev", start: "2026-11-13", end: "2026-11-13", milestone: true }
      ]
    });
    expect(xml).toContain("<Duration>PT80H0M0S</Duration>");
    expect(xml).toContain("<ConstraintType>4</ConstraintType>");
    expect(xml).toContain("<ConstraintDate>2026-11-02T08:00:00</ConstraintDate>");
    // Milestone: zero duration, finish equals start
    expect(xml).toContain("<Duration>PT0H0M0S</Duration>");
    expect(xml).toContain("<Start>2026-11-13T08:00:00</Start>\n      <Finish>2026-11-13T08:00:00</Finish>");
  });

  it("exports a single-day task as a one-day task unless it is flagged as a milestone", () => {
    const xml = exportMsProjectXml({
      tasks: [
        { id: "d", category: "dev", start: "2026-11-02", end: "2026-11-02" },
        { id: "g", category: "dev", start: "2026-11-03", end: "2026-11-03", milestone: true }
      ]
    });
    const [day, gate] = xml.split("<Task>").slice(1);
    expect(day).toContain("<Duration>PT8H0M0S</Duration>");
    expect(day).toContain("<Milestone>0</Milestone>");
    expect(day).toContain("<Finish>2026-11-02T17:00:00</Finish>");
    expect(gate).toContain("<Milestone>1</Milestone>");
    expect(importMsProjectXml(xml).tasks.map((t) => t.milestone)).toEqual([undefined, true]);
  });

  it("links to ids that look like lag shorthand", () => {
    const xml = exportMsProjectXml({
      tasks: [
        { id: "render-3d", category: "dev", start: "2026-11-02", end: "2026-11-04" },
        { id: "qa", category: "dev", start: "2026-11-05", end: "2026-11-06", dependsOn: "render-3d" }
      ]
    });
    expect(xml).toContain("<PredecessorUID>1</PredecessorUID>");
    expect(xml).toContain("<LinkLag>0</LinkLag>");
    expect(importMsProjectXml(xml).tasks[1].dependsOn).toBe("render-3d");
  });

  it("round-trips non t<n> ids, categories, notes, milestones and the name alias", () => {
    const plan: JanttData = {
      tasks: [
        { id: "design-1", name: "Design <Spec> & \"Review\"", category: "design", start: "2026-11-02", end: "2026-11-06", notes: "Line 1\nLine 2" },
        { id: "gate.A", label: "Gate", category: "milestones", start: "2026-11-09", end: "2026-11-09", milestone: true, dependsOn: "design-1" },
        { id: "build", label: "Build", category: "dev", start: "2026-11-10", end: "2026-11-20", dependsOn: "design-1, gate.A" }
      ]
    };
    const parsed = importMsProjectXml(exportMsProjectXml(plan));
    expect(parsed.tasks.map((t) => t.id)).toEqual(["design-1", "gate.A", "build"]);
    expect(parsed.tasks[0].label).toBe("Design <Spec> & \"Review\"");
    expect(parsed.tasks[0].category).toBe("design");
    expect(parsed.tasks[0].notes).toBe("Line 1\nLine 2");
    expect(parsed.tasks[1].milestone).toBe(true);
    expect(parsed.tasks[1].dependsOn).toBe("design-1");
    // Several zero-lag FS links use the gap exactly like the single-link plain-id form.
    expect(parsed.tasks[2].dependsOn).toEqual([
      { id: "design-1", type: "FS" },
      { id: "gate.A", type: "FS" }
    ]);
  });

  it("skips soft-deleted tombstones and strips XML-illegal characters", () => {
    const xml = exportMsProjectXml({
      tasks: [
        { id: "gone", label: "Deleted", category: "dev", start: "2026-11-02", end: "2026-11-03", _deleted: true },
        { id: "ok", label: "Bell\u0007 and lone \uD83D surrogate 🚀", category: "dev", start: "2026-11-02", end: "2026-11-03" }
      ]
    });
    expect(xml).not.toContain("Deleted");
    expect(xml).not.toMatch(/[\u0000-\u0008]/);
    expect(xml).toContain("<Name>Bell and lone  surrogate 🚀</Name>");
  });

  it("imports a real-world MSPDI file: project summary, summaries, blank and inactive rows, elapsed lag", () => {
    const warnings: string[] = [];
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Project xmlns="http://schemas.microsoft.com/project">
  <SaveVersion>14</SaveVersion>
  <Name>plant.xml</Name>
  <Title>Plant Upgrade</Title>
  <MinutesPerDay>480</MinutesPerDay>
  <Calendars><Calendar><UID>1</UID><Name>Standard</Name></Calendar></Calendars>
  <Tasks>
    <Task><UID>0</UID><ID>0</ID><Name>Plant Upgrade</Name><OutlineLevel>0</OutlineLevel><Summary>1</Summary>
      <Start>2026-11-02T08:00:00</Start><Finish>2026-11-30T17:00:00</Finish></Task>
    <Task><UID>1</UID><ID>1</ID><Name>Engineering</Name><OutlineLevel>1</OutlineLevel><Summary>1</Summary>
      <Start>2026-11-02T08:00:00</Start><Finish>2026-11-13T17:00:00</Finish></Task>
    <Task><UID>2</UID><ID>2</ID><Name><![CDATA[Survey & <scope>]]></Name><OutlineLevel>2</OutlineLevel><Summary>0</Summary>
      <Start>2026-11-02T08:00:00</Start><Finish>2026-11-06T17:00:00</Finish><PercentComplete>40</PercentComplete>
      <Notes>Check &amp;lt;drawings&amp;gt; &#169; 2026</Notes>
      <Baseline><Number>0</Number><Start>2025-01-01T08:00:00</Start><Finish>2025-01-02T17:00:00</Finish></Baseline>
    </Task>
    <!-- <Task><UID>99</UID><Name>Commented out</Name><Start>2026-11-02T08:00:00</Start></Task> -->
    <Task><UID>3</UID><ID>3</ID><IsNull>1</IsNull></Task>
    <Task><UID>4</UID><ID>4</ID><Name>Design</Name><OutlineLevel>2</OutlineLevel>
      <Start>2026-11-09T08:00:00</Start><Finish>2026-11-13T17:00:00</Finish>
      <PredecessorLink><PredecessorUID>2</PredecessorUID><Type>3</Type><LinkLag>14400</LinkLag><LagFormat>8</LagFormat></PredecessorLink>
      <PredecessorLink><PredecessorUID>1</PredecessorUID><Type>1</Type><LinkLag>0</LinkLag><LagFormat>7</LagFormat></PredecessorLink>
    </Task>
    <Task><UID>5</UID><ID>5</ID><Name>Dropped scope</Name><OutlineLevel>1</OutlineLevel><Active>0</Active>
      <Start>2026-11-16T08:00:00</Start><Finish>2026-11-20T17:00:00</Finish></Task>
    <Task><UID>6</UID><ID>6</ID><Name>Handover</Name><OutlineLevel>1</OutlineLevel><Milestone>1</Milestone>
      <Start>2026-11-30T17:00:00</Start><Finish>2026-11-30T17:00:00</Finish>
      <PredecessorLink><PredecessorUID>4</PredecessorUID><Type>1</Type><LinkLag>-4800</LinkLag><LagFormat>7</LagFormat></PredecessorLink>
    </Task>
  </Tasks>
</Project>`;

    const parsed = importMsProjectXml(xml, { onWarning: (m) => warnings.push(m) });
    expect(parsed.meta?.title).toBe("Plant Upgrade");
    expect(parsed.tasks.map((t) => t.id)).toEqual(["t2", "t4", "t6"]);

    const [survey, design, handover] = parsed.tasks;
    expect(survey).toMatchObject({ label: "Survey & <scope>", category: "Engineering", start: "2026-11-02", end: "2026-11-06", progress: 0.4 });
    expect(survey.notes).toBe("Check &lt;drawings&gt; © 2026");
    // Type 3 = SS, LagFormat 8 = elapsed days (14400 tenths of a minute = 1 day); link to a summary dropped
    expect(design.dependsOn).toEqual([{ id: "t2", type: "SS", lagDays: 1 }]);
    expect(design.category).toBe("Engineering");
    expect(handover).toMatchObject({ milestone: true, category: "default", dependsOn: [{ id: "t4", type: "FS", lagDays: -1 }] });

    expect(warnings.join("\n")).toMatch(/summary task/);
    expect(warnings.join("\n")).toMatch(/blank row/);
    expect(warnings.join("\n")).toMatch(/inactive/);
    expect(warnings.join("\n")).toMatch(/link\(s\) pointing to summary/);
  });

  it("reads older Jantt exports that kept the category in Notes", () => {
    const xml = `<Project xmlns="http://schemas.microsoft.com/project"><Title>Old</Title><Tasks>
      <Task><UID>1</UID><Name>A</Name><Start>2026-11-02T08:00:00</Start><Finish>2026-11-03T17:00:00</Finish><Notes>category: design</Notes></Task>
    </Tasks></Project>`;
    const [task] = importMsProjectXml(xml).tasks;
    expect(task.category).toBe("design");
    expect(task.notes).toBeUndefined();
  });

  it("supports prefixed namespaces and byte input", () => {
    const xml = `<?xml version="1.0"?><msp:Project xmlns:msp="http://schemas.microsoft.com/project"><msp:Title>Prefixed</msp:Title>
      <msp:Tasks><msp:Task><msp:UID>1</msp:UID><msp:Name>Café</msp:Name><msp:Start>2026-11-02T08:00:00</msp:Start><msp:Finish>2026-11-03T17:00:00</msp:Finish></msp:Task></msp:Tasks>
    </msp:Project>`;
    const parsed = importMsProjectXml(new TextEncoder().encode(xml));
    expect(parsed.meta?.title).toBe("Prefixed");
    expect(parsed.tasks[0].label).toBe("Café");
  });

  it("rejects files that are not MS Project XML", () => {
    expect(() => importMsProjectXml("<html><body>nope</body></html>")).toThrow(/MSPDI/);
    expect(() => importMsProjectXml(`<Project xmlns="http://schemas.microsoft.com/project"><Name>Empty</Name></Project>`)).toThrow(/no <Tasks>/);
    expect(() => importMsProjectXml(`<Project><Tasks><Task><UID>0</UID><Name>Summary only</Name></Task></Tasks></Project>`)).toThrow(/no importable tasks/);
  });

  it("stays linear on malformed input with thousands of unclosed tags", () => {
    const hostile = `<Project><Tasks>${"<Task><UID>1</UID><Name>x".repeat(50000)}</Tasks></Project>`;
    const started = Date.now();
    expect(() => importMsProjectXml(hostile)).toThrow(/no importable tasks/);
    expect(Date.now() - started).toBeLessThan(2000);
  });
});
