/**
 * Some models put chain-of-thought inside <think>...</think> in the main stream.
 */
const INLINE_THINK_PATTERNS: RegExp[] = [
  /<think\b[^>]*>[\s\S]*?<\/think>/gi,
  /<thinking>[\s\S]*?<\/thinking>/gi,
];

export function extractInlineThinking(text: string): {
  body: string;
  extraReasoning: string;
} {
  let extra = "";
  let body = text;
  for (const re of INLINE_THINK_PATTERNS) {
    body = body.replace(re, (m) => {
      extra += m;
      return "";
    });
  }
  const stripTags = extra
    .replace(/<\/?think\b[^>]*>/gi, "")
    .replace(/<\/?thinking>/gi, "")
    .trim();
  return { body: body.trim(), extraReasoning: stripTags };
}
