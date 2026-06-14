// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_DEFAULT_EDIT_SECTION_RECORD
* Renders a single section record in the 'default' edit-mode layout.
*
* This module is the primary edit view for a section_record.  It is reached when
* `self.context.view` is 'default' (or absent), routed from
* `render_edit_section_record.prototype.edit` → `view_default_edit_section_record.render`.
*
* The rendering pipeline has two phases:
*   1. All child component and grouper instances are built in parallel by
*      `section_record.get_ar_instances_edit()`.
*   2. `get_content_data_edit` renders every instance, then distributes DOM nodes
*      to their correct parent: either directly to the root `content_data` node, or
*      inside a grouper instance's `content_data` sub-node.
*
* Special cases handled here:
*   - `component_filter` instances are not mounted into the DOM; instead an
*     `event_manager` publish causes the inspector to pick them up.
*   - Grouper instances expose a `.content_data` property on their wrapper node,
*     avoiding a DOM search when child components must be appended.
*   - When `options.render_level === 'content'`, only the inner `content_data`
*     div is returned (used by partial re-render flows).
*
* Exports: `view_default_edit_section_record` (namespace object with static `.render`).
*/
export const view_default_edit_section_record = function() {

	return true
}//end view_default_edit_section_record



/**
* RENDER
* Render the node to use in edit mode
*
* Entry point called by render_edit_section_record.prototype.edit for the 'default' view.
* Builds all child instances, delegates DOM construction to get_content_data_edit, then
* wraps the result in an outer container with layout and mode CSS classes.
*
* When `options.render_level === 'content'`, the outer wrapper is skipped and the raw
* content_data node is returned instead — this path is used by partial re-render callers
* that manage the wrapper themselves.
*
* The optional debug click handler (guarded by SHOW_DEBUG) intercepts alt-clicks on the
* wrapper to stop propagation without logging anything — the consumer is expected to add
* its own alt-click listener on the wrapper after this call.
*
* @param {Object} self - The section_record instance being rendered.
*   Must have: model, tipo, mode, section_tipo, context, get_ar_instances_edit().
* @param {Object} options - Render options.
*   @param {string} [options.render_level='full'] - 'full' returns the full wrapper;
*     'content' returns only the inner content_data node.
* @returns {Promise<HTMLElement>} The outer wrapper div (render_level 'full') or the
*   inner content_data div (render_level 'content').
*/
view_default_edit_section_record.render = async function(self, options) {

	// options
		const render_level = options.render_level || 'full'

	// ar_instances calculate
		const ar_instances = await self.get_ar_instances_edit()

	// content_data
		const content_data = await get_content_data_edit(self, ar_instances)
		if (render_level==='content') {
			return content_data
		}

	// section_record wrapper
		const wrapper = ui.create_dom_element({
			element_type : 'div'
		})
		const ar_css = [
			self.model,
			self.tipo,
			self.mode,
			'view_'+self.context.view
		]
		wrapper.classList.add(...ar_css)
		wrapper.appendChild(content_data)

	// debug
		if(SHOW_DEBUG===true) {
			const fn_click_debug = function(e) {
				if (e.altKey) {
					e.stopPropagation()
					e.preventDefault()
				}
			}//end fn_click_debug
			wrapper.addEventListener('click', fn_click_debug)
		}


	return wrapper
}//end render



/**
* GET_CONTENT_DATA_EDIT
* Iterates the received instances rendering each of them into the content_data container node
*
* Two-pass algorithm:
*   Pass 1 — All instances are rendered in parallel via Promise.all so that each
*             instance's `.node` is available before the DOM tree is assembled.
*             Already-rendered instances (status === 'rendered' && node !== null)
*             are skipped to avoid double-render.
*   Pass 2 — Nodes are placed into their correct parent according to
*             `current_instance.context.parent_grouper`:
*             • If parent_grouper equals `self.section_tipo`, the instance is a direct
*               root-level child and is appended to the DocumentFragment.
*             • Otherwise the owning grouper instance is located by matching tipo,
*               section_id, and section_tipo, and the node is appended to the grouper's
*               `content_data` sub-node (if type === 'grouper') or directly to the
*               grouper wrapper node (safe fallback for non-grouper parents).
*             • If no matching parent is found, the node falls back to the fragment root.
*
*   component_filter instances are never mounted into the DOM here.  Instead a
*   'render_component_filter_<section_tipo>' event is published so that the inspector
*   panel can pick up the component node independently.
*
* @param {Object} self - The section_record instance (provides section_tipo, mode, type).
* @param {Array} ar_instances - Built component/grouper instances from get_ar_instances_edit().
*   Each element must expose: status, node, model, section_tipo, section_id, context.parent_grouper,
*   tipo, type, render().
* @returns {Promise<HTMLElement>} content_data div containing all rendered and hierarchised nodes.
*/
const get_content_data_edit = async function(self, ar_instances) {

	const fragment = new DocumentFragment()

	// render. Render all instances node in parallel
		const ar_instances_length = ar_instances.length
		const ar_promises = []
		for (let i = 0; i < ar_instances_length; i++) {
			const current_promise = new Promise(function(resolve){

				const current_instance = ar_instances[i]

				// already rendered case
				if (current_instance.status==='rendered' && current_instance.node!==null) {
					resolve(true)
				}else{
					current_instance.render()
					.then(()=>{
						resolve(true)
					})
					.catch((errorMsg) => {
						console.error(errorMsg);
						resolve(false)
					})
				}
			})
			ar_promises.push(current_promise)
		}
		// nodes. Await all instances are parallel rendered
		await Promise.all(ar_promises) // render work done safely

	// hierarchize nodes. Distribute nodes to parents
		for (let i = 0; i < ar_instances_length; i++) {

			if (typeof ar_instances[i]==='undefined') {
				console.warn(`Skipped undefined instance key ${i} from ar_instances:`, ar_instances);
				console.log("self:",self);
				continue;
			}

			const current_instance = ar_instances[i]

			// component_filter case . Send to inspector
				if (current_instance.model==='component_filter') {
					// render_component_filter_xx event is observed by inspector init
					// to get the component DOM node and to place it into the inspector container
					event_manager.publish('render_component_filter_' + current_instance.section_tipo, current_instance)
					continue;
				}

			// instance_node
				const current_instance_node	= current_instance.node || await current_instance.render()

			// parent_grouper. get the parent node inside the context
				const parent_grouper = current_instance.context.parent_grouper

			// if the item has the parent, the section_tipo is direct children of the section_record
			// else it has another item parent
			if(parent_grouper===self.section_tipo){

				// direct root level case
				fragment.appendChild(current_instance_node)

			}else{

				// get the parent instance like section group or others
				const parent_instance = ar_instances.find(
					instance => instance.tipo===parent_grouper
							&&  instance.section_id==current_instance.section_id
							&&  instance.section_tipo===current_instance.section_tipo
				)
				// if parent_istance exist, go to append the current instance to it.
				if(typeof parent_instance!=='undefined') {

					const parent_node = parent_instance.node || await parent_instance.render()
					// move the node to his father
					if (parent_instance.type==='grouper') {
						// append inside content data of grouper
						// Note that 'content_data' is attached to grouper wrapper as a property to avoid DOM search
						const grouper_content_data_node = parent_node.content_data
						grouper_content_data_node.appendChild(current_instance_node)
					}else{
						// direct attach (safe fallback)
						parent_node.appendChild(current_instance_node)
					}
				}else{
					// direct attach (safe fallback)
					fragment.appendChild(current_instance_node)
				}
			}
		}//end for (let i = 0; i < ar_instances_length; i++)

	// content_data (section_record)
		const content_data = document.createElement('div')
			  content_data.classList.add('content_data', self.mode, self.type)
			  content_data.appendChild(fragment)


	return content_data
}//end get_content_data_edit



// @license-end
