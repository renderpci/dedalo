/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {render_components_list} from '../../../core/common/js/render_common.js'
	// import {event_manager} from '../../../core/common/js/event_manager.js'
	import {data_manager} from '../../../core/common/js/data_manager.js'
	// import * as instances from '../../../core/common/js/instances.js'
	import {ui} from '../../../core/common/js/ui.js'



/**
* RENDER_TOOL_EXPORT
* Manages the component's logic and apperance in client side
*/
export const render_tool_export = function() {

	return true
}//end render_tool_export



/**
* EDIT
* Render DOM nodes of the tool
* @return DOM node wrapper
*/
render_tool_export.prototype.edit = async function (options={render_level:'full'}) {

	const self = this

	// render level
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = await get_content_data_edit(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.tool.build_wrapper_edit(self, {
			content_data : content_data
		})

	// tool_container container
		// if (!window.opener) {
		// 	const header			= wrapper.tool_header // is created by ui.tool.build_wrapper_edit
		// 	const tool_container	= ui.attach_to_modal(header, wrapper, null, 'big')
		// 	tool_container.on_close	= async () => {
		// 		// tool destroy
		// 			await self.destroy(true, true, true)
		// 		// refresh source component text area
		// 			if (self.caller) {
		// 				self.caller.refresh()
		// 			}
		// 	}
		// }

	return wrapper
}//end render_tool_export



/**
* GET_CONTENT_DATA_EDIT
* @return DOM node content_data
*/
const get_content_data_edit = async function(self) {

	const fragment = new DocumentFragment()

	// components_list_container
		const components_list_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'components_list_container',
			parent			: fragment
		})
		// fields list . List of section fields usable in search
			// const search_container_selector = ui.create_dom_element({
			// 	element_type	: 'ul',
			// 	class_name		: 'search_section_container target_container',
			// 	parent			: components_list_container
			// })

		// components_list. render section component list [left]
			const section_elements = await self.get_section_elements_context({
				section_tipo : self.target_section_tipo
			})
			render_components_list({
				self				: self,
				section_tipo		: self.target_section_tipo,
				target_div			: components_list_container,
				path				: [],
				section_elements	: section_elements
			})
			console.log("get_content_data_edit self.components_list:",self.components_list);

	// export_components_container
		const export_components_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'export_components_container',
			parent			: fragment
		})
		// title
			const list_title = ui.create_dom_element({
				element_type	: 'h1',
				class_name		: 'list_title',
				inner_html		: get_label.elementos_activos || 'Active elements',
				parent			: export_components_container
			})
		// drag and drop events
			export_components_container.addEventListener('dragstart',function(e){self.on_dragstart(this,e)})
			export_components_container.addEventListener('dragend',function(e){self.on_drag_end(this,e)})
			export_components_container.addEventListener('drop',function(e){self.on_drop(this,e)})
			export_components_container.addEventListener('dragover',function(e){self.on_dragover(this,e)})
			export_components_container.addEventListener('dragleave',function(e){self.on_dragleave(this,e)})
		// read saved ddo in local DB and restore elements if found
			const current_data_manager	= new data_manager()
			const id					= 'tool_export_config'
			current_data_manager.get_local_db_data(id, 'data')
			.then(function(response){
				const target_section_tipo = self.target_section_tipo[0]
				if (response && response.value && response.value[target_section_tipo]) {
					// call for each saved ddo
					for (let i = 0; i < response.value[target_section_tipo].length; i++) {
						const ddo = response.value[target_section_tipo][i]
						self.build_export_component(export_components_container, ddo.path, ddo)
						.then(()=>{
							// Update the ddo_export
							self.ar_ddo_to_export.push(ddo)
						})
					}
					if(SHOW_DEBUG===true) {
						console.log(`Added saved local db ${target_section_tipo} ddo items:`, response.value[target_section_tipo]);
					}
				}
			})

	// export_buttons_config
		const export_buttons_config = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'export_buttons_config',
			parent			: fragment
		})
		// records info
			const records_info = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'records_info',
				parent			: export_buttons_config
			})
				const section_label = ui.create_dom_element({
					element_type	: 'h1',
					class_name		: 'section_label',
					inner_html		: self.caller.label,
					parent			: export_buttons_config
				})
				const total_records_label = ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'total_records',
					inner_html		: get_label.total_records + ': ',
					parent			: export_buttons_config
				})
				const total_records = ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'total_records',
					inner_html		: self.caller.total,
					parent			: total_records_label
				})
		// export format
			const data_format = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'records_info',
				inner_html		: get_label.formato,
				parent			: export_buttons_config
			})
			// select
				const select_data_format_export = ui.create_dom_element({
					element_type	: 'select',
					class_name		: 'select_data_format_export',
					parent			: data_format
				})
					const select_option_standard= ui.create_dom_element({
						element_type	: 'option',
						inner_html		: get_label.estandar || 'standard',
						value			: 'standard',
						parent			: select_data_format_export
					})
					const select_option_html= ui.create_dom_element({
						element_type	: 'option',
						inner_html		: get_label.html || 'HTML',
						value			: 'html',
						parent			: select_data_format_export
					})
					const select_option_breakdown= ui.create_dom_element({
						element_type	: 'option',
						inner_html		: get_label.desglose || 'breakdown',
						value			: 'breakdown',
						parent			: select_data_format_export
					})
					const select_option_breakdown_html = ui.create_dom_element({
						element_type	: 'option',
						inner_html		: (get_label.desglose || 'breakdown' ) + ' ' +(get_label.html || 'HTML'),
						value			: 'breakdown_html',
						parent			: select_data_format_export
					})
					const select_option_dedalo = ui.create_dom_element({
						element_type	: 'option',
						inner_html		: 'Dédalo (Raw)',
						value			: 'dedalo',
						parent			: select_data_format_export
					})
		// button export
			const button_export = ui.create_dom_element({
				element_type	: 'button',
				class_name		: 'button_export success',
				inner_html		: get_label.tool_export || 'Export',
				parent			: export_buttons_config
			})
			button_export.addEventListener('click', async function() {

				// clean target_div
					while (export_data.hasChildNodes()) {
						export_data.removeChild(export_data.lastChild);
					}
				// export_grid API call
				self.data_format = select_data_format_export.value

				const export_grid_options = {
					data_format			: self.data_format,
					ar_ddo_to_export	: self.ar_ddo_to_export,
				}
				self.get_export_grid(export_grid_options)
				.then(function(dd_grid_export_node){
					if (dd_grid_export_node) {
						export_data.appendChild(dd_grid_export_node)
						export_data.scrollIntoView(true)
					}
				})
			})

	// export_buttons_options
		const export_buttons_options = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'export_buttons_options',
			parent			: fragment
		})
			const button_export_csv = ui.create_dom_element({
				element_type	: 'button',
				class_name		: 'processing_import success',
				inner_html		: (get_label.descargar || 'Export') + ' csv',
				parent			: export_buttons_options
			})
			button_export_csv.addEventListener('click', async function() {

				const options = {
					data_format			: select_data_format_export.value,
					ar_ddo_to_export	: self.ar_ddo_to_export,
					export_data			: export_data,
				}
				const dd_grid_expot_csv = await self.get_export_csv(options)

				// Download it
					const filename	= 'export_' + self.caller.section_tipo + '_' + new Date().toLocaleDateString() + '.csv';
					const link		= document.createElement('a');
					link.style.display = 'none';
					link.setAttribute('target', '_blank');
					link.setAttribute('href', 'data	:text/csv;charset=utf-8,' + encodeURIComponent(dd_grid_expot_csv));
					link.setAttribute('download', filename);
					document.body.appendChild(link);
					link.click();
					document.body.removeChild(link);
			})
			const button_export_excel = ui.create_dom_element({
				element_type	: 'button',
				class_name		: 'processing_import success',
				inner_html		: (get_label.descargar || 'Export') + ' Excel',
				parent			: export_buttons_options
			})
			button_export_excel.addEventListener('click', function() {

				// Download it
					const filename	= 'export_' + self.caller.section_tipo + '_' + new Date().toLocaleDateString() + '.xls';
					const link		= document.createElement('a');
					link.style.display = 'none';
					link.setAttribute('target', '_blank');
					link.setAttribute('href', 'data	:text/html;charset=utf-8,' +  export_data.innerHTML);
					link.setAttribute('download', filename);
					document.body.appendChild(link);
					link.click();
					document.body.removeChild(link);
			})

			const button_export_html = ui.create_dom_element({
				element_type	: 'button',
				class_name		: 'processing_import success',
				inner_html		: (get_label.descargar || 'Export') + ' html',
				parent			: export_buttons_options
			})
			button_export_html.addEventListener('click', function() {

				// Download it
					const filename	= 'export_' + self.caller.section_tipo + '_' + new Date().toLocaleDateString() + '.html';
					const link		= document.createElement('a');
					link.style.display = 'none';
					link.setAttribute('target', '_blank');
					link.setAttribute('href', 'data	:text/html;charset=utf-8,' +  export_data.innerHTML);
					link.setAttribute('download', filename);
					document.body.appendChild(link);
					link.click();
					document.body.removeChild(link);
			})
			const button_export_print = ui.create_dom_element({
				element_type	: 'button',
				class_name		: 'processing_import success',
				inner_html		: get_label.imprimir || 'Print',
				parent			: export_buttons_options
			})


	// grid data container
		const export_data = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'export_data',
			parent			: fragment
		})

	// content_data
		const content_data = ui.create_dom_element({
			element_type	: 'div'
		})
		content_data.appendChild(fragment)



	return content_data
}//end get_content_data_edit



/**
* BUILD_EXPORT_COMPONENT
* @return dom object
*/
render_tool_export.prototype.build_export_component = async function(parent_div, path, ddo) {

	const self = this

	const last_item		= path[path.length-1]
	const first_item	= path[0]


	// export_component container. Create dom element before load html from trigger
		const export_component = ui.create_dom_element({
			element_type	: 'div',
			class_name		: "export_component",
			parent			: parent_div
			// data_set		: {
			// 	path		: path_plain,
			// 	// section_id	: section_id
			// }
		})

	// component  node
	const component_node = ui.create_dom_element({
			element_type	: 'li',
			class_name		: 'component_label',
			inner_html		: ddo.label,
			parent			: export_component,
			data_set		: {
				path			: path,
				tipo			: ddo.tipo,
				section_tipo	: ddo.section_tipo,
			}
		})

	// button close
		const export_component_button_close = ui.create_dom_element({
			element_type	: 'span',
			parent			: export_component,
			class_name		: "button close"
		})
		export_component_button_close.addEventListener("click",function(e){
			// remove search box and content (component) from dom
			export_component.parentNode.removeChild(export_component)
			// delete the ddo from the array to export ddos
			const delete_ddo_index = self.ar_ddo_to_export.findIndex( el => el.id === ddo.id )
			self.ar_ddo_to_export.splice(delete_ddo_index, 1)
			// console.log("self.ar_ddo_to_export:",self.ar_ddo_to_export);
			const current_data_manager	= new data_manager()
			const id					= 'tool_export_config'
			current_data_manager.get_local_db_data(id, 'data')
			.then(function(response){
				// target_section_tipo. Used to create a object property key different for each section
				const target_section_tipo	= self.target_section_tipo[0]
				// tool_export_config. Current section tool_export_config (fallback to basic object)
				const tool_export_config	= response && response.value
					? response.value
					: false

				const section_config = tool_export_config && tool_export_config[target_section_tipo]
					? tool_export_config[target_section_tipo]
					: false
				// check if already exists current target section_tipo config ddo
				const compnent_ddo_index = section_config
					? section_config.map(el => el.id).indexOf(ddo.id)//find(el => el.id===ddo.id)
					: undefined
				// if exists current ddo (as expected because it has a close button and need to be in the loca database), remove it from local database using current target section_tipo as key
				if (compnent_ddo_index) {
					// remove it
						tool_export_config[target_section_tipo].splice(compnent_ddo_index, 1)
					// save the result to the local database
					const cache_data = {
						id		: 'tool_export_config',
						value	: tool_export_config
					}
					current_data_manager.set_local_db_data(cache_data, 'data')
				}
			})
		})

	// label component source if exists
		if (first_item!==last_item) {
			//console.log("first_item:",first_item);
			const label_add = parent_div.querySelector("span.label_add")
			if (label_add) {
				label_add.innerHTML = first_item.name +" "+ label_add.innerHTML
			}
		}

	// show hidden parent container
		parent_div.classList.remove("hide")

	// store ddo in local DB
		const current_data_manager	= new data_manager()
		const id					= 'tool_export_config'
		current_data_manager.get_local_db_data(id, 'data')
		.then(function(response){
			// target_section_tipo. Used to create a object property key different for each section
			const target_section_tipo	= self.target_section_tipo[0]
			// tool_export_config. Current section tool_export_config (fallback to basic object)
			const tool_export_config	= response && response.value
				? response.value
				: {
					[target_section_tipo] : []
				  }
			// check if already exists current target section_tipo config ddo
			const found = tool_export_config[target_section_tipo]
				? tool_export_config[target_section_tipo].find(el => el.id===ddo.id)
				: undefined
			// if not exists current ddo (as expected), add it to local database using current target section_tipo as key
			if (!found) {
				tool_export_config[target_section_tipo] = tool_export_config[target_section_tipo] || []
				tool_export_config[target_section_tipo].push(ddo)
				// save
				const cache_data = {
					id		: 'tool_export_config',
					value	: tool_export_config
				}
				current_data_manager.set_local_db_data(cache_data, 'data')
			}
		})


	return true
}//end build_export_component


