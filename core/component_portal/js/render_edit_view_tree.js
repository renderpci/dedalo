/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/

// imports
	import {event_manager} from '../../common/js/event_manager.js'
	// import {data_manager} from '../../common/js/data_manager.js'
	// import {create_source} from '../../common/js/common.js'
	// import {get_instance, delete_instance} from '../../common/js/instances.js'
	import {ui} from '../../common/js/ui.js'
	// import {service_autocomplete} from '../../services/service_autocomplete/js/service_autocomplete.js'
	import {object_to_url_vars} from '../../common/js/utils/index.js'
	import {render_column_remove} from './render_edit_component_portal.js'


/**
* RENDER_EDIT_VIEW_TABLE
* Manage the components logic and appearance in client side
*/
export const render_edit_view_tree = function() {

	return true
}//end render_edit_view_table




/**
* RENDER_EDIT_VIEW_TREE
* Manages the component's logic and appearance in client side
*/
render_edit_view_tree.render = async function(self, options) {

	// options
		const render_level = options.render_level || 'full'

	// columns_map
		const columns_map = rebuild_columns_map(self)
		self.columns_map = columns_map

	// ar_section_record
		const ar_section_record	= await self.get_ar_instances({mode:'list'})
		// store to allow destroy later
		self.ar_instances.push(...ar_section_record)

	// content_data
		const content_data = await get_content_data(self, ar_section_record)
		if (render_level==='content') {
			return content_data
		}

	// buttons
		const buttons = get_buttons(self)

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_edit(self, {
			content_data	: content_data,
			label 			: null,
			buttons			: buttons
		})
		wrapper.classList.add('portal', 'view_line')

	// events
		add_events(self, wrapper)


	return wrapper
};//end edit



/**
* ADD_EVENTS
* @return bool
*/
export const add_events = function(self, wrapper) {

	// click delegated
		wrapper.addEventListener("click", function(e){

		// remove row
			if(e.target.matches('.button.remove')) {
				e.preventDefault()

				// label
					const children = e.target.parentNode.parentNode.children
					const ar_label = []
					for (let i = 0; i < children.length; i++) {
						if(children[i].textContent.length>0) {
							ar_label.push(children[i].textContent)
						}
					}
					const label = ar_label.join(', ')

				const changed_data = Object.freeze({
					action	: 'remove',
					key		: JSON.parse(e.target.dataset.key),
					value	: null
				})

				const changed = self.change_value({
					changed_data	: changed_data,
					label			: label,
					refresh			: false,
					build_autoload	: false
				})
				changed.then(async (api_response)=>{

					// update pagination offset
						self.update_pagination_values('remove')

					// refresh
						await self.refresh({
							build_autoload : false
						})

					// check if the caller has active a tag_id
						if(self.active_tag){
							// filter component data by tag_id and re-render content
							self.filter_data_by_tag_id(self.active_tag)
						}

					// event to update the DOM elements of the instance
						event_manager.publish('remove_element_'+self.id, e.target.dataset.key)
				})

				return true
			}//end if(e.target.matches('.button.remove'))

		// activate service autocomplete. Enable the service_autocomplete when the user do click
			// if(self.autocomplete_active===false){

			// 	// set rqo
			// 		self.rqo_search 	= self.rqo_search || self.build_rqo_search(self.rqo_config, 'search')
			// 		// self.rqo.choose 	= self.rqo.choose || self.build_rqo('choose', self.context.request_config, 'get_data')

			// 	self.autocomplete = new service_autocomplete()
			// 	self.autocomplete.init({
			// 		caller	: self,
			// 		wrapper : wrapper
			// 	})
			// 	self.autocomplete_active = true
			// 	self.autocomplete.search_input.focus()

			// 	return true
			// }

		})//end click event


	return true
};//end add_events



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

				const ar_promises = []
				for (let i = 0; i < ar_section_record_length; i++) {
					const render_promise = ar_section_record[i].render()
					ar_promises.push(render_promise)
				}
				await Promise.all(ar_promises).then(function(values) {
				  for (let i = 0; i < ar_section_record_length; i++) {

					const section_record = values[i]

					fragment.appendChild(section_record)
				  }
				});
			}//end if (ar_section_record_length===0)

		// build references
			if(self.data.references && self.data.references.length > 0){
				const references_node = render_references(self.data.references)
				fragment.appendChild(references_node)
			}

	// content_data
		const content_data = ui.component.build_content_data(self,{button_close: null})
			  content_data.appendChild(fragment)

	return content_data
};//end get_content_data



/**
* REBUILD_COLUMNS_MAP
* Adding control columns to the columns_map that will processed by section_recods
* @return obj columns_map
*/
const rebuild_columns_map = async function(self) {

	const columns_map = []

	// base_columns_map
		const base_columns_map = await self.columns_map
		columns_map.push(...base_columns_map)

	// button_remove column
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
* GET_BUTTONS
* @param object self instance
* @return DOM node buttons_container
*/
const get_buttons = (self) => {

	const is_inside_tool		= self.is_inside_tool
	// const mode				= self.mode
	// const show				= self.rqo.show
	const target_section		= self.target_section
	const target_section_lenght	= target_section.length
		  // sort section by label ascendant
		  target_section.sort((a, b) => (a.label > b.label) ? 1 : -1)

	const fragment = new DocumentFragment()

	// button_add
		// 	const button_add = ui.create_dom_element({
		// 		element_type	: 'span',
		// 		class_name		: 'button add',
		// 		parent			: fragment
		// 	})
		// 	button_add.addEventListener("click", async function(e){

		// 		//TO ADD SECTION SELECTOR
		// 			const section_tipo = target_section_lenght >1
		// 				? false
		// 				: target_section[0].tipo


		// 			// data_manager. create new record
		// 			const api_response = await data_manager.prototype.request({
		// 				body : {
		// 					action				: 'add_new_element',
		// 					source				: create_source(self),
		// 					target_section_tipo	: section_tipo
		// 				}
		// 			})
		// 			// add value to current data
		// 			if (api_response.result) {
		// 				self.refresh()
		// 			}else{
		// 				console.error("Error on api_response on try to create new row:", api_response);
		// 			}
		// 	})

	// button_link
		const button_link = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'button link',
			parent			: fragment
		})
		button_link.addEventListener("click", async function(){
			// const section_tipo	= select_section.value
			// const section_label	= select_section.options[select_section.selectedIndex].innerHTML;
			const section_tipo	= target_section[0].tipo
			const section_label	= target_section[0].label;

			// iframe
				( () => {

					const iframe_url = (tipo) => {
						return '../page/?tipo=' + tipo + '&mode=list&initiator=' + self.id
					}

					const iframe_container = ui.create_dom_element({element_type : 'div', class_name : 'iframe_container'})
					const iframe = ui.create_dom_element({
						element_type	: 'iframe',
						class_name		: 'fixed',
						src				: iframe_url(section_tipo),
						parent			: iframe_container
					})

					// select_section
						const select_section = ui.create_dom_element({
							element_type	: 'select',
							class_name		: 'select_section' + (target_section_lenght===1 ? ' mono' : '')
						})
						select_section.addEventListener("change", function(){
							iframe.src = iframe_url(this.value)
						})
						// options for select_section
							for (let i = 0; i < target_section_lenght; i++) {
								const item = target_section[i]
								ui.create_dom_element({
									element_type	: 'option',
									value			: item.tipo,
									inner_html		: item.label + " [" + item.tipo + "]",
									parent			: select_section
								})
							}

					// header label
						const header = ui.create_dom_element({
							element_type	: 'span',
							inner_html		: get_label.seccion,
							class_name		: 'label'
						})

					// header custom
						const header_custom = ui.create_dom_element({
							element_type	: 'div',
							class_name		: 'header_custom'
						})
						header_custom.appendChild(header)
						header_custom.appendChild(select_section)

					// fix modal to allow close later, on set value
					self.modal = ui.attach_to_modal(header_custom, iframe_container, null, 'big')

				})()
				return
		})


	// button tree terms selector
		const button_tree_selector = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'button add',
			parent			: fragment
		})
		// add listener to the select
		button_tree_selector.addEventListener('mouseup',function(e){

			const caller_id = self.id || null
			const hierarchy_sections = self.rqo.sqo.section_tipo || null
			const hierarchy_terms = self.context.properties.source
				&& self.context.properties.source.request_config
				&& self.context.properties.source.request_config[0]
				&& self.context.properties.source.request_config[0].sqo
				&& self.context.properties.source.request_config[0].sqo.fixed_filter
					? self.context.properties.source.request_config[0].sqo.fixed_filter.filter(el => el.source === 'hierarchy_terms')
					: null

			// // short vars
			// 	const component_name		= button_obj.dataset.component_name
			// 	// optionals. Will be added to url if they exists
			// 	const hierarchy_types		= button_obj.dataset.hierarchy_types || undefined
			// 	const hierarchy_sections	= button_obj.dataset.hierarchy_sections || undefined
			// 	const hierarchy_terms		= button_obj.dataset.hierarchy_terms || undefined
			// 	const parent_area_is_model	= button_obj.dataset.parent_area_is_model || undefined

			// // Fix current this.selected_wrap_div (Important)
			// // Nota: el wrapper no cambia al actualizar el componente tras salvarlo, por lo que es seguro
			// 	this.selected_wrap_div = find_ancestor(button_obj, 'wrap_component')
			// 	if (this.selected_wrap_div === null ) {
			// 		if(SHOW_DEBUG===true) console.log(button_obj);
			// 		return alert("component_autocomplete_hi:open_ts_window: Sorry: this.selected_wrap_div dom element not found")
			// 	}
			// 	//console.log(button_obj.dataset.parent_area_is_model)

			// url vars
				const url_vars = {
					t				: 'dd100', // THESAURUS_TIPO
					menu			: 'no',
					thesaurus_mode	: 'relation'
				}

			// // hierarchy_types
			// 	if (hierarchy_types) {
			// 		url_vars.hierarchy_types = hierarchy_types
			// 	}

			// hierarchy_sections
				if (hierarchy_sections) {
					url_vars.hierarchy_sections = JSON.stringify(hierarchy_sections)
				}

			// Optional hierarchy_terms. Add to url if present
				if (hierarchy_terms) {
					url_vars.hierarchy_terms = JSON.stringify(hierarchy_terms)
				}

			// // parent_area_is_model
			// 	if (typeof parent_area_is_model!=='undefined' && JSON.parse(parent_area_is_model)===true) {
			// 		url_vars.model = 1;
			// 	}

			// if(self.rqo_config){
			// 	url_vars.sqo = JSON.stringify(self.rqo_config.sqo)
			// }

			if(caller_id){
				url_vars.initiator = JSON.stringify(caller_id)
			}

			const url = '../page/?' + object_to_url_vars(url_vars)

			// open window
			if (!window.rel_window || window.rel_window.closed) {
				window.rel_window = window.open(
					url,
					'rel_window',
					'status=yes,scrollbars=yes,resizable=yes,left=0,top=0,width=900,height=650'
				)
			}
			window.rel_window.focus()
		})

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
* RENDER_REFERENCES
* @return DOM node fragment
*/
const render_references = function(ar_references) {

	const fragment = new DocumentFragment()

	// ul
		const ul = ui.create_dom_element({
			element_type	: 'ul',
			class_name		: 'references',
			parent			: fragment
		})

	// references label
		ui.create_dom_element({
			element_type	: 'div',
			inner_html 		: get_label.references,
			parent			: ul
		})

	// li ar_references
		const ref_length = ar_references.length
		for (let i = 0; i < ref_length; i++) {

			const reference = ar_references[i]

			// li
				const li = ui.create_dom_element({
					element_type	: 'li',
					parent			: ul
				})
			// button_link
				const button_link = ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'button link',
					parent			: li
				})
				button_link.addEventListener("click", function(e){
					e.stopPropagation()
					window.location.href = '../page/?tipo=' + reference.value.section_tipo + '&id='+ reference.value.section_id
					// window.open(url,'ref_edit')
				})
			// label
				ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'label',
					inner_html		: reference.label,
					parent			: li
				})
		}

	return fragment
}//end render_references


