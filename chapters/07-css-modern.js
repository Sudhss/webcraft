export default {
  id: "css-modern",
  n: 7,
  part: "B",
  title: "CSS III: responsive, tokens and motion",
  hook: "Fluid type is a line equation, a container is a viewport you choose, and :has() is an if statement.",
  minutes: 70,
  levels: ["use", "understand", "rebuild"],
  sections: [
    {
      title: "Layout without breakpoints",
      beats: [
        { t: "say", h: "Rules, not widths", x: "Most breakpoints exist because a layout was given fixed numbers. Give it **rules** instead (as many columns as fit, a sidebar that wraps when the main area gets too thin) and the browser solves it at every width, including ones you never tested." },
        {
          t: "code",
          lang: "css",
          src: "/* as many columns as fit, each at least 16rem, never wider than the box */\n.cards {\n  display: grid;\n  grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr));\n  gap: clamp(1rem, 3vw, 2rem);\n}\n\n/* sidebar beside main until main would drop below half the width */\n.split { display: flex; flex-wrap: wrap; gap: 1rem; }\n.split > aside { flex: 1 1 15rem; }\n.split > main  { flex: 999 1 0; min-inline-size: 50%; }",
          mark: [4, 11],
          note: "No `@media` anywhere. Both respond to their container, not the window, so they work in a sidebar or a modal too.",
        },
        {
          t: "predict",
          lang: "css",
          src: ".cards {\n  display: grid;\n  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));\n}\n/* a 320px phone with 20px of page padding each side */",
          q: "The grid box is 280px wide. What happens?",
          options: ["One 280px column", "One 300px column that sticks out 20px: the page scrolls sideways", "The items stack at their content width", "auto-fit relaxes the minimum until it fits"],
          answer: 1,
          why: "A track never goes below its `minmax` minimum, so it's 300px in a 280px box. `min(100%, 300px)` caps the minimum at the box width. Test at 320px: small phones are where this ships broken.",
        },
        {
          t: "play",
          mode: "html",
          title: "no media queries",
          html: `<p>Drag the bottom-right corner of the dashed box.</p>
<div class="box">
  <div class="split">
    <aside>Filters</aside>
    <main>
      <div class="cards"><div>One</div><div>Two</div><div>Three</div><div>Four</div></div>
    </main>
  </div>
</div>`,
          css: `body { font: 14px system-ui; }
.box { resize: horizontal; overflow: auto; width: 420px; min-width: 80px; max-width: 100%;
  box-sizing: border-box; border: 2px dashed #bbb; padding: 8px; }
.split { display: flex; flex-wrap: wrap; gap: 8px; }
.split > aside { flex: 1 1 7rem; background: #f1e3c8; padding: 8px; border-radius: 6px; }
.split > main { flex: 999 1 0; min-inline-size: 50%; }
.cards { display: grid; gap: 8px;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 5rem), 1fr)); }
.cards div { background: #3a8ad4; color: #fff; padding: 16px 4px; border-radius: 6px; text-align: center; }`,
          task: "Shrink the box: the aside wraps, then the columns drop. Now replace `min(100%, 5rem)` with `5rem` and shrink it to the minimum: the cards stick out.",
        },
        {
          t: "quiz",
          q: "In the sidebar pattern, why does `main` get `flex-grow: 999`?",
          options: ["To make it 999 times wider than the aside", "So it takes almost all spare space and the aside stays near its 15rem basis", "Browsers cap flex-grow at 999", "To force the line to wrap"],
          answer: 1,
          why: "Spare space is shared in proportion to flex-grow, so 999 to 1 gives main 99.9% of it. When 15rem plus main's 50% minimum no longer fits on one line, it wraps, and each part takes the full width.",
        },
      ],
    },
    {
      title: "clamp() is a line",
      beats: [
        { t: "say", x: "`clamp(MIN, VAL, MAX)` is `max(MIN, min(VAL, MAX))`. Make the middle `rem + vw` and you get a straight line: size as a function of viewport width, with a floor and a ceiling. Two points define a line, so pick two." },
        {
          t: "code",
          lang: "css",
          src: "/* goal: 16px at a 320px viewport, 24px at 1280px, a line between */\n\n/* slope     = (24 - 16) / (1280 - 320) = 0.008333  (px of type per px of width) */\n/* intercept = 16 - 0.008333 * 320      = 13.333px = 0.8333rem                 */\n/* 1vw is 1% of the width, so the slope term is 0.008333 * 100 = 0.8333vw      */\n\np {\n  font-size: clamp(1rem, 0.8333rem + 0.8333vw, 1.5rem);\n}",
          mark: [8],
          note: "It's y = mx + b. The floor and ceiling only take over outside 320 to 1280px.",
        },
        {
          t: "predict",
          lang: "css",
          src: "p { font-size: clamp(1rem, 0.8333rem + 0.8333vw, 1.5rem); }\n/* the viewport is 800px wide */",
          q: "What font size does the paragraph get?",
          options: ["16px", "18px", "20px", "22px", "24px"],
          answer: 2,
          why: "0.8333rem is 13.33px and 0.8333vw at 800px is 6.67px: 20px. 800 is the midpoint of 320 and 1280, so you land on the midpoint of 16 and 24. It's linear; that's the whole model.",
        },
        { t: "say", x: "Browser zoom treats the two terms differently. At 200% a `rem` covers twice as many screen pixels. But the viewport is now half as many CSS pixels wide, so `1vw` covers exactly the screen pixels it did before." },
        {
          t: "predict",
          lang: "css",
          src: "h1 { font-size: 5vw; }\n/* desktop window 1200px wide: 60px text */",
          q: "The user zooms to 200%. How big is the heading on screen?",
          options: ["Twice as big", "Exactly the same size", "Half the size", "It depends on the OS font setting"],
          answer: 1,
          why: "The window now measures 600 CSS px, so 5vw is 30 CSS px, drawn at 2x: the same 60 screen pixels. Pure `vw` text is immune to zoom, which is why the middle value always needs a `rem` term.",
        },
        {
          t: "pitfall",
          h: "Steep fluid type can fail zoom",
          x: "WCAG 1.4.4 wants text zoomable to 200%. The vw part doesn't grow with zoom, so a steep clamp can cap out first. A tested rule: keep MAX at most 2.5 × MIN. At the 500% zoom limit the rem floor alone renders at 5 × MIN, which is at least 2 × MAX.",
        },
      ],
    },
    {
      title: "Media queries that still matter",
      beats: [
        { t: "say", x: "Width is now mostly a container's question. What only a media query knows is the **device and the person**: can it hover, how precise is the pointer, does motion hurt, which colour scheme they chose." },
        {
          t: "table",
          head: ["Query", "True when", "Use it for"],
          rows: [
            ["`(hover: hover)`", "The primary input can hover: mouse, trackpad", "Hover-only effects, so touch never gets them"],
            ["`(pointer: coarse)`", "The primary pointer is a finger", "Bigger targets and gaps"],
            ["`(any-pointer: fine)`", "Any connected input is precise", "A tablet with a mouse plugged in"],
            ["`(prefers-reduced-motion: reduce)`", "The OS asks for less motion", "Swap movement for fades (chapter 31)"],
            ["`(prefers-color-scheme: dark)`", "The OS or browser is in dark mode", "The default theme until the user picks one"],
            ["`(prefers-contrast: more)`", "The user asked for more contrast", "Solid borders, no pale grey text"],
          ],
        },
        {
          t: "pitfall",
          h: "Hover sticks on touch screens",
          x: "A tap on a phone triggers `:hover`, and it stays until the user taps somewhere else. The card that lifts on hover sits lifted after every tap. Put hover-only effects inside `@media (hover: hover)`, and never hide a control behind hover alone.",
        },
        {
          t: "predict",
          lang: "css",
          src: ".nav, .burger { display: none; }\n@media (max-width: 600px) { .burger { display: block; } }\n@media (min-width: 601px) { .nav { display: flex; } }",
          q: "At 125% zoom the viewport is 600.8 CSS px wide. What does the user see?",
          options: ["The burger", "The nav", "Both", "Neither"],
          answer: 3,
          why: "600.8 fails `max-width: 600px` and fails `min-width: 601px`. Zoom and fractional device pixel ratios make non-integer widths common. Range syntax closes the gap: `(width <= 600px)` and `(width > 600px)`.",
        },
        {
          t: "code",
          lang: "css",
          src: "@media (width <= 600px)          { .nav { display: none; } }\n@media (600px < width <= 1000px) { .grid { --cols: 2; } }\n\n/* hover effects only where hover exists */\n@media (hover: hover) and (pointer: fine) {\n  .row .actions { opacity: 0; }\n  .row:hover .actions, .row:focus-within .actions { opacity: 1; }\n}\n\n/* motion as an opt-in: the calm version is the default */\n@media (prefers-reduced-motion: no-preference) {\n  .hero { animation: rise .6s ease-out both; }\n}",
          mark: [1, 2, 11],
          note: "Range syntax is Baseline since 2023. With motion inside `no-preference`, forgetting the reduced case gives the calm version, not the nauseating one.",
        },
        {
          t: "predict",
          lang: "css",
          src: "body {\n  background: light-dark(white, #111);\n  color: light-dark(#111, white);\n}\n/* no color-scheme anywhere; the OS is in dark mode */",
          q: "What does the user see?",
          options: ["A dark page with light text", "A white page with dark text", "It flickers between both on load", "Nothing: light-dark() only works inside @media"],
          answer: 1,
          why: "`light-dark()` follows the element's **color-scheme**, not the media query, and the default scheme is light. Add `:root { color-scheme: light dark; }` and it follows the OS; `color-scheme: dark` on one element makes a dark island.",
        },
      ],
    },
    {
      title: "Viewport units and the URL bar",
      beats: [
        { t: "say", x: "On a phone the viewport changes size while you scroll: the URL bar slides away and the page gains height. `100vh` froze one answer, the **large** viewport with the bar hidden, so it's taller than what's visible on first load." },
        {
          t: "table",
          head: ["Unit", "Measures", "Use it for"],
          rows: [
            ["`svh`", "The viewport with browser UI shown: the smallest", "Anything that must fit on first load"],
            ["`lvh`", "The viewport with UI retracted: the largest", "Backgrounds that must never show a gap"],
            ["`vh`", "Behaves like `lvh` in mobile browsers", "Nothing new; it's why hero buttons get cut off"],
            ["`dvh`", "Whatever it is right now, updated as the UI moves", "Fixed overlays that should hug the visible area"],
          ],
        },
        {
          t: "predict",
          lang: "css",
          src: ".hero { height: 100vh; position: relative; }\n.hero .cta { position: absolute; bottom: 1rem; }",
          q: "A phone loads the page with the URL bar showing. Where is the button?",
          options: ["1rem above the bottom of what's visible", "Cut off or out of view until the user scrolls", "At the top of the hero", "Centred"],
          answer: 1,
          why: "`100vh` is the large viewport, taller than the visible area by the height of the browser UI, so the hero's bottom starts off-screen. `100svh` fits the first view exactly.",
        },
        {
          t: "pitfall",
          h: "dvh makes the layout move while scrolling",
          x: "Size the page in `dvh` and every URL bar movement resizes it: text reflows and whatever sits below jumps mid-scroll. Browsers throttle those updates, so it stutters rather than glides. Lay out in `svh`; keep `dvh` for fixed overlays that should hug the visible area.",
        },
        {
          t: "pitfall",
          h: "100vw is wider than the page",
          x: "`vw` includes the vertical scrollbar. Wherever scrollbars take space (Windows, Linux, a Mac with a mouse), a `width: 100vw` banner is one scrollbar wider than the page and adds a sideways scroll. Use `100%`. Chromium 145+ subtracts it when `html` has `scrollbar-gutter: stable`.",
        },
      ],
    },
    {
      title: "Container queries",
      beats: [
        { t: "say", x: "A component can't know where it'll be dropped: a wide column, a 280px sidebar, a modal. **Container queries** let it ask the only question that matters: how much room does my container give me?" },
        {
          t: "code",
          lang: "css",
          src: ".slot { container: card / inline-size; }   /* name / type, on the WRAPPER */\n\n.card { display: grid; gap: 1rem; }\n\n@container card (inline-size > 30rem) {\n  .card { grid-template-columns: 12rem 1fr; }\n}\n\n.card h3 {\n  font-size: clamp(1rem, 0.5rem + 3cqi, 1.75rem); /* 1cqi = 1% of the container's width */\n}",
          mark: [1, 5, 10],
          note: "An element can't query itself, only an ancestor. If a box could restyle itself based on a size that depends on those styles, layout would loop.",
        },
        {
          t: "play",
          mode: "html",
          title: "a card that measures its slot",
          html: `<p>Drag the corner of the dashed slot.</p>
<div class="slot">
  <article class="card">
    <div class="img"></div>
    <div>
      <h3>Field notes: a week in Lisbon</h3>
      <p>Trams, tiles and far too many custard tarts.</p>
    </div>
  </article>
</div>
<p id="w"></p>`,
          css: `body { font: 14px system-ui; }
.slot { container: card / inline-size; resize: horizontal; overflow: auto;
  width: 220px; min-width: 120px; max-width: 100%; box-sizing: border-box;
  border: 2px dashed #bbb; padding: 8px; }
.card { display: grid; gap: 10px; }
.img { aspect-ratio: 16 / 9; border-radius: 8px;
  background: linear-gradient(135deg, #d49a3a, #3a8ad4); }
.card h3 { margin: 0; font-size: clamp(1rem, 0.6rem + 3cqi, 1.5rem); line-height: 1.15; }
.card p { margin: 4px 0 0; color: #555; }
@container card (inline-size > 300px) {
  .card { grid-template-columns: 40% 1fr; align-items: start; }
}`,
          js: `const slot = document.querySelector('.slot');
new ResizeObserver(() => {
  document.getElementById('w').textContent = 'container: ' + Math.round(slot.clientWidth - 16) + 'px';
}).observe(slot);`,
          task: "Cross 300px and the card goes side by side. Add a query at 380px that enlarges the paragraph. Then delete `container` from `.slot`: the query and `cqi` stop tracking it.",
        },
        {
          t: "predict",
          lang: "css",
          src: ".toolbar { display: flex; gap: 8px; }\n.search { container-type: inline-size; }\n\n/* <div class=\"toolbar\">\n     <div class=\"search\"><input> <button>Go</button></div>\n   </div> */",
          q: "How wide is `.search`?",
          options: ["As wide as the input and button", "Zero: its content spills out", "The full toolbar width", "The container is ignored in flex layouts"],
          answer: 1,
          why: "`inline-size` containment means the box's width may not depend on its children: that's what breaks the query-layout loop. A flex item sized by its content then has nothing to measure. Give containers a width from outside: `flex: 1`, a grid track, a block.",
        },
        {
          t: "pitfall",
          h: "container-type: size collapses to zero height",
          x: "`size` contains both axes, so the height can't come from the content either. Without an explicit height the container is 0px tall and everything overflows it. Use `inline-size` unless the box already has a height from outside, like a full-screen panel.",
        },
        {
          t: "quiz",
          q: "`font-size: 5cqi` on an element with no container above it. What happens?",
          options: ["The declaration is invalid and ignored", "It computes to 0", "It resolves against the small viewport, like `5svw`", "It uses the parent's width"],
          answer: 2,
          why: "With no container, container units fall back to small viewport units. Nothing errors, so the bug is silent: the text looks fluid while you resize the window, but it ignores the card it sits in.",
        },
        {
          t: "code",
          lang: "css",
          src: ".panel { --tone: warn; }\n\n@container style(--tone: warn) {\n  .badge { background: gold; color: black; }\n}",
          note: "Style queries match a custom property on an ancestor. Every element is a style container, so no `container-type`. Baseline since May 2026, when Firefox 151 shipped it.",
        },
      ],
    },
    {
      title: "Custom properties with types",
      beats: [
        { t: "say", x: "Chapter 42 used custom properties as tokens. Under the hood an unregistered one is just a **list of tokens**: the browser has no idea `--x: 200px` is a length until `var()` pastes it into a real property." },
        {
          t: "predict",
          lang: "css",
          src: ".box { translate: var(--x) 0; animation: slide 2s linear; }\n\n@keyframes slide {\n  from { --x: 0px; }\n  to   { --x: 200px; }\n}\n/* --x is not registered with @property */",
          q: "What does the box do over the 2 seconds?",
          options: ["Slides smoothly to 200px", "Sits at 0 for a second, then jumps to 200px", "Never moves", "Jumps to 200px at the start"],
          answer: 1,
          why: "Without a type there's nothing to interpolate, so the property animates **discretely**: it flips from the start value to the end value at 50%. `translate` just follows whatever `--x` holds at that moment.",
        },
        {
          t: "code",
          lang: "css",
          src: "@property --x {\n  syntax: \"<length>\";   /* the type: now it can interpolate */\n  inherits: false;      /* required */\n  initial-value: 0px;   /* required for any syntax except \"*\" */\n}",
          note: "Same keyframes, now a smooth slide. A known `<length>`, `<color>` or `<angle>` can be interpolated; a token list can only be swapped.",
        },
        {
          t: "play",
          mode: "html",
          title: "registered vs not",
          html: `<div class="ring a"><span>unregistered</span></div>
<div class="ring b"><span>@property</span></div>`,
          css: `@property --b {
  syntax: "<angle>";
  inherits: false;
  initial-value: 0deg;
}
body { display: flex; gap: 24px; font: 13px system-ui; }
.ring { width: 130px; aspect-ratio: 1; border-radius: 50%; display: grid; place-items: center;
  animation: 2s ease-in-out infinite alternate; }
.ring span { width: 110px; aspect-ratio: 1; border-radius: 50%; background: #fff;
  display: grid; place-items: center; }
.a { background: conic-gradient(from var(--a), #d49a3a, #3a8ad4, #d49a3a 50%, #fff0 50%);
  animation-name: turn-a; }
.b { background: conic-gradient(from var(--b), #d49a3a, #3a8ad4, #d49a3a 50%, #fff0 50%);
  animation-name: turn-b; }
@keyframes turn-a { from { --a: 0deg; } to { --a: 180deg; } }
@keyframes turn-b { from { --b: 0deg; } to { --b: 180deg; } }`,
          task: "Gradients can't be transitioned, but a typed angle inside one can. Now delete `inherits: false;` from the rule: the right ring starts jumping too.",
        },
        {
          t: "pitfall",
          h: "A broken @property fails without a word",
          x: "Leave out `inherits`, or give a typed syntax no `initial-value` (or a relative one like `1em`), and the whole rule is dropped with no warning. Check: `getComputedStyle(el).getPropertyValue('--x')` on an element that never sets it returns the initial value only if registered.",
        },
        {
          t: "predict",
          lang: "css",
          src: ".card {\n  --gap: red;               /* a mistyped token */\n  margin: var(--gap, 1rem);\n}",
          q: "What margin does `.card` get?",
          options: ["1rem, the fallback", "0, the initial value", "Whatever an earlier `margin` rule said", "The whole rule is dropped"],
          answer: 1,
          why: "The fallback only runs when `--gap` is missing. It exists, so `margin: red` is built, fails at computed-value time and becomes `unset`: 0. Register `--gap` as `<length>` and the bad value is rejected, leaving its initial value.",
        },
        {
          t: "code",
          lang: "css",
          src: ":root { --accent: oklch(60% 0.18 255); }\n\n.btn       { background: var(--accent); }\n.btn:hover { background: color-mix(in oklch, var(--accent), black 15%); }\n.chip      { background: color-mix(in oklch, var(--accent) 15%, transparent); }\n\n/* relative colour: take the token apart, change one channel */\n.btn:disabled { background: oklch(from var(--accent) l calc(c * 0.3) h); }",
          note: "One token, every state derived from it. `color-mix()` is Baseline since 2023, relative colour since 2024. Why oklch and not HSL is chapter 40.",
        },
        {
          t: "pitfall",
          h: "Animating a token on :root restyles the page",
          x: "Animate a registered `inherits: true` property on `:root` (a theme hue, a scroll progress) and every element that inherits it gets its style recomputed, every frame: the whole page. Register it `inherits: false` and animate it on the element that uses it.",
        },
      ],
    },
    {
      title: "Nesting, logical properties and :has()",
      beats: [
        {
          t: "code",
          lang: "css",
          src: ".card {\n  padding: 1rem;\n\n  & h3 { margin: 0; }                 /* .card h3 */\n  &:hover { outline: 1px solid; }     /* .card:hover */\n  .theme-dark & { background: #222; } /* .theme-dark .card */\n\n  @media (width > 40rem) {            /* media queries nest too */\n    padding: 2rem;\n  }\n}",
          note: "Native nesting, Baseline since 2023. A nested rule may start with an element name (`h3 {}`); the `&` just makes intent obvious.",
        },
        {
          t: "predict",
          lang: "css",
          src: "#sidebar, .card {\n  & a { color: green; }\n}\n.card a.link { color: red; }\n\n/* <div class=\"card\"><a class=\"link\">Docs</a></div> */",
          q: "What colour is the link?",
          options: ["red: `.card a.link` is more specific", "green", "red: it comes later", "It depends on whether #sidebar exists"],
          answer: 1,
          why: "Nesting treats `& a` as `:is(#sidebar, .card) a`, and `:is()` scores as its **most specific** argument. So it's (1,0,1) even inside `.card`, beating (0,2,1). Sass would have emitted two separate selectors.",
        },
        {
          t: "pitfall",
          h: "&__title is not Sass",
          x: "Native nesting joins selectors, never strings. `.card { &__title {} }` is not `.card__title`: the nested rule is dropped or matches nothing, and no error says so. Write BEM names out in full, or keep that code in a preprocessor.",
        },
        {
          t: "compare",
          a: { label: "Physical", lang: "css", src: ".note {\n  margin-left: 1rem;\n  padding-right: 2rem;\n  border-left: 3px solid;\n  width: 20rem;\n}" },
          b: { label: "Logical", lang: "css", src: ".note {\n  margin-inline-start: 1rem;\n  padding-inline-end: 2rem;\n  border-inline-start: 3px solid;\n  inline-size: 20rem;\n}" },
          x: "Identical in English. Under `dir=\"rtl\"` the right one flips sides; the left one keeps its border on the wrong edge of Arabic text. In vertical writing modes inline turns vertical. Default to logical.",
        },
        { t: "say", x: "`:has()` is more than a parent selector. It lets any element style itself from **state anywhere below it**: a checked box, an invalid field, an open dialog. Most toggle-a-class JavaScript is really a `:has()` rule." },
        {
          t: "play",
          mode: "html",
          title: "state without JS",
          html: `<label><input type="checkbox" id="dense"> Dense</label>
<form>
  <div class="field"><label>Email <input type="email" required></label></div>
  <div class="field"><label>Name <input required></label></div>
  <button>Save</button>
</form>`,
          css: `body { font: 14px system-ui; }
body:has(#dense:checked) { --pad: 4px; }
form { display: grid; gap: 8px; margin-top: 12px; max-width: 280px; }
.field { padding: var(--pad, 14px); border: 2px solid #ddd; border-radius: 8px; }
.field input { display: block; width: 100%; box-sizing: border-box; margin-top: 4px; }
.field:has(:focus) { border-color: royalblue; }
.field:has(:user-invalid) { border-color: crimson; background: #fff0f0; }
form:has(:invalid) button { opacity: .4; }`,
          task: "Give an input a placeholder and style its field while empty with `:has(input:placeholder-shown)`. Then dim every unfocused field: `form:has(:focus) .field:not(:has(:focus))`.",
        },
        {
          t: "pitfall",
          h: "A wide :has() anchor rechecks on every change",
          x: "`body:has(.x .y)` can match through the whole document, so the engine re-evaluates it as nodes and classes change anywhere below. Anchor `:has()` on the nearest element that needs it and prefer `:has(> .child)`: a smaller subtree to search on each change.",
        },
      ],
    },
    {
      title: "Motion with less JavaScript",
      beats: [
        {
          t: "table",
          head: ["", "Transition", "Keyframe animation"],
          rows: [
            ["Starts when", "A property's computed value changes", "The `animation` property is applied"],
            ["Goes", "From the current value to the new one", "Through fixed keyframes"],
            ["Interrupted", "Reverses from where it is", "Removed: snaps back to the base style"],
            ["Use it for", "State changes: hover, open, selected", "Loops, attention, multi-step sequences"],
          ],
        },
        {
          t: "predict",
          lang: "css",
          src: ".a { transition: translate 1s; }\n.a:hover { translate: 200px; }\n\n.b:hover { animation: go 1s forwards; }\n@keyframes go { to { translate: 200px; } }",
          q: "Hover both for half a second, then move away. What happens?",
          options: ["Both glide back", "A glides back from where it is; B snaps to the start", "Both snap back", "B glides back; A snaps"],
          answer: 1,
          why: "Un-hovering changes A's target, so a new transition starts from its current position, shortened to match the distance covered. For B, un-hovering removes the animation, and its effect goes with it.",
        },
        {
          t: "predict",
          lang: "css",
          src: ".toast { display: none; opacity: 0; transition: opacity .3s; }\n.toast.show { display: block; opacity: 1; }",
          q: "You add `.show`. What does the toast do?",
          options: ["Fades in over 0.3s", "Appears instantly at full opacity", "Stays invisible", "Fades in, then vanishes"],
          answer: 1,
          why: "Transitions never start from `display: none`: there was no rendered 'before' to animate from, so you get the end state at once. `@starting-style` gives the browser a before.",
        },
        {
          t: "code",
          lang: "css",
          src: ".toast {\n  opacity: 1;\n  translate: 0 0;\n  transition: opacity .25s, translate .25s,\n              display .25s allow-discrete;   /* stay rendered while exiting */\n}\n@starting-style {                  /* entry: where to come from */\n  .toast { opacity: 0; translate: 0 1rem; }\n}\n.toast[hidden] {                   /* exit: where to go */\n  display: none;\n  opacity: 0;\n  translate: 0 1rem;\n}",
          mark: [5, 7],
          note: "Entry works in every engine (Baseline 2024). The exit needs an animatable `display`: Chromium and Safari 18. Firefox hides it at once, a fine fallback.",
        },
        {
          t: "play",
          mode: "html",
          title: "enter and exit, no JS animation",
          html: `<button id="t">Toggle toast</button>
<div class="toast" hidden>Saved. <a href="#">Undo</a></div>`,
          css: `body { font: 14px system-ui; }
.toast {
  position: fixed; left: 16px; bottom: 16px; padding: 12px 16px;
  background: #1d1b18; color: #fff; border-radius: 10px;
  opacity: 1; translate: 0 0;
  transition: opacity .25s, translate .25s, display .25s allow-discrete;
}
.toast a { color: #f5c26b; }
@starting-style {
  .toast { opacity: 0; translate: 0 1rem; }
}
.toast[hidden] { display: none; opacity: 0; translate: 0 1rem; }`,
          js: `const toast = document.querySelector('.toast');
document.getElementById('t').onclick = () => { toast.hidden = !toast.hidden; };`,
          task: "Delete the `@starting-style` block: the entry snaps. Put it back above the `.toast` rule: it snaps again. Then remove `allow-discrete` and watch the exit.",
        },
        {
          t: "pitfall",
          h: "@starting-style has no priority",
          x: "Starting styles cascade like any other rule, by specificity and order. Put the block above the rule it's meant to override and that rule wins: no entry animation, no error. Keep it after the base rule.",
        },
        { t: "say", x: "`document.startViewTransition(update)` snapshots the page, runs your DOM update, then animates old to new. Any element with a `view-transition-name` gets its own snapshot pair that morphs position and size: FLIP from chapter 31, done by the browser." },
        {
          t: "play",
          mode: "html",
          title: "a view transition shuffle",
          html: `<button id="go">Shuffle</button>
<div id="list"></div>`,
          css: `body { font: 600 16px system-ui; }
#list { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
#list div { width: 56px; height: 56px; border-radius: 10px; display: grid;
  place-items: center; color: #fff; }
::view-transition-group(*) { animation-duration: .5s; }`,
          js: `const list = document.getElementById('list');
for (let i = 0; i < 12; i++) {
  const d = document.createElement('div');
  d.textContent = i;
  d.style.background = \`hsl(\${i * 30} 60% 45%)\`;
  d.style.viewTransitionName = \`tile-\${i}\`; // unique per element
  list.append(d);
}

function shuffle() {
  const items = [...list.children];
  for (let i = items.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [items[i], items[j]] = [items[j], items[i]];
  }
  list.append(...items);
}

document.getElementById('go').onclick = () => {
  if (!document.startViewTransition) return shuffle(); // no support: just update
  document.startViewTransition(shuffle);
};`,
          task: "Give tiles 1 and 2 the same name and shuffle: no animation at all. Then remove every name except one and see the rest crossfade as part of the page.",
        },
        {
          t: "pitfall",
          h: "One duplicate name cancels the whole transition",
          x: "If two rendered elements share a `view-transition-name` when the snapshot is taken, the browser skips the entire transition: the DOM still updates, it just jumps. Generate names per item, or use `view-transition-name: match-element`.",
        },
        {
          t: "table",
          head: ["Feature", "Where it works", "Ship it as"],
          rows: [
            ["Same-document view transitions", "All engines; Baseline since October 2025", "Enhancement: feature-detect the call"],
            ["`@view-transition` across pages", "Chromium 126+, Safari 18.2+", "Free polish; Firefox navigates normally"],
            ["Scroll-driven animations", "Chromium 115+, Safari 26+; Firefox behind a flag", "Decoration inside `@supports`"],
            ["`@starting-style` entries", "All engines; Baseline 2024", "The default"],
            ["Animating `display` for exits", "Chromium 117+, Safari 18+", "Enhancement: Firefox just hides"],
            ["`interpolate-size` to `height: auto`", "Chromium 129+ only", "Enhancement: elsewhere it snaps"],
          ],
          caption: "Checked against Baseline data in September 2026. The middle column moves; re-check before you depend on it.",
        },
      ],
    },
    {
      title: "Rebuild: a fluid type scale",
      beats: [
        { t: "say", x: "Every fluid type tool is the line from earlier plus a ratio at each end: a small ratio on narrow screens so headings don't shout, a bigger one on wide screens. Build the generator, then feel it in a box you can resize." },
        {
          t: "rebuild",
          h: "clamp() generator with a live preview",
          x: "Two sizes at two widths and a ratio at each end give one `clamp()` per step. It uses `cqi` so the dashed box stands in for the viewport; the defaults fit this small preview. Drag the corner. The maths is identical for `vw`.",
          mode: "html",
          html: `<div class="ui">
  <label>min <input id="a" type="number" value="16"> px at <input id="w1" type="number" value="160"> px</label>
  <label>max <input id="b" type="number" value="20"> px at <input id="w2" type="number" value="440"> px</label>
  <label>ratio <input id="r1" type="number" step="0.025" value="1.2"> to <input id="r2" type="number" step="0.025" value="1.333"></label>
</div>
<p id="read"></p>
<div class="stage">
  <p class="s3">Step 3</p><p class="s2">Step 2</p><p class="s1">Step 1</p>
  <p class="s0">Step 0 is body text that wraps.</p>
</div>
<pre id="out"></pre>
<style id="live"></style>`,
          css: `body { font: 12px system-ui; }
.ui { display: grid; gap: 4px; }
input { width: 4.5em; }
pre { font-size: 10.5px; background: #f4f1ec; padding: 6px; overflow: auto; }
.stage { container-type: inline-size; resize: horizontal; overflow: auto;
  width: 300px; min-width: 120px; max-width: 100%; border: 2px dashed #bbb; padding: 0 8px; }
.stage p { margin: 6px 0; line-height: 1.15; }`,
          js: `const $ = (id) => document.getElementById(id);
const r = (n) => +n.toFixed(4);
const stage = document.querySelector('.stage');

// a line through (w1, px1) and (w2, px2), clamped at both ends
function fluid(px1, px2, w1, w2, unit) {
  const slope = (px2 - px1) / (w2 - w1);   // px of type per px of width
  const b = px1 - slope * w1;              // the size at width 0
  const lo = Math.min(px1, px2), hi = Math.max(px1, px2);
  return \`clamp(\${r(lo / 16)}rem, \${r(b / 16)}rem + \${r(slope * 100)}\${unit}, \${r(hi / 16)}rem)\`;
}

function build() {
  const [a, b, w1, w2, r1, r2] = ['a', 'b', 'w1', 'w2', 'r1', 'r2'].map((id) => +$(id).value);
  let css = '';
  for (let i = 0; i <= 3; i++) {
    css += \`.s\${i} { font-size: \${fluid(a * r1 ** i, b * r2 ** i, w1, w2, 'cqi')}; }\\n\`;
  }
  $('out').textContent = css;
  $('live').textContent = css;
  read();
}

function read() {
  const w = Math.round(parseFloat(getComputedStyle(stage).width));
  const size = (sel) => parseFloat(getComputedStyle(document.querySelector(sel)).fontSize).toFixed(1) + 'px';
  $('read').textContent = \`container \${w}px: step 0 = \${size('.s0')}, step 3 = \${size('.s3')}\`;
}

new ResizeObserver(read).observe(stage);
document.querySelectorAll('input').forEach((el) => (el.oninput = build));
build();`,
          task: "Print a warning for any step whose max is over 2.5 x its min. Then add a vw/cqi switch and see why the vw version ignores the dragged box.",
        },
        {
          t: "mission",
          h: "A three-way theme switch, no flash",
          x: "Build System / Light / Dark with one set of `light-dark()` tokens. The choice persists, the first paint is already right, and a code block stays dark in both themes without a single extra token.",
          hint: "`color-scheme: light dark` on `:root` lets the OS decide; `data-theme` narrows it. Unregistered tokens resolve where they're used, so `color-scheme: dark` on the code block is enough.",
          solution: {
            lang: "html",
            src: `<script>
  // in <head>, before first paint (chapter 42)
  try {
    const t = localStorage.getItem('theme');
    if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  } catch {}
</script>
<style>
  :root {
    color-scheme: light dark;             /* system: the OS decides */
    --bg:   light-dark(#fbfaf8, #16171a);
    --text: light-dark(#1d1b18, #ecebe8);
  }
  :root[data-theme="light"] { color-scheme: light; }
  :root[data-theme="dark"]  { color-scheme: dark; }
  body { background: var(--bg); color: var(--text); }
  pre  { color-scheme: dark; background: var(--bg); color: var(--text); }
</style>

<select id="theme">
  <option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option>
</select>
<pre>npm run build</pre>
<script>
  const root = document.documentElement, pick = document.getElementById('theme');
  pick.value = root.dataset.theme || 'system';
  pick.onchange = () => {
    const v = pick.value;
    if (v === 'system') delete root.dataset.theme; else root.dataset.theme = v;
    try { v === 'system' ? localStorage.removeItem('theme') : localStorage.setItem('theme', v); } catch {}
  };
</script>`,
          },
        },
      ],
    },
  ],
  nobodyTells: [
    "Before adding a breakpoint, ask what the layout should do, not at which width. Most answers are `auto-fit`, `flex-wrap` or `clamp()`.",
    "Write the two points above every fluid clamp: `/* 16px at 320, 24px at 1280 */`. Nobody can reverse-engineer `0.8333rem + 0.8333vw`.",
    "Test responsive work by dragging a container, not by clicking device presets. The bugs live at widths no preset has.",
    "Chrome DevTools puts a `container` badge on every query container in the Elements panel. Click it to see what a query is measuring.",
    "`:has()` can't be nested and can't contain pseudo-elements. A selector that tries is dropped whole.",
    "Emulate `prefers-color-scheme` and `prefers-reduced-motion` in the DevTools Rendering panel before you ship. Your machine runs one combination; your users run all four.",
    "An unregistered token holding `light-dark()` resolves on each element that uses it, so one `color-scheme` declaration re-themes a whole subtree.",
  ],
  glossary: [
    ["intrinsic layout", "A layout driven by rules about content and space (auto-fit, wrap, clamp) instead of fixed breakpoints."],
    ["clamp()", "`clamp(MIN, VAL, MAX)` = `max(MIN, min(VAL, MAX))`. With `rem + vw` in the middle it's a line with a floor and a ceiling."],
    ["range syntax", "Media query comparisons like `(width <= 600px)` that leave no gap at fractional widths."],
    ["container query", "`@container`: styles based on the size, or custom properties, of an ancestor container instead of the viewport."],
    ["cqi", "1% of the query container's inline size. Falls back to small viewport units when there's no container."],
    ["svh, lvh, dvh", "Viewport height with the browser UI shown, retracted, or whatever it is right now."],
    ["@property", "Registers a custom property with a type, inheritance and initial value, which makes it interpolatable."],
    ["discrete animation", "How a property that can't interpolate animates: it flips from start to end value at 50%."],
    ["light-dark()", "Picks one of two colours from the element's used `color-scheme`, not from the media query."],
    ["color-mix()", "Mixes two colours in a chosen space: `color-mix(in oklch, var(--accent), black 15%)`."],
    ["logical properties", "Box properties named by inline/block and start/end, so they follow direction and writing mode."],
    [":has()", "Matches an element when the selector inside matches relative to it: a parent and state selector."],
    ["@starting-style", "Gives the before-values for an element's first style, so entry transitions can run from display: none."],
    ["allow-discrete", "A `transition-behavior` value that lets discrete properties like `display` take part in a transition."],
    ["view transition", "The browser snapshots old and new states and animates between them; named elements morph on their own."],
  ],
  explain: "Explain to a friend how `clamp(1rem, 0.8333rem + 0.8333vw, 1.5rem)` was derived, and why pure `vw` text doesn't grow when they zoom in.",
};
