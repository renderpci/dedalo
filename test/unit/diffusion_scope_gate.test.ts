/**
 * Foundation security audit — diffusion authorization gates (DIFF-01, DIFF-02).
 *
 * DIFF-01: a section-wide diffuse must publish only the enqueuing principal's
 * in-scope records — `selectRecordBatches` now applies the caller's projects
 * filter (the primary selection is a Postgres read, testable without MariaDB).
 * DIFF-02: `retry_pending_deletions` re-drives the GLOBAL pending-unpublish queue
 * and must be admin-only, like its siblings validate / rebuild_media_index.
 */
// Migrated to the generic `test` TLD 2026-08-19: the gated section is the test-TLD
// twin, and this gate PROVISIONS its records itself (ensure/dropTestCorpus).

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { ApiRequestContext } from '../../src/core/api/handler_context.ts';
import { diffusionApiActions } from '../../src/core/api/handlers/dd_diffusion_api.ts';
import { DedaloError } from '../../src/core/errors/dedalo_error.ts';
import type { Principal } from '../../src/core/security/permissions.ts';
import { dropTestCorpus, ensureTestCorpus } from '../../src/core/test_data/test_corpus/ensure.ts';
import { selectRecordBatches } from '../../src/diffusion/resolve/selection.ts';

const GATED_SECTION = 'test6310'; // gated by component_filter test6107 (projects)

beforeAll(async () => {
	await ensureTestCorpus([GATED_SECTION]);
});
afterAll(async () => {
	expect(await dropTestCorpus([GATED_SECTION])).toBe(0);
});
const SUPERUSER: Principal = { userId: -1, isGlobalAdmin: true, isDeveloper: true };
const NO_PROJECTS: Principal = { userId: 987654321, isGlobalAdmin: false, isDeveloper: false };

async function firstBatchHasRecords(principal?: Principal): Promise<boolean> {
	for await (const batch of selectRecordBatches(
		{ section_tipo: [GATED_SECTION] } as never,
		GATED_SECTION,
		500,
		0,
		principal,
	)) {
		return batch.sectionIds.length > 0;
	}
	return false;
}

describe('DIFF-01 — diffuse selection honors the enqueuing principal projects filter', () => {
	test('unscoped selection (no principal) sees the gated section records', async () => {
		expect(await firstBatchHasRecords(undefined)).toBe(true);
	});
	test('a global admin owner selects unscoped (sees records)', async () => {
		expect(await firstBatchHasRecords(SUPERUSER)).toBe(true);
	});
	test('a no-projects non-admin owner selects NOTHING (no out-of-scope publish)', async () => {
		expect(await firstBatchHasRecords(NO_PROJECTS)).toBe(false);
	});
});

describe('DIFF-02 — retry_pending_deletions is admin-only', () => {
	// ENVELOPE v2 (engineering/ERRORS_SPEC.md §4): the refusal is a THROWN
	// `perm.denied` (403) — the handler builds no failure body, and the dispatch
	// chokepoint converts. What the gate pins is the CODE, not the prose.
	test('a non-admin is denied (perm.denied, 403)', async () => {
		const context = { principal: NO_PROJECTS } as ApiRequestContext;
		const handler = diffusionApiActions.retry_pending_deletions;
		expect(handler).toBeDefined();
		const outcome = await handler!(
			{ dd_api: 'dd_diffusion_api', action: 'retry_pending_deletions' } as never,
			context,
		).then(
			(value) => ({ threw: false as const, value }),
			(error: unknown) => ({ threw: true as const, error }),
		);
		if (!outcome.threw) throw new Error(`expected a refusal, got ${JSON.stringify(outcome.value)}`);
		expect(outcome.error).toBeInstanceOf(DedaloError);
		expect((outcome.error as DedaloError).code).toBe('perm.denied');
		expect((outcome.error as DedaloError).spec.status).toBe(403);
		// The required level rides the LOG-ONLY coordinates, never the wire.
		expect((outcome.error as DedaloError).coordinates).toMatchObject({
			action: 'retry_pending_deletions',
			required: 'global_admin',
		});
	});
});
