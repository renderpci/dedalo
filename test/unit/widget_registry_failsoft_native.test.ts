/**
 * getMaintenanceWidgets FAIL-SOFT — the D1 defect gate (plan §4.3.3),
 * ledgered as WC-2026-08-10-maintenance-catalog-fail-soft.
 *
 * The docstring has always claimed "a widget value failure must never break
 * the dashboard read"; until 2026-08-10 there was no try/catch, so ONE
 * rejecting eagerValue rejected the whole catalog and the entire maintenance
 * area returned an error instead of a dashboard — and the eager values are
 * exactly the DB-touching ones (checkSequences, lock_components' active-lock
 * read, publication_api's diffusion scan, check_config's probe), i.e. the
 * failure mode is likeliest precisely on the degraded install whose operator
 * needs the dashboard to fix it.
 *
 * DRIVEN THROUGH THE SEAM, never the real catalog: calling the zero-arg
 * getMaintenanceWidgets() would fire every eagerValue including checkSequences'
 * setval loop (plan §4.4 D2) against the shared suite database. No DB, no rows,
 * no scratch band needed.
 *
 * Labels are deliberately NOT asserted here (with stub modules that would
 * assert the stub — labelFor belongs to its own gate).
 */

import { afterEach, describe, expect, mock, test } from 'bun:test';
import {
	getMaintenanceWidgets,
	MAINTENANCE_AREA_TIPO,
} from '../../src/core/area_maintenance/widgets/registry.ts';
import type { WidgetModule } from '../../src/core/area_maintenance/widgets/support.ts';

/** A stub module: `eager` may resolve, resolve null, reject, or be absent. */
function stubModule(
	id: string,
	eagerValue?: () => Promise<Record<string, unknown> | null>,
): WidgetModule {
	return {
		spec: { id, category: 'integrity', label: { kind: 'literal', text: id } },
		...(eagerValue === undefined ? {} : { eagerValue }),
	};
}

const consoleError = console.error;
afterEach(() => {
	console.error = consoleError;
});

/** Silence (and count) the convention-mandated report line. */
function captureConsoleError(): { calls: unknown[][] } {
	const calls: unknown[][] = [];
	console.error = mock((...args: unknown[]) => {
		calls.push(args);
	});
	return { calls };
}

describe('getMaintenanceWidgets fail-soft (D1)', () => {
	test('a REJECTING eagerValue degrades to value null and the rest of the dashboard still renders', async () => {
		const captured = captureConsoleError();
		const widgets = await getMaintenanceWidgets([
			stubModule('zzseq_before', async () => ({ ok: 'before' })),
			stubModule('zzseq_boom', async () => {
				throw new Error('eager value exploded');
			}),
			stubModule('zzseq_after', async () => ({ ok: 'after' })),
		]);

		// The whole catalog still built — this is the defect: before the fix the
		// await above rejected and NO dashboard was served.
		expect(widgets.map((widget) => widget.id)).toEqual([
			'zzseq_before',
			'zzseq_boom',
			'zzseq_after',
		]);
		// The failing widget degrades to the no-eager-value shape...
		expect(widgets[1]?.value).toBeNull();
		// ...and every OTHER widget keeps its real computed value, including the
		// ones ORDERED AFTER the failure (a catch that aborted the loop would
		// still "not throw" but would truncate the dashboard).
		expect(widgets[0]?.value).toEqual({ ok: 'before' });
		expect(widgets[2]?.value).toEqual({ ok: 'after' });

		// Never silent (CONVENTIONS §1): the failure is reported and names the widget.
		expect(captured.calls.length).toBe(1);
		expect(String(captured.calls[0]?.[0])).toContain('zzseq_boom');
	});

	test('a SYNCHRONOUSLY throwing eagerValue degrades the same way', async () => {
		captureConsoleError();
		const widgets = await getMaintenanceWidgets([
			stubModule('zzseq_sync_boom', (() => {
				throw new Error('threw before returning a promise');
			}) as () => Promise<Record<string, unknown> | null>),
			stubModule('zzseq_tail', async () => ({ ok: 'tail' })),
		]);
		expect(widgets.map((widget) => widget.id)).toEqual(['zzseq_sync_boom', 'zzseq_tail']);
		expect(widgets[0]?.value).toBeNull();
		expect(widgets[1]?.value).toEqual({ ok: 'tail' });
	});

	test('a module with NO eagerValue, and one resolving null, are indistinguishable from success', async () => {
		captureConsoleError();
		const widgets = await getMaintenanceWidgets([
			stubModule('zzseq_no_eager'),
			stubModule('zzseq_null_eager', async () => null),
		]);
		expect(widgets[0]?.value).toBeNull();
		expect(widgets[1]?.value).toBeNull();
		// No failure happened, so nothing may be reported as one.
		expect((console.error as unknown as { mock: { calls: unknown[][] } }).mock.calls.length).toBe(
			0,
		);
	});

	test('the seam REPLACES the served catalog (the gate never fires a real eagerValue)', async () => {
		captureConsoleError();
		const widgets = await getMaintenanceWidgets([stubModule('zzseq_only')]);
		// If the loop still walked WIDGET_MODULES, this would be ~31 entries and
		// would have fired checkSequences' setval against the suite DB.
		expect(widgets.length).toBe(1);
		expect(widgets[0]?.id).toBe('zzseq_only');
		// The catalog entry anatomy the client reads is unchanged by the seam.
		expect(widgets[0]?.type).toBe('widget');
		expect(widgets[0]?.tipo).toBe(MAINTENANCE_AREA_TIPO);
		expect(widgets[0]?.parent).toBe(MAINTENANCE_AREA_TIPO);
		expect(widgets[0]?.background).toBe(false);
		expect(widgets[0]?.run).toEqual([]);
	});

	test('spec.background and spec.class ride through per module, not per catalog', async () => {
		captureConsoleError();
		const widgets = await getMaintenanceWidgets([
			{
				spec: {
					id: 'zzseq_bg',
					category: 'integrity',
					class: 'width_100',
					background: true,
					label: { kind: 'literal', text: 'zzseq_bg' },
				},
			},
			stubModule('zzseq_plain'),
		]);
		expect(widgets[0]?.background).toBe(true);
		expect(widgets[0]?.class).toBe('width_100');
		expect(widgets[1]?.background).toBe(false);
		expect(widgets[1]?.class).toBeNull();
	});
});
