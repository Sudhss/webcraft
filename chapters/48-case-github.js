export default {
  id: "case-github",
  n: 48,
  part: "H",
  title: "Case study: the GitHub profile",
  hook: "A profile README can't run one line of JavaScript. So Node draws 34 SVGs every six hours, with the motion baked in.",
  minutes: 60,
  levels: ["use", "understand", "rebuild"],
  sections: [
    {
      title: "What you're looking at",
      beats: [
        { t: "say", x: "The profile at github.com/Sudhss looks live: a name etched in copper, ratings rolling up, a city of contributions with a train running past. None of it is a web page. Every piece is an `<img>` pointing at an SVG file." },
        {
          t: "code",
          lang: "js",
          file: "scripts/readme.mjs",
          src: "const RAW = `https://raw.githubusercontent.com/${cfg.github}/${cfg.github}/output`;\n\n// One line each: whitespace inside an <a> renders as an underlined gap.\nconst pic = (name, alt, width = \"100%\") =>\n  `<picture><source media=\"(prefers-color-scheme: dark)\" srcset=\"${RAW}/${name}-dark.svg\">` +\n  `<source media=\"(prefers-color-scheme: light)\" srcset=\"${RAW}/${name}-light.svg\">` +\n  `<img alt=\"${alt}\" src=\"${RAW}/${name}-dark.svg\" width=\"${width}\"></picture>`;",
          mark: [1, 5, 6],
          note: "Trimmed: the real `pic` is one template string. The README points at fixed URLs on a branch called `output`. The README never changes; the files behind the URLs do.",
        },
        {
          t: "quiz",
          q: "The numbers on the profile change every six hours. How often does README.md change?",
          options: ["Every six hours, rewritten by the workflow", "Only when someone runs `node scripts/readme.mjs` by hand and commits it", "Never; GitHub generates it", "On every push to main"],
          answer: 1,
          why: "readme.mjs says so in its header: run it by hand after changing projects or links. The workflow only redraws images and publishes them to `output`. Stable URLs, changing bytes: the README is just a layout.",
        },
        {
          t: "table",
          head: ["File", "Job"],
          rows: [
            ["`profile.config.json`", "Name, handles, links, projects, stack. The only file you edit for content"],
            ["`scripts/fetch.mjs`", "Live data from Codeforces, LeetCode, CodeChef and GitHub, no tokens"],
            ["`scripts/score.mjs`", "One grade across every platform"],
            ["`scripts/svg/*.mjs`", "One generator per image; `kit.mjs` holds the shared pieces"],
            ["`scripts/build.mjs`", "Runs it all, writes `dist/`: SVGs, `data.json`, a local preview"],
            ["`scripts/readme.mjs`", "Writes README.md from the config, run by hand"],
            ["`.github/workflows/profile.yml`", "Rebuilds on a schedule and publishes `dist/` to the `output` branch"],
          ],
        },
        { t: "say", x: "A local offline build of a copy prints `34 images -> dist/`. That's 17 images (hero, scoreboard, city, now, stack, six project cards, six link buttons), each drawn twice: dark and light." },
      ],
    },
    {
      title: "Why the animation lives inside the SVG",
      beats: [
        { t: "say", x: "GitHub renders a README through a sanitiser. The [github/markup](https://github.com/github/markup) README says it aggressively removes `script` tags, inline styles, and `class` and `id` attributes. Your README gets HTML structure, not behaviour." },
        {
          t: "predict",
          lang: "html",
          src: "<!-- hero.svg, linked from the README as <img src=\"...hero.svg\"> -->\n<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"200\" height=\"40\">\n  <text id=\"t\" x=\"10\" y=\"25\">waiting</text>\n  <script>document.getElementById('t').textContent = 'ran';</script>\n</svg>",
          q: "What does a visitor see?",
          options: ["ran", "waiting", "A broken image icon", "GitHub refuses to render the README"],
          answer: 1,
          why: "An SVG loaded as an image is a sealed document: browsers never run its scripts, never load external files from it. The script is inert; the static text stays. Motion has to come from SMIL or CSS animation inside the file.",
        },
        {
          t: "code",
          lang: "text",
          src: "$ curl -sI https://raw.githubusercontent.com/Sudhss/Sudhss/output/hero-dark.svg\nHTTP/1.1 200 OK\nCache-Control: max-age=300\nContent-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; sandbox\nContent-Type: image/svg+xml\nX-Content-Type-Options: nosniff",
          mark: [3, 4],
          note: "Even opened directly, raw.githubusercontent.com forbids scripts with its CSP. Inline styles are allowed. And `max-age=300`: a fresh image can take five minutes to appear.",
        },
        {
          t: "play",
          mode: "html",
          title: "same SVG, inline and as an <img>",
          html: `<svg id="art" xmlns="http://www.w3.org/2000/svg" width="260" height="70" viewBox="0 0 260 70">
  <rect x="0.5" y="0.5" width="259" height="69" rx="10" fill="#111821" stroke="#26313d"/>
  <text id="msg" x="16" y="28" font-family="ui-monospace,monospace" font-size="13" fill="#e6edf3">script did not run</text>
  <circle cx="20" cy="50" r="5" fill="#39d0c0">
    <animate attributeName="cx" values="20;240;20" dur="2.4s" repeatCount="indefinite"/>
  </circle>
  <script>document.getElementById('msg').textContent = 'script ran';</script>
</svg>
<p>Above: inline in the page. Below: the same markup as an &lt;img&gt;, like a README.</p>
<img id="img" width="260" height="70" alt="test card">`,
          css: `body { font: 14px system-ui; padding: 16px; background: #fff; color: #222; }`,
          js: `// the inline script has already rewritten the text; restore it, then copy the markup
const src = document.getElementById('art').outerHTML.replace('script ran', 'script did not run');
document.getElementById('img').src = 'data:image/svg+xml,' + encodeURIComponent(src);`,
          task: "Both dots move: SMIL runs in both contexts. Only the inline copy runs the script. Swap the `<animate>` for a `<style>` with `@keyframes` and check both still move.",
        },
        {
          t: "quiz",
          q: "Which does the profile use for motion?",
          options: ["CSS `@keyframes` in a `<style>` block", "SMIL elements: `<animate>`, `<animateTransform>`, `<animateMotion>`, `<set>`", "An animated GIF", "A `<script>` with requestAnimationFrame"],
          answer: 1,
          why: "kit.mjs says it in its header comment, and the built files contain no `<style>` at all. An offline build of the hero has 351 SMIL elements (`<animate...>` and `<set>`); the dark city has 814.",
        },
        {
          t: "quiz",
          q: "You host a README image on your own server, update it, and GitHub keeps showing the old one. What do GitHub's docs on anonymised (Camo) URLs say to check?",
          options: ["The file name: add a version suffix", "The `Cache-Control` header: return `no-cache` for images", "Repo visibility", "That the image is under 1 MB"],
          answer: 1,
          why: "GitHub proxies images from other hosts through Camo. Its docs say to check `Cache-Control` (return `no-cache` for images) and `Content-Type`. This profile skips that by serving from GitHub's own raw host, at a five-minute max-age.",
        },
      ],
    },
    {
      title: "What .mjs means",
      beats: [
        { t: "say", x: "Node has two module systems: CommonJS (`require`) and ES modules (`import`). For a `.js` file it decides by the nearest `package.json`'s `\"type\"`. `.mjs` is always ESM and `.cjs` always CommonJS, whatever any package.json says." },
        {
          t: "predict",
          lang: "bash",
          src: "# no package.json in this folder; a parent folder has one without \"type\"\n$ cat a.js\nimport { readFile } from \"node:fs/promises\";\nconsole.log(\"ran as ESM\");\n$ node a.js      # Node 22.14",
          q: "What happens?",
          options: ["SyntaxError: Cannot use import statement outside a module", "It runs, after a warning that Node had to reparse it as an ES module", "It runs silently", "Node looks for a.mjs instead"],
          answer: 1,
          why: "Recent Node detects module syntax when no `type` is set: it fails as CommonJS, reparses as ESM, and warns about the overhead. Put `\"type\": \"commonjs\"` in that parent package.json and the same file is a SyntaxError.",
        },
        {
          t: "pitfall",
          h: "A package.json you forgot about decides for you",
          x: "Node walks up from the file to the nearest package.json, past your project. On the machine this chapter was built on, the warning pointed at a stray one in the home folder. `.mjs` makes the file's meaning independent of whatever sits above it.",
        },
        { t: "say", x: "The Sudhss repo has **no package.json at all**. No dependencies, no `npm install`. Node 22 already ships `fetch`, `AbortSignal.timeout` and `fs/promises`. With no `type` to set, `.mjs` is the cleanest way to say ESM." },
        {
          t: "code",
          lang: "js",
          file: "scripts/build.mjs",
          src: "import { readFile, writeFile, mkdir } from \"node:fs/promises\";\nimport { fileURLToPath } from \"node:url\";\nimport path from \"node:path\";\nimport { fetchAll } from \"./fetch.mjs\";\n\nconst root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), \"..\");\n\nconst cfg = JSON.parse(await readFile(path.join(root, \"profile.config.json\"), \"utf8\"));",
          mark: [6, 8],
          note: "Two ESM-only things. ESM has no `__dirname`, so it's rebuilt from `import.meta.url`. And `await` at the top level, which CommonJS can't do. Imports name the extension: `./fetch.mjs`, never `./fetch`.",
        },
        {
          t: "predict",
          lang: "yaml",
          src: "# profile.yml, after build.mjs has written dist/data.json\n- name: Summary\n  run: |\n    node -e '\n      const d = require(\"./dist/data.json\");\n      console.log(d.stale.join(\", \") || \"none\");\n    '",
          q: "The project is all `.mjs`. Does this `require` work?",
          options: ["No: require is not defined in ES module scope", "Yes: `node -e` code is CommonJS by default, and require can load JSON", "Only with --input-type=module", "Only if data.json is renamed data.cjs"],
          answer: 1,
          why: "The module system is per file, and `-e` text with no import syntax is CommonJS. `require` of a `.json` file parses it. Mixing is fine as long as each piece knows what it is.",
        },
      ],
    },
    {
      title: "The pipeline",
      beats: [
        {
          t: "steps",
          h: "One run of build.mjs",
          items: [
            "Read `profile.config.json`.",
            "Load the previous run's `data.json`: local dist/, else the `output` branch over HTTP, else the committed `scripts/seed.json`.",
            "`fetchAll`: five sources in parallel, each falling back to its previous value on failure.",
            "Render every image in both themes; one throwing generator logs an error and sets a failing exit code.",
            "Write `dist/*.svg`, `dist/data.json`, and `dist/preview.html`, the README pointed at local files.",
          ],
        },
        {
          t: "table",
          head: ["Source", "How fetch.mjs reads it"],
          rows: [
            ["Codeforces", "Official API: `user.info` and `user.rating`"],
            ["LeetCode", "The public GraphQL endpoint the site itself uses"],
            ["CodeChef", "No API: regexes over the public profile page"],
            ["GitHub contributions", "Regexes over `github.com/users/<name>/contributions`"],
            ["GitHub activity", "REST: `/users/<name>/events/public`, unauthenticated"],
          ],
          caption: "The file header: public endpoints only, no tokens needed. Every request has a 20 s timeout.",
        },
        {
          t: "code",
          lang: "js",
          file: "scripts/fetch.mjs",
          src: "export async function fetchAll(cfg, previous = {}) {\n  const tasks = {\n    codeforces: () => codeforces(cfg.handles.codeforces),\n    leetcode: () => leetcode(cfg.handles.leetcode),\n    codechef: () => codechef(cfg.handles.codechef),\n    contributions: () => contributions(cfg.github),\n    activity: () => activity(cfg.github),\n  };\n  const data = { generatedAt: new Date().toISOString(), stale: [] };\n  await Promise.all(\n    Object.entries(tasks).map(async ([key, run]) => {\n      try {\n        data[key] = await run();\n      } catch (error) {\n        console.warn(`! ${key}: ${error.message} -- keeping the last good value`);\n        data[key] = previous[key] ?? null;\n        data.stale.push(key);\n      }\n    })\n  );\n  return data;\n}",
          mark: [12, 16, 17],
        },
        {
          t: "predict",
          lang: "js",
          src: "// CodeChef is behind Cloudflare today and returns 403.\n// Everything else answers.\nconst data = await fetchAll(cfg, previous);",
          q: "What does `fetchAll` do?",
          options: ["Rejects: Promise.all fails fast", "Resolves; codechef holds last run's value and `stale` is `[\"codechef\"]`", "Resolves with codechef: null and no record of it", "Retries CodeChef until it works"],
          answer: 1,
          why: "Each task catches its own error, so no promise passed to `Promise.all` ever rejects. The failure becomes data: the old value plus a note in `stale`, which the workflow prints in its run summary.",
        },
        {
          t: "pitfall",
          h: "Scraped HTML breaks without a status code",
          x: "A changed page still returns 200. So the scrapers check their own result: `if (!days.length) throw new Error(\"contributions: calendar layout changed\")`, and CodeChef throws when rating or stars come back empty. Without that, a redesign silently draws zeros.",
        },
        {
          t: "code",
          lang: "js",
          file: "scripts/score.mjs",
          src: "export function devScore(data) {\n  const parts = [];\n  if (data.codeforces) parts.push([\"Codeforces\", lerpLog(CF, data.codeforces.rating)]);\n  if (data.leetcode) parts.push([\"LeetCode\", data.leetcode.topPercent]);\n  if (data.codechef) parts.push([\"CodeChef\", CC_STARS[data.codechef.stars] ?? 100]);\n  if (data.contributions) parts.push([\"GitHub\", lerpLog(GH, data.contributions.total ?? 0)]);\n  if (!parts.length) return null;\n  const top = Math.exp(parts.reduce((n, [, p]) => n + Math.log(p), 0) / parts.length);\n  const grade = GRADES.find(([limit]) => top <= limit)[1];\n  return { top, score: Math.round(100 - top), grade, parts };\n}",
          mark: [8],
          note: "Each platform becomes \"top X%\", from rough distribution points interpolated in log space. Those tables are the author's estimates, as the file's comment says.",
        },
        {
          t: "quiz",
          q: "With the committed seed data the parts are about 12.8%, 1.05%, 3% and 5.7%. Why a geometric mean instead of the arithmetic one?",
          options: ["It's faster", "Percentiles multiply: one great platform can't carry a weak one, and the result is 3.9% (grade S) instead of 5.6%", "It always rounds up", "Arithmetic means can't handle four values"],
          answer: 1,
          why: "The file says it: so one great platform can't carry a weak one. A geometric mean of ratios treats halving and doubling symmetrically. Running `devScore` on seed.json gives top 3.90%, grade S.",
        },
      ],
    },
    {
      title: "The workflow",
      beats: [
        {
          t: "code",
          lang: "yaml",
          file: ".github/workflows/profile.yml",
          src: "on:\n  schedule:\n    - cron: \"23 */6 * * *\" # 00:23, 06:23, 12:23, 18:23 UTC\n  workflow_dispatch:\n  push:\n    branches: [main]\n    paths:\n      - \"scripts/**\"\n      - \"profile.config.json\"\n      - \".github/workflows/profile.yml\"\n\nconcurrency:\n  group: profile\n  cancel-in-progress: true\n\njobs:\n  build:\n    runs-on: ubuntu-latest\n    timeout-minutes: 5\n    permissions:\n      contents: write\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with:\n          node-version: 22\n      - name: Fetch live data and draw\n        run: node scripts/build.mjs",
          mark: [3, 21, 28],
          note: "Three ways in: the clock, a Run button, and a push that touches the generator. No `npm ci` step, because there is nothing to install.",
        },
        { t: "say", x: "Note the minute: `23`, not `0`. GitHub's docs say scheduled runs can be delayed under high load, and that the start of every hour is a high-load time. A cron off the hour mark dodges the rush." },
        {
          t: "code",
          lang: "yaml",
          file: ".github/workflows/profile.yml",
          src: "      - name: Publish to the output branch\n        uses: crazy-max/ghaction-github-pages@v3.1.0\n        with:\n          target_branch: output\n          build_dir: dist\n          commit_message: \"Rebuild profile images\"\n        env:\n          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}",
          note: "Not a commit to main. dist/ is gitignored; this action pushes it to `output`. With `keep_history` left at its default `false`, it force-pushes: the branch always holds exactly one commit.",
        },
        {
          t: "quiz",
          q: "Why publish to a separate branch instead of committing the SVGs to main?",
          options: ["Branches load faster", "main's history stays clean, and the force-pushed `output` never grows: no commit every six hours, no repo bloat", "GitHub can't serve SVGs from main", "The README can't link to main"],
          answer: 1,
          why: "Four rebuilds a day committed to main would mean about 1,460 commits a year, each keeping old copies of 34 files. One orphan commit on `output`, replaced each run, costs nothing. `git log origin/output` shows one commit.",
        },
        {
          t: "predict",
          lang: "yaml",
          src: "# the publish step pushes to `output` with GITHUB_TOKEN.\n# Suppose another workflow had:\non:\n  push:\n    branches: [output]",
          q: "Does that workflow run after each rebuild?",
          options: ["Yes, on every publish", "No: events made with GITHUB_TOKEN don't start new workflow runs", "Only for scheduled runs", "Yes, but only once a day"],
          answer: 1,
          why: "GitHub's docs: apart from `workflow_dispatch` and `repository_dispatch`, events triggered by `GITHUB_TOKEN` create no workflow runs. That's what stops a build that pushes from triggering itself forever.",
        },
        {
          t: "predict",
          lang: "js",
          src: "// build.mjs, rendering\ntry {\n  const out = render(t);\n  if (!out) continue;\n  await writeFile(path.join(dist, `${name}-${t.name}.svg`), out);\n} catch (error) {\n  console.error(`x ${name}-${t.name}: ${error.message}`);\n  process.exitCode = 1;\n}\n// city.mjs throws on this run; the other 32 files are written.",
          q: "What reaches the profile?",
          options: ["32 new images and a missing city", "Nothing new: the step fails, later steps are skipped, `output` keeps the last good set", "Everything, including a blank city", "The workflow retries"],
          answer: 1,
          why: "The loop finishes every image, but the exit code fails the step. Steps after a failure are skipped by default, so the publish never runs. A broken generator can never ship half a profile.",
        },
        {
          t: "viz",
          name: "frames",
          props: {
            cols: ["Runner", "Network", "output branch"],
            frames: [
              { cells: [["cron 06:23 fires"], [], ["last run's SVGs", "data.json"]], note: "A fresh VM. dist/ is gitignored, so nothing from the last run is on disk." },
              { cells: [["previousData()"], ["GET output/data.json"], ["last run's SVGs", "data.json"]], note: "The last good data comes back over HTTP from the branch the last run published." },
              { cells: [["fetchAll()"], ["Codeforces", "LeetCode", "CodeChef 403", "GitHub x2"], ["last run's SVGs", "data.json"]], note: "Five sources in parallel. Say CodeChef fails: its old value is kept and `stale` records it." },
              { cells: [["render 17 x 2", "write dist/"], [], ["last run's SVGs", "data.json"]], note: "34 SVGs, a new data.json and preview.html, all on the runner's disk." },
              { cells: [["Summary step"], [], ["last run's SVGs", "data.json"]], note: "A table of values goes to the run summary, including which sources are stale." },
              { cells: [[], ["force-push dist/"], ["new SVGs", "new data.json"]], note: "One commit replaces the branch. The README's URLs now serve new bytes, within raw's 5-minute cache." },
            ],
          },
        },
        {
          t: "pitfall",
          h: "The action holding your write token is pinned to a tag",
          x: "The job has `contents: write` and hands `GITHUB_TOKEN` to `crazy-max/ghaction-github-pages@v3.1.0`. A tag can be moved by whoever controls that repo. GitHub and CI covers why: pin third-party actions that get a write token to a full commit SHA.",
        },
      ],
    },
    {
      title: "Drawing with SMIL",
      beats: [
        { t: "say", x: "Every generator is a pure function from data and a theme to a string. `kit.mjs` holds what they share: two colour themes, font stacks, an `esc` for text, an `svg()` wrapper with a `<title>` and `aria-label`, and a few animation primitives." },
        {
          t: "code",
          lang: "js",
          file: "scripts/svg/kit.mjs",
          src: "/** A path that draws itself in, then stays. */\nexport function drawIn(d, len, { stroke, width = 2, begin = 0, dur = 1.2, cap = \"round\", extra = \"\" }) {\n  return `<path d=\"${d}\" fill=\"none\" stroke=\"${stroke}\" stroke-width=\"${width}\" stroke-linecap=\"${cap}\"\n    stroke-linejoin=\"round\" stroke-dasharray=\"${f(len)}\" stroke-dashoffset=\"${f(len)}\" ${extra}>\n<animate attributeName=\"stroke-dashoffset\" from=\"${f(len)}\" to=\"0\" begin=\"${begin}s\" dur=\"${dur}s\"\n  fill=\"freeze\" calcMode=\"spline\" keyTimes=\"0;1\" keySplines=\"0.3 0 0.2 1\"/></path>`;\n}\n\n/** Fade something in at a time. */\nexport const fadeIn = (begin, dur = 0.5) =>\n  `<animate attributeName=\"opacity\" from=\"0\" to=\"1\" begin=\"${begin}s\" dur=\"${dur}s\" fill=\"freeze\"/>`;",
          mark: [4, 6],
          note: "Dash length = path length, offset by the full length: invisible. Animate the offset to 0 and the line draws itself. `fill=\"freeze\"` keeps the end state, so the path stays drawn.",
        },
        { t: "say", h: "Timing is computed at build time", x: "SMIL has no timeline object. So the scripts compute every `begin` in JavaScript: the hero's name strokes start 0.07 s apart, chips 0.18 s apart, the city rises week by week over 2.6 s. Choreography is arithmetic on strings." },
        {
          t: "code",
          lang: "js",
          file: "scripts/svg/hero.mjs",
          src: "/** A number that rolls up from zero: one <text> per frame, shown in turn. */\nfunction rollUp(x, y, value, fmt, opts, begin, dur = 1.4, frames = 24) {\n  let out = \"\";\n  for (let i = 1; i <= frames; i += 1) {\n    const k = 1 - Math.pow(1 - i / frames, 3);\n    const on = f(begin + (dur * (i - 1)) / frames, 3);\n    const off = f(begin + (dur * i) / frames, 3);\n    out += `<g visibility=\"hidden\"><set attributeName=\"visibility\" to=\"visible\" begin=\"${on}s\"/>` +\n      `${i < frames ? `<set attributeName=\"visibility\" to=\"hidden\" begin=\"${off}s\"/>` : \"\"}` +\n      `${text(x, y, fmt(Math.round(value * k)), opts)}</g>`;\n  }\n  return out;\n}",
          mark: [5, 8],
          note: "Lines rewrapped to fit. SMIL can't animate a text node's content, so the counter is 24 pre-rendered frames, each shown for one slot. Easing lives in `k`: ease-out cubic over the values, not the time.",
        },
        {
          t: "quiz",
          q: "The hero shows four rolling numbers. How many hidden `<g>` frames does the built hero-dark.svg contain?",
          options: ["4", "24", "96", "351"],
          answer: 2,
          why: "Four stats times 24 frames. A count of `<g visibility=\"hidden\">` in the offline build gives exactly 96. The price of a counter with no script is markup proportional to frames.",
        },
        {
          t: "code",
          lang: "js",
          file: "scripts/svg/cards.mjs",
          src: "const CYCLE = 7;\n\n/** Visible only during [a, b] of each cycle (fractions), with short fades. */\nconst during = (a, b, cycle = CYCLE) => {\n  const e = 0.03;\n  const k = [0, Math.max(0, a - e), a, b, Math.min(1, b + e), 1].map((v) => f(v, 3));\n  return `<animate attributeName=\"opacity\" values=\"0;0;1;1;0;0\" keyTimes=\"${k.join(\";\")}\"\n    dur=\"${cycle}s\" repeatCount=\"indefinite\"/>`;\n};",
          mark: [6],
          note: "Looping scenes are a different trick. Every element shares one 7 s duration and says *when* in fractions of it. Same `dur`, same start: they stay in sync forever.",
        },
        {
          t: "play",
          mode: "html",
          title: "kit primitives, rendered as an <img>",
          html: `<button id="go">Replay</button>
<div id="out"></div>`,
          css: `body { font: 14px system-ui; padding: 16px; background: #0d1117; color: #e6edf3; }
#out img { display: block; margin-top: 12px; max-width: 100%; }`,
          js: `const f = (n, d = 1) => Number(n.toFixed(d));
const fadeIn = (begin, dur = 0.5) =>
  \`<animate attributeName="opacity" from="0" to="1" begin="\${begin}s" dur="\${dur}s" fill="freeze"/>\`;
function drawIn(d, len, { stroke, width = 2, begin = 0, dur = 1.2 }) {
  return \`<path d="\${d}" fill="none" stroke="\${stroke}" stroke-width="\${width}" stroke-linecap="round"
    stroke-dasharray="\${f(len)}" stroke-dashoffset="\${f(len)}"><animate attributeName="stroke-dashoffset"
    from="\${f(len)}" to="0" begin="\${begin}s" dur="\${dur}s" fill="freeze" calcMode="spline"
    keyTimes="0;1" keySplines="0.3 0 0.2 1"/></path>\`;
}
function rollUp(x, y, value, begin, dur = 1.4, frames = 24) {
  let out = '';
  for (let i = 1; i <= frames; i++) {
    const k = 1 - Math.pow(1 - i / frames, 3);
    const on = f(begin + (dur * (i - 1)) / frames, 3), off = f(begin + (dur * i) / frames, 3);
    out += \`<g visibility="hidden"><set attributeName="visibility" to="visible" begin="\${on}s"/>\`
      + (i < frames ? \`<set attributeName="visibility" to="hidden" begin="\${off}s"/>\` : '')
      + \`<text x="\${x}" y="\${y}" font-family="system-ui" font-size="28" font-weight="800" fill="#e6edf3">\${Math.round(value * k)}</text></g>\`;
  }
  return out;
}

const trace = [[20, 90], [120, 90], [150, 60], [300, 60]];
const len = trace.slice(1).reduce((n, p, i) => n + Math.hypot(p[0] - trace[i][0], p[1] - trace[i][1]), 0);
const d = trace.map((p, i) => (i ? 'L' : 'M') + p[0] + ' ' + p[1]).join(' ');

const svg = \`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="120" viewBox="0 0 320 120">
<rect x="0.5" y="0.5" width="319" height="119" rx="12" fill="#111821" stroke="#26313d"/>
\${drawIn(d, len, { stroke: '#d49a3a', width: 3, begin: 0.2, dur: 0.9 })}
<g opacity="0">\${fadeIn(0.9)}<text x="20" y="28" font-family="ui-monospace,monospace" font-size="11" fill="#39d0c0">CODEFORCES</text></g>
\${rollUp(20, 58, 1604, 1.0)}
<circle r="4" fill="#39d0c0"><animateMotion path="\${d}" dur="1.8s" begin="1.4s" repeatCount="indefinite"/></circle>
</svg>\`;

function show() {
  const img = new Image();          // a new element restarts the SMIL clock
  img.src = 'data:image/svg+xml,' + encodeURIComponent(svg);
  document.getElementById('out').replaceChildren(img);
}
document.getElementById('go').onclick = show;
show();`,
          task: "Stagger it: make the label fade at 0.2 s and the trace draw after it. Then change the rollUp easing `k` to linear and feel the difference at the end.",
        },
        {
          t: "code",
          lang: "js",
          file: "scripts/svg/city.mjs",
          src: "// Roof light as the train goes by.\nconst k = (c.w + 0.5 - trainFrom - NOSE) / (trainTo - trainFrom);\nif (k > 0.001 && k < 0.95) {\n  const k2 = f(k, 3);\n  const k3 = f(Math.min(0.99, k + 0.06), 3);\n  g += `<polygon points=\"${top}\" fill=\"${P.night ? \"#b8ffcf\" : \"#ffffff\"}\" opacity=\"0\">` +\n    `<animate attributeName=\"opacity\" values=\"0;0;0.85;0;0\"` +\n    ` keyTimes=\"0;${k2};${f(k + 0.004, 3)};${k3};1\" dur=\"${CYCLE}s\"` +\n    ` begin=\"${f(trainBegin, 2)}s\" repeatCount=\"indefinite\"/></polygon>`;\n}",
          mark: [2, 8],
          note: "The train moves linearly over `CYCLE` seconds. Each roof computes the fraction of the cycle when the nose reaches its week, and flashes then. Two animations, never linked, synchronised by maths.",
        },
        {
          t: "compare",
          a: { label: "one SVG, theme by media query", lang: "html", src: "<img src=\"card.svg\">\n<!-- inside: <style>@media (prefers-color-scheme: dark)\n     { ... }</style> -->" },
          b: { label: "what kit.mjs does", lang: "html", src: "<picture>\n  <source media=\"(prefers-color-scheme: dark)\" srcset=\"card-dark.svg\">\n  <source media=\"(prefers-color-scheme: light)\" srcset=\"card-light.svg\">\n  <img src=\"card-dark.svg\">\n</picture>" },
          x: "kit.mjs draws everything twice from a `THEMES` object, and the README picks with `<picture>`, which GitHub documents for theme-specific images. The city goes further: night with stars and lit windows, day with a sun.",
        },
        {
          t: "pitfall",
          h: "One raw & and the whole image is gone",
          x: "SVG is XML: an unescaped `&` or `<` is a parse error, and the browser shows a broken image, not a typo. The tagline is \"Systems & Backend Engineer\". Every string goes through `kit.esc`, and the built hero holds `Systems &amp; Backend`.",
        },
      ],
    },
    {
      title: "What keeps it up, what could break it",
      beats: [
        {
          t: "code",
          lang: "js",
          file: "scripts/build.mjs",
          src: "async function previousData(cfg) {\n  try {\n    return JSON.parse(await readFile(path.join(dist, \"data.json\"), \"utf8\"));\n  } catch {}\n  try {\n    const res = await fetch(`https://raw.githubusercontent.com/${cfg.github}/${cfg.github}/output/data.json`,\n      { signal: AbortSignal.timeout(15000) });\n    if (res.ok) return await res.json();\n  } catch {}\n  // First run ever, or the output branch is gone: start from the committed seed.\n  try {\n    return JSON.parse(await readFile(path.join(root, \"scripts\", \"seed.json\"), \"utf8\"));\n  } catch {}\n  return {};\n}",
          mark: [6, 12],
          note: "The runner is stateless, so state lives on the `output` branch: each run publishes the data.json the next run reads. The seed covers the first run and a deleted branch.",
        },
        {
          t: "quiz",
          q: "`city.mjs` uses `rng(1041)`, a seeded PRNG, for its stars and window timings. Why not `Math.random()`?",
          options: ["Math.random is unavailable in Node", "Same data gives the same bytes: two offline builds produce an identical city-dark.svg", "It's faster", "SVG can't hold random numbers"],
          answer: 1,
          why: "Deterministic output means a diff of two builds shows only real data changes, and a bug reproduces. Two offline builds of a copy hashed identically for city-dark.svg and card-valence-dark.svg.",
        },
        {
          t: "pitfall",
          h: "Scheduled workflows switch themselves off",
          x: "GitHub's docs: in a public repo, scheduled workflows are disabled after 60 days with no repository activity. A profile you stop touching freezes on its last numbers, with no error anywhere. Check the Actions tab now and then; `workflow_dispatch` gives you the button.",
        },
        {
          t: "pitfall",
          h: "Unauthenticated means someone else's quota",
          x: "`activity()` calls the GitHub REST API with no token. That's 60 requests an hour per originating IP. One call per run is far below that, but on a hosted runner you don't choose the IP. When it fails, the fallback keeps last run's pushes.",
        },
        {
          t: "pitfall",
          h: "Size is paid in every visitor's browser",
          x: "The dark city is about 300 KB with 814 animation elements; the hero about 89 KB with 351. Every one is work for the viewer's browser. Measure the built file, not the generator: a loop of 365 days times a few elements each adds up fast.",
        },
        {
          t: "table",
          head: ["Failure", "What the code does"],
          rows: [
            ["One source down or blocked", "Keeps its last value, adds it to `stale`, summary shows it"],
            ["A site redesign", "Scrapers throw on empty results instead of drawing zeros"],
            ["No previous data", "`output/data.json`, then `seed.json`, then `{}`"],
            ["A generator throws", "Others still render; failing exit code blocks publishing"],
            ["No contributions data", "`city` returns null and that image is skipped"],
            ["A run hangs", "`timeout-minutes: 5`; a newer run cancels the older one"],
          ],
        },
      ],
    },
    {
      title: "Rebuild: your own card generator",
      beats: [
        { t: "say", x: "The whole idea fits in one function: data and a theme in, an SVG string out, motion as SMIL with build-time `begin` values. Build it, print it, then render it as an `<img>` the way GitHub will." },
        {
          t: "rebuild",
          h: "A themed, animated stat card",
          x: "`card(data, theme)` returns an SVG string: a panel, a title, a bar per stat that grows in with a staggered `begin`, and the value fading in after it. It prints the dark card and its size. Extend it before previewing.",
          mode: "js",
          js: `const THEMES = {
  dark: { name: 'dark', panel: '#111821', border: '#26313d', text: '#e6edf3', dim: '#65717d', bar: '#d49a3a', track: '#18212b' },
  light: { name: 'light', panel: '#f6f8fa', border: '#d0d7de', text: '#1f2328', dim: '#8c959f', bar: '#a8691a', track: '#eaeef2' },
};
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fadeIn = (begin, dur = 0.4) =>
  \`<animate attributeName="opacity" from="0" to="1" begin="\${begin}s" dur="\${dur}s" fill="freeze"/>\`;

function card(data, t) {
  const W = 360, row = 34, top = 56;
  const H = top + data.stats.length * row + 12;
  const max = Math.max(...data.stats.map((s) => s.value));
  let b = \`<text x="20" y="34" font-family="system-ui" font-size="17" font-weight="700" fill="\${t.text}">\${esc(data.title)}</text>\`;
  data.stats.forEach((s, i) => {
    const y = top + i * row, w = (s.value / max) * 200, begin = 0.2 + i * 0.15;
    b += \`<text x="20" y="\${y + 14}" font-family="ui-monospace,monospace" font-size="12" fill="\${t.dim}">\${esc(s.label)}</text>\`;
    b += \`<rect x="110" y="\${y + 2}" width="200" height="14" rx="3" fill="\${t.track}"/>\`;
    b += \`<rect x="110" y="\${y + 2}" width="0" height="14" rx="3" fill="\${t.bar}">\`
      + \`<animate attributeName="width" from="0" to="\${w.toFixed(1)}" begin="\${begin}s" dur="0.6s" fill="freeze"\`
      + \` calcMode="spline" keyTimes="0;1" keySplines="0.2 0.8 0.2 1"/></rect>\`;
    b += \`<g opacity="0">\${fadeIn(begin + 0.5)}<text x="318" y="\${y + 14}" font-family="system-ui" font-size="12" font-weight="700" fill="\${t.text}">\${s.value}</text></g>\`;
  });
  return \`<svg xmlns="http://www.w3.org/2000/svg" width="\${W}" height="\${H}" viewBox="0 0 \${W} \${H}" role="img" aria-label="\${esc(data.title)}">
<title>\${esc(data.title)}</title>
<rect x="0.5" y="0.5" width="\${W - 1}" height="\${H - 1}" rx="12" fill="\${t.panel}" stroke="\${t.border}"/>
\${b}
</svg>\`;
}

const data = { title: 'Solved this year: Easy & Hard', stats: [
  { label: 'easy', value: 212 }, { label: 'medium', value: 340 }, { label: 'hard', value: 61 },
] };
const out = card(data, THEMES.dark);
console.log(out);
console.log(out.length, 'bytes;', (out.match(/<animate/g) || []).length, 'animations');`,
          task: "Add a `stale` flag to `data` that draws a small \"stale\" label. Then loop over `THEMES` and log both files' names and sizes, the way build.mjs writes `name-theme.svg`.",
        },
        {
          t: "play",
          mode: "html",
          title: "preview it as GitHub would",
          html: `<button id="theme">Show light</button>
<div id="out"></div>`,
          css: `body { font: 14px system-ui; padding: 16px; background: #0d1117; color: #e6edf3; }
body.light { background: #fff; color: #1f2328; }
#out img { display: block; margin-top: 12px; max-width: 100%; }`,
          js: `const THEMES = {
  dark: { panel: '#111821', border: '#26313d', text: '#e6edf3', dim: '#65717d', bar: '#d49a3a', track: '#18212b' },
  light: { panel: '#f6f8fa', border: '#d0d7de', text: '#1f2328', dim: '#8c959f', bar: '#a8691a', track: '#eaeef2' },
};
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function card(data, t) {
  const W = 360, row = 34, top = 56, H = top + data.stats.length * row + 12;
  const max = Math.max(...data.stats.map((s) => s.value));
  let b = \`<text x="20" y="34" font-family="system-ui" font-size="17" font-weight="700" fill="\${t.text}">\${esc(data.title)}</text>\`;
  data.stats.forEach((s, i) => {
    const y = top + i * row, w = (s.value / max) * 200, begin = 0.2 + i * 0.15;
    b += \`<text x="20" y="\${y + 14}" font-family="ui-monospace,monospace" font-size="12" fill="\${t.dim}">\${esc(s.label)}</text>
<rect x="110" y="\${y + 2}" width="200" height="14" rx="3" fill="\${t.track}"/>
<rect x="110" y="\${y + 2}" width="0" height="14" rx="3" fill="\${t.bar}"><animate attributeName="width" from="0" to="\${w.toFixed(1)}" begin="\${begin}s" dur="0.6s" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines="0.2 0.8 0.2 1"/></rect>
<g opacity="0"><animate attributeName="opacity" from="0" to="1" begin="\${begin + 0.5}s" dur="0.4s" fill="freeze"/><text x="318" y="\${y + 14}" font-family="system-ui" font-size="12" font-weight="700" fill="\${t.text}">\${s.value}</text></g>\`;
  });
  return \`<svg xmlns="http://www.w3.org/2000/svg" width="\${W}" height="\${H}" viewBox="0 0 \${W} \${H}">
<rect x="0.5" y="0.5" width="\${W - 1}" height="\${H - 1}" rx="12" fill="\${t.panel}" stroke="\${t.border}"/>\${b}</svg>\`;
}
const data = { title: 'Solved this year: Easy & Hard', stats: [
  { label: 'easy', value: 212 }, { label: 'medium', value: 340 }, { label: 'hard', value: 61 }] };

let theme = 'dark';
function show() {
  const img = new Image();
  img.alt = data.title;
  img.src = 'data:image/svg+xml,' + encodeURIComponent(card(data, THEMES[theme]));
  document.getElementById('out').replaceChildren(img);
}
document.getElementById('theme').onclick = (e) => {
  theme = theme === 'dark' ? 'light' : 'dark';
  document.body.classList.toggle('light', theme === 'light');
  e.target.textContent = 'Show ' + (theme === 'dark' ? 'light' : 'dark');
  show();
};
show();`,
          task: "Remove `esc` from the title and reload: the `&` breaks the XML and the image is gone. Put it back. Paste your rebuild's output into `card` here to preview your version.",
        },
        {
          t: "mission",
          h: "Your own auto-updating profile card",
          x: "In your `<user>/<user>` repo: a `.mjs` script fetches one public number (repos, followers, a rating), draws a dark and a light animated card, and writes `dist/`. A scheduled workflow publishes `dist/` to an `output` branch. The README uses `<picture>` to show it.",
          hint: "Copy the shape: per-source try/catch with a last-good fallback from `output/data.json`, `contents: write`, a cron off the hour, `workflow_dispatch`, and a failing exit code when a render throws.",
          solution: {
            lang: "yaml",
            src: "name: card\non:\n  schedule:\n    - cron: \"17 */6 * * *\"\n  workflow_dispatch:\nconcurrency:\n  group: card\n  cancel-in-progress: true\njobs:\n  build:\n    runs-on: ubuntu-latest\n    timeout-minutes: 5\n    permissions:\n      contents: write\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with:\n          node-version: 22\n      - run: node scripts/build.mjs\n      - name: publish dist/ to output\n        run: |\n          cd dist\n          git init -q -b output\n          git add -A\n          git -c user.name=bot -c user.email=bot@users.noreply.github.com commit -qm \"Rebuild card\"\n          git push -f \"https://x-access-token:${{ github.token }}@github.com/${{ github.repository }}\" output",
          },
        },
      ],
    },
  ],
  nobodyTells: [
    "A README is a layout, not a program. Point it at stable URLs and change the bytes behind them; the README itself rarely needs a commit.",
    "A stateless CI runner can still remember: publish last run's data next to the output, and read it back over HTTP at the start of the next run.",
    "Turn every failure into data. A `stale` list in the output beats a red build that leaves the profile frozen with no explanation.",
    "SMIL can't change text, but it can switch visibility: a counter is N pre-drawn frames shown in turn.",
    "For looping scenes, give everything one shared `dur` and express timing as keyTimes fractions. They can never drift apart.",
    "Seed every random number in a generator. Byte-identical output for identical data makes diffs and bugs readable.",
    "raw.githubusercontent.com serves with `max-age=300`. A fresh build can take five minutes to show; don't debug that.",
    "Zero dependencies means no lockfile, no Dependabot noise and no `npm ci` in CI. Node 22 has fetch built in.",
  ],
  glossary: [
    [".mjs", "A file Node always treats as an ES module, whatever any package.json says. `.cjs` is always CommonJS."],
    ["\"type\": \"module\"", "package.json field making `.js` files in that package ES modules; without it Node assumes CommonJS."],
    ["import.meta.url", "The current module's file URL. ESM's replacement for `__dirname`, via `fileURLToPath`."],
    ["SMIL", "SVG's declarative animation elements (`<animate>`, `<set>`, `<animateMotion>`). They run inside `<img>`."],
    ["fill=\"freeze\"", "SMIL attribute that holds an animation's final value after it ends instead of snapping back."],
    ["keyTimes", "Fractions of `dur` at which each value in `values` is reached. Shared `dur` plus keyTimes = a timeline."],
    ["stroke-dashoffset", "Shifts a dash pattern along a path. Animate it from the path length to 0 and the line draws itself."],
    ["<picture>", "HTML element choosing a source by media query; GitHub uses it for dark and light README images."],
    ["Camo", "GitHub's image proxy: images from other hosts get anonymous URLs so viewers aren't tracked."],
    ["HTML sanitiser", "The step that strips scripts, inline styles, classes and ids from rendered Markdown on GitHub."],
    ["schedule", "Actions trigger from cron in UTC; runs on the default branch, can be delayed, min interval 5 minutes."],
    ["orphan branch", "A branch with no shared history, like `output` here: force-pushed, always one commit."],
  ],
  explain: "Explain to a friend why a GitHub profile can't animate with JavaScript, and how a scheduled Node script plus SMIL inside an SVG gets a live, animated card onto it anyway.",
};
