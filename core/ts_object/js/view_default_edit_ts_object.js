// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, get_current_url_vars */
/*eslint no-undef: "error"*/



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
* Global render for the ts_object.
* It created the DOM nodes needed from the instance (wrapper, children_container, etc.)
* Render a wrapper containing all ts_object item nodes.
* Before render the instance, you need to load the data using `ts_node.get_children_data()`
* @param object ts_record
* @param return HTMLElement wrapper
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
* @param object self - ts_object instance
* @return HTMLElement content_data
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
* Get the JSON data from the server. When data is loaded, render DOM element
* Data is built from parent node info (current object section_tipo and section_id)
* @param object
* {
* 	clean_children_container: bool (default false)
* 	children_data: object {ar_children_data: [], pagination: {}}
* }
* @return promise
* 	Resolve bool true
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
* Render a instance of child nodes.
* @param object self - ts_object instance
* @param object child_data - Basic child instance information for instance
* @param int virtual_order - Number with the relative child order
* @return HTMLElement node_wrapper
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
* Render pagination button with events
* @param object options
* {
* 	children_container: HTMLElement
* 	pagination: object
* }
* @return HTMLElement button_show_more
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
* Normalized wrapper render
* @param object options
* @return HTMLElement wrap_ts_object
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
* Builds normalized link children HTMLElement
* @param object self - ts_object instance
* @return HTMLElement link_children_element
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
