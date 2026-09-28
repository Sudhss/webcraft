export default {
  id: "react-from-scratch",
  n: 16,
  part: "D",
  title: "React from scratch",
  hook: "Build a working React in a few hundred lines: elements, diffing, hooks, a scheduler, Fiber. After that, nothing in it is magic.",
  minutes: 100,
  levels: ["use", "understand", "rebuild"],
  sections: [
    {
      title: "Elements are plain objects",
      beats: [
        { t: "say", x: "JSX is not HTML. `<a href=\"/x\">hi</a>` compiles to a function call that returns a **plain object**: a description of the UI, not the UI. Making one costs an allocation, not a DOM node." },
        {
          t: "code",
          lang: "js",
          file: "mini-react.js",
          src: `const text = (v) => ({ type: "TEXT", props: { nodeValue: String(v), children: [] } });

function h(type, props, ...children) {
  return {
    type,
    props: {
      ...props,
      children: children
        .flat(Infinity)
        .filter((c) => c != null && typeof c !== "boolean" && c !== "")
        .map((c) => (typeof c === "object" ? c : text(c))),
    },
  };
}`,
          mark: [10],
          note: "`null`, `undefined` and booleans vanish, which is why `{cond && <X/>}` works. Numbers don't: `{list.length && <X/>}` renders a lone `0`.",
        },
        {
          t: "play",
          mode: "js",
          title: "the element tree",
          js: `const text = (v) => ({ type: "TEXT", props: { nodeValue: String(v), children: [] } });
function h(type, props, ...children) {
  return {
    type,
    props: {
      ...props,
      children: children
        .flat(Infinity)
        .filter((c) => c != null && typeof c !== "boolean" && c !== "")
        .map((c) => (typeof c === "object" ? c : text(c))),
    },
  };
}

const items = ["milk", "eggs"];
const tree = h("ul", { id: "list" },
  items.map((it) => h("li", null, it)),
  items.length === 0 && h("li", null, "empty"),
  h("li", null, "total: ", items.length)
);
console.log(JSON.stringify(tree, null, 2));`,
          task: "Count the `li` children. Then set `items` to `[]` and predict the tree before you run it.",
        },
        {
          t: "predict",
          lang: "js",
          src: `h("p", null, 0 && "zero", "", null, "hi")`,
          q: "With our `h`, how many children does the `p` get?",
          options: ["1", "2", "3", "4"],
          answer: 1,
          why: "`0 && x` is `0`, and numbers render, so you get TEXT \"0\" and TEXT \"hi\". `\"\"` and `null` are dropped. This is the `{count && <Badge/>}` bug that ships a stray 0 to production.",
        },
        {
          t: "quiz",
          q: "Real React elements carry `$$typeof`, set to a Symbol. Why a Symbol?",
          options: ["Faster type checks", "JSON can't hold a Symbol, so an object from an API response can't pose as an element", "To freeze elements", "For DevTools labels"],
          answer: 1,
          why: "If your API returns `{type: 'div', props: {dangerouslySetInnerHTML: ...}}` and you render it, React refuses: no Symbol, not an element. JSON can't forge one. It's XSS armour, not bookkeeping.",
        },
        { t: "say", h: "Flattening is a small lie", x: "Our `h` flattens arrays. Real React keeps an array as **one nested child slot**, so a static sibling after a `.map()` never changes position. That's why keys are demanded only inside arrays." },
      ],
    },
    {
      title: "Render: objects to DOM",
      beats: [
        {
          t: "rebuild",
          h: "Build render()",
          x: "Walk the tree, make one DOM node per element, set its props, recurse into children, append. That's the first version of `ReactDOM.render` in a dozen lines. Events are missing: add them.",
          mode: "html",
          html: `<div id="root"></div>`,
          css: `body { font-family: system-ui; padding: 16px; }\nbutton { font: inherit; padding: 6px 12px; }`,
          js: `const text = (v) => ({ type: "TEXT", props: { nodeValue: String(v), children: [] } });
const h = (type, props, ...ch) => ({
  type,
  props: { ...props, children: ch.flat().filter((c) => c != null && c !== false).map((c) => (typeof c === "object" ? c : text(c))) },
});

function render(el, parent) {
  const dom = el.type === "TEXT"
    ? document.createTextNode(el.props.nodeValue)
    : document.createElement(el.type);
  if (el.type !== "TEXT") {
    for (const [k, v] of Object.entries(el.props)) {
      if (k === "children") continue;
      // TODO: props starting with "on" should become event listeners
      if (k === "style") Object.assign(dom.style, v);
      else dom[k] = v;
    }
  }
  el.props.children.forEach((c) => render(c, dom));
  parent.appendChild(dom);
}

render(
  h("div", null,
    h("h2", { style: { color: "#d49a3a" } }, "Mini React"),
    h("p", { className: "lead" }, "Rendered from plain objects."),
    h("button", { onClick: () => console.log("clicked") }, "Click me")
  ),
  document.getElementById("root")
);`,
          task: "The button does nothing: `dom.onClick` isn't a real property. Turn every `on*` prop into `addEventListener` with the lowercased event name.",
        },
        {
          t: "predict",
          lang: "js",
          src: `function update() {
  root.innerHTML = "";
  render(App(), root);   // rebuild everything from scratch
}
setInterval(update, 1000);`,
          q: "A user is typing in an `<input>` inside `App` when the timer fires. What happens?",
          options: ["Nothing visible", "The text survives but the caret jumps", "Focus and the typed text are gone", "The browser throws"],
          answer: 2,
          why: "You destroyed that input and made a new one. Focus, caret, selection, scroll offset, a playing video, running transitions: all lived on the old node. Diffing exists to **keep DOM nodes alive**, more than for speed.",
        },
        {
          t: "play",
          mode: "html",
          title: "rebuild everything, lose everything",
          html: `<div id="root"></div>`,
          css: `body { font-family: system-ui; padding: 16px; }`,
          js: `const root = document.getElementById("root");
let tick = 0;

function view() {
  const wrap = document.createElement("div");
  wrap.innerHTML = "<p>tick " + tick + "</p><input placeholder='type here'>";
  return wrap;
}

root.replaceChildren(view());
setInterval(() => {
  tick++;
  root.replaceChildren(view()); // the naive "re-render"
}, 1500);`,
          task: "Type in the box: every 1.5 s your text dies. Change the timer so only the `<p>` text updates and the input survives. You just wrote a diff.",
        },
        { t: "say", x: "So the real job: given the old tree and a new one, touch the DOM as little as possible, and never replace a node that could be kept. That job is **reconciliation**." },
      ],
    },
    {
      title: "Diffing in O(n)",
      beats: [
        { t: "say", x: "The exact minimum edit script between two trees costs about O(n^3). At 1,000 nodes that's a billion steps per keystroke. React trades exactness for O(n) with two bets that are almost always right." },
        {
          t: "steps",
          h: "The rules that make it linear",
          items: [
            "Compare level by level. A node is matched only against the node in the same slot of the old tree, never searched for elsewhere.",
            "Different `type` (`div` vs `span`, `A` vs `B`): destroy the whole old subtree, state included, and build the new one.",
            "Same type: keep the DOM node, diff its props, recurse into children.",
            "Among siblings, a `key` says which old child is which new child, so a move is a move, not n rewrites.",
          ],
        },
        {
          t: "code",
          lang: "js",
          src: `function update(dom, prev, next) {
  let writes = 0;
  for (const k in { ...prev, ...next }) {
    if (k === "children" || k === "key" || prev[k] === next[k]) continue;
    writes++;
    if (k.startsWith("on")) {
      const ev = k.slice(2).toLowerCase();
      if (prev[k]) dom.removeEventListener(ev, prev[k]);
      if (next[k]) dom.addEventListener(ev, next[k]);
    } else dom[k] = next[k] ?? "";
  }
  return writes;
}`,
          note: "O(props). An inline `onClick={() => ...}` is a new function every render, so it always differs. React avoids re-binding with one delegated listener per event at the root.",
        },
        {
          t: "rebuild",
          h: "Build patch(), then add keys",
          x: "A full diff: create, update, replace, remove, and children matched **by index**. Keys already sit on the elements, and the diff ignores them. Watch the write count on prepend vs append.",
          mode: "html",
          html: `<button id="prepend">prepend</button> <button id="append">append</button>
<p id="log">&nbsp;</p>
<div id="root"></div>`,
          css: `body { font-family: system-ui; padding: 16px; }\n#log { color: #d49a3a; }`,
          js: `const text = (v) => ({ type: "TEXT", props: { nodeValue: String(v), children: [] } });
const h = (type, props, ...ch) => ({
  type,
  props: { ...props, children: ch.flat().filter((c) => c != null && c !== false).map((c) => (typeof c === "object" ? c : text(c))) },
});
function update(dom, prev, next) {
  let writes = 0;
  for (const k in { ...prev, ...next }) {
    if (k === "children" || k === "key" || prev[k] === next[k]) continue;
    writes++;
    if (k.startsWith("on")) {
      const ev = k.slice(2).toLowerCase();
      if (prev[k]) dom.removeEventListener(ev, prev[k]);
      if (next[k]) dom.addEventListener(ev, next[k]);
    } else dom[k] = next[k] ?? "";
  }
  return writes;
}
function create(el) {
  const dom = el.type === "TEXT" ? document.createTextNode("") : document.createElement(el.type);
  update(dom, { children: [] }, el.props);
  el.props.children.forEach((c) => dom.appendChild(create(c)));
  return dom;
}
let ops = 0;
function patch(parent, dom, old, el) {
  if (!old) { ops++; parent.appendChild(create(el)); return; }
  if (!el) { ops++; dom.remove(); return; }
  if (old.type !== el.type) { ops++; dom.replaceWith(create(el)); return; }
  ops += update(dom, old.props, el.props);
  const kids = [...dom.childNodes]; // snapshot before we mutate
  const n = Math.max(old.props.children.length, el.props.children.length);
  for (let i = 0; i < n; i++) patch(dom, kids[i], old.props.children[i], el.props.children[i]);
}

let items = ["b", "c", "d"], n = 0;
const App = () => h("ul", null, items.map((x) => h("li", { key: x }, x)));
const root = document.getElementById("root");
let vtree = App();
root.appendChild(create(vtree));

function rerender() {
  const next = App();
  ops = 0;
  patch(root, root.firstChild, vtree, next);
  vtree = next;
  document.getElementById("log").textContent = "last update: " + ops + " DOM writes";
}
document.getElementById("prepend").onclick = () => { items = ["n" + n++, ...items]; rerender(); };
document.getElementById("append").onclick = () => { items = [...items, "n" + n++]; rerender(); };`,
          task: "Prepend costs one write per row plus one. Make it cost 1: in `patch`, map old children by `props.key` and move existing DOM nodes with `insertBefore`.",
        },
        {
          t: "predict",
          lang: "text",
          src: `old: <li>A</li> <li>B</li> <li>C</li>
new: <li>Z</li> <li>A</li> <li>B</li> <li>C</li>`,
          q: "Diffing children by index, how many DOM operations?",
          options: ["1 insert", "3 text updates and 1 insert", "4 inserts", "1 insert and 3 removals"],
          answer: 1,
          why: "Slot 0 was A, now Z: rewrite. Slot 1 was B, now A: rewrite. Every slot shifts, then one node is appended. Prepend is O(n) writes without keys and O(1) with them.",
        },
        { t: "viz", name: "reconcile", props: { before: ["A", "B", "C", "D"], after: ["Z", "A", "B", "C", "D"] } },
        {
          t: "pitfall",
          h: "The input that breaks keyless diffing",
          x: "Rows with state on the DOM node (an `<input>`, a checkbox, a playing video, a component's hooks) keep it when diffed by index. After a prepend the labels shift but the nodes stay: the note you typed next to Ada now sits next to someone else.",
        },
        {
          t: "play",
          mode: "html",
          title: "state glued to the wrong row",
          html: `<button id="add">prepend</button>\n<ul id="list"></ul>`,
          css: `body { font-family: system-ui; padding: 16px; }\nli { margin: 6px 0; }\nspan { display: inline-block; width: 70px; }`,
          js: `let people = ["Ada", "Linus", "Grace"];
const list = document.getElementById("list");

function renderByIndex() {
  people.forEach((name, i) => {
    let li = list.children[i];
    if (!li) {
      li = document.createElement("li");
      li.innerHTML = "<span></span><input placeholder='note'>";
      list.appendChild(li);
    }
    li.firstChild.textContent = name; // only the label is diffed
  });
}

renderByIndex();
let n = 0;
document.getElementById("add").onclick = () => {
  people = ["New" + ++n, ...people];
  renderByIndex();
};`,
          task: "Type a note next to Ada, press prepend. Then fix it: keep a `Map` from name to `<li>` and reorder nodes with `insertBefore` instead of relabeling.",
        },
        {
          t: "predict",
          lang: "text",
          src: `keyed, old: A B C D
keyed, new: D A B C`,
          q: "React walks the new list, tracking the highest old index placed so far, and moves any node whose old index is below it. How many moves?",
          options: ["1", "3", "4", "0"],
          answer: 1,
          why: "D (old index 3) goes first, so the mark is 3. A, B and C all have old index < 3: three moves. The mirror change, first to last, costs one. Vue 3 computes a longest increasing subsequence to always hit the minimum.",
        },
        {
          t: "quiz",
          q: "`<div><Counter/></div>` becomes `<section><Counter/></section>` on the next render. Counter's state?",
          options: ["Kept: same component, same position", "Reset: the parent's type changed, so everything below it is rebuilt", "Kept if Counter has a key", "React warns and keeps it"],
          answer: 1,
          why: "Rule two: a different type at a slot destroys the subtree. Counter unmounts, its state and DOM go. Conditionally wrapping a subtree in a new element is a classic state-loss bug.",
        },
      ],
    },
    {
      title: "Components are just functions",
      beats: [
        { t: "say", x: "A component is a function from props to elements. Its `type` **is** the function. Rendering it means calling it and diffing whatever it returns against what it returned last time." },
        {
          t: "code",
          lang: "js",
          src: `// Unwrap components until we reach a host element ("div", "TEXT")
function resolve(el) {
  while (typeof el.type === "function") el = el.type(el.props);
  return el;
}

const Greeting = ({ name }) => h("p", null, "hi ", name);
resolve(h(Greeting, { name: "Ada" }));
// -> { type: "p", props: { children: [TEXT "hi ", TEXT "Ada"] } }`,
          note: "Good enough for stateless components. React keeps the component as its own node in the tree and compares `type` by reference **before** unwrapping.",
        },
        {
          t: "predict",
          lang: "jsx",
          src: `function Form() {
  const Field = () => <input placeholder="name" />;
  const [n, setN] = useState(0);
  return (
    <div>
      <Field />
      <button onClick={() => setN(n + 1)}>{n}</button>
    </div>
  );
}`,
          q: "You type in the input, then click the button. Your text?",
          options: ["Stays", "Wiped: `Field` is a new function each render, so its type changed", "Stays, caret resets", "React throws"],
          answer: 1,
          why: "`type` is compared with `===`. A component defined inside render is a new function every time, so rule two fires: unmount, remount, fresh DOM. Define components at module level.",
        },
        {
          t: "pitfall",
          h: "New component types, in disguise",
          x: "Same bug, harder to spot: `styled(Box)` or `memo(Row)` called inside a component, or a higher-order component applied in render. Each makes a new type per render, so the subtree remounts every time: lost focus, re-run effects, repeated fetches.",
        },
        {
          t: "quiz",
          q: "Why must a component be a node in the tree instead of just inlining its output?",
          options: ["Faster diffing", "Its state needs a home that survives between calls, and a stack frame dies on return", "DevTools needs it", "Class support"],
          answer: 1,
          why: "Locals die when the function returns. The node for that component, found again at the same position with the same type, is where hooks, effects and context subscriptions live between renders.",
        },
      ],
    },
    {
      title: "Hooks: an array and a cursor",
      beats: [
        { t: "say", x: "`useState` takes no name, yet returns the right value every time. Each component node owns an **array of hook slots** and a cursor reset to 0 before each render. The Nth hook call gets slot N." },
        {
          t: "code",
          lang: "js",
          src: `let current, cursor;             // the node being rendered, and the slot index

function renderComponent(node) {
  current = node;
  cursor = 0;
  node.hooks ??= [];
  return node.type(node.props);
}

function useState(initial) {
  const node = current, hooks = node.hooks, i = cursor++;
  if (i >= hooks.length) hooks.push(typeof initial === "function" ? initial() : initial);
  const set = (v) => {
    hooks[i] = typeof v === "function" ? v(hooks[i]) : v;
    scheduleRender(node);
  };
  return [hooks[i], set];
}`,
          mark: [11, 12],
          note: "The setter closes over its node and slot index, so it still works after render returns. React also keeps it identical across renders; ours makes a new one each time.",
        },
        {
          t: "predict",
          lang: "js",
          src: `const hooks = []; let cursor = 0;
function useState(init) {
  const i = cursor++;
  if (i >= hooks.length) hooks.push(init);
  return [hooks[i]];
}
let loggedIn = false;
function Profile() {
  if (loggedIn) useState("t0k3n");
  const [name] = useState("Ada");
  const [age] = useState(36);
  return { name, age };
}
cursor = 0; Profile();
loggedIn = true;
cursor = 0; console.log(Profile());`,
          q: "What does the second render print?",
          options: ["{ name: 'Ada', age: 36 }", "{ name: 36, age: 36 }", "{ name: 't0k3n', age: 'Ada' }", "It throws"],
          answer: 1,
          why: "The new hook took slot 0 (\"Ada\"). `name` read slot 1: 36. `age` got a fresh slot 2, initialised to 36. React throws when the count changes, but two swapped hooks of the same kind it can't detect at all.",
        },
        {
          t: "play",
          mode: "js",
          title: "break the rules of hooks",
          js: `const hooks = [];
let cursor = 0;
function useState(init) {
  const i = cursor++;
  if (i >= hooks.length) hooks.push(init);
  return [hooks[i], (v) => (hooks[i] = v)];
}
function render(Comp) {
  cursor = 0;
  return Comp();
}

let loggedIn = false;
function Profile() {
  if (loggedIn) useState("t0k3n");
  const [name] = useState("Ada");
  const [age] = useState(36);
  return { name, age };
}

console.log("render 1", render(Profile));
loggedIn = true;
console.log("render 2", render(Profile));
console.log("slots", hooks);`,
          task: "Run it and read the slots. Then always call the token hook and only *use* its value when logged in. Both renders now agree.",
        },
        {
          t: "quiz",
          q: "Why identify hooks by call order instead of `useState('name', 'Ada')` with explicit keys?",
          options: ["Keys are slower", "Two calls to the same custom hook would collide on its keys; call order gives each call site its own slot for free", "Keys break minifiers", "Historical accident"],
          answer: 1,
          why: "Call `useWindowSize()` twice and both would fight over the same key. Positional slots compose: any hook can call any hooks, nested any depth, with zero naming. The price is the rules of hooks.",
        },
        {
          t: "pitfall",
          h: "An early return is a conditional hook",
          x: "`if (!user) return null;` above a `useEffect` is the same bug: renders with a user call one more hook than renders without. React throws *Rendered more hooks than during the previous render*. Put every hook above the first `return`.",
        },
      ],
    },
    {
      title: "setState, batching, the scheduler",
      beats: [
        { t: "say", x: "Three `setState` calls in one click must not render three times. So a setter never renders. It marks its node dirty and queues **one** render for later." },
        {
          t: "code",
          lang: "js",
          src: `const dirty = new Set();
let queued = false;

function scheduleRender(node) {
  dirty.add(node);
  if (queued) return;
  queued = true;
  queueMicrotask(() => {
    queued = false;
    const nodes = [...dirty];
    dirty.clear();
    nodes.forEach(rerender);   // React: top-down, each node at most once
  });
}`,
          note: "A microtask runs after the current handler finishes and before the browser paints, so every update in the same tick collapses into one render.",
        },
        {
          t: "rebuild",
          h: "Mini React with useState",
          x: "The whole thing: elements, a diff, one hooks array, and a microtask scheduler. The button calls its setter three times. Count what happens.",
          mode: "html",
          html: `<div id="root"></div>`,
          css: `body { font-family: system-ui; padding: 16px; }\nbutton { font: inherit; padding: 6px 12px; }`,
          js: `const text = (v) => ({ type: "TEXT", props: { nodeValue: String(v), children: [] } });
const h = (type, props, ...ch) => ({
  type,
  props: { ...props, children: ch.flat().filter((c) => c != null && c !== false).map((c) => (typeof c === "object" ? c : text(c))) },
});
function update(dom, prev, next) {
  for (const k in { ...prev, ...next }) {
    if (k === "children" || prev[k] === next[k]) continue;
    if (k.startsWith("on")) {
      const ev = k.slice(2).toLowerCase();
      if (prev[k]) dom.removeEventListener(ev, prev[k]);
      if (next[k]) dom.addEventListener(ev, next[k]);
    } else dom[k] = next[k] ?? "";
  }
}
function create(el) {
  const dom = el.type === "TEXT" ? document.createTextNode("") : document.createElement(el.type);
  update(dom, { children: [] }, el.props);
  el.props.children.forEach((c) => dom.appendChild(create(c)));
  return dom;
}
function patch(parent, dom, old, el) {
  if (!old) return void parent.appendChild(create(el));
  if (!el) return void dom.remove();
  if (old.type !== el.type) return void dom.replaceWith(create(el));
  update(dom, old.props, el.props);
  const kids = [...dom.childNodes];
  const n = Math.max(old.props.children.length, el.props.children.length);
  for (let i = 0; i < n; i++) patch(dom, kids[i], old.props.children[i], el.props.children[i]);
}

const root = document.getElementById("root");
let hooks = [], cursor = 0, vtree = null, queued = false, renders = 0;
function useState(init) {
  const i = cursor++;
  if (i >= hooks.length) hooks.push(init);
  const set = (v) => {
    hooks[i] = typeof v === "function" ? v(hooks[i]) : v;
    if (!queued) { queued = true; queueMicrotask(flush); }
  };
  return [hooks[i], set];
}
function flush() {
  queued = false;
  cursor = 0;
  renders++;
  const next = App();
  if (vtree) patch(root, root.firstChild, vtree, next);
  else root.appendChild(create(next));
  vtree = next;
}

function App() {
  const [n, setN] = useState(0);
  const click = () => { setN(n + 1); setN(n + 1); setN(n + 1); };
  return h("div", null,
    h("button", { onClick: click }, "count ", n),
    h("p", null, "renders so far: ", renders));
}
flush();`,
          task: "One click: +1 and one render, not +3 and three. Make it +3 with updater functions. Then replace `queueMicrotask(flush)` with `flush()` and watch the render count.",
        },
        {
          t: "predict",
          lang: "jsx",
          src: `// n is 0
const onClick = () => {
  setN(n + 1);
  setN(n + 1);
  setN((c) => c + 1);
};`,
          q: "After the render, what is `n`?",
          options: ["1", "2", "3", "0"],
          answer: 1,
          why: "React queues updates and replays them in order at render: set 1, set 1 again (the closure still sees 0), then `c => c + 1` on 1 gives 2. Values replace; functions transform the latest.",
        },
        {
          t: "quiz",
          q: "React 17 batched only inside React event handlers. What did React 18 change?",
          options: ["Nothing", "With `createRoot`, updates in timeouts, promises and native listeners batch too", "It removed batching", "Batching needs `unstable_batchedUpdates` now"],
          answer: 1,
          why: "Under 17, two setStates after an `await` rendered twice. `createRoot` batches everything per tick. Need the DOM updated synchronously in between? `flushSync` forces it, at the cost of a render.",
        },
        {
          t: "pitfall",
          h: "setState doesn't change the variable",
          x: "`setN(5); console.log(n)` logs the old value, always. `n` is a `const` captured by this render's closure; the new value exists only in the next call of your function. Need it now? Compute it into a local and use that.",
        },
      ],
    },
    {
      title: "useEffect: deps and cleanup",
      beats: [
        { t: "say", x: "An effect is a callback parked in a hook slot and run **after** commit. Its deps decide whether it runs: each is compared with `Object.is` to last render's. Before it re-runs, the previous run's cleanup fires." },
        {
          t: "code",
          lang: "js",
          src: `const pending = [];

function useEffect(fn, deps) {
  const i = cursor++;
  const old = hooks[i];
  const changed = !old || !deps ||
    deps.length !== old.deps.length ||
    deps.some((d, k) => !Object.is(d, old.deps[k]));
  if (!changed) return;
  hooks[i] = { deps, cleanup: old?.cleanup };
  pending.push(() => {
    hooks[i].cleanup?.();          // old closure, old values
    hooks[i].cleanup = fn();       // may return the next cleanup
  });
}

// after the DOM is patched:
const commitEffects = () => pending.splice(0).forEach((run) => run());`,
          mark: [6, 7, 8],
          note: "No deps: runs after every render. `[]`: only after the first. React also runs every cleanup on unmount.",
        },
        {
          t: "predict",
          lang: "js",
          src: `function Chat({ room }) {
  console.log("render", room);
  useEffect(() => {
    console.log("connect", room);
    return () => console.log("disconnect", room);
  }, [room]);
}
render(Chat, { room: "general" });
render(Chat, { room: "general" });
render(Chat, { room: "random" });`,
          q: "What is logged after `render random`?",
          options: ["connect random", "disconnect general, connect random", "disconnect random, connect random", "connect random, disconnect general"],
          answer: 1,
          why: "Deps changed, so the *old* cleanup runs first, with the old closure (`general`), then the new effect. The second `general` render changed no deps, so it ran no effect at all.",
        },
        {
          t: "play",
          mode: "js",
          title: "effects, headless",
          js: `let hooks = [], cursor = 0;
const pending = [];
function useEffect(fn, deps) {
  const i = cursor++;
  const old = hooks[i];
  const changed = !old || !deps || deps.length !== old.deps.length ||
    deps.some((d, k) => !Object.is(d, old.deps[k]));
  if (!changed) return;
  hooks[i] = { deps, cleanup: old?.cleanup };
  pending.push(() => {
    hooks[i].cleanup?.();
    hooks[i].cleanup = fn();
  });
}
function render(Comp, props) {
  cursor = 0;
  Comp(props);
  pending.splice(0).forEach((run) => run()); // "commit"
}

function Chat({ room }) {
  console.log("render", room);
  useEffect(() => {
    console.log("  connect", room);
    return () => console.log("  disconnect", room);
  }, [room]);
}
render(Chat, { room: "general" });
render(Chat, { room: "general" });
render(Chat, { room: "random" });`,
          task: "Change the deps to `[{ room }]` and run again. Then add an `unmount()` that runs every remaining cleanup.",
        },
        {
          t: "pitfall",
          h: "Objects in deps are new every render",
          x: "`useEffect(f, [options])` where `options = { id }` is built during render: `Object.is` sees a new object each time, so the effect runs after every render. Depend on primitives (`[id]`), or build the object inside the effect.",
        },
        {
          t: "quiz",
          q: "`useEffect` vs `useLayoutEffect`, in this model?",
          options: ["No difference", "Layout effects run after the DOM is patched but before paint; plain effects usually run after paint", "Layout effects run during render", "Layout effects can't clean up"],
          answer: 1,
          why: "Measure-then-position (tooltips, popovers) needs a layout effect, or users see one frame in the wrong place. Everything else wants a plain effect so it never delays the paint.",
        },
      ],
    },
    {
      title: "Fiber: rendering you can pause",
      beats: [
        { t: "say", x: "Our `patch` recurses. Once it starts on a 10,000-node tree it can't stop until the stack unwinds, and the page can't handle a keypress until then. Progress lives on the call stack, and you can't pause a call stack." },
        { t: "say", h: "Fiber: the tree as a linked list", x: "Each **fiber** points to its `child`, `sibling` and `return` (parent). Traversal becomes a loop over one variable, `next`, so work can stop after any node and resume later." },
        {
          t: "code",
          lang: "js",
          src: `let next = null;      // the next fiber to work on
let wipRoot = null;   // root of the work-in-progress tree

function workLoop() {
  const deadline = performance.now() + 5;          // React slices ~5 ms
  while (next && performance.now() < deadline) next = performUnitOfWork(next);
  if (next) scheduleCallback(workLoop);             // yield, resume later
  else if (wipRoot) commitRoot();                   // all done: touch the DOM once
}

function performUnitOfWork(fiber) {
  beginWork(fiber);           // call the component, diff its children into fibers
  if (fiber.child) return fiber.child;
  let f = fiber;
  while (f) {
    completeWork(f);          // subtree done: build DOM offscreen, collect effects
    if (f.sibling) return f.sibling;
    f = f.return;
  }
  return null;
}`,
          mark: [6, 7],
          note: "React's `scheduleCallback` posts a `MessageChannel` message rather than using `requestIdleCallback`, which fires too late and too rarely on a busy page.",
        },
        {
          t: "viz",
          name: "frames",
          props: {
            cols: ["Work loop", "Completed fibers", "Browser"],
            frames: [
              { cells: [["App"], [], ["idle"]], note: "A render starts at the root: `next = App`. Call `App()`, diff what it returns, and get a child fiber `div`." },
              { cells: [["div"], [], []], note: "No DOM is touched yet. Each unit of work returns the next fiber: here, the first child." },
              { cells: [["h1"], ["h1"], []], note: "`h1` has no child. Complete it (make its DOM node offscreen), then move to its sibling." },
              { cells: [["next = List (saved)"], ["h1"], ["keypress handler", "paint"]], note: "The 5 ms slice is used up. The loop exits with `next = List` saved, and the browser handles input and paints." },
              { cells: [["List"], ["h1"], []], note: "The next slice resumes exactly there. Progress lived in one variable, not in a call stack." },
              { cells: [["li 1"], ["h1", "li 1"], []], note: "`li 1` is a leaf: complete it and go to its sibling." },
              { cells: [["li 2"], ["h1", "li 1", "li 2", "List", "div", "App"], []], note: "The last leaf completes, then the loop climbs `return` pointers and completes List, div and App." },
              { cells: [["commitRoot"], ["App"], ["DOM mutations"]], note: "Commit: apply every collected change in one synchronous pass. It is never interrupted, so users never see half an update." },
              { cells: [[], [], ["paint", "useEffect callbacks"]], note: "The browser paints the new frame. Passive effects run after it." },
            ],
          },
        },
        { t: "say", x: "**Render phase**: call components, diff, build a work-in-progress tree. Pausable, restartable, discardable. **Commit phase**: apply it to the DOM, all at once. The two trees swap via `alternate` pointers: double buffering." },
        {
          t: "predict",
          lang: "jsx",
          src: `let renders = 0;
function Item({ label }) {
  renders++;                 // a side effect in render
  return <li>{label}</li>;
}`,
          q: "With concurrent rendering, can `renders` exceed the number of commits?",
          options: ["No, one render per commit", "Yes: interrupted renders are discarded and redone, and Strict Mode renders twice on purpose", "Only for class components"],
          answer: 1,
          why: "A render can run many times per commit: restarts after an urgent update, Suspense retries, Strict Mode's double call. Anything impure in a component body (counters, fetches, subscriptions) runs an unknown number of times.",
        },
        {
          t: "play",
          mode: "html",
          title: "blocking vs time-slicing",
          html: `<p>frames drawn: <b id="fps">0</b></p>
<button id="sync">sync: 1.5 s of work</button>
<button id="sliced">sliced: same work, 5 ms slices</button>
<p id="out">&nbsp;</p>
<input placeholder="type while it works">`,
          css: `body { font-family: system-ui; padding: 16px; }\nbutton, input { font: inherit; margin: 4px 0; }`,
          js: `let frames = 0;
(function loop() {
  document.getElementById("fps").textContent = ++frames;
  requestAnimationFrame(loop);
})();

const out = document.getElementById("out");
const unit = () => { const t = performance.now(); while (performance.now() - t < 0.05) {} };
const TOTAL = 30000; // 30k units of 0.05 ms = 1.5 s

document.getElementById("sync").onclick = () => {
  const t0 = performance.now();
  for (let i = 0; i < TOTAL; i++) unit();
  out.textContent = "sync done in " + Math.round(performance.now() - t0) + " ms";
};

document.getElementById("sliced").onclick = () => {
  const t0 = performance.now();
  let i = 0;
  const ch = new MessageChannel();
  ch.port1.onmessage = () => {
    const deadline = performance.now() + 5;
    while (i < TOTAL && performance.now() < deadline) { unit(); i++; }
    if (i < TOTAL) ch.port2.postMessage(null);
    else out.textContent = "sliced done in " + Math.round(performance.now() - t0) + " ms";
  };
  ch.port2.postMessage(null);
};`,
          task: "Click sync and type: the counter and the input freeze. Click sliced and type: both stay alive, and the total barely grows. Try 50 ms slices and feel the lag.",
        },
        {
          t: "quiz",
          q: "Why is the commit phase never interrupted?",
          options: ["It's too fast to matter", "A half-applied commit would show a UI no render produced: new header, old list", "Browsers can't pause DOM writes", "It is, since React 19"],
          answer: 1,
          why: "Render works on a private copy, so pausing it is invisible. Commit mutates what the user sees; stopping midway would paint an inconsistent screen. So the slow work goes in render and commit stays short.",
        },
        {
          t: "mission",
          h: "Add useRef and useMemo",
          x: "On top of the hooks array: `useRef(init)` returns the same `{ current }` object every render; `useMemo(fn, deps)` caches `fn()` until a dep changes, reusing the `Object.is` check. Each fits in 8 lines. Then say why a ref is state that never schedules a render.",
          hint: "A ref slot stores an object once and never calls the scheduler. A memo slot stores `{ deps, value }`, the way the effect slot stores `{ deps, cleanup }`.",
          solution: {
            lang: "js",
            src: `function useRef(init) {
  const i = cursor++;
  if (i >= hooks.length) hooks.push({ current: init });
  return hooks[i];            // same object forever; mutating it renders nothing
}

function useMemo(fn, deps) {
  const i = cursor++;
  const old = hooks[i];
  if (old && deps.every((d, k) => Object.is(d, old.deps[k]))) return old.value;
  hooks[i] = { deps, value: fn() };
  return hooks[i].value;
}`,
          },
        },
      ],
    },
  ],
  nobodyTells: [
    "React's diff is O(n) because it never looks for moves across parents. Move a subtree under a new parent and it's rebuilt, state and all.",
    "Moving the last item of a keyed list to the front costs React n-1 DOM moves. Moving the first item to the end costs one.",
    "`key` works on any element, not just lists. Changing it is the cleanest way to reset a component's state on purpose.",
    "Render can run many times per commit. Anything in a component body that isn't pure runs an unknown number of times.",
    "The rules of hooks aren't style advice. They're the price of identifying state by call order.",
    "Most of reconciliation's value is keeping DOM nodes alive (focus, caret, scroll, playing media), not raw speed.",
    "Time slicing only splits React's own render work. A slow click handler you wrote still blocks the main thread for its full length.",
  ],
  glossary: [
    ["element", "A plain object `{ type, props }` describing UI. Cheap to create, never mutated."],
    ["reconciliation", "Diffing the new element tree against the old one to find the fewest DOM changes."],
    ["key", "A sibling-unique id that tells the diff which old child a new child is."],
    ["hook slot", "One entry in a component's hooks array, found by call order during render."],
    ["batching", "Collapsing several state updates in one tick into a single render."],
    ["fiber", "A unit of work: one tree node with child, sibling and return pointers, so rendering can pause."],
    ["render phase", "Calling components and diffing. Pure, interruptible, may be thrown away."],
    ["commit phase", "Applying the diff to the DOM and running effects. Synchronous, never interrupted."],
  ],
  explain: "Explain to a friend why hooks can't be called conditionally, using the hooks array and cursor, and what Fiber adds on top of a plain recursive diff.",
};
