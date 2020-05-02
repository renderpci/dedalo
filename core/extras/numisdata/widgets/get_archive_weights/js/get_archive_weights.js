/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {data_manager} from '../../common/js/data_manager.js'
	// import {common,create_source} from '../../common/js/common.js'
	import {render_get_archive_weights} from '../../get_archive_weights/js/render_get_archive_weights.js'



export const get_archive_weights = function(){

	this.id

	this.section_tipo
	this.section_id
	this.lang
	this.value
	this.node

	return true
}//end get_archive_weights



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	// lifecycle
	// get_archive_weights.prototype.init 	 			= component_common.prototype.init
	// get_archive_weights.prototype.build 	 			= component_common.prototype.build
	get_archive_weights.prototype.render 				= common.prototype.render
	// get_archive_weights.prototype.refresh 			= common.prototype.refresh
	// get_archive_weights.prototype.destroy 	 		= common.prototype.destroy

	// // change data
	// get_archive_weights.prototype.save 	 			= component_common.prototype.save
	// get_archive_weights.prototype.update_data_value	= component_common.prototype.update_data_value
	// get_archive_weights.prototype.update_datum 		= component_common.prototype.update_datum
	// get_archive_weights.prototype.change_value 		= component_common.prototype.change_value

	// render
	get_archive_weights.prototype.list 					= render_get_archive_weights.prototype.list
	get_archive_weights.prototype.edit 					= render_get_archive_weights.prototype.edit
	// get_archive_weights.prototype.edit_in_list		= render_get_archive_weights.prototype.edit
	// get_archive_weights.prototype.tm					= render_get_archive_weights.prototype.edit
	// get_archive_weights.prototype.search 			= render_get_archive_weights.prototype.search
	// get_archive_weights.prototype.change_mode 		= component_common.prototype.change_mode



/**
* ACTIVE
* Custom active function triggered after ui.active has finish
*/
get_archive_weights.prototype.active = function() {

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
get_archive_weights.prototype.is_unique = async function(new_value){

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
			// console.log("sqo:",sqo);

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
