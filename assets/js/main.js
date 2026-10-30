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
        label.textContent = el.getAttribute("data-past-label") || "Recent";
      });
    }
  });

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
     Media: only one thing plays at a time. Audio is routed through an
     analyser so the ridgelines can draw the actual sound.
     ========================================================================== */

  var media = [];
  function pauseOthers(el) {
    media.forEach(function (m) { if (m !== el && !m.paused) m.pause(); });
  }
  document.querySelectorAll("video").forEach(function (v) {
    media.push(v);
    v.addEventListener("play", function () { pauseOthers(v); });
  });

  var actx = null;
  function ensureGraph(audio) {
    // Only reroute audio once the AudioContext is definitely running,
    // so playback can never end up silent.
    if (reduceMotion || audio._graph) return;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { actx = actx || new AC(); } catch (e) { return; }
    var connect = function () {
      if (actx.state !== "running" || audio._graph) return;
      try {
        var src = actx.createMediaElementSource(audio);
        var an = actx.createAnalyser();
        an.fftSize = 2048;
        an.smoothingTimeConstant = 0.8;
        src.connect(an);
        an.connect(actx.destination);
        audio._graph = { an: an, buf: new Uint8Array(an.frequencyBinCount), rate: actx.sampleRate };
      } catch (e) { /* plays normally without the visual */ }
    };
    if (actx.state === "running") connect();
    else actx.resume().then(connect, function () {});
  }

  function fmt(s) {
    if (!isFinite(s)) return "0:00";
    var m = Math.floor(s / 60);
    var r = Math.floor(s % 60);
    return m + ":" + (r < 10 ? "0" : "") + r;
  }

  document.querySelectorAll(".player").forEach(function (p) {
    var audio = p.querySelector("audio");
    var btn = p.querySelector(".player-btn");
    var range = p.querySelector(".player-range");
    var time = p.querySelector(".player-time");
    if (!audio || !btn || !range) return;
    media.push(audio);
    var label = btn.getAttribute("aria-label") || "Play";
    function sync() {
      if (audio.duration) range.value = (audio.currentTime / audio.duration) * 1000;
      if (time) time.textContent = fmt(audio.currentTime) + " / " + fmt(audio.duration);
    }
    btn.addEventListener("click", function () {
      if (audio.paused) {
        ensureGraph(audio);
        var pr = audio.play();
        if (pr && pr.catch) pr.catch(function () {});
      } else {
        audio.pause();
      }
    });
    audio.addEventListener("play", function () {
      pauseOthers(audio);
      p.classList.add("is-playing");
      btn.setAttribute("aria-label", label.replace("Play", "Pause"));
      wake();
    });
    audio.addEventListener("pause", function () { p.classList.remove("is-playing"); btn.setAttribute("aria-label", label); });
    audio.addEventListener("ended", function () { audio.currentTime = 0; sync(); });
    audio.addEventListener("timeupdate", sync);
    audio.addEventListener("loadedmetadata", sync);
    range.addEventListener("input", function () {
      if (audio.duration) audio.currentTime = (range.value / 1000) * audio.duration;
    });
  });

  /* ==========================================================================
     Ridgelines: stacked waveform lines (from my style tile inspiration).
     At rest each line is a slice of smooth noise. While a track plays, each
     line is a moment of that track's spectrum: newest at the front, older
     lines scrolling back, with bass in the middle and highs at the edges.
     ========================================================================== */

  var BG = "#15120F";
  var BACK = [238, 231, 220];   // cream (far lines)
  var FRONT = [226, 104, 60];   // ember (near lines)
  var BINS = 72;

  function makeNoise(seed) {
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
      var top = a + (b - a) * u;
      return top + ((c + (d - c) * u) - top) * v;
    }
    return function (x, y) {
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

  function Ridge(canvas, cfg) {
    this.canvas = canvas;
    this.cfg = cfg;
    this.noise = makeNoise(cfg.seed);
    this.mix = 0;          // 0 = noise, 1 = live spectrum
    this.hist = [];
    this.audio = cfg.audio || null;
    this.center = cfg.center;
    this.targetCenter = cfg.center;
    this.visible = true;
  }

  Ridge.prototype.playing = function () {
    return !!(this.audio && !this.audio.paused && this.audio._graph);
  };

  Ridge.prototype.pushSpectrum = function (lines) {
    var g = this.audio._graph;
    g.an.getByteFrequencyData(g.buf);
    var nyq = g.rate / 2, n = g.buf.length;
    var row = new Float32Array(BINS);
    for (var j = 0; j < BINS; j++) {
      var f = 45 * Math.pow(11000 / 45, j / (BINS - 1));
      var idx = Math.min(n - 1, Math.round((f / nyq) * n));
      var v = (g.buf[idx] + g.buf[Math.max(0, idx - 1)] + g.buf[Math.min(n - 1, idx + 1)]) / (3 * 255);
      row[j] = Math.pow(v, 1.7) * (1 - j / (BINS * 2.2));
    }
    this.hist.push(row);
    while (this.hist.length > lines) this.hist.shift();
  };

  Ridge.prototype.draw = function (now) {
    var s = sizeCanvas(this.canvas);
    if (!s) return;
    var c = this.cfg, ctx = s.ctx, w = s.w, h = s.h;
    var small = w < 700;
    var lines = c.lines(w);

    var target = this.playing() ? 1 : 0;
    this.mix += (target - this.mix) * 0.06;
    if (Math.abs(target - this.mix) < 0.002) this.mix = target;
    if (this.playing()) this.pushSpectrum(lines);
    while (this.hist.length < lines) this.hist.unshift(new Float32Array(BINS));

    this.center += (this.targetCenter - this.center) * 0.04;

    var top = h * c.top(small), bottom = h * c.bottom;
    var amp = h * c.amp(small);
    var t = c.animate ? (now || 0) * 0.00005 : c.seed * 0.37;
    var step = Math.max(4, w / 160);
    var sigma = c.spread;

    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, w, h);

    for (var i = 0; i < lines; i++) {
      var k = lines === 1 ? 1 : i / (lines - 1);
      var base = top + (bottom - top) * k;
      var row = this.hist[i];
      ctx.beginPath();
      ctx.moveTo(0, base);
      for (var x = 0; x <= w + step; x += step) {
        var nx = x / w;
        var dx = nx - this.center;
        var env = c.floor + (1 - c.floor) * Math.exp(-(dx * dx) / (2 * sigma * sigma));
        var nd = this.mix < 1 ? Math.pow(this.noise(nx * c.freq + c.seed * 3.1, i * 0.16 + t), 2.4) : 0;
        var sd = 0;
        if (this.mix > 0) {
          var pos = Math.min(1, Math.abs(nx - 0.5) * 2.1) * (BINS - 1);
          var i0 = Math.floor(pos), fr = pos - i0;
          var i1 = Math.min(BINS - 1, i0 + 1);
          sd = (row[i0] * (1 - fr) + row[i1] * fr) * 1.15;
        }
        var d = nd * (1 - this.mix) + sd * this.mix;
        ctx.lineTo(x, base - d * env * amp);
      }
      ctx.lineTo(w + step, h);
      ctx.lineTo(0, h);
      ctx.closePath();
      ctx.fillStyle = BG;
      ctx.fill();
      var mixK = Math.pow(k, 1.6);
      var r = Math.round(BACK[0] + (FRONT[0] - BACK[0]) * mixK);
      var g = Math.round(BACK[1] + (FRONT[1] - BACK[1]) * mixK);
      var b = Math.round(BACK[2] + (FRONT[2] - BACK[2]) * mixK);
      ctx.strokeStyle = "rgba(" + r + "," + g + "," + b + "," + (0.16 + 0.74 * k).toFixed(3) + ")";
      ctx.lineWidth = c.lineWidth;
      ctx.stroke();
    }
  };

  Ridge.prototype.needsFrame = function () {
    if (!this.visible) return false;
    return this.cfg.animate || this.playing() || this.mix > 0;
  };

  var ridges = [];

  // Hero / message-page background
  document.querySelectorAll("canvas[data-ridges]").forEach(function (cv) {
    var scope = cv.closest("[data-viz-scope]") || cv.parentElement;
    var r = new Ridge(cv, {
      seed: 20261030,
      audio: scope.querySelector("audio"),
      animate: !reduceMotion,
      lines: function (w) { return w < 700 ? 22 : 34; },
      top: function (small) { return small ? 0.5 : 0.34; },
      bottom: 1.02,
      amp: function (small) { return small ? 0.17 : 0.26; },
      freq: 3.4,
      center: 0.6,
      spread: 0.22,
      floor: 0.18,
      lineWidth: 1.15
    });
    ridges.push(r);
    if (!reduceMotion) {
      scope.addEventListener("pointermove", function (e) {
        var b = scope.getBoundingClientRect();
        r.targetCenter = 0.15 + 0.7 * ((e.clientX - b.left) / b.width);
      });
      scope.addEventListener("pointerleave", function () { r.targetCenter = 0.6; });
    }
  });

  // Still covers on project cards (they come alive while their track plays)
  document.querySelectorAll("canvas[data-cover]").forEach(function (cv) {
    var seed = parseInt(cv.getAttribute("data-cover"), 10) || 1;
    var scope = cv.closest("[data-viz-scope]");
    ridges.push(new Ridge(cv, {
      seed: seed,
      audio: scope ? scope.querySelector("audio") : null,
      animate: false,
      lines: function () { return 22; },
      top: function () { return 0.26; },
      bottom: 0.98,
      amp: function () { return 0.55; },
      freq: 2.6 + (seed % 3) * 0.5,
      center: 0.5,
      spread: 0.17 + (seed % 4) * 0.03,
      floor: 0.12,
      lineWidth: 1
    }));
  });

  if ("IntersectionObserver" in window) {
    var vis = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        ridges.forEach(function (r) { if (r.canvas === e.target) r.visible = e.isIntersecting; });
      });
      wake();
    });
    ridges.forEach(function (r) { vis.observe(r.canvas); });
  }

  function drawAll(force) {
    ridges.forEach(function (r) { if (force || r.needsFrame()) r.draw(performance.now()); });
  }

  var running = false, last = 0;
  function loop(now) {
    if (!document.hidden && now - last > 33) {
      last = now;
      drawAll(false);
    }
    if (ridges.some(function (r) { return r.needsFrame(); })) requestAnimationFrame(loop);
    else running = false;
  }
  function wake() {
    if (!running && !reduceMotion) { running = true; requestAnimationFrame(loop); }
  }

  drawAll(true);
  wake();

  var resizeTimer;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { drawAll(true); }, 120);
  });
  document.addEventListener("visibilitychange", function () { if (!document.hidden) wake(); });

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
        drawAll(true);
      });
    });
    var wanted = new URLSearchParams(window.location.search).get("filter");
    if (wanted) {
      filters.forEach(function (b) { if (b.getAttribute("data-filter") === wanted) b.click(); });
    }
  }
})();
