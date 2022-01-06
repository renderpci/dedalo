/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	// import {data_manager} from '../../common/js/data_manager.js'
	// import {create_source} from '../../common/js/common.js'
	// import {get_instance, delete_instance} from '../../common/js/instances.js'
	import {ui} from '../../common/js/ui.js'
	// import {service_autocomplete} from '../../services/service_autocomplete/js/service_autocomplete.js'
	// import {clone, dd_console} from '../../common/js/utils/index.js'
	import {
		render_column_component_info,
		render_column_remove,
		get_buttons,
		add_events,
		build_header
	} from './render_edit_component_portal.js'



/**
* RENDER_EDIT_VIEW_MOSAIC
* Manage the components logic and appearance in client side
*/
export const render_edit_view_mosaic = function() {

	return true
}//end render_edit_view_mosaic



/**
* RENDER_EDIT_VIEW_MOSAIC
* Manages the component's logic and appearance in client side
*/
render_edit_view_mosaic.render = async function(self, options) {

	// options
		const render_level = options.render_level || 'full'

	// reset service state portal_active
		// self.portal_active = false

	// columns_map
		const columns_map	= await rebuild_columns_map(self)
		self.columns_map	= columns_map

	const ar_section_record	= await self.get_ar_instances({mode:'list'})

	// content_data
		const content_data = await get_content_data(self, ar_section_record)
		if (render_level==='content') {
			// show header_wrapper_list if is hidden
				if (ar_section_record.length>0) {
					self.node.map(el => {
						el.querySelector(":scope >.list_body>.header_wrapper_list").classList.remove('hide')
					})
				}
			return content_data
		}

	// header
		const list_header_node = build_header(columns_map, ar_section_record, self)

	// list_body
		const list_body = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'list_body'
		})

		// const n_columns = list_header_node.children.length
		// // id (auto), repeat x columns, delete (25px)
		// const template_columns = (self.permissions>1)
		// 	? "auto repeat("+(n_columns-2)+", 1fr) auto"
		// 	: "auto repeat("+(n_columns-1)+", 1fr)"

		const items				= ui.flat_column_items(columns_map);
		const template_columns	= items.join(' ')
		Object.assign(
			list_body.style,
			{
				"grid-template-columns": template_columns
			}
		)
		list_body.appendChild(list_header_node)
		list_body.appendChild(content_data)

	// buttons
		const buttons = get_buttons(self)

	// top
		// const top = get_top(self)

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_edit(self, {
			// content_data	: content_data,
			buttons			: buttons,
			list_body		: list_body
			// top			: top
		})
		wrapper.classList.add('portal', 'view_'+self.context.view)

	// events
		add_events(self, wrapper)


	return wrapper
}//end edit



/**
* GET_CONTENT_DATA
* Render all received section records and place it into a new div 'content_data'
* @return DOM node content_data
*/
const get_content_data = async function(self, ar_section_record) {

	// build_values
		const fragment = new DocumentFragment()

		// add all section_record rendered nodes
			const ar_section_record_length	= ar_section_record.length
			if (ar_section_record_length===0) {

				// no records found case
				// const row_item = no_records_node()
				// fragment.appendChild(row_item)
			}else{

				// const ar_promises = []
				for (let i = 0; i < ar_section_record_length; i++) {

					const section_record	= ar_section_record[i]
					// const section_id		= section_record.section_id
					// const section_tipo		= section_record.section_tipo

					// section_record wrapper
						// const row_wrapper = ui.create_dom_element({
						// 	element_type	: 'div',
						// 	class_name		: 'row_wrapper section_record ' + ' ' + self.tipo + ' ' + self.mode + (self.mode==='tm' ? ' list' : '')
						// })
						// row_wrapper.addEventListener("click", (e) => {
						// 	// e.stopPropagation()
						// 	if (!e.target.classList.contains("row_active")) {
						// 		e.target.classList.add("row_active")
						// 	}
						// })

					// section_record NODE
						// const row_container = ui.create_dom_element({
						// 	element_type	: 'div',
						// 	class_name		: 'section_record_container',
						// 	parent			: row_wrapper
						// })
						const section_record_node = await section_record.render()


					// button_remove
						// if (self.permissions>1) {
						// 	const column = ui.create_dom_element({
						// 		element_type	: 'div',
						// 		class_name		: 'column remove_column',
						// 		parent			: row_wrapper
						// 	})
						// 	ui.create_dom_element({
						// 		element_type	: 'span',
						// 		class_name		: 'button remove',
						// 		dataset			: { key : i },
						// 		parent			: column
						// 	})
						// }

					// section record
						fragment.appendChild(section_record_node)
				}
			}//end if (ar_section_record_length===0)

		// build references
			if(self.data.references && self.data.references.length > 0){
				const references_node = render_references(self.data.references)
				fragment.appendChild(references_node)
			}

	// content_data
		const content_data = ui.component.build_content_data(self)
			  content_data.appendChild(fragment)

	// set node only when it is in DOM (to save browser resources)
		// const observer = new IntersectionObserver(async function(entries) {
		// 	const entry = entries[1] || entries[0]
		// 	if (entry.isIntersecting===true || entry.intersectionRatio > 0) {
		// 		observer.disconnect();
		// 		const fragment = await build_values()
		// 		content_data.appendChild(fragment)
		// 	}
		// }, { threshold: [0] });
		// observer.observe(content_data);


	return content_data
}//end get_content_data



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
			callback	: render_edit_view_mosaic.render_column_id
		})

	// base_columns_map
		const base_columns_map = await self.columns_map
		columns_map.push(...base_columns_map)

	// column component_info check
		if (self.add_component_info===true) {
			columns_map.push({
				id			: 'ddinfo',
				label		: 'Info',
				callback	: render_column_component_info
			})
		}

	// button_remove
		if (self.permissions>1) {
			columns_map.push({
				id			: 'remove',
				label		: '', // get_label.delete || 'Delete',
				width 		: 'auto',
				callback	: render_column_remove
			})
		}

	return columns_map
}//end rebuild_columns_map



/**
* RENDER_COLUMN_ID
* @return DocumentFragment
*/
render_edit_view_mosaic.render_column_id = function(options){

	// options
		const self			= options.caller
		const section_id	= options.section_id
		const section_tipo	= options.section_tipo

	const fragment = new DocumentFragment()

	// section_id
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'section_id',
			text_content	: section_id,
			parent			: fragment
		})

	// edit_button
		const edit_button = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'button edit',
			parent			: fragment
		})
		edit_button.addEventListener("click", function(){
			const user_navigation_rqo = {
				caller_id	: self.id,
				source		: {
					action			: 'search',
					model			: 'section',
					tipo			: section_tipo,
					section_tipo	: section_tipo,
					mode			: 'edit',
					lang			: self.lang
				},
				sqo : {
					section_tipo		: [{tipo : section_tipo}],
					filter				: null,
					limit				: 1,
					filter_by_locators	: [{
						section_tipo	: section_tipo,
						section_id		: section_id,
					}]
				}
			}
			event_manager.publish('user_navigation', user_navigation_rqo)
		})

	return fragment
}// end render_column_id()



/**
* GET_INPUT_ELEMENT
* @return dom element li
*/
	// const get_input_element = function(current_section_record){

	// 	 // key. when portal is in search mode, is undefined, fallback to zero
	// 	const key = current_section_record.paginated_key || 0

	// 	// li
	// 		const li = ui.create_dom_element({
	// 			element_type	: 'li',
	// 			dataset			: { key : key }
	// 		})

	// 	// input field
	// 		current_section_record.render()
	// 		.then(function(section_record_node){

	// 			// section_record_node append
	// 				li.appendChild(section_record_node)

	// 			// button remove
	// 				const button_remove = ui.create_dom_element({
	// 					element_type	: 'span',
	// 					class_name		: 'button remove',
	// 					dataset			: { key : key },
	// 					parent			: li
	// 				})
	// 		})


	// 	return li
	// }//end get_input_element



/**
* GET_INPUT_ELEMENT_AWAIT
* @return dom element li
*/
	// const get_input_element_await = async function(current_section_record){

	// 	 // key. when portal is in search mode, is undefined, fallback to zero
	// 	const key = current_section_record.paginated_key || 0

	// 	// li
	// 		const li = ui.create_dom_element({
	// 			element_type	: 'li',
	// 			dataset			: { key : key }
	// 		})

	// 	// input field
	// 		const section_record_node = await current_section_record.render()
	// 		// section_record_node append
	// 			li.appendChild(section_record_node)
	// 		// button remove
	// 			const button_remove = ui.create_dom_element({
	// 				element_type	: 'span',
	// 				class_name		: 'button remove',
	// 				dataset			: { key : key },
	// 				parent			: li
	// 			})


	// 	return li
	// }//end get_input_element_await



/**
* GET_BUTTONS
* @param object self instance
* @return DOM node buttons_container
*/
	// const get_buttons = (self) => {

	// 	const is_inside_tool		= self.is_inside_tool
	// 	const mode					= self.mode
	// 	const show					= self.rqo.show
	// 	const target_section		= self.target_section
	// 	const target_section_lenght	= target_section.length
	// 		  // sort section by label ascendant
	// 		  target_section.sort((a, b) => (a.label > b.label) ? 1 : -1)

	// 	const fragment = new DocumentFragment()

	// 	// button_add
	// 		const button_add = ui.create_dom_element({
	// 			element_type	: 'span',
	// 			class_name		: 'button add',
	// 			parent			: fragment
	// 		})
	// 		button_add.addEventListener("click", async function(e){

	// 			//TO ADD SECTION SELECTOR
	// 				const section_tipo = target_section_lenght >1
	// 					? false
	// 					: target_section[0].tipo


	// 				// data_manager. create new record
	// 				const api_response = await data_manager.prototype.request({
	// 					body : {
	// 						action				: 'add_new_element',
	// 						source				: create_source(self),
	// 						target_section_tipo	: section_tipo
	// 					}
	// 				})
	// 				// add value to current data
	// 				if (api_response.result) {
	// 					self.refresh()
	// 				}else{
	// 					console.error("Error on api_response on try to create new row:", api_response);
	// 				}
	// 		})

	// 	// button_link
	// 		const button_link = ui.create_dom_element({
	// 			element_type	: 'span',
	// 			class_name		: 'button link',
	// 			parent			: fragment
	// 		})
	// 		button_link.addEventListener("click", async function(){
	// 			// const section_tipo	= select_section.value
	// 			// const section_label	= select_section.options[select_section.selectedIndex].innerHTML;
	// 			const section_tipo	= target_section[0].tipo
	// 			const section_label	= target_section[0].label;

	// 			// iframe
	// 				( () => {

	// 					const iframe_url = (tipo) => {
	// 						return '../page/?tipo=' + tipo + '&mode=list&initiator=' + self.id
	// 					}

	// 					const iframe_container = ui.create_dom_element({element_type : 'div', class_name : 'iframe_container'})
	// 					const iframe = ui.create_dom_element({
	// 						element_type	: 'iframe',
	// 						class_name		: 'fixed',
	// 						src				: iframe_url(section_tipo),
	// 						parent			: iframe_container
	// 					})

	// 					// select_section
	// 						const select_section = ui.create_dom_element({
	// 							element_type	: 'select',
	// 							class_name		: 'select_section' + (target_section_lenght===1 ? ' mono' : '')
	// 						})
	// 						select_section.addEventListener("change", function(){
	// 							iframe.src = iframe_url(this.value)
	// 						})
	// 						// options for select_section
	// 							for (let i = 0; i < target_section_lenght; i++) {
	// 								const item = target_section[i]
	// 								ui.create_dom_element({
	// 									element_type	: 'option',
	// 									value			: item.tipo,
	// 									inner_html		: item.label + " [" + item.tipo + "]",
	// 									parent			: select_section
	// 								})
	// 							}

	// 					// header label
	// 						const header = ui.create_dom_element({
	// 							element_type	: 'span',
	// 							text_content	: get_label.seccion,
	// 							class_name		: 'label'
	// 						})

	// 					// header custom
	// 						const header_custom = ui.create_dom_element({
	// 							element_type	: 'div',
	// 							class_name		: 'header_custom'
	// 						})
	// 						header_custom.appendChild(header)
	// 						header_custom.appendChild(select_section)

	// 					// fix modal to allow close later, on set value
	// 					self.modal = ui.attach_to_modal(header_custom, iframe_container, null, 'big')

	// 				})()
	// 				return
	// 		})


	// 	// button tree terms selector
	// 		if( self.rqo_config.show.interface &&
	// 			self.rqo_config.show.interface.button_tree &&
	// 			self.rqo_config.show.interface.button_tree=== true){
	// 			const button_tree_selector = ui.create_dom_element({
	// 				element_type	: 'span',
	// 				class_name		: 'button gear',
	// 				parent			: fragment
	// 			})
	// 			// add listener to the select
	// 			button_tree_selector.addEventListener('mouseup',function(){

	// 			})
	// 		}


	// 		if( self.rqo_config.show.interface &&
	// 			self.rqo_config.show.interface.button_external &&
	// 			self.rqo_config.show.interface.button_external === true){

	// 			// button_update data external
	// 				const button_update_data_external = ui.create_dom_element({
	// 					element_type	: 'span',
	// 					class_name		: 'button sync',
	// 					parent			: fragment
	// 				})
	// 				button_update_data_external.addEventListener("click", async function(e){
	// 					const source = self.rqo_config.show.find(item => item.typo === 'source')
	// 					source.build_options = {
	// 						get_dato_external : true
	// 					}
	// 					const builded = await self.build(true)
	// 					// render
	// 					if (builded) {
	// 						self.render({render_level : 'content'})
	// 					}
	// 				})
	// 		}

	// 	// buttons tools
	// 		if (!is_inside_tool) {
	// 			ui.add_tools(self, fragment)
	// 		}

	// 	// buttons container
	// 		const buttons_container = ui.component.build_buttons_container(self)
	// 			  buttons_container.appendChild(fragment)


	// 	return buttons_container
	// }//end get_buttons



/**
* GET_TOP
* Used to add special elements to the component, like custom buttons or info
* @param object instance
* @return DOM node top
*/
	// const get_top = function(self) {

	// 	if (self.mode!=='edit') {
	// 		return null;
	// 	}

	// 	// sort vars
	// 		const is_inside_tool		= self.is_inside_tool
	// 		const mode					= self.mode
	// 		// const current_data_manager	= new data_manager()
	// 		const show					= self.rqo.show
	// 		const target_section		= self.rqo.sqo.section_tipo //filter(item => item.model==='section')
	// 		const target_section_lenght	= target_section.length
	// 		// sort section by label asc
	// 			target_section.sort((a, b) => (a.label > b.label) ? 1 : -1)

	// 	const fragment = new DocumentFragment()

	// 	// select_section
	// 		// const select_section = ui.create_dom_element({
	// 		// 	element_type	: 'select',
	// 		// 	class_name		: 'select_section' + (target_section_lenght===1 ? ' mono' : ''),
	// 		// 	// parent			: fragment
	// 		// })
	// 		// select_section.addEventListener("click", function(e){
	// 		// 	// e.stopPropagation()
	// 		// })
	// 		// select_section.addEventListener("change", function(e){
	// 		// 		console.log("iframe_container:",iframe_container);
	// 		// })

	// 		// // options for select_section
	// 		// 	for (let i = 0; i < target_section_lenght; i++) {
	// 		// 		const item = target_section[i]
	// 		// 		ui.create_dom_element({
	// 		// 			element_type	: 'option',
	// 		// 			value			: item.tipo,
	// 		// 			inner_html		: item.label + " [" + item.tipo + "]",
	// 		// 			parent			: select_section
	// 		// 		})
	// 		// 	}

	// 	// button_add
	// 		// const button_add = ui.create_dom_element({
	// 		// 	element_type	: 'span',
	// 		// 	class_name		: 'button add',
	// 		// 	parent			: fragment
	// 		// })
	// 		// button_add.addEventListener("click", async function(e){

	// 		// 	// data_manager. create new record
	// 		// 		const api_response = await data_manager.prototype.request({
	// 		// 			body : {
	// 		// 				action			: 'create',
	// 		// 				section_tipo	: select_section.value
	// 		// 			}
	// 		// 		})
	// 		// 		// add value to current data
	// 		// 		if (api_response.result && api_response.result>0) {
	// 		// 			const value = {
	// 		// 				section_tipo	: select_section.value,
	// 		// 				section_id		: api_response.result
	// 		// 			}
	// 		// 			self.add_value(value)
	// 		// 		}else{
	// 		// 			console.error("Error on api_response on try to create new row:", api_response);
	// 		// 		}
	// 		// })

	// 	// button_link
	// 		// const button_link = ui.create_dom_element({
	// 		// 	element_type	: 'span',
	// 		// 	class_name		: 'button link',
	// 		// 	parent			: fragment
	// 		// })
	// 		// button_link.addEventListener("click", async function(e){

	// 		// 	// const section_tipo	= select_section.value
	// 		// 	// const section_label	= select_section.options[select_section.selectedIndex].innerHTML;
	// 		// 	const section_tipo	= target_section[0].tipo
	// 		// 	const section_label	= target_section[0].label;

	// 		// 	// iframe
	// 		// 		( async () => {
	// 		// 			const iframe_container = ui.create_dom_element({element_type : 'div', class_name : 'iframe_container'})
	// 		// 			const iframe = ui.create_dom_element({
	// 		// 				element_type	: 'iframe',
	// 		// 				class_name		: 'fixed',
	// 		// 				src				: '../page/?tipo=' + section_tipo + '&mode=list&initiator='+ self.id,
	// 		// 				parent			: iframe_container
	// 		// 			})

	// 		// 			// select_section
	// 		// 				const select_section = ui.create_dom_element({
	// 		// 					element_type	: 'select',
	// 		// 					class_name		: 'select_section' + (target_section_lenght===1 ? ' mono' : ''),
	// 		// 					// parent			: fragment
	// 		// 				})
	// 		// 				select_section.addEventListener("click", function(e){
	// 		// 					// e.stopPropagation()
	// 		// 				})
	// 		// 				select_section.addEventListener("change", function(){
	// 		// 					iframe.src = '../page/?tipo=' + this.value + '&mode=list&initiator='+ self.id
	// 		// 				})
	// 		// 				// options for select_section
	// 		// 					for (let i = 0; i < target_section_lenght; i++) {
	// 		// 						const item = target_section[i]
	// 		// 						ui.create_dom_element({
	// 		// 							element_type	: 'option',
	// 		// 							value			: item.tipo,
	// 		// 							inner_html		: item.label + " [" + item.tipo + "]",
	// 		// 							parent			: select_section
	// 		// 						})
	// 		// 					}

	// 		// 			// header label
	// 		// 				const header = ui.create_dom_element({
	// 		// 					element_type	: 'span',
	// 		// 					text_content	: get_label.seccion,
	// 		// 					class_name		: 'label'
	// 		// 				})

	// 		// 			// header custom
	// 		// 				const header_custom = ui.create_dom_element({
	// 		// 					element_type	: 'div',
	// 		// 					class_name		: 'header_custom'
	// 		// 				})
	// 		// 				header_custom.appendChild(header)
	// 		// 				header_custom.appendChild(select_section)

	// 		// 			// fix modal to allow close later, on set value
	// 		// 			self.modal = ui.attach_to_modal(header_custom, iframe_container, null, 'big')

	// 		// 		})()
	// 		// 		return

	// 		// 	// page
	// 		// 		// ( async () => {

	// 		// 		// 	const options = {
	// 		// 		// 		model 			: 'section',
	// 		// 		// 		type 			: 'section',
	// 		// 		// 		tipo  			: section_tipo,
	// 		// 		// 		section_tipo  	: section_tipo,
	// 		// 		// 		section_id 		: null,
	// 		// 		// 		mode 			: 'list',
	// 		// 		// 		lang 			: page_globals.dedalo_data_lang
	// 		// 		// 	}
	// 		// 		// 	const page_element_call = await current_data_manager.get_page_element(options)
	// 		// 		// 	const page_element 		= page_element_call.result

	// 		// 		// 	const page = await get_instance({
	// 		// 		// 		model 		: 'page',
	// 		// 		// 		id_variant  : 'PORTAL_VARIANT',
	// 		// 		// 		elements 	: [page_element_call.result]
	// 		// 		// 	})
	// 		// 		// 	page.caller = self.caller
	// 		// 		// 	const build 		= await page.build()
	// 		// 		// 	const wrapper_page 	= await page.render()
	// 		// 		// 	const header = ui.create_dom_element({element_type : 'div',text_content : section_label})
	// 		// 		// 	const modal  = ui.attach_to_modal(header, wrapper_page, null, 'big')
	// 		// 		// 		console.log("page:",page);
	// 		// 		// })()
	// 		// 		// return

	// 		// 	// section
	// 		// 		// // find_section options. To create a complete set of options (including sqo), call API requesting a page_elemen
	// 		// 		// 	const options = {
	// 		// 		// 		model 			: 'section',
	// 		// 		// 		type 			: 'section',
	// 		// 		// 		tipo  			: section_tipo,
	// 		// 		// 		section_tipo  	: section_tipo,
	// 		// 		// 		section_id 		: null,
	// 		// 		// 		mode 			: 'list',
	// 		// 		// 		lang 			: page_globals.dedalo_data_lang
	// 		// 		// 	}
	// 		// 		// 	const page_element_call = await current_data_manager.get_page_element(options)
	// 		// 		// 	const page_element 		= page_element_call.result
	// 		// 		// 	// id_variant avoid instances id collisions
	// 		// 		// 		page_element.id_variant = 'ID_VARIANT_PORTAL'
	// 		// 		// 	const find_section_options = page_element

	// 		// 		// // find_section instance. Create target section page element and instance
	// 		// 		// 	const find_section = await get_instance(find_section_options)

	// 		// 		// 	// set self as find_section caller (!)
	// 		// 		// 		find_section.caller = self

	// 		// 		// 	// load data and render wrapper
	// 		// 		// 		await find_section.build(true)
	// 		// 		// 		const find_section_wrapper = await find_section.render()

	// 		// 		// // modal container
	// 		// 		// 	const header = ui.create_dom_element({
	// 		// 		// 		element_type	: 'div',
	// 		// 		// 		text_content 	: section_label
	// 		// 		// 	})
	// 		// 		// 	// fix modal to allow close later, on set value
	// 		// 		// 		self.modal = ui.attach_to_modal(header, find_section_wrapper, null, 'big')
	// 		// 		// 		self.modal.on_close = () =>{
	// 		// 		// 			find_section.destroy(true, true, true)
	// 		// 		// 		}
	// 		// })

	// 	// top container
	// 		const top = ui.create_dom_element({
	// 			element_type	: 'div',
	// 			class_name		: 'top'
	// 		})
	// 		// top.addEventListener("click", function(e){
	// 		// 	e.stopPropagation()
	// 		// })
	// 		top.appendChild(fragment)


	// 	return top
	// }//end  get_top


