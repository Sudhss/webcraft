const VUE = `<script src="https://cdn.jsdelivr.net/npm/vue@3/dist/vue.global.prod.js"></script>`;

export default {
  id: "vue-reactivity",
  n: 21,
  part: "D",
  title: "Vue and reactivity",
  hook: "React re-runs your component to find what changed. Vue already knows who read what. Build that machine in about 50 lines.",
  minutes: 90,
  levels: ["use", "understand", "rebuild"],
  sections: [
    {
      title: "Two ways to know what changed",
      beats: [
        { t: "say", x: "React knows *that* state changed, not *who reads it*. So it re-runs the component and diffs the output. Vue records every read while rendering, so a write already knows exactly which renders to re-run." },
        {
          t: "compare",
          a: {
            label: "React: the body is the render",
            lang: "jsx",
            src: `function Counter() {
  console.log("body runs");
  const [n, setN] = useState(0);
  return <button onClick={() => setN(n + 1)}>{n}</button>;
}`,
          },
          b: {
            label: "Vue: setup runs once",
            lang: "html",
            src: `<script setup>
import { ref } from "vue";
console.log("setup runs");
const n = ref(0);
</script>

<template>
  <button @click="n++">{{ n }}</button>
</template>`,
          },
          x: "Click ten times: React logs eleven lines, Vue logs one. Vue re-runs only the compiled render function; the `setup` scope is a closure that lives as long as the component.",
        },
        {
          t: "table",
          head: ["", "React", "Vue (virtual DOM)", "Solid, Vue Vapor"],
          rows: [
            ["what re-runs", "the component and its whole subtree", "one component's render function", "one effect bound to one DOM node"],
            ["how it finds the work", "`setState` marks a component dirty", "a write wakes the renders that read it", "a write wakes the bindings that read it"],
            ["cost of one change", "O(subtree), trimmed with `memo`", "O(dynamic nodes in that component)", "O(bindings that read it)"],
            ["child with the same props", "re-renders unless memoized", "skipped", "nothing to re-render"],
          ],
        },
        {
          t: "play",
          mode: "html",
          title: "who re-renders",
          html: `${VUE}
<div id="app"></div>`,
          css: `button { font: inherit; padding: 6px 12px; margin-right: 6px; }\np { margin: 4px 0; }`,
          js: `const { createApp, ref } = Vue;
const counts = {};
// called from templates, so it runs once per render of that component
const seen = (name) => {
  counts[name] = (counts[name] || 0) + 1;
  console.log(name, "render #" + counts[name]);
  return "";
};

const Row = {
  props: ["label", "extra"],
  setup: () => ({ seen }),
  template: \`<p>{{ label }} {{ extra }}{{ seen(label) }}</p>\`,
};

createApp({
  components: { Row },
  setup() {
    const count = ref(0);
    const bump3 = () => { count.value++; count.value++; count.value++; };
    return { count, bump3, seen };
  },
  template: \`
    <button @click="count++">count: {{ count }}</button>
    <button @click="bump3">+3 in one click</button>
    {{ seen("App") }}
    <Row v-for="n in 3" :key="n" :label="'row ' + n" />
    <Row label="reads count" :extra="count" />\`,
}).mount("#app");`,
          task: "Click both buttons and read the log: rows 1 to 3 render once, ever, and +3 renders once. Then add `+ count` to the rows' `:label` and click again.",
        },
        {
          t: "quiz",
          q: "A parent's state changes. Its 1,000 child components get exactly the same props as before. How many render functions does Vue run?",
          options: ["1,001", "1: the parent's", "0: only the changed text node is written", "1,001 unless you add `v-memo`"],
          answer: 1,
          why: "Vue compares each child's new props with its old ones and skips the child when nothing changed. Components are memoized by default; React needs `memo` for the same result. \"0\" is the Solid and Vapor answer.",
        },
        { t: "say", x: "So Vue is fine-grained *between* components and diffs *inside* one. Solid goes all the way: components run once, and each `{count()}` in JSX becomes an effect that writes one text node. Vue's Vapor mode, near the end, does the same." },
      ],
    },
    {
      title: "Proxy, track, trigger",
      beats: [
        {
          t: "code",
          lang: "js",
          src: `const targetMap = new WeakMap(); // raw object -> Map<key, Set<effect>>
let activeEffect = null;          // set while an effect runs

function reactive(obj) {
  return new Proxy(obj, {
    get(target, key, receiver) {
      track(target, key);           // someone is reading: remember who
      return Reflect.get(target, key, receiver);
    },
    set(target, key, value, receiver) {
      const ok = Reflect.set(target, key, value, receiver);
      trigger(target, key);         // re-run whoever read this key
      return ok;
    },
  });
}`,
          mark: [7, 12],
          note: "Subscriptions are per object and per key: writing `user.name` never wakes an effect that only read `user.age`.",
        },
        {
          t: "viz",
          name: "frames",
          props: {
            cols: ["Running effect", "targetMap", "What happens"],
            frames: [
              { cells: [["render"], [], ["effect(render)"]], note: "An effect runs its function once, right away, with itself set as `activeEffect`." },
              { cells: [["render"], ["state.count: {render}"], ["get count"]], note: "The `get` trap calls `track`: add `render` to the Set stored for (state, \"count\")." },
              { cells: [["render"], ["state.count: {render}", "state.user: {render}", "user.name: {render}"], ["get user", "get name"]], note: "`state.user` hands back a proxy of the inner object, made on first access. Reading `.name` subscribes on that object too." },
              { cells: [[], ["state.count: {render}", "state.user: {render}", "user.name: {render}"], ["render returns"]], note: "`activeEffect` goes back to null. Reads outside an effect subscribe nothing: a click handler that reads state never becomes a dependency." },
              { cells: [[], ["state.count: {render}", "state.user: {render}", "user.name: {render}"], ["set count", "trigger(state, count)"]], note: "A write: the `set` trap looks up (state, \"count\") and finds `{render}`." },
              { cells: [["render"], ["state.count: {render}", "state.user: {render}", "user.name: {render}"], ["render runs again"]], note: "`render` runs again and re-tracks everything it reads. A write to `user.age` would have woken nobody." },
            ],
          },
        },
        {
          t: "predict",
          lang: "js",
          src: `const state = reactive({ count: 0 });
let { count } = state;
watchEffect(() => console.log("count is", count));
state.count++;
await nextTick();`,
          q: "How many lines are logged?",
          options: ["1", "2", "0", "It throws"],
          answer: 0,
          why: "The destructuring read `state.count` outside any effect, so nothing subscribed. The effect reads a plain local. Reactivity lives in property access on the proxy, never in the value. `toRefs(state)` keeps the link.",
        },
        { t: "say", h: "Why .value exists", x: "A Proxy can only intercept property access on an object. A local `let n = 0` has no hook. So `ref` boxes the value in an object with a `value` getter and setter, and the box is what gets tracked." },
        {
          t: "code",
          lang: "js",
          src: `function ref(raw) {
  let inner = isObject(raw) ? reactive(raw) : raw; // ref({...}) is deep
  const r = {
    get value() {
      track(r, "value");
      return inner;
    },
    set value(v) {
      if (Object.is(v, raw)) return;   // same value: nobody is woken
      raw = v;
      inner = isObject(v) ? reactive(v) : v;
      trigger(r, "value");
    },
  };
  return r;
}`,
          mark: [2, 9],
          note: "`shallowRef` skips the `reactive()` call, so only `.value` itself is tracked. That's the one you want for big data and third-party objects.",
        },
        {
          t: "predict",
          lang: "js",
          src: `const raw = { id: 1 };
const items = reactive([]);
items.push(raw);

console.log(items.includes(raw));
console.log(items.find((x) => x === raw) !== undefined);`,
          q: "What do the two lines print?",
          options: ["true, true", "true, false", "false, false", "false, true"],
          answer: 1,
          why: "Reading `items[0]` hands back a proxy of `raw`, a different object. Vue patches `includes` and `indexOf` to retry with the raw value, so the first matches. Your own `===` inside `find` or `filter` gets no such help.",
        },
        {
          t: "pitfall",
          h: "Raw objects and proxies don't compare equal",
          x: "Keep `current = obj` in a plain variable, push `obj` into reactive state, and later `items.filter((x) => x !== current)` deletes nothing. Same for `Set.has` and `Map.get` keyed by raw objects. Compare ids, or put both sides through the same reactive state.",
        },
        {
          t: "pitfall",
          h: "Private class fields throw through a proxy",
          x: "`reactive(new Cart())` where `Cart` uses `#items`: every method call throws *Cannot read private member #items from an object whose class did not declare it*, because `this` is now the proxy. `ref()` does it too, since it makes objects deep. `markRaw` the instance.",
        },
      ],
    },
    {
      title: "Rebuild: effect and cleanup",
      beats: [
        {
          t: "predict",
          lang: "js",
          src: `const s = reactive({ ok: true, a: 1, b: 1 });
let runs = 0;
effect(() => { runs++; s.ok ? s.a : s.b; });  // runs = 1
s.ok = false;                                 // runs = 2, now reads s.b
s.a++;`,
          q: "In Vue, what is `runs` now?",
          options: ["2", "3", "4"],
          answer: 0,
          why: "The second run never read `s.a`, so Vue dropped that subscription. Without cleanup you'd get 3: every key an effect *ever* read would wake it, forever. This is the third test below.",
        },
        {
          t: "rebuild",
          h: "track, trigger, effect",
          x: "The whole idea in runnable form: a WeakMap of Sets, a Proxy, and a global for the running effect. Two tests pass. The third finds a real bug: an effect keeps listening to keys it stopped reading.",
          mode: "js",
          js: `const deps = new WeakMap(); // target -> Map(key -> Set(effect))
let active = null;

function track(target, key) {
  if (!active) return;
  let byKey = deps.get(target);
  if (!byKey) deps.set(target, (byKey = new Map()));
  let subs = byKey.get(key);
  if (!subs) byKey.set(key, (subs = new Set()));
  subs.add(active);
}

function trigger(target, key) {
  const subs = deps.get(target)?.get(key);
  if (subs) for (const e of [...subs]) e();
}

function reactive(obj) {
  return new Proxy(obj, {
    get(t, k, r) {
      track(t, k);
      return Reflect.get(t, k, r);
    },
    set(t, k, v, r) {
      const old = t[k];
      const ok = Reflect.set(t, k, v, r);
      if (!Object.is(old, v)) trigger(t, k);
      return ok;
    },
  });
}

function effect(fn) {
  const run = () => {
    active = run;
    try { fn(); } finally { active = null; }
  };
  run();
}

const check = (name, got, want) => console.log(got === want ? "ok  " : "FAIL", name, "->", got);
const s = reactive({ count: 0, ok: true, a: 1, b: 1 });
let runs = 0;
effect(() => { runs++; s.count; });
s.count++; s.count++;
check("re-runs on write", runs, 3);
s.count = 2;
check("same value: no re-run", runs, 3);

let branch = 0;
effect(() => { branch++; s.ok ? s.a : s.b; });
s.ok = false; // now reads s.b only
s.a++;        // nobody should care
check("stale dep dropped", branch, 2);`,
          task: "Make the third test pass: give each effect a list of the Sets it joined, and have it leave all of them before every run. `track` pushes onto that list.",
        },
        {
          t: "predict",
          lang: "js",
          src: `const subs = new Set();
function e() {
  subs.delete(e); // cleanup: leave every dep Set...
  subs.add(e);    // ...then re-join while running
}
subs.add(e);
for (const fn of subs) fn();`,
          q: "How many times does `e` run?",
          options: ["1", "2", "Forever: the tab hangs"],
          answer: 2,
          why: "A Set iterator visits entries added during iteration, including ones deleted and re-added. With cleanup, every trigger loop looks like this. That's why `trigger` iterates a copy, `[...subs]`: collect first, then run.",
        },
        { t: "say", h: "How Vue 3.5 cleans up", x: "Leaving and re-joining every Set on every run is churn: a delete and an add per dependency, per run. Vue 3.5 marks each dependency link stale before a run, the run re-marks what it reads, and whatever is still stale afterwards gets unsubscribed." },
        {
          t: "quiz",
          q: "Why is the dependency map a `WeakMap` keyed by the raw object?",
          options: ["Lookups are faster than a Map", "When the object becomes garbage, its subscriptions go with it; a Map would keep every object ever made reactive alive", "WeakMaps can't be iterated, which hides internals", "Proxies can't be Map keys"],
          answer: 1,
          why: "A WeakMap holds its keys weakly. Drop the last reference to a reactive object and its whole Map of Sets is collected with it. With a plain Map, every list you ever fetched would live as long as the page.",
        },
      ],
    },
    {
      title: "computed and the effect stack",
      beats: [
        {
          t: "predict",
          lang: "js",
          src: `let active = null;
function effect(fn) {
  const run = () => { active = run; fn(); active = null; };
  run();
}

effect(function outer() {
  effect(function inner() { state.a; });
  state.b;
});
state.b++;`,
          q: "Does `state.b++` re-run `outer`?",
          options: ["Yes", "No: `state.b` was read while `active` was null", "No, but it re-runs `inner`"],
          answer: 1,
          why: "`inner` finished and set `active = null`, so `outer`'s later read subscribed nobody. Keep a stack, pop on exit, and the running effect is always the top. A computed read inside a render is exactly this nesting.",
        },
        {
          t: "code",
          lang: "js",
          src: `function computed(getter) {
  let value, dirty = true;
  const e = effect(getter, {
    lazy: true,                  // don't run until someone reads .value
    scheduler() {                // a source changed: mark, don't recompute
      if (!dirty) { dirty = true; trigger(c, "value"); }
    },
  });
  const c = {
    get value() {
      if (dirty) { value = e.run(); dirty = false; }
      track(c, "value");         // whoever reads me now depends on me
      return value;
    },
  };
  return c;
}`,
          mark: [6, 11],
          note: "A computed is an effect plus a dirty bit. Writes to its sources flip the bit and notify its readers; the getter runs only on the next read.",
        },
        {
          t: "predict",
          lang: "js",
          src: `const n = ref(1);
let calls = 0;
const double = computed(() => (calls++, n.value * 2));

double.value; double.value;
n.value++; n.value++; n.value++;
double.value;
console.log(calls);`,
          q: "What prints?",
          options: ["1", "2", "4", "5"],
          answer: 1,
          why: "Two reads, one run: cached. Three writes, zero runs: they only mark it dirty. One more read, one more run. A computed nobody reads never runs at all, which is also how a broken one hides.",
        },
        {
          t: "predict",
          lang: "js",
          src: `const n = ref(1);
const isEven = computed(() => n.value % 2 === 0);
let runs = 0;
watchEffect(() => { runs++; isEven.value; });

n.value = 3; await nextTick();
n.value = 5; await nextTick();`,
          q: "How many times has the effect run?",
          options: ["1", "2", "3"],
          answer: 0,
          why: "Since Vue 3.4 an effect re-runs only if a computed it reads produced a different value. `isEven` stayed `false` both times, so only the first run happened. Our mini `computed` fails this: it's the last test below.",
        },
        {
          t: "rebuild",
          h: "Mini Vue reactivity in 55 lines",
          x: "`reactive` with lazy deep proxies, `effect` with a stack and cleanup, and a lazy cached `computed`. Four tests pass. Two fail: proxy identity, and the behaviour you just predicted.",
          mode: "js",
          js: `const deps = new WeakMap(), proxies = new WeakMap(), stack = [];

function track(t, k) {
  const e = stack.at(-1);
  if (!e) return;
  let m = deps.get(t);
  if (!m) deps.set(t, (m = new Map()));
  let subs = m.get(k);
  if (!subs) m.set(k, (subs = new Set()));
  if (!subs.has(e)) { subs.add(e); e.deps.push(subs); }
}
function trigger(t, k) {
  for (const e of [...(deps.get(t)?.get(k) || [])]) {
    if (stack.includes(e)) continue; // an effect never re-triggers itself
    e.scheduler ? e.scheduler() : e.run();
  }
}
function reactive(obj) {
  if (proxies.has(obj)) return proxies.get(obj);
  const p = new Proxy(obj, {
    get(t, k, r) {
      track(t, k);
      const v = Reflect.get(t, k, r);
      return v && typeof v === "object" ? reactive(v) : v; // deep, lazily
    },
    set(t, k, v, r) {
      const old = t[k], ok = Reflect.set(t, k, v, r);
      if (!Object.is(old, v)) trigger(t, k);
      return ok;
    },
  });
  proxies.set(obj, p);
  return p;
}
function effect(fn, { lazy, scheduler } = {}) {
  const e = { deps: [], scheduler, run() {
    e.deps.forEach((subs) => subs.delete(e)); // forget last run's deps
    e.deps.length = 0;
    stack.push(e);
    try { return fn(); } finally { stack.pop(); }
  } };
  if (!lazy) e.run();
  return e;
}
function computed(getter) {
  let value, dirty = true;
  const e = effect(getter, { lazy: true, scheduler() {
    if (!dirty) { dirty = true; trigger(c, "value"); } // mark, don't recompute
  } });
  const c = { get value() {
    if (dirty) { value = e.run(); dirty = false; }
    track(c, "value");
    return value;
  } };
  return c;
}

const check = (name, got, want) => console.log(got === want ? "ok  " : "FAIL", name, "->", got);
const s = reactive({ first: "Ada", last: "Byron", n: 1, ok: true, a: 1, b: 1 });
let calls = 0;
const full = computed(() => (calls++, s.first + " " + s.last));
check("computed is lazy", calls, 0);
full.value; full.value; s.first = "Al"; s.first = "Ada";
check("cached; writes don't recompute", calls, 1);
const log = [];
effect(() => log.push(full.value + " " + s.n));
s.n = 2; s.last = "King";
check("stack keeps outer deps", log.join(" | "), "Ada Byron 1 | Ada Byron 2 | Ada King 2");
let br = 0;
effect(() => { br++; s.ok ? s.a : s.b; });
s.ok = false; s.a++;
check("stale deps dropped", br, 2);
check("reactive(proxy) is the proxy", reactive(s) === s, true);
let big = 0;
const isBig = computed(() => s.n > 100);
effect(() => { big++; isBig.value; });
s.n = 3; s.n = 4;
check("unchanged computed: no re-run", big, 1);`,
          task: "Fix both FAILs. Identity: a symbol key that the `get` trap answers. Stability: when notified with readers subscribed, recompute and trigger only if `Object.is` says it changed.",
        },
        { t: "say", h: "How Vue does the second fix", x: "Vue 3.5 gives every dependency a version number. A computed bumps its version only when its value changes. Before an effect re-runs, it refreshes the computeds it read and compares versions: nothing new, no run." },
        {
          t: "pitfall",
          h: "A computed that builds a new object always changes",
          x: "`computed(() => ({ even: n.value % 2 === 0 }))` returns a fresh object every time, so `Object.is` never matches and every reader re-runs, even when `even` didn't move. Return primitives, or return `previous` when the content is equal (3.4+).",
        },
      ],
    },
    {
      title: "The scheduler: three writes, one render",
      beats: [
        {
          t: "predict",
          lang: "js",
          src: `const n = ref(0);
let runs = 0;
watchEffect(() => { runs++; n.value; });

n.value++; n.value++; n.value++;
console.log(runs);   // A
await nextTick();
console.log(runs);   // B`,
          q: "What are A and B?",
          options: ["A 1, B 2", "A 4, B 4", "A 1, B 4", "A 2, B 2"],
          answer: 0,
          why: "`watchEffect` runs once right away (1). The writes don't run it: its scheduler queues a job, and the queue dedupes. The queue flushes once, in a microtask (2). Component renders go through the same queue.",
        },
        {
          t: "code",
          lang: "js",
          src: `const queue = new Set();
let flushing = null;

function queueJob(job) {
  queue.add(job);                       // a Set: queueing twice is a no-op
  flushing ??= Promise.resolve().then(() => {
    for (const j of queue) j();
    queue.clear();
    flushing = null;
  });
}
const nextTick = () => flushing ?? Promise.resolve();

// a component's render effect, batched
const render = effect(renderFn, { scheduler: () => queueJob(render.run) });`,
          mark: [5, 6, 12],
          note: "Vue's real queue is sorted by component id, so a parent always renders before its children. `nextTick()` is the promise for the current flush.",
        },
        {
          t: "quiz",
          q: "A watcher has to measure the DOM that its own state change produces. Which option?",
          options: ["the default, `flush: 'pre'`", "`flush: 'post'`", "`flush: 'sync'`", "`immediate: true`"],
          answer: 1,
          why: "Default watchers run before the owner component re-renders, so they see the old DOM. `post` runs after the patch. `sync` runs on every single write with no batching: fine for a boolean, a trap for an array you push to in a loop.",
        },
      ],
    },
    {
      title: "watch vs watchEffect",
      beats: [
        {
          t: "table",
          head: ["", "`watch(source, cb)`", "`watchEffect(fn)`", "`computed(fn)`"],
          rows: [
            ["tracks", "only the source", "everything `fn` reads synchronously", "everything `fn` reads"],
            ["first run", "on the first change (`immediate` opts in)", "immediately", "on the first read"],
            ["old value", "yes: `(value, oldValue)`", "no", "`computed((prev) => ...)`, 3.4+"],
            ["for", "a side effect on one specific change", "a side effect that follows what it reads", "derived values, never side effects"],
          ],
        },
        {
          t: "predict",
          lang: "js",
          src: `const state = reactive({ user: { name: "Ada" } });
watch(() => state.user, () => console.log("getter"));
watch(state, () => console.log("direct"));

state.user.name = "Grace";`,
          q: "What logs after the next tick?",
          options: ["getter, direct", "direct", "getter", "nothing"],
          answer: 1,
          why: "Watching a reactive object directly is implicitly deep. The getter tracks only `state.user`, which still points at the same object, so it fires only when `user` is replaced. `{ deep: true }` changes that, at a price.",
        },
        {
          t: "predict",
          lang: "js",
          src: `const n = ref(0);
watch(n, () => console.log("watch"));
watchEffect(() => console.log("effect", n.value));

n.value = 1;
n.value = 0;`,
          q: "After the next tick, what has been logged in total?",
          options: ["effect 0", "effect 0, effect 0", "effect 0, watch, effect 0", "effect 0, effect 1, watch, effect 0"],
          answer: 1,
          why: "Both jobs were queued, but they run at flush, when `n` is 0 again. `watch` compares with its old value, sees no change and skips the callback. `watchEffect` has nothing to compare: it just re-runs.",
        },
        {
          t: "predict",
          lang: "js",
          src: `watchEffect(async () => {
  const q = query.value;                       // before the await
  const res = await fetch("/search?q=" + q);
  results.value = rank(await res.json(), mode.value); // after it
});`,
          q: "Which changes re-run this effect?",
          options: ["`query` and `mode`", "only `query`", "only `mode`", "neither: async effects aren't tracked"],
          answer: 1,
          why: "Tracking is on only while the function runs synchronously. After the first `await` the effect is off the stack, so the `mode` read subscribes nothing. Read every dependency before the first await, or use `watch([query, mode], ...)`.",
        },
        {
          t: "code",
          lang: "js",
          src: `import { watch, onWatcherCleanup } from "vue";

watch(id, async (id) => {
  const ac = new AbortController();
  onWatcherCleanup(() => ac.abort()); // before the next run, and on stop
  const res = await fetch(\`/api/users/\${id}\`, { signal: ac.signal });
  user.value = await res.json();
});`,
          mark: [5],
          note: "Vue 3.5+, and only before the first `await`. The abort also kills the race where a slow old response lands after a fast new one.",
        },
        {
          t: "pitfall",
          h: "`deep: true` on big data costs O(n) per change",
          x: "A deep watcher walks every nested property to subscribe to it, and walks again on every trigger. On a 10k-row table that's a full traversal per keystroke. Watch a getter of what you need, give `deep` a depth (3.5+), or bump a version ref on writes.",
        },
        {
          t: "pitfall",
          h: "A watcher made after `await` outlives its component",
          x: "Watchers created synchronously in `setup` stop on unmount. One created after an `await`, or in a `setTimeout`, belongs to no component: it keeps running, holding everything it closed over, after the page is gone. Keep the stop handle and call it.",
        },
        {
          t: "pitfall",
          h: "Passing `props.id` to a composable passes a number",
          x: "`useUser(props.id)` reads the prop once, and the composable never sees a change. Pass `() => props.id` or `toRef(props, 'id')`, and call `toValue()` inside. Destructured props (3.5+) are no different: `useUser(() => id)`.",
        },
      ],
    },
    {
      title: "Raw data: markRaw and shallowRef",
      beats: [
        {
          t: "predict",
          lang: "js",
          src: `import * as THREE from "three";

const state = reactive({ mesh: new THREE.Mesh(geometry, material) });
state.mesh.modelViewMatrix;`,
          q: "What happens on the last line?",
          options: ["Returns the matrix", "Returns a reactive proxy of the matrix", "Throws a TypeError", "Warns, then returns the raw matrix"],
          answer: 2,
          why: "three.js defines `modelViewMatrix` as read-only and non-configurable. A Proxy `get` must return exactly that value, but Vue returns a deep proxy of it, so the engine throws. Deep proxies and foreign objects don't mix.",
        },
        {
          t: "play",
          mode: "html",
          title: "the cost of deep reactivity",
          html: `${VUE}
<p>200,000 rows, summed inside a computed. Results in the console.</p>`,
          css: "",
          js: `const { ref, shallowRef, markRaw, computed } = Vue;
const make = () => Array.from({ length: 200000 }, (_, i) => ({ x: i, y: -i }));
const sum = (rows) => {
  let s = 0;
  for (const r of rows) s += r.x + r.y;
  return s;
};

function time(label, source) {
  const total = computed(() => sum(source.value));
  const t = performance.now();
  total.value;
  console.log(label.padEnd(12), (performance.now() - t).toFixed(1), "ms");
}

time("plain", { value: make() });
time("ref", ref(make()));
time("shallowRef", shallowRef(make()));
time("markRaw", ref(markRaw(make())));`,
          task: "Compare the numbers. Then call `sum` on the `ref` version once before timing it: proxies are now cached, and it is still slow. Most of the cost is tracking 400,000 reads.",
        },
        {
          t: "code",
          lang: "js",
          src: `import { shallowRef, markRaw, triggerRef } from "vue";

const scene = markRaw(new THREE.Scene()); // never proxied, anywhere
const rows = shallowRef([]);              // only .value is tracked

rows.value = await fetchRows();           // replace: triggers
rows.value.push(extra);                   // mutate: triggers nothing...
triggerRef(rows);                         // ...until you say so`,
          mark: [3, 4, 8],
          note: "`markRaw` sticks to the object, so it stays raw even inside reactive state later. `shallowRef` is per ref: the same array put in a `ref()` elsewhere becomes deep again.",
        },
        {
          t: "pitfall",
          h: "`state = reactive(newData)` orphans every reader",
          x: "The template, computeds and watchers subscribed to the old proxy. Rebinding the variable reaches none of them. Keep state you replace in a `ref` and assign `.value`. `Object.assign(state, data)` also works, but never deletes stale keys.",
        },
        {
          t: "quiz",
          q: "A chart library takes a 50,000-point array and redraws when you hand it a new one. How should the Vue component hold it?",
          options: ["`reactive([])`, mutated in place", "`ref([])` with `deep: true` watcher", "`shallowRef([])`, replaced with a new array on change", "A plain `let`"],
          answer: 2,
          why: "The library never needs per-point tracking, only \"the array changed\". `shallowRef` tracks exactly that, for free. A plain `let` would never re-render; deep reactivity would proxy 50,000 objects the chart then reads through traps.",
        },
      ],
    },
    {
      title: "The compiler knows what's static",
      beats: [
        {
          t: "code",
          lang: "html",
          file: "Inbox.vue",
          src: `<template>
  <div>
    <h1>Inbox</h1>
    <p class="hint">Static text</p>
    <span :class="cls">{{ count }}</span>
    <button @click="inc">+1</button>
  </div>
</template>`,
        },
        {
          t: "code",
          lang: "js",
          file: "compiled by Vue 3.5",
          src: `export function render(_ctx, _cache) {
  return (_openBlock(), _createElementBlock("div", null, [
    _cache[1] || (_cache[1] = _createElementVNode("h1", null, "Inbox", -1 /* CACHED */)),
    _cache[2] || (_cache[2] = _createElementVNode("p", { class: "hint" }, "Static text", -1 /* CACHED */)),
    _createElementVNode("span", {
      class: _normalizeClass(_ctx.cls)
    }, _toDisplayString(_ctx.count), 3 /* TEXT, CLASS */),
    _createElementVNode("button", {
      onClick: _cache[0] || (_cache[0] = (...args) => (_ctx.inc && _ctx.inc(...args)))
    }, "+1")
  ]))
}`,
          mark: [3, 4, 7, 9],
          note: "Static nodes are built once and cached per instance. The click handler is cached too, so the button never needs patching.",
        },
        { t: "say", h: "Patch flags", x: "`3` is `TEXT | CLASS`: a bitmask saying this span can only change its text and its class. The renderer tests bits (`flag & CLASS`) instead of diffing every prop. `-1` means cached: never diff it." },
        {
          t: "quiz",
          q: "`openBlock()` makes the root collect every descendant vnode with a positive patch flag into `dynamicChildren`. For the template above, what's in it?",
          options: ["all four children", "the span and the button", "only the span", "nothing: it's all cached"],
          answer: 2,
          why: "The `h1` and `p` are cached, and the button has no flag because its handler is cached. On re-render Vue walks one node, not the tree. Diff cost is O(dynamic nodes), not O(template size).",
        },
        { t: "say", h: "Blocks", x: "`v-if` and `v-for` can change the tree's shape, so each opens a block of its own, and the parent diffs those structurally. Inside a block the shape is fixed, which is what makes the flat list of dynamic nodes safe." },
        {
          t: "quiz",
          q: "Why can't React skip static parts of a component the way Vue's compiler does?",
          options: ["JSX is slower to parse than templates", "The tree is the return value of arbitrary JS that re-runs every render, so without memoization all of it gets diffed", "React's diff is O(n^2)", "Browsers optimise templates natively"],
          answer: 1,
          why: "A template is a constrained language: the compiler sees every binding. React re-runs a function that can return anything. Solid uses JSX too, but runs components once, so it's the model, not the syntax. React's answer is memoization, in *React for real*.",
        },
        {
          t: "pitfall",
          h: "`h()` render functions opt out of all of this",
          x: "Vnodes you build with `h()` carry no patch flags and no blocks, so Vue falls back to a full diff of that subtree. Fine for a small, highly dynamic widget. For a big list, a template is faster, not just prettier.",
        },
        { t: "say", h: "Vapor mode", x: "Vapor mode, opt-in and arriving with Vue 3.6, drops vnodes for `<script setup>` components. The template compiles to DOM creation code plus one effect per binding, the way Solid works. No block walk, no diff." },
      ],
    },
    {
      title: "Options API, and signals everywhere",
      beats: [
        {
          t: "compare",
          a: {
            label: "Options API",
            lang: "js",
            src: `export default {
  data: () => ({ query: "", rows: [] }),
  computed: {
    hits() {
      return this.rows.filter((r) => r.name.includes(this.query));
    },
  },
  watch: {
    async query(q) { this.rows = await fetchRows(q); },
  },
};`,
          },
          b: {
            label: "Composition API",
            lang: "js",
            src: `export function useSearch() {
  const query = ref("");
  const rows = shallowRef([]);
  const hits = computed(() =>
    rows.value.filter((r) => r.name.includes(query.value)));
  watch(query, async (q) => { rows.value = await fetchRows(q); });
  return { query, hits };
}`,
          },
          x: "Same machinery: `data()` goes through `reactive()`, `computed:` through `computed()`. The difference is packaging: one feature in one function you can move, test and reuse, and pick `shallowRef` where it pays.",
        },
        {
          t: "table",
          head: ["", "state", "derived", "effect"],
          rows: [
            ["Vue", "`ref(0)`, read `.value`", "`computed(fn)`", "`watchEffect(fn)`"],
            ["Solid", "`createSignal(0)`: a getter and a setter", "`createMemo(fn)`", "`createEffect(fn)`"],
            ["Preact Signals", "`signal(0)`, read `.value`", "`computed(fn)`", "`effect(fn)`"],
            ["Angular", "`signal(0)`, read by calling it", "`computed(fn)`", "`effect(fn)`"],
            ["TC39 proposal, Stage 1", "`new Signal.State(0)`", "`new Signal.Computed(fn)`", "none: `Signal.subtle.Watcher` to build one"],
          ],
        },
        { t: "say", x: "Same primitive, over a decade old: a value container that tracks reads and notifies on writes. Vue's own docs put `ref` next to Knockout observables. What differs is the scheduler and what a re-run touches." },
        {
          t: "quiz",
          q: "Why does the TC39 signals proposal ship no `effect()`?",
          options: ["Effects can't be implemented in an engine", "When and how effects run is tied to each framework's rendering and batching, so frameworks build them on a low-level Watcher", "Effects leak memory", "Effects are planned for Stage 2"],
          answer: 1,
          why: "The proposal standardizes the graph: state, lazy cached computeds, auto-tracking. Scheduling stays with the framework. Vue, Solid and Angular could then share signals and libraries while keeping their own update loops.",
        },
        { t: "say", h: "Preact's shortcut", x: "Preact Signals bends a vdom framework the same way: pass the signal itself, `{count}`, into JSX and it binds straight to the text node, no component re-render. Read `count.value` in the body and the component re-renders as usual." },
        {
          t: "mission",
          h: "Add a scheduler, watchEffect and watch",
          x: "On top of your mini system: a job queue that flushes once per microtask, `nextTick()`, `watchEffect(fn)`, and `watch(getter, cb)` that is lazy, passes `(value, oldValue)` and skips the callback when the value didn't change. Three sync writes must cause one run of each.",
          hint: "`watch` is a lazy effect over the getter whose scheduler queues a job. The job calls `e.run()` for the new value, compares it with the old one, then calls `cb`.",
          solution: {
            lang: "js",
            src: `const queue = new Set();
let flushing = null;
function queueJob(job) {
  queue.add(job);
  flushing ??= Promise.resolve().then(() => {
    for (const j of queue) j();
    queue.clear();
    flushing = null;
  });
}
const nextTick = () => flushing ?? Promise.resolve();

function watchEffect(fn) {
  const e = effect(fn, { scheduler: () => queueJob(e.run) });
}

function watch(getter, cb) {
  let old;
  const job = () => {
    const value = e.run();             // re-run the getter, re-track
    if (Object.is(value, old)) return; // changed and back: no callback
    cb(value, old);
    old = value;
  };
  const e = effect(getter, { lazy: true, scheduler: () => queueJob(job) });
  old = e.run();                       // track, remember the start value
}`,
          },
        },
      ],
    },
  ],
  nobodyTells: [
    "Vue components are memoized by default: a parent re-render skips every child whose props and slots didn't change. There's no `memo()` to forget.",
    "`watch` compares values at flush time. Change a ref and change it back in one tick and the callback never runs; `watchEffect` still re-runs.",
    "A computed nobody reads never runs. A broken one can sit silently in a component until the first template that uses it.",
    "Destructured `defineProps` (3.5+) are reactive only because the compiler rewrites `foo` to `props.foo`. Pass `foo` into a function and you pass a value.",
    "`toRaw(x)` reads without proxies or tracking. In a hot loop over big reactive data it's often the whole fix.",
    "`onRenderTriggered((e) => console.log(e.key, e.type))` tells you which write re-rendered a component. Dev builds only.",
    "Every reactivity system that cleans up dependencies must copy the subscriber set before notifying, or a Set iterator loops forever.",
  ],
  glossary: [
    ["fine-grained reactivity", "Recording which code read which value, so a write re-runs only that code instead of re-rendering a tree."],
    ["reactive()", "Returns a deep Proxy of an object whose reads subscribe and whose writes notify. Cached per object."],
    ["ref", "A box with a tracked `.value`, because a Proxy can't intercept a local variable."],
    ["track / trigger", "The two halves: a read inside an effect subscribes it; a write re-runs or schedules the subscribers."],
    ["effect", "A function run with itself set as the active subscriber, so everything it reads becomes its dependency."],
    ["dependency cleanup", "Dropping subscriptions an effect's latest run no longer read, so stale branches stop waking it."],
    ["computed", "A lazy, cached effect with a dirty flag. Writes mark it; reads recompute it when needed."],
    ["scheduler", "A per-effect hook that queues the re-run instead of running it now. Vue flushes the queue in a microtask."],
    ["nextTick", "A promise for the end of the current flush, after queued renders and watchers have run."],
    ["patch flag", "A bitmask the compiler puts on a vnode naming what can change (text, class, props) so the diff skips the rest."],
    ["block", "A vnode that collects its dynamic descendants in a flat `dynamicChildren` array, the only nodes re-diffed."],
    ["markRaw / shallowRef", "Opt-outs from deep proxies: never proxy this object, or track only `.value`."],
    ["Vapor mode", "An opt-in compile target arriving with Vue 3.6, with no virtual DOM: templates become DOM code plus per-binding effects."],
    ["signal", "The cross-framework name for a value container with read tracking and write notification."],
  ],
  explain: "Explain to a friend how `computed` knows when to recompute, starting from what happens when an effect reads a property on a Proxy.",
};
