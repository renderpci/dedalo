// imports
	import {common,create_source} from '../../common/js/common.js'
	import {component_common} from '../../component_common/js/component_common.js'
	import {render_component_input_text} from '../../component_input_text/js/render_component_input_text.js'
import {data_manager} from '../../common/js/data_manager.js'


export const component_input_text = function(){

	this.id

	// element properties declare
	this.model
	this.tipo
	this.section_tipo
	this.section_id
	this.mode
	this.lang

	this.section_lang
	this.context
	this.data
	this.parent
	this.node

	this.tools

	this.duplicates = false

	return true
}//end component_input_text



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	component_input_text.prototype.init 	 			= component_common.prototype.init
	component_input_text.prototype.build 	 			= component_common.prototype.build
	component_input_text.prototype.render 				= common.prototype.render
	component_input_text.prototype.destroy 	 			= common.prototype.destroy
	component_input_text.prototype.refresh 				= common.prototype.refresh
	component_input_text.prototype.save 	 			= component_common.prototype.save
	component_input_text.prototype.load_data 			= component_common.prototype.load_data
	component_input_text.prototype.get_value 			= component_common.prototype.get_value
	component_input_text.prototype.set_value 			= component_common.prototype.set_value
	component_input_text.prototype.update_data_value	= component_common.prototype.update_data_value
	component_input_text.prototype.update_datum 		= component_common.prototype.update_datum
	component_input_text.prototype.change_value 		= component_common.prototype.change_value

	// render
	component_input_text.prototype.list 		= render_component_input_text.prototype.list
	component_input_text.prototype.edit 		= render_component_input_text.prototype.edit
	component_input_text.prototype.edit_in_list	= render_component_input_text.prototype.edit
	component_input_text.prototype.search 		= render_component_input_text.prototype.search
	component_input_text.prototype.change_mode 	= component_common.prototype.change_mode



/**
* ACTIVE
* Custom active function triggered after ui.active has finish
*/
component_input_text.prototype.active = function() {

	//console.log("Yujuu! This is my component custom active test triggered after ui.active. id:", this.id )

	return true
}//end active



/**
* IS_UNIQUE
* Check the value of the input_text with the all values in the database
* @result bool
* result:
* 	true : unique value, it not has any record inside the section.
* 	false: the value has almost 1 record inside the database, but it is not unique.
*/
component_input_text.prototype.is_unique = async function(new_value){

	const self = this

	if (new_value.length<1) return false

	const unique_config = self.context.properties.unique

	// search item rebuild filter q param and others
		const sqo = self.sqo_context.search.find(item => item.typo==='sqo')
		// set limit on sqo
		sqo.limit = 1
		// set skip_projects_filter as true
		sqo.skip_projects_filter = true

		const filter = sqo.filter['$and']

		// filter item (expected one, under '$and' operator)
			const filter_item = filter[0]
			// add received value to filter
			filter_item.q = "=" + new_value
			// set the split words by spaces to false
			filter_item.q_split = false

		// exclude self record of search once
			if (filter.length===1) {
				const new_item_filter = {
					q 	 : '!=' + self.section_id,
					path : [
						{
							component_tipo  : 'section_id',
							modelo 			: 'component_section_id',
							name 			: 'Dummy section id',
							section_tipo 	: [self.section_tipo]
						}
					]
				}
				filter.push(new_item_filter)
			}

			//console.log("filter_item:",filter_item);
			//console.log("new_item_filter:",new_item_filter);
			console.log("sqo:",sqo);

	// add self context as the unique ddo
		//self.sqo_context.search.push(self.context)

	// load data
		const current_data_manager 	= new data_manager()
		const api_response 			= await current_data_manager.section_load_data(self.sqo_context.search)
		const data 					= api_response.result.data

	// record data results from search
		const record = data.find(item => item.tipo===self.tipo)

	// result. If results are found, value is NOT unique
		//const result = (typeof record==="undefined") ? true : false

		if(SHOW_DEBUG===true) {
			console.log("+++++ is_unique api_response data:",data, record);
		}

	return record
}//end is_unique



