// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



/**
* VIEW_INDEXATION_DD_GRID
* View renderer for dd_grid instances operating in 'indexation' mode.
*
* This module is the client-side counterpart of the server-side
* indexation_grid::build_indexation_grid() builder. It renders a structured,
* recursive grid of cells produced by that builder into a live DOM panel used
* during thesaurus indexation workflows.
*
* Responsibilities:
* - Converts the hierarchical `data` array (columns, containers, nested values)
*   received from the API into a DOM DocumentFragment via `get_grid_nodes()`.
* - Mounts a paginator (lazy-created on first render, refreshed on subsequent
*   renders) and subscribes to its 'paginator_goto_*' events to reload data
*   when the user navigates pages.
* - Builds a section-type filter bar (`get_filter_section`) that allows the user
*   to toggle individual section types in and out of the search query object
*   (sqo). Each checkbox maps directly to a `section_tipo` key on `self.rqo.sqo`.
*
* Cell-type routing (handled in `get_grid_nodes`):
*   'av'          → get_av_column        (audio/video thumb)
*   'img'         → get_img_column       (image thumb)
*   'iri'         → get_iri_column       (IRI link)
*   'button'      → get_button_column    (dynamic action button, defined here)
*   'json'        → get_json_column      (JSON preview)
*   'section_id'  → get_section_id_column (section-id, optionally a record link)
*   'record_link' → get_record_link_column (explicit edit-window link)
*   'text' / *    → get_text_column       (plain text, with optional fallback)
*
* Data shape expected from the server (`self.data`):
*   Array<{
*     type       : string,   // 'column' | any container string used as CSS class
*     cell_type  : string,   // cell renderer selector (see above)
*     class_list : string,   // extra CSS classes applied to the cell wrapper
*     render_label : boolean,// when true, a label element is prepended to the column
*     label      : string,   // human-readable column label
*     value      : Array|string, // cell content; shape depends on cell_type
*     fallback_value : Array,    // used when value is empty (text columns only)
*     records_separator : string,// join separator for multi-value text cells
*     features   : { color: string }, // optional CSS --base_color override
*     ar_columns_obj : Array,    // section-id column metadata (section_id cell_type)
*     action     : Object,   // button action descriptor (button cell_type)
*   }>
*
* Exported symbols: {view_indexation_dd_grid}
* Also exported (consumed by render_list_dd_grid and other view modules):
*   get_button_column, get_text_column, get_record_link_column, get_section_id_column
*/

// imports
	import {paginator} from '../../paginator/js/paginator.js'
	import {object_to_url_vars, open_window} from '../../common/js/utils/index.js'
	import {ui} from '../../common/js/ui.js'
	import {
		get_av_column,
		get_img_column,
		get_label_column,
		get_json_column,
		get_iri_column
	} from './render_list_dd_grid.js'



/**
* VIEW_INDEXATION_DD_GRID
* Namespace / constructor stub for the indexation view.
* Not instantiated; all logic lives in the static `render` method below.
*/
export const view_indexation_dd_grid = function() {

	return true
}//end view_indexation_dd_grid



/**
* RENDER
* Build the full DOM subtree for the indexation view and return it.
*
* When `options.render_level` is 'content', only the `content_data` div is
* returned (used by refresh cycles to replace just the data area without
* rebuilding the paginator and filter bar). Any other value (default: 'full')
* returns the complete wrapper that includes the top_container (filter + pager)
* and the content_data div.
*
* The paginator and filter section are initialised asynchronously and appended
* to their containers once their Promises resolve. The returned `wrapper` node
* therefore reaches the caller before those async operations complete — the
* caller must not assume that child nodes are ready synchronously.
*
* The `wrapper.content_data` property is set as a live pointer so that the
* parent dd_grid instance can replace the data area on subsequent refreshes
* without re-querying the DOM.
*
* @param {Object} self - dd_grid instance; must have `self.data`, `self.tipo`,
*   `self.mode`, `self.view`, `self.rqo`, `self.paginator_options`,
*   `self.totals_group`, and `self.events_tokens` available.
* @param {Object} options - Render options.
* @param {string} [options.render_level='full'] - 'content' to skip top bar.
* @returns {Promise<HTMLElement>} The wrapper div (full) or content_data div (content).
*/
view_indexation_dd_grid.render = async function(self, options) {

	// options
		const render_level = options.render_level || 'full'

	// data
		const data = self.data || []

	// content_data
		// Recursively convert the flat/nested server data array into DOM nodes.
		const grid = get_grid_nodes( data )
		const content_data = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_data'
		})
		content_data.appendChild(grid)

		// Early exit for refresh cycles that only need the data area rebuilt.
		if (render_level==='content') {
			return content_data
		}

	// top container
		const top_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'top_container'
		})

	// paginator
		// The paginator container is appended to top_container immediately so
		// DOM order is established; the actual paginator node is inserted once
		// init_paginator resolves (async, may involve a count API call on first
		// render).
		const paginator_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'paginator_container'
		})
		init_paginator(self)
		.then(async function(response){
			const paginator_node = await self.paginator.render()
			paginator_container.appendChild(paginator_node)
		})

	// filter_section
		// Similarly, the filter section is resolved asynchronously. The container
		// is placed in the DOM first to ensure filter_section_container precedes
		// paginator_container in visual order.
		const filter_section_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'filter_section_container'
		})
		get_filter_section(self, filter_section_container)
		.then(function(filter_section_node){
			filter_section_container.appendChild(filter_section_node)
		})
		// top_container append items in proper order
		top_container.appendChild(filter_section_container)
		top_container.appendChild(paginator_container)

	// wrapper
		const wrapper = ui.create_dom_element({
			element_type	: 'div',
			class_name		: `wrapper_dd_grid ${self.tipo} ${self.mode} view_${self.view}`
		})

	// wrapper append nodes
		wrapper.appendChild(top_container)
		wrapper.appendChild(content_data)
		// set pointers
		// (!) Expose content_data on the wrapper so dd_grid.refresh() can
		// replace only the data area without rebuilding the entire subtree.
		wrapper.content_data = content_data


	return wrapper
}//end render



/**
* GET_GRID_NODES
* Recursively convert a server-supplied grid data array into a DocumentFragment.
*
* (!) Data comes from the server class indexation_grid->build_indexation_grid().
* Each element of `data` describes either a column cell or a container that
* groups further nested items under its own `value` array. Container items have
* a `type` value other than 'column'; column items carry a `cell_type` that
* selects the appropriate renderer.
*
* The recursion handles arbitrarily-deep nesting: when a processed node has a
* non-empty `value` property, get_grid_nodes is called again on that sub-array
* and the resulting fragment is appended as a child of the current wrapper div.
*
* Items without a `type` property are silently skipped via `continue`.
*
* @param {Array<Object>} data - Array of grid node descriptors, e.g.:
*   [{
*     type      : 'column',
*     cell_type : 'text',
*     label     : 'Dating',
*     value     : ['Early 16th century'],
*     class_list: 'dating',
*   }]
* @returns {DocumentFragment} Fragment containing the rendered grid nodes.
*/
const get_grid_nodes = function(data) {

	const fragment = new DocumentFragment()

	const data_len = data.length
	for (let i = 0; i < data_len; i++) {

		const current_data = data[i]

		const cell_nodes = []
		if (current_data && current_data.type) {

			const node = get_div_container(current_data)

			// label
				// Only column nodes with render_label:true receive a label element,
				// allowing the server to control per-column label visibility.
				if(current_data.type==='column' && current_data.render_label){
					const label_node = get_label_column(current_data)
					node.appendChild(label_node)
				}

			// column
				// Dispatch to the appropriate renderer based on cell_type.
				// The 'text' case is also the default fallback for unknown types.
				if(current_data.type==='column' && current_data.cell_type){

					switch(current_data.cell_type) {
						case 'av':
							node.appendChild(
								get_av_column(current_data)
							)
							break;

						case 'img':
							node.appendChild(
								get_img_column(current_data)
							)
							break;

						case 'iri':
							node.appendChild(
								get_iri_column(current_data)
							)
							break;

						case 'button':
							node.appendChild(
								get_button_column(current_data)
							)
							break;

						case 'json':
							node.appendChild(
								get_json_column(current_data)
							)
							break;

						case 'section_id':
							node.appendChild(
								get_section_id_column(current_data)
							)
							break;

						case 'record_link':
							node.appendChild(
								get_record_link_column(current_data)
							)
							break;

						case 'text':
						default:
							node.appendChild(
								get_text_column(
									current_data,
									true // bool use fallback value
								)
							)
							break;
					}//end switch(current_data.cell_type)
				}// end if(current_data.type==='column' && current_data.cell_type)

			// value
				// For container nodes (non-column types) whose value is a nested
				// data array, recurse and attach child grid nodes.
				if(current_data.value){
					const child_node = get_grid_nodes(current_data.value)
					node.appendChild(child_node)
				}

			cell_nodes.push(node)
		}else{
			continue;
		}

		// add cell_nodes (array of one value)
		fragment.appendChild(...cell_nodes)
	}//end for (let i = 0; i < data_len; i++)


	return fragment
}//end get_grid_nodes



/**
* GET_DIV_CONTAINER
* Create a wrapper div element for a single grid node.
*
* The CSS class list is composed from `current_data.type` (always present,
* used as the base semantic class) plus the optional `current_data.class_list`
* string supplied by the server for per-cell styling variations.
*
* When `current_data.features.color` is set, the CSS custom property
* `--base_color` is injected inline on this element only, scoping the colour
* to the cell subtree. The value originates from section properties on the
* server and is forwarded through the grid build payload.
*
* @param {Object} current_data - Grid node descriptor.
* @param {string} current_data.type - Node type string; becomes the base CSS class.
* @param {string} [current_data.class_list] - Extra CSS classes appended after type.
* @param {Object} [current_data.features] - Optional feature flags.
* @param {string} [current_data.features.color] - CSS colour value for --base_color.
* @returns {HTMLElement} A div with the composed class name and optional inline style.
*/
const get_div_container = function(current_data) {

	const class_list = (current_data.class_list)
		? current_data.type + ' ' + current_data.class_list
		: current_data.type

	const div_container = ui.create_dom_element({
		element_type	: 'div',
		class_name		: class_list
	})

	// --base_color. Is set only to div_container scope.
	// Value comes from section properties and is set to dd_grid
	// when section_grid is build (server side)
		if (current_data.features && current_data.features.color) {
			div_container.style.cssText = "--base_color: " + current_data.features.color
		}


	return div_container
}//end get_div_container



/**
* GET_BUTTON_COLUMN
* Build an action button cell from a server-supplied button descriptor.
*
* The first item in `current_data.value` is the button descriptor. It
* specifies the icon markup, tooltip label, and an optional `action` object
* that drives a dynamic module import and method call when the button is
* clicked.
*
* Action dispatch uses a three-tier function-resolution fallback:
*   1. Directly exported named export: `module[method_name]`
*   2. Default export's own method:    `module.default[method_name]`
*   3. Default export's prototype:     `module.default.prototype[method_name]`
* This supports tool modules regardless of whether they use named exports,
* class defaults, or prototype-style constructors.
*
* Sample action descriptor (as generated by the PHP server):
*   'action' => {
*     'event'       : 'click',
*     'method'      : 'open_tool',
*     'module_path' : '../../../core/tools_common/js/tool_common.js',
*     'options'     : {
*       'tool_name'        : 'tool_indexation',
*       'section_tipo'     : $section_tipo,
*       'section_id'       : $section_id,
*       'component_tipo'   : $component_tipo,
*       'tag_id'           : $tag_id,
*       'section_top_tipo' : $section_top_tipo,
*       'section_top_id'   : $section_top_id
*     }
*   }
*
* @param {Object} current_data - Grid node descriptor with cell_type 'button'.
* @param {Array<Object>} current_data.value - Single-element array; [0] is the descriptor.
* @param {string} [current_data.value[0].class_list] - Extra CSS classes for the icon span.
* @param {string} [current_data.value[0].label] - Tooltip text for the button.
* @param {string} [current_data.value[0].value] - innerHTML for the icon span (e.g. SVG).
* @param {Object} [current_data.value[0].action] - Dynamic dispatch descriptor (see above).
* @returns {HTMLElement} A <button> element with an icon span and an optional event listener.
*/
export const get_button_column = function(current_data) {

	const value			= current_data.value[0]
	const class_list	= value.class_list || ''

	// button
		const button = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'dd_grid_button',
			title			: value.label || ''
		})

	// icon
		const icon = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'icon ' + class_list, // 'icon indexation',
			parent			: button
		})
		if (value.value) {
			icon.innerHTML = value.value
		}

	// event
		// Only attach the listener when the action descriptor is present and
		// specifies an event type; buttons without actions are purely decorative.
		if (value.action && value.action.event) {

			// sample
				// 'class_list'	=> 'button label',
				// 'action'		=> (object)[
				// 		'event'			=> 'click',
				// 		'method'		=> 'open_tool',
				// 		'module_path'	=> '../../../core/tools_common/js/tool_common.js',
				// 		'options'		=> (object)[
				// 			'tool_name'			=> 'tool_indexation',
				// 			'section_tipo'		=> $section_tipo,
				// 			'section_id'		=> $section_id,
				// 			'component_tipo'	=> $component_tipo,
				// 			'tag_id'			=> $tag_id,
				// 			'section_top_tipo'	=> $section_top_tipo,
				// 			'section_top_id'	=> $section_top_id
				// 		]
				// ]

			button.addEventListener(value.action.event, async (e)=>{
				e.stopPropagation()

				// options
					const options			= value.action.options
					// Inject the clicked element so the tool can position UI relative to it.
					options.button_caller	= e.target

				// module
					// Dynamic import allows the button to invoke any registered tool module
					// without a static dependency. The path is trusted (server-supplied).
					const module = await import(value.action.module_path)

				// method
					const method_name = value.action.method

				// function exec. Try with fallback
					const fn = module[method_name] // direct exported method
							|| module.default[method_name] // fallback to default method
							|| module.default.prototype[method_name] // fallback to default prototyped method

					if (fn && typeof fn==='function') {
						console.log('-> [button_column] Executing function:', method_name);
						fn(options)
					}else{
						console.error('Unable to call method:', method_name);
					}
			})
		}


	return button
}//end get_button_column



/**
* GET_TEXT_COLUMN
* Build a <span> element whose content is a join of the cell's string values.
*
* `value` is expected to be an array of strings; they are joined with
* `records_separator` (default: ' | '). When `use_fallback` is true and
* `data_item.value` is empty or its first element is undefined, the function
* falls back to `data_item.fallback_value` before joining.
*
* An 'empty' CSS class is appended to the span when the resulting string is
* empty, allowing CSS to style or hide empty cells consistently.
*
* Special case — 'text_fragment' class:
* When `data_item.class_list` is exactly 'text_fragment', the span receives a
* click listener that toggles the 'full' CSS class. This expands truncated
* (overflow-hidden) text blocks inline without navigating away from the grid.
*
* @param {Object} data_item - Grid node descriptor with cell_type 'text' (or default).
* @param {Array<string>} [data_item.value] - Primary array of string values to display.
* @param {Array<string>} [data_item.fallback_value] - Used when value is empty and use_fallback is true.
* @param {string} [data_item.class_list] - CSS classes applied to the span.
* @param {string} [data_item.records_separator=' | '] - Delimiter used to join multi-value arrays.
* @param {boolean} use_fallback - When true, substitute fallback_value if value is absent.
* @returns {HTMLElement} A <span> element with the joined text and appropriate CSS classes.
*/
export const get_text_column = function(data_item, use_fallback) {

	const class_list = data_item.class_list || ''

	// Resolve the display value: prefer data_item.value when it has a defined
	// first element; otherwise fall back to fallback_value when use_fallback is set.
	const value = use_fallback===true
		? (data_item.value && data_item.value[0]!==undefined ? data_item.value : data_item.fallback_value)
		: data_item.value

	const records_separator = (data_item.records_separator)
		? data_item.records_separator
		: ' | '

	const value_string = value
		? value.join(records_separator)
		: ''

	// Mark empty cells with a CSS class so they can be visually distinguished.
	const add_style = value_string.length>0
		? ''
		: ' empty'

	const text_node = ui.create_dom_element({
		element_type	: 'span',
		class_name		: class_list + add_style,
		inner_html		: value_string
	})


	// text_fragment case. Toggle class to display overflow hidden text
		// The 'text_fragment' class signals that the server truncated the value
		// for compact display; clicking expands it in place.
		if (data_item.class_list==='text_fragment') {
			// console.log('data_item:', data_item);
			text_node.addEventListener('click', function(e) {
				e.stopPropagation()
				text_node.classList.toggle('full')
			})
		}


	return text_node
}//end get_text_column



/**
* GET_RECORD_LINK_COLUMN
* Build a button that opens the referenced section record in a new browser window.
*
* The button contains two child divs: one showing the section_id as text and one
* rendering an edit icon (via CSS). Clicking the button constructs a Dédalo page
* URL for the target record in 'edit' mode, then calls open_window() to show it
* in a named window ('record_view'), so repeat clicks reuse the same tab.
*
* `session_save: false` is passed in the URL to prevent the popup from overwriting
* the operator's current section navigation session in the main window.
*
* @param {Object} current_data - Grid node descriptor with cell_type 'record_link'.
* @param {string} [current_data.class_list] - Extra CSS classes for the button.
* @param {Array<Object>} current_data.value - Single-element array; [0] holds the link target.
* @param {number|string} current_data.value[0].section_id - ID of the record to open.
* @param {string} current_data.value[0].section_tipo - Section tipo of the record to open.
* @returns {HTMLElement} A <button> element that opens the record on click.
*/
export const get_record_link_column = function(current_data) {

	const class_list	= current_data.class_list || ''
	const section_id	= current_data.value[0].section_id
	const section_tipo	= current_data.value[0].section_tipo

	const button_edit = ui.create_dom_element({
		element_type	: 'button',
		class_name		: 'button_edit button_view_default ' + class_list
	})
	button_edit.addEventListener('click', function(e) {
		e.stopPropagation()

		// open a new window
			const url = DEDALO_CORE_URL + '/page/?' + object_to_url_vars({
				tipo			: section_tipo,
				section_tipo	: section_tipo,
				id				: section_id,
				mode			: 'edit',
				session_save	: false, // prevent to overwrite current section session
				menu			: false
			})
			open_window({
				url		: url,
				name	: 'record_view'
			})
	})

	ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'section_id',
		inner_html		: section_id,
		parent			: button_edit
	})
	ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'button edit icon',
		parent			: button_edit
	})


	return button_edit
}//end get_record_link_column



/**
* GET_SECTION_ID_COLUMN
* Render a section-id cell, either as an interactive record-link button or as a
* plain styled span, depending on whether column metadata is available.
*
* When `ar_columns_obj[0].id` is present, the 'id' value encodes the section
* tipo as its prefix (e.g. 'dd1_123' → section_tipo 'dd1'). The function
* extracts that prefix via `id.split('_')[0]` and delegates to
* get_record_link_column(), forwarding the reconstructed value shape. This
* makes the cell clickable and opens the referenced record in a new window.
*
* When `ar_columns_obj` is empty or its first element has no 'id', a plain
* <span> with the 'link' class is rendered. The span carries the 'Open' tooltip
* via get_label.open (a global label resolver) with 'Open' as a hardcoded
* English fallback.
*
* @param {Object} current_data - Grid node descriptor with cell_type 'section_id'.
* @param {Array<Object>} current_data.ar_columns_obj - Column metadata array;
*   [0].id encodes 'sectionTipo_columnTipo' when a record link is desired.
* @param {string|number} current_data.value - The section ID to display.
* @param {string} [current_data.class_list] - Extra CSS classes.
* @returns {HTMLElement} A <button> (record link) or <span> (plain) element.
*/
export const get_section_id_column = function(current_data) {

	// record_link_column render
		// When the column metadata carries an 'id', the section tipo can be derived
		// from the id prefix; build a full record-link button in that case.
		const id = current_data.ar_columns_obj[0]?.id || null
		if (id) {

			return get_record_link_column({
				class_list : current_data.class_list,
				value : [{
					section_id		: current_data.value,
					section_tipo	: id.split('_')[0]
				}]
			})
		}

	// default plain render
		// No column metadata means we cannot determine the target section tipo;
		// fall back to a non-interactive span that still carries the section id text.
		const section_id_node = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'link ' + (current_data.class_list || ''),
			title			: get_label.open || 'Open',
			inner_html		: current_data.value
		})


	return section_id_node
}//end get_section_id_column



/**
* INIT_PAGINATOR
* Ensure a paginator instance exists on `self` and is synchronised with the
* current query state.
*
* On first call (`self.paginator` is falsy), a new paginator instance is
* created, initialised, and built (which triggers a count API call to populate
* `self.rqo.sqo.total`). After building, the function subscribes to the
* 'paginator_goto_<id>' event so that page navigation updates `self.rqo.sqo.offset`
* and calls `self.refresh()`. The subscription token is stored in
* `self.events_tokens` so it is cleaned up when the dd_grid is destroyed.
*
* On subsequent calls (`self.paginator` already exists), the paginator's
* `offset` and `total` properties are synchronised from `self.rqo.sqo` to
* reflect any changes made since the last render (e.g. a filter change that
* reset the offset to 0).
*
* Paginator options are read from `self.paginator_options`:
*   - `view`           (default: 'micro') → paginator display mode
*   - `show_interface` (default: {})      → controls which paginator UI elements appear
*
* (!) `event_manager` is accessed as a module-scope global (not imported here);
* the calling module must load event_manager before this view renders.
*
* @param {Object} self - dd_grid instance with `paginator_options`, `rqo`, and `events_tokens`.
* @returns {Promise<boolean>} Resolves to true when the paginator is ready.
*/
const init_paginator = async function(self){

	// paginator check
	if (!self.paginator) {

		// paginator_options
		const paginator_view = self.paginator_options.view
			? self.paginator_options.view
			: 'micro'

		const show_interface = self.paginator_options.show_interface
			? self.paginator_options.show_interface
			: {}

		// create new one
		self.paginator = new paginator()
		self.paginator.init({
			caller			: self,
			mode			: paginator_view,
			show_interface	: show_interface
		})
		await self.paginator.build()

		// paginator_goto_ event
			// Subscribe to page-navigation events emitted by this specific paginator
			// instance. The handler mutates sqo.offset and triggers a data refresh.
			const paginator_goto_handler = function(offset) {
				self.rqo.sqo.offset = offset
				// refresh
				self.refresh()
			}
			self.events_tokens.push(
				event_manager.subscribe('paginator_goto_'+self.paginator.id, paginator_goto_handler)
			)

	}else{
		// refresh existing
		// Sync paginator state from the current sqo so the UI reflects the latest
		// offset and total after a filter change or section-type toggle.
		self.paginator.offset = self.rqo.sqo.offset
		self.paginator.total  = self.rqo.sqo.total
	}


	return true
}//end init_paginator



/**
* GET_FILTER_SECTION
* Build a set of checkbox controls that let the user include or exclude
* individual section types from the indexation grid results.
*
* Each entry in `self.totals_group` represents one section type present in
* the current result set. The function iterates those entries (sorted
* alphabetically by label) and creates a <label>/<input type="checkbox"> pair
* for each one. Every checkbox starts checked (all section types visible).
*
* When a checkbox changes state, the handler:
*   1. Adds the 'loading' CSS class to both the filter container and the
*      content_data node to visually block interaction during the refresh.
*   2. Adds or removes the section tipo key from `self.rqo.sqo.section_tipo`.
*   3. Resets `self.rqo.sqo.offset` to 0 and nulls `self.rqo.sqo.total` to
*      force the paginator to recount results from the beginning.
*   4. Calls `self.refresh()` to reload data with the updated filter.
*
* A 'render_<paginator_id>' event subscription removes the 'loading' class once
* the refreshed render is complete. This prevents the user from toggling another
* checkbox before the current refresh finishes, which could corrupt the paginator
* state when the new result set has fewer pages than expected.
*
* (!) `event_manager` is used as a module-scope global; see init_paginator note.
* (!) `self.node.content_data` must already be set as a pointer on the wrapper
*      node before this function's event handlers fire (guaranteed by render()).
*
* @param {Object} self - dd_grid instance; must have `self.totals_group`,
*   `self.rqo.sqo.section_tipo`, `self.paginator`, and `self.events_tokens`.
* @param {HTMLElement} filter_section_container - The container that will hold
*   the returned fragment; also used as the loading-state target.
* @returns {Promise<DocumentFragment>} Fragment containing the labelled checkboxes.
*/
const get_filter_section = async function (self, filter_section_container) {

	const fragment = new DocumentFragment()

	// get all sections
	const totals_group = self.totals_group || []
	const total_len = totals_group.length

	// Order by label the sections to show.
	totals_group.sort(function(a, b) {
		return a.label.localeCompare(b.label);
	});
	// subscribe the filter_section_contanier to changes in the paginator
	// block the node and all actions until the paginator is ready.
	// prevent user actions before the paginator is ready
	// if the user change the state of the section in middle of pagination refresh
	// and the new paginator is empty (less than limit)
	// previous paginator could be set erroneously.
	const render_handler = () => {
		filter_section_container.classList.remove('loading')
	}
	self.events_tokens.push(
		event_manager.subscribe('render_'+self.paginator.id, render_handler)
	)

	// create the nodes for the sections
	for (let i = 0; i < total_len; i++) {

		const current_section = totals_group[i]

		// checkbox_label
			// Label text combines the section's human-readable label and its current
			// result count (e.g. "Objects: 42"). The title attribute shows the tipo key
			// for developer inspection.
			const checkbox_label = ui.create_dom_element({
				element_type	: 'label',
				class_name		: 'label checkbox_label',
				title			: current_section.key,
				inner_html		: `${current_section.label}: ${current_section.value}`,
				parent			: fragment
			})

		// input checkbox
			const checkbox_input = ui.create_dom_element({
				element_type	: 'input',
				type			: 'checkbox',
				name			: 'checkbox_active'
			})
			checkbox_input.checked = true
			// Store the section tipo key directly on the input element so the
			// change handler can read it without a closure over `current_section`.
			checkbox_input.key = current_section.key
			// prepend input to label
			checkbox_label.prepend(checkbox_input)

			// when the user change the checkbox refresh the content_data
			checkbox_input.addEventListener('change', function(e) {

				// Add loading class to both the filter bar and the data area to
				// prevent concurrent interactions during the in-flight refresh.
				filter_section_container.classList.add('loading')
				self.node.content_data.classList.add('loading')

				if(checkbox_input.checked === false){
					// if the checkbox is not set remove the section_tipo of the sqo
					const new_ar_section = self.rqo.sqo.section_tipo.filter(item => item !== checkbox_input.key)
					self.rqo.sqo.section_tipo = new_ar_section
					checkbox_label.classList.add('unchecked')

				}else{
					// if the checkbox is checked add the section_tipo to the sqo
					// Guard against duplicates in case the array is out of sync.
					const found = self.rqo.sqo.section_tipo.find(item => item === checkbox_input.key)
					if(!found){
						self.rqo.sqo.section_tipo.push(checkbox_input.key)
					}
					checkbox_label.classList.remove('unchecked')
				}

				// reset the offset and total to force to refresh the paginator
				// Null total forces a fresh count call in dd_grid.get_total().
				self.rqo.sqo.offset = 0
				self.rqo.sqo.total = null

				self.refresh()
			})
	}//end for (let i = 0; i < total_len; i++)


	return fragment
}//end get_filter_section



// @license-end
