/* The frame budget: add main-thread work per frame and watch frames get
 * dropped. The spinner is animated by JS on the main thread, so you feel it. */

export function mount(el) {
  el.innerHTML = `<div class="controls"><label>work per frame <input type="range" min="0" max="60" value="4" data-w> <span class="mono" data-v>4 ms</span></label><label><input type="checkbox" data-on> run</label><span class="mono" data-fps></span></div>
<div style="display:grid;grid-template-columns:120px 1fr;gap:16px;align-items:center">
  <div style="width:120px;height:120px;display:grid;place-items:center"><div class="spin" style="width:70px;height:70px;border-radius:12px;background:var(--ember)"></div></div>
  <canvas width="1000" height="220" style="width:100%;height:auto;background:var(--bg);border:1px solid var(--line);border-radius:8px"></canvas>
</div>
<p class="foot">Each bar is one frame. The line is 16.7 ms, the budget at 60 Hz. Past it, the browser skips frames: the square stutters. Tick "run" to start (it really blocks this page's main thread).</p>`;
  const cv = el.querySelector("canvas");
  const g = cv.getContext("2d");
  const spin = el.querySelector(".spin");
  let work = 4;
  let on = false;
  let raf = 0;
  let last = performance.now();
  let angle = 0;
  const bars = [];
  function frame(now) {
    const dt = now - last;
    last = now;
    const t0 = performance.now();
    while (performance.now() - t0 < work) {
      /* busy: this is the "work" */
    }
    angle += dt * 0.36;
    spin.style.transform = `rotate(${angle}deg)`;
    bars.push(dt);
    if (bars.length > 100) bars.shift();
    g.clearRect(0, 0, 1000, 220);
    const scale = 220 / 70;
    bars.forEach((b, i) => {
      g.fillStyle = b > 18 ? "#ff6b6b" : "#7ed69b";
      const h = Math.min(220, b * scale);
      g.fillRect(i * 10, 220 - h, 8, h);
    });
    g.strokeStyle = "rgba(255,176,138,.9)";
    g.setLineDash([8, 6]);
    g.beginPath();
    g.moveTo(0, 220 - 16.7 * scale);
    g.lineTo(1000, 220 - 16.7 * scale);
    g.stroke();
    g.setLineDash([]);
    const recent = bars.slice(-30);
    const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
    el.querySelector("[data-fps]").textContent = `${Math.round(1000 / avg)} fps, ${recent.filter((b) => b > 18).length}/30 frames late`;
    if (on) raf = requestAnimationFrame(frame);
  }
  el.querySelector("[data-w]").addEventListener("input", (e) => {
    work = Number(e.target.value);
    el.querySelector("[data-v]").textContent = `${work} ms`;
  });
  el.querySelector("[data-on]").addEventListener("change", (e) => {
    on = e.target.checked;
    if (on) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    } else cancelAnimationFrame(raf);
  });
  new IntersectionObserver((es) => {
    if (!es[0].isIntersecting && on) {
      on = false;
      el.querySelector("[data-on]").checked = false;
      cancelAnimationFrame(raf);
    }
  }).observe(el);
}
