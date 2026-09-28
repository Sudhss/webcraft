export default {
  id: "html",
  n: 4,
  part: "B",
  title: "HTML and accessibility",
  hook: "Your markup builds a second tree that screen readers, keyboards and autofill live in. Most sites build it wrong.",
  minutes: 70,
  levels: ["use", "understand", "rebuild"],
  sections: [
    {
      title: "The tree nobody looks at",
      beats: [
        { t: "say", x: "Next to the DOM, the browser builds the **accessibility tree**. Every node has a role, a name, states and maybe a value. Screen readers, voice control and switch devices see only this tree, never your pixels." },
        {
          t: "code",
          lang: "html",
          src: `<button aria-pressed="true">Bold</button>
<div class="btn" onclick="bold()">Bold</div>

<!-- What the accessibility tree holds:
  button "Bold", pressed, focusable
  generic                      (text "Bold", no role, not focusable) -->`,
          mark: [4, 5],
          note: "Same pixels, different trees. The `div` is a text node to assistive tech: no role, no focus, no keyboard.",
        },
        {
          t: "predict",
          lang: "css",
          src: `.a { display: none; }
.b { visibility: hidden; }
.c { opacity: 0; }
.d { position: absolute; width: 1px; height: 1px;
     overflow: hidden; clip-path: inset(50%); white-space: nowrap; }`,
          q: "Which elements are still read by a screen reader?",
          options: ["None of them", "Only .d", ".c and .d", ".b, .c and .d"],
          answer: 2,
          why: "`display: none` and `visibility: hidden` remove nodes from the tree. `opacity: 0` hides pixels only, so it's still read and still clickable. `.d` is the visually-hidden pattern: invisible, but in the tree on purpose.",
        },
        {
          t: "table",
          head: ["You get free with", "`<button>`", "`<div onclick>`"],
          rows: [
            ["Role announced", "\"button\"", "nothing"],
            ["In Tab order", "yes", "no"],
            ["Enter and Space", "fire `click`", "nothing"],
            ["Disabled state", "`disabled` blocks events and focus", "you write it"],
            ["Form submit", "yes, default `type=submit`", "no"],
          ],
          caption: "Semantics are not SEO decoration. They're behaviour you'd otherwise hand-write, badly.",
        },
        {
          t: "pitfall",
          h: "CSS generated content gets read aloud",
          x: "Text from `::before` and `::after` is part of the accessible name. An icon font glyph or a decorative arrow gets announced, sometimes as garbage. Give it empty alt text: `content: \"\\2192\" / \"\"`.",
        },
        { t: "say", h: "See the real tree", x: "Chrome DevTools, Elements panel, **Accessibility** tab: role, computed name and where the name came from. Tick \"full-page accessibility tree\" to browse the whole thing. Use it more than you use the DOM view." },
      ],
    },
    {
      title: "Landmarks, headings and lists",
      beats: [
        { t: "say", x: "Screen reader users skim by jumping. In NVDA and JAWS: **H** next heading, **1**-**6** a heading level, **D** or **R** next landmark. VoiceOver puts the same lists in the rotor (VO+U). Your headings are the table of contents they navigate." },
        {
          t: "code",
          lang: "html",
          src: `<body>
  <a class="skip" href="#main">Skip to content</a>
  <header>...</header>          <!-- banner -->
  <nav aria-label="Primary">...</nav>
  <main id="main" tabindex="-1"> <!-- main -->
    <h1>Orders</h1>
    <section aria-labelledby="open-h">  <!-- region: has a name -->
      <h2 id="open-h">Open orders</h2>
    </section>
  </main>
  <aside>...</aside>            <!-- complementary -->
  <footer>...</footer>          <!-- contentinfo -->
</body>`,
          note: "One `main`. Label every `nav` if there's more than one, or they all read as \"navigation\".",
        },
        {
          t: "table",
          head: ["Element", "Landmark", "Only when"],
          rows: [
            ["`<header>`", "banner", "not inside `article`, `aside`, `main`, `nav`, `section`"],
            ["`<footer>`", "contentinfo", "same scoping rule as header"],
            ["`<section>`", "region", "it has an accessible name"],
            ["`<form>`", "form", "it has an accessible name"],
            ["`<nav>`, `<main>`, `<aside>`", "navigation, main, complementary", "always"],
          ],
        },
        {
          t: "predict",
          lang: "html",
          src: `<article>
  <h1>Release notes</h1>
  <section>
    <h1>Breaking changes</h1>
  </section>
</article>`,
          q: "What level does a screen reader announce for \"Breaking changes\"?",
          options: ["Heading level 2, from nesting", "Heading level 1", "Depends on the font size", "It isn't a heading"],
          answer: 1,
          why: "The \"document outline algorithm\" that would have made it level 2 was never implemented by any browser, and was removed from the spec in 2022. `h1` is level 1, everywhere. Use real levels.",
        },
        {
          t: "pitfall",
          h: "Pick heading levels for structure, not size",
          x: "Using `h4` because it looks right in the sidebar breaks the outline people navigate with. Choose the level from the structure, then style it with a class. Skipping levels (h2 to h4) makes users think they missed a section.",
        },
        {
          t: "pitfall",
          h: "`list-style: none` can erase your list in Safari",
          x: "WebKit drops list semantics from unstyled `ul`s, so VoiceOver stops saying \"list, 5 items\". It's a deliberate heuristic against div-soup lists. If the count matters, add `role=\"list\"` to the `ul`.",
        },
      ],
    },
    {
      title: "Buttons, links and the div",
      beats: [
        { t: "say", x: "A **link** goes somewhere: it changes the URL, can open in a new tab, shows up in history. A **button** does something here. Everything about their keyboard behaviour follows from that split." },
        {
          t: "predict",
          lang: "html",
          src: `<a>Docs</a>
<a href="/docs">Docs</a>
<button disabled>Save</button>
<div tabindex="-1">Panel</div>
<input type="hidden" name="csrf">
<details><summary>More</summary>...</details>
<span contenteditable>Edit me</span>`,
          q: "How many Tab stops does this page have?",
          options: ["2", "3", "4", "7"],
          answer: 1,
          why: "The `href` link, the `summary` and the `contenteditable`. An `<a>` without `href` isn't even a link (no role, no focus). Disabled buttons, hidden inputs and `tabindex=-1` are skipped by Tab.",
        },
        {
          t: "table",
          head: ["Key", "`<button>`", "`<a href>`", "`<div role=button tabindex=0>`"],
          rows: [
            ["Enter", "click, on keydown", "follows link", "nothing unless you code it"],
            ["Space", "click, on keyup", "scrolls the page", "scrolls the page"],
            ["Ctrl or Cmd + click", "a plain click", "opens a new tab", "a plain click"],
            ["Right click", "normal menu", "\"Copy link\", \"Open in new tab\"", "normal menu"],
          ],
        },
        {
          t: "play",
          mode: "html",
          title: "keys.html",
          html: `<button id="b">button</button>
<a id="a" href="#x">link</a>
<div id="d" onclick="">div with onclick</div>
<pre id="log"></pre>`,
          css: `body { font: 15px system-ui; padding: 16px; display: grid; gap: 10px; justify-items: start; }
#d { padding: 4px 8px; background: #eee; cursor: pointer; }
:focus-visible { outline: 3px solid #d49a3a; outline-offset: 2px; }
pre { background: #111; color: #9f9; padding: 8px; min-height: 120px; width: 90%; }`,
          js: `const log = (m) => { const p = document.getElementById('log'); p.textContent = m + '\\n' + p.textContent; };
for (const id of ['b', 'a', 'd']) {
  const el = document.getElementById(id);
  el.addEventListener('click', (e) => { e.preventDefault(); log(id + ': click (detail=' + e.detail + ')'); });
  el.addEventListener('keydown', (e) => log(id + ': keydown ' + (e.key === ' ' ? 'Space' : e.key)));
  el.addEventListener('focus', () => log(id + ': focus'));
}`,
          task: "Click in the frame, then Tab. Press Enter and Space on each. Note `detail=0`: that's a click made by the keyboard. Can you even reach the div?",
        },
        { t: "say", h: "Why the div seems to work", x: "NVDA and JAWS run in **browse mode**: they eat your keystrokes and, on Enter, send the element a synthetic click. So a clickable div \"works\" with a screen reader and fails for every keyboard-only user. Test with no mouse and no screen reader too." },
        {
          t: "compare",
          a: { label: "A div doing a button's job", lang: "html", src: `<div role="button" tabindex="0"
  onclick="save()"
  onkeydown="if (event.key === 'Enter') save();
    if (event.key === ' ') { event.preventDefault(); save(); }">
  Save
</div>` },
          b: { label: "A button", lang: "html", src: `<button type="button" onclick="save()">Save</button>` },
          x: "The left one still misses Space-on-keyup, `disabled`, form participation and high contrast mode styling. `all: unset` on a real button is less work than rebuilding one.",
        },
        {
          t: "pitfall",
          h: "Never use a positive `tabindex`",
          x: "`tabindex=\"1\"` and up jump the queue: all positive values go first in numeric order, then the rest of the page in DOM order. It fixes one field and scrambles everything else. Use `0` or `-1` only, and fix the DOM order instead.",
        },
      ],
    },
    {
      title: "Forms: labels, types, autofill",
      beats: [
        { t: "say", x: "A `<label for>` does three jobs at once: it names the field in the tree, it makes the text a click target, and clicking it focuses or toggles the control. A placeholder does none of that reliably and vanishes as you type." },
        {
          t: "pitfall",
          h: "A click handler on a label runs twice",
          x: "Clicking label text dispatches a second, synthetic click on its input, which bubbles back up through the label. So `label.onclick` fires once for the label and once for the input. Listen for `change` on the input instead.",
        },
        {
          t: "table",
          head: ["Field", "Use", "Why"],
          rows: [
            ["Email", "`type=email autocomplete=email`", "@ keyboard on phones, typeMismatch validation"],
            ["Phone", "`type=tel autocomplete=tel`", "dial pad; no validation, phone formats are too varied"],
            ["OTP", "`inputmode=numeric autocomplete=one-time-code`", "digit pad, and iOS offers the code from the SMS"],
            ["Card number", "`inputmode=numeric autocomplete=cc-number`", "digit pad without `number`'s spinner and rounding"],
            ["Search", "`type=search enterkeyhint=search`", "clear button, and the Enter key says \"Search\""],
          ],
        },
        {
          t: "pitfall",
          h: "`type=number` is for quantities only",
          x: "The mouse wheel changes the value while scrolling past it, `e` and `-` are allowed anywhere, leading zeros vanish, and a half-typed value reads as `\"\"`. Zip codes, OTPs and card numbers are strings of digits: use `inputmode=\"numeric\"`.",
        },
        {
          t: "code",
          lang: "html",
          src: `<form method="post" action="/signup">
  <label for="u">Username</label>
  <input id="u" name="username" autocomplete="username" required>

  <label for="p">Password</label>
  <input id="p" name="password" type="password"
         autocomplete="new-password" minlength="12" required>

  <label for="z">Postcode</label>
  <input id="z" name="zip" autocomplete="shipping postal-code">

  <button>Create account</button>
</form>`,
          mark: [3, 7, 10],
          note: "`new-password` tells password managers to offer a generated one; `current-password` is for logins. `shipping` and `billing` prefixes keep two addresses apart.",
        },
        {
          t: "pitfall",
          h: "iOS zooms into any input under 16px",
          x: "Focus a field with `font-size` below 16px and iOS Safari zooms the page, then leaves it zoomed. The fix is `font-size: 16px` (or `max(16px, 1rem)`) on inputs, not `maximum-scale=1`, which disables pinch zoom for everyone on Android.",
        },
        {
          t: "quiz",
          q: "You set `autocomplete=\"off\"` on a login form. What do password managers do?",
          options: ["Stop offering saved passwords", "Mostly ignore it and offer them anyway", "Refuse to save the password", "Clear the field on load"],
          answer: 1,
          why: "Browsers deliberately ignore `off` on login fields: blocking password managers pushes people to weak, reused passwords. Give fields correct tokens instead of fighting autofill.",
        },
      ],
    },
    {
      title: "Validation and submitting without JavaScript",
      beats: [
        { t: "say", x: "A form works with JS disabled. The browser collects every **named, enabled** control, encodes it, and navigates: GET puts it in the query string, POST in the body as `application/x-www-form-urlencoded`, or `multipart/form-data` for files." },
        {
          t: "predict",
          lang: "html",
          src: `<form action="/s">
  <input name="a" value="1" disabled>
  <input name="b" value="2" readonly>
  <input value="3">
  <input type="checkbox" name="c">
  <input type="checkbox" name="d" checked>
  <button>Go</button>
</form>`,
          q: "Click Go. What's the URL?",
          options: ["/s?a=1&b=2&c=&d=on", "/s?b=2&d=on", "/s?a=1&b=2&d=true", "/s?b=2&3&d=on"],
          answer: 1,
          why: "Disabled controls aren't sent, readonly ones are. No `name`, not sent. Unchecked boxes are absent, not `false`, and a checked box with no `value` sends `on`. Servers must treat \"missing\" as false.",
        },
        {
          t: "predict",
          lang: "html",
          src: `<form onsubmit="alert('sent'); return false">
  <input name="first">
  <input name="last">
</form>`,
          q: "Type in \"first\" and press Enter. What happens?",
          options: ["The form submits", "Nothing", "Focus moves to \"last\"", "Only the first field is sent"],
          answer: 1,
          why: "Implicit submission: with no submit button, Enter submits only if the form has exactly one text-like field. Two fields and no button, nothing. Add a button, and Enter fires a `click` event on it, so its click handler runs.",
        },
        {
          t: "viz",
          name: "frames",
          props: {
            cols: ["Event", "Your code can", "Browser does"],
            frames: [
              { cells: [["keydown Enter"], ["preventDefault to stop it"], ["finds the default button"]], note: "Enter in a text field: implicit submission looks for the first submit button in tree order." },
              { cells: [["click on button"], ["read e.detail === 0"], ["runs the button's activation"]], note: "A synthetic click on the submit button. Your button's click handler fires even though nobody clicked." },
              { cells: [["invalid (per field)"], ["custom messages"], ["validate all constraints"]], note: "Validation runs before the submit event. If any field fails, `invalid` fires on each, the first one gets focus and a bubble, and it stops here." },
              { cells: [["submit"], ["e.submitter, preventDefault"], ["waits for handlers"]], note: "Only valid forms reach `submit`. Cancel it to take over with `fetch`." },
              { cells: [["formdata"], ["append extra entries"], ["builds the entry list"]], note: "The `formdata` event lets you add fields without hidden inputs." },
              { cells: [["(navigation)"], ["nothing, page unloads"], ["GET query or POST body"]], note: "A full navigation. The response replaces the page, and history gets an entry." },
            ],
          },
        },
        {
          t: "quiz",
          q: "`form.submit()` versus `form.requestSubmit()`?",
          options: ["Identical", "`submit()` skips validation and never fires the submit event", "`requestSubmit()` skips validation", "`submit()` is async"],
          answer: 1,
          why: "`submit()` is the raw navigation: no constraint validation, no `submit` event, so your handler and your `preventDefault` never run. `requestSubmit(btn)` behaves exactly like clicking `btn`.",
        },
        {
          t: "code",
          lang: "js",
          src: `const email = form.elements.email;
email.validity;          // { valueMissing, typeMismatch, patternMismatch,
                         //   tooShort, rangeOverflow, badInput, customError, valid, ... }
email.checkValidity();   // boolean, fires 'invalid' if false
email.reportValidity();  // same, and shows the browser bubble

email.addEventListener('input', () => {
  const taken = email.value === 'ada@x.dev';
  email.setCustomValidity(taken ? 'That email is taken.' : '');
});`,
          mark: [9],
          note: "The browser's own validator runs your custom error too, so you keep native focus, bubbles and `:invalid` styling.",
        },
        {
          t: "pitfall",
          h: "`setCustomValidity` sticks until you clear it",
          x: "Any non-empty message makes the field invalid forever, even after the user fixes it. Always set `''` on the good path, and set it on `input`, not only on submit, or the form can never be submitted again.",
        },
        {
          t: "pitfall",
          h: "`pattern` is compiled with the `v` flag",
          x: "Modern browsers compile `pattern` as `new RegExp('^(?:' + p + ')$', 'v')`. In `v` mode a bare `-` in a class is a syntax error, so `[a-z0-9-]+` is invalid, and an invalid pattern is silently ignored. Write `[a-z0-9\\-]+`.",
        },
        {
          t: "play",
          mode: "html",
          title: "validate.html",
          html: `<form id="f">
  <label>Email <input name="email" type="email" required></label>
  <label>Handle <input name="handle" pattern="[a-z0-9\\-]{3,}" required></label>
  <label><input type="checkbox" name="tags" value="css"> css</label>
  <label><input type="checkbox" name="tags" value="js"> js</label>
  <button name="intent" value="save">Save</button>
  <button name="intent" value="publish">Publish</button>
</form>
<pre id="out"></pre>`,
          css: `body { font: 15px system-ui; padding: 16px; }
form { display: grid; gap: 8px; max-width: 320px; }
input:user-invalid { outline: 2px solid crimson; }
pre { background: #111; color: #9f9; padding: 8px; }`,
          js: `const f = document.getElementById('f');
f.addEventListener('submit', (e) => {
  e.preventDefault();
  const fd = new FormData(f, e.submitter);
  document.getElementById('out').textContent =
    'entries: ' + JSON.stringify([...fd]) +
    '\\nfromEntries: ' + JSON.stringify(Object.fromEntries(fd)) +
    '\\ngetAll(tags): ' + JSON.stringify(fd.getAll('tags'));
});`,
          task: "Tick both boxes and submit with each button. See `fromEntries` lose a tag and see which button submitted. Note `:user-invalid` waits until you've touched a field; `:invalid` wouldn't.",
        },
      ],
    },
    {
      title: "Dialogs, inert and focus",
      beats: [
        { t: "say", x: "`dialog.showModal()` gives you, for free: the **top layer** (above every `z-index`), a `::backdrop`, the rest of the page made inert, Escape to close, focus moved inside, and focus returned to the opener on close." },
        {
          t: "play",
          mode: "html",
          title: "dialog.html",
          html: `<button id="open">Delete project</button>
<p id="res"></p>
<dialog id="dlg">
  <form method="dialog">
    <p>Delete for good?</p>
    <button value="cancel" autofocus>Cancel</button>
    <button value="delete">Delete</button>
  </form>
</dialog>`,
          css: `body { font: 15px system-ui; padding: 16px; }
dialog { border: 0; border-radius: 12px; padding: 20px; }
dialog::backdrop { background: rgb(0 0 0 / .5); }`,
          js: `const dlg = document.getElementById('dlg');
document.getElementById('open').onclick = () => dlg.showModal();
dlg.addEventListener('close', () => {
  document.getElementById('res').textContent = 'returnValue: ' + dlg.returnValue;
});
dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close('backdrop'); });`,
          task: "Open it, press Tab: focus can't leave. Press Escape. Click the backdrop. Then swap `showModal()` for `show()` and see what you lose.",
        },
        {
          t: "predict",
          lang: "js",
          src: `dialog.addEventListener('click', (e) => {
  console.log(e.target === dialog);
});
// user clicks the dimmed backdrop, outside the box`,
          q: "What's logged?",
          options: ["false, the target is document.body", "true", "Nothing, the backdrop isn't clickable", "false, the target is the ::backdrop"],
          answer: 1,
          why: "Pseudo-elements are never event targets. The `::backdrop` belongs to the dialog, so the click lands on the dialog itself. That's the light-dismiss trick; pad the dialog's content in an inner element so clicks on padding don't close it.",
        },
        { t: "say", x: "`inert` does the same thing to any subtree: no focus, no clicks, gone from the accessibility tree. Use it for off-screen drawers and the page behind a custom overlay. It replaces the old `aria-hidden` plus focus-trap scripts." },
        {
          t: "code",
          lang: "css",
          src: `/* Never this, alone: */
:focus { outline: none; }

/* This: a ring for keyboard users, none for mouse clicks on buttons */
:focus-visible {
  outline: 3px solid var(--focus, #d49a3a);
  outline-offset: 2px;
}
/* Style a group when anything inside has focus */
.field:focus-within { border-color: var(--focus, #d49a3a); }`,
          note: "`outline` doesn't take layout space and survives Windows high contrast mode. A `box-shadow` ring disappears there.",
        },
        {
          t: "quiz",
          q: "You click a text input and a button with the mouse. Which match `:focus-visible` in Chrome?",
          options: ["Both", "Neither", "Only the text input", "Only the button"],
          answer: 2,
          why: "Controls that take keyboard input always match, because you'll type into them next. A mouse-clicked button doesn't. Keyboard focus always matches. Script `focus()` inherits whether the last interaction was a key.",
        },
        {
          t: "pitfall",
          h: "Safari doesn't focus buttons on click",
          x: "On macOS, Safari follows the platform: clicking a `<button>` doesn't focus it. Menus that close on `blur` or check `e.relatedTarget` break only in Safari. Close on outside `pointerdown` instead, or use the Popover API.",
        },
        {
          t: "pitfall",
          h: "Client-side routing loses the user",
          x: "A full page load resets focus and screen readers announce the new title. A SPA route change does neither: focus stays on a link that may no longer exist. After navigating, move focus to the new `h1` (with `tabindex=\"-1\"`) or a wrapper.",
        },
      ],
    },
    {
      title: "ARIA: the first rule is don't",
      beats: [
        { t: "say", x: "ARIA only edits the accessibility tree. It adds **no behaviour**: `role=\"button\"` doesn't make Enter work, `aria-disabled` doesn't block clicks. The first rule of ARIA is to use the native element when one exists." },
        {
          t: "quiz",
          q: "`<button aria-hidden=\"true\">Close</button>`. What happens for a screen reader user?",
          options: ["The button is ignored entirely", "Tab still lands on it, and it's announced as nothing or as a blank", "It's announced normally", "The browser removes it from Tab order"],
          answer: 1,
          why: "`aria-hidden` removes it from the tree but not from focus order. The user tabs onto a ghost. Never put `aria-hidden` on something focusable, or on an ancestor of one. That's what `inert` is for.",
        },
        {
          t: "table",
          head: ["ARIA worth knowing", "Use"],
          rows: [
            ["`aria-expanded` on a toggle button", "\"collapsed\" / \"expanded\" for disclosures and menus"],
            ["`aria-current=\"page\"`", "the current link in a nav"],
            ["`aria-describedby`", "hint and error text read after the name"],
            ["`aria-invalid=\"true\"`", "announce a field as invalid when you manage validation"],
            ["`aria-labelledby`", "name from visible text elsewhere; beats `aria-label` for translation"],
            ["`role=\"status\"` / `role=\"alert\"`", "polite / assertive live regions"],
          ],
        },
        { t: "say", h: "Live regions", x: "A live region makes the screen reader announce changes to its text. `polite` waits for a pause, `assertive` interrupts. The browser watches for **changes**: the region must already be in the tree before its text changes." },
        {
          t: "predict",
          lang: "js",
          src: `// on save:
document.body.insertAdjacentHTML('beforeend',
  '<div aria-live="polite">Saved</div>');`,
          q: "What does the screen reader say?",
          options: ["\"Saved\"", "Often nothing", "\"Saved\" twice", "\"Alert, Saved\""],
          answer: 1,
          why: "A region created together with its text has no *change* to announce, so many browser and reader pairs stay silent. Render an empty region at load, then set its `textContent`.",
        },
        {
          t: "code",
          lang: "html",
          src: `<!-- In the page from the start, visually hidden or not -->
<div id="status" role="status"></div>

<script>
  function announce(msg) {
    const el = document.getElementById('status');
    el.textContent = '';                 // same text twice is no change
    setTimeout(() => (el.textContent = msg), 50);
  }
</script>`,
          mark: [2, 7],
          note: "`role=\"status\"` means polite and atomic: the whole region is read, not just the changed part. Keep messages short; nobody can skim a spoken paragraph.",
        },
      ],
    },
    {
      title: "Images that don't hurt",
      beats: [
        { t: "say", x: "No `alt` and many screen readers fall back to the file name: \"IMG underscore 2049 dot jpeg\". `alt=\"\"` marks it decorative and drops it from the tree. Those are different decisions; make one on purpose." },
        {
          t: "quiz",
          q: "A logo image is the only content of the link to `/`. What's its alt?",
          options: ["\"logo\"", "\"Acme logo, a blue triangle\"", "\"Acme home\"", "\"\""],
          answer: 2,
          why: "Inside a link, the image's alt *is* the link's name, so describe where it goes. `alt=\"\"` would leave an unnamed link, announced as its URL. Alt describes function first, appearance only when appearance is the content.",
        },
        {
          t: "code",
          lang: "html",
          src: `<img src="card-800.jpg"
     srcset="card-400.jpg 400w, card-800.jpg 800w, card-1600.jpg 1600w"
     sizes="(min-width: 60rem) 33vw, 100vw"
     width="800" height="500"
     alt="Terminal showing the build output"
     loading="lazy" decoding="async">`,
          mark: [3, 4],
          note: "`w` descriptors say how wide each file is. `sizes` says how wide the slot will be. The browser does the maths and may pick a bigger file it already has cached.",
        },
        {
          t: "predict",
          lang: "html",
          src: `<!-- viewport 1200 CSS px wide, devicePixelRatio 2 -->
<img srcset="a-600.jpg 600w, a-1200.jpg 1200w, a-2400.jpg 2400w"
     sizes="(min-width: 60rem) 33vw, 100vw" ...>`,
          q: "How many image pixels wide does the browser want?",
          options: ["400", "800", "1200", "2400"],
          answer: 1,
          why: "1200px is past 60rem, so the slot is 33vw, about 400 CSS px. Times DPR 2, about 800 device px. Which file it then takes is up to the browser. Leave `sizes` off and it assumes `100vw`: 2400 px for a thumbnail.",
        },
        {
          t: "pitfall",
          h: "`loading=\"lazy\"` on the hero image",
          x: "Lazy images wait for layout to prove they're near the viewport, so the LCP image starts late. Put `loading=\"lazy\"` only below the fold. For the hero, do the opposite: `fetchpriority=\"high\"`, because images start at low priority until the browser knows they're visible.",
        },
        {
          t: "compare",
          a: { label: "No size attributes", lang: "html", src: `<img src="chart.png" alt="...">
<p>This paragraph jumps down
when the image loads.</p>` },
          b: { label: "width and height", lang: "html", src: `<img src="chart.png" alt="..."
     width="1200" height="600">
<!-- UA sheet: aspect-ratio: auto 1200 / 600 -->` },
          x: "Browsers map `width`/`height` to `aspect-ratio`, so the box is reserved before a byte arrives, even with `width: 100%; height: auto` in CSS. That's layout shift (CLS) fixed by two attributes.",
        },
        {
          t: "code",
          lang: "html",
          src: `<picture>
  <!-- art direction: a different crop on narrow screens -->
  <source media="(max-width: 40rem)" srcset="hero-square.avif" type="image/avif">
  <!-- format negotiation: first type the browser supports wins -->
  <source srcset="hero.avif" type="image/avif">
  <source srcset="hero.webp" type="image/webp">
  <img src="hero.jpg" alt="A night train crossing a bridge"
       width="1600" height="900" fetchpriority="high">
</picture>`,
          note: "The `<img>` is the element that renders and carries `alt`, size and priority. `<source>` only swaps what it loads. Style the `img`, not the `picture`.",
        },
      ],
    },
    {
      title: "The head, in the right order",
      beats: [
        {
          t: "code",
          lang: "html",
          src: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Orders | Acme</title>
  <link rel="preconnect" href="https://cdn.example.com" crossorigin>
  <link rel="preload" href="/f/inter.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="/app.css">
  <script type="module" src="/app.js"></script>
</head>`,
          mark: [2, 4, 8],
          note: "`lang` picks the screen reader's voice and hyphenation. `charset` must be in the first 1024 bytes. Module scripts are deferred by default.",
        },
        {
          t: "predict",
          lang: "html",
          src: `<!-- no meta viewport at all -->
<body style="font-size:16px">A normal paragraph.</body>`,
          q: "On a phone 390 CSS px wide, how is it laid out?",
          options: ["At 390px, normal size", "At about 980px, then scaled down: tiny text", "At 1920px", "At 390px, but zoomed in"],
          answer: 1,
          why: "Without the viewport meta, mobile browsers assume a desktop page and use a layout viewport of about 980px, then shrink it to fit. Media queries see 980px too. `width=device-width` is the fix.",
        },
        {
          t: "table",
          head: ["Hint", "Does", "Use for"],
          rows: [
            ["`preconnect`", "DNS + TCP + TLS now, no request", "2 or 3 origins you'll hit early"],
            ["`dns-prefetch`", "DNS only, cheap", "origins you might hit"],
            ["`preload`", "fetch now at high priority", "late-discovered critical files: fonts, CSS background LCP"],
            ["`modulepreload`", "fetch and parse a module", "deep import chains"],
            ["`prefetch`", "fetch at idle for a future page", "the next likely navigation"],
            ["`fetchpriority`", "raise or lower one fetch", "the LCP image; carousels' hidden slides"],
          ],
        },
        {
          t: "pitfall",
          h: "Preloading a font without `crossorigin`",
          x: "Fonts are always fetched in CORS mode. A preload without `crossorigin` doesn't match the real request, so the browser downloads the font twice. Same origin or not, font preloads need `crossorigin`.",
        },
        {
          t: "mission",
          h: "A signup form that works with JS off",
          x: "Build a signup form: name, email, password, a plan radio group and a terms checkbox. Correct labels, autocomplete tokens and constraints, a real submit. Then add JS that checks the handle is free via `setCustomValidity`. Test it keyboard-only, then with JS disabled.",
          hint: "Radio groups need `<fieldset>` and `<legend>` for the group name. `autocomplete=\"new-password\"`. The JS only enhances: the form must still submit without it.",
          solution: {
            lang: "html",
            src: `<form method="post" action="/signup">
  <label for="n">Name</label>
  <input id="n" name="name" autocomplete="name" required>
  <label for="e">Email</label>
  <input id="e" name="email" type="email" autocomplete="email" required>
  <label for="p">Password</label>
  <input id="p" name="password" type="password" autocomplete="new-password"
         minlength="12" required aria-describedby="p-hint">
  <p id="p-hint">At least 12 characters.</p>
  <fieldset>
    <legend>Plan</legend>
    <label><input type="radio" name="plan" value="free" checked> Free</label>
    <label><input type="radio" name="plan" value="pro"> Pro</label>
  </fieldset>
  <label><input type="checkbox" name="terms" required> I accept the terms</label>
  <button>Create account</button>
</form>`,
          },
        },
        {
          t: "rebuild",
          h: "Rebuild the Tab order",
          x: "The sequential focus order is a sort: positive `tabindex` first in ascending order, then everything else focusable in DOM order. Write it, then press Tab through the page and check your list against reality.",
          mode: "html",
          html: `<input placeholder="one">
<button tabindex="2">tabindex 2</button>
<a href="#">link</a>
<a>no href</a>
<button disabled>disabled</button>
<div tabindex="0">div 0</div>
<button tabindex="1">tabindex 1</button>
<div tabindex="-1">div -1</div>
<details><summary>summary</summary>hidden inside</details>
<ol id="order"></ol>`,
          css: `body { font: 14px system-ui; padding: 12px; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
#order { flex-basis: 100%; background: #f4f4f4; padding: 8px 8px 8px 28px; }
:focus-visible { outline: 3px solid #d49a3a; }`,
          js: `function tabOrder(root) {
  const sel = 'a[href], button, input, select, textarea, summary, [tabindex], [contenteditable]';
  const all = [...root.querySelectorAll(sel)].filter((el) =>
    !el.disabled && el.tabIndex >= 0 && el.type !== 'hidden');
  const pos = all.filter((el) => el.tabIndex > 0).sort((a, b) => a.tabIndex - b.tabIndex);
  const zero = all.filter((el) => el.tabIndex === 0);
  return [...pos, ...zero];
}
const out = document.getElementById('order');
for (const el of tabOrder(document.body)) {
  const li = document.createElement('li');
  li.textContent = el.tagName.toLowerCase() + ': ' + (el.textContent.trim() || el.placeholder);
  out.append(li);
}`,
          task: "Add a `hidden` element, a `display:none` one and a `<summary>` that isn't the first child. Make `tabOrder` still match real Tab. `el.checkVisibility()` helps.",
        },
      ],
    },
  ],
  nobodyTells: [
    "Unplug your mouse for ten minutes a week. The bugs you find that way are the ones most sites ship with.",
    "A `<button>` inside a `<form>` submits by default. Every button that isn't the submit button needs `type=\"button\"`.",
    "The accessible name is what voice-control users say out loud. If the button shows \"Send\" but `aria-label` says \"Submit message\", \"click Send\" fails.",
    "An unchecked checkbox sends nothing. Your server must treat a missing key as false, or unticking can never be saved.",
    "Turn on VoiceOver (Cmd+F5) or install NVDA, which is free, and use your own site for five minutes. It will change how you write markup.",
    "`:user-invalid` exists now. Styling `:invalid` paints a fresh form red before anyone has typed.",
    "The WebAIM Million survey keeps finding that pages using ARIA average more detected errors, not fewer. Bad ARIA lies with authority.",
    "Most accessibility wins are deletions: remove the div, the positive tabindex, the redundant `aria-label`, the `outline: none`.",
  ],
  glossary: [
    ["accessibility tree", "The tree of roles, names and states the browser exposes to assistive tech through OS APIs."],
    ["accessible name", "What a control is called: from aria-labelledby, aria-label, label, content, then title or placeholder."],
    ["landmark", "A region like main, nav or banner that screen reader users can jump between."],
    ["browse mode", "NVDA and JAWS reading mode: the reader intercepts keys and sends synthetic clicks on Enter."],
    ["implicit submission", "Enter in a text field submits via the default button, or directly if there is only one field."],
    ["constraint validation", "The browser's built-in validity checks: required, type, pattern, min/max, length, custom errors."],
    ["top layer", "A layer above all z-index stacking, used by modal dialogs, popovers and fullscreen."],
    ["inert", "An attribute that removes a subtree from focus, pointer events and the accessibility tree."],
    ["live region", "An element whose text changes are announced by screen readers, politely or assertively."],
    ["CLS", "Cumulative Layout Shift: how much visible content moves unexpectedly while the page loads."],
  ],
  explain: "Explain to a friend why a clickable div seems to work with a screen reader but fails for keyboard users, and what the accessibility tree has to do with it.",
};
