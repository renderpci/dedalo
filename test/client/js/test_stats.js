// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0

/**
 * TEST_STATS
 * Tracks pass/fail/pending per sidebar card (one Mocha suite file per card).
 * Mocha individual `it()` results are aggregated in frame_runner before reporting.
 */

export const group_stats = {}
export const global_stats = { total: 0, pass: 0, fail: 0, pending: 0 }

export const test_cards = []

let active_card = null

function get_card_final_status(card) {
	const dot = card?.querySelector('.test_card_status')
	if (!dot) return 'pending'
	if (dot.classList.contains('pass')) return 'pass'
	if (dot.classList.contains('fail')) return 'fail'
	return 'pending'
}

function adjust_stats(group, from_status, to_status) {
	if (!group || !group_stats[group]) return

	const gs = group_stats[group]

	if (from_status === 'pass') {
		gs.pass--
		global_stats.pass--
	} else if (from_status === 'fail') {
		gs.fail--
		global_stats.fail--
	} else if (from_status === 'pending') {
		gs.pending--
		global_stats.pending--
	}

	if (to_status === 'pass') {
		gs.pass++
		global_stats.pass++
	} else if (to_status === 'fail') {
		gs.fail++
		global_stats.fail++
	} else if (to_status === 'pending') {
		gs.pending++
		global_stats.pending++
	}
}

export function init_group_stats(group_key, count) {
	group_stats[group_key] = { total: count, pass: 0, fail: 0, pending: count }
	global_stats.total += count
	global_stats.pending += count
}

export function set_active_card(card) {
	if (active_card) {
		active_card.classList.remove('test_card_active')
	}
	active_card = card
	if (card) {
		card.classList.add('test_card_active')
	}
}

export function get_active_card() {
	return active_card
}

export function update_global_stats() {
	const el = document.getElementById('test_global_stats')
	if (!el) return
	const stats = el.querySelectorAll('.stat')
	if (stats[0]) stats[0].textContent = global_stats.total
	if (stats[1]) stats[1].textContent = global_stats.pass
	if (stats[2]) stats[2].textContent = global_stats.fail
	if (stats[3]) stats[3].textContent = global_stats.pending
}

export function update_group_stats(group_key) {
	const stats = group_stats[group_key]
	if (!stats) return

	const section = document.querySelector(`.test_group[data-group="${group_key}"]`)
	if (!section) return

	const bar = section.querySelector('.test_group_stats')
	if (!bar) return

	const els = bar.querySelectorAll('.group_stat')
	if (els[0]) els[0].textContent = stats.pass
	if (els[1]) els[1].textContent = stats.fail
	if (els[2]) els[2].textContent = stats.pending

	update_global_stats()
}

function restore_status(test_name) {
	try {
		const key = `test_status:${test_name.toLowerCase()}`
		const stored = sessionStorage.getItem(key)
		if (stored === 'pass' || stored === 'fail') return stored
	} catch (e) {}
	return 'pending'
}

export function apply_restored_stats() {
	for (const card of test_cards) {
		const status = get_card_final_status(card)
		if (status === 'pass' || status === 'fail') {
			const group = card.dataset.group
			adjust_stats(group, 'pending', status)
			card.dataset.counted = status
		}
	}
	update_global_stats()
	for (const group_key of Object.keys(group_stats)) {
		update_group_stats(group_key)
	}
}

/**
 * Update card visual state and aggregate counters.
 * `running` is visual only; counters update on final pass/fail.
 */
export function mark_test_status(test_name, status) {
	const key = test_name.toLowerCase()
	for (const card of test_cards) {
		if (card.dataset.testName !== key) continue

		const dot = card.querySelector('.test_card_status')
		const group = card.dataset.group

		if (dot) {
			dot.classList.remove('pending', 'running', 'pass', 'fail')
			dot.classList.add(status)
		}

		if (status === 'running') {
			break
		}

		try {
			sessionStorage.setItem(`test_status:${key}`, status)
		} catch (e) {}

		if (status === 'pass' || status === 'fail') {
			// Use the last *counted* status, not the dot — on a retry the dot is
			// cleared to 'running' first, which would otherwise make a fail→pass
			// retry look like pending→pass and leave the original fail++ un-reversed.
			const prev_counted = card.dataset.counted || 'pending'
			if (prev_counted !== status) {
				adjust_stats(group, prev_counted, status)
				card.dataset.counted = status
			}
			update_group_stats(group)
		}
		break
	}
}

export function expose_stats_globals() {
	window.global_stats = global_stats
	window.group_stats = group_stats
}

// @license-end
