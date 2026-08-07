/**
 * OBSERVER FAIL-SAFE GATES — the refusals that can withhold a recompute, and
 * the call-site shapes that must never regress.
 *
 * HISTORY, because it is the reason these gates exist. On 2026-08-02 an armed
 * data-wipe was measured (dry runs on real records: numisdata665/3120
 * 1077→0, /830 959→0, /345 766→0, /3122 700→0; exposure 118,449 + 13,357
 * mirror locators). It had two ingredients:
 *
 *  1. AN OMITTED-ARGUMENT HOLE — the shrink guard was `allowShrink === false`
 *     and the live cascade passed NO options, so `undefined` slipped past and
 *     a too-small recompute COMMITTED. The answer at the time was a blanket
 *     GROW-ONLY fail-safe plus an `allowShrink` opt-in.
 *  2. WRONG-LAW EXECUTION — nodes carrying an UNPORTED PHP sub-law
 *     (`source_overwrite` = sub-law b, `set_observed_data` = sub-law a) still
 *     present the covered observe shape, so discovery ran the DEFAULT law (c)
 *     on them — provably wrong (zero overlap with where their mirrors live).
 *
 * 2026-08-06: GROW-ONLY IS RETIRED and `allowShrink` is GONE. Its premise —
 * that the computed set was known too small — expired when the D3 closure
 * landed, and the blanket guard had become the defect: a mirror that can only
 * grow is not a mirror, so a legitimate removal was never propagated (the
 * reported numisdata36 equivalence case; corpus-wide 22 records / 1,673
 * locators of wrong data, every drop verified genuine). The full law now
 * persists, and the ONLY escapes are four refusals the KERNEL derives for
 * itself — no caller can grant or deny a shrink, which closes lesson (1) by
 * construction rather than by a gate on a parameter:
 *
 *   a. unported PHP sub-law    → refusedSublaw       (pre-compute)
 *   b. >2000-reference freeze  → refusedBigResult
 *   c. finite referencesLimit  → possiblyTruncated
 *   d. DEGRADED SEED           → skippedShrink + seedDefects
 *
 * (d) is the new one and the reason the flip was landable: a recompute whose
 * own seed hit a never-narrow escape (missing peer ontology node, non-tipo
 * data_from_field entry, malformed peer locator) applies its additions but
 * withholds its drops. Under grow-only a degraded seed cost nothing; under
 * the full law it would be a mass delete — the measured 247,933-locator-loss
 * shape. Precise, per-record, and un-disableable.
 *
 * Scratch hygiene: the behavioral tests seed throwaway dd_ontology nodes
 * (test99901-04, tld 'test' — a range no shipped ontology uses, so leftovers
 * from a crashed run are scratch by construction and are SWEPT before
 * seeding, never "skipped": the old warn-and-skip guard turned these gates
 * permanently vacuous-green after one SIGKILL between seed and sweep —
 * review 2026-08-02). The sub-law tests touch no matrix rows: both refusals
 * fire BEFORE table resolution, which the no-write assertions rely on (target
 * section 'zzz-none' has no matrix table either way). The degraded-seed test
 * DOES need a row, so it seeds and sweeps one on a scratch section.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { Glob } from 'bun';
import { getCounters } from '../../src/core/api/counters.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { recomputeExternalRelation } from '../../src/core/section/record/observers.ts';

const REPO_ROOT = join(import.meta.dir, '..', '..');
const KERNEL_FILE = 'src/core/section/record/observers.ts';
const kernelSource = readFileSync(join(REPO_ROOT, KERNEL_FILE), 'utf-8');

// ---------------------------------------------------------------------------
// 1. Static gates — the shrink fail-safe cannot be reopened silently.
// ---------------------------------------------------------------------------

/**
 * Find recomputeExternalRelation CALLS in `text` (definition excluded) and
 * return the ones passing fewer than `minArgs` arguments. Top-level commas
 * count arguments — but a house-style TRAILING comma is ignored (review
 * 2026-08-02: the pre-fix 5-arg live call site was multiline with a trailing
 * comma = 5 top-level commas, so a bare `commas < 5` check PASSED the exact
 * historical defect form; the fixture test below pins that hole closed).
 * Comment commas inside the args only push the count UP, never below.
 */
function scanForShortCalls(text: string, minArgs: number): { at: number; args: number }[] {
	const offenders: { at: number; args: number }[] = [];
	let from = 0;
	for (;;) {
		const at = text.indexOf('recomputeExternalRelation(', from);
		if (at === -1) break;
		from = at + 1;
		// skip the definition itself
		if (text.slice(Math.max(0, at - 20), at).includes('function ')) continue;
		const open = at + 'recomputeExternalRelation'.length;
		let depth = 0;
		let commas = 0;
		let end = -1;
		let lastMeaningful = '';
		for (let i = open; i < text.length; i++) {
			const ch = text[i] as string;
			if (ch === '(' || ch === '{' || ch === '[') depth++;
			else if (ch === ')' || ch === '}' || ch === ']') {
				depth--;
				if (depth === 0) {
					end = i;
					break; // the closing paren is never recorded as lastMeaningful
				}
			} else if (ch === ',' && depth === 1) commas++;
			if (!/\s/.test(ch)) lastMeaningful = ch;
		}
		// A trailing comma closes no argument — do not let it count as one.
		const args = commas + 1 - (lastMeaningful === ',' ? 1 : 0);
		if (end === -1 || args < minArgs) offenders.push({ at, args });
	}
	return offenders;
}

describe('observer shrink fail-safe (static)', () => {
	test('recomputeExternalRelation `options` is REQUIRED — no `= {}` default to slip past', () => {
		// The exact required-parameter form. `allowShrink` is deliberately NOT in
		// it any more (2026-08-06) — see the next test. A reintroduced default
		// initializer recreates the omitted-argument hole that armed the wipe.
		expect(kernelSource).toContain('options: { write?: boolean; referencesLimit?: number },');
		expect(/options:\s*\{[^}]*\}\s*=\s*\{\}/.test(kernelSource)).toBe(false);
	});

	test('there is NO caller-supplied shrink switch anywhere in src/ or scripts/', () => {
		// The strongest form of the 2026-08-02 lesson: a parameter that can mean
		// "allow the drop" is a hole no gate closes for good, because the unsafe
		// value is always one omitted argument away. The law is the law; the four
		// escapes below are derived by the kernel. Re-adding `allowShrink` — as a
		// kernel option, a ReconcileOption or a CLI flag — turns this RED.
		//
		// Scoped to the OBSERVER subsystem's own files. scripts/
		// media_repair_files_info.ts has an unrelated `--allow-shrink` of its
		// own (a files_info repair concept, different law, different data) and
		// is deliberately out of scope — a blanket repo scan would couple two
		// subsystems that share nothing but a word.
		const OBSERVER_FILES = [
			'src/core/section/record/observers.ts',
			'src/core/section/record/observer_reconcile.ts',
			'src/core/section/record/observer_subscriptions.ts',
			'src/core/section/record/save_component.ts',
			'src/core/section/record/delete_record.ts',
			'src/core/section/record/duplicate_record.ts',
			'src/core/relations/save.ts',
			'src/core/update/engine.ts',
			'scripts/observer_reconcile.ts',
		];
		const offenders: string[] = [];
		for (const file of OBSERVER_FILES) {
			for (const [index, line] of readFileSync(join(REPO_ROOT, file), 'utf-8')
				.split('\n')
				.entries()) {
				const code = line.trim();
				// Prose may narrate the retired flag; code may not use it.
				if (code.startsWith('*') || code.startsWith('//') || code.startsWith('/*')) continue;
				if (/allowShrink|--allow-shrink/.test(line)) {
					offenders.push(`${file}:${index + 1}: ${code}`);
				}
			}
		}
		expect(
			offenders,
			`A caller-supplied shrink switch is back. Drops are adjudicated by the KERNEL (unported sub-law / >2000 freeze / referencesLimit / degraded seed) — not by whoever calls it:\n${offenders.join('\n')}`,
		).toEqual([]);
	});

	test('all four kernel refusals are wired, each with its own counter', () => {
		// (a) unported PHP sub-law
		expect(kernelSource).toContain("'set_observed_data'");
		expect(kernelSource).toContain("'source_overwrite'");
		expect(kernelSource).toContain("incrementCounter('observers_unported_sublaw_refused')");
		// (b) >2000-reference freeze
		expect(kernelSource).toContain("incrementCounter('observers_big_result_refused')");
		// (c) finite references_limit
		expect(kernelSource).toContain("incrementCounter('observers_references_limit_refused')");
		// (d) degraded seed — the one that replaced blanket grow-only
		expect(kernelSource).toContain("incrementCounter('observers_shrink_refused_degraded_seed')");
		expect(kernelSource).toContain('defects.length > 0');
		// never-narrow skip
		expect(kernelSource).toContain("incrementCounter('observers_component_to_search_missing')");
	});

	test('every never-narrow seed escape feeds the per-call defect sink, not just a counter', () => {
		// A process-wide counter cannot answer "was THIS record's seed complete?"
		// — and that is exactly what the drop decision turns on. Each escape must
		// push into `defects` next to its incrementCounter, or a degraded seed
		// silently regains the power to mass-delete.
		for (const defect of [
			"defects?.push('malformed_peer_locator')",
			"defects?.push('invalid_data_from_field')",
			'defects?.push(`peer_node_missing:${peerTipo}`)',
		]) {
			expect(kernelSource, `seed escape not recorded in the defect sink: ${defect}`).toContain(
				defect,
			);
		}
	});

	test('the scanner itself flags the historical 5-argument call forms (trailing-comma hole closed)', () => {
		// The EXACT pre-fix live call shape (multiline, biome trailing comma) —
		// the one that armed the wipe. The old comma<5 check passed it.
		const multilineOldForm =
			'await recomputeExternalRelation(\n\tobserverTipo,\n\tString(target.section_tipo),\n\tNumber(target.section_id),\n\tuserId,\n\tnow,\n);';
		const singleLineOldForm = 'await recomputeExternalRelation(a, b, c, userId, now);';
		const currentForm = 'await recomputeExternalRelation(a, b, c, userId, now, {});';
		expect(scanForShortCalls(multilineOldForm, 6).length).toBe(1);
		expect(scanForShortCalls(singleLineOldForm, 6).length).toBe(1);
		expect(scanForShortCalls(currentForm, 6).length).toBe(0);
	});

	test('every call site in src/ + scripts/ passes the options argument (states write intent)', () => {
		const offenders: string[] = [];
		for (const dir of ['src', 'scripts']) {
			const glob = new Glob('**/*.ts');
			for (const match of glob.scanSync({ cwd: join(REPO_ROOT, dir) })) {
				const file = relative(REPO_ROOT, join(REPO_ROOT, dir, match));
				const text = readFileSync(join(REPO_ROOT, file), 'utf-8');
				for (const short of scanForShortCalls(text, 6)) {
					offenders.push(
						`${file}@${short.at}: call with ${short.args} argument(s) — options (write intent) not stated`,
					);
				}
			}
		}
		expect(offenders).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// 1b. Static gates — every propagation door states what the change REMOVED.
// ---------------------------------------------------------------------------

/**
 * Find propagateToObservers CALLS and return those whose 4th argument does not
 * state a `removed:` key. Reuses the bracket-depth walk above rather than a
 * regex: the argument spans multiple lines and contains nested object literals.
 */
function scanCallsMissingRemoved(text: string): { at: number; snippet: string }[] {
	const offenders: { at: number; snippet: string }[] = [];
	let from = 0;
	for (;;) {
		const at = text.indexOf('propagateToObservers(', from);
		if (at === -1) break;
		from = at + 1;
		// skip the definition and the import/destructure forms
		const before = text.slice(Math.max(0, at - 30), at);
		if (before.includes('function ') || before.includes('{ ')) continue;
		const open = at + 'propagateToObservers'.length;
		let depth = 0;
		let end = -1;
		for (let i = open; i < text.length; i++) {
			const ch = text[i] as string;
			if (ch === '(' || ch === '{' || ch === '[') depth++;
			else if (ch === ')' || ch === '}' || ch === ']') {
				depth--;
				if (depth === 0) {
					end = i;
					break;
				}
			}
		}
		if (end === -1) continue;
		const args = text.slice(open, end + 1);
		if (!args.includes('removed:')) offenders.push({ at, snippet: args.slice(0, 120) });
	}
	return offenders;
}

describe('removal plumbing (static)', () => {
	test('the observed parameter has no default initializer (removed can never be implied)', () => {
		// The mirror of the `options` gate above. A default would make "nothing
		// was removed" the silent fallback — which IS the bug this change fixed.
		expect(kernelSource).toContain('observed: ObservedChange,');
		expect(/observed:\s*ObservedChange\s*=/.test(kernelSource)).toBe(false);
		// `removed` is required on the interface, not optional.
		expect(kernelSource).toContain('removed: unknown[];');
		expect(kernelSource).not.toContain('removed?: unknown[];');
	});

	test('every propagateToObservers call site in src/ states its removed set', () => {
		const offenders: string[] = [];
		for (const dir of ['src', 'scripts']) {
			const glob = new Glob('**/*.ts');
			for (const match of glob.scanSync({ cwd: join(REPO_ROOT, dir) })) {
				const file = relative(REPO_ROOT, join(REPO_ROOT, dir, match));
				const text = readFileSync(join(REPO_ROOT, file), 'utf-8');
				for (const short of scanCallsMissingRemoved(text)) {
					offenders.push(`${file}@${short.at}: ${short.snippet}`);
				}
			}
		}
		expect(
			offenders,
			`A propagation door does not state what it REMOVED. Propagation used to see the post-save value alone, so a dropped locator's mirror was never revisited and kept a dead reference forever. Pass { saved, removed } — '[]' is a fine answer, silence is not:\n${offenders.join('\n')}`,
		).toEqual([]);
	});

	test('the save chokepoint diffs on locator identity, never on item id', () => {
		// An `update` that RETARGETS a locator replaces the object in place and
		// keeps its id, so an id-keyed diff sees neither the old target leaving
		// nor the new one arriving.
		const saveSource = readFileSync(
			join(REPO_ROOT, 'src/core/section/record/save_component.ts'),
			'utf-8',
		);
		expect(saveSource).toContain('const preSaveItems');
		expect(saveSource).toContain('`${locator.section_tipo}|${String(locator.section_id)}`');
		// dd490 frames are pairing records, not edges — excluded like the seed does.
		expect(saveSource).toContain('locator.type === DATAFRAME_RELATION_TYPE');
	});
});

// ---------------------------------------------------------------------------
// 2. Behavioral gates — unported sub-laws refused, never-narrow skip counted.
// ---------------------------------------------------------------------------

/** Scratch dd_ontology nodes: covered observe shape + the poisoned source. */
const SCRATCH_NODES: { tipo: string; source: Record<string, unknown> }[] = [
	{
		tipo: 'test99901',
		source: {
			// sub-law (b) — the numisdata679/965 shape that armed the wipe
			source_overwrite: { data_from_field: 'test1' },
			section_to_search: ['rsc205'],
			component_to_search: ['rsc387'],
		},
	},
	{
		tipo: 'test99902',
		source: {
			// sub-law (a)
			set_observed_data: 'test1',
			section_to_search: ['rsc205'],
			component_to_search: ['rsc387'],
		},
	},
	{
		tipo: 'test99903',
		// never-narrow guard: covered shape but NO component_to_search
		source: { section_to_search: ['rsc205'] },
	},
	{
		tipo: 'test99904',
		// DEGRADED SEED: data_from_field names a peer with NO ontology node, so
		// the closure half of the seed cannot be computed. The law still returns
		// an answer (the stored-bag fallback) but that answer is KNOWN
		// incomplete — the measured 247,933-locator-loss shape — so its DROP
		// half must not persist.
		source: {
			data_from_field: ['test99999_no_such_node'],
			section_to_search: ['rsc205'],
			component_to_search: ['rsc387'],
		},
	},
];

/** Scratch matrix row for the degraded-seed gate (its own band, swept below). */
const DEGRADED_SECTION = 'rsc205';
const DEGRADED_ID = 91078;
/** A stale mirror entry: nothing references DEGRADED_ID, so the law wants 0. */
const DEGRADED_STALE_ENTRY = {
	id: 1,
	type: 'dd151',
	section_id: '91079',
	section_tipo: 'rsc205',
	from_component_tipo: 'test99904',
};

async function clearResolverCaches(): Promise<void> {
	const { clearOntologyDerivedCaches } = await import(
		'../../src/core/ontology/cache_invalidation.ts'
	);
	await clearOntologyDerivedCaches();
}

async function sweepScratchNodes(): Promise<void> {
	await sql.unsafe(`DELETE FROM dd_ontology WHERE tipo LIKE 'test999%' AND tld = 'test'`);
}

async function sweepScratchRows(): Promise<void> {
	await sql.unsafe(`DELETE FROM matrix WHERE section_tipo = $1 AND section_id = $2`, [
		DEGRADED_SECTION,
		DEGRADED_ID,
	]);
	await sql.unsafe(`DELETE FROM matrix_time_machine WHERE section_tipo = $1 AND section_id = $2`, [
		DEGRADED_SECTION,
		DEGRADED_ID,
	]);
}

beforeAll(async () => {
	// Residue-tolerant: sweep first (test999*/tld 'test' is scratch by
	// construction), THEN seed unconditionally — leftovers from a crashed run
	// must never turn these gates vacuous-green (see header).
	await sweepScratchNodes();
	await sweepScratchRows();
	for (const node of SCRATCH_NODES) {
		await sql.unsafe(
			`INSERT INTO dd_ontology (id, tipo, parent, model, tld, properties)
			 VALUES ((SELECT COALESCE(MAX(id), 0) + 1200 FROM dd_ontology), $1, 'test3', 'component_autocomplete_hi', 'test', $2::text::jsonb)`,
			[node.tipo, JSON.stringify({ source: node.source })],
		);
	}
	await clearResolverCaches();
});

afterAll(async () => {
	await sweepScratchNodes();
	await sweepScratchRows();
	await clearResolverCaches();
});

describe('unported sub-law refusal (behavioral)', () => {
	for (const [tipo, key] of [
		['test99901', 'source_overwrite'],
		['test99902', 'set_observed_data'],
	] as const) {
		test(`${key} node is refused BEFORE any write — the refusal precedes every read`, async () => {
			const before = getCounters().observers_unported_sublaw_refused ?? 0;
			const outcome = await recomputeExternalRelation(
				tipo,
				'zzz-none',
				999999901,
				-1,
				new Date(),
				{},
			);
			// refusedSublaw keeps the refusal visible to aggregating callers (the
			// reconciler must never count these nodes as clean).
			expect(outcome).toEqual({ changed: false, before: 0, after: 0, refusedSublaw: key });
			expect((getCounters().observers_unported_sublaw_refused ?? 0) - before).toBe(1);
			// no write of ANY kind reached the DB for the scratch tipo
			const tm = (await sql.unsafe('SELECT 1 FROM matrix_time_machine WHERE tipo = $1 LIMIT 1', [
				tipo,
			])) as unknown[];
			expect(tm.length).toBe(0);
		});
	}
});

describe('degraded seed refuses the drop half (behavioral)', () => {
	test('a data_from_field peer with NO ontology node withholds drops, keeps additions, names the defect', async () => {
		// This is THE gate that made retiring grow-only landable. Without it, a
		// partially-installed ontology turns every save into a mass delete.
		await sql.unsafe(
			`INSERT INTO matrix (section_id, section_tipo, relation) VALUES ($1, $2, $3::text::jsonb)`,
			[DEGRADED_ID, DEGRADED_SECTION, JSON.stringify({ test99904: [DEGRADED_STALE_ENTRY] })],
		);
		const seedMissingBefore = getCounters().observers_seed_peer_node_missing ?? 0;
		const refusedBefore = getCounters().observers_shrink_refused_degraded_seed ?? 0;

		const outcome = await recomputeExternalRelation(
			'test99904',
			DEGRADED_SECTION,
			DEGRADED_ID,
			-1,
			new Date(),
			{},
		);

		// The law wants to drop the single stale entry (nothing references this
		// record) — and is REFUSED, because the seed could not be built.
		expect(outcome.changed).toBe(true);
		expect(outcome.before).toBe(1);
		expect(outcome.after).toBe(0);
		expect(outcome.skippedShrink).toBe(true);
		expect(outcome.seedDefects).toEqual(['peer_node_missing:test99999_no_such_node']);
		// A withheld pure shrink writes NOTHING — no live change, no cascade hop.
		expect(outcome.wrote).toBeUndefined();
		expect((getCounters().observers_seed_peer_node_missing ?? 0) - seedMissingBefore).toBe(1);
		expect((getCounters().observers_shrink_refused_degraded_seed ?? 0) - refusedBefore).toBe(1);

		// The stored bag is byte-untouched.
		const rows = (await sql.unsafe(
			`SELECT relation->'test99904' AS bag FROM matrix WHERE section_tipo = $1 AND section_id = $2`,
			[DEGRADED_SECTION, DEGRADED_ID],
		)) as { bag: unknown[] | null }[];
		expect(rows[0]?.bag).toEqual([DEGRADED_STALE_ENTRY]);
	});

	test('the dry run reports the SAME refusal, so an operator sees it before applying', async () => {
		const diff = await recomputeExternalRelation(
			'test99904',
			DEGRADED_SECTION,
			DEGRADED_ID,
			-1,
			new Date(),
			{ write: false },
		);
		expect(diff.skippedShrink).toBe(true);
		expect(diff.seedDefects).toEqual(['peer_node_missing:test99999_no_such_node']);
		// before/after always describe the FULL-LAW diff (the return contract).
		expect(diff.before).toBe(1);
		expect(diff.after).toBe(0);
	});
});

describe('never-narrow: missing component_to_search is a counted skip', () => {
	test('a covered node without source.component_to_search skips loudly (counter), no write', async () => {
		const before = getCounters().observers_component_to_search_missing ?? 0;
		const outcome = await recomputeExternalRelation(
			'test99903',
			'zzz-none',
			999999901,
			-1,
			new Date(),
			{},
		);
		expect(outcome).toEqual({ changed: false, before: 0, after: 0 });
		expect((getCounters().observers_component_to_search_missing ?? 0) - before).toBe(1);
	});
});
