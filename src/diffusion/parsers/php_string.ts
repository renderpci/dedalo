/**
 * PHP string semantics shared by the parser family.
 *
 * LEAF MODULE ON PURPOSE: parser_text and parser_helper both need phpTrim and
 * parser_text already imports parser_helper (merge/replace), so hosting it in
 * either one closes a static-import cycle (import_scc_tripwire, S2-20).
 * Keep this file dependency-free.
 */

/**
 * PHP trim() semantics, which are NOT JavaScript's.
 *
 * PHP trims exactly " \t\n\r\0\x0B". JS String.prototype.trim() also strips every
 * Unicode WhiteSpace code point — including U+00A0 NO-BREAK SPACE, which a
 * decoded `&nbsp;` becomes. v6 therefore publishes a trailing nbsp and a JS
 * .trim() silently eats it, one character per affected cell (measured: 140 cells
 * across games.body and games.abstract, every one differing by exactly this).
 * Oracle: v6 class.component_text_area.php :1262-1264 — the boundary `&nbsp;`
 * ENTITY is stripped by the preg_replace above it; the DECODED character is not.
 */
export function phpTrim(value: string): string {
	// biome-ignore lint/suspicious/noControlCharactersInRegex: PHP trim's charlist is exactly this — \0 and \x0B included.
	return value.replace(/^[ \t\n\r\0\x0B]+|[ \t\n\r\0\x0B]+$/g, '');
}
