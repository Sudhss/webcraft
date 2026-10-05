/* Shared by every coding beat: the reader's code goes first, the tests below it. */
const TESTS = `// ---- tests: run, read the FAIL lines, fix the code above ----
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const eq = (got, want) => {
  const show = (v) => JSON.stringify(v, (k, x) => (x === undefined ? "undefined" : x));
  const g = show(got), w = show(want);
  if (g !== w) throw new Error("expected " + w + ", got " + g);
};
const ok = (cond, msg) => { if (!cond) throw new Error(msg); };
async function run(tests) {
  let n = 0;
  for (const [name, fn] of Object.entries(tests)) {
    try { await fn(); n++; console.log("pass  " + name); }
    catch (e) { console.log("FAIL  " + name + ": " + e.message); }
  }
  console.log(n + "/" + Object.keys(tests).length + " passing");
}
`;

const DEBOUNCE = `function debounce(fn, ms) {
  // TODO: wait until calls stop for ms, then call fn ONCE
  // with the last arguments and the original this.
  const debounced = function (...args) {
    return fn.apply(this, args); // calls straight through: wrong
  };
  debounced.cancel = () => {}; // TODO: drop the pending call
  return debounced;
}

${TESTS}
run({
  "one call after the burst, with the last args": async () => {
    const calls = [];
    const d = debounce((x) => calls.push(x), 30);
    d(1); d(2); d(3);
    eq(calls, []);
    await sleep(70);
    eq(calls, [3]);
  },
  "each call restarts the wait": async () => {
    const calls = [];
    const d = debounce((x) => calls.push(x), 50);
    d(1); await sleep(30);
    d(2); await sleep(30);
    eq(calls, []);
    await sleep(50);
    eq(calls, [2]);
  },
  "keeps this": async () => {
    let seen;
    const obj = { n: 7, f: debounce(function () { seen = this.n; }, 10) };
    obj.f();
    eq(seen, undefined);
    await sleep(40);
    eq(seen, 7);
  },
  "cancel() drops the pending call": async () => {
    const calls = [];
    const d = debounce((x) => calls.push(x), 20);
    d(1); d.cancel();
    await sleep(50);
    eq(calls, []);
  },
});`;

const THROTTLE = `function throttle(fn, ms) {
  // TODO: run the first call now. Calls inside the next ms collapse
  // into ONE trailing call with the latest args, at the window's end.
  return () => {}; // drops every call: wrong
}

${TESTS}
run({
  "the first call runs immediately": async () => {
    const calls = [];
    const t = throttle((x) => calls.push(x), 50);
    t(1);
    eq(calls, [1]);
  },
  "a burst becomes leading + one trailing call": async () => {
    const calls = [];
    const t = throttle((x) => calls.push(x), 50);
    t(1); t(2); t(3);
    eq(calls, [1]);
    await sleep(90);
    eq(calls, [1, 3]);
  },
  "never two calls closer than ms apart": async () => {
    const at = [];
    const t = throttle(() => at.push(Date.now()), 50);
    for (let i = 0; i < 12; i++) { t(); await sleep(10); }
    await sleep(80);
    ok(at.length >= 2, "expected at least 2 calls, got " + at.length);
    const gaps = at.slice(1).map((x, i) => x - at[i]);
    ok(gaps.every((g) => g >= 40), "gaps were " + gaps.join(", ") + " ms");
  },
});`;

const PROMISE_ALL = `function promiseAll(iterable) {
  // TODO: resolve with values in INPUT order once all fulfil,
  // reject with the first error, handle [] and plain values.
  return Promise.reject(new Error("promiseAll is not implemented yet"));
}

${TESTS}
const delay = (ms, v) => new Promise((r) => setTimeout(() => r(v), ms));
run({
  "input order, not finish order": async () => {
    eq(await promiseAll([delay(40, "a"), delay(10, "b"), "c"]), ["a", "b", "c"]);
  },
  "plain values pass through": async () => {
    eq(await promiseAll([1, Promise.resolve(2)]), [1, 2]);
  },
  "rejects with the first error, without waiting": async () => {
    const t0 = Date.now();
    let err;
    const boom = delay(20).then(() => { throw new Error("boom"); });
    boom.catch(() => {}); // only so an unfinished promiseAll leaves no unhandled rejection
    try { await promiseAll([delay(300, "slow"), boom]); } catch (e) { err = e; }
    eq(err && err.message, "boom");
    ok(Date.now() - t0 < 200, "it waited for the slow one");
  },
  "empty input resolves to []": async () => {
    eq(await promiseAll([]), []);
  },
  "takes any iterable": async () => {
    eq(await promiseAll(new Set([1, delay(5, 2)])), [1, 2]);
  },
});`;

const DEEP_CLONE = `function deepClone(v) {
  // TODO: copy every level. Keep arrays, Dates and Maps as what they are.
  // Cycles and shared references must come out the same shape.
  return { ...v }; // shallow: wrong
}

${TESTS}
run({
  "nested objects are copies": () => {
    const a = { x: { y: 1 } };
    const b = deepClone(a);
    b.x.y = 2;
    eq(a.x.y, 1);
  },
  "arrays stay arrays": () => {
    const src = [1, [2]];
    const b = deepClone(src);
    ok(Array.isArray(b) && Array.isArray(b[1]) && b[1] !== src[1], "lost array-ness or shared the inner array");
  },
  "Dates and Maps are new and keep their type": () => {
    const src = { d: new Date(0), m: new Map([["k", { v: 1 }]]) };
    const b = deepClone(src);
    ok(b.d instanceof Date && b.d !== src.d && b.d.getTime() === 0, "Date not copied");
    ok(b.m instanceof Map && b.m !== src.m && b.m.get("k").v === 1, "Map not copied");
    ok(b.m.get("k") !== src.m.get("k"), "Map values are shared");
  },
  "cycles point at the copy": () => {
    const a = { name: "a" };
    a.self = a;
    const b = deepClone(a);
    ok(b.self === b, "b.self should be b, not the original");
  },
  "shared references stay shared": () => {
    const s = { n: 1 };
    const b = deepClone({ p: s, q: s });
    ok(b.p === b.q && b.p !== s, "expected one new object used twice");
  },
});`;

const CURRY = `function curry(fn) {
  // TODO: collect arguments across calls until there are fn.length of them,
  // then call fn with them (and with the this of the final call).
  return fn;
}

${TESTS}
const add3 = curry((a, b, c) => a + b + c);
run({
  "every split gives the same answer": () => {
    eq([add3(1)(2)(3), add3(1, 2)(3), add3(1)(2, 3), add3(1, 2, 3)], [6, 6, 6, 6]);
  },
  "partials are reusable": () => {
    const add1 = add3(1);
    eq([add1(2)(3), add1(10, 10)], [6, 21]);
  },
  "keeps this for methods": () => {
    const obj = { base: 10, add: curry(function (a, b) { return this.base + a + b; }) };
    eq(obj.add(1)(2), 13);
  },
});`;

const EMITTER = `class Emitter {
  constructor() { this.events = new Map(); } // name -> [listeners]
  on(name, fn) { /* TODO */ return this; }
  off(name, fn) { /* TODO: must also remove a once() listener by its original fn */ return this; }
  once(name, fn) { /* TODO */ return this; }
  emit(name, ...args) { /* TODO: return true if anyone listened */ return false; }
}

${TESTS}
run({
  "on + emit passes the arguments": () => {
    const e = new Emitter(), got = [];
    e.on("msg", (a, b) => got.push(a + b));
    e.emit("msg", 2, 3);
    eq(got, [5]);
  },
  "once fires once, and off(fn) can cancel it": () => {
    const e = new Emitter(), got = [];
    const f = (x) => got.push(x);
    e.once("a", f);
    e.emit("a", 1); e.emit("a", 2);
    const g = () => got.push("never");
    e.once("b", g).off("b", g).emit("b");
    eq(got, [1]);
  },
  "emit returns whether anyone listened": () => {
    const e = new Emitter();
    e.on("y", () => {});
    eq([e.emit("nobody"), e.emit("y")], [false, true]);
  },
  "a listener removing itself doesn't skip the next": () => {
    const e = new Emitter(), log = [];
    const a = () => { log.push("a"); e.off("t", a); };
    e.on("t", a).on("t", () => log.push("b"));
    e.emit("t");
    eq(log, ["a", "b"]);
  },
});`;

const LRU = `class LRU {
  constructor(capacity) {
    this.capacity = capacity;
    this.map = new Map(); // iterates oldest -> newest
  }
  get(key) {
    return this.map.get(key); // TODO: a read makes key the newest
  }
  set(key, value) {
    this.map.set(key, value); // TODO: refresh, and evict the oldest when over capacity
  }
}

${TESTS}
run({
  "evicts the least recently used": () => {
    const c = new LRU(2);
    c.set("a", 1); c.set("b", 2); c.set("c", 3);
    eq([c.get("a"), c.get("b"), c.get("c")], [undefined, 2, 3]);
  },
  "get() refreshes recency": () => {
    const c = new LRU(2);
    c.set("a", 1); c.set("b", 2);
    c.get("a");
    c.set("c", 3);
    eq([c.get("a"), c.get("b")], [1, undefined]);
  },
  "set() on an existing key updates and refreshes": () => {
    const c = new LRU(2);
    c.set("a", 1); c.set("b", 2); c.set("a", 10); c.set("c", 3);
    eq([c.get("a"), c.get("b")], [10, undefined]);
  },
  "size never exceeds capacity": () => {
    const c = new LRU(3);
    for (let i = 0; i < 100; i++) c.set(i, i);
    eq(c.map.size, 3);
  },
});`;

const SEARCH = `function createSearch(fetcher, render) {
  // TODO 1: cache by query. Cache the PROMISE, so in-flight duplicates share it.
  // TODO 2: only the latest search() may call render.
  return async function search(q) {
    const results = await fetcher(q);
    render(q, results);
  };
}

${TESTS}
const LATENCY = { a: 60 }; // "a" is slow, everything else takes 10 ms
function setup() {
  const fetcher = (q) => {
    fetcher.calls++;
    return new Promise((r) => setTimeout(() => r([q + "1", q + "2"]), LATENCY[q] || 10));
  };
  fetcher.calls = 0;
  const shown = [];
  return { fetcher, shown, search: createSearch(fetcher, (q) => shown.push(q)) };
}
run({
  "a slow old reply never replaces a newer one": async () => {
    const { shown, search } = setup();
    search("a"); search("ab");
    await sleep(100);
    eq(shown, ["ab"]);
  },
  "a repeated query hits the cache": async () => {
    const { fetcher, search } = setup();
    search("x"); await sleep(30);
    search("x"); await sleep(30);
    eq(fetcher.calls, 1);
  },
  "duplicate in-flight queries share one request": async () => {
    const { fetcher, search } = setup();
    search("q"); search("q");
    await sleep(30);
    eq(fetcher.calls, 1);
  },
  "a cached answer beats a slower pending one": async () => {
    const { shown, search } = setup();
    search("x"); await sleep(30);
    search("a"); search("x");
    await sleep(100);
    eq(shown, ["x", "x"]);
  },
});`;

const LIMITER = `function createLimiter({ capacity, refillPerSec, now = Date.now }) {
  // TODO: token bucket. Start full. Each allow() spends one token if there is one.
  // Tokens refill continuously at refillPerSec, never above capacity.
  return { allow: () => true };
}

${TESTS}
let t = 0;
const clock = () => t; // fake time: the tests move it by hand
run({
  "bursts up to capacity, then refuses": () => {
    t = 0;
    const l = createLimiter({ capacity: 3, refillPerSec: 2, now: clock });
    eq([l.allow(), l.allow(), l.allow(), l.allow()], [true, true, true, false]);
  },
  "refills continuously": () => {
    t = 0;
    const l = createLimiter({ capacity: 3, refillPerSec: 2, now: clock });
    l.allow(); l.allow(); l.allow();
    t += 500; // half a second at 2/s = 1 token
    eq([l.allow(), l.allow()], [true, false]);
  },
  "idle time can't bank more than capacity": () => {
    t = 0;
    const l = createLimiter({ capacity: 3, refillPerSec: 2, now: clock });
    t += 60000;
    const r = [];
    for (let i = 0; i < 5; i++) r.push(l.allow());
    eq(r, [true, true, true, false, false]);
  },
});`;

export default {
  id: "interviews",
  n: 50,
  part: "I",
  title: "Interview questions, answered",
  hook: "The questions strong candidates get at big tech, answered the way a senior answers them, with code that runs against tests.",
  minutes: 120,
  levels: ["use", "understand", "rebuild"],
  sections: [
    {
      title: "What actually gets graded",
      beats: [
        { t: "say", h: "The question is a vehicle", x: "Nobody in a big-tech loop needs to learn what a closure is from you. The question carries four signals: do you clarify, reason from mechanism, weigh tradeoffs, and check your own work out loud." },
        {
          t: "table",
          caption: "Roughly what lands on the interviewer's notes. The middle column is the sentence they want to write down.",
          head: ["Signal", "Sounds like", "Loses it"],
          rows: [
            ["Clarifying", "\"Leading or trailing edge? Do we need cancel?\"", "Typing code five seconds in"],
            ["Mechanism", "\"Microtasks drain before the next task, so C beats B.\"", "\"Promises are faster than timeouts.\""],
            ["Tradeoffs", "\"Index keys are fine for a static list, wrong once rows reorder.\"", "One answer, no conditions"],
            ["Verification", "Traces a test through the code, then names edge cases", "\"I think that works.\""],
            ["Communication", "States the plan, then writes code that matches it", "Silence, then a wall of code"],
            ["Scope", "\"For v1 I'd skip X; here's when I'd add it.\"", "Designing for a billion users unprompted"],
          ],
        },
        {
          t: "steps",
          h: "One shape for every answer",
          items: [
            "Restate the question and pin the constraints: inputs, scale, browsers, what done means.",
            "Answer in one sentence first, so the interviewer knows where you're going.",
            "Go one level down to the mechanism: the queue, the algorithm, the header.",
            "Name the tradeoff, and the condition under which your answer stops being right.",
            "For code: say the plan, write it, trace one example by hand, list edge cases, give the complexity.",
            "Stop, and offer depth. Talking past the answer costs points.",
          ],
        },
        {
          t: "pitfall",
          h: "The textbook definition",
          x: "\"A closure is a function that remembers its lexical scope\" is true and earns nothing, because everyone says it. Follow it with a bug it causes (a stale value in a timer or a hook) and the fix. Definition plus consequence is the senior answer.",
        },
        {
          t: "quiz",
          q: "\"Cookie or localStorage for the session token?\" Which answer scores highest?",
          options: [
            "localStorage: cookies are old and size-limited",
            "A cookie, because cookies are more secure",
            "An `HttpOnly`, `Secure`, `SameSite` cookie: script can't read it, so XSS can't steal it. That opens CSRF, which SameSite plus a token closes. localStorage is readable by any injected script.",
            "Either, as long as it's a JWT",
          ],
          answer: 2,
          why: "It answers, gives the mechanism (HttpOnly hides it from JS), names the cost it creates (CSRF) and how that cost is paid. The bare \"cookies are more secure\" picks right with no reason, which reads as memorised.",
        },
      ],
    },
    {
      title: "JavaScript: say what it prints",
      beats: [
        {
          t: "predict",
          lang: "js",
          src: `console.log("A");
setTimeout(() => console.log("B"), 0);
Promise.resolve().then(() => console.log("C"));
(async () => {
  console.log("D");
  await null;
  console.log("E");
})();
queueMicrotask(() => console.log("F"));
console.log("G");`,
          q: "Order?",
          options: ["A D G C E F B", "A G D C E F B", "A D G C F E B", "A D G B C E F"],
          answer: 0,
          why: "Sync first: A, D (an async function runs synchronously up to its first `await`), G. Then microtasks in the order they were queued: C, E, F. B is a task, so it waits for all of them.",
        },
        { t: "say", x: "The narration that scores: run the script to completion, drain **every** microtask (including ones queued during the drain), take one task, maybe render, repeat. *JavaScript II: async and the event loop* steps through it frame by frame." },
        {
          t: "predict",
          lang: "js",
          src: `const fns = [];
for (let i = 0; i < 3; i++) {
  fns.push(() => i);
  i++;
}
console.log(fns.map((f) => f()));`,
          q: "What prints?",
          options: ["[0, 1]", "[1, 3]", "[0, 2]", "[3, 3]"],
          answer: 1,
          why: "`let` gives each iteration a fresh binding, copied from the previous one before the loop's `i++`. The `i++` in the body mutates that iteration's binding, and the closure sees it: 1. The next starts at 2 and becomes 3. Closures hold variables, not values.",
        },
        {
          t: "predict",
          lang: "js",
          src: `class Counter {
  n = 0;
  inc() { return ++this.n; }
}
const c = new Counter();
console.log([1, 2].map(c.inc));`,
          q: "What happens?",
          options: ["[1, 2]", "[NaN, NaN]", "TypeError: Cannot read properties of undefined", "[1, 1]"],
          answer: 2,
          why: "`c.inc` passes the function, not the object. `map` calls it plainly, and class bodies are strict, so `this` is `undefined`. The same method in a sloppy-mode script would hit `globalThis` and give `[NaN, NaN]`.",
        },
        {
          t: "table",
          caption: "`this` is set by the call, not by where the function was written.",
          head: ["Call", "`this` is"],
          rows: [
            ["`obj.f()`", "`obj`"],
            ["`f()`", "`undefined` in strict code and classes, `globalThis` in sloppy scripts"],
            ["`new F()`", "the new object"],
            ["`f.call(x)`, `f.apply(x)`", "`x`"],
            ["`f.bind(x)()`", "`x`, and a later `call` or second `bind` can't change it"],
            ["an arrow function", "whatever `this` is in the enclosing scope; `call` and `bind` can't change it"],
          ],
        },
        {
          t: "pitfall",
          h: "\"Arrow functions bind this\"",
          x: "They bind nothing. An arrow has no `this` of its own, so the name resolves outward like any variable. That's why `call` can't change it, and why an arrow as an object-literal method sees the outer `this`, not the object. *JavaScript I: the real parts* has more.",
        },
      ],
    },
    {
      title: "Implement it: timers and promises",
      beats: [
        { t: "say", x: "Coding rounds grade the contract before the code. For debounce, ask out loud: trailing or leading edge? Keep `this` and the latest arguments? Need `cancel()`? A return value? Asking is part of what's graded." },
        {
          t: "rebuild",
          h: "Debounce, with tests",
          x: "The starter calls `fn` straight through, so the tests fail. Make it wait until calls stop for `ms`, then call `fn` once with the last arguments and the original `this`, and add `cancel()`. Run until 4/4.",
          mode: "js",
          js: DEBOUNCE,
          task: "Then add `{ leading: true }`: fire on the first call of a burst and not again until the burst ends. Write its test first.",
        },
        {
          t: "play",
          mode: "js",
          title: "throttle, leading and trailing",
          js: THROTTLE,
          task: "Get 3/3. The trailing call is why a throttled scroll handler sees the final position: drop it and the last frame is stale.",
        },
        {
          t: "pitfall",
          h: "\"I think that works\"",
          x: "Saying it instead of tracing a test is how a correct solution still scores a lean no. Pick a three-call input, walk the timers out loud, then name the edge cases you didn't handle. Finding your own bug counts for you, not against you.",
        },
        {
          t: "rebuild",
          h: "Promise.all from scratch",
          x: "Three things are graded: results in input order, rejection on the first failure without waiting for the rest, and the edges (empty input, plain values). Count fulfilled results into indexed slots; never push.",
          mode: "js",
          js: PROMISE_ALL,
          task: "When 5/5 pass, write `allSettled` in the same shape. It never rejects.",
        },
        {
          t: "table",
          caption: "Know the edge cases cold. The empty-input column is a favourite follow-up.",
          head: ["Combinator", "Fulfils when", "Rejects when", "Empty input"],
          rows: [
            ["`Promise.all`", "all fulfil: values in input order", "the first rejection", "fulfils with `[]`"],
            ["`Promise.allSettled`", "all settle: `{ status, value }` or `{ status, reason }`", "never", "fulfils with `[]`"],
            ["`Promise.race`", "the first to settle fulfils", "the first to settle rejects", "stays pending forever"],
            ["`Promise.any`", "the first fulfilment", "all reject: `AggregateError` with `.errors`", "rejects with `AggregateError`"],
          ],
        },
        {
          t: "mission",
          h: "Promise.any, then a concurrency pool",
          x: "Write `promiseAny(iterable)`: first fulfilment wins; if all reject, reject with an `AggregateError` whose `errors` are in input order. Then `runLimited(tasks, limit)`: run async task functions with at most `limit` in flight, results in input order.",
          hint: "For the pool, start `limit` workers. Each loops: take the next index, await that task, store the result at its index. `Promise.all` over the workers.",
          solution: {
            lang: "js",
            src: `function promiseAny(iterable) {
  return new Promise((resolve, reject) => {
    const items = [...iterable];
    const errors = new Array(items.length);
    let left = items.length;
    if (left === 0) return reject(new AggregateError([], "All promises were rejected"));
    items.forEach((p, i) => {
      Promise.resolve(p).then(resolve, (e) => {
        errors[i] = e;
        if (--left === 0) reject(new AggregateError(errors, "All promises were rejected"));
      });
    });
  });
}

async function runLimited(tasks, limit) {
  const results = new Array(tasks.length);
  let next = 0;
  async function worker() {
    while (next < tasks.length) {
      const i = next++;              // claimed synchronously: no two workers share one
      results[i] = await tasks[i]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}`,
          },
        },
      ],
    },
    {
      title: "Implement it: data structures",
      beats: [
        {
          t: "quiz",
          q: "\"Deep clone this object.\" The strongest first sentence?",
          options: [
            "`JSON.parse(JSON.stringify(x))`",
            "\"In production, `structuredClone(x)`: it handles cycles, Maps and Dates, throws on functions and drops prototypes. Want me to write one by hand?\"",
            "\"Lodash's `cloneDeep`.\"",
            "`{ ...x }`",
          ],
          answer: 1,
          why: "Naming the built-in and its limits shows you ship. JSON turns Dates into strings, drops `undefined` and functions, empties Maps and throws on cycles. Spread is shallow. Then you write the recursive one anyway.",
        },
        {
          t: "rebuild",
          h: "Deep clone, cycles included",
          x: "Recursion is the easy part. The graded part is a `WeakMap` from original to copy, filled **before** you recurse, so cycles and shared references come out the right shape. Arrays, Dates and Maps each need their own branch.",
          mode: "js",
          js: DEEP_CLONE,
          task: "Then add Sets and keep prototypes with `Object.create(Object.getPrototypeOf(v))`. Say what you still miss: getters, symbol keys, non-enumerables.",
        },
        {
          t: "play",
          mode: "js",
          title: "curry",
          js: CURRY,
          task: "Get 3/3. Then try `curry((a, b = 2) => a + b)`: `fn.length` stops counting at the first default or rest parameter, so the arity is 1. Say that before they ask.",
        },
        {
          t: "play",
          mode: "js",
          title: "an event emitter",
          js: EMITTER,
          task: "Get 4/4. The last test is the one people miss: emit over a copy of the listener array, or a listener that removes itself makes you skip the next one.",
        },
        {
          t: "rebuild",
          h: "An LRU cache with a Map",
          x: "A `Map` iterates in insertion order. Delete and re-insert moves a key to the newest end, and `keys().next().value` is the oldest. That's an O(1) LRU in a dozen lines, and the follow-up is always why it's O(1).",
          mode: "js",
          js: LRU,
          task: "Then add a `ttlMs` option: entries older than it read as missing. Store `{ value, at }` and take a clock function, so a test can control time.",
        },
        {
          t: "pitfall",
          h: "An array-backed LRU",
          x: "`indexOf` plus `splice` to move a key makes every `get` O(n), and \"it's fine for small n\" fails the question, since O(1) is the point. Know both answers: the `Map`, and a hash map plus doubly linked list for when they ban the Map trick.",
        },
      ],
    },
    {
      title: "The browser, out loud",
      beats: [
        {
          t: "steps",
          h: "URL to pixels in 60 seconds",
          items: [
            "Parse the input: URL or search? Apply HSTS. A service worker or the HTTP cache may answer with no network at all.",
            "DNS: browser, OS and resolver caches, then the recursive lookup.",
            "Connect: TCP then TLS 1.3 costs two round trips before the request. HTTP/3 over QUIC folds them into one.",
            "Request and response: status, headers, time to first byte. The body streams.",
            "Parse HTML into the DOM as bytes arrive. The preload scanner runs ahead to start CSS, script and image fetches.",
            "CSS builds the CSSOM and blocks rendering. A plain `<script>` blocks the parser until it's fetched and run.",
            "Style, layout, paint, then the compositor stacks layers on the GPU. First pixels.",
          ],
        },
        { t: "say", x: "Sixty seconds, breadth first, then stop and offer the zoom: \"I can go deeper on TLS, caching or rendering.\" *What happens when you open a URL* and *The rendering pipeline* are the deep versions." },
        {
          t: "predict",
          lang: "js",
          src: `// 200 cards on the page
for (const card of cards) {
  card.style.height = card.offsetWidth / 2 + "px";
}`,
          q: "How many layouts does this force?",
          options: ["1, at the end of the frame", "About 200: each read needs the layout the previous write invalidated", "0: style writes are batched", "2"],
          answer: 1,
          why: "Write, then read a geometry property: the browser must lay out now to answer. Two hundred times. Read every width in one loop, write every height in a second: one layout. That's forced synchronous layout, or layout thrashing.",
        },
        {
          t: "table",
          caption: "Reflow is the old name for layout, repaint for paint. Animate only the last row.",
          head: ["Change", "Work it causes", "Examples"],
          rows: [
            ["geometry", "style, layout, paint, composite", "`width`, `top`, `padding`, `font-size`, adding nodes"],
            ["paint only", "style, paint, composite", "`color`, `background`, `box-shadow`, `visibility`"],
            ["compositor only", "style, composite (if it has its own layer)", "`transform`, `opacity`"],
          ],
        },
        {
          t: "quiz",
          q: "A fetch from `app.example.com` to `api.example.com` fails with a CORS error. The fix?",
          options: [
            "`mode: 'no-cors'`",
            "The API answers with `Access-Control-Allow-Origin: https://app.example.com` and handles the preflight, or you proxy it same-origin",
            "Send `Access-Control-Allow-Origin` as a request header",
            "Disable CORS in the browser during development",
          ],
          answer: 1,
          why: "CORS is the server telling the browser your JS may read the response. `no-cors` gives an opaque, unreadable one. A request header can't grant anything, and adds a preflight. Different subdomains are different origins.",
        },
        {
          t: "quiz",
          q: "`async` vs `defer` on a script tag?",
          options: [
            "No difference in modern browsers",
            "`defer`: fetched in parallel, run in order after parsing, before `DOMContentLoaded`. `async`: run the moment it arrives, in any order, possibly mid-parse",
            "`async` waits for the `load` event",
            "`defer` blocks rendering, `async` doesn't",
          ],
          answer: 1,
          why: "Analytics goes `async`: independent, order irrelevant. App code goes `defer` or `type=\"module\"`, which defers by default. A plain script in `<head>` stalls the parser for a full fetch.",
        },
        {
          t: "pitfall",
          h: "\"JWT in localStorage, to avoid CSRF\"",
          x: "It trades a solved problem for an unsolved one. CSRF is handled by `SameSite` cookies and tokens. A token in localStorage is stolen by any XSS and keeps working from the attacker's machine until it expires. `HttpOnly` cookies can't be read by script. See *Auth and security*.",
        },
      ],
    },
    {
      title: "CSS under questioning",
      beats: [
        {
          t: "compare",
          a: { label: "the old answer", lang: "css", src: `.parent { position: relative; }
.child {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}` },
          b: { label: "the answer now", lang: "css", src: `.parent {
  display: grid;
  place-items: center;
}` },
          x: "Lead with grid. Then show you know why the old one exists, and its costs: the child leaves the flow, and a half-pixel translate can blur text. `margin: auto` on a flex or grid child also centres.",
        },
        { t: "say", x: "Specificity is a tuple (ids, classes, types) compared left to right, so one id beats any number of classes. Then name the modern escape hatches: `:where()` counts zero, and `@layer` order beats specificity. *CSS I: the cascade and the box* has the full sort." },
        { t: "viz", name: "specificity", props: { selectors: ["#nav a", ".nav .link:hover", "nav ul li a.active", "a:is(#home, .x)", ":where(#nav) a"] } },
        {
          t: "predict",
          lang: "css",
          src: `/* .modal is inside .card; .header comes after .card */
.card   { transform: translateY(0); }
.modal  { position: fixed; z-index: 9999; }
.header { position: sticky; top: 0; z-index: 10; }`,
          q: "The modal shows under the header. Why?",
          options: [
            "9999 is above the maximum z-index",
            "`.card`'s transform makes it a stacking context: 9999 only ranks inside `.card`, and `.card` paints below the header",
            "Sticky elements always paint on top",
            "`position: fixed` ignores z-index",
          ],
          answer: 1,
          why: "z-index only competes inside one stacking context. `.card` paints as a unit at level 0, the header at 10. Bonus point: the transform also makes `.card` the containing block for the fixed modal, so it's no longer pinned to the viewport.",
        },
        {
          t: "pitfall",
          h: "Fixing z-index by raising it",
          x: "\"Set it to 99999\" tells the interviewer you never found the stacking context. Name what creates one: `opacity` below 1, `transform`, `filter`, `isolation: isolate`, a positioned element with a z-index. Then the fix: portal overlays to `body`, keep a small z-index scale.",
        },
        {
          t: "quiz",
          q: "A card grid with no media queries that never overflows, even in a 200px sidebar. Which?",
          options: [
            "`repeat(auto-fill, minmax(16rem, 1fr))`",
            "`repeat(auto-fill, minmax(min(16rem, 100%), 1fr))`",
            "`repeat(4, 1fr)` plus a breakpoint",
            "`flex-wrap: wrap` with `width: 25%`",
          ],
          answer: 1,
          why: "Without `min()`, every track is at least 16rem (256px), wider than the sidebar, so it overflows. `min(16rem, 100%)` lets a lone column shrink to fit. For components, container queries beat viewport breakpoints. See *CSS II: layout*.",
        },
      ],
    },
    {
      title: "React, past the docs",
      beats: [
        {
          t: "predict",
          lang: "jsx",
          src: `// todos: [{ id: 1, text: "milk" }, { id: 2, text: "eggs" }]
{todos.map((t, i) => (
  <li key={i}>
    {t.text} <input placeholder="note" />
  </li>
))}
// you type "2 litres" next to milk, then milk is deleted`,
          q: "Where is your note now?",
          options: ["Gone, with milk", "Next to eggs", "Next to both", "React throws on index keys"],
          answer: 1,
          why: "Key 0 still exists after the delete, so React keeps that `<li>` and its uncontrolled input and only changes the text to eggs. Key 1 is the one removed. With `key={t.id}`, state moves with its item. See *React from scratch*.",
        },
        { t: "viz", name: "reconcile", props: { before: ["milk", "eggs", "bread"], after: ["eggs", "bread"] } },
        {
          t: "quiz",
          q: "In development, your effect's fetch fires twice on mount. Why, and the fix?",
          options: [
            "A React bug: remove StrictMode",
            "StrictMode runs setup, cleanup, setup to test your cleanup. Fix the cleanup: abort the request or ignore its result",
            "The dependency array is wrong",
            "Fast Refresh reloaded the module",
          ],
          answer: 1,
          why: "Dev only, on purpose: an effect without cleanup also leaks on real remounts (navigation, `<Activity>`, Fast Refresh). An `AbortController` aborted in cleanup makes the double run harmless. Production runs it once per mount.",
        },
        {
          t: "pitfall",
          h: "The useRef already-fetched flag",
          x: "A ref guard hides the double fetch, not the bug: the effect still has no cleanup, so a fast prop or route change still lands a stale response on screen. Interviewers who know React read the trick as a red flag. Clean up, or use a data library that dedupes.",
        },
        {
          t: "table",
          caption: "Most React state bugs are a value in the wrong column.",
          head: ["", "`useState`", "`useRef`", "derived (a plain `const`)"],
          rows: [
            ["changing it re-renders", "yes", "no", "it's recomputed every render"],
            ["read during render", "yes: a snapshot", "avoid: it isn't one", "yes"],
            ["for", "what the UI shows", "timer ids, DOM nodes, latest value for callbacks", "anything computable from props and state"],
            ["classic bug", "props copied into state, then stale", "`ref.current` in JSX, which never updates", "none: that's why you prefer it"],
          ],
        },
        {
          t: "predict",
          lang: "jsx",
          src: `const Row = memo(function Row({ item, onPick }) {
  return <li onClick={() => onPick(item.id)}>{item.name}</li>;
});

function List({ items }) {
  const [picked, setPicked] = useState(null);
  return items.map((it) => (
    <Row key={it.id} item={it} onPick={(id) => setPicked(id)} />
  ));
}`,
          q: "1,000 rows. You click one. How many `Row`s re-render?",
          options: ["1", "2: the old pick and the new one", "1,000", "0"],
          answer: 2,
          why: "`onPick` is a new arrow every render, so `memo`'s shallow compare fails for every row. Pass `setPicked` itself (setters are stable) or wrap it in `useCallback`, and it drops to 0, since no row reads `picked`.",
        },
        { t: "say", h: "Memoisation, the senior take", x: "`memo` and `useMemo` are caches with a cost: a comparison every render, plus memory. Profile first, memoise the expensive subtree, keep props stable. React Compiler 1.0 writes this for you at build time. See *React for real*." },
      ],
    },
    {
      title: "Frontend system design",
      beats: [
        {
          t: "steps",
          h: "A frontend design answer, in order",
          items: [
            "Requirements: what it must do, then the non-functional ones: latency, scale, offline, devices, accessibility.",
            "The component tree, and which component owns which state.",
            "The API contract: endpoints or events, payload shapes, pagination.",
            "Data flow and caching: what's fetched when, cached where, invalidated how.",
            "Performance: what n is, what it costs per frame, where it breaks.",
            "Failure: slow, offline, out of order, partial. Then accessibility, and the metric that says it works.",
          ],
        },
        {
          t: "rebuild",
          h: "Autocomplete: cache and race handling",
          x: "Debounce you already have. What breaks in production: a slow reply for `a` landing after the reply for `ab`, and refetching what you already have. Fix both: cache the **promise** by query, and let only the latest search render.",
          mode: "js",
          js: SEARCH,
          task: "Get 4/4. Then: a rejected fetch must not stay cached, and the cache should be your LRU so it can't grow forever.",
        },
        {
          t: "table",
          caption: "The rest of the autocomplete answer, one line each.",
          head: ["Concern", "Answer"],
          rows: [
            ["keystroke spam", "debounce the request, never the input's own rendering"],
            ["out-of-order replies", "latest-wins id, plus an `AbortController` to cancel the losers"],
            ["repeat queries", "an LRU of promises keyed by the normalised query"],
            ["keyboard and screen readers", "`role=\"combobox\"`, `aria-activedescendant`, arrows, Enter, Escape"],
            ["empty, loading, error", "each is a designed state; show loading only after a short delay"],
            ["is it working", "time from keystroke to suggestions, and how often one is picked"],
          ],
        },
        {
          t: "predict",
          lang: "text",
          src: `10,000 rows, each 40px tall
viewport 800px, scrollTop 4000px
overscan: 5 rows above and 5 below`,
          q: "How many rows does a virtual list put in the DOM?",
          options: ["10,000", "20", "30", "25"],
          answer: 2,
          why: "Rows 100 to 119 are visible (800 / 40 = 20), plus 5 each side: 95 to 124, so 30. Scroll anywhere and it stays about 30. DOM cost becomes O(viewport), not O(n).",
        },
        {
          t: "play",
          mode: "html",
          title: "100,000 rows, about 20 in the DOM",
          html: `<div id="vp"><div id="spacer"></div></div>
<p id="info"></p>`,
          css: `body { font-family: system-ui; padding: 16px; }
#vp { height: 300px; overflow: auto; position: relative; border: 1px solid #888; }
.row { position: absolute; left: 0; right: 0; top: 0; height: 30px; line-height: 30px; padding: 0 10px; border-bottom: 1px solid #8884; }`,
          js: `const vp = document.getElementById("vp");
const COUNT = 100000, ROW = 30, OVERSCAN = 5;
document.getElementById("spacer").style.height = COUNT * ROW + "px";
const live = new Map(); // index -> element

function render() {
  const first = Math.max(0, Math.floor(vp.scrollTop / ROW) - OVERSCAN);
  const last = Math.min(COUNT, Math.ceil((vp.scrollTop + vp.clientHeight) / ROW) + OVERSCAN);
  for (const [i, el] of live) if (i < first || i >= last) { el.remove(); live.delete(i); }
  for (let i = first; i < last; i++) {
    if (live.has(i)) continue;
    const el = document.createElement("div");
    el.className = "row";
    el.style.transform = "translateY(" + i * ROW + "px)";
    el.textContent = "row " + i;
    vp.appendChild(el);
    live.set(i, el);
  }
  document.getElementById("info").textContent = "rows in the DOM: " + live.size + " of " + COUNT;
}
vp.addEventListener("scroll", render, { passive: true });
render();`,
          task: "Scroll fast and watch the count. Then make every 7th row 60px tall: you need a prefix sum of offsets and a binary search to find the first row. That's the follow-up question.",
        },
        {
          t: "pitfall",
          h: "Offset pagination for a live feed",
          x: "`?page=3` breaks when new posts arrive: everything shifts down a slot and the reader sees duplicates or misses posts. Use a cursor, `?after=<last id>`. Same answer for infinite scroll, chat history and any list that changes while someone reads it.",
        },
        {
          t: "table",
          caption: "A real-time chat client, problem by problem. *Real-time: SSE and WebSockets* builds these.",
          head: ["Problem", "What a senior says"],
          rows: [
            ["transport", "WebSocket; SSE plus POST if proxies get in the way"],
            ["dropped connection", "reconnect with exponential backoff and jitter; heartbeats to detect dead sockets"],
            ["missed messages", "server sequence numbers; on reconnect, ask for everything after the last one seen"],
            ["double sends", "a client-generated id per message, and the server dedupes on it"],
            ["feeling instant", "optimistic send: pending, then sent, or failed with a retry button"],
            ["ordering", "the server's sequence, never the client's clock"],
            ["offline", "queue outgoing messages in IndexedDB, flush on reconnect"],
          ],
        },
        {
          t: "quiz",
          q: "An image-heavy gallery has a poor LCP. The first move?",
          options: [
            "`loading=\"lazy\"` on every image",
            "Find the LCP image: don't lazy-load it, give it `fetchpriority=\"high\"` and a right-sized `srcset`, then lazy-load everything below the fold",
            "Convert everything to PNG",
            "Show a spinner until all images load",
          ],
          answer: 1,
          why: "Lazy-loading the hero delays the very element LCP measures. Then: `width` and `height` attributes against layout shift, AVIF or WebP, `sizes` so phones skip desktop files. See *Performance and robustness*.",
        },
        {
          t: "mission",
          h: "A 35-minute mock: a photo gallery",
          x: "Set a timer and design a gallery for 50,000 photos: grid, lightbox, upload. Say it out loud and record yourself. Then score the recording against the signals table at the top of this chapter, and redo the weakest part.",
          hint: "Cover requirements, component tree, cursor API, responsive images and placeholders, a virtualised grid, lightbox focus and keys, upload progress and retry, and one metric.",
        },
      ],
    },
    {
      title: "Backend basics for full-stack loops",
      beats: [
        {
          t: "table",
          caption: "GraphQL moves cost to the server rather than removing it. The deep comparison is in *API styles: REST, GraphQL, gRPC, SOAP and more*.",
          head: ["", "REST", "GraphQL"],
          rows: [
            ["response shape", "the server decides per endpoint", "the client asks for exactly the fields it needs"],
            ["HTTP caching", "free: GET, URLs, ETags, CDNs", "harder: mostly one POST endpoint; needs persisted queries"],
            ["server cost", "predictable per endpoint", "any query: needs depth or cost limits, and batching against N+1"],
            ["errors", "status codes", "often a 200 with an `errors` array"],
            ["pick it when", "public APIs, CRUD, cache-heavy reads", "many clients needing different shapes of one graph"],
          ],
        },
        {
          t: "quiz",
          q: "The Pay button POSTs. A flaky network makes the client retry. How do you guarantee one charge?",
          options: [
            "Disable the button after the first click",
            "Use PUT instead of POST",
            "The client sends an `Idempotency-Key` per payment attempt; the server stores it with the result and replays that result for repeats",
            "Only retry on 5xx",
          ],
          answer: 2,
          why: "A disabled button stops double clicks, not a retry after a timeout where the first request did succeed. Same key, same stored response. Store the key in the same transaction as the charge, or two racing retries both get through.",
        },
        { t: "say", h: "Idempotent is not safe", x: "Safe means no side effects: GET, HEAD. Idempotent means twice equals once: PUT, DELETE and the safe methods. POST is neither by default, and PATCH isn't guaranteed. That's why HTTP lets clients retry idempotent requests on their own, but not POST." },
        {
          t: "quiz",
          q: "\"SQL or NoSQL for a marketplace with orders, payments and inventory?\" Best answer?",
          options: [
            "NoSQL, because it scales",
            "Postgres: money and stock need transactions and constraints across tables. I'd add a document store or cache only for a measured access pattern",
            "SQL, because NoSQL is a fad",
            "Whatever the team already knows",
          ],
          answer: 1,
          why: "Lead with access patterns and consistency, not brands. \"NoSQL scales\" is folklore: Postgres runs huge workloads and MongoDB has had multi-document transactions since 4.0. Say what would change your mind. See *Databases*.",
        },
        {
          t: "play",
          mode: "js",
          title: "a token-bucket rate limiter",
          js: LIMITER,
          task: "Get 3/3, then return `{ ok, retryAfterMs }` so the server can answer `429` with `Retry-After`. Then say where this state lives when four servers share the traffic.",
        },
        {
          t: "steps",
          h: "Caching layers, outside in",
          items: [
            "Browser: `Cache-Control` and `ETag`. The fastest request is the one never sent.",
            "CDN: hashed static assets cached for a year; HTML and API responses briefly, if at all.",
            "Reverse proxy or gateway: caching hot GETs for even a second absorbs a spike.",
            "Application: Redis, cache-aside, with a TTL on every key.",
            "Database: its own buffer pool, plus indexes, the cache people forget.",
            "For each layer, say who invalidates it and how stale is acceptable.",
          ],
        },
        {
          t: "pitfall",
          h: "\"Just put Redis in front\"",
          x: "Without an invalidation story that's a stale-data generator. Say the key design, the TTL (with jitter, so keys don't all expire at once), what happens on a miss storm (one request recomputes, the rest wait for it), and how a write clears the key. *Designing APIs* covers rate limits and retries.",
        },
      ],
    },
  ],
  nobodyTells: [
    "Interviewers take notes as you talk. A one-sentence answer up front gives them the line to write; the detail after decides your level.",
    "Asking \"leading or trailing edge?\" before writing debounce often earns more than the debounce.",
    "If you blank, say how you'd find out: \"I'd record a trace and look for long tasks.\" A clear process still scores when recall fails.",
    "Trace a test out loud before you say done. Catching your own off-by-one reads as seniority; the interviewer catching it reads as luck.",
    "Name the built-in, then write it by hand: `structuredClone`, `Promise.any`, `AbortSignal.any`. Knowing it exists shows you ship.",
    "Every \"it depends\" needs its condition. \"It depends on whether rows reorder\" is senior; a bare \"it depends\" sounds like a dodge.",
    "In design rounds, offer a menu of deep-dives (\"caching, races or accessibility?\"). You steer toward your strengths and they still get depth.",
  ],
  glossary: [
    ["microtask", "A callback run as soon as the stack empties, before the next task: promise reactions, `queueMicrotask`, `await`."],
    ["debounce", "Run once after calls stop for `ms`. For input that settles: search boxes, resize."],
    ["throttle", "Run at most once per `ms`, usually with a trailing call. For continuous input: scroll, pointer moves."],
    ["AggregateError", "The error `Promise.any` rejects with when every input rejects; `.errors` holds them in input order."],
    ["LRU cache", "A bounded cache that evicts the least recently used key. With a `Map`, O(1) per operation."],
    ["forced synchronous layout", "Reading geometry after a style write, so the browser must lay out immediately. In a loop: thrashing."],
    ["stacking context", "A group painted as one unit; z-index only competes among elements inside the same one."],
    ["virtualisation", "Rendering only the rows near the viewport, so DOM size tracks the screen, not the data."],
    ["cursor pagination", "Paging by \"after this id\" instead of an offset, so inserts don't shift what the reader sees."],
    ["idempotency key", "A client-chosen id that lets the server recognise a retry and replay the stored result."],
    ["token bucket", "A rate limiter: tokens refill at a fixed rate up to a cap, each request spends one."],
    ["cache-aside", "The app reads the cache, falls back to the database on a miss, then fills the cache."],
  ],
  explain: "Explain to a friend, as you would in an interview, how you'd build a search box's autocomplete: the debounce, the race between replies, the cache, and what you'd measure.",
};
