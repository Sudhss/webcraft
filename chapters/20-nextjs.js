const COST_PLAY = `// A toy cost model for one page. Times in ms. Change an input, run again.
const edgeRtt = 40;     // round trip to the nearest CDN edge
const originRtt = 120;  // round trip to your server
const query = 300;      // the slowest data fetch the page needs
const render = 30;      // server render time
const js = 250;         // download, parse and run the client JS
const paint = 20;       // HTML in hand to pixels on screen
const perMinute = 1000; // requests per minute for this page
const revalidate = 60;  // ISR window, seconds

const perHour = perMinute * 60;
const server = originRtt + query + render; // a full blocking server render
const isr = Math.min(perHour, 3600 / revalidate);

const plans = [
  // name, TTFB, content painted, server renders/h, DB queries/h
  ["CSR", edgeRtt, edgeRtt + js + originRtt + query + paint, 0, perHour],
  ["SSR", server, server + paint, perHour, perHour],
  ["Streaming SSR", originRtt + render, server + paint, perHour, perHour],
  ["SSG", edgeRtt, edgeRtt + paint, 0, 0],
  ["ISR", edgeRtt, edgeRtt + paint, isr, isr],
  ["Static shell", edgeRtt, server + paint, perHour, perHour], // the hole renders per request
];

const col = (v, w) => String(Math.round(v)).padStart(w);
console.log("strategy".padEnd(14), "TTFB".padStart(5), "content".padStart(8), "renders/h".padStart(10), "queries/h".padStart(10));
for (const [n, ttfb, content, renders, queries] of plans)
  console.log(n.padEnd(14), col(ttfb, 5), col(content, 8), col(renders, 10), col(queries, 10));`;

const CROSS_PLAY = `// React's rules for props that cross from a Server to a Client Component, simplified.
function canCross(v, path) {
  path = path || "prop";
  const t = typeof v;
  if (v === null || ["string", "number", "bigint", "boolean", "undefined"].includes(t)) return "ok";
  if (t === "symbol") return Symbol.keyFor(v) !== undefined ? "ok" : path + ": unregistered symbol";
  if (t === "function") return v.isServerFunction ? "ok, sent as a reference" : path + ": plain function";
  if (v instanceof Promise) return "ok, streams when it resolves";
  if (v instanceof Date || v instanceof ArrayBuffer || ArrayBuffer.isView(v)) return "ok";
  const proto = Object.getPrototypeOf(v);
  const kids = Array.isArray(v) ? v.map((x, i) => [i, x])
    : v instanceof Map ? [...v].flat().map((x, i) => [i, x])
    : v instanceof Set ? [...v].map((x, i) => [i, x])
    : proto === Object.prototype ? Object.entries(v)
    : null;
  if (!kids) return path + ": " + (proto ? "instance of " + proto.constructor.name : "null-prototype object");
  for (const [k, x] of kids) {
    const r = canCross(x, path + "." + k);
    if (!r.startsWith("ok")) return r;
  }
  return "ok";
}

class User {
  constructor(id, email, passwordHash) { this.id = id; this.email = email; this.passwordHash = passwordHash; }
}
const save = async (v) => {};
const action = async (v) => {};
action.isServerFunction = true; // what 'use server' gives you

const cases = {
  "plain object": { id: 7, tags: ["a", "b"] },
  "Date": new Date(0),
  "Map": new Map([["k", 1]]),
  "BigInt": 10n,
  "Symbol.for": Symbol.for("x"),
  "Symbol()": Symbol("x"),
  "ORM row": new User(7, "a@b.test", "$2b$..."),
  "nested row": { author: new User(7, "a@b.test", "$2b$...") },
  "callback": save,
  "Server Function": action,
  "URL": new URL("https://x.test"),
  "Object.create(null)": Object.create(null),
};
for (const [k, v] of Object.entries(cases)) console.log(k.padEnd(20), canCross(v));`;

export default {
  id: "nextjs",
  n: 20,
  part: "D",
  title: "Next.js and rendering strategies",
  hook: "Every rendering strategy is a bill: who renders, when, and how often. Read the bill and Next.js stops surprising you.",
  minutes: 95,
  levels: ["use", "understand"],
  sections: [
    {
      title: "Rendering is a cost model",
      beats: [
        { t: "say", x: "Every rendering strategy answers one question: **when is the HTML made, and how many times?** Once at build, once per time window, once per request, or never on the server. TTFB, LCP and the server bill all fall out of that answer." },
        {
          t: "table",
          head: ["Strategy", "HTML is made", "TTFB", "Content paint, server cost"],
          rows: [
            ["CSR", "In the browser, after the JS runs", "One edge hop: a static shell", "Late: JS first, then a data round trip. No server render, but the API still queries"],
            ["SSR", "On every request", "Origin trip + slowest query + render", "Right at TTFB. CPU and queries per request; nothing to cache"],
            ["SSG", "Once, at build", "One edge hop", "Right at TTFB. Zero runtime CPU. Stale until the next build"],
            ["ISR", "At build, then once per window", "One edge hop, even when stale", "Like SSG; at most one render per window per page, per cache"],
            ["Streaming SSR", "Per request, flushed in pieces", "Origin trip + shell render", "Shell early, slow parts as they resolve. SSR's CPU"],
            ["Static shell (PPR)", "Shell at build, holes per request", "One edge hop for the shell", "Shell at once, holes as they resolve. CPU for the holes only"],
          ],
          caption: "A cache hit costs one edge round trip. A miss costs your slowest query plus render time. The whole table is that sentence, six ways.",
        },
        {
          t: "viz",
          name: "frames",
          props: {
            cols: ["CSR", "SSR, blocking", "Static shell + streaming"],
            frames: [
              { cells: [["GET /products"], ["GET /products"], ["GET /products"]], note: "Toy network: CDN edge 40 ms round trip, origin 120 ms, a 300 ms query, 30 ms render, 250 ms to load and run the JS." },
              { cells: [["HTML from CDN: `<div id=root>`", "screen: blank"], ["origin waiting on the query"], ["shell from CDN: nav, filters, skeleton", "screen: nav + skeleton"]], note: "t = 40 ms. Both cached responses are here: TTFB is one edge round trip. The SSR origin can't send a byte until its query returns." },
              { cells: [["JS ran: `fetch('/api/products')`", "screen: blank"], ["origin waiting on the query"], ["shell hydrated: filters work", "screen: nav + skeleton"]], note: "t = 290 ms. CSR's JS only now asks for data. The shell's JS already hydrated, so its controls respond." },
              { cells: [["waiting on the API"], ["first byte: full HTML", "screen: products"], ["hole streams in", "screen: products"]], note: "t = 450 ms = 120 + 300 + 30. The SSR page and the streamed hole cost the same server work, but the shell user has had a page for 400 ms." },
              { cells: [["waiting on the API"], ["hydrated: clicks work"], ["cart hydrated"]], note: "t = 700 ms. SSR hydrates. Until now its buttons were a picture of buttons." },
              { cells: [["data in, rendered", "screen: products"], ["interactive"], ["interactive"]], note: "t = 730 ms. CSR paints last: JS, then data, in series. Server rendering exists to kill that waterfall." },
            ],
          },
        },
        {
          t: "predict",
          lang: "text",
          src: "Product page, same HTML for every visitor.\n1,000 requests per minute, one server.\n(a) SSR on every request\n(b) ISR, revalidate window 60 s",
          q: "About how many server renders per hour, (a) vs (b)?",
          options: ["60,000 vs 60,000", "60,000 vs about 60", "1,000 vs 1", "60 vs 1"],
          answer: 1,
          why: "SSR renders per request: 1,000 x 60. ISR serves the cached page and regenerates at most once per window that sees traffic: about 60. Each server or region keeps its own cache, so multiply by caches, not requests.",
        },
        {
          t: "play",
          mode: "js",
          title: "the bill, per strategy",
          js: COST_PLAY,
          task: "Set `query` to 1500: which TTFBs move? Then set `perMinute` to 1. When does ISR stop saving renders, and which strategy still queries the DB on every visit?",
        },
        {
          t: "pitfall",
          h: "Blocking SSR makes TTFB your slowest await",
          x: "A 2 s call in the root layout gives every page a 2 s TTFB and a blank tab, which feels worse than CSR's spinner. SSR moved the query; it didn't make it faster. Cache it, or stream it behind `<Suspense>` so the rest of the page can flush.",
        },
      ],
    },
    {
      title: "Hydration: the page runs twice",
      beats: [
        { t: "say", x: "Server HTML is a picture of your app. **Hydration** makes it live: the browser downloads the JS for every client component, runs them again, and attaches handlers to the DOM that's already there. Until then, buttons look ready and do nothing." },
        { t: "say", x: "So the two renders must agree. When text or structure differs, React 18 and later discard the server HTML up to the nearest `<Suspense>` boundary and render that part again in the browser. You paid for SSR and got CSR." },
        {
          t: "predict",
          lang: "jsx",
          src: "'use client'\nexport function Stamp() {\n  return <p>Rendered at {new Date().toLocaleTimeString()}</p>\n}\n// the server renders it at 10:00:00.950\n// the browser hydrates it at 10:00:01.300",
          q: "What happens?",
          options: ["Nothing: React keeps the server's text", "A hydration mismatch: React reports it and re-renders that part on the client", "The text quietly updates to :01", "The build fails"],
          answer: 1,
          why: "Server says 10:00:00, client says 10:00:01: a mismatch, so React re-renders up to the nearest Suspense boundary. Locally it passes when both land in the same second. On a UTC server it fails for every other timezone.",
        },
        {
          t: "table",
          head: ["Cause", "Why the two renders differ", "Fix"],
          rows: [
            ["`new Date()`, `toLocaleString()`", "Two clocks, two timezones, two locales", "Render a value from the server; format for the user in an effect"],
            ["`Math.random()` for ids or keys", "Two different draws", "`useId()` for ids; generate on the server and pass as props"],
            ["`typeof window`, `localStorage`, `matchMedia`", "They don't exist on the server", "Neutral first render, then read them in `useEffect`"],
            ["`<div>` in `<p>`, `<a>` in `<a>`", "The HTML parser repairs it; React's tree doesn't", "Fix the markup"],
            ["Browser extensions", "They edit the DOM before React hydrates", "Nothing in your code; reproduce in a clean profile"],
            ["CDN HTML rewriting, iOS phone links", "Something edited the HTML after your server sent it", "Turn off the rewrite; add the `format-detection` meta tag"],
          ],
        },
        {
          t: "compare",
          a: { label: "Mismatch for every dark-mode user", lang: "jsx", src: "'use client'\nexport function ThemeLabel() {\n  const theme = typeof window === 'undefined'\n    ? 'light'\n    : localStorage.getItem('theme')\n  return <span>{theme}</span>\n}" },
          b: { label: "Same first render, then correct", lang: "jsx", src: "'use client'\nimport { useEffect, useState } from 'react'\n\nexport function ThemeLabel() {\n  const [theme, setTheme] = useState(null)\n  useEffect(() => setTheme(localStorage.getItem('theme')), [])\n  return <span>{theme ?? ''}</span>\n}" },
          x: "Left: the server renders `light`, a dark-mode browser renders `dark` on its first pass. Right: both first renders agree, then an effect fixes it, one extra render. For a theme class, an inline `<head>` script beats both.",
        },
        {
          t: "pitfall",
          h: "suppressHydrationWarning hides, it doesn't fix",
          x: "It silences one element's own text and attributes, one level deep, and React won't patch that text: the server's value stays on screen. Fine for a timestamp an effect overwrites. It does nothing for the element's children.",
        },
      ],
    },
    {
      title: "Server Components are not SSR",
      beats: [
        { t: "say", x: "In the App Router, components are **Server Components** by default. They run only on the server, can `await` your database, and send zero JavaScript to the browser. They can't use state, effects or event handlers." },
        {
          t: "code",
          lang: "jsx",
          src: "// app/post/[id]/page.jsx: a Server Component (no directive)\nimport { db } from '@/lib/db'\nimport LikeButton from './like-button'\n\nexport default async function Page({ params }) {\n  const { id } = await params          // params is a Promise: await it\n  const post = await db.post.find(id)  // runs on the server, never bundled\n  return (\n    <article>\n      <h1>{post.title}</h1>\n      <LikeButton postId={post.id} initial={post.likes} />\n    </article>\n  )\n}\n\n// app/post/[id]/like-button.jsx\n'use client'\nimport { useState } from 'react'\n\nexport default function LikeButton({ postId, initial }) {\n  const [n, setN] = useState(initial)\n  return <button onClick={() => setN(n + 1)}>{n} likes</button>\n}",
          mark: [17],
          note: "`'use client'` marks a boundary in the **module graph**: that file and everything it imports ship to the browser. The page, `db` and the query stay on the server.",
        },
        {
          t: "viz",
          name: "frames",
          props: {
            cols: ["Server", "Sent to the browser", "Browser"],
            frames: [
              { cells: [["`Page()` runs", "`await db.post.find(7)`"], [], []], note: "A request for /post/7. `Page` is a Server Component: it awaits the database like any async function." },
              { cells: [["`Page` returned its tree"], ["RSC payload: `<h1>Hello</h1>`", "slot: LikeButton, chunk 3a1f, props `{ postId: 7, initial: 42 }`"], []], note: "Server Components become their output. A Client Component becomes a reference: which chunk to load, plus its serialized props." },
              { cells: [["SSR: run `LikeButton` once, to HTML"], ["HTML: `<h1>Hello</h1><button>42 likes</button>`", "RSC payload, inlined"], []], note: "First load only: the server also runs the Client Components to HTML. That pass is SSR, a separate step from RSC." },
              { cells: [[], [], ["paint the HTML", "download chunk 3a1f only"]], note: "The browser paints the HTML, then downloads JS for the client pieces only. `Page` and the db driver never ship." },
              { cells: [[], [], ["hydrate `LikeButton` with `{ postId: 7, initial: 42 }`", "clicks work"]], note: "Hydration runs `LikeButton` with props from the payload. The `<h1>` has no JS at all, so there is nothing to hydrate." },
              { cells: [["`Page()` runs for /post/8"], ["RSC payload only, no HTML"], ["React merges the new tree", "shared layouts keep their state"]], note: "A client navigation fetches only a payload, no HTML. React reconciles it into the live tree." },
            ],
          },
        },
        {
          t: "predict",
          lang: "jsx",
          src: "// components/price.jsx   (no directive)\nexport function Price({ cents }) {\n  return <span>{(cents / 100).toFixed(2)}</span>\n}\n\n// app/cart/cart-panel.jsx\n'use client'\nimport { Price } from '@/components/price'\nexport function CartPanel({ items }) {\n  return items.map((i) => <Price key={i.id} cents={i.cents} />)\n}",
          q: "`price.jsx` has no directive. Where does `Price` run when `CartPanel` renders it?",
          options: ["Server only: no directive means Server Component", "In the client bundle (and in SSR): it's imported by a client module", "It throws: a client module can't import a component without a directive"],
          answer: 1,
          why: "Server or client is decided by **usage**, not by the file. Imported from a `'use client'` module, `Price` is a Client Component and ships in that bundle. Rendered from a page, the same file is a Server Component.",
        },
        {
          t: "predict",
          lang: "jsx",
          src: "// page.jsx, a Server Component; Profile is 'use client'\nconst user = await orm.user.find(id)   // returns a User class instance\nreturn (\n  <Profile\n    user={user}\n    since={new Date(user.createdAt)}\n    onSave={(v) => orm.user.update(id, v)}\n  />\n)",
          q: "Which props fail to cross the boundary?",
          options: ["Only `since`: a Date can't be serialized", "`user` and `onSave`", "Only `onSave`", "None: React serializes anything"],
          answer: 1,
          why: "Dates, Maps, Sets, plain objects, promises, JSX and `'use server'` functions cross. Class instances and ordinary functions don't. Pass `user` as a plain object and make `onSave` a Server Action that checks auth.",
        },
        {
          t: "play",
          mode: "js",
          title: "what crosses the boundary",
          js: CROSS_PLAY,
          task: "Predict each line before you run it. Then write `toDTO(user)` that turns the `User` into something that crosses, keeping only the fields a profile card shows.",
        },
        {
          t: "pitfall",
          h: "Every prop is published",
          x: "Pass a plain DB row to a Client Component and the whole row is serialized into the page: email, `passwordHash`, internal flags, readable in view-source. A client component's props are a public API. Pass a DTO with exactly the fields it renders.",
        },
        {
          t: "quiz",
          q: "What separates a Server Component from plain SSR?",
          options: ["Nothing, it's SSR renamed", "SSR turns components into HTML and still ships their JS to hydrate. A Server Component's code never ships, and its output also serves client navigations", "Server Components only render at build time", "Server Components need the edge runtime"],
          answer: 1,
          why: "SSR is about the first HTML: every SSR'd component still downloads and runs again in the browser. RSC keeps server-only components off the client entirely. Next.js does both: RSC for the tree, SSR for the client parts on first load.",
        },
      ],
    },
    {
      title: "The App Router",
      beats: [
        { t: "say", x: "The file system is the router. A folder is a URL segment, and a few reserved file names decide what renders in it. A folder without a `page` or `route` file isn't a route, so components can live next to the pages that use them." },
        {
          t: "code",
          lang: "text",
          src: "app/\n  layout.jsx               root layout: <html>, <body>\n  (marketing)/             route group: organises, adds nothing to the URL\n    page.jsx               /\n    pricing/page.jsx       /pricing\n  (app)/\n    layout.jsx             shell for the logged-in area\n    dashboard/\n      loading.jsx          <Suspense> fallback around the page\n      error.jsx            error boundary ('use client')\n      page.jsx             /dashboard\n    posts/[id]/page.jsx    /posts/7       params: Promise<{ id: '7' }>\n    docs/[...slug]/page.jsx  /docs/a/b    params: Promise<{ slug: ['a', 'b'] }>",
          note: "Layouts wrap their children and survive navigation between them: no re-render, client state kept. Dynamic `params` arrive as a Promise; await them.",
        },
        {
          t: "steps",
          h: "What wraps /dashboard, outside in",
          items: [
            "`app/layout.jsx`: the root layout, which owns `<html>` and `<body>`.",
            "`(app)/layout.jsx`: the group's shell. The group name never reaches the URL.",
            "`dashboard/layout.jsx`, if there is one. Nothing inside it can catch its errors.",
            "`dashboard/error.jsx`: an error boundary, and so a Client Component.",
            "`dashboard/loading.jsx`: the `<Suspense>` fallback.",
            "`dashboard/page.jsx`: the leaf that renders the route.",
          ],
        },
        {
          t: "quiz",
          q: "`dashboard/layout.jsx` throws while rendering. Which boundary catches it?",
          options: ["`dashboard/error.jsx`", "The nearest `error.jsx` above it, or `global-error.jsx` at the root", "None: a layout error always crashes the app"],
          answer: 1,
          why: "A segment's `error.jsx` sits inside that segment's layout, so it can't catch the layout. The error bubbles to the parent segment's boundary; for the root layout that's `global-error.jsx`, which renders its own `<html>` and `<body>`.",
        },
        {
          t: "pitfall",
          h: "The loading.jsx that never shows",
          x: "The fallback lives inside the segment's layout. If that layout awaits slow data, nothing streams until it resolves, fallback included. Keep layouts cheap: pass the promise down and await it in the page, or behind a `<Suspense>` of its own.",
        },
        {
          t: "pitfall",
          h: "Two root layouts, one full reload",
          x: "Route groups let `(shop)` and `(marketing)` each own a root layout. Navigating between them is a full page load: client state gone, all JS evaluated again. Right for two genuinely separate apps, a nasty surprise if you only wanted different headers.",
        },
      ],
    },
    {
      title: "Caching in Next.js 16: two models",
      beats: [
        { t: "say", h: "Which Next.js this is", x: "This chapter describes **Next.js 16** (16.3 at the time of writing). Caching changed in every major since 13, so check which model a codebase uses before you trust any answer about it, this chapter included." },
        { t: "say", x: "16 has two models. With `cacheComponents: true`, nothing is cached unless you write `'use cache'`; Next.js says this becomes the default in a future major. Without the flag you get the **previous model**, where `fetch` options and route exports decide." },
        {
          t: "code",
          lang: "js",
          src: "// next.config.ts\nexport default { cacheComponents: true }\n\n// app/lib/posts.ts\nimport { cacheLife, cacheTag } from 'next/cache'\n\nexport async function getPosts(authorId) {\n  'use cache'\n  cacheLife('hours')   // stale 5 min, revalidate 1 h, expire 1 day\n  cacheTag('posts')    // a name to invalidate it by, later\n  return db.post.findMany({ where: { authorId } })\n}",
          mark: [8],
          note: "The key is the build ID, the function's ID and its serialized arguments, closed-over variables included. `authorId` 7 and 8 get separate entries. A new deploy starts every entry cold.",
        },
        {
          t: "predict",
          lang: "jsx",
          src: "// cacheComponents: true\nexport default async function Page() {\n  const res = await fetch('https://api.test/prices')\n  const prices = await res.json()\n  return <PriceTable prices={prices} />\n}",
          q: "Cached or not, and what does Next.js do about it?",
          options: ["Cached at build, prices frozen in the HTML", "Cached for 15 minutes by default", "Uncached, and flagged: uncached data outside `<Suspense>` blocks the page, so cache it or wrap it", "Uncached, rendered per request, no complaint"],
          answer: 2,
          why: "Under Cache Components `fetch` is uncached and runs per request. Awaited outside `<Suspense>` it would hold the whole page until it returns, so Next.js makes you choose: `'use cache'` it, or put it behind a fallback.",
        },
        {
          t: "predict",
          lang: "jsx",
          src: "// no cacheComponents: the previous model\nexport default async function Page() {\n  const res = await fetch('https://api.test/prices') // no cache option\n  const prices = await res.json()\n  return <PriceTable prices={prices} />\n}",
          q: "`fetch` isn't cached by default in this model either. How fresh are the prices a visitor sees after `next build`?",
          options: ["Fresh on every request", "Frozen at build time, until the next build", "Refreshed every 15 minutes"],
          answer: 1,
          why: "Not caching the fetch doesn't make the page dynamic. With no request-time API in sight, the route is prerendered at `next build` and the fetch runs once, inside that. `cookies()`, `connection()` or a `revalidate` export change that.",
        },
        {
          t: "table",
          head: ["Question", "Previous model (flag off)", "Cache Components (flag on)"],
          rows: [
            ["Is `fetch` cached?", "No, unless `cache: 'force-cache'`", "No, unless it runs inside `'use cache'`"],
            ["A page with no request data", "Prerendered at build, fetches frozen in", "The static shell; uncached work must be cached or wrapped"],
            ["Reading `cookies()`", "Makes the whole route dynamic", "Makes only its `<Suspense>` boundary dynamic"],
            ["Time-based refresh", "`export const revalidate = 60`, `next.revalidate`", "`cacheLife('minutes')` or a custom profile"],
            ["`dynamic`, `revalidate`, `fetchCache` exports", "Supported", "Errors: replaced by `'use cache'` and `cacheLife`"],
            ["Where entries live", "Data Cache, which survives deploys", "In memory per instance; `'use cache: remote'` to share"],
            ["`GET` route handlers", "Dynamic unless `dynamic = 'force-static'`", "Prerendered like pages when they read no request data"],
          ],
        },
      ],
    },
    {
      title: "The static shell",
      beats: [
        { t: "say", x: "With Cache Components, `next build` renders each route as far as it can. Plain markup and `'use cache'` output form the **static shell**, served from a CDN. Each `<Suspense>` around uncached or request data leaves a hole that streams in per request." },
        {
          t: "code",
          lang: "jsx",
          src: "import { Suspense } from 'react'\nimport { cookies } from 'next/headers'\n\nexport default function Page() {\n  return (\n    <>\n      <Header />                            {/* plain markup: in the shell */}\n      <PostList />                          {/* 'use cache' inside: in the shell */}\n      <Suspense fallback={<CartSkeleton />}>\n        <Cart />                            {/* reads a cookie: a hole */}\n      </Suspense>\n    </>\n  )\n}\n\nasync function Cart() {\n  const id = (await cookies()).get('cart')?.value\n  return <CartView items={await getCart(id)} />\n}",
          mark: [9, 10, 11],
          note: "This is Partial Prerendering. In the previous model one `cookies()` call made the whole route dynamic; here it costs only its own boundary, and the header and posts still come from the CDN.",
        },
        {
          t: "predict",
          lang: "jsx",
          src: "// cacheComponents: true, in a layout's footer\nexport function Footer() {\n  return <p>Copyright {new Date().getFullYear()}</p>\n}",
          q: "What does `next build` do?",
          options: ["Bakes this year into the shell", "Fails: reading the clock during prerender must be explicit", "Renders the footer on every request", "Moves the footer to the client"],
          answer: 1,
          why: "A clock read during prerender goes stale silently, so Cache Components refuses to guess. `'use cache'` shares one value until revalidation; `connection()` behind `<Suspense>` makes it per request. `Math.random()` gets the same treatment.",
        },
        {
          t: "pitfall",
          h: "'use cache' on serverless is mostly a miss",
          x: "The default store is in memory, per instance. Serverless instances are short-lived, so runtime entries rarely survive to the next request; only the build-time shell is reliably cached. For a shared hit rate use `'use cache: remote'` with a cache handler, and pay a network hop per lookup.",
        },
        {
          t: "pitfall",
          h: "Request data inside a cache passes build, fails live",
          x: "Calling `cookies()` or `headers()` anywhere under a `'use cache'` scope, even in a helper, throws. On a dynamic route that happens at request time, so `next build` passes and production breaks. Read request data outside and pass the value in; it joins the key.",
        },
      ],
    },
    {
      title: "Revalidation and Server Actions",
      beats: [
        { t: "say", h: "Time-based", x: "`cacheLife` sets three clocks. `stale`: how long the browser reuses an entry without asking. `revalidate`: after this, serve stale and refresh in the background. `expire`: after this with no traffic, the next request waits for fresh data." },
        {
          t: "table",
          head: ["On-demand call", "The next read", "Callable from"],
          rows: [
            ["`updateTag('posts')`", "Waits for fresh data: you see your own write", "Server Actions only"],
            ["`revalidateTag('posts', 'max')`", "Served stale while a refresh runs in the background", "Server Actions, route handlers"],
            ["`revalidateTag('posts', { expire: 0 })`", "Waits for fresh data", "Server Actions, route handlers (webhooks)"],
            ["`revalidatePath('/posts')`", "That path's cached data is invalidated", "Server Actions, route handlers"],
            ["`refresh()`", "Re-renders the current page; caches untouched", "Server Actions"],
          ],
          caption: "`revalidateTag` with one argument is deprecated; for now it behaves like `{ expire: 0 }`.",
        },
        {
          t: "predict",
          lang: "js",
          src: "'use server'\nexport async function createPost(formData) {\n  const user = await requireUser()\n  await db.post.create({ data: { title: formData.get('title'), authorId: user.id } })\n  revalidateTag('posts', 'max')\n}\n// the current page lists posts from a 'use cache' function tagged 'posts'",
          q: "Does the action's response show the author their new post?",
          options: ["Yes: revalidating re-renders the page in the same response", "No: `'max'` is stale-while-revalidate and skips the re-render. `updateTag('posts')` would show it", "Only after a hard reload"],
          answer: 1,
          why: "With a profile, `revalidateTag` marks the tag stale: the next read gets the old list while a refresh runs, and the response carries no re-render. `updateTag` expires the tag, so the re-render in the same response waits for fresh data.",
        },
        { t: "say", h: "Server Actions are POST endpoints", x: "`'use server'` swaps the function in the client bundle for an ID plus a dispatcher that POSTs to the current page. Anyone who can send that POST can call it, with any arguments, whether or not your UI shows the button." },
        {
          t: "compare",
          a: { label: "Trusts the page's login check", lang: "js", src: "'use server'\n// the admin page checked isAdmin before rendering this form\nexport async function deleteUser(id) {\n  await db.user.delete({ where: { id } })\n}" },
          b: { label: "Checks inside, on every call", lang: "js", src: "'use server'\nimport { z } from 'zod'\n\nexport async function deleteUser(rawId) {\n  const me = await auth()\n  if (!me?.isAdmin) throw new Error('Forbidden')\n  const id = z.string().uuid().parse(rawId)\n  await db.user.delete({ where: { id } })\n  return { ok: true }   // not the deleted row\n}" },
          x: "The page check decides which UI renders; the action is a separate door. Authenticate, authorize this specific resource, validate the input, and return only what the UI needs.",
        },
        {
          t: "steps",
          h: "What Next.js does for you, and what it doesn't",
          items: [
            "Only `POST` can invoke an action, and its `Origin` must match `Host` or `X-Forwarded-Host`. That blocks most CSRF.",
            "Action IDs are encrypted and rotate between builds. Unused actions are stripped and get no endpoint.",
            "Variables an inline action closes over are encrypted before they reach the client.",
            "Bodies are capped at 1 MB unless you raise `serverActions.bodySizeLimit`.",
            "Nothing here checks who is calling. That's yours, in every action.",
          ],
        },
        {
          t: "pitfall",
          h: "Proxy auth doesn't follow a moved action",
          x: "An action is a POST to the page that uses it, so it passes through `proxy.ts` only if that page's path matches. Move the form to a route your matcher excludes and the check vanishes, silently. Authorize inside the action, always.",
        },
        {
          t: "predict",
          lang: "js",
          src: "// in a Client Component; each Server Action takes ~300 ms on the server\nawait Promise.all([saveTitle(t), saveBody(b), saveTags(tags)])",
          q: "About how long until all three resolve?",
          options: ["~300 ms: they run in parallel", "~900 ms: the client dispatches actions one at a time", "It depends on the server's thread count"],
          answer: 1,
          why: "Next.js queues Server Actions per client so each re-render matches the result that caused it. For parallel work, do it inside one action, fetch in a Server Component, or call a route handler.",
        },
        {
          t: "mission",
          h: "Attack your own Server Actions",
          x: "List every `'use server'` export. Trigger one, find its POST in DevTools, copy it as cURL, and replay it logged out, as another user, and with someone else's id. For any that succeed: add auth, an ownership check and input validation, and trim the return value.",
          hint: "An action that takes a whole object from the client (`item`, not `itemId`) is a red flag. Re-read the row on the server, scoped to the session's user.",
        },
      ],
    },
    {
      title: "Route handlers, proxy and runtimes",
      beats: [
        {
          t: "code",
          lang: "js",
          src: "// app/api/products/route.js   ->   GET and POST /api/products\nimport { cacheLife } from 'next/cache'\n\nexport async function GET() {\n  return Response.json(await getProducts())\n}\n\nasync function getProducts() {\n  'use cache'                      // not allowed on GET itself\n  cacheLife('hours')\n  return db.product.findMany()\n}\n\nexport async function POST(request) {\n  await requireAdmin(request)\n  const input = ProductSchema.parse(await request.json())\n  return Response.json(await db.product.create({ data: input }), { status: 201 })\n}",
          note: "Standard `Request` in, `Response` out. Without Cache Components a `GET` handler runs per request unless you export `dynamic = 'force-static'`; with them it prerenders when it reads no request data.",
        },
        {
          t: "quiz",
          q: "A mobile app and a partner's backend need to create orders. What do you give them?",
          options: ["The Server Action: it's already an endpoint", "A route handler: a URL and contract you control. Action IDs are internal and change between builds", "Either, they're the same thing underneath"],
          answer: 1,
          why: "A Server Action is an RPC between your page and your server, addressed by an encrypted ID that rotates. Anything outside your own UI needs a stable method, path and body: a route handler you version and document.",
        },
        {
          t: "code",
          lang: "js",
          src: "// proxy.ts   (middleware.ts before Next.js 16)\nimport { NextResponse } from 'next/server'\n\nexport function proxy(request) {\n  if (!request.cookies.has('session')) {\n    return NextResponse.redirect(new URL('/login', request.url))\n  }\n  return NextResponse.next()\n}\n\nexport const config = {\n  matcher: ['/dashboard/:path*', '/settings/:path*'],\n}",
          mark: [12],
          note: "Runs before routing, on Node.js by default; a `runtime` export here throws. Good for cheap redirects and rewrites. A cookie's presence is not a session: verify it where the data is read.",
        },
        {
          t: "pitfall",
          h: "A proxy with no matcher guards your CSS too",
          x: "Without `matcher`, proxy runs on every request, `_next/static`, `_next/image` and `public/` files included. A logged-out redirect there also redirects the login page's own CSS and JS, so it loads unstyled. Match the paths you mean, or exclude assets with a negative lookahead.",
        },
        { t: "say", h: "Edge vs Node", x: "`export const runtime = 'edge'` is deprecated in Next.js 16, and Cache Components rejects it outright: routes render on Node.js. Speed from the edge now comes from what CDNs cache near users, static shells and hashed assets, not from running your render there." },
        {
          t: "predict",
          lang: "text",
          src: "User in Sydney.\nRender at an edge node in Sydney: 5 ms away.\nDatabase in Virginia: 200 ms round trip from Sydney.\nThe page runs 3 queries, one after another.",
          q: "About how long does the render spend waiting on data?",
          options: ["~15 ms", "~200 ms", "~600 ms"],
          answer: 2,
          why: "Every query crosses the Pacific: 3 x 200 ms. Rendering in Virginia costs the user one 200 ms trip plus three quick local queries. Compute goes next to data; caches go next to users.",
        },
      ],
    },
    {
      title: "Images, fonts, env and shipping",
      beats: [
        {
          t: "code",
          lang: "jsx",
          src: "import Image from 'next/image'\nimport hero from './hero.jpg'   // static import: known size, hashed URL, blur data\n\nexport function Hero() {\n  return (\n    <div style={{ position: 'relative', aspectRatio: '16 / 9' }}>\n      <Image\n        src={hero}\n        alt=\"Harbour at dawn\"\n        fill\n        sizes=\"(max-width: 768px) 100vw, 50vw\"\n        loading=\"eager\"\n        fetchPriority=\"high\"\n        placeholder=\"blur\"\n      />\n    </div>\n  )\n}",
          mark: [11, 12, 13],
          note: "`next/image` lazy-loads by default: right for every image except the LCP one. `priority` is deprecated in 16; mark the hero with `loading=\"eager\"` and `fetchPriority=\"high\"`.",
        },
        {
          t: "pitfall",
          h: "fill without sizes ships desktop pixels",
          x: "With no `sizes`, the browser assumes the image spans the viewport. A 300 px card on a 1440 px screen then downloads a file at least 1440 px wide: over 20 times the pixels it shows. Every `fill` or CSS-sized image needs a `sizes` that matches its layout.",
        },
        { t: "say", h: "Fonts", x: "`next/font` downloads Google Fonts at build and serves them from your own origin, so the browser never contacts Google: no extra DNS or TLS on the critical path. It also generates a size-adjusted fallback, so the swap to the web font barely moves the layout." },
        {
          t: "predict",
          lang: "js",
          src: "// built once:  NEXT_PUBLIC_API_URL=https://staging.api.test next build\n// the same image runs in prod with NEXT_PUBLIC_API_URL=https://api.test\n'use client'\nexport const api = (path) => fetch(process.env.NEXT_PUBLIC_API_URL + path)",
          q: "Which host does the browser call in production?",
          options: ["api.test: env is read at runtime", "staging.api.test: the value was inlined at build", "Neither: `process` doesn't exist in the browser"],
          answer: 1,
          why: "`NEXT_PUBLIC_` references are replaced with string literals during `next build`. Changing the container's env later changes nothing in the bundle. Build once per environment, or read config on the server per request and pass it down.",
        },
        {
          t: "pitfall",
          h: "Server env in a static page is build-time too",
          x: "`process.env.FLAG` in a prerendered page is read once, by `next build`. Flip it in production and nothing changes until the next build. If a value must be live, read it at request time: after `await connection()`, inside `<Suspense>`.",
        },
        {
          t: "table",
          head: ["Target", "You get", "You give up, or run yourself"],
          rows: [
            ["Vercel, a verified adapter", "Every feature, wired to its CDN and caches", "Some control over infrastructure and cost"],
            ["`next start`, or Docker with `output: 'standalone'`", "Every feature, on any Node host", "Cache storage, image optimization load, multi-instance config"],
            ["`output: 'export'`", "Plain files for any static host", "Server Actions, proxy, ISR, cookies, rewrites, the default image loader"],
            ["Other platforms' integrations", "Their CDN and runtime", "Feature support varies; test what you rely on"],
          ],
          caption: "Pick the target before the architecture: a static export can't run a single Server Action.",
        },
        {
          t: "pitfall",
          h: "Three instances, three caches, three keys",
          x: "Behind a load balancer each `next start` has its own in-memory cache and, unless you set one, its own action encryption key. Set `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` everywhere, add a shared cache handler if hit rate matters, and roll deploys.",
        },
        {
          t: "mission",
          h: "One page, four bills",
          x: "Build `/products` on a fake 300 ms query. Ship it as per-request SSR, as fully static, as a static shell with the cart behind `<Suspense>`, and with `'use cache'` plus `cacheLife('minutes')`. For each, record TTFB in DevTools and count query logs over 100 requests.",
          hint: "Fake the query with `await new Promise((r) => setTimeout(r, 300))` and a `console.log`. Measure on `next build && next start`: dev renders pages on demand, so prerendering never shows.",
          solution: {
            lang: "jsx",
            src: "// next.config.ts: { cacheComponents: true }\nimport { Suspense } from 'react'\nimport { cookies } from 'next/headers'\nimport { cacheLife } from 'next/cache'\n\nasync function slowQuery(label) {\n  console.log('query', label)\n  await new Promise((r) => setTimeout(r, 300))\n  return [{ id: 1, name: 'Mug' }, { id: 2, name: 'Lamp' }]\n}\n\nasync function Products() {\n  'use cache'\n  cacheLife('minutes')\n  const rows = await slowQuery('products')\n  return <ul>{rows.map((p) => <li key={p.id}>{p.name}</li>)}</ul>\n}\n\nasync function Cart() {\n  const id = (await cookies()).get('cart')?.value ?? 'none'\n  await slowQuery('cart ' + id)\n  return <p>Cart {id}</p>\n}\n\nexport default function Page() {\n  return (\n    <main>\n      <Products />\n      <Suspense fallback={<p>Loading cart...</p>}>\n        <Cart />\n      </Suspense>\n    </main>\n  )\n}",
          },
        },
      ],
    },
  ],
  nobodyTells: [
    "Uncached isn't dynamic. In the previous model, a page with an uncached fetch and no request data is still prerendered at build, the fetch frozen inside it.",
    "A Server Action is a public POST endpoint with a generated name. Check auth inside every one, even if the only button that calls it sits behind a login.",
    "Blocking SSR's TTFB is your slowest `await`. One slow call in a root layout taxes every page under it.",
    "`NEXT_PUBLIC_` values are baked in at build. One Docker image promoted from staging to prod carries staging's values into the browser.",
    "Hydration errors only some users see are usually browser extensions or HTML rewriting at the edge. Reproduce in a clean profile before touching code.",
    "With Cache Components, pages you leave are hidden with `<Activity>`, not unmounted: dropdowns stay open and form inputs survive going back and forth.",
    "Call each `next/font` function once, in a shared file, and import the result. Every call is hosted as its own font instance.",
    "Compute goes next to data, caches next to users. An edge render that makes three trips to a distant database loses to a boring origin render.",
  ],
  glossary: [
    ["CSR", "Client-side rendering: the server sends a shell; the browser runs JS, fetches data and builds the DOM."],
    ["SSR", "Rendering HTML on the server per request. Early paint; CPU and data latency on every request."],
    ["SSG", "Rendering HTML once at build time and serving it from a CDN."],
    ["ISR", "Static pages regenerated in the background after a time window or on demand, serving stale meanwhile."],
    ["streaming SSR", "Flushing HTML in pieces: the shell first, then each Suspense boundary as its data resolves."],
    ["hydration", "Running client components again in the browser over server HTML to attach state and event handlers."],
    ["Server Component", "Runs only on the server. Its output, not its code, is sent to the browser."],
    ["RSC payload", "The serialized Server Component tree, with chunk references and props for each Client Component."],
    ["use client", "Directive marking a module as a client entry point: it and its imports are bundled for the browser."],
    ["Server Action", "A `'use server'` function the client calls by POSTing an action ID. A public endpoint."],
    ["static shell", "A route's prerendered HTML: static and cached parts, plus Suspense fallbacks where dynamic holes go."],
    ["Partial Prerendering", "Serving a static shell at once and streaming request-time holes into it."],
    ["cacheLife", "Sets a cached entry's stale, revalidate and expire times under Cache Components."],
    ["proxy", "Next.js 16's name for middleware: `proxy.ts`, runs before routing, Node.js by default."],
  ],
  explain: "Explain to a friend why the same product page can cost 60,000 server renders an hour or 60, and what Server Components change about what the browser downloads.",
};
