// TAZMIN insights plugin API — Vercel Node function, no dependencies.
// Admin only. Uses the same Redis + admin login as api/portal.js.
// Env vars:
//   IG_ACCESS_TOKEN + IG_USER_ID  -> Instagram Graph API (Business Discovery) for public stats of business/creator accounts
//   ANTHROPIC_API_KEY             -> "מי זה" research (Claude + web search)
//   ANTHROPIC_MODEL (optional, default claude-sonnet-5-5), IG_API_VERSION (optional, default v23.0)
const crypto = require('crypto');
const ADMIN_EMAIL = 'orenkaro3@gmail.com';
const RURL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const RTOK = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

async function r(...cmd) {
  const resp = await fetch(RURL, { method: 'POST', headers: { Authorization: 'Bearer ' + RTOK, 'Content-Type': 'application/json' }, body: JSON.stringify(cmd) });
  const j = await resp.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}
const J = s => { try { return JSON.parse(s); } catch (e) { return null; } };
const clip = (v, n) => String(v == null ? '' : v).slice(0, n);
function safeEq(a, b) { const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || '')); return x.length === y.length && crypto.timingSafeEqual(x, y); }
function isAdmin(req) {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) return false;
  return String(req.headers['x-admin-email'] || '').trim().toLowerCase() === ADMIN_EMAIL && safeEq(String(req.headers['x-admin-pass'] || '').trim(), String(pw).trim());
}
const err = (m, s) => Object.assign(new Error(m), { status: s || 400 });
async function getClient(id) { return J(await r('GET', 'client:' + id)); }
async function getIns(id) { return J(await r('GET', 'insights:' + id)) || {}; }
async function saveIns(id, o) { await r('SET', 'insights:' + id, JSON.stringify(o)); }

// "@name", "instagram.com/name/", full URL -> "name"
function cleanHandle(v) {
  let h = String(v || '').trim();
  const m = h.match(/instagram\.com\/([A-Za-z0-9._]+)/i);
  if (m) h = m[1];
  h = h.replace(/^@/, '').replace(/[/?#].*$/, '');
  return /^[A-Za-z0-9._]{1,30}$/.test(h) ? h.toLowerCase() : '';
}

/* ---------------- INSTAGRAM ---------------- */
const DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
function ilParts(ts) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', weekday: 'short', hour: 'numeric', hour12: false });
  const p = f.formatToParts(new Date(ts));
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.find(x => x.type === 'weekday').value);
  return { wd, hr: (+p.find(x => x.type === 'hour').value) % 24 };
}
function typeOf(m) {
  if (m.media_product_type === 'REELS' || (m.media_type === 'VIDEO' && m.media_product_type !== 'FEED')) return 'reel';
  if (m.media_type === 'VIDEO') return 'video';
  if (m.media_type === 'CAROUSEL_ALBUM') return 'carousel';
  return 'image';
}
const avg = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;

function analyze(p) {
  const followers = p.followers_count || 0;
  const media = ((p.media && p.media.data) || []).map(m => {
    const likes = +m.like_count || 0, comments = +m.comments_count || 0;
    return { id: m.id, type: typeOf(m), likes, comments, inter: likes + comments, t: Date.parse(m.timestamp) || 0,
      caption: clip(m.caption, 220), url: m.permalink || '', thumb: m.thumbnail_url || (m.media_type !== 'VIDEO' ? m.media_url : '') || '' };
  }).filter(m => m.t);
  const er = m => followers ? m.inter / followers * 100 : 0;
  const byType = {};
  media.forEach(m => { (byType[m.type] = byType[m.type] || []).push(m); });
  const types = Object.keys(byType).map(k => ({ type: k, count: byType[k].length, avgLikes: Math.round(avg(byType[k].map(x => x.likes))), avgComments: Math.round(avg(byType[k].map(x => x.comments))), er: +avg(byType[k].map(er)).toFixed(2) }))
    .sort((a, b) => b.er - a.er || b.avgLikes - a.avgLikes);
  const dayAgg = {}, hourAgg = {};
  media.forEach(m => { const { wd, hr } = ilParts(m.t); (dayAgg[wd] = dayAgg[wd] || []).push(m.inter); const slot = Math.floor(hr / 3) * 3; (hourAgg[slot] = hourAgg[slot] || []).push(m.inter); });
  const best = o => { let k = null, v = -1; Object.keys(o).forEach(x => { if (o[x].length && avg(o[x]) > v) { v = avg(o[x]); k = x; } }); return k; };
  const bd = best(dayAgg), bh = best(hourAgg);
  const sorted = media.slice().sort((a, b) => b.t - a.t);
  const spanDays = sorted.length > 1 ? Math.max(1, (sorted[0].t - sorted[sorted.length - 1].t) / 864e5) : 0;
  return {
    username: p.username, name: p.name || '', bio: clip(p.biography, 500), website: p.website || '', pic: p.profile_picture_url || '',
    followers, follows: p.follows_count || 0, posts: p.media_count || 0,
    sample: media.length,
    avgLikes: Math.round(avg(media.map(m => m.likes))), avgComments: Math.round(avg(media.map(m => m.comments))),
    er: +avg(media.map(er)).toFixed(2),
    perWeek: spanDays ? +(media.length / spanDays * 7).toFixed(1) : 0,
    lastPostDays: sorted.length ? Math.floor((Date.now() - sorted[0].t) / 864e5) : null,
    bestDay: bd != null ? DAYS[bd] : '', bestHours: bh != null ? (+bh) + ':00–' + ((+bh + 3) % 24) + ':00' : '',
    types,
    top: media.slice().sort((a, b) => b.inter - a.inter).slice(0, 6),
    recent: sorted.slice(0, 12),
  };
}

async function fetchInstagram(handle) {
  const tok = process.env.IG_ACCESS_TOKEN, uid = process.env.IG_USER_ID;
  if (!tok || !uid) throw err('ig_not_configured', 503);
  const ver = process.env.IG_API_VERSION || 'v23.0';
  const fields = 'business_discovery.username(' + handle + '){username,name,biography,website,followers_count,follows_count,media_count,profile_picture_url,' +
    'media.limit(30){id,caption,like_count,comments_count,media_type,media_product_type,permalink,timestamp,thumbnail_url,media_url}}';
  const url = 'https://graph.facebook.com/' + ver + '/' + encodeURIComponent(uid) + '?fields=' + encodeURIComponent(fields) + '&access_token=' + encodeURIComponent(tok);
  const resp = await fetch(url);
  const j = await resp.json().catch(() => ({}));
  if (j.error) {
    const m = String(j.error.message || '');
    if (j.error.code === 190) throw err('ig_token_expired', 502);
    if (/cannot be found|does not exist|not.*business|Invalid user id/i.test(m) || j.error.error_subcode === 2207013) throw err('ig_not_business', 404);
    throw err('ig_error: ' + clip(m, 200), 502);
  }
  if (!j.business_discovery) throw err('ig_not_business', 404);
  return analyze(j.business_discovery);
}

/* ---------------- "מי זה" (business research) ---------------- */
function brief(c, ig, chat) {
  const lines = [];
  lines.push('שם העסק: ' + (c.bizName || '—'));
  lines.push('איש קשר (רק לצורך זיהוי העסק, לא לחיפוש אישי): ' + (c.name || '—'));
  if (c.siteUrl) lines.push('אתר: ' + c.siteUrl);
  if (c.instagram) lines.push('אינסטגרם: @' + c.instagram);
  if (c.services && c.services.length) lines.push('שירותים שהלקוח ביקש מ-TAZMIN: ' + c.services.join(', '));
  if (c.summary) lines.push('תשובות השאלון:\n' + clip(c.summary, 3000));
  if (ig) {
    lines.push('נתוני אינסטגרם (מתוך ' + ig.sample + ' פוסטים אחרונים): עוקבים ' + ig.followers + ', ממוצע לייקים ' + ig.avgLikes + ', ממוצע תגובות ' + ig.avgComments +
      ', מעורבות ' + ig.er + '%, ' + ig.perWeek + ' פוסטים בשבוע, פוסט אחרון לפני ' + ig.lastPostDays + ' ימים, היום הכי טוב ' + ig.bestDay + ', שעות ' + ig.bestHours + '.');
    lines.push('ביצועים לפי סוג: ' + ig.types.map(t => t.type + ' (' + t.count + ' פוסטים, מעורבות ' + t.er + '%)').join(', '));
    lines.push('הפוסטים החזקים: ' + ig.top.slice(0, 3).map(t => '"' + clip(t.caption, 80) + '" — ' + t.likes + ' לייקים').join(' | '));
  }
  if (chat && chat.length) lines.push('הודעות אחרונות מהצ׳אט עם הלקוח:\n' + chat.map(m => (m.from === 'admin' ? 'TAZMIN: ' : 'לקוח: ') + clip(m.text, 300)).join('\n'));
  return lines.join('\n');
}
const SYSTEM = 'אתה אנליסט שיווק דיגיטלי של TAZMIN, סוכנות שבונה לעסקים קטנים בישראל אתרים, סרטונים לאינסטגרם, קידום ומודעות. ' +
  'המשימה: לחקור את הנוכחות העסקית הציבורית של העסק ברשת ולתת לבעל הסוכנות תמונה מהירה ומעשית לפני העבודה איתו.\n' +
  'גבולות חובה: חקור רק את העסק — האתר שלו, גוגל מפות/ביקורות, עמודים עסקיים ברשתות, אזכורים בכתבות, אתרי השוואה ומתחרים. ' +
  'אל תחפש ואל תכתוב מידע פרטי על בני אדם: לא כתובת מגורים, לא בני משפחה, לא חשבונות אישיים, לא מספרי טלפון פרטיים, לא היסטוריה אישית. שם איש הקשר נועד רק לזהות את העסק. ' +
  'אם לא בטוח שתוצאה שייכת לעסק הזה — כתוב שלא בטוח, אל תנחש.\n' +
  'כתוב בעברית, קצר וענייני, בפורמט הזה בדיוק (כל כותרת בשורה שמתחילה ב-## ):\n' +
  '## מי זה\n## איפה הם ברשת\n## מה אומרים עליהם\n## מה עובד באינסטגרם\n## מתחרים\n## 5 המלצות ל-TAZMIN\n' +
  'בכל סעיף עד 5 שורות קצרות שמתחילות ב-"- ". בסעיף ההמלצות: המלצות מעשיות לפי השירותים של TAZMIN (אתר, סרטונים, קידום, מודעות).';

async function research(c, ig, chat) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw err('ai_not_configured', 503);
  const body = {
    model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5', max_tokens: 2500, system: SYSTEM,
    tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 6, user_location: { type: 'approximate', country: 'IL', timezone: 'Asia/Jerusalem' } }],
    messages: [{ role: 'user', content: 'חקור את העסק הזה:\n' + brief(c, ig, chat) }],
  };
  let out = [], j;
  for (let round = 0; round < 3; round++) {
    const resp = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body: JSON.stringify(body) });
    j = await resp.json().catch(() => ({}));
    if (!resp.ok) throw err('ai_error: ' + clip((j.error && j.error.message) || resp.status, 200), 502);
    out = out.concat(j.content || []);
    if (j.stop_reason !== 'pause_turn') break;
    body.messages = body.messages.concat([{ role: 'assistant', content: j.content }]);
  }
  // keep only the final written report (text after the last search) + sources
  let lastTool = -1; out.forEach((b, i) => { if (b.type === 'web_search_tool_result' || b.type === 'server_tool_use') lastTool = i; });
  const text = out.slice(lastTool + 1).filter(b => b.type === 'text').map(b => b.text).join('').trim();
  const src = {};
  out.forEach(b => {
    (b.citations || []).forEach(ci => { if (ci.url) src[ci.url] = src[ci.url] || { url: ci.url, title: clip(ci.title, 120) }; });
  });
  return { text: clip(text, 8000), sources: Object.values(src).slice(0, 15), searches: (j.usage && j.usage.server_tool_use && j.usage.server_tool_use.web_search_requests) || 0 };
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const send = (s, o) => res.status(s).json(o);
  if (!RURL || !RTOK) return send(503, { error: 'db_not_connected' });
  if (!isAdmin(req)) return send(401, { error: process.env.ADMIN_PASSWORD ? 'unauthorized' : 'no_admin_password' });
  const a = String((req.query && req.query.a) || '');
  const b = (req.body && typeof req.body === 'object') ? req.body : {};
  try {
    const id = clip((req.query && req.query.id) || b.id, 20);
    const c = await getClient(id);
    if (!c) return send(404, { error: 'not_found' });
    const ins = await getIns(id);
    if (a === 'get') return send(200, { instagram: c.instagram || '', ins, config: { ig: !!(process.env.IG_ACCESS_TOKEN && process.env.IG_USER_ID), ai: !!process.env.ANTHROPIC_API_KEY } });
    if (a === 'setig' && req.method === 'POST') {
      const h = b.handle === '' ? '' : cleanHandle(b.handle);
      if (b.handle !== '' && !h) return send(400, { error: 'bad_handle' });
      c.instagram = h; await r('SET', 'client:' + id, JSON.stringify(c));
      if (ins.ig && ins.ig.username !== h) { delete ins.ig; await saveIns(id, ins); }
      return send(200, { instagram: h, ins });
    }
    if (a === 'ig' && req.method === 'POST') {
      if (!c.instagram) return send(400, { error: 'no_handle' });
      ins.ig = await fetchInstagram(c.instagram); ins.ig.t = Date.now();
      await saveIns(id, ins);
      return send(200, { ins });
    }
    if (a === 'who' && req.method === 'POST') {
      const chat = ((await r('LRANGE', 'msgs:' + id, -15, -1)) || []).map(J).filter(m => m && m.text);
      ins.who = await research(c, ins.ig, chat); ins.who.t = Date.now();
      await saveIns(id, ins);
      return send(200, { ins });
    }
    return send(400, { error: 'bad_action' });
  } catch (e) {
    return send(e.status || 500, { error: e.message || 'server_error' });
  }
};
