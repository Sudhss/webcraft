export default {
  id: "react-for-real",
  n: 19,
  part: "D",
  title: "React for real",
  hook: "Chapter 18 built React. This one uses it: state that can't drift, effects that clean up, renders you can count.",
  minutes: 110,
  levels: ["use", "understand"],
  sections: [
    {
      title: "Designing state",
      beats: [
        { t: "say", x: "Chapter 18 showed where state lives: a hook slot on a fiber. The hard part is choosing **what** goes in it. Most React bugs are two copies of one fact that drifted apart." },
        {
          t: "compare",
          a: {
            label: "three sources of truth",
            lang: "jsx",
            src: `const [items, setItems] = useState([]);
const [query, setQuery] = useState("");
const [visible, setVisible] = useState([]);

useEffect(() => {
  setVisible(items.filter((i) => i.name.includes(query)));
}, [items, query]);`,
          },
          b: {
            label: "two, and the rest derived",
            lang: "jsx",
            src: `const [items, setItems] = useState([]);
const [query, setQuery] = useState("");

const visible = items.filter((i) => i.name.includes(query));`,
          },
          x: "The effect version renders twice per keystroke and commits stale results in between. Anything you can compute from props and state, compute during render.",
        },
        {
          t: "predict",
          lang: "jsx",
          src: `const [items, setItems] = useState([{ id: 1, name: "tea" }]);
const [selected, setSelected] = useState(null);

// the user picks the row:   setSelected(items[0])
// then renames it:
setItems(items.map((i) => (i.id === 1 ? { ...i, name: "coffee" } : i)));

return <h2>{selected?.name}</h2>;`,
          q: "After the rename, the heading shows?",
          options: ["coffee", "tea", "nothing", "it throws"],
          answer: 1,
          why: "`selected` still points at the old object; the rename made a new one. Two copies of one fact. Store `selectedId` and derive `items.find((i) => i.id === selectedId)` in render: it can't go stale.",
        },
        {
          t: "play",
          mode: "react",
          title: "a copy that drifts",
          js: `const { useState } = React;

const start = [
  { id: 1, name: "espresso" },
  { id: 2, name: "flat white" },
  { id: 3, name: "cortado" },
];

function App() {
  const [items, setItems] = useState(start);
  const [selected, setSelected] = useState(start[0]); // a copy of an item

  function rename(id, name) {
    setItems(items.map((i) => (i.id === id ? { ...i, name } : i)));
  }

  return (
    <div>
      {items.map((i) => (
        <p key={i.id}>
          <input value={i.name} onChange={(e) => rename(i.id, e.target.value)} />{" "}
          <button onClick={() => setSelected(i)}>
            {selected.id === i.id ? "picked" : "pick"}
          </button>
        </p>
      ))}
      <h3>Today's pick: {selected.name}</h3>
    </div>
  );
}`,
          task: "Rename the picked drink: the heading never follows, though the buttons do (they compare ids). Replace `selected` with `selectedId` and derive the object during render.",
        },
        { t: "say", h: "Lift or colocate", x: "State belongs in the lowest component that owns everything reading it. Two siblings need it: **lift** it to their parent. Only one does: **colocate** it there, so a keystroke re-renders a small subtree, not the page." },
        {
          t: "code",
          lang: "jsx",
          src: `// loading, error, data as three useStates: nothing stops
// "loading with an error" or old data next to a new error

function reducer(state, action) {
  switch (action.type) {
    case "start":
      return { status: "loading", data: state.data }; // keep old data visible
    case "success":
      return { status: "done", data: action.data };
    case "failure":
      return { status: "error", error: action.error, data: state.data };
    default:
      throw new Error("unknown action: " + action.type);
  }
}

const [state, dispatch] = useReducer(reducer, { status: "idle" });
// render by switching on state.status: impossible states can't be built`,
          note: "Use a reducer when one event changes several fields together, or one field's next value depends on another. The logic becomes a pure function you can test without rendering.",
        },
        {
          t: "pitfall",
          h: "useState(prop) copies the prop once",
          x: "The argument is read on the first render only. When the parent passes a new value, your state keeps the old one, and nothing warns you. Use the prop directly, name it `initialColor` so the copy is honest, or reset the component with a `key`.",
        },
      ],
    },
    {
      title: "What renders, and what doesn't",
      beats: [
        { t: "say", x: "A render is a call to your function. Three things schedule one: the component's own state changed, its parent rendered, or a context it reads changed. Props aren't on the list: they only change because a parent rendered." },
        {
          t: "predict",
          lang: "jsx",
          src: `function Child() {
  console.log("child");
  return <p>static text</p>;
}

function App() {
  const [n, setN] = useState(0);
  return (
    <div>
      <button onClick={() => setN(n + 1)}>{n}</button>
      <Child />
    </div>
  );
}
// no StrictMode. Mount, then click once.`,
          q: "How many times is `child` logged?",
          options: ["1", "2", "3", "0"],
          answer: 1,
          why: "Once on mount, once for the click. `Child` has no props and returns the same thing, but its parent rendered, so React calls it, diffs, finds nothing new and commits no DOM change. A render is not a DOM write.",
        },
        {
          t: "predict",
          lang: "jsx",
          src: `const [todos, setTodos] = useState(["milk"]);

function add() {
  todos.push("eggs");
  setTodos(todos);
}
// <ul>{todos.map(...)}</ul>. Click add once.`,
          q: "What does the list show after the click?",
          options: ["milk, eggs", "milk", "milk, eggs, eggs", "it throws: state is frozen"],
          answer: 1,
          why: "Same array, so `Object.is` says nothing changed and React skips the render. The push did happen: the next unrelated render suddenly shows eggs. Replace state, never mutate it: `setTodos([...todos, \"eggs\"])`.",
        },
        {
          t: "play",
          mode: "react",
          title: "state too high up",
          js: `const { useState } = React;

function Slow() {
  const t = performance.now();
  while (performance.now() - t < 30) {} // 30 ms of pretend work
  console.log("Slow rendered");
  return <p>I'm expensive, and my output never changes.</p>;
}

function App() {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  return (
    <div
      onPointerMove={(e) => setPos({ x: e.clientX, y: e.clientY })}
      style={{ height: 240, padding: 12, background: "#f1e7d6" }}
    >
      <b>pointer: {pos.x}, {pos.y}</b>
      <Slow />
    </div>
  );
}`,
          task: "Move the pointer: it stutters and Slow logs on every move. Put `pos` in a `Tracker({ children })` component, render `<Tracker><Slow /></Tracker>` from App, and the logs stop.",
        },
        { t: "say", h: "Move state down, or content up", x: "Now App creates `<Slow />` and never re-renders. When Tracker does, its `children` prop is the same element object as last time, so React skips it, no `memo` needed. Try this before any memoisation." },
        {
          t: "predict",
          lang: "jsx",
          src: `function Child() {
  console.log("render child");
  useEffect(() => console.log("effect child"));
  return null;
}

function App() {
  console.log("render app");
  useEffect(() => console.log("effect app"));
  return <Child />;
}
// no StrictMode, first mount`,
          q: "In what order do the four lines print?",
          options: [
            "render app, effect app, render child, effect child",
            "render app, render child, effect child, effect app",
            "render app, render child, effect app, effect child",
            "render child, render app, effect child, effect app",
          ],
          answer: 1,
          why: "Render is top-down: a parent must run to produce its children. Effects run after commit, children first, so a parent's effect can rely on every child below it being mounted with its effects done.",
        },
      ],
    },
    {
      title: "Keys are identity",
      beats: [
        { t: "say", x: "React can't know which component you meant. It knows three things: position in the tree, type, and key. Keep all three and the state stays, even if the new props describe someone else entirely." },
        {
          t: "predict",
          lang: "jsx",
          src: `function Scoreboard() {
  const [isAda, setIsAda] = useState(true);
  return (
    <div>
      {isAda ? <Counter person="Ada" /> : <Counter person="Linus" />}
      <button onClick={() => setIsAda(!isAda)}>next player</button>
    </div>
  );
}
// Ada's counter reads 3. Click "next player".`,
          q: "What does Linus's counter show?",
          options: ["0", "3", "3, then 0 a frame later", "it throws"],
          answer: 1,
          why: "Both branches put a `Counter` in the same slot, so React sees one component whose `person` prop changed. The state stays. Give them `key=\"ada\"` and `key=\"linus\"` and they become two components, each starting at 0.",
        },
        {
          t: "play",
          mode: "react",
          title: "the draft that follows you",
          js: `const { useState } = React;

const contacts = [
  { id: "ada", name: "Ada" },
  { id: "linus", name: "Linus" },
  { id: "grace", name: "Grace" },
];

function Chat({ contact }) {
  const [draft, setDraft] = useState("");
  function send() {
    console.log("to " + contact.name + ": " + draft);
    setDraft("");
  }
  return (
    <div>
      <textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={"Message " + contact.name} />
      <br />
      <button onClick={send}>send to {contact.name}</button>
    </div>
  );
}

function App() {
  const [toId, setToId] = useState("ada");
  const to = contacts.find((c) => c.id === toId);
  return (
    <div>
      {contacts.map((c) => (
        <button key={c.id} disabled={c.id === toId} onClick={() => setToId(c.id)}>{c.name}</button>
      ))}
      <Chat contact={to} />
    </div>
  );
}`,
          task: "Write to Ada, switch to Grace, press send: Grace gets Ada's message. Fix it with one attribute on `<Chat>`. A new key is a new component: fresh state, fresh DOM, effects re-run.",
        },
        {
          t: "pitfall",
          h: "Index keys and random keys",
          x: "`key={index}` is keyless diffing in disguise: delete row 0 and every row's state slides up one, so a ticked checkbox lands on its neighbour. `key={Math.random()}` is worse: a new identity each render, so every row remounts and inputs lose focus mid-word.",
        },
        { t: "viz", name: "reconcile", props: { before: ["t1", "t2", "t3", "t4"], after: ["t2", "t3", "t4"] } },
        {
          t: "quiz",
          q: "`<Profile userId={id} />` must clear all its local state whenever `id` changes. Best fix?",
          options: ["`useEffect(() => { resetAll(); }, [userId])`", "`<Profile key={id} userId={id} />`", "Wrap `Profile` in `memo`", "Call `resetAll()` directly in the component body"],
          answer: 1,
          why: "The effect renders once with the old user's state, commits it, then clears it: a visible flash, and every stateful child needs its own reset. A key swaps the whole subtree in one commit. Calling setters in the body loops forever.",
        },
      ],
    },
    {
      title: "Effects, done right",
      beats: [
        { t: "say", x: "An effect synchronises a component with something React doesn't control: a socket, a map widget, `document.title`, a timer. If no external system is involved, you probably don't need one, and each unneeded effect costs a render and a stale frame." },
        {
          t: "table",
          caption: "Mostly from react.dev's *You Might Not Need an Effect*, which repays a slow read.",
          head: ["You want to", "Instead of", "Do"],
          rows: [
            ["show a value derived from props or state", "an effect that sets state", "compute it in render; `useMemo` if slow"],
            ["reset state when a prop changes", "an effect that clears it", "a `key`"],
            ["respond to a click or a submit", "a flag in state, acted on by an effect", "the logic in the event handler"],
            ["tell the parent about a change", "an effect that calls `onChange`", "call `onChange` in the handler, beside your setter"],
            ["read an external store", "subscribe in an effect, copy into state", "`useSyncExternalStore`"],
            ["fetch data", "a bare effect with no cleanup", "a query cache or a loader; else an effect that ignores stale replies"],
          ],
        },
        {
          t: "play",
          mode: "react",
          title: "StrictMode finds the leak",
          js: `const { useState, useEffect } = React;

// a fake external system that counts open connections
let open = 0;
function connect(room) {
  open++;
  console.log("connect " + room + "  (open: " + open + ")");
  return {
    close() {
      open--;
      console.log("close " + room + "  (open: " + open + ")");
    },
  };
}

function Chat({ room }) {
  useEffect(() => {
    const conn = connect(room);
    // BUG: nothing ever closes it
  }, [room]);
  return <p>You're in #{room}</p>;
}

function App() {
  const [room, setRoom] = useState("general");
  return (
    <React.StrictMode>
      <button onClick={() => setRoom(room === "general" ? "random" : "general")}>switch room</button>
      <Chat room={room} />
    </React.StrictMode>
  );
}`,
          task: "StrictMode already shows two open connections on mount. Return `() => conn.close()` from the effect: mount becomes connect, close, connect, and switching rooms never leaks.",
        },
        { t: "say", h: "Why StrictMode runs it twice", x: "In development, StrictMode runs each effect's setup, cleanup and setup again on mount. Production does it for real: React 19.2's `<Activity>` hides a subtree by running its cleanups, keeps its state, and re-runs the effects when shown." },
        {
          t: "predict",
          lang: "jsx",
          src: `function Search({ query }) {
  const [results, setResults] = useState([]);
  useEffect(() => {
    fetchResults(query).then(setResults);
  }, [query]);
  return <List items={results} />;
}
// query goes "re" -> "rea", 50 ms apart.
// "re" takes 900 ms to answer, "rea" takes 200 ms.`,
          q: "Once both replies are in, the list shows results for?",
          options: ["\"rea\"", "\"re\"", "both, merged", "nothing: React cancels the first request"],
          answer: 1,
          why: "\"rea\" lands at ~250 ms and renders. \"re\" lands at ~900 ms and overwrites it. The input says rea, the list answers re. Nothing ties a reply to the query that asked for it, and React never cancels your promises.",
        },
        {
          t: "play",
          mode: "react",
          title: "the search box race",
          js: `const { useState, useEffect } = React;

const words = ["react", "reason", "record", "redux", "ref", "remix", "render", "rust"];
function fetchResults(q) {
  const ms = 150 + Math.random() * 900; // real networks don't keep order
  return new Promise((ok) => setTimeout(() => ok(words.filter((w) => w.startsWith(q))), ms));
}

function App() {
  const [query, setQuery] = useState("");
  const [data, setData] = useState({ q: "", list: words });

  useEffect(() => {
    fetchResults(query).then((list) => setData({ q: query, list }));
  }, [query]);

  const stale = data.q !== query;
  return (
    <div>
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="type r, e, c fast" />
      <p style={{ color: stale ? "crimson" : "inherit" }}>showing results for "{data.q}"</p>
      <ul>{data.list.map((w) => <li key={w}>{w}</li>)}</ul>
    </div>
  );
}`,
          task: "Type `rec` fast a few times: the list often settles on an old query, in red. Add `let ignore = false`, check it before `setData`, and return `() => { ignore = true; }`.",
        },
        {
          t: "code",
          lang: "jsx",
          src: `// React 19.2+ (stable there; not in the 18.3 playground)
import { useEffect, useEffectEvent } from "react";

function ChatRoom({ roomId, theme }) {
  const onConnected = useEffectEvent(() => {
    showNotification("Connected", theme); // always the latest theme
  });

  useEffect(() => {
    const conn = createConnection(roomId);
    conn.on("connected", onConnected);
    conn.connect();
    return () => conn.disconnect();
  }, [roomId]); // a theme change no longer reconnects
}`,
          mark: [5, 14],
          note: "An Effect Event sees the latest props but isn't a reason to re-sync. Call it only from effects, never pass it to other components, and don't use it to dodge dependencies you really have.",
        },
        {
          t: "pitfall",
          h: "Silencing the deps lint ships stale closures",
          x: "An effect with `[]` that starts an interval calling `setCount(count + 1)` stops at 1: the interval holds the first render's `count` forever. The rule was right. Fix the code: `setCount((c) => c + 1)`, move objects into the effect, or read the latest value through an Effect Event.",
        },
      ],
    },
    {
      title: "Refs and escape hatches",
      beats: [
        {
          t: "predict",
          lang: "jsx",
          src: `function App() {
  const clicks = useRef(0);
  const [, force] = useState(0);
  return (
    <div>
      <h2>{clicks.current}</h2>
      <button onClick={() => clicks.current++}>ref++</button>
      <button onClick={() => force((n) => n + 1)}>render</button>
    </div>
  );
}
// click ref++ three times, then render once`,
          q: "What does the heading show after each click?",
          options: ["1, 2, 3, then 3", "0, 0, 0, then 3", "0, 0, 0, then 0", "1, 2, 3, then 4"],
          answer: 1,
          why: "Writing `ref.current` schedules nothing, so the screen stays at 0 until something else renders, and that render reads 3. That's the contract: a ref holds values that don't drive the output. Rendering one, as here, is the bug.",
        },
        {
          t: "play",
          mode: "react",
          title: "a stopwatch that won't stop",
          js: `const { useState, useRef, useEffect } = React;

function App() {
  const [ms, setMs] = useState(0);
  let id = null; // BUG: a fresh local on every render

  function start() {
    if (id) return;
    const t0 = Date.now() - ms;
    id = setInterval(() => setMs(Date.now() - t0), 50);
  }
  function stop() {
    clearInterval(id);
    id = null;
  }

  return (
    <div>
      <h1>{(ms / 1000).toFixed(2)} s</h1>
      <button onClick={start}>start</button>
      <button onClick={stop}>stop</button>
    </div>
  );
}`,
          task: "Start, then stop: it keeps going. Each render makes a new `id`, so stop clears a stale one. Keep the interval id in `useRef(null)`, and clear it in an effect cleanup for unmount.",
        },
        {
          t: "code",
          lang: "jsx",
          src: `import { flushSync } from "react-dom";

function send(text) {
  flushSync(() => {
    setMessages((m) => [...m, text]);
  });
  // the new row is in the DOM now
  listRef.current.lastElementChild.scrollIntoView({ block: "end" });
}`,
          mark: [4, 8],
          note: "Without `flushSync` the setter only queues a render, and you'd scroll to the row before the new one. It forces render and commit right now: keep it for the few places the DOM must be current.",
        },
        {
          t: "code",
          lang: "jsx",
          src: `// React 19+: a ref callback can return its cleanup
function Measured({ onHeight }) {
  return (
    <textarea
      ref={(node) => {
        const ro = new ResizeObserver(([e]) => onHeight(e.contentRect.height));
        ro.observe(node);
        return () => ro.disconnect();
      }}
    />
  );
}

// React 19+: function components get ref as a plain prop, no forwardRef
function Field({ ref, ...rest }) {
  return <input ref={ref} {...rest} />;
}`,
          mark: [8, 15],
          note: "An inline ref callback is a new function each render, so React detaches and re-attaches it every time: here, a new observer per render. Hoist it or `useCallback` it when setup costs something.",
        },
        {
          t: "pitfall",
          h: "Don't rearrange DOM that React rendered",
          x: "Remove or move a node React created and a later commit can throw `NotFoundError: Failed to execute 'removeChild'`. Google Translate rewrites text nodes the same way, a known cause of crashes on translated React pages. Give imperative code an empty `<div ref>` of its own.",
        },
      ],
    },
    {
      title: "Memoisation, honestly",
      beats: [
        {
          t: "predict",
          lang: "jsx",
          src: `const Row = memo(function Row({ item, onPick }) {
  console.log("row", item.id);
  return <li onClick={() => onPick(item.id)}>{item.name}</li>;
});

function List({ items }) {   // 100 items
  const [picked, setPicked] = useState(null);
  return (
    <ul>
      {items.map((it) => (
        <Row key={it.id} item={it} onPick={(id) => setPicked(id)} />
      ))}
    </ul>
  );
}`,
          q: "No StrictMode. How many `row` logs does one click cause?",
          options: ["0", "1", "100", "200"],
          answer: 2,
          why: "`onPick` is a new arrow each time `List` renders, so every `Row` sees a changed prop, and `memo` compares its way to a full re-render. Pass `setPicked` itself, since setters never change, or wrap the arrow in `useCallback`.",
        },
        {
          t: "play",
          mode: "react",
          title: "memo that never skips",
          js: `const { useState, useMemo, memo } = React;

let renders = 0;
const Chart = memo(function Chart({ data, options }) {
  renders++;
  const t = performance.now();
  while (performance.now() - t < 40) {} // an expensive chart
  return <p>{data.length} points in {options.color}. Chart renders: {renders}</p>;
});

const points = Array.from({ length: 500 }, (_, i) => Math.sin(i / 20));

function App() {
  const [note, setNote] = useState("");
  return (
    <div>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="type here" />
      <Chart data={points} options={{ color: "amber" }} />
    </div>
  );
}`,
          task: "Type: each key waits 40 ms and the render count climbs. `Chart` is already memoised, so what changes every time? Fix it without touching `Chart`.",
        },
        {
          t: "predict",
          lang: "jsx",
          src: `const Card = memo(function Card({ children }) {
  console.log("card");
  return <div className="card">{children}</div>;
});

function App() {
  const [n, setN] = useState(0);
  return (
    <>
      <button onClick={() => setN(n + 1)}>{n}</button>
      <Card><p>static</p></Card>
    </>
  );
}`,
          q: "Click the button. Does `Card` log again?",
          options: ["No: its props look the same", "Yes: `<p>static</p>` is a new element object on every render", "Only in development", "Only the `<p>` re-renders"],
          answer: 1,
          why: "`children` is a prop, and every render of `App` creates a fresh element object for it. `memo` sees a new `children` and renders. Memoising a component that takes JSX children rarely skips anything.",
        },
        {
          t: "table",
          head: ["Situation", "Does memoising help?"],
          rows: [
            ["child renders because its parent did, props are stable, its render is slow", "yes: the case `memo` exists for"],
            ["a prop is an inline object, array or arrow", "not until you hoist it or wrap it in `useMemo`/`useCallback`"],
            ["the child takes JSX `children`", "rarely: children are new every render"],
            ["the child re-renders from its own state or a context it reads", "no: `memo` only compares props"],
            ["the calculation takes well under a millisecond", "no: react.dev suggests memoising from about 1 ms"],
            ["the value is a dependency of an effect or another memo", "yes: stable identity stops needless re-runs"],
          ],
        },
        { t: "say", h: "React Compiler", x: "React Compiler 1.0 (October 2025) is a Babel plugin, `babel-plugin-react-compiler`, that writes this memoisation for you at build time, for components and hooks, even after an early return where `useMemo` can't go. It supports React 17 and up." },
        {
          t: "quiz",
          q: "You enable React Compiler. Which code is most likely to misbehave?",
          options: ["A component with many `useState` calls", "A component that mutates an object during render and relies on the change", "Code that already uses `useMemo`", "Components using `useReducer`"],
          answer: 1,
          why: "The compiler assumes the Rules of React: pure render, props and state never mutated. A hidden mutation just yields stale memoised output. Its lint rules, now in `eslint-plugin-react-hooks`, catch many such cases.",
        },
        {
          t: "pitfall",
          h: "useMemo is a hint, not a guarantee",
          x: "React may drop a memo cache: in development when you edit the file, and in production if the component suspends during its first mount. If your code breaks when the calculation re-runs, `useMemo` was hiding a bug. Things that must keep one identity go in `useState(() => make())` or a ref.",
        },
      ],
    },
    {
      title: "Context, stores and custom hooks",
      beats: [
        {
          t: "predict",
          lang: "jsx",
          src: `const Auth = createContext(null);
const Avatar = memo(function Avatar() {
  const { user } = useContext(Auth);
  return <img alt={user.name} src={"/u/" + user.name + ".png"} />;
});

function App() {
  const [user, setUser] = useState({ name: "Ada" });
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <Auth.Provider value={{ user, setUser }}>
      <Clock now={now} />
      <Avatar />
    </Auth.Provider>
  );
}`,
          q: "The user never changes. How often does `Avatar` re-render?",
          options: ["Never after mount", "Every second", "Every second, in development only", "Only when `Clock` is slow"],
          answer: 1,
          why: "`{ user, setUser }` is a new object whenever App renders, which is every tick. The provider's value changed identity, so every consumer re-renders, `memo` or not. `useMemo(() => ({ user, setUser }), [user])` makes it stable.",
        },
        {
          t: "play",
          mode: "react",
          title: "a context that never sits still",
          js: `const { useState, useEffect, useMemo, useContext, createContext, memo } = React;

const Theme = createContext(null);

const Button = memo(function Button({ label }) {
  const { theme } = useContext(Theme);
  console.log("Button render", label);
  return <button className={theme}>{label}</button>;
});

function App() {
  const [theme, setTheme] = useState("light");
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <Theme.Provider value={{ theme, setTheme }}>
      <p>uptime: {tick}s</p>
      <Button label="save" />
      <Button label="cancel" />
      <button onClick={() => setTheme(theme === "light" ? "dark" : "light")}>toggle theme</button>
    </Theme.Provider>
  );
}`,
          css: `button { font: inherit; margin: 4px; padding: 6px 12px; border: 1px solid #888; border-radius: 6px; }
.light { background: #fff; color: #222; }
.dark { background: #222; color: #eee; }`,
          task: "Both buttons log every second, though the theme never changed. Wrap the context value in `useMemo` with `[theme]`: now they log only when you toggle.",
        },
        {
          t: "code",
          lang: "jsx",
          src: `const TodosContext = createContext(null);
const DispatchContext = createContext(null);

function TodosProvider({ children }) {
  const [todos, dispatch] = useReducer(todosReducer, []);
  return (
    <TodosContext.Provider value={todos}>
      <DispatchContext.Provider value={dispatch}>
        {children}
      </DispatchContext.Provider>
    </TodosContext.Provider>
  );
}
// An "Add" button reads only DispatchContext. dispatch never changes,
// so adding a todo doesn't re-render it.
// React 19: <TodosContext value={todos}> works without .Provider`,
          mark: [4, 9],
          note: "The provider owns the state and renders `children` from above, so its own updates skip them. Components that only dispatch never re-render when the todos change.",
        },
        {
          t: "pitfall",
          h: "Context has no selectors",
          x: "`useContext(Store)` re-renders on every change to anything in `Store`, even fields that component never reads. One big app context makes each keystroke a near-full-tree render. Split contexts by how often they change, or use a store with selectors (Zustand, Redux) built on `useSyncExternalStore`.",
        },
        {
          t: "predict",
          lang: "jsx",
          src: `function useCounter() {
  const [n, setN] = useState(0);
  return [n, () => setN((x) => x + 1)];
}

function A() {
  const [n, inc] = useCounter();
  return <button onClick={inc}>A {n}</button>;
}
function B() {
  const [n] = useCounter();
  return <p>B {n}</p>;
}
// <A /><B />. Click A three times.`,
          q: "What does B show?",
          options: ["B 3", "B 0", "B 1", "it depends on render order"],
          answer: 1,
          why: "A custom hook shares **logic**, not state. Each call runs its own `useState` in its own component's hook slots, exactly as if you'd pasted the body in. To share state, lift it, or keep it in a store outside React.",
        },
        {
          t: "code",
          lang: "jsx",
          src: `// outside React: a store is anything with subscribe + a snapshot
function subscribe(callback) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

export function useOnline() {
  return useSyncExternalStore(
    subscribe,              // stable: defined outside the component
    () => navigator.onLine, // must return the same value until it changes
    () => true              // what server rendering assumes
  );
}`,
          note: "Copying a store into state from an effect can tear: in a concurrent render, two components read it at different moments and disagree. `useSyncExternalStore` gives every reader one snapshot.",
        },
        {
          t: "play",
          mode: "react",
          title: "a store with selectors",
          js: `const { useSyncExternalStore } = React;

// plain JS: no React inside
function createStore(state) {
  const listeners = new Set();
  return {
    get: () => state,
    set(patch) {
      state = { ...state, ...patch };
      listeners.forEach((l) => l());
    },
    subscribe(l) {
      listeners.add(l);
      console.log("subscribed, listeners: " + listeners.size);
      return () => listeners.delete(l);
    },
  };
}
const store = createStore({ count: 0, user: "Ada" });

function useStore(select) {
  return useSyncExternalStore(
    (cb) => store.subscribe(cb), // a new function every render
    () => select(store.get())
  );
}

function Count() {
  const count = useStore((s) => s.count);
  console.log("Count render");
  return <button onClick={() => store.set({ count: count + 1 })}>count {count}</button>;
}
function User() {
  const user = useStore((s) => s.user);
  console.log("User render");
  return <button onClick={() => store.set({ user: user === "Ada" ? "Linus" : "Ada" })}>user {user}</button>;
}

function App() {
  return <div><Count /> <User /></div>;
}`,
          task: "Click count: only `Count` renders, since `User`'s selected value didn't change. But it resubscribes each render: hoist `subscribe`. Then try selecting `(s) => ({ n: s.count })`.",
        },
      ],
    },
    {
      title: "Forms and data",
      beats: [
        {
          t: "compare",
          a: {
            label: "controlled: React owns the value",
            lang: "jsx",
            src: `const [email, setEmail] = useState("");

<input
  value={email}
  onChange={(e) => setEmail(e.target.value)}
/>
// a render per keystroke; you can validate,
// mask and disable things as they type`,
          },
          b: {
            label: "uncontrolled: the DOM owns it",
            lang: "jsx",
            src: `function onSubmit(e) {
  e.preventDefault();
  const data = new FormData(e.currentTarget);
  save(data.get("email"));
}

<form onSubmit={onSubmit}>
  <input name="email" defaultValue="" />
</form>`,
          },
          x: "Control a field when the UI must react while the user types: live validation, masking, dependent fields. Otherwise let the DOM hold it and read `FormData` on submit: no render per keystroke.",
        },
        {
          t: "predict",
          lang: "jsx",
          src: `const [name, setName] = useState();   // undefined
return <input value={name} onChange={(e) => setName(e.target.value)} />;
// the user types "A"`,
          q: "What happens?",
          options: ["It works: a normal controlled input", "It starts uncontrolled, becomes controlled on the first key, and React warns", "Typing is blocked", "It throws"],
          answer: 1,
          why: "`value={undefined}` means no value prop, so React leaves the field alone. After one key it's a string, React takes over, and warns that an uncontrolled input became controlled. Start with `useState(\"\")`.",
        },
        {
          t: "code",
          lang: "jsx",
          src: `// React 19+: not in the 18.3 playground
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

async function join(prev, formData) {
  const res = await fetch("/api/join", { method: "POST", body: formData });
  if (!res.ok) return { error: "Try again", email: formData.get("email") };
  return { done: true };
}

function Submit() {
  const { pending } = useFormStatus(); // reads the parent <form>
  return <button disabled={pending}>{pending ? "Joining..." : "Join"}</button>;
}

export function Newsletter() {
  const [state, action] = useActionState(join, {});
  if (state.done) return <p>You're in.</p>;
  return (
    <form action={action}>
      <input name="email" type="email" defaultValue={state.email} />
      <Submit />
      {state.error && <p role="alert">{state.error}</p>}
    </form>
  );
}`,
          mark: [5, 17, 21],
          note: "The action runs in a transition and gets the previous state plus the `FormData`; what it returns is the new state. When it succeeds, React resets the form's uncontrolled fields.",
        },
        {
          t: "pitfall",
          h: "Returning an error still resets the form",
          x: "An action that returns `{ error }` didn't throw, so it succeeded, and React resets every uncontrolled field: the user's typing is gone. Send the submitted values back in the state and use them as `defaultValue`, as above, or keep those fields controlled.",
        },
        {
          t: "steps",
          h: "Why a query cache exists",
          items: [
            "`useQuery({ queryKey: [\"user\", id], queryFn })` (TanStack Query) looks the key up in one cache shared by the whole app.",
            "A hit renders at once, even on a remount: no spinner for data you already have.",
            "A miss starts one request. Another component asking for the same key joins it instead of refetching.",
            "Cached data stays on screen while a background refetch runs: stale-while-revalidate.",
            "After a mutation you invalidate a key, and every screen showing it refetches.",
            "A reply for an old key never lands on a new one: the key is the identity, so the search race can't happen.",
          ],
        },
        {
          t: "quiz",
          q: "`<Profile id>` shows a spinner until its fetch-in-effect returns, then renders `<Posts id>`, which fetches in its own effect. Each request takes 300 ms. When do the posts appear?",
          options: ["~300 ms", "~600 ms", "~900 ms", "it depends on the React version"],
          answer: 1,
          why: "Posts can't start until Profile's data arrives and it renders the child: a waterfall, though `id` was known from the start. Start both requests together, higher up or in a route loader (chapter 20), and it's ~300 ms.",
        },
        {
          t: "mission",
          h: "A query cache in 35 lines",
          x: "Write `useQuery(key, fetcher)` on `useSyncExternalStore`: a module-level Map from key to `{ status, data, error }`, requests deduped per key, cached data shown instantly on remount while it revalidates, late replies ignored, and `invalidate(key)` that refetches for every subscriber.",
          hint: "The cache is the store. `subscribe` adds to a per-key Set and kicks off a load. Replace an entry with a new object on every change, never mutate it, so `Object.is` sees it.",
          solution: {
            lang: "js",
            src: `const cache = new Map(); // key -> { status, data, error, promise, fetcher }
const subs = new Map();  // key -> Set of callbacks

function emit(key, entry) {
  cache.set(key, entry); // always a new object
  subs.get(key)?.forEach((cb) => cb());
}

function load(key, fetcher) {
  const old = cache.get(key);
  if (old?.promise) return; // in flight: dedupe
  const current = () => cache.get(key).promise === promise; // drop late replies
  const promise = fetcher(key).then(
    (data) => current() && emit(key, { status: "done", data, fetcher }),
    (error) => current() && emit(key, { status: "error", error, data: old?.data, fetcher })
  );
  emit(key, { ...old, status: old?.data ? "refreshing" : "loading", promise, fetcher });
}

export function invalidate(key) {
  const e = cache.get(key);
  if (!e) return;
  cache.set(key, { ...e, promise: null }); // forget the in-flight request
  load(key, e.fetcher);
}

export function useQuery(key, fetcher) {
  const subscribe = useCallback((cb) => {
    if (!subs.has(key)) subs.set(key, new Set());
    subs.get(key).add(cb);
    load(key, fetcher); // mount or remount: start, join, or revalidate
    return () => subs.get(key).delete(cb);
  }, [key]); // keep fetcher stable per key
  return useSyncExternalStore(subscribe, () => cache.get(key)) ?? { status: "loading" };
}`,
          },
        },
      ],
    },
    {
      title: "Suspense, errors and transitions",
      beats: [
        { t: "say", x: "`<Suspense fallback>` shows the fallback while anything below it waits for code or data, then swaps in the real tree. The waiting component suspends; the nearest boundary above decides what the user sees. Loading states become layout." },
        {
          t: "play",
          mode: "react",
          title: "lazy code, a fallback, a boundary",
          js: `const { Suspense, lazy, useState } = React;

// a pretend network: resolves (or fails) after 1.5 s
const load = (fail) => new Promise((ok, bad) => setTimeout(() =>
  fail ? bad(new Error("chunk failed to load")) : ok({ default: () => <p>Settings loaded.</p> }), 1500));

const Settings = lazy(() => load(false));

class Boundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) return <p role="alert">Couldn't load: {this.state.error.message}</p>;
    return this.props.children;
  }
}

function App() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button onClick={() => setOpen(true)}>open settings</button>
      <Boundary>
        <Suspense fallback={<p>loading...</p>}>
          {open && <Settings />}
        </Suspense>
      </Boundary>
    </div>
  );
}`,
          task: "Click open. Change `load(false)` to `load(true)`: the boundary catches it. Then add a button inside the boundary with `onClick={() => { throw new Error(\"x\"); }}`: nothing catches that.",
        },
        {
          t: "pitfall",
          h: "Error boundaries miss most errors",
          x: "They catch what's thrown while rendering, in effects and in lifecycles below them. Not in event handlers, timers, promise callbacks, or the boundary itself. To surface a failed click, keep the error in state and render it, or `throw` it during render to reach the boundary.",
        },
        {
          t: "predict",
          lang: "jsx",
          src: `<Suspense fallback={<Spinner />}>
  <Tab name={tab} />   {/* suspends while a tab's data loads */}
</Suspense>

// Posts is on screen. The user clicks "Photos":
setTab("photos");                          // A
startTransition(() => setTab("photos"));   // B`,
          q: "While Photos loads, what does the user see with A, and with B?",
          options: ["A: Posts stays; B: the spinner", "A: the spinner replaces Posts; B: Posts stays until Photos is ready", "The spinner, both times", "Posts, both times"],
          answer: 1,
          why: "An urgent update that suspends must show the nearest fallback, even if that hides what the user was reading. A transition lets React keep the old screen up, with `isPending` for a hint, and swap once the new one is ready.",
        },
        {
          t: "play",
          mode: "react",
          title: "a list that blocks typing",
          js: `const { useState, useDeferredValue, memo } = React;

function SlowItem({ text }) {
  const t = performance.now();
  while (performance.now() - t < 1) {} // 1 ms per item
  return <li>{text}</li>;
}

const SlowList = memo(function SlowList({ text }) {
  const items = [];
  for (let i = 0; i < 250; i++) items.push(<SlowItem key={i} text={text} />);
  return <ul>{items}</ul>;
});

function App() {
  const [text, setText] = useState("");
  const deferred = text; // try: useDeferredValue(text)
  return (
    <div>
      <input value={text} onChange={(e) => setText(e.target.value)} placeholder="type fast" />
      <p style={{ opacity: text !== deferred ? 0.5 : 1 }}>list shows: {deferred || "..."}</p>
      <SlowList text={deferred} />
    </div>
  );
}`,
          task: "Type fast: each key freezes the input for 250 ms. Make it `useDeferredValue(text)`: typing stays instant and the list catches up. Then remove `memo` and it's slow again.",
        },
        {
          t: "table",
          head: ["", "useTransition", "useDeferredValue"],
          rows: [
            ["you wrap", "the update: `startTransition(() => setTab(t))`", "a value: `useDeferredValue(query)`"],
            ["use it when", "you own the setter", "the value comes from props or another hook"],
            ["pending hint", "`isPending`", "`value !== deferred`"],
            ["new in React 19", "the function may be async: an Action", "an `initialValue` for the first render"],
            ["can't", "drive a text input's own value", "speed up a child that isn't memoised"],
          ],
        },
        {
          t: "code",
          lang: "jsx",
          src: `// React 19+: use() reads a promise and suspends until it settles
import { use, Suspense } from "react";

function Comments({ commentsPromise }) {
  const comments = use(commentsPromise); // unlike hooks, fine inside an if
  return comments.map((c) => <p key={c.id}>{c.text}</p>);
}

// the promise comes from outside render: a loader, a cache, a server component
<Suspense fallback={<p>loading comments...</p>}>
  <Comments commentsPromise={commentsPromise} />
</Suspense>

// wrong: a new promise on every render
function Bad() {
  return use(fetch("/api/comments").then((r) => r.json()));
}`,
          mark: [5, 15],
          note: "`use` doesn't cache. A promise made in render suspends, the retry makes another, and React warns about an uncached promise. Its owner is a framework loader (chapter 20) or a Suspense-aware library.",
        },
      ],
    },
  ],
  nobodyTells: [
    "A component re-renders whenever its parent does, props or not. `memo` is the opt-out, and it only works if every prop keeps its identity.",
    "Passing `children` down instead of rendering them inside is a free `memo`: an element created above the re-render is the same object, so React skips it.",
    "Effects run child-first. By the time a parent's effect runs, every child below it has mounted and run its own effects.",
    "If StrictMode's mount, cleanup, mount breaks a feature, production will too: a hidden `<Activity>` and Fast Refresh do the same dance.",
    "Setters from `useState` and `dispatch` from `useReducer` never change identity. Pass them down as they are instead of wrapping them in new arrows.",
    "Error boundaries are still class-only in React 19. react.dev itself points you to the `react-error-boundary` package.",
    "Turn on \"Highlight updates when components render\" in React DevTools once. You'll find renders you never expected within a minute.",
  ],
  glossary: [
    ["derived state", "A value computed from props and state during render instead of stored, so it can't go stale."],
    ["lifting state", "Moving state to the closest common parent so siblings read one copy."],
    ["colocation", "Keeping state in the lowest component that uses it, so updates re-render the smallest subtree."],
    ["reducer", "A pure `(state, action) => state` function; `useReducer` uses it to change coupled fields together."],
    ["bailout", "React skipping a component, or a whole subtree, because nothing it depends on changed."],
    ["controlled input", "An input whose `value` comes from React state and changes only through `onChange`."],
    ["uncontrolled input", "An input whose value lives in the DOM, seeded with `defaultValue` and read via `FormData` or a ref."],
    ["Effect Event", "A `useEffectEvent` function that reads the latest props inside an effect without being a dependency."],
    ["tearing", "One screen showing different values of the same store, because parts of it read at different moments."],
    ["Suspense boundary", "A `<Suspense>` that shows its fallback while anything below it waits for code or data."],
    ["error boundary", "A class component with `getDerivedStateFromError` that renders a fallback when a child throws in render."],
    ["transition", "A non-urgent update: interruptible, and allowed to keep the old UI on screen while it renders."],
    ["Action", "In React 19, a function run in a transition, often async, passed to `<form action>` or `useActionState`."],
    ["React Compiler", "A build-time Babel plugin that memoises components and hooks for you. Stable since v1.0, October 2025."],
  ],
  explain: "Explain to a friend the three things that make a component re-render, and why the fix for a slow one is usually moving state or content, not adding memo.",
};
