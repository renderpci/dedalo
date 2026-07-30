// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global SHOW_DEBUG, page_globals */
/*eslint no-undef: "error"*/



// imports
	// the ONE progress model — shared with the render module, so the bar this
	// patches can never disagree with the bar that was rendered
	import {format_int, progress_view, row_signature} from './progress_model.js'
	import {paint_rollup} from './rollup_panel.js'



/**
* LIVE_DIFFUSION_SERVER_CONTROL
* The live layer for the diffusion_server_control widget: it follows the admin
* queue stream (dd_diffusion_api::follow_queue, WC-067) and patches the already
* rendered DOM in place.
*
* This is the FIRST widget in the client to hold a live server connection, so
* the interesting part is not the rendering — it is the lifecycle. Three rules
* shape everything below:
*
* 1. THE LAYER IS STRICTLY ADDITIVE. Every failure path leaves exactly the
*    widget that existed before: a static snapshot with a working Refresh
*    button and working action buttons. It never applies the `lock` class, never
*    blanks a number it can no longer refresh, and never disables a control.
*    A broken feed must degrade to "not live", never to "not usable".
*
* 2. IT NEVER REBUILDS. self.refresh() would replace the whole widget DOM on
*    every frame — destroying focus, the value the admin is typing into the
*    purge-hours input, and the scroll position, once a second. Frames patch a
*    fixed set of text nodes and one bar width. A row is rebuilt only when its
*    STRUCTURE changes (see apply_frame), and the table body only when the set
*    of jobs changes.
*
* 3. TEARDOWN IS EXPLICIT AND OVER-DETERMINED. The area_maintenance host does
*    not destroy widgets on collapse, and until the WC-067 host edits it did not
*    notify them either. So this controller registers in `ar_instances` (the
*    framework's own dependency teardown), listens for the host's new
*    on_collapse/on_expose/dd_maintenance_view signals, AND re-checks visibility
*    on every frame. Any one of those alone has a hole; together they close it.
*
* The controller is created at exactly ONE site (get_content_data_edit), which
* destroys any previous controller first — that makes "exactly one stream per
* widget" structural rather than a rule someone has to remember.
*/



/**
* CREATE_LIVE_CONTROLLER
* Build the live controller for one rendered content_data node.
*
* @param {Object}      self         - the diffusion_server_control widget instance
* @param {HTMLElement} content_data - the node this controller owns and patches
* @param {Object}      options
* @param {Function}    options.on_reload - called when the job SET changes; the
*   widget answers with ONE get_value refetch. This is the only path that
*   re-reads the 24h history, which is why the stream itself never does.
* @returns {Object} controller with { evaluate, destroy, destroyable }
*/
export const create_live_controller = function(self, content_data, options={}) {

	const on_reload = typeof options.on_reload==='function' ? options.on_reload : () => {}

	// epoch: bumped on every open. A frame from a superseded stream is dropped
	// rather than written into a detached DOM (render 'content' replaces the
	// node, so the old subtree can still be referenced by an in-flight reader).
	let epoch			= 0
	let reader			= null
	let closed			= true
	let strikes			= 0
	let reconnect_timer	= null

	// backoff, then give up. An unbounded retry against a dead endpoint hammers
	// the server, and the admin already has a Refresh button that works.
	const BACKOFF_MS	= [2000, 5000, 15000]
	const MAX_STRIKES	= 3
	const OPEN_TIMEOUT_MS = 10000


	/**
	* SET_CHIP
	* The one place the live/reconnecting/unavailable state is shown. Reuses the
	* kit pill vocabulary so it needs no CSS of its own.
	*/
	const set_chip = function(state, text) {
		const chip = content_data.querySelector('.dsc_live_chip')
		if (!chip) return
		chip.className = 'dd_badge dsc_live_chip ' + state
		chip.textContent = text
	}


	/**
	* SHOULD_STREAM
	* Whether a stream should be open right now.
	*
	* offsetParent===null is the exact test for "an ancestor is display:none",
	* which covers BOTH ways this widget becomes invisible: a collapsed accordion
	* (.hide) and the Map/List view switch (.view_map hides .list_view_wrap).
	* Nothing here is position:fixed, so the test has no false negatives.
	*
	* is_admin is re-checked even though the server gates the action twice: the
	* client fails closed too, so a non-admin never even opens the socket.
	*/
	const should_stream = function() {
		return content_data.isConnected
			&& content_data.offsetParent !== null
			&& !document.hidden
			&& self.value?.is_admin === true
	}


	/**
	* STOP_STREAM
	* Release the reader and drop this controller's entry from the GLOBAL
	* stream_readers registry.
	*
	* (!) Splices its OWN entry by identity. page_globals.stream_readers is shared
	* with make_backup, unit_test, the move_* widgets and tool_diffusion — a
	* `.length = 0` here would silently orphan their readers too.
	*
	* (!) on_done does NOT fire on an explicit cancel, so any UI reset has to
	* happen here rather than in the read loop's completion path.
	*/
	const stop_stream = function() {
		if (reconnect_timer!==null) {
			clearTimeout(reconnect_timer)
			reconnect_timer = null
		}
		closed = true
		const current = reader
		reader = null
		if (current) {
			try {
				current.cancel('live teardown')
			} catch (error) {
				if (SHOW_DEBUG===true) console.warn('[diffusion live] reader cancel failed', error)
			}
			const registry = (typeof page_globals!=='undefined' && page_globals.stream_readers)
				? page_globals.stream_readers
				: null
			if (Array.isArray(registry)) {
				const at = registry.indexOf(current)
				if (at !== -1) registry.splice(at, 1)
			}
		}
	}


	/**
	* APPLY_FRAME
	* Patch the rendered DOM from one queue frame. Touches only live nodes.
	*/
	const apply_frame = function(frame, frame_epoch) {

		// a frame from a superseded stream
		if (frame_epoch !== epoch) return

		// the node was replaced or removed while this reader was in flight —
		// the per-frame watchdog that bounds any orphan to one frame
		if (!content_data.isConnected) {
			destroy()
			return
		}

		// read_stream injects a synthetic first frame ({data:{msg:'Preparing…'}})
		// before any server bytes arrive; the discriminator rejects it.
		if (!frame || frame.kind !== 'diffusion_queue') return

		if (Array.isArray(frame.errors) && frame.errors.length>0) {
			// surfaced in the widget's existing response area, numbers untouched
			const body_response = content_data.querySelector('.body_response')
			if (body_response) body_response.textContent = JSON.stringify(frame.errors, null, 2)
			set_chip('state_warning', 'Live updates unavailable')
			return
		}

		strikes = 0
		set_chip('pill_ok', 'Live')

		// routine 15-minute rotation, not a failure
		if (frame.reconnect===true) {
			stop_stream()
			start()
			return
		}

		// the job SET changed: a job started or reached a terminal state. One
		// history refetch answers it — never per tick.
		if (frame.refresh===true) {
			on_reload()
			return
		}

		patch_rollup(frame)
		patch_scheduler(frame.scheduler)
		patch_jobs(frame.jobs)
	}


	/**
	* PATCH_ROLLUP
	* Repaint the headline band through the RENDER module's own painter, so the
	* live band and the rendered band cannot drift apart.
	*
	* `failed` is passed as null on purpose: the stream carries only ACTIVE jobs,
	* so it has no opinion about the 24h failed count and must not overwrite the
	* one get_value put there. That count refreshes on the membership-change
	* reload instead — which is exactly when it can have changed.
	*/
	const patch_rollup = function(frame) {
		const block = content_data.querySelector('.diffusion_server_control_rollup')
		if (!block) return
		paint_rollup(block, frame.scheduler || {}, frame.jobs, null)
	}


	/**
	* PATCH_SCHEDULER
	* The scheduler readout renders the same running/queued numbers the stream
	* now carries live. Left alone they would disagree with the live values
	* within seconds — two different numbers for one quantity on one screen.
	*
	* The DISPATCH STATE is patched for a stronger reason than agreement: a drain
	* ends on its own, minutes after the request that started it returned. Nothing
	* reloads the widget at that moment, so without this the pill would read
	* "Draining" and the buttons would stay disabled until the operator reloaded
	* the page by hand. The stream is the only thing that knows the drain is over.
	*/
	const patch_scheduler = function(scheduler) {
		if (!scheduler) return
		const running = content_data.querySelector('.dsc_sched_running .dd_badge')
		const queued  = content_data.querySelector('.dsc_sched_queued .dd_badge')
		if (running) running.textContent = scheduler.running + ' / ' + scheduler.max_runners
		if (queued) {
			queued.textContent = String(scheduler.queued)
			queued.classList.toggle('state_warning', scheduler.queued>0)
		}

		const paused	= scheduler.paused===true
		const draining	= scheduler.draining===true

		// (!) Same expression as the render module's Dispatch row. Two places, one
		// meaning — change both or neither.
		const dispatch = content_data.querySelector('.dsc_sched_dispatch .dd_badge')
		if (dispatch) {
			dispatch.textContent = draining ? 'Draining' : (paused ? 'Paused' : 'Running')
			dispatch.classList.toggle('pill_warning', paused || draining)
			dispatch.classList.toggle('pill_ok', !paused && !draining)
		}

		const set_disabled = function(action, disabled) {
			const button = content_data.querySelector('button[data-scheduler_action="' + action + '"]')
			if (button) button.disabled = disabled
		}
		set_disabled('resume', !paused || draining)
		set_disabled('pause', paused || draining)
		set_disabled('drain_resume', draining)
	}


	/**
	* PATCH_JOBS
	* Per row: patch the live nodes when the row's STRUCTURE is unchanged;
	* ask for a rebuild when it is not.
	*
	* The signature deliberately excludes the counter — that is the whole point.
	* A moving counter must never cost a rebuild, while a state change (which
	* adds or removes the bar, the cancelling note and the action buttons) must.
	*/
	const patch_jobs = function(jobs) {
		if (!Array.isArray(jobs)) return
		const table = content_data.querySelector('.diffusion_server_control_job_table')
		if (!table) return

		for (const job of jobs) {
			const tr = table.querySelector('[data-job_id="' + CSS.escape(String(job.job_id)) + '"]')
			if (!tr) {
				// a job we have no row for: the set changed under us
				on_reload()
				return
			}
			const view = progress_view(job)
			const signature = row_signature(job, view)
			if (tr.dataset.signature !== signature) {
				tr.dataset.stale = 'true'
				on_reload()
				return
			}

			const counter = tr.querySelector('.job_counter')
			if (counter) {
				counter.textContent = Number(job.total) > 0
					? format_int(job.counter) + ' / ' + format_int(job.total)
					: format_int(job.counter)
			}
			const msg = tr.querySelector('.job_msg')
			if (msg) msg.textContent = job.msg || ''

			const bar = tr.querySelector('.dd_bar')
			const fill = tr.querySelector('.dd_bar_fill')
			if (bar && fill && view.indeterminate!==true) {
				fill.style.width = view.percent + '%'
				bar.setAttribute('aria-valuenow', String(view.percent))
			}
			const note = tr.querySelector('.dd_bar_note')
			if (note) note.textContent = view.caption
		}
	}


	/**
	* READ_LOOP
	* Consume the stream. Every frame body is wrapped so a render error cannot
	* stall the loop: data_manager.read_stream's own catch only console.errors,
	* which would stop the recursion WITHOUT cancelling the reader — leaving the
	* socket and the server's poll+heartbeat intervals alive forever.
	*/
	const read_loop = async function(stream, my_epoch) {

		const decoder = new TextDecoder()
		let buffer = ''
		reader = stream.getReader()

		// join the global registry so page navigation aborts us like every
		// other stream in the app
		if (typeof page_globals!=='undefined' && Array.isArray(page_globals.stream_readers)) {
			page_globals.stream_readers.push(reader)
		}

		for (;;) {
			let chunk
			try {
				chunk = await reader.read()
			} catch (error) {
				break
			}
			if (my_epoch !== epoch || closed) break
			if (chunk.done) break

			buffer += decoder.decode(chunk.value, { stream:true })
			let boundary = buffer.indexOf('\n\n')
			while (boundary !== -1) {
				const raw = buffer.slice(0, boundary)
				buffer = buffer.slice(boundary + 2)
				boundary = buffer.indexOf('\n\n')
				if (!raw.startsWith('data:\n')) continue // ':' comment heartbeat
				try {
					apply_frame(JSON.parse(raw.slice('data:\n'.length).trimEnd()), my_epoch)
				} catch (error) {
					console.error('[diffusion live] frame apply failed', error)
				}
			}
		}

		// the server closed (or the socket dropped) without us asking
		if (my_epoch === epoch && !closed) {
			schedule_reconnect()
		}
	}


	/**
	* SCHEDULE_RECONNECT
	*/
	const schedule_reconnect = function() {
		stop_stream()
		if (strikes >= MAX_STRIKES) {
			set_chip('state_warning', 'Live updates unavailable — use Refresh')
			return
		}
		const wait = BACKOFF_MS[Math.min(strikes, BACKOFF_MS.length-1)]
		strikes++
		set_chip('pill_warning', 'Reconnecting')
		reconnect_timer = setTimeout(() => {
			reconnect_timer = null
			if (should_stream()) start()
		}, wait)
	}


	/**
	* START
	* Open a stream, unless one is already open or we should not be streaming.
	*/
	const start = async function() {

		if (!closed || !should_stream()) return

		closed = false
		const my_epoch = ++epoch
		set_chip('pill_warning', 'Connecting')

		let stream = null
		try {
			// request_stream rejects on network failure and on a non-2xx (WC-067
			// Phase 2); the race bounds a connect that never resolves either way.
			stream = await Promise.race([
				self.follow_queue(),
				new Promise((_resolve, reject) =>
					setTimeout(() => reject(new Error('follow_queue open timed out')), OPEN_TIMEOUT_MS))
			])
		} catch (error) {
			console.error('[diffusion live] could not open the queue stream', error)
			schedule_reconnect()
			return
		}

		// the widget was collapsed, refreshed or destroyed while we awaited
		if (my_epoch !== epoch || closed || !should_stream()) {
			try { await stream.cancel('superseded') } catch (error) { /* already gone */ }
			return
		}
		if (!stream) {
			schedule_reconnect()
			return
		}

		void read_loop(stream, my_epoch)
	}


	/**
	* EVALUATE
	* The single entry point every lifecycle signal funnels into: open when we
	* should be streaming, stop when we should not. Idempotent by construction,
	* so a duplicated signal can never open a second stream.
	*/
	const evaluate = function() {
		if (should_stream()) {
			void start()
		} else {
			stop_stream()
			set_chip('dd_badge', 'Snapshot only')
		}
	}


	const on_visibility = () => evaluate()
	const on_view_change = () => {
		// the class flip that hides the list view is not observable on this node
		// until the next frame, so re-evaluate after it lands
		requestAnimationFrame(() => evaluate())
	}
	document.addEventListener('visibilitychange', on_visibility)
	document.addEventListener('dd_maintenance_view', on_view_change)

	/**
	* The generic visibility backstop.
	*
	* The explicit host signals (on_collapse / on_expose / dd_maintenance_view)
	* each cover one KNOWN control. They cannot cover the ones nobody wired: the
	* category filter chips, for instance, toggle `filtered_out` (display:none) on
	* the widget container and announce nothing — so a widget filtered back INTO
	* view would sit at "Snapshot only" forever, which is exactly what happened
	* the first time this was tested.
	*
	* An IntersectionObserver notices any of them, because a display:none element
	* simply stops intersecting. It is only a TRIGGER, never the decision:
	* should_stream() still rules, so merely scrolling the widget out of the
	* viewport (where offsetParent stays non-null) does not close the stream.
	*/
	let observer = null
	if (typeof IntersectionObserver==='function') {
		observer = new IntersectionObserver(() => evaluate())
		observer.observe(content_data)
	}


	/**
	* DESTROY
	* The framework's teardown contract (do_delete_dependencies calls this for
	* every entry in ar_instances). Also called directly by the widget's own
	* destroy/refresh overrides and by the orphan watchdog.
	*/
	const destroy = function() {
		epoch++ // invalidate any in-flight frame
		stop_stream()
		document.removeEventListener('visibilitychange', on_visibility)
		document.removeEventListener('dd_maintenance_view', on_view_change)
		if (observer) {
			observer.disconnect()
			observer = null
		}
		// Drop OUR entry from the widget's dependency list. do_delete_dependencies
		// clears the array wholesale, but a destroy that comes from anywhere else
		// (the render-time destroy-before-create, the orphan watchdog) would
		// otherwise leave a dead controller in it, and the array would grow by one
		// on every re-render.
		if (Array.isArray(self.ar_instances)) {
			const at = self.ar_instances.indexOf(controller)
			if (at !== -1) self.ar_instances.splice(at, 1)
		}
		return true
	}


	const controller = {
		evaluate		: evaluate,
		apply_frame		: apply_frame,
		destroy			: destroy,
		// do_delete_dependencies skips instances flagged destroyable:false
		destroyable		: true,
		model			: 'live_diffusion_server_control'
	}

	return controller
}//end create_live_controller



// @license-end
