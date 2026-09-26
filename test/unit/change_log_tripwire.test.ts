/**
 * CHANGE LOG TRIPWIRE (DEC-12: every documented invariant has a mechanical gate).
 *
 * `docs/change_log.md` is GENERATED from `changes/` by scripts/changelog.ts (the model
 * and its reason: the header of scripts/lib/change_log.ts; the authoring rules:
 * changes/README.md). What this holds:
 *
 *   1. every fragment and every release.json parses (strict front matter, closed
 *      type/audience vocabularies, real dates, no headings in a body);
 *   2. the committed page is BYTE-IDENTICAL to a fresh render — a hand edit, or a
 *      fragment added without `bun run changelog`, is red;
 *   3. the releases form one chain: each release starts at its predecessor's tag, is not
 *      dated before it, and ships no fragment dated after its own release;
 *   4. every wire-contract id a fragment or a release names exists in the ledger, and no
 *      two releases claim the same id;
 *   5. every ledger entry adopted on or after WC_NOTE_FLOOR is cited by a fragment's
 *      `wc:` — a deliberate wire change is a reader-visible change, so it ships with a
 *      sentence a reader can use, not only an id.
 *
 * Hermetic: files only, no git, no DB — the page is a pure function of the tree.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
	CHANGE_LOG_PAGE,
	compareVersions,
	loadChangeSet,
	renderFromRepo,
	wireContractIds,
} from '../../scripts/lib/change_log.ts';

const REPO_ROOT = join(import.meta.dir, '..', '..');

/**
 * The day the gate was born. Ledger entries adopted before it were written before
 * fragments existed; the releases list their ids, and the prose that told readers about
 * them (where any did) was migrated into fragments by hand. From here on, no id alone.
 */
const WC_NOTE_FLOOR = '2026-09-26';

const set = loadChangeSet(REPO_ROOT);
const ledger = wireContractIds(REPO_ROOT);
const allFragments = [...set.unreleased, ...set.releases.flatMap((r) => r.fragments)];

describe('change log: generated from changes/, and complete', () => {
	test('the tree is populated (a gate over nothing asserts nothing)', () => {
		// 2026-09-26: the hand-written page's entries migrated into fragments across three
		// releases. Fewer means the loader stopped seeing them, not that history shrank.
		expect(allFragments.length).toBeGreaterThanOrEqual(40);
		expect(set.releases.length).toBeGreaterThanOrEqual(3);
		expect(ledger.length).toBeGreaterThan(200);
	});

	test('docs/change_log.md is byte-identical to a fresh render (run `bun run changelog`)', () => {
		const committed = readFileSync(join(REPO_ROOT, CHANGE_LOG_PAGE), 'utf8');
		expect(committed).toBe(renderFromRepo(REPO_ROOT));
	});

	test('releases chain: each starts at its predecessor tag and is not dated before it', () => {
		const ordered = [...set.releases].sort((a, b) =>
			compareVersions(a.release.version, b.release.version),
		);
		const breaks: string[] = [];
		for (let i = 1; i < ordered.length; i++) {
			const prev = ordered[i - 1]!.release;
			const cur = ordered[i]!.release;
			if (cur.from !== prev.to)
				breaks.push(`${cur.version}: from '${cur.from}', expected '${prev.to}'`);
			if (cur.date < prev.date)
				breaks.push(`${cur.version}: dated ${cur.date}, before ${prev.version} (${prev.date})`);
		}
		expect(breaks).toEqual([]);
	});

	test('a release ships no fragment dated after the release itself', () => {
		const late = set.releases.flatMap(({ release, fragments }) =>
			fragments
				.filter((f) => f.date > release.date)
				.map((f) => `${f.file} (${f.date} > ${release.date})`),
		);
		expect(late).toEqual([]);
	});

	test('every wire-contract id a fragment cites exists in the ledger', () => {
		const known = new Set(ledger);
		const dangling = allFragments.flatMap((f) =>
			f.wc.filter((id) => !known.has(id)).map((id) => `${f.file}: ${id}`),
		);
		expect(dangling).toEqual([]);
	});

	test('every id a release claims exists, and no id is claimed twice', () => {
		const known = new Set(ledger);
		const seen = new Map<string, string>();
		const problems: string[] = [];
		for (const { release } of set.releases) {
			for (const id of release.wire_contract) {
				if (!known.has(id)) problems.push(`${release.version}: ${id} is not in the ledger`);
				const other = seen.get(id);
				if (other !== undefined) problems.push(`${id}: claimed by ${other} and ${release.version}`);
				seen.set(id, release.version);
			}
		}
		expect(problems).toEqual([]);
	});

	test(`every ledger entry adopted on/after ${WC_NOTE_FLOOR} is told to a reader by a fragment`, () => {
		const cited = new Set(allFragments.flatMap((f) => f.wc));
		const untold = ledger.filter((id) => {
			const date = /^WC-(\d{4}-\d{2}-\d{2})-/.exec(id)?.[1];
			return date !== undefined && date >= WC_NOTE_FLOOR && !cited.has(id);
		});
		// Fix: add changes/unreleased/<slug>.md with `wc: <id>` (bun run changelog new <slug>).
		expect(untold).toEqual([]);
	});

	test('the floor check can see a dated id (anti-vacuity: the regex matches the grammar in use)', () => {
		expect(ledger.some((id) => /^WC-\d{4}-\d{2}-\d{2}-/.test(id))).toBe(true);
	});
});
