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

import { CLIENT_LIBS, isDevMode } from '../../client_libs/registry.ts';
import { resolveClientLibPath } from '../../client_libs/serving.ts';
import { DedaloError } from '../../errors/dedalo_error.ts';
import type { Principal } from '../../security/permissions.ts';
import { resetTestSection } from '../../test_data/seed.ts';
import type { WidgetModule, WidgetResponse } from './support.ts';

/**
 * What this installation can offer the unit-test panel — the catalog `value` the
 * client renders from, so the browser never decides on its own:
 *  - `dev_mode`: DEDALO_DEV_MODE. Gates the matrix_test reset (server-refused
 *    below, button hidden client-side).
 *  - `harness_missing`: the `devOnly` client libs (mocha/chai) that do not
 *    resolve. A production install (`bun install --production`: the Dockerfile
 *    default target, the code updater) drops them even with dev mode on, and the
 *    runner page then dies on JSON 404s — so dev mode alone does not make the
 *    "Open JS unit test" button honest.
 *  - `harness_available`: dev mode AND nothing missing.
 * Resolved through `resolveClientLibPath` — the SAME door that serves
 * /dedalo/lib/*, so the panel cannot disagree with what the browser will get.
 */
export function unitTestPosture(): {
	dev_mode: boolean;
	harness_available: boolean;
	harness_missing: string[];
} {
	const devMode = isDevMode();
	const missing = devMode
		? Object.entries(CLIENT_LIBS)
				.filter(([, lib]) => lib.devOnly === true)
				.filter(([id, lib]) => resolveClientLibPath(id, lib.probe) === null)
				.map(([id]) => id)
		: [];
	return {
		dev_mode: devMode,
		harness_available: devMode && missing.length === 0,
		harness_missing: missing,
	};
}

/**
 * COVERAGE-EXEMPT — THE LOUDEST EXEMPTION IN THE TREE (coverage plan §5.2; reason
 * registered in engineering/crap_coverage_exempt.json). `resetTestSection()`
 * TRUNCATEs `matrix_test` — the suite's OWN `test3` fixture table
 * (core/test_data/seed.ts: "Destroys EVERY row in the table, scratch tipos
 * included") — mid-run, in the single shared Bun process, for every agent running
 * concurrently against the suite database. NO scratch surface can contain it and
 * NO gate may invoke it. The restorative semantics it exists for are gated
 * through `restoreCanonicalTest3()`.
 */
async function unitTestCreateTestRecord(): Promise<WidgetResponse> {
	// Dev-server-only: the button is hidden elsewhere, but an admin can POST the
	// action directly — the refusal is the guarantee, the hidden button is not.
	if (!isDevMode()) {
		throw new DedaloError('maintenance.dev_mode_required', {
			coordinates: { widget_action: 'unit_test.create_test_record' },
		});
	}
	await resetTestSection();
	return { data: true, msg: 'OK. Request done unit_test::create_test_record' };
}

/**
 * One long-process JOB FRAME — the payload the media-jobs record publishes and
 * the client's SSE reader renders. A frame, NOT an envelope
 * (engineering/ERRORS_SPEC.md §5): its `result`/`msg`/`errors` keys are the
 * stream contract the area_maintenance client already reads, and the converter
 * never touches them.
 */
function longProcessFrame(finished: boolean, msg: string): Record<string, unknown> {
	return { result: finished, msg, errors: [] };
}

/**
 * The dev knobs of the long-process stream, CLAMPED: 1..10000 ticks, 50 ms..60 s
 * apart. The upper clamps are the point — without them an admin can post
 * `iterations:1e9 @ 60s` and pin a `mediaJobs` slot effectively forever (a
 * self-inflicted availability bug on the one action built to be fired casually).
 * Note the quirk, deliberately preserved: `|| 10` / `|| 1000` swallow 0 and NaN
 * BEFORE the clamps, so `{iterations:0}` is 10, not 1.
 * Extracted from unitTestLongProcessStream so the arithmetic is gateable without
 * submitting a background job that outlives the test file.
 */
export function longProcessBounds(options: Record<string, unknown>): {
	iterations: number;
	updateRate: number;
} {
	return {
		iterations: Math.min(10000, Math.max(1, Math.trunc(Number(options.iterations) || 10))),
		updateRate: Math.min(60000, Math.max(50, Math.trunc(Number(options.update_rate) || 1000))),
	};
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
	const { iterations, updateRate } = longProcessBounds(options);

	const { mediaJobs } = await import('../../media/jobs.ts');
	const record = mediaJobs.submit(
		'unit_test_long_process',
		async ({ onData, signal }) => {
			onData({
				msg: `Long process started: ${iterations} iterations @ ${updateRate} ms`,
				is_running: true,
			});
			for (let i = 1; i <= iterations; i++) {
				if (signal.aborted) {
					return longProcessFrame(false, `Stopped at iteration ${i}/${iterations}`);
				}
				await new Promise((resolve) => setTimeout(resolve, updateRate));
				onData({
					msg: `Iteration ${i} of ${iterations}`,
					iteration: i,
					total: iterations,
					is_running: i < iterations,
				});
			}
			return longProcessFrame(true, `OK. Long process finished (${iterations} iterations)`);
		},
		// The dev long-process probe is operator work (PERF-11 lane).
		{ lane: 'maintenance', userId: principal.userId },
	);

	return {
		data: true,
		msg: `OK. Long process started (${iterations} iterations)`,
		// legacy pfile poll handle the area_maintenance client speaks (basename).
		extend: { pid: process.pid, pfile: `${record.id}.json` },
	};
}

export const widget: WidgetModule = {
	spec: { id: 'unit_test', category: 'dev', label: { kind: 'literal', text: 'Unit test area' } },
	eagerValue: async () => unitTestPosture(),
	apiActions: {
		create_test_record: unitTestCreateTestRecord,
		long_process_stream: unitTestLongProcessStream,
	},
};
