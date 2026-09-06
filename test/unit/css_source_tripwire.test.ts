/**
 * TRIPWIRE — every committed, browser-served TOOL stylesheet has a SOURCE, at the
 * one path the loader will ever ask for (P3-2 / GATE-50; widened 2026-09-06 by the
 * CSS coherence audit, DESIGN.md clause 2.0).
 *
 * `tools/tool_sitebuilder/css/tool_sitebuilder.css` shipped tracked and served
 * with no `.less` anywhere: the only one of 37 tools without an entry sheet. It
 * was invisible to four gates that claim this territory — including one whose
 * own header names "a block of CSS hand-appended with no source anywhere" as
 * the regression it exists to catch, and one that declares itself TOTAL over
 * tools while seeing 36 of 37 and flooring at `> 30`. A floor set below the
 * corpus size cannot notice a missing member.
 *
 * Why it matters beyond tidiness: a hand-edited `.css` is silently reverted the
 * next time anyone builds from source, and nothing says the edit was lost.
 *
 * ── WHAT THIS OWNS, AND WHAT IT NO LONGER HAS TO ────────────────────────────
 * `css_corpus_tripwire` (2026-09-06) asserts the whole-tree fact this gate could
 * only ask about `tools/*​/css/*.css`: tracked `.css` == built entrypoint outputs
 * ∪ the derived third-party set, in both directions, over `client/` AND `tools/`.
 * It exists because three committed outputs of PARTIALS — a 2026-07-11 snapshot
 * of the dark palette among them — sat under `client/` and therefore outside this
 * gate's glob, served at 200, inside no corpus at all.
 *
 * This gate is kept as the TOOL-SCOPED leg because it derives its corpus from the
 * OTHER END: from the committed `.css` files themselves, by pattern, never from
 * `entrypoints()`. Two independent derivations of the same territory is the point
 * — the sibling gate's set equality is only as honest as `entrypoints()`, and this
 * one would still see a tool `.css` if the build's own view of the tree broke.
 *
 * It adds one thing the sibling cannot get from set equality alone: the tool
 * client composes the URL as `tool_base_url(model) + '/css/' + model + '.css'`
 * (`client/dedalo/core/tools_common/js/tool_common.js`), so a tool stylesheet is
 * only ever fetched at ONE path. A sheet in the right directory under the wrong
 * name is a 404 that `load_style()` does not report and nobody sees until a
 * curator opens the tool and it renders unstyled.
 *
 * DOES NOT PROVE: that the `.less` is the source of THOSE bytes (freshness is
 * `css_build_tripwire`), that the CSS is correct, legible or theme-complete
 * (`contrast_ratio_tripwire`, `theme_token_parity`), or that anything under
 * `client/` has a source at all (`css_corpus_tripwire`).
 *
 * COST: one `git ls-files`, one import of the build's entrypoint derivation, and
 * a stat per tool sheet. No DB, no network → hermetic tier.
 */

import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { entrypoints } from '../../scripts/build_css.ts';

const REPO_ROOT = join(import.meta.dir, '..', '..');

/** Tracked files, so untracked build output and scratch never enter the census. */
function tracked(pattern: string): string[] {
	const out = Bun.spawnSync(['git', 'ls-files', pattern], {
		cwd: REPO_ROOT,
		stdout: 'pipe',
		stderr: 'pipe',
	}).stdout.toString();
	return out.split('\n').filter((line) => line.trim() !== '');
}

describe('every served stylesheet has a source', () => {
	const toolCss = tracked('tools/*/css/*.css');

	test('the census sees the whole tool tree (anti-vacuity)', () => {
		// THE DEFECT THIS GATE REPLACES was a floor of `> 30` over 37 tools — low
		// enough that the one missing member never tripped it. The floor must sit
		// AT the corpus, not below it.
		const tools = new Set(toolCss.map((file) => file.split('/')[1]));
		expect(toolCss.length).toBeGreaterThanOrEqual(37);
		expect(tools.size).toBeGreaterThanOrEqual(37);
	});

	test('every tool .css has a .less beside it', () => {
		const orphans = toolCss.filter((file) => {
			const source = join(dirname(file), `${basename(file, '.css')}.less`);
			return !existsSync(join(REPO_ROOT, source));
		});
		expect(
			orphans,
			'A committed, browser-served stylesheet with no .less source is reverted the next ' +
				'time anyone builds from source, silently. Add the source (plain CSS is valid ' +
				`Less, so the existing bytes are a legitimate first version).\n  ${orphans.join('\n  ')}`,
		).toEqual([]);
	});

	test('the source is not empty and names its own output', () => {
		// A zero-byte .less would satisfy the rule above while sourcing nothing.
		for (const file of toolCss) {
			const source = join(REPO_ROOT, dirname(file), `${basename(file, '.css')}.less`);
			expect(Bun.file(source).size, `${source} is empty`).toBeGreaterThan(0);
		}
	});

	test('every tool sheet sits at the ONE path the loader asks for', () => {
		// The committed set (derived by pattern, above) against the built set
		// (derived by the build itself) — the same territory reached two ways, so a
		// stray extra sheet in a tool's css/ folder and a sheet under a name the
		// loader will never request are both visible.
		//
		// `tool_base_url(model) + '/css/' + model + '.css'` is the whole interface:
		// nothing else under tools/**/css/ is ever fetched.
		const expected = entrypoints()
			.filter((file) => file.startsWith('tools/'))
			.map((file) => file.replace(/\.less$/, '.css'))
			.sort();
		expect(expected.length, 'the built tool corpus emptied').toBeGreaterThanOrEqual(37);

		const misplaced = expected.filter((file) => {
			const tool = file.split('/')[1] as string;
			return file !== `tools/${tool}/css/${tool}.css`;
		});
		expect(
			misplaced,
			'A tool stylesheet that is not at `tools/<tool>/css/<tool>.css`. The client composes that ' +
				'exact URL from the tool model, so this sheet is fetched by nobody — and load_style() ' +
				`does not report the 404.\n  ${misplaced.join('\n  ')}`,
		).toEqual([]);

		expect(
			[...toolCss].sort(),
			'The committed tool stylesheets and the ones the build produces are different sets. A ' +
				'committed sheet the build does not produce is reverted on the next `bun run css:build`; ' +
				'a built sheet that is not committed is a 404 in production, because a deploy is a ' +
				'checkout.',
		).toEqual(expected);
	});
});
