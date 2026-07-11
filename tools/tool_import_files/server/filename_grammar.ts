/**
 * Import filename grammar (PHP tool_import_files::get_file_data, the regex at
 * class.tool_import_files.php:220). PHP uses a PCRE CONDITIONAL regex
 *   /^(\d*)?-?(?(?=.\.)|(.*?))(?(?=-)-([a-zA-Z]{1,2})|)\.([a-zA-Z]{3,4})$/
 * which JS RegExp cannot express (no `(?(?=…))`), so the same grammar is
 * reimplemented imperatively here.
 *
 * A filename decomposes as:  <section_id?> '-'? <base_name?> ('-' <letter>)? '.' <ext>
 *   - section_id : leading digits (routes to a section; '' when none)
 *   - base_name  : middle descriptive segment (groups multi-file imports; '' when none)
 *   - letter     : trailing 1–2 alpha field selector before the extension ('' when none)
 *   - extension  : 3–4 alpha after the final dot (case preserved)
 * A name that has no 3–4-alpha extension yields all-null (PHP: empty $ar_match).
 */

export interface FilenameRegexData {
	full_name: string | null;
	section_id: string | null;
	base_name: string | null;
	letter: string | null;
	extension: string | null;
}

const EXTENSION = /^(.*)\.([a-zA-Z]{3,4})$/;
const LEADING_DIGITS = /^(\d+)/;
const TRAILING_LETTER = /-([a-zA-Z]{1,2})$/;

/** Parse a filename into its regex_data fields (PHP get_file_data['regex']). */
export function parseFilename(file: string): FilenameRegexData {
	const extMatch = EXTENSION.exec(file);
	if (extMatch === null) {
		return { full_name: null, section_id: null, base_name: null, letter: null, extension: null };
	}
	const stem = extMatch[1] ?? '';
	const extension = extMatch[2] ?? '';

	const idMatch = LEADING_DIGITS.exec(stem);
	const sectionId = idMatch !== null ? (idMatch[1] ?? '') : '';
	let remainder = stem.slice(sectionId.length);

	// Trailing 1–2 alpha field selector, taken from the very end before the ext.
	let letter = '';
	const letterMatch = TRAILING_LETTER.exec(remainder);
	if (letterMatch !== null) {
		letter = letterMatch[1] ?? '';
		remainder = remainder.slice(0, letterMatch.index);
	}
	// A single separator between section_id and base_name is consumed, not kept.
	if (remainder.startsWith('-')) remainder = remainder.slice(1);

	return {
		full_name: file,
		section_id: sectionId,
		base_name: remainder,
		letter,
		extension,
	};
}
