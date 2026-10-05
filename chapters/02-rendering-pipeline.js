const raw = String.raw;

const THRASH_JS = raw`const list = document.getElementById('list');
list.innerHTML = '<div class="row">row</div>'.repeat(500);
const rows = [...list.children];

function thrash() {
  for (const r of rows) {
    const h = r.offsetHeight;        // read: forces layout if anything is dirty
    r.style.height = h + 1 + 'px';   // write: makes it dirty again
  }
}
function batched() {
  const hs = rows.map((r) => r.offsetHeight);                   // all reads
  rows.forEach((r, i) => (r.style.height = hs[i] + 1 + 'px'));  // all writes
}
function time(label, fn) {
  rows.forEach((r) => (r.style.height = ''));
  list.offsetHeight;                 // start from a clean layout
  const t0 = performance.now();
  fn();
  list.offsetHeight;                 // count the final layout too
  console.log(label.padEnd(8), (performance.now() - t0).toFixed(1), 'ms');
}
time('thrash', thrash);
time('batched', batched);`;

const VAR_JS = raw`const stage = document.getElementById('stage');
stage.innerHTML = '<i></i>'.repeat(5000);
const probe = stage.lastElementChild;

function time(label, write) {
  let total = 0;
  for (let i = 1; i <= 30; i++) {
    write(i);
    const t0 = performance.now();
    getComputedStyle(probe).color;   // force the style recalc now
    total += performance.now() - t0;
  }
  console.log(label.padEnd(34), (total / 30).toFixed(2), 'ms per change');
}

const root = document.documentElement.style;
time('--x on :root (inherited)', (i) => root.setProperty('--x', i + 'px'));
time('--x on #stage (inherited)', (i) => stage.style.setProperty('--x', i + 'px'));
time('--y on #stage (inherits: false)', (i) => stage.style.setProperty('--y', i + 'px'));`;

const CV_JS = raw`const para = '<p>' + 'The quick brown fox jumps over the lazy dog. '.repeat(30) + '</p>';
const page = ('<section><h2>Section</h2>' + para + para + '</section>').repeat(1000);
const main = document.getElementById('main');

function render(label, cv) {
  main.style.setProperty('--cv', cv);
  const t0 = performance.now();
  main.innerHTML = page;
  main.offsetHeight;                 // force style + layout of the new content
  console.log(label.padEnd(26), (performance.now() - t0).toFixed(0), 'ms');
}
render('visible', 'visible');
render('content-visibility: auto', 'auto');
render('visible, again', 'visible');
render('auto, again', 'auto');`;

const ENGINE_JS = raw`// 1. DOM: a tree, as if the parser had built it
const dom = { tag: 'body', kids: [
  { tag: 'div', cls: 'card', kids: [
    { tag: 'h1', text: 'Rendering' },
    { tag: 'p', text: 'Style, then layout, then paint, then raster. Each stage feeds the next one.' },
  ] },
  { tag: 'div', cls: 'card warn', kids: [{ tag: 'p', text: 'Change a rule and run it again.' }] },
] };

// 2. CSS: later rules win; color and size inherit
const css = [
  ['body', { color: '#222', size: 14, pad: 8 }],
  ['.card', { bg: '#f3e6d4', pad: 10, margin: 8 }],
  ['.warn', { bg: '#f8c9b8' }],
  ['h1', { size: 22 }],
];
function style(node, parent = {}) {
  const s = { color: parent.color, size: parent.size };
  const cls = (node.cls || '').split(' ');
  for (const [sel, decl] of css)
    if (sel === node.tag || (sel[0] === '.' && cls.includes(sel.slice(1)))) Object.assign(s, decl);
  return { node, s, kids: (node.kids || []).map((k) => style(k, s)) };
}

// 3. Layout: block boxes stack down the page; text wraps by an average glyph width
function layout(box, x, y, w) {
  const m = box.s.margin || 0, p = box.s.pad || 0;
  Object.assign(box, { x: x + m, y: y + m, w: w - 2 * m });
  let cy = box.y + p;
  if (box.node.text) {
    const per = Math.floor((box.w - 2 * p) / (box.s.size * 0.55));
    box.lines = box.node.text.match(new RegExp('.{1,' + per + '}(\\s|$)', 'g'));
    cy += box.lines.length * box.s.size * 1.4;
  }
  for (const k of box.kids) cy = layout(k, box.x + p, cy, box.w - 2 * p);
  box.h = cy + p - box.y;
  return box.y + box.h + m;
}

// 4. Paint: a display list, in paint order. No pixels yet.
function paint(box, list = []) {
  const { s } = box, p = s.pad || 0;
  if (s.bg) list.push(['rect', box.x, box.y, box.w, box.h, s.bg]);
  (box.lines || []).forEach((l, i) =>
    list.push(['text', box.x + p, box.y + p + (i + 1) * s.size * 1.4 - s.size * 0.35, s.size, s.color, l.trim()]));
  box.kids.forEach((k) => paint(k, list));
  return list;
}

// 5. Raster: play the display list into pixels
function raster(list, ctx) {
  for (const [op, x, y, a, b, c] of list) {
    ctx.fillStyle = op === 'rect' ? c : b;
    if (op === 'rect') ctx.fillRect(x, y, a, b);
    else { ctx.font = a + 'px system-ui'; ctx.fillText(c, x, y); }
  }
}

const cv = document.querySelector('canvas');
const tree = style(dom);
layout(tree, 0, 0, cv.width);
const list = paint(tree);
raster(list, cv.getContext('2d'));
list.forEach((d) => console.log(d.map((v) => (typeof v === 'number' ? Math.round(v) : v)).join(' | ')));`;

export default {
  id: "rendering-pipeline",
  n: 2,
  part: "A",
  title: "The rendering pipeline",
  hook: "Every change you make re-enters a five-stage pipeline. Know which stage it enters and you know what it costs.",
  minutes: 75,
  levels: ["use", "understand", "rebuild"],
  sections: [
    {
      title: "Five stages, one frame",
      beats: [
        { t: "say", x: "The browser turns your page into pixels in stages: **parse** bytes into a DOM, **style** every element, **lay out** boxes, **paint** a list of draw commands, **composite** layers on the GPU. A change pays for its own stage and every stage after it." },
        {
          t: "steps",
          h: "After parsing, as Chromium names the stages",
          items: [
            "**Style**: match CSS against dirty elements, produce computed styles.",
            "**Layout**: turn computed styles into sizes and positions, an immutable tree of fragments.",
            "**Pre-paint**: build the property trees (transform, clip, effect, scroll) and mark what must repaint.",
            "**Paint**: record draw commands into a display list. No pixels yet.",
            "**Layerize** and **commit**: split the display list into layers, hand it all to the compositor thread.",
            "**Raster**: turn display lists into GPU texture tiles, on raster threads and the GPU.",
            "**Draw**: the compositor places tiles using the property trees; the GPU process puts the frame on screen.",
          ],
        },
        { t: "say", x: "The trick that makes it fast: **transform**, **opacity** and **scroll offset** live in property trees, not in the pixels. The compositor can change them and draw a new frame without the main thread running style, layout or paint." },
        {
          t: "predict",
          lang: "css",
          src: ".a { transition: box-shadow .3s; }  .a:hover { box-shadow: 0 8px 24px #0004; }\n.b { transition: width .3s; }       .b:hover { width: 320px; }\n.c { transition: transform .3s; }   .c:hover { transform: scale(1.05); }",
          q: "While each transition runs, what does every frame cost the main thread?",
          options: ["a: style + paint. b: style + layout + paint. c: nothing", "All three: style + layout + paint", "a: nothing. b: layout. c: paint", "a and c: paint. b: layout + paint"],
          answer: 0,
          why: "A shadow changes pixels, not geometry: repaint. Width moves boxes: layout, then paint. A running transform transition gets its own layer and ticks on the compositor thread, reusing pixels already rastered.",
        },
        {
          t: "table",
          caption: "A change enters at its stage and pays for everything below it.",
          head: ["Stage", "Re-runs when you change", "DevTools event"],
          rows: [
            ["Style", "classes, attributes, inline styles, inserted nodes, `:hover`", "Recalculate Style"],
            ["Layout", "sizes, positions, text, fonts loading, viewport width", "Layout"],
            ["Pre-paint", "transforms, opacity, clips, anything that must repaint", "Pre-paint"],
            ["Paint", "colours, shadows, borders, backgrounds, text", "Paint"],
            ["Layerize, commit", "which elements get their own layer", "Layerize, Commit"],
            ["Raster", "repainted areas, scale changes, tiles scrolled into view", "the Raster tracks"],
          ],
        },
      ],
    },
    {
      title: "Parse: the tree arrives in pieces",
      beats: [
        { t: "say", x: "The HTML parser streams: it builds the DOM as bytes arrive, so the top of a page can paint before the bottom downloads. A classic `<script>` with no `async` or `defer` stops it: the parser waits for it to download and run, and the script may wait too." },
        {
          t: "predict",
          lang: "html",
          src: "<head>\n  <link rel=\"stylesheet\" href=\"/app.css\">  <!-- arrives after 2 s -->\n  <script>\n    console.log('inline script ran');\n  </script>\n</head>\n<body>\n  <h1>Hello</h1>",
          q: "When does the inline script run?",
          options: ["As soon as the parser reaches it", "After app.css arrives, about 2 s in", "After the `<h1>` is parsed", "At DOMContentLoaded"],
          answer: 1,
          why: "A script might read computed style, so a parser-blocking script waits for pending stylesheets, and the parser waits for the script. One tiny inline script after a slow stylesheet stalls the whole document.",
        },
        { t: "say", h: "The preload scanner", x: "While the parser is stuck, a second, dumber scanner races ahead through the raw HTML and starts fetching every `src` and `href` it sees. It doesn't run JS or apply CSS, so anything those would request, it can't find." },
        {
          t: "compare",
          a: { label: "invisible to the scanner", lang: "html", src: "<div class=\"hero\" data-src=\"/hero.avif\"></div>\n<script src=\"/lazy.js\" defer></script>\n<!-- lazy.js swaps data-src into an <img> -->" },
          b: { label: "found in the first bytes", lang: "html", src: "<img src=\"/hero.avif\" alt=\"\"\n     width=\"1200\" height=\"600\"\n     fetchpriority=\"high\">" },
          x: "Left: the hero waits for a script to download, parse and run before its fetch even starts. Right: the preload scanner requests it while the head is still parsing.",
        },
        {
          t: "pitfall",
          h: "`loading=\"lazy\"` on the hero image",
          x: "A lazy image can't be fetched until layout knows how far it is from the viewport, so it throws away the preload scanner's head start. Your largest image now loads after style and layout. Lazy-load what is below the fold, never the LCP image.",
        },
        {
          t: "quiz",
          q: "Which of these delays the first paint by default?",
          options: ["`<link rel=\"stylesheet\" href=\"app.css\">` in the head", "`<script type=\"module\" src=\"app.js\">`", "`<img src=\"hero.jpg\">`", "`<link rel=\"stylesheet\" href=\"print.css\" media=\"print\">`"],
          answer: 0,
          why: "Stylesheets block rendering so you never see unstyled content. A non-matching `media` still downloads but doesn't block. Modules are deferred, and images never block a paint.",
        },
      ],
    },
    {
      title: "Style: every element, every rule",
      beats: [
        { t: "say", x: "Style resolves every property for every element that might have changed: match selectors, cascade, inherit. The cost is roughly elements restyled times rules checked, and the first number is the one you control." },
        { t: "say", x: "Browsers don't restyle the world on each change. They keep **invalidation sets**: toggling `.open` restyles only elements whose selectors mention `.open`, plus whole subtrees when it's used as an ancestor, as in `.open .item`." },
        {
          t: "predict",
          lang: "js",
          src: "const box = document.createElement('div');\nbox.style.transition = 'opacity 1s';\nbox.style.opacity = '0';\ndocument.body.append(box);\nbox.style.opacity = '1';",
          q: "Does the box fade in?",
          options: ["Yes, over 1 s", "No, it appears at full opacity at once", "It stays invisible", "Only in Firefox"],
          answer: 1,
          why: "A transition needs a computed *before* value. Style never ran while opacity was 0, so there's no change to animate. Forcing style in between (`getComputedStyle(box).opacity`) fixes it; `@starting-style` fixes it properly.",
        },
        {
          t: "code",
          lang: "css",
          src: ".toast {\n  opacity: 1;\n  translate: 0 0;\n  transition: opacity .3s, translate .3s;\n}\n\n@starting-style {\n  .toast { opacity: 0; translate: 0 12px; }\n}",
          mark: [7, 8, 9],
          note: "`@starting-style` gives a freshly inserted element a before-value to transition from, with no forced style read in your JS. Baseline since 2024.",
        },
        {
          t: "pitfall",
          h: "A CSS variable on `:root` restyles the page",
          x: "`document.documentElement.style.setProperty('--x', e.clientX)` in a pointermove handler hands every element a new inherited value, so every frame restyles the whole document. Set it on the element that uses it, or register it with `@property` and `inherits: false`.",
        },
        {
          t: "play",
          mode: "html",
          title: "who pays for one variable",
          html: "<div id=\"stage\"></div>",
          css: "@property --y { syntax: '<length>'; inherits: false; initial-value: 0px; }\ni { display: inline-block; width: 4px; height: 4px; margin: 1px; background: #d49a3a; }",
          js: VAR_JS,
          task: "Rows 1 and 2 both restyle all 5000 dots: an inherited variable reaches the whole subtree wherever you set it. Make it 20000 dots and watch row 3 barely move.",
        },
        { t: "say", x: "DevTools shows this as **Recalculate Style**, and its summary counts the elements affected. When that count is the whole document and you changed one thing, look for a class or a variable set too high in the tree." },
      ],
    },
    {
      title: "Layout, and how you force it",
      beats: [
        {
          t: "code",
          lang: "js",
          src: "// Writes are cheap: they only mark things dirty.\nel.style.width = '50%';     // style dirty\nel.classList.add('wide');   // still just flags\n\n// A read that needs geometry pays for everything pending, now.\nel.offsetWidth;             // style + layout, synchronously\nel.offsetWidth;             // nothing dirty: free\n\n// Left alone, the browser does it once, just before paint.",
          mark: [6],
          note: "That read is a **forced synchronous layout**: work the browser would have done once at the end of the frame, done right now, in the middle of your script.",
        },
        {
          t: "predict",
          lang: "js",
          src: "el.style.width = '50%';\n\nconst a = el.style.width;\nconst b = getComputedStyle(el).color;\nconst c = getComputedStyle(el).width;",
          q: "Which line forces a layout?",
          options: ["`a`", "`b`", "`c`", "All three", "None, reads are always cheap"],
          answer: 2,
          why: "`el.style` just reads the inline declaration. `color` needs style but not geometry. The computed `width` of a rendered element is its used pixel width, and only layout knows it. `getComputedStyle` costs whatever the property you read needs.",
        },
        { t: "say", x: "Reads that force layout: `offset*`, `client*`, `scrollTop`, `getBoundingClientRect()`, `innerText`, `scrollIntoView()`, `focus()`, geometry from `getComputedStyle`. Paul Irish keeps [the full list](https://gist.github.com/paulirish/5d52fb081b3570c81e3a)." },
        {
          t: "predict",
          lang: "js",
          src: "// 100 boxes. Layout is clean when this starts.\nfor (const b of boxes) {\n  b.style.width = b.offsetWidth + 10 + 'px';\n}",
          q: "Roughly how many layouts does this run?",
          options: ["1", "2", "About 100", "About 200"],
          answer: 2,
          why: "Every read after a write finds layout dirty and runs it on the spot: one per iteration, then one more before paint. That's **layout thrashing**. Read all the widths first, then write them all, and it's one layout.",
        },
        {
          t: "play",
          mode: "html",
          title: "thrash vs batched, measured",
          html: "<div id=\"list\"></div>",
          css: "body { font: 12px system-ui; }\n.row { padding: 1px 6px; border-bottom: 1px solid #ddd; }",
          js: THRASH_JS,
          task: "Double the rows to 1000: does thrash double or quadruple? Then write `color` instead of `height`: the reads now force only style, and the gap all but vanishes.",
        },
        {
          t: "pitfall",
          h: "The read hides in someone else's code",
          x: "Your render writes, a tooltip library calls `getBoundingClientRect`, an analytics script reads `offsetHeight`. Each is fine alone; interleaved in one task they thrash. DevTools' Forced reflow insight names the top functions that forced layout, third-party ones included.",
        },
        {
          t: "quiz",
          q: "Why can thrashing be O(n^2) and not just n times slower?",
          options: ["Each layout re-parses the CSS", "Each forced layout may walk every sibling after the change, and there are n of them", "The GC runs after every read", "Layout is always O(n^2)"],
          answer: 1,
          why: "Change one row's height and every row below it moves, so the container re-lays out its children. n forced layouts, each O(n) in the container: quadratic. Layout alone is roughly linear in the dirty part of the tree.",
        },
      ],
    },
    {
      title: "Paint, layers and the compositor",
      beats: [
        { t: "say", x: "Paint doesn't make pixels. It records a **display list**: this rect, this run of text, this image, in order. **Raster** plays that list into GPU tiles later, off the main thread. A Paint bar in DevTools is the recording, not the drawing." },
        { t: "say", x: "Layerizing splits the display list into **composited layers**, each rastered on its own. The compositor then draws each layer with its current transform, opacity and clip. Move a layer and nobody repaints it." },
        {
          t: "table",
          caption: "DevTools' Layers panel lists every layer and why it exists. Rendering > Layer borders outlines them live.",
          head: ["Gets its own layer in Chromium", "When"],
          rows: [
            ["a 3D transform: `translateZ(0)`, `translate3d(...)`", "always: the old hack"],
            ["`will-change: transform`, `opacity` or `filter`", "from the moment it's set"],
            ["a running animation of transform, opacity or filter", "only while it runs"],
            ["`<video>`, a WebGL or accelerated `<canvas>`", "they draw into their own surfaces"],
            ["anything painted above a layer and overlapping it", "to keep paint order right"],
          ],
        },
        {
          t: "predict",
          lang: "js",
          src: "// No wheel or touch listeners on the page.\nwindow.addEventListener('scroll', () => {\n  bar.style.width = (scrollY / maxScroll) * 100 + '%';\n});\n\n// The user flicks the trackpad, and then this runs:\nconst end = performance.now() + 500;\nwhile (performance.now() < end) {}",
          q: "What does the user see for those 500 ms?",
          options: ["Everything freezes", "The page keeps scrolling; the progress bar freezes", "The scroll is queued and jumps at the end", "The scroll is cancelled"],
          answer: 1,
          why: "Scrolling is a compositor job: it edits the scroll offset in the property tree and redraws rastered tiles. Your scroll handler is main-thread JS, so the bar waits. Add a non-passive wheel listener and the scroll itself would wait (chapter 10).",
        },
        {
          t: "pitfall",
          h: "A transform breaks `position: fixed` inside it",
          x: "An ancestor with `transform`, `filter`, `will-change: transform`, `perspective` or `contain: paint` becomes the containing block for fixed descendants. Your fixed modal now scrolls with the card it sits in. Render modals at the end of `<body>`, or use `<dialog>` and the top layer.",
        },
        {
          t: "pitfall",
          h: "`will-change: transform` freezes the raster scale",
          x: "Chrome skips re-rastering `will-change: transform` content when JS changes its scale, trading sharpness for speed. Zoom a card from 1x to 2x in JS and its text stays blurry. CSS animations are rastered crisp. Remove `will-change` when the zoom ends to get sharp text back.",
        },
        {
          t: "compare",
          a: { label: "repaints every frame", lang: "css", src: ".card { transition: box-shadow .3s; }\n.card:hover {\n  box-shadow: 0 12px 32px #0005;\n}" },
          b: { label: "composites every frame", lang: "css", src: ".card { position: relative; }\n.card::after {\n  content: ''; position: absolute; inset: 0;\n  border-radius: inherit; pointer-events: none;\n  box-shadow: 0 12px 32px #0005;\n  opacity: 0; transition: opacity .3s;\n}\n.card:hover::after { opacity: 1; }" },
          x: "Paint the big shadow once on a pseudo-element and fade its opacity. Same look, and the per-frame work moves from the main thread's paint to the compositor.",
        },
        {
          t: "quiz",
          q: "You put `will-change: transform` on a background blob at the bottom of the stacking order. 300 cards painted above it overlap it. What changes?",
          options: ["Nothing, the blob is behind them", "Cards overlapping it may need layers too, so the compositor can keep them on top", "The blob now paints above the cards", "The cards lose their shadows"],
          answer: 1,
          why: "The compositor draws layers in order. Content above a layer that overlaps it can't stay in a layer beneath it, so it's layered too, or squashed into shared layers. The Layers panel's layer count is the tell.",
        },
      ],
    },
    {
      title: "Doing less: contain and content-visibility",
      beats: [
        { t: "say", x: "Style and layout cost scales with how much of the tree a change can touch. `contain` is a promise that lets the browser cut the tree: nothing inside this box affects anything outside it." },
        {
          t: "table",
          head: ["`contain:`", "You promise", "The browser can"],
          rows: [
            ["`layout`", "nothing inside moves anything outside", "re-lay out from this box instead of from the page"],
            ["`paint`", "nothing inside draws outside the box", "skip painting it offscreen; it clips overflow"],
            ["`size`", "its size doesn't depend on its children", "size it without looking inside; you must give it a size"],
            ["`style`", "counters and quotes stay inside", "rarely matters on its own"],
            ["`content` / `strict`", "layout + paint + style / all four", "the bundles you actually write"],
          ],
        },
        {
          t: "quiz",
          q: "You add `contain: strict` to a card with no set height. What happens?",
          options: ["Nothing visible, it's only a hint", "It collapses to the height of its padding and border", "It becomes a scroll container", "It becomes position: fixed"],
          answer: 1,
          why: "`strict` includes size containment: the card is sized as if it had no children. With no explicit height that means zero content height. `contain: content` is the safe default; add `size` only when the size is set.",
        },
        { t: "say", x: "`content-visibility: auto` goes further. Offscreen, the browser **skips style, layout and paint** for the whole subtree. The content stays in the DOM, in find-in-page and in the accessibility tree, and is rendered as it nears the viewport." },
        {
          t: "code",
          lang: "css",
          src: "article > section {\n  content-visibility: auto;\n  contain-intrinsic-size: auto 800px;\n}",
          mark: [3],
          note: "A skipped section has no content to size it, so give a placeholder. The `auto` keyword makes the browser remember each section's real size once it has rendered, so the scrollbar stops jumping.",
        },
        {
          t: "play",
          mode: "html",
          title: "1000 sections, skipped or not",
          html: "<main id=\"main\"></main>",
          css: "body { font: 13px system-ui; }\nsection { content-visibility: var(--cv); contain-intrinsic-size: auto 400px; }",
          js: CV_JS,
          task: "Remove `contain-intrinsic-size` and scroll: the scrollbar thumb jumps. Then time `getBoundingClientRect()` on the last section, and on a `<p>` inside it. Only one forces a render.",
        },
        {
          t: "pitfall",
          h: "content-visibility clips and can be undone",
          x: "It applies paint containment, so anything that overflows a section is clipped: dropdowns, tooltips, child shadows. And any script that measures skipped content, like a scroll spy calling `getBoundingClientRect` on every heading, forces it to render and throws the win away.",
        },
      ],
    },
    {
      title: "Inside one frame",
      beats: [
        {
          t: "viz",
          name: "frames",
          props: {
            cols: ["Main thread", "Compositor thread", "Raster, GPU"],
            frames: [
              { cells: [[], ["vsync: BeginFrame"], []], note: "The display is about to refresh. The compositor gets a BeginFrame and asks the main thread for a new frame, if it has anything to change." },
              { cells: [["pointermove, wheel"], ["waiting on main"], []], note: "Continuous input, coalesced to one event per frame and delivered here, in Chrome. A handler that only records values is nearly free." },
              { cells: [["resize, scroll events", "media query changes", "animation events"], ["waiting on main"], []], note: "The spec's *update the rendering* steps begin. Scroll and resize events fire here, once per frame." },
              { cells: [["rAF callbacks"], ["waiting on main"], []], note: "Every `requestAnimationFrame` callback, all with the same timestamp. The last chance to write before style runs." },
              { cells: [["Recalculate Style", "Layout"], ["waiting on main"], []], note: "Style and layout, once, for everything written since the last frame. Unless a forced read already paid for it mid-script." },
              { cells: [["ResizeObserver callbacks", "style + layout again if they wrote"], ["waiting on main"], []], note: "ResizeObservers run after layout, inside the frame. IntersectionObservers are computed about here too, but their callbacks come later, in a task." },
              { cells: [["Pre-paint", "Paint", "Layerize", "Commit"], ["gets layers + property trees"], []], note: "Property trees, a display list, layers. Commit copies the result to the compositor thread. The main thread is free again." },
              { cells: [["next task"], ["schedules tiles"], ["raster dirty tiles"]], note: "Raster threads and the GPU turn display lists into tiles: only changed tiles, and new ones scrolled into view." },
              { cells: [["next task"], ["activate", "draw frame"], ["aggregate", "present"]], note: "The compositor builds a frame, the GPU process combines it with the browser UI and other frames, and it goes on screen." },
              { cells: [["busy: an 80 ms task"], ["BeginFrame", "scroll", "compositor animations", "draw frame"], ["present"]], note: "Main thread stuck? The compositor still scrolls and ticks transform and opacity animations. Only main-thread changes wait." },
            ],
          },
        },
        {
          t: "predict",
          lang: "js",
          src: "requestAnimationFrame((t) => console.log('a', t));\nrequestAnimationFrame((t) => {\n  const end = performance.now() + 5;\n  while (performance.now() < end) {}\n  console.log('b', t);\n});\nrequestAnimationFrame((t) => console.log('c', t));",
          q: "What about the three timestamps?",
          options: ["a < b < c: each is the moment it ran", "All three are equal", "a equals b, c is 5 ms later", "c is one frame later"],
          answer: 1,
          why: "Every callback in a frame gets the frame's start time, not the time it ran. That keeps every animation on the page in lockstep. Want the real time inside a callback? Call `performance.now()`.",
        },
        {
          t: "predict",
          lang: "js",
          src: "requestAnimationFrame(() => {\n  console.log('A');\n  Promise.resolve().then(() => console.log('micro'));\n  requestAnimationFrame(() => console.log('B'));\n});\nrequestAnimationFrame(() => console.log('C'));",
          q: "What order, and in how many frames?",
          options: ["A, micro, C, then B next frame", "A, C, micro, B, all in one frame", "A, B, C, micro in one frame", "A, C, B in one frame, then micro"],
          answer: 0,
          why: "Microtasks drain as each callback returns, before the next one runs. The callback list is snapshotted when the frame starts, so B waits a frame. That's why a rAF loop runs once per frame instead of forever.",
        },
        { t: "viz", name: "framebudget" },
        { t: "say", x: "At 60 Hz a frame is 16.7 ms, at 120 Hz 8.3 ms, and your JS doesn't get all of it: style, layout and paint come out of the same budget. Google's old RAIL guidance left scripts about 10 ms of a 60 Hz frame." },
        {
          t: "code",
          lang: "js",
          src: "let y = 0, pending = false;\n\naddEventListener('pointermove', (e) => {\n  y = e.clientY;                        // just record\n  if (!pending) { pending = true; requestAnimationFrame(update); }\n});\n\nfunction update() {\n  pending = false;\n  const max = track.clientHeight;       // read first: layout is clean\n  knob.style.transform = `translateY(${Math.min(y, max)}px)`; // then write\n}",
          mark: [4, 10, 11],
          note: "Handlers record, one rAF callback reads and then writes. A read at the top of the frame finds last frame's layout still clean, so it costs nothing.",
        },
        {
          t: "pitfall",
          h: "Scroll-linked JS trails the scroll",
          x: "The compositor scrolls first; your `scroll` handler runs later on the main thread. Anything it positions to follow the scroll lands a frame behind and jitters, worse on a busy page. Use `position: sticky`, or a scroll-driven animation (chapter 31) that runs on the compositor.",
        },
      ],
    },
    {
      title: "Reading the Performance panel",
      beats: [
        {
          t: "steps",
          h: "A recording worth reading",
          items: [
            "Use a clean profile or a guest window, so extensions stay out of the trace.",
            "Performance panel, capture settings: CPU throttling 4x or 6x. Your laptop is not your users' phone.",
            "Record, do the one slow interaction, stop. Short traces are readable traces.",
            "In the Frames track, find the red (dropped) and yellow (partially presented) frames. Zoom the Main track to them.",
            "Read the colours: yellow is scripting, purple is style and layout, green is paint and compositing.",
            "Click a purple Layout: the summary shows how much it laid out and, if JS forced it, the stack that did.",
            "Open the Insights sidebar. Forced reflow lists the functions that forced layout and the total time.",
          ],
        },
        {
          t: "table",
          head: ["You see", "It means", "First move"],
          rows: [
            ["many thin purple Layouts inside one yellow task", "layout thrashing", "all reads first, then all writes"],
            ["one huge Recalculate Style after a small change", "a class or variable set too high up", "move it down, or `@property` with `inherits: false`"],
            ["green Paint in every frame of an animation", "animating a paint property", "animate transform or opacity instead"],
            ["long Layerize or Commit", "too many layers", "stop spreading `will-change`"],
            ["dropped frames while the main thread is idle", "raster or GPU bound", "shrink layers and big blurs; check Layer borders"],
          ],
        },
        { t: "say", x: "The Rendering drawer shows it live. **Paint flashing** tints every repainted rectangle green, **Layer borders** outlines layers, **Frame Rendering Stats** overlays the frame rate. Paint flashing during a scroll that should be free is a bug report." },
        {
          t: "quiz",
          q: "A 90 ms task: a yellow `pointermove` handler with 40 thin purple Layout slivers inside it. Diagnosis?",
          options: ["The handler's JS is slow", "Layout thrashing: the handler interleaves reads and writes", "The GPU is overloaded", "A variable on `:root` is restyling everything"],
          answer: 1,
          why: "Each sliver is a forced layout, triggered from inside the script. A `:root` variable shows up as one big Recalculate Style, a GPU problem as idle main thread with dropped frames.",
        },
        {
          t: "pitfall",
          h: "Instrumentation changes the numbers",
          x: "Advanced paint instrumentation and CSS selector stats make every frame slower than reality. Record once plain for timings, once instrumented for the why, and never compare numbers across the two. Screenshots in the trace cost frames too.",
        },
        {
          t: "mission",
          h: "Profile a page you use every day",
          x: "Record a scroll and one interaction on a heavy site with 4x CPU throttling. Find the longest frame, name the stage that dominated it, find one forced reflow in Insights and trace it to the line that read layout. Then turn on Paint flashing and find one repaint that shouldn't happen.",
          hint: "Select a Layout event: its summary shows the stack that forced it, with links into Sources. Paint flashing on a sticky header or a spinner during scroll is the classic find.",
        },
      ],
    },
    {
      title: "Rebuild: a pipeline in 60 lines",
      beats: [
        { t: "say", x: "A real engine is these same stages, just enormous. The small version fits in a playground: a tree in, style by tag and class, block layout, a display list out, and a canvas standing in for raster." },
        {
          t: "rebuild",
          h: "Style, layout, paint, raster",
          x: "Each stage is a function that takes the previous stage's output. Read the console: that's the display list, the same thing a Paint event records. Change a colour, then a padding: which functions would a real engine rerun for each?",
          mode: "html",
          html: "<canvas width=\"420\" height=\"260\"></canvas>",
          css: "canvas { border: 1px solid #ccc; display: block; }",
          js: ENGINE_JS,
          task: "Add a `hidden` rule that layout and paint skip. Then make layout incremental: edit one `<p>`'s text, re-lay out only it, its ancestors and what follows, and log the count.",
        },
        {
          t: "mission",
          h: "Build fastdom: a read/write scheduler",
          x: "Write `measure(fn)` and `mutate(fn)`. They queue work and flush it in one rAF: every measure, then every mutate, including mutates queued by the measures. Port the thrashing loop to it and confirm in DevTools that it's one layout.",
          hint: "Two arrays and a `scheduled` flag. Swap each array out before running it, so work queued by a mutate lands in the next frame instead of looping forever.",
          solution: {
            lang: "js",
            src: "let reads = [], writes = [], scheduled = false;\n\nfunction schedule() {\n  if (scheduled) return;\n  scheduled = true;\n  requestAnimationFrame(flush);\n}\nfunction flush() {\n  scheduled = false;\n  const r = reads; reads = [];\n  r.forEach((fn) => fn());   // reads: at most the first pays for layout\n  const w = writes; writes = []; // includes writes queued by those reads\n  w.forEach((fn) => fn());   // writes: dirty flags only\n  if (reads.length || writes.length) schedule(); // queued by writes: next frame\n}\nexport const measure = (fn) => { reads.push(fn); schedule(); };\nexport const mutate = (fn) => { writes.push(fn); schedule(); };\n\nfor (const el of rows) {\n  measure(() => {\n    const w = el.offsetWidth;\n    mutate(() => { el.style.width = w / 2 + 'px'; });\n  });\n}",
          },
        },
      ],
    },
  ],
  nobodyTells: [
    "Writes are cheap flags; reads are where you pay. When a trace shows forced layout, hunt for the read, not the write.",
    "Every rAF callback in a frame gets the same timestamp. Animate from it, not from `performance.now()`, and everything stays in step.",
    "For panels you toggle often, `content-visibility: hidden` keeps the rendering state that `display: none` throws away, so showing it again is cheap.",
    "`translateZ(0)` cures jank by adding a layer and causes it again at scale. Check the layer count in the Layers panel before sprinkling it.",
    "Chrome won't re-raster `will-change: transform` content on JS scale changes. Drop `will-change` when a zoom ends to get crisp text back.",
    "ResizeObserver callbacks run inside the frame, before paint; IntersectionObserver callbacks arrive in a later task. Size work belongs in RO.",
    "Throttle the CPU 4x before believing any trace recorded on a laptop.",
    "Paint flashing during a scroll that should be free means something repaints every frame. Fix that before touching any JS.",
  ],
  glossary: [
    ["preload scanner", "A second HTML scanner that runs ahead of a blocked parser and starts fetching the resources it sees."],
    ["render-blocking", "A resource the browser waits for before the first paint: stylesheets, and classic scripts in the head."],
    ["invalidation set", "The browser's record of which elements a class or attribute change can affect, so style reruns only there."],
    ["forced synchronous layout", "A layout run immediately because JS read geometry while style or layout was dirty."],
    ["layout thrashing", "Interleaved writes and geometry reads that force a layout on every iteration of a loop."],
    ["property trees", "Chromium's trees of transforms, clips, effects and scroll offsets, which the compositor can change alone."],
    ["display list", "The recorded draw commands that paint produces. Raster turns it into pixels later."],
    ["raster", "Executing display lists into GPU texture tiles, on raster threads and the GPU."],
    ["composited layer", "Part of the page rastered separately, so the compositor can move or fade it without repainting."],
    ["compositor thread", "The thread that scrolls, runs transform and opacity animations, and draws frames without the main thread."],
    ["containment", "`contain`: a promise that a subtree's layout, paint or size is independent, so the browser can skip work."],
    ["content-visibility", "`auto` skips style, layout and paint for offscreen subtrees until they near the viewport."],
    ["frame budget", "The time between display refreshes: 16.7 ms at 60 Hz, 8.3 ms at 120 Hz, shared by your JS and rendering."],
  ],
  explain: "Explain to a friend why a transform animation stays smooth while the main thread is busy but a width animation stutters, stage by stage.",
};
