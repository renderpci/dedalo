// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global  */
/*eslint no-undef: "error"*/



/**
* VIEW_COINS_MOSAIC_PORTAL
*
* Custom `component_portal` view module for the `tool_numisdata_order_coins` tool.
* Renders the left-hand source panel — the "coins mosaic" — where a numismatic portal
* is displayed as a draggable tile grid that the user can drag from to populate the
* ordered coins list on the right.
*
* Architecture overview
* ---------------------
* This module is dynamically imported and registered as a custom view by
* `render_tool_numisdata_order_coins.get_content_data_edit`, which pushes an entry
* into `self.coins.render_views`:
*
*   { view: 'coins_mosaic', mode: 'edit', render: 'view_coins_mosaic_portal',
*     path: '../../../tools/tool_numisdata_order_coins/js/view_coins_mosaic_portal.js' }
*
* The portal render dispatcher (`render_edit_component_portal.prototype.edit`) then
* calls `view_coins_mosaic_portal.render(self, options)` when `self.context.view`
* equals `'coins_mosaic'`.
*
* Two parallel sets of section records are built:
*
*   1. MOSAIC records (in_mosaic === true columns) — the visible draggable tiles.
*      Each tile renders its coin image plus an "Info" column produced by
*      `render_column_original_copy`, which exposes:
*        - Original / Copy radio buttons (wired to tipo numisdata157, the discard
*          component).  Value '1' = original, '2' = copy (stored in numisdata341).
*        - Snap checkbox: adds/removes the CSS class `snap` on the tile's row
*          container, locking the tile's aspect ratio for visual alignment.
*        - A drag handle div (`div.drag`) that becomes `div.drag.used` once the
*          coin has been assigned to an ordered position.
*
*   2. HOVER records (hover === true columns) — a lightweight detail panel that
*      is teleported into (prepended to) the hovered tile via event_manager
*      pub/sub.  Event names follow the pattern:
*        `mosaic_hover_{id_base}_{section_tipo}_{section_id}`   — on mouseenter
*        `mosaic_mouseleave_{id_base}_{section_tipo}_{section_id}` — on mouseleave
*
* Drag-and-drop integration
* -------------------------
* Each mosaic tile is made draggable via the local `drag_and_drop` helper, which
* calls `on_dragstart_mosaic` from `core/component_portal/js/drag_and_drop.js`.
* The dragover/dragleave/drop handlers are intentionally commented out here
* because the drop target lives in the right-hand ordered-coins portal, not
* in this mosaic; those events are wired by `render_tool_numisdata_order_coins.drop`.
*
* Columns map contract
* --------------------
* `self.columns_map` is an Array of column descriptor objects.  Each descriptor
* may carry the boolean flags:
*   - `in_mosaic : true`  — include this column in the main mosaic tiles.
*   - `hover     : true`  — include this column in the hover detail panel.
*
* `rebuild_columns_map` prepends a `section_id` column (for hover view only) and
* appends the custom `original` info column (for mosaic view only).
*
* Exported symbols
*   view_coins_mosaic_portal          — constructor (no-op, used as namespace)
*   view_coins_mosaic_portal.render   — async render entry point
*
* @module view_coins_mosaic_portal
* @see render_tool_numisdata_order_coins.js  for the parent tool render layer.
* @see tool_numisdata_order_coins.js         for the tool constructor and set_original_copy.
* @see core/component_portal/js/drag_and_drop.js  for on_dragstart_mosaic.
*/



// imports
	import {event_manager} from '../../../core/common/js/event_manager.js'
	import {get_section_records} from '../../../core/section/js/section.js'
	import {ui} from '../../../core/common/js/ui.js'
	import {
		render_column_id,
		get_buttons,
		activate_autocomplete,
		render_references
	} from '../../../core/component_portal/js/render_edit_component_portal.js'
	import {
		on_dragstart_mosaic,
		on_dragover,
		on_dragleave,
		on_drop
	} from '../../../core/component_portal/js/drag_and_drop.js'



/**
* VIEW_COINS_MOSAIC_PORTAL
* Constructor / namespace object for the coins-mosaic portal view.
* All functionality lives on the static `.render` method; the constructor
* itself is a no-op placeholder that returns `true`.
*/
export const view_coins_mosaic_portal = function() {

	return true
}//end view_coins_mosaic_portal



/**
* RENDER
* Manages the component's logic and appearance in client side
*
* Entry point called by the `component_portal` render dispatcher when
* `self.context.view === 'coins_mosaic'`.  Builds two independent sets of
* section records — one for the hoverable detail panel and one for the
* draggable mosaic tiles — then assembles and returns the full wrapper node.
*
* When `options.render_level === 'content'` (e.g. during a refresh cycle)
* only the inner `content_data` HTMLElement is returned, skipping the wrapper
* scaffold so the caller can splice it into an existing DOM tree.
*
* Side effects:
*   - Pushes all created section-record instances onto `self.ar_instances` so
*     they are destroyed when the portal is rebuilt or destroyed.
*   - Attaches a click listener on the wrapper that lazily activates the
*     autocomplete service (via `activate_autocomplete`) when `self.active`.
*
* @param {Object} self    - The `component_portal` instance acting as caller.
*                           Key properties consumed:
*                           `self.columns_map` {Array}   — column descriptors (see module header).
*                           `self.ar_instances` {Array}  — accumulator for created instances.
*                           `self.permissions` {number}  — 1=read-only, 2=edit.
*                           `self.mode` {string}         — current mode string (e.g. 'edit').
*                           `self.view` {string}         — resolved view name.
*                           `self.context.view` {string} — context view (echoed onto wrapper class).
*                           `self.context.css` {Object}  — optional CSS overrides for content_data.
*                           `self.total` {number}        — total records (used by drag_and_drop).
*                           `self.active` {boolean}      — whether the component is focused.
* @param {Object} options - Render options.
*   @param {string} [options.render_level='full'] - 'full' builds the complete wrapper;
*          'content' returns only the inner content_data node.
* @returns {Promise<HTMLElement>} The assembled wrapper node (render_level='full') or
*          the content_data div (render_level='content').
*/
view_coins_mosaic_portal.render = async function(self, options) {
	// options
		const render_level 	= options.render_level || 'full'


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

		// content_data
			const ar_section_record	= await get_section_records({
				caller		: self,
				mode		: 'list',
				columns_map	: columns_map
			})
			// store to allow destroy later
			self.ar_instances.push(...ar_section_record)

			const content_data = await get_content_data(self, ar_section_record)


		// render_level
			if (render_level==='content') {
				return content_data
			}

		// list_body
			const list_body = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'list_body ' + self.mode +  ' view_'+self.view,
			})

			list_body.appendChild(content_data)


	// buttons
		const buttons = (self.permissions > 1)
			? get_buttons(self)
			: null

	// top
		// const top = get_top(self)

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_edit(self, {
			// content_data	: content_data,
			buttons			: buttons,
			list_body		: list_body
			// top			: top
		})
		wrapper.classList.add('portal', 'view_'+self.context.view)
		// set pointers
		wrapper.list_body		= list_body
		wrapper.content_data	= content_data

	// autocomplete
		wrapper.addEventListener('click', function(e) {
			e.stopPropagation()
			setTimeout(function(){
				if (self.active) {
					activate_autocomplete(self, wrapper)
				}
			}, 1)
		})



	return wrapper
}//end render



/**
* GET_CONTENT_DATA
* Render all received section records and place it into a new div 'content_data'
*
* Iterates over `ar_section_record`, renders each one, then:
*   1. Wires drag-and-drop via `drag_and_drop()` so tiles can be dragged onto
*      the ordered-coins right panel.
*   2. Publishes event_manager events on mouseenter / mouseleave so that the
*      hover detail panel can be teleported into the hovered tile.
*      Event IDs follow the pattern:
*        `mosaic_hover_{id_base}_{section_tipo}_{section_id}`
*        `mosaic_mouseleave_{id_base}_{section_tipo}_{section_id}`
*   3. Applies height CSS from `self.context.css['.content_data'].style.height`
*      if present (legacy per-instance CSS override from the ontology).
*
* @param {Object} self              - The component_portal instance.
* @param {Array}  ar_section_record - Array of section_record instances to render.
* @returns {Promise<HTMLElement>} The assembled content_data div containing all tile nodes.
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

						drag_and_drop({
							section_record_node	: section_record_node,
							paginated_key		: i,
							total_records		: self.total,
							locator 			: section_record.locator,
							caller 				: self
						})

						// mouseover event
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
			}//end if (ar_section_record_length>0)

	// content_data
		const content_data = ui.component.build_content_data(self)
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
* DRAG_AND_DROP
* Set section_record_node ready to drag and drop
*
* Marks the given tile node as an HTML5 drag source by setting `draggable=true`
* and attaching `dragstart` via `on_dragstart_mosaic`.  This serialises the
* record's locator and paginated position into `dataTransfer` so the drop
* target (the ordered-coins portal) can read it.
*
* Note: The dragover / dragleave / drop listeners are intentionally left
* commented out — the drop targets live in the right-hand ordered-coins portal
* and are wired by `render_tool_numisdata_order_coins.prototype.drop`.
*
* @param {Object}      options
* @param {HTMLElement} options.section_record_node - The tile DOM node to make draggable.
* @param {number}      options.paginated_key       - Zero-based index of this record in the
*                                                    current page (passed to on_dragstart_mosaic).
* @param {number}      options.total_records       - Total matched records for the portal.
* @param {Object}      options.locator             - Locator object for the dragged record.
* @param {Object}      options.caller              - The component_portal instance.
* @returns {boolean} Always true.
*/
const drag_and_drop = function(options) {

	// options
		const drag_node			= options.section_record_node

	drag_node.draggable = true
	drag_node.classList.add('draggable')
	drag_node.addEventListener('dragstart',function(e){on_dragstart_mosaic(this, e, options)})
	// drag_node.addEventListener('dragover',function(e){on_dragover(this, e)})
	// drag_node.addEventListener('dragleave',function(e){on_dragleave(this, e)})
	// drag_node.addEventListener('drop',function(e){on_drop(this, e, options)})

	return true
}//end drag_and_drop



/**
* RENDER_ALTERNATIVE_TABLE_VIEW
* Render all received section records and place it into a DocumentFragment
* @param {Object}      self
* @param {Array}       ar_section_record
* @param {HTMLElement} alt_list_body
*
* @returns {DocumentFragment}
*/
	// const render_alternative_table_view = async function(self, ar_section_record, alt_list_body) {

	// 	// build_values
	// 		const fragment = new DocumentFragment()

	// 	// add all section_record rendered nodes
	// 		const ar_section_record_length = ar_section_record.length
	// 		if (ar_section_record_length>0) {

	// 			for (let i = 0; i < ar_section_record_length; i++) {

	// 				// section_record
	// 					const section_record		= ar_section_record[i]
	// 					const section_record_node	= await section_record.render()
	// 						  section_record_node.classList.add('display_none')

	// 				// event subscribe
	// 				// On user click button 'alt' trigger a event that we subscribe here to show the
	// 				// proper table section record and hide the others
	// 					// const event_id = 'mosaic_show_' + section_record_node.id + '_' + self.section_tipo + '_' + self.section_id
	// 					const event_id = `mosaic_show_${section_record.id_base}_${section_record.caller.section_tipo}_${section_record.caller.section_id}`
	// 					// console.log("// subscribe event_id:",event_id);
	//					const found = event_manager.event_name_exists(event_id)
	// 					if (!found) {
	// 						const token = event_manager.subscribe(event_id, fn_mosaic_show_alt)
	// 						self.events_tokens.push(token)
	// 					}
	// 					function fn_mosaic_show_alt() {

	// 						// hide all except the header
	// 							const ar_child_node	= section_record_node.parentNode.children;
	// 							const len			= ar_child_node.length
	// 							for (let i = len - 1; i >= 0; i--) {
	// 								const node = ar_child_node[i]
	// 								if(node.classList.contains('header_wrapper_list') || node.classList.contains('close_alt_list_body')){
	// 									continue
	// 								}
	// 								node.classList.add('display_none')
	// 							}
	// 						// show list
	// 							alt_list_body.classList.remove('display_none')
	// 							section_record_node.classList.remove('display_none')

	// 						// header
	// 							const header = ui.create_dom_element({
	// 								element_type	: 'div',
	// 								// class_name	: 'header label',
	// 								inner_html		: "Editing inline"
	// 							})

	// 						// modal way
	// 							const modal = ui.attach_to_modal({
	// 								header	: header,
	// 								body	: alt_list_body,
	// 								footer	: null,
	// 								size	: 'normal'
	// 							})
	// 							self.modal = modal
	// 							// modal.on_close = () => {
	// 							// 	self.refresh()
	// 							// }

	// 						// user click edit button action close the modal box
	// 							const token = event_manager.subscribe('button_edit_click', fn_button_edit_click)
	// 							self.events_tokens.push(token)
	// 							function fn_button_edit_click() {
	// 								event_manager.unsubscribe('button_edit_click')
	// 								modal.close()
	// 							}
	// 					}

	// 				// section record append
	// 					fragment.appendChild(section_record_node)
	// 			}
	// 		}//end if (ar_section_record_length===0)

	// 	// build references
	// 		if(self.data.references && self.data.references.length>0){
	// 			const references_node = render_references(self.data.references)
	// 			fragment.appendChild(references_node)
	// 		}

	// 	return fragment
	// }//end render_alternative_table_view



/**
* RENDER_HOVER_VIEW
* Render all received section records and place it into a DocumentFragment
*
* For each section record in `ar_section_record`:
*   1. Renders the record node and adds the CSS class `sr_mosaic_hover`.
*   2. Subscribes to two event_manager events keyed on the record's identity:
*      - `mosaic_hover_{id_base}_{section_tipo}_{section_id}`:
*        Hides all sibling nodes inside `hover_body`, then prepends (teleports)
*        this record's node into the caller tile so it appears as an overlay.
*      - `mosaic_mouseleave_{id_base}_{section_tipo}_{section_id}`:
*        Returns the record node back to `hover_body` and hides all children,
*        effectively resetting the hover state.
*
* Subscriptions are guarded with `event_manager.event_name_exists` to prevent
* duplicate subscriptions across re-renders.  Tokens are stored in
* `self.events_tokens` for cleanup on destroy.
*
* @param {Object}      self              - The component_portal instance.
* @param {Array}       ar_section_record - Array of section_record instances (hover columns set).
* @param {HTMLElement} hover_body        - The container node that holds hover-view nodes
*                                          when not displayed; used as the "park" node
*                                          between hover events.
* @returns {Promise<DocumentFragment>} Fragment containing all rendered hover section record nodes.
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
					const event_id_hover = `mosaic_hover_${section_record.id_base}_${section_record.caller.section_tipo}_${section_record.caller.section_id}`
					const found_hover 	 = event_manager.event_name_exists(event_id_hover)
					if (!found_hover) {
						const token = event_manager.subscribe(event_id_hover, fn_mosaic_hover)
						self.events_tokens.push(token)
					}
					function fn_mosaic_hover(caller_node) {
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
					const event_id_mouseleave = `mosaic_mouseleave_${section_record.id_base}_${section_record.caller.section_tipo}_${section_record.caller.section_id}`
					const found_mouseleave	  = event_manager.event_name_exists(event_id_mouseleave)
					if (!found_mouseleave) {
						const token = event_manager.subscribe(event_id_mouseleave, fn_mosaic_mouseleave)
						self.events_tokens.push(token)
					}
					function fn_mosaic_mouseleave() {
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

				// section record append
					fragment.appendChild(section_record_node)
			}
		}//end if (ar_section_record_length>0)

	return fragment
}//end render_hover_view



/**
* REBUILD_COLUMNS_MAP
* Adding control columns to the columns_map that will processed by section_recods
*
* Wraps a filtered `base_columns_map` with tool-specific control columns:
*
*   For HOVER view (view_mosaic === false):
*     Prepends a `section_id` column (renders as an "open record" link button
*     via `render_column_id` from `render_edit_component_portal`).
*
*   For MOSAIC view (view_mosaic === true):
*     Appends an `original` column rendered by `render_column_original_copy`,
*     which provides the Original/Copy radio buttons, the Snap checkbox, and
*     the drag-used indicator.
*
* @param {Array}   base_columns_map - Pre-filtered column descriptors
*                                     (either `in_mosaic:true` or `hover:true` set).
* @param {Object}  self             - The component_portal instance (passed through for context).
* @param {boolean} view_mosaic      - `true` to build the mosaic columns set;
*                                     `false` to build the hover columns set.
* @returns {Promise<Array>} The full columns_map array including the injected control columns.
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
				id			: 'original',
				label		: 'Info',
				callback	: render_column_original_copy
			})
		}


	return full_columns_map
}//end rebuild_columns_map



/**
* RENDER_COLUMN_ORIGINAL_COPY
* Renders the "Info" control column appended to each mosaic tile.
*
* Produces a DocumentFragment with two main areas:
*
*   LEFT — `.options_left_contaniner`
*     Radio buttons (Original / Copy) bound to tipo `numisdata157` (the discard
*     component).  The current value is read from `options.caller.datum.data`
*     via the record's `locator.section_id`:
*       - `discard_value === '1'`  → pre-styles the Original label as active.
*       - `discard_value === '2'`  → pre-styles the Copy label as active.
*     Labels for both radio buttons are retrieved from the tool via
*     `tool_caller.get_tool_label('original')` / `get_tool_label('copy')`.
*     Each radio button's mouseup handler toggles its checked state; holding
*     Alt deselects (unchecks) it, allowing both to be cleared.
*
*     Snap checkbox (`.checkbox_snap`) — adds/removes the CSS class `snap`
*     on the ancestor row container (3 levels up: snap_item → options_left_contaniner
*     → section_record_node → row_container) to freeze the tile's layout.
*     Label text comes from `tool_caller.get_tool_label('snap')`.
*
*   RIGHT — `.drag`
*     A drag-indicator div.  Receives the additional class `used` when the coin
*     has already been assigned to an ordered position (detected by looking up
*     `options.locator` in `tool_caller.ordered_coins.datum.data`).
*
* DOM path used to reach the tool instance:
*   options.caller (section_record instance) → .caller (component_portal) → .caller (tool)
*   i.e. `options.caller.caller` is the `tool_numisdata_order_coins` instance.
*
* Ontology constants referenced:
*   `numisdata157` — the discard/classification component (Original vs Copy flag).
*   `numisdata341` — the section holding classification enum values (section_id '1'=original,
*                    '2'=copy).
*
* @param {Object} options
* @param {Object} options.caller  - The section_record instance for this tile.
* @param {Object} options.locator - Locator for the current record
*                                   `{ section_tipo, section_id, ... }`.
* @returns {DocumentFragment} Fragment containing the assembled control column nodes.
*/
const render_column_original_copy = function(options){

	// DocumentFragment
	const fragment = new DocumentFragment()

	const tool_caller = options.caller.caller

	const locator = options.locator

	// Read the current discard/classification value for this coin from the portal's datum.
	// numisdata157 is the discard component; its value[0].section_id indicates:
	//   '1' → Original, '2' → Copy (enum stored in numisdata341).
	const discard_data		= options.caller.datum.data.find(item => item.section_id === locator.section_id && item.tipo === 'numisdata157')
	const discard_context	= options.caller.datum.context.find(item => item.tipo === 'numisdata157')

	const discard_value 	= 	discard_data.value && discard_data.value.length > 0
		? discard_data.value[0].section_id
		: null

	// Check whether this coin already appears in the ordered_coins portal data,
	// so the drag indicator can show a 'used' state.
	const orderer_data		= options.caller.caller.ordered_coins.datum.data
	const used_coin 		= orderer_data.find(el => el.section_tipo===locator.section_tipo && el.section_id === locator.section_id)

	// options
		const options_left_contaniner  = ui.create_dom_element({
			element_type	: 'div',
			class_name		: "options_left_contaniner",
			parent			: fragment
		})

	// discard buttons
		const radio_button_contaniner  = ui.create_dom_element({
			element_type	: 'div',
			class_name		: "radio_button_contaniner",
			parent			: options_left_contaniner
		})
			const input_original  = ui.create_dom_element({
				element_type	: 'input',
				type			: 'radio',
				id				: 'original_' + locator.section_id,
				class_name		: "input_original",
				name			: 'set_discart' + locator.section_id,
				value			: locator.section_id,
				parent			: radio_button_contaniner
			})
			input_original.section_id = locator.section_id
			// Alt+click deselects; plain click selects. Both radio inputs in the group share
			// the same `name`, so this toggle-off behaviour requires explicit handling since
			// HTML radio buttons normally cannot be unchecked by the user.
			input_original.addEventListener('mouseup',(event)=>{
				input_original.checked = (event.altKey===true)
					? false
					: true
			})
			const original_class_name = (discard_value==='1')
				? 'label_original'
				: ''
				const original_label = ui.create_dom_element({
					element_type	: 'label',
					for 			: 'original_' + locator.section_id,
					class_name		: original_class_name,
					text_content	: tool_caller.get_tool_label('original') || 'Original',
					parent			: radio_button_contaniner
				})
				// Clicking the label also toggles the checked state to allow deselection.
				original_label.addEventListener('mouseup',()=>{
					input_original.checked = input_original.checked
						? false
						: true
				})
				input_original.label = original_label
			// copy button
			const input_copy  = ui.create_dom_element({
				element_type	: 'input',
				type 			: 'radio',
				id				: 'copy_' + locator.section_id,
				class_name		: "input_copy",
				name 			: 'set_discart' + locator.section_id,
				value 			: locator.section_id,
				parent			: radio_button_contaniner
			})
			input_copy.section_id = locator.section_id
			input_copy.addEventListener('mouseup',(event)=>{
				input_copy.checked = (event.altKey===true)
					? false
					: true
			})
				const copy_class_name = (discard_value==='2')
					? 'label_copy'
					: ''
				const copy_label = ui.create_dom_element({
					element_type	: 'label',
					for 			: 'copy_'+ locator.section_id,
					class_name		: copy_class_name,
					text_content	: tool_caller.get_tool_label('copy') || 'Copy',
					parent			: radio_button_contaniner
				})
				copy_label.addEventListener('mouseup',()=>{
					input_copy.checked = input_copy.checked
						? false
						: true
				})
				input_copy.label = copy_label

	// columns snap_item
		const snap_item  = ui.create_dom_element({
			element_type	: 'div',
			class_name		: "row_snap",
			parent			: options_left_contaniner
		})
			const checkbox_snap  = ui.create_dom_element({
					element_type	: 'input',
					type 			: 'checkbox',
					id 				: 'checkbox_snap_' + locator.section_id,
					class_name		: "checkbox_snap",
					value 			: locator.section_id,
					parent			: snap_item
				})
				const checkbox_snap_label  = ui.create_dom_element({
					element_type	: 'label',
					text_content 	: tool_caller.get_tool_label('snap') || 'Snap',
					parent			: snap_item
				})
				checkbox_snap_label.setAttribute('for','checkbox_snap_' + locator.section_id)
				// Toggling snap walks up to the row_container (3 levels: snap_item →
				// options_left_contaniner → section_record_node → row_container) and
				// adds/removes the 'snap' CSS class, which locks the tile's aspect ratio.
				checkbox_snap.addEventListener("change", function(){

					const row_container = snap_item.parentNode.parentNode.parentNode

					if (checkbox_snap.checked) {
						row_container.classList.add("snap")
					}else{
						row_container.classList.remove("snap")
					}
				},false)

	// columns drag indication
		// If this coin already appears in ordered_coins, mark the drag handle as 'used'
		// so the user can see at a glance which coins have already been assigned.
		const used_coin_class = used_coin
			? ' used'
			: ''
		const drag_item  = ui.create_dom_element({
			element_type	: 'div',
			class_name		: "drag"+used_coin_class,
			parent			: fragment
		})

	return fragment
}//end render_column_original_copy



// @license-end
