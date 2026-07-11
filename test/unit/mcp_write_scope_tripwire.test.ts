/**
 * TRIPWIRE: every MCP write tool asserts the per-record projects scope gate
 * (foundation audit AI-01). This is MECHANICAL — it iterates
 * TOOL_REGISTRY.filter(t => t.write) so a NEW write tool that forgets
 * principalCanAccessRecord fails here, not in production.
 *
 * Method: force the shared scope helper to DENY (principalCanAccessRecord →
 * false) and force permissions to GRANT (getPermissions → 2), so the ONLY
 * thing that can still refuse a record-addressing write is the scope gate.
 * Every write tool that names a concrete record must throw "out of the user
 * scope" — a section-only creator (dedalo_create_record) has no record to
 * scope-check and is exempted BY NAME (with the reason), so a future
 * record-addressing tool cannot silently join that exemption.
 *
 * The change-plan apply path routes through the SAME runTool → handlers, so
 * covering the handlers covers the plan path by construction (documented,
 * not re-tested here).
 *
 * mock.module is process-global and mock.restore() does NOT revert it in this
 * Bun version (see record_scope_gates.test.ts) — afterAll re-installs the real
 * modules so later suites are not poisoned.
 */

import { afterAll, describe, expect, mock, test } from 'bun:test';
import { TOOL_REGISTRY } from '../../src/ai/mcp/registry.ts';
import * as realPermissions from '../../src/core/security/permissions.ts';
import * as realRecordScope from '../../src/core/security/record_scope.ts';

const REAL_RECORD_SCOPE = { ...realRecordScope };
const REAL_PERMISSIONS = { ...realPermissions };

afterAll(() => {
	mock.module('../../src/core/security/record_scope.ts', () => REAL_RECORD_SCOPE);
	mock.module('../../src/core/security/permissions.ts', () => REAL_PERMISSIONS);
	mock.restore();
});

/** A non-admin, scoped principal — write mode's required identity. */
const SCOPED = { userId: 16, isGlobalAdmin: false, isDeveloper: false };

/**
 * Write tools that do NOT address an existing record and therefore have no
 * per-record scope to check. Each MUST carry a reason — a record-addressing
 * tool may never be added here.
 */
const NO_RECORD_TARGET: Record<string, string> = {
	// Creates a brand-new record: there is no prior (tipo,id) to scope-check;
	// the level>=2 create gate is its whole authorization.
	dedalo_create_record: 'creates a new record — no existing target to scope',
	// find_or_create either finds via the scoped search (in-scope by
	// construction) or creates a new record; neither addresses a foreign id.
	dedalo_find_or_create: 'search is scoped; create mints a fresh record',
};

/** A minimal in-scope-shaped input per write tool (concrete record id = 999999). */
function sampleInput(toolName: string): Record<string, unknown> {
	const base = { section_tipo: 'test2', section_id: 999999 };
	switch (toolName) {
		case 'dedalo_save_component':
			return { ...base, tipo: 'numisdata16', action: 'update', value: { value: 'x' } };
		case 'dedalo_delete_record':
			return base;
		case 'dedalo_duplicate_record':
			return base;
		case 'dedalo_set_field':
			return { ...base, field: 'numisdata16', value: 'x' };
		case 'dedalo_portal_link':
		case 'dedalo_portal_unlink':
			return {
				...base,
				field: 'numisdata75',
				target: { section_tipo: 'test2', section_id: 888888 },
			};
		case 'dedalo_upload_media':
			return {
				...base,
				field: 'numisdata16',
				source: { kind: 'base64', data: 'eA==', filename: 'x.jpg' },
			};
		default:
			return base;
	}
}

describe('MCP write-scope tripwire (AI-01, mechanical)', () => {
	test('the registry actually contains write tools to check', () => {
		const writeTools = TOOL_REGISTRY.filter((spec) => spec.write);
		expect(writeTools.length).toBeGreaterThanOrEqual(5);
	});

	test('every record-addressing write tool refuses an out-of-scope record', async () => {
		// GRANT permission everywhere, DENY scope everywhere: the scope gate is
		// now the ONLY thing that can refuse a record-addressing write.
		mock.module('../../src/core/security/permissions.ts', () => ({
			...REAL_PERMISSIONS,
			getPermissions: async () => 2,
		}));
		mock.module('../../src/core/security/record_scope.ts', () => ({
			...REAL_RECORD_SCOPE,
			principalCanAccessRecord: async () => false,
		}));

		// Re-import the tool modules AFTER the mocks are installed so their
		// dynamic imports of the two security modules resolve to the stubs.
		const { runTool } = await import('../../src/ai/mcp/registry.ts');

		const checked: string[] = [];
		const exempted: string[] = [];
		for (const spec of TOOL_REGISTRY.filter((entry) => entry.write)) {
			if (spec.name in NO_RECORD_TARGET) {
				exempted.push(spec.name);
				continue;
			}
			const result = await runTool(spec, SCOPED, sampleInput(spec.name), {
				allowWrite: true,
			});
			// The scope gate must be the refusal (out_of_scope), before any engine
			// touches the DB. A tool that returns ok here NEVER called the gate.
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.error.code).toBe('out_of_scope');
			}
			checked.push(spec.name);
		}

		// Coverage sanity: we actually exercised the record-addressing tools and
		// only the named exemptions were skipped.
		expect(checked).toContain('dedalo_set_field');
		expect(checked).toContain('dedalo_delete_record');
		expect(checked).toContain('dedalo_upload_media');
		expect(new Set(exempted)).toEqual(new Set(Object.keys(NO_RECORD_TARGET)));
	});
});
