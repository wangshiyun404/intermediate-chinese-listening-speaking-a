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
  var campus = {
    title: '北大校园体能竞速赛',
    publisher: '央视网',
    original: 'https://tv.cctv.com/2026/06/03/VIDEHfQ6n7YWaJF8vqcTl1Bp260603.shtml',
    media: 'https://newcntv.qcloudcdn.com/asp/hls/main/0303000a/3/default/0ae8d71f0bc64342b696b9acfb9a38ba/main.m3u8?maxbr=2048',
    hls: true
  };
  var stretch = {
    title: '不跑不跳，简易拉伸',
    publisher: '新华社',
    original: 'https://app.xinhuanet.com/news/article.html?articleId=2026080654ed2b3d075d44bfa378cf3abb838bd8',
    media: 'https://vodpub6.v.news.cn/yqfbzx-original/20260806/20260806be470c0b746046bc98733b218cde516c_XxjspcC000007_20260806_CBVFN0A001.mp4'
  };
  var activePlayback = null;
  var panel = document.createElement('section');
  panel.id = 'htWorkshopVideo';
  panel.hidden = true;
  function makePlayer(id) {
    var video = document.createElement('video');
    video.id = id;
    video.controls = true;
    video.preload = 'none';
    video.hidden = true;
    video.setAttribute('playsinline', '');
    video.addEventListener('error', function () {
      if (activePlayback && activePlayback.player === video && video.error) playbackError(activePlayback);
    });
    return video;
  }
  // Keep the native HLS and MP4 pipelines on separate media elements.
  var campusPlayer = makePlayer('htWorkshopCampusPlayer');
  var stretchPlayer = makePlayer('htWorkshopStretchPlayer');
  var tools = document.createElement('div');
  tools.className = 'ht-workshop-player-tools';
  var fallback = document.createElement('a');
  fallback.target = '_blank';
  fallback.rel = 'noopener noreferrer';
  var close = document.createElement('button');
  close.type = 'button';
  close.textContent = '返回活动';
  var message = document.createElement('p');
  message.hidden = true;
  message.setAttribute('role','status');
  tools.appendChild(fallback);
  tools.appendChild(close);
  panel.appendChild(campusPlayer);
  panel.appendChild(stretchPlayer);
  panel.appendChild(message);
  panel.appendChild(tools);
  stage.appendChild(panel);

  function closeVideo(restoreFocus) {
    if (!activePlayback) return;
    var previous = activePlayback;
    activePlayback = null;
    var player = previous.player;
    player.pause();
    panel.hidden = true;
    player.hidden = true;
    if (previous.stream) previous.stream.destroy();
    if (player.hasAttribute('src')) {
      player.removeAttribute('src');
      player.load();
    }
    if (restoreFocus) {
      var opener = document.getElementById(previous.buttonId);
      if (opener) opener.focus();
    }
  }
  function playbackError(session) {
    if (activePlayback !== session) return;
    message.textContent = '视频暂时无法播放，可打开原站或返回活动重试。';
    message.hidden = false;
  }
  function playVideo(clip, player, buttonId) {
    closeVideo(false);
    if (window.HTInk && window.HTInk.isEnabled()) document.getElementById('htInkDone').click();
    var session = { buttonId: buttonId, player: player, stream: null };
    activePlayback = session;
    message.hidden = true;
    panel.setAttribute('aria-label', clip.title);
    player.setAttribute('aria-label', clip.title);
    fallback.textContent = '打开' + clip.publisher + '原站';
    fallback.href = clip.original;
    player.hidden = false;
    panel.hidden = false;
    close.focus();
    deck.wake();
    if (!clip.hls || player.canPlayType('application/vnd.apple.mpegurl')) {
      player.src = clip.media;
    } else if (window.Hls && window.Hls.isSupported()) {
      session.stream = new window.Hls();
      session.stream.on(window.Hls.Events.ERROR, function (_, details) {
        if (details.fatal) playbackError(session);
      });
      session.stream.loadSource(clip.media);
      session.stream.attachMedia(player);
    } else {
      playbackError(session);
      return;
    }
    var playback = player.play();
    if (playback && playback.catch) playback.catch(function (error) {
      if (error.name !== 'AbortError') playbackError(session);
    });
  }
  close.onclick = function () { closeVideo(true); };
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
      var top = cover ? 84 : (page === 181 ? 5 : 86);
      action('htWorkshopStart', '进入第6课课堂活动 →', cover ? 6 : 66, top, cover ? 33 : 28, 6,
        function () { deck.go(first); });
    }
    if (page === first) {
      action('htWorkshopGuide', '打开教师提示', 76, 5, 18, 7, '第6课教师提示.html');
    }
    if (page === videoPage) {
      action('htWorkshopCctv', '播放校园体能赛', 71, 37, 23, 10,
        function () { playVideo(campus, campusPlayer, 'htWorkshopCctv'); });
      action('htWorkshopDemo', '播放拉伸短片', 71, 58.5, 23, 9,
        function () { playVideo(stretch, stretchPlayer, 'htWorkshopDemo'); });
      action('htWorkshopOriginal', '新华社原站 ↗', 71, 69, 23, 7, stretch.original);
    }
  }

  window.HTWorkshop = { pageChanged: pageChanged };
  pageChanged(deck.page());
}());
