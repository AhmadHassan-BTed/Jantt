import { levelResources, type ResourceLevelingOptions } from "../../../../packages/core/src/resource-leveler";
import type { Task } from "@jantt/core";

const worker = self as unknown as {
  onmessage: ((event: MessageEvent<{ tasks: Task[]; options: ResourceLevelingOptions }>) => void) | null;
  postMessage: (message: unknown) => void;
};

worker.onmessage = ({ data }) => {
  try {
    worker.postMessage({ result: levelResources(data.tasks, data.options) });
  } catch (error) {
    worker.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};
