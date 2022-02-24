/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'
	// import {data_manager} from '../../common/js/data_manager.js'



/**
* RENDER_EDIT_COMPONENT_SECURITY_ACCESS
* Manages the component's logic and apperance in client side
*/
export const render_edit_component_security_access = function() {

	return true
};//end render_edit_component_security_access



let propagating = false
const datalist_object = {}



/**
* EDIT
* Render node for use in modes: edit, edit_in_list
* @return DOM node wrapper
*/
render_edit_component_security_access.prototype.edit = async function(options) {

	const self = this

	// options
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = await get_content_data_edit(self)
		if (render_level==='content') {
			return content_data
		}

	// buttons
		const buttons = get_buttons(self)

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_edit(self, {
			content_data : content_data,
			buttons 	 : buttons
		})

	// add events
		// add_events(self, wrapper)


	return wrapper
};//end edit



/**
* ADD_EVENTS
*/
	// const add_events = function(self, wrapper) {

	// 	// update value, subscription to the changes: if the dom input value was changed, observers dom elements will be changed own value with the observable value
	// 		// self.events_tokens.push(
	// 		// 	event_manager.subscribe('update_value_'+self.id, fn_update_value)
	// 		// )
	// 		// function fn_update_value(changed_data) {
	// 		// 	//console.log("-------------- - event fn_update_value changed_data:", changed_data);

	// 		// 	// change the value of the current dom element
	// 		// 	const changed_node = wrapper.querySelector('input[data-key="'+changed_data.key+'"]')
	// 		// 	changed_node.value = changed_data.value
	// 		// }

	// 	// change event, for every change the value in the inputs of the component
	// 		// wrapper.addEventListener('change', (e) => {
	// 		// 	// e.stopPropagation()
	// 		// 	console.log("wrapper change e:",e);
	// 		// 	// update / remove
	// 		// 		if (e.target.matches('input[type="radio"]')) {

	// 		// 			console.log("self.data.value:", e.target.value);

	// 		// 			// const action 		= (e.target.checked===true) ? 'insert' : 'remove'
	// 		// 			// const parsed_value 	= JSON.parse(e.target.value)
	// 		// 			// const changed_key 	= self.get_changed_key(action, parsed_value)
	// 		// 			// const changed_value = (action==='insert') ? parsed_value : null

	// 		// 			// const changed_data = Object.freeze({
	// 		// 			// 	action  : action,
	// 		// 			// 	key 	: changed_key,
	// 		// 			// 	value 	: changed_value,
	// 		// 			// })
	// 		// 			// self.change_value({
	// 		// 			// 	changed_data : changed_data,
	// 		// 			// 	//label 		 : e.target.nextElementSibling.textContent,
	// 		// 			// 	refresh 	 : false
	// 		// 			// })
	// 		// 			// .then((api_response)=>{
	// 		// 			// 	self.selected_key = e.target.dataset.key
	// 		// 			// 	// event to update the dom elements of the instance
	// 		// 			// 	event_manager.publish('update_value_'+self.id, self)
	// 		// 			// })

	// 		// 			return true
	// 		// 		}
	// 		// })

	// 	// click event [mousedown]
	// 		// wrapper.addEventListener("mousedown", e => {
	// 		// 	e.stopPropagation()
	// 		// 	// change_mode
	// 		// 		if (e.target.matches('.button.close')) {

	// 		// 			//change mode
	// 		// 			self.change_mode('list', false)

	// 		// 			return true
	// 		// 		}
	// 		// })


	// 	return true
	// };//end add_events



/**
* GET_CONTENT_DATA_EDIT
* @return DOM node content_data
*/
const get_content_data_edit = async function(self) {

	// array of objects with all elements from Ontology
	const datalist	= self.data.datalist
	// array of arrays from DB
	const value		= self.data.value && self.data.value[0]
		? self.data.value[0]
		: []

	// datalist object. Created to optimize large array nodes selection
		const datalist_length = datalist.length
		for (let i = 0; i < datalist_length; i++) {
			const key = datalist[i].section_tipo + '_' + datalist[i].tipo // parent[0] is the section tipo
			datalist_object[key] = datalist[i]
		}

	// debug
		if(SHOW_DEBUG===true) {
			console.log("component_security_access value:", value);
			// console.log("datalist:",datalist);
			// console.log("datalist_object:",datalist_object);
		}

	// content_data
		const content_data = ui.component.build_content_data(self)
			  content_data.classList.add("nowrap")

	// spinner
		const spinner = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'spinner',
			parent			: content_data
		})

	// loading_info
		const loading_info = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'loading_info',
			text_content	: `Rendering ${datalist_length} Ontology elements`,
			parent			: content_data
		})

	// inputs container
		const inputs_container = ui.create_dom_element({
			element_type	: 'ul',
			class_name		: 'inputs_container invisible',
			parent			: content_data
		})

	// tree. use small timeout to unsync general render with tree render
		setTimeout(async function(){
			build_tree({
				datalist	: datalist, // array with all ontology sections and areas
				value		: value, // current component db stored data value
				fn_render	: render_tree_item, // function to manage the node render (areas and sections)
				caller		: self,
				target		: inputs_container // container node where will be placed
			})
			.then(async function(tree_node){
				event_manager.publish('rendered_tree_'+self.id, tree_node)
				await inputs_container.appendChild(tree_node)
				setTimeout(async function(){
					inputs_container.classList.remove('invisible')
					spinner.remove()
					loading_info.remove()
					// console.log("tree_node childElementCount:", inputs_container.getElementsByTagName('*').length);
				}, 300)
			})
		}, 50)



	return content_data
};//end get_content_data_edit



/**
* BUILD_TREE
* @return DocumentFragment
*/
const build_tree = async function(options) {

	// options
		const datalist	= options.datalist // array with all ontology sections and areas
		const value		= options.value // current component db stored data value
		const fn_render	= options.fn_render // function to manage the node render (areas and sections)
		const caller	= options.caller
		const target	= options.target // container node where will be placed

	// tree_object . Object with all li nodes rendered sequentially
		// const t1 = performance.now()
		const tree_object = {}
		const datalist_length = datalist.length
		for (let i = 0; i < datalist_length; i++) {
			// create node and add to tree_object
			const key			= datalist[i].section_tipo + '_' + datalist[i].tipo
			const tree_node		= fn_render(datalist[i], datalist, value, caller, target) // li node
			// attach item object
			tree_node.item		= datalist[i]
			// store in the object
			tree_object[key]	= tree_node
		}
		// console.log("__***Time performance.now()-t1 render tree dom nodes :", performance.now()-t1, ' - n nodes :', datalist_length);

	// hierarchize terms
		// const t2 = performance.now()
		const fragment = new DocumentFragment()
		for(const key in tree_object) {

			const tree_node	= tree_object[key]

			// const parent	= tree_node.parent
			const parent_key = tree_node.item.type==='area'
				? tree_node.item.parent 	  + '_' + tree_node.item.parent
				: tree_node.item.section_tipo + '_' + tree_node.item.parent

			if(tree_object[parent_key]) {
				// add to parent branch
				tree_object[parent_key].branch.appendChild(tree_node)
				// console.log("Added to parent branch:", key, parent_key);
			}else{
				// add to root level
				fragment.appendChild(tree_node)
			}
		}
		// console.log("__***Time performance.now()-t2 hierarchize dom nodes:", performance.now()-t2);


	return fragment
}//end build_tree



/**
* RENDER_TREE_ITEM
* @param object item
* @param array datalist
* @param array value
* @param instance self
* @param DOM node target
*
* @return DOM node tree_item_node
*/
const render_tree_item = function(item, datalist, value, self, target) {

	const tree_item_node = (item.model==='section' || item.model.indexOf('area')===0)
		? render_area_item(item, datalist, value, self, target)
		: render_permissions_item(item, datalist, value, self, target)

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
* @return DOM node li
*/
const render_area_item = function(item, datalist, value, self, target) {

	// children check
		const tipo					= item.tipo
		const section_tipo			= item.section_tipo
		// const direct_children	= datalist.find(el => el.parent===item.tipo)
		const direct_children		= datalist.find(el => el.parent===tipo)

	// item_value. get the current item value
		const item_value	= value.find(el => el.section_tipo===section_tipo && el.tipo===tipo)
		const permissions	= item_value && item_value.value
			? parseInt(item_value.value)
			: 0

	// li
		const li = ui.create_dom_element({
			element_type	: 'li'
		})

	// checkbox
		const input_checkbox = ui.create_dom_element({
			element_type	: 'input',
			type			: 'checkbox',
			class_name		: 'input_value',
			name			: tipo + '_' + section_tipo,
			parent			: li
		})
		// checked option set on match
			if (typeof item_value!=='undefined') {
				// console.log("item_value.value:", item_value.value, item.tipo);
				if (permissions===2) {
					input_checkbox.checked = true
				}else if(permissions===1) {
					input_checkbox.indeterminate = true
				}else{

				}
			}
		// change event
			input_checkbox.addEventListener("change", async function(e) {
				e.preventDefault()

				// propagate checked value upwards recursively
					await propagate_parents_node(input_checkbox, function(input){
						// executed on each change
						const input_value = input.checked
							? 2
							: input.indeterminate
								? 1
								: 0

						// update data
							const current_item = datalist_object[input.name]
							self.update_value(current_item, input_value)
					})

				// propagate downwards recursively
					await propagate_downwards(input_checkbox, function(input){

						// executed on each change
						const input_value = input.checked
							? 2
							: input.indeterminate
								? 1
								: 0

						// update data
							const current_item = datalist_object[input.name]
							self.update_value(current_item, input_value)
					})


				// update self item data
					const input_value = input_checkbox.checked
						? 2
						: input_checkbox.indeterminate
							? 1
							: 0
					await self.update_value(item, input_value)

				// save
					// self.save_changes()
					event_manager.publish('show_save_button_'+self.id)

			})//end input_checkbox.addEventListener("change", async function(e) {

	// label
		const label = ui.create_dom_element({
			element_type	: 'label',
			class_name		: 'area_label' + (direct_children ? ' icon_arrow' : ''),
			inner_html		: item.label,
			parent			: li
		})
		// info
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
					class_name		: 'branch hide',
					// parent		: li
				})
				li.branch = branch

			// track collapse toggle state of content
				const collapse = function() {
					label.classList.remove('up')
				}
				const expose = function() {
					label.classList.add('up')
				}
				ui.collapse_toggle_track({
					header				: label,
					content_data		: branch,
					collapsed_id		: 'security_acccess_'+item.tipo,
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
				self.events_tokens.push(
					event_manager.subscribe('rendered_tree_' + self.id, fn_global_radio)
				)
				function fn_global_radio() {
					const components_container	= branch
					const radio_group			= create_global_radio_group(self, item, permissions, datalist, components_container)
					permissions_global.appendChild(radio_group)
				}

			// add brach at last position
			li.appendChild(branch)
		}//end direct_children

	// add li branch link to hierarchize
		// li.parent		= item.parent
		// li.tipo			= item.tipo
		// li.section_tipo	= item.section_tipo

	return li
};//end render_area_item



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
* @return DOM node li
*/
const render_permissions_item = function(item, datalist, value, self, target) {

	// children check
		// const direct_children = datalist.find(el => el.parent===item.tipo)
		const section_tipo		= item.section_tipo
		const tipo				= item.tipo
		const direct_children	= datalist.find(el => el.section_tipo===section_tipo && el.parent===tipo)

	// item_value. get the item value
		const item_value	= value.find(el => el.section_tipo===section_tipo && el.tipo===item.tipo)
		const permissions	= item_value && item_value.value
			? parseInt(item_value.value)
			: 0

	// li
		const li = ui.create_dom_element({
			element_type	: 'li',
			class_name		: 'permissions'
		})

	// radio-buttons
		const radio_buttons_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'radio_buttons_container',
			parent			: li
		})
		const radio_group = create_permissions_radio_group(self, item, permissions, datalist, target)
		radio_buttons_container.appendChild(radio_group)

	// label
		const label = ui.create_dom_element({
			element_type	: 'label',
			class_name		: 'area_label',
			inner_html		: item.label,
			parent			: li
		})
		// info
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
					class_name		: 'branch',
					parent			: li
				})
			li.branch = branch
		}//end direct_children

	// add li branch link to hierarchize
		// li.parent		= item.parent
		// li.tipo			= item.tipo
		// li.section_tipo	= item.section_tipo

	return li
};//end render_permissions_item



/**
* CREATE_PERMISSIONS_RADIO_GROUP
* Creates a triple radio group options (x,r,rw)
* @return DocumentFragment
*/
const create_permissions_radio_group = function(self, item, permissions) {

	const fragment = new DocumentFragment()

	const create_radio = (radio_value, title) => {
		// radio_input
		const radio_input = ui.create_dom_element({
			element_type	: 'input',
			type			: 'radio',
			class_name		: 'radio_value val_'+radio_value,
			value			: radio_value,
			name			: item.section_tipo +'_'+ item.tipo
		})
		// checked value match
		if(permissions===radio_value) {
			radio_input.checked = true
		}
		// console.log("permissions:",permissions, "radio_value",radio_value, "tipo", item.tipo);
		radio_input.addEventListener("change", async function(e) {
			e.stopPropagation()
			e.preventDefault()

			if (propagating===true) {
				console.log("stopped propagation... ", item);
				return
			}

			// propagate changes
				const container_node = radio_input.parentNode.parentNode.parentNode.querySelector(
					':scope > .branch'
				)
				propagate_radio_changes(radio_input, container_node, true, function(input) {
					// update data. executed on each change
					const input_value	= input.value
					const key			= input.name
					const current_item	= datalist_object[key]
					self.update_value(current_item, input_value)
				})

			// update data
				const input_value = radio_input.value
				self.update_value(item, input_value)

			// propagate upwards
				propagate_permissions_upwards(radio_input)

			// save changes with delay
				// self.save_changes()
				event_manager.publish('show_save_button_'+self.id)
		})//end radio_input.addEventListener("change", async function(e)

		// radio_input_label
		const radio_input_label = ui.create_dom_element({
			element_type	: 'label',
			class_name		: 'radio_label',
			text_content	: title
		})
		radio_input_label.prepend(radio_input)

		return radio_input_label
	}
	fragment.appendChild( create_radio(0, 'x') )
	fragment.appendChild( create_radio(1, 'r') )
	fragment.appendChild( create_radio(2, 'rw') )

	return fragment
}//end create_permissions_radio_group



/**
* CREATE_GLOBAL_RADIO_GROUP
* Creates a triple radio group options (x,r,rw)
* @return DocumentFragment
*/
const create_global_radio_group = function(self, item, permissions, datalist, components_container) {

	const fragment = new DocumentFragment()

	// children recursive
		const children_radio_input = components_container.querySelectorAll(
			'.radio_value'
		)

		// children state. Counts each child checked value to resolve is any is full checked
		const children_radio_input_length = children_radio_input.length
		if (children_radio_input_length===0) {
			return fragment
		}

		const radio_values = {
			'0'	: 0, // x
			'1'	: 0, // r
			'2'	: 0  // rw
		}

		for (let i = 0; i < children_radio_input_length; i++) {
			const input = children_radio_input[i]
			if (input.checked) {
				radio_values[input.value]++
			}
		}

	const create_radio = (radio_value, title) => {
		// radio_input
		const radio_input = ui.create_dom_element({
			element_type	: 'input',
			type			: 'radio',
			class_name		: 'radio_value global val_'+radio_value,
			value			: radio_value,
			name			: item.section_tipo +'_'+ item.tipo
		})
		// checked value match
		if(children_radio_input_length>0) {
			if(radio_values[radio_value]===(children_radio_input_length/3)) {
				radio_input.checked = true
			}
		}else{
			if (radio_value===0) {
				radio_input.checked = true
			}
		}
		radio_input.addEventListener("change", async function(e) {
			e.stopPropagation()
			e.preventDefault()

			if (propagating===true) {
				return
			}

			propagating = true
			self.node[0].classList.add('loading')

			// propagate changes
				const container_node = components_container
				await propagate_radio_changes(radio_input, container_node, true, function(input) {
					// update data. executed on each change
					const input_value	= input.value
					const key			= input.name
					const current_item	= datalist_object[key]
					self.update_value(current_item, input_value)
				})

			// save with delay
				// self.save_changes()
				event_manager.publish('show_save_button_'+self.id)

			propagating = false
			self.node[0].classList.remove('loading')
		})//end radio_input.addEventListener("change", async function(e)

		// radio_input_label
		const radio_input_label = ui.create_dom_element({
			element_type	: 'label',
			class_name		: 'radio_label',
			text_content	: title
		})
		radio_input_label.prepend(radio_input)

		return radio_input_label
	}
	fragment.appendChild( create_radio(0, 'x') )
	fragment.appendChild( create_radio(1, 'r') )
	fragment.appendChild( create_radio(2, 'rw') )

	return fragment
}//end create_global_radio_group



/**
* PROPAGATE_PARENTS_NODE
* Recursive parents input set value based on direct children checked values
* @return bool
*/
const propagate_parents_node = async (input_checkbox, callback) => {

	const parent_input_checkbox	= input_checkbox.parentNode.parentNode.parentNode.querySelector(
		':scope > .input_value'
	)
	if(parent_input_checkbox) {

		// set checked or indeterminate value based on direct children values
			ui.set_parent_checked_value(
				parent_input_checkbox,
				parent_input_checkbox.parentNode.querySelectorAll(
					':scope > .branch > li > .input_value'
				),
				callback // called on every changed node
			)

		// recursion
			propagate_parents_node(parent_input_checkbox, callback)
	}

	return true
};//end propagate_parents_node



/**
* PROPAGATE_DOWNWARDS
* Recursive parents input set value based on direct children checked values
* @return bool
*/
const propagate_downwards = async (input_checkbox, callback) => {

	const branch = get_next_sibling(input_checkbox, '.branch')
	if(branch) {

		const children_input_checkbox = branch.querySelectorAll(
			'.input_value'
		)

		const children_input_checkbox_length = children_input_checkbox.length
		for (let i = 0; i < children_input_checkbox_length; i++) {
			const el = children_input_checkbox[i]
			el.checked = input_checkbox.checked
			callback(el) // called on every changed node
		}
	}

	return true
};//end propagate_downwards



/**
* PROPAGATE_RADIO_CHANGES
* Recursive updates children radio values downwards
* @return bool
*/
const propagate_radio_changes = (radio_input, branch_node, recursive=true, callback) => {

	const t2 = performance.now()

	// branch_node
		// const branch_node = radio_input.parentNode.parentNode.parentNode.querySelector(
		// 	':scope > .branch'
		// )
		if (!branch_node) {
			return
		}

	// children_radio_input
		const style_selector = (recursive===true)
			? `.radio_value[value="${radio_input.value}"]`
			: `:scope > li > .radio_buttons_container > label > .radio_value[value="${radio_input.value}"]`
		const children_radio_input = branch_node.querySelectorAll(
			style_selector
		)
		// console.log("style_selector:",style_selector);
		// console.log("children_radio_input:", children_radio_input);

	console.log("__***Time performance.now()-t2 propagate_radio_changes selection:", children_radio_input.length, style_selector, performance.now()-t2);


	if(children_radio_input) {
		const t3 = performance.now()

		const children_radio_input_length = children_radio_input.length
		for (let i = 0; i < children_radio_input_length; i++) {

			const input = children_radio_input[i]
			if (input.checked!==radio_input.checked) {
				// update checked value
				input.checked = radio_input.checked
				// callback
				if (callback) {
					callback(input)
				}
			}
		}

		console.log("__***Time performance.now()-t3 propagate_radio_changes propagation:", children_radio_input_length, performance.now()-t3);
	}

	console.log("__***Time performance.now()-t2 propagate_radio_changes total:", style_selector, performance.now()-t2);



	return true
};//end propagate_radio_changes



/**
* GET_BUTTONS
* @param object instance
* @return DOM node buttons_container
*/
const get_buttons = (self) => {

	const is_inside_tool= self.is_inside_tool

	const fragment = new DocumentFragment()

	// buttons tools
		if (!is_inside_tool) {
			ui.add_tools(self, fragment)
		}

	// buttons container
		const buttons_container = ui.component.build_buttons_container(self)
			// buttons_container.appendChild(fragment)

	// buttons_fold (allow sticky position on large components)
		const buttons_fold = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'buttons_fold',
			parent			: buttons_container
		})
		buttons_fold.appendChild(fragment)

	// button_save
		const button_save = ui.create_dom_element({
			element_type : 'button',
			class_name	 : 'primary save button_save folding hide',
			text_content : "Save",
			parent 		 : buttons_fold
		})
		button_save.addEventListener("click", async function(e){
			e.stopPropagation()
			await self.save_changes()
			button_save.classList.add('hide')
			const warning_label_text = self.node[0].querySelector('.warning_label_text')
			if (warning_label_text) {
				warning_label_text.remove()
			}
		})
		self.events_tokens.push(
			event_manager.subscribe('show_save_button_'+self.id, function(){
				button_save.classList.remove('hide')
				const label = self.node[0].querySelector('.label')
				if (label && !label.querySelector('.warning_label_text')) {
					// warning_label_text
					ui.create_dom_element({
						element_type	: 'span',
						class_name		: 'warning_label_text blink',
						text_content	: get_label.sin_salvar || 'Unsaved changes!',
						parent			: label
					})
				}
			})
		)


	return buttons_container
};//end get_buttons



/**
* GET_CLOSEST
* Get the closest matching element up the DOM tree
*/
const get_closest = function(elem, parent_selector, child_selector) {

	const parent_found = elem.parentNode.closest(parent_selector);
	if (!parent_found || parent_found===elem) {
		return null
	}

	const target = parent_found.querySelector(child_selector)
		|| get_closest(parent_found, parent_selector, child_selector)


	return target;
};//end get_closest



/**
* GET_NEXT_SIBLING
*/
const get_next_sibling = function (elem, selector) {

	// Get the next sibling element
	let sibling = elem.nextElementSibling;

	// If the sibling matches our selector, use it
	// If not, jump to the next sibling and continue the loop
	while (sibling) {
		if (sibling.matches(selector)) return sibling;
		sibling = sibling.nextElementSibling
	}
};



/**
* PROPAGATE_PERMISSIONS_UPWARDS
* @return bool
*/
const propagate_permissions_upwards = function(radio_input) {

	// permissions_global
		const permissions_global = get_closest(radio_input, 'li', ':scope > .permissions_global')
		if (!permissions_global) {
			console.log("No permissions_global:", radio_input, permissions_global);
			return false
		}

	const branch = get_next_sibling(permissions_global, '.branch')

	// children recursive
	const children_radio_input = branch.querySelectorAll(
		'.radio_value'
	)
	// children state. Counts each child checked value to resolve is any is full checked
	const children_radio_input_length = children_radio_input.length
	if (children_radio_input_length===0) {
		return false
	}

	propagating = true

	// summarize all
		const radio_values = {
			'0'	: 0, // x
			'1'	: 0, // r
			'2'	: 0  // rw
		}
		for (let i = 0; i < children_radio_input_length; i++) {
			const input = children_radio_input[i]
			if (input.checked) {
				radio_values[input.value]++
			}
		}

	// checked value match
		let item_checked = null
		const ar_radio_input = permissions_global.querySelectorAll('input.radio_value')
		for (let i = 0; i < ar_radio_input.length; i++) {

			const global_radio_input	= ar_radio_input[i]
			const full_ratio			= children_radio_input_length/3
			const current_value			= global_radio_input.value

			// default is unchecked
			global_radio_input.checked = false

			// match checked if is full_ratio
			for (const [key, value] of Object.entries(radio_values)) {
				// console.log(`${key}: ${value}`);
				if(value===full_ratio && current_value==key) {
					global_radio_input.checked = true
					item_checked = global_radio_input
				}
			}
		}

		if(item_checked) {
			// propagate_permissions_upwards(item_checked)
			// console.log("item_checked:",item_checked);
		}

	propagating = false

	return true
}//end propagate_permissions_upwards




/**
* RENDER_CHILDREN_BRANCH
* @return DOM node
*/
	// const render_children_branch = (item, label) => {

	// 	// branch (ul container for children)
	// 		const branch = ui.create_dom_element({
	// 			element_type	: 'ul',
	// 			class_name		: 'branch hide'
	// 		})

	// 	// track collapse toggle state of content
	// 		ui.collapse_toggle_track({
	// 			header				: label,
	// 			content_data		: branch,
	// 			collapsed_id		: 'security_acccess_'+item.tipo,
	// 			collapse_callback	: collapse,
	// 			expose_callback		: expose,
	// 			default_state		: 'closed'
	// 		})
	// 		function collapse() {
	// 			label.classList.remove('up')
	// 		}
	// 		function expose() {
	// 			label.classList.add('up')
	// 		}

	// 	return branch
	// };//end render_children_branch
