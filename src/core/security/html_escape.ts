/**
 * THE server's HTML escaper — `htmlspecialchars($s, ENT_QUOTES)` twin: the five
 * characters that can end a text node or an attribute value (`& < > " '`)
 * become entities, nothing else changes. Safe for element text AND for a
 * double- or single-quoted attribute value; NOT a sanitizer (html_sanitize.ts
 * is the one for stored rich text) and NOT a URL filter (a `javascript:` href
 * stays a `javascript:` href — callers that emit URLs decide what they allow).
 *
 * Consumers: component_text_area/tag_html.ts (SEC-028 tag attribute escaping)
 * and tools/tool_export/server/writers/html.ts (the HTML download). It is NOT
 * (yet) the only escaper in the tree — other modules still carry their own
 * `& < > " '` replace chains; this module claims no uniqueness it cannot gate.
 * `&` is replaced FIRST, so an entity already in the input is escaped once,
 * never interpreted (`&lt;` → `&amp;lt;`) — the output is literal text.
 */

/** Escape `& < > " '` (ENT_QUOTES). `null`/`undefined` → ''. */
export function escapeHtml(value: string | null | undefined): string {
	return (value ?? '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
}
