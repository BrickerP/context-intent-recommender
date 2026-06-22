const CODE_KEYWORDS = [
  "function",
  "const",
  "let",
  "var",
  "return",
  "class",
  "import",
  "export",
  "async",
  "await",
  "def",
  "public",
  "private",
  "interface",
  "type "
];

export function normalizeText(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

export function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

export function truncate(value, maxChars) {
  const text = normalizeText(value);
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1))}…`;
}

export function safeUrl(value) {
  try {
    return value ? new URL(value) : null;
  } catch {
    return null;
  }
}

export function includesAny(text, needles) {
  const lower = normalizeText(text).toLowerCase();
  return needles.some((needle) => lower.includes(needle.toLowerCase()));
}

export function looksLikeCode(text) {
  const value = String(text ?? "");
  const compact = value.trim();
  if (compact.length < 12) return false;

  const keywordHits = CODE_KEYWORDS.filter((keyword) =>
    compact.includes(keyword)
  ).length;
  const syntaxMarks = (compact.match(/[{}()[\];=<>]/g) ?? []).length;
  const lineCount = compact.split(/\r?\n/).filter(Boolean).length;
  const hasIndentedLines = /\n\s{2,}\S/.test(compact);
  const codeDensity = syntaxMarks / Math.max(1, compact.length);

  return (
    keywordHits >= 2 ||
    (keywordHits >= 1 && (syntaxMarks >= 4 || hasIndentedLines)) ||
    (lineCount >= 3 && codeDensity > 0.035)
  );
}

export function textClass(text) {
  const value = normalizeText(text);
  if (!value) return "empty";
  if (looksLikeCode(text)) return "code";
  if (/[a-zA-Z\u4e00-\u9fa5]/.test(value)) return "natural_language";
  return "mixed";
}
