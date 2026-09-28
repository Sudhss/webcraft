/* A modular type scale: base size times ratio^step, previewed, with the
 * tokens to paste. */

const RATIOS = { "1.125 major second": 1.125, "1.2 minor third": 1.2, "1.25 major third": 1.25, "1.333 perfect fourth": 1.333, "1.5 perfect fifth": 1.5, "1.618 golden": 1.618 };

export function mount(el, { base = 17, ratio = 1.25 }) {
  const s = { base, ratio };
  el.innerHTML = `<div class="controls"><label>base <input type="range" min="12" max="24" value="${base}" data-k="base"> <span class="mono" data-v></span></label><label>ratio <select data-k="ratio">${Object.entries(RATIOS).map(([k, v]) => `<option value="${v}"${v === ratio ? " selected" : ""}>${k}</option>`).join("")}</select></label></div>
<div class="prev" style="display:grid;gap:10px;padding:16px;background:var(--bg);border:1px solid var(--line);border-radius:8px;overflow:hidden"></div>
<pre class="foot mono" style="white-space:pre-wrap"></pre>`;
  const prev = el.querySelector(".prev");
  const names = ["small", "body", "h6", "h5", "h4", "h3", "h2", "h1", "display"];
  function draw() {
    el.querySelector("[data-v]").textContent = `${s.base}px`;
    const steps = names.map((n, i) => [n, s.base * s.ratio ** (i - 1)]);
    prev.innerHTML = steps
      .slice()
      .reverse()
      .map(([n, px]) => `<div style="display:grid;grid-template-columns:90px 1fr;align-items:baseline;gap:12px"><span class="mono" style="color:var(--text-3);font-size:12px">${n} ${px.toFixed(1)}px</span><span style="font-size:${px}px;line-height:1.15;white-space:nowrap;${px > 30 ? "font-family:var(--serif)" : ""}">Build it from scratch</span></div>`)
      .join("");
    el.querySelector("pre").textContent = `:root {\n${steps.map(([n, px]) => `  --text-${n}: ${(px / 16).toFixed(3)}rem;`).join("\n")}\n}`;
  }
  el.querySelectorAll("[data-k]").forEach((i) =>
    i.addEventListener("input", () => {
      s[i.dataset.k] = Number(i.value);
      draw();
    })
  );
  draw();
}
