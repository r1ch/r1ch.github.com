/* bradi.sh flowers: an endless, responsive field.
 *
 * The world is an infinite plane in "world units". A Poisson-disc sampler (Bridson) grows outwards from a
 * seed; every sample is joined to its parent by a stem, and samples that land on the text (drawn once into a
 * mask at the origin) or win a 1 % lottery become flowers. The sampler only ever fills the area around the
 * viewport: as the camera moves, the points on the edge of what exists are put back in the queue and carry
 * on growing into the newly uncovered strip. Nothing already planted is touched, so flowers that stay in view
 * stay exactly as they are. Chunks more than a screen away are forgotten.
 *
 * Optional config before loading:  window.FLOWERS = { text: "404", dull: true }
 * Default text is the query string (bradi.sh/flowers?hello) or "bradish".
 */
(function () {
  "use strict";

  const cfg = window.FLOWERS || {};
  const query = location.search ? decodeURIComponent(location.search.slice(1)) : "";
  const text = cfg.text || query || "bradish";
  const dull = !!cfg.dull;

  // ---- tunables -----------------------------------------------------------------------------------------
  const RADIUS = 10;            // minimum distance between samples (world units)
  const TRIES = 15;             // candidates per parent before it is retired
  const HOME = { w: 1200, h: 600, font: 300 };   // the original fixed frame; a viewport this wide shows it 1:1
  const ZOOM_MIN = 0.4, ZOOM_MAX = 1.5;          // css px per world unit = clamp(viewport width / HOME.w)
  const GROW_MARGIN = 160;      // plant this far beyond the viewport, so slow scrolling reveals finished flowers
  const SNAP = 64;              // only re-plan growth when the view has moved this far
  const STEP_HOME = 100;        // ms per generation inside the home frame (as the original)
  const STEP_AWAY = 35;         // ms per generation elsewhere, so growth keeps up with scrolling
  const STRAY = 0.01;           // chance that a sample off the text flowers anyway
  const STEM_MS = 200, BLOOM_MS = 1000;

  // ---- colour -------------------------------------------------------------------------------------------
  const NAMED = {
    salmon: [250, 128, 114], lemonchiffon: [255, 250, 205], gold: [255, 215, 0], red: [255, 0, 0],
    yellow: [255, 255, 0], rosybrown: [188, 143, 143], saddlebrown: [139, 69, 19], white: [255, 255, 255],
    darkgrey: [169, 169, 169], lightgreen: [144, 238, 144], green: [0, 128, 0], darkgreen: [0, 100, 0],
    black: [0, 0, 0], grey: [128, 128, 128], lightgrey: [211, 211, 211],
  };
  const scale = (domain, names) => {
    const cols = names.map(n => NAMED[n]);
    return t => {
      let i = 1;
      while (i < domain.length - 1 && t > domain[i]) i++;
      const u = (t - domain[i - 1]) / (domain[i] - domain[i - 1]), a = cols[i - 1], b = cols[i];
      return `rgb(${a[0] + (b[0] - a[0]) * u | 0},${a[1] + (b[1] - a[1]) * u | 0},${a[2] + (b[2] - a[2]) * u | 0})`;
    };
  };
  const grey = scale([0, 0.25, 0.5, 1], ["black", "darkgrey", "grey", "lightgrey"]);
  const petal = dull ? grey : scale([0, 0.5, 1], ["salmon", "lemonchiffon", "gold"]);
  const sepal = dull ? grey : scale([0, 1], ["red", "yellow"]);
  const carpal = dull ? grey : scale([0, 1], ["rosybrown", "saddlebrown"]);
  const stamen = dull ? grey : scale([0, 1], ["white", "darkgrey"]);
  const stem = dull ? grey : scale([0, 0.5, 1], ["lightgreen", "green", "darkgreen"]);
  // stems are drawn in batches: a few fixed shades x a few widths, one path each
  const SHADES = 16, WIDTHS = 4;
  const stemShades = Array.from({ length: SHADES }, (_, i) => stem(i / (SHADES - 1)));

  // ---- canvas + camera ----------------------------------------------------------------------------------
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "position:fixed;inset:0;width:100%;height:100%;display:block;touch-action:none;cursor:grab";
  (document.getElementById("app") || document.body).appendChild(canvas);
  const ctx = canvas.getContext("2d");

  let vw = 0, vh = 0, dpr = 1, zoom = 1;       // viewport (css px), device pixel ratio, css px per world unit
  const cam = { x: 0, y: 0 };                  // world point at the centre of the screen
  const target = { x: 0, y: 0 };               // where the camera is easing to
  const fling = { x: 0, y: 0 };                // world units per ms after a drag is released
  let dirty = true;

  function resize() {
    vw = window.innerWidth; vh = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, vw / HOME.w));
    canvas.width = Math.round(vw * dpr); canvas.height = Math.round(vh * dpr);
    dirty = true;
  }
  const view = (pad) => ({
    x0: cam.x - vw / 2 / zoom - pad, x1: cam.x + vw / 2 / zoom + pad,
    y0: cam.y - vh / 2 / zoom - pad, y1: cam.y + vh / 2 / zoom + pad,
  });

  // ---- the text mask (world units, centred on the origin) ----------------------------------------------
  let mask = null;
  function buildMask() {
    const c = document.createElement("canvas"), m = c.getContext("2d", { willReadFrequently: true });
    const family = "Avenir, Helvetica, Arial, sans-serif";
    m.font = `${HOME.font}px ${family}`;
    // shrink the text so it fits the screen it is first drawn on (narrow phones, long ?text)
    const fit = Math.min(1, 0.92 * (vw / zoom) / m.measureText(text).width, 0.9 * (vh / zoom) / HOME.font);
    const size = HOME.font * fit;
    m.font = `${size}px ${family}`;
    const w = Math.ceil(m.measureText(text).width) + 4, h = Math.ceil(size * 1.4);
    c.width = w; c.height = h;
    m.font = `${size}px ${family}`; m.textAlign = "center"; m.textBaseline = "middle";
    m.fillText(text, w / 2, h / 2);
    const rgba = m.getImageData(0, 0, w, h).data, on = new Uint8Array(w * h);
    for (let i = 0; i < on.length; i++) on[i] = rgba[i * 4 + 3] > 127 ? 1 : 0;
    mask = { w, h, on };
  }
  function onText(x, y) {
    const mx = Math.floor(x + mask.w / 2), my = Math.floor(y + mask.h / 2);
    return mx >= 0 && mx < mask.w && my >= 0 && my < mask.h && mask.on[my * mask.w + mx] === 1;
  }
  const inHome = (x, y) => Math.abs(x) < HOME.w / 2 && Math.abs(y) < HOME.h / 2;

  // ---- world: chunks of the Poisson grid ----------------------------------------------------------------
  const R2 = RADIUS * RADIUS, CELL = RADIUS * Math.SQRT1_2, N = 32, CHUNK = N * CELL;
  const chunks = new Map();                    // key -> { cx, cy, grid: Array(N*N), pts: [] }
  const key = (cx, cy) => (cx + 0x8000) * 0x10000 + (cy + 0x8000);
  let queue = [];                              // samples that may still have room around them
  let grown = null;                            // the rectangle the sampler has filled so far
  let seedAt = null;                           // where to start if nothing exists in view

  function far(x, y) {
    const gi = Math.floor(x / CELL), gj = Math.floor(y / CELL);
    for (let j = gj - 2; j <= gj + 2; j++) {
      const cy = Math.floor(j / N), lj = j - cy * N;
      for (let i = gi - 2; i <= gi + 2; i++) {
        const cx = Math.floor(i / N), ch = chunks.get(key(cx, cy));
        if (!ch) continue;
        const s = ch.grid[lj * N + (i - cx * N)];
        if (s) { const dx = s.x - x, dy = s.y - y; if (dx * dx + dy * dy < R2) return false; }
      }
    }
    return true;
  }

  function plant(x, y, parent, now) {
    const gi = Math.floor(x / CELL), gj = Math.floor(y / CELL), cx = Math.floor(gi / N), cy = Math.floor(gj / N);
    let ch = chunks.get(key(cx, cy));
    if (!ch) chunks.set(key(cx, cy), ch = { cx, cy, grid: new Array(N * N), pts: [] });
    const text = onText(x, y);
    const t0 = parent ? Math.max(parent.t0 + (inHome(x, y) ? STEP_HOME : STEP_AWAY), now) : now;
    const p = {
      x, y, px: parent ? parent.x : x, py: parent ? parent.y : y, t0, queued: true,
      bucket: (Math.random() * SHADES | 0) * WIDTHS + ((Math.random() * 2 | 0) + (text ? 2 : 0)),   // width 1-2, or 3-4 on the text
      flower: null,
    };
    if (text || Math.random() < STRAY) {
      p.flower = {
        size: (Math.random() * 8 + 2) | 0, t1: t0 + 500 + Math.random() * 900,
        petal: petal(Math.random()), sepal: sepal(Math.random()), stamen: stamen(Math.random()), carpal: carpal(Math.random()),
      };
    }
    ch.grid[(gj - cy * N) * N + (gi - cx * N)] = p;
    ch.pts.push(p);
    queue.push(p);
    return p;
  }

  // Bridson's algorithm, confined to the rectangle b; runs until nothing more fits.
  function grow(b, now) {
    while (queue.length) {
      const i = Math.random() * queue.length | 0, parent = queue[i];
      let placed = false;
      for (let j = 0; j < TRIES; j++) {
        const a = 2 * Math.PI * Math.random(), r = Math.sqrt(Math.random() * 3 * R2 + R2);
        const x = parent.x + r * Math.cos(a), y = parent.y + r * Math.sin(a);
        if (x >= b.x0 && x < b.x1 && y >= b.y0 && y < b.y1 && far(x, y)) { plant(x, y, parent, now); placed = true; break; }
      }
      if (!placed) {
        parent.queued = false;
        const last = queue.pop();
        if (i < queue.length) queue[i] = last;
      }
    }
  }

  // Called every frame: if the view has moved on, forget what is far away and grow into what is new.
  function tend(now) {
    const v = view(GROW_MARGIN);
    const b = {
      x0: Math.floor(v.x0 / SNAP) * SNAP, x1: Math.ceil(v.x1 / SNAP) * SNAP,
      y0: Math.floor(v.y0 / SNAP) * SNAP, y1: Math.ceil(v.y1 / SNAP) * SNAP,
    };
    if (grown && b.x0 === grown.x0 && b.x1 === grown.x1 && b.y0 === grown.y0 && b.y1 === grown.y1) return;

    // forget chunks more than a screen beyond the view
    const k = view(Math.max(vw, vh) / zoom);
    for (const [id, ch] of chunks) {
      if ((ch.cx + 1) * CHUNK < k.x0 || ch.cx * CHUNK > k.x1 || (ch.cy + 1) * CHUNK < k.y0 || ch.cy * CHUNK > k.y1) chunks.delete(id);
    }
    queue = queue.filter(p => chunks.has(key(Math.floor(p.x / CHUNK), Math.floor(p.y / CHUNK))));

    // wake every sample that is not safely inside the area already filled: they are the growing edge
    const e = 2 * RADIUS, old = grown;
    let present = 0;
    for (let cy = Math.floor((b.y0 - e) / CHUNK); cy <= Math.floor((b.y1 + e) / CHUNK); cy++) {
      for (let cx = Math.floor((b.x0 - e) / CHUNK); cx <= Math.floor((b.x1 + e) / CHUNK); cx++) {
        const ch = chunks.get(key(cx, cy));
        if (!ch) continue;
        for (const p of ch.pts) {
          if (p.x >= b.x0 && p.x < b.x1 && p.y >= b.y0 && p.y < b.y1) present++;
          const settled = old && p.x >= old.x0 + e && p.x < old.x1 - e && p.y >= old.y0 + e && p.y < old.y1 - e;
          if (!settled && !p.queued) { p.queued = true; queue.push(p); }
        }
      }
    }
    // nothing here at all (first run, a replant, or a jump past everything): start a new plant
    if (!present) {
      const s = seedAt || cam;
      plant(Math.max(b.x0, Math.min(b.x1 - 1, s.x)), Math.max(b.y0, Math.min(b.y1 - 1, s.y)), null, now);
    }
    seedAt = null;
    grown = b;
    grow(b, now);
    dirty = true;
  }

  function replant(x, y) {
    chunks.clear(); queue = []; grown = null; seedAt = { x, y };
    buildMask();
  }

  // ---- drawing ------------------------------------------------------------------------------------------
  const ease = t => t <= 0 ? 0 : t >= 1 ? 1 : ((t *= 2) <= 1 ? t * t * t : (t -= 2) * t * t + 2) / 2;   // cubic in-out
  const buckets = Array.from({ length: SHADES * WIDTHS }, () => []);
  const blooms = [];

  function draw(now) {
    let moving = false;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const s = zoom * dpr;
    ctx.setTransform(s, 0, 0, s, canvas.width / 2 - cam.x * s, canvas.height / 2 - cam.y * s);

    for (const b of buckets) b.length = 0;
    blooms.length = 0;
    const v = view(40);
    for (let cy = Math.floor(v.y0 / CHUNK); cy <= Math.floor(v.y1 / CHUNK); cy++) {
      for (let cx = Math.floor(v.x0 / CHUNK); cx <= Math.floor(v.x1 / CHUNK); cx++) {
        const ch = chunks.get(key(cx, cy));
        if (!ch) continue;
        for (const p of ch.pts) {
          const age = now - p.t0;
          if (age <= 0) { moving = true; continue; }
          if (age < STEM_MS) {
            moving = true;
            const u = ease(age / STEM_MS);
            buckets[p.bucket].push(p.px, p.py, p.px + (p.x - p.px) * u, p.py + (p.y - p.py) * u);
          } else {
            buckets[p.bucket].push(p.px, p.py, p.x, p.y);
            if (p.flower) blooms.push(p);
          }
        }
      }
    }

    ctx.lineCap = "round";
    ctx.setLineDash([]);
    for (let i = 0; i < buckets.length; i++) {
      const b = buckets[i];
      if (!b.length) continue;
      ctx.beginPath();
      for (let j = 0; j < b.length; j += 4) { ctx.moveTo(b[j], b[j + 1]); ctx.lineTo(b[j + 2], b[j + 3]); }
      ctx.strokeStyle = stemShades[i / WIDTHS | 0];
      ctx.lineWidth = i % WIDTHS + 1;
      ctx.stroke();
    }

    ctx.lineCap = "butt";
    for (const p of blooms) {
      const f = p.flower, open = ease((now - f.t1) / BLOOM_MS), bud = ease((now - p.t0 - STEM_MS) / 250);
      if (open < 1) moving = true;
      if (open > 0) {          // petals: a thick dashed ring around a filled disc
        ctx.beginPath(); ctx.arc(p.x, p.y, f.size * open, 0, 2 * Math.PI);
        ctx.fillStyle = f.sepal; ctx.fill();
        ctx.setLineDash([2, 0.5]); ctx.lineWidth = f.size * 1.5 * open; ctx.strokeStyle = f.petal; ctx.stroke();
      }
      const r = 2 * bud + (f.size / 2 - 2) * open;   // a bud first, then the centre grows with the flower
      if (r > 0) {
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 2 * Math.PI);
        ctx.fillStyle = f.carpal; ctx.fill();
        ctx.setLineDash([1, 1]); ctx.lineWidth = 1; ctx.strokeStyle = f.stamen; ctx.stroke();
      }
    }
    return moving;
  }

  // ---- input --------------------------------------------------------------------------------------------
  const nudge = (dx, dy) => { target.x += dx / zoom; target.y += dy / zoom; fling.x = fling.y = 0; };

  window.addEventListener("wheel", e => {
    e.preventDefault();
    if (e.ctrlKey) return;                                   // pinch-zoom gesture on trackpads: ignore
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? vh : 1;
    nudge(e.deltaX * unit, e.deltaY * unit);
  }, { passive: false });

  let drag = null;
  canvas.addEventListener("pointerdown", e => {
    if (drag) return;
    canvas.setPointerCapture(e.pointerId);
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), travelled: 0 };
    fling.x = fling.y = 0; target.x = cam.x; target.y = cam.y;
    canvas.style.cursor = "grabbing";
  });
  canvas.addEventListener("pointermove", e => {
    if (!drag || e.pointerId !== drag.id) return;
    const now = performance.now(), dx = e.clientX - drag.x, dy = e.clientY - drag.y, dt = Math.max(1, now - drag.t);
    drag.travelled += Math.abs(dx) + Math.abs(dy);
    cam.x = target.x = cam.x - dx / zoom; cam.y = target.y = cam.y - dy / zoom;      // 1:1 under the finger
    fling.x = 0.7 * fling.x + 0.3 * (-dx / zoom / dt); fling.y = 0.7 * fling.y + 0.3 * (-dy / zoom / dt);
    drag.x = e.clientX; drag.y = e.clientY; drag.t = now;
    dirty = true;
  });
  const release = e => {
    if (!drag || e.pointerId !== drag.id) return;
    const tap = drag.travelled < 6, stale = performance.now() - drag.t > 80;
    drag = null; canvas.style.cursor = "grab";
    if (tap || stale || e.type === "pointercancel") fling.x = fling.y = 0;
    if (tap && e.type === "pointerup") {                     // a tap or click replants, starting from that spot
      replant(cam.x + (e.clientX - vw / 2) / zoom, cam.y + (e.clientY - vh / 2) / zoom);
    }
  };
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);

  window.addEventListener("keydown", e => {
    const step = e.shiftKey ? 400 : 120, page = vh * 0.85;
    const moves = {
      ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step],
      PageUp: [0, -page], PageDown: [0, page], " ": [0, e.shiftKey ? -page : page],
    };
    if (e.key === "Home") { target.x = target.y = 0; fling.x = fling.y = 0; e.preventDefault(); }
    else if (moves[e.key]) { nudge(...moves[e.key]); e.preventDefault(); }
  });

  window.addEventListener("resize", resize);

  // ---- main loop ----------------------------------------------------------------------------------------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(50, now - last); last = now;
    if (!drag && (fling.x || fling.y)) {                     // coast after a flick
      target.x += fling.x * dt; target.y += fling.y * dt;
      const f = Math.pow(0.996, dt); fling.x *= f; fling.y *= f;
      if (Math.hypot(fling.x, fling.y) < 0.005) fling.x = fling.y = 0;
    }
    const dx = target.x - cam.x, dy = target.y - cam.y;
    if (Math.abs(dx) > 0.05 || Math.abs(dy) > 0.05) {
      const a = 1 - Math.exp(-dt / 80);
      cam.x += dx * a; cam.y += dy * a; dirty = true;
    }
    tend(now);
    if (dirty) dirty = draw(now);
    requestAnimationFrame(frame);
  }

  resize();
  buildMask();
  requestAnimationFrame(frame);

  // for poking at from the console
  window.flowers = { cam, target, replant, stats: () => ({ chunks: chunks.size, samples: [...chunks.values()].reduce((n, c) => n + c.pts.length, 0), zoom }) };
})();
