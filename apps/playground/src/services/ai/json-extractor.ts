import type { JanttData } from "@jantt/core";

export interface ExtractionResult {
  data: JanttData | null;
  rawJson: string | null;
  textContent: string;
  source: "fenced-block" | "raw-object" | "none";
}

function cleanJsonString(str: string): string {
  // Strip trailing commas before closing braces/brackets which LLMs occasionally emit
  return str
    .replace(/,\s*([}\]])/g, "$1")
    .trim();
}

/**
 * Extracts a Jantt JSON plan from an AI response containing mixed explanation and code.
 */
export function extractJsonFromResponse(response: string): ExtractionResult {
  if (!response || typeof response !== "string") {
    return { data: null, rawJson: null, textContent: "", source: "none" };
  }

  // 1. Look for ```json ... ``` or ``` ... ``` fenced code blocks
  const fencedRegex = /```(?:json)?\s*([\s\S]*?)\s*```/gi;
  let match: RegExpExecArray | null;
  const jsonCandidates: Array<{ raw: string; data: JanttData; start: number; end: number }> = [];

  while ((match = fencedRegex.exec(response)) !== null) {
    const candidateStr = cleanJsonString(match[1]);
    try {
      const parsed = JSON.parse(candidateStr);
      // Verify basic shape of JanttData (must have tasks or meta or categories)
      if (parsed && typeof parsed === "object" && (Array.isArray(parsed.tasks) || parsed.categories || parsed.meta)) {
        jsonCandidates.push({
          raw: candidateStr,
          data: parsed as JanttData,
          start: match.index,
          end: match.index + match[0].length
        });
      }
    } catch {
      // Not valid JSON in this fence, continue checking
    }
  }

  if (jsonCandidates.length > 0) {
    // Pick the largest candidate (most likely the full project plan)
    jsonCandidates.sort((a, b) => b.raw.length - a.raw.length);
    const best = jsonCandidates[0];

    // Compute remaining explanation text by removing the matched fence
    const textContent = (response.slice(0, best.start) + "\n" + response.slice(best.end)).trim();

    return {
      data: best.data,
      rawJson: best.raw,
      textContent,
      source: "fenced-block"
    };
  }

  // 2. Fallback: Find raw top-level balanced `{ ... }` if not fenced
  const firstBrace = response.indexOf("{");
  const lastBrace = response.lastIndexOf("}");

  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const rawCandidate = cleanJsonString(response.slice(firstBrace, lastBrace + 1));
    try {
      const parsed = JSON.parse(rawCandidate);
      if (parsed && typeof parsed === "object" && (Array.isArray(parsed.tasks) || parsed.categories || parsed.meta)) {
        const textContent = (response.slice(0, firstBrace) + "\n" + response.slice(lastBrace + 1)).trim();
        return {
          data: parsed as JanttData,
          rawJson: rawCandidate,
          textContent,
          source: "raw-object"
        };
      }
    } catch {
      // Ignore
    }
  }

  // 3. No valid plan JSON found
  return {
    data: null,
    rawJson: null,
    textContent: response.trim(),
    source: "none"
  };
}
