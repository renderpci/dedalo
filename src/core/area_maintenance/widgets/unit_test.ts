/**
 * unit_test widget — reset matrix_test to the canonical test3 playground
 * (src/core/test_data/: TRUNCATE + sequence restart + insert the canonical
 * records + exact-set counter).
 *
 * (!) Deliberate divergence WC-021: the PHP twin is live-defective — its
 * test_data.json still carries V6 column shapes AND re-appends the explicit
 * section_id/section_tipo columns, so the PHP reset TRUNCATEs and then DIES
 * ('column "section_id" specified more than once'), leaving the table EMPTY.
 * TS implements the restorative INTENT from the single verified source. The
 * PHP failure mode stays pinned in
 * test/parity/widget_request_differential.test.ts.
 */

import type { Principal } from '../../security/permissions.ts';
import { resetTestSection } from '../../test_data/seed.ts';
import type { WidgetModule, WidgetResponse } from './support.ts';

async function unitTestCreateTestRecord(): Promise<WidgetResponse> {
	await resetTestSection();
	return { result: true, msg: 'OK. Request done unit_test::create_test_record', errors: [] };
}

/**
 * SSE long-process stress test (PHP unit_test::long_process_stream). Submits an
 * in-process background job (mediaJobs — the ONLY registry get_process_status can
 * stream) that ticks `iterations` times, `update_rate` ms apart, publishing a
 * truthful progress payload each tick. Returns the legacy {pid, pfile} poll handle
 * the area_maintenance client's update_process_status speaks. Does not touch data —
 * it exists to exercise the streaming pipeline end-to-end.
 */
async function unitTestLongProcessStream(
	options: Record<string, unknown>,
	principal: Principal,
): Promise<WidgetResponse> {
	// dev knobs, bounded: 1..10000 ticks, 50 ms..60 s apart.
	const iterations = Math.min(10000, Math.max(1, Math.trunc(Number(options.iterations) || 10)));
	const updateRate = Math.min(60000, Math.max(50, Math.trunc(Number(options.update_rate) || 1000)));

	const { mediaJobs } = await import('../../media/jobs.ts');
	const record = mediaJobs.submit(
		'unit_test_long_process',
		async ({ onData, signal }) => {
			onData({ msg: `Long process started: ${iterations} iterations @ ${updateRate} ms`, is_running: true });
			for (let i = 1; i <= iterations; i++) {
				if (signal.aborted) {
					return { result: false, msg: `Stopped at iteration ${i}/${iterations}`, errors: [] };
				}
				await new Promise((resolve) => setTimeout(resolve, updateRate));
				onData({
					msg: `Iteration ${i} of ${iterations}`,
					iteration: i,
					total: iterations,
					is_running: i < iterations,
				});
			}
			return { result: true, msg: `OK. Long process finished (${iterations} iterations)`, errors: [] };
		},
		{ userId: principal.userId },
	);

	return {
		result: true,
		msg: `OK. Long process started (${iterations} iterations)`,
		errors: [],
		// legacy pfile poll handle the area_maintenance client speaks (basename).
		pid: process.pid,
		pfile: `${record.id}.json`,
	} as unknown as WidgetResponse;
}

export const widget: WidgetModule = {
	spec: { id: 'unit_test', category: 'dev', label: { kind: 'literal', text: 'Unit test area' } },
	apiActions: {
		create_test_record: unitTestCreateTestRecord,
		long_process_stream: unitTestLongProcessStream,
	},
};
