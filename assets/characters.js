/* Lesson 6 character annotations scale with the original slide. */
(function () {
  'use strict';
  var deck = window.HTDeck, stage = document.getElementById('stage');
  if (!deck || !stage || window.HTCharacters) return;
  var layer = document.createElement('img');
  layer.id = 'htCharacters';
  layer.src = 'assets/lesson-6-characters.svg?v=20261119-l06';
  layer.alt = '第6课人物：马克、夏佳、李悦、平田康太、金志英。夏佳与何大华谈工作劳累、活动放松和早起锻炼；马克向导游询问华山游览安排；金志英向李悦询问新农村参观、安全和午餐；马克与平田康太谈熬夜、休息与锻炼；马克、夏佳、金志英讨论健康并计划组织运动小组。何大华、导游、王导游、张大林在本页没有配图。';
  layer.draggable = false;
  layer.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:3;pointer-events:none;';
  stage.appendChild(layer);
  function pageChanged(page) {
    layer.hidden = page !== 179;
  }
  window.HTCharacters = {pageChanged: pageChanged};
  pageChanged(deck.page());
}());
