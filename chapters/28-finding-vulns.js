/* Every play: a small flawed handler plus tests. Fix the handler until every line says pass. */
const RUNNER = String.raw`// A tiny test runner. Tests are queued, then run after the code below is defined.
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
function eq(got, want, what) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) throw new Error((what || "value") + ": got " + g + ", want " + w);
}
setTimeout(async () => {
  let failed = 0;
  for (const [name, fn] of tests) {
    try { await fn(); console.log("pass  " + name); }
    catch (e) { failed++; console.log("FAIL  " + name + "\n      " + e.message); }
  }
  console.log(failed ? failed + " of " + tests.length + " failing" : "all " + tests.length + " green");
});
`;

const TRUST_PLAY = RUNNER + String.raw`
const CATALOG = { lamp: 40, desk: 220 };
const wallet = {};

// POST /api/checkout. The page already checks sku, qty and price before fetch.
function checkout(user, body) {
  const total = body.price * body.qty;
  if (total > wallet[user]) return { status: 402 };
  wallet[user] -= total;
  return { status: 200, charged: total };
}

test("the page's own request is charged the catalog price", () => {
  wallet.ada = 300;
  eq(checkout("ada", { sku: "desk", qty: 1, price: 220 }), { status: 200, charged: 220 });
});
test("a price in the body is ignored", () => {
  wallet.ada = 300;
  eq(checkout("ada", { sku: "desk", qty: 1, price: 1 }).charged, 220, "charged");
});
test("qty outside 1..5 is refused, wallet untouched", () => {
  wallet.ada = 300;
  eq([checkout("ada", { sku: "lamp", qty: -2, price: 40 }).status, wallet.ada], [400, 300]);
});
test("an unknown sku is refused", () => {
  wallet.ada = 300;
  eq(checkout("ada", { sku: "yacht", qty: 1, price: 0 }).status, 400, "status");
});`;

const CONFIG_PLAY = RUNNER + String.raw`
// Server env at build time. Whatever publicConfig returns is inlined into the bundle.
const env = {
  MAPS_PUBLIC_KEY: "pk_demo_maps",
  SENTRY_DSN: "https://public@o1.ingest.test/9",
  STRIPE_SECRET_KEY: "sk_test_not_a_real_key",
  DATABASE_URL: "postgres://app:pw@db.internal/app",
  ADMIN_API_BASE: "https://admin.internal.test",
  FEATURE_NEW_CHECKOUT: "1",
};

// Ship everything that doesn't look secret.
function publicConfig(env) {
  return Object.fromEntries(
    Object.entries(env).filter(([k]) => !/PASSWORD|TOKEN/.test(k)));
}

const bundle = "window.__CONFIG__=" + JSON.stringify(publicConfig(env));

test("the bundle carries only allow-listed keys", () => {
  eq(Object.keys(publicConfig(env)).sort(),
     ["FEATURE_NEW_CHECKOUT", "MAPS_PUBLIC_KEY", "SENTRY_DSN"]);
});
test("no secret-shaped string in the shipped bundle", () => {
  const found = [/sk_(test|live)_/, /postgres:\/\//, /\.internal\b/]
    .filter((re) => re.test(bundle)).map(String);
  eq(found, [], "matches");
});`;

const IDOR_PLAY = RUNNER + String.raw`
const orders = [
  { id: 501, owner: "ada", total: 40 },
  { id: 502, owner: "bob", total: 220 },
  { id: 503, owner: "ada", total: 12 },
];

// GET /api/orders/:id. requireLogin has already set user.
function getOrder(user, id) {
  const o = orders.find((o) => o.id === id);
  if (!o) return { status: 404 };
  return { status: 200, body: o };
}

// Two test users against every object: the whole matrix, not one case.
for (const user of ["ada", "bob"]) {
  for (const o of orders) {
    const want = o.owner === user ? 200 : 404;
    test(user + " GET /api/orders/" + o.id + " -> " + want,
      () => eq(getOrder(user, o.id).status, want, "status"));
  }
}
test("an id that doesn't exist is 404 too", () => eq(getOrder("ada", 999).status, 404, "status"));`;

const MASS_PLAY = RUNNER + String.raw`
const users = {};
const reset = () => (users[7] = {
  id: 7, name: "Ada", bio: "", email: "ada@shop.test",
  role: "user", credit: 0, emailVerified: false, passwordHash: "$argon2id$v=19$...",
});

// GET /api/me
function getMe(uid) {
  return { ...users[uid] };
}
// PATCH /api/me. The profile form edits name and bio.
function patchMe(uid, body) {
  Object.assign(users[uid], body);
  return { status: 204 };
}

test("the form's request updates name and bio", () => {
  reset();
  patchMe(7, { name: "Ada L.", bio: "hi" });
  eq([users[7].name, users[7].bio], ["Ada L.", "hi"]);
});
test("server-owned fields in the body are ignored", () => {
  reset();
  patchMe(7, { name: "Ada", role: "admin", credit: 500, emailVerified: true });
  eq([users[7].role, users[7].credit, users[7].emailVerified], ["user", 0, false]);
});
test("a name that isn't a string is a 400", () => {
  reset();
  eq(patchMe(7, { name: { first: "Ada" } }).status, 400, "status");
});
test("GET returns only what the profile page shows", () => {
  reset();
  eq(Object.keys(getMe(7)).sort(), ["bio", "email", "id", "name"]);
});`;

const BFLA_PLAY = RUNNER + String.raw`
const sessions = { s_ada: { id: 7, role: "user" }, s_root: { id: 1, role: "admin" } };

const routes = {
  "GET /api/me":              { run: (u) => ({ id: u.id }) },
  "GET /api/admin/users.csv": { run: () => "id,email\n1,root@shop.test\n7,ada@shop.test" },
  "DELETE /api/admin/users":  { run: () => "deleted" },
  "POST /api/admin/reindex":  { run: () => "started" },   // added in a hurry
};

// The one middleware every request passes through.
function call(method, path, sid) {
  const user = sessions[sid];
  if (!user) return { status: 401 };
  const route = routes[method + " " + path];
  if (!route) return { status: 404 };
  return { status: 200, body: route.run(user) };
}

const cases = [
  ["GET", "/api/me", "s_ada", 200],
  ["GET", "/api/admin/users.csv", "s_ada", 403],
  ["DELETE", "/api/admin/users", "s_ada", 403],
  ["GET", "/api/admin/users.csv", "s_root", 200],
  ["GET", "/api/admin/users.csv", undefined, 401],
  ["POST", "/api/admin/reindex", "s_root", 403],          // no role listed: closed
];
for (const [m, p, sid, want] of cases) {
  test((sid || "no session") + " " + m + " " + p + " -> " + want,
    () => eq(call(m, p, sid).status, want, "status"));
}`;

const RACE_PLAY = RUNNER + String.raw`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let db;
const reset = () => (db = { coupons: new Map([["WELCOME50", { used: false }]]), credit: 0 });

// Stand-ins for single SQL statements. Every await is a round trip.
async function selectCoupon(code) { await sleep(2); return db.coupons.get(code); }
async function markUsed(code) { await sleep(2); db.coupons.get(code).used = true; }
// UPDATE coupons SET used = true WHERE code = $1 AND used = false RETURNING code
async function claim(code) {
  await sleep(2);
  const c = db.coupons.get(code);
  if (!c || c.used) return false;
  c.used = true;              // check and set with nothing in between
  return true;
}

// POST /api/coupons/redeem: single use, worth 50.
async function redeem(code) {
  const c = await selectCoupon(code);
  if (!c || c.used) return "rejected";
  await markUsed(code);
  db.credit += 50;
  return "ok";
}

test("redeem, then redeem again: ok, rejected", async () => {
  reset();
  eq([await redeem("WELCOME50"), await redeem("WELCOME50")], ["ok", "rejected"]);
});
test("ten requests in the same instant: exactly one wins", async () => {
  reset();
  const r = await Promise.all(Array.from({ length: 10 }, () => redeem("WELCOME50")));
  eq([r.filter((x) => x === "ok").length, db.credit], [1, 50], "[wins, credit]");
});`;

const MISCONFIG_PLAY = RUNNER + String.raw`
const ALLOWED = ["https://shop.test", "https://admin.shop.test"];

// Which origins may read responses that carry the user's cookies?
function corsHeaders(origin) {
  if (origin && origin.endsWith("shop.test")) {
    return { "Access-Control-Allow-Origin": origin,
             "Access-Control-Allow-Credentials": "true", Vary: "Origin" };
  }
  return {};
}

// The last middleware: turns any thrown error into a response.
function errorResponse(err, env, requestId) {
  return { status: 500, body: { error: err.message, stack: err.stack, env } };
}

for (const o of ALLOWED) {
  test("allows " + o, () => eq(corsHeaders(o)["Access-Control-Allow-Origin"], o));
}
for (const o of ["https://notshop.test", "http://shop.test", "null", undefined]) {
  test("refuses " + o, () => eq(corsHeaders(o), {}));
}
test("in production, a 500 says nothing about the internals", () => {
  const err = new Error('relation "users_v2" does not exist');
  eq(errorResponse(err, { NODE_ENV: "production" }, "req_8f3a"),
     { status: 500, body: { error: "Internal error", requestId: "req_8f3a" } });
});`;

export default {
  id: "finding-vulns",
  n: 28,
  part: "E",
  title: "Finding vulnerabilities",
  hook: "Read your own app the way a stranger with a proxy reads it, and fix what you find before they do.",
  minutes: 80,
  levels: ["use", "understand"],
  sections: [
    {
      title: "The reviewer's mindset",
      beats: [
        { t: "say", x: "Auth and security was the list of defences. This is the other half: finding where your own code forgot one. Every exercise is the same loop: **spot the flaw, say the impact in one sentence, write the fix, add a test that keeps it fixed.**" },
        { t: "say", h: "Draw the trust boundary", x: "Everything that arrives at your server, the body, the headers, the cookies, the query, the order and timing of requests, was chosen by the client. Your page is one client. A script with the user's cookie is another, and it skips every check the page runs." },
        {
          t: "predict",
          lang: "jsx",
          src: "// Client\n{user.role === 'admin' && (\n  <button onClick={() => api.delete(`/api/users/${id}`)}>Delete user</button>\n)}\n\n// Server\napp.delete('/api/users/:id', requireLogin, async (req, res) => {\n  await Users.deleteOne({ _id: req.params.id });\n  res.sendStatus(204);\n});",
          q: "A logged-in user who isn't an admin sends that DELETE by hand. What happens?",
          options: ["403: the button is hidden from them", "The user is deleted", "401: requireLogin rejects them", "CORS blocks the request"],
          answer: 1,
          why: "Hiding the button is UX. The server checks only that someone is logged in, so any account can delete any user. The fix lives on the route: require the admin role there, and test it with a non-admin session.",
        },
        {
          t: "play",
          mode: "js",
          title: "a checkout that trusts the page",
          js: TRUST_PLAY,
          task: "Three tests fail. Fix `checkout` so the server looks up the price, validates qty and sku itself, and ignores what the body says the price is.",
        },
        {
          t: "pitfall",
          h: "Every client check needs a server twin",
          x: "`disabled` buttons, `maxlength`, hidden fields, a price in a data attribute, a step the wizard won't let you skip: all of them are suggestions to the browser. In review, for every rule the UI enforces, find the line on the server that enforces it too. No line, no rule.",
        },
        {
          t: "quiz",
          q: "Which of these is a server-side trust boundary bug?",
          options: ["The form validates email format with a regex", "The server reads `req.body.userId` to decide whose cart to update", "The client caches the product list for 60 seconds", "The page shows prices rounded to cents"],
          answer: 1,
          why: "Who the caller is comes from the session, never from a field the caller filled in. The other three are client conveniences; if they're wrong, the user sees a wrong page, and nobody gets someone else's cart.",
        },
      ],
    },
    {
      title: "Your app, as an outsider sees it",
      beats: [
        { t: "say", x: "Before reading your server code, read what you ship. Anyone can open DevTools on your production site, and everything there is public: the bundle, its source maps, storage, every response header and every error page." },
        {
          t: "table",
          head: ["Look at", "What it can leak", "Reduce it"],
          rows: [
            ["The JS bundle", "Every API path, admin routes included; feature flags; inlined keys", "Allow-list client config; split admin into its own bundle behind auth"],
            ["Source maps", "Your original source, comments and TODOs included", "Hidden maps, uploaded to the error tracker, never deployed"],
            ["localStorage, cookies", "Tokens readable by any script; PII cached in plain JSON", "HttpOnly session cookie; store ids, not profiles"],
            ["API responses", "Fields the UI never shows: emails, hashes, internal flags", "Serialise through an explicit output shape"],
            ["Headers, error pages", "Framework and version, stack traces, internal hostnames", "Generic errors with a request id; drop `X-Powered-By`"],
          ],
          caption: "DevTools, panel by panel, shows how to read each of these. Here you read them as a reviewer.",
        },
        {
          t: "play",
          mode: "js",
          title: "what the bundle carries",
          js: CONFIG_PLAY,
          task: "A denylist decides what ships, so new secrets ship by default. Rewrite `publicConfig` as an allow-list of the three public keys, then rerun.",
        },
        {
          t: "pitfall",
          h: "The bundle is the API map",
          x: "Hiding the admin screen hides nothing: its route strings, request shapes and role names are still in the minified JS everyone downloads. Assume every endpoint in your bundle is known, and review each as if it were documented publicly. Then check the server guards each one.",
        },
        {
          t: "predict",
          lang: "js",
          src: "// User schema: name, avatar, email, passwordHash, role, ...\n// GET /api/users/42  -> rendered as a profile card\nres.json(await User.findById(req.params.id).lean());",
          q: "The card shows name and avatar. What does the network panel show?",
          options: ["Name and avatar", "The whole document: email, password hash, role, every internal field", "Nothing: `.lean()` strips private fields", "An error, because the id is a string"],
          answer: 1,
          why: "The UI choosing what to render is not the server choosing what to send. Every field crosses the wire. This is API3, broken object property level authorisation: map to an output shape, `{ id, name, avatar }`, on the server.",
        },
        {
          t: "code",
          lang: "bash",
          src: "# Audit a production build the way a visitor would, before you deploy it.\nnpm run build\n\n# any source maps that would ship?\nfind dist -name '*.map'\n\n# secret-shaped strings and internal hosts in the output\ngrep -rEn 'sk_(live|test)_|-----BEGIN|\\.internal\\b|localhost:[0-9]+' dist/\n\n# every API path the client knows about, to check each has a server guard\ngrep -rhoE '/api/[A-Za-z0-9_/.-]+' dist/ | sort -u\n\n# what the live site says about itself\ncurl -sI https://shop.test/ | grep -iE 'server|x-powered-by|access-control'",
          note: "Put the first two checks in CI against the build artifact. The third list is your review agenda for the access-control section.",
        },
      ],
    },
    {
      title: "Checklists as review questions",
      beats: [
        { t: "say", x: "The OWASP Top 10:2025 and the API Security Top 10:2023 are most useful as questions to ask of a diff. Don't memorise the ranks. Learn the question each one makes you ask." },
        {
          t: "table",
          head: ["Top 10:2025", "Ask of the code"],
          rows: [
            ["A01 Broken Access Control (now incl. SSRF, CSRF)", "Does every lookup include the owner? Can the server be told what URL to fetch?"],
            ["A02 Security Misconfiguration", "Debug on? Verbose errors? CORS wider than the allow-list? Defaults left in?"],
            ["A03 Software Supply Chain Failures", "Is the lockfile committed and installed with `npm ci`? Who can publish what we run?"],
            ["A04 Cryptographic Failures", "Sensitive data in plain text at rest or in logs? Home-made crypto? Weak password hash?"],
            ["A05 Injection", "Does any input reach SQL, a shell, a template or the DOM as code instead of data?"],
          ],
        },
        {
          t: "table",
          head: ["Top 10:2025", "Ask of the code"],
          rows: [
            ["A06 Insecure Design", "What happens if a step is skipped, repeated or done twice at once?"],
            ["A07 Authentication Failures", "Rate limits on login and reset? Sessions rotated at login, killed at logout?"],
            ["A08 Software or Data Integrity Failures", "Do we deserialise, auto-update or trust data without checking a signature?"],
            ["A09 Security Logging and Alerting Failures", "Would we notice someone walking ids? Are denials logged and alerted on?"],
            ["A10 Mishandling of Exceptional Conditions", "When a dependency throws or times out, do we fail closed or fail open?"],
          ],
        },
        {
          t: "table",
          head: ["API Top 10:2023", "Ask of the handler"],
          rows: [
            ["API1 BOLA", "Is the object fetched by id AND owner or tenant?"],
            ["API2 Broken Authentication", "Is every route behind auth unless it's on a short public list?"],
            ["API3 Broken Object Property Level Authz", "Which fields can be read? Which can be written? Both from an allow-list?"],
            ["API4 Unrestricted Resource Consumption", "Page size capped? Upload size capped? Costly calls (SMS, email) rate-limited?"],
            ["API5 BFLA", "Is the role checked on the route, not just the button?"],
            ["API6 Sensitive Business Flows", "Can a script buy all the stock, mint all the invites, farm all the referrals?"],
            ["API7 SSRF, API10 Unsafe Consumption", "Do we fetch user-supplied URLs? Do we validate what third-party APIs send back?"],
            ["API8 Misconfiguration, API9 Inventory", "Is there an old `/v1` or a staging host still live, with older, weaker checks?"],
          ],
        },
        {
          t: "quiz",
          q: "A diff adds `GET /api/v1/invoices/:id` alongside `/v2`, copied from an old branch. v2 scopes by owner; v1 doesn't. Which items does it hit?",
          options: ["Only A05 Injection", "API1 BOLA, and API9 Improper Inventory Management", "API4 only", "None: v1 is deprecated"],
          answer: 1,
          why: "Deprecated still answers. Old versions keep the old checks, and attackers try every version they can find in the bundle or docs. Inventory means knowing every route that is live, and retiring the ones that shouldn't be.",
        },
        {
          t: "pitfall",
          h: "A checklist finds categories, not your bugs",
          x: "Ticking A01 on a review form proves someone read the word. The bug lives in one route's `WHERE`. Use the lists to choose questions, then answer them per handler, with a test. A review that ends with no new tests usually ended early.",
        },
      ],
    },
    {
      title: "Access-control bugs in code",
      beats: [
        { t: "say", x: "Access control fails three ways, and each has a code shape you can learn to see: an object fetched by id alone, a body copied into a record, and a route guarded by login but not by role. Scanners rarely see any of them, because the code is valid." },
        {
          t: "play",
          mode: "js",
          title: "an orders handler, two test users",
          js: IDOR_PLAY,
          task: "Three cases fail: Ada reads Bob's order, Bob reads both of Ada's. Fix `getOrder` so the owner is part of the lookup, and keep the 404 for both missing and not-yours.",
        },
        {
          t: "predict",
          lang: "js",
          src: "// GET /api/orders?userId=7\napp.get('/api/orders', requireLogin, async (req, res) => {\n  const userId = req.query.userId ?? req.user.id;\n  res.json(await Orders.find({ userId }).limit(50));\n});",
          q: "Does this handler leak other users' data?",
          options: ["No: requireLogin runs first", "Yes: any logged-in user can list anyone's orders by changing `userId`", "Only if ids are sequential", "No: the limit of 50 caps it"],
          answer: 1,
          why: "The default is right and the override is the bug. A query parameter that names whose data to load is the caller choosing their own permissions. Delete the parameter, or allow it only for a role you check on this route.",
        },
        {
          t: "play",
          mode: "js",
          title: "a profile update that copies everything",
          js: MASS_PLAY,
          task: "Make all four pass: copy only `name` and `bio`, check they're strings, and return an explicit output shape from GET.",
        },
        {
          t: "play",
          mode: "js",
          title: "admin routes behind a login check",
          js: BFLA_PLAY,
          task: "Ada reaches both admin routes, and a route nobody gave a role is open. Give each route the role it needs, answer 403 when the user lacks it, and deny any route with no role.",
        },
        {
          t: "steps",
          h: "The two-user test (OWASP WSTG-ATHZ-04)",
          items: [
            "Make two accounts with the same role in the same app: A and B. Add an admin C if roles exist, and a second tenant if you're multi-tenant.",
            "As B, create one of everything: an order, a note, an invite, a file. Record every id the API returns.",
            "As A, replay each of B's requests, reads and writes, with B's ids and A's session. Anything but 403 or 404 is a finding.",
            "Repeat with A's role against C's admin-only routes, and with no session at all.",
            "Turn every request you replayed into a test case, so the matrix runs in CI on every change.",
          ],
        },
        {
          t: "pitfall",
          h: "Writes and side doors get missed",
          x: "People test `GET /orders/:id` and stop. Check PATCH and DELETE on the same id, bulk endpoints that take an array of ids, exports, file downloads by key, websocket messages that name a room, and GraphQL nodes fetched through a parent you do own.",
        },
      ],
    },
    {
      title: "Business logic and races",
      beats: [
        { t: "say", x: "Some of the costliest bugs break no rule on any single request. A coupon redeemed twice, a refund issued twice, a free trial started ten times. The code checks, then acts, and the gap between the two is where a second request lands." },
        {
          t: "predict",
          lang: "js",
          src: "app.post('/api/invites/:code/accept', requireLogin, async (req, res) => {\n  const inv = await Invites.findOne({ code: req.params.code });\n  if (!inv || inv.usesLeft === 0) return res.sendStatus(410);\n  await Members.create({ team: inv.team, user: req.user.id });\n  await Invites.updateOne({ _id: inv._id }, { $inc: { usesLeft: -1 } });\n  res.sendStatus(201);\n});",
          q: "An invite has `usesLeft: 1`. Five users accept it in the same 20 ms. How many join?",
          options: ["One", "Up to five, and `usesLeft` goes negative", "None: the first request locks the row", "Two at most"],
          answer: 1,
          why: "All five read `usesLeft: 1` before any decrement lands. Each request is valid on its own, so no single log line looks wrong. Only an atomic condition in the write, `usesLeft > 0`, makes the database pick one winner.",
        },
        {
          t: "play",
          mode: "js",
          title: "a single-use coupon, ten at once",
          js: RACE_PLAY,
          task: "One by one it works; in parallel all ten win. Rewrite `redeem` around `claim`, which checks and sets in one step, so exactly one request gets the credit.",
        },
        {
          t: "table",
          head: ["Fix", "How", "Holds across servers"],
          rows: [
            ["Conditional update", "`UPDATE ... SET used = true WHERE code = $1 AND used = false`, check rows changed", "Yes: the database serialises it"],
            ["Unique constraint", "`UNIQUE (coupon_id, user_id)` on redemptions; insert, catch the conflict", "Yes, and it guards every future code path"],
            ["Idempotency key", "Client sends a key per action; server stores key and result, replays the result", "Yes, if the key is stored with a unique index"],
            ["Row lock in a transaction", "`SELECT ... FOR UPDATE`, then check and write", "Yes, at the cost of holding a lock"],
            ["In-process mutex", "A lock object in Node memory", "No: the second instance has its own memory"],
          ],
          caption: "Do the money move in the same transaction as the claim, or a crash between them loses one or the other.",
        },
        {
          t: "quiz",
          q: "You fix the coupon race with an in-memory lock keyed by coupon code. Tests pass locally. Production runs four Node processes. What now?",
          options: ["Fixed: the lock is per code", "Still broken: each process has its own lock, so up to four requests win", "Fixed, but slower", "Broken only under HTTP/2"],
          answer: 1,
          why: "The lock lives in one process's memory. Load balancing spreads the burst across all four. Put the decision in the shared store: a conditional update or a unique constraint, and test with requests fired in parallel.",
        },
        {
          t: "pitfall",
          h: "Idempotency keys belong to a user",
          x: "Store the key with the user id and the request's hash, and look it up by all three. A global key lets one user's retry return another user's cached response, and a reused key with a different body should get an error, not a silent replay of the first result.",
        },
      ],
    },
    {
      title: "Misconfiguration and exceptions",
      beats: [
        { t: "say", x: "Misconfiguration is the gap between the app you tested and the one you deployed: a debug flag, a permissive CORS rule added for a demo, an error handler that was fine in dev. Review the deployed config and responses, not just the repo." },
        {
          t: "play",
          mode: "js",
          title: "a CORS rule and an error handler",
          js: MISCONFIG_PLAY,
          task: "Make `corsHeaders` match the exact `ALLOWED` list, and make `errorResponse` return a generic body with the request id in production. Log the details server-side.",
        },
        {
          t: "predict",
          lang: "js",
          src: "async function requireAdmin(req, res, next) {\n  try {\n    const ok = await policy.isAdmin(req.user.id);   // calls the policy service\n    if (!ok) return res.sendStatus(403);\n  } catch (err) {\n    log.warn({ err }, 'policy check failed');\n  }\n  next();\n}",
          q: "The policy service times out for ten minutes. What do non-admins get on admin routes?",
          options: ["403", "503", "Admin access", "A 500 with the timeout message"],
          answer: 2,
          why: "The `catch` logs and falls through to `next()`. The check fails open. That's A10, Mishandling of Exceptional Conditions. Deny in the catch: `return res.sendStatus(503)`, and test it by making the stub throw.",
        },
        {
          t: "table",
          head: ["Review item", "What good looks like"],
          rows: [
            ["Debug and admin tools", "`/debug`, `/graphql` playground, Swagger UI, `/metrics` off or behind auth in prod"],
            ["Error responses", "Generic message plus request id; stack only in logs; `NODE_ENV=production` set"],
            ["CORS", "Exact origin allow-list; credentials only for origins that need them; `Vary: Origin`"],
            ["Security headers", "Checked on the live response, every route, including errors and redirects"],
            ["Defaults", "No sample accounts, default passwords, or open storage buckets in any environment"],
            ["Environments", "Staging and preview deploys don't use production data or production keys"],
          ],
          caption: "Auth and security has the header values. This list is what to verify against the running app.",
        },
        {
          t: "pitfall",
          h: "Express shows stacks unless told it's production",
          x: "Express's default error handler includes the stack trace in the response unless `NODE_ENV` is `production`. Forget that variable on one host, a container or a preview deploy, and every unhandled error prints file paths and code. Write your own final handler, and check the live response.",
        },
        {
          t: "pitfall",
          h: "Preview deploys are production to an attacker",
          x: "Per-branch preview URLs often skip protections production has, run with debug on, and sometimes point at real data. Their links leak through PR comments, chat and referrers. Put them behind auth, give them their own data, and expire them.",
        },
      ],
    },
    {
      title: "Automation, and what it can't see",
      beats: [
        { t: "say", x: "Tools find the bugs that have a shape: a known-vulnerable package version, a dangerous function call, a missing header, a key-shaped string. They miss the bugs that need to know who owns what. Run all of them, and don't let green mean safe." },
        {
          t: "table",
          head: ["Tool", "Finds", "Misses"],
          rows: [
            ["`npm audit`, Dependabot", "Known advisories in your dependency tree; Dependabot opens upgrade PRs", "Malicious packages without an advisory; whether the bug is reachable"],
            ["SAST: Semgrep, CodeQL", "Risky patterns and tainted data flows in source", "Missing checks: a lookup without an owner is valid code"],
            ["DAST: ZAP baseline", "Headers, cookies, leaky errors, as seen on the running app", "Anything behind login it can't reach; logic; authorisation"],
            ["Secret scanning", "Key-shaped strings in commits; push protection blocks new ones", "Secrets in images, logs or chat; secrets in history already cloned"],
            ["Your two-user tests", "BOLA, BFLA, mass assignment, races", "Only the cases you wrote"],
          ],
        },
        {
          t: "code",
          lang: "yaml",
          file: ".github/workflows/security.yml",
          src: "name: security\non: [pull_request]\njobs:\n  deps:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v7\n      - run: npm ci\n      - run: npm audit --audit-level=high --omit=dev\n\n  zap-baseline:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v7\n      - run: docker compose up -d --wait   # the app on :3000, seeded test data\n      - run: |\n          docker run --rm --network host -v \"$PWD:/zap/wrk:rw\" \\\n            ghcr.io/zaproxy/zaproxy:stable \\\n            zap-baseline.py -t http://localhost:3000 -c zap-rules.tsv -r zap-report.html",
          mark: [9, 19],
          note: "The baseline spiders for a minute and only watches responses: it's passive, so it's safe on your own staging. `-c` reads a rules file that sets each alert to IGNORE, WARN or FAIL.",
        },
        {
          t: "quiz",
          q: "The ZAP baseline run reports two WARN alerts and no FAIL. What does `zap-baseline.py` exit with?",
          options: ["0", "1", "2", "3"],
          answer: 2,
          why: "0 is pass, 1 means at least one FAIL, 2 means warnings and no FAIL, 3 is any other failure. A plain CI step fails on any non-zero, so decide per rule in the config file instead of letting warnings go permanently red and ignored.",
        },
        {
          t: "pitfall",
          h: "Green CI is a floor, not a verdict",
          x: "Every tool above passes an app where any user can read any order. Treat automation as the floor that catches regressions in known shapes, and keep the authorisation matrix and race tests as the part only you can write.",
        },
        { t: "say", h: "Intercepting proxies", x: "**Burp Suite Community** and **ZAP** (long known as OWASP ZAP) sit between your browser and your app and show every request and response, editable before it's sent. They answer one question fast: what does my app actually accept, beyond what my page sends?" },
        {
          t: "pitfall",
          h: "`npm audit fix --force` is a major upgrade",
          x: "`--force` installs semver-major versions to clear advisories, which can break your app in ways the audit doesn't test. Read the advisory, check whether your code reaches the vulnerable function, and upgrade on a branch with tests. Many dev-only findings never ship to users at all.",
        },
      ],
    },
    {
      title: "Disclosure, reports, regression tests",
      beats: [
        { t: "say", h: "Scope is permission", x: "Test what you own, or what you have written permission to test, and nothing else. A bug bounty's scope page is that permission: its listed hosts, its excluded techniques, its rules on data. Outside it, the same request is unauthorised access." },
        {
          t: "quiz",
          q: "Your app embeds a third-party payments widget. While reviewing your traffic you notice its API returns other merchants' names. What do you do?",
          options: ["Probe its API further to confirm the impact", "Stop there, write down what you saw, and report to the vendor through their security contact or bounty program", "Post it publicly so they fix it fast", "Nothing: it isn't your code"],
          answer: 1,
          why: "Your permission covers your app, not theirs. Don't go further to prove it: report what you saw, how, and when. Use their `security.txt`, bounty program or security contact, and give them time to fix before anyone discusses it publicly.",
        },
        {
          t: "code",
          lang: "text",
          file: "/.well-known/security.txt",
          src: "Contact: mailto:security@shop.test\nExpires: 2027-10-01T00:00:00Z\nPolicy: https://shop.test/security/policy\nAcknowledgments: https://shop.test/security/thanks\nPreferred-Languages: en",
          note: "RFC 9116. `Contact` and `Expires` are required. Publish one for your own app so the next person who finds a bug knows where to send it.",
        },
        {
          t: "steps",
          h: "A report someone can act on",
          items: [
            "Title: the flaw and where. \"Order endpoint returns any user's order by id\", not \"IDOR found\".",
            "Impact in one sentence: who can do what to whom. \"Any logged-in user can read every customer's address and order history.\"",
            "Steps to reproduce with your own two test accounts, the exact request, and the response you saw.",
            "Affected routes, versions and environments, and what you did not test.",
            "Severity with the reason, and a suggested fix: \"add `owner_id = $2` to the lookup\".",
            "No real users' data in the report. Redact what you saw and say you stopped there.",
          ],
        },
        {
          t: "pitfall",
          h: "Severity is impact times reach, not cleverness",
          x: "A one-line missing ownership check that exposes every customer outranks an elaborate bug that needs an admin's session. Rate by what an ordinary logged-in user can do to other people's data and money, and say so in the report.",
        },
        {
          t: "compare",
          a: { label: "Fix only", lang: "js", src: "// orders.js\nconst o = await Orders.findOne({\n  _id: req.params.id,\n  owner: req.user.id,     // fixed 2026-10-05\n});" },
          b: { label: "Fix plus regression test", lang: "js", src: "// orders.test.js\ntest.each(matrix)('$as GET order of $owner -> $want',\n  async ({ as, owner, want }) => {\n    const id = await seedOrder(owner);\n    const res = await api(as).get(`/api/orders/${id}`);\n    expect(res.status).toBe(want);\n  });" },
          x: "The fix lasts until someone rewrites the query. The matrix fails the day ownership is dropped, and documents the rule. Testing and honesty has the rest: see it fail first.",
        },
        {
          t: "mission",
          h: "Audit one of your own apps",
          x: "Pick an app you own. Build it and grep the output, list every route in the bundle, then run the two-user matrix against each. Fire ten parallel requests at every one-time action. Write each finding as a report, fix it, and land a test that fails without the fix.",
          hint: "Seed two users and an admin in a test database, and drive the API with a supertest-style client. Run the race checks with `Promise.all`, and assert both the status codes and the final database state.",
          solution: {
            lang: "js",
            src: "// authz.test.js: the matrix as data, one row per request you'd replay by hand.\nconst users = ['ada', 'bob', 'admin'];\nconst routes = [\n  { method: 'get',    path: (o) => `/api/orders/${o.id}`, rule: 'owner' },\n  { method: 'patch',  path: (o) => `/api/orders/${o.id}`, rule: 'owner' },\n  { method: 'get',    path: () => '/api/admin/users.csv', rule: 'admin' },\n];\nconst allowed = { owner: (u, o) => u === o.owner, admin: (u) => u === 'admin' };\n\nfor (const r of routes) for (const as of users) for (const owner of ['ada', 'bob']) {\n  test(`${as} ${r.method} ${r.path({ id: ':id' })} of ${owner}`, async () => {\n    const order = await seedOrder(owner);\n    const res = await api(as)[r.method](r.path(order)).send({});\n    const ok = allowed[r.rule](as, order);\n    expect(ok ? res.status < 400 : [403, 404].includes(res.status)).toBe(true);\n  });\n}\n\ntest('coupon: ten parallel redeems, one credit', async () => {\n  const code = await seedCoupon();\n  const res = await Promise.all(Array.from({ length: 10 }, () =>\n    api('ada').post('/api/coupons/redeem').send({ code })));\n  expect(res.filter((r) => r.status === 200)).toHaveLength(1);\n  expect(await creditOf('ada')).toBe(50);\n});",
          },
        },
      ],
    },
  ],
  nobodyTells: [
    "Review the diff for what's missing, not what's there. The dangerous line is the `WHERE` without an owner, and no tool highlights a line that doesn't exist.",
    "Return 404 for both missing and not-yours, and log the not-yours case. A run of them across sequential ids is someone testing your access control.",
    "Every `Object.assign(record, req.body)` and every `res.json(document)` is a mass-assignment or over-exposure finding until proven otherwise.",
    "Any action worth money gets a parallel test: fire ten at once and assert one winner. Sequential tests can't see a race.",
    "Old API versions, preview deploys and staging hosts are part of your attack surface. If it answers on the internet, it's in scope for your review.",
    "Write the regression test from the report's reproduction steps, before the fix, and watch it fail. Then it proves the fix, not just the code.",
    "Silence from a scanner on a login-walled app usually means it never got past the login page. Check what it actually crawled.",
  ],
  glossary: [
    ["trust boundary", "The line where data arrives from something you don't control. Everything crossing it is checked on the server."],
    ["BOLA", "Broken object level authorisation: fetching an object by a caller-supplied id without checking ownership. API1."],
    ["BFLA", "Broken function level authorisation: a route checks login but not the role the action needs. API5."],
    ["mass assignment", "Copying request fields straight into a record, so a caller can set fields the UI never offered."],
    ["check-then-act race", "Reading a condition, then acting on it in a later step, so concurrent requests all pass the check."],
    ["idempotency key", "A client-chosen key per action; the server stores it with the result and replays the result for repeats."],
    ["fail open", "Granting access when a check errors or times out. The safe default is to deny."],
    ["SAST", "Static analysis: scanning source for risky patterns and data flows without running it. Semgrep, CodeQL."],
    ["DAST", "Dynamic analysis: probing the running app over HTTP. The ZAP baseline is a passive form of it."],
    ["passive scan", "Inspecting responses the app already sends, without crafting attack requests."],
    ["intercepting proxy", "A tool between browser and app that shows and edits every request. Burp Suite, ZAP."],
    ["secret scanning", "Matching commits against known key formats; push protection blocks a match before it lands."],
    ["security.txt", "RFC 9116 file at `/.well-known/security.txt` telling researchers where to report bugs."],
    ["regression test", "A test that reproduces a fixed bug, so it fails if the bug ever returns."],
  ],
  explain: "Explain to a friend how you'd audit your own app before launch: what you'd read in the browser, which two-user and parallel tests you'd write, and what scanners can and can't find.",
};
