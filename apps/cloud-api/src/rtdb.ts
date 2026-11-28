import { HttpError, type FetchLike } from "./types";

export interface RtdbEtagResult<T> {
  value: T | null;
  etag: string | null;
}

export interface RtdbPutResult {
  ok: boolean;
  status: number;
  etag: string | null;
}

export interface RtdbClient {
  get<T>(path: string): Promise<T | null>;
  getWithEtag<T>(path: string): Promise<RtdbEtagResult<T>>;
  put<T>(path: string, value: T, ifMatchEtag?: string | null): Promise<RtdbPutResult>;
  patch(path: string, updates: Record<string, unknown>): Promise<void>;
  delete(path: string): Promise<void>;
}

const FORBIDDEN_SEGMENT_PATTERN = /^(?:\.|\.\.)$|[?#]/;

export function buildRtdbUrl(databaseUrl: string, path: string): string {
  const base = databaseUrl.replace(/\/+$/, "");
  const trimmed = path.replace(/^\/+|\/+$/g, "");
  if (!trimmed) {
    return `${base}/.json`;
  }
  const segments = trimmed.split("/");
  for (const segment of segments) {
    if (!segment || FORBIDDEN_SEGMENT_PATTERN.test(segment)) {
      throw new HttpError(400, "INVALID_PATH", "Invalid database path segment.");
    }
  }
  const encoded = segments.map((s) => encodeURIComponent(s)).join("/");
  return `${base}/${encoded}.json`;
}

export class FirebaseRtdbClient implements RtdbClient {
  private readonly databaseUrl: string;
  private readonly getAccessToken: () => Promise<string>;
  private readonly fetchFn: FetchLike;

  constructor(databaseUrl: string, getAccessToken: () => Promise<string>, fetchFn: FetchLike = fetch) {
    this.databaseUrl = databaseUrl.replace(/\/+$/, "");
    this.getAccessToken = getAccessToken;
    this.fetchFn = fetchFn;
  }

  private async request(
    method: string,
    path: string,
    options: { body?: unknown; headers?: Record<string, string>; allowPreconditionFail?: boolean } = {}
  ): Promise<Response> {
    const token = await this.getAccessToken();
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      ...(options.headers || {})
    };
    let serialized: string | undefined;
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json; charset=utf-8";
      serialized = JSON.stringify(options.body);
    }

    const response = await this.fetchFn(buildRtdbUrl(this.databaseUrl, path), {
      method,
      headers,
      body: serialized
    });

    if (options.allowPreconditionFail && response.status === 412) {
      return response;
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new HttpError(
        502,
        "RTDB_ERROR",
        `Firebase Realtime Database ${method} failed (${response.status}).`,
        detail.slice(0, 200)
      );
    }
    return response;
  }

  async get<T>(path: string): Promise<T | null> {
    const res = await this.request("GET", path);
    const data = (await res.json()) as T | null;
    return data ?? null;
  }

  async getWithEtag<T>(path: string): Promise<RtdbEtagResult<T>> {
    const res = await this.request("GET", path, {
      headers: { "X-Firebase-ETag": "true" }
    });
    const etag = res.headers.get("ETag") || res.headers.get("etag");
    const data = (await res.json()) as T | null;
    return { value: data ?? null, etag };
  }

  async put<T>(path: string, value: T, ifMatchEtag?: string | null): Promise<RtdbPutResult> {
    const headers: Record<string, string> = {};
    if (ifMatchEtag) {
      headers["If-Match"] = ifMatchEtag;
    }
    const res = await this.request("PUT", path, {
      body: value,
      headers,
      allowPreconditionFail: Boolean(ifMatchEtag)
    });
    const etag = res.headers.get("ETag") || res.headers.get("etag");
    if (res.status === 412) {
      await res.body?.cancel?.();
      return { ok: false, status: 412, etag };
    }
    await res.body?.cancel?.();
    return { ok: true, status: res.status, etag };
  }

  async patch(path: string, updates: Record<string, unknown>): Promise<void> {
    const res = await this.request("PATCH", path, { body: updates });
    await res.body?.cancel?.();
  }

  async delete(path: string): Promise<void> {
    const res = await this.request("DELETE", path);
    await res.body?.cancel?.();
  }
}

