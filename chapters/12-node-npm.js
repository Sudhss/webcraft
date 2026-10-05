const raw = String.raw;

export default {
  id: "node-npm",
  n: 12,
  part: "C",
  title: "Node, npm and modules",
  hook: "Node is V8, a C event loop and a folder of strangers' code. Know all three and none of them can surprise you.",
  minutes: 75,
  levels: ["use", "understand", "rebuild"],
  sections: [
    {
      title: "What Node actually is",
      beats: [
        { t: "say", x: "Node is three things glued together. **V8** runs your JS. **libuv**, a C library, owns the event loop, timers, sockets and a threadpool. C++ **bindings** connect the two, so `fs.readFile` in JS becomes a libuv request in C." },
        {
          t: "steps",
          h: "What `fs.readFile(path, cb)` really does",
          items: [
            "JS in `lib/fs.js` checks the arguments and calls into the C++ binding.",
            "The binding wraps an `open` in a libuv request and returns. Your JS keeps running.",
            "A threadpool thread makes the blocking `open` syscall. The OS has no portable async file API, so someone has to block.",
            "The thread signals the loop. In the poll phase, the loop runs the completion, which issues the next step: stat, read, close.",
            "A small file takes four trips through the pool. After the last one, Node calls your `cb` on the main thread.",
          ],
        },
        {
          t: "predict",
          lang: "js",
          src: "// 1000 open HTTP connections, all idle, waiting for data\nfor (const url of urls) {\n  http.get(url, (res) => res.on('data', handle));\n}",
          q: "How many threads are blocked waiting on those sockets?",
          options: ["1000, one per socket", "4, the threadpool", "None: the kernel watches all of them", "One per CPU core"],
          answer: 2,
          why: "Sockets are non-blocking file descriptors registered with epoll, kqueue or IOCP. One call asks the kernel which of the 1000 are ready. That's why Node holds 10k connections cheaply. The DNS lookups before connecting did use the pool, though.",
        },
      ],
    },
    {
      title: "The event loop, phase by phase",
      beats: [
        { t: "say", x: "The loop cycles through phases, each with its own queue: **timers**, pending, **poll** (wait for I/O, run its callbacks), **check** (`setImmediate`), **close**. After **every single callback**, Node drains `process.nextTick` callbacks, then promise microtasks." },
        {
          t: "code",
          lang: "js",
          file: "order.cjs",
          src: "const fs = require('node:fs');\n\nfs.readFile(__filename, () => {\n  console.log('read');\n  setTimeout(() => console.log('timeout'), 0);\n  setImmediate(() => console.log('immediate'));\n  process.nextTick(() => console.log('tick'));\n  Promise.resolve().then(() => console.log('promise'));\n});\nconsole.log('sync');",
          note: "Every run prints: sync, read, tick, promise, immediate, timeout. Step through why.",
        },
        {
          t: "viz",
          name: "frames",
          props: {
            cols: ["Loop phase", "Waiting (timers, check, pool)", "nextTick queue", "Microtasks", "Output"],
            frames: [
              { cells: [["main script"], ["pool: readFile"], [], [], ["sync"]], note: "The script runs top to bottom. `readFile` hands work to the threadpool and returns at once." },
              { cells: [["timers"], ["pool: readFile"], [], [], ["sync"]], note: "The script ends, both queues are empty, the loop starts. No timers are due." },
              { cells: [["poll"], ["pool: readFile"], [], [], ["sync"]], note: "Nothing else to do, so poll blocks in the kernel until a pool thread reports progress. Open, stat, read, close: four round trips." },
              { cells: [["poll: readFile cb"], ["timers: timeout", "check: immediate"], ["tick"], ["promise"], ["sync", "read"]], note: "Your callback runs and schedules four things into four different queues." },
              { cells: [["poll: after cb"], ["timers: timeout", "check: immediate"], [], ["promise"], ["sync", "read", "tick"]], note: "The callback returned. Node drains the nextTick queue first." },
              { cells: [["poll: after cb"], ["timers: timeout", "check: immediate"], [], [], ["sync", "read", "tick", "promise"]], note: "Then all promise microtasks. Only now may the loop move on." },
              { cells: [["check"], ["timers: timeout"], [], [], ["sync", "read", "tick", "promise", "immediate"]], note: "Check comes right after poll, so `setImmediate` always wins when scheduled from an I/O callback." },
              { cells: [["timers (next lap)"], [], [], [], ["sync", "read", "tick", "promise", "immediate", "timeout"]], note: "Close phase, then around to timers. The 1 ms timer is due. Done: nothing is waiting, so the process exits." },
            ],
          },
        },
        {
          t: "predict",
          lang: "js",
          src: "// main.cjs\nsetImmediate(() => console.log('immediate'));\nPromise.resolve().then(() => console.log('promise'));\nprocess.nextTick(() => console.log('tick'));\nconsole.log('sync');",
          q: "What order?",
          options: ["sync, promise, tick, immediate", "sync, tick, promise, immediate", "sync, immediate, tick, promise", "tick, sync, promise, immediate"],
          answer: 1,
          why: "The main script is one big callback. When it returns, Node drains nextTick, then microtasks, then enters the loop. `setImmediate` waits for the check phase of the first loop iteration.",
        },
        {
          t: "predict",
          lang: "js",
          src: "// the exact same code, saved as main.mjs\nsetImmediate(() => console.log('immediate'));\nPromise.resolve().then(() => console.log('promise'));\nprocess.nextTick(() => console.log('tick'));\nconsole.log('sync');",
          q: "What order now?",
          options: ["sync, tick, promise, immediate", "sync, promise, tick, immediate", "sync, immediate, promise, tick", "It throws: no `process` in ESM"],
          answer: 1,
          why: "An ES module's body is evaluated inside the loader's promise machinery. When it finishes, V8 is already draining microtasks, so `promise` runs before Node gets back to the nextTick queue. Moving a file to ESM can reorder your ticks.",
        },
        {
          t: "predict",
          lang: "js",
          src: "Promise.resolve()\n  .then(() => {\n    console.log('p1');\n    process.nextTick(() => console.log('tick'));\n  })\n  .then(() => console.log('p2'));",
          q: "What order?",
          options: ["p1, tick, p2", "p1, p2, tick", "tick, p1, p2", "p1, p2, and tick never runs"],
          answer: 1,
          why: "Node drains nextTick, then hands V8 the microtask queue, and V8 empties it completely, including `p2`, queued along the way. Only then does Node look at nextTick again. \"nextTick always runs first\" is only true from outside a microtask.",
        },
        {
          t: "predict",
          lang: "js",
          src: "// main.cjs, nothing else in the file\nsetTimeout(() => console.log('timeout'), 0);\nsetImmediate(() => console.log('immediate'));",
          q: "What prints?",
          options: ["timeout, immediate, every time", "immediate, timeout, every time", "Either order; it changes between runs"],
          answer: 2,
          why: "`setTimeout(f, 0)` is really 1 ms. If the loop reaches the timers phase before 1 ms has passed on its clock, the timer isn't due and check runs first. That depends on machine load. Inside an I/O callback the order is fixed.",
        },
        {
          t: "table",
          head: ["Pair", "Order you can rely on"],
          rows: [
            ["nextTick vs promise, after a normal callback", "nextTick first"],
            ["nextTick vs promise, at the top of an ES module", "promise first"],
            ["nextTick queued inside a promise callback", "after every microtask already queued"],
            ["`setImmediate` vs `setTimeout(0)`, in the main module", "none: it varies"],
            ["`setImmediate` vs `setTimeout(0)`, inside an I/O callback", "immediate first"],
            ["two `setTimeout`s with the same delay", "creation order, microtasks drained between them"],
          ],
        },
        {
          t: "pitfall",
          h: "Recursive nextTick starves the server",
          x: "A function that reschedules itself with `process.nextTick`, or an endless promise chain, never lets the loop reach poll. No sockets are read, no timers fire, CPU sits at 100% and health checks time out. Yield with `setImmediate` between chunks of work.",
        },
        {
          t: "pitfall",
          h: "setTimeout past 24.8 days fires now",
          x: "Delays above 2^31-1 ms are set to 1 ms, with only a `TimeoutOverflowWarning`. A \"refresh in 30 days\" timer fires immediately, reschedules, fires again, forever. Chain shorter timers, or store the deadline and check it.",
        },
      ],
    },
    {
      title: "The threadpool, and blocking the loop",
      beats: [
        { t: "say", x: "Work with no async OS API goes to libuv's threadpool: file I/O, `dns.lookup`, and CPU-heavy calls like `crypto.pbkdf2`, `scrypt`, `randomBytes` and async zlib. It has **4 threads** by default, shared by the whole process." },
        {
          t: "predict",
          lang: "js",
          src: "// one pbkdf2 takes ~250 ms of CPU; the machine has 12 cores\nconst t0 = Date.now();\nfor (let i = 1; i <= 6; i++) {\n  crypto.pbkdf2('pw', 'salt', 300000, 64, 'sha512', () =>\n    console.log(i, Date.now() - t0, 'ms'));\n}",
          q: "When do the six callbacks arrive?",
          options: ["All six at ~250 ms", "Four at ~250 ms, then two at ~500 ms", "One every 250 ms, 1.5 s total", "All six at ~1.5 s"],
          answer: 1,
          why: "Four pool threads, six jobs: two wait for a free thread, whatever the core count. Measured: 245-295 ms, then 461-481 ms. With `UV_THREADPOOL_SIZE=6` all six land at ~340 ms.",
        },
        {
          t: "code",
          lang: "bash",
          src: "# set it in the environment, before node starts\nUV_THREADPOOL_SIZE=16 node server.js\n\n# find what is burning the main thread instead\nnode --cpu-prof server.js   # writes a .cpuprofile; open it in Chrome DevTools",
          note: "libuv creates every thread on first use and never resizes the pool. The maximum is 1024. More threads only help if the work is waiting, not if cores are saturated.",
        },
        {
          t: "pitfall",
          h: "DNS lookups share the pool with your files",
          x: "Every outgoing connection to a hostname resolves it with `dns.lookup`, a blocking `getaddrinfo` on a pool thread. Four slow DNS answers and every `fs.readFile` in the process queues behind them. `dns.resolve*` uses the network directly and skips the pool.",
        },
        { t: "say", x: "The pool protects you from slow syscalls, not from your own JS. `JSON.parse` of a 34 MB string took 309 ms here, and for those 309 ms the process answered nobody. Measure it:" },
        {
          t: "play",
          mode: "node",
          title: "event loop lag",
          js: "const { monitorEventLoopDelay } = require('node:perf_hooks');\nconst http = require('node:http');\n\nconst lag = monitorEventLoopDelay({ resolution: 10 });\nlag.enable();\nsetInterval(() => {\n  const ms = (ns) => (ns / 1e6).toFixed(1);\n  console.log(`loop lag p50 ${ms(lag.percentile(50))} ms, p99 ${ms(lag.percentile(99))} ms, max ${ms(lag.max)} ms`);\n  lag.reset();\n}, 2000);\n\nconst big = JSON.stringify(Array.from({ length: 1e6 }, (_, i) => ({ id: i, name: 'user' + i })));\n\nhttp.createServer((req, res) => {\n  if (req.url === '/slow') JSON.parse(big); // ~300 ms of blocked loop\n  res.end('ok\\n');\n}).listen(3000, () => console.log('curl localhost:3000/slow, then /'));",
          task: "Hit `/slow` in one terminal while looping `curl localhost:3000/` in another. The fast route waits too, and max lag jumps to the parse time.",
        },
        {
          t: "pitfall",
          h: "One regex can take the server down",
          x: "`/^(a+)+$/` on 26 `a`s and a `!` took 627 ms here, and each extra character roughly doubles it. Nested quantifiers on user input are a denial of service. Avoid `(x+)+` shapes, cap input length, or use a linear engine like RE2.",
        },
        {
          t: "quiz",
          q: "Each request resizes an image in pure JS for ~80 ms. The API stalls under load. Best fix?",
          options: ["Raise `UV_THREADPOOL_SIZE`", "Wrap the resize in a Promise", "Run it in a pool of `worker_threads` sized to the cores", "Split it with `process.nextTick`"],
          answer: 2,
          why: "The threadpool only runs libuv and C++ work, never your JS. A Promise doesn't move work off the thread. Worker threads each get their own V8 isolate and loop, so the main loop stays free to accept connections.",
        },
      ],
    },
    {
      title: "CommonJS and ES modules",
      beats: [
        {
          t: "predict",
          lang: "js",
          src: "// main.cjs, this is the whole file\nconsole.log(typeof arguments, arguments.length);",
          q: "What prints?",
          options: ["ReferenceError: arguments is not defined", "undefined 0", "object 5", "object 0"],
          answer: 2,
          why: "Node wraps every CommonJS file in `function (exports, require, module, __filename, __dirname) {...}`. That's where the five \"globals\" come from, and why top-level `var` stays private. In an ES module this line throws.",
        },
        { t: "say", x: "`require` is a synchronous function call: resolve the path, check the cache, read, wrap, run, return `module.exports`. `import` is a declaration: the whole graph is parsed and linked before any of it runs, and imports are **live bindings**, not copies." },
        {
          t: "predict",
          lang: "js",
          src: "// main.mjs   (counter.mjs: export let count = 0; export function inc() { count++; })\nimport { count, inc } from './counter.mjs';\ninc(); inc();\nconsole.log(count);\n\n// main.cjs   (counter.cjs: let count = 0; module.exports = { count, inc() { count++; } })\nconst { count, inc } = require('./counter.cjs');\ninc(); inc();\nconsole.log(count);",
          q: "What do the two files print?",
          options: ["2 and 2", "2 and 0", "0 and 0", "0 and 2"],
          answer: 1,
          why: "An ESM import is a view of the exporter's variable, so it sees `count` change. `module.exports` got a copy of the number at export time, and destructuring copied it again. Export a getter or a function if CJS state must stay live.",
        },
        {
          t: "predict",
          lang: "js",
          src: "// greet.cjs\nexports = { hello: () => 'hi' };\n\n// main.cjs\nconsole.log(require('./greet.cjs'));",
          q: "What prints?",
          options: ["{ hello: [Function: hello] }", "{}", "undefined", "TypeError"],
          answer: 1,
          why: "`exports` is just a parameter that starts out pointing at `module.exports`. Reassigning it rebinds your local name; `require` returns `module.exports`, still `{}`. Add properties to `exports`, or assign `module.exports`.",
        },
        {
          t: "predict",
          lang: "js",
          src: "// a.cjs\nconst b = require('./b.cjs');\nexports.done = true;\n\n// b.cjs\nconst a = require('./a.cjs');\nconsole.log('b sees', a.done);\n\n// $ node a.cjs",
          q: "What does b print?",
          options: ["b sees true", "b sees undefined", "It loops forever", "ReferenceError"],
          answer: 1,
          why: "a is put in the cache before it runs. When b requires it mid-load, it gets a's unfinished exports object. The ESM version of this cycle throws a ReferenceError instead: the binding exists but isn't initialized yet.",
        },
        {
          t: "table",
          head: ["File", "Nearest package.json", "Loaded as"],
          rows: [
            ["`.mjs`", "anything", "ESM"],
            ["`.cjs`", "anything", "CommonJS"],
            ["`.js`", "`\"type\": \"module\"`", "ESM"],
            ["`.js`", "`\"type\": \"commonjs\"`", "CommonJS"],
            ["`.js`", "no `type` field, or none", "CommonJS, unless it has `import`/`export`: then reparsed as ESM with a warning"],
          ],
          caption: "Always set `type`. The detection fallback costs a second parse and a warning on every start.",
        },
        {
          t: "code",
          lang: "js",
          src: "// inside an ES module\nimport legacy from './legacy.cjs';     // default is module.exports: always works\nimport { parse } from './legacy.cjs';  // only if a static scan finds `exports.parse =`\nimport { createRequire } from 'node:module';\nconst require = createRequire(import.meta.url);\nconst data = require('./data.json');\nconst here = import.meta.dirname;       // no __dirname in ESM\n\n// inside CommonJS, Node 22.12+ and 20.19+\nconst ns = require('./esm-only.mjs');   // the namespace; default export is ns.default\nconst later = await import('./has-top-level-await.mjs'); // only in async code",
          mark: [3, 10],
          note: "Named imports from CJS come from a lexer guessing at `exports.x =` patterns. `exports[name] =` or a reassigned `module.exports` built at runtime hides them.",
        },
        {
          t: "quiz",
          q: "A dependency you `require()` ships v3 as ESM only, with a top-level `await` in its entry. What happens on Node 24?",
          options: ["It works: require waits for the await", "It throws `ERR_REQUIRE_ASYNC_MODULE`", "It returns a Promise", "It loads but exports are undefined"],
          answer: 1,
          why: "`require(esm)` is on by default in every supported LTS line, but `require` is synchronous and can't wait. A graph with top-level await must be loaded with `await import()`. Without TLA you'd get the namespace object.",
        },
        {
          t: "pitfall",
          h: "The dual package hazard",
          x: "A package shipping both a CJS and an ESM build can load twice in one process, once per loader. Two copies of its state: `instanceof` fails, caches and singletons split, plugins register into the other copy. Now that `require(esm)` works, shipping ESM only avoids it.",
        },
      ],
    },
    {
      title: "Resolution and package.json",
      beats: [
        {
          t: "steps",
          h: "`require('lodash')` from /app/src/util.js",
          items: [
            "Core module? `node:fs` or bare `fs` returns the built-in, no disk access.",
            "Starts with `./`, `../` or `/`? Resolve relative to the file: try `X`, `X.js`, `X.json`, `X.node`, then `X/index.js`.",
            "Bare name: try `/app/src/node_modules/lodash`, then `/app/node_modules/lodash`, then `/node_modules/lodash`.",
            "Found the folder? If its package.json has `exports`, that map is the only way in. Else `main`, else `index.js`.",
            "Still nothing: `NODE_PATH` and a few legacy global folders, then `MODULE_NOT_FOUND`.",
          ],
        },
        {
          t: "predict",
          lang: "js",
          src: "// node_modules/pkg/package.json: { \"exports\": { \".\": \"./dist/index.js\" } }\nrequire('pkg');\nrequire('pkg/src/util.js');\nrequire('pkg/package.json');",
          q: "How many of the three lines throw?",
          options: ["0", "1", "2", "3"],
          answer: 2,
          why: "Once `exports` exists, unlisted subpaths are private: `ERR_PACKAGE_PATH_NOT_EXPORTED`, even for `package.json`. Adding `exports` to a published package is a breaking change, and tools that read a dependency's package.json break too.",
        },
        {
          t: "code",
          lang: "json",
          file: "package.json",
          src: "{\n  \"name\": \"tiny-lib\",\n  \"version\": \"2.1.0\",\n  \"type\": \"module\",\n  \"exports\": {\n    \".\": {\n      \"types\": \"./dist/index.d.ts\",\n      \"default\": \"./dist/index.js\"\n    },\n    \"./package.json\": \"./package.json\"\n  },\n  \"bin\": { \"tiny\": \"./bin/tiny.js\" },\n  \"files\": [\"dist\", \"bin\"],\n  \"engines\": { \"node\": \">=22.12\" },\n  \"sideEffects\": false\n}",
          mark: [7, 8, 10],
          note: "Conditions match in key order, first hit wins: `types` first, `default` last. ESM only is fine here: every Node the `engines` range allows can `require()` it.",
        },
        {
          t: "table",
          head: ["Field", "What it really does"],
          rows: [
            ["`exports`", "the public API; everything unlisted is unreachable"],
            ["`main`", "entry point, used only when `exports` is absent"],
            ["`bin`", "linked into `node_modules/.bin`; the file needs `#!/usr/bin/env node`"],
            ["`files`", "allowlist for the tarball; `npm pack --dry-run` shows the result"],
            ["`engines`", "a warning for consumers, unless they set `engine-strict`"],
            ["`sideEffects`", "a bundler hint for tree shaking (chapter 13); Node ignores it"],
          ],
        },
        {
          t: "pitfall",
          h: "One file, two modules, on macOS and Windows",
          x: "The cache is keyed by the resolved path string. On a case-insensitive disk, `require('./Logger')` and `require('./logger')` both succeed and load two instances with separate state. On Linux CI one of them fails to resolve. Match case exactly.",
        },
        {
          t: "pitfall",
          h: "ESM doesn't guess extensions",
          x: "`import './util'` is `ERR_MODULE_NOT_FOUND` and `import './lib'` is `ERR_UNSUPPORTED_DIR_IMPORT`: ESM resolves URLs, not files. Bundlers and TypeScript fill the gap, so code works in dev and dies when plain Node runs the output. Write `./util.js`.",
        },
      ],
    },
    {
      title: "Versions, lockfiles and installs",
      beats: [
        {
          t: "table",
          head: ["Range", "Means", "Note"],
          rows: [
            ["`^1.4.2`", ">=1.4.2 <2.0.0", "what `npm install x` writes"],
            ["`^0.4.2`", ">=0.4.2 <0.5.0", "below 1.0 the minor is the breaking digit"],
            ["`^0.0.4`", ">=0.0.4 <0.0.5", "effectively exact"],
            ["`~1.4.2`", ">=1.4.2 <1.5.0", "patches only"],
            ["`1.4.x` or `1.4`", ">=1.4.0 <1.5.0", ""],
            ["`>=1.4.2`", "anything newer, including 2.0 and 9.0", "almost never what you want"],
          ],
          caption: "Prereleases are skipped: `^1.4.2` never picks `1.5.0-beta.1`.",
        },
        {
          t: "predict",
          lang: "json",
          src: "// package.json\n\"dependencies\": { \"lib\": \"^0.9.1\" }\n\n// published: 0.9.1, 0.9.7, 0.10.0, 1.0.0\n// fresh install, no lockfile",
          q: "Which version do you get?",
          options: ["1.0.0", "0.10.0", "0.9.7", "0.9.1"],
          answer: 2,
          why: "Caret allows changes that don't touch the leftmost non-zero digit. For 0.9.1 that's the 9, so `<0.10.0`. semver treats every 0.x minor as potentially breaking, and so should you.",
        },
        {
          t: "predict",
          lang: "bash",
          src: "# package.json:        \"lodash\": \"^4.17.0\"\n# package-lock.json:   lodash 4.17.21\n# the registry now has 4.18.0\nnpm install",
          q: "Which lodash ends up in node_modules?",
          options: ["4.18.0: install always takes the newest match", "4.17.21: the lockfile still satisfies the range", "4.17.0: the lowest match", "It fails: lockfile out of date"],
          answer: 1,
          why: "\"npm install ignores the lockfile\" is folklore. If the locked version satisfies package.json, npm keeps it. It only re-resolves what you changed. `npm update lodash` moves it on purpose.",
        },
        {
          t: "compare",
          a: { label: "npm install", lang: "bash", src: "npm install\n# resolves anything package.json changed,\n# may rewrite package-lock.json,\n# reuses what's in node_modules" },
          b: { label: "npm ci", lang: "bash", src: "npm ci\n# needs a lockfile, fails if it disagrees\n# with package.json, deletes node_modules,\n# never writes package.json or the lock" },
          x: "Use `npm ci` in CI and Docker: the install is exactly the lockfile or an error. `npm install` there can quietly build a tree nobody reviewed.",
        },
        {
          t: "table",
          head: ["Kind", "Installed when", "Use for"],
          rows: [
            ["`dependencies`", "always, also for your consumers", "what your code imports at runtime"],
            ["`devDependencies`", "only at the root; `--omit=dev` skips them", "build, test, lint tools"],
            ["`peerDependencies`", "by default since npm 7; a conflict is `ERESOLVE`", "\"my host provides this\": react for a React plugin"],
            ["`optionalDependencies`", "a failed install isn't fatal", "platform binaries; your code must handle absence"],
            ["`overrides`", "rewrites a transitive version everywhere", "forcing a patched sub-dependency"],
          ],
        },
        {
          t: "pitfall",
          h: "`--legacy-peer-deps` as a habit",
          x: "It makes `ERESOLVE` go away by ignoring peer dependencies entirely, so a plugin built for one major of its host now runs against another and breaks at runtime. Read the conflict first: `npm explain <pkg>` names who wants which range.",
        },
        {
          t: "pitfall",
          h: "Deleting the lockfile to fix a conflict",
          x: "That upgrades every transitive dependency in the tree at once, inside a merge. Resolve `package.json` by hand, then run `npm install`: npm reads the conflict markers in `package-lock.json` and writes a merged lock.",
        },
      ],
    },
    {
      title: "Inside node_modules",
      beats: [
        { t: "say", x: "npm installs a **hoisted** tree: every package goes as high up as it can without clashing, so most of the graph ends up flat under the root `node_modules`. Watch what that does for a small graph." },
        {
          t: "viz",
          name: "frames",
          props: {
            cols: ["package.json", "node_modules/", "nested node_modules", "require('c') in your app"],
            frames: [
              { cells: [["a ^1", "b ^1"], [], [], ["not installed"]], note: "You depend on a and b. a needs c@1. b needs c@2." },
              { cells: [["a ^1", "b ^1"], ["a@1.0.0"], [], ["not installed"]], note: "a goes to the top." },
              { cells: [["a ^1", "b ^1"], ["a@1.0.0", "c@1.3.0"], [], ["c@1.3.0"]], note: "a's dependency c@1 is hoisted to the top too, since nothing is there yet." },
              { cells: [["a ^1", "b ^1"], ["a@1.0.0", "c@1.3.0", "b@1.0.0"], [], ["c@1.3.0"]], note: "b goes to the top." },
              { cells: [["a ^1", "b ^1"], ["a@1.0.0", "c@1.3.0", "b@1.0.0"], ["b/node_modules/c@2.0.1"], ["c@1.3.0"]], note: "b needs c@2, but the top slot is taken, so c@2 nests under b. Two copies of c now exist." },
              { cells: [["a ^1", "b ^1"], ["a@1.0.0", "c@1.3.0", "b@1.0.0"], ["b/node_modules/c@2.0.1"], ["c@1.3.0 (phantom)"]], note: "Your code can `require('c')` and it works, though you never declared it. That's a **phantom dependency**." },
              { cells: [["a ^2", "b ^1"], ["a@2.0.0", "b@1.0.0", "c@2.0.1"], [], ["c@2.0.1: new major"]], note: "Upgrade a to a version that drops c and reinstall. c@2 gets the top slot, and your phantom import silently jumped a major." },
            ],
          },
        },
        {
          t: "predict",
          lang: "js",
          src: "// app code; 'debug' is not in your package.json\nconst debug = require('debug')('app');\n// works today, because express depends on it",
          q: "Which change can break this line?",
          options: ["Only deleting node_modules", "Upgrading any dependency that pulled `debug` in", "Switching to pnpm", "Both of the last two"],
          answer: 3,
          why: "Where `debug` lands is an accident of hoisting. An upgrade can move it, change its major, or remove it. pnpm doesn't hoist into your reach, so the require fails on the first try. Declare what you import.",
        },
        {
          t: "code",
          lang: "text",
          file: "the same graph under pnpm",
          src: "node_modules/\n  a -> .pnpm/a@1.0.0/node_modules/a\n  b -> .pnpm/b@1.0.0/node_modules/b\n  .pnpm/\n    a@1.0.0/node_modules/\n      a/                 hard links into the global store\n      c -> ../../c@1.3.0/node_modules/c\n    b@1.0.0/node_modules/\n      b/\n      c -> ../../c@2.0.1/node_modules/c\n    c@1.3.0/node_modules/c/\n    c@2.0.1/node_modules/c/",
          mark: [2, 3],
          note: "Only your direct deps sit at the top, so phantom requires fail. Each package sees exactly its own deps as siblings, via symlinks. File contents live once per disk.",
        },
        {
          t: "pitfall",
          h: "Two copies of a stateful package",
          x: "Duplicates of react, graphql or any class checked with `instanceof` break at runtime: \"Invalid hook call\", `instanceof` returning false, a context provider nobody sees. `npm ls react` shows every copy. That's why plugins list the host as a peer, not a dependency.",
        },
      ],
    },
    {
      title: "Scripts, npx and the supply chain",
      beats: [
        {
          t: "predict",
          lang: "bash",
          src: "# package.json scripts: prebuild, build, postbuild\n# build exits with code 1\nnpm run build\n\nnode --run build",
          q: "Which scripts run in each case?",
          options: ["All three, both times", "prebuild and build; then only build", "prebuild, build, postbuild; then build", "Only build, both times"],
          answer: 1,
          why: "`post` hooks run only if the main script succeeds. `node --run` executes the script without starting npm, and skips `pre`/`post` hooks by design. Handy for speed, surprising if your build relied on `prebuild`.",
        },
        {
          t: "table",
          head: ["Hook", "Runs"],
          rows: [
            ["`preinstall`, `install`, `postinstall`", "for every package in the tree that defines them, at install time"],
            ["`prepare`", "on a bare `npm install` in your repo, before `pack`/`publish`, and for git deps"],
            ["`prepublishOnly`", "only before `npm publish`"],
            ["`pre<name>`, `post<name>`", "around `npm run <name>`"],
          ],
          caption: "The first row is the dangerous one: code from the whole tree, running as you.",
        },
        { t: "say", x: "Scripts and `npx` both put `node_modules/.bin` first on PATH, so `tsc` means this project's version. If `npx tool` finds nothing local, it downloads the package and runs it: a prompt in a terminal, an automatic yes in CI or without a TTY." },
        {
          t: "pitfall",
          h: "An npx typo runs a stranger's code",
          x: "`npx create-vite-ap` in a CI script: if someone registered that name, it downloads and runs with your CI secrets in the environment, no prompt. Typosquats target exactly this. Pin tools in devDependencies, or `npx --package=tool@1.2.3 tool`.",
        },
        { t: "say", x: "An install script runs with your user's permissions: SSH keys, npm tokens, cloud credentials in env vars. Self-spreading npm worms in 2025 used exactly that: steal a maintainer's token at install, republish their other packages with the same payload." },
        {
          t: "quiz",
          q: "Sept 2025: a phished maintainer's account published malicious versions of chalk and debug. The payload hijacked crypto wallets in browsers. Which defense would have kept it out of your app?",
          options: ["`ignore-scripts=true`", "Running `npm audit` before deploy", "A committed lockfile plus a release-age cooldown", "Pinning exact versions of your direct dependencies"],
          answer: 2,
          why: "The payload ran when bundled code executed, not at install, and no advisory existed yet. chalk is usually transitive, so pinning direct deps misses it. A lockfile keeps known versions; a cooldown skips versions hours old, which these were.",
        },
        {
          t: "code",
          lang: "bash",
          file: ".npmrc and CI",
          src: "# .npmrc\nmin-release-age=3        # only install versions published 3+ days ago\nignore-scripts=true      # npm 11 and older: no dependency install scripts\n\n# CI\nnpm ci                   # exactly the lockfile\nnpm audit --omit=dev     # advisories in what actually ships\nnpm audit signatures     # verify registry signatures and provenance\n\n# npm 12+: install scripts are off unless allowlisted in package.json\nnpm approve-scripts --allow-scripts-pending",
          mark: [2, 3],
          note: "npm 12 (July 2026) no longer runs dependency install scripts unless you allow them. `ignore-scripts` also skips your own pre/post hooks. pnpm's version is `minimumReleaseAge`.",
        },
        {
          t: "pitfall",
          h: "`npm audit fix --force` is worse than the noise",
          x: "Most advisories hit dev tooling that never sees user input: a ReDoS in a CLI arg parser. `--force` jumps majors to silence them and breaks your build. Triage with `--omit=dev`, read the path, and patch a transitive dep with `overrides`.",
        },
        { t: "say", h: "Provenance", x: "Publish from GitHub Actions or GitLab CI with **trusted publishing** and npm attaches a signed attestation linking the tarball to the repo, commit and workflow that built it, with no long-lived token to steal. npm shows it; `npm audit signatures` checks it." },
      ],
    },
    {
      title: "Rebuild: require() in 60 lines",
      beats: [
        {
          t: "rebuild",
          h: "A CommonJS loader over a fake disk",
          x: "`files` is the disk. `resolve` does the relative-path probing and the node_modules walk; `load` checks the cache, caches **before** running (that's what makes cycles terminate), wraps the source in the five-argument function, and returns `module.exports`.",
          mode: "js",
          js: raw`const files = {
  "/app/main.js": "const greet = require('./lib/greet');\nconst cfg = require('./config.json');\nconst pad = require('left-pad');\nconsole.log(greet(cfg.name), pad('7', 3));\nconsole.log('cached:', require('./lib/greet') === greet);",
  "/app/lib/greet.js": "const { shout } = require('./util');\nmodule.exports = (n) => shout('hello ' + n);",
  "/app/lib/util/index.js": "exports.shout = (s) => s.toUpperCase();",
  "/app/config.json": '{ "name": "ada" }',
  "/app/node_modules/left-pad/package.json": '{ "main": "lib/pad.js" }',
  "/app/node_modules/left-pad/lib/pad.js": "module.exports = (s, n) => s.padStart(n, '0');",
};

const cache = {};
const dirname = (p) => p.slice(0, p.lastIndexOf("/")) || "/";
function join(base, rel) {
  const out = [];
  for (const part of (base + "/" + rel).split("/")) {
    if (part === "..") out.pop();
    else if (part && part !== ".") out.push(part);
  }
  return "/" + out.join("/");
}
function asFile(p) {
  for (const ext of ["", ".js", ".json"]) if (files[p + ext] !== undefined) return p + ext;
}
function asDir(p) {
  const pkg = files[p + "/package.json"];
  const main = pkg && JSON.parse(pkg).main;
  return (main && asFile(join(p, main))) || asFile(p + "/index");
}
function resolve(spec, fromDir) {
  const relative = /^\.{0,2}\//.test(spec);
  const tries = [];
  if (relative) tries.push(join(fromDir, spec));
  else for (let d = fromDir; ; d = dirname(d)) {
    tries.push(join(d, "node_modules/" + spec));   // walk up, one node_modules per level
    if (d === "/") break;
  }
  for (const p of tries) {
    const hit = asFile(p) || asDir(p);
    if (hit) return hit;
  }
  throw new Error("Cannot find module '" + spec + "' from " + fromDir);
}
function load(filename) {
  if (cache[filename]) return cache[filename].exports;
  const module = { exports: {}, filename, loaded: false };
  cache[filename] = module;                        // before running: cycles see partial exports
  const src = files[filename];
  if (filename.endsWith(".json")) module.exports = JSON.parse(src);
  else {
    const wrapper = new Function("exports", "require", "module", "__filename", "__dirname", src);
    const require = (spec) => load(resolve(spec, dirname(filename)));
    wrapper.call(module.exports, module.exports, require, module, filename, dirname(filename));
  }
  module.loaded = true;
  return module.exports;
}

load("/app/main.js");
console.log(Object.keys(cache));`,
          task: "Make util require `'../greet'` and log it: why `{}`, forever? Then support `\"exports\": \"./x.js\"` in package.json, and throw like Node for any subpath it doesn't list.",
        },
        {
          t: "mission",
          h: "Find what blocks your loop",
          x: "Add `monitorEventLoopDelay` to a real Node server and log p99 every 10 s. Load it with `autocannon`, find the worst route with `node --cpu-prof`, and move that work to a `worker_threads` pool. Show p99 before and after.",
          hint: "A flame graph wide at the top of a single frame is synchronous work. JSON on big bodies, sync fs, bcrypt with a sync API and regex are the usual suspects.",
        },
        {
          t: "mission",
          h: "Audit a real dependency tree",
          x: "In a project you work on: count installed packages, list those with install scripts, find one phantom dependency, and switch CI to `npm ci` with a release-age cooldown. Write down which install scripts you'd actually approve.",
          hint: "`npm ls --all --parseable | wc -l` counts packages. Lockfile entries with `\"hasInstallScript\": true` run code at install. A trial run under pnpm exposes phantoms fast.",
          solution: { lang: "bash", src: "npm ls --all --parseable | wc -l\ngrep -B6 '\"hasInstallScript\": true' package-lock.json | grep '\"node_modules/'\n\n# phantoms, on a throwaway branch: pnpm won't let undeclared imports resolve\nnpx --package=pnpm@10 -- pnpm import    # pnpm-lock.yaml from package-lock.json\nrm -rf node_modules && npx --package=pnpm@10 -- pnpm install && npm test\n\n# CI\nprintf 'min-release-age=3\\n' >> .npmrc\n# replace `npm install` with `npm ci` in the workflow" },
        },
      ],
    },
  ],
  nobodyTells: [
    "`setTimeout(f, 0)` is `setTimeout(f, 1)` in Node. Any code that relies on it beating `setImmediate` is a race.",
    "Node's own docs recommend `queueMicrotask` over `process.nextTick` for new code: it's portable and doesn't jump ahead of promises.",
    "`import.meta.dirname` and `import.meta.filename` replace `__dirname` and `__filename` in ES modules.",
    "`npm explain <pkg>` (alias `npm why`) tells you who pulled a package in. Faster than reading the lockfile.",
    "`npm pack --dry-run` lists exactly what you're about to publish. Run it before the first publish, not after leaking `.env`.",
    "`require.resolve('x')`, or `import.meta.resolve('x')` in ESM, returns the exact file that would load. Ask the resolver before blaming a version.",
    "`node --env-file=.env app.js` loads env vars with no dotenv dependency.",
    "With `NODE_ENV=production` set, npm skips devDependencies by default. Set it before the install in a Dockerfile and the build step loses its compiler.",
  ],
  glossary: [
    ["libuv", "The C library under Node: event loop, timers, non-blocking sockets and the threadpool."],
    ["threadpool", "libuv's worker threads (4 by default) for file I/O, `dns.lookup`, and some crypto and zlib."],
    ["poll phase", "The loop phase that waits for I/O and runs its callbacks."],
    ["check phase", "The phase right after poll, where `setImmediate` callbacks run."],
    ["nextTick queue", "Node's own queue, drained after every callback and ahead of promise microtasks queued by that callback."],
    ["module wrapper", "The function Node wraps each CommonJS file in, supplying `require`, `module`, `exports` and paths."],
    ["live binding", "An ESM import that always reflects the exporter's current value of the variable."],
    ["require(esm)", "Loading a synchronous ES module with `require()`, on by default since Node 22.12 and 20.19."],
    ["exports field", "The package.json map of a package's public entry points; unlisted paths can't be loaded."],
    ["lockfile", "`package-lock.json`: the exact resolved tree with integrity hashes, so installs repeat."],
    ["peer dependency", "A dependency the host project must provide, so plugin and host share one copy."],
    ["hoisting", "Placing packages as high in node_modules as possible to flatten the tree."],
    ["phantom dependency", "A package your code imports without declaring it, reachable only because of hoisting."],
    ["provenance", "A signed attestation linking a published package to the source and CI run that built it."],
  ],
  explain: "Explain to a friend why `setImmediate` beats `setTimeout(0)` inside a file-read callback but not in the main script, starting from the order of the loop's phases.",
};
