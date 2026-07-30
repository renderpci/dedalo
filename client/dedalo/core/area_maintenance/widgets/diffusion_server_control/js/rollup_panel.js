// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../../common/js/ui.js'
	import {aggregate_view, format_int} from './progress_model.js'



/**
* ROLLUP_PANEL
* The diffusion widget's headline band: build it, and repaint it.
*
* It lives in its own module for the same reason progress_model.js does — TWO
* callers need it and neither may own it. The render module builds the band from
* a get_value snapshot; the live layer repaints it from every stream frame. If
* the live layer imported the builder from the render module we would have a
* render <-> live import cycle (render already imports the live controller), and
* if each kept its own painter the two would drift. One module, imported by
* both, has neither problem.
*/



/**
* BUILD_ROLLUP_BLOCK
* The headline band: how many jobs are running / queued / recently failed, and
* how far the running ones have got — the answer to "what is publishing right
* now" without reading 200 table rows.
*
* Three numbers, three different provenances, and the difference matters:
*   - RUNNING and QUEUED come from the scheduler's own window aggregates, so
*     they are exact over the whole active set even when the table below is
*     truncated. The live stream keeps them current.
*   - FAILED is counted from the 24h history in `value.jobs`. The stream never
*     carries it (the stream reads only ACTIVE rows, by design), so it refreshes
*     on load and on a membership change, not per second. Its caption says
*     "(24 h)" so a number that is minutes stale can never be misread as a live
*     alarm.
*
* @param {Object}      value  - the full widget value snapshot
* @param {HTMLElement} parent - container to append the band to
* @returns {HTMLElement} the rollup block
*/
export const build_rollup_block = function(value, parent) {

	const scheduler	= value.scheduler || {}
	const jobs		= Array.isArray(value.jobs) ? value.jobs : []
	const failed	= jobs.filter((job) => String(job.state || '')==='failed').length

	const block = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'diffusion_server_control_rollup',
		parent			: parent
	})

	// header: eyebrow + the live-feed state chip
	const head = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'dsc_rollup_head',
		parent			: block
	})
	ui.create_dom_element({
		element_type	: 'span',
		class_name		: 'dd_eyebrow',
		inner_html		: 'Live activity',
		parent			: head
	})
	// "Snapshot only" is the honest starting state: nothing is live until a
	// stream is actually open, and this is what it returns to when one is not.
	const live_chip = ui.create_dom_element({
		element_type	: 'span',
		class_name		: 'dd_badge dsc_live_chip',
		parent			: head
	})
	live_chip.textContent = 'Snapshot only'

	// the three counts
	const stats = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'dd_stats',
		parent			: block
	})
	add_stat(stats, 'dsc_stat_running', scheduler.running ?? 0, 'Running', 'state_ok')
	add_stat(stats, 'dsc_stat_queued', scheduler.queued ?? 0, 'Queued', 'state_warning')
	add_stat(stats, 'dsc_stat_failed', failed, 'Failed (24 h)', 'state_danger')

	// aggregate progress across the running jobs
	const aggregate = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'dsc_rollup_progress',
		parent			: block
	})
	const bar = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'dd_bar dsc_rollup_bar',
		parent			: aggregate
	})
	bar.setAttribute('role', 'progressbar')
	bar.setAttribute('aria-valuemin', '0')
	bar.setAttribute('aria-valuemax', '100')
	ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'dd_bar_fill',
		parent			: bar
	})
	ui.create_dom_element({
		element_type	: 'span',
		class_name		: 'dd_bar_note dsc_rollup_caption',
		parent			: aggregate
	})

	// paint it from the snapshot we already have; the live layer repaints the
	// same nodes per frame through the identical model
	paint_rollup(block, value.scheduler || {}, jobs, failed)


	return block
}//end build_rollup_block



/**
* ADD_STAT
* One headline count. `.zero` keeps a count of nothing muted even when it
* carries a severity class — see the kit's ordering note.
*/
const add_stat = function(parent, class_name, count, label, severity) {

	const n = Number(count) || 0
	const stat = ui.create_dom_element({
		element_type	: 'div',
		class_name		: ('dd_stat ' + class_name + (n===0 ? ' zero' : '')).trim(),
		parent			: parent
	})
	const value_node = ui.create_dom_element({
		element_type	: 'span',
		class_name		: ('dd_stat_n ' + (severity || '')).trim(),
		parent			: stat
	})
	value_node.textContent = format_int(n)
	ui.create_dom_element({
		element_type	: 'span',
		class_name		: 'dd_k',
		inner_html		: label,
		parent			: stat
	})

	return stat
}//end add_stat



/**
* PAINT_ROLLUP
* Write the band's live values into an already-built band.
*
* Exported so the live layer paints through EXACTLY this function rather than
* its own copy: the band the stream shows and the band the snapshot renders are
* then the same code, and cannot disagree.
*
* @param {HTMLElement} block     - the rollup block
* @param {Object}      scheduler - {running, queued, ...}
* @param {Array}       jobs      - jobs to aggregate over (active set is enough)
* @param {number|null} failed    - 24h failed count, or null to leave it alone
*   (the stream has no failed count — it reads only active rows)
*/
export const paint_rollup = function(block, scheduler, jobs, failed) {

	if (!block) return

	set_stat(block.querySelector('.dsc_stat_running'), scheduler.running ?? 0)
	set_stat(block.querySelector('.dsc_stat_queued'), scheduler.queued ?? 0)
	if (typeof failed === 'number') {
		set_stat(block.querySelector('.dsc_stat_failed'), failed)
	}

	const view		= aggregate_view(jobs)
	const progress	= block.querySelector('.dsc_rollup_progress')
	const bar		= block.querySelector('.dsc_rollup_bar')
	const fill		= block.querySelector('.dsc_rollup_bar .dd_bar_fill')
	const caption	= block.querySelector('.dsc_rollup_caption')

	if (progress) progress.classList.toggle('hide', view.caption==='')
	if (bar) {
		// no usable denominator → no bar at all, rather than a 0% bar that would
		// read as "no progress" when the truth is "no estimate"
		bar.classList.toggle('hide', view.show!==true)
		bar.setAttribute('aria-valuenow', String(view.percent))
	}
	if (fill) {
		fill.style.width = view.percent + '%'
		fill.className = ('dd_bar_fill ' + (view.severity || '')).trim()
	}
	if (caption) {
		caption.textContent = view.caption + (view.note ? ' ' + view.note : '')
	}
}//end paint_rollup



/**
* SET_STAT
* Patch one count, keeping the `.zero` muting in step with it.
*/
const set_stat = function(stat, count) {

	if (!stat) return
	const n = Number(count) || 0
	const value_node = stat.querySelector('.dd_stat_n')
	if (value_node) value_node.textContent = format_int(n)
	stat.classList.toggle('zero', n===0)
}//end set_stat



// @license-end
