/* Mouse / touch ink, kept apart from the deck and teaching records. */
(function () {
  'use strict';
  var stage = document.getElementById('stage');
  var wrap = document.getElementById('stageWrap');
  var pen = document.getElementById('htPen');
  if (!stage || !wrap || !pen || window.HTInk) return;
  var KEY = 'huitong3-ink-v1', NS = 'http://www.w3.org/2000/svg';
  var WIDTH = 1600, HEIGHT = 900, MAX_STROKES = 160, MAX_POINTS = 600;
  var MAX_TOTAL = 40000, MAX_TEXT = 900000, MAX_HISTORY = 30;
  var maxPage = window.DECK && Number(window.DECK.count) || 2000;
  var pages = {}, history = [], totalPoints = 0;
  var page = window.HTDeck ? window.HTDeck.page() : 1;
  var enabled = false, active = null, storageOK = true, loadWarning = '';
  var lastNotice = '', lastNoticeAt = 0;

  function $(id) { return document.getElementById(id); }
  function pageKey(n) { return String(n); }
  function validPage(n) { return typeof n === 'number' && isFinite(n) && n >= 1 && n <= maxPage && n === Math.floor(n); }
  if (!validPage(page)) page = 1;
  function currentStrokes() { return pages[pageKey(page)] || []; }
  function recount() {
    totalPoints = 0;
    Object.keys(pages).forEach(function (k) {
      pages[k].forEach(function (s) { totalPoints += s.length; });
    });
  }
  function notify(message) {
    var now = Date.now();
    if (message === lastNotice && now - lastNoticeAt < 2500) return;
    lastNotice = message; lastNoticeAt = now;
    if (window.HTTeaching && window.HTTeaching.toast) window.HTTeaching.toast(message);
  }
  function load() {
    try {
      var text = localStorage.getItem(KEY);
      if (!text) return;
      if (text.length > MAX_TEXT) throw new Error('too large');
      var data = JSON.parse(text);
      if (!data || data.version !== 1 || !data.pages || typeof data.pages !== 'object' || Array.isArray(data.pages)) throw new Error('invalid ink');
      var invalid = false;
      Object.keys(data.pages).forEach(function (k) {
        var n = Number(k), source = data.pages[k], clean = [];
        if (!validPage(n) || String(n) !== k || !Array.isArray(source)) { invalid = true; return; }
        if (source.length > MAX_STROKES) { invalid = true; return; }
        source.forEach(function (stroke) {
          if (!Array.isArray(stroke) || !stroke.length || stroke.length > MAX_POINTS || totalPoints + stroke.length > MAX_TOTAL) { invalid = true; return; }
          var valid = stroke.every(function (point) {
            return Array.isArray(point) && point.length === 2 && typeof point[0] === 'number' && typeof point[1] === 'number' && isFinite(point[0]) && isFinite(point[1]) && point[0] >= 0 && point[0] <= WIDTH && point[1] >= 0 && point[1] <= HEIGHT;
          });
          if (!valid) { invalid = true; return; }
          clean.push(stroke.map(function (point) { return [Math.round(point[0] * 10) / 10, Math.round(point[1] * 10) / 10]; }));
          totalPoints += stroke.length;
        });
        if (clean.length) pages[k] = clean;
      });
      if (invalid) loadWarning = '部分旧笔迹数据异常，已保留能读取的笔迹。';
    } catch (error) {
      loadWarning = '旧笔迹暂时无法读取；新笔迹仍可在本次打开中使用。';
      storageOK = false;
    }
  }
  load();

  var svg = document.createElementNS(NS, 'svg');
  svg.id = 'htInkLayer';
  svg.setAttribute('viewBox', '0 0 1600 900');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  var hit = document.createElementNS(NS, 'rect');
  hit.setAttribute('width', '1600'); hit.setAttribute('height', '900');
  hit.setAttribute('fill', 'transparent'); hit.setAttribute('stroke', 'none');
  svg.appendChild(hit);
  var strokesGroup = document.createElementNS(NS, 'g');
  strokesGroup.setAttribute('pointer-events', 'none');
  svg.appendChild(strokesGroup);
  stage.appendChild(svg);

  var bar = $('htInkBar');
  if (!bar) {
    bar = document.createElement('div'); bar.id = 'htInkBar';
    wrap.parentNode.insertBefore(bar, wrap);
  }
  bar.hidden = true;
  bar.setAttribute('role', 'toolbar'); bar.setAttribute('aria-label', '画笔工具');
  bar.innerHTML = '<span class="ht-ink-hint">按住鼠标圈画；结束后可点击课件</span>' +
    '<span id="htInkStatus" role="status" aria-live="polite"></span>' +
    '<div class="ht-ink-actions"><button type="button" id="htInkUndo" title="撤销一笔或恢复清除（Ctrl / ⌘ Z）">撤销</button>' +
    '<button type="button" id="htInkClear">清除本页</button><button type="button" id="htInkDone">结束</button></div>';
  pen.setAttribute('aria-pressed', 'false'); pen.setAttribute('aria-controls', 'htInkBar');

  function updateBar() {
    var count = currentStrokes().length;
    $('htInkStatus').textContent = '第 ' + page + ' 页 · ' + count + ' 笔' + (!storageOK ? ' · 未保存，仅本次有效' : '');
    $('htInkStatus').className = storageOK ? '' : 'ht-ink-unsaved';
    var hasUndo = count > 0 || history.some(function (action) { return action.page === page; });
    $('htInkUndo').disabled = !hasUndo;
    $('htInkClear').disabled = !count && !active;
  }
  function persist() {
    try {
      var text = JSON.stringify({ version: 1, pages: pages });
      if (text.length > MAX_TEXT) throw new Error('ink limit');
      localStorage.setItem(KEY, text);
      storageOK = true; loadWarning = '';
    } catch (error) {
      storageOK = false;
      notify('笔迹未能保存到本机；当前仍可圈画，关闭页面后可能丢失。');
    }
    updateBar();
  }
  function nodeFor(points) {
    var node = document.createElementNS(NS, 'path');
    node.setAttribute('fill', 'none'); node.setAttribute('stroke', '#de3434');
    node.setAttribute('stroke-width', '5'); node.setAttribute('stroke-linecap', 'round');
    node.setAttribute('stroke-linejoin', 'round');
    updatePath(node, points);
    return node;
  }
  function updatePath(node, points) {
    var d = 'M' + points[0][0] + ' ' + points[0][1];
    if (points.length === 1) d += ' l0.01 0';
    else for (var i = 1; i < points.length; i++) d += ' L' + points[i][0] + ' ' + points[i][1];
    node.setAttribute('d', d);
  }
  function render() {
    while (strokesGroup.firstChild) strokesGroup.removeChild(strokesGroup.firstChild);
    currentStrokes().forEach(function (stroke) { strokesGroup.appendChild(nodeFor(stroke)); });
    updateBar();
  }
  function remember(action) {
    history.push(action);
    while (history.length > MAX_HISTORY) history.shift();
    // Clear actions retain the former page for undo; cap retained point memory as well.
    var retained = 0;
    for (var i = history.length - 1; i >= 0; i--) {
      if (history[i].strokes) history[i].strokes.forEach(function (s) { retained += s.length; });
      if (retained > MAX_TOTAL * 2) { history.splice(0, i + 1); break; }
    }
  }
  function finish() {
    if (!active) return;
    var stroke = active;
    active = null;
    if (stroke.captureId != null && svg.releasePointerCapture) {
      try { svg.releasePointerCapture(stroke.captureId); } catch (error) {}
    }
    var key = pageKey(stroke.page);
    var list = pages[key] || [];
    list.push(stroke.points); pages[key] = list;
    remember({ page: stroke.page, type: 'add' });
    recount(); persist();
  }
  function pointAt(x, y) {
    var rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) rect = stage.getBoundingClientRect();
    if (!rect.width || !rect.height || !isFinite(x) || !isFinite(y)) return null;
    return [
      Math.round(Math.max(0, Math.min(WIDTH, (x - rect.left) * WIDTH / rect.width)) * 10) / 10,
      Math.round(Math.max(0, Math.min(HEIGHT, (y - rect.top) * HEIGHT / rect.height)) * 10) / 10
    ];
  }
  function swallow(e) { if (e.cancelable) e.preventDefault(); e.stopPropagation(); }
  function begin(e, x, y, id, captureId) {
    if (!enabled || active) return;
    swallow(e);
    if (currentStrokes().length >= MAX_STROKES) { notify('本页笔迹较多，请先撤销或清除本页。'); return; }
    if (totalPoints >= MAX_TOTAL) { notify('笔迹存储已满，请先清除不再需要的页面笔迹。'); return; }
    var point = pointAt(x, y);
    if (!point) return;
    var node = nodeFor([point]); strokesGroup.appendChild(node);
    active = { page: page, id: id, captureId: captureId, points: [point], node: node, capped: false };
    if (captureId != null && svg.setPointerCapture) { try { svg.setPointerCapture(captureId); } catch (error) {} }
    if (window.HTDeck && window.HTDeck.wake) window.HTDeck.wake();
    updateBar();
  }
  function move(e, x, y, id) {
    if (!enabled || !active || id !== active.id) return;
    swallow(e);
    if (active.capped) return;
    var point = pointAt(x, y);
    if (!point) return;
    var last = active.points[active.points.length - 1];
    var dx = point[0] - last[0], dy = point[1] - last[1];
    if (dx * dx + dy * dy < 2.25) return;
    if (active.points.length >= MAX_POINTS || totalPoints + active.points.length >= MAX_TOTAL) {
      active.capped = true;
      notify('本笔已达到长度上限，请抬起后继续，或清除旧笔迹。');
      return;
    }
    active.points.push(point); updatePath(active.node, active.points);
  }
  function end(e, x, y, id, cancelled) {
    if (!active || id !== active.id) return;
    swallow(e);
    if (!cancelled) move(e, x, y, id);
    finish();
  }
  function undoInk() {
    finish();
    var index = -1;
    for (var i = history.length - 1; i >= 0; i--) if (history[i].page === page) { index = i; break; }
    var list = currentStrokes(), key = pageKey(page);
    if (index >= 0) {
      var action = history.splice(index, 1)[0];
      if (action.type === 'clear') {
        // A restored page must also respect the global bound after edits on other pages.
        var count = 0; action.strokes.forEach(function (s) { count += s.length; });
        if (totalPoints + count > MAX_TOTAL) {
          history.splice(index, 0, action); notify('笔迹空间不足，请先清除其他页面后再恢复。'); updateBar(); return;
        }
        pages[key] = action.strokes;
      } else if (list.length) list.pop();
    } else if (list.length) list.pop();
    else return;
    if (pages[key] && !pages[key].length) delete pages[key];
    recount(); render(); persist();
  }
  function clearInk() {
    finish();
    var list = currentStrokes();
    if (!list.length) return;
    remember({ page: page, type: 'clear', strokes: list });
    delete pages[pageKey(page)];
    recount(); render(); persist();
    notify('已清除本页；可点“撤销”恢复。');
  }
  function layoutChanged() { /* The SVG follows the fitted stage without pixel-sized caches. */ }
  function setEnabled(value) {
    finish(); enabled = !!value;
    bar.hidden = !enabled;
    stage.classList.toggle('ht-inking', enabled);
    pen.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    pen.title = enabled ? '结束画笔' : '画笔圈画';
    if (enabled) {
      if (window.HTDeck && window.HTDeck.closePanels) window.HTDeck.closePanels();
      if (window.HTTeaching && window.HTTeaching.closePanel) window.HTTeaching.closePanel();
      if (loadWarning) notify(loadWarning);
    }
    updateBar();
    if (window.HTDeck && window.HTDeck.wake) window.HTDeck.wake();
    if (window.HTDeck && window.HTDeck.layout) window.HTDeck.layout();
  }
  function pageChanged(n) {
    n = Number(n);
    if (!validPage(n) || n === page) return;
    finish(); page = n; render();
  }
  function anyPanel() {
    if (document.querySelector('.ht-modal:not([hidden])')) return true;
    var side = $('side');
    if (side && side.getAttribute('aria-hidden') === 'false') return true;
    var ids = ['help', 'grid', 'blank'];
    return ids.some(function (id) { var node = $(id); return node && !node.hidden; });
  }

  if (window.PointerEvent) {
    svg.addEventListener('pointerdown', function (e) {
      if (!enabled) return;
      swallow(e);
      if (e.isPrimary === false || (e.button != null && e.button !== 0)) return;
      begin(e, e.clientX, e.clientY, e.pointerId, e.pointerId);
    });
    window.addEventListener('pointermove', function (e) { move(e, e.clientX, e.clientY, e.pointerId); });
    window.addEventListener('pointerup', function (e) { end(e, e.clientX, e.clientY, e.pointerId, false); });
    window.addEventListener('pointercancel', function (e) { end(e, e.clientX, e.clientY, e.pointerId, true); });
    svg.addEventListener('lostpointercapture', function (e) { if (active && active.id === e.pointerId) finish(); });
    ['touchstart', 'touchmove', 'touchend', 'touchcancel'].forEach(function (name) {
      svg.addEventListener(name, function (e) { if (enabled) swallow(e); }, { passive: false });
    });
  } else {
    svg.addEventListener('mousedown', function (e) { if (e.button === 0) begin(e, e.clientX, e.clientY, 'mouse', null); });
    window.addEventListener('mousemove', function (e) { move(e, e.clientX, e.clientY, 'mouse'); });
    window.addEventListener('mouseup', function (e) { end(e, e.clientX, e.clientY, 'mouse', false); });
    svg.addEventListener('touchstart', function (e) {
      if (!enabled) return; swallow(e);
      if (e.touches.length !== 1 || active) return;
      var t = e.changedTouches[0]; if (t) begin(e, t.clientX, t.clientY, 'touch-' + t.identifier, null);
    }, { passive: false });
    svg.addEventListener('touchmove', function (e) {
      if (!enabled) return; swallow(e);
      for (var i = 0; i < e.changedTouches.length; i++) {
        var t = e.changedTouches[i]; move(e, t.clientX, t.clientY, 'touch-' + t.identifier);
      }
    }, { passive: false });
    ['touchend', 'touchcancel'].forEach(function (name) {
      svg.addEventListener(name, function (e) {
        if (!enabled) return; swallow(e);
        for (var i = 0; i < e.changedTouches.length; i++) {
          var t = e.changedTouches[i]; end(e, t.clientX, t.clientY, 'touch-' + t.identifier, name === 'touchcancel');
        }
      }, { passive: false });
    });
  }
  ['click', 'dblclick', 'contextmenu', 'dragstart'].forEach(function (name) {
    svg.addEventListener(name, function (e) { if (enabled) swallow(e); });
  });
  pen.addEventListener('click', function () { setEnabled(!enabled); });
  $('htInkDone').addEventListener('click', function () { setEnabled(false); pen.focus(); });
  $('htInkUndo').addEventListener('click', undoInk);
  $('htInkClear').addEventListener('click', clearInk);
  document.addEventListener('keydown', function (e) {
    if (!enabled || e.isComposing || e.keyCode === 229 || anyPanel()) return;
    var target = e.target, tag = target && target.tagName;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag) || (target && target.isContentEditable)) return;
    var key = e.key || (e.keyCode === 27 ? 'Escape' : e.keyCode === 90 ? 'z' : '');
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && String(key).toLowerCase() === 'z') {
      e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) undoInk();
    } else if ((key === 'Escape' || key === 'Esc') && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault(); e.stopImmediatePropagation(); setEnabled(false); pen.focus();
    }
  }, true);
  window.addEventListener('blur', finish);
  window.addEventListener('pagehide', finish);
  window.addEventListener('beforeunload', finish);
  document.addEventListener('visibilitychange', function () { if (document.hidden) finish(); });
  document.addEventListener('pointerdown', function (e) { if (active && !svg.contains(e.target)) finish(); }, true);
  if (window.MutationObserver) {
    var observer = new MutationObserver(function () { if (active && anyPanel()) finish(); });
    observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['hidden', 'aria-hidden'] });
  }
  window.HTInk = {
    pageChanged: pageChanged, layoutChanged: layoutChanged,
    isEnabled: function () { return enabled; }, isDrawing: function () { return !!active; }, finish: finish,
    getState: function () { return { enabled: enabled, page: page, drawing: !!active, pages: JSON.parse(JSON.stringify(pages)), storageOK: storageOK }; },
    storageKey: KEY
  };
  render();
})();
