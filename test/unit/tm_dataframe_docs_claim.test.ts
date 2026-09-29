/**
 * TM DATAFRAME DOCS CLAIM — the manual may not describe the time machine's
 * dataframe reading rules the engine removed (review 2026-09-28).
 *
 * THE CONTRACT. A TM row of a main is the full state of the main and ALL its
 * dataframes; a slot the row is silent about was EMPTY then — one rule for
 * every row, Dédalo v6 or engine-written (`rowSlotTipos`,
 * src/core/relations/dataframe_slots.ts). A v6 dataframe save of a main is
 * tagged `lg-nolan` and holds the main in EVERY language plus the frames; it is
 * read as the `lg-nolan` lane (its `lg-nolan` items and frames, the other
 * languages' items ignored) — under a translatable main a frames-only image
 * (`isFramesOnlyImage`). The legacy bulk revert takes a lang-sliced key's
 * FRAME half from the newest row of the main in any language (`preRunRow` with
 * the run's bulk id), and drops the frames of items deleted since
 * (`isStaleItemFrame`).
 *
 * TWO LEGS:
 *   1. NO REMOVED RULE anywhere in docs/: the formulations the manual used for
 *      the per-slot ("proven slot") v6 rule, the superseded one-language v6
 *      dataframe-save image and the whole-frames restore, each with a planted
 *      positive control.
 *   2. THE PAGES NAME THE CODE THAT HOLDS THE RULE, and the code still holds
 *      the name: component_dataframe.md's time-machine bullet names
 *      `rowSlotTipos`; the tool reference's legacy step names `preRunRow`,
 *      `isFramesOnlyImage` and `isStaleItemFrame`, and each is declared in its
 *      source.
 *
 * HONEST LIMIT. Leg 1 catches the sentences that were written, not every
 * paraphrase; the behaviour is pinned by tm_dataframe_restore_native,
 * tm_bulk_revert and bulk_revert_undo_native.
 *
 * HERMETIC: reads docs/, src/ and tools/ text. No DB, no network.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { docsPages } from '../helpers/docs_corpus.ts';

const REPO_ROOT = join(import.meta.dir, '..', '..');
const read = (path: string) => readFileSync(join(REPO_ROOT, path), 'utf8');

interface RemovedRule {
	phrase: RegExp;
	control: string;
	reason: string;
}

const REMOVED_RULES: readonly RemovedRule[] = [
	{
		phrase: /empties only the slots/i,
		control: 'A v6 row empties only the slots v6 recorded in it.',
		reason: 'every slot a row is silent about is emptied, v6 rows included (rowSlotTipos)',
	},
	{
		phrase: /other slots stay as they are/i,
		control: "so the main's other slots stay as they are.",
		reason: 'a restore empties the slots the row holds no frames for',
	},
	{
		phrase: /holds the main in ONE language/i,
		control: 'is tagged `lg-nolan` and holds the main in ONE language',
		reason:
			'a v6 lg-nolan dataframe save holds the main in EVERY language + the frames, read as the lg-nolan lane',
	},
	{
		phrase: /value per language, then its frames/i,
		control: "a duplicate (the copy's value per language, then its frames)",
		reason:
			'a backfill writes the frame lane FIRST (recordMainBackfill): a language row reads its frames from the newest frame state below it',
	},
	{
		phrase: /call `recordTimeMachine\(\)` \*\*twice\*\*/i,
		control: 'and call `recordTimeMachine()` **twice**: once for the previous',
		reason:
			'delete and duplicate back-fill through recordMainBackfill (one row per lane) + recordMainHistory',
	},
	{
		phrase: /frames restore whole/i,
		control: 'its frames restore whole, and the main stays',
		reason: 'frames of items deleted since are dropped (isStaleItemFrame)',
	},
	{
		phrase: /(frames of|are those of) the newest `lg-nolan` row|`lg-nolan` row must hold/i,
		control: 'the frames of the newest `lg-nolan` row up to it',
		reason:
			'the frames come from the newest FRAME-STATE row (lg-nolan, or a v6 row carrying frames — readFrameStateRowAt)',
	},
	{
		phrase: /held no frames of this field\) is emptied|lg-nolan entry[^.]*empties that dataframe/i,
		control: 'a dataframe that was empty then (or held no frames of this field) is emptied.',
		reason:
			"a restore replaces only THIS main's frames; another main's frames in a shared slot stay (D-A)",
	},
	{
		phrase:
			/is not partial — the whole selected snapshot|replaces the whole current value with the snapshot/i,
		control: '**Apply and save** is not partial — the whole selected snapshot lands on the record',
		reason:
			"a restore is per lane: a language row merges over the live other languages; another main's frames stay",
	},
];

/**
 * Comment formulations of the revert's own history order the engine reversed
 * (WC addendum "review 5 — the frame lane first"): recordMainPairs writes the
 * lg-nolan pair FIRST, then each language lane.
 */
const REMOVED_SOURCE_RULES: readonly RemovedRule[] = [
	{
		phrase: /then\s+(\*\s+)?the\s+(\*\s+)?lg-nolan\s+(\*\s+)?(pair|lane)/i,
		control: 'sequential per language lane, then the\n * lg-nolan lane',
		reason: 'recordMainPairs writes the lg-nolan (frame-lane) pair FIRST, then each language lane',
	},
];

const SOURCE_FILES: readonly string[] = [
	'src/core/relations/dataframe_slots.ts',
	'tools/tool_time_machine/server/bulk_revert.ts',
	'tools/tool_time_machine/server/bulk_revert_composed.ts',
	'tools/tool_time_machine/server/bulk_revert_legacy.ts',
	'tools/tool_time_machine/server/bulk_revert_plan.ts',
	'tools/tool_time_machine/server/bulk_revert_records.ts',
	'tools/tool_time_machine/server/bulk_revert_undo.ts',
];

/** Every `path:line` of the manual matching `phrase`. */
function hits(pages: readonly string[], phrase: RegExp): string[] {
	const found: string[] = [];
	for (const page of pages) {
		read(page)
			.split('\n')
			.forEach((line, index) => {
				if (phrase.test(line)) found.push(`${page}:${index + 1}`);
			});
	}
	return found;
}

describe('TM dataframe docs claim', () => {
	const pages = docsPages();

	test('the manual corpus is the whole docs/ tree', () => {
		expect(pages.length).toBeGreaterThan(200);
		expect(pages).toContain('docs/core/components/component_dataframe.md');
		expect(pages).toContain('docs/development/tools/reference/tool_time_machine.md');
	});

	for (const rule of REMOVED_RULES) {
		test(`no page states the removed rule ${rule.phrase} — ${rule.reason}`, () => {
			expect(rule.phrase.test(rule.control)).toBe(true);
			expect(hits(pages, rule.phrase)).toEqual([]);
		});
	}

	for (const rule of REMOVED_SOURCE_RULES) {
		test(`no revert source comment states ${rule.phrase} — ${rule.reason}`, () => {
			expect(rule.phrase.test(rule.control)).toBe(true);
			const found = SOURCE_FILES.filter((file) => rule.phrase.test(read(file)));
			expect(found).toEqual([]);
		});
	}

	test('component_dataframe.md: the time-machine bullet names rowSlotTipos, declared in core', () => {
		const bullet = read('docs/core/components/component_dataframe.md')
			.split('\n')
			.find((line) => line.startsWith('- **Time machine**'));
		expect(bullet).toBeDefined();
		expect(bullet).toContain('`rowSlotTipos()`');
		expect(read('src/core/relations/dataframe_slots.ts')).toMatch(
			/export (async )?function rowSlotTipos\(/,
		);
	});

	test('tool_time_machine.md: the legacy step names the frame-half row, the every-language image read as the lg-nolan lane, the stale-frame law', () => {
		const step = read('docs/development/tools/reference/tool_time_machine.md')
			.split('\n')
			.find((line) => line.includes('**legacy path**'));
		expect(step).toBeDefined();
		for (const name of ['preRunRow', 'isFramesOnlyImage', 'isStaleItemFrame'])
			expect(step).toContain(`\`${name}\``);
		expect(step).toMatch(
			/holds the main in every language plus the frames: it is read as the `lg-nolan` lane/,
		);
		expect(step).toMatch(/FRAME half from the newest visible row of the main in ANY language/);
		expect(read('tools/tool_time_machine/server/bulk_revert_legacy.ts')).toMatch(
			/async function preRunRow\(\s*key: RevertKey,\s*anyLangBefore: number \| null/,
		);
		const slots = read('src/core/relations/dataframe_slots.ts');
		expect(slots).toMatch(/export function isFramesOnlyImage\(/);
		expect(slots).toMatch(/export function isStaleItemFrame\(/);
	});
});
