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
 *   2. the launcher (a right-edge TAB since 2026-09-22, no longer a dock tenant)
 *      declares none of its own coordinates: its geometry lives in
 *      error_report_tab.less, at ONE constant position in every mode;
 *   3. the stylesheet is reachable (main.less imports it), it positions the dock
 *      from the two dock variables, and BOTH corner-owning rails claim the
 *      corner. Add a third full-height right rail and this fires: give it a claim.
 *   4. the media fullscreen viewers' download disc is a dock tenant too — the
 *      real 2026-09 overlap (screenshot): the image/AV viewer popups hand-rolled
 *      `position:fixed; right:10px; bottom:10px` via the retired
 *      media_viewer_download_mixin and the launcher disc covered the download
 *      button. Its geometry now lives in floating_dock.less
 *      (.floating_dock_button.download); this gate refuses the mixin's return.
 *
 * Honest limit: it proves the launcher cannot re-acquire its own coordinates and
 * that the claims exist — not that the resulting offset looks right (no visual
 * regression check). The compiled-vs-source freshness is css_build_tripwire's job.
 *
 * DB-less, network-less → hermetic tier.
 */

import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
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

	test('the error-report launcher is a CSS-placed edge tab, not a self-positioning button', () => {
		// 2026-09-22: the launcher left the dock — it is a lateral tab on the right
		// edge now (unobtrusive: a rarely used tool must not hold a corner). The
		// tenant law it obeyed still binds in the part that matters: it declares NO
		// geometry of its own, so it can follow the right rail through CSS alone.
		const src = readFileSync(join(COMMON_JS, LAUNCHER), 'utf8');

		expect(src, `${LAUNCHER}: the tab must carry its stylesheet's class`).toContain(
			"'error_report_edge_tab'",
		);
		const tab = read('client/dedalo/core/page/css/layout/error_report_tab.less');
		expect(tab, 'the edge tab must be styled by error_report_tab.less').toContain(
			'.error_report_edge_tab {',
		);
		// ONE constant position in every mode: the tab must NOT take a corner claim
		// (that is the dock's job). A rarely used launcher that jumps 19rem sideways
		// when the inspector opens is a launcher nobody can find twice.
		expect(tab, 'the edge tab is glued to the right edge').toContain('right: 0;');
		expect(
			tab.includes('--floating_dock_right') || tab.includes('--inspector_width'),
			'error_report_tab.less: the tab keeps one constant position — it must not ' +
				'follow the right rail like the dock does',
		).toBe(false);
		expect(
			read('client/dedalo/core/page/css/main.less'),
			'main.less must import the edge-tab stylesheet or none of it ships',
		).toContain("@import './layout/error_report_tab'");
		// the geometry the regression shipped, in any of its inline forms
		for (const banned of ['zIndex', 'borderRadius', "right\t\t\t: '", "bottom\t\t\t: '"]) {
			expect(src.includes(banned), `${LAUNCHER}: ${banned} belongs in floating_dock.less`).toBe(
				false,
			);
		}
	});

	test('the media fullscreen viewers hand their download disc to the dock', () => {
		// the 2026-09 real overlap: the viewer popups (image / av) fixed their
		// download button at right:10px; bottom:10px — the launcher disc's corner.
		// Tenant law, same as the launcher's: append to #floating_dock, carry the
		// shared class, own no coordinates.
		const VIEWERS = [
			'client/dedalo/core/component_image/js/view_viewer_image.js',
			'client/dedalo/core/component_av/js/view_viewer_edit_av.js',
		];
		for (const viewer of VIEWERS) {
			const src = read(viewer);
			expect(src, `${viewer}: the download button must be appended to the dock`).toContain(
				'get_floating_dock()',
			);
			expect(
				src,
				`${viewer}: the download button must carry the shared dock-tenant class`,
			).toContain("'primary download floating_dock_button hidden'");
		}

		// the mixin that hand-rolled the corner is retired; its geometry lives in
		// floating_dock.less (.floating_dock_button.download). If a consumer
		// reappears, add a TENANT there instead of resuscitating the mixin.
		const FUNCTIONS = 'client/dedalo/core/page/css/layout/functions.less';
		expect(
			read(FUNCTIONS).includes('media_viewer_download_mixin'),
			`${FUNCTIONS}: ` +
				'media_viewer_download_mixin fixed the download disc to the launcher corner — ' +
				'make the button a #floating_dock tenant instead (floating_dock.less)',
		).toBe(false);
		for (const less of [
			'client/dedalo/core/component_image/css/component_image.less',
			'client/dedalo/core/component_av/css/component_av.less',
		]) {
			expect(
				read(less).includes('.media_viewer_download_mixin'),
				`${less}: ` +
					'do not call media_viewer_download_mixin — the download disc is a dock tenant',
			).toBe(false);
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
		expect(
			less,
			'the media viewers download-disc tenant must be styled by the dock stylesheet',
		).toContain('.floating_dock_button.download');

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
