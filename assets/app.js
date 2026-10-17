/* St Sola — revamp runtime: menus + gestures, ticker, cinematic carousel, neon field. No frameworks. */
(function () {
  'use strict';
  var doc = document, win = window;
  var reduceMQ = win.matchMedia ? win.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  var REDUCED = reduceMQ.matches;
  var $ = function (s, r) { return (r || doc).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || doc).querySelectorAll(s)); };

  /* ═════════════ SIDE MENUS ═════════════ */
  var menus = { left: $('#menuLeft'), right: $('#menuRight') };
  var btns = { left: $('#openLeft'), right: $('#openRight') };
  var overlay = $('#menuOverlay');
  var openSide = null, lastFocus = null;

  function setInert(el, on) { if (!el) return; if (on) { el.setAttribute('inert', ''); el.setAttribute('aria-hidden', 'true'); } else { el.removeAttribute('inert'); el.setAttribute('aria-hidden', 'false'); } }
  setInert(menus.left, true); setInert(menus.right, true);

  function menuOpen(side) {
    var m = menus[side]; if (!m) return;
    if (openSide && openSide !== side) menuCloseAll(true);
    lastFocus = doc.activeElement;
    m.classList.remove('dragging'); m.style.transform = '';
    m.classList.add('open'); setInert(m, false);
    overlay.classList.add('show'); overlay.style.opacity = '';
    doc.body.classList.add('menu-lock', 'menu-open');
    if (btns[side]) btns[side].setAttribute('aria-expanded', 'true');
    openSide = side;
    setTimeout(function () { try { m.focus({ preventScroll: true }); } catch (e) { m.focus(); } }, 30);
  }
  function menuCloseAll(silent) {
    ['left', 'right'].forEach(function (s) {
      var m = menus[s]; if (!m) return;
      m.classList.remove('open', 'dragging'); m.style.transform = ''; setInert(m, true);
      if (btns[s]) btns[s].setAttribute('aria-expanded', 'false');
    });
    overlay.classList.remove('show'); overlay.style.opacity = '';
    doc.body.classList.remove('menu-lock', 'menu-open');
    var had = openSide; openSide = null;
    if (!silent && had && lastFocus && lastFocus.focus) { try { lastFocus.focus({ preventScroll: true }); } catch (e) {} }
  }
  win.menuOpen = menuOpen; win.menuCloseAll = menuCloseAll;

  if (btns.left) btns.left.addEventListener('click', function () { openSide === 'left' ? menuCloseAll() : menuOpen('left'); });
  if (btns.right) btns.right.addEventListener('click', function () { openSide === 'right' ? menuCloseAll() : menuOpen('right'); });
  overlay.addEventListener('click', function () { menuCloseAll(); });
  doc.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && openSide) { menuCloseAll(); return; }
    if (e.key === 'Tab' && openSide) { // focus trap
      var m = menus[openSide];
      var f = $$('a[href],button:not([disabled]),input,textarea,[tabindex]:not([tabindex="-1"])', m).filter(function (x) { return x.offsetParent !== null; });
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && (doc.activeElement === first || doc.activeElement === m)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && doc.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  doc.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-close-menu]');
    if (!t || !openSide) return;
    var href = t.getAttribute('href');
    menuCloseAll(true);
    if (href && href.charAt(0) === '#') {
      e.preventDefault();
      var dest = doc.getElementById(href.slice(1));
      if (dest) setTimeout(function () { dest.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth' }); }, 60);
    }
  });

  /* ── swipe gestures: horizontal-intent + edge swipes ── */
  var EDGE = 28, INTENT = 10, RATIO = 1.25;
  var g = null;
  function menuWidth(side) { return menus[side] ? menus[side].getBoundingClientRect().width || 360 : 360; }
  function blockedTarget(t) {
    if (!t || !t.closest) return false;
    return !!t.closest('input,textarea,select,[type=range],.m-chips,.gb-scroll,#admin-overlay,#tip-modal,.video-shell,.homie-video');
  }
  function modalOpen() {
    var a = doc.getElementById('admin-overlay'), tm = doc.getElementById('tip-modal');
    return (a && a.classList.contains('open')) || (tm && tm.classList.contains('open'));
  }
  doc.addEventListener('touchstart', function (e) {
    if (e.touches.length !== 1 || modalOpen()) { g = null; return; }
    var p = e.touches[0], W = win.innerWidth;
    var edge = p.clientX < EDGE ? 'left' : (p.clientX > W - EDGE ? 'right' : null);
    var inCarousel = !!(e.target.closest && e.target.closest('#photoFrame'));
    if (!openSide && !edge && (inCarousel || blockedTarget(e.target))) { g = null; return; }
    if (openSide && blockedTarget(e.target) && !e.target.closest('.side-menu')) { g = null; return; }
    if (openSide && e.target.closest && e.target.closest('.m-chips,input')) { g = null; return; }
    g = { x: p.clientX, y: p.clientY, t: Date.now(), dx: 0, dy: 0, mode: null, side: null, edge: edge };
  }, { passive: true });

  doc.addEventListener('touchmove', function (e) {
    if (!g || e.touches.length !== 1) return;
    var p = e.touches[0];
    g.dx = p.clientX - g.x; g.dy = p.clientY - g.y;
    if (!g.mode) {
      var ax = Math.abs(g.dx), ay = Math.abs(g.dy);
      if (ax < INTENT && ay < INTENT) return;
      if (ax > ay * RATIO) {
        if (openSide) {
          // only closing direction counts while open
          if ((openSide === 'left' && g.dx < 0) || (openSide === 'right' && g.dx > 0)) { g.mode = 'close'; g.side = openSide; }
          else { g = null; return; }
        } else {
          g.side = g.dx > 0 ? 'left' : 'right'; // swipe RIGHT opens LEFT menu; swipe LEFT opens RIGHT menu
          g.mode = 'open';
        }
        g.w = menuWidth(g.side);
        menus[g.side].classList.add('dragging');
        overlay.classList.add('show');
      } else { g = null; return; } // vertical scroll wins
    }
    var w = g.w, m = menus[g.side], prog;
    if (g.mode === 'open') {
      var d = g.side === 'left' ? Math.min(Math.max(g.dx, 0), w) : Math.max(Math.min(g.dx, 0), -w);
      prog = Math.abs(d) / w;
      m.style.transform = 'translate3d(' + (g.side === 'left' ? (-w + Math.abs(d)) : (w - Math.abs(d))) + 'px,0,0)';
    } else {
      var c = g.side === 'left' ? Math.min(g.dx, 0) : Math.max(g.dx, 0);
      c = Math.max(Math.min(c, w), -w);
      prog = 1 - Math.abs(c) / w;
      m.style.transform = 'translate3d(' + c + 'px,0,0)';
    }
    overlay.style.opacity = String(Math.max(0, Math.min(1, prog)));
  }, { passive: true });

  function endGesture() {
    if (!g || !g.mode) { g = null; return; }
    var dt = Math.max(1, Date.now() - g.t), v = g.dx / dt, dist = Math.abs(g.dx) / g.w;
    var m = menus[g.side];
    m.classList.remove('dragging'); m.style.transform = ''; overlay.style.opacity = '';
    if (g.mode === 'open') {
      var dirOk = g.side === 'left' ? v > 0 : v < 0;
      if (dist > 0.3 || (Math.abs(v) > 0.4 && dirOk && Math.abs(g.dx) > 40)) menuOpen(g.side);
      else { overlay.classList.remove('show'); }
    } else {
      if (dist > 0.25 || Math.abs(v) > 0.4) menuCloseAll(); else { overlay.classList.add('show'); }
    }
    g = null;
  }
  doc.addEventListener('touchend', endGesture, { passive: true });
  doc.addEventListener('touchcancel', endGesture, { passive: true });

  /* ── left menu search + category chips ── */
  var search = $('#menuSearch'), chips = $$('#menuChips .m-chip'), groups = $$('#menuLeft .m-group'), emptyEl = $('#menuEmpty');
  var activeFilter = 'all';
  var norm = function (s) { return (s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, ''); };
  groups.forEach(function (gr) {
    $$('.m-item', gr).forEach(function (it) { it._txt = norm(it.textContent + ' ' + gr.getAttribute('data-group') + ' ' + $('.m-group-title', gr).textContent + ' ' + $$('a', it).map(function (a) { return a.href; }).join(' ')); });
  });
  function applyFilter() {
    var q = norm(search ? search.value.trim() : ''), shown = 0;
    groups.forEach(function (gr) {
      var gOk = activeFilter === 'all' || gr.getAttribute('data-group') === activeFilter, n = 0;
      $$('.m-item', gr).forEach(function (it) { var ok = gOk && (!q || it._txt.indexOf(q) !== -1); it.hidden = !ok; if (ok) n++; });
      gr.hidden = n === 0; shown += n;
    });
    if (emptyEl) emptyEl.hidden = shown !== 0;
  }
  if (search) search.addEventListener('input', applyFilter);
  chips.forEach(function (c) {
    c.addEventListener('click', function () {
      chips.forEach(function (x) { x.classList.toggle('active', x === c); });
      activeFilter = c.getAttribute('data-filter'); applyFilter();
      var sc = $('#menuLeftScroll'); if (sc) sc.scrollTop = 0;
    });
  });

  /* ═════════════ TOP BAR + REVEAL ═════════════ */
  var topbar = $('#topbar'), bgChar = $('.bg-char'), ticking = false;
  function onScroll() {
    if (ticking) return; ticking = true;
    requestAnimationFrame(function () {
      var y = win.scrollY || 0;
      if (topbar) topbar.classList.toggle('scrolled', y > 40);
      if (bgChar && !REDUCED) bgChar.style.transform = 'translate3d(0,' + (-Math.min(y, 2400) * 0.04).toFixed(1) + 'px,0) scale(1.06)';
      ticking = false;
    });
  }
  win.addEventListener('scroll', onScroll, { passive: true }); onScroll();
  if ('IntersectionObserver' in win && !REDUCED) {
    var ro = new IntersectionObserver(function (es) { es.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); ro.unobserve(en.target); } }); }, { rootMargin: '0px 0px -8% 0px' });
    $$('.reveal').forEach(function (el) { ro.observe(el); });
  } else { $$('.reveal').forEach(function (el) { el.classList.add('in'); }); }

  /* ═════════════ LIVE CRYPTO TICKER ═════════════ */
  (function ticker() {
    var track = $('#ticker-track'); if (!track) return;
    var COINS = ['bitcoin','ethereum','solana','dogecoin','pepe','tezos','tether','binancecoin','ripple','usd-coin','cardano','avalanche-2','shiba-inu','chainlink','polkadot','uniswap','litecoin','bitcoin-cash','stellar','near'];
    var CORE = ['solana', 'ethereum', 'bitcoin'];
    var SYM = { solana: 'SOL', ethereum: 'ETH', bitcoin: 'BTC' };
    var CACHE = 'stsola_ticker_v1';
    function fmt(n) {
      if (n == null || isNaN(n)) return '—';
      if (n >= 1000) return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
      if (n >= 1) return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      if (n >= 0.01) return '$' + n.toFixed(4);
      if (n >= 0.000001) return '$' + n.toFixed(6);
      return '$' + n.toPrecision(3);
    }
    function item(sym, price, pct, core) {
      var ch = (pct == null || isNaN(pct)) ? '<span class="ticker-flat">·</span>'
        : '<span class="' + (pct >= 0 ? 'ticker-up' : 'ticker-down') + '">' + (pct >= 0 ? '▲' : '▼') + ' ' + Math.abs(pct).toFixed(2) + '%</span>';
      return '<span class="ticker-item' + (core ? ' tk-core' : '') + '"><span class="ticker-sym">' + sym + '</span><span class="ticker-price">' + fmt(price) + '</span>' + ch + '</span>';
    }
    function render(rows, note) {
      var html = rows.map(function (r) { return item(r.sym, r.price, r.pct, r.core); }).join('');
      if (note) html += '<span class="ticker-item"><span class="ticker-note">' + note + '</span></span>';
      track.innerHTML = html + html; // duplicate for seamless loop
      track.style.setProperty('--ticker-dur', Math.max(20, rows.length * 3.2) + 's');
    }
    function fromMarkets(data) {
      var by = {}; data.forEach(function (c) { by[c.id] = c; });
      var rows = [];
      CORE.forEach(function (id) { var c = by[id]; if (c) rows.push({ sym: c.symbol.toUpperCase(), price: c.current_price, pct: c.price_change_percentage_24h, core: true }); });
      data.forEach(function (c) { if (CORE.indexOf(c.id) === -1) rows.push({ sym: c.symbol.toUpperCase(), price: c.current_price, pct: c.price_change_percentage_24h }); });
      return rows;
    }
    function save(rows) { try { localStorage.setItem(CACHE, JSON.stringify({ t: Date.now(), rows: rows })); } catch (e) {} }
    function cached() { try { var c = JSON.parse(localStorage.getItem(CACHE)); return c && c.rows && c.rows.length ? c : null; } catch (e) { return null; } }
    function timeout(p, ms) { return Promise.race([p, new Promise(function (_, rej) { setTimeout(function () { rej(new Error('timeout')); }, ms); })]); }
    function getJSON(u) { return timeout(fetch(u, { cache: 'no-store' }), 9000).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }); }
    function load() {
      getJSON('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=' + COINS.join(',') + '&order=market_cap_desc&per_page=20&page=1&price_change_percentage=24h')
        .then(function (data) { if (!data || !data.length) throw new Error('empty'); var rows = fromMarkets(data); save(rows); render(rows); })
        .catch(function () {
          return getJSON('https://api.coingecko.com/api/v3/simple/price?ids=solana,ethereum,bitcoin&vs_currencies=usd&include_24hr_change=true')
            .then(function (d) {
              var rows = CORE.filter(function (id) { return d[id]; }).map(function (id) { return { sym: SYM[id], price: d[id].usd, pct: d[id].usd_24h_change, core: true }; });
              if (!rows.length) throw new Error('empty'); render(rows);
            })
            .catch(function () {
              var c = cached();
              if (c) render(c.rows, 'cached ' + new Date(c.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
              else render(CORE.map(function (id) { return { sym: SYM[id], price: null, pct: null, core: true }; }), 'prices offline, retrying');
            });
        });
    }
    var c0 = cached(); if (c0) render(c0.rows);
    load();
    setInterval(function () { if (!doc.hidden) load(); }, 60000);
  })();

  /* ═════════════ CINEMATIC CAROUSEL ═════════════ */
  (function carousel() {
    var frame = $('#photoFrame'); if (!frame) return;
    var slides = $$('.slide', frame), dots = $$('#frameDots .dot'), cur = 0, timer = null, visible = true;
    var KB = ['kb', 'kb kb-b', 'kb kb-c'], DUR = REDUCED ? 8000 : 6500;
    frame.setAttribute('tabindex', '0');
    function ensure(i) { var im = slides[(i + slides.length) % slides.length].querySelector('img'); if (im && !im.getAttribute('src') && im.dataset.src) im.src = im.dataset.src; }
    function kb(s, i) { if (REDUCED) return; s.classList.remove('kb', 'kb-b', 'kb-c'); void s.offsetWidth; KB[i % 3].split(' ').forEach(function (c) { s.classList.add(c); }); s.style.setProperty('--kb-dur', (DUR / 1000 + 2.5) + 's'); }
    function show(i) {
      i = (i + slides.length) % slides.length; if (i === cur) return;
      ensure(i); ensure(i + 1);
      var prev = slides[cur], next = slides[i];
      prev.classList.remove('active'); prev.classList.add('leaving');
      setTimeout(function () { prev.classList.remove('leaving', 'kb', 'kb-b', 'kb-c'); }, 1700);
      next.classList.add('active'); kb(next, i);
      if (dots[cur]) dots[cur].classList.remove('active'); if (dots[i]) dots[i].classList.add('active');
      cur = i;
    }
    function play() { stop(); if (!visible || doc.hidden) return; timer = setInterval(function () { show(cur + 1); }, DUR); }
    function stop() { if (timer) clearInterval(timer); timer = null; }
    ensure(0); ensure(1); kb(slides[0], 0); play();
    win.carouselShow = show;
    dots.forEach(function (d) { d.addEventListener('click', function () { show(+d.dataset.i); play(); }); });
    var pv = $('#framePrev'), nx = $('#frameNext');
    if (pv) pv.addEventListener('click', function () { show(cur - 1); play(); });
    if (nx) nx.addEventListener('click', function () { show(cur + 1); play(); });
    frame.addEventListener('keydown', function (e) { if (e.key === 'ArrowLeft') { show(cur - 1); play(); } if (e.key === 'ArrowRight') { show(cur + 1); play(); } });
    doc.addEventListener('visibilitychange', function () { doc.hidden ? stop() : play(); });
    if ('IntersectionObserver' in win) new IntersectionObserver(function (es) { visible = es[0].isIntersecting; visible ? play() : stop(); }).observe(frame);
    // touch swipe on carousel (edge swipes are left to the menus)
    var t0 = null;
    frame.addEventListener('touchstart', function (e) { var x = e.touches[0].clientX; if (x < 28 || x > win.innerWidth - 28) { t0 = null; return; } t0 = { x: x, y: e.touches[0].clientY }; }, { passive: true });
    frame.addEventListener('touchend', function (e) {
      if (!t0) return; var dx = e.changedTouches[0].clientX - t0.x, dy = e.changedTouches[0].clientY - t0.y; t0 = null;
      if (Math.abs(dx) > 36 && Math.abs(dx) > Math.abs(dy) * 1.25) { show(cur + (dx < 0 ? 1 : -1)); play(); }
    }, { passive: true });
    // subtle 3D tilt + glare (fine pointers only)
    if (!REDUCED && win.matchMedia && win.matchMedia('(hover:hover) and (pointer:fine)').matches) {
      var raf = 0;
      frame.addEventListener('pointermove', function (e) {
        if (raf) return; raf = requestAnimationFrame(function () {
          raf = 0; var r = frame.getBoundingClientRect(), px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
          frame.style.setProperty('--ry', ((px - 0.5) * 9).toFixed(2) + 'deg'); frame.style.setProperty('--rx', ((0.5 - py) * 7).toFixed(2) + 'deg');
          frame.style.setProperty('--gx', (px * 100).toFixed(1) + '%'); frame.style.setProperty('--gy', (py * 100).toFixed(1) + '%');
        });
      });
      frame.addEventListener('pointerleave', function () { frame.style.setProperty('--rx', '0deg'); frame.style.setProperty('--ry', '0deg'); });
    }
  })();



  /* ═════════════ LAZY EMBEDS + LAZY BACKGROUNDS ═════════════ */
  (function lazy() {
    var frames = $$('iframe.lazy-embed[data-src]'), gr = $('.guestroom-outer');
    function load(f) { if (!f.getAttribute('src')) f.setAttribute('src', f.getAttribute('data-src')); }
    if (!('IntersectionObserver' in win)) { frames.forEach(load); if (gr) gr.classList.add('bg-in'); return; }
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (en) { if (!en.isIntersecting) return; io.unobserve(en.target); if (en.target.tagName === 'IFRAME') load(en.target); else en.target.classList.add('bg-in'); });
    }, { rootMargin: '300px 0px' });
    frames.forEach(function (f) { io.observe(f); }); if (gr) io.observe(gr);
  })();

  /* ═════════════ LOFI LIVE: auto-embed when the owner allows embedding ═════════════ */
  (function lofi() {
    var shell = $('#lofiShell'); if (!shell) return;
    var id = shell.getAttribute('data-embed'), done = false;
    function tryEmbed() {
      if (done) return; done = true;
      // YouTube oEmbed answers 401 when "allow embedding" is off; noembed proxies it with CORS.
      fetch('https://noembed.com/embed?url=' + encodeURIComponent('https://www.youtube.com/watch?v=' + id))
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (!d || d.error) return; // keep the thumbnail facade (links out to YouTube)
          var f = doc.createElement('iframe');
          f.src = 'https://www.youtube-nocookie.com/embed/' + id + '?rel=0&modestbranding=1';
          f.title = 'StSola Lofi — Live Stream';
          f.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
          f.allowFullscreen = true; f.loading = 'lazy';
          var fac = $('.yt-facade', shell); if (fac) fac.remove();
          shell.insertBefore(f, shell.firstChild); shell.classList.add('embedded');
        }).catch(function () {});
    }
    if ('IntersectionObserver' in win) {
      var io = new IntersectionObserver(function (es) { if (es[0].isIntersecting) { io.disconnect(); tryEmbed(); } }, { rootMargin: '400px 0px' });
      io.observe(shell);
    } else tryEmbed();
  })();

  /* ═════════════ NEON PARTICLE FIELD (canvas 2D) ═════════════ */
  (function neon() {
    var cv = $('#neon-field'); if (!cv || !cv.getContext) return;
    var ctx = cv.getContext('2d'), W = 0, H = 0, DPR = Math.min(win.devicePixelRatio || 1, 1.5), parts = [], embers = [], running = false, raf = 0, t = 0;
    var COLS = ['255,58,0', '255,45,85', '255,120,40', '0,229,255', '255,215,0'];
    var sprites = COLS.map(function (c) {
      var s = doc.createElement('canvas'); s.width = s.height = 64; var x = s.getContext('2d');
      var gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(' + c + ',1)'); gr.addColorStop(.25, 'rgba(' + c + ',.55)'); gr.addColorStop(1, 'rgba(' + c + ',0)');
      x.fillStyle = gr; x.fillRect(0, 0, 64, 64); return s;
    });
    function size() {
      W = win.innerWidth; H = win.innerHeight; cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR); ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      var n = Math.max(26, Math.min(80, Math.round(W * H / 17000)));
      while (parts.length < n) parts.push(spawn(true)); parts.length = n;
    }
    function spawn(any) {
      var ci = Math.random() < .14 ? 3 : (Math.random() < .1 ? 4 : Math.floor(Math.random() * 3));
      return { x: Math.random() * W, y: any ? Math.random() * H : H + 20, r: 6 + Math.random() * 18, c: ci, a: .15 + Math.random() * .45, s: .15 + Math.random() * .5, p: Math.random() * 6.28 };
    }
    function flow(x, y) { return Math.sin(x * .0021 + t * .00025) * 1.3 + Math.cos(y * .0027 - t * .0002) * 1.1 + Math.sin((x + y) * .0012 + t * .00015); }
    function frame() {
      ctx.clearRect(0, 0, W, H); ctx.globalCompositeOperation = 'lighter';
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i], ang = flow(p.x, p.y);
        p.x += Math.cos(ang) * p.s * .6; p.y += Math.sin(ang) * p.s * .35 - p.s * .45;
        if (p.y < -30 || p.x < -40 || p.x > W + 40) parts[i] = p = spawn(false);
        var tw = .65 + .35 * Math.sin(t * .0015 + p.p);
        ctx.globalAlpha = p.a * tw; var d = p.r * 2; ctx.drawImage(sprites[p.c], p.x - p.r, p.y - p.r, d, d);
      }
      for (var j = embers.length - 1; j >= 0; j--) {
        var e = embers[j]; e.x += e.vx; e.y += e.vy; e.vy += .05; e.vx *= .98; e.l -= e.d;
        if (e.l <= 0) { embers.splice(j, 1); continue; }
        ctx.globalAlpha = e.l * .9; var s2 = e.r * e.l * 2; ctx.drawImage(sprites[e.c], e.x - s2 / 2, e.y - s2 / 2, s2, s2);
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
    function loop(ts) { t = ts || 0; frame(); raf = requestAnimationFrame(loop); }
    function start() { if (running || REDUCED || doc.hidden) return; running = true; raf = requestAnimationFrame(loop); }
    function stop() { running = false; cancelAnimationFrame(raf); }
    size(); win.addEventListener('resize', function () { size(); if (!running) frame(); });
    doc.addEventListener('visibilitychange', function () { doc.hidden ? stop() : start(); });
    if (reduceMQ.addEventListener) reduceMQ.addEventListener('change', function (e) { REDUCED = e.matches; REDUCED ? (stop(), frame()) : start(); });
    if (REDUCED) frame(); else start();
    // ember trail from the legacy cursor effect (fine pointers only)
    if (win.matchMedia && win.matchMedia('(pointer:fine)').matches) {
      doc.addEventListener('mousemove', function (e) {
        if (!running || embers.length > 160) return;
        for (var k = 0; k < 2; k++) embers.push({ x: e.clientX + (Math.random() - .5) * 6, y: e.clientY + (Math.random() - .5) * 6, vx: (Math.random() - .5) * 1.8, vy: -(Math.random() * 2.2 + .4), l: 1, d: Math.random() * .028 + .02, r: 5 + Math.random() * 7, c: Math.random() < .2 ? 4 : Math.floor(Math.random() * 3) });
      }, { passive: true });
    }
  })();
})();
