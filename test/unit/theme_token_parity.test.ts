/**
 * THEME TOKEN PARITY tripwire (DEC-12: every documented invariant has one).
 *
 * The dark palette INVERTS the greys: `--color_grey_4` is #353535 (a dark slab) in
 * vars.less and #e5e7ea (a light one) in theme_dark.less. So a surface painted with
 * a PALETTE var flips material when the theme flips — while the ink sitting on it
 * does not. That is not hypothetical, it SHIPPED: the mobile menu panel
 * (`.menu_mobile_wrapper`) was `background-color: @color_grey_4` carrying white
 * leaf items, i.e. white text on a #e5e7ea slab (1.1:1) for the whole life of dark
 * mode, on every screen narrower than 1185px.
 *
 * The fix is that menu surfaces go through SEMANTIC tokens declared in BOTH theme
 * files. This gate makes the second half mechanical: a token declared for light
 * only has, in dark, whatever value the inverted palette happens to produce — which
 * is precisely the bug above, wearing a token's name.
 *
 * SCOPE IS DELIBERATELY NARROW (--menu_*, --debug_info_bar_*). A blanket parity
 * assertion over every custom property would be FALSE: some tokens are legitimately
 * light-only and theme_dark.less says why — see the --tool_diffusion comment (one
 * deep sage for both themes; a dark entry there would win on specificity and
 * reinstate a light bar under white header ink).
 *
 * COST: two file reads. DB-less, network-less → hermetic tier.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const CSS_LAYOUT_DIR = join(
	import.meta.dir,
	'..',
	'..',
	'client',
	'dedalo',
	'core',
	'page',
	'css',
	'layout',
);

/** Token families that MUST be declared in both themes. */
const GATED_PREFIXES = ['--menu_', '--debug_info_bar_'];

const WHY_UNPAIRED =
	'A gated theme token is declared in vars.less (light) but NOT in theme_dark.less. In dark it then resolves through the INVERTED palette, so the surface flips material while its ink does not — the .menu_mobile_wrapper bug (a light slab carrying white text). Declare the dark value in theme_dark.less.';
const WHY_ORPHAN =
	'A gated theme token is declared ONLY in theme_dark.less, so the light theme has no value for it and every rule using it falls back to unset/inherit. Declare the light value in vars.less.';

/** Custom-property names DECLARED (left of the colon) in a LESS source. */
const declaredTokens = (src: string): Set<string> => {
	const names = new Set<string>();
	for (const match of src.matchAll(/^\s*(--[a-z0-9_-]+)\s*:/gim)) {
		const name = match[1];
		if (name) names.add(name);
	}
	return names;
};

const readTokens = (file: string) =>
	declaredTokens(readFileSync(join(CSS_LAYOUT_DIR, file), 'utf8'));

const light = readTokens('vars.less');
const dark = readTokens('theme_dark.less');
const gated = (name: string) => GATED_PREFIXES.some((prefix) => name.startsWith(prefix));

describe('theme token parity tripwire', () => {
	test('there are gated tokens to check (a zero-length pass is not a pass)', () => {
		expect([...light].filter(gated).length).toBeGreaterThan(5);
		expect([...dark].filter(gated).length).toBeGreaterThan(5);
	});

	test('every gated LIGHT token has a dark counterpart', () => {
		const unpaired = [...light]
			.filter(gated)
			.filter((name) => !dark.has(name))
			.sort();
		expect(
			unpaired,
			`${WHY_UNPAIRED}\n\nUnpaired:\n${unpaired.map((n) => `  ${n}`).join('\n')}`,
		).toEqual([]);
	});

	test('every gated DARK token has a light counterpart', () => {
		const orphans = [...dark]
			.filter(gated)
			.filter((name) => !light.has(name))
			.sort();
		expect(
			orphans,
			`${WHY_ORPHAN}\n\nOrphans:\n${orphans.map((n) => `  ${n}`).join('\n')}`,
		).toEqual([]);
	});
});
