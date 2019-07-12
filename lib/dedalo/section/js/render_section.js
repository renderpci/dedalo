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
		const wrapper = common.create_dom_element({
			element_type	: 'section',
			id 				: self.id,
			class_name		: self.model + ' ' + self.tipo + ' ' + self.mode
		})
	
	// add all section_record rendered nodes
		const length = ar_section_record.length
		for (let i = 0; i < length; i++) {
			wrapper.appendChild(ar_section_record[i].node)
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
		const wrapper = common.create_dom_element({
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
			wrapper.appendChild(ar_section_record[i].node)
		}



	return wrapper
}//end list





/**
* LIST_HEADER
* @return object component_data
*/
render_section.prototype.list_header = async function(){

	const self = this

	const components = self.context.filter(item => item.section_tipo===self.section_tipo && item.type==="component")
		
	const ar_columns = []
	const len 		 = components.length
	for (let i = 0;  i < len; i++) {
		
		const component = components[i]

		ar_columns.push({
			label 		 : component.label,
			tipo  		 : component.tipo,
			section_tipo : component.section_tipo,
			model 		 : component.model,
			parent 		 : null // set as null
		})		
			
		const sub_components = self.datum.context.filter(item => item.parent===component.tipo)
		if (sub_components.length>0) {
			sub_components.forEach(function(element) {
				ar_columns.push({
					label 		 : element.label,
					tipo  		 : element.tipo,
					section_tipo : element.section_tipo,
					parent 		 : component.tipo + "_" + component.section_tipo
				})
			})
		}		
	}
	//console.log("ar_columns:",ar_columns);

	// ar_nodes
		const ar_nodes 	 = []
		const ar_columns_length = ar_columns.length
		for (let i = 0; i < ar_columns_length; i++) {

			const column = ar_columns[i]

			const header_item = common.create_dom_element({
				element_type	: "div",
				id 				: column.tipo + "_" + column.section_tipo,
				inner_html 		: column.label
			})
			header_item.column_parent = column.parent
			ar_nodes.push(header_item)
		}
		console.log("ar_nodes:",ar_nodes);

	// header_wrapper
		const header_wrapper = common.create_dom_element({
			element_type	: "div",
			class_name		: "header_wrapper_list"
		})
		//return header_wrapper

	// hierarchize
		const ar_nodes_length = ar_nodes.length
		for (let i = 0; i < ar_nodes_length; i++) {
			const node = ar_nodes[i]
				console.log("node:",node, node.column_parent);
			if (node.column_parent) {
				const current_parent = ar_nodes.filter(item => item.id===node.column_parent)[0]				
				current_parent.appendChild(node)
			}else{
				header_wrapper.appendChild(node)
			}
		}
		

	return header_wrapper
}//end list_header



		


