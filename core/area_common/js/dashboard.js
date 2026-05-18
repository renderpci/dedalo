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

	// kpi cards grid
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
						render_bar_chart(d3, chart_host, dashboard_data)
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
* One KPI card per section: color stripe, label, big number, model.
* Each card is clickable: navigates to the section page using Dédalo's
* event-driven SPA navigation (user_navigation).
* @param object self
* @param object dashboard_data
* @return HTMLElement
*/
const build_cards = function(self, dashboard_data) {

	const grid = document.createElement('div')
	grid.classList.add('area_dashboard_grid')

	for (const section of dashboard_data.sections) {

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

		// meta (tipo + model)
		const meta = document.createElement('div')
		meta.classList.add('area_dashboard_card_meta')
		meta.textContent = `${section.section_tipo} · ${section.model || ''}`.trim()
		card.appendChild(meta)

		grid.appendChild(card)
	}


	return grid
}//end build_cards



/**
* RENDER_BAR_CHART
* Horizontal bar chart comparing section totals. Pure D3 (no external deps).
* @param object d3
* @param HTMLElement host
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

	// title
	const title = document.createElement('div')
	title.classList.add('area_dashboard_chart_title')
	title.textContent = 'Records by section'
	host.appendChild(title)

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

	// bars
	const bars = svg.append('g')
		.attr('class', 'area_dashboard_chart_bars')
		.selectAll('g')
		.data(visible_rows)
		.join('g')
		.attr('transform', d => `translate(0, ${y(d.section_tipo)})`)

	bars.append('text')
		.attr('class', 'area_dashboard_chart_label')
		.attr('x', padding_left - 10)
		.attr('y', y.bandwidth() / 2)
		.attr('dy', '0.35em')
		.attr('text-anchor', 'end')
		.text(d => truncate(d.label, 26))
		.append('title')
		.text(d => `${d.label} (${d.section_tipo})`)

	bars.append('rect')
		.attr('x', padding_left)
		.attr('y', 0)
		.attr('width', d => Math.max(1, x(d.total) - padding_left))
		.attr('height', y.bandwidth())
		.attr('fill', d => d.color || '#3b82f6')
		.append('title')
		.text(d => `${d.label}: ${format_number(d.total)}`)

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

	// ---- Header row: title + range selector ----
	const header_row = document.createElement('div')
	header_row.classList.add('area_dashboard_activity_header')

	const title = document.createElement('div')
	title.classList.add('area_dashboard_chart_title')
	title.textContent = 'Activity'
	header_row.appendChild(title)

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

		const max_total = d3.max(series_data, d => {
			let sum = 0; for (const k of section_tipos) sum += d[k]; return sum
		}) || 1

		const y = d3.scaleLinear()
			.domain([0, max_total])
			.nice()
			.range([inner_h, 0])

		// Stack
		const stack = d3.stack()
			.keys(section_tipos)
			.order(d3.stackOrderNone)
			.offset(d3.stackOffsetNone)

		const layers = stack(series_data)

		// Area
		const area = d3.area()
			.x(d => x(new Date(d.data.date)))
			.y0(d => y(d[0]))
			.y1(d => y(d[1]))
			.curve(d3.curveMonotoneX)

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

		// Layers
		g.append('g')
			.attr('class', 'area_dashboard_activity_layers')
			.selectAll('path')
			.data(layers)
			.join('path')
			.attr('fill', d => section_color[d.key] || '#3b82f6')
			.attr('d', area)
			.attr('opacity', 0.82)
			.append('title')
			.text(d => section_label[d.key] || d.key)

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
