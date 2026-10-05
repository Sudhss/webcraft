/* Playgrounds: an editor (a textarea over highlighted code) and a sandboxed
 * iframe that reruns on every edit. Modes: html, js, react, three, glsl,
 * node (read-only server code). Console output is piped back to the page. */

import { highlight } from "./highlight.js";
import { esc } from "./md.js";
import { store } from "./store.js";

const CDN = {
  react: "https://cdn.jsdelivr.net/npm/react@18.3.1/umd/react.development.js",
  reactDom: "https://cdn.jsdelivr.net/npm/react-dom@18.3.1/umd/react-dom.development.js",
  babel: "https://cdn.jsdelivr.net/npm/@babel/standalone@7.24.7/babel.min.js",
  three: "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",
  threeAddons: "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/",
};

const TABS = {
  html: ["html", "css", "js"],
  js: ["js"],
  react: ["js", "css"],
  three: ["js", "css"],
  glsl: ["glsl"],
  node: ["js"],
};
const LANG = { html: "html", css: "css", js: "js", glsl: "glsl" };

let seq = 0;
const listeners = new Map();
addEventListener("message", (e) => {
  const d = e.data;
  if (d && d.__pg && listeners.has(d.__pg)) listeners.get(d.__pg)(d);
});

function bridge(id) {
  return `<script>(function(){
var ID=${JSON.stringify(id)};
function fmt(v,d){d=d||0;try{
if(v instanceof Error)return v.stack||String(v);
if(typeof v==="string")return d?JSON.stringify(v):v;
if(typeof v==="function")return "[Function "+(v.name||"anonymous")+"]";
if(typeof v==="symbol"||typeof v==="bigint")return String(v)+(typeof v==="bigint"?"n":"");
if(v===null||typeof v!=="object")return String(v);
if(d>3)return "[...]";
if(v instanceof Map)return "Map("+v.size+") {"+[...v].map(function(p){return fmt(p[0],d+1)+" => "+fmt(p[1],d+1)}).join(", ")+"}";
if(v instanceof Set)return "Set("+v.size+") {"+[...v].map(function(x){return fmt(x,d+1)}).join(", ")+"}";
if(Array.isArray(v))return "["+v.map(function(x){return fmt(x,d+1)}).join(", ")+"]";
if(typeof Node!=="undefined"&&v instanceof Node)return "<"+(v.nodeName||"node").toLowerCase()+">";
if(v instanceof Promise)return "Promise {...}";
var ks=Object.keys(v);return (v.constructor&&v.constructor!==Object?v.constructor.name+" ":"")+"{"+ks.slice(0,20).map(function(k){return k+": "+fmt(v[k],d+1)}).join(", ")+(ks.length>20?", ...":"")+"}";
}catch(e){return String(v)}}
function send(t,a){try{parent.postMessage({__pg:ID,type:t,text:[].map.call(a,function(x){return fmt(x)}).join(" ")},"*")}catch(e){}}
["log","info","warn","error","debug"].forEach(function(k){var o=console[k];console[k]=function(){send(k,arguments);o&&o.apply(console,arguments)}});
console.table=function(t){send("log",[t])};
addEventListener("error",function(e){send("error",[(e.message||"Error")+(e.lineno?" (line "+e.lineno+")":"")])});
addEventListener("unhandledrejection",function(e){var r=e.reason;send("error",["Uncaught (in promise) "+(r&&r.stack?r.stack:r)])});
})();<\/script>`;
}

function glslPage(src, id) {
  // The injected uniforms come before the user's code, so they need a float
  // precision of their own; repeating the statement is legal in GLSL ES.
  const need = ["precision highp float;"];
  if (!/uniform\s+float\s+uTime/.test(src)) need.push("uniform float uTime;");
  if (!/uniform\s+vec2\s+uRes/.test(src)) need.push("uniform vec2 uRes;");
  if (!/uniform\s+vec2\s+uMouse/.test(src)) need.push("uniform vec2 uMouse;");
  const pre = need.join("\n");
  const lines = need.length;
  return `<!doctype html><html><head><meta charset="utf-8">${bridge(id)}<style>html,body{margin:0;height:100%;background:#000;overflow:hidden}canvas{width:100%;height:100%;display:block}</style></head><body><canvas id="c"></canvas><script>
var c=document.getElementById("c"),gl=c.getContext("webgl");
var fs=${JSON.stringify(pre + "\n" + src)};
var vs="attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";
function sh(t,s){var o=gl.createShader(t);gl.shaderSource(o,s);gl.compileShader(o);if(!gl.getShaderParameter(o,gl.COMPILE_STATUS)){var log=gl.getShaderInfoLog(o).replace(/ERROR: 0:(\\d+)/g,function(m,n){return "line "+(n-${lines + 1})});console.error(log);return null}return o}
var v=sh(gl.VERTEX_SHADER,vs),f=sh(gl.FRAGMENT_SHADER,fs);
if(v&&f){var pr=gl.createProgram();gl.attachShader(pr,v);gl.attachShader(pr,f);gl.linkProgram(pr);gl.useProgram(pr);
var b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
var a=gl.getAttribLocation(pr,"p");gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,2,gl.FLOAT,false,0,0);
var uT=gl.getUniformLocation(pr,"uTime"),uR=gl.getUniformLocation(pr,"uRes"),uM=gl.getUniformLocation(pr,"uMouse"),m=[.5,.5],t0=performance.now();
addEventListener("pointermove",function(e){m=[e.clientX/innerWidth,1-e.clientY/innerHeight]});
(function fr(){var d=Math.min(devicePixelRatio,2),w=c.clientWidth*d|0,h=c.clientHeight*d|0;if(c.width!==w||c.height!==h){c.width=w;c.height=h}gl.viewport(0,0,w,h);gl.uniform1f(uT,(performance.now()-t0)/1000);gl.uniform2f(uR,w,h);gl.uniform2f(uM,m[0],m[1]);gl.drawArrays(gl.TRIANGLES,0,3);requestAnimationFrame(fr)})();}
<\/script></body></html>`;
}

function page(mode, f, id) {
  const base = `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${bridge(id)}<style>body{font-family:system-ui,-apple-system,sans-serif;margin:16px;color:#1d1b18}</style>`;
  const safe = (s) => String(s || "").replace(/<\/script/gi, "<\\/script");
  switch (mode) {
    case "html":
      return `<!doctype html><html><head>${base}<style>${f.css || ""}</style></head><body>${f.html || ""}<script>${safe(f.js)}\n<\/script></body></html>`;
    case "js":
      return `<!doctype html><html><head>${base}</head><body><script>${safe(f.js)}\n<\/script></body></html>`;
    case "react":
      return `<!doctype html><html><head>${base}<style>${f.css || ""}</style><script src="${CDN.react}"><\/script><script src="${CDN.reactDom}"><\/script><script src="${CDN.babel}"><\/script></head><body><div id="root"></div><script type="text/babel" data-presets="react">${safe(f.js)}
;(function(){var el=document.getElementById("root");if(typeof App==="function")ReactDOM.createRoot(el).render(React.createElement(App));else console.error("Define a component called App");})();
<\/script></body></html>`;
    case "three":
      return `<!doctype html><html><head>${base}<style>html,body{margin:0;height:100%;overflow:hidden;background:#111}${f.css || ""}</style><script type="importmap">{"imports":{"three":"${CDN.three}","three/addons/":"${CDN.threeAddons}"}}<\/script></head><body><script type="module">${safe(f.js)}\n<\/script></body></html>`;
    case "glsl":
      return glslPage(f.glsl || "", id);
    default:
      return "";
  }
}

/** Mount a playground into `el`. beat: {mode, title, task, html, css, js, glsl}; key: stable id for drafts. */
export function playground(el, beat, key) {
  const mode = beat.mode;
  const tabs = TABS[mode] || ["js"];
  const original = Object.fromEntries(tabs.map((t) => [t, beat[t] || ""]));
  let files = { ...original, ...(store.draft(key) || {}) };
  let tab = tabs.find((t) => (files[t] || "").trim()) || tabs[0];
  const id = `pg${++seq}`;
  const readOnly = mode === "node";
  const consoleOnly = mode === "js";

  el.innerHTML = `<div class="pg${consoleOnly ? " console-only" : ""}${mode === "three" || mode === "glsl" || mode === "react" ? " tall" : ""}">
  <div class="pg-head">
    <span class="title">${esc(beat.title || (readOnly ? "server code" : mode))}</span>
    ${tabs.length > 1 ? tabs.map((t) => `<button class="pg-tab" data-tab="${t}">${t}</button>`).join("") : ""}
    ${readOnly ? "" : `<button class="pg-act" data-act="run" title="Run again">run</button><button class="pg-act" data-act="reset" title="Back to the original code">reset</button>`}
  </div>
  <div class="pg-body"${readOnly ? ' style="grid-template-columns:1fr"' : ""}>
    <div class="ed"><pre aria-hidden="true"></pre><textarea spellcheck="false" autocapitalize="off" autocomplete="off" aria-label="code editor"${readOnly ? " readonly" : ""}></textarea></div>
    ${readOnly ? "" : `<div class="out"><iframe sandbox="allow-scripts" title="preview" loading="lazy"></iframe><pre class="console"></pre></div>`}
  </div>
  ${readOnly ? `<div class="pg-readonly">Server code. Save it as a file and run it with <code>node</code> on your machine.</div>` : ""}
  ${beat.task ? `<div class="pg-task"><b>Try</b>${beat.task.replace(/`([^`]+)`/g, "<code>$1</code>")}</div>` : ""}
</div>`;
  const pre = el.querySelector(".ed pre");
  const ta = el.querySelector(".ed textarea");
  const frame = el.querySelector("iframe");
  const out = el.querySelector(".console");

  function paint() {
    const lang = LANG[tab] || "js";
    pre.innerHTML = highlight(files[tab] || "", lang) + "\n";
    pre.scrollTop = ta.scrollTop;
    pre.scrollLeft = ta.scrollLeft;
  }
  function show() {
    ta.value = files[tab] || "";
    el.querySelectorAll(".pg-tab").forEach((b) => b.classList.toggle("on", b.dataset.tab === tab));
    paint();
  }
  let started = false;
  function run() {
    if (!frame) return;
    started = true;
    out.textContent = "";
    frame.srcdoc = page(mode, files, id);
  }
  listeners.set(id, (d) => {
    const line = document.createElement("div");
    if (d.type === "error") line.className = "err";
    if (d.type === "warn") line.className = "warn";
    line.textContent = d.text;
    out.appendChild(line);
    out.scrollTop = out.scrollHeight;
  });

  let timer = 0;
  ta.addEventListener("input", () => {
    files[tab] = ta.value;
    paint();
    store.draft(key, files);
    clearTimeout(timer);
    timer = setTimeout(run, 500);
  });
  ta.addEventListener("scroll", () => {
    pre.scrollTop = ta.scrollTop;
    pre.scrollLeft = ta.scrollLeft;
  });
  ta.addEventListener("keydown", (e) => {
    if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      const s = ta.selectionStart;
      ta.setRangeText("  ", s, ta.selectionEnd, "end");
      ta.dispatchEvent(new Event("input"));
    } else if (e.key === "Escape") ta.blur();
    e.stopPropagation();
  });
  el.querySelectorAll(".pg-tab").forEach((b) =>
    b.addEventListener("click", () => {
      tab = b.dataset.tab;
      show();
    })
  );
  el.querySelector('[data-act="run"]')?.addEventListener("click", run);
  el.querySelector('[data-act="reset"]')?.addEventListener("click", () => {
    files = { ...original };
    store.draft(key, null);
    show();
    run();
  });
  show();
  // Start the sandbox only once it's near the screen.
  if (frame) {
    const io = new IntersectionObserver(
      (es) => {
        if (es.some((x) => x.isIntersecting) && !started) {
          run();
          io.disconnect();
        }
      },
      { rootMargin: "200px" }
    );
    io.observe(el);
  }
}
