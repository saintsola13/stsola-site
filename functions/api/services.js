// POST /api/services: "Start a Project" requests from /services.
// 1) honeypot + time-trap + per-IP rate limit (KV, same GUESTBOOK namespace, own key prefixes)
// 2) validate, 3) store in KV first (backup; nothing gets lost if email fails)
// 4) email info@stsola.us with Reply-To = submitter, via env.EMAIL (send_email binding) or env.MAILER (service binding
//    to a small mailer Worker that holds the send_email binding); 5) Telegram ping (same bot/chat as guestbook alerts).
// Guestbook ("entry:*"), visits and admin keys are never read or written here.

const TO_DEFAULT   = "info@stsola.us";
const FROM_DEFAULT = "services@stsola.us";
const SUB_PREFIX   = "svc:";
const RL_PREFIX    = "svcrl:";
const RL_MAX       = 3;          // submissions per IP per window
const RL_WINDOW    = 60 * 60;    // seconds
const MIN_FILL_MS  = 3000;       // faster than this = bot
const SERVICES     = ["Apps", "Bots", "Media", "Web3", "Other"];
const BUDGETS      = ["", "Small: a quick build or fix", "Medium: a full feature or project", "Large: a big build or ongoing work", "Not sure yet: let's talk"];
const TIMELINES    = ["ASAP", "Within 2 weeks", "Within a month", "1 to 3 months", "Flexible"];
const EMAIL_RE     = /^[^\s@<>"']{1,64}@[^\s@<>"']+\.[^\s@<>"']{2,}$/;

const HEADERS = { "Content-Type": "application/json", "Cache-Control": "no-store" };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: HEADERS });
const clean = (v, max) => String(v ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, max);
const oneLine = (v, max) => clean(v, max).replace(/[\r\n]+/g, " ");
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function sha256(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function readBody(request) {
  const ct = request.headers.get("content-type") || "";
  if (ct.includes("application/json")) return await request.json();
  if (ct.includes("form")) {
    const fd = await request.formData(); const o = {};
    for (const [k, v] of fd.entries()) { if (k === "services") (o.services ||= []).push(v); else o[k] = v; }
    return o;
  }
  throw new Error("unsupported");
}

function validate(b) {
  const errors = [];
  const name = oneLine(b.name, 80);
  const email = oneLine(b.email, 120).toLowerCase();
  const handle = oneLine(b.handle, 60);
  const services = [...new Set((Array.isArray(b.services) ? b.services : [b.services]).map((s) => oneLine(s, 10)))].filter((s) => SERVICES.includes(s));
  const budget = BUDGETS.includes(oneLine(b.budget, 60)) ? oneLine(b.budget, 60) : "";
  const timeline = oneLine(b.timeline, 40);
  const details = clean(b.details, 5000);
  const link = oneLine(b.link, 300);
  if (!name) errors.push("name");
  if (!EMAIL_RE.test(email)) errors.push("email");
  if (!services.length) errors.push("services");
  if (!TIMELINES.includes(timeline)) errors.push("timeline");
  if (details.length < 20) errors.push("details");
  if (link) { try { const u = new URL(link); if (!/^https?:$/.test(u.protocol)) errors.push("link"); } catch { errors.push("link"); } }
  return { errors, data: { name, email, handle, services, budget, timeline, details, link } };
}

function buildEmail(d, id) {
  const rows = [["Name", d.name], ["Email", d.email], ["Handle", d.handle || "—"], ["Services", d.services.join(", ")],
    ["Budget", d.budget || "—"], ["Timeline", d.timeline], ["Link", d.link || "—"], ["Request ID", id]];
  const text = rows.map(([k, v]) => `${k}: ${v}`).join("\n") + `\n\nProject details:\n${d.details}\n\n(Reply to this email to answer ${d.name} directly.)`;
  const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#111">
<h2 style="margin:0 0 12px">New project request</h2><table cellpadding="6" style="border-collapse:collapse">
${rows.map(([k, v]) => `<tr><td style="color:#666;vertical-align:top">${esc(k)}</td><td><strong>${esc(v)}</strong></td></tr>`).join("")}</table>
<h3 style="margin:18px 0 6px">Project details</h3><div style="white-space:pre-wrap;border-left:3px solid #ff3a00;padding-left:12px">${esc(d.details)}</div>
<p style="color:#666;font-size:13px">Reply to this email to answer ${esc(d.name)} directly.</p></div>`;
  return { subject: `[stsola.com] Project request: ${d.services.join(" + ")} from ${d.name}`.slice(0, 180), text, html };
}

async function sendEmail(env, msg, d) {
  const to = env.SERVICES_TO || TO_DEFAULT;
  const from = { email: env.SERVICES_FROM || FROM_DEFAULT, name: "stsola.com Services" };
  const replyTo = { email: d.email, name: d.name };
  if (env.EMAIL && typeof env.EMAIL.send === "function") {
    const r = await env.EMAIL.send({ to, from, replyTo, subject: msg.subject, text: msg.text, html: msg.html });
    return { via: "send_email", messageId: r && r.messageId, to, replyTo: replyTo.email };
  }
  if (env.MAILER && typeof env.MAILER.fetch === "function") {
    const r = await env.MAILER.fetch("https://mailer.internal/send", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to, from, replyTo, subject: msg.subject, text: msg.text, html: msg.html }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) throw new Error(`mailer ${r.status} ${j.code || ""} ${j.error || ""}`.trim());
    return { via: "mailer", messageId: j.messageId, to: (j.accepted && j.accepted.to) || to, replyTo: (j.accepted && j.accepted.replyTo) || replyTo.email };
  }
  return { via: "none" };
}

async function telegram(env, d, id, emailed) {
  if (!env.TELEGRAM_BOT_TOKEN) return false;
  const text = `🛠 <b>New project request</b>\n\n<b>${esc(d.name)}</b> &lt;${esc(d.email)}&gt;${d.handle ? " · " + esc(d.handle) : ""}\n` +
    `${esc(d.services.join(", "))} · ${esc(d.timeline)}${d.budget ? " · " + esc(d.budget) : ""}\n\n${esc(d.details.slice(0, 600))}` +
    `${d.link ? "\n\n" + esc(d.link) : ""}\n\n<i>${emailed ? "Emailed to info@stsola.us" : "Email not sent; saved in KV"} · ${id}</i>`;
  try {
    const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, { method: "POST",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: 8488999370, text, parse_mode: "HTML", disable_web_page_preview: true }) });
    return r.ok;
  } catch { return false; }
}

export async function onRequestPost({ request, env, waitUntil }) {
  const origin = request.headers.get("Origin");
  if (origin) {
    let host = ""; try { host = new URL(origin).hostname; } catch {}
    const reqHost = new URL(request.url).hostname;
    if (!(host === reqHost || host === "stsola.com" || host.endsWith(".stsola-site.pages.dev") || host === "stsola-site.pages.dev")) return json({ error: "Forbidden" }, 403);
  }
  const kv = env.GUESTBOOK;
  if (!kv) return json({ error: "Storage unavailable. Email info@stsola.us." }, 503);
  let body;
  try { body = await readBody(request); } catch { return json({ error: "Bad request" }, 400); }
  if (!body || typeof body !== "object") return json({ error: "Bad request" }, 400);

  // Bots: honeypot filled or form submitted inhumanly fast. Pretend success, store and send nothing.
  const t = Number(body.t);
  if (clean(body.website, 200) || (Number.isFinite(t) && t < MIN_FILL_MS)) return json({ ok: true });

  // Rate limit per IP (hashed, never stored raw).
  const ip = request.headers.get("CF-Connecting-IP") || request.headers.get("x-forwarded-for") || "unknown";
  const ipHash = (await sha256("svc|" + ip)).slice(0, 32);
  const rlKey = RL_PREFIX + ipHash;
  const used = parseInt((await kv.get(rlKey)) || "0", 10) || 0;
  if (used >= RL_MAX) return json({ error: "Too many requests. Try again later or email info@stsola.us." }, 429);

  const { errors, data } = validate(body);
  if (errors.length) return json({ error: "Please check: " + errors.join(", "), fields: errors }, 400);

  await kv.put(rlKey, String(used + 1), { expirationTtl: RL_WINDOW });

  const ts = Date.now();
  const id = `${ts}:${crypto.randomUUID().slice(0, 8)}`;
  const key = SUB_PREFIX + id;
  const record = { id, ts, ...data, ipHash, ua: oneLine(request.headers.get("user-agent"), 200), email_status: "pending" };
  await kv.put(key, JSON.stringify(record)); // backup first, no expiry

  const msg = buildEmail(data, id);
  let emailed = false;
  try {
    const r = await sendEmail(env, msg, data);
    emailed = r.via !== "none";
    record.email_status = emailed ? "sent" : "not_configured";
    record.email_via = r.via; if (r.messageId) record.email_id = r.messageId;
    if (emailed) { record.email_to = r.to; record.email_reply_to = r.replyTo; }
  } catch (e) {
    record.email_status = "failed"; record.email_error = oneLine((e && (e.code ? e.code + " " : "") + e.message) || e, 300);
  }
  record.telegram = await telegram(env, data, id, emailed);
  await kv.put(key, JSON.stringify(record));

  return json({ ok: true, id, emailed }, 201);
}

export async function onRequest({ request }) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { Allow: "POST, OPTIONS" } });
  return json({ error: "Method not allowed" }, 405);
}
