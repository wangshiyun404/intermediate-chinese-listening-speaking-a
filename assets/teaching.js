(function () {
  'use strict';
  var C = window.TEACHING_SOURCE, Deck = window.HTDeck;
  if (!C || !Deck) return;
  var KEY = 'huitong3-teaching-2026-v1', COURSE = 'SIE2141B-2026-fall', FORMAT = 'huitong3-teaching-backup';
  var sessions = C.sessions, ids = sessions.map(function (s) { return s.id; });
  var studentIds = C.students.map(function (s) { return s.id; });
  var panels = {}, opened = null, returnFocus = null, subscribers = [], undo = [], storageOK = true;
  var selected, filter = 'all', toastTimer, pendingImport = null, listenersReady = false;
  var statusNames = { unrecorded: '未记录', 'in-progress': '进行中', complete: '已完成' };
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function button(text, cls, fn, id) { var b = el('button', 'ht-button ' + (cls || ''), text); b.type = 'button'; if (fn) b.onclick = fn; if (id) b.id = id; return b; }
  function today() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function dateText(d) { if (!d) return '日期待定'; var a = d.split('-'), dt = new Date(+a[0], +a[1] - 1, +a[2]); return a[0] + '/' + a[1] + '/' + a[2] + ' 周' + '日一二三四五六'[dt.getDay()]; }
  function validDate(d) { if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false; var a = d.split('-'), n = new Date(+a[0], +a[1] - 1, +a[2]); return n.getFullYear() === +a[0] && n.getMonth() + 1 === +a[1] && n.getDate() === +a[2]; }
  function validPage(p) { return p === null || (typeof p === 'number' && p === Math.floor(p) && p >= 1 && p <= window.DECK.count); }
  function textOK(t, max) { return typeof t === 'string' && t.length <= max; }
  function fail() { throw new Error('备份格式或数据不符合本课程要求，未覆盖现有记录。'); }
  function empty() { return { activeSession: null, bookmark: null, records: {}, overrides: {}, picker: { drawn: [], excluded: [], last: null, round: 1 } }; }
  function validState(x) {
    if (!x || typeof x !== 'object' || Array.isArray(x)) fail();
    var out = empty();
    if (x.activeSession !== null && ids.indexOf(x.activeSession) < 0) fail();
    out.activeSession = x.activeSession;
    function dict(d) { if (!d || typeof d !== 'object' || Array.isArray(d) || Object.keys(d).some(function (k) { return ids.indexOf(k) < 0; })) fail(); }
    dict(x.records); dict(x.overrides);
    Object.keys(x.records).forEach(function (id) {
      var r = x.records[id];
      if (!r || !Object.prototype.hasOwnProperty.call(statusNames, r.status) || !validPage(r.page) || !textOK(r.note, 4000) || !(r.actualDate === '' || validDate(r.actualDate)) || !textOK(r.updatedAt, 80)) fail();
      out.records[id] = { status:r.status, page:r.page, note:r.note, actualDate:r.actualDate, updatedAt:r.updatedAt };
    });
    Object.keys(x.overrides).forEach(function (id) {
      var o = x.overrides[id];
      if (!o || !validDate(o.date) || !textOK(o.period, 60) || !textOK(o.time, 60) || !textOK(o.title, 180) || !o.title.trim() || !Array.isArray(o.content) || o.content.length > 40 || o.content.some(function (t) { return !textOK(t, 2000); }) || !validPage(o.startPage) || !validPage(o.endPage) || (o.startPage && o.endPage && o.startPage > o.endPage) || typeof o.resolved !== 'boolean') fail();
      out.overrides[id] = { date:o.date, period:o.period, time:o.time, title:o.title, content:o.content.slice(), startPage:o.startPage, endPage:o.endPage, resolved:o.resolved };
    });
    if (x.bookmark !== null) {
      var b = x.bookmark;
      if (!b || (b.sessionId !== null && ids.indexOf(b.sessionId) < 0) || b.page === null || !validPage(b.page) || !textOK(b.savedAt, 80)) fail();
      out.bookmark = { sessionId:b.sessionId, page:b.page, savedAt:b.savedAt };
    }
    var p = x.picker;
    if (!p || !Array.isArray(p.drawn) || !Array.isArray(p.excluded)) fail();
    [p.drawn, p.excluded].forEach(function (list) { if (list.length > studentIds.length || list.some(function (s, i) { return studentIds.indexOf(s) < 0 || list.indexOf(s) !== i; })) fail(); });
    if (p.last !== null && p.drawn.indexOf(p.last) < 0) fail();
    if (typeof p.round !== 'number' || p.round < 1 || p.round > 1000000 || p.round !== Math.floor(p.round)) fail();
    out.picker = { drawn:p.drawn.slice(), excluded:p.excluded.slice(), last:p.last, round:p.round };
    return out;
  }
  function unpack(obj) { if (!obj || obj.format !== FORMAT || obj.version !== 1 || obj.courseId !== COURSE) fail(); return validState(obj.data); }
  function envelope(data) { return { format:FORMAT, version:1, courseId:COURSE, exportedAt:new Date().toISOString(), data:data }; }
  var state = empty(), badStored = false;
  try {
    var raw = localStorage.getItem(KEY);
    if (raw) state = unpack(JSON.parse(raw));
    var probe = KEY + '-probe'; localStorage.setItem(probe, '1'); localStorage.removeItem(probe);
  } catch (e) { storageOK = false; badStored = !!raw; }
  function save() {
    // Never overwrite an unreadable original silently. Export is still available.
    if (badStored) return false;
    try { localStorage.setItem(KEY, JSON.stringify(envelope(state))); storageOK = true; }
    catch (e) { storageOK = false; }
    return storageOK;
  }
  function warning() {
    var w = $('htStorageWarning');
    w.hidden = storageOK;
    w.textContent = badStored ? '原保存记录无法读取，已保留原数据。请在“课程安排 → 更多设置”导出记录，或恢复可靠备份。' : '此浏览器暂时不能保存进度。关闭前请在“课程安排 → 更多设置”导出记录。';
    Deck.layout();
  }
  function toast(t) { var a = $('htToast'); a.textContent = t; a.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(function () { a.hidden = true; }, 3600); }
  function notify() { warning(); renderToolbar(); if (listenersReady) { renderProgress(); renderAgenda(); } subscribers.forEach(function (f) { f(state); }); }
  function change(fn, label) {
    var draft = clone(state);
    try { fn(draft); draft = validState(draft); } catch (e) { toast(e.message || '未能保存，请检查输入。'); return false; }
    undo.push({ data:clone(state), label:label || '上一步操作' }); if (undo.length > 30) undo.shift();
    state = draft; save(); notify(); return true;
  }
  function record(id) { return state.records[id] || { status:'unrecorded', page:null, note:'', actualDate:'', updatedAt:'' }; }
  function session(id) { var s = sessions[ids.indexOf(id)], o = state.overrides[id]; if (!s) return null; var n = clone(s); if (o) Object.keys(o).forEach(function (k) { n[k] = o[k]; }); return n; }
  function ordered() { return sessions.map(function (s) { return session(s.id); }).sort(function (a,b) { return a.date.localeCompare(b.date) || a.number - b.number; }); }
  function recommended() { var list = ordered(), d = today(); return list.filter(function (s) { return s.date >= d; })[0] || list[list.length - 1]; }
  function nextUnfinished(id) { var list = ordered(), at = list.map(function (s) { return s.id; }).indexOf(id); return list.slice(at + 1).filter(function (s) { return record(s.id).status !== 'complete'; })[0]; }
  function description(p) { var s = window.DECK.slides[p - 1]; return '第 ' + p + ' 页 · ' + (s.l ? '第' + s.l + '课 · ' : '') + s.t; }
  function resume() { if (!state.bookmark) return; closePanel(); Deck.go(state.bookmark.page); toast('已回到上次标记：' + description(state.bookmark.page)); }
  function quickMark() {
    var previous = state.bookmark ? clone(state.bookmark) : null, p = Deck.page();
    if (!change(function (d) { d.bookmark = {sessionId:null, page:p, savedAt:new Date().toISOString()}; }, '记住授课页')) return;
    toast(storageOK ? '已记住第 ' + p + ' 页，下次点“继续上次”。' : '已临时记住第 ' + p + ' 页；关闭前请导出记录。');
    var undoMark = button('撤销','ht-toast-undo',function () {
      change(function (d) { d.bookmark = previous; }, '撤销记页');
      toast(previous ? '已恢复上次标记：第 ' + previous.page + ' 页。' : '已撤销这次标记。');
    },'htUndoMark'); $('htToast').appendChild(undoMark);
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { $('htToast').hidden = true; }, 8000);
  }
  function registerPanel(id, node) { panels[id] = node; node.hidden = true; node.addEventListener('click', function (e) { if (e.target === node) closePanel(); }); }
  function openPanel(id, trigger) {
    if (!panels[id]) return;
    Deck.closePanels(); if (opened) panels[opened].hidden = true;
    opened = id; returnFocus = trigger || document.activeElement;
    panels[id].hidden = false;
    $('app').setAttribute('aria-hidden', 'true');
    if (id === 'progress') renderProgress();
    if (id === 'agenda') { renderAgenda(); setTimeout(scrollAgenda, 0); }
    if (id === 'info') renderInfo();
    setTimeout(function () { var focus = panels[id].querySelector('[data-autofocus], .ht-close, button'); if (focus) focus.focus(); else panels[id].focus(); }, 0);
  }
  function closePanel() { if (!opened) return; panels[opened].hidden = true; opened = null; $('app').removeAttribute('aria-hidden'); if (returnFocus && returnFocus.focus) returnFocus.focus(); Deck.wake(); }
  // Capture keeps new inputs and modal controls isolated from the deck's shortcuts.
  document.addEventListener('keydown', function (e) {
    if (opened) {
      if (e.key === 'F5') { e.preventDefault(); if (!(document.fullscreenElement || document.webkitFullscreenElement)) Deck.fullscreen(); e.stopImmediatePropagation(); return; }
      if (e.key === 'Escape' && !e.isComposing) { e.preventDefault(); closePanel(); }
      if (e.key === 'Tab') {
        var all = Array.prototype.filter.call(panels[opened].querySelectorAll('button, input, select, textarea, summary, [tabindex="0"]'), function (n) { return !n.disabled && n.getClientRects().length; });
        if (all.length) { var a = all[0], z = all[all.length - 1]; if (e.shiftKey && (document.activeElement === a || !panels[opened].contains(document.activeElement))) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && (document.activeElement === z || !panels[opened].contains(document.activeElement))) { e.preventDefault(); a.focus(); } }
      }
      e.stopImmediatePropagation(); return;
    }
    var tag = e.target.tagName;
    if (e.ctrlKey || e.metaKey || e.altKey || /INPUT|TEXTAREA|SELECT/.test(tag) || e.target.isContentEditable || e.isComposing || !$('blank').hidden) return;
    var k = e.key && e.key.toLowerCase();
    if (['t','k','q'].indexOf(k) >= 0) {
      e.preventDefault(); e.stopImmediatePropagation(); if (e.repeat) return;
      if (k === 't') openPanel('agenda', $('htOpenProgress'));
      if (k === 'k') quickMark();
      if (k === 'q') $('htOpenPicker').click();
    }
  }, true);
  document.addEventListener('keyup', function (e) { if (opened) e.stopImmediatePropagation(); }, true);
  function modal(id, title, subtitle) {
    var root = el('div','ht-modal'); root.id = id; root.hidden = true; root.setAttribute('role','dialog'); root.setAttribute('aria-modal','true'); root.tabIndex = -1;
    var card = el('div','ht-dialog'), head = el('header','ht-head'), words = el('div');
    var h = el('h1',null,title); h.id = id + 'Title'; root.setAttribute('aria-labelledby',h.id);
    words.appendChild(h); words.appendChild(el('p',null,subtitle)); head.appendChild(words);
    var close = button('×','ht-close',closePanel); close.setAttribute('aria-label','关闭' + title); head.appendChild(close); card.appendChild(head); root.appendChild(card); document.body.appendChild(root); return { root:root, card:card };
  }
  var toastNode = el('div','ht-toast'); toastNode.id = 'htToast'; toastNode.setAttribute('role','status'); toastNode.setAttribute('aria-live','polite'); toastNode.hidden = true; document.body.appendChild(toastNode);
  var progress = modal('htProgress','记录与调课','需要修改历史记录或教学安排时使用'); registerPanel('progress',progress.root);
  var summary = el('div','ht-summary'); summary.id='htSummary'; progress.card.appendChild(summary);
  var body = el('div','ht-body'), left=el('div','ht-list-pane'), controls=el('div','ht-list-controls');
  var selectFilter=el('select'); selectFilter.id='htFilter'; selectFilter.setAttribute('aria-label','筛选课次');
  [['all','全部 29 次课'],['unfinished','未完成'],['complete','已完成'],['pending','待调整']].forEach(function (v) { var o=el('option',null,v[1]); o.value=v[0]; selectFilter.appendChild(o); });
  selectFilter.onchange=function () { filter=this.value; renderList(); };
  controls.appendChild(selectFilter); controls.appendChild(button('定位近期','',function () { selected=recommended().id; renderProgress(); scrollSelected(); },'htNear'));
  left.appendChild(controls); var list=el('div','ht-session-list'); list.id='htSessionList'; left.appendChild(list); body.appendChild(left);
  var detail=el('section','ht-detail'); detail.id='htDetail'; body.appendChild(detail); progress.card.appendChild(body);
  var footer=el('footer','ht-footer');
  footer.appendChild(button('撤销上一步','',function () { var u=undo.pop(); if (!u) return; state=u.data; save(); notify(); toast('已撤销：'+u.label); },'htUndo'));
  footer.appendChild(button('返回课程安排','',function () { openPanel('agenda',$('htOpenProgress')); },'htBackAgenda'));
  var saveLabel=el('span','ht-muted'); saveLabel.id='htSaveLabel'; footer.appendChild(saveLabel); progress.card.appendChild(footer);
  var info=modal('htInfo','更多设置','日常上课无需进入这里'); registerPanel('info',info.root); var infoBody=el('div','ht-secondary'); infoBody.id='htInfoBody'; info.card.appendChild(infoBody);
  var agenda=modal('htAgenda','课程安排','中级汉语听说 A · 2026 秋'); registerPanel('agenda',agenda.root);
  agenda.card.className += ' ht-agenda-dialog';
  var agendaSummary=el('div','ht-agenda-summary');agendaSummary.id='htAgendaSummary';agenda.card.appendChild(agendaSummary);
  var agendaList=el('div','ht-agenda-list');agendaList.id='htAgendaList';agenda.card.appendChild(agendaList);
  var agendaFooter=el('footer','ht-footer');
  agendaFooter.appendChild(button('更多设置','',function(){openPanel('info',$('htOpenProgress'));},'htMore'));
  agendaFooter.appendChild(el('span','ht-muted','“已上完”可选；记页只需点顶部“讲到这里”。'));
  agenda.card.appendChild(agendaFooter);
  var upload=el('input'); upload.type='file'; upload.accept='.json,application/json'; upload.id='htImportFile'; upload.hidden=true; document.body.appendChild(upload);
  function pending(s) { return !!(s.pending || s.conflict) && !s.resolved; }
  function scrollSelected() { var item=list.querySelector('[data-session="'+selected+'"]'); if (item) item.scrollIntoView({block:'nearest',inline:'nearest'}); }
  function renderToolbar() {
    $('htCompletion').hidden=true;
    $('htContext').textContent=state.bookmark ? '已记住第 '+state.bookmark.page+' 页 · '+window.DECK.slides[state.bookmark.page-1].t : '讲完点“讲到这里”，就能记住进度';
    $('htContext').title=state.bookmark ? description(state.bookmark.page) : '无需选择课次，直接记住当前页';
    $('htResume').disabled=!state.bookmark;
    $('htResume').textContent=state.bookmark?'继续上次 · '+state.bookmark.page+'页':'继续上次';
    $('htResume').title=state.bookmark?'返回上次标记：'+description(state.bookmark.page):'尚未标记授课位置';
    $('htQuickMark').title='记住当前第 '+Deck.page()+' 页（K）';
  }
  function scrollAgenda() {
    var row=agendaList.querySelector('[data-agenda="'+recommended().id+'"]');
    if(row) agendaList.scrollTop=Math.max(0,row.offsetTop-8);
  }
  function renderAgenda() {
    var oldScroll=agendaList.scrollTop, expanded={};
    Array.prototype.forEach.call(agendaList.querySelectorAll('details[open]'),function(n){expanded[n.getAttribute('data-detail')]=true;});
    agendaSummary.innerHTML='';
    var done=ids.filter(function(id){return record(id).status==='complete';}).length, near=recommended();
    agendaSummary.appendChild(el('span',null,'已上完 '+done+' / '+sessions.length+' 次'));
    agendaSummary.appendChild(button('看近期安排','',scrollAgenda,'htAgendaNear'));
    agendaList.innerHTML='';
    ordered().forEach(function(s){
      var r=record(s.id), row=el('article','ht-agenda-card'+(s.id===near.id?' ht-agenda-near':'')+(r.status==='complete'?' ht-agenda-done':''));row.setAttribute('data-agenda',s.id);
      var top=el('div','ht-agenda-date');top.appendChild(el('strong',null,dateText(s.date)));
      if(s.id===near.id)top.appendChild(el('span','ht-badge','近期计划'));
      if(pending(s))top.appendChild(el('span','ht-badge pending',s.examDateConfirmed?'部分内容待调整':'待调整'));
      row.appendChild(top);row.appendChild(el('h2',null,s.title));row.appendChild(el('p','ht-muted',s.period+' · '+s.time+' · 第'+s.number+'次课'));
      var actions=el('div','ht-agenda-actions'),label=el('label','ht-done-check'),check=el('input');check.type='checkbox';check.checked=r.status==='complete';check.setAttribute('aria-label',dateText(s.date)+' '+s.title+' 已上完');
      check.onchange=function(){var completed=this.checked;change(function(d){var rec=clone(record(s.id));rec.status=completed?'complete':(rec.page!==null?'in-progress':'unrecorded');if(completed&&!rec.actualDate)rec.actualDate=today();rec.updatedAt=new Date().toISOString();d.records[s.id]=rec;},completed?'勾选已上完':'取消已上完');};
      label.appendChild(check);label.appendChild(document.createTextNode('已上完'));actions.appendChild(label);
      if(s.startPage)actions.appendChild(button('打开课件','ht-primary',function(){closePanel();Deck.go(s.startPage);},'htOpen-'+s.id));
      else actions.appendChild(el('span','ht-muted','本次材料需另备'));
      row.appendChild(actions);
      var det=el('details','ht-agenda-detail');det.setAttribute('data-detail',s.id);det.open=!!expanded[s.id];det.appendChild(el('summary',null,'教学内容'));
      if((s.flags||[]).length&&!s.resolved)det.appendChild(el('div','ht-alert',alertText(s)));
      var ul=el('ul','ht-content');(s.content||[]).forEach(function(t){ul.appendChild(el('li',null,t));});det.appendChild(ul);
      var links=el('div','ht-links');(s.links||[]).forEach(function(l){if(l.page&&validPage(l.page))links.appendChild(button(l.label+' · '+l.page+'页','ht-link',function(){closePanel();Deck.go(l.page);}));});det.appendChild(links);
      if(r.note)det.appendChild(el('p','ht-agenda-note','备注：'+r.note));
      det.appendChild(button('备注 / 调整安排','ht-subtle',function(){selected=s.id;openPanel('progress',$('htOpenProgress'));},'htEdit-'+s.id));row.appendChild(det);agendaList.appendChild(row);
    });agendaList.scrollTop=oldScroll;
  }
  function renderSummary() {
    summary.innerHTML=''; var done=ids.filter(function (id) { return record(id).status==='complete'; }).length;
    summary.appendChild(el('strong',null,done+' / '+sessions.length+' 次'));
    var meter=el('div','ht-meter'), fill=el('span'); fill.style.width=(done/sessions.length*100)+'%'; meter.appendChild(fill); summary.appendChild(meter);
    var label=state.bookmark?'上次讲到：'+description(state.bookmark.page):'尚未记录实际进度 · 已过日期不会自动完成';
    summary.appendChild(el('span','ht-muted',label));

  }
  function renderList() {
    list.innerHTML=''; var shown=0;
    ordered().forEach(function (s) {
      var r=record(s.id);
      if (filter==='complete' && r.status!=='complete' || filter==='unfinished' && r.status==='complete' || filter==='pending' && !pending(s)) return;
      shown++;
      var b=el('button','ht-session'+(s.id===selected?' selected':'')); b.setAttribute('data-session',s.id); b.setAttribute('aria-pressed',s.id===selected?'true':'false');
      var top=el('div','ht-session-top'); top.appendChild(el('span',null,s.date.slice(5).replace('-','/')+' · 第'+s.number+'次')); top.appendChild(el('span','ht-badge '+r.status,statusNames[r.status])); b.appendChild(top);
      b.appendChild(el('div','ht-session-title',s.title));
      var bottom=el('div','ht-session-top'); bottom.appendChild(el('span',null,s.period+' '+s.time)); if (pending(s)) bottom.appendChild(el('span','ht-badge pending','待调整')); b.appendChild(bottom);
      b.onclick=function () { selected=s.id; renderList(); renderDetail(); }; list.appendChild(b);
    });
    if (!shown) list.appendChild(el('p','ht-muted','没有符合条件的课次。'));
  }
  function field(label,id,type,value,parent) { var wrap=el('div'), lab=el('label',null,label); lab.htmlFor=id; wrap.appendChild(lab); var input=el(type==='textarea'?'textarea':'input'); input.id=id; if(type!=='textarea')input.type=type; input.value=value==null?'':value; wrap.appendChild(input); parent.appendChild(wrap); return input; }
  function alertText(s) { var f=(s.flags||[]).slice(); if (s.pending && !f.length) f.push('此时段内容待调整，请按实际安排修改。'); return f.join('；'); }
  function renderDetail() {
    var s=session(selected), r=record(selected); if(!s)return;
    detail.innerHTML=''; detail.scrollTop=0;
    detail.appendChild(el('div','ht-kicker','第 '+s.week+' 周 / 第 '+s.number+' 次课 / 2 课时'));
    detail.appendChild(el('h2',null,s.title));
    detail.appendChild(el('div','ht-muted',dateText(s.date)+' · '+s.period+' · '+s.time+' · '+(C.course.classroom||'E教223')));
    if((s.flags||[]).length && !s.resolved) detail.appendChild(el('div','ht-alert',alertText(s)));
    var content=el('ul','ht-content'); (s.content||[]).forEach(function(t){content.appendChild(el('li',null,t));});detail.appendChild(content);
    if(s.sourceContent && pending(s)) {
      var originalBox=el('details','ht-form');originalBox.appendChild(el('summary',null,'查看原时段内容（待重新安排）'));
      originalBox.appendChild(el('strong',null,s.sourceTitle||'原计划内容'));var originalList=el('ul','ht-content');s.sourceContent.forEach(function(t){originalList.appendChild(el('li',null,t));});originalBox.appendChild(originalList);
      var originalLinks=el('div','ht-links');(s.sourceLinks||[]).forEach(function(l){originalLinks.appendChild(button('p.'+l.page+' '+l.label,'ht-link',function(){closePanel();Deck.go(l.page);}));});originalBox.appendChild(originalLinks);detail.appendChild(originalBox);
    }
    detail.appendChild(el('h3',null,'对应课件与教学入口'));
    detail.appendChild(el('p','ht-muted',s.mappingNote||'以下为课件内容对应建议，可按实际教学顺序选择页面。'));
    var links=el('div','ht-links');
    (s.links||[]).forEach(function(l){if(!validPage(l.page)||l.page===null)return;var b=button('p.'+l.page+' '+l.label,'ht-link',function(){closePanel();Deck.go(l.page);});links.appendChild(b);});detail.appendChild(links);
    if(!s.startPage)detail.appendChild(el('p','ht-muted','本次没有专门的完整课件页；上方如有链接，仅供复习或参考。'));
    var form=el('div','ht-form'); form.appendChild(el('h3',null,'本次实际记录'));
    var fs=el('div','ht-fields'), statusWrap=el('div'), sl=el('label',null,'完成状态');sl.htmlFor='htStatus';statusWrap.appendChild(sl);
    var status=el('select');status.id='htStatus';Object.keys(statusNames).forEach(function(k){var o=el('option',null,statusNames[k]);o.value=k;status.appendChild(o);});status.value=r.status;statusWrap.appendChild(status);fs.appendChild(statusWrap);
    var actual=field('实际授课日期','htActualDate','date',r.actualDate,fs), page=field('停止页（可留空）','htRecordPage','number',r.page,fs);page.min=1;page.max=407;form.appendChild(fs);
    var lab=el('label','ht-note-label','授课备注');lab.htmlFor='htNote';form.appendChild(lab);var note=el('textarea');note.id='htNote';note.maxLength=4000;note.placeholder='例如：听力练习未完成，下次从这里继续。';note.value=r.note;form.appendChild(note);
    var fr=el('div','ht-row');
    fr.appendChild(button('保存修改','ht-primary',function(){
      var p=page.value===''?null:Number(page.value);if(!validPage(p)||!(actual.value===''||validDate(actual.value))){toast('请填写有效日期及 1–407 的整数页码。');return;}
      change(function(d){var stamp=new Date().toISOString();d.records[s.id]={status:status.value,page:p,actualDate:actual.value,note:note.value,updatedAt:stamp};},'编辑授课记录');toast(storageOK?'授课记录已保存。':'已暂存，请导出备份。');
    },'htSaveRecord'));
    form.appendChild(fr);form.appendChild(el('p','ht-muted','这里的修改不影响顶部“继续上次”记住的位置。'));
    detail.appendChild(form);
    if(r.status==='complete'){var next=nextUnfinished(s.id);if(next){var nextBox=el('div','ht-current');nextBox.appendChild(el('strong',null,'后续计划：'+dateText(next.date)+' · '+next.title));nextBox.appendChild(button('查看下一次安排','',function(){selected=next.id;renderProgress();scrollSelected();},'htNextSession'));detail.appendChild(nextBox);}}
    var plan=el('div','ht-form'), disclosure=el('details'); disclosure.appendChild(el('summary',null,'调整本次计划（日期、节次、内容）'));
    var sf=el('div','ht-fields'); var planDate=field('计划日期','htPlanDate','date',s.date,sf), planPeriod=field('节次','htPlanPeriod','text',s.period,sf), planTime=field('时间','htPlanTime','text',s.time,sf);disclosure.appendChild(sf);
    var title=field('本次标题','htPlanTitle','text',s.title,disclosure);title.maxLength=180;var planContent=field('教学内容（每行一项）','htPlanContent','textarea',(s.content||[]).join('\n'),disclosure);
    var ranges=el('div','ht-fields');var start=field('建议起始页','htPlanStart','number',s.startPage,ranges),end=field('参考结束页','htPlanEnd','number',s.endPage,ranges);disclosure.appendChild(ranges);
    var resolved=el('label');resolved.style.margin='12px 0';var cb=el('input');cb.type='checkbox';cb.id='htPlanResolved';cb.style.width='auto';cb.checked=!!s.resolved;resolved.appendChild(cb);resolved.appendChild(document.createTextNode(' 已核实此时段安排，取消“待调整”提示'));disclosure.appendChild(resolved);
    disclosure.appendChild(button('保存计划调整','',function(){
      var st=start.value===''?null:Number(start.value),en=end.value===''?null:Number(end.value);
      if(!validDate(planDate.value)||!title.value.trim()||!validPage(st)||!validPage(en)||(st&&en&&st>en)){toast('请检查日期、标题和页码范围。');return;}
      if(change(function(d){d.overrides[s.id]={date:planDate.value,period:planPeriod.value,time:planTime.value,title:title.value.trim(),content:planContent.value.split('\n').filter(function(t){return t.trim();}),startPage:st,endPage:en,resolved:cb.checked};},'调整教学计划'))toast('本次计划已调整，其他课次保持各自日期。');
    },'htSavePlan'));
    var original=sessions[ids.indexOf(s.id)];disclosure.appendChild(el('p','ht-muted','资料中的原安排：'+dateText(original.date)+' · '+(original.sourceTitle||original.title)+'。调整仅保存于增强版，可撤销；后续课次不会自动顺延。'));
    plan.appendChild(disclosure);detail.appendChild(plan);
  }
  function renderProgress() {
    if(!selected)selected=recommended().id;
    renderSummary();renderList();renderDetail();$('htUndo').disabled=!undo.length;$('htUndo').title=undo.length?'撤销：'+undo[undo.length-1].label:'当前打开期间没有可撤销操作';$('htSaveLabel').textContent=storageOK?'已自动保存':'当前仅临时保存 · 请导出备份';
  }
  function download() {
    var blob=new Blob([JSON.stringify(envelope(state),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download='中级汉语听说A_教学记录_'+today()+'.json';document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url);},10000);toast('已生成备份，请保管下载的 JSON 文件。');
  }
  function renderInfo() {
    infoBody.innerHTML='';
    var row=el('div','ht-row');row.appendChild(button('返回课程安排','',function(){openPanel('agenda',$('htOpenProgress'));}));row.appendChild(button('修改记录 / 调课','',function(){selected=recommended().id;openPanel('progress',$('htOpenProgress'));},'htManage'));row.appendChild(button('导出记录','',download,'htExport'));row.appendChild(button('恢复记录','',function(){upload.value='';upload.click();},'htImport'));infoBody.appendChild(row);
    var explanation=el('div','ht-backup-info');explanation.appendChild(el('strong',null,'日常会自动保存。换电脑或另存一份时，再用导出和恢复。'));
    explanation.appendChild(el('p','ht-muted','记页、课程勾选、备注和抽问记录都保存在当前浏览器。换电脑、换浏览器或清理浏览器数据前，请先导出一份记录。'));
    explanation.appendChild(el('p','ht-muted','撤销上一步仅保留当前打开期间最近 30 步；抽问面板可按本轮抽取顺序撤销。不同标签页同时修改可能互相覆盖，建议只开一个增强版课件窗口。'));infoBody.appendChild(explanation);
    if(pendingImport){var preview=el('div','ht-alert');var done=Object.keys(pendingImport.records).filter(function(id){return pendingImport.records[id].status==='complete';}).length;preview.appendChild(el('p',null,'待导入：'+done+' 次已完成；'+Object.keys(pendingImport.records).length+' 条授课记录；抽问第 '+pendingImport.picker.round+' 轮。导入会替换当前记录。'));
      preview.appendChild(button('确认恢复这份备份','ht-primary',function(){var incoming=pendingImport;pendingImport=null;var oldBad=badStored;badStored=false;if(!change(function(d){Object.keys(d).forEach(function(k){delete d[k];});Object.keys(incoming).forEach(function(k){d[k]=incoming[k];});},'导入备份'))badStored=oldBad;renderInfo();toast(storageOK?'备份已恢复，可撤销本次导入。':'备份已载入，但浏览器不能保存，请保留原备份。');},'htConfirmImport'));
      preview.appendChild(button('取消','',function(){pendingImport=null;renderInfo();},'htCancelImport'));infoBody.appendChild(preview);}
    var basis=el('details','ht-form');basis.appendChild(el('summary',null,'查看里程碑与教学依据'));
    basis.appendChild(el('h2',null,'学期里程碑'));
    var milestones=el('div','ht-milestones');sessions.filter(function(s){return [1,13,14,15,28,29].indexOf(s.number)>=0;}).forEach(function(src){var s=session(src.id);var b=button(s.date.slice(5)+' · '+s.title+(pending(s)?'（待调整）':''),'',function(){selected=s.id;openPanel('progress',$('htOpenProgress'));scrollSelected();});milestones.appendChild(b);});basis.appendChild(milestones);
    basis.appendChild(el('p','ht-muted','期末考试：2027/01/12–01/22 考试周，具体日期以排考通知为准，不计入 29 次课堂教学完成数。'));
    basis.appendChild(el('h2',null,'资料核对与安排说明'));
    var ul=el('ul');(C.notices||[]).forEach(function(t){ul.appendChild(el('li',null,t));});basis.appendChild(ul);
    var br=el('ul');(C.breaks||[]).forEach(function(b){br.appendChild(el('li',null,dateText(b.date)+'：'+b.reason));});basis.appendChild(br);
    basis.appendChild(el('p','ht-muted','依据：工作文件夹内教学大纲及学生名单 PDF、原网页版 407 页课件。页面对应为内容核对后的教学入口建议，并非大纲预先规定的逐页授课顺序。'));
    infoBody.appendChild(basis);
  }
  upload.onchange=function(){var f=this.files[0];if(!f)return;pendingImport=null;if(f.size>2000000){toast('文件过大，请选择本课导出的 JSON 备份。');return;}var reader=new FileReader();reader.onload=function(){try{pendingImport=unpack(JSON.parse(reader.result));renderInfo();toast('备份校验通过，请核对摘要并确认恢复。');}catch(e){pendingImport=null;renderInfo();toast(e.message||'备份无法读取，未覆盖现有记录。');}};reader.onerror=function(){toast('读取失败，未修改当前记录。');};reader.readAsText(f);};
  window.HTTeaching={adopt:function(obj){try{var d=unpack(obj);state=d;badStored=false;undo=[];save();notify();return true;}catch(e){return false;}},getState:function(){return clone(state);},change:change,subscribe:function(fn){subscribers.push(fn);},toast:toast,registerPanel:registerPanel,openPanel:openPanel,closePanel:closePanel,isPanelOpen:function(id){return opened===id;},pageChanged:function(){renderToolbar();},storageKey:KEY};
  $('htOpenProgress').onclick=function(){openPanel('agenda',this);};
  $('htQuickMark').onclick=quickMark;$('htResume').onclick=resume;
  $('htToolbar').addEventListener('pointerenter',function(){Deck.wake();});
  listenersReady=true;selected=recommended().id;notify();
})();
