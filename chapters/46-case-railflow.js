const raw = String.raw;

const DETERMINISM_PLAY = raw`// A toy of RailFlow's tick: fixed 1-minute steps, speed from load, travel
// time carried across station boundaries. No clock, no randomness.
const sections = [ // km, line speed, capacity
  { km: 1.5, v: 110, cap: 2 }, { km: 18, v: 100, cap: 2 },
  { km: 6, v: 90, cap: 1 }, { km: 40, v: 110, cap: 2 },
];
const NOISE = false; // set true: a little Math.random() in the speed

function effectiveSpeed(t, s, load) {
  let v = Math.min(t.vmax, s.v);
  if (load > 1) v /= load; else if (load >= 0.7) v *= 0.85;
  if (NOISE) v *= 0.98 + Math.random() * 0.04;
  return v;
}

function run(ticks) {
  const trains = [{ vmax: 120, sec: 0, p: 0 }, { vmax: 65, sec: 0, p: 0 }, { vmax: 80, sec: 0, p: 0 }];
  const log = [];
  for (let tick = 0; tick < ticks; tick++) {
    const occ = {};                                   // one reading per tick
    for (const t of trains) occ[t.sec] = (occ[t.sec] || 0) + 1;
    for (const t of trains) {
      let minutes = 1;
      while (minutes > 1e-9 && t.sec < sections.length) {
        const s = sections[t.sec];
        const v = effectiveSpeed(t, s, occ[t.sec] / s.cap);
        const kmToNode = (1 - t.p) * s.km, kmAvail = (v / 60) * minutes;
        if (kmAvail < kmToNode) { t.p += kmAvail / s.km; break; }
        minutes -= kmToNode / (v / 60);              // carry the leftover time
        t.sec += 1; t.p = 0;
      }
    }
    log.push(trains.map((t) => t.sec + ':' + t.p.toFixed(6)).join('|'));
  }
  return log.join('\n');
}

function hash(str) { let h = 2166136261; for (const c of str) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0).toString(16); }
const a = run(60), b = run(60);
console.log('run 1', hash(a));
console.log('run 2', hash(b));
console.log(a === b ? 'identical: a bug seen once is a bug you can replay' : 'runs differ: averaging them now means something');
console.log('tick 10:', a.split('\n')[9]);`;

const DIJKSTRA_PLAY = raw`// RailFlow's edge weight is minutes, inflated by load (graph.py dynamic_weight).
function weight(e, trains) {
  if (e.blocked) return Infinity;
  const base = e.km / e.speed * 60;
  const r = trains / e.cap;
  const m = r <= 0.7 ? 1 : r <= 1 ? 1 + (r - 0.7) * 1.4 : r * 2;
  return base * m;
}

// A main line A-B-C-D and a slower loop B-E-C round the middle.
const edges = [
  { id: 'A-B', a: 'A', b: 'B', km: 30, speed: 110, cap: 2 },
  { id: 'B-C', a: 'B', b: 'C', km: 40, speed: 110, cap: 2 },
  { id: 'C-D', a: 'C', b: 'D', km: 30, speed: 110, cap: 2 },
  { id: 'B-E', a: 'B', b: 'E', km: 30, speed: 80, cap: 1 },
  { id: 'E-C', a: 'E', b: 'C', km: 25, speed: 80, cap: 1 },
];
const occupancy = { 'B-C': 3 };   // try 0, 1, 2, 3, 4; or set blocked on B-C

function dijkstra(src, dst) {
  const dist = { [src]: 0 }, prev = {}, done = new Set();
  while (true) {
    let u = null;                                    // tiny graph: linear scan
    for (const n in dist) if (!done.has(n) && (u === null || dist[n] < dist[u])) u = n;
    if (u === null || u === dst) break;
    done.add(u);
    for (const e of edges) {
      const v = e.a === u ? e.b : e.b === u ? e.a : null;
      if (!v) continue;
      const c = dist[u] + weight(e, occupancy[e.id] || 0);
      if (c < (dist[v] ?? Infinity)) { dist[v] = c; prev[v] = u; }
    }
  }
  if (dist[dst] === undefined || dist[dst] === Infinity) return null;
  const path = [dst];
  while (path[0] !== src) path.unshift(prev[path[0]]);
  return { path: path.join('-'), minutes: dist[dst].toFixed(1) };
}

for (const e of edges) console.log(e.id.padEnd(4), 'weight', weight(e, occupancy[e.id] || 0).toFixed(1), 'min');
console.log('route', JSON.stringify(dijkstra('A', 'D')));`;

const FLOAT_PLAY = raw`// The corridor view maps ~500 km onto 420 world units (0.84 units per km).
const UNITS_PER_KM = 420 / 500;
const toMetres = (u) => (u / UNITS_PER_KM) * 1000;
const f = Math.fround; // round to float32, like a GPU attribute or uniform

// Smallest step a float32 can take near a value, in metres.
function gridAt(x) { const a = f(x); let b = f(a + a * 2 ** -24); if (b === a) b = f(a + a * 2 ** -23); return toMetres(b - a); }

for (const x of [0.3, 5, 50, 210]) console.log('near', String(x).padStart(4), 'units, float32 grid', gridAt(x).toFixed(6), 'm');

// A rail 0.837 m from the centreline (half of a 1.676 m gauge),
// on a train 210 units out, seen from a camera parked beside it.
const rail = 210 + 0.000837 * UNITS_PER_KM;          // 0.837 m = 0.000837 km
const cam = 209.9;
const exact = toMetres(rail - cam);
const absolute = toMetres(f(f(rail) - f(cam)));        // both stored big, subtract late
const recentred = toMetres(f(rail - cam));              // subtract in float64 first
console.log('exact offset   ', exact.toFixed(4), 'm');
console.log('absolute coords', absolute.toFixed(4), 'm, error', (absolute - exact).toFixed(4));
console.log('recentred      ', recentred.toFixed(4), 'm, error', (recentred - exact).toFixed(4));`;

const DEAD_RECKON_PLAY = raw`const LATE = false;   // true: each snapshot arrives 0-700 ms late
const TICK = 1000;    // the server sends one snapshot per second
const cv = document.querySelector('canvas'), out = document.getElementById('out');
const W = cv.width = cv.clientWidth, H = cv.height = cv.clientHeight, ctx = cv.getContext('2d');

// The "server": true position (0..1 wraps) and speed, units per second.
const truth = { p: 0, v: 0 };
function speedAt(t) { return (t % 9) < 2 ? 0 : 0.07 + 0.05 * Math.sin(t * 0.8); } // stops every 9 s
let last = null;          // last snapshot the client has
let prev = null;          // the one before it, for interpolation
let arrived = 0;
setInterval(() => {
  const snap = { p: truth.p, v: truth.v };
  setTimeout(() => { prev = last; last = snap; arrived = performance.now(); reconcile(snap); }, LATE ? Math.random() * 700 : 0);
}, TICK);

const wrap = (d) => ((d % 1) + 1.5) % 1 - 0.5;           // shortest signed gap on a loop
const dr = { p: 0, v: 0, err: 0 };
function reconcile(s) { dr.v = s.v; dr.err = wrap(s.p - dr.p); }

const errs = { snap: 0, lerp: 0, dead: 0 };
let t0 = performance.now(), then = t0;
function frame(now) {
  const dt = Math.min(0.1, (now - then) / 1000); then = now;
  truth.v = speedAt((now - t0) / 1000); truth.p = (truth.p + truth.v * dt) % 1;

  const snap = last ? last.p : 0;
  const k = Math.min(1, (now - arrived) / TICK);
  const lerp = last && prev ? (prev.p + wrap(last.p - prev.p) * k + 1) % 1 : snap;
  dr.p += dr.v * dt;                                     // predict
  const c = dr.err * (1 - Math.exp(-6 * dt)); dr.p += c; dr.err -= c; // bleed off the error
  dr.p = (dr.p + 1) % 1;

  const rows = [['snap', snap], ['lerp', lerp], ['dead', dr.p]];
  ctx.fillStyle = '#14161a'; ctx.fillRect(0, 0, W, H);
  rows.forEach(([name, p], i) => {
    const y = (i + 0.5) * H / 3;
    errs[name] += (Math.abs(wrap(p - truth.p)) - errs[name]) * 0.02;
    ctx.fillStyle = '#333'; ctx.fillRect(0, y - 1, W, 2);
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(truth.p * W - 14, y - 7, 28, 14);
    ctx.fillStyle = ['#ff9d45', '#4cc2ff', '#9cf29c'][i]; ctx.fillRect(p * W - 12, y - 5, 24, 10);
    ctx.fillStyle = '#ccc'; ctx.font = '12px system-ui'; ctx.fillText(name, 6, y - 10);
  });
  out.textContent = 'mean error (track lengths): snap ' + errs.snap.toFixed(3) + '  lerp ' + errs.lerp.toFixed(3) + '  dead reckoning ' + errs.dead.toFixed(3);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);`;

const REBUILD_JS = raw`// A 1 Hz feed of one train. Right now the view only snaps to each snapshot.
const TICK = 1000, LATE = false;
const cv = document.querySelector('canvas'), out = document.getElementById('out');
const W = cv.width = cv.clientWidth, H = cv.height = cv.clientHeight, ctx = cv.getContext('2d');

// --- server side: do not edit ----------------------------------------------
const route = [0.0, 0.3, 0.55, 1.0];          // stations along the line (0..1)
const truth = { p: 0, v: 0, status: 'moving' };
let dwellUntil = 0, nextStop = 1;
function stepTruth(now, dt) {
  if (truth.status === 'dwelling') { if (now > dwellUntil) truth.status = 'moving'; truth.v = 0; return; }
  truth.v = 0.06;                              // track lengths per second
  truth.p += truth.v * dt;
  if (truth.p >= route[nextStop]) {
    truth.p = route[nextStop]; nextStop += 1;
    if (nextStop >= route.length) { truth.p = 0; nextStop = 1; }
    else { truth.status = 'dwelling'; dwellUntil = now + 2500; }
  }
}
setInterval(() => {
  const s = { ...truth, sentAt: performance.now() };
  setTimeout(() => onSnapshot(s), LATE ? Math.random() * 700 : 0);
}, TICK);
// ---------------------------------------------------------------------------

const view = { p: 0, v: 0, status: 'moving', err: 0 };
function onSnapshot(s) {
  // TODO 1: keep the prediction, store the drift in view.err instead of snapping.
  // TODO 2: a big jump (the loop restarting) is a new section: snap and zero err.
  view.p = s.p; view.v = s.v; view.status = s.status;
}
function integrate(dt) {
  // TODO 3: advance view.p by view.v * dt while moving.
  // TODO 4: bleed view.err off with 1 - Math.exp(-6 * dt).
}

let then = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - then) / 1000); then = now;
  stepTruth(now, dt); integrate(dt);
  ctx.fillStyle = '#14161a'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#444'; ctx.fillRect(20, H / 2 - 1, W - 40, 2);
  for (const r of route) { ctx.fillStyle = '#888'; ctx.fillRect(20 + r * (W - 40) - 2, H / 2 - 10, 4, 20); }
  ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(20 + truth.p * (W - 40) - 14, H / 2 - 8, 28, 16);
  ctx.fillStyle = '#9cf29c'; ctx.fillRect(20 + view.p * (W - 40) - 12, H / 2 - 6, 24, 12);
  out.textContent = 'ghost = server truth, green = what you draw. error ' + Math.abs(view.p - truth.p).toFixed(3);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);`;

export default {
  id: "case-railflow",
  n: 46,
  part: "H",
  title: "Case study: RailFlow",
  hook: "A railway simulator with a dispatcher and a 3D view, taken apart file by file, including the numbers that don't hold up.",
  minutes: 100,
  levels: ["use", "understand", "rebuild"],
  sections: [
    {
      title: "One process, one railway",
      beats: [
        { t: "say", x: "RailFlow simulates train traffic on a Delhi to Lucknow network: 36 stations, 42 sections, a dispatcher that reroutes trains, and a console that draws it all in WebGL. Python and FastAPI on the back, React and Three.js on the front." },
        {
          t: "table",
          head: ["Piece", "File", "Job"],
          rows: [
            ["Tick loop", "backend/simulation.py", "advance every train one simulated minute"],
            ["Graph", "backend/graph.py", "stations, sections, Dijkstra over a live cost"],
            ["Controller", "backend/agent.py", "propose one action per tick, gate it"],
            ["API and stream", "backend/main.py", "25 HTTP routes, one WebSocket, role checks"],
            ["Live link", "frontend/src/state/useRailflowStream.js", "reconnect, staleness, sign-out on 1008"],
            ["Corridor engine", "frontend/src/corridor/*.js", "dead reckoning, arc length, shaders"],
          ],
        },
        {
          t: "code",
          lang: "python",
          file: "backend/main.py",
          src: "async def simulation_loop() -> None:\n    while True:\n        interval = simulation.tick_interval_seconds\n        if IDLE_PAUSE and not manager.active:\n            await asyncio.sleep(interval)   # nobody watching: hold the clock\n            continue\n        try:\n            async with state_lock:\n                simulation.advance_tick()\n                payload = {\"type\": \"state_update\", **simulation.snapshot()}\n                interval = simulation.tick_interval_seconds\n            await manager.broadcast(payload)\n        except asyncio.CancelledError:\n            raise\n        except Exception:\n            logger.exception(\"Simulation tick failed; continuing.\")\n        await asyncio.sleep(interval)",
          mark: [8, 9, 10, 12],
          note: "Trimmed. The lock covers the tick and the snapshot; the broadcast happens outside it, so a slow socket never blocks a REST command.",
        },
        { t: "say", h: "State lives in one object", x: "The whole railway is one in-memory `RailFlowSimulation` behind one `asyncio.Lock`. Every REST mutation takes the same lock, so a command never lands halfway through a tick." },
        {
          t: "quiz",
          q: "The Dockerfile runs uvicorn with one worker, on purpose. What would `--workers 4` do to RailFlow?",
          options: ["Four times the throughput, same railway", "Four separate railways, each with its own trains, and clients see whichever worker they hit", "A deadlock on the asyncio lock", "Nothing; FastAPI shares module state across workers"],
          answer: 1,
          why: "Workers are processes. Each imports `main.py` and builds its own simulation, so a stop sent to one never reaches the others. The Dockerfile comment says it: a second worker would be a second, divergent railway.",
        },
        {
          t: "pitfall",
          h: "A background loop that dies freezes a 'live' UI",
          x: "If one tick raises and the task ends, the sockets stay open and the console shows a frozen board labelled Live. RailFlow catches everything except cancellation inside the loop, logs a `system_error` entry, and keeps ticking.",
        },
      ],
    },
    {
      title: "The model: fixed ticks, no dice",
      beats: [
        { t: "say", x: "One tick is one simulated minute (`SIM_TICK_MINUTES = 1`). Real time between ticks is a separate knob, 1 s by default, clamped to 0.2 to 5 s. Nothing in the backend tick path reads a clock or a random number." },
        {
          t: "code",
          lang: "python",
          file: "backend/simulation.py",
          src: "@staticmethod\ndef _effective_speed(train, edge, occupancy) -> float:\n    \"\"\"Track speed limit, train capability and congestion, in km/h. Pure.\"\"\"\n    load_ratio = occupancy.get(edge.id, 0) / max(1, edge.capacity)\n    speed = min(train.max_speed, edge.effective_speed_limit)\n    if load_ratio > 1:\n        speed *= 1 / load_ratio\n    elif load_ratio >= 0.7:\n        speed *= 0.85\n    return round(max(0.0, speed), 2)",
          mark: [5, 6, 7, 8, 9],
          note: "Occupancy is read once per tick, before any train moves, so every train's speed is decided against the same network state.",
        },
        {
          t: "predict",
          lang: "text",
          src: "Train max_speed 120 km/h\nSection: line speed 100 km/h, capacity 2\nTrains on the section this tick: 3",
          q: "What does `_effective_speed` return?",
          options: ["100.0", "85.0", "66.67", "40.0"],
          answer: 2,
          why: "min(120, 100) = 100. Load is 3 / 2 = 1.5, over 1, so speed is 100 / 1.5 = 66.67. The 0.85 branch only applies between 0.7 and 1.0.",
        },
        {
          t: "code",
          lang: "python",
          file: "backend/simulation.py",
          src: "minutes_left = float(SIM_TICK_MINUTES)\nfor _ in range(self.MAX_SECTIONS_PER_TICK):   # 8\n    ...\n    speed = self._effective_speed(train, edge, occupancy)\n    km_per_minute = speed / 60.0\n    km_to_node = max(0.0, (1.0 - train.edge_progress)) * edge.distance_km\n    km_available = km_per_minute * minutes_left\n\n    if km_available < km_to_node:\n        train.edge_progress += km_available / edge.distance_km\n        return\n\n    minutes_left -= km_to_node / km_per_minute   # carry leftover time\n    train.edge_progress = 1.0\n    self._arrive_at_next_station(train)",
          mark: [9, 13],
          note: "The integrator spends time, not distance. A superfast covering 2 km per tick across a 1.5 km section carries the rest onto the next one at that section's speed.",
        },
        {
          t: "pitfall",
          h: "Clamping progress at the node loses distance",
          x: "The naive version sets progress to 1 and stops for the tick, so a fast train loses up to a minute at every station it passes, and it is worse on short sections. The selftest has a check for it: 'travel carries over a node boundary'.",
        },
        { t: "say", h: "Determinism is a feature you can test", x: "Same seed scenario, same commands, same ticks: same railway, bit for bit. We hashed every snapshot of 600 ticks of a benchmark scenario, twice, and got the same hash both times. That makes every bug replayable." },
        {
          t: "play",
          mode: "js",
          title: "Run it twice, compare hashes",
          js: DETERMINISM_PLAY,
          task: "Run it: two identical hashes. Set NOISE to true and run again. Then change one train's vmax and watch the tick 10 line change.",
        },
        {
          t: "pitfall",
          h: "Averaging five runs of a deterministic sim",
          x: "`benchmark.py` sets `SIM_RUNS = 5` 'for stable avg'. The sim has no randomness, so the five runs are identical: we got 1353 total delay five times for `peak_hour_mixed`. Repeats only mean something once you inject variation on purpose.",
        },
      ],
    },
    {
      title: "Routing: Dijkstra on minutes, not kilometres",
      beats: [
        { t: "say", x: "Map routing minimises distance. RailFlow minimises expected minutes, and the cost of a section goes up with the trains on it right now. Changing what the weight means is what turns shortest path into traffic control." },
        {
          t: "code",
          lang: "python",
          file: "backend/graph.py",
          src: "def dynamic_weight(self, edge: Edge, trains_on_edge: int = 0) -> float:\n    if edge.blocked:\n        return math.inf\n\n    base_minutes = edge.distance_km / edge.effective_speed_limit * 60.0\n    load_ratio = trains_on_edge / max(1, edge.capacity)\n    if load_ratio <= 0.7:\n        congestion_multiplier = 1.0\n    elif load_ratio <= 1.0:\n        congestion_multiplier = 1.0 + (load_ratio - 0.7) * 1.4\n    else:\n        congestion_multiplier = load_ratio * 2.0\n    return base_minutes * congestion_multiplier",
          mark: [3, 10, 12],
          note: "Dijkstra itself is a textbook binary heap with lazy deletion (`heapq`). A blocked section is infinite and skipped, so closures route around themselves.",
        },
        {
          t: "predict",
          lang: "text",
          src: "Section: 60 km, line speed 120 km/h, capacity 2\ntrains on it:  1   ->  ?\n               2   ->  ?\n               3   ->  ?",
          q: "What weights does `dynamic_weight` give, in minutes?",
          options: ["30, 30, 30", "30, 42.6, 90", "30, 60, 90", "30, 42.6, 63.9"],
          answer: 1,
          why: "Base is 30 min. Load 0.5: x1. Load 1.0: 1 + 0.3 x 1.4 = 1.42, so 42.6. Load 1.5: 1.5 x 2 = 3, so 90. Note the jump: just past full, the multiplier leaps from 1.42 to over 2.",
        },
        {
          t: "play",
          mode: "js",
          title: "Congestion weights on a toy graph",
          js: DIJKSTRA_PLAY,
          task: "Step the B-C occupancy from 0 to 4. At which count does the route leave the main line? Then block B-C and confirm the loop still gets you to D.",
        },
        {
          t: "quiz",
          q: "Rerouting a train moves load off one section and onto another, which changes the weights the next Dijkstra call sees. Without `REROUTE_COOLDOWN_TICKS = 8`, what would you expect?",
          options: ["Nothing; Dijkstra is optimal so routes are stable", "Flapping: trains swap between two lines tick after tick as each move makes the other line look cheaper", "Deadlock in the asyncio lock", "Trains would never reroute at all"],
          answer: 1,
          why: "The weight is a feedback loop: routing changes occupancy, occupancy changes weights. The 1.42 to 2.0 jump at capacity makes it sharper. A cooldown (hysteresis) is the standard damper; RailFlow skips any train rerouted in the last 8 ticks.",
        },
        {
          t: "pitfall",
          h: "A route that revisits a station never finishes",
          x: "A manual route through the same station twice once made a train loop forever: arrival looked up the first occurrence in the route and jumped back. Now `validate_route` rejects repeats, and arrival searches forward from the current index.",
        },
      ],
    },
    {
      title: "The dispatcher and its gate",
      beats: [
        { t: "say", x: "The controller in `agent.py` makes at most one decision per tick: reroute, hold or stop. It's a rule-based heuristic. There's a PPO hook, but no trained policy ships and the hook calls the heuristic." },
        {
          t: "steps",
          h: "One tick of the heuristic",
          items: [
            "Sort trains by priority, then delay, then id: superfast before freight, late before early.",
            "Skip trains that are done, not yet departed, or rerouted in the last 8 ticks (`REROUTE_COOLDOWN_TICKS`).",
            "Look at the route ahead: any blocked or over-capacity section? If none and delay < 8 min, move on.",
            "Run Dijkstra from the next node. No path at all: propose a hold.",
            "A different, cheaper path, or any different path when the current one is threatened: propose a reroute with projected delay before and after.",
            "No reroute found: on an over-capacity section, propose stopping its lowest-priority train (priority 2 or less).",
          ],
        },
        {
          t: "code",
          lang: "python",
          file: "backend/agent.py",
          src: "if decision is None:\n    return None\ndecision.source = source\nif not self._valid(decision):\n    return None\nif not self._beneficial(decision):\n    return None\nreturn decision\n\ndef _beneficial(self, decision: AgentDecision) -> bool:\n    if decision.decision == \"reroute\":\n        return decision.delay_after < decision.delay_before\n    if decision.decision in {\"hold\", \"stop\"}:\n        return decision.reason in {\"route_unavailable\", \"capacity_relief\"}\n    return True",
          mark: [4, 6, 12, 14],
          note: "Valid first (a reroute must have a new, different route), then beneficial. A reroute is applied only when its projected delay drops.",
        },
        {
          t: "predict",
          lang: "python",
          src: "AgentDecision(decision=\"hold\", reason=\"route_unavailable\",\n              delay_before=12, delay_after=17, ...)",
          q: "Does this pass `_beneficial`?",
          options: ["No: 17 is not less than 12", "Yes: holds are judged by reason, not by the delay numbers", "Only if the train is superfast", "It never reaches the gate"],
          answer: 1,
          why: "Holds and stops are allowed for two named reasons and the delay fields are informational. 'Projected to help' is a rule for reroutes only. Read the gate before you believe a summary of it.",
        },
        {
          t: "quiz",
          q: "`safe_decision` asks the heuristic for one proposal. If the gate rejects it, what happens to the next train in the priority list that tick?",
          options: ["It's tried next", "Nothing: the tick ends with no decision, and the list starts again next tick", "The gate retries with a hold", "The rejected train is put on cooldown so others get a turn"],
          answer: 1,
          why: "The heuristic returns its first candidate, and a rejection returns None. Cooldown is only set when a route is applied. It's conservative, but a train stuck proposing a tie can starve the rest.",
        },
        {
          t: "pitfall",
          h: "The machine released a train a person stopped",
          x: "Once, releasing a system hold could restart a train a dispatcher had stopped. Fix: a dispatcher stop has `hold_reason = None`, only reasons in `SYSTEM_HOLD_REASONS` auto-release, and `stop()` won't let a system hold overwrite a human one.",
        },
      ],
    },
    {
      title: "Reading the benchmark honestly",
      beats: [
        { t: "say", x: "`python -m backend.benchmark` runs six scenarios for 600 ticks each, once with the agent and once with `agent_enabled = False`, through the same tick loop. Same physics in both arms is the right call. We reran it in a copy of the repo." },
        {
          t: "table",
          head: ["Scenario", "Agent delay", "No-agent delay", "On time: agent / none"],
          rows: [
            ["shatabdi_normal (1 train)", "0", "0", "100% / 100%"],
            ["shatabdi_congested (3)", "598", "598", "67% / 67%"],
            ["lucknow_mail_normal (1)", "0", "0", "100% / 100%"],
            ["lucknow_mail_foggy (2)", "0", "0", "100% / 100%"],
            ["peak_hour_mixed (8)", "1353", "2250", "25% / 38%"],
            ["closure_reroute (3)", "0", "1994", "100% / 0%"],
            ["Aggregate", "1951", "4842", "reduction 59.7%"],
          ],
          caption: "Our rerun matches the repo's report: 59.7%. Note peak hour: less total delay, but fewer trains on time.",
        },
        {
          t: "code",
          lang: "python",
          file: "backend/benchmark.py",
          src: "for train in sim.trains.values():\n    if train.status == \"arrived\":\n        arrived += 1\n        total_delay += train.delay\n        if train.delay <= ON_TIME_THRESHOLD_MIN:\n            on_time += 1\n    else:\n        total_delay += train.delay + (ticks - train.scheduled_departure_tick)",
          mark: [8],
          note: "A train still running at tick 600 is charged its delay plus every minute since its departure.",
        },
        {
          t: "predict",
          lang: "text",
          src: "Split the aggregate 'delay' into its two parts:\n  delay counter (train.delay)  +  horizon penalty (line 8)\nagent:     ?  +  ?  = 1951\nno agent:  ?  +  ?  = 4842",
          q: "What did the split show?",
          options: ["Mostly delay counter in both arms", "Agent 758 + 1193, no agent 661 + 4181: the gap is almost all trains not arriving by tick 600", "The penalty is zero; every train arrives", "Agent 0 + 1951"],
          answer: 1,
          why: "16 of 18 trains arrive with the agent, 11 of 18 without. By the delay counter alone the agent arm is slightly higher. The 59.7% measures finishing within 600 ticks, which is worth knowing, and worth saying.",
        },
        {
          t: "pitfall",
          h: "A headline string that isn't computed",
          x: "The report prints '100% on-time vs 0% without agent' as a literal string, not from the results. It happens to match this run. The 82.1% 'interventions replaced' sets 44 agent actions against 246 no-agent section-ticks over capacity: two different units.",
        },
        {
          t: "quiz",
          q: "Which claim does this benchmark actually support?",
          options: ["The agent proves it cuts real-world delay by 59.7%", "In these six scenarios, with this sim, more trains finish within 600 ticks when the agent reroutes", "The agent beats human dispatchers by 82.1%", "The agent is optimal"],
          answer: 1,
          why: "Simulated scenarios, one model, a fixed horizon. The repo also loads 30 days of real delay data, but it's printed beside the sim results, never compared against them. Claim what the experiment measured.",
        },
      ],
    },
    {
      title: "The wire: one snapshot a tick",
      beats: [
        { t: "say", x: "The protocol is the simplest one that works: every tick, the server sends the whole snapshot as JSON with `type: \"state_update\"`. No deltas, no sequence numbers. Commands go over REST, not the socket." },
        {
          t: "code",
          lang: "python",
          file: "backend/main.py",
          src: "@app.websocket(\"/ws\")\nasync def websocket_endpoint(websocket: WebSocket, token: str | None = Query(default=None)):\n    if auth_service.user_for_token(token) is None:\n        # Rejecting before the handshake reaches the browser as an opaque 1006.\n        await websocket.accept()\n        await websocket.close(code=1008, reason=\"Invalid or expired token.\")\n        return\n    await manager.connect(websocket)\n    try:\n        async with state_lock:\n            await websocket.send_json({\"type\": \"state_update\", **simulation.snapshot()})\n        while True:\n            await websocket.receive_text()\n    except WebSocketDisconnect:\n        pass\n    finally:\n        manager.disconnect(websocket)",
          mark: [5, 6, 11],
          note: "Accept, then close with 1008, so the client can tell 'session expired' from 'server down'. A new client gets a full snapshot at once, not after the next tick.",
        },
        {
          t: "viz",
          name: "frames",
          props: {
            cols: ["Client", "Socket", "Server"],
            frames: [
              { cells: [["status: connecting"], ["ws://.../ws?token=..."], ["check token"]], note: "The browser WebSocket API can't set headers, so the token rides in the query string." },
              { cells: [["status: live"], ["open"], ["send full snapshot"]], note: "Valid token: the first frame is the current state, immediately." },
              { cells: [["setSnapshot(payload)"], ["state_update every tick"], ["advance_tick, broadcast"]], note: "One whole snapshot per tick, about once a second by default." },
              { cells: [["status: offline"], ["close 1006"], ["restarted, sessions gone"]], note: "Sessions are in memory, so a restart invalidates every token. The close code alone can't say which failure this is." },
              { cells: [["GET /auth/me"], ["closed"], ["401"]], note: "Before reconnecting, one REST call asks: is my token still good? A 401 signs the operator out instead of retrying forever." },
              { cells: [["backoff 700, 1400, 2800 ms..."], ["closed"], ["unreachable"]], note: "Server just down: retry with capped exponential backoff, up to 15 s between attempts." },
              { cells: [["status: stale"], ["open"], ["loop wedged"]], note: "An open socket isn't a live server. No frame for 12 s marks the board stale, checked every 2 s." },
            ],
          },
        },
        {
          t: "pitfall",
          h: "'Have we ever received a frame' is not 'live'",
          x: "The first version drove its Live badge from 'got a frame once' and never listened for close, so a backend restart left a frozen board labelled Live. Now status comes from the real socket state plus a frame-age watchdog.",
        },
        {
          t: "quiz",
          q: "Every snapshot carries the full graph, all trains and 30 log lines. Why is that fine here, and when would it stop being fine?",
          options: ["It's never fine; always send deltas", "42 sections and a handful of trains at 1 Hz is small; it breaks with thousands of trains, fast ticks or many viewers on thin links", "WebSockets compress JSON for free, so size never matters", "Only fine because there's no auth"],
          answer: 1,
          why: "Full snapshots are idempotent: a missed or late frame is healed by the next one, with no resync protocol. You pay bandwidth for that simplicity. Deltas need sequence numbers and a resync path.",
        },
        {
          t: "pitfall",
          h: "Tokens in query strings end up in logs",
          x: "`?token=` is the usual workaround for headers the WebSocket API can't send, but URLs land in proxy and access logs. RailFlow's tokens are random (`secrets.token_urlsafe(32)`) and die on restart, which limits it. Short-lived tickets are the stronger fix.",
        },
      ],
    },
    {
      title: "Smoothing 1 Hz into 60 fps",
      beats: [
        { t: "say", x: "A snapshot a second gives one position a second: the train jumps, then sits still. Interpolating between the last two snapshots is smooth but draws the train a whole tick behind. RailFlow does a third thing." },
        {
          t: "code",
          lang: "js",
          file: "frontend/src/corridor/physics.js",
          src: "export function reconcile(motion, train) {\n  const serverProgress = Number(train.edge_progress) || 0;\n  const edgeChanged = motion.edgeId !== (train.edge_id || null);\n  motion.status = train.status;\n  motion.targetSpeed = Number(train.current_speed) || 0;\n  if (edgeChanged) {                 // new section: hard cut\n    motion.edgeId = train.edge_id || null;\n    motion.progress = serverProgress;\n    motion.error = 0;\n    return motion;\n  }\n  motion.error = serverProgress - motion.progress;  // keep prediction, note drift\n  return motion;\n}\n\n// in integrate(motion, dt, ...):\nmotion.speed = damp(motion.speed, motion.targetSpeed, 2.2, dt);\nif (!paused && motion.status === \"moving\" && sectionKm > 0) {\n  motion.progress += (motion.speed / 60) * simMinutes(dt, tickIntervalSeconds) / sectionKm;\n}\nconst correction = motion.error * (1 - Math.exp(-6 * dt));\nmotion.progress += correction; motion.error -= correction;\nmotion.progress = Math.max(0, Math.min(1, motion.progress));",
          mark: [12, 19, 21],
          note: "Trimmed. Dead reckoning: predict with the server's own speed/60 km per simulated minute, then bleed the error off with a frame-rate independent exponential.",
        },
        {
          t: "play",
          mode: "html",
          title: "Snap vs interpolate vs dead reckoning",
          html: "<canvas></canvas><p id=\"out\"></p>",
          css: "body { margin: 0; font: 12px system-ui; background: #14161a; color: #ccc; }\ncanvas { display: block; width: 100%; height: 180px; }\n#out { margin: 6px 10px; }",
          js: DEAD_RECKON_PLAY,
          task: "Watch the ghost (truth) against each lane. Then set LATE to true. Which lane suffers most from jitter? Change the 6 in the bleed to 60, then to 0.6.",
        },
        {
          t: "predict",
          lang: "text",
          src: "A train is running at 90 km/h mid-section.\nThe next state_update arrives 600 ms late.",
          q: "What does the train on screen do in RailFlow's view?",
          options: ["Freezes until the frame arrives, then jumps", "Keeps moving at its last known speed, then eases onto the corrected position when the frame lands", "Slides back to the previous snapshot", "Disappears until the stream is marked stale"],
          answer: 1,
          why: "Between frames it is pure prediction. A late frame just means a longer prediction and a bigger `error` to bleed off. If the train had really stopped meanwhile, the correction pulls it back slightly: that small slide is the visible cost.",
        },
        {
          t: "quiz",
          q: "Progress is clamped to 0..1 and a new section is a hard cut. What happens at a station the train runs through without stopping?",
          options: ["It flows smoothly onto the next section", "Its prediction parks at the end of the old section until a snapshot names the new one, then it cuts across", "It overshoots into the next section's geometry", "It reverses"],
          answer: 1,
          why: "The client integrator doesn't know the route, so it can't carry over a node the way the server does. Up to a tick of standing still, then a cut. Teaching the client the next section would fix it.",
        },
        {
          t: "pitfall",
          h: "A background tab makes a huge dt",
          x: "Browsers throttle rAF in hidden tabs; come back and the first dt can be seconds, and the prediction leaps. `scene.js` clamps dt to 0.1 s, so a frame never advances more than 0.1 s of motion, and the next snapshot's correction does the rest.",
        },
      ],
    },
    {
      title: "Six draw calls for a whole region",
      beats: [
        { t: "say", x: "The corridor view puts the whole region in one Three.js scene. The console reads `renderer.info.render.calls` live, and the scene adds six meshes: ground, track, and four `InstancedMesh`es." },
        {
          t: "table",
          head: ["Mesh", "Kind", "Capacity", "Updated"],
          rows: [
            ["ground", "Mesh, custom ShaderMaterial", "1 plane", "uniforms"],
            ["track (all 42 sections)", "Mesh, custom ShaderMaterial", "baked once", "uniforms + data texture"],
            ["stations", "InstancedMesh", "128", "per frame"],
            ["sleepers", "InstancedMesh", "1400", "per frame"],
            ["trains", "InstancedMesh, box body", "128", "per frame"],
            ["signals", "InstancedMesh, 6-sided mast", "96", "per frame"],
          ],
          caption: "From scene.js `_buildGround`, `_buildTrackGeometry` and `_buildInstances`.",
        },
        {
          t: "code",
          lang: "js",
          file: "frontend/src/corridor/scene.js",
          src: "// built once: one RGBA float texel per section\nthis.edgeStateData = new Float32Array(count * 4);\nthis.edgeStateTexture = new DataTexture(this.edgeStateData, count, 1, RGBAFormat, FloatType);\nthis.edgeStateTexture.minFilter = NearestFilter;\n\n// every snapshot\nconst o = index * 4;\nthis.edgeStateData[o] = Number(edge.load_ratio) || 0;\nthis.edgeStateData[o + 1] = edge.blocked ? 1 : 0;\nthis.edgeStateData[o + 2] = this.routeEdges.has(edge.id) ? 1 : 0;\nthis.edgeStateData[o + 3] = edge.speed_limit ? 1 : 0;\nthis.edgeStateTexture.needsUpdate = true;\n\n// track vertex shader: each vertex knows its section index\nvState = texture2D(uEdgeState, vec2((aEdge + 0.5) / uEdgeCount, 0.5));",
          mark: [3, 12, 15],
          note: "42 texels, 168 floats a tick. Colouring a congested section never touches the geometry buffers. The +0.5 samples the texel centre; NearestFilter stops neighbours blending.",
        },
        {
          t: "say", h: "Two layouts in one vertex buffer", x: "Each track vertex carries both the hand-drawn diagram position and the geographic one. Switching layouts animates a uniform; the shader mixes the two. No geometry rebuild, same draw call.",
        },
        {
          t: "pitfall",
          h: "GLSL and JS copies of one function drift apart",
          x: "The layout morph runs in the track shader and in JS for placing trains. When the two disagreed, trains left the rails mid-transition. Now `wave.js` builds the GLSL from the JS constant, and a test asserts the shader contains `WAVE_SPREAD`.",
        },
        { t: "say", h: "Recentring", x: "420 world units hold about 500 km, and the view zooms to a 1.676 m gauge. Instances get `position - origin` in JS doubles before going into float32 matrices; the track shader subtracts `uOrigin` first. The camera then sits near zero." },
        {
          t: "play",
          mode: "js",
          title: "What float32 does to a rail",
          js: FLOAT_PLAY,
          task: "Read the grid sizes: how coarse is float32 210 units out, in metres? Then compare the two ways of computing a rail's offset from a nearby camera.",
        },
        {
          t: "quiz",
          q: "The track's vertex positions are stored as float32 attributes in absolute world units, and the shader subtracts `uOrigin`. What does that recentring fix, and what doesn't it?",
          options: ["It fixes everything; positions become exact", "It stops big camera translations amplifying error in the matrix multiply, but the attribute is still rounded to float32's grid at its absolute position", "Nothing; GPUs use float64 internally", "It only matters for instanced meshes"],
          answer: 1,
          why: "The subtraction itself happens in float32 on already-rounded inputs. Instances do better: JS subtracts in doubles and stores small offsets. Baking geometry relative to local tile origins would close the gap.",
        },
      ],
    },
    {
      title: "Tests, the box, and what's missing",
      beats: [
        {
          t: "table",
          head: ["Suite", "Command", "Our result", "What it covers"],
          rows: [
            ["Corridor geometry and physics", "node --test tests/*.test.js", "38 pass", "arc length, dead reckoning, wave, pan"],
            ["Simulation invariants", "python -m backend.selftest", "57 of 57", "graph, movement, holds, validation, contract"],
            ["of which snapshot keys", "same", "32 of the 57", "field-presence checks"],
          ],
          caption: "95 checks in all (38 unit + 57 invariant), both run in a scratch copy.",
        },
        {
          t: "code",
          lang: "js",
          file: "frontend/tests/corridor.test.js",
          src: "test(\"dead reckoning matches the server integrator over a tick\", () => {\n  const sectionKm = 60;\n  const motion = createTrainMotion({ id: \"T\", edge_id: \"A-B\", edge_progress: 0,\n                                     current_speed: 60, status: \"moving\" });\n  motion.speed = 60;\n  let elapsed = 0;\n  const dt = 1 / 60;\n  while (elapsed < 1 - 1e-9) {\n    integrate(motion, dt, { tickIntervalSeconds: 1, sectionKm, paused: false, reducedMotion: false });\n    elapsed += dt;\n  }\n  // 60 km/h for one simulated minute = 1 km of a 60 km section.\n  assert.ok(Math.abs(motion.progress - 1 / 60) < 1e-3);\n});",
          note: "A cross-language invariant written as one number: the client must cover the distance the Python integrator would. No test dependency; it's the Node test runner.",
        },
        {
          t: "pitfall",
          h: "Count what your checks check",
          x: "'57 invariant checks' sounds like 57 behaviours. 32 of them assert that a key exists in the snapshot. Useful as a contract test, but there's no determinism test, and no check that a reroute lowers delay. Report counts with what they cover.",
        },
        {
          t: "code",
          lang: "dockerfile",
          file: "Dockerfile",
          src: "FROM node:22-alpine AS console\nWORKDIR /build\nCOPY frontend/package.json frontend/package-lock.json ./\nRUN npm ci                      # cached until the lockfile changes\nCOPY frontend/ ./\nRUN npm run build\n\nFROM python:3.13-slim AS runtime\nENV PYTHONUNBUFFERED=1 PORT=8000 RAILFLOW_DEMO=1 RAILFLOW_IDLE_PAUSE=1\nWORKDIR /app\nCOPY backend/requirements.txt ./backend/requirements.txt\nRUN pip install --no-cache-dir -r backend/requirements.txt\nCOPY backend/ ./backend/\nCOPY --from=console /build/dist ./frontend/dist\nRUN useradd --create-home --uid 10001 railflow && chown -R railflow:railflow /app\nUSER railflow\nCMD [\"sh\", \"-c\", \"python -m uvicorn backend.main:app --host 0.0.0.0 --port ${PORT}\"]",
          mark: [1, 8, 14],
          note: "Trimmed. Node builds the console; only `dist` reaches the Python image. FastAPI serves it, so the page and the WebSocket share one origin: no CORS, and wss:// behind TLS for free.",
        },
        {
          t: "pitfall",
          h: "A submodule with no .gitmodules",
          x: "The repo tracks `RailFlow-Website` as a gitlink (mode 160000) but has no `.gitmodules`, so `git submodule status` fails with 'no submodule mapping found'. A fresh clone can't fetch the site. Commit the mapping, or make it a plain folder.",
        },
        {
          t: "table",
          head: ["Limitation", "Where it shows"],
          rows: [
            ["No trained policy: `_ppo_decision` returns the heuristic", "agent.py"],
            ["RL observation sees 5 trains and the first 8 of 42 sections", "rl_env.py `_observation`"],
            ["Reward is minus total delay, a level, not a per-step change", "rl_env.py `_reward`"],
            ["Passwords stored and compared in plain text; sessions in memory", "auth.py, data/users.json"],
            ["One process, one lock: no horizontal scaling by design", "Dockerfile, main.py"],
            ["Not a signalling system: no interlocking, no safety case", "README footer"],
          ],
        },
        {
          t: "rebuild",
          h: "A 1 Hz train view that doesn't stutter",
          x: "The starter feeds one train at 1 Hz with stops at stations, and the view only snaps. Implement RailFlow's approach: predict with the last speed, store drift on each snapshot, bleed it off, and hard-cut when the train jumps sections.",
          mode: "html",
          html: "<canvas></canvas><p id=\"out\"></p>",
          css: "body { margin: 0; font: 12px system-ui; background: #14161a; color: #ccc; }\ncanvas { display: block; width: 100%; height: 140px; }\n#out { margin: 6px 10px; }",
          js: REBUILD_JS,
          task: "Fill the four TODOs. Then set LATE to true and keep the error small. Bonus: stop the overshoot into a station by passing the next stop in the snapshot.",
        },
        {
          t: "mission",
          h: "Give the toy sim the test RailFlow lacks",
          x: "Take the determinism play's `run()` and write a Node test file: same inputs give the same hash, and a train with leftover time carries progress onto the next section. Then add a feature: a blocked section that stops trains at its start node.",
          hint: "Use `node:test` and `node:assert/strict` like corridor.test.js. For carry-over, find a tick where a train changes section and assert its new progress is above 0.",
          solution: {
            lang: "js",
            src: "import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { run, runTrace } from './toy-sim.js';\n\ntest('same inputs, same railway', () => {\n  assert.equal(run(120), run(120));\n});\n\ntest('leftover time carries over a node', () => {\n  const trace = runTrace(60);        // [{ tick, sec, p }] for train 0\n  const hop = trace.find((s, i) => i > 0 && s.sec > trace[i - 1].sec);\n  assert.ok(hop, 'the train changes section');\n  assert.ok(hop.p > 0, 'and starts the new one part-way along');\n});",
          },
        },
      ],
    },
  ],
  nobodyTells: [
    "If your simulation is deterministic, write the test that proves it on day one. It turns every bug report into a replay.",
    "Split every aggregate metric into its parts before you quote it. RailFlow's 59.7% is mostly trains finishing inside the 600-tick window.",
    "Close a rejected WebSocket after accepting it, with a policy code. A refused handshake reaches the browser as an anonymous 1006.",
    "An open socket isn't a live server. Watch frame age as well as the transport state.",
    "Full snapshots heal themselves: a lost frame is fixed by the next one. Reach for deltas only when you've measured the bandwidth.",
    "When the same function runs in GLSL and JS, generate one from the other and test that they share their constants.",
    "Keep human decisions and machine decisions in different states. A system release must never undo a person's stop.",
    "Put the honest limitations in the README yourself. A reviewer who finds them first stops trusting the rest.",
  ],
  glossary: [
    ["tick", "One fixed simulation step; in RailFlow one simulated minute, sent about once a second by default."],
    ["deterministic simulation", "Same inputs and commands produce the same states, bit for bit; no clock or random number in the step."],
    ["dynamic weight", "An edge cost recomputed from live state, here expected minutes inflated by section load."],
    ["load ratio", "Trains on a section divided by its capacity; above 1 the section is congested."],
    ["safety gate", "A check every proposed action must pass before it is applied: valid first, then beneficial."],
    ["horizon penalty", "The cost a benchmark charges for work unfinished when the run stops, here minutes since departure."],
    ["dead reckoning", "Predicting position from the last known speed between authoritative updates."],
    ["reconciliation", "Folding an authoritative update into a predicted state, here by storing the error and bleeding it off."],
    ["close code 1008", "WebSocket 'policy violation'; RailFlow uses it to say the token was rejected."],
    ["data texture", "A texture used as an array of numbers; RailFlow keeps one RGBA float texel per track section."],
    ["recentring", "Subtracting a nearby origin before float32 maths so small offsets keep their precision."],
    ["arc-length parameterisation", "Mapping 0..1 along a curve to equal distances, so constant speed looks constant."],
    ["multi-stage build", "A Dockerfile that builds in one image and copies only the output into a smaller runtime image."],
  ],
  explain: "Explain to a friend how RailFlow keeps a train moving smoothly on screen when the server only sends its position once a second, and what goes wrong if a message is late.",
};
