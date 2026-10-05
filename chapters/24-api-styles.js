const VARINT_PLAY = String.raw`// Protobuf's wire format by hand. Every field is a tag, then a value.
// tag = (field number << 3) | wire type. Wire type 0 = varint, 2 = length-delimited.
function varint(n) {
  const out = [];
  let v = BigInt.asUintN(64, BigInt(n)); // a negative int32 becomes a huge unsigned number
  do {
    let byte = Number(v & 0x7fn);        // low 7 bits
    v >>= 7n;
    if (v) byte |= 0x80;                 // high bit set: more bytes follow
    out.push(byte);
  } while (v);
  return out;
}
const zigzag = (n) => (n << 1) ^ (n >> 31); // sint32: -1 -> 1, 1 -> 2, -2 -> 3
const hex = (bytes) => bytes.map((b) => b.toString(16).padStart(2, "0")).join(" ");
const tag = (field, wire) => varint((field << 3) | wire);
const int = (field, n) => [...tag(field, 0), ...varint(n)];
const str = (field, s) => {
  const b = [...new TextEncoder().encode(s)];
  return [...tag(field, 2), ...varint(b.length), ...b];
};

// message User { int32 id = 1; string name = 2; bool active = 3; int32 delta = 4; }
const user = { id: 150, name: "Ada", active: true, delta: 5 };
const bytes = [
  ...int(1, user.id),
  ...str(2, user.name),
  ...int(3, user.active ? 1 : 0),
  ...int(4, user.delta),
];
const json = JSON.stringify(user);

console.log("150 as a varint:", hex(varint(150)));
console.log("protobuf:", hex(bytes), "->", bytes.length, "bytes");
console.log("json:    ", json, "->", json.length, "bytes");
console.log("-1 as int32:", varint(-1).length, "bytes. As sint32:", varint(zigzag(-1)).length, "byte");`;

const GQL_REBUILD = String.raw`// A GraphQL-style executor: walk the selection, call one resolver per field.
// The fake database counts round trips.
const users = { 1: { id: 1, name: "Ada" }, 2: { id: 2, name: "Lin" }, 3: { id: 3, name: "Sam" } };
const posts = Array.from({ length: 10 }, (_, i) => ({ id: i + 1, title: "Post " + (i + 1), authorId: (i % 3) + 1 }));
let trips = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const db = {
  async posts() { trips++; await sleep(5); return posts; },
  async usersByIds(ids) { trips++; console.log("  db: users where id in", JSON.stringify(ids)); await sleep(5); return ids.map((id) => users[id]); },
};

// DataLoader in miniature: queue keys, dispatch once the current work settles.
// The real one uses process.nextTick in Node; setTimeout works here.
function makeLoader(batchFn) {
  let queue = [];
  const cache = new Map(); // per request: the same id is fetched once
  async function dispatch() {
    const batch = queue;
    queue = [];
    try {
      const values = await batchFn(batch.map((b) => b.key)); // same length, same order as keys
      batch.forEach((b, i) => b.resolve(values[i]));
    } catch (e) {
      batch.forEach((b) => b.reject(e));
    }
  }
  return {
    load(key) {
      if (cache.has(key)) return cache.get(key);
      const p = new Promise((resolve, reject) => {
        queue.push({ key, resolve, reject });
        if (queue.length === 1) setTimeout(dispatch, 0); // the first key schedules the batch
      });
      cache.set(key, p);
      return p;
    },
  };
}

// Resolvers: (parent, ctx) -> value. No resolver means "read the property".
const resolvers = {
  Query: { posts: () => db.posts() },
  Post: {
    author: (post, ctx) => ctx.loader
      ? ctx.loader.load(post.authorId)
      : db.usersByIds([post.authorId]).then((rows) => rows[0]),
  },
};
const typeOf = { posts: "Post", author: "User" };

async function execute(type, parent, selection, ctx) {
  const out = {};
  await Promise.all(Object.entries(selection).map(async ([field, sub]) => {
    const resolve = resolvers[type]?.[field] ?? ((p) => p[field]);
    const value = await resolve(parent, ctx);
    if (sub === true || value == null) return (out[field] = value);
    const child = typeOf[field];
    out[field] = Array.isArray(value)
      ? await Promise.all(value.map((v) => execute(child, v, sub, ctx)))
      : await execute(child, value, sub, ctx);
  }));
  return out;
}

// query { posts { title author { name } } }
const query = { posts: { title: true, author: { name: true } } };

(async () => {
  for (const useLoader of [false, true]) {
    trips = 0;
    console.log(useLoader ? "with a loader:" : "naive:");
    const ctx = { loader: useLoader ? makeLoader(db.usersByIds) : null }; // one loader per request
    const data = await execute("Query", null, query, ctx);
    console.log("  ->", trips, "round trips. first post:", JSON.stringify(data.posts[0]));
  }
})();`;

const RPC_PLAY = String.raw`// JSON-RPC 2.0: a server, a client, and a fake transport that only moves strings.
const methods = {
  add: ([a, b]) => a + b,
  getUser: ({ id }) => {
    if (typeof id !== "number") throw { code: -32602, message: "Invalid params: id must be a number" };
    return { id, name: "Ada" };
  },
  log: (p) => { console.log("  server log:", p.msg); },
};

function handle(req) {
  const isCall = "id" in req; // no id: a notification. Run it, never reply.
  const reply = (body) => (isCall ? { jsonrpc: "2.0", ...body, id: req.id } : null);
  if (req.jsonrpc !== "2.0" || typeof req.method !== "string")
    return { jsonrpc: "2.0", error: { code: -32600, message: "Invalid Request" }, id: null };
  const fn = methods[req.method];
  if (!fn) return reply({ error: { code: -32601, message: "Method not found" } });
  try {
    return reply({ result: fn(req.params) ?? null });
  } catch (e) {
    return reply({ error: e.code ? e : { code: -32603, message: "Internal error" } });
  }
}

function server(text) {
  let msg;
  try { msg = JSON.parse(text); }
  catch { return JSON.stringify({ jsonrpc: "2.0", error: { code: -32700, message: "Parse error" }, id: null }); }
  if (Array.isArray(msg)) {
    if (!msg.length) return JSON.stringify(handle({}));
    const out = msg.map(handle).filter(Boolean);
    return out.length ? JSON.stringify(out) : ""; // a batch of notifications gets nothing back
  }
  const out = handle(msg);
  return out ? JSON.stringify(out) : "";
}

// Strings in, strings out, 10 ms later. Could be HTTP, a WebSocket or stdio.
const transport = (text) => new Promise((r) => setTimeout(() => r(server(text)), 10));

let nextId = 1;
const pending = new Map(); // id -> { resolve, reject }
const request = (method, params) => ({ jsonrpc: "2.0", method, params, id: nextId++ });
const track = (req) => new Promise((resolve, reject) => pending.set(req.id, { resolve, reject }));
async function send(payload) {
  const text = await transport(JSON.stringify(payload));
  if (!text) return;
  for (const res of [].concat(JSON.parse(text))) {
    const p = pending.get(res.id);
    if (!p) { console.log("  unmatched:", JSON.stringify(res)); continue; }
    pending.delete(res.id);
    res.error ? p.reject(res.error) : p.resolve(res.result);
  }
}
const show = (label, p) => p.then((r) => console.log(label, "->", JSON.stringify(r)),
  (e) => console.log(label, "-> error", e.code, e.message));

(async () => {
  const r = request("add", [2, 3]);
  const one = show("add(2, 3)", track(r));
  await send(r);
  await one;

  await send({ jsonrpc: "2.0", method: "log", params: { msg: "a notification: no reply" } });

  const batch = [request("getUser", { id: 7 }), request("getUser", { id: "7" }), request("nope", [])];
  const all = Promise.all(batch.map((b, i) => show("batch[" + i + "] " + b.method, track(b))));
  await send([...batch, { jsonrpc: "2.0", method: "log", params: { msg: "inside a batch" } }]);
  await all;

  console.log("raw reply to bad JSON:", await transport("{not json"));
})();`;

export default {
  id: "api-styles",
  n: 24,
  part: "E",
  title: "API styles: REST, GraphQL, gRPC, SOAP and more",
  hook: "Every API style moves a cost somewhere: to the server, the network, the client or the next deploy. Learn where.",
  minutes: 85,
  levels: ["use", "understand", "rebuild"],
  sections: [
    {
      title: "Every style is a cost model",
      beats: [
        { t: "say", x: "An API style is a bundle of decisions: who picks the shape of the response, what bytes cross the wire, where the contract lives, and how much the network in the middle understands. Each one buys something, and someone pays for it." },
        {
          t: "table",
          head: ["Style", "Optimises for", "Pays with"],
          rows: [
            ["REST over HTTP + JSON", "Every proxy, cache, CDN and tool already understands it", "Fixed shapes: over-fetching, or many round trips"],
            ["GraphQL", "The client picks the exact shape in one round trip", "Server complexity: N+1, query cost, no free HTTP caching"],
            ["gRPC", "Typed, compact, streaming calls between services", "Browsers can't speak it; L7 tooling and proxies needed"],
            ["SOAP", "Formal contracts, message-level security, enterprise tooling", "Verbose XML, heavy toolchains, few modern libraries"],
            ["JSON-RPC, tRPC", "Calling a function on the other side with no ceremony", "No HTTP semantics; tRPC ties both ends to TypeScript"],
            ["Events: queues, logs, webhooks", "Producers and consumers that never wait for each other", "Duplicates, ordering, and debugging across time"],
          ],
        },
        { t: "say", x: "*Designing APIs* covered REST in depth. What it buys that every other style gives up: the network understands it. Caches read `Cache-Control`, CDNs key on the URL, retries branch on the method, dashboards count status codes. That is the price of leaving." },
        {
          t: "quiz",
          q: "Which of these can a CDN cache with no special setup?",
          options: ["`GET /products/42` with `Cache-Control: public, max-age=60`", "`POST /graphql` with a query for product 42", "A gRPC unary call `GetProduct(42)`", "All three, if the responses are identical"],
          answer: 0,
          why: "Shared caches key on method and URL, and POST responses aren't reused by default. GraphQL usually POSTs every query to one URL and gRPC POSTs to one path per method, so the arguments hide in the body, where the cache never looks.",
        },
      ],
    },
    {
      title: "GraphQL: the client picks the shape",
      beats: [
        {
          t: "code",
          lang: "graphql",
          file: "schema.graphql",
          src: "type Query {\n  post(id: ID!): Post\n  posts(first: Int = 20, after: String): [Post!]!\n}\n\ntype Mutation {\n  publish(id: ID!): Post!\n}\n\ntype Post {\n  id: ID!\n  title: String!\n  author: User!\n  comments(first: Int = 10): [Comment!]!\n}\n\ntype User {\n  id: ID!\n  name: String!\n  avatarUrl: String @deprecated(reason: \"Use avatar { url }\")\n}\n\ntype Comment { id: ID!  body: String!  author: User! }",
          mark: [21],
          note: "The SDL is the contract. `!` means non-null. Every field is something the client may ask for, so every field is something the server must be ready to compute, alone or nested.",
        },
        {
          t: "compare",
          a: { label: "the query", lang: "graphql", src: "query PostPage($id: ID!) {\n  post(id: $id) {\n    title\n    author { name }\n    comments(first: 3) {\n      body\n      author { name }\n    }\n  }\n}" },
          b: { label: "the response", lang: "json", src: "{\n  \"data\": {\n    \"post\": {\n      \"title\": \"Varints\",\n      \"author\": { \"name\": \"Ada\" },\n      \"comments\": [\n        { \"body\": \"Neat\", \"author\": { \"name\": \"Lin\" } }\n      ]\n    }\n  }\n}" },
          x: "The response mirrors the query, field for field. One round trip replaces `/posts/1`, `/users/7` and `/posts/1/comments`, and nothing is sent that the screen doesn't use.",
        },
        { t: "say", x: "On the server, each field has a **resolver**: `(parent, args, context, info) => value`. The executor walks the query, calls the resolver for every field it meets, and assembles the tree. Fields with no resolver just read the property off the parent." },
        {
          t: "predict",
          lang: "graphql",
          src: "# Query.post is nullable. Post.author is User! (non-null).\n# The author resolver throws: the user service is down.\nquery { post(id: 1) { title author { name } } }",
          q: "What does the client get?",
          options: ["`post.title` with `author: null`, plus an error", "`{ \"data\": { \"post\": null }, \"errors\": [...] }`", "HTTP 500 and no data", "`post.title` and the error, with `author` missing"],
          answer: 1,
          why: "`author` can't be null, so the null bubbles up to the nearest nullable parent: `post`. The title you did fetch is thrown away. Too many `!`s turn one failing field into a blank page. Errors carry a `path` so you can see where it started.",
        },
        {
          t: "pitfall",
          h: "Your error-rate dashboard says 0%",
          x: "With `application/json`, GraphQL servers answer 200 even when the body carries `errors`, and the GraphQL-over-HTTP spec says a response with non-null `data` should be 2xx either way. Count the `errors` array per operation name, or your alerts sleep through outages.",
        },
        {
          t: "quiz",
          q: "A mutation has two top-level fields: `debit(acct: 1, amount: 50)` then `credit(acct: 2, amount: 50)`. A query has two top-level fields too. What does the spec say about order?",
          options: ["Both run in parallel", "Mutation fields run serially, in order; query fields may run in parallel", "Both run serially", "Order is up to the client library"],
          answer: 1,
          why: "The spec requires mutation root fields to execute serially. That orders them; it doesn't make them a transaction. If `credit` fails, `debit` already happened. Put the pair behind one `transfer` field and one database transaction.",
        },
      ],
    },
    {
      title: "GraphQL's bill: N+1, cost and caching",
      beats: [
        {
          t: "predict",
          lang: "js",
          src: "// query { posts(first: 50) { title author { name } } }\nconst resolvers = {\n  Query: { posts: (_, { first }) => db.posts.list(first) },\n  Post:  { author: (post) => db.users.byId(post.authorId) },\n};",
          q: "How many database queries does one request make?",
          options: ["1", "2", "50", "51"],
          answer: 3,
          why: "One for the list, then the `author` resolver runs once per post. Resolvers are local by design: each one sees its parent, never its siblings. That's what makes them composable and what makes N+1 the default.",
        },
        {
          t: "rebuild",
          h: "A resolver executor with DataLoader batching",
          x: "Run it: the naive executor makes 11 round trips, the loader makes 2. The trick is time: each resolver asks for one id, the loader queues the ids, and only after the current work settles does it fire one query for all of them, deduplicated.",
          mode: "js",
          js: GQL_REBUILD,
          task: "Add a depth limit that rejects the query before any resolver runs. Then give list fields a cost of 10 and reject queries over 100. Then make one user id missing: what must the batch return?",
        },
        {
          t: "pitfall",
          h: "A shared DataLoader serves Ada's data to Bob",
          x: "DataLoader caches every key it loaded, for as long as the instance lives. Create it at module scope and it becomes an unbounded cache that never invalidates and ignores permissions. Make loaders per request, in the `context` factory, as the DataLoader README tells you.",
        },
        {
          t: "predict",
          lang: "graphql",
          src: "query {\n  users(first: 100) {\n    friends(first: 100) {\n      friends(first: 100) { name }\n    }\n  }\n}",
          q: "Upper bound on `name` fields resolved?",
          options: ["300", "10,000", "1,000,000", "It depends on the depth limit"],
          answer: 2,
          why: "Lists multiply: 100 x 100 x 100. Twelve lines of query, a million objects. Depth alone doesn't catch it, since this is only 4 deep. Cost analysis does: weight each field and multiply by the `first` argument of every list above it.",
        },
        {
          t: "steps",
          h: "Demand control, cheapest first",
          items: [
            "Trusted documents: first-party clients register their operations at build time and send only an id. Anything else is rejected.",
            "Cap every list argument (`first <= 100`) in the schema, and paginate every list that can grow.",
            "Limit depth, and use a smaller limit for nested lists.",
            "Limit aliases and top-level fields: `a1: user(id: 1) a2: user(id: 2) ...` is a batch attack in one query.",
            "Estimate cost before executing, rate-limit by cost, not by request count.",
            "Set a server-side timeout. Mask error details and disable introspection on public production endpoints.",
          ],
        },
        { t: "say", h: "Caching moves into the client", x: "One URL, one POST: HTTP caches see nothing. GraphQL clients like Apollo and urql normalise results by `__typename` and `id`, so updating one `User` updates every screen that shows it. That cache is yours to invalidate after mutations." },
        {
          t: "code",
          lang: "http",
          src: "# Apollo-style automatic persisted query: hash instead of the full text.\nGET /graphql?operationName=PostPage\n  &variables={\"id\":\"1\"}\n  &extensions={\"persistedQuery\":{\"version\":1,\"sha256Hash\":\"9e1f...\"}}\n\n# Unknown hash: the server answers PersistedQueryNotFound,\n# the client resends once with the full query, the server stores it.\n# Next time the GET hits, and a CDN can cache it by URL.",
          note: "Shown unencoded for reading. The spec allows GET for queries, never for mutations. APQ saves bytes but accepts any query; trusted documents also lock the server to the queries you shipped.",
        },
        {
          t: "pitfall",
          h: "Subscriptions run resolvers per subscriber",
          x: "A subscription is a stream of results over a WebSocket (`graphql-ws`) or SSE. Each event executes the selection set once per subscriber. 5,000 viewers whose selection includes `author { name }` is 5,000 resolver runs per message. Keep subscription payloads flat, or push ids and let clients fetch.",
        },
      ],
    },
    {
      title: "gRPC: the contract compiles",
      beats: [
        {
          t: "code",
          lang: "protobuf",
          file: "users/v1/users.proto",
          src: "syntax = \"proto3\";\npackage users.v1;\n\nservice UserService {\n  rpc GetUser(GetUserRequest) returns (User);                    // unary\n  rpc WatchUsers(WatchRequest) returns (stream User);            // server streaming\n  rpc ImportUsers(stream User) returns (ImportSummary);         // client streaming\n  rpc Sync(stream SyncMessage) returns (stream SyncMessage);    // bidirectional\n}\n\nmessage User {\n  int64 id = 1;\n  string name = 2;\n  bool active = 3;\n  sint32 delta = 4;          // zigzag: small negatives stay small\n  reserved 5;                // was `email`; the number can never come back\n  reserved \"email\";\n}\n\nmessage GetUserRequest { int64 id = 1; }",
          mark: [12, 16],
          note: "The numbers, not the names, are what goes on the wire. `protoc` or `buf generate` turns this file into typed clients and server interfaces for Go, Java, TypeScript and a dozen more.",
        },
        {
          t: "predict",
          lang: "js",
          src: "// message User { int32 id = 1; string name = 2; bool active = 3; int32 delta = 4; }\nconst user = { id: 150, name: \"Ada\", active: true, delta: 5 };\nJSON.stringify(user).length; // 47",
          q: "How many bytes is the same message in protobuf?",
          options: ["47", "28", "12", "8"],
          answer: 2,
          why: "No field names, no quotes, no braces. Each field is a 1-byte tag (field number and wire type) plus a varint or a length and bytes: 3 + 5 + 2 + 2. The play below builds it byte by byte.",
        },
        {
          t: "play",
          mode: "js",
          title: "a protobuf message by hand",
          js: VARINT_PLAY,
          task: "Set `delta` to -1: how many bytes now? Then give `name` field number 16 instead of 2. Why does that cost one byte more?",
        },
        {
          t: "predict",
          lang: "text",
          src: "1,000 users like the one above, as one list.\nJSON:     58,365 bytes\nprotobuf: 20,342 bytes\nBoth are then gzipped, as any HTTP response should be.",
          q: "After gzip, roughly how do they compare?",
          options: ["Protobuf stays about 3x smaller", "Protobuf is about 7% smaller: 8.0 KB vs 8.6 KB", "JSON becomes smaller", "Gzip can't compress protobuf"],
          answer: 1,
          why: "Measured with Node's zlib: 8,645 vs 8,048 bytes. Repeated field names are exactly what gzip removes. Protobuf's real wins are typed codegen, no parsing ambiguity, and less CPU per message on servers, not bytes on a compressed link.",
        },
        {
          t: "steps",
          h: "What a unary call looks like on HTTP/2",
          items: [
            "`POST /users.v1.UserService/GetUser` with `content-type: application/grpc` and, if set, `grpc-timeout: 500m`.",
            "The body is length-prefixed messages: 1 byte compressed flag, 4 bytes big-endian length, then the protobuf bytes.",
            "The response starts with HTTP status 200, headers, then the reply message, framed the same way.",
            "The real result comes last, in trailers: `grpc-status: 0` and maybe `grpc-message`. A failed call is still HTTP 200.",
          ],
        },
        {
          t: "code",
          lang: "js",
          file: "client.js",
          src: "import grpc from '@grpc/grpc-js';\nimport protoLoader from '@grpc/proto-loader';\n\nconst def = protoLoader.loadSync('users/v1/users.proto', { longs: String });\nconst { users } = grpc.loadPackageDefinition(def);\nconst client = new users.v1.UserService('users:50051', grpc.credentials.createInsecure());\n\nclient.GetUser({ id: '7' }, { deadline: Date.now() + 500 }, (err, user) => {\n  if (err?.code === grpc.status.DEADLINE_EXCEEDED) return fallback();\n  if (err) return console.error(err.code, err.details);\n  console.log(user.name);\n});\n\nconst stream = client.WatchUsers({});\nstream.on('data', (u) => console.log('changed', u.id));\nstream.on('error', (e) => console.error(e.code, e.details));",
          mark: [4, 8],
          note: "`longs: String` because `int64` doesn't fit a JS number. The deadline travels as the `grpc-timeout` header, so the server can see how long it has left.",
        },
        {
          t: "pitfall",
          h: "gRPC has no deadline unless you set one",
          x: "grpc.io says it plainly: by default there is no deadline, so a client can wait effectively forever. One stuck downstream then holds threads and connections all the way up the chain. Set a deadline on every call, and pass the remaining budget to the calls it makes.",
        },
        {
          t: "pitfall",
          h: "Your load balancer sends everything to one pod",
          x: "gRPC keeps one long-lived HTTP/2 connection and multiplexes every call over it. A layer 4 balancer, like a plain Kubernetes Service, balances connections, not calls, so one backend gets all of them. Use an L7 proxy (Envoy, a mesh) or client-side balancing.",
        },
      ],
    },
    {
      title: "gRPC in the browser, and the four call shapes",
      beats: [
        {
          t: "table",
          head: ["Call shape", "Good for", "In a browser (gRPC-Web)"],
          rows: [
            ["Unary", "Most calls: request, response", "Yes"],
            ["Server streaming", "Watching changes, progress, large result sets", "Yes"],
            ["Client streaming", "Uploading many records, then one summary", "No"],
            ["Bidirectional", "Chat-like sessions, sync protocols", "No"],
          ],
          caption: "Per the grpc-web project: unary and server streaming only, and server streaming needs the `grpcwebtext` mode.",
        },
        { t: "say", x: "Browsers can't speak raw gRPC: `fetch` gives you no HTTP/2 trailers and no say over framing, and the status lives in trailers. **gRPC-Web** moves the trailers into the body, and a proxy such as Envoy translates to real gRPC behind it." },
        {
          t: "code",
          lang: "http",
          src: "POST /users.v1.UserService/GetUser HTTP/1.1\nContent-Type: application/json\nConnect-Timeout-Ms: 500\n\n{\"id\": \"7\"}\n\n-- or, for a method marked idempotency_level = NO_SIDE_EFFECTS:\nGET /users.v1.UserService/GetUser?encoding=json&message=%7B%22id%22%3A%227%22%7D&connect=v1",
          mark: [2, 8],
          note: "The Connect protocol: plain HTTP from the same .proto, JSON or binary, HTTP/1.1 or newer. Errors use real HTTP statuses. Connect servers also speak gRPC and gRPC-Web on the same port.",
        },
        {
          t: "quiz",
          q: "Your backend is gRPC. A web app needs unary calls, and you'd like to debug them with curl and cache some GETs. Which fits best?",
          options: ["Raw gRPC from the browser", "gRPC-Web through Envoy", "Connect, served from the same .proto", "Rewrite the backend in REST"],
          answer: 2,
          why: "gRPC-Web works but stays binary-framed and always POST. Connect unary calls are ordinary HTTP with JSON, and side-effect-free methods can be GETs that caches understand. The .proto stays the single contract.",
        },
        {
          t: "pitfall",
          h: "`int64` arrives as a string in JSON",
          x: "Protobuf's JSON mapping writes `int64` and `uint64` as strings, because JSON numbers lose precision past 2^53. A TypeScript client that expects `id: number` from a Connect JSON call gets `\"7\"`, and `id === 7` is false. Generated types say `bigint` or `string`. Believe them.",
        },
      ],
    },
    {
      title: "SOAP: XML in an envelope",
      beats: [
        { t: "say", x: "SOAP wraps every message in an XML **envelope**: an optional header for metadata like security, a body for the payload. A **WSDL** file describes the operations and their XML Schema types. It's verbose, formal, and still everywhere money and governments move." },
        {
          t: "code",
          lang: "xml",
          src: "POST /services/checkVatService HTTP/1.1\nContent-Type: text/xml; charset=utf-8\nSOAPAction: \"\"\n\n<soap:Envelope xmlns:soap=\"http://schemas.xmlsoap.org/soap/envelope/\"\n               xmlns:v=\"urn:ec.europa.eu:taxud:vies:services:checkVat:types\">\n  <soap:Body>\n    <v:checkVat>\n      <v:countryCode>IE</v:countryCode>\n      <v:vatNumber>1234567X</v:vatNumber>\n    </v:checkVat>\n  </soap:Body>\n</soap:Envelope>",
          mark: [2, 3, 5],
          note: "SOAP 1.1, as used by the EU's VIES VAT-number check. SOAP 1.2 uses `application/soap+xml` and the `http://www.w3.org/2003/05/soap-envelope` namespace instead.",
        },
        {
          t: "table",
          head: ["WSDL 1.1 part", "What it says"],
          rows: [
            ["`types`", "XML Schema for every element in requests and responses"],
            ["`message`, `portType`", "The operations: which message goes in, which comes out"],
            ["`binding`", "How they map to the wire: SOAP version, document or RPC style, SOAPAction"],
            ["`service`, `port`", "The endpoint address"],
          ],
          caption: "Almost every WSDL you'll meet is 1.1 with document/literal style. WSDL 2.0 exists and is rare.",
        },
        {
          t: "code",
          lang: "js",
          src: "import soap from 'soap';\n\nconst client = await soap.createClientAsync('./partner.wsdl'); // a local copy\nclient.setEndpoint('https://partner.example/services/Orders');  // ignore the WSDL's address\nclient.setSecurity(new soap.WSSecurity(user, pass, { passwordType: 'PasswordDigest' }));\n\nconsole.log(JSON.stringify(client.describe(), null, 2)); // services, ports, operations\n\nconst [result, rawResponse, soapHeader, rawRequest] =\n  await client.GetOrderAsync({ orderId: 'A-42' });",
          mark: [4, 8],
          note: "The `soap` npm package reads the WSDL and builds a method per operation. Keep `rawRequest` and `rawResponse` in your logs: when a partner says \"your XML is wrong\", that's the only evidence.",
        },
        { t: "say", h: "WS-Security", x: "An OASIS standard that secures the message itself: tokens in the header, parts of the body signed with XML Signature or encrypted with XML Encryption. Unlike TLS, it survives every intermediary. The cost is canonicalisation, where most interop pain lives." },
        {
          t: "predict",
          lang: "text",
          src: "VIES, asked to check country code \"XX\":\n\n<env:Fault>\n  <faultcode>env:Server</faultcode>\n  <faultstring>INVALID_INPUT</faultstring>\n</env:Fault>",
          q: "SOAP 1.1 says a fault MUST come with HTTP 500. What status did this real response carry?",
          options: ["500", "400", "200", "422"],
          answer: 2,
          why: "200, and the faultcode blames the server for bad input. Real SOAP services drift from the spec, so check the body for a `Fault` on every response. And a wrapper that retries every 5xx retries validation faults from spec-following servers.",
        },
        {
          t: "pitfall",
          h: "XML parsers fetch files for attackers",
          x: "XML's DTDs can declare external entities: `<!ENTITY x SYSTEM \"file:///etc/passwd\">`. A parser that resolves them reads local files or calls internal URLs (XXE), and nested entities can blow up memory. Any service that accepts SOAP must turn DTD processing off.",
        },
      ],
    },
    {
      title: "JSON-RPC and tRPC: just call the function",
      beats: [
        {
          t: "code",
          lang: "json",
          src: "--> {\"jsonrpc\": \"2.0\", \"method\": \"getUser\", \"params\": {\"id\": 7}, \"id\": 1}\n<-- {\"jsonrpc\": \"2.0\", \"result\": {\"id\": 7, \"name\": \"Ada\"}, \"id\": 1}\n\n--> {\"jsonrpc\": \"2.0\", \"method\": \"nope\", \"id\": 2}\n<-- {\"jsonrpc\": \"2.0\", \"error\": {\"code\": -32601, \"message\": \"Method not found\"}, \"id\": 2}\n\n--> {\"jsonrpc\": \"2.0\", \"method\": \"log\", \"params\": [\"hi\"]}\n<-- (nothing: no id makes it a notification)",
          note: "That's the whole spec: method, params, id, and result or error. It says nothing about transport, which is why it runs over HTTP, WebSockets and stdio alike.",
        },
        {
          t: "play",
          mode: "js",
          title: "JSON-RPC over a fake transport",
          js: RPC_PLAY,
          task: "Make the transport drop every third reply. Add a per-call timeout that rejects and deletes the entry from `pending`. What happens if the reply arrives after the timeout?",
        },
        { t: "say", x: "JSON-RPC 2.0 is quietly everywhere: Ethereum nodes, the Language Server Protocol between your editor and its language servers, and the Model Context Protocol. All of them want calls and notifications in both directions over one pipe." },
        {
          t: "quiz",
          q: "A client sends a batch `[A, B, C]` where B is a notification. What may the server send back?",
          options: ["`[resA, resB, resC]` in that order", "`[resC, resA]`, in any order", "Three separate responses", "Only an acknowledgement"],
          answer: 1,
          why: "Notifications get no response object, and the spec lets batch responses come back in any order. Clients must match by `id`, never by position. A batch of only notifications gets nothing back at all.",
        },
        {
          t: "compare",
          a: { label: "server: the router is the contract", lang: "ts", src: "import { initTRPC } from '@trpc/server';\nimport { z } from 'zod';\n\nconst t = initTRPC.create();\n\nexport const appRouter = t.router({\n  userById: t.procedure\n    .input(z.string())\n    .query(({ input }) => db.users.find(input)),\n  userCreate: t.procedure\n    .input(z.object({ name: z.string() }))\n    .mutation(({ input }) => db.users.create(input)),\n});\n\nexport type AppRouter = typeof appRouter;" },
          b: { label: "client: types, no codegen", lang: "ts", src: "import { createTRPCClient, httpBatchLink } from '@trpc/client';\nimport type { AppRouter } from '../server/router';\n\nconst trpc = createTRPCClient<AppRouter>({\n  links: [httpBatchLink({ url: '/api/trpc' })],\n});\n\nconst user = await trpc.userById.query('1');\n// user's type comes from db.users.find\nawait trpc.userCreate.mutate({ name: 42 });\n// compile error: number is not string" },
          x: "tRPC v11. `import type` is erased at build time, so no server code ships to the client. Rename a procedure and every caller turns red in the editor. The price: both ends in TypeScript, sharing one type graph.",
        },
        {
          t: "pitfall",
          h: "Types can't reach clients that already shipped",
          x: "tRPC checks callers built from the same commit. During a deploy, open tabs run yesterday's bundle against today's server, and a mobile app runs last month's. A renamed procedure or a tightened input breaks them at runtime, with no compiler in sight. Evolve procedures additively, like a public API.",
        },
      ],
    },
    {
      title: "Events and real-time transports",
      beats: [
        { t: "say", x: "Request/response couples availability: if the email service is down, signup fails. With events, the producer records a fact (`user.signed_up`) and moves on; consumers react when they can. You trade waiting for duplicates, ordering and debugging across time." },
        {
          t: "table",
          head: ["Mechanism", "Delivery and retention", "Ordering and replay"],
          rows: [
            ["Webhook (see *Designing APIs*)", "HTTP POST to a URL you registered, retried on failure", "No order guarantee; replay only if the sender offers it"],
            ["Queue (RabbitMQ)", "Exchanges route to queues; a message is gone once acked", "Per queue, until redeliveries; no replay after ack"],
            ["Log (Kafka)", "Topics split into partitions, kept for a retention period", "Ordered per partition; consumers rewind their offset to replay"],
            ["Pub/sub (Redis PUBLISH)", "Fan-out to whoever is subscribed right now", "Nothing kept: offline subscribers miss it"],
          ],
        },
        {
          t: "predict",
          lang: "js",
          src: "app.post('/orders', async (req, res) => {\n  const order = await db.orders.insert(req.body);\n  await broker.publish('order.created', order);  // the process dies right before this line\n  res.status(201).json(order);\n});",
          q: "The process crashes between the insert and the publish. What state is the system in?",
          options: ["Both rolled back", "The order exists, and no event will ever be published for it", "The broker retries the publish", "The event is published twice"],
          answer: 1,
          why: "The **dual write** problem: the database and the broker don't share a transaction. Billing and shipping never hear of this order. Swap the two lines and you get events for orders that don't exist.",
        },
        {
          t: "code",
          lang: "js",
          src: "// Transactional outbox: the event is a row, written in the same transaction.\nawait tx(async (db) => {\n  const order = await db.query('INSERT INTO orders ... RETURNING *');\n  await db.query(\n    'INSERT INTO outbox (id, topic, payload) VALUES ($1, $2, $3)',\n    [crypto.randomUUID(), 'order.created', order.rows[0]]);\n});\n\n// A relay publishes outbox rows, then marks them sent.\nsetInterval(async () => {\n  const { rows } = await pool.query(\n    'SELECT * FROM outbox WHERE sent_at IS NULL ORDER BY created_at LIMIT 100');\n  for (const e of rows) {\n    await broker.publish(e.topic, e.payload, { messageId: e.id });\n    await pool.query('UPDATE outbox SET sent_at = now() WHERE id = $1', [e.id]);\n  }\n}, 500);",
          mark: [4, 14],
          note: "A crash between publish and update publishes the row again on restart. The outbox makes delivery at-least-once, never exactly-once, so the event id goes along for consumers to dedupe.",
        },
        {
          t: "pitfall",
          h: "Kafka orders a partition, not a topic",
          x: "Events with different keys land on different partitions and are consumed in parallel, so `order.paid` can be processed before `order.created`. Key by the entity whose order matters (the order id), and know that adding partitions later remaps keys.",
        },
        {
          t: "quiz",
          q: "A new analytics service must process the last 7 days of order events, then keep up. Which fits?",
          options: ["A RabbitMQ queue", "A Kafka topic with 7+ days of retention", "Redis pub/sub", "Webhooks"],
          answer: 1,
          why: "A log keeps events after they're read, so a new consumer group starts from an old offset and catches up. A queue deletes on ack, and pub/sub keeps nothing. A queue is still the simpler pick for plain work distribution.",
        },
        {
          t: "code",
          lang: "yaml",
          file: "asyncapi.yaml",
          src: "asyncapi: 3.0.0\ninfo: { title: Orders events, version: 1.2.0 }\nservers:\n  prod: { host: kafka.internal:9092, protocol: kafka }\nchannels:\n  orderCreated:\n    address: orders.created\n    messages:\n      orderCreated: { $ref: '#/components/messages/OrderCreated' }\noperations:\n  publishOrderCreated:\n    action: send\n    channel: { $ref: '#/channels/orderCreated' }\ncomponents:\n  messages:\n    OrderCreated:\n      payload:\n        type: object\n        required: [id, orderId, total_cents]\n        properties:\n          id: { type: string }\n          orderId: { type: string }\n          total_cents: { type: integer }",
          note: "AsyncAPI is OpenAPI for events: channels, messages and who sends or receives them, with bindings for Kafka, AMQP, MQTT and WebSockets. Your event payloads are an API too.",
        },
        {
          t: "table",
          head: ["Transport", "Direction", "Reach for it when"],
          rows: [
            ["SSE", "Server to client, over plain HTTP", "Feeds, notifications, LLM token streams; resume built in"],
            ["WebSocket", "Both ways, one TCP connection", "Chat, collaboration, games; anything chatty"],
            ["WebRTC", "Peer to peer, over UDP", "Calls, screen share, browser-to-browser data"],
            ["WebTransport", "Both ways over HTTP/3, streams and datagrams", "Lossy, latency-critical data without head-of-line blocking"],
          ],
          caption: "*Real-time: SSE and WebSockets* goes through each one: framing, auth, reconnects, backpressure.",
        },
        {
          t: "quiz",
          q: "A dashboard shows live order totals, server to browser only, behind a corporate proxy. Simplest fit?",
          options: ["WebRTC data channel", "SSE", "gRPC bidirectional stream", "WebTransport"],
          answer: 1,
          why: "One direction, ordinary HTTP, automatic reconnect with `Last-Event-ID`, and nothing for proxies to object to. Raw gRPC can't run in a browser at all, and WebRTC and WebTransport need UDP that corporate networks often block.",
        },
      ],
    },
    {
      title: "Contracts, evolution, and the choice",
      beats: [
        {
          t: "table",
          head: ["Contract", "Style", "Breaking-change check in CI"],
          rows: [
            ["OpenAPI", "REST, HTTP + JSON", "`oasdiff breaking base.yaml head.yaml`"],
            ["GraphQL SDL", "GraphQL", "`graphql-inspector diff old.graphql new.graphql`"],
            [".proto", "gRPC, Connect", "`buf breaking --against '.git#branch=main'`"],
            ["WSDL + XSD", "SOAP", "Diff the WSDL; regenerate clients and see what fails"],
            ["AsyncAPI", "Events", "Diff the message schemas; consumers are clients too"],
            ["TypeScript types", "tRPC", "`tsc` for code built together; nothing for deployed clients"],
          ],
        },
        {
          t: "predict",
          lang: "protobuf",
          src: "// before                     // after\nmessage User {                message User {\n  int64 id = 1;                 int64 id = 1;\n  string name = 2;              string full_name = 2;\n}                             }",
          q: "Old clients still run the old code. Which of them break?",
          options: ["All of them", "None of them", "Clients using binary protobuf are fine; clients using protobuf's JSON mapping break", "Only clients in other languages"],
          answer: 2,
          why: "Binary protobuf carries field 2, never the name, so a rename is invisible on the wire. The JSON mapping writes the field name (`fullName`), so JSON clients, Connect JSON calls and logs that parse it all break. Reserve the old name if you rename.",
        },
        {
          t: "predict",
          lang: "protobuf",
          src: "// v1:  bool active = 3;\n// v2:  field 3 deleted, not reserved.\n// v3:  int32 age = 3;     // someone reused the free number",
          q: "A v1 client reads a v3 message with `age: 34`. What does it see?",
          options: ["A parse error", "`active: true`", "`active` missing", "`age: 34` as an unknown field, nothing else"],
          answer: 1,
          why: "`bool` and `int32` are both varints and protobuf calls them compatible, so 34 decodes as `true`. No error, just wrong data. That's why deleted fields go into `reserved`: the compiler then refuses to reuse the number.",
        },
        {
          t: "quiz",
          q: "Which GraphQL schema change breaks existing clients?",
          options: ["Adding a nullable field to `User`", "Adding a required argument with no default to `posts`", "Marking `avatarUrl` `@deprecated`", "Changing an output field from `String` to `String!`"],
          answer: 1,
          why: "Every saved query that calls `posts` without the new argument now fails validation. Adding fields is safe, deprecation is a warning, and tightening an output to non-null only strengthens the promise. Loosening one, or tightening an input, breaks.",
        },
        {
          t: "table",
          head: ["Format", "Safe", "Breaking"],
          rows: [
            ["REST + JSON", "Add optional fields and params, add endpoints", "Rename, remove, retype, make required, change defaults"],
            ["GraphQL", "Add types, fields, optional args; deprecate first", "Remove a field still in use, add required args, make outputs nullable"],
            ["Protobuf", "Add fields with new numbers, rename (binary only)", "Change or reuse numbers, change wire-incompatible types"],
          ],
          caption: "GraphQL's habit is to never version: deprecate, watch per-field usage in a schema registry, remove when traffic hits zero.",
        },
        {
          t: "table",
          head: ["Situation", "Reach for"],
          rows: [
            ["Public API, many unknown clients, caching matters", "REST + OpenAPI"],
            ["Many screens and teams composing one domain graph", "GraphQL, with trusted documents and cost limits"],
            ["Service-to-service, polyglot, low latency, streams", "gRPC; Connect where browsers join"],
            ["A bank, insurer or government system that only offers WSDL", "SOAP, through a generated client and an adapter"],
            ["One TypeScript team owning client and server", "tRPC"],
            ["Bidirectional calls over one pipe: editors, agents, nodes", "JSON-RPC"],
            ["Work that shouldn't block the caller, or many reactors", "Events: a queue or a log, described with AsyncAPI"],
          ],
        },
        {
          t: "mission",
          h: "One service, three faces",
          x: "Write one `orders` module, then expose it as REST, GraphQL and Connect. Load 50 orders with customers through each: count database queries, response bytes raw and gzipped, and round trips. Then rename a field in each contract and see what CI catches.",
          hint: "Keep the domain layer shared, give GraphQL a DataLoader per request, and run `oasdiff`, `graphql-inspector diff` and `buf breaking` against the previous commit.",
        },
      ],
    },
  ],
  nobodyTells: [
    "GraphQL doesn't remove the cost of joins. It moves it from the client's round trips to your resolvers, and you pay it per field.",
    "Most GraphQL N+1s ship to production because nobody counts queries per operation. Log the count with the operation name.",
    "gzip removes most of JSON's size penalty. Pick protobuf for typed contracts and CPU, not for bytes on a compressed link.",
    "A WSDL's endpoint address is often an internal hostname or plain http. Keep a local copy and set the endpoint yourself.",
    "Never reuse a protobuf field number. `reserved` costs one line; reuse costs a silent data corruption.",
    "Every event is at-least-once somewhere. Give each one an id and make every consumer idempotent from day one.",
    "Turn off GraphQL introspection on public production endpoints, but don't call it security: field errors still leak the schema.",
    "An API style is easier to add than to remove. A second style at the edge beats a rewrite of the core.",
  ],
  glossary: [
    ["resolver", "A function that computes one GraphQL field from its parent, arguments and per-request context."],
    ["DataLoader", "Per-request batching and caching: collects keys asked for in one tick, fetches them in one call."],
    ["trusted documents", "An allowlist of GraphQL operations registered at build time; clients send an id, not query text."],
    ["query cost analysis", "Estimating a GraphQL operation's work from field weights and list sizes, before running it."],
    ["protobuf", "Protocol Buffers: a schema language and compact binary format where fields are identified by number."],
    ["varint", "Variable-length integer: 7 bits per byte, the high bit says another byte follows. 150 is `96 01`."],
    ["deadline", "The time by which a gRPC call must finish; sent as `grpc-timeout`, failing with DEADLINE_EXCEEDED."],
    ["gRPC-Web", "A browser-compatible variant of gRPC that puts trailers in the body; needs a translating proxy."],
    ["Connect", "An RPC protocol from the same .proto files over plain HTTP, with JSON or binary bodies."],
    ["WSDL", "XML document describing a SOAP service: schema types, operations, binding and endpoint."],
    ["WS-Security", "OASIS standard for signing, encrypting and attaching tokens to SOAP messages themselves."],
    ["JSON-RPC 2.0", "A transport-neutral RPC format: method, params, id; a request without an id is a notification."],
    ["transactional outbox", "Writing an event as a row in the same DB transaction, then relaying it to the broker."],
    ["AsyncAPI", "A machine-readable description of event-driven APIs: channels, messages, operations, protocol bindings."],
  ],
  explain: "Explain to a friend why a GraphQL server can make 51 database queries for one request, and how DataLoader brings it down to 2.",
};
