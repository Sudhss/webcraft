export default {
  id: "js-async",
  n: 9,
  part: "B",
  title: "JavaScript II: async and the event loop",
  hook: "Tasks, microtasks and frames, per the spec: predict any async ordering, cancel anything, keep the main thread free.",
  minutes: 90,
  levels: ["use", "understand", "rebuild"],
  sections: [
    {
      title: "One thread, one loop",
      beats: [
        { t: "say", x: "Your JS gets one thread, and shares it with input handling, style, layout and paint. The **event loop** decides what runs on it next. Learn one turn of it and every async ordering puzzle becomes mechanical." },
        {
          t: "steps",
          h: "One turn of the loop, per the HTML spec",
          items: [
            "Pick a task queue with a runnable task and take its oldest task. There are several queues (timers, input, network); the browser picks, so input can jump ahead.",
            "Run that task to completion. Nothing preempts it: not a timer, not a click, not a paint.",
            "Microtask checkpoint: run microtasks until the queue is **empty**, including any queued along the way.",
            "If this is a rendering opportunity (about once per display refresh, tab visible): resize and scroll events, rAF callbacks, style, layout, ResizeObserver, paint.",
            "If nothing is queued and the next frame is far off, run `requestIdleCallback` callbacks. Go around again.",
          ],
        },
        {
          t: "code",
          lang: "js",
          src: `console.log('A');
setTimeout(() => console.log('B'), 0);
requestAnimationFrame(() => console.log('C'));
Promise.resolve()
  .then(() => console.log('D'))
  .then(() => console.log('E'));
console.log('F');`,
          note: "Three kinds of queue in seven lines. Step through it below.",
        },
        {
          t: "viz",
          name: "frames",
          props: {
            cols: ["Call stack", "Microtasks", "Task queue", "Render", "Console"],
            frames: [
              { cells: [["script"], [], [], [], ["A"]], note: "The whole script is one task. Line 1 runs on the spot." },
              { cells: [["script"], [], ["timer B"], [], ["A"]], note: "`setTimeout` starts a timer. Once 0 ms have passed, B is queued as a task. It still can't run until the script is done." },
              { cells: [["script"], [], ["timer B"], ["rAF C"], ["A"]], note: "`requestAnimationFrame` isn't a task. C waits in the frame's callback list for the next rendering opportunity." },
              { cells: [["script"], ["D"], ["timer B"], ["rAF C"], ["A"]], note: "`then` on an already-fulfilled promise queues D at once. E can't queue yet: its promise is waiting on D." },
              { cells: [["script"], ["D"], ["timer B"], ["rAF C"], ["A", "F"]], note: "Last line. Everything so far happened inside one task, and nothing else got a turn." },
              { cells: [["D"], ["E"], ["timer B"], ["rAF C"], ["A", "F", "D"]], note: "The stack is empty: microtask checkpoint. D runs, fulfils its promise, and that queues E." },
              { cells: [["E"], [], ["timer B"], ["rAF C"], ["A", "F", "D", "E"]], note: "The checkpoint drains until the queue is empty, newcomers included. Only then does the loop move on." },
              { cells: [["B"], [], [], ["rAF C"], ["A", "F", "D", "E", "B"]], note: "Next turn. Timer B is runnable and no frame is being drawn yet, so the loop runs it." },
              { cells: [["C"], [], [], ["style", "layout", "paint"], ["A", "F", "D", "E", "B", "C"]], note: "Rendering opportunity: rAF callbacks, then style, layout and paint. The spec would also allow C before B: see the quiz below." },
              { cells: [[], [], [], [], ["A", "F", "D", "E", "B", "C"]], note: "Frame painted. The loop sleeps until a task or the next frame arrives." },
            ],
          },
        },
        {
          t: "predict",
          lang: "js",
          src: `setTimeout(() => {
  console.log('t1');
  Promise.resolve().then(() => console.log('m1'));
}, 0);
setTimeout(() => console.log('t2'), 0);
Promise.resolve().then(() => {
  console.log('m0');
  setTimeout(() => console.log('t3'), 0);
});
console.log('sync');`,
          q: "What order?",
          options: ["sync m0 t1 t2 m1 t3", "sync m0 t1 m1 t2 t3", "sync t1 m1 t2 m0 t3", "sync m0 t1 m1 t3 t2"],
          answer: 1,
          why: "Each timer callback is its own task, and a checkpoint follows every task, so m1 runs before t2 gets a turn. t3's timer only started during the first checkpoint, after t1 and t2 were already waiting.",
        },
        {
          t: "quiz",
          q: "`setTimeout(a, 0)` then `requestAnimationFrame(b)`, back to back in a script. Which runs first?",
          options: ["`a`: the spec says timers go first", "`b`: rendering has priority", "No guarantee: the spec leaves the choice to the browser", "Both run in the same task"],
          answer: 2,
          why: "`a` is a task; `b` waits for a rendering opportunity, and the loop may serve either first. Chrome runs the timeout first in practice, but nothing promises it. Code whose correctness depends on this order is a latent bug.",
        },
        {
          t: "pitfall",
          h: "setTimeout(0) doesn't wait for a paint",
          x: "Add a class, then `setTimeout(() => el.classList.add('open'))` to kick off a transition: it works when a frame lands in between and silently fails when none does. Force a style flush (`el.getBoundingClientRect()`) or nest two `requestAnimationFrame`s.",
        },
      ],
    },
    {
      title: "Microtasks, frames and timers",
      beats: [
        { t: "say", x: "A checkpoint doesn't only follow tasks. It runs whenever the JS stack empties after a callback: between two listeners of a real click (chapter 10), and between two rAF callbacks in the same frame." },
        {
          t: "predict",
          lang: "js",
          src: `requestAnimationFrame(() => {
  console.log('raf 1');
  Promise.resolve().then(() => console.log('micro'));
  setTimeout(() => console.log('timeout'), 0);
});
requestAnimationFrame(() => console.log('raf 2'));`,
          q: "In a browser, what order?",
          options: ["raf 1, raf 2, micro, timeout", "raf 1, micro, raf 2, timeout", "raf 1, micro, timeout, raf 2", "raf 1, raf 2, timeout, micro"],
          answer: 1,
          why: "Both callbacks run in the same frame, but a checkpoint follows each one, so micro slips between them. The timeout is a new task: it waits until the frame, paint included, is finished.",
        },
        { t: "say", h: "Where timers really fire", x: "`setTimeout(f, 100)` doesn't run `f` at 100 ms. At 100 ms it *queues a task*, and `f` runs when the loop gets to it. Behind a 300 ms task, it runs at 300 ms. The delay is a minimum, never a schedule." },
        {
          t: "play",
          mode: "js",
          title: "measure the 4 ms clamp",
          js: `// Chain 12 zero-delay callbacks and record the real gap between them.
function measure(name, schedule, then) {
  const gaps = [];
  let last = performance.now();
  function tick() {
    const now = performance.now();
    gaps.push((now - last).toFixed(1));
    last = now;
    if (gaps.length < 12) schedule(tick);
    else { console.log(name, gaps.join(' ')); if (then) then(); }
  }
  schedule(tick);
}

const ch = new MessageChannel();
let next;
ch.port1.onmessage = () => next();
const viaMessage = (f) => { next = f; ch.port2.postMessage(0); };

measure('setTimeout(0):  ', (f) => setTimeout(f, 0), () =>
  measure('MessageChannel: ', viaMessage));`,
          task: "Find where the timer gaps jump to about 4 ms: the nesting clamp. The message gaps never do. Try `setTimeout(f, 1)`, and a delay of 10.",
        },
        { t: "say", h: "The 4 ms clamp", x: "Per the HTML spec, once timers nest more than five deep (a timeout set from a timeout's task, and so on), any delay under 4 ms becomes 4 ms. A loop that yields with `setTimeout(0)` 1,000 times sleeps for 4 seconds." },
        {
          t: "play",
          mode: "html",
          title: "microtask starvation",
          html: `<p>frames drawn: <b id="n">0</b></p>
<button id="task">2 s of setTimeout(0) loop</button>
<button id="micro">2 s of microtask loop</button>
<p id="out">&nbsp;</p>`,
          css: `body { font-family: system-ui; padding: 16px; }\nbutton { font: inherit; margin: 4px 0; }`,
          js: `let frames = 0;
(function loop() {
  document.getElementById('n').textContent = ++frames;
  requestAnimationFrame(loop);
})();
const out = document.getElementById('out');

function spinFor(ms, schedule, label) {
  const end = performance.now() + ms;
  let turns = 0;
  (function spin() {
    turns++;
    if (performance.now() < end) schedule(spin);
    else out.textContent = label + ': ' + turns.toLocaleString() + ' turns';
  })();
}

document.getElementById('task').onclick = () =>
  spinFor(2000, (f) => setTimeout(f, 0), 'setTimeout loop');
document.getElementById('micro').onclick = () =>
  spinFor(2000, queueMicrotask, 'microtask loop');`,
          task: "Click each and watch the frame counter. Both loops yield after every turn, yet only one lets the page breathe. Swap in `requestAnimationFrame` as the scheduler.",
        },
        {
          t: "pitfall",
          h: "Microtask starvation hides in recursion",
          x: "A retry loop, a poller or a reactive store that re-queues itself with `.then` or `queueMicrotask` never lets the checkpoint end. No paint, no input, no timers: the tab looks crashed, with no error. Anything that repeats must go through a task or rAF.",
        },
      ],
    },
    {
      title: "Promises are state machines",
      beats: [
        {
          t: "code",
          lang: "js",
          src: `const p = new Promise((resolve, reject) => {
  resolve('first');
  resolve('second');        // ignored: a promise settles once
  reject(new Error('x'));   // ignored
});

const later = new Promise((r) => setTimeout(r, 1000, 'done'));
const q = new Promise((resolve) => resolve(later));
// q is *resolved*: its fate is locked to later.
// It's still *pending* for a second.`,
          mark: [8],
          note: "Pending, fulfilled, rejected. `resolve(x)` with a thenable `x` doesn't fulfil: it follows `x`. Resolved means the fate is decided, not that a value exists.",
        },
        { t: "say", h: "Adoption costs ticks", x: "Following a thenable isn't free. `resolve(p)` queues a job that calls `p.then(...)`, and that reaction is a second job. Returning a promise from an async function or a `then` callback pays both." },
        {
          t: "predict",
          lang: "js",
          src: `async function f() {
  return Promise.resolve('f');
}
f().then(console.log);
Promise.resolve()
  .then(() => console.log(1))
  .then(() => console.log(2))
  .then(() => console.log(3));`,
          q: "What order?",
          options: ["f 1 2 3", "1 f 2 3", "1 2 f 3", "1 2 3 f"],
          answer: 2,
          why: "Resolving with a promise takes two extra microtasks: one to call its `then`, one for that reaction. So f lands after 2. Change it to `return 'f'` and it prints first. Never let correctness hang on tick counts.",
        },
        {
          t: "viz",
          name: "frames",
          props: {
            cols: ["Microtask queue", "Promise states", "Console"],
            frames: [
              { cells: [["adopt: inner.then"], ["f(): pending, locked to inner", "inner: fulfilled"], []], note: "`return inner` resolves f's promise with a thenable. Nothing is fulfilled yet: a job is queued to call `inner.then(resolveF)`." },
              { cells: [["adopt: inner.then", "log 1"], ["f(): pending, locked to inner", "inner: fulfilled"], []], note: "The chain's first `then` sits on a fulfilled promise, so `log 1` queues right behind." },
              { cells: [["log 1", "resolveF"], ["f(): pending, locked to inner", "inner: fulfilled"], []], note: "The adopt job calls `inner.then(resolveF)`. `inner` is already fulfilled, so `resolveF` is queued: tick two." },
              { cells: [["resolveF", "log 2"], ["f(): pending, locked to inner", "inner: fulfilled"], ["1"]], note: "`log 1` runs and fulfils the next promise in its chain, which queues `log 2`." },
              { cells: [["log 2", "log f"], ["f(): fulfilled 'f'", "inner: fulfilled"], ["1"]], note: "`resolveF` finally fulfils f's promise, and only now is its reaction, `log f`, queued." },
              { cells: [["log f", "log 3"], ["f(): fulfilled 'f'", "inner: fulfilled"], ["1", "2"]], note: "`log 2` runs and queues `log 3` behind `log f`." },
              { cells: [[], ["f(): fulfilled 'f'", "inner: fulfilled"], ["1", "2", "f", "3"]], note: "Two ticks late, from one innocent `return`." },
            ],
          },
        },
        {
          t: "predict",
          lang: "js",
          src: `const lazy = {
  then(resolve) {
    console.log('then called');
    resolve(42);
  },
};
(async () => {
  console.log('before');
  console.log('got', await lazy);
})();
console.log('sync');`,
          q: "What order?",
          options: ["before, then called, sync, got 42", "before, sync, then called, got 42", "before, sync, got [object Object]", "before, got 42, sync"],
          answer: 1,
          why: "Any object with a `then` method is a thenable, and `await` adopts it by calling `then` in a later microtask. That's how query builders run when awaited, and why a module that exports `then` breaks `await import()`.",
        },
        {
          t: "pitfall",
          h: "return without await skips your catch",
          x: "`try { return load(); } catch { return fallback; }` never catches: `return` hands the promise out before it rejects. `finally` runs early too, closing the connection or releasing the lock while `load()` is still going. Inside `try`, write `return await`.",
        },
        {
          t: "compare",
          a: {
            label: "catch never runs, finally runs too early",
            lang: "js",
            src: `async function getUser(id) {
  try {
    return fetchUser(id);
  } catch {
    return GUEST;
  } finally {
    release(id);
  }
}`,
          },
          b: {
            label: "both see the real outcome",
            lang: "js",
            src: `async function getUser(id) {
  try {
    return await fetchUser(id);
  } catch {
    return GUEST;
  } finally {
    release(id);
  }
}`,
          },
          x: "`await` keeps the function suspended inside `try` until the promise settles. It's also one tick *faster* than `return p` (one await instead of two adoption jobs), and keeps `getUser` in async stack traces.",
        },
        {
          t: "pitfall",
          h: "Two promises awaited in turn can crash Node",
          x: "`const a = getA(), b = getB(); await a; await b;` If `b` rejects while you wait for `a`, it has no handler yet: browsers fire `unhandledrejection`, Node 15+ exits the process. `await Promise.all([a, b])` attaches both handlers at once.",
        },
        {
          t: "rebuild",
          h: "A Promise in 40 lines",
          x: "A state machine, a reaction list, and `queueMicrotask` so callbacks never run synchronously. `then` returns a new promise resolved with the callback's result: that's chaining. The test runs the same code on both and prints the order: the lines disagree until you finish it.",
          mode: "js",
          js: `class MiniPromise {
  #state = 'pending';
  #value;
  #reactions = [];

  constructor(executor) {
    const resolve = (v) => this.#settle('fulfilled', v);
    const reject = (e) => this.#settle('rejected', e);
    try { executor(resolve, reject); } catch (e) { reject(e); }
  }

  #settle(state, value) {
    if (this.#state !== 'pending') return;       // settles once
    // TODO: fulfilling with a thenable must adopt it instead
    this.#state = state;
    this.#value = value;
    this.#reactions.splice(0).forEach((r) => this.#react(r));
  }

  #react({ onOk, onErr, resolve, reject }) {
    queueMicrotask(() => {                       // never synchronous
      const ok = this.#state === 'fulfilled';
      const cb = ok ? onOk : onErr;
      if (typeof cb !== 'function') return (ok ? resolve : reject)(this.#value);
      try { resolve(cb(this.#value)); } catch (e) { reject(e); }
    });
  }

  then(onOk, onErr) {
    return new MiniPromise((resolve, reject) => {
      const r = { onOk, onErr, resolve, reject };
      if (this.#state === 'pending') this.#reactions.push(r);
      else this.#react(r);
    });
  }
}

function test(P, label) {
  const log = [];
  new P((r) => r(1)).then((v) => log.push('a' + v)).then(() => log.push('b'));
  new P((_, j) => j(2)).then(null, (e) => log.push('err' + e));
  new P((r) => r(new P((r2) => setTimeout(r2, 10, 'late')))).then((v) => log.push(String(v)));
  setTimeout(() => console.log(label, log.join(' ')), 50);
}
test(Promise, 'native:');
test(MiniPromise, 'mini:  ');`,
          task: "Make `resolve(thenable)` adopt: in a microtask, call `value.then(resolve, reject)`. Guard it so it can resolve only once. Then add `catch` and `finally`.",
        },
      ],
    },
    {
      title: "async/await, desugared",
      beats: [
        { t: "say", x: "`await` suspends the function: its locals and position move to the heap, and the rest of the body becomes a promise reaction. Generators could already pause and resume in ES2015. An async function is a generator plus a driver." },
        {
          t: "play",
          mode: "js",
          title: "async/await from a generator",
          js: `// The driver Babel and TypeScript emitted for years
function run(genFn) {
  return (...args) => new Promise((resolve, reject) => {
    const it = genFn(...args);
    function step(method, arg) {
      let r;
      try { r = it[method](arg); } catch (e) { return reject(e); }
      if (r.done) return resolve(r.value);
      Promise.resolve(r.value).then(
        (v) => step('next', v),    // resume with the value
        (e) => step('throw', e),   // resume by throwing AT the yield
      );
    }
    step('next');
  });
}

const sleep = (ms, v) => new Promise((r) => setTimeout(r, ms, v));
const fail = (ms) => new Promise((_, j) => setTimeout(j, ms, new Error('boom')));

const load = run(function* (id) {
  const user = yield sleep(100, { id, name: 'Ada' });   // "await"
  console.log('got', user.name);
  try {
    yield fail(50);
  } catch (e) {
    console.log('caught at the yield:', e.message);
  }
  return user.id;
});

load(7).then((v) => console.log('returned', v));`,
          task: "Throw outside the `try` and follow it into `reject`. Then rewrite `load` as an `async function` and check the output doesn't change.",
        },
        { t: "say", h: "try/catch around await, explained", x: "A rejected `await` becomes `it.throw(err)`, which raises the error *at the paused line*, inside whatever `try` surrounds it. That's the whole trick that makes async errors look synchronous." },
        {
          t: "predict",
          lang: "js",
          src: `async function a() {
  console.log('a1');
  await b();
  console.log('a2');
}
async function b() {
  console.log('b');
}
console.log('s1');
a();
Promise.resolve().then(() => console.log('p'));
console.log('s2');`,
          q: "What order?",
          options: ["s1 a1 b s2 a2 p", "s1 a1 b s2 p a2", "s1 s2 a1 b a2 p", "s1 a1 s2 b p a2"],
          answer: 0,
          why: "An async function runs synchronously up to its first `await`, and so does `b`. `b()` returns a fulfilled promise, so the await queues a2 at once, ahead of `p`. Older engines spent three ticks here and printed p first.",
        },
        {
          t: "quiz",
          q: "`await cache.get(k)` where the value is a plain object already in memory. What does the `await` cost?",
          options: ["Nothing: it isn't a promise", "A suspension: the rest of the function waits for the next microtask", "A full task, so the browser may paint", "A TypeError"],
          answer: 1,
          why: "`await` always suspends, even on a plain value. Callers see the result later than they would from a sync function, and a hot loop with `await` per item pays one resume each time. It never gives the browser a chance to paint.",
        },
        {
          t: "pitfall",
          h: "An async executor swallows errors",
          x: "`new Promise(async (resolve) => resolve(await get()))`: if `get()` rejects, the executor's own promise rejects, unhandled, and yours stays pending forever. The constructor ignores what the executor returns. Write an async function instead.",
        },
      ],
    },
    {
      title: "Errors and cancellation",
      beats: [
        {
          t: "table",
          caption: "Where an async error actually goes.",
          head: ["You write", "The error goes", "Fix"],
          rows: [
            ["`throw` in an async function", "into its promise, as a rejection", "someone must `await` or `.catch` it"],
            ["`.then(f, onErr)`", "`onErr` does not see errors thrown by `f`", "`.then(f).catch(onErr)`"],
            ["`throw` in a `setTimeout` inside an executor", "uncaught; the promise stays pending forever", "call `reject`, or promisify the timer"],
            ["`items.forEach(async (x) => ...)`", "nowhere: nothing awaits those promises", "`for...of` with `await`, or `Promise.all(items.map(...))`"],
            ["a rejection nobody handles", "`unhandledrejection` in browsers; Node 15+ exits", "handle at the edges and report it; never swallow"],
          ],
        },
        {
          t: "quiz",
          q: "When does a browser decide a rejection is unhandled?",
          options: ["The instant `reject` runs with no handler", "Once the microtask checkpoint ends and it still has no handler", "When the page unloads", "After one second"],
          answer: 1,
          why: "Rejections are collected during the checkpoint and reported after it. A `.catch` added later in the same checkpoint is fine. Add it in a later task, after a timer or a fetch, and you get `unhandledrejection`, then `rejectionhandled`.",
        },
        { t: "say", h: "Cancellation is a protocol", x: "Promises have no cancel. Whoever starts the work holds an `AbortController`, the work receives `controller.signal`, and `abort(reason)` *asks* it to stop. Work that never checks the signal keeps running." },
        {
          t: "code",
          lang: "js",
          src: `function sleep(ms, { signal } = {}) {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted();                  // already aborted: fail now
    const onAbort = () => {
      clearTimeout(id);
      reject(signal.reason);                   // AbortError, TimeoutError, or yours
    };
    const id = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);   // don't leak on success
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

async function poll(url, { signal }) {
  for (;;) {
    const res = await fetch(url, { signal });
    if ((await res.json()).ready) return;
    await sleep(2000, { signal });             // every await is a cancel point
  }
}`,
          mark: [3, 6, 9],
          note: "Accept `{ signal }` and pass it to everything you await. A plain `abort()` rejects with an `AbortError` DOMException; `AbortSignal.timeout(ms)` gives a `TimeoutError`.",
        },
        {
          t: "predict",
          lang: "js",
          src: `// sleep() from above
const ac = new AbortController();
sleep(1000, { signal: ac.signal })
  .catch((e) => console.log('a:', e.name));
sleep(1000, { signal: AbortSignal.timeout(10) })
  .catch((e) => console.log('b:', e.name));
ac.abort();
console.log('sync');`,
          q: "What prints?",
          options: ["a: AbortError, sync, b: TimeoutError", "sync, a: AbortError, b: TimeoutError", "sync, b: TimeoutError, a: AbortError", "sync, a: AbortError, b: AbortError"],
          answer: 1,
          why: "`abort()` fires the event synchronously, so `reject` runs before `sync` logs, but `.catch` is a microtask. The timeout signal aborts from a task 10 ms later, with its own reason, a `TimeoutError`.",
        },
        {
          t: "pitfall",
          h: "Abort listeners pile up on long-lived signals",
          x: "One app-wide signal passed to 10,000 calls, each adding an `abort` listener it never removes: 10,000 closures, and everything they capture, live as long as the signal. Nothing warns. Remove the listener when the work settles, as `sleep` does.",
        },
      ],
    },
    {
      title: "Combinators and bounded concurrency",
      beats: [
        {
          t: "table",
          head: ["Combinator", "Settles when", "Use it for", "Trap"],
          rows: [
            ["`Promise.all`", "all fulfil, or the first rejects", "results you need together", "the others keep running; `all([])` fulfils at once"],
            ["`Promise.allSettled`", "every input settles; never rejects", "batches where partial success is fine", "check each `status` yourself"],
            ["`Promise.any`", "the first fulfils, or all reject", "redundant sources: mirrors, fallbacks", "rejects with `AggregateError`; the causes are in `.errors`"],
            ["`Promise.race`", "the first settles, either way", "rarely; for timeouts use `AbortSignal.timeout`", "the loser isn't cancelled; `race([])` never settles"],
          ],
        },
        {
          t: "compare",
          a: { label: "a waterfall: t1 + t2 + t3", lang: "js", src: `const user = await getUser(id);
const posts = await getPosts(id);
const prefs = await getPrefs(id);` },
          b: { label: "in parallel: max(t1, t2, t3)", lang: "js", src: `const [user, posts, prefs] = await Promise.all([
  getUser(id),
  getPosts(id),
  getPrefs(id),
]);` },
          x: "Three independent awaits in a row at 120 ms each cost 360 ms. Start them all, then await once: 120 ms. Serialize only when a call needs the previous result.",
        },
        {
          t: "predict",
          lang: "js",
          src: `const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const slow = sleep(200).then(() => console.log('slow finished'));
const fast = sleep(50).then(() => { throw new Error('fast failed'); });
Promise.all([slow, fast]).catch((e) => console.log('all:', e.message));`,
          q: "What prints, and when?",
          options: ["all: fast failed at 50 ms, and nothing else", "all: fast failed at 50 ms, then slow finished at 200 ms", "slow finished, then all: fast failed", "all: fast failed at 200 ms"],
          answer: 1,
          why: "`all` rejects on the first failure, but a promise is a result, not a job you can stop. `slow` runs to the end and its value is thrown away. With real requests that's wasted bandwidth and server work.",
        },
        {
          t: "code",
          lang: "js",
          src: `async function allOrNothing(jobs, { signal } = {}) {
  const ac = new AbortController();
  const s = signal ? AbortSignal.any([signal, ac.signal]) : ac.signal;
  try {
    return await Promise.all(jobs.map((job) => job(s)));
  } catch (e) {
    ac.abort(e);           // the first failure cancels the rest
    throw e;
  }
}

await allOrNothing([
  (signal) => fetch('/a', { signal }),
  (signal) => fetch('/b', { signal }),
]);`,
          mark: [3, 5, 7],
          note: "Take functions, not promises: work that has already started can't be handed a signal. And `return await`, or the catch never sees the rejection.",
        },
        { t: "say", h: "Bounded concurrency", x: "`Promise.all(urls.map(fetch))` on 5,000 URLs starts 5,000 requests now, and sockets, memory and the server's rate limiter all feel it. You want at most N in flight, with the next one starting the moment a slot frees." },
        {
          t: "play",
          mode: "js",
          title: "mapLimit: N workers, one index",
          js: `async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;          // no lock: nothing else runs between two awaits
      results[i] = await fn(items[i], i);
    }
  }
  const n = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: n }, worker));
  return results;
}

// fake jobs with random latency; count how many run at once
let inFlight = 0, peak = 0;
async function job(x) {
  inFlight++;
  peak = Math.max(peak, inFlight);
  await new Promise((r) => setTimeout(r, 50 + Math.random() * 150));
  inFlight--;
  return x * x;
}

const t0 = performance.now();
mapLimit([...Array(20).keys()], 4, job).then((out) => {
  console.log('results', out.join(' '));
  console.log('peak', peak, 'in flight,', Math.round(performance.now() - t0), 'ms');
});`,
          task: "Try limits 1, 4 and 20: compare time and peak. Make `job(7)` throw: `mapLimit` rejects, yet the other workers keep going. Stop them with an AbortController.",
        },
        {
          t: "mission",
          h: "A pool for jobs that arrive over time",
          x: "`mapLimit` needs the whole list up front. Write `pool(limit)` returning `run(fn)`: at most `limit` jobs execute at once, the rest wait in FIFO order, and each `run` returns its own job's promise. Then accept `{ signal }`: an aborted job still waiting never starts.",
          hint: "Keep a queue of `{ fn, resolve, reject, signal }` and an `active` count. Start jobs while `active < limit`; when one settles, decrement in `finally` and start the next.",
          solution: {
            lang: "js",
            src: `function pool(limit) {
  let active = 0;
  const queue = [];
  function pump() {
    while (active < limit && queue.length) {
      const { fn, resolve, reject, signal } = queue.shift();
      if (signal?.aborted) { reject(signal.reason); continue; }
      active++;
      Promise.resolve()
        .then(() => fn(signal))       // a sync throw becomes a rejection
        .then(resolve, reject)
        .finally(() => { active--; pump(); });
    }
  }
  return (fn, { signal } = {}) => new Promise((resolve, reject) => {
    queue.push({ fn, resolve, reject, signal });
    pump();
  });
}

const run = pool(3);
const pages = await Promise.all(urls.map((u) => run(() => fetch(u))));`,
          },
        },
      ],
    },
    {
      title: "Async iteration and streams",
      beats: [
        {
          t: "code",
          lang: "js",
          src: `async function* pages(url, { signal } = {}) {
  while (url) {
    const res = await fetch(url, { signal });
    const { items, next } = await res.json();
    yield items;          // paused here until the consumer asks again
    url = next;
  }
}

for await (const items of pages('/api/orders?limit=100')) {
  render(items);
  if (enough()) break;    // no more fetches: calls the generator's return()
}`,
          mark: [5, 12],
          note: "Pull-based: page 2 is fetched only when the loop asks for it. The consumer sets the pace, so memory holds one page, not all of them.",
        },
        {
          t: "predict",
          lang: "js",
          src: `async function* ticks() {
  try {
    for (let i = 1; ; i++) yield i;
  } finally {
    console.log('cleanup');
  }
}
(async () => {
  for await (const n of ticks()) {
    console.log(n);
    if (n === 2) break;
  }
  console.log('done');
})();`,
          q: "What prints?",
          options: ["1 2 done", "1 2 cleanup done", "1 2 done cleanup", "1 2 3 cleanup done"],
          answer: 1,
          why: "`break`, `return` or a throw in the loop body calls the iterator's `return()`, which resumes the generator as if `return` sat at the `yield`. `finally` runs and the loop waits for it. That's where you close sockets and release readers.",
        },
        {
          t: "pitfall",
          h: "for await over an array of promises",
          x: "`for await (const r of [p1, p2])` awaits them one by one. If `p2` rejects while you're still waiting on `p1`, it sits unhandled the whole time: browsers fire `unhandledrejection`, Node 15+ crashes before the loop gets there. Use `Promise.all` or `allSettled`.",
        },
        { t: "say", h: "Streams: a queue with backpressure", x: "A `ReadableStream` calls its source's `pull()` only while the queue holds less than `highWaterMark`. A slow reader slows the producer, so memory stays flat while gigabytes flow through. `pipeThrough` carries that pressure down a chain." },
        {
          t: "play",
          mode: "js",
          title: "backpressure, visible",
          js: `let produced = 0;
const source = new ReadableStream({
  pull(ctl) {                        // called only when the queue has room
    produced++;
    console.log('pull', produced, '(queued: ' + (3 - ctl.desiredSize) + ')');
    ctl.enqueue(produced);
    if (produced === 8) ctl.close();
  },
}, { highWaterMark: 3 });

(async () => {
  const reader = source.getReader();
  for (;;) {
    await new Promise((r) => setTimeout(r, 300));   // a slow consumer
    const { value, done } = await reader.read();
    if (done) break;
    console.log('    read', value);
  }
  console.log('done');
})();`,
          task: "The producer runs 3 ahead, then only as fast as reads. Set `highWaterMark` to 1, then 20, and watch how far ahead it gets. Then drop the delay.",
        },
      ],
    },
    {
      title: "Off the main thread",
      beats: [
        { t: "say", x: "Everything so far reorders work on one thread; none of it adds a CPU. A task over 50 ms is a **long task**: input waits behind it, and so does the next frame. Two ways out: split it into small tasks, or run it on another thread." },
        {
          t: "table",
          head: ["Yield with", "You resume", "Catch"],
          rows: [
            ["`await promise`", "in the same task, a microtask later", "yields nothing: paint and input still wait"],
            ["`setTimeout(r, 0)`", "at the back of the timer queue", "clamped to 4 ms once nested more than 5 deep"],
            ["`MessageChannel` message", "at the back of its queue, unclamped", "what React's scheduler uses"],
            ["`await scheduler.yield()`", "ahead of other queued tasks of its priority", "Chrome 129+, Firefox 142+, no Safari; can outrank frames"],
          ],
        },
        {
          t: "code",
          lang: "js",
          src: `const yieldToMain = () =>
  globalThis.scheduler?.yield
    ? scheduler.yield()
    : new Promise((r) => setTimeout(r, 0));

async function processAll(rows, { signal } = {}) {
  let deadline = performance.now() + 8;
  for (const row of rows) {
    process(row);
    if (performance.now() > deadline) {
      await yieldToMain();         // pending input gets a turn here
      signal?.throwIfAborted();    // the user may have moved on
      deadline = performance.now() + 8;
    }
  }
}`,
          mark: [3, 11, 12],
          note: "Yield by elapsed time, not by item count: rows vary in cost. After every yield, check whether the work is still wanted.",
        },
        {
          t: "play",
          mode: "html",
          title: "800 ms of work, three ways",
          html: `<p>frames drawn: <b id="fps">0</b></p>
<button id="none">no yield</button>
<button id="timeout">yield: setTimeout(0)</button>
<button id="yield">yield: scheduler.yield()</button>
<p id="out">&nbsp;</p>
<input placeholder="type while it runs">`,
          css: `body { font-family: system-ui; padding: 16px; }\nbutton, input { font: inherit; margin: 4px 0; }`,
          js: `let frames = 0;
(function loop() {
  document.getElementById('fps').textContent = ++frames;
  requestAnimationFrame(loop);
})();
const out = document.getElementById('out');
const busy = (ms) => { const t = performance.now(); while (performance.now() - t < ms) {} };

async function work(label, yieldFn) {
  const t0 = performance.now();
  for (let i = 0; i < 400; i++) {  // 400 chunks of 2 ms
    busy(2);
    if (yieldFn) await yieldFn();
  }
  out.textContent = label + ': ' + Math.round(performance.now() - t0) + ' ms for 800 ms of work';
}

document.getElementById('none').onclick = () => work('no yield');
document.getElementById('timeout').onclick = () =>
  work('setTimeout(0)', () => new Promise((r) => setTimeout(r, 0)));
const btn = document.getElementById('yield');
if (globalThis.scheduler?.yield) btn.onclick = () => work('scheduler.yield()', () => scheduler.yield());
else { btn.disabled = true; btn.textContent += ' (not in this browser)'; }`,
          task: "Watch the time and the frame count. The clamp makes setTimeout almost 4x slower. In Chrome, yield continuations outrank rendering: fastest finish, but only about 10 frames a second.",
        },
        {
          t: "code",
          lang: "js",
          src: `// main.js
const worker = new Worker(new URL('./blur.worker.js', import.meta.url), { type: 'module' });
const img = ctx.getImageData(0, 0, w, h);          // 4 bytes per pixel
worker.postMessage({ w, h, buf: img.data.buffer }, [img.data.buffer]);
console.log(img.data.length);                      // 0: moved, not copied
worker.onmessage = ({ data }) =>
  ctx.putImageData(new ImageData(new Uint8ClampedArray(data.buf), data.w, data.h), 0, 0);

// blur.worker.js: no DOM here, and all the CPU you like
self.onmessage = ({ data: { w, h, buf } }) => {
  blur(new Uint8ClampedArray(buf), w, h);
  self.postMessage({ w, h, buf }, [buf]);           // hand ownership back
};`,
          mark: [4, 12],
          note: "The second argument lists **transferables**: ownership moves in O(1). Without it, `postMessage` structured-clones the data, O(bytes), serialized on one thread and rebuilt on the other.",
        },
        {
          t: "predict",
          lang: "js",
          src: `const buf = new ArrayBuffer(8 * 1024 * 1024);
const copy = structuredClone(buf);
const moved = structuredClone(buf, { transfer: [buf] });
console.log(copy.byteLength, moved.byteLength, buf.byteLength);`,
          q: "What prints?",
          options: ["8388608 8388608 8388608", "8388608 8388608 0", "0 8388608 8388608", "8388608 0 0"],
          answer: 1,
          why: "`structuredClone` is the algorithm `postMessage` uses. The clone copies 8 MB. The transfer moves the memory and **detaches** the original: `byteLength` 0, and every view over it reads as empty.",
        },
        {
          t: "pitfall",
          h: "A worker doesn't make big results free",
          x: "Parse 50 MB of JSON in a worker, post the object back, and the main thread pays to rebuild it from the clone, often about as long as the parse you moved. Keep the data in the worker and send small answers, or send typed arrays and transfer them.",
        },
        {
          t: "quiz",
          q: "Two workers must read the same 200 MB array with no copies. What does that take?",
          options: ["Transfer it to both", "A `SharedArrayBuffer`, which needs the page to be cross-origin isolated", "A `BroadcastChannel`", "It can't be done in a browser"],
          answer: 1,
          why: "A transfer has one owner at a time. Shared memory needs `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`; check `crossOriginIsolated`. Coordinate with `Atomics`.",
        },
        {
          t: "mission",
          h: "Filter 200,000 rows without dropping a keystroke",
          x: "An input filters a 200k-row array on every keystroke, and typing stutters. Chunk the filter with `yieldToMain` every 8 ms, abort the stale run on each new keystroke, and render only the final result. Then move the filter to a worker and compare.",
          hint: "One AbortController per keystroke: `ac?.abort(); ac = new AbortController();`. After each yield, `signal.throwIfAborted()`, and swallow `AbortError` at the top.",
        },
      ],
    },
  ],
  nobodyTells: [
    "`return await p` is one microtask faster than `return p`: returning a promise costs two adoption jobs, awaiting it costs one.",
    "V8 builds async stack traces from `await` points. `return promise` without `await` drops your function from the trace.",
    "`await` gives the browser nothing. Paint and input wait until the whole microtask queue drains; only a task or a frame is a real yield.",
    "A module that exports a function named `then` makes `await import()` call it: the namespace object is a thenable.",
    "`queueMicrotask(fn)` beats `Promise.resolve().then(fn)`: same queue, no promise, and a throw is reported as an error, not a rejection.",
    "In Node, `setTimeout(f, 0)` is really 1 ms and there's no 4 ms clamp. Timing that passes in Node tests can differ in a browser.",
    "`Promise.all` attaches a handler to every input up front, so it never leaves a second rejection unhandled, even when several fail.",
  ],
  glossary: [
    ["task", "A unit of work the event loop runs to completion: a script, a timer callback, an event dispatch, a message."],
    ["microtask", "A callback that runs as soon as the JS stack is empty, before the next task: promise reactions, `queueMicrotask`."],
    ["microtask checkpoint", "Running microtasks until the queue is empty, after every task and every callback from the browser."],
    ["rendering opportunity", "A turn where the browser may run rAF callbacks, style, layout and paint: about once per display refresh."],
    ["thenable", "Any object with a `then` method. `await` and `resolve()` adopt it, calling `then` in a microtask."],
    ["resolved", "A promise whose fate is decided: settled, or locked to follow another thenable. Not the same as fulfilled."],
    ["timer nesting level", "How deep a chain of timers set from timer tasks goes. Past 5, delays under 4 ms become 4 ms."],
    ["unhandled rejection", "A rejected promise with no handler when a checkpoint ends. Fires `unhandledrejection`; Node 15+ exits."],
    ["AbortSignal", "The object work receives to learn it should stop. `aborted`, `reason`, an `abort` event, `throwIfAborted()`."],
    ["async iterator", "An object whose `next()` returns promises of `{ value, done }`; what `for await` consumes."],
    ["backpressure", "A consumer slowing its producer. Streams do it by calling `pull()` only while the queue has room."],
    ["long task", "A task over 50 ms. Input and the next frame wait behind it."],
    ["transferable", "An object like `ArrayBuffer` or `OffscreenCanvas` whose ownership `postMessage` can move instead of copying."],
  ],
  explain: "Explain to a friend why a loop with `await` inside never lets the page repaint, while `await scheduler.yield()` does, using tasks, the microtask checkpoint and rendering opportunities.",
};
