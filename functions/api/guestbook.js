const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const ALLOWED_FONTS   = ["VT323", "Cinzel", "UnifrakturMaguntia", "Orbitron", "Press Start 2P"];
const ALLOWED_COLORS  = ["#ffd700", "#ff3a00", "#ffffff", "#00e5ff", "#2bff9e", "#c084fc"];
const MAX_NAME        = 40;
const MAX_MESSAGE     = 400;
const ENTRY_PREFIX    = "entry:";
const LIST_LIMIT      = 60;

function jsonResp(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// GET  /api/guestbook  — return recent entries (newest first)
async function handleGet(kv) {
  const list = await kv.list({ prefix: ENTRY_PREFIX, limit: LIST_LIMIT });
  if (!list.keys.length) return jsonResp([]);

  const entries = await Promise.all(
    list.keys.map(({ name }) =>
      kv.get(name, { type: "json" }).catch(() => null)
    )
  );

  const valid = entries
    .filter(Boolean)
    .sort((a, b) => b.ts - a.ts)
    .slice(0, LIST_LIMIT);

  return jsonResp(valid);
}

// POST /api/guestbook  — submit a new entry
async function handlePost(request, kv) {
  let body;
  try { body = await request.json(); }
  catch { return jsonResp({ error: "Invalid JSON" }, 400); }

  const name    = (body.name    || "").trim().slice(0, MAX_NAME);
  const message = (body.message || "").trim().slice(0, MAX_MESSAGE);
  const font    = ALLOWED_FONTS.includes(body.font)   ? body.font   : "VT323";
  const color   = ALLOWED_COLORS.includes(body.color) ? body.color  : "#ffd700";
  const rating  = Math.min(5, Math.max(1, parseInt(body.rating) || 5));

  if (!name || !message) return jsonResp({ error: "Name and message required" }, 400);

  const ts  = Date.now();
  const id  = Math.random().toString(36).slice(2, 8);
  const key = `${ENTRY_PREFIX}${ts}:${id}`;

  const entry = { id, name, message, font, color, rating, ts };
  await kv.put(key, JSON.stringify(entry), { expirationTtl: 60 * 60 * 24 * 365 }); // 1 year

  // Fire Telegram alert to Sola
  const BOT_TOKEN  = "***REDACTED***";
  const CHAT_ID    = 8488999370;
  const starStr    = "\u2605".repeat(rating) + "\u2606".repeat(5 - rating);
  const alertText  = `\ud83d\udcdd <b>New Guestbook Entry!</b>\n\n${starStr}\n<b>${name}</b>:\n${message}`;
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: CHAT_ID, text: alertText, parse_mode: "HTML" }),
    });
  } catch { /* don't fail the request if alert fails */ }

  return jsonResp({ ok: true, entry }, 201);
}

export async function onRequest(context) {
  const { request, env } = context;
  const kv = env.GUESTBOOK;

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  if (!kv) return jsonResp({ error: "Storage unavailable" }, 503);

  if (request.method === "GET")  return handleGet(kv);
  if (request.method === "POST") return handlePost(request, kv);

  return jsonResp({ error: "Method not allowed" }, 405);
}
