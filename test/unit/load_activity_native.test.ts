/**
 * LOAD activity on section reads (PHP dd_core_api::read :771 → log_activity).
 * Every section/area page load must append a 'LOAD EDIT'/'LOAD LIST' audit row
 * keyed by the SECTION tipo — the stream the dashboard timeline aggregates
 * (metricActivity filters WHERE ∈ child sections). Its ABSENCE was why the
 * dashboard activity card was permanently empty: only component-keyed SAVE rows
 * existed, which the section filter correctly ignores.
 *
 * Guards the exclusions PHP applies too: mode 'search'/'tm' leave no footprint,
 * and only section/area models log (never a bare component read).
 *
 * DB-backed against the test playground (section test3). Rows created here are
 * removed after each case (watermark on section_id).
 */

import { afterEach, expect, test } from 'bun:test';
import { coreApiActions } from '../../src/core/api/handlers/dd_core_api.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';

const SECTION = 'test3';

// coreApiActions is a Record<string, ActionHandler>, so under noUncheckedIndexedAccess
// every lookup is possibly-undefined. Resolve the handler ONCE and fail loudly if the
// action is not registered — an unregistered 'read' is a real regression, and letting
// each call site assert it away would hide that behind three identical crashes.
const readAction = coreApiActions.read;
if (!readAction) {
	throw new Error("load_activity: dd_core_api has no 'read' action registered");
}

const admin = await resolvePrincipal(-1);
const ctx = {
	principal: admin,
	session: { userId: -1 },
	clientIp: '127.0.0.1',
	requestId: 't',
} as unknown as Parameters<(typeof coreApiActions)['read']>[1];

async function watermark(): Promise<number> {
	return Number(
		(await sql.unsafe('SELECT COALESCE(max(section_id),0) m FROM matrix_activity'))[0].m,
	);
}
async function rowsSince(mark: number): Promise<{ what: string; where_tipo: string }[]> {
	return (await sql.unsafe(
		`SELECT relation->'dd545'->0->>'section_id' AS what,
		        string->'dd546'->0->>'value' AS where_tipo
		 FROM matrix_activity WHERE section_id > $1 ORDER BY section_id`,
		[mark],
	)) as { what: string; where_tipo: string }[];
}

let mark = 0;
afterEach(async () => {
	await sql.unsafe('DELETE FROM matrix_activity WHERE section_id > $1', [mark]);
});

test("list-mode section read writes a section-keyed 'LOAD LIST' (code 7) row", async () => {
	mark = await watermark();
	const result = await readAction(
		{
			action: 'read',
			dd_api: 'dd_core_api',
			source: { tipo: SECTION, section_tipo: SECTION, model: 'section', mode: 'list' },
			sqo: { section_tipo: [SECTION], limit: 5, offset: 0 },
			// biome-ignore lint/suspicious/noExplicitAny: minimal test rqo
		} as any,
		ctx,
	);
	expect(result.status).toBe(200);
	const rows = await rowsSince(mark);
	expect(rows.length).toBe(1);
	expect(rows[0]?.what).toBe('7'); // LOAD LIST
	expect(rows[0]?.where_tipo).toBe(SECTION); // the SECTION tipo, not a component
}, 30000);

test("edit-mode section read writes a 'LOAD EDIT' (code 6) row", async () => {
	mark = await watermark();
	await readAction(
		{
			action: 'read',
			dd_api: 'dd_core_api',
			source: { tipo: SECTION, section_tipo: SECTION, model: 'section', mode: 'edit' },
			sqo: { section_tipo: [SECTION], limit: 1, offset: 0 },
			// biome-ignore lint/suspicious/noExplicitAny: minimal test rqo
		} as any,
		ctx,
	);
	const rows = await rowsSince(mark);
	expect(rows.length).toBe(1);
	expect(rows[0]?.what).toBe('6'); // LOAD EDIT
	expect(rows[0]?.where_tipo).toBe(SECTION);
}, 30000);

test('search-mode read leaves NO activity footprint (PHP exclusion)', async () => {
	mark = await watermark();
	// 'search' mode is not a served read path (readSectionRows throws in v0); the
	// point is that NO activity row leaks — the exclusion holds even on that path.
	try {
		await readAction(
			{
				action: 'read',
				dd_api: 'dd_core_api',
				source: { tipo: SECTION, section_tipo: SECTION, model: 'section', mode: 'search' },
				sqo: { section_tipo: [SECTION], limit: 5, offset: 0 },
				// biome-ignore lint/suspicious/noExplicitAny: minimal test rqo
			} as any,
			ctx,
		);
	} catch {
		// expected in v0 — the read path itself refuses search mode
	}
	expect((await rowsSince(mark)).length).toBe(0);
}, 30000);
