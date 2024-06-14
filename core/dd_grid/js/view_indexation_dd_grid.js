// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {paginator} from '../../paginator/js/paginator.js'
	import {object_to_url_vars, open_window} from '../../common/js/utils/index.js'
	import {ui} from '../../common/js/ui.js'
	import {
		get_av_column,
		get_img_column,
		get_label_column,
		get_json_column,
		get_iri_column
	} from './render_list_dd_grid.js'



/**
* VIEW_INDEXATION_DD_GRID
* Manage the components logic and appearance in client side
*/
export const view_indexation_dd_grid = function() {

	return true
}//end view_indexation_dd_grid



/**
* RENDER
* Render node for use in this view
* @param object self
* @param object options
* @return HTMLElement wrapper
*/
view_indexation_dd_grid.render = async function(self, options) {

	// options
		const render_level = options.render_level || 'full'

	// data
		const data = self.data || []

	// content_data
		const grid = get_grid_nodes( data )
		const content_data = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_data'
		})
		content_data.appendChild(grid)

		if (render_level==='content') {
			return content_data
		}

	// top container
		const top_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'top_container'
		})

	// paginator
		const paginator_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'paginator_container'
		})
		init_paginator(self)
		.then(async function(response){
			const paginator_node = await self.paginator.render()
			paginator_container.appendChild(paginator_node)
		})

	// filter_section
		const filter_section_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'filter_section_container'
		})
		get_filter_section(self, filter_section_container)
		.then(function(filter_section_node){
			filter_section_container.appendChild(filter_section_node)
		})
		// top_container append items in proper order
		top_container.appendChild(filter_section_container)
		top_container.appendChild(paginator_container)

	// wrapper
		const wrapper = ui.create_dom_element({
			element_type	: 'div',
			class_name		: `wrapper_dd_grid ${self.tipo} ${self.mode} view_${self.view}`
		})

	// wrapper append nodes
		wrapper.appendChild(top_container)
		wrapper.appendChild(content_data)
		// set pointers
		wrapper.content_data = content_data


	return wrapper
}//end render



/**
* GET_GRID_NODES
* (!) Note that data comes from server class indexation_grid->build_indexation_grid()
* @param array data
* @return DocumentFragment
*/
const get_grid_nodes = function(data) {

	const fragment = new DocumentFragment()

	const data_len = data.length
	for (let i = 0; i < data_len; i++) {

		const current_data = data[i]

		const cell_nodes = []
		if (current_data && current_data.type) {

			const node = get_div_container(current_data)

			// label
				if(current_data.type==='column' && current_data.render_label){
					const label_node = get_label_column(current_data)
					node.appendChild(label_node)
				}

			// column
				if(current_data.type==='column' && current_data.cell_type){

					switch(current_data.cell_type) {
						case 'av':
							node.appendChild(
								get_av_column(current_data)
							)
							break;

						case 'img':
							node.appendChild(
								get_img_column(current_data)
							)
							break;

						case 'iri':
							node.appendChild(
								get_iri_column(current_data)
							)
							break;

						case 'button':
							node.appendChild(
								get_button_column(current_data)
							)
							break;

						case 'json':
							node.appendChild(
								get_json_column(current_data)
							)
							break;

						case 'section_id':
							node.appendChild(
								get_section_id_column(current_data)
							)
							break;

						case 'record_link':
							node.appendChild(
								get_record_link_column(current_data)
							)
							break;

						case 'text':
						default:
							node.appendChild(
								get_text_column(
									current_data,
									true // bool use fallback value
								)
							)
							break;
					}//end switch(current_data.cell_type)
				}// end if(current_data.type==='column' && current_data.cell_type)

			// value
				if(current_data.value){
					const child_node = get_grid_nodes(current_data.value)
					node.appendChild(child_node)
				}

			cell_nodes.push(node)
		}else{
			continue;
		}

		// add cell_nodes (array of one value)
		fragment.appendChild(...cell_nodes)
	}//end for (let i = 0; i < data_len; i++)


	return fragment
}//end get_grid_nodes



/**
* GET_DIV_CONTAINER
* @param object current_data
* @return HTMLElement div_container
*/
const get_div_container = function(current_data) {

	const class_list = (current_data.class_list)
		? current_data.type + ' ' + current_data.class_list
		: current_data.type

	const div_container = ui.create_dom_element({
		element_type	: 'div',
		class_name		: class_list
	})

	// --base_color. Is set only to div_container scope.
	// Value comes from section properties and is set to dd_grid
	// when section_grid is build (server side)
		if (current_data.features && current_data.features.color) {
			div_container.style.cssText = "--base_color: " + current_data.features.color
		}


	return div_container
}//end get_div_container



/**
* GET_BUTTON_COLUMN
* @param object current_data
* @return HTMLElement button (img)
*/
export const get_button_column = function(current_data) {

	const value			= current_data.value[0]
	const class_list	= value.class_list || ''

	// button
		const button = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'dd_grid_button',
			title			: value.label || ''
		})

	// icon
		const icon = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'icon ' + class_list, // 'icon indexation',
			parent			: button
		})
		if (value.value) {
			icon.innerHTML = value.value
		}


	// event
		if (value.action && value.action.event) {

			// sample
				// 'class_list'	=> 'button label',
				// 'action'		=> (object)[
				// 		'event'			=> 'click',
				// 		'method'		=> 'open_tool',
				// 		'module_path'	=> '../../../tools/tool_common/js/tool_common.js',
				// 		'options'		=> (object)[
				// 			'tool_name'			=> 'tool_indexation',
				// 			'section_tipo'		=> $section_tipo,
				// 			'section_id'		=> $section_id,
				// 			'component_tipo'	=> $component_tipo,
				// 			'tag_id'			=> $tag_id,
				// 			'section_top_tipo'	=> $section_top_tipo,
				// 			'section_top_id'	=> $section_top_id
				// 		]
				// ]

			button.addEventListener(value.action.event, async (e)=>{
				e.stopPropagation()

				// options
					const options			= value.action.options
					options.button_caller	= e.target

				// module
					const module = await import(value.action.module_path)

				// method
					const method_name = value.action.method

				// function exec. Try with fallback
					const fn = module[method_name] // direct exported method
							|| module.default[method_name] // fallback to default method
							|| module.default.prototype[method_name] // fallback to default prototyped method

					if (fn && typeof fn==='function') {
						console.log('-> [button_column] Executing function:', method_name);
						fn(options)
					}else{
						console.error('Unable to call method:', method_name);
					}
			})
		}


	return button
}//end get_button_column



/**
* GET_TEXT_COLUMN
* Render a span DOM node with given value
* @param object data_item
* @param bool use_fallback
* @return HTMLElement text_node (span)
*/
export const get_text_column = function(data_item, use_fallback) {

	const class_list = data_item.class_list || ''

	const value = use_fallback===true
		? (data_item.value && data_item.value[0]!==undefined ? data_item.value : data_item.fallback_value)
		: data_item.value

	const records_separator = (data_item.records_separator)
		? data_item.records_separator
		: ' | '

	const value_string = value
		? value.join(records_separator)
		: ''

	const add_style = value_string.length>0
		? ''
		: ' empty'

	const text_node = ui.create_dom_element({
		element_type	: 'span',
		class_name		: class_list + add_style,
		inner_html		: value_string
	})


	// text_fragment case. Toggle class to display overflow hidden text
		if (data_item.class_list==='text_fragment') {
			// console.log('data_item:', data_item);
			text_node.addEventListener('click', function(e) {
				e.stopPropagation()
				text_node.classList.toggle('full')
			})
		}


	return text_node
}//end get_text_column



/**
* GET_RECORD_LINK_COLUMN
* @param object current_data
* @return HTMLElement text_node (span)
*/
export const get_record_link_column = function(current_data) {

	const class_list	= current_data.class_list || ''
	const section_id	= current_data.value[0].section_id
	const section_tipo	= current_data.value[0].section_tipo

	const button_edit = ui.create_dom_element({
		element_type	: 'button',
		class_name		: 'button_edit button_view_default ' + class_list
	})
	button_edit.addEventListener('click', function(e) {
		e.stopPropagation()

		// open a new window
			const url = DEDALO_CORE_URL + '/page/?' + object_to_url_vars({
				tipo			: section_tipo,
				section_tipo	: section_tipo,
				id				: section_id,
				mode			: 'edit',
				session_save	: false, // prevent to overwrite current section session
				menu			: false
			})
			open_window({
				url		: url,
				name	: 'record_view'
			})
	})

	ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'section_id',
		inner_html		: section_id,
		parent			: button_edit
	})
	ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'button edit icon',
		parent			: button_edit
	})


	return button_edit
}//end get_record_link_column



/**
* GET_SECTION_ID_COLUMN
* @param object current_data
* @return HTMLElement section_id_node (button|span)
*/
export const get_section_id_column = function(current_data) {

	// record_link_column render
		const id = current_data.ar_columns_obj[0]?.id || null
		if (id) {

			return get_record_link_column({
				class_list : current_data.class_list,
				value : [{
					section_id		: current_data.value,
					section_tipo	: id.split('_')[0]
				}]
			})
		}

	// default plain render
		const section_id_node = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'link ' + (current_data.class_list || ''),
			title			: get_label.open || 'Open',
			inner_html		: current_data.value
		})


	return section_id_node
}//end get_section_id_column



/**
* INIT_PAGINATOR
* Init and build the paginator if it was not initiated previously
* and subscribe to paginator events, to refresh the dd_grid when the user navigate the records
* @param object self
* @return promise
*/
const init_paginator = async function(self){

	// paginator check
	if (!self.paginator) {

		// paginator_options
		const paginator_view = self.paginator_options.view
			? self.paginator_options.view
			: 'micro'

		const show_interface = self.paginator_options.show_interface
			? self.paginator_options.show_interface
			: {}

		// create new one
		self.paginator = new paginator()
		self.paginator.init({
			caller			: self,
			mode			: paginator_view,
			show_interface	: show_interface
		})
		await self.paginator.build()

		// paginator_goto_ event
			const fn_paginator_goto = function(offset) {
				self.rqo.sqo.offset = offset
				// refresh
				self.refresh()
			}//end fn_paginator_goto
			self.events_tokens.push(
				event_manager.subscribe('paginator_goto_'+self.paginator.id, fn_paginator_goto)
			)//end events push

	}else{
		// refresh existing
		self.paginator.offset = self.rqo.sqo.offset
		self.paginator.total  = self.rqo.sqo.total
	}


	return true
}//end init_paginator



/**
* GET_FILTER_SECTION
* Create the buttons as check boxes to select/deselect the calling sections rows
* Use the totals_group property to get the section, his label
* when the user change the check boxes status, refresh the content data and paginator
* @param object self
* @param HTMLElement filter_section_container
* @return DocumentFragment fragment
*/
const get_filter_section = async function (self, filter_section_container) {

	const fragment = new DocumentFragment()

	// get all sections
	const totals_group = self.totals_group || []
	const total_len = totals_group.length

	// Order by label the sections to show.
	totals_group.sort(function(a, b) {
		return a.label.localeCompare(b.label);
	});
	// subscribe the filter_section_contanier to changes in the paginator
	// block the node and all actions until the paginator is ready.
	// prevent user actions before the paginator is ready
	// if the user change the state of the section in middle of pagination refresh
	// and the new paginator is empty (less than limit)
	// previous paginator could be set erroneously.
	event_manager.subscribe('render_'+self.paginator.id, function(){
		filter_section_container.classList.remove('loading')
	})

	// create the nodes for the sections
	for (let i = 0; i < total_len; i++) {

		const current_section = totals_group[i]

		// checkbox_label
			const checkbox_label = ui.create_dom_element({
				element_type	: 'label',
				class_name		: 'label checkbox_label',
				title			: current_section.key,
				inner_html		: `${current_section.label}: ${current_section.value}`,
				parent			: fragment
			})

		// input checkbox
			const checkbox_input = ui.create_dom_element({
				element_type	: 'input',
				type			: 'checkbox',
				name			: 'checkbox_active'
			})
			checkbox_input.checked = true
			checkbox_input.key = current_section.key
			// prepend input to label
			checkbox_label.prepend(checkbox_input)

			// when the user change the checkbox refresh the content_data
			checkbox_input.addEventListener('change', function(e) {

				filter_section_container.classList.add('loading')
				self.node.content_data.classList.add('loading')

				if(checkbox_input.checked === false){
					// if the checkbox is not set remove the section_tipo of the sqo
					const new_ar_section = self.rqo.sqo.section_tipo.filter(item => item !== checkbox_input.key)
					self.rqo.sqo.section_tipo = new_ar_section
					checkbox_label.classList.add('unchecked')

				}else{
					// if the checkbox is checked add the section_tipo to the sqo
					const found = self.rqo.sqo.section_tipo.find(item => item === checkbox_input.key)
					if(!found){
						self.rqo.sqo.section_tipo.push(checkbox_input.key)
					}
					checkbox_label.classList.remove('unchecked')
				}

				// reset the offset and total to force to refresh the paginator
				self.rqo.sqo.offset = 0
				self.rqo.sqo.total = null

				self.refresh()
			})
	}//end for (let i = 0; i < total_len; i++)


	return fragment
}//end get_filter_section



// @license-end
