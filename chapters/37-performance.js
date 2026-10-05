const ENTRIES_PLAY = {
  html: `<p id="banner"></p>
<h1 id="hero">Mountain weather, live</h1>
<p>Wait two seconds, then click the button.</p>
<button id="b">slow click</button>`,
  css: `#hero { font-size: 40px; opacity: 0; }
#banner { margin: 0; background: #f3e2c0; }
button { font: inherit; }`,
  js: `const ms = (v) => Math.round(v) + ' ms';
const busy = (n) => { const t = performance.now(); while (performance.now() - t < n) {} };

const handlers = {
  'paint': (e) => console.log(e.name, ms(e.startTime)),
  'largest-contentful-paint': (e) =>
    console.log('LCP candidate', ms(e.startTime), '<' + e.element?.tagName.toLowerCase() + '>', e.size + ' px2'),
  'layout-shift': (e) => console.log('layout shift', e.value.toFixed(4), e.hadRecentInput ? '(after input: ignored)' : ''),
  'event': (e) => e.interactionId && console.log('interaction', e.name, ms(e.duration)),
  'long-animation-frame': (e) => console.log('long frame', ms(e.duration), 'blocking', ms(e.blockingDuration)),
};

for (const [type, fn] of Object.entries(handlers)) {
  if (!PerformanceObserver.supportedEntryTypes.includes(type)) { console.warn(type, 'not supported here'); continue; }
  new PerformanceObserver((list) => list.getEntries().forEach(fn))
    .observe({ type, buffered: true, ...(type === 'event' ? { durationThreshold: 16 } : {}) });
}

// the page doing things
setTimeout(() => { document.getElementById('hero').style.opacity = 1; }, 600);
setTimeout(() => { document.getElementById('banner').textContent = 'Storm warning: roads closed above 2000 m'; }, 1200);
document.getElementById('b').onclick = (e) => { busy(250); e.target.textContent = 'clicked'; };`,
};

const TIMING_PLAY = String.raw`const data = Array.from({ length: 200000 }, (_, i) => ({ name: 'item ' + i, score: Math.random() }));

function search(q) {
  performance.mark('search:start');
  const hits = data.filter((d) => d.name.includes(q));
  performance.mark('search:filtered');
  hits.sort((a, b) => b.score - a.score);
  performance.mark('search:sorted');
  performance.measure('filter', 'search:start', 'search:filtered');
  performance.measure('sort', {
    start: 'search:filtered', end: 'search:sorted',
    detail: { devtools: { track: 'Search', color: 'tertiary' } }, // a custom track in Chrome's Performance panel
  });
  return hits.length;
}

// one run is an anecdote: run it 30 times and read the distribution
for (let i = 0; i < 30; i++) search(String(i % 10));

const pct = (xs, p) => xs[Math.min(xs.length - 1, Math.floor(p * xs.length))];
for (const name of ['filter', 'sort']) {
  const xs = performance.getEntriesByName(name, 'measure').map((m) => m.duration).sort((a, b) => a - b);
  console.log(name.padEnd(7), 'p50', pct(xs, 0.5).toFixed(1), 'ms   p95', pct(xs, 0.95).toFixed(1), 'ms   max', xs.at(-1).toFixed(1), 'ms');
}
performance.clearMarks();
performance.clearMeasures(); // the buffer is not infinite: clean up in long-lived apps`;

const INP_PLAY = {
  html: `<button id="a">A: 300 ms handler</button>
<button id="b">B: paint first, then work</button>
<label><input type="checkbox" id="noisy"> busy page (a 150 ms task every 200 ms)</label>
<p id="out">click a button</p>`,
  css: `button, label { display: block; margin: 8px 0; font: inherit; }`,
  js: `const out = document.getElementById('out');
const busy = (ms) => { const t = performance.now(); while (performance.now() - t < ms) {} };
// resolves after the next frame has been produced
const afterPaint = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

document.getElementById('a').onclick = () => {
  busy(300);                     // save, recompute, log analytics...
  out.textContent = 'A done';
};
document.getElementById('b').onclick = async () => {
  out.textContent = 'B saving...'; // the visible answer first
  await afterPaint();              // let that frame out
  busy(300);                       // same work, after the paint
  out.textContent = 'B done';
};

let timer = 0;
document.getElementById('noisy').onchange = (e) => {
  clearInterval(timer);
  if (e.target.checked) timer = setInterval(() => busy(150), 200);
};

new PerformanceObserver((list) => {
  for (const e of list.getEntries()) {
    if (!e.interactionId || e.name !== 'click') continue;
    const input = e.processingStart - e.startTime;
    const handlers = e.processingEnd - e.processingStart;
    const presentation = e.startTime + e.duration - e.processingEnd;
    console.log((e.target?.id || '?') + ': ' + e.duration + ' ms = input delay ' + Math.round(input) +
      ' + handlers ' + Math.round(handlers) + ' + presentation ' + Math.round(presentation));
  }
}).observe({ type: 'event', buffered: true, durationThreshold: 16 });`,
};

const RETRY_PLAY = String.raw`// 1000 clients lose the server at t = 0. It comes back at t = 3 s,
// but can only serve 120 requests per 100 ms. Extra requests fail and are retried.
function simulate(name, delayFor) {
  const CAP = 120, BACK_AT = 3000, STEP = 100;
  let queue = Array.from({ length: 1000 }, () => ({ at: 0, attempt: 0 }));
  let t = 0, wasted = 0, peak = 0;
  while (queue.length && t < 120000) {
    const now = queue.filter((c) => c.at < t + STEP);
    queue = queue.filter((c) => c.at >= t + STEP);
    if (t >= BACK_AT) peak = Math.max(peak, now.length);
    let served = 0;
    for (const c of now) {
      if (t >= BACK_AT && served < CAP) { served++; continue; }
      if (t >= BACK_AT) wasted++;
      c.attempt++;
      c.at = t + delayFor(c.attempt);
      queue.push(c);
    }
    t += STEP;
  }
  console.log(name.padEnd(26), 'done at', (t / 1000).toFixed(1).padStart(5), 's   failed after recovery', String(wasted).padStart(5), '  peak per 100 ms', peak);
}
const base = 100, max = 5000;
simulate('fixed 1 s', () => 1000);
simulate('exponential', (n) => Math.min(max, base * 2 ** n));
simulate('exponential + full jitter', (n) => Math.random() * Math.min(max, base * 2 ** n));`;

const RED_PAGE = {
  html: `<div id="hud">measuring...</div>
<button id="buy">Add to cart</button>
<div id="slot"></div>
<main id="app"></main>
<ul class="items"><li>Down jacket, 89</li><li>Wool coat, 120</li><li>Rain shell, 64</li></ul>
<p class="small">Free returns within 30 days. Prices include tax.</p>`,
  css: `body { margin: 0; padding: 12px 16px; }
#hud { font: 600 13px ui-monospace, monospace; padding: 6px 8px; border-radius: 6px; background: #eee; }
#hud b { padding: 0 4px; border-radius: 4px; color: #fff; }
button { font: inherit; padding: 6px 14px; margin-top: 8px; }
#slot { margin-top: 8px; }
.promo { height: 80px; padding: 0 16px; display: grid; align-items: center; background: #f3e2c0; }
h1 { font-size: 32px; line-height: 1.1; margin: 12px 0 6px; }
.small { font-size: 12px; color: #666; }`,
  js: `// ---------- the page: make all three numbers green ----------
const busy = (ms) => { const t = performance.now(); while (performance.now() - t < ms) {} };

setTimeout(() => {                 // the "framework" boots, then renders the hero
  busy(1200);
  document.getElementById('app').innerHTML =
    '<h1>Winter sale: 40% off every jacket</h1><p>Down, wool and shells, until Sunday.</p>';
}, 3000);

setTimeout(() => {                 // a promo arrives late, from "an API"
  document.getElementById('slot').innerHTML = '<div class="promo">Free shipping over 50</div>';
}, 4800);

document.getElementById('buy').onclick = (e) => {
  busy(600);                       // cart, analytics, recommendations
  e.target.textContent = 'Added';
};

// ---------- the meter: leave it alone ----------
const hud = document.getElementById('hud');
let lcp = 0, cls = 0, inp = 0, win = 0, first = 0, last = 0;
const worst = new Map();
const rate = (v, good, poor) => (v <= good ? '#2a7d4f' : v <= poor ? '#b7791f' : '#c0392b');
const show = () => (hud.innerHTML =
  'LCP <b style="background:' + rate(lcp, 2500, 4000) + '">' + Math.round(lcp) + ' ms</b> ' +
  'CLS <b style="background:' + rate(cls, 0.1, 0.25) + '">' + cls.toFixed(3) + '</b> ' +
  'INP <b style="background:' + rate(inp, 200, 500) + '">' + (inp ? inp + ' ms' : 'click') + '</b>');
const on = (type, fn, extra) =>
  new PerformanceObserver((l) => { l.getEntries().forEach(fn); show(); }).observe({ type, buffered: true, ...extra });

on('largest-contentful-paint', (e) => { lcp = e.startTime; });
on('layout-shift', (e) => {
  if (e.hadRecentInput) return;
  if (win && e.startTime - last < 1000 && e.startTime - first < 5000) win += e.value;
  else { win = e.value; first = e.startTime; }
  last = e.startTime;
  cls = Math.max(cls, win);
});
on('event', (e) => {
  if (!e.interactionId) return;
  worst.set(e.interactionId, Math.max(worst.get(e.interactionId) || 0, e.duration));
  inp = Math.max(...worst.values());
}, { durationThreshold: 16 });`,
};

export default {
  id: "performance",
  n: 37,
  part: "F",
  title: "Performance and robustness",
  hook: "Three numbers, measured on real phones, decide whether your site feels fast. Learn to measure them before you fix anything.",
  minutes: 80,
  levels: ["use", "understand"],
  sections: [
    {
      title: "Three numbers at p75",
      beats: [
        { t: "say", x: "Your page has no single load time. It has a **distribution**: one per visit, per phone, per network. Core Web Vitals squeeze that into three numbers, each judged at the **75th percentile** of real visits, split by mobile and desktop." },
        {
          t: "table",
          head: ["Metric", "It times", "Good", "Poor"],
          rows: [
            ["**LCP** Largest Contentful Paint", "Navigation start to the biggest image or text block painting", "<= 2.5 s", "> 4 s"],
            ["**INP** Interaction to Next Paint", "Click, tap or key to the next frame, worst one per visit", "<= 200 ms", "> 500 ms"],
            ["**CLS** Cumulative Layout Shift", "The worst burst of unexpected layout shifts, unitless", "<= 0.1", "> 0.25"],
          ],
          caption: "Between good and poor is \"needs improvement\". INP replaced First Input Delay in March 2024.",
        },
        {
          t: "predict",
          lang: "text",
          src: "LCP from 8 real visits (seconds):\n1.1  1.2  1.3  1.5  1.8  2.2  2.3  9.0\n\nmean = 2.55 s",
          q: "How does this page rate on LCP?",
          options: ["Needs improvement: the mean is over 2.5 s", "Good: the 75th percentile is about 2.2 s", "Poor: one visit took 9 s", "Can't tell without the median"],
          answer: 1,
          why: "The verdict is the p75, about 2.2 s here. The mean is dragged by one 9 s outlier and describes nobody. The flip side: p75 ignores your worst quarter, so watch p95 for the users you're losing.",
        },
        {
          t: "quiz",
          q: "Scrolling your product list stutters badly on phones. Does that hurt INP?",
          options: ["Yes, scroll is the most common interaction", "No: INP counts clicks, taps and key presses only. Scroll and hover don't count", "Only on touch devices", "Only if the scroll handler is not passive"],
          answer: 1,
          why: "INP observes clicks, taps and keyboard input. Scroll jank is real and users hate it, but no Core Web Vital captures it: you have to find it yourself in a trace. Don't confuse \"green vitals\" with \"smooth\".",
        },
        { t: "say", h: "How each one is computed", x: "LCP stops updating at the first tap, scroll or key press. INP takes the worst interaction, but ignores one for every 50, so a long session isn't judged by one freak. CLS groups shifts into windows (gaps under 1 s, at most 5 s long) and keeps the worst window." },
        {
          t: "pitfall",
          h: "The public dashboard is Chrome-only and 28 days late",
          x: "CrUX, the data behind Search Console and PageSpeed Insights, comes only from opted-in Chrome users, over a rolling 28 days. Ship a fix today and the number drifts for four weeks. Safari and Firefox users exist only in your own RUM.",
        },
        { t: "say", x: "Since Safari 26.2 (December 2025), every major browser exposes the LCP and Event Timing APIs, so LCP and INP are measurable everywhere. CLS's Layout Instability API is still Chromium-only. Values differ by a few ms between engines." },
      ],
    },
    {
      title: "Lab versus field",
      beats: [
        {
          t: "table",
          head: ["", "Lab: Lighthouse, a DevTools trace", "Field: CrUX, your RUM"],
          rows: [
            ["Who", "One simulated device, one run", "Every real visit"],
            ["Network and CPU", "Throttled to a preset", "Whatever users really have"],
            ["Cache", "Usually cold", "Often warm, bfcache restores, prerenders"],
            ["INP", "Not measured: no one clicks. TBT stands in", "Measured on real interactions"],
            ["Good for", "Debugging: repeatable, full trace", "Truth: is it actually fast for people"],
          ],
        },
        {
          t: "predict",
          lang: "text",
          src: "Lighthouse (mobile): Performance 97, LCP 1.9 s\nPageSpeed Insights field data: LCP 4.6 s (poor)\nSame URL, same week.",
          q: "Most likely explanation?",
          options: ["Lighthouse is broken", "Field users hit things the lab never sees: cold CDN edges, consent banners, A/B scripts, slow phones, logged-in pages", "CrUX averages in desktop", "The score and LCP are unrelated"],
          answer: 1,
          why: "The lab loads one anonymous page once. Real users arrive through ad redirects, get personalised HTML that misses the CDN, see a cookie banner that becomes the LCP element, on phones slower than any preset. Trust the field, debug in the lab.",
        },
        {
          t: "steps",
          h: "Reading PageSpeed Insights in the right order",
          items: [
            "Top block first: \"Discover what your real users are experiencing\". That's CrUX, p75, last 28 days.",
            "Switch between this URL and the whole origin. A URL with too little traffic falls back to origin data.",
            "Only then read the Lighthouse diagnosis below. It's one lab run: a lead, not a verdict.",
            "Pick the failing field metric, reproduce it in a DevTools trace with throttling, fix, then wait for the field to agree.",
          ],
        },
        {
          t: "pitfall",
          h: "The Lighthouse score is not a Core Web Vital",
          x: "The 0-100 score is a weighted blend of lab metrics, and it moves between runs on the same page. Teams spend weeks taking 88 to 96 while field INP stays poor, because Lighthouse never clicks anything. Optimise the field metrics; treat the score as a smoke alarm.",
        },
      ],
    },
    {
      title: "Measure it yourself",
      beats: [
        { t: "say", x: "Every number above comes from browser APIs you can call. The browser writes **performance entries** into a timeline; a `PerformanceObserver` hands them to you. With `buffered: true` you also get the ones recorded before your script ran." },
        { t: "play", mode: "html", title: "every entry the browser records", ...ENTRIES_PLAY, task: "Watch the LCP candidate change when the hero fades in. The banner shift counts; one within 500 ms of a click would carry `hadRecentInput`. Click, then delete `buffered: true` and rerun." },
        {
          t: "predict",
          lang: "js",
          src: "// loaded with defer, runs at 3 s; LCP happened at 1.4 s\nnew PerformanceObserver((list) => {\n  console.log(list.getEntries().at(-1).startTime);\n}).observe({ type: 'largest-contentful-paint' });",
          q: "What does it log?",
          options: ["1400", "3000", "Nothing, ever, unless a bigger element paints later", "An error: LCP can't be observed late"],
          answer: 2,
          why: "Without `buffered: true` an observer only sees entries created after `observe()`. Analytics scripts load late, so this bug silently drops the very metric they exist to collect. Always pass `buffered: true`.",
        },
        {
          t: "code",
          lang: "js",
          file: "vitals.js",
          src: "import { onLCP, onINP, onCLS } from 'web-vitals/attribution';\n\nconst queue = new Map();             // by id: a metric can report twice\nconst add = (m) => queue.set(m.id, {\n  name: m.name, value: m.value, rating: m.rating, id: m.id,\n  nav: m.navigationType,              // navigate, reload, back-forward-cache...\n  page: location.pathname,\n  device: matchMedia('(pointer: coarse)').matches ? 'touch' : 'mouse',\n  why: m.name === 'LCP' ? m.attribution.target\n     : m.name === 'INP' ? m.attribution.interactionTarget : m.attribution.largestShiftTarget,\n});\nonLCP(add); onINP(add); onCLS(add);\n\naddEventListener('visibilitychange', () => {\n  if (document.visibilityState !== 'hidden' || !queue.size) return;\n  navigator.sendBeacon('/vitals', JSON.stringify([...queue.values()]));\n  queue.clear();\n});",
          mark: [1, 3, 15],
          note: "Google's `web-vitals` (v5) handles the edge cases: bfcache restores, prerender, background tabs. The attribution build tells you *which element* was to blame, which is the part you actually need.",
        },
        {
          t: "pitfall",
          h: "Report on hidden, never on unload",
          x: "On phones, people leave by switching apps, and `unload` and `beforeunload` often never fire. `visibilitychange` to hidden is the last reliable moment. CLS and INP keep growing until then, so the library may call you more than once per page: dedupe by `id`, keep the latest.",
        },
        { t: "say", x: "The vitals tell you *that* it's slow. **User Timing** tells you *what* was slow in your own code: `performance.mark()` drops a named timestamp, `performance.measure()` times the gap. Both appear in the DevTools Performance panel's Timings track." },
        { t: "play", mode: "js", title: "marks, measures, percentiles", js: TIMING_PLAY, task: "Run it a few times and watch p95 move more than p50. Then make `sort` sort only the top 100 hits and measure whether it won." },
        {
          t: "pitfall",
          h: "Never time one run",
          x: "The first call includes JIT warm-up, the tenth may hit a GC pause, and `performance.now()` is deliberately coarsened against Spectre. Run it many times, report p50 and p95, and compare distributions, not two single numbers. A 5% win inside the noise is not a win.",
        },
      ],
    },
    {
      title: "LCP, taken apart",
      beats: [
        {
          t: "table",
          head: ["Sub-part", "From, to", "Rough share of a good LCP"],
          rows: [
            ["TTFB", "Navigation start to the first byte of HTML", "~40%"],
            ["Resource load delay", "First byte to the LCP image's request starting", "< 10%"],
            ["Resource load duration", "Request start to the image's last byte", "~40%"],
            ["Element render delay", "Image loaded (or HTML ready, for text) to it painting", "< 10%"],
          ],
          caption: "web.dev's guidance. The two delays should be near zero; any time there is pure waste.",
        },
        { t: "viz", name: "waterfall" },
        {
          t: "predict",
          lang: "text",
          src: "LCP 2950 ms, broken down:\n  TTFB                    600 ms\n  resource load delay    1900 ms\n  resource load duration  300 ms\n  element render delay    150 ms\n\nThe hero is a background-image set in app.css.",
          q: "Which fix moves LCP the most?",
          options: ["Re-encode the hero as AVIF, half the bytes", "Make it discoverable: an `<img>` in the HTML, or a preload", "Move the HTML to a faster server", "Inline all the CSS"],
          answer: 1,
          why: "1.9 s goes by before the request even starts: the browser must fetch the CSS, parse it and match the rule first. Halving the bytes saves maybe 150 ms. Read the breakdown before you optimise anything.",
        },
        {
          t: "code",
          lang: "html",
          src: "<!-- the hero must be a CSS background? Tell the preload scanner about it -->\n<link rel=\"preload\" as=\"image\" fetchpriority=\"high\"\n      href=\"/hero-1200.avif\"\n      imagesrcset=\"/hero-800.avif 800w, /hero-1200.avif 1200w, /hero-2000.avif 2000w\"\n      imagesizes=\"100vw\" type=\"image/avif\">\n\n<!-- better: a real <img>, found in the first bytes, fetched first -->\n<img src=\"/hero-1200.avif\" fetchpriority=\"high\" alt=\"\" width=\"1200\" height=\"600\"\n     srcset=\"/hero-800.avif 800w, /hero-1200.avif 1200w, /hero-2000.avif 2000w\" sizes=\"100vw\">",
          mark: [2, 8],
          note: "Images start at low priority until layout proves they're in the viewport. `fetchpriority=\"high\"` skips that wait. Spend it on one image; when everything is high, nothing is.",
        },
        {
          t: "quiz",
          q: "A client-rendered SPA: TTFB 200 ms, but resource load delay is 2.1 s. What is the delay made of?",
          options: ["DNS for the image CDN", "Download, parse and run the JS bundle, fetch the data, render, and only then does the `<img>` exist", "The image is too large", "Render-blocking fonts"],
          answer: 1,
          why: "The HTML is an empty `<div id=\"root\">`, so nothing names the image until JS has run and an API answered. Server rendering, or at least a preload of the hero in the HTML, turns 2 s of load delay into ~0.",
        },
        {
          t: "pitfall",
          h: "Render delay hides in fade-ins and A/B tests",
          x: "The image arrived at 1.1 s but LCP says 2.8 s. Usual suspects: a hero that starts at `opacity: 0` and fades in after JS boots (zero-opacity elements don't count), an A/B tool hiding the body until its script answers, or text waiting on a web font. All render delay, none on the waterfall.",
        },
        { t: "say", x: "TTFB is the server's part: redirects, cold caches, slow queries, a CDN that misses on personalised HTML. The fixes are in *What happens when you open a URL*: fewer round trips, edge caching, `103 Early Hints` to start the hero fetch early." },
      ],
    },
    {
      title: "Images and fonts",
      beats: [
        {
          t: "predict",
          lang: "html",
          src: "<!-- a card, 300 CSS px wide, on a laptop: window 1440 px, devicePixelRatio 2 -->\n<img src=\"/shoe-800.jpg\" alt=\"Trail shoe\"\n     srcset=\"/shoe-400.jpg 400w, /shoe-800.jpg 800w, /shoe-1600.jpg 1600w\">",
          q: "Which file does the browser download?",
          options: ["shoe-400.jpg", "shoe-800.jpg", "shoe-1600.jpg", "All three, progressively"],
          answer: 2,
          why: "With no `sizes`, the browser assumes the image is `100vw`: 1440 x 2 = 2880 device px needed, so it takes the biggest. With `sizes=\"300px\"` it needs 600 and picks the 800. `srcset` without `sizes` mostly wastes bytes.",
        },
        {
          t: "code",
          lang: "html",
          src: "<picture>\n  <source type=\"image/avif\" srcset=\"/shoe-400.avif 400w, /shoe-800.avif 800w\">\n  <source type=\"image/webp\" srcset=\"/shoe-400.webp 400w, /shoe-800.webp 800w\">\n  <img src=\"/shoe-800.jpg\" alt=\"Trail shoe\"\n       width=\"800\" height=\"600\"\n       sizes=\"(min-width: 900px) 300px, 90vw\"\n       srcset=\"/shoe-400.jpg 400w, /shoe-800.jpg 800w\"\n       loading=\"lazy\" decoding=\"async\">\n</picture>",
          mark: [5, 6, 8],
          note: "`sizes` and `width`/`height` live on the `<img>`; the `<source>`s only offer formats. AVIF is usually smallest, WebP next, JPEG the fallback. Lazy is right here: a card below the fold, not the hero.",
        },
        { t: "say", h: "width and height are a CLS fix", x: "The browser turns the `width` and `height` attributes into an `aspect-ratio` before the image loads. With CSS `width: 100%; height: auto` the box is reserved at the right height. Without them it's 0 px tall until it arrives, then shoves everything down." },
        {
          t: "table",
          head: ["font-display", "Blocks text for", "Then", "Use it for"],
          rows: [
            ["`block`", "up to ~3 s, invisible", "swaps whenever it arrives", "icon fonts only"],
            ["`swap`", "~0, fallback at once", "swaps whenever it arrives, however late", "brand fonts you must show"],
            ["`fallback`", "~100 ms", "swaps only within ~3 s", "body text"],
            ["`optional`", "~100 ms", "uses it only if it's already here, else next visit", "the fastest, zero-shift choice"],
          ],
        },
        {
          t: "code",
          lang: "css",
          src: "/* a fallback face shaped like the web font, so the swap moves nothing */\n@font-face {\n  font-family: \"Brand Fallback\";\n  src: local(\"Arial\");\n  size-adjust: 104%;        /* match average glyph width */\n  ascent-override: 92%;     /* match line box above the baseline */\n  descent-override: 24%;\n  line-gap-override: 0%;\n}\nbody { font-family: \"Brand\", \"Brand Fallback\", sans-serif; }",
          mark: [5, 6],
          note: "The numbers here are illustrative: compute real ones from both fonts' metrics. `next/font` and tools like Fontaine and Capsize generate them for you.",
        },
        {
          t: "pitfall",
          h: "Preloading a font without crossorigin downloads it twice",
          x: "Fonts are always fetched in CORS mode, even same-origin. `<link rel=\"preload\" as=\"font\" href=\"/brand.woff2\">` without `crossorigin` fetches it once in the wrong mode, then the real request misses that copy and downloads again. Preload one or two fonts, never the whole family.",
        },
        {
          t: "quiz",
          q: "Your LCP element is a headline. LCP is 3.4 s, the HTML and CSS arrive by 0.9 s, and the font file by 3.3 s. What is LCP waiting for?",
          options: ["The image CDN", "The web font: with `block` or no `font-display`, text stays invisible until it loads, so it paints late", "Layout of the whole page", "JavaScript hydration"],
          answer: 1,
          why: "Invisible text isn't painted, so LCP can't fire until the font swaps in. `swap` or `optional` paints the fallback at once and LCP fires early; preload the font so the swap, if any, comes soon and moves little.",
        },
      ],
    },
    {
      title: "JavaScript cost and INP",
      beats: [
        { t: "say", x: "A kilobyte of JS costs more than a kilobyte of image. The image is decoded off the main thread; the JS is parsed, compiled and **executed** on it, while input waits. A mid-range Android phone does that several times slower than your laptop." },
        { t: "viz", name: "framebudget" },
        {
          t: "steps",
          h: "One interaction, three parts",
          items: [
            "**Input delay**: the click arrives while another task is running. It waits. Long tasks from hydration, timers or third parties live here.",
            "**Processing**: every listener for pointerdown, pointerup and click runs, yours and everyone else's.",
            "**Presentation delay**: style, layout and paint of whatever the handlers changed, until the frame is on screen.",
            "INP for that interaction is the sum. The page's INP is roughly its worst interaction.",
          ],
        },
        { t: "play", mode: "html", title: "INP, broken into its three parts", ...INP_PLAY, task: "Click A, then B: same work, very different INP. Tick \"busy page\" and click B a few times: now input delay dominates, and no handler fix can help." },
        {
          t: "predict",
          lang: "js",
          src: "button.onclick = () => {\n  spinner.hidden = false;      // show feedback\n  const r = heavyCompute();    // 400 ms\n  spinner.hidden = true;\n  render(r);\n};",
          q: "What does the user see during the 400 ms?",
          options: ["The spinner", "Nothing changes: the frame with the spinner can't be drawn until the handler returns", "A half-rendered result", "The spinner flickers"],
          answer: 1,
          why: "Rendering happens between tasks, not inside one. The spinner is shown and hidden in the same task, so it never reaches the screen. Show feedback, yield so a frame goes out, then do the work, ideally in chunks.",
        },
        {
          t: "pitfall",
          h: "Hydration makes the page look ready and act dead",
          x: "Server HTML paints fast, the user taps a menu, and nothing happens for 800 ms because the framework is still hydrating in one long task. That's input delay; the lab shows it only indirectly, as TBT. Split the bundle, hydrate less, or defer it. The splitting tools are in *Bundlers and Vite*.",
        },
        {
          t: "code",
          lang: "js",
          src: "// which scripts made the long frames? (Chromium: Long Animation Frames API)\nnew PerformanceObserver((list) => {\n  for (const frame of list.getEntries()) {\n    for (const s of frame.scripts) {\n      if (s.duration < 50) continue;\n      console.log(Math.round(s.duration), 'ms', s.invoker,\n        s.sourceURL, s.sourceFunctionName,\n        'forced layout', Math.round(s.forcedStyleAndLayoutDuration), 'ms');\n    }\n  }\n}).observe({ type: 'long-animation-frame', buffered: true });",
          mark: [6, 7],
          note: "`invoker` says how it started (`BUTTON#buy.onclick`, a timer, a promise). `sourceURL` names the guilty file, including third parties. The web-vitals INP attribution includes these entries.",
        },
        {
          t: "pitfall",
          h: "Third parties own your INP",
          x: "Tag managers, chat widgets and session replay add click listeners to the whole document. Their work runs inside *your* interactions. Load them after the page is interactive, use a facade (a static button that loads the chat widget on click), and audit them by `sourceURL` in LoAF data.",
        },
        { t: "say", x: "Yielding inside long work (`scheduler.yield()`, chunking by elapsed time) is covered in *JavaScript II: async and the event loop*. For INP the rule is simpler: the handler's job is to get the next frame out. Everything else can wait one frame." },
        {
          t: "quiz",
          q: "Typing in a search box has INP 450 ms. Each keystroke filters 20,000 rows and re-renders the list. Which fix targets the right part?",
          options: ["Debounce the filtering and render only visible rows", "Make the input `type=\"search\"`", "Add `passive: true` to the listener", "Preload the data"],
          answer: 0,
          why: "Processing (filtering) and presentation (rendering 20,000 rows) are both inside every keystroke. Updating the input is instant; debounce the expensive part and virtualise the list. Passive only matters for scroll and touch.",
        },
      ],
    },
    {
      title: "Caches, bfcache and service workers",
      beats: [
        { t: "say", x: "HTTP caching rules, hashed immutable assets and `stale-while-revalidate` are in *What happens when you open a URL*. Two more caches decide how fast a *return* visit is, and both can be broken without you noticing." },
        { t: "say", h: "The back/forward cache", x: "Press Back and the browser can restore the previous page from memory, frozen with its JS heap intact: LCP is effectively instant. Chrome reports that a large share of navigations are back and forward, so losing bfcache is a big, silent regression." },
        {
          t: "predict",
          lang: "js",
          src: "// analytics: flush on exit\naddEventListener('unload', () => {\n  navigator.sendBeacon('/log', JSON.stringify(events));\n});",
          q: "The user clicks a product, then presses Back. What happens?",
          options: ["Instant restore from bfcache", "A full reload: `unload` listeners make the page ineligible for bfcache in most browsers", "The beacon is sent twice", "Nothing different"],
          answer: 1,
          why: "A page with an `unload` handler can't be safely frozen, so it's thrown away. Use `pagehide`. On restore, `pageshow` fires with `persisted: true`: refresh stale data there. DevTools Application > Back/forward cache tests it.",
        },
        {
          t: "pitfall",
          h: "A service worker can make navigations slower",
          x: "If a service worker controls the page, every navigation waits for it to start, which can take tens to hundreds of ms on a cold phone, before the network request even begins. If you only use it for offline, enable **navigation preload** so the request runs in parallel with the startup.",
        },
        {
          t: "pitfall",
          h: "skipWaiting mixes two deploys in one tab",
          x: "A new worker calling `skipWaiting()` takes over pages still running old HTML. Old JS then lazy-loads a chunk; the new worker deleted the old cache and returns 404: blank screen. Either keep old precaches until no client uses them, or ask the user to reload.",
        },
        {
          t: "quiz",
          q: "You shipped a buggy service worker that serves a broken cached `index.html` forever. Users can't reach the fix. What gets you out?",
          options: ["Change the HTML; the worker will notice", "Deploy a new `sw.js`: the browser re-checks it on navigation, bypassing the HTTP cache. Make it clean up and unregister, or send `Clear-Site-Data: \"storage\"`", "Purge the CDN", "Rename the domain"],
          answer: 1,
          why: "The worker script itself is checked for updates on navigation (at least every 24 h) and its byte change triggers an install. That's your escape hatch. Keep the URL of `sw.js` stable forever, and have a kill-switch version ready before you need it.",
        },
      ],
    },
    {
      title: "Robustness: slow, flaky, offline",
      beats: [
        { t: "say", x: "Fast on your Wi-Fi is the easy case. The real product runs on a four-year-old Android phone on a train, against a server that sometimes stalls. Robustness is deciding, in code, what happens when each thing you depend on is slow or gone." },
        {
          t: "code",
          lang: "js",
          src: "async function getJSON(url, { timeout = 8000, signal } = {}) {\n  // fetch has no timeout of its own: a stalled request can hang for minutes\n  const s = signal\n    ? AbortSignal.any([signal, AbortSignal.timeout(timeout)])\n    : AbortSignal.timeout(timeout);\n  const res = await fetch(url, { signal: s });\n  if (!res.ok) throw Object.assign(new Error(res.status + ' ' + url), { status: res.status });\n  return res.json();\n}",
          mark: [2, 4],
          note: "`AbortSignal.timeout` rejects with a `TimeoutError`, a user cancel with an `AbortError`: tell them apart. `fetch` only rejects on network failure, so check `res.ok` yourself.",
        },
        { t: "play", mode: "js", title: "a thousand clients retry at once", js: RETRY_PLAY, task: "Fixed and plain exponential delays keep all 1000 in lockstep. Add \"equal jitter\" (half the delay fixed, half random), then halve CAP and compare." },
        {
          t: "pitfall",
          h: "Retrying a POST can charge a card twice",
          x: "The request reached the server, the response was lost, you retry: two orders. Retry only idempotent requests by default, and for the rest send an `Idempotency-Key` header the server stores and dedupes on. Never retry 4xx except 408 and 429; honour `Retry-After`.",
        },
        {
          t: "code",
          lang: "jsx",
          src: "class Boundary extends React.Component {\n  state = { error: null };\n  static getDerivedStateFromError(error) { return { error }; }\n  componentDidCatch(error, info) { report(error, info.componentStack); }\n  render() {\n    return this.state.error ? this.props.fallback : this.props.children;\n  }\n}\n\n// one broken widget, not one blank page\n<Boundary fallback={<p>Recommendations are unavailable.</p>}>\n  <Recommendations />\n</Boundary>",
          mark: [3, 11],
          note: "Boundaries catch errors thrown while rendering, not in event handlers, timers or promises. Those need try/catch, and a state update if the UI should change.",
        },
        {
          t: "table",
          head: ["Lie", "Truth"],
          rows: [
            ["`navigator.onLine === true` means online", "It means some network interface is up. Captive portals and dead Wi-Fi say true"],
            ["DevTools \"Fast 4G\" is a phone", "It throttles the network only. Add CPU throttling 4x-6x, or use a real mid-range Android"],
            ["The CDN is always up", "Block it in DevTools (Network > request blocking) and see what your page does"],
            ["Users wait for spinners", "After a few seconds of nothing, many leave. Show partial content first"],
          ],
        },
        {
          t: "quiz",
          q: "Your analytics script's CDN goes down and hangs every request for 30 s instead of failing. Which page is unaffected?",
          options: ["One that loads it with a classic `<script src>` in the head", "One that loads it with `async`, after the main content, wrapped so failures are ignored", "One that awaits its `init()` before rendering", "None, a hanging request blocks everything"],
          answer: 1,
          why: "A parser-blocking script in the head stalls the whole page until the timeout: a single point of failure you don't control. `async` and late-loaded third parties fail alone. Test this with request blocking.",
        },
      ],
    },
    {
      title: "From red to green",
      beats: [
        { t: "say", x: "Below is a page with one bug per vital, and a meter that measures it like the `web-vitals` library does. Run it, watch the numbers go red, then fix the page part of the code until all three are green. Reload with the run button after each change." },
        { t: "play", mode: "html", title: "the red page", ...RED_PAGE, task: "Wait for LCP and CLS, then click Add to cart for INP. Fix LCP first: it's mostly render delay. Note which of your fixes also moved CLS." },
        {
          t: "mission",
          h: "Take the red page to green",
          x: "Get LCP under 2.5 s, CLS under 0.1 and INP under 200 ms by changing only the page part. Then explain, for each fix, which sub-part or phase it removed: render delay, a layout shift window, or processing time.",
          hint: "The hero doesn't need JS to exist. The promo needs space before it arrives. The click needs a visible answer before the 600 ms of work, and the work needs a frame between them.",
          solution: {
            lang: "js",
            src: "// HTML: <main id=\"app\"><h1>Winter sale: 40% off every jacket</h1><p>...</p></main>\n// CSS:  #slot { min-height: 80px; }   reserve the promo's space\n\nconst busy = (ms) => { const t = performance.now(); while (performance.now() - t < ms) {} };\nconst afterPaint = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));\n\nsetTimeout(() => busy(1200), 3000); // the boot can stay; it no longer gates the hero\n\nsetTimeout(() => {\n  document.getElementById('slot').innerHTML = '<div class=\"promo\">Free shipping over 50</div>';\n}, 4800);\n\ndocument.getElementById('buy').onclick = async (e) => {\n  e.target.textContent = 'Added';   // visible answer first\n  await afterPaint();\n  busy(600);                        // the rest, after the frame\n};",
          },
        },
        {
          t: "mission",
          h: "Instrument a real site end to end",
          x: "Add the web-vitals attribution build to a site you run, send the beacons to a tiny endpoint, and after a week compute p75 per metric per page for touch vs mouse. Find the worst page's INP target and the LCP sub-part that dominates, and fix that one thing.",
          hint: "A table of (page, metric, value, device, target) rows is enough; p75 is one ORDER BY away. Throw away `navigationType: back-forward-cache` rows when you study cold-load LCP.",
        },
      ],
    },
  ],
  nobodyTells: [
    "Read the LCP breakdown before touching an image. Most slow LCPs are waiting to start, not downloading.",
    "Your laptop is the fastest device that will ever load your site. Profile with 4x-6x CPU throttling, or on a real budget Android.",
    "Analytics scripts that observe without `buffered: true` miss the metrics that happened before they loaded, which is most of them.",
    "One `unload` listener, often from a third-party script, can turn every Back press into a full reload.",
    "INP is usually a handler doing work before the UI answers. Paint the answer first, then do the work.",
    "Don't average performance numbers. Report p75 to match the field, p95 to find who you're losing.",
    "Keep `sw.js` at the same URL forever and have a kill-switch version written before the day you need it.",
    "Retries without jitter turn a five-second outage into a self-inflicted DDoS when the server comes back.",
  ],
  glossary: [
    ["LCP", "Largest Contentful Paint: when the biggest image or text block in the viewport painted. Good is 2.5 s or less."],
    ["INP", "Interaction to Next Paint: click, tap or key to the next frame, near-worst per visit. Good is 200 ms or less."],
    ["CLS", "Cumulative Layout Shift: the worst burst of unexpected layout shifts. Good is 0.1 or less."],
    ["p75", "The 75th percentile of visits. Core Web Vitals are judged there, per device class."],
    ["CrUX", "Chrome User Experience Report: field data from opted-in Chrome users, 28-day rolling."],
    ["RUM", "Real User Monitoring: collecting metrics from your own visitors' browsers."],
    ["TBT", "Total Blocking Time: the lab's sum of main-thread time over 50 ms per task. A load-time proxy for INP."],
    ["PerformanceObserver", "Delivers performance entries (LCP, shifts, events, long frames) to your code. Use buffered: true."],
    ["User Timing", "performance.mark() and measure(): your own named timestamps, shown in DevTools traces."],
    ["long animation frame", "A frame that took over 50 ms to produce. The LoAF entry names the scripts responsible."],
    ["fetchpriority", "A hint that raises or lowers a request's priority. high on the LCP image, nowhere else."],
    ["font-display", "What text does while a web font loads: invisible (block), fallback then swap, or optional."],
    ["bfcache", "Back/forward cache: a frozen, in-memory copy of the page restored instantly on Back."],
    ["idempotency key", "A client-made ID that lets the server dedupe a retried non-idempotent request."],
  ],
  explain: "Explain to a friend how you would find out why a page feels slow for real users: which three numbers you'd collect, how, and how you'd turn a bad LCP or INP into one specific fix.",
};
