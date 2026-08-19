/**
 * DASHBOARD RENDER SINK — client/dedalo/core/area_common/js/dashboard.js
 *
 * WHY THIS FILE EXISTS. The area dashboard's activity panel built each row of
 * its user breakdown with a template literal assigned to `innerHTML`:
 *
 *     row.innerHTML = `<span class="…_user_name">${user_label_map[uid]}</span>` + …
 *
 * `user_label_map[uid]` is `activity.users[].label`, which the server builds in
 * `src/core/area/dashboard.ts::resolveUsername()` by joining the RAW dd132
 * username out of `matrix_users`. It is record data an authenticated user can
 * write, and it is not escaped server-side — escaping belongs at the sink, and
 * the wire shape is contract-pinned. So a username containing markup executed in
 * the browser of every user who opened the dashboard, with the viewer's session.
 * The chart legend forty lines above already did the same job with
 * `textContent`, which is what makes this an oversight rather than an HTML field.
 *
 * WHAT IS PINNED (contract, not implementation):
 *  A. No `innerHTML` / `insertAdjacentHTML` / `outerHTML` in this file carries
 *     an interpolation. A literal `= ''` container reset is the only permitted
 *     form: it parses nothing, and it is how every render path here clears its
 *     host before redrawing.
 *  B. The user-breakdown row still emits the two spans the stylesheet targets,
 *     and fills them through `textContent`. Rule A alone would also pass if the
 *     rows stopped rendering, so this pins that they render, and how.
 *  C. The file takes no `inner_html` option from `ui.create_dom_element` — that
 *     option routes to `insertAdjacentHTML`, so it is the same sink wearing the
 *     shared factory's clothes.
 *
 * ANTI-VACUITY. The scan asserts the file was read and is substantial, and the
 * sink matcher is fired against a synthetic offender, so a renamed file or a
 * broken regex cannot make this green having checked nothing.
 *
 * HERMETIC. Source read only — no DB, no server, no browser.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const DASHBOARD_PATH = join(
	import.meta.dir,
	'..',
	'..',
	'client',
	'dedalo',
	'core',
	'area_common',
	'js',
	'dashboard.js',
);

/** comments stripped so prose describing the old defect is not itself a finding */
const strip_comments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/**
 * An HTML-sink assignment whose right-hand side is anything but an empty string
 * literal. `= ''` / `= ""` are the container resets; everything else parses.
 * (Honest limit: it keys on the RHS STARTING with an empty literal, so a
 * contrived `= '' + value` would read as a reset. Nothing here writes that, and
 * rule B pins how the one data-bearing row is actually built.)
 *
 * (!) The whitespace lives INSIDE the lookahead. Written as `=\s*(?!''|"")` the
 * engine simply backtracks `\s*` to zero width, the lookahead then reads the
 * SPACE rather than the quotes, succeeds, and every container reset is reported
 * as a finding — which is exactly what the anti-vacuity probe below caught.
 */
const SINK_WITH_CONTENT = /\.(innerHTML|outerHTML)\s*=(?!\s*(''|""))/g;
const INSERT_ADJACENT = /\.insertAdjacentHTML\s*\(/g;

const source = readFileSync(DASHBOARD_PATH, 'utf8');
const code = strip_comments(source);

describe('dashboard.js render sinks', () => {
	test('anti-vacuity: the file was read and the matcher catches a real offender', () => {
		expect(source.length).toBeGreaterThan(10_000);
		expect(code).toContain('render_activity_timeline');

		const offender = "row.innerHTML = `<span>${user_label_map[uid]}</span>`";
		expect(offender.match(SINK_WITH_CONTENT), 'the sink matcher no longer catches the original defect').not.toBeNull();
		expect("host.innerHTML = ''".match(SINK_WITH_CONTENT), 'a container reset must not be a finding').toBeNull();
	});

	test('A. no HTML sink carries content — only literal container resets', () => {
		const found = code.match(SINK_WITH_CONTENT) ?? [];
		expect(found, 'record data must never be parsed as HTML here — build nodes and use textContent').toEqual([]);
		expect(code.match(INSERT_ADJACENT) ?? []).toEqual([]);
	});

	test('B. the user-breakdown row renders both spans through textContent', () => {
		expect(code).toContain('area_dashboard_activity_user_name');
		expect(code).toContain('area_dashboard_activity_user_count');

		const block = code.slice(code.indexOf('area_dashboard_activity_user_row'));
		const row_render = block.slice(0, block.indexOf('user_table.appendChild'));

		expect(row_render, 'the user name is no longer written as text').toMatch(/user_name\.textContent\s*=/);
		expect(row_render, 'the activity count is no longer written as text').toMatch(/user_count\.textContent\s*=/);
	});

	test('C. no inner_html option is passed to the shared DOM factory', () => {
		expect(code, 'ui.create_dom_element inner_html routes to insertAdjacentHTML — the same sink').not.toMatch(
			/inner_html\s*:/,
		);
	});
});
