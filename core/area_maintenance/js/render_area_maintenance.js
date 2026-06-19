// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



/**
* RENDER_AREA_MAINTENANCE
* Client-side rendering layer for the Dédalo maintenance area (area_maintenance).
*
* This module is responsible for the visual shell of the administrator dashboard.
* It is paired with `area_maintenance.js` (which owns the lifecycle: init / build /
* render / refresh / destroy) and with the server-side `class.area_maintenance.php`
* (which produces the widget datalist consumed here).
*
* Architecture overview
* ---------------------
* The server delivers a flat `datalist` array of widget descriptor objects via the
* standard Dédalo JSON API.  Each descriptor carries:
*   - `id`       {string}  widget identifier — also the ES-module filename and
*                          exported constructor name (e.g. `"make_backup"`).
*   - `label`    {string}  HTML display label supplied by `class.area_maintenance.php`.
*   - `category` {string}  bucket key matching one of the entries in `get_category_defs()`
*                          (e.g. `"data"`, `"migration"`, `"config"`, …).
*   - `class`    {string}  optional extra CSS class on the card (e.g. `"success"`).
*   - `background` {boolean} optional flag; when true the widget loads at idle priority
*                          even before the user opens the card accordion.
*   - `value`    {*}       optional widget-specific payload forwarded to `widget.init()`.
*
* Dashboard layout (introduced in maintenance_v2)
* -----------------------------------------------
* `get_content_data()` builds a two-level layout:
*   1. Sticky toolbar — live text search + category chip filters.
*   2. Category groups — one `<div class="maintenance_group">` per non-empty category,
*      each containing a labelled header and a grid of collapsible widget cards.
*
* Widget cards are individually lazy-loaded via `render_widget()`, which:
*   - Dynamically imports the widget ES module from `../widgets/<id>/js/<id>.js`.
*   - Runs the standard init → build → render lifecycle.
*   - Defers the `load()` call (data fetch) until the user opens the accordion,
*     except for "background" widgets which load at idle priority immediately.
*   - Persists the open/closed state of each card via `ui.collapse_toggle_track`.
*
* Public exports
* --------------
*   render_area_maintenance  — prototype constructor; `edit` and `list` prototypes
*                              are assigned onto `area_maintenance` in area_maintenance.js.
*   print_response           — formats and injects an API response object into a DOM node.
*   build_form               — generic widget form builder (inputs + submit + API call).
*   set_widget_label_style   — adds/removes a CSS class on the outer widget card.
*
* Server peer:  core/area_maintenance/class.area_maintenance.php
* Lifecycle:    area_maintenance.js (init / build / render / refresh / destroy)
* API:          dd_area_maintenance_api (action `get_data` → datalist)
*/

// imports
	import {when_in_dom, dd_request_idle_callback} from '../../common/js/events.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import {render_tree_data} from '../../common/js/common.js'
	import {ui} from '../../common/js/ui.js'
	import {widget_common} from '../../widgets/widget_common/js/widget_common.js'



/**
* RENDER_AREA_MAINTENANCE
* Prototype constructor for the maintenance-area render module.
*
* This constructor is intentionally a no-op; all rendering logic lives in the
* prototype methods `edit` and `list` below.  The constructor exists so that
* `area_maintenance.js` can assign these prototype methods onto the
* `area_maintenance` prototype using the standard Dédalo prototype-assignment
* pattern:
*
*   area_maintenance.prototype.edit = render_area_maintenance.prototype.edit
*   area_maintenance.prototype.list = render_area_maintenance.prototype.list
*
* Never instantiate `render_area_maintenance` directly; always call through
* an `area_maintenance` instance.
*/
export const render_area_maintenance = function() {

	return true
}//end render_area_maintenance



/**
* EDIT
* Builds the main DOM tree for the maintenance area in edit mode.
*
* Delegates the actual widget-grid construction to `get_content_data()` and
* then wraps the result in the standard area wrapper produced by `ui.area.build_wrapper_edit`.
* The wrapper exposes `wrapper.content_data` as a direct reference so that
* subsequent refresh cycles can surgically replace just the inner grid without
* rebuilding the full shell.
*
* When `options.render_level === 'content'` only the raw `content_data` element
* is returned (no wrapper), which is the pattern used by `common.prototype.refresh`
* to efficiently swap content in place.
*
* @param {Object} options - Render options bag forwarded by the lifecycle caller
* @param {string} [options.render_level='full'] - 'full' returns the complete wrapper;
*   'content' returns the inner content_data element only (used by refresh)
* @returns {Promise<HTMLElement>} The area wrapper element (render_level='full') or
*   the raw content_data element (render_level='content')
*/
render_area_maintenance.prototype.edit = async function(options) {

	const self = this

	const render_level = options.render_level || 'full'

	// content_data
		const content_data = get_content_data(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_edit returns component wrapper
		const wrapper =	ui.area.build_wrapper_edit(self, {
			content_data : content_data
		})
		// set pointers
		wrapper.content_data = content_data


	return wrapper
}//end edit



/**
* LIST
* Alias of `edit`. The maintenance area has no dedicated list view; the full
* widget dashboard is rendered in both edit and list contexts.
*
* @param {Object} options - Forwarded verbatim to `this.edit(options)`
* @returns {Promise<HTMLElement>} Result of `this.edit(options)`
*/
render_area_maintenance.prototype.list = async function(options) {

	return this.edit(options)
}//end list



/**
* GET_CATEGORY_DEFS
* Returns the canonical ordered list of maintenance widget category definitions.
*
* Each entry drives two things in `get_content_data()`:
*   1. The order in which category sections appear in the dashboard grid.
*   2. The human-readable label rendered in the group header and in the
*      category chip filter button.
*
* The `key` value must match the `category` property that `class.area_maintenance.php`
* assigns to each widget descriptor in `get_ar_widgets()` / `widget_factory()`.
* Widgets whose descriptor lacks a `category` property fall into the `'general'` bucket.
*
* Labels are sourced from `get_label` (the application's i18n dictionary).  The
* `|| 'fallback'` ensures the UI still renders meaningfully when a label key is
* missing from the active language file.
*
* @returns {Array<{key: string, label: string}>} Ordered category definition objects
*/
const get_category_defs = function() {

	return [
		{ key:'data',		label: get_label.maintenance_cat_data		|| 'Backup & data' },
		{ key:'migration',	label: get_label.maintenance_cat_migration	|| 'Migration & transform' },
		{ key:'config',		label: get_label.maintenance_cat_config		|| 'Configuration & code' },
		{ key:'integrity',	label: get_label.maintenance_cat_integrity	|| 'Integrity & monitoring' },
		{ key:'system',		label: get_label.maintenance_cat_system		|| 'System & environment' },
		{ key:'diffusion',	label: get_label.maintenance_cat_diffusion	|| 'Diffusion' },
		{ key:'dev',		label: get_label.maintenance_cat_dev		|| 'Developer & testing' },
		{ key:'general',	label: get_label.others						|| 'Other' }
	]
}//end get_category_defs



/**
* GET_CONTENT_DATA
* Builds the complete maintenance dashboard DOM tree.
*
* The dashboard consists of three layers:
*
*   1. Sticky toolbar (`<div class="maintenance_toolbar">`)
*        - A text search input whose `input` event is debounced through
*          `dd_request_idle_callback` to avoid layout thrashing during fast typing.
*        - Category chip buttons (one "All" chip plus one per non-empty category),
*          rendered in the order defined by `get_category_defs()`.
*
*   2. Category groups (`<div class="maintenance_groups">`)
*        - One `<div class="maintenance_group">` per category that has at least one
*          widget in the `self.widgets` datalist.
*        - Each group has a header (icon placeholder + label + widget count) and a
*          CSS grid of widget cards (`<div class="group_grid">`).
*        - Cards are loaded asynchronously via `ui.load_item_with_spinner`, which
*          shows a spinner while `render_widget()` resolves.
*
*   3. Empty state (`<div class="maintenance_empty">`)
*        - Hidden by default; toggled visible by `apply_filters()` whenever no card
*          matches the current search + category combination.
*
* Filter model
* ------------
* Two mutable closure variables drive visibility:
*   - `active_category` — set by chip clicks; empty string means "show all".
*   - `search_term`     — lowercase trimmed value of the search input.
*
* `apply_filters()` is the single point of truth: it iterates `group_nodes` and
* each group's `.widget_container` cards, applying `classList.toggle('filtered_out', !show)`
* to hide non-matching cards, and `classList.toggle('hide', …)` to collapse entire
* groups when all their cards are hidden.
*
* Widget card data attributes
* ---------------------------
* Each `.widget_container` element carries `data-category` and `data-label` (lowercase)
* so that `apply_filters()` can match without touching the widget instances themselves.
*
* @param {Object} self - The `area_maintenance` instance; must have `self.widgets`
*   (the `datalist` array from the API response) and `self.type` (for CSS class)
* @returns {HTMLElement} The fully constructed `content_data` div, ready to be
*   appended to the area wrapper by `edit()`
*/
const get_content_data = function(self) {

	const widgets = self.widgets || []

	// bucket widgets by category, preserving definition order within each bucket
		const buckets = {}
		for (let i = 0; i < widgets.length; i++) {
			const widget	= widgets[i]
			const cat		= widget.category || 'general'
			if (!buckets[cat]) {
				buckets[cat] = []
			}
			buckets[cat].push(widget)
		}

	// content_data
		const content_data = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_data maintenance_v2 ' + (self.type || '')
		})

	// filter state
		let active_category	= '' // '' === all
		let search_term		= ''

	// toolbar (sticky)
		const toolbar = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'maintenance_toolbar',
			parent			: content_data
		})
		const search_wrap = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'maintenance_search_wrap',
			parent			: toolbar
		})
		const search_input = ui.create_dom_element({
			element_type	: 'input',
			type			: 'search',
			class_name		: 'maintenance_search dd_input',
			placeholder		: (get_label.buscar || 'Search') + '…',
			parent			: search_wrap
		})
		const filters = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'maintenance_filters',
			parent			: toolbar
		})

	// groups container
		const groups = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'maintenance_groups',
			parent			: content_data
		})

	// filter chips ('All' + one per non-empty category)
		const chips = []
		const make_chip = (key, label) => {
			const chip = ui.create_dom_element({
				element_type	: 'button',
				class_name		: 'maintenance_chip' + (key==='' ? ' active' : ''),
				inner_html		: label,
				dataset			: { category: key },
				parent			: filters
			})
			chip.addEventListener('click', (e) => {
				e.preventDefault()
				active_category = key
				chips.forEach(c => c.classList.toggle('active', c===chip))
				apply_filters()
			})
			chips.push(chip)
		}
		make_chip('', get_label.todos || 'All')

	// build one section per non-empty category, in defined order
		const category_defs	= get_category_defs()
		const group_nodes	= []
		for (let c = 0; c < category_defs.length; c++) {

			const def	= category_defs[c]
			const list	= buckets[def.key]
			if (!list || !list.length) {
				continue
			}

			make_chip(def.key, def.label)

			// group
			const group = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'maintenance_group',
				dataset			: { category: def.key },
				parent			: groups
			})

			// group header (icon + label + count)
			const header = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'group_header',
				parent			: group
			})
			ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'group_icon',
				parent			: header
			})
			ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'group_label',
				inner_html		: def.label,
				parent			: header
			})
			ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'group_count',
				inner_html		: list.length,
				parent			: header
			})

			// grid of cards
			const grid = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'group_grid',
				parent			: group
			})

			for (let i = 0; i < list.length; i++) {

				const widget = list[i]

				// container (same structure/lifecycle as before; data-attrs added for filtering + category icon)
				const container = ui.create_dom_element({
					id				: widget.id,
					element_type	: 'div',
					dataset			: {
						category	: widget.category || 'general',
						label		: (widget.label || '').toLowerCase()
					},
					class_name		: 'widget_container ' + (widget.class || ''),
					parent			: grid
				})

				ui.load_item_with_spinner({
					container			: container,
					replace_container	: false,
					label				: (widget.label || '').replace(/<[^>]*>/g, ''),
					callback			: async () => {
						const node = await render_widget(widget, self)
						setTimeout(()=>{
							container.classList.add('loaded')
						}, 3)
						return node
					}
				})
			}

			group_nodes.push(group)
		}

	// empty state (shown when nothing matches the current filters)
		const empty_state = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'maintenance_empty hide',
			inner_html		: get_label.sin_resultados || 'No tools match your search',
			parent			: groups
		})

	// apply_filters. Combines active category chip + search term (AND)
		const apply_filters = () => {
			let any_visible = false
			for (let g = 0; g < group_nodes.length; g++) {

				const group		= group_nodes[g]
				const cat_ok	= !active_category || active_category===group.dataset.category

				let visible_in_group = 0
				const cards = group.querySelectorAll('.widget_container')
				for (let k = 0; k < cards.length; k++) {
					const card			= cards[k]
					const match_search	= !search_term || (card.dataset.label || '').includes(search_term)
					const show			= cat_ok && match_search
					card.classList.toggle('filtered_out', !show)
					if (show) {
						visible_in_group++
					}
				}

				group.classList.toggle('hide', visible_in_group===0)
				if (visible_in_group>0) {
					any_visible = true
				}
			}
			empty_state.classList.toggle('hide', any_visible)
		}

	// live search (debounced via idle callback)
		search_input.addEventListener('input', () => {
			dd_request_idle_callback(() => {
				search_term = search_input.value.trim().toLowerCase()
				apply_filters()
			})
		})


	return content_data
}//end content_data



/**
* RENDER_WIDGET
* Builds the accordion-style DOM fragment for a single maintenance widget card
* and runs the full widget lifecycle (init → build → render → deferred load).
*
* Structure of the returned fragment
* ------------------------------------
*   <DocumentFragment>
*     <div class="widget_label icon_arrow">…label HTML…</div>   ← accordion toggler
*     <div class="widget_body hide">                             ← accordion body (initially closed)
*       <div class="body_info">…widget.render() output…</div>
*     </div>
*   </DocumentFragment>
*
* The fragment is inserted directly into the `.widget_container` card by
* `ui.load_item_with_spinner` in `get_content_data()`.
*
* Widget module resolution
* ------------------------
* The widget ES module is located at `../widgets/<item.id>/js/<item.id>.js` relative
* to this file. The module **must** export a constructor whose name exactly matches
* `item.id` (e.g. `export const make_backup = function() {…}`). If the export does
* not exist, or if the import fails (404, network error), an error is logged and an
* empty fragment is returned — the card accordion shell is still rendered so the
* user sees the label but no body content.
*
* Lazy-load strategy
* ------------------
* `widget.build()` runs the shell construction without fetching data from the server.
* Data is fetched only when the accordion opens, via `trigger_load()` → `widget.load()`.
* Two exceptions:
*   - "Background" widgets (those in `background_widget_ids` OR with `item.background===true`)
*     call `trigger_load()` at idle priority via `dd_request_idle_callback` even while
*     closed, so that status information is visible as soon as the admin opens the area.
*   - Widgets whose accordion was left open in a previous session (open state persisted
*     by `ui.collapse_toggle_track`) have their body visible immediately; in this case
*     `expose_callback` fires before `widget_instance` is assigned, so an explicit
*     `trigger_load()` call after `widget_instance = widget` fills the gap.
*
* Alt-click shortcut
* ------------------
* Clicking the widget body while holding Alt triggers `widget_instance.refresh()`,
* which re-runs the full build → render → load cycle. This is a developer affordance
* and is not surfaced in the UI.
*
* Collapse persistence
* --------------------
* `ui.collapse_toggle_track` persists the open/closed state under the key
* `'collapsed_' + item.id` in the local IndexedDB store so the state survives page
* refreshes.
*
* @param {Object} item - Widget descriptor from the server datalist
* @param {string} item.id       - Widget identifier; used as module name and key
* @param {string} [item.label]  - Display label (may contain HTML)
* @param {string} [item.category] - Category bucket key
* @param {boolean} [item.background] - When true, load at idle priority before open
* @param {*} [item.value]       - Optional widget-specific payload forwarded to `widget.init()`
* @param {Object} self - The `area_maintenance` instance (provides section_tipo, lang, mode, etc.)
* @returns {Promise<DocumentFragment>} Fragment containing the accordion label + body;
*   body content is empty when the widget module fails to load
*/
const render_widget = async (item, self) => {

	const fragment = new DocumentFragment()

	// Validate item.id early to prevent issues with path construction and module loading.
	if (!item || !item.id) {
		console.error('RENDER_WIDGET Error: Widget item or item.id is missing.', item);
		return fragment; // Return an empty fragment or handle as appropriate
	}

	let widget_instance = null

	// background-status widgets load at idle priority even while collapsed,
	// so admins see status without opening them. Server may also flag via item.background.
	const background_widget_ids = ['system_info', 'update_data_version']
	const is_background = item.background===true || background_widget_ids.includes(item.id)

	// unified load trigger (uses the widget's own load() override if present,
	// else the shared widget_common default)
	const trigger_load = () => {
		if (!widget_instance) {
			return
		}
		const loader = (typeof widget_instance.load==='function')
			? widget_instance.load.bind(widget_instance)
			: widget_common.prototype.load.bind(widget_instance)
		loader()
	}

	// label
		const label = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'widget_label icon_arrow',
			inner_html		: item.label || '',
			parent			: fragment,
		})

	// body
		const body = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'widget_body hide',
			parent			: fragment
		})
		const click_handler = (e) => {
			e.stopPropagation()
			if(e.altKey) {
				widget_instance.refresh()
			}
		}
		body.addEventListener('click', click_handler)

	// collapse_toggle_track
		const collapse = () => {
			label.classList.remove('up')
		}
		const expose = () => {
			label.classList.add('up')
			// unified lazy load: fetch widget data only when opened
			trigger_load()
		}
		ui.collapse_toggle_track({
			toggler				: label,
			container			: body,
			collapsed_id		: 'collapsed_' + item.id,
			collapse_callback	: collapse,
			expose_callback		: expose,
			default_state		: 'closed'
		})

	// widget module check. Use if exists
		try {

			const path = `../widgets/${item.id}/js/${item.id}.js`

			const module = await import(path)

			// Ensure the module exports a constructor with the item.id name
			if (typeof module[item.id] !== 'function') {
				throw new Error(`Widget module for ID '${item.id}' found, but does not export a constructor named '${item.id}'.`);
			}

			// instance widget
			const widget = new module[item.id]()

			// init widget
			await widget.init({
				id				: item.id,
				section_tipo	: self.section_tipo,
				section_id		: self.section_id,
				lang			: self.lang,
				mode			: self.mode, // list
				model			: 'widget',
				name			: item.label,
				value			: item.value,
				caller			: self
			})

			// build shell only — no eager data fetch.
			// Data loads on open via trigger_load() (see expose / background below).
			await widget.build()

			// render
			const node = await widget.render()

			 // Ensure the rendered node is an element before adding class
			if (node instanceof Element) {
				// add CSS class for selection
				node.classList.add('body_info');

				body.appendChild(node)
			} else {
				console.warn(`Widget '${item.id}' render() did not return an HTML element. Cannot add 'body_info' class.`);
			}

			widget_instance = widget

			// background widgets: low-priority load while still collapsed
			if (is_background) {
				dd_request_idle_callback(() => {
					trigger_load()
				})
			} else if (!body.classList.contains('hide')) {
				// restored-open state: expose_callback may have fired before the
				// instance was ready, so ensure the load runs now.
				trigger_load()
			}

		} catch (error) {
			if (error.message.includes('Failed to fetch dynamically imported module') || error.message.includes('Cannot find module')) {
				console.error(`RENDER_WIDGET Error: Widget module for '${item.id}' could not be loaded or found. Path: ../widgets/${item.id}/js/${item.id}.js`, error);
			} else {
				console.error(`RENDER_WIDGET Error during widget '${item.id}' processing:`, error);
			}
		}


	return fragment
}//end render_widget



/**
* PRINT_RESPONSE
* Clears a result container and injects a formatted view of an API response.
*
* Called after any maintenance widget action completes (form submit, background worker
* finish, etc.) to display the outcome to the administrator.
*
* The container is first emptied; then three optional sections are inserted in order:
*   1. An "eraser" button (class `button reset eraser`) that clears the container again
*      on mouseup, allowing the admin to dismiss the result without re-running the action.
*   2. Error block — rendered only when `api_response.errors` is a non-empty array;
*      each error string is joined with `<br>` and rendered as inner HTML.
*   3. Message block — rendered from `api_response.msg`. Accepts either a string (with
*      `\\n` replaced by `<br>`) or an array of strings joined with `<br>`.
*      Falls back to `'Unknown API response error'` when `msg` is absent or falsy.
*   4. Tree view — the full `api_response` object rendered by `render_tree_data` into
*      a `<div class="pre">` for structured inspection.
*
* (!) `api_response` comes from the Dédalo worker bridge: its shape is:
*   `{ result, msg, errors, … }` where `errors` is always an array (possibly empty).
*   The function does not guard against a null `api_response`; callers must ensure
*   the argument is a valid object.
*
* @param {HTMLElement} container - The DOM node to populate; its existing children
*   are removed before rendering
* @param {Object} api_response - The API response object from `data_manager.request()`
* @param {string|string[]} [api_response.msg] - Human-readable result message(s)
* @param {string[]} [api_response.errors]     - Array of error message strings
* @returns {HTMLElement} The same `container` element, now populated
*/
export const print_response = (container, api_response) => {

	// clean container
		while (container.firstChild) {
			container.removeChild(container.firstChild);
		}

	// button_eraser
		const button_eraser = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'button reset eraser',
			parent			: container
		})
		button_eraser.addEventListener('mouseup', function(e){
			e.stopPropagation();

			while (container.firstChild) {
				container.removeChild(container.firstChild);
			}
		})

	// errors
		if (api_response.errors && api_response.errors.length) {
			ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'api_response error',
				parent			: container,
				inner_html		: api_response.errors.join('<br>')
			})
		}

	// msg
		const api_msg = api_response && api_response.msg
			? Array.isArray(api_response.msg)
				? api_response.msg.join('<br>')
				: api_response.msg.replace(/\\n/g, '<br>')
			: 'Unknown API response error'
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'api_response',
			parent			: container,
			inner_html		: api_msg
		})

	// JSON response result
		const result = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'pre',
			parent			: container
		})
		render_tree_data(api_response, result)


	return container
}//end print_response



/**
* BUILD_FORM
* Builds a generic submission form for a maintenance widget and appends it to
* `widget_object.body_info`.
*
* This is the standard way for maintenance widgets to create a parameterised
* admin action form. The form is also accessible as `area_maintenance.prototype.init_form`
* (an alias wired in `area_maintenance.js`).
*
* `widget_object` shape
* ----------------------
*   body_info    {HTMLElement}  — Container where the form element is appended.
*   body_response {HTMLElement} — Container where `print_response()` renders results.
*   confirm_text  {string}      — Confirmation dialog message. Defaults to
*                                 `get_label.sure || 'Sure?'`.
*   inputs        {Array}       — Array of input descriptor objects (see below).
*   submit_label  {string}      — Button label. Defaults to `'OK'`.
*   trigger       {Object}      — API dispatch descriptor:
*     dd_api   {string}  — API endpoint name (e.g. `'dd_area_maintenance_api'`).
*     action   {string}  — Action name dispatched to the endpoint.
*     source   {Object}  — Optional source locator forwarded to the API.
*     options  {Object}  — Optional extra options merged with the collected input values.
*   on_submit     {Function}    — Optional: replaces the default API dispatch. Receives
*                                 `(event, values)` where `values` is an array of
*                                 `{ name, value }` objects from the input fields.
*                                 If provided, `trigger` is ignored entirely.
*   on_done       {Function}    — Optional: called with `(api_response)` after the
*                                 default API dispatch completes (not called when
*                                 `on_submit` overrides the dispatch).
*   on_render     {Function}    — Optional: called with `({ form_container, input_nodes })`
*                                 immediately after the form is fully constructed,
*                                 allowing callers to inject extra nodes or wire events.
*
* Input descriptor shape
* ----------------------
*   type      {string}   — HTML input type (`'text'`, `'number'`, `'select'`, …).
*   name      {string}   — Field name; also used as the `{ name, value }` key in `values`.
*   label     {string}   — Placeholder text and title tooltip. For `select`, used as
*                          the disabled placeholder `<option>`.
*   mandatory {boolean}  — When true, the field must be non-empty before submit;
*                          empty mandatory fields receive the `'empty'` class and
*                          grab focus, preventing the API call.
*   value     {string}   — Pre-filled value. For `select`, marks the matching option
*                          as `selected`.
*   options   {Array<string>} — (select only) Values to render as `<option>` elements.
*
* Submit lifecycle
* ----------------
*   1. `form_container` gets class `lock` (prevents double-submit).
*   2. A spinner is prepended to `body_response`.
*   3. `data_manager.request()` is awaited with a 1-hour timeout (long-running
*      maintenance tasks may take many minutes).
*   4. `print_response()` replaces the spinner content with the formatted result.
*   5. `lock` class is removed; spinner is removed.
*   6. `on_done(api_response)` is called if provided.
*
* (!) The form uses `window.confirm()` as a confirmation gate. In some browser
* environments (iframes, certain CSPs) `confirm()` may return `true` without
* user interaction or be silently blocked. This is pre-existing behaviour.
*
* (!) `Object.assign(trigger.options, values)` mutates the original `trigger.options`
* object if it is a reference type. Callers should not rely on `trigger.options`
* being unchanged after the first submit.
*
* @param {Object} widget_object - Form configuration object (see shape above)
* @returns {HTMLElement} The constructed `<form class="form_container">` element,
*   already appended to `widget_object.body_info`. The element also exposes a
*   `form_container.button_submit` reference to the submit button node.
*/
export const build_form = function(widget_object) {

	// widget_object
		const body_info		= widget_object.body_info
		const body_response	= widget_object.body_response
		const confirm_text	= widget_object.confirm_text || get_label.sure || 'Sure?'
		const inputs		= widget_object.inputs || []
		const submit_label	= widget_object.submit_label || 'OK'
		const trigger		= widget_object.trigger || {}
		const on_submit		= widget_object.on_submit // optional replacement function to exec on submit
		const on_done		= widget_object.on_done // optional function to exec on API response
		const on_render		= widget_object.on_render // optional function to exec on render is complete

	// create the form
		const form_container = ui.create_dom_element({
			element_type	: 'form',
			class_name		: 'form_container',
			parent			: body_info
		})
		form_container.addEventListener('submit', async function(e){
			e.preventDefault()

			// blur button
				document.activeElement.blur()

			// collect values from inputs
				const values = input_nodes.map((el)=>{
					return {
						name	: el.name,
						value	: el.value
					}
				})

			if ( confirm(confirm_text) ) {

				// check mandatory values
					for (let i = 0; i < input_nodes.length; i++) {
						if(input_nodes[i].classList.contains('mandatory') && input_nodes[i].value.length<1) {
							input_nodes[i].focus()
							input_nodes[i].classList.add('empty')
							return
						}
					}

				// on_submit. Overwrites default submit action
					if (on_submit) {
						return on_submit(e, values)
					}

				// submit data
					form_container.classList.add('lock')

					// spinner
					const spinner = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'spinner'
					})
					body_response.prepend(spinner)

					const options = (trigger.options)
						? Object.assign(trigger.options, values)
						: values

					// data_manager
						const api_response = await data_manager.request({
							use_worker	: true,
							body		: {
								dd_api			: trigger.dd_api,
								action			: trigger.action,
								prevent_lock	: true,
								source			: trigger.source || null,
								options			: options
							},
							retries : 1, // one try only
							timeout : 3600 * 1000 // 1 hour waiting response
						})
						print_response(body_response, api_response)
						form_container.classList.remove('lock')
						spinner.remove()

					// on_done. Execute function after request
						if (on_done) {
							return on_done(api_response)
						}
			}
		})

	// form inputs
		const input_nodes = []
		for (let i = 0; i < inputs.length; i++) {

			const input = inputs[i]

			const class_name = input.mandatory
				? 'mandatory'
				: ''

			let input_node

			// select type
			if (input.type === 'select') {
				input_node = ui.create_dom_element({
					element_type	: 'select',
					name			: input.name,
					title			: input.label,
					class_name		: class_name,
					parent			: form_container
				})
				// add placeholder option
				ui.create_dom_element({
					element_type	: 'option',
					value			: '',
					text_content	: input.label || 'Select...',
					disabled		: true,
					selected		: !input.value,
					parent			: input_node
				})
				// add options
				if (input.options && Array.isArray(input.options)) {
					for (const option_value of input.options) {
						ui.create_dom_element({
							element_type	: 'option',
							value			: option_value,
							text_content	: option_value,
							selected		: input.value === option_value,
							parent			: input_node
						})
					}
				}
			}else{
				// default input type
				input_node = ui.create_dom_element({
					element_type	: 'input',
					type			: input.type,
					name			: input.name,
					placeholder		: input.label,
					title			: input.label,
					class_name		: class_name,
					parent			: form_container
				})
				if (input.value) {
					input_node.value = input.value
				}
			}

			input_node.addEventListener('change', function(){
				if (this.value.length>0) {
					this.classList.remove('empty')
				}
			})

			input_nodes.push(input_node)
		}

	// button submit
		const button_submit = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'light button_submit',
			inner_html		: submit_label,
			parent			: form_container
		})
		form_container.button_submit = button_submit
		button_submit.addEventListener('click', function(e){
			e.stopPropagation()
		})

	// on_render
		if (on_render) {
			on_render({form_container, input_nodes})
		}


	return form_container
}//end build_form



/**
* SET_WIDGET_LABEL_STYLE
* Adds or removes a CSS class on the outer `.widget_container` card element that
* wraps the current widget instance.
*
* Widgets call this to signal their overall health status from inside the accordion
* body, for example adding `'danger'` when a check fails or `'success'` when all
* checks pass. The class lands on the `.widget_container` (the card), not on the
* widget body node, so the label row changes colour even while the accordion is
* collapsed.
*
* DOM traversal
* -------------
* The widget's rendered node (`self.node`) sits inside:
*   .widget_container        ← target (parentNode.parentNode of self.node)
*     .widget_body
*       .body_info
*         self.node          ← widget render root
*
* Deferred execution
* ------------------
* When `self.node` is not yet mounted (e.g. called during early `build()` before
* `render()` has attached the node), the function defers via `when_in_dom(ref_node, …)`
* and retries once the reference node is inserted into the live document.
* `ref_node` should be a node that will definitely be in the DOM by the time the
* widget is visible (e.g. the widget body container).
*
* The actual class mutation is wrapped in `requestAnimationFrame` to ensure it
* happens after the current layout pass and does not cause a forced reflow.
*
* (!) If `self.node` is null and `ref_node` is also not provided (or never enters the
* DOM), this function will never execute the class mutation. Ensure `ref_node` is a
* node that the browser will eventually insert.
*
* @param {Object} self       - Widget instance; must expose `self.node` (HTMLElement|null)
* @param {string} style      - CSS class name to add or remove (e.g. `'danger'`, `'success'`)
* @param {string} mode       - `'add'` to add the class; any other value removes it
* @param {HTMLElement} ref_node - Reference node passed to `when_in_dom` when `self.node`
*   is not yet available; typically the widget's outer container
* @returns {void}
*/
export const set_widget_label_style = function (self, style, mode, ref_node) {

	if (!self.node) {
		const when_in_dom_handler = () => {
			set_widget_label_style(self, style, mode, ref_node)
		}
		when_in_dom(ref_node, when_in_dom_handler)
		return
	}

	const wrapper = self.node
	const widget_container = wrapper.parentNode?.parentNode
	if (widget_container) {
		requestAnimationFrame(()=>{
			if (mode==='remove') {
				widget_container.classList.remove(style)
			}else{
				widget_container.classList.add(style)
			}
		})
	}
}//end set_widget_label_style



// @license-end
