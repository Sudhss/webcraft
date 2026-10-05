/* Shared playground pieces: a full-size canvas that stays sharp at any DPR and size. */
const CSS = `html, body { margin: 0; height: 100%; background: #101114; }
canvas { display: block; width: 100%; height: 100%; }`;

const FIT = `const canvas = document.querySelector('canvas');
const ctx = canvas.getContext('2d');
let W = 0, H = 0, dpr = 1;
function fit() {
  dpr = Math.min(devicePixelRatio, 2);
  W = canvas.clientWidth; H = canvas.clientHeight;
  canvas.width = Math.round(W * dpr);      // backing store: real pixels
  canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);  // draw in CSS px from here on
}
fit();
new ResizeObserver(fit).observe(canvas);
`;

export default {
  id: "canvas",
  n: 32,
  part: "F",
  title: "Canvas 2D",
  hook: "A bitmap and a pen. No DOM, no free hit testing, and 10,000 moving things at 60 fps if you do the maths.",
  minutes: 80,
  levels: ["use", "understand", "rebuild"],
  sections: [
    {
      title: "Immediate mode",
      beats: [
        { t: "say", x: "A canvas is a bitmap with a pen. `fillRect` turns some pixels orange and forgets it ever happened: no objects, no per-shape events, no layout. That's **immediate mode**. To move something, you clear and draw the whole frame again from your own data." },
        {
          t: "predict",
          lang: "js",
          src: `const box = { x: 20, y: 20 };
ctx.fillRect(box.x, box.y, 50, 50);
box.x = 200;`,
          q: "What's on the canvas after this runs?",
          options: ["A square at x = 200", "A square at x = 20", "Two squares", "Nothing until the next frame"],
          answer: 1,
          why: "The canvas kept no reference to `box`; it painted pixels at 20 and moved on. Changing your data changes nothing until you draw again. Your arrays are the scene graph; the canvas is only the output.",
        },
        {
          t: "table",
          head: ["", "DOM / SVG (retained)", "Canvas 2D (immediate)"],
          rows: [
            ["Cost grows with", "Nodes: style, layout and paint per element", "Draw calls, state changes and pixels filled per frame"],
            ["Hit testing, focus, a11y, selection", "Free", "You write all of it"],
            ["30 shapes, mostly static", "Wins: less code, crisp, accessible", "Overkill"],
            ["10k shapes moving at 60 fps", "Drowns in style recalc and layout", "Fine, while one frame stays under budget"],
            ["Per-pixel effects", "Not really", "`ImageData`, compositing modes"],
            ["Millions of things", "No", "Usually no: see Drawing a million things"],
          ],
        },
        {
          t: "play",
          mode: "html",
          title: "phyllotaxis.html",
          html: `<canvas></canvas>`,
          css: CSS,
          js: FIT + `
const N = 1200;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));   // 137.5 degrees

function frame(ms) {
  const t = ms / 1000;
  ctx.fillStyle = '#101114';
  ctx.fillRect(0, 0, W, H);                    // clear: we redraw everything
  const angle = GOLDEN + 0.001 * Math.sin(t * 0.25);
  const k = Math.min(W, H) / 2 / Math.sqrt(N);
  for (let i = 0; i < N; i++) {
    const r = k * Math.sqrt(i), a = i * angle;
    ctx.fillStyle = 'hsl(' + (i * 0.3 + t * 20) % 360 + ' 80% 62%)';
    ctx.beginPath();
    ctx.arc(W / 2 + r * Math.cos(a), H / 2 + r * Math.sin(a), 1 + (i / N) * 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);`,
          task: "Set `angle` to exactly `GOLDEN`, then to `GOLDEN + 0.01`. A 0.01 rad error turns a sunflower into spokes, because i reaches 1200.",
        },
        {
          t: "quiz",
          q: "A dashboard chart: 300 bars, tooltips, keyboard focus, screen-reader labels, updates once a second. Which?",
          options: ["Canvas, it's faster", "SVG or DOM", "WebGL", "Canvas plus a hidden colour buffer for hover"],
          answer: 1,
          why: "300 nodes at 1 Hz is nothing for the DOM, and focus, hit testing and accessibility come free. Canvas wins when shapes x frames per second is large; here you'd rebuild half a browser to save nothing.",
        },
      ],
    },
    {
      title: "Backing store, CSS size and DPR",
      beats: [
        { t: "say", x: "A canvas has two sizes. The `width` and `height` attributes set the **backing store**: real pixels in memory, 300x150 by default. CSS sets the **display size**. The browser stretches one onto the other, exactly like an `<img>`." },
        {
          t: "predict",
          lang: "html",
          src: `<!-- devicePixelRatio is 2 -->
<canvas width="300" height="150"
        style="width: 600px; height: 300px"></canvas>`,
          q: "How many device pixels does each canvas pixel end up covering?",
          options: ["1", "2x2", "4x4", "It depends on the content"],
          answer: 2,
          why: "CSS doubles it to 600 CSS px, and the display doubles again to 1200 device pixels. 300 pixels smeared across 1200: each becomes a 4x4 block. Blurry canvas text is almost always this mismatch.",
        },
        {
          t: "code",
          lang: "js",
          src: `let W, H, dpr;
function fit() {
  dpr = Math.min(devicePixelRatio, 2);       // cap: 3x costs 2.25x the pixels of 2x
  W = canvas.clientWidth;  H = canvas.clientHeight;
  canvas.width  = Math.round(W * dpr);       // backing store in device px
  canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);    // then think in CSS px
  draw();                                    // resizing cleared it: redraw now
}
new ResizeObserver(fit).observe(canvas);`,
          mark: [5, 7],
          note: "For exact device pixels at fractional DPRs (1.25, 1.5), observe with `{ box: 'device-pixel-content-box' }` and read `devicePixelContentBoxSize`. Not in every browser yet, so keep this as the fallback.",
        },
        {
          t: "play",
          mode: "html",
          title: "naive vs dpr-aware",
          html: `<div class="row">
  <figure><canvas id="a"></canvas><figcaption>width = CSS size</figcaption></figure>
  <figure><canvas id="b"></canvas><figcaption>width = CSS size x DPR</figcaption></figure>
</div>
<p id="dpr"></p>`,
          css: `body { margin: 0; padding: 12px; font: 13px system-ui; color: #bbb; background: #101114; }
.row { display: flex; gap: 12px; }
figure { margin: 0; flex: 1; min-width: 0; }
canvas { display: block; width: 100%; height: 170px; background: #1a1c21; border-radius: 6px; }`,
          js: `function draw(ctx, w, h) {
  ctx.fillStyle = '#e8e6e3';
  ctx.font = '600 22px system-ui';
  ctx.fillText('Crisp?', 12, 34);
  ctx.font = '11px system-ui';
  ctx.fillText('11px text and 1px lines', 12, 54);
  ctx.strokeStyle = '#f0a050';
  ctx.lineWidth = 1;
  for (let i = 0; i < 8; i++) {
    ctx.beginPath(); ctx.moveTo(12 + i * 8, 68); ctx.lineTo(50 + i * 8, h - 10); ctx.stroke();
  }
  ctx.beginPath(); ctx.arc(w - 48, h / 2 + 12, 34, 0, Math.PI * 2); ctx.stroke();
}

function setup(canvas, useDpr) {
  const ctx = canvas.getContext('2d');
  new ResizeObserver(() => {
    const dpr = useDpr ? devicePixelRatio : 1;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(ctx, w, h);
    document.getElementById('dpr').textContent = 'devicePixelRatio = ' + devicePixelRatio;
  }).observe(canvas);
}
setup(document.getElementById('a'), false);
setup(document.getElementById('b'), true);`,
          task: "On a 1x screen both match: browser-zoom to 200% (zoom changes `devicePixelRatio`). Then delete the `setTransform` line and see the right one draw at half size.",
        },
        {
          t: "predict",
          lang: "js",
          src: `// DPR 1, identity transform
ctx.lineWidth = 1;
ctx.strokeStyle = '#000';
ctx.beginPath();
ctx.moveTo(10, 0);
ctx.lineTo(10, 100);
ctx.stroke();`,
          q: "What does the line look like?",
          options: ["A crisp 1px black line", "2px wide and grey", "Invisible", "1px, dashed"],
          answer: 1,
          why: "A stroke is centred on its path. x = 10 is the boundary between two pixel columns, so half the line covers each: two columns at 50%. Move it to 10.5 and it fills exactly one column.",
        },
        {
          t: "pitfall",
          h: "The +0.5 trick is a DPR 1 trick",
          x: "A stroke is crisp when both edges land on device pixel boundaries: centre an odd device-pixel width on a half pixel, an even one on a whole pixel. At DPR 2 a 1px line is 2 device px and wants whole coordinates; at DPR 1.5 it's 1.5 px and is never crisp. Snap in device pixels.",
        },
        {
          t: "pitfall",
          h: "Resizing wipes the context state",
          x: "Setting `canvas.width`, even to its current value, clears the bitmap and resets the transform, font, styles and `imageSmoothingEnabled`. Pixel art goes blurry after the first resize. Re-apply state in the resize handler and redraw there: ResizeObserver runs before paint, so no blank flash.",
        },
      ],
    },
    {
      title: "The draw loop",
      beats: [
        { t: "say", x: "Every canvas app has the same shape: one rAF loop, `update(dt)` your data, clear, draw everything. Redrawing 2,000 shapes is cheap; working out which ones changed often isn't. Start with full redraws and earn anything cleverer." },
        {
          t: "code",
          lang: "js",
          src: `let last = 0;
function frame(now) {
  const dt = Math.min((now - (last || now)) / 1000, 1 / 20);  // s, clamped
  last = now;
  update(dt);                      // move data in units per second
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  draw(ctx);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);`,
          mark: [6, 7, 8],
          note: "`clearRect` obeys the current transform. Once a pan or zoom is set, clearing `0, 0, W, H` misses part of the canvas. Clear in identity, in backing-store pixels.",
        },
        {
          t: "play",
          mode: "html",
          title: "comets.html",
          html: `<canvas></canvas>`,
          css: CSS,
          js: FIT + `
const FADE = 0.08;
const comets = Array.from({ length: 7 }, (_, i) => ({
  r: 30 + i * 18, speed: 0.6 + Math.random() * 1.2, a: Math.random() * 6.28, hue: 20 + i * 40,
}));

let last = 0;
function frame(now) {
  const dt = Math.min((now - (last || now)) / 1000, 1 / 20);
  last = now;
  ctx.fillStyle = 'rgba(16, 17, 20, ' + FADE + ')';   // fade instead of clear
  ctx.fillRect(0, 0, W, H);
  const s = Math.min(W, H) / 300;
  for (const c of comets) {
    c.a += c.speed * dt;                                // radians per second
    const x = W / 2 + Math.cos(c.a) * c.r * s;
    const y = H / 2 + Math.sin(c.a * 1.3) * c.r * s * 0.7;
    ctx.fillStyle = 'hsl(' + c.hue + ' 90% 65%)';
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);`,
          task: "Set `FADE` to 0.02 and wait ten seconds: the old paths never quite leave. Then remove `beginPath()` and watch what the path does across frames.",
        },
        {
          t: "predict",
          lang: "js",
          src: `// every frame, on a dark background
ctx.fillStyle = 'rgba(16, 17, 20, 0.04)';
ctx.fillRect(0, 0, W, H);`,
          q: "Long after a white comet passed, what's left on its old path?",
          options: ["Pure background", "A faint grey ghost that never fades", "Black", "It flickers"],
          answer: 1,
          why: "Each frame moves a channel 4% of the way to the background, rounded to 8 bits. Once 4% of the gap rounds to nothing, it stops for good: in Chrome, white stalls at 38 over a background of 16. Fade trails leave ghosts; redraw trails from stored history instead.",
        },
        {
          t: "pitfall",
          h: "No beginPath: the path grows forever",
          x: "`arc` appends to the current path and `fill` paints all of it. `clearRect` doesn't touch the path. Skip `beginPath` and every frame repaints every circle since the start: moving shapes smear, and frame time climbs until the tab crawls, with no error anywhere.",
        },
      ],
    },
    {
      title: "Paths, fill rules and transforms",
      beats: [
        { t: "say", x: "A path is a list of subpaths built with `moveTo`, `lineTo`, `arc`, `bezierCurveTo`. Nothing reaches the bitmap until `fill()` or `stroke()`. A `Path2D` is a path you build once and reuse every frame, or hit test later." },
        {
          t: "predict",
          lang: "js",
          src: `ctx.beginPath();
ctx.arc(100, 100, 80, 0, Math.PI * 2);
ctx.moveTo(140, 100);
ctx.arc(100, 100, 40, 0, Math.PI * 2);
ctx.fill('evenodd');`,
          q: "What gets drawn?",
          options: ["A filled disc", "A ring with a hole", "The outlines of two circles", "Only the small circle"],
          answer: 1,
          why: "Even-odd counts how many edges a ray from the point crosses: odd means inside. The hole is crossed twice, so it's out. Under the default `nonzero` both circles wind the same way and you get a disc; draw the inner one with `anticlockwise = true` for a hole.",
        },
        {
          t: "pitfall",
          h: "arc draws a line to its start point",
          x: "`arc` first connects the current point to the arc's start. Two circles in one path get a spoke between them, invisible on fill and obvious on stroke. Call `moveTo(cx + r, cy)` before each `arc`, or start a new path per shape.",
        },
        {
          t: "code",
          lang: "js",
          src: `ctx.save();
ctx.translate(ship.x, ship.y);   // origin to the ship
ctx.rotate(ship.angle);          // rotate about it
ctx.scale(ship.size, ship.size);
drawShip(ctx);                   // draw around (0, 0), unit size
ctx.restore();                   // transform, styles, clip: all back`,
          note: "`save` and `restore` push and pop the transform, clip, styles, line and text settings. Not the path: that is not part of the drawing state.",
        },
        {
          t: "quiz",
          q: "`ctx.rotate(a); ctx.translate(100, 0); ctx.fillRect(-5, -5, 10, 10);` Where is the square as `a` changes?",
          options: ["At (100, 0), spinning in place", "On a circle of radius 100 around the origin", "At the origin", "At (100, 0), never rotated"],
          answer: 1,
          why: "Each call changes the coordinate system for what follows. Rotate the axes, then walk 100 along the rotated x axis: it orbits. Translate first, then rotate, to spin in place. Reading the calls top-down as axis changes avoids all matrix-order confusion.",
        },
        {
          t: "play",
          mode: "html",
          title: "tree.html",
          html: `<canvas></canvas>`,
          css: CSS,
          js: FIT + `
let t = 0;
function branch(len, depth) {
  ctx.strokeStyle = 'hsl(' + (40 + (10 - depth) * 9) + ' 55% ' + (30 + (10 - depth) * 5) + '%)';
  ctx.lineWidth = Math.max(depth * 1.1, 0.6);
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -len); ctx.stroke();
  if (depth === 0) return;
  ctx.translate(0, -len);                   // the tip is the new origin
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.rotate(side * 0.42 + 0.08 * Math.sin(t * 1.3 + depth * 0.7));
    branch(len * 0.74, depth - 1);
    ctx.restore();
  }
}

function frame(ms) {
  t = ms / 1000;
  ctx.fillStyle = '#101114';
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.translate(W / 2, H);
  ctx.lineCap = 'round';
  branch(H * 0.25, 10);                     // 2047 strokes, all in local space
  ctx.restore();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);`,
          task: "Delete the inner `save`/`restore` pair and predict the mess first. Then give each side a different angle for an asymmetric tree.",
        },
        {
          t: "pitfall",
          h: "An early return between save and restore",
          x: "One `return` between a `save` and its `restore` and the state stack grows by one entry per frame while the transform drifts. Nothing errors. Use `try { ... } finally { ctx.restore() }`, or start every frame with `setTransform` so a leak can't compound.",
        },
      ],
    },
    {
      title: "Draw calls, state and text",
      beats: [
        { t: "say", x: "Folklore says state changes are what's slow: every `fillStyle` assignment parses a CSS colour, so sort by style. Measure it. In Chrome a colour change per rect barely registers next to the fills, and one giant path per colour can even lose." },
        {
          t: "play",
          mode: "html",
          title: "batching.html",
          html: `<div class="ui">
  <button id="naive">per rect</button>
  <button id="sorted">sorted</button>
  <button id="batched">one path per colour</button>
  <span id="out">click to time 40,000 rects</span>
</div>
<canvas></canvas>`,
          css: `html, body { margin: 0; height: 100%; background: #101114; color: #ccc; font: 13px system-ui; }
.ui { height: 40px; display: flex; gap: 8px; align-items: center; padding: 0 10px; }
canvas { display: block; width: 100%; height: calc(100% - 40px); }`,
          js: FIT + `
const N = 40000;
const COLORS = ['#e8a33d', '#d9534f', '#5bc0de', '#5cb85c', '#9b6fd6', '#e8e6e3'];
const rects = Array.from({ length: N }, () => ({
  x: Math.random(), y: Math.random(), c: (Math.random() * COLORS.length) | 0,
}));
const byColour = [...rects].sort((a, b) => a.c - b.c);

const ways = {
  naive() {                                  // style change per rect
    for (const r of rects) { ctx.fillStyle = COLORS[r.c]; ctx.fillRect(r.x * W, r.y * H, 3, 3); }
  },
  sorted() {                                 // style change only when it differs
    let cur = -1;
    for (const r of byColour) {
      if (r.c !== cur) { cur = r.c; ctx.fillStyle = COLORS[cur]; }
      ctx.fillRect(r.x * W, r.y * H, 3, 3);
    }
  },
  batched() {                                // one path and one fill per colour
    for (let k = 0; k < COLORS.length; k++) {
      ctx.fillStyle = COLORS[k];
      ctx.beginPath();
      for (const r of byColour) if (r.c === k) ctx.rect(r.x * W, r.y * H, 3, 3);
      ctx.fill();
    }
  },
};

for (const name in ways) document.getElementById(name).onclick = () => {
  ctx.clearRect(0, 0, W, H);
  const t0 = performance.now();
  for (let i = 0; i < 5; i++) ways[name]();
  ctx.getImageData(0, 0, 1, 1);              // forces the GPU to finish, so we time real work
  const ms = (performance.now() - t0) / 5;
  document.getElementById('out').textContent = name + ': ' + ms.toFixed(1) + ' ms per frame';
};`,
          task: "Time each three times (the first run warms up), in two browsers if you can. Then add `ctx.shadowBlur = 4; ctx.shadowColor = '#000'` at the top and time again.",
        },
        {
          t: "pitfall",
          h: "shadowBlur on 1,000 particles is 1,000 blurs",
          x: "Shadows and `filter` are applied per draw call, so a glow on each particle multiplies by n and frame time falls off a cliff. Render one glowing sprite into a small offscreen canvas once, then `drawImage` it n times. Same look, a fraction of the cost.",
        },
        { t: "say", h: "Text sits on a baseline", x: "`fillText(s, x, y)` puts the **baseline** at y, not the top. `measureText` returns `TextMetrics`: `width`, plus the ink box (`actualBoundingBoxAscent`, `actualBoundingBoxDescent`) you need to centre a label or fit it in a box." },
        {
          t: "code",
          lang: "js",
          src: `ctx.font = '600 32px Inter, system-ui';
ctx.textAlign = 'center';
ctx.textBaseline = 'alphabetic';
const m = ctx.measureText(label);
const ascent = m.actualBoundingBoxAscent, descent = m.actualBoundingBoxDescent;
// ink box from y - ascent to y + descent; put its middle on cy
ctx.fillText(label, cx, cy + (ascent - descent) / 2);`,
          mark: [7],
          note: "`textBaseline = 'middle'` centres the em box, not the ink, so where the letters land depends on the font and on the letters themselves. Measure when alignment matters.",
        },
        {
          t: "pitfall",
          h: "The web font arrives after you drew",
          x: "Canvas draws with whatever font is ready at `fillText` time and never redraws for you. A static scene keeps the fallback forever, and widths you measured are wrong too. `await document.fonts.load('600 32px Inter')` before the first draw and before any `measureText`.",
        },
      ],
    },
    {
      title: "Images and pixels",
      beats: [
        {
          t: "code",
          lang: "js",
          src: `const img = new Image();
img.src = 'sheet.png';
await img.decode();                              // drawImage before this draws nothing

ctx.drawImage(img, x, y);                        // natural size
ctx.drawImage(img, x, y, w, h);                  // scaled
ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);  // one sprite-sheet cell
ctx.imageSmoothingEnabled = false;               // pixel art: nearest neighbour`,
          note: "A cross-origin image without CORS **taints** the canvas: drawing works, but `getImageData` and `toDataURL` throw a SecurityError. Set `img.crossOrigin = 'anonymous'` and serve CORS headers.",
        },
        { t: "say", x: "`getImageData` gives you RGBA as a `Uint8ClampedArray`, 4 bytes per pixel, row by row. Write into one, `putImageData` it, and you have a software renderer. View the same buffer as a `Uint32Array` to write a whole pixel per store." },
        {
          t: "predict",
          lang: "js",
          src: `const img = ctx.createImageData(1, 1);
const u32 = new Uint32Array(img.data.buffer);
u32[0] = 0xffff0000;
ctx.putImageData(img, 0, 0);`,
          q: "On a normal laptop or phone, what colour is the pixel?",
          options: ["Red", "Blue", "Yellow", "Transparent"],
          answer: 1,
          why: "Little-endian CPUs store the low byte first, so memory holds 00 00 ff ff: R 0, G 0, B 255, A 255. Read the hex as 0xAABBGGRR. Virtually every CPU you'll ship to is little-endian.",
        },
        {
          t: "play",
          mode: "html",
          title: "plasma.html",
          html: `<canvas></canvas>`,
          css: CSS,
          js: FIT + `
const S = 4;                                   // one buffer pixel per 4x4 CSS px
const buf = document.createElement('canvas');
const bctx = buf.getContext('2d');
let img, u32;
function alloc() {
  buf.width = Math.max(1, Math.ceil(W / S));
  buf.height = Math.max(1, Math.ceil(H / S));
  img = bctx.createImageData(buf.width, buf.height);
  u32 = new Uint32Array(img.data.buffer);
}
alloc();
new ResizeObserver(alloc).observe(canvas);

const pal = new Uint32Array(256);              // 0xAABBGGRR, built once
for (let i = 0; i < 256; i++) {
  const a = (i / 256) * Math.PI * 2;
  const r = 128 + 127 * Math.cos(a), g = 128 + 127 * Math.cos(a + 2.1), b = 128 + 127 * Math.cos(a + 4.2);
  pal[i] = (255 << 24) | (b << 16) | (g << 8) | r;
}

function frame(ms) {
  const t = ms / 1000, w = buf.width, h = buf.height;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = Math.sin(x * 0.06 + t) + Math.sin(y * 0.08 - t * 1.3)
              + Math.sin((x + y) * 0.04 + t * 0.7)
              + Math.sin(Math.hypot(x - w / 2, y - h / 2) * 0.12 - t * 2);
      u32[y * w + x] = pal[((v + 4) * 32) & 255];
    }
  }
  bctx.putImageData(img, 0, 0);                // ignores transforms: raw pixels
  ctx.drawImage(buf, 0, 0, W, H);              // obeys them: scaled up, smoothed
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);`,
          task: "Set `S` to 1 and watch the cost of per-pixel JS. Then set `ctx.imageSmoothingEnabled = false` before `drawImage` for a chunky retro look.",
        },
        {
          t: "pitfall",
          h: "putImageData then getImageData is lossy",
          x: "Canvas stores colour premultiplied by alpha. Put (1, 127, 255) at alpha 1 and you can read back (255, 255, 255): at alpha 1/255 almost no colour survives. Never use a canvas as storage for data with alpha; keep your own typed array and only push it out.",
        },
        {
          t: "pitfall",
          h: "Your pixel values change on a P3 canvas",
          x: "`getImageData` returns pixels in the canvas's colour space. On a `{ colorSpace: 'display-p3' }` canvas, `#ff0000` reads back as about (234, 51, 35). Pass `{ colorSpace: 'srgb' }` to `getImageData` when you compare against CSS colours or ids.",
        },
        {
          t: "quiz",
          q: "You read one pixel with `getImageData` on every `pointermove` over a large canvas, and Chrome warns in the console. What's slow?",
          options: ["Allocating the array", "Each read waits for the GPU to finish and copies pixels back to the CPU", "getImageData always scans the whole canvas", "Pointer events are throttled"],
          answer: 1,
          why: "An accelerated canvas lives on the GPU; a read stalls the pipeline and copies back. `getContext('2d', { willReadFrequently: true })` keeps it on the CPU: fast reads, slower draws. Right for a picking buffer, wrong for the main view.",
        },
      ],
    },
    {
      title: "Hit testing and dragging",
      beats: [
        { t: "say", x: "Canvas has no per-shape events. You get one `pointermove` for the whole canvas and answer the question yourself: which shape is under (x, y)? Three ways to answer it, each with a different cost curve." },
        {
          t: "table",
          head: ["Method", "Good at", "Watch out"],
          rows: [
            ["Maths", "Circles, boxes, segments: a few flops each", "O(n) per query; add a grid for big n"],
            ["`isPointInPath(path, x, y)`", "Any Path2D, exact, honours fill rules", "One call per candidate; mind the transform"],
            ["Colour buffer", "O(1) per query, any shape, any n", "Draws everything twice; antialiased edges lie"],
          ],
        },
        {
          t: "predict",
          lang: "js",
          src: `// fit() did ctx.setTransform(dpr, 0, 0, dpr, 0, 0), and dpr = 2
const star = new Path2D(/* points in CSS px */);
canvas.onpointermove = (e) => {
  const b = canvas.getBoundingClientRect();
  hot = ctx.isPointInPath(star, e.clientX - b.left, e.clientY - b.top);
};`,
          q: "Where does the star respond to the mouse?",
          options: ["Exactly over the star", "In a double-size copy down and to the right", "Nowhere", "Everywhere"],
          answer: 1,
          why: "A Path2D is transformed by the current matrix, so it's tested in device pixels. The point is not: it is read as backing-store pixels. A star at CSS (100, 100) sits at device (200, 200), so the mouse must be at CSS (200, 200) to hit it. Pass `x * dpr, y * dpr`.",
        },
        {
          t: "play",
          mode: "html",
          title: "drag.html",
          html: `<canvas></canvas>`,
          css: CSS + `\ncanvas { touch-action: none; }`,
          js: FIT + `
function starPath(n, R, r) {                   // unit star around (0, 0)
  const p = new Path2D();
  for (let i = 0; i < n * 2; i++) {
    const a = (i * Math.PI) / n - Math.PI / 2, d = i % 2 ? r : R;
    p.lineTo(Math.cos(a) * d, Math.sin(a) * d);
  }
  p.closePath();
  return p;
}
const STAR = starPath(5, 1, 0.45);
let shapes = [];                               // filled on the first frame with a real size
const scatter = () => Array.from({ length: 14 }, (_, i) => ({
  x: 40 + Math.random() * (W - 80), y: 40 + Math.random() * (H - 80),
  r: 18 + Math.random() * 22, hue: Math.random() * 360, star: i % 3 === 0,
}));

function place(s) { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.translate(s.x, s.y); ctx.scale(s.r, s.r); }
function hit(s, px, py) {
  if (!s.star) return (px - s.x) ** 2 + (py - s.y) ** 2 <= s.r * s.r;   // maths
  place(s);
  return ctx.isPointInPath(STAR, px * dpr, py * dpr);                    // backing-store px
}
function pick(px, py) {                                                  // topmost first
  for (let i = shapes.length - 1; i >= 0; i--) if (hit(shapes[i], px, py)) return shapes[i];
  return null;
}

let drag = null, hover = null;
const pos = (e) => { const b = canvas.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
canvas.addEventListener('pointerdown', (e) => {
  const [px, py] = pos(e), s = pick(px, py);
  if (!s) return;
  shapes.splice(shapes.indexOf(s), 1); shapes.push(s);                   // bring to front
  drag = { s, dx: px - s.x, dy: py - s.y };
  canvas.setPointerCapture(e.pointerId);                                 // keep the drag outside
});
canvas.addEventListener('pointermove', (e) => {
  const [px, py] = pos(e);
  if (drag) { drag.s.x = px - drag.dx; drag.s.y = py - drag.dy; }
  hover = drag ? drag.s : pick(px, py);
  canvas.style.cursor = drag ? 'grabbing' : hover ? 'grab' : 'default';
});
const end = () => { drag = null; };
canvas.addEventListener('pointerup', end);
canvas.addEventListener('pointercancel', end);

function frame() {
  if (!shapes.length && W > 80) shapes = scatter();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#101114'; ctx.fillRect(0, 0, W, H);
  for (const s of shapes) {
    place(s);
    ctx.fillStyle = 'hsl(' + s.hue + ' 70% ' + (s === hover ? 68 : 55) + '%)';
    ctx.beginPath();
    if (s.star) ctx.fill(STAR); else { ctx.arc(0, 0, 1, 0, Math.PI * 2); ctx.fill(); }
    if (s === hover) {
      ctx.lineWidth = 2 / s.r; ctx.strokeStyle = '#fff';
      if (s.star) ctx.stroke(STAR); else ctx.stroke();
    }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);`,
          task: "Drag the stars and circles. Remove `* dpr` from the isPointInPath call and hover a star at 200% browser zoom. Then hit-test circles with isPointInPath too.",
        },
        {
          t: "pitfall",
          h: "Dragging on a phone scrolls the page",
          x: "Without `touch-action: none` on the canvas, the browser claims the touch for scrolling and fires `pointercancel` after a few pixels: your drag just stops. Set it in CSS, and `setPointerCapture` on pointerdown so the drag survives the finger leaving the canvas.",
        },
        {
          t: "pitfall",
          h: "Picking colours lie at the edges",
          x: "Colour picking draws each shape in a unique opaque colour offscreen, reads one pixel and maps it back to an id. But paths are antialiased with no switch to turn it off, so edge pixels blend two ids into a third that may be real. Space ids apart, ignore unknowns, confirm with maths.",
        },
      ],
    },
    {
      title: "Scaling up: grids, dirty rects, workers",
      beats: [
        { t: "say", x: "Particles that interact are the classic O(n^2): every pair checks its distance. Bucket them into a **uniform grid** with cell size equal to the interaction radius, and each particle only checks the 3x3 cells around it." },
        {
          t: "play",
          mode: "html",
          title: "constellation.html",
          html: `<label class="ui"><input id="grid" type="checkbox" checked> spatial grid <span id="out"></span></label>
<canvas></canvas>`,
          css: CSS + `\n.ui { position: fixed; left: 8px; top: 6px; padding: 4px 8px; border-radius: 6px; background: #101114d0; color: #ccc; font: 13px system-ui; }`,
          js: FIT + `
const R = 22;
let N = 0, px, py, vx, vy, next;
function seed() {                              // once the canvas has a real size
  N = Math.min(6000, Math.max(300, Math.round((W * H) / 140)));
  px = new Float32Array(N); py = new Float32Array(N);
  vx = new Float32Array(N); vy = new Float32Array(N); next = new Int32Array(N);
  for (let i = 0; i < N; i++) {
    const a = Math.random() * Math.PI * 2;
    px[i] = Math.random() * W; py[i] = Math.random() * H;
    vx[i] = Math.cos(a) * 18; vy[i] = Math.sin(a) * 18;
  }
}
let head = new Int32Array(0), cols = 0, rows = 0, checks = 0;
function build() {                             // one linked list per cell, no allocation
  cols = Math.ceil(W / R) + 1; rows = Math.ceil(H / R) + 1;
  if (head.length < cols * rows) head = new Int32Array(cols * rows);
  head.fill(-1);
  for (let i = 0; i < N; i++) {
    const cell = ((py[i] / R) | 0) * cols + ((px[i] / R) | 0);
    next[i] = head[cell]; head[cell] = i;
  }
}
const LEVELS = 4;
let paths = [];
function link(i, j) {
  checks++;
  const dx = px[i] - px[j], dy = py[i] - py[j], d2 = dx * dx + dy * dy;
  if (d2 >= R * R) return;
  const p = paths[Math.min(LEVELS - 1, ((Math.sqrt(d2) / R) * LEVELS) | 0)];
  p.moveTo(px[i], py[i]); p.lineTo(px[j], py[j]);
}

let last = 0, seeded = false;
function frame(now) {
  if (!seeded && W) { seed(); seeded = true; }
  const dt = Math.min((now - (last || now)) / 1000, 1 / 20);
  last = now;
  for (let i = 0; i < N; i++) {
    px[i] += vx[i] * dt; py[i] += vy[i] * dt;
    if (px[i] < 0 || px[i] > W) { vx[i] = -vx[i]; px[i] = Math.min(W, Math.max(0, px[i])); }
    if (py[i] < 0 || py[i] > H) { vy[i] = -vy[i]; py[i] = Math.min(H, Math.max(0, py[i])); }
  }
  paths = Array.from({ length: LEVELS }, () => new Path2D());   // batch lines by alpha
  checks = 0;
  const t0 = performance.now();
  if (document.getElementById('grid').checked) {
    build();
    for (let i = 0; i < N; i++) {
      const cx = (px[i] / R) | 0, cy = (py[i] / R) | 0;
      for (let y = Math.max(cy - 1, 0); y <= Math.min(cy + 1, rows - 1); y++)
        for (let x = Math.max(cx - 1, 0); x <= Math.min(cx + 1, cols - 1); x++)
          for (let j = head[y * cols + x]; j !== -1; j = next[j]) if (j > i) link(i, j);
    }
  } else {
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) link(i, j);
  }
  const ms = performance.now() - t0;
  ctx.fillStyle = '#101114'; ctx.fillRect(0, 0, W, H);
  ctx.lineWidth = 1;
  for (let k = 0; k < LEVELS; k++) {
    ctx.strokeStyle = 'rgba(240, 170, 90, ' + (0.6 - k * 0.14) + ')';
    ctx.stroke(paths[k]);
  }
  document.getElementById('out').textContent = N + ' points, ' + checks.toLocaleString() + ' checks, ' + ms.toFixed(1) + ' ms';
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);`,
          task: "Untick the grid and compare checks and ms. Then size the cells `R / 2` (in `build` and the cell lookup, not in `link`) and watch links vanish.",
        },
        {
          t: "quiz",
          q: "Interaction radius R. You make cells R / 2 to cut false candidates. What else must change?",
          options: ["Nothing", "Scan 5x5 cells instead of 3x3, or you miss pairs", "Use a quadtree", "Double R"],
          answer: 1,
          why: "A neighbour up to R away can now sit two cells over. Keep the 3x3 scan and pairs silently vanish, the usual grid bug. With 5x5 it's correct, but rarely faster: cell = R with 3x3 is the sweet spot for uniform data.",
        },
        {
          t: "table",
          head: ["", "Full redraw", "Dirty rects"],
          rows: [
            ["Work per frame", "Every shape, every pixel", "Shapes overlapping the changed regions"],
            ["Wins when", "Much of the scene moves, or it's cheap to draw", "One small thing changes on a big, costly static scene"],
            ["Bug surface", "Tiny", "Stale crumbs wherever a bounds box was too small"],
            ["Middle ground", "Two stacked canvases: static layer drawn once", "Moving layer redrawn fully each frame"],
          ],
        },
        {
          t: "pitfall",
          h: "Dirty rects need the ink box, not the shape box",
          x: "A stroke spills `lineWidth / 2` past its geometry, antialiasing adds a pixel, and shadows reach out by the blur. Clip to a rect that misses any of it and you leave crumbs that only show after a drag. Inflate by half the stroke + blur + 1 px, then round outward to device pixels.",
        },
        { t: "say", h: "OffscreenCanvas in a worker", x: "`transferControlToOffscreen()` hands a canvas to a worker, which draws with its own rAF. The page shows the result. A worker doesn't draw faster; it draws **independently**, so a busy main thread no longer freezes the animation." },
        {
          t: "code",
          lang: "js",
          file: "main.js + render.js",
          src: `// main.js
const off = canvas.transferControlToOffscreen();
const worker = new Worker('render.js');
worker.postMessage({ canvas: off }, [off]);          // transfer, not copy
new ResizeObserver(([e]) => {
  const { width, height } = e.contentRect;           // canvas.width = ... would throw now
  worker.postMessage({ width, height, dpr: devicePixelRatio });
}).observe(canvas);

// render.js
let ctx;
onmessage = ({ data }) => {
  if (data.canvas) { ctx = data.canvas.getContext('2d'); requestAnimationFrame(frame); }
  if (data.width) {
    ctx.canvas.width = Math.round(data.width * data.dpr);   // resize happens here
    ctx.canvas.height = Math.round(data.height * data.dpr);
    ctx.setTransform(data.dpr, 0, 0, data.dpr, 0, 0);
  }
};`,
          mark: [6, 14, 15],
          note: "After the transfer the element is a placeholder: setting its `width` throws InvalidStateError. Input still arrives on the main thread; forward the events you need.",
        },
        {
          t: "play",
          mode: "html",
          title: "worker.html",
          html: `<div class="ui"><button id="jank">Block the main thread for 1 s</button> <span id="msg"></span></div>
<div class="row"><canvas id="main"></canvas><canvas id="off"></canvas></div>`,
          css: `html, body { margin: 0; height: 100%; background: #101114; color: #ccc; font: 13px system-ui; }
.ui { height: 40px; display: flex; align-items: center; gap: 8px; padding: 0 10px; }
.row { display: flex; height: calc(100% - 40px); }
canvas { flex: 1; min-width: 0; display: block; }`,
          js: `function draw(ctx, w, h, t, label) {
  ctx.fillStyle = '#101114'; ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.translate(w / 2, h / 2);
  for (let i = 0; i < 12; i++) {
    ctx.rotate(Math.PI / 6);
    ctx.fillStyle = 'hsl(' + ((i * 30 + t * 90) % 360) + ' 80% 60%)';
    ctx.fillRect(16 + 10 * Math.sin(t * 3 + i), -4, 30, 8);
  }
  ctx.restore();
  ctx.fillStyle = '#ccc'; ctx.font = '12px system-ui'; ctx.fillText(label, 10, 20);
}

function workerMain() {                        // this function runs inside the worker
  let ctx, w = 1, h = 1;
  self.onmessage = (e) => {
    const d = e.data;
    if (d.canvas) { ctx = d.canvas.getContext('2d'); requestAnimationFrame(frame); }
    if (d.w) {
      w = d.w; h = d.h;
      ctx.canvas.width = Math.round(w * d.dpr); ctx.canvas.height = Math.round(h * d.dpr);
      ctx.setTransform(d.dpr, 0, 0, d.dpr, 0, 0);
    }
  };
  function frame(ms) { draw(ctx, w, h, ms / 1000, 'worker'); requestAnimationFrame(frame); }
}

const main = document.getElementById('main'), mctx = main.getContext('2d');
const off = document.getElementById('off');
const size = (c) => ({ w: c.clientWidth, h: c.clientHeight, dpr: Math.min(devicePixelRatio, 2) });

new ResizeObserver(() => {
  const s = size(main);
  main.width = Math.round(s.w * s.dpr); main.height = Math.round(s.h * s.dpr);
  mctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0);
}).observe(main);
(function frame(ms) { const s = size(main); draw(mctx, s.w, s.h, ms / 1000, 'main thread'); requestAnimationFrame(frame); })(0);

try {
  const src = draw.toString() + ';(' + workerMain.toString() + ')();';
  const worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
  const handle = off.transferControlToOffscreen();
  worker.postMessage({ canvas: handle }, [handle]);
  new ResizeObserver(() => worker.postMessage(size(off))).observe(off);
} catch (err) {
  document.getElementById('msg').textContent = 'No worker canvas here: ' + err.message;
}

document.getElementById('jank').onclick = () => {
  const end = performance.now() + 1000;
  while (performance.now() < end) {}           // a long task: think big JSON.parse
};`,
          task: "Click the button: the left one freezes, the right one keeps spinning. Then make the worker's draw cost 30 ms and see it stutter on its own.",
        },
        {
          t: "quiz",
          q: "Your canvas animation drops frames. Profiling shows `draw()` alone takes 28 ms. Does moving it to an OffscreenCanvas worker fix it?",
          options: ["Yes, workers run on the GPU", "No: it still takes 28 ms, just on another thread", "Yes, OffscreenCanvas skips compositing", "Only on Chrome"],
          answer: 1,
          why: "A worker removes interference from the main thread: React renders, parsing, GC. It doesn't make drawing cheaper. 28 ms is still under 36 fps. Cut the work first (batching, caching, fewer pixels), then consider a worker.",
        },
      ],
    },
    {
      title: "Rebuild: a pan and zoom canvas",
      beats: [
        { t: "say", x: "Pan and zoom is one affine map: `screen = world * scale + pan`. Every drifting zoom in every map, editor and diagram tool is that formula applied in the wrong direction or in the wrong order." },
        {
          t: "predict",
          lang: "js",
          src: `canvas.onwheel = (e) => {
  e.preventDefault();
  scale *= Math.exp(-e.deltaY * 0.0015);
};
// draw: ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * panX, dpr * panY)`,
          q: "You wheel-zoom with the cursor over a city on the map. What happens?",
          options: ["The city stays under the cursor", "Everything zooms toward the screen point (panX, panY), so the city slides away", "It zooms about the canvas centre", "Nothing, the listener is passive"],
          answer: 1,
          why: "Only scale changed, so the one fixed point is world (0, 0), drawn at (panX, panY). To zoom about the cursor, take the world point under it first, change scale, then solve pan so that point lands where it was. Also `onwheel` set this way is not passive.",
        },
        {
          t: "code",
          lang: "js",
          src: `// screen = world * scale + pan   (CSS px; dpr goes on top, once)
const toWorld = (sx, sy) => [(sx - panX) / scale, (sy - panY) / scale];

function zoomAt(sx, sy, factor) {
  const [wx, wy] = toWorld(sx, sy);              // what is under the cursor now
  scale = Math.min(50, Math.max(0.05, scale * factor));
  panX = sx - wx * scale;                        // put it back under the cursor
  panY = sy - wy * scale;
}`,
          mark: [5, 7, 8],
          note: "Multiply by `exp(-deltaY * k)` instead of adding to scale: zooming in and back out by the same wheel distance lands exactly where you started, at any zoom level.",
        },
        {
          t: "rebuild",
          h: "A pan and zoom canvas",
          x: "A world of 400 points under a camera. Wheel or pinch zooms about the cursor, drag pans, hover uses the inverse map, and the grid picks its spacing from the zoom. Read how one formula drives all four, then extend it.",
          mode: "html",
          title: "panzoom.html",
          html: `<canvas></canvas>`,
          css: CSS + `\ncanvas { touch-action: none; cursor: grab; }`,
          js: FIT + `
let scale = 1, panX = 0, panY = 0, centred = false;
const toWorld = (sx, sy) => [(sx - panX) / scale, (sy - panY) / scale];
function zoomAt(sx, sy, f) {
  const [wx, wy] = toWorld(sx, sy);
  scale = Math.min(50, Math.max(0.05, scale * f));
  panX = sx - wx * scale; panY = sy - wy * scale;
}
const pts = Array.from({ length: 400 }, (_, i) => {
  const a = i * 2.39996, r = 12 * Math.sqrt(i);
  return { x: Math.cos(a) * r, y: Math.sin(a) * r, hue: (i * 0.9) % 360 };
});

const pos = (e) => { const b = canvas.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();                          // or the page scrolls or zooms
  const [sx, sy] = pos(e);
  const unit = e.deltaMode === 1 ? 16 : 1;     // lines vs pixels
  zoomAt(sx, sy, Math.exp(-e.deltaY * unit * (e.ctrlKey ? 0.01 : 0.0015)));  // ctrlKey: pinch
}, { passive: false });

let drag = null, hover = null, mouse = [-1e9, -1e9];
canvas.addEventListener('pointerdown', (e) => {
  drag = { x: pos(e)[0] - panX, y: pos(e)[1] - panY };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  mouse = pos(e);
  if (drag) { panX = mouse[0] - drag.x; panY = mouse[1] - drag.y; }
});
canvas.addEventListener('pointerup', () => { drag = null; });

function frame() {
  if (!centred && W) { panX = W / 2; panY = H / 2; centred = true; }   // world (0, 0) in the middle
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#101114'; ctx.fillRect(0, 0, W, H);
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * panX, dpr * panY);
  const [x0, y0] = toWorld(0, 0), [x1, y1] = toWorld(W, H);
  const step = 10 ** Math.ceil(Math.log10(40 / scale));   // world units, >= 40 px apart
  ctx.beginPath();
  for (let x = Math.floor(x0 / step) * step; x <= x1; x += step) { ctx.moveTo(x, y0); ctx.lineTo(x, y1); }
  for (let y = Math.floor(y0 / step) * step; y <= y1; y += step) { ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
  ctx.lineWidth = 1 / scale;                   // 1 CSS px at any zoom
  ctx.strokeStyle = '#262931'; ctx.stroke();

  const [mx, my] = toWorld(mouse[0], mouse[1]);
  hover = null;
  for (const p of pts) {
    ctx.fillStyle = 'hsl(' + p.hue + ' 75% 60%)';
    ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill();
    if ((p.x - mx) ** 2 + (p.y - my) ** 2 < (4 + 3 / scale) ** 2) hover = p;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);      // HUD in screen space
  ctx.fillStyle = '#9a9a9a'; ctx.font = '12px system-ui';
  let hud = 'scale ' + scale.toFixed(2) + '   grid ' + step + ' units';
  if (hover) hud += '   point (' + hover.x.toFixed(1) + ', ' + hover.y.toFixed(1) + ')';
  ctx.fillText(hud, 10, H - 10);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);`,
          task: "Add two-finger touch pinch: track both pointers, zoom by the ratio of their distances about their midpoint. Then double-click to zoom 2x at the cursor, animated with exp smoothing.",
        },
        {
          t: "pitfall",
          h: "Trackpad pinch arrives as ctrl + wheel",
          x: "In Chrome and Firefox a trackpad pinch is a `wheel` event with `ctrlKey` true, and its default action zooms the whole page. Call `preventDefault` in a listener registered with `{ passive: false }`, treat ctrl-wheels as zoom, and test with a real trackpad and a real mouse.",
        },
        {
          t: "mission",
          h: "Fireworks with a budget",
          x: "A particle system: clicks spawn bursts; particles have velocity, drag and gravity in units per second, fade by age, and die. Hold 60 fps with 20,000 alive: typed arrays, no allocation per frame, one pre-rendered glow sprite, additive blending. Show the count and frame time.",
          hint: "Struct of arrays: one `Float32Array` per field. To kill particle i, copy the last live one into slot i and shrink the count, so the live ones stay packed and the loop never skips holes.",
          solution: {
            lang: "js",
            src: `const MAX = 20000;
const x = new Float32Array(MAX), y = new Float32Array(MAX);
const vx = new Float32Array(MAX), vy = new Float32Array(MAX), age = new Float32Array(MAX);
let alive = 0;

function burst(px, py, n) {
  for (let k = 0; k < n && alive < MAX; k++, alive++) {
    const a = Math.random() * Math.PI * 2, s = 60 + Math.random() * 240;
    x[alive] = px; y[alive] = py; age[alive] = 0;
    vx[alive] = Math.cos(a) * s; vy[alive] = Math.sin(a) * s;
  }
}

function update(dt) {
  const drag = Math.exp(-1.5 * dt);              // frame-rate independent
  for (let i = 0; i < alive; i++) {
    age[i] += dt;
    if (age[i] > 2) {                            // swap-remove
      alive--;
      x[i] = x[alive]; y[i] = y[alive]; vx[i] = vx[alive]; vy[i] = vy[alive]; age[i] = age[alive];
      i--; continue;
    }
    vx[i] *= drag; vy[i] = vy[i] * drag + 300 * dt;
    x[i] += vx[i] * dt; y[i] += vy[i] * dt;
  }
}

function draw(ctx, glow) {                       // glow: a 16x16 canvas, rendered once
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < alive; i++) {
    ctx.globalAlpha = 1 - age[i] / 2;
    ctx.drawImage(glow, x[i] - 8, y[i] - 8);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}`,
          },
        },
      ],
    },
  ],
  nobodyTells: [
    "Route every pointer coordinate through one function and keep `dpr` in one variable. Half of all canvas bugs are a missing or doubled `* dpr`.",
    "Cap DPR at 2 for full-screen canvases. A 3x phone pushes 2.25x the pixels of 2x for a difference nobody can see.",
    "When Chrome warns about getImageData and `willReadFrequently`, it's telling you about a GPU readback stall. Read the console.",
    "Draw a debug overlay of your spatial grid and dirty rects behind a key. Invisible data structures hide their bugs.",
    "`ctx.getTransform().inverse().transformPoint(p)` maps a backing-store point into whatever space you are currently drawing in.",
    "Keep the scene in plain arrays you can serialise. Undo, save, replay and tests fall out of it; the canvas is only a view.",
    "Pre-render anything expensive (text, glows, complex paths) into a small canvas once and `drawImage` it. Blitting is the cheapest thing canvas does.",
    "Stop the loop when nothing changes. A static canvas redrawing at 120 Hz drains a laptop battery for nothing.",
  ],
  glossary: [
    ["immediate mode", "You issue draw commands each frame and the API keeps no objects. Canvas 2D works this way."],
    ["retained mode", "The system keeps a tree of objects and redraws it for you. The DOM and SVG work this way."],
    ["backing store", "The canvas's real pixel buffer, sized by its width and height attributes, then stretched to the CSS size."],
    ["devicePixelRatio", "Device pixels per CSS pixel: 2 on most phones and retina laptops. Changes with browser zoom."],
    ["Path2D", "A reusable path object you can fill, stroke and hit test without rebuilding it."],
    ["fill rule", "How a path decides inside: `nonzero` counts winding direction, `evenodd` counts edge crossings."],
    ["drawing state", "Transform, clip, styles, line and text settings: what save() and restore() push and pop. Not the path."],
    ["ImageData", "A width x height RGBA byte array you read with getImageData and write with putImageData."],
    ["premultiplied alpha", "Storing colour already multiplied by alpha. Faster blending, lossy round trips at low alpha."],
    ["tainted canvas", "A canvas that drew cross-origin pixels without CORS. Pixel reads and exports then throw."],
    ["colour picking", "Hit testing by drawing each shape in a unique colour offscreen and reading the pixel under the pointer."],
    ["spatial grid", "Buckets of objects by cell so neighbour queries scan only nearby cells instead of all n."],
    ["dirty rect", "The region that changed since the last frame; redraw only shapes that overlap it."],
    ["OffscreenCanvas", "A canvas not tied to the DOM; with transferControlToOffscreen, a worker draws what the page shows."],
  ],
  explain: "Explain to a friend why a canvas looks blurry on a retina screen, and every line it takes to fix it, including the pointer maths for hit testing.",
};
