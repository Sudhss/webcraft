const TIMING_PLAY = String.raw`// Stand-in for argon2id: burns about 40 ms of CPU.
function slowHash(pw) {
  const end = performance.now() + 40;
  let x = 0;
  while (performance.now() < end) x++;
  return "h(" + pw + ")";
}
const users = new Map([["ada@x.io", { hash: slowHash("correct horse") }]]);

function login(email, pw) {
  const user = users.get(email);
  if (!user) return "Invalid email or password";
  if (slowHash(pw) !== user.hash) return "Invalid email or password";
  return "welcome";
}

function attempt(email, pw) {
  const t = performance.now();
  const msg = login(email, pw);
  console.log(email.padEnd(12), (performance.now() - t).toFixed(1).padStart(6), "ms ", msg);
}
for (const e of ["ada@x.io", "bob@x.io", "eve@x.io", "ada@x.io"]) attempt(e, "guess");
attempt("ada@x.io", "correct horse");`;

const JWT_PLAY = String.raw`// A toy HMAC so this runs anywhere. Real code: crypto.createHmac("sha256", key),
// compared with crypto.timingSafeEqual.
const b64u = (s) => btoa(s).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
const unb64u = (s) => atob(s.replace(/-/g, "+").replace(/_/g, "/"));
function toyHmac(key, data) {
  let h = 2166136261;
  for (const c of key + "|" + data) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return b64u(String(h >>> 0));
}
const now = () => Math.floor(Date.now() / 1000);

function sign(payload, key) {
  const head = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64u(JSON.stringify(payload));
  return head + "." + body + "." + toyHmac(key, head + "." + body);
}

// The bug: it lets the token say how it should be checked.
function verify(token, key) {
  const [h, p, sig] = token.split(".");
  const header = JSON.parse(unb64u(h));
  const claims = JSON.parse(unb64u(p));
  if (header.alg === "none") return claims;
  if (toyHmac(key, h + "." + p) !== sig) throw new Error("bad signature");
  return claims;
}

const KEY = "server-secret";
const good = sign({ sub: "42", role: "user", exp: now() + 900 }, KEY);
const forever = sign({ sub: "42", role: "user" }, KEY); // no exp at all
const forged = b64u(JSON.stringify({ alg: "none" })) + "." +
  b64u(JSON.stringify({ sub: "1", role: "admin" })) + ".";

console.log("no key needed to read it:", unb64u(good.split(".")[1]));
for (const [name, t] of [["good", good], ["no exp", forever], ["forged", forged]]) {
  try { console.log(name.padEnd(7), "accepted", verify(t, KEY)); }
  catch (e) { console.log(name.padEnd(7), "rejected:", e.message); }
}`;

const URL_HTML = String.raw`<label>Website, from a user's profile<br>
  <input id="u" size="44" value="javascript:console.log('XSS ran')">
</label>
<p id="slot"></p>
<pre id="out"></pre>`;

const URL_JS = String.raw`const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// TODO: parse with new URL(raw, "https://app.test/") and return the URL only
// if its protocol is "https:" or "mailto:". Otherwise return "#".
function safeUrl(raw) {
  return raw;
}

const input = document.querySelector("#u");
function render() {
  // What a server template does: escape the value, paste it into HTML source.
  document.querySelector("#slot").innerHTML =
    '<a href="' + escapeHtml(safeUrl(input.value)) + '">their website</a>';
  const a = document.querySelector("#slot a");
  document.querySelector("#out").textContent =
    "href     = " + a.getAttribute("href") + "\nprotocol = " + a.protocol;
}
input.addEventListener("input", render);
render();`;

export default {
  id: "auth-security",
  n: 27,
  part: "E",
  title: "Auth and security",
  hook: "Breaches are rarely broken crypto. They're a query missing `AND owner_id = $2`. Here are the bugs that matter.",
  minutes: 95,
  levels: ["use", "understand"],
  sections: [
    {
      title: "Who are you, and may you?",
      beats: [
        { t: "say", x: "**Authentication** is who is calling. **Authorisation** is whether they may do this, to this object. A library handles the first. The second is your code, on every route, and it's where the worst API bugs live." },
        {
          t: "predict",
          lang: "js",
          src: "// requireLogin sets req.user or answers 401\napp.get('/api/invoices/:id', requireLogin, async (req, res) => {\n  const inv = await db.one(\n    'SELECT * FROM invoices WHERE id = $1', [req.params.id]);\n  res.json(inv);\n});",
          q: "Ada is logged in and owns invoice 1041. She requests `/api/invoices/1042`. What happens?",
          options: ["401: she isn't logged in for that invoice", "She gets someone else's invoice", "404", "403"],
          answer: 1,
          why: "`requireLogin` proved *who* she is. Nothing checked that 1042 is *hers*. That's **IDOR**, which OWASP's API Security Top 10 calls broken object level authorisation and ranks first.",
        },
        {
          t: "compare",
          a: { label: "check afterwards, per route", lang: "js", src: "const inv = await db.one(\n  'SELECT * FROM invoices WHERE id = $1', [id]);\nif (inv.owner_id !== req.user.id) return res.sendStatus(403);\nres.json(inv);" },
          b: { label: "scope the query", lang: "js", src: "const inv = await db.oneOrNone(\n  'SELECT * FROM invoices WHERE id = $1 AND owner_id = $2',\n  [id, req.user.id]);\nif (!inv) return res.sendStatus(404);\nres.json(inv);" },
          x: "Put the owner in the `WHERE`. An `if` after the fetch gets forgotten on the next route; a scoped query can't return the wrong row. A 404 instead of a 403 also stops anyone probing which ids exist.",
        },
        {
          t: "pitfall",
          h: "Take the tenant from the session, never the request",
          x: "Multi-tenant apps love `?orgId=` or an `X-Org-Id` header. Change it and you're inside another company. Derive the tenant from the authenticated session, and in Postgres add row-level security as a backstop that holds when a query forgets.",
        },
        {
          t: "predict",
          lang: "js",
          src: "// User schema: name, email, role ('user' | 'admin')\n// PATCH /api/me   body: { \"name\": \"Ada\", \"role\": \"admin\" }\napp.patch('/api/me', requireLogin, async (req, res) => {\n  await User.updateOne({ _id: req.user.id }, req.body);\n  res.sendStatus(204);\n});",
          q: "What is Ada's role afterwards?",
          options: ["Still `user`: Mongoose drops fields you didn't expect", "`admin`", "A validation error is thrown", "It depends on the HTTP method"],
          answer: 1,
          why: "Mongoose drops only fields that aren't in the schema, and `role` is in it. This is **mass assignment**. Copy out the fields users may set, `const { name } = req.body`, or validate the body against a schema that lists only those.",
        },
        {
          t: "pitfall",
          h: "Unguessable ids are not access control",
          x: "UUIDs stop guessing, not finding. Ids leak through URLs, logs, `Referer`, shared links, and other API responses that list them. A random id is defence in depth; the ownership check is still the control.",
        },
      ],
    },
    {
      title: "Storing passwords",
      beats: [
        { t: "say", x: "You never store passwords. You store the output of a **deliberately slow** hash, so a stolen table costs the attacker days per user instead of milliseconds. SHA-256 is built to be fast, which is exactly the wrong property here." },
        {
          t: "table",
          head: ["Hash, on one RTX 5090", "Guesses per second", "1 billion guesses, one user"],
          rows: [
            ["MD5", "220 billion", "5 ms"],
            ["SHA-256", "28 billion", "35 ms"],
            ["PBKDF2-SHA256, 600k iterations", "~18,600", "~15 hours"],
            ["bcrypt, cost 10", "~9,500", "~29 hours"],
            ["scrypt, N=2^14", "~7,800", "~36 hours"],
          ],
          caption: "From a public hashcat benchmark; PBKDF2 and bcrypt scaled to these settings. A salt makes the last column per user: a million users is a million times the work.",
        },
        {
          t: "quiz",
          q: "Every hash gets its own random salt, stored right next to it. What does that stop?",
          options: ["Guessing one user's weak password", "Cracking every user in one pass, or with precomputed tables", "An attacker who has the salt", "Timing attacks on login"],
          answer: 1,
          why: "A salt makes each row a separate problem: hash a wordlist once and you match one user, not a million. It does nothing for one user's `password1`, which is why the hash must be slow too. The salt isn't secret.",
        },
        {
          t: "code",
          lang: "js",
          file: "passwords.js",
          src: "import argon2 from 'argon2';\n\n// OWASP's baseline for argon2id: 19 MiB, 2 passes, 1 lane.\nconst OPTS = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 };\n\nexport const hashPassword = (pw) => argon2.hash(pw, OPTS);\n// -> $argon2id$v=19$m=19456,t=2,p=1$<salt>$<hash>\n\nexport async function checkPassword(user, pw) {\n  if (!(await argon2.verify(user.hash, pw))) return false;\n  if (argon2.needsRehash(user.hash, OPTS)) {\n    await users.setHash(user.id, await hashPassword(pw)); // upgrade on login\n  }\n  return true;\n}",
          mark: [4, 11],
          note: "The stored string carries the algorithm, parameters and salt. Raise the cost later and each user is upgraded the next time they log in, with no migration.",
        },
        {
          t: "pitfall",
          h: "bcrypt reads only 72 bytes",
          x: "Many bcrypt libraries silently ignore everything after byte 72. In 2024 Okta bcrypt-hashed `userId + username + password` as a cache key; with a username of 52+ characters, the password stopped mattering. Never bcrypt a concatenation. Prefer argon2id.",
        },
        {
          t: "pitfall",
          h: "Password hashing shares Node's thread pool",
          x: "Async argon2 and bcrypt run on libuv's pool: 4 threads by default, shared with `fs`, `dns.lookup` and zlib. A burst of logins queues every file read and DNS lookup behind them. Rate-limit before you hash, and raise `UV_THREADPOOL_SIZE` if it bites.",
        },
        { t: "say", x: "Current NIST rules (SP 800-63B-4): at least 15 characters when a password is the only factor, accept at least 64, no composition rules, no forced periodic changes, and reject passwords that appear in breach lists. A long passphrase beats `Passw0rd1`." },
      ],
    },
    {
      title: "Logging in: enumeration, rate limits, MFA",
      beats: [
        {
          t: "play",
          mode: "js",
          title: "same message, different timing",
          js: TIMING_PLAY,
          task: "The message never differs, but the timing says which emails exist. Make the missing-user path cost one hash too (hash a dummy), rerun, and check the columns match.",
        },
        {
          t: "quiz",
          q: "Login and password reset now answer identically, in identical time. Which endpoint still tells an attacker which emails have accounts?",
          options: ["None", "Sign-up, when it says \"email already in use\"", "Logout", "The login page's HTML"],
          answer: 1,
          why: "Sign-up must refuse a taken email, and that refusal is an **account enumeration** leak. Accept the form either way and email the address (\"someone tried to register with your email\"), or rate-limit sign-up hard.",
        },
        {
          t: "table",
          head: ["Throttle by", "Stops", "Fails at"],
          rows: [
            ["IP address", "One noisy machine", "Botnets rotate IPs; offices and mobile carriers share one"],
            ["Account", "Guessing one user's password", "Hard lockouts let anyone lock your users out"],
            ["Account + IP, with backoff", "Brute force, without locking out the owner", "Low-and-slow attacks spread over many IPs"],
            ["Global failed-login rate", "Credential stuffing: many accounts, one try each", "Needs a baseline and an alert, not just a limit"],
          ],
          caption: "Use several at once. After a few failures, step up to a CAPTCHA or MFA rather than locking the account.",
        },
        {
          t: "pitfall",
          h: "`trust proxy: true` lets anyone pick their IP",
          x: "Behind a load balancer, `req.ip` is the balancer, so every user shares one rate limit. `trust proxy: true` makes Express use the left-most `X-Forwarded-For` entry, which the client wrote if your proxy appends. Set the hop count instead: `app.set('trust proxy', 1)`.",
        },
        {
          t: "quiz",
          q: "A phishing site at `shop-login.test` proxies every page of `shop.test` in real time. Which second factor still stops the takeover?",
          options: ["An SMS code", "A TOTP code from an authenticator app", "A push approval on the phone", "A passkey"],
          answer: 3,
          why: "The proxy relays codes and approvals as fast as the user supplies them. A passkey is bound to `shop.test`: on the lookalike domain the browser has no credential to offer, and nothing typed can be replayed.",
        },
        {
          t: "steps",
          h: "Signing in with a passkey (WebAuthn)",
          items: [
            "The server sends a fresh random challenge and its RP ID, the domain the credential belongs to (`shop.test`).",
            "The page calls `navigator.credentials.get()`. The browser only offers credentials for that RP ID, and only on that domain or its subdomains.",
            "The user unlocks the authenticator with a fingerprint, face or PIN. That local check is the second factor.",
            "The authenticator signs the challenge plus `clientDataJSON`, which records the origin, with a private key that never leaves it.",
            "The server verifies the signature with the stored public key, then checks the challenge, the origin and the RP ID hash.",
            "A database breach leaks only public keys. There is no shared secret to phish, reuse or crack.",
          ],
        },
      ],
    },
    {
      title: "Sessions and tokens",
      beats: [
        { t: "say", x: "After login the client carries proof on every request. Either a random **session id** that points at state in your store, or a signed **token**, usually a JWT, that carries the state itself. The difference is where the truth lives." },
        {
          t: "table",
          head: ["", "Server session", "JWT"],
          rows: [
            ["Client holds", "A long random id", "Signed JSON: claims, expiry, often hundreds of bytes"],
            ["Log out, revoke", "Delete the row. Instant", "Can't. Wait for `exp`, or keep a denylist (a store again)"],
            ["Per request", "One store lookup", "A signature check, no I/O"],
            ["Role changes", "Seen on the next request", "Old claims live until the token expires"],
            ["Fits", "A web app and its own backend", "Many services verifying without calling home, short-lived"],
          ],
          caption: "Default for a browser app with its own API: a server session in an HttpOnly cookie. Reach for JWTs when many verifiers need them, and keep them to minutes.",
        },
        {
          t: "play",
          mode: "js",
          title: "a JWT verifier with two bugs",
          js: JWT_PLAY,
          task: "Fix `verify`: pin the algorithm instead of reading it from the header, and reject tokens without a future `exp`. Then `forged` and `no exp` must be rejected and `good` accepted.",
        },
        {
          t: "pitfall",
          h: "Algorithm confusion: the public key as HMAC secret",
          x: "A verifier that accepts both RS256 and HS256 can be handed an HS256 token whose HMAC key is your RSA **public** key. It's public, so anyone can mint tokens. Tell the library the one algorithm you use: `jwt.verify(t, key, { algorithms: ['RS256'] })`.",
        },
        {
          t: "pitfall",
          h: "localStorage vs HttpOnly under XSS",
          x: "Any script on your origin reads `localStorage`, so one XSS ships the token to the attacker, who replays it from anywhere until it expires. An `HttpOnly` cookie can't be read: the XSS can only act while the victim's tab is open. Neither survives XSS; one limits the damage.",
        },
        {
          t: "code",
          lang: "js",
          file: "session.js",
          src: "import session from 'express-session';\nimport { RedisStore } from 'connect-redis';\n\napp.set('trust proxy', 1);             // TLS ends at one proxy in front\napp.use(session({\n  name: '__Host-sid',\n  store: new RedisStore({ client: redis }),\n  secret: process.env.SESSION_SECRET,\n  resave: false,\n  saveUninitialized: false,             // no cookie until there's a login\n  cookie: { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 8 * 3600e3 },\n}));\n\napp.post('/login', async (req, res, next) => {\n  const user = await authenticate(req.body.email, req.body.password);\n  if (!user) return res.status(401).json({ error: 'Invalid email or password' });\n  req.session.regenerate((err) => {    // fresh id at the privilege change\n    if (err) return next(err);\n    req.session.userId = user.id;\n    res.sendStatus(204);\n  });\n});",
          mark: [6, 17],
          note: "Without `regenerate`, an id an attacker planted before login (session fixation) becomes a logged-in session. Logout should `destroy` the row, not just clear the cookie.",
        },
      ],
    },
    {
      title: "CSRF, and what CORS is not",
      beats: [
        {
          t: "viz",
          name: "frames",
          props: {
            cols: ["Ada's browser", "evil.test page", "bank.test server"],
            frames: [
              { cells: [["logged in to bank.test", "cookie sid=9f2c; SameSite=None"], [], ["session 9f2c: Ada"]], note: "Ada is logged in to her bank. Its session cookie says `SameSite=None` so a partner widget can use it." },
              { cells: [["tab 2: evil.test"], ["hidden form", "action=bank.test/transfer", "to=mallory, amount=500"], ["session 9f2c: Ada"]], note: "In another tab she opens a page the attacker controls. It holds a hidden form pointed at the bank." },
              { cells: [["tab 2: evil.test"], ["form.submit()"], ["session 9f2c: Ada"]], note: "A script submits it on load. No click. Cross-origin form posts have always been allowed." },
              { cells: [["POST bank.test/transfer", "Cookie: sid=9f2c"], [], ["session 9f2c: Ada", "POST /transfer"]], note: "The browser attaches cookies by **destination**, not by who started the request. The bank sees Ada's valid session." },
              { cells: [["page: transfer complete"], [], ["session 9f2c: Ada", "moved 500 to mallory"]], note: "The server can't tell Ada's intent from the attacker's. The attacker never needed to read the response." },
              { cells: [["cookie sid=9f2c; SameSite=Lax"], ["form.submit()"], ["session 9f2c: Ada"]], note: "Replay it with `SameSite=Lax`, which Chrome also applies when the attribute is missing." },
              { cells: [["POST bank.test/transfer", "no cookie", "Sec-Fetch-Site: cross-site"], [], ["session 9f2c: Ada", "no session: 401"]], note: "Lax holds the cookie back on a cross-site POST, and `Sec-Fetch-Site` tells the server where the request came from." },
            ],
          },
        },
        {
          t: "quiz",
          q: "Untrusted user HTML is served from `u.shop.test`. Your app on `app.shop.test` uses `sid; Secure; HttpOnly; SameSite=Strict`. What can a script on `u.shop.test` do?",
          options: ["Nothing: Strict blocks it", "Read `sid`", "POST to `app.shop.test` with the cookie attached, and plant its own `sid` cookie for `shop.test`", "Only send GET requests"],
          answer: 2,
          why: "SameSite compares **sites** (scheme plus registrable domain), and both are `shop.test`, so the POST carries `sid`. It can also set a `Domain=shop.test` cookie. Host user content on a separate domain and name the cookie `__Host-sid`.",
        },
        {
          t: "table",
          head: ["Where SameSite doesn't reach", "Why"],
          rows: [
            ["A sibling subdomain: user content, a dangling DNS record", "Same site, so every cookie is sent"],
            ["State-changing GETs: `/logout`, `/unsubscribe?id=`", "Lax still sends cookies on top-level GET navigations"],
            ["Chrome, cookie with no SameSite attribute", "Lax by default, but sent on cross-site POSTs for 2 minutes after it's set"],
            ["Firefox and Safari, no SameSite attribute", "Not defaulted to Lax: behaves like None on navigations"],
            ["`SameSite=None`, for embeds or cross-site SSO", "No protection at all"],
          ],
          caption: "So SameSite is the seatbelt. Check the request's origin on the server as well.",
        },
        {
          t: "code",
          lang: "js",
          file: "csrf.js",
          src: "// Refuse cross-origin, state-changing requests. Runs before every route.\nconst SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);\nconst ORIGIN = 'https://app.shop.test';\n\napp.use((req, res, next) => {\n  if (SAFE.has(req.method)) return next();\n  const site = req.get('Sec-Fetch-Site');\n  if (site) {\n    // same-site is refused on purpose: sibling subdomains are the gap above\n    return site === 'same-origin' || site === 'none' ? next() : res.sendStatus(403);\n  }\n  // Older browsers: Origin is sent on cross-origin POSTs.\n  const origin = req.get('Origin');\n  if (!origin || origin === ORIGIN) return next(); // no Origin: not a browser attack\n  return res.sendStatus(403);\n});",
          mark: [7, 10],
          note: "Go 1.25's `http.CrossOriginProtection` works the same way. No token, no state. Keep GETs free of side effects, because this skips them.",
        },
        {
          t: "predict",
          lang: "js",
          src: "// Chrome. On https://evil.test. api.shop.test sends no CORS headers.\n// The session cookie is SameSite=None; Secure.\nfetch('https://api.shop.test/account/delete', {\n  method: 'POST',\n  credentials: 'include',\n  headers: { 'Content-Type': 'text/plain' },\n  body: '{\"confirm\":true}',\n});",
          q: "What happens?",
          options: ["The browser blocks it: no CORS headers", "It reaches the server with the cookie and runs; only the response is hidden from evil.test", "A preflight fails, so the POST is never sent", "It's sent without the cookie"],
          answer: 1,
          why: "A POST with a `text/plain` body is a CORS **simple request**: no preflight. CORS decides whether the page may *read* the response; it never stopped the request. If your server parses any body as JSON, the account is gone.",
        },
        {
          t: "pitfall",
          h: "Reflecting Origin with credentials",
          x: "Echoing the request's `Origin` into `Access-Control-Allow-Origin` with `Allow-Credentials: true` lets every site on the internet read your users' private responses. Match against an exact allow-list, and send `Vary: Origin` so caches don't hand one origin's answer to another.",
        },
      ],
    },
    {
      title: "XSS: their script, your origin",
      beats: [
        { t: "say", x: "XSS is attacker text running as script on your origin. **Stored**: it came from your database. **Reflected**: from the request. **DOM-based**: your client code moved it from `location` or `postMessage` into a sink. One fix: data never becomes code." },
        {
          t: "predict",
          lang: "js",
          src: "const bad = '<img src=x onerror=\"console.log(document.cookie)\">';\n\ndocument.querySelector('#a').innerHTML = '<script>console.log(1)</script>';\ndocument.querySelector('#b').innerHTML = bad;\ndocument.querySelector('#c').textContent = bad;",
          q: "Which elements end up running attacker code?",
          options: ["#a only", "#b only", "#a and #b", "All three"],
          answer: 1,
          why: "Script elements inserted with `innerHTML` never execute, which gives people false confidence. Event handler attributes do: the image fails to load and `onerror` runs. `textContent` never parses HTML at all.",
        },
        {
          t: "table",
          head: ["Where the value lands", "What keeps it data"],
          rows: [
            ["Element text: `<p>{x}</p>`", "HTML-escape `& < > \" '`. Every framework's default"],
            ["Quoted attribute: `title=\"{x}\"`", "HTML-escape, and always quote the attribute"],
            ["URL attribute: `href=\"{x}\"`", "Escaping isn't enough: `javascript:` is plain text. Allow only `https:`, `mailto:`"],
            ["Inside `<script>`", "Don't. Put JSON in `<script type=\"application/json\">` with `<` escaped, then parse it"],
            ["CSS: `style=\"{x}\"`", "Don't interpolate. Choose from a fixed set of values"],
          ],
        },
        {
          t: "play",
          mode: "html",
          title: "escaped, and still executable",
          html: URL_HTML,
          js: URL_JS,
          task: "The escaped link still runs script. Implement `safeUrl` with `new URL` and a protocol allow-list. Then try ` JaVaScRiPt:` with a leading space: a `startsWith` check misses it, the parser doesn't.",
        },
        {
          t: "predict",
          lang: "jsx",
          src: "// React 18. All three fields are attacker-controlled.\nfunction Profile({ user }) {\n  return (\n    <div>\n      <h2>{user.name}</h2>\n      <a href={user.website}>website</a>\n      <div dangerouslySetInnerHTML={{ __html: user.bio }} />\n    </div>\n  );\n}",
          q: "Which fields are XSS?",
          options: ["None: React escapes everything", "`bio` only", "`website` and `bio`", "All three"],
          answer: 2,
          why: "`{user.name}` is escaped text. `dangerouslySetInnerHTML` is raw HTML by design. And `href` accepts `javascript:` URLs; React 18 only logs a warning. Validate URLs yourself, whatever the framework version.",
        },
        {
          t: "code",
          lang: "js",
          src: "import DOMPurify from 'dompurify';\nimport { marked } from 'marked';\n\n// User markdown -> HTML -> sanitise LAST, right before the DOM sees it.\nconst html = DOMPurify.sanitize(marked.parse(comment.body), {\n  USE_PROFILES: { html: true },   // no SVG, no MathML\n});\nel.innerHTML = html;",
          mark: [5],
          note: "Sanitise the final string. Any change to the HTML after sanitising (a find-and-replace, another markdown pass) can rebuild what was removed.",
        },
        { t: "say", h: "CSP: the second wall", x: "A **Content Security Policy** tells the browser which scripts may run. Domain allow-lists are routinely bypassed through a JSONP endpoint or an old library on an allowed CDN. A **nonce** policy isn't: only script tags carrying this response's random nonce run." },
        {
          t: "code",
          lang: "http",
          src: "Content-Security-Policy:\n  script-src 'nonce-4pYx9kQ2wLm7' 'strict-dynamic' https: 'unsafe-inline';\n  object-src 'none';\n  base-uri 'none';\n  require-trusted-types-for 'script'\n\n<script nonce=\"4pYx9kQ2wLm7\" src=\"/app.js\"></script>",
          mark: [2, 5],
          note: "`'strict-dynamic'` trusts scripts that a nonced script loads. `https:` and `'unsafe-inline'` are only for old browsers; current ones ignore both. The last line turns on Trusted Types.",
        },
        { t: "say", h: "Trusted Types", x: "With `require-trusted-types-for 'script'`, a plain string assigned to `innerHTML` or any other DOM sink throws. Only values from a policy you wrote (say, one calling DOMPurify) pass, so every sink runs through one reviewed function. Baseline since Feb 2026." },
        {
          t: "pitfall",
          h: "A cached nonce is no nonce",
          x: "The nonce must be new on every response. Put a nonced page behind a CDN cache or a static prerender and every visitor gets the same value, which an attacker reads off the page and adds to their injected tag. Nonced HTML must not be cached; static pages use hashes instead.",
        },
      ],
    },
    {
      title: "OAuth 2 and OpenID Connect",
      beats: [
        { t: "say", x: "OAuth 2 gets your app an **access token** for someone's API without their password. **OpenID Connect** adds an **ID token**: a signed statement of who logged in. \"Sign in with X\" is OIDC; \"let this app read your calendar\" is OAuth." },
        {
          t: "viz",
          name: "frames",
          props: {
            cols: ["Your app", "Browser", "Authorization server"],
            frames: [
              { cells: [["verifier = 32 random bytes", "challenge = b64url(sha256(verifier))", "state, nonce = random"], [], []], note: "Before anything leaves, the app makes a secret **code verifier** and keeps it. Only its hash, the **code challenge**, will travel." },
              { cells: [["keeps verifier, state, nonce"], ["GET /authorize", "response_type=code", "code_challenge, method S256", "state, nonce, redirect_uri"], []], note: "The browser is sent to the provider. Assume everything in this URL leaks: history, logs, proxies." },
              { cells: [["keeps verifier, state, nonce"], ["user signs in, approves scopes"], ["stores the challenge with the grant"]], note: "The user authenticates **at the provider**. Your app never sees the password." },
              { cells: [["keeps verifier, state, nonce"], ["GET /callback?code=abc&state=..."], ["code abc: single use, short-lived"]], note: "The provider redirects back with an **authorization code**. It went through the browser, so treat it as possibly stolen." },
              { cells: [["keeps verifier, state, nonce", "state matches?"], [], []], note: "The app checks `state` against what it stored for this browser: it's finishing a login it started, not one an attacker injected." },
              { cells: [["POST /token", "code=abc", "code_verifier=..."], [], ["sha256(verifier) == challenge?"]], note: "The code is redeemed at the token endpoint, directly, with the verifier. A thief holding only the code fails here." },
              { cells: [["validate id_token:", "signature, iss, aud, exp, nonce"], [], ["access_token", "id_token", "refresh_token"]], note: "Tokens come back in a response body, never in a URL. The app validates the ID token, including its `nonce`." },
            ],
          },
        },
        {
          t: "quiz",
          q: "What does PKCE protect against that `state` doesn't?",
          options: ["Login CSRF", "A stolen authorization code being redeemed by someone else", "Phishing the user's password", "XSS in your app"],
          answer: 1,
          why: "The code crosses the browser and can leak through logs, history or a malicious app registered for the same redirect scheme. Without the verifier it's worthless. RFC 9700 requires PKCE for public clients and recommends it for all.",
        },
        {
          t: "table",
          head: ["", "ID token", "Access token"],
          rows: [
            ["Meant for", "Your app (`aud` is your client id)", "The API (resource server)"],
            ["Format", "Always a JWT", "Opaque to your app, whatever it looks like"],
            ["Used for", "Learning who logged in, once, at login", "Calling the API, on every request"],
            ["Send it to an API", "No", "Yes: `Authorization: Bearer ...`"],
            ["Your app reads it", "Yes, after validating it", "No"],
          ],
        },
        {
          t: "pitfall",
          h: "Key users on `iss` + `sub`, never on email",
          x: "`sub` is unique within an issuer and never reassigned. Email can change, can be unverified, and at some providers is user-editable. Linking accounts by the email claim has caused real takeovers (\"nOAuth\", Microsoft Entra, 2023). Store `(iss, sub)`.",
        },
        { t: "say", x: "For a SPA, the IETF's draft on browser-based apps ranks a **backend for frontend** as the safest design: your server runs the flow as a confidential client and gives the browser only an HttpOnly session cookie. No token ever reaches JavaScript." },
        {
          t: "pitfall",
          h: "Rotate refresh tokens and watch for reuse",
          x: "Each refresh returns a new refresh token and kills the old one. If a dead one is ever presented, two parties hold copies: revoke the whole family. RFC 9700 requires rotation or sender-constrained tokens for public clients.",
        },
      ],
    },
    {
      title: "Injection and SSRF",
      beats: [
        {
          t: "predict",
          lang: "js",
          src: "// GET /api/products?q=lamp&sort=price\nconst { rows } = await pool.query(\n  `SELECT id, name, price FROM products\n   WHERE name ILIKE $1\n   ORDER BY ${req.query.sort} LIMIT 50`,\n  ['%' + req.query.q + '%'],\n);",
          q: "Is this injectable?",
          options: ["No, it's parameterised", "Yes, through `sort`", "Yes, through `q`", "Only if `pg` is misconfigured"],
          answer: 1,
          why: "`$1` keeps `q` as pure data. Placeholders exist only for values, not column names or keywords, so `sort` was pasted into the SQL, where a subquery can leak data a bit at a time. Map it through an allow-list: `{ price: 'price', new: 'created_at DESC' }`.",
        },
        {
          t: "predict",
          lang: "js",
          src: "// POST /reset   Content-Type: application/json\n// body: { \"token\": { \"$ne\": null }, \"password\": \"pwned-2026\" }\nconst user = await User.findOne({ resetToken: req.body.token });\nif (!user) return res.sendStatus(400);\nawait user.setPassword(req.body.password);",
          q: "What happens?",
          options: ["400: no token equals that object", "Some user with a pending reset gets a new password", "Mongoose throws a CastError", "Every user's password is reset"],
          answer: 1,
          why: "JSON can carry objects, and `{ $ne: null }` is a query operator, not a string. The first user with any pending reset is taken over. Check types at the boundary (a schema that says `token` is a string) or turn on Mongoose's `sanitizeFilter`.",
        },
        { t: "say", h: "SSRF", x: "**Server-side request forgery** is making your server fetch a URL for the attacker: webhooks, link previews, import-from-URL, PDF renderers. Your server sits inside the network, so it reaches admin ports, internal services and the cloud metadata endpoint." },
        {
          t: "quiz",
          q: "A link-preview service rejects URLs whose `new URL(u).hostname` is `localhost`, `127.0.0.1` or `169.254.169.254`, then calls `fetch(u)`. Which input gets through?",
          options: ["`http://localhost:8080/`", "`https://evil.test/` answering `302 Location: http://169.254.169.254/latest/meta-data/`", "`http://127.0.0.1/admin`", "None of them"],
          answer: 1,
          why: "`fetch` follows redirects by default, and the check only saw the first URL. The denylist also misses `[::1]`, `0.0.0.0`, private ranges, and any name that resolves to them. Check the resolved IP on every hop.",
        },
        {
          t: "steps",
          h: "Fetching a user-supplied URL",
          items: [
            "Parse with `new URL` (chapter 1 has the parser tricks). Allow only `https:` and the ports you expect.",
            "Resolve the name yourself. Reject loopback, private, link-local and unique-local ranges, IPv4 and IPv6, including `::ffff:127.0.0.1`.",
            "Connect to the IP you checked, not the name. Resolving twice lets DNS rebinding change the answer between check and fetch.",
            "Don't follow redirects, or rerun every check on each hop.",
            "Cap size and time, and don't echo raw bodies or error details back to the caller.",
            "Backstop it in the network: run the fetcher where egress to internal ranges is blocked.",
          ],
        },
        {
          t: "pitfall",
          h: "The metadata endpoint hands out keys",
          x: "On a cloud VM, `http://169.254.169.254/` returns the instance role's credentials to anyone who can make it send a GET. That's how the 2019 Capital One breach went. Require IMDSv2, whose PUT-plus-token handshake most SSRF can't perform, and keep instance roles minimal.",
        },
      ],
    },
    {
      title: "Secrets and headers",
      beats: [
        {
          t: "pitfall",
          h: "`VITE_` and `NEXT_PUBLIC_` mean published",
          x: "Vite exposes only `VITE_`-prefixed variables to client code, and Next.js inlines `NEXT_PUBLIC_` ones into the bundle at build time. Either way the value ships in the JS every visitor downloads. A secret key there is public, whatever the variable is called.",
        },
        {
          t: "pitfall",
          h: "Deleting the commit doesn't un-leak a key",
          x: "A pushed secret is already in clones, forks, CI caches and the scrapers that watch public pushes. Rewriting history is housekeeping; the fix is to **rotate** the key. Turn on secret scanning with push protection so the next one is blocked before it lands.",
        },
        {
          t: "code",
          lang: "js",
          src: "// config.js: read secrets once and fail at boot, not on the first request.\nimport { z } from 'zod';\n\nexport const env = z.object({\n  DATABASE_URL: z.string().min(1),\n  SESSION_SECRET: z.string().min(32),\n  STRIPE_SECRET_KEY: z.string().startsWith('sk_'),\n}).parse(process.env);\n\n// logger.js: redact before anything is written.\nimport pino from 'pino';\nexport const log = pino({\n  redact: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.token'],\n});",
          mark: [8, 13],
          note: "Request logging is where secrets leak most quietly: a debug line that dumps headers puts every session cookie in your log store.",
        },
        {
          t: "table",
          head: ["Header", "Value", "Stops"],
          rows: [
            ["`Strict-Transport-Security`", "`max-age=63072000; includeSubDomains`", "Downgrades to http after the first visit"],
            ["`Content-Security-Policy`", "The nonce policy, plus `frame-ancestors 'none'`", "Injected scripts, and being framed (clickjacking)"],
            ["`X-Content-Type-Options`", "`nosniff`", "Uploads sniffed and run as script or HTML"],
            ["`Referrer-Policy`", "`strict-origin-when-cross-origin`", "Full URLs, tokens and all, leaking to other sites"],
            ["`Cross-Origin-Opener-Policy`", "`same-origin`", "Cross-origin popups keeping a handle on your window"],
            ["`Permissions-Policy`", "`camera=(), geolocation=()`", "Embedded scripts asking for powerful APIs"],
            ["`X-XSS-Protection`", "`0`, or leave it out", "Nothing now. The old filter itself caused leaks"],
          ],
          caption: "`helmet()` sets sensible versions of most of these for Express. Test the live response, not the config file.",
        },
        {
          t: "mission",
          h: "Break your own app, then fix it",
          x: "Build a small Express notes API with sessions. Attack it yourself: read another user's note by id, make yourself admin through `PATCH /me`, log in with `{\"$ne\": null}`, and forge a POST from a second site. Fix each one, and add a test that replays the attack.",
          hint: "Serve the attacker page from `127.0.0.1` and the app from `localhost`. Ports don't make a site, so two localhost ports are same-site and your CSRF test would prove nothing.",
        },
        {
          t: "mission",
          h: "Roll out a strict CSP without breaking prod",
          x: "Add a per-request nonce and a strict policy to an existing app in `Content-Security-Policy-Report-Only` mode. Collect violation reports for a few days, fix or nonce each legitimate script, then switch to enforcing.",
          hint: "Inline `onclick=` attributes can't carry a nonce: move them to `addEventListener`. Generate the nonce with `crypto.randomBytes(16)`, per response, and never cache that HTML.",
          solution: {
            lang: "js",
            src: "import crypto from 'node:crypto';\n\n// Mount on HTML routes only, not on static assets.\nexport function strictCsp(req, res, next) {\n  const nonce = crypto.randomBytes(16).toString('base64');\n  res.locals.nonce = nonce;                 // templates: <script nonce=\"<%= nonce %>\">\n  res.set('Cache-Control', 'no-store');     // a nonced page is never shared\n  res.set('Content-Security-Policy-Report-Only', [\n    `script-src 'nonce-${nonce}' 'strict-dynamic' https: 'unsafe-inline'`,\n    \"object-src 'none'\",\n    \"base-uri 'none'\",\n    'report-uri /csp-report',\n  ].join('; '));\n  next();\n}\n\napp.post('/csp-report', express.json({ type: ['application/csp-report', 'application/json'] }),\n  (req, res) => { log.warn({ csp: req.body }, 'csp violation'); res.sendStatus(204); });",
          },
        },
      ],
    },
  ],
  nobodyTells: [
    "Grep for lookups by id alone. Every `findById(req.params.id)` without an owner or tenant condition is a bug report someone hasn't filed yet.",
    "Test authorisation with two accounts: log in as A and replay B's requests with A's cookie. It's the cheapest pentest there is.",
    "Two ports on localhost are the same site. Test cookies and CSRF from `127.0.0.1` or a second hostname, or the test proves nothing.",
    "Log denied authorisation checks with user and object id. A run of 404s across sequential ids is someone walking your IDOR.",
    "Write the exploit as a test before the fix. A security fix without a test that replays the attack comes back in the next refactor.",
    "ORMs are injection-proof until someone opens the escape hatch. In review, grep for `$queryRawUnsafe`, `sequelize.literal` and `knex.raw(`.",
    "A password reset token is a password: store only its hash, expire it in minutes, and kill it after one use.",
    "When a password or email changes, end the user's other sessions. Otherwise whoever caused the change stays logged in.",
  ],
  glossary: [
    ["authentication", "Establishing who is making a request: a password, a passkey, a session cookie."],
    ["authorisation", "Deciding whether that caller may do this action to this object. Your code, on every request."],
    ["IDOR / BOLA", "Fetching an object by an id the caller supplies without checking they may access it. OWASP API risk #1."],
    ["salt", "Random per-password value stored with the hash, so identical passwords hash differently and cracking is per user."],
    ["argon2id", "Memory-hard password hash. OWASP's first choice: at least 19 MiB, 2 iterations, parallelism 1."],
    ["session fixation", "Attacker plants a session id before login, then shares the session. Fixed by a new id at login."],
    ["JWT", "Base64url JSON claims plus a signature. Readable by anyone, tamper-evident, hard to revoke."],
    ["SameSite", "Cookie attribute controlling whether it's sent on cross-site requests: Strict, Lax or None."],
    ["CSRF", "Another site making the victim's browser send an authenticated request that the server trusts."],
    ["XSS", "Attacker-controlled input executed as script in your origin: stored, reflected or DOM-based."],
    ["CSP nonce", "A random per-response token; only script tags carrying it may run."],
    ["PKCE", "OAuth extension: the client proves at the token endpoint it started the flow, so a stolen code is useless."],
    ["ID token", "OIDC JWT telling the client who logged in. Audience is the client, not an API."],
    ["SSRF", "Tricking a server into making requests to places the attacker can't reach, like internal services."],
    ["passkey", "WebAuthn key pair bound to one domain. The server stores only the public key; phishing can't relay it."],
  ],
  explain: "Explain to a friend why a site with perfect password hashing and HTTPS can still leak every user's data, using IDOR and CSRF as your examples.",
};
