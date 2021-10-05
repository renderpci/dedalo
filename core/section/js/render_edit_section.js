/*global get_label, page_globals, SHOW_DEBUG*/
/*eslint no-undef: "error"*/



// imports
	// import {data_manager} from '../../common/js/data_manager.js'
	import {clone, dd_console} from '../../common/js/utils/index.js'
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_EDIT_SECTION
* Manages the component's logic and appearance in client side
*/
export const render_edit_section = function() {

	return true
};//end render_edit_section



/**
* EDIT
* Render node for use in edit
* @return DOM node
*/
render_edit_section.prototype.edit = async function(options={render_level:'full'}) {

	const self = this

	const render_level = options.render_level

	// ar_section_record. section_record instances (initied and builded)
		const ar_section_record = self.ar_instances && self.ar_instances.length>0
			? self.ar_instances
			: await self.get_ar_instances()

	// content_data
		const content_data = await get_content_data(self, ar_section_record)
		if (render_level==='content') {
			return content_data
		}

	// buttons
		// const current_buttons = get_buttons(self);

	// paginator container node (will be placed/moved into inspector)
		const paginator_div = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'paginator'
		})
		self.paginator.build().then(()=>{
			self.paginator.render().then(paginator_wrapper =>{
				paginator_div.appendChild(paginator_wrapper)
			})
		})

	// inspector container node
		const inspector_div = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'inspector'
		})
		self.inspector.build().then(()=>{
			self.inspector.render().then(inspector_wrapper =>{
				inspector_div.appendChild(inspector_wrapper)
			})
		})

	// wrapper. ui build_edit returns component wrapper
		const wrapper =	ui.section.build_wrapper_edit(self, {
			content_data	: content_data,
			paginator_div	: paginator_div,
			inspector_div	: inspector_div
			// buttons		: current_buttons
		})

	// CSS INJECT
		// function create_new_CSS_style_sheet() {
		// 	// Create the <style> tag
		// 	let style = document.createElement("style");

		// 	// Add a media (and/or media query)
		// 	// style.setAttribute("media", "screen")
		// 	// style.setAttribute("media", "only screen and (max-width : 1024px)")

		// 	// Add the <style> element to the page
		// 	document.head.appendChild(style);

		// 	return style.sheet;
		// }//end create_new_CSS_sheet
		// const CSS_style_sheet = create_new_CSS_style_sheet()

		// // inject css from structure
		// 	const section_context 	= self.context.filter(element => element.tipo===self.section_tipo)[0]
		// 	const section_css 	  	= section_context.css
		// 	const css_selector 		= '#test_container>section.' + self.model + '.' + self.tipo + '.' + self.mode
		// 	let css_properties 		= JSON.stringify(section_css).replace(/,/g, ";")
		// 		css_properties 		= css_properties.replace(/"/g, "")

		// 	//CSS_style_sheet.insertRule( '.'+css_selector+'{display: grid;grid-template-columns: 60px repeat('+columns_length+', 1fr);}');
		// 	//CSS_style_sheet.insertRule(css_selector+"{width:50px !important}");
		// 	CSS_style_sheet.insertRule(css_selector+css_properties);

		// 	// ejemplo de conversión:
		// 		var cssjson = {
		// 	        "selector-1":{
		// 	            "property-1":"value-1",
		// 	            "property-n":"value-n"
		// 	        }
		// 	    }

		// 	    var styleStr = "";
		// 	    for(var i in cssjson){
		// 	        styleStr += i + " {\n"
		// 	        for(var j in cssjson[i]){
		// 	            styleStr += "\t" + j + ":" + cssjson[i][j] + ";\n"
		// 	        }
		// 	        styleStr += "}\n"
		// 	    }
		// 	// ejemplo de asignación directa de css
		// 		Object.assign(
		// 			document.querySelector('.my-element').style,
		// 		  {
		// 		    position: 'relative',
		// 		    color: 'blue',
		// 		    background: 'pink'
		// 		  }
		// 		)


	return wrapper
};//end edit



/**
* GET_CONTENT_DATA
* @return DOM node content_data
*/
const get_content_data = async function(self, ar_section_record) {
	const t0 = performance.now()
	
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
				// for (let i = 0; i < ar_section_record_length; i++) {
				// 	const row_item = await ar_section_record[i].render()
				// 	fragment.appendChild(row_item)
				// }

			// parallel mode
				const ar_promises = []
				for (let i = 0; i < ar_section_record_length; i++) {
					const render_promise = ar_section_record[i].render()
					ar_promises.push(render_promise)
				}
				await Promise.all(ar_promises).then(function(values) {
				  for (let i = 0; i < ar_section_record_length; i++) {
				  	fragment.appendChild(values[i])
				  }
				});
		}

	// content_data
		const content_data = document.createElement("div")
			  content_data.classList.add("content_data", self.type) // ,"nowrap","full_width"
			  content_data.appendChild(fragment)

	// debug
		if(SHOW_DEVELOPER===true) {
			// const total = (performance.now()-t0).toFixed(3)
			// dd_console(`__Time [render_edit_section.get_content_data]: ${total} ms`,'DEBUG', [ar_section_record, total/ar_section_record_length])
		}


	return content_data
};//end get_content_data



/**
* GET_BUTTONS
* @return DOM node buttons
*/
const get_buttons = function(self) {

	const buttons = []


	return buttons
};//end get_buttons



/**
* NO_RECORDS_NODE
* @return DOM node
*/
const no_records_node = () => {

	const node = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'no_records',
		inner_html		: get_label.no_records || "No records found"
	})

	return node
};//end no_records_node


