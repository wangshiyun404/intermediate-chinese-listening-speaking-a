/* Offline classroom picker. The roster and persistence belong to teaching-data.js / teaching.js. */
(function () {
  'use strict';
  var api = window.HTTeaching;
  if (!api) { return; }
  var source = window.TEACHING_SOURCE || {};
  var students = [];
  var byId = {};
  (source.students || []).forEach(function (student) {
    if (!student || !student.id || !student.name || byId[student.id]) { return; }
    var item = { id: String(student.id), name: String(student.name) };
    students.push(item);
    byId[item.id] = item;
  });
  var resultKind = 'previous';
  var confirmRound = false;
  var panel = document.createElement('div');
  panel.id = 'htPicker';
  panel.className = 'ht-modal';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-labelledby', 'htPickerTitle');
  panel.setAttribute('tabindex', '-1');
  panel.hidden = true;
  panel.innerHTML =
    '<div class="ht-dialog ht-picker-dialog">' +
      '<div class="ht-picker-heading"><div><p class="ht-picker-eyebrow">课堂互动</p><h2 id="htPickerTitle">随机抽问</h2></div>' +
      '<button type="button" class="ht-close" id="htPickerClose" aria-label="关闭随机抽问">×</button></div>' +
      '<div class="ht-picker-meta"><span id="htPickerRound" class="ht-picker-round"></span><span id="htPickerCounts"></span></div>' +
      '<div class="ht-picker-result" id="htPickerResult" role="status" aria-live="polite" aria-atomic="true">' +
        '<div class="ht-picker-result-label" id="htPickerResultLabel"></div>' +
        '<div class="ht-picker-name" id="htPickerName"></div>' +
        '<div class="ht-picker-result-note" id="htPickerResultNote"></div>' +
      '</div>' +
      '<div class="ht-picker-actions"><button type="button" class="ht-button ht-primary ht-picker-draw" id="htPickerDraw">抽取一位同学</button>' +
        '<button type="button" class="ht-button" id="htPickerUndo">撤销最近一次</button></div>' +
      '<p class="ht-picker-pool-note" id="htPickerPoolNote"></p>' +
      '<div class="ht-picker-round-actions"><span class="ht-muted">本轮抽完前不重复。</span><button type="button" class="ht-button" id="htPickerNewRound">开始新一轮</button></div>' +
      '<div class="ht-picker-confirm" id="htPickerConfirm" hidden><p id="htPickerConfirmText"></p><div class="ht-row"><button type="button" class="ht-button ht-primary" id="htPickerConfirmRound">确认开始新一轮</button><button type="button" class="ht-button" id="htPickerCancelRound">取消</button></div></div>' +
      '<details class="ht-picker-details" id="htPickerHistory"><summary>本轮抽取情况 <span id="htPickerHistoryCount"></span></summary>' +
        '<div class="ht-picker-history-grid"><section><h3 id="htPickerDrawnTitle">已抽取</h3><div class="ht-picker-chips" id="htPickerDrawn"></div></section>' +
        '<section><h3 id="htPickerWaitingTitle">还未抽取</h3><div class="ht-picker-chips" id="htPickerWaiting"></div></section></div></details>' +
      '<details class="ht-picker-details" id="htPickerRoster"><summary>管理参与名单 <span id="htPickerRosterCount"></span></summary>' +
        '<p class="ht-picker-roster-help">勾选表示参与抽问；取消勾选可临时排除缺席同学。设置会保留到下次打开。</p>' +
        '<div class="ht-picker-roster-tools"><button type="button" class="ht-button" id="htPickerIncludeAll">恢复全部参与</button><button type="button" class="ht-button" id="htPickerExcludeAll">全部暂不参与</button></div>' +
        '<div class="ht-picker-roster-list" id="htPickerRosterList"></div></details>' +
      '<p class="ht-picker-footnote">抽问记录会自动保存。</p>' +
    '</div>';
  document.body.appendChild(panel);
  api.registerPanel('picker', panel);

  function el(id) { return document.getElementById(id); }
  function uniqueKnown(list) {
    var seen = {};
    return (Array.isArray(list) ? list : []).filter(function (id) {
      if (!byId[id] || seen[id]) { return false; }
      seen[id] = true;
      return true;
    });
  }
  function getPicker() {
    var state = api.getState() || {};
    var p = state.picker || {};
    var drawn = uniqueKnown(p.drawn);
    return {
      drawn: drawn,
      excluded: uniqueKnown(p.excluded),
      last: byId[p.last] && drawn.indexOf(p.last) !== -1 ? p.last : (drawn.length ? drawn[drawn.length - 1] : null),
      round: Math.max(1, Math.floor(Number(p.round) || 1))
    };
  }
  function remaining(p) {
    return students.filter(function (student) {
      return p.drawn.indexOf(student.id) === -1 && p.excluded.indexOf(student.id) === -1;
    });
  }
  function save(p, label) {
    api.change(function (draft) { draft.picker = p; }, label);
  }
  function randomIndex(length) {
    if (window.crypto && window.crypto.getRandomValues && window.Uint32Array) {
      var bucket = new Uint32Array(1);
      var limit = Math.floor(4294967296 / length) * length;
      do { window.crypto.getRandomValues(bucket); } while (bucket[0] >= limit);
      return bucket[0] % length;
    }
    return Math.floor(Math.random() * length);
  }
  function paintNames(target, ids, emptyText) {
    target.textContent = '';
    if (!ids.length) {
      var empty = document.createElement('span');
      empty.className = 'ht-picker-empty';
      empty.textContent = emptyText;
      target.appendChild(empty);
      return;
    }
    ids.forEach(function (id) {
      var chip = document.createElement('span');
      chip.className = 'ht-picker-chip';
      chip.textContent = byId[id].name;
      target.appendChild(chip);
    });
  }

  var rosterRows = [];
  students.forEach(function (student) {
    var row = document.createElement('label');
    row.className = 'ht-picker-student';
    var check = document.createElement('input');
    check.type = 'checkbox';
    check.setAttribute('aria-label', student.name + '参与抽问');
    var name = document.createElement('span');
    name.className = 'ht-picker-student-name';
    name.textContent = student.name;
    var status = document.createElement('span');
    status.className = 'ht-picker-student-status';
    row.appendChild(check);
    row.appendChild(name);
    row.appendChild(status);
    check.addEventListener('change', function () {
      var p = getPicker();
      var index = p.excluded.indexOf(student.id);
      if (check.checked && index !== -1) { p.excluded.splice(index, 1); }
      if (!check.checked && index === -1) { p.excluded.push(student.id); }
      save(p, check.checked ? '恢复参与抽问' : '临时排除学生');
    });
    el('htPickerRosterList').appendChild(row);
    rosterRows.push({ id: student.id, row: row, check: check, status: status });
  });

  window.addEventListener('ht:roster-change', function () {
    (source.students || []).forEach(function (s) { if (s && byId[s.id] && s.name) { byId[s.id].name = String(s.name); } });
    rosterRows.forEach(function (r) { var n = r.row.querySelector('.ht-picker-student-name'); if (n) { n.textContent = byId[r.id].name; } r.check.setAttribute('aria-label', byId[r.id].name + '参与抽问'); });
    render();
  });

  function render() {
    var p = getPicker();
    var pool = remaining(p);
    var count = students.length;
    var name = p.last && byId[p.last] ? byId[p.last].name : '';
    el('htPickerRound').textContent = '第 ' + p.round + ' 轮';
    el('htPickerCounts').textContent = '已抽 ' + p.drawn.length + ' 人 · 待抽 ' + pool.length + ' 人 · 暂不参与 ' + p.excluded.length + ' 人';
    el('htPickerResultLabel').textContent = name ? (resultKind === 'current' ? '本次抽到' : '上次抽到') : '准备好，一起参与';
    el('htPickerName').textContent = name || (count ? '下一位，会是谁？' : '名单尚未载入');
    el('htPickerName').className = 'ht-picker-name' + (!name ? ' ht-picker-placeholder' : '') + (name.length > 12 ? ' ht-picker-long-name' : '');
    el('htPickerResultNote').textContent = name ? (resultKind === 'current' ? '请这位同学回答' : '这是之前的抽取结果；可继续抽取下一位') : (count ? '点击下方按钮，随机邀请一位同学' : '请检查学生名单数据是否已正确载入');
    el('htPickerDraw').disabled = !pool.length;
    el('htPickerDraw').textContent = pool.length ? '抽取一位同学' : (count && p.excluded.length === count ? '暂无参与同学' : (count ? '本轮可参与同学已抽完' : '暂无可用名单'));
    el('htPickerUndo').disabled = !p.drawn.length;
    el('htPickerNewRound').disabled = !count || !p.drawn.length;
    el('htPickerIncludeAll').disabled = !p.excluded.length;
    el('htPickerExcludeAll').disabled = !count || p.excluded.length === count;
    el('htPickerHistoryCount').textContent = '已抽 ' + p.drawn.length + ' / 待抽 ' + pool.length;
    el('htPickerRosterCount').textContent = (count - p.excluded.length) + ' / ' + count + ' 人参与';
    el('htPickerDrawnTitle').textContent = '已抽取（' + p.drawn.length + '）';
    el('htPickerWaitingTitle').textContent = '还未抽取（' + pool.length + '）';
    var poolNote = '';
    if (!count) { poolNote = '暂无可用名单，载入后即可开始抽问。'; }
    else if (p.excluded.length === count) { poolNote = '所有同学暂不参与。请在“管理参与名单”中恢复参与。'; }
    else if (!pool.length) { poolNote = '本轮可参与同学已全部抽完。可开始新一轮，或恢复尚未抽到的同学参与。'; }
    else { poolNote = '还有 ' + pool.length + ' 位同学等待参与。'; }
    el('htPickerPoolNote').textContent = poolNote;
    el('htPickerPoolNote').className = 'ht-picker-pool-note' + (!pool.length ? ' ht-picker-pool-empty' : '');
    paintNames(el('htPickerDrawn'), p.drawn, '本轮尚未抽取');
    paintNames(el('htPickerWaiting'), pool.map(function (student) { return student.id; }), '暂无待抽同学');
    rosterRows.forEach(function (entry) {
      var excluded = p.excluded.indexOf(entry.id) !== -1;
      var drawn = p.drawn.indexOf(entry.id) !== -1;
      entry.check.checked = !excluded;
      entry.row.className = 'ht-picker-student' + (excluded ? ' ht-picker-student-excluded' : '');
      entry.status.textContent = excluded ? (drawn ? '已抽 · 暂不参与' : '暂不参与') : (drawn ? '本轮已抽' : '等待参与');
    });
    el('htPickerConfirm').hidden = !confirmRound;
    el('htPickerConfirmText').textContent = '开始第 ' + (p.round + 1) + ' 轮后，本轮已抽记录将清空。' + (p.excluded.length ? '已排除的 ' + p.excluded.length + ' 位同学仍暂不参与，可在名单中恢复全部。' : '全班同学将重新参与随机抽取。');
  }

  function revealResult() {
    var result = el('htPickerResult');
    result.classList.remove('ht-picker-reveal');
    void result.offsetWidth;
    result.classList.add('ht-picker-reveal');
  }
  el('htPickerDraw').addEventListener('click', function () {
    var p = getPicker();
    var pool = remaining(p);
    if (!pool.length) { return; }
    var student = pool[randomIndex(pool.length)];
    p.drawn.push(student.id);
    p.last = student.id;
    resultKind = 'current';
    confirmRound = false;
    save(p, '已抽取一位同学');
    revealResult();
  });
  el('htPickerUndo').addEventListener('click', function () {
    var p = getPicker();
    if (!p.drawn.length) { return; }
    var id = p.drawn.pop();
    p.last = p.drawn.length ? p.drawn[p.drawn.length - 1] : null;
    resultKind = 'previous';
    confirmRound = false;
    save(p, '撤销最近一次抽取');
    api.toast('已撤销抽取：' + byId[id].name + (p.excluded.indexOf(id) === -1 ? '，已回到待抽名单' : '，该同学仍暂不参与'));
  });
  el('htPickerNewRound').addEventListener('click', function () {
    if (!getPicker().drawn.length) { return; }
    confirmRound = true;
    render();
    el('htPickerConfirmRound').focus();
  });
  el('htPickerCancelRound').addEventListener('click', function () {
    confirmRound = false;
    render();
    el('htPickerNewRound').focus();
  });
  el('htPickerConfirmRound').addEventListener('click', function () {
    var p = getPicker();
    if (!confirmRound) { return; }
    p.drawn = [];
    p.last = null;
    p.round += 1;
    resultKind = 'previous';
    confirmRound = false;
    save(p, '开始新一轮抽问');
    api.toast('已开始第 ' + p.round + ' 轮' + (p.excluded.length ? '；暂不参与的名单已保留' : ''));
    if (!el('htPickerDraw').disabled) { el('htPickerDraw').focus(); }
    else { panel.focus(); }
  });
  el('htPickerIncludeAll').addEventListener('click', function () {
    var p = getPicker();
    p.excluded = [];
    save(p, '恢复全部学生参与');
    api.toast('已恢复全部参与；本轮已抽同学仍不会重复抽取');
  });
  el('htPickerExcludeAll').addEventListener('click', function () {
    var p = getPicker();
    p.excluded = students.map(function (student) { return student.id; });
    save(p, '全部学生暂不参与');
    api.toast('已设为全部暂不参与；可勾选实际到场同学，或恢复全部参与');
  });
  el('htPickerClose').addEventListener('click', function () { api.closePanel(); });
  var openButton = el('htOpenPicker');
  if (openButton) {
    openButton.addEventListener('click', function () {
      resultKind = 'previous';
      confirmRound = false;
      render();
      api.openPanel('picker', openButton);
    });
  }
  api.subscribe(function () { render(); });
  render();
})();
