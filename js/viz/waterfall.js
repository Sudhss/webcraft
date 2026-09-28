/* A page load, modelled: one HTML document then N assets. Toggle the
 * protocol, distance to the server, a CDN and keep-alive, and watch where
 * the time goes. A model with honest round-trip arithmetic, not a trace. */

export function mount(el) {
  const s = { proto: "h1", rtt: 120, cdn: false, keep: true, assets: 14, tls: true };
  el.innerHTML = `<div class="controls">
  <label>protocol <select data-k="proto"><option value="h1">HTTP/1.1</option><option value="h2">HTTP/2</option><option value="h3">HTTP/3 (QUIC)</option></select></label>
  <label>round trip <input type="range" min="10" max="300" value="120" data-k="rtt"> <span class="mono" data-v="rtt">120 ms</span></label>
  <label><input type="checkbox" data-k="cdn"> CDN edge nearby (20 ms)</label>
  <label><input type="checkbox" checked data-k="keep"> keep-alive</label>
  <label>assets <input type="range" min="1" max="30" value="14" data-k="assets"></label>
</div>
<svg class="wf" width="100%" viewBox="0 0 1000 420" style="background:var(--bg);border:1px solid var(--line);border-radius:8px"></svg>
<p class="foot mono" data-sum></p>`;
  const svg = el.querySelector("svg");
  const C = { dns: "#86b6ff", tcp: "#f5c26b", tls: "#d7a8ff", wait: "#7e7a73", body: "#7ed69b", queue: "rgba(128,128,128,.25)" };
  function model() {
    const rtt = s.cdn ? 20 : s.rtt;
    const dl = 18; // ms per asset of transfer at a modest bandwidth
    const rows = [];
    let t = 0;
    const dns = rtt; // one resolver round trip, uncached
    const hand = s.proto === "h3" ? rtt : rtt * (s.tls ? 2 : 1); // QUIC folds TCP+TLS into 1 RTT; TCP+TLS1.3 is 2
    rows.push({ name: "index.html", segs: [["dns", t, dns], ["tcp", t + dns, s.proto === "h3" ? 0 : rtt], ["tls", t + dns + (s.proto === "h3" ? 0 : rtt), s.proto === "h3" ? rtt : s.tls ? rtt : 0], ["wait", t + dns + hand, rtt], ["body", t + dns + hand + rtt, dl * 2]] });
    t = dns + hand + rtt + dl * 2;
    const conns = s.proto === "h1" ? 6 : 1;
    const free = Array.from({ length: conns }, (_, i) => ({ at: t, warm: i === 0 && s.keep }));
    for (let i = 0; i < s.assets; i += 1) {
      let segs = [];
      if (s.proto === "h1") {
        free.sort((a, b) => a.at - b.at);
        const c = free[0];
        const start = c.at;
        if (start > t) segs.push(["queue", t, start - t]);
        let x = start;
        if (!c.warm) {
          segs.push(["tcp", x, rtt]);
          x += rtt;
          if (s.tls) {
            segs.push(["tls", x, rtt]);
            x += rtt;
          }
          c.warm = s.keep;
        }
        segs.push(["wait", x, rtt], ["body", x + rtt, dl]);
        c.at = x + rtt + dl;
      } else {
        // One connection, all requests in flight together; bodies share the pipe.
        segs.push(["wait", t, rtt], ["body", t + rtt + i * (dl * 0.55), dl]);
      }
      rows.push({ name: `asset-${i + 1}.${["js", "css", "png", "woff2"][i % 4]}`, segs });
    }
    return rows;
  }
  function draw() {
    const rows = model();
    const end = Math.max(...rows.flatMap((r) => r.segs.map(([, a, d]) => a + d)));
    const W = 1000 - 150;
    const rowH = Math.min(24, 380 / rows.length);
    const x = (ms) => 150 + (ms / end) * (W - 10);
    svg.innerHTML =
      rows
        .map((r, i) => {
          const y = 14 + i * rowH;
          return `<text x="8" y="${y + rowH * 0.6}" font-size="${Math.min(13, rowH * 0.6)}" fill="currentColor" style="color:var(--text-3)" font-family="JetBrains Mono, monospace">${r.name}</text>` + r.segs.filter(([, , d]) => d > 0).map(([k, a, d]) => `<rect x="${x(a)}" y="${y}" width="${Math.max(1, x(a + d) - x(a))}" height="${rowH * 0.7}" rx="2" fill="${C[k]}"><title>${k}: ${Math.round(d)} ms</title></rect>`).join("");
        })
        .join("") + `<text x="${1000 - 10}" y="410" text-anchor="end" font-size="13" fill="currentColor" style="color:var(--text-3)" font-family="JetBrains Mono, monospace">${Math.round(end)} ms total</text>`;
    el.querySelector("[data-sum]").innerHTML = `<span style="color:${C.dns}">dns</span>  <span style="color:${C.tcp}">tcp</span>  <span style="color:${C.tls}">tls</span>  <span style="color:${C.wait}">waiting (ttfb)</span>  <span style="color:${C.body}">download</span>  <span>grey: queued for a free connection</span>`;
  }
  el.querySelectorAll("[data-k]").forEach((i) =>
    i.addEventListener("input", () => {
      const k = i.dataset.k;
      s[k] = i.type === "checkbox" ? i.checked : i.type === "range" ? Number(i.value) : i.value;
      const v = el.querySelector(`[data-v="${k}"]`);
      if (v) v.textContent = `${i.value} ms`;
      draw();
    })
  );
  draw();
}
