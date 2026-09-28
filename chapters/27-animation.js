export default {
  id: "animation",
  n: 27,
  part: "F",
  title: "Animation craft",
  hook: "Easing, springs and the one exponential that makes motion identical at 30, 60 and 144 fps.",
  minutes: 70,
  levels: ["use", "understand", "rebuild"],
  sections: [
    {
      title: "What motion says",
      beats: [
        { t: "say", x: "An easing curve is a sentence about physics. **ease-out** says \"I was thrown and I'm settling\". **ease-in** says \"I'm leaving\". **linear** says \"I'm a machine\": right for spinners, wrong for almost everything else." },
        { t: "viz", name: "easing", props: { curve: [0.16, 1, 0.3, 1] } },
        {
          t: "table",
          head: ["Curve", "It communicates", "Use it for"],
          rows: [
            ["ease-out `cubic-bezier(.16,1,.3,1)`", "Arrives with intent, settles", "Things entering, responses to input"],
            ["ease-in `cubic-bezier(.7,0,.84,0)`", "Accelerates away", "Things leaving: dismissals, exits"],
            ["ease-in-out `cubic-bezier(.65,0,.35,1)`", "Travels from A to B on its own", "Elements moving across the screen"],
            ["linear", "Constant, mechanical", "Spinners, progress bars, colour loops"],
            ["overshoot `cubic-bezier(.34,1.56,.64,1)`", "Has mass, a little playful", "Toggles, small confirmations; never big surfaces"],
          ],
        },
        {
          t: "predict",
          lang: "css",
          src: ".menu { transform: scale(.95); opacity: 0;\n  transition: transform 300ms ease-in, opacity 300ms ease-in; }\n.menu.open { transform: none; opacity: 1; }",
          q: "The user clicks and `.open` is added. How does it feel?",
          options: ["Snappy", "Laggy: nothing, then a rush at the end", "Bouncy", "Identical to ease-out"],
          answer: 1,
          why: "ease-in barely moves for the first 100 ms, exactly when the user is waiting for proof the click worked. Anything answering input should start fast: ease-out.",
        },
        {
          t: "pitfall",
          h: "Duration scales with distance, not importance",
          x: "A 400 ms tooltip feels broken; a 150 ms full-screen sheet feels violent. Small UI: 120-200 ms. Panels and sheets: 250-350 ms. Exits at about 70% of the entrance. The user already decided; don't make them watch.",
        },
        {
          t: "quiz",
          q: "`transition: opacity .2s` with no timing function. What curve runs?",
          options: ["linear", "ease, `cubic-bezier(.25,.1,.25,1)`", "ease-in-out", "ease-out"],
          answer: 1,
          why: "The default for both `transition` and `animation` is `ease`: a quick start and a long soft tail. People assume linear and then wonder why their progress bar decelerates.",
        },
      ],
    },
    {
      title: "Cubic-bezier, the maths",
      beats: [
        { t: "say", x: "`cubic-bezier(x1,y1,x2,y2)` is a curve from (0,0) to (1,1) with two control points. x is time, y is progress. The catch: both are functions of a hidden parameter t, so to get progress at time x you must **solve** x(t) = x first." },
        {
          t: "play",
          mode: "js",
          title: "cubic-bezier from scratch",
          js: `// one axis of a cubic Bezier with P0 = 0 and P3 = 1
const B = (t, p1, p2) => 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t * t * p2 + t ** 3;
const dB = (t, p1, p2) => 3 * (1 - t) ** 2 * p1 + 6 * (1 - t) * t * (p2 - p1) + 3 * t * t * (1 - p2);

function cubicBezier(x1, y1, x2, y2) {
  return (x) => {
    let t = x;                                  // decent first guess
    for (let i = 0; i < 8; i++) {               // Newton on B_x(t) - x = 0
      const err = B(t, x1, x2) - x;
      const d = dB(t, x1, x2);
      if (Math.abs(err) < 1e-7 || Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    let lo = 0, hi = 1;                         // bisection if Newton stalled
    while (Math.abs(B(t, x1, x2) - x) > 1e-7 && hi - lo > 1e-9) {
      t = (lo + hi) / 2;
      if (B(t, x1, x2) < x) lo = t; else hi = t;
    }
    return B(t, y1, y2);
  };
}

const ease = cubicBezier(0.25, 0.1, 0.25, 1);
for (const x of [0, 0.1, 0.25, 0.5, 0.75, 1]) console.log(x, ease(x).toFixed(4));
const back = cubicBezier(0.34, 1.56, 0.64, 1);
console.log('overshoot peak', Math.max(...Array.from({ length: 101 }, (_, i) => back(i / 100))).toFixed(3));`,
          task: "`ease` reaches 80% progress by about 50% of the time. Verify it, then find the time where `back` peaks.",
        },
        { t: "say", x: "x1 and x2 must sit in [0,1] so x(t) is monotonic: every moment has exactly one progress value. y is free. y2 = 1.56 pushes the curve above 1 and back, and that's your overshoot." },
        {
          t: "quiz",
          q: "`cubic-bezier(.5, 0, .5, 1)` at exactly half the duration returns what progress?",
          options: ["0.25", "0.5", "0.75", "It depends on the solver"],
          answer: 1,
          why: "The control points are point-symmetric about (0.5, 0.5), so t = 0.5 gives x = 0.5 and y = 0.5. Symmetric curves always pass through the middle at the middle.",
        },
        {
          t: "pitfall",
          h: "Interrupting a tween makes a kink",
          x: "Hover off halfway and a new tween starts from the current value with velocity zero. The element visibly stalls, then accelerates again. Tweens have no memory of speed. For anything the user can interrupt, reach for a spring.",
        },
      ],
    },
    {
      title: "Springs",
      beats: [
        { t: "say", h: "A spring is state, not a curve", x: "A tween is a function of time. A spring is **position plus velocity**, pushed by a force each frame. Move the target mid-flight and it bends toward the new one with no kink. That's why gestures use springs." },
        {
          t: "code",
          lang: "js",
          src: "// damped harmonic oscillator, mass 1:  a = -k (x - target) - c v\nfunction stepSpring(s, target, dt) {\n  const a = -s.k * (s.x - target) - s.c * s.v;\n  s.v += a * dt;   // velocity first...\n  s.x += s.v * dt; // ...then position, using the NEW velocity\n}",
          mark: [4, 5],
          note: "That order is **semi-implicit (symplectic) Euler**. Swap lines 4 and 5 and you get explicit Euler, which adds energy every step.",
        },
        {
          t: "predict",
          lang: "js",
          src: "// undamped: k = 400, dt = 1/60, explicit Euler\nconst a = -400 * x;  // force from the OLD position\nx += v * dt;         // position from the OLD velocity\nv += a * dt;",
          q: "Run it for 10 seconds. What does the amplitude do?",
          options: ["Stays constant", "Grows without bound", "Slowly decays", "NaN on frame one"],
          answer: 1,
          why: "Explicit Euler multiplies the oscillator's energy by (1 + ω²dt²) every step. Here that's 1.11 per frame: over 600 frames it explodes. Semi-implicit Euler keeps energy bounded, which is why it's the physics default.",
        },
        { t: "say", x: "With mass 1, ω = √k and the **damping ratio** is ζ = c / (2√k). Below 1 it overshoots and rings. At exactly 1 it's **critically damped**: the fastest arrival with no overshoot. Above 1 it crawls. Pick ζ and k, derive c." },
        {
          t: "table",
          head: ["ζ", "Looks like", "Use it for"],
          rows: [
            ["0.3", "Bouncy, rings several times", "Toys and celebrations; almost never UI"],
            ["0.6-0.8", "One small overshoot, then settles", "Drag release, cards snapping into place"],
            ["1.0", "Fastest possible, no overshoot", "Camera follow, values that must not pass the target"],
            ["2.0", "Sluggish, creeps in", "Nothing. Raise k instead"],
          ],
        },
        {
          t: "play",
          mode: "html",
          title: "a spring on your cursor",
          html: `<div id="dot"></div>
<div class="ui">
  <label>k <input id="k" type="range" min="20" max="600" value="170"></label>
  <label>zeta <input id="z" type="range" min="0.1" max="2" step="0.05" value="0.6"></label>
  <span id="out"></span>
</div>`,
          css: `body { margin: 0; height: 100vh; font: 14px system-ui; overflow: hidden; }
.ui { padding: 12px; display: flex; gap: 16px; align-items: center; }
#dot { position: fixed; left: 0; top: 0; width: 24px; height: 24px;
  border-radius: 50%; background: #d49a3a; will-change: transform; }`,
          js: `const dot = document.getElementById('dot');
const kIn = document.getElementById('k'), zIn = document.getElementById('z');
const out = document.getElementById('out');
const sx = { x: 150, v: 0 }, sy = { x: 150, v: 0 };
let tx = 150, ty = 150, last = 0;
addEventListener('pointermove', (e) => { tx = e.clientX; ty = e.clientY; });

function step(s, target, k, c, dt) {
  const a = -k * (s.x - target) - c * s.v;
  s.v += a * dt;
  s.x += s.v * dt;
}

function frame(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 0;
  last = now;
  const k = +kIn.value, zeta = +zIn.value;
  const c = 2 * zeta * Math.sqrt(k);
  step(sx, tx, k, c, dt);
  step(sy, ty, k, c, dt);
  dot.style.transform = \`translate(\${sx.x - 12}px, \${sy.x - 12}px)\`;
  out.textContent = \`k=\${k}  zeta=\${zeta}  settle~\${(4 / (Math.min(zeta, 1) * Math.sqrt(k))).toFixed(2)}s\`;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);`,
          task: "Find the k and zeta that feel like a physical object with weight. Then set k 600, zeta 0.1 and swap the last two lines of `step`: explicit Euler, gaining energy.",
        },
        {
          t: "pitfall",
          h: "A spring has no duration, only a settle time",
          x: "It approaches the target forever. Stop it when both |x - target| and |v| drop under a threshold, or your loop runs for good and burns battery. For ζ < 1, settling to about 2% takes roughly 4 / (ζω) seconds.",
        },
        {
          t: "quiz",
          q: "You want a real spring feel in pure CSS, no JS. What do you use?",
          options: ["`cubic-bezier` with y above 1", "`linear()` with many stops", "`steps()`", "It can't be done"],
          answer: 1,
          why: "`linear()` takes a list of points and interpolates between them, so you can bake a sampled spring into CSS. A cubic-bezier can overshoot once; it can't ring. It still can't be interrupted with its velocity kept.",
        },
      ],
    },
    {
      title: "Frame-rate independence",
      beats: [
        {
          t: "predict",
          lang: "js",
          src: "// every frame\nx += (target - x) * 0.1;",
          q: "Same code on a 60 Hz laptop and a 144 Hz monitor. What happens?",
          options: ["Identical motion", "Much faster on 144 Hz", "Slower on 144 Hz", "Same speed, just smoother"],
          answer: 1,
          why: "The rule runs per frame. After one second the gap left is 0.9^60 = 0.2% on the laptop and 0.9^144 = 0.00025% on the monitor. Your carefully tuned feel is a property of the user's hardware.",
        },
        { t: "viz", name: "damping" },
        {
          t: "compare",
          a: { label: "per frame", lang: "js", src: "x += (target - x) * 0.1;" },
          b: { label: "per second", lang: "js", src: "// lambda: how fast, in 1/seconds\nx += (target - x) * (1 - Math.exp(-lambda * dt));" },
          x: "The exponential is exact: after time T the gap is e^(-λT), whatever the step. To port a k tuned at 60 fps: λ = -60 ln(1 - k). For k = 0.1 that's λ ≈ 6.3.",
        },
        { t: "say", h: "One loop owns time", x: "A single `requestAnimationFrame` loop measures dt from the timestamp rAF hands it, clamps it, and passes it down. Nothing else calls `performance.now()`, so everything in a frame agrees on what time it is." },
        {
          t: "code",
          lang: "js",
          src: "let last = 0;\nfunction frame(now) {             // now: this frame's timestamp, ms\n  let dt = last ? (now - last) / 1000 : 0;\n  last = now;\n  dt = Math.min(dt, 1 / 20);      // hidden for 40 s is not 40 s of physics\n  update(dt);\n  render();\n  requestAnimationFrame(frame);\n}\nrequestAnimationFrame(frame);",
          mark: [5],
        },
        {
          t: "pitfall",
          h: "Background tabs hand you a giant dt",
          x: "rAF stops when the tab is hidden. On return, `now - last` is minutes. Unclamped, springs blow up to NaN and tweens teleport to the end. Clamp dt, or reset `last` on `visibilitychange`.",
        },
        { t: "say", h: "Interpolate, don't guess", x: "Physics wants a fixed step; screens run at any rate. Step the simulation at a fixed 1/60 s with an accumulator, then draw a blend of the last two states. Smooth at any refresh rate, at the cost of one step of lag." },
        {
          t: "code",
          lang: "js",
          src: "const STEP = 1 / 60;\nlet acc = 0, prev = { x: 0 }, curr = { x: 0 };\n\nfunction frame(dt) {\n  acc += Math.min(dt, 0.25);\n  while (acc >= STEP) {\n    prev = curr;\n    curr = simulate(curr, STEP); // pure: returns a new state\n    acc -= STEP;\n  }\n  const alpha = acc / STEP;      // fraction of the way to the next step\n  draw(prev.x + (curr.x - prev.x) * alpha);\n}",
          mark: [11, 12],
          note: "Bonus: a fixed step makes the simulation deterministic, so replays and tests give the same result on every machine.",
        },
        {
          t: "quiz",
          q: "Why not **extrapolate** instead: draw `curr.x + curr.v * acc`?",
          options: ["It's slower to compute", "No lag, but wrong whenever velocity changes, so things poke through walls then snap back", "It's identical", "It fails above 60 Hz"],
          answer: 1,
          why: "Extrapolation predicts the future: zero latency, but a collision or input makes the guess wrong and it snaps. Networked games render remote players about 100 ms in the past, interpolating between snapshots, for the same reason.",
        },
      ],
    },
    {
      title: "FLIP",
      beats: [
        { t: "say", x: "Layout properties (width, top, grid position) are expensive to animate. **FLIP** cheats: let the layout jump instantly, then animate a `transform` that makes it look like the element travelled there." },
        {
          t: "steps",
          h: "First, Last, Invert, Play",
          items: [
            "**First**: read the element's rect.",
            "**Last**: apply the change (new class, new parent, new order) and read the rect again. One forced layout.",
            "**Invert**: set a transform that puts it back where it was. It looks unmoved.",
            "**Play**: animate that transform to `none`. The compositor does the rest.",
          ],
        },
        {
          t: "code",
          lang: "js",
          src: "function flip(el, change) {\n  const a = el.getBoundingClientRect();\n  change();                                  // layout jumps here\n  const b = el.getBoundingClientRect();\n  el.animate([\n    { transformOrigin: 'top left',\n      transform: `translate(${a.left - b.left}px, ${a.top - b.top}px)\n                  scale(${a.width / b.width}, ${a.height / b.height})` },\n    { transformOrigin: 'top left', transform: 'none' },\n  ], { duration: 300, easing: 'cubic-bezier(.2,.8,.2,1)' });\n}",
          note: "`getBoundingClientRect` includes current transforms, so an interrupted FLIP starts from where the element visibly is.",
        },
        {
          t: "play",
          mode: "html",
          title: "FLIP shuffle",
          html: `<button id="go">Shuffle</button>
<div id="grid"></div>`,
          css: `body { font: 600 16px system-ui; padding: 16px; }
#grid { display: grid; grid-template-columns: repeat(4, 64px); gap: 8px; margin-top: 12px; }
#grid div { height: 64px; border-radius: 10px; display: grid; place-items: center; color: #fff; }`,
          js: `const grid = document.getElementById('grid');
for (let i = 0; i < 16; i++) {
  const d = document.createElement('div');
  d.textContent = i;
  d.style.background = \`hsl(\${i * 22} 65% 50%)\`;
  grid.append(d);
}

document.getElementById('go').onclick = () => {
  const items = [...grid.children];
  const first = new Map(items.map((el) => [el, el.getBoundingClientRect()])); // read all
  for (let i = items.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [items[i], items[j]] = [items[j], items[i]];
  }
  grid.append(...items);                                                       // write once
  for (const el of items) {                                                    // read all again
    const a = first.get(el), b = el.getBoundingClientRect();
    el.animate(
      [{ transform: \`translate(\${a.left - b.left}px, \${a.top - b.top}px)\` }, { transform: 'none' }],
      { duration: 450, easing: 'cubic-bezier(.2,.8,.2,1)' }
    );
  }
};`,
          task: "Click Shuffle twice quickly: it still flows. Now stagger each tile by 12 ms with `delay` and `fill: 'backwards'`, and see why `fill` matters.",
        },
        {
          t: "pitfall",
          h: "scale() squashes the children",
          x: "FLIP a size change with `scale` and text, borders and border-radius stretch mid-flight. Either counter-scale an inner wrapper by the inverse each frame, or FLIP only position and crossfade the content.",
        },
        {
          t: "predict",
          lang: "js",
          src: "for (const el of items) {         // 200 items\n  const r = el.getBoundingClientRect();\n  el.style.width = r.width + 10 + 'px';\n}",
          q: "How many layouts does this force?",
          options: ["1", "2", "About 200", "0, it's batched"],
          answer: 2,
          why: "Every write dirties layout; the next read must recompute it synchronously. Read everything, then write everything: one layout. FLIP over many elements lives or dies on that ordering.",
        },
      ],
    },
    {
      title: "Scroll-driven storytelling",
      beats: [
        { t: "say", x: "The pattern behind every product-launch page: a tall section, a **sticky** stage inside it, and one number, progress from 0 to 1, that drives everything on stage. Scroll distance becomes a timeline." },
        {
          t: "code",
          lang: "js",
          src: "// .story { height: 400vh }   the scroll distance\n// .stage { position: sticky; top: 0; height: 100vh }   what you see\nconst r = story.getBoundingClientRect();\nconst p = clamp(-r.top / (r.height - innerHeight), 0, 1);\n\n// map a slice of progress to 0..1: the workhorse of every scene\nconst range = (p, a, b) => clamp((p - a) / (b - a), 0, 1);\nconst move = range(p, 0.25, 0.5); // scene 2 owns 25%..50% of the scroll",
          mark: [4, 7],
        },
        {
          t: "play",
          mode: "html",
          title: "a sticky stage",
          html: `<p class="pad">Scroll down</p>
<section class="story">
  <div class="stage"><div class="ball"></div><p class="caption"></p></div>
</section>
<p class="pad">The end</p>`,
          css: `body { margin: 0; font: 600 20px system-ui; }
.pad { height: 60vh; display: grid; place-items: center; margin: 0; }
.story { height: 400vh; }
.stage { position: sticky; top: 0; height: 100vh; overflow: hidden;
  display: grid; align-content: center; gap: 24px; }
.ball { width: 80px; height: 80px; border-radius: 50%; background: #d49a3a; margin-left: 40px; }
.caption { text-align: center; font-size: 28px; position: relative; }`,
          js: `const story = document.querySelector('.story');
const ball = document.querySelector('.ball');
const caption = document.querySelector('.caption');
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const range = (p, a, b) => clamp((p - a) / (b - a), 0, 1);
const lines = ['It starts small.', 'Then it moves.', 'Then it grows.', 'Then it leaves.'];

function update() {
  const r = story.getBoundingClientRect();
  const p = clamp(-r.top / (r.height - innerHeight), 0, 1);
  const move = range(p, 0.25, 0.5), grow = range(p, 0.5, 0.75), leave = range(p, 0.75, 1);
  const x = move * (innerWidth / 2 - 80);
  ball.style.transform = \`translateX(\${x}px) scale(\${1 + grow * 2})\`;
  ball.style.opacity = 1 - leave;
  caption.textContent = lines[Math.min(3, Math.floor(p * 4))];
}
addEventListener('scroll', update, { passive: true });
addEventListener('resize', update);
update();`,
          task: "Add a fifth scene where the background colour shifts. Then ease each scene: wrap `range(...)` in an ease-out so scenes land instead of stopping dead.",
        },
        {
          t: "pitfall",
          h: "Scrub with transforms, never with layout",
          x: "A scroll handler can fire 120 times a second. Write only `transform` and `opacity`. One `height`, `top` or `margin` in there and every scroll frame becomes a full-page layout, and the story judders on exactly the phones that matter.",
        },
        { t: "say", x: "Modern CSS can do this with no JS: `animation-timeline: view()` ties a keyframe animation to an element's position in its scroller, and runs off the main thread. Not every browser has it, so feature-detect." },
        {
          t: "code",
          lang: "css",
          src: "@keyframes rise { from { opacity: 0; transform: translateY(40px); } }\n\n@supports (animation-timeline: view()) {\n  .card {\n    animation: rise linear both;\n    animation-timeline: view();          /* after the shorthand: it resets it */\n    animation-range: entry 0% cover 40%;\n  }\n}",
          mark: [6],
        },
        {
          t: "quiz",
          q: "Your `.stage { position: sticky; top: 0 }` scrolls away like a normal block. Most likely cause?",
          options: ["z-index too low", "An ancestor has `overflow: hidden`", "It needs `will-change: transform`", "Sticky doesn't work inside sections"],
          answer: 1,
          why: "Sticky sticks within its nearest scrolling ancestor. `overflow: hidden` or `auto` anywhere above makes that ancestor the scroller, and it never scrolls. Use `overflow: clip` when you only want clipping.",
        },
      ],
    },
    {
      title: "The compositor and reduced motion",
      beats: [
        {
          t: "table",
          head: ["You animate", "Per-frame work", "Why"],
          rows: [
            ["`transform`, `opacity`", "Composite only", "The GPU moves or fades an existing layer texture"],
            ["`filter`", "Usually composite", "Accelerated in most engines; big blur radii are still costly"],
            ["`color`, `background`, `box-shadow`", "Paint + composite", "Pixels must be redrawn, geometry stays"],
            ["`width`, `top`, `margin`, `font-size`", "Layout + paint + composite", "Geometry changes and neighbours may move"],
          ],
        },
        {
          t: "predict",
          lang: "js",
          src: "// A: a CSS animation of transform on .a\n// B: a rAF loop setting .b.style.transform each frame\nconst end = performance.now() + 500;\nwhile (performance.now() < end) {} // a 500 ms long task",
          q: "During the long task, which box keeps moving?",
          options: ["Both", "Only A", "Only B", "Neither"],
          answer: 1,
          why: "CSS and Web Animations API animations of `transform` and `opacity` are handed to the compositor thread and tick while JS is stuck. A rAF loop is JS: no JS, no frame. Same property, different thread.",
        },
        {
          t: "pitfall",
          h: "will-change is a memory bill",
          x: "Each promoted layer is a GPU texture of width × height × 4 bytes. A full-screen layer on a 4K display is about 33 MB. Promote just before animating, drop it after, and never put `will-change` on 500 list items.",
        },
        { t: "say", h: "Reduced motion is not no motion", x: "`prefers-reduced-motion: reduce` means **movement** hurts: parallax, zooms and big slides can cause nausea. Fades and colour changes are fine. So swap motion for a crossfade; never delete the feedback." },
        {
          t: "compare",
          a: { label: "the nuke", lang: "css", src: "@media (prefers-reduced-motion: reduce) {\n  * { animation: none !important;\n      transition: none !important; }\n}" },
          b: { label: "replace, don't remove", lang: "css", src: ".sheet { transition: transform .3s cubic-bezier(.2,.8,.2,1); }\n.sheet:not(.open) { transform: translateY(100%); }\n\n@media (prefers-reduced-motion: reduce) {\n  .sheet { transition: opacity .2s; }\n  .sheet:not(.open) { transform: none; opacity: 0;\n                      pointer-events: none; }\n}" },
          x: "The nuke kills spinners, focus hints and state changes, and breaks any code awaiting `transitionend` or `animationend`, which now never fire. A crossfade keeps the meaning.",
        },
        {
          t: "code",
          lang: "js",
          src: "const mq = matchMedia('(prefers-reduced-motion: reduce)');\nlet motionOK = !mq.matches;\nmq.addEventListener('change', (e) => { motionOK = !e.matches; });\n\n// media queries never reach your JS animations: ask explicitly\nel.animate(motionOK\n  ? [{ transform: 'translateY(20px)', opacity: 0 }, { transform: 'none', opacity: 1 }]\n  : [{ opacity: 0 }, { opacity: 1 }],\n  { duration: 250, easing: 'ease-out' });",
          mark: [5],
        },
        {
          t: "quiz",
          q: "Under reduced motion, which one should stay as it is?",
          options: ["A parallax hero", "A card sliding in from off-screen", "A button darkening on press", "An auto-advancing carousel"],
          answer: 2,
          why: "Triggers are movement through space: travel, scale, parallax. A colour change gives feedback without motion. Auto-advancing content should pause too, since it moves without being asked.",
        },
      ],
    },
    {
      title: "SVG and SMIL",
      beats: [
        { t: "say", x: "SVG can animate itself with **SMIL** elements: `<animate>`, `<animateTransform>`, `<animateMotion>`. No script needed, so they run where scripts never do: inside an `<img>`, a CSS background, a README." },
        {
          t: "code",
          lang: "html",
          src: "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 120 40\" width=\"240\" height=\"80\">\n  <circle cx=\"20\" cy=\"20\" r=\"8\" fill=\"#d49a3a\">\n    <animate attributeName=\"cx\" values=\"20;100;20\" dur=\"2s\"\n      calcMode=\"spline\" keyTimes=\"0;.5;1\"\n      keySplines=\".45 0 .55 1;.45 0 .55 1\" repeatCount=\"indefinite\"/>\n  </circle>\n</svg>",
          mark: [4, 5],
          note: "`keySplines` gives each segment its own cubic-bezier. It needs `calcMode=\"spline\"` and exactly one spline per interval of `keyTimes`.",
        },
        {
          t: "play",
          mode: "html",
          title: "same SVG, inline and as an <img>",
          html: `<svg id="art" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 40" width="240" height="80">
  <style>@keyframes pulse { 50% { opacity: .3; } } rect { animation: pulse 1.5s infinite; }</style>
  <circle cx="20" cy="20" r="8" fill="#d49a3a">
    <animate attributeName="cx" values="20;100;20" dur="2s" calcMode="spline"
      keyTimes="0;.5;1" keySplines=".45 0 .55 1;.45 0 .55 1" repeatCount="indefinite"/>
  </circle>
  <rect x="54" y="14" width="12" height="12" fill="#3a8ad4">
    <animateTransform attributeName="transform" type="rotate"
      from="0 60 20" to="360 60 20" dur="3s" repeatCount="indefinite"/>
  </rect>
</svg>
<p>Below: the same markup loaded through an &lt;img&gt;. Still animated.</p>
<img id="img" width="240" height="80" alt="animated dots">`,
          css: `body { font: 14px system-ui; padding: 16px; }
svg, img { border: 1px solid #8884; border-radius: 8px; }`,
          js: `const svg = document.getElementById('art').outerHTML;
document.getElementById('img').src = 'data:image/svg+xml,' + encodeURIComponent(svg);`,
          task: "Add `<animateMotion>` to move a third shape along a curved `path`. Then add a `<script>` inside the SVG and notice it runs inline but never in the <img>.",
        },
        {
          t: "pitfall",
          h: "An SVG in `<img>` is a sealed box",
          x: "No scripts, no hover, no external fonts, images or stylesheets. Everything must live in the file: SMIL, a `<style>` with `@keyframes`, fonts as data URIs or text converted to paths. That sandbox is what makes it safe to show anywhere.",
        },
        {
          t: "quiz",
          q: "Your animated SVG works when opened directly but is frozen in a README's `<img>`. It animates with a `<script>`. Best fix?",
          options: ["Add an `autoplay` attribute", "Rewrite the motion as SMIL or CSS keyframes inside the SVG", "Embed it with `<object>`", "Convert it to a GIF"],
          answer: 1,
          why: "Image contexts never run scripts, but SMIL and in-file CSS animate fine. A GIF works too, but it's huge, 256 colours and blurry on retina. GitHub strips `<object>` from Markdown.",
        },
      ],
    },
    {
      title: "Rebuild: a mini animation engine",
      beats: [
        { t: "say", x: "Every animation library is the same three ideas: **one loop** that owns time, **animations** that step by dt and say when they're done, and **timelines** that start them at offsets. Build all three in 60 lines." },
        {
          t: "rebuild",
          h: "Tween, spring and timeline",
          x: "One rAF loop runs a Set of animations; each has `step(dt)` returning true when finished. The loop sleeps when the set is empty. Press Play, read how the three pieces compose, then extend it.",
          mode: "html",
          html: `<button id="play">Play</button>
<div class="b" id="a">tween</div><div class="b" id="s">spring</div><div class="b" id="c">tween 2</div>`,
          css: `body { font: 600 14px system-ui; padding: 16px; }
.b { width: 80px; padding: 12px 0; margin: 12px 0; text-align: center; border-radius: 8px;
  background: #d49a3a; color: #111; }`,
          js: `const active = new Set();
let last = 0;
function loop(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 20) : 0;
  last = now;
  for (const a of active) if (a.step(dt)) active.delete(a);
  if (active.size) requestAnimationFrame(loop); else last = 0;
}
function run(a) { active.add(a); if (active.size === 1) requestAnimationFrame(loop); return a; }

const ease = {
  linear: (t) => t,
  outCubic: (t) => 1 - (1 - t) ** 3,
  inOutCubic: (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2),
};

function tween({ from, to, duration, easing = ease.outCubic, onUpdate, onDone }) {
  let t = 0;
  return run({ step(dt) {
    t = Math.min(t + dt / duration, 1);
    onUpdate(from + (to - from) * easing(t));
    if (t === 1) { onDone?.(); return true; }
  } });
}

function spring({ from, to, k = 170, zeta = 0.5, onUpdate, onDone }) {
  let x = from, v = 0;
  const c = 2 * zeta * Math.sqrt(k);
  return run({ step(dt) {
    v += (-k * (x - to) - c * v) * dt;
    x += v * dt;
    onUpdate(x);
    if (Math.abs(x - to) < 0.01 && Math.abs(v) < 0.01) { onUpdate(to); onDone?.(); return true; }
  } });
}

function timeline(items) {
  let t = 0;
  const pending = [...items].sort((p, q) => p.at - q.at);
  return run({ step(dt) {
    t += dt;
    while (pending.length && pending[0].at <= t) pending.shift().play();
    return pending.length === 0;
  } });
}

const mover = (id) => (x) => { document.getElementById(id).style.transform = \`translateX(\${x}px)\`; };
let out = true;
document.getElementById('play').onclick = () => {
  const [f, t] = out ? [0, 240] : [240, 0];
  out = !out;
  timeline([
    { at: 0, play: () => tween({ from: f, to: t, duration: 0.5, onUpdate: mover('a') }) },
    { at: 0.15, play: () => spring({ from: f, to: t, onUpdate: mover('s') }) },
    { at: 0.3, play: () => tween({ from: f, to: t, duration: 0.6, easing: ease.inOutCubic, onUpdate: mover('c') }) },
  ]);
};`,
          task: "Make the spring retargetable (a `.to` you can change mid-flight that keeps velocity), then add `pause()` and `seek(t)` to the timeline.",
        },
        {
          t: "mission",
          h: "A card you can fling",
          x: "A card follows the pointer while dragged. On release it springs to the nearest of three slots, starting with the release velocity, so a hard flick overshoots and a gentle drop doesn't. Frame-rate independent. Under reduced motion, it fades into its slot.",
          hint: "Keep the last few pointer positions with timestamps and estimate velocity from them; pass it as the spring's initial `v`. `setPointerCapture` keeps the drag alive outside the card.",
        },
      ],
    },
  ],
  nobodyTells: [
    "If people notice an animation as an animation, it's probably too slow. The good ones are felt, not seen.",
    "When interrupting, always animate from the current value, never from the original `from`. Read what's on screen.",
    "Cap your staggers: delay = min(i × 30 ms, 300 ms), or item 40 arrives after the user has left.",
    "Use the timestamp rAF passes you, not `performance.now()`: every animation in that frame then agrees on the time.",
    "Check motion frame by frame in the DevTools Performance panel with screenshots on. Glitches invisible at speed are obvious one frame at a time.",
    "A 120 Hz phone gives you 8.3 ms per frame, not 16.7. Test there; 60 Hz hides sins.",
    "Springs tuned by k and ζ are portable between tools; springs tuned by 'bounciness' sliders are not. Write down k and ζ.",
  ],
  glossary: [
    ["easing", "A function from time fraction to progress fraction; it decides how motion feels."],
    ["cubic-bezier", "An easing defined by two control points; x is time, y is progress, solved per frame."],
    ["damping ratio ζ", "c / (2√(km)). Below 1 overshoots, 1 is critically damped, above 1 is sluggish."],
    ["semi-implicit Euler", "Update velocity first, then position with the new velocity. Stable for oscillators."],
    ["dt", "Seconds since the last frame. Clamp it; hidden tabs return huge values."],
    ["FLIP", "First, Last, Invert, Play: animate a layout change as a cheap transform."],
    ["compositor", "The thread that assembles layers on the GPU; transform and opacity animate there."],
    ["SMIL", "SVG's built-in animation elements. They run even when the SVG is an image."],
    ["prefers-reduced-motion", "A media query saying movement hurts this user. Replace motion with fades."],
  ],
  explain: "Explain to a friend why `x += (target - x) * 0.1` looks different on a 144 Hz monitor, and how one exponential fixes it.",
};
