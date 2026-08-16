/*global SHOW_DEVELOPER */
/*eslint no-undef: "error"*/

// data_manager is an ES module export, not a page global.
import {data_manager, release_stream_reader} from './data_manager.js'
// dd_console is an import as well — see job_tray.js.
import {dd_console} from './utils/index.js'
// ONE error model + ONE dispatcher: a frame's failure and a rejected connect are
// the same kind of thing here, and both must be able to raise the relogin overlay.
import {is_api_error, normalize_stream_error, normalize_transport_error} from './api_error.js'
import {handle_api_error} from './error_dispatch.js'

/**
* JOB_FOLLOW
* Follow ONE background job to its end, over the push wire.
*
* WHY THIS EXISTS. Every surface that showed a long job used to hand-roll its own
* setTimeout poll loop against get_job_status — tool_media_versions had one with
* a one-hour cap, and each new surface would have grown another. Polling is also
* the wrong instrument here: the job runs IN THE SERVER PROCESS, so a consumer
* can be woken by the state change itself (dd_utils_api::get_job_events pushes a
* frame on every transition and ENDS on the terminal one, whose `data` carries
* the job's return value).
*
* WHAT IT DELIBERATELY DOES NOT DO: unify the two job systems' wires. A media job
* streams JobStatusFrame here; a diffusion/publication job has its own SSE, pinned
* byte-for-byte against the old engine. The activity row names which stream it
* belongs to, and this module serves the media one only.
*
* ERRORS ARE ROUTED HERE, ONCE. A job frame can now carry an `error` (envelope v2,
* api_error.js), and the connect itself rejects with an ApiError. Both go through
* `handle_api_error`, so a session that expires under a two-hour transcode raises
* the relogin overlay instead of painting a row red and saying nothing actionable.
* Doing it in THIS module rather than in each follower is what makes that true for
* every surface that follows a job — a caller still gets the terminal frame and
* decides what to paint.
*
* The reader registers itself in page_globals.stream_readers (inside
* data_manager.read_stream), so navigating away aborts it — a followed job never
* outlives the page that was watching it.
*
* (!) THE CONNECTION IS THE RESOURCE. A followed job holds one HTTP connection
* open for as long as it runs (the server pushes a keepalive frame every 15 s), and
* a browser grants six per origin over HTTP/1.1. So `cancel()` MUST release the
* transport, not merely mute the callbacks: six panels opened over one long
* transcode and closed again used to leave six live streams behind, after which
* every request on the page — `/health` first, the one probe that tells a busy
* server from a dead one — queued forever and the UI froze on 'Loading…' against a
* server that was answering in milliseconds. Muting is not releasing.
*/

/**
* FOLLOW_JOB
* Subscribe to a media job's frames until it ends.
*
* @param {string} job_id
* @param {Object} handlers
* @param {Function} [handlers.on_frame] - called with each frame
*   {job_id, is_running, data, errors, total_time}
* @param {Function} [handlers.on_done] - called ONCE with the terminal frame, or
*   with null when the stream ended without one (a server that went away
*   mid-job). A caller must treat null as "not running any more", never as
*   "still working" — that conflation is what made a dead transcode blink
*   'Processing' until the operator reloaded.
* @returns {Function} cancel — stops following AND releases the connection (it does
*   NOT stop the job itself; use stop_process for that). Calling it is mandatory
*   for any caller that can stop caring before the job ends — see the module note.
*/
export const follow_job = function(job_id, handlers) {

	const on_frame	= (handlers && handlers.on_frame) || function(){}
	const on_done	= (handlers && handlers.on_done) || function(){}

	let cancelled	= false
	let last_frame	= null
	let finished	= false
	// The last failure SEEN on a frame that did not itself end the run — an
	// unparseable frame is the case (read_stream synthesises one carrying an
	// ApiError). It only speaks if the stream then closes without a terminal
	// frame: a run that ended properly is judged by its own last frame.
	let stream_error	= null
	// The two halves of the transport, each releasable on its own: the controller
	// covers the CONNECT phase (a fetch still awaiting response headers has no
	// reader yet — request_stream documents its `signal` for exactly this), the
	// reader covers the streaming phase.
	const controller	= new AbortController()
	let reader			= null

	// finish: exactly once, whatever path got us here (terminal frame, stream
	// close, or an error). A double call would re-render a cell twice and, worse,
	// could put a build button back while the job is still running.
	//
	// `api_error` is the failure that ENDED the run, when there was one: the
	// terminal frame's own error, or the transport's. It is dispatched here and
	// the caller is still handed the frame — the lifecycle is unchanged, the
	// routing is new.
	const finish = function(frame, api_error) {
		if (finished || cancelled) {
			return
		}
		finished = true
		release()
		const error = is_api_error(api_error) ? api_error : normalize_stream_error(frame)
		if (error) {
			// not awaited: the caller's on_done must not queue behind a relogin
			// overlay the user may leave open for minutes
			handle_api_error(error).catch(function(dispatch_error){
				console.error('follow_job: error dispatch failed', dispatch_error)
			})
		}
		on_done(frame || null)
	}

	// release: give the connection back. Idempotent, and safe to call on a stream
	// that already ended — a terminal frame closes the stream server-side, but the
	// reader still sits in the shared registry until someone takes it out.
	const release = function(reason) {
		if (reader) {
			// The body is being read: cancelling the reader closes the connection and
			// ends the read loop with a normal `done`. Aborting the controller as well
			// would error that same body and surface an AbortError in the console on
			// every clean completion — the reader is the finer instrument once it exists.
			release_stream_reader(reader, reason || 'job follow ended')
			reader = null
			return
		}
		// Still connecting (or never connected): the controller is the only handle.
		controller.abort()
	}

	data_manager.request_stream({
		signal : controller.signal,
		body : {
			dd_api	: 'dd_utils_api',
			action	: 'get_job_events',
			options	: {
				job_id : job_id
			}
		}
	})
	.then(function(stream){

		if (!stream || cancelled) {
			// Cancelled while connecting: the response arrived for a consumer that is
			// already gone, so the body must be dropped here or the connection stays
			// open with nobody ever reading it — the abort above races this resolution
			// and losing that race is precisely how a slot leaks.
			if (stream && cancelled) {
				try {
					stream.cancel('cancelled while connecting')
				} catch (error) {
					if (SHOW_DEVELOPER===true) {
						dd_console('-> follow_job: stream cancel failed', 'DEBUG', error)
					}
				}
			}
			// No stream at all is not "still working": say so, so the caller can
			// fall back to checking the disk and then give a readable reason.
			finish(null)
			return
		}

		reader = data_manager.read_stream(
			stream,
			function(sse_response){
				if (cancelled) {
					return
				}
				if (SHOW_DEVELOPER===true) {
					dd_console('-> follow_job frame:', 'DEBUG', sse_response)
				}
				last_frame = sse_response
				const frame_error = normalize_stream_error(sse_response)
				if (frame_error) {
					stream_error = frame_error
				}
				on_frame(sse_response)
				// The server ends the stream on this frame; finishing here (rather
				// than only in on_done) means the caller reacts to the TERMINAL
				// frame, which is the one carrying the job's return value.
				if (sse_response && sse_response.is_running===false) {
					finish(sse_response)
				}
			},
			function(){
				// Stream closed. If a terminal frame already arrived this is a no-op;
				// otherwise the job's fate is unknown and the caller is told so.
				finish(
					last_frame && last_frame.is_running===false ? last_frame : null,
					stream_error
				)
			}
		)
	})
	.catch(function(error){
		// A cancel ABORTS the in-flight fetch, so its rejection is the expected end
		// of a teardown, not a failure worth a red console line.
		if (!cancelled) {
			console.error(`follow_job failed for ${job_id}:`, error)
		}
		// request_stream rejects with an ApiError (its @throws): the server's own
		// code when the answer was an envelope — `auth.not_logged` included.
		finish(null, is_api_error(error) ? error : normalize_transport_error(error))
	})

	return function cancel() {
		if (cancelled) {
			return
		}
		cancelled = true
		release('follow cancelled')
	}
}//end follow_job



/**
* CREATE_JOB_FOLLOWER_GROUP
* A LIFETIME for followers. Any surface that can be closed, destroyed or
* re-rendered while the jobs it watches keep running needs one: it follows through
* the group, and one `cancel_all()` in its teardown releases every connection the
* surface opened.
*
* Without it each caller has to remember to keep the cancel function returned by
* `follow_job` and call it on every exit path — and the measured cost of forgetting
* is not a stale callback but a starved origin (see the module note). A panel that
* re-renders is the same case as one that closes: the followers of the previous
* pass belong to a DOM that no longer exists.
*
* Finished followers prune themselves, so the group does not grow across a long
* session of watching jobs to completion.
*
* @returns {Object} {follow(job_id, handlers), cancel_all(), size()}
*/
export const create_job_follower_group = function() {

	const followers = new Set()

	return {
		follow : function(job_id, handlers) {

			const wrapped	= Object.assign({}, handlers)
			let cancel		= null

			// Self-pruning: a job followed to its end must not leave an entry behind.
			// Wrapping on_done (rather than pruning in a timer) keeps the group's
			// contents equal to "what is still connected".
			wrapped.on_done = function(frame) {
				if (cancel) {
					followers.delete(cancel)
				}
				if (handlers && handlers.on_done) {
					handlers.on_done(frame)
				}
			}

			cancel = follow_job(job_id, wrapped)
			followers.add(cancel)

			return cancel
		},
		cancel_all : function() {
			for (const cancel of followers) {
				cancel()
			}
			followers.clear()
		},
		size : function() {
			return followers.size
		}
	}
}//end create_job_follower_group



/**
* FORMAT_ELAPSED
* Human elapsed time from a wall-clock start, for a progress readout.
* Wall-clock (not the job's monotonic marks) is what survives a page reload —
* the whole reason JobRecord carries startedAtWall.
*
* @param {number|null} started_at - ms since epoch
* @returns {string} '' when unknown, else '4m 12s' / '45s'
*/
export const format_elapsed = function(started_at) {

	if (!started_at) {
		return ''
	}
	const seconds = Math.max(0, Math.round((Date.now() - started_at) / 1000))
	if (seconds < 60) {
		return `${seconds}s`
	}
	const minutes = Math.floor(seconds / 60)
	if (minutes < 60) {
		return `${minutes}m ${seconds % 60}s`
	}
	return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}//end format_elapsed
