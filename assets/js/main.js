/* Ethan Stirnemann — site scripts (no libraries) */
(function () {
  "use strict";

  var root = document.documentElement;
  root.classList.add("js");
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Mobile navigation ---------- */
  var toggle = document.querySelector(".nav-toggle");
  var nav = document.getElementById("site-nav");
  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var open = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", String(!open));
      nav.classList.toggle("is-open", !open);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && nav.classList.contains("is-open")) {
        toggle.setAttribute("aria-expanded", "false");
        nav.classList.remove("is-open");
        toggle.focus();
      }
    });
  }

  /* ---------- Footer year ---------- */
  document.querySelectorAll("[data-year]").forEach(function (el) {
    el.textContent = new Date().getFullYear();
  });

  /* ---------- Events: "Upcoming" turns into "Recent" after the date ---------- */
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  document.querySelectorAll("[data-event-date]").forEach(function (el) {
    var parts = el.getAttribute("data-event-date").split("-");
    var d = new Date(+parts[0], +parts[1] - 1, +parts[2]);
    if (d < today) {
      el.classList.add("is-past");
      el.querySelectorAll("[data-event-label]").forEach(function (label) {
        label.textContent = el.hasAttribute("data-past-label") ? el.getAttribute("data-past-label") : "Recent";
      });
    }
  });

  /* ---------- Work filters ---------- */
  var filters = document.querySelectorAll(".filter");
  if (filters.length) {
    var cards = document.querySelectorAll(".card[data-category]");
    filters.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var cat = btn.getAttribute("data-filter");
        filters.forEach(function (b) { b.setAttribute("aria-pressed", String(b === btn)); });
        cards.forEach(function (card) {
          var cats = card.getAttribute("data-category").split(" ");
          card.hidden = !(cat === "all" || cats.indexOf(cat) !== -1);
        });
        drawCovers();
      });
    });
    // Links like work.html?filter=screen open with that category selected
    var wanted = new URLSearchParams(window.location.search).get("filter");
    if (wanted) {
      filters.forEach(function (b) {
        if (b.getAttribute("data-filter") === wanted) b.click();
      });
    }
  }

  /* ---------- Copy short bio ---------- */
  document.querySelectorAll("[data-copy]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var target = document.getElementById(btn.getAttribute("data-copy"));
      if (!target) return;
      var text = target.innerText.trim();
      var done = function () {
        var old = btn.textContent;
        btn.textContent = "Copied ✓";
        setTimeout(function () { btn.textContent = old; }, 1800);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, function () {});
      } else {
        var range = document.createRange();
        range.selectNodeContents(target);
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
    });
  });

  /* ---------- Audio players ---------- */
  function fmt(s) {
    if (!isFinite(s)) return "0:00";
    var m = Math.floor(s / 60);
    var r = Math.floor(s % 60);
    return m + ":" + (r < 10 ? "0" : "") + r;
  }
  var players = [];
  document.querySelectorAll(".player").forEach(function (p) {
    var audio = p.querySelector("audio");
    var btn = p.querySelector(".player-btn");
    var range = p.querySelector(".player-range");
    var time = p.querySelector(".player-time");
    if (!audio || !btn || !range) return;
    players.push(audio);
    var label = btn.getAttribute("aria-label") || "Play";
    function sync() {
      if (audio.duration) range.value = (audio.currentTime / audio.duration) * 1000;
      time.textContent = fmt(audio.currentTime) + " / " + fmt(audio.duration);
    }
    btn.addEventListener("click", function () {
      if (audio.paused) {
        players.forEach(function (a) { if (a !== audio) a.pause(); });
        audio.play();
      } else {
        audio.pause();
      }
    });
    audio.addEventListener("play", function () { p.classList.add("is-playing"); btn.setAttribute("aria-label", label.replace("Play", "Pause")); });
    audio.addEventListener("pause", function () { p.classList.remove("is-playing"); btn.setAttribute("aria-label", label); });
    audio.addEventListener("timeupdate", sync);
    audio.addEventListener("loadedmetadata", sync);
    range.addEventListener("input", function () {
      if (audio.duration) audio.currentTime = (range.value / 1000) * audio.duration;
    });
  });

  /* ---------- Reveal on scroll ---------- */
  var reveals = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && !reduceMotion) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-in");
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: "0px 0px -8% 0px" });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add("is-in"); });
  }

  /* ==========================================================================
     Ridgelines: stacked waveform lines (from my style tile inspiration).
     Each line is a slice of smooth noise; lower lines are "closer" and
     hide the ones behind them.
     ========================================================================== */

  function makeNoise(seed) {
    // Small seeded value-noise generator
    var s = seed >>> 0;
    function rand() {
      s += 0x6D2B79F5;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    var SIZE = 256;
    var vals = new Float32Array(SIZE * SIZE);
    for (var i = 0; i < vals.length; i++) vals[i] = rand();
    function smooth(t) { return t * t * (3 - 2 * t); }
    function n2(x, y) {
      var xi = Math.floor(x), yi = Math.floor(y);
      var xf = x - xi, yf = y - yi;
      var x0 = ((xi % SIZE) + SIZE) % SIZE, y0 = ((yi % SIZE) + SIZE) % SIZE;
      var x1 = (x0 + 1) % SIZE, y1 = (y0 + 1) % SIZE;
      var a = vals[y0 * SIZE + x0], b = vals[y0 * SIZE + x1];
      var c = vals[y1 * SIZE + x0], d = vals[y1 * SIZE + x1];
      var u = smooth(xf), v = smooth(yf);
      return (a + (b - a) * u) + ((c + (d - c) * u) - (a + (b - a) * u)) * v;
    }
    return function fbm(x, y) {
      return n2(x, y) * 0.6 + n2(x * 2.1, y * 2.1) * 0.28 + n2(x * 4.3, y * 4.3) * 0.12;
    };
  }

  function sizeCanvas(canvas) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return null;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, w: w, h: h };
  }

  function drawRidges(ctx, w, h, o) {
    ctx.fillStyle = o.bg;
    if (o.clear) ctx.fillRect(0, 0, w, h);
    else ctx.clearRect(0, 0, w, h);
    var lines = o.lines;
    var step = Math.max(4, w / 180);
    var sigma = o.spread;
    for (var i = 0; i < lines; i++) {
      var k = lines === 1 ? 1 : i / (lines - 1);
      var base = o.top + (o.bottom - o.top) * k;
      ctx.beginPath();
      ctx.moveTo(0, base);
      for (var x = 0; x <= w + step; x += step) {
        var nx = x / w;
        var dx = nx - o.center;
        var env = o.floor + (1 - o.floor) * Math.exp(-(dx * dx) / (2 * sigma * sigma));
        var n = o.noise(nx * o.freq + o.seedX, i * 0.16 + o.t);
        var y = base - Math.pow(n, 2.4) * env * o.amp;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(w + step, h);
      ctx.lineTo(0, h);
      ctx.closePath();
      ctx.fillStyle = o.bg;
      ctx.fill();
      ctx.strokeStyle = "rgba(" + o.rgb + "," + (0.22 + 0.68 * k).toFixed(3) + ")";
      ctx.lineWidth = o.lineWidth;
      ctx.stroke();
    }
  }

  /* Hero: slowly drifting lines that lean toward the pointer */
  var hero = document.querySelector("canvas[data-ridges]");
  if (hero) {
    var heroNoise = makeNoise(20261030);
    var center = 0.62, targetCenter = 0.62;
    var visible = true;
    var last = 0;
    var t0 = performance.now();

    var heroFrame = function (now) {
      var s = sizeCanvas(hero);
      if (!s) return;
      center += (targetCenter - center) * 0.04;
      var small = s.w < 700;
      drawRidges(s.ctx, s.w, s.h, {
        noise: heroNoise,
        lines: small ? 22 : 34,
        top: s.h * (small ? 0.5 : 0.36),
        bottom: s.h * 1.02,
        amp: s.h * (small ? 0.16 : 0.24),
        freq: 3.4,
        seedX: 11.3,
        center: center,
        spread: 0.2,
        floor: 0.18,
        t: ((now || t0) - t0) * 0.00005,
        bg: "#0D1016",
        rgb: "95,175,198",
        lineWidth: 1.15,
        clear: true
      });
    };

    var loop = function (now) {
      if (visible && !document.hidden && now - last > 33) {
        last = now;
        heroFrame(now);
      }
      requestAnimationFrame(loop);
    };

    if (reduceMotion) {
      heroFrame(t0);
      window.addEventListener("resize", function () { heroFrame(t0); });
    } else {
      if ("IntersectionObserver" in window) {
        new IntersectionObserver(function (e) { visible = e[0].isIntersecting; }).observe(hero);
      }
      var heroSection = hero.parentElement;
      heroSection.addEventListener("pointermove", function (e) {
        var r = heroSection.getBoundingClientRect();
        targetCenter = 0.15 + 0.7 * ((e.clientX - r.left) / r.width);
      });
      heroSection.addEventListener("pointerleave", function () { targetCenter = 0.62; });
      requestAnimationFrame(loop);
    }
  }

  /* Project covers: a still "ridge" image per project, seeded so each differs */
  function drawCovers() {
    document.querySelectorAll("canvas[data-cover]").forEach(function (c) {
      var s = sizeCanvas(c);
      if (!s) return;
      var seed = parseInt(c.getAttribute("data-cover"), 10) || 1;
      var noise = makeNoise(seed * 7919);
      drawRidges(s.ctx, s.w, s.h, {
        noise: noise,
        lines: 20,
        top: s.h * 0.28,
        bottom: s.h * 0.98,
        amp: s.h * 0.55,
        freq: 2.6 + (seed % 3) * 0.5,
        seedX: seed * 3.1,
        center: 0.3 + ((seed * 37) % 40) / 100,
        spread: 0.16 + (seed % 4) * 0.03,
        floor: 0.12,
        t: seed * 0.37,
        bg: "#0D1016",
        rgb: "95,175,198",
        lineWidth: 1,
        clear: true
      });
    });
  }
  drawCovers();

  var resizeTimer;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(drawCovers, 120);
  });
})();
