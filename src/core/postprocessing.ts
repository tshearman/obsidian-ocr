/**
 * Safety-net delimiter normalisation.
 *
 * The prompt instructs the model to use dollar-sign delimiters exclusively,
 * but models occasionally still emit bracket-style delimiters. These two
 * substitutions correct that without touching anything else.
 *
 * - `\( … \)` → `$ … $`   (inline math)
 * - `\[ … \]` → `$$ … $$` (display math)
 */
export function normalizeLatexDelimiters(text: string): string {
  text = text.replace(/\\\(([\s\S]*?)\\\)/g, "$$$1$$");
  text = text.replace(/\\\[([\s\S]*?)\\\]/g, "$$$$$1$$$$");
  return text;
}
