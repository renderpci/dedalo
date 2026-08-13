// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert, page_globals */
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

import {create_job_follower_group, follow_job, format_elapsed} from '../../../core/common/js/job_follow.js'
import {data_manager, release_stream_reader} from '../../../core/common/js/data_manager.js'
import {get_floating_dock} from '../../../core/common/js/floating_dock.js'
import {render_job_tray} from '../../../core/page/js/job_tray.js'



/**
* WITH_STUBBED_STREAM
* Run `body` with `data_manager.request_stream` replaced by a stream that opens
* and then says NOTHING — the shape of a transcode being followed. Restores the
* real method whatever happens, so one failing assertion cannot leave the rest of
* the suite talking to a stub.
*
* Stubbing the TRANSPORT and not `read_stream` is deliberate: the registry push
* and the reader lifecycle are the things under test, and they live in the real
* `read_stream`.
*
* @param {Function} body - async (stream_state) => void
* @returns {Promise<void>}
*/
const with_stubbed_stream = async function(body) {

	const original	= data_manager.request_stream
	const state		= {cancelled: 0, opened: 0}

	data_manager.request_stream = async function() {
		state.opened++
		return new ReadableStream({
			start : function() {
				// deliberately silent: a live job that has not published a frame yet
			},
			cancel : function() {
				state.cancelled++
			}
		})
	}

	try {
		await body(state)
	} finally {
		data_manager.request_stream = original
	}
}//end with_stubbed_stream



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


	// ── NO USER, NO TRAY ──────────────────────────────────────────────────────
	// Measured bug (2026-08-13): render_page mounts the tray for the LOGIN
	// element too, and the tray's first act is get_activity — which the session
	// gate answers 401 errors:['not_logged'] to an anonymous caller. page.js
	// turns that token into the re-login OVERLAY, so the boot login form got a
	// second login panel stacked on it and the operator typed the credentials
	// twice. The guard is in the tray, so no mount site can reintroduce it.

	it('render_job_tray mounts NOTHING and asks NOTHING when logged out', async function() {

		const was_logged	= page_globals.is_logged
		const was_tray		= page_globals.job_tray
		const original		= data_manager.request
		let requests		= 0

		data_manager.request = async function() {
			requests++
			return {result: false}
		}

		// Counted, not asserted at zero: the harness page may legitimately carry a
		// tray of its own — what must not happen is a NEW one.
		const trays_before = document.querySelectorAll('.job_tray').length

		try {
			page_globals.is_logged	= false
			page_globals.job_tray	= null

			const tray = render_job_tray()

			// let any (wrongly) fired read reach the stub
			await new Promise(resolve => setTimeout(resolve, 50))

			assert.equal(tray, null, 'expected NO tray controller for an anonymous page')
			assert.equal(requests, 0, 'expected NO get_activity — its 401 is what raises the duplicate login panel')
			assert.equal(page_globals.job_tray ?? null, null, 'expected no tray published to page_globals')
			assert.equal(
				document.querySelectorAll('.job_tray').length,
				trays_before,
				'expected no tray node added to the document'
			)
		} finally {
			data_manager.request	= original
			page_globals.is_logged	= was_logged
			page_globals.job_tray	= was_tray
		}
	})


	// ── THE CONNECTION IS THE RESOURCE ────────────────────────────────────────
	// A followed job holds one HTTP connection for as long as it runs, and a
	// browser grants six per origin over HTTP/1.1. Measured bug (2026-08-13):
	// follow_job's cancel() only muted its callbacks, so closing and reopening
	// tool_media_versions over one long transcode left a live stream behind each
	// time; at the sixth, every request on the page queued forever — /health
	// first, the very probe data_manager uses to tell a busy server from a dead
	// one — and the panel froze on 'Loading…' with 6 s timeouts against a server
	// answering in milliseconds. Reproduced exactly at 6 held streams. These
	// assertions are what stands between that bug and its return.

	it('follow_job cancel RELEASES the reader, it does not merely mute it', async function() {

		await with_stubbed_stream(async function(state) {

			const registry	= page_globals.stream_readers
			const before	= registry.length

			let done_calls	= 0
			const cancel	= follow_job('test_job_1', {
				on_done : function() { done_calls++ }
			})

			// let request_stream resolve and read_stream register its reader
			await new Promise(resolve => setTimeout(resolve, 50))
			assert.equal(registry.length, before + 1, 'expected the reader registered while following')

			cancel()
			await new Promise(resolve => setTimeout(resolve, 50))

			assert.equal(state.cancelled, 1, 'expected the underlying stream CANCELLED — a muted callback still holds the connection')
			assert.equal(registry.length, before, 'expected the reader dropped from page_globals.stream_readers')
			assert.equal(done_calls, 0, 'expected no on_done on an explicit cancel (the caller is tearing down)')

			// Idempotent: teardown paths overlap (a destroy after a re-render).
			cancel()
			assert.equal(state.cancelled, 1, 'expected a second cancel to be a no-op')
		})
	})


	it('release_stream_reader splices its OWN entry, by identity', async function() {

		// The registry is shared with make_backup, unit_test, the move_* widgets
		// and tool_diffusion — a `length = 0` here would orphan their readers.
		const registry	= page_globals.stream_readers
		const before	= registry.length

		let cancelled	= false
		const mine		= {cancel : function() { cancelled = true }}
		const other		= {cancel : function() { assert.fail('a foreign reader must never be cancelled') }}
		registry.push(other, mine)

		const released = release_stream_reader(mine, 'test')

		assert.equal(released, true, 'expected release_stream_reader to report the release')
		assert.equal(cancelled, true, 'expected reader.cancel() called — that is what closes the connection')
		assert.equal(registry.indexOf(mine), -1, 'expected MY entry gone')
		assert.ok(registry.indexOf(other) !== -1, 'expected the OTHER consumer\'s reader untouched')

		assert.equal(release_stream_reader(null), false, 'expected a null reader to be a safe no-op')

		// restore the registry to the state the rest of the suite found it in
		registry.splice(registry.indexOf(other), 1)
		assert.equal(registry.length, before, 'expected the registry restored')
	})


	it('a follower group releases EVERY stream it opened', async function() {

		// This is the lifetime tool_media_versions hangs its panel on: one
		// cancel_all() in destroy() (and at the head of each render pass) must give
		// back every connection the surface opened, however many tiers it followed.
		await with_stubbed_stream(async function(state) {

			const registry	= page_globals.stream_readers
			const before	= registry.length
			const group		= create_job_follower_group()

			group.follow('test_job_a', {})
			group.follow('test_job_b', {})
			group.follow('test_job_c', {})
			await new Promise(resolve => setTimeout(resolve, 50))

			assert.equal(group.size(), 3, 'expected 3 tracked followers')
			assert.equal(registry.length, before + 3, 'expected 3 readers registered')

			group.cancel_all()
			await new Promise(resolve => setTimeout(resolve, 50))

			assert.equal(state.cancelled, 3, 'expected all 3 streams cancelled')
			assert.equal(group.size(), 0, 'expected the group emptied')
			assert.equal(registry.length, before, 'expected every reader dropped from the shared registry')
		})
	})
})

// @license-end
