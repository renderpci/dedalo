// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global page_globals */
/*eslint no-undef: "error"*/

import {ui} from '../../../core/common/js/ui.js'
import {test_groups} from './test_registry.js'
import {
	test_cards,
	init_group_stats,
	set_active_card,
	update_global_stats,
	apply_restored_stats,
	mark_test_status,
	expose_stats_globals
} from './test_stats.js'

export {
	test_cards,
	mark_test_status,
	set_active_card,
	get_active_card,
	global_stats,
	group_stats
} from './test_stats.js'

// backward compatibility (area_maintenance widget, legacy imports)
export { generic_suites as list_of_test, lifecycle_suites as livecycle_detail } from './test_registry.js'

// content: (!) Note that content value is automatically set by mocha selecting page HTMLElement #content
if (typeof content !== 'undefined') {

	const container = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'list_of_test_container',
		parent			: content
	})

	function create_group_section(group) {
		const { id: group_key, title, type: item_type, suites } = group

		// Deferred suites are shown but not gated: only the gated (non-deferred)
		// suites count toward the group/global pending+total tally, so the `run all`
		// green gate is unaffected by suites that are known-not-green yet.
		const gated_count = suites.filter(s => !s.deferred).length
		init_group_stats(group_key, gated_count)

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
			inner_html		: suites.length,
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
			inner_html		: gated_count,
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

		for (let i = 0; i < suites.length; i++) {
			const suite = suites[i]
			const test_name = suite.id
			const display_name = suite.model || suite.id.replace(/^test_/, '').replace(/_/g, ' ')
			const tipo_label = suite.tipo ? `[${suite.tipo}]` : ''
			const area = suite.area
			const model = suite.model || null

			const card = ui.create_dom_element({
				element_type	: 'div',
				class_name		: `test_card test_card_${item_type}${suite.deferred ? ' test_card_deferred' : ''}`,
				parent			: body
			})
			card.dataset.testName = test_name.toLowerCase()
			card.dataset.group = group_key
			card.dataset.area = area
			if (model) card.dataset.model = model
			// deferred suites: visible + manually runnable, but excluded from `run all`
			// (index.js) and from the pass/fail/pending counters (dot status 'deferred').
			if (suite.deferred) card.dataset.deferred = '1'

			ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'test_card_index',
				inner_html		: String(i + 1).padStart(2, '0'),
				parent			: card
			})

			const stored = suite.deferred ? 'deferred' : restore_status(test_name)

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

	for (const group of test_groups) {
		create_group_section(group)
	}

	apply_restored_stats()
	expose_stats_globals()
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
			for (const group_el of container.querySelectorAll('.test_group')) {
				const visible_cards = group_el.querySelectorAll('.test_card:not([style*="display: none"])')
				group_el.style.display = visible_cards.length ? '' : 'none'
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
}

function restore_status(test_name) {
	try {
		const key = `test_status:${test_name.toLowerCase()}`
		const stored = sessionStorage.getItem(key)
		if (stored === 'pass' || stored === 'fail' || stored === 'running') return stored
	} catch (e) {}
	return 'pending'
}

// @license-end
