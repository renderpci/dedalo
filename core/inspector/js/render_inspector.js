// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEVELOPER, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/
// (!) DEDALO_API_URL is used at line ~710 but is NOT listed in the /*global*/ declaration above.
// It is injected at page load as a global constant from the PHP template. If eslint runs in
// strict mode this will produce a no-undef error. Flagged for a future /*global*/ addition.



/**
* RENDER_INSPECTOR
* Client-side rendering module for the Dédalo v7 inspector panel.
*
* The inspector is a collapsible sidebar that floats to the right of a section's
* edit view and provides developers and power users with:
*   - section / component metadata (tipo, model, matrix_table, audit trail)
*   - quick-action buttons (search, new, duplicate, delete, graph view, diffusion, tools)
*   - project filter widget (component_project_filter, injected via event)
*   - relations list (lazy-loaded, paginated)
*   - time-machine list  — recent changes across all components of the section
*   - component history  — full value history for the currently selected component
*   - activity feed      — live save-notification bubbles
*   - ontology navigation links (documentation, local ontology, master ontology)
*
* Layout / state persistence:
*   The panel width and rail-collapsed state are saved globally in IndexedDB
*   (table 'status', keys 'inspector_rail_state' / 'inspector_width').  The state
*   is loaded before first paint so that layout is stable with no flicker.
*   On viewports ≤ 1024 px (is_narrow_viewport) the panel is inline full-width
*   and rail/resize controls are inert.
*
* Relationship with inspector.js:
*   inspector.js holds the lifecycle prototype (init / build / destroy) and all
*   event subscriptions.  This module holds the DOM construction functions that
*   inspector.js delegates to, plus a small set of exported helpers consumed by
*   view_default_edit_section.js (apply_inspector_state, init_inspector_resize,
*   toggle_inspector_rail).
*
* Exports (public API of this module):
*   render_inspector            — constructor stub (prototype.edit defined here)
*   toggle_inspector_rail       — collapse / expand the panel
*   apply_inspector_state       — pre-paint state application
*   init_inspector_resize       — wires the drag-resize handle
*   update_project_container_body
*   render_section_info
*   render_component_info
*   render_time_machine_list
*   load_time_machine_list
*   render_component_history (private, consumed via inspector.js init)
*   load_component_history
*   render_activity_info (private)
*   load_activity_info
*   open_ontology_window
*/

// import
	import { ui } from '../../common/js/ui.js'
	import { create_source } from '../../common/js/common.js'
	import { event_manager } from '../../common/js/event_manager.js'
	import { get_instance } from '../../common/js/instances.js'
	import { render_node_info } from '../../common/js/utils/notifications.js'
	import { get_ontology_url } from '../../inspector/js/inspector.js'
	import { open_tool } from '../../../tools/tool_common/js/tool_common.js'
	import { render_open_list_with_direct_relations } from '../../section/js/render_open_list_with_direct_relations.js'
	import {
		data_manager,
		download_data
	} from '../../common/js/data_manager.js'
	import {
		when_in_viewport,
		dd_request_idle_callback,
		set_tool_event
	} from '../../common/js/events.js'
	import {
		open_window,
		object_to_url_vars,
		get_tld_from_tipo,
		get_section_id_from_tipo,
		clone,
		load_style,
		tool_base_url
	} from '../../common/js/utils/index.js'




/**
* RENDER_INSPECTOR
* Constructor stub for the inspector instance.
* All prototype methods are assigned in inspector.js (lifecycle) and below
* (render_inspector.prototype.edit).  The actual work is done by get_content_data
* and the render_* / load_* helpers in this file.
*/
export const render_inspector = function() {

	return true
}//end render_inspector



// Persisted UI state (IndexedDB table 'status', global keys shared across sections)
// These constants are intentionally global across all section instances so that the
// inspector always opens at the same width/collapsed state regardless of which record
// the user navigates to.
	const RAIL_STATE_KEY	= 'inspector_rail_state' // {value:true} => collapsed to rail
	const WIDTH_KEY			= 'inspector_width'      // {value:'24rem'} user chosen width
	const DEFAULT_WIDTH		= '19rem'                // matches --inspector_width CSS default
	const RAIL_WIDTH_VAR	= 'var(--inspector_rail_width)' // narrow strip that shows only icons



/**
* SET_INSPECTOR_WIDTH
* Writes --inspector_width on :root. The section content width and the panel
* position are calc() consumers of this CSS variable, so the layout reflows
* automatically whenever this value changes — no manual DOM repositioning required.
* @param {string} value - Any CSS length value: '19rem', '320px', or
*   'var(--inspector_rail_width)' when collapsing to the icon rail.
* @returns {void}
*/
const set_inspector_width = (value) => {
	document.documentElement.style.setProperty('--inspector_width', value)
}//end set_inspector_width



/**
* IS_NARROW_VIEWPORT
* Returns true when the viewport is at most 1024 px wide (the CSS
* @width_break_point_0 breakpoint). Below this threshold the inspector renders
* as an inline full-width block and rail collapse + drag-resize are both
* disabled so they do not interfere with the stacked layout.
* @returns {boolean} true when viewport width ≤ 1024 px
*/
const is_narrow_viewport = () => window.matchMedia('(max-width: 1024px)').matches



/**
* TOGGLE_INSPECTOR_RAIL
* Collapses the inspector panel to a narrow icon-only rail, or expands it back
* to its last saved width.  The transition is purely CSS-driven via
* --inspector_width, so the section content area reflows automatically.
*
* The new state is written to IndexedDB ('status' table, key 'inspector_rail_state')
* so it survives page reloads.
*
* No-ops silently when:
*   - the viewport is narrow (≤ 1024 px) — inline layout, no rail concept
*   - #inspector_container is absent from the DOM
*
* @param {Object} self - Inspector instance. Reads self._saved_width (the last
*   explicit pixel/rem width chosen by the user) and updates self._rail_collapsed.
* @returns {boolean} false when the toggle was suppressed; true on success.
*/
export const toggle_inspector_rail = (self) => {

	if (is_narrow_viewport()) {
		return false
	}

	const container = document.getElementById('inspector_container')
	if (!container) {
		return false
	}

	// Determine direction from current DOM state, not from self._rail_collapsed,
	// so the UI and the flag stay in sync even after a hot reload or external toggle.
	const collapsing = !container.classList.contains('inspector_rail')
	container.classList.toggle('inspector_rail', collapsing)
	self._rail_collapsed = collapsing

	set_inspector_width(
		collapsing
			? RAIL_WIDTH_VAR
			: (self._saved_width || DEFAULT_WIDTH)
	)

	// persist
	data_manager.set_local_db_data(
		{ id: RAIL_STATE_KEY, value: collapsing },
		'status'
	)

	return true
}//end toggle_inspector_rail



/**
* APPLY_INSPECTOR_STATE
* Applies the persisted rail/width state to the freshly created #inspector_container
* BEFORE it is attached to the DOM, so the very first paint is already at the right
* dimensions and no layout shift occurs.
*
* Called by view_default_edit_section.js immediately after the container element is
* created and before it is appended to the section fragment.
*
* @param {Object} inspector - Inspector instance. Must have _rail_collapsed (boolean)
*   and _saved_width (string | falsy) already populated by edit() awaiting IndexedDB.
* @param {HTMLElement} container - The #inspector_container element to configure.
* @returns {boolean} false when container is falsy (nothing to do); true otherwise.
*/
export const apply_inspector_state = (inspector, container) => {

	if (!container) {
		return false
	}

	const railed = inspector?._rail_collapsed===true && !is_narrow_viewport()
	if (railed) {
		container.classList.add('inspector_rail')
		set_inspector_width(RAIL_WIDTH_VAR)
	} else {
		container.classList.remove('inspector_rail')
		set_inspector_width(inspector?._saved_width || DEFAULT_WIDTH)
	}

	return true
}//end apply_inspector_state



/**
* INIT_INSPECTOR_RESIZE
* Wires a left-edge drag handle to allow the user to resize the inspector panel live.
*
* Resize behaviour:
*   - Uses the Pointer Events API with pointer capture so the drag continues even when
*     the pointer leaves the handle element.
*   - Width updates are batched through requestAnimationFrame (rAF-coalesced) to avoid
*     forced-layout thrashing on every pointermove event.
*   - Width is clamped between MIN (14 rem) and get_max() (60 % of viewport or 40 rem,
*     whichever is smaller) to prevent the panel from covering the entire content area.
*   - The handle is on the LEFT edge of the panel, so dragging left (lower clientX)
*     makes the panel wider: dx = start_x − current_x > 0 means growth.
*   - On pointerup the resolved value is read back from the CSS variable (post-clamp)
*     and written to IndexedDB so subsequent page loads restore the same width.
*   - The body class 'inspector_resizing' suppresses pointer-events on content while
*     dragging to prevent accidental text selections or hover effects.
*
* No-ops silently when:
*   - handle is falsy
*   - pointerdown fires while the panel is in rail mode (inspector_rail class present)
*   - pointerdown fires on a narrow viewport (≤ 1024 px)
*
* @param {HTMLElement} handle - The drag-resize strip element on the panel's left edge.
* @param {Object} inspector - Inspector instance. Updated: inspector._saved_width is
*   set to the final CSS string (e.g. '320px') when the user releases the pointer.
* @returns {boolean} false when handle is falsy; true after the listener is attached.
*/
export const init_inspector_resize = (handle, inspector) => {

	if (!handle) {
		return false
	}

	const REM		= parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
	const MIN		= 14 * REM
	const get_max	= () => Math.min(window.innerWidth * 0.6, 40 * REM)

	let start_x		= 0
	let start_w		= 0
	let raf_id		= null
	let pending_w	= null

	const apply_pending = () => {
		raf_id = null
		if (pending_w!==null) {
			set_inspector_width(pending_w + 'px')
		}
	}

	const on_move = (e) => {
		// handle is on the LEFT edge: dragging left (smaller clientX) grows the panel
		const dx = start_x - e.clientX
		let w = start_w + dx
		w = Math.max(MIN, Math.min(get_max(), w))
		pending_w = w
		if (raf_id===null) {
			raf_id = requestAnimationFrame(apply_pending)
		}
	}

	const on_up = (e) => {
		window.removeEventListener('pointermove', on_move)
		window.removeEventListener('pointerup', on_up)
		// flush the last pending frame before persisting
		if (raf_id!==null) {
			cancelAnimationFrame(raf_id)
			apply_pending()
		}
		document.body.classList.remove('inspector_resizing')
		try { handle.releasePointerCapture(e.pointerId) } catch(err) {}

		// persist the resolved width
		const w = getComputedStyle(document.documentElement)
			.getPropertyValue('--inspector_width').trim()
		if (w) {
			inspector._saved_width = w
			data_manager.set_local_db_data({ id: WIDTH_KEY, value: w }, 'status')
		}
	}

	handle.addEventListener('pointerdown', (e) => {
		const container = document.getElementById('inspector_container')
		// disabled while railed or on the inline narrow layout
		if (!container || container.classList.contains('inspector_rail') || is_narrow_viewport()) {
			return
		}
		e.preventDefault()
		e.stopPropagation()
		start_x = e.clientX
		start_w = parseFloat(getComputedStyle(container).width) || MIN
		document.body.classList.add('inspector_resizing')
		try { handle.setPointerCapture(e.pointerId) } catch(err) {}
		window.addEventListener('pointermove', on_move)
		window.addEventListener('pointerup', on_up)
	})

	return true
}//end init_inspector_resize



/**
* DECORATE_BLOCK_HEADER
* Adds a CSS-mask icon span and a text-label span to a collapsible block header.
* This two-node structure lets CSS hide only the label text in rail mode while
* the icon span remains visible as the sole visual indicator.
*
* Must be called once per header; calling it a second time would duplicate the
* icon and label inside the same header element.
*
* @param {HTMLElement} header - The block header element to decorate (mutated in place).
* @param {string} icon_class - BEM modifier used as the mask icon source.
*   Known values: 'info' | 'gear' | 'link' | 'history' | 'note' | 'activity' | 'panel'
* @param {string} label_html - Inner HTML of the label span (may contain HTML entities).
* @returns {HTMLElement} The same header element, for optional chaining.
*/
const decorate_block_header = (header, icon_class, label_html) => {

	ui.create_dom_element({
		element_type	: 'span',
		class_name		: 'block_icon ' + icon_class,
		parent			: header
	})
	ui.create_dom_element({
		element_type	: 'span',
		class_name		: 'block_label',
		inner_html		: label_html,
		parent			: header
	})

	return header
}//end decorate_block_header



/**
* EDIT
* Builds the full inspector DOM tree and returns the outermost wrapper element.
* This is the prototype method assigned to render_inspector.prototype.edit and
* called by common.prototype.render() during the section edit lifecycle.
*
* Render-level semantics:
*   'content' — return only the content_data node (inner body, used by refresh).
*   'full'    — return the complete wrapper including the sticky header label.
*
* Persisted state is loaded from IndexedDB BEFORE constructing the DOM so that
* apply_inspector_state (called by view_default_edit_section.js immediately after)
* receives the correct _rail_collapsed and _saved_width values, avoiding any
* visible layout jump on first render.
*
* The sticky label uses an IntersectionObserver to toggle the 'is_pinned' class
* when the header is obscured at the top of its scroll container, allowing CSS to
* add a shadow/border to indicate the pinned state.
*
* @param {Object} options
* @param {string} [options.render_level='full'] - 'full' or 'content'
* @returns {Promise<HTMLElement>} wrapper (#inspector element) or content_data node
*   when render_level === 'content'
*/
render_inspector.prototype.edit = async function(options) {

	const self = this

	// options
		const render_level = options.render_level || 'full'

	// persisted rail / width state (global keys). Read before first paint so the
	// container can be sized correctly in view_default_edit_section (no flicker)
		const [rail_rec, width_rec] = await Promise.all([
			data_manager.get_local_db_data(RAIL_STATE_KEY, 'status', true),
			data_manager.get_local_db_data(WIDTH_KEY, 'status', true)
		])
		self._rail_collapsed	= rail_rec?.value===true
		self._saved_width		= width_rec?.value || DEFAULT_WIDTH

	// content data
		const content_data = get_content_data(self)
		if (render_level==='content') {
			return content_data
		}

	// label
		const label = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'label icon_arrow up'
		})
		// leading inspector icon + text wrapper (text hides in rail mode).
		// modifier is 'panel' (not 'inspector') to avoid colliding with the
		// .inspector wrapper class on the same span.
		decorate_block_header(label, 'panel', get_label.inspector || 'Inspector')
		// rail collapse / expand toggle
		const rail_toggle = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'inspector_rail_toggle',
			title			: get_label.collapse || 'Collapse / expand',
			parent			: label
		})
		rail_toggle.addEventListener('click', (e) => {
			e.stopPropagation() // do not trigger the label's collapse-content toggle
			toggle_inspector_rail(self)
		})
		// track collapse toggle state of content
		ui.collapse_toggle_track({
			toggler				: label,
			container			: content_data,
			collapsed_id		: 'inspector_main_block',
			collapse_callback	: collapse,
			expose_callback		: expose
		})
		function collapse() {
			label.classList.remove('up')
		}
		function expose() {
			label.classList.add('up')
		}
		// IntersectionObserver: adds 'is_pinned' class when the sticky header is
		// scrolled out of view (intersectionRatio < 1), enabling a CSS drop-shadow.
		const observer = new IntersectionObserver(
			([e]) => e.target.classList.toggle('is_pinned', e.intersectionRatio < 1),
			{ threshold: [1] }
		);
		when_in_viewport(label, () => {
			observer.observe(label);
		})

	// wrapper
		const wrapper = ui.create_dom_element({
			element_type	: 'div',
			id				: 'inspector',
			class_name		: 'wrapper_inspector inspector'
		})
		// set pointers
		wrapper.content_data = content_data

	// add elements
		wrapper.appendChild(label)
		wrapper.appendChild(content_data)

	// tooltip
		dd_request_idle_callback(
			() => {
				ui.activate_tooltips(wrapper)
			}
		)


	return wrapper
}//end edit



/**
* GET_CONTENT_DATA
* Builds the complete body of the inspector panel: paginator, all action buttons,
* tool shortcut buttons, project filter, info blocks, time-machine list, component
* history, and the activity feed.
*
* This function owns the full content_data subtree.  The outer label/wrapper is
* assembled by render_inspector.prototype.edit().  When render_level === 'content'
* edit() returns this node directly (used by refresh cycles to replace only the body).
*
* Block rendering order:
*   1. paginator_container (section_id display, pointer stored for live updates)
*   2. buttons_container top (search / new / duplicate / delete / target-section /
*      graph / diffusion / tool shortcuts)
*   3. tools_container (when >1 inspector tool; single tool goes into buttons_container)
*   4. selection_info block
*   5. element_info block (info panel, lazily populated by render_section_info /
*      render_component_info via event subscriptions in inspector.js)
*   6. project block (only when component_filter_node is already available)
*   7. relation_list block (only when context.config.relation_list_tipo is set)
*   8. time_machine_list block (always rendered; historically guarded by a commented-out
*      ontology check — see commented-out block at line ~676)
*   9. component_history block (always rendered alongside time_machine_list)
*  10. activity_info block
*  11. buttons_bottom_container (data link, register download for dd1340)
*
* @param {Object} self - Inspector instance. section = self.caller must already have
*   context.buttons and context.tools populated from the server response.
* @returns {HTMLElement} content_data - The populated inspector body element.
*/
const get_content_data = function(self) {

	// short vars
		const section			= self.caller
		const section_buttons	= section.context.buttons || []

	// content_data
		const content_data = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_data inspector_content_data hide'
		})
		// Stop mousedown from bubbling to the section, which would deactivate the
		// currently selected component (section listens for mousedown on document
		// and deactivates the active component unless the click is inside it).
		content_data.addEventListener('mousedown', function(e) {
			e.stopPropagation();
		})
		// rail: clicking a block header while collapsed expands the panel and opens
		// that block. Capture phase + stopPropagation pre-empts the per-block
		// collapse_toggle_track handler; the programmatic re-click then runs normally
		// (the container is no longer railed) and opens the body.
		content_data.addEventListener('click', function(e) {
			const container = document.getElementById('inspector_container')
			if (!container || !container.classList.contains('inspector_rail')) {
				return
			}
			const header = e.target.closest('[class*="_head"]')
			if (!header || !content_data.contains(header)) {
				return
			}
			e.stopPropagation()
			// expand the panel
			toggle_inspector_rail(self)
			// open the clicked block if its body is collapsed. Defer one frame so the
			// re-click is not suppressed by the click-in-progress flag when the original
			// event was itself produced by HTMLElement.click() (re-entrancy guard).
			const body = header.nextElementSibling
			if (body && body.classList.contains('hide')) {
				requestAnimationFrame(() => header.click())
			}
		}, true)

	// paginator container
		const paginator_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'paginator_container',
			parent			: content_data
		})
		// fix pointer to node placeholder
		self.paginator_container = paginator_container
		// section_id. Create node and set pointer to paginator_container
		paginator_container.section_id = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'section_id',
			inner_html		: section.section_id,
			parent			: paginator_container
		})

	// buttons container
		const buttons_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'buttons_container top',
			parent			: content_data
		})

		// button_search. Show and hide all search elements
			const button_search = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'button block_icon light search',
				title			: get_label.find || "Search",
				parent			: buttons_container
			})
			const button_search_mousedown_handler = (e) => {
				e.stopPropagation()
				event_manager.publish('toggle_search_panel_' + self.caller.id)
			}
			button_search.addEventListener('mousedown', button_search_mousedown_handler)

		// button_new . Call API to create new section and navigate to the new record
			const section_button_new = section_buttons.find(el => el.model==='button_new')
			if (section_button_new) {
				const button_new = ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'button block_icon light add_light',
					title			: section_button_new.label || 'New',
					parent			: buttons_container
				})
				const button_new_click_handler = (e) => {
					e.stopPropagation()
					event_manager.publish('new_section_' + self.caller.id)
				}
				button_new.addEventListener('click', button_new_click_handler)
			}

		// button_duplicate . Call API to duplicate current record
		// use the section_button_new, if it's defined user can create or duplicate the section
			if (section_button_new) {
				const button_duplicate = ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'button block_icon light duplicate',
					title			: get_label.duplicate || "Duplicate",
					parent			: buttons_container
				})
				const button_duplicate_click_handler = (e) => {
					e.stopPropagation()
					event_manager.publish('duplicate_section_' + self.caller.id, {
						section_tipo	: self.caller.section_tipo,
						section_id		: self.caller.section_id,
						caller			: self.caller // section
					})
				}
				button_duplicate.addEventListener('click', button_duplicate_click_handler)
			}

		// button_delete . Call API to delete current record
			const section_button_delete = section_buttons.find(el => el.model==='button_delete')
			if (section_button_delete) {
				const button_delete = ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'button block_icon light remove',
					title			: section_button_delete.label || 'Delete',
					parent			: buttons_container
				})
				const button_delete_click_handler = (e) => {
					e.stopPropagation()
					event_manager.publish('delete_section_' + self.caller.id, {
						section_tipo	: self.caller.section_tipo,
						section_id		: self.caller.section_id,
						caller			: self.caller // section
					})
				}
				button_delete.addEventListener('click', button_delete_click_handler)
			}

		// button_target_section
			// Opens the list of all sections that have a direct relation to the current
			// one, rendered via render_open_list_with_direct_relations.
			const button_target_section = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'button block_icon light list',
				title			: get_label.open_relationships || 'Open relationships',
				parent			: buttons_container
			})
			const button_target_section_mousedown_handler = (e) => {
				e.stopPropagation()

				const target_sections = self.caller.get_all_target_sections()
				target_sections.sort((a, b) => a.label.localeCompare(b.label));

				const options ={
					target_sections	: target_sections,
					sqo				: clone(self.caller.rqo?.sqo) || {},
					caller_tipo		: null,
					rqo_options		: {
						type			: 'target_section',
						section_tipo	: null,
						tipo			: null,
						model			: 'section'
					},
					label		: self.caller.label,
					total		: self.caller.total,
					// (!) duplicate key: the first 'self_caller : self' (inspector instance)
					// is silently overwritten by the second assignment 'self_caller : self.caller'
					// (section instance). Flagged — the first line is dead code.
					self_caller : self,
					self_caller : self.caller
				}
				render_open_list_with_direct_relations( options )

			}
			button_target_section.addEventListener('mousedown', button_target_section_mousedown_handler)


		// button_graph . Switch the section to the interactive relations graph view
			const button_graph = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'button block_icon light graph',
				title			: get_label.graph || 'Graph',
				parent			: buttons_container
			})
			const button_graph_click_handler = async (e) => {
				e.stopPropagation()

				const section = self.caller
				if (!section || !section.section_id) {
					return
				}

				// set graph view (both flags: render_edit_section reads context.view, create_source reads view)
				// Both section.view and section.context.view must be updated because different
				// render paths read from different sources (context is the server-side shape;
				// view is the live client override).
				section.view = 'graph'
				if (section.context) {
					section.context.view = 'graph'
				}

				// re-render reusing already-loaded client data (no extra API call)
				// build_autoload:false prevents re-fetching the section record from the API;
				// the graph renderer only needs the relation map, not the full record data.
				await section.refresh({
					build_autoload	: false,
					render_level	: 'full'
				})
			}
			button_graph.addEventListener('click', button_graph_click_handler)


		// button_diffusion
			const tool_diffusion = self.caller.tools.find(el => el.name==='tool_diffusion')
			if (tool_diffusion) {
				const button_diffusion = ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'button block_icon light diffusion',
					title			: get_label.diffusion || 'Diffusion',
					parent			: buttons_container
				})
				const button_diffusion_mousedown_handler = (e) => {
					e.stopPropagation()
					// open_tool (tool_common)
					open_tool({
						tool_context	: tool_diffusion, // tool context
						caller			: self.caller // section instance
					})
				}
				button_diffusion.addEventListener('mousedown', button_diffusion_mousedown_handler)
			}

	// tools_container. Section tools buttons
	// Tools marked show_in_inspector:true in the ontology appear here.
	// When only one tool is present it is appended directly to buttons_container so
	// that the layout stays flush with the core action buttons.  When there are two
	// or more, a dedicated tools_container row is created.
		const inspector_tools			= self.caller.context.tools.filter( el => el.show_in_inspector )
		const inspector_tools_length	= inspector_tools.length
		let tools_container				= null
		if (inspector_tools_length>0) {
			if(inspector_tools_length > 1) {
				tools_container = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'tools_container top',
					parent			: content_data
				})
			}
			for (let i = 0; i < inspector_tools_length; i++) {
				const tool_context = inspector_tools[i]
				// load tool CSS lazily (no duplicate injection — load_style is idempotent)
				const tool_css_url = tool_base_url(tool_context.model) + '/css/' + tool_context.model + '.css' + `?v=${page_globals.dedalo_version}`
				load_style(tool_css_url)
				// tool_button
					// bg color. E.g. '--tool_ontology_color'  (a CSS custom property defined by the tool)
					const button_bg_color = `--${tool_context.name}_color`
					const tool_button = ui.create_dom_element({
						element_type	: 'span',
						class_name		: 'button block_icon light blank',
						style			: {
							'mask-image' : `url('${tool_context.icon}')`,
							// '--button-bg-color' : `var(${button_bg_color})`
						},
						title  : tool_context.label,
						parent : inspector_tools_length > 1 ? tools_container : buttons_container
					})
					const click_handler = (e) => {
						e.stopPropagation()
						// open_tool (tool_common)
						open_tool({
							tool_context	: tool_context,
							caller			: self.caller
						})
					}
					tool_button.addEventListener('mousedown', click_handler)

				// button events. Configured in tool properties. See tool_ontology definition
					// sample:
					// "events": [
					// 	{
					// 	  "type": "keyup",
					// 	  "action": "click",
					// 	  "validate": [
					// 		{
					// 		  "key": "ctrlKey",
					// 		  "value": true
					// 		},
					// 		{
					// 		  "key": "key",
					// 		  "value": "s"
					// 		}
					// 	  ]
					// 	}
					// ]
					if (tool_context.properties?.events) {
						const tool_events_length = tool_context.properties.events.length
						for (let i = 0; i < tool_events_length; i++) {

							const tool_event = tool_context.properties.events[i]

							set_tool_event({
								tool_event	: tool_event,
								tool_button	: tool_button
							})
						}
					}
			}
		}

	// selection info
		const selection_info = render_selection_info(self)
		content_data.appendChild(selection_info)

	// element_info. Selected element information
		const element_info = render_element_info(self)
		content_data.appendChild(element_info)

	// project container
		// The filter node (component_project_filter rendered DOM) is delivered
		// asynchronously via the event 'render_component_filter_<section_tipo>'
		// that is subscribed in inspector.prototype.init().  On the very first render
		// it may not yet be available (self.component_filter_node is undefined), in
		// which case the project block is omitted entirely.  On subsequent refreshes
		// (pagination) the event fires again and update_project_container_body() is
		// called to refresh the content without re-building the block structure.
		// (!) Note that the filter node is collected from a subscribed
		// event 'render_component_filter_xx' from self inspector init event
		if (self.component_filter_node) {
			const project_block = render_project_block(self)
			content_data.appendChild(project_block)
		}

	// relation_list container
		if (self.caller.context.config && self.caller.context.config.relation_list_tipo) {
			const relation_list = render_relation_list(self)
			content_data.appendChild(relation_list)
		}

	// Note that 'time_machine_list' is a Ontology item children of current section if defined
	// as 'numisdata588' and is used ONLY to determine if current section have a history changes list or not
	// The guard `if (self.caller.context.time_machine_list)` was previously used to show
	// the block only for sections that expose a time-machine ontology item.  It is now
	// commented out and both blocks are always rendered; visibility is controlled instead
	// by the collapse-toggle (default_state: 'closed') and by the lazy-load in expose().
		// if (self.caller.context.time_machine_list) {
			// time_machine_list container
				const time_machine_list = render_time_machine_list(self)
				content_data.appendChild(time_machine_list)

			// component_history container
				const component_history = render_component_history(self)
				content_data.appendChild(component_history)
		// }

	// activity_info
		const activity_info = render_activity_info(self)
		content_data.appendChild(activity_info)

	// buttons_bottom_container
		const buttons_bottom_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'buttons_container bottom',
			parent			: content_data
		})

		// data_link . Open window to full section JSON data
		// Builds the full RQO for the current record and opens the raw API response
		// in a new tab so developers can inspect the JSON structure without leaving the
		// edit view.  Uses DEDALO_API_URL which is injected globally by the PHP template.
			const data_link = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'light eye data_link',
				text_content	: get_label.record || 'View record data',
				parent			: buttons_bottom_container
			})
			const data_link_click_handler = function(e) {
				e.stopPropagation()
				e.preventDefault()

				const rqo = self.get_raw_record_rqo()

				const url = DEDALO_API_URL + '?' + object_to_url_vars({
					rqo : JSON.stringify(rqo)
				})

				open_window({
					url			: url,
					features	: 'new_tab'
				})

			}
			data_link.addEventListener('mousedown', data_link_click_handler)

		// tool register files.	dd1340
		// dd1340 is the ontology tipo for 'Tool register' sections (tool scaffolding records).
		// This button downloads the raw section record as a register.json file, which is the
		// canonical serialization format for tool registration in the v7 tools architecture.
			if (self.section_tipo==='dd1340') {
				const register_download = ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'warning download register_download',
					text_content	: 'Download register file',
					parent			: buttons_bottom_container
				})
				const register_click_handler = async (e) => {
					e.stopPropagation()
					e.preventDefault()

					const file_name = 'register.json'

					// confirm action by user
					if (!confirm(`Download file: ${file_name} ${self.caller.section_id} ?`)) {
						return false
					}

					const data = await self.get_raw_record()

					if(data) {
						// Download record as JSON file
						download_data(data, file_name)
					}
				}
				register_download.addEventListener('mousedown', register_click_handler)
			}//end if (self.section_tipo==='dd1340')


	return content_data
}//end get_content_data



/**
* RENDER_SELECTION_INFO
* Displays the name of the currently selected element (e.g., 'Description' or 'Section Name') in the inspector header.
* Adds a 'List' navigation button when a section is selected.
* @param {Object} self - Inspector instance.
* @returns {HTMLElement} selection_info_node - The rendered selection info container.
*/
const render_selection_info = function(self) {

	// selection_info_node
		const selection_info_node = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'selection_info'
		})

		/**
		 * update_label
		 * Updates the label display and optional actions based on the new selection.
		 * Triggered on activation or rendering of sections/components.
		 * @param {Object} caller - The section or component instance selected.
		 */
		selection_info_node.update_label = function(caller) {

			if (!caller) return

			// Store reference
			self.selection_info_node.caller = caller

			const fragment = new DocumentFragment()

			// add label text
			ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'selection_info_label',
				text_content	: caller.label || '',
				parent			: fragment
			})

			// add button list when info is about section
			add_list_button(caller, fragment)

			// Update container content efficiently
			selection_info_node.replaceChildren(fragment)
		}

		// fix pointer
		self.selection_info_node = selection_info_node

		/**
		 * add_list_button
		 * Appends a 'Go to list' button if the caller is a section.
		 * @param {Object} caller
		 * @param {DocumentFragment|HTMLElement} parent
		 */
		const add_list_button = function(caller, parent) {
			if (caller && caller.model === 'section' && caller.session_save === true) {
				const button_list = ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'button light list',
					title			: get_label.list || 'List',
					parent			: parent
				})
				button_list.addEventListener('mousedown', (e) => {
					e.stopPropagation()
					// go to section in list mode
					self.caller.goto_list()
				})
			}
		}

	// exec once
		selection_info_node.update_label(self.caller)


	return selection_info_node
}//end render_selection_info



/**
* RENDER_SECTION_INFO
* Renders the technical and administrative metadata of the current section into the inspector.
* This includes typology, model, database table, record ID, and audit trail (creation, modification, publication).
* Triggered via event manager subscription 'render_' + self.caller.id.
* @param {Object} self - Inspector instance.
* @param {Object} self.caller - Section instance providing the data.
* @param {HTMLElement} self.element_info_container - Target container for the rendered info.
* @returns {DocumentFragment} fragment - The rendered metadata structure.
*/
export const render_section_info = function(self) {

	// short vars
		const container		= self.element_info_container
		const section		= self.caller
		const section_data	= section.data?.entries && section.data?.entries[0]
			? section.data.entries[0]
			: {}

	// unsubscribe previous component value update event if exists
		if (container.update_value_event_token) {
			event_manager.unsubscribe(container.update_value_event_token)
			delete container.update_value_event_token
		}

	// values from caller (section)
		const section_tipo				= section.section_tipo
		const label						= section.label
		const mode						= section.mode
		const view						= section.view || 'default'
		const matrix_table				= section.context.matrix_table

	// DocumentFragment
		const fragment = new DocumentFragment();

	// Helper for safe multiline strings (omits undefined/null values)
		const format_info = (...args) => args.filter(Boolean).join('<br>') || '-'

	// tipo
		// label
			ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'key',
				text_content	: get_label.tipo || 'tipo',
				parent			: fragment
			})
		// value
			const tipo_info = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'value bold',
				text_content	: section_tipo,
				title			: 'Click to copy',
				parent			: fragment
			})
			tipo_info.addEventListener('mousedown', function(e) {
				e.stopPropagation()
				if (navigator?.clipboard) {
					navigator.clipboard.writeText( section_tipo )
				}
			})

	// info
		// label
			ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'key',
				text_content	: 'info',
				parent			: fragment
			})
		// value
			const info_container = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'value',
				parent			: fragment
			})
			// render_docu_links
			const docu_links = render_docu_links(self, section_tipo)
			info_container.appendChild(docu_links)

	// model
		// label
			ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'key',
				text_content	: get_label.model || 'Model',
				parent			: fragment
			})
		// value
			const model_info = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'value',
				text_content	: section.model,
				title			: 'Click to copy',
				parent			: fragment
			})
			model_info.addEventListener('mousedown', function(e) {
				e.stopPropagation()
				if (navigator?.clipboard) {
					navigator.clipboard.writeText( section.model )
				}
			})

	// matrix_table
		// label
			ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'key',
				text_content	: get_label.table || 'table',
				parent			: fragment
			})
		// value
			const matrix_table_info = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'value',
				text_content	: matrix_table,
				title			: 'Click to copy',
				parent			: fragment
			})
			matrix_table_info.addEventListener('mousedown', function(e) {
				e.stopPropagation()
				if (navigator?.clipboard) {
					navigator.clipboard.writeText( matrix_table )
				}
			})

	// section_id
		// label
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'key',
			text_content	: 'section_id',
			parent			: fragment
		})
		// value
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'value',
			text_content	: section.section_id,
			parent			: fragment
		})

	// view
		// label
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'key',
			text_content	: 'View',
			parent			: fragment
		})
		// value
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'value',
			text_content	: view + ' - ' + mode,
			parent			: fragment
		})

	// section created
		// label
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'key',
			text_content	: get_label.created || 'Created',
			parent			: fragment
		})
		// value
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'value',
			inner_html		: format_info(section_data.created_date, section_data.created_by_user_name),
			parent			: fragment
		})

	// section modified
		// label
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'key',
			text_content	: get_label.modified || 'Modified',
			parent			: fragment
		})
		// value
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'value',
			inner_html		: format_info(section_data.modified_date, section_data.modified_by_user_name),
			parent			: fragment
		})

	// published
		// label
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'key',
			inner_html		: (get_label.publicado || 'Published') + ' (first/last)',
			parent			: fragment
		})
		// value
		const pub_data = [
			section_data.publication_first_date,
			section_data.publication_first_user,
			section_data.publication_last_date,
			section_data.publication_last_user
		].filter(Boolean)

		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'value',
			inner_html		: pub_data.length > 0 ? pub_data.join('<br>') : (get_label.nunca || 'Never'),
			parent			: fragment
		})

	// clean and set container
		container.replaceChildren(fragment)

	// re-activate tooltips
	ui.activate_tooltips(container)

	return fragment
}//end render_section_info



/**
* RENDER_COMPONENT_INFO
* Renders detailed metadata and current data of a selected component into the inspector.
* Handles data parsing asynchronously and subscribes to value updates.
* @param {Object} self - Inspector instance.
* @param {Object} component - Component instance to display.
* @returns {DocumentFragment} fragment - The rendered component info structure.
*/
export const render_component_info = function(self, component) {

	const container	= self.element_info_container

	// values from caller (section)
		const tipo			= component.tipo
		const model			= component.model
		const mode			= component.mode
		const view			= component.view || 'default'
		const translatable	= component.context?.translatable
			? JSON.stringify(component.context.translatable)
			: 'no'

	// DocumentFragment
		const fragment = new DocumentFragment();

	// tipo
		// label
			ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'key',
				text_content	: 'tipo',
				parent			: fragment
			})
		// value
			const tipo_info = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'value bold',
				text_content	: tipo,
				title			: 'Click to copy',
				parent			: fragment
			})
			tipo_info.addEventListener('mousedown', function(e) {
				e.stopPropagation()
				if (navigator?.clipboard) {
					navigator.clipboard.writeText( tipo )
				}
			})

	// info
		// label
			ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'key',
				text_content	: 'info',
				parent			: fragment
			})
		// value
			const info_container = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'value',
				parent			: fragment
			})
			// render_docu_links
			const docu_links = render_docu_links(self, tipo)
			info_container.appendChild(docu_links)

	// model
		// label
			ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'key',
				text_content	: get_label.model || 'Model',
				parent			: fragment
			})
		// value
			const model_info = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'value',
				text_content	: model,
				title			: 'Click to copy',
				parent			: fragment
			})
			model_info.addEventListener('mousedown', function(e) {
				e.stopPropagation()
				if (navigator?.clipboard) {
					navigator.clipboard.writeText( model )
				}
			})

	// translatable
		// label
			ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'key',
				text_content	: get_label.translatable || 'Translatable',
				parent			: fragment
			})
		// value
			ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'value',
				text_content	: translatable,
				parent			: fragment
			})

	// view
		// label
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'key',
			text_content	: 'View',
			parent			: fragment
		})
		// value
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'value',
			text_content	: view + ' - ' + mode,
			parent			: fragment
		})

	// value
		// label
		const value_label_node = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'key wide icon_arrow',
			text_content	: get_label.data || 'Data',
			parent			: fragment
		})
		// value container
		const value_node = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'value wide code hide',
			parent			: fragment
		})
		// value text
		const value_text_node = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'value_text',
			text_content	: 'Parsing data..',
			parent			: value_node
		})

		// dblclick event
		value_node.addEventListener('dblclick', (e) => {
			e.stopPropagation()
			// toggle value container max-height from default to none
			container.classList.toggle('auto_height')
		})

		// button copy value (created once)
		const button_value_copy_node = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'button_value_copy warning hide',
			inner_html		: get_label.copy || 'Copy',
			parent			: value_node
		})
		// click event
		button_value_copy_node.addEventListener('click', (e) => {
			e.stopPropagation()
			if (navigator?.clipboard) {
				const entries = component.data?.entries || []
				navigator.clipboard.writeText( JSON.stringify(entries) )
			}
		})

		// parse data. This time out prevents lock component selection
		const callback = () => {

			const entries = component.data?.entries || []

			// Limit data size to display (data.value is an array of values)
			// e.g. component_security_access case. Do not try to parse the big array of the data.
				if (entries.length > 25) {
					value_text_node.textContent = 'Data is too big for display'
					value_text_node.classList.add('loading')
					button_value_copy_node.classList.add('hide')
					return
				}

			// set value
				const value = entries.length>0
					? JSON.stringify(entries, null, 1)
					: ''
				value_text_node.textContent = value

			// show/hide copy button
				button_value_copy_node.classList.toggle('hide', value==='')

			// monospace for JSON data
				// Note that this node is rendered again on each user component selection
				if (value.indexOf('[\n {')===0) {
					value_node.classList.add('monospace')
				} else {
					value_node.classList.remove('monospace')
				}
		}
		const exec_idle_callback = ()=>{ dd_request_idle_callback(callback) }
		exec_idle_callback()

		// event subscribe
		if (container.update_value_event_token) {
			// unsubscribe previous component subscription
			event_manager.unsubscribe(container.update_value_event_token)
		}
		// store subscription token on container to allow clean it when section info is rendered or new component selected
		container.update_value_event_token = event_manager.subscribe('update_value_'+ component.id_base, exec_idle_callback)

	// track collapse toggle state of content
		ui.collapse_toggle_track({
			toggler				: value_label_node,
			container			: value_node,
			collapsed_id		: 'inspector_component_value',
			collapse_callback	: collapse,
			expose_callback		: expose,
			default_state		: 'closed'
		})
		function collapse() {
			value_label_node.classList.remove('up')
		}
		function expose() {
			value_label_node.classList.add('up')
		}

	// clean and set container
		container.replaceChildren(fragment)

	// re-activate tooltips
	ui.activate_tooltips(container)


	return fragment
}//end render_component_info




/**
* RENDER_ELEMENT_INFO
* Builds the collapsible "Info" block in the inspector.  The block header is
* rendered immediately; the body (element_info_body) starts empty and is
* populated on demand by render_section_info() or render_component_info() when
* the user focuses a component or the section re-renders.
*
* A pointer to the body element is stored as self.element_info_container so
* that inspector.js event handlers (activate_component, render_) can locate
* the target node without searching the DOM.
*
* (!) Note: the comment in the original source contains a typo:
* 'self.element_info_containe' — the actual property name is
* 'self.element_info_container'.  Flagged but not fixed (doc-only rule).
*
* @param {Object} self - Inspector instance. self.element_info_container is set
*   to the body element as a side effect.
* @returns {HTMLElement} element_info_wrap - The block wrapper containing the
*   collapsible head and the (initially empty) body.
*/
const render_element_info = function(self) {

	// wrapper
	const element_info_wrap = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'element_info_wrap'
	})
	element_info_wrap.addEventListener('mousedown', function(e) {
		// prevents deactivate selected component when user clicks the inspector
		e.stopPropagation()
	})

	// element_info_head
		const element_info_head = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'element_info_head label icon_arrow up',
			parent			: element_info_wrap
		})
		decorate_block_header(element_info_head, 'info', get_label.informacion || "Info")

	// element_info_container (body)
		const element_info_body = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'element_info hide',
			parent			: element_info_wrap
		})
		// fix pointer to node placeholder
		self.element_info_container = element_info_body

	// track collapse toggle state of content
		ui.collapse_toggle_track({
			toggler				: element_info_head,
			container			: element_info_body,
			collapsed_id		: 'inspector_element_info_block',
			collapse_callback	: collapse,
			expose_callback		: expose
		})
		function collapse() {
			element_info_head.classList.remove('up')
		}
		function expose() {
			element_info_head.classList.add('up')
		}


	return element_info_wrap
}//end render_element_info



/**
* RENDER_PROJECT_BLOCK
* Builds the collapsible "Project" block in the inspector.  The block body hosts
* the component_project_filter widget, which lets the user select which projects
* the current record belongs to.
*
* The filter node itself (self.component_filter_node) is delivered asynchronously
* via the 'render_component_filter_<section_tipo>' event subscribed in
* inspector.prototype.init().  This function calls update_project_container_body()
* immediately (in case the node is already available) and stores the body element
* pointer as self.project_container_body so that subsequent event firings can
* refresh the content via update_project_container_body().
*
* @param {Object} self - Inspector instance. Must have self.component_filter_node
*   available (may be undefined on first call).  self.project_container_body is
*   set as a side effect.
* @returns {HTMLElement} project_wrap - The block wrapper element.
*/
const render_project_block = function(self) {

	// wrap
		const project_wrap = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'project_wrap'
		})

	// project_head
		const project_head = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'project_head icon_arrow up',
			parent			: project_wrap
		})
		decorate_block_header(project_head, 'gear', get_label.project || "Project")

	// project container
		const project_container_body = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'project_container hide',
			parent			: project_wrap
		})
		// fix project_container_body
		self.project_container_body = project_container_body
		// component_filter_node (collected in inspector init event 'render_component_filter_xx')
		update_project_container_body(self)

	// track collapse toggle state of content
		ui.collapse_toggle_track({
			toggler				: project_head,
			container			: project_container_body,
			collapsed_id		: 'inspector_project_block',
			collapse_callback	: collapse,
			expose_callback		: expose
		})
		function collapse() {
			project_head.classList.remove('up')
		}
		function expose() {
			project_head.classList.add('up')
		}


	return project_wrap
}//end render_project_block



/**
* UPDATE_PROJECT_CONTAINER_BODY
* Updates the project filter container by replacing its content with the current filter node.
* This is typically called after the component filter has been initialized or updated.
* @param {Object} self - Inspector instance.
* @param {HTMLElement} self.project_container_body - Target body container for the project filter.
* @param {HTMLElement} self.component_filter_node - The filter DOM node to display.
* @returns {boolean} Success status.
*/
export const update_project_container_body = function(self) {

	if (!self.project_container_body || !self.component_filter_node) {
		return false
	}

	// Replace all children with the new filter node (modern and efficient)
	self.project_container_body.replaceChildren(self.component_filter_node)

	return true
}//end update_project_container_body



/**
* RENDER_RELATION_LIST
* Builds the relations section for the inspector.
* Handles lazy loading and collapsing of the relation list.
* @param {Object} self - Inspector instance.
* @returns {HTMLElement} relation_list_container - The rendered relation list structure.
*/
const render_relation_list = function(self) {

	// wrapper
		const relation_list_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'relation_list_container'
		})

	// relation_list_head
		const relation_list_head = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'relation_list_head icon_arrow',
			parent			: relation_list_container
		})
		decorate_block_header(relation_list_head, 'link', get_label.relations || "Relations")

	// relation_list_body
		const relation_list_body = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'relation_list_body hide',
			parent			: relation_list_container
		})

	// relation_list events
		/**
		 * fn_relation_list_paginator
		 * Callback for relation list pagination events.
		 */
		const fn_relation_list_paginator = function(relation_list) {
			relation_list_body.classList.add('loading')
			load_relation_list(relation_list)
			.then(function(){
				relation_list_body.classList.remove('loading')
			})
		}
		self.events_tokens.push(
			event_manager.subscribe('relation_list_paginator_'+self.section_tipo, fn_relation_list_paginator)
		)

		/**
		 * fn_updated_section
		 * Triggered after section pagination to force relation list update if open.
		 */
		const fn_updated_section = function() {
			const is_open = !relation_list_body.classList.contains('hide')
			if (is_open) {
				load_relation_list()
			}
		}
		self.events_tokens.push(
			event_manager.subscribe('render_' + self.caller.id, fn_updated_section)
		)

	// track collapse toggle state of content
		/**
		 * load_relation_list
		 * Asynchronously loads and renders the list of relations.
		 * @param {Object} [instance] - Existing relation_list instance (pagination case).
		 */
		const load_relation_list = async function(instance) {

			relation_list_head.classList.add('up')

			const relation_list_tipo = self.caller.context?.config?.relation_list_tipo

			const relation_list	= (instance && instance.model==='relation_list')
				? instance // pagination case: reuse existing instance
				: await get_instance({
					model			: 'relation_list',
					tipo			: relation_list_tipo,
					section_tipo	: self.caller.section_tipo,
					section_id		: self.caller.section_id,
					mode			: self.mode
				})

			await relation_list.build()
			const rendered_node = await relation_list.render()

			// Replace all children with the new list (modern and efficient)
			relation_list_body.replaceChildren(rendered_node)
		}

		/**
		 * unload_relation_list
		 * Clears the relation list container.
		 */
		const unload_relation_list = function() {
			relation_list_body.replaceChildren()
			relation_list_head.classList.remove('up')
		}

		ui.collapse_toggle_track({
			toggler				: relation_list_head,
			container			: relation_list_body,
			collapsed_id		: 'inspector_relation_list',
			collapse_callback	: unload_relation_list,
			expose_callback		: expose,
			default_state		: 'closed'
		})

		function expose() {
			dd_request_idle_callback(() => {
				load_relation_list()
				relation_list_head.classList.add('up')
			})
		}

	return relation_list_container
}//end render_relation_list



/**
* RENDER_TIME_MACHINE_LIST
* Builds the collapsible "Latest changes" block in the inspector.  When the user
* opens (exposes) the block, load_time_machine_list() is called via
* dd_request_idle_callback to lazily load the service_time_machine instance that
* renders a mini grid of recent component-value changes across the whole section.
*
* The time_machine_list_body element pointer is stored as
* self.time_machine_list_container so that load_time_machine_list() can locate
* it without searching the DOM and can guard against loading when the block is
* collapsed (is_open check).
*
* Note: the commented-out event subscription block below the head would have
* refreshed the list on every section pagination ('render_' + self.caller.id).
* It was disabled in favour of the lazy expose approach.
*
* @param {Object} self - Inspector instance. self.time_machine_list_container is
*   set to the body element as a side effect.
* @returns {HTMLElement} time_machine_list_wrap - The block wrapper element.
*/
export const render_time_machine_list = function(self) {

	// wrapper
		const time_machine_list_wrap = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'time_machine_list'
		})

	// time_machine_list_head
		const time_machine_list_head = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'time_machine_list_head icon_arrow',
			parent			: time_machine_list_wrap
		})
		decorate_block_header(time_machine_list_head, 'history', get_label.latest_changes || 'Latest changes')

	// time_machine_list_body
		const time_machine_list_body = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'time_machine_list_body hide',
			parent			: time_machine_list_wrap
		})
		// fix pointer to node placeholder
		self.time_machine_list_container = time_machine_list_body

	// time_machine_list events subscription
		// self.events_tokens.push(
		// 	event_manager.subscribe('render_' + self.caller.id, fn_updated_section)
		// )
		// function fn_updated_section(){
		// 	// triggered after section pagination, it forces relation list update
		// 	const is_open = !time_machine_list_body.classList.contains('hide')
		// 	if (is_open) {
		// 		load_time_machine_list()
		// 	}
		// }

	// track collapse toggle state of content
		ui.collapse_toggle_track({
			toggler				: time_machine_list_head,
			container			: time_machine_list_body,
			collapsed_id		: 'inspector_time_machine_list',
			collapse_callback	: collapse,
			expose_callback		: expose,
			default_state		: 'closed'
		})
		function collapse() {
			time_machine_list_head.classList.remove('up')
		}
		function expose() {
			dd_request_idle_callback(
				() => {
					load_time_machine_list(self)
					time_machine_list_head.classList.add('up')
				}
			)
		}


	return time_machine_list_wrap
}//end render_time_machine_list



/**
* LOAD_TIME_MACHINE_LIST
* Lazily instantiates and renders the service_time_machine for the entire
* section (all components, all users) in a compact 'mini' view.
*
* Render contract:
*   - Returns null immediately when the container is collapsed ('hide' class present)
*     to avoid redundant API calls on background refreshes.
*   - Destroys the previous service_time_machine instance (if any) before creating a
*     new one, to avoid accumulating orphaned instances across pagination.
*   - Guards against inspector destruction during the await: if self.status becomes
*     'destroyed' while the get_instance promise resolves, the freshly-created
*     service is destroyed and null is returned.
*
* Called from:
*   - render_time_machine_list expose_callback (user opens the block)
*   - inspector.prototype.init save_handler (after any component save)
*   - inspector.js update_section_info (after section pagination)
*
* ddo_map note: dd1574 is the generic time-machine value ontology item.
*   model is set to 'dd_grid' (rather than the real component model) to allow
*   identification and special rendering by service_time_machine.
*
* @param {Object} self - Inspector instance. Must have self.time_machine_list_container,
*   self.caller (section), and self.section_tipo populated.
* @returns {Promise<HTMLElement|null>} The body container element on success,
*   or null when loading was skipped or the inspector was destroyed.
*/
export const load_time_machine_list = async function(self) {

	// container. Prevent to load data when the viewer is collapsed
		const container	= self.time_machine_list_container
		const is_open	= container && !container.classList.contains('hide')
		if (!is_open) {
			return null
		}

	// set as loading
		container.classList.add('loading')

	// (!) Note that expose is called on each section pagination, whereby must be generated
	// even if user close and re-open the time_machine_list inspector tab

	// destroy previous service to avoid instance leaks across pagination events
		if (self.service_time_machine) {
			await self.service_time_machine.destroy(
				true, // delete_self
				true // delete_dependencies
			)
		}

	// create and render a service_time_machine instance
		const service_time_machine = await get_instance({
			model			: 'service_time_machine',
			section_tipo	: self.caller.section_tipo,
			section_id		: self.caller.section_id,
			view			: 'mini',
			id_variant		: self.section_tipo + '_tm_list',
			caller			: self,
			caller_tipo		: self.caller.section_tipo,
			config			: {
				id					: 'section_history',
				model				: 'dd_grid', // used to create the filter
				tipo				: self.caller.section_tipo, // used to create the filter
				template_columns	: '1fr 1fr 1fr 2fr',
				ignore_columns		: [
					'matrix_id', // matrix_id dd1573,
					'bulk_process_id' // bulk_process_id dd1573
				],
				ddo_map				: [{
					tipo			: 'dd1574', // 'dd1574' generic tm info ontology item 'Value'
					type			: 'dd_grid',
					typo			: 'ddo',
					model			: 'dd_grid', // (!) changed to dd_grid to allow identification
					section_tipo	: self.section_tipo,
					parent			: self.section_tipo,
					debug_label		: 'Value',
					mode			: 'list',
					view			: 'mini'
				}]
			}
		})

		// check if inspector is destroyed after await
		if (self.status === 'destroyed' || !self.caller) {
			if (service_time_machine) service_time_machine.destroy(true, true)
			return null
		}

		await service_time_machine.build(true)
		const time_machine_list_wrap = await service_time_machine.render()

	// set new service_time_machine
		self.service_time_machine = service_time_machine

	// remove previous node if a pointer exists
		if (container.time_machine_list_wrap) {
			container.time_machine_list_wrap.remove()
		}

	// append node
		container.appendChild(time_machine_list_wrap)
		// set pointers
		container.time_machine_list_wrap = time_machine_list_wrap

	// set as loaded
		container.classList.remove('loading')


	return container
}//end load_time_machine_list



/**
* RENDER_COMPONENT_HISTORY
* Renders the structure for the component history section in the inspector.
* This container will hold the time machine service list for the active component.
* Note that self.element_info_container is fixed to allow inspector init event
* to locate the target node when is invoked.
* @param {Object} self - Inspector instance.
* @returns {HTMLElement} component_history_wrap - The rendered history structure.
*/
const render_component_history = function(self) {

	// wrapper
		const component_history_wrap = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'component_history'
		})
		component_history_wrap.addEventListener('mousedown', function(e) {
			// prevents deactivate selected component when user clicks the inspector
			e.stopPropagation()
		})

	// component_history_head
		const component_history_head = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'component_history_head icon_arrow',
			parent			: component_history_wrap
		})
		decorate_block_header(component_history_head, 'note', get_label.component_history || 'Component history')

	// component_history_body
		const component_history_body = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'component_history_body hide',
			parent			: component_history_wrap
		})
		// fix pointer to node placeholder
		self.component_history_container = component_history_body

	// track collapse toggle state of content
		ui.collapse_toggle_track({
			toggler				: component_history_head,
			container			: component_history_body,
			collapsed_id		: 'inspector_component_history_block',
			collapse_callback	: collapse,
			expose_callback		: expose,
			default_state		: 'closed'
		})
		function collapse() {
			component_history_head.classList.remove('up')
		}
		function expose() {
			dd_request_idle_callback(
				() => {
					load_component_history(self, self.actived_component)
					component_history_head.classList.add('up')
				}
			)
		}


	return component_history_wrap
}//end render_component_history



/**
* LOAD_COMPONENT_HISTORY
* Asynchronously initializes and renders the time machine history and annotation
* notes for a specific component.  Combines two ddo_map entries:
*   1. The selected component itself (mode:'tm') — shows its raw value at each
*      historical record.
*   2. An annotation component (rsc329 in section_tipo rsc832) — a text_area that
*      stores user notes attached to each time-machine entry.
*
* Guard conditions (returns null and clears the container):
*   - component is null/falsy: clears the container (called when section re-renders
*     with no active component).
*   - component.section_tipo !== self.section_tipo: skips update for components
*     belonging to modal/nested sections that share the event bus.
*   - Container is collapsed ('hide' class): skips the API call until the user opens
*     the block.
*   - Inspector is destroyed after the await: cleans up the fresh instance.
*
* Called from:
*   - render_component_history expose_callback (user opens the block)
*   - inspector.prototype.init activate_component_handler (user clicks a component)
*   - inspector.prototype.init save_handler (after saving the active component)
*
* @param {Object} self - Inspector instance with self.component_history_container
*   and self.section_tipo set.
* @param {Object|null} component - The component instance to show history for,
*   or null to clear the container.
* @returns {Promise<HTMLElement|null>} The container element on success, or null.
*/
export const load_component_history = async function(self, component) {

	// container
		const container	= self.component_history_container

	// prevent load the component data when component is not selected
		if(!component) {
			// remove previous node if exists pointer
			if (container) {
				container.replaceChildren()
				delete container.component_history_wrap
			}
			return null
		}

	// prevent to affect modals: components in nested/modal sections fire the same
	// 'activate_component' event on the shared event bus, but should not update
	// the inspector of a different section.
		if (component.section_tipo!==self.section_tipo) {
			return null
		}

	// container. Prevent to load data when the viewer is collapsed
		const is_open = container && !container.classList.contains('hide')
		if (!is_open) {
			return null
		}

	// set as loading
		container.classList.add('loading')

	// create and render a component_history instance (service_time_machine)
	// (!) Note that load_component_history is called on each section pagination, whereby must be generated
	// even if user close and re-open the component_history inspector tab
		const service_time_machine	= await get_instance({
			model			: 'service_time_machine',
			section_tipo	: self.caller.section_tipo,
			section_id		: self.caller.section_id,
			view			: 'history',
			id_variant		: component.tipo +'_'+ component.section_tipo + '_tm_list',
			caller			: self,
			caller_tipo		: component.tipo,
			config			: {
				id					: 'component_history_' + component.tipo,
				model				: component.model,
				tipo				: component.tipo,
				lang				: component.lang,
				// template_columns	: '1fr 1fr 2fr 2fr',
				ignore_columns		: [
					'bulk_process_id',
					'matrix_id',
					'where'
				],
				ddo_map				: [
					{ 	// selected component
						typo			: 'ddo',
						type			: 'component',
						model			: component.model,
						tipo			: component.tipo,
						section_tipo	: self.section_tipo,
						parent			: self.section_tipo,
						label			: component.label,
						mode			: 'tm',
						fixed_mode		: true, // preserves mode across section_record
						view			: 'text'
					},
					{	// notes component
						typo			: 'ddo',
						type			: 'component',
						model			: 'component_text_area',
						tipo			: 'rsc329',
						section_tipo	: 'rsc832',
						parent			: self.section_tipo,
						label			: 'Annotation',
						mode			: 'tm',
						fixed_mode		: true, // preserves mode across section_record
						view			: 'note'
					}
				]
			}
		})

		// check if inspector is destroyed after await
		if (self.status === 'destroyed' || !self.caller) {
			if (service_time_machine) service_time_machine.destroy(true, true)
			return null
		}

		await service_time_machine.build(true)
		const history_node = await service_time_machine.render()

	// Replace previous content with the new node
		if (container) {
			container.replaceChildren(history_node)
			// set pointer
			container.component_history_wrap = history_node
			// set as loaded
			container.classList.remove('loading')
		}


	return container
}//end load_component_history



/**
* RENDER_ACTIVITY_INFO
* Builds the collapsible "Activity" block in the inspector.  The block body is a
* bubbles_notification_container that accumulates save confirmations and error
* notifications in real time via load_activity_info().
*
* Unlike the time-machine and component-history blocks, the activity feed does NOT
* clear on collapse: bubbles remain in the DOM so the user can review past
* notifications after reopening the block.
*
* A pointer to the body element is stored as self.activity_info_container so
* that load_activity_info() can prepend new notification nodes without a DOM search.
*
* @param {Object} self - Inspector instance. self.activity_info_container is set
*   to the body element as a side effect.
* @returns {HTMLElement} wrapper - The block wrapper element.
*/
const render_activity_info = function(self) {

	// wrapper
		const wrapper = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'activity_info'
		})

	// activity_info_head
		const activity_info_head = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'activity_info_head icon_arrow',
			parent			: wrapper
		})
		decorate_block_header(activity_info_head, 'activity', get_label.activity || 'Activity')

	// activity_info_body (bubbles_notification_container)
		const activity_info_body = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'bubbles_notification_container activity_info_body hide',
			parent			: wrapper
		})
		// fix pointer to node placeholder
		self.activity_info_container = activity_info_body

	// track collapse toggle state of content
		ui.collapse_toggle_track({
			toggler				: activity_info_head,
			container			: activity_info_body,
			collapsed_id		: 'inspector_activity_info',
			collapse_callback	: collapse,
			expose_callback		: expose
		})
		function collapse() {
			activity_info_head.classList.remove('up')
		}
		function expose() {
			activity_info_head.classList.add('up')
		}


	return wrapper
}//end render_activity_info



/**
* LOAD_ACTIVITY_INFO
* Renders a new save/error notification bubble and prepends it to the activity
* feed container.  Called by inspector.js save_handler on every component save,
* regardless of whether the activity block is currently open (so the badge count
* stays accurate even when collapsed).
*
* @param {Object} self - Inspector instance with self.activity_info_container set.
* @param {Object} options - The options object received from the 'save' event.
*   Shape mirrors the save event payload (instance, result, etc.) passed through
*   to render_node_info() for display.
* @returns {Promise<HTMLElement>} The activity container element (always non-null).
*/
export const load_activity_info = async function(self, options) {

	// container
		const container	= self.activity_info_container

	// render notification bubble
		const node_info = render_node_info(options)

	// prepend node (at top of the list)
		container.prepend(node_info)


	return container
}//end load_activity_info



/**
* OPEN_ONTOLOGY_WINDOW
* Opens or reuses a single dedicated ontology window (window.docu_window) to show
* the given URL.
*
* Window reuse policy: if a window with target name 'docu_window' is already open
* (window.docu_window not null and not closed), its location is updated in-place
* rather than opening a second tab.  This provides a coherent single-window
* navigation experience when the user activates multiple components in sequence.
*
* The self.last_docu_type property is updated so that inspector.js activate_component_handler
* can re-navigate the window to the correct documentation type when the user switches
* component focus while the ontology window is already open.
*
* Position: the window is placed at the right edge of the primary screen
* (left = screen_width − window_width) so it does not overlap the Dédalo edit view.
*
* @param {Object} self - Inspector instance. self.last_docu_type is updated as a
*   side effect.
* @param {string} url - Full URL to navigate to (built by get_ontology_url).
* @param {string} docu_type - One of 'docu_link' | 'local_ontology' |
*   'local_ontology_search' | 'master_ontology'. Stored on self for subsequent calls.
* @param {boolean} [focus=false] - Whether to bring the ontology window to the
*   foreground after navigation. Defaults to false to avoid focus-stealing when
*   called automatically on component activation.
* @returns {boolean} Always true.
*/
export const open_ontology_window = function(self, url, docu_type, focus=false) {

	// fix docu_type (used in inspector.init event 'fn_activate_component')
	self.last_docu_type = docu_type

	// docu_window
	window.docu_window = window.docu_window || null

	if (window.docu_window && !window.docu_window.closed) {
		// recycle current already existing window
		window.docu_window.location = url
		if (focus===true) {
			window.docu_window.focus()
		}
	}else{
		// create a window from scratch; position to the right edge of the screen
		const window_width	= 1310
		const screen_width	= window.screen.width
		const screen_height	= window.screen.height
		const left = screen_width - window_width
		window.docu_window	= window.open(
			url,
			'docu_window',
			`left=${left},top=0,width=${window_width},height=${screen_height}`
		)
	}


	return true
}//end open_ontology_window



/**
* RENDER_DOCU_LINKS
* Builds a DocumentFragment containing icon-link buttons for navigating to
* ontology documentation related to a given tipo.  Always renders the public
* 'Documentation' link; adds three developer-only links when SHOW_DEVELOPER===true.
*
* Button set (always visible):
*   - docu_link  ('button link') — opens https://dedalo.dev/ontology/<tipo>
*
* Button set (SHOW_DEVELOPER only):
*   - local_ontology  ('button pen')  — opens the local instance's ontology page
*     for this tipo (e.g. https://localhost/dedalo/core/page/?tipo=dd0&section_id=1)
*   - local_ontology_search ('button tree') — opens the thesaurus tree (dd5) with a
*     pre-filled search_tipos parameter so the user lands directly on this tipo's node
*   - master_ontology ('button edit') — opens master.dedalo.dev for the canonical
*     source ontology record
*
* All buttons call open_ontology_window(), which reuses a single 'docu_window' popup
* so that clicking multiple links does not spawn multiple windows.
*
* Note: the local_ontology_search handler assigns the result of open_window() to
* const tree_window but never uses tree_window after that.  Flagged as unused
* variable (not fixed per doc-only rule).
*
* @param {Object} self - Inspector instance passed through to open_ontology_window().
* @param {string} tipo - Ontology tipo identifier (e.g. 'dd345', 'tch38').
* @returns {DocumentFragment} fragment containing the rendered link buttons.
*/
const render_docu_links = function(self, tipo) {

	// DocumentFragment
		const fragment = new DocumentFragment()

	// docu_link — always visible; opens the public Dédalo ontology documentation site
		const docu_link = ui.create_dom_element({
			element_type	: 'a',
			class_name		: 'button link',
			title			: 'Documentation',
			parent			: fragment
		})
		// mousedown event
		const mousedown_docu_handler = async (e) => {
			e.stopPropagation()

			const docu_type	= 'docu_link'
			const url		= await get_ontology_url(tipo, docu_type)
			open_ontology_window(
				self,
				url,
				docu_type
			)
		}
		docu_link.addEventListener('mousedown', mousedown_docu_handler)

	if (SHOW_DEVELOPER===true) {

		// local_ontology — opens the running instance's ontology section for this tipo
			const local_ontology = ui.create_dom_element({
				element_type	: 'a',
				class_name		: 'button pen',
				title			: 'Local Ontology',
				parent			: fragment
			})
			// mousedown event
			const mousedown_handler_local = async (e) => {
				e.stopPropagation()

				const docu_type	= 'local_ontology'
				const url		= await get_ontology_url(tipo, docu_type)
				if (!url) {
					console.error('Error. Invalid ontology info for tipo:', tipo);
					return
				}
				// open window like https://localhost/dedalo/core/page/?tipo=dd0&section_id=1
				open_ontology_window(
					self,
					url,
					docu_type
				)
			}
			local_ontology.addEventListener('mousedown', mousedown_handler_local)

		// local ontology tree search — opens the thesaurus (dd5) pre-filtered for this tipo
			const local_ontology_search = ui.create_dom_element({
				element_type	: 'a',
				class_name		: 'button tree',
				title			: 'Local Ontology tree search',
				parent			: fragment
			})
			// mousedown event
			const mousedown_handler_tree = async (e) => {
				e.stopPropagation()
				// url vars: extract tld prefix and numeric section_id from tipo
				// e.g. tipo 'tch38' → tld='tch', section_id='38'
				const tld			= get_tld_from_tipo(tipo)
				const section_id	= get_section_id_from_tipo(tipo)
				const url_vars = {
					tipo			: 'dd5',
					menu			: false,
					search_tipos	: tld + section_id
				}
				const url = DEDALO_CORE_URL + '/page/?' + object_to_url_vars(url_vars)
				// open window
				// (!) tree_window is declared but never used after this point — flagged.
				const tree_window = open_window({
					url		: url,
					name	: 'tree_window',
					width	: 1000,
					height	: 800
				})
			}
			local_ontology_search.addEventListener('mousedown', mousedown_handler_tree)

		// master_ontology — opens master.dedalo.dev for the canonical source ontology record
			const master_ontology = ui.create_dom_element({
				element_type	: 'a',
				class_name		: 'button edit',
				title			: 'Master Ontology',
				parent			: fragment
			})
			// mousedown event
			const mousedown_handler_master = async (e) => {
				e.stopPropagation()
				// open master.dedalo.dev section edit window
				const docu_type	= 'master_ontology'
				const url		= await get_ontology_url(tipo, docu_type)
				open_ontology_window(
					self,
					url,
					docu_type
				)
			}
			master_ontology.addEventListener('mousedown', mousedown_handler_master)

	}//end if (SHOW_DEVELOPER===true)


	return fragment
}//end render_docu_links



// @license-end
