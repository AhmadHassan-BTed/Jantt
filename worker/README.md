# Jantt CORS Proxy & Edge Cache — Cloudflare Worker

A tiny serverless proxy that allows the Jantt web application to fetch remote plan JSON files from cloud feeds (such as raw GitHub repository URLs, GitHub Gists, and Dropbox) without CORS restrictions.

## Why is this needed?

Some cloud providers and file hosts do not serve CORS headers on their raw file download endpoints, or rate-limit browser fetch requests.

This Worker runs on Cloudflare's global edge network, fetches the file server-side (with zero CORS restrictions), caches identical requests (with in-flight request coalescing to protect against rate limits), and returns the plan JSON to the browser with secure `Access-Control-Allow-Origin` headers.

## Cost

**Free forever.** Cloudflare Workers free tier includes 100,000 requests/day — more than enough for a team or personal productivity tool.

## Deploy (3 minutes)

### 1. Create a free Cloudflare account

Go to [dash.cloudflare.com](https://dash.cloudflare.com) and sign up (email + password, no credit card required).

### 2. Login from the terminal

```bash
npx wrangler login
```

This opens a browser tab where you authorize the Cloudflare CLI.

### 3. Deploy

From this directory (`/worker`):

```bash
npx wrangler deploy
```

You'll see output like:

```
Published jantt-cors-proxy (1.2s)
  https://jantt-cors-proxy.YOUR-SUBDOMAIN.workers.dev
```

### 4. Update Jantt with your Worker URL

Open `packages/core/src/remote-sync.ts` and verify or update the `DEFAULT_WORKER_URL` constant:

```ts
const DEFAULT_WORKER_URL = "https://jantt-cors-proxy.YOUR-SUBDOMAIN.workers.dev";
```

Then rebuild and redeploy the app.

## How it works

```
Browser (GitHub Pages / Localhost)
    │
    │ fetch("https://jantt-cors-proxy.xxx.workers.dev?url=https://raw.githubusercontent.com/...")
    │
    ▼
Cloudflare Worker (edge cache & coalescer)
    │
    │ fetch("https://raw.githubusercontent.com/...")   ← No CORS restriction server-side
    │
    ▼
Remote Cloud Host (returns JSON file)
    │
    ▼
Cloudflare Worker adds CORS headers → returns to browser
```

## Security

- **Origin-locked**: Only requests from `ahmadhassan-bted.github.io` and `localhost` are allowed by default. Edit `ALLOWED_ORIGINS` in `src/worker.js` to add more.
- **Read-only**: The proxy only performs GET requests for remote files; it cannot modify external content.
- **Public files only**: Only works with publicly accessible files.
