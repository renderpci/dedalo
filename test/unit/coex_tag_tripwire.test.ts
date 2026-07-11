/**
 * COEX tag lint (DEC-19 / DEC-12) — POST-CUTOVER FORM.
 *
 * Until 2026-07-11 this gate enforced the coexistence-ledger discipline:
 * every `COEX`-tagged source file cited its governing DEC-nn and had a row
 * with a removal condition in rewrite/COEXISTENCE.md. The PHP-freeze cutover
 * (rewrite/CUTOVER_RUNBOOK.md §4) executed every removal condition, so the
 * live inventory is now EMPTY and the invariant INVERTS:
 *
 *  1. NO `COEX` tag may exist in src/ or tools/ — the PHP engine is retired,
 *     so a cross-engine coexistence hedge is impossible by definition; code
 *     shaped like one needs a fresh decision (and a fresh mechanism), not a
 *     resurrection of the closed ledger.
 *  2. Every src/tools path the HISTORICAL ledger backticks must still exist,
 *     so the preserved rows stay navigable (rename/move updates the row).
 *
 * The tag grammar is the bare word COEX (matches `// COEX:`, `COEX
 * (DEC-19/S2-05, …)`). Prose words like "COEXISTENCE" do NOT match (no word
 * boundary inside the longer word), so documentation — including the
 * historical ledger itself — stays free.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Glob } from 'bun';

const REPO_ROOT = join(import.meta.dir, '..', '..');
const LEDGER_PATH = join(REPO_ROOT, 'rewrite', 'COEXISTENCE.md');

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

	test('the ledger declares the cutover (this test and the ledger flip together)', () => {
		const ledger = readFileSync(LEDGER_PATH, 'utf8');
		expect(
			ledger.includes('Cutover executed 2026-07-11'),
			'rewrite/COEXISTENCE.md no longer declares the executed cutover — if coexistence is somehow BACK, restore the pre-cutover ledger AND this tripwire together (git history has both)',
		).toBe(true);
	});

	test('every src/tools path the historical ledger backticks still exists', () => {
		// Rows cite code as `src/...` / `tools/...` — verify the history stayed
		// navigable (a rename/move updates the historical row).
		const ledger = readFileSync(LEDGER_PATH, 'utf8');
		const cited = [...ledger.matchAll(/`((?:src|tools)\/[^`]+\.ts)`/g)].map((m) => m[1] as string);
		expect(cited.length).toBeGreaterThan(0); // the history itself must not vanish
		const rotted = cited.filter((file) => {
			try {
				readFileSync(join(REPO_ROOT, file));
				return false;
			} catch {
				return true;
			}
		});
		expect(
			rotted,
			'COEXISTENCE.md historical rows citing deleted files (update the row to the new path):',
		).toEqual([]);
	});
});
