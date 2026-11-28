# @jantt/cloud-api — Jantt Cloud Agent API & Remote MCP Worker

Cloudflare Worker that exposes Firebase-synced **Jantt Cloud Plans** to AI agents (Claude, Cursor, Antigravity, ChatGPT Custom Actions, scripts) via:

1. **Account-Scoped REST API (`/v1/plans/*`)** — list, inspect, audit, create, update, reschedule, and delete cloud plans and tasks with real-time browser sync.
2. **Remote Streamable HTTP MCP Endpoint (`/v1/mcp`)** — 11 cloud-native MCP tools over JSON-RPC 2.0 using `Authorization: Bearer jnt_live_...`.
3. **Admin Entitlement & API Key Management (`/v1/account/access`, `/v1/keys`, `/v1/admin/*`)** — authenticated with GitHub Firebase ID tokens from the GitHub Pages Playground UI.

Runs on the **Cloudflare Workers free tier** (100,000 requests/day) and connects to Firebase Realtime Database over REST using a **Firebase Service Account** (works on Firebase's free Spark plan — no Blaze billing required).

---

## One-Time Setup & Deployment

### 1. Deploy Updated Firebase Realtime Database Rules

From the repository root:

```bash
npx firebase deploy --only database
```

This adds the server-only `/api_keys` hash index and owner-readable, client-unwritable `/api_entitlements/{uid}` and `/user_api_keys/{uid}` nodes from [database.rules.json](../../database.rules.json).

### 2. Create a Firebase Service Account Key

1. Open [Firebase Console](https://console.firebase.google.com) -> your project (`jantt-cloud`) -> **Project settings** -> **Service accounts**.
2. Click **Generate new private key** and download the JSON file (keep it out of git!).

### 3. Configure Secrets & Deploy the Cloudflare Worker

From `apps/cloud-api/`:

```bash
# Authenticate Wrangler (once)
npx wrangler login

# Paste the contents of the downloaded Firebase Service Account JSON file
npx wrangler secret put FIREBASE_SERVICE_ACCOUNT_JSON

# Paste your Firebase UID (copy it from the Playground -> Agent API modal)
# Comma-separated if you want multiple admins
npx wrangler secret put ADMIN_UIDS

# Deploy the Worker
npx wrangler deploy
```

Wrangler prints your live Worker URL, for example:
`https://jantt-cloud-api.<your-subdomain>.workers.dev`

### 4. Connect GitHub Pages Playground to the Worker

In your GitHub repository:

1. Go to **Settings -> Secrets and variables -> Actions -> Variables**.
2. Create a repository variable named `CLOUD_API_URL` set to `https://jantt-cloud-api.<your-subdomain>.workers.dev`.
3. Re-run the **Deploy Playground to GitHub Pages** workflow (or push to `main`).

For local development, add `VITE_CLOUD_API_URL=http://127.0.0.1:8787` to `.env` at the repo root and create `apps/cloud-api/.dev.vars` (git-ignored):

```dotenv
ALLOW_DEV_ORIGINS=true
ADMIN_UIDS=<your-firebase-uid>
FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
```

Then run `npm run dev -w @jantt/cloud-api` alongside `npm run dev`.

---

## Granting Access to Users

- **In-app Admin Panel (recommended):** Sign into Jantt Playground with your admin GitHub account -> open **Agent API** -> switch to the **Admin Access** tab -> search a user by `@username` (or paste their UID) and click **Grant Access**.
- **Firebase Console fallback:** In Firebase Realtime Database, create `/api_entitlements/<targetUid>`:

```json
{
  "uid": "<targetUid>",
  "enabled": true,
  "tier": "granted",
  "grantedAt": "2026-11-28T00:00:00.000Z",
  "grantedBy": "console",
  "updatedAt": "2026-11-28T00:00:00.000Z"
}
```

Setting `enabled: false` immediately blocks all API keys belonging to that account.

---

## Connecting AI Agents

### MCP Client Config (Claude / Cursor / Antigravity)

```json
{
  "mcpServers": {
    "jantt-cloud": {
      "url": "https://jantt-cloud-api.<your-subdomain>.workers.dev/v1/mcp",
      "headers": {
        "Authorization": "Bearer jnt_live_YOUR_API_KEY"
      }
    }
  }
}
```

### REST API Quick Examples

```bash
# List all your cloud plans
curl -H "Authorization: Bearer jnt_live_YOUR_API_KEY" \
  https://jantt-cloud-api.<your-subdomain>.workers.dev/v1/plans

# Add a task to a cloud plan (updates live in open browsers!)
curl -X POST \
  -H "Authorization: Bearer jnt_live_YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"id":"t-ai-1","label":"Launch API","category":"engineering","start":"2026-12-01","end":"2026-12-05"}' \
  https://jantt-cloud-api.<your-subdomain>.workers.dev/v1/plans/<ROOM_ID>/tasks
```

