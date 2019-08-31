// imports
	import event_manager from '../../page/js/page.js'
	import {ui} from '../../common/js/ui.js'



/**
* Render_section
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
render_section.prototype.edit = async function(ar_section_record) {
	
	const self = this

	// section dom container
		const wrapper = ui.create_dom_element({
			element_type	: 'section',
			id 				: self.id,
			class_name		: self.model + ' ' + self.section_tipo + ' ' + self.mode
		})

		// elements node
			const elements = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'elements',
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
				self.filter.then(filter_wrapper =>{
					filter.appendChild(filter_wrapper)
				})
			// paginator node
				const paginator = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'paginator',
					parent 			: elements
				})

	// add all section_record rendered nodes
		const length = ar_section_record.length
		for (let i = 0; i < length; i++) {

			const child_item =  await ar_section_record[i].render()
			wrapper.appendChild(child_item)
		}

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
* LIST
* Render node for use in list
* @return DOM node
*/
render_section.prototype.list = async function(ar_section_record) {
	
	const self = this

	// section dom container
		const wrapper = ui.create_dom_element({
			element_type	: 'section',
			id 				: self.id,
			class_name		: self.model + ' ' + self.tipo + ' ' + self.mode
		})

	// list_header_node
		const list_header_node = await self.list_header()
		wrapper.appendChild(list_header_node)
	
	// add all section_record rendered nodes
		const length = ar_section_record.length
		for (let i = 0; i < length; i++) {
			const child_item =  await ar_section_record[i].render()
			wrapper.appendChild(child_item)
		}


	return wrapper
}//end list



/**
* SEARCH
* Render node for use in search
* @return DOM node
*/
render_section.prototype.search = async function(ar_section_record) {
	
	const self = this

	// section dom container
		const wrapper = ui.create_dom_element({
			element_type	: 'section',
			id 				: self.id,
			class_name		: self.model + ' ' + self.tipo + ' ' + self.mode
		})

	// search_header_node
		const search_header_node = await self.search_header()
		wrapper.appendChild(search_header_node)
	
	// add all section_record rendered nodes
		const length = ar_section_record.length
		for (let i = 0; i < length; i++) {
			const child_item =  await ar_section_record[i].render()
			wrapper.appendChild(child_item)
		}


	return wrapper
}//end search



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
		//return header_wrapper

	// hierarchize
		const ar_nodes_length = ar_nodes.length
		for (let i = 0; i < ar_nodes_length; i++) {
			const node = ar_nodes[i]
			//if (node.column_parent) {
			//	const current_parent = ar_nodes.filter(item => item.column_id===node.column_parent)[0]
			//		console.log("------current_parent:", current_parent, node.column_id, node.column_parent);			
			//	if (current_parent) current_parent.appendChild(node)
			//}else{
				header_wrapper.appendChild(node)
			//}
		}
		
	// css calculation
		Object.assign(
			header_wrapper.style, 
		  {
		    //display: 'grid',
		    //"grid-template-columns": "1fr ".repeat(ar_nodes_length),
		    "grid-template-columns": "repeat("+ar_nodes_length+", 1fr)",		   
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


