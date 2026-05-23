// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_ROOT_WEB*/
/*eslint no-undef: "error"*/

// imports
	import {data_manager} from '../../common/js/data_manager.js'



/**
* DASHBOARD
* Shared, framework-agnostic dashboard renderer used by every `area_*` page.
* Lives in `area_common` so all area subclasses inherit it.
*
* Public entry point:
*   build_dashboard(self, dashboard_data) → HTMLElement
*
* Where `dashboard_data` is the object produced server-side by
* `area_common::get_dashboard_data()`:
*   {
*     area_tipo, area_label, generated_at, metrics, sections: [
*       { section_tipo, label, model, color, total, ... }
*     ]
*   }
*
* D3 (lib/d3/d3-7.9.0) is lazy-loaded; the dashboard renders KPI cards first
* and upgrades with charts once D3 is available, so it works without D3 too.
*/



/**
* BUILD_DASHBOARD
* @param object self
* 	area instance (carries `tipo`, `mode`, `caller`, etc.)
* @param object dashboard_data
* 	Server payload (see header).
* @return HTMLElement wrapper
*/
export const build_dashboard = function(self, dashboard_data) {

	const wrapper = document.createElement('div')
	wrapper.classList.add('area_dashboard')

	if (!dashboard_data || !Array.isArray(dashboard_data.sections)) {
		wrapper.classList.add('area_dashboard_empty')
		wrapper.textContent = (typeof get_label!=='undefined' && get_label.no_data) || 'No data'
		return wrapper
	}

	// header
	const header = build_header(dashboard_data)
	wrapper.appendChild(header)

	// kpi cards block (toolbar + grid)
	const cards = build_cards(self, dashboard_data)
	wrapper.appendChild(cards)

	// chart placeholder, upgraded async with D3
	const chart_host = document.createElement('div')
	chart_host.classList.add('area_dashboard_chart')
	wrapper.appendChild(chart_host)

	// lazy-load D3 only when there is something to chart
	const has_totals		= dashboard_data.sections.some(s => typeof s.total === 'number')
	const has_activity	= !!dashboard_data.activity_30d
	if (has_totals || has_activity) {
		load_d3()
			.then(d3 => {
				if (!d3) return

				// Render each chart only when its host has stable non-zero dimensions.
				// ResizeObserver is the most robust way to detect layout settlement;
				// fallback to a double-rAF retry loop for older browsers.
				const render_when_ready = function(host, render_fn) {
					// ResizeObserver path
					if (typeof ResizeObserver !== 'undefined') {
						const ro = new ResizeObserver((entries, observer) => {
							const cr = entries[0].contentRect
							if (cr.width > 0 && host.isConnected) {
								observer.disconnect()
								render_fn()
							}
						})
						ro.observe(host)
						return
					}
					// Fallback: retry with requestAnimationFrame up to 60 frames (~1s)
					let attempts = 0
					const try_render = () => {
						attempts++
						if (host.offsetWidth > 0 && host.isConnected) {
							render_fn()
						} else if (attempts < 60) {
							requestAnimationFrame(try_render)
						} else {
							if (typeof SHOW_DEBUG!=='undefined' && SHOW_DEBUG===true) {
								console.warn('Dashboard: host never reached stable size, rendering with fallback width')
							}
							render_fn()
						}
					}
					requestAnimationFrame(try_render)
				}

				if (has_totals) {
					render_when_ready(chart_host, () => {
						render_section_chart(d3, chart_host, dashboard_data)
					})
				}
				if (has_activity) {
					const activity_host = document.createElement('div')
					activity_host.classList.add('area_dashboard_activity')
					wrapper.appendChild(activity_host)
					render_when_ready(activity_host, () => {
						render_activity_timeline(d3, activity_host, dashboard_data)
					})
				}
			})
			.catch(err => {
				if (typeof SHOW_DEBUG!=='undefined' && SHOW_DEBUG===true) {
					console.warn('Dashboard: D3 unavailable, chart skipped.', err)
				}
			})
	}


	return wrapper
}//end build_dashboard



/**
* BUILD_HEADER
* @param object dashboard_data
* @return HTMLElement
*/
const build_header = function(dashboard_data) {

	const header = document.createElement('div')
	header.classList.add('area_dashboard_header')

	const title = document.createElement('h2')
	title.classList.add('area_dashboard_title')
	title.textContent = dashboard_data.area_label || dashboard_data.area_tipo
	header.appendChild(title)

	const sub = document.createElement('div')
	sub.classList.add('area_dashboard_subtitle')
	const total_sections	= dashboard_data.sections.length
	const total_records	= dashboard_data.sections.reduce((acc, s) => acc + (typeof s.total === 'number' ? s.total : 0), 0)
	sub.textContent = `${total_sections} section${total_sections===1?'':'s'} · ${format_number(total_records)} record${total_records===1?'':'s'}`
	header.appendChild(sub)


	return header
}//end build_header



/**
* BUILD_CARDS
* Wraps the KPI cards with a toolbar (live filter + sort selector) and
* renders the grid of section cards. Each card is clickable: navigates to
* the section page using Dédalo's event-driven SPA navigation (user_navigation).
* Cards include a `recent_7d` trend badge when the server payload provides it.
* @param object self
* @param object dashboard_data
* @return HTMLElement wrapper containing toolbar + grid
*/
const build_cards = function(self, dashboard_data) {

	const block = document.createElement('div')
	block.classList.add('area_dashboard_cards_block')

	// ---- Toolbar: filter input + sort selector ----
	const toolbar = document.createElement('div')
	toolbar.classList.add('area_dashboard_cards_toolbar')

	const filter_input = document.createElement('input')
	filter_input.type = 'search'
	filter_input.classList.add('area_dashboard_cards_filter')
	filter_input.placeholder = (typeof get_label!=='undefined' && get_label.filter)
		? get_label.filter
		: 'Filter sections…'
	toolbar.appendChild(filter_input)

	const sort_select = document.createElement('select')
	sort_select.classList.add('area_dashboard_cards_sort')
	const sort_options = [
		{ value: 'total_desc',  label: 'Total ↓'  },
		{ value: 'total_asc',   label: 'Total ↑'  },
		{ value: 'label_asc',   label: 'A → Z'    },
		{ value: 'label_desc',  label: 'Z → A'    },
		{ value: 'recent_desc', label: 'Recent ↓' }
	]
	for (const opt of sort_options) {
		const o = document.createElement('option')
		o.value = opt.value
		o.textContent = opt.label
		sort_select.appendChild(o)
	}
	toolbar.appendChild(sort_select)

	const summary = document.createElement('span')
	summary.classList.add('area_dashboard_cards_summary')
	toolbar.appendChild(summary)

	block.appendChild(toolbar)

	// ---- Grid (re-rendered on filter/sort changes) ----
	const grid = document.createElement('div')
	grid.classList.add('area_dashboard_grid')
	block.appendChild(grid)

	const total_sections = dashboard_data.sections.length

	const render_grid = function() {

		const needle = filter_input.value.trim().toLowerCase()
		const sort_by = sort_select.value

		// filter
		let rows = dashboard_data.sections.filter(section => {
			if (!needle) return true
			const label	= (section.label || '').toLowerCase()
			const tipo	= (section.section_tipo || '').toLowerCase()
			return label.indexOf(needle) !== -1 || tipo.indexOf(needle) !== -1
		})

		// sort
		const num = v => (typeof v === 'number' && isFinite(v) ? v : -Infinity)
		rows = rows.slice().sort((a, b) => {
			switch (sort_by) {
				case 'total_asc':	return num(a.total) - num(b.total)
				case 'label_asc':	return (a.label||'').localeCompare(b.label||'')
				case 'label_desc':	return (b.label||'').localeCompare(a.label||'')
				case 'recent_desc':	return num(b.recent_7d) - num(a.recent_7d)
				case 'total_desc':
				default:			return num(b.total) - num(a.total)
			}
		})

		// update summary text
		summary.textContent = needle
			? `${rows.length} / ${total_sections}`
			: `${total_sections} section${total_sections===1?'':'s'}`

		// render
		grid.innerHTML = ''
		for (const section of rows) {
			grid.appendChild(build_card(section, dashboard_data))
		}
	}

	// debounced filter for snappier UX on large areas
	let filter_timer = null
	filter_input.addEventListener('input', () => {
		if (filter_timer) clearTimeout(filter_timer)
		filter_timer = setTimeout(render_grid, 80)
	})
	sort_select.addEventListener('change', render_grid)

	render_grid()


	return block
}//end build_cards



/**
* BUILD_CARD
* Single KPI card: color stripe, label, big number, recent-activity trend
* badge (when available), 30-day sparkline (when activity data exists),
* and meta line.
* @param object section
* @param object|undefined dashboard_data
* 	Optional full dashboard payload, used to build the per-card sparkline
* 	from `activity_30d.days[].by_section[section_tipo]`.
* @return HTMLElement
*/
const build_card = function(section, dashboard_data) {

	const card = document.createElement('div')
	card.classList.add('area_dashboard_card')
	card.style.setProperty('--accent', section.color || '#3b82f6')

	// click → SPA navigation (same as menu tree)
	const url = build_section_url(section)
	card.addEventListener('click', (e) => {
		if (e.altKey === true) {
			const win = window.open(url, '_blank')
			win.focus()
			return
		}
		event_manager.publish('user_navigation', {
			source : {
				tipo : section.section_tipo,
				model: section.model || 'section',
				mode : 'list'
			}
		})
	})

	// stripe
	const stripe = document.createElement('span')
	stripe.classList.add('area_dashboard_card_stripe')
	card.appendChild(stripe)

	// label
	const label = document.createElement('div')
	label.classList.add('area_dashboard_card_label')
	label.textContent = section.label
	card.appendChild(label)

	// big number
	const value = document.createElement('div')
	value.classList.add('area_dashboard_card_value')
	value.textContent = typeof section.total === 'number'
		? format_number(section.total)
		: '—'
	card.appendChild(value)

	// recent activity trend badge (last 7 days)
	if (typeof section.recent_7d === 'number' && section.recent_7d > 0) {
		const trend = document.createElement('div')
		trend.classList.add('area_dashboard_card_trend')
		trend.textContent = `+${format_number(section.recent_7d)} this week`
		trend.title = `${section.recent_7d} activity event${section.recent_7d===1?'':'s'} in the last 7 days`
		card.appendChild(trend)
	}

	// 30-day sparkline (only when activity data is present and not empty)
	const spark = build_sparkline(section, dashboard_data)
	if (spark) {
		card.appendChild(spark)
	}

	// meta (tipo + model)
	const meta = document.createElement('div')
	meta.classList.add('area_dashboard_card_meta')
	meta.textContent = `${section.section_tipo} · ${section.model || ''}`.trim()
	card.appendChild(meta)


	return card
}//end build_card



/**
* BUILD_SPARKLINE
* Inline SVG mini-chart showing daily activity counts for a single section
* over the pre-loaded 30-day window. Pure SVG (no D3 dependency).
* Returns null when there is no data or the series is entirely zero.
* @param object section
* @param object|undefined dashboard_data
* @return SVGElement|null
*/
const build_sparkline = function(section, dashboard_data) {

	if (!dashboard_data || !dashboard_data.activity_30d) return null

	const days = dashboard_data.activity_30d.days
	if (!Array.isArray(days) || days.length < 2) return null

	const tipo = section.section_tipo

	// Extract daily counts for this section
	const series = days.map(d => {
		const by_section = d.by_section || {}
		const v = by_section[tipo]
		return typeof v === 'number' ? v : 0
	})

	const max = Math.max(...series)
	if (max <= 0) return null // skip flat-zero sparkline

	const total		= series.reduce((a, b) => a + b, 0)
	const peak_idx	= series.indexOf(max)
	const peak_date	= days[peak_idx] ? days[peak_idx].date : ''

	// Build SVG path (line) + area fill
	const w			= 100
	const h			= 22
	const step		= series.length > 1 ? w / (series.length - 1) : w
	const y_for		= v => h - 2 - (v / max) * (h - 4)

	let line = ''
	let area = `M 0 ${h}`
	for (let i = 0; i < series.length; i++) {
		const x = i * step
		const y = y_for(series[i])
		line += (i === 0 ? 'M' : ' L') + ` ${x.toFixed(2)} ${y.toFixed(2)}`
		area += ` L ${x.toFixed(2)} ${y.toFixed(2)}`
	}
	area += ` L ${w} ${h} Z`

	const SVG_NS = 'http://www.w3.org/2000/svg'
	const svg = document.createElementNS(SVG_NS, 'svg')
	svg.setAttribute('class', 'area_dashboard_card_sparkline')
	svg.setAttribute('viewBox', `0 0 ${w} ${h}`)
	svg.setAttribute('preserveAspectRatio', 'none')
	svg.setAttribute('aria-hidden', 'true')

	const fill = document.createElementNS(SVG_NS, 'path')
	fill.setAttribute('d', area)
	fill.setAttribute('fill', section.color || '#3b82f6')
	fill.setAttribute('fill-opacity', '0.18')
	svg.appendChild(fill)

	const stroke = document.createElementNS(SVG_NS, 'path')
	stroke.setAttribute('d', line)
	stroke.setAttribute('fill', 'none')
	stroke.setAttribute('stroke', section.color || '#3b82f6')
	stroke.setAttribute('stroke-width', '1.25')
	stroke.setAttribute('stroke-linecap', 'round')
	stroke.setAttribute('stroke-linejoin', 'round')
	svg.appendChild(stroke)

	// Peak marker (small dot)
	const dot = document.createElementNS(SVG_NS, 'circle')
	dot.setAttribute('cx', String((peak_idx * step).toFixed(2)))
	dot.setAttribute('cy', String(y_for(max).toFixed(2)))
	dot.setAttribute('r', '1.6')
	dot.setAttribute('fill', section.color || '#3b82f6')
	svg.appendChild(dot)

	// Tooltip
	const title = document.createElementNS(SVG_NS, 'title')
	title.textContent = `${format_number(total)} event${total===1?'':'s'} · peak ${format_number(max)}${peak_date ? ' on ' + peak_date : ''}`
	svg.appendChild(title)


	return svg
}//end build_sparkline



/**
* RENDER_SECTION_CHART
* Owner of the "Records by section" chart area: renders a header with the
* title and a chart-type selector (Bar / Pie / Treemap), keeps user choice
* in localStorage, and re-renders the chart body on demand.
* Click / Alt+click on any chart element navigates to the section list,
* mirroring the KPI cards behaviour.
* @param object d3
* @param HTMLElement host	The `.area_dashboard_chart` container.
* @param object dashboard_data
* @return void
*/
const render_section_chart = function(d3, host, dashboard_data) {

	const STORAGE_KEY	= 'dedalo_dashboard_chart_type'
	const types			= [
		{ key: 'bar',      label: 'Bar'      },
		{ key: 'pie',      label: 'Pie'      },
		{ key: 'treemap',  label: 'Treemap'  },
		{ key: 'sunburst', label: 'Sunburst' }
	]

	// Read persisted preference; fallback to bar.
	let current_type = 'bar'
	try {
		const stored = window.localStorage.getItem(STORAGE_KEY)
		if (stored && types.some(t => t.key === stored)) {
			current_type = stored
		}
	} catch (_e) { /* localStorage unavailable */ }

	host.innerHTML = ''

	// Header: title + type selector
	const header = document.createElement('div')
	header.classList.add('area_dashboard_chart_header')

	const title = document.createElement('div')
	title.classList.add('area_dashboard_chart_title')
	title.textContent = 'Records by section'
	header.appendChild(title)

	const switcher = document.createElement('div')
	switcher.classList.add('area_dashboard_chart_switcher')
	switcher.setAttribute('role', 'tablist')
	const buttons = {}
	for (const t of types) {
		const btn = document.createElement('button')
		btn.type = 'button'
		btn.classList.add('area_dashboard_chart_switcher_btn')
		btn.setAttribute('role', 'tab')
		btn.dataset.type = t.key
		btn.textContent = t.label
		btn.addEventListener('click', () => {
			if (t.key === current_type) return
			current_type = t.key
			try { window.localStorage.setItem(STORAGE_KEY, current_type) } catch (_e) { /* noop */ }
			update_active()
			render()
		})
		buttons[t.key] = btn
		switcher.appendChild(btn)
	}
	const update_active = function() {
		for (const t of types) {
			buttons[t.key].classList.toggle('is_active', t.key === current_type)
			buttons[t.key].setAttribute('aria-selected', t.key === current_type ? 'true' : 'false')
		}
	}
	update_active()
	header.appendChild(switcher)

	host.appendChild(header)

	// Body (cleared + re-rendered on type change)
	const body = document.createElement('div')
	body.classList.add('area_dashboard_chart_body')
	host.appendChild(body)

	const render = function() {
		body.innerHTML = ''
		switch (current_type) {
			case 'pie':
				render_pie_chart(d3, body, dashboard_data)
				break
			case 'treemap':
				render_treemap_chart(d3, body, dashboard_data)
				break
			case 'sunburst':
				render_sunburst_chart(d3, body, dashboard_data)
				break
			case 'bar':
			default:
				render_bar_chart(d3, body, dashboard_data)
				break
		}
	}
	render()
}//end render_section_chart



/**
* NAVIGATE_TO_SECTION
* Shared click handler used by every chart renderer so the navigation
* behaviour matches the KPI cards exactly.
* @param object section	{section_tipo, model, ...}
* @param Event|undefined ev
* @return void
*/
const navigate_to_section = function(section, ev) {

	if (ev && ev.altKey === true) {
		const url = build_section_url(section)
		const win = window.open(url, '_blank')
		if (win) win.focus()
		return
	}
	event_manager.publish('user_navigation', {
		source : {
			tipo : section.section_tipo,
			model: section.model || 'section',
			mode : 'list'
		}
	})
}//end navigate_to_section



/**
* RENDER_BAR_CHART
* Horizontal bar chart comparing section totals. Pure D3 (no external deps).
* @param object d3
* @param HTMLElement host	Body container (no title appended here).
* @param object dashboard_data
* @return void
*/
const render_bar_chart = function(d3, host, dashboard_data, expanded = false) {

	const rows = dashboard_data.sections
		.filter(s => typeof s.total === 'number')
		.sort((a, b) => b.total - a.total)

	if (rows.length === 0) {
		return
	}

	// dimensions — offsetWidth forces a synchronous layout and is more reliable
	// than getBoundingClientRect when the element was recently inserted.
	const width			= host.offsetWidth > 0 ? host.offsetWidth : (host.clientWidth || 800)
	const row_height	= 28
	const padding_top	= 24
	const padding_bottom= 32
	const padding_left	= 180
	const padding_right	= 48

	// Limit to top 20 sections when collapsed; show all when expanded
	const max_rows		= 20
	const visible_rows	= expanded ? rows : rows.slice(0, max_rows)
	const height		= padding_top + padding_bottom + visible_rows.length * row_height

	// svg
	const svg = d3.select(host)
		.append('svg')
		.attr('class', 'area_dashboard_chart_svg')
		.attr('viewBox', `0 0 ${width} ${height}`)
		.attr('preserveAspectRatio', 'xMinYMin meet')

	const max_total = d3.max(visible_rows, d => d.total) || 1

	const x = d3.scaleLinear()
		.domain([0, max_total])
		.nice()
		.range([padding_left, width - padding_right])

	const y = d3.scaleBand()
		.domain(visible_rows.map(d => d.section_tipo))
		.range([padding_top, height - padding_bottom])
		.padding(0.25)

	// x-axis
	const ticks = x.ticks(Math.min(6, Math.max(2, Math.floor(width / 120))))
	const axis = svg.append('g')
		.attr('class', 'area_dashboard_chart_axis')
		.attr('transform', `translate(0, ${height - padding_bottom})`)

	axis.append('line')
		.attr('x1', padding_left)
		.attr('x2', width - padding_right)
		.attr('y1', 0).attr('y2', 0)

	axis.selectAll('.tick')
		.data(ticks)
		.join('g')
		.attr('class', 'tick')
		.attr('transform', d => `translate(${x(d)}, 0)`)
		.call(g => {
			g.append('line').attr('y1', 0).attr('y2', 6)
			g.append('text')
				.attr('y', 20)
				.attr('text-anchor', 'middle')
				.text(d => format_number(d))
		})

	// gridlines
	svg.append('g')
		.attr('class', 'area_dashboard_chart_grid')
		.selectAll('line')
		.data(ticks)
		.join('line')
		.attr('x1', d => x(d)).attr('x2', d => x(d))
		.attr('y1', padding_top).attr('y2', height - padding_bottom)

	// bars (each group is clickable → SPA navigation to the section's list)
	const bars = svg.append('g')
		.attr('class', 'area_dashboard_chart_bars')
		.selectAll('g')
		.data(visible_rows)
		.join('g')
		.attr('class', 'area_dashboard_chart_bar')
		.attr('transform', d => `translate(0, ${y(d.section_tipo)})`)
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

	// Invisible full-row hit area for easier clicking (covers label + bar + value)
	bars.append('rect')
		.attr('class', 'area_dashboard_chart_hit')
		.attr('x', 0)
		.attr('y', 0)
		.attr('width', width)
		.attr('height', y.bandwidth())
		.attr('fill', 'transparent')

	bars.append('text')
		.attr('class', 'area_dashboard_chart_label')
		.attr('x', padding_left - 10)
		.attr('y', y.bandwidth() / 2)
		.attr('dy', '0.35em')
		.attr('text-anchor', 'end')
		.text(d => truncate(d.label, 26))
		.append('title')
		.text(d => `${d.label} (${d.section_tipo}) — click to open`)

	bars.append('rect')
		.attr('x', padding_left)
		.attr('y', 0)
		.attr('width', d => Math.max(1, x(d.total) - padding_left))
		.attr('height', y.bandwidth())
		.attr('fill', d => d.color || '#3b82f6')
		.append('title')
		.text(d => `${d.label}: ${format_number(d.total)} — click to open`)

	bars.append('text')
		.attr('class', 'area_dashboard_chart_value')
		.attr('x', d => x(d.total) + 6)
		.attr('y', y.bandwidth() / 2)
		.attr('dy', '0.35em')
		.text(d => format_number(d.total))

	// fold/unfold toggle when sections were hidden
	if (rows.length > max_rows) {
		const toggle = document.createElement('button')
		toggle.type = 'button'
		toggle.classList.add('area_dashboard_chart_toggle')
		const hidden_count = rows.length - max_rows
		if (expanded) {
			toggle.textContent = `Show top ${max_rows} (${hidden_count} hidden)`
		} else {
			toggle.textContent = `Show all ${rows.length} sections`
		}
		toggle.addEventListener('click', () => {
			host.innerHTML = ''
			render_bar_chart(d3, host, dashboard_data, !expanded)
		})
		host.appendChild(toggle)
	}
}//end render_bar_chart



/**
* RENDER_PIE_CHART
* Donut chart of section totals. Top 12 sections are shown individually;
* the rest are grouped into a non-clickable "Other" slice to keep the chart
* legible. Slices are clickable (SPA navigation), same as cards.
* @param object d3
* @param HTMLElement host
* @param object dashboard_data
* @return void
*/
const render_pie_chart = function(d3, host, dashboard_data) {

	const all_rows = dashboard_data.sections
		.filter(s => typeof s.total === 'number' && s.total > 0)
		.sort((a, b) => b.total - a.total)

	if (all_rows.length === 0) return

	// Group long tail into "Other"
	const top_n		= 12
	const top_rows	= all_rows.slice(0, top_n)
	const tail		= all_rows.slice(top_n)
	const rows		= top_rows.slice()
	if (tail.length > 0) {
		const tail_total = tail.reduce((acc, s) => acc + s.total, 0)
		rows.push({
			section_tipo	: '__other__',
			label			: `Other (${tail.length})`,
			color			: 'var(--fg_muted)',
			total			: tail_total,
			_is_other		: true,
			_tail_count		: tail.length
		})
	}

	const grand_total = rows.reduce((acc, s) => acc + s.total, 0)

	// Dimensions
	const width			= host.offsetWidth > 0 ? host.offsetWidth : (host.clientWidth || 600)
	const legend_width	= Math.min(260, Math.max(180, Math.floor(width * 0.35)))
	const chart_area_w	= width - legend_width
	const height		= Math.max(260, Math.min(360, chart_area_w))
	const radius		= Math.min(chart_area_w, height) / 2 - 12
	const inner_radius	= radius * 0.55

	const svg = d3.select(host)
		.append('svg')
		.attr('class', 'area_dashboard_chart_svg')
		.attr('viewBox', `0 0 ${width} ${height}`)
		.attr('preserveAspectRatio', 'xMinYMin meet')

	const g = svg.append('g')
		.attr('transform', `translate(${chart_area_w / 2}, ${height / 2})`)

	const pie = d3.pie()
		.value(d => d.total)
		.sort(null)

	const arc = d3.arc()
		.innerRadius(inner_radius)
		.outerRadius(radius)

	const arc_hover = d3.arc()
		.innerRadius(inner_radius)
		.outerRadius(radius + 4)

	const slices = g.selectAll('path')
		.data(pie(rows))
		.join('path')
		.attr('class', 'area_dashboard_chart_pie_slice')
		.attr('d', arc)
		.attr('fill', d => d.data.color || '#3b82f6')
		.attr('stroke', 'var(--bg_elevated)')
		.attr('stroke-width', 1.5)
		.style('cursor', d => d.data._is_other ? 'default' : 'pointer')
		.attr('tabindex', d => d.data._is_other ? null : 0)
		.attr('role', d => d.data._is_other ? null : 'link')
		.on('mouseenter', function(_event, d) {
			d3.select(this).transition().duration(120).attr('d', arc_hover(d))
		})
		.on('mouseleave', function(_event, d) {
			d3.select(this).transition().duration(120).attr('d', arc(d))
		})
		.on('click', function(event, d) {
			if (d.data._is_other) return
			navigate_to_section(d.data, event)
		})
		.on('keydown', function(event, d) {
			if (d.data._is_other) return
			if (event.key === 'Enter' || event.key === ' ') {
				event.preventDefault()
				navigate_to_section(d.data, event)
			}
		})

	slices.append('title')
		.text(d => {
			const pct = grand_total > 0 ? ((d.data.total / grand_total) * 100).toFixed(1) : '0'
			const suffix = d.data._is_other ? '' : ' — click to open'
			return `${d.data.label}: ${format_number(d.data.total)} (${pct}%)${suffix}`
		})

	// Center label: grand total
	g.append('text')
		.attr('class', 'area_dashboard_chart_pie_total')
		.attr('text-anchor', 'middle')
		.attr('dy', '-0.1em')
		.text(format_number(grand_total))

	g.append('text')
		.attr('class', 'area_dashboard_chart_pie_total_label')
		.attr('text-anchor', 'middle')
		.attr('dy', '1.2em')
		.text('records')

	// Legend on the right
	const legend = document.createElement('div')
	legend.classList.add('area_dashboard_chart_pie_legend')
	legend.style.width = legend_width + 'px'
	for (const r of rows) {
		const item = document.createElement('div')
		item.classList.add('area_dashboard_chart_pie_legend_item')
		if (!r._is_other) {
			item.classList.add('is_clickable')
			item.setAttribute('role', 'link')
			item.setAttribute('tabindex', '0')
			item.addEventListener('click', (e) => navigate_to_section(r, e))
			item.addEventListener('keydown', (e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault()
					navigate_to_section(r, e)
				}
			})
		}
		const dot = document.createElement('span')
		dot.classList.add('area_dashboard_chart_pie_legend_dot')
		dot.style.backgroundColor = r.color || '#3b82f6'
		item.appendChild(dot)
		const lbl = document.createElement('span')
		lbl.classList.add('area_dashboard_chart_pie_legend_label')
		lbl.textContent = truncate(r.label, 28)
		lbl.title = r.label
		item.appendChild(lbl)
		const val = document.createElement('span')
		val.classList.add('area_dashboard_chart_pie_legend_value')
		val.textContent = format_number(r.total)
		item.appendChild(val)
		legend.appendChild(item)
	}

	// Wrap svg + legend into a flex layout. d3 attached the svg to `host`
	// already; move it into the layout container so they sit side-by-side.
	const layout = document.createElement('div')
	layout.classList.add('area_dashboard_chart_pie_layout')
	layout.appendChild(svg.node())
	layout.appendChild(legend)
	host.appendChild(layout)
}//end render_pie_chart



/**
* RENDER_TREEMAP_CHART
* Treemap of section totals: each rectangle's area is proportional to the
* section's total. Useful when there are many sections with widely different
* sizes. Rectangles are clickable (SPA navigation).
* @param object d3
* @param HTMLElement host
* @param object dashboard_data
* @return void
*/
const render_treemap_chart = function(d3, host, dashboard_data) {

	const rows = dashboard_data.sections
		.filter(s => typeof s.total === 'number' && s.total > 0)
		.sort((a, b) => b.total - a.total)

	if (rows.length === 0) return

	const width		= host.offsetWidth > 0 ? host.offsetWidth : (host.clientWidth || 800)
	const height	= Math.max(280, Math.min(440, Math.round(width * 0.5)))
	const grand_total = rows.reduce((acc, s) => acc + s.total, 0)

	// d3.hierarchy from a synthetic root
	const root = d3.hierarchy({ children: rows })
		.sum(d => d.total || 0)
		.sort((a, b) => b.value - a.value)

	d3.treemap()
		.size([width, height])
		.paddingInner(2)
		.round(true)(root)

	const container = document.createElement('div')
	container.classList.add('area_dashboard_chart_treemap')
	container.style.position = 'relative'
	container.style.width = width + 'px'
	container.style.height = height + 'px'

	for (const leaf of root.leaves()) {

		const d = leaf.data
		const w = leaf.x1 - leaf.x0
		const h = leaf.y1 - leaf.y0
		if (w <= 0 || h <= 0) continue

		const tile = document.createElement('div')
		tile.classList.add('area_dashboard_chart_treemap_tile')
		tile.style.left		= leaf.x0 + 'px'
		tile.style.top		= leaf.y0 + 'px'
		tile.style.width	= w + 'px'
		tile.style.height	= h + 'px'
		tile.style.backgroundColor = d.color || '#3b82f6'

		const pct = grand_total > 0 ? ((d.total / grand_total) * 100).toFixed(1) : '0'
		tile.title = `${d.label}: ${format_number(d.total)} (${pct}%) — click to open`
		tile.setAttribute('role', 'link')
		tile.setAttribute('tabindex', '0')
		tile.addEventListener('click', (e) => navigate_to_section(d, e))
		tile.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault()
				navigate_to_section(d, e)
			}
		})

		// Only show text when the tile is big enough
		if (w >= 70 && h >= 30) {
			const lbl = document.createElement('div')
			lbl.classList.add('area_dashboard_chart_treemap_label')
			lbl.textContent = d.label
			tile.appendChild(lbl)

			if (h >= 46) {
				const val = document.createElement('div')
				val.classList.add('area_dashboard_chart_treemap_value')
				val.textContent = format_number(d.total)
				tile.appendChild(val)
			}
		}

		container.appendChild(tile)
	}

	host.appendChild(container)
}//end render_treemap_chart



/**
* RENDER_SUNBURST_CHART
* Two-ring sunburst:
*   - Inner ring: sections grouped by `model` (area_label at the center).
*   - Outer ring: individual sections, colored with their assigned color.
* Outer-ring slices are clickable for SPA navigation; inner-ring slices
* are informational (hover shows total + percentage).
* @param object d3
* @param HTMLElement host
* @param object dashboard_data
* @return void
*/
const render_sunburst_chart = function(d3, host, dashboard_data) {

	const rows = dashboard_data.sections
		.filter(s => typeof s.total === 'number' && s.total > 0)

	if (rows.length === 0) return

	// Group sections by model.
	const by_model = new Map()
	for (const s of rows) {
		const model = s.model || 'section'
		if (!by_model.has(model)) by_model.set(model, [])
		by_model.get(model).push(s)
	}

	// Hierarchy: root → model groups → sections.
	const hierarchy_data = {
		name		: dashboard_data.area_label || dashboard_data.area_tipo || 'Area',
		_is_root	: true,
		children	: Array.from(by_model.entries()).map(([model, sections]) => ({
			name		: model,
			_is_group	: true,
			_model		: model,
			children	: sections.map(s => ({
				name			: s.label,
				section			: s,			// carry original section for click navigation
				value			: s.total
			}))
		}))
	}

	const grand_total = rows.reduce((acc, s) => acc + s.total, 0)

	// Dimensions
	const width		= host.offsetWidth > 0 ? host.offsetWidth : (host.clientWidth || 600)
	const size		= Math.max(280, Math.min(440, width))
	const radius	= size / 2

	const root = d3.hierarchy(hierarchy_data)
		.sum(d => d.value || 0)
		.sort((a, b) => b.value - a.value)

	d3.partition().size([2 * Math.PI, radius])(root)

	const arc = d3.arc()
		.startAngle(d => d.x0)
		.endAngle(d => d.x1)
		.padAngle(0.005)
		.padRadius(radius / 2)
		.innerRadius(d => d.y0)
		.outerRadius(d => d.y1 - 1)

	// Average a list of hex colors for the inner-ring group color.
	const average_hex = function(hex_list) {
		if (!hex_list.length) return '#94a3b8'
		let r = 0, g = 0, b = 0, n = 0
		for (const hex of hex_list) {
			const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '')
			if (!m) continue
			r += parseInt(m[1], 16); g += parseInt(m[2], 16); b += parseInt(m[3], 16); n++
		}
		if (n === 0) return '#94a3b8'
		r = Math.round(r / n); g = Math.round(g / n); b = Math.round(b / n)
		return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`
	}

	// Resolve a fill color for any node.
	const fill_for = function(d) {
		if (d.data._is_root) return 'transparent'
		if (d.data._is_group) {
			const child_colors = (d.children || []).map(c => c.data.section && c.data.section.color)
			return average_hex(child_colors.filter(Boolean))
		}
		return (d.data.section && d.data.section.color) || '#3b82f6'
	}

	const svg = d3.select(host)
		.append('svg')
		.attr('class', 'area_dashboard_chart_svg area_dashboard_chart_sunburst')
		.attr('viewBox', `${-radius} ${-radius} ${size} ${size}`)
		.attr('preserveAspectRatio', 'xMidYMid meet')
		.attr('width', size)
		.attr('height', size)
		.style('width', size + 'px')
		.style('height', size + 'px')
		.style('max-width', '100%')
		.style('margin', '0 auto')
		.style('display', 'block')

	const slices = svg.append('g')
		.selectAll('path')
		.data(root.descendants().filter(d => d.depth > 0))
		.join('path')
		.attr('class', 'area_dashboard_chart_sunburst_slice')
		.attr('d', arc)
		.attr('fill', fill_for)
		.attr('stroke', 'var(--bg_elevated)')
		.attr('stroke-width', 1.25)
		.attr('opacity', d => d.data._is_group ? 0.65 : 0.95)
		.style('cursor', d => d.data.section ? 'pointer' : 'default')
		.attr('tabindex', d => d.data.section ? 0 : null)
		.attr('role', d => d.data.section ? 'link' : null)
		.on('click', function(event, d) {
			if (d.data.section) navigate_to_section(d.data.section, event)
		})
		.on('keydown', function(event, d) {
			if (d.data.section && (event.key === 'Enter' || event.key === ' ')) {
				event.preventDefault()
				navigate_to_section(d.data.section, event)
			}
		})

	slices.append('title')
		.text(d => {
			const val = d.value || 0
			const pct = grand_total > 0 ? ((val / grand_total) * 100).toFixed(1) : '0'
			if (d.data._is_group) {
				const n = (d.children || []).length
				return `${d.data.name} (${n} section${n===1?'':'s'}): ${format_number(val)} (${pct}%)`
			}
			return `${d.data.name}: ${format_number(val)} (${pct}%) — click to open`
		})

	// Slice labels (only when slice is large enough)
	svg.append('g')
		.attr('class', 'area_dashboard_chart_sunburst_labels')
		.attr('pointer-events', 'none')
		.selectAll('text')
		.data(root.descendants().filter(d => d.depth > 0 && (d.x1 - d.x0) > 0.18))
		.join('text')
		.attr('transform', d => {
			const angle = (d.x0 + d.x1) / 2 - Math.PI / 2
			const r = (d.y0 + d.y1) / 2
			const rotate = angle * 180 / Math.PI
			const flip = rotate > 90 ? 180 : 0
			return `rotate(${rotate}) translate(${r},0) rotate(${flip})`
		})
		.attr('text-anchor', 'middle')
		.attr('dy', '0.35em')
		.text(d => {
			const max_chars = d.depth === 1 ? 12 : 14
			return truncate(d.data.name, max_chars)
		})

	// Center label (area name + grand total)
	const center = svg.append('g')
		.attr('class', 'area_dashboard_chart_sunburst_center')
		.attr('pointer-events', 'none')

	center.append('text')
		.attr('class', 'area_dashboard_chart_pie_total')
		.attr('text-anchor', 'middle')
		.attr('dy', '-0.2em')
		.text(format_number(grand_total))

	center.append('text')
		.attr('class', 'area_dashboard_chart_pie_total_label')
		.attr('text-anchor', 'middle')
		.attr('dy', '1.1em')
		.text(truncate(hierarchy_data.name, 22))
}//end render_sunburst_chart



/**
* RENDER_ACTIVITY_TIMELINE
* Stacked area chart showing daily activity over a selectable time range.
* Each coloured band = one section; height = number of actions that day.
*
* Default range (1 month) is pre-loaded in the dashboard payload.
* Larger ranges (3m, 6m, 1y) are fetched on-demand via the
* `get_activity_metric` API action and cached client-side.
*
* Data source: dashboard_data.activity_30d = {
*   days: [{ date, by_section: {tipo: N}, by_user: {id: N} }],
*   users: [{ id, label }],
*   available_ranges: [{ key, label, days }]
* }
*
* @param object d3
* @param HTMLElement host
* @param object dashboard_data
* @return void
*/
const render_activity_timeline = function(d3, host, dashboard_data) {

	const activity	= dashboard_data.activity_30d
	if (!activity || !Array.isArray(activity.days) || activity.days.length === 0) return

	// Build section colour map from existing dashboard sections
	const section_color = {}
	for (const s of dashboard_data.sections) {
		section_color[s.section_tipo] = s.color || '#3b82f6'
	}

	// Build section label map (from all dashboard sections, not just current data)
	const section_label = {}
	for (const s of dashboard_data.sections) {
		section_label[s.section_tipo] = s.label
	}

	// Ranges from server payload (fallback if missing)
	const ranges = activity.available_ranges || [
		{ key: '1m', label: '1 month',  days: 30 },
		{ key: '3m', label: '3 months', days: 90 },
		{ key: '6m', label: '6 months', days: 180 },
		{ key: '1y', label: '1 year',   days: 365 }
	]
	const default_key = '1m'

	// Client-side cache: { range_key: activity_data }
	const cache = {}
	cache[default_key] = activity

	// ---- Header row: title + chart-type switcher + range selector ----
	const header_row = document.createElement('div')
	header_row.classList.add('area_dashboard_activity_header')

	const title = document.createElement('div')
	title.classList.add('area_dashboard_chart_title')
	title.textContent = 'Activity'
	header_row.appendChild(title)

	// Chart-type switcher (Area / Bars / Line). Persisted in localStorage.
	const CHART_STORAGE_KEY = 'dedalo_dashboard_activity_chart_type'
	const chart_types = [
		{ key: 'area',  label: 'Area'  },
		{ key: 'bars',  label: 'Bars'  },
		{ key: 'line',  label: 'Line'  }
	]
	let chart_type = 'area'
	try {
		const stored = window.localStorage.getItem(CHART_STORAGE_KEY)
		if (stored && chart_types.some(t => t.key === stored)) {
			chart_type = stored
		}
	} catch (_e) { /* localStorage unavailable */ }

	const switcher = document.createElement('div')
	switcher.classList.add('area_dashboard_chart_switcher')
	switcher.setAttribute('role', 'tablist')
	const switcher_buttons = {}
	for (const t of chart_types) {
		const btn = document.createElement('button')
		btn.type = 'button'
		btn.classList.add('area_dashboard_chart_switcher_btn')
		btn.setAttribute('role', 'tab')
		btn.dataset.type = t.key
		btn.textContent = t.label
		btn.addEventListener('click', () => {
			if (t.key === chart_type) return
			chart_type = t.key
			try { window.localStorage.setItem(CHART_STORAGE_KEY, chart_type) } catch (_e) { /* noop */ }
			update_switcher_active()
			// Re-render with currently displayed dataset (cached by range key)
			const data = cache[select.value] || activity
			if (data) draw(data)
		})
		switcher_buttons[t.key] = btn
		switcher.appendChild(btn)
	}
	const update_switcher_active = function() {
		for (const t of chart_types) {
			switcher_buttons[t.key].classList.toggle('is_active', t.key === chart_type)
			switcher_buttons[t.key].setAttribute('aria-selected', t.key === chart_type ? 'true' : 'false')
		}
	}
	update_switcher_active()
	header_row.appendChild(switcher)

	const select = document.createElement('select')
	select.classList.add('area_dashboard_activity_range_select')
	for (const r of ranges) {
		const opt = document.createElement('option')
		opt.value = r.key
		opt.textContent = r.label
		if (r.key === default_key) opt.selected = true
		select.appendChild(opt)
	}
	header_row.appendChild(select)
	host.appendChild(header_row)

	// ---- Chart container (cleared + re-rendered on range change) ----
	const chart_container = document.createElement('div')
	chart_container.classList.add('area_dashboard_activity_chart_container')
	host.appendChild(chart_container)

	// Loading indicator
	const show_loading = function() {
		chart_container.innerHTML = ''
		const loader = document.createElement('div')
		loader.classList.add('area_dashboard_activity_loading')
		loader.textContent = 'Loading...'
		chart_container.appendChild(loader)
	}

	// Inner render function — draws the stacked area for a given activity dataset
	const draw = function(activity_data) {

		chart_container.innerHTML = ''

		if (!activity_data || !Array.isArray(activity_data.days) || activity_data.days.length === 0) return

		// Collect section tipos from this dataset
		const section_tipos = [...new Set(
			activity_data.days.flatMap(d => Object.keys(d.by_section || {}))
		)]
		if (section_tipos.length === 0) return

		// Transform data into D3 stack format
		const series_data = activity_data.days.map(d => {
			const row = { date: d.date }
			for (const tipo of section_tipos) {
				row[tipo] = (d.by_section && d.by_section[tipo]) || 0
			}
			return row
		})

		// Dimensions — offsetWidth forces a synchronous layout and is more reliable
		// than getBoundingClientRect when the element was recently inserted.
		const width	= chart_container.offsetWidth > 0 ? chart_container.offsetWidth : (chart_container.clientWidth || host.clientWidth || 800)
		const height	= 260
		const padding_top	= 28
		const padding_bottom= 36
		const padding_left	= 48
		const padding_right	= 16
		const inner_w		= width - padding_left - padding_right
		const inner_h		= height - padding_top - padding_bottom

		// Scales
		const dates = series_data.map(d => d.date)
		const x = d3.scaleTime()
			.domain(d3.extent(dates, d => new Date(d)))
			.range([0, inner_w])

		// Y-domain depends on chart_type:
		//   - 'area' / 'bars' (stacked): max of summed daily totals
		//   - 'line' (not stacked):      max single-section value across all days
		let max_y
		if (chart_type === 'line') {
			max_y = d3.max(series_data, d => {
				let m = 0; for (const k of section_tipos) if (d[k] > m) m = d[k]; return m
			}) || 1
		} else {
			max_y = d3.max(series_data, d => {
				let sum = 0; for (const k of section_tipos) sum += d[k]; return sum
			}) || 1
		}

		const y = d3.scaleLinear()
			.domain([0, max_y])
			.nice()
			.range([inner_h, 0])

		// SVG
		const svg = d3.select(chart_container)
			.append('svg')
			.attr('class', 'area_dashboard_activity_svg')
			.attr('viewBox', `0 0 ${width} ${height}`)
			.attr('preserveAspectRatio', 'xMinYMin meet')

		const g = svg.append('g')
			.attr('transform', `translate(${padding_left},${padding_top})`)

		// Gridlines
		const y_ticks = y.ticks(Math.min(5, Math.max(2, Math.floor(inner_h / 50))))
		g.append('g')
			.attr('class', 'area_dashboard_chart_grid')
			.selectAll('line')
			.data(y_ticks)
			.join('line')
			.attr('x1', 0).attr('x2', inner_w)
			.attr('y1', d => y(d)).attr('y2', d => y(d))

		// Layers — dispatch by chart_type
		const layers_g = g.append('g')
			.attr('class', 'area_dashboard_activity_layers')

		if (chart_type === 'bars') {

			// Stacked bars: one column per day, sections stacked vertically.
			const stack = d3.stack()
				.keys(section_tipos)
				.order(d3.stackOrderNone)
				.offset(d3.stackOffsetNone)
			const layers = stack(series_data)

			// Bar width based on day span. Leave a 1px gap for readability.
			const day_step = series_data.length > 1
				? Math.abs(x(new Date(series_data[1].date)) - x(new Date(series_data[0].date)))
				: inner_w
			const bar_w = Math.max(1, day_step - 1)

			layers_g.selectAll('g.area_dashboard_activity_bar_layer')
				.data(layers)
				.join('g')
				.attr('class', 'area_dashboard_activity_bar_layer')
				.attr('fill', d => section_color[d.key] || '#3b82f6')
				.each(function(layer) {
					d3.select(this).selectAll('rect')
						.data(layer)
						.join('rect')
						.attr('x', d => x(new Date(d.data.date)) - bar_w / 2)
						.attr('y', d => y(d[1]))
						.attr('width', bar_w)
						.attr('height', d => Math.max(0, y(d[0]) - y(d[1])))
						.attr('opacity', 0.85)
						.append('title')
						.text(d => `${section_label[layer.key] || layer.key} · ${d.data.date}: ${format_number(d.data[layer.key] || 0)}`)
				})

		} else if (chart_type === 'line') {

			// Multi-line (one line per section, not stacked).
			const line = d3.line()
				.x(d => x(new Date(d.date)))
				.y(d => y(d.value))
				.curve(d3.curveMonotoneX)

			const series = section_tipos.map(tipo => ({
				tipo,
				values: series_data.map(d => ({ date: d.date, value: d[tipo] || 0 }))
			}))

			layers_g.selectAll('path')
				.data(series)
				.join('path')
				.attr('class', 'area_dashboard_activity_line')
				.attr('fill', 'none')
				.attr('stroke', d => section_color[d.tipo] || '#3b82f6')
				.attr('stroke-width', 1.75)
				.attr('stroke-linecap', 'round')
				.attr('stroke-linejoin', 'round')
				.attr('d', d => line(d.values))
				.append('title')
				.text(d => section_label[d.tipo] || d.tipo)

		} else {

			// Default: stacked area
			const stack = d3.stack()
				.keys(section_tipos)
				.order(d3.stackOrderNone)
				.offset(d3.stackOffsetNone)
			const layers = stack(series_data)

			const area = d3.area()
				.x(d => x(new Date(d.data.date)))
				.y0(d => y(d[0]))
				.y1(d => y(d[1]))
				.curve(d3.curveMonotoneX)

			layers_g.selectAll('path')
				.data(layers)
				.join('path')
				.attr('fill', d => section_color[d.key] || '#3b82f6')
				.attr('d', area)
				.attr('opacity', 0.82)
				.append('title')
				.text(d => section_label[d.key] || d.key)
		}

		// X-axis
		const x_tick_count = Math.min(6, Math.max(2, Math.floor(inner_w / 100)))
		g.append('g')
			.attr('class', 'area_dashboard_chart_axis')
			.attr('transform', `translate(0, ${inner_h})`)
			.call(
				d3.axisBottom(x)
					.ticks(x_tick_count)
					.tickFormat(d3.timeFormat('%b %d'))
			)
			.selectAll('text')
			.style('fill', 'var(--fg_muted)')
			.style('font-size', '10px')

		g.selectAll('.domain').remove()

		// Y-axis
		g.append('g')
			.attr('class', 'area_dashboard_chart_axis')
			.call(
				d3.axisLeft(y)
					.ticks(y_ticks.length)
					.tickFormat(d => format_number(d))
			)
			.selectAll('text')
			.style('fill', 'var(--fg_muted)')
			.style('font-size', '10px')

		// Legend
		const legend = document.createElement('div')
		legend.classList.add('area_dashboard_activity_legend')
		for (const tipo of section_tipos) {
			const item = document.createElement('span')
			item.classList.add('area_dashboard_activity_legend_item')
			const dot = document.createElement('span')
			dot.classList.add('area_dashboard_activity_legend_dot')
			dot.style.backgroundColor = section_color[tipo] || '#3b82f6'
			item.appendChild(dot)
			const lbl = document.createElement('span')
			lbl.textContent = section_label[tipo] || tipo
			item.appendChild(lbl)
			legend.appendChild(item)
		}
		chart_container.appendChild(legend)

		// User breakdown (aggregated for the selected range only)
		if (activity_data.users && activity_data.users.length > 0) {
			const user_totals = {}
			for (const day of activity_data.days) {
				if (!day.by_user) continue
				for (const [uid, count] of Object.entries(day.by_user)) {
					user_totals[uid] = (user_totals[uid] || 0) + count
				}
			}

			const user_label_map = {}
			for (const u of activity_data.users) {
				user_label_map[u.id] = u.label
			}

			const sorted = Object.entries(user_totals)
				.sort((a, b) => b[1] - a[1])
				.slice(0, 5)

			if (sorted.length > 0) {
				const user_table = document.createElement('div')
				user_table.classList.add('area_dashboard_activity_users')
				for (const [uid, total] of sorted) {
					const row = document.createElement('div')
					row.classList.add('area_dashboard_activity_user_row')
					row.innerHTML = `<span class="area_dashboard_activity_user_name">${user_label_map[uid] || ('User #' + uid)}</span>`
						+ `<span class="area_dashboard_activity_user_count">${format_number(total)}</span>`
					user_table.appendChild(row)
				}
				chart_container.appendChild(user_table)
			}
		}
	}//end draw

	// Fetch activity data for a range key (on-demand, cached)
	const fetch_range = async function(range_key) {

		// Return cached data if available
		if (cache[range_key]) return cache[range_key]

		const range = ranges.find(r => r.key === range_key)
		if (!range || !range.days) return null

		// Call the API
		const rqo = {
			action	: 'get_activity_metric',
			dd_api	: 'dd_core_api',
			options	: {
				area_tipo	: dashboard_data.area_tipo,
				range_days	: range.days
			}
		}

		try {
			const api_response = await data_manager.request({ body: rqo })
			if (api_response && api_response.result === true && api_response.data) {
				cache[range_key] = api_response.data
				return api_response.data
			}
		} catch (err) {
			if (typeof SHOW_DEBUG !== 'undefined' && SHOW_DEBUG === true) {
				console.warn('Dashboard: activity metric fetch failed.', err)
			}
		}
		return null
	}

	// Helper: check if a dataset has any actual activity
	const has_any_activity = function(activity_data) {
		if (!activity_data || !Array.isArray(activity_data.days)) return false
		return activity_data.days.some(d => Object.keys(d.by_section || {}).length > 0)
	}

	// Initial render (1 month — pre-loaded, no API call)
	// If the 1-month range is empty, auto-switch to the next wider range.
	if (has_any_activity(activity)) {
		draw(activity)
	} else {
		const next_range = ranges.find(r => r.days > ranges.find(r2 => r2.key === default_key).days)
		if (next_range) {
			select.value = next_range.key
			show_loading()
			fetch_range(next_range.key).then(data => {
				if (data) {
					draw(data)
				} else {
					draw(activity)
				}
			})
		} else {
			draw(activity)
		}
	}

	// Re-render on range change (on-demand fetch for larger ranges)
	select.addEventListener('change', async () => {
		const key = select.value

		// 1m is always pre-loaded
		if (key === default_key) {
			draw(cache[default_key])
			return
		}

		// Show loading state
		show_loading()

		// Fetch (or use cache) and render
		const data = await fetch_range(key)
		if (data) {
			draw(data)
		} else {
			// Fallback: re-render default
			draw(cache[default_key])
		}
	})
}//end render_activity_timeline



/**
* LOAD_D3
* Lazy import the bundled D3 build. Returns the d3 namespace or null on failure.
* @return Promise<object|null>
*/
const load_d3 = async function() {

	// Cached on window to avoid multiple imports across area page loads
	if (typeof window !== 'undefined' && window.__dedalo_d3) {
		return window.__dedalo_d3
	}

	const base = (typeof DEDALO_ROOT_WEB !== 'undefined' && DEDALO_ROOT_WEB)
		? DEDALO_ROOT_WEB
		: ''
	const url = base + '/lib/d3/d3-7.9.0/dist/d3.min.js'

	try {
		const mod = await import(url)
		// d3 UMD bundle exposes everything on the module (or window.d3 as fallback)
		const d3 = mod && (mod.default || mod)
		const resolved = (d3 && d3.select) ? d3 : (typeof window!=='undefined' ? window.d3 : null)
		if (typeof window !== 'undefined') {
			window.__dedalo_d3 = resolved
		}
		return resolved
	} catch (e) {
		if (typeof SHOW_DEBUG!=='undefined' && SHOW_DEBUG===true) {
			console.warn('Dashboard: failed to load D3 from', url, e)
		}
		return null
	}
}//end load_d3



/**
* BUILD_SECTION_URL
* Returns a URL pointing to the section list page for the given section descriptor.
* Used by cards for alt+click new-tab behaviour. Mirrors the menu tree URL pattern.
* @param object section
* @return string
*/
const build_section_url = function(section) {

	const base = (typeof window !== 'undefined' && window.location.pathname)
		? window.location.pathname
		: ''

	return `${base}?tipo=${encodeURIComponent(section.section_tipo)}&mode=list`
}//end build_section_url



/**
* FORMAT_NUMBER
* Locale-aware grouping (e.g. 12,345). Falls back to plain string.
* @param number n
* @return string
*/
const format_number = function(n) {

	if (typeof n !== 'number' || !isFinite(n)) {
		return String(n ?? '')
	}
	try {
		return new Intl.NumberFormat().format(n)
	} catch (_e) {
		return String(n)
	}
}//end format_number



/**
* TRUNCATE
* Clamp string length, append ellipsis when cut.
* @param string s
* @param number max
* @return string
*/
const truncate = function(s, max) {

	if (typeof s !== 'string') return ''
	if (s.length <= max) return s

	return s.slice(0, Math.max(0, max - 1)) + '…'
}//end truncate



// @license-end
