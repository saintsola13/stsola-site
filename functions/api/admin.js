const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const ENTRY_PREFIX = "entry:";
// Set ADMIN_TOKEN env var in Cloudflare Pages dashboard to override
const DEFAULT_TOKEN = "LOB22SOLA";

function jsonResp(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function getToken(env) {
  return env.ADMIN_TOKEN || DEFAULT_TOKEN;
}

function checkAuth(request, env) {
  const auth = request.headers.get("Authorization") || "";
  return auth === `Bearer ${getToken(env)}`;
}

export async function onRequest(context) {
  const { request, env } = context;
  const kv  = env.GUESTBOOK;
  const url = new URL(request.url);
  const action = url.searchParams.get("action") || "";

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  if (!kv) return jsonResp({ error: "Storage unavailable" }, 503);

  // ── PUBLIC: GET admin profile (no auth needed — it's shown on the page) ──
  if (request.method === "GET" && action === "profile") {
    const profile = await kv.get("admin:profile", { type: "json" }).catch(() => null);
    return jsonResp(profile || { name: "", bio: "", pinned: "" });
  }

  // ── ALL OTHER ROUTES: require auth ──
  if (!checkAuth(request, env)) {
    return jsonResp({ error: "Unauthorized" }, 401);
  }

  // GET /api/admin  — list all entries (admin view, includes _key for delete)
  if (request.method === "GET" && !action) {
    const list = await kv.list({ prefix: ENTRY_PREFIX, limit: 200 });
    if (!list.keys.length) return jsonResp([]);
    const entries = await Promise.all(
      list.keys.map(async ({ name }) => {
        const e = await kv.get(name, { type: "json" }).catch(() => null);
        return e ? { ...e, _key: name } : null;
      })
    );
    return jsonResp(entries.filter(Boolean).sort((a, b) => b.ts - a.ts));
  }

  // DELETE /api/admin?key=entry:xxx:yyy  — delete one comment
  if (request.method === "DELETE") {
    const key = url.searchParams.get("key");
    if (!key || !key.startsWith(ENTRY_PREFIX)) {
      return jsonResp({ error: "Invalid key" }, 400);
    }
    await kv.delete(key);
    return jsonResp({ ok: true });
  }

  // POST /api/admin?action=profile  — save admin profile
  if (request.method === "POST" && action === "profile") {
    let body;
    try { body = await request.json(); }
    catch { return jsonResp({ error: "Invalid JSON" }, 400); }
    const profile = {
      name:   (body.name   || "").slice(0, 50).trim(),
      bio:    (body.bio    || "").slice(0, 300).trim(),
      pinned: (body.pinned || "").slice(0, 300).trim(),
    };
    await kv.put("admin:profile", JSON.stringify(profile));
    return jsonResp({ ok: true, profile });
  }

  return jsonResp({ error: "Method not allowed" }, 405);
}
