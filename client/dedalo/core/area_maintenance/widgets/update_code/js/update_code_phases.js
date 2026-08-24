// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0



/**
* UPDATE_CODE_PHASES
* Pure state machine for the update_code progress track. NO imports, NO DOM:
* render_update_code.js feeds it stream frames and paints the returned state;
* test/unit/client_update_code_render.test.ts drives it directly.
*
* Frame contract (the server's background-job stream, `data` of each SSE chunk):
*   { phase, phases:[{id,status}], version, expected_version, message?,
*     rollback?:{performed,to} }
* phase  ∈ download|verify|extract|deps|preflight|swap|restart|health
* status ∈ pending|running|done|failed|skipped
*
* A synthetic `{interrupted:true}` frame means THE STREAM DIED — and ONLY that.
* The server-side job is not tied to the SSE connection, so where the job was
* decides what the death means: the swap/restart kills the serving process BY
* DESIGN, so an interruption at or after `swap` switches to health-polling;
* before `swap` the death is INDETERMINATE — the connection is gone but the
* job may still be running (a dropped stream during a long deps/preflight) —
* so the mode is `interrupted`, never `failed`. Only a frame that actually
* reports a failed phase (or a rollback) may say failed.
*/



/** The fixed phase order of the server-side update job. */
export const UPDATE_PHASES = ['download','verify','extract','deps','preflight','swap','restart','health']

const phase_index = (id) => UPDATE_PHASES.indexOf(id)



/**
* INIT_PHASE_STATE
* @param {string|null} expected_version - the version the job installs
* @returns {Object} state
*/
export const init_phase_state = function(expected_version=null) {
	return {
		phases				: UPDATE_PHASES.map(id => ({ id : id, status : 'pending' })),
		last_phase			: null,			// last phase id the stream reported
		mode				: 'streaming',	// streaming | polling | interrupted | done | failed | rolled_back
		message				: null,			// last human message (the last error sentence on failure)
		version				: null,			// version the server last reported
		expected_version	: expected_version,
		rollback			: null			// {performed, to} when the server rolled back
	}
}//end init_phase_state



/**
* APPLY_PHASE_FRAME
* Pure reducer: returns a NEW state, never mutates the given one.
* @param {Object} state - current state (init_phase_state shape)
* @param {Object} frame - stream frame, or the synthetic {interrupted:true}
* @returns {Object} next state
*/
export const apply_phase_frame = function(state, frame) {

	const next = {
		...state,
		phases : state.phases.map(p => ({ ...p }))
	}

	if (!frame || typeof frame!=='object') {
		return next
	}

	// interrupted: the stream died without a final frame.
	// At/after swap the restart is the PLANNED death → poll /health.
	// Before swap the DEATH IS INDETERMINATE: the job is not tied to the SSE
	// connection and may still be running server-side → 'interrupted' (the
	// caller keeps the resume key and tells the operator), NEVER 'failed'.
	if (frame.interrupted===true) {
		const reached = state.last_phase===null ? -1 : phase_index(state.last_phase)
		next.mode = (reached >= phase_index('swap'))
			? 'polling'
			: 'interrupted'
		return next
	}

	// phase statuses
	if (Array.isArray(frame.phases)) {
		for (const reported of frame.phases) {
			const row = next.phases.find(p => p.id===reported.id)
			if (row && typeof reported.status==='string') {
				row.status = reported.status
			}
		}
	}
	if (typeof frame.phase==='string' && phase_index(frame.phase)!==-1) {
		next.last_phase = frame.phase
	}
	if (typeof frame.message==='string' && frame.message.length>0) {
		next.message = frame.message
	}
	if (typeof frame.version==='string') {
		next.version = frame.version
	}
	if (typeof frame.expected_version==='string') {
		next.expected_version = frame.expected_version
	}
	if (frame.rollback && typeof frame.rollback==='object') {
		next.rollback = frame.rollback
	}

	// derived mode
	if (next.rollback && next.rollback.performed===true) {
		next.mode = 'rolled_back'
	} else if (next.phases.some(p => p.status==='failed')) {
		next.mode = 'failed'
	} else if (next.phases.every(p => p.status==='done' || p.status==='skipped')) {
		next.mode = 'done'
	}

	return next
}//end apply_phase_frame



/**
 * RESOLVE_FINAL_FRAME
 * Interprets the STREAM'S TERMINAL frame (`is_running:false`) once it is seen.
 * The job's final `data` is its RETURN ENVELOPE, not a phase snapshot — so a
 * fast install whose `swap → restart → done` tail lands inside one poll beat
 * delivers a track frozen mid-flight PLUS a terminal frame whose envelope
 * already knows the truth. That envelope outranks the frozen track:
 *
 *   {data:{ok:true,  data:{version}}}            → updated  (install landed)
 *   {data:{ok:false}| errors:[…]}                → failed   (the sentence rides)
 *
 * Returns {outcome:'updated', version} | {outcome:'failed', message} | null
 * when the frame decides nothing (caller keeps its existing heuristics).
 * @param {Object} state - reducer state (unused today; symmetry + future use)
 * @param {Object|null} frame - the terminal JobStatusFrame, null when none seen
 */
export const resolve_final_frame = function(state, frame) {

	if (!frame || frame.is_running!==false) {
		return null
	}
	const result = frame.data
	if (result && typeof result==='object') {
		if (result.ok===true && result.data && typeof result.data.version==='string') {
			return { outcome : 'updated', version : result.data.version }
		}
		const message = Array.isArray(frame.errors) && frame.errors.length > 0
			? frame.errors.join(' ')
			: (typeof result.msg==='string' && result.msg.length>0 ? result.msg : null)
		if (result.ok===false || message!==null) {
			return { outcome : 'failed', message : message }
		}
	}
	if (Array.isArray(frame.errors) && frame.errors.length>0) {
		return { outcome : 'failed', message : frame.errors.join(' ') }
	}
	return null
}//end resolve_final_frame



/**
* RESOLVE_HEALTH_OUTCOME
* Decides the ending once /health answers (or the deadline passes).
* @param {Object} state - reducer state (mode 'polling')
* @param {string|null} health_version - `version` from /health, null when the
*   server never came back before the deadline
* @returns {{outcome:string, message:(string|null)}}
*   outcome ∈ updated | rolled_back | server_gone
*/
export const resolve_health_outcome = function(state, health_version) {

	if (health_version===null || health_version===undefined || health_version==='') {
		return { outcome : 'server_gone', message : state.message }
	}
	if (state.expected_version && health_version===state.expected_version) {
		return { outcome : 'updated', message : null }
	}
	// the server is back but not on the new version → the job rolled back
	return { outcome : 'rolled_back', message : state.message }
}//end resolve_health_outcome



// @license-end
