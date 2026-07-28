/**
 * Conservative HTML sanitizer for stored rich text (XSS-01 defense-in-depth,
 * 2026-07-28 audit).
 *
 * component_text_area is a CKEditor field, so legitimate FORMATTING HTML (bold,
 * paragraphs, links, images, tables) must survive — an escape-everything pass
 * would destroy every curator's content. This is therefore a targeted DENYLIST
 * that removes only the executable/dangerous constructs and leaves formatting
 * intact, vendored as one owned file (no dependency, no DOM).
 *
 * It is DEFENSE IN DEPTH behind the enforcing CSP (static_asset.ts APP_CSP),
 * which already blocks inline-handler / inline-script / javascript: execution in
 * the browser. This reduces the STORED attack surface so a payload never reaches
 * a context the CSP does not cover (a future CSP relaxation, an email/export
 * renderer, a non-browser consumer). Because it is a regex denylist over
 * possibly-malformed HTML — not a spec parser — it is NOT relied on as the sole
 * control; the CSP is.
 */

/** Elements whose TAGS + CONTENT are removed wholesale (they execute or embed). */
const DANGEROUS_ELEMENTS_WITH_CONTENT = ['script', 'style'];

/** Elements whose TAGS are removed (any inner text is kept as inert text). */
const DANGEROUS_ELEMENTS = [
	'iframe',
	'object',
	'embed',
	'form',
	'base',
	'meta',
	'link',
	'svg',
	'math',
	'applet',
	'frame',
	'frameset',
];

/** True when a URL value (whitespace/controls collapsed) uses a dangerous scheme. */
function isDangerousUrl(raw: string): boolean {
	// A browser ignores whitespace + C0 controls inside a scheme ("java\tscript:").
	const s = raw.replace(/[\s\x00-\x1f]+/g, '').toLowerCase();
	return (
		s.startsWith('javascript:') ||
		s.startsWith('vbscript:') ||
		s.startsWith('data:text/html') ||
		s.startsWith('data:application/')
	);
}

/** Sanitize a stored rich-text HTML string. Non-strings / empty pass through. */
export function sanitizeRichText(input: string): string {
	if (typeof input !== 'string' || input === '') return input;
	let html = input;

	// 1. Neutralize dangerous URL schemes in attribute values FIRST (before tag
	//    removal, which could otherwise chew a `<script>` sitting inside an
	//    href value and strand the scheme). Quoted values first (they may hold the
	//    internal whitespace an unquoted capture would stop at), then bare ones.
	html = html.replace(
		/(=\s*)(["'])([\s\S]*?)\2/g,
		(match, eq: string, quote: string, value: string) =>
			isDangerousUrl(value) ? `${eq}${quote}#${quote}` : match,
	);
	html = html.replace(/(=\s*)([^"'\s>]+)/g, (match, eq: string, value: string) =>
		isDangerousUrl(value) ? `${eq}#` : match,
	);

	// 2. Strip every on*= event-handler attribute (quoted, single-quoted, bare).
	html = html.replace(/\son[a-z0-9_-]+\s*=\s*"[^"]*"/gi, '');
	html = html.replace(/\son[a-z0-9_-]+\s*=\s*'[^']*'/gi, '');
	html = html.replace(/\son[a-z0-9_-]+\s*=\s*[^\s>]+/gi, '');

	// 3. Drop dangerous elements WITH their content (script/style bodies are code).
	for (const tag of DANGEROUS_ELEMENTS_WITH_CONTENT) {
		html = html.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?</${tag}\\s*>`, 'gi'), '');
		html = html.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*$`, 'gi'), ''); // dangling open
		html = html.replace(new RegExp(`</?${tag}\\b[^>]*>`, 'gi'), '');
	}

	// 4. Drop the TAGS of embedding/executing elements (keep inner text inert).
	for (const tag of DANGEROUS_ELEMENTS) {
		html = html.replace(new RegExp(`</?${tag}\\b[^>]*>`, 'gi'), '');
	}

	return html;
}

/**
 * Apply {@link sanitizeRichText} to the string `value` of every item in a
 * save change set (mirrors the shape of password_hash.hashPasswordChanges) —
 * the XSS-01 SAVE gate for component_text_area, funnelling every write door
 * (client API, MCP tools, agent change-plan, import) through one place.
 */
export function sanitizeRichTextChanges<T extends { value: unknown }>(changes: readonly T[]): T[] {
	const sanitizeItem = (item: unknown): unknown => {
		if (
			item !== null &&
			typeof item === 'object' &&
			typeof (item as { value?: unknown }).value === 'string'
		) {
			return { ...item, value: sanitizeRichText((item as { value: string }).value) };
		}
		return item;
	};
	return changes.map((change) =>
		Array.isArray(change.value)
			? { ...change, value: change.value.map(sanitizeItem) }
			: { ...change, value: sanitizeItem(change.value) },
	);
}
