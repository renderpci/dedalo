// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_ROOT_WEB*/
/*eslint no-undef: "error"*/



// imports
import {ui} from '../../../../common/js/ui.js'
import {event_manager} from '../../../../common/js/event_manager.js'
import {data_manager} from '../../../../common/js/data_manager.js'



// Color palette (CSS variables resolved at runtime by the chart code).
const PALETTE = [
	'#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
	'#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1',
	'#14b8a6', '#a855f7', '#f43f5e', '#22c55e', '#eab308'
]

const SHOW_DEBUG_GLOBAL = (typeof SHOW_DEBUG !== 'undefined' && SHOW_DEBUG === true)



/**
* LOAD_D3
* Lazy import the bundled D3 build, sharing the cache with the area dashboard.
* @return Promise<object|null>
*/
const load_d3 = async function() {

	if (typeof window !== 'undefined' && window.__dedalo_d3) {
		return window.__dedalo_d3
	}

	const base = (typeof DEDALO_ROOT_WEB !== 'undefined' && DEDALO_ROOT_WEB)
		? DEDALO_ROOT_WEB
		: ''
	const url = base + '/lib/d3/d3-7.9.0/dist/d3.min.js'

	try {
		const mod = await import(url)
		const d3 = mod && (mod.default || mod)
		const resolved = (d3 && d3.select) ? d3 : (typeof window!=='undefined' ? window.d3 : null)
		if (typeof window !== 'undefined') {
			window.__dedalo_d3 = resolved
		}
		return resolved
	} catch (e) {
		if (typeof SHOW_DEBUG!=='undefined' && SHOW_DEBUG===true) {
			console.warn('user_activity: failed to load D3 from', url, e)
		}
		return null
	}
}//end load_d3



/**
* FORMAT_NUMBER
* Locale-aware integer formatting with thousand separators.
* @param number n
* @return string
*/
const format_number = function(n) {

	if (typeof n !== 'number' || !isFinite(n)) return String(n ?? '')
	try {
		return n.toLocaleString()
	} catch (_e) {
		return String(n)
	}
}//end format_number



/**
* TRUNCATE
* Cut a string with an ellipsis when longer than the requested length.
* @param string str
* @param int max
* @return string
*/
const truncate = function(str, max) {

	if (typeof str !== 'string') return ''
	return str.length > max ? str.slice(0, max - 1) + '…' : str
}//end truncate



/**
* RENDER_USER_ACTIVITY
* Manages the component's logic and appearance in client side
*/
export class render_user_activity {

	constructor() {
		return true
	}

	/**
	* EDIT
	* Render node for use in modes: edit, edit_in_list
	* @return HTMLElement wrapper
	*/
	async edit(options) {

		const self = this

		const render_level = options.render_level

		// content_data
			const content_data = await get_content_data_edit(self)
			if (render_level==='content') {
				return content_data
			}

		// wrapper. ui build_edit returns widget wrapper
			const wrapper = ui.widget.build_wrapper_edit(self, {
				content_data : content_data
			})


		return wrapper
	}//end edit
}



/**
* GET_CONTENT_DATA_EDIT
* @return HTMLElement content_data
*/
const get_content_data_edit = async function(self) {

	// async data fetch when component_info PHP skipped synchronous computation
	if ((!self.value || self.value.length < 1) && self.caller) {
		try {
			const rqo = {
				action	: 'get_widget_data',
				dd_api	: 'dd_component_info',
				source	: {
					tipo		: self.caller.tipo,
					section_tipo: self.caller.section_tipo,
					section_id	: self.caller.section_id,
					mode		: self.mode
				},
				options	: {
					widget_name: self.name
				}
			}
			const api_response = await data_manager.request({ body: rqo })
			if (api_response?.result) {
				self.value = api_response.result
			}
		} catch (e) {
			if (SHOW_DEBUG_GLOBAL) {
				console.warn('[user_activity] async data fetch failed:', e)
			}
		}
	}

	if (!self.value || self.value.length<1) {
		if (SHOW_DEBUG_GLOBAL) {
			console.warn("user_activity get_content_data_edit. Value is empty!", self);
		}
	}

	const fragment = new DocumentFragment()

	// values container
		const values_container = ui.create_dom_element({
			element_type	: 'ul',
			class_name		: 'values_container',
			parent			: fragment
		})

	// values
		const ipo			= self.ipo
		const ipo_length	= ipo.length

		for (let i = 0; i < ipo_length; i++) {
			const data = self.value.filter(item => item.key === i)
			get_value_element(i, data , values_container, self)
		}

	// content_data
		const content_data = ui.create_dom_element({
			element_type : 'div'
		})
		content_data.appendChild(fragment)


	return content_data
}//end get_content_data_edit



/**
* GET_VALUE_ELEMENT
* @return HTMLElement li
*/
const get_value_element = (i, data, values_container, self) => {

	// li, for every ipo will create a li node
		const li = ui.create_dom_element({
			element_type	: 'li',
			class_name		: 'widget_item user_activity',
			parent			: values_container
		})

	// totals — visual chart panel
		const totals_item = data.find(item => item.widget_id === 'totals')
		const totals = totals_item ? totals_item.value : null
		const charts_panel = build_totals_charts(totals)
		li.appendChild(charts_panel)


	return li
}//end get_value_element



/**
* NORMALIZE_TOTALS
* Accept any of the historical user-activity payload shapes and return
* the canonical `{who, what, where, when, publish}` object.
*
* Supported inputs:
*   - null / undefined / empty                    → null (no data)
*   - already-canonical object {who,what,…}       → passed through
*   - flat raw array (get_interval_raw_activity_data):
*       [{type:'what', tipo, value, label}, {type:'when', hour, value}, …]
*   - component_json wrapper (legacy):            [{value:[…], lang}]
*
* @param mixed input
* @return object|null
*/
const normalize_totals = function(input) {

	if (!input) return null

	// component_json wrapper: [{value:[...], lang}]
	if (Array.isArray(input) && input.length > 0 && input[0] && Array.isArray(input[0].value)) {
		input = input[0].value
	}

	// Already-canonical object?
	if (!Array.isArray(input) && typeof input === 'object') {
		const has_dim = ['who','what','where','when','publish'].some(k => Array.isArray(input[k]))
		if (has_dim) {
			return input
		}
	}

	// Flat raw array → group by `type`
	if (Array.isArray(input)) {

		const out = { who: [], what: [], where: [], when: [], publish: [] }
		const when_index = {}
		for (let h = 0; h < 24; h++) {
			when_index[h] = { key: h, label: String(h).padStart(2, '0'), value: 0 }
			out.when.push(when_index[h])
		}
		const indexes = { what: {}, where: {}, publish: {}, who: {} }

		for (const it of input) {
			if (!it || typeof it.value !== 'number') continue
			const type = it.type
			if (type === 'when') {
				const h = Number(it.hour ?? it.key)
				if (Number.isInteger(h) && h >= 0 && h < 24) {
					when_index[h].value += it.value
				}
				continue
			}
			if (type === 'what' || type === 'where' || type === 'publish' || type === 'who') {
				const k = it.tipo ?? it.key
				if (!k) continue
				const bucket = indexes[type]
				if (bucket[k]) {
					bucket[k].value += it.value
				} else {
					bucket[k] = { key: k, label: it.label || k, value: it.value }
					out[type].push(bucket[k])
				}
			}
		}

		// Drop the empty `when` array if nothing was registered.
		if (!out.when.some(d => d.value > 0)) out.when = []

		return out
	}


	return null
}//end normalize_totals



/**
* BUILD_TOTALS_CHARTS
* Build the visual user-activity chart panel for the `totals` widget output.
* Renders synchronously a placeholder + summary KPIs and asynchronously
* upgrades with D3 charts as soon as the bundle is loaded.
* @param object|array|null raw_totals
* 	Any of the supported payload shapes (see `normalize_totals`).
* @return HTMLElement
*/
const build_totals_charts = function(raw_totals) {

	const wrapper = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'user_activity_charts'
	})

	const totals = normalize_totals(raw_totals)

	if (SHOW_DEBUG_GLOBAL) {
		// eslint-disable-next-line no-console
		console.log('[user_activity] raw payload:', raw_totals, '| normalized:', totals)
	}

	if (!totals) {
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'user_activity_charts_empty',
			inner_html		: (typeof get_label!=='undefined' && get_label.no_data) || 'No activity data',
			parent			: wrapper
		})
		return wrapper
	}

	// ---- Summary KPI strip (works without D3) ----
	wrapper.appendChild(build_summary_strip(totals))

	// ---- Charts grid (placeholder; upgraded once D3 is ready) ----
	const grid = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'user_activity_charts_grid',
		parent			: wrapper
	})

	// Decide which sections to render based on data presence.
	const sections = []
	if (Array.isArray(totals.what)    && totals.what.length    > 0) sections.push({ key: 'what',    label: 'Activity by type'   })
	if (Array.isArray(totals.where)   && totals.where.length   > 0) sections.push({ key: 'where',   label: 'Activity by section' })
	if (Array.isArray(totals.when)    && totals.when.some(d => d && d.value > 0)) sections.push({ key: 'when',    label: 'Activity by hour'    })
	if (Array.isArray(totals.publish) && totals.publish.length > 0) sections.push({ key: 'publish', label: 'Publications'        })

	if (sections.length === 0) {
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'user_activity_charts_empty',
			inner_html		: (typeof get_label!=='undefined' && get_label.no_data) || 'No activity data',
			parent			: grid
		})
		return wrapper
	}

	const hosts = {}
	for (const s of sections) {
		const card = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'user_activity_chart user_activity_chart_' + s.key,
			parent			: grid
		})
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'user_activity_chart_title',
			inner_html		: s.label,
			parent			: card
		})
		const body = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'user_activity_chart_body',
			parent			: card
		})
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'user_activity_chart_loading',
			inner_html		: 'Loading…',
			parent			: body
		})
		hosts[s.key] = body
	}

	// Async D3 upgrade
	load_d3().then(d3 => {

		if (!d3) {
			// eslint-disable-next-line no-console
			console.warn('[user_activity] D3 not available, rendering JSON fallback.')
			for (const key of Object.keys(hosts)) {
				hosts[key].innerHTML = ''
				const fb = ui.create_dom_element({
					element_type : 'pre',
					class_name   : 'user_activity_chart_fallback',
					inner_html   : JSON.stringify(totals[key], null, 2),
					parent       : hosts[key]
				})
				fb.title = 'D3 unavailable — raw data shown.'
			}
			return
		}

		// Wait until the panel is laid out (offsetWidth > 0). The widget may
		// be inserted asynchronously into a tab/panel, so we poll for up to
		// ~1s before falling back to a hard-coded width.
		const try_render = function(attempt) {
			const ready = wrapper.isConnected && wrapper.offsetWidth > 0
			if (!ready && attempt < 30) {
				return setTimeout(() => try_render(attempt + 1), 33)
			}
			if (SHOW_DEBUG_GLOBAL) {
				// eslint-disable-next-line no-console
				console.log('[user_activity] rendering charts. wrapper width:', wrapper.offsetWidth, 'attempt:', attempt)
			}
			if (hosts.what)    { hosts.what.innerHTML    = ''; render_what_chart(d3, hosts.what, totals.what || []) }
			if (hosts.where)   { hosts.where.innerHTML   = ''; render_where_chart(d3, hosts.where, totals.where || []) }
			if (hosts.when)    { hosts.when.innerHTML    = ''; render_when_chart(d3, hosts.when, totals.when || []) }
			if (hosts.publish) { hosts.publish.innerHTML = ''; render_publish_chart(d3, hosts.publish, totals.publish || []) }
		}
		try_render(0)
	})


	return wrapper
}//end build_totals_charts



/**
* BUILD_SUMMARY_STRIP
* KPI tiles displayed above the charts: total actions, sections touched,
* peak working hour and most-touched section. Pure DOM (no D3 dependency).
* @param object totals
* @return HTMLElement
*/
const build_summary_strip = function(totals) {

	const sum_values = arr => Array.isArray(arr)
		? arr.reduce((acc, x) => acc + (Number(x && x.value) || 0), 0)
		: 0

	const total_actions = sum_values(totals.where) || sum_values(totals.what)

	const sections_touched = Array.isArray(totals.where) ? totals.where.length : 0

	let peak_hour = null
	let peak_hour_value = -1
	if (Array.isArray(totals.when)) {
		for (const h of totals.when) {
			if (!h || typeof h.value !== 'number') continue
			if (h.value > peak_hour_value) {
				peak_hour_value = h.value
				peak_hour = h
			}
		}
	}

	let top_section = null
	if (Array.isArray(totals.where) && totals.where.length > 0) {
		top_section = totals.where.slice().sort((a, b) => (b.value || 0) - (a.value || 0))[0]
	}

	const total_publications = sum_values(totals.publish)

	const tiles = [
		{ label: 'Total actions',		value: format_number(total_actions) },
		{ label: 'Sections touched',	value: format_number(sections_touched) },
		{ label: 'Peak hour',			value: peak_hour && peak_hour_value > 0
			? `${String(peak_hour.label || peak_hour.key).padStart(2,'0')}:00`
			: '—',
			hint: peak_hour && peak_hour_value > 0 ? `${format_number(peak_hour_value)} actions` : '' },
		{ label: 'Top section',			value: top_section ? truncate(top_section.label || top_section.key, 22) : '—',
			hint: top_section ? format_number(top_section.value) + ' actions' : '' },
		{ label: 'Publications',		value: format_number(total_publications) }
	]

	const strip = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'user_activity_summary'
	})

	for (const tile of tiles) {
		const t = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'user_activity_summary_tile',
			parent			: strip
		})
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'user_activity_summary_label',
			inner_html		: tile.label,
			parent			: t
		})
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'user_activity_summary_value',
			inner_html		: tile.value,
			parent			: t
		})
		if (tile.hint) {
			ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'user_activity_summary_hint',
				inner_html		: tile.hint,
				parent			: t
			})
		}
	}


	return strip
}//end build_summary_strip



/**
* RENDER_HORIZONTAL_BARS
* Generic horizontal-bar renderer used for `what`, `where` and `publish`.
* When `clickable` is true each row publishes a `user_navigation` event on
* click (Alt+click opens in a new tab).
* @param object d3
* @param HTMLElement host
* @param array rows
* @param object opts
* 	{ max_rows:int, clickable:bool, label_width:int }
* @return void
*/
const render_horizontal_bars = function(d3, host, rows, opts) {

	const cfg = Object.assign({
		max_rows	: 12,
		clickable	: false,
		label_width	: 160
	}, opts || {})

	// Coerce values to numbers (PHP/JSON sometimes serializes counts as strings).
	const all = (rows || [])
		.map(r => r && Object.assign({}, r, { value: Number(r.value) || 0 }))
		.filter(r => r && r.value > 0)
		.sort((a, b) => b.value - a.value)
	if (all.length === 0) {
		ui.create_dom_element({
			element_type : 'div',
			class_name   : 'user_activity_chart_empty',
			inner_html   : 'No data',
			parent       : host
		})
		return
	}

	const data		= all.slice(0, cfg.max_rows)
	const hidden	= all.length - data.length

	const row_h			= 24
	const padding_top	= 4
	const padding_bot	= 4
	const padding_left	= cfg.label_width
	const padding_right	= 56
	const width			= host.offsetWidth > 0 ? host.offsetWidth : (host.clientWidth || 380)
	const height		= padding_top + padding_bot + data.length * row_h

	const svg = d3.select(host)
		.append('svg')
		.attr('viewBox', `0 0 ${width} ${height}`)
		.attr('preserveAspectRatio', 'xMinYMin meet')
		.style('width', '100%')
		.style('height', height + 'px')
		.style('display', 'block')

	const max_v	= d3.max(data, d => d.value) || 1
	const x		= d3.scaleLinear().domain([0, max_v]).range([padding_left, width - padding_right])
	const y		= d3.scaleBand()
		.domain(data.map((_, i) => i))
		.range([padding_top, height - padding_bot])
		.padding(0.18)

	const rows_g = svg.append('g')
		.selectAll('g')
		.data(data)
		.join('g')
		.attr('class', 'user_activity_where_row')
		.attr('transform', (_, i) => `translate(0, ${y(i)})`)

	if (cfg.clickable) {
		rows_g
			.attr('tabindex', 0)
			.attr('role', 'link')
			.style('cursor', 'pointer')
			.on('click', function(event, d) { navigate_to_section(d, event) })
			.on('keydown', function(event, d) {
				if (event.key === 'Enter' || event.key === ' ') {
					event.preventDefault()
					navigate_to_section(d, event)
				}
			})
		// Full-row hit area
		rows_g.append('rect')
			.attr('x', 0).attr('y', 0)
			.attr('width', width).attr('height', y.bandwidth())
			.attr('fill', 'transparent')
	}

	rows_g.append('text')
		.attr('class', 'user_activity_where_label')
		.attr('x', padding_left - 8)
		.attr('y', y.bandwidth() / 2)
		.attr('dy', '0.35em')
		.attr('text-anchor', 'end')
		.text(d => truncate(String(d.label || d.key || ''), Math.max(8, Math.floor((padding_left - 16) / 6))))
		.append('title')
		.text(d => (d.label || d.key) + (cfg.clickable ? ' — click to open' : ''))

	rows_g.append('rect')
		.attr('class', 'user_activity_where_bar')
		.attr('x', padding_left)
		.attr('y', 0)
		.attr('width', d => Math.max(1, x(d.value) - padding_left))
		.attr('height', y.bandwidth())
		.attr('fill', (_, i) => PALETTE[i % PALETTE.length])
		.append('title')
		.text(d => `${d.label || d.key}: ${format_number(d.value)}` + (cfg.clickable ? ' — click to open' : ''))

	rows_g.append('text')
		.attr('class', 'user_activity_where_value')
		.attr('x', d => x(d.value) + 6)
		.attr('y', y.bandwidth() / 2)
		.attr('dy', '0.35em')
		.text(d => format_number(d.value))

	if (hidden > 0) {
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'user_activity_where_more',
			inner_html		: `+${hidden} more`,
			parent			: host
		})
	}
}//end render_horizontal_bars



/**
* RENDER_WHAT_CHART
* Horizontal bars of action types (modification, indexation, …).
* @param object d3
* @param HTMLElement host
* @param array rows
* @return void
*/
const render_what_chart = function(d3, host, rows) {
	render_horizontal_bars(d3, host, rows, { max_rows: 12, clickable: false, label_width: 160 })
}//end render_what_chart



/**
* RENDER_WHERE_CHART
* Horizontal bars of per-section activity. Clickable rows navigate to the
* section's list (Alt+click new tab, Enter/Space keyboard).
* @param object d3
* @param HTMLElement host
* @param array rows
* @return void
*/
const render_where_chart = function(d3, host, rows) {
	render_horizontal_bars(d3, host, rows, { max_rows: 12, clickable: true, label_width: 180 })
}//end render_where_chart



/**
* NAVIGATE_TO_SECTION
* Opens the section list page for a `where` row via the SPA event bus.
* @param object row		{ key: section_tipo, label }
* @param Event|undefined ev
* @return void
*/
const navigate_to_section = function(row, ev) {

	if (!row || !row.key) return

	if (ev && ev.altKey === true) {
		const base = (typeof window !== 'undefined' && window.location.pathname) ? window.location.pathname : ''
		const url = `${base}?tipo=${encodeURIComponent(row.key)}&mode=list`
		const win = window.open(url, '_blank')
		if (win) win.focus()
		return
	}
	event_manager.publish('user_navigation', {
		source : {
			tipo : row.key,
			model: 'section',
			mode : 'list'
		}
	})
}//end navigate_to_section



/**
* RENDER_WHEN_CHART
* Vertical 24-column bar chart of activity by hour-of-day. Easy to scan,
* color-coded by daypart (morning / afternoon / evening / night).
* @param object d3
* @param HTMLElement host
* @param array rows		Items like { key:0..23, label:'HH', value:int }
* @return void
*/
const render_when_chart = function(d3, host, rows) {

	// Normalize into a 24-slot dataset (preserving zeros for visual continuity).
	const hours = []
	for (let h = 0; h < 24; h++) hours.push({ hour: h, value: 0 })
	for (const r of (rows || [])) {
		if (!r) continue
		const h = Number(r.key ?? r.hour)
		if (!Number.isInteger(h) || h < 0 || h > 23) continue
		hours[h].value = Number(r.value) || 0
	}

	const max_v = Math.max(...hours.map(h => h.value))
	if (max_v <= 0) {
		ui.create_dom_element({
			element_type : 'div',
			class_name   : 'user_activity_chart_empty',
			inner_html   : 'No data',
			parent       : host
		})
		return
	}

	const width			= host.offsetWidth > 0 ? host.offsetWidth : (host.clientWidth || 380)
	const height		= 200
	const padding_top	= 12
	const padding_bot	= 22
	const padding_left	= 28
	const padding_right	= 8
	const inner_w		= width - padding_left - padding_right
	const inner_h		= height - padding_top - padding_bot

	const svg = d3.select(host)
		.append('svg')
		.attr('viewBox', `0 0 ${width} ${height}`)
		.attr('preserveAspectRatio', 'xMinYMin meet')
		.style('width', '100%')
		.style('height', height + 'px')
		.style('display', 'block')

	const x = d3.scaleBand()
		.domain(hours.map(h => h.hour))
		.range([padding_left, padding_left + inner_w])
		.padding(0.15)

	const y = d3.scaleLinear()
		.domain([0, max_v])
		.nice()
		.range([padding_top + inner_h, padding_top])

	// Y-axis gridlines + labels
	const y_ticks = y.ticks(4)
	svg.append('g')
		.selectAll('line')
		.data(y_ticks)
		.join('line')
		.attr('x1', padding_left).attr('x2', width - padding_right)
		.attr('y1', d => y(d)).attr('y2', d => y(d))
		.attr('stroke', 'var(--border_default, #cbd5e1)')
		.attr('stroke-dasharray', '2 3')
		.attr('opacity', 0.5)

	svg.append('g')
		.selectAll('text')
		.data(y_ticks)
		.join('text')
		.attr('class', 'user_activity_axis_label')
		.attr('x', padding_left - 4)
		.attr('y', d => y(d))
		.attr('dy', '0.32em')
		.attr('text-anchor', 'end')
		.text(d => format_number(d))

	// Daypart color mapping
	const color_for = h => {
		if (h >= 6  && h < 12) return '#10b981' // morning
		if (h >= 12 && h < 18) return '#f59e0b' // afternoon
		if (h >= 18 && h < 22) return '#8b5cf6' // evening
		return '#475569' // night
	}

	// Bars
	svg.append('g')
		.selectAll('rect')
		.data(hours)
		.join('rect')
		.attr('class', 'user_activity_when_bar')
		.attr('x', d => x(d.hour))
		.attr('y', d => y(d.value))
		.attr('width', x.bandwidth())
		.attr('height', d => Math.max(0, (padding_top + inner_h) - y(d.value)))
		.attr('fill', d => color_for(d.hour))
		.attr('opacity', d => d.value > 0 ? 0.92 : 0.18)
		.append('title')
		.text(d => `${String(d.hour).padStart(2,'0')}:00 — ${format_number(d.value)} action${d.value===1?'':'s'}`)

	// X-axis labels (every 2 hours to avoid clutter)
	svg.append('g')
		.selectAll('text')
		.data(hours.filter(h => h.hour % 2 === 0))
		.join('text')
		.attr('class', 'user_activity_axis_label')
		.attr('x', d => x(d.hour) + x.bandwidth() / 2)
		.attr('y', height - 6)
		.attr('text-anchor', 'middle')
		.text(d => String(d.hour).padStart(2, '0'))
}//end render_when_chart



/**
* RENDER_PUBLISH_CHART
* Horizontal bars of publication targets.
* @param object d3
* @param HTMLElement host
* @param array rows
* @return void
*/
const render_publish_chart = function(d3, host, rows) {
	render_horizontal_bars(d3, host, rows, { max_rows: 10, clickable: false, label_width: 140 })
}//end render_publish_chart



// @license-end
