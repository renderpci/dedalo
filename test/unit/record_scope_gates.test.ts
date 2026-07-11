/**
 * Foundation security audit — Tier-0 regression gates (AUTHZ-01, AUTHZ-02, AI-01).
 *
 * The per-record projects (tenant) filter is a READ boundary as well as a WRITE
 * boundary. The audit found it enforced on the human write doors but SKIPPED on
 * three read/write doors that address a record directly (no sqo ⇒ the per-target
 * Gate B never runs): component `get_data` (AUTHZ-01, live cross-tenant read),
 * `resolve_data` injected locators (AUTHZ-02), and the MCP write tools (AI-01).
 * The fix funnels all three through the shared `principalCanAccessRecord` helper.
 *
 * Fixture: `numisdata267` is gated by `component_filter numisdata21` (projects).
 * A synthetic non-admin with NO projects sees none of its records via the
 * scoped search — so `get_data`/`resolve_data`/MCP writes must NOT leak them.
 * Read-only against the live DB (record 1 is never mutated).
 */

import { afterEach, describe, expect, mock, test } from 'bun:test';
import { routeSectionRead } from '../../src/core/section/read_facade.ts';
import type { Principal } from '../../src/core/security/permissions.ts';
import * as realRecordScope from '../../src/core/security/record_scope.ts';
import { isRecordInScope, principalCanAccessRecord } from '../../src/core/security/record_scope.ts';

// Snapshot the REAL module exports before any mock.module swap. Bun's
// mock.module is process-global and mock.restore() does NOT revert it, so the
// AI-01 deny-stub below would otherwise leak an always-false
// principalCanAccessRecord into every later test that hits the read-path scope
// gate (read_facade AUTHZ-01) — reproduced: it turned 7 portal/relation/MCP
// parity gates red in full-suite order. afterEach re-installs the real module.
const REAL_RECORD_SCOPE = { ...realRecordScope };
afterEach(() => {
	mock.module('../../src/core/security/record_scope.ts', () => REAL_RECORD_SCOPE);
	mock.restore();
});

const GATED_SECTION = 'numisdata267';
const GATED_RECORD_ID = 1;

const SUPERUSER: Principal = { userId: -1, isGlobalAdmin: true, isDeveloper: true };
/** Synthetic non-admin with NO projects ⇒ out of scope on any gated record. */
const NO_PROJECTS: Principal = { userId: 987654321, isGlobalAdmin: false, isDeveloper: false };

describe('record scope — shared helper (principalCanAccessRecord)', () => {
	test('global admin is unconditionally in scope (unscoped)', async () => {
		expect(await principalCanAccessRecord(GATED_SECTION, GATED_RECORD_ID, SUPERUSER)).toBe(true);
	});

	test('a no-projects non-admin is OUT of scope on a project-gated record', async () => {
		// Sanity: the underlying scoped search also excludes it.
		expect(await isRecordInScope(GATED_SECTION, GATED_RECORD_ID, NO_PROJECTS)).toBe(false);
		expect(await principalCanAccessRecord(GATED_SECTION, GATED_RECORD_ID, NO_PROJECTS)).toBe(false);
	});
});

describe('root user record (dd128,-1) — record-level gate beats the admin bypass', () => {
	test('principalCanAccessRecord refuses -1 even for the superuser (PHP class.security.php:1007)', async () => {
		expect(await principalCanAccessRecord('dd128', -1, SUPERUSER)).toBe(false);
		expect(await isRecordInScope('dd128', -1, SUPERUSER)).toBe(false);
	});

	test('a get_data on (dd128,-1) returns the EMPTY shell even for the superuser', async () => {
		const rqo = {
			dd_api: 'dd_core_api',
			action: 'read',
			source: {
				action: 'get_data',
				tipo: 'dd132', // Username — a real dd128 component
				section_tipo: 'dd128',
				section_id: -1,
				lang: 'lg-nolan',
			},
		} as unknown as Parameters<typeof routeSectionRead>[0];
		const result = await routeSectionRead(rqo, SUPERUSER);
		const data = (result.body as { result?: { data?: unknown[] } }).result?.data ?? [];
		expect(Array.isArray(data)).toBe(true);
		expect(data.length).toBe(0);
	});
});

describe('AUTHZ-01 — get_data read path enforces the projects filter', () => {
	test('a no-projects non-admin get_data returns the EMPTY shell, not the record', async () => {
		// Pre-fix, this read path returned the record's component value directly
		// (readComponentData is unscoped). Post-fix, the scope gate short-circuits
		// to the PHP empty shell before the record is read.
		const rqo = {
			dd_api: 'dd_core_api',
			action: 'read',
			source: {
				action: 'get_data',
				tipo: GATED_SECTION,
				section_tipo: GATED_SECTION,
				section_id: GATED_RECORD_ID,
				lang: 'lg-nolan',
			},
		} as unknown as Parameters<typeof routeSectionRead>[0];
		const result = await routeSectionRead(rqo, NO_PROJECTS);
		const data = (result.body as { result?: { data?: unknown[] } }).result?.data ?? [];
		expect(Array.isArray(data)).toBe(true);
		expect(data.length).toBe(0);
	});
});

describe('AI-01 — MCP write tools honor the per-record scope gate', () => {
	// The write tools reject a level-authorized but out-of-scope record. There is
	// no real non-admin with level>=2 on a gated section in this fixture DB, so we
	// force the shared scope helper to DENY and assert the tool surfaces it (the
	// wiring regression — pre-fix the tools never called the helper at all).
	test('saveComponentValue throws when the record is out of scope', async () => {
		mock.module('../../src/core/security/record_scope.ts', () => ({
			principalCanAccessRecord: async () => false,
		}));
		const { saveComponentValue, deleteRecord } = await import('../../src/ai/mcp/tools.ts');
		await expect(
			saveComponentValue(SUPERUSER, {
				section_tipo: 'test2',
				tipo: 'test2',
				section_id: 999999,
				action: 'update',
				value: { value: 'x' },
			}),
		).rejects.toThrow(/out of the user scope/);
		await expect(
			deleteRecord(SUPERUSER, { section_tipo: 'test2', section_id: 999999 }),
		).rejects.toThrow(/out of the user scope/);
		// Module restoration handled by the file-level afterEach (mock.restore()
		// alone does not revert mock.module in this Bun version).
	});
});
