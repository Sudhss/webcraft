export default {
  id: "databases",
  n: 26,
  part: "E",
  title: "Databases",
  hook: "Indexes are B+trees, isolation levels are bug classes, and your ORM is issuing 101 queries. Time to see it.",
  minutes: 90,
  levels: ["use", "understand", "rebuild"],
  sections: [
    {
      title: "SQL that matters",
      beats: [
        { t: "say", x: "A relational database is a set of tables plus a **planner** that decides how to answer you. You say *what* you want; it picks the algorithm. Most database skill is knowing what the planner will pick." },
        {
          t: "predict",
          lang: "sql",
          src: "-- users: 3 rows. orders: only user 1 has orders.\nSELECT u.name, o.total\nFROM users u\nLEFT JOIN orders o ON o.user_id = u.id\nWHERE o.status = 'paid';",
          q: "Does this still return users with no orders?",
          options: ["Yes, with total NULL", "No: it behaves like an INNER JOIN", "Syntax error", "Only if status is nullable"],
          answer: 1,
          why: "Unmatched rows have `o.status = NULL`, and `NULL = 'paid'` is not true, so `WHERE` drops them. Move the condition into the join: `ON o.user_id = u.id AND o.status = 'paid'`.",
        },
        {
          t: "predict",
          lang: "sql",
          src: "-- emails: 'a@x', NULL, 'b@x', NULL\nSELECT COUNT(*), COUNT(email), COUNT(DISTINCT email)\nFROM users;",
          q: "What comes back?",
          options: ["4, 4, 2", "4, 2, 2", "4, 2, 3", "2, 2, 2"],
          answer: 1,
          why: "`COUNT(*)` counts rows. `COUNT(col)` counts non-NULL values. `DISTINCT` also skips NULL. Half of all \"the dashboard number is wrong\" bugs are this.",
        },
        {
          t: "code",
          lang: "sql",
          src: "-- Latest 3 orders per user, in one pass.\nSELECT *\nFROM (\n  SELECT o.*,\n         ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC) AS rn,\n         SUM(total)  OVER (PARTITION BY user_id) AS lifetime\n  FROM orders o\n) t\nWHERE rn <= 3;",
          mark: [5, 6],
          note: "A **window function** computes per group without collapsing rows. `GROUP BY` gives one row per group; `OVER` keeps every row and adds a column.",
        },
        {
          t: "quiz",
          q: "You want users with more than 5 paid orders. Where does `COUNT(*) > 5` go?",
          options: ["WHERE", "HAVING", "ON", "ORDER BY"],
          answer: 1,
          why: "`WHERE` filters rows before grouping, `HAVING` filters groups after. `WHERE status = 'paid' ... GROUP BY user_id HAVING COUNT(*) > 5`.",
        },
        {
          t: "pitfall",
          h: "`NOT IN` with a NULL returns nothing",
          x: "`WHERE id NOT IN (SELECT user_id FROM bans)` returns zero rows if any `user_id` is NULL, because `x <> NULL` is unknown. Use `NOT EXISTS (SELECT 1 FROM bans b WHERE b.user_id = u.id)`. It is also usually planned better.",
        },
      ],
    },
    {
      title: "Indexes are B+trees",
      beats: [
        { t: "say", x: "An index is a sorted copy of some columns plus a pointer to each row, stored as a **B+tree**: fat nodes of hundreds of keys, leaves linked in order. Fanout ~300 means 3 or 4 levels cover a billion rows." },
        {
          t: "steps",
          h: "WHERE email = 'ada@x.io', with an index",
          items: [
            "Read the root page (almost always cached). Binary search its keys, follow one child.",
            "Repeat on the inner page. Each level is one 8 KB page read.",
            "Land on a leaf: the key plus a row pointer (a TID in Postgres).",
            "Fetch the row from the table (the heap). That's the random read that makes big scans slow.",
            "For a range, walk the linked leaves sideways instead of going back to the root.",
          ],
        },
        {
          t: "rebuild",
          h: "A mini index: hash vs sorted",
          x: "Two indexes over 200k rows. A `Map` is a hash index: perfect for equality, useless for ranges. A sorted array with binary search is the leaf level of a B+tree: ranges, ordering and prefix counts for free.",
          mode: "js",
          js: `// 200k users. Two indexes, built the way a database would.
const N = 200_000;
const rows = Array.from({ length: N }, (_, id) => ({ id, age: (id * 7919) % 90, email: \`u\${id}@x.io\` }));

// Hash index: key -> row. O(1) equality, nothing else.
const byEmail = new Map(rows.map((r) => [r.email, r.id]));

// Ordered index: sorted (key, rowId) pairs. This is a B+tree's leaf level.
const byAge = rows.map((r) => [r.age, r.id]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
function lowerBound(idx, key) {
  let lo = 0, hi = idx.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (idx[m][0] < key) lo = m + 1; else hi = m;
  }
  return lo;
}
function rangeScan(idx, from, to) {
  const out = [];
  for (let i = lowerBound(idx, from); i < idx.length && idx[i][0] <= to; i++) out.push(idx[i][1]);
  return out;
}

function time(label, fn) {
  const t = performance.now();
  const out = fn();
  console.log(label.padEnd(26), (performance.now() - t).toFixed(2).padStart(7), "ms ->", out);
}

time("seq scan age 30..32", () => rows.filter((r) => r.age >= 30 && r.age <= 32).length);
time("index range age 30..32", () => rangeScan(byAge, 30, 32).length);
time("seq scan email", () => rows.find((r) => r.email === "u123456@x.io")?.id);
time("hash lookup email", () => byEmail.get("u123456@x.io"));
time("index-only count age<5", () => lowerBound(byAge, 5));
// Now: find every email starting with "u1234". The Map can't help. Why?`,
          task: "Build a sorted index on email and answer `email LIKE 'u1234%'` with two binary searches. Then explain why the Map can't.",
        },
        {
          t: "predict",
          lang: "sql",
          src: "CREATE INDEX ON orders (user_id, created_at);\n\n-- A: WHERE user_id = 7\n-- B: WHERE user_id = 7 ORDER BY created_at DESC LIMIT 10\n-- C: WHERE created_at > now() - interval '1 day'\n-- D: WHERE user_id = 7 AND created_at > '2026-01-01'",
          q: "Which one can't seek into this index?",
          options: ["A", "B", "C", "D"],
          answer: 2,
          why: "The tree is sorted by `user_id` first, then `created_at` inside each user. Without `user_id` you can't descend; `created_at` is scattered across every user's slice. B is the best case: seek, then read 10 leaves in order, no sort.",
        },
        {
          t: "say",
          h: "Column order rule",
          x: "Equality columns first, then the sort column, then range columns. MongoDB calls it **ESR**; it's the same B+tree logic everywhere. A range column in the middle stops the columns after it from being used for seeking.",
        },
        {
          t: "code",
          lang: "sql",
          src: "-- Covering index: the query never touches the table.\nCREATE INDEX orders_user_recent\n  ON orders (user_id, created_at DESC)\n  INCLUDE (total, status);\n\nEXPLAIN (ANALYZE, BUFFERS)\nSELECT created_at, total, status\nFROM orders WHERE user_id = 7\nORDER BY created_at DESC LIMIT 10;\n\n-- Limit  (actual time=0.031..0.044 rows=10)\n--   ->  Index Only Scan using orders_user_recent on orders\n--         Index Cond: (user_id = 7)\n--         Heap Fetches: 0\n--         Buffers: shared hit=4",
          mark: [4, 12, 14],
          note: "`Index Only Scan` with `Heap Fetches: 0` is the goal. If heap fetches are high, the visibility map is stale: `VACUUM` the table.",
        },
      ],
    },
    {
      title: "When the planner ignores your index",
      beats: [
        { t: "say", x: "The planner estimates how many rows match (**selectivity**) from column statistics, prices each plan, and takes the cheapest. An index is not always cheaper: fetching 40% of a table through random reads loses to reading it straight." },
        {
          t: "rebuild",
          h: "A tiny cost-based planner",
          x: "This is the core of a real planner in 30 lines: statistics, selectivity, a cost per plan, pick the min. The constants are Postgres's defaults. Watch the plan flip as the predicate gets less selective.",
          mode: "js",
          js: `// What the planner knows: table size and column statistics (pg_class, pg_stats).
const table = { rows: 1_000_000, pages: 12_000 };
const stats = {
  status: { distinct: 4, mcv: { active: 0.93, trial: 0.05, deleted: 0.019, banned: 0.001 } },
  created_at: { min: 0, max: 1000 },
};
const COST = { seqPage: 1, randomPage: 4, cpuRow: 0.01 }; // Postgres defaults

function selectivity({ col, op, value }) {
  const s = stats[col];
  if (!s) return op === "=" ? 0.005 : 0.3333; // no stats: Postgres's hard-coded guesses
  if (op === "=") return s.mcv?.[value] ?? 1 / s.distinct;
  return Math.min(1, Math.max(0, (value - s.min) / (s.max - s.min)));
}

function plan(pred, indexes) {
  const sel = selectivity(pred);
  const rows = sel * table.rows;
  const options = [{ name: "Seq Scan", cost: table.pages * COST.seqPage + table.rows * COST.cpuRow }];
  if (indexes.includes(pred.col)) {
    const pages = Math.min(table.pages, rows); // scattered rows: one random page each
    options.push({ name: "Index Scan", cost: 3 * COST.randomPage + pages * COST.randomPage + rows * COST.cpuRow });
  }
  options.sort((a, b) => a.cost - b.cost);
  const shown = options.map((o) => \`\${o.name} \${Math.round(o.cost)}\`).join(" | ");
  console.log(\`\${pred.col} \${pred.op} \${pred.value}\`.padEnd(22), \`~\${Math.round(rows)} rows\`.padEnd(13), "->", shown);
}

const indexes = ["status", "created_at"];
plan({ col: "status", op: "=", value: "banned" }, indexes);
plan({ col: "status", op: "=", value: "active" }, indexes);
plan({ col: "created_at", op: "<", value: 5 }, indexes);
plan({ col: "created_at", op: "<", value: 500 }, indexes);
plan({ col: "email", op: "=", value: "a@b.c" }, indexes);`,
          task: "Add a `correlation` stat: if the table is physically sorted by the column, the index reads `sel * pages` pages at seqPage cost. Watch the tipping point move.",
        },
        {
          t: "table",
          head: ["You wrote", "Why the index is skipped", "Fix"],
          rows: [
            ["`WHERE lower(email) = $1`", "The index stores `email`, not `lower(email)`", "Expression index: `ON users (lower(email))`"],
            ["`WHERE name LIKE '%ada'`", "Leading wildcard: no prefix to seek on", "Trigram index (`pg_trgm`) or full-text search"],
            ["`WHERE phone = 5551234`", "`phone` is text; the cast happens per row", "Compare with the column's type"],
            ["`WHERE status = 'active'`", "Matches 93% of rows; seq scan is cheaper", "Nothing. The planner is right"],
            ["`WHERE a = 1 OR b = 2`", "One tree can't answer both", "Two indexes (bitmap OR) or `UNION`"],
            ["Just loaded 10M rows", "Stats still say the table is tiny", "`ANALYZE orders;`"],
          ],
        },
        {
          t: "pitfall",
          h: "`LIKE 'abc%'` may not use a plain Postgres index",
          x: "In a non-C collation, a default B-tree index can't serve prefix `LIKE`, because collation order isn't byte order. Create it with `text_pattern_ops` (`ON users (email text_pattern_ops)`) or use a C-collated column.",
        },
        {
          t: "pitfall",
          h: "`EXPLAIN ANALYZE` runs the query",
          x: "It executes the statement to get real timings. On `UPDATE` or `DELETE`, that means the rows change. Wrap it: `BEGIN; EXPLAIN ANALYZE DELETE ...; ROLLBACK;`. Plain `EXPLAIN` only estimates.",
        },
        {
          t: "quiz",
          q: "EXPLAIN says `rows=12` but ANALYZE shows `actual rows=480000`. What's the real problem?",
          options: ["Missing index", "The estimate is off, so every later plan choice is built on a lie", "The disk is slow", "Too many columns"],
          answer: 1,
          why: "Read EXPLAIN for the gap between estimated and actual rows. A 40000x miss makes the planner pick nested loops where it needed a hash join. Fix the stats: `ANALYZE`, a higher statistics target, or extended statistics for correlated columns.",
        },
      ],
    },
    {
      title: "Transactions and isolation",
      beats: [
        { t: "say", x: "A transaction makes several statements succeed or fail together. **Isolation** decides what concurrent transactions can see of each other. Each level is a list of bugs it permits." },
        {
          t: "viz",
          name: "frames",
          props: {
            cols: ["Request A", "Request B", "Row: stock"],
            frames: [
              { cells: [[], [], ["stock = 10"]], note: "Two buyers hit \"buy 1\" at the same moment. The app does read, compute, write." },
              { cells: [["SELECT stock -> 10"], [], ["stock = 10"]], note: "A reads 10." },
              { cells: [["SELECT stock -> 10"], ["SELECT stock -> 10"], ["stock = 10"]], note: "B reads 10 too. Nothing is locked, and no isolation level stops a plain read here." },
              { cells: [["UPDATE stock = 9"], ["SELECT stock -> 10"], ["stock = 9"]], note: "A writes 10 - 1." },
              { cells: [["COMMIT"], ["UPDATE stock = 9"], ["stock = 9"]], note: "B also writes 10 - 1, computed from its stale read." },
              { cells: [["done"], ["COMMIT"], ["stock = 9"]], note: "Two sold, stock dropped by one. This is a **lost update**, and it's legal under Read Committed." },
            ],
          },
        },
        {
          t: "compare",
          a: { label: "read-modify-write in the app", lang: "js", src: "const { stock } = await db.one(\n  'SELECT stock FROM items WHERE id = $1', [id]);\nawait db.none(\n  'UPDATE items SET stock = $1 WHERE id = $2',\n  [stock - 1, id]);" },
          b: { label: "let the database do it", lang: "js", src: "const res = await db.result(\n  `UPDATE items SET stock = stock - 1\n   WHERE id = $1 AND stock > 0`, [id]);\nif (res.rowCount === 0) throw new Error('sold out');" },
          x: "The atomic `UPDATE` takes a row lock and re-reads the latest value. No race, no oversell, one round trip. When you must read first, use `SELECT ... FOR UPDATE`.",
        },
        {
          t: "table",
          head: ["Anomaly", "What happens", "Allowed at"],
          rows: [
            ["Dirty read", "You see another tx's uncommitted write", "Read Uncommitted (Postgres never allows it)"],
            ["Non-repeatable read", "Same row, read twice, different values", "Read Committed"],
            ["Phantom", "Same `WHERE`, run twice, new rows appear", "Read Committed; Repeatable Read in the SQL standard"],
            ["Lost update", "Two read-modify-writes, one vanishes", "Read Committed"],
            ["Write skew", "Two txs check a rule, both write, rule broken", "Repeatable Read (snapshot)"],
          ],
          caption: "Postgres defaults to Read Committed; MySQL InnoDB to Repeatable Read. Only Serializable stops all five.",
        },
        {
          t: "predict",
          lang: "sql",
          src: "-- Postgres, READ COMMITTED (the default)\nBEGIN;\nSELECT balance FROM accounts WHERE id = 1;  -- 100\n-- another session: UPDATE ... SET balance = 50; COMMIT;\nSELECT balance FROM accounts WHERE id = 1;\nCOMMIT;",
          q: "What does the second SELECT return?",
          options: ["100", "50", "It blocks until the other session ends", "An error"],
          answer: 1,
          why: "Read Committed takes a fresh snapshot per **statement**, so it sees the committed 50: a non-repeatable read. Under Repeatable Read the snapshot is per **transaction** and you'd get 100 again.",
        },
        {
          t: "pitfall",
          h: "Serializable means you must retry",
          x: "At Serializable (and Repeatable Read in Postgres), a conflict aborts one tx with SQLSTATE `40001`. That's the database working. Wrap the whole transaction in a retry loop with backoff; code that doesn't retry just turns races into 500s.",
        },
        {
          t: "quiz",
          q: "On-call rule: at least one doctor on shift. Two doctors each check \"someone else is on\" and go off at the same time. What stops it?",
          options: ["Repeatable Read", "Serializable, or locking the rows you checked with FOR UPDATE", "A unique index", "Autocommit"],
          answer: 1,
          why: "Classic **write skew**: each tx read a snapshot where the rule held, and they wrote different rows, so snapshot isolation sees no conflict. Serializable detects the dependency; `FOR UPDATE` on the checked rows forces them to queue.",
        },
      ],
    },
    {
      title: "MVCC in one picture",
      beats: [
        { t: "say", x: "Postgres never updates a row in place. An `UPDATE` writes a **new version** and marks the old one dead. Each version carries `xmin` (who created it) and `xmax` (who ended it). Your snapshot picks which version you see." },
        {
          t: "viz",
          name: "frames",
          props: {
            cols: ["Tx 100 (reader)", "Tx 101 (writer)", "Heap: versions of row 1"],
            frames: [
              { cells: [["BEGIN, snapshot: 100"], [], ["v1 bal=100 xmin=90"]], note: "One live version, created long ago by tx 90." },
              { cells: [["snapshot: 100"], ["UPDATE bal=50"], ["v1 bal=100 xmin=90 xmax=101", "v2 bal=50 xmin=101"]], note: "The update doesn't overwrite. It stamps v1 with xmax=101 and appends v2." },
              { cells: [["SELECT -> 100"], ["(not committed)"], ["v1 bal=100 xmin=90 xmax=101", "v2 bal=50 xmin=101"]], note: "Reader sees v1: 101 isn't committed in its snapshot. Nobody waited on a lock." },
              { cells: [["snapshot: 100"], ["COMMIT"], ["v1 bal=100 xmin=90 xmax=101", "v2 bal=50 xmin=101"]], note: "Writer commits. Both versions still exist on disk." },
              { cells: [["RR: SELECT -> 100", "RC: SELECT -> 50"], [], ["v1 bal=100 xmin=90 xmax=101", "v2 bal=50 xmin=101"]], note: "Repeatable Read keeps the old snapshot; Read Committed takes a new one per statement." },
              { cells: [["COMMIT"], [], ["v1 (dead)", "v2 bal=50 xmin=101"]], note: "No snapshot needs v1 any more. It's garbage." },
              { cells: [[], [], ["v2 bal=50 xmin=101"]], note: "`VACUUM` reclaims v1's space. Until then, it's bloat." },
            ],
          },
        },
        { t: "say", x: "The payoff: **readers never block writers, writers never block readers**. Only two writers on the same row wait for each other. The cost is dead versions that someone has to clean up." },
        {
          t: "pitfall",
          h: "One idle transaction bloats every table",
          x: "VACUUM can't remove a version any open snapshot might need. A connection stuck `idle in transaction` for 6 hours (a debugger, a forgotten `BEGIN`) pins garbage database-wide. Set `idle_in_transaction_session_timeout` and watch `pg_stat_activity`.",
        },
        {
          t: "quiz",
          q: "Why does updating one column of a wide row cost more than you'd think in Postgres?",
          options: ["It locks the whole table", "The whole row is rewritten as a new version, and indexes may need new entries", "It triggers a VACUUM", "Postgres compresses rows"],
          answer: 1,
          why: "A new tuple means a full copy. If no indexed column changed and the page has room, a **HOT** update skips index writes. Leave free space (`fillfactor`) on hot-updated tables to make that likely.",
        },
      ],
    },
    {
      title: "The app side: N+1 and pools",
      beats: [
        {
          t: "predict",
          lang: "js",
          src: "const posts = await Post.find().limit(100);\nfor (const p of posts) {\n  p.author = await User.findById(p.authorId);\n}",
          q: "How many round trips to the database?",
          options: ["1", "2", "100", "101"],
          answer: 3,
          why: "One for the posts, one per post for the author: **N+1**. At 1 ms per round trip that's 101 ms of pure waiting, and it grows with the page size. ORMs hide this behind innocent-looking property access.",
        },
        {
          t: "compare",
          a: { label: "N+1", lang: "js", src: "for (const p of posts) {\n  p.author = await User.findById(p.authorId);\n}" },
          b: { label: "2 queries, any N", lang: "js", src: "const ids = [...new Set(posts.map((p) => p.authorId))];\nconst users = await User.find({ _id: { $in: ids } }).lean();\nconst byId = new Map(users.map((u) => [String(u._id), u]));\nfor (const p of posts) p.author = byId.get(String(p.authorId));" },
          x: "Batch by id, join in memory. This is exactly what Mongoose `populate()` and GraphQL's DataLoader do. In SQL, just `JOIN`.",
        },
        {
          t: "pitfall",
          h: "Find N+1 by counting, not by reading",
          x: "Log the query count per request in development and fail a test when an endpoint exceeds a budget. Reading code misses N+1 hidden in a serializer or a getter; a counter never does.",
        },
        { t: "say", h: "Connection pools", x: "Opening a Postgres connection costs a TCP + TLS handshake, auth and a new server **process** (a few MB each). A pool keeps a handful open and lends them out per query. Default `max_connections` is 100." },
        {
          t: "code",
          lang: "js",
          file: "db.js",
          src: "import pg from 'pg';\n\nexport const pool = new pg.Pool({\n  connectionString: process.env.DATABASE_URL,\n  max: 10,                      // per process\n  idleTimeoutMillis: 30_000,\n  connectionTimeoutMillis: 2_000, // fail fast instead of queueing forever\n});\n\n// A transaction must use ONE client, not pool.query.\nexport async function tx(fn) {\n  const client = await pool.connect();\n  try {\n    await client.query('BEGIN');\n    const out = await fn(client);\n    await client.query('COMMIT');\n    return out;\n  } catch (e) {\n    await client.query('ROLLBACK');\n    throw e;\n  } finally {\n    client.release();\n  }\n}",
          mark: [10, 22],
          note: "`pool.query('BEGIN')` then `pool.query('UPDATE ...')` may run on two different connections. The BEGIN does nothing and the UPDATE autocommits.",
        },
        {
          t: "quiz",
          q: "A 4-core DB server is slow under load. Someone raises the pool from 10 to 200. What happens?",
          options: ["Throughput scales 20x", "It usually gets slower: more context switching and lock contention on 4 cores", "No change", "Postgres rejects it"],
          answer: 1,
          why: "A core runs one query at a time. Past a small multiple of cores, extra connections just queue inside the database, fighting for locks and cache. A classic starting point: `cores * 2 + disks`. Queue in the app, not in the DB.",
        },
        {
          t: "pitfall",
          h: "Serverless multiplies your pool",
          x: "Each function instance has its own pool. 50 warm instances with `max: 10` is 500 connections against a limit of 100. Use `max: 1` per instance behind a pooler (PgBouncer in transaction mode, or your host's pooler), and avoid session state like `SET` or advisory locks.",
        },
      ],
    },
    {
      title: "Documents: MongoDB",
      beats: [
        { t: "say", x: "MongoDB stores JSON-like documents (BSON) in collections. The core design question isn't tables vs documents. It's **what do you read together**: data read together should be stored together." },
        {
          t: "table",
          head: ["Embed when", "Reference when"],
          rows: [
            ["Always read with the parent (an order's line items)", "Read on its own (a user, a product)"],
            ["Bounded: a handful to a few hundred", "Unbounded: comments, events, followers"],
            ["Owned: deleted with the parent", "Shared by many parents"],
            ["Snapshot is fine (price at time of order)", "Must stay current everywhere"],
          ],
        },
        {
          t: "code",
          lang: "js",
          file: "models/order.js",
          src: "import mongoose from 'mongoose';\n\nconst lineSchema = new mongoose.Schema(\n  { sku: String, qty: { type: Number, min: 1 }, price: Number },\n  { _id: false },\n);\n\nconst orderSchema = new mongoose.Schema(\n  {\n    userId: { type: mongoose.Types.ObjectId, ref: 'User', required: true },\n    status: { type: String, enum: ['cart', 'paid', 'shipped'], default: 'cart' },\n    lines: [lineSchema],      // embedded: bounded, owned, read together\n    total: Number,\n  },\n  { timestamps: true },\n);\n\n// ESR: Equality (userId, status), Sort (createdAt), Range last.\norderSchema.index({ userId: 1, status: 1, createdAt: -1 });\n\nexport const Order = mongoose.model('Order', orderSchema);",
          mark: [12, 19],
          note: "`ref: 'User'` is a reference, resolved by `populate()` with one `$in` query per path, not one per document.",
        },
        {
          t: "pitfall",
          h: "The 16 MB document and the unbounded array",
          x: "A document is capped at 16 MB, and every push to a growing array rewrites a bigger document. `post.comments: [...]` works in the demo and falls over at the viral post. Put comments in their own collection with `postId` and an index.",
        },
        {
          t: "code",
          lang: "js",
          src: "// Revenue per user for paid orders this year, top 10.\nawait Order.aggregate([\n  { $match: { status: 'paid', createdAt: { $gte: new Date('2026-01-01') } } },\n  { $group: { _id: '$userId', revenue: { $sum: '$total' }, orders: { $sum: 1 } } },\n  { $sort: { revenue: -1 } },\n  { $limit: 10 },\n  { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },\n  { $unwind: '$user' },\n  { $project: { revenue: 1, orders: 1, name: '$user.name' } },\n]);",
          mark: [3, 7],
          note: "A pipeline is SQL read top to bottom: WHERE, GROUP BY, ORDER BY, LIMIT, JOIN. `$match` first so it can use an index; `$lookup` after `$limit` so it joins 10 docs, not 100k.",
        },
        {
          t: "predict",
          lang: "js",
          src: "// index: { status: 1, createdAt: -1 }\ndb.orders.find({ createdAt: { $gte: lastWeek } })\n  .explain('executionStats');",
          q: "What does the winning plan most likely show?",
          options: ["IXSCAN on the index", "COLLSCAN", "An error: the index doesn't match", "IDHACK"],
          answer: 1,
          why: "Same B+tree rule as SQL: without the leading `status` there's no prefix to seek. Expect `COLLSCAN` and `totalDocsExamined` equal to the collection size. Compare `totalKeysExamined` and `nReturned` to judge any index.",
        },
        {
          t: "pitfall",
          h: "Turn off `autoIndex` in production",
          x: "Mongoose calls `createIndex` for every schema index on startup. On a large collection, a new index builds while serving traffic, on every deploy of every instance. Set `autoIndex: false` in production and build indexes in a migration step.",
        },
        {
          t: "quiz",
          q: "A list endpoint returns 1000 Mongoose documents and does nothing but serialize them. Easiest speedup?",
          options: ["Add an index on _id", "`.lean()`", "Increase the pool", "Use `$lookup`"],
          answer: 1,
          why: "Without `lean()`, Mongoose hydrates each result into a full document with getters, change tracking and methods. `lean()` returns plain objects: often several times faster and far less memory for read-only paths.",
        },
      ],
    },
    {
      title: "Redis as a cache",
      beats: [
        {
          t: "steps",
          h: "Cache-aside, the default pattern",
          items: [
            "Read: `GET key` from Redis.",
            "Hit: return it. Done in well under a millisecond on the same network.",
            "Miss: query the database, then `SET key value EX 300` and return.",
            "Write: update the database first, then `DEL key`. Don't write the new value into the cache.",
          ],
        },
        {
          t: "code",
          lang: "js",
          src: "async function getUser(id) {\n  const key = `user:${id}:v2`;          // version in the key = free mass-invalidation\n  const hit = await redis.get(key);\n  if (hit) return JSON.parse(hit);\n\n  const user = await User.findById(id).lean();\n  const ttl = 300 + Math.floor(Math.random() * 60); // jitter\n  await redis.set(key, JSON.stringify(user ?? null), { EX: ttl });\n  return user;\n}\n\nasync function renameUser(id, name) {\n  await User.updateOne({ _id: id }, { name });\n  await redis.del(`user:${id}:v2`);\n}",
          mark: [2, 7, 14],
          note: "Caching `null` too stops a flood of lookups for ids that don't exist from reaching the database.",
        },
        {
          t: "predict",
          lang: "text",
          src: "Writer:  DEL cache  ->  UPDATE db (slow, 50 ms)\nReader:        (miss) -> SELECT db -> SET cache",
          q: "The writer deletes the cache before updating the DB. A reader arrives in between. Result?",
          options: ["Cache holds the new value", "Cache holds the old value until the TTL expires", "Reader blocks", "Cache stays empty"],
          answer: 1,
          why: "The reader misses, reads the **old** row (update not committed yet) and caches it. The writer finishes, and the stale value now lives for the whole TTL. Update first, delete second, and keep TTLs as the safety net.",
        },
        {
          t: "pitfall",
          h: "The TTL stampede",
          x: "A hot key expires and 2000 requests miss at once, all hitting the database with the same expensive query. Fixes: jitter TTLs so keys don't expire together, let one request rebuild behind a lock (`SET lock NX PX 5000`), or serve stale while one refreshes in the background.",
        },
        {
          t: "quiz",
          q: "Redis is your cache. It restarts and comes back empty. What should happen?",
          options: ["Nothing breaks, it's only slower for a while", "Users lose data", "The app crashes", "Sessions survive"],
          answer: 0,
          why: "That's the test of a cache: losing it must be survivable. If losing Redis loses data (sessions, queues, rate limits), it's a **datastore**: configure persistence and treat it like one. Also check your DB can take the cold-start load.",
        },
      ],
    },
    {
      title: "Choosing, and changing, the schema",
      beats: [
        {
          t: "table",
          head: ["", "Postgres", "MongoDB"],
          rows: [
            ["Shape of data", "Relational, joins everywhere", "Aggregates read as one document"],
            ["Constraints", "FKs, CHECK, UNIQUE, types: the DB guards invariants", "Schema lives in your app (Mongoose), optional validators"],
            ["Transactions", "The core of the engine", "Multi-document since 4.0; fine, but not the happy path"],
            ["Ad-hoc queries", "SQL, window functions, a mature planner", "Aggregation pipeline, good but more verbose"],
            ["Flexible fields", "`jsonb` with GIN indexes covers most needs", "Native"],
            ["Scale-out", "Vertical first, read replicas, then sharding tools", "Built-in sharding"],
          ],
          caption: "Honest default: Postgres, unless your data really is independent documents. Both run far past what most apps ever need.",
        },
        {
          t: "say",
          x: "A **migration** is a versioned script that moves the schema forward, checked into git and run once per environment. The hard part isn't writing it. It's running it while the old code is still serving traffic.",
        },
        {
          t: "steps",
          h: "Rename a column with zero downtime (expand, migrate, contract)",
          items: [
            "Expand: add `full_name`, nullable. Old code ignores it.",
            "Deploy code that writes both `name` and `full_name`, reads `name`.",
            "Backfill `full_name` in batches of a few thousand rows, not one giant UPDATE.",
            "Deploy code that reads `full_name`.",
            "Contract: stop writing `name`, then drop it in a later release.",
          ],
        },
        {
          t: "code",
          lang: "sql",
          src: "-- migrations/0042_orders_status_idx.sql\nSET lock_timeout = '3s';\n\n-- Doesn't block writes. Can't run inside a transaction block.\nCREATE INDEX CONCURRENTLY IF NOT EXISTS orders_status_idx\n  ON orders (status);\n\n-- Fast since Postgres 11 for a constant default: no table rewrite.\nALTER TABLE orders ADD COLUMN source text NOT NULL DEFAULT 'web';",
          mark: [2, 5],
          note: "A failed `CONCURRENTLY` build leaves an INVALID index behind. Drop it and retry.",
        },
        {
          t: "pitfall",
          h: "The lock queue takes the site down",
          x: "`ALTER TABLE` needs an exclusive lock. If a long query holds the table, the ALTER waits, and every new query queues **behind the ALTER**. A 1 ms migration becomes a full outage. Always set `lock_timeout` and retry.",
        },
        {
          t: "mission",
          h: "Make a slow endpoint fast",
          x: "Seed Postgres with 1M orders over 10k users (`generate_series`). Write the \"latest 10 orders for a user\" query, capture `EXPLAIN (ANALYZE, BUFFERS)`, then add the right index and get an Index Only Scan with zero heap fetches.",
          hint: "Seed with `INSERT ... SELECT ... FROM generate_series(1, 1000000)`. Index order: equality column, then sort column, `INCLUDE` the selected ones. Run `VACUUM ANALYZE` after.",
          solution: {
            lang: "sql",
            src: "CREATE TABLE orders (id bigserial PRIMARY KEY, user_id int, total numeric, created_at timestamptz);\nINSERT INTO orders (user_id, total, created_at)\nSELECT (random() * 10000)::int, random() * 100, now() - random() * interval '365 days'\nFROM generate_series(1, 1000000);\n\nCREATE INDEX ON orders (user_id, created_at DESC) INCLUDE (total);\nVACUUM ANALYZE orders;\n\nEXPLAIN (ANALYZE, BUFFERS)\nSELECT created_at, total FROM orders\nWHERE user_id = 42 ORDER BY created_at DESC LIMIT 10;",
          },
        },
        {
          t: "mission",
          h: "Reproduce a lost update, then fix it",
          x: "Write a Node script that fires 100 concurrent \"buy 1\" requests at a stock of 50 using read-then-write. Count how many sold vs how much stock dropped. Then fix it two ways: an atomic `UPDATE ... WHERE stock > 0`, and `SELECT ... FOR UPDATE` in a transaction.",
          hint: "Use `Promise.all` over 100 calls, a pool of 10, and the `tx` helper from earlier. Log `rowCount` to count successful sales.",
        },
      ],
    },
  ],
  nobodyTells: [
    "Read EXPLAIN for the gap between estimated and actual rows. A bad estimate, not a missing index, is behind most slow queries.",
    "Every index slows every write to that table. Drop the ones `pg_stat_user_indexes` shows with `idx_scan = 0`.",
    "`SELECT *` kills index-only scans and ships columns you didn't need. Name the columns.",
    "OFFSET pagination reads and throws away every skipped row. Page with `WHERE (created_at, id) < ($1, $2)` instead.",
    "A connection stuck `idle in transaction` does more damage than a slow query. Set the timeout.",
    "Put a statement timeout on the app's DB role. A runaway query should die in seconds, not hold a connection for an hour.",
    "Test migrations against a copy of production-sized data. Timing on 100 rows tells you nothing.",
    "A cache you can't flush without an outage isn't a cache. Put a version in your keys.",
  ],
  glossary: [
    ["B+tree", "Balanced tree of fat pages; keys live in linked leaves, so ranges are sequential. The default index everywhere."],
    ["selectivity", "The fraction of rows a predicate matches. The planner's main input when choosing a plan."],
    ["covering index", "An index holding every column a query needs, so the table is never read (Index Only Scan)."],
    ["isolation level", "Which concurrency anomalies a database permits: Read Committed, Repeatable Read, Serializable."],
    ["MVCC", "Multi-version concurrency control: writes create new row versions, readers see a consistent snapshot."],
    ["N+1", "One query for a list, then one per item. Fix by batching with IN or a join."],
    ["connection pool", "A set of open DB connections reused across requests, capped to protect the server."],
    ["cache-aside", "App checks the cache, falls back to the DB on a miss, and fills the cache itself."],
    ["expand/contract", "Schema change in backward-compatible steps so old and new code can run at once."],
  ],
  explain: "Explain to a friend why adding an index can make a query slower, and how the planner decides whether to use one.",
};
