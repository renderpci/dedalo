/*global get_label, page_globals, SHOW_DEVELOPER */
/*eslint no-undef: "error"*/

/**
* JOB_TRAY
* The page-wide readout of the user's own background work.
*
* WHAT IT FIXES. Long work in Dédalo is invisible the moment you look away from
* the surface that started it. Upload a 46-minute interview and the default
* quality goes to a background ffmpeg transcode: the upload dialog says
* "complete" (the UPLOAD is), the media-versions panel shows the tier as an empty
* cell, and nothing anywhere says the machine is still working. Publications have
* the same shape. So the operator's honest reading was "nothing is happening",
* and the natural next move was to start the work again.
*
* WHAT IT SHOWS. Both job systems, as equal citizens:
*  - media jobs (transcodes, imports, indexation) — in-process, ephemeral
*  - diffusion/publication jobs — a durable Postgres queue with its own runners
* A tray that read only the first would omit the LONGEST process in the system
* while looking perfectly functional, so the aggregation is the point, not a
* convenience. The server does it in ONE read model (dd_utils_api::get_activity);
* this module only paints it.
*
* WHAT IT IS NOT. Not an admin console. `diffusion_server_control` in
* area_maintenance already owns pause/drain/purge across ALL users' jobs; this is
* per-user awareness of your own work. Different audiences, no duplication.
*
* LIVE UPDATES come from each row's OWN system: the row names its stream, and a
* media row is followed over get_job_events while a publication row keeps
* diffusion's pinned wire. Neither contract was touched to build this.
*/

// imports
	import {ui} from '../../common/js/ui.js'
	// data_manager is an ES module export, NOT a page global — a bare reference
	// throws at the tray's first read (measured in the browser: 'data_manager is
	// not defined' from read_activity).
	import {data_manager} from '../../common/js/data_manager.js'
	import {follow_job, format_elapsed} from '../../common/js/job_follow.js'
	import {get_floating_dock} from '../../common/js/floating_dock.js'
	// dd_console is an import too — a bare call throws INSIDE the promise chain,
	// where the module's own .catch swallows it and the tray silently shows nothing.
	import {dd_console} from '../../common/js/utils/index.js'



/** How often the elapsed readouts re-render (frames arrive only on CHANGES). */
const TICK_MS = 1000

/** How long a finished row lingers before it fades (failures never do). */
const DONE_LINGER_MS = 8000

/**
* Ticks between server re-reads WHILE a publication is live (10 s at TICK_MS).
* Publications are the one row kind with no push stream here, so they need a
* poll — but only while one is running, and slowly: `listActiveJobsForOwner` is
* a narrow reader precisely so this is cheap, and diffusion counters move once
* per batch, not once per second.
*/
const DIFFUSION_REFRESH_TICKS = 10



/**
* RENDER_JOB_TRAY
* Mount the tray into the page wrapper. Idempotent per page render.
*
* @returns {Object} the tray controller {node, add_job, refresh}
*/
export const render_job_tray = function() {

	// ONE tray per document. render_page runs on every area change, and a second
	// tray would double every row and every SSE subscription.
	if (page_globals.job_tray) {
		page_globals.job_tray.refresh()
		return page_globals.job_tray
	}

	// A TENANT OF #floating_dock, never self-positioned. That corner is contested
	// (the inspector rail in edit mode, the assistant composer in list mode) and
	// the dock's offsets are calc()s over --inspector_width, so a tenant follows a
	// live panel resize for free. floating_dock.less states the law this obeys:
	// never position a global element with its own fixed coordinates.
	//
	// Hidden until there is something to say — an always-visible "0 jobs" chip is
	// noise on a system that is idle most of the time.
	const container = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'job_tray hidden',
		parent			: get_floating_dock()
	})

	const toggle = ui.create_dom_element({
		element_type	: 'button',
		class_name		: 'job_tray_toggle',
		parent			: container
	})
	// The chip is a bare count, so the accessible name has to come from here.
	toggle.setAttribute('title', get_label.background_activity || 'Background activity')
	toggle.setAttribute('aria-label', get_label.background_activity || 'Background activity')
	const count_node = ui.create_dom_element({
		element_type	: 'span',
		class_name		: 'job_tray_count',
		parent			: toggle
	})

	const list = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'job_tray_list hidden',
		parent			: container
	})

	toggle.addEventListener('click', () => {
		list.classList.toggle('hidden')
	})

	// rows: job_id → {node, row, cancel_follow, update}
	const rows = new Map()

	/**
	* paint: container visibility + the running count.
	* Rows that have FINISHED still occupy the list (a failure must be readable),
	* but only live work drives the count — a chip that says "3" when nothing is
	* running is the same lie in the other direction.
	*/
	const paint = function() {
		let live = 0
		for (const entry of rows.values()) {
			if (entry.row.status==='running' || entry.row.status==='queued') {
				live++
			}
		}
		count_node.innerHTML = String(live)
		container.classList.toggle('hidden', rows.size===0)
		container.classList.toggle('has_live', live>0)
	}

	/** Drop a row from the tray. */
	const remove_row = function(job_id) {
		const entry = rows.get(job_id)
		if (!entry) {
			return
		}
		if (entry.cancel_follow) {
			entry.cancel_follow()
		}
		entry.node.remove()
		rows.delete(job_id)
		paint()
	}

	/**
	* add_job: put one activity row in the tray and follow it.
	* Safe to call for a job already shown — the server's answer and a
	* just-started job legitimately overlap (an upload hands its job id straight
	* here while the next get_activity is still in flight).
	*/
	const add_job = function(row) {

		if (!row || !row.job_id || rows.has(row.job_id)) {
			return
		}

		const node = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'job_tray_row source_' + (row.source || 'media'),
			parent			: list
		})

		const label_node = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'job_tray_label',
			parent			: node
		})
		// textContent, NEVER inner_html: `label` is wire data — a diffusion job's
		// `totals->>'msg'`, or a media tier name — and the owner name rendered
		// elsewhere is another USER'S self-editable display field. Any of them
		// reaching innerHTML is stored cross-user XSS the moment two people touch
		// one record.
		label_node.textContent = String(row.label || row.job_id)

		const bar_track = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'job_tray_track',
			parent			: node
		})
		const bar_fill = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'job_tray_fill',
			parent			: bar_track
		})

		const elapsed_node = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'job_tray_elapsed',
			parent			: node
		})

		// Navigate to the record this work belongs to. Two kinds of row have no
		// record to open and get no link rather than a dead one: the genuinely
		// record-less jobs (a backup), and PUBLICATIONS, which target a whole
		// section — their section_id is null, which this truthiness check catches.
		if (row.record && row.record.section_tipo && row.record.section_id) {
			label_node.classList.add('linked')
			label_node.addEventListener('click', () => {
				const url = `${page_globals.dedalo_root_web}/?tipo=${row.record.section_tipo}&section_id=${row.record.section_id}&modo=edit`
				window.open(url, '_blank')
			})
		}

		const update = function(status, progress) {
			row.status = status || row.status
			if (typeof progress==='number' && isFinite(progress)) {
				bar_track.classList.remove('indeterminate')
				bar_fill.style.width = `${Math.max(0, Math.min(100, progress))}%`
			}else{
				// No percentage is knowable. An indeterminate sweep says "working"
				// without claiming a number nobody measured.
				bar_track.classList.add('indeterminate')
				bar_fill.style.width = '100%'
			}
			elapsed_node.textContent = format_elapsed(row.started_at)
			node.classList.remove('state_running','state_done','state_error','state_cancelled','state_interrupted','state_queued')
			node.classList.add('state_' + row.status)
			// A terminal row states its reason, so the operator never has to leave
			// the tray to learn why something went red.
			const reason = (row.errors && row.errors.length>0) ? row.errors.join('; ') : ''
			if (reason!=='') {
				label_node.setAttribute('title', reason)
			}
			// Three states for the one control: Cancel a stoppable job, Close a
			// finished row, or nothing at all for a live PUBLICATION (no
			// user-scoped cancel door exists — see can_stop).
			const stoppable = can_stop(row)
			const dismissable = !is_live_status(row.status)
			action_node.classList.toggle('hidden', !stoppable && !dismissable)
			action_node.textContent = stoppable ? '\u00d7' : '\u2715'
			action_node.setAttribute(
				'title',
				stoppable ? (get_label.cancel || 'Cancel') : (get_label.close || 'Close')
			)
			paint()
		}

		// THE MANAGING HALF. A monitoring surface that can only watch is half a
		// tool: while a job is live this STOPS it (the stop_process wire already
		// exists and the job manager aborts cooperatively), and once terminal the
		// same control DISMISSES the row. Without the dismiss, failed rows — which
		// deliberately never auto-fade — accumulate for the whole session with no
		// way to clear them.
		const action_node = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'job_tray_action',
			parent			: node
		})
		action_node.addEventListener('click', async () => {
			if (!is_live_status(row.status)) {
				remove_row(row.job_id)
				return
			}
			if (!can_stop(row)) {
				return
			}
			action_node.disabled = true
			await stop_job(row)
			// The outcome is not assumed here: the follow stream (or the next
			// refresh) reports what the server actually did with the request.
		})

		update(row.status, row.progress)

		/** Linger a finished row briefly, then drop it — failures persist. */
		const retire = function() {
			if (row.status==='error' || row.status==='interrupted') {
				return // a failure stays until the operator dismisses it
			}
			setTimeout(() => remove_row(row.job_id), DONE_LINGER_MS)
		}

		const entry = {node, row, update, retire, cancel_follow: null}
		rows.set(row.job_id, entry)

		// Follow only what can still change, and only over ITS OWN stream. A
		// diffusion row is not followed here: its progress belongs to the pinned
		// diffusion wire, and the next get_activity refresh carries it.
		if ((row.status==='running' || row.status==='queued') && row.stream==='job_events') {
			entry.cancel_follow = follow_job(row.job_id, {
				on_frame : function(frame) {
					if (frame && typeof frame.progress==='number') {
						update('running', frame.progress)
					}
				},
				on_done : function(frame) {
					const errors = (frame && Array.isArray(frame.errors)) ? frame.errors : []
					if (!frame) {
						// The stream closed without a terminal frame: the server went
						// away while the job ran. Not a success and not "still working".
						update('interrupted', null)
						return
					}
					if (errors.length>0) {
						update('error', null)
						label_node.setAttribute('title', errors.join('; '))
						// A failure PERSISTS until dismissed — fading it away is how a
						// failed transcode becomes something nobody ever learns about.
						return
					}
					update('done', 100)
					retire()
				}
			})
		}

		paint()
	}

	/**
	* refresh: re-read the server's activity, add what is new, and RECONCILE what
	* is already shown against the server's stated outcome.
	*
	* ABSENCE IS NEVER AN OUTCOME. An earlier version treated a diffusion row's
	* disappearance from the answer as completion and painted it `done 100%` —
	* which turned every FAILED and CANCELLED publication into a green tick, and
	* turned a single dropped request into "all your publications succeeded".
	* The server now returns live rows AND rows that finished inside
	* RECENT_TERMINAL_MS, so every outcome is STATED. Absence therefore means only
	* "older than the window", and the row is dropped silently — the operator was
	* already told what happened.
	*
	* `read_activity` returns NULL when the read itself failed, and a failed read
	* reconciles nothing. Distinguishing "no jobs" from "could not ask" is the
	* whole difference between a quiet tray and a lying one.
	*/
	const refresh = async function() {
		const jobs = await read_activity()
		if (jobs===null) {
			return // the read failed; what is on screen is still the best truth we have
		}
		for (const row of jobs) {
			add_job(row)
		}
		const seen = new Map(jobs.map(job => [job.job_id, job]))
		for (const [job_id, entry] of [...rows.entries()]) {
			const fresh = seen.get(job_id)
			if (fresh===undefined) {
				// Past the recency window. A row this old has already reported its
				// outcome; retire it without inventing a new one.
				if (!is_live_status(entry.row.status)) {
					remove_row(job_id)
				}
				continue
			}
			// A media row being FOLLOWED over SSE owns its own truth — its stream
			// reports transitions faster and with the error detail. Reconcile the
			// others, which is what makes the publication bar move at all: before
			// this, refresh only ever ADDED rows, so a publication's progress was
			// frozen at whatever it read on first sight until it vanished.
			if (entry.cancel_follow) {
				continue
			}
			entry.row.errors = fresh.errors
			entry.update(fresh.status, fresh.progress)
			if (!is_live_status(fresh.status)) {
				entry.retire()
			}
		}
	}

	// The elapsed readouts tick locally: SSE frames arrive on state CHANGES, and
	// a long encode legitimately says nothing for minutes. A frozen clock during
	// that silence is exactly what "looks wedged" means.
	//
	// The same tick re-reads the server while a PUBLICATION is live, since those
	// rows have no push stream to wake them. Only while one is live: an idle tray
	// must not poll the server once a second forever.
	let ticks = 0
	setInterval(() => {
		let diffusion_live = false
		for (const entry of rows.values()) {
			if (entry.row.status==='running' || entry.row.status==='queued') {
				entry.node.querySelector('.job_tray_elapsed').textContent = format_elapsed(entry.row.started_at)
				if (entry.row.source==='diffusion') {
					diffusion_live = true
				}
			}
		}
		ticks++
		if (diffusion_live && (ticks % DIFFUSION_REFRESH_TICKS)===0) {
			refresh()
		}
	}, TICK_MS)

	const controller = {
		node	: container,
		add_job	: add_job,
		refresh	: refresh
	}

	// Expose the tray so any surface can hand it a job it just started
	// (tool_upload does exactly that) without threading a reference through
	// every intermediate layer.
	page_globals.job_tray = controller

	// First read.
	refresh()

	return controller
}//end render_job_tray



/**
* READ_ACTIVITY
* The caller's own running work, across both job systems.
*
* @returns {Promise<Array<Object>|null>} the rows, or NULL when the read itself
*   failed (network, session expiry, 500).
*
*   NULL VS []: an empty array means "the server says nothing of yours is
*   running", which is a fact the tray may act on. Null means "we could not
*   ask", which it may NOT — an earlier version collapsed both to [] and so a
*   single dropped request reconciled every live publication to `done`. A
*   monitoring surface whose failure mode is fabricating success is worse than
*   no surface at all.
*/
const read_activity = async function() {

	return new Promise(function(resolve){
		data_manager.request({
			body : {
				dd_api	: 'dd_utils_api',
				action	: 'get_activity',
				options	: {}
			}
		})
		.then(function(response){
			if (SHOW_DEVELOPER===true) {
				dd_console('-> get_activity API response:', 'DEBUG', response)
			}
			resolve((response && response.result===true && Array.isArray(response.jobs))
				? response.jobs
				: null)
		})
		.catch(function(){
			resolve(null)
		})
	})
}//end read_activity



/** Whether a status still represents work in flight (mirrors isLiveActivity). */
const is_live_status = function(status) {
	return status==='running' || status==='queued'
}



/**
* STOP_JOB
* Ask the server to cancel a live job.
*
* Media jobs abort cooperatively through the existing `stop_process` wire (the
* job manager aborts the job's controller; the handler winds down at its next
* loop boundary). Publications are cancelled through the diffusion admin action,
* which is the only door that owns that queue.
*
* Deliberately does NOT update the row: the stream (or the next refresh) reports
* what the server ACTUALLY did. Painting "cancelled" on request would be the
* absence-means-done mistake in a new place — a request is not an outcome.
*
* @param {Object} row - the activity row
* @returns {Promise<void>}
*/
const stop_job = async function(row) {

	try {
		await data_manager.request({
			body : {
				dd_api	: 'dd_utils_api',
				action	: 'stop_process',
				options	: { id : row.job_id }
			}
		})
	} catch (error) {
		console.error(`stop_job failed for ${row.job_id}:`, error)
	}
}//end stop_job



/**
* CAN_STOP
* Whether the tray may offer to stop this row.
*
* MEDIA rows only. `stop_process` is owner-gated, so a user may stop their own
* job — the right door for a per-user tray. Diffusion's cancel
* (`diffusion_server_control::cancel_process`) is an ADMIN action scoped to any
* owner, reached through the maintenance console; calling it from here would
* either be refused for an ordinary user or hand them an admin capability
* through a side door. Neither is acceptable, and INVENTING a user-scoped
* diffusion cancel is a wire change that belongs in its own contract entry — so
* a publication row simply gets no Stop, and the admin console keeps owning it.
*
* @param {Object} row
* @returns {boolean}
*/
const can_stop = function(row) {
	return row.source==='media' && is_live_status(row.status)
}
