// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global page_globals, SHOW_DEBUG, DEDALO_CORE_URL, get_label */
/*eslint no-undef: "error"*/



// imports
	import {data_manager} from '../../../core/common/js/data_manager.js'
	import {ui} from '../../../core/common/js/ui.js'
	import {clone, get_json_langs} from '../../../core/common/js/utils/index.js'



/**
* RENDER_TOOL_LANG
* Manages the component's logic and appearance in client side
*/
export const render_tool_lang = function() {

	return true
}//end render_tool_lang



/**
* EDIT
* Render node for use in edit mode
* @param object options
* @return HTMLElement wrapper
*/
render_tool_lang.prototype.edit = async function(options) {

	const self = this

	// options
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = await get_content_data_edit(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. UI build_edit returns component wrapper
		const wrapper = ui.tool.build_wrapper_edit(self, {
			content_data : content_data
		})
		// set pointers
		wrapper.content_data = content_data

	// status, render the status components for users and admins to control the process of the tool
		const status_container = await render_status(self)
		wrapper.tool_buttons_container.appendChild(status_container)


	return wrapper
}//end edit



/**
* GET_CONTENT_DATA_EDIT
* @return HTMLElement content_data
*/
const get_content_data_edit = async function(self) {

	const fragment = new DocumentFragment()

	// main_element unavailable case
		if (!self.main_element) {
			const content_data = ui.tool.build_content_data(self)
			content_data.innerHTML = 'Error loosed caller. main_element is not available. Please, try to reopen this tool again.'

			return content_data
		}

	// components container
		const components_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'components_container',
			parent			: fragment
		})

	// left_block
		const left_block = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'left_block',
			parent			: components_container
		})

		// top_left
			const top_left = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'top left',
				parent			: left_block
			})

			// source lang select
				const source_select_lang = ui.build_select_lang({
					langs		: self.langs,
					selected	: self.source_lang,
					class_name	: 'source_lang'
				})
				source_select_lang.addEventListener("change", function(e){
					const lang = e.target.value
					change_component_lang({
						self		: self,
						component	: self.main_element,
						lang		: lang
					})
				})
				top_left.appendChild(source_select_lang)

			// source_lang_label
				ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'lang_label source_lang_label',
					inner_html		: self.get_tool_label('source_lang') || 'Source lang',
					parent			: top_left
				})

		// source component
			const source_component_container = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'source_component_container',
				parent			: left_block
			})
			// show_interface
			self.main_element.show_interface.read_only = true
			self.main_element.show_interface.tools = false
			self.main_element.render()
			.then(function(node){
				source_component_container.appendChild(node)
			})

	// right_block
		const right_block = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'right_block',
			parent			: components_container
		})

		// top_right
			const top_right = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'top right',
				parent			: right_block
			})

			// target lang select
				const target_select_lang = ui.build_select_lang({
					langs		: self.langs,
					selected	: self.target_lang,
					class_name	: 'target_lang'
				})
				target_select_lang.addEventListener("change", async function(e){
					const lang = e.target.value
					change_component_lang({
						self		: self,
						component	: self.target_component,
						lang		: lang
					})

					const data = {
						id		: 'tool_lang_target_lang',
						value	: lang
					}
					data_manager.set_local_db_data(
						data,
						'status'
					)
				})
				top_right.appendChild(target_select_lang)

			// target_lang_label
				ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'lang_label target_lang_label',
					inner_html		: self.get_tool_label('target_lang') || 'Target lang',
					parent			: top_right
				})

		// target component
		// if the target component has the same lang than source component block the edition to avoid errors
		// ck-editor can not manage 2 instances of the same component in edit
			if (self.target_component) {
				// show_interface
				self.target_component.show_interface.read_only = (self.target_component.lang===self.source_lang)
				self.target_component.show_interface.tools = false
				const target_component_node = await self.target_component.render()
				const target_component_container = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'target_component_container',
					parent			: right_block
				})
				target_component_container.appendChild(target_component_node)

				// streaming overlay
				self.streaming_overlay = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'streaming_overlay hide',
					parent			: target_component_container
				})
				self.streaming_overlay_content = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'streaming_overlay_content',
					parent			: self.streaming_overlay
				})
			}

	// buttons container
		const buttons_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'buttons_container',
			parent			: fragment
		})

		// automatic_translation
			const translator_engine = (self.context.config)
				? self.context.config.translator_engine.value
				: false

			if (translator_engine) {
				const automatic_tranlation_node = build_automatic_translation(self, translator_engine, source_select_lang, target_select_lang, components_container)
				buttons_container.appendChild(automatic_tranlation_node)
			}//end if (translator_engine)

		// copy_to_target button
			const copy_to_target = ui.create_dom_element({
				element_type	: 'button',
				class_name		: 'secondary copy_to_target',
				inner_html		: self.get_tool_label('copy_to_target') || 'Copy to target',
				parent			: buttons_container
			})
			copy_to_target.addEventListener('click', async function(e){
				e.stopPropagation()

				// user confirmation to overwrite content
					if (self.target_component.data.value && self.target_component.data.value.length>0) {
						if (!confirm( get_label.sure || 'Sure?' )) {
							return false
						}
					}

				// source value
					const source_component	= self.main_element
					const source_value		= source_component.data.value

				// debug
					if(SHOW_DEBUG===true) {
						console.log("--> copy_to_target source_value:", clone(source_value));
						console.log("--> copy_to_target target_value:", clone(self.target_component.data.value));
					}

				// copy value
					self.target_component.data.value = source_value

				// save value. (Expected only one value in the array)
					for (let i = 0; i < source_value.length; i++) {
						self.target_component.save([{
							action	: 'update',
							id		: source_value[i]?.id || null,
							value	: source_value[i]
						}])
					}

				// refresh the target component
					self.target_component.refresh({
						build_autoload : false
					})
			})

		// propagate_marks
		// (!) WORKING HERE. Note that this functionality it's not finished in v5
			// const propagate_marks_block = render_propagate_marks_block(self)
			// buttons_container.appendChild(propagate_marks_block)

	// content_data
		const content_data = ui.tool.build_content_data(self)
		content_data.appendChild(fragment)


	return content_data
}//end get_content_data_edit



/**
* RENDER_PROPAGATE_MARKS_BLOCK
* (!) WORKING HERE. Note that this functionality it's not finished in v5
* @return HTMLElement propagate_marks_container
*/
const render_propagate_marks_block = function(self) {

	const propagate_marks_container = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'propagate_marks_container'
	})

	// new
		// new_only_label
		const new_only_label = ui.create_dom_element({
			element_type	: 'label',
			inner_html		: self.get_tool_label('new_only') || 'New only',
			parent			: propagate_marks_container
		})
		// input radio button
		const new_only_input = ui.create_dom_element({
			element_type	: 'input',
			type			: 'radio',
			name			: 'propagate_marks',
			value			: 'new_only'
		})
		new_only_input.checked = true // default value is New only
		new_only_label.prepend(new_only_input)

	// recreate all
		// all_label
		const all_label = ui.create_dom_element({
			element_type	: 'label',
			inner_html		: self.get_tool_label('all') || 'Recreate all',
			parent			: propagate_marks_container
		})
		// input radio button
		const all_input = ui.create_dom_element({
			element_type	: 'input',
			type			: 'radio',
			name			: 'propagate_marks',
			value			: 'all'
		})
		all_label.prepend(all_input)

	// propagate_marks button
		const propagate_marks = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'light propagate_marks',
			inner_html		: self.get_tool_label('propagate_marks') || 'Propagate marks',
			parent			: propagate_marks_container
		})
		propagate_marks.addEventListener('click', async function(e){
			e.stopPropagation()

			// user confirmation to overwrite content
				if (self.target_component.data.value && self.target_component.data.value.length>0) {
					if (!confirm( get_label.sure || 'Sure?' )) {
						return false
					}
				}

			// source value
				const source_component	= self.main_element
				const source_value		= source_component.data.value

			// (!) WORKING HERE. Note that this functionality it's not finished in v5
		})

	return propagate_marks_container
}//end render_propagate_marks_block



/**
* BUILD_AUTOMATIC_TRANSLATION
*/
const build_automatic_translation = (self, translator_engine, source_select_lang, target_select_lang, components_container) => {

	// container
		const automatic_translation_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'automatic_translation_container'
		})

	// status container
		const status_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'status_container hide',
			parent			: automatic_translation_container
		})

	// button
		const button_automatic_translation = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'warning button_automatic_translation',
			inner_html		: self.get_tool_label('automatic_translation') || "Automatic translation",
			parent			: automatic_translation_container
		})

		const click_handler = (e) => {
			e.stopPropagation()

			components_container.classList.add('loading')

			const translator_name	= self.translator_engine_select.value
			const source_lang		= source_select_lang.value
			const target_lang		= target_select_lang.value

			const engine = translator_engine.find(el => el.name===translator_name)
			if (engine && engine.type==='browser') {

				const device = self.translator_device_checkbox && self.translator_device_checkbox.checked
					? 'wasm'
					: 'webgpu'

				self.automatic_translation_browser({
					source_lang		: source_lang,
					target_lang		: target_lang,
					device			: device,
					status_container: status_container
				})
				.then(()=>{
					components_container.classList.remove('loading')
					const msg = self.get_tool_label('translation_completed') || 'Translation completed.'
					status_container.classList.remove('loading_status')
					status_container.innerHTML = `<span class="success_text">${msg}</span>`
				})
			}else{
				self.automatic_translation_server(translator_name, source_lang, target_lang, automatic_translation_container)
				.then(()=>{
					components_container.classList.remove('loading')
				})
			}
		}
		button_automatic_translation.addEventListener('click', click_handler)

	// select
		self.translator_engine_select = ui.create_dom_element({
			element_type	: 'select',
			parent 			: automatic_translation_container
		})
		for (let i = 0; i < translator_engine.length; i++) {

			const engine = translator_engine[i]

			const option = ui.create_dom_element({
				element_type	: 'option',
				value			: engine.name,
				inner_html		: engine.label,
				parent			: self.translator_engine_select
			})
			if (self.target_translator===engine.name) {
				option.selected = true
			}
		}
		const change_handler = (e) => {
			data_manager.set_local_db_data({
				id		: 'translator_engine_select',
				value	: self.translator_engine_select.value
			}, 'status')

			// show/hide configuration based on engine type
			const selected_engine = translator_engine.find(el => el.name===self.translator_engine_select.value)
			if (selected_engine && selected_engine.type==='browser') {
				configuration_container.classList.remove('hide')
			}else{
				configuration_container.classList.add('hide')
			}
		}
		self.translator_engine_select.addEventListener('change', change_handler)

	// configuration
	// open/close the configuration options
		const show_configuration = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'icon gear',
			parent			: automatic_translation_container
		})
		const show_configuration_click_handler = function (e) {
			configuration_container.classList.toggle('hide')
		}
		show_configuration.addEventListener('click', show_configuration_click_handler)

		const configuration_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'configuration_container hide',
			parent			: automatic_translation_container
		})

		// device checkbox
		const device_container = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'device_container',
			parent 			: configuration_container
		})

		const option_label = ui.create_dom_element({
			element_type	: 'label',
			inner_html		: self.get_tool_label('cpu_device') || 'More compatible, slower.',
			parent			: device_container
		})

		const translator_device_checkbox = ui.create_dom_element({
			element_type	: 'input',
			type			: 'checkbox'
		})

		self.translator_device_checkbox = translator_device_checkbox

		option_label.prepend(translator_device_checkbox)

		const device_id = 'translator_device_checkbox'
		translator_device_checkbox.addEventListener('change', function(){
			data_manager.set_local_db_data({
				id		: device_id,
				value	: translator_device_checkbox.checked
			}, 'status')
		})

		data_manager.get_local_db_data(
			device_id,
			'status'
		).then(function( device_saved ){
			if(device_saved){
				translator_device_checkbox.checked = device_saved.value
			}
		})

		// initial visibility: show config if the default engine is browser type
		const initial_engine = translator_engine.find(el => el.name===self.target_translator)
		if (initial_engine && initial_engine.type==='browser') {
			configuration_container.classList.remove('hide')
		}

	return automatic_translation_container
}//end build_automatic_translation



/**
* CHANGE_COMPONENT_LANG
* Load and render a new component for translate
* @param property object
* 	self		: instance of the tool
* 	component	: instance of the component to change, it could be source or target component
* 	lang		: the lang selected by user
* @return HTMLElement|bool
* 	component wrapper node
*/
export const change_component_lang = async (options) => {

	// options
		const self		= options.self
		const component	= options.component
		const lang		= options.lang

	// id_variant: tool_lang / target_component
		const is_main = component.id_variant==='tool_lang'

	// read_only
		component.show_interface.read_only = is_main || (lang===self.source_lang)

	// render component
		component.lang = lang
		// set auto_init_editor for convenience
		component.auto_init_editor = true

		await component.refresh()


	return true
}//end change_component_lang



/**
* RENDER_STATUS
* Render the status components to get control of the process of the tool
* the components are defined in ontology as tool_config->name_of_the_tool->ddo_map
* @param object self
* 	instance of current tool
* @return HTMLElement fragment
*/
const render_status = async function(self) {

	const fragment = new DocumentFragment()

	// status_user_component
		if (self.status_user_component) {
			self.status_user_component.context.view	= 'mini'
			self.status_user_component.show_interface.tools = false
			self.status_user_component.show_interface.save_animation = false
			const status_user_node = await self.status_user_component.render()
			fragment.appendChild(status_user_node)
		}

	// status_admin_component
		if (self.status_admin_component) {
			self.status_admin_component.context.view = 'mini'
			self.status_admin_component.show_interface.tools = false
			self.status_admin_component.show_interface.save_animation = false
			const status_admin_node	= await self.status_admin_component.render()
			fragment.appendChild(status_admin_node)
		}


	return fragment
}//end render_status



// @license-end
