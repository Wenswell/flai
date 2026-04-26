import { normalizeMode } from "./config.mjs";
import { collectContextSections } from "./collect.mjs";
import { analyzeSections } from "./render.mjs";

export async function buildContextAnalysis(options = {}) {
  const mode = normalizeMode(options.mode);
  const sections = await collectContextSections({ ...options, mode });
  return analyzeSections(sections, { ...options, mode });
}

export async function buildContext(options = {}) {
  return (await buildContextAnalysis(options)).text;
}
