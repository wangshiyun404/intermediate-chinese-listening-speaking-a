/* Per-page reference answers. Source page IDs, lesson records and ink are untouched. */
(function () {
  'use strict';
  var D=window.HT_ANSWERS_DATA,deck=window.HTDeck,stage=document.getElementById('stage'),toggle=document.getElementById('htOpenAnswers');
  if(!D||!D.pages||!deck||!stage||!toggle||window.HTAnswers)return;
  var page=deck.page(),active=false,panelIndex=0,states=[],cards=[];
  function $(id){return document.getElementById(id);}
  function el(tag,cls,text){var e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined&&text!==null)e.textContent=text;return e;}
  function button(text,fn,cls){var b=el('button',cls,text);b.type='button';b.onclick=fn;return b;}
  function data(){return D.pages[String(page)];}
  function currentPart(){var p=data();return p&&p.panels[panelIndex];}
  function stateAt(i){
    if(!states[i])states[i]={shown:[],order:[],scroll:0};
    return states[i];
  }
  function nextHidden(i){
    var p=data(),s=stateAt(i);if(!p||!p.panels[i])return -1;
    for(var j=0;j<p.panels[i].items.length;j++)if(!s.shown[j])return j;
    return -1;
  }
  function pendingPanel(){
    var p=data();if(!p)return -1;
    for(var j=1;j<p.panels.length;j++){
      var i=(panelIndex+j)%p.panels.length;if(nextHidden(i)>=0)return i;
    }
    return -1;
  }
  function rememberScroll(){var b=$('htAnswerBody');if(b)stateAt(panelIndex).scroll=b.scrollTop;}
  function notify(t){if(window.HTTeaching&&window.HTTeaching.toast)window.HTTeaching.toast(t);}
  var layer=el('section','ht-answer-layer');layer.id='htAnswerLayer';layer.hidden=true;
  layer.setAttribute('aria-label','本页参考答案');layer.setAttribute('aria-hidden','true');
  var sheet=el('div','ht-answer-sheet');sheet.id='htAnswerSheet';layer.appendChild(sheet);stage.appendChild(layer);
  toggle.setAttribute('aria-controls',layer.id);toggle.setAttribute('aria-pressed','false');toggle.title='查看本页参考答案（A）';
  function layoutChanged(){
    var width=parseFloat(stage.style.width)||stage.clientWidth||stage.getBoundingClientRect().width;
    if(width>0)sheet.style.transform='scale('+(width/1600)+')';
  }
  function close(){
    if(!active)return;
    rememberScroll();
    active=false;layer.hidden=true;layer.setAttribute('aria-hidden','true');stage.classList.remove('ht-answers-open');
    toggle.textContent='参考答案';toggle.setAttribute('aria-pressed','false');toggle.title='查看本页参考答案（A）';
    deck.wake();
  }
  function controls(){
    var part=currentPart();if(!part||!active)return;
    var s=stateAt(panelIndex),next=nextHidden(panelIndex),count=0;
    part.items.forEach(function(_,i){if(s.shown[i])count++;});
    $('htAnswerStatus').textContent='已显示 '+count+' / '+part.items.length+(next>=0?' · 下一题：'+part.items[next].no:' · 本组已完成');
    $('htAnswerUndo').disabled=!s.order.length;$('htAnswerReset').disabled=!count;
    var pending=pendingPanel();
    $('htAnswerNext').textContent=next>=0?'下一题答案':(pending>=0?(pending>panelIndex?'下一组题目':'回到未完成组'):(page<D.end?'继续第 '+(page+1)+' 页':'本页完成 · 下一页'));
    cards.forEach(function(c,i){
      c.card.classList.toggle('is-next',i===next);
      c.card.classList.toggle('is-revealed',!!s.shown[i]);
    });
  }
  function fillAnswer(i,animate){
    var card=cards[i],item=currentPart().items[i];if(!card)return;
    card.content.innerHTML='';
    (Array.isArray(item.a)?item.a:[item.a||'']).forEach(function(line){card.content.appendChild(el('p','ht-answer-text',line));});
    if(item.evidence)card.content.appendChild(el('p','ht-answer-evidence',item.evidence));
    card.wait.hidden=true;card.content.hidden=false;
    if(animate){
      card.content.classList.add('is-revealing');
      setTimeout(function(){card.content.classList.remove('is-revealing');},240);
    }
  }
  function reveal(i){
    var part=currentPart();if(!active||!part||i<0||i>=part.items.length||i!==Math.floor(i))return false;
    var s=stateAt(panelIndex);if(s.shown[i])return false;
    s.shown[i]=true;s.order.push(i);fillAnswer(i,true);controls();deck.wake();return true;
  }
  function switchPanel(i){
    if(i===panelIndex)return;
    rememberScroll();panelIndex=i;render();layoutChanged();deck.wake();
  }
  function advance(){
    if(!active)return;
    var i=nextHidden(panelIndex);
    if(i>=0){reveal(i);return;}
    i=pendingPanel();if(i>=0){switchPanel(i);return;}
    // Source page numbers stay intact. The bottom navigation remains a direct
    // way to skip to the next source page before all answers have been shown.
    var p=page;close();deck.go(p+1);
  }
  function undo(){
    if(!active)return;
    var s=stateAt(panelIndex);if(!s.order.length)return;
    var i=s.order.pop(),c=cards[i];s.shown[i]=false;
    var hadFocus=c.content.contains(document.activeElement);
    c.content.hidden=true;c.content.classList.remove('is-revealing');c.content.innerHTML='';c.wait.hidden=false;
    controls();if(hadFocus)c.wait.focus();deck.wake();
  }
  function reset(){
    if(!active)return;
    var s=stateAt(panelIndex);s.shown=[];s.order=[];
    cards.forEach(function(c){c.content.hidden=true;c.content.innerHTML='';c.content.classList.remove('is-revealing');c.wait.hidden=false;});
    controls();deck.wake();
  }
  function render(){
    var p=data();if(!p)return;
    var panels=p.panels||[],part=panels[panelIndex]||panels[0];if(!part)return;
    sheet.innerHTML='';
    var head=el('header','ht-answer-head'),intro=el('div','ht-answer-intro');
    intro.appendChild(el('div','ht-answer-kicker','第4课 · 去蒙古包做客 · 第 '+page+' 页'));
    intro.appendChild(el('h2','ht-answer-title',p.title||'本页参考答案'));
    if(p.subtitle)intro.appendChild(el('p','ht-answer-subtitle',p.subtitle));
    head.appendChild(intro);
    var tools=el('div','ht-answer-tools'),actions=el('div','ht-answer-actions');
    var undoButton=button('收回上一题',undo,'ht-answer-undo');undoButton.id='htAnswerUndo';
    var nextButton=button('下一题答案',advance,'ht-answer-next');nextButton.id='htAnswerNext';
    actions.appendChild(undoButton);actions.appendChild(nextButton);actions.appendChild(button('返回题目',close,'ht-answer-back'));
    tools.appendChild(actions);
    var statusRow=el('div','ht-answer-status-row'),status=el('span','ht-answer-status');status.id='htAnswerStatus';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
    statusRow.appendChild(status);var resetButton=button('本组重来',reset,'ht-answer-reset');resetButton.id='htAnswerReset';statusRow.appendChild(resetButton);tools.appendChild(statusRow);
    head.appendChild(tools);sheet.appendChild(head);
    var nav=el('nav','ht-answer-nav');nav.setAttribute('aria-label','答案分类');
    panels.forEach(function(tab,i){
      var b=button(tab.label||('答案 '+(i+1)),function(){switchPanel(i);},'ht-answer-tab'+(i===panelIndex?' selected':''));
      b.setAttribute('aria-pressed',i===panelIndex?'true':'false');b.setAttribute('data-panel',String(i));nav.appendChild(b);
    });
    nav.appendChild(el('span','ht-answer-kind',part.kind||'参考答案'));sheet.appendChild(nav);
    if(part.note){var note=el('p','ht-answer-note',part.note);sheet.appendChild(note);}
    var items=part.items||[],mode=part.layout||((items.length>4)?'rows':'grid');
    var body=el('div','ht-answer-body ht-answer-'+mode+(items.length===1?' ht-answer-single':'')+(items.length>4?' ht-answer-many':''));body.id='htAnswerBody';body.setAttribute('tabindex','0');body.setAttribute('aria-label','逐题参考答案');
    // Fix the row budget before any content is revealed: long answers cannot
    // move the neighbouring questions when they appear.
    var cols=(mode==='grid'||mode==='words')&&items.length>1?2:1;
    body.style.gridTemplateRows='repeat('+Math.ceil(items.length/cols)+', minmax(0, 1fr))';
    cards=[];
    items.forEach(function(item,i){
      var card=el('article','ht-answer-card');card.setAttribute('data-answer',String(i+1));
      var q=el('div','ht-answer-question');q.appendChild(el('span','ht-answer-no',item.no==null?String(i+1):String(item.no)));
      if(item.q)q.appendChild(el('h3','',item.q));card.appendChild(q);
      var result=el('div','ht-answer-result'),content=el('div','ht-answer-content');content.hidden=true;content.id='htAnswerContent-'+page+'-'+panelIndex+'-'+i;
      var wait=button('点击显示本题答案',function(){reveal(i);},'ht-answer-placeholder');
      wait.setAttribute('aria-label','显示第 '+(item.no==null?i+1:item.no)+' 题答案');wait.setAttribute('aria-controls',content.id);
      result.appendChild(wait);result.appendChild(content);
      card.addEventListener('click',function(e){if(e.target.tagName!=='BUTTON')reveal(i);});
      card.appendChild(result);body.appendChild(card);
      cards.push({card:card,content:content,wait:wait});
      if(stateAt(panelIndex).shown[i])fillAnswer(i,false);
    });
    sheet.appendChild(body);
    var foot=el('footer','ht-answer-foot');foot.appendChild(el('span','',p.source||'课堂参考答案'));
    foot.appendChild(el('span','','空格 / → 下一题答案 · ← 收回'));sheet.appendChild(foot);
    body.scrollTop=stateAt(panelIndex).scroll;controls();
  }
  function panelOpen(){
    var h=$('help'),g=$('grid'),s=$('side'),b=$('blank');
    return (h&&!h.hidden)||(g&&!g.hidden)||(s&&s.getAttribute('aria-hidden')==='false')||(b&&!b.hidden)||!!document.querySelector('.ht-modal:not([hidden])')||!!document.querySelector('#htSecureDialog:not([hidden])');
  }
  function open(){
    page=deck.page();if(!data())return;
    deck.closePanels();if(window.HTTeaching&&window.HTTeaching.closePanel)window.HTTeaching.closePanel();
    if(window.HTScene&&window.HTScene.isOpen())window.HTScene.leave();
    if(window.HTInk&&window.HTInk.isEnabled()){var done=$('htInkDone');if(done)done.click();}
    active=true;render();layer.hidden=false;layer.setAttribute('aria-hidden','false');stage.classList.add('ht-answers-open');
    toggle.textContent='隐藏答案';toggle.setAttribute('aria-pressed','true');toggle.title='返回原题目（A 或 Esc）';layoutChanged();deck.wake();
  }
  function pageChanged(n){
    close();if(n!==page){states=[];panelIndex=0;}page=n;toggle.hidden=!data();layoutChanged();
  }
  toggle.onclick=function(){active?close():open();};
  // A touch that scrolls a long answer must not also swipe the deck underneath.
  ['touchstart','touchmove','touchend','pointerdown','click','dblclick'].forEach(function(ev){layer.addEventListener(ev,function(e){e.stopPropagation();});});
  document.addEventListener('keydown',function(e){
    if(e.ctrlKey||e.metaKey||e.altKey||e.isComposing||e.keyCode===229)return;
    var t=e.target,tag=t&&t.tagName,k=e.key||'',low=k.toLowerCase();
    if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT'||(t&&t.isContentEditable))return;
    if(panelOpen())return;
    if(active&&(k==='Escape'||k==='Esc')){close();e.preventDefault();e.stopImmediatePropagation();return;}
    if(active&&(k===' '||k==='Spacebar'||k==='ArrowRight'||k==='Right'||k==='ArrowDown'||k==='Down'||k==='PageDown')){
      if(!e.repeat){
        // On a focused in-sheet button, space performs that button's action.
        // Elsewhere it is the clicker's usual "advance" gesture.
        if((k===' '||k==='Spacebar')&&tag==='BUTTON'&&layer.contains(t))t.click();else advance();
      }
      e.preventDefault();e.stopImmediatePropagation();return;
    }
    if(active&&(k==='ArrowLeft'||k==='Left'||k==='ArrowUp'||k==='Up'||k==='PageUp')){
      if(!e.repeat)undo();e.preventDefault();e.stopImmediatePropagation();return;
    }
    if(low==='a'&&data()){
      if(!e.repeat){active?close():open();}e.preventDefault();e.stopImmediatePropagation();
    }
  },true);
  var pen=$('htPen');if(pen)pen.addEventListener('click',function(e){if(active){e.preventDefault();e.stopImmediatePropagation();notify('先点“返回题目”，即可继续圈画');}},true);
  window.HTAnswers={open:open,close:close,isOpen:function(){return active;},pageChanged:pageChanged,layoutChanged:layoutChanged,advance:advance,undo:undo,reveal:reveal};
  pageChanged(page);
})();
