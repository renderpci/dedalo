// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, Promise, SHOW_DEBUG */
/*eslint no-undef: "error"*/



// imports
	import {get_section_records} from '../../section/js/section.js'
	import {event_manager} from '../../common/js/event_manager.js'
	import {
		clone,
		get_font_fit_size,
		object_to_url_vars,
		// open_window
	} from '../../common/js/utils/index.js'
	import {ui} from '../../common/js/ui.js'
	import {open_tool} from '../../../core/tools_common/js/tool_common.js'
	import {set_element_css} from '../../page/js/css.js'
	import {no_records_node} from './render_common_section.js'
	// // import {
	// 	render_column_id
	// } from './render_list_section.js'



/**
* VIEW_THESAURUS_LIST_SECTION
* List-view module for thesaurus sections (area_thesaurus context).
*
* This is the specialised counterpart of view_default_list_section for sections
* that display thesaurus terms. It differs from the generic list view in two
* main ways:
*
*   1. It injects its own render_column_id callback that handles the term-linking
*      workflow used by tool_indexation and the DS (Document Server) window opener,
*      rather than the standard edit/navigate buttons of the generic list.
*
*   2. rebuild_columns_map is a module-private function (not a method on the
*      exported namespace), so callers cannot override it. This keeps the thesaurus
*      section_id column definition self-contained.
*
* Exported API:
*   view_thesaurus_list_section         — namespace constructor (always returns true)
*   view_thesaurus_list_section.render  — builds the full section DOM (async)
*
* Module-private helpers (not exported):
*   get_content_data    — renders all section_record rows in parallel
*   rebuild_columns_map — prepends the thesaurus section_id column to columns_map
*   get_buttons         — builds the toolbar (search toggle only)
*   render_column_id    — builds the id-column fragment for a single row;
*                         handles the tool_indexation link-term workflow
*
* DOM structure produced by render():
*   <section id="{self.id}" class="wrapper_section …">
*     [div.buttons_container]     — optional; only when self.buttons && mode!=='tm'
*     [div.search_container]      — optional; only when self.filter && mode!=='tm'
*     [div.paginator_container]   — optional; only when self.paginator
*     <div.list_body>
*       <div.list_header>…</div>  — column labels; hidden when 0 records
*       <div.content_data>
*         <div.no_records>        — when ar_section_record.length === 0
*         | <div>…</div>         — one section_record row per result record
*       </div>
*     </div>
*   </section>
*
* @see view_default_list_section  — generic list view with richer toolbar
* @see render_list_section        — dispatcher that selects this module for
*                                   context.view === 'thesaurus_list'
* @see area_thesaurus             — the area that owns the thesaurus sections
*                                   rendered through this view
*/



/**
* VIEW_THESAURUS_LIST_SECTION
* Namespace constructor — never instantiated directly. All functionality lives
* on the static-style function properties (.render, etc.).
* @returns {boolean} Always returns true.
*/
export const view_thesaurus_list_section = function() {

	return true
}//end view_thesaurus_list_section



/**
* RENDER
* Builds the complete list DOM for a thesaurus section and returns its wrapper
* element. Supports two render levels:
*
*   'full' (default):
*     Builds the entire wrapper including optional buttons bar, search placeholder,
*     paginator slot, column header, and content rows. DOM pointers
*     (wrapper.content_data, wrapper.list_body, wrapper.list_header_node) are set
*     on the returned element so callers can reach sub-nodes without re-querying.
*
*   'content':
*     Rebuilds only the row area (content_data). Used by the pagination handler to
*     swap rows without tearing down the existing wrapper. Removes the 'hide' class
*     from list_header_node when new records arrive. Returns content_data directly,
*     NOT the wrapper.
*
* CSS grid layout:
*   ui.flat_column_items() flattens columns_map (including nested sub-columns) into
*   a list of CSS track-size strings, e.g. ['minmax(auto,6rem)', '1fr', '3fr'].
*   These are joined and written to the .list_body grid-template-columns rule via
*   set_element_css() with a scoped selector ({section_tipo}_{tipo}.list) so that
*   multiple sections on the same page do not clash. Any CSS rules defined in
*   self.context.css are merged on top of this computed grid definition.
*
* columns_map:
*   rebuild_columns_map() is always called first. It prepends the thesaurus
*   section_id column (with the link-term render_column_id callback) and appends
*   any existing self.columns_map entries. The result is stored back on
*   self.columns_map and self.fixed_columns_map is set to true so that subsequent
*   pagination renders skip the rebuild.
*
* ar_instances lazy population:
*   If self.ar_instances is already present and non-empty it is reused, avoiding a
*   redundant server round-trip when render() is called again after a navigation
*   event. Otherwise get_section_records() is called to populate it.
*
* buttons / filter / paginator:
*   These optional sections are suppressed in 'tm' (Time Machine) mode. The search
*   container is a bare placeholder div; the section's search.js instance attaches
*   its own DOM to it when it initialises.
*
* @param {Object} self    - The section instance. Expected properties:
*   id, type, model, tipo, section_tipo, mode, view, context, columns_map,
*   ar_instances, buttons, filter, paginator, node (set on 'content' re-renders).
* @param {Object} options - Render options.
*   @param {string} [options.render_level='full'] - 'full' | 'content'
* @returns {Promise<HTMLElement>} The section wrapper <section> element on a full
*   render, or the content_data <div> element on a 'content' re-render.
*/
view_thesaurus_list_section.render = async function(self, options) {

	// options
		const render_level = options.render_level || 'full'

	// columns_map
		const columns_map	= await rebuild_columns_map(self)
		self.columns_map	= columns_map

	// ar_section_record. section_record instances (initialized and built)
		self.ar_instances = self.ar_instances && self.ar_instances.length>0
			? self.ar_instances
			: await get_section_records({caller: self})

	// content_data
		const content_data = await get_content_data(self, self.ar_instances)
		if (render_level==='content') {

			// list_header_node. Remove possible style 'hide' if not empty
				if (self.ar_instances.length>0) {
					const wrapper = self.node
					if (wrapper?.list_header_node && wrapper.list_header_node.classList.contains('hide')) {
						wrapper.list_header_node.classList.remove('hide')
					}
				}

			return content_data
		}

	// DocumentFragment
		const fragment = new DocumentFragment()

	// buttons add
		if (self.buttons && self.mode!=='tm') {
			const buttons_node = get_buttons(self);
			if(buttons_node){
				fragment.appendChild(buttons_node)
			}
		}

	// search filter node
		if (self.filter && self.mode!=='tm') {
			const search_container = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'search_container',
				parent			: fragment
			})
			// set pointers
			self.search_container = search_container
		}

	// paginator container node
		if (self.paginator) {
			const paginator_container = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'paginator_container',
				parent			: fragment
			})
			self.paginator.build()
			.then(function(){
				self.paginator.render()
				.then(paginator_wrapper =>{
					paginator_container.appendChild(paginator_wrapper)
				})
			})
		}

	// list body
		const list_body = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'list_body',
			parent			: fragment
		})
		// fix last list_body (for pagination selection)
		self.node_body = list_body

		// list_body css
			const selector = `${self.section_tipo}_${self.tipo}.list`

		// custom properties defined css
			// flat columns create a sequence of grid widths taking care of sub-column space
			// like 1fr 1fr 1fr 3fr 1fr
			const items				= ui.flat_column_items(columns_map)
			const template_columns	= items.join(' ')


			const css_object = {
				'.list_body' : {
					'grid-template-columns' : template_columns
				}
			}
			if (self.context?.css) {
				// use defined section css
				for(const property in self.context.css) {
					css_object[property] = self.context.css[property]
				}
			}
			// use calculated css
			set_element_css(selector, css_object)

	// list_header_node. Create and append if ar_instances is not empty
		const list_header_node = ui.render_list_header(columns_map, self)
		list_body.appendChild(list_header_node)
		if (self.ar_instances.length<1) {
			list_header_node.classList.add('hide')
		}

	// content_data append
		list_body.appendChild(content_data)

	// wrapper
		const wrapper = ui.create_dom_element({
			element_type	: 'section',
			id				: self.id,
			class_name		: `wrapper_${self.type} ${self.model} ${self.section_tipo}_${self.tipo} ${self.tipo} ${self.mode} view_${self.view}`
		})
		wrapper.appendChild(fragment)
		// set pointers
		wrapper.content_data		= content_data
		wrapper.list_body			= list_body
		wrapper.list_header_node	= list_header_node


	return wrapper
}//end render



/**
* GET_CONTENT_DATA
* Builds the scrollable row area for the thesaurus list view.
*
* Iterates over ar_section_record in parallel (Promise.all) and appends each
* rendered section_record node to a DocumentFragment in their original order.
* When the array is empty, a localised "No records found" placeholder is
* rendered instead via no_records_node().
*
* The returned div carries CSS classes 'content_data', self.mode, and self.type
* so that layout rules can target mode/type combinations without relying on
* ancestor selectors.
*
* (!) This function uses a for-loop with a cached length after Promise.all to
* preserve the server-side record order, which may differ from Promise resolution
* order.
*
* @param {Object} self              - The section instance. Used for .mode and
*                                     .type class names applied to content_data.
* @param {Array}  ar_section_record - Array of initialised section_record instances.
*                                     Each must expose a render({ add_hilite_row })
*                                     method that returns a Promise<HTMLElement>.
* @returns {Promise<HTMLElement>} A div.content_data element containing all row
*   nodes in their original server order, or the no_records placeholder.
*/
const get_content_data = async function(self, ar_section_record) {

	const fragment = new DocumentFragment()

	// add all section_record rendered nodes
		const ar_section_record_length = ar_section_record.length
		if (ar_section_record_length===0) {

			// no records found case
			const row_item = no_records_node()
			fragment.appendChild(row_item)

		}else{

			// rows
			// parallel mode
				const ar_promises = []
				for (let i = 0; i < ar_section_record_length; i++) {
					const render_promise_node = ar_section_record[i].render({
						add_hilite_row : true
					})
					ar_promises.push(render_promise_node)
				}

			// once rendered, append it preserving the order
				await Promise.all(ar_promises)
				.then(function(values) {
				  for (let i = 0; i < ar_section_record_length; i++) {
				  	const section_record_node = values[i]
					fragment.appendChild(section_record_node)
				  }
				});
		}

	// content_data
		const content_data = document.createElement('div')
			  content_data.classList.add('content_data', self.mode, self.type)
			  content_data.appendChild(fragment)


	return content_data
}//end get_content_data



/**
* REBUILD_COLUMNS_MAP
* Prepends the thesaurus section_id control column to the section's columns_map.
*
* This function adds an 'Id' column as the first (leftmost) column in the grid.
* The column uses the module-private render_column_id as its callback, which
* provides the term-linking button instead of the generic edit/navigate button
* from render_list_section.render_column_id.
*
* The section_id column definition:
*   - id: 'section_id' — must match the string used by ui.render_list_header to
*     identify the sort target.
*   - tipo: 'section_id' — used by the search/sort layer as a direct column name
*     (section_id is a real DB column, not a JSONB component path).
*   - width: 'minmax(auto, 6rem)' — CSS grid track size; fixed to 6 rem so that
*     numeric IDs up to 5–6 digits fit without clipping.
*   - path: a single-entry array with component_tipo: 'section_id', used by
*     section_record to build the sort event payload.
*   - callback: render_column_id — the thesaurus-specific id-column renderer.
*
* Short-circuit: if self.fixed_columns_map === true the already-built map is
* returned immediately (avoids duplicate prepend on pagination re-renders).
*
* (!) self.columns_map is expected to be a Promise or a resolved Array at the
* point this function is called. It is awaited with `await self.columns_map`
* so that both forms are handled correctly.
*
* @param {Object} self - The section instance. Reads self.fixed_columns_map,
*   self.columns_map, and self.section_tipo. Writes self.fixed_columns_map.
* @returns {Promise<Array>} Resolved columns_map array with the section_id column
*   prepended to any base columns defined in the ontology.
*/
const rebuild_columns_map = async function(self) {

	// columns_map already rebuilt case
		if (self.fixed_columns_map===true) {
			return self.columns_map
		}

	const columns_map = []

	// column section_id check
		columns_map.push({
			id			: 'section_id',
			label		: 'Id',
			tipo		: 'section_id', // used to sort only
			sortable	: true,
			width		: 'minmax(auto, 6rem)',
			path		: [{
				// note that component_tipo=section_id is valid here
				// because section_id is a direct column in search
				component_tipo	: 'section_id',
				// optional. Just added for aesthetics
				model			: 'component_section_id',
				name			: 'ID',
				section_tipo	: self.section_tipo
			}],
			callback	: render_column_id
		})

	// columns base
		const base_columns_map = await self.columns_map
		columns_map.push(...base_columns_map)

	// fixed as calculated
		self.fixed_columns_map = true


	return columns_map
}//end rebuild_columns_map



/**
* GET_BUTTONS
* Builds the section toolbar fragment containing the search toggle button.
*
* Returns null when self.context.buttons is absent (no ontology buttons configured
* for this section), allowing the caller to skip appending anything to the DOM.
*
* In this thesaurus view the toolbar is intentionally minimal — only the search
* toggle is rendered. The richer toolbar provided by view_default_list_section
* (show-all, delete, import, per-role guards) is not needed here because thesaurus
* term lists are navigated via the tree, not by bulk operations.
*
* (!) 'mousedown' is used instead of 'click' so the button receives the event
* before focus leaves any active input, which would otherwise fire blur/save
* handlers on the currently edited component first.
*
* Event published: 'toggle_search_panel_{self.id}'
*   Subscribed to by the section's search.js instance to show/hide the search
*   panel. The event channel name is namespaced by section id to avoid cross-talk
*   when multiple sections are visible simultaneously.
*
* @param {Object} self - The section instance. Reads self.context.buttons (used
*   only as an existence check) and self.id (for the event channel name).
* @returns {DocumentFragment|null} Fragment containing div.buttons_container
*   with the search button inside, or null if no buttons are configured.
*/
const get_buttons = function(self) {

	// ar_buttons list from context
		const ar_buttons = self.context?.buttons
		if(!ar_buttons) {
			return null;
		}

	// DocumentFragment
		const fragment = new DocumentFragment()

	// buttons_container
		const buttons_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'buttons_container',
			parent			: fragment
		})

	// filter button (search) . Show and hide all search elements
		const filter_button	= ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'warning search',
			inner_html		: get_label.find || 'Search',
			parent			: buttons_container
		})
		filter_button.addEventListener('mousedown', function(e) {
			e.stopPropagation()
			// Note that self section is who is observing this event (init)
			event_manager.publish('toggle_search_panel_'+self.id)
		})

	return fragment
}//end get_buttons




/**
* RENDER_COLUMN_ID
* Builds the DocumentFragment that populates the 'id' column for one row in
* the thesaurus section list. Called as the 'callback' property of the
* section_id column descriptor produced by rebuild_columns_map().
*
* This is the thesaurus-specific variant of render_column_id. Unlike the
* generic version in render_list_section.js it only handles a single use-case:
* linking a thesaurus term to a portal via the tool_indexation workflow.
*
* Behaviour by context:
*
*   tool_indexation initiator (self.initiator contains 'tool_indexation_'):
*     A link button is rendered next to the section_id span. Clicking it
*     publishes the 'link_term_{linker_id}' event_manager channel, passing
*     { section_tipo, section_id, label }. The event is published on:
*       - window.opener.event_manager  when self.caller.area_thesaurus.linker.caller
*         is null (DS window-opener scenario — the thesaurus was opened in a new
*         browser window by a Document Server page).
*       - window.event_manager         in the standard indexation case (thesaurus
*         rendered inside an iframe whose parent page owns the linker component).
*     The linker is resolved from self.caller.area_thesaurus.linker, where
*     self.caller is the area_thesaurus instance. It is expected to be a
*     component_portal (or equivalent) that subscribes to the 'link_term_' event.
*
*   No other cases: the function returns an empty fragment when self.initiator
*     does not match 'tool_indexation_*'. (No edit/navigate buttons are added.)
*
* Font-size adaptation:
*   get_font_fit_size() computes a scaled font size so that long section IDs fit
*   within the column width. The base size (1.25 rem) matches the --font_size CSS
*   variable defined in list.less. If the computed size differs from the base,
*   it is applied as an inline CSS custom property (--font_size) on the span.
*
* Debug mode:
*   When SHOW_DEBUG is true, the section_id span's title attribute is set to the
*   paginated_key so developers can verify SQO offset arithmetic.
*
* (!) If linker is undefined when the link button is clicked, a console.warn is
* emitted and the handler returns false without publishing the event. This guard
* exists because the linker is set asynchronously during area_thesaurus.init()
* and may not be available if the button is clicked before init completes.
*
* @param {Object} options               - Row render options supplied by section_record.
* @param {Object} options.caller        - The section or portal instance that owns
*                                         this list (typically an area_thesaurus section).
* @param {string|number} options.section_id   - The record's section_id value.
* @param {string} options.section_tipo        - The record's ontology tipo, e.g. 'oh1'.
* @param {number} options.paginated_key       - Zero-based position of this row in the
*                                              full result set; used as a debug hint.
* @returns {DocumentFragment} Fragment containing the rendered id-column nodes.
*   May be empty if no matching case fires in the switch.
*/
const render_column_id = function(options) {

	// options
		const self			= options.caller // object instance, usually section or portal
		const section_id	= options.section_id
		const section_tipo	= options.section_tipo
		const paginated_key	= options.paginated_key // int . Current item paginated_key in all result

	// permissions
		const permissions = self.permissions

	// show_interface
		const show_interface = self.show_interface || {}

	// DocumentFragment
		const fragment = new DocumentFragment()

	// linker
		// linker is set on the area_thesaurus instance during init() when an 'initiator'
		// URL variable is present. The chain is: self (section) → self.caller (area_thesaurus)
		// → self.caller.area_thesaurus.linker. When linker.caller is null the thesaurus
		// was opened in a new window (DS scenario), so the event must target window.opener.
		const linker = self.caller?.area_thesaurus?.linker
	// section_id
		const section_id_node = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'section_id',
			text_content	: section_id
		})
		if(SHOW_DEBUG===true) {
			section_id_node.title = 'paginated_key: ' + paginated_key
		}
		// adjust the font size to fit it into the column
		// @see https://www.freecodecamp.org/news/learn-css-units-em-rem-vh-vw-with-code-examples/#what-are-vw-units
		const base_size	= 1.25 // defined as --font_size: 1.25rem; into CSS (list.less)
		const font_size	= get_font_fit_size(section_id, base_size, 4)
		if (font_size!==base_size) {
			section_id_node.style.setProperty('--font_size', `${font_size}rem`);
		}

	// buttons
		switch(true){

			// initiator. is a url var used in iframe containing section list to link to opener portal
			case (self.initiator && self.initiator.indexOf('tool_indexation_')!==-1): {

				// link_button. component portal caller (link)
					const link_button = ui.create_dom_element({
						element_type	: 'button',
						class_name		: 'link_button',
						parent			: fragment
					})
					link_button.addEventListener('click', function(e) {
						e.stopPropagation()

						// publish event link_term
						if (!linker) {
							console.warn(`Error. self.linker is not defined.
								Please set ts_object linker property with desired target component portal:`, self);
							return false
						}
						// linker id. A component_portal instance is expected as linker
						const linker_id = linker?.id
						// source_window.event_manager.publish('link_term_' + linker_id,
						// Determine which window owns the target event_manager:
						// - window.opener: DS scenario (thesaurus opened in a new window)
						// - window:        standard indexation (thesaurus in an iframe, same origin)
						const window_base = !linker?.caller
							? window.opener // case DS opening new window
							: window // default case (indexation)
						window_base.event_manager.publish('link_term_' + linker_id, {
							section_tipo	: section_tipo,
							section_id		: section_id,
							label			: self.label ? self.label : ''
						})

					})
					link_button.appendChild(section_id_node)
					// link_icon
					ui.create_dom_element({
						element_type	: 'span',
						class_name		: 'button arrow_link icon',
						parent			: link_button
					})
				break;
			}
		}


	return fragment
}//end render_column_id




// @license-end
