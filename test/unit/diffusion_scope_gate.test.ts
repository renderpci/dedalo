/**
 * Foundation security audit — diffusion authorization gates (DIFF-01, DIFF-02).
 *
 * DIFF-01: a section-wide diffuse must publish only the enqueuing principal's
 * in-scope records — `selectRecordBatches` now applies the caller's projects
 * filter (the primary selection is a Postgres read, testable without MariaDB).
 * DIFF-02: `retry_pending_deletions` re-drives the GLOBAL pending-unpublish queue
 * and must be admin-only, like its siblings validate / rebuild_media_index.
 */

import { describe, expect, test } from 'bun:test';
import type { ApiRequestContext } from '../../src/core/api/handler_context.ts';
import { diffusionApiActions } from '../../src/core/api/handlers/dd_diffusion_api.ts';
import type { Principal } from '../../src/core/security/permissions.ts';
import { selectRecordBatches } from '../../src/diffusion/resolve/selection.ts';

const GATED_SECTION = 'numisdata267'; // gated by component_filter numisdata21 (projects)
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
	test('a non-admin is denied (result:false, insufficient permissions)', async () => {
		const context = { principal: NO_PROJECTS } as ApiRequestContext;
		const handler = diffusionApiActions.retry_pending_deletions;
		expect(handler).toBeDefined();
		const result = await handler!(
			{ dd_api: 'dd_diffusion_api', action: 'retry_pending_deletions' } as never,
			context,
		);
		const body = result.body as { result?: boolean; errors?: string[] };
		expect(body.result).toBe(false);
		expect(body.errors).toContain('insufficient permissions');
	});
});
