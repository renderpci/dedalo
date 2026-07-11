/**
 * Phase 8 gate: MCP WRITE tools — ACL parity + fail-closed registration.
 *
 * The write tools must (a) be ABSENT unless the deployment explicitly opts in
 * (read-only by default), (b) enforce the same server-authoritative level>=2
 * permission gate as the human API (denied user ⇒ denied LLM), and (c) reuse
 * the real engines: create allocates through the matrix counter, save goes
 * through saveComponentData (with its Time Machine audit), delete snapshots to
 * the Time Machine before removing the row.
 *
 * Runs in the disposable test section (test2 → matrix_test); everything created
 * is removed afterwards.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { buildMcpServer } from '../../src/ai/mcp/server.ts';
import { createRecord, deleteRecord, saveComponentValue } from '../../src/ai/mcp/tools.ts';
import { sql } from '../../src/core/db/postgres.ts';
import type { Principal } from '../../src/core/security/permissions.ts';
import { cleanScratchRecord } from '../helpers/test_data.ts';

const SECTION_TIPO = 'test2';
const TABLE = 'matrix_test';

const SUPERUSER: Principal = { userId: -1, isGlobalAdmin: true, isDeveloper: true };
/** A user that does not exist: resolves to NO profile ⇒ permission 0 everywhere. */
const NO_ACCESS_USER: Principal = { userId: 999999, isGlobalAdmin: false, isDeveloper: false };
/** A non-admin (scoped) principal — the only kind allowed to build a WRITE server. */
const SCOPED_USER: Principal = { userId: 16, isGlobalAdmin: false, isDeveloper: false };

const createdIds: number[] = [];

afterAll(async () => {
	for (const id of createdIds) {
		await cleanScratchRecord(SECTION_TIPO, id, TABLE);
	}
});

describe('MCP write tools (Phase 8 gate)', () => {
	test('write tools are NOT registered by default (read-only, fail-closed)', () => {
		// A scoped (non-admin) principal is required to opt into write mode.
		const readOnly = buildMcpServer(SCOPED_USER) as unknown as {
			_registeredTools: Record<string, unknown>;
		};
		const writable = buildMcpServer(SCOPED_USER, { allowWrite: true }) as unknown as {
			_registeredTools: Record<string, unknown>;
		};
		const readOnlyNames = Object.keys(readOnly._registeredTools);
		const writableNames = Object.keys(writable._registeredTools);
		for (const writeTool of [
			'dedalo_save_component',
			'dedalo_create_record',
			'dedalo_delete_record',
		]) {
			expect(readOnlyNames).not.toContain(writeTool);
			expect(writableNames).toContain(writeTool);
		}
		// The read tools are present in both.
		expect(readOnlyNames).toContain('dedalo_search_section');
	});

	test('WRITE mode is REFUSED for a global-admin/superuser principal (confused-deputy defense)', () => {
		// Read-only under the superuser is fine…
		expect(() => buildMcpServer(SUPERUSER)).not.toThrow();
		// …but opting into write tools under an ambient global admin must hard-fail.
		expect(() => buildMcpServer(SUPERUSER, { allowWrite: true })).toThrow(
			/global admin|superuser/i,
		);
	});

	test('create → save → delete round-trip as an authorized user', async () => {
		// create
		const { section_id } = await createRecord(SUPERUSER, { section_tipo: SECTION_TIPO });
		createdIds.push(section_id);
		expect(section_id).toBeGreaterThan(0);

		// save (insert one literal item; id allocated from the meta counter)
		const saved = await saveComponentValue(SUPERUSER, {
			section_tipo: SECTION_TIPO,
			tipo: 'numisdata16',
			section_id,
			lang: 'lg-spa',
			action: 'insert',
			value: { lang: 'lg-spa', value: 'mcp-written' },
		});
		expect(saved.ok).toBe(true);
		const rows = (await sql.unsafe(
			`SELECT string->'numisdata16' AS items FROM ${TABLE} WHERE section_tipo = $1 AND section_id = $2`,
			[SECTION_TIPO, section_id],
		)) as { items: { value: string }[] }[];
		expect(rows[0]?.items?.some((item) => item.value === 'mcp-written')).toBe(true);

		// delete (TM snapshot first, then row removal)
		const { deleted } = await deleteRecord(SUPERUSER, {
			section_tipo: SECTION_TIPO,
			section_id,
		});
		expect(deleted).toEqual([String(section_id)]);
		const remaining = (await sql.unsafe(
			`SELECT 1 FROM ${TABLE} WHERE section_tipo = $1 AND section_id = $2`,
			[SECTION_TIPO, section_id],
		)) as unknown[];
		expect(remaining.length).toBe(0);
		const tm = (await sql`
			SELECT tipo FROM matrix_time_machine
			WHERE section_tipo = ${SECTION_TIPO} AND section_id = ${section_id}
		`) as { tipo: string }[];
		// At least the delete snapshot (tipo = section tipo) was audited.
		expect(tm.some((row) => row.tipo === SECTION_TIPO)).toBe(true);
	});

	test('a user the human API denies is denied on every write tool', async () => {
		await expect(createRecord(NO_ACCESS_USER, { section_tipo: SECTION_TIPO })).rejects.toThrow(
			/Insufficient permissions/,
		);
		await expect(
			saveComponentValue(NO_ACCESS_USER, {
				section_tipo: SECTION_TIPO,
				tipo: 'numisdata16',
				section_id: 1,
				action: 'update',
				value: { id: 1, lang: 'lg-spa', value: 'nope' },
			}),
		).rejects.toThrow(/Insufficient permissions/);
		await expect(
			deleteRecord(NO_ACCESS_USER, { section_tipo: SECTION_TIPO, section_id: 1 }),
		).rejects.toThrow(/Insufficient permissions/);
	});

	test('write tools reject injection-shaped identifiers at the chokepoint', async () => {
		await expect(
			createRecord(SUPERUSER, { section_tipo: "test2'; DROP TABLE matrix; --" }),
		).rejects.toThrow();
	});
});
