// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*eslint no-undef: "error"*/



/**
* TIME_REMAINING_MODEL
* The estimated time until the RUNNING diffusion jobs finish, for the rollup band.
*
* (!) WHERE THE RATE COMES FROM — the whole design. The engine reports only
* cumulative elapsed (`total_ms`), never a per-record rate, and an estimate
* derived from that is wrong (tool_diffusion deleted its own for that reason).
* This model never reads it. It MEASURES throughput on the client: it samples
* each running job's `counter` against the wall clock on every paint (the live
* stream paints at 1 Hz) and divides records moved by time spent over a sliding
* window. So:
*   - the rate is observed, not assumed — and it includes stalls: the
*     denominator runs to NOW, so a job whose counter stops moving sees its
*     estimate grow instead of freezing at a stale figure;
*   - until a job has been watched for MIN_SPAN_MS and its counter has moved,
*     there is no figure, only "estimating time remaining";
*   - the remaining work is total - counter, and the total is the client
*     estimate the server never re-counts, so the result is '(estimated)' too;
*   - it covers the SELECTION phase only: the linked records published after it
*     have no estimate to divide by, so a job in that phase is not projected
*     (aggregate_view's note names it instead);
*   - running jobs run concurrently, so the band shows the LONGEST job, the time
*     until the last running job finishes. Queued jobs are not included: when
*     they start depends on the scheduler, not on anything measurable here.
*
* The tracker is the only state in this widget's models, and it is kept apart
* from progress_model.js so that module stays pure.
*/



/** Samples older than this stop counting toward the rate (one anchor is kept). */
export const WINDOW_MS = 5 * 60 * 1000

/** Minimum observation span before a rate is trusted. */
export const MIN_SPAN_MS = 5 * 1000



/**
* CREATE_RATE_TRACKER
* Per-job (time, counter) samples, keyed by job_id.
*
* A sample is recorded only when the counter CHANGES (plus the first sighting),
* so jobs that report progress in batches keep their anchor across the quiet
* gaps. A counter that goes BACKWARDS (a retry restarting the attempt) resets
* the job's history: its old rate describes a run that no longer exists.
*
* @returns {{observe:Function, rate:Function, size:Function}}
*/
export const create_rate_tracker = function() {

	const samples = new Map()

	return {

		/**
		* Record the running jobs' counters at `now`, and forget every job that
		* is no longer running.
		* @param {Array}  jobs
		* @param {number} now - epoch ms
		*/
		observe(jobs, now) {
			const running = new Set()
			for (const job of (Array.isArray(jobs) ? jobs : [])) {
				if (String(job.state || '')!=='running' || !job.job_id) continue
				const id		= String(job.job_id)
				const counter	= Number(job.counter) || 0
				running.add(id)

				const list = samples.get(id)
				const last = list ? list[list.length - 1] : null
				if (!list || counter < last.counter) {
					samples.set(id, [{ t:now, counter }])
					continue
				}
				if (counter!==last.counter) {
					list.push({ t:now, counter })
				}
				// keep exactly one anchor at or before the window start
				while (list.length > 2 && list[1].t <= now - WINDOW_MS) {
					list.shift()
				}
			}
			for (const id of samples.keys()) {
				if (!running.has(id)) samples.delete(id)
			}
		},

		/**
		* Observed records per millisecond, or null while there is no basis.
		* @param {string} job_id
		* @param {number} now - epoch ms
		* @returns {number|null}
		*/
		rate(job_id, now) {
			const list = samples.get(String(job_id))
			if (!list || list.length < 2) return null
			const first	= list[0]
			const last	= list[list.length - 1]
			const span	= now - first.t
			if (span < MIN_SPAN_MS) return null
			const moved = last.counter - first.counter
			return moved > 0 ? moved / span : null
		},

		/** Jobs currently tracked (for the gate). */
		size() {
			return samples.size
		}
	}
}//end create_rate_tracker



/**
* FORMAT_DURATION
* A deliberately coarse duration: an estimate printed to the second claims a
* precision it does not have.
*
* @param {number} ms
* @returns {string}
*/
export const format_duration = function(ms) {

	const minutes = Math.round(ms / 60000)
	if (minutes < 1) return 'under a minute'
	if (minutes < 60) return '~' + minutes + ' min'

	const hours = Math.floor(minutes / 60)
	if (hours < 48) {
		const rest = minutes % 60
		return '~' + hours + ' h' + (rest > 0 ? ' ' + rest + ' min' : '')
	}

	const days = Math.floor(hours / 24)
	const rest = hours % 24
	return '~' + days + ' d' + (rest > 0 ? ' ' + rest + ' h' : '')
}//end format_duration



/**
* TIME_REMAINING_VIEW
* The time-remaining caption for the running jobs.
*
* Only jobs with an estimate (total > 0) that has not been exceeded can be
* projected; the others are already disclosed by aggregate_view's note. If ANY
* projectable job has no measured rate yet, the band says "estimating" rather
* than show the maximum of the jobs that do — that would be a confident figure
* that ignores a job which may well be the longest.
*
* @param {Array}  jobs
* @param {Object} tracker - create_rate_tracker(), already observed at `now`
* @param {number} now     - epoch ms
* @returns {string} '' when there is nothing to project
*/
export const time_remaining_view = function(jobs, tracker, now) {

	const projectable = (Array.isArray(jobs) ? jobs : []).filter((job) => {
		const total = Number(job.total) || 0
		return String(job.state || '')==='running' && job.phase!=='linked'
			&& total > 0 && (Number(job.counter) || 0) < total
	})
	if (projectable.length===0) return ''

	let longest = 0
	for (const job of projectable) {
		const rate = tracker.rate(job.job_id, now)
		if (rate===null) return 'estimating time remaining…'
		const left_ms = ((Number(job.total) || 0) - (Number(job.counter) || 0)) / rate
		if (left_ms > longest) longest = left_ms
	}

	return format_duration(longest) + ' remaining (estimated)'
}//end time_remaining_view



// @license-end
