/**
 * Neutralises the regex metacharacters in a string so it can be compiled into a
 * pattern that matches it LITERALLY.
 *
 * It exists for one caller — utils/fragments builds a RegExp out of the search terms
 * an anonymous client sent. Without this, that input would not be a search term but
 * a PATTERN the caller gets to author: `.*` would match everything, and a nested
 * quantifier could be crafted to make the engine backtrack catastrophically over a
 * published transcription. Escaping keeps the user on the data side of the line.
 *
 * Only the characters that are special OUTSIDE a character class are escaped, which
 * is exactly how fragments.ts interpolates the result. Embedding an escaped string
 * INSIDE a `[…]` class would not be safe on these terms (`-` is untouched).
 */
export function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
