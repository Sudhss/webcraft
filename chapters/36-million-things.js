const raw = String.raw;

export default {
  id: "million-things",
  n: 36,
  part: "F",
  title: "Drawing a million things",
  hook: "A million rows, points or sprites, smooth. It's a complexity problem with four different n's, and your code only shows one.",
  minutes: 95,
  levels: ["use", "understand", "rebuild"],
  sections: [
    {
      title: "Four n's, not one",
      beats: [
        { t: "say", x: "\"A million things\" is not one n. There's the items your JS touches per frame, the bytes you send to the GPU per frame, the draw calls you issue, and the pixels the GPU shades. Each has its own ceiling, and usually only one is binding." },
        {
          t: "table",
          head: ["Cost", "Scales with", "Usual fix"],
          rows: [
            ["JS per item", "items touched per frame x work each", "typed arrays, touch only what changed, move it to the GPU or a worker"],
            ["Upload", "bytes sent to the GPU per frame", "static buffers, partial updates, smaller types"],
            ["Draw calls", "calls x state changes", "batching, instancing"],
            ["Fill rate", "pixels shaded, including overdraw", "smaller things, lower DPR, cull, aggregate"],
            ["DOM", "elements in the tree", "virtualise: only render what's on screen"],
          ],
        },
        { t: "say", h: "The budget is a measurement", x: "At 60 Hz a frame is 16.7 ms, at 120 Hz 8.3 ms, and the browser needs part of that for style, compositing and the GPU process. There is no universal \"N things at 60 fps\". You find yours on your target device." },
        { t: "viz", name: "framebudget" },
        {
          t: "predict",
          lang: "text",
          src: "50,000 sprites, 8 ms per frame on the target laptop.\nHalve the canvas resolution     -> 8 ms\nDraw nothing, keep the JS loop  -> 7.5 ms\nKeep drawing, skip the JS loop  -> 1.5 ms",
          q: "Which is the bottleneck?",
          options: ["Fill rate", "JS per item", "Draw calls", "Upload bandwidth"],
          answer: 1,
          why: "Fewer pixels changed nothing, so it isn't fill. Drawing alone is cheap, the loop alone is nearly all of it. Optimise the per-item JS. This three-switch test beats guessing every time.",
        },
        {
          t: "pitfall",
          h: "DPR 3 is nine times the pixels",
          x: "A full-screen canvas at `devicePixelRatio` 3 shades 9x the pixels of DPR 1, on a phone GPU that is usually weaker than your laptop's. Fill-bound scenes should cap DPR (`Math.min(devicePixelRatio, 2)`) or drop it while the camera moves.",
        },
      ],
    },
    {
      title: "The DOM ceiling and virtual lists",
      beats: [
        { t: "say", x: "Every element costs memory, style, layout and paint, and many changes relayout the whole list. 100,000 rows means 100,000 boxes on each pass. The fix is to keep only the rows on screen in the DOM: **windowing**, or a virtual list." },
        {
          t: "code",
          lang: "js",
          src: "// fixed row height h, a scroll container of height vh\nconst first = Math.max(0, Math.floor(scrollTop / h) - overscan);\nconst end = Math.min(n, Math.ceil((scrollTop + vh) / h) + overscan);\n\n// one tall spacer gives the scrollbar its true length\nspacer.style.height = n * h + 'px';\n// rows first..end-1, each absolutely placed at i * h",
          mark: [2, 3, 6],
          note: "Overscan renders a few rows past each edge, so fast scrolling doesn't flash blank before the scroll event lands.",
        },
        {
          t: "predict",
          lang: "js",
          src: "const h = 30, vh = 600, overscan = 5, n = 1e6;\nconst scrollTop = 12345;\n// using the two lines above:\nconsole.log(end - first);",
          q: "How many rows are in the DOM?",
          options: ["20", "31", "30", "1,000,000"],
          answer: 1,
          why: "`first` = floor(411.5) - 5 = 406. `end` = ceil(12945 / 30) + 5 = 432 + 5 = 437. That's 31 rows, whatever n is. The DOM cost is now O(viewport), and n only lives in the spacer height.",
        },
        {
          t: "play",
          mode: "html",
          title: "100,000 rows, ~20 nodes",
          html: "<div id=\"vp\"><div id=\"spacer\"></div></div>\n<p id=\"out\"></p>",
          css: "body { margin: 12px; font: 13px system-ui; }\n#vp { height: 200px; overflow: auto; border: 1px solid #999; }\n#spacer { position: relative; overflow: hidden; }\n.row { position: absolute; top: 0; left: 0; right: 0; height: 24px; line-height: 24px; padding: 0 8px; font-family: monospace; }\n.odd { background: #f1ede6; }",
          js: raw`const N = 100000, H = 24, OVER = 4;
const vp = document.getElementById('vp');
const spacer = document.getElementById('spacer');
const out = document.getElementById('out');
spacer.style.height = N * H + 'px';
let first = -1, end = -1;

function render() {
  const top = vp.scrollTop, vh = vp.clientHeight;
  const a = Math.max(0, Math.floor(top / H) - OVER);
  const b = Math.min(N, Math.ceil((top + vh) / H) + OVER);
  if (a === first && b === end) return;   // same window: no DOM work
  first = a; end = b;
  const frag = document.createDocumentFragment();
  for (let i = a; i < b; i++) {
    const d = document.createElement('div');
    d.className = i % 2 ? 'row odd' : 'row';
    d.style.transform = 'translateY(' + i * H + 'px)';
    d.textContent = 'row ' + i;
    frag.append(d);
  }
  spacer.replaceChildren(frag);
  out.textContent = 'rows ' + a + '..' + (b - 1) + ', nodes in DOM: ' + spacer.childElementCount;
}
vp.addEventListener('scroll', render, { passive: true });
render();`,
          task: "Set N to 2000000 and drag the scrollbar to the very bottom. Is the last row 1,999,999? Then reuse a fixed pool of row nodes instead of creating new ones.",
        },
        {
          t: "pitfall",
          h: "Elements can't be 40 million pixels tall",
          x: "Engines store layout lengths as fixed-point integers, so heights silently clamp in the tens of millions of px, at a different limit per engine. 1M rows x 40 px gets clamped and the tail is unreachable. Cap the spacer and map scroll position to rows yourself.",
        },
        { t: "say", h: "Variable heights", x: "Unknown heights need an estimate per row, a prefix sum of heights for offsets, and a binary search to turn scrollTop into a row. When a row renders you measure it and fix its height, so the prefix sums need point updates: a Fenwick tree does both in O(log n)." },
        {
          t: "code",
          lang: "js",
          src: "// Fenwick tree over row heights (1-based), all filled with an estimate\nconst add = (i, d) => { for (; i <= n; i += i & -i) bit[i] += d; };\n\n// the first row whose bottom edge is below y: O(log n) descent\nfunction rowAt(y) {\n  let i = 0;\n  for (let step = topBit; step; step >>= 1) {\n    if (i + step <= n && bit[i + step] <= y) { i += step; y -= bit[i]; }\n  }\n  return i; // 0-based row index\n}\n\n// after measuring row r (0-based):\n//   add(r + 1, measured - height[r]); height[r] = measured;",
          mark: [2, 5],
          note: "`topBit` is the highest power of two <= n. Use a Float64Array: sums of a million heights in Float32 lose whole pixels.",
        },
        {
          t: "pitfall",
          h: "Measuring rows above you moves the page",
          x: "Scroll up into rows rendered with an estimate of 40 px, measure them at 90 px, and everything below shifts down 50 px per row: the content under the reader jumps. Sum the height corrections above the first visible row and add them to `scrollTop` in the same frame.",
        },
        {
          t: "pitfall",
          h: "Ctrl+F and screen readers can't see unrendered rows",
          x: "Rows that aren't in the DOM can't be found with find-in-page, tabbed to or read out. Set `aria-rowcount` and `aria-rowindex` so assistive tech knows the real size, add your own search, and for a few thousand rows try `content-visibility: auto` first.",
        },
      ],
    },
    {
      title: "Canvas: calls are the cost",
      beats: [
        { t: "say", x: "Canvas 2D has no tree, so 100,000 shapes cost no memory once drawn. The cost moves to calls: every `fillRect` and `fillStyle` crosses into the engine and queues work. At this scale the fastest call is the one you skip by writing pixels yourself." },
        {
          t: "play",
          mode: "html",
          title: "100,000 particles, four ways",
          html: "<canvas></canvas><p id=\"out\"></p>",
          css: "body { margin: 0; font: 12px system-ui; }\ncanvas { display: block; width: 100%; height: 220px; background: #111; }\n#out { margin: 6px 10px; }",
          js: raw`const N = 100000;
const MODE = 'pixels'; // 'pixels' | 'rects' | 'styles' | 'unique'
const cv = document.querySelector('canvas'), out = document.getElementById('out');
const W = cv.width = cv.clientWidth, H = cv.height = cv.clientHeight;
const ctx = cv.getContext('2d');
const COLS = ['#ff9d45', '#4cc2ff', '#f2f2f2', '#9cf29c'];
const RGBA = [0xff459dff, 0xffffc24c, 0xfff2f2f2, 0xff9cf29c]; // ABGR: little-endian bytes
const HSL = Array.from({ length: N }, (_, i) => 'hsl(' + (i % 360) + ',80%,60%)');
const x = new Float32Array(N), y = new Float32Array(N);
const vx = new Float32Array(N), vy = new Float32Array(N);
for (let i = 0; i < N; i++) {
  x[i] = Math.random() * W; y[i] = Math.random() * H;
  const a = Math.random() * 6.283; vx[i] = Math.cos(a) * 30; vy[i] = Math.sin(a) * 30;
}
const img = ctx.createImageData(W, H), px = new Uint32Array(img.data.buffer);
let last = performance.now(), js = 0, gap = 16;

function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  gap += (now - last - gap) * 0.05; last = now;
  const t0 = performance.now();
  for (let i = 0; i < N; i++) {
    x[i] += vx[i] * dt; y[i] += vy[i] * dt;
    if (x[i] < 0 || x[i] >= W) { vx[i] = -vx[i]; x[i] = Math.min(Math.max(x[i], 0), W - 1); }
    if (y[i] < 0 || y[i] >= H) { vy[i] = -vy[i]; y[i] = Math.min(Math.max(y[i], 0), H - 1); }
  }
  if (MODE === 'pixels') {
    px.fill(0xff111111);
    for (let i = 0; i < N; i++) px[(y[i] | 0) * W + (x[i] | 0)] = RGBA[i & 3];
    ctx.putImageData(img, 0, 0);
  } else {
    ctx.fillStyle = '#111'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = COLS[0];
    for (let i = 0; i < N; i++) {
      if (MODE === 'styles') ctx.fillStyle = COLS[i & 3];
      if (MODE === 'unique') ctx.fillStyle = HSL[i];
      ctx.fillRect(x[i] | 0, y[i] | 0, 1, 1);
    }
  }
  js += (performance.now() - t0 - js) * 0.05;
  out.textContent = MODE + ': ' + js.toFixed(1) + ' ms of JS, ' + gap.toFixed(1) + ' ms between frames';
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);`,
          task: "Try each MODE and compare both numbers. Then set N to 1000000 in 'pixels' mode. Which modes care how many colours there are, and which doesn't?",
        },
        {
          t: "predict",
          lang: "js",
          src: "// 100,000 1x1 dots, one colour, same pixels on screen\n// A: 100,000 fillRect calls\n// B: beginPath, 100,000 rect() calls, one fill()\n// C: write into a Uint32Array over ImageData, one putImageData",
          q: "Timed with the canvas flushed (see the next beat), which is fastest?",
          options: ["A", "B: one fill call is the batch", "C, by an order of magnitude or more", "All the same: the GPU does the work"],
          answer: 2,
          why: "C is a tight loop over a typed array and one copy. In one Chrome run, A took about 28 ms, B about 55 ms (cheap JS, then a slow raster of a 100k-subpath path), C under 1 ms. Measure on your target; the ranking is what holds.",
        },
        {
          t: "code",
          lang: "js",
          src: "// canvas calls queue work; the raster can run later, outside your timer\nfunction timeDraw(ctx, draw) {\n  const t0 = performance.now();\n  draw();\n  const queued = performance.now() - t0;\n  ctx.getImageData(0, 0, 1, 1);   // reading a pixel forces the queue to finish\n  return { queued, total: performance.now() - t0 };\n}",
          mark: [6],
          note: "Use this only in benchmarks: a readback every frame stalls the pipeline. A GPU-backed canvas may also turn a later `getImageData` slow; `willReadFrequently: true` asks for a CPU-backed one.",
        },
        {
          t: "pitfall",
          h: "Unique colour strings cost more than you think",
          x: "Every new `fillStyle` string has to be parsed as a CSS colour. Building `'hsl(' + h + ',80%,60%)'` per item took about 2.3x the JS time of one colour in our run. Quantise colours into a small palette and group draws by it, or write pixels.",
        },
      ],
    },
    {
      title: "WebGL instancing",
      beats: [
        { t: "say", x: "Each WebGL draw call is validated by the browser, translated and handed to the driver, so 100,000 calls is a CPU problem. WebGL from zero introduced **instancing**; here it is the scale tool: one mesh, N copies, one call." },
        {
          t: "code",
          lang: "js",
          src: "// per vertex: the 4 corners of one quad, shared by every instance\nbind(cornerBuf); gl.vertexAttribPointer(cornerLoc, 2, gl.FLOAT, false, 0, 0);\ngl.vertexAttribDivisor(cornerLoc, 0);   // advance every vertex\n\n// per instance: one position and one RGBA8 colour per copy\nbind(posBuf); gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);\ngl.vertexAttribDivisor(posLoc, 1);      // advance once per instance\nbind(colBuf); gl.vertexAttribPointer(colLoc, 4, gl.UNSIGNED_BYTE, true, 0, 0);\ngl.vertexAttribDivisor(colLoc, 1);\n\ngl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, N);  // one call, N quads",
          mark: [3, 7, 11],
          note: "WebGL2 has this in core. In WebGL1 it's the `ANGLE_instanced_arrays` extension, with the same idea and longer names.",
        },
        {
          t: "predict",
          lang: "js",
          src: "// same setup, but this line is missing:\n// gl.vertexAttribDivisor(posLoc, 1);\ngl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, N);",
          q: "What do you see?",
          options: ["N quads, as before", "Nothing at all", "One distorted quad spanning the first four positions, drawn N times on top of itself", "A WebGL error and a black canvas"],
          answer: 2,
          why: "With divisor 0, `pos` advances per vertex, so corner k of every instance reads pos[k]. All N instances are identical, stacked in one place. No error: it's valid, just not what you meant.",
        },
        {
          t: "play",
          mode: "html",
          title: "200,000 instances, one draw call",
          html: "<canvas></canvas><p id=\"out\"></p>",
          css: "body { margin: 0; font: 12px system-ui; }\ncanvas { display: block; width: 100%; height: 230px; background: #111; }\n#out { margin: 6px 10px; }",
          js: raw`const N = 200000, SIZE = 1; // SIZE: half-width of each quad in CSS px
const cv = document.querySelector('canvas'), out = document.getElementById('out');
const dpr = Math.min(devicePixelRatio, 2);
cv.width = cv.clientWidth * dpr; cv.height = cv.clientHeight * dpr;
const gl = cv.getContext('webgl2', { antialias: false });
if (!gl) throw new Error('WebGL2 is not available here');

const vs = ['#version 300 es',
  'in vec2 corner; in vec2 pos; in vec4 col;',
  'uniform float t; uniform vec2 px; uniform float asp;',
  'out vec4 vCol;',
  'void main() {',
  '  float ph = 0.37 * float(gl_InstanceID);       // a free per-instance id',
  '  vec2 p = pos + 0.025 * vec2(sin(t * 1.3 + pos.y * 9.0 + ph), cos(t * 1.1 + pos.x * 7.0));',
  '  gl_Position = vec4(p * vec2(asp, 1.0) + corner * px, 0.0, 1.0);',
  '  vCol = col;',
  '}'].join('\n');
const fs = '#version 300 es\nprecision mediump float;\nin vec4 vCol; out vec4 o;\nvoid main() { o = vCol; }';
function sh(type, src) {
  const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}
const prog = gl.createProgram();
gl.attachShader(prog, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, fs));
gl.linkProgram(prog); gl.useProgram(prog);

function attr(name, data, size, type, norm, divisor) {
  const loc = gl.getAttribLocation(prog, name);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); // uploaded once, never again
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, size, type, norm, 0, 0);
  gl.vertexAttribDivisor(loc, divisor);
}
const pos = new Float32Array(N * 2), col = new Uint8Array(N * 4);
for (let i = 0; i < N; i++) {
  const x = 1.9 * Math.random() - 0.95, y = 1.9 * Math.random() - 0.95;   // a field of points
  pos[2 * i] = x; pos[2 * i + 1] = y;
  col.set([90 + 150 * (x + 1) / 2, 140 + 80 * (y + 1) / 2, 230 - 120 * (x + 1) / 2, 255], 4 * i);
}
attr('corner', new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), 2, gl.FLOAT, false, 0);
attr('pos', pos, 2, gl.FLOAT, false, 1);
attr('col', col, 4, gl.UNSIGNED_BYTE, true, 1);
gl.uniform2f(gl.getUniformLocation(prog, 'px'), 2 * SIZE * dpr / cv.width, 2 * SIZE * dpr / cv.height);
gl.uniform1f(gl.getUniformLocation(prog, 'asp'), cv.height / cv.width);
const uT = gl.getUniformLocation(prog, 't');
gl.viewport(0, 0, cv.width, cv.height);
gl.clearColor(0.07, 0.07, 0.07, 1);

let last = performance.now(), avg = 16;
function frame(now) {
  avg += (now - last - avg) * 0.05; last = now;
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.uniform1f(uT, (now / 1000) % 1000);
  gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, N);
  out.textContent = N.toLocaleString() + ' instances, 1 draw call, ' + avg.toFixed(1) + ' ms between frames';
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);`,
          task: "Raise N to 1000000, then 4000000: where does the frame time start to climb? Put N back and set SIZE to 30. Same count, far more pixels: that's fill rate, not instance count.",
        },
        {
          t: "table",
          head: ["Per-item data lives in", "Varies per", "Good for"],
          rows: [
            ["vertex attribute, divisor 0", "vertex", "the shape: corners, normals, UVs"],
            ["instance attribute, divisor 1", "instance", "position, colour, size, rotation"],
            ["uniform", "draw call", "time, camera, hovered id, global style"],
            ["data texture + `texelFetch`", "anything you index", "state that is large, shared or updated in patches"],
          ],
        },
        {
          t: "pitfall",
          h: "gl.POINTS look free until they don't",
          x: "`gl_PointSize` is capped by `ALIASED_POINT_SIZE_RANGE`, which the spec lets be as small as 1, and a point whose centre leaves the clip volume may be dropped whole, so big points pop at the screen edge. Instanced quads have neither problem.",
        },
        {
          t: "quiz",
          q: "Per-instance colour as 4 floats vs 4 `UNSIGNED_BYTE`s with `normalized: true`. For 1M instances, what changes?",
          options: ["Nothing; the shader sees floats either way and so does memory", "16 MB becomes 4 MB, and the shader still gets 0..1 floats", "Bytes are faster to draw but the colours are wrong", "Normalized bytes need WebGL2"],
          answer: 1,
          why: "The vertex fetch converts 0..255 to 0..1 for free. Pick the smallest type that holds the data: bytes for colours, `HALF_FLOAT` or `SHORT` for sizes and angles. Every byte saved is a byte you never upload.",
        },
      ],
    },
    {
      title: "Typed arrays and memory layout",
      beats: [
        { t: "say", x: "An array of `{ x, y, vx, vy }` objects is an array of pointers to objects, each with a header, often holding pointers to boxed doubles. The same data as four `Float32Array`s is 16 bytes per item, contiguous, and already in the format the GPU wants." },
        {
          t: "play",
          mode: "js",
          title: "objects vs structure of arrays",
          js: raw`const N = 1000000;
const objs = [];
for (let i = 0; i < N; i++) objs.push({ x: Math.random(), y: Math.random(), vx: 0.001, vy: 0.002 });

const x = new Float32Array(N), y = new Float32Array(N);
const vx = new Float32Array(N).fill(0.001), vy = new Float32Array(N).fill(0.002);

let t = performance.now();
for (let k = 0; k < 10; k++)
  for (let i = 0; i < N; i++) { const o = objs[i]; o.x += o.vx; o.y += o.vy; }
console.log('objects, 10 passes:', (performance.now() - t).toFixed(1), 'ms');

t = performance.now();
for (let k = 0; k < 10; k++)
  for (let i = 0; i < N; i++) { x[i] += vx[i]; y[i] += vy[i]; }
console.log('typed SoA, 10 passes:', (performance.now() - t).toFixed(1), 'ms');

// and the objects still need copying into a Float32Array before any upload
t = performance.now();
const flat = new Float32Array(N * 2);
for (let i = 0; i < N; i++) { flat[2 * i] = objs[i].x; flat[2 * i + 1] = objs[i].y; }
console.log('pack for GPU:', (performance.now() - t).toFixed(1), 'ms, every frame');`,
          task: "Run it twice and compare. Then measure memory in Node with `process.memoryUsage().heapUsed` before and after building `objs`. One 64-bit Node run measured over 100 bytes per object, against 16.",
        },
        {
          t: "predict",
          lang: "js",
          src: "// one interleaved buffer per instance:\n// x, y, z as FLOAT, then r, g, b, a as UNSIGNED_BYTE\ngl.vertexAttribPointer(colLoc, 4, gl.UNSIGNED_BYTE, true, STRIDE, OFFSET);",
          q: "What are STRIDE and OFFSET, in bytes?",
          options: ["7 and 3", "16 and 12", "28 and 12", "16 and 3"],
          answer: 1,
          why: "Both are bytes, not elements. Three floats are 12 bytes, so the colour starts at 12, and 4 more bytes make a 16-byte stride. Write the data through a `Float32Array` and a `Uint8Array` that view the same ArrayBuffer.",
        },
        {
          t: "pitfall",
          h: "Allocating per frame shows up as hitches, not slowness",
          x: "`new Float32Array(n)`, `[...arr]`, `map` and closures inside the frame loop make garbage, and the collector pauses at random frames. Average fps looks fine, the worst frame doesn't. Allocate at capacity once, grow by doubling, and reuse.",
        },
        {
          t: "code",
          lang: "js",
          src: "let cap = 1024, n = 0;\nlet x = new Float32Array(cap), y = new Float32Array(cap);\n\nfunction add(px, py) {\n  if (n === cap) {               // grow rarely: amortised O(1)\n    cap *= 2;\n    const nx = new Float32Array(cap); nx.set(x); x = nx;\n    const ny = new Float32Array(cap); ny.set(y); y = ny;\n  }\n  x[n] = px; y[n] = py;\n  return n++;\n}\n\nfunction remove(i) {             // swap with last: O(1), order not kept\n  n--;\n  x[i] = x[n]; y[i] = y[n];\n  // ids moved: if anything holds index n, point it at i now\n}",
          mark: [5, 14, 17],
          note: "Swap-remove keeps the arrays dense so the GPU draws `n` instances with no holes. The price is that indices move: keep an id-to-index map if outsiders hold ids.",
        },
      ],
    },
    {
      title: "Upload only what changed",
      beats: [
        { t: "say", x: "`bufferData` with 200,000 positions every frame copies the whole array to the GPU process each frame. If 50 items moved, `bufferSubData` on just those bytes does the same job. WebGL2's overload takes a source offset and length, so no `subarray`." },
        {
          t: "code",
          lang: "js",
          src: "// dirty tracking in pages of 1024 items, not one min..max range\nconst PAGE = 1024;\nconst dirty = new Uint8Array(Math.ceil(cap / PAGE));\n\nfunction setPos(i, px, py) { pos[2 * i] = px; pos[2 * i + 1] = py; dirty[i >> 10] = 1; }\n\nfunction flush() {\n  gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);\n  for (let p = 0; p < dirty.length; p++) {\n    if (!dirty[p]) continue;\n    let q = p; while (q + 1 < dirty.length && dirty[q + 1]) q++;   // merge runs\n    const from = p * PAGE * 2, to = Math.min((q + 1) * PAGE, n) * 2;\n    gl.bufferSubData(gl.ARRAY_BUFFER, from * 4, pos, from, to - from);\n    dirty.fill(0, p, q + 1);\n    p = q;\n  }\n}",
          mark: [5, 11, 13],
          note: "Byte offset into the GPU buffer, then the source array, offset and length in elements. Pages bound the number of calls, and merging runs keeps neighbours as one copy.",
        },
        {
          t: "predict",
          lang: "js",
          src: "// 200,000 points, 2 floats each. Track one dirty range:\nlet lo = Infinity, hi = -1;\nconst touch = (i) => { lo = Math.min(lo, i); hi = Math.max(hi, i); };\ntouch(5); touch(199990);\n// upload points lo..hi with one bufferSubData",
          q: "How much does this frame upload?",
          options: ["16 bytes", "About 1.6 MB, nearly the whole buffer", "32 bytes", "Nothing: two points aren't worth it"],
          answer: 1,
          why: "Two changes at opposite ends make the range span everything: 199,986 points x 8 bytes. A single min/max range is fine for appends and local edits, and degenerates for scattered ones. That's why the code above uses pages.",
        },
        { t: "say", h: "Data textures", x: "Large per-item state can live in a texture instead: an RGBA32F texture holds 4 floats per texel, the vertex shader reads row `id / W`, column `id % W` with `texelFetch`, and `texSubImage2D` updates a rectangle of it. One texture can feed several draws." },
        {
          t: "code",
          lang: "glsl",
          src: "#version 300 es\nuniform highp sampler2D uState;   // W texels wide, RGBA32F\nuniform int uW;\nin vec2 corner;\n\nvoid main() {\n  int id = gl_InstanceID;\n  vec4 s = texelFetch(uState, ivec2(id % uW, id / uW), 0);  // x, y, size, hue\n  gl_Position = vec4(s.xy + corner * s.z, 0.0, 1.0);\n}",
          mark: [8],
          note: "No instance attributes at all: the id indexes the texture. WebGL2 guarantees textures of at least 2048 x 2048, so 4M items fit in one; check `MAX_TEXTURE_SIZE` before going wider.",
        },
        {
          t: "pitfall",
          h: "A float texture that reads (0, 0, 0, 1)",
          x: "The default `TEXTURE_MIN_FILTER` uses mipmaps. Without them the texture is incomplete, and every fetch returns (0, 0, 0, 1) with at most a console warning. Data textures want `NEAREST` for both filters; float `LINEAR` also needs `OES_texture_float_linear`.",
        },
      ],
    },
    {
      title: "Picking, culling and level of detail",
      beats: [
        { t: "say", x: "Hover over one of 200,000 points. Looping over all of them per mouse move is O(n) and often fine once. **GPU picking** draws the scene again into an offscreen framebuffer with each item's id as its colour, then reads the one pixel under the cursor." },
        {
          t: "code",
          lang: "js",
          src: "// in the pick shader: id + 1, so 0 means \"nothing here\"\n//   uint v = uint(gl_InstanceID) + 1u;\n//   o = vec4(float(v & 255u), float((v >> 8) & 255u), float((v >> 16) & 255u), 255.0) / 255.0;\n\ngl.bindFramebuffer(gl.FRAMEBUFFER, pickFbo);   // RGBA8, no MSAA\ngl.disable(gl.BLEND);\ngl.disable(gl.DITHER);\ndrawPickPass();\nconst px = new Uint8Array(4);\ngl.readPixels(mx, fbHeight - my - 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);\nconst id = (px[0] | (px[1] << 8) | (px[2] << 16)) - 1;   // -1: background",
          mark: [6, 7, 10],
          note: "WebGL's y runs up from the bottom; the mouse's runs down. 24 bits gives 16.7M ids. Allocate `px` once, not per move.",
        },
        {
          t: "pitfall",
          h: "Picking ids that come back as neighbours",
          x: "Blending, MSAA, dithering (on by default) or a filtered texture turn id 41,983 into a blend of two ids, so you hover the wrong point or one that doesn't exist. Pick into your own non-multisampled RGBA8 target with BLEND and DITHER off, and validate the id.",
        },
        {
          t: "pitfall",
          h: "readPixels waits for the GPU",
          x: "`readPixels` into an array is synchronous: the CPU waits for every queued draw to finish. Do it on pointer move, never every frame. In WebGL2 you can read into a `PIXEL_PACK_BUFFER`, place a `fenceSync`, and fetch the data a frame later.",
        },
        { t: "say", h: "Or a spatial grid on the CPU", x: "Bucket the points into fixed cells with a counting sort: one pass counts per cell, a prefix sum gives each cell's start, a second pass fills one flat index array. A hover then checks a 3x3 block of cells, not n points." },
        {
          t: "play",
          mode: "html",
          title: "100,000 points, hover in microseconds",
          html: "<div id=\"wrap\"><canvas id=\"pts\"></canvas><canvas id=\"hl\"></canvas></div><p id=\"out\">move over the points</p>",
          css: "body { margin: 0; font: 12px system-ui; }\n#wrap { position: relative; height: 230px; }\ncanvas { position: absolute; inset: 0; width: 100%; height: 100%; }\n#pts { background: #111; }\n#out { margin: 6px 10px; }",
          js: raw`const N = 100000, CELL = 16, R = 10;
const cv = document.getElementById('pts'), hl = document.getElementById('hl');
const out = document.getElementById('out');
const W = cv.width = hl.width = cv.clientWidth, H = cv.height = hl.height = cv.clientHeight;
const x = new Float32Array(N), y = new Float32Array(N);
for (let i = 0; i < N; i++) {          // five clusters: real data is never uniform
  const c = i % 5, g = () => Math.random() + Math.random() + Math.random() - 1.5;
  x[i] = Math.min(W - 1, Math.max(0, W * (0.14 + 0.18 * c) + g() * W * 0.05));
  y[i] = Math.min(H - 1, Math.max(0, H * (0.35 + 0.15 * (c % 3)) + g() * H * 0.12));
}
const ctx = cv.getContext('2d'), img = ctx.createImageData(W, H), px = new Uint32Array(img.data.buffer);
px.fill(0xff111111);
for (let i = 0; i < N; i++) px[(y[i] | 0) * W + (x[i] | 0)] = 0xff459dff;
ctx.putImageData(img, 0, 0);

// grid as CSR: start[c]..start[c+1] are the slots of cell c in items
const GW = Math.ceil(W / CELL), GH = Math.ceil(H / CELL);
const start = new Uint32Array(GW * GH + 1), items = new Uint32Array(N);
const cellOf = (i) => ((y[i] / CELL) | 0) * GW + ((x[i] / CELL) | 0);
for (let i = 0; i < N; i++) start[cellOf(i) + 1]++;
for (let c = 0; c < GW * GH; c++) start[c + 1] += start[c];
const cursor = start.slice(0, -1);
for (let i = 0; i < N; i++) items[cursor[cellOf(i)]++] = i;

function nearest(qx, qy) {
  let best = -1, bd = R * R, seen = 0;
  const x0 = Math.max(0, ((qx - R) / CELL) | 0), x1 = Math.min(GW - 1, ((qx + R) / CELL) | 0);
  const y0 = Math.max(0, ((qy - R) / CELL) | 0), y1 = Math.min(GH - 1, ((qy + R) / CELL) | 0);
  for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
    const c = cy * GW + cx;
    for (let k = start[c]; k < start[c + 1]; k++) {
      const i = items[k], dx = x[i] - qx, dy = y[i] - qy, d = dx * dx + dy * dy;
      seen++;
      if (d < bd) { bd = d; best = i; }
    }
  }
  return [best, seen];
}
const g2 = hl.getContext('2d');
hl.addEventListener('pointermove', (e) => {
  const t0 = performance.now();
  for (let k = 0; k < 99; k++) nearest(e.offsetX, e.offsetY); // timers are coarse:
  const [i, seen] = nearest(e.offsetX, e.offsetY);            // time 100, divide
  const us = ((performance.now() - t0) * 10).toFixed(1);
  g2.clearRect(0, 0, W, H);
  if (i < 0) return (out.textContent = 'nothing within ' + R + ' px, checked ' + seen);
  g2.strokeStyle = '#fff'; g2.beginPath(); g2.arc(x[i], y[i], 6, 0, 6.283); g2.stroke();
  out.textContent = 'point ' + i + ': checked ' + seen + ' of ' + N + ' in ~' + us + ' us each';
});`,
          task: "Hover a dense cluster, then an empty area, and compare 'checked'. Set CELL to 4, then 128. Too small and you visit many empty cells, too big and each cell holds thousands. Aim near the query radius.",
        },
        {
          t: "quiz",
          q: "A uniform grid on very clustered data (cities on a world map) is slow at the dense spots. Best next step?",
          options: ["A smaller cell everywhere", "A quadtree, or a grid per dense cell, so cell size follows density", "Sort the points by x and binary search", "Give up and use GPU picking for everything"],
          answer: 1,
          why: "A uniform grid has one cell size, so either the dense cells are crowded or the sparse map is mostly empty cells. A quadtree splits only where points pile up. For hover alone, GPU picking is also fine: its cost doesn't depend on density.",
        },
        { t: "say", h: "Culling", x: "Skip what can't be seen. Testing each of a million items on the CPU can cost more than just drawing them, so cull **chunks**: group items spatially, keep a bounding box per chunk, and test a few hundred boxes against the camera frustum or viewport." },
        {
          t: "predict",
          lang: "text",
          src: "1,000,000 points\ncanvas: 1000 x 500 CSS px at DPR 1 = 500,000 pixels\nzoomed all the way out",
          q: "What is the honest thing to draw?",
          options: ["All million, each 1 px", "A density aggregate: count points per pixel or cell, draw the counts as colour", "A random 10% sample", "Only the first 500,000"],
          answer: 1,
          why: "There are twice as many points as pixels, so a 1 px draw overwrites and hides how many landed where. Bin into a count grid and map counts to colour: real information, fixed cost. Switch to real points as the user zooms in.",
        },
        { t: "say", h: "Level of detail", x: "LOD is the same trade at every scale: fewer vertices for far meshes, clusters or heatmaps when zoomed out, real items close up. Precompute the levels once, pick one per chunk per frame from its screen size, and the per-frame work tracks pixels, not n." },
      ],
    },
    {
      title: "Precision, workers and measuring",
      beats: [
        {
          t: "play",
          mode: "js",
          title: "float32 runs out of digits",
          js: raw`const f = Math.fround;           // round a double to float32
console.log(f(16777217));         // 2^24 + 1: the first integer float32 can't hold

// a point 0.37 m away from a coordinate in metres, Earth-sized
const origin = 6378137;           // the Earth's equatorial radius in metres
const p = origin + 0.37;
console.log('as float32:', f(p) - origin);       // what the GPU sees

// recentre on the CPU in float64 first, then convert
const camera = 6378137;
console.log('relative:', f(p - camera));`,
          task: "Try origin = 20037508 (the edge of Web Mercator in metres) and find the float32 step there. Then move the camera 100 km away and check the relative error.",
        },
        {
          t: "pitfall",
          h: "Things jitter when you zoom in far",
          x: "float32 has 24 bits of mantissa: near 6.4 million the step is 0.5, so geometry snaps to half-metre steps and shakes as the camera moves. Keep world positions in float64 on the CPU, subtract the camera position there, and upload small offsets.",
        },
        {
          t: "code",
          lang: "js",
          src: "// main thread: hand a buffer to a worker without copying it\nconst pos = new Float32Array(1_000_000 * 2);\nworker.postMessage({ pos }, [pos.buffer]);   // transfer list\n\n// worker.js: simulate, then hand it back\nonmessage = ({ data: { pos } }) => {\n  step(pos);\n  postMessage({ pos }, [pos.buffer]);\n};",
          mark: [3, 8],
          note: "Transfer moves ownership in O(1). Without the list, `postMessage` copies all 8 MB. To move a whole renderer off the main thread, `canvas.transferControlToOffscreen()` hands the canvas to a worker too.",
        },
        {
          t: "predict",
          lang: "js",
          src: "const pos = new Float32Array(4);\nworker.postMessage(pos, [pos.buffer]);\nconsole.log(pos.length, pos.buffer.byteLength);",
          q: "What prints?",
          options: ["4 16", "0 0", "4 0", "It throws"],
          answer: 1,
          why: "Transferring detaches the buffer on the sender's side: length and byteLength drop to 0, and reads return undefined. Code that keeps drawing from `pos` after posting it draws nothing. Ping-pong two buffers: render one while the worker fills the other.",
        },
        { t: "say", h: "SharedArrayBuffer", x: "With a `SharedArrayBuffer`, main thread and workers see the same memory, with `Atomics` for coordination. It only exists when the page is **cross-origin isolated**: `crossOriginIsolated` must be true, which takes two response headers on the document." },
        {
          t: "code",
          lang: "text",
          src: "Cross-Origin-Opener-Policy: same-origin\nCross-Origin-Embedder-Policy: require-corp\n\n# in JS:\n#   if (crossOriginIsolated) { const sab = new SharedArrayBuffer(bytes); }\n#   else { fall back to transferring buffers }",
          note: "COEP `require-corp` blocks cross-origin images, scripts and iframes that don't opt in with CORS or `Cross-Origin-Resource-Policy`. `credentialless` is the softer variant where browsers support it.",
        },
        {
          t: "pitfall",
          h: "Isolation breaks your embeds and popups",
          x: "Turn on COOP and COEP and third-party ads, analytics pixels, video embeds and OAuth popups can stop working, often only in production. Isolate only the page that needs shared memory, and ship the transfer fallback anyway.",
        },
        {
          t: "steps",
          h: "Finding the bottleneck, by experiment",
          items: [
            "Measure frame time over many frames on the target device, and keep the worst frames, not only the average.",
            "Shrink the canvas resolution, same scene. Much faster: fill-bound.",
            "Same pixels, a tenth of the items. Much faster: per-item cost, on the CPU or in vertex work.",
            "Skip the draw calls, keep the JS. Still slow: your JS. Profile it in the Performance panel.",
            "Fix the one thing you found, measure again, and stop when the worst frame fits the budget.",
          ],
        },
        {
          t: "pitfall",
          h: "performance.now() can't see the GPU",
          x: "WebGL calls queue commands and return, so timing them in JS measures the queueing. The GPU work shows up later, as a long gap between frames. Watch rAF intervals, use `EXT_disjoint_timer_query_webgl2` where it exists, or the GPU track in the Performance panel.",
        },
        {
          t: "quiz",
          q: "Halving the canvas resolution took frame time from 30 ms to 12 ms. Cutting the item count by 10x barely moved it. Next fix?",
          options: ["Move the simulation to a worker", "Smaller or fewer overlapping sprites, cheaper fragment shader, lower DPR", "Instancing", "Typed arrays"],
          answer: 1,
          why: "Time follows pixels, not items: you're fill-bound, likely from overdraw or a heavy fragment shader. Workers, instancing and typed arrays all attack per-item costs, which this test just showed aren't the problem.",
        },
        {
          t: "rebuild",
          h: "A virtual scroller for 1,000,000 rows",
          x: "The starter is a working windowed list with 1,000,000 rows of 40 px: 40 million px, past every mainstream engine's height cap. Scroll to the bottom and the last rows are missing. Cap the spacer and map scroll position onto the real offset.",
          mode: "html",
          html: "<div id=\"vp\"><div id=\"spacer\"></div></div>\n<p id=\"out\"></p>",
          css: "body { margin: 12px; font: 13px system-ui; }\n#vp { height: 220px; overflow: auto; border: 1px solid #999; }\n#spacer { position: relative; overflow: hidden; }\n.row { position: absolute; top: 0; left: 0; right: 0; height: 40px; line-height: 40px; padding: 0 10px; font-family: monospace; }\n.odd { background: #f1ede6; }",
          js: raw`const N = 1000000, H = 40, OVER = 3;
const MAX = 8000000;   // a spacer height every engine handles
const vp = document.getElementById('vp');
const spacer = document.getElementById('spacer');
const out = document.getElementById('out');

spacer.style.height = N * H + 'px';   // TODO: Math.min(N * H, MAX)

function render() {
  const top = vp.scrollTop, vh = vp.clientHeight;
  // TODO: map top in 0..(spacer - vh) linearly onto virt in 0..(N * H - vh)
  const virt = top;
  const a = Math.max(0, Math.floor(virt / H) - OVER);
  const b = Math.min(N, Math.ceil((virt + vh) / H) + OVER);
  const frag = document.createDocumentFragment();
  for (let i = a; i < b; i++) {
    const d = document.createElement('div');
    d.className = i % 2 ? 'row odd' : 'row';
    // place relative to the real scroll position, so scaling never moves rows
    d.style.transform = 'translateY(' + (top + i * H - virt) + 'px)';
    d.textContent = 'row ' + i.toLocaleString();
    frag.append(d);
  }
  spacer.replaceChildren(frag);
  out.textContent = 'first visible: ' + Math.floor(virt / H).toLocaleString() + ' of ' + N.toLocaleString();
}
vp.addEventListener('scroll', render, { passive: true });
render();`,
          task: "Fix the two TODOs so the last row is reachable. Then add a 'go to row' input, reuse a pool of nodes instead of creating them, and keep the row under the cursor fixed when N grows.",
        },
        {
          t: "mission",
          h: "200,000 points with hover",
          x: "Combine the instancing play and the grid play: 200k instanced points in WebGL2, pan and zoom, and a hover highlight that never re-uploads a buffer. Use the CPU grid in data space and pass the hovered id as a uniform. Measure the worst frame while panning.",
          hint: "Invert your pan and zoom to get the mouse in data coordinates, query the grid there, and set `uHover`. In the vertex shader, compare it with `gl_InstanceID` to grow and recolour that one point.",
          solution: {
            lang: "glsl",
            src: "#version 300 es\nin vec2 corner; in vec2 pos; in vec4 col;\nuniform vec2 uPan; uniform float uZoom; uniform vec2 uPx;\nuniform int uHover;            // -1 when nothing is hovered\nout vec4 vCol;\n\nvoid main() {\n  bool hot = gl_InstanceID == uHover;\n  vec2 p = (pos - uPan) * uZoom;\n  // z -0.5 keeps it on top once gl.DEPTH_TEST is enabled\n  gl_Position = vec4(p + corner * uPx * (hot ? 4.0 : 1.0), hot ? -0.5 : 0.0, 1.0);\n  vCol = hot ? vec4(1.0) : col;\n}",
          },
        },
      ],
    },
  ],
  nobodyTells: [
    "Before optimising, run the three-switch test: fewer pixels, fewer items, no draw calls. Whichever moves the frame time is the only thing worth fixing.",
    "Track the worst frame, not the average. Users feel the 60 ms hitch from GC or an upload, never the mean.",
    "If you have more items than pixels, you're drawing noise. Aggregate first, and show the real items when zoomed in.",
    "Most smooth million-item demos upload nothing per frame: positions are static and the motion is computed in the vertex shader from time.",
    "Keep an id-to-index map from day one. Swap-remove, sorting and culling all move items, and hover and selection hold ids.",
    "Store world coordinates in float64 on the CPU and send float32 offsets from the camera. Retrofitting it later touches every shader.",
    "A virtual list can't be found with Ctrl+F. If people need to search it, give them a search box before they ask.",
    "Test on the weakest device you support from the first week. A laptop GPU hides fill-rate problems that a phone shows at once.",
  ],
  glossary: [
    ["windowing", "Rendering only the list rows inside the viewport plus a little overscan; also called virtualisation."],
    ["overscan", "Extra rows or items rendered just past the visible edge so fast scrolling doesn't show gaps."],
    ["draw call", "One `drawArrays` or `drawElements` style command; each costs CPU validation and driver work."],
    ["instancing", "Drawing one mesh many times in one draw call, with per-instance attributes."],
    ["attribute divisor", "How often an attribute advances: 0 per vertex, 1 per instance, k every k instances."],
    ["fill rate", "How many pixels the GPU can shade per second; overdraw spends it on pixels nobody sees."],
    ["overdraw", "Shading the same pixel more than once in a frame, from overlapping shapes."],
    ["SoA / AoS", "Structure of arrays (one array per field) vs array of structures (one record per item)."],
    ["data texture", "A texture used as a big array of numbers, read in shaders with `texelFetch`."],
    ["GPU picking", "Rendering item ids as colours offscreen and reading the pixel under the cursor."],
    ["spatial grid", "Points bucketed into fixed-size cells so a query only checks nearby cells."],
    ["LOD", "Level of detail: cheaper representations for things that are far away or tiny on screen."],
    ["transferable", "An object, like an ArrayBuffer, whose ownership `postMessage` can move to another thread without copying."],
    ["cross-origin isolation", "COOP plus COEP headers that unlock `SharedArrayBuffer` and precise timers."],
  ],
  explain: "Explain to a friend why a virtual list stays fast at a million rows, and what breaks if you just make the spacer a million rows tall.",
};
