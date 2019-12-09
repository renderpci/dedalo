/*global get_label, page_globals, SHOW_DEBUG*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_SECTION
* Manages the component's logic and apperance in client side
*/
export const render_section = function() {

	return true
}//end render_section



/**
* EDIT
* Render node for use in edit
* @return DOM node
*/
render_section.prototype.edit = async function(options={render_level:'full'}) {

	const self = this

	const render_level = options.render_level

	// content_data
		const current_content_data = await content_data(self)
		if (render_level==='content') {
			return current_content_data
		}

	// buttons
		//const current_buttons = await buttons(self);

	// wrapper. ui build_edit returns component wrapper
		const wrapper =	ui.section.build_wrapper_edit(self, {
			content_data : current_content_data,
			//buttons 	 : current_buttons
		})

	// inspector node
		//const inspector = ui.create_dom_element({
		//	element_type	: 'div',
		//	class_name		: 'inspector',
		//	parent 			: wrapper
		//})
		//self.inspector.render().then(inspector_wrapper =>{
		//	inspector.appendChild(inspector_wrapper)
		//})


	/*
		// wrapper . section dom container
			const wrapper = ui.create_dom_element({
				element_type	: 'section',
				id 				: self.id,
				class_name		: self.model + ' ' + self.section_tipo + ' ' + self.mode
			})

		// elements node
			const elements = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'elements full_width',
				parent 			: wrapper
			})
			// buttons node
				const buttons = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'buttons',
					parent 			: elements
				})

			// filter node
				const filter = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'filter',
					parent 			: elements
				})
				await self.filter.render().then(filter_wrapper =>{
					filter.appendChild(filter_wrapper)
				})
			// paginator node
				const paginator = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'paginator',
					parent 			: elements
				})
				self.paginator.render().then(paginator_wrapper =>{
					paginator.appendChild(paginator_wrapper)
				})

		// content_data append
			wrapper.appendChild(current_content_data)
		*/

	/*
		function create_new_CSS_style_sheet() {
			// Create the <style> tag
			let style = document.createElement("style");

			// Add a media (and/or media query)
			// style.setAttribute("media", "screen")
			// style.setAttribute("media", "only screen and (max-width : 1024px)")

			// Add the <style> element to the page
			document.head.appendChild(style);

			return style.sheet;
		}//end create_new_CSS_sheet
		const CSS_style_sheet = create_new_CSS_style_sheet()

		// inject css from structure
			const section_context 	= self.context.filter(element => element.tipo===self.section_tipo)[0]
			const section_css 	  	= section_context.css
			const css_selector 		= '#test_container>section.' + self.model + '.' + self.tipo + '.' + self.mode
			let css_properties 		= JSON.stringify(section_css).replace(/,/g, ";")
				css_properties 		= css_properties.replace(/"/g, "")

			//CSS_style_sheet.insertRule( '.'+css_selector+'{display: grid;grid-template-columns: 60px repeat('+columns_length+', 1fr);}');
			//CSS_style_sheet.insertRule(css_selector+"{width:50px !important}");
			CSS_style_sheet.insertRule(css_selector+css_properties);

			// ejemplo de conversión:
				var cssjson = {
			        "selector-1":{
			            "property-1":"value-1",
			            "property-n":"value-n"
			        }
			    }

			    var styleStr = "";
			    for(var i in cssjson){
			        styleStr += i + " {\n"
			        for(var j in cssjson[i]){
			            styleStr += "\t" + j + ":" + cssjson[i][j] + ";\n"
			        }
			        styleStr += "}\n"
			    }
			// ejemplo de asignación directa de css
				Object.assign(
					document.querySelector('.my-element').style,
				  {
				    position: 'relative',
				    color: 'blue',
				    background: 'pink'
				  }
				)
		*/


	return wrapper
}//end edit



/**
* CONTENT_DATA
* @return DOM node content_data
*/
const content_data = async function(self) {

	const ar_section_record = await self.get_ar_instances()

	// content_data
		const content_data = document.createElement("div")
			  content_data.classList.add("content_data") // ,"nowrap","full_width"


	const fragment = new DocumentFragment()

	// add all section_record rendered nodes
		const ar_section_record_length = ar_section_record.length
		if (ar_section_record_length===0) {
			const row_item = no_records_node()
			fragment.appendChild(row_item)
		}else{
			// rows
			for (let i = 0; i < ar_section_record_length; i++) {
				const row_item = await ar_section_record[i].render()
				fragment.appendChild(row_item)
			}
		}

	content_data.appendChild(fragment)

	return content_data
}//end content_data



/**
* BUTTONS
* @return DOM node buttons
*/
const buttons = async function(self) {

	const buttons = []

	// button register tools
		const button_register_tools = ui.button.build_button({
			class_name 	: "button_register",
			label 		: "Register tools"
		})
		button_register_tools.addEventListener('mouseup', async (e) => {
			e.stopPropagation()
			//alert("Click here! ")

			// data_manager
			const api_response = await data_manager.prototype.request({
				body : {
					action 		: 'trigger',
					class_name 	: 'ontology',
					method 		: 'import_tools',
					options 	: {}
				}
			})
			console.log("+++ api_response:",api_response);
		})
		buttons.push(button_register_tools)

	return buttons
}//end buttons



/**
* LIST
* Render node for use in list
* @return DOM node
*/
render_section.prototype.list = async function(options={render_level:'full'}) {

	const self = this

	const render_level 		= options.render_level
	const ar_section_record = self.ar_instances


	// content_data
		const current_content_data = await content_data(self)
		if (render_level==='content') {
			return current_content_data
		}

	// section dom container
		const wrapper = ui.create_dom_element({
			element_type	: 'section',
			id 				: self.id,
			//class_name		: self.model + ' ' + self.tipo + ' ' + self.mode
			class_name 		: 'wrapper_' + self.type + ' ' + self.model + ' ' + self.tipo + ' ' + self.mode
		})

	// buttons node
		const buttons = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'buttons',
			parent 			: wrapper
		})

	// filter node
		const filter = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'filter',
			parent 			: wrapper
		})
		await self.filter.render().then(filter_wrapper =>{
			filter.appendChild(filter_wrapper)
		})

	// paginator node
		const paginator = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'paginator',
			parent 			: wrapper
		})
		self.paginator.render().then(paginator_wrapper =>{
			paginator.appendChild(paginator_wrapper)
		})

	// list_header_node
		const list_header_node = await self.list_header()
		wrapper.appendChild(list_header_node)

	// content_data append
		wrapper.appendChild(current_content_data)


	return wrapper
}//end list



/**
* LIST_HEADER
* @return object component_data
*/
render_section.prototype.list_header = async function(){

	const self = this

	const components = self.context.filter(item => item.section_tipo===self.section_tipo && item.type==="component")

	const ar_nodes	 = []
	const len 		 = components.length
	for (let i = 0;  i < len; i++) {

		const component = components[i]

		breakdown_header_items(component, self.datum, ar_nodes, null)

		// const sub_components = self.datum.context.filter(item => item.parent===component.tipo)
 		// if (sub_components.length>0) {
 		// 	sub_components.forEach(function(element) {
		//
 		// 		// node header_item
 		// 			const header_item = ui.create_dom_element({
 		// 				element_type	: "div",
 		// 				id 				: element.tipo + "_" + element.section_tipo,
 		// 				inner_html 		: component.label +" - "+ element.label
 		// 			})
 		// 			//header_item.column_parent 	= component.tipo
 		// 			//header_item.column_id 		= element.tipo
 		// 			ar_nodes.push(header_item)
 		// 	})
 		//
 		// }else{
		//
		// 	// node header_item
		// 		const header_item = ui.create_dom_element({
		// 			element_type	: "div",
		// 			id 				: component.tipo + "_" + component.section_tipo,
		// 			inner_html 		: component.label
		// 		})
		// 		//header_item.column_parent 	= null
		// 		//header_item.column_id 		= component.tipo
		// 		ar_nodes.push(header_item)
		// // }
	}

	// header_wrapper
		const header_wrapper = ui.create_dom_element({
			element_type	: "div",
			class_name		: "header_wrapper_list"
		})

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
		Object.assign(
			header_wrapper.style,
		  {
		    //display: 'grid',
		    //"grid-template-columns": "1fr ".repeat(ar_nodes_length),
		    "grid-template-columns": "repeat("+(ar_nodes_length + 1)+", 1fr)",
		  }
		)

	return header_wrapper
}//end list_header



/**
* BREAKDOWN_HEADER_ITEMS
* @return array ar_nodes
*/
const breakdown_header_items = function(component, datum, ar_nodes, parent){

	const sub_components = datum.context.filter(item => item.parent===component.tipo)

	if (sub_components.length>0) {
		sub_components.forEach(function(element) {
			// recursion
			breakdown_header_items(element, datum, ar_nodes, component)
		})

	}else{

		// node header_item
			const header_item = ui.create_dom_element({
				element_type	: "div",
				id 				: component.tipo + "_" + component.section_tipo,
				inner_html 		: (parent) ? parent.label + "<br>" + component.label : component.label
			})
			//header_item.column_parent 	= null
			//header_item.column_id 		= component.tipo

			ar_nodes.push(header_item)
	}

	return ar_nodes
}//end breakdown_header_items



/**
* NO_RECORDS_NODE
*/
const no_records_node = () => {

	const node = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'no_records',
		inner_html 		: get_label["no_records"] || "No records found"
	})

	return node
}//end no_records_node



