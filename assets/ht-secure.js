/* 口令解锁：真实名单 + 云端同步授课进度（“讲到这里”、课次记录、抽问）。
   口令只在本机用于计算密钥；名单、云端令牌、同步内容都以 AES-GCM 加密。
   需要 assets/secure-blobs.js（由发布脚本生成），并在 teaching.js、picker.js 之后载入。 */
(function () {
  'use strict';
  var BLOBS = window.BC_SECURE, T = window.HTTeaching, C = window.TEACHING_SOURCE;
  var S = window.BCSecure = { unlocked: false, sync: null, status: '' };
  if (!BLOBS || !BLOBS.kdf || !BLOBS.items || !BLOBS.items.roster || !T || !C) return;
  var RECORD_KEY = T.storageKey, NS = 'htsync-' + RECORD_KEY + '-';
  var KEY_STORE = NS + 'key', META = NS + 'meta', BACKUPS = NS + 'backups';
  var subtle = window.crypto && window.crypto.subtle;
  var HAS_SYNC = !!BLOBS.items.sync;
  var aesKey = null, syncCfg = null;

  function b64(buf) { var s = '', b = new Uint8Array(buf); for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s); }
  function unb64(str) { var s = atob(str), b = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return b; }
  function utf8(s) { return new TextEncoder().encode(s); }
  function toast(t) { if (T.toast) T.toast(t); }
  function hhmm(t) { var d = new Date(t); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
  function when(t) { var d = new Date(t), n = new Date(); return (d.toDateString() === n.toDateString() ? '' : (d.getMonth() + 1) + '月' + d.getDate() + '日 ') + hhmm(t); }
  function readJSON(store, k, dflt) { try { var v = JSON.parse(store.getItem(k)); return v == null ? dflt : v; } catch (e) { return dflt; } }
  function writeJSON(store, k, v) { try { store.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function hash(str) { var h1 = 0xdeadbeef, h2 = 0x41c6ce57; for (var i = 0; i < str.length; i++) { var c = str.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); } h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909); h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909); return (h2 >>> 0).toString(16) + (h1 >>> 0).toString(16); }
  function stable(v) { if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']'; if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ':' + stable(v[k]); }).join(',') + '}'; return JSON.stringify(v); }
  function meaning(raw) { try { return hash(stable(JSON.parse(raw).data)); } catch (e) { return 'bad:' + hash(String(raw)); } }
  function emptyish(raw) {
    if (!raw) return true;
    try { var d = JSON.parse(raw).data, p = d.picker || {}; return !d.bookmark && !Object.keys(d.records || {}).length && !Object.keys(d.overrides || {}).length && !(p.drawn || []).length && !(p.excluded || []).length; }
    catch (e) { return false; }
  }

  /* ---------- 加密 ---------- */
  function importAes(raw) { return subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']); }
  function derive(pass) {
    return subtle.importKey('raw', utf8(pass), 'PBKDF2', false, ['deriveBits']).then(function (base) {
      return subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: unb64(BLOBS.kdf.salt), iterations: BLOBS.kdf.iterations }, base, 256);
    });
  }
  function decryptItem(key, item) { return subtle.decrypt({ name: 'AES-GCM', iv: unb64(item.iv) }, key, unb64(item.ct)).then(function (pt) { return JSON.parse(new TextDecoder().decode(pt)); }); }
  function encryptJSON(key, obj) {
    var iv = crypto.getRandomValues(new Uint8Array(12));
    return subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, utf8(JSON.stringify(obj))).then(function (ct) { return { v: 1, alg: 'AES-GCM', kdfSalt: BLOBS.kdf.salt, iv: b64(iv), ct: b64(ct) }; });
  }

  /* ---------- 名单 ---------- */
  var origNames = C.students.map(function (s) { return s.name; });
  function applyNames(list) {
    var m = {}; (list || []).forEach(function (s) { m[s.id] = s.name; });
    C.students.forEach(function (s, i) { s.name = list ? (m[s.id] || origNames[i]) : origNames[i]; });
    window.dispatchEvent(new Event('ht:roster-change'));
  }

  /* ---------- 解锁 / 锁定 ---------- */
  function useKey(rawBits, remember) {
    return importAes(rawBits).then(function (key) {
      return decryptItem(key, BLOBS.items.roster).then(function (roster) {
        aesKey = key; S.unlocked = true; applyNames(roster.students || []);
        if (remember !== null) {
          var rec = JSON.stringify({ salt: BLOBS.kdf.salt, k: b64(rawBits) });
          try { localStorage.removeItem(KEY_STORE); sessionStorage.removeItem(KEY_STORE); (remember ? localStorage : sessionStorage).setItem(KEY_STORE, rec); } catch (e) {}
        }
        return HAS_SYNC ? decryptItem(key, BLOBS.items.sync).then(function (cfg) { syncCfg = cfg; S.sync = true; }, function () { syncCfg = null; }) : null;
      });
    }).then(function () { setStatus(S.status); if (syncCfg) syncNow('open'); });
  }
  function unlockWithPass(pass, remember) {
    return derive(pass).then(function (bits) { return useKey(bits, remember); }, function () { throw new Error('这个浏览器无法解锁，请换用新版 Chrome、Edge 或 Safari。'); })
      .catch(function (e) { if (e && e.message && /浏览器/.test(e.message)) throw e; throw new Error('口令不对，请再试一次。'); });
  }
  function lock() {
    try { localStorage.removeItem(KEY_STORE); sessionStorage.removeItem(KEY_STORE); } catch (e) {}
    aesKey = null; syncCfg = null; S.unlocked = false; S.sync = null; clearTimeout(pushTimer);
    applyNames(null); setStatus('');
    toast('已在这台电脑上锁定：名单恢复为编号，云端同步已停止。授课记录仍保存在这台电脑。');
  }
  function autoUnlock() {
    if (!subtle) return;
    var rec = readJSON(localStorage, KEY_STORE, null) || readJSON(sessionStorage, KEY_STORE, null);
    if (!rec || rec.salt !== BLOBS.kdf.salt) return;
    useKey(unb64(rec.k), null).catch(function () { try { localStorage.removeItem(KEY_STORE); sessionStorage.removeItem(KEY_STORE); } catch (e) {} setStatus(''); });
  }

  /* ---------- 云端同步 ---------- */
  var meta = readJSON(localStorage, META, {});
  if (!meta.device) meta.device = 'pc-' + Math.random().toString(36).slice(2, 8);
  function saveMeta() { writeJSON(localStorage, META, meta); }
  (function initMeta() {
    var raw = localStorage.getItem(RECORD_KEY);
    if (raw && meta.localHash !== meaning(raw)) {
      meta.localHash = meaning(raw);
      try { meta.changedAt = Date.parse(JSON.parse(raw).exportedAt) || Date.now(); } catch (e) { meta.changedAt = Date.now(); }
    }
    saveMeta();
  })();
  var suppress = false, pushTimer = null;
  var origSet = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) {
    origSet.call(this, k, v);
    if (k !== RECORD_KEY || suppress) return;
    try { if (this !== window.localStorage) return; } catch (e) { return; }
    var h = meaning(v);
    if (h !== meta.localHash) { meta.localHash = h; meta.changedAt = Date.now(); saveMeta(); schedulePush(3000); }
  };
  function schedulePush(ms) { if (!syncCfg) return; if (dirty()) setStatus('pending'); clearTimeout(pushTimer); pushTimer = setTimeout(function () { syncNow('save'); }, ms); }
  function dirty() { var raw = localStorage.getItem(RECORD_KEY); return !!raw && (meta.syncedLocalHash === undefined ? !emptyish(raw) : meaning(raw) !== meta.syncedLocalHash); }
  function backup(raw, reason) {
    if (!raw) return;
    var list = readJSON(localStorage, BACKUPS, []);
    list.unshift({ at: Date.now(), reason: reason, raw: raw });
    while (list.length > 5) { list.pop(); if (writeJSON(localStorage, BACKUPS, list)) return; }
    if (!writeJSON(localStorage, BACKUPS, list)) writeJSON(localStorage, BACKUPS, list.slice(0, 1));
  }
  function api(q) { return 'https://api.github.com/repos/' + syncCfg.owner + '/' + syncCfg.repo + '/contents/' + syncCfg.path.split('/').map(encodeURIComponent).join('/') + (q || ''); }
  function headers() { return { 'Authorization': 'Bearer ' + syncCfg.token, 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }; }
  function getRemote() {
    return fetch(api('?ref=' + encodeURIComponent(syncCfg.branch || 'main') + '&t=' + Date.now()), { headers: headers(), cache: 'no-store' }).then(function (r) {
      if (r.status === 404) return null;
      if (!r.ok) { var e = new Error('http'); e.status = r.status; throw e; }
      return r.json().then(function (j) {
        var file = JSON.parse(atob(String(j.content || '').replace(/\s/g, '')));
        return decryptItem(aesKey, file).then(function (p) { return { sha: j.sha, payload: p }; });
      });
    });
  }
  function putRemote(raw, sha) {
    var payload = { updatedAt: meta.changedAt || Date.now(), hash: meaning(raw), device: meta.device, record: JSON.parse(raw) };
    return encryptJSON(aesKey, payload).then(function (file) {
      var body = { message: '同步授课进度 ' + new Date().toISOString(), content: btoa(JSON.stringify(file)), branch: syncCfg.branch || 'main' };
      if (sha) body.sha = sha;
      return fetch(api(), { method: 'PUT', headers: Object.assign({ 'Content-Type': 'application/json' }, headers()), body: JSON.stringify(body), cache: 'no-store' });
    }).then(function (r) {
      if (r.status === 409 || r.status === 422) { var e = new Error('conflict'); e.conflict = true; throw e; }
      if (!r.ok) { var e2 = new Error('http'); e2.status = r.status; throw e2; }
      meta.syncedHash = payload.hash; meta.syncedLocalHash = payload.hash; meta.syncedAt = Date.now(); saveMeta();
    });
  }
  function adopt(remote, localRaw) {
    if (localRaw && !emptyish(localRaw)) backup(localRaw, 'replaced-by-cloud');
    suppress = true;
    try { if (!T.adopt(remote.payload.record)) throw new Error('adopt'); } finally { suppress = false; }
    var now = localStorage.getItem(RECORD_KEY);
    meta.localHash = meaning(now); meta.changedAt = remote.payload.updatedAt; meta.syncedHash = remote.payload.hash; meta.syncedLocalHash = meta.localHash; meta.syncedAt = Date.now(); saveMeta();
    toast(localRaw && !emptyish(localRaw) ? '已换成云端最新进度（' + when(remote.payload.updatedAt) + ' 保存）。如需撤销，点“已同步”按钮。' : '已载入云端进度（' + when(remote.payload.updatedAt) + ' 保存）。点“继续上次”接着讲。');
  }
  function undoAdopt() {
    var list = readJSON(localStorage, BACKUPS, []), item = list.filter(function (b) { return b.reason === 'replaced-by-cloud'; })[0];
    if (!item) { toast('没有可恢复的本机进度。'); return; }
    var cur = localStorage.getItem(RECORD_KEY);
    try { if (!T.adopt(JSON.parse(item.raw))) throw 0; } catch (e) { toast('无法恢复这份本机进度。'); return; }
    backup(cur, 'undo-cloud');
    writeJSON(localStorage, BACKUPS, readJSON(localStorage, BACKUPS, []).filter(function (b) { return b.at !== item.at; }));
    meta.localHash = meaning(localStorage.getItem(RECORD_KEY)); meta.changedAt = Date.now(); saveMeta();
    toast('已恢复为这台电脑原来的进度，并会上传到云端。');
    syncNow('undo');
  }
  var busy = false, again = false;
  function syncNow(reason, tries) {
    if (!syncCfg || !aesKey) return Promise.resolve();
    if (busy) { again = true; return Promise.resolve(); }
    busy = true; clearTimeout(pushTimer); setStatus('busy');
    tries = tries || 0;
    return getRemote().then(function (remote) {
      var raw = localStorage.getItem(RECORD_KEY), lh = raw ? meaning(raw) : null;
      if (!remote) return raw ? putRemote(raw, null) : null;
      var rh = remote.payload.hash;
      if (lh === rh) { meta.syncedHash = rh; meta.syncedLocalHash = lh; meta.syncedAt = Date.now(); saveMeta(); return; }
      if (raw && !emptyish(raw) && emptyish(JSON.stringify(remote.payload.record))) return putRemote(raw, remote.sha);
      var localDirty = meta.syncedLocalHash === undefined ? !emptyish(raw) : lh !== meta.syncedLocalHash;
      var remoteChanged = rh !== meta.syncedHash;
      if (!localDirty) { if (remoteChanged || !raw) adopt(remote, raw); else return putRemote(raw, remote.sha); return; }
      if (!remoteChanged) return putRemote(raw, remote.sha);
      if ((remote.payload.updatedAt || 0) > (meta.changedAt || 0)) { adopt(remote, raw); return; }
      backup(JSON.stringify(remote.payload.record), 'older-cloud-copy');
      return putRemote(raw, remote.sha);
    }).then(function () { meta.syncedAt = Date.now(); saveMeta(); setStatus('ok'); }, function (e) {
      if (e && e.conflict && tries < 3) { busy = false; return syncNow(reason, tries + 1); }
      setStatus(navigator.onLine === false || !e.status ? 'offline' : 'error');
    }).then(function () { busy = false; if (again) { again = false; schedulePush(1000); } });
  }
  setInterval(function () { if (syncCfg && document.visibilityState === 'visible' && (dirty() || Date.now() - (meta.syncedAt || 0) > 120000)) syncNow('timer'); }, 60000);
  window.addEventListener('online', function () { if (syncCfg) syncNow('online'); });
  document.addEventListener('visibilitychange', function () { if (syncCfg && document.visibilityState === 'visible' && Date.now() - (meta.syncedAt || 0) > 30000) syncNow('focus'); });
  document.addEventListener('click', function (e) { var t = e.target && e.target.closest && e.target.closest('#htQuickMark'); if (t && syncCfg) setTimeout(function () { syncNow('mark'); }, 300); }, true);

  /* ---------- 界面 ---------- */
  var css = '.bc-sync{font:inherit;font-size:15px;font-weight:600;border:1px solid #c9d6e8;background:#f4f8fd;color:#24466f;border-radius:8px;padding:6px 10px;cursor:pointer;white-space:nowrap;margin-left:6px}' +
    '.bc-sync.ok{background:#eef8f1;border-color:#a9d7b6;color:#1d6a37}.bc-sync.warn{background:#fff6e6;border-color:#f0c97a;color:#7a4d00}' +
    '.bc-overlay{position:fixed;inset:0;background:rgba(20,30,50,.45);z-index:2147483000;display:flex;align-items:center;justify-content:center}' +
    '.bc-dialog{background:#fff;color:#1d2733;border-radius:14px;padding:26px 28px;width:min(440px,92vw);box-shadow:0 12px 40px rgba(0,0,0,.25);font-size:18px;line-height:1.6;text-align:left}' +
    '.bc-dialog h2{margin:0 0 10px;font-size:22px}.bc-dialog input[type=password]{width:100%;box-sizing:border-box;font-size:20px;padding:10px 12px;border:1px solid #9fb3cc;border-radius:8px;margin:8px 0}' +
    '.bc-dialog label.bc-remember{display:flex;gap:8px;align-items:center;font-size:17px;margin:6px 0 14px}.bc-dialog .bc-msg{min-height:1.6em;color:#b42318;font-size:17px}' +
    '.bc-dialog .bc-row{display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap}.bc-dialog button{font-size:17px;padding:9px 16px;border-radius:8px;border:1px solid #9fb3cc;background:#fff;color:#1d2733;cursor:pointer}' +
    '.bc-dialog button.bc-go{background:#1f4f8b;color:#fff;border-color:#1f4f8b}';
  function mountCSS() { if (document.getElementById('bc-css')) return; var s = document.createElement('style'); s.id = 'bc-css'; s.textContent = css; document.head.appendChild(s); }
  function overlay(html) {
    var o = document.createElement('div'); o.className = 'bc-overlay'; o.innerHTML = '<div class="bc-dialog" role="dialog" aria-modal="true">' + html + '</div>';
    document.body.appendChild(o);
    o.addEventListener('keydown', function (e) { if (e.key === 'Escape') o.remove(); e.stopPropagation(); });
    o.addEventListener('click', function (e) { if (e.target === o) o.remove(); });
    return o;
  }
  function openUnlock() {
    if (!subtle) { toast('这个浏览器无法解锁，请换用新版 Chrome、Edge 或 Safari。'); return; }
    if (document.querySelector('.bc-overlay')) return;
    var o = overlay('<h2>解锁</h2><p style="margin:0 0 6px;font-size:16px;color:#4d617d">输入口令后，显示学生真实姓名' + (HAS_SYNC ? '，并在各台电脑之间同步授课进度' : '') + '。</p>' +
      '<input type="password" id="bc-pass" autocomplete="current-password" aria-label="口令" placeholder="口令">' +
      '<label class="bc-remember"><input type="checkbox" id="bc-remember" checked> 在这台电脑上记住</label>' +
      '<div class="bc-msg" id="bc-msg" role="status" aria-live="polite"></div>' +
      '<div class="bc-row"><button type="button" id="bc-cancel">取消</button><button type="button" class="bc-go" id="bc-go">解锁</button></div>');
    var pass = o.querySelector('#bc-pass'), msg = o.querySelector('#bc-msg'), go = o.querySelector('#bc-go');
    function submit() {
      if (!pass.value) { msg.textContent = '请输入口令。'; pass.focus(); return; }
      go.disabled = true; msg.style.color = '#4d617d'; msg.textContent = '正在解锁…';
      unlockWithPass(pass.value, o.querySelector('#bc-remember').checked).then(function () {
        o.remove(); toast('已解锁：显示真实姓名' + (syncCfg ? '，云端同步已开启' : '') + '。');
      }, function (e) { go.disabled = false; msg.style.color = ''; msg.textContent = e.message; pass.select(); pass.focus(); });
    }
    go.onclick = submit; o.querySelector('#bc-cancel').onclick = function () { o.remove(); };
    pass.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); if (e.key === 'Escape') o.remove(); e.stopPropagation(); });
    setTimeout(function () { pass.focus(); }, 30);
  }
  function openMenu() {
    if (document.querySelector('.bc-overlay')) return;
    var bk = readJSON(localStorage, BACKUPS, []).filter(function (b) { return b.reason === 'replaced-by-cloud'; })[0];
    var o = overlay('<h2>已解锁</h2><p style="font-size:16px;color:#4d617d;margin:0 0 14px">正在显示真实姓名' + (syncCfg ? '，授课进度自动同步到云端（加密）' : '') + '。离开公用电脑前请锁定。</p>' +
      '<div class="bc-row">' + (bk ? '<button type="button" data-bc="undo">恢复被云端替换前的本机进度（' + when(bk.at) + '）</button>' : '') +
      (syncCfg ? '<button type="button" data-bc="sync">立即同步</button>' : '') + '<button type="button" data-bc="lock">在这台电脑上退出/锁定</button><button type="button" class="bc-go" data-bc="close">关闭</button></div>');
    o.querySelector('[data-bc="close"]').onclick = function () { o.remove(); };
    o.querySelector('[data-bc="lock"]').onclick = function () { o.remove(); lock(); };
    var s = o.querySelector('[data-bc="sync"]'); if (s) s.onclick = function () { o.remove(); syncNow('click'); };
    var u = o.querySelector('[data-bc="undo"]'); if (u) u.onclick = function () { o.remove(); undoAdopt(); };
  }
  S.openUnlock = openUnlock; S.lock = lock; S.syncNow = syncNow; S.undoAdopt = undoAdopt;

  function setStatus(kind) {
    S.status = kind; var b = document.getElementById('bc-sync-status'); if (!b) return;
    b.className = 'bc-sync';
    if (!S.unlocked) { b.textContent = HAS_SYNC ? '🔒 解锁后云端同步' : '🔒 解锁名单'; b.title = '输入口令，显示真实姓名' + (HAS_SYNC ? '并开启云端同步' : ''); return; }
    b.title = '点一下：立即同步 / 锁定';
    if (!syncCfg) { b.className += ' ok'; b.textContent = '已解锁'; return; }
    if (kind === 'busy') b.textContent = '正在同步…';
    else if (kind === 'pending') b.textContent = '有改动，稍后上传';
    else if (kind === 'offline') { b.className += ' warn'; b.textContent = dirty() ? '未同步，联网后自动上传' : '暂时连不上云端'; }
    else if (kind === 'error') { b.className += ' warn'; b.textContent = '云端暂时不可用，进度仍在这台电脑'; }
    else if (meta.syncedAt) { b.className += ' ok'; b.textContent = '已同步'; }
    else b.textContent = '云端同步已开启';
  }
  function mountStatus() {
    if (document.getElementById('bc-sync-status')) return;
    var resume = document.getElementById('htResume'); if (!resume) return;
    var b = document.createElement('button'); b.type = 'button'; b.id = 'bc-sync-status'; b.className = 'bc-sync';
    b.onclick = function () { if (!S.unlocked) openUnlock(); else openMenu(); };
    resume.parentNode.insertBefore(b, resume.nextSibling);
    setStatus(S.status);
  }
  function start() { mountCSS(); mountStatus(); autoUnlock(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
