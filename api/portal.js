// TAZMIN portal API — Vercel Node function, no dependencies.
// Needs env vars: KV_REST_API_URL + KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN), ADMIN_PASSWORD.
const crypto = require('crypto');
const ADMIN_EMAIL = 'orenkaro3@gmail.com';
const RURL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const RTOK = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const MAX_FILE = 600 * 1024;

async function r(...cmd) {
  const resp = await fetch(RURL, { method: 'POST', headers: { Authorization: 'Bearer ' + RTOK, 'Content-Type': 'application/json' }, body: JSON.stringify(cmd) });
  const j = await resp.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}
const J = s => { try { return JSON.parse(s); } catch (e) { return null; } };
const rid = n => { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; const b = crypto.randomBytes(n); let o = ''; for (let i = 0; i < n; i++) o += A[b[i] % A.length]; return o; };
const clip = (v, n) => String(v == null ? '' : v).slice(0, n);
function safeEq(a, b) { const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || '')); return x.length === y.length && crypto.timingSafeEqual(x, y); }
function isAdmin(req) {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) return false;
  return String(req.headers['x-admin-email'] || '').trim().toLowerCase() === ADMIN_EMAIL && safeEq(req.headers['x-admin-pass'], pw);
}
async function getClient(id) { return J(await r('GET', 'client:' + id)); }
async function saveClient(c) { await r('SET', 'client:' + c.id, JSON.stringify(c)); }
async function clientByCode(code) { const id = await r('GET', 'code:' + clip(code, 20).toUpperCase()); return id ? getClient(id) : null; }
function publicClient(c) { const o = Object.assign({}, c); delete o.code; return o; }
function cleanLinks(a) { return (Array.isArray(a) ? a : []).slice(0, 5).map(u => clip(u, 500)).filter(u => /^https?:\/\//i.test(u)); }

async function addMsg(c, from, body) {
  const msg = { id: rid(10), from, t: Date.now(), text: clip(body.text, 4000), links: cleanLinks(body.links), kind: body.kind === 'request' ? 'request' : 'msg' };
  if (body.kind === 'request') msg.cat = clip(body.cat, 40);
  if (body.file && body.file.data) {
    const data = String(body.file.data);
    if (data.length > MAX_FILE * 1.37 + 100) throw Object.assign(new Error('file_too_big'), { status: 413 });
    const fid = rid(14);
    await r('SET', 'file:' + fid, JSON.stringify({ name: clip(body.file.name, 120), type: clip(body.file.type, 80), data, cid: c.id }));
    msg.file = { id: fid, name: clip(body.file.name, 120), type: clip(body.file.type, 80), size: Math.round(data.length / 1.37) };
  }
  if (!msg.text && !msg.links.length && !msg.file) throw Object.assign(new Error('empty'), { status: 400 });
  await r('RPUSH', 'msgs:' + c.id, JSON.stringify(msg));
  if (msg.kind === 'request') {
    c.progress = c.progress || [];
    c.progress.push({ id: rid(8), title: msg.text.slice(0, 200), cat: msg.cat || 'אחר', state: 'requested', by: from, t: msg.t });
  }
  c.lastMsg = msg.t; c.lastFrom = from;
  if (from === 'client') c.unread = (c.unread || 0) + 1;
  await saveClient(c);
  return msg;
}
async function msgs(id) { return ((await r('LRANGE', 'msgs:' + id, 0, -1)) || []).map(J).filter(Boolean); }

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const send = (s, o) => res.status(s).json(o);
  if (!RURL || !RTOK) return send(503, { error: 'db_not_connected' });
  const a = String((req.query && req.query.a) || '');
  const b = (req.body && typeof req.body === 'object') ? req.body : {};
  try {
    if (a === 'create' && req.method === 'POST') {
      const id = rid(12), code = rid(8);
      const c = { id, code, name: clip(b.name, 80), email: clip(b.email, 120), phone: clip(b.phone, 30), bizName: clip(b.bizName, 100),
        services: (Array.isArray(b.services) ? b.services : []).slice(0, 10).map(s => clip(s, 60)), summary: clip(b.summary, 5000),
        status: 'pending', createdAt: Date.now(), siteUrl: '', payment: { total: 0, paid: 0, note: '' }, progress: [], unread: 0 };
      (c.services || []).forEach(s => c.progress.push({ id: rid(8), title: s, cat: 'הזמנה', state: 'requested', by: 'client', t: c.createdAt }));
      await saveClient(c);
      await r('SET', 'code:' + code, id);
      await r('SADD', 'clients', id);
      return send(200, { code });
    }
    if (a === 'me') {
      const c = await clientByCode(req.headers['x-code']);
      if (!c) return send(404, { error: 'bad_code' });
      if (req.method === 'POST') {
        if (c.status !== 'approved') return send(403, { error: 'pending' });
        const m = await addMsg(c, 'client', b);
        return send(200, { msg: m });
      }
      return send(200, { client: publicClient(c), msgs: c.status === 'approved' ? await msgs(c.id) : [] });
    }
    if (a === 'file') {
      const f = J(await r('GET', 'file:' + clip(req.query.id, 20)));
      if (!f) return send(404, { error: 'not_found' });
      let ok = isAdmin(req);
      if (!ok) { const c = await clientByCode(req.headers['x-code']); ok = !!(c && c.id === f.cid); }
      if (!ok) return send(403, { error: 'forbidden' });
      return send(200, f);
    }
    if (!isAdmin(req)) return send(401, { error: process.env.ADMIN_PASSWORD ? 'unauthorized' : 'no_admin_password' });
    if (a === 'login') return send(200, { ok: true });
    if (a === 'list') {
      const ids = (await r('SMEMBERS', 'clients')) || [];
      const list = ids.length ? ((await r('MGET', ...ids.map(i => 'client:' + i))) || []).map(J).filter(Boolean) : [];
      return send(200, { clients: list });
    }
    if (a === 'get') {
      const c = await getClient(clip(req.query.id, 20)); if (!c) return send(404, { error: 'not_found' });
      if (c.unread) { c.unread = 0; await saveClient(c); }
      return send(200, { client: c, msgs: await msgs(c.id) });
    }
    if (a === 'code' && req.method === 'POST') {
      const c = await getClient(clip(b.id, 20)); if (!c) return send(404, { error: 'not_found' });
      if (c.code) await r('DEL', 'code:' + c.code);
      const code = rid(8); c.code = code; await r('SET', 'code:' + code, c.id); await saveClient(c);
      return send(200, { code });
    }
    if (a === 'new' && req.method === 'POST') {
      const id = rid(12), code = rid(8);
      const c = { id, code, name: clip(b.name, 80), email: clip(b.email, 120), phone: clip(b.phone, 30), bizName: clip(b.bizName, 100), services: [], summary: '',
        status: 'approved', createdAt: Date.now(), siteUrl: '', payment: { total: 0, paid: 0, note: '' }, progress: [], unread: 0 };
      await saveClient(c); await r('SET', 'code:' + code, id); await r('SADD', 'clients', id);
      return send(200, { id, code });
    }
    if (a === 'update' && req.method === 'POST') {
      const c = await getClient(clip(b.id, 20)); if (!c) return send(404, { error: 'not_found' });
      const p = b.patch || {};
      if (['pending', 'approved', 'done', 'archived'].includes(p.status)) c.status = p.status;
      if (typeof p.siteUrl === 'string') c.siteUrl = /^https?:\/\//i.test(p.siteUrl) || p.siteUrl === '' ? clip(p.siteUrl, 500) : c.siteUrl;
      if (p.payment) c.payment = { total: Math.max(0, +p.payment.total || 0), paid: Math.max(0, +p.payment.paid || 0), note: clip(p.payment.note, 300) };
      if (Array.isArray(p.progress)) c.progress = p.progress.slice(0, 100).map(x => ({ id: clip(x.id, 12) || rid(8), title: clip(x.title, 200), cat: clip(x.cat, 40), state: ['requested', 'doing', 'done'].includes(x.state) ? x.state : 'requested', by: x.by === 'client' ? 'client' : 'admin', t: +x.t || Date.now() }));
      ['name', 'bizName', 'phone', 'email'].forEach(k => { if (typeof p[k] === 'string') c[k] = clip(p[k], 120); });
      await saveClient(c);
      return send(200, { client: c });
    }
    if (a === 'msg' && req.method === 'POST') {
      const c = await getClient(clip(b.id, 20)); if (!c) return send(404, { error: 'not_found' });
      return send(200, { msg: await addMsg(c, 'admin', b) });
    }
    return send(400, { error: 'bad_action' });
  } catch (e) {
    return send(e.status || 500, { error: e.message || 'server_error' });
  }
};
