/* Easing: drag a cubic-bezier's two handles, watch a dot move with it, copy
 * the CSS. Spring mode integrates a damped spring and prints a linear()
 * approximation you can paste into CSS. */

import { whileVisible } from "./index.js";

const PRESETS = {
  ease: [0.25, 0.1, 0.25, 1],
  "ease-out (quint)": [0.22, 1, 0.36, 1],
  "ease-in (quint)": [0.64, 0, 0.78, 0],
  "ease-in-out": [0.65, 0, 0.35, 1],
  "back-out": [0.34, 1.56, 0.64, 1],
  linear: [0, 0, 1, 1],
};

function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const X = (t) => ((ax * t + bx) * t + cx) * t;
  const Y = (t) => ((ay * t + by) * t + cy) * t;
  const dX = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => {
    let t = x;
    for (let i = 0; i < 8; i += 1) {
      const d = dX(t);
      if (Math.abs(d) < 1e-6) break;
      t -= (X(t) - x) / d;
    }
    t = Math.min(1, Math.max(0, t));
    return Y(t);
  };
}

function spring({ k, c, m }) {
  // Semi-implicit Euler from 0 to 1; returns samples until settled.
  let x = 0;
  let v = 0;
  const out = [0];
  const dt = 1 / 240;
  for (let i = 0; i < 240 * 4; i += 1) {
    const a = (-k * (x - 1) - c * v) / m;
    v += a * dt;
    x += v * dt;
    if (i % 4 === 3) out.push(x);
    if (i > 60 && Math.abs(x - 1) < 0.001 && Math.abs(v) < 0.01) break;
  }
  out.push(1);
  return out;
}

export function mount(el, { curve }) {
  const s = { mode: "bezier", p: curve || PRESETS["ease-out (quint)"], k: 170, c: 26, m: 1 };
  el.innerHTML = `<div class="controls">
  <label><select data-mode><option value="bezier">cubic-bezier</option><option value="spring">spring</option></select></label>
  <span data-b><select data-preset>${Object.keys(PRESETS).map((k) => `<option>${k}</option>`).join("")}</select></span>
  <span data-s hidden><label>stiffness <input type="range" min="20" max="600" value="170" data-sk="k"></label><label>damping <input type="range" min="1" max="80" value="26" data-sk="c"></label><label>mass <input type="range" min="0.2" max="4" step="0.1" value="1" data-sk="m"></label></span>
</div>
<div style="display:grid;grid-template-columns:260px 1fr;gap:16px;align-items:center">
  <canvas width="520" height="520" style="width:260px;height:260px;background:var(--bg);border-radius:8px;border:1px solid var(--line);touch-action:none"></canvas>
  <div><div class="track" style="position:relative;height:44px;background:var(--bg);border:1px solid var(--line);border-radius:22px"><div class="dot" style="position:absolute;top:7px;left:7px;width:28px;height:28px;border-radius:50%;background:var(--ember)"></div></div>
  <pre class="foot mono css" style="white-space:pre-wrap;word-break:break-all;margin-top:12px"></pre></div>
</div>`;
  const cv = el.querySelector("canvas");
  const g = cv.getContext("2d");
  const dot = el.querySelector(".dot");
  const track = el.querySelector(".track");
  const css = el.querySelector(".css");
  const P = 60;
  const S = 400;
  const toPx = (x, y) => [P + x * S, P + (1 - y) * S];
  let fn = bezier(...s.p);
  let samples = [];
  function draw() {
    g.clearRect(0, 0, 520, 520);
    g.strokeStyle = "rgba(128,128,128,.25)";
    g.lineWidth = 2;
    g.strokeRect(P, P, S, S);
    g.strokeStyle = getComputedStyle(el).getPropertyValue("--ember") || "#ff7a45";
    g.lineWidth = 5;
    g.beginPath();
    if (s.mode === "bezier") {
      for (let i = 0; i <= 100; i += 1) {
        const [x, y] = toPx(i / 100, fn(i / 100));
        i ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.stroke();
      const [x1, y1, x2, y2] = s.p;
      g.lineWidth = 2;
      g.strokeStyle = "rgba(160,160,160,.8)";
      const a = toPx(0, 0);
      const b = toPx(x1, y1);
      const c = toPx(x2, y2);
      const d = toPx(1, 1);
      g.beginPath();
      g.moveTo(...a);
      g.lineTo(...b);
      g.moveTo(...d);
      g.lineTo(...c);
      g.stroke();
      for (const q of [b, c]) {
        g.fillStyle = "#86b6ff";
        g.beginPath();
        g.arc(q[0], q[1], 14, 0, Math.PI * 2);
        g.fill();
      }
      css.textContent = `transition-timing-function: cubic-bezier(${s.p.map((v) => +v.toFixed(2)).join(", ")});\n\ndrag the blue handles`;
    } else {
      samples.forEach((y, i) => {
        const [px, py] = toPx(i / (samples.length - 1), Math.min(1.6, y) / 1.6 + 0.2);
        i ? g.lineTo(px, py) : g.moveTo(px, py);
      });
      g.stroke();
      const n = 24;
      const pick = Array.from({ length: n + 1 }, (_, i) => +samples[Math.round((i / n) * (samples.length - 1))].toFixed(3));
      const ms = Math.round((samples.length / 60) * 1000);
      css.textContent = `/* settles in about ${ms} ms */\ntransition: transform ${ms}ms linear(${pick.join(", ")});`;
    }
  }
  function recompute() {
    if (s.mode === "bezier") fn = bezier(...s.p);
    else samples = spring(s);
    draw();
  }
  let drag = -1;
  const pos = (e) => {
    const r = cv.getBoundingClientRect();
    return [((e.clientX - r.left) * 2 - P) / S, 1 - ((e.clientY - r.top) * 2 - P) / S];
  };
  cv.addEventListener("pointerdown", (e) => {
    if (s.mode !== "bezier") return;
    const [x, y] = pos(e);
    const d1 = Math.hypot(x - s.p[0], y - s.p[1]);
    const d2 = Math.hypot(x - s.p[2], y - s.p[3]);
    drag = d1 < d2 ? 0 : 2;
    cv.setPointerCapture(e.pointerId);
  });
  cv.addEventListener("pointermove", (e) => {
    if (drag < 0) return;
    const [x, y] = pos(e);
    s.p = [...s.p];
    s.p[drag] = Math.min(1, Math.max(0, x));
    s.p[drag + 1] = Math.min(1.8, Math.max(-0.8, y));
    recompute();
  });
  cv.addEventListener("pointerup", () => (drag = -1));
  el.querySelector("[data-mode]").addEventListener("change", (e) => {
    s.mode = e.target.value;
    el.querySelector("[data-b]").hidden = s.mode !== "bezier";
    el.querySelector("[data-s]").hidden = s.mode !== "spring";
    recompute();
  });
  el.querySelector("[data-preset]").addEventListener("change", (e) => {
    s.p = PRESETS[e.target.value];
    recompute();
  });
  el.querySelectorAll("[data-sk]").forEach((i) =>
    i.addEventListener("input", () => {
      s[i.dataset.sk] = Number(i.value);
      recompute();
    })
  );
  let t = 0;
  whileVisible(el, (dt) => {
    const dur = s.mode === "bezier" ? 1.1 : samples.length / 60;
    t = (t + dt) % (dur + 0.8);
    const k = Math.min(1, t / dur);
    const y = s.mode === "bezier" ? fn(k) : samples[Math.min(samples.length - 1, Math.floor(k * (samples.length - 1)))];
    dot.style.transform = `translateX(${y * (track.clientWidth - 44)}px)`;
  });
  recompute();
}
