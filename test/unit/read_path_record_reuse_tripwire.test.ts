/**
 * THE READ PATH READS A ROW ONCE (audit PERF-06) — a shrink-only ratchet on
 * the BARE `readMatrixRecord` call sites left under the three read roots.
 *
 * WHAT THE DEFECT IS. `readMatrixRecord` fetches a WHOLE matrix row — every
 * JSONB column plus its `::text` twin, the heaviest projection in the codebase
 * — to answer a question about ONE component. `db/record_memo.ts` exists so
 * that inside a single section read the same row is fetched once however many
 * components ask for it, and `section/read.ts` opens that scope around every
 * read. It had ONE consumer. Every other read-path reader went straight to the
 * database: `relations/**`, `resolve/**` and `section/**` held ~19 such call
 * sites, and the worst of them multiplied — `relations/related.ts`
 * labelOfReference resolves K show-columns per reference through
 * `resolve/relation_list.ts`, which defaulted to a bare read, so R references ×
 * K columns cost R×K identical full-row reads of R rows.
 *
 * WHY A RATCHET AND NOT A ONE-TIME FIX. The conversion is a wave: nothing in
 * the type system distinguishes the memoized reader from the bare one, so the
 * next feature that needs a row reaches for `readMatrixRecord` again and the
 * wave silently regresses. This gate is the thing that notices.
 *
 * THE WRITE PATH KEEPS THE BARE READ, DELIBERATELY (record_memo.ts:24-30):
 * save/delete run inside `withTransaction` and legitimately re-read a row they
 * just modified; a memo there would hand back the pre-write row. Those call
 * sites are ENUMERATED below with a per-entry reason and the list is
 * shrink-only. (`memoizedReadMatrixRecord` degrades to a direct read when no
 * scope is active, so the exemption is about intent, not about behaviour.)
 *
 * THE CENSUS IS TOTAL AND DERIVED: every `.ts` file under the three roots,
 * walked from the tree, with a floor — never a hand list.
 *
 * HONEST LIMITS. (1) It is a source scan: a read reached through an aliased
 * binding or a non-relative dynamic import is invisible to it. (2) It counts
 * CALL SITES, not executions — the behavioural half (one row, one read inside a
 * read scope) is `read_path_record_reuse_native.test.ts`. (3) Comments are
 * stripped before scanning, so prose naming the reader is not a hit.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { READ_PATH_ROOTS, readPathSourceFiles } from '../helpers/engine_source_corpus.ts';

/** Repo root (this file lives in test/unit/). */
const REPO_ROOT = resolve(import.meta.dir, '..', '..');

/**
 * The three roots the read path lives in — OWNED by the shared lister
 * (test/helpers/engine_source_corpus.ts), never chosen here: a corpus that can
 * drift per gate is a census nobody can trust (census_derivation_tripwire).
 */
const READ_ROOTS = READ_PATH_ROOTS;

/** Floor on the derived corpus — a walk that collapsed is not a census. */
const CORPUS_FLOOR = 60;

/**
 * Floor on the MEMOIZED call sites seen. Without it, a tree where every reader
 * had been deleted (or renamed out of the scan's sight) would read as a clean
 * ratchet. Measured at the PERF-06 conversion: 19.
 */
const MEMOIZED_CALL_FLOOR = 15;

/** Shrink-only ceilings, measured at the PERF-06 conversion: 4 files, 6 calls. */
const CEILING_FILES = 4;
const CEILING_CALLS = 6;

/**
 * The write-path ledger: the call sites that must stay bare, each with the
 * reason the read-scoped memo would be WRONG there. Shrink-only, and a stale
 * entry (a file that no longer reads bare) is RED.
 */
const EXEMPTIONS: { file: string; reason: string }[] = [
	{
		file: 'src/core/relations/save.ts',
		reason:
			'the relation write path: it reads the host row inside its own transaction, after it has written to it — a memo would hand back the pre-write row and the save would decide on stale data',
	},
	{
		file: 'src/core/section/record/duplicate_record.ts',
		reason:
			'record duplication reads the SOURCE row and then re-reads the freshly INSERTED target to confirm it exists; both reads are inside the write transaction and must see what the transaction wrote',
	},
	{
		file: 'src/core/section/record/save_component.ts',
		reason:
			'the component save re-reads a relation TARGET row it may have just modified in the same transaction (the observer/mirror hop) — the point of the read is the post-write state',
	},
	{
		file: 'src/core/section/record/record_metadata.ts',
		reason:
			'reads the row to stamp its metadata during a save; the memo scope is never opened around a mutation, so a memoized read here would only misstate the intent',
	},
];

/** Strip block and line comments so prose naming the reader is not a hit. */
function stripComments(source: string): string {
	return source
		.replace(/\/\*[\s\S]*?\*\//g, '')
		.split('\n')
		.map((line) => line.replace(/\/\/.*$/, ''))
		.join('\n');
}

/**
 * The BARE reader's call sites in `source` (import/export statements excluded).
 * The lookbehind is what keeps `memoizedReadMatrixRecord(` out, and the `(`
 * is what keeps `readMatrixRecordBatch(` and type positions out.
 */
const BARE_RE = /(?<![A-Za-z0-9_$])readMatrixRecord\s*\(/g;
const MEMOIZED_RE = /(?<![A-Za-z0-9_$])memoizedReadMatrixRecord\s*\(/g;

function callsIn(source: string, pattern: RegExp): number {
	let total = 0;
	for (const line of stripComments(source).split('\n')) {
		if (/^\s*(import|export)\b/.test(line)) continue;
		total += line.match(new RegExp(pattern.source, 'g'))?.length ?? 0;
	}
	return total;
}

const CORPUS = readPathSourceFiles();

/** file (repo-relative) → bare call count, for every offending file. */
const OFFENDERS = new Map<string, number>();
let MEMOIZED_CALLS = 0;
for (const absolute of CORPUS) {
	const source = readFileSync(absolute, 'utf8');
	MEMOIZED_CALLS += callsIn(source, MEMOIZED_RE);
	const bare = callsIn(source, BARE_RE);
	if (bare > 0) OFFENDERS.set(absolute.slice(REPO_ROOT.length + 1), bare);
}

describe('read-path record reuse: the census is real', () => {
	test('the corpus is derived from the three read roots and is large', () => {
		expect(CORPUS.length).toBeGreaterThanOrEqual(CORPUS_FLOOR);
		for (const root of READ_ROOTS) {
			expect(CORPUS.some((file) => file.startsWith(resolve(REPO_ROOT, root)))).toBe(true);
		}
	});

	test('the memoized reader is what the read path actually uses (floor)', () => {
		expect(
			MEMOIZED_CALLS,
			'the read path stopped calling memoizedReadMatrixRecord — either the wave was reverted or the scan no longer sees it',
		).toBeGreaterThanOrEqual(MEMOIZED_CALL_FLOOR);
	});
});

describe('read-path record reuse: the detector', () => {
	test('positive control — a planted bare read is flagged', () => {
		expect(callsIn('const row = await readMatrixRecord(table, tipo, id);', BARE_RE)).toBe(1);
	});

	test('negative control — the memoized reader is NOT a bare read', () => {
		const source = [
			'const row = await memoizedReadMatrixRecord(table, tipo, id);',
			'const rows = await readMatrixRecordBatch(table, tipo, ids);',
		].join('\n');
		expect(callsIn(source, BARE_RE)).toBe(0);
		expect(callsIn(source, MEMOIZED_RE)).toBe(1);
	});

	test('negative control — an import and a type position are not call sites', () => {
		const source = [
			"import { readMatrixRecord } from '../db/matrix.ts';",
			'type Row = Awaited<ReturnType<typeof readMatrixRecord>>;',
		].join('\n');
		expect(callsIn(source, BARE_RE)).toBe(0);
	});

	test('negative control — prose naming the reader is not a call site', () => {
		const source = [
			'/** Never call readMatrixRecord( on the read path. */',
			'const row = null; // was readMatrixRecord(table, tipo, id)',
		].join('\n');
		expect(callsIn(source, BARE_RE)).toBe(0);
	});
});

describe('read-path record reuse: the shrink-only ledger', () => {
	test('no read-path module reads a matrix row bare', () => {
		const exempt = new Set(EXEMPTIONS.map((entry) => entry.file));
		const unexempted = [...OFFENDERS.entries()]
			.filter(([file]) => !exempt.has(file))
			.map(([file, count]) => `${file} (${count})`)
			.sort();
		expect(
			unexempted,
			`Bare readMatrixRecord on the READ path. Inside a section read the same whole row is then fetched once per component that wants it (K show-columns × R references = R×K identical full-row reads). Use memoizedReadMatrixRecord (src/core/db/record_memo.ts) — it degrades to a direct read outside a read scope, so nothing else changes. If this really is a WRITE path that must see what its own transaction wrote, add it to EXEMPTIONS with that reason: ${unexempted.join(' | ')}`,
		).toEqual([]);
	});

	test('every ledger entry still reads bare (a stale exemption is RED)', () => {
		const stale = EXEMPTIONS.filter((entry) => !OFFENDERS.has(entry.file)).map((e) => e.file);
		expect(
			stale,
			`These files no longer read a matrix row bare. DELETE their entries — the ledger is shrink-only and a stale line stops it describing the tree: ${stale.join(', ')}`,
		).toEqual([]);
	});

	test('the ledger only ever shrinks (files and calls)', () => {
		expect(EXEMPTIONS.length).toBeLessThanOrEqual(CEILING_FILES);
		const exempt = new Set(EXEMPTIONS.map((entry) => entry.file));
		const exemptCalls = [...OFFENDERS.entries()]
			.filter(([file]) => exempt.has(file))
			.reduce((sum, [, count]) => sum + count, 0);
		expect(exemptCalls).toBeLessThanOrEqual(CEILING_CALLS);
		// And when the count falls, the ceiling must fall with it.
		expect(CEILING_CALLS - exemptCalls).toBeLessThan(3);
	});

	test('every entry is unique and carries a substantive reason', () => {
		const files = EXEMPTIONS.map((entry) => entry.file);
		expect(new Set(files).size).toBe(files.length);
		for (const entry of EXEMPTIONS) {
			expect(
				entry.reason.trim().length,
				`${entry.file}: the exemption reason must SAY why the read-scoped memo would be wrong here`,
			).toBeGreaterThanOrEqual(40);
		}
	});
});

describe('read-path record reuse: the load-bearing defaults are pinned', () => {
	test('relation_list cell resolution defaults to the MEMOIZED reader', () => {
		// This is the default that closes labelOfReference (relations/related.ts
		// passes no loader): with a bare default, one reference costs one full-row
		// read PER show-column.
		const source = stripComments(
			readFileSync(resolve(REPO_ROOT, 'src/core/resolve/relation_list.ts'), 'utf8'),
		);
		const defaults = source.match(/opts\?\.loadRecord \?\? memoizedReadMatrixRecord/g) ?? [];
		expect(defaults.length).toBeGreaterThanOrEqual(2);
		expect(source).not.toContain('opts?.loadRecord ?? readMatrixRecord');
	});

	test('the read scope is still opened by readSection (the memo has a home)', () => {
		const source = stripComments(
			readFileSync(resolve(REPO_ROOT, 'src/core/section/read.ts'), 'utf8'),
		);
		expect(source).toMatch(/\brunWithRecordMemo\(/);
	});
});
