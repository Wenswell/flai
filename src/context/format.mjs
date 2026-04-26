export function normalizeWhitespace(text) {
  return text.replace(/\r\n/g, "\n").replace(/\s+/g, " ").trim();
}

export function previewText(text, maxChars = 20) {
  const clean = normalizeWhitespace(text);
  if (clean.length <= maxChars) {
    return clean;
  }
  return `${clean.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`;
}

export function compactMarkdown(text, maxChars) {
  const clean = text.replace(/\r\n/g, "\n").trim();
  if (clean.length <= maxChars) {
    return clean;
  }

  const lines = clean.split("\n");
  const kept = [];
  let size = 0;
  for (const line of lines) {
    const nextSize = size + line.length + 1;
    if (nextSize > maxChars - 14) {
      break;
    }
    kept.push(line);
    size = nextSize;
  }

  if (!kept.length) {
    return `${clean.slice(0, Math.max(0, maxChars - 14)).trimEnd()}\n[trimmed]`;
  }

  kept.push("[trimmed]");
  return kept.join("\n");
}

export function estimateTokens(text) {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return 0;
  }

  const pieces = normalized.match(/[\u3400-\u9fff]|[A-Za-z0-9_]+|[^\s]/g) ?? [];
  return pieces.reduce((total, piece) => {
    if (/^[A-Za-z0-9_]+$/.test(piece)) {
      return total + Math.ceil(piece.length / 4);
    }
    return total + 1;
  }, 0);
}
