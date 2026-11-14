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
  const STRAY = 0.012;          // chance that a sample off the text flowers anyway
  const STEM_MS = 200, BLOOM_MS = 1000;

  // ---- colour -------------------------------------------------------------------------------------------
  // A night garden: deep green-black ground so colour glows. The "dull" 404 version stays grey on white.
  const BG = dull ? "#fff" : "#0c1411";
  document.documentElement.style.background = BG;
  const R = (a, b) => a + Math.random() * (b - a);
  const hsl = (h, s, l, a) => `hsla(${h | 0},${s | 0}%,${l | 0}%,${a === undefined ? 1 : a})`;
  const grey = (l, a) => `hsla(0,0%,${l | 0}%,${a === undefined ? 1 : a})`;
  // flower families: [weight, hue range, saturation range, lightness range]
  const FAMILIES = [
    [30, [4, 18], [80, 95], [62, 74]],        // salmon / coral
    [22, [40, 52], [90, 100], [58, 66]],      // gold
    [14, [325, 350], [65, 85], [64, 76]],     // pink
    [12, [262, 290], [55, 75], [68, 78]],     // violet
    [8, [200, 222], [65, 85], [66, 76]],      // blue
    [8, [28, 38], [90, 100], [58, 64]],       // orange
    [6, [50, 60], [60, 100], [88, 94]],       // cream
  ];
  const WSUM = FAMILIES.reduce((n, f) => n + f[0], 0);
  function palette() {
    if (dull) { const l = R(15, 70); return { outer: grey(l), inner: grey(l + 12), deep: grey(l - 10), halo: grey(l, 0), centre: grey(l - 8), seed: grey(l + 25) }; }
    let w = Math.random() * WSUM, f = FAMILIES[0];
    for (const x of FAMILIES) { if ((w -= x[0]) < 0) { f = x; break; } }
    const h = R(f[1][0], f[1][1]), sat = R(f[2][0], f[2][1]), l = R(f[3][0], f[3][1]);
    return {
      outer: hsl(h, sat, l), inner: hsl(h + R(-14, 14), sat, Math.min(96, l + R(8, 16))), deep: hsl(h - 8, sat, l - 22),
      halo: hsl(h, sat, l, 0.07),
      centre: Math.random() < 0.7 ? hsl(R(22, 42), R(70, 95), R(22, 38)) : hsl(R(44, 54), 95, R(48, 56)),
      seed: hsl(R(42, 58), 90, R(72, 88)),
    };
  }
  // stems: a few fixed shades x a few widths, one path each (muted greens that sit well on the dark ground)
  const SHADES = 16, WIDTHS = 4;
  const stemShades = Array.from({ length: SHADES }, (_, i) => {
    const t = i / (SHADES - 1);
    return dull ? grey(10 + t * 60) : hsl(92 + t * 50, 38 + t * 14, 20 + (1 - Math.abs(t - 0.4) * 1.4) * 14);
  });
  const leafShades = dull ? [grey(55), grey(70)] : [hsl(112, 42, 34), hsl(96, 46, 42), hsl(135, 36, 30)];

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
    canvas.width = Math.round(vw * dpr); canvas.height = Math.round(vh * dpr); vignette = null;
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

  function makeFlower(t0) {
    const u = Math.random(), size = 2 + 9.5 * Math.pow(u, 1.5);          // mostly small, the odd big one
    const pal = palette(), n = 4 + (Math.random() * 6 | 0);              // 4-9 petals
    const rot = R(0, 6.283), shape = R(0.32, 0.6);                        // fat or slim
    const ring = (count, scale, off, fill) => {
      const petals = [];
      for (let i = 0; i < count; i++) {
        petals.push({ a: rot + off + (i + R(-0.22, 0.22)) * 6.283 / count, len: scale * R(0.72, 1.18), w: shape * R(0.75, 1.3), bow: R(-0.12, 0.12) });
      }
      return { petals, fill };
    };
    const layers = [ring(n, 1, 0, pal.outer)];
    if (size > 3.5 || Math.random() < 0.5) layers.push(ring(Math.max(3, n - (Math.random() * 3 | 0)), R(0.55, 0.72), R(0.3, 0.6) * 6.283 / n, pal.inner));
    const seeds = [];
    for (let i = 0, k = 3 + (Math.random() * 6 | 0); i < k; i++) { const a = R(0, 6.283), r = Math.sqrt(Math.random()); seeds.push([Math.cos(a) * r, Math.sin(a) * r]); }
    return { size, t1: t0 + 500 + Math.random() * 900, pal, layers, seeds, spin: R(-0.9, 0.9) };
  }

  function plant(x, y, parent, now) {
    const gi = Math.floor(x / CELL), gj = Math.floor(y / CELL), cx = Math.floor(gi / N), cy = Math.floor(gj / N);
    let ch = chunks.get(key(cx, cy));
    if (!ch) chunks.set(key(cx, cy), ch = { cx, cy, grid: new Array(N * N), pts: [] });
    const text = onText(x, y);
    const t0 = parent ? Math.max(parent.t0 + (inHome(x, y) ? STEP_HOME : STEP_AWAY), now) : now;
    const p = {
      x, y, px: parent ? parent.x : x, py: parent ? parent.y : y, t0, queued: true,
      bend: R(-0.3, 0.3), leaf: null,
      bucket: (Math.random() * SHADES | 0) * WIDTHS + ((Math.random() * 2 | 0) + (text ? 2 : 0)),   // width 1-2, or 3-4 on the text
      flower: null,
    };
    if (parent) {                                            // stems curve: a control point pushed off the straight line
      const dx = x - parent.x, dy = y - parent.y;
      p.cx = (x + p.px) / 2 - dy * p.bend; p.cy = (y + p.py) / 2 + dx * p.bend;
    } else { p.cx = x; p.cy = y; }
    if (text || Math.random() < STRAY) p.flower = makeFlower(t0);
    else if (parent && Math.random() < 0.22) {              // some stems carry a leaf, halfway along
      const dx = x - p.px, dy = y - p.py, side = Math.random() < 0.5 ? 1 : -1;
      p.leaf = { x: (p.px + 2 * p.cx + x) / 4, y: (p.py + 2 * p.cy + y) / 4, a: Math.atan2(dy, dx) + side * R(0.5, 1.2), len: R(3, 6.5), col: Math.random() * leafShades.length | 0 };
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

  const leaves = [[], [], []];
  let vignette = null;

  function petalPath(f, cx, cy, layer, o, rot) {
    for (const q of layer.petals) {
      const a = q.a + rot, L = f.size * 1.75 * q.len * o, W = L * q.w;
      const dx = Math.cos(a), dy = Math.sin(a), nx = -dy, ny = dx, bow = q.bow * L;
      const tx = cx + dx * L + nx * bow, ty = cy + dy * L + ny * bow;
      ctx.moveTo(cx, cy);
      ctx.bezierCurveTo(cx + dx * L * 0.2 + nx * W * 1.1, cy + dy * L * 0.2 + ny * W * 1.1, cx + dx * L * 0.9 + nx * W * 0.75, cy + dy * L * 0.9 + ny * W * 0.75, tx, ty);
      ctx.bezierCurveTo(cx + dx * L * 0.9 - nx * W * 0.75, cy + dy * L * 0.9 - ny * W * 0.75, cx + dx * L * 0.2 - nx * W * 1.1, cy + dy * L * 0.2 - ny * W * 1.1, cx, cy);
    }
  }

  function draw(now) {
    let moving = false;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const s = zoom * dpr;
    ctx.setTransform(s, 0, 0, s, canvas.width / 2 - cam.x * s, canvas.height / 2 - cam.y * s);

    for (const b of buckets) b.length = 0;
    for (const l of leaves) l.length = 0;
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
            const u = ease(age / STEM_MS);              // quadratic curve cut off at u: end point B(u), control lerp(p0, c, u)
            const ex = (1 - u) * (1 - u) * p.px + 2 * u * (1 - u) * p.cx + u * u * p.x, ey = (1 - u) * (1 - u) * p.py + 2 * u * (1 - u) * p.cy + u * u * p.y;
            buckets[p.bucket].push(p.px, p.py, p.px + (p.cx - p.px) * u, p.py + (p.cy - p.py) * u, ex, ey);
          } else {
            buckets[p.bucket].push(p.px, p.py, p.cx, p.cy, p.x, p.y);
            if (p.flower) blooms.push(p);
            else if (p.leaf) leaves[p.leaf.col].push(p.leaf);
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
      for (let j = 0; j < b.length; j += 6) { ctx.moveTo(b[j], b[j + 1]); ctx.quadraticCurveTo(b[j + 2], b[j + 3], b[j + 4], b[j + 5]); }
      ctx.strokeStyle = stemShades[i / WIDTHS | 0];
      ctx.lineWidth = i % WIDTHS + 1;
      ctx.stroke();
    }

    for (let i = 0; i < leaves.length; i++) {            // leaves: little pointed lenses, one fill per shade
      if (!leaves[i].length) continue;
      ctx.beginPath();
      for (const l of leaves[i]) {
        const dx = Math.cos(l.a), dy = Math.sin(l.a), tx = l.x + dx * l.len, ty = l.y + dy * l.len, w = l.len * 0.42;
        ctx.moveTo(l.x, l.y);
        ctx.quadraticCurveTo(l.x + dx * l.len * 0.5 - dy * w, l.y + dy * l.len * 0.5 + dx * w, tx, ty);
        ctx.quadraticCurveTo(l.x + dx * l.len * 0.5 + dy * w, l.y + dy * l.len * 0.5 - dx * w, l.x, l.y);
      }
      ctx.fillStyle = leafShades[i];
      ctx.fill();
    }

    for (const p of blooms) {
      const f = p.flower, raw = Math.max(0, Math.min(1, (now - f.t1) / BLOOM_MS)), o = ease(raw) * (1 + 0.1 * Math.sin(Math.PI * raw));
      const bud = ease((now - p.t0 - STEM_MS) / 250);
      if (raw < 1) moving = true;
      if (o > 0.02) {
        const rot = (1 - o) * f.spin;                      // petals unfurl with a little twist
        if (f.size > 5 && !dull) {                         // a faint halo round the big ones
          ctx.fillStyle = f.pal.halo; ctx.beginPath(); ctx.arc(p.x, p.y, f.size * 2.9 * o, 0, 6.283); ctx.fill();
        }
        for (const layer of f.layers) {
          ctx.beginPath(); petalPath(f, p.x, p.y, layer, o, rot);
          ctx.fillStyle = layer.fill; ctx.fill();
        }
        ctx.fillStyle = f.pal.deep; ctx.beginPath(); ctx.arc(p.x, p.y, f.size * 0.5 * o, 0, 6.283); ctx.fill();
        ctx.fillStyle = f.pal.centre; ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1, f.size * 0.36) * o, 0, 6.283); ctx.fill();
        if (f.size > 3.5) {
          ctx.fillStyle = f.pal.seed; ctx.beginPath();
          const sr = f.size * 0.3 * o;
          for (const q of f.seeds) { const sx = p.x + q[0] * sr, sy = p.y + q[1] * sr; ctx.moveTo(sx + 0.55, sy); ctx.arc(sx, sy, 0.55, 0, 6.283); }
          ctx.fill();
        }
      } else if (bud > 0) {                                // a bud first
        ctx.fillStyle = f.pal.outer; ctx.beginPath(); ctx.arc(p.x, p.y, 1.8 * bud, 0, 6.283); ctx.fill();
      }
    }

    if (!dull) {                                           // soft vignette so the edges fall away
      if (!vignette) {
        vignette = ctx.createRadialGradient(canvas.width / 2, canvas.height / 2, Math.min(canvas.width, canvas.height) * 0.35, canvas.width / 2, canvas.height / 2, Math.hypot(canvas.width, canvas.height) * 0.6);
        vignette.addColorStop(0, "rgba(0,0,0,0)"); vignette.addColorStop(1, "rgba(0,0,0,0.55)");
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = vignette; ctx.fillRect(0, 0, canvas.width, canvas.height);
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
