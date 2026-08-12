// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert */
/*eslint no-undef: "error"*/
'use strict';

/**
 * TEST_JOB_TRAY
 * Client-side coverage for the LONG-PROCESS MONITORING surface: the activity
 * tray, the shared job follower, and the floating dock they live in.
 *
 * WHY THESE ASSERTIONS AND NOT A RENDERED TRAY. `render_job_tray` calls
 * `get_activity` on mount and subscribes each live row to an SSE stream, so a
 * full render needs a logged-in backend with running jobs — not guaranteed in
 * the headless harness. What IS fixture-free, and is where the real bugs were,
 * splits in two:
 *
 *   1. `format_elapsed` is PURE, and it is the readout an operator stares at
 *      while waiting on an hour-long transcode. Its boundaries (unknown start,
 *      sub-minute, minute rollover, hour rollover) are exactly the places a
 *      "4m 12s" becomes "244s" or "NaN".
 *   2. `get_floating_dock` is the SHARED corner. It was private to
 *      error_report_launcher until the tray became its second tenant, and the
 *      one thing that must hold is that a second caller REUSES the dock instead
 *      of minting a rival one — two docks would stack two sets of global
 *      buttons in the same contested corner.
 *
 * Measured bug this file would have caught (2026-08-12): both new modules
 * referenced `data_manager`/`dd_console` as page globals when they are ES module
 * exports. The `dd_console` one threw INSIDE a promise chain where the module's
 * own `.catch` swallowed it — the tray mounted, reported no error, and silently
 * showed nothing. A module-load assertion is the cheapest guard against that
 * class, which is why the wiring checks below are not ceremony.
 */

import {follow_job, format_elapsed} from '../../../core/common/js/job_follow.js'
import {get_floating_dock} from '../../../core/common/js/floating_dock.js'
import {render_job_tray} from '../../../core/page/js/job_tray.js'



describe('JOB TRAY / LONG-PROCESS MONITORING CLIENT TEST', function() {

	this.timeout(10000)

	it('modules export the documented functions', function() {
		assert.equal(typeof render_job_tray, 'function', 'expected render_job_tray to be a function')
		assert.equal(typeof follow_job, 'function', 'expected follow_job to be a function')
		assert.equal(typeof format_elapsed, 'function', 'expected format_elapsed to be a function')
		assert.equal(typeof get_floating_dock, 'function', 'expected get_floating_dock to be a function')
	})

	it('format_elapsed says NOTHING when the start instant is unknown', function() {
		// A job whose pfile predates startedAtWall has no wall-clock start. The
		// readout must stay empty rather than render '56 years' from epoch 0.
		assert.equal(format_elapsed(null), '', 'expected empty string for null')
		assert.equal(format_elapsed(undefined), '', 'expected empty string for undefined')
		assert.equal(format_elapsed(0), '', 'expected empty string for 0 (epoch is not a start)')
	})

	it('format_elapsed renders seconds below a minute', function() {
		assert.equal(format_elapsed(Date.now() - 5000), '5s', 'expected 5s')
		assert.equal(format_elapsed(Date.now() - 59000), '59s', 'expected 59s')
	})

	it('format_elapsed rolls over to minutes, keeping the seconds', function() {
		// The rollover is the bit that silently breaks: a bare Math.floor of
		// minutes loses the seconds and the readout appears frozen for 60s at a
		// time — which on a long encode is exactly the "is it stuck?" question
		// this whole subsystem exists to answer.
		assert.equal(format_elapsed(Date.now() - 60000), '1m 0s', 'expected 1m 0s')
		assert.equal(format_elapsed(Date.now() - 252000), '4m 12s', 'expected 4m 12s')
	})

	it('format_elapsed rolls over to hours (an interview transcode is long)', function() {
		assert.equal(format_elapsed(Date.now() - 3600000), '1h 0m', 'expected 1h 0m')
		assert.equal(format_elapsed(Date.now() - 5400000), '1h 30m', 'expected 1h 30m')
	})

	it('format_elapsed never renders a negative age', function() {
		// Server and browser clocks disagree; a start "in the future" must clamp
		// to 0s rather than render '-3s'.
		assert.equal(format_elapsed(Date.now() + 5000), '0s', 'expected 0s for a future start')
	})

	it('get_floating_dock creates the dock once and REUSES it', function() {
		const first = get_floating_dock()
		assert.ok(first, 'expected a dock element')
		assert.equal(first.id, 'floating_dock', 'expected the shared dock id')

		const second = get_floating_dock()
		assert.equal(second, first, 'expected the SAME node — a second dock would stack rival global buttons in one corner')

		// And it must really be in the document, or its tenants render nowhere.
		assert.ok(document.getElementById('floating_dock'), 'expected the dock mounted in the document')
	})
})

// @license-end
