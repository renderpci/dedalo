/**
 * `metric_total` over a section whose declared table is NOT a matrix record
 * store (WC-2026-08-18-dashboard-total-non-record-store).
 *
 * WHY THIS FILE EXISTS. `dd15` (Time Machine) declares `matrix_time_machine`, a
 * FLAT column store read only through the mode 'tm' source and deliberately
 * absent from `MATRIX_TABLE_ALLOWLIST`. `countSectionRecords` used to guard only
 * "has a table", so the SQO count hit `assertMatrixTable` and threw
 * `internal.invariant` — and the dashboard resolves its sections with
 * `Promise.all`, so that one section took down the WHOLE area_admin (dd207)
 * autoload. The contract is: not-a-record-store counts as `null`, the metric's
 * existing "not countable" value.
 *
 * ANTI-VACUITY: the first test pins dd15's declared table, so an ontology change
 * that stops routing dd15 at matrix_time_machine turns this file red instead of
 * making it assert nothing; the countable arm asserts a real number on a real
 * section, so "everything is null" cannot pass.
 *
 * Read-only — mints nothing.
 */

import { expect, test } from 'bun:test';
import { getDashboardData } from '../../src/core/area/dashboard.ts';
import { isMatrixTable } from '../../src/core/db/matrix.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { getMatrixTableFromTipo } from '../../src/core/ontology/resolver.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { countSectionRecords } from '../../src/core/search/count.ts';

const TM_SECTION = 'dd15';
/** A real record section — the countable contrast. */
const COUNTABLE_SECTION = 'dd542';

test('dd15 declares matrix_time_machine, which is NOT a matrix record table', async () => {
	const table = await getMatrixTableFromTipo(TM_SECTION);
	expect(table).toBe('matrix_time_machine');
	expect(isMatrixTable(table as string)).toBe(false);
});

test('countSectionRecords: null for the non-record store, a number for a real section', async () => {
	const admin = await resolvePrincipal(-1);
	expect(await countSectionRecords(admin, TM_SECTION)).toBe(null);
	const countable = await countSectionRecords(admin, COUNTABLE_SECTION);
	expect(typeof countable).toBe('number');
	expect(countable as number).toBeGreaterThan(0);
}, 30000);

// The live install hangs dd15 under dd207 (area_admin — the reported crash); the
// suite DB hangs it under dd193. Ask the ontology instead of pinning either, and
// assert the walk really reached dd15 so a moved node fails loudly.
test('the dashboard of the area holding dd15 resolves, with total null', async () => {
	const admin = await resolvePrincipal(-1);
	const parent = (
		(await sql.unsafe('SELECT parent FROM dd_ontology WHERE tipo = $1', [TM_SECTION])) as {
			parent: string;
		}[]
	)[0]?.parent;
	expect(typeof parent).toBe('string');
	const dashboard = await getDashboardData(admin, parent as string, ['total']);
	const sections = dashboard.sections as { section_tipo: string; total?: number | null }[];
	const tm = sections.find((section) => section.section_tipo === TM_SECTION);
	expect(tm).toBeDefined();
	expect(tm?.total).toBe(null);
	// the regression was a THROW, so also prove the rest of the area still counts
	expect(sections.filter((section) => typeof section.total === 'number').length).toBeGreaterThan(0);
}, 60000);
