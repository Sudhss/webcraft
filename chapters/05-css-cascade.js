const raw = String.raw;

export default {
  id: "css-cascade",
  n: 5,
  part: "B",
  title: "CSS I: the cascade and the box",
  hook: "Specificity is only the fifth of seven keys in the cascade's sort. Then the box, margins, and why z-index 9999 loses.",
  minutes: 75,
  levels: ["use", "understand", "rebuild"],
  sections: [
    {
      title: "The cascade is a sort",
      beats: [
        {
          t: "code",
          lang: "js",
          src: `// For one element and one property: collect every matching declaration,
// sort by this key (compared left to right, like a tuple), take the top.
const key = (d) => [
  d.originAndImportance, // browser < user < author < animations < !important < transitions
  d.context,             // shadow DOM: the page vs the component's own styles
  d.isStyleAttribute,    // style="" outranks every selector
  d.layer,               // @layer order; unlayered comes last
  d.specificity,         // (ids, classes, types)
  d.scopeProximity,      // @scope: fewer steps up to the scope root wins
  d.orderOfAppearance,   // later in the document wins
];`,
          mark: [8],
          note: "Specificity is the **fifth** key. Most \"my CSS doesn't apply\" bugs come from raising it when an earlier key had already decided.",
        },
        {
          t: "table",
          caption: "Importance reverses the origins. That's deliberate: `!important` exists so the reader, not the site, gets the last word.",
          head: ["Precedence, low to high", "What's in it"],
          rows: [
            ["1. browser, normal", "the defaults: `display: block` on `div`, margins on `p`, blue links"],
            ["2. user, normal", "the reader's own stylesheet, where a browser still allows one"],
            ["3. author, normal", "your CSS: every layer, then unlayered rules, then `style` attributes"],
            ["4. animations", "values from running `@keyframes`"],
            ["5. author, `!important`", "unlayered weakest, then layers in reverse, `style` attributes strongest"],
            ["6. user, `!important`", "how a reader's stylesheet beats even your `!important`"],
            ["7. browser, `!important`", "a few rules you can't override, like parts of `:fullscreen`"],
            ["8. transitions", "a running transition beats everything"],
          ],
        },
        {
          t: "predict",
          lang: "css",
          src: `.btn { background: navy !important; }

@keyframes flash { to { background: gold; } }
.btn.flash { animation: flash .5s infinite alternate; }`,
          q: "`.flash` is added to the button. What happens?",
          options: ["It pulses navy to gold", "It stays navy", "It turns gold and stays gold", "It pulses only on hover"],
          answer: 1,
          why: "Animations rank above normal author styles and below every `!important`. One old `!important` silently freezes an animation, with no error anywhere. Only transitions outrank it.",
        },
        {
          t: "predict",
          lang: "html",
          src: `<!-- inside x-card's shadow root -->
<style>
  :host { display: block; }
</style>

<!-- in the page -->
<style>
  x-card { display: flex; }
</style>`,
          q: "What is `x-card`'s display?",
          options: ["block: the component's own styles win", "flex: the page wins", "block: `:host` (0,1,0) beats `x-card` (0,0,1)"],
          answer: 1,
          why: "**Context** is sorted before specificity: across a shadow boundary, normal page rules beat the component's `:host` rules. That makes `:host` styles defaults the user can override. With `!important`, the inside wins.",
        },
        {
          t: "pitfall",
          h: "`!important` is a separate lane, not extra weight",
          x: "Two `!important` declarations fight again on the remaining keys: layer (reversed), specificity, order. So important wars only escalate. Keep it for utilities that must always win and for beating a third-party widget's `style=\"\"` attribute.",
        },
        {
          t: "pitfall",
          h: "Code-split CSS makes the winner depend on the route",
          x: "Order of appearance is DOM order, and lazy chunks inject their `<link>` when first loaded. Two equal-specificity rules in different chunks now resolve by which page the user opened first, so the bug needs one click path to show. Layers fix it: their order is declared, not loaded.",
        },
      ],
    },
    {
      title: "Layers: an order you declare",
      beats: [
        {
          t: "code",
          lang: "css",
          src: `@layer reset, base, components, utilities;   /* the whole order, stated once */

@layer utilities {
  .mt-0 { margin-top: 0; }                    /* (0,1,0) */
}
@layer components {
  #sidebar .card h2 { margin-top: 1rem; }     /* (1,1,1), and it still loses */
}`,
          mark: [1],
          note: "Layer order is compared **before** specificity. `.mt-0` beats `#sidebar .card h2` because `utilities` is declared later, even though its rule appears first in the file.",
        },
        {
          t: "predict",
          lang: "css",
          src: `@layer base {
  #main p { color: blue; }
}

p { color: red; }`,
          q: "A `<p>` inside `<main id=\"main\">`. What colour?",
          options: ["blue: an id beats a type", "red: unlayered beats layered", "blue: it came first"],
          answer: 1,
          why: "Unlayered rules sit in an implicit final layer, above every named one. A bare `p` beats `#main p` inside a layer. Specificity only breaks ties **within** one layer.",
        },
        {
          t: "predict",
          lang: "css",
          src: `@layer base, theme;

@layer base  { p { color: blue !important; } }
@layer theme { p { color: red !important; } }
p { color: green !important; }`,
          q: "What colour is the paragraph?",
          options: ["blue", "red", "green"],
          answer: 0,
          why: "For `!important` the layer order flips: the **first** layer wins and unlayered is weakest. So a reset layer can pin a few rules, like `[hidden] { display: none !important }`, and no later layer can undo them.",
        },
        {
          t: "play",
          mode: "html",
          title: "putting a UI kit in its place",
          html: `<button class="btn">plain</button>
<button class="btn btn-ghost">ghost</button>
<button class="btn mt-4">with a utility</button>`,
          css: `@layer vendor, components, utilities;

@layer vendor {
  /* a UI kit's CSS: very specific, and it used to win */
  html body button.btn:not(.x) { background: #444; color: #fff; border: 0;
    padding: 8px 14px; border-radius: 0; font: inherit; }
}
@layer components {
  .btn { background: #d49a3a; color: #111; border-radius: 8px; }
  .btn-ghost { background: none; box-shadow: inset 0 0 0 2px #d49a3a; }
}
@layer utilities {
  .mt-4 { margin-top: 16px; display: block; }
}`,
          js: `for (const b of document.querySelectorAll('button')) {
  const s = getComputedStyle(b);
  console.log(b.className.padEnd(14), s.backgroundColor, 'radius', s.borderRadius);
}`,
          task: "Move `vendor` to the end of line 1: the kit's colours and corners win again. Then delete the `@layer vendor {` line and its closing `}`: unlayered, it beats all three layers.",
        },
        {
          t: "pitfall",
          h: "Unlayered CSS beats every utility",
          x: "Tailwind v4 ships its utilities in a real `@layer utilities`. A global `button { padding: 0 }` you wrote outside any layer now beats `p-4` on every button, whatever the specificity. Put your own CSS in a layer too, or treat unlayered as the strongest place.",
        },
        {
          t: "code",
          lang: "css",
          file: "entry.css, the first stylesheet the page loads",
          src: `@layer reset, vendor, base, components, utilities;
@import url("reset.css") layer(reset);
@import url("datepicker.css") layer(vendor);

@layer components {
  .datepicker { border-radius: 12px; }  /* beats the vendor, whatever its selectors */
}`,
          mark: [3],
          note: "`@import` must come before every rule except `@charset` and `@layer` statements, so the order statement goes first. CSS you can't edit goes into a layer this way.",
        },
        {
          t: "pitfall",
          h: "The first mention of a layer fixes its place",
          x: "Layers are ordered by where each name **first** appears. A stray `@layer utilities { }` in a file that loads before your `@layer reset, base, ...` statement makes `utilities` the weakest layer. Keep the order statement in the first CSS the page loads.",
        },
        {
          t: "mission",
          h: "Layer a stylesheet that fights itself",
          x: "Take a real stylesheet with ids, `!important` and `html body` selectors. Move it into `reset`, `base`, `components` and `utilities` layers, wrap resets in `:where()`, and delete every `!important` and id selector without the page changing.",
          hint: "Screenshot before, compare after each step. DevTools' Styles pane shows each rule's layer and strikes through the losers, so you can see which key decided.",
        },
      ],
    },
    {
      title: "Specificity, properly",
      beats: [
        { t: "say", x: "Specificity is three counts: **a** ids, **b** classes, attributes and pseudo-classes, **c** types and pseudo-elements. Compare left to right like version numbers, so one id beats any number of classes. `*` and combinators count nothing." },
        {
          t: "viz",
          name: "specificity",
          props: {
            selectors: [
              "p",
              ".card p",
              "#main .card p",
              ":is(#hero, .card) p",
              ":where(#main .card) p",
              "p:not(.done, #x)",
              "li:nth-child(2n of .done)",
              "a:has(> img)",
              "p::first-line",
            ],
          },
        },
        {
          t: "predict",
          lang: "css",
          src: `/* there is no #hero anywhere on the page */
:is(#hero, .card) .title { color: red; }
.card .title.big         { color: blue; }`,
          q: "`<div class=\"card\"><h2 class=\"title big\">`. What colour?",
          options: ["blue: (0,3,0) beats (0,2,0)", "red: (1,1,0) beats (0,3,0)", "blue: `#hero` didn't match, so it doesn't count"],
          answer: 1,
          why: "`:is()`, `:not()` and `:has()` score as their **most specific argument**, whether or not that argument matched. The `#hero` you never use still adds an id. Only `:where()` scores zero.",
        },
        {
          t: "quiz",
          q: "`p:not(.a):not(.b)` and `p:not(.a, .b)` match exactly the same elements. What are their specificities?",
          options: ["both (0,2,1)", "(0,2,1) and (0,1,1)", "both (0,1,1)", "(0,1,1) and (0,2,1)"],
          answer: 1,
          why: "Each `:not()` counts its heaviest argument once. Two chained ones count two classes; one with a list counts one. Merging them in a cleanup silently lowers specificity and can flip a winner.",
        },
        {
          t: "compare",
          a: {
            label: "a reset that fights back",
            lang: "css",
            src: `ul[class] { list-style: none; padding: 0; }   /* (0,1,1) */

.steps { padding-left: 2rem; }               /* (0,1,0): loses */`,
          },
          b: {
            label: "a reset that yields",
            lang: "css",
            src: `:where(ul[class]) { list-style: none; padding: 0; }   /* (0,0,0) */

.steps { padding-left: 2rem; }                       /* wins */`,
          },
          x: "Write resets and library defaults inside `:where()`. They match the same elements but score zero, so any single class overrides them, in any order.",
        },
        {
          t: "pitfall",
          h: "Nesting's `&` is `:is()` in disguise",
          x: "`#nav, .menu { & a { } }` means `:is(#nav, .menu) a`, so links in `.menu` carry an id's weight too. Sass wrote out `#nav a, .menu a` instead. Moving from Sass to native nesting (chapter 7) can quietly change who wins.",
        },
        {
          t: "predict",
          lang: "html",
          src: `<style>
  @scope (.light) { a { color: navy; } }
  @scope (.dark)  { a { color: plum; } }
</style>

<section class="dark">
  <div class="light">
    <a href="#">link</a>
  </div>
</section>`,
          q: "Both rules are a bare `a`, (0,0,1), and `.dark` comes last. What colour is the link?",
          options: ["plum: it comes later", "navy: its scope root is closer", "the parent's colour: the scopes cancel out"],
          answer: 1,
          why: "After specificity comes **scope proximity**: fewer steps up the tree to the scope root wins, before source order. `.light` is 1 step up, `.dark` is 2, so nested themes just work. Chrome 118, Safari 17.4, Firefox 146.",
        },
      ],
    },
    {
      title: "Inheritance and computed values",
      beats: [
        {
          t: "predict",
          lang: "css",
          src: "div { display: initial; }",
          q: "What does that do to every `div`?",
          options: ["Nothing: they stay `block`", "They become `inline`", "They become `none`", "They take their parent's display"],
          answer: 1,
          why: "`initial` is the **spec's** initial value, not the browser's default. For `display` that's `inline`; `block` on a div comes from the browser's stylesheet. To get that back, use `revert`.",
        },
        {
          t: "table",
          head: ["Keyword", "Means", "`display` on a `<div>`"],
          rows: [
            ["`inherit`", "the parent's computed value, even for properties that don't inherit", "the parent's display"],
            ["`initial`", "the property's initial value, from its spec", "`inline`"],
            ["`unset`", "`inherit` if the property inherits (text things), else `initial`", "`inline`"],
            ["`revert`", "as if no author CSS existed: back to user, then browser styles", "`block`"],
            ["`revert-layer`", "as if this layer didn't set it: earlier layers, then like `revert`", "an earlier layer's value, or `block`"],
          ],
        },
        {
          t: "play",
          mode: "html",
          title: "all: unset vs revert vs initial",
          html: `<div class="theme">
  <button class="unset">all: unset</button>
  <button class="revert">all: revert</button>
  <button class="initial">all: initial</button>
  <button>untouched</button>
</div>`,
          css: `.theme { color: teal; font: italic 18px Georgia, serif; }
button { background: #d49a3a; border: 0; padding: 8px 12px; border-radius: 8px; }

.unset   { all: unset; }
.revert  { all: revert; }
.initial { all: initial; }`,
          js: `for (const b of document.querySelectorAll('button')) {
  const s = getComputedStyle(b);
  console.log((b.className || 'untouched').padEnd(10), s.display.padEnd(13), s.color, s.fontFamily);
}`,
          task: "Press Tab through them: two lost their focus ring. And the untouched button ignores Georgia: browsers set `font` on form controls, so resets add `font: inherit`.",
        },
        {
          t: "pitfall",
          h: "`all: unset` makes buttons keyboard-invisible",
          x: "The browser's focus ring is a browser-origin declaration like any other, and your `unset` outranks it. Keyboard users lose track of where they are. After any `all:` reset, write your own `:focus-visible` outline, and check `display`, which is now `inline`.",
        },
        {
          t: "steps",
          h: "From declarations to pixels",
          items: [
            "**Cascaded**: the winner of the sort, if anything matched at all.",
            "**Specified**: the cascaded value, with `inherit` or `revert` resolved. If nothing won: the parent's value for inherited properties, else the initial value.",
            "**Computed**: made absolute without layout. `2em` becomes px and `bolder` a number, but `width: 50%` and unitless `line-height` stay. Children inherit this.",
            "**Used**: after layout. `auto` and `50%` become real pixels.",
            "**Actual**: rounded to what the device can draw.",
          ],
        },
        {
          t: "predict",
          lang: "css",
          src: `article    { font-size: 16px; line-height: 1.5em; }
article h2 { font-size: 32px; }`,
          q: "What is the `h2`'s line-height?",
          options: ["48px", "24px", "1.5", "normal"],
          answer: 1,
          why: "Children inherit **computed** values. `1.5em` computes to 24px on the article, so the 32px heading inherits 24px and its lines overlap. Unitless `line-height: 1.5` stays the number 1.5, and each child multiplies its own size.",
        },
        {
          t: "predict",
          lang: "js",
          src: `// <span id="tip" style="position: absolute">hi</span>
getComputedStyle(tip).display;`,
          q: "What does it return?",
          options: ["\"inline\"", "\"block\"", "\"inline-block\"", "\"absolute\""],
          answer: 1,
          why: "Absolute positioning and floats **blockify** the box at computed-value time: `inline` becomes `block`, `inline-flex` becomes `flex`. Flex and grid items get the same treatment, which is why `display: inline` on a flex child changes nothing.",
        },
        {
          t: "pitfall",
          h: "`getComputedStyle` isn't always the computed value",
          x: "It returns **resolved** values. For `width`, `height`, margins and padding on a rendered element that's the used value in px. On a `display: none` element there's no layout, so you get the computed value, like `auto` or `50%`. Only measure what's rendered.",
        },
      ],
    },
    {
      title: "The box, and what percentages mean",
      beats: [
        { t: "viz", name: "boxmodel" },
        { t: "say", x: "By default `width` sets the **content** box. Padding and border go on top, so `width: 100%; padding: 16px` overflows its parent by 32px. `box-sizing: border-box` makes `width` include padding and border. Margin is always outside." },
        {
          t: "code",
          lang: "css",
          src: "*, *::before, *::after { box-sizing: border-box; }",
          note: "`*` doesn't match pseudo-elements, hence the extra selectors. `min-width`, `max-width` and `flex-basis` measure the same box `width` does.",
        },
        {
          t: "quiz",
          q: "Added on hover, which one moves the neighbours?",
          options: ["`outline: 4px solid`", "`box-shadow: 0 0 0 4px`", "`border: 4px solid`, on a box that had none", "`transform: scale(1.05)`"],
          answer: 2,
          why: "A border is part of the box, so layout reruns and neighbours shift. Outlines, shadows and transforms are painted over the layout without changing it. That's why focus rings use `outline` and hover effects use shadows.",
        },
        {
          t: "table",
          caption: "The containing block is usually the parent's content box. Positioned elements get a different one: chapter 6.",
          head: ["A percentage on", "resolves against"],
          rows: [
            ["`width`, `left`, `right`", "the containing block's width"],
            ["`height`, `top`, `bottom`", "the containing block's height, but only if that height is definite"],
            ["`padding` and `margin`, all four sides", "the containing block's **width**, even for top and bottom"],
            ["`translate()` in `transform`", "the element's own border box"],
            ["`border-radius`", "the element's own border box: width for horizontal radii, height for vertical"],
            ["`font-size`", "the parent's font size"],
            ["`line-height`", "the element's own font size, then inherited as a fixed length"],
          ],
        },
        {
          t: "predict",
          lang: "css",
          src: `.frame { width: 400px; height: 100px; }
.frame > div { padding-top: 50%; }   /* the div is empty */`,
          q: "How tall is the inner div?",
          options: ["50px", "200px", "0", "100px"],
          answer: 1,
          why: "Vertical padding and margin percentages resolve against the containing block's **width**: 50% of 400 is 200. That was the old aspect-ratio hack. Today use `aspect-ratio`, and suspect it when a `margin-top: 5%` grows with the window's width.",
        },
        {
          t: "pitfall",
          h: "`height: 100%` of an `auto` parent is `auto`",
          x: "A percentage height needs a containing block with a **definite** height. If the parent's height comes from its content, the percentage behaves as `auto` and the box shrinks to fit. Hence the `html, body { height: 100% }` chains. Put `min-height: 100dvh` on what should fill the screen instead.",
        },
      ],
    },
    {
      title: "Margins collapse, formatting contexts contain",
      beats: [
        {
          t: "predict",
          lang: "html",
          src: `<style>
  .a { margin-bottom: 30px; }
  .b { margin-top: 20px; }
</style>
<div class="a">A</div>
<div class="b">B</div>`,
          q: "How far apart are A and B?",
          options: ["50px", "30px", "20px", "10px"],
          answer: 1,
          why: "Adjacent vertical margins in normal flow **collapse** into one: the largest positive plus the most negative. 30 and 20 give 30; 30 and -10 give 20. Horizontal margins never collapse.",
        },
        {
          t: "predict",
          lang: "html",
          src: `<style>
  .card { background: wheat; }
  .card h2 { margin-top: 24px; }
</style>
<div class="card"><h2>Title</h2></div>`,
          q: "Where do the 24px end up?",
          options: ["Inside the card, above the title", "Outside: the card moves down and the title touches its top edge", "Nowhere: headings reset their margins"],
          answer: 1,
          why: "With no border, padding or content between them, a parent's top margin and its first child's collapse into one, and it sits outside the parent. The same happens at the bottom when the parent's height is `auto`.",
        },
        {
          t: "play",
          mode: "html",
          title: "what stops a margin escaping",
          html: `<div class="card" data-name="plain"><h2>plain</h2></div>
<div class="card flow" data-name="flow-root"><h2>display: flow-root</h2></div>
<div class="card pad" data-name="padding"><h2>padding-top: 1px</h2></div>
<div class="card col" data-name="flex column"><h2>display: flex</h2></div>`,
          css: `body { font: 14px system-ui; }
.card { background: wheat; margin-bottom: 12px; }
.card h2 { margin: 24px 0; font-size: 16px; }

.flow { display: flow-root; }
.pad  { padding-top: 1px; }
.col  { display: flex; flex-direction: column; }`,
          js: `for (const card of document.querySelectorAll('.card')) {
  const h2 = card.querySelector('h2');
  const inside = h2.getBoundingClientRect().top - card.getBoundingClientRect().top;
  console.log(card.dataset.name.padEnd(12), 'title starts', inside + 'px below the card top');
}`,
          task: "Add to `.card`, one at a time: `border-top: 1px solid`, `overflow: hidden`, `overflow: clip`. Predict the plain card each time: one of them doesn't stop the collapse.",
        },
        {
          t: "table",
          head: ["Vertical margins collapse between", "Never when"],
          rows: [
            ["adjacent block siblings in normal flow", "the boxes are flex or grid items"],
            ["a parent and its first or last child, with no border, padding or content between", "the parent starts a BFC: `flow-root`, `overflow: hidden`, inline-block"],
            ["the top and bottom margins of an empty block", "the box is floated or absolutely positioned"],
            ["any chain of those, e.g. through an empty div into a grandchild", "the margins are horizontal"],
          ],
        },
        { t: "say", x: "A **block formatting context** is a region laid out on its own. Its root grows to contain its floats, sits beside outside floats instead of under them, and never collapses margins with its children. `display: flow-root` makes one and nothing else." },
        {
          t: "quiz",
          q: "Which of these does **not** start a new block formatting context?",
          options: ["`overflow: hidden`", "`overflow: clip`", "`display: flow-root`", "`container-type: inline-size`", "being a flex item"],
          answer: 1,
          why: "`overflow: clip` clips without becoming a scroll container and without a BFC, so margins still collapse through it. The others all make one, which is why adding a container query or a flex parent can change spacing.",
        },
        {
          t: "pitfall",
          h: "Turn a stack into flex and its gaps double",
          x: "`margin: 16px 0` on each item gives 16px between them in flow, because they collapse. Make the parent `display: flex; flex-direction: column` and nothing collapses: 32px between, and the end margins stay inside the parent. In flex and grid use `gap`; in flow, margins on one side only.",
        },
      ],
    },
    {
      title: "Stacking contexts: why z-index doesn't work",
      beats: [
        {
          t: "predict",
          lang: "html",
          src: `<style>
  .header { position: relative; z-index: 2; }
  .page   { opacity: .99; }
  .modal  { position: fixed; inset: 0; z-index: 9999; }
</style>
<header class="header">...</header>
<main class="page">
  <div class="modal">...</div>
</main>`,
          q: "Does the modal cover the header?",
          options: ["Yes: 9999 beats 2", "No: it paints under the header", "Only if the header comes later in the DOM"],
          answer: 1,
          why: "`opacity` below 1 makes `.page` a **stacking context**. z-index only competes inside its own context: the modal is 9999 inside `.page`, and `.page` as a whole paints at level 0, under the header's 2.",
        },
        {
          t: "steps",
          h: "Paint order inside one stacking context",
          items: [
            "The context root's own background and borders.",
            "Child contexts with negative `z-index`, most negative first.",
            "In-flow blocks that aren't positioned, in tree order.",
            "Floats.",
            "Inline content: text, images, inline boxes.",
            "Positioned boxes with `z-index: auto` or `0`, and contexts with no z-index, like `opacity: .5` or a transform, in tree order.",
            "Child contexts with positive `z-index`, lowest first. Each child context paints whole, as one unit, before the next.",
          ],
        },
        {
          t: "play",
          mode: "html",
          title: "a modal trapped in its parent",
          html: `<div class="stage">
  <div class="header">header: z-index 2</div>
  <div class="page ctx">
    <div class="modal">modal: z-index 9999</div>
  </div>
</div>
<label><input type="checkbox" id="ctx" checked> .page { opacity: .99 }</label>`,
          css: `.stage { position: relative; height: 170px; font: 14px system-ui; }
.header { position: absolute; z-index: 2; top: 10px; left: 10px; width: 200px; height: 90px;
  background: #3a8ad4; color: #fff; padding: 8px; }
.modal { position: absolute; z-index: 9999; top: 50px; left: 90px; width: 200px; height: 90px;
  background: #d49a3a; padding: 8px; display: grid; place-items: end; }
.page.ctx { opacity: .99; }`,
          js: `const page = document.querySelector('.page');
document.getElementById('ctx').onchange = (e) => page.classList.toggle('ctx', e.target.checked);`,
          task: "Swap `opacity: .99` for `transform: translateX(0)`, then `filter: blur(0)`, then `isolation: isolate`. All trap it. The fix is structural: render the modal outside `.page`.",
        },
        {
          t: "quiz",
          q: "`.item { z-index: 5; }` with no `position` set. When does the z-index apply?",
          options: ["Never: z-index needs position", "When `.item` is a flex or grid item", "When `.item` is `display: block`", "Only with `isolation: isolate`"],
          answer: 1,
          why: "z-index applies to positioned boxes **and** to flex and grid items, and on those it also creates a stacking context. So you can lift a grid card with z-index alone, and a stray one on a grid item traps its children.",
        },
        {
          t: "pitfall",
          h: "The `z-index: -1` that vanishes",
          x: "A decorative `::before` with `z-index: -1` paints behind its parent's background unless the parent is a stacking context, so it disappears behind the card. Put `isolation: isolate` on the card: a context with no other side effects, and -1 now means behind the content, above the background.",
        },
        {
          t: "pitfall",
          h: "The same properties break `position: fixed`",
          x: "`transform`, `filter`, `backdrop-filter`, `perspective`, `will-change: transform` and `contain: paint` also make an element the containing block for `fixed` descendants. Your fixed modal now scrolls away with its card. Same trap as z-index, same fix: render it elsewhere.",
        },
        { t: "say", x: "Modals, menus and toasts belong in the **top layer**: `dialog.showModal()` and the `popover` attribute paint above every stacking context on the page, wherever they sit in the DOM (chapter 4). No z-index needed at all." },
      ],
    },
    {
      title: "Overflow and clipping",
      beats: [
        {
          t: "predict",
          lang: "css",
          src: ".rail { overflow-x: auto; overflow-y: visible; }",
          q: "What does `getComputedStyle(rail).overflowY` return?",
          options: ["\"visible\"", "\"hidden\"", "\"auto\""],
          answer: 2,
          why: "If one axis is `hidden`, `scroll` or `auto`, a `visible` on the other computes to `auto`. So a horizontal scroller can't let a tooltip spill out vertically. Only `clip` can clip one axis while the other stays `visible`.",
        },
        {
          t: "table",
          head: ["", "`hidden`", "`clip`", "`auto` / `scroll`"],
          rows: [
            ["clips what overflows", "yes", "yes", "yes, with scrollbars"],
            ["can still scroll (JS, focus, find-in-page)", "yes", "no", "yes"],
            ["starts a block formatting context", "yes", "no", "yes"],
            ["sticky descendants stick to it", "yes, though users can't scroll it", "no", "yes"],
            ["works on one axis with `visible` on the other", "no", "yes", "no"],
          ],
        },
        {
          t: "pitfall",
          h: "`overflow: hidden` still scrolls",
          x: "It's a scroll container with the scrollbars removed. Tabbing to a link inside, `scrollIntoView()` or find-in-page scrolls it, and your carousel jumps half a slide. `overflow: clip` forbids all scrolling. Use it when you only mean \"cut off the excess\".",
        },
        {
          t: "predict",
          lang: "html",
          src: `<style>
  .wrap { position: relative; }
  .card { overflow: hidden; height: 60px; }
  .menu { position: absolute; top: 40px; height: 200px; }
</style>
<div class="wrap">
  <div class="card">
    <div class="menu">menu</div>
  </div>
</div>`,
          q: "Does the card clip the menu?",
          options: ["Yes, at the card's bottom edge", "No, it shows in full", "It's hidden completely"],
          answer: 1,
          why: "`overflow` clips only descendants whose containing block is the card or inside it. The menu's is `.wrap`, the nearest positioned ancestor, so the clip skips it. Give the card `position: relative` or a transform and the menu is cut.",
        },
        {
          t: "pitfall",
          h: "`overflow-x: hidden` on both `html` and `body`",
          x: "The root's overflow moves to the viewport; the body's moves only if the root's is `visible`. Set it on both and the body keeps its own and becomes a scroll container, so every `position: sticky` inside sticks to a body that never scrolls. Set it on one, or use `clip`.",
        },
        {
          t: "mission",
          h: "A card rail whose hover cards can grow",
          x: "Build a horizontal scroller of cards. On hover or focus a card scales up 10% and gets a shadow, and neither may be clipped at the top or bottom. The rail must still scroll sideways, by mouse and keyboard.",
          hint: "`overflow-x: auto` forces `overflow-y` to `auto`, so nothing can spill out. Make room inside instead: padding on the rail, big enough for the scaled card plus its shadow.",
          solution: {
            lang: "css",
            src: `.rail {
  display: flex; gap: 16px;
  overflow-x: auto;
  padding: 48px 32px;        /* the scroller clips at its padding edge: */
}                            /* make that edge clear the scale and the shadow */
.card { flex: 0 0 240px; transition: transform .2s, box-shadow .2s; }
.card:hover, .card:focus-within {
  transform: scale(1.1);     /* a stacking context: paints above its siblings */
  box-shadow: 0 12px 24px #0003;
}`,
          },
        },
      ],
    },
    {
      title: "Rebuild: a cascade resolver",
      beats: [
        { t: "say", x: "The Styles pane in DevTools is this sort, drawn. Rebuild it: give each declaration an origin, importance, layer, selector and position, turn it into the tuple from the first section, and sort." },
        {
          t: "rebuild",
          h: "The cascade in under 50 lines",
          x: "Each declaration becomes a key: origin and importance, style attribute, layer (flipped for `!important`), specificity, order. The highest key wins. Run it, check each line against the rules above, then extend it.",
          mode: "js",
          js: raw`// Which declaration wins one property on one element?
const LAYERS = ['reset', 'base', 'components', 'utilities']; // from @layer reset, base, ...;
const ORIGIN = { ua: 0, user: 1, author: 2 };

function specificity(sel) {
  let a = 0, b = 0, c = 0;
  sel = sel.replace(/:where\([^)]*\)/g, ' ');                           // scores nothing
  sel = sel.replace(/::[\w-]+/g, () => (c++, ' '));                     // pseudo-elements
  sel = sel.replace(/#[\w-]+/g, () => (a++, ' '));                      // ids
  sel = sel.replace(/\.[\w-]+|\[[^\]]*\]|:[\w-]+/g, () => (b++, ' '));  // classes, attributes, pseudo-classes
  c += sel.split(/[\s>+~*]+/).filter(Boolean).length;                   // what's left are types
  return [a, b, c];
}

function key(d) {
  const o = ORIGIN[d.origin];
  const L = d.layer ? LAYERS.indexOf(d.layer) : LAYERS.length;         // unlayered = after every layer
  return [
    d.important ? 6 - o : o,     // normal: ua 0, user 1, author 2. important: author 4, user 5, ua 6
    d.inline ? 1 : 0,            // style="" beats any selector
    d.important ? -L : L,        // !important flips the layer order
    ...specificity(d.selector || ''),
    d.order,                     // later wins
  ];
}

const cmp = (x, y) => { for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };

function cascade(decls) {
  const ranked = decls.map((d, order) => ({ ...d, order })).sort((p, q) => cmp(key(q), key(p)));
  return ranked.length ? ranked[0].value : '(nothing matched: inherit or initial)';
}

// color on <a class="btn text-red"> inside <nav id="main">
const sheet = [
  { origin: 'ua', selector: 'a:link', value: 'blue, the browser default' },
  { origin: 'author', layer: 'components', selector: '#main .btn', value: 'navy' },
  { origin: 'author', layer: 'utilities', selector: '.text-red', value: 'red' },
];
const imp = { origin: 'author', important: true };
console.log('1', cascade(sheet));
console.log('2', cascade([...sheet, { origin: 'author', selector: 'a', value: 'green, unlayered' }]));
console.log('3', cascade([...sheet, { ...imp, layer: 'reset', selector: ':where(a)', value: 'black, !important in reset' },
  { ...imp, layer: 'utilities', selector: '.text-red', value: 'red, !important in utilities' }]));
console.log('4', cascade([...sheet, { origin: 'author', inline: true, value: 'purple, style attribute' }]));
console.log('5', cascade([...sheet, { origin: 'user', important: true, selector: 'a', value: 'yellow, user !important' }]));
console.log('6', cascade([]));`,
          task: "Add animations at origin rank 3. Teach `specificity` that `:is()` and `:not()` count their heaviest argument. Then make a `revert-layer` value drop its whole layer and re-sort.",
        },
        {
          t: "mission",
          h: "Explain the loser",
          x: "Extend the resolver so it prints, for each losing declaration, the first key where it lost: \"lost on layer\", \"lost on specificity\", \"lost on order\". That's the question you ask DevTools every time a rule is crossed out, answered in one line.",
          hint: "Compare the loser's key with the winner's, index by index. The first index that differs names the step, so keep an array of step names that lines up with the key.",
          solution: {
            lang: "js",
            src: `const STEPS = ['origin and importance', 'style attribute', 'layer',
  'specificity (ids)', 'specificity (classes)', 'specificity (types)', 'order'];

function whyLost(loser, winner) {
  const a = key(loser), b = key(winner);
  const i = a.findIndex((v, j) => v !== b[j]);
  return loser.value + ' lost on ' + STEPS[i];
}`,
          },
        },
      ],
    },
  ],
  nobodyTells: [
    "DevTools strikes through declarations that lost the cascade, and flags ones that won but do nothing, like `width` on an inline box. Different bugs, different fixes.",
    "In the Computed tab, expand a property to see every declaration that competed for it, winner first. It answers \"where does this come from\" faster than reading the Styles pane.",
    "z-index only has to be unique inside one stacking context. `isolation: isolate` on each component root plus values like 1, 2, 3 ends the 9999 arms race.",
    "A running animation or transition of `opacity` or `transform` makes a stacking context for as long as it runs, so overlaps can flip when it starts and snap back when it ends.",
    "`em` in `font-size` means the parent's size; `em` anywhere else means the element's own. `font-size: 2em; padding: 1em` gives padding of the new, doubled size.",
    "An empty element's top and bottom margins collapse through it. A wrapper that renders empty can change the spacing with nothing visible on screen.",
    "`outline` follows `border-radius` in every current browser and takes no space. There's no reason left to fake focus rings with `box-shadow`.",
    "`visibility` inherits and a child can override it: `visibility: visible` shows inside a hidden parent. Children can't undo a parent's `opacity: 0` or `display: none`.",
  ],
  glossary: [
    ["cascade", "The sort that picks one declaration per property per element: origin, context, style attribute, layer, specificity, proximity, order."],
    ["origin", "Where a declaration comes from: browser, user or author. `!important` reverses their order."],
    ["cascade layer", "A named bucket from `@layer`. Later layers beat earlier ones whatever the specificity; `!important` flips that."],
    ["specificity", "(ids, classes/attributes/pseudo-classes, types/pseudo-elements), compared left to right."],
    ["scope proximity", "The `@scope` tie-breaker after specificity: the rule whose scope root is fewer steps up the tree wins."],
    ["computed value", "The value made absolute without layout. It's what children inherit."],
    ["used value", "The value after layout, in real pixels: what `auto` and percentages turn into."],
    ["box-sizing", "Whether `width` and `height` set the content box or include padding and border (`border-box`)."],
    ["margin collapsing", "Adjacent vertical margins in normal flow merging into one: the largest positive plus the most negative."],
    ["block formatting context", "A region laid out independently: it contains its floats and keeps its children's margins inside."],
    ["containing block", "The box that percentages and positioning resolve against; usually the parent's content box."],
    ["stacking context", "A group painted as one unit on the z-axis. z-index only orders boxes inside the same one."],
    ["blockification", "Computing an inline `display` to its block form, for floats, absolutely positioned boxes and flex or grid items."],
    ["scroll container", "A box with `overflow` other than `visible` or `clip`. It can scroll even with its scrollbars hidden."],
  ],
  explain: "Explain to a friend why `z-index: 9999` can still paint under an element with `z-index: 2`, starting from what a stacking context is and how the browser paints one.",
};
