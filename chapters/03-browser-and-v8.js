const raw = String.raw;

const IC_PLAY = raw`// Same loop, same data size. Only the number of shapes at one site changes.
function make(shapes, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const o = { x: i };
    o['k' + (i % shapes)] = 1; // a different extra key = a different shape
    out.push(o);
  }
  return out;
}

function time(shapes) {
  const objs = make(shapes, 1 << 16);
  // a fresh function per run, so every run starts with an empty inline cache
  const sum = new Function('objs', 'let s = 0; for (let r = 0; r < 30; r++) for (let i = 0; i < objs.length; i++) s += objs[i].x; return s;');
  sum(objs); // warm-up: collect feedback, get optimized
  const t = performance.now();
  sum(objs);
  return (performance.now() - t).toFixed(1);
}

for (const k of [1, 2, 4, 8, 32]) console.log(String(k).padStart(2), 'shapes:', time(k), 'ms');`;

const SHAPES_REBUILD = raw`// A toy object model: shapes form a trie over insertion order.
class Shape {
  constructor(parent, key) {
    this.keys = parent ? [...parent.keys, key] : [];
    this.transitions = new Map();
    this.id = Shape.count++;
  }
  offset(key) { return this.keys.indexOf(key); } // the slow lookup
  add(key) {
    if (!this.transitions.has(key)) this.transitions.set(key, new Shape(this, key));
    return this.transitions.get(key);
  }
}
Shape.count = 0;
const ROOT = new Shape(null);

function set(o, key, v) {
  let i = o.shape.offset(key);
  if (i < 0) { o.shape = o.shape.add(key); i = o.slots.length; }
  o.slots[i] = v;
}
function make(keys) {
  const o = { shape: ROOT, slots: [] };
  for (const k of keys) set(o, k, k.length);
  return o;
}

// An inline cache for ONE access site: a tiny memo from shape to offset.
function site(key) {
  const cache = [];
  const stats = { hits: 0, misses: 0 };
  function get(o) {
    for (const e of cache) if (e.shape === o.shape) { stats.hits++; return o.slots[e.offset]; }
    stats.misses++;
    const offset = o.shape.offset(key);
    cache.push({ shape: o.shape, offset });
    return offset < 0 ? undefined : o.slots[offset];
  }
  const state = () => ['uninitialized', 'monomorphic'][cache.length] || 'polymorphic';
  return { get, stats, state };
}

const readX = site('x');
const objs = [make(['x', 'y']), make(['x', 'y']), make(['y', 'x']), make(['x', 'y', 'z'])];
for (let r = 0; r < 3; r++) for (const o of objs) readX.get(o);
console.log('shapes created:', Shape.count, '| site:', readX.state(), readX.stats);`;

const SCAVENGE_PLAY = raw`// A toy young generation. Cost = objects copied. Dead objects are never touched.
function scavenge(from, roots) {
  const to = [];
  const forward = new Map(); // from-space index -> to-space index
  const copy = (i) => {
    if (!forward.has(i)) {
      forward.set(i, to.length);
      to.push({ refs: from[i].refs });
    }
    return forward.get(i);
  };
  const newRoots = roots.map(copy);
  // Cheney's trick: to-space itself is the BFS queue
  for (let scan = 0; scan < to.length; scan++) to[scan].refs = to[scan].refs.map(copy);
  return { to, roots: newRoots };
}

function run(n, rootCount) {
  const from = [];
  for (let i = 0; i < n; i++) from.push({ refs: i > 0 && Math.random() < 0.5 ? [i - 1] : [] });
  const roots = Array.from({ length: rootCount }, () => Math.floor(Math.random() * n));
  const t = performance.now();
  const { to } = scavenge(from, roots);
  const ms = (performance.now() - t).toFixed(1);
  console.log(String(n).padStart(6), 'objects,', String(rootCount).padStart(6), 'roots: copied', to.length, 'in', ms, 'ms');
}

run(200000, 200);
run(800000, 200);    // 4x the garbage, same survivors
run(200000, 20000);
run(200000, 100000);`;

export default {
  id: "browser-and-v8",
  n: 3,
  part: "A",
  title: "Inside the browser and V8",
  hook: "V8 bets on the shapes and types your code has shown it. Learn the bet and you can see exactly where you pay for losing it.",
  minutes: 80,
  levels: ["use", "understand", "rebuild"],
  sections: [
    {
      title: "Processes, and the one main thread",
      beats: [
        { t: "say", x: "Chrome is a set of OS processes. The **browser process** owns the UI, navigation and storage. **Renderers** run your pages. A **GPU process** draws, a **network service** talks to sockets. Each can crash without taking the others down." },
        {
          t: "table",
          head: ["Process", "What runs there", "Why it matters to you"],
          rows: [
            ["Browser", "tabs and address bar, navigation, permissions, storage access", "brokers every privileged thing a page asks for"],
            ["Renderer", "Blink and V8: your HTML, CSS and JS, for one site", "a crash shows \"Aw, Snap\" only for that site's tabs and frames"],
            ["GPU", "compositing every tab's frames, GPU raster, WebGL and WebGPU calls", "your pixels reach the screen from here, not from your tab"],
            ["Network service", "DNS, sockets, TLS, the HTTP cache, cookies", "a separate process on desktop: your page never touches a socket"],
          ],
        },
        { t: "say", h: "Site isolation", x: "Since Chrome 67 on desktop, each **site** (scheme plus registrable domain, so `a.shop.test` and `b.shop.test` are one site) gets its own renderer. A cross-site iframe runs in another process, out of reach of your memory, even with a Spectre gadget." },
        {
          t: "predict",
          lang: "text",
          src: "Tab: https://app.shop.test\n  iframe A: https://pay.shop.test/widget\n  iframe B: https://ads.other.test/banner\n\niframe A runs a 300 ms busy loop. Desktop Chrome.",
          q: "What freezes for 300 ms?",
          options: ["Only iframe A", "iframe A and the app page, not B", "All three", "Nothing: every iframe gets its own thread"],
          answer: 1,
          why: "`pay.shop.test` is same-site with the app, so it shares the renderer and its **one main thread**. `ads.other.test` is cross-site: another process, another main thread, and its animations keep running.",
        },
        { t: "say", h: "What the main thread runs", x: "One thread per renderer runs your JS, every event handler, rAF callbacks, HTML parsing, style, layout and paint recording, for **every frame in that process**. Chapter 02 covers the pipeline. Here the point is that all of it queues on one core." },
        {
          t: "table",
          head: ["Work", "Where it runs"],
          rows: [
            ["your JS, event handlers, microtasks, rAF", "renderer main thread"],
            ["HTML parsing, style, layout, paint recording", "renderer main thread"],
            ["scrolling, transform and opacity animations", "compositor thread, so they survive a busy main thread"],
            ["Maglev and TurboFan compiles", "V8 background threads, with a short main-thread finish"],
            ["most GC marking and sweeping", "V8 background threads"],
            ["a Web Worker", "its own thread, with its own V8 isolate and heap"],
            ["sockets, DNS, HTTP cache", "the network service process"],
          ],
        },
        {
          t: "pitfall",
          h: "A same-site popup shares your thread",
          x: "A window from `window.open` to a same-site URL keeps an opener link: it can script your page synchronously, so it lives in your process, on your main thread. Its long tasks are yours. Pass `noopener` when you don't need the handle (`target=_blank` links already imply it).",
        },
        {
          t: "quiz",
          q: "You move `JSON.parse` of a 50 MB string into a Web Worker, then `postMessage` the parsed object back. What did the main thread save?",
          options: ["All of the work", "The parse, but it pays to deserialize the whole object graph on arrival", "Nothing: workers run on the main thread", "Memory: workers share the page's heap"],
          answer: 1,
          why: "A worker is a separate isolate with its own heap, so objects can't be shared. `postMessage` structured-clones them, and the receiving thread rebuilds every object. Keep the data in the worker, or transfer an `ArrayBuffer`.",
        },
      ],
    },
    {
      title: "Four tiers of V8",
      beats: [
        { t: "say", x: "V8 doesn't compile your JS once. It starts cheap and spends compile time only on code that proves hot, betting that the types it has seen so far are the types it will see next." },
        {
          t: "table",
          head: ["Tier", "What it is", "Compile cost", "Code"],
          rows: [
            ["Ignition", "interpreter over compact bytecode; records type feedback", "just parsing and bytecode", "slowest, but starts at once"],
            ["Sparkplug", "baseline compiler: bytecode to machine code in one pass", "tiny", "no interpreter dispatch, no optimization"],
            ["Maglev", "fast optimizing compiler, driven by feedback", "10 to 100x cheaper than TurboFan", "good"],
            ["TurboFan", "top tier: inlining, escape analysis, deep speculation", "expensive, done off-thread", "best"],
          ],
          caption: "Maglev shipped in Chrome 117 (2023), filling the gap between Sparkplug and TurboFan.",
        },
        {
          t: "viz",
          name: "frames",
          props: {
            cols: ["Running", "Feedback vector", "Background thread"],
            frames: [
              { cells: [["Ignition"], [], []], note: "First calls run bytecode. There's no feedback vector yet: V8 allocates one only after a few calls, so run-once code costs no memory for it." },
              { cells: [["Ignition"], ["`r.w`: map M1", "`r.h`: map M1", "`*`: SMI x SMI"], []], note: "Every property load, call and arithmetic op has a slot that records what it actually saw: which shapes, SMI or double, which callee." },
              { cells: [["Sparkplug"], ["`r.w`: map M1", "`r.h`: map M1", "`*`: SMI x SMI"], []], note: "Warm: Sparkplug turns the bytecode into machine code in one pass. Same frame layout, same feedback, no interpreter loop." },
              { cells: [["Sparkplug"], ["`r.w`: map M1", "`r.h`: map M1", "`*`: SMI x SMI"], ["Maglev compiling"]], note: "Hot, after a few hundred calls' worth of work: Maglev compiles off-thread, **speculating** that `r` always has map M1 and both fields are SMIs." },
              { cells: [["Maglev"], ["`r.w`: map M1", "`r.h`: map M1", "`*`: SMI x SMI"], []], note: "The code is now a map check, two loads at fixed offsets and an integer multiply with an overflow check. No lookup at all." },
              { cells: [["Maglev"], ["`r.w`: map M1", "`r.h`: map M1", "`*`: SMI x SMI"], ["TurboFan compiling"]], note: "Still hot after a few thousand calls' worth: TurboFan builds its best code, inlining `area` into its callers." },
              { cells: [["unoptimized"], ["`r.w`: M1, M2", "`r.h`: M1, M2", "`*`: SMI x SMI"], []], note: "A `{ h, w }` object arrives: map M2, the check fails. **Deopt**: V8 rebuilds the unoptimized frame and resumes at the same bytecode. It may reoptimize later." },
            ],
          },
        },
        {
          t: "predict",
          lang: "js",
          src: "function main() {\n  let s = 0;\n  for (let i = 0; i < 1e8; i++) s += i & 7;\n  return s;\n}\nmain(); // called exactly once",
          q: "Does `main` ever run optimized code?",
          options: ["No: tier-up only happens between calls", "Yes: V8 compiles it mid-loop and jumps into the new code", "Only in Node", "Only if it's called a second time"],
          answer: 1,
          why: "Loop back-edges draw from the same budget as calls. When it runs out, V8 compiles optimized code for the loop and switches to it mid-iteration: **on-stack replacement**. `--trace-opt` marks it `OSR`.",
        },
        {
          t: "quiz",
          q: "Which of these is TurboFan least likely to ever compile?",
          options: ["A 5-line helper called 50,000 times during load", "A 2,000-line init function with no loops, called once", "A comparator passed to `sort` on 10^5 items", "A function called once whose loop runs 10^7 times"],
          answer: 1,
          why: "Tier-up is paid for by work done: calls and loop iterations. Run-once code without loops stays in Ignition or Sparkplug, which is right: optimizing it would cost more than running it.",
        },
        {
          t: "pitfall",
          h: "Your microbenchmark measures the best case",
          x: "Calling `f` a million times with one shape measures TurboFan's happiest path. Your app calls it with five shapes, half of it before tier-up. And if the result is never used, the optimizer may delete the work you meant to time. Keep results live and measure in the real app.",
        },
      ],
    },
    {
      title: "Hidden classes",
      beats: [
        { t: "say", x: "A JS object looks like a hash map. V8 stores it like a C struct: a pointer to a **map** (a hidden class, or shape) listing the property names and their offsets, then the values in slots. Objects built the same way share one map." },
        {
          t: "predict",
          lang: "js",
          src: "// node --allow-natives-syntax shapes.js\nfunction P(x, y) { this.x = x; this.y = y; }\nconst a = new P(1, 2);\nconst b = new P(3, 4);\nconst c = { y: 4, x: 3 };\nconst d = new P(5, 6);\nd.z = 7;\nconsole.log(%HaveSameMap(a, b), %HaveSameMap(a, c), %HaveSameMap(a, d));",
          q: "What prints?",
          options: ["true true true", "true false false", "true true false", "false false false"],
          answer: 1,
          why: "Maps form a transition tree keyed by insertion order and origin. `a` and `b` took the same path. `c` is a literal with another order. `d` forked off when `z` arrived late. Same keys don't mean same shape; same history does.",
        },
        {
          t: "viz",
          name: "frames",
          props: {
            cols: ["Transition tree", "Objects"],
            frames: [
              { cells: [["M0: P {}"], []], note: "Every `new P` starts at P's initial map: no properties yet, but room reserved for a few in-object slots." },
              { cells: [["M0: P {}", "M1: +x at slot 0"], ["a: M1"]], note: "`this.x = 1` follows (or creates) the transition M0 to M1. The value goes in slot 0." },
              { cells: [["M0: P {}", "M1: +x at slot 0", "M2: +y at slot 1"], ["a: M2"]], note: "`this.y = 2`: M1 to M2. Now `a` is a map pointer and two slots." },
              { cells: [["M0: P {}", "M1: +x at slot 0", "M2: +y at slot 1"], ["a: M2", "b: M2"]], note: "`b` walks the same path and creates nothing. Every access site that has seen `a` already knows how to read `b`." },
              { cells: [["M0: P {}", "M1: +x at slot 0", "M2: +y at slot 1", "M3: +z, from M2"], ["a: M2", "b: M2", "d: M3"]], note: "`d.z = 7` after construction forks the tree. Code that only saw M2 now has two shapes to handle." },
              { cells: [["M0: P {}", "M1: +x at slot 0", "M2: +y at slot 1", "M3: +z, from M2"], ["a: M2", "b: M2", "d: dictionary"]], note: "`delete d.x` drops `d` out of the tree into **dictionary mode**: a real hash table per object. Reads become hash lookups." },
            ],
          },
        },
        {
          t: "compare",
          a: { label: "shape depends on the data", lang: "js", src: "function user(row) {\n  const u = { id: row.id };\n  if (row.email) u.email = row.email;\n  if (row.admin) u.admin = true;\n  u.name = row.name;\n  return u;\n}" },
          b: { label: "one shape, always", lang: "js", src: "function user(row) {\n  return {\n    id: row.id,\n    email: row.email ?? null,\n    admin: row.admin === true,\n    name: row.name,\n  };\n}" },
          x: "Left makes four shapes from one function, in proportions set by your data. Right makes one. Initialise every field, in the same order, even when the value is `null`.",
        },
        {
          t: "predict",
          lang: "js",
          src: "// node --allow-natives-syntax\nconst a = { x: 1, y: 2 };\nconst b = { x: 1 };\nb.y = 2;\nconsole.log(%HaveSameMap(a, b));",
          q: "Same keys, same order. Same map?",
          options: ["true", "false"],
          answer: 1,
          why: "Each literal gets a map sized for its own properties, so `{x, y}` and `{x}` then `+y` start from different roots. Build the whole object in one literal or one constructor.",
        },
        {
          t: "pitfall",
          h: "Patching a prototype late deopts its users",
          x: "Optimized code that inlined a method depends on the prototype staying as it was. A polyfill or plugin that assigns `Foo.prototype.bar` after startup throws that code away, everywhere, at once. It stays correct, just slower until it reoptimizes. Patch prototypes before anything gets hot.",
        },
      ],
    },
    {
      title: "Inline caches",
      beats: [
        { t: "say", x: "Every `o.x` in your source is a **site** with its own cache. The first time it runs, V8 records the map and the offset. Next time it compares one pointer and loads one slot. That's an inline cache, and it's why shapes matter." },
        {
          t: "table",
          head: ["IC state", "Maps seen at the site", "Cost of `o.x`"],
          rows: [
            ["uninitialized", "0", "never ran; the first run goes to the runtime"],
            ["monomorphic", "1", "one map compare, one load; optimizers inline it"],
            ["polymorphic", "2 to 4", "a short chain of compares; still inlined"],
            ["megamorphic", "5 or more", "a global hash table keyed by (map, name); not inlined, and it stays that way"],
          ],
        },
        {
          t: "predict",
          lang: "js",
          src: "function getX(o) { return o.x; }\nconst objs = [\n  { x: 1 },\n  { x: 1, y: 2 },\n  { y: 2, x: 1 },\n  Object.assign({ x: 1 }, { z: 3 }),\n];\nfor (let i = 0; i < 100; i++) for (const o of objs) getX(o);",
          q: "What state is the inline cache at `o.x` in?",
          options: ["monomorphic", "polymorphic", "megamorphic"],
          answer: 1,
          why: "Four distinct maps: `{x}`, `{x,y}`, `{y,x}` and `{x}` plus `z`. V8 tracks up to four. Add `{ x: 1, w: 2 }` and `node --log-ic` shows the site flip to megamorphic (`N`).",
        },
        {
          t: "play",
          mode: "js",
          title: "one site, many shapes",
          js: IC_PLAY,
          task: "Run it a few times. The numbers are noisy; 1 shape winning isn't. Then replace the `'k' + (i % shapes)` key with a fixed `'k'` and rerun: every row drops to the 1-shape time.",
        },
        {
          t: "pitfall",
          h: "Your backend decides your frontend's shapes",
          x: "`JSON.parse` builds shapes from key order. An API that omits null fields, or emits keys in varying order, turns one type into dozens of shapes, and every site that touches them goes megamorphic. Ask for fixed keys, always present, or normalise once at the boundary.",
        },
        { t: "say", h: "Megamorphic isn't a catastrophe", x: "A megamorphic load is a hash probe: several times slower than a monomorphic one in a tight loop, invisible in a click handler. Fix shapes where the profiler points: loops over 10^5 objects, per-frame code, parsers." },
        {
          t: "quiz",
          q: "A renderer walks a tree of 30 node kinds, one class each, reading `node.type` and `node.children` per node per frame. The profile says those loads are hot. The fix?",
          options: ["One class for every kind, all fields present, with a `type` tag", "Turn `type` into a getter", "`Object.freeze` every node", "Nothing helps: 30 kinds means 30 shapes"],
          answer: 0,
          why: "One constructor with every field initialised keeps each site monomorphic, whatever the node kind. React's fibers are built exactly like this: one `FiberNode` shape with a `tag` field, not a class per component type.",
        },
        {
          t: "rebuild",
          h: "Rebuild: shapes and an inline cache",
          x: "Shapes are a trie over insertion order. An inline cache is a per-site memo from shape to offset. The starter builds both; run it and watch one site go polymorphic on three shapes. Then give it V8's other two states.",
          mode: "js",
          js: SHAPES_REBUILD,
          task: "Cap the cache at 4 and go megamorphic past that: one global Map keyed by `shape.id + ':' + key`. Then add `del(o, key)` that switches the object to dictionary mode: `o.dict = new Map()`, no shape.",
        },
      ],
    },
    {
      title: "Deopts",
      beats: [
        { t: "say", x: "Optimized code is a bet with guards. Each speculation (this map, a SMI here, in bounds, no hole) compiles to a check that jumps to a **deopt** when it fails. V8 rebuilds the unoptimized frame and carries on, correct but slower." },
        {
          t: "code",
          lang: "js",
          file: "deopt.js",
          src: "// node --trace-opt --trace-deopt deopt.js\nfunction area(r) { return r.w * r.h; }\nlet total = 0;\nfor (let i = 0; i < 1e5; i++) total += area({ w: i, h: 2 });\ntotal += area({ h: 2, w: 3 }); // same keys, other order\n\n// trimmed output, Node 22:\n// [marking <JSFunction area> for optimization to TURBOFAN, reason: hot and stable]\n// [compiling method <JSFunction> (target TURBOFAN) OSR]\n// [bailout (kind: deopt-eager, reason: overflow): deoptimizing <JSFunction>]\n// [bailout (kind: deopt-eager, reason: wrong map): deoptimizing <JSFunction area>]",
          mark: [5, 10, 11],
          note: "Two deopts. `overflow`: `total` outgrew the SMI range, so the integer add's guard failed. `wrong map`: the `{ h, w }` object. The nameless function is the top-level loop, optimized by OSR.",
        },
        {
          t: "table",
          head: ["Reason in the trace", "What your code did"],
          rows: [
            ["`wrong map`", "an object with a new shape reached optimized code"],
            ["`not a Smi`, `not a Number`", "a double, string or undefined arrived where only small ints had"],
            ["`overflow`, `minus zero`", "integer math left the SMI range, or produced `-0`"],
            ["`out of bounds`, `hole`", "read past `length`, or hit an empty slot in a holey array"],
            ["`Insufficient type feedback for ...`", "a branch that never ran during warm-up finally ran"],
            ["`wrong call target`", "a call site that always called one function got another"],
            ["`marking dependent code ... for deoptimization`", "a lazy deopt: a prototype or map the code relied on changed elsewhere"],
          ],
        },
        {
          t: "predict",
          lang: "js",
          src: "class Vec {\n  constructor(x) { this.x = x; }\n  len() { return Math.abs(this.x); }\n}\nfunction total(vs) { let s = 0; for (const v of vs) s += v.len(); return s; }\n\nconst vs = Array.from({ length: 1e5 }, (_, i) => new Vec(-i));\nfor (let k = 0; k < 100; k++) total(vs); // hot: len() is inlined\n\nVec.prototype.len = function () { return 1; }; // a plugin patches it\nconsole.log(total(vs));",
          q: "What prints?",
          options: ["4999950000: the inlined old `len` still runs", "100000", "It throws: the method was frozen into the code", "NaN"],
          answer: 1,
          why: "Semantics never change: the new `len` runs, 1 per item. The optimized `total` depended on the old prototype, so V8 discarded it (a **lazy** deopt) and runs unoptimized code until it gets hot again.",
        },
        {
          t: "quiz",
          q: "`add(a, b)` is hot and optimized, and has only ever seen small integers. Which call deopts it?",
          options: ["`add(3, 4)`", "`add(2 ** 20, 1)`", "`add(0.5, 1)`", "A million more calls like `add(1, 2)`"],
          answer: 2,
          why: "`2 ** 20` is still a SMI in Chrome and Node. `0.5` is not, so the SMI guard fails. V8 then reoptimizes with number feedback. One deopt is cheap; it only costs you if it keeps happening.",
        },
        {
          t: "pitfall",
          h: "Optimization folklore expired in 2017",
          x: "\"try/catch kills optimization\", \"avoid `for...of`\", \"closures are slow\": that's Crankshaft, removed in 2017. Today's cliffs are shapes, element kinds and changing types. Distrust any perf tip without a date and a `--trace-deopt` line behind it.",
        },
      ],
    },
    {
      title: "Numbers, arrays and strings",
      beats: [
        { t: "say", x: "Every value V8 stores is one tagged word. Low bit 0: a **SMI**, an integer living inside the word, no allocation. Low bit 1: a pointer. Any other number stored in a field or a mixed array is a pointer to a boxed **HeapNumber**." },
        {
          t: "predict",
          lang: "js",
          src: "// node --allow-natives-syntax\nconsole.log(%IsSmi(2 ** 30), %IsSmi(-0), %IsSmi(3.0));",
          q: "What does **Node** print?",
          options: ["true false true", "false false true", "true true true", "false false false"],
          answer: 0,
          why: "Node builds V8 without pointer compression: 32-bit SMIs. Chrome compresses pointers to 32 bits and keeps **31-bit** SMIs, so there `2 ** 30` is a HeapNumber. `-0` is never a SMI; `3.0` is just 3.",
        },
        {
          t: "table",
          head: ["Elements kind", "Backing store", "You get it from"],
          rows: [
            ["`PACKED_SMI_ELEMENTS`", "small ints, as SMIs", "`[1, 2, 3]`, pushing ints onto `[]`"],
            ["`PACKED_DOUBLE_ELEMENTS`", "raw unboxed 64-bit doubles", "one `1.5`, `NaN` or `-0` in a SMI array"],
            ["`PACKED_ELEMENTS`", "tagged pointers to anything", "one string, object, `null` or `undefined`"],
            ["`HOLEY_*`", "the same, plus a hole marker", "`new Array(n)`, `[1, , 3]`, `delete a[i]`, writing past the end"],
            ["`DICTIONARY_ELEMENTS`", "a hash table from index to value", "`a[1e6] = 1` on a short array"],
          ],
          caption: "Transitions only go down this list, and from packed to holey. Never back.",
        },
        {
          t: "predict",
          lang: "js",
          src: "const a = new Array(3).fill(0);\nconst b = [0, 0, 0];\nb.push(1.5);\nb.pop();",
          q: "Which kinds do `a` and `b` end up with?",
          options: ["a PACKED_SMI, b PACKED_SMI", "a HOLEY_SMI, b PACKED_DOUBLE", "a PACKED_SMI, b PACKED_DOUBLE", "a HOLEY_SMI, b PACKED_SMI"],
          answer: 1,
          why: "`new Array(3)` starts holey, and filling every slot doesn't clear the flag. `b` became doubles for one element and stays doubles after `pop`: transitions are one-way. Check with `%HasHoleyElements` and friends.",
        },
        {
          t: "compare",
          a: { label: "one null boxes every number", lang: "js", src: "const xs = [0.5, 1.5, 2.5];\nxs.push(null); // PACKED_ELEMENTS:\n               // each double is now its own heap box" },
          b: { label: "a kind that can't change", lang: "js", src: "const xs = new Float64Array(n); // raw doubles, fixed\nxs.fill(NaN);                    // NaN as the \"empty\" marker" },
          x: "Holey versus packed is a small tax. The real cliff is numbers in a generic array: a pointer chase per read, an allocation per write. Use `NaN` as the sentinel, or a typed array.",
        },
        { t: "say", h: "Strings have shapes too", x: "A string is flat (one byte per char if all Latin-1, else two), a **cons** rope made by `+`, or a **sliced** view into a parent. One character outside Latin-1, an emoji or a `—`, and the whole flat string costs 2 bytes per char." },
        {
          t: "predict",
          lang: "js",
          src: "let page = await (await fetch('/huge')).text(); // 50 MB of HTML\nconst start = page.indexOf('<title>') + 7;\nconst title = page.slice(start, page.indexOf('</title>')); // 40 chars\npage = null;\n// ...a full GC runs",
          q: "How much memory does `title` keep alive?",
          options: ["About 80 bytes", "About 50 MB", "About 40 KB", "Nothing extra: strings are values"],
          answer: 1,
          why: "A slice of 13 or more characters is a **SlicedString**: a pointer into its parent, which stays alive in full. `split` pieces and regex matches do the same. Cut the link with a copy, e.g. `(' ' + title).slice(1)`.",
        },
        {
          t: "pitfall",
          h: "Your benchmark ran in Node",
          x: "Node's V8 is built without pointer compression: 32-bit SMIs and 8-byte pointers, so objects are bigger and integers between 2^30 and 2^31 stay SMIs. Memory numbers and some integer code differ from Chrome. Profile browser code in the browser.",
        },
      ],
    },
    {
      title: "The garbage collector",
      beats: [
        { t: "say", x: "V8's heap is **generational** because most objects die young: the temp array in a `map`, the closure passed to `then`. New objects go to a small young space; survivors move to a big old space that's collected differently." },
        {
          t: "viz",
          name: "frames",
          props: {
            cols: ["From-space (young)", "To-space (young)", "Old space"],
            frames: [
              { cells: [["A", "b", "c", "D", "e", "f"], [], ["O"]], note: "Young space is full. Allocation was a pointer bump each. The stack points at A; the old object O points at D." },
              { cells: [["b", "c", "e", "f"], ["A", "D"], ["O"]], note: "**Scavenge**: start from the roots plus the remembered set of old-to-young pointers the write barrier logged. Copy what they reach, fix the pointers." },
              { cells: [[], ["A", "D"], ["O"]], note: "b, c, e and f were never touched. A scavenge costs O(survivors), not O(allocated): dead objects are free. Then the two spaces swap roles." },
              { cells: [["A", "D", "g", "h", "i"], [], ["O"]], note: "JS keeps allocating after the survivors, until the space fills again." },
              { cells: [["g", "h", "i"], ["h"], ["O", "A", "D"]], note: "A and D survive again, so they're **promoted**. Old space is only cleaned by the major GC, so every promotion bets the object will live long." },
            ],
          },
        },
        {
          t: "play",
          mode: "js",
          title: "a copying collector in 15 lines",
          js: SCAVENGE_PLAY,
          task: "Compare the first two rows: 4x the garbage, same cost. Then change the `0.5` link chance to `1`, so each object points at the previous one, and watch 200 roots keep nearly everything alive.",
        },
        {
          t: "table",
          head: ["Collector", "Collects", "Main-thread cost"],
          rows: [
            ["Scavenger (minor GC)", "the young space", "short pauses, parallel on several cores; scales with live young objects"],
            ["Mark-compact (major GC)", "the whole heap", "marking mostly concurrent, then a short final pause; sweeping concurrent"],
            ["Write barrier", "nothing: it runs on your stores", "a few instructions per pointer store into an object"],
          ],
        },
        {
          t: "predict",
          lang: "js",
          src: "const ring = new Array(1e6).fill(null);\nfor (let i = 0; i < 1e7; i++) {\n  const p = { x: i, y: i + 1 };\n  ring[i % 1e6] = p;     // (b) keep the last million\n  // (a) same loop without this line\n}",
          q: "Same allocations. Which version is harder on the GC?",
          options: ["(a): it throws everything away", "(b): its objects live just long enough to be copied and promoted", "The same: GC cost follows allocation count", "Neither: V8 doesn't GC small objects"],
          answer: 1,
          why: "Dead young objects are free, and in (a) escape analysis may skip the allocation entirely. In (b) each object survives scavenges, gets copied, promoted, and needs a major GC to die. `--trace-gc` on Node 22: 3 scavenges vs 53.",
        },
        {
          t: "pitfall",
          h: "A big cache makes every major GC slower",
          x: "Marking visits every live object in old space. A cache of 3 million small objects gets marked on every major GC, concurrent or not, forever. Bound caches with an LRU, and keep bulk numeric data in typed arrays: one object to mark instead of a million.",
        },
        { t: "say", h: "Seeing the GC", x: "The Performance panel shows **Minor GC** and **Major GC** slices on the main thread. `node --trace-gc` prints one line per collection with pause and heap size. Many scavenges: you allocate too much. Long major GCs: you keep too much." },
      ],
    },
    {
      title: "Leaks, and hunting them",
      beats: [
        { t: "say", x: "A garbage-collected program doesn't leak memory in the C sense. It leaks **reachability**: some path from a root (a global, the timer list, a listener on `window`) still leads to data you think is gone." },
        {
          t: "predict",
          lang: "js",
          src: "function makeHandler() {\n  const big = new Array(1e6).fill(0); // 8 MB\n  const id = 7;\n  const debug = () => big.length;     // never called, never returned\n  return () => id;\n}\nconst handlers = [];\nfor (let i = 0; i < 20; i++) handlers.push(makeHandler());",
          q: "After a full GC, what do the 20 handlers retain?",
          options: ["Almost nothing: each keeps only `id`", "About 160 MB", "About 8 MB: the arrays are shared", "Depends on whether `debug` got optimized away"],
          answer: 1,
          why: "Closures made in one call share **one context** holding every variable any of them captures. `debug` captures `big`, so the handler you kept holds it too. Node 22 measures 160 MB. Move `big` into its own function.",
        },
        {
          t: "table",
          head: ["Leak", "The path keeping it alive", "Fix"],
          rows: [
            ["shared closure context", "kept closure -> context -> `big`", "don't create big things beside long-lived closures"],
            ["detached DOM", "array, Map or closure -> removed node -> its whole tree", "drop references on removal; `WeakMap` for per-node data"],
            ["listener on a long-lived target", "`window` -> listener -> component state", "an `AbortController` signal per component"],
            ["timer", "timer list -> interval callback -> its closure", "`clearInterval` in teardown"],
            ["unbounded cache", "module-level Map -> every entry, forever", "an LRU bound, or a `WeakMap` keyed by the owner"],
          ],
        },
        {
          t: "compare",
          a: { label: "leaks after every unmount", lang: "js", src: "function mount(el, state) {\n  window.addEventListener('resize', () => layout(el, state));\n  setInterval(() => poll(state), 1000);\n}" },
          b: { label: "returns its own teardown", lang: "js", src: "function mount(el, state) {\n  const ac = new AbortController();\n  window.addEventListener('resize', () => layout(el, state), { signal: ac.signal });\n  const t = setInterval(() => poll(state), 1000);\n  return () => { ac.abort(); clearInterval(t); };\n}" },
          x: "`window` and the timer list are roots. Whatever their callbacks close over, `el` and `state` included, lives until you remove them. Removing `el` from the page changes nothing.",
        },
        {
          t: "pitfall",
          h: "One <td> holds the whole table",
          x: "A detached node keeps its parent pointer, so one reference to one cell retains the entire removed tree, every sibling, and every closure their listeners hold. In a heap snapshot, type `Detached` in the class filter, then follow the retainers up to your JS reference.",
        },
        {
          t: "quiz",
          q: "You cache per-node data in a `WeakMap`, and the value object holds a reference back to its node. The node is removed and you drop every other reference. What happens?",
          options: ["The entry leaks: the value keeps the key alive", "Key and value are both collected", "The value is collected, the node stays", "`WeakMap` throws on cyclic values"],
          answer: 1,
          why: "WeakMap entries are **ephemerons**: the value counts as live only if the key is reachable from elsewhere. A value pointing back at its key doesn't count. This is why you can't iterate a WeakMap.",
        },
        {
          t: "steps",
          h: "The three-snapshot hunt",
          items: [
            "Do the action once to warm caches and lazy code. Take snapshot 1 in the Memory panel.",
            "Do it N times, say 10 (open and close the dialog). Take snapshot 2.",
            "Do it N more times. Take snapshot 3. Each snapshot runs a full GC first, so only reachable objects appear.",
            "In snapshot 3, show only objects allocated between snapshots 1 and 2. Whatever survived N more rounds is the leak.",
            "Sort by retained size. Look for counts that are multiples of N: 10 dialogs, 10 detached trees, 10 closures.",
            "Select one and walk the Retainers pane toward the root. The first thing you wrote on that path is the bug.",
          ],
        },
        { t: "say", h: "Shallow vs retained", x: "Shallow size is the object itself. **Retained size** is what the GC would free if it went: its subtree in the heap's **dominator tree**. A 64-byte closure retaining 200 MB is your leak. A 50 MB array retaining 50 MB is just data." },
        {
          t: "pitfall",
          h: "The console keeps what you log",
          x: "Anything you `console.log` or evaluate in DevTools can stay reachable from the console, so the object you're hunting survives because you looked at it. Clear the console before each snapshot, and check the \"Objects retained by the DevTools console\" filter.",
        },
        {
          t: "mission",
          h: "Plant three leaks, then find them",
          x: "Build a page whose button opens a modal that adds a `resize` listener on `window`, starts a 1 s interval, and pushes its root node into a module-level array. Closing removes the node. Open and close it 10 times, find all three leaks with three snapshots, then fix each.",
          hint: "Name your callbacks (`function onResize() {}`): snapshots list closures by function name. Filter by `Detached` for the DOM. Counts of 10 are your leaks.",
          solution: {
            lang: "js",
            src: "function openModal() {\n  const el = document.createElement('div');\n  el.className = 'modal';\n  document.body.append(el);\n  const ac = new AbortController();\n  window.addEventListener('resize', function onResize() { layout(el); }, { signal: ac.signal });\n  const t = setInterval(function tick() { el.textContent = new Date().toLocaleTimeString(); }, 1000);\n  return function close() {\n    ac.abort();       // listener gone\n    clearInterval(t); // timer gone\n    el.remove();      // and no module-level array holds it\n  };\n}",
          },
        },
      ],
    },
  ],
  nobodyTells: [
    "A function's first few calls collect no type feedback at all: V8 allocates the feedback vector lazily, after it has run a few times.",
    "Closures from the same function literal share inline caches. A `makeGetter()` used on two types makes every getter it returns polymorphic.",
    "Chrome has 31-bit SMIs, Node has 32-bit. Integer code between 2^30 and 2^31 behaves differently in the two.",
    "`node --allow-natives-syntax` gives you `%HaveSameMap` and `%HasFastProperties`: answer shape questions in seconds instead of guessing.",
    "A heap snapshot runs a full GC first. If memory drops after taking one, you didn't have a leak, you had garbage.",
    "`slice`, `substring`, `split` and regex matches of 13+ characters point into their parent. Keep one field of a huge response and you keep the response.",
    "A widget served from your own subdomain shares your main thread. The same widget served from another site runs in parallel, on desktop.",
    "Build objects in one literal or one constructor, every field present, same order. That habit fixes most shape problems before they exist.",
  ],
  glossary: [
    ["renderer process", "The sandboxed process running Blink and V8 for one site's documents and frames."],
    ["site isolation", "Putting each site (scheme plus registrable domain) in its own renderer process."],
    ["Ignition", "V8's bytecode interpreter; the first tier, and where type feedback is collected."],
    ["Sparkplug", "V8's baseline compiler: bytecode to machine code in one fast, non-optimizing pass."],
    ["Maglev", "V8's mid-tier optimizing compiler: fast to compile, uses feedback to speculate."],
    ["TurboFan", "V8's top-tier optimizing compiler, for code that stays hot."],
    ["feedback vector", "Per-function slots recording the shapes and types each operation has actually seen."],
    ["map (hidden class)", "V8's description of an object's layout: property names, offsets and prototype."],
    ["inline cache", "A per-site memo from map to property offset. Mono, poly (2 to 4) or megamorphic."],
    ["deopt", "Leaving optimized code for unoptimized code when a speculation guard fails."],
    ["OSR", "On-stack replacement: switching a running loop into freshly optimized code."],
    ["SMI", "A small integer stored inside a tagged word, with no heap allocation."],
    ["elements kind", "How an array's backing store is typed: SMI, double or generic, packed or holey."],
    ["scavenger", "V8's young-generation copying collector; its cost scales with survivors."],
    ["retained size", "Memory freed if an object were collected: its subtree in the dominator tree."],
  ],
  explain: "Explain to a friend why passing `{ x, y }` and `{ y, x }` to the same function can make it several times slower, from hidden classes to inline caches to what happens when a guard fails.",
};
