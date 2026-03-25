/**
 * Many models emit LaTeX with \( \) / \[ \] instead of $ / $$.
 * remark-math only parses $...$ and $$...$$, so normalize outside fenced code blocks.
 */
export function preprocessLlmMathForMarkdown(src: string): string {
  const parts = src.split(/(```[\s\S]*?```)/g);
  return parts
    .map((chunk) => {
      if (chunk.startsWith("```")) return chunk;
      let s = chunk;
      s = s.replace(/\\\[([\s\S]*?)\\\]/g, (_m, inner: string) => {
        const t = String(inner).trim();
        return `\n$$\n${t}\n$$\n`;
      });
      s = s.replace(/\\\(([\s\S]*?)\\\)/g, (_m, inner: string) => {
        const t = String(inner).trim();
        return `$${t}$`;
      });
      return s;
    })
    .join("");
}
