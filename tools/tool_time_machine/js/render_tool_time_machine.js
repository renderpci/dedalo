/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../../core/common/js/event_manager.js'
	import {ui} from '../../../core/common/js/ui.js'
	import {get_ar_instances} from '../../../core/section/js/section.js'



/**
* RENDER_TOOL_TIME_MACHINE
* Manages the component's logic and apperance in client side
*/
export const render_tool_time_machine = function() {
	
	return true
};//end render_tool_time_machine



/**
* EDIT
* Render node for use like button
* @return DOM node
*/
render_tool_time_machine.prototype.edit = async function (options) {

	const self = this

	// options
		const render_level 	= options.render_level || 'full'

	// columns_map
		const columns_map = await rebuild_columns_map(self)
		self.time_machine.columns_map = columns_map

	// section_record
		const ar_section_record = await get_ar_instances(self.time_machine)

	// content_data
		const current_content_data = await content_data_edit(self, ar_section_record)
		if (render_level==='content') {
			return current_content_data
		}

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.tool.build_wrapper_edit(self, {
			content_data : current_content_data
		})

	// tool_container
		//const tool_container = document.getElementById('tool_container')
		//if(tool_container!==null){
		//	tool_container.appendChild(wrapper)
		//}else{
		//	const main = document.getElementById('main')
		//	const new_tool_container = ui.create_dom_element({
		//		id 				: 'tool_container',
		//		element_type	: 'div',
		//		parent 			: main
		//	})
		//	new_tool_container.appendChild(wrapper)
		//}

	// modal container
		const header	= wrapper.querySelector('.tool_header')
		const modal		= ui.attach_to_modal(header, wrapper, null, 'big')
		modal.on_close	= () => {
			self.destroy(true, true, true) // (delete_self, delete_dependencies, remove_dom)
		}
		// fix
		self.modal_container = modal

	// events
		// click
			// wrapper.addEventListener("click", function(e){
			// 	e.stopPropagation()
			// 	console.log("e:",e);
			// 	return
			// })


	return wrapper
};//end render_tool_time_machine



/**
* CONTENT_DATA_EDIT
* @return DOM node content_data
*/
const content_data_edit = async function(self, ar_section_record) {

	const fragment = new DocumentFragment()

	// const tm_date = new Date();

	// current_component_container
		const current_component_container = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'current_component_container disabled_component',
			parent 			: fragment
		})
		await add_component(self, current_component_container, self.main_component.lang, get_label.ahora, 'edit', null)

	// preview_component_container
		const preview_component_container = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'preview_component_container disabled_component',
			parent 			: fragment
		})
		// set
		self.preview_component_container = preview_component_container


	// tool_bar
		const tool_bar = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'tool_bar',
			parent 			: fragment
		})
		// lang selector
			if (self.main_component.lang!=='lg-nolan') {
				const on_change_select = function(e) {
					const lang = e.target.value
					if (lang!==self.lang) {
						self.lang					= lang
						self.main_component.lang	= lang
						self.refresh()
					}
				}
				// label
				ui.create_dom_element({
					element_type	: 'label',
					text_content 	: get_label.idioma,
					parent 			: tool_bar
				})
				// selector
				const lang_selector = ui.build_select_lang({
					langs  		: self.langs,
					selected 	: self.lang,
					class_name	: '',
					action 		: on_change_select,
					parent 			: tool_bar
				})
				// lang_selector.addEventListener('change', async (e) => {
				// 	e.stopPropagation()

				// 	const lang = e.target.value
				// 	if (lang!==self.lang) {
				// 		self.lang = lang
				// 		self.caller.lang = lang
				// 		self.refresh()
				// 	}
				// })
			}

		// button apply
			self.button_apply = ui.create_dom_element({
				element_type	: 'button',
				class_name		: 'warning button_apply hide',
				text_content	: get_label.aplicar_y_salvar || 'Apply and save',
				parent			: tool_bar
			})
			self.button_apply.addEventListener("click", self.apply_value.bind(self))

	// section container
		// const section_container = ui.create_dom_element({
		// 	element_type	: 'div',
		// 	class_name 		: 'section_container',
		// 	parent 			: fragment
		// })

	// section list
		// const section		= await self.load_section()
		// const section_node	= await section.render()
		// fragment.appendChild(section_node)
		const time_machine_node	= await render_time_machine(self, ar_section_record)
		fragment.appendChild(time_machine_node)

	// buttons container
		// const buttons_container = ui.create_dom_element({
		// 	element_type	: 'div',
		// 	class_name 		: 'buttons_container',
		// 	parent 			: components_container
		// })


	// content_data
		const content_data = document.createElement("div")
			  content_data.classList.add("content_data", self.type)
			  content_data.appendChild(fragment)


	return content_data
};//end content_data_edit



/**
* RENDER_TIME_MACHINE
* @param array ar_section_record
* 	Array of section_record instances (ar_instances)
* @param instance self
* 	Instance of current tool
* @return DOM node content_data
*/
const render_time_machine = async function(self, ar_section_record) {

	const fragment = new DocumentFragment()

	const columns_map = self.time_machine.columns_map

	// tm_content_data
		const tm_content_data = document.createElement("div")
			  tm_content_data.classList.add("content_data", self.mode, self.type) // ,"nowrap","full_width"

		// add all section_record rendered nodes
			const ar_section_record_length = ar_section_record.length
			if (ar_section_record_length===0) {

				// no records found case
				const no_records_node = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'no_records',
					inner_html		: get_label.no_records || "No records found"
				})
				tm_content_data.appendChild(no_records_node)

			}else{
				// rows
				// parallel mode
					const ar_promises = []
					for (let i = 0; i < ar_section_record_length; i++) {
						const render_promise_node = ar_section_record[i].render()
						ar_promises.push(render_promise_node)
					}
					await Promise.all(ar_promises).then(function(values) {
					  for (let i = 0; i < ar_section_record_length; i++) {
					  	const section_record_node = values[i]
						tm_content_data.appendChild(section_record_node)
					  }
					});
			}

	// paginator container node
		const paginator_div = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'paginator',
			parent			: fragment
		})
		self.time_machine.paginator.build()
		.then(function(){
			self.time_machine.paginator.render().then(paginator_wrapper =>{
				paginator_div.appendChild(paginator_wrapper)
			})
		})

	// list_body
		const list_body = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'list_body',
			parent			: fragment
		})
		// flat columns create a sequence of grid widths taking care of sub-column space
		// like 1fr 1fr 1fr 3fr 1fr
		const items				= ui.flat_column_items(columns_map)
		const template_columns	= items.join(' ')
		Object.assign(
			list_body.style,
			{
				"grid-template-columns": template_columns
			}
		)
		// fix last list_body (for pagination selection)
		// self.node_body = list_body

	// list_header_node. Create and append if ar_instances is not empty
		if (ar_section_record.length>0) {
			const list_header_node = ui.render_list_header(columns_map, self)
			list_body.appendChild(list_header_node)
		}

	// tm_content_data append
		list_body.appendChild(tm_content_data)

	// wrapper
		const wrapper = ui.create_dom_element({
			element_type	: 'section',
			//class_name	: self.model + ' ' + self.tipo + ' ' + self.mode
			class_name		: 'wrapper_' + self.time_machine.type + ' ' + self.time_machine.model + ' ' + self.time_machine.tipo + ' ' + self.time_machine.mode
		})
		wrapper.appendChild(fragment)


	return wrapper
};//end render_time_machine



/**
* REBUILD_COLUMNS_MAP
* Adding control columns to the columns_map that will processed by section_recods
* @return obj columns_map
*/
const rebuild_columns_map = async function(self) {

	const columns_map = []

	// column section_id check
		columns_map.push({
			id			: 'section_id',
			label		: 'Id',
			width 		: 'auto',
			callback	: render_tool_time_machine.render_column_id
		})

	// columns base
		const base_columns_map = await self.time_machine.columns_map
		columns_map.push(...base_columns_map)


	return columns_map
};//end rebuild_columns_map



/**
* RENDER_COLUMN_ID
* @param object options
* @return DOM DocumentFragment
*/
render_tool_time_machine.render_column_id = function(options){

	// options
		const self				= options.caller
		const section_id		= options.section_id
		const section_tipo		= options.section_tipo
		// const offset			= options.offset
		const matrix_id			= options.matrix_id
		const modification_date	= options.modification_date

	// permissions
		const permissions = self.permissions

	const fragment = new DocumentFragment()

	// section_id
		ui.create_dom_element({
			element_type	: 'span',
			text_content	: section_id,
			class_name		: 'section_id',
			parent			: fragment
		})

	// button time machine preview (eye)
		const edit_button_tm = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'button eye',
			parent			: fragment
		})
		edit_button_tm.addEventListener("click", function(){
			// publish event
			event_manager.publish('tm_edit_record', {
				tipo		: section_tipo,
				section_id	: section_id,
				matrix_id	: matrix_id,
				date		: modification_date || null,
				mode		: 'tm'
			})
		})

	return fragment
};// end render_column_id()


/**
* ADD_COMPONENT
*/
export const add_component = async (self, component_container, lang_value, label, mode, matrix_id=null) => {
	
	// user select blank lang_value case
		if (!lang_value) {
			while (component_container.firstChild) {
				// remove node from dom (not component instance)
				component_container.removeChild(component_container.firstChild)
			}
			return false
		}

	// component load
		const component = matrix_id===null
			? self.main_component // self.caller
			: await self.load_component(lang_value, mode, matrix_id)

	// render node
		const node = await component.render({
			render_mode : 'edit'
		})

	// clean previous and append rendered node
		while (component_container.firstChild) {
			component_container.removeChild(component_container.firstChild)
		}
		component_container.appendChild(node)

	// label
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'time_label',
			text_content	: label,
			parent			: component_container
		})


	return true
};//end add_component


