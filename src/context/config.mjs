export const DEFAULT_CONTEXT_BUDGET = 8500;

export const SOURCE_BUDGET = {
  small: 1100,
  medium: 1400,
  large: 1800,
};

export const USER_DOCS = ["preferences.md"];
export const MODES = new Set(["startup", "brainstorm", "implement", "review", "debug"]);

export function normalizeMode(value) {
  if (!value) {
    return "startup";
  }
  if (!MODES.has(value)) {
    throw new Error(`Unknown context mode: ${value}`);
  }
  return value;
}

export function normalizeBudget(options, mode) {
  const value = options.budget ?? process.env.FLAI_CONTEXT_BUDGET;
  if (value === undefined) {
    return DEFAULT_CONTEXT_BUDGET;
  }
  const budget = Number(value);
  if (!Number.isFinite(budget) || budget < 500) {
    throw new Error("Context budget must be a number >= 500.");
  }
  return Math.floor(budget);
}
