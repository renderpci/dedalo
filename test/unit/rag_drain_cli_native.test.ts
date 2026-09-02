/**
 * RAG DRAIN CLI — importable, and its two database-free exits pinned (GATE-41
 * residue: `src/ai/rag/cli/rag_drain.ts` was a production entrypoint that ran
 * an UNGUARDED top-level `main()` + `process.exit`, so importing it executed
 * it — which is why no test loaded it and `production_entrypoint_coverage_tripwire`
 * reported it. The body now lives in `runRagDrainCli(args)` behind
 * `if (import.meta.main)`.)
 *
 * HERMETIC by construction: neither leg reaches Postgres — the RAG switch is
 * read BEFORE the arguments, and a usage error is answered BEFORE
 * `ensureRagQueueTable()`. The order is the contract here (a cron line on an
 * install with RAG off must exit 0 without a database round-trip), and it is
 * what a closed DB_PORT measures: with the order swapped this file reds under
 * `DB_PORT=1`, and only there — a connected suite would not notice.
 */

import { afterEach, describe, expect, test } from 'bun:test';
import { parseDrainArguments, runRagDrainCli } from '../../src/ai/rag/cli/rag_drain.ts';

const savedRagEnabled = process.env.DEDALO_RAG_ENABLED;
afterEach(() => {
	// assigning undefined would leave the string 'undefined' in process.env
	if (savedRagEnabled === undefined) delete process.env.DEDALO_RAG_ENABLED;
	else process.env.DEDALO_RAG_ENABLED = savedRagEnabled;
});

describe('parseDrainArguments', () => {
	test('no arguments → batch 100, no reconcile', () => {
		expect(parseDrainArguments([])).toEqual({
			kind: 'run',
			batch: 100,
			reconcileSectionTipo: null,
		});
	});

	test('a bare batch, and a batch after --reconcile <tipo>', () => {
		expect(parseDrainArguments(['25'])).toEqual({
			kind: 'run',
			batch: 25,
			reconcileSectionTipo: null,
		});
		expect(parseDrainArguments(['--reconcile', 'test3', '7'])).toEqual({
			kind: 'run',
			batch: 7,
			reconcileSectionTipo: 'test3',
		});
		expect(parseDrainArguments(['7', '--reconcile', 'test3'])).toEqual({
			kind: 'run',
			batch: 7,
			reconcileSectionTipo: 'test3',
		});
	});

	test('a non-numeric batch falls back to 100', () => {
		expect(parseDrainArguments(['lots'])).toEqual({
			kind: 'run',
			batch: 100,
			reconcileSectionTipo: null,
		});
	});

	test('--reconcile without a section tipo (bare, or followed by a flag) is the usage error', () => {
		expect(parseDrainArguments(['--reconcile'])).toEqual({
			kind: 'usage_error',
			message: '--reconcile requires a <section_tipo> argument',
		});
		expect(parseDrainArguments(['--reconcile', '--other'])).toEqual({
			kind: 'usage_error',
			message: '--reconcile requires a <section_tipo> argument',
		});
	});
});

describe('runRagDrainCli — the database-free exits', () => {
	test('RAG disabled → exit 0 without touching the queue table (whatever the arguments)', async () => {
		process.env.DEDALO_RAG_ENABLED = 'false';
		expect(await runRagDrainCli([])).toBe(0);
		expect(await runRagDrainCli(['--reconcile'])).toBe(0);
	});

	test('RAG enabled + usage error → exit 1 BEFORE any database access', async () => {
		process.env.DEDALO_RAG_ENABLED = 'true';
		expect(await runRagDrainCli(['--reconcile'])).toBe(1);
	});
});
