/**
 * TRIPWIRE — every committed, browser-served stylesheet has a SOURCE
 * (P3-2 / GATE-50).
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
 */

import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

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
});
