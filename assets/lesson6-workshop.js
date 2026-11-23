/* Classroom entry points and video controls for Lesson 6. */
(function () {
  'use strict';
  var deck = window.HTDeck;
  if (!deck) return;
  var stage = document.getElementById('stage');
  var overlay = document.getElementById('overlay');
  var videoPage = 413;
  var first = 409;
  var current = 0;
  var cctv = 'https://tv.cctv.com/2026/06/03/VIDEHfQ6n7YWaJF8vqcTl1Bp260603.shtml';
  var xinhua = 'https://app.xinhuanet.com/news/article.html?articleId=2026080654ed2b3d075d44bfa378cf3abb838bd8';
  var media = 'https://vodpub6.v.news.cn/yqfbzx-original/20260806/20260806be470c0b746046bc98733b218cde516c_XxjspcC000007_20260806_CBVFN0A001.mp4';
  var panel = document.createElement('section');
  panel.id = 'htWorkshopVideo';
  panel.hidden = true;
  panel.setAttribute('aria-label', '新华社视频：简易拉伸');
  var player = document.createElement('video');
  player.controls = true;
  player.preload = 'none';
  player.setAttribute('playsinline', '');
  player.setAttribute('aria-label', '不跑不跳，简易拉伸');
  var tools = document.createElement('div');
  tools.className = 'ht-workshop-player-tools';
  var fallback = document.createElement('a');
  fallback.textContent = '打开新华社原站';
  fallback.href = xinhua;
  fallback.target = '_blank';
  fallback.rel = 'noopener noreferrer';
  var close = document.createElement('button');
  close.type = 'button';
  close.textContent = '返回活动';
  var message = document.createElement('p');
  message.hidden = true;
  message.textContent = '视频暂未加载，请点“打开新华社原站”或返回活动。';
  message.setAttribute('role','status');
  tools.appendChild(fallback);
  tools.appendChild(close);
  panel.appendChild(player);
  panel.appendChild(message);
  panel.appendChild(tools);
  stage.appendChild(panel);

  function closeVideo(restoreFocus) {
    if (panel.hidden) return;
    player.pause();
    panel.hidden = true;
    if (restoreFocus) {
      var opener = document.getElementById('htWorkshopDemo');
      if (opener) opener.focus();
    }
  }
  function playVideo() {
    if (window.HTInk && window.HTInk.isEnabled()) document.getElementById('htInkDone').click();
    message.hidden = true;
    panel.hidden = false;
    if (!player.getAttribute('src')) player.src = media;
    var playback = player.play();
    if (playback && playback.catch) playback.catch(function (error) {
      if (!panel.hidden && error.name !== 'AbortError') message.hidden = false;
    });
    close.focus();
    deck.wake();
  }
  close.onclick = function () { closeVideo(true); };
  player.addEventListener('error', function () { message.hidden = false; });
  panel.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') { closeVideo(true); event.preventDefault(); }
    event.stopPropagation();
  });
  ['touchstart','touchend','dblclick'].forEach(function (event) {
    panel.addEventListener(event, function (e) { e.stopPropagation(); });
  });
  window.addEventListener('pagehide', function () { closeVideo(false); });

  function action(id, label, x, y, width, height, target) {
    var link = typeof target === 'string';
    var control = document.createElement(link ? 'a' : 'button');
    control.className = 'ht-workshop-action';
    control.id = id;
    control.textContent = label;
    control.style.left = x + '%';
    control.style.top = y + '%';
    control.style.width = width + '%';
    control.style.height = height + '%';
    if (link) {
      control.href = target;
      control.target = '_blank';
      control.rel = 'noopener noreferrer';
    } else {
      control.type = 'button';
      control.onclick = target;
    }
    control.addEventListener('keydown', function (event) {
      if (event.key === ' ' || event.key === 'Enter') event.stopPropagation();
    });
    overlay.appendChild(control);
  }

  function pageChanged(page) {
    if (page !== current) closeVideo(false);
    current = page;
    if (page === 178 || page === 181 || page === 182) {
      var cover = page === 178;
      action('htWorkshopStart', '进入第6课课堂活动 →', cover ? 6 : 66, cover ? 84 : 86, cover ? 33 : 28, 6,
        function () { deck.go(first); });
    }
    if (page === first) {
      action('htWorkshopGuide', '打开教师提示', 76, 5, 18, 7, '第6课教师提示.html');
    }
    if (page === videoPage) {
      action('htWorkshopCctv', '打开央视原片 ↗', 71, 37, 23, 10, cctv);
      action('htWorkshopDemo', '播放拉伸短片', 71, 58.5, 23, 9, playVideo);
      action('htWorkshopOriginal', '新华社原站 ↗', 71, 69, 23, 7, xinhua);
    }
  }

  window.HTWorkshop = { pageChanged: pageChanged };
  pageChanged(deck.page());
}());
