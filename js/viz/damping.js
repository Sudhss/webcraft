/* Frame-rate independence, visibly: each row chases the same target, one
 * with x += (t - x) * k per frame, one with 1 - exp(-lambda * dt), at 30, 60
 * and 144 fps. The naive rows drift apart; the exp rows move as one. */

import { whileVisible } from "./index.js";

export function mount(el) {
  const FPS = [30, 60, 144];
  el.innerHTML = `<div class="controls"><button class="btn small" data-go>Move the target</button><label>k (per frame) <input type="range" min="0.02" max="0.3" step="0.01" value="0.1" data-k></label><span class="mono" data-lam></span></div>
<canvas width="1200" height="380" style="width:100%;height:auto;background:var(--bg);border:1px solid var(--line);border-radius:8px"></canvas>
<p class="foot">Top three: <code>x += (target - x) * k</code> every frame. Bottom three: <code>x += (target - x) * (1 - Math.exp(-lambda * dt))</code>, with lambda matched so they agree at 60 fps.</p>`;
  const cv = el.querySelector("canvas");
  const g = cv.getContext("2d");
  let k = 0.1;
  let target = 1;
  const rows = [];
  for (const kind of ["naive", "exp"]) for (const fps of FPS) rows.push({ kind, fps, x: 0, acc: 0 });
  const lam = () => -Math.log(1 - k) * 60;
  const lamEl = el.querySelector("[data-lam]");
  const showLam = () => (lamEl.textContent = `lambda = ${lam().toFixed(2)} /s`);
  showLam();
  el.querySelector("[data-go]").addEventListener("click", () => (target = target > 0.5 ? 0 : 1));
  el.querySelector("[data-k]").addEventListener("input", (e) => {
    k = Number(e.target.value);
    showLam();
  });
  whileVisible(el, (dt) => {
    for (const r of rows) {
      r.acc += dt;
      const step = 1 / r.fps;
      while (r.acc >= step) {
        r.acc -= step;
        if (r.kind === "naive") r.x += (target - r.x) * k;
        else r.x += (target - r.x) * (1 - Math.exp(-lam() * step));
      }
    }
    const W = 1200;
    g.clearRect(0, 0, W, 380);
    rows.forEach((r, i) => {
      const y = 36 + i * 58 + (i >= 3 ? 20 : 0);
      g.fillStyle = "rgba(128,128,128,.18)";
      g.fillRect(170, y - 2, W - 230, 4);
      g.fillStyle = "rgba(160,160,160,.9)";
      g.font = "22px JetBrains Mono, monospace";
      g.fillText(`${r.kind} ${r.fps}fps`, 10, y + 8);
      g.fillStyle = r.kind === "naive" ? "#ff6b6b" : "#7ed69b";
      g.beginPath();
      g.arc(170 + r.x * (W - 230), y, 14, 0, Math.PI * 2);
      g.fill();
    });
  });
}
