/* ==========================================================================
   KING'S ELITE LOUNGE — main.js
   All site interactivity. Vanilla ES2018+, no dependencies.
   ========================================================================== */
(function () {
  'use strict';

  /* ------------------------------------------------------------------
     Venue constants — single source of truth
     ------------------------------------------------------------------ */
  var VENUE = {
    name: "King's Elite Lounge",
    tz: 'Asia/Dubai',              // GST, UTC+4, no daylight saving
    phone: '+971 56 428 4766',
    phoneRaw: '+971564284766',
    whatsapp: '971564284766',
    openHour: 21, openMinute: 30,  // 9:30 PM
    closeHour: 4,  closeMinute: 0, // 4:00 AM (next day)
    minAge: 21,                    // Dubai licensed-venue entry age
    menuPdf: 'https://kingselitelounge.com/wp-content/uploads/2025/03/KINGS-MENU.pdf'
  };

  function mq(query) {
    try { return !!(window.matchMedia && window.matchMedia(query).matches); }
    catch (e) { return false; }
  }
  var reduceMotion = mq('(prefers-reduced-motion: reduce)');
  var isTouch = mq('(hover: none), (pointer: coarse)') || 'ontouchstart' in window;

  /* Runs a feature in isolation: one broken feature must never disable the rest. */
  function safe(name, fn) {
    try { fn(); } catch (e) {
      if (window.console && console.warn) console.warn('[KEL] ' + name + ' failed:', e);
    }
  }

  var $  = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var on = function (el, ev, fn, opt) { if (el) el.addEventListener(ev, fn, opt); };

  function clamp(v, a, b) { return Math.min(Math.max(v, a), b); }
  function pad(n) { return String(n).padStart(2, '0'); }

  /* ==================================================================
     1. DUBAI TIME UTILITIES
     Everything below reads the venue's local clock (Asia/Dubai),
     not the visitor's device clock. A guest browsing from London
     sees the same "Open now" answer as one standing at the door.
     ================================================================== */
  function dubaiParts(date) {
    var d = date || new Date();
    var fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: VENUE.tz,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false, weekday: 'short'
    });
    var out = {};
    fmt.formatToParts(d).forEach(function (p) { out[p.type] = p.value; });
    var hour = parseInt(out.hour, 10);
    if (hour === 24) hour = 0; // some engines report 24 at midnight
    var days = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return {
      year: parseInt(out.year, 10),
      month: parseInt(out.month, 10),
      day: parseInt(out.day, 10),
      hour: hour,
      minute: parseInt(out.minute, 10),
      second: parseInt(out.second, 10),
      weekday: days[out.weekday],
      weekdayName: out.weekday,
      minutesOfDay: hour * 60 + parseInt(out.minute, 10),
      iso: out.year + '-' + out.month + '-' + out.day
    };
  }

  /* Current UTC offset of Dubai in minutes (fixed +240, computed for safety). */
  function dubaiOffsetMinutes(date) {
    var d = date || new Date();
    var utc = new Date(d.toLocaleString('en-US', { timeZone: 'UTC' }));
    var loc = new Date(d.toLocaleString('en-US', { timeZone: VENUE.tz }));
    return Math.round((loc - utc) / 60000);
  }

  /* Build a real Date from a Dubai wall-clock time. */
  function dubaiDate(y, m, d, hh, mm) {
    var guess = Date.UTC(y, m - 1, d, hh, mm, 0);
    var off = dubaiOffsetMinutes(new Date(guess));
    return new Date(guess - off * 60000);
  }

  var OPEN_MIN  = VENUE.openHour * 60 + VENUE.openMinute;   // 1290
  var CLOSE_MIN = VENUE.closeHour * 60 + VENUE.closeMinute; // 240

  function venueStatus() {
    var p = dubaiParts();
    var mins = p.minutesOfDay;
    var isOpen = mins >= OPEN_MIN || mins < CLOSE_MIN;
    var target;

    if (isOpen) {
      // next close: today 04:00 if we're in the small hours, else tomorrow 04:00
      if (mins < CLOSE_MIN) {
        target = dubaiDate(p.year, p.month, p.day, VENUE.closeHour, VENUE.closeMinute);
      } else {
        var t = new Date(dubaiDate(p.year, p.month, p.day, VENUE.closeHour, VENUE.closeMinute).getTime() + 864e5);
        target = t;
      }
    } else {
      target = dubaiDate(p.year, p.month, p.day, VENUE.openHour, VENUE.openMinute);
    }
    return { isOpen: isOpen, target: target, parts: p };
  }

  function dubaiClockString() {
    var p = dubaiParts();
    return pad(p.hour) + ':' + pad(p.minute);
  }

  /* ==================================================================
     2. PRELOADER
     ================================================================== */
  safe('preloader', function () {
    var el = $('.preloader');
    if (!el) { document.body.classList.add('is-loaded'); return; }
    var bar = $('.preloader__bar span', el);
    var pct = 0;

    var tick = setInterval(function () {
      pct = Math.min(pct + Math.random() * 18 + 6, 100);
      if (bar) bar.style.width = pct + '%';
      if (pct >= 100) clearInterval(tick);
    }, 120);

    function finish() {
      if (bar) bar.style.width = '100%';
      setTimeout(function () {
        el.classList.add('is-done');
        document.body.classList.add('is-loaded');
        document.dispatchEvent(new CustomEvent('site:loaded'));
        setTimeout(function () { el.remove(); }, 800);
      }, 320);
    }

    if (document.readyState === 'complete') { setTimeout(finish, 420); }
    else { on(window, 'load', function () { setTimeout(finish, 420); }); }
    // hard fallback so the site never stays behind the curtain
    setTimeout(function () { if (!el.classList.contains('is-done')) finish(); }, 4200);
  });

  /* ==================================================================
     3. CUSTOM CURSOR
     ================================================================== */
  safe('cursor', function () {
    if (isTouch || reduceMotion) return;
    var ring = $('.cursor'), dot = $('.cursor-dot');
    if (!ring || !dot) return;

    var mx = -100, my = -100, rx = -100, ry = -100;

    on(document, 'mousemove', function (e) {
      mx = e.clientX; my = e.clientY;
      dot.style.transform = 'translate(' + (mx - 2.5) + 'px,' + (my - 2.5) + 'px)';
      if (!ring.classList.contains('is-active')) {
        ring.classList.add('is-active'); dot.classList.add('is-active');
      }
    });
    on(document, 'mouseleave', function () {
      ring.classList.remove('is-active'); dot.classList.remove('is-active');
    });

    (function loop() {
      rx += (mx - rx) * 0.17;
      ry += (my - ry) * 0.17;
      ring.style.transform = 'translate(' + (rx - 17) + 'px,' + (ry - 17) + 'px)';
      requestAnimationFrame(loop);
    })();

    var hoverSel = 'a, button, .tile, .gallery__item, .package, input, select, textarea, label, .tab, .dots button';
    on(document, 'mouseover', function (e) {
      if (e.target.closest(hoverSel)) ring.classList.add('is-hover');
    });
    on(document, 'mouseout', function (e) {
      if (e.target.closest(hoverSel)) ring.classList.remove('is-hover');
    });
  });

  /* ==================================================================
     4. HEADER, SCROLL PROGRESS, BACK TO TOP
     ================================================================== */
  safe('header', function () {
    var head = $('.header');
    var prog = $('.scroll-progress');
    var top  = $('.fab--top');
    var last = 0;

    function onScroll() {
      var y = window.scrollY || document.documentElement.scrollTop;
      var h = document.documentElement.scrollHeight - window.innerHeight;

      if (prog) prog.style.width = (h > 0 ? clamp(y / h, 0, 1) * 100 : 0) + '%';
      if (head) {
        head.classList.toggle('is-stuck', y > 40);
        // auto-hide going down, reveal going up (not while the drawer is open)
        if (!document.body.classList.contains('is-locked')) {
          head.classList.toggle('is-hidden', y > last && y > 420);
        }
      }
      if (top) top.classList.toggle('is-shown', y > 700);
      last = y;
    }

    on(window, 'scroll', onScroll, { passive: true });
    onScroll();

    on(top, 'click', function () {
      window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
    });
  });

  /* ==================================================================
     5. MOBILE DRAWER
     ================================================================== */
  safe('drawer', function () {
    var burger = $('.burger'), panel = $('.drawer');
    if (!burger || !panel) return;

    function setOpen(open) {
      burger.classList.toggle('is-open', open);
      panel.classList.toggle('is-open', open);
      document.body.classList.toggle('is-locked', open);
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
      panel.setAttribute('aria-hidden', open ? 'false' : 'true');
    }

    on(burger, 'click', function () { setOpen(!panel.classList.contains('is-open')); });
    $$('.drawer a').forEach(function (a) { on(a, 'click', function () { setOpen(false); }); });
    on(document, 'keydown', function (e) {
      if (e.key === 'Escape' && panel.classList.contains('is-open')) setOpen(false);
    });
    on(window, 'resize', function () {
      if (window.innerWidth > 980 && panel.classList.contains('is-open')) setOpen(false);
    });
  });

  /* ==================================================================
     6. ACTIVE NAV LINK
     ================================================================== */
  safe('activeNav', function () {
    /* Normalise a path or href down to a bare page key, so the same code works
       whether the host serves /about.html or Vercel's clean /about. */
    function pageKey(value) {
      var last = (value || '').split('/').pop().split('#')[0].split('?')[0];
      last = last.replace(/\.html$/i, '');
      return last || 'index';
    }

    var here = pageKey(location.pathname);

    // Nav and drawer links get the gold underline treatment.
    $$('.nav__link, .drawer__link').forEach(function (a) {
      var href = a.getAttribute('href') || '';
      if (!href || href.charAt(0) === '#' || /^(https?:|tel:|mailto:)/i.test(href)) return;
      if (pageKey(href) === here) {
        a.classList.add('is-current');
        a.setAttribute('aria-current', 'page');
      }
    });

    // Reservations is reached through the header CTA rather than a nav link,
    // so mark that button too — otherwise the page has no "you are here" cue.
    $$('.header a[href], .drawer a[href]').forEach(function (a) {
      var href = a.getAttribute('href') || '';
      if (!href || href.charAt(0) === '#' || /^(https?:|tel:|mailto:)/i.test(href)) return;
      if (pageKey(href) === here) a.setAttribute('aria-current', 'page');
    });
  });

  /* ==================================================================
     7. GOLD DUST CANVAS
     ================================================================== */
  safe('dust', function () {
    var cv = $('#dust');
    if (!cv || reduceMotion) return;
    var ctx = null;
    try { ctx = cv.getContext('2d'); } catch (e) { ctx = null; }
    if (!ctx) { cv.style.display = 'none'; return; }
    var parts = [], w = 0, h = 0, raf;

    function size() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = cv.width = Math.floor(window.innerWidth * dpr);
      h = cv.height = Math.floor(window.innerHeight * dpr);
      cv.style.width = window.innerWidth + 'px';
      cv.style.height = window.innerHeight + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      build();
    }

    function build() {
      var area = window.innerWidth * window.innerHeight;
      var count = clamp(Math.round(area / 26000), 18, 70);
      parts = [];
      for (var i = 0; i < count; i++) {
        parts.push({
          x: Math.random() * window.innerWidth,
          y: Math.random() * window.innerHeight,
          r: Math.random() * 1.5 + 0.35,
          vx: (Math.random() - 0.5) * 0.16,
          vy: -(Math.random() * 0.3 + 0.06),
          a: Math.random() * 0.5 + 0.12,
          tw: Math.random() * Math.PI * 2
        });
      }
    }

    function frame() {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        p.x += p.vx; p.y += p.vy; p.tw += 0.02;
        if (p.y < -12) { p.y = window.innerHeight + 12; p.x = Math.random() * window.innerWidth; }
        if (p.x < -12) p.x = window.innerWidth + 12;
        if (p.x > window.innerWidth + 12) p.x = -12;
        var alpha = p.a * (0.55 + Math.sin(p.tw) * 0.45);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(212,175,55,' + alpha.toFixed(3) + ')';
        ctx.fill();
      }
      raf = requestAnimationFrame(frame);
    }

    size();
    frame();
    on(window, 'resize', size);
    on(document, 'visibilitychange', function () {
      if (document.hidden) { cancelAnimationFrame(raf); }
      else { raf = requestAnimationFrame(frame); }
    });
  });

  /* ==================================================================
     8. SCROLL REVEAL
     ================================================================== */
  safe('reveal', function () {
    var items = $$('[data-reveal]');
    if (!items.length) return;

    if (!('IntersectionObserver' in window) || reduceMotion) {
      items.forEach(function (el) { el.classList.add('is-in'); });
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var el = en.target;
        var delay = parseFloat(el.getAttribute('data-delay') || 0);
        setTimeout(function () { el.classList.add('is-in'); }, delay * 1000);
        io.unobserve(el);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });

    items.forEach(function (el) { io.observe(el); });
  });

  /* ==================================================================
     9. COUNTERS
     ================================================================== */
  safe('counters', function () {
    var nums = $$('[data-count]');
    if (!nums.length) return;

    function run(el) {
      var target = parseFloat(el.getAttribute('data-count'));
      var suffix = el.getAttribute('data-suffix') || '';
      var prefix = el.getAttribute('data-prefix') || '';
      var dur = 1700, t0 = null;
      if (reduceMotion) { el.textContent = prefix + target + suffix; return; }

      function step(ts) {
        if (!t0) t0 = ts;
        var p = clamp((ts - t0) / dur, 0, 1);
        var eased = 1 - Math.pow(1 - p, 3);
        var val = target % 1 === 0 ? Math.round(target * eased) : (target * eased).toFixed(1);
        el.textContent = prefix + val + suffix;
        if (p < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    }

    if (!('IntersectionObserver' in window)) { nums.forEach(run); return; }
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { run(e.target); io.unobserve(e.target); } });
    }, { threshold: 0.5 });
    nums.forEach(function (n) { io.observe(n); });
  });

  /* ==================================================================
     10. LIVE VENUE STATUS + COUNTDOWN + TODAY HIGHLIGHT
     ================================================================== */
  safe('liveStatus', function () {
    var pills   = $$('[data-status-pill]');
    var labels  = $$('[data-status-label]');
    var clocks  = $$('[data-dubai-clock]');
    var cdWraps = $$('[data-countdown]');
    var cdTitle = $$('[data-countdown-title]');

    function render() {
      var st = venueStatus();

      pills.forEach(function (el) {
        el.classList.toggle('is-open', st.isOpen);
        el.classList.toggle('is-closed', !st.isOpen);
      });
      labels.forEach(function (el) {
        el.textContent = st.isOpen ? 'Open now' : 'Closed';
      });
      clocks.forEach(function (el) { el.textContent = dubaiClockString(); });

      cdTitle.forEach(function (el) {
        el.textContent = st.isOpen ? 'Last call in' : 'Doors open in';
      });

      var diff = Math.max(0, st.target - new Date());
      var totalSec = Math.floor(diff / 1000);
      var hrs = Math.floor(totalSec / 3600);
      var min = Math.floor((totalSec % 3600) / 60);
      var sec = totalSec % 60;

      cdWraps.forEach(function (wrap) {
        var h = $('[data-cd="h"]', wrap), m = $('[data-cd="m"]', wrap), s = $('[data-cd="s"]', wrap);
        if (h) h.textContent = pad(hrs);
        if (m) m.textContent = pad(min);
        if (s) s.textContent = pad(sec);
      });
    }

    // Highlight today's row in the footer hours list (Dubai's day, not the visitor's)
    var todayIdx = dubaiParts().weekday;
    $$('[data-day]').forEach(function (el) {
      if (parseInt(el.getAttribute('data-day'), 10) === todayIdx) el.classList.add('is-today');
    });

    if (pills.length || labels.length || clocks.length || cdWraps.length) {
      render();
      setInterval(render, 1000);
    }
  });

  /* ==================================================================
     11. TICKER — duplicate the group so the loop is seamless
     ================================================================== */
  safe('ticker', function () {
    $$('.ticker__track').forEach(function (track) {
      var group = $('.ticker__group', track);
      if (!group) return;
      var clone = group.cloneNode(true);
      clone.setAttribute('aria-hidden', 'true');
      track.appendChild(clone);
    });
  });

  /* ==================================================================
     12. PARALLAX
     ================================================================== */
  safe('parallax', function () {
    var els = $$('[data-parallax]');
    if (!els.length || reduceMotion || isTouch) return;
    var ticking = false;

    function update() {
      var vh = window.innerHeight;
      els.forEach(function (el) {
        var speed = parseFloat(el.getAttribute('data-parallax')) || 0.15;
        var r = el.getBoundingClientRect();
        if (r.bottom < -200 || r.top > vh + 200) return;
        var offset = (r.top + r.height / 2 - vh / 2) * speed * -1;
        el.style.transform = 'translate3d(0,' + offset.toFixed(2) + 'px,0)';
      });
      ticking = false;
    }
    on(window, 'scroll', function () {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
    update();
  });

  /* ==================================================================
     13. LINE-UP TABS
     ================================================================== */
  safe('tabs', function () {
    $$('[data-tabs]').forEach(function (group) {
      var buttons = $$('.tab', group);
      var panelWrap = document.querySelector(group.getAttribute('data-tabs'));
      if (!buttons.length || !panelWrap) return;

      function select(key) {
        buttons.forEach(function (b) {
          var active = b.getAttribute('data-tab') === key;
          b.classList.toggle('is-active', active);
          b.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        $$('[data-panel]', panelWrap).forEach(function (p) {
          var show = p.getAttribute('data-panel') === key;
          p.hidden = !show;
          if (show) { p.style.animation = 'none'; void p.offsetWidth; p.style.animation = ''; }
        });
      }

      buttons.forEach(function (b) {
        on(b, 'click', function () { select(b.getAttribute('data-tab')); });
      });

      // default to tonight in Dubai
      var today = String(dubaiParts().weekday);
      var match = buttons.filter(function (b) { return b.getAttribute('data-tab') === today; })[0];
      select(match ? today : buttons[0].getAttribute('data-tab'));

      // mark tonight's tab
      if (match) {
        var dot = document.createElement('span');
        dot.className = 'dot';
        dot.title = 'Tonight';
        match.appendChild(dot);
      }
    });
  });

  /* ==================================================================
     14. GALLERY FILTER + LIGHTBOX
     ================================================================== */
  safe('gallery', function () {
    var grid = $('.gallery');
    if (!grid) return;

    var items = $$('.gallery__item', grid);

    // --- filters
    $$('[data-filter]').forEach(function (btn) {
      on(btn, 'click', function () {
        var key = btn.getAttribute('data-filter');
        $$('[data-filter]').forEach(function (b) { b.classList.toggle('is-active', b === btn); });
        items.forEach(function (it) {
          var cat = it.getAttribute('data-cat') || '';
          var show = key === 'all' || cat === key;
          it.classList.toggle('is-hidden', !show);
        });
      });
    });

    // --- lightbox
    var box = $('.lightbox');
    if (!box) return;
    var img = $('[data-lb-img]', box);
    var cap = $('[data-lb-cap]', box);
    var cat = $('[data-lb-cat]', box);
    var idxEl = $('[data-lb-index]', box);
    var current = 0;

    function visible() { return items.filter(function (i) { return !i.classList.contains('is-hidden'); }); }

    function show(i) {
      var list = visible();
      if (!list.length) return;
      current = (i + list.length) % list.length;
      var it = list[current];
      var src = it.getAttribute('data-full') || ($('img', it) || {}).src;
      if (img) { img.src = src; img.alt = it.getAttribute('data-title') || 'King\'s Elite Lounge'; }
      if (cap) cap.textContent = it.getAttribute('data-title') || '';
      if (cat) cat.textContent = it.getAttribute('data-caption') || '';
      if (idxEl) idxEl.textContent = (current + 1) + ' / ' + list.length;
    }

    function open(i) {
      show(i);
      box.classList.add('is-open');
      document.body.classList.add('is-locked');
      box.setAttribute('aria-hidden', 'false');
      var c = $('.lb-close', box); if (c) c.focus();
    }
    function close() {
      box.classList.remove('is-open');
      document.body.classList.remove('is-locked');
      box.setAttribute('aria-hidden', 'true');
    }

    items.forEach(function (it) {
      on(it, 'click', function () { open(visible().indexOf(it)); });
      on(it, 'keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(visible().indexOf(it)); }
      });
    });

    on($('.lb-close', box), 'click', close);
    on($('.lb-prev', box), 'click', function () { show(current - 1); });
    on($('.lb-next', box), 'click', function () { show(current + 1); });
    on(box, 'click', function (e) { if (e.target === box) close(); });

    on(document, 'keydown', function (e) {
      if (!box.classList.contains('is-open')) return;
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowLeft') show(current - 1);
      if (e.key === 'ArrowRight') show(current + 1);
    });

    // swipe
    var sx = 0;
    on(box, 'touchstart', function (e) { sx = e.changedTouches[0].clientX; }, { passive: true });
    on(box, 'touchend', function (e) {
      var dx = e.changedTouches[0].clientX - sx;
      if (Math.abs(dx) > 55) show(dx < 0 ? current + 1 : current - 1);
    }, { passive: true });
  });

  /* ==================================================================
     15. TESTIMONIAL CAROUSEL
     ================================================================== */
  safe('quotes', function () {
    var root = $('.quotes');
    if (!root) return;
    var track = $('.quotes__track', root);
    var slides = $$('.quotes__slide', root);
    var dotsWrap = $('.dots', root);
    if (!track || slides.length < 1) return;

    var i = 0, timer = null;

    slides.forEach(function (_, n) {
      var b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('aria-label', 'Go to review ' + (n + 1));
      on(b, 'click', function () { go(n); restart(); });
      if (dotsWrap) dotsWrap.appendChild(b);
    });

    function go(n) {
      i = (n + slides.length) % slides.length;
      track.style.transform = 'translateX(' + (-i * 100) + '%)';
      if (dotsWrap) {
        $$('button', dotsWrap).forEach(function (d, k) { d.classList.toggle('is-active', k === i); });
      }
      slides.forEach(function (s, k) { s.setAttribute('aria-hidden', k === i ? 'false' : 'true'); });
    }
    function next() { go(i + 1); }
    function restart() { if (timer) clearInterval(timer); if (!reduceMotion) timer = setInterval(next, 6500); }

    on($('[data-quote-next]', root), 'click', function () { next(); restart(); });
    on($('[data-quote-prev]', root), 'click', function () { go(i - 1); restart(); });

    on(root, 'mouseenter', function () { if (timer) clearInterval(timer); });
    on(root, 'mouseleave', restart);

    var sx = 0;
    on(root, 'touchstart', function (e) { sx = e.changedTouches[0].clientX; }, { passive: true });
    on(root, 'touchend', function (e) {
      var dx = e.changedTouches[0].clientX - sx;
      if (Math.abs(dx) > 50) { dx < 0 ? next() : go(i - 1); restart(); }
    }, { passive: true });

    go(0);
    restart();
  });

  /* ==================================================================
     16. FORM VALIDATION HELPERS
     ================================================================== */
  function setError(field, msg) {
    if (!field) return;
    field.classList.add('has-error');
    var slot = $('.field__error', field);
    if (slot) slot.textContent = msg;
    var input = $('input, select, textarea', field);
    if (input) input.setAttribute('aria-invalid', 'true');
  }
  function clearError(field) {
    if (!field) return;
    field.classList.remove('has-error');
    var input = $('input, select, textarea', field);
    if (input) input.removeAttribute('aria-invalid');
  }

  var RX = {
    email: /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i,
    // UAE mobile (05x / +9715x) plus generous international fallback
    phone: /^(\+?\d{1,4}[\s-]?)?\(?\d{2,4}\)?[\s-]?\d{3}[\s-]?\d{3,4}$/
  };

  function validateField(input) {
    var field = input.closest('.field');
    if (input.type === 'checkbox' || input.type === 'radio') return true; // handled by validateScope
    var val = (input.value || '').trim();
    var type = input.getAttribute('data-validate') || input.type;

    if (input.hasAttribute('required') && !val) {
      setError(field, 'This field is required.');
      return false;
    }
    if (!val) { clearError(field); return true; }

    if (type === 'email' && !RX.email.test(val)) {
      setError(field, 'Enter a valid email address.'); return false;
    }
    if (type === 'tel' && !RX.phone.test(val.replace(/\s/g, ''))) {
      setError(field, 'Enter a valid phone number, e.g. 050 123 4567.'); return false;
    }
    if (input.name === 'name' && val.length < 2) {
      setError(field, 'Please enter your full name.'); return false;
    }
    if (input.name === 'message' && val.length < 10) {
      setError(field, 'Please add a little more detail (10 characters minimum).'); return false;
    }
    clearError(field);
    return true;
  }

  function wireLiveValidation(form) {
    $$('input, select, textarea', form).forEach(function (input) {
      on(input, 'blur', function () { validateField(input); });
      on(input, 'input', function () {
        if (input.closest('.field') && input.closest('.field').classList.contains('has-error')) {
          validateField(input);
        }
      });
    });
  }

  function validateScope(scope) {
    var ok = true;
    $$('input, select, textarea', scope).forEach(function (input) {
      if (input.type === 'hidden' || input.disabled) return;
      if (input.type === 'checkbox') {
        if (input.hasAttribute('required') && !input.checked) {
          setError(input.closest('.field') || input.closest('.check'), 'Please confirm to continue.');
          ok = false;
        }
        return;
      }
      if (input.type === 'radio') return;
      if (!validateField(input)) ok = false;
    });
    // radio groups
    var seen = {};
    $$('input[type="radio"][required]', scope).forEach(function (r) {
      if (seen[r.name]) return;
      seen[r.name] = true;
      var checked = scope.querySelector('input[name="' + r.name + '"]:checked');
      if (!checked) {
        setError(r.closest('.field'), 'Please choose an option.');
        ok = false;
      } else {
        clearError(r.closest('.field'));
      }
    });
    return ok;
  }

  function showNote(form, kind, html) {
    $$('.form-note', form).forEach(function (n) { n.classList.remove('is-shown'); });
    var note = $('.form-note--' + kind, form);
    if (!note) return;
    var body = $('[data-note-body]', note);
    if (body && html) body.innerHTML = html;
    note.classList.add('is-shown');
    note.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
  }

  /* ==================================================================
     17. RESERVATION FORM (multi-step + WhatsApp handoff)
     ================================================================== */
  safe('reservation', function () {
    var form = $('#reservation-form');
    if (!form) return;

    var sets  = $$('.fieldset', form);
    var steps = $$('.step', form.closest('section') || document);
    var btnNext = $('[data-next]', form);
    var btnPrev = $('[data-prev]', form);
    var btnSend = $('[data-submit]', form);
    var idx = 0, first = true;

    wireLiveValidation(form);

    /* --- preselect seating from ?table=Gold on the pricing cards --- */
    try {
      var wanted = new URLSearchParams(location.search).get('table');
      if (wanted) {
        var map = { standard: 's-standard', silver: 's-silver', gold: 's-gold', royal: 's-royal' };
        var radio = document.getElementById(map[wanted.toLowerCase()] || '');
        if (radio) radio.checked = true;
      }
    } catch (err) {}

    /* --- date bounds in Dubai time --- */
    var dateInput = form.querySelector('input[name="date"]');
    if (dateInput) {
      var p = dubaiParts();
      var todayISO = p.year + '-' + pad(p.month) + '-' + pad(p.day);
      // Before 04:00 Dubai the venue is still on "last night" — today is still bookable.
      dateInput.min = todayISO;
      var max = new Date(dubaiDate(p.year, p.month, p.day, 12, 0).getTime() + 90 * 864e5);
      var mp = dubaiParts(max);
      dateInput.max = mp.year + '-' + pad(mp.month) + '-' + pad(mp.day);
      if (!dateInput.value) dateInput.value = todayISO;
    }

    /* --- arrival time: only within venue hours --- */
    var timeSelect = form.querySelector('select[name="time"]');
    if (timeSelect && !timeSelect.options.length) {
      var slots = [];
      for (var m = OPEN_MIN; m <= 24 * 60 + CLOSE_MIN - 60; m += 30) {
        var mm = m % (24 * 60);
        slots.push(pad(Math.floor(mm / 60)) + ':' + pad(mm % 60));
      }
      var ph = new Option('Select arrival time', '');
      ph.disabled = true; ph.selected = true;
      timeSelect.appendChild(ph);
      slots.forEach(function (s) {
        var hh = parseInt(s.split(':')[0], 10);
        var label = s + (hh < 12 ? '  (after midnight)' : '');
        timeSelect.appendChild(new Option(label, s));
      });
    }

    function paint() {
      sets.forEach(function (fs, n) { fs.classList.toggle('is-active', n === idx); });
      steps.forEach(function (st, n) {
        st.classList.toggle('is-active', n === idx);
        st.classList.toggle('is-done', n < idx);
      });
      if (btnPrev) btnPrev.hidden = idx === 0;
      if (btnNext) btnNext.hidden = idx >= sets.length - 1;
      if (btnSend) btnSend.hidden = idx < sets.length - 1;
      if (idx === sets.length - 1) buildReview();
      if (!first) {
        var head = form.getBoundingClientRect().top + window.scrollY - 140;
        window.scrollTo({ top: head, behavior: reduceMotion ? 'auto' : 'smooth' });
      }
      first = false;
    }

    function data() {
      var fd = new FormData(form), o = {};
      fd.forEach(function (v, k) { o[k] = v; });
      return o;
    }

    function prettyTime(t) {
      if (!t) return '—';
      var hh = parseInt(t.split(':')[0], 10), mm = t.split(':')[1];
      var suffix = hh >= 12 ? 'PM' : 'AM';
      var h12 = hh % 12 || 12;
      return h12 + ':' + mm + ' ' + suffix + (hh < 12 ? ' (after midnight)' : '');
    }
    function prettyDate(d) {
      if (!d) return '—';
      var parts = d.split('-');
      var dt = new Date(Date.UTC(+parts[0], +parts[1] - 1, +parts[2]));
      return dt.toLocaleDateString('en-GB', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC'
      });
    }

    function buildReview() {
      var wrap = $('[data-review]', form);
      if (!wrap) return;
      var d = data();
      var rows = [
        ['Name', d.name || '—'],
        ['Phone', d.phone || '—'],
        ['Email', d.email || '—'],
        ['Date', prettyDate(d.date)],
        ['Arrival', prettyTime(d.time)],
        ['Guests', d.guests || '—'],
        ['Seating', d.seating || '—'],
        ['Occasion', d.occasion || 'None'],
        ['Notes', d.notes || 'None']
      ];
      wrap.innerHTML = rows.map(function (r) {
        return '<div><dt>' + r[0] + '</dt><dd>' + String(r[1]).replace(/</g, '&lt;') + '</dd></div>';
      }).join('');
    }

    on(btnNext, 'click', function () {
      if (!validateScope(sets[idx])) return;
      idx = Math.min(idx + 1, sets.length - 1);
      paint();
    });
    on(btnPrev, 'click', function () {
      idx = Math.max(idx - 1, 0);
      paint();
    });

    on(form, 'submit', function (e) {
      e.preventDefault();
      if (!validateScope(form)) {
        showNote(form, 'err', 'Some details still need attention. Please review the highlighted fields.');
        return;
      }
      var d = data();
      if (btnSend) { btnSend.classList.add('is-busy'); btnSend.textContent = 'Sending…'; }

      var lines = [
        'TABLE RESERVATION — King\'s Elite Lounge',
        '',
        'Name: ' + d.name,
        'Phone: ' + d.phone,
        'Email: ' + (d.email || '—'),
        'Date: ' + prettyDate(d.date),
        'Arrival: ' + prettyTime(d.time),
        'Guests: ' + d.guests,
        'Seating: ' + d.seating,
        'Occasion: ' + (d.occasion || '—'),
        'Notes: ' + (d.notes || '—')
      ];
      var wa = 'https://wa.me/' + VENUE.whatsapp + '?text=' + encodeURIComponent(lines.join('\n'));

      setTimeout(function () {
        if (btnSend) { btnSend.classList.remove('is-busy'); btnSend.textContent = 'Confirm request'; }
        showNote(form, 'ok',
          '<strong>Request received, ' + String(d.name).split(' ')[0].replace(/</g, '&lt;') + '.</strong><br>' +
          'Your table request for <b>' + prettyDate(d.date) + '</b> at <b>' + prettyTime(d.time) + '</b> has been prepared. ' +
          'Our host team confirms every booking personally on WhatsApp — a new tab has opened so you can send it through. ' +
          'If it did not open, call us on <a href="tel:' + VENUE.phoneRaw + '" style="color:var(--gold)">' + VENUE.phone + '</a>.'
        );
        window.open(wa, '_blank', 'noopener');
        try { form.reset(); } catch (err) {}
      }, 900);
    });

    paint();
  });

  /* ==================================================================
     18. CONTACT / SIMPLE FORMS
     ================================================================== */
  safe('simpleForms', function () {
    $$('form[data-simple-form]').forEach(function (form) {
      wireLiveValidation(form);
      on(form, 'submit', function (e) {
        e.preventDefault();
        if (!validateScope(form)) {
          showNote(form, 'err', 'Please check the highlighted fields and try again.');
          return;
        }
        var btn = $('[type="submit"]', form);
        var label = btn ? btn.textContent : '';
        if (btn) { btn.classList.add('is-busy'); btn.textContent = 'Sending…'; }

        setTimeout(function () {
          if (btn) { btn.classList.remove('is-busy'); btn.textContent = label; }
          showNote(form, 'ok',
            '<strong>Thank you — your message is on its way.</strong><br>' +
            'Our team replies within a few hours during opening times (9:30 PM – 4:00 AM, Dubai). ' +
            'For anything urgent, WhatsApp us on <a href="https://wa.me/' + VENUE.whatsapp + '" style="color:var(--gold)">' + VENUE.phone + '</a>.'
          );
          form.reset();
        }, 900);
      });
    });
  });

  /* ==================================================================
     19. NEWSLETTER
     ================================================================== */
  safe('newsletter', function () {
    $$('form[data-newsletter]').forEach(function (form) {
      on(form, 'submit', function (e) {
        e.preventDefault();
        var input = $('input[type="email"]', form);
        var field = input ? input.closest('.field') : null;
        if (!input || !RX.email.test(input.value.trim())) {
          setError(field, 'Enter a valid email address.');
          return;
        }
        clearError(field);
        var btn = $('[type="submit"]', form);
        if (btn) btn.textContent = 'Subscribed ✓';
        input.value = '';
        input.placeholder = 'You are on the guest list.';
        setTimeout(function () { if (btn) btn.textContent = 'Join'; }, 3200);
      });
    });
  });

  /* ==================================================================
     20. AGE GATE — Dubai licensed venues are 21+
     ================================================================== */
  safe('ageGate', function () {
    var gate = $('.agegate');
    if (!gate) return;
    var KEY = 'kel-age-ok';
    var passed = false;
    try { passed = sessionStorage.getItem(KEY) === '1'; } catch (e) { passed = false; }
    if (passed) return;

    setTimeout(function () {
      gate.classList.add('is-open');
      document.body.classList.add('is-locked');
      var y = $('[data-age-yes]', gate); if (y) y.focus();
    }, 650);

    on($('[data-age-yes]', gate), 'click', function () {
      try { sessionStorage.setItem(KEY, '1'); } catch (e) {}
      gate.classList.remove('is-open');
      document.body.classList.remove('is-locked');
      setTimeout(function () { gate.remove(); }, 600);
    });

    on($('[data-age-no]', gate), 'click', function () {
      var card = $('.agegate__card', gate);
      if (card) {
        card.innerHTML =
          '<h2 class="gold-text">Another time</h2>' +
          '<p>Entry to King\'s Elite Lounge is restricted to guests aged ' + VENUE.minAge + ' and over, ' +
          'in line with Dubai licensing regulations. Valid photo ID is checked at the door.</p>' +
          '<p class="small muted">You are welcome back when you meet the age requirement.</p>';
      }
    });
  });

  /* ==================================================================
     21. MENU PDF — open in a new tab, everywhere
     ================================================================== */
  safe('menuLinks', function () {
    $$('[data-menu-link]').forEach(function (a) {
      a.setAttribute('href', VENUE.menuPdf);
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
    });
  });

  /* ==================================================================
     22. SMOOTH ANCHOR SCROLL
     ================================================================== */
  safe('anchors', function () {
    on(document, 'click', function (e) {
      var a = e.target.closest('a[href^="#"]');
      if (!a) return;
      var id = a.getAttribute('href');
      if (!id || id === '#' || id.length < 2) return;
      var t = document.querySelector(id);
      if (!t) return;
      e.preventDefault();
      var y = t.getBoundingClientRect().top + window.scrollY - 92;
      window.scrollTo({ top: y, behavior: reduceMotion ? 'auto' : 'smooth' });
      history.replaceState(null, '', id);
    });
  });

  /* ==================================================================
     23. YEAR STAMP
     ================================================================== */
  $$('[data-year]').forEach(function (el) { el.textContent = new Date().getFullYear(); });

  /* ==================================================================
     24. CARD TILT (subtle, desktop only)
     ================================================================== */
  safe('tilt', function () {
    if (isTouch || reduceMotion) return;
    $$('[data-tilt]').forEach(function (el) {
      on(el, 'mousemove', function (e) {
        var r = el.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width - 0.5;
        var py = (e.clientY - r.top) / r.height - 0.5;
        el.style.transform = 'perspective(900px) rotateY(' + (px * 5).toFixed(2) + 'deg) rotateX(' + (-py * 5).toFixed(2) + 'deg) translateY(-6px)';
      });
      on(el, 'mouseleave', function () { el.style.transform = ''; });
    });
  });

})();
