# How a chapter is written

Every chapter is one ES module in `chapters/`, exporting a plain object. The
site renders it one **beat** at a time: the reader sees a beat, presses
Space (or taps Continue), and the next beat appears. Nothing is ever a wall
of text. `node tests/validate.mjs` checks every rule below.

## The reader

Codeforces Expert, LeetCode Guardian, CodeChef 5 star. Algorithms are not the
bottleneck; never explain a loop, a hash map or recursion. The gap is how the
platform really behaves, systems, and craft. Treat rendering, layout, diffing
and networking like CP problems: what is n, what does it cost per frame,
where does the O(n^2) hide. Show the measurement or the mechanism, never
folklore.

## The 500-hours rule

A tip goes in only if you'd otherwise learn it after hundreds of hours of
shipping. Leave out anything one search answers, anything nobody uses, and
trivia. Put in things that are true but rarely written down, bugs that cost
real time, and the habits that separate someone who builds from someone who
follows tutorials. Every chapter has `pitfall` beats of this kind and ends
with a `nobodyTells` list.

## Voice

- Casual, direct, confident. Like a senior engineer talking to a sharp junior.
- Short. A `say` beat is 1 to 3 sentences, **at most 260 characters**.
- Show, then name. Code or a picture first, the term after.
- No filler: no "In this chapter we will", no "Let's dive in", no "It's
  important to note", no rhetorical questions as openers, no emoji, no
  exclamation marks, no "·" separators.
- Never invent facts about our own projects (Valence, RailFlow, the
  portfolio, the GitHub profile). Only the case-study chapters talk about
  them, with real code.

## Shape

```js
export default {
  id: "css-layout",            // kebab-case, unique, matches the file name after the number
  n: 6,                        // chapter number
  part: "B",                   // A..I, see chapters/index.js
  title: "CSS II: layout",
  hook: "One sentence, under 120 chars, that makes you want to read it.",
  minutes: 45,                 // honest reading + doing time
  levels: ["use", "understand", "rebuild"],   // which of the three depths it reaches
  sections: [
    { title: "Short section title", beats: [ /* beats */ ] },
  ],
  nobodyTells: ["Up to 8 hard-won one-liners, each under 200 chars."],
  glossary: [["term", "What it does, one line, under 140 chars."]],
  explain: "The prompt shown at the end: explain X in your own words, as if to a friend.",
};
```

Aim for 5 to 9 sections and 30 to 60 beats per chapter. A section is 3 to 10
beats. Never more than 2 `say` beats in a row: break them with code, a
playground, a prediction, a quiz, a visual or a table.

## Beats

Inline text in `x`, `h`, `q`, `why`, options, table cells and list items
supports a tiny markup: `` `code` ``, `**bold**`, `*italic*`, and
`[text](https://link)`.

| `t` | Fields | Use it for |
|---|---|---|
| `say` | `x` (<= 260 chars), optional `h` heading (<= 60) | One idea. |
| `code` | `lang`, `src`, optional `file`, `note` (<= 200), `mark` (1-based line numbers to highlight) | Code to read. Keep under 30 lines. |
| `play` | `mode`, files, optional `title`, `task` (<= 200) | Code to run and change. See modes below. |
| `predict` | `lang`, `src`, `q`, `options` (2-5), `answer` (index), `why` (<= 260) | "What does this print / do?" The best teacher there is. Use often. |
| `quiz` | `q`, `options` (2-5), `answer` (index), `why` (<= 260) | Check understanding. `why` explains the right answer and the trap. |
| `pitfall` | `h` (<= 60), `x` (<= 300) | A 500-hours lesson. |
| `compare` | `a: {label, lang, src}`, `b: {label, lang, src}`, `x` (<= 220) | Bad vs good, before vs after. |
| `table` | `head: [..]`, `rows: [[..]]`, optional `caption` | Crisp comparisons. Max 8 rows, 4 columns, cells <= 90 chars. |
| `steps` | `items: [..]` (2-8, each <= 160), optional `h` | A sequence: a handshake, a pipeline, an algorithm. |
| `viz` | `name`, `props` | A built-in interactive visual, see below. |
| `mission` | `h` (<= 60), `x` (<= 300), `hint` (<= 200), optional `solution` {lang, src} | Something to build. At least one per chapter. |
| `rebuild` | `h`, `x` (<= 300), `mode`, files, `task` | "Build a mini version of X": a playground with starter code. For `levels` including "rebuild". |

### Playground modes (`play` and `rebuild`)

| `mode` | Files | What runs |
|---|---|---|
| `html` | `html`, `css`, `js` (any may be empty) | A page in a sandboxed iframe. |
| `js` | `js` | Plain script; `console.log` output shows under it. No DOM needed. |
| `react` | `js` (JSX allowed, must define `App`), optional `css` | React 18 + Babel in the iframe; `App` is rendered into `#root`. |
| `three` | `js` (module code, `import * as THREE from "three"` works), optional `css` | A full-size canvas page with three.js r160. |
| `glsl` | `glsl` | A fragment shader on a full canvas. Uniforms: `uTime` (s), `uRes` (px), `uMouse` (0-1). Output `gl_FragColor`. |
| `node` | `js` | Server code, shown read-only with a "run this locally" note. Use for Express, fs, sockets. |

Keep playground code small (< 60 lines) and make it work on first run.

### Visuals (`viz`)

| `name` | `props` | Shows |
|---|---|---|
| `frames` | `cols: ["Call stack", "Microtasks", ...]`, `frames: [{ cells: [[..], [..]], note: "<= 160" }]` | A step-through of any process as columns of stacked chips. Event loop, git objects, React fibers, a TCP handshake, a request through middleware. 4 to 14 frames. |
| `boxmodel` | none | Drag margin, border, padding, content sizes; see the box and the computed size. |
| `flex` | optional `items` (count) | A flexbox lab with every container property as a control. |
| `grid` | optional `template` string | A grid lab: edit `grid-template-*`, see the tracks. |
| `specificity` | optional `selectors: [..]` | Type selectors, see their (a,b,c) scores and which wins. |
| `easing` | optional `curve: [x1,y1,x2,y2]` | A cubic-bezier editor with a live preview and the CSS to copy, plus a spring mode. |
| `damping` | none | `x += (t - x) * k` vs `1 - exp(-k dt)` at 30/60/144 fps, side by side. |
| `framebudget` | none | Slide work per frame; watch dropped frames and the 16.7 ms line. |
| `waterfall` | none | A page load timeline: DNS, TCP, TLS, TTFB, download; toggle HTTP/1.1 vs 2 vs 3, CDN, keep-alive. |
| `gitgraph` | optional `setup: ["commit", "branch feat", ...]` | Type git commands (commit, branch, checkout/switch, merge, rebase, reset, revert, tag), watch the graph. |
| `reconcile` | optional `before`, `after` (arrays of keys) | Keyed vs unkeyed list diffing, the DOM operations each costs. |
| `contrast` | optional `fg`, `bg` | WCAG contrast ratio with AA/AAA pass marks. |
| `typescale` | optional `base`, `ratio` | A modular type scale, previewed. |

## Examples of good beats

```js
{ t: "say", x: "The browser doesn't draw your page. It draws **layers**, and the GPU stacks them. Most of performance is choosing what gets its own layer." },
{ t: "predict", lang: "js", src: "console.log(1);\nsetTimeout(() => console.log(2));\nPromise.resolve().then(() => console.log(3));\nconsole.log(4);",
  q: "What order?", options: ["1 2 3 4", "1 4 3 2", "1 4 2 3", "1 3 4 2"], answer: 1,
  why: "Sync code first (1, 4). Then **all** microtasks (3). Only then the next task (2). A promise callback always beats a timer queued earlier." },
{ t: "pitfall", h: "`transition: all` is a performance bug",
  x: "It animates properties you didn't mean to, including ones that trigger layout. Name the properties: `transition: transform .2s, opacity .2s`." },
```

Bad: "CSS stands for Cascading Style Sheets and is used to style web pages." (a search answers it; it teaches nothing.)
