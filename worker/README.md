# Jantt CORS Proxy — Cloudflare Worker

A tiny serverless proxy that allows the Jantt app to fetch publicly shared Google Drive files.

## Why is this needed?

Google Drive **does not serve CORS headers** on its download endpoints. This means a browser app (like Jantt running on GitHub Pages) cannot directly `fetch()` a Google Drive file — the browser blocks it. Every public CORS proxy (corsproxy.io, allorigins.win, etc.) either blocks Google domains or gets rate-limited.

This Worker runs on Cloudflare's edge network, fetches the file server-side (no CORS restriction), and returns it to the browser with proper `Access-Control-Allow-Origin` headers.

## Cost

**Free forever.** Cloudflare Workers free tier includes 100,000 requests/day — more than enough for a team tool.

## Deploy (3 minutes)

### 1. Create a free Cloudflare account

Go to [dash.cloudflare.com](https://dash.cloudflare.com) and sign up (email + password, no credit card).

### 2. Login from the terminal

```bash
npx wrangler login
```

This opens a browser tab where you authorize the CLI.

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

Open `packages/core/src/remote-sync.ts` and update the `DEFAULT_WORKER_URL` constant:

```ts
const DEFAULT_WORKER_URL = "https://jantt-cors-proxy.YOUR-SUBDOMAIN.workers.dev";
```

Then rebuild and redeploy the app.

### 5. Test it

Paste a Google Drive share link in the Jantt "Link Cloud Plan" modal — it should fetch and display the plan.

## How it works

```
Browser (GitHub Pages)
    │
    │ fetch("https://jantt-cors-proxy.xxx.workers.dev?url=https://drive.google.com/uc?...")
    │
    ▼
Cloudflare Worker (edge)
    │
    │ fetch("https://drive.google.com/uc?...")   ← No CORS restriction server-side
    │
    ▼
Google Drive (returns the JSON file)
    │
    ▼
Cloudflare Worker adds CORS headers → returns to browser
```

## Security

- **Origin-locked**: Only requests from `ahmadhassan-bted.github.io` and `localhost` are allowed. Edit `ALLOWED_ORIGINS` in `src/worker.js` to add more.
- **Read-only**: The worker only performs GET requests; it cannot modify anything.
- **Public files only**: Only works with files shared as "Anyone with the link can view".
