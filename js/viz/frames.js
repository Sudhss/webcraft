/* Step through any process as columns of stacked chips. A chip that wasn't
 * in the previous frame is highlighted, so the eye goes to what changed. */

import { md, esc } from "../md.js";

export function mount(el, { cols = [], frames = [], flow = [] }) {
  let i = 0;
  let timer = 0;
  el.innerHTML = `<div class="cols" style="grid-template-columns:repeat(${cols.length},minmax(0,1fr))"></div>
<div class="nav"><button class="btn small ghost" data-d="-1" aria-label="Previous step">&larr;</button><button class="btn small" data-d="1" aria-label="Next step">Next &rarr;</button><button class="btn small ghost" data-play>play</button><span class="count"></span><span class="fnote"></span></div>`;
  const colsEl = el.querySelector(".cols");
  const note = el.querySelector(".fnote");
  const count = el.querySelector(".count");
  function draw() {
    const f = frames[i];
    const prev = frames[i - 1];
    colsEl.innerHTML = cols
      .map((c, k) => {
        const items = f.cells[k] || [];
        const before = new Set((prev?.cells[k] || []).map(String));
        const isFlow = flow.includes(k) || /console|log|output|result/i.test(c);
        return `<div class="col${isFlow ? " flow" : ""}"><h5>${esc(c)}</h5>${items.map((x) => `<div class="chipx${before.has(String(x)) ? "" : " hot"}">${md(String(x))}</div>`).join("")}</div>`;
      })
      .join("");
    note.innerHTML = md(f.note || "");
    count.textContent = `${i + 1} / ${frames.length}`;
    el.querySelector('[data-d="-1"]').disabled = i === 0;
    el.querySelector('[data-d="1"]').disabled = i === frames.length - 1;
  }
  el.querySelectorAll("[data-d]").forEach((b) =>
    b.addEventListener("click", () => {
      i = Math.max(0, Math.min(frames.length - 1, i + Number(b.dataset.d)));
      draw();
    })
  );
  el.querySelector("[data-play]").addEventListener("click", (e) => {
    if (timer) {
      clearInterval(timer);
      timer = 0;
      e.target.textContent = "play";
      return;
    }
    if (i === frames.length - 1) i = 0;
    e.target.textContent = "pause";
    draw();
    timer = setInterval(() => {
      if (i >= frames.length - 1) {
        clearInterval(timer);
        timer = 0;
        e.target.textContent = "play";
        return;
      }
      i += 1;
      draw();
    }, 1400);
  });
  draw();
}
