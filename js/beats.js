/* One function per beat type. Each returns an element; interactive beats
 * report answers through ctx.answer(key, picked, correct). */

import { md, esc } from "./md.js";
import { lines } from "./highlight.js";
import { playground } from "./playground.js";
import { mountViz } from "./viz/index.js";

const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};

export function codeBox(src, lang, { file, mark = [] } = {}) {
  const box = el("div", "codebox");
  const ls = lines(src, lang);
  box.innerHTML = `<div class="head"><span>${esc(file || lang || "")}</span><button class="copy" type="button">copy</button></div><pre class="code">${ls.map((l, i) => `<span class="ln${mark.includes(i + 1) ? " mark" : ""}">${l || " "}</span>`).join("")}</pre>`;
  box.querySelector(".copy").addEventListener("click", async (e) => {
    try {
      await navigator.clipboard.writeText(src);
      e.target.textContent = "copied";
      setTimeout(() => (e.target.textContent = "copy"), 1200);
    } catch {
      e.target.textContent = "select + copy";
    }
  });
  return box;
}

function ask(b, ctx, withCode) {
  const box = el("div", "ask");
  if (withCode) box.append(codeBox(b.src, b.lang));
  box.append(el("p", "q", md(b.q)));
  const opts = el("div", "opts");
  const keys = "ABCDE";
  const prior = ctx.prior;
  b.options.forEach((o, i) => {
    const btn = el("button", "opt", `<span class="key">${keys[i]}</span><span>${md(o)}</span>`);
    btn.type = "button";
    btn.addEventListener("click", () => pick(i));
    opts.append(btn);
  });
  box.append(opts);
  function pick(i, silent) {
    const right = i === b.answer;
    [...opts.children].forEach((btn, k) => {
      btn.disabled = true;
      if (k === b.answer) btn.classList.add("right");
      else if (k === i) btn.classList.add("wrong");
    });
    const why = el("p", "why", `${right ? "<b>Right.</b> " : `<b class="no">Not quite.</b> `}${md(b.why)}`);
    box.append(why);
    if (!silent) ctx.answer?.(i, right);
  }
  if (prior != null) pick(prior, true);
  return box;
}

const RENDER = {
  say(b) {
    return el("div", "", `${b.h ? `<h4>${md(b.h)}</h4>` : ""}<p>${md(b.x)}</p>`);
  },
  code(b) {
    const d = el("div", "");
    d.append(codeBox(b.src, b.lang, { file: b.file, mark: b.mark }));
    if (b.note) d.append(el("p", "note", md(b.note)));
    return d;
  },
  play(b, ctx) {
    const d = el("div", "");
    playground(d, b, ctx.draftKey);
    return d;
  },
  rebuild(b, ctx) {
    const d = el("div", "");
    d.append(el("div", "mission", `<span class="label">Rebuild it</span><h4>${md(b.h)}</h4><p>${md(b.x)}</p>`));
    const p = el("div", "");
    p.style.marginTop = "10px";
    playground(p, b, ctx.draftKey);
    d.append(p);
    return d;
  },
  predict(b, ctx) {
    const d = el("div", "");
    d.append(el("span", "label", "Predict"));
    d.append(ask(b, ctx, true));
    return d;
  },
  quiz(b, ctx) {
    const d = el("div", "");
    d.append(el("span", "label", "Check"));
    d.append(ask(b, ctx, false));
    return d;
  },
  pitfall(b) {
    return el("div", "pitfall", `<span class="label">Hard-won</span><h4>${md(b.h)}</h4><p>${md(b.x)}</p>`);
  },
  compare(b) {
    const d = el("div", "");
    const g = el("div", "compare");
    const A = codeBox(b.a.src, b.a.lang, { file: b.a.label });
    const B = codeBox(b.b.src, b.b.lang, { file: b.b.label });
    A.querySelector(".head span").classList.add("tag-a");
    B.querySelector(".head span").classList.add("tag-b");
    g.append(A, B);
    d.append(g);
    if (b.x) d.append(el("p", "note", md(b.x)));
    return d;
  },
  table(b) {
    const d = el("div", "tbl-wrap");
    d.innerHTML = `<table class="tbl"><thead><tr>${b.head.map((h) => `<th>${md(h)}</th>`).join("")}</tr></thead><tbody>${b.rows.map((r) => `<tr>${r.map((c) => `<td>${md(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>${b.caption ? `<p class="caption">${md(b.caption)}</p>` : ""}`;
    return d;
  },
  steps(b) {
    return el("div", "steps", `${b.h ? `<h4>${md(b.h)}</h4>` : ""}<ol>${b.items.map((i) => `<li><span>${md(i)}</span></li>`).join("")}</ol>`);
  },
  viz(b) {
    const d = el("div", "viz");
    mountViz(d, b.name, b.props || {});
    return d;
  },
  mission(b, ctx) {
    const d = el("div", "mission", `<span class="label">Mission</span><h4>${md(b.h)}</h4><p>${md(b.x)}</p><details><summary>Hint</summary><p>${md(b.hint)}</p></details>`);
    if (b.solution) {
      const s = el("details", "");
      s.innerHTML = "<summary>A solution</summary>";
      s.append(codeBox(b.solution.src, b.solution.lang));
      d.append(s);
    }
    const done = el("label", "done", `<input type="checkbox"${ctx.missionDone ? " checked" : ""}> I built it`);
    done.querySelector("input").addEventListener("change", (e) => ctx.mission?.(e.target.checked));
    d.append(done);
    return d;
  },
};

const WIDE = new Set(["play", "rebuild", "viz", "compare"]);

export function renderBeat(b, ctx) {
  const f = RENDER[b.t];
  const wrap = el("div", `beat ${b.t}${WIDE.has(b.t) ? " wide" : ""}`);
  wrap.dataset.key = ctx.key;
  if (!f) {
    wrap.textContent = `(unknown beat ${b.t})`;
    return wrap;
  }
  try {
    wrap.append(f(b, ctx));
  } catch (e) {
    wrap.textContent = `This beat failed to render: ${e.message}`;
    console.error(e, b);
  }
  return wrap;
}

export const INTERACTIVE = new Set(["predict", "quiz"]);
