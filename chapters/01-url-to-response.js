const URL_PLAY = String.raw`const tries = [
  "HTTP://Example.COM:80/a/./b/../c?q=a+b#top",
  "https://münchen.de/",
  "https://0x7f.1/admin",
  "https://example.com@evil.test/login",
  "https://x.test/a b/%2e%2e/c",
];
for (const s of tries) {
  const u = new URL(s);
  console.log(s);
  console.log("   host:", u.host, "| path:", u.pathname,
    "| q:", u.searchParams.get("q"), "| user:", u.username || "-");
}
// relative resolution, the way the browser resolves src and href
console.log(new URL("../img/logo.png", "https://cdn.test/app/v2/index.html").href);`;

const FRESH_PLAY = String.raw`// How long may a browser reuse a response without asking? (RFC 9111, simplified)
function freshness(h) {
  const cc = {};
  for (const part of (h["cache-control"] || "").split(",")) {
    const [k, v] = part.trim().toLowerCase().split("=");
    if (k) cc[k] = v === undefined ? true : Number(v);
  }
  if (cc["no-store"]) return "not stored at all";
  if (cc["no-cache"]) return "stored, but revalidated before every use";
  const date = Date.parse(h.date);
  let fresh, how;
  if (cc["max-age"] !== undefined) { fresh = cc["max-age"]; how = "max-age"; }
  else if (h.expires) { fresh = (Date.parse(h.expires) - date) / 1000; how = "Expires"; }
  else if (h["last-modified"]) {
    fresh = 0.1 * (date - Date.parse(h["last-modified"])) / 1000; // the 10% heuristic
    how = "HEURISTIC (10% of age since Last-Modified)";
  } else return "no freshness info: revalidate";
  const swr = cc["stale-while-revalidate"] || 0;
  return (fresh / 3600).toFixed(2) + " h fresh via " + how +
    (swr ? ", then " + swr + " s stale-while-revalidate" : "");
}

const date = "Mon, 28 Sep 2026 10:00:00 GMT";
const cases = {
  "old server, no headers": { date, "last-modified": "Fri, 18 Sep 2026 10:00:00 GMT" },
  "hashed asset": { date, "cache-control": "public, max-age=31536000, immutable" },
  "html": { date, "cache-control": "no-cache", etag: '"v42"' },
  "api": { date, "cache-control": "max-age=60, stale-while-revalidate=600" },
  "bank": { date, "cache-control": "private, no-store" },
};
for (const [name, h] of Object.entries(cases)) console.log(name.padEnd(24), freshness(h));`;

const PARSER = String.raw`const raw =
  "HTTP/1.1 200 OK\r\n" +
  "Content-Type: text/plain; charset=utf-8\r\n" +
  "Transfer-Encoding: chunked\r\n" +
  "Cache-Control: public, max-age=60, stale-while-revalidate=600\r\n" +
  "Set-Cookie: a=1; HttpOnly\r\n" +
  "set-cookie: b=2; Secure\r\n" +
  "ETag: \"v7\"\r\n" +
  "\r\n" +
  "7\r\nHello, \r\n" +
  "6\r\nworld.\r\n" +
  "0\r\n\r\n";

function parse(raw) {
  const end = raw.indexOf("\r\n\r\n");
  const lines = raw.slice(0, end).split("\r\n");
  const [version, code, ...reason] = lines[0].split(" ");
  const headers = new Map(); // lower-case name -> list of values
  for (const line of lines.slice(1)) {
    const i = line.indexOf(":");
    const name = line.slice(0, i).trim().toLowerCase();
    if (!headers.has(name)) headers.set(name, []);
    headers.get(name).push(line.slice(i + 1).trim());
  }
  let body = raw.slice(end + 4);
  // TODO 1: if transfer-encoding is chunked, decode it.
  //         Each chunk: <size in HEX>\r\n<data>\r\n, ending with a 0 chunk.
  // TODO 2: turn cache-control into { public: true, "max-age": 60, ... }
  return { version, status: Number(code), reason: reason.join(" "), headers, body };
}

const res = parse(raw);
console.log(res.version, res.status, res.reason);
for (const [k, v] of res.headers) console.log(k.padEnd(18), v.join(" | "));
console.log("body:", JSON.stringify(res.body));`;

export default {
  id: "url-to-response",
  n: 1,
  part: "A",
  title: "What happens when you open a URL",
  hook: "Latency is round trips, not bandwidth. Count them and you can make any page fast before touching its code.",
  minutes: 70,
  levels: ["use", "understand", "rebuild"],
  sections: [
    {
      title: "The whole trip",
      beats: [
        { t: "say", x: "Opening a URL is a chain of waits. Most are **round trips**: a packet goes out, you wait for the answer. Each one costs one RTT, and RTT is set by distance and the speed of light, not by your plan." },
        {
          t: "steps",
          h: "Keystroke to first byte",
          items: [
            "Parse the URL. Apply HSTS: `http` may silently become `https` before any packet leaves.",
            "Check caches: memory, service worker, HTTP disk cache. A fresh hit ends the trip right here.",
            "DNS: turn the hostname into an IP. 0 RTT if cached, several if not.",
            "TCP handshake: 1 RTT.",
            "TLS 1.3 handshake: 1 more RTT (TLS 1.2 needed 2).",
            "Send the request, wait for the server, get the first byte: 1 RTT + server time.",
            "Stream the body. Slow start decides how many more RTTs a big response needs.",
          ],
        },
        {
          t: "table",
          head: ["Route", "Typical RTT", "Cold HTTPS, first byte (3 RTT)"],
          rows: [
            ["Same city, wired", "2-10 ms", "6-30 ms"],
            ["Mumbai to Singapore", "~60 ms", "~180 ms"],
            ["Delhi to US East", "~220 ms", "~660 ms"],
            ["4G, any destination", "+30-80 ms on top", "adds up to ~250 ms"],
          ],
          caption: "Rough numbers. The shape is what matters: every extra round trip is paid in full, every time.",
        },
        {
          t: "predict",
          lang: "text",
          src: "Page: 40 KB of HTML + CSS + JS, all on one fresh HTTPS connection.\nUser A: 100 Mbps, 200 ms RTT\nUser B: 10 Mbps, 20 ms RTT",
          q: "Who sees the page first?",
          options: ["A, ten times the bandwidth", "B, by a lot", "About the same"],
          answer: 1,
          why: "40 KB takes 3 ms at 100 Mbps and 32 ms at 10 Mbps. Irrelevant. A pays ~4-5 RTTs of handshakes and slow start at 200 ms each; B pays them at 20 ms. Small pages are latency-bound.",
        },
        { t: "viz", name: "waterfall" },
        { t: "say", x: "Play with the waterfall above. Toggle keep-alive off and watch every request pay DNS + TCP + TLS again. Toggle the CDN and watch the handshake bars shrink, because the server you shake hands with got closer." },
      ],
    },
    {
      title: "The URL is a parser, not a string",
      beats: [
        { t: "say", x: "The browser runs the WHATWG URL parser on everything you type and every `href`. It normalises case, drops default ports, resolves `..`, encodes spaces, and converts Unicode hosts to punycode. Your regex does none of that." },
        {
          t: "play",
          mode: "js",
          title: "new URL() is the real parser",
          js: URL_PLAY,
          task: "Predict each line before running. Then find which input would fool a `startsWith('https://example.com')` allow-list.",
        },
        {
          t: "predict",
          lang: "js",
          src: "const u = new URL(\"https://s.test/?q=a+b%2Bc\");\nconsole.log(u.searchParams.get(\"q\"));\nconsole.log(decodeURIComponent(u.search.slice(3)));",
          q: "What prints?",
          options: ["`a+b+c` twice", "`a b+c` then `a+b+c`", "`a b c` then `a+b+c`", "`a b+c` twice"],
          answer: 1,
          why: "`URLSearchParams` uses form encoding, where `+` means space and `%2B` is a literal plus. `decodeURIComponent` leaves `+` alone. Mix the two and search terms with a plus sign silently change.",
        },
        {
          t: "pitfall",
          h: "Never validate URLs with string checks",
          x: "`https://example.com@evil.test` is a login to evil.test with username `example.com`. `https://0x7f.1` is 127.0.0.1. SSRF filters built on regex fall to both. Parse with `new URL`, then check `hostname` against an exact allow-list, after DNS if it matters.",
        },
        {
          t: "pitfall",
          h: "The first visit to http:// is plaintext",
          x: "HSTS only kicks in after the browser has seen the header once, so a first visit via an `http://` link can be intercepted. Get on the preload list to close that gap. DevTools shows an HSTS upgrade as a fake `307 Internal Redirect` that never touched the network.",
        },
        {
          t: "quiz",
          q: "You put an auth token in the URL fragment: `/app#token=abc`. Where does it go?",
          options: ["To the server on every request", "Nowhere outside the browser: fragments are never sent", "Only to the CDN", "Into the Referer header of the next page"],
          answer: 1,
          why: "The fragment never leaves the browser, not in the request line and not in `Referer`. That's why OAuth's implicit flow used it. It still lands in history and in any script on the page, so it isn't a vault.",
        },
      ],
    },
    {
      title: "DNS: the lookup nobody measures",
      beats: [
        { t: "say", x: "DNS is a distributed cache with a timer on every entry. The timer is the **TTL**. Most lookups are answered by a cache a few milliseconds away; a full miss walks the tree and can cost hundreds." },
        {
          t: "viz",
          name: "frames",
          props: {
            cols: ["Browser", "OS stub resolver", "Recursive resolver", "Authoritative servers"],
            frames: [
              { cells: [["lookup app.shop.test", "host cache: miss"], [], [], []], note: "The browser has its own host cache. Miss." },
              { cells: [["waiting"], ["OS cache: miss", "hosts file: no"], [], []], note: "The OS resolver checks its cache and the hosts file. Miss again." },
              { cells: [["waiting"], ["forwarding"], ["cache: miss", "ask root"], ["root: .test is at ns.tld"]], note: "The recursive resolver (ISP, 1.1.1.1, 8.8.8.8) starts at the root. It usually has root and TLD answers cached for days." },
              { cells: [["waiting"], ["forwarding"], ["ask .test TLD"], ["TLD: shop.test NS is ns1.dnshost.test"]], note: "The TLD server doesn't know the IP. It knows who does." },
              { cells: [["waiting"], ["forwarding"], ["ask ns1.dnshost.test"], ["A 203.0.113.7 TTL 300"]], note: "The authoritative server answers, with a TTL of 300 s." },
              { cells: [["connect 203.0.113.7"], ["cache 300 s"], ["cache 300 s"], []], note: "Every layer caches it. The next lookup from anyone on that resolver costs one short hop." },
            ],
          },
        },
        {
          t: "table",
          head: ["Layer", "How long it keeps an answer", "How to clear it"],
          rows: [
            ["Browser host cache", "TTL, or about a minute when it used the OS resolver", "chrome://net-internals/#dns"],
            ["OS cache", "The TTL", "`ipconfig /flushdns`, `resolvectl flush-caches`"],
            ["Recursive resolver", "The TTL, sometimes clamped to a min or max", "You can't. You wait."],
            ["Negative answers (NXDOMAIN)", "The zone's SOA negative TTL, often 1 h or more", "You can't. You wait."],
          ],
        },
        {
          t: "predict",
          lang: "text",
          src: "A record: shop.test -> 198.51.100.1, TTL 86400 (1 day)\n10:00  you change the TTL to 60 and the IP to 203.0.113.7",
          q: "When is every user on the new IP?",
          options: ["10:01, the TTL is now 60 s", "Up to 10:00 tomorrow", "Instantly, DNS is pushed", "Never without a flush"],
          answer: 1,
          why: "Resolvers that cached the old record kept its old TTL: they won't ask again for up to a day. Lower the TTL, **wait one old TTL**, then change the IP. Keep the old server alive until the tail dies down.",
        },
        {
          t: "pitfall",
          h: "Looking a name up before it exists caches the miss",
          x: "You test `api.shop.test` before creating it. The resolver caches NXDOMAIN for the SOA's negative TTL. You add the record, and it still doesn't resolve for an hour, only for you and whoever shares your resolver. Everyone else sees it at once, which makes it maddening to debug.",
        },
        { t: "say", x: "Two more DNS facts that bite. A CNAME can't live at the zone apex (`shop.test` itself), which is why DNS hosts invent ALIAS or flattening. And the newer **HTTPS** record can tell a browser a host speaks HTTP/3 before it ever connects." },
        {
          t: "quiz",
          q: "You add `<link rel=\"dns-prefetch\" href=\"//fonts.cdn.test\">`. What did you save?",
          options: ["The DNS lookup only, maybe 20-120 ms on a miss", "DNS, TCP and TLS", "The whole font download", "Nothing, browsers ignore it"],
          answer: 0,
          why: "`dns-prefetch` only resolves the name. `preconnect` also does TCP and TLS, saving 2 more RTTs, but holds a socket open, so spend it on the one or two origins you're sure to hit in the first seconds.",
        },
      ],
    },
    {
      title: "TCP: handshakes and slow start",
      beats: [
        {
          t: "viz",
          name: "frames",
          props: {
            cols: ["Client", "On the wire", "Server"],
            frames: [
              { cells: [["have IP 203.0.113.7"], [], ["listening :443"]], note: "t = 0. We have an address. Nothing is connected." },
              { cells: [["SYN_SENT"], ["SYN ->"], []], note: "TCP opens with a SYN carrying the client's initial sequence number." },
              { cells: [["SYN_SENT"], ["<- SYN-ACK"], ["SYN_RCVD"]], note: "The server answers. One full RTT has passed and zero bytes of HTTP have moved." },
              { cells: [["ESTABLISHED", "ClientHello + key share"], ["ACK ->", "ClientHello ->"], []], note: "The ACK rides with TLS's ClientHello. TLS 1.3 guesses the key exchange (X25519) and sends its public key up front." },
              { cells: [["derive keys"], ["<- ServerHello + key share", "<- {cert, verify, Finished}"], ["derive keys"]], note: "Braces mean encrypted. The cert chain rides in this flight, so its size competes with the initial congestion window." },
              { cells: [["{Finished}", "{GET /}"], ["{Finished} ->", "{GET /} ->"], []], note: "Two RTTs in, the request leaves. TLS 1.2 needed one more round trip before this point." },
              { cells: [["first byte"], ["<- {200 OK, first 14 KB}"], ["handler: 40 ms"]], note: "Three RTTs plus server time. That is TTFB on a cold HTTPS connection over TCP." },
            ],
          },
        },
        { t: "say", h: "Slow start", x: "A new TCP connection doesn't know the path's capacity, so it starts with a **congestion window** of 10 segments (about 14.6 KB) and roughly doubles it every RTT with no loss. Bandwidth is unlocked a round trip at a time." },
        {
          t: "predict",
          lang: "text",
          src: "Fresh connection, handshake done.\ninitcwnd = 10 segments x 1460 B, doubling each RTT, no loss.\nResponse: 90 KB of HTML.",
          q: "How many round trips to deliver the whole response?",
          options: ["1", "2", "3", "7"],
          answer: 2,
          why: "Cumulative delivery: 14.6 KB after 1 RTT, 43.8 KB after 2, 102 KB after 3. So 90 KB needs 3. Squeeze the critical HTML under ~14 KB and the first paint can start one round trip after the request.",
        },
        {
          t: "pitfall",
          h: "Your certificate chain eats the first window",
          x: "The server's first flight carries the cert chain. A fat RSA chain with an extra intermediate can be 5-7 KB, and if the flight overflows the initial window, the handshake waits a full extra RTT for ACKs. Use ECDSA certs, send only the needed intermediates, never the root.",
        },
        {
          t: "code",
          lang: "html",
          src: "<!-- open the connection while the HTML is still parsing -->\n<link rel=\"preconnect\" href=\"https://api.shop.test\">\n\n<!-- fonts are fetched in CORS mode: without crossorigin this\n     warms a socket the font request is not allowed to use -->\n<link rel=\"preconnect\" href=\"https://fonts.cdn.test\" crossorigin>",
          mark: [6],
          note: "Browsers keep separate socket pools for credentialed and anonymous requests. A preconnect in the wrong mode is a wasted handshake.",
        },
        {
          t: "quiz",
          q: "Why does a keep-alive connection make the 5th request much faster than a brand new connection would?",
          options: ["The server caches the response", "No handshake, and the congestion window has already grown", "Keep-alive compresses headers", "The DNS answer is reused"],
          answer: 1,
          why: "A warm connection skips 2 RTTs of handshakes **and** keeps its grown congestion window, so big responses stream at full speed at once. This is the real reason fewer, reused connections beat many fresh ones.",
        },
      ],
    },
    {
      title: "TLS 1.3 and the 0-RTT trap",
      beats: [
        {
          t: "table",
          head: ["Setup", "RTTs before the request leaves", "First byte (80 ms RTT, 40 ms server)"],
          rows: [
            ["TCP + TLS 1.2", "3", "360 ms"],
            ["TCP + TLS 1.3", "2", "280 ms"],
            ["TCP + TLS 1.3 0-RTT resume", "1", "200 ms"],
            ["QUIC (HTTP/3), first visit", "1", "200 ms"],
            ["QUIC 0-RTT resume", "0", "120 ms"],
            ["Warm keep-alive connection", "0", "120 ms"],
          ],
          caption: "The last row is the one you control most cheaply: reuse connections.",
        },
        {
          t: "predict",
          lang: "text",
          src: "Returning visitor, TLS 1.3 session ticket saved.\nClient sends ClientHello + early data: POST /api/transfer {amount: 500}\nAn attacker on the network records the packets and sends them again.",
          q: "What can happen?",
          options: ["Nothing, TLS 1.3 prevents replay", "The server may process the transfer twice", "The attacker can read the amount", "The second copy is rejected by TCP"],
          answer: 1,
          why: "0-RTT early data is encrypted but **replayable**: it arrives before the handshake proves freshness. Only safe, idempotent requests belong in it. Servers can answer `425 Too Early` to make the client resend after the handshake.",
        },
        {
          t: "pitfall",
          h: "0-RTT is on by default at many CDNs",
          x: "If your CDN accepts early data, a replayed GET can still trigger side effects: `GET /unsubscribe?id=...`, `GET /like`. Keep GETs side-effect free, or check the `Early-Data: 1` header the edge adds and reject with 425 on anything that mutates.",
        },
        { t: "say", x: "Resumption is also why your second visit to a site is faster than the first even with an empty HTTP cache: the TLS ticket survives, and so does the DNS entry, and maybe the connection itself." },
      ],
    },
    {
      title: "HTTP/1.1, HTTP/2, HTTP/3",
      beats: [
        {
          t: "table",
          head: ["", "HTTP/1.1", "HTTP/2", "HTTP/3"],
          rows: [
            ["Transport", "TCP", "TCP", "QUIC over UDP"],
            ["In flight per connection", "1 request at a time", "Many streams", "Many streams"],
            ["Head-of-line blocking", "Whole connection", "TCP level: one loss stalls all streams", "Only the stream that lost the packet"],
            ["Header compression", "None, headers resent in full", "HPACK", "QPACK"],
            ["Connections per origin", "6 in Chrome", "1", "1"],
            ["Survives Wi-Fi to 4G", "No", "No", "Yes, connection IDs"],
            ["How the browser learns it", "Default", "ALPN inside the TLS handshake", "`Alt-Svc` header or HTTPS DNS record"],
          ],
        },
        { t: "say", x: "HTTP/1.1 keep-alive reuses a connection but still sends one request, waits for its whole response, then the next. Pipelining tried to fix that and died on buggy proxies. So browsers open **6 connections per host** and queue the rest." },
        {
          t: "viz",
          name: "frames",
          props: {
            cols: ["Streams waiting", "TCP receive buffer", "Delivered to HTTP/2"],
            frames: [
              { cells: [["css", "js", "img"], ["pkt1 css", "pkt2 js", "pkt3 img"], []], note: "Three streams are multiplexed on one TCP connection. Packets interleave." },
              { cells: [["css", "js", "img"], ["pkt1 css", "LOST", "pkt3 img", "pkt4 css"], ["pkt1 css"]], note: "Packet 2 is lost. TCP delivers bytes strictly in order." },
              { cells: [["css", "js", "img"], ["LOST", "pkt3 img", "pkt4 css", "pkt5 img"], ["pkt1 css"]], note: "Packets 3-5 arrived but sit in the kernel. CSS and the image are stalled by a JS packet. That is TCP head-of-line blocking." },
              { cells: [["css", "js", "img"], [], ["pkt1 css", "pkt2 js", "pkt3 img", "pkt4 css", "pkt5 img"]], note: "One RTT or more later the retransmit lands and everything flushes at once. QUIC would have delivered 3-5 immediately." },
            ],
          },
        },
        {
          t: "predict",
          lang: "text",
          src: "60 small files from one host. The network drops 2% of packets.\n(a) HTTP/1.1 on 6 connections\n(b) HTTP/2 on 1 connection\n(c) HTTP/3 on 1 connection",
          q: "Which usually suffers most from the loss?",
          options: ["(a), it has no multiplexing", "(b)", "(c), UDP is unreliable", "All the same"],
          answer: 1,
          why: "HTTP/2 puts everything on one TCP connection: a loss stalls every stream and halves the only congestion window. Six HTTP/1.1 connections lose one sixth. QUIC recovers per stream. On clean networks HTTP/2 wins; on bad ones it can lose.",
        },
        {
          t: "pitfall",
          h: "HTTP/1 hacks are HTTP/2 slowdowns",
          x: "Domain sharding (`img1.`, `img2.` hosts) forces extra DNS, TCP and TLS, and splits one congestion window into many cold ones. Spriting and giant bundles bust caching on every change. On HTTP/2 and 3, fewer origins and moderately sized, separately cacheable files win.",
        },
        { t: "say", h: "Connection coalescing", x: "If `a.shop.test` and `b.shop.test` resolve to the same IP and one certificate covers both, the browser sends both over the **same** HTTP/2 connection. A server that doesn't want this answers `421 Misdirected Request`." },
        {
          t: "pitfall",
          h: "Server Push is dead. Use 103 Early Hints",
          x: "Chrome removed HTTP/2 Server Push in 2022: it pushed bytes the browser already had cached. The replacement is `103 Early Hints`: while your server builds the HTML, send a 103 with `Link: </app.css>; rel=preload` and the browser starts fetching during your think time.",
        },
        {
          t: "quiz",
          q: "Your CDN serves HTTP/3. DevTools shows `h2` for the first page load and `h3` for later ones. Bug?",
          options: ["Yes, the CDN is misconfigured", "No: the browser learned about h3 from the first response's Alt-Svc header", "No: h3 only works for images", "Yes, QUIC needs a service worker"],
          answer: 1,
          why: "With no HTTPS DNS record, the browser can only discover h3 from an `Alt-Svc: h3=\":443\"` header on a response. It also races QUIC against TCP and falls back when UDP is blocked, as it is on many corporate networks.",
        },
      ],
    },
    {
      title: "Anatomy of a response",
      beats: [
        {
          t: "code",
          lang: "http",
          src: "GET /products?page=2 HTTP/1.1\nHost: shop.test\nAccept-Encoding: gzip, br, zstd\nIf-None-Match: \"v41\"\nCookie: sid=9f2c\n\nHTTP/1.1 200 OK\nContent-Type: text/html; charset=utf-8\nContent-Encoding: br\nCache-Control: no-cache\nETag: \"v42\"\nVary: Accept-Encoding\nContent-Length: 18244",
          mark: [4, 12],
          note: "The ETag changed from v41 to v42, so a full 200. `Vary` says the cache key includes the encoding, so a gzip client never gets br bytes.",
        },
        {
          t: "table",
          head: ["Code", "Means", "The part people miss"],
          rows: [
            ["301", "Moved permanently", "Cached by browsers for a long time. Old clients may turn POST into GET"],
            ["308", "Permanent, keep the method", "Use it for APIs: the POST stays a POST, body and all"],
            ["303", "See other", "The honest \"now GET this\" after a form POST"],
            ["307", "Temporary, keep the method", "Also what DevTools shows for an internal HSTS upgrade"],
            ["304", "Not modified", "No body, but still a full round trip. Cheap, not free"],
            ["421", "Misdirected request", "\"Don't send this host over that coalesced connection\""],
            ["425", "Too early", "Rejects replayable 0-RTT data; the client retries after the handshake"],
            ["429", "Too many requests", "Send `Retry-After`. Clients should back off with jitter"],
          ],
        },
        {
          t: "pitfall",
          h: "A wrong 301 lives in users' browsers",
          x: "Browsers cache 301s aggressively, often until the user clears the cache, and you can't reach in and undo it. When shipping a new redirect, use 302/307 or a 301 with `Cache-Control: max-age=3600` until you're sure, then make it permanent.",
        },
        {
          t: "predict",
          lang: "http",
          src: "Response to GET /logo.png:\nCache-Control: public, max-age=86400\nVary: User-Agent",
          q: "What does this do to your CDN?",
          options: ["Nothing, Vary is only for browsers", "Splits the cache into one copy per distinct User-Agent string: hit rate collapses", "Makes the CDN compress per browser", "Forces revalidation each time"],
          answer: 1,
          why: "Vary adds request headers to the cache key. There are thousands of distinct User-Agent strings, so every hit becomes a miss. Vary on low-cardinality headers only (`Accept-Encoding`), or normalise at the edge.",
        },
        { t: "say", x: "`Transfer-Encoding: chunked` is how HTTP/1.1 streams a body of unknown length: each chunk is a hex size, CRLF, bytes, CRLF. HTTP/2 and 3 forbid it; their frames already carry lengths. Header names are lower-case on the wire there too." },
        {
          t: "rebuild",
          h: "Rebuild: an HTTP response parser",
          x: "The starter parses the status line and headers (note the two `Set-Cookie` lines, which must never be joined with commas). Finish chunked decoding and a `Cache-Control` parser.",
          mode: "js",
          js: PARSER,
          task: "Decode the chunked body to \"Hello, world.\" Chunk sizes count bytes, not JS string units: what breaks if a chunk contains \"é\"?",
        },
      ],
    },
    {
      title: "Caching, for real",
      beats: [
        { t: "say", x: "The fastest request is the one you never send. A browser reuses a response in one of two ways: **fresh**, with no request at all, or **revalidated**, with a conditional request that may come back as a tiny `304`." },
        {
          t: "table",
          head: ["Directive", "Meaning", "Use it for"],
          rows: [
            ["`max-age=N`", "Fresh for N seconds: no request at all", "Anything with a version or hash in its URL"],
            ["`s-maxage=N`", "Overrides max-age for shared caches (CDNs)", "HTML the CDN may hold but browsers shouldn't"],
            ["`no-cache`", "Store it, but revalidate before every use", "HTML, so deploys show up at once"],
            ["`no-store`", "Never write it anywhere", "Bank statements, one-time tokens"],
            ["`private`", "Browser cache only, never CDNs", "Anything containing one user's data"],
            ["`immutable`", "Don't revalidate, even on reload", "Hashed assets: `app.3f9a1c.js`"],
            ["`stale-while-revalidate=N`", "After expiry, serve stale for N s while refetching", "Data where a minute-old answer is fine"],
            ["`must-revalidate`", "Once stale, never serve stale, even offline", "Rare: things that must never be wrong"],
          ],
        },
        {
          t: "predict",
          lang: "http",
          src: "HTTP/1.1 200 OK\nDate: Mon, 28 Sep 2026 10:00:00 GMT\nLast-Modified: Fri, 18 Sep 2026 10:00:00 GMT\nContent-Type: application/javascript\n(no Cache-Control, no Expires)",
          q: "You deploy a fix an hour later. How long can a returning visitor keep running the old file without sending a single request?",
          options: ["0, no Cache-Control means no caching", "About a day", "10 days", "Until they close the tab"],
          answer: 1,
          why: "With no explicit freshness, browsers apply the heuristic from the spec: 10% of the time since `Last-Modified`. 10 days old gives about 1 day fresh. This is behind half of all \"my deploy isn't showing\" tickets.",
        },
        {
          t: "play",
          mode: "js",
          title: "freshness calculator",
          js: FRESH_PLAY,
          task: "Add `s-maxage` for a CDN view, and make `Age` (seconds already spent in a CDN) reduce the browser's remaining freshness.",
        },
        {
          t: "compare",
          a: { label: "One rule for everything", lang: "text", src: "/index.html          Cache-Control: max-age=3600\n/app.js              Cache-Control: max-age=3600" },
          b: { label: "Hash the assets, revalidate the HTML", lang: "text", src: "/index.html                Cache-Control: no-cache\n/assets/app.3f9a1c.js      Cache-Control: max-age=31536000, immutable" },
          x: "Left: for an hour users mix new HTML with old JS, or the reverse. Right: HTML is checked every time (a cheap 304), and an asset's URL changes whenever its bytes do, so it can be cached forever.",
        },
        {
          t: "pitfall",
          h: "Don't delete last deploy's assets",
          x: "A user with a tab open from yesterday clicks a route that lazy-loads `chunk.a1b2.js`. You deleted it in today's deploy: `ChunkLoadError`, blank screen. Keep old hashed files around for days. Hashed assets are append-only by design.",
        },
        {
          t: "steps",
          h: "Where a response can come from, in order",
          items: [
            "Memory cache inside the renderer: the same document already loaded this URL (a preload, a repeated image).",
            "The service worker's `fetch` handler, if one controls the page. It can answer from Cache Storage or call `fetch()`.",
            "The HTTP disk cache, keyed by URL **and** top-level site. Fresh: use it. Stale with an ETag: send `If-None-Match`.",
            "The CDN edge near the user. A hit costs one short RTT.",
            "The origin. The only layer that knows the truth, and the slowest.",
          ],
        },
        {
          t: "predict",
          lang: "http",
          src: "Cache-Control: max-age=60, stale-while-revalidate=600\n\nFirst fetch at t = 0. Revalidation always succeeds.\nThe user requests it again at t = 30 s, t = 650 s and t = 1200 s.",
          q: "What happens at each request?",
          options: ["cache, stale + background refresh, blocking network fetch", "cache, blocking fetch, blocking fetch", "cache, stale + background refresh, stale + background refresh", "cache every time"],
          answer: 2,
          why: "At 650 the entry is stale but inside 60 + 600: served instantly, refreshed behind the scenes. That refresh resets its age, so at 1200 it's only 550 s old: stale again but still in the window.",
        },
        {
          t: "pitfall",
          h: "ETags that differ per server",
          x: "Some servers build ETags from the file's inode and mtime. Behind a load balancer, each machine gives the same file a different ETag, so `If-None-Match` misses half the time and you pay full 200s. Generate ETags from content hashes, or drop them for hashed assets.",
        },
        {
          t: "quiz",
          q: "A popular CDN URL for a library is cached from site A. The user then visits site B, which loads the exact same URL. Cache hit?",
          options: ["Yes, same URL, same cache entry", "No: browsers partition the HTTP cache by top-level site", "Only in Chrome", "Only if both sites send CORS headers"],
          answer: 1,
          why: "Since 2020 every major browser keys the cache by the top-level site as well, to stop sites probing each other's cache. The \"everyone already has jQuery cached\" argument for public CDNs is dead. Self-host.",
        },
        {
          t: "pitfall",
          h: "Your service worker can cache a stale copy",
          x: "A service worker's `fetch()` goes through the HTTP cache like any request. If `app.js` has `max-age=3600`, your precache step may store the old copy from disk and serve it forever. Precache hashed URLs, or fetch with `{ cache: 'reload' }`.",
        },
        { t: "say", h: "What reload really does", x: "A normal reload revalidates the page itself but reuses fresh subresources. A hard reload (Ctrl+Shift+R) bypasses the cache for everything. DevTools \"Disable cache\" works only while DevTools is open, which is why bugs vanish when you look." },
      ],
    },
    {
      title: "Cookies and the edge",
      beats: [
        {
          t: "code",
          lang: "http",
          src: "Set-Cookie: __Host-sid=9f2c41; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=1209600",
          note: "`__Host-` makes the browser reject the cookie unless it's Secure, Path=/ and has no Domain, so a sibling subdomain can't overwrite it.",
        },
        {
          t: "table",
          head: ["Attribute", "Stops"],
          rows: [
            ["`HttpOnly`", "Page scripts reading it: an XSS can use your session, but can't take it away"],
            ["`Secure`", "Sending it over plain http"],
            ["`SameSite=Lax`", "Sending it on cross-site subrequests and POSTs. Chrome's default when unset"],
            ["No `Domain`", "Sending it to subdomains. Setting `Domain` widens scope, it never narrows it"],
          ],
        },
        {
          t: "predict",
          lang: "html",
          src: "<!-- on https://evil.test, visitor is logged in to bank.test -->\n<!-- bank cookie: sid=1; Secure; HttpOnly; SameSite=Lax  -->\n<img src=\"https://bank.test/avatar.png\">\n<form method=\"post\" action=\"https://bank.test/pay\"> ... </form>\n<a href=\"https://bank.test/\">open bank</a>",
          q: "Which requests carry the cookie?",
          options: ["All three", "Only the form POST", "Only the link click", "None"],
          answer: 2,
          why: "Lax sends the cookie on top-level GET navigations only. The image is a cross-site subrequest, the POST is not a safe method. Note: SameSite is about **sites**, so `evil.bank.test` counts as same-site and gets no protection.",
        },
        {
          t: "pitfall",
          h: "Set-Cookie on a cacheable response",
          x: "Log in, and the homepage response carries `Set-Cookie: sid=...` with `Cache-Control: public, max-age=300`. Depending on config, a CDN refuses to cache it, strips the cookie, or caches it and hands your session to the next visitors. Personal responses get `private`, always.",
        },
        { t: "say", h: "The edge", x: "A CDN is a few hundred data centres near users. Even for uncacheable API calls it helps: TLS terminates at the edge, so the three handshake RTTs are short, and the edge talks to your origin over warm, pooled connections." },
        {
          t: "quiz",
          q: "Every API response is `private, no-store`. Can a CDN in front of the API cut latency for users 200 ms away from your origin?",
          options: ["No, nothing is cacheable", "Yes: handshakes happen over a short RTT to the edge, then one long RTT on a warm connection", "Only for GET requests", "Only with HTTP/3"],
          answer: 1,
          why: "Cold: 3 x 200 ms = 600 ms before the first byte. Via an edge 15 ms away: 2 x 15 ms of handshakes plus one 200 ms trip on an already-open, already-wide connection. Caching is only half of what a CDN does.",
        },
        {
          t: "mission",
          h: "Audit a page you use every day",
          x: "Open DevTools Network, add the Protocol column, reload. For the document and three assets, read the Timing tab (DNS, connection, SSL, waiting) and the response headers. Find one asset that should be hashed and `immutable` but isn't, and one wasted origin.",
          hint: "Reload twice. The Size column shows \"(memory cache)\", \"(disk cache)\" or a byte count; a 304 shows the status. Right-click the column headers to add Protocol and Remote Address.",
        },
        {
          t: "mission",
          h: "Write the headers for a real deploy",
          x: "For a Vite app on a CDN, write the Cache-Control for `index.html`, `/assets/*`, `/api/me`, `/api/products` and `/robots.txt`. For each, say what happens in the minute after a deploy, and after a rollback.",
          hint: "Rollback is the hard case: the old HTML must still find old assets, and the CDN must not keep serving new HTML. Think about `s-maxage` plus a purge on deploy.",
          solution: {
            lang: "text",
            src: "index.html      no-cache                      (+ s-maxage=60 and purge on deploy)\n/assets/*       public, max-age=31536000, immutable\n/api/me         private, no-cache\n/api/products   public, max-age=30, stale-while-revalidate=300\n/robots.txt     public, max-age=3600",
          },
        },
      ],
    },
  ],
  nobodyTells: [
    "Count round trips before you count kilobytes. A 3 KB request on a cold connection 200 ms away takes 600 ms; the bytes are rounding error.",
    "The first 14 KB of your HTML arrive in one round trip. Put the critical CSS and the above-the-fold markup there.",
    "Lower a DNS TTL one full old-TTL before a migration, not the day of it.",
    "Keep old hashed assets for days after every deploy. Open tabs and cached HTML still point at them.",
    "A missing Cache-Control is not \"no caching\". It's heuristic caching, usually 10% of the file's age.",
    "Bugs that vanish when DevTools is open often live in the cache: \"Disable cache\" only applies while it's open.",
    "Preconnect for fonts needs `crossorigin`, or you paid for a handshake nobody can use.",
    "`GET` must be safe to replay: prefetchers, crawlers, 0-RTT and retrying proxies will all replay it.",
  ],
  glossary: [
    ["RTT", "Round-trip time: a packet there and the answer back. The unit latency is really paid in."],
    ["TTL", "How many seconds a DNS answer (or a packet, in IP) may live before it must be refetched."],
    ["congestion window", "How many bytes TCP may have unacknowledged in flight. Starts near 14.6 KB, grows each RTT."],
    ["head-of-line blocking", "One stuck item delays everything queued behind it: a slow response in HTTP/1.1, a lost packet in TCP."],
    ["ALPN", "TLS extension where client and server agree on h2 or http/1.1 during the handshake."],
    ["Alt-Svc", "Response header advertising the same origin on another protocol, like h3 on UDP 443."],
    ["0-RTT", "Sending request data in the first flight of a resumed TLS 1.3 or QUIC connection. Fast and replayable."],
    ["ETag", "An opaque version tag for a response. Sent back as If-None-Match to get a 304."],
    ["stale-while-revalidate", "Serve an expired response instantly while fetching a fresh one in the background."],
    ["HSTS", "A header telling the browser to only ever use https for this host, for max-age seconds."],
  ],
  explain: "Explain to a friend why a page on a 1 Gbps connection can load slower than one on 10 Mbps, and what caching and CDNs do about it.",
};
