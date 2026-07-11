/**
 * XSS tripwire (WC-018/019; SECURITY_DECISIONS DECISION 7, DS-1).
 *
 * The error_reports widget and the tool_error_report client render UNTRUSTED
 * remote/captured content (descriptions, error messages, stack traces relayed
 * from other installations). The security invariant is textContent-ONLY: none
 * of these render files may reach an HTML-parsing sink. This is the mechanical
 * gate for that invariant — "tripwire or delete" (DEC-12): a future edit that
 * introduces innerHTML / insertAdjacentHTML / the ui.js `inner_html` option
 * into any of these files fails CI, rather than silently shipping a stored-XSS
 * sink against a global admin.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dir, '..', '..');

/** Files that render untrusted error-report content — textContent only. */
const XSS_SENSITIVE_FILES: readonly string[] = [
	'client/dedalo/core/area_maintenance/widgets/error_reports/js/render_error_reports.js',
	'tools/tool_error_report/js/render_tool_error_report.js',
	'tools/tool_error_report/js/tool_error_report.js',
];

/**
 * HTML-parsing sinks. The `inner_html` ui.js option maps to insertAdjacentHTML;
 * `update_node_content` also parses HTML. Comments naming the sink for the
 * security rationale are stripped before matching so the rule stays honest.
 */
const HTML_SINK = /\b(innerHTML|inner_html|insertAdjacentHTML|outerHTML|update_node_content)\b/;

function stripComments(source: string): string {
	return source
		.replace(/\/\*[\s\S]*?\*\//g, '') // block comments
		.replace(/(^|[^:])\/\/[^\n]*/g, '$1'); // line comments (not URLs)
}

describe('error-report XSS tripwire (DS-1: textContent only)', () => {
	for (const file of XSS_SENSITIVE_FILES) {
		test(`${file} contains no HTML-parsing sink`, () => {
			const code = stripComments(readFileSync(join(REPO_ROOT, file), 'utf-8'));
			const match = HTML_SINK.exec(code);
			expect(
				match?.[0] ?? null,
				`${file} must render untrusted report content via textContent only — found HTML sink '${match?.[0]}'. Route through create_dom_element({text_content}) / node.textContent instead (DS-1).`,
			).toBeNull();
		});
	}

	test('the sensitive-file list stays honest — every entry exists (staleness self-test)', () => {
		const missing = XSS_SENSITIVE_FILES.filter((file) => {
			try {
				readFileSync(join(REPO_ROOT, file), 'utf-8');
				return false;
			} catch {
				return true;
			}
		});
		expect(
			missing,
			`Stale XSS_SENSITIVE_FILES entries (no such file): ${missing.join(', ')}`,
		).toEqual([]);
	});
});
