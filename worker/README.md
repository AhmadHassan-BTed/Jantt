# Jantt CORS Proxy - Cloudflare Worker

A small, read-only proxy that lets the Jantt web app download public plan JSON files from cloud hosts (raw GitHub files, GitHub Gists and Dropbox) that do not send CORS headers.

## Why is this needed?

Some file hosts do not send CORS headers on their download endpoints, so a browser cannot read the file directly. This Worker fetches the file server-side and returns it with an `Access-Control-Allow-Origin` header for the Jantt app.

`@jantt/core` never uses a proxy on its own. A proxy is used only when the app passes one per call: `fetchRemotePlan(url, { proxyUrl: "https://jantt-cors-proxy.YOUR-SUBDOMAIN.workers.dev" })`. The page-wide `window.__JANTT_CORS_PROXY` global is deprecated and read only when the call also passes `allowGlobalOverrides: true`, so no other script on the page can pick the proxy. Even with a proxy, the library tries the direct request first and falls back to the proxy only when the browser blocks it. URLs carrying credentials (such as `?token=`) are never sent to the proxy.

## Cost

Cloudflare Workers' free tier includes 100,000 requests per day.

## Deploy

1. Create a Cloudflare account at [dash.cloudflare.com](https://dash.cloudflare.com).
2. Log in from this directory (`/worker`):

   ```bash
   npx wrangler login
   ```

3. Deploy:

   ```bash
   npx wrangler deploy
   ```

   Wrangler prints the Worker URL, for example `https://jantt-cors-proxy.YOUR-SUBDOMAIN.workers.dev`.

4. Point the app at it with the `proxyUrl` option (see above).

### Configuration

Settings live in `wrangler.toml` under `[vars]`:

| Variable | Default | Purpose |
| --- | --- | --- |
| `ALLOW_DEV_ORIGINS` | `"false"` | Accept `http://localhost` / `http://127.0.0.1` origins. For local work, set `ALLOW_DEV_ORIGINS=true` in a `.dev.vars` file used by `npx wrangler dev`, not in production. |
| `EXTRA_ALLOWED_ORIGINS` | `""` | Comma-separated origins allowed in addition to `https://ahmadhassan-bted.github.io`. |
| `EXTRA_ALLOWED_HOSTS` | `""` | Comma-separated upstream host suffixes allowed in addition to `raw.githubusercontent.com`, `gist.githubusercontent.com` and Dropbox. |

To enable rate limiting per client IP, uncomment the `[[ratelimits]]` block in `wrangler.toml`. This needs a Wrangler version with Workers Rate Limiting support. The Worker uses the `RATE_LIMITER` binding when it exists and skips the check otherwise.

## How it works

```
Browser (allow-listed origin)
    │  GET https://jantt-cors-proxy.xxx.workers.dev/?url=https://raw.githubusercontent.com/...
    ▼
Cloudflare Worker
    │  1. Rejects other origins (403), methods (405) and targets (400)
    │  2. Serves a copy cached in this isolate if it is under 4 s old
    │  3. Otherwise fetches upstream (redirects re-checked, 10 s timeout, 5 MB cap)
    ▼
Remote host (returns the JSON file)
    │
    ▼
Worker returns it as application/json with CORS headers
```

Caching is per isolate. Each Cloudflare isolate keeps its own small in-memory cache (at most 100 entries and 20 MB) and merges identical requests that are in flight at the same time. There is no shared edge cache, and the cache is lost when the isolate is recycled. Files the upstream marks `Cache-Control: no-store` or `private` are never cached, and such an answer also drops any older copy.

Quota shield: when the upstream host answers 429 or 503, or cannot be reached, the Worker may serve the last good copy for up to 60 s after it went stale. The response is marked `X-Jantt-Quota-Shield: active`. Answers of 401, 403, 404 and 410 are passed through unchanged and remove the cached copy, so a file made private stops being served.

## Security

- **Origin allow-list**: requests without an allowed `Origin` header get 403. Note that non-browser clients can forge `Origin`. Enable rate limiting if abuse is a concern.
- **Host allow-list**: only `https://` targets on the default port of `raw.githubusercontent.com`, `gist.githubusercontent.com`, `*.dropbox.com` and `*.dropboxusercontent.com` (plus `EXTRA_ALLOWED_HOSTS`) are fetched, and every redirect hop is checked against the same list. IP addresses, localhost, other ports, URLs with credentials and the Worker's own host are rejected.
- **Read-only**: only `GET` and the CORS preflight are accepted. The old `/api/room` endpoint was removed and now answers 410. Use Jantt Cloud rooms instead.
- **No HTML on the proxy origin**: upstream bodies must look like JSON and are always served as `application/json` with `X-Content-Type-Options: nosniff` and `Content-Security-Policy: default-src 'none'; sandbox`.
- **Bounded resources**: upstream bodies are capped at 5 MB, and the in-memory cache is capped by entry count and size.
- **Public files only**: the Worker sends no cookies or credentials upstream.
