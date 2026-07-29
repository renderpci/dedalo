// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*eslint no-undef: "error"*/



/**
* PROGRESS_MODEL
* The pure model behind the diffusion job-queue progress bar.
*
* It lives in its own module because TWO callers need exactly the same answer:
* render_diffusion_server_control builds the bar from it at render time, and
* live_diffusion_server_control patches that same bar from it on every stream
* frame. A second copy would not fail loudly — it would drift, and the visible
* symptom would be a bar whose fill disagrees with its own caption. One
* definition, imported twice, makes that impossible rather than merely
* discouraged.
*
* No DOM, no imports, no state — so both callers and the tripwire can use it
* without any setup.
*/



/**
* The shape both progress views return. Declared as a typedef rather than left
* as a bare {Object} so consumers — including the unit gate — get real checking
* on the field names instead of silently reading typos as undefined.
*
* @typedef  {Object}  ProgressView
* @property {boolean} show          - draw a bar at all
* @property {boolean} indeterminate - sweep (extent unknown) rather than fill
* @property {number}  percent       - 0..100, already clamped
* @property {string}  severity      - '' | 'state_warning' | 'state_danger'
* @property {string}  caption       - the human line under the bar
*/

/**
* @typedef  {Object}  AggregateView
* @property {boolean} show     - draw the aggregate bar
* @property {number}  percent  - 0..100, already clamped
* @property {string}  severity - '' | 'state_warning'
* @property {string}  caption  - counts + percentage, or throughput
* @property {string}  note     - scope + any disclosed exclusions
*/

/**
* FORMAT_INT
* Thousands-separated integer for the machine counters. At this install's scale
* a raw counter reads "1284300"; the separators are the difference between
* scanning the column and parsing it.
*
* @param {*} value
* @returns {string}
*/
export const format_int = function(value) {

	return Number(value ?? 0).toLocaleString()
}//end format_int



/**
* PROGRESS_VIEW
* How one job maps to a bar.
*
* (!) THE TOTAL IS AN ESTIMATE THE SERVER NEVER CORRECTS. It is whatever the
* client supplied when the job was queued (the queue writes totals.total once,
* at enqueue; the runner's progress patches only ever carry `counter`). So:
*   - every percentage is labelled '(estimated)', never presented as a fact;
*   - an overrun is REPORTED as 'Estimate exceeded' rather than clamped into a
*     plausible-looking number, because a silently-capped 100% bar that keeps
*     running is the exact lie this label exists to prevent;
*   - there is deliberately NO time-remaining figure. The engine reports
*     cumulative elapsed, not per-record, so any ETA derived from it would be
*     wrong — tool_diffusion deleted its own estimate for this reason.
*
* Terminal jobs get no bar at all: the State column already carries the verdict,
* and a coloured bar on every finished row spends the whole colour budget on
* history instead of on what is happening now.
*
* @param {Object} job - a job row (widget value) or a queue frame job (WC-067);
*   both carry state/counter/total, which is all this reads
* @returns {ProgressView}
*/
export const progress_view = function(job) {

	const state		= String(job.state || 'unknown')
	const counter	= Number(job.counter) || 0
	const total		= Number(job.total) || 0

	// terminal: the badge says it, the counter cell shows the tally
	if (state!=='running' && state!=='queued') {
		return { show:false, indeterminate:false, percent:0, severity:'', caption:'' }
	}

	// queued: an empty track, so the row keeps its height across queued → running
	if (state==='queued') {
		return { show:true, indeterminate:false, percent:0, severity:'', caption:'Queued' }
	}

	// running without a usable estimate: sweep, and say the estimate is missing
	// rather than draw a 0% bar that implies no work has happened
	if (total<=0) {
		return { show:true, indeterminate:true, percent:0, severity:'', caption:'No estimate' }
	}

	const exceeded	= counter > total
	const percent	= Math.min(100, Math.round((counter / total) * 100))

	return {
		show			: true,
		indeterminate	: false,
		percent			: exceeded ? 100 : percent,
		severity		: exceeded ? 'state_warning' : '',
		caption			: exceeded ? 'Estimate exceeded' : percent + '% (estimated)'
	}
}//end progress_view



/**
* AGGREGATE_VIEW
* Progress across all RUNNING jobs, for the rollup band.
*
* (!) This number is the most easily abused one in the widget, so its
* construction is deliberate on three counts:
*
* 1. RECORD-WEIGHTED, not a mean of percentages. SUM(counter)/SUM(total) — a
*    200-record job at 100% and a 4,000,000-record job at 1% is ~1%, not ~50%.
*    Averaging the percentages would let a trivial job swing the headline by
*    tens of points, which is precisely the number an admin would act on.
*
* 2. JOBS WITHOUT AN ESTIMATE ARE EXCLUDED FROM BOTH SIDES, and their count is
*    reported. Including their counter in the numerator while contributing
*    nothing to the denominator would inflate the percentage without limit —
*    the aggregate could read 100% with most of the work outstanding. Excluding
*    them silently would be its own lie, so the caption says how many were left
*    out.
*
* 3. It carries '(estimated)' for the same reason every per-row percentage
*    does: every total in the sum is a client estimate the server never
*    re-counts. An aggregate of estimates is still an estimate.
*
* @param {Array} jobs - job rows (widget value) or queue frame jobs (WC-067)
* @returns {AggregateView}
*/
export const aggregate_view = function(jobs) {

	const list		= Array.isArray(jobs) ? jobs : []
	const running	= list.filter((job) => String(job.state || '')==='running')
	const estimated	= running.filter((job) => (Number(job.total) || 0) > 0)
	const without	= running.length - estimated.length

	if (running.length===0) {
		return { show:false, percent:0, severity:'', caption:'', note:'' }
	}

	// nothing to divide by: report throughput, never a percentage
	if (estimated.length===0) {
		const counter = running.reduce((sum, job) => sum + (Number(job.counter) || 0), 0)
		return {
			show		: false,
			percent		: 0,
			severity	: '',
			caption		: format_int(counter) + ' records processed',
			note		: running.length + (running.length===1 ? ' running job' : ' running jobs') + ' · no estimate'
		}
	}

	const counter	= estimated.reduce((sum, job) => sum + (Number(job.counter) || 0), 0)
	const total		= estimated.reduce((sum, job) => sum + (Number(job.total) || 0), 0)
	const exceeded	= counter > total
	const percent	= Math.min(100, Math.round((counter / total) * 100))

	const scope = estimated.length + (estimated.length===1 ? ' running job' : ' running jobs')
	// "without an estimate" reads the same singular or plural, so no branch here
	const excluded = without>0 ? ' · ' + without + ' without an estimate' : ''

	return {
		show		: true,
		percent		: exceeded ? 100 : percent,
		severity	: exceeded ? 'state_warning' : '',
		caption		: format_int(counter) + ' / ' + format_int(total) + ' · ' +
			(exceeded ? 'estimate exceeded' : percent + '% (estimated)'),
		note		: 'across ' + scope + excluded
	}
}//end aggregate_view



/**
* ROW_SIGNATURE
* The STRUCTURAL identity of a rendered job row.
*
* (!) Deliberately excludes the counter, and that omission is the whole design:
* a moving counter must be patchable in place, while a state change — which
* adds or removes the bar, the "cancelling" sub-line and the action buttons —
* must force that row to be rebuilt. Put `counter` in here and every frame
* rebuilds the table; leave `state` out and a finished job keeps rendering as
* if it were still running.
*
* Written into the row's dataset at render time and recomputed per frame, so
* the comparison is between the DOM that exists and the job that just arrived.
*
* @param {Object} job
* @param {Object} view - progress_view(job)
* @returns {string}
*/
export const row_signature = function(job, view) {

	return JSON.stringify({
		state			: String(job.state || 'unknown'),
		cancel_requested: job.cancel_requested===true,
		show			: view.show,
		indeterminate	: view.indeterminate,
		severity		: view.severity
	})
}//end row_signature



// @license-end
