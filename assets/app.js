/* 会通汉语听说3 · 全册课件（网页版）
   Plain ES5 on purpose: the page has to open by double-click (file://) on classroom
   machines whose browsers may be several years old. Data comes from data.js (window.DECK). */
(function () {
  'use strict';
  if (document.documentMode) return;   // IE: the page itself already shows "use Chrome or Edge"
  window.__HT_APP = 1;                 // tells the inline check in the html that this file arrived
  var D = window.DECK;
  if (!D || !D.slides || !D.slides.length) return;   // the html shows the "files incomplete" notice
  var N = D.count, S = D.slides, L = D.lessons;
  var KEY = 'huitong3-teaching-deck';
  var RATES = [1, 0.85, 0.7];

  function $(id) { return document.getElementById(id); }
  function pad3(n) { return ('00' + n).slice(-3); }
  function fmt(t) { t = Math.max(0, Math.floor(t || 0)); var s = t % 60; return Math.floor(t / 60) + ':' + (s < 10 ? '0' : '') + s; }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function lessonName(l) { return l.n ? '第' + l.n + '课' : '全册总览'; }
  function store(k, v) {
    try {
      var o = JSON.parse(localStorage.getItem(KEY) || '{}');
      if (arguments.length === 1) return o[k];
      o[k] = v; localStorage.setItem(KEY, JSON.stringify(o));
    } catch (e) { /* storage can be unavailable on file:// — the page works without it */ }
  }

  var stageWrap = $('stageWrap'), stage = $('stage'), img = $('slideImg'), overlay = $('overlay');
  var au = $('au'), seek = $('seek'), bar = $('bar'), blank = $('blank');
  var cur = 0;            // current slide, 1-based
  var curRec = 0;         // recording loaded in the <audio> element
  var barRec = 0;         // recording the toolbar (and P / R) currently controls
  var pill = null;        // live play button of the current slide: {el, fill, time, label, rec, cont}
  var seeking = false, rateIdx = 0;
  var backTo = 0;         // page the teacher was on before a jump; Backspace returns there until the next page turn
  var autoPaused = null;  // {rec, at, page}: a recording that paging paused by itself, when, and on which page

  // recording -> lesson index, to stop playback when the teacher leaves that lesson
  var recLesson = {};
  S.forEach(function (s) { if (s.a) recLesson[s.a.rec] = s.l; });

  // Pages without a play button of their own that still belong to a recording:
  // those between an exercise page and its transcript page, and "X（续）" pages after page "X".
  var inh = [];
  (function () {
    var i, j, s, p, n, base = {}, lesson = -1;
    for (i = 0; i < N; i++) {
      s = S[i];
      if (s.l !== lesson) { lesson = s.l; base = {}; }
      if (s.a) { base[s.t] = s.a.rec; continue; }
      p = n = 0;
      for (j = i - 1; j >= 0 && S[j].l === s.l; j--) if (S[j].a) { p = S[j].a.rec; break; }
      for (j = i + 1; j < N && S[j].l === s.l; j++) if (S[j].a) { n = S[j].a.rec; break; }
      inh[i + 1] = (p && p === n) ? p : (/（续）$/.test(s.t) ? (base[s.t.replace(/（续）$/, '')] || 0) : 0);
    }
  })();
  function recAt(i) { var s = S[i - 1]; return s.a ? s.a.rec : (inh[i] || 0); }

  /* ---------- layout ---------- */
  function isFs() { return document.body.className.indexOf('fs') >= 0; }
  function layout() {
    var m = isFs() ? 0 : 12;
    var W = stageWrap.clientWidth - 2 * m, H = stageWrap.clientHeight - 2 * m;
    if (W <= 0 || H <= 0) return;
    var w = Math.min(W, H * 16 / 9), h = w * 9 / 16;
    stage.style.width = w + 'px'; stage.style.height = h + 'px';
    stage.style.left = (m + (W - w) / 2) + 'px'; stage.style.top = (m + (H - h) / 2) + 'px';
    document.documentElement.style.setProperty('--sw', w + 'px');
    if (window.HTInk && window.HTInk.layoutChanged) window.HTInk.layoutChanged();
  }
  window.addEventListener('resize', layout);

  /* ---------- slide display ---------- */
  var cache = {}, loadToken = 0, webpOK = null;
  function srcOf(i) { return 'slides/' + pad3(i) + '.webp'; }
  function preload(i) {
    if (i < 1 || i > N || cache[i]) return;
    var im = new Image(); im.src = srcOf(i); cache[i] = im;
    var keys = Object.keys(cache);
    if (keys.length > 12) keys.forEach(function (k) { if (Math.abs(k - cur) > 4) delete cache[k]; });
  }
  // An image failed: is it the file, or a browser that cannot show WebP at all?
  function webpTest(cb) {
    if (webpOK !== null) { cb(webpOK); return; }
    var t = new Image();
    t.onload = t.onerror = function () { webpOK = t.width === 1 && t.height === 1; cb(webpOK); };
    t.src = 'data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA';
  }
  function setImage(i) {
    var token = ++loadToken, im = new Image();
    im.onload = function () { if (token === loadToken) img.src = im.src; };
    im.onerror = function () {
      if (token !== loadToken) return;
      img.removeAttribute('src');
      webpTest(function (ok) {
        if (ok) toast('第 ' + i + ' 页的图片没有找到（slides/' + pad3(i) + '.webp）。请确认整个文件夹放在一起。', 5000);
        else if (!$('oldBrowser')) {
          var p = el('p', 'fatal', '这个浏览器太旧，显示不了课件画面。请用 Chrome 或新版 Edge 浏览器打开“打开课件.html”。');
          p.id = 'oldBrowser'; stage.appendChild(p);
        }
      });
    };
    im.src = srcOf(i);
  }

  function rect(e, r) {
    e.style.left = (r[0] * 100) + '%'; e.style.top = (r[1] * 100) + '%';
    e.style.width = (r[2] * 100) + '%'; e.style.height = (r[3] * 100) + '%';
  }
  function buildOverlay(s) {
    overlay.innerHTML = ''; pill = null;
    (s.k || []).forEach(function (k) {
      var b = el('button', 'hot'); rect(b, k.r);
      var t = S[k.to - 1], l = L[t.l];
      b.title = '跳到第 ' + k.to + ' 页（' + lessonName(l) + (t.t === '封面' ? '' : ' · ' + t.t) + '）';
      b.setAttribute('aria-label', b.title);
      b.onclick = function () { go(k.to); };
      overlay.appendChild(b);
    });
    if (s.a) {
      var p = el('button', 'pill' + (s.a.cont ? ' cont' : '')); rect(p, s.a.r);
      p.title = '播放 / 暂停 录音 ' + pad3(s.a.rec) + '（P）';
      var fill = el('span', 'pill-fill'), ic = el('span', 'pill-ic');
      ic.innerHTML = '<svg viewBox="0 0 24 24" class="ic-play"><path d="M8 5v14l11-7z"/></svg><svg viewBox="0 0 24 24" class="ic-pause"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>';
      var label = el('span', 'pill-label'), time = el('span', 'pill-time');
      p.appendChild(fill); p.appendChild(ic); p.appendChild(label); p.appendChild(time);
      p.onclick = function () { toggle(); };
      overlay.appendChild(p);
      pill = { el: p, fill: fill, time: time, label: label, rec: s.a.rec, cont: !!s.a.cont };
    }
  }

  function show(i, quiet) {
    i = Math.max(1, Math.min(N, i | 0));
    if (window.HTScene) window.HTScene.leave();
    var s = S[i - 1], l = L[s.l], from = cur, target = recAt(i), note = '';
    cur = i;
    if (digits) clearDigits();
    digitsGone = 0;
    setImage(i); preload(i + 1); preload(i - 1); preload(i + 2);
    // Landing on a page of another recording, or in another lesson, stops what is playing.
    // Paging straight back within a few seconds (a clicker that fired twice) picks it up again.
    var leaves = curRec && ((target && target !== curRec) || recLesson[curRec] !== s.l);
    if (leaves && !au.paused && !au.ended) {
      au.pause(); autoPaused = { rec: curRec, at: Date.now(), page: from };
      note = '录音 ' + pad3(curRec) + ' 已暂停（翻到了别的页面）';
    } else if (autoPaused) {
      if (!leaves && (target === autoPaused.rec || i === autoPaused.page) && curRec === autoPaused.rec && au.paused && Date.now() - autoPaused.at < 8000) {
        note = '录音 ' + pad3(curRec) + ' 继续播放'; autoPaused = null; play();
      } else if (Date.now() - autoPaused.at >= 8000) autoPaused = null;
    }
    buildOverlay(s);
    $('pageInput').value = i;
    $('whereNo').textContent = l.n ? '第' + l.n + '课' : '总览';
    $('whereLesson').textContent = l.title;
    $('whereTitle').textContent = s.t;
    $('btnPrev').disabled = $('edgePrev').disabled = i === 1;
    $('btnNext').disabled = $('edgeNext').disabled = i === N;
    $('notesPage').textContent = '第 ' + i + ' 页';
    var nb = $('notesBody'); nb.textContent = s.n || '（本页没有备注）'; nb.className = s.n ? '' : 'empty'; nb.scrollTop = 0;
    if (!$('notes').hidden) layout();
    document.title = (l.n ? '第' + l.n + '课 ' : '') + s.t + ' · ' + i + '/' + N + ' · 会通汉语听说3 教学增强版';
    updateAudio();
    markCurrent();
    // a jump can be undone with Backspace until the next ordinary page turn; after that Backspace is "previous page"
    if (i !== from && backTo) hideToast();   // an earlier "press Backspace to return" hint is stale now
    if (from >= 1 && Math.abs(i - from) > 1) backTo = from; else if (i !== from) backTo = 0;
    if (!quiet) {
      store('page', i);
      try { history.replaceState(null, '', '#p=' + i); } catch (e) { /* file:// in some browsers */ }
    }
    if (note) toast(note, 2600);
    if (window.HTTeaching && window.HTTeaching.pageChanged) window.HTTeaching.pageChanged(i);
    if (window.HTInk) window.HTInk.pageChanged(i);
    if (window.HTScene) window.HTScene.pageChanged(i);
    return note;
  }
  function go(i) { i = parseInt(i, 10); if (!(i >= 1 && i <= N)) { toast('没有这一页（共 ' + N + ' 页）'); return false; } show(i); return true; }
  function next() { if (window.HTScene && window.HTScene.next(cur)) return; if (cur < N) show(cur + 1); }
  function prev() { if (window.HTScene && window.HTScene.prev(cur)) return; if (cur > 1) show(cur - 1); }
  function shortNote(n) { return n ? ' · ' + n.replace('（翻到了别的页面）', '') : ''; }
  function goBack() {
    var b = backTo, from = cur, note = show(b);
    toast('已回到第 ' + b + ' 页' + shortNote(note) + (Math.abs(b - from) > 1 ? ' · 再按 Backspace 回到第 ' + from + ' 页' : ''), 5000);
  }
  function farJump(i) {   // Home / End sit next to PageUp / PageDown: say how to undo a slip
    var from = cur, note = show(i);
    if (Math.abs(i - from) > 1) toast('已到第 ' + i + ' 页' + shortNote(note) + ' · 按 Backspace 回到第 ' + from + ' 页', 5000);
  }

  /* ---------- audio ---------- */
  var pendingSeek = null;   // one-shot 'loadedmetadata' listener left by a drag before the first play
  function durOf(rec) { return (rec === curRec && isFinite(au.duration) && au.duration > 0) ? au.duration : (D.dur[rec] || 0); }
  function rateText() { var r = RATES[rateIdx]; return (r === 1 ? '1.0' : String(r)) + '×'; }
  function load(rec) {
    if (pendingSeek) { au.removeEventListener('loadedmetadata', pendingSeek); pendingSeek = null; }
    curRec = rec;
    au.src = 'audio/' + pad3(rec) + '.mp3';
    au.defaultPlaybackRate = au.playbackRate = RATES[rateIdx];
  }
  function play() {
    var p = au.play();
    // a broken file is reported by the 'error' listener; do not overwrite its message
    if (p && p.catch) p.catch(function (e) { if (e && e.name !== 'AbortError' && !au.error) toast('录音没有播放成功：' + (e.message || e.name), 4000); });
  }
  function toggle() {
    var rec = barRec, starts;
    if (!rec) { toast('本页没有录音'); return; }
    autoPaused = null;
    if (rec !== curRec || au.error) { load(rec); play(); starts = true; }
    else if (au.paused) { play(); starts = true; }
    else { au.pause(); starts = false; }
    // no play button on this page (or the screen is blanked): say what happened
    if (!pill || !blank.hidden) toast((starts ? '播放' : '暂停') + ' · 录音 ' + pad3(rec), 1800);
  }
  function restart() {
    var rec = barRec;
    if (!rec) { toast('本页没有录音'); return; }
    autoPaused = null;
    if (rec !== curRec || au.error) load(rec); else { try { au.currentTime = 0; } catch (e) {} }
    play();
    if (!pill || !blank.hidden) toast('从头播放 · 录音 ' + pad3(rec), 1800);
  }
  function skip(d) {
    if (!barRec || barRec !== curRec) return;
    try { au.currentTime = Math.max(0, Math.min(durOf(curRec) - 0.2, au.currentTime + d)); } catch (e) {}
  }
  function updateAudio() {
    var s = S[cur - 1];
    // The toolbar follows the page. A page with no recording of its own keeps the lesson's loaded one.
    barRec = recAt(cur) || (curRec && recLesson[curRec] === s.l ? curRec : 0);
    var grp = $('audioGrp');
    grp.hidden = !barRec;
    var active = barRec && barRec === curRec, playing = active && !au.paused && !au.ended;
    var d = durOf(barRec), t = active ? au.currentTime : 0;
    var frac = d > 0 ? Math.max(0, Math.min(1, t / d)) : 0;
    if (barRec) {
      grp.className = 'grp audio' + (playing ? ' playing' : '');
      $('recLabel').textContent = '录音 ' + pad3(barRec);
      if (!seeking) {   // while the slider is being dragged it shows the target, not the playing position
        $('timeLabel').textContent = fmt(t) + ' / ' + fmt(d);
        seek.value = Math.round(frac * 1000);
        seek.style.setProperty('--p', (frac * 100) + '%');
      }
    }
    if (pill) {
      var pa = pill.rec === curRec, pp = pa && !au.paused && !au.ended, st = pa && (au.currentTime > 0 || pp);
      var pd = durOf(pill.rec), slow = RATES[rateIdx] !== 1;
      pill.el.className = 'pill' + (pill.cont ? ' cont' : '') + (st ? ' active' : '') + (pp ? ' playing' : '');
      pill.label.textContent = (pill.cont && !st) ? '接上页 · 录音 ' + pad3(pill.rec) : '录音 ' + pad3(pill.rec);
      pill.time.textContent = st ? fmt(au.currentTime) + (slow ? ' · ' + rateText() : ' / ' + fmt(pd))
        : (pill.cont ? '' : fmt(pd) + (slow ? ' · ' + rateText() : ''));
      pill.fill.style.width = (st && pd > 0 ? Math.max(0, Math.min(1, au.currentTime / pd)) * 100 : 0) + '%';
      // browsers with a minimum font size can run out of room in a small window: keep the short form
      if (pill.el.scrollWidth > pill.el.clientWidth + 1) pill.time.textContent = st ? fmt(au.currentTime) : '';
    }
  }
  ['timeupdate', 'play', 'pause', 'ended', 'loadedmetadata', 'seeked', 'emptied'].forEach(function (ev) { au.addEventListener(ev, updateAudio); });
  au.addEventListener('error', function () {
    if (!curRec) return;
    toast('录音文件打不开：audio/' + pad3(curRec) + '.mp3（请确认“audio”文件夹和网页放在一起）', 6000);
    updateAudio();
  });
  seek.addEventListener('input', function () {
    seeking = true;
    var d = durOf(barRec), v = seek.value / 1000;
    seek.style.setProperty('--p', (v * 100) + '%');
    $('timeLabel').textContent = fmt(v * d) + ' / ' + fmt(d);
  });
  function seekDone() {
    if (!seeking) return;
    var v = seek.value / 1000, rec = barRec;
    seeking = false;
    if (!rec) return;
    autoPaused = null;
    if (rec !== curRec || au.error) {
      // dragging before the first play: load, then jump once the file is ready
      load(rec);
      pendingSeek = function () {
        au.removeEventListener('loadedmetadata', pendingSeek); pendingSeek = null;
        try { au.currentTime = v * au.duration; } catch (e) {}
      };
      au.addEventListener('loadedmetadata', pendingSeek);
      au.load();
    } else {
      try { au.currentTime = v * durOf(rec); } catch (e) {}
    }
    updateAudio();
  }
  seek.addEventListener('change', function () { seekDone(); seek.blur(); });
  seek.addEventListener('blur', seekDone);
  function cycleRate() {
    rateIdx = (rateIdx + 1) % RATES.length;
    au.defaultPlaybackRate = au.playbackRate = RATES[rateIdx];
    showRate(); updateAudio();
    toast('语速 ' + rateText() + (RATES[rateIdx] === 1 ? '（正常）' : ''), 1600);
  }
  function showRate() {
    $('btnRate').textContent = rateText();
    $('btnRate').className = 'btn txt rate' + (RATES[rateIdx] === 1 ? '' : ' on');
  }

  /* ---------- sidebar ---------- */
  var side = $('side'), scrim = $('scrim'), sideList = $('sideList'), searchList = $('searchList'), searchInput = $('searchInput');
  var lesBtns = [], lesBoxes = [];
  function buildSide() {
    L.forEach(function (l, k) {
      var b = el('button', 'les');
      b.appendChild(el('span', 'no', lessonName(l)));
      b.appendChild(el('span', 'nm', l.n ? l.title : '总封面 · 总目录'));
      b.appendChild(el('span', 'rg', l.start + '–' + l.end));
      var car = el('span', 'car', '›');
      b.appendChild(car);
      var box = el('div', 'pages'); box.hidden = true;
      b.onclick = function () { openLesson(k, box.hidden); };
      sideList.appendChild(b); sideList.appendChild(box);
      lesBtns.push(b); lesBoxes.push(box);
    });
  }
  function fillLesson(k) {
    var box = lesBoxes[k], l = L[k];
    if (box.firstChild) return;
    for (var i = l.start; i <= l.end; i++) box.appendChild(pageItem(i));
  }
  function pageItem(i) {
    var s = S[i - 1], b = el('button', 'pg' + (s.t.indexOf('听力文本复盘') === 0 ? ' rv' : ''));
    b.setAttribute('data-p', i);
    b.appendChild(el('span', 'n', i));
    b.appendChild(el('span', 't', s.t));
    if (s.a && !s.a.cont) b.appendChild(el('span', 'a', '♪ ' + pad3(s.a.rec)));
    b.onclick = function () { go(i); closeSide(); };
    return b;
  }
  function openLesson(k, open) {
    if (open) fillLesson(k);
    lesBoxes[k].hidden = !open;
    lesBtns[k].className = 'les' + (open ? ' open' : '') + (S[cur - 1].l === k ? ' here' : '');
    if (open) markCurrent();
  }
  function markCurrent() {
    var k = S[cur - 1].l, i, old;
    for (i = 0; i < lesBtns.length; i++) {
      var c = lesBtns[i].className.replace(' here', '');
      lesBtns[i].className = c + (i === k ? ' here' : '');
    }
    old = sideList.querySelectorAll('.pg.cur');
    for (i = 0; i < old.length; i++) old[i].className = old[i].className.replace(' cur', '');
    var me = lesBoxes[k] && lesBoxes[k].querySelector('.pg[data-p="' + cur + '"]');
    if (me) me.className += ' cur';
    return me;
  }
  function openSide() {
    var k = S[cur - 1].l;
    openLesson(k, true);
    side.className = 'open'; side.setAttribute('aria-hidden', 'false'); scrim.hidden = false;
    $('btnMenu').className = 'btn on';
    var me = markCurrent();
    if (me && !searchInput.value) {
      // current page in the middle; keep its lesson header in view only when both fit
      var base = sideList.getBoundingClientRect().top - sideList.scrollTop;
      var yMe = me.getBoundingClientRect().top - base, yLes = lesBtns[k].getBoundingClientRect().top - base;
      var want = yMe - sideList.clientHeight / 2 + 16;
      var fits = (yMe - yLes) + me.offsetHeight <= sideList.clientHeight;
      sideList.scrollTop = Math.max(0, fits ? Math.min(yLes, want) : want);
    }
  }
  function closeSide() {
    side.className = ''; side.setAttribute('aria-hidden', 'true'); scrim.hidden = true;
    $('btnMenu').className = 'btn';
    if (document.activeElement && side.contains(document.activeElement)) document.activeElement.blur();
    // next time the drawer opens it should show the lesson list, not an old search
    if (searchInput.value) { searchInput.value = ''; doSearch(); }
  }
  function sideOpen() { return side.className === 'open'; }

  /* ---------- search ---------- */
  var hay = null;
  function norm(t) { return String(t).toLowerCase().replace(/[\s　]+/g, ''); }
  function doSearch() {
    var q = norm(searchInput.value);
    if (!q) { searchList.hidden = true; sideList.hidden = false; return; }
    // two haystacks per page: its labels (page number, lesson, title, recording) and its text
    if (!hay) hay = S.map(function (s, i) {
      var r = recAt(i + 1);
      return {
        meta: norm('第' + (i + 1) + '页｜' + lessonName(L[s.l]) + '｜' + s.t + (r ? '｜录音' + pad3(r) + '｜录音' + r : '')),
        body: norm(s.x)
      };
    });
    searchList.innerHTML = ''; sideList.hidden = true; searchList.hidden = false;
    var first = [], rest = [], i, at;
    for (i = 0; i < N; i++) {
      if (hay[i].meta.indexOf(q) >= 0) first.push([i + 1, hay[i].body.indexOf(q)]);
      else if ((at = hay[i].body.indexOf(q)) >= 0) rest.push([i + 1, at]);
    }
    // the lesson being taught comes first, so a broad word still reaches its pages under the cap
    var cl = S[cur - 1].l, mine = [], other = [];
    first.concat(rest).forEach(function (h) { (S[h[0] - 1].l === cl ? mine : other).push(h); });
    var all = mine.concat(other), shown = Math.min(all.length, 80);
    if (/^\d+$/.test(q) && +q >= 1 && +q <= N) {   // a bare number: that page comes first
      all = all.filter(function (h) { return h[0] !== +q; }); all.unshift([+q, hay[+q - 1].body.indexOf(q)]);
      shown = Math.min(all.length, 80);
    }
    for (i = 0; i < shown; i++) searchList.appendChild(hitItem(all[i][0], hay[all[i][0] - 1].body, all[i][1], q.length));
    if (!all.length) searchList.appendChild(el('div', 'none', '没有找到“' + searchInput.value + '”。可以试试更短的词。'));
    else if (all.length > shown) searchList.appendChild(el('div', 'none', '共 ' + all.length + ' 页，先列本课，再按页码列出前 ' + shown + ' 页。加一个词可以缩小范围。'));
  }
  function hitItem(p, text, at, len) {
    var s = S[p - 1], b = el('button', 'hit'), h1 = el('div', 'h1'), h2 = el('div', 'h2');
    h1.appendChild(el('i', null, p));
    h1.appendChild(document.createTextNode(lessonName(L[s.l]) + ' · ' + s.t + (s.a ? ' · 录音 ' + pad3(s.a.rec) : '')));
    if (at < 0) h2.textContent = text.slice(0, 56) + (text.length > 56 ? '…' : '');
    else {
      var a = Math.max(0, at - 14), z = Math.min(text.length, at + len + 40);
      h2.appendChild(document.createTextNode((a > 0 ? '…' : '') + text.slice(a, at)));
      h2.appendChild(el('mark', null, text.slice(at, at + len)));
      h2.appendChild(document.createTextNode(text.slice(at + len, z) + (z < text.length ? '…' : '')));
    }
    b.appendChild(h1); b.appendChild(h2);
    b.onclick = function () { go(p); closeSide(); };
    return b;
  }
  searchInput.addEventListener('input', doSearch);

  /* ---------- overview grid ---------- */
  var grid = $('grid'), gridTabs = $('gridTabs'), gridBody = $('gridBody');
  function buildTabs() {
    L.forEach(function (l, k) {
      var t = el('button', 'tab', l.n ? '第' + l.n + '课' : '总览');
      t.title = l.title;
      t.onclick = function () { fillGrid(k); };
      gridTabs.appendChild(t);
    });
  }
  function fillGrid(k) {
    var l = L[k], tabs = gridTabs.children, i;
    for (i = 0; i < tabs.length; i++) tabs[i].className = 'tab' + (i === k ? ' on' : '');
    gridBody.innerHTML = '';
    var me = null;
    for (i = l.start; i <= l.end; i++) {
      (function (p) {
        var b = el('button', 'th' + (p === cur ? ' cur' : '')), im = document.createElement('img');
        im.setAttribute('loading', 'lazy'); im.alt = ''; im.src = 'thumbs/' + pad3(p) + '.jpg';
        var cap = el('div', 'cap'); cap.appendChild(el('i', null, p)); cap.appendChild(el('span', null, S[p - 1].t));
        b.appendChild(im); b.appendChild(cap);
        b.onclick = function () { go(p); closeGrid(); };
        gridBody.appendChild(b);
        if (p === cur) me = b;
      })(i);
    }
    gridBody.scrollTop = me ? Math.max(0, me.offsetTop - gridBody.offsetTop - 140) : 0;
  }
  function openGrid() { grid.hidden = false; $('btnGrid').className = 'btn on'; fillGrid(S[cur - 1].l); }
  function closeGrid() { grid.hidden = true; $('btnGrid').className = 'btn'; }

  /* ---------- notes, help, blank screen, fullscreen, toast ---------- */
  // Notes can hold answers: they always start hidden and are never remembered between sessions.
  function setNotes(on) {
    $('notes').hidden = !on; $('btnNotes').className = 'btn' + (on ? ' on' : '');
    toastEl.className = on ? 'up' : '';   // notes open: toasts sit just above the notes panel
    layout();   // in fullscreen the toolbar docks under the open notes panel (css), so the stage size changes too
  }
  function setHelp(on) { $('help').hidden = !on; }
  function setBlank(on) { blank.hidden = !on; if (on) hideToast(); }
  function fsElement() { return document.fullscreenElement || document.webkitFullscreenElement || null; }
  function toggleFull() {
    var de = document.documentElement;
    if (fsElement()) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
    var req = de.requestFullscreen || de.webkitRequestFullscreen;
    if (!req) { toast('这个浏览器不支持网页全屏，可以按 F11（Mac：Control+Command+F）'); return; }
    var p = req.call(de);
    if (p && p.catch) p.catch(function () { toast('没能进入全屏，可以按 F11（Mac：Control+Command+F）'); });
  }
  var idleTimer = 0, barHover = false, barTouch = false;
  function wake() {
    var b = document.body;
    if (b.className.indexOf('idle') >= 0) b.className = b.className.replace(' idle', '');
    clearTimeout(idleTimer);
    if (isFs()) idleTimer = setTimeout(function () {
      if (isFs() && !bar.contains(document.activeElement) && !barHover && !barTouch && !(window.HTInk && window.HTInk.isEnabled())) document.body.className += ' idle';
    }, 2600);
  }
  // A finger tap also sends mouseenter (and no mouseleave until the next tap elsewhere):
  // only a real mouse can "rest" on the bar; a finger holds it only while it is down (dragging the slider).
  bar.addEventListener(window.PointerEvent ? 'pointerenter' : 'mouseenter', function (e) {
    if (!e.pointerType || e.pointerType === 'mouse') barHover = true;
  });
  bar.addEventListener('mouseleave', function () { barHover = false; wake(); });
  bar.addEventListener('touchstart', function () { barTouch = true; });
  function barTouchEnd() { barTouch = false; wake(); }
  bar.addEventListener('touchend', barTouchEnd);
  bar.addEventListener('touchcancel', barTouchEnd);
  bar.addEventListener('focusout', wake);   // focus left the page box / slider: re-arm the hide timer
  function onFsChange() {
    var on = !!fsElement();
    document.body.className = on ? 'fs' : '';
    $('btnFull').className = 'btn' + (on ? ' on' : '');
    // In fullscreen the browser keeps Esc for itself. Where the Keyboard Lock API exists (Chrome / Edge),
    // take it back so Esc first closes an open panel and only then leaves fullscreen.
    try {
      var kb = navigator.keyboard;
      if (kb && kb.lock) {
        if (on) { var lp = kb.lock(['Escape']); if (lp && lp.catch) lp.catch(function () {}); }
        else if (kb.unlock) kb.unlock();
      }
    } catch (e) {}
    layout(); wake();
    setTimeout(layout, 120);
  }
  document.addEventListener('fullscreenchange', onFsChange);
  document.addEventListener('webkitfullscreenchange', onFsChange);
  document.addEventListener('mousemove', wake);
  document.addEventListener('touchstart', wake);

  var toastTimer = 0, toastEl = $('toast');
  function toast(html, ms, raw) {
    if (raw) toastEl.innerHTML = html; else toastEl.textContent = html;
    toastEl.hidden = false; clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.hidden = true; }, ms || 2200);
  }
  function hideToast() { clearTimeout(toastTimer); toastEl.hidden = true; }

  /* ---------- keyboard ---------- */
  var digits = '', digitTimer = 0, digitsGone = 0;   // digitsGone: when a typed number last timed out by itself
  function clearDigits() { digits = ''; clearTimeout(digitTimer); hideToast(); }
  function showDigits() {
    toast('跳到第 <b>' + digits + '</b> 页 · 按回车确认', 4000, true);
    clearTimeout(digitTimer); digitTimer = setTimeout(function () { digits = ''; digitsGone = Date.now(); }, 4000);
  }
  function typeDigit(ch) {
    if (digits.length >= 3) digits = '';
    digits += ch; digitsGone = 0;
    showDigits();
  }
  function closeTop() {
    if (!$('help').hidden) { setHelp(false); return true; }
    if (!grid.hidden) { closeGrid(); return true; }
    if (sideOpen()) { closeSide(); return true; }
    if (digits) { clearDigits(); return true; }
    return false;
  }
  var KEYCODES = { 8: 'Backspace', 13: 'Enter', 27: 'Escape', 32: ' ', 33: 'PageUp', 34: 'PageDown', 35: 'End', 36: 'Home',
    37: 'ArrowLeft', 38: 'ArrowUp', 39: 'ArrowRight', 40: 'ArrowDown', 116: 'F5', 190: '.', 191: '/', 219: '[', 221: ']' };
  function keyOf(e) {
    var k = e.key;
    if (k == null) {   // very old Chromium has no KeyboardEvent.key
      var c = e.keyCode || e.which || 0;
      k = KEYCODES[c] || (c >= 96 && c <= 105 ? String(c - 96) : ((c >= 48 && c <= 57) || (c >= 65 && c <= 90) ? String.fromCharCode(c).toLowerCase() : ''));
    }
    if (k === 'Esc') k = 'Escape';
    if (k === 'Spacebar') k = ' ';
    return k;
  }
  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var k = keyOf(e), t = e.target, tag = t && t.tagName;
    if (!k) return;
    // presenter clickers: the "start slideshow" button sends F5 / Shift+F5. Never reload mid-class.
    if (k === 'F5') { e.preventDefault(); if (!blank.hidden) setBlank(false); if (!fsElement()) toggleFull(); return; }
    if (tag === 'INPUT' && t.type !== 'range') {
      if (e.isComposing || e.keyCode === 229) return;   // the Chinese input method is using this key
      if (t === $('pageInput') && (k === 'PageDown' || k === 'PageUp')) t.blur();   // clicker: leave the box, then page as usual
      else {
        if (k === 'Escape') {
          if (t === searchInput && searchInput.value) { searchInput.value = ''; doSearch(); }   // clear the word, keep the cursor in the box
          else { t.blur(); if (t === searchInput) closeSide(); else t.value = cur; }
          e.preventDefault();
        }
        else if (k === 'Enter') {
          if (t === $('pageInput')) { if (!go(t.value)) t.value = cur; t.blur(); }
          else if (t === searchInput) { var first = searchList.querySelector('.hit'); if (first && !searchList.hidden) first.click(); }
          e.preventDefault();
        }
        return;
      }
    }
    var low = k.length === 1 ? k.toLowerCase() : k;
    // a key held a little too long must not toggle twice
    if (e.repeat && ((low.length === 1 && 'mghfnprb.?/'.indexOf(low) >= 0) || k === 'Backspace' || k === 'Home' || k === 'End' || k === 'Escape')) { e.preventDefault(); return; }
    if (!blank.hidden) {
      // black screen: the audio keys keep working (listen without the text); any other key brings the slide back
      if (low === 'p') toggle(); else if (low === 'r') restart(); else if (low === '[') skip(-5); else if (low === ']') skip(5);
      else setBlank(false);
      e.preventDefault(); return;
    }
    if (k === 'Escape') {
      if (closeTop()) e.preventDefault();
      else if (fsElement()) { toggleFull(); e.preventDefault(); }
      return;
    }
    if (k >= '0' && k <= '9' && k.length === 1) { typeDigit(k); e.preventDefault(); return; }
    if (k === 'Enter') {
      if (digits) { var n = digits; clearDigits(); if (go(n)) { closeGrid(); closeSide(); setHelp(false); } e.preventDefault(); }
      return;   // otherwise let Enter activate the focused button
    }
    var panel = !$('help').hidden || !grid.hidden || sideOpen();
    if (k === 'Backspace') {
      if (digits) { digits = digits.slice(0, -1); if (digits) showDigits(); else clearDigits(); }
      // the number has only just timed out: this Backspace was meant for it, not for the page
      else if (digitsGone && Date.now() - digitsGone < 4000) { digitsGone = 0; toast('刚才输入的页码已取消，请重新输入'); }
      else if (!panel) { if (backTo) goBack(); else prev(); }   // right after a jump: undo it; otherwise previous page, as in PowerPoint
      e.preventDefault(); return;
    }
    switch (low) {
      case 'm':
        if (sideOpen()) closeSide();
        else {
          closeGrid(); setHelp(false); openSide();
          // opened from the keyboard: put the cursor in the search box so typing searches instead of firing
          // shortcuts. Not while a recording is playing: then P must still stop the sound at once.
          if (au.paused || au.ended) { try { searchInput.focus(); } catch (x) {} }
        }
        break;
      case 'g': grid.hidden ? (closeSide(), setHelp(false), openGrid()) : closeGrid(); break;
      case '?': case '/': case 'h': setHelp($('help').hidden); break;
      case 'f': toggleFull(); break;
      case 'b': case '.': if (panel) return; setBlank(true); break;
      case 'n': if (panel) return; setNotes($('notes').hidden); break;
      case 'p': toggle(); break;          // the audio keys work even with a panel open: stopping the sound must be quick
      case '[': skip(-5); break;
      case ']': skip(5); break;
      case 'r': if (panel) return; restart(); break;
      case 'ArrowRight': case 'Right': case 'ArrowDown': case 'Down': case 'PageDown': case ' ':
        if (panel) return; next(); break;
      case 'ArrowLeft': case 'Left': case 'ArrowUp': case 'Up': case 'PageUp':
        if (panel) return; prev(); break;
      case 'Home': if (panel) return; farJump(1); break;
      case 'End': if (panel) return; farJump(N); break;
      default: return;
    }
    e.preventDefault();
  });
  // Space is "next page": never let it re-press whatever button was clicked last
  document.addEventListener('keyup', function (e) {
    var t = e.target;
    if ((e.key === ' ' || e.key === 'Spacebar' || e.keyCode === 32) && t && t.tagName === 'BUTTON') e.preventDefault();
  });
  document.addEventListener('click', function (e) {
    var b = e.target && e.target.closest ? e.target.closest('button') : null;
    if (b && e.detail > 0) b.blur();
  });

  /* ---------- wiring ---------- */
  $('edgePrev').onclick = $('btnPrev').onclick = prev;
  $('edgeNext').onclick = $('btnNext').onclick = next;
  $('btnMenu').onclick = $('where').onclick = function () { sideOpen() ? closeSide() : openSide(); };
  $('sideClose').onclick = scrim.onclick = closeSide;
  $('btnPlay').onclick = toggle;
  $('btnBack').onclick = function () { skip(-5); };
  $('btnFwd').onclick = function () { skip(5); };
  $('btnRestart').onclick = restart;
  $('btnRate').onclick = cycleRate;
  $('btnNotes').onclick = $('notesClose').onclick = function () { setNotes($('notes').hidden); };
  $('btnGrid').onclick = function () { grid.hidden ? openGrid() : closeGrid(); };
  $('gridClose').onclick = closeGrid;
  $('btnFull').onclick = toggleFull;
  $('btnHelp').onclick = function () { setHelp($('help').hidden); };
  $('helpClose').onclick = function () { setHelp(false); };
  $('help').addEventListener('click', function (e) { if (e.target === $('help')) setHelp(false); });
  blank.onclick = function () { setBlank(false); };
  $('pageInput').addEventListener('focus', function () { this.select(); });
  $('pageInput').addEventListener('blur', function () { this.value = cur; });

  // swipe on touch screens (classroom whiteboards); a long press must not open the browser's image menu
  var tx = 0, ty = 0, tt = 0;
  stage.addEventListener('touchstart', function (e) { if (window.HTInk && window.HTInk.isEnabled()) { tt = 0; return; } if (e.touches.length === 1) { tx = e.touches[0].clientX; ty = e.touches[0].clientY; tt = Date.now(); } else tt = 0; });
  stage.addEventListener('touchend', function (e) {
    if (window.HTInk && window.HTInk.isEnabled()) { tt = 0; return; }
    if (!tt || !e.changedTouches.length) return;
    var dx = e.changedTouches[0].clientX - tx, dy = e.changedTouches[0].clientY - ty;
    if (Date.now() - tt < 700 && Math.abs(dx) > 60 && Math.abs(dx) > 1.6 * Math.abs(dy)) { if (dx < 0) next(); else prev(); }
    tt = 0;
  });
  stage.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  window.addEventListener('hashchange', function () {
    var m = /p=(\d+)/.exec(location.hash);
    if (m && +m[1] !== cur && +m[1] >= 1 && +m[1] <= N) show(+m[1]);
  });

  window.HTDeck = {
    page: function () { return cur; }, go: go, layout: layout, wake: wake,
    closePanels: function () { closeSide(); closeGrid(); setHelp(false); setBlank(false); },
    toggleAudio: toggle, fullscreen: toggleFull
  };
  /* ---------- start ---------- */
  $('pageTotal').textContent = N; $('sideCount').textContent = N;
  buildSide(); buildTabs();
  showRate();
  layout();
  var m0 = /p=(\d+)/.exec(location.hash), start = m0 ? +m0[1] : (store('page') | 0);
  show(start >= 1 && start <= N ? start : 1);
  if (!store('seen')) { store('seen', 1); setTimeout(function () { toast('← → 翻页 · P 播放录音 · M 目录 · F 全屏 · ? 全部快捷键', 6000); }, 600); }
})();
