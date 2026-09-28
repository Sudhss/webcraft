/* The visuals. Each is its own module, loaded the first time it's needed. */

const LOAD = {
  frames: () => import("./frames.js"),
  boxmodel: () => import("./boxmodel.js"),
  flex: () => import("./flex.js"),
  grid: () => import("./grid.js"),
  specificity: () => import("./specificity.js"),
  easing: () => import("./easing.js"),
  damping: () => import("./damping.js"),
  framebudget: () => import("./framebudget.js"),
  waterfall: () => import("./waterfall.js"),
  gitgraph: () => import("./gitgraph.js"),
  reconcile: () => import("./reconcile.js"),
  contrast: () => import("./contrast.js"),
  typescale: () => import("./typescale.js"),
};

export function mountViz(el, name, props) {
  const load = LOAD[name];
  if (!load) {
    el.textContent = `Unknown visual: ${name}`;
    return;
  }
  el.classList.add(name);
  el.innerHTML = '<p class="foot">loading...</p>';
  load()
    .then((m) => {
      el.innerHTML = "";
      m.mount(el, props || {});
    })
    .catch((e) => {
      el.textContent = `This visual failed to load: ${e.message}`;
      console.error(e);
    });
}

/** Run fn every frame while el is on screen. Returns a stop function. */
export function whileVisible(el, fn) {
  let raf = 0;
  let on = false;
  let last = performance.now();
  const tick = (now) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    fn(dt, now);
    if (on) raf = requestAnimationFrame(tick);
  };
  const io = new IntersectionObserver((es) => {
    const v = es.some((e) => e.isIntersecting);
    if (v && !on) {
      on = true;
      last = performance.now();
      raf = requestAnimationFrame(tick);
    } else if (!v && on) {
      on = false;
      cancelAnimationFrame(raf);
    }
  });
  io.observe(el);
  return () => {
    on = false;
    cancelAnimationFrame(raf);
    io.disconnect();
  };
}

export const h = (html) => {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
};
