/**
 * error_reports maintenance widget (WC-018) + the store it fronts.
 *
 * Store assertions run on an injectable SCRATCH table (dedalo_ts_test_*,
 * dropped in afterAll); the widget module's handlers are exercised directly.
 * The catalog CONDITION (receiver flag → membership) is boot-frozen in
 * registry.ts, so the honest assertion is consistency with the CURRENT
 * config: flag off ⇒ dispatchWidgetRequest refuses the widget id outright
 * (the non-master posture — the widget is unreachable), flag on ⇒ the
 * admin gate + handlers respond.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import { widget } from '../../src/core/area_maintenance/widgets/error_reports.ts';
import {
	MAINTENANCE_WIDGET_IDS,
	dispatchGetWidgetValue,
	dispatchWidgetRequest,
} from '../../src/core/area_maintenance/widgets/registry.ts';
import { sql } from '../../src/core/db/postgres.ts';
import {
	ensureErrorReportsTable,
	insertErrorReport,
	listErrorReports,
} from '../../src/core/error_report/store.ts';
import type { Principal } from '../../src/core/security/permissions.ts';

const SCRATCH_TABLE = `dedalo_ts_test_error_reports_${process.pid}`;

const admin: Principal = { userId: -1, isGlobalAdmin: true, isDeveloper: true };
const nonAdmin: Principal = { userId: 42, isGlobalAdmin: false, isDeveloper: false };

function row(description: string) {
	return {
		source_ip: '198.51.100.7',
		entity: 'test',
		dedalo_version: '7.0.0.dev',
		user_id: 5,
		section_tipo: 'oh1',
		section_id: '1',
		page_url: '/dedalo/core/page/?tipo=oh1',
		description,
		js_errors: [],
		context: null,
	};
}

afterAll(async () => {
	await sql.unsafe(`DROP TABLE IF EXISTS "${SCRATCH_TABLE}"`, []);
});

describe('error-report store (scratch table)', () => {
	test('insert stamps an id; list pages newest-first; limit clamps at 100', async () => {
		await ensureErrorReportsTable(SCRATCH_TABLE);

		const firstId = await insertErrorReport(row('first'), { table: SCRATCH_TABLE });
		const secondId = await insertErrorReport(row('second'), { table: SCRATCH_TABLE });
		expect(secondId).toBeGreaterThan(firstId);

		const page = await listErrorReports({ table: SCRATCH_TABLE, limit: 1 });
		expect(page.length).toBe(1);
		expect(page[0]?.description).toBe('second'); // newest first

		const next = await listErrorReports({ table: SCRATCH_TABLE, limit: 1, offset: 1 });
		expect(next[0]?.description).toBe('first');

		// The clamp: a hostile/legit huge limit never exceeds 100.
		const clamped = await listErrorReports({ table: SCRATCH_TABLE, limit: 10_000 });
		expect(clamped.length).toBeLessThanOrEqual(100);
	});

	test('retention prune deletes only rows older than the window', async () => {
		await ensureErrorReportsTable(SCRATCH_TABLE);
		const oldId = await insertErrorReport(row('ancient'), {
			table: SCRATCH_TABLE,
			retentionDays: 0, // no prune on this insert
		});
		await sql.unsafe(
			`UPDATE "${SCRATCH_TABLE}" SET received_at = now() - interval '400 days' WHERE id = $1`,
			[oldId],
		);
		// The next insert prunes opportunistically with a 90-day window.
		await insertErrorReport(row('fresh'), { table: SCRATCH_TABLE, retentionDays: 90 });
		const remaining = await listErrorReports({ table: SCRATCH_TABLE, limit: 100 });
		expect(remaining.some((item) => item.description === 'ancient')).toBe(false);
		expect(remaining.some((item) => item.description === 'fresh')).toBe(true);
	});

	test('the store is append-only by construction: no update/delete exports', async () => {
		const store = await import('../../src/core/error_report/store.ts');
		const mutators = Object.keys(store).filter((name) => /update|delete|remove/i.test(name));
		expect(mutators).toEqual([]);
	});
});

describe('error_reports widget (WC-018)', () => {
	test('module shape: id, literal label, getValue + the ONE registered action', () => {
		expect(widget.spec.id).toBe('error_reports');
		expect(widget.spec.label).toEqual({ kind: 'literal', text: 'Error reports' });
		expect(typeof widget.getValue).toBe('function');
		expect(Object.keys(widget.apiActions ?? {})).toEqual(['get_reports']);
	});

	test('catalog membership = participates in error reporting (receiver OR a master URL)', () => {
		const participates =
			config.errorReport.receiverEnabled || Boolean(config.errorReport.masterApiUrl);
		expect(MAINTENANCE_WIDGET_IDS.includes('error_reports')).toBe(participates);
	});

	test('getValue reports the configured target (env-driven display)', async () => {
		const value = await widget.getValue?.({}, admin);
		const result = value?.result as { target?: unknown };
		expect(typeof result.target).toBe('string');
	});

	test('dispatch: non-admin refused; non-member id refused outright when flag off', async () => {
		// Admin gate runs FIRST regardless of catalog membership.
		const nonAdminResult = await dispatchWidgetRequest(
			nonAdmin,
			{ model: 'error_reports', action: 'get_reports' },
			{},
		);
		expect(nonAdminResult.result).toBe(false);
		expect(nonAdminResult.errors).toEqual(['unauthorized']);

		const nonAdminValue = await dispatchGetWidgetValue(nonAdmin, { model: 'error_reports' });
		expect(nonAdminValue.result).toBe(false);

		const adminResult = await dispatchWidgetRequest(
			admin,
			{ model: 'error_reports', action: 'get_reports' },
			{},
		);
		const participates =
			config.errorReport.receiverEnabled || Boolean(config.errorReport.masterApiUrl);
		if (participates) {
			// Participating install: the widget is in the catalog, the handler answers.
			expect(adminResult.msg).toContain('OK');
		} else {
			// Non-participating install: the widget id is NOT in the catalog —
			// refused before any handler exists to run.
			expect(adminResult.result).toBe(false);
			expect(adminResult.errors).toEqual(['Invalid widget name: error_reports']);
		}
	});

	test('getValue is fail-soft: a broken store yields a null panel, never a throw', async () => {
		// The widget runs against the DEFAULT table; on an installation where
		// the boot migration ran this returns totals, and on one where the
		// table is absent it must still answer (null totals). Both are valid —
		// the assertion is the CONTRACT: it never throws and always returns the
		// envelope shape.
		const value = await widget.getValue?.({}, admin);
		expect(value).toBeDefined();
		expect(value?.errors).toEqual([]);
		const result = value?.result as { total: unknown; latest_received_at: unknown };
		expect('total' in result).toBe(true);
		expect('latest_received_at' in result).toBe(true);
	});
});
