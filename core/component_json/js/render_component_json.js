/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* Render_component
* Manage the components logic and appearance in client side
*/
export const render_component_json = function(options) {

	return true
}//end render_component_json



/**
* LIST
* Render node for use in list
* @return DOM node
*/
render_component_json.prototype.list = function() {

	const self = this

	// Options vars
		const data = self.data

	// wrapper
		const wrapper = ui.component.build_wrapper_list(self, {
			autoload : false
		})

	// Set value
		if(self.section_tipo==='dd542'){
			// activity section case
			const value_len = data.value.length
			const node = []
			for (let i = 0; i < value_len; i++) {
				const value_map = new Map(Object.entries(data.value[i]))
				for (let [key, value] of value_map) {
					node.push(key+ ": " +value)
				}
			}
			wrapper.innerHTML = node.join('<br>')
			wrapper.addEventListener('click', async (e) => {
				e.stopPropagation()
				wrapper.classList.toggle('show_full')
			})
		}else{
			// Value as string
			const list_show_key = self.context.properties.list_show_key || 'msg'
			const value_string = (typeof data.value[0][list_show_key]!=='undefined')
					? data.value[0][list_show_key]
					: JSON.stringify(data.value).substring(0,100)+" ..."
			wrapper.textContent = value_string
		}


	return wrapper
}//end list



/**
* EDIT
* Render node for use in edit
* @return DOM node
*/
render_component_json.prototype.edit = async function(options={render_level:'full'}) {

	const self = this

	// fix non value scenarios
		self.data.value = (!self.data.value || self.data.value.length<1) ? [null] : self.data.value

	// render_level
		const render_level = options.render_level

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

	// fix
		self.wrapper = wrapper

	// add events
		//add_events(self, wrapper)


	return wrapper
}//end edit



/**
* ADD_EVENTS
*/
const add_events = function(self, wrapper) {

	// update value, subscription to the changes: if the dom input value was changed, observers dom elements will be changed own value with the observable value
		self.events_tokens.push(
			event_manager.subscribe('update_value_'+self.id, update_value)
		)
		function update_value (changed_data) {
			//console.log("-------------- - event update_value changed_data:", changed_data);
			// change the value of the current dom element
			const changed_node = wrapper.querySelector('input[data-key="'+changed_data.key+'"]')
			changed_node.value = changed_data.value
		}

	// change event, for every change the value in the imputs of the component
		wrapper.addEventListener('change', async (e) => {
			//e.stopPropagation()
			alert("Changed ! [under construction]");

			/*
			// update
			if (e.target.matches('input[type="text"].input_value')) {
				//console.log("++update e.target:",JSON.parse(JSON.stringify(e.target.dataset.key)));
				//console.log("++update e.target value:",JSON.parse(JSON.stringify(e.target.value)));

				// // is_unique check
				// if (self.context.properties.unique) {
				// 	// const result = await check_duplicates(self, e.target.value, false)
				// 	if (self.duplicates) {
				// 		e.target.classList.add("duplicated")

				// 		const message = ui.build_message("Warning. Duplicated value " + self.duplicates.section_id)
				// 		wrapper.appedChild(message)

				// 		return false
				// 	}
				// }

				const changed_data = Object.freeze({
					action	: 'update',
					key		: JSON.parse(e.target.dataset.key),
					value	: (e.target.value.length>0) ? e.target.value : null,
				})
				self.change_value({
					changed_data : changed_data,
					refresh 	 : false
				})
				.then((save_response)=>{
					// event to update the dom elements of the instance
					event_manager.publish('update_value_'+self.id, changed_data)
				})

				return true
			}
			*/

		}, false)



	return true
}//end add_events



/**
* GET_CONTENT_DATA_EDIT
* @return DOM node content_data
*/
const get_content_data_edit = async function(self) {

	const value 		= self.data.value
	const mode 			= self.mode
	const is_inside_tool= self.is_inside_tool

	const fragment = new DocumentFragment()

	// inputs container
		const inputs_container = ui.create_dom_element({
			element_type	: 'ul',
			class_name 		: 'inputs_container',
			parent 			: fragment
		})

	// values (inputs)
		const inputs_value = value
		const value_length = inputs_value.length
		if (value_length>1) {
			console.warn("More than one value in component_json is not allowed at now. Ignored next values. N values: ",value_length);
		}
		for (let i = 0; i < value_length; i++) {
			get_input_element(i, inputs_value[i], inputs_container, self)
			break; // only one is used for the time being
		}

	// content_data
		const content_data = ui.component.build_content_data(self)
			  content_data.classList.add("nowrap")
			  content_data.appendChild(fragment)


	return content_data
}//end get_content_data_edit



/**
* GET_BUTTONS
* @param object instance
* @return DOM node buttons_container
*/
const get_buttons = (self) => {

	const is_inside_tool= self.is_inside_tool
	const mode 			= self.mode

	const fragment = new DocumentFragment()

	// button close
		if(mode==='edit_in_list' && !is_inside_tool){
			const button_close = ui.create_dom_element({
				element_type	: 'span',
				class_name 		: 'button close',
				parent 			: fragment
			})
		}

	// buttons tools
		if (!is_inside_tool) {
			ui.add_tools(self, fragment)
		}

	// buttons container
		const buttons_container = ui.component.build_buttons_container(self)
		buttons_container.appendChild(fragment)


	return buttons_container
}//end get_buttons



/**
* GET_INPUT_ELEMENT
* @return dom element li
*/
const get_input_element = async (i, current_value, inputs_container, self) => {

	const mode = self.mode

	let validated = false

	// li
		const li = ui.create_dom_element({
			element_type : 'li',
			parent 		 : inputs_container
		})


	// button_fullscreen
		const button_fullscreen = ui.create_dom_element({
			element_type : 'div',
			class_name	 : 'button_fullscreen',
			parent 		 : li
		})
		button_fullscreen.addEventListener("click", function(e) {
			// li.classList.toggle("fullscreen")
			self.wrapper.classList.toggle("fullscreen")
		})

	// button_save
		const button_save = ui.create_dom_element({
			element_type : 'button',
			class_name	 : 'button_save',
			text_content : "Save",
			parent 		 : li
		})
		button_save.addEventListener("click", function(e) {
			e.stopPropagation()
			// this.blur()

			try {
				const current_value = editor.get()
			}catch(error){
				console.error("error:",error);

				// styles as error
					self.node.map(item => {
						item.classList.add("error")
					})

				// alert("Error: component_json. Trying so save invalid json value!");
				return false
			}

			// if (validated!==true) {
			// 	alert("Error: component_json. Trying so save non validated json value!");
			// 	return false
			// }

			const changed_data = Object.freeze({
				action	: 'update',
				key		: 0,
				value	: current_value
			})
			self.change_value({
				changed_data : changed_data,
				refresh 	 : false
			})
			.then((save_response)=>{
				// event to update the dom elements of the instance
				event_manager.publish('update_value_'+self.id, changed_data)
			})
		})

	// load
		await self.load_editor()

	// create the editor
		const editor_options = {
			mode	 : 'code',
			modes	 : ['code', 'form', 'text', 'tree', 'view'], // allowed modes
			// maxLines : 100, // Infinity,
			onError	 : function (err) {
				console.error("err:",err);
				alert(err.toString());
			},
			onValidationError : function() {
				validated = false
			},
			onValidate: function() {
				validated = true

		       //var json = editor.get();
		       // Update hidden text area value
		       //editor_text_area.value = editor.getText()

				// const json = editor.get();
				//      	console.log("json:",json);
				//      	//console.log("json editor.get():",editor.get());
				//      	console.log("text editor.getText():",editor.getText());

				// const changed_data = Object.freeze({
				// 	action	: 'update',
				// 	key		: 0,
				// 	value	: editor.get()
				// })
				// self.change_value({
				// 	changed_data : changed_data,
				// 	refresh 	 : false
				// })
				// .then((save_response)=>{
				// 	// event to update the dom elements of the instance
				// 	event_manager.publish('update_value_'+self.id, changed_data)
				// })
		    }
		}
		const editor = new JSONEditor(li, editor_options, current_value)



	return li
}//end get_input_element


