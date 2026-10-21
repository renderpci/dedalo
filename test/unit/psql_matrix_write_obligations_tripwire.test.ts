/**
 * TRIPWIRE — every psql door that writes a MATRIX table declares which record-write
 * obligations it runs and which it skips, and why (cross-ops:r2 S2).
 *
 * WHY. A record written through the engine passes its write chokepoint
 * (section_record/record_write.ts afterRecordWrite): the record-data fan-out
 * (save_event.ts fireSaveEvent — every createDataCache / section-data listener), the
 * RAG event, the observer obligation ledger, account revocation; the save doors add
 * the Time Machine row and diffusion follows publication state. A write shipped through
 * a psql child process (install/pg_exec.ts runPsql, or a spawned `psql`) reaches the
 * table BESIDE all of that — the hierarchy import's reset DELETE + `\copy` left every
 * datalist / count cache of the thesaurus serving pre-reset terms until a restart.
 * write_obligations_tripwire censuses callers of db/matrix_write.ts only; a psql script
 * was invisible to it. This census closes that: a NEW psql writer of a matrix table is
 * red until it is enumerated below with its declaration.
 *
 * THE CENSUS (derived, never typed in): every source file under src/, scripts/ and
 * tools/ that uses the psql channel AND ships a write statement (`INSERT INTO`,
 * `UPDATE`, `DELETE FROM`, `TRUNCATE`, `COPY`/`\copy … FROM`) whose target is a
 * `matrix*` table (the counter store excluded — the counter gate's law) or an
 * INTERPOLATED name (unknown here, so listed: an entry may say "not a matrix table").
 *
 * THE DECLARATION per file — either
 *  - `declaredBy`: the module EXPORTS a record { obligation → reason } of what it
 *    skips; with `fires` it must cover OBLIGATIONS exactly (an obligation neither fired
 *    nor reasoned is red). Its outcome is gated natively (`gate`).
 *  - `reason`: why no obligation applies (scratch databases, install-time, not a
 *    matrix table) — or a named OPEN gap with its owner.
 */

import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
	REPO_ROOT,
	WRITE_PATH_CORPUS_FLOOR,
	writePathSourceFiles,
} from '../helpers/write_path_corpus.ts';

/** The record-write obligations of the engine's chokepoint (see the header). */
const OBLIGATIONS = [
	'section_data_caches',
	'rag',
	'observers',
	'revocation',
	'time_machine',
	'diffusion',
] as const;

type Entry =
	| { declaredBy: string; fires: readonly (typeof OBLIGATIONS)[number][]; gate: string }
	| { reason: string };

const PSQL_MATRIX_WRITERS: Readonly<Record<string, Entry>> = {
	'src/core/install/hierarchy_import.ts': {
		declaredBy: 'HIERARCHY_IMPORT_SKIPPED_OBLIGATIONS',
		fires: ['section_data_caches'],
		gate: 'test/unit/hierarchy_import_obligations_native.test.ts',
	},
	'src/core/install/root_pw.ts': {
		reason:
			'install-time: set_root_pw writes root’s password into a database no engine serves yet — no cache, session, index, observer or publication exists to update, and root is born without a password (nothing to revoke)',
	},
	'src/core/install/seed_build.ts': {
		reason:
			'the seed compiler writes only scratch databases it CREATED and MARKED (dedalo_seed_build_* / dedalo_seed_verify_*), dropped after the run — no served process, cache, index or publication reads them',
	},
	'scripts/seed_bootstrap_extract.ts': {
		reason:
			'a developer script that extracts the seed’s registry source inside a scratch database it created — never an installation’s',
	},
	'scripts/lib/test_shard_db.ts': {
		reason:
			'not a matrix table: the interpolated target is the suite marker table (dedalo_test_marker) of a cloned shard database',
	},
	'src/core/ontology/data_io_import.ts': {
		reason:
			'OPEN (ontology lane, recorded cross-ops:r2): the ontology package import writes matrix_ontology / matrix_dd; its caller (ontology_update.ts) re-derives dd_ontology and clears every ontology-derived cache (clearOntologyDerivedCaches), but fires no record-data fan-out per <tld>0 section and declares no RAG / observer / Time Machine decision — to be declared in code like hierarchy_import.ts',
	},
};

function stripComments(code: string): string {
	return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** The psql channel: runPsql, or a spawned psql binary (install/pg_exec.ts is the channel itself). */
function usesPsqlChannel(code: string): boolean {
	return /\brunPsql\s*\(/.test(code) || /resolvePgBinary\(\s*'psql'\s*\)/.test(code);
}

/** Write statements' targets: literal identifiers or `${…}` interpolations. */
const WRITE_TARGET =
	/\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|TRUNCATE|COPY)\s+"?(?:public\.)?(\$\{[^}]+\}|[a-z_][a-z0-9_]*)|\\\\copy\s+"?(?:public\.)?(\$\{[^}]+\}|[a-z_][a-z0-9_]*)[^`'\n]*\bFROM\b/g;

/** The matrix write targets a source text ships (interpolated ones included — unknown here). */
function matrixWriteTargets(code: string): string[] {
	const targets: string[] = [];
	for (const match of code.matchAll(WRITE_TARGET)) {
		const target = (match[1] ?? match[2]) as string;
		if (target.startsWith('${')) targets.push(target);
		else if (target.startsWith('matrix') && !target.startsWith('matrix_counter'))
			targets.push(target);
	}
	return targets;
}

/**
 * The walked corpus: THE write-path corpus (test/helpers/write_path_corpus.ts — every
 * non-test .ts under src/, tools/, scripts/), shared with the other write-path censuses.
 */
const CORPUS = writePathSourceFiles();

/** Every psql-channel source file shipping a matrix write (the derived census). */
function derivedWriters(): string[] {
	const found: string[] = [];
	for (const file of CORPUS) {
		if (file === 'src/core/install/pg_exec.ts') continue;
		const code = stripComments(readFileSync(join(REPO_ROOT, file), 'utf8'));
		if (!usesPsqlChannel(code)) continue;
		if (matrixWriteTargets(code).length > 0) found.push(file);
	}
	return found.sort();
}

describe('psql writers of matrix tables declare their record-write obligations', () => {
	test('the scanner sees a write and ignores a read, a counter and prose (positive + negative controls)', () => {
		expect(matrixWriteTargets('`DELETE FROM matrix_hierarchy WHERE x`')).toEqual([
			'matrix_hierarchy',
		]);
		expect(matrixWriteTargets('`\\\\copy ${HIERARCHY_TABLE} (a, b) FROM STDIN`')).toEqual([
			'${HIERARCHY_TABLE}',
		]);
		expect(matrixWriteTargets('`UPDATE "matrix_users" SET`')).toEqual(['matrix_users']);
		expect(matrixWriteTargets('`SELECT 1 FROM matrix_users`')).toEqual([]);
		expect(matrixWriteTargets('`INSERT INTO matrix_counter (tipo)`')).toEqual([]);
		expect(matrixWriteTargets('`\\\\copy (SELECT 1) TO STDOUT`')).toEqual([]);
		expect(matrixWriteTargets("'Update the ontology first'")).toEqual([]);
	});

	test('every derived writer is enumerated, and every entry is still a writer', () => {
		// anti-vacuity: the walk reads the write-path corpus.
		expect(CORPUS.length).toBeGreaterThan(WRITE_PATH_CORPUS_FLOOR);
		const derived = derivedWriters();
		expect(derived.length, 'anti-vacuity: the census finds the known doors').toBeGreaterThanOrEqual(
			4,
		);
		expect(derived).toEqual(Object.keys(PSQL_MATRIX_WRITERS).sort());
	});

	test('a code declaration covers every obligation exactly (fired or reasoned), its gate exists', async () => {
		for (const [file, entry] of Object.entries(PSQL_MATRIX_WRITERS)) {
			if (!('declaredBy' in entry)) {
				expect(entry.reason.length, file).toBeGreaterThanOrEqual(60);
				continue;
			}
			const module = (await import(join(REPO_ROOT, file))) as Record<string, unknown>;
			const declared = module[entry.declaredBy] as Record<string, string> | undefined;
			expect(declared, `${file} exports ${entry.declaredBy}`).toBeDefined();
			const skipped = Object.keys(declared ?? {});
			for (const reason of Object.values(declared ?? {})) {
				expect(
					reason.length,
					`${file}: a skipped obligation needs its reason`,
				).toBeGreaterThanOrEqual(40);
			}
			expect(
				skipped.filter((key) => entry.fires.includes(key as never)),
				file,
			).toEqual([]);
			expect([...skipped, ...entry.fires].sort(), file).toEqual([...OBLIGATIONS].sort());
			expect(existsSync(join(REPO_ROOT, entry.gate)), entry.gate).toBe(true);
		}
	});
});
