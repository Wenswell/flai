import { normalizeBudget, normalizeMode } from "./config.mjs";
import { compactMarkdown, estimateTokens, previewText } from "./format.mjs";

function renderSection(section, text) {
  return `<${section.tag} source="${section.source}">\n${text}\n</${section.tag}>`;
}

function reasonFor(section) {
  const reasons = {
    "workflow-state": "readiness and next command",
    "phase-policy": "active phase rules",
    "project-now": "current project state",
    conversation: "startup/brainstorm discussion state",
    issues: "project issues",
    "project-summary": "stable project facts",
    "docs-index": "available .flai docs",
  };

  if (reasons[section.tag]) {
    return reasons[section.tag];
  }
  if (section.tag === "user-preferences.md") {
    return "user preferences";
  }
  if (section.tag === "user-failure-patterns.md") {
    return "debug failure patterns";
  }
  if (section.tag === "task-status.md") {
    return "current task state";
  }
  if (section.tag === "task-plan.md") {
    return "current task plan";
  }
  if (section.tag === "task-implement.md") {
    return "implementation context";
  }
  if (section.tag === "task-review.md") {
    return "review context";
  }
  if (section.tag === "task-log.md") {
    return "debug evidence";
  }
  if (section.tag === "task-decisions.md") {
    return "task decisions";
  }
  return "selected context";
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
      reason: reasonFor(section),
      preview: previewText(section.text),
      renderedChars: renderedText.length,
    })),
  };
}
