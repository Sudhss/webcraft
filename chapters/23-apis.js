const PAGES_PLAY = String.raw`// A reader pages through a feed, 4 posts at a time, newest first.
// Something changes after page 1. Compare offset and keyset paging.
function makeFeed() {
  let nextId = 13;
  const posts = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, t: 100 + i * 10 })); // t = created_at
  return {
    posts,
    add(n) { for (let i = 0; i < n; i++) posts.push({ id: nextId, t: 300 + nextId++ }); },
    remove(id) { posts.splice(posts.findIndex((p) => p.id === id), 1); },
    sorted: () => [...posts].sort((a, b) => b.t - a.t || b.id - a.id),
  };
}

// Offset: skip page * limit rows, take limit.
const offsetPage = (feed, page, limit) => feed.sorted().slice(page * limit, page * limit + limit);

// Keyset: take limit rows strictly older than the cursor (t, id).
function keysetPage(feed, cursor, limit) {
  const older = (p) => !cursor || p.t < cursor.t || (p.t === cursor.t && p.id < cursor.id);
  const rows = feed.sorted().filter(older).slice(0, limit + 1); // +1 answers "is there more?"
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return { page, next: rows.length > limit ? { t: last.t, id: last.id } : null };
}

function show(pages, feed) {
  const ids = pages.flat();
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  const missed = feed.posts.filter((p) => p.id <= 12 && !ids.includes(p.id)).map((p) => p.id);
  const pretty = pages.map((p) => "[" + p.join(",") + "]").join(" ");
  return pretty + (dupes.length ? "  dupes: " + dupes : "") + (missed.length ? "  missed: " + missed : "  ok");
}

function run(label, mutate) {
  let feed = makeFeed();
  const off = [];
  for (let page = 0; page < 3; page++) {
    off.push(offsetPage(feed, page, 4).map((p) => p.id));
    if (page === 0) mutate(feed);
  }
  console.log(label + "\n  offset: " + show(off, feed));

  feed = makeFeed();
  const keys = [];
  let cursor = null;
  for (let page = 0; page < 3; page++) {
    const r = keysetPage(feed, cursor, 4);
    keys.push(r.page.map((p) => p.id));
    cursor = r.next;
    if (page === 0) mutate(feed);
  }
  console.log("  keyset: " + show(keys, feed));
}

run("2 new posts arrive after page 1", (feed) => feed.add(2));
run("post 11 is deleted after page 1", (feed) => feed.remove(11));`;

const BUCKET_PLAY = String.raw`// Token bucket: holds up to capacity tokens, refills rate per second,
// each request spends one. Lazy refill: no timers, two numbers per client.
function tokenBucket(capacity, rate) {
  let tokens = capacity;
  let last = 0; // ms
  return (now) => {
    tokens = Math.min(capacity, tokens + ((now - last) / 1000) * rate);
    last = now;
    if (tokens >= 1) {
      tokens -= 1;
      return { ok: true, left: Math.floor(tokens) };
    }
    return { ok: false, retryAfter: Math.ceil((1 - tokens) / rate) }; // seconds
  };
}

// Fixed window: at most limit requests per calendar second.
function fixedWindow(limit) {
  let current = -1;
  let count = 0;
  return (now) => {
    const w = Math.floor(now / 1000);
    if (w !== current) { current = w; count = 0; }
    return ++count <= limit ? { ok: true } : { ok: false, retryAfter: 1 };
  };
}

function simulate(label, limiter, times) {
  const marks = times.map((t) => (limiter(t).ok ? "#" : "."));
  const passed = marks.filter((m) => m === "#").length;
  console.log(label.padEnd(24), marks.join(""), passed + "/" + times.length);
}
const range = (n, start, step) => Array.from({ length: n }, (_, i) => start + i * step);

console.log("# = allowed, . = 429. Both limiters average 5 requests per second.\n");
const pageLoad = range(10, 0, 5); // a page fires 10 calls at once
simulate("page load, bucket(10)", tokenBucket(10, 5), pageLoad);
simulate("page load, window(5)", fixedWindow(5), pageLoad);

const edge = [...range(10, 900, 10), ...range(10, 1000, 10)]; // 20 calls in 200 ms
simulate("boundary, bucket(5)", tokenBucket(5, 5), edge);
simulate("boundary, window(5)", fixedWindow(5), edge);

const b = tokenBucket(3, 0.5);
for (let i = 1; i <= 4; i++) console.log("t=0 call " + i + ":", JSON.stringify(b(0)));`;

export default {
  id: "apis",
  n: 23,
  part: "E",
  title: "Designing APIs",
  hook: "Your API outlives every client that calls it. Retries, pagination and status codes are where it breaks first.",
  minutes: 80,
  levels: ["use", "understand"],
  sections: [
    {
      title: "Resources and verbs",
      beats: [
        { t: "say", x: "An API is a promise to code you'll never see and can't redeploy: last year's mobile app, a partner's cron job, a script someone wrote once. Everything below is about keeping that promise while you change everything behind it." },
        {
          t: "code",
          lang: "http",
          src: "GET    /orders?status=paid      list, filtered\nPOST   /orders                  create; the server picks the id\nGET    /orders/ord_42           read one\nPATCH  /orders/ord_42           change some fields\nPUT    /users/7/avatar          replace the whole thing, at a URL you know\nDELETE /orders/ord_42           remove\nPOST   /orders/ord_42/cancel    an action with side effects: refund, email, restock\nGET    /users/7/orders          one level of nesting, no deeper",
          mark: [7],
          note: "REST as practiced: nouns in the path, the method says what happens, the status says how it went. Hypermedia links (HATEOAS) are the part almost nobody ships.",
        },
        {
          t: "table",
          head: ["Method", "Safe", "Idempotent", "What a retry does"],
          rows: [
            ["GET, HEAD", "Yes", "Yes", "Nothing new. Crawlers, prefetchers and proxies replay it freely"],
            ["PUT", "No", "Yes", "Sets the same state again"],
            ["DELETE", "No", "Yes", "Already gone. The response may differ (404), the state doesn't"],
            ["PATCH", "No", "Not by definition", "Depends on the patch: `set plan=pro` yes, `append tag` no"],
            ["POST", "No", "No", "A second order, unless you use an idempotency key"],
          ],
          caption: "RFC 9110: safe means the client asked for no state change. Idempotent means N identical requests have the same intended effect as one, whatever the responses say.",
        },
        {
          t: "predict",
          lang: "http",
          src: "-- stored: { \"name\": \"Ada\", \"email\": \"ada@x.io\", \"plan\": \"pro\" }\nPUT /users/7\nContent-Type: application/json\n\n{ \"name\": \"Ada L.\" }",
          q: "Under HTTP's PUT semantics, what should GET /users/7 return now?",
          options: ["`{ name: \"Ada L.\", email, plan }`: merged", "`{ name: \"Ada L.\" }`, or the PUT is rejected with 422 for missing fields", "405: PUT is only for creating"],
          answer: 1,
          why: "PUT replaces the target's state with the one you sent. Many servers quietly merge instead, and clients start depending on that. Pick one meaning per verb: PUT is a full replace, PATCH is partial. Then document it.",
        },
        {
          t: "compare",
          a: { label: "JSON Merge Patch (RFC 7396)", lang: "http", src: "PATCH /users/7\nContent-Type: application/merge-patch+json\n\n{ \"plan\": \"team\", \"nickname\": null }" },
          b: { label: "JSON Patch (RFC 6902)", lang: "http", src: "PATCH /users/7\nContent-Type: application/json-patch+json\n\n[\n  { \"op\": \"test\", \"path\": \"/plan\", \"value\": \"pro\" },\n  { \"op\": \"replace\", \"path\": \"/plan\", \"value\": \"team\" },\n  { \"op\": \"add\", \"path\": \"/tags/-\", \"value\": \"vip\" }\n]" },
          x: "Merge patch covers most needs: `null` deletes a field, arrays are replaced whole. JSON Patch can edit arrays and `test` first, but `add /tags/-` appends again on every retry.",
        },
        {
          t: "pitfall",
          h: "Your proxy retries PUT and DELETE for you",
          x: "nginx's default `proxy_next_upstream error timeout` resends a timed-out GET, PUT or DELETE to the next upstream; it holds back only POST, PATCH and LOCK. A PUT handler that also sends an email or bumps a counter does it twice. The method name is a promise.",
        },
      ],
    },
    {
      title: "Status codes that matter",
      beats: [
        { t: "say", x: "Status codes are for machines. Retry logic, caches, SDKs, load balancers and dashboards branch on them without reading the body. The rule of thumb: 4xx means \"don't send this again unchanged\", 5xx means \"maybe later\"." },
        {
          t: "predict",
          lang: "http",
          src: "GET /admin/reports\nAuthorization: Bearer <valid, unexpired token for ada, role \"member\">",
          q: "The token is fine; Ada just isn't an admin. Which status?",
          options: ["401 Unauthorized", "403 Forbidden", "404 Not Found", "400 Bad Request"],
          answer: 1,
          why: "401 means \"I don't know who you are\": missing, expired or invalid credentials, and it MUST carry a `WWW-Authenticate` challenge. 403 means \"I know who you are, and no\". New credentials can fix a 401; retrying can't fix a 403.",
        },
        {
          t: "pitfall",
          h: "401 for \"not allowed\" logs users out",
          x: "A typical fetch wrapper reads 401 as \"session expired\": refresh the token, retry, and on a second 401, log out. Answer a permission problem with 401 and a member who clicks an admin link loses their session, or loops refreshing tokens. Keep 401 for credentials.",
        },
        {
          t: "predict",
          lang: "http",
          src: "A: POST /users  {\"email\": \"ada@x.io\", \"age\":\nB: POST /users  {\"email\": \"not-an-email\", \"age\": -3}\nC: POST /users  {\"email\": \"ada@x.io\"}   -- that email already has an account",
          q: "Best status for A, B and C?",
          options: ["400, 400, 400", "400, 422, 409", "422, 422, 409", "400, 422, 422"],
          answer: 1,
          why: "A isn't even JSON: 400. B parses but breaks the rules: 422 Unprocessable Content. C is valid but clashes with what's stored: 409 Conflict. Many APIs use 400 for B too, which is fine if the body names the field.",
        },
        {
          t: "table",
          head: ["Code", "Use it when", "What a good client does"],
          rows: [
            ["201 Created", "A POST made a resource. Send `Location: /orders/ord_42`", "Reads the new URL from `Location`"],
            ["202 Accepted", "Work is queued, not done. Return a job URL", "Polls the job, or waits for a webhook"],
            ["204 No Content", "Success with nothing to say", "Doesn't try to parse a body"],
            ["404 Not Found", "No such resource, or you won't admit it exists", "Stops. A retry won't help"],
            ["409 Conflict", "Clashes with current state: duplicate, wrong workflow step", "Shows why; the user may fix it and resubmit"],
            ["412 Precondition Failed", "`If-Match` didn't match: someone else changed it", "Refetches, merges, tries again"],
            ["429 Too Many Requests", "Rate limited. Send `Retry-After`", "Waits that long, plus jitter"],
            ["503 Service Unavailable", "Overloaded or in maintenance", "Backs off, retries later"],
          ],
        },
        {
          t: "quiz",
          q: "`GET /repos/acme/secret-plans` is a private repo the caller can't see. GitHub answers 404, not 403. Why?",
          options: ["A bug they never fixed", "403 would confirm the repo exists; RFC 9110 lets a server answer 404 to hide it", "403 is reserved for IP bans", "Clients retry 403s automatically"],
          answer: 1,
          why: "\"Forbidden\" leaks that something is there, and for private names, emails or order ids that is itself information. RFC 9110 allows 404 instead. Make the hidden case look exactly like the missing one, body included.",
        },
        {
          t: "pitfall",
          h: "`200 OK` with an error inside",
          x: "`{ \"ok\": false, \"error\": \"card declined\" }` with status 200: caches may store it, `fetch` says `res.ok`, retry logic never fires, and the dashboard shows 100% success during an outage. The status line is the one field every tool reads.",
        },
      ],
    },
    {
      title: "Errors and validation at the boundary",
      beats: [
        {
          t: "code",
          lang: "http",
          src: "HTTP/1.1 422 Unprocessable Content\nContent-Type: application/problem+json\n\n{\n  \"type\": \"https://api.shop.test/problems/validation\",\n  \"title\": \"Your request is not valid.\",\n  \"status\": 422,\n  \"detail\": \"2 fields failed validation.\",\n  \"instance\": \"/errors/req_8f2a91\",\n  \"errors\": [\n    { \"pointer\": \"#/email\", \"detail\": \"must be a valid email\" },\n    { \"pointer\": \"#/age\", \"detail\": \"must be a positive integer\" }\n  ]\n}",
          mark: [2, 5, 10],
          note: "RFC 9457 problem details, which replaced RFC 7807. `type` names the problem, `title` stays fixed per type, `detail` is this occurrence. Extra members like `errors` are allowed.",
        },
        {
          t: "quiz",
          q: "The signup form wants \"email already taken\" under the email field. What should the client branch on?",
          options: ["The `title` string", "The `detail` string", "The `type` URI, plus a pointer to the field", "The 409 status alone"],
          answer: 2,
          why: "`title` and `detail` are prose that gets reworded and translated; RFC 9457 says consumers SHOULD NOT parse `detail`. `type` is the stable id. A bare 409 can't tell \"email taken\" from \"username taken\".",
        },
        { t: "say", x: "Validation at the boundary means one schema per endpoint, checked before handler code runs. Past that line, data is typed and trusted. Before it, everything is hostile: any client, any bytes, any shape. Client-side checks are UX; these are the ones that count." },
        {
          t: "code",
          lang: "js",
          file: "routes/users.js",
          src: "import { z } from 'zod';\n\nconst CreateUser = z.object({\n  email: z.email(),\n  name: z.string().trim().min(1).max(100),\n  age: z.number().int().positive().optional(),\n});\n\napp.post('/users', async (req, res) => {\n  const parsed = CreateUser.safeParse(req.body);\n  if (!parsed.success) {\n    return res.status(422).type('application/problem+json').json({\n      type: 'https://api.shop.test/problems/validation',\n      title: 'Your request is not valid.',\n      status: 422,\n      errors: parsed.error.issues.map((i) => ({\n        pointer: '#/' + i.path.join('/'),\n        detail: i.message,\n      })),\n    });\n  }\n  const user = await createUser(parsed.data); // never req.body\n  res.status(201).location(`/users/${user.id}`).json(user);\n});",
          mark: [10, 23],
          note: "Zod 4 syntax. The schema also gives you the TypeScript type (`z.infer<typeof CreateUser>`), so the check and the type can't drift apart.",
        },
        {
          t: "predict",
          lang: "js",
          src: "// body: { \"email\": \"ada@x.io\", \"name\": \"Ada\", \"role\": \"admin\" }\nconst parsed = CreateUser.safeParse(req.body);\nconsole.log(parsed.data);",
          q: "What happens to `role`?",
          options: ["Kept: zod only checks the keys it knows", "Stripped: `z.object` drops unknown keys", "safeParse fails on the unknown key", "Set to undefined but kept as a key"],
          answer: 1,
          why: "`z.object` strips unknown keys by default, which is what stops **mass assignment**: `users.update(id, req.body)` with a `role` in it. `z.strictObject` rejects them instead, and also catches client typos like `emial`.",
        },
        {
          t: "pitfall",
          h: "`res.json(row)` ships every column you'll ever add",
          x: "Return the database row and the response carries `password_hash`, internal flags and every column added next year, and clients start depending on them. Map each resource to an explicit response shape, so what's public is a decision, not an accident.",
        },
      ],
    },
    {
      title: "Retries and idempotency keys",
      beats: [
        { t: "say", x: "A timeout tells you nothing. The request may have died on the way in, or the server may have charged the card and lost the reply on the way out. Retrying a POST blind can charge twice; not retrying can lose the order." },
        {
          t: "viz",
          name: "frames",
          props: {
            cols: ["Client", "Your API", "Key store", "Card network"],
            frames: [
              { cells: [["POST /payments", "Idempotency-Key: k7"], [], [], []], note: "The client makes the key once, when the user presses Pay, and keeps it until it gets an answer." },
              { cells: [["waiting"], ["claim k7"], ["k7: running, fp=9c1e"], []], note: "The API claims the key with an atomic insert and stores a fingerprint of the body." },
              { cells: [["waiting"], ["charge, key k7"], ["k7: running, fp=9c1e"], ["charged 40.00"]], note: "The charge goes through. The key travels down too, so the next hop can dedupe as well." },
              { cells: [["timeout"], ["save 201 + body"], ["k7: done, 201, pay_1"], ["charged 40.00"]], note: "The reply is lost on the way back. The client only sees a timeout." },
              { cells: [["retry POST, k7"], ["k7 is done: replay"], ["k7: done, 201, pay_1"], ["charged 40.00"]], note: "Same key, same body: the API returns the stored response and never touches the card network." },
              { cells: [["201 pay_1"], [], ["k7: done, expires later"], ["charged 40.00"]], note: "The client gets what the first attempt would have returned. Stripe keeps keys for at least 24 hours." },
            ],
          },
        },
        {
          t: "code",
          lang: "js",
          file: "routes/payments.js",
          src: "// Unique index on idem (account_id, key).\napp.post('/payments', async (req, res) => {\n  const key = req.get('Idempotency-Key');\n  if (!key) return problem(res, 400, 'idempotency-key-required');\n  const acct = req.account.id;                    // keys are scoped to the caller\n  const fp = sha256(canonicalJson(req.body));     // what \"the same request\" means\n\n  const claim = await db.query(\n    `INSERT INTO idem (account_id, key, fingerprint, state)\n     VALUES ($1, $2, $3, 'running') ON CONFLICT DO NOTHING`, [acct, key, fp]);\n\n  if (claim.rowCount === 0) {                     // seen this key before\n    const { rows: [prev] } = await db.query(\n      'SELECT * FROM idem WHERE account_id = $1 AND key = $2', [acct, key]);\n    if (prev.fingerprint !== fp) return problem(res, 422, 'idempotency-key-reused');\n    if (prev.state === 'running') return problem(res, 409, 'request-in-progress');\n    return res.status(prev.status).json(prev.body); // replay, no second charge\n  }\n\n  try {\n    const payment = await psp.charge(req.body, { idempotencyKey: `${acct}:${key}` });\n    await db.query(\n      `UPDATE idem SET state = 'done', status = 201, body = $3\n       WHERE account_id = $1 AND key = $2`, [acct, key, payment]);\n    res.status(201).json(payment);\n  } catch (err) {\n    await db.query('DELETE FROM idem WHERE account_id = $1 AND key = $2', [acct, key]);\n    throw err;                                    // a retry is safe: the PSP dedupes too\n  }\n});",
          mark: [8, 17, 20],
          note: "Status codes follow the IETF Idempotency-Key draft: 400 missing, 422 reused, 409 still running. A crash leaves a row `running` forever, so store a lock time and let stale claims be retaken.",
        },
        {
          t: "quiz",
          q: "A client retries with the same Idempotency-Key, but the amount changed from 40 to 400. What should happen?",
          options: ["Replay the stored 40.00 response", "Charge 400: it's a new request", "Reject it with 422: the key was reused for a different request", "Charge both"],
          answer: 2,
          why: "The key means \"this exact request, again\". A different body under the same key is a client bug, and replaying 40.00 silently hides it. Stripe compares parameters and errors; the IETF draft suggests 422.",
        },
        {
          t: "pitfall",
          h: "A fresh key per attempt protects nothing",
          x: "`retry(() => post('/payments', body, { 'Idempotency-Key': crypto.randomUUID() }))` makes a new key on every attempt, so the server sees three different payments. Make the key once per user intent (the checkout, the button press), keep it with the draft, reuse it until you get an answer.",
        },
        {
          t: "steps",
          h: "A retry policy that doesn't make things worse",
          items: [
            "Retry only idempotent methods, or requests that carry an idempotency key.",
            "Retry on network errors, 408, 429, 502, 503 and 504. Never on 400, 401, 403, 404, 409 or 422: the same request gets the same answer.",
            "Honour `Retry-After` when present. It is seconds, or an HTTP date.",
            "Otherwise back off exponentially with full jitter: `sleep(random(0, min(cap, base * 2 ** attempt)))`, so clients don't retry in lockstep.",
            "Cap attempts (3 to 5) and the total time spent.",
            "Retry at one layer only. SDK, service mesh and app each trying 3 times is 27 calls to a server that is already struggling.",
          ],
        },
        {
          t: "mission",
          h: "Make POST /payments safe to retry",
          x: "Build the payments route above against Postgres or SQLite with a fake `psp.charge` that sleeps 500 ms. Fire the same request 5 times concurrently, then once more with a different amount. Exactly one charge row may exist, the extra calls get 409s or replays, the last gets 422.",
          hint: "`Promise.all` over five identical `fetch` calls with one key. The unique index on (account_id, key) is the lock; count rows in a `charges` table at the end.",
        },
      ],
    },
    {
      title: "Lists: pages, filters, expansion",
      beats: [
        { t: "say", x: "Offset paging is `LIMIT 20 OFFSET 40`: easy, and wrong in two ways. Rows shift under it whenever something is inserted or deleted, and the database has to walk past every skipped row to find where a deep page starts." },
        {
          t: "play",
          mode: "js",
          title: "offset vs keyset, under writes",
          js: PAGES_PLAY,
          task: "Give posts 4 and 5 the same `t`, then drop the `id` part of the `older` check. Which post vanishes from keyset paging, and why?",
        },
        {
          t: "predict",
          lang: "sql",
          src: "-- GET /posts?page=5000&limit=20\nSELECT * FROM posts\nORDER BY created_at DESC, id DESC\nLIMIT 20 OFFSET 99980;",
          q: "With an index on (created_at DESC, id DESC), roughly how many rows does Postgres walk?",
          options: ["20", "About 100,000", "About log2(n)", "The whole table"],
          answer: 1,
          why: "A B+tree knows order, not position, so OFFSET can't jump. It reads 99,980 entries, throws them away, returns 20. Page 1 takes a millisecond, page 5000 takes far longer, and scrapers go straight for deep pages.",
        },
        {
          t: "code",
          lang: "js",
          file: "routes/posts.js",
          src: "// GET /posts?limit=20&cursor=eyJ0IjoiMjAyNi0w...\n// Index: CREATE INDEX ON posts (created_at DESC, id DESC);\napp.get('/posts', async (req, res) => {\n  const { limit, cursor } = ListQuery.parse(req.query); // limit: default 20, max 100\n  const params = [limit + 1];                    // one extra row answers \"is there more?\"\n  let where = '';\n  if (cursor) {\n    const { t, id } = JSON.parse(Buffer.from(cursor, 'base64url').toString());\n    params.push(t, id);\n    where = 'WHERE (created_at, id) < ($2::timestamptz, $3::bigint)';\n  }\n  const { rows } = await db.query(\n    `SELECT id, title, created_at, created_at::text AS t\n     FROM posts ${where}\n     ORDER BY created_at DESC, id DESC\n     LIMIT $1`, params);\n\n  const page = rows.slice(0, limit);\n  const last = page.at(-1);\n  const next = rows.length > limit\n    ? Buffer.from(JSON.stringify({ t: last.t, id: last.id })).toString('base64url')\n    : null;\n  res.json({ data: page.map(({ t, ...p }) => p), next_cursor: next });\n});",
          mark: [10, 13],
          note: "The row comparison is one index seek, so page 5000 costs what page 1 does. The cursor is opaque to clients: they pass it back, never build it. A bad cursor should be a 400, so wrap the decode.",
        },
        {
          t: "pitfall",
          h: "Ties make pages overlap",
          x: "`ORDER BY created_at` alone leaves rows with equal timestamps in no defined order, and that order can differ between two queries. Page 1 and page 2 then share a row and another one vanishes, with no writes at all. End every sort with a unique column: `created_at DESC, id DESC`.",
        },
        {
          t: "pitfall",
          h: "JS dates drop microseconds from your cursor",
          x: "Postgres stores `timestamptz` to the microsecond; node-postgres hands you a JS `Date`, which keeps milliseconds. Build the cursor from the Date and rows created in the same millisecond, but later in the sort, get skipped. That's why the code above uses `created_at::text`.",
        },
        {
          t: "table",
          head: ["Need", "Convention", "Guard rail"],
          rows: [
            ["Filter", "`?status=paid&created_after=2026-01-01`", "Offer filters an index can serve; validate every value"],
            ["Sort", "`?sort=-created_at` (JSON:API style: minus is descending)", "Allow-list mapped to fixed SQL. Placeholders can't bind column names"],
            ["Page size", "`?limit=20`", "A default and a hard max. Unbounded means someone asks for a million"],
            ["Fewer fields", "`?fields=id,total`", "Smaller payloads for list screens"],
            ["Related data", "`?expand=customer` (Stripe) or `?include=author` (JSON:API)", "Cap the depth; batch the lookups on the server"],
          ],
        },
        {
          t: "predict",
          lang: "js",
          src: "// Orders screen in a mobile app, 150 ms round trip\nconst orders = await api.get('/orders?limit=20');\nfor (const o of orders.data) {\n  o.customer = await api.get(`/customers/${o.customer_id}`);\n}",
          q: "How long before the screen can render, ignoring server time?",
          options: ["150 ms", "300 ms", "About 3.2 s", "Depends on bandwidth"],
          answer: 2,
          why: "The N+1 query, moved across the network: 21 sequential round trips, 21 x 150 ms. `Promise.all` cuts the wait to 2 RTTs but still costs 21 requests. `?expand=customer` makes it one, and the server batches the 20 lookups.",
        },
      ],
    },
    {
      title: "Conditional requests: caching and lost updates",
      beats: [
        { t: "say", x: "\"What happens when you open a URL\" covered `Cache-Control`. APIs lean on the other half of HTTP caching: **validators**. An `ETag` names one version of a resource; clients send it back to ask \"changed?\" on a read, or \"still this version?\" on a write." },
        {
          t: "predict",
          lang: "js",
          src: "app.get('/reports/:id', async (req, res) => {\n  const report = await buildReport(req.params.id); // 800 ms of queries\n  res.json(report);                                // Express adds ETag: W/\"...\"\n});\n// Client: GET /reports/9 with If-None-Match: <that ETag>. Nothing changed.",
          q: "The client gets a 304. What did it save?",
          options: ["The 800 ms and the bytes", "Only the bytes on the wire: the handler ran in full", "Nothing: Express ignores If-None-Match", "Just the database queries"],
          answer: 1,
          why: "Express hashes the finished body inside `res.send`, then checks `If-None-Match`. By then the queries ran and the JSON was built. To save the work, make the ETag from something cheap, like a `version` column, and compare it before building anything.",
        },
        {
          t: "viz",
          name: "frames",
          props: {
            cols: ["Alice", "Bob", "Server: doc 9"],
            frames: [
              { cells: [["GET: ETag \"7\""], ["GET: ETag \"7\""], ["v7 title: Q3 plan"]], note: "Both open the same document. Both hold version 7." },
              { cells: [["PATCH If-Match \"7\"", "title: Q3 budget"], ["editing"], ["v8 title: Q3 budget"]], note: "Alice saves first. Her precondition holds, the write lands, the version moves to 8." },
              { cells: [["200, ETag \"8\""], ["PATCH If-Match \"7\"", "title: Q3 roadmap"], ["v8 title: Q3 budget"]], note: "Bob saves an edit he made on top of version 7." },
              { cells: [[], ["412 Precondition Failed"], ["v8 title: Q3 budget"]], note: "\"7\" no longer matches. Without If-Match, Bob would silently overwrite Alice: a lost update, across HTTP." },
              { cells: [[], ["GET: ETag \"8\"", "merge, PATCH If-Match \"8\""], ["v9 title: Q3 budget and roadmap"]], note: "Bob's client refetches, shows the conflict or merges, and writes against the current version." },
            ],
          },
        },
        {
          t: "code",
          lang: "js",
          file: "routes/docs.js",
          src: "app.patch('/docs/:id', async (req, res) => {\n  const ifMatch = req.get('If-Match');\n  if (!ifMatch) return problem(res, 428, 'precondition-required');\n  const version = parseStrongTag(ifMatch); // '\"7\"' -> 7, 'W/\"7\"' -> null\n  const patch = DocPatch.parse(req.body);\n\n  const { rows } = await db.query(\n    `UPDATE docs\n        SET title = COALESCE($3, title), body = COALESCE($4, body),\n            version = version + 1\n      WHERE id = $1 AND version = $2\n      RETURNING id, title, body, version`,\n    [req.params.id, version, patch.title ?? null, patch.body ?? null]);\n\n  if (!rows.length) return problem(res, 412, 'stale-version'); // or 404 if it's gone\n  res.set('ETag', `\"${rows[0].version}\"`).json(rows[0]);\n});",
          mark: [3, 11],
          note: "Check and write are one statement, so nothing can slip in between. `428 Precondition Required` (RFC 6585) tells clients the header is mandatory here.",
        },
        {
          t: "pitfall",
          h: "Weak ETags can't guard writes",
          x: "`If-Match` uses strong comparison, so `W/\"7\"` never matches. Express's default ETags are weak, and nginx turns strong ETags weak when it gzips a response. Guard writes with your own version-based ETag, and check which tag actually reaches the client.",
        },
        {
          t: "pitfall",
          h: "`public` on an authenticated endpoint leaks data",
          x: "Shared caches won't reuse a response to a request with `Authorization`, unless the response says `public`, `s-maxage` or `must-revalidate` (RFC 9111). Add `public` to speed up `/me` and a CDN can hand Ada's profile to Bob. Cookie auth gets no such guard. Use `private`.",
        },
      ],
    },
    {
      title: "Rate limiting",
      beats: [
        { t: "say", x: "A rate limiter protects your service from any one client, including your own frontend in a retry loop. The **token bucket** is the usual choice: it holds up to `b` tokens, refills at `r` per second, and every request spends one." },
        {
          t: "predict",
          lang: "text",
          src: "Limit: 100 requests per minute, counted per calendar minute.\n10:00:59.5  a client sends 100 requests\n10:01:00.1  it sends 100 more",
          q: "How many succeed?",
          options: ["100", "200", "150", "100, and the client is banned"],
          answer: 1,
          why: "Each batch lands in a fresh window, so 200 get through in 0.6 s: twice the limit, at the worst moment. A token bucket names the burst it allows (`b`) and the rate it sustains (`r`) separately, with no edges.",
        },
        {
          t: "play",
          mode: "js",
          title: "token bucket vs fixed window",
          js: BUCKET_PLAY,
          task: "Keep one bucket per API key in a `Map`. Send 30 calls from key A, then 1 from key B. How would you evict idle keys so the Map doesn't grow forever?",
        },
        {
          t: "code",
          lang: "http",
          src: "HTTP/1.1 429 Too Many Requests\nRetry-After: 3\nContent-Type: application/problem+json\n\n{\n  \"type\": \"https://api.shop.test/problems/rate-limited\",\n  \"title\": \"Too many requests\",\n  \"status\": 429,\n  \"detail\": \"Limit is 5 requests per second per API key.\"\n}",
          mark: [2],
          note: "`Retry-After` is the standard part. Headers like `X-RateLimit-Remaining` are widespread conventions, not a standard, so document yours.",
        },
        {
          t: "pitfall",
          h: "An in-memory limiter is N limiters",
          x: "Six instances each allowing 100 a minute is 600 a minute, and every deploy resets them all. Keep buckets in a shared store like Redis and update them atomically, with a Lua script or a single `INCR`. Read, compute, write from the app is the lost update again.",
        },
      ],
    },
    {
      title: "Evolving the contract",
      beats: [
        { t: "say", x: "**Hyrum's law**: with enough users, every observable behaviour of your API is depended on by somebody. Field order, error wording, the default sort, even latency. You don't decide what's in the contract. Your clients already did." },
        {
          t: "table",
          head: ["Change", "Breaking?", "Why"],
          rows: [
            ["Add an optional response field", "No", "Tolerant readers ignore fields they don't know"],
            ["Add an optional request param", "No", "Old clients don't send it and keep the old behaviour"],
            ["Add an enum value", "GitHub's policy calls it additive", "Clients with `switch ... default: throw` break anyway"],
            ["Rename or remove a field", "Yes", "Every reader of that field breaks"],
            ["Make an optional param required", "Yes", "Old clients start getting 4xx"],
            ["Tighten validation", "Yes", "Requests that worked yesterday now fail"],
            ["Change a default: page size, sort order", "Yes, silently", "Nothing errors; results are just different"],
          ],
        },
        {
          t: "predict",
          lang: "js",
          src: "// Client code, validating API responses with zod\nconst Order = z.object({ id: z.string(), status: z.enum(['paid', 'shipped']) });\nconst orders = z.array(Order).parse(await res.json());\n// The server starts sending status: \"refunded\".",
          q: "One order in the list is now `refunded`. What does the user see?",
          options: ["That order with an unknown status", "The list minus that order", "An error: the whole list fails to parse", "Nothing changes"],
          answer: 2,
          why: "`parse` throws on the one bad item, so an additive server change becomes a client outage. Read tolerantly: `z.enum([..., 'unknown']).catch('unknown')`, then render a fallback for values you don't know yet.",
        },
        {
          t: "table",
          head: ["Strategy", "Looks like", "Tradeoff"],
          rows: [
            ["Version in the path", "`/v1/orders`, `/v2/orders`", "Obvious and cache-friendly; a v2 tends to become a rewrite"],
            ["Dated version header", "`X-GitHub-Api-Version: 2022-11-28`", "Small breaking changes ship often; clients opt in per request"],
            ["Pinned per account", "Stripe: an account default, `Stripe-Version` overrides it", "Nobody breaks by surprise; you maintain every old shape"],
            ["Never break", "Only add; deprecate, never remove", "No versions to run; the schema only grows"],
          ],
          caption: "Whichever you pick, announce removals with the `Deprecation` (RFC 9745) and `Sunset` (RFC 8594) headers, long before you remove anything.",
        },
        {
          t: "code",
          lang: "yaml",
          file: "openapi.yaml",
          src: "openapi: 3.1.0\ninfo: { title: Shop API, version: \"2026-09-01\" }\npaths:\n  /orders/{id}:\n    get:\n      operationId: getOrder\n      parameters:\n        - { name: id, in: path, required: true, schema: { type: string } }\n      responses:\n        \"200\":\n          description: The order\n          headers: { ETag: { schema: { type: string } } }\n          content:\n            application/json:\n              schema: { $ref: \"#/components/schemas/Order\" }\n        \"404\":\n          description: No such order, or not yours\n          content:\n            application/problem+json:\n              schema: { $ref: \"#/components/schemas/Problem\" }\ncomponents:\n  schemas:\n    Order:\n      type: object\n      required: [id, status, total_cents]\n      properties:\n        id: { type: string }\n        status: { type: string, enum: [paid, shipped, refunded] }\n        total_cents: { type: integer }\n    Problem: { type: object, required: [type, title] }",
          note: "One file drives docs, generated client types (`openapi-typescript`), request validation and mocks. Run `oasdiff breaking` on it in CI so a breaking change fails the PR, not a customer's app.",
        },
        {
          t: "quiz",
          q: "Three teams' screens each need very different slices of the same data, and you keep adding one-off endpoints. What's the honest next step?",
          options: ["Version the API as v2", "Add `?fields=` and `?expand=` first; if that stops scaling, consider GraphQL", "Return every field on every endpoint", "Move to WebSockets"],
          answer: 1,
          why: "Sparse fields and expansion cover most of it with plain HTTP, caching intact. GraphQL earns its cost when many clients need many shapes. The API styles chapter compares GraphQL, gRPC and the rest properly.",
        },
      ],
    },
    {
      title: "Webhooks",
      beats: [
        { t: "say", x: "A webhook flips the roles: the provider is the client, you are the server, and it will retry. So treat every delivery as untrusted, possibly duplicated, possibly out of order, and answer fast." },
        {
          t: "code",
          lang: "js",
          file: "webhooks.js",
          src: "import crypto from 'node:crypto';\nimport express from 'express';\n\n// Raw bytes on this route, mounted before any JSON parser.\napp.post('/webhooks/pay', express.raw({ type: 'application/json' }), async (req, res) => {\n  const id = req.get('webhook-id');\n  const ts = Number(req.get('webhook-timestamp'));\n  if (!id || !Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) {\n    return res.sendStatus(400); // missing headers, or older than 5 minutes: maybe a replay\n  }\n  const expected = crypto.createHmac('sha256', SECRET)\n    .update(`${id}.${ts}.`).update(req.body).digest('base64');\n  const sigs = (req.get('webhook-signature') || '').split(' ');\n  const ok = sigs.some((s) => s.startsWith('v1,') && safeEqual(s.slice(3), expected));\n  if (!ok) return res.sendStatus(400);\n\n  // Store, then ack. The inbox row is both the dedupe and the work queue.\n  await db.query(\n    'INSERT INTO webhook_inbox (id, body) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING',\n    [id, req.body.toString('utf8')]);\n  res.sendStatus(204);\n});\n\nfunction safeEqual(a, b) {\n  const x = Buffer.from(a), y = Buffer.from(b);\n  return x.length === y.length && crypto.timingSafeEqual(x, y);\n}",
          mark: [4, 13, 18],
          note: "Header names follow the Standard Webhooks spec; Stripe's scheme is close. A worker applies inbox rows in a transaction. Use the provider's library when there is one.",
        },
        {
          t: "predict",
          lang: "js",
          src: "app.post('/webhooks/pay', verify, async (req, res) => {\n  await fulfilOrder(req.body); // email, PDF invoice, ERP sync: 40 s on a bad day\n  res.sendStatus(200);\n});",
          q: "The provider stops waiting long before 40 s. What happens next?",
          options: ["Nothing: the work finished, so all is well", "It counts the delivery as failed and sends it again: the order is fulfilled twice", "It cancels your handler", "It waits longer next time"],
          answer: 1,
          why: "To the sender a timeout is a failure, whatever your server did. It redelivers, maybe while the first run is still going. Store the event, return 2xx at once, and let a worker that dedupes by event id do the work.",
        },
        {
          t: "pitfall",
          h: "Webhooks arrive late, twice and out of order",
          x: "Stripe, for one, promises none of these: `invoice.paid` can beat `invoice.created`, and a retry can land after a newer event. Dedupe by event id, and never apply an event blindly: compare a version on the object, or refetch the object from the API and use its current state.",
        },
        {
          t: "steps",
          h: "If you send webhooks",
          items: [
            "Give every event a unique id and a type. Receivers dedupe on the id.",
            "Sign `id.timestamp.body` with HMAC-SHA256 and a per-endpoint secret. The timestamp lets receivers reject replays.",
            "During secret rotation, sign with both secrets and send both signatures.",
            "Retry non-2xx with exponential backoff for days. Count redirects as failures.",
            "Version the payload: the receiver's parser is a client you can't redeploy.",
            "Let receivers list and resend missed events. Their outage shouldn't become their data loss.",
          ],
        },
        {
          t: "mission",
          h: "Survive a hostile webhook sender",
          x: "Write a sender that signs events for one order (`created`, `paid`, `shipped`) and delivers them shuffled, with random duplicates and one forged signature. Your receiver must reject the forgery, process each event once, and end with the order `shipped`.",
          hint: "Give each event the order's `version`. The worker applies an event only if its version is newer than the stored one, inside one transaction with the inbox row.",
          solution: {
            lang: "js",
            src: "// sender.mjs: run it against your receiver on port 3000.\nimport crypto from 'node:crypto';\n\nconst order = (status, version) => ({ id: 'ord_1', status, version });\nconst events = ['created', 'paid', 'shipped']\n  .map((type, i) => ({ id: `evt_${i + 1}`, type, order: order(type, i + 1) }));\nconst forged = { id: 'evt_666', type: 'refunded', order: order('refunded', 99) };\nconst deliveries = [...events, events[1], events[0]].sort(() => Math.random() - 0.5);\ndeliveries.splice(2, 0, forged);\n\nfor (const e of deliveries) {\n  const secret = e === forged ? 'guessed-secret' : 'test-secret';\n  const body = JSON.stringify(e);\n  const ts = String(Math.floor(Date.now() / 1000));\n  const sig = crypto.createHmac('sha256', secret).update(`${e.id}.${ts}.${body}`).digest('base64');\n  const res = await fetch('http://localhost:3000/webhooks/pay', {\n    method: 'POST',\n    headers: { 'content-type': 'application/json', 'webhook-id': e.id,\n      'webhook-timestamp': ts, 'webhook-signature': `v1,${sig}` },\n    body,\n  });\n  console.log(e.id, e.type, res.status); // evt_666 must get a 400\n}",
          },
        },
      ],
    },
  ],
  nobodyTells: [
    "Send 64-bit ids as strings. `JSON.parse` turns 9007199254740993 into 9007199254740992 without a word, in every JS client.",
    "Money is an integer in minor units plus a currency: `{ \"amount\": 4000, \"currency\": \"inr\" }`. Never a float.",
    "Return lists as `{ \"data\": [...], \"next_cursor\": ... }`, never a bare array. The object leaves room to add fields later.",
    "Validate before the handler runs. Bad input must fail as a 4xx at the door, never as a 500 from deep inside.",
    "A total count on every list call is a full scan in Postgres. Return a cursor and skip the total unless a screen needs it.",
    "Rate-limit by API key or user id, not IP: one office NAT is thousands of users, one IPv6 attacker is millions of addresses.",
    "Log the client id and API version on every request. You can't retire a version when you can't see who still calls it.",
    "Put a request id in every error response. A support ticket that quotes it can be found in the logs in one search.",
  ],
  glossary: [
    ["safe method", "One that asks for no state change: GET, HEAD, OPTIONS. Crawlers and prefetchers may call it freely."],
    ["idempotent", "N identical requests have the same intended effect on the server as one. PUT and DELETE are; POST isn't."],
    ["idempotency key", "A client-made id sent with a POST so the server can recognise a retry and replay the stored response."],
    ["problem details", "RFC 9457 JSON error format (`application/problem+json`): type, title, status, detail, instance."],
    ["ETag", "An opaque version tag for a representation. Weak ones (`W/`) mean \"equivalent\", strong ones mean byte-identical."],
    ["If-Match", "Write precondition: apply only if the current ETag matches. Otherwise 412. Prevents lost updates."],
    ["If-None-Match", "Read precondition: if the ETag still matches, answer 304 with no body."],
    ["optimistic concurrency", "Let writers race, but reject a write based on a stale version instead of locking up front."],
    ["keyset pagination", "Page with `WHERE (sort_key, id) < cursor` instead of OFFSET. Stable under writes, same cost at any depth."],
    ["token bucket", "Rate limiter: up to b tokens, refilled at r per second, one spent per request. Allows bursts of b."],
    ["tolerant reader", "A client that ignores unknown fields and handles unknown enum values, so additive changes can't break it."],
    ["OpenAPI", "A machine-readable description of an HTTP API, used for docs, codegen, validation and breaking-change checks."],
    ["webhook", "An HTTP callback a provider sends you when something happens. Signed, retried, delivered at least once."],
  ],
  explain: "Explain to a friend why retrying a timed-out payment request can charge a card twice, and how an idempotency key and a stored response prevent it.",
};
