/**
 * PATTERN_REPLACER
 * Advanced pattern replacement with empty value handling.
 * Port of PHP class.pattern_replacer.php
 *
 * Replaces ${a}, ${b}, etc. placeholders in a pattern string with provided values.
 * Gracefully handles empty or null values by cleaning up surrounding punctuation.
 */

const EMPTY_MARKER = '\x00EMPTY\x00';



/**
 * REPLACE
 * Replaces placeholders in a pattern string with provided values.
 * Uses a two-phase approach:
 *   1. Replace all placeholders, marking empty values with a temporary marker
 *   2. Clean up formatting around removed content
 *
 * @param pattern - Pattern string with ${variable} placeholders
 * @param values  - Array of values to substitute (positional: a=0, b=1, ...)
 * @returns Processed string with proper formatting
 *
 * @example
 *   replace('${a}, ${b}, ${c} /${d}', ['Juan', 'Perez', null, '2025'])
 *   // Returns: 'Juan, Perez /2025'
 */
export function replace(pattern: string, values: (string | null | undefined)[]): string {

	if (!pattern) return '';

	// Phase 1: Replace all placeholders
	// Build a map: a→0, b→1, c→2, ...
	let result = pattern;
	const placeholder_regex = /\$\{([a-zA-Z0-9_]+)\}/g;

	// Collect all placeholder names in order
	const placeholder_names: string[] = [];
	let match: RegExpExecArray | null;
	const regex_copy = new RegExp(placeholder_regex.source, placeholder_regex.flags);
	while ((match = regex_copy.exec(pattern)) !== null) {
		if (!placeholder_names.includes(match[1])) {
			placeholder_names.push(match[1]);
		}
	}

	// Replace each placeholder with its value or the empty marker
	for (let i = 0; i < placeholder_names.length; i++) {
		const name     = placeholder_names[i];
		const value    = values[i];
		const is_empty = value === null || value === undefined || value === '';
		const safe_name = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		const ph_regex = new RegExp(`\\$\\{${safe_name}\\}`, 'g');
		result = result.replace(ph_regex, is_empty ? EMPTY_MARKER : String(value));
	}

	// Phase 2: Cleanup formatting
	result = cleanup_formatting(result);

	return result;
}



/**
 * CLEANUP_FORMATTING
 * Cleans up text formatting by removing empty value markers and fixing punctuation/spacing.
 *
 * @param text - Text containing empty markers
 * @returns Cleaned text
 */
export function cleanup_formatting(text: string): string {

	let result = text;

	// Remove marker with surrounding comma/separator patterns
	// Pattern: ", EMPTY" or "EMPTY, "
	result = result.replace(new RegExp(`\\s*,\\s*${esc(EMPTY_MARKER)}`, 'g'), '');
	result = result.replace(new RegExp(`${esc(EMPTY_MARKER)}\\s*,\\s*`, 'g'), '');

	// Pattern: " - EMPTY" or "EMPTY - "
	result = result.replace(new RegExp(`\\s*-\\s*${esc(EMPTY_MARKER)}`, 'g'), '');
	result = result.replace(new RegExp(`${esc(EMPTY_MARKER)}\\s*-\\s*`, 'g'), '');

	// Pattern: " / EMPTY" or "EMPTY / "
	result = result.replace(new RegExp(`\\s*/\\s*${esc(EMPTY_MARKER)}`, 'g'), '');
	result = result.replace(new RegExp(`${esc(EMPTY_MARKER)}\\s*/\\s*`, 'g'), '');

	// Pattern: " | EMPTY" or "EMPTY | "
	result = result.replace(new RegExp(`\\s*\\|\\s*${esc(EMPTY_MARKER)}`, 'g'), '');
	result = result.replace(new RegExp(`${esc(EMPTY_MARKER)}\\s*\\|\\s*`, 'g'), '');

	// Remove any remaining markers
	result = result.replace(new RegExp(esc(EMPTY_MARKER), 'g'), '');

	// Cleanup: multiple spaces → single space
	result = result.replace(/\s{2,}/g, ' ');

	// Cleanup: trailing/leading punctuation with spaces
	result = result.replace(/^\s*[,\-/|]\s*/, '');
	result = result.replace(/\s*[,\-/|]\s*$/, '');

	return result.trim();
}



/**
 * Escape a string for use in a RegExp
 */
function esc(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
