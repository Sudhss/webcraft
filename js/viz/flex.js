/* A flexbox lab: every container property as a control, items of different
 * sizes, and the CSS that produced it. */

const OPTS = {
  "flex-direction": ["row", "row-reverse", "column", "column-reverse"],
  "flex-wrap": ["nowrap", "wrap", "wrap-reverse"],
  "justify-content": ["flex-start", "center", "flex-end", "space-between", "space-around", "space-evenly"],
  "align-items": ["stretch", "flex-start", "center", "flex-end", "baseline"],
  "align-content": ["normal", "flex-start", "center", "flex-end", "space-between", "stretch"],
};

export function mount(el, { items = 5 }) {
  const s = { "flex-direction": "row", "flex-wrap": "nowrap", "justify-content": "flex-start", "align-items": "stretch", "align-content": "normal", gap: 8, n: items, grow: false };
  el.innerHTML = `<div class="controls">${Object.entries(OPTS)
    .map(([k, v]) => `<label>${k}<select data-k="${k}">${v.map((o) => `<option>${o}</option>`).join("")}</select></label>`)
    .join("")}<label>gap <input type="range" min="0" max="32" value="8" data-k="gap"></label><label>items <input type="range" min="1" max="12" value="${items}" data-k="n"></label><label><input type="checkbox" data-k="grow"> item 2 grows</label></div>
<div class="box" style="display:flex;min-height:230px;padding:10px;background:var(--bg);border:1px solid var(--line);border-radius:8px;resize:horizontal;overflow:auto;max-width:100%"></div>
<pre class="foot mono" style="white-space:pre-wrap;margin:10px 0 0"></pre>`;
  const box = el.querySelector(".box");
  const sizes = [[70, 40], [110, 60], [50, 90], [90, 30], [60, 55], [130, 45], [40, 70], [80, 50], [100, 35], [55, 80], [75, 65], [65, 40]];
  function draw() {
    for (const k of Object.keys(OPTS)) box.style.setProperty(k, s[k]);
    box.style.gap = `${s.gap}px`;
    box.innerHTML = Array.from({ length: s.n }, (_, i) => {
      const [w, h] = sizes[i % sizes.length];
      const grow = s.grow && i === 1 ? "flex-grow:1;" : "";
      return `<div style="${grow}flex-basis:${w}px;min-height:${h}px;background:hsl(${18 + i * 26} 70% 62% / .85);border-radius:6px;display:grid;place-items:center;font:600 13px var(--mono);color:#1a0d06">${i + 1}</div>`;
    }).join("");
    el.querySelector(".foot").textContent = `.box {\n  display: flex;\n${Object.keys(OPTS)
      .map((k) => `  ${k}: ${s[k]};`)
      .join("\n")}\n  gap: ${s.gap}px;\n}${s.grow ? "\n.item:nth-child(2) { flex-grow: 1; }" : ""}\n/* drag the box's corner to resize it */`;
  }
  el.querySelectorAll("[data-k]").forEach((i) =>
    i.addEventListener("input", () => {
      const k = i.dataset.k;
      s[k] = i.type === "checkbox" ? i.checked : i.type === "range" ? Number(i.value) : i.value;
      draw();
    })
  );
  draw();
}
