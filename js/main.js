/* The app: a hash router over five views (home, chapter, review, glossary,
 * not found), the beat-by-beat reader, and search. Chapters are loaded on
 * demand; the home page, search and glossary load the rest in the
 * background. */

import { parts, chapters, file } from "../chapters/index.js";
import { md, esc, plain } from "./md.js";
import { store } from "./store.js";
import { renderBeat, INTERACTIVE } from "./beats.js";
import { pipeline } from "./pipeline.js";

const app = document.getElementById("app");
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const pad = (n) => String(n).padStart(2, "0");
const byId = new Map(chapters.map((c) => [c.id, c]));

const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};

/* ---- loading chapters */

const cache = new Map();
function load(id) {
  if (!cache.has(id)) {
    const c = byId.get(id);
    const url = new URL(`../chapters/${file(c).slice(2)}`, import.meta.url);
    cache.set(id, import(url.href).then((m) => m.default));
  }
  return cache.get(id);
}
const loaded = new Map(); // id -> chapter object, filled as modules arrive
let everything = null;
function loadAll() {
  everything ||= Promise.all(
    chapters.map((c) =>
      load(c.id).then(
        (ch) => (loaded.set(c.id, ch), ch),
        () => null
      )
    )
  );
  return everything;
}

/* ---- per-chapter numbers */

const flatten = (ch) => ch.sections.flatMap((s, si) => s.beats.map((b, bi) => ({ b, si, bi, key: `${ch.id}:${si}.${bi}` })));
const total = (ch) => ch.sections.reduce((n, s) => n + s.beats.length, 0);
function progress(id) {
  const ch = loaded.get(id);
  if (!ch) return 0;
  const c = store.chapter(id);
  return c.done ? 1 : Math.min(1, c.revealed / total(ch));
}

/* ---- chrome: review badge, title, focus */

function badge() {
  const n = store.due().length;
  const b = document.getElementById("review-count");
  b.hidden = !n;
  b.textContent = n;
}
function title(t) {
  document.title = t ? `${t} | Webcraft` : "Webcraft";
}

/* ---- router */

let cleanup = [];
function route() {
  cleanup.forEach((f) => f());
  cleanup = [];
  const [, view = "", id, sec] = location.hash.replace(/^#\/?/, "#/").split("/");
  const go = { "": home, c: () => chapter(id, sec), review, glossary }[view] || notFound;
  app.replaceChildren();
  go();
  if (!(view === "c" && sec)) scrollTo(0, 0);
  app.focus({ preventScroll: true });
  badge();
}
addEventListener("hashchange", route);

/* ---- home */

function home() {
  title("");
  const last = store.last && byId.get(store.last);
  const page = el("div", "home");
  const hero = el(
    "section",
    "hero",
    `<div>
      <h1>The web, <em>from the inside</em>.</h1>
      <p class="lede">How browsers, servers and GPUs really behave, how to build on them, and how to make the result look like someone cared. One short beat at a time.</p>
      <div class="hero-actions">
        ${last ? `<a class="btn" href="#/c/${last.id}">Continue: ${esc(last.title)}</a><a class="btn ghost" href="#/c/start-here">Start here</a>` : `<a class="btn" href="#/c/start-here">Start here</a>`}
        <button class="btn ghost" type="button" data-map>See the map</button>
      </div>
      <div class="stats"><div><b>${chapters.length}</b>chapters</div><div><b data-beats>&nbsp;</b>beats</div><div><b>13</b>live visuals</div></div>
    </div>`
  );
  const art = el("div", "");
  hero.append(art);
  cleanup.push(pipeline(art, { reduced }));
  hero.querySelector("[data-map]").addEventListener("click", () => page.querySelector(".part").scrollIntoView({ behavior: reduced ? "auto" : "smooth" }));
  page.append(hero);

  const cards = new Map();
  for (const [letter, p] of Object.entries(parts)) {
    const sec = el("section", "part", `<div class="part-head"><span class="letter">${letter}</span><h2>${esc(p.title)}</h2><p>${esc(p.blurb)}</p></div>`);
    const grid = el("div", "cards");
    for (const c of chapters.filter((c) => c.part === letter)) {
      const a = el("a", "card", `<span class="num">${pad(c.n)}</span><h3>${esc(c.title)}</h3><p>&nbsp;</p><div class="meta"><span></span><span class="bar"><i style="width:0"></i></span></div>`);
      a.href = `#/c/${c.id}`;
      grid.append(a);
      cards.set(c.id, a);
    }
    sec.append(grid);
    page.append(sec);
  }
  app.append(page);

  const fill = () => {
    let beats = 0;
    for (const c of chapters) {
      const a = cards.get(c.id);
      const ch = loaded.get(c.id);
      if (!ch) {
        if (everything) {
          a.classList.add("pending");
          a.querySelector("p").textContent = "Being written.";
          a.querySelector(".meta span").textContent = "soon";
        }
        continue;
      }
      beats += total(ch);
      const p = progress(c.id);
      a.querySelector("p").innerHTML = md(ch.hook);
      a.querySelector(".meta span").textContent = p >= 1 ? "done" : p > 0 ? `${Math.round(p * 100)}%` : `${ch.minutes} min`;
      a.querySelector(".bar i").style.width = `${p * 100}%`;
      a.classList.toggle("done", store.chapter(c.id).done);
    }
    if (everything) page.querySelector("[data-beats]").textContent = beats.toLocaleString("en");
  };
  fill();
  loadAll().then(() => page.isConnected && fill());
}

/* ---- chapter */

async function chapter(id, sec) {
  const meta = byId.get(id);
  if (!meta) return notFound();
  title(meta.title);
  const shell = el("div", "chapter");
  app.append(shell);
  let ch;
  try {
    ch = await load(id);
  } catch (e) {
    shell.className = "simple";
    shell.innerHTML = `<p class="note">Chapter ${pad(meta.n)}</p><h1>${esc(meta.title)}</h1><p>This chapter is still being written. Everything before it works.</p><p><a class="btn ghost" href="#/">Back to the map</a></p>`;
    if (!/fetch|import|module/i.test(e.message)) console.error(e);
    return;
  }
  if (!shell.isConnected) return;
  loaded.set(id, ch);

  const flat = flatten(ch);
  const st = store.chapter(id);
  const idx = chapters.indexOf(meta);
  const prev = chapters[idx - 1];
  const next = chapters[idx + 1];
  let shown = 0;

  /* rail */
  const rail = el("aside", "rail");
  rail.innerHTML = `<a class="back" href="#/">&larr; All chapters</a>
    <ol>${ch.sections.map((s, i) => `<li data-s="${i}"><a href="#/c/${id}/${i + 1}">${md(s.title)}</a></li>`).join("")}</ol>
    <div class="progress"><span data-count></span><div class="bar"><i></i></div></div>
    <button class="toggle" type="button" data-all></button>`;
  const page = el("article", "page");
  const levels = ["use", "understand", "rebuild"];
  page.innerHTML = `<header class="ch-head">
      <span class="num">CHAPTER ${pad(ch.n)} / PART ${ch.part}</span>
      <h1>${md(ch.title)}</h1>
      <p class="hook">${md(ch.hook)}</p>
      <div class="chips"><span class="chip">${ch.minutes} min</span>${levels.map((l) => `<span class="chip${ch.levels.includes(l) ? " on" : ""}">${l}</span>`).join("")}</div>
    </header>`;
  const body = el("div", "");
  page.append(body);
  shell.append(rail, page);

  const secEls = [];
  const cont = el("div", "cont", `<svg class="ring" viewBox="0 0 22 22" aria-hidden="true"><circle cx="11" cy="11" r="9" style="fill:none;stroke:var(--line-2);stroke-width:2.5"/><circle cx="11" cy="11" r="9" style="fill:none;stroke:var(--ember);stroke-width:2.5;stroke-linecap:round" transform="rotate(-90 11 11)" pathLength="100" stroke-dasharray="0 100"/></svg><span data-n></span><button class="btn" type="button"><span data-label>Continue</span> <kbd>Space</kbd></button>`);
  const contBtn = cont.querySelector("button");
  document.body.append(cont);
  cleanup.push(() => cont.remove());

  const ctxFor = (f) => ({
    key: f.key,
    draftKey: f.key,
    prior: st.answers[f.key],
    answer: (picked, right) => {
      store.answer(id, f.key, picked, right, f.b);
      badge();
      sync();
    },
    missionDone: !!st.missions[f.key],
    mission: (on) => store.update(id, (c) => (c.missions[f.key] = on)),
  });

  function reveal(n, animate) {
    while (shown < n && shown < flat.length) {
      const f = flat[shown];
      if (!secEls[f.si]) {
        const h = el("h2", "sec-title", `<span>${pad(ch.n)}.${f.si + 1}</span>${md(ch.sections[f.si].title)}`);
        h.id = `s${f.si + 1}`;
        if (!animate) h.style.animation = "none";
        secEls[f.si] = h;
        body.append(h);
      }
      const node = renderBeat(f.b, ctxFor(f));
      if (!animate) node.style.animation = "none";
      body.append(node);
      shown += 1;
    }
    if (shown >= flat.length && !page.querySelector(".end")) page.append(ending());
    sync();
  }

  function waiting() {
    const f = flat[shown - 1];
    return f && INTERACTIVE.has(f.b.t) && store.chapter(id).answers[f.key] == null;
  }

  function sync() {
    const n = shown;
    const all = flat.length;
    rail.querySelector("[data-count]").textContent = `${n} of ${all} beats`;
    rail.querySelector(".bar i").style.width = `${(n / all) * 100}%`;
    rail.querySelector("[data-all]").textContent = st.all ? "One beat at a time" : "Show the whole chapter";
    const cur = flat[Math.max(0, n - 1)].si;
    rail.querySelectorAll("li").forEach((li) => {
      const s = +li.dataset.s;
      li.classList.toggle("seen", s < cur);
      li.classList.toggle("on", s === cur);
      li.classList.toggle("locked", !secEls[s]);
    });
    cont.hidden = n >= all;
    cont.querySelector("[data-n]").textContent = `${n} / ${all}`;
    cont.querySelector("circle:last-child").setAttribute("stroke-dasharray", `${(n / all) * 100} 100`);
    const wait = waiting();
    contBtn.classList.toggle("ghost", wait);
    cont.querySelector("[data-label]").textContent = wait ? "Skip" : "Continue";
  }

  function step() {
    if (shown >= flat.length) return;
    reveal(shown + 1, true);
    store.update(id, (c) => (c.revealed = Math.max(c.revealed, shown)));
    const last = body.lastElementChild;
    const y = last.getBoundingClientRect().top + scrollY - 110;
    // Only scroll when the new beat starts in the lower part of the screen.
    if (last.getBoundingClientRect().top > innerHeight * 0.55) scrollTo({ top: y, behavior: reduced ? "auto" : "smooth" });
  }
  contBtn.addEventListener("click", step);

  const onKey = (e) => {
    if (e.key !== " " || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target.closest("input, textarea, select, button, a, summary, [contenteditable], .pg, dialog")) return;
    e.preventDefault();
    step();
  };
  addEventListener("keydown", onKey);
  cleanup.push(() => removeEventListener("keydown", onKey));

  rail.querySelector("[data-all]").addEventListener("click", () => {
    store.update(id, (c) => (c.all = !c.all));
    if (st.all) reveal(flat.length, false);
    else {
      // Back to beat mode: keep what was already read, drop the rest.
      const keep = Math.max(1, st.revealed);
      body.replaceChildren();
      page.querySelector(".end")?.remove();
      secEls.length = 0;
      shown = 0;
      reveal(keep, false);
    }
  });

  function ending() {
    const end = el("section", "end");
    end.innerHTML = `<h2>What nobody tells you</h2><ul>${ch.nobodyTells.map((s) => `<li>${md(s)}</li>`).join("")}</ul>
      ${ch.glossary.length ? `<h2>Words from this chapter</h2><dl class="gloss">${ch.glossary.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${md(v)}</dd>`).join("")}</dl>` : ""}
      <h2>Explain it</h2><p>${md(ch.explain)}</p><textarea placeholder="Write it the way you'd say it to a friend. Saved in this browser."></textarea>
      <div class="next">${prev ? `<a class="btn ghost" href="#/c/${prev.id}">&larr; ${esc(prev.title)}</a>` : "<span></span>"}${next ? `<a class="btn" href="#/c/${next.id}">Next: ${esc(next.title)} &rarr;</a>` : `<a class="btn" href="#/">Back to the map</a>`}</div>`;
    const ta = end.querySelector("textarea");
    ta.value = store.explain(id);
    let t = 0;
    ta.addEventListener("input", () => {
      clearTimeout(t);
      t = setTimeout(() => store.explain(id, ta.value), 300);
    });
    if (!st.all) store.update(id, (c) => (c.done = true));
    return end;
  }

  reveal(st.all ? flat.length : Math.max(1, st.revealed), false);

  // Rail links and #/c/id/N jump to a section that has been reached.
  const jump = (n) => {
    const h = secEls[n - 1];
    if (h) scrollTo({ top: h.getBoundingClientRect().top + scrollY - 80, behavior: reduced ? "auto" : "smooth" });
  };
  rail.querySelectorAll("li a").forEach((a, i) =>
    a.addEventListener("click", (e) => {
      e.preventDefault();
      history.replaceState(null, "", a.getAttribute("href"));
      jump(i + 1);
    })
  );
  if (sec) requestAnimationFrame(() => jump(+sec));
}

/* ---- review */

function review() {
  title("Review");
  const page = el("div", "simple");
  const due = store.due();
  const queued = store.queued();
  page.innerHTML = `<h1>Review</h1><p>${
    due.length
      ? `${due.length} question${due.length > 1 ? "s" : ""} you missed, back on schedule. Get one right and it returns later (1, 3, 7, then 21 days); miss it and it starts over.`
      : queued
        ? `Nothing due. ${queued > 1 ? `${queued} questions are` : "1 question is"} waiting for ${queued > 1 ? "their" : "its"} next date.`
        : "Nothing to review yet. Questions you get wrong in a chapter come back here on a schedule."
  }</p>`;
  for (const r of due) {
    const meta = byId.get(r.chapter);
    const head = el("p", "note", `From <a href="#/c/${r.chapter}">${esc(meta?.title || r.chapter)}</a>`);
    page.append(head);
    page.append(
      renderBeat(r.item, {
        key: r.key,
        answer: (_, right) => {
          store.reviewAnswer(r.key, right);
          badge();
        },
      })
    );
  }
  app.append(page);
}

/* ---- glossary */

function glossary() {
  title("Glossary");
  const page = el("div", "simple", `<h1>Glossary</h1><p>Every term the course defines, with the chapter that explains it.</p><input type="search" class="gloss-filter" placeholder="Filter terms" aria-label="Filter terms" /><dl class="gloss"></dl>`);
  app.append(page);
  const dl = page.querySelector("dl");
  const input = page.querySelector("input");
  let rows = [];
  const draw = () => {
    const q = input.value.trim().toLowerCase();
    const list = q ? rows.filter((r) => r.term.toLowerCase().includes(q) || r.def.toLowerCase().includes(q)) : rows;
    dl.innerHTML = list.length
      ? list.map((r) => `<dt>${esc(r.term)}</dt><dd>${md(r.def)} <a class="from" href="#/c/${r.id}">${pad(r.n)}</a></dd>`).join("")
      : `<dd>${rows.length ? "No term matches." : "Loading..."}</dd>`;
  };
  input.addEventListener("input", draw);
  draw();
  loadAll().then((all) => {
    rows = all
      .filter(Boolean)
      .flatMap((ch) => ch.glossary.map(([term, def]) => ({ term, def, id: ch.id, n: ch.n })))
      .sort((a, b) => a.term.localeCompare(b.term, "en", { sensitivity: "base" }));
    if (page.isConnected) draw();
  });
}

function notFound() {
  title("Not found");
  app.append(el("div", "simple", `<h1>Nothing here</h1><p>That page doesn't exist. The map has everything that does.</p><p><a class="btn ghost" href="#/">Back to the map</a></p>`));
}

/* ---- search */

const dialog = document.getElementById("search");
const input = document.getElementById("search-input");
const results = document.getElementById("search-results");
let index = null;
let sel = 0;

function buildIndex(all) {
  const out = [];
  for (const ch of all.filter(Boolean)) {
    const base = `#/c/${ch.id}`;
    out.push({ href: base, title: ch.title, sub: `Chapter ${pad(ch.n)}`, text: `${ch.title} ${plain(ch.hook)}`, w: 4 });
    ch.sections.forEach((s, si) => {
      const text = s.beats
        .map((b) => [b.h, b.x, b.q, b.why, b.note, b.task, b.src, b.a?.src, b.b?.src, ...(b.items || []), ...(b.rows || []).flat()].filter(Boolean).join(" "))
        .join(" ");
      out.push({ href: `${base}/${si + 1}`, title: plain(s.title), sub: `${pad(ch.n)} ${ch.title}`, text: `${plain(s.title)} ${plain(text)}`, w: 2 });
    });
    for (const [term, def] of ch.glossary) out.push({ href: base, title: term, sub: `Glossary, ${pad(ch.n)} ${ch.title}`, text: `${term} ${plain(def)}`, w: 3 });
  }
  return out.map((r) => ({ ...r, low: r.text.toLowerCase(), tlow: r.title.toLowerCase() }));
}

function search(q) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length || !index) return [];
  const scored = [];
  for (const r of index) {
    let s = 0;
    for (const w of words) {
      const inTitle = r.tlow.includes(w);
      const at = r.low.indexOf(w);
      if (at < 0 && !inTitle) {
        s = 0;
        break;
      }
      s += (inTitle ? 10 : 1) * r.w;
    }
    if (s) scored.push([s, r]);
  }
  return scored.sort((a, b) => b[0] - a[0]).slice(0, 24).map(([, r]) => r);
}

function snippet(r, q) {
  const w = q.toLowerCase().split(/\s+/).filter(Boolean)[0] || "";
  const at = r.low.indexOf(w);
  if (at < 0 || r.tlow.includes(w)) return esc(r.sub);
  const s = r.text.slice(Math.max(0, at - 40), at + 80).replace(/\s+/g, " ");
  return `${esc(r.sub)}: ...${esc(s)}...`;
}

function drawResults() {
  const q = input.value.trim();
  if (!index) {
    results.innerHTML = `<li><a><small>Loading the course...</small></a></li>`;
    return;
  }
  const list = search(q);
  sel = Math.min(sel, Math.max(0, list.length - 1));
  results.innerHTML = q
    ? list.length
      ? list.map((r, i) => `<li><a href="${r.href}"${i === sel ? ' class="sel"' : ""}>${esc(r.title)}<small>${snippet(r, q)}</small></a></li>`).join("")
      : `<li><a><small>Nothing matches "${esc(q)}".</small></a></li>`
    : `<li><a><small>Type a term, an API, a property. Arrow keys to move, Enter to open.</small></a></li>`;
}

function openSearch() {
  if (dialog.open) return;
  dialog.showModal();
  input.select();
  drawResults();
  loadAll().then((all) => {
    index ||= buildIndex(all);
    drawResults();
  });
}
document.getElementById("search-open").addEventListener("click", openSearch);
input.addEventListener("input", () => {
  sel = 0;
  drawResults();
});
input.addEventListener("keydown", (e) => {
  const links = results.querySelectorAll("a[href]");
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    if (!links.length) return;
    sel = (sel + (e.key === "ArrowDown" ? 1 : -1) + links.length) % links.length;
    links.forEach((a, i) => a.classList.toggle("sel", i === sel));
    links[sel].scrollIntoView({ block: "nearest" });
  } else if (e.key === "Enter" && links[sel]) {
    e.preventDefault();
    location.hash = links[sel].getAttribute("href");
    dialog.close();
  }
});
results.addEventListener("click", (e) => e.target.closest("a[href]") && dialog.close());
dialog.addEventListener("click", (e) => e.target === dialog && dialog.close());
addEventListener("keydown", (e) => {
  if (e.key === "/" && !e.target.closest("input, textarea, select, [contenteditable]")) {
    e.preventDefault();
    openSearch();
  }
});

route();
// Warm the rest of the course once the first view is up, so search is instant.
(window.requestIdleCallback || setTimeout)(() => loadAll());
