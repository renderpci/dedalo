// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../core/common/js/ui.js'



/**
* RENDER_TOOL_TIME_MACHINE
* Manages the component's logic and appearance in client side
*/
export const render_tool_time_machine = function() {

	return true
}//end render_tool_time_machine



/**
* EDIT
* Render node for use like button
* @return HTMLElement wrapper
*/
render_tool_time_machine.prototype.edit = async function (options) {

	const self = this

	// options
		const render_level 	= options.render_level || 'full'

	// content_data
		const content_data = await get_content_data(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.tool.build_wrapper_edit(self, {
			content_data : content_data
		})
		// set pointer
		wrapper.content_data = content_data


	return wrapper
}//end edit



/**
* GET_CONTENT_DATA
* Renders the whole content_data node
* @param instance self
* 	Tool instance pointer
* @return HTMLElement content_data
*/
const get_content_data = async function(self) {

	const fragment = new DocumentFragment()

	// const tm_date = new Date();

	// current_component_container
		const current_component_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'current_component_container',
			parent			: fragment
		})
		if(self.main_element.model!=='section') {
			// add component
			await add_component(
				self, // tool instance
				current_component_container, // DOM node container
				self.main_element.lang, // string lang
				get_label.now || 'Now', // string label 'Now'
				'edit', // string mode = 'edit'
				null // int|null  matrix_id (time machine variant)
			)
		}

	// preview_component_container
		const preview_component_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'preview_component_container',
			parent			: fragment
		})
		// set
		self.preview_component_container = preview_component_container

	// tool_bar
		if (self.caller.model!=='section') {
			// tool_bar
				const tool_bar = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'tool_bar',
					parent			: fragment
				})

			// lang selector
				if (self.main_element.lang!=='lg-nolan') {

					// label
					ui.create_dom_element({
						element_type	: 'label',
						inner_html		: get_label.language,
						parent			: tool_bar
					})
					// selector
					const on_change_select = function(e) {
						const lang = e.target.value
						if (lang!==self.lang) {

							content_data.classList.add('loading')

							self.lang				= lang
							self.main_element.lang	= lang
							// refresh
							self.refresh({
								build_autoload	: false, // default true
								render_level	: 'content', // default content
								destroy			: true // default true
							})
							.then(function(response){
								content_data.classList.remove('loading')
							})
						}
					}
					const select_lang = ui.build_select_lang({
						langs		: self.langs,
						selected	: self.lang,
						class_name	: '',
						action		: on_change_select
					})
					tool_bar.appendChild(select_lang)
				}

			// button revert process
				// this activate the bulk process button.
				// only global admin can manage a revert of bulk processes
				// users will see a message saying that
				// they need to talk with the global admin to inform about the bulk process
				// and why need to be reverted
				if ( page_globals.is_global_admin === true ){
					self.button_bulk_revert_process = ui.create_dom_element({
						element_type	: 'button',
						class_name		: 'danger button_bulk_revert_process hide lock history',
						inner_html		: self.get_tool_label('revert_bulk_process') || 'Revert the bulk process',
						parent			: tool_bar
					})
					self.button_bulk_revert_process.addEventListener('click', function(){
						//get the confirm message
						const confirm_msg = self.get_tool_label('bulk_revert_confirm_msg', self.selected_bulk_process_id)
							|| `Are you sure to revert the bulk process: ${self.selected_bulk_process_id}?\n\nAll changed done in this process will be reverted in all records`

						if (confirm(confirm_msg)) {
							// process the bulk revert
							const bulk_revert_process_label = self.get_tool_label('bulk_revert_process_label') || 'Reversed the process with id'
							const bulk_revert_process_name = `${bulk_revert_process_label} ${self.selected_bulk_process_id} > ${self.label_bulk_revert_process.innerHTML}`
							self.bulk_revert_process({
								section_id					: self.main_element.section_id,
								section_tipo				: self.main_element.section_tipo,
								tipo						: self.main_element.tipo,
								lang						: self.main_element.lang,
								selected_bulk_process_id	: self.selected_bulk_process_id,
								bulk_revert_process_label	: bulk_revert_process_name
							})
							.then(function(response){
								if (response.result===true) {
									// success case
									if (window.opener) {
										// close this window when was opened from another
										window.close()
									}
								}else{
									// error case
									console.warn('response:',response);
									alert(response.msg || 'Error. Unknown error on apply tm value');
								}
							})
						}
					})
				}

			// revert_label
				self.label_bulk_revert_process = ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'revert_label hide',
					// inner_html		: self.get_tool_label('info_revert_bulk_process') || 'To revert this bulk process contact an administrator.',
					parent			: tool_bar
				})

			// button apply
				self.button_apply = ui.create_dom_element({
					element_type	: 'button',
					class_name		: 'warning button_apply lock history',
					inner_html		: self.get_tool_label('apply_and_save') || 'Apply and save',
					parent			: tool_bar
				})
				self.button_apply.addEventListener('click', function(){

					self.apply_value({
						section_id		: self.main_element.section_id,
						section_tipo	: self.main_element.section_tipo,
						tipo			: self.main_element.tipo,
						lang			: self.main_element.lang,
						matrix_id		: self.selected_matrix_id
					})
					.then(function(response){
						if (response.result===true) {
							// success case
							if (window.opener) {
								// close this window when was opened from another
								window.close()
							}
						}else{
							// error case
							console.warn('response:',response);
							alert(response.msg || 'Error. Unknown error on apply tm value');
						}
					})
				})
		}//end if (self.caller!=='section')

	// service_time_machine. Render instance
		const time_machine_list_node = await self.service_time_machine.render()
		fragment.appendChild(time_machine_list_node)

	// content_data
		const content_data = ui.tool.build_content_data(self)
		content_data.appendChild(fragment)


	return content_data
}//end get_content_data



/**
* ADD_COMPONENT
*
* @param instance self
* 	Instance pointer of tool_time_machine
* @param DOM node component_container
* @param string lang_value
* 	Sample: 'lg-spa'
* @param string label
* @param string mode
* @param string|int matrix_id = null
*
* @return HTMLElement|bool
*/
export const add_component = async (self, component_container, lang_value, label, mode, matrix_id=null) => {

	// user select blank lang_value case
		if (!lang_value) {
			while (component_container.firstChild) {
				// remove node from DOM (not component instance)
				component_container.removeChild(component_container.firstChild)
			}
			return false
		}

	// load component gracefully
		const node = ui.load_item_with_spinner({
			container			: component_container,
			preserve_content	: false,
			label				: label,
			callback			: async () => {

				// component load
					const component = matrix_id===null
						? self.main_element
						: await self.get_component(lang_value, mode, matrix_id)

				// set permissions as read
					component.context.permissions = 1

				// show_interface
					component.show_interface.tools = false
					component.show_interface.read_only = true

				// render node
					const node = await component.render({
						render_mode : 'edit'//mode // 'edit'
					})
					if (node) {
						node.classList.add('disabled_component')
					}

				// time_label_node
					const time_label_node = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'time_label',
						inner_html		: label,
						parent			: component_container
					})

				return node
			}
		})




	return node
}//end add_component



// @license-end
