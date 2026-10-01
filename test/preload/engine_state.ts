/**
 * bun test preload — the ENGINE-OWNED state a booted server has, for a `bun test`
 * process that never boots one.
 *
 * 1. THE ENGINE ONTOLOGY (src/core/ontology/engine_ontology.ts). Production
 *    materializes it at boot (server.ts), right after the schema migrations: a
 *    code update reaches an installation through a restart, so boot is its
 *    update lane. A test process has no boot, so this is its twin — the same
 *    door, idempotent (it writes only when dd_ontology differs from
 *    engine_ontology.json). Without it a suite database built before a release
 *    that added an engine node would fail every metered AI door CLOSED
 *    (`ai.budget_unavailable`) — correct for production, and noise for gates
 *    whose subject is something else.
 * 2. THE AI SPEND LEDGER IS SWEPT (test/helpers/ai_spend_ledger.ts): every run
 *    starts with nothing spent, so no number of runs on one UTC day walks a
 *    fixture user into its budget.
 *
 * MUST NOT BREAK A DB-LESS RUN (the canonical_test3 posture): a failure WARNS and
 * continues — the hermetic tier has no Postgres, and the gates that need this
 * state then fail on their own terms.
 *
 * Escape hatch: DEDALO_TEST_SKIP_CANONICAL_RESTORE=true skips this too (a run that
 * deliberately inspects the database as it is).
 */

// Marks this file an ES module (top-level await). The imports are DYNAMIC on
// purpose: a static one would pull the DB layer into every test process at
// parse time, including the DB-less hermetic tier.
export {};

if (process.env.DEDALO_TEST_SKIP_CANONICAL_RESTORE !== 'true') {
	try {
		const { assertTestDatabase } = await import('../../src/core/test_data/test_database_marker.ts');
		await assertTestDatabase('test/preload/engine_state.ts');
		const { ensureEngineOntology } = await import('../../src/core/ontology/engine_ontology.ts');
		const ontology = await ensureEngineOntology();
		const { sweepAiSpendLedger } = await import('../helpers/ai_spend_ledger.ts');
		const swept = await sweepAiSpendLedger();
		console.log(
			`[test-preload] engine ontology ${ontology.changed ? `materialized (${ontology.written} records; drift was: ${ontology.drift.join('; ')})` : 'current'}; AI spend ledger swept (${swept} records)`,
		);
	} catch (error) {
		console.warn(
			`[test-preload] could NOT prepare the engine state (engine ontology + AI spend ledger) — metered AI doors will refuse ai.budget_unavailable. Harmless on the hermetic (DB-less) tier. Cause: ${(error as Error).message}`,
		);
	}
}
