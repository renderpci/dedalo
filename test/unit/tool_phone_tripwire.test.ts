/**
 * TOOL PHONE TRIPWIRE (DEC-12) — the phone contract for tools stays stated,
 * tokenised and ratcheted.
 *
 * The contract lives in `client/dedalo/core/tools_common/css/tool_responsive.less`
 * (no page-level horizontal scroll at @min_target_viewport, controls on screen and
 * ≥ 44px). The browser half — actually rendering each tool at 360px — is
 * `scripts/tool_viewport_check.ts`; this is the hermetic half:
 *
 * CORPUS: the tracked tree (`trackedRepoFiles`, the registered `git ls-files`
 * lister) — a tool or sheet must be tracked (or `git add -N`) to be seen.
 *
 *  1. RATCHET TOTALITY: every tool directory under tools/ is in exactly one of
 *     PHONE_CASES / NOT_YET_PHONE (test/helpers/tool_phone_ratchet.ts); no
 *     stale name. A new tool lands in NOT_YET_PHONE with a reason, never silently.
 *  2. TOKENS, NOT LITERALS: every width @media in a tool sheet (tools/**\/*.less
 *     and tools_common/css) names a `@width_break_point_*` token (a `+ 1`
 *     complement allowed) — a literal width is a private breakpoint.
 *  3. ONE PHONE WIDTH: the literal the dd-modal shadow root must carry (it
 *     cannot read LESS) equals `@width_break_point_phone`, and the harness
 *     viewport / hit target equal `@min_target_viewport` / `@phone_hit_target`.
 *  4. The foundation is wired: tool_common.less imports tool_responsive.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { trackedRepoFiles } from '../helpers/css_reference_corpus.ts';
import { NOT_YET_PHONE, PHONE_CASES, PHONE_HIT_TARGET_PX, PHONE_VIEWPORT } from '../helpers/tool_phone_ratchet.ts';

const REPO_ROOT = join(import.meta.dir, '..', '..');
const TOOLS_COMMON_CSS = join(REPO_ROOT, 'client/dedalo/core/tools_common/css');
const VARS_LESS = join(REPO_ROOT, 'client/dedalo/core/page/css/layout/vars.less');
const DD_MODAL = join(REPO_ROOT, 'client/dedalo/core/common/js/dd-modal.js');

const read = (path: string): string => readFileSync(path, 'utf8');
const TRACKED = trackedRepoFiles();

function lessVarPx(source: string, name: string): number {
	const match = source.match(new RegExp(`@${name}\\s*:\\s*(\\d+)px\\s*;`));
	if (!match?.[1]) throw new Error(`@${name} not found as a px value`);
	return Number(match[1]);
}

describe('tool phone ratchet', () => {
	const toolDirs = [
		...new Set(
			TRACKED.map((file) => file.match(/^tools\/(tool_[^/]+)\//)?.[1]).filter((name): name is string => name !== undefined),
		),
	].sort();

	test('census floor (anti-vacuity)', () => {
		expect(toolDirs.length).toBeGreaterThan(30);
	});

	test('every tool is in exactly one list, no stale names', () => {
		const proven = Object.keys(PHONE_CASES);
		const pending = Object.keys(NOT_YET_PHONE);
		expect(proven.filter((name) => pending.includes(name))).toEqual([]);
		expect([...proven, ...pending].sort()).toEqual(toolDirs);
	});

	test('every pending entry carries a substantive reason', () => {
		for (const [name, entry] of Object.entries(NOT_YET_PHONE)) {
			expect(`${name}: ${entry.reason.trim().length >= 8}`).toBe(`${name}: true`);
		}
	});
});

describe('tool @media widths are tokens', () => {
	const sheets = TRACKED.filter(
		(file) => /^tools\/.+\.less$/.test(file) || /^client\/dedalo\/core\/tools_common\/css\/[^/]+\.less$/.test(file),
	);

	test('sheet floor (anti-vacuity)', () => {
		expect(sheets.length).toBeGreaterThan(30);
	});

	test('no literal width in a @media query', () => {
		const offenders: string[] = [];
		let judged = 0;
		for (const path of sheets) {
			const lines = read(join(REPO_ROOT, path)).split('\n');
			for (const [i, line] of lines.entries()) {
				const code = line.replace(/\/\/.*$/, '');
				if (!/@media\b/.test(code)) continue;
				for (const m of code.matchAll(/(?:max|min)-width\s*:\s*([^)]*\)?)/g)) {
					judged++;
					const value = (m[1] ?? '').replace(/\)+\s*$/, '').replace(/^\(/, '').trim();
					if (!/^@width_break_point_\w+(\s*\+\s*1)?$/.test(value)) {
						offenders.push(`${path}:${i + 1}  ${line.trim()}`);
					}
				}
			}
		}
		expect(offenders).toEqual([]);
		expect(judged).toBeGreaterThan(20);
	});

	test('positive control: the matcher rejects a literal and accepts a token', () => {
		const judge = (v: string) => /^@width_break_point_\w+(\s*\+\s*1)?$/.test(v);
		expect(judge('520px')).toBe(false);
		expect(judge('@width_break_point_phone')).toBe(true);
		expect(judge('@width_break_point_0 + 1')).toBe(true);
	});
});

describe('one phone width everywhere', () => {
	const vars = read(VARS_LESS);

	test('dd-modal shadow-root phone query equals @width_break_point_phone', () => {
		const phone = lessVarPx(vars, 'width_break_point_phone');
		const modal = read(DD_MODAL);
		const block = modal.match(/PHONE:[\s\S]*?@media screen and \(max-width:\s*(\d+)px\)/);
		expect(block?.[1] ?? null).toBe(String(phone));
	});

	test('harness viewport equals @min_target_viewport; hit target equals @phone_hit_target', () => {
		expect(PHONE_VIEWPORT.width as number).toBe(lessVarPx(vars, 'min_target_viewport'));
		const responsive = read(join(TOOLS_COMMON_CSS, 'tool_responsive.less'));
		expect(PHONE_HIT_TARGET_PX).toBe(lessVarPx(responsive, 'phone_hit_target'));
	});

	test('tool_common.less imports the phone foundation', () => {
		expect(read(join(TOOLS_COMMON_CSS, 'tool_common.less'))).toMatch(/@import \(once\) "tool_responsive";/);
	});
});
