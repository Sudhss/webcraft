/* Diffing a list: by index (no keys) vs by key. Counts the DOM operations
 * each needs; keyed moves use the longest increasing subsequence, the same
 * trick real frameworks use to move the fewest nodes. */

import { esc } from "../md.js";

function lis(arr) {
  const tails = [];
  const idx = [];
  const prev = new Array(arr.length).fill(-1);
  arr.forEach((v, i) => {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (arr[tails[m]] < v) lo = m + 1;
      else hi = m;
    }
    if (lo > 0) prev[i] = tails[lo - 1];
    tails[lo] = i;
    idx[lo] = i;
  });
  const out = new Set();
  let k = tails[tails.length - 1];
  while (k !== undefined && k >= 0) {
    out.add(k);
    k = prev[k];
  }
  return out;
}

export function mount(el, { before = ["a", "b", "c", "d", "e"], after = ["e", "a", "b", "x", "c", "d"] }) {
  el.innerHTML = `<div class="controls" style="display:grid;grid-template-columns:auto 1fr;gap:8px 12px"><span>before</span><input type="text" data-k="before" value="${before.join(" ")}"><span>after</span><input type="text" data-k="after" value="${after.join(" ")}"></div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px"><div data-out="index"></div><div data-out="keyed"></div></div>`;
  const s = { before, after };
  const box = (k, cls, tip) => `<span title="${tip}" style="display:inline-grid;place-items:center;min-width:34px;height:34px;margin:3px;padding:0 8px;border-radius:6px;font:600 13px var(--mono);border:1px solid var(--line-2);${cls}">${esc(k)}</span>`;
  const STY = {
    keep: "background:var(--bg-3)",
    patch: "background:rgba(245,194,107,.25);border-color:#f5c26b",
    move: "background:rgba(134,182,255,.22);border-color:#86b6ff",
    add: "background:var(--good-bg);border-color:var(--good)",
    del: "background:var(--bad-bg);border-color:var(--bad);text-decoration:line-through",
  };
  function draw() {
    const A = s.before;
    const B = s.after;
    // By index: position i is "the same node"; any key change is a patch.
    let ops = 0;
    const idxRow = B.map((k, i) => {
      if (i >= A.length) {
        ops += 1;
        return box(k, STY.add, "created");
      }
      if (A[i] !== k) {
        ops += 1;
        return box(k, STY.patch, `node ${i} rewritten from ${A[i]} to ${k}`);
      }
      return box(k, STY.keep, "untouched");
    });
    const dels = A.slice(B.length).map((k) => box(k, STY.del, "removed"));
    ops += dels.length;
    el.querySelector('[data-out="index"]').innerHTML = `<h5 class="label">By index (no keys): ${ops} DOM operations</h5><div>${idxRow.join("")}${dels.join("")}</div><p class="foot">Every node after the first change gets rewritten, and any state inside it (an input's text, focus, a playing video) now belongs to the wrong item.</p>`;
    // By key: keep nodes whose keys survive; move the fewest (outside the LIS).
    const pos = new Map(A.map((k, i) => [k, i]));
    const surviving = B.filter((k) => pos.has(k));
    const seq = surviving.map((k) => pos.get(k));
    const stay = lis(seq);
    let kops = 0;
    let j = 0;
    const keyRow = B.map((k) => {
      if (!pos.has(k)) {
        kops += 1;
        return box(k, STY.add, "created");
      }
      const keep = stay.has(j);
      j += 1;
      if (!keep) kops += 1;
      return box(k, keep ? STY.keep : STY.move, keep ? "stays put" : "moved");
    });
    const kdel = A.filter((k) => !B.includes(k)).map((k) => box(k, STY.del, "removed"));
    kops += kdel.length;
    el.querySelector('[data-out="keyed"]').innerHTML = `<h5 class="label">By key: ${kops} DOM operations</h5><div>${keyRow.join("")}${kdel.join("")}</div><p class="foot">Nodes are matched by key; only items outside the longest increasing run move. Yellow: rewritten, blue: moved, green: created, red: removed.</p>`;
  }
  el.querySelectorAll("[data-k]").forEach((i) => {
    i.addEventListener("input", () => {
      s[i.dataset.k] = i.value.split(/[\s,]+/).filter(Boolean);
      draw();
    });
    i.addEventListener("keydown", (e) => e.stopPropagation());
  });
  draw();
}
