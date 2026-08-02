/**
 * OBSERVER FAIL-SAFE GATES (Phase-0 disarm, 2026-08-02) — DEC-12 twins of the
 * three guards added to src/core/section/record/observers.ts after the armed
 * data-wipe was measured (dry runs on real records: numisdata665/3120
 * 1077→0, /830 959→0, /345 766→0, /3122 700→0; exposure 118,449 + 13,357
 * mirror locators). The wipe had two ingredients, each gated here:
 *
 *  1. SHRINK OPT-OUT HOLE — the old guard was `allowShrink === false`, and
 *     the live cascade passed NO options, so undefined slipped past and a
 *     too-small recompute COMMITTED. STATIC gates: the `options` parameter is
 *     REQUIRED (no `= {}` default), every call site in src/ + scripts/
 *     passes it, and the guard is the refuse-by-default form
 *     (`allowShrink !== true`). The fail-safe is GROW-ONLY and
 *     MEMBERSHIP-based (review 2026-08-02): additions always persist, no
 *     stored entry is ever dropped without opt-in (a 1-drop+1-add swap can no
 *     longer mask the drop behind an equal length). The BEHAVIORAL half
 *     (default withholds drops but applies grows, masked swap included, only
 *     explicit opt-in drops) lives in observer_reconcile_native.test.ts,
 *     where the seeded mirror machinery already exists.
 *
 *  2. WRONG-LAW EXECUTION — nodes carrying an UNPORTED PHP sub-law
 *     (`source_overwrite` = sub-law b, `set_observed_data` = sub-law a) still
 *     present the covered observe shape, so discovery runs the DEFAULT law
 *     (c) on them — provably the wrong law (zero overlap with where their
 *     mirrors live). BEHAVIORAL gates: such a node is REFUSED before any
 *     write (counter observers_unported_sublaw_refused, outcome flag
 *     refusedSublaw so aggregators never report it as clean), even when the
 *     caller grants allowShrink. Plus the never-narrow guard: a missing
 *     source.component_to_search is a counted, logged skip
 *     (observers_component_to_search_missing), not a silent no-op.
 *
 * Scratch hygiene: the behavioral tests seed throwaway dd_ontology nodes
 * (test99901-03, tld 'test' — a range no shipped ontology uses, so leftovers
 * from a crashed run are scratch by construction and are SWEPT before
 * seeding, never "skipped": the old warn-and-skip guard turned these gates
 * permanently vacuous-green after one SIGKILL between seed and sweep —
 * review 2026-08-02). No matrix rows are ever touched: both refusals fire
 * BEFORE table resolution, which the no-write assertions rely on (target
 * section 'zzz-none' has no matrix table either way).
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
		// The exact required-parameter form (D3 added referencesLimit — refused
		// when finite, never honoured); a reintroduced default initializer
		// recreates the omitted-argument hole that armed the wipe.
		expect(kernelSource).toContain(
			'options: { write?: boolean; allowShrink?: boolean; referencesLimit?: number },',
		);
		expect(/options:\s*\{[^}]*\}\s*=\s*\{\}/.test(kernelSource)).toBe(false);
	});

	test('the shrink guard is refuse-by-default (`allowShrink !== true`), never opt-out (`=== false`)', () => {
		expect(kernelSource).toContain('options.allowShrink !== true');
		expect(kernelSource).not.toContain('options.allowShrink === false');
	});

	test('the unported sub-law refusal names both PHP sub-law keys and counts refusals', () => {
		expect(kernelSource).toContain("'set_observed_data'");
		expect(kernelSource).toContain("'source_overwrite'");
		expect(kernelSource).toContain("incrementCounter('observers_unported_sublaw_refused')");
		expect(kernelSource).toContain("incrementCounter('observers_component_to_search_missing')");
	});

	test('the scanner itself flags the historical 5-argument call forms (trailing-comma hole closed)', () => {
		// The EXACT pre-fix live call shape (multiline, biome trailing comma) —
		// the one that armed the wipe. The old comma<5 check passed it.
		const multilineOldForm =
			'await recomputeExternalRelation(\n\tobserverTipo,\n\tString(target.section_tipo),\n\tNumber(target.section_id),\n\tuserId,\n\tnow,\n);';
		const singleLineOldForm = 'await recomputeExternalRelation(a, b, c, userId, now);';
		const currentForm =
			'await recomputeExternalRelation(a, b, c, userId, now, { allowShrink: false });';
		expect(scanForShortCalls(multilineOldForm, 6).length).toBe(1);
		expect(scanForShortCalls(singleLineOldForm, 6).length).toBe(1);
		expect(scanForShortCalls(currentForm, 6).length).toBe(0);
	});

	test('every call site in src/ + scripts/ passes the options argument (states shrink intent)', () => {
		const offenders: string[] = [];
		for (const dir of ['src', 'scripts']) {
			const glob = new Glob('**/*.ts');
			for (const match of glob.scanSync({ cwd: join(REPO_ROOT, dir) })) {
				const file = relative(REPO_ROOT, join(REPO_ROOT, dir, match));
				const text = readFileSync(join(REPO_ROOT, file), 'utf-8');
				for (const short of scanForShortCalls(text, 6)) {
					offenders.push(
						`${file}@${short.at}: call with ${short.args} argument(s) — options (shrink intent) not stated`,
					);
				}
			}
		}
		expect(offenders).toEqual([]);
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
];

async function clearResolverCaches(): Promise<void> {
	const { clearOntologyDerivedCaches } = await import(
		'../../src/core/ontology/cache_invalidation.ts'
	);
	await clearOntologyDerivedCaches();
}

async function sweepScratchNodes(): Promise<void> {
	await sql.unsafe(`DELETE FROM dd_ontology WHERE tipo LIKE 'test999%' AND tld = 'test'`);
}

beforeAll(async () => {
	// Residue-tolerant: sweep first (test999*/tld 'test' is scratch by
	// construction), THEN seed unconditionally — leftovers from a crashed run
	// must never turn these gates vacuous-green (see header).
	await sweepScratchNodes();
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
	await clearResolverCaches();
});

describe('unported sub-law refusal (behavioral)', () => {
	for (const [tipo, key] of [
		['test99901', 'source_overwrite'],
		['test99902', 'set_observed_data'],
	] as const) {
		test(`${key} node is refused BEFORE any write — even with allowShrink granted`, async () => {
			const before = getCounters().observers_unported_sublaw_refused ?? 0;
			const outcome = await recomputeExternalRelation(tipo, 'zzz-none', 999999901, -1, new Date(), {
				allowShrink: true,
			});
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
