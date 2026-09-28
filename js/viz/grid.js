/* A grid lab: edit the template, see the tracks and where items land. */

export function mount(el, { template } = {}) {
  const s = {
    cols: template || "repeat(auto-fill, minmax(120px, 1fr))",
    rows: "auto",
    areas: "",
    gap: 10,
    n: 9,
    span: false,
  };
  el.innerHTML = `<div class="controls" style="display:grid;grid-template-columns:auto 1fr;gap:8px 12px">
  <span>grid-template-columns</span><input type="text" data-k="cols" value="${s.cols}">
  <span>grid-template-rows</span><input type="text" data-k="rows" value="${s.rows}">
  <span>grid-template-areas</span><input type="text" data-k="areas" placeholder='"a a b" "c d b"' value="">
  <span>gap / items</span><span style="display:flex;gap:14px;align-items:center"><input type="range" min="0" max="30" value="10" data-k="gap"><input type="range" min="1" max="24" value="9" data-k="n"><label><input type="checkbox" data-k="span"> item 1 spans 2 columns</label></span>
</div>
<div class="box" style="display:grid;padding:10px;min-height:200px;background:var(--bg);border:1px solid var(--line);border-radius:8px;resize:horizontal;overflow:auto;max-width:100%"></div>
<p class="foot mono"></p>`;
  const box = el.querySelector(".box");
  function draw() {
    box.style.gridTemplateColumns = s.cols;
    box.style.gridTemplateRows = s.rows;
    box.style.gridTemplateAreas = s.areas;
    box.style.gap = `${s.gap}px`;
    const names = [...new Set((s.areas.match(/[a-z]+/gi) || []))];
    box.innerHTML = Array.from({ length: s.n }, (_, i) => {
      const area = names[i] ? `grid-area:${names[i]};` : "";
      const span = s.span && i === 0 && !area ? "grid-column:span 2;" : "";
      return `<div style="${area}${span}min-height:56px;background:hsl(${200 + i * 17} 60% 62% / .8);border-radius:6px;display:grid;place-items:center;font:600 13px var(--mono);color:#081421">${names[i] || i + 1}</div>`;
    }).join("");
    const cs = getComputedStyle(box);
    el.querySelector(".foot").textContent = `resolved columns: ${cs.gridTemplateColumns}  |  rows: ${cs.gridTemplateRows}  (drag the corner to resize)`;
  }
  el.querySelectorAll("[data-k]").forEach((i) =>
    i.addEventListener("input", () => {
      const k = i.dataset.k;
      s[k] = i.type === "checkbox" ? i.checked : i.type === "range" ? Number(i.value) : i.value;
      draw();
    })
  );
  new ResizeObserver(() => draw()).observe(box);
  draw();
}
