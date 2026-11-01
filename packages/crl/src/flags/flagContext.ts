/** Plain-text question/citation fields shared by authoring, persistence and review. */
export const FLAG_CONTEXT_FIELDS = ["question", "sourceReference", "sourceQuote"] as const;
export interface FlagContext {
  question?: string;
  sourceReference?: string;
  sourceQuote?: string;
}
export function flagContext(value: FlagContext): FlagContext {
  const result: FlagContext = {};
  for (const key of FLAG_CONTEXT_FIELDS) {
    const text = value[key]?.trim();
    if (text) result[key] = text;
  }
  return result;
}
export function sameFlagContext(a: FlagContext, b: FlagContext): boolean {
  const left = flagContext(a), right = flagContext(b);
  return FLAG_CONTEXT_FIELDS.every(key => left[key] === right[key]);
}
