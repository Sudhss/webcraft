/* The box model: drag each layer's size, see the box and what it measures. */

export function mount(el) {
  const s = { margin: 20, border: 6, padding: 18, width: 180, height: 70, sizing: "content-box" };
  el.innerHTML = `<div class="controls">
  ${["margin", "border", "padding", "width", "height"].map((k) => `<label>${k} <input type="range" min="0" max="${k === "width" ? 260 : k === "height" ? 140 : 40}" value="${s[k]}" data-k="${k}"><span class="mono" data-v="${k}">${s[k]}px</span></label>`).join("")}
  <label><select data-k="sizing"><option>content-box</option><option>border-box</option></select></label>
</div>
<div class="stage" style="display:grid;place-items:center;min-height:300px;background:var(--bg);border-radius:8px;border:1px solid var(--line);overflow:auto;padding:10px">
  <div class="m" style="background:rgba(255,176,138,.18);outline:1px dashed rgba(255,176,138,.6)"><div class="b" style="background:#f5c26b"><div class="p" style="background:rgba(126,214,155,.35)"><div class="c" style="background:rgba(134,182,255,.55);display:grid;place-items:center;font:12px var(--mono);color:var(--text)"></div></div></div></div>
</div>
<p class="foot mono"></p>`;
  const $ = (q) => el.querySelector(q);
  function draw() {
    const inner = s.sizing === "border-box" ? { w: Math.max(0, s.width - 2 * (s.padding + s.border)), h: Math.max(0, s.height - 2 * (s.padding + s.border)) } : { w: s.width, h: s.height };
    const outerW = inner.w + 2 * (s.padding + s.border);
    const outerH = inner.h + 2 * (s.padding + s.border);
    $(".m").style.padding = `${s.margin}px`;
    $(".b").style.padding = `${s.border}px`;
    $(".p").style.padding = `${s.padding}px`;
    const c = $(".c");
    c.style.width = `${inner.w}px`;
    c.style.height = `${inner.h}px`;
    c.textContent = `${inner.w} x ${inner.h}`;
    $(".foot").innerHTML = `box-sizing: ${s.sizing}; width: ${s.width}px<br>content ${inner.w} x ${inner.h}, border box ${outerW} x ${outerH}, space taken with margin ${outerW + 2 * s.margin} x ${outerH + 2 * s.margin}`;
  }
  el.querySelectorAll("[data-k]").forEach((i) =>
    i.addEventListener("input", () => {
      s[i.dataset.k] = i.dataset.k === "sizing" ? i.value : Number(i.value);
      const v = el.querySelector(`[data-v="${i.dataset.k}"]`);
      if (v) v.textContent = `${i.value}px`;
      draw();
    })
  );
  draw();
}
