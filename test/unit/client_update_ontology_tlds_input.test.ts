/**
 * The update_ontology TLD input belongs to the OPERATOR (DEC-12 gate).
 *
 * WHAT WENT WRONG WITHOUT THIS GATE (real, 2026-08-22): selecting a master
 * server ran a handler that did `tlds_input.value = …`, so every click on the
 * server picker silently threw away the list the operator had just typed — and
 * because no configured master publishes a `tld` field, the "new" value it wrote
 * was always the installation default. Editing the list first and picking the
 * server second was unusable.
 *
 * The rule now: the input is written in exactly three places — the initial
 * prefill, the operator's own typing, and an EXPLICIT click on a reference chip
 * or "Use this list". A server selection only repaints the reference row.
 *
 * THREE ASSERTIONS:
 *   1. the `ontology_server_select_change` subscriber does not assign the input;
 *   2. the value survives a reload — it is read from and written to
 *      localStorage under the documented key;
 *   3. the master's own list is never applied wholesale: `build_row` is called
 *      with the "Use this list" button OFF for the master row (a manifest is
 *      200+ TLDs, every language pack included).
 *
 * Honest limit: this reads the source, so it proves the shape of the wiring, not
 * that the rendered widget behaves (no DOM here — the behaviour was verified in
 * the browser when it landed). It fires on the regression it was written for:
 * re-introducing an input assignment in the selection handler.
 *
 * DB-less, network-less → hermetic tier.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dir, '..', '..');
const RENDER = join(
	REPO_ROOT,
	'client/dedalo/core/area_maintenance/widgets/update_ontology/js/render_update_ontology.js',
);
const src = readFileSync(RENDER, 'utf8');

/** The body of the function subscribed to `ontology_server_select_change`. */
function selection_handler_body(): string {
	const start = src.indexOf('const render_handler');
	expect(start, 'the server-selection handler must still be named render_handler').toBeGreaterThan(
		-1,
	);
	const end = src.indexOf('event_manager.subscribe(', start);
	expect(end, 'render_handler must still be the subscribed handler').toBeGreaterThan(start);
	return src.slice(start, end);
}

describe('update_ontology TLD input ownership', () => {
	test('selecting a master does NOT write the TLD input', () => {
		const body = selection_handler_body();

		expect(
			/tlds_input\s*\.\s*value\s*=/.test(body),
			'the ontology_server_select_change handler must not assign tlds_input.value — ' +
				'a server selection repaints the reference row, it never discards the ' +
				"operator's list",
		).toBe(false);
	});

	test('the operator line survives a reload (localStorage, one documented key)', () => {
		expect(src).toContain("const TLDS_STORAGE_KEY = 'dedalo.update_ontology.tlds'");
		// read on render, written on every edit
		expect(src).toMatch(/getItem\(TLDS_STORAGE_KEY\)/);
		expect(src).toMatch(/setItem\(TLDS_STORAGE_KEY,/);
		expect(src).toMatch(/addEventListener\('input',/);
		// both sides guarded: a private-mode browser throws on access and the
		// panel must still render
		expect(src.match(/catch \(_error\)/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
	});

	test('the master manifest is never applied wholesale', () => {
		// build_row(label, tlds, empty_text, with_use_list)
		const server_row = src.match(/const server_row = build_row\([^)]*\)/)?.[0] ?? '';
		expect(server_row, 'the master reference row must still be built by build_row').not.toBe('');
		expect(
			server_row.trimEnd().endsWith('false)'),
			'the master row must NOT offer "Use this list": its manifest is the whole ' +
				'ontology (200+ TLDs) and importing all of it is never what an operator means',
		).toBe(true);
	});
});
