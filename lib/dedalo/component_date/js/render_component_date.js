// import
	import {ui} from '../../common/js/ui.js'



/**
* Render_component
* Manages the component's logic and apperance in client side
*/
export const render_component_date = function(options) {

	this.context 			= options.context
	this.data 				= options.data

	this.tipo 				= options.tipo
	this.section_tipo		= options.section_tipo
	this.section_id			= options.section_id
	this.mode 				= options.mode
	this.lang 				= options.lang
	this.section_lang 		= options.section_lang
	this.model 				= options.model
	this.id 				= options.id

}//end render_component_date



/**
* LIST
* Render node for use in list
* @return DOM node
*/
render_component_date.prototype.list = function(options) {

	const self = this

	// Options vars 
		const context 			= self.context
		const data 				= self.data
		const node_type 		= "div"
		const node_class_name 	= this.model + "_list"
	
	// Value as string 
		const value_string = data.value.join(' | ')

	// Node create
		const node = common.create_dom_element({
			element_type	: node_type,
			class_name		: node_class_name,
			text_content 	: value_string
		})

	// Debug
		//console.log("++ context", context);
		//console.log("++ data:", data);

	return node
}//end list



/**
* EDIT
* Render node for use in edit
* @return DOM node
*/
render_component_date.prototype.edit = function(options) {
	
	const self = this
	
	// Options vars 
		const context 			= self.context
		const data 				= self.data || []
		const value 			= data.value || []
		const label 			= context.label		
		const model 			= self.model
		const mode 				= 'edit'
		const tipo 				= context.tipo
		const section_id 		= data.section_id
		const id 				= self.id || 'id is not set'
		const date_mode			= context.properties.date_mode

	// Value as string
		if (data.length > 0) {
			const value_string = value.join(' | ')
		}

	// wrapper 
		const wrapper = ui.component.build_wrapper({
			id 		: id,
			tipo 	: tipo,
			model 	: model,
			mode 	: mode
		})

	// label 
		const component_label = ui.component.build_label({			
			mode 	: mode,
			label 	: label,
			parent 	: wrapper
		})

	// content_data	
		const content_data = ui.component.build_content_data({		
			parent : wrapper
		})

	// create ul
	const ul = common.create_dom_element({
		element_type	: 'ul',		
		parent 			: content_data
	})
		
	// build date
	switch(date_mode) {

		case 'range':
			this.edit_range(value, ul)
			break;

		case 'period':
			this.edit_period(value, ul)
			break;

		case 'time':
			this.edit_time(value, ul)
			break;

		case 'date':
		default:
			this.edit_date_default(value, ul)
			break;
	}
	
	return wrapper
}//end edit


/**
* EDIT
* Render node for use in edit
* @return DOM node
*/
render_component_date.prototype.edit_range = function(value, node_parent) {
		
	const self = this

	const inputs_value = (value.length<1) ? [''] : value//self.get_dato_date(value)
	const value_length = inputs_value.length
	for (let i = 0; i < value_length; i++) {

		// create li
		const li = common.create_dom_element({
			element_type	: 'li',
			parent 			: node_parent
		})	

		// create div start
		const div_start = common.create_dom_element({
			element_type	: 'div',
			parent 			: li
		})	
		
		//$value_start = isset($valor_start[$key]) ? $valor_start[$key] : '';
		const input_start = common.create_dom_element({
			element_type	: 'input',
			type 			: 'text',
			value 			: JSON.stringify(inputs_value[i].start),
			parent 			: div_start
		})

		const image_start = common.create_dom_element({
			element_type	: 'img',
			//src 			: '../themes/default/calendar.gif',
			alt 			: '...',
			title 			: '...',
			parent 			: div_start
		})

		// create div
		const div = common.create_dom_element({
			element_type	: 'div',
			text_content	: ' <> ',
			parent 			: li
		})	

		// create div end
		const div_end = common.create_dom_element({
			element_type	: 'div',
			parent 			: li
		})	
		
		//$value_start = isset($valor_start[$key]) ? $valor_start[$key] : '';
		const input_end = common.create_dom_element({
			element_type	: 'input',
			type 			: 'text',
			value 			: JSON.stringify(inputs_value[i].end),
			parent 			: div_end
		})

		const image_end = common.create_dom_element({
			element_type	: 'img',
			//src 			: '../themes/default/calendar.gif',
			alt 			: '...',
			title 			: '...',
			parent 			: div_end
		})
		
	}							
}//end edit_range

render_component_date.prototype.edit_period = function(value, node_parent) {	

	const self = this

	const inputs_value = (value.length<1) ? [''] : value//self.get_dato_date(value)
	const value_length = inputs_value.length
	for (let i = 0; i < value_length; i++) {

		const period = inputs_value[i].period

		const year = (period) ? period.year : '' 
		const month =  (period) ? period.month : ''
		const day =  (period) ? period.day : ''
	
		const label_year = (year!=='' && year>1) ? get_label['anyos'] : get_label['anyo']
		const label_month = (month!=='' && month>1) ? get_label['meses'] : get_label['mes']
		const label_day = (day!=='' && day>1) ? get_label['dias'] : get_label['dia']	
	
		// create li
		const li = common.create_dom_element({
			element_type	: 'li',
			parent 			: node_parent
		})	
				
		// create div
		const div = common.create_dom_element({
			element_type	: 'div',
			parent 			: li
		})	

		const input_year = common.create_dom_element({
			element_type	: 'input',
			type 			: 'text',
			value 			: year,
			parent 			: div
		})

		const span_year = common.create_dom_element({
			element_type	: 'span',
			text_content	: label_year,		
			parent 			: div
		})

		const input_month = common.create_dom_element({
			element_type	: 'input',
			type 			: 'text',
			value 			: month,
			parent 			: div
		})

		const span_month = common.create_dom_element({
			element_type	: 'span',
			text_content	: label_month,		
			parent 			: div
		})

		const input_day = common.create_dom_element({
			element_type	: 'input',
			type 			: 'text',
			value 			: day,
			parent 			: div
		})

		const span_day = common.create_dom_element({
			element_type	: 'span',
			text_content	: label_day,		
			parent 			: div
		})
		
	}					
}//end edit_period

render_component_date.prototype.edit_time = function(value, node_parent) {

		const self = this

		const inputs_value = (value.length<1) ? [''] : value//self.get_dato_date(value)
		const value_length = inputs_value.length
		for (let i = 0; i < value_length; i++) {

			// create li
			const li = common.create_dom_element({
				element_type	: 'li',
				parent 			: node_parent
			})	

			// create div
			const div = common.create_dom_element({
				element_type	: 'div',
				parent 			: li
			})	
			
			//$value_start = isset($valor_start[$key]) ? $valor_start[$key] : '';
			const input = common.create_dom_element({
				element_type	: 'input',
				type 			: 'text',
				value 			: JSON.stringify(inputs_value[i]),
				parent 			: div
			})
			
		}	
}//end edit_time

render_component_date.prototype.edit_date_default = function(value, node_parent) {

		const self = this

		const inputs_value = (value.length<1) ? [''] : value//self.get_dato_date(value)
		const value_length = inputs_value.length
		for (let i = 0; i < value_length; i++) {

			// create li
			const li = common.create_dom_element({
				element_type	: 'li',
				parent 			: node_parent
			})	

			// create div
			const div = common.create_dom_element({
				element_type	: 'div',
				parent 			: li
			})	
			
			//$value_start = isset($valor_start[$key]) ? $valor_start[$key] : '';
			const input = common.create_dom_element({
				element_type	: 'input',
				type 			: 'text',
				value 			: JSON.stringify(inputs_value[i].start),
				parent 			: div
			})

			//TODO - Add code to show or hide the calendar button
			const image = common.create_dom_element({
				element_type	: 'img',
				//src 			: '../themes/default/calendar.gif',
				alt 			: '...',
				title 			: '...',
				parent 			: div
			})
			
		}							

}//end edit_date_default