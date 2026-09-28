/* The home-page hero: one request's trip from the address bar to pixels,
 * drawn as a path that a packet travels. Every stage links to the chapter
 * that explains it. Returns a stop function. */

const COLS = [90, 280, 470];
const ROWS = [62, 177, 292, 407];
const R = (ROWS[1] - ROWS[0]) / 2;
const ARC = Math.PI * R;
const ROW = COLS[2] - COLS[0] + ARC;

// [name, caption, chapter id], in travel order; odd rows run right to left.
const STAGES = [
  ["Keystroke", "a URL, typed", "url-to-response"],
  ["DNS", "name to address", "url-to-response"],
  ["TCP + TLS", "a pipe, then keys", "url-to-response"],
  ["HTTP", "request, response", "url-to-response"],
  ["Parse", "bytes to tokens", "html"],
  ["DOM", "a live tree", "dom-apis"],
  ["Style", "the cascade", "css-cascade"],
  ["Layout", "boxes get geometry", "css-layout"],
  ["Paint", "display lists", "rendering-pipeline"],
  ["Raster", "tiles on the GPU", "rendering-pipeline"],
  ["Composite", "layers, stacked", "rendering-pipeline"],
  ["Pixels", "light on glass", "rendering-pipeline"],
];

const d = `M${COLS[0]} ${ROWS[0]}H${COLS[2]}A${R} ${R} 0 0 1 ${COLS[2]} ${ROWS[1]}H${COLS[0]}A${R} ${R} 0 0 0 ${COLS[0]} ${ROWS[2]}H${COLS[2]}A${R} ${R} 0 0 1 ${COLS[2]} ${ROWS[3]}H${COLS[0]}`;
const LENGTH = 3 * ROW + (COLS[2] - COLS[0]);

export function pipeline(host, { reduced = false } = {}) {
  const nodes = STAGES.map(([name, cap, id], i) => {
    const row = Math.floor(i / 3);
    const col = row % 2 ? 2 - (i % 3) : i % 3;
    return { name, cap, id, x: COLS[col], y: ROWS[row], at: row * ROW + (i % 3) * (COLS[1] - COLS[0]) };
  });
  host.innerHTML = `<svg class="pipeline" viewBox="0 0 560 487" role="img" aria-label="The path of one page load: ${STAGES.map((s) => s[0]).join(", ")}">
    <path class="pl-track" d="${d}"/>
    <path class="pl-trail" d="${d}" pathLength="${LENGTH}"/>
    ${nodes
      .map(
        (n) => `<a href="#/c/${n.id}" class="pl-node">
        <title>${n.name}: ${n.cap}</title>
        <circle class="pl-hit" cx="${n.x}" cy="${n.y}" r="34"/>
        <circle class="pl-dot" cx="${n.x}" cy="${n.y}" r="7"/>
        <text class="pl-name" x="${n.x}" y="${n.y + 30}">${n.name}</text>
        <text class="pl-cap" x="${n.x}" y="${n.y + 46}">${n.cap}</text>
      </a>`
      )
      .join("")}
    <circle class="pl-glow" r="13"/>
    <circle class="pl-packet" r="5"/>
  </svg>`;
  const svg = host.firstElementChild;
  const track = svg.querySelector(".pl-track");
  const trail = svg.querySelector(".pl-trail");
  const glow = svg.querySelector(".pl-glow");
  const packet = svg.querySelector(".pl-packet");
  const els = [...svg.querySelectorAll(".pl-node")];

  if (reduced) {
    svg.classList.add("still");
    els.forEach((e) => e.classList.add("lit"));
    return () => {};
  }

  const TRAVEL = 9000;
  const HOLD = 1400;
  const TAIL = 220;
  let raf = 0;
  let t0 = performance.now();
  let pausedAt = 0;
  const frame = (now) => {
    const t = (now - t0) % (TRAVEL + HOLD);
    // Ease inside each hop so the packet slows at every stage.
    const lin = Math.min(1, t / TRAVEL) * LENGTH;
    let k = 0;
    while (k < nodes.length - 2 && lin >= nodes[k + 1].at) k++;
    const a = nodes[k].at;
    const b = nodes[k + 1].at;
    const u = (lin - a) / (b - a);
    const pos = Math.min(LENGTH, a + (b - a) * (0.55 * u + 0.45 * u * u * (3 - 2 * u)));
    const p = track.getPointAtLength(pos);
    packet.setAttribute("cx", p.x);
    packet.setAttribute("cy", p.y);
    glow.setAttribute("cx", p.x);
    glow.setAttribute("cy", p.y);
    const tail = Math.min(TAIL, pos);
    trail.style.strokeDasharray = `${tail} ${LENGTH}`;
    trail.style.strokeDashoffset = `${-(pos - tail)}`;
    const fade = t > TRAVEL ? 1 - (t - TRAVEL) / HOLD : 1;
    packet.style.opacity = glow.style.opacity = fade;
    nodes.forEach((n, i) => els[i].classList.toggle("lit", pos >= n.at - 1 && t < TRAVEL + HOLD * 0.8));
    raf = requestAnimationFrame(frame);
  };
  const io = new IntersectionObserver(([e]) => {
    if (e.isIntersecting && !raf) {
      t0 += pausedAt ? performance.now() - pausedAt : 0;
      raf = requestAnimationFrame(frame);
    } else if (!e.isIntersecting && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
      pausedAt = performance.now();
    }
  });
  io.observe(svg);
  return () => {
    cancelAnimationFrame(raf);
    io.disconnect();
  };
}
