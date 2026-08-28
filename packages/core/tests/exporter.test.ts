import { describe, it, expect } from "vitest";
import { exportToCsv } from "../src/exporter";
import { JanttData } from "../src/types";

describe("Exporter Engine", () => {
  const mockData: JanttData = {
    meta: { title: "Export Test Schedule" },
    categories: {
      dev: { label: "Development", color: "#3B82F6" }
    },
    tasks: [
      {
        id: "T1",
        label: "Architecture Setup",
        category: "dev",
        start: "2026-09-01",
        end: "2026-09-05",
        progress: 0.75,
        status: "in-progress",
        notes: "Clean modular architecture"
      },
      {
        id: "M1",
        label: "Launch Alpha",
        category: "dev",
        start: "2026-09-06",
        end: "2026-09-06",
        milestone: true,
        dependsOn: "T1"
      }
    ]
  };

  it("exports valid RFC-4180 CSV with headers and task rows", () => {
    const csv = exportToCsv(mockData);
    expect(csv).toContain("Task ID,Label / Name,Category,Start Date,End Date,Duration (Days),Progress (%),Milestone,Depends On,Status,Notes");
    expect(csv).toContain("T1,Architecture Setup,dev,2026-09-01,2026-09-05,4,75%,FALSE,,in-progress,Clean modular architecture");
    expect(csv).toContain("M1,Launch Alpha,dev,2026-09-06,2026-09-06,0,,TRUE,T1,,");
  });

  it("escapes fields containing commas and quotes properly in CSV", () => {
    const dataWithSpecialChars: JanttData = {
      tasks: [
        {
          id: "T2",
          label: 'Design "NextGen", V2',
          category: "design",
          start: "2026-09-10",
          end: "2026-09-15"
        }
      ]
    };

    const csv = exportToCsv(dataWithSpecialChars);
    expect(csv).toContain('"Design ""NextGen"", V2"');
  });
});
