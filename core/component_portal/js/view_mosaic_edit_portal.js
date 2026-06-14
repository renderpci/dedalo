// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global  */
/*eslint no-undef: "error"*/



// imports
	import {get_section_records} from '../../section/js/section.js'
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'
	import {
		render_column_id,
		render_column_component_info,
		render_column_remove,
		get_buttons,
		add_wrapper_events,
		add_section_record_drag_and_drop,
		render_references
	} from './render_edit_component_portal.js'



/**
* VIEW_MOSAIC_EDIT_PORTAL
* Edit-mode mosaic (card grid) view for `component_portal`.
*
* This module renders the portal's linked records as a CSS grid of visual cards rather
* than a table.  It is dispatched by `render_edit_component_portal.prototype.edit` when
* `self.context.view === 'mosaic'`.
*
* Layout overview:
*
*   wrapper
*     └── list_body  (CSS grid; card tiles built from the `in_mosaic` column subset)
*           └── content_data
*                 └── <section_record_node>   ×N   (one mosaic tile per linked record)
*                       └── hover_view        (overlaid on mouseenter; hidden by default)
*                             └── button_alt_container  (info icon → opens table detail modal)
*     └── buttons  (portal toolbar; only when permissions > 1)
*
* Three separate sets of section_records are built, each with its own `columns_map` slice
* and `id_variant` so their DOM ids never collide:
*
*   1. **Mosaic records** (`id_variant` default) — rendered using only the columns that
*      carry `in_mosaic: true` in `self.columns_map`.  These become the visible card tiles.
*
*   2. **Hover records** (`id_variant: 'hover'`) — rendered using columns that carry
*      `hover: true`.  Each hover record is prepended into its matching mosaic tile and
*      remains hidden until the user mouses over the tile.
*
*   3. **Alternative table records** (`id_variant: 'table'`) — a full-column table view
*      of one record, revealed inside a modal when the user clicks the info icon on the
*      hover overlay.  This is built inside an IIFE at the start of `render` so the DOM
*      node is available before the mosaic cards are wired.  It is intentionally NOT
*      appended to the DOM here; it is passed into the modal on demand inside
*      `render_alternative_table_view`'s event handler (see below).
*
* Pub/Sub bridge (mosaic ↔ table detail):
*   - `render_hover_view` publishes `mosaic_show_<id_base>_<section_tipo>_<section_id>`
*     when the user clicks the info icon button.
*   - `render_alternative_table_view` subscribes to that same event (deduplicated via
*     `event_manager.get_events()`) and, upon receipt, opens the matching table row in a
*     `dd-modal` (see `ui.attach_to_modal`).
*   - A separate `button_edit_click` subscription inside the handler closes the modal
*     when the user triggers a record-open action from within the table view.
*
* All child section_record instances are pushed into `self.ar_instances` so they are
* properly destroyed when the portal is refreshed or destroyed.
* All event subscriptions are pushed into `self.events_tokens` for cleanup.
*
* Key `self` properties consumed:
*   @see component_portal.js for the full instance shape.
*   - `self.columns_map`      {Array}   — full columns map; `in_mosaic` and `hover` flags
*                                         select the two sub-sets (set by `get_columns_map`
*                                         in `common.js` for the `'mosaic'` view).
*   - `self.ar_instances`     {Array}   — accumulator for child section_record instances.
*   - `self.events_tokens`    {Array}   — accumulator for event subscriptions.
*   - `self.permissions`      {number}  — 1 = read-only, 2 = full edit.
*   - `self.caller`           {Object}  — parent instance; checked for `tool_time_machine`.
*   - `self.data.references`  {Array}   — optional back-reference list rendered at the
*                                         bottom of the alternative table view.
*   - `self.context.css`      {Object}  — optional CSS overrides applied to `content_data`.
*   - `self.context.view`     {string}  — expected to be `'mosaic'` for this module.
*   - `self.total`            {number}  — total linked records (used by drag/drop clamp).
*
* Exports:
*   `view_mosaic_edit_portal`        — namespace constructor (never instantiated directly).
*   `view_mosaic_edit_portal.render` — async static entry point called by the dispatcher.
*
* @module view_mosaic_edit_portal
* @see render_edit_component_portal.js  for the view-dispatch switch and all shared helpers.
* @see view_default_edit_portal.js      for the simpler table-row equivalent.
* @see component_portal.js             for the constructor, data shape, and lifecycle.
* @see docs/core/components/component_portal.md for the full specification.
*/
export const view_mosaic_edit_portal = function() {

	return true
}//end view_mosaic_edit_portal



/**
* RENDER
* Build and return the complete portal wrapper node in mosaic (card grid) view.
*
* This is the async static entry point called by `render_edit_component_portal.prototype.edit`
* when `self.context.view === 'mosaic'`.  It orchestrates three parallel data flows
* (mosaic, hover, and alternative-table section_records) and wires them together
* through a pub/sub bridge before assembling the final wrapper.
*
* Execution order:
*   1. Build the **alternative table view** (`alt_list_body`) inside an IIFE.
*      The IIFE returns the node but it is intentionally discarded here (not appended to
*      the DOM yet); `render_alternative_table_view` holds a closure reference and inserts
*      it into a modal on demand.  The IIFE is skipped when the caller is `tool_time_machine`
*      because time-machine snapshots are read-only and do not need inline editing.
*   2. Build the **hover section_records** using the `hover: true` subset of `columns_map`.
*   3. Build the **mosaic section_records** using the `in_mosaic: true` subset of `columns_map`.
*   4. Assemble `content_data` (card grid) by calling `get_content_data`, which:
*      - Renders each mosaic tile.
*      - Prepends the matching hover view into each tile.
*      - Attaches `mouseenter`/`mouseleave` toggle events per tile.
*      - Attaches drag-and-drop handlers when permissions ≥ 2.
*   5. When `render_level === 'content'` return only the `content_data` node (partial refresh).
*   6. Otherwise wrap in `list_body` → `wrapper`, attach the toolbar buttons, wire
*      wrapper-level autocomplete + drag/drop events, and apply read-only context-menu
*      suppression when permissions < 2.
*
* (!) The IIFE at step 1 is `await`ed but its return value is unused (`alt_list_body` is
* captured only inside `render_alternative_table_view`'s closure).  The outer `await` is
* kept to preserve the original execution ordering in case the IIFE is extended in future.
*
* @param {Object} self    - The `component_portal` instance (see component_portal.js).
* @param {Object} options - Render options.
* @param {string} [options.render_level='full'] - `'full'` rebuilds the entire wrapper;
*   `'content'` returns only the refreshed `content_data` node for an in-place swap.
* @returns {Promise<HTMLElement>} The rendered wrapper node (full mode) or the
*   `content_data` node (content mode).
*/
view_mosaic_edit_portal.render = async function(self, options) {

	// options
		const render_level 	= options.render_level || 'full'

	// alt_list_body. Alternative table view node with all ddo in table mode
		await (async ()=>{

			// alt_list_body
				const alt_list_body = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'alt_list_body display_none'
				})

			// inside tool_time_machine case. Do not create the alt_list_body columns
				if (self.caller && self.caller.model==='tool_time_machine') {
					return alt_list_body
				}

			// close_alt_list_body
				const close_alt_list_body = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'button close close_alt_list_body',
					parent 			: alt_list_body
				})
				close_alt_list_body.addEventListener('click', function(e){
					e.stopPropagation()
					alt_list_body.classList.add('display_none')
				})

			// columns
				const alt_columns_map	= await rebuild_columns_map(self.columns_map, self, false)

			// header. Build using common ui builder
				const list_header_node = ui.render_list_header(alt_columns_map, self)
				alt_list_body.appendChild(list_header_node)

			// alternative_table_view (body)
				const alt_ar_section_record		= await get_section_records({
					caller		: self,
					mode		: 'list',
					columns_map	: alt_columns_map,
					id_variant	: 'table'
				})
				// store to allow destroy later
				self.ar_instances.push(...alt_ar_section_record)
				const alternative_table_view	= await render_alternative_table_view(self, alt_ar_section_record, alt_list_body)
				alt_list_body.appendChild(alternative_table_view)

			// alt_list_body columns
				const alt_items				= ui.flat_column_items(alt_columns_map);
				const alt_template_columns	= alt_items.join(' ')
				Object.assign(
					alt_list_body.style,
					{
						"grid-template-columns": alt_template_columns
					}
				)

			return alt_list_body
		})()

		// hover columns
			const hover_columns		= self.columns_map.filter(el => el.hover===true)
			const hover_columns_map	= await rebuild_columns_map(hover_columns, self, false)

		// hover section_records
			const hover_ar_section_record = await get_section_records({
				caller		: self,
				mode		: 'list',
				columns_map	: hover_columns_map,
				id_variant	: 'hover'
			})
			// store to allow destroy later
			self.ar_instances.push(...hover_ar_section_record)

	// content_data. Create the mosaic with only the marked ddo as "mosaic" with true value
		// columns_map
			const base_columns_map	= self.columns_map.filter(el => el.in_mosaic===true)
			const columns_map		= await rebuild_columns_map(base_columns_map, self, true)

		// content_data
			// self.id_variant = self.id_variant
			// 	? self.id_variant + 'alt'
			// 	: 'alt' // temporal change of id_variant to modify section records id
			const ar_section_record	= await get_section_records({
				caller		: self,
				mode		: 'list',
				columns_map	: columns_map
			})
			// store to allow destroy later
			self.ar_instances.push(...ar_section_record)

			const content_data = await get_content_data(self, ar_section_record, hover_ar_section_record)

		// (!) No need to add the nodes here. On user mouseover/click, they will be added
		// alt_list_body . Prepend hidden node into content_data to allow refresh on render_level 'content'
			// content_data.prepend( alt_list_body )
		// hover_body. add hover node to the content_data
			// content_data.prepend( hover_body )


		// render_level
			if (render_level==='content') {
				return content_data
			}

		// list_body
			const list_body = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'list_body ' + self.mode +  ' view_'+self.view
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
		wrapper.classList.add('portal', 'view_' + (self.view || self.context.view || 'default'))
		// set pointers
		wrapper.list_body		= list_body
		wrapper.content_data	= content_data

	// service autocomplete + drag/drop
		add_wrapper_events(self, wrapper, {drag_drop: true})

	// permissions control
	// set on read only permissions, remove the context menu
		if(self.permissions < 2){
			wrapper.addEventListener("contextmenu", (e) => {
				e.preventDefault();
				return false
			});
		}


	return wrapper
}//end render



/**
* GET_CONTENT_DATA
* Render each mosaic tile, pair it with its hover overlay, attach interaction events,
* and return the assembled `content_data` container.
*
* For each mosaic section_record:
*   1. Renders the mosaic tile (`section_record.render()`) and its paired hover overlay
*      (`render_hover_view`) concurrently via `Promise.all` to reduce serial await chains.
*   2. Prepends the hover overlay into the tile node so it sits above the card content
*      in DOM order (the overlay is hidden via CSS `display_none` until `mouseenter`).
*   3. Attaches `mouseenter` / `mouseleave` listeners to toggle the `display_none` class
*      on the hover overlay and the `mosaic_over` highlight class on the tile.
*   4. Attaches drag-and-drop handlers to the tile when `self.permissions >= 2`.
*
* After all tiles are appended to a `DocumentFragment`, the fragment is inserted into the
* `content_data` wrapper produced by `ui.component.build_content_data`.  Any `height`
* style override declared in `self.context.css['.content_data'].style.height` is applied
* inline to support ontology-driven CSS customisation per portal instance.
*
* @param {Object} self                       - The `component_portal` instance.
* @param {Array}  ar_section_record          - Array of mosaic section_record instances
*                                              (one per linked record, `in_mosaic` columns).
* @param {Array}  hover_ar_section_record    - Parallel array of hover section_record instances
*                                              (same length; index-aligned with `ar_section_record`).
* @returns {Promise<HTMLElement>} The populated `content_data` div node.
*/
const get_content_data = async function(self, ar_section_record, hover_ar_section_record) {

	// build_values
		const fragment = new DocumentFragment()

		// add all section_record rendered nodes
			const ar_section_record_length = ar_section_record.length
			if (ar_section_record_length > 0) {
				const rendered_pairs = await Promise.all(ar_section_record.map(async (section_record, i) => {
					const [section_record_node, hover_view] = await Promise.all([
						section_record.render(),
						render_hover_view(self, hover_ar_section_record[i])
					])
					section_record_node.prepend(hover_view)
					return { section_record_node, section_record, hover_view, i }
				}))

				for (let i = 0; i < ar_section_record_length; i++) {
					const { section_record_node, section_record, hover_view } = rendered_pairs[i]

					// drag and drop
					if (self.permissions >= 2) {
						add_section_record_drag_and_drop({
							section_record_node : section_record_node,
							paginated_key       : i,
							total_records       : self.total,
							locator             : section_record.locator,
							caller              : self
						})
					}

					// mouseenter event
					section_record_node.addEventListener('mouseenter', function(e) {
						e.stopPropagation()
						hover_view.classList.remove('display_none')
						section_record_node.classList.add('mosaic_over')
					})

					// mouseleave event
					section_record_node.addEventListener('mouseleave', function(e) {
						e.stopPropagation()
						hover_view.classList.add('display_none')
						section_record_node.classList.remove('mosaic_over')
					})

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
* RENDER_ALTERNATIVE_TABLE_VIEW
* Render each alternative-table section_record into a DocumentFragment and wire each
* to the pub/sub bridge that opens it in a modal when the user clicks the hover info icon.
*
* This function is the subscriber side of the mosaic ↔ table-detail bridge:
*
*   For each section_record:
*   1. Renders the section_record node and adds `display_none` so it is initially hidden.
*   2. Derives the event key:
*        `mosaic_show_<id_base>_<section_tipo>_<section_id>`
*      where `id_base` is the section_record's stable cross-page identifier (a composite
*      string of tipo + section_id + parent context — see `section_record.id_base`).
*   3. Checks `event_manager.get_events()` to prevent duplicate subscriptions when the
*      portal is refreshed without being fully destroyed.
*   4. Subscribes `fn_mosaic_show_alt`: on the first publish of the event it —
*      a. Hides all peer nodes in the same parent (keeping only the header and close button).
*      b. Makes `alt_list_body` and this record's node visible.
*      c. Wraps both in a `dd-modal` (via `ui.attach_to_modal`) labelled "Editing mosaic inline".
*      d. Subscribes a one-shot `button_edit_click` listener that closes the modal and
*         unsubscribes itself via `event_manager.unsubscribe(token)`.
*   5. References block: if `self.data.references` is non-empty, appends the back-reference
*      list (from `render_references`) after all section_record nodes.
*
* (!) The `fn_mosaic_show_alt` closure captures both `section_record_node` and `alt_list_body`.
* `alt_list_body` is a reference to the shared node created in `render`'s IIFE; moving it
* into the modal body removes it from any prior DOM parent (correct behaviour — only one
* modal can show it at a time).
*
* (!) The `modal.on_close` callback is commented out deliberately: auto-refreshing on
* close caused UX issues. Manual refresh via the edit-button path is the intended flow.
*
* @param {Object}        self               - The `component_portal` instance.
* @param {Array}         ar_section_record  - Array of alternative-table section_record
*                                             instances (`id_variant: 'table'`; full columns).
* @param {HTMLElement}   alt_list_body      - The shared `alt_list_body` container node
*                                             created in `render`'s IIFE; passed by reference
*                                             so the event handler can move it into a modal.
* @returns {Promise<DocumentFragment>} Fragment with all rendered (hidden) table rows
*   and the optional references block.
*/
const render_alternative_table_view = async function(self, ar_section_record, alt_list_body) {

	// build_values
		const fragment = new DocumentFragment()

	// add all section_record rendered nodes
		const ar_section_record_length = ar_section_record.length
		if (ar_section_record_length>0) {

			for (let i = 0; i < ar_section_record_length; i++) {

				// section_record
					const section_record		= ar_section_record[i]
					const section_record_node	= await section_record.render()
						  section_record_node.classList.add('display_none')

				// event subscribe
				// On user click button 'alt' trigger a event that we subscribe here to show the
				// proper table section record and hide the others
					// const event_id = 'mosaic_show_' + section_record_node.id + '_' + self.section_tipo + '_' + self.section_id
					const event_id = `mosaic_show_${section_record.id_base}_${section_record.caller.section_tipo}_${section_record.caller.section_id}`
					// console.log("// subscribe event_id:",event_id);
					const found = event_manager.get_events().find(el => el.event_name===event_id)
					if (!found) {
						const fn_mosaic_show_alt = function() {

							// hide all except the header
								const ar_child_node	= section_record_node.parentNode.children;
								const len			= ar_child_node.length
								for (let i = len - 1; i >= 0; i--) {
									const node = ar_child_node[i]
									if(node.classList.contains('header_wrapper_list') || node.classList.contains('close_alt_list_body')){
										continue
									}
									node.classList.add('display_none')
								}
							// show list
								alt_list_body.classList.remove('display_none')
								section_record_node.classList.remove('display_none')

							// header
								const header = ui.create_dom_element({
									element_type	: 'div',
									inner_html		: 'Editing mosaic inline'
								})

							// body
								const body = ui.create_dom_element({
									element_type	: 'div',
									class_name		: 'body content'
								})
								body.appendChild(alt_list_body)

							// modal way
								const modal = ui.attach_to_modal({
									header	: header,
									body	: body,
									footer	: null,
									size	: 'normal'
								})
								self.modal = modal
								// modal.on_close = () => {
								// 	self.refresh()
								// }

							// user click edit button action close the modal box
								let token
								const button_edit_click_handler = () => {
									event_manager.unsubscribe(token)
									modal.close()
								}
								token = event_manager.subscribe('button_edit_click', button_edit_click_handler)
								self.events_tokens.push(token)
						}
						const token = event_manager.subscribe(event_id, fn_mosaic_show_alt)
						self.events_tokens.push(token)
					}

				// section record append
					fragment.appendChild(section_record_node)
			}
		}//end if (ar_section_record_length>0)

	// build references
		if(self.data.references && self.data.references.length>0){
			const references_node = render_references(self.data.references)
			fragment.appendChild(references_node)
		}


	return fragment
}//end render_alternative_table_view



/**
* RENDER_HOVER_VIEW
* Build the hover overlay node for a single mosaic tile.
*
* The hover view is a rendered section_record (using the `hover`-flagged columns) with two
* extras appended on top:
*
*   1. The section_record's own component nodes (e.g. a label or thumbnail defined in the
*      ontology with `hover: true`) provide at-a-glance info without needing to open the
*      full record.
*
*   2. A `button_alt_container` div with an info icon (`<span class="button info with_bg">`)
*      is appended to the rendered node.  Clicking this button publishes the event:
*        `mosaic_show_<id_base>_<section_tipo>_<section_id>`
*      which is picked up by the matching subscriber in `render_alternative_table_view`
*      to open the full table detail in a modal.
*
* The returned node starts life with the classes `sr_mosaic_hover display_none`; the
* `display_none` is toggled by `get_content_data`'s `mouseenter`/`mouseleave` handlers.
*
* @param {Object} self                  - The `component_portal` instance.
* @param {Object} hover_section_record  - A single section_record instance built from the
*                                         `hover: true` column subset (`id_variant: 'hover'`).
* @returns {Promise<HTMLElement>} The rendered hover overlay node (initially hidden).
*/
const render_hover_view = async function(self, hover_section_record) {

	// add section_record rendered nodes
	// section_record
		const section_record_node = await hover_section_record.render()
			  section_record_node.classList.add('sr_mosaic_hover', 'display_none')

	// button alt view (table)
		const button_alt_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'button_alt_container',
			parent			: section_record_node
		})
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'button info with_bg',
			parent			: button_alt_container
		})
		// event publish
		// When user clicks 'alt' button, send an event 'mosaic_show_' + section_record_node.id
		button_alt_container.addEventListener('mouseup', function(e){
			e.stopPropagation()
			const event_id = `mosaic_show_${hover_section_record.id_base}_${hover_section_record.caller.section_tipo}_${hover_section_record.caller.section_id}`
			event_manager.publish(event_id, this)
		})


	return section_record_node
}//end render_hover_view



/**
* REBUILD_COLUMNS_MAP
* Prepend and append control columns to a base columns_map slice before it is
* passed to `get_section_records`.
*
* The function adds structural columns that are not declared in the ontology / request
* config but are needed by the portal's table controls:
*
*   - **`section_id` column** (prepended, table mode only) — renders the "open record"
*     button, drag handle, and drop target via `render_column_id`.  Skipped in mosaic
*     mode (`view_mosaic === true`) because card tiles do not have an ID column.
*
*   - **`ddinfo` column** (appended, table mode only) — shows the `component_info`
*     summary string.  Added only when `self.add_component_info === true`.
*
*   - **`remove` column** (appended, table mode only) — unlink / delete button.  Added
*     when the portal's source mode is not `'external'` AND `self.permissions > 1`.
*
* When `view_mosaic === true` (building the main mosaic card columns_map) none of the
* control columns are added; only the raw `base_columns_map` items are returned.
*
* @param {Array}   base_columns_map - The pre-filtered column descriptor slice to extend.
*   Each item shape: `{ id, label, width?, callback, tipo?, in_mosaic?, hover?, … }`.
* @param {Object}  self             - The `component_portal` instance (read: `add_component_info`,
*   `permissions`, `context.properties.source.mode`).
* @param {boolean} view_mosaic      - When `true`, suppress all control columns (mosaic card mode).
*   When `false`, add the full set of control columns (table / hover mode).
* @returns {Promise<Array>} The extended columns_map array with control columns spliced in.
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
		if(!view_mosaic) {
			// column component_info check
				if (self.add_component_info===true) {
					full_columns_map.push({
						id			: 'ddinfo',
						label		: 'Info',
						callback	: render_column_component_info
					})
				}

			// button_remove
				if(self.context?.properties?.source?.mode !=='external' && self.permissions>1) {
					full_columns_map.push({
						id			: 'remove',
						label		: '', // get_label.delete || 'Delete',
						width		: 'auto',
						callback	: render_column_remove
					})
				}
		}


	return full_columns_map
}//end rebuild_columns_map



// @license-end
