import { normalizeBudget, normalizeMode } from "./config.mjs";
import { compactMarkdown, estimateTokens, previewText } from "./format.mjs";

function renderSection(section, text) {
  return `<${section.tag} source="${section.source}">\n${text}\n</${section.tag}>`;
}

export function analyzeSections(sections, options = {}) {
  const mode = normalizeMode(options.mode);
  const budget = normalizeBudget(options, mode);
  const close = "\n</flai-context>\n";
  const chunks = [`<flai-context mode="${mode}" budget="${budget}">`];
  const rows = [];

  for (const section of sections) {
    const currentLength = chunks.join("\n\n").length + close.length;
    const remaining = budget - currentLength;
    const wrapperOverhead = renderSection(section, "").length + 2;
    const allowed = Math.min(section.maxChars, remaining - wrapperOverhead);

    if (allowed < 80) {
      rows.push({ section, state: "omitted", renderedText: "" });
      continue;
    }

    const renderedText = compactMarkdown(section.text, allowed);
    const state = renderedText.length < section.text.length ? "trimmed" : "used";
    chunks.push(renderSection(section, renderedText));
    rows.push({ section, state, renderedText });
  }

  chunks.push("</flai-context>");

  return {
    mode,
    budget,
    text: chunks.join("\n\n"),
    rows: rows.map(({ section, state, renderedText }) => ({
      source: section.source,
      type: section.type,
      chars: section.text.length,
      tokens: estimateTokens(section.text),
      state,
      preview: previewText(section.text),
      renderedChars: renderedText.length,
    })),
  };
}
