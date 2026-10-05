const PERCENTILES = `// One minute of request latencies (ms) from four servers behind one load balancer.
let s = 42; // seeded random, so every run prints the same numbers
const rand = () => {
  s = (s + 0x6d2b79f5) | 0;
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const sample = (slowShare) => {
  if (rand() < slowShare) return 800 + rand() * 1700; // GC pause, lock wait, cold cache
  return 20 + rand() * 60;                            // the normal case
};
// a, b, c are healthy. d has a noisy neighbour and gets fewer requests.
const servers = {
  a: Array.from({ length: 3000 }, () => sample(0.003)),
  b: Array.from({ length: 3000 }, () => sample(0.003)),
  c: Array.from({ length: 3000 }, () => sample(0.003)),
  d: Array.from({ length: 1000 }, () => sample(0.15)),
};
const all = Object.values(servers).flat();

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
function pct(xs, p) { // nearest rank: p% of requests took this long or less
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.ceil((p / 100) * sorted.length) - 1];
}
const ms = (x) => \`\${x.toFixed(0).padStart(5)} ms\`;

console.log("all traffic:", all.length, "requests");
console.log("  mean ", ms(mean(all)));
for (const p of [50, 90, 99, 99.9]) console.log(\`  p\${p}\`.padEnd(8), ms(pct(all, p)));

const perServer = Object.values(servers).map((xs) => pct(xs, 99));
console.log("per-server p99:", perServer.map((x) => x.toFixed(0)).join(", "));
console.log("average of those:", ms(mean(perServer)), " true p99:", ms(pct(all, 99)));`;

export default {
  id: "shipping",
  n: 29,
  part: "E",
  title: "Shipping: Docker, hosting, observability",
  hook: "A container is a process with blinders on. Ship one that stops cleanly, rolls back in seconds and tells you when it hurts.",
  minutes: 90,
  levels: ["use", "understand"],
  sections: [
    {
      title: "A container is a process",
      beats: [
        { t: "say", x: "A container is not a small VM. It's an ordinary Linux process the kernel lies to: **namespaces** decide what it can see, **cgroups** decide how much it can use. No guest kernel, nothing boots." },
        {
          t: "code",
          lang: "bash",
          src: "$ docker run -d --name s alpine sleep 1000\n$ docker exec s ps\nPID   USER     TIME  COMMAND\n    1 root      0:00 sleep 1000\n    7 root      0:00 ps\n\n# on the Linux host (inside the VM, on Docker Desktop)\n$ ps -eo pid,cmd | grep 'sleep 1000'\n48213 sleep 1000",
          mark: [4, 9],
          note: "One process, two PIDs. Inside its PID namespace it is 1; the host sees an ordinary process. `docker stop` is a signal sent to it.",
        },
        {
          t: "table",
          head: ["Namespace", "Gives the process its own"],
          rows: [
            ["pid", "Process numbering. The first process is PID 1, with PID 1's special rules"],
            ["net", "Interfaces, routes, ports and its own `localhost`"],
            ["mnt", "Mount table, so the image's files can be `/`"],
            ["uts, ipc", "Hostname; shared memory and semaphores"],
            ["user", "uid mapping: root inside can be nobody outside. Off by default in Docker"],
          ],
          caption: "cgroups are the other half: memory, CPU, PID and IO limits, enforced by the kernel.",
        },
        {
          t: "predict",
          lang: "bash",
          src: "docker run --rm -m 256m node:24-slim node -e '\n  const keep = [];\n  setInterval(() => keep.push(Buffer.alloc(50e6, 1)), 100);\n'\necho \"exit: $?\"",
          q: "What happens?",
          options: ["V8 throws a `RangeError` at 256 MB", "The kernel kills it: `exit: 137`", "Docker raises the limit", "It prints an out-of-memory stack trace and exits 1"],
          answer: 1,
          why: "Buffers live outside the V8 heap, so V8 never sees the limit coming. The cgroup hits its cap and the OOM killer sends SIGKILL: 128 + 9 = 137. `docker inspect` shows `OOMKilled: true`. No log line, no stack trace.",
        },
        { t: "say", h: "Images are layers", x: "An image is a stack of read-only filesystem diffs, one per instruction that changes files. **overlayfs** merges them into one `/`, and each container gets a thin writable layer on top." },
        {
          t: "viz",
          name: "frames",
          props: {
            cols: ["Image layers (read-only)", "Container layer", "What the process sees"],
            frames: [
              { cells: [["L1 node:24-slim"], [], ["/usr /bin /etc ..."]], note: "`FROM` brings the base image's layers. They're shared by every image built on the same base." },
              { cells: [["L1 node:24-slim", "L2 package*.json"], [], ["/usr /bin /etc ...", "/app/package.json"]], note: "`COPY package*.json ./` adds a layer holding just those two files." },
              { cells: [["L1 node:24-slim", "L2 package*.json", "L3 node_modules"], [], ["/usr /bin /etc ...", "/app/package.json", "/app/node_modules"]], note: "`RUN npm ci` stores only what the command changed: the new `node_modules`." },
              { cells: [["L1 node:24-slim", "L2 package*.json", "L3 node_modules", "L4 src"], [], ["/usr /bin /etc ...", "/app/package.json", "/app/node_modules", "/app/src"]], note: "`COPY . .` and the build is done: four layers plus a JSON config (CMD, ENV, USER)." },
              { cells: [["L1", "L2", "L3", "L4"], ["(empty)"], ["/usr /bin /etc ...", "/app/package.json", "/app/node_modules", "/app/src"]], note: "`docker run` adds an empty writable layer. Nothing is copied, which is why a container starts in milliseconds." },
              { cells: [["L1", "L2", "L3", "L4"], ["/tmp/cache.json", "/app/package.json (copied up)"], ["/usr /bin /etc ...", "/app/package.json (edited)", "/app/node_modules", "/app/src", "/tmp/cache.json"]], note: "New files land in the container layer. Editing a lower file copies the whole file up first; L2 never changes." },
              { cells: [["L1", "L2", "L3", "L4 (still has old.js)"], ["/tmp/cache.json", "/app/package.json (copied up)", "whiteout: src/old.js"], ["/usr /bin /etc ...", "/app/package.json (edited)", "/app/node_modules", "/app/src (no old.js)", "/tmp/cache.json"]], note: "Deleting a lower file writes a **whiteout** that hides it. The bytes are still in L4." },
              { cells: [["L1", "L2", "L3", "L4"], [], []], note: "`docker rm`: the writable layer is gone, with everything written to it. Data worth keeping goes in a volume." },
            ],
          },
        },
        {
          t: "pitfall",
          h: "`RUN rm` doesn't unship a secret",
          x: "`COPY .npmrc .` then `RUN rm .npmrc` leaves the token in the earlier layer, readable by anyone who can pull the image. Same for `ARG`/`ENV` values. Mount secrets for one step instead: `RUN --mount=type=secret,id=npmrc,target=/root/.npmrc npm ci`.",
        },
      ],
    },
    {
      title: "Dockerfiles that cache",
      beats: [
        { t: "say", x: "Each instruction's result is cached, keyed by the layer before it plus the instruction. Miss once and **every step after it** rebuilds. So order the file from what changes least to what changes most." },
        {
          t: "predict",
          lang: "dockerfile",
          src: "FROM node:24-slim\nWORKDIR /app\nCOPY . .\nRUN npm ci\nRUN npm run build\nCMD [\"node\", \"dist/server.js\"]",
          q: "You edit one line in `src/routes.ts` and rebuild. Which steps run again?",
          options: ["Only `npm run build`", "`COPY . .`, `npm ci` and `npm run build`", "Everything from `FROM`", "Nothing, the file's mtime is ignored"],
          answer: 1,
          why: "`COPY` checksums the contents of what it copies, so any edit is a miss, and everything after it rebuilds. You reinstall every dependency to change one line.",
        },
        {
          t: "compare",
          a: { label: "deps reinstall on every edit", lang: "dockerfile", src: "COPY . .\nRUN npm ci\nRUN npm run build" },
          b: { label: "deps cached until the lockfile changes", lang: "dockerfile", src: "COPY package.json package-lock.json ./\nRUN npm ci\nCOPY . .\nRUN npm run build" },
          x: "Copy only what the install needs, install, then copy the rest. A source edit now misses at the second `COPY`, after the expensive step.",
        },
        {
          t: "table",
          head: ["Instruction", "Cache hit when", "Trap"],
          rows: [
            ["`COPY` / `ADD`", "The copied files' contents match; mtime is ignored", "Without `.dockerignore`, `COPY . .` includes `.git`: a miss on every commit"],
            ["`RUN`", "The command string is identical", "`RUN apt-get update` stays cached for months: the command didn't change, the world did"],
            ["`ARG`", "The value is the same as last build", "A build arg set to the commit SHA misses at its first use, and so does every later step"],
            ["`FROM`", "The tag resolves to the image you already have", "`node:24` is re-pushed on every patch release; `--pull` fetches the new one"],
          ],
        },
        {
          t: "predict",
          lang: "bash",
          src: "# good order from above. CI runs this before every build:\nnpm version patch --no-git-tag-version\ndocker build -t api .",
          q: "Does the `npm ci` layer come from cache?",
          options: ["Yes, no dependency changed", "No: `npm version` rewrote package.json and the lockfile", "Only on the second build", "Yes, if BuildKit is on"],
          answer: 1,
          why: "The cache sees bytes, not intent. Bumping `version` edits both files the install step copies, so every build reinstalls from scratch. Pass the version in at runtime, or as a build arg used in the last stage.",
        },
        {
          t: "code",
          lang: "dockerfile",
          src: "# syntax=docker/dockerfile:1\nFROM node:24-slim\nWORKDIR /app\nCOPY package.json package-lock.json ./\nRUN --mount=type=cache,target=/root/.npm \\\n    npm ci",
          mark: [5],
          note: "When the layer does miss, a **cache mount** keeps npm's download cache between builds without putting it in the image. BuildKit, the default builder, supports it.",
        },
        {
          t: "pitfall",
          h: "No `.dockerignore`, and your laptop ships",
          x: "`COPY . .` sends your local `node_modules` into the image, over the ones `npm ci` just built. Native modules compiled for macOS or Windows then fail on Linux with `invalid ELF header`. It also sends `.git` and `.env`. List all three in `.dockerignore`.",
        },
      ],
    },
    {
      title: "Small, safe images",
      beats: [
        { t: "say", x: "The build needs compilers, dev dependencies and source. The running app needs none of it. A **multi-stage** build does the work in one image and copies only the output into a clean one." },
        {
          t: "code",
          lang: "dockerfile",
          src: "# syntax=docker/dockerfile:1\nFROM node:24-slim AS build\nWORKDIR /app\nCOPY package.json package-lock.json ./\nRUN npm ci\nCOPY . .\nRUN npm run build && npm prune --omit=dev\n\nFROM node:24-slim\nENV NODE_ENV=production\nWORKDIR /app\nCOPY --from=build /app/node_modules ./node_modules\nCOPY --from=build /app/dist ./dist\nUSER node\nCMD [\"node\", \"dist/server.js\"]",
          mark: [9, 12, 14],
          note: "No source, no TypeScript, no dev dependencies in the final image. Files copied without `--chown` stay owned by root, so the `node` user can run the code but not rewrite it.",
        },
        {
          t: "table",
          head: ["Base", "libc", "Trade-off"],
          rows: [
            ["`node:24`", "glibc", "Full Debian with compilers. A fine build stage, wasteful to ship"],
            ["`node:24-slim`", "glibc", "The sane runtime default: small, and prebuilt native modules just work"],
            ["`node:24-alpine`", "musl", "Smallest of the official tags; some prebuilt binaries won't load on musl"],
            ["distroless", "glibc", "No shell, no package manager: tiny attack surface, and no `docker exec sh`"],
          ],
        },
        {
          t: "pitfall",
          h: "Build and run on the same libc",
          x: "Building on `node:24` and running on `node:24-alpine` looks like a free size win. Then every native module downloaded for glibc (sharp, bcrypt, Prisma's engine) fails to load on musl at startup. Pick one family for every stage.",
        },
        {
          t: "quiz",
          q: "The container is isolated anyway. Why run as `USER node`?",
          options: ["Style; root inside a container is harmless", "Without user namespaces, root inside is uid 0 to the host kernel: one escape bug or bind mount away from host root", "Node refuses to run as root", "It makes the image smaller"],
          answer: 1,
          why: "Namespaces change what a process sees, not who it is. A bind-mounted host directory, or the Docker socket, is writable by container root as real root. Non-root turns most of those mistakes into a permission error.",
        },
      ],
    },
    {
      title: "PID 1 and clean shutdowns",
      beats: [
        { t: "say", x: "`docker stop` sends SIGTERM to the container's PID 1, waits 10 seconds, then sends SIGKILL. Orchestrators do the same with their own grace period. Those 10 seconds are your chance to finish requests." },
        {
          t: "predict",
          lang: "dockerfile",
          src: "CMD [\"node\", \"server.js\"]\n# server.js: plain Express, no signal listeners\n\n# $ time docker stop api",
          q: "How long does `docker stop` take?",
          options: ["Instant: Node exits on SIGTERM", "About 10 s, then Node is SIGKILLed", "Forever, until you `docker kill` it", "Instant, with exit code 143"],
          answer: 1,
          why: "The kernel doesn't apply default signal actions to PID 1. Without a `process.on(\"SIGTERM\")` listener, Node relies on the default, so as PID 1 it ignores the signal. SIGKILL comes 10 s later: exit 137, requests cut mid-flight.",
        },
        {
          t: "predict",
          lang: "dockerfile",
          src: "CMD [\"npm\", \"start\"]\n# package.json: \"start\": \"node server.js\"\n# server.js: process.on(\"SIGTERM\", drainAndExit)",
          q: "On `node:24-slim`, does `drainAndExit` run on `docker stop`?",
          options: ["Yes, npm forwards SIGTERM to the script", "No: npm forwards it to `sh`, `sh` dies without passing it on, npm exits, and node is SIGKILLed", "No, npm blocks all signals", "Yes, Docker signals every process in the container"],
          answer: 1,
          why: "npm runs scripts as `sh -c \"node server.js\"`. Debian's `sh` is dash, which keeps node as a child and simply dies on SIGTERM. When PID 1 (npm) exits, the kernel kills everything left. Your handler never hears a thing.",
        },
        {
          t: "table",
          head: ["You write", "PID 1 is", "SIGTERM"],
          rows: [
            ["`CMD [\"npm\", \"start\"]`", "npm, with `sh` and node below it", "Lost at the shell on Debian-based images"],
            ["`CMD node server.js` (shell form)", "`/bin/sh -c`", "Never reaches node; sh as PID 1 ignores it"],
            ["`CMD [\"node\", \"server.js\"]`", "node", "Delivered, and ignored unless you listen for it"],
            ["exec form plus `--init` / `init: true`", "tini, node below it", "Forwarded; node isn't PID 1, so the default action works too"],
          ],
          caption: "Exec form plus a SIGTERM listener plus an init is the setup that always works.",
        },
        {
          t: "code",
          lang: "js",
          file: "server.js",
          src: "let draining = false;\napp.get(\"/readyz\", (req, res) => res.sendStatus(draining ? 503 : 200));\nconst server = app.listen(3000);\n\nprocess.on(\"SIGTERM\", () => {\n  draining = true;                        // readiness fails: routers stop sending\n  setTimeout(() => {\n    server.close(async () => {            // stop accepting, let in-flight finish\n      await pool.end();                   // then close the DB pool\n      process.exit(0);\n    });\n  }, 5_000);                              // routers notice late; keep serving\n  setTimeout(() => process.exit(1), 25_000).unref(); // never hang a deploy\n});",
          mark: [6, 8, 12],
          note: "The servers chapter's shutdown handler, plus what a fleet needs: fail readiness first. The waits must fit the grace period: raise it with `stop_grace_period` or `docker stop -t`.",
        },
        {
          t: "pitfall",
          h: "SIGTERM arrives before the traffic stops",
          x: "During a rolling deploy, the load balancer learns an instance is leaving at about the same moment the instance does. Close the listener at once and requests already routed to you get connection refused. Fail readiness, keep serving a few seconds, then close.",
        },
      ],
    },
    {
      title: "Compose and config",
      beats: [
        {
          t: "code",
          lang: "yaml",
          file: "compose.yaml",
          src: "services:\n  api:\n    build: .\n    init: true\n    ports: [\"127.0.0.1:3000:3000\"]\n    environment:\n      DATABASE_URL: postgres://app:app@db:5432/app\n    depends_on:\n      db: { condition: service_healthy }\n    stop_grace_period: 30s\n  db:\n    image: postgres:18\n    environment:\n      POSTGRES_USER: app\n      POSTGRES_PASSWORD: app\n    volumes: [\"pgdata:/var/lib/postgresql\"]\n    healthcheck:\n      test: [\"CMD-SHELL\", \"pg_isready -U app\"]\n      interval: 2s\n      retries: 15\nvolumes:\n  pgdata:",
          mark: [9, 16],
          note: "No top-level `version:`, Compose ignores it now. `service_healthy` waits until Postgres accepts connections, not just until its process starts.",
        },
        {
          t: "predict",
          lang: "bash",
          src: "# inside the api container, same stack as above\nDATABASE_URL=postgres://app:app@localhost:5432/app node server.js",
          q: "It can't reach Postgres. Why?",
          options: ["Postgres isn't ready yet", "`localhost` is the api container's own network namespace; Postgres is at `db`", "Port 5432 isn't published", "Compose needs `links:`"],
          answer: 1,
          why: "Each container has its own loopback. Compose puts the services on one network with DNS by service name, so `db:5432` works with no published port. Publishing is only for reaching a container from the host.",
        },
        {
          t: "pitfall",
          h: "Published ports skip your firewall",
          x: "On a Linux host, `ports: [\"5432:5432\"]` makes Docker add its own iptables rules, which traffic hits before ufw's. `ufw deny 5432` says active and the database is open to the internet anyway. Bind to `127.0.0.1:` or don't publish internal services at all.",
        },
        { t: "say", x: "The same image should run in dev, staging and production. What differs is **config**, read from the environment when the process starts, never baked in at build. Build once, promote that exact image, and a staging pass means something." },
        {
          t: "pitfall",
          h: "Frontend env vars are baked at build time",
          x: "`import.meta.env.VITE_API_URL` becomes a string literal when Vite builds (`NEXT_PUBLIC_*` too). One bundle can't point at staging and production, so build-once breaks for SPAs. Serve config at runtime: a `/config.json` fetched first, or a script tag the server fills in.",
        },
      ],
    },
    {
      title: "Hosting, proxies and TLS",
      beats: [
        {
          t: "table",
          head: ["Option", "You run", "Bills by", "Watch out for"],
          rows: [
            ["Static host + CDN", "Nothing; files sit on an edge network", "Bandwidth, often free when small", "Static files only; the API lives elsewhere"],
            ["PaaS", "Your code or image; they run machines", "Instance size per hour", "Price steps at each tier; free tiers that sleep"],
            ["Containers on a VM", "OS patches, proxy, TLS, restarts, backups", "The VM per hour, busy or idle", "Everything a PaaS did is now your job"],
            ["Serverless functions", "Handler code only", "Requests and GB-seconds", "Cold starts, time limits, DB connection storms"],
          ],
          caption: "Cost shape matters more than list price: per-hour wins for steady load, per-request for spiky or idle.",
        },
        { t: "say", h: "Cold starts", x: "A serverless platform starts an instance when a request finds none free: boot the runtime, load your code, run its top-level imports, then handle the request. Idle instances get reclaimed, and the next request pays again." },
        {
          t: "predict",
          lang: "text",
          src: "Serverless API, 3 req/s on average, bursty.\nThe handler imports an ORM and a whole cloud SDK at top level.\nDashboard: p50 45 ms, p99 1900 ms.",
          q: "Where does the 1.9 s come from?",
          options: ["Slow queries", "Cold starts: rare enough to vanish from the median, common enough to own the tail", "Network jitter", "The dashboard averages wrong"],
          answer: 1,
          why: "If 1 request in 60 lands on a fresh instance, p50 never sees it and p99 is nothing but it. Trim top-level imports, pay for minimum warm instances, or move steady traffic to an always-on host.",
        },
        {
          t: "steps",
          h: "A request, from the user to your process",
          items: [
            "DNS sends `api.example.com` to a CDN edge or your load balancer.",
            "TLS terminates there. The certificate lives at the edge, not in your app.",
            "The edge forwards to the origin, adding `X-Forwarded-For` and `X-Forwarded-Proto`.",
            "A reverse proxy on the box (Caddy, nginx) holds :443 and passes requests to the app on `127.0.0.1:3000`.",
            "Your app sees plain HTTP from a local address. All it knows about the client is in those headers.",
          ],
        },
        {
          t: "compare",
          a: { label: "Caddyfile", lang: "text", src: "api.example.com {\n\tencode zstd gzip\n\treverse_proxy 127.0.0.1:3000\n}" },
          b: { label: "nginx (certs from certbot)", lang: "bash", src: "server {\n  listen 443 ssl;\n  server_name api.example.com;\n  ssl_certificate     /etc/letsencrypt/live/api.example.com/fullchain.pem;\n  ssl_certificate_key /etc/letsencrypt/live/api.example.com/privkey.pem;\n  location / {\n    proxy_pass http://127.0.0.1:3000;\n    proxy_set_header Host $host;\n    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n    proxy_set_header X-Forwarded-Proto $scheme;\n  }\n}\n# plus a :80 block that redirects, plus renewal" },
          x: "Caddy gets and renews certificates over ACME by itself, redirects HTTP to HTTPS and sets the forwarding headers. nginx does exactly what you write, so you write more.",
        },
        {
          t: "pitfall",
          h: "The certificate store needs a volume",
          x: "An ACME client whose certificates live in the container's writable layer asks for new ones on every restart. Let's Encrypt allows 5 certificates per exact set of names per week, and a crash loop burns that in minutes. Caddy keeps its certificates in `/data`: mount it.",
        },
        {
          t: "pitfall",
          h: "The CDN served one user's page to everyone",
          x: "A route renders per-user HTML and someone adds `Cache-Control: public, s-maxage=60` for speed. The edge caches the first visitor's account page and hands it to the next thousand. Anything per-user is `private` or `no-store`. Check it with two accounts before shipping.",
        },
      ],
    },
    {
      title: "Deploys nobody notices",
      beats: [
        { t: "say", x: "Zero downtime means a ready instance is always behind the load balancer. The new one starts, proves it's ready, gets traffic; only then does an old one get SIGTERM. That takes two different health checks." },
        {
          t: "table",
          head: ["Check", "Asks", "On failure", "Should touch"],
          rows: [
            ["Liveness", "Is this process stuck?", "Restart it", "Nothing external: answering at all means alive"],
            ["Readiness", "Can it serve right now?", "Stop routing to it; don't kill it", "What serving needs: DB pool, warm caches"],
            ["Startup", "Has it finished booting?", "Keep waiting; the others are paused", "Readiness, with a longer allowance"],
          ],
          caption: "Kubernetes names. Other platforms have the same ideas under other names.",
        },
        {
          t: "pitfall",
          h: "A liveness check that pings the database",
          x: "The DB has a 30 s hiccup. Every instance fails liveness together, gets restarted together, and all of them cold-start into a recovering database at once. A blip became an outage. Liveness asks about the process; dependencies belong in readiness.",
        },
        {
          t: "quiz",
          q: "A container started with `docker run --restart=always` has a HEALTHCHECK that starts failing. What does Docker do?",
          options: ["Restarts it", "Marks it `unhealthy` and leaves it running", "Stops it", "Rolls back to the previous image"],
          answer: 1,
          why: "Restart policies fire when the process exits, not on health. Plain Docker only reports `unhealthy`; Compose uses health for `depends_on`, and Swarm and other orchestrators act on it.",
        },
        {
          t: "viz",
          name: "frames",
          props: {
            cols: ["Load balancer routes to", "Starting or draining", "Versions serving"],
            frames: [
              { cells: [["a v1", "b v1", "c v1"], [], ["v1"]], note: "Three instances of v1. Roll out v2, one extra instance at a time." },
              { cells: [["a v1", "b v1", "c v1"], ["d v2: booting, not ready"], ["v1"]], note: "d starts. Its readiness fails until it has connected and warmed up, so it gets no traffic." },
              { cells: [["a v1", "b v1", "c v1", "d v2"], [], ["v1", "v2"]], note: "d is ready and added. From now on **two versions serve at once**." },
              { cells: [["b v1", "c v1", "d v2"], ["a v1: SIGTERM, draining"], ["v1", "v2"]], note: "a fails readiness, is taken out, finishes its in-flight requests and exits." },
              { cells: [["b v1", "c v1", "d v2", "e v2"], [], ["v1", "v2"]], note: "Repeat with e." },
              { cells: [["c v1", "d v2", "e v2", "f v2"], ["b v1: draining"], ["v1", "v2"]], note: "And again. If any v2 never turned ready, the rollout would stall here with v1 still serving." },
              { cells: [["d v2", "e v2", "f v2"], ["c v1: draining"], ["v2"]], note: "Done. Rolling back is the same dance with the previous image." },
            ],
          },
        },
        {
          t: "table",
          head: ["Strategy", "How", "Rollback", "Costs"],
          rows: [
            ["Rolling", "Replace instances a few at a time", "Roll again with the old image: minutes", "Versions mix during the rollout"],
            ["Blue-green", "Start a full new copy, switch the router", "Switch back: seconds", "Double capacity while both run"],
            ["Canary", "Send 1-5% to the new version, watch, widen", "Stop the canary; few users hit", "Metrics good enough to judge it"],
          ],
        },
        {
          t: "predict",
          lang: "text",
          src: "Release 42, one pipeline run:\n  1. migrate: ALTER TABLE users DROP COLUMN name;\n  2. rolling update to code that reads full_name",
          q: "What do users see during the rollout?",
          options: ["Nothing", "500s from every old instance still selecting `name`, and no way back to release 41", "A short lock, then all fine", "Errors for new users only"],
          answer: 1,
          why: "Old code serves until the rollout ends. A rollback redeploys code, not columns. Each deploy's migration must work with the code before **and** after it: the databases chapter's expand/contract, spread over several releases.",
        },
        {
          t: "steps",
          h: "Migrations in the pipeline",
          items: [
            "Build the image once and tag it with the git SHA.",
            "Run migrations as their own step, a one-off container from that image. Not at app startup, where ten replicas race for them.",
            "Only additive changes in this step: new tables, nullable columns, indexes built concurrently.",
            "Roll out the code. Old and new both work against the new schema.",
            "Drops, renames and new NOT NULLs ship in a later release, once nothing reads the old shape.",
          ],
        },
        {
          t: "pitfall",
          h: "`:latest` makes rollback a guess",
          x: "Deploy `api:latest` and you deploy whatever was pushed last, maybe a branch build. Nothing names the version you were running five minutes ago. Tag every image with its commit SHA and deploy that tag or the digest. Rollback becomes: deploy the previous SHA.",
        },
      ],
    },
    {
      title: "Logs, metrics, traces",
      beats: [
        { t: "say", x: "Production logs are JSON lines, one event each, shipped to a store you can query by field: every error on `/checkout` in the last hour, grouped by type, or every line of one request id. The rest of this section is numbers." },
        {
          t: "play",
          mode: "js",
          title: "mean vs percentiles",
          js: PERCENTILES,
          task: "Read the mean, then p99. Then give server d only 200 requests: the averaged p99 now overstates eightfold. Percentiles of parts don't combine.",
        },
        {
          t: "predict",
          lang: "text",
          src: "A page makes 20 API calls in parallel.\nIt's slow if any one call is slow.\nEach call is over p99 with probability 1%, independently.",
          q: "What share of page loads include at least one call slower than p99?",
          options: ["1%", "About 18%", "20%", "About 50%"],
          answer: 1,
          why: "1 - 0.99^20 = 0.18. The tail you shrug off as 1% is what nearly one page load in five feels. The more calls a page fans out to, the more the tail is the experience.",
        },
        {
          t: "table",
          head: ["Method", "Apply to", "Measure"],
          rows: [
            ["RED", "Every service and endpoint", "**R**ate, **E**rrors, **D**uration (a histogram, read as percentiles)"],
            ["USE", "Every resource: CPU, memory, disk, pools, queues", "**U**tilization, **S**aturation (work waiting), **E**rrors"],
          ],
          caption: "RED says users are hurting; USE says which resource is why. A DB pool with 40 waiters is saturation, and it shows up first as Duration.",
        },
        {
          t: "code",
          lang: "js",
          src: "import client from \"prom-client\";\n\nconst httpDuration = new client.Histogram({\n  name: \"http_request_duration_seconds\",\n  help: \"HTTP request duration\",\n  labelNames: [\"method\", \"route\", \"status\"],\n  buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],\n});\n\napp.use((req, res, next) => {\n  const end = httpDuration.startTimer({ method: req.method });\n  res.on(\"finish\", () => {\n    const route = req.route ? req.baseUrl + req.route.path : \"unmatched\";\n    end({ route, status: res.statusCode });\n  });\n  next();\n});\n\napp.get(\"/metrics\", async (req, res) => {\n  res.type(client.register.contentType).send(await client.register.metrics());\n});",
          mark: [13],
          note: "A histogram keeps a count per bucket. Counts add up across instances, so p99 is computed from the merged buckets, never by averaging each instance's p99.",
        },
        {
          t: "pitfall",
          h: "One label with user ids takes down metrics",
          x: "Every distinct combination of label values is its own time series. Label by `userId` or the raw path (`/users/8812`) and 50k users become 50k series per bucket per status, and the metrics store runs out of memory or budget. Labels are small, fixed sets. Ids go in logs and traces.",
        },
        {
          t: "code",
          lang: "bash",
          src: "npm install @opentelemetry/api @opentelemetry/auto-instrumentations-node\n\nexport OTEL_SERVICE_NAME=api\nexport OTEL_TRACES_EXPORTER=otlp\nexport OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318\nnode --require @opentelemetry/auto-instrumentations-node/register server.js\n\n# every hop carries the trace in one header (W3C Trace Context):\n# traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01\n#              version, trace id, parent span id, flags",
          mark: [6, 9],
          note: "A **trace** is one request across every service, as a tree of timed **spans**. OpenTelemetry patches http, Express, pg and more at load time, no code changes. ESM apps also need its loader hook.",
        },
        {
          t: "predict",
          lang: "text",
          src: "GET /orders                                   912 ms\n  pg SELECT * FROM orders WHERE user_id = $1      6 ms\n  pg SELECT * FROM items WHERE order_id = $1      4 ms\n  pg SELECT * FROM items WHERE order_id = $1      4 ms\n  ... 180 more, one after another ...\n  POST payments/quote                           140 ms",
          q: "What's the first fix?",
          options: ["A bigger database", "Batch the per-order queries: that staircase is an N+1", "Cache the payments call", "More instances"],
          answer: 1,
          why: "About 180 x 4 ms in sequence is roughly 750 of the 912 ms. A trace turns N+1 from a hunch into a staircase you can see. The payments call is next, at 140 ms.",
        },
      ],
    },
    {
      title: "Knowing first",
      beats: [
        { t: "say", x: "Page on **symptoms** users feel: error rate, latency over target, checkouts failing. Causes like CPU at 90% belong on dashboards. Alerting on causes wakes you for things that hurt nobody and stays quiet through the outage at 20% CPU." },
        {
          t: "quiz",
          q: "Which of these should wake someone at 3 a.m.?",
          options: ["CPU above 85% for 10 minutes", "Checkout 5xx rate above 2% for 5 minutes", "Disk 80% full", "A new exception type in error tracking"],
          answer: 1,
          why: "Only that one means users are failing right now. A filling disk is a ticket unless it's full within hours; a new exception is a morning task. Every page that needs no action teaches people to ignore pages.",
        },
        {
          t: "pitfall",
          h: "Your nightly job died in March",
          x: "Uptime checks ask a URL whether it's up. Nothing asks the backup job or the invoice run whether it ran. Have each job ping a heartbeat URL on success and alert when the ping *doesn't* arrive. Silence is how scheduled work fails.",
        },
        {
          t: "pitfall",
          h: "A backup you haven't restored is a hope",
          x: "In 2017 GitLab lost hours of production data with five backup and replication methods in place; none worked when needed. Restore into a scratch database on a schedule, run a row count and a known query, alert if it fails. That's the backup.",
        },
        {
          t: "mission",
          h: "Ship it properly, on your laptop",
          x: "Containerize an Express + Postgres app with Compose. Multi-stage, non-root, dependency layer cached, `docker stop` well under 10 s with an in-flight request finishing, readiness failing while it drains, JSON logs with request ids. Prove each claim with a command.",
          hint: "`time docker compose stop api` while `curl` hits a slow route. `docker compose exec api id`. Touch a source file, rebuild, and check that `npm ci` says CACHED.",
          solution: {
            lang: "dockerfile",
            src: "# syntax=docker/dockerfile:1\nFROM node:24-slim AS deps\nWORKDIR /app\nCOPY package.json package-lock.json ./\nRUN --mount=type=cache,target=/root/.npm npm ci\n\nFROM deps AS build\nCOPY . .\nRUN npm run build && npm prune --omit=dev\n\nFROM node:24-slim\nENV NODE_ENV=production\nWORKDIR /app\nCOPY --from=build /app/package.json ./\nCOPY --from=build /app/node_modules ./node_modules\nCOPY --from=build /app/dist ./dist\nUSER node\nEXPOSE 3000\nHEALTHCHECK --interval=10s --timeout=2s --retries=3 \\\n  CMD node -e \"fetch('http://127.0.0.1:3000/readyz').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))\"\nCMD [\"node\", \"dist/server.js\"]\n\n# compose: init: true, stop_grace_period: 30s\n# server: the SIGTERM handler from the PID 1 section",
          },
        },
      ],
    },
  ],
  nobodyTells: [
    "A `docker stop` that takes exactly 10 seconds is a signal bug, not a slow app. Something at PID 1 ignored SIGTERM.",
    "Tag images with the git SHA. `latest` can't tell you what's running and can't take you back.",
    "Run `docker history --no-trunc` on your own image once. Every command that built it is there, build-arg values included.",
    "Percentiles don't average. Store histograms and compute p99 from the merged buckets.",
    "Upload source maps to your error tracker for every release. Without them, every frontend error is a minified one-letter name on line 1.",
    "Let's Encrypt no longer emails you before a certificate expires. Monitor expiry yourself.",
    "Every rolling deploy runs two versions at once. Design every schema and API change to survive that.",
    "`docker compose up --wait` returns once healthchecks pass. Use it in CI before integration tests instead of `sleep 10`.",
  ],
  glossary: [
    ["namespace", "A kernel feature that gives a process its own view of PIDs, network, mounts, hostname or users."],
    ["cgroup", "A kernel control group: caps and accounts a set of processes' memory, CPU, PIDs and IO."],
    ["layer", "A read-only filesystem diff from one Dockerfile instruction; images are stacks of them."],
    ["overlayfs", "The union filesystem that merges image layers plus a writable layer into one tree."],
    ["multi-stage build", "A Dockerfile with several FROMs; the final image copies only what it needs from earlier stages."],
    ["PID 1", "The first process in a PID namespace. Gets no default signal actions and must reap orphans."],
    ["readiness check", "Asks whether an instance can take traffic now. Failing it removes the instance from routing."],
    ["liveness check", "Asks whether a process is stuck. Failing it gets the process restarted."],
    ["blue-green", "Deploy a full second copy, then switch all traffic to it; switch back to roll back."],
    ["canary", "Send a small share of traffic to a new version and widen only if its metrics hold."],
    ["p99", "The latency 99% of requests beat. Describes the tail users actually notice; means hide it."],
    ["cardinality", "The number of distinct label combinations, so time series, a metric produces."],
    ["span", "One timed operation inside a trace; spans nest into a tree across services."],
    ["ACME", "The protocol Let's Encrypt and others use to issue and renew certificates automatically."],
  ],
  explain: "Explain to a friend what happens, from the kernel up, when you run `docker stop` on a Node container started with `npm start`, and how you'd make it shut down cleanly.",
};
