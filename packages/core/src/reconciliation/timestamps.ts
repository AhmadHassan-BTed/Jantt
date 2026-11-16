/**
 * Composite CRDT timestamps have the form "<ISO-8601>#<clientId>" (the client part is optional).
 *
 * Ordering is total, locale-independent and identical on every peer:
 * 1. A valid timestamp beats a missing, malformed or implausibly-future one.
 * 2. Valid timestamps compare by instant (so "12:00:00Z" and "12:00:00.000Z" are the same instant
 *    and offsets such as "+02:00" are honoured), then by client id, then by the raw text in code
 *    point order, which keeps the order total.
 */

/**
 * Timestamps more than this far ahead of the local clock are treated as untrusted, so a peer with
 * a broken clock or a crafted far-future stamp cannot win every last-writer-wins decision.
 */
export const MAX_TIMESTAMP_SKEW_MS = 60 * 60 * 1000;

// ISO date-times without an offset would otherwise be parsed in the evaluating peer's time zone.
const NAIVE_DATE_TIME = /T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/;

/** Returns the value when it is a non-empty string usable as a timestamp, otherwise undefined. */
export function readTimestamp(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function splitComposite(ts: string): [string, string] {
  const hashIndex = ts.indexOf("#");
  return hashIndex === -1 ? [ts, ""] : [ts.slice(0, hashIndex), ts.slice(hashIndex + 1)];
}

function parseInstant(iso: string): number {
  return Date.parse(NAIVE_DATE_TIME.test(iso) ? `${iso}Z` : iso);
}

/**
 * Milliseconds since the epoch of a composite timestamp, or NaN when it is missing or unparseable.
 * Never rejects future values; use it for age checks, not for ordering.
 */
export function compositeTimestampToMillis(value: unknown): number {
  const ts = readTimestamp(value);
  return ts ? parseInstant(splitComposite(ts)[0]) : Number.NaN;
}

function codePointCompare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Compares two composite timestamps. Returns a positive number when `tsA` is later, negative when
 * `tsB` is later and 0 when they are equivalent. Non-string inputs count as missing.
 */
export function compareCompositeTimestamps(tsA?: unknown, tsB?: unknown): number {
  const a = readTimestamp(tsA);
  const b = readTimestamp(tsB);
  if (a === b) return 0;
  if (!b) return 1;
  if (!a) return -1;

  const [isoA, clientA] = splitComposite(a);
  const [isoB, clientB] = splitComposite(b);
  const limit = Date.now() + MAX_TIMESTAMP_SKEW_MS;
  const msA = parseInstant(isoA);
  const msB = parseInstant(isoB);
  const validA = Number.isFinite(msA) && msA <= limit;
  const validB = Number.isFinite(msB) && msB <= limit;

  if (validA !== validB) return validA ? 1 : -1;
  if (validA && msA !== msB) return msA > msB ? 1 : -1;
  return codePointCompare(clientA, clientB) || codePointCompare(isoA, isoB);
}
