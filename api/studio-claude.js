// TAZMIN Studio — Claude proxy on the owner's API key, with daily limits so the bill stays under control.
// Env: ANTHROPIC_API_KEY (required)
//      STUDIO_DAILY_LIMIT  (per device per day, default 40)
//      STUDIO_IP_LIMIT     (per IP per day, default 80)
//      STUDIO_GLOBAL_LIMIT (whole studio per day, default 600)
// Uses the same Upstash Redis as the portal for counters.
const RURL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const RTOK = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const MODELS = ['claude-sonnet-5-5', 'claude-haiku-5-5'];

async function r(...cmd) {
  const resp = await fetch(RURL, { method: 'POST', headers: { Authorization: 'Bearer ' + RTOK, 'Content-Type': 'application/json' }, body: JSON.stringify(cmd) });
  const j = await resp.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}
async function bump(key, limit) {
  const n = await r('INCR', key);
  if (n === 1) await r('EXPIRE', key, 90000);
  return { n, ok: n <= limit, left: Math.max(0, limit - n) };
}
function readBody(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  return new Promise((ok, bad) => { let s = ''; req.on('data', c => { s += c; if (s.length > 4e6) bad(new Error('too_big')); }); req.on('end', () => { try { ok(JSON.parse(s || '{}')); } catch (e) { bad(e); } }); req.on('error', bad); });
}
// Only pass through what the studio needs.
function clean(b) {
  const o = {
    model: MODELS.includes(b.model) ? b.model : MODELS[0],
    max_tokens: Math.min(32000, Math.max(1, +b.max_tokens || 1024)),
    messages: Array.isArray(b.messages) ? b.messages.slice(-40) : [],
  };
  if (typeof b.system === 'string') o.system = b.system.slice(0, 200000);
  if (b.stream) o.stream = true;
  const tools = [];
  (Array.isArray(b.tools) ? b.tools : []).forEach(t => {
    if (t && /^web_search_\d+$/.test(t.type)) tools.push(Object.assign({}, t, { name: 'web_search', max_uses: Math.min(8, +t.max_uses || 3) }));
    else if (t && t.type === 'mcp_toolset' && typeof t.mcp_server_name === 'string') tools.push({ type: 'mcp_toolset', mcp_server_name: t.mcp_server_name });
  });
  const servers = (Array.isArray(b.mcp_servers) ? b.mcp_servers : []).slice(0, 3)
    .filter(s => s && s.type === 'url' && /^https:\/\//.test(s.url) && /^[A-Za-z0-9_-]{1,40}$/.test(s.name))
    .map(s => { const x = { type: 'url', url: String(s.url).slice(0, 500), name: s.name }; if (s.authorization_token) x.authorization_token = String(s.authorization_token).slice(0, 2000); return x; });
  if (servers.length) { o.mcp_servers = servers; }
  const names = servers.map(s => s.name);
  const t2 = tools.filter(t => t.type !== 'mcp_toolset' || names.includes(t.mcp_server_name));
  if (t2.length) o.tools = t2;
  return o;
}

module.exports = async (req, res) => {
  const fail = (s, e, extra) => { res.statusCode = s; res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(Object.assign({ error: { type: e, message: e } }, extra || {}))); };
  if (req.method !== 'POST') return fail(405, 'method');
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return fail(503, 'studio_not_configured');
  if (!RURL || !RTOK) return fail(503, 'db_not_connected');

  const dev = String(req.headers['x-studio-device'] || '').replace(/[^a-z0-9]/gi, '').slice(0, 40);
  if (dev.length < 12) return fail(400, 'no_device');
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim().slice(0, 64);
  const day = new Date().toISOString().slice(0, 10);

  let body;
  try { body = clean(await readBody(req)); } catch (e) { return fail(400, 'bad_body'); }
  if (!body.messages.length) return fail(400, 'no_messages');

  let mine;
  try {
    const g = await bump('studio:g:' + day, +process.env.STUDIO_GLOBAL_LIMIT || 600);
    if (!g.ok) return fail(429, 'global_quota');
    const ipq = await bump('studio:ip:' + day + ':' + ip, +process.env.STUDIO_IP_LIMIT || 80);
    if (!ipq.ok) return fail(429, 'quota', { left: 0 });
    mine = await bump('studio:d:' + day + ':' + dev, +process.env.STUDIO_DAILY_LIMIT || 40);
    if (!mine.ok) return fail(429, 'quota', { left: 0 });
  } catch (e) { return fail(503, 'db_error'); }

  const h = { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' };
  if (body.mcp_servers) h['anthropic-beta'] = 'mcp-client-2025-11-20';
  let up;
  try { up = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: h, body: JSON.stringify(body) }); }
  catch (e) { return fail(502, 'upstream'); }

  res.statusCode = up.status;
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('x-studio-left', String(mine.left));
  res.setHeader('Access-Control-Expose-Headers', 'x-studio-left');
  res.setHeader('Content-Type', up.headers.get('content-type') || 'application/json');
  if (!up.body) return res.end();
  const rd = up.body.getReader();
  try {
    for (;;) { const { done, value } = await rd.read(); if (done) break; res.write(Buffer.from(value)); }
  } catch (e) { /* client went away */ }
  res.end();
};
