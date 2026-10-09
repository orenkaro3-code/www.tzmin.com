/* TAZMIN Studio — installable AI studio.
   Each user brings their own Claude API key (kept in this browser only, sent straight to api.anthropic.com).
   Flow: install → sign in (GitHub or name) → connect Claude → pick a category + write an idea
         → chat with Claude + skill search (my GitHub / GitHub / TikTok / Instagram) → live build with code + preview. */
(function () {
  'use strict';
  var d = document;
  function $(id) { return d.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var LS = {
    get: function (k, def) { try { var v = localStorage.getItem('studio.' + k); return v == null ? def : JSON.parse(v); } catch (e) { return def; } },
    set: function (k, v) { try { if (v == null) localStorage.removeItem('studio.' + k); else localStorage.setItem('studio.' + k, JSON.stringify(v)); } catch (e) { toast('האחסון במכשיר מלא — מחקו פרויקטים ישנים'); } }
  };
  function toast(m) { var t = $('toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(function () { t.classList.remove('show'); }, 3200); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function ago(t) { var m = Math.round((Date.now() - t) / 6e4); if (m < 1) return 'עכשיו'; if (m < 60) return 'לפני ' + m + ' דק׳'; var h = Math.round(m / 60); if (h < 24) return 'לפני ' + h + ' שע׳'; return 'לפני ' + Math.round(h / 24) + ' ימים'; }

  var HELPER_MODEL = 'claude-haiku-5-5';
  var CATS = [
    { id: 'video', e: '🎬', t: 'עריכת סרטונים', d: 'הוק, חיתוכים, כתוביות ותסריט', mode: 'video', en: 'video editing' },
    { id: 'research', e: '🔍', t: 'חקירת אינסטגרם ואתרים', d: 'נתונים, תוכן ומתחרים', mode: 'research', en: 'instagram analytics website analysis' },
    { id: 'site', e: '🌐', t: 'בניית אתרים', d: 'אתר מלא עם תצוגה חיה', mode: 'build', en: 'website frontend design' },
    { id: 'code', e: '⌨️', t: 'כתיבת קוד', d: 'סקריפטים, פונקציות, תיקונים', mode: 'build', en: 'coding' },
    { id: 'files', e: '🗂️', t: 'סידור קבצים במחשב', d: 'בוחרים תיקייה, Claude מסדר', mode: 'files', en: 'file organization' },
    { id: 'slides', e: '📊', t: 'בניית מצגות', d: 'מצגת שמציגים מהדפדפן', mode: 'build', en: 'presentation slides' },
    { id: 'app', e: '📱', t: 'בניית אפליקציות', d: 'אפליקציה שעובדת בטלפון', mode: 'build', en: 'mobile web app' },
    { id: 'plugin', e: '🧩', t: 'בניית פלאגינים', d: 'תוסף לכרום או פלאגין ל-Claude', mode: 'build', en: 'chrome extension claude plugin' },
    { id: 'game', e: '🎮', t: 'משחקים', d: 'משחק שאפשר לשחק מיד', mode: 'build', en: 'html5 game' }
  ];
  function cat(id) { return CATS.filter(function (c) { return c.id === id; })[0] || CATS[2]; }

  var S = {
    user: LS.get('user', null), key: LS.get('key', ''), model: LS.get('model', 'claude-sonnet-5-5'), mcp: LS.get('mcp', []),
    dev: LS.get('dev', '') || (function () { var x = (crypto.randomUUID ? crypto.randomUUID() : uid() + uid()).replace(/-/g, ''); LS.set('dev', x); return x; })(), left: null, projects: LS.get('projects', []), cur: null, pickCat: null, busy: false, ctrl: null, view: 'preview', file: null, src: 'mine', installEvt: null
  };
  function saveProjects() { S.projects = S.projects.slice(0, 30); LS.set('projects', S.projects); }
  function P() { return S.cur; }

  /* ================= SCREENS ================= */
  var SCREENS = ['scInstall', 'scLogin', 'scKey', 'scHome', 'scWork'];
  function show(id) { SCREENS.forEach(function (s) { $(s).hidden = s !== id; }); window.scrollTo(0, 0); }
  function isInstalled() { return matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: window-controls-overlay)').matches || navigator.standalone === true; }
  function next() {
    if (!isInstalled() && !LS.get('skipInstall', false)) return show('scInstall');
    if (!S.user) return show('scLogin');
    renderHome(); show('scHome');
  }

  /* ---------- install ---------- */
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); S.installEvt = e; });
  window.addEventListener('appinstalled', function () { toast('הותקן! אפשר להצמיד לשורת המשימות'); LS.set('skipInstall', true); next(); });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/studio/sw.js', { scope: '/studio/' }).catch(function () {});
  function installHelp() {
    var ua = navigator.userAgent, h;
    if (/iPhone|iPad|iPod/.test(ua)) h = '<b>באייפון / אייפד (Safari):</b><ol><li>לחצו על כפתור השיתוף ⬆︎ למטה</li><li>בחרו "הוספה למסך הבית"</li><li>לחצו "הוסף"</li></ol>';
    else if (/Android/.test(ua)) h = '<b>באנדרואיד (Chrome):</b><ol><li>תפריט ⋮ למעלה</li><li>"התקנת אפליקציה" או "הוספה למסך הבית"</li></ol>';
    else if (/Macintosh/.test(ua) && /Safari/.test(ua) && !/Chrome|Edg/.test(ua)) h = '<b>במק (Safari):</b><ol><li>תפריט "קובץ"</li><li>"הוסף ל-Dock"</li></ol>';
    else h = '<b>במחשב (Chrome / Edge):</b><ol><li>לחצו על סמל ההתקנה ⊕ בצד של שורת הכתובת, או תפריט ⋮ ← "התקנת TAZMIN Studio"</li><li>אחרי שהאפליקציה נפתחת: לחיצה ימנית על האייקון שלה בשורת המשימות ← <b>"הצמדה לשורת המשימות"</b></li></ol>';
    $('installHelp').innerHTML = h; $('installHelp').hidden = false;
  }
  $('installBtn').onclick = function () {
    if (!S.installEvt) { installHelp(); return; }
    S.installEvt.prompt();
    S.installEvt.userChoice.then(function (r) { S.installEvt = null; if (r.outcome === 'accepted') { LS.set('skipInstall', true); installHelp(); toast('מותקן! עכשיו הצמידו לשורת המשימות'); setTimeout(next, 2500); } });
  };
  $('skipInstall').onclick = function () { LS.set('skipInstall', true); next(); };

  /* ---------- login ---------- */
  $('ghLogin').onclick = function () { location.href = '/api/studio-github?start=1'; };
  $('nameForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var n = $('nameIn').value.trim(), g = $('ghUserIn').value.trim().replace(/^@/, '').replace(/^https?:\/\/github\.com\//i, '').replace(/\/.*$/, '');
    if (!n) { $('loginErr').textContent = 'כתבו שם'; $('nameIn').focus(); return; }
    if (g && !/^[A-Za-z0-9-]{1,39}$/.test(g)) { $('loginErr').textContent = 'שם המשתמש ב-GitHub לא תקין'; return; }
    S.user = { name: n, ghLogin: g || '', ghToken: '', avatar: g ? 'https://github.com/' + g + '.png?size=60' : '' };
    LS.set('user', S.user); next();
  });
  (function readHash() {
    if (!location.hash) return;
    var p = new URLSearchParams(location.hash.slice(1));
    if (p.get('gh')) {
      S.user = { name: p.get('name') || p.get('login'), ghLogin: p.get('login') || '', ghToken: p.get('gh'), avatar: p.get('avatar') || '' };
      LS.set('user', S.user); toast('מחובר ל-GitHub כ-' + S.user.ghLogin);
    } else if (p.get('gh_error')) {
      setTimeout(function () { toast(p.get('gh_error') === 'not_configured' ? 'כניסה עם GitHub עוד לא הוגדרה בשרת — אפשר להיכנס עם שם משתמש' : 'הכניסה עם GitHub לא הצליחה, נסו שוב'); }, 300);
    }
    history.replaceState(null, '', location.pathname + location.search);
  })();

  /* ---------- Claude key ---------- */
  $('keyForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var k = $('keyIn').value.trim(), m = $('modelIn').value;
    if (!/^sk-ant-/.test(k)) { $('keyErr').textContent = 'מפתח של Claude מתחיל ב-sk-ant-'; return; }
    $('keyBtn').disabled = true; $('keyBtn').textContent = 'בודק…'; $('keyErr').textContent = '';
    claude({ key: k, model: m, max_tokens: 8, messages: [{ role: 'user', content: 'hi' }] }).then(function () {
      S.key = k; S.model = m; LS.set('key', k); LS.set('model', m); $('keyIn').value = ''; toast('Claude מחובר ✓'); next();
    }).catch(function (er) { $('keyErr').textContent = apiErr(er); }).then(function () { $('keyBtn').disabled = false; $('keyBtn').textContent = 'חיבור ובדיקה'; });
  });
  $('keySkip').onclick = function () { $('keyIn').value = ''; renderHome(); show('scHome'); };
  function apiErr(er) {
    var s = er && er.status, m = (er && er.message) || '';
    if (s === 401) return 'המפתח לא תקין.';
    if (s === 403) return 'למפתח אין הרשאה למודל הזה.';
    if (s === 404) return 'המודל לא נמצא — בחרו מודל אחר בהגדרות.';
    if (s === 429 && m === 'quota') return 'נגמרה המכסה היומית שלך בסטודיו 🙏 היא מתחדשת מחר. רוצים להמשיך עכשיו? אפשר להוסיף מפתח Claude משלכם בהגדרות ⚙︎.';
    if (s === 429 && m === 'global_quota') return 'הסטודיו הגיע למכסה היומית של כולם. נסו שוב מחר, או הוסיפו מפתח משלכם בהגדרות ⚙︎.';
    if (m === 'studio_not_configured') return 'הסטודיו עוד לא מחובר ל-Claude בשרת (חסר ANTHROPIC_API_KEY).';
    if (s === 429) return 'יותר מדי בקשות. נסו שוב עוד רגע.';
    if (s === 529 || s === 503) return 'Claude עמוס כרגע, נסו שוב עוד רגע.';
    if (/credit|billing/i.test(m)) return 'נגמר הקרדיט בחשבון ה-API.';
    if (!s) return 'אין חיבור לאינטרנט או ש-Anthropic לא זמינה.';
    return 'שגיאה: ' + m.slice(0, 160);
  }

  /* ================= CLAUDE API ================= */
  function claude(o) {
    var mcp = (o.useMcp ? S.mcp : []).filter(function (x) { return x.on !== false; });
    var body = { model: o.model || S.model, max_tokens: o.max_tokens || 4096, messages: o.messages };
    if (o.system) body.system = o.system;
    var tools = (o.tools || []).slice();
    if (mcp.length) {
      body.mcp_servers = mcp.map(function (x) { var s = { type: 'url', url: x.url, name: x.name }; if (x.token) s.authorization_token = x.token; return s; });
      mcp.forEach(function (x) { tools.push({ type: 'mcp_toolset', mcp_server_name: x.name }); });
    }
    if (tools.length) body.tools = tools;
    if (o.onText) body.stream = true;
    var own = o.key || S.key, url, h;
    if (own) { // user's own key: straight to Anthropic, no limits
      url = 'https://api.anthropic.com/v1/messages';
      h = { 'x-api-key': own, 'anthropic-version': '2023-06-01', 'content-type': 'application/json', 'anthropic-dangerous-direct-browser-access': 'true' };
      if (mcp.length) h['anthropic-beta'] = 'mcp-client-2025-11-20';
    } else { // studio's key via our server, with a daily allowance
      url = '/api/studio-claude'; h = { 'content-type': 'application/json', 'x-studio-device': S.dev };
      if (body.model === 'claude-opus-5-5') body.model = 'claude-sonnet-5-5';
    }
    return fetch(url, { method: 'POST', headers: h, body: JSON.stringify(body), signal: o.signal }).then(function (r) {
      var left = r.headers.get('x-studio-left'); if (left != null) { S.left = +left; renderLeft(); }
      if (!r.ok) return r.json().catch(function () { return {}; }).then(function (j) { var e = new Error((j.error && j.error.message) || ('HTTP ' + r.status)); e.status = r.status; throw e; });
      if (!o.onText) return r.json();
      return readStream(r, o);
    });
  }
  // SSE reader → calls o.onText(delta) and o.onEvent({kind, ...}); resolves {text, stop_reason, content}
  function readStream(r, o) {
    var rd = r.body.getReader(), dec = new TextDecoder(), buf = '', blocks = {}, text = '', stop = null, content = [];
    function handle(ev) {
      if (ev.type === 'content_block_start') {
        var b = ev.content_block; blocks[ev.index] = { type: b.type, name: b.name, server: b.server_name, json: '', block: b };
        if (b.type === 'web_search_tool_result' && o.onEvent) o.onEvent({ kind: 'results', n: Array.isArray(b.content) ? b.content.length : 0 });
      } else if (ev.type === 'content_block_delta') {
        var x = blocks[ev.index]; if (!x) return;
        if (ev.delta.type === 'text_delta') { text += ev.delta.text; x.text = (x.text || '') + ev.delta.text; o.onText(ev.delta.text, text); }
        else if (ev.delta.type === 'input_json_delta') x.json += ev.delta.partial_json || '';
      } else if (ev.type === 'content_block_stop') {
        var y = blocks[ev.index]; if (!y) return;
        if (y.type === 'server_tool_use' || y.type === 'mcp_tool_use') {
          var inp = {}; try { inp = JSON.parse(y.json || '{}'); } catch (e) {}
          y.block.input = inp;
          if (o.onEvent) o.onEvent(y.type === 'server_tool_use' ? { kind: 'search', query: inp.query || '' } : { kind: 'mcp', name: y.name, server: y.server });
        }
        if (y.type === 'text') y.block.text = y.text || '';
        content[ev.index] = y.block;
      } else if (ev.type === 'message_delta') { if (ev.delta && ev.delta.stop_reason) stop = ev.delta.stop_reason; }
      else if (ev.type === 'error') { var er = new Error((ev.error && ev.error.message) || 'stream error'); er.status = ev.error && ev.error.type === 'overloaded_error' ? 529 : 500; throw er; }
    }
    function pump() {
      return rd.read().then(function (res) {
        if (res.done) return { text: text, stop_reason: stop, content: content.filter(Boolean) };
        buf += dec.decode(res.value, { stream: true });
        var parts = buf.split('\n\n'); buf = parts.pop();
        parts.forEach(function (chunk) {
          chunk.split('\n').forEach(function (line) { if (line.indexOf('data:') === 0) { var js = line.slice(5).trim(); if (js && js !== '[DONE]') { var ev; try { ev = JSON.parse(js); } catch (e) { return; } handle(ev); } } });
        });
        return pump();
      });
    }
    return pump();
  }
  function textOf(j) { return (j.content || []).filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text; }).join(''); }
  function jsonFrom(t) { var m = String(t).match(/```(?:json)?\s*([\s\S]*?)```/); var s = m ? m[1] : t; var a = s.indexOf('{') > -1 && (s.indexOf('[') === -1 || s.indexOf('{') < s.indexOf('[')) ? s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1) : s.slice(s.indexOf('['), s.lastIndexOf(']') + 1); try { return JSON.parse(a); } catch (e) { return null; } }
  function helper(o) { // cheap helper call, falls back to the main model
    o.model = HELPER_MODEL;
    return claude(o).catch(function (e) { if (e.status === 404 || e.status === 403) { o.model = S.model; return claude(o); } throw e; });
  }

  function renderLeft() {
    var t = S.key ? '' : S.left == null ? '' : S.left > 0 ? 'נשארו ' + S.left + ' הודעות היום' : 'המכסה היומית נגמרה';
    d.querySelectorAll('.leftchip').forEach(function (el) { el.textContent = t; el.hidden = !t; });
  }
  /* ================= HOME ================= */
  function renderUser() {
    var u = S.user || {};
    $('whoBox').innerHTML = (u.avatar ? '<img src="' + esc(u.avatar) + '" alt="">' : '') + '<span>' + esc(u.name || '') + (u.ghLogin ? ' · <span dir="ltr">@' + esc(u.ghLogin) + '</span>' : '') + '</span>';
  }
  function renderHome() {
    renderUser(); renderLeft();
    var hr = new Date().getHours();
    $('greet').textContent = (hr < 12 ? 'בוקר טוב' : hr < 18 ? 'צהריים טובים' : 'ערב טוב') + (S.user && S.user.name ? ', ' + S.user.name : '') + '. מה בונים?';
    $('cats').innerHTML = CATS.map(function (c) { return '<button type="button" class="cat" role="radio" aria-checked="' + (S.pickCat === c.id) + '" data-cat="' + c.id + '"><span class="e" aria-hidden="true">' + c.e + '</span><b>' + esc(c.t) + '</b><small>' + esc(c.d) + '</small></button>'; }).join('');
    var c = S.pickCat && cat(S.pickCat);
    $('catChip').textContent = c ? c.e + ' ' + c.t : 'בחרו קטגוריה';
    $('ideaIn').placeholder = c ? PLACE[c.id] : 'כתבו את הרעיון… למשל: משחק ריצה עם חתול שאוסף דגים';
    $('plist').innerHTML = S.projects.length ? S.projects.map(function (p) { var k = cat(p.cat); return '<button type="button" class="pitem" data-proj="' + esc(p.id) + '"><b>' + k.e + ' ' + esc(p.title) + '</b><small>' + esc(k.t) + ' · ' + ago(p.updated || p.created) + '</small></button>'; }).join('') : '<p class="muted" style="margin:0">עוד אין פרויקטים. בחרו קטגוריה וכתבו רעיון.</p>';
  }
  var PLACE = {
    video: 'מה הסרטון? למשל: רילס של 30 שניות למסעדת המבורגרים — אחר כך תעלו את הסרטון בצ׳אט',
    research: 'איזה עמוד או אתר לחקור? למשל: @petra.burger או https://example.co.il',
    site: 'איזה אתר? למשל: אתר תדמית שחור-זהב למספרה באשדוד עם קביעת תורים',
    code: 'מה לכתוב? למשל: סקריפט פייתון שממיר את כל התמונות בתיקייה ל-WebP',
    files: 'איך לסדר? למשל: לפי סוג קובץ ושנה. אחר כך בוחרים תיקייה בצ׳אט',
    slides: 'על מה המצגת? למשל: 8 שקפים על השירותים של TAZMIN ללקוחות',
    app: 'איזו אפליקציה? למשל: אפליקציה למעקב אימונים עם טיימר',
    plugin: 'איזה פלאגין? למשל: תוסף כרום ששומר מחירים מאלי אקספרס',
    game: 'איזה משחק? למשל: משחק ריצה עם חתול שאוסף דגים'
  };
  d.addEventListener('click', function (e) {
    var c = e.target.closest('.cat'); if (c) { S.pickCat = c.dataset.cat; renderHome(); $('ideaIn').focus(); return; }
    var p = e.target.closest('.pitem'); if (p) { openProject(p.dataset.proj); return; }
    var o = e.target.closest('[data-open="settings"]'); if (o) { openSettings(); }
  });
  $('ideaForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var idea = $('ideaIn').value.trim();
    if (!S.pickCat) { toast('בחרו קודם מה עושים ☝️'); $('cats').querySelector('.cat').focus(); return; }
    if (!idea) { $('ideaIn').focus(); return; }
    var p = { id: uid(), cat: S.pickCat, idea: idea, title: idea.slice(0, 48), created: Date.now(), updated: Date.now(), msgs: [], files: {}, skills: [], found: {} };
    S.projects.unshift(p); saveProjects(); $('ideaIn').value = '';
    openProject(p.id, true);
  });
  $('ideaIn').addEventListener('keydown', function (e) { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) $('ideaForm').requestSubmit(); });

  /* ================= WORKSPACE ================= */
  function openProject(id, fresh) {
    var p = S.projects.filter(function (x) { return x.id === id; })[0]; if (!p) return;
    S.cur = p; S.file = null; S.view = Object.keys(p.files).length ? 'preview' : 'preview';
    var k = cat(p.cat);
    $('pTitle').textContent = p.title; $('pCat').textContent = k.e + ' ' + k.t;
    $('mcpBadge').textContent = S.mcp.filter(function (x) { return x.on !== false; }).length ? '· MCP ' + S.mcp.filter(function (x) { return x.on !== false; }).length : '';
    show('scWork'); setPane('chat');
    renderMsgs(); renderTools(); renderFiles(); renderPreview(); renderSkills();
    if (fresh) { startSkillSearch(); send(p.idea, null, true); }
  }
  $('backBtn').onclick = function () { if (S.ctrl) S.ctrl.abort(); S.cur = null; renderHome(); show('scHome'); };
  function setPane(n) { $('scWork').querySelector('.panes').dataset.show = n; $('scWork').querySelector('.panes').classList.toggle('show-skills', n === 'skills'); d.querySelectorAll('.mtabs button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.pane === n)); }); }
  d.querySelector('.mtabs').addEventListener('click', function (e) { var b = e.target.closest('[data-pane]'); if (!b) return; var cur = $('scWork').querySelector('.panes').dataset.show; setPane(b.dataset.pane === 'skills' && cur === 'skills' && innerWidth > 760 ? 'chat' : b.dataset.pane); });

  /* ---------- system prompt per category ---------- */
  var FILE_RULES = 'כשאתה יוצר או משנה קבצים — כתוב כל קובץ במלואו (לא diff) בבלוק בפורמט הזה בדיוק:\n```file:path/name.ext\n...כל התוכן...\n```\n' +
    'בתוך הקבצים אל תשתמש בשלושה backticks (במסמכי markdown השתמש ב-~~~ לבלוקי קוד).\n' +
    'לפני הקבצים כתוב משפט-שניים בעברית מה אתה בונה, ואחריהם שורה-שתיים מה אפשר לשפר. בלי הסברים ארוכים — העבודה בתוך הקבצים.';
  var BUILD = {
    site: 'בנה אתר מלא, מודרני ויפה, רספונסיבי לטלפון, בעברית RTL אלא אם ביקשו אחרת. קובץ index.html עצמאי (CSS ו-JS בפנים; ספריות רק מ-cdnjs/jsdelivr/unpkg). עיצוב ברמה גבוהה: טיפוגרפיה חזקה, אנימציות גלילה עדינות, בלי טקסט "Lorem".',
    code: 'כתוב קוד נקי עם הערות קצרות, בשפה שהמשתמש ביקש (ברירת מחדל: JavaScript/Python לפי ההקשר). אם אפשר להריץ בדפדפן — הוסף גם index.html שמדגים את הקוד בפעולה. אם זה סקריפט למחשב — הוסף README.md קצר בעברית איך מריצים.',
    slides: 'בנה מצגת HTML בקובץ index.html: שקף אחד במסך מלא בכל פעם, ניווט בחיצים/לחיצה/החלקה, מספר שקף, מעברים עדינים, ו-print CSS כך ש"הדפסה ל-PDF" נותנת שקף לעמוד. עיצוב נקי ומרשים, עברית RTL.',
    app: 'בנה אפליקציית ווב שעובדת מצוין בטלפון (mobile-first) בקובץ index.html עצמאי, עם שמירה ב-localStorage (עטוף ב-try/catch) כשצריך. ממשק נקי כמו אפליקציה אמיתית, עברית RTL.',
    plugin: 'ברירת מחדל: תוסף לכרום (Manifest V3) — manifest.json, popup.html, popup.js ושאר הקבצים, ובנוסף index.html שמציג תצוגה מקדימה של ה-popup. אם ביקשו פלאגין/סקיל ל-Claude — צור מבנה של סקיל (תיקייה עם SKILL.md עם frontmatter name/description והוראות) או פלאגין (.claude-plugin/plugin.json + skills/). הוסף README.md בעברית איך מתקינים.',
    game: 'בנה משחק HTML5 שאפשר לשחק מיד בקובץ index.html עצמאי (canvas), עם מקלדת וגם מגע בטלפון, ניקוד, מסך פתיחה, מסך סיום ו"שחק שוב", אפקטים וצלילים קצרים ב-WebAudio. שיהיה כיף ומלוטש.'
  };
  function system(p) {
    var k = cat(p.cat), u = S.user || {};
    var s = 'אתה Claude בתוך TAZMIN Studio — סטודיו שבו ' + (u.name || 'המשתמש') + ' בוחר קטגוריה, כותב רעיון, ואתה בונה איתו. ענה תמיד בעברית, קצר וחם.\n' +
      'הקטגוריה: ' + k.t + '. הרעיון המקורי: ' + p.idea + '\n\n';
    if (k.mode === 'build') s += BUILD[k.id] + '\n\n' + FILE_RULES;
    if (k.mode === 'research') s += 'אתה חוקר נתונים על עמודי אינסטגרם עסקיים/של יוצרים ועל אתרים. השתמש בחיפוש ברשת. אסוף רק מידע ציבורי על העסק/המותג/היוצר: מה הם מפרסמים, מה עובד, תדירות, סגנון, ביקורות, מתחרים, SEO ומהירות האתר כשרלוונטי. אל תאסוף מידע פרטי על אנשים פרטיים (כתובת מגורים, משפחה, חשבונות אישיים). אם משהו לא בטוח — תגיד. בסוף צור דוח ויזואלי יפה בקובץ:\n' + FILE_RULES + '\nשם הקובץ: index.html (דוח בעברית RTL עם כרטיסים, מספרים בולטים וקישורים למקורות).';
    if (k.mode === 'video') s += 'אתה עורך וידאו לרשתות חברתיות. כשמעלים סרטון תקבל פריימים ממנו עם חותמות זמן. תן: הוק ל-3 השניות הראשונות, רשימת חיתוכים עם זמנים מדויקים, טקסטים על המסך, מוזיקה/סאונד מומלץ, קצב, וכיתוב לפוסט עם האשטגים. צור קבצים:\n' + FILE_RULES + '\nקבצים: edit-plan.md (תוכנית העריכה) ו-captions.srt (כתוביות בעברית לפי הזמנים). אם אין עדיין סרטון — תכתוב תסריט שוט-אחר-שוט ובקש להעלות.';
    if (k.mode === 'files') s += 'אתה מסדר קבצים. תקבל רשימת קבצים מתיקייה שהמשתמש בחר (נתיבים יחסיים, גודל, תאריך). הצע מבנה תיקיות הגיוני לפי מה שביקש. לעולם אל תמחק ואל תשנה תוכן — רק העברות. החזר תוכנית בבלוק:\n```file:plan.json\n{"summary":"...","moves":[{"from":"נתיב/ישן.jpg","to":"תיקייה/חדשה/ישן.jpg"}]}\n```\nהנתיבים יחסיים לתיקייה שנבחרה, בלי ../ . אל תעביר קבצים שכבר במקום טוב. אחרי הבלוק הסבר בקצרה בעברית.';
    var files = Object.keys(p.files);
    if (files.length && k.mode !== 'files') s += '\n\nהקבצים הנוכחיים בפרויקט (עדכן על בסיסם, והחזר כל קובץ ששינית במלואו):\n' + files.map(function (f) { return '```file:' + f + '\n' + p.files[f] + '\n```'; }).join('\n').slice(0, 120000);
    var sk = (p.skills || []).filter(function (x) { return x.text; });
    if (sk.length) s += '\n\nסקילים שהמשתמש בחר — עקוב אחרי ההוראות שלהם כשהן רלוונטיות:\n' + sk.map(function (x) { return '<skill name="' + x.name + '" source="' + x.url + '">\n' + x.text + '\n</skill>'; }).join('\n');
    if (S.mcp.some(function (x) { return x.on !== false; })) s += '\n\nיש לך כלים משרתי MCP של המשתמש — השתמש בהם כשהם עוזרים.';
    return s;
  }

  /* ---------- chat ---------- */
  function md(t) { // tiny markdown → html (escaped)
    var out = [], list = null;
    esc(t).split('\n').forEach(function (l) {
      var li = l.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)/);
      if (li) { if (!list) { list = []; } list.push('<li>' + inline(li[1]) + '</li>'); return; }
      if (list) { out.push('<ul>' + list.join('') + '</ul>'); list = null; }
      var hh = l.match(/^#{1,4}\s+(.*)/);
      if (hh) out.push('<p><b>' + inline(hh[1]) + '</b></p>'); else if (l.trim()) out.push('<p>' + inline(l) + '</p>');
    });
    if (list) out.push('<ul>' + list.join('') + '</ul>');
    return out.join('');
    function inline(s) { return s.replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(https?:\/\/[^\s<)]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer" dir="ltr">$1</a>'); }
  }
  function splitReply(t) { // replace file blocks with chips for the chat bubble
    var chips = [];
    var clean = String(t).replace(/```file:([^\n`]+)\n[\s\S]*?(?:```|$)/g, function (_, f) { chips.push(f.trim()); return '\n§F' + (chips.length - 1) + '§\n'; });
    return { text: clean, chips: chips };
  }
  function bubble(m) {
    if (m.role === 'note') return '<div class="m ai note">' + md(m.text) + (m.extra || '') + (m.prompt ? '<div class="notebtns"><button class="btn primary sm" type="button" data-reopen="' + esc(m.id) + '">פתח ב-Claude ↗</button><button class="btn ghost sm" type="button" data-copy="' + esc(m.id) + '">העתקת ההוראה</button></div>' : '') + '</div>';
    if (m.role === 'user') return '<div class="m me">' + (m.imgs || []).map(function (s) { return '<img class="att" src="' + s + '" alt="">'; }).join('') + md(m.show || m.text) + '</div>';
    var r = splitReply(m.text || ''), h = md(r.text).replace(/§F(\d+)§/g, function (_, i) { var f = r.chips[+i]; return '</p><button type="button" class="filechip" data-file="' + esc(f) + '">📄 ' + esc(f) + '</button><p>'; });
    return '<div class="m ai' + (m.err ? ' err' : '') + '">' + (m.events || []).map(function (ev) { return '<div class="tool">' + esc(ev) + '</div>'; }).join('') + h + (m.extra || '') + '</div>';
  }
  function renderMsgs(live) {
    var p = P(), el = $('msgs'); if (!p) return;
    var atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    var html = p.msgs.filter(function (m) { return !m.hidden; }).map(bubble).join('');
    if (live) html += bubble(live) + (live.text ? '' : '<div class="m ai"><span class="typing"><i></i><i></i><i></i></span></div>');
    if (!p.msgs.length && !live) html = '<div class="m ai"><p>היי! כתבו מה לבנות או לשנות.</p></div>';
    el.innerHTML = html;
    if (atBottom || live) el.scrollTop = el.scrollHeight;
  }
  $('msgs').addEventListener('click', function (e) {
    var f = e.target.closest('[data-file]'); if (f) { S.file = f.dataset.file; setView('code'); renderFiles(); setPane('build'); return; }
    var go = e.target.closest('[data-run-plan]'); if (go) { runPlan(); return; }
    var ro = e.target.closest('[data-reopen]'), cp = e.target.closest('[data-copy]');
    if (ro || cp) { var id = (ro || cp).dataset.reopen || (ro || cp).dataset.copy, m = P().msgs.filter(function (x) { return x.id === id; })[0]; if (!m) return; copyText(m.prompt); if (ro) openClaude(m.prompt); else toast('ההוראה הועתקה ✓'); }
  });
  $('chatForm').addEventListener('submit', function (e) { e.preventDefault(); var t = $('chatIn').value.trim(); if (!t || S.busy) return; $('chatIn').value = ''; autoGrow(); send(t); });
  $('chatIn').addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('chatForm').requestSubmit(); } });
  function autoGrow() { var t = $('chatIn'); t.style.height = 'auto'; t.style.height = Math.min(160, t.scrollHeight) + 'px'; }
  $('chatIn').addEventListener('input', autoGrow);

  function apiHistory(p) { // history sent to the API: file bodies stripped (current files ride in the system prompt)
    return p.msgs.filter(function (m) { return !m.err && m.role !== 'note'; }).map(function (m) {
      if (m.role === 'user') {
        if (m.apiImgs && m.apiImgs.length) return { role: 'user', content: m.apiImgs.map(function (b) { return { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b } }; }).concat([{ type: 'text', text: m.text }]) };
        return { role: 'user', content: m.text };
      }
      return { role: 'assistant', content: (m.text || '').replace(/```file:([^\n`]+)\n[\s\S]*?(?:```|$)/g, '[קובץ $1 עודכן]') || '…' };
    }).reduce(function (acc, m) { // merge consecutive same-role turns
      var last = acc[acc.length - 1];
      if (last && last.role === m.role) { last.content = [].concat(typeof last.content === 'string' ? [{ type: 'text', text: last.content }] : last.content, typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : m.content); }
      else acc.push(m);
      return acc;
    }, []);
  }

  function send(text, opts, first) {
    var p = P(); if (!p || S.busy) return;
    opts = opts || {};
    var k = cat(p.cat);
    p.msgs.push({ role: 'user', text: text, show: opts.show, imgs: opts.imgs, apiImgs: opts.apiImgs, hidden: opts.hidden });
    p.updated = Date.now(); saveProjects();
    var live = { role: 'assistant', text: '', events: [] };
    S.busy = true; $('sendBtn').disabled = true; $('paneChat').classList.add('glow', 'busy');
    renderMsgs(live);
    var startFiles = Object.assign({}, p.files), lastPaint = 0, lastFile = null;
    var tools = [];
    if (k.mode === 'research') tools.push({ type: 'web_search_20250305', name: 'web_search', max_uses: 8, user_location: { type: 'approximate', country: 'IL', timezone: 'Asia/Jerusalem' } });
    S.ctrl = new AbortController();
    var msgs = apiHistory(p), maxTok = k.mode === 'build' ? 32000 : k.mode === 'research' ? 12000 : 8000;
    function onText(delta, full) {
      live.text = full;
      var now = performance.now(); if (now - lastPaint < 60) return; lastPaint = now;
      var parsed = parseFiles(full);
      if (parsed.writing) {
        $('buildBar').hidden = false; $('buildTxt').textContent = 'כותב ' + parsed.writing + '…';
        if (lastFile !== parsed.writing) { lastFile = parsed.writing; S.file = parsed.writing; setView('code'); if (innerWidth <= 760 && first) setPane('build'); }
        p.files = Object.assign({}, startFiles, parsed.files);
        renderFiles(); renderCode(true);
      } else {
        $('buildBar').hidden = true;
        if (Object.keys(parsed.files).length) { p.files = Object.assign({}, startFiles, parsed.files); }
      }
      renderMsgs(live);
    }
    function onEvent(ev) {
      if (ev.kind === 'search') live.events.push('🔎 מחפש: ' + ev.query);
      else if (ev.kind === 'mcp') live.events.push('🧩 MCP: ' + ev.server + ' › ' + ev.name);
      renderMsgs(live);
    }
    function round(n, prefix) {
      return claude({ system: system(Object.assign({}, p, { files: startFiles })), messages: msgs, tools: tools, useMcp: true, max_tokens: maxTok, onText: function (dl, full) { onText(dl, prefix + full); }, onEvent: onEvent, signal: S.ctrl.signal })
        .then(function (r) {
          if (r.stop_reason === 'pause_turn' && n < 3) { msgs = msgs.concat([{ role: 'assistant', content: r.content }]); return round(n + 1, prefix + r.text); }
          if (r.stop_reason === 'max_tokens') live.extra = '<p class="muted">⚠︎ התשובה נחתכה כי הייתה ארוכה מדי. כתבו "תמשיך" או בקשו לפצל לקבצים קטנים.</p>';
          return prefix + r.text;
        });
    }
    round(0, '').then(function (full) {
      live.text = full;
      var parsed = parseFiles(full);
      p.files = Object.assign({}, startFiles, parsed.files);
      if (k.mode === 'files' && parsed.files['plan.json']) live.extra = planHtml(parsed.files['plan.json']);
      p.msgs.push({ role: 'assistant', text: full, events: live.events, extra: live.extra });
      if (first && !p.named) nameProject(p);
    }).catch(function (er) {
      if (er.name === 'AbortError') return;
      p.msgs.push({ role: 'assistant', text: apiErr(er), err: true });
      p.files = startFiles;
    }).then(function () {
      S.busy = false; S.ctrl = null; $('sendBtn').disabled = false; $('paneChat').classList.remove('busy'); $('buildBar').hidden = true;
      p.updated = Date.now(); saveProjects();
      if (P() === p) {
        renderMsgs(); renderFiles(); renderCode(false);
        var entry = htmlEntry();
        if (entry && p.files[entry] !== startFiles[entry]) setView('preview'); else if (S.view === 'code') renderCode(false);
        renderPreview();
      }
    });
  }
  function nameProject(p) {
    p.named = true;
    helper({ max_tokens: 40, messages: [{ role: 'user', content: 'תן שם קצר (2-4 מילים, בעברית, בלי מרכאות) לפרויקט הזה: ' + p.idea }] })
      .then(function (j) { var t = textOf(j).trim().replace(/^["'״]+|["'״.]+$/g, '').slice(0, 40); if (t) { p.title = t; saveProjects(); if (P() === p) $('pTitle').textContent = t; } }).catch(function () {});
  }

  /* ---------- files: parse, code view, preview ---------- */
  function parseFiles(t) {
    var files = {}, writing = null, re = /```file:([^\n`]+)\n([\s\S]*?)(```|$)/g, m;
    while ((m = re.exec(t))) { var f = m[1].trim().replace(/^\/+/, '').replace(/\.\.\//g, ''); files[f] = m[2].replace(/\n$/, ''); if (!m[3]) writing = f; if (!m[0].length) break; }
    return { files: files, writing: writing };
  }
  function renderFiles() {
    var p = P(), fs = p ? Object.keys(p.files) : [];
    if (fs.length && (!S.file || fs.indexOf(S.file) === -1)) S.file = fs.indexOf('index.html') > -1 ? 'index.html' : fs[0];
    $('fileTabs').innerHTML = fs.map(function (f) { return '<button type="button" data-tab="' + esc(f) + '" aria-current="' + (f === S.file) + '">' + esc(f) + '</button>'; }).join('');
    $('zipBtn').disabled = !fs.length; $('openBtn').disabled = !htmlEntry();
  }
  $('fileTabs').addEventListener('click', function (e) { var b = e.target.closest('[data-tab]'); if (!b) return; S.file = b.dataset.tab; renderFiles(); setView('code'); });
  var HL = /(&lt;!--[\s\S]*?--&gt;|\/\*[\s\S]*?\*\/|\/\/[^\n]*|#[^\n{]*$)|(&quot;[^\n]*?&quot;|&#39;[^\n]*?&#39;|`[^`]*`)|(&lt;\/?)([a-zA-Z][\w-]*)|\b(function|const|let|var|return|if|else|for|while|class|new|import|from|export|async|await|def|True|False|None|true|false|null)\b/gm;
  function hl(src) { // single pass, so highlights never nest into each other
    return esc(src).replace(HL, function (m, com, str, lt, tag, kw) {
      if (com) return /^#/.test(com) && !/\.(py|sh|md|ya?ml|txt)$/i.test(S.file || '') ? com : '<span class="tk-com">' + com + '</span>';
      if (str) return '<span class="tk-str">' + str + '</span>';
      if (lt) return lt + '<span class="tk-tag">' + tag + '</span>';
      return '<span class="tk-kw">' + kw + '</span>';
    });
  }
  function renderCode(streaming) {
    var p = P(); if (!p) return;
    var src = (S.file && p.files[S.file]) || '';
    var c = $('codeEl');
    if (streaming) { c.innerHTML = esc(src) + '<span class="cur"></span>'; var pre = $('code'); pre.scrollTop = pre.scrollHeight; }
    else c.innerHTML = src.length < 150000 ? hl(src) : esc(src);
  }
  function htmlEntry() { var p = P(); if (!p) return null; if (p.files['index.html']) return 'index.html'; return Object.keys(p.files).filter(function (f) { return /\.html?$/i.test(f); })[0] || null; }
  function bundle() { // inline local css/js so the preview works from a single document
    var p = P(), entry = htmlEntry(); if (!entry) return '';
    var html = p.files[entry];
    html = html.replace(/<link[^>]+href=["']([^"':]+\.css)["'][^>]*>/gi, function (m, f) { f = f.replace(/^\.\//, ''); return p.files[f] != null ? '<style>\n' + p.files[f] + '\n</style>' : m; });
    html = html.replace(/<script([^>]*)\ssrc=["']([^"':]+\.js)["']([^>]*)><\/script>/gi, function (m, a, f, b) { f = f.replace(/^\.\//, ''); return p.files[f] != null ? '<script' + a + b + '>\n' + p.files[f].replace(/<\/script/gi, '<\\/script') + '\n</script>' : m; });
    return html;
  }
  function renderPreview() {
    var pv = $('preview'), html = bundle();
    if (!html) { pv.innerHTML = '<div class="empty"><div class="orb sm" aria-hidden="true"><span></span></div><p>' + (P() && Object.keys(P().files).length ? 'אין דף להצגה — הקבצים בלשונית "קוד".' : 'מה ש-Claude בונה יופיע כאן.') + '</p></div>'; return; }
    var f = d.createElement('iframe'); f.title = 'תצוגה חיה'; f.setAttribute('sandbox', 'allow-scripts allow-forms allow-modals allow-popups allow-pointer-lock'); f.setAttribute('allow', 'autoplay; fullscreen; gamepad'); f.srcdoc = html;
    pv.innerHTML = ''; pv.appendChild(f);
  }
  function setView(v) {
    S.view = v; $('preview').hidden = v !== 'preview'; $('code').hidden = v !== 'code';
    d.querySelectorAll('#paneBuild .seg [data-view]').forEach(function (b) { b.setAttribute('aria-selected', String(b.dataset.view === v)); });
    if (v === 'code') renderCode(S.busy);
  }
  d.querySelector('#paneBuild .seg').addEventListener('click', function (e) { var b = e.target.closest('[data-view]'); if (b) { setView(b.dataset.view); if (b.dataset.view === 'preview') renderPreview(); } });
  $('openBtn').onclick = function () { var u = URL.createObjectURL(new Blob([bundle()], { type: 'text/html' })); window.open(u, '_blank', 'noopener'); setTimeout(function () { URL.revokeObjectURL(u); }, 60000); };
  $('zipBtn').onclick = function () {
    var p = P(), fs = Object.keys(p.files), name = (p.title || 'project').replace(/[\\/:*?"<>|]/g, '').trim() || 'project';
    if (fs.length === 1) return dl(new Blob([p.files[fs[0]]], { type: 'text/plain' }), fs[0].split('/').pop());
    if (!window.JSZip) { toast('רכיב ההורדה עוד נטען, נסו שוב'); return; }
    var z = new JSZip(); fs.forEach(function (f) { z.file(f, p.files[f]); });
    z.generateAsync({ type: 'blob' }).then(function (b) { dl(b, name + '.zip'); });
  };
  function dl(blob, name) { var a = d.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; d.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000); }

  /* ---------- category tools (video / files) ---------- */
  function renderTools() {
    var k = cat(P().cat), h = '';
    if (k.mode === 'video') h = '<label class="btn ghost sm">🎞️ העלאת סרטון<input type="file" accept="video/*" class="sr" id="vidIn"></label>';
    if (k.mode === 'files') h = '<button class="btn ghost sm" type="button" id="pickDir">📁 בחירת תיקייה לסידור</button>' + (S.dir ? '<span class="chip">📁 ' + esc(S.dir.name) + '</span>' : '');
    if (k.mode === 'research') h = '<span class="chip">🔎 חיפוש ברשת פעיל</span>';
    $('catTools').innerHTML = h;
    if ($('vidIn')) $('vidIn').addEventListener('change', onVideo);
    if ($('pickDir')) $('pickDir').onclick = pickDir;
  }
  function onVideo() {
    var f = this.files && this.files[0]; this.value = ''; if (!f) return;
    if (S.busy) { toast('חכו ש-Claude יסיים'); return; }
    toast('מחלץ פריימים מהסרטון…');
    var v = d.createElement('video'); v.muted = true; v.preload = 'auto'; v.src = URL.createObjectURL(f); v.playsInline = true;
    v.addEventListener('loadedmetadata', function () {
      var dur = v.duration || 0, n = Math.min(10, Math.max(4, Math.round(dur / 4))), times = [], i;
      for (i = 0; i < n; i++) times.push(Math.min(dur - 0.05, (dur * (i + 0.5)) / n));
      var cv = d.createElement('canvas'), sc = Math.min(1, 512 / Math.max(v.videoWidth, v.videoHeight)); cv.width = Math.round(v.videoWidth * sc); cv.height = Math.round(v.videoHeight * sc);
      var ctx = cv.getContext('2d'), shots = [], thumbs = [];
      (function grab(j) {
        if (j >= times.length) {
          URL.revokeObjectURL(v.src);
          var lines = times.map(function (t, k) { return 'פריים ' + (k + 1) + ' — ' + t.toFixed(1) + ' שנ׳'; }).join('\n');
          send('העליתי סרטון: ' + f.name + ' (' + dur.toFixed(1) + ' שניות, ' + v.videoWidth + 'x' + v.videoHeight + '). הנה ' + times.length + ' פריימים לפי הסדר:\n' + lines + '\nתנתח ותבנה תוכנית עריכה + כתוביות.', { show: '🎞️ ' + f.name + ' · ' + dur.toFixed(1) + ' שנ׳', imgs: thumbs.slice(0, 6), apiImgs: shots });
          return;
        }
        v.currentTime = times[j];
        v.onseeked = function () { ctx.drawImage(v, 0, 0, cv.width, cv.height); var u = cv.toDataURL('image/jpeg', 0.72); shots.push(u.split(',')[1]); thumbs.push(u); grab(j + 1); };
      })(0);
    });
    v.addEventListener('error', function () { toast('לא הצלחתי לקרוא את הסרטון בדפדפן הזה'); });
  }

  // folder organizer — File System Access API (Chrome / Edge on desktop)
  function pickDir() {
    if (!window.showDirectoryPicker) { toast('סידור קבצים עובד ב-Chrome או Edge במחשב'); return; }
    if (S.busy) return;
    window.showDirectoryPicker({ mode: 'readwrite' }).then(function (dir) {
      S.dir = dir; renderTools(); toast('סורק את התיקייה…');
      var list = [];
      return walk(dir, '', 0, list).then(function () {
        S.dirFiles = list;
        var txt = list.slice(0, 1500).map(function (x) { return x.path + ' | ' + kb(x.size) + ' | ' + new Date(x.mod).toISOString().slice(0, 10); }).join('\n');
        send('בחרתי את התיקייה "' + dir.name + '" (' + list.length + ' קבצים' + (list.length > 1500 ? ', מוצגים 1500 הראשונים' : '') + '). הנה הרשימה (נתיב | גודל | תאריך שינוי):\n' + txt + '\n\nתסדר לפי הבקשה שלי: ' + P().idea, { show: '📁 ' + dir.name + ' · ' + list.length + ' קבצים' });
      });
    }).catch(function (e) { if (e && e.name !== 'AbortError') toast('לא הצלחתי לפתוח את התיקייה'); });
  }
  function kb(n) { return n > 1048576 ? (n / 1048576).toFixed(1) + 'MB' : Math.round(n / 1024) + 'KB'; }
  function walk(dir, base, depth, list) {
    if (depth > 4 || list.length > 3000) return Promise.resolve();
    var it = dir.values(), jobs = [];
    function step() {
      return it.next().then(function (r) {
        if (r.done) return Promise.all(jobs);
        var h = r.value, path = base + h.name;
        if (h.name[0] === '.') return step();
        if (h.kind === 'file') jobs.push(h.getFile().then(function (f) { list.push({ path: path, size: f.size, mod: f.lastModified }); }).catch(function () {}));
        else jobs.push(walk(h, path + '/', depth + 1, list));
        return step();
      });
    }
    return step();
  }
  function planHtml(json) {
    var plan; try { plan = JSON.parse(json); } catch (e) { return '<p class="muted">לא הצלחתי לקרוא את התוכנית.</p>'; }
    var mv = (plan.moves || []).filter(function (m) { return m && m.from && m.to && m.from !== m.to; });
    if (!mv.length) return '<p class="muted">אין מה להעביר — הכול כבר מסודר.</p>';
    return '<p><b>' + mv.length + ' העברות מתוכננות</b></p><ul>' + mv.slice(0, 8).map(function (m) { return '<li dir="ltr" style="text-align:start"><code>' + esc(m.from) + '</code> → <code>' + esc(m.to) + '</code></li>'; }).join('') + (mv.length > 8 ? '<li>ועוד ' + (mv.length - 8) + '…</li>' : '') + '</ul>' +
      '<button class="btn primary sm" type="button" data-run-plan="1">✓ בצע סידור</button> <span class="muted" style="font-size:.8rem">רק העברות, בלי מחיקות</span>';
  }
  function safeRel(p) { p = String(p).replace(/\\/g, '/').replace(/^\/+/, ''); return p.split('/').every(function (s) { return s && s !== '.' && s !== '..'; }) ? p : null; }
  function getDir(root, parts, create) { return parts.reduce(function (pr, name) { return pr.then(function (h) { return h.getDirectoryHandle(name, { create: create }); }); }, Promise.resolve(root)); }
  function runPlan() {
    var p = P(); if (!S.dir) { toast('בחרו שוב את התיקייה ואז בצעו'); return; }
    var plan; try { plan = JSON.parse(p.files['plan.json']); } catch (e) { return; }
    var mv = (plan.moves || []).map(function (m) { return { from: safeRel(m.from), to: safeRel(m.to) }; }).filter(function (m) { return m.from && m.to && m.from !== m.to; });
    if (!confirm('להעביר ' + mv.length + ' קבצים בתוך "' + S.dir.name + '"? שום קובץ לא יימחק.')) return;
    var ok = 0, bad = [];
    S.dir.requestPermission({ mode: 'readwrite' }).then(function (perm) {
      if (perm !== 'granted') throw new Error('perm');
      return mv.reduce(function (pr, m) {
        return pr.then(function () {
          var fp = m.from.split('/'), tp = m.to.split('/'), fname = fp.pop(), tname = tp.pop();
          return getDir(S.dir, fp, false).then(function (srcDir) {
            return srcDir.getFileHandle(fname).then(function (src) {
              return getDir(S.dir, tp, true).then(function (dstDir) {
                return dstDir.getFileHandle(tname, { create: false }).then(function () { throw new Error('exists'); }, function (e) { if (e.message === 'exists') throw e; return null; })
                  .then(function () {
                    if (src.move) return src.move(dstDir, tname); // native move where supported
                    return src.getFile().then(function (f) { return dstDir.getFileHandle(tname, { create: true }).then(function (dst) { return dst.createWritable().then(function (w) { return w.write(f).then(function () { return w.close(); }); }); }).then(function () { return srcDir.removeEntry(fname); }); });
                  });
              });
            });
          }).then(function () { ok++; }, function (e) { bad.push(m.from + (e && e.message === 'exists' ? ' (כבר קיים קובץ באותו שם ביעד)' : '')); });
        });
      }, Promise.resolve());
    }).then(function () {
      p.msgs.push({ role: 'assistant', text: '✓ הועברו ' + ok + ' קבצים.' + (bad.length ? '\nלא הועברו ' + bad.length + ':\n' + bad.slice(0, 10).map(function (b) { return '- ' + b; }).join('\n') : '') });
      saveProjects(); renderMsgs();
    }).catch(function () { toast('צריך לאשר גישת כתיבה לתיקייה'); });
  }

  /* ================= SKILL SEARCH ================= */
  var GH = 'https://api.github.com';
  function gh(path) {
    var h = { Accept: 'application/vnd.github+json' }; if (S.user && S.user.ghToken) h.Authorization = 'Bearer ' + S.user.ghToken;
    return fetch(GH + path, { headers: h }).then(function (r) { if (r.status === 401 && S.user.ghToken) { S.user.ghToken = ''; LS.set('user', S.user); } if (!r.ok) { var e = new Error('gh ' + r.status); e.status = r.status; throw e; } return r.json(); });
  }
  function kindOf(r) { var s = ((r.name || '') + ' ' + (r.description || '') + ' ' + (r.topics || []).join(' ')).toLowerCase(); return /mcp|model.?context/.test(s) ? 'mcp' : /skill/.test(s) ? 'skill' : /plugin|extension/.test(s) ? 'plugin' : 'repo'; }
  function repoItem(r, extra) { return Object.assign({ id: 'gh:' + r.full_name, name: r.full_name, url: r.html_url, desc: r.description || '', stars: r.stargazers_count || 0, kind: kindOf(r), repo: r.full_name, branch: r.default_branch || 'HEAD' }, extra || {}); }
  var PINNED = [
    { id: 'gh:anthropics/skills', name: 'anthropics/skills', url: 'https://github.com/anthropics/skills', desc: 'הסקילים הרשמיים של Anthropic (מסמכים, מצגות, עיצוב ועוד)', kind: 'skill', official: true, repo: 'anthropics/skills', branch: 'main' },
    { id: 'gh:modelcontextprotocol/servers', name: 'modelcontextprotocol/servers', url: 'https://github.com/modelcontextprotocol/servers', desc: 'שרתי MCP רשמיים ודוגמאות', kind: 'mcp', official: true, repo: 'modelcontextprotocol/servers', branch: 'main' }
  ];
  function startSkillSearch() {
    var p = P(); p.found = { mine: null, github: null, tiktok: null, instagram: null }; renderSkills();
    var k = cat(p.cat);
    var kw = helper({ max_tokens: 200, messages: [{ role: 'user', content: 'Idea (may be Hebrew): "' + p.idea + '". Category: ' + k.en + '.\nReturn ONLY JSON: {"en":"2-4 short English search keywords for GitHub"}' }] })
      .then(function (j) { var o = jsonFrom(textOf(j)); return (o && o.en) || k.en; }).catch(function () { return k.en; });
    kw.then(function (en) {
      p.kw = en;
      searchMine(p, en); searchGithub(p, en);
      searchSocial(p, 'tiktok', en); searchSocial(p, 'instagram', en);
    });
  }
  function socialLinks(p, src) { // without an API key: direct search links in the app itself
    var q = encodeURIComponent(p.idea.slice(0, 80)), k = cat(p.cat), qe = encodeURIComponent(k.en + ' ai');
    var list = src === 'tiktok'
      ? [{ id: 'tt1', name: 'חיפוש ב-TikTok: ' + p.idea.slice(0, 40), url: 'https://www.tiktok.com/search?q=' + q, desc: 'סרטונים על הרעיון שלך', kind: 'tiktok', idea: true }, { id: 'tt2', name: 'טיפים ל-' + k.t + ' עם AI', url: 'https://www.tiktok.com/search?q=' + qe, desc: 'מדריכים קצרים', kind: 'tiktok', idea: true }, { id: 'tt3', name: 'Claude skills', url: 'https://www.tiktok.com/search?q=' + encodeURIComponent('claude skills'), desc: 'איך אחרים משתמשים בסקילים', kind: 'tiktok', idea: true }]
      : [{ id: 'ig1', name: 'חיפוש באינסטגרם: ' + p.idea.slice(0, 40), url: 'https://www.instagram.com/explore/search/keyword/?q=' + q, desc: 'פוסטים ורילס על הרעיון', kind: 'instagram', idea: true }, { id: 'ig2', name: k.t + ' — השראה', url: 'https://www.instagram.com/explore/search/keyword/?q=' + qe, desc: 'עיצובים ורעיונות', kind: 'instagram', idea: true }];
    done(p, src, list);
  }
  function done(p, src, list) { p.found[src] = list; saveProjects(); if (P() === p) renderSkills(); }
  function searchMine(p, en) {
    var u = S.user || {};
    if (!u.ghLogin) return done(p, 'mine', { empty: 'התחברו עם GitHub (או הוסיפו שם משתמש ב-GitHub בכניסה) כדי לחפש בריפוזיטורים שלכם.' });
    var words = en.toLowerCase().split(/\s+/).filter(function (w) { return w.length > 2; });
    var jobs = [gh('/users/' + encodeURIComponent(u.ghLogin) + '/repos?per_page=100&sort=updated').then(function (rs) {
      return rs.map(function (r) {
        var s = ((r.name || '') + ' ' + (r.description || '') + ' ' + (r.topics || []).join(' ')).toLowerCase(), score = 0;
        if (/skill|mcp|claude|plugin|agent|prompt/.test(s)) score += 5;
        words.forEach(function (w) { if (s.indexOf(w) > -1) score += 2; });
        return repoItem(r, { score: score });
      });
    })];
    if (u.ghToken) jobs.push(gh('/search/code?q=' + encodeURIComponent('filename:SKILL.md user:' + u.ghLogin) + '&per_page=30').then(function (j) {
      return (j.items || []).map(function (it) { var dir = it.path.replace(/\/?SKILL\.md$/i, ''); return { id: 'sk:' + it.repository.full_name + '/' + it.path, name: it.repository.name + (dir ? '/' + dir : ''), url: it.html_url, desc: 'SKILL.md', kind: 'skill', repo: it.repository.full_name, path: it.path, branch: 'HEAD', score: 20 }; });
    }).catch(function () { return []; }));
    Promise.all(jobs).then(function (rs) {
      var all = [].concat.apply([], rs).sort(function (a, b) { return b.score - a.score || b.stars - a.stars; });
      var top = all.filter(function (x) { return x.score > 0; }); if (top.length < 6) top = all.slice(0, 12);
      done(p, 'mine', top.length ? top.slice(0, 25) : { empty: 'לא מצאתי ריפוזיטורים ציבוריים ב-@' + u.ghLogin + '.' });
    }).catch(function (e) { done(p, 'mine', { empty: e.status === 404 ? 'המשתמש @' + u.ghLogin + ' לא נמצא ב-GitHub.' : e.status === 403 ? 'GitHub הגביל זמנית את החיפוש. נסו עוד דקה.' : 'החיפוש ב-GitHub נכשל.' }); });
  }
  function searchGithub(p, en) {
    var q1 = en + ' claude skill', q2 = en + ' mcp server';
    Promise.all([q1, q2].map(function (q) { return gh('/search/repositories?q=' + encodeURIComponent(q) + '&sort=stars&order=desc&per_page=8').then(function (j) { return (j.items || []).map(function (r) { return repoItem(r); }); }).catch(function () { return []; }); }))
      .then(function (rs) {
        var seen = {}, list = PINNED.concat(rs[0], rs[1]).filter(function (x) { if (seen[x.id]) return false; seen[x.id] = 1; return true; });
        if (list.length <= PINNED.length) return gh('/search/repositories?q=' + encodeURIComponent((en.split(' ')[0] || 'claude') + ' mcp OR skill') + '&sort=stars&per_page=10').then(function (j) { return PINNED.concat((j.items || []).map(function (r) { return repoItem(r); })); }).catch(function () { return list; });
        return list;
      }).then(function (list) { done(p, 'github', list); });
  }
  function searchSocial(p, src, en) {
    var dom = src === 'tiktok' ? 'tiktok.com' : 'instagram.com';
    helper({ max_tokens: 1500, tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3, allowed_domains: [dom] }],
      messages: [{ role: 'user', content: 'Find 5 ' + (src === 'tiktok' ? 'TikTok videos' : 'Instagram posts/reels or accounts') + ' with tips, tutorials or inspiration for building this (AI tools, Claude skills, prompts, design ideas): "' + p.idea + '" (keywords: ' + en + '). Reply ONLY with JSON array: [{"title":"short Hebrew title","url":"https://...","why":"one short Hebrew line why it helps"}]. Only URLs you actually found.' }] })
      .then(function (j) {
        var arr = jsonFrom(textOf(j)); if (!Array.isArray(arr)) arr = [];
        var list = arr.filter(function (x) { return x && /^https:\/\/(www\.|m\.|vm\.)?(tiktok|instagram)\.com\//.test(x.url || ''); }).slice(0, 8)
          .map(function (x, i) { return { id: src + i + ':' + x.url, name: x.title || x.url, url: x.url, desc: x.why || '', kind: src, idea: true }; });
        done(p, src, list.length ? list : { empty: 'לא נמצאו תוצאות ב-' + (src === 'tiktok' ? 'TikTok' : 'Instagram') + ' לרעיון הזה.' });
      }).catch(function (e) { done(p, src, { empty: e.status === 400 ? 'החיפוש ברשת לא זמין בחשבון ה-API הזה.' : apiErr(e) }); });
  }
  $('srcTabs').addEventListener('click', function (e) { var b = e.target.closest('[data-src]'); if (!b) return; S.src = b.dataset.src; renderSkills(); });
  var KIND = { skill: 'סקיל', mcp: 'MCP', plugin: 'פלאגין', repo: 'ריפו', tiktok: 'TikTok', instagram: 'Instagram' };
  function renderSkills() {
    var p = P(); if (!p) return;
    d.querySelectorAll('#srcTabs [data-src]').forEach(function (b) { var n = p.found && Array.isArray(p.found[b.dataset.src]) ? p.found[b.dataset.src].length : 0; b.setAttribute('aria-selected', String(b.dataset.src === S.src)); b.dataset.n = n; });
    var list = p.found ? p.found[S.src] : undefined, el = $('sres');
    if (list === undefined) { el.innerHTML = '<div class="sk"><p>החיפוש מתחיל כשפותחים פרויקט חדש.</p><button class="btn ghost sm" type="button" id="reSearch">🔎 חפש עכשיו</button></div>'; }
    else if (list === null) el.innerHTML = '<div class="loading"><div class="skel"></div><div class="skel"></div><div class="skel"></div></div>';
    else if (list.empty) el.innerHTML = '<div class="sk"><p>' + esc(list.empty) + '</p></div>';
    else el.innerHTML = list.map(function (x) {
      var used = (p.skills || []).some(function (s) { return s.id === x.id; });
      return '<div class="sk"><div class="top">' + (x.idea ? '' : '<button type="button" class="use" data-use="' + esc(x.id) + '" aria-pressed="' + used + '" aria-label="' + (used ? 'הסרה מהבנייה' : 'שימוש בבנייה') + '">' + (used ? '✓' : '') + '</button>') +
        '<a href="' + esc(x.url) + '" target="_blank" rel="noopener noreferrer">' + esc(x.name) + '</a></div>' + (x.desc ? '<p>' + esc(x.desc) + '</p>' : '') +
        '<div class="meta"><span class="tag">' + (x.official ? 'רשמי · ' : '') + esc(KIND[x.kind] || x.kind) + '</span>' + (x.stars ? '<span>★ ' + x.stars.toLocaleString('he-IL') + '</span>' : '') + (x.kind === 'mcp' ? '<button class="link" type="button" data-addmcp="' + esc(x.name) + '" style="padding:0">+ הוספה כשרת MCP</button>' : '') + '</div></div>';
    }).join('') + '<button class="btn ghost sm" type="button" id="reSearch">↻ חיפוש מחדש</button>';
    var used = (p.skills || []).length;
    $('skillHint').textContent = used ? '✓ ' + used + ' סקילים בשימוש — Claude עוקב אחריהם בבנייה.' : 'סמנו סקילים ב-✓ — Claude ישתמש בהם בבנייה.';
  }
  $('sres').addEventListener('click', function (e) {
    if (e.target.closest('#reSearch')) { startSkillSearch(); return; }
    var lk = e.target.closest('.sk .top a');
    if (lk) { var L = P().found[S.src], hit = (Array.isArray(L) ? L : []).filter(function (x) { return x.url === lk.getAttribute('href'); })[0]; if (hit) { e.preventDefault(); openViewer(hit); } return; }
    var a = e.target.closest('[data-addmcp]'); if (a) { openSettings(); $('mcpName').value = a.dataset.addmcp.split('/').pop().replace(/[^a-z0-9_-]/gi, '').slice(0, 30); $('mcpUrl').focus(); toast('הדביקו את כתובת השרת (https) מה-README של הריפו'); return; }
    var b = e.target.closest('[data-use]'); if (!b) return;
    var p = P(), id = b.dataset.use, list = p.found[S.src], it = (Array.isArray(list) ? list : []).filter(function (x) { return x.id === id; })[0];
    var i = -1; (p.skills || []).forEach(function (s, k) { if (s.id === id) i = k; });
    if (i > -1) { p.skills.splice(i, 1); saveProjects(); renderSkills(); return; }
    if (!it) return;
    if ((p.skills || []).length >= 4) { toast('עד 4 סקילים בכל פרויקט'); return; }
    b.disabled = true; b.textContent = '…';
    loadSkillText(it).then(function (t) { p.skills = (p.skills || []).concat([{ id: it.id, name: it.name, url: it.url, kind: it.kind, text: t }]); saveProjects(); renderSkills(); toast(t ? 'הסקיל נטען ✓ — יופעל בהודעה הבאה' : 'נוסף, אבל לא מצאתי הוראות בריפו'); });
  });
  /* ---------- in-app viewer: TikTok / Instagram embeds, GitHub README ---------- */
  function embedUrl(u) {
    var m = u.match(/tiktok\.com\/@[^/]+\/video\/(\d+)/); if (m) return { src: 'https://www.tiktok.com/embed/v2/' + m[1], tall: true };
    m = u.match(/instagram\.com\/(p|reel|tv)\/([\w-]+)/); if (m) return { src: 'https://www.instagram.com/' + m[1] + '/' + m[2] + '/embed/captioned/', tall: true };
    return null;
  }
  function openViewer(it) {
    var v = $('viewer'), b = $('vBody'); $('vH').textContent = it.name;
    var used = (P().skills || []).some(function (x) { return x.id === it.id; });
    var useBtn = it.idea ? '' : '<button class="btn ' + (used ? 'ghost' : 'primary') + ' sm" type="button" id="vUse">' + (used ? '✓ בשימוש בבנייה' : '✓ השתמש בבנייה') + '</button>';
    var ext = '<a class="link" href="' + esc(it.url) + '" target="_blank" rel="noopener noreferrer">פתיחה באתר המקורי ↗</a>';
    if (it.kind === 'tiktok' || it.kind === 'instagram') {
      var em = embedUrl(it.url);
      b.innerHTML = (it.desc ? '<p class="muted">' + esc(it.desc) + '</p>' : '') + (em ? '<div class="embed"><iframe src="' + esc(em.src) + '" title="' + esc(it.name) + '" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>' : '<p class="muted">את הקישור הזה אי אפשר להציג בתוך האפליקציה.</p>') + '<div class="vrow">' + ext + '</div>';
    } else {
      b.innerHTML = '<p class="muted">' + esc(it.desc || '') + (it.stars ? ' · ★ ' + it.stars.toLocaleString('he-IL') : '') + '</p><div class="vrow">' + useBtn + ext + '</div><div class="readme"><div class="loading"><div class="skel"></div><div class="skel"></div></div></div>';
      loadSkillText(it, 20000).then(function (t) { var r = b.querySelector('.readme'); if (r) r.innerHTML = t ? '<div class="m ai" style="max-width:100%">' + md(t.replace(/^---[\s\S]*?---\n/, '')) + '</div>' : '<p class="muted">לא נמצא README בריפו הזה.</p>'; });
    }
    var ub = $('vUse'); if (ub) ub.onclick = function () { v.close(); var btn = $('sres').querySelector('[data-use="' + (window.CSS && CSS.escape ? CSS.escape(it.id) : it.id) + '"]'); if (btn) btn.click(); };
    if (!v.open) v.showModal();
  }
  $('vClose').onclick = function () { $('viewer').close(); };
  $('viewer').addEventListener('close', function () { $('vBody').innerHTML = ''; });
  function loadSkillText(it, max) {
    max = max || 6000;
    var cands = it.path ? [it.path] : ['SKILL.md', 'README.md', 'readme.md'];
    var br = it.branch || 'HEAD';
    return cands.reduce(function (pr, f) { return pr.then(function (got) { if (got) return got; return fetch('https://raw.githubusercontent.com/' + it.repo + '/' + br + '/' + f).then(function (r) { return r.ok ? r.text() : ''; }).catch(function () { return ''; }); }); }, Promise.resolve(''))
      .then(function (t) { return t ? t.slice(0, max) + (t.length > max ? '\n…(קוצר)' : '') : ''; });
  }

  /* ================= SETTINGS ================= */
  function openSettings() {
    $('keyMask').textContent = S.key ? 'מפתח משלך: ' + S.key.slice(0, 10) + '…' + S.key.slice(-4) : 'Claude של הסטודיו' + (S.left != null ? ' · נשארו ' + S.left + ' הודעות היום' : '');
    $('changeKey').textContent = S.key ? 'הסרת המפתח שלי' : 'מפתח Claude משלי (בלי הגבלה)';
    $('modelSet').innerHTML = $('modelIn').innerHTML; $('modelSet').value = S.model;
    $('acctTxt').textContent = (S.user && S.user.name || '') + (S.user && S.user.ghLogin ? ' · @' + S.user.ghLogin + (S.user.ghToken ? ' (GitHub מחובר)' : '') : '');
    renderMcp();
    if (!$('settings').open) $('settings').showModal();
  }
  function renderMcp() {
    $('mcpList').innerHTML = S.mcp.length ? S.mcp.map(function (x, i) { return '<div class="mcpi"><input type="checkbox" data-mcpon="' + i + '" ' + (x.on !== false ? 'checked' : '') + ' aria-label="הפעלה"><b>' + esc(x.name) + '</b><span>' + esc(x.url) + '</span><button class="icon" type="button" data-mcpdel="' + i + '" aria-label="מחיקה" style="width:30px;height:30px">✕</button></div>'; }).join('') : '<p class="muted">אין שרתים עדיין.</p>';
  }
  $('modelSet').onchange = function () { S.model = this.value; LS.set('model', S.model); toast('המודל עודכן'); };
  $('changeKey').onclick = function () { $('settings').close(); if (S.key) { S.key = ''; LS.set('key', null); toast('חזרת ל-Claude של הסטודיו'); return; } $('modelIn').value = S.model; show('scKey'); };
  $('logoutBtn').onclick = function () { if (!confirm('לצאת? המפתח והחיבור ל-GitHub יימחקו מהמכשיר הזה (הפרויקטים נשארים).')) return; $('settings').close(); S.user = null; S.key = ''; LS.set('user', null); LS.set('key', null); next(); };
  $('reinstall').onclick = function () { $('settings').close(); LS.set('skipInstall', false); show('scInstall'); };
  $('mcpAdd').onclick = function () {
    var n = $('mcpName').value.trim().replace(/[^A-Za-z0-9_-]/g, ''), u = $('mcpUrl').value.trim(), t = $('mcpTok').value.trim();
    if (!n) { toast('תנו שם באנגלית'); return; }
    if (!/^https:\/\//.test(u)) { toast('כתובת השרת חייבת להתחיל ב-https://'); return; }
    if (S.mcp.some(function (x) { return x.name === n; })) { toast('כבר יש שרת בשם הזה'); return; }
    S.mcp.push({ name: n, url: u, token: t, on: true }); LS.set('mcp', S.mcp); $('mcpName').value = $('mcpUrl').value = $('mcpTok').value = ''; renderMcp(); toast('השרת נוסף ✓');
  };
  $('mcpList').addEventListener('click', function (e) {
    var del = e.target.closest('[data-mcpdel]'); if (del) { S.mcp.splice(+del.dataset.mcpdel, 1); LS.set('mcp', S.mcp); renderMcp(); return; }
    var on = e.target.closest('[data-mcpon]'); if (on) { S.mcp[+on.dataset.mcpon].on = on.checked; LS.set('mcp', S.mcp); }
  });
  $('settings').addEventListener('close', function () { if (S.cur) $('mcpBadge').textContent = S.mcp.filter(function (x) { return x.on !== false; }).length ? '· MCP ' + S.mcp.filter(function (x) { return x.on !== false; }).length : ''; });

  next();
})();
