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
import { discoverFiles, REPO_ROOT } from '../../scripts/lib/client_compat_census.ts';
import { stripComments } from '../helpers/strip_comments.ts';

/**
 * The DIRECTORIES that own untrusted error-report text — every browser JS file
 * under them is a render sink candidate the day it is written. The corpus is
 * DERIVED: the shared browser-JS lister (`scripts/lib/client_compat_census.ts`,
 * rooted at client/dedalo + tools/*\/js, registered in
 * census_derivation_tripwire) is filtered by these prefixes, so a new file in
 * either widget is inside the census without editing this gate (P2-20/S-3 —
 * a hand array of paths was the GATE-37 shape).
 */
const UNTRUSTED_TEXT_DIRECTORIES: readonly string[] = [
	'client/dedalo/core/area_maintenance/widgets/error_reports/js/',
	'tools/tool_error_report/js/',
];

/**
 * The client error contract (ERRORS_SPEC §client; `client/dedalo/core/common/js/`)
 * puts every failure through ONE renderer chain, so the same DS-1 invariant
 * holds there: an `error.message` is server text, an `error.details` value can
 * be a user-typed string echoed back, and a stream frame can be anything at
 * all. `error_dispatch.js` is the policy executor, `render_api_error.js` the
 * renderer it feeds, `notifications.js` the bubble both end in. This is the
 * chain the spec NAMES — a policy list, not a corpus — and each member is
 * asserted to be inside the derived listing (a renamed file is loud, not
 * silently out of the census). `render_common.js` is deliberately NOT here: it
 * still renders ontology labels through the ui.js `inner_html` option, which
 * is a separate burn-down.
 */
const ERROR_CONTRACT_CHAIN: readonly string[] = [
	'client/dedalo/core/common/js/error_dispatch.js',
	'client/dedalo/core/common/js/render_api_error.js',
	'client/dedalo/core/common/js/utils/notifications.js',
];

/** Every browser JS file the two surfaces own, plus the renderer chain — from the shared listing. */
function xssSensitiveFiles(): string[] {
	const listed = discoverFiles();
	// Anti-vacuity: the listing is the browser client and the tool clients.
	expect(listed.length).toBeGreaterThan(400);
	const chain = new Set(ERROR_CONTRACT_CHAIN);
	return listed.filter(
		(file) => chain.has(file) || UNTRUSTED_TEXT_DIRECTORIES.some((dir) => file.startsWith(dir)),
	);
}

/**
 * HTML-parsing sinks. The `inner_html` ui.js option maps to insertAdjacentHTML;
 * `update_node_content` also parses HTML. Comments naming the sink for the
 * security rationale are stripped before matching so the rule stays honest.
 */
const HTML_SINK = /\b(innerHTML|inner_html|insertAdjacentHTML|outerHTML|update_node_content)\b/;

describe('error-report XSS tripwire (DS-1: textContent only)', () => {
	const sensitive = xssSensitiveFiles();

	test('the census is derived and populated: both surfaces and the whole renderer chain are listed', () => {
		// 8 files on 2026-09-02 (2 widget + 3 tool + 3 chain): a listing that
		// finds fewer is a broken walk or a deleted sink — a deliberate edit here.
		expect(sensitive.length).toBeGreaterThanOrEqual(8);
		for (const dir of UNTRUSTED_TEXT_DIRECTORIES) {
			expect(
				sensitive.some((file) => file.startsWith(dir)),
				`${dir}: the surface directory lists no browser JS — moved or renamed without this gate`,
			).toBe(true);
		}
		for (const file of ERROR_CONTRACT_CHAIN) {
			expect(sensitive, `${file}: the renderer chain member is not in the listing`).toContain(file);
		}
	});

	for (const file of sensitive) {
		test(`${file} contains no HTML-parsing sink`, () => {
			const code = stripComments(readFileSync(join(REPO_ROOT, file), 'utf-8'));
			const match = HTML_SINK.exec(code);
			expect(
				match?.[0] ?? null,
				`${file} must render untrusted report content via textContent only — found HTML sink '${match?.[0]}'. Route through create_dom_element({text_content}) / node.textContent instead (DS-1).`,
			).toBeNull();
		});
	}
});
