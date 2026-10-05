const RAW_SERVER = String.raw`// raw.mjs: HTTP with no HTTP library. Run: node raw.mjs
import net from "node:net";

net.createServer((socket) => {
  socket.on("data", (buf) => {
    // Print the request with every \r\n visible.
    console.log(JSON.stringify(buf.toString("latin1")));

    const body = "hello from a socket\n";
    socket.write(
      "HTTP/1.1 200 OK\r\n" +
      "Content-Type: text/plain\r\n" +
      "Content-Length: " + Buffer.byteLength(body) + "\r\n" +
      "\r\n" +
      body
    );
  });
}).listen(3000, () => console.log("try: curl -v http://localhost:3000/hi"));`;

const LOOP_PLAY = String.raw`// One thread. Each "request" is a task; its handler burns cpu ms synchronously.
function busy(ms) { const end = performance.now() + ms; while (performance.now() < end) {} }

function burst(label, costs) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const lat = [];
    for (const cpu of costs) {
      setTimeout(() => {
        busy(cpu);
        lat.push(performance.now() - t0);
        if (lat.length === costs.length) {
          lat.sort((a, b) => a - b);
          const p = (q) => lat[Math.min(lat.length - 1, Math.floor(q * lat.length))].toFixed(0).padStart(5);
          console.log(label.padEnd(30), "p50", p(0.5), "ms   p99", p(0.99), "ms");
          resolve();
        }
      }, 0);
    }
  });
}

(async () => {
  await burst("20 requests, 2 ms each", Array(20).fill(2));
  await burst("20 requests, 20 ms each", Array(20).fill(20));
  await burst("one 300 ms request first", [300, ...Array(19).fill(2)]);
})();`;

const MINI_EXPRESS = String.raw`// A mini Express: a list of layers, next(), params, error handlers.
function createApp() {
  const stack = [];
  const app = (req, res) => handle(req, res);
  const add = (method, path, fn) => (stack.push({ method, path, fn }), app);
  app.use = (path, fn) => (fn ? add(null, path, fn) : add(null, "/", path));
  app.get = (path, fn) => add("GET", path, fn);
  app.post = (path, fn) => add("POST", path, fn);

  function match(layer, req) {
    if (layer.method && layer.method !== req.method) return null;
    const want = layer.path.split("/").filter(Boolean);
    const got = req.path.split("/").filter(Boolean);
    // a route must match exactly; use() matches a prefix
    if (layer.method ? want.length !== got.length : want.length > got.length) return null;
    const params = {};
    for (let i = 0; i < want.length; i++) {
      if (want[i][0] === ":") params[want[i].slice(1)] = decodeURIComponent(got[i]);
      else if (want[i] !== got[i]) return null;
    }
    return params;
  }

  function handle(req, res) {
    let i = 0;
    function next(err) {
      const layer = stack[i++];
      if (!layer) return finish(err, req, res);
      const params = match(layer, req);
      if (!params) return next(err);
      const errorHandler = layer.fn.length === 4;     // how Express tells them apart
      if (Boolean(err) !== errorHandler) return next(err);
      req.params = params;
      try {
        const out = err ? layer.fn(err, req, res, next) : layer.fn(req, res, next);
        // TODO: Express 5 catches rejected promises right here. Express 4 didn't.
      } catch (e) {
        next(e);
      }
    }
    next();
  }

  function finish(err, req, res) {
    if (err) res.status(500).send("Internal Server Error");
    else res.status(404).send("Cannot " + req.method + " " + req.path);
  }
  return app;
}

// Fake req/res, so it runs without a socket.
function request(app, method, url) {
  return new Promise((resolve) => {
    const [path, qs = ""] = url.split("?");
    const req = { method, url, path, query: Object.fromEntries(new URLSearchParams(qs)) };
    const res = {
      statusCode: 200, headersSent: false,
      status(code) { this.statusCode = code; return this; },
      send(body) {
        if (this.headersSent) throw new Error("ERR_HTTP_HEADERS_SENT");
        this.headersSent = true;
        resolve(method + " " + url + " -> " + this.statusCode + " " + body);
        return this;
      },
      json(obj) { return this.send(JSON.stringify(obj)); },
    };
    setTimeout(() => resolve(method + " " + url + " -> (no response, hung)"), 300);
    app(req, res);
  });
}

const app = createApp();
const seen = [];
app.use((req, res, next) => { seen.push(req.path); next(); });
app.get("/notes/:id", (req, res) => res.json({ id: req.params.id }));
app.get("/boom", () => { throw new Error("sync boom"); });
app.get("/async", async () => { await null; throw new Error("async boom"); });
app.use("/admin", (req, res, next) => (req.query.key === "k" ? next() : res.status(401).send("no")));
app.get("/admin/stats", (req, res) => res.json({ users: 3 }));
app.use((err, req, res, next) => res.status(500).json({ caught: err.message }));

(async () => {
  for (const [m, u] of [["GET", "/notes/7"], ["GET", "/boom"], ["GET", "/async"],
    ["GET", "/admin/stats"], ["GET", "/admin/stats?key=k"], ["POST", "/notes/7"]]) {
    console.log(await request(app, m, u));
  }
  console.log("logger saw:", seen.join(" "));
})();`;

export default {
  id: "servers-express",
  n: 22,
  part: "E",
  title: "HTTP servers and Express",
  hook: "Express is a loop over an array of functions. Under it: a socket, a parser, and timeouts that decide who gets a 502.",
  minutes: 95,
  levels: ["use", "understand", "rebuild"],
  sections: [
    {
      title: "Bytes on a socket",
      beats: [
        { t: "say", x: "HTTP/1.1 is text on a TCP socket: a request line, headers, a blank line, maybe a body. Every framework is a parser for those bytes and a writer for the answer. Start with no framework at all." },
        {
          t: "play",
          mode: "node",
          title: "an HTTP server with no HTTP library",
          js: RAW_SERVER,
          task: "Run it and `curl -v` it, then open it in a browser and count the requests. Then explain why treating each `data` event as one request is wrong.",
        },
        {
          t: "code",
          lang: "http",
          src: "POST /api/notes HTTP/1.1\nHost: localhost:3000\nContent-Type: application/json\nContent-Length: 16\n\n{\"text\":\"hello\"}",
          mark: [4],
          note: "Every line ends in `\\r\\n`; the empty line ends the headers. `Content-Length` is the only thing telling the server where this body stops and the next request on the connection starts.",
        },
        {
          t: "predict",
          lang: "text",
          src: "POST /p HTTP/1.1\\r\\n\nHost: x\\r\\n\nContent-Length: 5\\r\\n\n\\r\\n\nhello world",
          q: "Node's `http` server gets these bytes. What body does the handler see?",
          options: ["`hello world`", "`hello`", "Nothing: Node rejects it before the handler", "`hello`, and it waits for 6 more bytes"],
          answer: 1,
          why: "The parser reads exactly 5 body bytes. ` world` is then parsed as the start of the **next** request on the connection, which is garbage, so Node answers `400 Bad Request` and closes the socket.",
        },
        {
          t: "table",
          head: ["Framing", "Where the body ends", "When Node uses it"],
          rows: [
            ["`Content-Length: N`", "After exactly N bytes", "You call `res.end(data)` before writing anything else"],
            ["`Transfer-Encoding: chunked`", "At a zero-size chunk", "You `res.write()` before the total is known"],
            ["Neither, on a request", "There is no body; the next bytes are the next request", "GET, HEAD, most DELETEs"],
            ["Neither, on a response", "When the server closes the connection", "HTTP/1.0 clients. Keep-alive dies with it"],
          ],
          caption: "Chunk format itself is in the \"What happens when you open a URL\" chapter. HTTP/2 and 3 frame by length and forbid chunked.",
        },
      ],
    },
    {
      title: "node:http by hand",
      beats: [
        {
          t: "code",
          lang: "js",
          file: "server.mjs",
          src: "import http from \"node:http\";\n\nconst server = http.createServer(async (req, res) => {\n  // req: parsed request line + headers, and a Readable of the body\n  console.log(req.method, req.url, req.headers[\"content-type\"]);\n\n  const chunks = [];\n  for await (const chunk of req) chunks.push(chunk); // no size limit yet\n  const body = Buffer.concat(chunks);\n\n  // res: a Writable that goes back down the same socket\n  res.statusCode = 200;\n  res.setHeader(\"Content-Type\", \"application/json\");\n  res.end(JSON.stringify({ bytes: body.length }));\n});\n\nserver.listen(3000);",
          mark: [8, 12, 13, 14],
          note: "Names in `req.headers` are lower-cased. Most repeated headers are joined with `, `, a few like `content-type` keep only the first, and `set-cookie` is always an array.",
        },
        {
          t: "predict",
          lang: "js",
          src: "// A\nres.end(\"hi\");\n\n// B\nres.write(\"hi\");\nres.end();",
          q: "How is each response framed?",
          options: ["Both `Content-Length: 2`", "A: `Content-Length: 2`. B: `Transfer-Encoding: chunked`", "Both chunked", "Neither: the connection closes after each"],
          answer: 1,
          why: "`end(data)` with nothing written yet lets Node count the bytes. A bare `write()` sends the headers before the total is known, so Node switches to chunked. Both also get `Date`, `Connection: keep-alive` and `Keep-Alive: timeout=5` for free.",
        },
        {
          t: "predict",
          lang: "js",
          src: "res.write(\"loading...\");\nres.setHeader(\"Set-Cookie\", \"seen=1\");\nres.end(\"done\");",
          q: "What happens?",
          options: ["Cookie set, body `loading...done`", "`setHeader` throws `ERR_HTTP_HEADERS_SENT`", "The cookie goes out as a trailer", "The header is silently dropped"],
          answer: 1,
          why: "The first `write()` put the status line and headers on the socket, and bytes can't be taken back. This is the famous \"Cannot set headers after they are sent to the client\". In Express it nearly always means two responses to one request.",
        },
        {
          t: "code",
          lang: "js",
          src: "const routes = new Map([\n  [\"GET /health\", (req, res) => res.end(\"ok\")],\n  [\"GET /notes\", listNotes],\n  [\"POST /notes\", createNote],\n]);\n\nhttp.createServer((req, res) => {\n  const url = new URL(\"http://internal\" + req.url);\n  const handler = routes.get(`${req.method} ${url.pathname}`);\n  if (handler) return handler(req, res, url);\n\n  const allow = [...routes.keys()]\n    .filter((k) => k.endsWith(\" \" + url.pathname))\n    .map((k) => k.split(\" \")[0]);\n  if (allow.length) res.writeHead(405, { Allow: allow.join(\", \") }).end();\n  else res.writeHead(404).end();\n}).listen(3000);",
          mark: [8, 15],
          note: "Routing is a lookup on method plus path. A path that exists with the wrong method is a `405` with an `Allow` header, not a 404. Express doesn't do that for you either.",
        },
        {
          t: "pitfall",
          h: "`new URL(req.url, base)` lets the client pick the host",
          x: "A request line of `GET //evil.test/admin` gives `req.url` = `//evil.test/admin`, which resolves as a protocol-relative URL: pathname `/admin`. A guard on `req.url.startsWith(\"/admin\")` says no; the router on `pathname` says yes. Concatenate a fixed origin instead.",
        },
      ],
    },
    {
      title: "Keep-alive and the timeouts",
      beats: [
        { t: "say", x: "After a response, an HTTP/1.1 connection stays open for the next request, saving the handshakes. Node closes an idle one after `keepAliveTimeout`: 5 s on Node 24, announced in the `Keep-Alive: timeout=5` header." },
        {
          t: "table",
          head: ["Server setting", "Default (Node 24)", "The clock runs while"],
          rows: [
            ["`keepAliveTimeout`", "5 s, plus a 1 s `keepAliveTimeoutBuffer`", "The socket sits idle between requests"],
            ["`headersTimeout`", "60 s", "Headers are still arriving. Then 408 and close"],
            ["`requestTimeout`", "300 s", "The request, body included, is still arriving. Then 408"],
            ["`timeout`", "0 (never)", "Any socket inactivity"],
            ["`maxRequestsPerSocket`", "0 (unlimited)", "Counts requests; at the cap it sends `Connection: close`"],
          ],
          caption: "Header and request timeouts are swept every `connectionsCheckingInterval` (30 s), so a 408 can land up to 30 s late.",
        },
        {
          t: "quiz",
          q: "A handler awaits a database call that never settles. With Node's defaults, what happens to the request?",
          options: ["408 after 300 s, from `requestTimeout`", "Nothing, ever: the socket stays open until the client or a proxy gives up", "Node sends 504 after 120 s", "Express sends a 500"],
          answer: 1,
          why: "`requestTimeout` stops counting once the request has fully arrived, and `timeout` is 0. No Node default limits how long your handler takes. Put deadlines on your own outbound calls; the proxy's timeout is only the backstop.",
        },
        {
          t: "viz",
          name: "frames",
          props: {
            cols: ["Load balancer", "Shared socket", "Node"],
            frames: [
              { cells: [["pool: keep 60 s"], ["open, idle"], ["keep 5 s (+1 s)"]], note: "A response just finished. The load balancer will reuse this connection for up to 60 s. Node will hold it for about 6." },
              { cells: [["new request: reuse socket"], ["open, idle"], ["timer about to fire"]], note: "Six seconds later a user request reaches the load balancer. From its side the pooled socket has 54 s left." },
              { cells: [["GET /cart ->"], ["GET /cart ->", "<- FIN"], ["timer fired: close"]], note: "In the same millisecond Node's timer fires and it closes. The request and the FIN cross on the wire." },
              { cells: [["read: ECONNRESET"], ["RST"], ["socket gone"]], note: "Node's kernel answers the late bytes with a reset. The load balancer can't tell whether the request ran." },
              { cells: [["502 to the user"], [], []], note: "A trickle of 502s that never reproduces on your laptop." },
              { cells: [["pool: keep 60 s"], ["open, idle"], ["keepAliveTimeout: 65 s"]], note: "The fix: the side that reuses connections must give up first. Node's keep-alive must outlast the proxy's idle timeout." },
            ],
          },
        },
        {
          t: "code",
          lang: "js",
          src: "const server = app.listen(3000);\n\n// AWS ALB's default idle timeout is 60 s; so is nginx's upstream keepalive_timeout.\n// Node must hold idle sockets longer than whatever sits in front of it.\nserver.keepAliveTimeout = 65_000;",
          note: "Only behind a proxy that pools connections. Facing browsers directly, a short timeout frees sockets sooner.",
        },
        {
          t: "pitfall",
          h: "`headersTimeout` is your Slowloris defense",
          x: "A client that sends one header byte every 10 s never trips a socket inactivity timer. `headersTimeout` counts from the start of the request, so it ends it. Raising it to \"fix\" slow uploads is wrong: uploads are body time, governed by `requestTimeout`.",
        },
      ],
    },
    {
      title: "Express is an array of functions",
      beats: [
        { t: "say", x: "Express keeps a list of **layers**: a path, maybe a method, and a function. Each request walks the list from the top. A function either answers, or calls `next()` to hand the request to the next layer that matches." },
        {
          t: "viz",
          name: "frames",
          props: {
            cols: ["Layers, in order", "Ran", "Response"],
            frames: [
              { cells: [["requestId", "express.json()", "/admin: requireAdmin", "GET /notes/:id", "notFound", "errorHandler (4 args)"], [], []], note: "`GET /notes/7` arrives. Six layers, in the order they were registered." },
              { cells: [["requestId", "express.json()", "/admin: requireAdmin", "GET /notes/:id", "notFound", "errorHandler (4 args)"], ["requestId: set req.id, next()"], []], note: "`app.use` with no path matches everything." },
              { cells: [["requestId", "express.json()", "/admin: requireAdmin", "GET /notes/:id", "notFound", "errorHandler (4 args)"], ["requestId: set req.id, next()", "json: no JSON body, next()"], []], note: "The body parser checks `Content-Type`. Not JSON, so it does nothing and passes on." },
              { cells: [["requestId", "express.json()", "/admin: requireAdmin", "GET /notes/:id", "notFound", "errorHandler (4 args)"], ["requestId: set req.id, next()", "json: no JSON body, next()", "/admin: prefix doesn't match"], []], note: "Skipped without being called." },
              { cells: [["requestId", "express.json()", "/admin: requireAdmin", "GET /notes/:id", "notFound", "errorHandler (4 args)"], ["requestId: set req.id, next()", "json: no JSON body, next()", "/admin: prefix doesn't match", "getNote: res.json(note)"], ["200 {id: 7}"]], note: "The route answers and doesn't call `next()`. The walk is over: `notFound` and the error handler never run." },
              { cells: [["requestId", "express.json()", "/admin: requireAdmin", "GET /notes/:id", "notFound", "errorHandler (4 args)"], ["requestId", "json", "getNote: throws", "notFound: skipped", "errorHandler(err)"], ["500 {error, id}"]], note: "Another request, and `getNote` throws. Express skips every normal layer and jumps to the next one with four parameters." },
            ],
          },
        },
        {
          t: "predict",
          lang: "js",
          src: "app.use(logger);\napp.get(\"/public\", (req, res) => res.send(\"hi\"));\napp.use(requireLogin);\napp.get(\"/me\", (req, res) => res.json(req.user));\napp.use((req, res) => res.status(404).send(\"nope\"));",
          q: "An anonymous `GET /public`. Which functions run?",
          options: ["logger, the /public handler", "logger, requireLogin, the /public handler", "logger, the /public handler, the 404", "All five"],
          answer: 0,
          why: "The `/public` handler answers without calling `next()`, so `requireLogin` never sees the request. Registration order is your access policy: everything above the auth middleware is public.",
        },
        {
          t: "predict",
          lang: "js",
          src: "app.use(\"/api\", (req, res) => {\n  res.json({ url: req.url, base: req.baseUrl, full: req.originalUrl });\n});\n// GET /api/users/7?x=1",
          q: "What comes back?",
          options: ["`{ url: \"/api/users/7?x=1\", base: \"\", full: \"/api/users/7?x=1\" }`", "`{ url: \"/users/7?x=1\", base: \"/api\", full: \"/api/users/7?x=1\" }`", "`{ url: \"/users/7\", base: \"/api\", full: \"/api/users/7\" }`"],
          answer: 1,
          why: "A mounted middleware or router sees `req.url` with the mount path cut off, so the same router works under any prefix. Log `req.originalUrl`, never `req.url`, or half your log lines lose their prefix.",
        },
        {
          t: "predict",
          lang: "js",
          src: "function requireLogin(req, res, next) {\n  if (!req.session.user) {\n    res.status(401).json({ error: \"log in first\" });\n  }\n  next();\n}",
          q: "An anonymous request hits `DELETE /notes/7` behind this. What happens?",
          options: ["401; the route never runs", "401 is sent, then the route runs anyway and throws when it tries to answer", "The route's response replaces the 401", "Express notices and stops the chain"],
          answer: 1,
          why: "Sending a response doesn't end your function. `next()` runs, the route deletes the note, and only then fails with `ERR_HTTP_HEADERS_SENT`. Write `return res.status(401)...`.",
        },
        {
          t: "code",
          lang: "js",
          file: "request-log.js",
          src: "import { randomUUID } from \"node:crypto\";\n\napp.use((req, res, next) => {\n  const start = performance.now();\n  req.id = randomUUID();   // or your edge proxy's id, if you run one\n  res.set(\"X-Request-Id\", req.id);\n\n  const line = (msg) => console.log(JSON.stringify({\n    msg, id: req.id, method: req.method, url: req.originalUrl,\n    status: res.statusCode, ms: Math.round(performance.now() - start),\n  }));\n  res.on(\"finish\", () => line(\"done\"));                 // handed to the OS\n  res.on(\"close\", () => { if (!res.writableFinished) line(\"client left\"); });\n  next();\n});",
          mark: [12, 13],
          note: "Middleware can run code after the response. `close` without `finish` is a client that hung up mid-request: those never show in a status-code dashboard.",
        },
        {
          t: "table",
          head: ["Express 4 tutorial", "Express 5", "Why"],
          rows: [
            ["`app.get(\"*\", ...)`", "`app.get(\"/{*splat}\", ...)`", "A bare `*` now throws at startup: \"Missing parameter name\""],
            ["`\"/files/*\"`", "`\"/files/*splat\"`", "`req.params.splat` is an array of segments; `/files` alone doesn't match"],
            ["`\"/:file.:ext?\"`", "`\"/:file{.:ext}\"`", "Braces mark optional parts; `?` is reserved"],
            ["`req.query.page = 1`", "`const page = Number(req.query.page)`", "`req.query` is a getter that re-parses on every read"],
            ["`req.body` is `{}`", "`req.body` is `undefined`", "When no parser handled the request"],
            ["`async` handler errors hang", "Rejections reach your error handler", "The router awaits the returned promise"],
          ],
          caption: "Most Express answers online are Express 4. These are the lines that break.",
        },
      ],
    },
    {
      title: "Errors, then Express rebuilt",
      beats: [
        {
          t: "code",
          lang: "js",
          src: "class HttpError extends Error {\n  constructor(status, message) { super(message); this.status = status; }\n}\n\napp.get(\"/notes/:id\", async (req, res) => {\n  const note = await db.notes.find(req.params.id); // a rejection goes to the error handler\n  if (!note) throw new HttpError(404, \"no such note\");\n  res.json(note);\n});\n\napp.use((req, res) => res.status(404).json({ error: \"not found\" }));\n\n// Four parameters is how Express recognises an error handler.\napp.use((err, req, res, next) => {\n  if (res.headersSent) return next(err);  // too late for a status: let Express cut the socket\n  const status = err.status ?? 500;\n  if (status >= 500) console.error({ id: req.id, err });\n  res.status(status).json({ error: status < 500 ? err.message : \"internal error\", id: req.id });\n});",
          mark: [14, 15, 18],
          note: "`err.status` is also what the body parsers set: 400 for broken JSON, 413 for too large. Never send a 500's message to the client. Send the request id, so the bug report leads to the log line.",
        },
        {
          t: "predict",
          lang: "js",
          src: "app.get(\"/boom\", async (req, res) => {\n  await db.ping();\n  throw new Error(\"boom\");\n});",
          q: "What does the client get on Express 5, and on Express 4?",
          options: ["A 500 from the error handler on both", "Express 5: a 500 via the error handler. Express 4: no response, and an unhandled rejection that kills the process", "Both hang", "Express 5 hangs; Express 4 sends a 500"],
          answer: 1,
          why: "Express 5's router sees the returned promise and calls `next(err)` when it rejects. Express 4 ignored it: the request hung, and since Node 15 an unhandled rejection crashes the process, taking every other request with it.",
        },
        {
          t: "predict",
          lang: "js",
          src: "app.get(\"/\", (req, res) => res.send(\"home\"));\n\n// the linter flagged `next` as unused, so someone removed it\napp.use((err, req, res) => {\n  res.status(500).json({ error: err.message });\n});",
          q: "A client requests `/missing`. What does it get?",
          options: ["Express's default 404", "A 500: `res.status is not a function`", "A 500 with `err.message`", "The request hangs"],
          answer: 1,
          why: "Express spots error handlers by `fn.length === 4`. With three it's ordinary middleware: `err` is req, `req` is res, `res` is next. Every 404 that reaches it becomes a 500, and real errors skip it entirely.",
        },
        {
          t: "pitfall",
          h: "Express 5 can't catch a throw from a callback",
          x: "It catches a sync throw and a rejected promise from your handler. A throw inside `setTimeout`, an event listener, or an unhandled stream `'error'` happens on a later tick with nothing above it: the process exits, with every in-flight request. Promisify callbacks and use `pipeline`.",
        },
        {
          t: "pitfall",
          h: "Errors after the first byte",
          x: "Once headers are out you can't send a 500. Pass the error to `next(err)`: Express's default handler destroys the socket, so the client sees a truncated response, not a 200 that looks complete. A chunked body missing its final `0` chunk is how clients tell.",
        },
        {
          t: "quiz",
          q: "No custom error handler, `NODE_ENV=production`, and a route throws `new Error(\"db auth failed for admin@10.0.3.7\")`. What does the client see?",
          options: ["The message and the stack", "A 500 HTML page saying only `Internal Server Error`", "An empty 500", "`{ \"error\": \"db auth failed...\" }`"],
          answer: 1,
          why: "The default handler hides details only when `NODE_ENV` is `production`; otherwise the stack goes in the page. One server deployed without it leaks file paths and messages. The stack still goes to stderr either way.",
        },
        {
          t: "rebuild",
          h: "Rebuild: a mini Express",
          x: "Layers, `next()`, path params, prefix matching for `use()`, and errors that jump to the 4-argument handler. As shipped it behaves like Express 4: `/async` hangs and its rejection escapes. Make it Express 5.",
          mode: "js",
          js: MINI_EXPRESS,
          task: "Fill the TODO so `/async` reaches the error handler. Then make `use(\"/admin\")` strip its prefix into `req.baseUrl` like Express, and restore it after.",
        },
      ],
    },
    {
      title: "What comes in: bodies and the edge",
      beats: [
        {
          t: "code",
          lang: "js",
          src: "// The webhook's signature covers the exact bytes, so its raw parser goes FIRST.\napp.post(\"/webhooks/pay\",\n  express.raw({ type: \"application/json\", limit: \"1mb\" }),\n  payWebhook);\n\napp.use(express.json());       // limit \"100kb\"; only Content-Type: application/json\napp.use(express.urlencoded()); // HTML forms; extended: false in Express 5\n\napp.post(\"/notes\", createNote);",
          mark: [1, 6],
          note: "A parser skips a request whose `Content-Type` it doesn't handle, and skips a body another parser already read. Order decides which one wins.",
        },
        {
          t: "predict",
          lang: "js",
          src: "// browser\nawait fetch(\"/notes\", { method: \"POST\", body: JSON.stringify({ text: \"hi\" }) });\n\n// server, Express 5\napp.use(express.json());\napp.post(\"/notes\", (req, res) => res.json({ len: req.body.text.length }));",
          q: "What does the browser get?",
          options: ["200 `{ len: 2 }`", "400, invalid JSON", "500: cannot read properties of undefined", "415 Unsupported Media Type"],
          answer: 2,
          why: "A string body makes `fetch` send `Content-Type: text/plain;charset=UTF-8`. `express.json()` skips it, `req.body` stays `undefined`, and `.text` throws. Send the header, and answer 415 yourself when it's wrong.",
        },
        {
          t: "table",
          head: ["The body is", "`express.json()` does", "Client gets"],
          rows: [
            ["Broken JSON", "`next(err)`, `err.type = \"entity.parse.failed\"`", "400"],
            ["Over `limit` (100kb by default)", "Stops reading, `entity.too.large`", "413"],
            ["Gzip or brotli encoded", "Inflates it; the limit counts inflated bytes", "413 for a zip bomb"],
            ["Not `application/json`", "Nothing. `req.body` stays `undefined`", "Whatever your handler does with that"],
          ],
          caption: "The limit is what keeps a 200 MB `JSON.parse` off your event loop. Raise it per route, never globally.",
        },
        {
          t: "predict",
          lang: "js",
          src: "// GET /search?page=2&tag=a&tag=b&sort[by]=name\napp.get(\"/search\", (req, res) => res.json(req.query));",
          q: "What is `req.query` in Express 5?",
          options: ["`{ page: 2, tag: \"b\", sort: { by: \"name\" } }`", "`{ page: \"2\", tag: [\"a\", \"b\"], \"sort[by]\": \"name\" }`", "`{ page: \"2\", tag: [\"a\", \"b\"], sort: { by: \"name\" } }`", "`{ page: \"2\", tag: \"a,b\", \"sort[by]\": \"name\" }`"],
          answer: 1,
          why: "Every value is a string, and a repeated key becomes an array, so `req.query.tag.toLowerCase()` crashes the day someone adds `&tag=x`. Express 5's default \"simple\" parser doesn't nest brackets; Express 4's `qs` did.",
        },
        {
          t: "code",
          lang: "js",
          src: "import { z } from \"zod\";\n\nconst ListNotes = z.object({\n  page: z.coerce.number().int().min(1).max(1000).default(1),\n  tag: z.string().max(40).optional(),   // ?tag=a&tag=b is an array: rejected\n});\n\napp.get(\"/notes\", async (req, res) => {\n  const q = ListNotes.safeParse(req.query);\n  if (!q.success) return res.status(400).json({ error: q.error.issues });\n  res.json(await db.notes.list(q.data)); // typed, bounded, nothing else\n});",
          mark: [9, 11],
          note: "Parse once at the edge and pass only `q.data` inward. `z.object` drops undeclared keys, which is what stops `\"isAdmin\": true` riding into an update. Don't assign it back to `req.query`: it's a getter.",
        },
        {
          t: "pitfall",
          h: "Webhook signatures fail behind a global `express.json()`",
          x: "The signature covers the exact bytes sent. If `app.use(express.json())` runs first, it reads the stream; the route's `express.raw()` sees a finished body and skips, so you verify a parsed object and every real event fails. Mount the raw route above the global parser.",
        },
      ],
    },
    {
      title: "What goes out: static files, CORS, cookies",
      beats: [
        {
          t: "predict",
          lang: "js",
          src: "app.use(express.static(\"dist\"));\n// second visit: GET /assets/app.3f9a1c.js",
          q: "What does the browser do on the second visit?",
          options: ["Uses its cache, no request", "Sends `If-None-Match`, gets a 304", "Downloads it again, 200", "Uses heuristic caching for a while"],
          answer: 1,
          why: "`express.static` sends `Cache-Control: public, max-age=0` with an ETag and `Last-Modified`. Zero freshness means a round trip per file per page load: a cheap 304, but a round trip. Hashed files should be `immutable`.",
        },
        {
          t: "code",
          lang: "js",
          src: "app.use(\"/assets\", express.static(\"dist/assets\", {\n  immutable: true,\n  maxAge: \"1y\",          // hashed names: the URL changes when the bytes do\n  fallthrough: false,    // a missing asset is a 404 right here\n}));\n\napp.use(express.static(\"dist\", {\n  setHeaders(res, path) {\n    if (path.endsWith(\".html\")) res.setHeader(\"Cache-Control\", \"no-cache\");\n  },\n}));\n\napp.get(\"/{*splat}\", (req, res) => res.sendFile(\"index.html\", { root: \"dist\" }));",
          mark: [4, 13],
          note: "Without `fallthrough: false`, last deploy's deleted chunk falls through to the SPA catch-all and comes back as `index.html` with a 200. The browser reports `Unexpected token '<'` instead of a 404.",
        },
        { t: "say", h: "What CORS protects", x: "The same-origin policy stops a page **reading** another origin's responses; CORS is the server relaxing that per response. It doesn't stop requests: a form-like POST still reaches your handler. \"Auth and security\" shows that attack." },
        {
          t: "steps",
          h: "A preflight, step by step",
          items: [
            "The page sends something non-simple: `Content-Type: application/json`, an `Authorization` header, or a method like PUT or DELETE.",
            "The browser first sends `OPTIONS` with `Origin`, `Access-Control-Request-Method` and `-Headers`. Never with cookies or `Authorization`.",
            "Your server answers 204 with `Access-Control-Allow-Origin`, `-Methods`, `-Headers` and `-Max-Age`.",
            "The browser caches that for `Max-Age` seconds: 5 s if absent, capped at 2 h in Chromium and 24 h in Firefox.",
            "Then the real request goes out. Its response also needs `Access-Control-Allow-Origin`, or the page can't read it.",
            "With `credentials: \"include\"`, the origin must be exact (no `*`) and `Access-Control-Allow-Credentials: true` must be set.",
          ],
        },
        {
          t: "pitfall",
          h: "Auth above CORS breaks every preflight",
          x: "Preflights carry no cookies and no `Authorization`. If `requireLogin` runs before the CORS middleware, the `OPTIONS` gets a 401 with no CORS headers, and the console shows a CORS error that never mentions auth. Mount `cors()` first.",
        },
        {
          t: "predict",
          lang: "js",
          src: "// login\nres.cookie(\"sid\", token, { path: \"/api\", httpOnly: true, secure: true, sameSite: \"lax\" });\n\n// logout\nres.clearCookie(\"sid\");",
          q: "After logout, does the browser still send `sid` to `/api/...`?",
          options: ["No, it's cleared", "Yes: the clear targets `Path=/`, which is a different cookie", "Only until the tab closes", "Express throws on the mismatch"],
          answer: 1,
          why: "A cookie is identified by name, domain **and** path. `clearCookie` sends an expired `sid` for `Path=/`, and the `/api` one survives. Pass the same `path` and `domain` you set it with.",
        },
      ],
    },
    {
      title: "One thread: blocking and backpressure",
      beats: [
        { t: "say", x: "All your JavaScript runs on one thread. While a handler runs synchronous code, nothing else happens: no request is parsed, no timer fires, no response is written. 50 ms of CPU in one request is 50 ms added to everyone queued behind it." },
        {
          t: "play",
          mode: "js",
          title: "queueing on one thread",
          js: LOOP_PLAY,
          task: "Move the 300 ms request to the end of the array. Which percentile recovers, which doesn't, and why is that exactly what a server does?",
        },
        {
          t: "table",
          head: ["Blocks the loop", "Cost", "Instead"],
          rows: [
            ["`JSON.parse` of a big body", "Roughly 10 ms per MB on a laptop", "A body `limit`; stream-parse real imports"],
            ["`fs.readFileSync` in a handler", "A disk read, or seconds on a network drive", "`fs/promises`, or read once at startup"],
            ["`pbkdf2Sync`, `scryptSync`, bcrypt sync", "Tens to hundreds of ms, by design", "The async versions, which use the thread pool"],
            ["A regex with nested quantifiers on input", "Exponential: seconds, or forever", "Linear patterns and a length cap first"],
            ["Sorting or serialising a huge result", "Grows with n", "Paginate, stream, or move it to a worker thread"],
          ],
          caption: "Measuring loop delay and sizing the thread pool are in \"Node, npm and modules\". Here, the request-shaped versions.",
        },
        {
          t: "predict",
          lang: "js",
          src: "app.get(\"/export\", async (req, res) => {\n  for await (const row of db.cursor(\"SELECT * FROM events\")) { // 5M rows\n    res.write(JSON.stringify(row) + \"\\n\");\n  }\n  res.end();\n});",
          q: "A client on a slow connection downloads the export. What does server memory do?",
          options: ["Stays flat: `write()` waits for the socket", "Grows toward the size of the export", "Stays flat: the cursor is lazy", "Node drops rows that don't fit"],
          answer: 1,
          why: "`write()` never waits. It returns `false` when the buffer is full and queues the data anyway. In a test, 1000 writes of 64 KB to a paused client left 65 MB sitting in memory. That `false` is **backpressure**: await `'drain'`, or use `pipeline`.",
        },
        {
          t: "compare",
          a: { label: ".pipe(): leaks on abort", lang: "js", src: "app.get(\"/video\", (req, res) => {\n  fs.createReadStream(file).pipe(res);\n});" },
          b: { label: "pipeline(): cleans up", lang: "js", src: "import { pipeline } from \"node:stream/promises\";\nimport { Readable } from \"node:stream\";\n\napp.get(\"/video\", async (req, res) => {\n  await pipeline(fs.createReadStream(file), res);\n});\n\napp.get(\"/export\", async (req, res) => {\n  res.type(\"application/x-ndjson\");\n  await pipeline(Readable.from(exportLines()), res);\n});" },
          x: "When the client hangs up, `.pipe()` leaves the file stream open: one leaked descriptor per aborted download. `pipeline` destroys every stream, rejects with `ERR_STREAM_PREMATURE_CLOSE`, and respects backpressure.",
        },
        {
          t: "pitfall",
          h: "A client that leaves doesn't stop your work",
          x: "The user closes the tab; your handler keeps running the 4 s report query and rendering a PDF for nobody. Under load, abandoned work is what tips you over. Watch `res.on(\"close\")` without `writableFinished`, and pass an `AbortSignal` to `fetch` and to drivers that take one.",
        },
        {
          t: "mission",
          h: "Stream a big export in flat memory",
          x: "Serve 2M NDJSON lines from an async generator two ways: `res.write` in a loop, then `pipeline(Readable.from(gen()), res)`. Download each with `curl --limit-rate 200k -o out.ndjson`, log `process.memoryUsage().rss` every second, and kill curl halfway.",
          hint: "The loop grows by hundreds of MB; pipeline stays flat. Put `finally { console.log(\"stopped\") }` in the generator: with pipeline it prints when curl dies, because the generator gets `return()`ed.",
        },
      ],
    },
    {
      title: "Behind a proxy, and draining",
      beats: [
        { t: "say", x: "Behind a load balancer, your peer is the proxy: `req.socket.remoteAddress` is its IP and the protocol is `http`. The client's values come in `X-Forwarded-*`. Set `trust proxy` to the number of proxies you run, never `true`." },
        {
          t: "pitfall",
          h: "The HTTPS redirect loop",
          x: "Behind a TLS-terminating proxy with `trust proxy` unset, `req.secure` is always false. A middleware doing `if (!req.secure) res.redirect(\"https://\" + ...)` redirects every HTTPS request to itself, forever. Set `trust proxy` so Express reads `X-Forwarded-Proto`.",
        },
        {
          t: "predict",
          lang: "text",
          src: "One client, one keep-alive connection, no Connection: close middleware.\nt = 0      GET /slow starts (takes 500 ms)\nt = 100    server.close(() => console.log(\"closed\"))\nt = 1500   the same client sends GET / on the same connection",
          q: "What happens at t = 1500, and when does `closed` print?",
          options: ["Connection refused; `closed` prints at ~500 ms", "Served, 200; `closed` prints about 6 s after that response", "A 503; `closed` prints at 1500", "Served; `closed` never prints"],
          answer: 1,
          why: "`close()` only closes sockets idle at that instant. The busy one finishes `/slow`, stays keep-alive, and serves the next request too. `closed` waits until it idles out: 5 s `keepAliveTimeout` plus the 1 s buffer.",
        },
        {
          t: "code",
          lang: "js",
          file: "drain.js",
          src: "let draining = false;\n\n// Register before every route: once draining, each response closes its socket.\napp.use((req, res, next) => {\n  if (draining) res.set(\"Connection\", \"close\");\n  next();\n});\n\nconst server = app.listen(3000);\n\nexport function drain(deadlineMs = 20_000) {\n  draining = true;\n  const sweep = setInterval(() => server.closeIdleConnections(), 1_000);\n  const hard = setTimeout(() => server.closeAllConnections(), deadlineMs);\n  return new Promise((resolve) => {\n    server.close(() => {          // fires when the last connection is gone\n      clearInterval(sweep);\n      clearTimeout(hard);\n      resolve();\n    });\n  });\n}",
          mark: [5, 13, 14],
          note: "Call it from your SIGTERM handler, then close the DB pool. Readiness checks, grace periods and PID 1 are in \"Shipping: Docker, hosting, observability\"; this is the part inside the server.",
        },
        {
          t: "mission",
          h: "Prove your deploys drop nothing",
          x: "Add `drain()` and a 2 s `/slow` route. Run `npx autocannon -c 50 -d 20 http://localhost:3000/slow`, trigger shutdown mid-run, and count requests that were accepted but never got a full response. Then remove the `Connection: close` middleware and compare.",
          hint: "On Windows, SIGTERM can't be caught: listen for `SIGINT` too and press Ctrl+C. New connections after `close()` are refused by design; only accepted requests must finish.",
        },
      ],
    },
  ],
  nobodyTells: [
    "No Node default times out your handler. Every outbound call (DB, fetch, queue) needs its own deadline, or a stuck dependency holds sockets forever.",
    "A trickle of 502s behind a load balancer is almost always keep-alive: Node closed first. Set `keepAliveTimeout` above the LB's idle timeout.",
    "Log `req.originalUrl`, not `req.url`. A mounted router rewrites `req.url` under you.",
    "Put the request id in every log line and in every error body. A support ticket then becomes a grep.",
    "`AsyncLocalStorage` carries the request id into code that never sees `req`, like your DB layer's slow-query log.",
    "`res.write` in a loop with a slow client is a memory leak. Stream with `pipeline`, which handles backpressure and aborts.",
    "Deploy while a load test runs. Every error it shows is one your users get on every deploy.",
    "When a server surprises you, look at the bytes: `curl -v`, or `nc` and type the request yourself.",
  ],
  glossary: [
    ["keep-alive", "Reusing one TCP connection for many HTTP/1.1 requests. Default in HTTP/1.1; each side closes an idle one on its own timer."],
    ["keepAliveTimeout", "How long Node keeps an idle connection open for the next request. 5 s by default in Node 24."],
    ["chunked encoding", "HTTP/1.1 body framing for unknown length: hex-sized chunks ending with a zero chunk."],
    ["middleware", "A function `(req, res, next)` in Express's stack. It answers, or calls `next()` to pass the request on."],
    ["error middleware", "A four-parameter `(err, req, res, next)` function. Express routes errors only to these."],
    ["body parser", "Middleware that reads the request stream into `req.body`, by Content-Type, up to a size limit."],
    ["preflight", "The `OPTIONS` request a browser sends before a non-simple cross-origin request, asking permission."],
    ["simple request", "A cross-origin GET, HEAD or POST with safelisted headers. Sent with no preflight."],
    ["backpressure", "A slow consumer telling a fast producer to wait. In Node, `write()` returning false and the `'drain'` event."],
    ["thread pool", "libuv's worker threads (4 by default) behind async fs, crypto, zlib and `dns.lookup`."],
    ["event loop delay", "How late timers fire because the thread was busy. The direct measure of blocking."],
    ["trust proxy", "Express setting that decides which `X-Forwarded-*` hops to believe for `req.ip` and `req.protocol`."],
    ["graceful shutdown", "On SIGTERM: stop taking work, finish what's in flight, close resources, then exit."],
  ],
  explain: "Explain to a friend what happens between bytes arriving on a socket and your Express route running, and why a server can drop requests on every deploy.",
};
