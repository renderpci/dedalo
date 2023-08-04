// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {set_before_unload, when_in_viewport} from '../../common/js/events.js'
	import {ui} from '../../common/js/ui.js'
	// import {data_manager} from '../../common/js/data_manager.js'



/**
* VIEW_DEFAULT_EDIT_SECURITY_ACCESS
* Manages the component's logic and appearance in client side
*/
export const view_default_edit_security_access = function() {

	return true
}//end view_default_edit_security_access



/**
* RENDER
* Render node for use in modes: edit, edit_in_list
* @param object self
* @param object options
* @return HTMLElement wrapper
*/
view_default_edit_security_access.render = async function(self, options) {

	// options
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = await get_content_data(self)
		if (render_level==='content') {
			return content_data
		}

	// buttons
		const buttons = (self.permissions > 1)
			? get_buttons(self)
			: null

	// wrapper. ui build_edit returns component wrapper
		const wrapper_options = {
			content_data : content_data,
			buttons 	 : buttons
		}
		if (self.view==='line') {
			wrapper_options.label = null // prevent to create label node
		}
		const wrapper = ui.component.build_wrapper_edit(self, wrapper_options)
		// set pointers
		wrapper.content_data = content_data


	return wrapper
}//end render



/**
* GET_CONTENT_DATA
* @param object self
* @return HTMLElement content_data
*/
const get_content_data = async function(self) {

	// short vars
		const data		= self.data || {}
		// array of objects with all elements from Ontology
		const datalist	= data.datalist || []
		// NOTE: value here is not data.value!!!!
		// Used filled_value because the data.value do not have values with 0 (no access)
		// filled_value is the full value that will not save in DDBB
		// the name value of const is used to maintain the content_data uniformity between components
		const value		= self.filled_value || [] // data.value || []

	// debug
		if(SHOW_DEBUG===true) {
			// console.log("component_security_access value:", value);
			// console.log("datalist:",datalist);
			// console.log("datalist_object:",datalist_object);
		}

	// content_data
		const content_data = ui.component.build_content_data(self)
			  content_data.classList.add('nowrap')

	// root level nodes. Filtered form full datalist
		const root_level_items = datalist.filter(el => el.parent==='dd1')

	// Tree
		// ul tree_root
			const ul = ui.create_dom_element({
				element_type	: 'ul',
				class_name		: 'ul_item content_value tree_root', // former 'inputs_container'
				parent			: content_data
			})

	// Read only
		 if(self.permissions === 1){
		 	// tree_nodes. create nodes and add to tree_object
			const tree_nodes = await render_tree_items_read(
				root_level_items, // array of objects as [{"label":"Inventory","model":"area_root","parent":"dd1","section_tipo":"dd242","tipo":"dd242"},...]
				datalist, // array of objects. Full items list
				value, // array of objects. Full list of data as [{"section_tipo":"mupi2","tipo":"mupi23","value":2},...]
				self // object this instance
			)// return DocumentFragment with li nodes
			ul.appendChild(tree_nodes)

			return content_data
		 }

	// Read and write
		// button_save
			const button_save = ui.create_dom_element({
				element_type	: 'button',
				class_name		: 'primary save button_save folding hide',
				inner_html		: get_label.save || 'Save',
				parent			: content_data
			})
			button_save.addEventListener("click", async function(e){
				e.stopPropagation()
				await self.save_changes()
				button_save.classList.add('hide')
				const warning_label_text = self.node.querySelector('.warning_label_text')
				if (warning_label_text) {
					warning_label_text.remove()
				}
			})
			self.events_tokens.push(
				event_manager.subscribe('show_save_button_'+self.id, fn_show_save_button)
			)
			function fn_show_save_button() {
				button_save.classList.remove('hide')
				const label = self.node.querySelector('.label')
				if (label && !label.querySelector('.warning_label_text')) {
					// warning_label_text
					ui.create_dom_element({
						element_type	: 'span',
						class_name		: 'warning_label_text blink',
						inner_html		: get_label.unsaved_changes || 'Unsaved changes!',
						parent			: label
					})
				}

				// page unload event
					// set_before_unload (bool) add
					set_before_unload(true)
			}

			// debug
				// value.push({
				// 	tipo			: 'numisdata1017',
				// 	section_tipo	: 'numisdata1016',
				// 	value			: 1
				// })
				//
				// console.log('numisdata1016 section item:', datalist.filter(el => el.tipo==='numisdata1016'));
				// const found = datalist.find(el => el.tipo==='numisdata1017')
				// found.section_tipo = 'numisdata3'
				// console.log('numisdata1017 item:', datalist.filter(el => el.tipo==='numisdata1017'));
				// console.log('numisdata1017 value:', value.filter(el => el.tipo==='numisdata1017'));

			// tree_nodes. create nodes and add to tree_object
				const tree_nodes = await render_tree_items(
					root_level_items, // array of objects as [{"label":"Inventory","model":"area_root","parent":"dd1","section_tipo":"dd242","tipo":"dd242"},...]
					datalist, // array of objects. Full items list
					value, // array of objects. Full list of data as [{"section_tipo":"mupi2","tipo":"mupi23","value":2},...]
					self // object this instance
				)// return DocumentFragment with li nodes
				ul.appendChild(tree_nodes)


	return content_data
}//end get_content_data



/**
* RENDER_TREE_ITEMS
* Render given tree items hierarchically
* @param array items
* @param array datalist
* @param array value
* @param instance self
*
* @return DocumentFragment
* 	Containing li nodes
*/
const render_tree_items = function(items, datalist, value, self) {
	// const t0 = performance.now()

	// tree_object . Object with all li nodes rendered sequentially
		const tree_object = {}

	// render nodes. Every area/section node
		const items_length = items.length
		for (let i = 0; i < items_length; i++) {

			const current_item = items[i]

			// render_tree_item (with pointer to their item)
				const tree_node	= render_tree_item(
					current_item,
					datalist,
					value,
					self
				)// li node

			// store in the tree_object
				const key = current_item.tipo
				tree_object[key] = tree_node
		}

	// hierarchize nodes
		const fragment = new DocumentFragment()
		for(const key in tree_object) {

			const tree_node	= tree_object[key]
			const item		= tree_node.item

			// const parent_key = (item.tipo===item.section_tipo)
			// 	? item.parent + '_' + item.parent // sections/areas case
			// 	: item.parent + '_' + item.section_tipo // others (components, section_groups, ...)
			const parent_key = item.parent

			if(tree_object[parent_key]) {
				// move node to parent branch
				tree_object[parent_key].branch.appendChild(tree_node)
				// console.log("Added to parent branch:", key, parent_key);
			}else{
				// add to root level
				fragment.appendChild(tree_node)
			}
		}
		// console.log('performance.now()-t0:', performance.now()-t0);


	return fragment
}//end render_tree_items



/**
* RENDER_TREE_ITEM
* Recursive function to render tree items
* @param object item
* @param array datalist
* @param array value
* @param object self
*
* @return HTMLElement tree_item_node
*/
const render_tree_item = function(item, datalist, value, self) {

	// single item case.
		const fn_render = (item.tipo===item.section_tipo)
			? render_area_item
			: render_permissions_item

	// create node and add to tree_object
		const tree_item_node = fn_render(
			item,
			datalist,
			value,
			self
		)
		// attach item object as pointer
		tree_item_node.item = item


	return tree_item_node
}//end render_tree_item



/**
* RENDER_AREA_ITEM
* Create default tree item node (section, area)
* @param object item
* 	datalist current item
* @param array datalist
* 	full list of section elements from ontology
* @param array value
* 	full list of elements in self.data (DB) at key zero (this component has only one value but format is array)
* @param object self
* 	self component instance
* @return HTMLElement li
*/
const render_area_item = function(item, datalist, value, self) {

	// direct_children check and set
		const tipo					= item.tipo
		const section_tipo			= item.section_tipo
		const direct_children		= item.model==='section'
			? datalist.filter(el => el.section_tipo===tipo && el.tipo!==tipo)
			: datalist.filter(el => el.parent===tipo)
		// add children subsections (dataframe cases)
		if (item.model==='section') {
			const direct_children_length = direct_children.length
			for (let i = 0; i < direct_children_length; i++) {
				const item = direct_children[i]
				if (item.model==='section') {
					const sub_children = datalist.filter(el => el.parent===item.tipo)
					// console.log('sub_children:', item.tipo, sub_children);
					direct_children.push(...sub_children)
				}
			}
		}

	// item_value. get the current item value
		const item_value	= value.find(el => el.section_tipo===section_tipo && el.tipo===tipo)
		const permissions	= item_value && item_value.value
			? parseInt(item_value.value)
			: 0

	// li HTMLElement
		const li = ui.create_dom_element({
			element_type	: 'li',
			class_name		: 'li_item'
		})

	// checkbox
		const input_checkbox = ui.create_dom_element({
			element_type	: 'input',
			type			: 'checkbox',
			class_name		: 'input_value',
			name			: tipo + '_' + section_tipo,
			parent			: li
		})
		input_checkbox.item = item
		// checked option set on match
		if (typeof item_value!=='undefined') {
			// console.log("item_value.value:", item_value.value, item.tipo);
			if (permissions>=2) {
				input_checkbox.checked = true
			}else if(permissions===1) {
				input_checkbox.indeterminate = true
			}else{
				// nothing to do
			}
		}
		// update value, subscription to the changes: if the dom input value was changed, observers dom elements will be changed own value with the observable value
			self.events_tokens.push(
				event_manager.subscribe(
					'update_value_' + self.id + '_' + tipo + '_' + section_tipo,
					fn_update_value)
			)
			function fn_update_value(changed_data) {
				// console.log("-------------- - event update_value changed_data:", changed_data);
				// change the value of the current dom element
				if (changed_data>=2) {
					input_checkbox.checked			= true
					input_checkbox.indeterminate	= false
				}else if(changed_data===1) {
					input_checkbox.checked			= false
					input_checkbox.indeterminate	= true
				}else if(changed_data===0) {
					input_checkbox.checked			= false
					input_checkbox.indeterminate	= false
				}
			}
		// change event
			input_checkbox.addEventListener('change', async function(e) {
				e.preventDefault()

				// input_value
					const input_value = input_checkbox.checked
							? 2
							: input_checkbox.indeterminate
								? 1
								: 0

				// parents. propagate value to parents
					const parents = await self.get_parents(input_checkbox.item)
					const parents_length = parents.length

					if (input_value>=2) {

						for (let i = 0; i < parents_length; i++) {

							const current_parent = parents[i]

							// update parent item data
								self.update_value(current_parent, 2)
						}

					}else{

						parents_loop : for (let i = 0; i < parents_length; i++) {

							const current_parent = parents[i]

							// children
							const current_children			= datalist.filter(el => el.parent===current_parent.tipo)
							const current_children_length	= current_children.length
							for (let j = 0; j < current_children_length; j++) {

								const child = current_children[j]

								// exclude self
									if (child.tipo===input_checkbox.item.tipo) {
										continue;
									}

								const found = self.filled_value.find(el => el.tipo===child.tipo)
								if (found && found.value>=2) {
									break parents_loop;
								}
							}

							// update parent item data
								self.update_value(current_parent, input_value)
						}
					}

				// update self item data
					self.update_value(item, input_value)

				// show_save_button_
					event_manager.publish( 'show_save_button_' + self.id )
			})//end input_checkbox.addEventListener("change", async function(e) {

	// label
		const label = ui.create_dom_element({
			element_type	: 'label',
			class_name		: 'area_label' + (direct_children ? ' icon_arrow' : ''),
			inner_html		: item.label,
			parent			: li
		})
		// info_text
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'info_text',
			inner_html		: `[${item.tipo} ${item.model} ${permissions}]`,
			parent			: label
		})

	// with children case
		const direct_children_length = direct_children.length
		if (direct_children_length>0) {
			// branch (ul container for children)
				const branch = ui.create_dom_element({
					element_type	: 'ul',
					class_name		: 'ul_item branch hide'
				})
				li.branch = branch

			// track collapse toggle state of content
				const collapse = function() {
					label.classList.remove('up')
						// clean container
						// while (branch.firstChild) {
						// 	branch.removeChild(branch.firstChild);
						// }
				}
				const expose = function() {
					label.classList.add('up')
					if (!branch.hasChildNodes()) {
						// direct_children render (return hierarchized children nodes)
						const tree_node = render_tree_items(
							direct_children,
							datalist,
							value,
							self
						) // return li node
						branch.appendChild(tree_node)
					}
				}
				ui.collapse_toggle_track({
					toggler				: label,
					container			: branch,
					collapsed_id		: 'security_acccess_' + item.tipo,
					collapse_callback	: collapse,
					expose_callback		: expose,
					default_state		: 'closed'
				})

			// permissions_global container
				const permissions_global = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'permissions_global',
					parent			: li
				})
				// radio group global. Create when component render is finished
				// self.events_tokens.push(
					// event_manager.subscribe('rendered_tree_' + self.id, fn_global_radio)
				// )

				// children create radio_group for permissions_global
					self.get_children(item, datalist)
					.then(function(children){
						const radio_group = create_global_radio_group(
							self,
							item,
							permissions,
							datalist,
							branch, // HTMLElement components_container
							children // array of nodes
						)
						permissions_global.appendChild(radio_group)
					})

			// add branch at last position
			li.appendChild(branch)
		}//end direct_children


	return li
}//end render_area_item



/**
* RENDER_PERMISSIONS_ITEM
* Create tree item node to check permissions (components, section_groups, buttons, etc.)
* @param object item
* 	datalist current item
* @param array datalist
* 	full list of section elements from ontology
* @param array value
* 	full list of elements in self.data (DB) at key zero (this component has only one value but format is array)
* @param object self
* 	self component instance
* @return HTMLElement li
*/
const render_permissions_item = function(item, datalist, value, self) {

	// short vars
		const section_tipo			= item.section_tipo
		const tipo					= item.tipo
		// const direct_children	= datalist.find(el => el.section_tipo===section_tipo && el.parent===tipo)
		const direct_children		= datalist.find(el => el.parent===tipo)

	// item_value (permissions). get the item value
		const item_value	= value.find(el => el.section_tipo===section_tipo && el.tipo===item.tipo)
		const permissions	= item_value && item_value.value
			? parseInt(item_value.value)
			: 0

	// li DOM node
		const li = ui.create_dom_element({
			element_type	: 'li',
			class_name		: 'li_item permissions'
		})

	// radio_buttons_container
		const radio_buttons_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'radio_buttons_container',
			parent			: li
		})
		const radio_group = create_permissions_radio_group(self, item, permissions, datalist)
		radio_buttons_container.appendChild(radio_group)

	// label
		const label = ui.create_dom_element({
			element_type	: 'label',
			class_name		: 'area_label',
			inner_html		: item.label,
			parent			: li
		})
		// info_text
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'info_text',
			inner_html		: `[${item.tipo} ${item.model} ${permissions}]`,
			parent			: label
		})

	// with children case
		if (direct_children) {
			// branch (ul container for children)
				const branch = ui.create_dom_element({
					element_type	: 'ul',
					class_name		: 'ul_item branch',
					parent			: li
				})
				li.branch = branch
		}//end direct_children

	// add li branch link to hierarchize
		// li.parent		= item.parent
		// li.tipo			= item.tipo
		// li.section_tipo	= item.section_tipo

	return li
}//end render_permissions_item



/**
* CREATE_PERMISSIONS_RADIO_GROUP
* Creates a triple radio group options (x,r,rw)
* @param object self
* @param object $item
* @param int permissions
* @return DocumentFragment
*/
const create_permissions_radio_group = function(self, item, permissions) {

	// DocumentFragment
		const fragment = new DocumentFragment()

	// create_radio function
		const create_radio = (radio_value, title) => {

			// radio_input
				const radio_input = ui.create_dom_element({
					element_type	: 'input',
					type			: 'radio',
					class_name		: 'radio_value val_'+radio_value,
					value			: radio_value,
					name			: item.section_tipo +'_'+ item.tipo
				})
				// radio_input.item = item

			// checked value match
				if(permissions===radio_value) {
					radio_input.checked = true
				}

			// update value subscription
			// If the DOM input value was changed, observers DOM elements will change self value with the observable value
				self.events_tokens.push(
					event_manager.subscribe(
						'update_value_' + self.id + '_' + item.tipo + '_' + item.section_tipo,
						fn_update_value
					)
				)
				function fn_update_value(changed_data) {
					// console.log("-------------- - event update_value changed_data:", changed_data);
					// change the value of the current DOM element
					if (changed_data===radio_value) {
						radio_input.checked = true
					}
				}

			// change event
				radio_input.addEventListener('change', async function() {

					const input_value = parseInt(radio_input.value)
					// get the all parents of the item

					// set the data of the parents and change the DOM node with update_value event
						const children			= await self.get_children(item)
						const children_length	= children.length
						for (let i = children_length - 1; i >= 0; i--) {
							const current_child = children[i]
							self.update_value(current_child, input_value)
						}

					// update self item data
						self.update_value(item, input_value)

					// parents_radio_butons. update the state of all parents, checking his children state
						self.update_parents_radio_butons(item, input_value)

					// show_save_button
						event_manager.publish('show_save_button_'+self.id)
						// await self.save_changes()
				})//end radio_input.addEventListener("change", async function(e)


			// radio_input_label
				const radio_input_label = ui.create_dom_element({
					element_type	: 'label',
					class_name		: 'radio_label',
					inner_html		: title
				})
				radio_input_label.prepend(radio_input)

			return radio_input_label
		}//end create_radio

	// render 3 radio button nodes
		fragment.appendChild( create_radio(0, 'x') )
		fragment.appendChild( create_radio(1, 'r') )
		fragment.appendChild( create_radio(2, 'rw') )


	return fragment
}//end create_permissions_radio_group



/**
* CREATE_GLOBAL_RADIO_GROUP
* Creates a triple radio group options (x,r,rw) tha appears in areas / sections
* @return DocumentFragment
*/
const create_global_radio_group = function(self, item, permissions, datalist, components_container, children) {

	const fragment = new DocumentFragment()

	// child_value
		// const children		= self.get_children(item) // already given
		const children_length	= children.length
		let child_value			= null
		let last_value			= null
		for (let i = children_length - 1; i >= 0; i--) {

			const child = children[i]

			if(child.tipo === child.section_tipo) continue; // exclude areas

			const data_found = self.filled_value.find(el => el.tipo===child.tipo && el.section_tipo===child.section_tipo)
			if(data_found){
				if (last_value && data_found.value!==last_value) {
					child_value = null
					break;
				}
				last_value	= data_found.value
				child_value	= data_found.value
			}else{
				child_value = null
				break;
			}
		}

	const create_radio = (radio_value, title) => {

		// radio_input
			const radio_input = ui.create_dom_element({
				element_type	: 'input',
				type			: 'radio',
				class_name		: 'radio_value global val_' + radio_value,
				value			: radio_value,
				name			: item.section_tipo + '_' + item.tipo
			})

		// checked status set
			if (child_value && radio_value===child_value) {
				radio_input.checked = true
			}

		// update_area_radio event. Update value, subscription to the changes: if the DOM input value was changed, observers DOM elements will be changed own value with the observable value
			self.events_tokens.push(
				event_manager.subscribe(
					'update_area_radio_' + self.id + '_' + item.tipo + '_' + item.section_tipo,
					fn_update_value
				)
			)
			function fn_update_value(changed_data) {
				// console.log("-------------- - event update_value changed_data:", changed_data, radio_value);
				// change the value of the current DOM element
				if (changed_data===radio_value && !radio_input.checked) {
					radio_input.checked = true
				}
				else if(radio_input.checked && changed_data===null){
					radio_input.checked = false
				}
			}

		// change event
			radio_input.addEventListener('change', async function() {

				const input_value = parseInt(radio_input.value)

				// radio_button_children
					// const radio_button_children = (item.tipo===item.section_tipo)
					// 	? datalist.filter(el => el.parent === item.tipo) // section / area case
					// 	: datalist.filter(el => el.parent === item.tipo && el.section_tipo === item.section_tipo) // components case
					// console.log('item:', item);
					// console.log('datalist parents:', datalist.map(el => el.parent));
					// const a = datalist.map(el => el.parent).filter(el => el==='rsc176')
					// console.log('a parent rsc176:', a);
					// console.log('++ rsc5:', self.data.datalist.filter(el => el.tipo==='rsc5') );
					// console.log('radio_button_children:', item.tipo, radio_button_children);
					// console.log('children:', children);
					// return

				// for (let j = children_length - j; j >= 0; j--) {
				for (let j = 0; j < children_length; j++) {

					const child = children[j]
					if(child.tipo===child.section_tipo){
						// areas case
						event_manager.publish(
							'update_area_radio_' + self.id + '_' + child.tipo + '_' + child.section_tipo,
							input_value
						)
					}else{
						// components case
						self.update_value(child, input_value)
					}
				}

				// update_parents_radio_butons
					self.update_parents_radio_butons(item, input_value)

				// show_save_button
					event_manager.publish('show_save_button_'+self.id)
					// await self.save_changes()
			})//end radio_input.addEventListener("change", async function(e)

		// radio_input_label
			const radio_input_label = ui.create_dom_element({
				element_type	: 'label',
				class_name		: 'radio_label',
				inner_html		: title
			})
			radio_input_label.prepend(radio_input)

		return radio_input_label
	}

	// render 3 radio button nodes
		fragment.appendChild( create_radio(0, 'x') )
		fragment.appendChild( create_radio(1, 'r') )
		fragment.appendChild( create_radio(2, 'rw') )


	return fragment
}//end create_global_radio_group



/**
* GET_BUTTONS
* @param object instance
* @return HTMLElement buttons_container
*/
const get_buttons = (self) => {

	const is_inside_tool= self.is_inside_tool

	const fragment = new DocumentFragment()

	// buttons tools
		if( self.show_interface.tools === true){
			if (!is_inside_tool) {
				ui.add_tools(self, fragment)
			}
		}

	// buttons container
		const buttons_container = ui.component.build_buttons_container(self)

	// buttons_fold (allow sticky position on large components)
		const buttons_fold = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'buttons_fold',
			parent			: buttons_container
		})
		buttons_fold.appendChild(fragment)


	return buttons_container
}//end get_buttons




/**
* RENDER_TREE_ITEMS_READ
* Render given tree items hierarchically
* @param array items
* @param array datalist
* @param array value
*
* @return DocumentFragment
* 	Containing li nodes
*/
const render_tree_items_read = function(items, datalist, value) {

	// tree_object . Object with all li nodes rendered sequentially
		const tree_object = {}

	// render nodes. Every area/section node
		const items_length = items.length
		for (let i = 0; i < items_length; i++) {

			const current_item = items[i]

			// render_tree_item_read (with pointer to their item)
				const tree_node	= render_tree_item_read(
					current_item,
					datalist,
					value
				)// li node

			// store in the tree_object
				const key = current_item.tipo
				tree_object[key] = tree_node
		}

	// hierarchize nodes
		const fragment = new DocumentFragment()
		for(const key in tree_object) {

			const tree_node	= tree_object[key]
			const item		= tree_node.item

			const parent_key = item.parent

			if(tree_object[parent_key]) {
				// move node to parent branch
				tree_object[parent_key].branch.appendChild(tree_node)
				// console.log("Added to parent branch:", key, parent_key);
			}else{
				// add to root level
				fragment.appendChild(tree_node)
			}
		}


	return fragment
}//end render_tree_items_read



/**
* RENDER_TREE_ITEM_READ
* Recursive function to render tree items
* @param object item
* @param array datalist
* @param array value
*
* @return HTMLElement tree_item_node
*/
const render_tree_item_read = function(item, datalist, value) {

	// single item case.
		const fn_render = (item.tipo===item.section_tipo)
			? render_area_item_read
			: render_permissions_item_read

	// create node and add to tree_object
		const tree_item_node = fn_render(
			item,
			datalist,
			value
		)
		// attach item object as pointer
		tree_item_node.item = item


	return tree_item_node
}//end render_tree_item_read



/**
* RENDER_AREA_ITEM_READ
* Create default tree item node (section, area)
* @param object item
* 	datalist current item
* @param array datalist
* 	full list of section elements from ontology
* @param array value
* 	full list of elements in self.data (DB) at key zero (this component has only one value but format is array)
* @return HTMLElement li
*/
const render_area_item_read = function(item, datalist, value) {

	// direct_children check and set
		const tipo					= item.tipo
		const section_tipo			= item.section_tipo
		const direct_children		= item.model==='section'
			? datalist.filter(el => el.section_tipo===tipo && el.tipo!==tipo)
			: datalist.filter(el => el.parent===tipo)
		// add children subsections (dataframe cases)
		if (item.model==='section') {
			const direct_children_length = direct_children.length
			for (let i = 0; i < direct_children_length; i++) {
				const item = direct_children[i]
				if (item.model==='section') {
					const sub_children = datalist.filter(el => el.parent===item.tipo)
					// console.log('sub_children:', item.tipo, sub_children);
					direct_children.push(...sub_children)
				}
			}
		}

	// item_value. get the current item value
		const item_value	= value.find(el => el.section_tipo===section_tipo && el.tipo===tipo)
		const permissions	= item_value && item_value.value
			? parseInt(item_value.value)
			: 0

		const permissions_label = (permissions>=2)
			? 'rw-'
			: (permissions===1)
				? 'r--'
				: '---'

	// li DOM node
		const li = ui.create_dom_element({
			element_type	: 'li',
			class_name		: 'li_item',
		})

	// label
		const label = ui.create_dom_element({
			element_type	: 'label',
			class_name		: 'area_label' + (direct_children ? ' icon_arrow' : ''),
			inner_html		: permissions_label + ' ' + item.label,
			parent			: li
		})

	// with children case
		const direct_children_length = direct_children.length
		if (direct_children_length>0) {
			// branch (ul container for children)
				const branch = ui.create_dom_element({
					element_type	: 'ul',
					class_name		: 'ul_item branch hide'
				})
				li.branch = branch

			// track collapse toggle state of content
				const collapse = function() {
					label.classList.remove('up')
				}
				const expose = function() {
					label.classList.add('up')
					if (!branch.hasChildNodes()) {
						// direct_children render (return hierarchized children nodes)
						const tree_node = render_tree_items_read(
							direct_children,
							datalist,
							value
						) // return li node
						branch.appendChild(tree_node)
					}
				}
				ui.collapse_toggle_track({
					toggler				: label,
					container			: branch,
					collapsed_id		: 'security_acccess_' + item.tipo,
					collapse_callback	: collapse,
					expose_callback		: expose,
					default_state		: 'closed'
				})

			// add branch at last position
			li.appendChild(branch)
		}//end direct_children

	return li
}//end render_area_item_read



/**
* render_permissions_item_read
* Create tree item node to check permissions (components, section_groups, buttons, etc.)
* @param object item
* 	datalist current item
* @param array datalist
* 	full list of section elements from ontology
* @param array value
* 	full list of elements in self.data (DB) at key zero (this component has only one value but format is array)
* @return HTMLElement li
*/
const render_permissions_item_read = function(item, datalist, value) {

	// short vars
		const section_tipo			= item.section_tipo
		const tipo					= item.tipo
		const direct_children		= datalist.find(el => el.parent===tipo)

	// item_value (permissions). get the item value
		const item_value	= value.find(el => el.section_tipo===section_tipo && el.tipo===item.tipo)
		const permissions	= item_value && item_value.value
			? parseInt(item_value.value)
			: 0

	// li DOM node
		const li = ui.create_dom_element({
			element_type	: 'li',
			class_name		: 'li_item permissions'
		})

		const permissions_label = (permissions>=2)
			? 'rw-'
			: (permissions===1)
				? 'r--'
				: '---'

	// label
		const label = ui.create_dom_element({
			element_type	: 'label',
			class_name		: 'area_label',
			inner_html		: permissions_label + ' ' + item.label,
			parent			: li
		})

	// with children case
		if (direct_children) {
			// branch (ul container for children)
				const branch = ui.create_dom_element({
					element_type	: 'ul',
					class_name		: 'ul_item branch',
					parent			: li
				})
				li.branch = branch
		}//end direct_children

	return li
}//end render_permissions_item_read



// @license-end
