/**
 * TRIPWIRE — a TLD's dd_ontology is reconciled/rebuilt by ONE module.
 *
 * `dd_ontology` is a projection of `matrix_ontology`. Keeping them consistent — reconcile
 * the delta, or wipe-and-rebuild — lives in `src/core/ontology/ontology_state.ts`
 * (inspect / ensure / rebuild). The PHP-inherited design instead had the destructive
 * `regenerateRecordsInDdOntology` do the wipe with a leftover `dd_ontology_bk` table as its
 * only, untested, rollback; that function is RETIRED. This test fails if either comes back:
 *
 *  1. `regenerateRecordsInDdOntology` must not exist anywhere (retired onto rebuildOntology).
 *  2. `deleteTldNodes` — the wipe primitive — may be imported only by an allowlisted set:
 *     its definition (dd_ontology.ts), the reconcile authority (ontology_state.ts), and the
 *     ONE legitimate non-rebuild caller, `ontology_write.ts` `setRecordsInDdOntology`, which
 *     deletes a tld's nodes when the tld goes INACTIVE (a different operation, not a rebuild).
 *     Anyone else deleting a tld's nodes is wipe-and-rebuilding outside the single writer.
 */

import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const REPO_ROOT = join(import.meta.dir, '../..');
const SEARCH_ROOTS = ['src', 'tools'];

/** deleteTldNodes importers that are NOT "some new module wipes a tld". */
const DELETE_TLD_ALLOWLIST = new Set([
	'src/core/db/dd_ontology.ts', // defines it
	'src/core/ontology/ontology_state.ts', // the rebuild authority
	'src/core/ontology/ontology_write.ts', // setRecordsInDdOntology: inactive-tld deactivation
]);

function sourceFiles(): string[] {
	const found: string[] = [];
	const walk = (dir: string): void => {
		for (const entry of readdirSync(dir)) {
			if (entry === 'node_modules' || entry.startsWith('.')) continue;
			const full = join(dir, entry);
			if (statSync(full).isDirectory()) walk(full);
			else if (entry.endsWith('.ts')) found.push(full);
		}
	};
	for (const root of SEARCH_ROOTS) walk(join(REPO_ROOT, root));
	return found;
}

/** Strip comments — a mention in prose is documentation, not a call. */
const code = (text: string): string =>
	text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('dd_ontology has one reconcile/rebuild authority', () => {
	test('regenerateRecordsInDdOntology is retired (exists nowhere)', () => {
		const offenders: string[] = [];
		for (const file of sourceFiles()) {
			if (/\bregenerateRecordsInDdOntology\b/.test(code(readFileSync(file, 'utf8')))) {
				offenders.push(relative(REPO_ROOT, file));
			}
		}
		expect(offenders).toEqual([]);
	});

	test('deleteTldNodes (the wipe primitive) is used only by the allowlisted modules', () => {
		const offenders: string[] = [];
		for (const file of sourceFiles()) {
			const rel = relative(REPO_ROOT, file);
			if (DELETE_TLD_ALLOWLIST.has(rel)) continue;
			if (/\bdeleteTldNodes\b/.test(code(readFileSync(file, 'utf8')))) offenders.push(rel);
		}
		expect(offenders).toEqual([]);
	});
});
