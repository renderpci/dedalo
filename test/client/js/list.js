// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global page_globals, mocha */
/*eslint no-undef: "error"*/
import {ui} from '../../../core/common/js/ui.js'
import {elements} from './elements.js'

// list. Definition of test to do. Every test has a file as 'test_key_instances' + '.js'
export const list_of_test = [
	'test_key_instances',
	'test_get_instance',
	'test_delete_instance',
	'test_components_lifecycle',
	'test_others_lifecycle',
	'test_instances_lifecycle',
	'test_event_manager',
	'test_components_data_changes',
	'test_components_activate',
	'test_components_render',
	'test_component_text_area',
	'test_no_logged_error',
	'test_unknown_error',
	'test_page',
	'test_diffusion',
	'test_ts_object',
	'test_ts_object_extended',
	'test_component_common_changed_data',
	'test_component_geolocation',
	'test_component_select',
	'test_component_select_lang',
	'test_component_radio_button'
]

// group_stats: track pass/fail/pending per group
export const group_stats = {}
export const global_stats = { total: 0, pass: 0, fail: 0, pending: 0 }

// test_cards: registry of all rendered cards for search/run-all
export const test_cards = []

// active card reference
let active_card = null

// content: (!) Note that content value is automatically set by mocha selecting page HTMLEllement #content
if (typeof content !== 'undefined') {

	// container
	const container	= ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'list_of_test_container',
		parent			: content
	})

	// helper: create a collapsible group section
	function create_group_section(title, group_key, items, item_type) {
		group_stats[group_key] = { total: items.length, pass: 0, fail: 0, pending: items.length }
		global_stats.total += items.length
		global_stats.pending += items.length

		const section = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'test_group',
			parent			: container
		})
		section.dataset.group = group_key

		const header = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'test_group_header',
			parent			: section
		})

		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'test_group_chevron',
			inner_html		: '▾',
			parent			: header
		})

		ui.create_dom_element({
			element_type	: 'h2',
			class_name		: 'test_group_title',
			inner_html		: title,
			parent			: header
		})

		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'test_group_count',
			inner_html		: items.length,
			parent			: header
		})

		const stats_bar = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'test_group_stats',
			parent			: header
		})
		stats_bar.dataset.groupKey = group_key
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'group_stat group_stat_pass',
			inner_html		: '0',
			parent			: stats_bar
		})
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'group_stat group_stat_fail',
			inner_html		: '0',
			parent			: stats_bar
		})
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'group_stat group_stat_pending',
			inner_html		: items.length,
			parent			: stats_bar
		})

		const body = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'test_group_body',
			parent			: section
		})

		header.addEventListener('click', () => {
			const collapsed = body.classList.toggle('collapsed')
			header.classList.toggle('collapsed', collapsed)
			const chevron = header.querySelector('.test_group_chevron')
			if (chevron) chevron.textContent = collapsed ? '▸' : '▾'
		})

		for (let i = 0; i < items.length; i++) {
			const item = items[i]
			const test_name = typeof item === 'string' ? item : item.model
			const display_name = typeof item === 'string'
				? item.replace(/^test_/, '').replace(/_/g, ' ')
				: item.model
			const tipo_label = typeof item === 'string' ? '' : `[${item.tipo}]`
			const area = typeof item === 'string' ? item : 'test_component_full'
			const model = typeof item === 'string' ? null : item.model

			const card = ui.create_dom_element({
				element_type	: 'div',
				class_name		: `test_card test_card_${item_type}`,
				parent			: body
			})
			card.dataset.testName = test_name.toLowerCase()
			card.dataset.group = group_key
			card.dataset.area = area
			if (model) card.dataset.model = model

			ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'test_card_index',
				inner_html		: String(i + 1).padStart(2, '0'),
				parent			: card
			})

			const stored = restore_status(test_name)

			ui.create_dom_element({
				element_type	: 'span',
				class_name		: `test_card_status ${stored}`,
				parent			: card
			})

			ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'test_card_name',
				inner_html		: display_name,
				parent			: card
			})

			if (tipo_label) {
				ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'test_card_type',
					inner_html		: tipo_label,
					parent			: card
				})
			}

			// click handler: load test in main panel
			card.addEventListener('click', () => {
				set_active_card(card)
				if (typeof window.load_test === 'function') {
					window.load_test(area, model, test_name)
				}
			})

			test_cards.push(card)
		}

		return section
	}

	create_group_section('generic tests', 'generic', list_of_test, 'generic')
	create_group_section('component tests', 'component', elements, 'component')

	update_global_stats()

	// search filter
	const search_input = document.getElementById('test_search')
	if (search_input) {
		search_input.addEventListener('input', () => {
			const query = search_input.value.toLowerCase().trim()
			for (const card of test_cards) {
				const match = !query || card.dataset.testName.includes(query)
				card.style.display = match ? '' : 'none'
			}
			for (const group of container.querySelectorAll('.test_group')) {
				const visible_cards = group.querySelectorAll('.test_card:not([style*="display: none"])')
				group.style.display = visible_cards.length ? '' : 'none'
			}
		})
	}

	// keyboard shortcut: / to focus search
	document.addEventListener('keydown', (e) => {
		if (e.key === '/' && document.activeElement !== search_input) {
			e.preventDefault()
			search_input.focus()
		}
		if (e.key === 'Escape' && document.activeElement === search_input) {
			search_input.blur()
			search_input.value = ''
			search_input.dispatchEvent(new Event('input'))
		}
	})

	// run all button
	const run_all_btn = document.getElementById('test_run_all')
	if (run_all_btn) {
		run_all_btn.addEventListener('click', () => {
			if (run_all_btn.disabled) return
			const visible_cards = test_cards.filter(c => c.style.display !== 'none')
			if (visible_cards.length === 0) return

			run_all_btn.disabled = true
			run_all_btn.querySelector('.run_all_text').textContent = 'running…'

			let index = 0

			function run_next() {
				if (index >= visible_cards.length) {
					run_all_btn.disabled = false
					run_all_btn.querySelector('.run_all_text').textContent = 'run all'
					return
				}
				const card = visible_cards[index]
				index++
				set_active_card(card)
				const area = card.dataset.area
				const model = card.dataset.model || null
				const test_name = card.dataset.testName
				if (typeof window.load_test === 'function') {
					window.load_test(area, model, test_name, () => {
						// wait a bit then run next
						setTimeout(run_next, 300)
					})
				}
			}

			run_next()
		})
	}
}

function set_active_card(card) {
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
		if (stored) return stored
	} catch (e) {}
	return 'pending'
}

export function mark_test_status(test_name, status) {
	const key = test_name.toLowerCase()
	for (const card of test_cards) {
		if (card.dataset.testName === key) {
			const dot = card.querySelector('.test_card_status')
			if (dot) {
				dot.classList.remove('pending', 'running', 'pass', 'fail')
				dot.classList.add(status)
			}

			try {
				sessionStorage.setItem(`test_status:${key}`, status)
			} catch (e) {}

			const group = card.dataset.group
			if (group && group_stats[group]) {
				if (status === 'pass') {
					group_stats[group].pass++
					group_stats[group].pending--
					global_stats.pass++
					global_stats.pending--
				} else if (status === 'fail') {
					group_stats[group].fail++
					group_stats[group].pending--
					global_stats.fail++
					global_stats.pending--
				}
				update_group_stats(group)
			}
			break
		}
	}
}

// @license-end
