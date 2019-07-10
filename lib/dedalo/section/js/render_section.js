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
render_section.prototype.edit = function(ar_section_record) {
	
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
render_section.prototype.list = render_section.prototype.edit


