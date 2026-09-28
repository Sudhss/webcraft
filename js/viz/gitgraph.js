/* A git simulator: a real little object graph (commits with parents,
 * branches and tags as pointers, HEAD) driven by typed commands, drawn as a
 * graph. Rebase really replays commits as new ones with new ids. */

import { esc } from "../md.js";

function makeRepo() {
  const commits = new Map();
  const refs = { main: null };
  const tags = {};
  let head = { branch: "main" };
  let n = 0;
  const hash = () => {
    n += 1;
    return ((n * 2654435761) >>> 0).toString(16).padStart(8, "0").slice(0, 7);
  };
  const cur = () => (head.branch ? refs[head.branch] : head.id);
  const setCur = (id) => {
    if (head.branch) refs[head.branch] = id;
    else head.id = id;
  };
  const resolve = (x) => {
    if (!x || x === "HEAD") return cur();
    const m = x.match(/^(.+?)~(\d+)$/);
    if (m) {
      let id = resolve(m[1]);
      for (let i = 0; i < Number(m[2]) && id; i += 1) id = commits.get(id).parents[0] || null;
      return id;
    }
    if (x in refs) return refs[x];
    if (x in tags) return tags[x];
    const hit = [...commits.keys()].find((id) => id.startsWith(x));
    if (hit) return hit;
    throw new Error(`unknown revision '${x}'`);
  };
  const ancestors = (id) => {
    const seen = new Set();
    const st = [id];
    while (st.length) {
      const x = st.pop();
      if (!x || seen.has(x)) continue;
      seen.add(x);
      st.push(...commits.get(x).parents);
    }
    return seen;
  };
  const mergeBase = (a, b) => {
    const A = ancestors(a);
    // Walk b's history by creation order, newest first.
    const B = [...ancestors(b)].sort((x, y) => commits.get(y).n - commits.get(x).n);
    return B.find((x) => A.has(x)) || null;
  };
  function commit(msg, parents = cur() ? [cur()] : []) {
    const id = hash();
    commits.set(id, { id, parents, msg: msg || `commit ${n}`, n });
    setCur(id);
    return id;
  }
  const api = {
    commits,
    refs,
    tags,
    get head() {
      return head;
    },
    run(line) {
      const [cmd0, ...rest] = line.trim().replace(/^git\s+/, "").split(/\s+/);
      const cmd = cmd0 === "switch" ? "checkout" : cmd0;
      const args = rest.filter((a) => !a.startsWith("-"));
      const flags = rest.filter((a) => a.startsWith("-"));
      const msgM = line.match(/-m\s+["']?([^"']+)["']?/);
      switch (cmd) {
        case "commit":
          return `[${head.branch || "detached"} ${commit(msgM?.[1])}]`;
        case "branch":
          if (!args[0]) return Object.keys(refs).map((b) => (b === head.branch ? `* ${b}` : `  ${b}`)).join("\n");
          if (flags.includes("-d") || flags.includes("-D")) {
            delete refs[args[0]];
            return `deleted branch ${args[0]}`;
          }
          refs[args[0]] = args[1] ? resolve(args[1]) : cur();
          return `created ${args[0]}`;
        case "checkout": {
          if (flags.includes("-b") || flags.includes("-c")) {
            refs[args[0]] = cur();
            head = { branch: args[0] };
            return `switched to a new branch '${args[0]}'`;
          }
          const t = args[0];
          if (t in refs) {
            head = { branch: t };
            return `switched to '${t}'`;
          }
          head = { id: resolve(t) };
          return `HEAD is now detached at ${head.id}`;
        }
        case "merge": {
          const other = resolve(args[0]);
          const mine = cur();
          if (ancestors(mine).has(other)) return "Already up to date.";
          if (!mine || ancestors(other).has(mine)) {
            setCur(other);
            return `Fast-forward to ${other}`;
          }
          const id = commit(`merge ${args[0]}`, [mine, other]);
          return `Merge made by the 'ort' strategy. [${id}]`;
        }
        case "rebase": {
          const onto = resolve(args[0]);
          const mine = cur();
          const base = mergeBase(mine, onto);
          const todo = [];
          let x = mine;
          while (x && x !== base) {
            todo.unshift(commits.get(x));
            x = commits.get(x).parents[0];
          }
          if (!todo.length) return "Current branch is up to date.";
          let tip = onto;
          for (const c of todo) {
            const id = hash();
            commits.set(id, { id, parents: [tip], msg: c.msg, n });
            tip = id;
          }
          setCur(tip);
          return `Replayed ${todo.length} commit(s) onto ${onto}: they are new commits with new ids.`;
        }
        case "reset": {
          const t = resolve(args[0] || "HEAD");
          setCur(t);
          return `HEAD is now at ${t}${flags.includes("--hard") ? " (working tree reset)" : flags.includes("--soft") ? " (changes kept staged)" : " (changes kept unstaged)"}`;
        }
        case "revert": {
          const t = resolve(args[0]);
          return `[${commit(`revert "${commits.get(t).msg}"`)}] (a new commit that undoes ${t})`;
        }
        case "tag":
          tags[args[0]] = cur();
          return `tagged ${args[0]}`;
        case "log": {
          const out = [];
          let x = cur();
          while (x) {
            const c = commits.get(x);
            out.push(`${x} ${c.msg}`);
            x = c.parents[0];
          }
          return out.join("\n") || "(no commits yet)";
        }
        default:
          throw new Error(`not in this simulator: ${cmd0}`);
      }
    },
  };
  return api;
}

export function mount(el, { setup = ["commit", "commit"] }) {
  let repo;
  const log = [];
  el.innerHTML = `<svg width="100%" style="background:var(--bg);border:1px solid var(--line);border-radius:8px;display:block"></svg>
<div class="controls" style="margin-top:10px"><span class="mono" style="color:var(--ember)">$ git</span><input type="text" style="flex:1;min-width:200px" placeholder="commit, branch feat, switch feat, merge feat, rebase main, reset --hard HEAD~1, revert HEAD, tag v1, log" spellcheck="false"><button class="btn small ghost" data-reset>reset repo</button></div>
<pre class="foot mono" style="white-space:pre-wrap;max-height:130px;overflow:auto;margin:6px 0 0"></pre>`;
  const svg = el.querySelector("svg");
  const input = el.querySelector("input");
  const out = el.querySelector("pre");
  function init() {
    repo = makeRepo();
    log.length = 0;
    for (const s of setup) {
      try {
        repo.run(s);
      } catch {
        /* ignore bad setup */
      }
    }
    log.push(`(setup: ${setup.join(" ; ")})`);
    draw();
  }
  function draw() {
    const cs = [...repo.commits.values()].sort((a, b) => a.n - b.n || 0);
    // Lane per branch, by which branch tip first reaches the commit.
    const lanes = new Map();
    const names = Object.keys(repo.refs).sort((a, b) => (a === "main" ? -1 : b === "main" ? 1 : 0));
    names.forEach((b, li) => {
      let x = repo.refs[b];
      while (x && !lanes.has(x)) {
        lanes.set(x, li);
        x = repo.commits.get(x).parents[0];
      }
    });
    let extra = names.length;
    cs.forEach((c) => {
      if (!lanes.has(c.id)) lanes.set(c.id, extra);
    });
    const used = Math.max(1, ...[...lanes.values()].map((v) => v + 1));
    const W = Math.max(640, 90 + cs.length * 74);
    const H = 70 + used * 64;
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.style.height = `${Math.min(360, H)}px`;
    const pos = new Map(cs.map((c, i) => [c.id, [60 + i * 74, 46 + lanes.get(c.id) * 64]]));
    const colors = ["#ff7a45", "#86b6ff", "#7ed69b", "#d7a8ff", "#f5c26b", "#ff6b6b"];
    let s = "";
    for (const c of cs) {
      const [x, y] = pos.get(c.id);
      c.parents.forEach((p, k) => {
        const [px, py] = pos.get(p);
        s += `<path d="M${px} ${py} C ${px + 30} ${py}, ${x - 30} ${y}, ${x} ${y}" stroke="${colors[lanes.get(c.id) % 6]}" stroke-width="3" fill="none" opacity="${k ? 0.6 : 0.9}"/>`;
      });
    }
    const reachable = new Set();
    const mark = (id) => {
      const st = [id];
      while (st.length) {
        const x = st.pop();
        if (!x || reachable.has(x)) continue;
        reachable.add(x);
        st.push(...repo.commits.get(x).parents);
      }
    };
    Object.values(repo.refs).forEach(mark);
    Object.values(repo.tags).forEach(mark);
    if (repo.head.id) mark(repo.head.id);
    for (const c of cs) {
      const [x, y] = pos.get(c.id);
      const orphan = !reachable.has(c.id);
      s += `<circle cx="${x}" cy="${y}" r="13" fill="${orphan ? "none" : colors[lanes.get(c.id) % 6]}" stroke="${colors[lanes.get(c.id) % 6]}" stroke-width="3" stroke-dasharray="${orphan ? "4 3" : "0"}"><title>${esc(c.msg)}</title></circle><text x="${x}" y="${y + 32}" text-anchor="middle" font-size="12" fill="currentColor" style="color:var(--text-3)" font-family="JetBrains Mono, monospace">${c.id}</text>`;
    }
    const labels = new Map();
    const add = (id, t) => labels.set(id, [...(labels.get(id) || []), t]);
    for (const [b, id] of Object.entries(repo.refs)) if (id) add(id, (repo.head.branch === b ? "HEAD -> " : "") + b);
    for (const [t, id] of Object.entries(repo.tags)) add(id, `tag: ${t}`);
    if (repo.head.id) add(repo.head.id, "HEAD (detached)");
    for (const [id, ls] of labels) {
      const [x, y] = pos.get(id);
      ls.forEach((t, k) => {
        s += `<text x="${x}" y="${y - 22 - k * 16}" text-anchor="middle" font-size="12.5" font-weight="600" fill="currentColor" style="color:var(--text)" font-family="JetBrains Mono, monospace">${esc(t)}</text>`;
      });
    }
    svg.innerHTML = s || `<text x="20" y="40" fill="currentColor" style="color:var(--text-3)">empty repository: type "commit"</text>`;
    out.textContent = log.slice(-8).join("\n");
    out.scrollTop = out.scrollHeight;
  }
  input.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key !== "Enter" || !input.value.trim()) return;
    const line = input.value.trim();
    input.value = "";
    try {
      log.push(`$ git ${line.replace(/^git\s+/, "")}\n${repo.run(line)}`);
    } catch (err) {
      log.push(`$ git ${line}\nerror: ${err.message}`);
    }
    draw();
  });
  el.querySelector("[data-reset]").addEventListener("click", init);
  init();
}
