/**
 * The bottom-right corner has ONE owner: #floating_dock (DEC-12 gate for the
 * invariant stated in client/dedalo/core/page/css/layout/floating_dock.less).
 *
 * WHAT WENT WRONG WITHOUT THIS GATE (real, 2026-07-29): the error-report
 * launcher positioned itself from JS — `position:fixed; right:1rem; bottom:1rem`
 * as INLINE styles. The right rail is fixed to that same corner (in edit mode
 * `.inspector_container`, in list mode `.assistant_container.standalone`), so the
 * purple disc landed on top of the assistant composer's send/stop button. A
 * button positioned from JS cannot see the rail open, close or get resized: the
 * fix is not a different constant, it is moving the geometry to CSS, where
 * `body:has(<rail>)` can shift the whole dock left of the rail and follow
 * --inspector_width for free.
 *
 * THREE ASSERTIONS:
 *   1. no global boot module (client/dedalo/core/common/js/) positions an element
 *      with inline fixed geometry — that is the regression, and the allowlist is
 *      EMPTY;
 *   2. the launcher is a dock TENANT (appends to #floating_dock, carries the
 *      shared class) and declares none of its own coordinates;
 *   3. the stylesheet is reachable (main.less imports it), it positions the dock
 *      from the two dock variables, and BOTH corner-owning rails claim the
 *      corner. Add a third full-height right rail and this fires: give it a claim.
 *
 * Honest limit: it proves the launcher cannot re-acquire its own coordinates and
 * that the claims exist — not that the resulting offset looks right (no visual
 * regression check). The compiled-vs-source freshness is css_build_tripwire's job.
 *
 * DB-less, network-less → hermetic tier.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dir, '..', '..');
const COMMON_JS = join(REPO_ROOT, 'client', 'dedalo', 'core', 'common', 'js');
const LAUNCHER = 'error_report_launcher.js';

const read = (rel: string) => readFileSync(join(REPO_ROOT, rel), 'utf8');

/** Inline geometry written from JS: `position: 'fixed'` in any quoting style. */
const INLINE_FIXED = /position\s*[:=]\s*['"`]fixed['"`]/;

describe('floating dock ownership', () => {
	test('no global boot module positions an element as fixed from JS', () => {
		const offenders = readdirSync(COMMON_JS)
			.filter((f) => f.endsWith('.js'))
			.filter((f) => INLINE_FIXED.test(readFileSync(join(COMMON_JS, f), 'utf8')));

		expect(
			offenders,
			'client/dedalo/core/common/js/: a global element must not carry its own fixed ' +
				'coordinates — append it to #floating_dock and style it in floating_dock.less',
		).toEqual([]);
	});

	test('the error-report launcher is a dock tenant, not a self-positioning button', () => {
		const src = readFileSync(join(COMMON_JS, LAUNCHER), 'utf8');

		expect(src, `${LAUNCHER}: the button must be appended to the dock`).toContain(
			'get_floating_dock().appendChild(button)',
		);
		expect(src, `${LAUNCHER}: the button must carry the shared dock-tenant class`).toContain(
			"'floating_dock_button'",
		);
		// the geometry the regression shipped, in any of its inline forms
		for (const banned of ['zIndex', 'borderRadius', "right\t\t\t: '", "bottom\t\t\t: '"]) {
			expect(src.includes(banned), `${LAUNCHER}: ${banned} belongs in floating_dock.less`).toBe(
				false,
			);
		}
	});

	test('the stylesheet is reachable, variable-driven, and every corner-owning rail claims it', () => {
		expect(
			read('client/dedalo/core/page/css/main.less'),
			'main.less must import the dock stylesheet or none of it ships',
		).toContain("@import './layout/floating_dock'");

		const less = read('client/dedalo/core/page/css/layout/floating_dock.less');
		expect(less, 'the dock must read its offset from the dock variables').toContain(
			'right: var(--floating_dock_right)',
		);
		expect(less).toContain('bottom: var(--floating_dock_bottom)');

		// One claim per element that is fixed to the same corner (section.less).
		for (const rail of [
			'.assistant_container.standalone.show', // list mode: floats over the right edge
			':not(.full_width) > .inspector_container', // edit mode: the inspector rail
		]) {
			expect(less, `no corner claim for ${rail}: the dock would sit on top of it`).toContain(
				`body:has(${rail})`,
			);
		}
	});
});
