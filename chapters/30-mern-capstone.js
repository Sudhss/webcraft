export default {
  id: "mern-capstone",
  n: 30,
  part: "E",
  title: "The MERN capstone",
  hook: "One collaborative kanban board, end to end: the data model, the API, sessions, live updates, uploads, tests, deploy.",
  minutes: 150,
  levels: ["use", "understand", "rebuild"],
  sections: [
    {
      title: "The app and its hard parts",
      beats: [
        { t: "say", x: "We build a collaborative kanban board: boards, lists, cards, members, comments, attachments. The bar: two people drag cards on the same board, and both screens agree within a second, even when a request fails." },
        {
          t: "table",
          head: ["Requirement", "The full-stack problem it creates"],
          rows: [
            ["Drag a card anywhere", "Ordering without renumbering every card below it"],
            ["The drag feels instant", "Optimistic updates, and rollback when the server says no"],
            ["Teammates see moves live", "Fan-out across several server instances"],
            ["Only members see a board", "An authorization check inside every query"],
            ["Comments and activity", "Unbounded data: separate collections, cursor pagination"],
            ["Attach screenshots", "Uploads that never pass through your server"],
          ],
        },
        {
          t: "steps",
          h: "The architecture",
          items: [
            "React client built by Vite, served by the same Express app: one origin, so no CORS and no third-party cookies.",
            "Express 5 API under `/api`, session cookie auth, Mongoose models.",
            "MongoDB as a replica set (Atlas in production, a one-node set locally): change streams and transactions need one.",
            "One change stream per server process, fanned out to browsers over Server-Sent Events.",
            "An S3 bucket for attachments; the browser uploads straight to it with a presigned POST.",
          ],
        },
        {
          t: "table",
          head: ["Query", "How often", "Shape"],
          rows: [
            ["Open a board", "Every page load", "Board doc + all its cards, sorted by list then position"],
            ["Move a card", "The hottest write by far", "Change `listId` and `pos` of one card"],
            ["My boards", "Every login", "Boards where I'm a member, newest first"],
            ["A card's comments", "On open", "Newest 20, then older pages"],
            ["Edit a card's text", "Often", "Must not silently overwrite a teammate's edit"],
          ],
          caption: "Write this list before any schema. Every index and every embed decision below is justified by a row here.",
        },
        {
          t: "mission",
          h: "Milestone 1: the query list and a replica set",
          x: "Write your own version of the table above for every screen, and mark the hottest write. Then set up `server/` (Express) and `client/` (Vite + React) and a local one-node replica set you can connect to.",
          hint: "`docker run -d -p 27017:27017 mongo:8 --replSet rs0`, then `mongosh --eval 'rs.initiate()'` inside it. Connect with `mongodb://localhost:27017/kanban?directConnection=true`.",
        },
      ],
    },
    {
      title: "The data model",
      beats: [
        {
          t: "quiz",
          q: "Cards: embed them in the board document, or give them their own collection?",
          options: ["Embed: they're always read with the board", "Own collection: many people write cards at once, and every card write would rewrite and contend on one board document", "Embed, but cap at 1000", "Own collection, because embedding is slower to read"],
          answer: 1,
          why: "Read-together says embed, but the hottest write decides. Embedded cards make the board a hot document: every drag rewrites it, concurrent drags conflict on it, and a change stream ships the whole board per move.",
        },
        {
          t: "code",
          lang: "js",
          file: "server/models.js",
          src: `import mongoose from "mongoose";
const { Schema, model, Types } = mongoose;

const member = new Schema({
  userId: { type: Types.ObjectId, ref: "User", required: true },
  role: { type: String, enum: ["owner", "editor", "viewer"], default: "editor" },
}, { _id: false });
const list = new Schema({ title: { type: String, required: true, maxlength: 80 }, pos: String });

const boardSchema = new Schema({
  title: { type: String, required: true, trim: true, maxlength: 120 },
  members: [member],     // embedded: bounded, read with the board
  lists: [list],         // embedded: a dozen at most, always read with the board
}, { timestamps: true });
boardSchema.index({ "members.userId": 1, updatedAt: -1 });   // "my boards"

const attachment = new Schema({ key: String, name: String, size: Number, mime: String }, { _id: false });
const cardSchema = new Schema({
  boardId: { type: Types.ObjectId, required: true },
  listId: { type: Types.ObjectId, required: true },
  pos: { type: String, required: true },     // fractional index, sorts as a string
  title: { type: String, required: true, trim: true, maxlength: 200 },
  body: { type: String, default: "", maxlength: 20000 },
  attachments: [attachment],                 // embedded, capped at 20 by the API
  version: { type: Number, default: 1 },
}, { timestamps: true });
cardSchema.index({ boardId: 1, listId: 1, pos: 1 });   // open a board: one IXSCAN, no SORT

export const Board = model("Board", boardSchema);
export const Card = model("Card", cardSchema);`,
          mark: [16, 21, 29],
          note: "`mime`, not `type`: a nested field literally named `type` must be written `type: { type: String }`, or Mongoose reads the whole object as one String path.",
        },
{
          t: "predict",
          lang: "js",
          src: `// Card order as a float. Always drop a new card right after the first one.
let lo = 1, hi = 2, n = 0;
while ((lo + hi) / 2 !== lo && (lo + hi) / 2 !== hi) {
  hi = (lo + hi) / 2;
  n++;
}
console.log(n);`,
          q: "How many inserts into the same gap before the midpoint collides with a neighbour?",
          options: ["About 52", "About 1,000", "About 2 billion", "It never collides"],
          answer: 0,
          why: "Each insert halves the gap, and a double has 52 mantissa bits. Users who keep dropping cards at the top of a list hit it in weeks, then two cards share a position and the order flips on reload.",
        },
        {
          t: "rebuild",
          h: "Fractional indexing with strings",
          x: "Positions as base-36 strings that compare like decimals: `\"a\" < \"an\" < \"b\"`. There is always a key between two keys, so a move writes one card and never renumbers its neighbours. MongoDB sorts strings by bytes, the same order `<` uses here.",
          mode: "js",
          js: `const D = "0123456789abcdefghijklmnopqrstuvwxyz";

// A key k with a < k < b. a = "" means the start, b = null means the end.
function between(a = "", b = null) {
  if (b !== null && a >= b) throw new Error(\`need a < b, got "\${a}" and "\${b}"\`);
  let out = "";
  for (let i = 0; ; i++) {
    const lo = i < a.length ? D.indexOf(a[i]) : 0;
    const hi = b === null ? D.length : D.indexOf(b[i]);
    if (hi - lo > 1) return out + D[(lo + hi) >> 1]; // room at this digit
    out += D[lo];
    if (hi - lo === 1) b = null; // anything after out is now below b
  }
}

function check(keys) {
  for (let i = 1; i < keys.length; i++) if (!(keys[i - 1] < keys[i])) throw new Error("order broken at " + i);
  return Math.max(...keys.map((k) => k.length));
}

let list = [];
for (let i = 0; i < 1000; i++) list.push(between(list.at(-1) ?? "", null));
console.log("append x1000, longest key:", check(list));

list = ["a", "b"];
for (let i = 0; i < 1000; i++) list.splice(1, 0, between(list[0], list[1]));
console.log("same gap x1000, longest key:", check(list));

list = ["a", "b"];
for (let i = 0; i < 1000; i++) {
  const j = 1 + Math.floor(Math.random() * (list.length - 1));
  list.splice(j, 0, between(list[j - 1], list[j]));
}
console.log("random gaps x1000, longest key:", check(list));

const k1 = between("a", "b"), k2 = between("a", "b"); // two users, same gap, same moment
console.log("concurrent:", k1, k2, k1 === k2 ? "COLLISION" : "distinct");`,
          task: "Two users in the same gap get the same key. Pick a random digit inside the gap instead of the middle. Then make appends grow slower than one character per six cards.",
        },
{
          t: "code",
          lang: "js",
          src: `// A second line of defence for writes that skip Mongoose (scripts, other services).
await db.command({
  collMod: "cards",
  validator: { $jsonSchema: {
    bsonType: "object",
    required: ["boardId", "listId", "pos", "title"],
    properties: {
      pos: { bsonType: "string", pattern: "^[0-9a-z]*[1-9a-z]$" },
      title: { bsonType: "string", maxLength: 200 },
      attachments: { bsonType: "array", maxItems: 20 },
    },
  } },
  validationLevel: "moderate",   // existing invalid docs can still be updated
});`,
          note: "Mongoose validates in your process; `$jsonSchema` validates in the database. Keep the database rules few and structural, and let Mongoose and the API carry the rest.",
        },
        {
          t: "mission",
          h: "Milestone 2: schemas that match the queries",
          x: "Write the models, seed one board with 5 lists of 200 cards, and run the open-board query with `explain(\"executionStats\")`. The winning plan should be an IXSCAN with no SORT stage, and `totalDocsExamined` should equal `nReturned`.",
          hint: "`Card.find({ boardId }).sort({ listId: 1, pos: 1 }).explain(\"executionStats\")`. Drop the index and run it again to see the COLLSCAN and the in-memory SORT.",
        },
      ],
    },
    {
      title: "The API",
      beats: [
        {
          t: "table",
          head: ["Route", "Does"],
          rows: [
            ["`GET /api/boards`", "My boards, newest first"],
            ["`GET /api/boards/:boardId`", "The board and all its cards, one round trip each"],
            ["`POST /api/boards/:boardId/cards`", "Create a card at a position"],
            ["`POST /api/cards/:cardId/move`", "Set `listId` and `pos`: last writer wins"],
            ["`PATCH /api/cards/:cardId`", "Edit text, only if `version` still matches"],
            ["`GET /api/cards/:cardId/comments?before=`", "Cursor-paginated comments"],
            ["`GET /api/boards/:boardId/events`", "The SSE stream of live changes"],
          ],
          caption: "A move and an edit are different routes on purpose: concurrent moves should just land, concurrent text edits should conflict.",
        },
        {
          t: "code",
          lang: "js",
          file: "server/routes/cards.js",
          src: `import { z } from "zod";
import { Board, Card } from "../models.js";
import { NotFound, Conflict } from "../errors.js";

const id = z.string().regex(/^[a-f\\d]{24}$/i, "bad id");
const Params = z.object({ cardId: id });

async function cardForEditor(cardId, userId) {
  const card = await Card.findById(cardId, { boardId: 1 }).lean();
  const ok = card && await Board.exists({
    _id: card.boardId,
    members: { $elemMatch: { userId, role: { $in: ["owner", "editor"] } } },
  });
  if (!ok) throw new NotFound("card");   // same answer for "missing" and "not yours"
  return card;
}

router.patch("/cards/:cardId", async (req, res) => {
  const { cardId } = Params.parse(req.params);
  const { version, ...patch } = z.object({
    version: z.number().int(),
    title: z.string().min(1).max(200).optional(),
    body: z.string().max(20000).optional(),
  }).strict().parse(req.body);
  await cardForEditor(cardId, req.userId);
  const saved = await Card.findOneAndUpdate(
    { _id: cardId, version },                       // only if nobody saved in between
    { $set: patch, $inc: { version: 1 } },
    { returnDocument: "after", runValidators: true, lean: true },
  );
  if (!saved) throw new Conflict("card changed, reload it");
  res.json(saved);
});`,
          mark: [11, 27, 28],
          note: "No try/catch: in Express 5 a rejected promise from a handler goes to the error middleware. `returnDocument: \"after\"` replaces `new: true`, which Mongoose 9 deprecates.",
        },
        {
          t: "predict",
          lang: "js",
          src: `// members: [{ userId: ada, role: "viewer" }, { userId: bo, role: "editor" }]
await Board.exists({
  _id: boardId,
  "members.userId": ada,
  "members.role": "editor",
});`,
          q: "Ada is only a viewer. Does this check let her edit?",
          options: ["No: her element has role viewer", "Yes: each condition can match a different array element", "It throws: ambiguous array query", "Only if the array has one element"],
          answer: 1,
          why: "Dotted conditions on an array are checked independently: some element has her `userId`, some element has role editor. Bo's role grants Ada edit rights. `$elemMatch` forces both conditions onto one element.",
        },
        {
          t: "code",
          lang: "js",
          file: "server/errors.js",
          src: `import mongoose from "mongoose";
import { z } from "zod";

export class NotFound extends Error { status = 404; }
export class Conflict extends Error { status = 409; }

export function errors(err, req, res, next) {
  if (res.headersSent) return next(err);   // mid-stream: let Express close the socket
  if (err instanceof z.ZodError)
    return res.status(400).json({ error: "invalid", issues: err.issues });
  if (err instanceof mongoose.Error.CastError)
    return res.status(400).json({ error: \`bad \${err.path}\` });
  if (err instanceof mongoose.Error.ValidationError)
    return res.status(400).json({ error: "invalid", fields: Object.keys(err.errors) });
  if (err.code === 11000)
    return res.status(409).json({ error: "duplicate", fields: Object.keys(err.keyValue ?? {}) });
  if (err.status && err.status < 500)      // ours, and body-parser's 400 and 413
    return res.status(err.status).json({ error: err.message });
  console.error(req.id, err);
  res.status(500).json({ error: "internal", requestId: req.id });
}`,
          note: "Every expected failure gets a 4xx with a shape the client can show. A 500 means a bug, carries a request id, and never a stack trace.",
        },
        {
          t: "pitfall",
          h: "`isValidObjectId` says yes to any 12 characters",
          x: "`mongoose.isValidObjectId(\"0123456789ab\")` is `true`: any 12-byte string can be cast. Validate with a 24-hex regex or `isObjectIdOrHexString`, or a typo in a URL becomes a query for a garbage id instead of a 400.",
        },
        {
          t: "pitfall",
          h: "Update validators are off by default",
          x: "Schema `maxlength`, `enum` and `min` run on `save()`, not on `updateOne` or `findOneAndUpdate`. Without `runValidators: true` a 5 MB title sails through the update path. Validate the body with zod too; the schema is the last line, not the first.",
        },
        {
          t: "code",
          lang: "js",
          src: `router.get("/cards/:cardId/comments", async (req, res) => {
  const { cardId } = Params.parse(req.params);
  const { before, limit } = z.object({
    before: id.optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  }).parse(req.query);
  await cardForMember(cardId, req.userId);
  const rows = await Comment.find({ cardId, ...(before && { _id: { $lt: before } }) })
    .sort({ _id: -1 })
    .limit(limit + 1)                  // one extra row answers "is there more?"
    .lean();
  const items = rows.slice(0, limit);
  res.json({ items, next: rows.length > limit ? items.at(-1)._id : null });
});
// index: { cardId: 1, _id: -1 }. Every page is a seek, page 1 or page 500.`,
          mark: [8, 10],
          note: "`_id` is unique and roughly time-ordered, so it's a stable cursor on its own. A new comment arriving between pages can't shift or duplicate rows, which it does with `skip`.",
        },
        {
          t: "pitfall",
          h: "Operator injection rides in on JSON",
          x: "`User.findOne({ email: req.body.email })` with a body of `{ \"email\": { \"$ne\": null } }` matches the first user. Express 5's simple query parser no longer builds objects from `?a[b]=c`, but JSON bodies still can. `z.string()` on every field stops it; `sanitizeFilter` is a backstop.",
        },
        {
          t: "mission",
          h: "Milestone 3: the API, with honest status codes",
          x: "Build the routes in the table. Then check from a `.http` file or curl: a malformed id gives 400, another user's card gives 404, a stale `version` gives 409, and 45 comments come back in pages of 20, 20 and 5 with no repeats.",
          hint: "Write `cardForMember` next to `cardForEditor` and call one of them first in every card route. Grep for `findById(` without one and you've found your IDOR bugs.",
        },
      ],
    },
    {
      title: "Auth: sessions in httpOnly cookies",
      beats: [
        { t: "say", x: "The theory is in Auth and security. The choice here: a random token in an `httpOnly` cookie, and the session in MongoDB. Script can't read the cookie, and deleting a row signs someone out everywhere, which a JWT can't do." },
        {
          t: "code",
          lang: "js",
          file: "server/sessions.js",
          src: `import crypto from "node:crypto";
import mongoose from "mongoose";

const sessionSchema = new mongoose.Schema({
  _id: String,                                     // sha256 of the cookie token
  userId: { type: mongoose.Types.ObjectId, required: true, index: true },
  expiresAt: { type: Date, required: true },
});
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });   // TTL: delete at expiresAt
const Session = mongoose.model("Session", sessionSchema);

const hash = (t) => crypto.createHash("sha256").update(t).digest("base64url");
const WEEK = 7 * 24 * 3600 * 1000;

export async function startSession(res, userId) {
  const token = crypto.randomBytes(32).toString("base64url");
  await Session.create({ _id: hash(token), userId, expiresAt: new Date(Date.now() + WEEK) });
  res.cookie("sid", token, { httpOnly: true, secure: config.prod, sameSite: "lax", maxAge: WEEK, path: "/" });
}

export async function requireUser(req, res, next) {
  const token = req.cookies?.sid;                   // cookie-parser
  const s = token && await Session.findOne({ _id: hash(token), expiresAt: { $gt: new Date() } }).lean();
  if (!s) return res.status(401).json({ error: "signed out" });
  req.userId = s.userId;
  req.sessionId = s._id;
  next();
}

export const signOutEverywhere = (userId) => Session.deleteMany({ userId });`,
          mark: [5, 9, 18, 22],
          note: "Storing the hash means a leaked database backup holds no usable cookies. A new token on every login also rules out session fixation.",
        },
        {
          t: "pitfall",
          h: "TTL indexes delete late",
          x: "The TTL monitor runs about once a minute and falls behind under load, so an expired session can sit in the collection for a while. That's why the lookup also checks `expiresAt: { $gt: new Date() }`. TTL is garbage collection, not access control.",
        },
        {
          t: "quiz",
          q: "Bo requests a board he isn't a member of. 403 or 404?",
          options: ["403: he's authenticated but not allowed", "404: from his side the board doesn't exist, and a 403 would confirm the id is real", "401", "200 with an empty board"],
          answer: 1,
          why: "Answer \"not found\" for both missing and forbidden, and build it into the query (`_id` plus membership) so the two cases can't diverge. A distinct 403 lets anyone probe which ids exist.",
        },
        {
          t: "pitfall",
          h: "Without `trust proxy`, every user is the load balancer",
          x: "Behind a host's proxy, `req.ip` is the proxy's address and `req.secure` is false. Your login rate limiter then locks out everyone at once, and express-session silently refuses to set a Secure cookie. Set `app.set(\"trust proxy\", 1)` for one hop.",
        },
        {
          t: "pitfall",
          h: "SameSite=Lax is not the whole CSRF story",
          x: "Lax stops other sites' cross-site POSTs, but a sibling subdomain is same-site, and any GET that mutates is fair game. Never change state on GET, and reject unsafe methods whose `Origin` header isn't your app's origin.",
        },
        {
          t: "mission",
          h: "Milestone 4: sign up, sign in, sign out everywhere",
          x: "Add `POST /api/signup`, `/login`, `/logout`, `/logout-all` and `GET /api/me`. Hash passwords with argon2. Logout deletes the session row and clears the cookie. Prove a second user gets 404 on the first user's board.",
          hint: "`argon2.hash(pw)` and `argon2.verify(hash, pw)`. `res.clearCookie(\"sid\", { path: \"/\" })` must match the options the cookie was set with. Same error message for unknown email and wrong password.",
        },
      ],
    },
    {
      title: "The client: optimistic moves",
      beats: [
        { t: "say", x: "The board is server state: the server owns the truth and the client holds a cache of it (React for real has the tools). The hard part is a drag that shows instantly, then survives the server saying no." },
        {
          t: "play",
          mode: "react",
          title: "optimistic move, snapshot rollback",
          js: `const { useState } = React;

// A fake server. Moves take 300 ms; "Locked card" is rejected after 1.5 s.
const server = { c1: "todo", c2: "todo", c3: "doing" };
const titles = { c1: "Write the schema", c2: "Index the queries", c3: "Locked card" };
function fakeFetch(url, { body }) {
  const id = url.split("/")[3];
  const { listId } = JSON.parse(body);
  return new Promise((resolve) => setTimeout(() => {
    if (id === "c3") return resolve({ ok: false, status: 409 });
    server[id] = listId;
    resolve({ ok: true, status: 200, json: async () => ({ id, listId }) });
  }, id === "c3" ? 1500 : 300));
}

const LISTS = ["todo", "doing", "done"];

function App() {
  const [cards, setCards] = useState(() =>
    Object.keys(server).map((id) => ({ id, title: titles[id], listId: server[id] })));
  const [log, setLog] = useState([]);
  const note = (m) => setLog((l) => [m, ...l].slice(0, 4));

  async function move(card, dir) {
    const listId = LISTS[LISTS.indexOf(card.listId) + dir];
    if (!listId) return;
    const snapshot = cards; // the whole board, as of this render
    setCards((cs) => cs.map((c) => (c.id === card.id ? { ...c, listId, saving: true } : c)));
    const res = await fakeFetch("/api/cards/" + card.id + "/move", { method: "POST", body: JSON.stringify({ listId }) });
    if (!res.ok) {
      setCards(snapshot); // rollback
      note(card.title + ": " + res.status + ", rolled back");
      return;
    }
    const saved = await res.json();
    setCards((cs) => cs.map((c) => (c.id === saved.id ? { ...c, listId: saved.listId, saving: false } : c)));
    note(card.title + ": saved in " + saved.listId);
  }

  const drift = cards.filter((c) => !c.saving && server[c.id] !== c.listId);
  return (
    <div>
      <div className="board">
        {LISTS.map((l) => (
          <section key={l}>
            <h3>{l}</h3>
            {cards.filter((c) => c.listId === l).map((c) => (
              <div key={c.id} className={"card" + (c.saving ? " saving" : "")}>
                <button onClick={() => move(c, -1)} aria-label="move left">&lt;</button>
                <span>{c.title}</span>
                <button onClick={() => move(c, 1)} aria-label="move right">&gt;</button>
              </div>
            ))}
          </section>
        ))}
      </div>
      <p className={drift.length ? "bad" : ""}>
        {drift.length ? "Out of sync with the server: " + drift.map((c) => c.title).join(", ") : "In sync with the server."}
      </p>
      <ul>{log.map((m, i) => <li key={i}>{m}</li>)}</ul>
    </div>
  );
}`,
          css: `body { font-family: system-ui; padding: 12px; }
.board { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
section { background: #f1efe9; border-radius: 8px; padding: 8px; min-height: 130px; }
h3 { margin: 0 0 8px; font-size: 13px; text-transform: uppercase; color: #6b665c; }
.card { display: flex; align-items: center; gap: 4px; background: #fff; border: 1px solid #ddd8cc;
  border-radius: 6px; padding: 6px; margin-bottom: 6px; font-size: 13px; }
.card span { flex: 1; }
.card.saving { opacity: .5; }
button { font: inherit; padding: 0 6px; cursor: pointer; }
.bad { color: #b3261e; font-weight: 600; }
ul { padding-left: 18px; color: #6b665c; font-size: 13px; }`,
          task: "Move \"Locked card\" right, then quickly move \"Write the schema\". The rollback undoes a move the server kept. Fix it: on failure, restore only this card from `card`.",
        },
        {
          t: "predict",
          lang: "text",
          src: `t=0     move card A (request 1, slow, will fail)   snapshot = board at t=0
t=200   move card B (request 2, fast)
t=500   request 2 succeeds: B is saved in "done"
t=1500  request 1 fails: setCards(snapshot)`,
          q: "Where does B end up on screen?",
          options: ["In \"done\", where the server has it", "Back in its old list, while the server says \"done\"", "Duplicated in both lists", "Stuck showing \"saving\""],
          answer: 1,
          why: "The snapshot predates B's move, so restoring it erases a write that succeeded. Roll back per entity, or follow every rollback with a refetch so the server's truth wins in the end.",
        },
        {
          t: "code",
          lang: "jsx",
          src: `const qc = useQueryClient();
const key = ["board", boardId];
const move = useMutation({
  mutationFn: ({ cardId, listId, pos }) => api.post(\`/cards/\${cardId}/move\`, { listId, pos }),
  onMutate: async ({ cardId, listId, pos }) => {
    await qc.cancelQueries({ queryKey: key });          // a stale refetch must not land on top
    const before = qc.getQueryData(key).cards.find((c) => c.id === cardId);
    qc.setQueryData(key, (b) => ({ ...b, cards: b.cards.map((c) =>
      c.id === cardId ? { ...c, listId, pos } : c) }));
    return { before };
  },
  onError: (err, vars, ctx) => qc.setQueryData(key, (b) => ({ ...b, cards: b.cards.map((c) =>
    c.id === vars.cardId ? ctx.before : c) })),           // this card only
  onSettled: () => qc.invalidateQueries({ queryKey: key }),
});`,
          mark: [6, 13, 14],
          note: "TanStack Query v5. `cancelQueries` matters: a board refetch already in flight would otherwise resolve after the optimistic write and flick the card back.",
        },
        {
          t: "say",
          x: "React 19's `useOptimistic(value)` gives the same effect for one component: inside an Action, the optimistic value shows until the Action ends, then `value` takes over. Failure needs no rollback code; the optimistic state just stops existing.",
        },
        {
          t: "mission",
          h: "Milestone 5: the board client",
          x: "Build the board page: one query for board and cards, cards grouped by `listId` and sorted by `pos`, drag and drop between lists. On drop, compute `pos` with `between()` from the neighbours at the drop point and run the optimistic move.",
          hint: "Neighbours come from the target list after removing the dragged card. Dropping at the top is `between(\"\", first.pos)`; at the bottom `between(last.pos, null)`.",
        },
      ],
    },
    {
      title: "Real-time: one change stream, many screens",
      beats: [
        { t: "say", x: "Transport is covered in Real-time: SSE and WebSockets. The MERN-specific problem: where does the server learn that a card changed? Broadcasting after your own write works until there's a second instance." },
        {
          t: "viz",
          name: "frames",
          props: {
            cols: ["Ada", "API 1", "MongoDB", "API 2", "Bo"],
            frames: [
              { cells: [["board open"], ["SSE: Ada"], ["c7 in todo, v4"], ["SSE: Bo"], ["board open"]], note: "Two instances behind a load balancer. Ada's event stream landed on API 1, Bo's on API 2." },
              { cells: [["c7 in done (optimistic)"], ["SSE: Ada", "POST /move"], ["c7 in todo, v4"], ["SSE: Bo"], ["c7 in todo"]], note: "Ada drags. Her POST happens to hit API 1." },
              { cells: [["c7 in done (optimistic)"], ["SSE: Ada", "update ok"], ["c7 in done, v5"], ["SSE: Bo"], ["c7 in todo"]], note: "The write commits as version 5." },
              { cells: [["echo v5"], ["broadcast to Ada"], ["c7 in done, v5"], ["SSE: Bo"], ["c7 in todo"]], note: "Broadcast after write: API 1 tells the clients it holds. Bo's stream lives on API 2, which never heard of the write. Bo is now wrong." },
              { cells: [["c7 in done"], ["watch()"], ["c7 in done, v5", "change event"], ["watch()"], ["c7 in todo"]], note: "With a change stream, each instance runs one `watch()`, and MongoDB pushes every committed change to all of them, whoever wrote it." },
              { cells: [["echo v5: no-op"], ["fan out: Ada"], ["c7 in done, v5"], ["fan out: Bo"], ["c7 in done"]], note: "Both fan out locally. Bo's card moves. Ada's echo carries v5, which she already shows, so nothing moves." },
              { cells: [[], ["1 stream"], ["2 streams"], ["1 stream"], []], note: "Cost: one stream per process, not per user. Three instances hold three streams whether 10 or 10,000 tabs are open." },
            ],
          },
        },
        {
          t: "play",
          mode: "node",
          title: "server/realtime.js",
          js: `import { Card } from "./models.js";

const clients = new Map(); // boardId -> Set<res>
let stream;

export function startChangeStream() {
  stream = Card.watch(
    [{ $match: { operationType: { $in: ["insert", "update", "replace"] } } }],
    { fullDocument: "updateLookup" },
  );
  stream.on("change", (ev) => {
    const c = ev.fullDocument;
    if (!c) return; // deleted before the lookup ran
    send(String(c.boardId), "card",
      { id: c._id, listId: c.listId, pos: c.pos, title: c.title, version: c.version });
  });
  stream.on("error", (err) => { // not resumable, e.g. history lost
    console.error("change stream", err);
    for (const boardId of clients.keys()) send(boardId, "resync", {});
    stream.close().catch(() => {});
    setTimeout(startChangeStream, 1000);
  });
}

function send(boardId, event, data) {
  for (const res of clients.get(boardId) ?? []) {
    res.write(\`event: \${event}\\ndata: \${JSON.stringify(data)}\\n\\n\`);
  }
}

// GET /api/boards/:boardId/events
export async function events(req, res) {
  const { boardId } = req.params;
  await boardForMember(boardId, req.userId); // authorized once, at connect
  res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "X-Accel-Buffering": "no" });
  res.flushHeaders();
  res.write("retry: 3000\\n\\n");
  const set = clients.get(boardId) ?? new Set();
  clients.set(boardId, set.add(res));
  const ping = setInterval(() => res.write(": ping\\n\\n"), 25000); // idle proxies kill silent streams
  req.on("close", () => {
    clearInterval(ping);
    set.delete(res);
    if (!set.size) clients.delete(boardId);
  });
}

export async function closeRealtime() {
  await stream?.close();
  for (const set of clients.values()) for (const res of set) res.end();
}`,
        },
        {
          t: "pitfall",
          h: "A change stream per user starves the pool",
          x: "Each open change stream holds a pool connection in a waiting `getMore`. MongoDB's own docs warn of latency once open streams exceed the pool size (default 100). `watch()` per SSE client works with 5 users and stalls every query at 200. One stream per process.",
        },
        {
          t: "pitfall",
          h: "Delete events don't say which board",
          x: "A delete event carries only `documentKey: { _id }`; `fullDocument` is gone. To route it, enable pre-images (`collMod` with `changeStreamPreAndPostImages`) and read `fullDocumentBeforeChange`, or soft-delete with a `deletedAt` update.",
        },
        {
          t: "steps",
          h: "The client side, in an order that loses nothing",
          items: [
            "Open the `EventSource` first. Same origin, so the session cookie rides along.",
            "On its `open` event, fetch the board. Events that arrive meanwhile are applied as they come.",
            "Apply any card, from an event or a fetch, only if its `version` is higher than the one you hold.",
            "On `resync`, or after any reconnect (EventSource reconnects by itself), fetch again. Same rule, so overlap is harmless.",
          ],
        },
        {
          t: "play",
          mode: "js",
          title: "arrival order vs version order",
          js: `// Versions of one card, in the order the server produced them.
const produced = [
  { v: 2, listId: "doing" },
  { v: 3, listId: "review" },
  { v: 4, listId: "done" },
];
// After a reconnect, a refetch (v4) beat two replayed events (v2, v3).
const arrived = [produced[2], produced[0], produced[1]];

const naive = (card, e) => ({ listId: e.listId, v: e.v });
const versioned = (card, e) => (e.v > card.v ? { listId: e.listId, v: e.v } : card);

let a = { listId: "todo", v: 1 };
let b = a;
for (const e of arrived) {
  a = naive(a, e);
  b = versioned(b, e);
  console.log(("got v" + e.v).padEnd(7), "naive:", a.listId.padEnd(7), "versioned:", b.listId);
}`,
          task: "Shuffle `arrived` any way you like: versioned always ends in done. Then add a delete event at v5 that must win even when a stale v3 arrives after it.",
        },
        {
          t: "pitfall",
          h: "Compression middleware swallows SSE",
          x: "`compression()` buffers output to compress it well, so events sit in the buffer and arrive in bursts or never. Skip compression for `text/event-stream` or call `res.flush()` after each write; and send `X-Accel-Buffering: no` for nginx in front.",
        },
        {
          t: "mission",
          h: "Milestone 6: two instances, one board",
          x: "Run two servers on ports 3001 and 3002 against the same database. Open the board in one tab on each and drag a card: it moves on both. Then swap the change stream for broadcast-after-write and watch the other tab stay wrong.",
          hint: "Cookies ignore ports, so one login on `localhost` works for both. Also remove a member while their tab is open: their stream keeps flowing until you close it on membership change.",
        },
      ],
    },
    {
      title: "Uploads with signed URLs",
      beats: [
        {
          t: "quiz",
          q: "Why not stream attachments through Express to S3?",
          options: ["Express can't parse multipart", "Every byte would pass through your process: memory, bandwidth, host request limits and timeouts, all for a copy you don't need", "S3 rejects server uploads", "It breaks cookies"],
          answer: 1,
          why: "Your server's job is deciding who may upload what. The bytes can go straight from the browser to the bucket, with a short-lived signature that encodes your decision.",
        },
        {
          t: "steps",
          h: "Three round trips, one decision",
          items: [
            "Client sends name, type and size to `POST /api/cards/:id/uploads`. The API checks role, type and size, and returns a presigned POST valid for 60 s.",
            "The browser POSTs the file straight to the bucket with those fields.",
            "Client sends the key to `POST /api/cards/:id/attachments`. The API runs `HeadObject` for the real size and pushes the metadata onto the card.",
            "Reads return short-lived presigned GET URLs, or go through a CDN. The bucket stays private.",
          ],
        },
        {
          t: "code",
          lang: "js",
          src: `import { S3Client } from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { randomUUID } from "node:crypto";

const s3 = new S3Client({ region: config.S3_REGION });
const TYPES = new Set(["image/png", "image/jpeg", "image/webp", "application/pdf"]);
const MAX = 10_000_000;

router.post("/cards/:cardId/uploads", async (req, res) => {
  const { cardId } = Params.parse(req.params);
  const { type } = z.object({ type: z.string(), size: z.number().int().positive().max(MAX) }).parse(req.body);
  if (!TYPES.has(type)) throw new BadRequest("file type");
  const card = await cardForEditor(cardId, req.userId);
  const key = \`boards/\${card.boardId}/\${randomUUID()}\`;   // never the user's filename
  const { url, fields } = await createPresignedPost(s3, {
    Bucket: config.S3_BUCKET,
    Key: key,
    Conditions: [["content-length-range", 1, MAX], ["eq", "$Content-Type", type]],
    Fields: { "Content-Type": type },
    Expires: 60,                                         // seconds
  });
  res.json({ key, url, fields });
});

// Attach: a filter on the array's 20th slot caps attachments without a read.
await Card.findOneAndUpdate(
  { _id: cardId, "attachments.19": { $exists: false } },
  { $push: { attachments: { key, name, size: head.ContentLength, mime: head.ContentType } }, $inc: { version: 1 } },
  { returnDocument: "after" },
);`,
          mark: [14, 18, 26],
          note: "On the client, append every returned field to a `FormData` and the file **last**: S3 ignores fields after the file.",
        },
        {
          t: "pitfall",
          h: "A presigned PUT doesn't cap the size",
          x: "The `size` the client told you is a claim. A presigned PUT URL accepts whatever body arrives, so someone uploads 5 GB on your bill. A presigned POST with `content-length-range` makes S3 enforce the limit, and `HeadObject` at attach time checks what really landed.",
        },
{
          t: "mission",
          h: "Milestone 7: attachments",
          x: "Add uploads to the card dialog with a progress bar, an image preview, and delete. Uploads that are never attached must not live forever in the bucket.",
          hint: "`fetch` has no upload progress; use `XMLHttpRequest` and `xhr.upload.onprogress`. For orphans, record pending keys with a TTL'd `createdAt` and sweep objects no card references.",
        },
      ],
    },
    {
      title: "Testing the critical paths",
      beats: [
        { t: "say", x: "Test where a bug loses data or leaks it: membership checks, concurrent edits, session expiry, pagination edges. Run them against a real MongoDB in memory and the real Express app, not mocks of either." },
        {
          t: "code",
          lang: "js",
          file: "server/test/boards.test.js",
          src: `import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { createApp } from "../app.js";

const ORIGIN = "http://localhost:3000";
let mongo, app;
before(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } }); // change streams need it
  await mongoose.connect(mongo.getUri());
  await mongoose.connection.syncIndexes();   // the unique email index exists before test 1
  app = createApp();                         // no listen(): supertest binds a port per call
});
after(async () => { await mongoose.disconnect(); await mongo.stop(); });

async function signup(email) {
  const agent = request.agent(app);          // keeps the sid cookie between calls
  await agent.post("/api/signup").set("Origin", ORIGIN)
    .send({ email, password: "correct horse battery" }).expect(201);
  return agent;
}

test("a non-member gets 404, not the board", async () => {
  const ada = await signup("ada@x.io");
  const bo = await signup("bo@x.io");
  const { body } = await ada.post("/api/boards").set("Origin", ORIGIN).send({ title: "Launch" }).expect(201);
  await bo.get(\`/api/boards/\${body._id}\`).expect(404);
});`,
          mark: [11, 13, 20],
          note: "Export `createApp()` from one file and call `listen()` in another. Tests, scripts and the server then share one app with no port fights.",
        },
        {
          t: "predict",
          lang: "js",
          src: `// card.version is 3. Two tabs save at the same moment.
const edit = (title) => ada.patch(\`/api/cards/\${id}\`).set("Origin", ORIGIN)
  .send({ title, version: 3 });
const [a, b] = await Promise.all([edit("A"), edit("B")]);
console.log([a.status, b.status].sort());`,
          q: "With the PATCH route from the API section, what prints?",
          options: ["[200, 200]", "[200, 409]", "[409, 409]", "It depends on timing"],
          answer: 1,
          why: "`findOneAndUpdate({ _id, version: 3 })` is atomic on one document: the first write bumps it to 4, so the second filter matches nothing and returns null, which becomes 409. Every run, any timing.",
        },
        {
          t: "pitfall",
          h: "The unique index that wasn't built yet",
          x: "With `autoIndex`, Mongoose builds indexes in the background after connecting. A duplicate-email test that runs first can insert both users before the unique index exists, and passes or fails by timing. Await `syncIndexes()` or `Model.init()` in setup.",
        },
        {
          t: "pitfall",
          h: "`node --test` runs files in parallel",
          x: "Each test file is its own process, run concurrently. Two files on the same database name wipe each other's data mid-test, and it only flakes on CI's bigger machine. One in-memory server per file, or a database name per file.",
        },
        {
          t: "mission",
          h: "Milestone 8: the tests that matter",
          x: "Write five: non-member gets 404, viewer can't move a card, concurrent edits give one 409, an expired session gets 401 even if the TTL monitor hasn't run, and 45 comments page as 20, 20, 5 with no repeats.",
          hint: "For expiry, insert a session row with `expiresAt` in the past and send its token as the cookie. Don't sleep in tests; set the clock in the data.",
        },
      ],
    },
    {
      title: "Deploy, and the production checklist",
      beats: [
        { t: "say", x: "Containers and hosting are covered in Shipping. What changes for this app: Atlas instead of a local replica set, one container serving both the API and the built client, and config that refuses to boot when wrong." },
        {
          t: "code",
          lang: "js",
          file: "server/server.js",
          src: `import mongoose from "mongoose";
import { config } from "./config.js";        // zod-validated env: exits on a missing var
import { createApp } from "./app.js";
import { startChangeStream, closeRealtime } from "./realtime.js";

mongoose.set("autoIndex", !config.prod);     // prod indexes come from a release step
await mongoose.connect(config.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
startChangeStream();

const server = createApp().listen(config.PORT, (err) => {
  if (err) throw err;                         // Express 5 passes EADDRINUSE here
  console.log("listening on", config.PORT);
});

process.on("SIGTERM", async () => {
  await closeRealtime();                      // SSE never ends by itself
  server.close(async () => {
    await mongoose.disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();   // before the host's SIGKILL
});`,
          mark: [7, 16, 17],
          note: "Connect before `listen`, so the health check fails until the database is reachable. `app.js` serves `dist/` and falls back to `index.html` with `app.get(\"/{*splat}\")`.",
        },
        {
          t: "pitfall",
          h: "\"buffering timed out after 10000ms\"",
          x: "Mongoose queues model calls until a connection exists. With a wrong URI or a blocked IP, nothing errors at boot; every request hangs 10 s and then fails with that message. Await `connect` with a short `serverSelectionTimeoutMS` and crash early instead.",
        },
        {
          t: "pitfall",
          h: "Split origins break cookie auth",
          x: "Client on one host's `.app` domain, API on another's: the session cookie is third-party, Safari blocks it, and you fight `SameSite=None` and CORS credentials forever. Serve both from one origin, or subdomains of a domain you own.",
        },
        {
          t: "table",
          head: ["Check", "Why"],
          rows: [
            ["`trust proxy` set to the real hop count", "`req.ip`, `req.secure` and rate limits are wrong otherwise"],
            ["Indexes created in a release step", "`autoIndex` builds on every boot of every instance"],
            ["`createIndexes()`, not `syncIndexes()`, in prod", "`syncIndexes` drops indexes not in your schema"],
            ["`express.json({ limit })`, login rate limit", "Cheap protection against big bodies and password guessing"],
            ["Atlas: least-privilege user, network list, backups", "`readWrite` on one database; know if you opened `0.0.0.0/0`"],
            ["Hashed assets cached a year, `index.html` not", "A cached old `index.html` points at deleted chunks: blank page"],
            ["SIGTERM handled, SSE ended", "Otherwise every deploy waits for the kill timeout"],
            ["500s carry a request id in logs and body", "The only way to find one user's error later"],
          ],
        },
        {
          t: "mission",
          h: "Milestone 9: ship it",
          x: "Create an Atlas cluster and a database user, build the client, put the server and `dist/` in one image, and deploy it to a container host with env vars for the URI, origin and bucket. Open the board from two devices and drag.",
          hint: "Percent-encode the Atlas password inside the URI. Run index creation as a one-off release command before the new version takes traffic.",
          solution: {
            lang: "dockerfile",
            src: `FROM node:24-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build              # vite build -> dist/

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY server ./server
USER node
CMD ["node", "server/server.js"]`,
          },
        },
      ],
    },
  ],
  nobodyTells: [
    "Design documents around the hottest write. A card move that touches one document needs no transaction; one that touches two needs one on every drag.",
    "Dotted conditions on an array can match different elements. When both must hold for the same member, use `$elemMatch`.",
    "Give every mutable document a version and make clients apply-if-newer. One rule fixes echoes, replays and out-of-order arrivals.",
    "Subscribe first, then fetch. The other order drops every event that lands between the two.",
    "An SSE stream is authorized once, at connect. Removing someone from a board must also close their open streams.",
    "A transaction callback can be retried. Publish events, send emails and charge cards after it commits, never inside it.",
    "Atlas passwords with `@`, `/` or `:` must be percent-encoded in the URI, or you get errors that look like DNS or auth failures.",
    "Cookies ignore ports: two local apps on different ports share cookies, and a stale `sid` from one confuses the other.",
  ],
  glossary: [
    ["embed vs reference", "Store related data inside the parent document, or in its own collection pointing back by id."],
    ["multikey index", "An index on an array field: one index entry per element, so `members.userId` lookups are seeks."],
    ["fractional index", "An order key you can always fit between two others, so a move rewrites one item."],
    ["optimistic update", "Show the result of a write before the server confirms it, and undo it if it fails."],
    ["optimistic concurrency", "Write only if the version you read is still current; otherwise report a conflict."],
    ["`$elemMatch`", "Requires all its conditions to hold on the same array element."],
    ["change stream", "A cursor over committed changes to a collection, fed from the oplog. Needs a replica set."],
    ["resume token", "The `_id` of a change event; pass it to `resumeAfter` to continue from that point."],
    ["fan-out", "One change delivered to every connected client that cares about it."],
    ["presigned POST", "A signed form that lets a browser upload to a bucket under conditions you set, such as size."],
    ["TTL index", "An index on a date that makes MongoDB delete documents after it passes, roughly once a minute."],
    ["IDOR", "Insecure direct object reference: fetching by id without checking the caller may see it."],
  ],
  explain: "Explain to a friend how a card drag reaches a teammate's screen in this app: the optimistic update, the write, the change stream, the fan-out, and why versions make arrival order not matter.",
};
