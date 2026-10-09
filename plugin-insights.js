/* TAZMIN plugin — "מי זה": Instagram stats + business research, inside the admin client view.
   Loaded by portal.html; registers itself on window.TZ_PLUGINS. Talks to /api/insights. */
(function () {
  'use strict';
  var cache = {};   // client id -> { instagram, ins, config, busy }
  var TYPE = { reel: 'רילס', video: 'וידאו', carousel: 'קרוסלה', image: 'תמונה' };
  var css = document.createElement('style');
  css.textContent =
    '.pl{margin-bottom:16px;border-color:rgba(232,176,75,.45)}' +
    '.pl .plh{display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:space-between}' +
    '.pl .tagp{font-size:.7rem;letter-spacing:.12em;color:var(--a);border:1px solid var(--a);border-radius:999px;padding:2px 9px;direction:ltr}' +
    '.pl .cols{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px;margin-top:12px}' +
    '@media (max-width:1100px){.pl .cols{grid-template-columns:1fr}}' +
    '.pl .box{border:1px solid var(--line);border-radius:16px;padding:14px;background:rgba(255,255,255,.02);min-width:0}' +
    '.pl h3{margin:0 0 10px;font-size:1rem;display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap}' +
    '.pl .row{display:flex;gap:8px;flex-wrap:wrap}.pl .row .in{flex:1 1 160px}' +
    '.pl .kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:12px}' +
    '@media (max-width:560px){.pl .kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}' +
    '.pl .kpi{border:1px solid var(--line);border-radius:12px;padding:8px 10px}.pl .kpi span{font-size:.75rem;color:var(--muted);display:block}.pl .kpi b{font-size:1.15rem;font-variant-numeric:tabular-nums}' +
    '.pl .prof{display:flex;gap:12px;align-items:center;margin-top:12px}.pl .prof img{width:52px;height:52px;border-radius:50%;object-fit:cover;border:2px solid var(--a)}' +
    '.pl table{width:100%;border-collapse:collapse;margin-top:12px;font-size:.88rem}.pl th,.pl td{text-align:start;padding:6px 4px;border-bottom:1px solid var(--line)}.pl th{color:var(--muted);font-weight:500}' +
    '.pl .posts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:12px}' +
    '.pl .post{position:relative;display:block;aspect-ratio:1;border-radius:12px;overflow:hidden;border:1px solid var(--line);background:#111;color:var(--ink);text-decoration:none}' +
    '.pl .post img{width:100%;height:100%;object-fit:cover;display:block}' +
    '.pl .post .ov{position:absolute;inset:auto 0 0 0;padding:6px 8px;background:linear-gradient(transparent,rgba(0,0,0,.85));font-size:.75rem;font-variant-numeric:tabular-nums}' +
    '.pl .post .nt{position:absolute;inset:0;padding:8px;font-size:.75rem;color:var(--muted);overflow:hidden}' +
    '.pl .rep h4{margin:14px 0 6px;color:var(--a);font-size:.95rem}.pl .rep h4:first-child{margin-top:0}.pl .rep p{margin:2px 0}' +
    '.pl .rep ul{margin:0;padding-inline-start:18px}.pl .src{font-size:.8rem;margin-top:12px;border-top:1px dashed var(--line);padding-top:8px}.pl .src a{word-break:break-all}' +
    '.pl .hint{font-size:.85rem;color:var(--muted);border:1px dashed var(--line);border-radius:12px;padding:10px;margin-top:10px}' +
    '.pl .spin{display:inline-block;width:14px;height:14px;border:2px solid currentColor;border-inline-end-color:transparent;border-radius:50%;animation:plsp .8s linear infinite;vertical-align:-2px}' +
    '@keyframes plsp{to{transform:rotate(360deg)}}@media (prefers-reduced-motion:reduce){.pl .spin{animation:none}}';
  document.head.appendChild(css);

  function call(T, a, id, body) {
    return T.api('', { path: '/api/insights', q: '?a=' + a + '&id=' + encodeURIComponent(id), body: body });
  }
  function num(n) { return (+n || 0).toLocaleString('he-IL'); }
  function ago(t) { var m = Math.round((Date.now() - t) / 60000); if (m < 1) return 'עכשיו'; if (m < 60) return 'לפני ' + m + ' דק׳'; var h = Math.round(m / 60); if (h < 24) return 'לפני ' + h + ' שע׳'; return 'לפני ' + Math.round(h / 24) + ' ימים'; }
  function errText(e) {
    var m = String(e && e.message || '');
    if (m === 'ig_not_configured') return 'עוד לא חיברת את אינסטגרם (IG_ACCESS_TOKEN + IG_USER_ID ב-Vercel).';
    if (m === 'ig_token_expired') return 'הטוקן של אינסטגרם פג תוקף — צריך ליצור חדש.';
    if (m === 'ig_not_business') return 'החשבון לא נמצא, או שהוא חשבון פרטי/אישי. נתונים זמינים רק לחשבון עסקי או יוצר תוכן.';
    if (m === 'ai_not_configured') return 'עוד לא הוגדר ANTHROPIC_API_KEY ב-Vercel.';
    if (m === 'bad_handle') return 'שם המשתמש לא תקין.';
    if (m === 'no_handle') return 'קודם שמור את שם המשתמש באינסטגרם.';
    if (/^(ig|ai)_error/.test(m)) return 'שגיאה: ' + m.replace(/^(ig|ai)_error:\s*/, '');
    return 'משהו השתבש. נסו שוב.';
  }

  function report(text, esc) {
    var h = '', inList = false;
    String(text || '').split(/\n/).forEach(function (l) {
      l = l.trim(); if (!l) return;
      if (/^#{1,4}\s/.test(l)) { if (inList) { h += '</ul>'; inList = false; } h += '<h4>' + esc(l.replace(/^#+\s*/, '')) + '</h4>'; return; }
      var t = esc(l.replace(/^[-*•]\s*/, '')).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
      if (/^[-*•]\s/.test(l)) { if (!inList) { h += '<ul>'; inList = true; } h += '<li>' + t + '</li>'; }
      else { if (inList) { h += '</ul>'; inList = false; } h += '<p>' + t + '</p>'; }
    });
    return h + (inList ? '</ul>' : '');
  }

  function igBox(st, T) {
    var esc = T.esc, ig = st.ins && st.ins.ig, h = st.instagram;
    var x = '<div class="box"><h3><span>📸 אינסטגרם</span>' + (ig ? '<span class="muted" style="font-weight:400;font-size:.8rem">עודכן ' + ago(ig.t) + '</span>' : '') + '</h3>' +
      '<div class="row"><label class="sr" for="plIg">שם משתמש באינסטגרם</label><input class="in" id="plIg" dir="ltr" placeholder="@username או קישור לפרופיל" value="' + esc(st.draft != null ? st.draft : (h ? '@' + h : '')) + '">' +
      '<button class="btn sm" type="button" data-pl="setig">שמירה</button>' +
      (h ? '<a class="btn ghost sm" href="https://www.instagram.com/' + esc(h) + '/" target="_blank" rel="noopener">כניסה לאינסטגרם ↗</a>' : '') + '</div>';
    if (h) x += '<div class="row" style="margin-top:8px"><button class="btn sm" type="button" data-pl="ig"' + (st.busy === 'ig' ? ' disabled' : '') + '>' + (st.busy === 'ig' ? '<span class="spin"></span> מושך נתונים…' : (ig ? '↻ רענון נתונים' : '📊 משוך נתונים על הסרטונים')) + '</button></div>';
    if (st.config && !st.config.ig) x += '<div class="hint">כדי למשוך נתונים צריך לחבר פעם אחת את חשבון האינסטגרם העסקי של TAZMIN (ראו README). עד אז אפשר להיכנס לפרופיל עם הכפתור.</div>';
    if (st.igErr) x += '<p class="err" role="alert">' + esc(st.igErr) + '</p>';
    if (ig) {
      x += '<div class="prof">' + (ig.pic ? '<img src="' + esc(ig.pic) + '" alt="" referrerpolicy="no-referrer">' : '') + '<div><b dir="ltr">@' + esc(ig.username) + '</b>' + (ig.name ? ' · ' + esc(ig.name) : '') +
        (ig.bio ? '<div class="muted" style="font-size:.85rem;white-space:pre-line">' + esc(ig.bio) + '</div>' : '') + '</div></div>' +
        '<div class="kpis">' +
        '<div class="kpi"><span>עוקבים</span><b>' + num(ig.followers) + '</b></div>' +
        '<div class="kpi"><span>פוסטים</span><b>' + num(ig.posts) + '</b></div>' +
        '<div class="kpi"><span>ממוצע לייקים</span><b>' + num(ig.avgLikes) + '</b></div>' +
        '<div class="kpi"><span>ממוצע תגובות</span><b>' + num(ig.avgComments) + '</b></div>' +
        '<div class="kpi"><span>מעורבות</span><b>' + ig.er + '%</b></div>' +
        '<div class="kpi"><span>פוסטים בשבוע</span><b>' + ig.perWeek + '</b></div>' +
        '<div class="kpi"><span>פוסט אחרון</span><b>' + (ig.lastPostDays == null ? '—' : ig.lastPostDays === 0 ? 'היום' : 'לפני ' + ig.lastPostDays + ' ימ׳') + '</b></div>' +
        '<div class="kpi"><span>הכי טוב לפרסם</span><b style="font-size:.9rem">' + esc(ig.bestDay ? 'יום ' + ig.bestDay : '—') + '<br><span dir="ltr">' + esc(ig.bestHours) + '</span></b></div></div>';
      if (ig.types && ig.types.length) x += '<table><thead><tr><th>סוג</th><th>כמות</th><th>לייקים</th><th>תגובות</th><th>מעורבות</th></tr></thead><tbody>' +
        ig.types.map(function (t) { return '<tr><td>' + esc(TYPE[t.type] || t.type) + '</td><td>' + t.count + '</td><td>' + num(t.avgLikes) + '</td><td>' + num(t.avgComments) + '</td><td>' + t.er + '%</td></tr>'; }).join('') + '</tbody></table>';
      if (ig.top && ig.top.length) x += '<h3 style="margin-top:14px">🔥 הסרטונים והפוסטים הכי חזקים</h3><div class="posts">' + ig.top.map(function (p) {
        return '<a class="post" href="' + esc(p.url) + '" target="_blank" rel="noopener" title="' + esc(p.caption) + '">' + (p.thumb ? '<img src="' + esc(p.thumb) + '" alt="' + esc(p.caption.slice(0, 80)) + '" loading="lazy" referrerpolicy="no-referrer">' : '<span class="nt">' + esc(p.caption.slice(0, 120)) + '</span>') +
          '<span class="ov">' + (TYPE[p.type] || '') + ' · ♥ ' + num(p.likes) + ' · 💬 ' + num(p.comments) + '</span></a>';
      }).join('') + '</div><p class="muted" style="font-size:.78rem;margin:6px 0 0">מבוסס על ' + ig.sample + ' הפוסטים האחרונים. צפיות בסרטונים אינסטגרם חושפת רק לבעל החשבון עצמו.</p>';
    }
    return x + '</div>';
  }

  function whoBox(st, T) {
    var esc = T.esc, w = st.ins && st.ins.who;
    var x = '<div class="box"><h3><span>🔎 מי זה?</span>' + (w ? '<span class="muted" style="font-weight:400;font-size:.8rem">עודכן ' + ago(w.t) + '</span>' : '') + '</h3>' +
      '<p class="muted" style="margin:0 0 8px;font-size:.85rem">מחפש ברשת את העסק: אתר, גוגל וביקורות, עמודים עסקיים, מתחרים — ומשלב עם נתוני האינסטגרם, השאלון והצ׳אט שלכם. מידע פרטי על אנשים לא נאסף.</p>' +
      '<button class="btn sm" type="button" data-pl="who"' + (st.busy === 'who' ? ' disabled' : '') + '>' + (st.busy === 'who' ? '<span class="spin"></span> מחפש ברשת… (עד דקה)' : (w ? '↻ חיפוש מחדש' : '🔎 תתחיל — מי זה?')) + '</button>';
    if (st.config && !st.config.ai) x += '<div class="hint">צריך להגדיר ANTHROPIC_API_KEY ב-Vercel כדי שהחיפוש יעבוד.</div>';
    if (st.whoErr) x += '<p class="err" role="alert">' + esc(st.whoErr) + '</p>';
    if (w && w.text) {
      x += '<div class="rep" style="margin-top:12px">' + report(w.text, esc) + '</div>';
      if (w.sources && w.sources.length) x += '<div class="src"><b>מקורות:</b><ol style="margin:4px 0 0;padding-inline-start:18px">' + w.sources.map(function (s) { return '<li><a href="' + esc(s.url) + '" target="_blank" rel="noopener noreferrer">' + esc(s.title || s.url) + '</a></li>'; }).join('') + '</ol></div>';
    }
    return x + '</div>';
  }

  function paint(slot, c, T) {
    var st = cache[c.id], wasFocus = document.activeElement && document.activeElement.id === 'plIg';
    if (!st) { slot.innerHTML = '<section class="card pl"><span class="muted"><span class="spin"></span> טוען פלאגין…</span></section>'; return; }
    slot.innerHTML = '<section class="card pl" aria-labelledby="plT"><div class="plh"><h2 id="plT" style="margin:0">מי זה · אינסטגרם ורשת</h2><span class="tagp">PLUGIN</span></div>' +
      '<div class="cols">' + igBox(st, T) + whoBox(st, T) + '</div></section>';
    if (wasFocus && document.getElementById('plIg')) document.getElementById('plIg').focus();
  }

  function load(id, T, rerender) {
    return call(T, 'get', id).then(function (j) {
      var st = cache[id] || {}; st.instagram = j.instagram; st.ins = j.ins || {}; st.config = j.config; cache[id] = st; rerender();
    }).catch(function () { cache[id] = { instagram: '', ins: {}, config: null }; rerender(); });
  }

  var plugin = {
    name: 'insights',
    render: function (slot, c, T) {
      plugin.el = slot;
      var rerender = function () { var s = plugin.el, cur = T.state().client; if (s && s.isConnected && cur && cur.id === c.id) paint(s, cur, T); };
      if (!cache[c.id]) { paint(slot, c, T); load(c.id, T, rerender); } else paint(slot, c, T);
      if (slot.dataset.bound) return; slot.dataset.bound = '1';
      slot.addEventListener('click', function (e) {
        var b = e.target.closest('[data-pl]'); if (!b) return;
        var cl = T.state().client; if (!cl) return; var id = cl.id, st = cache[id] || (cache[id] = {}), act = b.dataset.pl;
        var re = function () { var s = plugin.el, cur = T.state().client; if (s && s.isConnected && cur && cur.id === id) paint(s, cur, T); };
        if (act === 'setig') {
          var v = document.getElementById('plIg').value.trim();
          call(T, 'setig', id, { id: id, handle: v }).then(function (j) { st.instagram = j.instagram; st.ins = j.ins; st.igErr = ''; st.draft = null; re(); T.toast('נשמר'); }).catch(function (er) { st.igErr = errText(er); re(); });
        } else if (act === 'ig' || act === 'who') {
          st.busy = act; st[act === 'ig' ? 'igErr' : 'whoErr'] = ''; re();
          call(T, act, id, { id: id }).then(function (j) { st.ins = j.ins; }).catch(function (er) { st[act === 'ig' ? 'igErr' : 'whoErr'] = errText(er); })
            .then(function () { st.busy = ''; re(); });
        }
      });
      slot.addEventListener('input', function (e) { var cl = T.state().client; if (e.target.id === 'plIg' && cl && cache[cl.id]) cache[cl.id].draft = e.target.value; });
      slot.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target.id === 'plIg') { e.preventDefault(); var b = slot.querySelector('[data-pl="setig"]'); if (b) b.click(); } });
    },
    setInstagram: function (id, handle, T) { return call(T, 'setig', id, { id: id, handle: handle }).then(function () { delete cache[id]; }); }
  };
  (window.TZ_PLUGINS = window.TZ_PLUGINS || []).push(plugin);
})();
