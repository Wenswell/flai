export const MODE_BUDGETS = {
  startup: 5600,
  brainstorm: 5000,
  implement: 6500,
  review: 5200,
  debug: 6500,
  task: 4200,
};

export const USER_DOCS = ["preferences.md", "failure-patterns.md"];
export const MODES = new Set(Object.keys(MODE_BUDGETS));

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
    return MODE_BUDGETS[mode];
  }
  const budget = Number(value);
  if (!Number.isFinite(budget) || budget < 500) {
    throw new Error("Context budget must be a number >= 500.");
  }
  return Math.floor(budget);
}
