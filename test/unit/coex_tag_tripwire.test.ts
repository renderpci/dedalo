/**
 * COEX tag lint (DEC-19 / DEC-12) — POST-CUTOVER FORM.
 *
 * Until 2026-07-11 this gate enforced the coexistence-ledger discipline: every
 * `COEX`-tagged source file cited its governing DEC-nn and had a row with a
 * removal condition in the COEXISTENCE ledger. The PHP-freeze cutover executed
 * every removal condition, so the live inventory is now EMPTY and the invariant
 * INVERTS:
 *
 *   NO `COEX` tag may exist in src/ or tools/ — the PHP engine is retired, so a
 *   cross-engine coexistence hedge is impossible by definition; code shaped like
 *   one needs a fresh decision (and a fresh mechanism), not a resurrection of
 *   the closed ledger.
 *
 * The ledger itself is CLOSED process history and lives outside the repo
 * (rewrite/ is internal, gitignored 2026-07-11). Two assertions that audited the
 * ledger DOCUMENT — that it still declared the cutover, and that its backticked
 * paths stayed navigable — were dropped that day: a gate may not read a file
 * that is not in the repo, or it cannot run on a clone. Nothing was weakened for
 * CODE; the inventory check below reads src/ + tools/ only, which is the whole
 * point of the tripwire.
 *
 * The tag grammar is the bare word COEX (matches `// COEX:`, `COEX
 * (DEC-19/S2-05, …)`). Prose words like "COEXISTENCE" do NOT match (no word
 * boundary inside the longer word), so documentation stays free.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Glob } from 'bun';

const REPO_ROOT = join(import.meta.dir, '..', '..');

/** Bare-word COEX tag (never matches COEXISTENCE/COEXIST). */
const COEX_TAG = /\bCOEX\b/;

function coexTaggedSourceFiles(): string[] {
	const files: string[] = [];
	const glob = new Glob('{src,tools}/**/*.ts');
	for (const file of glob.scanSync({ cwd: REPO_ROOT })) {
		const text = readFileSync(join(REPO_ROOT, file), 'utf8');
		if (COEX_TAG.test(text)) files.push(file);
	}
	return files.sort();
}

describe('COEX tag lint (DEC-19 tripwire, post-cutover form)', () => {
	test('the live COEX inventory is EMPTY (cutover 2026-07-11 — no new hedges, ever)', () => {
		expect(
			coexTaggedSourceFiles(),
			'COEX-tagged files found AFTER the 2026-07-11 cutover — the PHP engine is retired, so no coexistence hedge can exist. Remove the tag; if the code is a real cross-process concern, it needs its own decision + gate, not the closed COEXISTENCE ledger:',
		).toEqual([]);
	});
});
