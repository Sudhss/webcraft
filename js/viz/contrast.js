/* WCAG 2 contrast: relative luminance of each colour, ratio (L1 + .05) /
 * (L2 + .05), and what it passes. */

function parse(c) {
  const d = document.createElement("div");
  d.style.color = c;
  document.body.append(d);
  const m = getComputedStyle(d).color.match(/[\d.]+/g) || [0, 0, 0];
  d.remove();
  return m.slice(0, 3).map(Number);
}
const lin = (v) => {
  v /= 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
export function ratio(a, b) {
  const [x, y] = [lum(parse(a)), lum(parse(b))].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

export function mount(el, { fg = "#8a8580", bg = "#ffffff" }) {
  el.innerHTML = `<div class="controls"><label>text <input type="color" data-k="fg" value="${fg}"><input type="text" data-t="fg" value="${fg}" size="9"></label><label>background <input type="color" data-k="bg" value="${bg}"><input type="text" data-t="bg" value="${bg}" size="9"></label></div>
<div class="sample" style="padding:22px;border-radius:8px;border:1px solid var(--line)"><p style="margin:0 0 6px;font-size:16px">Body text at 16px: the quick brown fox jumps over the lazy dog.</p><p style="margin:0;font-size:26px;font-weight:600">Large text, 24px and up</p></div>
<p class="foot mono" data-out style="font-size:15px"></p>`;
  const s = { fg, bg };
  const sample = el.querySelector(".sample");
  function draw() {
    sample.style.color = s.fg;
    sample.style.background = s.bg;
    const r = ratio(s.fg, s.bg);
    const pass = (n) => (r >= n ? '<b style="color:var(--good)">pass</b>' : '<b style="color:var(--bad)">fail</b>');
    el.querySelector("[data-out]").innerHTML = `ratio ${r.toFixed(2)} : 1   |   body text AA (4.5) ${pass(4.5)}   AAA (7) ${pass(7)}   |   large text AA (3) ${pass(3)}   |   UI parts (3) ${pass(3)}`;
  }
  el.querySelectorAll("[data-k]").forEach((i) =>
    i.addEventListener("input", () => {
      s[i.dataset.k] = i.value;
      el.querySelector(`[data-t="${i.dataset.k}"]`).value = i.value;
      draw();
    })
  );
  el.querySelectorAll("[data-t]").forEach((i) => {
    i.addEventListener("input", () => {
      s[i.dataset.t] = i.value;
      draw();
    });
    i.addEventListener("keydown", (e) => e.stopPropagation());
  });
  draw();
}
