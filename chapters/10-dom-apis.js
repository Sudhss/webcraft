const raw = String.raw;

export default {
  id: "dom-apis",
  n: 10,
  part: "B",
  title: "The DOM and browser APIs",
  hook: "The tree, the events, the observers and the APIs that frameworks wrap, with the costs they hide from you.",
  minutes: 80,
  levels: ["use", "understand", "rebuild"],
  sections: [
    {
      title: "A live tree, built well",
      beats: [
        { t: "say", x: "After parsing, your HTML is gone. What's left is a tree of C++ objects with JS wrappers, and every read or write crosses that boundary. Some reads are free. Some force the browser to finish layout first." },
        {
          t: "predict",
          lang: "js",
          src: "// <ul> with four <li class=\"todo\">\nconst items = document.getElementsByClassName('todo');\nfor (let i = 0; i < items.length; i++) {\n  items[i].classList.remove('todo');\n}\nconsole.log(document.querySelectorAll('.todo').length);",
          q: "How many are still `.todo`?",
          options: ["0", "2", "1", "4"],
          answer: 1,
          why: "`getElementsByClassName` is **live**: an item leaves the collection the moment it loses the class, indices shift, and you skip every other one. `querySelectorAll` returns a static snapshot and would clear all four.",
        },
        {
          t: "play",
          mode: "html",
          title: "live vs snapshot",
          html: "<ul></ul>",
          css: "body { font-family: system-ui; padding: 16px; }",
          js: "const ul = document.querySelector('ul');\nul.innerHTML = '<li class=\"todo\">task</li>'.repeat(5);\n\nconst live = document.getElementsByClassName('todo');\nconst snap = document.querySelectorAll('.todo');\n\nul.firstElementChild.remove();\nconsole.log('live', live.length, 'snapshot', snap.length);",
          task: "Rewrite the loop from the predict three ways that clear all items: `[...items]`, a backwards loop, and `while (items.length)`.",
        },
        {
          t: "compare",
          a: { label: "quadratic, destructive", lang: "js", src: "for (const u of users) {\n  list.innerHTML += '<li>' + u.name + '</li>';\n}" },
          b: { label: "one parse, one insert", lang: "js", src: "const frag = document.createDocumentFragment();\nfor (const u of users) {\n  const li = document.createElement('li');\n  li.textContent = u.name;\n  frag.append(li);\n}\nlist.replaceChildren(frag);" },
          x: "`+=` serializes the whole list to a string and reparses it every iteration: O(n^2). Every old node is destroyed, with its listeners, focus and scroll.",
        },
        {
          t: "predict",
          lang: "js",
          src: "// <input> with no value attribute\nconst input = document.querySelector('input');\ninput.value = 'typed by user';\ndocument.body.innerHTML += '<p>hi</p>';\nconsole.log(document.querySelector('input').value);",
          q: "What prints?",
          options: ["typed by user", "an empty string", "undefined", "it throws"],
          answer: 1,
          why: "`innerHTML` serializes **attributes**, not live state. `.value` is a property; the attribute was never set. The input you see now is a brand new node, and any listener on the old one is gone.",
        },
        {
          t: "code",
          lang: "html",
          src: "<template id=\"row\">\n  <li class=\"row\"><strong></strong> <span></span></li>\n</template>\n\n<script>\n  const tpl = document.getElementById('row').content.firstElementChild;\n  const frag = document.createDocumentFragment();\n  for (const u of users) {\n    const li = tpl.cloneNode(true);\n    li.querySelector('strong').textContent = u.name;\n    li.querySelector('span').textContent = u.email;\n    frag.append(li);\n  }\n  list.replaceChildren(frag);\n</script>",
          mark: [9, 10, 14],
          note: "Parse once, clone many. `<template>` content is inert: images don't load, scripts don't run. `textContent` never parses, so data can't become markup.",
        },
        {
          t: "pitfall",
          h: "innerHTML is an XSS sink",
          x: "A `<script>` inserted with `innerHTML` never runs, which lulls people. `<img src=x onerror=...>` does. Any user string reaching `innerHTML`, `insertAdjacentHTML` or `outerHTML` is code. Use `textContent`, or sanitize with DOMPurify first.",
        },
        {
          t: "play",
          mode: "html",
          title: "an XSS in 3 lines",
          html: "<button id=\"bad\">render with innerHTML</button>\n<button id=\"good\">render with textContent</button>\n<div id=\"out\"></div>",
          css: "body { font-family: system-ui; padding: 16px; }\n#out { margin-top: 12px; padding: 8px; border: 1px dashed #888; }",
          js: "// imagine this came from a comment box or a URL param\nconst payload = '<img src=x onerror=console.log(42)>';\nconst out = document.getElementById('out');\n\ndocument.getElementById('bad').onclick = () => (out.innerHTML = payload);\ndocument.getElementById('good').onclick = () => (out.textContent = payload);",
          task: "Click both. A 42 in the console means attacker code ran. Now try `insertAdjacentHTML('beforeend', payload)`: same hole.",
        },
        {
          t: "pitfall",
          h: "innerText is a layout read",
          x: "`textContent` returns raw text. `innerText` returns *rendered* text, so it needs up-to-date style and layout. Read it in a loop after writes and you force a layout per iteration. Use `textContent` unless you need what's visible.",
        },
      ],
    },
    {
      title: "Events, all three phases",
      beats: [
        {
          t: "viz",
          name: "frames",
          props: {
            cols: ["Phase", "Current target", "Listeners that fire"],
            frames: [
              { cells: [["capture"], ["window", "document"], ["capture: true only"]], note: "A click on a button inside `div#list`. The path is computed once, before any listener runs." },
              { cells: [["capture"], ["html", "body", "div#list"], ["capture: true only"]], note: "Walking down. `stopPropagation()` here means the button never hears it." },
              { cells: [["target"], ["button"], ["capture ones, then the rest"]], note: "At the target, capture listeners fire first (Chrome 89+ and the spec), then bubble ones." },
              { cells: [["bubble"], ["div#list"], ["bubble listeners"]], note: "Walking back up. This is where delegation lives: one listener on the list for every row." },
              { cells: [["bubble"], ["body", "html", "document", "window"], ["bubble listeners"]], note: "Dispatch ends. Now the default action runs (follow link, submit form) unless someone called `preventDefault()`." },
            ],
          },
        },
        {
          t: "predict",
          lang: "js",
          src: "// <div id=\"p\"><button id=\"c\">go</button></div>\np.addEventListener('click', () => log('p bubble'));\np.addEventListener('click', () => log('p capture'), true);\nc.addEventListener('click', () => log('c'));\nc.click();",
          q: "Order?",
          options: ["c, p bubble, p capture", "p capture, c, p bubble", "p bubble, p capture, c", "c, p capture, p bubble"],
          answer: 1,
          why: "Registration order doesn't matter across phases. Capture walks down first (p capture), then the target (c), then bubble walks up (p bubble).",
        },
        {
          t: "play",
          mode: "html",
          title: "delegation: 1000 rows, 1 listener",
          html: "<ul></ul>",
          css: "body { font-family: system-ui; padding: 12px; }\nul { max-height: 240px; overflow: auto; }\nbutton { margin-left: 8px; }",
          js: "const ul = document.querySelector('ul');\nlet html = '';\nfor (let i = 0; i < 1000; i++) html += '<li data-id=\"' + i + '\">row ' + i + '<button>del</button></li>';\nul.innerHTML = html;\n\nul.addEventListener('click', (e) => {\n  const btn = e.target.closest('button');\n  if (!btn || !ul.contains(btn)) return;\n  const li = btn.closest('li');\n  console.log('delete', li.dataset.id);\n  li.remove();\n});",
          task: "Append 10 new rows after load: they work with zero new listeners. Put a `<b>` inside the button and see why `closest` beats `e.target.tagName`.",
        },
        {
          t: "pitfall",
          h: "Not everything bubbles",
          x: "`focus`, `blur`, `mouseenter`, `mouseleave`, element `scroll` and `load` on images don't bubble, so delegation silently misses them. Use `focusin`/`focusout` and `mouseover`/`mouseout`, or listen in the capture phase.",
        },
        { t: "say", h: "Passive listeners", x: "On touch or wheel, the compositor thread wants to scroll *now*. A `wheel` listener might call `preventDefault()`, so it must wait for the main thread, which may be busy for 200 ms. `passive: true` promises you won't. Scroll starts instantly." },
        {
          t: "code",
          lang: "js",
          src: "const ac = new AbortController();\nconst opts = { signal: ac.signal };\n\nwindow.addEventListener('wheel', onWheel, { passive: true, signal: ac.signal });\nwindow.addEventListener('pointermove', onMove, opts);\nwindow.addEventListener('keydown', onKey, opts);\ndialog.addEventListener('close', cleanup, { once: true });\n\n// teardown: all of the above, no function references needed\nac.abort();",
          mark: [1, 4, 10],
          note: "`removeEventListener` needs the *same* function and the same capture flag. One signal removes a whole group: how components stop leaking listeners.",
        },
        {
          t: "quiz",
          q: "Chrome logs \"Unable to preventDefault inside passive event listener\". Your `touchmove` handler is on `document`. Why?",
          options: ["The event wasn't cancelable because it bubbled", "Touch and wheel listeners on window, document and body default to passive", "`preventDefault` is deprecated for touch", "The listener was added twice"],
          answer: 1,
          why: "Chrome 56 (touch) and 73 (wheel) made those root targets passive by default. Pass `passive: false` if you truly must block, but first try CSS `touch-action` or `overscroll-behavior`, which need no JS at all.",
        },
        {
          t: "pitfall",
          h: "bind() makes removal a no-op",
          x: "`el.removeEventListener('click', this.onClick.bind(this))` removes nothing: `bind` returns a new function each call. It fails silently and the listener leaks, holding the whole component in memory. Store the bound function once, or use a signal.",
        },
      ],
    },
    {
      title: "Pointers, and events of your own",
      beats: [
        { t: "say", x: "Pointer events merge mouse, pen and touch into one stream: `pointerdown`, `pointermove`, `pointerup`, with `pointerType`, `pointerId` and `pressure`. Write drag code once, and stop handling touch and the compat mouse events that follow it." },
        {
          t: "play",
          mode: "html",
          title: "drag with pointer capture",
          html: "<div id=\"box\">drag me</div>",
          css: "body { margin: 0; height: 100vh; font-family: system-ui; }\n#box { position: absolute; width: 110px; height: 70px; display: grid; place-items: center;\n  background: #d49a3a; color: #111; border-radius: 10px; user-select: none; touch-action: none; }",
          js: "const box = document.getElementById('box');\nlet x = 40, y = 40, sx = 0, sy = 0;\nconst place = () => (box.style.transform = 'translate(' + x + 'px,' + y + 'px)');\nplace();\n\nbox.addEventListener('pointerdown', (e) => {\n  box.setPointerCapture(e.pointerId);\n  sx = e.clientX - x;\n  sy = e.clientY - y;\n});\nbox.addEventListener('pointermove', (e) => {\n  if (!box.hasPointerCapture(e.pointerId)) return;\n  x = e.clientX - sx;\n  y = e.clientY - sy;\n  place();\n});\nbox.addEventListener('lostpointercapture', () => console.log('released at', x, y));",
          task: "Delete the `setPointerCapture` line and drag fast: the box drops you as soon as the pointer outruns it. Then log `e.getCoalescedEvents().length` in move.",
        },
        { t: "say", h: "Pointer capture", x: "`setPointerCapture(id)` sends every event of that pointer to your element until release, even outside the window. No more `document.addEventListener('mousemove')` during a drag. `getCoalescedEvents()` gives the extra samples for drawing apps." },
        {
          t: "pitfall",
          h: "Drags die on phones without touch-action",
          x: "On touch, the browser decides at `pointerdown` whether the gesture is a pan. If it is, you get `pointercancel` and no more moves. `touch-action: none` (or `pan-y` for a horizontal slider) tells it up front, in CSS, before any JS runs.",
        },
        {
          t: "code",
          lang: "js",
          src: "// deep in the tree\nconst ok = card.dispatchEvent(new CustomEvent('cart:add', {\n  detail: { sku: 'A12', qty: 1 },\n  bubbles: true,     // default false\n  composed: true,    // cross shadow DOM boundaries\n  cancelable: true,\n}));\nif (!ok) showLogin();\n\n// once, at the top\ndocument.addEventListener('cart:add', (e) => {\n  if (!user) e.preventDefault();\n  else cart.add(e.detail);\n});",
          mark: [4, 8, 12],
          note: "`dispatchEvent` returns `false` if a listener called `preventDefault()` on a cancelable event: a veto channel, for free. Forget `bubbles` and nobody above hears it.",
        },
        {
          t: "predict",
          lang: "js",
          src: "btn.addEventListener('click', () => {\n  Promise.resolve().then(() => console.log('micro'));\n  console.log('l1');\n});\nbtn.addEventListener('click', () => console.log('l2'));\n\nbtn.click();",
          q: "What order, for `btn.click()` from a script?",
          options: ["l1, micro, l2", "l1, l2, micro", "micro, l1, l2", "l2, l1, micro"],
          answer: 1,
          why: "Microtasks run when the JS stack empties. During `btn.click()` your script is still on the stack, so both listeners run first. A **real** user click gives l1, micro, l2. Tests using `.click()` can hide races users hit.",
        },
      ],
    },
    {
      title: "The Observers",
      beats: [
        {
          t: "table",
          caption: "Polling `getBoundingClientRect()` on scroll forces a layout per element per event. Observers compute the answer where it is cheap and batch it.",
          head: ["Observer", "Watches", "Real uses", "Delivered"],
          rows: [
            ["IntersectionObserver", "overlap with viewport or a root", "lazy loading, infinite scroll, impressions, pausing offscreen video", "after layout, async"],
            ["ResizeObserver", "an element's box size", "charts and canvases that fit their box", "after layout, before paint"],
            ["MutationObserver", "children, attributes, text", "reacting to third-party widgets, editors, waiting for DOM in tests", "microtask"],
            ["PerformanceObserver", "performance entries", "LCP, INP, long tasks, resource timing to analytics", "async, can replay"],
          ],
        },
        {
          t: "code",
          lang: "js",
          src: "const io = new IntersectionObserver((entries) => {\n  for (const e of entries) {\n    if (!e.isIntersecting) continue; // it also fires once on observe()\n    loadMore();\n  }\n}, { rootMargin: '600px 0px' });     // start 600px before it's visible\n\nio.observe(document.querySelector('#sentinel'));",
          mark: [3, 6],
          note: "Infinite scroll: watch one empty element at the end of the list. One observer can watch thousands of elements; don't create one per element.",
        },
        {
          t: "predict",
          lang: "js",
          src: "const mo = new MutationObserver((recs) => console.log('mutations', recs.length));\nmo.observe(list, { childList: true });\n\nlist.append(a);\nlist.append(b);\nconsole.log('sync');\nPromise.resolve().then(() => console.log('then'));",
          q: "Order?",
          options: ["mutations 1, mutations 1, sync, then", "sync, mutations 2, then", "sync, then, mutations 2", "sync, then, mutations 1, mutations 1"],
          answer: 1,
          why: "Records are batched, and delivery is a microtask queued at the **first** mutation, before the `then` was queued. So it runs first, with both records. Never synchronous: that was the old, slow Mutation Events.",
        },
        {
          t: "play",
          mode: "html",
          title: "ResizeObserver",
          html: "<div id=\"box\"><canvas></canvas></div>\n<p id=\"out\"></p>",
          css: "body { font-family: system-ui; padding: 16px; }\n#box { resize: both; overflow: hidden; width: 260px; height: 140px; border: 1px solid #888; }\ncanvas { width: 100%; height: 100%; display: block; }",
          js: "const box = document.getElementById('box');\nconst canvas = box.querySelector('canvas');\nconst ctx = canvas.getContext('2d');\n\nnew ResizeObserver(([entry]) => {\n  const { inlineSize: w, blockSize: h } = entry.contentBoxSize[0];\n  const dpr = devicePixelRatio;\n  canvas.width = Math.round(w * dpr);   // backing store in device pixels\n  canvas.height = Math.round(h * dpr);\n  ctx.scale(dpr, dpr);\n  ctx.strokeStyle = '#d49a3a';\n  ctx.lineWidth = 2;\n  ctx.beginPath(); ctx.moveTo(0, h); ctx.lineTo(w, 0); ctx.stroke();\n  document.getElementById('out').textContent = Math.round(w) + ' x ' + Math.round(h) + ' css px';\n}).observe(box);",
          task: "Drag the corner. Delete the `dpr` lines and look at the line on a laptop screen: blurry. That's why canvas sizing lives in a ResizeObserver.",
        },
        {
          t: "pitfall",
          h: "The ResizeObserver loop error",
          x: "Resize an observed element inside its own callback and the browser defers the new notifications a frame, then reports `ResizeObserver loop completed with undelivered notifications` to `window.onerror`. It floods error trackers. Don't resize what you observe.",
        },
        {
          t: "code",
          lang: "js",
          src: "new PerformanceObserver((list) => {\n  const last = list.getEntries().at(-1);\n  report('lcp', last.startTime, last.element?.tagName);\n}).observe({ type: 'largest-contentful-paint', buffered: true });\n\nnew PerformanceObserver((list) => {\n  for (const e of list.getEntries()) report('slow-event', e.name, e.duration);\n}).observe({ type: 'event', durationThreshold: 100, buffered: true });",
          mark: [4, 8],
          note: "`buffered: true` replays entries from before your script loaded. Without it, an analytics script that loads late never sees the LCP it's supposed to measure.",
        },
        {
          t: "mission",
          h: "Scroll-spy table of contents",
          x: "A long article with ten `<h2>`s and a sticky side nav. Highlight the section being read, using one IntersectionObserver and zero scroll listeners. It must behave when two headings are visible and when none is.",
          hint: "Use `rootMargin: '0px 0px -70% 0px'` so only the top band counts. Keep a Set of intersecting ids and highlight the first one in document order.",
        },
      ],
    },
    {
      title: "fetch, properly",
      beats: [
        {
          t: "predict",
          lang: "js",
          src: "try {\n  const res = await fetch('/api/missing'); // server answers 404\n  console.log('got', res.status);\n} catch (e) {\n  console.log('caught', e.name);\n}",
          q: "What prints?",
          options: ["caught TypeError", "got 404", "caught HTTPError", "got undefined"],
          answer: 1,
          why: "`fetch` rejects only when no HTTP response came back: network down, DNS failure, CORS block, abort. A 404 or a 500 is a *successful* fetch of an error. Check `res.ok`.",
        },
        {
          t: "play",
          mode: "js",
          title: "a fetch wrapper that tells the truth",
          js: "async function json(res) {\n  if (!res.ok) throw new Error('HTTP ' + res.status + ': ' + (await res.text()).slice(0, 60));\n  return res.json();\n}\n\n// Response objects, no network needed: exactly what fetch() resolves with\nconst ok = new Response('{\"user\":\"ada\"}', { headers: { 'content-type': 'application/json' } });\nconst missing = new Response('no such user', { status: 404 });\njson(ok).then((d) => console.log('ok', d));\njson(missing).catch((e) => console.log('failed:', e.message));\n\n// a body is a stream: you can read it once\nconst once = new Response('hi');\nonce.text().then(() => once.text()).catch((e) => console.log(e.name, e.message));",
          task: "Make `json()` throw a clear error when the content-type isn't JSON (a proxy's HTML error page). Then fix the double read with `res.clone()`.",
        },
        {
          t: "play",
          mode: "js",
          title: "read a stream as it arrives",
          js: "const enc = new TextEncoder();\nconst stream = new ReadableStream({\n  async start(ctl) {\n    for (const w of ['{\"t\":\"str', 'eam\"}\\n{\"t\":', '\"ing\"}\\n', '{\"t\":\"done\"}\\n']) {\n      ctl.enqueue(enc.encode(w));\n      await new Promise((r) => setTimeout(r, 300));\n    }\n    ctl.close();\n  },\n});\n\n(async () => {\n  const res = new Response(stream); // what fetch() would hand you\n  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();\n  for (;;) {\n    const { value, done } = await reader.read();\n    if (done) break;\n    console.log('chunk:', JSON.stringify(value));\n  }\n})();",
          task: "Chunks split JSON lines at random. Buffer the partial tail, split on newlines, and `JSON.parse` each complete line as soon as it's whole.",
        },
        {
          t: "code",
          lang: "js",
          src: "let ac;\ninput.addEventListener('input', async () => {\n  ac?.abort();                       // cancel the stale search\n  ac = new AbortController();\n  const signal = AbortSignal.any([ac.signal, AbortSignal.timeout(5000)]);\n  try {\n    const res = await fetch('/search?q=' + encodeURIComponent(input.value), { signal });\n    render(await res.json());\n  } catch (e) {\n    if (e.name === 'AbortError') return; // superseded: fine\n    if (e.name === 'TimeoutError') showSlow();\n    else throw e;\n  }\n});",
          mark: [3, 5, 10],
          note: "Aborting also kills the race where a slow old response renders over a fast new one. That bug ships in most search boxes.",
        },
        { t: "say", h: "CORS is the browser's rule", x: "The server answers every request. The browser then decides whether *your JS* may read the response, based on `Access-Control-Allow-Origin`. curl never gets CORS errors: that's how you know it's client-side policy." },
        {
          t: "table",
          head: ["Request", "Preflight OPTIONS?", "Note"],
          rows: [
            ["GET, or POST with a form or text/plain body", "no", "it reaches the server even if the read is blocked"],
            ["`Content-Type: application/json`", "yes", "cache it with `Access-Control-Max-Age`"],
            ["custom header, e.g. `Authorization`", "yes", "server must list it in `Allow-Headers`"],
            ["`credentials: 'include'`", "if non-simple", "needs the exact origin, never `*`, and `Allow-Credentials: true`"],
            ["`mode: 'no-cors'`", "no", "opaque response: status 0, empty body. Not a fix."],
          ],
        },
        {
          t: "pitfall",
          h: "CORS doesn't protect your server",
          x: "A simple form POST from any site still hits your endpoint, with the user's cookies attached. CORS only hides the response. That's CSRF. Defend with `SameSite` cookies, CSRF tokens or checking `Origin`, never by trusting CORS.",
        },
      ],
    },
    {
      title: "Storage and the clipboard",
      beats: [
        {
          t: "table",
          head: ["Store", "Size", "API", "Watch out"],
          rows: [
            ["cookies", "~4 KB each", "sync strings", "sent on every request to the domain"],
            ["localStorage", "~5 MB per origin", "sync strings", "blocks the main thread; shared by all tabs"],
            ["sessionStorage", "~5 MB", "sync strings", "per tab; copied when a tab is duplicated"],
            ["IndexedDB", "a share of free disk", "async, structured clone", "transactions auto-commit"],
            ["Cache API", "same pool as IndexedDB", "async, Request/Response", "made for service workers and offline"],
          ],
        },
        {
          t: "code",
          lang: "js",
          src: "function safeStorage() {\n  try {\n    const s = window.localStorage; // throws if storage is blocked\n    s.setItem('__t', '1');        // throws on quota (and old Safari private mode)\n    s.removeItem('__t');\n    return s;\n  } catch {\n    const m = new Map();          // in-memory fallback, same shape\n    return {\n      getItem: (k) => m.get(k) ?? null,\n      setItem: (k, v) => m.set(k, String(v)),\n      removeItem: (k) => m.delete(k),\n    };\n  }\n}",
          mark: [3, 4],
          note: "Even *reading* `window.localStorage` throws a SecurityError in sandboxed iframes or with cookies blocked. One unguarded line at module top and the app is a white screen.",
        },
        {
          t: "predict",
          lang: "js",
          src: "window.addEventListener('storage', (e) => console.log('storage', e.key));\nlocalStorage.setItem('theme', 'dark');\nconsole.log('set');",
          q: "What prints in this tab?",
          options: ["set, storage theme", "storage theme, set", "set", "nothing, it throws"],
          answer: 2,
          why: "`storage` fires in the **other** same-origin tabs, never the one that wrote. It's free cross-tab sync (log out everywhere). For richer messages, use `BroadcastChannel`.",
        },
        {
          t: "pitfall",
          h: "IndexedDB transactions die across an await",
          x: "A transaction auto-commits when a task ends with no pending requests on it. `await fetch()` in the middle and your next `store.put` throws `TransactionInactiveError`. Fetch first, then open the transaction. The `idb` wrapper doesn't change this rule.",
        },
        {
          t: "pitfall",
          h: "Safari deletes your storage in 7 days",
          x: "Safari's ITP wipes all script-writable storage (localStorage, IndexedDB, caches) for sites the user hasn't interacted with in 7 days of browsing. Home-screen apps are exempt. Treat client storage as a cache; the truth lives on the server.",
        },
        {
          t: "quiz",
          q: "`navigator.clipboard.writeText(link)` works in dev but fails for some users. The click handler first awaits a fetch for the link. Likely cause?",
          options: ["The clipboard API is Chrome-only", "Safari and Firefox need a user gesture; after the await it may have expired", "The text is too long", "It needs a permission prompt each time"],
          answer: 1,
          why: "Clipboard writes need a secure context and, in Safari and Firefox, transient user activation. Awaiting a network call first can lose it. In iframes you also need `allow=\"clipboard-write\"`.",
        },
        {
          t: "code",
          lang: "js",
          src: "button.addEventListener('click', () => {\n  // call write() synchronously inside the gesture,\n  // and hand it a *promise* for the data\n  const blob = fetch('/api/share-link')\n    .then((r) => r.text())\n    .then((t) => new Blob([t], { type: 'text/plain' }));\n  navigator.clipboard.write([new ClipboardItem({ 'text/plain': blob })]);\n});",
          mark: [7],
          note: "`ClipboardItem` accepts promises. The write starts inside the gesture, the data arrives later. This is the fix for Safari's copy button bug.",
        },
      ],
    },
    {
      title: "Frames and media queries",
      beats: [
        { t: "say", x: "`requestAnimationFrame(cb)` runs `cb` right before the next style, layout and paint, once per display refresh: 60, 120 or 144 Hz. It's the only timer aligned with the screen. `setTimeout(f, 16)` drifts and lands mid-frame." },
        {
          t: "play",
          mode: "html",
          title: "a frame-rate independent loop",
          html: "<div id=\"dot\"></div>\n<button id=\"stop\">stop</button>",
          css: "body { font-family: system-ui; padding: 16px; }\n#dot { width: 24px; height: 24px; border-radius: 50%; background: #d49a3a; margin-bottom: 16px; }",
          js: "const dot = document.getElementById('dot');\nlet x = 0, v = 240;              // v in px per SECOND\nlet last = performance.now(), id;\n\nfunction frame(now) {\n  const dt = Math.min((now - last) / 1000, 0.1); // clamp: the tab was hidden\n  last = now;\n  x += v * dt;\n  if (x > 300 || x < 0) { v = -v; x = Math.max(0, Math.min(300, x)); }\n  dot.style.transform = 'translateX(' + x + 'px)';\n  id = requestAnimationFrame(frame);\n}\nid = requestAnimationFrame(frame);\ndocument.getElementById('stop').onclick = () => cancelAnimationFrame(id);",
          task: "Replace `v * dt` with a fixed 4 px per frame. On a 144 Hz screen that's 2.4x faster than on 60 Hz. Every motion needs `dt`.",
        },
        { t: "viz", name: "framebudget" },
        {
          t: "pitfall",
          h: "rAF stops in background tabs",
          x: "Hidden tabs get no frames, so logic in a rAF loop freezes, and the first frame back has a huge `dt`: clamp it. Background `setTimeout` is throttled to once a second, and Chrome aligns chained timers to once a minute after 5 minutes hidden.",
        },
        {
          t: "code",
          lang: "js",
          src: "const reduce = matchMedia('(prefers-reduced-motion: reduce)');\nconst fine = matchMedia('(hover: hover) and (pointer: fine)');\n\nfunction apply() {\n  motion.enabled = !reduce.matches;\n  tooltips.mode = fine.matches ? 'hover' : 'tap';\n}\napply();\nreduce.addEventListener('change', apply); // user flips the OS setting live\nfine.addEventListener('change', apply);   // a tablet docks a mouse",
          note: "Media queries in JS, with change events. Use them where CSS can't reach: picking a code path, a JS animation, a canvas quality level.",
        },
      ],
    },
    {
      title: "History, and a router by hand",
      beats: [
        {
          t: "steps",
          h: "What a client-side router really does",
          items: [
            "Intercept clicks on same-origin `<a>` with one delegated listener.",
            "`history.pushState(state, '', url)` changes the URL. No request, no event.",
            "Match `location.pathname` against routes and render the view yourself.",
            "Back and forward fire `popstate`: match and render again from `location`.",
            "On reload the server gets `/users/42` and must serve `index.html` for it: the history fallback.",
            "Restore scroll, and move focus to the new `<h1>` so screen readers notice the page changed.",
          ],
        },
        {
          t: "predict",
          lang: "js",
          src: "addEventListener('popstate', () => console.log('popstate', location.pathname));\nhistory.pushState({}, '', '/a');\nhistory.pushState({}, '', '/b');\nhistory.back();\nconsole.log('now', location.pathname);",
          q: "What prints?",
          options: ["popstate /a, popstate /b, popstate /a, now /a", "now /b, then later popstate /a", "now /a, popstate /a", "now /b"],
          answer: 1,
          why: "`pushState` fires nothing. `back()` is asynchronous: the URL changes and `popstate` fires later, in a task. Right after `back()` you're still on `/b`.",
        },
        {
          t: "pitfall",
          h: "The hijacked-link bug",
          x: "A router that calls `preventDefault()` on every `<a>` breaks Ctrl/Cmd+click, middle-click, `target=\"_blank\"`, `download` and external links. Only intercept a plain left click (`e.button === 0`, no modifier keys) on a same-origin link.",
        },
        {
          t: "rebuild",
          h: "A hash router in 30 lines",
          x: "Hash routing works anywhere, even this sandbox: the part after `#` never reaches the server. Routes like `/users/:id` compile to regexes with named keys. Click the links, then extend it.",
          mode: "html",
          html: "<nav>\n  <a href=\"#/\">home</a>\n  <a href=\"#/users/42\">user 42</a>\n  <a href=\"#/users/ada%20l\">user ada l</a>\n  <a href=\"#/nope\">broken</a>\n</nav>\n<main><h1 id=\"title\" tabindex=\"-1\"></h1><p id=\"body\"></p></main>",
          css: "body { font-family: system-ui; padding: 16px; }\nnav a { margin-right: 12px; }\nh1:focus { outline: none; }",
          js: raw`const routes = [];

function route(pattern, view) {
  const keys = [];
  const src = pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)'));
  routes.push({ re: new RegExp('^' + src + '$'), keys, view });
}

function resolve() {
  const path = location.hash.slice(1) || '/';
  for (const r of routes) {
    const m = path.match(r.re);
    if (!m) continue;
    const params = {};
    r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
    return show(r.view(params));
  }
  show({ title: '404', body: 'No route for ' + path });
}

function show({ title, body }) {
  const h1 = document.getElementById('title');
  h1.textContent = title; // params are user input: never innerHTML
  document.getElementById('body').textContent = body;
  h1.focus();
}

route('/', () => ({ title: 'Home', body: 'Pick a link.' }));
route('/users/:id', (p) => ({ title: 'User ' + p.id, body: 'A profile.' }));

addEventListener('hashchange', resolve);
resolve();`,
          task: "Add `/users/:id/posts/:post`, then query strings (`#/search?q=x` via URLSearchParams), then a `beforeEach(to)` guard that redirects `/admin` to `/login`.",
        },
        {
          t: "mission",
          h: "A real history router",
          x: "Port the hash router to `pushState` in a local project: delegated link interception with the modifier checks, a 404, a guard, lazy views with `import()`, and scroll restored per history entry on back and forward.",
          hint: "Before navigating, `history.replaceState({ ...history.state, y: scrollY }, '')`. On `popstate`, render, then `scrollTo(0, e.state?.y ?? 0)`. Serve with `npx serve -s` for the fallback.",
        },
      ],
    },
    {
      title: "Web components",
      beats: [
        { t: "say", x: "Custom elements are a lifecycle, not a framework: `connectedCallback`, `disconnectedCallback`, `attributeChangedCallback`. No reactivity, no templating, no diffing. You bring those, or you use Lit on top." },
        {
          t: "play",
          mode: "html",
          title: "<x-counter> with shadow DOM",
          html: "<x-counter count=\"3\">Likes</x-counter>\n<x-counter></x-counter>\n<p>Page CSS makes buttons red. Look inside.</p>",
          css: "body { font-family: system-ui; padding: 16px; }\nbutton { background: red; } /* never reaches the shadow root */\nx-counter { --accent: #d49a3a; } /* custom properties do */\nx-counter::part(button) { border-radius: 999px; }",
          js: "class XCounter extends HTMLElement {\n  static observedAttributes = ['count'];\n  #root = this.attachShadow({ mode: 'open' });\n  #b;\n  connectedCallback() {\n    if (this.#b) return; // can fire again when the element is moved\n    this.#root.innerHTML =\n      '<style>button{font:inherit;padding:.4em .8em;border:2px solid var(--accent,#888);background:none;color:inherit}</style>' +\n      '<button part=\"button\"><slot>Count</slot>: <b></b></button>';\n    this.#b = this.#root.querySelector('b');\n    this.#root.querySelector('button').addEventListener('click', () => (this.count += 1));\n    this.#render();\n  }\n  get count() { return Number(this.getAttribute('count') ?? 0); }\n  set count(v) { this.setAttribute('count', String(v)); }\n  attributeChangedCallback() { this.#render(); }\n  #render() {\n    if (!this.#b) return;\n    this.#b.textContent = this.count;\n    this.dispatchEvent(new CustomEvent('count-change', { detail: this.count, bubbles: true, composed: true }));\n  }\n}\ncustomElements.define('x-counter', XCounter);\ndocument.addEventListener('count-change', (e) => console.log(e.target.textContent || 'unnamed', e.detail));",
          task: "Set `count` from the console with `document.querySelector('x-counter').count = 10`. Then remove `bubbles` or `composed` and see who stops hearing it.",
        },
        {
          t: "table",
          head: ["Across the shadow boundary", "Gets through?"],
          rows: [
            ["page selectors like `button {}`", "no"],
            ["inherited properties: `color`, `font`", "yes"],
            ["CSS custom properties", "yes: this is your theming API"],
            ["`::part(name)`", "yes, for parts the component exports"],
            ["events", "retargeted: outside, `e.target` is the host; `composedPath()` has the truth"],
            ["`document.querySelector`", "no; reach in via `el.shadowRoot` (open mode only)"],
          ],
        },
        {
          t: "pitfall",
          h: "The upgrade race",
          x: "Set `el.count = 5` before `customElements.define` runs and you create an own property that shadows your class setter forever. In `connectedCallback`, if `Object.hasOwn(this, 'count')`, save the value, `delete this.count`, and assign it again.",
        },
        {
          t: "pitfall",
          h: "Custom inputs submit nothing",
          x: "A `<my-input>` inside a `<form>` is invisible to it. Form participation needs `static formAssociated = true` and `this.#i = this.attachInternals()`, then `this.#i.setFormValue(v)`. Validity, labels and reset hook in the same way.",
        },
        {
          t: "quiz",
          q: "When are web components clearly worth it?",
          options: ["Always, instead of a framework", "Widgets shared across apps in different frameworks, or embedded in pages you don't control", "When you need server rendering", "When you need app-wide state"],
          answer: 1,
          why: "They win at boundaries: design-system primitives used by React, Vue and plain pages alike, and third-party embeds. SSR needs declarative shadow DOM and stays awkward, and app state was never their job.",
        },
      ],
    },
  ],
  nobodyTells: [
    "`el.click()` and `dispatchEvent` run all listeners with no microtask checkpoint between them. Real clicks do. Tests built on `.click()` can pass while users hit a race.",
    "`console.log(el)` shows the element as it is when you expand it, not when you logged it. Log `el.outerHTML` to see the past.",
    "`getEventListeners($0)` in the Chrome console lists the listeners on the element selected in the Elements panel.",
    "`e.target` is often an SVG `<path>` or a `<b>` inside your button. Call `closest()` on it, always.",
    "Give every component one AbortController and pass its signal to every listener and fetch. Unmount is one `abort()` call.",
    "`structuredClone` deep-copies Maps, Dates, typed arrays and cycles: the same algorithm postMessage and IndexedDB use.",
    "On mobile, `visibilitychange` to hidden is your last reliable moment. Send analytics there with `navigator.sendBeacon`, not in `unload`.",
    "An endless chain of microtasks or MutationObserver callbacks freezes the page as hard as `while (true)`: rendering waits for the queue to drain.",
  ],
  glossary: [
    ["live collection", "An HTMLCollection or NodeList that updates as the DOM changes, e.g. `getElementsByClassName`."],
    ["DocumentFragment", "A parentless node tree; appending it moves its children in one operation."],
    ["event delegation", "One listener on an ancestor handles events from many children via bubbling and `closest()`."],
    ["passive listener", "A listener that promises not to call `preventDefault()`, so scrolling needn't wait for JS."],
    ["pointer capture", "Routing all events of one pointer to an element until release, even outside it."],
    ["CORS", "The browser's rule for when JS may read a cross-origin response, driven by server headers."],
    ["preflight", "An automatic OPTIONS request the browser sends before a non-simple cross-origin request."],
    ["shadow DOM", "A scoped subtree attached to an element, with its own styles and retargeted events."],
    ["history fallback", "Server rule that returns `index.html` for unknown paths so client routes survive reloads."],
  ],
  explain: "Explain to a friend why a `passive: true` wheel listener makes scrolling smoother, starting from which thread actually scrolls the page.",
};
