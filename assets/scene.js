/* A supplementary video between original pages 53 and 54. Source page IDs and
   every existing teaching / ink / navigation record remain stable. */
(function () {
  'use strict';
  var deck=window.HTDeck,stage=document.getElementById('stage');
  if (!deck || !stage || window.HTScene) return;
  function $(id) { return document.getElementById(id); }
  function make(tag,id,text) { var e=document.createElement(tag);if(id)e.id=id;if(text)e.textContent=text;return e; }
  var active=false,savedTitle='',savedAudioHidden=true;
  var bar=make('div','htSceneBar'),label=make('span',null);label.className='ht-scene-label';bar.hidden=true;
  var back=make('button','htSceneBack','返回第 53 页'),forward=make('button','htSceneNext','继续第 54 页');
  back.type=forward.type='button';bar.appendChild(label);bar.appendChild(back);bar.appendChild(forward);
  $('stageWrap').parentNode.insertBefore(bar,$('stageWrap'));
  var layer=make('div','htSceneLayer');layer.hidden=true;layer.setAttribute('aria-label','夏佳和张经理：情境动画');
  var video=make('video','htSceneVideo');video.controls=true;video.preload='metadata';video.playsInline=true;
  video.setAttribute('playsinline','');video.setAttribute('aria-label','教材录音014情境动画，2分23秒');
  video.poster='video/053_情境动画封面.jpg';video.src='video/053_夏佳和张经理_情境动画.mp4';
  var start=make('button','htSceneStart','▶ 播放情境动画 · 2:23');start.type='button';
  var error=make('div','htSceneError');error.hidden=true;
  error.appendChild(document.createTextNode('视频暂时无法在网页中播放。请确认 video 文件夹完整，或'));
  var direct=make('a',null,'直接打开视频');direct.href=video.src;direct.target='_blank';error.appendChild(direct);
  layer.appendChild(video);layer.appendChild(start);layer.appendChild(error);stage.appendChild(layer);
  function notify(t) { if(window.HTTeaching)window.HTTeaching.toast(t); }
  function hash(open) { try { history.replaceState(null,'','#p=53'+(open?'&scene=014':'')); } catch(e){} }
  function play() { var p=video.play();if(p&&p.catch)p.catch(function(){start.hidden=false;notify('点一下播放按钮即可开始');}); }
  function updateBar(p) {
    bar.hidden=!active && p!==53;
    if(active) { label.textContent='第 53 页后 · 夏佳和张经理 · 教材原录音 014';back.hidden=false;forward.textContent='继续第 54 页'; }
    else { label.textContent='本页后有情境动画 · 2 分 23 秒';back.hidden=true;forward.textContent='看情境动画 →'; }
    deck.layout();
  }
  function open() {
    if(active)return;
    if(deck.page()!==53)deck.go(53);
    deck.closePanels();if(window.HTTeaching)window.HTTeaching.closePanel();
    if(window.HTInk&&window.HTInk.isEnabled())$('htInkDone').click();
    $('au').pause();savedTitle=$('whereTitle').textContent;savedAudioHidden=$('audioGrp').hidden;
    active=true;layer.hidden=false;stage.classList.add('ht-scene-open');$('whereTitle').textContent='情境动画 · 夏佳和张经理';
    $('audioGrp').hidden=true;start.hidden=video.currentTime>0;error.hidden=true;
    document.title='第 53 页后 · 夏佳和张经理 情境动画 · 会通汉语听说3';
    hash(true);updateBar(53);deck.wake();
  }
  function leave() {
    if(!active)return;
    video.pause();active=false;layer.hidden=true;stage.classList.remove('ht-scene-open');
    $('whereTitle').textContent=savedTitle;$('audioGrp').hidden=savedAudioHidden;
    hash(false);updateBar(deck.page());
  }
  function backToText() { leave();deck.go(53); }
  function continueDeck() { leave();deck.go(54); }
  back.onclick=backToText;
  forward.onclick=function(){active?continueDeck():open();};
  start.onclick=play;
  video.addEventListener('play',function(){start.hidden=true;$('au').pause();deck.wake();});
  video.addEventListener('error',function(){error.hidden=false;start.hidden=true;});
  video.addEventListener('ended',function(){start.textContent='↻ 再看一遍';start.hidden=false;});
  ['pointerdown','touchstart','touchend','click','dblclick'].forEach(function(ev){layer.addEventListener(ev,function(e){e.stopPropagation();});});
  function panelOpen() {
    return !$('help').hidden || !$('grid').hidden || $('side').getAttribute('aria-hidden')==='false' || !!document.querySelector('.ht-modal:not([hidden])');
  }
  // Capture only the keys whose meaning changes on a video page. Other deck keys
  // (fullscreen, directory, blackout, picker, teaching bookmark) keep working.
  document.addEventListener('keydown',function(e){
    if(!active||e.ctrlKey||e.metaKey||e.altKey)return;
    var tag=e.target&&e.target.tagName;
    if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT'||(e.target&&e.target.isContentEditable))return;
    if(panelOpen())return;
    var k=e.key,low=(k||'').toLowerCase();
    if(low==='p'||k===' '||k==='Spacebar'){if(!e.repeat){video.paused?play():video.pause();}}
    else if(low==='r'){video.currentTime=0;play();}
    else if(low==='['||low===']'){video.currentTime=Math.max(0,Math.min(video.duration||142.667,video.currentTime+(low==='['?-5:5)));}
    else if(k==='ArrowRight'||k==='ArrowDown'||k==='PageDown'){continueDeck();}
    else if(k==='ArrowLeft'||k==='ArrowUp'||k==='PageUp'||k==='Backspace'){backToText();}
    else return;
    e.preventDefault();e.stopImmediatePropagation();
  },true);
  // A video uses the stage; returning to a slide restores the ordinary pen.
  $('htPen').addEventListener('click',function(e){if(active){e.preventDefault();e.stopImmediatePropagation();notify('返回课件页面后即可圈画');}},true);
  window.addEventListener('pagehide',function(){video.pause();});
  window.addEventListener('hashchange',function(){if(/(?:^|&)scene=014(?:&|$)/.test(location.hash.slice(1))&&deck.page()===53)open();else if(active)leave();});
  window.HTScene={
    open:open,leave:leave,isOpen:function(){return active;},pageChanged:updateBar,
    next:function(p){if(active){leave();return false;}if(p===53){open();return true;}return false;},
    prev:function(p){if(active){backToText();return true;}if(p===54){deck.go(53);open();return true;}return false;}
  };
  updateBar(deck.page());
  if(/(?:^|&)scene=014(?:&|$)/.test(location.hash.slice(1))&&deck.page()===53)open();
})();
