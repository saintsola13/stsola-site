// /api/visits — simple visit counter stored in KV
// POST increments and returns current count
// GET returns current count without incrementing

const VISIT_KEY = 'site:visits';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function jsonResp(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

export async function onRequest(context) {
  const { request, env } = context;
  const kv = env.GUESTBOOK; // reuse same KV binding

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  if (!kv) return jsonResp({ count: 0 });

  const raw   = await kv.get(VISIT_KEY);
  let count   = raw ? parseInt(raw) : 0;

  if (request.method === 'POST') {
    count++;
    // Fire and forget — don't await so response is fast
    kv.put(VISIT_KEY, String(count));
  }

  return jsonResp({ count });
}
