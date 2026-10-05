export default {
  id: "bundlers",
  n: 13,
  part: "C",
  title: "Bundlers and Vite",
  hook: "Browsers run ES modules natively, yet every serious site still ships a bundle. Here's why, and what's inside one.",
  minutes: 80,
  levels: ["use", "understand", "rebuild"],
  sections: [
    {
      title: "Why bundle at all",
      beats: [
        { t: "say", x: "Every current browser runs `<script type=\"module\">` and `import` natively. Bundlers don't exist to make modules work. They do three things the browser can't do alone: see the whole graph up front, resolve package names, and compile what isn't JavaScript." },
        {
          t: "predict",
          lang: "js",
          src: `// index.html: <script type="module" src="/main.js">
// main.js
import "./app.js";
// app.js
import "./router.js";
// router.js
import "./page.js";`,
          q: "The HTML has arrived. HTTP/2, 100 ms round trip, tiny files. When does the request for `page.js` go out?",
          options: ["Immediately: HTTP/2 fetches in parallel", "About 300 ms later", "About 100 ms later: the preload scanner finds it", "Only after main.js has executed"],
          answer: 1,
          why: "The browser learns about `page.js` only by fetching and parsing `router.js`, which it learned about from `app.js`. One round trip per level of import depth. HTTP/2 makes requests cheap, not clairvoyant.",
        },
        {
          t: "predict",
          lang: "html",
          src: `<script type="module">
  import { html } from "lit";
</script>`,
          q: "No build step, no import map, lit is in `node_modules`. What happens in Chrome?",
          options: ["It loads `./node_modules/lit`", "It fetches lit from npm's CDN", "TypeError: Failed to resolve module specifier \"lit\"", "It works in dev only"],
          answer: 2,
          why: "Browsers resolve specifiers as URLs, and `lit` isn't one: relative references must start with `/`, `./` or `../`. `node_modules` lookup is a Node convention the browser has never heard of.",
        },
        {
          t: "table",
          head: ["Problem", "Browser alone", "With a bundler"],
          rows: [
            ["Import depth", "One round trip per level, discovered as it goes", "Graph flattened at build time into a few files"],
            ["Bare specifiers", "`import \"react\"` throws", "Resolved through `node_modules` and `exports` maps"],
            ["Non-JS sources", "No TS, JSX, `.vue`, `import \"./x.css\"`, `import logo from \"./logo.png\"`", "Each compiled to JS, a CSS file or a URL"],
            ["File count", "One request each; lodash-es alone is 600+ modules", "Merged, unused code dropped, minified"],
            ["Caching", "`app.js` changes, and you hope caches notice", "Content-hashed names: cache forever, bust exactly"],
          ],
        },
        {
          t: "quiz",
          q: "You know the full module list. Which single change flattens that waterfall without bundling?",
          options: ["HTTP/3", "A `<link rel=\"modulepreload\">` per module in the HTML", "`defer` on the script", "`async` on the script"],
          answer: 1,
          why: "Preload tags announce deep modules up front, so every request starts at once. Bundlers emit exactly these for split chunks. But something still has to compute the list, and that something is the module graph.",
        },
      ],
    },
    {
      title: "The graph and the bundle",
      beats: [
        { t: "say", x: "A bundler starts at an entry, parses it, pulls out each import specifier, resolves it to a file, and repeats. The result is the **module graph**. Ordering, tree shaking, splitting and hashing are all graph algorithms on it." },
        {
          t: "viz",
          name: "frames",
          props: {
            cols: ["Queue", "Parsed", "Edges"],
            frames: [
              { cells: [["main.js"], [], []], note: "Start at the entry. In Vite that's whatever `index.html` points its module script at." },
              { cells: [["app.js", "react"], ["main.js"], ["main -> app", "main -> react"]], note: "Parse main.js, find two specifiers. `react` resolves via `node_modules/react/package.json` to a real file path." },
              { cells: [["react", "api.js", "Button.jsx"], ["main.js", "app.js"], ["main -> app", "main -> react", "app -> api", "app -> Button"]], note: "app.js adds two more. The queue only ever holds resolved absolute paths, so two spellings of one file dedupe." },
              { cells: [["Button.jsx"], ["main.js", "app.js", "react", "api.js"], ["...", "api -> app"]], note: "api.js imports app.js back. That's a cycle. Legal in ESM, and it gets an edge, not a second parse." },
              { cells: [[], ["main.js", "app.js", "react", "api.js", "Button.jsx"], ["...", "Button -> react"]], note: "Button imports react, already parsed: edge only. Every file is parsed once however many importers it has." },
            ],
          },
        },
        {
          t: "predict",
          lang: "js",
          src: `// main.js
import "./a.js";
import "./b.js";
console.log("main");
// a.js
import "./c.js";
console.log("a");
// b.js
import "./c.js";
console.log("b");
// c.js
console.log("c");`,
          q: "Native ESM or any correct bundle: what prints?",
          options: ["main a c b c", "c a b main", "main a b c", "c a c b main"],
          answer: 1,
          why: "Depth-first, post-order: a module's imports finish before its own body runs, and each module runs once. That's a topological order with siblings in source order, and a bundler must reproduce it exactly.",
        },
        {
          t: "predict",
          lang: "js",
          src: `// a.js (the entry)
import "./b.js";
export const x = 1;

// b.js
import { x } from "./a.js";
console.log(x);`,
          q: "What happens?",
          options: ["Logs 1", "Logs undefined", "ReferenceError: Cannot access 'x' before initialization", "The bundler refuses cycles"],
          answer: 2,
          why: "a waits for its import, so b runs first and reads `x` while a's `const` is still in its TDZ. Import b first from anywhere and it logs 1. In a cycle, correctness depends on which module is reached first.",
        },
        {
          t: "pitfall",
          h: "Cycles break when someone adds an unrelated import",
          x: "Barrel files and `index.js` re-exports create cycles nobody drew. They work until a new import elsewhere changes which module is entered first, and a constant is suddenly in its TDZ. `npx madge --circular src` lists them; keep leaf modules free of feature imports.",
        },
        { t: "say", x: "Two ways to put a graph in one file. Wrap each module in a function and ship a small `require` runtime (webpack's classic shape). Or concatenate everything into one scope and rename clashes: **scope hoisting**, the default in Rollup and Rolldown." },
        {
          t: "play",
          mode: "js",
          title: "a bundle with a runtime",
          js: `(() => {
  const modules = {
    "./log.js": (module, require) => {
      module.exports.log = (m) => console.log("[app]", m);
    },
    "./main.js": (module, require) => {
      const { log } = require("./log.js");
      log("hi from main");
    },
  };
  const cache = {};
  function require(id) {
    if (cache[id]) return cache[id].exports;
    const module = (cache[id] = { exports: {} });
    modules[id](module, require);
    return module.exports;
  }
  require("./main.js");
})();`,
          task: "Add a `./util.js` both modules require, with a log in it: it runs once. Then make `log.js` require `./main.js` and print what it gets back.",
        },
        {
          t: "compare",
          a: { label: "your modules", lang: "js", src: `// a.js
let n = 0;
export function make() { return "a" + n++; }
// b.js
let n = 0;
export function make() { return "b" + n++; }
// main.js
import { make as a } from "./a.js";
import { make as b } from "./b.js";
console.log(a(), b());` },
          b: { label: "Rolldown output", lang: "js", src: `//#region a.js
let n$1 = 0;
function make$1() { return "a" + n$1++; }
//#endregion
//#region b.js
let n = 0;
function make() { return "b" + n++; }
//#endregion
//#region main.js
console.log(make$1(), make());
//#endregion` },
          x: "One scope, no runtime, no function call per import. Clashing names get a `$1` suffix. The minifier now sees the whole program and can inline across what used to be module boundaries.",
        },
        {
          t: "predict",
          lang: "js",
          src: `// a.js
const count = 1;
export { count };
// b.js
export const count = 2;
// main.js
import { count as a } from "./a.js";
import { count as b } from "./b.js";
console.log(a, b);`,
          q: "What does Rolldown emit for this, minification off?",
          options: ["`console.log(count$1, count);`", "`console.log(1, 2);`", "A runtime with two module functions", "An error: duplicate export name"],
          answer: 1,
          why: "Once hoisted, both are `const` in one scope, so the bundler inlines the values and drops the declarations. Hoisting isn't only smaller output: it lets optimizations cross module lines.",
        },
      ],
    },
    {
      title: "Tree shaking and what defeats it",
      beats: [
        { t: "say", x: "**Tree shaking**: start from the entries, keep every export actually used and every statement that might have a side effect, drop the rest. The hard part is the second half. The bundler must prove that deleting code changes nothing." },
        {
          t: "predict",
          lang: "js",
          src: `// utils.js
console.log("utils loaded");
const registry = [];
function register(n) { registry.push(n); globalThis.reg = registry; return n; }
export const a = 1;
export const b = register("b");
export const c = /* @__PURE__ */ register("c");

// main.js
import { a } from "./utils.js";
console.log(a);`,
          q: "`b` and `c` are never used. What survives in the bundle?",
          options: ["Only `a`", "`a` and the log", "The log, `register` and the call `register(\"b\")`", "Everything: one import keeps the whole file"],
          answer: 2,
          why: "The log is a side effect. `register(\"b\")` writes a global, so the call stays though `b` is unused. `/* @__PURE__ */` promises the call is safe to drop, so `c` goes. Libraries put it on every factory call.",
        },
        {
          t: "predict",
          lang: "js",
          src: `// lib.cjs
function a() { return 1; }
function b() { return "a lot of code"; }
module.exports = { a, b };

// main.js
import { a } from "./lib.cjs";
console.log(a());`,
          q: "Does `b` end up in the bundle?",
          options: ["No, it's unused", "Yes: the whole file is wrapped in a function and kept", "Only without minification", "The import fails: CJS has no named exports"],
          answer: 1,
          why: "`module.exports` is an object built at runtime, so the bundler can't prove which keys you read. Rolldown wraps the file in `__commonJSMin` and keeps all of it. The real reason to prefer packages that ship ESM.",
        },
        {
          t: "predict",
          lang: "js",
          src: `import * as icons from "./icons.js";   // 300 exports

export function Icon({ name }) {
  return icons[name]();
}`,
          q: "How many of the 300 icons ship?",
          options: ["Only the ones rendered at runtime", "All 300", "None: it fails to build", "Only those named elsewhere in the code"],
          answer: 1,
          why: "`icons[name]` can reach any export, so the bundler materialises the whole namespace object (Rolldown emits `__exportAll({...})`). `icons.Star` shakes fine; a computed key doesn't. Import the few you need by name.",
        },
        { t: "say", h: "The sideEffects field", x: "`\"sideEffects\": false` in a package.json says: if nothing from one of my files is used, skip that file entirely, top-level code and all. It's what makes big libraries cheap to import from, and the bundler takes it literally." },
        {
          t: "predict",
          lang: "js",
          src: `// ui/index.js
export * from "./Button.js";
export * from "./Chart.js";
// ui/Chart.js
import { register } from "./registry.js";
register("chart");
export const Chart = "chart";
// main.js
import { Button } from "./ui/index.js";`,
          q: "No `sideEffects` field anywhere. Does anything from Chart.js ship?",
          options: ["No, Chart is unused", "Yes: `register(\"chart\")` and the registry module", "Yes, the whole file including `Chart`", "Only in dev"],
          answer: 1,
          why: "Importing a barrel evaluates every module it re-exports. The bundler drops `Chart` but must keep the top-level call and what it needs. With `\"sideEffects\": false`, Chart.js and registry.js vanish completely.",
        },
        {
          t: "pitfall",
          h: "`sideEffects: false` deletes your polyfill",
          x: "Put `\"sideEffects\": false` in your app's package.json and `import \"./polyfill.js\"` silently disappears from the build: nothing is imported from it, so it's skipped. Dev still loads it, so you only see it in production. List exceptions: `\"sideEffects\": [\"./src/polyfill.js\"]`.",
        },
        {
          t: "pitfall",
          h: "Barrels are slow in dev even when prod is fine",
          x: "Vite dev serves your source file by file. `import { Button } from \"@/components\"` makes the browser request, and Vite transform, every module that barrel re-exports, on each cold load. The build shakes it all away, so nobody notices until dev crawls. Import from the file.",
        },
      ],
    },
    {
      title: "Code splitting and import()",
      beats: [
        { t: "say", x: "`import(\"./x.js\")` returns a promise for the module. To a bundler it's a **split point**: `x.js` and whatever only it needs go into a separate chunk, fetched the first time that line runs." },
        {
          t: "code",
          lang: "js",
          src: `const routes = {
  "/": () => import("./pages/Home.js"),
  "/editor": () => import("./pages/Editor.js"),   // 400 kB, off the first load
};

async function go(path) {
  const { default: Page } = await routes[path]();
  render(Page);
}`,
          note: "The arrows matter: nothing loads until navigation. The specifier must be readable at build time; Vite also accepts `` `./locales/${lang}.js` `` and emits one chunk per matching file.",
        },
        {
          t: "predict",
          lang: "js",
          src: `// main.js
button.onclick = () => import("./pageA.js");
link.onclick = () => import("./pageB.js");

// pageA.js and pageB.js both start with:
import { chart } from "./chart.js";`,
          q: "How many JS files does the build emit?",
          options: ["1", "2: main, and one for both pages", "3: main, pageA, pageB, with chart copied into each", "4: main, pageA, pageB and a shared chart chunk"],
          answer: 3,
          why: "A module is never duplicated across chunks. `chart.js` is needed by two chunks, so it gets its own, which both import. Lots of tiny shared chunks is the usual cost; `codeSplitting.groups` in Rolldown tunes it.",
        },
        {
          t: "pitfall",
          h: "One static import cancels the split",
          x: "Import `Editor.js` statically anywhere in the main graph and `import(\"./Editor.js\")` stops splitting: it's already in the entry chunk. Vite prints `INEFFECTIVE_DYNAMIC_IMPORT ... dynamic import will not move module into another chunk`. That warning is the whole optimization failing.",
        },
        { t: "say", x: "A lazy chunk with its own imports is a waterfall again: fetch the chunk, parse it, discover `chart.js`, fetch that. So Vite rewrites each `import()` into `__vitePreload(() => import(...), deps)`, which fetches the chunk and its deps in parallel." },
        {
          t: "pitfall",
          h: "Your deploy deletes chunks that open tabs still need",
          x: "A user with yesterday's tab open clicks a route. The old entry asks for `Editor-a1b2c3.js`, which today's deploy removed: *Failed to fetch dynamically imported module*. Keep old assets for a few releases, and reload on Vite's `vite:preloadError` event.",
        },
        {
          t: "code",
          lang: "js",
          src: `window.addEventListener("vite:preloadError", (event) => {
  const last = Number(sessionStorage.getItem("chunk-reload") || 0);
  if (Date.now() - last < 10_000) return;   // new deploy broken too: don't loop
  sessionStorage.setItem("chunk-reload", String(Date.now()));
  event.preventDefault();                   // don't rethrow
  location.reload();                        // new index.html, new chunk names
});`,
          note: "Without `preventDefault()` the helper rethrows the error to the `import()` caller. The time guard stops an infinite reload loop when the chunk is missing for real.",
        },
      ],
    },
    {
      title: "Hashes, caching, import maps",
      beats: [
        {
          t: "code",
          lang: "text",
          src: `dist/index.html                   0.46 kB │ gzip:   0.30 kB
dist/assets/index-DiwrgTda.css    8.93 kB │ gzip:   2.41 kB
dist/assets/index-B9DPVFQA.js   142.10 kB │ gzip:  45.87 kB
dist/assets/Editor-CmyCS8BH.js  402.77 kB │ gzip: 121.30 kB

# serve them as
/index.html   Cache-Control: no-cache
/assets/*     Cache-Control: public, max-age=31536000, immutable`,
          note: "The hash is of the file's content, so a rebuild renames only what changed. The HTML must revalidate every time: it's the one file that names all the others.",
        },
        {
          t: "predict",
          lang: "text",
          src: `main  --import()-->  pageA  --import-->  chart
main  --import()-->  pageB  --import-->  chart

# edit one string inside chart.js, rebuild`,
          q: "How many of the four file names change?",
          options: ["1: chart", "3: chart, pageA, pageB", "4: all of them", "0: hashes change per release"],
          answer: 2,
          why: "pageA's bytes contain the string `./chart-BHY3X5rP.js`. New chart hash, new pageA bytes, new pageA hash, and so on up to the entry. A leaf edit cascades up every importer path; returning users refetch all four.",
        },
        {
          t: "play",
          mode: "js",
          title: "the hash cascade",
          js: `const hash = (s) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h.toString(36);
};
const files = {
  "chart.js": { code: "export const chart = (x) => 'chart:' + x;", deps: [] },
  "pageA.js": { code: "import { chart } from './chart.js'; export const a = () => chart('A');", deps: ["chart.js"] },
  "pageB.js": { code: "import { chart } from './chart.js'; export const b = () => chart('B');", deps: ["chart.js"] },
  "main.js": { code: "import('./pageA.js'); import('./pageB.js');", deps: ["pageA.js", "pageB.js"] },
};
const leavesFirst = ["chart.js", "pageA.js", "pageB.js", "main.js"];

function build(importMap = false) {
  const names = {};
  for (const f of leavesFirst) {
    let code = files[f].code;
    // without an import map, importers embed the hashed file names of their deps
    if (!importMap) for (const d of files[f].deps) code = code.replaceAll("./" + d, "./" + names[d]);
    names[f] = f.replace(".js", "-" + hash(code) + ".js");
  }
  return names;
}

const before = build();
files["chart.js"].code = files["chart.js"].code.replace("chart:", "CHART:");
const after = build();
for (const f of leavesFirst) console.log(f.padEnd(9), after[f], before[f] === after[f] ? "same" : "CHANGED");`,
          task: "One edit, four new names. Pass `true` to both `build()` calls: importers keep stable specifiers and an import map points them at hashed files. Count again.",
        },
        {
          t: "code",
          lang: "html",
          src: `<script type="importmap">
{
  "imports": {
    "chart": "/assets/chart-CKnDOqaH.js",
    "lit": "/vendor/lit-3.2.1.js",
    "utils/": "/assets/utils/"
  }
}
</script>
<script type="module">
  import { chart } from "chart";         // -> /assets/chart-CKnDOqaH.js
  import { fmt } from "utils/date.js";   // prefix mapping -> /assets/utils/date.js
</script>`,
          note: "An **import map** tells the browser what bare specifiers mean; every current browser supports it. Put it before the first module script. It fixes naming and caching, not depth or TypeScript.",
        },
        {
          t: "pitfall",
          h: "A long max-age on index.html freezes your app",
          x: "Cache `index.html` like an asset and returning visitors load last month's entry chunk no matter what you deploy. Hashed files can be `immutable`; the HTML must revalidate. Check your CDN and host defaults, since some cache HTML for hours unless told otherwise.",
        },
      ],
    },
    {
      title: "Vite in dev: no bundle at all",
      beats: [
        { t: "say", x: "`vite` in dev doesn't bundle your source. It pre-bundles `node_modules` once, then transforms each of your files when the browser asks for it. The server is up almost instantly; the work moves to page load, one file at a time." },
        {
          t: "code",
          lang: "js",
          file: "GET /src/dev.js, as the browser receives it (reflowed)",
          src: `import { createHotContext as __vite__createHotContext } from "/@vite/client";
import.meta.hot = __vite__createHotContext("/src/dev.js");
import.meta.env = {"BASE_URL": "/", "DEV": true, "MODE": "development", "PROD": false,
  "SSR": false, "VITE_API_URL": "https://api.example.com"};
const hi = __vite__cjsImport0_tinyDep["hi"];
import __vite__cjsImport0_tinyDep from "/node_modules/.vite/deps/tiny-dep.js?v=6dcdadfe";
import { util } from "/src/util.js";

console.log(hi(), util, import.meta.env.VITE_API_URL);
if (import.meta.hot) import.meta.hot.accept();`,
          mark: [5, 6],
          note: "The source said `import { hi } from \"tiny-dep\"`, a CommonJS package. Vite 8 rewrote the bare name to a pre-bundled file and bridged CJS to a named import.",
        },
        {
          t: "steps",
          h: "Dependency pre-bundling",
          items: [
            "At startup Vite crawls your source from `index.html` looking for bare imports.",
            "It bundles each dependency into `node_modules/.vite/deps`: CJS becomes ESM, and a 600-module package becomes one file.",
            "Those files are served `max-age=31536000,immutable`; the `?v=` hash changes whenever they are rebuilt.",
            "The cache is rebuilt when the lockfile, the patches folder, relevant config or `NODE_ENV` changes.",
            "Your own files are served `no-cache` with an ETag, so an unchanged file costs a 304, not a transform.",
            "Since Vite 8 (March 2026) Rolldown does this step and Oxc transforms TS and JSX; before, both were esbuild.",
          ],
        },
        {
          t: "pitfall",
          h: "The mid-session reload",
          x: "Import a dependency the startup crawl didn't see (behind a dynamic import, say) and Vite must re-bundle deps and reload the page, losing all state. It logs *new dependencies found*, then *optimized dependencies changed. reloading*. Pre-declare those in `optimizeDeps.include`.",
        },
        {
          t: "viz",
          name: "frames",
          props: {
            cols: ["Saved file", "Walk up importers", "Browser"],
            frames: [
              { cells: [["Button.jsx"], [], ["app running, state intact"]], note: "You save Button.jsx. The watcher tells Vite, which throws away that module's cached transform." },
              { cells: [["Button.jsx"], ["Button.jsx accepts itself? yes"], []], note: "Vite looks for an **HMR boundary**: a module that calls `import.meta.hot.accept()`. The React plugin makes component-only files accept themselves." },
              { cells: [["Button.jsx"], ["boundary: Button.jsx"], ["ws: update /src/Button.jsx"]], note: "Found one. Vite sends a WebSocket message naming the boundary and a timestamp." },
              { cells: [[], ["boundary: Button.jsx"], ["import(\"/src/Button.jsx?t=...\")"]], note: "The client re-imports the file with a `?t=` query. New URL, so the browser treats it as a new module and really refetches it." },
              { cells: [[], [], ["accept callback", "React Refresh swaps the function", "state kept"]], note: "The accept callback receives the new module. React Refresh re-renders with the new component and keeps hook state." },
              { cells: [["config.js"], ["config.js: no", "api.js: no", "main.js: no, entry"], []], note: "Now save config.js, which nothing accepts. Vite walks importers: api.js, then main.js, the entry. No boundary anywhere." },
              { cells: [["config.js"], ["dead end"], ["full page reload"]], note: "A walk that reaches an entry without finding a boundary ends in a full reload. Everything in memory is gone." },
            ],
          },
        },
        {
          t: "code",
          lang: "js",
          file: "ticker.js",
          src: `const id = setInterval(() => console.log("tick"), 1000);

if (import.meta.hot) {
  import.meta.hot.accept();                          // I am a boundary
  import.meta.hot.dispose(() => clearInterval(id));  // the old copy cleans up
}`,
          note: "Without `dispose`, every save adds another interval: old copies never really die. Vite finds `import.meta.hot.accept(` by exact text, and the `if` lets the build drop it all.",
        },
        {
          t: "predict",
          lang: "jsx",
          src: `// Settings.jsx
export const defaults = { theme: "dark" };

export default function Settings() {
  const [open, setOpen] = useState(false);
  return <Panel open={open} onToggle={setOpen} />;
}`,
          q: "With `@vitejs/plugin-react`, you edit some JSX in this file and save. What does Vite do with the update?",
          options: ["Fast Refresh in place, state kept", "Refuses Fast Refresh here and passes the update up to the importers", "Ignores it until you reload", "Fails the build"],
          answer: 1,
          why: "Re-running the file makes a new `defaults` object, and Refresh only accepts files whose exports are components or unchanged values. Vite logs *Could not Fast Refresh* and invalidates upward, often to a full reload. Move `defaults` out.",
        },
        {
          t: "pitfall",
          h: "Dev and build are different programs",
          x: "Dev is unbundled ESM with per-file transforms; build is a Rolldown bundle with tree shaking, chunking and minification. `sideEffects`, cycle order and CJS interop can pass in one and break in the other. Run `vite build && vite preview` before you trust a change.",
        },
      ],
    },
    {
      title: "Env variables and source maps",
      beats: [
        {
          t: "predict",
          lang: "js",
          src: `# .env
VITE_API_URL=https://api.example.com
DB_PASSWORD=hunter2

// src/main.js
console.log(import.meta.env.VITE_API_URL, import.meta.env.DB_PASSWORD, import.meta.env.MODE);`,
          q: "What does `vite build` put in the bundle?",
          options: ["The same line, read from the environment at runtime", "`console.log(\"https://api.example.com\", void 0, \"production\");`", "`console.log(\"https://api.example.com\", \"hunter2\", \"production\");`", "A build error for DB_PASSWORD"],
          answer: 1,
          why: "Env values are pasted in as text at build time; there's no runtime lookup. Only `VITE_` names are exposed, the rest become `undefined`. Changing the URL means rebuilding, not restarting a server.",
        },
        {
          t: "predict",
          lang: "js",
          src: `# .env.production
VITE_DEBUG=false

// main.js
if (import.meta.env.VITE_DEBUG) enableDebugPanel();`,
          q: "What ends up in the production bundle?",
          options: ["The `if`, false at runtime", "Nothing: the branch is removed", "`enableDebugPanel();` with no condition", "A type error at build time"],
          answer: 2,
          why: "Every env value is a string, and `\"false\"` is truthy. After inlining, the minifier folds the `if` away and keeps the call. Compare explicitly: `import.meta.env.VITE_DEBUG === \"true\"`.",
        },
        {
          t: "pitfall",
          h: "`VITE_` means public",
          x: "Anything with the prefix is pasted into JS that every visitor downloads. `VITE_STRIPE_SECRET` is a leaked key the moment you deploy. Secrets live on a server that makes the call for the client. Vite refuses `envPrefix: ''` for exactly this reason.",
        },
        {
          t: "pitfall",
          h: "`define: { \"process.env\": process.env }` ships your CI",
          x: "Added to quiet an old library, it inlines every variable on the build machine wherever code reads `process.env` as an object: tokens, keys, all of it, minified or not. Define single keys: `\"process.env.NODE_ENV\": JSON.stringify(mode)`.",
        },
        { t: "say", x: "A **source map** is JSON mapping every position in the output back to a file, line and column of your source, so devtools and stack traces show your code. By default it also embeds `sourcesContent`: your original files, comments and all." },
        {
          t: "code",
          lang: "js",
          src: `// dist/assets/admin-CBylbEEt.js, last line
//# sourceMappingURL=admin-CBylbEEt.js.map

// dist/assets/admin-CBylbEEt.js.map
{
  "version": 3,
  "sources": ["../../src/admin.js"],
  "sourcesContent": ["// TODO remove the admin backdoor before launch\\nexport function f(x) { ..."],
  "names": [],
  "mappings": ";AACA,SAAgB,EAAE,GAAG;CAAE,OAAO,IAAI;AAAG"
}`,
          mark: [7],
          note: "The minifier stripped that comment from the JS; the map put it right back. `mappings` is base64 VLQ: `;` per output line, each segment a delta of column, source, line, column.",
        },
        {
          t: "table",
          head: ["`build.sourcemap`", "What you get"],
          rows: [
            ["`false` (default)", "No maps. Production stack traces point at column 48213 of line 1"],
            ["`true`", "`.map` files plus a `sourceMappingURL` comment: devtools fetch them for anyone"],
            ["`\"hidden\"`", "`.map` files, no comment: for your error tracker, not your web server"],
            ["`\"inline\"`", "The map as a data URI inside each file: large, dev only"],
          ],
        },
        {
          t: "pitfall",
          h: "Public source maps publish your source",
          x: "`sourcemap: true` plus a plain deploy of `dist/` puts every original file, comments included, one click away in devtools. Use `\"hidden\"`, upload the maps to your error tracker in CI, delete `*.map` before deploying, then check a `.map` URL on the live site returns 404.",
        },
      ],
    },
    {
      title: "Transpile, polyfill, measure",
      beats: [
        {
          t: "compare",
          a: { label: "source", lang: "js", src: `const v = user?.name ?? "anon";
const { promise, resolve } = Promise.withResolvers();
const last = list.at(-1);` },
          b: { label: "built with target es2015", lang: "js", src: `var _user$name;
const v = (_user$name = user === null || user === void 0
  ? void 0 : user.name) !== null && _user$name !== void 0
  ? _user$name : "anon";
const { promise, resolve } = Promise.withResolvers();
const last = list.at(-1);` },
          x: "**Transpiling** rewrites new syntax into old syntax. It can't create a method that doesn't exist: `withResolvers` and `.at` pass straight through. Missing APIs need a **polyfill**, runtime code that patches the global.",
        },
        {
          t: "predict",
          lang: "js",
          src: `// vite.config.js: defaults
// build.target = "baseline-widely-available"
//   = chrome111, edge111, firefox114, safari16.4

const { promise, resolve } = Promise.withResolvers();`,
          q: "A visitor on Safari 16.4, inside the default target, opens the page. What happens?",
          options: ["Works: it's inside the target", "TypeError: Promise.withResolvers is not a function", "Vite polyfilled it", "The build refused"],
          answer: 1,
          why: "The target governs syntax only; Vite ships no polyfills by default. `Promise.withResolvers` arrived in Safari 17.4. Check APIs against your real browser list, or add polyfills on purpose (`@vitejs/plugin-legacy` can inject them).",
        },
        { t: "say", x: "Bundle size is two numbers. Compressed bytes cost download time. Uncompressed JS bytes cost CPU: every kilobyte is parsed and compiled before it runs, on a phone far slower than your laptop. Vite prints both per file after every build." },
        {
          t: "code",
          lang: "bash",
          src: `# which modules are in which chunk, by size
vite build --sourcemap
npx source-map-explorer "dist/assets/*.js"

# why is this package in the bundle, and how many copies?
npm ls react
npm explain lodash`,
          note: "A treemap answers most size questions in a minute. Build the maps only for this: don't deploy them. Chapter 37 covers measuring what that JS costs at runtime.",
        },
        {
          t: "pitfall",
          h: "Two copies of one library",
          x: "When two dependencies want incompatible ranges, npm installs both and the bundle ships both. For size it's waste; for React, or anything with a singleton or an `instanceof` check, it's a bug: *Invalid hook call*. `npm ls react` shows the tree; `resolve.dedupe` forces one copy.",
        },
        {
          t: "quiz",
          q: "Your entry chunk is 900 kB and Vite warns about it. First move?",
          options: ["Try another minifier", "Open the treemap: it's usually one dependency or a route that should be behind `import()`", "Raise `chunkSizeWarningLimit`", "Turn on brotli"],
          answer: 1,
          why: "Raising the limit silences the messenger, and minifiers differ by a few percent. Nearly every oversized entry is a library imported whole or a page that belongs behind `import()`. Measure, then split or replace.",
        },
        {
          t: "mission",
          h: "Audit a real Vite build",
          x: "Take any Vite app. Build with maps, open the treemap and name the three biggest things. Move one route behind `import()` and confirm a new chunk with no INEFFECTIVE_DYNAMIC_IMPORT warning. Then grep `dist` for env values and secrets, and check no `.map` is served.",
          hint: "`grep -r VITE_ src` lists what's exposed; `grep -rl \"sk_\\|BEGIN\" dist` catches the classic leaks. The build log prints a line per chunk with its gzip size.",
          solution: {
            lang: "bash",
            src: `npx vite build --sourcemap
npx source-map-explorer "dist/assets/*.js"      # biggest modules first

# src/router.js: () => import("./pages/Editor.js") instead of a static import
npx vite build 2>&1 | grep -i "ineffective\\|Editor-"

grep -rhoE "import\\.meta\\.env\\.VITE_[A-Z_]+" src | sort -u   # what ships
grep -rlE "sk_live|BEGIN (RSA|OPENSSH)|password" dist        # what shouldn't
rm dist/assets/*.map                                          # before deploy
curl -s -o /dev/null -w "%{http_code}\\n" https://your.site/assets/index-XXXX.js.map`,
          },
        },
      ],
    },
    {
      title: "Rebuild: a bundler in 50 lines",
      beats: [
        {
          t: "rebuild",
          h: "A tiny bundler",
          x: "Files are strings in a map. A regex finds imports and exports, a depth-first walk gives ESM evaluation order, each module becomes a function whose exports land in `modules`, and the result is one string you can run. Read the printed bundle, then the output.",
          mode: "js",
          js: `// A tiny bundler. Files are strings in a map; the output is one runnable script.
const files = {
  "main.js": \`import { add } from "./math.js";
import { log as print } from "./log.js";
print("2 + 3 = " + add(2, 3));\`,
  "math.js": \`import { log } from "./log.js";
log("math loaded");
export const add = (a, b) => a + b;\`,
  "log.js": \`export function log(msg) { console.log("[app]", msg); }\`,
};

const IMPORT = /^import\\s*\\{([^}]*)\\}\\s*from\\s*["']\\.\\/([^"']+)["'];?$/gm;
const EXPORT = /^export\\s+(?:const|let|var|function|class)\\s+(\\w+)/gm;

function parse(name) {
  const code = files[name];
  if (code == null) throw new Error("cannot resolve ./" + name);
  return {
    code,
    deps: [...code.matchAll(IMPORT)].map((m) => m[2]),
    exports: [...code.matchAll(EXPORT)].map((m) => m[1]),
  };
}

// Depth-first, post-order: each module lands after its dependencies.
function order(entry) {
  const out = [], seen = new Set();
  (function visit(name) {
    if (seen.has(name)) return;
    seen.add(name);
    parse(name).deps.forEach(visit);
    out.push(name);
  })(entry);
  return out;
}

// Each module becomes a function run once, in order; its exports land in \`modules\`.
function wrap(name) {
  const { code, exports } = parse(name);
  const body = code
    .replace(IMPORT, (_, names, dep) => \`const {\${names.replace(/\\s+as\\s+/g, ": ")}} = modules["\${dep}"];\`)
    .replace(/^export\\s+/gm, "");
  return \`modules["\${name}"] = (() => {\\n\${body}\\nreturn { \${exports.join(", ")} };\\n})();\`;
}

const bundle = (entry) => "const modules = {};\\n" + order(entry).map(wrap).join("\\n");

const out = bundle("main.js");
console.log(out);
console.log("--- run ---");
new Function(out)();`,
          task: "Add `import x from` and `export default`. Then make log.js import math.js: note the crash, and make `order` throw `cycle: math.js -> log.js -> math.js` instead.",
        },
        {
          t: "quiz",
          q: "Our bundle copies exports at the end of each module. math.js exports `let count = 0` and `inc()`; main calls `inc()` then logs `count`. Ours vs real ESM?",
          options: ["Both log 1", "Ours logs 0, ESM logs 1: imports are live bindings", "Ours logs 1, ESM logs 0", "Both log 0"],
          answer: 1,
          why: "An ESM import is a live view of the exporter's variable, not a copy. Scope hoisting gets this free, since it's literally one variable. Runtimes fake it with getters: Rolldown's `__exportAll` defines one per export.",
        },
      ],
    },
  ],
  nobodyTells: [
    "Compression works per response. Hundreds of small modules compress worse than one bundle of the same code.",
    "`/* @__PURE__ */` before a call is how libraries tell your bundler it may delete that call. Without it, unused factory calls stay.",
    "A patched or linked dependency acting stale in dev? The pre-bundle cache is in `node_modules/.vite`; `vite --force` rebuilds it.",
    "One leaf edit renames every chunk on the importer path above it. Stable vendor chunks and import maps limit the cascade.",
    "Keep old hashed assets for a few deploys. Open tabs will keep asking for them.",
    "Every Vite env value is a string. `VITE_FLAG=false` is truthy.",
    "Referencing `import.meta.env` as a whole object inlines every exposed variable at that spot, used or not.",
    "Transpiling never adds APIs. A browser inside your build target can still throw `is not a function`.",
  ],
  glossary: [
    ["module graph", "Files as nodes, imports as edges, built by parsing from the entries. Every bundler step runs on it."],
    ["bare specifier", "An import like `\"react\"` that isn't a URL. Browsers need an import map or a bundler to resolve it."],
    ["scope hoisting", "Concatenating modules into one scope and renaming clashes, instead of wrapping each in a function."],
    ["tree shaking", "Dropping exports nobody imports and code without side effects, across the whole graph."],
    ["sideEffects", "A package.json field promising a package's files can be skipped entirely when none of their exports are used."],
    ["chunk", "One output JS file: an entry, a dynamic import's split, or a shared group of modules."],
    ["content hash", "A hash of a file's bytes in its name, so it can be cached forever and busted exactly."],
    ["import map", "A JSON script telling the browser which URL each bare specifier or prefix maps to."],
    ["pre-bundling", "Vite dev bundling each dependency once into `node_modules/.vite/deps`, as ESM."],
    ["HMR boundary", "A module that accepts its own or a dependency's update, so the change stops there without a reload."],
    ["source map", "JSON mapping output positions back to original files; usually embeds the original source text."],
    ["polyfill", "Runtime code that adds a missing API. Transpiling only rewrites syntax."],
  ],
  explain: "Explain to a friend why a site still needs a bundler when browsers support ES modules, and why changing one small file can rename four files in the build.",
};
