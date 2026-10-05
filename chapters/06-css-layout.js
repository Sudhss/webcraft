const raw = String.raw;

export default {
  id: "css-layout",
  n: 6,
  part: "B",
  title: "CSS II: layout",
  hook: "Flex, grid and positioning as algorithms: where the free space goes, and why your item overflows anyway.",
  minutes: 80,
  levels: ["use", "understand", "rebuild"],
  sections: [
    {
      title: "Normal flow and formatting contexts",
      beats: [
        { t: "say", x: "Layout is a function from a box tree and a viewport width to rectangles. In normal flow **widths flow down**: a block fills its parent. **Heights flow up**: a block is as tall as its content. Most layout confusion is forgetting which way a size travels." },
        {
          t: "predict",
          lang: "css",
          src: ".page { min-height: 100vh; }\n.page > main { height: 100%; }",
          q: "`main` holds one short paragraph. How tall is it?",
          options: ["100vh", "As tall as the paragraph", "0", "100% of the body"],
          answer: 1,
          why: "A percentage height needs a **definite** parent height, and `min-height` doesn't make `height` definite, so `100%` acts as `auto`. Make `.page` a grid with `grid-template-rows: auto 1fr auto` and let the row size `main` instead.",
        },
        { t: "say", h: "Formatting contexts", x: "`display` has two halves: how the box sits among its siblings (block or inline), and which algorithm lays out its **children**: flow, flex, grid or table. Change the parent's `display` and the children obey different laws, whatever their own CSS says." },
        {
          t: "predict",
          lang: "html",
          src: "<div class=\"stack\">\n  <p style=\"margin: 20px 0\">one</p>\n  <p style=\"margin: 20px 0\">two</p>\n</div>",
          q: "The gap between the paragraphs with `.stack { display: block }`, then with `display: flex; flex-direction: column`?",
          options: ["20px, then 20px", "20px, then 40px", "40px, then 40px", "40px, then 20px"],
          answer: 1,
          why: "In flow, adjacent vertical margins collapse into the larger one. Margins of flex and grid items never collapse. That's why converting a stack to flex doubles its spacing, and why `gap` beats margins inside flex and grid.",
        },
        {
          t: "table",
          caption: "Children of a flex or grid container stop being blocks and inlines. They become items, and some familiar properties go quiet.",
          head: ["On a flex or grid item", "What happens"],
          rows: [
            ["`float`", "ignored: the item stays an item"],
            ["a `<span>` or `display: inline`", "blockified into a block-level box"],
            ["`vertical-align`", "ignored: use `align-self`"],
            ["adjacent margins", "never collapse"],
            ["`margin: auto`", "absorbs free space before `justify-content` sees it"],
            ["loose text between elements", "wrapped in an anonymous item"],
          ],
        },
        { t: "say", x: "`display: flow-root` gives a block its own block formatting context and nothing else: floats inside are contained and child margins stay inside. It replaces the `overflow: hidden` clearfix, which also clipped shadows and focus rings." },
      ],
    },
    {
      title: "Intrinsic sizes",
      beats: [
        { t: "say", x: "Every box has two intrinsic widths. **min-content**: the narrowest it gets without overflowing, usually its longest word. **max-content**: its width if nothing ever wraps. Flex and grid are negotiations between these two numbers and the space available." },
        {
          t: "play",
          mode: "html",
          title: "min-content, max-content, fit-content",
          html: "<div class=\"wrap\">\n  <p class=\"min\">min-content: the longest word decides</p>\n  <p class=\"max\">max-content: never wraps, however narrow the box gets, so it spills past the edge</p>\n  <p class=\"fit\">fit-content: max-content until the space runs out, then wraps, never below min-content</p>\n</div>",
          css: "body { font: 14px system-ui; }\n.wrap { width: 320px; resize: horizontal; overflow: auto; border: 1px dashed #999; padding: 8px; }\np { margin: 8px 0; padding: 4px 8px; background: #d49a3a33; border-left: 3px solid #d49a3a; }\n.min { width: min-content; }\n.max { width: max-content; }\n.fit { width: fit-content; }",
          js: "",
          task: "Drag the corner. `fit-content` is `min(max-content, max(min-content, available))`. Cut the `.fit` text to three words and it shrinks to them.",
        },
        {
          t: "table",
          head: ["Box", "`width: auto` means"],
          rows: [
            ["block in normal flow", "fill the containing block"],
            ["float, inline-block, table", "fit-content: shrink to the content, capped by the space"],
            ["absolutely positioned", "fit-content, against the space its insets leave"],
            ["flex item in a row", "basis `content`: start at max-content, then flex"],
            ["grid item", "stretch to fill its grid area"],
          ],
        },
        {
          t: "predict",
          lang: "css",
          src: ".icon { position: relative; width: 24px; }\n.tip {\n  position: absolute;\n  left: 100%;\n  top: 0;\n}\n/* <span class=\"tip\">Copies the link to your clipboard</span> */",
          q: "How does the tooltip lay out?",
          options: ["One line, as wide as its text", "As narrow as its longest word, a word or two per line", "24px wide, text spilling out", "Zero width, invisible"],
          answer: 1,
          why: "Abs-pos `width: auto` is fit-content against the space between `left` and the containing block's right edge: 24 − 24 = 0. So it drops to min-content, the longest word. Give it `width: max-content; max-width: 240px`.",
        },
        {
          t: "pitfall",
          h: "`overflow-wrap: break-word` won't save a grid",
          x: "It breaks a long URL only after the box is sized, so the min-content width still holds the whole URL, and a `1fr` column or a flex item grows to fit it. `overflow-wrap: anywhere` adds the break points to min-content too, so the box can shrink.",
        },
      ],
    },
    {
      title: "Flexbox is an algorithm",
      beats: [
        { t: "say", x: "Flex layout in one sentence: every item starts at its **flex-basis**, the leftover space, positive or negative, is shared out by `flex-grow` or `flex-shrink`, then min and max clamp the result. Everything else is alignment." },
        {
          t: "steps",
          h: "Resolving flexible lengths, one line",
          items: [
            "Base size: `flex-basis`; if that's `auto`, the `width`; if that's `auto` too, the max-content width.",
            "Free space = the container's inner width − the items' outer base sizes − the gaps. Positive: grow. Negative: shrink.",
            "Growing: each item gets free × grow / Σgrow. If Σgrow < 1, only that fraction of the free space is handed out.",
            "Shrinking: each item loses overflow × (shrink × base) / Σ(shrink × base). Big items give up more pixels.",
            "Clamp to min and max. Freeze the items that hit a limit and share the space again among the rest.",
            "Then `justify-content` places what's left over, and `align-items` sizes the cross axis.",
          ],
        },
        {
          t: "predict",
          lang: "css",
          src: ".row { display: flex; width: 600px; }\n.a, .b { flex: 1 1 100px; }\n.c { flex: 2 1 100px; }",
          q: "Three empty boxes. Widths?",
          options: ["150, 150, 300", "175, 175, 250", "200, 200, 200", "100, 100, 400"],
          answer: 1,
          why: "Free space is 600 − 300 = 300, split 1:1:2 as 75, 75, 150, and added **on top of** the 100px bases. `flex-grow` shares the leftover, not the total. For a true 1:1:2 ratio, start from a zero basis.",
        },
        { t: "viz", name: "flex", props: { items: 5 } },
        {
          t: "predict",
          lang: "css",
          src: ".row { display: flex; width: 300px; }\n.a { flex: 0 1 200px; }\n.b { flex: 0 1 400px; }",
          q: "Two empty boxes, both `flex-shrink: 1`. Final widths?",
          options: ["50 and 250", "100 and 200", "150 and 150", "0 and 300"],
          answer: 1,
          why: "The overflow is 300px. Shrink is weighted by base size: a gives up 300 × 200/600 = 100, b gives up 200. Equal `flex-shrink` means equal *proportions*, so a small item never hits zero while a big one is still wide.",
        },
        {
          t: "compare",
          a: { label: "flex: auto  (1 1 auto)", lang: "css", src: ".tabs > * { flex: auto; }\n/* each tab starts at its text width,\n   then they split the rest equally:\n   a long label stays longer */" },
          b: { label: "flex: 1  (1 1 0%)", lang: "css", src: ".tabs > * { flex: 1; }\n/* every basis is 0, so all the space\n   is shared: equal widths, until some\n   content is wider than its share */" },
          x: "`flex: 1` zeroes the basis, `flex: auto` keeps the content size and splits only the leftover. Choose by who should decide the widths: the content or the container.",
        },
        {
          t: "pitfall",
          h: "`flex: 1` is `1 1 0%`, not `1 1 0`",
          x: "It bites in a column flex container with no fixed height, say only `min-height`. A percentage basis against an indefinite height falls back to `content`, so `flex: 1` items start at their content and split the rest, while `flex: 1 1 0` items split all of it equally.",
        },
        {
          t: "predict",
          lang: "html",
          src: "<div style=\"display: flex; width: 300px\">\n  <div class=\"avatar\"></div>   <!-- flex: none; width: 40px -->\n  <div class=\"name\">\n    <p class=\"ellipsis\">quarterly-report-final-v2-really-final.pdf</p>\n  </div>\n</div>\n<!-- .ellipsis { white-space: nowrap; overflow: hidden; text-overflow: ellipsis } -->",
          q: "Does the file name end in an ellipsis at the row's edge?",
          options: ["Yes", "No: `.name` won't shrink and the text spills out of the row", "No: the text wraps", "Only in Safari"],
          answer: 1,
          why: "Flex items get `min-width: auto`, which means *never narrower than my min-content*. The `<p>`'s min-content is the whole unwrapped name, so `.name` refuses to shrink. `min-width: 0` on `.name` and the ellipsis appears.",
        },
        {
          t: "play",
          mode: "html",
          title: "the min-width: auto trap",
          html: "<p>min-width: auto (the default)</p>\n<div class=\"row\"><div class=\"avatar\"></div><div class=\"name\"><p class=\"ellipsis\">quarterly-report-final-v2-really-final.pdf</p></div></div>\n<p>.name { min-width: 0 }</p>\n<div class=\"row\"><div class=\"avatar\"></div><div class=\"name\" style=\"min-width: 0\"><p class=\"ellipsis\">quarterly-report-final-v2-really-final.pdf</p></div></div>\n<p>.name { overflow: hidden }</p>\n<div class=\"row\"><div class=\"avatar\"></div><div class=\"name\" style=\"overflow: hidden\"><p class=\"ellipsis\">quarterly-report-final-v2-really-final.pdf</p></div></div>\n<p>.name { overflow: clip }</p>\n<div class=\"row\"><div class=\"avatar\"></div><div class=\"name\" style=\"overflow: clip\"><p class=\"ellipsis\">quarterly-report-final-v2-really-final.pdf</p></div></div>",
          css: "body { font: 14px system-ui; }\nbody > p { margin: 12px 0 2px; color: #666; }\n.row { display: flex; gap: 8px; align-items: center; width: 240px; padding: 6px; border: 2px solid #d49a3a; }\n.avatar { flex: none; width: 32px; height: 32px; border-radius: 50%; background: #d49a3a; }\n.name { background: #3a8ad433; }\n.ellipsis { margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }",
          js: "document.querySelectorAll('.name').forEach((n, i) => {\n  console.log('row', i + 1, '.name is', Math.round(n.getBoundingClientRect().width) + 'px wide');\n});",
          task: "Only rows 2 and 3 truncate. `overflow: hidden` makes `.name` a scroll container, which drops the content floor. `overflow: clip` doesn't, so row 4 is still broken.",
        },
        {
          t: "pitfall",
          h: "`min-width: 0` at every level",
          x: "The content floor applies to every flex item in the chain. Fix the inner item and its parent, also a flex item, still won't go below its content, which now includes your `<pre>` or table. Put `min-width: 0` on each flex item between the overflow and the viewport. In column flex it's `min-height`.",
        },
      ],
    },
    {
      title: "Grid: tracks and fr",
      beats: [
        {
          t: "predict",
          lang: "css",
          src: ".cards { display: flex; flex-wrap: wrap; gap: 20px; }\n.card { flex: 0 0 33.333%; }",
          q: "Six cards. How many per row?",
          options: ["3", "2", "1", "3, overflowing by 40px"],
          answer: 1,
          why: "Lines break on base sizes plus gaps, and 3 × 33.333% + 40px is more than 100%. Use `calc((100% - 2 * 20px) / 3)` as the basis, or a grid with `repeat(3, 1fr)`, where gaps come out before the tracks are sized.",
        },
        { t: "say", x: "Grid sizes the **tracks** first, then drops items into them. Flex lines negotiate alone, so a wrapped row never lines up with the one above. In grid, a whole column shares one width, so both axes align by construction." },
        {
          t: "predict",
          lang: "css",
          src: ".grid {\n  display: grid;\n  width: 800px;\n  grid-template-columns: 200px 1fr 2fr;\n  column-gap: 20px;\n}",
          q: "How wide are the two `fr` columns?",
          options: ["200 and 400", "186.67 and 373.33", "200 and 380", "266.67 and 533.33"],
          answer: 1,
          why: "Fixed tracks and gaps come off first: 800 − 200 − 2 × 20 = 560, split 1:2. `fr` shares the leftover, which is why gaps never break a grid the way they break percentage flex bases.",
        },
        { t: "say", h: "1fr has a floor", x: "`1fr` is short for `minmax(auto, 1fr)`, and that `auto` minimum is the items' min-content. One long URL or `<pre>` makes its column wider than the rest. `minmax(0, 1fr)` removes the floor: equal columns, and the content wraps or overflows instead." },
        {
          t: "play",
          mode: "html",
          title: "a grid blowout",
          html: "<div class=\"grid\">\n  <div>short</div>\n  <div><pre>fetch(\"https://example.com/api/v2/reports/quarterly\")</pre></div>\n  <div>short</div>\n</div>\n<div class=\"grid fixed\">\n  <div>short</div>\n  <div><pre>fetch(\"https://example.com/api/v2/reports/quarterly\")</pre></div>\n  <div>short</div>\n</div>",
          css: "body { font: 14px system-ui; }\n.grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; width: 360px; margin-bottom: 16px; outline: 2px solid #d49a3a; }\n.grid.fixed { grid-template-columns: repeat(3, minmax(0, 1fr)); }\n.grid > div { background: #3a8ad433; padding: 6px; }\npre { margin: 0; overflow: auto; }",
          js: "document.querySelectorAll('.grid').forEach((g, i) => {\n  console.log('grid', i + 1, 'columns:', getComputedStyle(g).gridTemplateColumns);\n});",
          task: "Now give the first grid's middle `<div>` `overflow: auto`: a grid item that is itself a scroll container gets no content floor, so plain `1fr` behaves.",
        },
        { t: "say", h: "auto-fill vs auto-fit", x: "`repeat(auto-fill, minmax(160px, 1fr))` makes as many columns as fit, even empty ones. `auto-fit` then collapses the empty tracks to zero, so the items stretch across the row. They differ only when there are fewer items than columns." },
        { t: "viz", name: "grid", props: { template: "repeat(auto-fill, minmax(120px, 1fr))" } },
        {
          t: "predict",
          lang: "css",
          src: ".grid {\n  display: grid;\n  grid-template-columns: repeat(3, 1fr);\n  grid-template-rows: 100px;\n}\n/* five items, one line of text each */",
          q: "How tall is the second row?",
          options: ["100px", "As tall as its text", "0", "Items 4 and 5 overflow instead"],
          answer: 1,
          why: "`grid-template-rows` sizes only the **explicit** grid: one row. Items 4 and 5 create an implicit row, sized by `grid-auto-rows`, which defaults to `auto`. Set `grid-auto-rows: 100px`, or `minmax(100px, auto)` so content can grow it.",
        },
        {
          t: "quiz",
          q: "`grid-template-columns: 0.3fr 0.3fr` in an empty 1000px grid. Column widths?",
          options: ["500 and 500", "300 and 300, with 400 left empty", "0 and 0", "Invalid: fr must be at least 1"],
          answer: 1,
          why: "When the flex factors sum below 1, each takes exactly its fraction of the leftover: 0.3 × 1000. `flex-grow` has the same rule. Once the sum reaches 1 they share all of it, so `.5fr .5fr` still fills the row.",
        },
      ],
    },
    {
      title: "Grid: placing things",
      beats: [
        {
          t: "code",
          lang: "css",
          src: ".page {\n  display: grid;\n  grid-template-columns: 220px minmax(0, 1fr);\n  grid-template-rows: auto 1fr auto;\n  grid-template-areas:\n    \"head head\"\n    \"nav  main\"\n    \"foot foot\";\n  min-height: 100dvh;\n}\n.page > header { grid-area: head; }\n.page > nav    { grid-area: nav; }\n.page > main   { grid-area: main; }\n.page > footer { grid-area: foot; }\n\n@media (width < 700px) {\n  .page {\n    grid-template-columns: minmax(0, 1fr);\n    grid-template-rows: auto auto 1fr auto;\n    grid-template-areas: \"head\" \"nav\" \"main\" \"foot\";\n  }\n}",
          mark: [5, 6, 7, 8, 21],
          note: "The template is a picture of the layout. A breakpoint redraws the picture and no item CSS changes. The `1fr` row pins the footer to the bottom of short pages.",
        },
        {
          t: "pitfall",
          h: "A bad area map is silently dropped",
          x: "Every row string needs the same number of cells, and each name must form one rectangle. An L-shape or a missing cell makes the whole `grid-template-areas` invalid: it's thrown away and every item auto-places into a mess. DevTools shows the declaration struck through. Look there first.",
        },
        {
          t: "predict",
          lang: "html",
          src: "<!-- .grid { display: grid; grid-template-columns: repeat(3, 100px) }\n     .wide { grid-column: span 2 } -->\n<div class=\"grid\">\n  <div class=\"wide\">1</div>\n  <div class=\"wide\">2</div>\n  <div>3</div>\n</div>",
          q: "Where does item 3 go by default, and then with `grid-auto-flow: dense`?",
          options: ["Row 1, column 3 both times", "Row 2, column 3, then row 1, column 3", "Row 3, column 1, then row 1, column 3", "Row 2, column 3 both times"],
          answer: 1,
          why: "The placement cursor only moves forward. Item 2 didn't fit in row 1, so the hole it left behind stays empty. `dense` restarts the search from the top for every item and backfills the hole.",
        },
        {
          t: "pitfall",
          h: "`dense` and `order` scramble the tab order",
          x: "Focus order and screen readers follow the DOM, not the picture. Once `dense`, `order` or explicit placement moves things around, Tab jumps across the screen. Fine for a wall of images, wrong for anything with links or inputs: reorder the markup instead.",
        },
        { t: "say", h: "Subgrid", x: "Three cards in a row, each with a title, a body and a button. Each card's grid sizes itself alone, so titles and buttons never line up. `grid-template-rows: subgrid` makes a card use its parent's rows: every title row is as tall as the tallest title." },
        {
          t: "play",
          mode: "html",
          title: "cards on a subgrid",
          html: "<div class=\"cards\">\n  <article><h3>Short</h3><p>One line.</p><a href=\"#\">Read</a></article>\n  <article><h3>A much longer title that wraps onto two lines</h3><p>Body text that runs on for a while, longer than the others.</p><a href=\"#\">Read</a></article>\n  <article><h3>A medium title</h3><p>Two lines of body, give or take.</p><a href=\"#\">Read</a></article>\n</div>",
          css: "body { font: 14px system-ui; }\n.cards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }\narticle {\n  display: grid;\n  grid-row: span 3;\n  grid-template-rows: subgrid;   /* delete me */\n  padding: 10px;\n  border: 1px solid #ccc;\n  border-radius: 8px;\n}\nh3 { margin: 0; font-size: 15px; background: #d49a3a33; }\np { margin: 0; background: #3a8ad433; }\na { justify-self: start; align-self: end; }",
          js: "",
          task: "Delete the `subgrid` line: each card sizes its own rows and the links stop lining up. Put it back and add a fourth card: it starts a new set of three rows.",
        },
      ],
    },
    {
      title: "Positioning and containing blocks",
      beats: [
        { t: "say", x: "`top` and `left` are measured from the **containing block**. For `absolute`, that's the padding box of the nearest positioned ancestor. For `fixed`, it's the viewport, unless some ancestor quietly volunteers for the job." },
        {
          t: "predict",
          lang: "css",
          src: ".card { transform: translateY(-2px); } /* a hover lift */\n.card .modal {\n  position: fixed;\n  inset: 0;\n  background: rgb(0 0 0 / .5);\n}",
          q: "The modal opens from inside the card. What does the overlay cover?",
          options: ["The whole viewport, as intended", "Only the card, and it scrolls with the page", "Nothing: `fixed` is ignored under a transform", "The viewport, but beneath the card"],
          answer: 1,
          why: "Any `transform` other than `none`, even `translateZ(0)`, makes the element the containing block for its fixed descendants. `inset: 0` now means the card's edges, and the overlay scrolls with the card.",
        },
        {
          t: "table",
          head: ["On an ancestor", "Traps `position: fixed`?"],
          rows: [
            ["`transform`, `translate`, `rotate`, `scale` (not `none`)", "yes"],
            ["`filter` (not `none`)", "yes"],
            ["`perspective`", "yes"],
            ["`will-change: transform` or `filter`", "yes, before anything animates"],
            ["`contain: layout`, `paint`, `strict` or `content`", "yes"],
            ["`position: relative`", "no, it only catches `absolute`"],
          ],
        },
        {
          t: "play",
          mode: "html",
          title: "a trapped modal",
          html: "<label><input type=\"checkbox\" id=\"t\" checked> .card has a transform</label>\n<div class=\"card\" id=\"card\">\n  <button id=\"open\">open modal</button>\n  <div class=\"modal\" id=\"modal\"><button id=\"close\">close</button></div>\n</div>\n<p style=\"height: 150vh\">Open it, then scroll.</p>",
          css: "body { font: 14px system-ui; }\n.card { margin: 24px 0; padding: 16px; width: 200px; border: 1px solid #ccc; border-radius: 8px; }\n.card.lift { transform: translateY(-2px); }\n.modal { position: fixed; inset: 0; background: rgb(0 0 0 / .5); display: none; place-items: center; }\n.modal.open { display: grid; }",
          js: "const card = document.getElementById('card');\nconst modal = document.getElementById('modal');\nconst box = document.getElementById('t');\nconst sync = () => card.classList.toggle('lift', box.checked);\nbox.onchange = sync;\nsync();\ndocument.getElementById('open').onclick = () => {\n  modal.classList.add('open');\n  const r = modal.getBoundingClientRect();\n  const v = document.documentElement;\n  console.log('overlay', Math.round(r.width) + 'x' + Math.round(r.height), 'viewport', v.clientWidth + 'x' + v.clientHeight);\n};\ndocument.getElementById('close').onclick = () => modal.classList.remove('open');",
          task: "Swap the transform for `filter: blur(0)`, `will-change: transform` or `contain: paint`. Then fix it for good: make the modal a `<dialog>` and open it with `showModal()`.",
        },
        { t: "say", h: "The top layer", x: "A `<dialog>` opened with `showModal()`, and any `popover`, renders in the **top layer**: above every `z-index`, and free of its ancestors' transforms and `overflow`. It's the real fix for modals, menus and toasts, no portal needed." },
        {
          t: "steps",
          h: "When sticky works",
          items: [
            "It needs an inset: `top`, `bottom`, `left` or `right`. Without one it's just `relative`.",
            "It sticks inside the nearest ancestor that is a scroll container (any `overflow` but `visible` or `clip`), even one that never scrolls.",
            "It can't leave its containing block, usually its parent. A parent no taller than the sticky box leaves it no room to move.",
            "The inset is measured from that scroller's edge: `top: 0` inside a scrolling panel means the panel's top.",
          ],
        },
        {
          t: "predict",
          lang: "css",
          src: ".layout { display: grid; grid-template-columns: 240px 1fr; }\n.layout aside { position: sticky; top: 0; }\n/* main is 3000px tall, the aside's links 400px */",
          q: "You scroll the page. What does the sidebar do?",
          options: ["Sticks to the top", "Scrolls away with the page", "Sticks after 400px", "Jumps to the bottom"],
          answer: 1,
          why: "The aside is a grid item, stretched to the row's 3000px. It's already as tall as its containing block, so there's no room to stick. `align-self: start` shrinks it to its content, and it sticks.",
        },
        {
          t: "play",
          mode: "html",
          title: "a sidebar that won't stick",
          html: "<label><input type=\"checkbox\" id=\"fix\"> aside { align-self: start }</label>\n<div class=\"scroller\">\n  <div class=\"layout\">\n    <aside id=\"aside\">sidebar<br>links<br>here</aside>\n    <main>main content: scroll this box</main>\n  </div>\n</div>",
          css: "body { font: 14px system-ui; }\n.scroller { height: 240px; overflow: auto; border: 1px solid #ccc; margin-top: 8px; }\n.layout { display: grid; grid-template-columns: 110px 1fr; gap: 12px; }\naside { position: sticky; top: 0; padding: 8px; background: #d49a3a55; }\naside.fix { align-self: start; }\nmain { height: 1200px; padding: 8px; background: repeating-linear-gradient(#3a8ad422 0 40px, transparent 0 80px); }",
          js: "const aside = document.getElementById('aside');\ndocument.getElementById('fix').onchange = (e) => aside.classList.toggle('fix', e.target.checked);",
          task: "With the fix on, add `overflow-x: hidden` to `.layout`. Sticky breaks again, and the next beat is why.",
        },
        {
          t: "pitfall",
          h: "`overflow-x: hidden` turns on `overflow-y`",
          x: "`visible` can't pair with `hidden`, so `overflow-x: hidden` computes `overflow-y` to `auto`. The wrapper you added to kill a sideways scrollbar is now a scroll container, and every sticky inside it sticks to a box that never scrolls. `overflow-x: clip` clips without that.",
        },
      ],
    },
    {
      title: "Ratios and centring",
      beats: [
        {
          t: "code",
          lang: "html",
          src: "<img src=\"hero.jpg\" width=\"1600\" height=\"900\" alt=\"\">\n\n<style>\n  img { width: 100%; height: auto; }  /* still reserves 16:9 */\n  .video { width: 100%; aspect-ratio: 16 / 9; }\n  .avatar { width: 48px; aspect-ratio: 1; object-fit: cover; }\n</style>",
          mark: [1, 4],
          note: "The `width` and `height` attributes become `aspect-ratio: auto 1600 / 900`, so the space is reserved before the file arrives. No layout shift, even with CSS resizing the image.",
        },
        {
          t: "predict",
          lang: "css",
          src: ".tile { width: 200px; aspect-ratio: 1; }\n/* the text inside needs 300px of height */",
          q: "What happens?",
          options: ["The tile stays 200 × 200 and the text overflows", "The tile grows to 200 × 300", "The text shrinks to fit", "The tile grows to 300 × 300"],
          answer: 1,
          why: "A box with `aspect-ratio` gets an automatic minimum height of its content, so the ratio gives way before text overflows. To force the square, add `min-height: 0` (text overflows) or `overflow: auto` (text scrolls).",
        },
        {
          t: "table",
          head: ["Centring what", "Use", "Why"],
          rows: [
            ["one child, both axes", "`display: grid; place-items: center`", "two words on the parent, any child"],
            ["a block with a max width, horizontally", "`margin-inline: auto`", "stays in normal flow"],
            ["content of a plain block, vertically", "`align-content: center`", "works in block layout since 2024, no flex needed"],
            ["an overlay inside a positioned parent", "`position: absolute; inset: 0; margin: auto` plus a size", "the auto margins split what the insets leave"],
            ["one item within a flex row", "`margin-left: auto` or `margin: auto`", "auto margins take free space first"],
          ],
        },
        {
          t: "code",
          lang: "css",
          src: ".nav { display: flex; gap: 8px; }\n.nav .account { margin-left: auto; } /* it and all after it go right */\n\n.card { display: flex; flex-direction: column; }\n.card .buy { margin-top: auto; }     /* buttons sit on the bottom edge */",
          note: "Auto margins take free space before `justify-content` gets any. One `margin-left: auto` splits a toolbar into two groups with no wrapper div.",
        },
        {
          t: "predict",
          lang: "css",
          src: ".panel {\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  height: 300px;\n  overflow: auto;\n}\n/* its only child is 500px tall */",
          q: "Can you scroll to the top of the child?",
          options: ["Yes, it scrolls normally", "No: its top 100px sit above the scroll origin, out of reach", "No: the child is squashed to 300px", "Yes, but only in Firefox"],
          answer: 1,
          why: "`center` overflows both edges equally, and nobody can scroll to a negative position. `align-items: safe center` falls back to `start` when the item doesn't fit, and `margin: auto` on the child never goes negative.",
        },
        {
          t: "play",
          mode: "html",
          title: "centring that loses data",
          html: "<div class=\"panel\"><div class=\"child\"><b>TOP</b>center<b>bottom</b></div></div>\n<div class=\"panel safe\"><div class=\"child\"><b>TOP</b>safe center<b>bottom</b></div></div>\n<div class=\"panel auto\"><div class=\"child\"><b>TOP</b>margin: auto<b>bottom</b></div></div>",
          css: "body { font: 13px system-ui; display: flex; gap: 10px; }\n.panel { display: flex; align-items: center; justify-content: center;\n  width: 120px; height: 160px; overflow: auto; border: 1px solid #999; }\n.panel.safe { align-items: safe center; }\n.panel.auto > .child { margin: auto; }\n.child { flex: none; width: 96px; height: 260px; padding: 4px; box-sizing: border-box; color: #fff;\n  display: flex; flex-direction: column; justify-content: space-between;\n  background: linear-gradient(#d49a3a, #3a8ad4); }",
          js: "document.querySelectorAll('.panel').forEach((p) => {\n  const gap = p.firstElementChild.getBoundingClientRect().top - p.getBoundingClientRect().top - p.clientTop;\n  console.log(p.textContent.replace(/TOP|bottom/g, '').trim() + ':', 'child top at', Math.round(gap) + 'px');\n});",
          task: "Scroll each panel to the top: only the first hides TOP for good. Swap its CSS for `display: grid; place-content: center` and the same bug appears.",
        },
      ],
    },
    {
      title: "Flex or grid, and a rebuild",
      beats: [
        { t: "say", x: "Flex is **content out**: items bring their sizes and the line adapts. It fits toolbars, tags and button rows. Grid is **layout in**: the container draws tracks and items fill them. It fits pages, galleries and forms. Most screens are grids of flex rows." },
        {
          t: "table",
          head: ["Job", "Reach for", "Because"],
          rows: [
            ["nav bar, toolbar, tag list", "flex", "items are as wide as their content"],
            ["icon and a label that truncates", "flex, `min-width: 0` on the label", "one row, one item takes the rest"],
            ["page shell", "grid with named areas", "two axes, and the picture changes per breakpoint"],
            ["card gallery", "grid, `auto-fill` with `minmax`", "columns align across rows"],
            ["labels and inputs", "grid, `max-content minmax(0, 1fr)`", "every label column lines up"],
            ["equal columns whatever the content", "grid, `repeat(n, minmax(0, 1fr))`", "no content floor, no basis maths"],
          ],
        },
        {
          t: "quiz",
          q: "Products wrap 4 per row. The last row has 2, and they should stay card-sized, on the same columns as above. What do you use?",
          options: ["`flex-wrap: wrap` with `flex: 1 1 200px`", "`grid-template-columns: repeat(auto-fill, minmax(200px, 1fr))`", "`flex-wrap: wrap` with `justify-content: space-between`", "`columns: 4`"],
          answer: 1,
          why: "Flex lines are independent: with `flex: 1` the last two grow to half the row each, and `space-between` throws them to the edges. Grid columns exist whether they're filled or not, so the last row stays on the same tracks.",
        },
        {
          t: "rebuild",
          h: "The flex algorithm, graded by the browser",
          x: "The spec's *resolve flexible lengths* is a loop: share the space, clamp to min and max, freeze whoever hit a limit, share again. Below it is in 30 lines. Each case is also laid out by the real engine, and the console compares the two.",
          mode: "html",
          html: "<div id=\"out\"></div>",
          css: "body { font: 13px system-ui; }\n.case { margin: 10px 0 2px; color: #666; }\n.row { display: flex; background: #eee; }\n.row > div { height: 26px; display: grid; place-items: center; outline: 1px solid #fff;\n  background: #d49a3a; font: 600 12px ui-monospace, monospace; }\n.row > div:nth-child(2) { background: #3a8ad4; color: #fff; }",
          js: raw`const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// one line, no margins or gaps; items: { basis, grow, shrink, min, max }
function resolveFlex(size, items) {
  const hyp = items.map((it) => clamp(it.basis, it.min, it.max));
  const growing = hyp.reduce((a, b) => a + b, 0) < size;
  const st = items.map((it, i) => {
    const f = growing ? it.grow : it.shrink;
    const frozen = f === 0 || (growing ? it.basis > hyp[i] : it.basis < hyp[i]);
    return { ...it, f, frozen, target: frozen ? hyp[i] : it.basis };
  });
  const free = () => size - st.reduce((s, x) => s + (x.frozen ? x.target : x.basis), 0);
  const initial = free();
  for (;;) {
    const open = st.filter((x) => !x.frozen);
    if (!open.length) break;
    let rest = free();
    const sumF = open.reduce((s, x) => s + x.f, 0);
    if (sumF < 1 && Math.abs(initial * sumF) < Math.abs(rest)) rest = initial * sumF;
    const w = open.map((x) => (growing ? x.f : x.f * x.basis)); // shrink is weighted by basis
    const sumW = w.reduce((a, b) => a + b, 0);
    open.forEach((x, i) => (x.target = x.basis + (rest * w[i]) / sumW));
    let total = 0;
    for (const x of open) {
      const c = clamp(x.target, x.min, x.max);
      x.viol = Math.sign(c - x.target); // +1 hit its min, -1 hit its max
      total += c - x.target;
      x.target = c;
    }
    for (const x of open) if (Math.abs(total) < 1e-9 || x.viol === Math.sign(total)) x.frozen = true;
  }
  return st.map((x) => x.target);
}

const cases = [
  ['grow 1 1 2', 360, [{ basis: 60, grow: 1 }, { basis: 60, grow: 1 }, { basis: 60, grow: 2 }]],
  ['shrink is weighted', 300, [{ basis: 200 }, { basis: 400 }]],
  ['a max freezes, the rest regrow', 360, [{ basis: 0, grow: 1, max: 60 }, { basis: 0, grow: 1 }, { basis: 0, grow: 1 }]],
  ['a min freezes a shrink', 300, [{ basis: 200, min: 180 }, { basis: 200 }]],
  ['grow sums to 0.5', 360, [{ basis: 60, grow: 0.2 }, { basis: 60, grow: 0.3 }]],
  ['shrink 0 holds', 300, [{ basis: 200, shrink: 0 }, { basis: 200 }]],
];

const out = document.getElementById('out');
for (const [name, size, spec] of cases) {
  const items = spec.map((it) => ({ grow: 0, shrink: 1, min: 0, max: Infinity, ...it }));
  const row = document.createElement('div');
  row.className = 'row';
  row.style.width = size + 'px';
  for (const it of items) {
    const d = document.createElement('div');
    d.style.cssText = 'flex: ' + it.grow + ' ' + it.shrink + ' ' + it.basis + 'px; min-width: ' + it.min + 'px; max-width: ' + (it.max === Infinity ? 'none' : it.max + 'px');
    row.append(d);
  }
  out.append(Object.assign(document.createElement('p'), { className: 'case', textContent: name }), row);
  const browser = [...row.children].map((d) => d.getBoundingClientRect().width);
  const mine = resolveFlex(size, items);
  mine.forEach((w, i) => (row.children[i].textContent = +w.toFixed(1)));
  const ok = mine.every((w, i) => Math.abs(w - browser[i]) < 0.05);
  console.log(ok ? 'ok  ' : 'DIFF', name, 'mine', mine.map((w) => +w.toFixed(2)), 'browser', browser.map((w) => +w.toFixed(2)));
}`,
          task: "Add a case of your own and make it disagree. Then add `gap` and item margins to the free space, and `flex-wrap`: break lines on base sizes first, then resolve each line.",
        },
        {
          t: "mission",
          h: "An app shell that survives real content",
          x: "Header, a sticky sidebar, a main area with a card grid, and a footer pinned to the bottom of short pages. Cards use subgrid so their buttons align. A 200-character file name in the header ends in an ellipsis. Nothing scrolls sideways at 320px wide.",
          hint: "`min-height: 100dvh` and rows `auto 1fr auto` on the shell, `align-self: start` on the sidebar, `min-width: 0` on the flex item holding the name, `minmax(0, 1fr)` for main.",
          solution: {
            lang: "css",
            src: ".shell {\n  display: grid;\n  grid-template:\n    \"head head\" auto\n    \"side main\" 1fr\n    \"foot foot\" auto / 220px minmax(0, 1fr);\n  min-height: 100dvh;\n}\nheader { grid-area: head; display: flex; align-items: center; gap: 12px; }\n.file { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }\naside { grid-area: side; position: sticky; top: 0; align-self: start; }\nmain { grid-area: main; }\nfooter { grid-area: foot; }\n\n.cards { display: grid; gap: 16px;\n  grid-template-columns: repeat(auto-fill, minmax(min(200px, 100%), 1fr)); }\n.card { display: grid; grid-row: span 3; grid-template-rows: subgrid; }\n\n@media (width < 700px) {\n  .shell { grid-template: \"head\" auto \"side\" auto \"main\" 1fr \"foot\" auto / minmax(0, 1fr); }\n  aside { position: static; }\n}",
          },
        },
      ],
    },
  ],
  nobodyTells: [
    "When something overflows, find the min-content floor: a long word, a URL, a `<pre>`, an image, a `nowrap`, or a flex item's `min-width: auto`. It's almost always one of those.",
    "`width: 100vw` includes the vertical scrollbar. On Windows that's about 15px wider than the page, and you get a sideways scrollbar that never shows on a Mac. Use `100%`.",
    "`* { outline: 1px solid red }` finds the element causing sideways scroll in seconds. Outlines take no space, so they don't change the layout you're debugging.",
    "Firefox's flex inspector shows each item's base size, how much it grew or shrank, and which min or max clamped it: the flex algorithm, printed.",
    "`minmax(min(240px, 100%), 1fr)` in an `auto-fill` grid stops the single column from overflowing on screens narrower than 240px.",
    "A sticky element keeps its slot in the flow like `relative`; `fixed` and `absolute` leave a hole. Swapping one for the other moves everything below it.",
    "Visual order is not DOM order. `order`, `row-reverse`, `dense` and grid placement move pixels, never focus, screen readers or text selection.",
  ],
  glossary: [
    ["normal flow", "The default layout: blocks stack down the page, inlines run along lines."],
    ["formatting context", "The algorithm a box uses to lay out its children: flow, flex, grid or table."],
    ["BFC", "Block formatting context: a flow layout that contains its floats and keeps child margins inside."],
    ["min-content", "The narrowest a box can be without overflowing: usually its longest unbreakable run."],
    ["max-content", "The width a box wants if nothing wraps."],
    ["fit-content", "`min(max-content, max(min-content, available))`: shrink to fit, wrap when space runs out."],
    ["flex base size", "Where an item starts before growing or shrinking: its flex-basis, width or content size."],
    ["free space", "The container's size minus the items' base sizes and gaps. Negative means shrink."],
    ["automatic minimum size", "`min-width: auto` on flex and grid items: no smaller than min-content, unless a scroll container."],
    ["fr", "A share of a grid's leftover space after fixed tracks and gaps. `1fr` means `minmax(auto, 1fr)`."],
    ["implicit grid", "Tracks the grid adds for items placed outside the template, sized by `grid-auto-rows`/`-columns`."],
    ["subgrid", "A nested grid that uses its parent's tracks instead of sizing its own."],
    ["containing block", "The rectangle that percentages and insets resolve against."],
    ["scroll container", "A box with `overflow` other than `visible` or `clip`; sticky elements stick inside the nearest one."],
    ["top layer", "Where modal dialogs and popovers render: above all z-index, outside ancestors' transforms and clipping."],
  ],
  explain: "Explain to a friend why a flex item with a long file name refuses to shrink, starting from what `min-width: auto` means, and why `overflow: hidden` fixes it too.",
};
