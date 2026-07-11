/**
 * Tool security gates: resolveAction lookup + assertActionPermission for every
 * permission kind, with the fail-closed behavior on missing/ill-typed targets.
 * Uses the superuser principal (userId -1 → level 3 everywhere) for the positive
 * section/tipo paths and a plain non-dev principal for the negative ones.
 */

import { describe, expect, test } from 'bun:test';
import type { Principal } from '../../src/core/security/permissions.ts';
import type { ToolActionSpec, ToolServerModule } from '../../src/core/tools/module.ts';
import { assertActionPermission, resolveAction } from '../../src/core/tools/security.ts';

const SUPERUSER: Principal = { userId: -1, isGlobalAdmin: true, isDeveloper: true };
const PLAIN_USER: Principal = { userId: 999999, isGlobalAdmin: false, isDeveloper: false };

const noopHandler = async () => ({ result: true, msg: 'OK' });
function spec(partial: Partial<ToolActionSpec>): ToolActionSpec {
	return { permission: null, handler: noopHandler, ...partial };
}

describe('resolveAction', () => {
	const module: ToolServerModule = {
		name: 'tool_export',
		apiActions: { get_export_grid: spec({ permission: 'section', minLevel: 1 }) },
	};

	test('returns the spec for a registered method', () => {
		expect(resolveAction(module, 'get_export_grid')).not.toBeNull();
	});
	test('returns null for an unregistered method', () => {
		expect(resolveAction(module, 'delete_everything')).toBeNull();
	});
	test('does not resolve inherited Object properties as actions', () => {
		expect(resolveAction(module, 'toString')).toBeNull();
		expect(resolveAction(module, 'constructor')).toBeNull();
	});
});

describe('assertActionPermission', () => {
	test('null permission always passes (handler-gated)', async () => {
		const result = await assertActionPermission(spec({ permission: null }), {}, PLAIN_USER);
		expect(result.ok).toBe(true);
	});

	test('developer: passes for a developer, denies otherwise', async () => {
		const developerSpec = spec({ permission: 'developer' });
		expect((await assertActionPermission(developerSpec, {}, SUPERUSER)).ok).toBe(true);
		expect((await assertActionPermission(developerSpec, {}, PLAIN_USER)).ok).toBe(false);
	});

	test('section: passes for superuser on a valid section', async () => {
		const result = await assertActionPermission(
			spec({ permission: 'section', minLevel: 1 }),
			{ section_tipo: 'test3' },
			SUPERUSER,
		);
		expect(result.ok).toBe(true);
	});

	test('section: fail-closed on a missing/invalid section_tipo', async () => {
		const result = await assertActionPermission(
			spec({ permission: 'section', minLevel: 1 }),
			{ section_tipo: 'not-a-tipo' },
			SUPERUSER,
		);
		expect(result.ok).toBe(false);
	});

	test('tipo: fail-closed when tipo is absent', async () => {
		const result = await assertActionPermission(
			spec({ permission: 'tipo', minLevel: 2 }),
			{ section_tipo: 'test3' },
			SUPERUSER,
		);
		expect(result.ok).toBe(false);
	});

	test('record: fail-closed on a non-numeric section_id', async () => {
		const result = await assertActionPermission(
			spec({ permission: 'record', minLevel: 2 }),
			{ section_tipo: 'test3', section_id: 'abc' },
			SUPERUSER,
		);
		expect(result.ok).toBe(false);
	});

	test('section: denies a plain user without the grant', async () => {
		const result = await assertActionPermission(
			spec({ permission: 'section', minLevel: 2 }),
			{ section_tipo: 'test3' },
			PLAIN_USER,
		);
		expect(result.ok).toBe(false);
	});
});
