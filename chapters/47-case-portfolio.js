const raw = String.raw;

/* Plays. Kept outside the object so the beats stay readable. */

const MORPH_JS = raw`// Trimmed from the portfolio's src/main.js: createMorph.
const STOPS = [
  '<p class="k">01  Transistor, about 50 nm</p><h2>Sudhanshu Shukla</h2><p>You are looking at one transistor.</p>',
  '<p class="k">02  Logic gates, about 1 um</p><h2>Hi, this is a demo</h2><p>Old strings pair with new ones in reading order.</p><p>Each one scrambles, then resolves left to right, while the panel eases to its new height.</p>',
  '<p class="k">03  CPU core, about 2 mm</p><h2>Short one</h2><p>And back up.</p>',
];
const GLYPHS = 'abcdefghijklmnopqrstuvwxyz0123456789';
const DUR = 900;

function textNodes(root) {
  const out = [];
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT,
    { acceptNode: (n) => (n.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT) });
  while (w.nextNode()) out.push(w.currentNode);
  return out;
}

function createMorph(el) {
  let raf = 0;
  return function morph(html) {
    cancelAnimationFrame(raf);
    const before = textNodes(el).map((n) => n.nodeValue);
    const h0 = el.offsetHeight;
    el.innerHTML = html;
    const nodes = textNodes(el);
    const after = nodes.map((n) => n.nodeValue);
    const h1 = el.offsetHeight;
    el.style.transition = 'none';
    el.style.height = h0 + 'px';
    el.getBoundingClientRect();                       // commit the old height
    el.style.transition = 'height ' + DUR * 0.7 + 'ms cubic-bezier(.3,.7,.2,1)';
    el.style.height = h1 + 'px';
    setTimeout(() => (el.style.height = ''), DUR * 0.72);
    const jobs = nodes.map((n, i) => ({ n, from: before[i] || '', to: after[i], delay: Math.min(0.35, i * 0.018) }));
    const t0 = performance.now();
    function tick(now) {
      const p = Math.min(1, (now - t0) / DUR);
      for (const j of jobs) {
        const k = Math.max(0, Math.min(1, (p - j.delay) / (1 - j.delay)));
        if (k >= 1) { j.n.nodeValue = j.to; continue; }
        const len = Math.round(j.from.length + (j.to.length - j.from.length) * Math.min(1, k * 1.6));
        const done = Math.floor(j.to.length * k * k);  // resolved prefix, slow then fast
        let s = '';
        for (let c = 0; c < len; c++) {
          const target = j.to[c] ?? '';
          if (c < done) s += target;
          else if (target === ' ' || (!target && j.from[c] === ' ')) s += ' ';
          else if (c > done + 22 && j.from[c]) s += j.from[c];
          else s += GLYPHS[(Math.random() * GLYPHS.length) | 0];
        }
        j.n.nodeValue = s;
      }
      if (p < 1) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
  };
}

const morph = createMorph(document.getElementById('panel'));
let i = 0;
morph(STOPS[0]);
document.getElementById('go').onclick = () => morph(STOPS[(i = (i + 1) % STOPS.length)]);`;

const WHEEL_JS = raw`// The portfolio's wheel rule (src/main.js): one gesture, one stop.
const QUIET = 160;   // ms of silence that ends a gesture
const THRESH = 24;   // px of accumulated delta before a step fires
const N = 14;
let stop = 0, acc = 0, lastWheel = 0, armed = true, events = 0, steps = 0;

const bar = document.getElementById('bar');
const out = document.getElementById('out');
for (let i = 0; i < N; i++) bar.appendChild(document.createElement('i'));
function render() {
  [...bar.children].forEach((c, i) => c.classList.toggle('on', i === stop));
  out.textContent = 'wheel events: ' + events + '   steps taken: ' + steps + '   stop ' + (stop + 1) + ' / ' + N;
}

addEventListener('wheel', (e) => {
  e.preventDefault();
  events++;
  const now = performance.now();
  if (now - lastWheel > QUIET) { armed = true; acc = 0; }   // a new gesture
  lastWheel = now;
  if (armed) {
    acc += e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY;     // lines to pixels
    if (Math.abs(acc) > THRESH) {
      const next = stop + Math.sign(acc);
      if (next >= 0 && next < N) { stop = next; steps++; }
      armed = false;                                          // the rest of this flick is ignored
    }
  }
  render();
}, { passive: false });
render();`;

const LOG_JS = raw`// Zooming out from a view 1 unit wide to one 1,000,000 wide in 1 second.
const dA = 1, dB = 1e6;
const lin = (f) => dA + (dB - dA) * f;
const log = (f) => Math.exp(Math.log(dA) + (Math.log(dB) - Math.log(dA)) * f);

function whenCrossing(fn, d) {           // time (0-1) at which the view reaches width d
  let lo = 0, hi = 1;
  for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; if (fn(m) < d) lo = m; else hi = m; }
  return lo;
}
console.log('width     linear    log');
for (let d = 10; d <= 1e6; d *= 10)
  console.log(String(d).padEnd(9), whenCrossing(lin, d).toFixed(5).padEnd(9), whenCrossing(log, d).toFixed(3));

// The portfolio's scale readout (src/main.js) uses the same idea on a table.
const WIDTHS = [6e-8, 2e-6, 3e-3, 2.5e-2, 3.2e-1, 6e-1, 1.2e2, 3e4, 2.6e7];
function logAt(table, z) {
  const i = Math.max(0, Math.min(table.length - 2, Math.floor(z)));
  const k = Math.max(0, Math.min(1, z - i));
  return Math.exp(Math.log(table[i]) + (Math.log(table[i + 1]) - Math.log(table[i])) * k);
}
for (const z of [0, 0.5, 1, 4.5, 8]) console.log('z', z, 'view is', logAt(WIDTHS, z).toExponential(2), 'm wide');`;

const LOOP_JS = raw`// The engine's pause() from src/zoom/engine.js, trimmed. A hidden tab never
// runs the frame that was already queued, so hide + show is the same as
// calling pause(true) then pause(false) before that frame fires.
function createLoop() {
  let running = true, calls = 0;
  function loop() {
    if (!running) return;
    calls++;                       // in the real engine: frame(dt) and a full render
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  return {
    pause(p) {
      running = !p;
      if (running) requestAnimationFrame(loop);
    },
    get calls() { return calls; },
  };
}

const L = createLoop();
const frames = (n) => new Promise((done) => {
  let k = 0;
  (function f() { if (++k > n) done(); else requestAnimationFrame(f); })();
});

async function measure(label) {
  const c0 = L.calls;
  await frames(30);
  console.log(label.padEnd(22), ((L.calls - c0) / 30).toFixed(2), 'loop calls per frame');
}

(async () => {
  await measure('fresh');
  L.pause(true); L.pause(false);
  await measure('after 1 hide/show');
  L.pause(true); L.pause(false);
  await measure('after 2 hide/shows');
})();`;

const PLANET_GLSL = raw`// The portfolio's planet shader (src/zoom/layers/world.js), flattened onto
// a 2D disc. Move the mouse to move the sun.
float h(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float n3(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h(i), h(i + vec3(1.0, 0.0, 0.0)), f.x), mix(h(i + vec3(0.0, 1.0, 0.0)), h(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
             mix(mix(h(i + vec3(0.0, 0.0, 1.0)), h(i + vec3(1.0, 0.0, 1.0)), f.x), mix(h(i + vec3(0.0, 1.0, 1.0)), h(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
}
float fbm3(vec3 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * n3(p); p *= 2.03; a *= 0.5; } return s; }

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / min(uRes.x, uRes.y) * 2.4;
  float r = length(uv);
  vec3 col = vec3(0.004, 0.006, 0.01);
  if (r < 1.0) {
    vec3 n0 = vec3(uv, sqrt(1.0 - r * r));                   // sphere normal, no mesh needed
    float a = uTime * 0.12;
    vec3 n = vec3(cos(a) * n0.x + sin(a) * n0.z, n0.y, -sin(a) * n0.x + cos(a) * n0.z);
    float land = fbm3(n * 2.2 + 3.1);
    float isLand = smoothstep(0.52, 0.535, land);             // a 0.015-wide coastline
    vec3 ocean = mix(vec3(0.02, 0.11, 0.24), vec3(0.05, 0.22, 0.36), smoothstep(0.35, 0.52, land));
    vec3 ground = mix(vec3(0.16, 0.26, 0.12), vec3(0.45, 0.38, 0.24), smoothstep(0.56, 0.7, land));
    vec3 sun = normalize(vec3((uMouse.x - 0.5) * 4.0 + 1.2, (uMouse.y - 0.5) * 4.0 + 0.4, 0.5));
    float lit = smoothstep(-0.15, 0.3, dot(n0, sun));
    col = mix(ocean, ground, isLand) * (0.15 + 0.95 * lit);
    float city = step(0.78, n3(n * 60.0)) * step(0.6, n3(n * 7.0)) * isLand;
    col += vec3(1.0, 0.75, 0.4) * city * (1.0 - lit) * 0.55; // lights only on the night side
    float cl = smoothstep(0.55, 0.75, fbm3(n * 4.0 + vec3(uTime * 0.03, 0.0, 0.0)));
    col = mix(col, vec3(0.2 + 0.9 * lit), cl * 0.55);
  }
  float rim = smoothstep(1.1, 1.0, r) * smoothstep(0.96, 1.0, r);
  col += vec3(0.3, 0.55, 1.0) * rim * 0.5;
  gl_FragColor = vec4(pow(col, vec3(1.0 / 2.2)), 1.0);
}`;

const REBUILD_JS = raw`import * as THREE from "three";

// Four layers, each sitting in a copper socket of the next at 1/16 scale.
const N = 4, S = 1 / 16;
const SLOT = new THREE.Vector3(3, 0.05, 2);
const COLORS = [0x5d6f8c, 0x3a4f7a, 0x14271f, 0x2b3547];

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.25));
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05070b);
const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 1000);
scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x1a1410, 1.2));
const sun = new THREE.DirectionalLight(0xfff2e0, 2);
sun.position.set(3, 5, 2);
scene.add(sun);

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function makeLayer(i) {
  const g = new THREE.Group(), rand = rng(7 + i);
  const plate = new THREE.Mesh(new THREE.BoxGeometry(20, 0.5, 14), new THREE.MeshStandardMaterial({ color: COLORS[i], roughness: 0.7 }));
  plate.position.y = -0.25;
  g.add(plate);
  const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: 0x9fb3c8, roughness: 0.5 }), 60);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion();
  for (let n = 0; n < 60;) {
    const x = (rand() - 0.5) * 18, z = (rand() - 0.5) * 12;
    if (i > 0 && Math.hypot(x - SLOT.x, z - SLOT.z) < 4.5) continue;   // keep the socket and the camera path clear
    inst.setMatrixAt(n++, m.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(0.6 + rand(), 0.3 + rand() * 1.8, 0.6 + rand())));
  }
  g.add(inst);
  if (i > 0) {
    const pad = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.05, 1.1), new THREE.MeshStandardMaterial({ color: 0xd49a3a, metalness: 0.9, roughness: 0.3 }));
    pad.position.set(SLOT.x, 0.02, SLOT.z);
    g.add(pad);
  }
  return g;
}

const layers = Array.from({ length: N }, (_, i) => makeLayer(i));
scene.add(layers[N - 1]);
for (let i = N - 2; i >= 0; i--) { layers[i].position.copy(SLOT); layers[i].scale.setScalar(S); layers[i + 1].add(layers[i]); }
scene.updateMatrixWorld(true);
const centres = layers.map((g) => g.getWorldPosition(new THREE.Vector3()));
const dists = layers.map((g) => 36 * g.getWorldScale(new THREE.Vector3()).x);   // frame each layer whole
const dir = new THREE.Vector3(0.6, 0.8, 1.2).normalize();

let stop = 0, z = 0;
const hud = document.createElement('div');
hud.className = 'hud';
hud.innerHTML = '<button data-d="-1">in</button><button data-d="1">out</button><span></span>';
document.body.appendChild(hud);
hud.querySelectorAll('button').forEach((b) => (b.onclick = () => (stop = Math.max(0, Math.min(N - 1, stop + +b.dataset.d)))));

function frame(dt) {
  // TODO 1: this is per-frame, so it runs faster on a 144 Hz screen. Use 1 - Math.exp(-2.1 * dt).
  z += (stop - z) * 0.08;
  const i = Math.min(N - 2, Math.floor(z)), f = z - i;
  const dA = dists[i], dB = dists[i + 1];
  // TODO 2: linear distance rushes the first 10x and crawls the last. Interpolate in log space.
  const dist = dA + (dB - dA) * f;
  // TODO 3: once dist is logarithmic, steer the centre by w = (dist - dA) / (dB - dA), not by f.
  const c = centres[i].clone().lerp(centres[i + 1], f);
  camera.position.copy(c).addScaledVector(dir, dist);
  camera.lookAt(c);
  camera.near = dist * 0.012;
  camera.far = dist * 160;
  camera.updateProjectionMatrix();
  hud.querySelector('span').textContent = 'z ' + z.toFixed(2) + '   view ' + (dist / 36 * 20).toPrecision(2) + ' units';
}

let last = performance.now();
renderer.setAnimationLoop((now) => {
  const w = innerWidth, h = innerHeight;
  if (renderer.domElement.width !== Math.floor(w * renderer.getPixelRatio())) { renderer.setSize(w, h); camera.aspect = w / h; }
  frame(Math.min(0.05, (now - last) / 1000));
  last = now;
  renderer.render(scene, camera);
});`;

export default {
  id: "case-portfolio",
  n: 47,
  part: "H",
  title: "Case study: the portfolio",
  hook: "One continuous zoom from a transistor to the planet, in plain three.js and 382 lines of page code. Taken apart, flaws included.",
  minutes: 75,
  levels: ["use", "understand", "rebuild"],
  sections: [
    {
      title: "What it is",
      beats: [
        { t: "say", x: "The portfolio is one page. You start looking at a single transistor, and each stop zooms out a layer: gates, core, die, board, laptop, datacenter, city, planet. A text panel on the left changes with each stop, and the projects sit along the way." },
        {
          t: "table",
          head: ["File", "Lines", "Job"],
          rows: [
            ["`src/content.js`", "256", "Every string the site says, plus the `tour`: 14 stops, each tied to a layer"],
            ["`src/main.js`", "382", "Panel rendering, the text morph, wheel/key/swipe input, the scale readout"],
            ["`src/zoom/engine.js`", "305", "Camera, nesting, the frame loop, shader warm-up"],
            ["`src/zoom/layers/*.js`", "1,364", "Nine scenes, built from boxes, instancing and canvas textures"],
            ["`src/zoom/common.js`", "190", "Seeded RNG, noise, a material cache, instancing helpers, labels"],
            ["`src/style.css`", "808", "Three layouts, no framework"],
          ],
          caption: "Counted with wc -l. Dependencies in package.json: three ^0.158.0, and vite ^6.3.5 for the build.",
        },
        { t: "say", x: "No React, no GSAP, no UI kit. The README still says React, Tailwind and Framer Motion, and older commits touch files like `src/components/Achievements.jsx`. A commit called \"Full revamp\" (2026-09-28) replaced all that with vanilla modules plus three.js." },
        {
          t: "code",
          lang: "html",
          file: "index.html",
          src: "<canvas id=\"world\" aria-hidden=\"true\"></canvas>\n<div id=\"labels\" aria-hidden=\"true\"></div>\n<div id=\"scrim\" aria-hidden=\"true\"></div>\n<header class=\"bar\">...three links...</header>\n\n<main id=\"panels\"></main>\n\n<div id=\"prompt\" aria-hidden=\"true\">...</div>\n<p id=\"edge\" role=\"status\" aria-live=\"polite\"></p>\n<div id=\"hud\" aria-hidden=\"true\">...</div>\n<div id=\"controls\">\n  <span id=\"count\">01 / 14</span>\n  <button class=\"ctl\" data-dir=\"-1\" aria-label=\"Previous stop\">&uarr;</button>\n  <button class=\"ctl\" data-dir=\"1\" aria-label=\"Next stop\">&darr;</button>\n</div>\n<script type=\"module\" src=\"/src/main.js\"></script>",
          mark: [6],
          note: "Layers bottom to top: WebGL canvas, CSS2D labels, a dark gradient scrim, then the words. `<main>` is empty in the HTML.",
        },
        {
          t: "predict",
          lang: "text",
          src: "Fetch the page with JavaScript disabled, or as a crawler\nthat doesn't run scripts. What text is there to read?",
          q: "What does it see?",
          options: ["All 14 panels, in order", "The first panel only", "The header links, the prompt and the meta description; `<main>` is empty", "Nothing at all"],
          answer: 2,
          why: "Every panel is a JS template in `main.js`. Without JS there's a name, three links and the prompt. The `meta description` and Open Graph tags carry the search snippet and link previews on their own.",
        },
        {
          t: "code",
          lang: "js",
          file: "src/main.js",
          src: "if (webglOK()) {\n  start().catch((e) => {\n    console.error(e);\n    renderAll(null);              // every panel, stacked\n    document.body.classList.remove(\"live\");\n    document.body.classList.add(\"still\");\n  });\n} else {\n  renderAll(null);\n  document.body.classList.add(\"still\");\n}",
          note: "Two paths. With WebGL 2: the zoom. Without it, or if anything in `start()` throws: a plain column of panels. A fallback is good design; we'll see it has rotted.",
        },
      ],
    },
    {
      title: "Powers of ten: the engine",
      beats: [
        { t: "say", h: "Nested, not huge", x: "A planet is about 10^14 times wider than a transistor. Float32 can't hold both in one scene. So each layer has its own coordinates, content about 10 units across, and a **slot** where the layer inside it sits, at a position and a scale." },
        {
          t: "code",
          lang: "js",
          file: "src/zoom/engine.js",
          src: "const z = clamp(st.z, 0, N - 1);\nconst B = z >= N - 1 ? N - 1 : Math.floor(z) + 1;   // the base layer\nconst base = layers[B];\nconst child = layers[B - 1];\n\nholders.forEach((h) => (h.visible = false));\nplace(B, new THREE.Vector3(), 1);                  // base at the origin\nif (child) {\n  place(B - 1, base.slot.pos, base.slot.scale);\n  const g = layers[B - 2];\n  if (g) place(B - 2, base.slot.pos.clone().addScaledVector(child.slot.pos, base.slot.scale),\n               base.slot.scale * child.slot.scale);\n}\nconst parent = layers[B + 1];\nif (parent) {\n  const s = 1 / parent.slot.scale;\n  place(B + 1, parent.slot.pos.clone().multiplyScalar(-s), s);\n}",
          mark: [6, 7],
          note: "Every frame, only four layers are visible: grandchild, child, base and parent, all placed relative to the base. Nothing ever needs more than float precision.",
        },
        {
          t: "quiz",
          q: "Most slots are `scale: 1 / 16`. Why not put all nine layers in one scene at their true relative sizes?",
          options: ["three.js caps the scene graph depth", "Float32 positions and depth would break: multiplied through every slot, the transistor is about 4 x 10^-12 of the planet", "It would need nine draw calls", "Instancing doesn't work under scaled parents"],
          answer: 1,
          why: "The slots are 1/16 six times, then 0.64, 1/230 and 1/44: a ratio of about 2.6 x 10^11, far past float32's ~7 significant digits. Rebasing on the base layer each frame keeps everything drawn within a few powers of 16 of the origin.",
        },
        { t: "say", h: "Every 10x takes the same time", x: "Between two layers, camera distance is interpolated in **log space**. A linear lerp from 1 to 10^6 covers the first five powers of ten in 10% of the time and spends the other 90% on the last one. Run it." },
        { t: "play", mode: "js", title: "linear vs log zoom", js: LOG_JS, task: "Note when each width is reached. Then change `dB` to `16` (one slot) and see that the gap shrinks but the shape stays." },
        {
          t: "code",
          lang: "js",
          file: "src/zoom/engine.js",
          src: "const damp = (a, b, l, dt) => a + (b - a) * (1 - Math.exp(-l * dt));\n\nfunction frame(dt) {\n  const target = stops[st.stop];\n  st.z = damp(st.z, target.z, 2.1, dt);\n  if (Math.abs(st.z - target.z) < 1e-4) st.z = target.z;   // snap, stop drifting\n  st.yaw = damp(st.yaw, st.yawT, 4, dt);\n  st.pitch = damp(st.pitch, st.pitchT, 4, dt);\n  ...\n}",
          mark: [1, 5],
          note: "Navigation is one number, `z`, chased with a frame-rate independent exponential. A key press only changes the target stop.",
        },
        { t: "viz", name: "damping" },
        {
          t: "predict",
          lang: "js",
          file: "src/zoom/layers/micro.js",
          src: "// the transistor's gate, every frame\nconst target = Math.floor(t / 2.2) % 2 === 0 ? 1 : 0;\non += (target - on) * Math.min(1, dt * 6);",
          q: "The engine uses `1 - exp(-l dt)`. This layer uses `min(1, dt * 6)`. How do they compare?",
          options: ["Identical at every frame rate", "Close at 60 to 144 fps; they drift apart only when dt is large", "This one is wrong at 60 fps", "This one doesn't converge"],
          answer: 1,
          why: "`1 - e^(-x)` is about `x` for small x: at 60 fps, 0.1 vs 0.095. At dt = 0.05 (the engine's clamp) it's 0.3 vs 0.26. Fine for a glowing gate; it's the exponential you want once something must feel identical everywhere.",
        },
        {
          t: "pitfall",
          h: "Comments rot faster than constants",
          x: "That same block is commented \"The gate switches at 0.5 Hz\". The code flips every 2.2 s, a full on-off cycle of 4.4 s, about 0.23 Hz. Nobody reads a frequency off the screen, but a reader trusts the comment. Put the number in a named constant and let the comment say why.",
        },
      ],
    },
    {
      title: "Drawing it cheaply",
      beats: [
        { t: "say", x: "Nine scenes of boxes would be thousands of draw calls. The trick everywhere is `InstancedMesh`: one geometry, one material, a matrix per copy, one draw. Wires are box chains, electrons are instanced spheres slid along polylines." },
        {
          t: "table",
          head: ["Layer", "Instanced meshes", "Instances", "Plain meshes"],
          rows: [
            ["transistor", "2", "338", "20"],
            ["core", "37", "2,748", "5"],
            ["board", "43", "807", "23"],
            ["datacenter", "6", "9,418", "37"],
            ["city", "7", "782", "164"],
            ["planet", "1", "40", "15, plus 26 lines and 2,500 stars as one Points"],
          ],
          caption: "Measured in a scratch copy by walking each layer's group in the browser (dev build exposes window.__zoom).",
        },
        {
          t: "code",
          lang: "js",
          file: "src/zoom/common.js",
          src: "const cache = new Map();\nexport function M(color, { metal = 0, rough = 0.6, emissive = 0x000000, ei = 0,\n                           opacity = 1, flat = false, side = THREE.FrontSide } = {}) {\n  const k = [color, metal, rough, emissive, ei, opacity, flat, side].join(\"|\");\n  if (!cache.has(k)) {\n    cache.set(k, new THREE.MeshStandardMaterial({ color, metalness: metal, roughness: rough,\n      emissive, emissiveIntensity: ei, transparent: opacity < 1, opacity,\n      depthWrite: opacity >= 1, flatShading: flat, side }));\n  }\n  return cache.get(k);\n}",
          note: "Same parameters, same material object. three.js compiles one program per material variant, so this caps shader programs as well as memory.",
        },
        {
          t: "code",
          lang: "js",
          file: "src/zoom/engine.js",
          src: "// Warm-up: compile every shader, upload every buffer and texture now,\n// so no frame after a keypress ever does first-time GPU work.\nholders.forEach((h) => (h.visible = true));\nconst culled = [];\nscene.traverse((o) => {\n  if (o.isMesh || o.isLine || o.isPoints) {\n    culled.push([o, o.frustumCulled]);\n    o.frustumCulled = false;\n    ...renderer.initTexture(m[k]) for each map...\n  }\n});\nrenderer.compile(scene, camera);\nrenderer.render(scene, camera);\nculled.forEach(([o, f]) => (o.frustumCulled = f));\nholders.forEach((h) => (h.visible = false));",
          mark: [8, 12, 13],
          note: "`compile()` alone isn't enough: buffers upload on first draw. So it draws everything once with culling off. The cost moves to load time, where nobody is waiting on a keypress.",
        },
        {
          t: "quiz",
          q: "`renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25))`. On a 3x phone, what does the cap buy?",
          options: ["Nothing, the GPU upsamples anyway", "About 5.8x fewer pixels to shade than at 3x, for a slightly soft image", "Sharper text in the labels", "It disables antialiasing"],
          answer: 1,
          why: "Fragment cost scales with ratio squared: 9 vs 1.5625. The labels and panel are DOM, so text stays sharp at native resolution. Only the 3D is softened, and the planet shader runs 5 octaves of noise per pixel.",
        },
        {
          t: "code",
          lang: "js",
          file: "src/zoom/layers/laptop.js",
          src: "update(dt, t, { stop, z }) {\n  ...\n  if (Math.abs(z - 5) > 0.7) return;      // too far away to read it\n  if (t - lastDraw < 1 / 12) return;       // at most 12 redraws a second\n  // Redraw (and re-upload) only when what's on screen would change.\n  const key = mode === \"valence\"\n    ? `v${Math.floor((t * 22) % (CHARS + 60))}${Math.floor(t * 2.5) % 2}`\n    : `m${Math.floor((t % 16) / 3.4)}${t % 16 < 8}`;\n  if (key === lastKey) return;\n  lastKey = key;\n  lastDraw = t;\n  ...draw the 1280 x 820 screen canvas...\n  tex.needsUpdate = true;\n}",
          mark: [3, 4, 9],
          note: "The laptop screen is a 2D canvas uploaded as a texture. Three gates in a row keep it from uploading 4 MB to the GPU every frame.",
        },
        { t: "say", h: "The planet is one shader", x: "No textures: land, ocean, ice, a day-night line, city lights on the night side, drifting clouds and an ocean glint, all from value noise on the sphere normal. Here it is on a flat disc." },
        { t: "play", mode: "glsl", title: "the planet, small", glsl: PLANET_GLSL, task: "Move the mouse to sweep the terminator. Change `0.535` to `0.6` and the coast blurs; drop fbm3 to 2 octaves and see what the last three bought." },
      ],
    },
    {
      title: "The panel and the input",
      beats: [
        { t: "say", x: "In live mode there's only one `<article class=\"panel live\">`. Moving a stop doesn't swap panels or fade: every string in the panel scrambles and resolves into its replacement while the box eases to its new height." },
        {
          t: "play",
          mode: "html",
          title: "the morph",
          html: "<button id=\"go\">next stop</button>\n<article id=\"panel\"></article>",
          css: "body { margin: 0; padding: 16px; background: #05070b; color: #e8edf2; font: 16px/1.55 'IBM Plex Sans', system-ui, sans-serif; }\nbutton { font: 600 14px system-ui; padding: 8px 14px; background: #d49a3a; color: #120c04; border: 0; cursor: pointer; }\n#panel { overflow: hidden; max-width: 460px; margin-top: 14px; }\n.k { font: 500 13px ui-monospace, Consolas, monospace; color: #d49a3a; margin: 0 0 8px; }\nh2 { font-size: 34px; line-height: 1.05; margin: 0 0 12px; }\np { margin: 0 0 10px; color: #b3bdc8; }",
          js: MORPH_JS,
          task: "Click through. Then change `k * k` to `k` (resolution no longer back-loaded) and set `DUR` to 300. Which feels more deliberate?",
        },
        {
          t: "pitfall",
          h: "A text effect is a screen reader event",
          x: "For 900 ms every text node holds random letters, written about 60 times a second. The panel isn't a live region, so nothing is announced, but a screen reader user who lands there mid-morph hears garbage. Under `prefers-reduced-motion`, swap the text in one step.",
        },
        {
          t: "play",
          mode: "html",
          title: "one gesture, one stop",
          html: "<p>Scroll or flick a trackpad over this frame.</p><div id=\"bar\"></div><pre id=\"out\"></pre>",
          css: "body { margin: 0; padding: 16px; height: 100vh; box-sizing: border-box; background: #0b1017; color: #e8edf2; font: 14px system-ui; }\n#bar { display: flex; gap: 4px; margin: 14px 0; }\n#bar i { flex: 1; height: 18px; background: #1e2835; }\n#bar i.on { background: #d49a3a; }\npre { color: #b3bdc8; }",
          js: WHEEL_JS,
          task: "One trackpad flick fires dozens of events and moves exactly one stop. Set `QUIET` to 0 and flick again: inertia now skips stops.",
        },
        {
          t: "code",
          lang: "js",
          file: "src/main.js",
          src: "addEventListener(\"keydown\", (e) => {\n  if (e.target.closest?.(\"input, textarea\")) return;\n  const fwd = [\"ArrowDown\", \"ArrowRight\", \"PageDown\", \" \"].includes(e.key);\n  const back = [\"ArrowUp\", \"ArrowLeft\", \"PageUp\"].includes(e.key);\n  if (!fwd && !back) return;\n  e.preventDefault();\n  if (e.repeat && performance.now() - lastKey < 450) return;\n  lastKey = performance.now();\n  step(fwd ? 1 : -1, \"keys\");\n});",
          mark: [2, 3, 6],
          note: "Global keys, skipping only text fields. Held keys repeat at most every 450 ms, so holding the arrow walks the tour instead of blurring through it.",
        },
        {
          t: "predict",
          lang: "text",
          src: "Tab to the on-screen \"Previous stop\" button (stop 1 of 14)\nand press Space.",
          q: "What happens?",
          options: ["It goes back, as labelled", "Nothing: it's already at stop 1", "It shows the 'smaller than this is physics' message", "It moves forward to stop 2"],
          answer: 3,
          why: "The window handler sees Space, calls `preventDefault` (so the button's click never fires) and steps forward. Checked in a scratch copy: the counter went from 01 to 02. Enter still works, because Enter isn't in the list.",
        },
        {
          t: "code",
          lang: "js",
          file: "src/main.js",
          src: "addEventListener(\"touchend\", (e) => {\n  if (ty == null) return;\n  const dy = ty - e.changedTouches[0].clientY;\n  const dx = tx - e.changedTouches[0].clientX;\n  ty = null;\n  if (Math.abs(dy) < 50 || Math.abs(dx) > Math.abs(dy)) return;   // not a vertical swipe\n  if (inPanel) {\n    const scrolled = Math.abs(inPanel.scrollTop - startScroll) > 2;\n    const canMore = dy > 0\n      ? inPanel.scrollTop + inPanel.clientHeight < inPanel.scrollHeight - 2\n      : inPanel.scrollTop > 2;\n    if (scrolled || canMore) return;     // the panel still had text to scroll\n  }\n  step(Math.sign(dy), \"touch\");\n}, { passive: true });",
          note: "The wheel and swipe handlers both ask the panel first: if it can still scroll that way, it gets the gesture. The key handler doesn't ask.",
        },
      ],
    },
    {
      title: "What the build and a Lighthouse pass say",
      beats: [
        {
          t: "table",
          head: ["Chunk", "Raw", "Gzip", "What's in it"],
          rows: [
            ["`index-*.js`", "21.4 kB", "9.3 kB", "main.js, content.js, Vite's preload helper"],
            ["`index-*.js` (second)", "37.9 kB", "15.6 kB", "the nine layers"],
            ["`engine-*.js`", "5.2 kB", "2.4 kB", "the engine"],
            ["`CSS2DRenderer-*.js`", "464.0 kB", "117.3 kB", "three.js, plus CSS2DRenderer"],
            ["`index-*.css`", "10.5 kB", "3.1 kB", "all styles"],
          ],
          caption: "Measured: vite build (6.3.5) in a scratch copy. three.module.min.js r158 alone is 652 kB raw, so tree-shaking removed about 29%.",
        },
        {
          t: "predict",
          lang: "text",
          src: "dist/assets/CSS2DRenderer-wse3RmoT.js   463.96 kB",
          q: "Why is the biggest chunk named after a 215-line label renderer?",
          options: ["CSS2DRenderer imports all of three", "Rollup names a shared chunk after one of the modules in it", "Vite puts addons first", "The file is misnamed by a plugin"],
          answer: 1,
          why: "Both dynamic imports need three and CSS2DRenderer, so Rollup hoists them into one shared chunk and names it after a module inside. Use `build.rollupOptions.output.manualChunks` to call it `three` and make bundle reports readable.",
        },
        {
          t: "steps",
          h: "Order of events on load (src/main.js, start())",
          items: [
            "HTML arrives: the Google Fonts stylesheet and the 21 kB entry chunk start loading.",
            "The entry runs: `fetch(ratings.source)` starts, and `await import(\"./zoom/layers/index.js\")` pulls in the layers and the 464 kB three chunk.",
            "Then `await import(\"./zoom/engine.js\")`. In the network log of the built copy it was requested only after the layers chunk arrived.",
            "`await document.fonts.ready`.",
            "`show(0)`: the first panel's text appears and morphs in from nothing for 900 ms.",
            "Then the engine is created, shaders warm up and the first frame draws.",
          ],
        },
        {
          t: "pitfall",
          h: "\"Words first\" came after 117 kB of three.js",
          x: "The comment says \"The words first, so there's something to read while the shaders compile\". True for the shaders. But `show(0)` runs after both dynamic imports, so the name, the biggest text and the likely LCP element wait on three.js. On a slow phone that's the whole first impression.",
        },
        {
          t: "quiz",
          q: "Cheapest fix that keeps the zoom exactly as it is?",
          options: ["Drop three.js for raw WebGL", "Render the first panel from `content.js` before the `import()` calls, then morph into it once the engine is ready", "Add `<link rel=\"preload\">` for the three chunk", "Inline three.js in the HTML"],
          answer: 1,
          why: "The text needs no WebGL. Painting it first moves LCP to entry chunk plus fonts. Preloading only starts the download sooner; text still waits on it. Rewriting the renderer is weeks of work for the same win.",
        },
        {
          t: "pitfall",
          h: "The favicon weighs 903 kB",
          x: "`<link rel=\"icon\" href=\"/Logo.png\">` points at a 1024 x 1024 PNG of 902,827 bytes. Resized with Pillow (LANCZOS, optimize), a 32 px copy measured 1,088 bytes and a 180 px one 22,505. Every first visit pays for this.",
        },
        {
          t: "table",
          head: ["Likely flag", "Why, from the code", "Severity"],
          rows: [
            ["Largest Contentful Paint", "First text waits on the three chunk and fonts.ready", "High on mobile"],
            ["Render-blocking resources", "Google Fonts CSS, 2 families, 7 faces, third-party origin", "Medium; preconnect helps"],
            ["Reduce unused JavaScript", "One 464 kB chunk, fully needed before the first frame", "Expected for WebGL"],
            ["Properly size images", "1024 px PNG used as a favicon", "Easy win"],
            ["CLS", "Fixed layout, panel height animated in its own box", "Low"],
          ],
          caption: "Read off the code, not a Lighthouse run. Run one in a scratch copy before believing any row.",
        },
      ],
    },
    {
      title: "Responsive and accessible",
      beats: [
        {
          t: "table",
          head: ["Layout", "When (CSS and JS)", "Panel", "Scene"],
          rows: [
            ["Desktop", "wider than 820 px", "Left column, over a left-to-right scrim", "Centre shifted right by 17% of width"],
            ["Portrait phone", "`max-width: 820px`", "Solid sheet at the bottom, max 58vh", "fov 56, subject pushed up 21% of height"],
            ["Sideways phone", "`max-height: 560px` and narrower than 1200", "Sheet on the left, 52vw", "Shifted right by 24% of width"],
          ],
        },
        {
          t: "code",
          lang: "js",
          file: "src/zoom/engine.js",
          src: "function resize() {\n  const w = canvas.clientWidth, h = canvas.clientHeight;\n  renderer.setSize(w, h, false);\n  labels.setSize(w, h);\n  camera.aspect = w / h;\n  const sideways = h < 560 && w < 1200;\n  const narrow = w < 820 || sideways;\n  camera.fov = narrow && !sideways ? 56 : 38;\n  const ox = !narrow || sideways ? -w * (sideways ? 0.24 : 0.17) : 0;\n  const oy = narrow && !sideways ? h * 0.21 : 0;\n  camera.setViewOffset(w, h, ox, oy, w, h);\n  fit = w / h < 1 ? Math.min(1.9, 0.8 / (w / h)) : 1;\n  camera.updateProjectionMatrix();\n}",
          mark: [6, 7, 11],
          note: "`setViewOffset` slides the projection window, so the subject moves off the text without moving the camera. Note the breakpoints: the same numbers live in style.css.",
        },
        {
          t: "pitfall",
          h: "Breakpoints in two languages drift",
          x: "820 and 560/1200 appear in `@media` rules and in `resize()`. Change one and the scene frames itself for a layout the CSS isn't showing. Read the CSS truth from JS with `matchMedia(\"(max-width: 820px)\")`, or put the numbers in one module both use.",
        },
        {
          t: "pitfall",
          h: "`all: unset` removed the focus ring",
          x: "`.ctl { all: unset; ... }` resets `outline` too, and author styles beat the browser's focus style. In a scratch copy, the keyboard-focused Previous button matched `:focus-visible` with `outline-style: none` and an unchanged border. Add `.ctl:focus-visible { outline: 2px solid var(--copper); }`.",
        },
        {
          t: "quiz",
          q: "The Work panel at 756 x 698 px measured 674 px of content in a 403 px box. A keyboard-only visitor presses ArrowDown. What happens?",
          options: ["The panel scrolls", "The tour moves to the next stop; the bottom 271 px of the panel is reachable only by tabbing to links in it", "Nothing", "The page scrolls"],
          answer: 1,
          why: "The key handler doesn't check whether the panel can scroll, unlike wheel and touch. Measured: the counter went 08 to 09 with `scrollTop` still 0. Fix: mirror the wheel check, or make the panel focusable with `tabindex=0` and leave arrows to it when focused.",
        },
        { t: "viz", name: "contrast", props: { fg: "#74818f", bg: "#05070b" } },
        { t: "say", x: "Contrast is fine: the faintest text colour `--text-3` is 5.07:1 on the page and 4.80:1 on the panel, both AA. What's missing is any `prefers-reduced-motion` rule: the camera flights, the morph and the looping key hint all run regardless." },
      ],
    },
    {
      title: "Why it reads as hand-made",
      beats: [
        { t: "say", x: "Against the checklist from Writing and design that don't look AI-made: zero `border-radius`, zero `box-shadow`, two gradients (both scrims, both functional), no glass, no icon cards, sentence case throughout, one accent called `--copper`." },
        {
          t: "compare",
          a: { label: "A template portfolio", lang: "js", src: "sections: [\"Hero\", \"About\", \"Skills\", \"Projects\",\n  \"Experience\", \"Contact\"]\n// each a full-width card, fade-up on scroll" },
          b: { label: "src/content.js", lang: "js", src: "{ id: \"experience\", layer: \"datacenter\", title: \"Work\",\n  body: [\"The four halls down there are the pipeline I\n    designed at ScholarRank: intake, a queue, scoring,\n    and read replicas.\"] },\n{ id: \"railflow\", layer: \"city\", focus: \"railflow\" },\n{ id: \"contact\", layer: \"planet\", focus: \"home\" }," },
          x: "The sections are the same. The decision is where each one lives: the work history is drawn as the system it describes, and the halls in infra.js are literally named intake, queue, scoring, read replicas.",
        },
        {
          t: "table",
          head: ["Decision", "Where", "Why it's specific"],
          rows: [
            ["IBM Plex Sans and Mono", "index.html, style.css", "An engineering typeface for an engineer; mono for scales and stats"],
            ["Live scale readout", "main.js `TRANSISTORS`, `WIDTHS`", "'transistors in view, roughly' with tabular numerals"],
            ["Labels with real facts", "micro.js", "'silicon atoms, 0.235 nm apart'"],
            ["Jokes at the edges", "content.js `edges`", "Past the planet: 'the solar system will have to wait'"],
            ["Ratings that update", "main.js, `ratings.source`", "Pulled from the GitHub profile's data.json; static values as fallback"],
          ],
        },
        {
          t: "quiz",
          q: "The CP stop fetches ratings from `raw.githubusercontent.com` at load. What happens if that fetch fails?",
          options: ["The panel shows an error", "The numbers baked into `content.js` stay; `.catch(() => {})` swallows it", "The whole zoom falls back to still mode", "It retries every 6 hours"],
          answer: 1,
          why: "`live` starts as `structuredClone(ratings)`, so there's always a number. When data does arrive and you're on the CP stop, the panel re-morphs into the fresh values. The data.json side is in Case study: the GitHub profile.",
        },
        {
          t: "pitfall",
          h: "Effort shows only if the first stop shows it",
          x: "The tour starts with the hardest-to-read scene: a FinFET at 50 nm. The hero copy names it (\"You're looking at one transistor\") and the prompt says how to move. Without those two lines the best scene on the site reads as abstract shapes.",
        },
      ],
    },
    {
      title: "Shipping, and the honest list",
      beats: [
        { t: "say", h: "Deployment", x: "There's no `vercel.json` and no CI file. `og:url` is `https://sudhss.vercel.app/`, `dist` is gitignored, and `vite.config.js` sets only `base: \"/\"`, `target: es2020` and a raised chunk warning, so the host's defaults decide the build." },
        {
          t: "code",
          lang: "js",
          file: "vite.config.js",
          src: "export default defineConfig({\n  base: \"/\",\n  build: { target: \"es2020\", chunkSizeWarningLimit: 800 },\n});",
          note: "`chunkSizeWarningLimit: 800` silences Vite's warning about the 464 kB chunk. Fair, as long as someone decided it on purpose.",
        },
        {
          t: "pitfall",
          h: "The fallback nobody runs has rotted",
          x: "In still mode, `renderAll(null)` passes no layers, so each kicker falls back to `stops[].kicker`: \"The market\", \"The chess plaza\", \"End of the road\". Those, and an unused home body about \"a bike ride along a coast road\", match nothing in the zoom. Nobody tests this path, so nobody saw.",
        },
        {
          t: "predict",
          lang: "js",
          file: "src/zoom/engine.js",
          src: "function loop(now) {\n  if (!running) return;\n  frame(...); last = now;\n  requestAnimationFrame(loop);\n}\npause(p) {\n  running = !p;\n  if (running) { last = performance.now(); requestAnimationFrame(loop); }\n}\n// main.js: visibilitychange -> engine.pause(document.hidden)",
          q: "The tab is hidden, then shown. The frame queued before hiding never ran. How many loops are alive after?",
          options: ["One", "Two: the old queued callback finds running true again", "Zero", "It depends on the GPU"],
          answer: 1,
          why: "The queued callback wakes after `pause(false)` set running back to true, so it carries on, next to the new one. Every hide and show adds another full scene render per frame. Keep the rAF id and cancel it, or bail out if a loop is already scheduled.",
        },
        { t: "play", mode: "js", title: "the loop that doubles", js: LOOP_JS, task: "Watch calls per frame climb. Fix `pause` so it stays at 1.00: store the id from requestAnimationFrame and cancel it, or skip scheduling if one is pending." },
        {
          t: "steps",
          h: "What I'd change, in order",
          items: [
            "Paint the first panel before importing three.js; measure LCP before and after.",
            "Ship a 32 px and a 180 px icon instead of the 903 kB PNG.",
            "Fix `pause()` so a hidden tab can't stack render loops.",
            "Stop taking Space and arrows when focus is on a button or a scrollable panel; give `.ctl` a focus ring.",
            "Honour `prefers-reduced-motion`: cut camera flights to quick fades, swap text without scrambling.",
            "Render every panel into `<main>` in the HTML at build time and hide all but one, so crawlers and readers without JS get the content.",
            "Delete the dead strings, the unused images in `public/` and the stale README.",
          ],
        },
        {
          t: "quiz",
          q: "If you only had an hour, which change matters most for the people who will actually open this link?",
          options: ["Reduced motion", "LCP: show the name before three.js", "The README", "manualChunks naming"],
          answer: 1,
          why: "A recruiter on a phone decides in seconds, and today those seconds show a header on a dark screen until a 117 kB gzip chunk arrives. Everything else on the list matters, but this one changes the first impression for every visitor.",
        },
      ],
    },
    {
      title: "Rebuild it",
      beats: [
        { t: "say", x: "The signature interaction is one number `z` chased by a damped camera through nested layers, with distance moving in log space. The starter below runs, but it does all three things the naive way." },
        {
          t: "rebuild",
          h: "A powers-of-ten zoom",
          x: "Four layers, each in a copper socket of the next at 1/16 scale, just like the portfolio's slots. Press out and in. The motion rushes then crawls, and depends on your refresh rate. Fix the three TODOs in `frame()` to match engine.js.",
          mode: "three",
          js: REBUILD_JS,
          css: ".hud { position: fixed; left: 12px; bottom: 12px; display: flex; gap: 8px; align-items: center; font: 13px ui-monospace, Consolas, monospace; color: #b3bdc8; }\n.hud button { font: 600 13px system-ui; padding: 6px 12px; background: #d49a3a; color: #120c04; border: 0; cursor: pointer; }",
          task: "Fix TODO 2 first and watch the socket slide off-centre mid-zoom; TODO 3 fixes that. Bonus: add a fifth layer and check nothing jitters at 16^-4.",
        },
        {
          t: "mission",
          h: "Move the portfolio's LCP in a scratch copy",
          x: "Copy the portfolio (never the original) and build it. Run Lighthouse in mobile mode three times and note the median LCP. Change `start()` so the first panel paints before the dynamic imports, rebuild, and measure again. Then do the favicon and measure transfer size.",
          hint: "Call `show(0)` before `await import(...)` and keep `document.fonts.ready` out of the critical path. Report medians, not single runs, and keep the before and after numbers next to each other.",
          solution: { lang: "js", src: "async function start() {\n  const panel = document.createElement(\"article\");\n  panel.className = \"panel live\";\n  panelsEl.replaceChildren(panel);\n  document.body.classList.add(\"live\");\n  panel.innerHTML = panelInner(tour[0], 0, null);   // words now, no morph\n\n  const [{ buildLayers }, { createEngine }] = await Promise.all([\n    import(\"./zoom/layers/index.js\"),\n    import(\"./zoom/engine.js\"),                      // no serial request\n  ]);\n  const layers = buildLayers();\n  // ...then morph into the kicker with the layer's name, as before\n}" },
        },
      ],
    },
  ],
  nobodyTells: [
    "Huge scale ranges are a precision problem first. Rebase on the layer you're looking at every frame, and float32 stops being a worry.",
    "Zoom distance belongs in log space. Linear spends almost all the time on the last power of ten.",
    "`renderer.compile()` doesn't upload buffers. Draw everything once with culling off at load if you want no first-use hitches later.",
    "A global keydown handler that calls preventDefault on Space breaks every button on the page for keyboard users.",
    "Pausing a rAF loop with a flag and restarting it with a new requestAnimationFrame can leave two loops alive. Keep the id.",
    "Rollup names shared chunks after a module inside them. Name your big vendor chunk, or your bundle report will lie to you.",
    "The fallback path is code too. If nobody opens the site without WebGL, its strings will rot unseen.",
    "A favicon is downloaded on every first visit. Check its bytes; it's often the heaviest image on a page that has no images.",
  ],
  glossary: [
    ["slot", "Where a child layer sits inside its parent: a position and a scale, here mostly 1/16."],
    ["rebasing", "Drawing everything relative to the current layer so coordinates stay small and float32 stays precise."],
    ["log-space interpolation", "Lerping the logarithm of a value, so each multiplication by 10 takes equal time."],
    ["InstancedMesh", "One geometry and material drawn many times in one call, each copy with its own matrix."],
    ["setViewOffset", "Shifts the camera's projection window, moving the subject on screen without moving the camera."],
    ["shader warm-up", "Compiling and drawing everything once at load so later frames never do first-time GPU work."],
    ["CSS2DRenderer", "A three.js addon that positions DOM elements over 3D points; the labels here."],
    ["shared chunk", "A bundle file Rollup creates for modules needed by several dynamic imports."],
    ["LCP", "Largest Contentful Paint: when the biggest text or image in the viewport is first painted."],
    ["focus-visible", "The pseudo-class for keyboard focus; where a focus ring belongs."],
    ["terminator", "The day-night line on a planet; here a smoothstep on the dot of normal and sun."],
  ],
  explain: "Explain to a friend how the portfolio zooms from a transistor to a planet without float32 falling apart, and the two things you'd fix first.",
};
