// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, get_current_url_vars */
/*eslint no-undef: "error"*/



/**
* VIEW_DEFAULT_EDIT_TS_OBJECT
*
* View layer for a single thesaurus/ontology node (ts_object) in edit mode.
* This module owns the DOM construction and event wiring for the full
* ts_object rendering cycle: the outer wrapper, its content row, child
* container, drag-and-drop chrome, expand/collapse arrow, and paginated
* child loading.
*
* Exported symbols consumed by ts_object.js:
*   - view_default_edit_ts_object   constructor stub (no-op; presence signals "view loaded")
*   - render_children               bound as ts_object.prototype.render_children
*   - render_child                  builds one child ts_object instance + its DOM node
*   - render_link_children          creates the expand-arrow element and wires its toggle
*
* DOM hierarchy produced by render():
*   wrap_ts_object                  (div, dataset: section_tipo / section_id / id)
*     content_data                  (div, built by get_content_data)
*       id_column_content           (from render_id_column: add / drag / delete / order / edit buttons)
*       elements_container          (div, class includes caller.model)
*         [ts_line nodes]           (from render_ts_line: term text, arrow, indexation badges, etc.)
*       data_container              (div, hidden initially; component editors mount here)
*       indexations_container       (div, hidden initially; indexation grid mounts here)
*       nd_container                (div, hidden initially; non-descriptor children; descriptor nodes only)
*     children_container            (div, hidden; descriptor nodes only)
*       [wrap_ts_object …]          (recursive ts_object children)
*
* State contract:
*   - is_open is the single source of truth (owned by ts_object.set_open).
*     This view only reads is_open; it never writes it except via the
*     set_open / sync_open_dom entry points.
*   - children_container / data_container / indexations_container / nd_container
*     are DOM pointer properties set on the ts_object instance so that sibling
*     modules (render_ts_line, ts_object) can reach them without querying the DOM.
*/

// imports
	import {ui} from '../../common/js/ui.js'
	import {when_in_viewport, dd_request_idle_callback} from '../../common/js/events.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import {
		on_dragstart,
		on_dragend,
		on_drop,
		on_dragover,
		on_dragleave
	} from './drag_and_drop.js'
	import {ts_object} from '../../ts_object/js/ts_object.js'
	import {render_ts_line} from './render_ts_line.js'
	import {render_id_column} from './render_ts_id_column.js'



/**
* VIEW_DEFAULT_EDIT_TS_OBJECT
* Manages the component's logic and appearance in client side
*/
export const view_default_edit_ts_object = function() {

	return true
}//end view_default_edit_ts_object



/**
* RENDER
* Entry point for a full ts_object DOM render.
*
* Accepts a `render_level` option that controls how much work is done:
*   - 'content'  — return only the content_data fragment (skips wrapper +
*                  children_container). Used by common.prototype.refresh when
*                  it needs to swap in-place without recreating the outer shell.
*   - 'full'     — (default) build the complete subtree: wrapper → content_data
*                  → children_container (descriptor nodes) and, if the node was
*                  previously open, trigger a non-blocking re-open to reload
*                  its children (is_open continuity after a full re-render).
*
* Side effects on `self`:
*   - self.node is NOT set here; that pointer is set by common.prototype.render
*     after it receives the returned wrapper.
*   - self.children_container is set on the instance for descriptor nodes.
*   - self.is_open is NOT touched: the flag is the single source of truth owned
*     by ts_object.set_open(); this function only reads it.
*
* @param {Object} self - ts_object instance whose properties drive the render.
* @param {Object} options - Render options.
* @param {string} [options.render_level='full'] - 'full' or 'content'.
* @returns {Promise<HTMLElement|DocumentFragment>} wrapper (full) or content_data fragment (content).
*/
view_default_edit_ts_object.render = async function(self, options) {

	// options
		const render_level = options.render_level || 'full'

	// content_data
	// Note: is_open is NOT reset here. The flag is the single source of truth
	// owned by ts_object.set_open(); render only projects it (see below).
		const content_data = get_content_data(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ts_object wrapper
		const wrapper = render_wrapper(self)
		wrapper.content_data = content_data

		// add content_data
		wrapper.appendChild(content_data)

	// children container
		if ( self.is_descriptor===true ) {
			self.children_container = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'children_container hide',
				parent			: wrapper
			})

			// is_open continuity. A full re-render created a fresh (empty)
			// container: when the node was open, reload and show its children
			// (async on purpose: do not block the render of this node)
			if (self.is_open===true) {
				self.set_open(true, {persist: false})
				.catch((error) => {
					console.error('[render] Error restoring open children:', self.ts_id, error);
				})
			}
		}//end if (is_descriptor===true)


	return wrapper
}//end render



/**
* GET_CONTENT_DATA
* Assembles the inner content row for one ts_object node into a single
* `content_data` div.
*
* The layout inside content_data (left→right):
*   id_column_content  — action icons (add / drag / delete / order / edit)
*   elements_container — ts_line (term text, expand arrow, indexation badge, etc.)
*   data_container     — initially empty; receives component editors on demand
*   indexations_container — initially hidden; receives indexation grid on demand
*   nd_container       — initially hidden; non-descriptor (ND) children (descriptor nodes only)
*
* Pointer side effects on `self`:
*   self.data_container, self.indexations_container, self.nd_container
*   are set here so that other modules can reach these nodes without a DOM
*   query. (!) Order matters: render_ts_line reads self.indexations_container
*   but is called BEFORE that div is appended, so render_ts_line must look
*   up self.indexations_container at event-time, not at construction-time.
*
* @param {Object} self - ts_object instance.
* @returns {HTMLElement} content_data div containing the full content row.
*/
const get_content_data = function(self) {

	const fragment = new DocumentFragment()

	// id column . id column content (icons for edit, delete, drag, order)
		const id_column_node = render_id_column(self)
		fragment.appendChild(id_column_node)

	// elements container . ts_line (term, buttons, indexations, arrow children, etc.)
		const elements_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: ['elements_container',self.caller?.model].join(' '),
			parent			: fragment
		})
		// Add elements_container > ts_line_node
		const ts_line_node = render_ts_line(self)
		elements_container.appendChild(ts_line_node)

	// data container. Elements data container (component editions place)
		const data_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'data_container',
			parent			: fragment
		})
		// set pointer
		self.data_container = data_container

	// indexations container
		const indexations_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'indexations_container hide',
			parent			: fragment
		})
		// Set pointer
		self.indexations_container = indexations_container

	// nd_container. No descriptors container
		if ( self.is_descriptor===true ) {
			const nd_container = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'nd_container hide',
				parent			: fragment
			})
			// Set pointer
			self.nd_container = nd_container
		}

	// content_data div
		const content_data = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_data'
		})
		content_data.appendChild(fragment)


	return content_data
}//end get_content_data



/**
* RENDER_CHILDREN
* Renders DOM nodes for a list of child terms into the ts_object's
* children_container (and nd_container for non-descriptors).
*
* This function is bound to ts_object.prototype.render_children and called
* with `this` pointing to the parent ts_object instance:
*   await self.render_children({ clean_children_container, children_data })
*
* Data contract for `children_data`:
*   {
*     ar_children_data : Array<Object>  — list of child node descriptors
*     pagination       : {
*       total  : number,  — total matching children on the server
*       limit  : number,  — page size used in the last request
*       offset : number   — starting offset of the last page
*     }
*   }
*
* Each element in ar_children_data is a ts_object data descriptor returned
* by dd_ts_api::get_children_data, e.g.:
*   {
*     section_tipo          : 'hierarchy1',
*     section_id            : '66',
*     is_descriptor         : true,
*     has_descriptor_children: false,
*     order                 : 2,
*     ts_id                 : 'hierarchy1_66',
*     ts_parent             : 'hierarchy1_1',
*     ar_elements           : [{ type:'term', tipo:'hierarchy5', value:'Spain', model:'component_input_text' }]
*   }
*
* Stale-child cleanup (clean_children_container === true):
*   Before emptying the container, every cached child ts_object instance
*   is destroyed via destroy(delete_self=true, delete_dependencies=true,
*   remove_dom=false) — the DOM is then wiped by the container clear.
*   Fresh instances are created by render_child on the next loop.
*
* Recursion guard:
*   Children with the same section_tipo + section_id as the parent are
*   silently skipped to prevent infinite DOM recursion.
*
* Pagination:
*   When `children_data.pagination` indicates more records exist beyond the
*   current page, `render_ts_pagination` is scheduled via
*   dd_request_idle_callback → requestAnimationFrame to append a "Show more"
*   button without blocking the current paint.
*
* Fragment strategy:
*   All rendered nodes are collected into two DocumentFragments
*   (children_fragment for descriptors, nd_fragment for non-descriptors) and
*   appended synchronously after the loop. This ensures callers that await
*   this promise see the children already in the DOM, with a single reflow.
*
* @param {Object} options
* @param {boolean} [options.clean_children_container=false] - When true, destroys stale
*   child instances and empties the containers before rendering. Use true when
*   replacing content (reload); false when appending (pagination page).
* @param {Object} options.children_data - Children data object (see above). Required.
* @returns {Promise<boolean>} Resolves true on success, false on any recoverable error.
*/
export const render_children = async function(options) {
	if(SHOW_DEBUG===true) {
		console.warn('-> render_children:', this.section_tipo, this.section_id, options);
	}

	const self = this
	if (!self) {
		console.error('Invalid call to self from render_children:', this);
		return false
	}

	// options
		const {
			clean_children_container = false,
			children_data
		} = options;

	// Validate essential data
		if (!children_data?.ar_children_data) {
			console.error("[render_children] Error: Children data is missing or malformed.");
			return false;
		}

	// Get children container element. Is the div container inside current ts_object
	// View-layer error policy: recoverable render conditions log and return
	// false; they never throw (data-layer methods are the ones that throw)
		const children_container = self.children_container
		if (!children_container) {
			console.error("[render_children] The children container could not be found.", self);
			return false;
		}

	// Clean children container before build contents
		if (clean_children_container===true) {

			// destroy stale child instances first (recursive: delete_dependencies
			// reclaims the whole open subtree from the instances map and events).
			// Their DOM is removed by the container cleanup below. Fresh instances
			// are re-created by render_child on the next loop.
			const stale_instances = self.ar_instances.filter(el => el.model==='ts_object')
			for (const stale_instance of stale_instances) {
				await stale_instance.destroy(
					true, // delete_self
					true, // delete_dependencies
					false // remove_dom (container cleanup removes it)
				)
			}

			while (children_container.hasChildNodes()) {
				children_container.removeChild(children_container.lastChild);
			}
			// nd container children belong to this node too
			if (self.nd_container) {
				while (self.nd_container.hasChildNodes()) {
					self.nd_container.removeChild(self.nd_container.lastChild);
				}
			}
		}

	// Pagination
		// const pagination = self.children_data.pagination || {}
		const pagination = children_data?.pagination || {}
		// Is paginated resolution
		const is_paginated = Boolean(
			(pagination.total && pagination.limit) &&
			(pagination.total > pagination.limit) &&
			((pagination.offset + pagination.limit) < pagination.total)
		);

	// children_number
	// It is used as base to set the correct order when pagination is present
	// The 'virtual_order' sums children_number + array key + 1 to create a continuous sequence
	// It is necessary to get from real DOM nodes because the pagination loads blocks or records.
	const children_number = is_paginated
		? ([...self.children_container.childNodes].filter(el => el.classList.contains('wrap_ts_object')).length || 0)
		: 0

	// --------------------------------------------------------------------------------
	// CHILDREN DATA ITERATION
	// --------------------------------------------------------------------------------

	// Build DOM elements iterating ar_children_data.
	// Nodes are collected into fragments and attached SYNCHRONOUSLY once after
	// the loop: when render_children resolves, the children are really in the
	// tree (one paint, no interleaving). Search hierarchization and any caller
	// awaiting this promise rely on that invariant.

	const children_fragment	= new DocumentFragment()
	const nd_fragment		= new DocumentFragment()

	let counter = 0
	const ar_children_data_len = children_data.ar_children_data.length
	for (let i = 0; i < ar_children_data_len; i++) {

		const child_data = children_data.ar_children_data[i]

		// Ignore recursions. A child with the same properties of the parent can destroy the parent instance.
		if (child_data.section_tipo===self.section_tipo && parseInt(child_data.section_id)===parseInt(self.section_id)) {
			console.error('Ignored recursion in children data. ar_children_data:', children_data.ar_children_data);
			continue;
		}

		// Generate a virtual order based on the position in the array.
		const virtual_order = child_data.is_descriptor
			? children_number + counter + 1
			: counter + 1

		// Init, build and render the child instance.
		const node_wrapper = await render_child(self, child_data, virtual_order);

		// Append node to the proper fragment
		if (node_wrapper) {
			const target_fragment = (child_data.is_descriptor || self.is_root_node)
				? children_fragment
				: nd_fragment
			target_fragment.appendChild( node_wrapper )
		}else{
			console.warn('Error. Ignored invalid node wrapper. child_data:', child_data);
		}

		// update virtual_order counter
		if (child_data.is_descriptor) {
			counter++;
		}
	}

	// attach fragments (single synchronous append per container)
		if (children_fragment.hasChildNodes()) {
			children_container.appendChild(children_fragment)
		}
		if (nd_fragment.hasChildNodes() && self.nd_container) {
			self.nd_container.appendChild(nd_fragment)
		}

	// --------------------------------------------------------------------------------
	// END CHILDREN DATA ITERATION
	// --------------------------------------------------------------------------------

	// pagination
		if (is_paginated) {
			dd_request_idle_callback(
				() => {
					requestAnimationFrame(
						() => {
							render_ts_pagination({
								self		: self,
								pagination	: pagination
							})
						}
					)
				}
			);
		}

	// Removes arrow spinner if already exists
		const arrow_icon = self.node.querySelector('.loading_spinner');
		if (arrow_icon) {
			arrow_icon.classList.remove('loading_spinner');
		}


	return true
}//end render_children



/**
* RENDER_CHILD
* Creates, builds, and renders a single child ts_object node.
*
* Workflow:
*   1. ts_object.get_instance() is called with the child's key parts. When
*      an instance already exists in the global cache (same node previously
*      rendered), it is returned immediately. Otherwise a fresh instance is
*      created and cached.
*   2. caller is always refreshed on the returned instance to prevent stale
*      parent references after a parent re-render (cache-hit guard).
*   3. The instance is registered in self.ar_instances so that
*      destroy(delete_dependencies=true) on the parent reclaims the whole
*      open subtree.
*   4. build(false) populates instance data (from injected child_data.data
*      or from the API if data is absent).
*   5. render(render_level:'full') produces and returns the wrapper DOM node.
*
* Key parts forwarded to ts_object.get_instance:
*   section_tipo, section_id, children_tipo, target_section_tipo (null),
*   thesaurus_mode, ts_parent (parent's ts_id string).
*
* The `data` property is injected from child_data so that the build step can
* skip an extra API round-trip for freshly loaded children.
*
* @param {Object} self - Parent ts_object instance.
* @param {Object} child_data - Raw child descriptor from ar_children_data
*   (see render_children for the full shape).
* @param {number} virtual_order - 1-based display order of this child within
*   the current page of results.
* @returns {Promise<HTMLElement>} The rendered wrap_ts_object div for the child.
*/
export const render_child = async function(self, child_data, virtual_order) {

	// Creates an ts_object instance for each child
	const ts_object_instance = await ts_object.get_instance({
		// key_parts
		section_tipo			: child_data.section_tipo,
		section_id				: child_data.section_id,
		children_tipo			: child_data.children_tipo,
		target_section_tipo		: null,
		thesaurus_mode			: self.thesaurus_mode,
		ts_parent				: self.section_tipo + '_' + self.section_id,
		// Others
		caller					: self,
		linker					: self.linker, // usually a portal component instance
		thesaurus_view_mode		: self.thesaurus_view_mode,
		mode					: self.mode, // children inherit the parent mode (e.g. 'search')
		is_root_node			: false,
		is_ontology				: self.is_ontology,
		virtual_order			: virtual_order,
		has_descriptor_children	: child_data.has_descriptor_children,
		area_model				: self.area_model,
		ts_id					: child_data.section_tipo + '_' + child_data.section_id,
		data					: child_data // inject data to prevent calculate it again on build
	})

	// cache-hit case: refresh the caller pointer (the cached instance may
	// hold a reference to a previously destroyed parent of the same key)
	ts_object_instance.caller = self

	// register in the standard destroy cascade: destroying the parent
	// (delete_dependencies) now reclaims the whole subtree
	if (!self.ar_instances.includes(ts_object_instance)) {
		self.ar_instances.push(ts_object_instance)
	}

	await ts_object_instance.build(false)

	const node_wrapper = await ts_object_instance.render({
		render_level : 'full'
	})


	return node_wrapper
}//end render_child



/**
* RENDER_TS_PAGINATION
* Appends a "Show more" button to the children_container when the server has
* more children than the current page covers.
*
* The button is removed once its page loads successfully. While a load is
* in progress the button acquires the 'loading_spinner' CSS class and any
* further clicks are ignored (in-flight guard).
*
* Pagination object shape (received from the API and stored on the instance):
*   {
*     total  : number,   — total children count on the server
*     limit  : number,   — page size used for the last request
*     offset : number    — starting offset of the last page
*   }
*
* When the "Show more" button is clicked:
*   1. A new pagination object is built with offset += limit.
*      The original object is NOT mutated (built-by-value) because it is the
*      cached children_data.pagination.
*   2. get_children_data fetches the next page (cache: false).
*   3. The new ar_children_data is appended to self.children_data.ar_children_data
*      so subsequent full re-renders include all loaded pages.
*   4. render_children is called with clean_children_container=false to append
*      only the new nodes without destroying the already rendered ones.
*   5. On success the button removes itself.
*
* @param {Object} options
* @param {Object} options.self - ts_object instance owning the children_container.
* @param {Object} options.pagination - Pagination descriptor from children_data.
* @returns {HTMLElement} The appended "Show more" button div.
*/
const render_ts_pagination = function(options) {

	// options
		const self			= options.self
		const pagination	= options.pagination

	// button_show_more
		const button_show_more = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'button show_more',
			inner_html		: get_label.show_more || 'Show more',
			parent			: self.children_container
		})
		// mousedown event
		const mousedown_handler = (e) => {
			e.stopPropagation()

			// in-flight guard. Ignore further clicks while loading
			if (button_show_more.classList.contains('loading_spinner')) {
				return
			}

			// loading
			button_show_more.classList.add('loading_spinner')

			// next_pagination. Built by value: never mutate the received
			// pagination object (it is the cached children_data.pagination)
			const next_pagination = {
				...pagination,
				offset : pagination.offset + pagination.limit
			}

			// children_data - render_children_data from API
			self.get_children_data({
				pagination	: next_pagination,
				children	: null,
				cache		: false
			})
			.then(function(children_data){
				if (!children_data) {
					// error case
					console.warn("[ts_object.render_children] Error, children_data is null");
					button_show_more.classList.remove('loading_spinner')
					return false
				}

				// Fix children_data
				self.children_data = self.children_data || {
					ar_children_data : [],
					pagination : null
				}
				self.children_data.pagination = children_data.pagination
				self.children_data.ar_children_data.push(...children_data.ar_children_data)

				// render children
				self.render_children({
					clean_children_container	: false,
					children_data				: children_data // Only new data will be rendered and added
				})
				.then(function(){
					button_show_more.remove()
				})
			})
		}
		button_show_more.addEventListener('mousedown', mousedown_handler)//end click


	return button_show_more
}//end render_ts_pagination



/**
* RENDER_WRAPPER
* Builds the outermost `wrap_ts_object` div for a ts_object node and wires
* all HTML drag-and-drop events onto it.
*
* Data attributes set on the wrapper:
*   data-section_tipo  — section_tipo of the node
*   data-section_id    — section_id of the node
*   data-id            — instance cache key (self.id); read by drag_and_drop.on_drop
*                        to look up the target instance in the global instances map.
*
* CSS class variants:
*   'wrap_ts_object'              — descriptor nodes
*   'wrap_ts_object wrap_ts_object_nd' — non-descriptor (ND) nodes
*
* Drag-and-drop mechanics (descriptor nodes only):
*   The wrapper itself is NOT draggable by default. It becomes draggable only
*   after the user presses mousedown on the drag-icon (rendered by
*   render_id_column), which sets wrapper.event_handle = e and
*   wrapper.draggable = true. The dragstart handler checks event_handle; if it
*   is null the drag is rejected via preventDefault (prevents accidental drags
*   from clicking the term text or buttons). dragend/drop/dragleave all reset
*   event_handle to null so that the next interaction starts clean.
*
* @param {Object} self - ts_object instance.
* @returns {HTMLElement} The configured wrap_ts_object div.
*/
const render_wrapper = function(self) {

	// options
		const is_descriptor = self.is_descriptor ?? true

	// short vars
		const section_tipo		= self.section_tipo
		const section_id		= self.section_id
		// const children_tipo	= self.children_tipo

	// dataset
		const dataset = {
			section_tipo	: section_tipo,
			section_id		: section_id,
			id				: self.id
		}

	// class_name
		const class_name = is_descriptor===true ? 'wrap_ts_object' : 'wrap_ts_object wrap_ts_object_nd'

	// wrap_ts_object
		const wrap_ts_object = ui.create_dom_element({
			element_type	: 'div',
			class_name		: class_name,
			data_set		: dataset
		})
		// set pointer to common render
		// wrap_ts_object.content_data = wrap_ts_object
		// drag events attach
		if (is_descriptor===true) {

			// dragstart event. Activated on dragger click
			const dragstart_handler = (e) => {
				on_dragstart(self, e)
			}
			wrap_ts_object.addEventListener('dragstart', dragstart_handler)

			// dragend event
			const dragend_handler = (e) => {
				// deactivate wrapper event_handle (forces to select from drag icon)
				wrap_ts_object.event_handle = null
				on_dragend(self, e)
			}
			wrap_ts_object.addEventListener('dragend', dragend_handler)

			// drop event
			const drop_event = (e) => {
				// deactivate wrapper event_handle (forces to select from drag icon)
				wrap_ts_object.event_handle = null
				on_drop(self, e, wrap_ts_object)
			}
			wrap_ts_object.addEventListener('drop', drop_event)

			// dragover event
			const dragover_handler = (e) => {
				on_dragover(self, e)
			}
			wrap_ts_object.addEventListener('dragover', dragover_handler)

			// dragleave
			const dragleave_handler = (e) => {
				// deactivate wrapper event_handle (forces to select from drag icon)
				wrap_ts_object.event_handle = null
				on_dragleave(self, e)
			}
			wrap_ts_object.addEventListener('dragleave', dragleave_handler)
		}


	return wrap_ts_object
}//end render_wrapper



/**
* RENDER_LINK_CHILDREN
* Builds the expand/collapse arrow icon element for descriptor nodes and
* wires the toggle interaction.
*
* The arrow icon is the visual indicator that the node has children and
* allows the user to open/close the children_container. It uses the
* ts_object.set_open() single entry point exclusively — this function
* never modifies is_open or children_container directly.
*
* Open/close mechanics:
*   - On mousedown: calls self.set_open(!self.is_open, options).
*     Holding Alt while clicking a collapsed node sets force_reload=true
*     so that the children data is re-fetched from the server even if it
*     was previously loaded and cached.
*   - Visual state (CSS class 'open' on the element) is immediately
*     synchronised by set_open → sync_open_dom after the state update.
*
* Persisted expand state (non-search mode only):
*   After the element enters the viewport, the function checks the
*   local_db 'status' table for a persisted open flag (written by
*   set_open(true)). If found and the node is not already open it calls
*   set_open(true, { persist: false }) to restore the previous user's
*   expanded state without overwriting the stored value.
*
*   (!) In 'search' mode this restore is skipped to avoid inadvertently
*   expanding nodes that happen to match a search but were never opened
*   in the regular tree view.
*
* @param {Object} self - ts_object instance. Must have: id, is_open,
*   set_open, sync_open_dom, mode, ts_id, link_children_element.
* @returns {HTMLElement} The link_children_element div (also set as
*   self.link_children_element for external access by sync_open_dom and
*   set_open).
*/
export const render_link_children = function (self) {

	// local_db_id. If thesaurus_mode is defined use a different status track
	// to prevent overwrite the main status of the ts_object element
		const local_db_id = self.id

	// link_children_element. Open children arrow icon.
		const link_children_element = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'link_children unselectable'
		})
		// fix pointer
		self.link_children_element = link_children_element

	// sync style with is_open status.
	// All open/close logic lives in ts_object.set_open / sync_open_dom
		self.sync_open_dom()

	// mousedown event. Toggle through the single entry point
		const mousedown_handler = (e) => {
			e.stopPropagation()

			self.set_open(!self.is_open, {
				force_reload : e.altKey===true && self.is_open===false
			})
			.catch((error) => {
				console.error('[link_children] Error toggling children:', self.ts_id, error);
			})
		}
		link_children_element.addEventListener('mousedown', mousedown_handler)

	// restore open arrow status from the persisted local db state
		if (self.mode!=='search') {
			dd_request_idle_callback(
				() => {
					data_manager.get_local_db_data(local_db_id, 'status')
					.then((status) => {
						if (!status?.value) {
							return
						}
						when_in_viewport(
							link_children_element,
							() => {
								if (!self.is_open) {
									// open without re-persisting the already persisted state
									self.set_open(true, {persist: false})
									.catch((error) => {
										console.error('[link_children] Error restoring open state:', self.ts_id, error);
									})
								}
							}
						);
					})
				}
			);
		}


	return link_children_element
}//end render_link_children



// @license-end
