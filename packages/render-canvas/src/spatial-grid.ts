/**
 * Spatial Grid & O(1) Hit-Testing for Canvas Gantt Timelines
 */

import type { Task } from "@jantt/core";
import { diffDays } from "@jantt/core";

export type HitTestType = "bar" | "handle-start" | "handle-end" | "progress" | "none";

export interface HitTestResult {
  task: Task;
  index: number;
  hitType: HitTestType;
  x: number;
  y: number;
  barX: number;
  barWidth: number;
}

export class SpatialGanttGrid {
  private tasks: Task[] = [];
  private rowHeight: number;
  private dayWidth: number;
  private timelineStart: string;

  constructor(tasks: Task[], timelineStart: string, rowHeight = 36, dayWidth = 40) {
    this.tasks = tasks;
    this.timelineStart = timelineStart;
    this.rowHeight = rowHeight;
    this.dayWidth = dayWidth;
  }

  public update(tasks: Task[], timelineStart: string, rowHeight?: number, dayWidth?: number) {
    this.tasks = tasks;
    this.timelineStart = timelineStart;
    if (rowHeight !== undefined) this.rowHeight = rowHeight;
    if (dayWidth !== undefined) this.dayWidth = dayWidth;
  }

  /**
   * O(1) spatial hit testing. Resolves exact clicked task and handle.
   */
  public hitTest(worldX: number, worldY: number): HitTestResult | null {
    if (this.tasks.length === 0 || this.rowHeight <= 0) return null;

    const rowIndex = Math.floor(worldY / this.rowHeight);
    if (rowIndex < 0 || rowIndex >= this.tasks.length) return null;

    const task = this.tasks[rowIndex];
    if (!task || !task.start || !task.end) return null;

    const startOffsetDays = diffDays(this.timelineStart, task.start);
    const durationDays = Math.max(1, diffDays(task.start, task.end) + 1);

    const barX = startOffsetDays * this.dayWidth;
    const barWidth = durationDays * this.dayWidth;

    // Check horizontal bounds with 4px margin
    if (worldX < barX - 4 || worldX > barX + barWidth + 4) {
      return null;
    }

    const HANDLE_SIZE = 8;
    let hitType: HitTestType = "bar";

    if (Math.abs(worldX - barX) <= HANDLE_SIZE) {
      hitType = "handle-start";
    } else if (Math.abs(worldX - (barX + barWidth)) <= HANDLE_SIZE) {
      hitType = "handle-end";
    } else if (task.progress !== undefined && task.progress !== null) {
      const progressX = barX + barWidth * task.progress;
      if (Math.abs(worldX - progressX) <= 6) {
        hitType = "progress";
      }
    }

    return {
      task,
      index: rowIndex,
      hitType,
      x: worldX,
      y: worldY,
      barX,
      barWidth
    };
  }

  public getTaskBounds(index: number): { x: number; y: number; width: number; height: number } | null {
    if (index < 0 || index >= this.tasks.length) return null;
    const task = this.tasks[index];
    if (!task || !task.start || !task.end) return null;

    const startOffsetDays = diffDays(this.timelineStart, task.start);
    const durationDays = Math.max(1, diffDays(task.start, task.end) + 1);

    return {
      x: startOffsetDays * this.dayWidth,
      y: index * this.rowHeight,
      width: durationDays * this.dayWidth,
      height: this.rowHeight
    };
  }
}
