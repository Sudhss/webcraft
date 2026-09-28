/* A small, fast highlighter: one regex pass per language, tokens wrapped in
 * spans. Good enough for teaching snippets; not a parser. */

import { esc } from "./md.js";

const JS_KW = "await|async|break|case|catch|class|const|continue|debugger|default|delete|do|else|export|extends|finally|for|from|function|if|import|in|instanceof|let|new|of|return|static|super|switch|this|throw|try|typeof|var|void|while|with|yield|true|false|null|undefined";
const GLSL_KW = "attribute|uniform|varying|in|out|inout|const|if|else|for|while|return|discard|precision|highp|mediump|lowp|struct|void|true|false";
const GLSL_T = "float|int|bool|vec2|vec3|vec4|mat2|mat3|mat4|sampler2D|ivec2|ivec3|bvec2";
const PY_KW = "def|class|return|if|elif|else|for|while|in|import|from|as|with|try|except|finally|raise|None|True|False|and|or|not|lambda|yield|async|await|pass|break|continue|global|self";
const SQL_KW = "select|from|where|join|left|right|inner|outer|on|group|by|order|having|limit|offset|insert|into|values|update|set|delete|create|table|index|primary|key|foreign|references|not|null|and|or|as|distinct|count|sum|avg|min|max|begin|commit|rollback|transaction|explain|analyze|with|over|partition|unique|default|alter|drop|in|is|like|between|case|when|then|else|end|returning";

function rules(lang) {
  switch (lang) {
    case "js":
    case "jsx":
    case "ts":
    case "javascript":
    case "json":
      return [
        [/\/\/[^\n]*|\/\*[\s\S]*?\*\//y, "c"],
        [/`(?:\\[\s\S]|[^`\\])*`|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/y, "s"],
        [new RegExp(`\\b(?:${JS_KW})\\b`, "y"), "k"],
        [/\b\d[\d_]*(?:\.\d+)?(?:e[+-]?\d+)?n?\b|\b0x[\da-f]+\b/iy, "n"],
        [/<\/?[A-Z][\w.]*|<\/?[a-z][\w-]*(?=[\s>/])/y, "t"],
        [/[A-Za-z_$][\w$]*(?=\s*\()/y, "f"],
      ];
    case "css":
      return [
        [/\/\*[\s\S]*?\*\//y, "c"],
        [/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/y, "s"],
        [/@[\w-]+/y, "k"],
        [/--[\w-]+/y, "f"],
        [/#[\da-f]{3,8}\b|\b-?\d*\.?\d+(?:px|rem|em|vh|vw|svh|dvh|lvh|%|s|ms|deg|fr|ch|ex)?\b/iy, "n"],
        [/[\w-]+(?=\s*:(?!:))/y, "t"],
      ];
    case "html":
    case "xml":
    case "svg":
      return [
        [/<!--[\s\S]*?-->/y, "c"],
        [/"[^"]*"|'[^']*'/y, "s"],
        [/<\/?[\w-]+|\/?>/y, "k"],
        [/[\w-]+(?==)/y, "f"],
      ];
    case "glsl":
      return [
        [/\/\/[^\n]*|\/\*[\s\S]*?\*\//y, "c"],
        [/#\w+/y, "k"],
        [new RegExp(`\\b(?:${GLSL_KW})\\b`, "y"), "k"],
        [new RegExp(`\\b(?:${GLSL_T})\\b`, "y"), "t"],
        [/\b\d+\.?\d*(?:e[+-]?\d+)?\b|\.\d+\b/iy, "n"],
        [/[A-Za-z_]\w*(?=\s*\()/y, "f"],
      ];
    case "py":
    case "python":
      return [
        [/#[^\n]*/y, "c"],
        [/"""[\s\S]*?"""|'''[\s\S]*?'''|f?"(?:\\.|[^"\\\n])*"|f?'(?:\\.|[^'\\\n])*'/y, "s"],
        [new RegExp(`\\b(?:${PY_KW})\\b`, "y"), "k"],
        [/\b\d+\.?\d*\b/y, "n"],
        [/[A-Za-z_]\w*(?=\s*\()/y, "f"],
      ];
    case "sql":
      return [
        [/--[^\n]*/y, "c"],
        [/'(?:''|[^'])*'/y, "s"],
        [new RegExp(`\\b(?:${SQL_KW})\\b`, "iy"), "k"],
        [/\b\d+\.?\d*\b/y, "n"],
        [/[A-Za-z_]\w*(?=\s*\()/y, "f"],
      ];
    case "bash":
    case "sh":
    case "shell":
    case "dockerfile":
    case "yaml":
    case "yml":
    case "toml":
      return [
        [/#[^\n]*/y, "c"],
        [/"(?:\\.|[^"\\])*"|'[^']*'/y, "s"],
        [/^\s*[\w.-]+(?=\s*:)|\b(?:FROM|RUN|COPY|WORKDIR|CMD|ENTRYPOINT|ENV|EXPOSE|ARG|USER|HEALTHCHECK|ADD)\b/my, "k"],
        [/\$\{?[\w]+\}?/y, "f"],
        [/\b\d+\b/y, "n"],
      ];
    case "cpp":
    case "c":
    case "rust":
    case "go":
    case "java":
      return [
        [/\/\/[^\n]*|\/\*[\s\S]*?\*\//y, "c"],
        [/"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/y, "s"],
        [/#\w+/y, "k"],
        [/\b(?:auto|bool|break|case|char|class|const|continue|default|delete|do|double|else|enum|false|float|for|if|int|long|namespace|new|nullptr|private|protected|public|return|short|size_t|static|struct|switch|template|this|true|typename|unsigned|using|virtual|void|while|fn|let|mut|impl|pub|use|func|package|var)\b/y, "k"],
        [/\b\d+\.?\d*[fFuUlL]*\b/y, "n"],
        [/[A-Za-z_]\w*(?=\s*\()/y, "f"],
      ];
    default:
      return [];
  }
}

export function highlight(src, lang) {
  const rs = rules(String(lang || "").toLowerCase());
  if (!rs.length) return esc(src);
  let out = "";
  let i = 0;
  let plain = "";
  const flush = () => {
    if (plain) out += esc(plain);
    plain = "";
  };
  outer: while (i < src.length) {
    for (const [re, cls] of rs) {
      re.lastIndex = i;
      const m = re.exec(src);
      if (m && m.index === i && m[0].length) {
        flush();
        out += `<span class="${cls}">${esc(m[0])}</span>`;
        i += m[0].length;
        continue outer;
      }
    }
    // Skip over identifiers whole, so keywords inside words don't match.
    const id = /[A-Za-z_$][\w$-]*/y;
    id.lastIndex = i;
    const w = id.exec(src);
    if (w && w.index === i && !/^\d/.test(w[0])) {
      // Let the function rule see identifiers followed by "(".
      plain += w[0];
      i += w[0].length;
      continue;
    }
    plain += src[i];
    i += 1;
  }
  flush();
  return out;
}

/** Highlighted, split into lines (for line marks). */
export function lines(src, lang) {
  // Highlight whole, then split on newlines while keeping spans balanced.
  const html = highlight(src, lang);
  const out = [];
  let open = [];
  for (const line of html.split("\n")) {
    const prefix = open.join("");
    const tags = line.match(/<span class="\w+">|<\/span>/g) || [];
    for (const t of tags) {
      if (t === "</span>") open.pop();
      else open.push(t);
    }
    out.push(prefix + line + "</span>".repeat(open.length));
  }
  return out;
}
