import {
  type JanttData,
  type Person,
  type Task,
  type Team,
  type TimeScale,
  type LinkRoutingStyle,
  type RowHeightMode,
  validate,
  themeManager,
  getTodayISODate,
  addDays,
  resolveTaskAssignee,
  getTaskDependencyRelations,
  filterDependsOn,
  compressPlanToUrlPayload,
  decompressPlanFromUrlPayload
} from "@jantt/core";
import type {
  SavedProject,
  DateFilterMode,
  CompletedFilterMode,
  ActiveView,
  KanbanSortRule,
  KanbanSortField,
  EffectivePerson
} from "./types";
import {
  DEFAULT_TEMPLATE,
  STORAGE_KEYS,
  PERSON_COLORS,
  PROJECT_SCOPED_KEY_PREFIXES,
  AUTO_SAVE_SNAPSHOT_REASON
} from "./constants";
import { storageService } from "./services/storage";
import { tGlobal } from "./i18n";

/** Share payloads above this size are rejected before decompression (zip-bomb guard). */
export const MAX_SHARE_PAYLOAD_CHARS = 512 * 1024;
/**
 * Share links with more tasks or notes than this are rejected: a crafted link could otherwise
 * store a plan that freezes the tab on every reload.
 */
export const MAX_SHARED_PLAN_ITEMS = 5000;
/** Plan names are single-line and at most this long (a share link can carry any `?name=`). */
export const MAX_PLAN_NAME_LENGTH = 120;

const DEFAULT_SIDEBAR_WIDTH = 480;
const SIDEBAR_MIN_WIDTH = 280;
const SIDEBAR_RESERVED_CHART_WIDTH = 360;
const ROW_HEIGHT_MIN = 20;
const ROW_HEIGHT_MAX = 120;

const VALID_VIEWS: ActiveView[] = ["gantt", "canvas", "kanban", "summary", "tasks", "notes"];
const VALID_SCALES: TimeScale[] = ["day", "week", "month", "quarter", "year"];
const VALID_KANBAN_SORT_FIELDS: KanbanSortField[] = ["priority", "start", "end", "wbs", "assignee", "progress", "name"];

export function formatRelativeTime(isoStr: string | undefined, t = tGlobal): string {
  if (!isoStr) return t("utils.never");
  const time = new Date(isoStr).getTime();
  if (Number.isNaN(time)) return t("utils.unknown");
  const diff = Math.floor((Date.now() - time) / 1000);
  if (diff < 5) return t("utils.justNow");
  if (diff < 60) return t("utils.secondsAgo", { count: diff });
  if (diff < 3600) return t("utils.minutesAgo", { count: Math.floor(diff / 60) });
  if (diff < 86400) return t("utils.hoursAgo", { count: Math.floor(diff / 3600) });
  return t("utils.daysAgo", { count: Math.floor(diff / 86400) });
}

function randomToken(length: number): string {
  try {
    const cryptoApi = (globalThis as { crypto?: Crypto }).crypto;
    if (cryptoApi?.randomUUID) {
      return cryptoApi.randomUUID().replace(/-/g, "").slice(0, length);
    }
    if (cryptoApi?.getRandomValues) {
      const bytes = cryptoApi.getRandomValues(new Uint8Array(length));
      return Array.from(bytes, (b) => (b % 36).toString(36)).join("");
    }
  } catch {
    // Fall through to Math.random
  }
  let out = "";
  while (out.length < length) out += Math.random().toString(36).slice(2);
  return out.slice(0, length);
}

/**
 * Collision-resistant id: `${prefix}-${time}-${random}`.
 * Time keeps ids roughly sortable; the random part makes same-millisecond ids from
 * different collaborators or rapid scripted actions unique.
 */
export function generateId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${randomToken(6)}`;
}

let cachedPeerId: string | null = null;

/**
 * Per-browser collaborator id used for last-writer-wins field timestamps.
 * (Shared by all tabs of this browser on purpose: it identifies the author, not the tab.)
 * It is the tie-breaker of equal timestamps, so it needs enough entropy (48+ bits) to never
 * collide between collaborators, but it is written into every field stamp, so it stays short.
 */
export function getPeerId(): string {
  if (cachedPeerId) return cachedPeerId;
  if (typeof window === "undefined") return "peer-serverless";
  let id = storageService.getItem<string>(STORAGE_KEYS.PEER_ID);
  if (typeof id !== "string" || !id) {
    id = `peer-${randomToken(12)}`;
    storageService.setItem(STORAGE_KEYS.PEER_ID, id);
  }
  cachedPeerId = id;
  return id;
}

/**
 * Fast 53-bit string hash (cyrb53), returned in base 36.
 * Used for content identity checks (snapshot de-dup, share-link de-dup), never for security.
 */
export function hashString(input: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

export function createBlankPlan(title: string): JanttData {
  const today = getTodayISODate();
  return {
    meta: {
      title: title || "New Project Plan",
      scale: "week",
      showCriticalPath: false,
      showBaselines: false
    },
    categories: {
      general: {
        label: "General Tasks",
        color: "#38BDF8",
        soft: "rgba(56, 189, 248, 0.15)"
      }
    },
    tasks: [
      {
        id: generateId("task"),
        label: "Project Kickoff & Scope",
        category: "general",
        start: today,
        end: addDays(today, 5),
        assignee: "Project Lead",
        phase: "Phase 1: Planning",
        priority: "high",
        progress: 0.25,
        status: "in-progress"
      }
    ]
  };
}

/** Deep copy of the built-in template, safe to hand to editor state. */
export function cloneTemplateData(): JanttData {
  return JSON.parse(JSON.stringify(DEFAULT_TEMPLATE.data)) as JanttData;
}

/** The default plan as the user last saved it, or a fresh copy of the built-in template. */
export function loadDefaultPlanData(): JanttData {
  try {
    const stored = storageService.getItem<unknown>(STORAGE_KEYS.DEFAULT_PLAN);
    const parsed = typeof stored === "string" ? JSON.parse(stored) : stored;
    if (parsed && typeof parsed === "object" && validate(parsed).valid) {
      return parsed as JanttData;
    }
  } catch {
    // Fall back to the template
  }
  return cloneTemplateData();
}

function isPlanShape(data: unknown): data is JanttData {
  return Boolean(data && typeof data === "object" && Array.isArray((data as JanttData).tasks));
}

/** Stored shape of plans saved by older versions (linked Google Drive / URL feeds). */
type LegacyStoredProject = Omit<SavedProject, "source"> & { source?: string; sourceUrl?: string };

/**
 * Normalizes one stored project entry. Returns null when the entry cannot be used
 * (no id or no plan data) so it can be quarantined instead of crashing the app.
 */
function normalizeStoredProject(raw: unknown): SavedProject | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Partial<LegacyStoredProject>;
  if (typeof p.id !== "string" || !p.id || !isPlanShape(p.data)) return null;
  const project: LegacyStoredProject = { ...(p as LegacyStoredProject) };
  if (typeof project.name !== "string" || !project.name.trim()) {
    project.name = sanitizePlanName(p.data.meta?.title) || tGlobal("utils.untitledPlan");
  }
  if (typeof project.updatedAt !== "string") {
    project.updatedAt = new Date(0).toISOString();
  }
  // One-time migration: linked feeds (Google Drive / external URL) are no longer supported and
  // become plain local plans. Nothing creates them any more, so this is a no-op after one load.
  const isLegacyFeed =
    project.source === "linked" ||
    (typeof project.sourceUrl === "string" && /(?:drive|docs)\.google\.com/i.test(project.sourceUrl));
  if (isLegacyFeed) {
    delete project.source;
    delete project.lastSyncedAt;
    delete project.syncError;
    // Scan each closing-parenthesis segment once, including names with incomplete badges.
    const segments = project.name.split(")");
    const tail = segments.pop();
    project.name = segments.map((segment) => {
      const badge = segment.search(/\((?:Cloud Feed|\d+\s*tasks)/i);
      return badge === -1 ? segment + ")" : segment.slice(0, badge).trimEnd();
    }).join("").concat(tail ?? "").trim() || tGlobal("utils.untitledPlan");
  } else if (project.source !== undefined && project.source !== "local" && project.source !== "room") {
    delete project.source;
  }
  delete project.sourceUrl;
  return project as SavedProject;
}

/**
 * Copies unreadable saved plans to a backup key before anything can overwrite them.
 * Idempotent: the key is derived from the content, so re-reading the same data never
 * creates more copies. Returns true once a durable backup exists.
 */
function quarantineCorruptProjects(payload: unknown): boolean {
  try {
    const raw = typeof payload === "string" ? payload : JSON.stringify(payload);
    const key = `${STORAGE_KEYS.CORRUPT_PROJECTS_PREFIX}${hashString(raw)}`;
    if (storageService.hasItem(key)) return true;
    const ok = storageService.setItem(key, raw);
    console.warn(
      ok
        ? `Jantt: unreadable saved plans were backed up to "${key}" in browser storage.`
        : "Jantt: unreadable saved plans could not be backed up (browser storage is full)."
    );
    return ok;
  } catch {
    return false;
  }
}

export function loadSavedProjects(): SavedProject[] {
  let stored: unknown;
  try {
    stored = storageService.getItem<unknown>(STORAGE_KEYS.CUSTOM_PROJECTS);
  } catch {
    return [];
  }
  if (stored === null || stored === undefined) return [];

  if (!Array.isArray(stored)) {
    // Unparseable blob: keep a copy before anything can overwrite it, then start clean
    if (quarantineCorruptProjects(stored)) storageService.removeItem(STORAGE_KEYS.CUSTOM_PROJECTS);
    return [];
  }

  const projects: SavedProject[] = [];
  const rejected: unknown[] = [];
  let changed = false;
  for (const entry of stored) {
    const normalized = normalizeStoredProject(entry);
    if (!normalized) {
      rejected.push(entry);
      changed = true;
      continue;
    }
    if (
      normalized.name !== (entry as SavedProject).name ||
      normalized.source !== (entry as SavedProject).source ||
      normalized.updatedAt !== (entry as SavedProject).updatedAt
    ) {
      changed = true;
    }
    projects.push(normalized);
  }

  const backedUp = rejected.length === 0 || quarantineCorruptProjects(rejected);
  if (changed && backedUp) saveCustomProjects(projects);
  return projects;
}

/** Writes the whole project list. Returns false when it could not be stored durably. */
export function saveCustomProjects(projects: SavedProject[]): boolean {
  try {
    return storageService.setItem(STORAGE_KEYS.CUSTOM_PROJECTS, projects);
  } catch {
    return false;
  }
}

/**
 * Read-modify-write of the stored project list. Always starts from the latest stored list
 * so plans written by another tab are never clobbered by this tab's in-memory copy.
 */
export function updateStoredProjects(mutate: (projects: SavedProject[]) => SavedProject[]): boolean {
  return saveCustomProjects(mutate(loadSavedProjects()));
}

/** Storage key of a plan's version-history vault. */
export function snapshotStorageKey(projectId: string): string {
  return `${PROJECT_SCOPED_KEY_PREFIXES.SNAPSHOTS}${projectId}`;
}

/** Removes every per-project key (version history, note selection) of a removed plan. */
export function purgeProjectStorage(projectId: string): void {
  if (!projectId || projectId === "default") return;
  Object.values(PROJECT_SCOPED_KEY_PREFIXES).forEach((prefix) => {
    storageService.removeItem(`${prefix}${projectId}`);
  });
}

/** Reads the persisted Auto-Cascade preference (defaults to enabled). */
export function isAutoCascadeEnabled(): boolean {
  const saved = storageService.getItem<string | boolean>(STORAGE_KEYS.AUTO_CASCADE);
  return !(saved === false || saved === "false");
}

/**
 * `<slug>-<yyyy-mm-dd>.<extension>`: the file name every export of a plan uses. The slug keeps
 * letters and digits of any script, so non-Latin plan names do not collapse to "jantt-plan".
 */
export function buildExportFilename(name: string, extension: string): string {
  const slug =
    Array.from(
      (name || "")
        .normalize("NFC")
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, "-")
        .replace(/^-+|-+$/g, "")
    )
      .slice(0, 80)
      .join("")
      .replace(/-+$/, "") || "jantt-plan";
  const now = new Date();
  const date = [now.getFullYear(), now.getMonth() + 1, now.getDate()]
    .map((part, index) => String(part).padStart(index === 0 ? 4 : 2, "0"))
    .join("-");
  return `${slug}-${date}.${extension}`;
}

/**
 * Downloads text content as a file. The anchor is attached to the document (Firefox ignores
 * detached ones) and the object URL is revoked only after the browser has picked it up
 * (revoking synchronously gives empty downloads in Safari).
 */
export function downloadTextFile(filename: string, content: string, mimeType: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Frees browser storage by thinning version history: every plan keeps all of its named
 * versions (pre-restore backups, replaced edits...) and its newest automatic one; older
 * automatic versions are removed. Returns how many versions were removed.
 */
export function pruneAutomaticSnapshots(): number {
  let removed = 0;
  for (const key of storageService.keys(PROJECT_SCOPED_KEY_PREFIXES.SNAPSHOTS)) {
    const stored = storageService.getItem<unknown>(key);
    if (!Array.isArray(stored)) continue;
    let keptAutomatic = false;
    const kept = stored.filter((entry) => {
      if ((entry as { reason?: unknown } | null)?.reason !== AUTO_SAVE_SNAPSHOT_REASON) return true;
      if (keptAutomatic) return false;
      keptAutomatic = true;
      return true;
    });
    if (kept.length === stored.length) continue;
    // A smaller value fits even when storage is full; a failed write keeps the full history
    if (storageService.setItem(key, kept)) removed += stored.length - kept.length;
  }
  return removed;
}

/**
 * Removes tasks and everything that points at them: dependencies of other tasks and note
 * attachments. Records CRDT tombstones so the deletion propagates to collaborators.
 * Only the links to removed tasks are dropped: every other link keeps its type (SS/FF/SF),
 * lag and written form. Pure: never mutates `data`; untouched tasks keep their identity.
 */
export function deleteTasks(data: JanttData, taskIds: Iterable<string>, deletedAt: string): JanttData {
  const doomed = new Set(taskIds);
  if (doomed.size === 0) return data;

  const allTasks = data.tasks || [];
  const knownIds = new Set(allTasks.map((t) => t.id));
  const tasks = allTasks
    .filter((t) => !doomed.has(t.id))
    .map((t) => {
      if (!getTaskDependencyRelations(t, knownIds).some((rel) => doomed.has(rel.id))) return t;
      return { ...t, dependsOn: filterDependsOn(t.dependsOn, (rel) => !doomed.has(rel.id), knownIds) ?? null };
    });

  const tombstones = { ...(data.meta?.tombstones || {}) };
  doomed.forEach((id) => {
    tombstones[id] = { deletedAt, entityType: "task" };
  });

  const next: JanttData = { ...data, tasks, meta: { ...(data.meta || {}), tombstones } };
  if (Array.isArray(data.notes)) {
    next.notes = data.notes.map((n) =>
      Array.isArray(n.task_ids) && n.task_ids.some((id) => doomed.has(id))
        ? { ...n, task_ids: n.task_ids.filter((id) => !doomed.has(id)) }
        : n
    );
  }
  return next;
}

export function encodeDataToBase64Url(data: JanttData): string {
  try {
    return compressPlanToUrlPayload(data);
  } catch (err) {
    console.error("Failed to encode plan data to base64url:", err);
    return "";
  }
}

export function decodeDataFromBase64Url(base64url: string): JanttData | null {
  if (!base64url || base64url.length > MAX_SHARE_PAYLOAD_CHARS) {
    if (base64url) console.error("Shared plan payload rejected: link is too large.");
    return null;
  }
  try {
    const decoded = decompressPlanFromUrlPayload(base64url);
    if (!isPlanShape(decoded)) return null;
    const noteCount = Array.isArray(decoded.notes) ? decoded.notes.length : 0;
    if (decoded.tasks.length > MAX_SHARED_PLAN_ITEMS || noteCount > MAX_SHARED_PLAN_ITEMS) {
      console.error(`Shared plan payload rejected: more than ${MAX_SHARED_PLAN_ITEMS} tasks or notes.`);
      return null;
    }
    return normalizePlanFields(decoded);
  } catch (err) {
    console.error("Failed to decode plan data from base64url:", err);
    return null;
  }
}

/**
 * Applies `mutate` to the current address and replaces the history entry only when the URL
 * actually changed. The single way the playground's state helpers rewrite the address bar.
 */
export function updateBrowserUrl(mutate: (url: URL) => void): void {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    const before = url.toString();
    mutate(url);
    const after = url.toString();
    if (after !== before) window.history.replaceState(window.history.state, "", after);
  } catch {
    // intentionally ignored: the address bar is cosmetic state; a blocked history API must not break the app
  }
}

/** Removes a `data=` share payload from a URL fragment, keeping any other fragment parameters. */
function stripShareHash(url: URL): void {
  const rawHash = url.hash.replace(/^#/, "");
  if (!rawHash) return;
  if (rawHash.startsWith("data=")) {
    url.hash = "";
    return;
  }
  const hashParams = new URLSearchParams(rawHash);
  if (!hashParams.has("data")) return;
  hashParams.delete("data");
  const rest = hashParams.toString();
  url.hash = rest ? `#${rest}` : "";
}

/**
 * Removes every plan-selecting parameter that is not a room (`url`, `data`, `name`, `plan` and a
 * `#data=` payload) so a reload opens the plan that is active now. The room parameters belong
 * to room sync, which rewrites them whenever the active room changes.
 */
export function clearPlanSelectionFromUrl(): void {
  updateBrowserUrl((url) => {
    ["url", "data", "name", "plan"].forEach((key) => url.searchParams.delete(key));
    stripShareHash(url);
  });
}

/** Reads a share-link payload (`#data=` or `?data=`) and its optional `?name=` from the URL. */
export function readSharePayloadFromUrl(): { payload: string; name: string | null } | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const rawHash = window.location.hash.replace(/^#/, "");
  let payload: string | null = null;
  if (rawHash.startsWith("data=")) {
    payload = rawHash.substring(5);
  } else if (rawHash) {
    payload = new URLSearchParams(rawHash).get("data");
  }
  if (!payload) payload = params.get("data");
  return payload ? { payload, name: params.get("name") } : null;
}

/**
 * Removes the share payload (`data`, `name`) from the address bar so a reload can neither
 * re-import it over the user's edits nor re-run a failing decode in a loop.
 */
export function stripSharePayloadFromUrl(): void {
  updateBrowserUrl((url) => {
    url.searchParams.delete("data");
    url.searchParams.delete("name");
    stripShareHash(url);
  });
}

/** Single-line, trimmed plan name of at most MAX_PLAN_NAME_LENGTH characters ("" when unusable). */
export function sanitizePlanName(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const singleLine = raw.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, " ").replace(/\s+/g, " ").trim();
  // Cut by code point so a name never ends in half an emoji
  return Array.from(singleLine).slice(0, MAX_PLAN_NAME_LENGTH).join("").trim();
}

/**
 * `baseName`, or `baseName (shared)`, `baseName (shared 2)`... (case-insensitive), so a new plan
 * never takes the name of an existing one (or of the built-in template).
 */
export function uniquePlanName(baseName: string, projects: readonly SavedProject[], label = "shared"): string {
  const taken = new Set(projects.map((p) => String(p.name).toLowerCase()));
  taken.add(DEFAULT_TEMPLATE.name.toLowerCase());
  if (!taken.has(baseName.toLowerCase())) return baseName;
  for (let n = 1; ; n++) {
    const candidate = n === 1 ? `${baseName} (${label})` : `${baseName} (${label} ${n})`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

/**
 * Imports a share-link payload as a new local plan. Existing plans are never replaced or
 * removed: a name that is already taken gets a " (shared)" suffix. Re-opening the same link
 * activates the plan imported earlier (with the user's edits). Returns null when the payload
 * cannot be decoded or is too large.
 */
export function importSharedPlan(
  projects: SavedProject[],
  payload: string,
  nameOverride?: string | null
): { projects: SavedProject[]; project: SavedProject; isNew: boolean } | null {
  const payloadHash = hashString(payload);
  const existing = projects.find((p) => p.importedFromHash === payloadHash);
  if (existing) return { projects, project: existing, isNew: false };

  const decoded = decodeDataFromBase64Url(payload);
  if (!decoded) return null;
  const baseName = sanitizePlanName(nameOverride) || sanitizePlanName(decoded.meta?.title) || tGlobal("utils.sharedPlan");
  const name = uniquePlanName(baseName, projects);
  const project: SavedProject = {
    id: generateId("shared"),
    name,
    updatedAt: new Date().toISOString(),
    // The plan title matches the list name, so two plans are never shown under the same title
    data: decoded.meta?.title === name ? decoded : { ...decoded, meta: { ...(decoded.meta || {}), title: name } },
    source: "local",
    importedFromHash: payloadHash
  };
  return { projects: [project, ...projects], project, isNew: true };
}

const TASK_TEXT_FIELDS = ["label", "name", "assignee"] as const;
const NOTE_TEXT_FIELDS = ["title", "content"] as const;

/**
 * Copy of `record` with every listed field turned into a string (numbers and booleans are
 * converted; other non-string values become `fallback`, or are removed when it is undefined).
 * Returns null when every field already was a string or missing.
 */
function coerceTextFields<T extends Record<string, unknown>>(
  record: T,
  fields: readonly string[],
  fallback: string | undefined
): T | null {
  let fixed: Record<string, unknown> | null = null;
  for (const field of fields) {
    const value = record[field];
    if (value === undefined || typeof value === "string") continue;
    fixed = fixed || { ...record };
    if (typeof value === "number" || typeof value === "boolean") fixed[field] = String(value);
    else if (fallback === undefined) delete fixed[field];
    else fixed[field] = fallback;
  }
  return fixed as T | null;
}

/**
 * Normalizes the fields views treat as text where untrusted plans enter the app (JSON editor,
 * file import, share link): task label/name/assignee and note title/content become strings,
 * note tags a string array. O(n), and returns `data` itself when nothing needed fixing, so a
 * well-formed plan keeps its identity (and commits stay cheap).
 */
export function normalizePlanFields(data: JanttData): JanttData {
  let tasksChanged = false;
  const tasks = (data.tasks || []).map((task) => {
    if (!task || typeof task !== "object") return task;
    const fixed = coerceTextFields(task, TASK_TEXT_FIELDS, undefined);
    if (!fixed) return task;
    tasksChanged = true;
    return fixed;
  });

  let notesChanged = false;
  const notes = Array.isArray(data.notes)
    ? data.notes.map((note) => {
        if (!note || typeof note !== "object") return note;
        let fixed = coerceTextFields(note, NOTE_TEXT_FIELDS, "");
        const tags: unknown = note.tags;
        if (tags !== undefined && (!Array.isArray(tags) || tags.some((tag) => typeof tag !== "string"))) {
          fixed = fixed || { ...note };
          const cleaned = Array.isArray(tags)
            ? tags.filter((tag) => ["string", "number"].includes(typeof tag)).map((tag) => String(tag))
            : [];
          if (cleaned.length > 0) fixed.tags = cleaned;
          else delete fixed.tags;
        }
        if (!fixed) return note;
        notesChanged = true;
        return fixed;
      })
    : data.notes;

  if (!tasksChanged && !notesChanged) return data;
  return { ...data, tasks: tasksChanged ? tasks : data.tasks, ...(notesChanged ? { notes } : {}) };
}

function readBooleanPreference(key: string, fallback: boolean): boolean {
  const saved = storageService.getItem<string | boolean>(key);
  if (saved === null || saved === undefined) return fallback;
  return saved === true || saved === "true";
}

function readNumberPreference(key: string): number | null {
  const saved = storageService.getItem<string | number>(key);
  const value = typeof saved === "number" ? saved : parseInt(String(saved ?? ""), 10);
  return Number.isFinite(value) ? value : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function migrateLegacyActiveJson(persistedActiveId: string): void {
  try {
    const legacy = storageService.getItem<unknown>(STORAGE_KEYS.ACTIVE_JSON);
    if (legacy === null) return;
    let migrated = true;
    // The legacy slot only reflects the default plan when the default plan was active
    if (persistedActiveId === "default" && !storageService.hasItem(STORAGE_KEYS.DEFAULT_PLAN)) {
      const parsed = typeof legacy === "string" ? JSON.parse(legacy) : legacy;
      if (parsed && typeof parsed === "object" && validate(parsed).valid) {
        migrated = storageService.setItem(STORAGE_KEYS.DEFAULT_PLAN, parsed);
      }
    }
    if (migrated) storageService.removeItem(STORAGE_KEYS.ACTIVE_JSON);
  } catch {
    // Keep the legacy slot untouched if anything goes wrong
  }
}

/** One-time message about a link found in the address bar at startup (shown as a toast). */
export interface LaunchNotice {
  message: string;
  isError: boolean;
}

export function loadInitialState(compact = false) {
  const isBrowser = typeof window !== "undefined";
  let launchNotice: LaunchNotice | null = null;

  // Legacy linked feeds (?url=) are no longer supported; drop the dead parameter and say so
  if (isBrowser && new URLSearchParams(window.location.search).has("url")) {
    updateBrowserUrl((url) => url.searchParams.delete("url"));
    launchNotice = {
      message: tGlobal("app.legacyPlanLink"),
      isError: true
    };
  }

  let savedProjects = loadSavedProjects();
  let activeProjectId = "default";
  try {
    const savedId = storageService.getItem<string>(STORAGE_KEYS.ACTIVE_PROJECT_ID);
    if (typeof savedId === "string" && (savedId === "default" || savedProjects.some((p) => p.id === savedId))) {
      activeProjectId = savedId;
    }
  } catch {}
  migrateLegacyActiveJson(activeProjectId);

  let initialTheme = "noir";
  try {
    const savedTheme = storageService.getItem<string>(STORAGE_KEYS.THEME);
    if (savedTheme && themeManager.getTheme(savedTheme)) initialTheme = savedTheme;
  } catch {}

  let initialScale: TimeScale | null = null;
  try {
    const savedScale = storageService.getItem<TimeScale>(STORAGE_KEYS.SCALE);
    if (savedScale && VALID_SCALES.includes(savedScale)) initialScale = savedScale;
  } catch {}

  let initialRouting: LinkRoutingStyle = "curved";
  try {
    const savedRouting = storageService.getItem<LinkRoutingStyle>(STORAGE_KEYS.ROUTING);
    if (savedRouting && ["orthogonal", "curved", "direct"].includes(savedRouting)) {
      initialRouting = savedRouting;
    }
  } catch {}

  let initialRowHeightMode: RowHeightMode = "custom";
  try {
    const savedMode = storageService.getItem<RowHeightMode>(STORAGE_KEYS.ROW_HEIGHT_MODE);
    if (savedMode && ["fit", "custom"].includes(savedMode)) initialRowHeightMode = savedMode;
  } catch {}

  let initialRowHeight = 48;
  try {
    const savedHeight = readNumberPreference(STORAGE_KEYS.ROW_HEIGHT);
    if (savedHeight !== null) initialRowHeight = clamp(savedHeight, ROW_HEIGHT_MIN, ROW_HEIGHT_MAX);
  } catch {}

  // Critical path and baselines are off by default, while remembering the user's preference
  let initialCritical = false;
  try {
    initialCritical = readBooleanPreference(STORAGE_KEYS.CRITICAL, false);
  } catch {}

  let initialBaselines = false;
  try {
    initialBaselines = readBooleanPreference(STORAGE_KEYS.BASELINES, false);
  } catch {}

  let initialAutoCascade = true;
  try {
    initialAutoCascade = readBooleanPreference(STORAGE_KEYS.AUTO_CASCADE, true);
  } catch {}

  let initialView: ActiveView = "gantt";
  try {
    const savedView = storageService.getItem<any>(STORAGE_KEYS.VIEW);
    if (savedView === "today") initialView = "tasks";
    else if (savedView && VALID_VIEWS.includes(savedView)) initialView = savedView;
  } catch {}

  const isMobileScreen = isBrowser && window.innerWidth <= 768;
  let initialCollapsed = isMobileScreen;
  try {
    initialCollapsed = readBooleanPreference(STORAGE_KEYS.SIDEBAR_COLLAPSED, isMobileScreen);
  } catch {}

  let initialWidth = DEFAULT_SIDEBAR_WIDTH;
  try {
    const savedW = readNumberPreference(STORAGE_KEYS.SIDEBAR_WIDTH);
    if (savedW !== null) {
      const maxW = isBrowser ? window.innerWidth - SIDEBAR_RESERVED_CHART_WIDTH : savedW;
      initialWidth = clamp(savedW, SIDEBAR_MIN_WIDTH, maxW);
    }
  } catch {}

  // Restore kanban multi-sort rules (only well-formed rules survive)
  const DEFAULT_KANBAN_SORT: KanbanSortRule[] = [
    { field: "priority", direction: "desc" },
    { field: "start", direction: "asc" }
  ];
  let initialKanbanSort: KanbanSortRule[] = DEFAULT_KANBAN_SORT;
  try {
    const savedSort = storageService.getItem<unknown>(STORAGE_KEYS.KANBAN_SORT);
    if (Array.isArray(savedSort)) {
      const rules = savedSort.filter(
        (r): r is KanbanSortRule =>
          Boolean(r) &&
          typeof r === "object" &&
          VALID_KANBAN_SORT_FIELDS.includes((r as KanbanSortRule).field) &&
          ((r as KanbanSortRule).direction === "asc" || (r as KanbanSortRule).direction === "desc")
      );
      if (rules.length > 0) initialKanbanSort = rules;
    }
  } catch {}

  // Restore person filter
  let initialPersonFilter = "all";
  try {
    const savedPF = storageService.getItem<string>(STORAGE_KEYS.PERSON_FILTER);
    if (typeof savedPF === "string" && savedPF) initialPersonFilter = savedPF;
  } catch {}

  // Restore date filter mode
  let initialDateFilterMode: DateFilterMode = "all";
  try {
    const savedDFM = storageService.getItem<DateFilterMode>(STORAGE_KEYS.DATE_FILTER_MODE);
    if (savedDFM && ["all", "today", "week", "date", "range"].includes(savedDFM)) initialDateFilterMode = savedDFM;
  } catch {}

  // Restore completed filter mode
  let initialCompletedFilterMode: CompletedFilterMode = "show";
  try {
    const savedCFM = storageService.getItem<CompletedFilterMode>(STORAGE_KEYS.COMPLETED_FILTER_MODE);
    if (savedCFM && ["show", "dim", "filter"].includes(savedCFM)) initialCompletedFilterMode = savedCFM;
  } catch {}

  // Check URL share params (?view=, ?theme=, ?scale=, ?room=, #data=, ?data=, ?plan=default)
  if (isBrowser) {
    try {
      const urlParams = new URLSearchParams(window.location.search);

      const viewParam = urlParams.get("view");
      if (viewParam && VALID_VIEWS.includes(viewParam as ActiveView)) {
        initialView = viewParam as ActiveView;
      }

      const completedParam = urlParams.get("completed") as CompletedFilterMode;
      if (completedParam && ["show", "dim", "filter"].includes(completedParam)) {
        initialCompletedFilterMode = completedParam;
      }

      const themeParam = urlParams.get("theme");
      if (themeParam && themeManager.getTheme(themeParam)) {
        initialTheme = themeParam;
      }

      const scaleParam = urlParams.get("scale") as TimeScale;
      if (scaleParam && VALID_SCALES.includes(scaleParam)) {
        initialScale = scaleParam;
      }

      const roomParam = urlParams.get("room") || urlParams.get("cloud");
      if (roomParam) {
        // 1. Room deep link: open the cached copy right away (room sync refreshes it)
        const existingRoom = savedProjects.find(
          (p) => p.source === "room" && p.roomId?.toLowerCase() === roomParam.toLowerCase().trim()
        );
        if (existingRoom) activeProjectId = existingRoom.id;
      } else {
        // 2. Share link: strip it before decoding so a reload can never re-import or crash-loop
        const share = readSharePayloadFromUrl();
        if (share) {
          stripSharePayloadFromUrl();
          const imported = importSharedPlan(savedProjects, share.payload, share.name);
          if (!imported) {
            launchNotice = { message: tGlobal("app.shareLinkInvalid"), isError: true };
          } else if (imported.isNew) {
            savedProjects = imported.projects;
            const stored = saveCustomProjects(savedProjects);
            activeProjectId = imported.project.id;
            launchNotice = stored
              ? { message: tGlobal("app.shareLinkImported", { name: imported.project.name }), isError: false }
              : {
                  message: tGlobal("app.shareLinkStorageFull", { name: imported.project.name }),
                  isError: true
                };
          } else {
            activeProjectId = imported.project.id;
            launchNotice = { message: tGlobal("app.shareLinkAlreadyImported", { name: imported.project.name }), isError: false };
          }
        } else if (urlParams.get("plan") === "default") {
          activeProjectId = "default";
        }
      }
    } catch (err) {
      console.error("Error reading URL share params", err);
    }
  }

  const activeProject = activeProjectId !== "default" ? savedProjects.find((p) => p.id === activeProjectId) : undefined;
  if (!activeProject) activeProjectId = "default";
  const initialParsed: JanttData = activeProject ? activeProject.data : loadDefaultPlanData();
  const initialJson = JSON.stringify(initialParsed, null, 2);
  storageService.setItem(STORAGE_KEYS.ACTIVE_PROJECT_ID, activeProjectId);

  const metaScale = initialParsed?.meta?.scale;
  // Open the long example at a useful overview on a first phone visit. Saved zoom and shared
  // links retain precedence, and imported plans keep their chosen scale.
  const overview = compact && activeProjectId === "default" ? "quarter" : metaScale;

  return {
    activeProjectId,
    initialJson,
    initialParsed,
    /** The project list as loaded (including a just-imported share link). */
    savedProjects,
    initialTheme,
    initialScale: initialScale ?? (overview && VALID_SCALES.includes(overview) ? overview : "week"),
    initialRouting,
    initialRowHeightMode,
    initialRowHeight,
    initialCritical,
    initialBaselines,
    initialAutoCascade,
    initialView,
    initialCollapsed,
    initialWidth,
    initialKanbanSort,
    initialPersonFilter,
    initialDateFilterMode,
    initialCompletedFilterMode,
    /** What happened to a share or legacy link found in the URL, for a one-time toast (or null). */
    launchNotice
  };
}

/** Hosts that serve account avatars. Any other image URL would leak every viewer's IP address. */
const AVATAR_HOST_PATTERN = /(^|\.)(githubusercontent\.com|googleusercontent\.com|gravatar\.com)$/i;

/**
 * The avatar as a loadable image URL: https on an allowlisted avatar host only, otherwise
 * undefined (render initials instead). Plans, imports and room members are untrusted input.
 */
export function safeAvatarUrl(raw: unknown): string | undefined {
  if (typeof raw !== "string" || !raw.trim()) return undefined;
  try {
    const url = new URL(raw.trim());
    return url.protocol === "https:" && AVATAR_HOST_PATTERN.test(url.hostname) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

/** A stored avatar value: initials (no URL characters) or an allowlisted URL; anything else is dropped. */
function sanitizeAvatarValue(raw: unknown): string | undefined {
  if (typeof raw === "string" && raw.trim() && !/[:/\\]/.test(raw)) return raw;
  return safeAvatarUrl(raw);
}

/**
 * Keeps only well-formed registry entries (object with a non-empty string id), coerces their
 * name to a string and drops avatars that are neither initials nor an allowlisted image URL,
 * so malformed people/teams from JSON, imports or collaborators can never crash rendering or
 * make the app load images from arbitrary servers.
 */
export function sanitizeRegistry<T extends { id: string; name: string }>(raw: unknown): T[] {
  if (!Array.isArray(raw)) return [];
  const out: T[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const item = entry as T & { avatar?: unknown };
    if (typeof item.id !== "string" || !item.id) continue;
    let next: T & { avatar?: unknown } = item;
    if (typeof item.name !== "string") next = { ...next, name: String(item.name ?? item.id) };
    if (item.avatar !== undefined) {
      const avatar = sanitizeAvatarValue(item.avatar);
      if (avatar !== item.avatar) {
        next = { ...next };
        if (avatar) next.avatar = avatar;
        else delete next.avatar;
      }
    }
    out.push(next);
  }
  return out;
}

export function getEffectivePeople(data: JanttData | null, registeredPeople: Person[]): EffectivePerson[] {
  const result: EffectivePerson[] = sanitizeRegistry<Person>(registeredPeople).map((p) => ({ ...p }));
  if (!data) return result;

  const knownIds = new Set(result.map((p) => p.id.toLowerCase()));
  const knownNames = new Set(result.map((p) => p.name.toLowerCase()));

  const discovered = new Map<string, { role?: string }>();

  // 1. From meta.person (Project Lead / Candidate / Owner)
  if (data.meta?.person && typeof data.meta.person === "string" && data.meta.person.trim()) {
    discovered.set(data.meta.person.trim(), { role: "Project Lead / Owner" });
  }

  // 2. From tasks assignee
  if (Array.isArray(data.tasks)) {
    data.tasks.forEach((t) => {
      if (t && !t._deleted && t.assignee && typeof t.assignee === "string" && t.assignee.trim()) {
        const name = t.assignee.trim();
        if (!discovered.has(name)) {
          discovered.set(name, {});
        }
      }
    });
  }

  // 3. From documents owner
  if (Array.isArray(data.documents)) {
    data.documents.forEach((d) => {
      if (d && d.owner && typeof d.owner === "string" && d.owner.trim()) {
        const name = d.owner.trim();
        if (!discovered.has(name)) {
          discovered.set(name, {});
        }
      }
    });
  }

  let colorIdx = result.length;
  discovered.forEach((metaInfo, name) => {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (!knownNames.has(name.toLowerCase()) && !knownIds.has(slug) && !knownIds.has(name.toLowerCase())) {
      result.push({
        id: slug || name,
        name: name,
        role: metaInfo.role,
        color: PERSON_COLORS[colorIdx % PERSON_COLORS.length],
        isInferred: true
      });
      knownNames.add(name.toLowerCase());
      knownIds.add(slug);
      colorIdx++;
    }
  });

  return result;
}

export function isTaskMatchingPersonFilter(
  task: Task,
  selectedPersonFilter: string,
  effectivePeople: EffectivePerson[],
  teams: Team[]
): boolean {
  if (!selectedPersonFilter || selectedPersonFilter === "all" || selectedPersonFilter.startsWith("sort:")) {
    return true;
  }
  if (selectedPersonFilter.startsWith("team:")) {
    const targetTeamId = selectedPersonFilter.replace("team:", "");
    const assigneeInfo = resolveTaskAssignee(task, effectivePeople, teams);
    return assigneeInfo.team?.id === targetTeamId || task.teamId === targetTeamId;
  }
  const targetPerson = effectivePeople.find((p) => p.id === selectedPersonFilter);
  const assigneeInfo = resolveTaskAssignee(task, effectivePeople, teams);
  return (
    task.assignee === selectedPersonFilter ||
    (targetPerson && task.assignee === targetPerson.name) ||
    assigneeInfo.person?.id === selectedPersonFilter ||
    assigneeInfo.person?.name === selectedPersonFilter
  );
}

export function sortTasksByAssignee(
  tasks: Task[],
  effectivePeople: EffectivePerson[],
  teams: Team[]
): Task[] {
  return [...tasks].sort((a, b) => {
    const aInfo = resolveTaskAssignee(a, effectivePeople, teams);
    const bInfo = resolveTaskAssignee(b, effectivePeople, teams);
    const aName = (aInfo.displayName || a.assignee || "").toLowerCase();
    const bName = (bInfo.displayName || b.assignee || "").toLowerCase();
    if (!aName && bName) return 1;
    if (aName && !bName) return -1;
    return aName.localeCompare(bName);
  });
}
