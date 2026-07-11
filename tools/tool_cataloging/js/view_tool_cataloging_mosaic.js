// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global DD_TIPOS, get_label */
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../../core/common/js/event_manager.js'
	import {get_section_records} from '../../../core/section/js/section.js'
	import {ui} from '../../../core/common/js/ui.js'
	import {set_element_css} from '../../../core/page/js/css.js'
	import {
		render_column_id
	} from '../../../core/section/js/render_list_section.js'



/**
* VIEW_TOOL_CATALOGING_MOSAIC
* Custom section view rendered by tool_cataloging on the left pane of the
* split-pane cataloging window. It presents the source section's records as a
* draggable mosaic grid so users can drag cards onto thesaurus nodes in the
* right pane to classify them.
*
* ARCHITECTURE OVERVIEW
* This module is not a standalone component — it is injected into a section
* instance at render time via `section.render_views`. The section's `self` object
* (a tool_cataloging-owned section instance) is passed directly to every function
* in this module; all persistent state lives in that section instance.
*
* COLUMNS MAP CONTRACT
* Each entry in `self.columns_map` may carry two optional boolean flags:
*   - `in_mosaic: true`  — include this column in the main mosaic grid
*   - `hover: true`      — include this column in the hover overlay
* Both sets of columns are filtered from the full columns_map and routed to
* separate `get_section_records` calls before being merged with control columns
* added by `rebuild_columns_map`.
*
* DRAG-AND-DROP FLOW
* 1. `render` calls `get_section_records` to obtain section_record instances.
* 2. `get_content_data` renders each record node and calls `set_drag_and_drop`.
* 3. `set_drag_and_drop` marks the node draggable and attaches a dragstart handler.
* 4. `on_dragstart_mosaic` serialises locator + paginated_key as JSON in
*    dataTransfer so the drop target (thesaurus) can read them.
* 5. On drop the thesaurus fires `ts_add_child_tool_cataloging`; `render_column_drag`
*    is subscribed to this event and adds CSS class `used` to the drag indicator
*    of the matching mosaic card.
*
* HOVER OVERLAY
* A parallel set of section_records (hover columns) is rendered into a hidden
* `hover_body` div. On `mouseenter` the appropriate hover record is moved into the
* hovered card node, revealed, and then returned to `hover_body` on `mouseleave`.
* Events are keyed by `mosaic_hover_<id_base>_<section_tipo>_<section_id>` to
* avoid cross-record collisions.
*
* Exports:
*   view_tool_cataloging_mosaic           — constructor (no-op; required by module system)
*   view_tool_cataloging_mosaic.render    — main entry point called by section.render
*/
export const view_tool_cataloging_mosaic = function() {

	return true
}//end view_tool_cataloging_mosaic



/**
* RENDER
* Main entry point for the mosaic view. Called by the section's render dispatcher
* when `self.view === 'tool_cataloging_mosaic'`. Builds the full DOM structure:
* search toggle button, paginator, mosaic list body, optional hover overlay, and
* the section wrapper. Also injects scoped CSS rules derived from `self.context.css`.
*
* When `options.render_level === 'content'`, only the inner `content_data` node is
* returned (used on paginator page-change to refresh only the record grid without
* rebuilding the outer chrome).
*
* Side effects:
* - Pushes all built section_record instances into `self.ar_instances` so that
*   `common.destroy()` can clean them up on navigation.
* - Overwrites `self.columns_map` with the mosaic-filtered + augmented version so
*   subsequent renders use the same column set.
* - Sets `self.node_body` to the `list_body` div (used by pagination selection).
* - Sets `self.search_container` pointer (populated later by the search subsystem).
* - Calls `set_element_css` to queue a scoped CSS rule for the list wrapper.
*
* @param {Object} self - Section instance (`section_to_cataloging`) owned by tool_cataloging.
*   Key properties read: columns_map, show_interface, ar_instances, total, paginator,
*   filter, buttons, context, section_tipo, tipo, mode, view, type, model, events_tokens.
* @param {Object} options
* @param {string} [options.render_level='full'] - 'full' builds the entire wrapper;
*   'content' returns only the refreshed content_data node.
* @returns {Promise<HTMLElement>} Resolves to the `<section>` wrapper node on full render,
*   or the `content_data` div on content-only render.
*/
view_tool_cataloging_mosaic.render = async function(self, options) {

	// options
		const render_level = options.render_level || 'full'

	// hover_body. Alternative section_record with selected ddo to show when user hover the mosaic
		const hover_body = await (async ()=>{

			// hover_body
				const hover_body = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'hover_body display_none'
				})

			// columns
				const hover_columns		= self.columns_map.filter(el => el.hover===true)
				const hover_columns_map	= await rebuild_columns_map(hover_columns, self, false)

			// interface configurations
				// button_delete prevent to show
				self.show_interface.button_delete = false
				// button edit click, opens record in a new window instead navigate
				self.show_interface.button_edit_options.action_mousedown = 'open_window'

			// hover_view (body)
				const hover_ar_section_record = await get_section_records({
					caller		: self,
					mode		: 'list',
					columns_map	: hover_columns_map,
					id_variant	: 'hover'
				})
				// store to allow destroy later
				self.ar_instances.push(...hover_ar_section_record)
				const hover_view = await render_hover_view(self, hover_ar_section_record, hover_body)
				hover_body.appendChild(hover_view)

			return hover_body
		})()

	// content_data. Create the mosaic with only the marked ddo as "mosaic" with true value
		// columns_map
			const base_columns_map	= self.columns_map.filter(el => el.in_mosaic===true)
			const columns_map		= await rebuild_columns_map(base_columns_map, self, true)
			self.columns_map		= columns_map

		// ar_section_record. section_record instances (initialized and built)
			const ar_section_record	= await get_section_records({
				caller		: self,
				mode		: 'list',
				columns_map	: columns_map
			})
			// store to allow destroy later
			self.ar_instances.push(...ar_section_record)

		// content_data
			const content_data = await get_content_data(self, ar_section_record)
			if (render_level==='content') {

				// force to refresh paginator
				if (self.paginator) {
					self.paginator.refresh()
				}

				return content_data
			}

	// DocumentFragment
		const fragment = new DocumentFragment()

	// buttons add
		if (self.buttons) {
			const buttons_node = get_buttons(self);
			if(buttons_node){
				fragment.appendChild(buttons_node)
			}
		}

	// search filter node
		if (self.filter) {
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
				self.paginator.render().then(paginator_wrapper =>{
					paginator_container.appendChild(paginator_wrapper)
				})
			})
		}

	// list_body
		const list_body = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'list_body ' + self.mode +  ' view_'+self.view,
			parent			: fragment
		})
		// fix last list_body (for pagination selection)
		self.node_body = list_body
		// content_data append
		list_body.appendChild(content_data)

		// list_body css
			const selector		= `${self.section_tipo}_${self.tipo}.view_tool_cataloging_mosaic`
			const css_object	= {}
			if (self.context.css) {
				// use defined section css
				for(const property in self.context.css) {
					css_object[property] = self.context.css[property]
				}
			}
			// use calculated css
			set_element_css(selector, css_object)


	// wrapper
		const wrapper = ui.create_dom_element({
			element_type	: 'section',
			class_name		: `wrapper_${self.type} ${self.model} ${self.tipo} ${self.section_tipo+'_'+self.tipo} view_${self.context.view}`
		})
		wrapper.appendChild(fragment)
		// set pointers
		wrapper.content_data	= content_data
		wrapper.list_body		= list_body


	return wrapper
}//end render



/**
* GET_CONTENT_DATA
* Renders each section_record in `ar_section_record`, attaches drag-and-drop and
* hover events to every record node, then places them all inside a `content_data`
* div returned by `ui.tool.build_content_data`.
*
* Hover events use namespaced event_manager channels:
*   `mosaic_hover_<id_base>_<section_tipo>_<section_id>`     — published on mouseenter
*   `mosaic_mouseleave_<id_base>_<section_tipo>_<section_id>` — published on mouseleave
*
* CSS from `self.context.css['.content_data'].style.height` is applied inline if
* present (legacy selector support for per-section overrides stored in the ontology).
*
* @param {Object} self - Section instance.
* @param {Array<Object>} ar_section_record - Array of already-built section_record instances.
* @returns {Promise<HTMLElement>} content_data div containing all rendered record nodes.
*/
const get_content_data = async function(self, ar_section_record) {

	// build_values
		const fragment = new DocumentFragment()

		// add all section_record rendered nodes
			const ar_section_record_length = ar_section_record.length
			if (ar_section_record_length>0) {

				for (let i = 0; i < ar_section_record_length; i++) {

					// section record
						const section_record		= ar_section_record[i]
						const section_record_node	= await section_record.render()

						set_drag_and_drop({
							section_record_node	: section_record_node,
							total_records		: self.total,
							locator				: section_record.locator,
							paginated_key		: i,
							caller				: self
						})

					// mouseenter event
						section_record_node.addEventListener('mouseenter',function(e){
							e.stopPropagation()
							const event_id = `mosaic_hover_${section_record.id_base}_${section_record.caller.section_tipo}_${section_record.caller.section_id}`
							event_manager.publish(event_id, this)
							section_record_node.classList.add('mosaic_over')
						})

					// mouseleave event
						section_record_node.addEventListener('mouseleave',function(e){
							e.stopPropagation()
							const event_id = `mosaic_mouseleave_${section_record.id_base}_${section_record.caller.section_tipo}_${section_record.caller.section_id}`
							event_manager.publish(event_id, this)
							section_record_node.classList.remove('mosaic_over')
						})

					// section record append
						fragment.appendChild(section_record_node)
				}
			}//end if (ar_section_record_length===0)

	// content_data
		const content_data = ui.tool.build_content_data(self)
			  content_data.appendChild(fragment)

	// css
		const element_css	= self.context.css || {}
		const legacy_selector_content_data = '.content_data'
		if (element_css[legacy_selector_content_data]) {
			// style
				if (element_css[legacy_selector_content_data].style) {
					// height from style
					if (element_css[legacy_selector_content_data].style.height) {
						content_data.style.setProperty('height', element_css[legacy_selector_content_data].style.height);
					}
				}
		}


	return content_data
}//end get_content_data



/**
* SET_DRAG_AND_DROP
* Marks a rendered section_record node as draggable and wires the dragstart handler.
* Called once per record node during `get_content_data`; `options` is forwarded
* verbatim to `on_dragstart_mosaic` which serialises the transfer payload.
*
* @param {Object} options
* @param {HTMLElement} options.section_record_node - The rendered section_record DOM node to make draggable.
* @param {number|null} options.total_records - Total number of records in the paginated result (self.total).
* @param {Object} options.locator - Locator object for the dragged record ({ section_id, section_tipo }).
* @param {number} options.paginated_key - Zero-based index of this record in the current page's ar_section_record.
* @param {Object} options.caller - The section instance (self) that owns this mosaic.
* @returns {boolean} Always true.
*/
const set_drag_and_drop = function(options) {

	// options
		const drag_node = options.section_record_node

	// drag_node
		drag_node.draggable = true
		drag_node.classList.add('draggable')
		drag_node.addEventListener('dragstart', function(e){
			on_dragstart_mosaic(this, e, options)
		})


	return true
}//end set_drag_and_drop



/**
* ON_DRAGSTART_MOSAIC
* Serialises the drag payload and stores it in `event.dataTransfer` as
* `text/plain` JSON. The payload carries enough information for the thesaurus
* drop handler to identify the record, retrieve it, and fire the
* `ts_add_child_tool_cataloging` event with the correct locator.
*
* Payload shape:
* ```json
* {
*   "locator"       : { "section_id": "42", "section_tipo": "dd100" },
*   "paginated_key" : 3,
*   "caller"        : "tool_cataloging"
* }
* ```
* `caller` is a fixed string tag so the thesaurus drop handler can distinguish
* drops originating from this tool versus other drag sources.
*
* The commented-out `node.classList.add('dragging')` line was left for future
* visual feedback during drag; do not remove it.
*
* @param {HTMLElement} node - The section_record node being dragged (same as `this` in the dragstart listener).
* @param {DragEvent} event - The native dragstart event; stopPropagation is called to avoid
*   outer containers capturing the drag.
* @param {Object} options
* @param {Object} options.locator - Locator of the dragged section_record.
* @param {number} options.paginated_key - Zero-based position of the record in the current page.
* @returns {boolean} Always true.
*/
const on_dragstart_mosaic = function(node, event, options) {
	event.stopPropagation();

	// options
		const locator		= options.locator
		const paginated_key	= options.paginated_key

	// will be necessary the original locator of the section_record and the paginated_key (the position in the array of data)
		const transfer_data = {
			locator			: locator,
			paginated_key	: paginated_key,
			caller			: 'tool_cataloging'
		}

		// the data will be transfer to drop in text format
		const data = JSON.stringify(transfer_data)

	event.dataTransfer.effectAllowed = 'move';
	event.dataTransfer.setData('text/plain', data);

	// style the drag element to be showed in drag mode
	// node.classList.add('dragging')

	return true
}//end on_dragstart_mosaic



/**
* RENDER_HOVER_VIEW
* Renders each hover-column section_record and wires bidirectional event_manager
* subscriptions so the correct hover card appears over the hovered mosaic card.
*
* HOW THE HOVER MECHANISM WORKS
* `hover_body` is a hidden container that holds all hover section_records. When the
* user hovers a mosaic card, `get_content_data`'s `mouseenter` handler publishes
* `mosaic_hover_<key>`. The matching `fn_mosaic_hover` subscriber:
*   1. Hides all children of `hover_body` (adds `display_none`).
*   2. Moves its own `section_record_node` into the hovered card (caller_node.prepend).
*   3. Removes `display_none` from that node so it is visible.
*
* On `mouseleave` (`fn_mosaic_mouseleave`):
*   1. Returns `section_record_node` to `hover_body` (appendChild).
*   2. Hides all children of `hover_body` again for the next hover.
*
* Event subscriptions are guarded with `event_manager.event_name_exists` to
* prevent double-registration across pagination renders. Each subscription token
* is pushed onto `self.events_tokens` so `common.destroy()` can unsubscribe.
*
* @param {Object} self - Section instance; `self.events_tokens` is mutated.
* @param {Array<Object>} ar_section_record - Array of built hover-column section_record instances.
* @param {HTMLElement} hover_body - Hidden container that owns the hover record nodes when idle.
* @returns {Promise<DocumentFragment>} Fragment containing all hover section_record nodes
*   (already subscribed; caller should append this to `hover_body`).
*/
const render_hover_view = async function(self, ar_section_record, hover_body) {

	// build_values
		const fragment = new DocumentFragment()

	// add all section_record rendered nodes
		const ar_section_record_length = ar_section_record.length
		if (ar_section_record_length>0) {

			for (let i = 0; i < ar_section_record_length; i++) {

				// section_record
					const section_record		= ar_section_record[i]
					const section_record_node	= await section_record.render()
						  section_record_node.classList.add('sr_mosaic_hover')

				// event subscribe
				// On user hover mosaic a event that we subscribe here to show the
				// proper hover record and hide the others
					// over event
					const fn_mosaic_hover = function(caller_node) {
						// hide all
							const ar_children_nodes	= hover_body.children;
							const len			= ar_children_nodes.length
							for (let i = len - 1; i >= 0; i--) {
								const node = ar_children_nodes[i]
								node.classList.add('display_none')
							}

						// move to the section record
							caller_node.prepend(section_record_node)
							section_record_node.classList.remove('display_none')
					}
					const event_id_hover = `mosaic_hover_${section_record.id_base}_${section_record.caller.section_tipo}_${section_record.caller.section_id}`
					const found_hover	 = event_manager.event_name_exists(event_id_hover)
					if (!found_hover) {
						const token = event_manager.subscribe(event_id_hover, fn_mosaic_hover)
						self.events_tokens.push(token)
					}

					// leave event
					const fn_mosaic_mouseleave = function() {
						// return
						hover_body.appendChild(section_record_node)
						// hide all
						const ar_children_nodes	= hover_body.children;
						const len				= ar_children_nodes.length
						for (let i = len - 1; i >= 0; i--) {
							const node = ar_children_nodes[i]
							node.classList.add('display_none')
						}
					}
					const event_id_mouseleave	= `mosaic_mouseleave_${section_record.id_base}_${section_record.caller.section_tipo}_${section_record.caller.section_id}`
					const found_mouseleave		= event_manager.event_name_exists(event_id_mouseleave)
					if (!found_mouseleave) {
						const token = event_manager.subscribe(event_id_mouseleave, fn_mosaic_mouseleave)
						self.events_tokens.push(token)
					}

				// section record append
					fragment.appendChild(section_record_node)
			}
		}//end if (ar_section_record_length===0)


	return fragment
}//end render_hover_view



/**
* REBUILD_COLUMNS_MAP
* Builds the final columns_map array to pass to `get_section_records` by prepending
* or appending control columns around the caller-supplied data columns:
*
*   Hover mode  (view_mosaic=false):  section_id column prepended, no drag column.
*   Mosaic mode (view_mosaic=true):   no section_id, drag indicator column appended.
*
* The `section_id` control column uses `render_column_id` from render_list_section.js.
* The `drag` control column uses `render_column_drag` (local); its `id` field maps to
* the CSS class `column_drag` applied by section_record.
*
* Note: the label 'Info' on the drag column entry matches the column's visual role
* as both a drag handle and a used-indicator, not the standard Info button.
*
* @param {Array<Object>} base_columns_map - Filtered subset of section column descriptors
*   (each has at minimum: `tipo`, `callback`, and optionally `label`, `width`).
* @param {Object} self - Section instance (currently unused inside the function but kept
*   for API symmetry with other rebuild helpers across the codebase).
* @param {boolean} view_mosaic - True when building the main mosaic columns; false when
*   building the hover overlay columns.
* @returns {Promise<Array<Object>>} Augmented columns_map ready for get_section_records.
*/
const rebuild_columns_map = async function(base_columns_map, self, view_mosaic) {

	const full_columns_map = []

	// column section_id
		if(!view_mosaic) {
			full_columns_map.push({
				id			: 'section_id',
				label		: 'Id',
				width		: 'auto',
				callback	: render_column_id
			})
		}

	// base_columns_map
		full_columns_map.push(...base_columns_map)

	// column info and remove
		if(view_mosaic) {
			full_columns_map.push({
				id			: 'drag',
				label		: 'Info',
				callback	: render_column_drag
			})
		}


	return full_columns_map
}//end rebuild_columns_map



/**
* RENDER_COLUMN_DRAG
* Column cell renderer that produces the drag handle for each mosaic card. The
* handle doubles as a visual "used" indicator: it gains the CSS class `used` if
* the record has already been dropped onto a thesaurus hierarchy node.
*
* USED DETECTION LOGIC
* 1. Reads `area_thesaurus.data` to find the dd100 (DEDALO_THESAURUS_TIPO) datum,
*    then extracts its `value` array filtering for `type === 'hierarchy'` nodes.
*    These are the hierarchy section types that are loaded as valid drop targets.
* 2. Reads `section_record.datum.data` for the
*    `DD_TIPOS.DEDALO_SECTION_INFO_INVERSE_RELATIONS` (dd1596) datum matching the
*    current record's locator. This datum carries the record's incoming relation
*    list from the server-side section_info pre-calculation.
* 3. `get_related_hierarchy` walks that relation list and returns true if any entry's
*    `from_section_tipo` matches one of the loaded hierarchy target_section_tipos.
*
* EVENT SUBSCRIPTION
* Subscribes to `ts_add_child_tool_cataloging` on every render call — one
* subscription per card. (!) This creates one persistent listener per card on the
* shared event_manager channel. The subscription is not stored in
* `self.events_tokens`, so these listeners are NOT cleaned up by `common.destroy`.
* This is a known limitation; the `add_data_to_ts_component` handler is idempotent
* and the event fires rarely, so the practical impact is low.
*
* @param {Object} options
* @param {Object} options.caller - The section_record instance rendering this column.
* @param {Object} options.caller.caller - The tool_cataloging-owned section instance
*   (`tool_caller`), giving access to `area_thesaurus`.
* @param {Object} options.locator - Locator of the record being rendered
*   ({ section_id, section_tipo }).
* @returns {DocumentFragment} Fragment containing the dragger div (and the used indicator).
*/
const render_column_drag = function(options) {

	// options
		const tool_caller		= options.caller.caller
		const section_record	= options.caller
		const locator			= options.locator

	// area_thesaurus
		const area_thesaurus = tool_caller.area_thesaurus

	// get hierarchy sections
	const data			= area_thesaurus.data.find(item => item.tipo==='dd100')
	const hierarchies	= data && data.value
		? data.value.filter(node => node.type==='hierarchy')
		: []

	// get inverse_relations data
		const inverse_relations_tipo = DD_TIPOS.DEDALO_SECTION_INFO_INVERSE_RELATIONS
		const relation_data = section_record.datum.data.find(el => el.tipo === inverse_relations_tipo
			&& el.section_tipo === locator.section_tipo
			&& el.section_id === locator.section_id)

	// check if the hierarchies of catalog loaded in area_thesarurs has relation with current locator.
	function get_related_hierarchy(relation_value) {
		// get every target_section_tipo loaded as possible catalog hierarchy
		for (let i = hierarchies.length - 1; i >= 0; i--) {
			const current_tipo = hierarchies[i].target_section_tipo
			const found = relation_value.find(el => el.from_section_tipo === current_tipo)
			if(found){
				return true
			}
		}
		return false
	}
	// if current section_record has relations, it has value, check with hierarchies
	// else it doesn't has value and set use as false
		const used = relation_data && relation_data.value
			? get_related_hierarchy(relation_data.value)
			: false

	// DocumentFragment
		const fragment = new DocumentFragment()

	// already used columns drag indication
		const used_class = used
			? ' used'
			: ''

	// drag_item
		const draged_node = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'dragger' + used_class,
			parent			: fragment
		})

	// ts_add_child_tool_cataloging event subscription
		// when the user drop a node in thesaurus, it send an event
		// use it to change the class of the dragged
		event_manager.subscribe('ts_add_child_tool_cataloging', add_data_to_ts_component)
		async function add_data_to_ts_component(options) {
			// the locator drag by the user (the section as the term of the ts)
			const added_locator = options.locator

			if(added_locator.section_id === locator.section_id && added_locator.section_tipo === locator.section_tipo){
				draged_node.classList.add('used')
			}
		}


	return fragment
}//end render_column_drag



/**
* GET_BUTTONS
* Builds the buttons toolbar for the mosaic view. Currently produces a single
* "Search" toggle button that publishes `toggle_search_panel_<self.id>` via the
* event_manager. The section's init code subscribes to this channel and shows or
* hides the search panel in response.
*
* The fragment is appended to the outer wrapper by `render` before the list_body
* so it appears at the top of the section.
*
* @param {Object} self - Section instance; `self.id` is used to namespace the event.
* @returns {DocumentFragment} Fragment with a `buttons_container` div holding the search button.
*/
const get_buttons = function(self) {

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
			event_manager.publish('toggle_search_panel_'+self.id)
		})


	return fragment
}//end get_buttons



// @license-end
