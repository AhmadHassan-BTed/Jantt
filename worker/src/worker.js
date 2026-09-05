/**
 * Jantt CORS Proxy & Real-Time Room Sync — Cloudflare Worker
 *
 * Provides:
 * 1. Live Collaboration Rooms (/api/room/:id) with Optimistic Concurrency Control (OCC)
 *    and ETag change detection.
 * 2. Cross-origin proxy for fetching files from Google Drive, GitHub, Dropbox, etc.
 *
 * Free forever on Cloudflare Workers free tier (100K requests/day).
 */

const ALLOWED_ORIGINS = [
  "https://ahmadhassan-bted.github.io",
  "http://localhost:5173",
  "http://localhost:3000",
  "http://127.0.0.1:5173",
];

function corsHeaders(origin) {
  const isAllowed = ALLOWED_ORIGINS.includes(origin) || origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:");
  const allowed = isAllowed ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, If-Match, If-None-Match, If-Modified-Since",
    "Access-Control-Max-Age": "86400",
  };
}

// In-memory room store (persists across warm isolate invocations)
const memoryRooms = new Map();

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    const url = new URL(request.url);

    // -------------------------------------------------------------------------
    // 1. Live Collaboration Rooms API (/api/room/:id)
    // -------------------------------------------------------------------------
    if (url.pathname.startsWith("/api/room/")) {
      const roomId = url.pathname.replace("/api/room/", "").trim();
      if (!roomId) {
        return new Response(JSON.stringify({ error: "Missing room ID" }), {
          status: 400,
          headers: { ...corsHeaders(origin), "Content-Type": "application/json" }
        });
      }

      // GET /api/room/:id -> Fetch current room state with ETag
      if (request.method === "GET") {
        let room = null;
        if (env?.JANTT_ROOMS) {
          try {
            const val = await env.JANTT_ROOMS.get(roomId, "json");
            if (val) room = val;
          } catch {}
        }
        if (!room) {
          room = memoryRooms.get(roomId) || null;
        }

        if (!room) {
          return new Response(JSON.stringify({ error: "Room not found", roomId }), {
            status: 404,
            headers: { ...corsHeaders(origin), "Content-Type": "application/json" }
          });
        }

        const ifNoneMatch = request.headers.get("If-None-Match");
        if (ifNoneMatch && ifNoneMatch === room.contentHash) {
          return new Response(null, {
            status: 304,
            headers: { ...corsHeaders(origin), ETag: room.contentHash }
          });
        }

        return new Response(JSON.stringify(room), {
          status: 200,
          headers: {
            ...corsHeaders(origin),
            "Content-Type": "application/json",
            ETag: room.contentHash || `rev-${room.revision}`
          }
        });
      }

      // POST / PUT /api/room/:id -> Save room state with OCC
      if (request.method === "POST" || request.method === "PUT") {
        let body;
        try {
          body = await request.json();
        } catch {
          return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
            status: 400,
            headers: { ...corsHeaders(origin), "Content-Type": "application/json" }
          });
        }

        let existing = null;
        if (env?.JANTT_ROOMS) {
          try {
            const val = await env.JANTT_ROOMS.get(roomId, "json");
            if (val) existing = val;
          } catch {}
        }
        if (!existing) {
          existing = memoryRooms.get(roomId) || null;
        }

        const baseRevision = Number(body.baseRevision ?? body.revision ?? 0);
        const ifMatch = request.headers.get("If-Match");

        // Optimistic Concurrency Check:
        // If the room already exists and has advanced beyond the client's base revision,
        // reject with 409 Conflict to protect collaborator's changes!
        if (existing && existing.revision > baseRevision) {
          if (!ifMatch || ifMatch !== existing.contentHash) {
            return new Response(
              JSON.stringify({
                error: "Conflict: The remote plan has advanced.",
                code: "REVISION_CONFLICT",
                currentRevision: existing.revision,
                contentHash: existing.contentHash,
                latest: existing.data
              }),
              {
                status: 409,
                headers: { ...corsHeaders(origin), "Content-Type": "application/json" }
              }
            );
          }
        }

        const nextRevision = (existing?.revision || 0) + 1;
        const nowIso = new Date().toISOString();
        const updatedRoom = {
          roomId,
          revision: nextRevision,
          contentHash: body.contentHash || `hash-${Date.now()}`,
          updatedAt: nowIso,
          data: body.data || body
        };

        if (env?.JANTT_ROOMS) {
          try {
            await env.JANTT_ROOMS.put(roomId, JSON.stringify(updatedRoom));
          } catch {}
        }
        memoryRooms.set(roomId, updatedRoom);

        return new Response(JSON.stringify({ success: true, room: updatedRoom }), {
          status: 200,
          headers: {
            ...corsHeaders(origin),
            "Content-Type": "application/json",
            ETag: updatedRoom.contentHash
          }
        });
      }
    }

    // -------------------------------------------------------------------------
    // 2. CORS Proxy for Google Drive / Dropbox / GitHub (?url=...)
    // -------------------------------------------------------------------------
    const targetUrl = url.searchParams.get("url");

    if (!targetUrl) {
      return new Response(
        JSON.stringify({ error: "Missing ?url= parameter or /api/room/ path" }),
        { status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" } }
      );
    }

    try {
      const response = await fetch(targetUrl, {
        headers: {
          "User-Agent": "Jantt-Sync/1.0",
          Accept: "application/json, text/plain, */*",
        },
        redirect: "follow",
      });

      const body = await response.text();

      return new Response(body, {
        status: response.status,
        headers: {
          ...corsHeaders(origin),
          "Content-Type": response.headers.get("Content-Type") || "text/plain",
          "X-Proxy-Status": String(response.status),
        },
      });
    } catch (err) {
      return new Response(
        JSON.stringify({ error: "Proxy fetch failed", details: err.message }),
        { status: 502, headers: { ...corsHeaders(origin), "Content-Type": "application/json" } }
      );
    }
  },
};
