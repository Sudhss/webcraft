/* Specificity as (a, b, c): ids, classes/attributes/pseudo-classes, types
 * and pseudo-elements. :is/:not/:has take their most specific argument,
 * :where counts nothing. */

import { esc } from "../md.js";

function splitTop(s, sep = ",") {
  const out = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (ch === sep && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

export function specificity(sel) {
  let a = 0;
  let b = 0;
  let c = 0;
  let s = sel;
  // Functional pseudo-classes first.
  s = s.replace(/:(is|not|has|where|nth-child|nth-last-child)\(((?:[^()]|\([^()]*\))*)\)/g, (m, fn, arg) => {
    if (fn === "where") return " ";
    if (fn.startsWith("nth")) {
      b += 1;
      const of = arg.match(/\bof\b(.*)$/);
      if (of) {
        const best = splitTop(of[1]).map(specificity).sort(cmp).pop();
        if (best) [a, b, c] = [a + best[0], b + best[1], c + best[2]];
      }
      return " ";
    }
    const best = splitTop(arg).map(specificity).sort(cmp).pop() || [0, 0, 0];
    a += best[0];
    b += best[1];
    c += best[2];
    return " ";
  });
  s = s.replace(/\[[^\]]*\]/g, () => ((b += 1), " "));
  s = s.replace(/::[\w-]+(\([^)]*\))?/g, () => ((c += 1), " "));
  s = s.replace(/:(before|after|first-line|first-letter)\b/g, () => ((c += 1), " "));
  s = s.replace(/#[\w-]+/g, () => ((a += 1), " "));
  s = s.replace(/\.[\w-]+/g, () => ((b += 1), " "));
  s = s.replace(/:[\w-]+(\([^)]*\))?/g, () => ((b += 1), " "));
  s.split(/[\s>+~]+/).forEach((t) => {
    if (/^[a-z][\w-]*$/i.test(t)) c += 1;
  });
  return [a, b, c];
}
const cmp = (x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2];

export function mount(el, { selectors }) {
  const init = (selectors || ["p", ".card p", "#main .card p", ".card:is(#hero, .x) p", ":where(#main) p", "ul li:not(.done)::before"]).join("\n");
  el.innerHTML = `<div class="controls" style="display:block"><textarea rows="6" style="width:100%" spellcheck="false">${esc(init)}</textarea></div><table class="tbl"><thead><tr><th>selector</th><th>a (ids)</th><th>b (classes)</th><th>c (types)</th></tr></thead><tbody></tbody></table><p class="foot">One selector per line. Highest (a, b, c) wins, compared left to right like version numbers; ties go to whichever comes last.</p>`;
  const ta = el.querySelector("textarea");
  const tbody = el.querySelector("tbody");
  function draw() {
    const rows = ta.value
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((sel, i) => ({ sel, i, s: specificity(sel) }));
    const best = rows.reduce((w, r) => (!w || cmp(r.s, w.s) >= 0 ? r : w), null);
    tbody.innerHTML = rows
      .map((r) => `<tr${r === best ? ' style="background:var(--ember-bg)"' : ""}><td><code>${esc(r.sel)}</code>${r === best ? ' <span class="chip on">wins</span>' : ""}</td><td>${r.s[0]}</td><td>${r.s[1]}</td><td>${r.s[2]}</td></tr>`)
      .join("");
  }
  ta.addEventListener("input", draw);
  ta.addEventListener("keydown", (e) => e.stopPropagation());
  draw();
}
