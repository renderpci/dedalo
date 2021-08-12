/*global get_label, page_globals, SHOW_DEBUG*/
/*eslint no-undef: "error"*/



// imports
	// import {data_manager} from '../../common/js/data_manager.js'
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_LIST_SECTION
* Manages the component's logic and appearance in client side
*/
export const render_list_section = function() {

	return true
};//end render_list_section



/**
* GET_CONTENT_DATA
* @return DOM node content_data
*/
const get_content_data = async function(self) {

	// section_record instances (initied and builded)
	const ar_section_record = await self.get_ar_instances()
	
	const fragment = new DocumentFragment()

	// add all section_record rendered nodes
		const ar_section_record_length = ar_section_record.length
		if (ar_section_record_length===0) {
			// no records found case
			const row_item = no_records_node()
			fragment.appendChild(row_item)
		}else{
			// rows

			// sequential mode
				for (let i = 0; i < ar_section_record_length; i++) {
					const row_item = await ar_section_record[i].render()
					fragment.appendChild(row_item)
				}

			// // parallel mode
			// 	const ar_promises = []
			// 	for (let i = 0; i < ar_section_record_length; i++) {
			// 		const render_promise = ar_section_record[i].render()
			// 		ar_promises.push(render_promise)
			// 	}
			// 	await Promise.all(ar_promises).then(function(values) {
			// 	  for (let i = 0; i < ar_section_record_length; i++) {
			// 	  	fragment.appendChild(values[i])
			// 	  }
			// 	});
		}

	// content_data
		const content_data = document.createElement("div")
			  content_data.classList.add("content_data", self.type) // ,"nowrap","full_width"
			  content_data.appendChild(fragment)


	return content_data
};//end get_content_data



/**
* BUTTONS
* @return DOM node buttons
*/
const buttons = function(self) {

	const ar_buttons = self.context.buttons

	if(!ar_buttons) return null;

	const fragment = new DocumentFragment()

	// buttons node
		const buttons_wrapper = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'buttons',
			parent 			: fragment
		})

		const ar_buttons_length = ar_buttons.length;

		for (var i = 0; i < ar_buttons_length; i++) {
			const current_button = ar_buttons[i]

			if(current_button.model === 'button_delete') continue

				const class_name = 'button light ' + current_button.model

			// button_new section
				const button_node = ui.create_dom_element({
					element_type	: 'button',
					class_name		: class_name,
					text_content	: current_button.label,
					parent 			: buttons_wrapper
				})
				button_node.addEventListener('click', (e) => {
					e.stopPropagation()

					switch(current_button.model){
						case 'button_new':
							event_manager.publish('new_section_' + self.id)
						break;

						case 'button_import':

							event_manager.publish('load_tool', {
								tool_context	: current_button.tools[0],
								caller			: self
							})

						break;
						default:
							event_manager.publish('click_' + current_button.model)
					}
				})
		}


	return fragment
};//end buttons



/**
* LIST
* Render node for use in list
* @return DOM node
*/
render_list_section.prototype.list = async function(options={render_level:'full'}) {

	const self = this

		console.log("self:",self);

	const render_level 		= options.render_level
	const ar_section_record = self.ar_instances

	// const row = self.get_ar_instances()

	// content_data
		const content_data = await get_content_data(self)
		if (render_level==='content') {

			self.paginator.refresh()

			return content_data
		}


	const fragment = new DocumentFragment()

	// buttons
		if (self.mode!=='tm') {

			const buttons_node = buttons(self);

			if(buttons_node){
				fragment.appendChild(buttons_node)
			}

			// search filter node
				if (self.filter) {
					const filter = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'filter',
						parent			: fragment
					})
					await self.filter.render().then(filter_wrapper =>{
						filter.appendChild(filter_wrapper)
					})
				}

		}//end if (self.mode!=='tm')

	// paginator node
		const paginator_div = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'paginator',
			parent			: fragment
		})
		self.paginator.render().then(paginator_wrapper =>{
			paginator_div.appendChild(paginator_wrapper)
		})

	// list body
		const list_body = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'list_body',
			parent			: fragment
		})

	// list_header_node
		if (self.ar_instances.length>0) {
			const list_header_node = await self.list_header()

			Object.assign(
				list_body.style,
				{
					//display: 'grid',
					//"grid-template-columns": "1fr ".repeat(ar_nodes_length),
					"grid-template-columns": self.id_column_width + " repeat("+(list_header_node.children.length-1)+", 1fr)",
				}
			)
			list_body.appendChild(list_header_node)
		}

	// content_data append
		list_body.appendChild(content_data)

	// wrapper
		const wrapper = ui.create_dom_element({
			element_type	: 'section',
			id				: self.id,
			//class_name		: self.model + ' ' + self.tipo + ' ' + self.mode
			class_name		: 'wrapper_' + self.type + ' ' + self.model + ' ' + self.tipo + ' ' + self.mode
		})
		wrapper.appendChild(fragment)


	return wrapper
};//end list



/**
* LIST_TM
* Render node for use in list_tm
* @return DOM node
*/
// render_list_section.prototype.list_tm = async function(options={render_level:'full'}) {

	// 	const self = this

	// 	const render_level 		= options.render_level
	// 	const ar_section_record = self.ar_instances


	// 	// content_data
	// 		const current_content_data = await content_data(self)
	// 		if (render_level==='content') {
	// 			return current_content_data
	// 		}

	// 	const fragment = new DocumentFragment()

	// 	// buttons node
	// 		const buttons = ui.create_dom_element({
	// 			element_type	: 'div',
	// 			class_name		: 'buttons',
	// 			parent 			: fragment
	// 		})

	// 	// filter node
	// 		const filter = ui.create_dom_element({
	// 			element_type	: 'div',
	// 			class_name		: 'filter',
	// 			parent 			: fragment
	// 		})
	// 		await self.filter.render().then(filter_wrapper =>{
	// 			filter.appendChild(filter_wrapper)
	// 		})

	// 	// paginator node
	// 		const paginator = ui.create_dom_element({
	// 			element_type	: 'div',
	// 			class_name		: 'paginator',
	// 			parent 			: fragment
	// 		})
	// 		self.paginator.render().then(paginator_wrapper =>{
	// 			paginator.appendChild(paginator_wrapper)
	// 		})

	// 	// list_header_node
	// 		const list_header_node = await self.list_header()
	// 		fragment.appendChild(list_header_node)

	// 	// content_data append
	// 		fragment.appendChild(current_content_data)


	// 	// wrapper
	// 		const wrapper = ui.create_dom_element({
	// 			element_type	: 'section',
	// 			id 				: self.id,
	// 			//class_name		: self.model + ' ' + self.tipo + ' ' + self.mode
	// 			class_name 		: 'wrapper_' + self.type + ' ' + self.model + ' ' + self.tipo + ' ' + self.mode
	// 		})
	// 		wrapper.appendChild(fragment)


	// 	return wrapper
// };//end list_tm



/**
* LIST_HEADER
* @return object component_data
*/
render_list_section.prototype.list_header = async function(){

	const self = this

	const columns = await self.columns

	const ar_nodes			= []
	const columns_length	= columns.length
	for (let i = 0;  i < columns_length; i++) {

		const component = columns[i][0]

		if (!component) {
			console.warn("ignored empty component: [key, columns]", i, columns);
			continue;
		}

		const label = []

		const current_label = SHOW_DEBUG
			? component.label + " [" + component.tipo + "]"
			: component.label
		label.push(current_label)
	
		// node header_item
			const id			=  component.tipo + "_" + component.section_tipo +  "_"+ component.parent
			const header_item	= ui.create_dom_element({
				element_type	: "div",
				id				: id,
				inner_html		: label.join('')
			})

			ar_nodes.push(header_item)
	}

	// header_wrapper
		const header_wrapper = ui.create_dom_element({
			element_type	: "div",
			class_name		: "header_wrapper_list"
		})

		const searchParams = new URLSearchParams(window.location.href);
		const initiator = searchParams.has("initiator")
			? searchParams.get("initiator")
			: false

		if (initiator!==false) {
			header_wrapper.classList.add('with_initiator')
		}else if (SHOW_DEBUG===true) {
			header_wrapper.classList.add('with_debug_info_bar')
		}

	// id column
		const id_column = ui.create_dom_element({
			element_type	: "div",
			text_content 	: "ID",
			parent 			: header_wrapper
		})

	// columns append
		const ar_nodes_length = ar_nodes.length
		for (let i = 0; i < ar_nodes_length; i++) {
			header_wrapper.appendChild(ar_nodes[i])
		}

	// css calculation
		// Object.assign(
		// 	header_wrapper.style,
		// 	{
		// 		//display: 'grid',
		// 		//"grid-template-columns": "1fr ".repeat(ar_nodes_length),
		// 		"grid-template-columns": self.id_column_width + " repeat("+(ar_nodes_length)+", 1fr)",
		// 	}
		// )

	return header_wrapper
};//end list_header



/**
* NO_RECORDS_NODE
* @return DOM node
*/
const no_records_node = () => {

	const node = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'no_records',
		inner_html		: get_label["no_records"] || "No records found"
	})

	return node
};//end no_records_node


