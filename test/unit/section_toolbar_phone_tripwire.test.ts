/**
 * TRIPWIRE — the section-list toolbar stays SANE on a phone (2026-10-17).
 *
 * The list toolbar is one flex row (`.section.list > .buttons_container`,
 * `justify-content: space-between`) holding three logical groups IN DOM ORDER:
 * the search controls, the actions block (`other_buttons_block`, `width:100%`,
 * hidden by default), and the disclosure toggle (`show_other_buttons_button`,
 * the LAST child so it lands at the row's right edge on desktop).
 *
 * On a phone the row wraps, and the two structural facts collided:
 *   - `other_buttons_block`'s `width:100%` claims a row of its own the moment it
 *     is shown, and
 *   - the toggle is the last flex item, so it was pushed onto a THIRD line,
 *     alone, and hard LEFT (space-between with a single item) — while in the
 *     collapsed state it sat hard RIGHT on the search row. The arrow jumped
 *     across the screen between the two states, and the rotated thin tab
 *     (`transform: rotate(90deg)`, `width:1rem`, its label hidden on phone)
 *     left a bare, mis-oriented chevron in a hit box well under the 44px
 *     touch target.
 *
 * The fix is layout-only and phone-only: the toggle keeps the SEARCH row's
 * right edge in BOTH states (`order: 1`) and the actions block keeps its own
 * full row underneath (`order: 2`), the rotation is dropped and the button
 * becomes a real >=44px target, and the toggle reports its state through
 * `aria-expanded`/`aria-controls`. Desktop is untouched.
 *
 * WHY A SOURCE SCAN: the browser client suite runs at 1280px, so the phone
 * media query never fires there and no DOM assertion can see this layout. The
 * invariants below are the ones the fix rests on, checked on the tracked
 * source.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '../helpers/strip_comments.ts';

const CLIENT = join(import.meta.dir, '..', '..', 'client', 'dedalo', 'core');
const read = (relative: string): string => readFileSync(join(CLIENT, relative), 'utf8');

const SECTION_LESS = 'section/css/section.less';
const AREA_LESS = 'area_thesaurus/css/area_thesaurus.less';
const VIEWS = ['section/js/view_default_list_section.js', 'section/js/view_graph_list_section.js'];

/** Inner text of the brace block whose `{` sits at `openIndex`. */
function balancedBlock(source: string, openIndex: number): string {
	let depth = 0;
	for (let index = openIndex; index < source.length; index++) {
		const char = source[index];
		if (char === '{') depth++;
		else if (char === '}') {
			depth--;
			if (depth === 0) return source.slice(openIndex + 1, index);
		}
	}
	throw new Error('unbalanced brace block');
}

/** Index just past the `}` closing the block opened at `openIndex`. */
function balancedEnd(source: string, openIndex: number): number {
	let depth = 0;
	for (let index = openIndex; index < source.length; index++) {
		const char = source[index];
		if (char === '{') depth++;
		else if (char === '}') {
			depth--;
			if (depth === 0) return index + 1;
		}
	}
	throw new Error('unbalanced brace block');
}

/** The first `{`-block introduced by `marker` at or after `from`. */
function blockAfter(source: string, marker: string, from = 0): { body: string; at: number } {
	const at = source.indexOf(marker, from);
	expect(at, `marker not found: ${marker}`).toBeGreaterThan(-1);
	const open = source.indexOf('{', at);
	return { body: balancedBlock(source, open), at };
}

/** The phone media block that owns the toolbar's disclosure toggle, with its end offset. */
function phoneToolbarRange(source: string): { body: string; end: number; start: number } {
	const marker = '@media screen and (max-width: @width_break_point_phone)';
	let search = 0;
	for (;;) {
		const at = source.indexOf(marker, search);
		expect(at, 'the phone media query is missing from section.less').toBeGreaterThan(-1);
		const open = source.indexOf('{', at);
		const body = balancedBlock(source, open);
		if (body.includes('show_other_buttons_button')) {
			return { body, end: balancedEnd(source, open), start: at };
		}
		search = at + marker.length;
	}
}

/** The phone media block that owns the toolbar's disclosure toggle. */
function phoneToolbarBlock(source: string): string {
	return phoneToolbarRange(source).body;
}

describe('section-list toolbar, phone tier (<= @width_break_point_phone)', () => {
	test('the phone block pins the toggle to the search row and the actions block to its own', () => {
		const phone = phoneToolbarBlock(stripComments(read(SECTION_LESS)));

		// the search controls shrink/wrap INSIDE their box instead of shoving the
		// toggle down to the next line
		const search = blockAfter(phone, '>.search_buttons_container');
		expect(search.body, 'the search container must be allowed to shrink').toMatch(
			/flex:\s*1\s+1\s+auto/,
		);

		// DOM order is search -> actions -> toggle (desktop: the tab sits at the
		// far right). On phone `order` re-sequences ONLY the two wrapped items.
		const actions = blockAfter(phone, '>.other_buttons_block');
		expect(actions.body, 'the actions block must render after the toggle').toMatch(
			/order:\s*2\s*;/,
		);

		const toggle = blockAfter(phone, '>.show_other_buttons_button');
		expect(toggle.body, 'the toggle must keep the search row').toMatch(/order:\s*1\s*;/);
		expect(toggle.body, 'the rotated thin tab must be dropped on phone').toMatch(
			/transform:\s*none\s*;/,
		);
		// a real touch target: parse the rem box. The phone tier's root font-size
		// is ~15px (measured 2026-10-17), so 44px needs >= 3rem — judged at 15,
		// not 16, or a 2.75rem control would pass here and render 41px.
		for (const axis of ['width', 'height']) {
			const value = toggle.body.match(new RegExp(`${axis}:\\s*([\\d.]+)rem`));
			expect(value, `${axis} must be declared in rem on the phone toggle`).not.toBeNull();
			expect(Number(value?.[1]) * 15).toBeGreaterThanOrEqual(44);
		}
		// order must sit ABOVE the wrapped block — that is the whole fix
		expect(toggle.body).toMatch(/order:\s*1\s*;/);
	});

	test('the desktop toggle is unchanged (the rotated tab stays put)', () => {
		// The base rule still rotates; only the phone tier overrides it.
		const source = stripComments(read(SECTION_LESS));
		const base = blockAfter(source, '>.show_other_buttons_button');
		expect(base.body).toMatch(/transform:\s*rotate\(90deg\)/);
	});

	test('the phone overrides are declared AFTER the base rule (equal specificity — later wins)', () => {
		// A media query adds no specificity, so an earlier phone block would
		// silently lose `transform: none` / `width` / `padding: 0` to the base
		// `rotate(90deg)` / `1rem` / `12px` and render the old rotated tab in the
		// new position. Measured in a 360px browser on 2026-10-17.
		const source = stripComments(read(SECTION_LESS));
		const base = source.indexOf('>.show_other_buttons_button');
		const { start } = phoneToolbarRange(source);
		expect(base, 'the base toggle rule must precede the phone block').toBeLessThan(start);
	});
});

describe('the disclosure toggle states its contract (both list views)', () => {
	test('the block is created before the toggle and carries a synthesizable id', () => {
		for (const view of VIEWS) {
			const source = read(view);
			const actions = source.indexOf("'other_buttons_block hide'");
			const toggle = source.indexOf("'icon_arrow show_other_buttons_button'");
			expect(actions, `${view}: actions block creation missing`).toBeGreaterThan(-1);
			expect(toggle, `${view}: toggle creation missing`).toBeGreaterThan(-1);
			expect(actions, `${view}: the block must be created before the toggle`).toBeLessThan(toggle);
			// the id the toggle points at comes from the shared a11y id factory
			expect(source, `${view}: the block needs a synthesized id`).toContain(
				"a11y.generate_id('other_buttons_block')",
			);
		}
	});

	test('the toggle names its region and reports expanded/collapsed', () => {
		for (const view of VIEWS) {
			const source = read(view);
			expect(source, `${view}: aria-controls must point at the block`).toContain(
				"setAttribute('aria-controls', other_buttons_block.id)",
			);
			// both callbacks of ui.collapse_toggle_track update the state
			expect(source, `${view}: collapsed state must be reported`).toContain(
				'a11y.set_expanded(show_other_buttons_button, false)',
			);
			expect(source, `${view}: expanded state must be reported`).toContain(
				'a11y.set_expanded(show_other_buttons_button, true)',
			);
			// the toggle must not be created already expanded (default_state closed)
			expect(source, `${view}: the initial state is collapsed`).toContain(
				'a11y.set_expanded(show_other_buttons_button, false)',
			);
		}
	});

	test('the graph view imports the a11y helpers it now uses', () => {
		const source = read('section/js/view_graph_list_section.js');
		expect(source).toContain("import {a11y} from '../../common/js/a11y.js'");
	});
});

describe('the thesaurus area keeps no dead toggle styling', () => {
	test('area_thesaurus.less styles the block it creates and nothing more', () => {
		const source = stripComments(read(AREA_LESS));
		// control: the area DOES render an always-visible actions block...
		expect(source, 'the area still styles its own actions block').toContain(
			'>.other_buttons_block',
		);
		// ...and never creates the collapse toggle, so its rotated-tab copy was
		// dead CSS (it styled a node no code produced).
		expect(source, 'a dead show_other_buttons_button rule must not come back').not.toContain(
			'show_other_buttons_button',
		);
	});
});
