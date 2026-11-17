/* bradi.sh flowers: an endless, responsive field.
 *
 * The world is an infinite plane in "world units". A Poisson-disc sampler (Bridson) grows outwards from a
 * seed; every sample is joined to its parent by a stem, and samples that land on the text (drawn once into a
 * mask at the origin) or win a 1 % lottery become flowers. The sampler only ever fills the area around the
 * viewport: as the camera moves, the points on the edge of what exists are put back in the queue and carry
 * on growing into the newly uncovered strip. Nothing already planted is touched, so flowers that stay in view
 * stay exactly as they are. Chunks more than a screen away are forgotten.
 *
 * Zoom: pinch, ctrl/cmd + wheel, or the + and - keys (0 resets); it zooms about the pointer.
 *
 * Optional config before loading:  window.FLOWERS = { text: "404", dull: true, zoom: 2, x: 0, y: 0 }
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
  const ZOOM_MIN = 0.4, ZOOM_MAX = 1.5;          // starting css px per world unit = clamp(viewport width / HOME.w)
  const ZOOM_OUT = 0.35, ZOOM_IN = 10;           // how far the user may zoom (css px per world unit)
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
    if (dull) { const l = R(15, 70); return { outer: grey(l), inner: grey(l + 12), deep: grey(l - 10), edge: grey(l - 14, 0.5), halo: grey(l, 0), centre: grey(l - 8), seed: grey(l + 25) }; }
    let w = Math.random() * WSUM, f = FAMILIES[0];
    for (const x of FAMILIES) { if ((w -= x[0]) < 0) { f = x; break; } }
    const h = R(f[1][0], f[1][1]), sat = R(f[2][0], f[2][1]), l = R(f[3][0], f[3][1]);
    return {
      outer: hsl(h, sat, l), inner: hsl(h + R(-14, 14), sat, Math.min(96, l + R(8, 16))), deep: hsl(h - 8, sat, l - 22),
      edge: hsl(h - 10, sat, l - 20, 0.5), halo: [hsl(h, sat, l, 0.2), hsl(h, sat, l, 0.07), hsl(h, sat, l, 0)],
      centre: Math.random() < 0.7 ? hsl(R(22, 42), R(70, 95), R(22, 38)) : hsl(R(44, 54), 95, R(48, 56)),
      seed: hsl(R(42, 58), 90, R(72, 88)),
    };
  }
  // stems: a few fixed shades x a few widths, one path each (muted greens that sit well on the dark ground).
  // Shade and width drift from stem to stem along a plant. Each stem is a filled outline whose width runs
  // smoothly from its parent's to its own, drawn in a few pieces whose shades grade the same way, so there
  // is no step where two stems meet.
  const SHADES = 16;
  const PIECES = 3, STEPS = 4;                  // pieces per stem (one shade each), outline points per piece
  const FORK = 0.35;                            // radians a side shoot may leave its parent's end direction by (a first shoot: 0)
  const CONE = 0.55;                            // first tries for a new shoot are within this many radians either side of straight on
  const stemShades = Array.from({ length: SHADES }, (_, i) => {
    const t = i / (SHADES - 1);
    return dull ? grey(10 + t * 60) : hsl(92 + t * 50, 38 + t * 14, 20 + (1 - Math.abs(t - 0.4) * 1.4) * 14);
  });
  const leafShades = dull ? [grey(55), grey(70)] : [hsl(112, 42, 34), hsl(96, 46, 42), hsl(135, 36, 30)];
  const veinShades = dull ? [grey(80, 0.8), grey(90, 0.8)] : [hsl(105, 45, 56, 0.75), hsl(88, 52, 64, 0.75), hsl(128, 40, 50, 0.75)];

  // ---- canvas + camera ----------------------------------------------------------------------------------
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "position:fixed;inset:0;width:100%;height:100%;display:block;touch-action:none;cursor:grab";
  (document.getElementById("app") || document.body).appendChild(canvas);
  // soft vignette so the edges fall away: a fixed overlay, so the canvas never repaints it
  const shade = dull ? null : document.createElement("div");
  if (shade) { shade.style.cssText = "position:fixed;inset:0;pointer-events:none"; canvas.after(shade); }
  const ctx = canvas.getContext("2d");

  let vw = 0, vh = 0, dpr = 1, zoom = 1;       // viewport (css px), device pixel ratio, css px per world unit
  let base = 1, uz = cfg.zoom || 1;            // zoom = base (from the viewport width) x uz (the user's zoom)
  let zt = 1;                                  // the zoom being eased to ...
  const anchor = { x: 0, y: 0 };               // ... about this screen point
  const cam = { x: cfg.x || 0, y: cfg.y || 0 };          // world point at the centre of the screen
  const target = { x: cam.x, y: cam.y };       // where the camera is easing to
  const fling = { x: 0, y: 0 };                // world units per ms after a drag is released
  let dirty = true;

  function resize() {
    vw = window.innerWidth; vh = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);   // 3x screens: 2x is plenty for a soft scene, at under half the pixels
    base = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, vw / HOME.w));
    zoom = zt = clampZoom(base * uz); uz = zoom / base;
    canvas.width = Math.round(vw * dpr); canvas.height = Math.round(vh * dpr);
    if (shade) shade.style.background = `radial-gradient(circle at 50% 50%, rgba(0,0,0,0) ${Math.min(vw, vh) * 0.35}px, rgba(0,0,0,0.55) ${Math.hypot(vw, vh) * 0.6}px)`;
    dirty = true;
  }
  const clampZoom = z => Math.max(ZOOM_OUT, Math.min(ZOOM_IN, z));
  function setZoom(z, sx, sy) {                // the world point under screen point (sx, sy) stays put
    z = clampZoom(z);
    const kx = (sx - vw / 2) * (1 / zoom - 1 / z), ky = (sy - vh / 2) * (1 / zoom - 1 / z);
    cam.x += kx; cam.y += ky; target.x += kx; target.y += ky;
    zoom = z; uz = z / base; dirty = true;
  }
  function zoomBy(f, sx, sy) { zt = clampZoom(zt * f); anchor.x = sx === undefined ? vw / 2 : sx; anchor.y = sy === undefined ? vh / 2 : sy; }
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
    const fit = Math.min(1, 0.92 * (vw / base) / m.measureText(text).width, 0.9 * (vh / base) / HOME.font);
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
    const rot = R(0, 6.283);
    const shape = Math.min(R(0.32, 0.6), 2.6 / n);                        // fat or slim, but never so fat that petals merge
    const tip = R(0.25, 0.8);                                             // pointed or rounded petal tips
    // Evenly spaced petals, each only slightly its own: enough wobble to look grown, not enough to look broken.
    const ring = (count, scale, off, fill) => {
      const petals = [];
      for (let i = 0; i < count; i++) {
        petals.push({ a: rot + off + (i + R(-0.07, 0.07)) * 6.283 / count, len: scale * R(0.93, 1.07), w: shape * R(0.92, 1.08), bow: R(-0.04, 0.04) });
      }
      return { petals, fill };
    };
    const layers = [ring(n, 1, 0, pal.outer)];
    // the inner ring has the same count and sits in the gaps of the outer one
    if (size > 3.5 || Math.random() < 0.5) layers.push(ring(n, R(0.56, 0.68), 3.1415 / n, pal.inner));
    const seeds = [[0, 0]];                                               // one in the middle and a ring round it
    for (let i = 0, k = 5 + (Math.random() * 3 | 0), a0 = R(0, 6.283); i < k; i++) { const a = a0 + (i + R(-0.12, 0.12)) * 6.283 / k, r = R(0.6, 0.72); seeds.push([Math.cos(a) * r, Math.sin(a) * r]); }
    return { size, t1: t0 + 500 + Math.random() * 900, pal, layers, seeds, tip, spin: R(-0.9, 0.9) };
  }

  // point and (unnormalised) direction at t along a stem's cubic
  function stemAt(p, t) {
    const k = 1 - t, a = k * k * k, b = 3 * k * k * t, c = 3 * k * t * t, d = t * t * t;
    const e = k * k, f = 2 * k * t, g = t * t;
    return [a * p.px + b * p.c1x + c * p.c2x + d * p.x, a * p.py + b * p.c1y + c * p.c2y + d * p.y,
      e * (p.c1x - p.px) + f * (p.c2x - p.c1x) + g * (p.x - p.c2x), e * (p.c1y - p.py) + f * (p.c2y - p.c1y) + g * (p.y - p.c2y)];
  }

  function plant(x, y, parent, now) {
    const gi = Math.floor(x / CELL), gj = Math.floor(y / CELL), cx = Math.floor(gi / N), cy = Math.floor(gj / N);
    let ch = chunks.get(key(cx, cy));
    if (!ch) chunks.set(key(cx, cy), ch = { cx, cy, grid: new Array(N * N), pts: [] });
    const text = onText(x, y);
    // each stem takes one generation step to grow and the next starts as it finishes, so a growing tip
    // runs on along the plant without pausing or jumping ahead
    const dur = inHome(x, y) ? STEP_HOME : STEP_AWAY;
    const t0 = parent ? Math.max(parent.t0 + parent.dur, now) : now;
    const p = {
      x, y, px: parent ? parent.x : x, py: parent ? parent.y : y, t0, dur, queued: true,
      bend: R(-0.3, 0.3), leaves: null,
      flower: null,
    };
    // shade and width: a small drift from the parent; width heads for 1-2 off the text and 3-4 on it
    const wTarget = (text ? 3 : 1) + Math.random();
    p.sh = parent ? Math.max(0, Math.min(SHADES - 1, parent.sh + R(-1.3, 1.3))) : R(0, SHADES - 1);
    p.w = parent ? parent.w + Math.max(-0.5, Math.min(0.5, wTarget - parent.w)) : wTarget;
    p.sh0 = parent ? parent.sh : p.sh; p.w0 = parent ? parent.w : p.w;
    // Stems are cubics. Each starts in its parent's end direction (a side shoot a little off it), so the
    // heading runs on smoothly from stem to stem; it then bends round to arrive heading somewhat past the
    // straight line, so a shoot placed off to one side curls there like a tendril instead of kinking.
    p.kids = 0;
    if (parent) {
      const dx = x - parent.x, dy = y - parent.y, d = Math.hypot(dx, dy), ca = Math.atan2(dy, dx);
      const ta = parent.ta === undefined ? ca + p.bend * 2.5 : parent.ta;                 // from a seed: a random curve
      let off = ca - ta; off = Math.atan2(Math.sin(off), Math.cos(off));
      const fork = parent.kids++ ? Math.max(-FORK, Math.min(FORK, off)) : 0;             // the first shoot carries straight on
      const sa = ta + fork, rest = off - fork;                                            // start heading; turn still to make
      const ea = ca + rest * 0.6;                                                         // end heading
      const l1 = d * (0.36 + 0.3 * Math.abs(rest) / Math.PI), l2 = d * 0.34;              // longer start handle for a sharp turn
      p.c1x = p.px + Math.cos(sa) * l1; p.c1y = p.py + Math.sin(sa) * l1;
      p.c2x = x - Math.cos(ea) * l2; p.c2y = y - Math.sin(ea) * l2;
      p.ta = ea;
    } else { p.c1x = p.c2x = x; p.c1y = p.c2y = y; }
    if (text || Math.random() < STRAY) {
      p.flower = makeFlower(t0);
      p.flower.budA = (parent ? p.ta : R(0, 6.283)) + R(-0.9, 0.9);   // buds nod roughly the way the stem grew
    }
    if (parent && Math.random() < (p.flower ? 0.3 : 0.5)) {   // many stems carry a leaf, some a pair
      const side = Math.random() < 0.5 ? 1 : -1, pair = Math.random() < 0.4, col = Math.random() * leafShades.length | 0;
      const leaf = (t, sd, ink = Math.random() < (cfg.ink || 0.01)) => {  // t: how far along the stem it sprouts; ink: 1 in 100 is signed
        const [lx, ly, tx, ty] = stemAt(p, t);
        return {
          x: lx, y: ly,
          a: Math.atan2(ty, tx) + sd * R(0.55, 1.1), len: ink ? R(8, 9.5) : R(4.5, 8.5), w: R(0.3, 0.44), bow: -sd * R(0.02, 0.2), col, t0: t0 + STEM_MS + R(0, 300),
          ink,
        };
      };
      p.leaves = pair ? [leaf(R(0.3, 0.45), side), leaf(R(0.5, 0.65), -side)] : [leaf(R(0.35, 0.6), side)];
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
        const spread = j < TRIES / 2 ? CONE : Math.PI;           // straight-ish first, then anywhere (so the space still fills)
        const a = (parent.ta === undefined ? 0 : parent.ta) + (parent.ta === undefined ? Math.PI : spread) * (2 * Math.random() - 1), r = Math.sqrt(Math.random() * 3 * R2 + R2);
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
  // Stem outlines are costly to build, so a finished stem is added once to its chunk's path for its shade
  // (ch.stems) and kept; only stems still growing go into these per-frame paths.
  const buckets = new Array(SHADES);
  const blooms = [];

  const LEAF_MS = 500;
  const growing = [];                           // [leaf, chunk] for leaves still unfolding this frame

  // A leaf: a pointed blade with a slight curl, added to `blade`; its midrib to `rib`; side veins to `side`.
  // The spine is a cubic from the base to the tip; the two edges are the same curve pushed out sideways.
  function leafInto(l, g, blade, rib, side) {
    const L = l.len * g, w = L * l.w, b = L * l.bow, dx = Math.cos(l.a), dy = Math.sin(l.a), nx = -dy, ny = dx;
    const ax = l.x + dx * L * 0.3 + nx * b * 0.2, ay = l.y + dy * L * 0.3 + ny * b * 0.2;
    const bx = l.x + dx * L * 0.75 + nx * b * 0.7, by = l.y + dy * L * 0.75 + ny * b * 0.7;
    const tx = l.x + dx * L + nx * b, ty = l.y + dy * L + ny * b;
    blade.moveTo(l.x, l.y);
    blade.bezierCurveTo(ax + nx * w * 1.3, ay + ny * w * 1.3, bx + nx * w * 0.7, by + ny * w * 0.7, tx, ty);
    blade.bezierCurveTo(bx - nx * w * 0.7, by - ny * w * 0.7, ax - nx * w * 1.3, ay - ny * w * 1.3, l.x, l.y);
    rib.moveTo(l.x, l.y); rib.bezierCurveTo(ax, ay, bx, by, tx, ty);
    const geo = [l.x, l.y, ax, ay, bx, by, tx, ty], wx = nx * w, wy = ny * w;
    for (let t = 0.2; t < 0.8; t += 0.15) {               // four pairs, each sweeping forward to just short of the edge
      const u = t + 0.17, m = 1 - t, v = 1 - u;
      const sx = m * m * m * geo[0] + 3 * m * m * t * geo[2] + 3 * m * t * t * geo[4] + t * t * t * geo[6];
      const sy = m * m * m * geo[1] + 3 * m * m * t * geo[3] + 3 * m * t * t * geo[5] + t * t * t * geo[7];
      const ex = v * v * v * geo[0] + 3 * v * v * u * geo[2] + 3 * v * u * u * geo[4] + u * u * u * geo[6];
      const ey = v * v * v * geo[1] + 3 * v * v * u * geo[3] + 3 * v * u * u * geo[5] + u * u * u * geo[7];
      const h = 0.8 * (3 * v * v * u * 1.3 + 3 * v * u * u * 0.7);      // edge offset at u, as a fraction of w
      const qx = (sx + ex) / 2, qy = (sy + ey) / 2;
      side.moveTo(sx, sy); side.quadraticCurveTo(qx + wx * h * 0.75, qy + wy * h * 0.75, ex + wx * h, ey + wy * h);
      side.moveTo(sx, sy); side.quadraticCurveTo(qx - wx * h * 0.75, qy - wy * h * 0.75, ex - wx * h, ey - wy * h);
    }
    return geo;
  }

  // A soft glow for a big flower, drawn once into a small image and scaled (a gradient per frame is costly).
  function glow(f) {
    if (f.glow) return f.glow;
    const c = document.createElement("canvas"), g = c.getContext("2d"), n = 64;
    c.width = c.height = n;
    const gr = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    gr.addColorStop(0, f.pal.halo[0]); gr.addColorStop(0.45, f.pal.halo[1]); gr.addColorStop(1, f.pal.halo[2]);
    g.fillStyle = gr; g.fillRect(0, 0, n, n);
    return f.glow = c;
  }

  function petalPath(f, cx, cy, layer, o, rot) {
    for (const q of layer.petals) {
      const a = q.a + rot, L = f.size * 1.75 * q.len * o, W = L * q.w, T = W * f.tip;
      const dx = Math.cos(a), dy = Math.sin(a), nx = -dy, ny = dx, bow = q.bow * L;
      const tx = cx + dx * L + nx * bow, ty = cy + dy * L + ny * bow;
      ctx.moveTo(cx, cy);
      ctx.bezierCurveTo(cx + dx * L * 0.2 + nx * W * 1.1, cy + dy * L * 0.2 + ny * W * 1.1, cx + dx * L * 0.92 + nx * T, cy + dy * L * 0.92 + ny * T, tx, ty);
      ctx.bezierCurveTo(cx + dx * L * 0.92 - nx * T, cy + dy * L * 0.92 - ny * T, cx + dx * L * 0.2 - nx * W * 1.1, cy + dy * L * 0.2 - ny * W * 1.1, cx, cy);
    }
  }

  // One piece of a stem, B(a)..B(b) of its quadratic, as a filled outline (half the width either side of the
  // curve) plus a disc at its end, so pieces and stems meet with round, seamless joints.
  const side = new Float64Array(2 * (STEPS + 1) * 2);
  function stemPiece(p, a, b, paths) {
    const m = (a + b) / 2, sh = Math.round(p.sh0 + (p.sh - p.sh0) * m), path = paths[sh] || (paths[sh] = new Path2D());
    let n = 0, ex = 0, ey = 0, er = 0;
    for (let i = 0; i <= STEPS; i++) {
      const t = a + (b - a) * i / STEPS;
      const q = stemAt(p, t), x = q[0], y = q[1];
      let dx = q[2], dy = q[3];
      const dl = Math.hypot(dx, dy) || 1, r = (p.w0 + (p.w - p.w0) * t) / 2;
      dx /= dl; dy /= dl;
      side[n++] = x - dy * r; side[n++] = y + dx * r; side[n++] = x + dy * r; side[n++] = y - dx * r;
      ex = x; ey = y; er = r;
    }
    path.moveTo(side[0], side[1]);
    for (let i = 4; i < n; i += 4) path.lineTo(side[i], side[i + 1]);
    for (let i = n - 2; i >= 0; i -= 4) path.lineTo(side[i], side[i + 1]);
    path.closePath();
    // a disc only where the stem ends (round tip, and the joint its children grow from); the pieces abut.
    // Same winding as the outline, so overlaps never cancel.
    if (b === 1) { path.moveTo(ex + er, ey); path.arc(ex, ey, er, 0, 2 * Math.PI, true); }
  }

  // "bradi.sh" in tiny letters along a leaf's midrib (a cubic), centred, reading left to right whichever way
  // the leaf points. Letters are drawn at 10px and scaled down: canvas fonts misbehave below ~1px.
  const INK = "bradi.sh", INK_SIZE = 0.72, INK_ZOOM = 3;
  const inked = [];
  function inkMidrib(g, s) {
    const N = 40, xs = [], ys = [], len = [0];
    for (let i = 0; i <= N; i++) {
      const t = i / N, m = 1 - t;
      xs.push(m * m * m * g[0] + 3 * m * m * t * g[2] + 3 * m * t * t * g[4] + t * t * t * g[6]);
      ys.push(m * m * m * g[1] + 3 * m * m * t * g[3] + 3 * m * t * t * g[5] + t * t * t * g[7]);
      if (i) len.push(len[i - 1] + Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]));
    }
    const flip = xs[N] < xs[0];                               // pointing left: write from the tip back
    const at = d => {                                          // point + direction at arc length d from the start
      if (flip) d = len[N] - d;
      let i = 1; while (i < N && len[i] < d) i++;
      const f = (d - len[i - 1]) / (len[i] - len[i - 1] || 1), x = xs[i - 1] + (xs[i] - xs[i - 1]) * f, y = ys[i - 1] + (ys[i] - ys[i - 1]) * f;
      return [x, y, Math.atan2(ys[i] - ys[i - 1], xs[i] - xs[i - 1]) + (flip ? Math.PI : 0)];
    };
    ctx.save();
    ctx.font = "600 10px Georgia, serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const k = INK_SIZE / 10, widths = [...INK].map(c => ctx.measureText(c).width * k), total = widths.reduce((a, b) => a + b, 0);
    let d = (len[N] - total) / 2;
    ctx.fillStyle = dull ? grey(92) : "hsla(80, 70%, 86%, 0.95)";
    const c = ctx.getTransform();
    for (let j = 0; j < INK.length; j++) {
      const [x, y, a] = at(d + widths[j] / 2);
      ctx.setTransform(c); ctx.translate(x, y); ctx.rotate(a); ctx.scale(k, k);
      ctx.fillText(INK[j], 0, -0.4 / k);                        // just above the rib, as if written on it
      d += widths[j];
    }
    ctx.restore();
  }

  // A bud: a teardrop, round at the stem end and pointed the way it nods, with a little dark tip.
  function drawBud(p, g) {
    const f = p.flower, r = 1.5 * g, dx = Math.cos(f.budA), dy = Math.sin(f.budA), nx = -dy, ny = dx;
    const cx = p.x + dx * r * 0.5, cy = p.y + dy * r * 0.5, tx = cx + dx * r * 2.3, ty = cy + dy * r * 2.3;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.bezierCurveTo(cx + dx * r * 1.3 + nx * r * 0.55, cy + dy * r * 1.3 + ny * r * 0.55, cx + dx * r * 0.6 + nx * r * 1.05, cy + dy * r * 0.6 + ny * r * 1.05, cx + nx * r, cy + ny * r);
    ctx.arc(cx, cy, r, f.budA + Math.PI / 2, f.budA - Math.PI / 2);
    ctx.bezierCurveTo(cx + dx * r * 0.6 - nx * r * 1.05, cy + dy * r * 0.6 - ny * r * 1.05, cx + dx * r * 1.3 - nx * r * 0.55, cy + dy * r * 1.3 - ny * r * 0.55, tx, ty);
    ctx.fillStyle = f.pal.outer; ctx.fill();
    ctx.beginPath(); ctx.moveTo(tx, ty);                        // a darker streak towards the tip, where the petals twist shut
    ctx.quadraticCurveTo(cx + dx * r * 1.2 + nx * r * 0.15, cy + dy * r * 1.2 + ny * r * 0.15, cx + dx * r * 0.2, cy + dy * r * 0.2);
    ctx.strokeStyle = f.pal.deep; ctx.lineWidth = 0.18 * r; ctx.lineCap = "round"; ctx.stroke();
  }

  function draw(now) {
    let moving = false;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const s = zoom * dpr;
    ctx.setTransform(s, 0, 0, s, canvas.width / 2 - cam.x * s, canvas.height / 2 - cam.y * s);

    buckets.fill(null);
    const shown = [];
    growing.length = 0;
    blooms.length = 0;
    const v = view(40);
    for (let cy = Math.floor(v.y0 / CHUNK); cy <= Math.floor(v.y1 / CHUNK); cy++) {
      for (let cx = Math.floor(v.x0 / CHUNK); cx <= Math.floor(v.x1 / CHUNK); cx++) {
        const ch = chunks.get(key(cx, cy));
        if (!ch) continue;
        if (!ch.stems) ch.stems = new Array(SHADES).fill(null);
        shown.push(ch);
        for (const p of ch.pts) {
          if (p.kept) {                                      // finished and already in the chunk's paths
            if (p.flower) blooms.push(p);
            if (p.leaves) for (const l of p.leaves) {
              if (!l.kept) growing.push(l, ch);
              else if (l.ink && s >= INK_ZOOM) inked.push(l.geo);
            }
            continue;
          }
          const age = now - p.t0;
          if (age <= 0) { moving = true; continue; }
          const u = Math.min(1, age / p.dur);                    // a growing stem is the curve cut off at u (steady, no easing)
          if (u < 1) moving = true;
          for (let k = 0; k < PIECES; k++) stemPiece(p, u * k / PIECES, u * (k + 1) / PIECES, u < 1 ? buckets : ch.stems);
          if (u >= 1) {
            p.kept = true;
            if (p.flower) blooms.push(p);
            if (p.leaves) for (const l of p.leaves) growing.push(l, ch);
          }
        }
      }
    }

    ctx.setLineDash([]);
    for (let i = 0; i < SHADES; i++) {
      ctx.fillStyle = stemShades[i];
      for (const ch of shown) if (ch.stems[i]) ctx.fill(ch.stems[i]);
      if (buckets[i]) ctx.fill(buckets[i]);
    }

    // Leaves, one fill per shade, then the veins: a midrib, and side veins once there are enough pixels to
    // show them. A fully grown leaf goes into its chunk's paths once; unfolding ones are drawn fresh.
    const midrib = s >= 0.9, sideVeins = s >= 1.7;
    const fresh = [0, 1, 2].map(() => [new Path2D(), new Path2D(), new Path2D()]);
    for (let j = 0; j < growing.length; j += 2) {
      const l = growing[j], ch = growing[j + 1], g = ease((now - l.t0) / LEAF_MS);
      if (g < 1) moving = true;
      if (g <= 0.02) continue;
      if (g < 1) { const f = fresh[l.col]; leafInto(l, g, f[0], f[1], f[2]); continue; }
      const c = ch.leaves || (ch.leaves = [0, 1, 2].map(() => [new Path2D(), new Path2D(), new Path2D()]));
      l.geo = leafInto(l, 1, c[l.col][0], c[l.col][1], c[l.col][2]);
      l.kept = true;
      if (l.ink && s >= INK_ZOOM) inked.push(l.geo);
    }
    for (let i = 0; i < leafShades.length; i++) {
      const sets = [fresh[i]];
      for (const ch of shown) if (ch.leaves) sets.push(ch.leaves[i]);
      ctx.fillStyle = leafShades[i];
      for (const t of sets) ctx.fill(t[0]);
      if (!midrib) continue;
      ctx.strokeStyle = veinShades[i];
      ctx.lineWidth = 0.32;
      for (const t of sets) ctx.stroke(t[1]);              // (a signed leaf keeps its midrib too: the letters sit on it)
      if (!sideVeins) continue;
      ctx.lineWidth = 0.16;
      for (const t of sets) ctx.stroke(t[2]);
    }

    for (const g of inked) inkMidrib(g, s);
    inked.length = 0;

    if (!dull) {                                           // first a soft glow under the big ones, so it never veils a neighbour's petals
      for (const p of blooms) {
        const f = p.flower;
        if (f.size <= 5) continue;
        const o = ease((now - f.t1) / BLOOM_MS), r = f.size * 3.4 * o;
        if (o <= 0.02) continue;
        ctx.drawImage(glow(f), p.x - r, p.y - r, 2 * r, 2 * r);
      }
    }

    for (const p of blooms) {
      const f = p.flower, raw = Math.max(0, Math.min(1, (now - f.t1) / BLOOM_MS)), o = ease(raw) * (1 + 0.1 * Math.sin(Math.PI * raw));
      const bud = ease((now - p.t0 - STEM_MS) / 250);
      if (raw < 1) moving = true;
      if (o > 0.02 && f.size * 1.75 * o * s < 2.5) {        // too small to see petals: a dot of its colour
        ctx.fillStyle = f.pal.outer; ctx.beginPath(); ctx.arc(p.x, p.y, f.size * 1.2 * o, 0, 6.283); ctx.fill();
      } else if (o > 0.02) {
        const rot = (1 - o) * f.spin;                      // petals unfurl with a little twist
        for (const layer of f.layers) {
          ctx.beginPath(); petalPath(f, p.x, p.y, layer, o, rot);
          ctx.fillStyle = layer.fill; ctx.fill();
          if (s >= 1.2) { ctx.strokeStyle = f.pal.edge; ctx.lineWidth = 0.22; ctx.stroke(); }   // a fine outline, so each petal reads
        }
        ctx.fillStyle = f.pal.deep; ctx.beginPath(); ctx.arc(p.x, p.y, f.size * 0.5 * o, 0, 6.283); ctx.fill();
        ctx.fillStyle = f.pal.centre; ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1, f.size * 0.36) * o, 0, 6.283); ctx.fill();
        if (f.size > 3.5 && Math.max(0.35, f.size * 0.055) * s >= 0.4) {     // seeds, once they would be visible
          ctx.fillStyle = f.pal.seed; ctx.beginPath();
          const sr = f.size * 0.3 * o, sd = Math.max(0.35, f.size * 0.055);
          for (const q of f.seeds) { const sx = p.x + q[0] * sr, sy = p.y + q[1] * sr; ctx.moveTo(sx + sd, sy); ctx.arc(sx, sy, sd, 0, 6.283); }
          ctx.fill();
        }
      } else if (bud > 0) drawBud(p, bud);                      // a bud first
    }

    return moving;
  }

  // ---- input --------------------------------------------------------------------------------------------
  const nudge = (dx, dy) => { target.x += dx / zoom; target.y += dy / zoom; fling.x = fling.y = 0; };

  window.addEventListener("wheel", e => {
    e.preventDefault();
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? vh : 1;
    if (e.ctrlKey || e.metaKey) {                            // trackpad pinch (arrives as ctrl + wheel) or ctrl/cmd + wheel
      zoomBy(Math.exp(-Math.max(-60, Math.min(60, e.deltaY * unit)) * 0.012), e.clientX, e.clientY);
    } else nudge(e.deltaX * unit, e.deltaY * unit);
  }, { passive: false });
  // Safari reports a trackpad pinch as gesture events instead (on touch screens the pointer code below handles it)
  let gesture = 1;
  window.addEventListener("gesturestart", e => { e.preventDefault(); gesture = zt; });
  window.addEventListener("gesturechange", e => {
    e.preventDefault();
    if (!touches.size) { zt = clampZoom(gesture * e.scale); anchor.x = e.clientX; anchor.y = e.clientY; }
  });

  const touches = new Map();                                 // pointers that are down: id -> { x, y }
  let drag = null, pinch = null;
  const span = () => { const [a, b] = [...touches.values()]; return { d: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; };
  canvas.addEventListener("pointerdown", e => {
    canvas.setPointerCapture(e.pointerId);
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    fling.x = fling.y = 0; target.x = cam.x; target.y = cam.y; zt = zoom;
    if (touches.size === 1) drag = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), travelled: 0 };
    else if (touches.size === 2) { pinch = span(); if (drag) drag.travelled = 99; }      // a second finger: not a tap any more
    canvas.style.cursor = "grabbing";
  });
  canvas.addEventListener("pointermove", e => {
    const q = touches.get(e.pointerId);
    if (!q) return;
    q.x = e.clientX; q.y = e.clientY;
    if (pinch && touches.size >= 2) {                        // two fingers: the points under them stay under them
      const m = span();
      cam.x = target.x = cam.x - (m.x - pinch.x) / zoom; cam.y = target.y = cam.y - (m.y - pinch.y) / zoom;
      if (pinch.d > 1) setZoom(zoom * m.d / pinch.d, m.x, m.y);
      zt = zoom; pinch = m; dirty = true;
      return;
    }
    if (!drag || e.pointerId !== drag.id) return;
    const now = performance.now(), dx = e.clientX - drag.x, dy = e.clientY - drag.y, dt = Math.max(1, now - drag.t);
    drag.travelled += Math.abs(dx) + Math.abs(dy);
    cam.x = target.x = cam.x - dx / zoom; cam.y = target.y = cam.y - dy / zoom;      // 1:1 under the finger
    fling.x = 0.7 * fling.x + 0.3 * (-dx / zoom / dt); fling.y = 0.7 * fling.y + 0.3 * (-dy / zoom / dt);
    drag.x = e.clientX; drag.y = e.clientY; drag.t = now;
    dirty = true;
  });
  const release = e => {
    if (!touches.delete(e.pointerId)) return;
    if (pinch) {
      if (touches.size >= 2) { pinch = span(); return; }
      pinch = null; fling.x = fling.y = 0;
      if (touches.size === 1) {                              // one finger left: it carries on dragging
        const [[id, q]] = [...touches];
        drag = { id, x: q.x, y: q.y, t: performance.now(), travelled: 99 };
        return;
      }
    }
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
    if (e.ctrlKey || e.metaKey || e.altKey) return;         // leave browser shortcuts alone
    if (e.key === "Home") { target.x = target.y = 0; fling.x = fling.y = 0; zoomBy(base / zt); e.preventDefault(); }
    else if (e.key === "+" || e.key === "=") { zoomBy(1.4); e.preventDefault(); }
    else if (e.key === "-" || e.key === "_") { zoomBy(1 / 1.4); e.preventDefault(); }
    else if (e.key === "0") { zoomBy(base / zt); e.preventDefault(); }
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
    if (Math.abs(zt / zoom - 1) > 0.002) setZoom(zoom * Math.exp(Math.log(zt / zoom) * (1 - Math.exp(-dt / 90))), anchor.x, anchor.y);
    tend(now);
    if (dirty) dirty = draw(now);
    requestAnimationFrame(frame);
  }

  resize();
  buildMask();
  requestAnimationFrame(frame);

  // for poking at from the console
  window.flowers = { cam, target, replant, zoomBy, stats: () => ({ chunks: chunks.size, samples: [...chunks.values()].reduce((n, c) => n + c.pts.length, 0), zoom }) };
})();
