/**
 * register_tools widget through the ownership gate (UPDATE_PROCESS Phase 1).
 * Since the 2026-07-11 cutover the LIVE gate is collapsed to true (open mode
 * is the runtime reality); BOTH branches are exercised via mock.module on
 * core/update/ownership.ts — closed = the byte-frozen dry-run diff report,
 * open = the real import with PHP response bytes, with the importTools spy
 * proving {dryRun:false}.
 *
 * mock.module is process-wide and mock.restore() does NOT revert it — the
 * afterAll re-installs the real modules (mcp_write_scope pattern).
 */

import { afterAll, describe, expect, mock, test } from 'bun:test';
import { widget } from '../../src/core/area_maintenance/widgets/register_tools.ts';
import { dispatchWidgetRequest } from '../../src/core/area_maintenance/widgets/registry.ts';
import {
	gated,
	gatedStub,
	ownershipMark,
} from '../../src/core/area_maintenance/widgets/support.ts';
import type { Principal } from '../../src/core/security/permissions.ts';
import * as realRegister from '../../src/core/tools/register.ts';
import * as realOwnership from '../../src/core/update/ownership.ts';

const REAL_OWNERSHIP = { ...realOwnership };
const REAL_REGISTER = { ...realRegister };

afterAll(() => {
	mock.module('../../src/core/update/ownership.ts', () => REAL_OWNERSHIP);
	mock.module('../../src/core/tools/register.ts', () => REAL_REGISTER);
	mock.restore();
});

const ADMIN: Principal = { userId: -1, isGlobalAdmin: true, isDeveloper: true } as Principal;

function runImport() {
	return dispatchWidgetRequest(
		ADMIN,
		{ model: 'register_tools', action: 'register_tools' },
		{},
	) as unknown as Promise<Record<string, unknown>>;
}

describe('module shape', () => {
	test('register_tools.register_tools is gated with a REAL open branch (not a stub)', () => {
		const handler = widget.apiActions?.register_tools;
		expect(handler).toBeDefined();
		const mark = ownershipMark(handler as NonNullable<typeof handler>);
		expect(mark?.kind).toBe('gated');
		expect(mark?.what).toBe('register_tools.register_tools');
		expect(mark?.openIsStub).toBe(false);
	});
});

describe('closed mode — mocked gate (the real gate collapsed to true at the 2026-07-11 cutover), real dry-run', () => {
	test('the frozen whenClosed branch still returns the dry-run diff report and writes nothing', async () => {
		// Post-cutover the LIVE gate is always open; the closed branch survives
		// as the byte-frozen refusal/dry-run contract — reachable only by
		// forcing the gate shut, same mock.module seam the open-mode tests use.
		mock.module('../../src/core/update/ownership.ts', () => ({
			...REAL_OWNERSHIP,
			engineOwnsInstall: () => false,
		}));
		const body = await runImport();
		mock.module('../../src/core/update/ownership.ts', () => REAL_OWNERSHIP);
		const result = body.result as {
			dry_run: boolean;
			total: number;
			invalid_count: number;
			would_change_count: number;
		};
		expect(result.dry_run).toBe(true);
		expect(result.total).toBeGreaterThan(0);
		expect(String(body.msg)).toStartWith('OK. Dry-run:');
		expect(String(body.msg)).toEndWith('Registry not modified.');
	});
});

describe('open (owned) mode — mocked gate, importTools spy', () => {
	function fixtureItem(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
		return {
			name: 'tool_fixture',
			dir: 'tools/tool_fixture',
			valid: true,
			dryRun: false,
			errors: [],
			warnings: [],
			inRegistry: true,
			diff: [],
			hasServerModule: false,
			record: { version: '9.9.9' },
			...overrides,
		};
	}

	test('clean import: PHP bytes + installer-shaped report items + {dryRun:false}', async () => {
		const importTools = mock(async (_options?: { dryRun?: boolean }) => [
			fixtureItem(),
		]) as unknown as typeof realRegister.importTools;
		mock.module('../../src/core/update/ownership.ts', () => ({
			...REAL_OWNERSHIP,
			engineOwnsInstall: () => true,
		}));
		mock.module('../../src/core/tools/register.ts', () => ({
			...REAL_REGISTER,
			importTools,
		}));

		const body = await runImport();
		expect((importTools as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]?.[0]).toEqual(
			{ dryRun: false },
		);
		expect(body.msg).toBe('OK. Request done successfully');
		expect(body.errors).toEqual([]);
		expect(body.result).toEqual([
			{
				name: 'tool_fixture',
				dir: 'tools/tool_fixture',
				version: '9.9.9',
				imported: true,
				errors: [],
				warnings: [],
			},
		]);
	});

	test('per-tool errors: warning msg bytes + flat error aggregation', async () => {
		const importTools = mock(async (_options?: { dryRun?: boolean }) => [
			fixtureItem(),
			fixtureItem({
				name: 'tool_broken',
				dir: 'tools/tool_broken',
				valid: false,
				errors: ['register.json parse error', 'missing label'],
				record: undefined,
			}),
		]) as unknown as typeof realRegister.importTools;
		mock.module('../../src/core/update/ownership.ts', () => ({
			...REAL_OWNERSHIP,
			engineOwnsInstall: () => true,
		}));
		mock.module('../../src/core/tools/register.ts', () => ({
			...REAL_REGISTER,
			importTools,
		}));

		const body = await runImport();
		expect(body.msg).toBe('Warning! Request done with errors');
		expect(body.errors).toEqual(['register.json parse error', 'missing label']);
		const report = body.result as Record<string, unknown>[];
		expect(report[1]).toEqual({
			name: 'tool_broken',
			dir: 'tools/tool_broken',
			version: null,
			imported: false,
			errors: ['register.json parse error', 'missing label'],
			warnings: [],
		});
	});
});

describe('gated() combinator branching (spy handlers)', () => {
	test('closed → whenClosed result BY IDENTITY; open → whenOpen; marks introspect', async () => {
		const closedResponse = { result: false, msg: 'closed', errors: [] };
		const openResponse = { result: true, msg: 'open', errors: [] };
		const whenClosed = mock(async () => closedResponse);
		const whenOpen = mock(async () => openResponse);
		const handler = gated('spy.spy', whenClosed, whenOpen);

		const mark = ownershipMark(handler);
		expect(mark?.kind).toBe('gated');
		expect(mark?.whenClosed).toBe(whenClosed);
		expect(mark?.openIsStub).toBe(false);
		expect(ownershipMark(gatedStub('stub.stub', 'reason'))?.openIsStub).toBe(true);

		mock.module('../../src/core/update/ownership.ts', () => ({
			...REAL_OWNERSHIP,
			engineOwnsInstall: () => false,
		}));
		expect(await handler({}, ADMIN)).toBe(closedResponse);
		expect(whenOpen).toHaveBeenCalledTimes(0);

		mock.module('../../src/core/update/ownership.ts', () => ({
			...REAL_OWNERSHIP,
			engineOwnsInstall: () => true,
		}));
		expect(await handler({}, ADMIN)).toBe(openResponse);
		expect(whenClosed).toHaveBeenCalledTimes(1);
	});
});
