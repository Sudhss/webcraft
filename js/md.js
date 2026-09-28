/* The tiny inline markup chapters use: `code`, **bold**, *italic*, [text](url). */

export const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function md(s) {
  const parts = String(s ?? "").split(/(`[^`]+`)/g);
  return parts
    .map((p) => {
      if (p.startsWith("`") && p.endsWith("`") && p.length > 1) return `<code>${esc(p.slice(1, -1))}</code>`;
      return esc(p)
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        .replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\w)/g, "$1<em>$2</em>")
        .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    })
    .join("");
}

export const plain = (s) => String(s ?? "").replace(/`([^`]+)`/g, "$1").replace(/\*\*?([^*]+)\*\*?/g, "$1").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
