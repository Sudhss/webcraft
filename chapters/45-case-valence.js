/* Case study: Valence, a C++17 / Qt 6 code editor that paints its own text.
   Every project number below comes from the Valence repo or a command re-run against it. */

const VIEW_CSS = `html, body { margin: 0; height: 100%; background: #15171c; }
canvas { display: block; width: 100%; height: calc(100% - 28px); outline: none; }
#hud { height: 28px; box-sizing: border-box; padding: 6px 10px; font: 12px system-ui, sans-serif; color: #9aa3ad; }`;

const VIEW_JS = String.raw`const canvas = document.querySelector("canvas"), hud = document.querySelector("#hud");
const ctx = canvas.getContext("2d");
const LH = 18, GUT = 44, KW = new Set(["int", "for", "return"]);
const seed = ["int main() {", "  /* a block", "     comment */ int n = 42;", "  for (int i = 0; i < n; i++) {", "    solve(i); // go", "  }", "  return 0;", "}", ""];
const lines = Array.from({ length: 300 }, (_, i) => seed[i % seed.length]);
let state = [], first = 0, row = 4, col = 0, caretOn = true, frame = 0, W = 0, H = 0, cw = 8;
const dirty = new Set();                         // rows whose pixels are stale

function endState(s, c) {                        // comment state at the end of a line
  for (let i = 0; i < s.length; i++) {
    if (c) { if (s[i] === "*" && s[i + 1] === "/") { c = false; i++; } }
    else if (s[i] === "/" && s[i + 1] === "/") break;
    else if (s[i] === "/" && s[i + 1] === "*") { c = true; i++; }
  }
  return c;
}
function rescan(from, delta) {                   // the convergence loop, splicing after "from"
  if (delta > 0) state.splice(from + 1, 0, ...new Array(delta).fill(false));
  if (delta < 0) state.splice(from + 1, -delta);
  let c = state[from];
  for (let i = from; i < lines.length; i++) {
    if (i > from + Math.abs(delta) && state[i] === c) return;
    if (state[i] !== c || i === from) dirty.add(i);
    state[i] = c; c = endState(lines[i], c);
  }
}
const rows = () => Math.ceil(H / LH);
const all = () => { for (let r = first; r < first + rows(); r++) dirty.add(r); };
const isW = (ch) => (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || (ch >= "0" && ch <= "9") || ch === "_";

function paintRow(r) {                           // immediate mode: clear the strip, redraw it
  const y = (r - first) * LH, base = y + 13;
  ctx.fillStyle = "#15171c"; ctx.fillRect(0, y, W, LH);
  ctx.fillStyle = "hsl(" + (frame * 47) % 360 + " 70% 55%)"; ctx.fillRect(0, y, 3, LH);  // repaint marker
  if (r >= lines.length) return;
  ctx.fillStyle = "#5c6370"; ctx.fillText(String(r + 1).padStart(4), 6, base);
  const s = lines[r]; let c = state[r], i = 0;
  while (i < s.length) {
    const st = i; let colour = "#d7dae0";
    if (c || s.startsWith("/*", i)) {
      const e = s.indexOf("*/", c ? i : i + 2); i = e < 0 ? s.length : e + 2; c = e < 0; colour = "#6a9955";
    } else if (s.startsWith("//", i)) { i = s.length; colour = "#6a9955"; }
    else if (isW(s[i])) { while (i < s.length && isW(s[i])) i++; if (KW.has(s.slice(st, i))) colour = "#c678dd"; }
    else i++;
    ctx.fillStyle = colour; ctx.fillText(s.slice(st, i), GUT + st * cw, base);
  }
  if (r === row && caretOn) { ctx.fillStyle = "#4fd1c5"; ctx.fillRect(GUT + col * cw, y + 1, 2, LH - 2); }
}
function draw() {
  frame++;
  const todo = [...dirty].filter((r) => r >= first && r < first + rows());
  todo.forEach(paintRow); dirty.clear();
  if (todo.length) hud.textContent = "rows repainted last frame: " + todo.length + " of " + rows();
  requestAnimationFrame(draw);
}
function fit() {
  const dpr = Math.min(devicePixelRatio, 2);
  W = canvas.clientWidth; H = canvas.clientHeight;
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.font = "13px ui-monospace, Menlo, Consolas, monospace";
  cw = ctx.measureText("M").width; all();
}
canvas.addEventListener("keydown", (e) => {
  const s = lines[row], before = row; let delta = 0;
  if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) { lines[row] = s.slice(0, col) + e.key + s.slice(col); col++; }
  else if (e.key === "Backspace" && col > 0) { lines[row] = s.slice(0, col - 1) + s.slice(col); col--; }
  else if (e.key === "Backspace" && row > 0) { col = lines[row - 1].length; lines[row - 1] += s; lines.splice(row, 1); row--; delta = -1; }
  else if (e.key === "Enter") { lines.splice(row + 1, 0, s.slice(col)); lines[row] = s.slice(0, col); row++; col = 0; delta = 1; }
  else if (e.key.startsWith("Arrow")) {
    row = Math.max(0, Math.min(lines.length - 1, row + (e.key === "ArrowDown") - (e.key === "ArrowUp")));
    col = Math.max(0, Math.min(lines[row].length, col + (e.key === "ArrowRight") - (e.key === "ArrowLeft")));
    dirty.add(before); dirty.add(row); e.preventDefault(); return;
  } else return;
  e.preventDefault(); caretOn = true;
  const from = Math.min(before, row);
  rescan(from, delta);
  if (delta) for (let r = from; r < first + rows(); r++) dirty.add(r);   // rows below moved
});
canvas.addEventListener("wheel", (e) => {
  e.preventDefault(); first = Math.max(0, Math.min(lines.length - 1, first + Math.sign(e.deltaY) * 3)); all();
}, { passive: false });
setInterval(() => { caretOn = !caretOn; dirty.add(row); }, 500);   // a blink repaints one row
{ let c = false; lines.forEach((s, i) => { state[i] = c; c = endState(s, c); }); }
new ResizeObserver(fit).observe(canvas); fit(); canvas.focus(); requestAnimationFrame(draw);`;

export default {
  id: "case-valence",
  n: 45,
  part: "H",
  title: "Case study: Valence",
  hook: "A code editor that paints every glyph itself. Its tricks, from dirty rows to converging state, port straight to the web.",
  minutes: 85,
  levels: ["use", "understand", "rebuild"],
  sections: [
    {
      title: "The editor in one picture",
      beats: [
        { t: "say", x: "Valence is your C++17 and Qt 6 code editor. The code surface is a bare `QWidget` that draws every glyph with `QPainter`: no `QTextEdit`, no layout engine. It is the browser problem with the browser removed, which makes it a good teacher." },
        {
          t: "table",
          head: ["Piece", "Where", "Job", "Web cousin"],
          rows: [
            ["TextBuffer", "src/core/text_buffer.cpp", "`std::vector<std::string>`, one string per line", "CodeMirror's line tree, VS Code's piece tree"],
            ["CppHighlighter", "src/editor/cpp_highlighter.cpp", "Single-pass tokenizer, one line at a time, no regex", "A Lezer tokenizer, a TextMate grammar"],
            ["paintEvent", "src/editor/editor_widget.cpp", "Paints only the rows inside the invalidated rectangle", "Canvas 2D plus dirty rects"],
            ["rebuildCommentState", "src/editor/editor_widget.cpp", "One cached bool per line, rescanned until it converges", "Incremental parsing"],
            ["Judge", "src/cph/judge.cpp", "g++ -O2, run each case, AC / WA / TLE / RE / CE", "A test runner with timeouts"],
            ["Valence-Website", "js/core/*.js", "JS ports held byte-identical to the C++ by golden tests", "Cross-implementation testing"],
          ],
          caption: "The terminal and the judge's error banner do use Qt's `QPlainTextEdit`. The editor surface does not.",
        },
        { t: "say", h: "Name n before you optimise", x: "n is lines in the file; Valence's benchmarks go to 50,000. V is rows on screen; the keystroke benchmark re-tokenizes 50. The whole design is one rule: per keystroke, pay O(V) plus the size of the edit, never O(n)." },
        {
          t: "quiz",
          q: "A 50,000-line file, 50 rows visible. Which keystroke work can be forced to touch lines far outside the edit and the viewport?",
          options: ["Colouring the visible rows", "Recomputing which lines start inside a block comment", "Inserting the character into the line", "Drawing the caret"],
          answer: 1,
          why: "Typing `/*` near the top changes the start state of every later line until something closes it. Colours are per visible row, the insert is one string, the caret is one rectangle. Only cross-line state can spread.",
        },
      ],
    },
    {
      title: "Painting text yourself",
      beats: [
        { t: "say", x: "Qt calls `paintEvent` with the rectangle somebody invalidated. It is immediate mode, exactly as in Canvas 2D: you get a pen and a clip, and you redraw from your own data. Nothing remembers what was there." },
        {
          t: "code",
          lang: "cpp",
          file: "src/editor/editor_widget.cpp (trimmed)",
          src: `void EditorWidget::paintEvent(QPaintEvent* event) {
    QPainter p(this);
    p.setFont(font_);

    // Only touch what was invalidated. A caret blink then costs one small
    // rectangle instead of the entire viewport.
    const QRect clip = event->rect();
    p.fillRect(clip, Theme::EditorBg);

    int startRow = std::max(0, (scrollY_ + clip.top()) / charHeight_);
    int endRow = std::min((scrollY_ + clip.bottom()) / charHeight_ + 1, buffer_.lineCount());

    paintCode(p, startRow, endRow);
    paintCursor(p);
    paintGutter(p, startRow, endRow);
}`,
          mark: [7, 10, 11],
          note: "Rect to rows is one division: the cull from Drawing a million things, and the maths of a virtualised list. Everything below works on [startRow, endRow), never the file.",
        },
        {
          t: "predict",
          lang: "cpp",
          src: `// Valence before V3. A QTimer calls this every 500 ms, forever.
void EditorWidget::toggleCursorBlink() {
    cursorVisible_ = !cursorVisible_;
    // Only repaint the cursor region for performance
    update();
}`,
          q: "What did each blink cost?",
          options: ["One caret-sized rectangle, as the comment says", "Re-tokenizing and redrawing every visible line, twice a second, even while idle", "Nothing: Qt caches the last frame", "One full-file re-tokenize"],
          answer: 1,
          why: "The comment promised the cursor region; `update()` with no argument invalidates the whole widget. V3 calls `update(cursorRect())` and paintEvent honours the clip, so a blink now repaints the caret alone. Trust the call, not the comment.",
        },
        {
          t: "compare",
          a: {
            label: "Before V3: one draw call per character",
            lang: "cpp",
            src: `for (int i = 0; i < tok.length; i++) {
    int x = gutterWidth_ + (tok.start + i) * charWidth_;
    QString ch = QString::fromStdString(lineStr.substr(tok.start + i, 1));
    p.drawText(x, y + ascent_, ch);
}`,
          },
          b: {
            label: "V3: build the line once, one call per token",
            lang: "cpp",
            src: `const QString lineText = QString::fromLatin1(lineStr.data(), (int)lineStr.size());
// ...
if (monospaceExact_) {
    p.drawText(xFromCol(tok.start), y + ascent_,
               lineText.mid(tok.start, tok.length));
}`,
          },
          x: "The old loop made a `std::string` and a `QString` per character per frame; the comment in paintCode estimates about 14,000 allocations per full repaint. Canvas has the same trap: `fillText` per glyph instead of per run.",
        },
        {
          t: "pitfall",
          h: "Batch glyphs only if the grid is real",
          x: "Drawing a whole token assumes every glyph is exactly one column wide. Valence checks at startup that `MMMMMMMMMM` and `iiiiiiiiii` both measure 10 columns; if a fallback font sneaks in, it keeps the per-glyph path so the caret never drifts off the text. In canvas, `measureText` the same way.",
        },
        {
          t: "table",
          head: ["", "Qt widget (Valence)", "Canvas 2D", "DOM (CodeMirror)"],
          rows: [
            ["Who tracks what changed", "You call `update(rect)`", "You keep dirty rects", "The browser invalidates for you"],
            ["Cost of offscreen text", "Zero if you clip rows", "Zero if you clip rows", "Nodes exist unless virtualised"],
            ["Selection, IME, screen readers", "Yours to build", "Yours to build", "Mostly free"],
            ["Glyph positioning", "Your grid maths", "Your grid maths", "Layout engine"],
          ],
          caption: "CodeMirror's guide: it renders only the visible part of the document plus a margin. Even the DOM editor virtualises.",
        },
        {
          t: "quiz",
          q: "You build a browser code editor on a canvas for speed. What do you lose that a DOM editor gets for free?",
          options: ["Nothing important", "Native selection, IME input, find-in-page and screen-reader access", "Syntax highlighting", "Monospace fonts"],
          answer: 1,
          why: "Canvas pixels carry no text semantics. Editors that draw text themselves end up shadowing it with hidden DOM or textareas for input and accessibility. Fast painting is the easy half; The rendering pipeline shows what the DOM was doing for you.",
        },
      ],
    },
    {
      title: "A tokenizer with no regex",
      beats: [
        { t: "say", x: "`tokenize(line, inBlockComment)` walks one index forward through the line. Every branch consumes at least one character and none ever looks back, so a line costs O(length) with no backtracking." },
        {
          t: "code",
          lang: "cpp",
          file: "src/editor/cpp_highlighter.cpp (number branch, trimmed)",
          src: `if (std::isdigit((unsigned char)c) ||
    (c == '.' && i + 1 < len && std::isdigit((unsigned char)line[i + 1]))) {
    int start = i;
    auto isSeparator = [&](int at) {
        // 1'000'000'007 is ordinary competitive-programming code. Without
        // this the apostrophe opened a character literal and painted the
        // rest of the line as a string.
        return line[at] == '\\'' && at + 1 < len &&
               std::isalnum((unsigned char)line[at + 1]);
    };
    while (i < len && (std::isdigit((unsigned char)line[i]) ||
                       line[i] == '.' || isSeparator(i))) i++;
    // ... exponent, then suffixes f, L, u ...
    tokens.push_back({TokenType::Number, start, i - start});
    continue;
}`,
          mark: [8, 9],
          note: "The separator rule came from a real bug: `MOD = 1'000'000'007;` turned the rest of the line string-coloured. 30 edge cases like it now sit in the golden data.",
        },
        {
          t: "play",
          mode: "js",
          title: "a single-pass tokenizer",
          js: String.raw`// One index, one pass, left to right. Each branch consumes at least one char.
const KEYWORDS = new Set(["const", "for", "if", "return", "while", "auto"]);
const TYPES = new Set(["int", "long", "char", "string", "vector"]);
const isSpace = (c) => c === " " || c === "\t";
const isDigit = (c) => c >= "0" && c <= "9";
const isIdStart = (c) => (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_";
const isIdChar = (c) => isIdStart(c) || isDigit(c);

function tokenize(line, st) {               // st.inComment crosses lines
  const out = [], n = line.length;
  let i = 0;
  const closeComment = () => {
    const end = line.indexOf("*/", i);
    i = end < 0 ? n : end + 2;
    st.inComment = end < 0;
  };
  while (i < n) {
    const s = i, c = line[i], d = line[i + 1];
    let type;
    if (st.inComment) { closeComment(); type = "comment"; }
    else if (isSpace(c)) { while (i < n && isSpace(line[i])) i++; type = "space"; }
    else if (c === "/" && d === "/") { i = n; type = "comment"; }
    else if (c === "/" && d === "*") { i += 2; closeComment(); type = "comment"; }
    else if (c === '"' || c === "'") {
      i++;
      while (i < n && line[i] !== c) i += line[i] === "\\" ? 2 : 1;
      i = Math.min(i + 1, n); type = "string";
    } else if (isDigit(c)) {
      // 1'000'000'007: an apostrophe followed by a digit is a separator, not a char literal
      while (i < n && (isDigit(line[i]) || line[i] === "." || (line[i] === "'" && isDigit(line[i + 1])))) i++;
      type = "number";
    } else if (isIdStart(c)) {
      while (i < n && isIdChar(line[i])) i++;
      const w = line.slice(s, i);
      let p = i; while (isSpace(line[p])) p++;
      type = KEYWORDS.has(w) ? "keyword" : TYPES.has(w) ? "type" : line[p] === "(" ? "function" : "plain";
    } else {                                // a run of punctuation is one token
      while (i < n && !isSpace(line[i]) && !isIdChar(line[i]) && line[i] !== '"' && line[i] !== "'"
             && !(line[i] === "/" && (line[i + 1] === "/" || line[i + 1] === "*"))) i++;
      if (i === s) i++;                     // always make progress
      type = "punct";
    }
    out.push([type, line.slice(s, i)]);
  }
  return out;
}

const src = [
  "const long long MOD = 1'000'000'007; // prime",
  "for (int i = 0; i < n; i++) solve(i);",
  's = "a \\" b"; char q = \'x\'; /* opens',
  "still inside */ x = f(a)/b;",
  "}));",
];
const st = { inComment: false };
for (const line of src) {
  const toks = tokenize(line, st);
  const tiles = toks.map((t) => t[1]).join("") === line;   // tokens must cover the line exactly
  console.log(toks.filter((t) => t[0] !== "space").map((t) => t[0] + ":" + t[1]).join("  "));
  console.log("   tiles:", tiles, " inComment after:", st.inComment);
}`,
          task: "Delete the separator test and rerun: line 1 goes string-coloured. Then add `#include <vector>` to src and give it a preprocessor branch that takes the rest of the line.",
        },
        {
          t: "predict",
          lang: "cpp",
          src: `tokenize("}));", inBlockComment)`,
          q: "How many tokens does Valence's tokenizer return?",
          options: ["1", "2", "4", "0, punctuation is skipped"],
          answer: 0,
          why: "Punctuation is emitted as a run, so `}));` is one token and one `drawText` call, not four. The run stops before `//` or `/*`, so a comment glued to a bracket still gets its own colour.",
        },
        { t: "say", h: "Why no regex, honestly", x: "The repo has no regex baseline, so 'regex-free is faster' is unmeasured there. What hand-rolling measurably buys is control: one index, explicit character classes, and code you can port line for line to another language." },
        {
          t: "pitfall",
          h: "Keep the guard that never fires",
          x: "Valence's punctuation branch ends with `if (i == start) i++;`. Today an earlier branch handles every character that stops the run, so it never fires. It is there for the day someone adds a stop character without a branch: then one byte loops forever on file open.",
        },
        {
          t: "quiz",
          q: "Valence's only cross-line state is one bool: inside a block comment or not. Which C++ construct does that model miss?",
          options: ["`a /* b */ c` on one line", "A raw string `R\"(...)\"` spanning several lines", "`1'000'000'007`", "`\"a \\\" b\"`"],
          answer: 1,
          why: "A multi-line raw string is a second kind of cross-line state, and its closer depends on its delimiter. A bool can't hold that. The mission at the end makes the state a value instead.",
        },
      ],
    },
    {
      title: "Incremental highlighting",
      beats: [
        { t: "say", x: "Colours are never cached. Each paint re-tokenizes just the visible rows. What is cached is one bool per line: does this line start inside `/* */`? That is the only fact a line needs from the lines above it." },
        {
          t: "code",
          lang: "cpp",
          file: "src/editor/editor_widget.cpp (V3)",
          src: `void EditorWidget::rebuildCommentState(int fromRow) {
    const int lines = buffer_.lineCount();
    const int oldSize = static_cast<int>(blockCommentState_.size());
    const int delta = lines - oldSize;
    fromRow = std::clamp(fromRow, 0, lines - 1);

    // Keep the cache index-aligned when the edit added or removed lines.
    if (delta > 0) {
        blockCommentState_.insert(blockCommentState_.begin() + std::min(fromRow, oldSize),
                                  delta, false);
    } else if (delta < 0) {
        const int at = std::min(fromRow, lines);
        blockCommentState_.erase(blockCommentState_.begin() + at,
                                 blockCommentState_.begin() + at - delta);
    }

    bool inComment = blockCommentState_[fromRow];
    const int settled = fromRow + std::abs(delta);   // shifted entries aren't trustworthy yet
    for (int i = fromRow; i < lines; i++) {
        // Once the recomputed state matches the cached one, every later line is
        // provably unchanged and the scan can stop.
        if (i > settled && blockCommentState_[i] == inComment) return;
        blockCommentState_[i] = inComment;
        highlighter_.tokenize(buffer_.line(i), inComment);
    }
}`,
          mark: [9, 17, 22],
          note: "Line 22 is the whole trick. Line 9 hides a bug; hold that thought.",
        },
        {
          t: "viz",
          name: "frames",
          props: {
            cols: ["Lines", "Cached start state", "Scan"],
            frames: [
              { cells: [["1 int a;", "2 int b;", "3 x", "4 y */ int c;", "5 int d;", "6 int e;"], ["1 out", "2 out", "3 out", "4 out", "5 out", "6 out"], []], note: "No comment is open anywhere, so every line starts outside one. That column is the whole cache." },
              { cells: [["1 int a;", "2 int b; /*", "3 x", "4 y */ int c;", "5 int d;", "6 int e;"], ["1 out", "2 out", "3 out", "4 out", "5 out", "6 out"], ["row 2 starts out", "row 2 ends in"]], note: "You type /* on line 2. An edit on line 2 can't change how line 2 starts, so the scan begins from its cached state." },
              { cells: [["1 int a;", "2 int b; /*", "3 x", "4 y */ int c;", "5 int d;", "6 int e;"], ["1 out", "2 out", "3 in", "4 out", "5 out", "6 out"], ["row 2 ends in", "row 3: cache said out, now in", "row 3 ends in"]], note: "Line 3's start state differs from the cache, so it is written and the scan goes on." },
              { cells: [["1 int a;", "2 int b; /*", "3 x", "4 y */ int c;", "5 int d;", "6 int e;"], ["1 out", "2 out", "3 in", "4 in", "5 out", "6 out"], ["row 3 ends in", "row 4: cache said out, now in", "row 4 ends out"]], note: "Line 4 closes the comment, so it ends outside." },
              { cells: [["1 int a;", "2 int b; /*", "3 x", "4 y */ int c;", "5 int d;", "6 int e;"], ["1 out", "2 out", "3 in", "4 in", "5 out", "6 out"], ["row 5: cache says out, recomputed out", "equal: stop"]], note: "Converged. Line 5 starts exactly as before, so nothing after it can differ. 3 lines tokenized. In a 50,000-line file it stops at the same place." },
            ],
          },
        },
        {
          t: "predict",
          lang: "cpp",
          src: `// 1,000 lines, no block comments anywhere.
// You press Enter in the middle of line 500:
//   splitLine -> lineCount grows by 1 (delta = 1)
//   rebuildCommentState(500)`,
          q: "How many lines does the loop tokenize?",
          options: ["1", "2", "501", "1,000"],
          answer: 1,
          why: "`settled` is 500 + 1, so rows 500 and 501 are scanned unconditionally (the new line has no trustworthy cache yet). Row 502 matches its cached state and the loop returns. Cost tracks the edit, not the file.",
        },
        {
          t: "play",
          mode: "js",
          title: "converging state over a line array",
          js: String.raw`// The only state that crosses a line break here: "am I inside /* */ ?"
let scanned = 0;
function endState(line, inC) {              // scan one line, return the state at its end
  scanned++;
  for (let i = 0; i < line.length; i++) {
    if (inC) { if (line[i] === "*" && line[i + 1] === "/") { inC = false; i++; } }
    else if (line[i] === "/" && line[i + 1] === "/") break;
    else if (line[i] === "/" && line[i + 1] === "*") { inC = true; i++; }
  }
  return inC;
}

const lines = [], state = [];               // state[i]: inside a comment at the START of line i
function full() {
  state.length = lines.length;
  let c = false;
  for (let i = 0; i < lines.length; i++) { state[i] = c; c = endState(lines[i], c); }
}

// Replace "removed" lines at "row" with "added". Rows above "row" are untouched,
// so state[row] is still right; new or dropped entries sit AFTER it.
function edit(row, removed, added) {
  lines.splice(row, removed, ...added);
  const delta = added.length - removed;
  if (delta > 0) state.splice(row + 1, 0, ...new Array(delta).fill(false));
  if (delta < 0) state.splice(row + 1, -delta);
  let c = state[row];
  const settled = row + Math.abs(delta);    // shifted entries can't end the scan
  for (let i = row; i < lines.length; i++) {
    if (i > settled && state[i] === c) return;   // converged: the rest is provably unchanged
    state[i] = c;
    c = endState(lines[i], c);
  }
}

function check(label) {                     // differential test: incremental vs from scratch
  const inc = state.slice(); const n = scanned;
  full(); scanned = n;
  const same = inc.every((v, i) => v === state[i]) && inc.length === state.length;
  console.log(label.padEnd(34), "lines scanned:", String(scanned).padStart(6), same ? "" : "  MISMATCH");
  scanned = 0;
}

for (let i = 0; i < 50000; i++) lines.push(i % 10 === 7 ? "/* note */ int x" + i + ";" : "int v" + i + " = " + i + ";");
let t = performance.now(); full();
console.log("full rescan of", lines.length, "lines:", (performance.now() - t).toFixed(2), "ms"); scanned = 0;

t = performance.now();
edit(25000, 1, ["int v25000 = 42;"]);
console.log("incremental edit:", ((performance.now() - t) * 1000).toFixed(0), "us");
check("type in the middle");
edit(100, 1, ["/* opened, never closed"]);  check("open /* near the top");
edit(100, 1, ["/* opened */"]);             check("close it again");
edit(30000, 1, ["/* a", "b c", "d */"]);   check("paste a 3-line comment");
edit(30001, 1, ["b", " c"]);                check("Enter inside that comment");
edit(30001, 2, ["b c"]);                    check("Backspace joins the lines");`,
          task: "Why does opening `/*` scan only 8 lines? Remove the `/* note */` lines from the generator and see the worst case. Then change both `row + 1` splices to `row` and watch check() object.",
        },
        {
          t: "pitfall",
          h: "Splice the cache after the edited row",
          x: "Valence V3 inserts and erases cache entries at `fromRow`, which throws away the one state an edit on that row can't change. Run verbatim against a full rebuild: Enter inside a block comment left 3 lines of a 5-line test coloured as code. Its benchmark never changes line count inside a comment.",
        },
        { t: "say", h: "The general shape", x: "Cache the state each unit hands to the next. On an edit, recompute from the edit and stop when the outgoing state equals the cached one. Lezer, CodeMirror's parser, does the grown-up version: it re-parses an edited document by reusing nodes from the old parse." },
        {
          t: "quiz",
          q: "Your Markdown preview re-renders the whole document on each keystroke. What per-line state makes it incremental the way Valence's highlighter is?",
          options: ["The line's word count", "Whether the line starts inside a fenced code block", "The line's length", "The caret position"],
          answer: 1,
          why: "A fence changes how every later line is read, exactly like `/*`. Cache it at each line start, rescan from the edit, stop on a match. The other three never cross a line boundary.",
        },
      ],
    },
    {
      title: "The buffer: a vector of lines",
      beats: [
        {
          t: "code",
          lang: "cpp",
          file: "src/core/text_buffer.cpp",
          src: `// text_buffer.h:  std::vector<std::string> lines_;

void TextBuffer::splitLine(int row, int col) {
    if (row < 0 || row >= (int)lines_.size()) return;
    col = std::clamp(col, 0, (int)lines_[row].size());
    std::string tail = lines_[row].substr(col);
    lines_[row] = lines_[row].substr(0, col);
    lines_.insert(lines_.begin() + row + 1, tail);   // shifts every line below
}`,
          mark: [8],
          note: "Line lookup is an array index, which is what paint wants 50 times a frame. The price: an Enter in the middle shifts half the vector.",
        },
        {
          t: "predict",
          lang: "cpp",
          src: `// 50,000 lines, ~38 chars each. Enter at line 25,000:
lines_.insert(lines_.begin() + 25001, tail);`,
          q: "What does the insert actually move?",
          options: ["Every character below the split, about 950 KB of text", "About 25,000 `std::string` objects, by move; the heap text stays put", "Nothing, vector insert is O(1)", "Only the new line"],
          answer: 1,
          why: "The vector holds string objects; a 38-char string keeps its text on the heap, so a move copies a small header. Recorded: 27,005 ns at 50,000 lines (split and merge, averaged). The O(n) you chose, and it is small.",
        },
        {
          t: "table",
          head: ["Editor", "Text structure", "Line lookup", "Edit in the middle"],
          rows: [
            ["Valence", "`vector<string>`, one per line", "O(1) index", "O(n) shift of line objects"],
            ["CodeMirror 6", "Lines in a tree (its guide's words)", "O(log n)", "Cheap anywhere"],
            ["VS Code before 2018", "Array of lines", "O(1)", "O(n)"],
            ["VS Code now (Monaco)", "Piece tree: red-black tree over a piece table", "O(log n)", "O(log n)"],
          ],
          caption: "Sources: codemirror.net/docs/guide and the VS Code blog, Text Buffer Reimplementation (2018).",
        },
        { t: "say", x: "VS Code's blog gives the reason it left the line array: memory. Line objects cost about 20 times the file size, and a 35 MB file with 13.7 million lines needed around 600 MB. The piece tree sits near the file size, at an O(log n) line lookup." },
        {
          t: "quiz",
          q: "When is Valence's `vector<string>` clearly the wrong buffer?",
          options: ["A 2,000-line contest solution", "A 35 MB log with 13.7 million lines", "A file with long lines", "Any file over 1,000 lines"],
          answer: 1,
          why: "At millions of lines the per-line object overhead and the O(n) shifts both bite. For source files, Valence's own runs keep a mid-file split in tens of microseconds at 50,000 lines. Pick the structure for your n.",
        },
        {
          t: "pitfall",
          h: "A save that can't fail is lying",
          x: "Valence's `saveToFile` once returned true whenever the file opened, so a full disk reported success. It now checks the stream after flush and close. It also terminates every line, because saving unchanged used to strip the trailing newline. On the web: check `res.ok` and await the write.",
        },
      ],
    },
    {
      title: "Measuring honestly",
      beats: [
        {
          t: "table",
          head: ["What", "Recorded in the repo", "Re-run, 2026-10-05"],
          rows: [
            ["Re-tokenize all 50,000 lines (pre-V3, every keystroke)", "30.32 ms", "28.59 ms"],
            ["V3 keystroke at 50,000 lines, typical", "18.7 µs (median of 3 runs)", "19.6 to 21.9 µs over 3 runs"],
            ["V3 keystroke, worst: `/*` on line 1, never closed", "3,569.3 µs", "2,562 to 2,973 µs"],
            ["Tokenizer, 10,000-line document", "2,032,066 lines/s", "2,122,421 lines/s"],
            ["`splitLine` at the middle of 50,000 lines", "27,005 ns", "21,674 ns"],
          ],
          caption: "Recorded: Valence-Website/data/benchmark-2026-09-26.txt and keystroke-v3-2026-09-26.json. Re-run: same sources, g++ 13.1.0 -O2, in a scratch copy. Timing in the browser: Performance and robustness.",
        },
        { t: "say", x: "30.32 ms over 18.7 µs is about 1,600x. Before quoting it, read both harnesses. The before side times only the full rescan. The after side times the insert, the undo record, the incremental scan and re-tokenizing 50 visible rows." },
        {
          t: "predict",
          lang: "text",
          src: `V3 typical keystroke (recorded medians)
lines:    100    1,000   10,000   50,000
time:   20.1 µs  19.3 µs  31.3 µs  18.7 µs`,
          q: "Why doesn't the typical cost grow with the file?",
          options: ["The timer is too coarse", "It is mostly the 50 visible rows: at roughly 500 ns a line that is about 25 µs, while the incremental scan touches one line", "The compiler deleted the work", "Bigger files are cached better"],
          answer: 1,
          why: "The full-document benchmark runs about 500 to 600 ns a line, so 50 rows is ~25 to 30 µs, and the convergence loop stops after one line on ordinary code. That flat line is the design working: O(V), not O(n).",
        },
        {
          t: "pitfall",
          h: "Two columns, one measurement",
          x: "benchmark.cpp times split and merge as a pair, halves the total, and prints that same number under both `splitLine` and `mergeLines`. Read the harness before you quote a column. The table shows what the code printed, not what the header says it measured.",
        },
        {
          t: "pitfall",
          h: "Numbers rot; date them and regenerate",
          x: "An older write-up in Valence's docs/ still quotes a lower tokenizer throughput and calls the tokenizer allocation-free, yet `tokenize` returns a fresh `std::vector` per call, and V3 since rewrote identifier lookup. Keep the raw output, date it, and regenerate claims instead of copying them.",
        },
        {
          t: "quiz",
          q: "Your landing page says \"1,600x faster highlighting\". Which addition makes it defensible?",
          options: ["A bigger font", "The worst case next to it (3.57 ms when `/*` opens at the top), what each side measures, compiler, date and the raw data file", "Rounding up to 2,000x", "Removing the before number"],
          answer: 1,
          why: "The typical case is the headline; the worst case is the truth a sceptic checks. Valence's site shows both against a 16.6 ms frame, with the harness and the JSON in the repo. That is the bar from Testing and honesty.",
        },
      ],
    },
    {
      title: "Two implementations, one truth",
      beats: [
        { t: "say", x: "The Valence website runs JavaScript ports of the tokenizer, the undo manager and the judge's comparison rule. Two implementations of one spec drift apart quietly, so the site's tests hold the ports to the real C++ output, byte for byte." },
        {
          t: "steps",
          h: "How the golden data is made",
          items: [
            "`tools/golden/make_golden.py` compiles small harnesses against Valence's real `cpp_highlighter.cpp`, `undo_manager.cpp` and `judge.cpp`.",
            "It runs the tokenizer harness on every line of `src/` (31 files, 6,586 lines) plus 30 hand-written edge cases.",
            "Each line's tokens and end-of-line comment state go to `tests/golden/lexer.json`: 6,616 lines in all.",
            "`npm test` runs the JS port on the same inputs and requires deep equality, line by line.",
            "CI runs `npm test` on every push. It does not rebuild the C++, which needs Qt and MinGW.",
          ],
        },
        {
          t: "code",
          lang: "js",
          file: "Valence-Website/tests/ports.test.mjs",
          src: `test("tokenizer matches cpp_highlighter.cpp on every golden line", () => {
  let lines = 0;
  for (const doc of golden("lexer")) {
    const state = { inBlockComment: false };
    doc.lines.forEach((line, i) => {
      const got = tokenize(line, state).map((t) => [t.type, t.start, t.length]);
      assert.deepEqual(got, doc.out[i].t, \`\${doc.name}:\${i + 1}: \${line}\`);
      assert.equal(state.inBlockComment, doc.out[i].b, \`\${doc.name}:\${i + 1} block state\`);
      lines += 1;
    });
  }
  assert.ok(lines > 6500, \`only \${lines} golden lines\`);
});`,
          mark: [7, 8, 12],
          note: "Run in a copy today: 5 tests, 5 pass. The last assert guards against the quietest failure, an empty golden file that makes every check pass.",
        },
        {
          t: "pitfall",
          h: "isspace is not \\s",
          x: "C's `isspace` in the C locale means space, tab and \\n \\v \\f \\r. JavaScript's `\\s` also matches U+00A0 and other Unicode spaces. The port spells out ASCII codes 9 to 13 and 32 for exactly that reason. Porting means copying the character classes, not the intent.",
        },
        {
          t: "play",
          mode: "js",
          title: "a golden test in miniature",
          js: String.raw`// The reference: a hand-written single-pass tokenizer (plays the C++ role).
const sp = (c) => c === " " || c === "\t", dg = (c) => c >= "0" && c <= "9";
const id = (c) => (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_" || dg(c);
function reference(line) {
  const out = []; let i = 0;
  while (i < line.length) {
    const s = i, c = line[i], d = line[i + 1]; let t;
    if (sp(c)) { while (sp(line[i])) i++; t = "ws"; }
    else if (c === "/" && d === "/") { i = line.length; t = "com"; }
    else if (c === "/" && d === "*") { const e = line.indexOf("*/", i + 2); i = e < 0 ? line.length : e + 2; t = "com"; }
    else if (c === '"') { i++; while (i < line.length && line[i] !== '"') i += line[i] === "\\" ? 2 : 1; i = Math.min(i + 1, line.length); t = "str"; }
    else if (dg(c)) { while (dg(line[i]) || line[i] === "." || (line[i] === "'" && dg(line[i + 1]))) i++; t = "num"; }
    else if (id(c)) { while (id(line[i])) i++; t = "id"; }
    else { while (i < line.length && !sp(line[i]) && !id(line[i]) && line[i] !== '"' && !(line[i] === "/" && (line[i + 1] === "/" || line[i + 1] === "*"))) i++; if (i === s) i++; t = "op"; }
    out.push(t + ":" + line.slice(s, i));
  }
  return out;
}

// The port: same job, written with one sticky regex. Looks equivalent. Is it?
const RE = /\s+|\/\/.*|\/\*.*?(?:\*\/|$)|"(?:\\.|[^"])*"?|\d[\d.']*|\w+|[^\s\w"]+|./y;
function port(line) {
  const out = []; RE.lastIndex = 0; let m;
  while (RE.lastIndex < line.length && (m = RE.exec(line))) {
    const x = m[0], c = x[0];
    const t = /\s/.test(c) ? "ws" : x.startsWith("//") || x.startsWith("/*") ? "com"
      : c === '"' ? "str" : /\d/.test(c) ? "num" : /\w/.test(c) ? "id" : "op";
    out.push(t + ":" + x);
  }
  return out;
}

// The golden corpus: record the reference once, then hold the port to it byte for byte.
const corpus = [
  "int x = 42;", "const long long MOD = 1'000'000'007;", "s = \"a \\\" b\";",
  "y = a /* inline */ + b;", "z = (a)/b;", "f(x)/*y*/;", "v = 1'",
  "int y = 3;", "for (int i = 0; i < n; i++) {}",
];
const golden = corpus.map((l) => JSON.stringify(reference(l)));
let pass = 0;
corpus.forEach((line, k) => {
  const got = JSON.stringify(port(line));
  if (got === golden[k]) return pass++;
  console.log("DIFF line " + (k + 1) + ": " + JSON.stringify(line));
  console.log("  golden: " + golden[k]);
  console.log("  port:   " + got);
});
console.log(pass + "/" + corpus.length + " lines identical");`,
          task: "Three lines differ (line 8 hides a no-break space). Fix only the regex port until it prints 9/9. Each fix is a rule the hand-written version states and the regex only implied.",
        },
        {
          t: "quiz",
          q: "You change the C++ tokenizer and push. The website's CI stays green. What does green prove?",
          options: ["The ports match the new C++", "The ports match the golden JSON, which still records the old C++ until someone reruns make_golden.py", "Nothing at all", "The C++ compiles"],
          answer: 1,
          why: "Golden files are a snapshot of their generator. CI can't rebuild the C++ here, so regenerating the golden data is part of any tokenizer change. Put it in the checklist, or in a pre-push script on the machine that has Qt.",
        },
      ],
    },
    {
      title: "The judge and the release",
      beats: [
        {
          t: "code",
          lang: "cpp",
          file: "src/cph/judge.cpp (per-case result, trimmed)",
          src: `if (status == QProcess::CrashExit) {
    finishCase(Verdict::RuntimeError, exitCode, ...);
} else if (exitCode != 0) {
    // A non-zero exit outranks any output comparison: the run is invalid.
    finishCase(Verdict::RuntimeError, exitCode, ...);
} else if (outputsMatch(out, d->cases.at(d->current).expected)) {
    finishCase(Verdict::Accepted, exitCode, err);
} else {
    finishCase(Verdict::WrongAnswer, exitCode, err);
}
// elsewhere: a single-shot timer at timeLimitMs (3000) kills the process -> TimeLimit`,
          note: "Cases run one at a time on purpose: parallel runs would fight for the CPU and make both the timings and TLE meaningless.",
        },
        {
          t: "predict",
          lang: "cpp",
          src: `int main() {
    long long n; std::cin >> n;
    std::cout << n * (n + 1) / 2 << "\\n";   // correct answer
    return 1;                                  // oops
}`,
          q: "Expected output matches what it prints. What verdict does Valence give?",
          options: ["AC", "WA", "RE", "TLE"],
          answer: 2,
          why: "The exit code is checked before the output. A program that exits non-zero didn't finish cleanly, so its output proves nothing. Online judges agree, and a test runner should too: a crash that printed the right thing is still a crash.",
        },
        {
          t: "pitfall",
          h: "A missing newline becomes a fake TLE",
          x: "Write a child's input and forget to close stdin, and a solution reading to end of input waits forever: the judge calls that TLE, and it's your bug. Valence writes the case, appends a final newline if the user left it off, then calls `closeWriteChannel()`.",
        },
        { t: "say", x: "Comparison ignores trailing spaces, tabs and carriage returns on each line, and trailing blank lines. Everything else is exact, case included. The same rule is ported to the website and held to golden pairs from the C++." },
        {
          t: "pitfall",
          h: "Ship a staged folder, never the build tree",
          x: "Valence V2's installer packed the whole Release build directory, so every user got `CMakeCache.txt`, `CMakeFiles/` and `build.ninja`. V3 stages `Valence.exe` into `dist/`, runs `windeployqt` there, and packages only that. On the web: deploy `dist/`, then look at what actually shipped.",
        },
        {
          t: "steps",
          h: "Valence's release recipe (README)",
          items: [
            "Configure and build with `-DCMAKE_BUILD_TYPE=Release`.",
            "Copy only `Valence.exe` into `dist/Valence-3.0`.",
            "Run `windeployqt --release --no-translations --compiler-runtime` on that folder.",
            "Run the staged exe on a machine without Qt.",
            "`ISCC ValenceV3.iss` builds `Output/Valence_V3_Setup.exe`.",
            "Tag it: the repo has v1.0 (2026-05-01), v2.0 (2026-07-29) and v3.0 (2026-09-13), one Inno Setup script each.",
          ],
        },
      ],
    },
    {
      title: "Build it",
      beats: [
        {
          t: "rebuild",
          h: "A canvas text view that repaints dirty rows",
          x: "Valence's paint loop in 85 lines: a line array, cached comment state with convergence, and a set of dirty rows painted once per frame. The coloured tick in the gutter changes each repaint, so you can see exactly which rows were redrawn.",
          mode: "html",
          title: "dirtyrows.html",
          html: `<canvas tabindex="0"></canvas><div id="hud">click the code, then type</div>`,
          css: VIEW_CSS,
          js: VIEW_JS,
          task: "Type `/*` where the caret starts, line 5: lines 5 to 11 repaint. Why not 12? Then make scrolling cheaper: blit the canvas onto itself with `drawImage`, dirty only the exposed rows.",
        },
        {
          t: "mission",
          h: "Teach the highlighter raw strings",
          x: "Extend the convergence play so `R\"delim( ... )delim\"` can span lines. The per-line state becomes a value: code, inside a block comment, or inside a raw string waiting for its exact closer. Convergence still compares with `===`. Keep the differential check green.",
          hint: "Store the closer itself as the state: \"\" for code, \"*/\" for a comment, \")delim\\\"\" for a raw string. Then one `indexOf(state)` finds the end of whatever you're inside.",
          solution: {
            lang: "js",
            src: String.raw`// "" = code, "*/" = in a block comment, ')q"' = in R"q( ... )q"
const isId = (c) => c !== undefined && ((c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || (c >= "0" && c <= "9") || c === "_");
function endState(line, st) {
  let i = 0;
  while (i < line.length) {
    if (st) {                                     // inside something: find its closer
      const e = line.indexOf(st, i);
      if (e < 0) return st;
      i = e + st.length; st = "";
    } else if (line.startsWith("//", i)) return "";
    else if (line.startsWith("/*", i)) { st = "*/"; i += 2; }
    else if (line.startsWith('R"', i) && !isId(line[i - 1])) {
      const open = line.indexOf("(", i + 2);
      if (open < 0) return "";
      st = ")" + line.slice(i + 2, open) + '"';   // the delimiter decides the closer
      i = open + 1;
    } else if (line[i] === '"' || line[i] === "'") {   // ordinary literal: skip, escapes included
      const q = line[i++];
      while (i < line.length && line[i] !== q) i += line[i] === "\\" ? 2 : 1;
      i++;
    } else i++;
  }
  return st;
}
// edit() is unchanged except fill("") instead of fill(false).
// Test: 'auto sql = R"q(', '  select * /* not a comment */', '  from t)q";'
// gives start states  ""  ')q"'  ')q"'  ""  and the check stays green.`,
          },
        },
        {
          t: "quiz",
          q: "In your rebuild, the caret blinks every 500 ms. What should one blink cost?",
          options: ["A full-canvas clear and redraw", "Repainting the caret's row (or just its rectangle)", "A re-tokenize of the file", "Nothing; canvas keeps the caret"],
          answer: 1,
          why: "Same fix as Valence V3: invalidate the caret's rectangle, not the view. The play marks one row dirty per blink; watch the HUD say 1. Idle cost should round to zero.",
        },
      ],
    },
  ],
  nobodyTells: [
    "An idle editor should cost nothing. Profile it while you are not typing: blinking carets and polling timers that repaint everything show up there first.",
    "Cache the state a line hands to the next, not the output. Colours are cheap to recompute for 50 visible rows; cross-line state is what spreads.",
    "Every incremental algorithm needs a differential test against the from-scratch version on random edits. Valence's splice bug survives a benchmark but not that.",
    "A benchmark's typical number often measures the viewport, not the algorithm. Know which term dominates before you put the ratio on a slide.",
    "When you port code, port the character classes literally. `\\s`, `\\w` and `isspace` disagree on exactly the inputs that break things.",
    "Golden files are snapshots of a generator. If CI can't run the generator, regenerating them belongs in the change, not in someone's memory.",
    "In classic scripts `top`, `name` and `status` are already window globals. `let top` throws a SyntaxError; `var name` silently becomes a string.",
    "Ship from a staged folder and inspect it. Build directories leak caches, absolute paths and secrets into whatever you package.",
  ],
  glossary: [
    ["immediate mode", "You redraw from your own data on every paint; the API keeps nothing. QPainter and Canvas 2D both work this way."],
    ["invalidated rect", "The region marked stale by update(rect) in Qt, or by your own dirty tracking in canvas. Paint only that."],
    ["dirty rows", "The set of text rows whose pixels no longer match the data, painted once at the next frame."],
    ["tokenizer", "Splits a line into typed spans (keyword, string, number) in one left-to-right pass."],
    ["cross-line state", "What a line inherits from the lines above it, such as being inside a block comment."],
    ["convergence", "Stopping an incremental rescan once the recomputed state equals the cached one; later lines can't change."],
    ["incremental parsing", "Re-parsing after an edit by reusing work from the previous parse instead of starting over."],
    ["piece table", "A buffer stored as the original text plus an append-only add buffer, with a list of pieces pointing into both."],
    ["piece tree", "VS Code's buffer: a balanced tree of pieces with cached line breaks, O(log n) line lookup."],
    ["golden test", "Recording a reference implementation's output once and requiring another implementation to match it exactly."],
    ["differential test", "Running two implementations on the same inputs and treating any difference as a bug."],
    ["verdict", "A judge's result for one test: AC, WA, TLE, RE or CE, decided in a fixed order."],
    ["staging folder", "A clean directory holding only what ships, built from the build output before packaging."],
  ],
  explain: "Explain to a friend how Valence keeps highlighting a 50,000-line file cheap on every keystroke: what it caches per line, where the rescan starts and stops, and what the worst case costs.",
};
