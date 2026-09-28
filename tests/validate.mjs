/* Checks every chapter against CONTENT.md. Run: node tests/validate.mjs [files...] */

import { readdirSync } from "node:fs";
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(root, "chapters");
const { chapters } = await import(pathToFileURL(path.join(dir, "index.js")).href);

const MODES = ["html", "js", "react", "three", "glsl", "node"];
const VIZ = ["frames", "boxmodel", "flex", "grid", "specificity", "easing", "damping", "framebudget", "waterfall", "gitgraph", "reconcile", "contrast", "typescale"];
const BANNED = [/in this chapter/i, /let's dive/i, /it's important to note/i, /·/, /!\s/, /!$/, /[\u{1F300}-\u{1FAFF}]/u];

const args = process.argv.slice(2);
const files = args.length ? args.map((a) => path.resolve(a)) : readdirSync(dir).filter((f) => /^\d\d-.*\.js$/.test(f)).map((f) => path.join(dir, f));

let failed = 0;
for (const f of files) {
  const errs = [];
  const warn = [];
  const bad = (m) => errs.push(m);
  let ch;
  try {
    ch = (await import(pathToFileURL(f).href + `?t=${Date.now()}`)).default;
  } catch (e) {
    console.log(`x ${path.basename(f)}: does not import: ${e.message}`);
    failed += 1;
    continue;
  }
  const reg = chapters.find((c) => c.id === ch?.id);
  if (!reg) bad(`id "${ch?.id}" is not in chapters/index.js`);
  else if (path.basename(f) !== `${String(reg.n).padStart(2, "0")}-${reg.id}.js`) bad(`file name should be ${String(reg.n).padStart(2, "0")}-${reg.id}.js`);
  for (const k of ["id", "n", "part", "title", "hook", "minutes", "levels", "sections", "nobodyTells", "glossary", "explain"]) if (ch[k] == null) bad(`missing ${k}`);
  const len = (s, max, where) => {
    if (typeof s !== "string") return bad(`${where}: not a string`);
    if (s.length > max) bad(`${where}: ${s.length} chars > ${max}: "${s.slice(0, 60)}..."`);
    for (const re of BANNED) if (re.test(s) && !/`[^`]*!/.test(s)) warn.push(`${where}: banned phrasing ${re}: "${s.slice(0, 70)}"`);
  };
  if (ch.hook) len(ch.hook, 140, "hook");
  let beats = 0;
  let missions = 0;
  let pitfalls = 0;
  let interactive = 0;
  (ch.sections || []).forEach((s, si) => {
    const where = `section ${si + 1} "${s.title}"`;
    if (!s.title) bad(`${where}: no title`);
    if (!Array.isArray(s.beats) || !s.beats.length) return bad(`${where}: no beats`);
    let says = 0;
    s.beats.forEach((b, bi) => {
      const w = `${where} beat ${bi + 1} (${b.t})`;
      beats += 1;
      says = b.t === "say" ? says + 1 : 0;
      if (says > 2) bad(`${w}: three say beats in a row`);
      switch (b.t) {
        case "say":
          len(b.x, 260, w);
          if (b.h) len(b.h, 60, `${w} h`);
          break;
        case "code":
          if (!b.lang || !b.src) bad(`${w}: needs lang and src`);
          if (b.src && b.src.split("\n").length > 34) bad(`${w}: ${b.src.split("\n").length} lines > 34`);
          if (b.note) len(b.note, 200, `${w} note`);
          break;
        case "play":
        case "rebuild":
          interactive += 1;
          if (!MODES.includes(b.mode)) bad(`${w}: mode "${b.mode}"`);
          if (b.mode === "glsl" ? !b.glsl : b.mode === "html" ? !(b.html || b.css || b.js) : !b.js) bad(`${w}: missing code for mode ${b.mode}`);
          if (b.task) len(b.task, 200, `${w} task`);
          if (b.t === "rebuild") {
            len(b.h, 60, `${w} h`);
            len(b.x, 300, `${w} x`);
          }
          break;
        case "predict":
        case "quiz":
          interactive += 1;
          if (!Array.isArray(b.options) || b.options.length < 2 || b.options.length > 5) bad(`${w}: 2-5 options`);
          if (!(b.answer >= 0 && b.answer < (b.options || []).length)) bad(`${w}: answer index`);
          len(b.why, 260, `${w} why`);
          if (b.t === "predict" && !b.src) bad(`${w}: predict needs src`);
          break;
        case "pitfall":
          pitfalls += 1;
          len(b.h, 60, `${w} h`);
          len(b.x, 300, `${w} x`);
          break;
        case "compare":
          if (!b.a?.src || !b.b?.src) bad(`${w}: needs a.src and b.src`);
          len(b.x, 220, `${w} x`);
          break;
        case "table":
          if (!b.head || !b.rows) bad(`${w}: head and rows`);
          if ((b.rows || []).length > 8) bad(`${w}: > 8 rows`);
          (b.rows || []).forEach((r) => r.forEach((c) => String(c).length > 90 && bad(`${w}: cell > 90 chars: "${String(c).slice(0, 40)}"`)));
          break;
        case "steps":
          if (!b.items || b.items.length < 2 || b.items.length > 8) bad(`${w}: 2-8 items`);
          (b.items || []).forEach((it) => len(it, 160, `${w} item`));
          break;
        case "viz":
          interactive += 1;
          if (!VIZ.includes(b.name)) bad(`${w}: unknown viz "${b.name}"`);
          if (b.name === "frames") {
            const p = b.props || {};
            if (!p.cols || !p.frames || p.frames.length < 2) bad(`${w}: frames needs cols and >= 2 frames`);
            (p.frames || []).forEach((fr, k) => {
              if (!Array.isArray(fr.cells) || fr.cells.length !== (p.cols || []).length) bad(`${w}: frame ${k + 1} cells must match cols`);
              if (fr.note) len(fr.note, 160, `${w} frame ${k + 1} note`);
            });
          }
          break;
        case "mission":
          missions += 1;
          len(b.h, 60, `${w} h`);
          len(b.x, 300, `${w} x`);
          len(b.hint, 200, `${w} hint`);
          break;
        default:
          bad(`${w}: unknown beat type`);
      }
    });
  });
  if (beats < 25) warn.push(`only ${beats} beats (aim 30-60)`);
  if (!missions) bad("no mission");
  if (!pitfalls) bad("no pitfall");
  if (interactive < 5) bad(`only ${interactive} interactive beats (need >= 5)`);
  (ch.nobodyTells || []).forEach((s, i) => len(s, 200, `nobodyTells ${i + 1}`));
  (ch.glossary || []).forEach(([k, v], i) => len(v, 140, `glossary ${i + 1} ${k}`));
  if (errs.length) {
    failed += 1;
    console.log(`x ${path.basename(f)}\n  ${errs.join("\n  ")}`);
  } else console.log(`ok ${path.basename(f)}: ${beats} beats, ${interactive} interactive, ${pitfalls} pitfalls, ${missions} missions`);
  warn.forEach((w) => console.log(`  warn: ${w}`));
}
console.log(failed ? `\n${failed} chapter(s) failed` : `\nall ${files.length} chapter(s) pass`);
process.exitCode = failed ? 1 : 0;
