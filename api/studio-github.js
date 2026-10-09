// TAZMIN Studio — "Sign in with GitHub" (OAuth web flow). Vercel Node function, no dependencies.
// Env: GH_CLIENT_ID, GH_CLIENT_SECRET  (GitHub → Settings → Developer settings → OAuth Apps)
// Callback URL to register on GitHub: https://<your-domain>/api/studio-github
// The token is handed to the browser in the URL fragment (never logged by servers) and kept only on the user's device.
const crypto = require('crypto');

function cookies(req) {
  const o = {};
  String(req.headers.cookie || '').split(';').forEach(p => { const i = p.indexOf('='); if (i > 0) o[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); });
  return o;
}
function back(res, frag) { res.statusCode = 302; res.setHeader('Location', '/studio/#' + frag); res.setHeader('Cache-Control', 'no-store'); res.end(); }

module.exports = async (req, res) => {
  const id = process.env.GH_CLIENT_ID, secret = process.env.GH_CLIENT_SECRET;
  const q = req.query || {};
  if (!id || !secret) return back(res, 'gh_error=not_configured');

  if (q.start) {
    const state = crypto.randomBytes(16).toString('hex');
    res.setHeader('Set-Cookie', 'gh_state=' + state + '; Path=/api/studio-github; HttpOnly; Secure; SameSite=Lax; Max-Age=600');
    res.statusCode = 302;
    res.setHeader('Location', 'https://github.com/login/oauth/authorize?client_id=' + encodeURIComponent(id) + '&scope=' + encodeURIComponent('read:user') + '&state=' + state + '&allow_signup=true');
    return res.end();
  }

  if (q.error) return back(res, 'gh_error=denied');
  const st = cookies(req).gh_state;
  if (!q.code || !q.state || !st || st !== String(q.state)) return back(res, 'gh_error=state');
  res.setHeader('Set-Cookie', 'gh_state=; Path=/api/studio-github; Max-Age=0; HttpOnly; Secure; SameSite=Lax');
  try {
    const t = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: id, client_secret: secret, code: String(q.code) })
    }).then(r => r.json());
    if (!t.access_token) return back(res, 'gh_error=exchange');
    const u = await fetch('https://api.github.com/user', { headers: { Authorization: 'Bearer ' + t.access_token, 'User-Agent': 'tazmin-studio', Accept: 'application/vnd.github+json' } }).then(r => r.json());
    const p = new URLSearchParams({ gh: t.access_token, login: u.login || '', name: u.name || u.login || '', avatar: u.avatar_url || '' });
    return back(res, p.toString());
  } catch (e) {
    return back(res, 'gh_error=network');
  }
};
