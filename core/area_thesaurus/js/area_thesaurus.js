// imports
	import {common} from '../../common/js/common.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import {area_common} from '../../area_common/js/area_common.js'	
	import {render_area_thesaurus} from './render_area_thesaurus.js'
	import {search} from '../../search/js/search.js'



/**
* AREA_THESAURUS
*/
export const area_thesaurus = function() {

	this.id

	// element properties declare
	this.model
	this.type
	this.tipo
	this.section_tipo
	this.mode
	this.lang

	this.datum
	this.context
	this.data

	this.widgets

	this.node
	this.status

	this.filter = null

	this.build_options = {
		terms_are_model : false //false = the terms are descriptors terms // true = the terms are models (context model of the terms)
	}

	return true
}//end area_thesaurus



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	// area_thesaurus.prototype.init 		= area_common.prototype.init
	// area_thesaurus.prototype.build 		= area_common.prototype.build
	area_thesaurus.prototype.render 	= common.prototype.render
	area_thesaurus.prototype.refresh 	= common.prototype.refresh
	area_thesaurus.prototype.destroy 	= common.prototype.destroy
	area_thesaurus.prototype.edit 		= render_area_thesaurus.prototype.edit
	area_thesaurus.prototype.list 		= render_area_thesaurus.prototype.list



/**
* INIT
*/
area_thesaurus.prototype.init = async function(options) {

	const self = this

	// ts_object adds on
		const css_url = DEDALO_CORE_URL + "/ts_object/css/ts_object.css"
		common.prototype.load_style(css_url)

		const css_url2 = DEDALO_CORE_URL + "/area_thesaurus/css/area_thesaurus.css"
		common.prototype.load_style(css_url2)

	// call the generic commom tool init
		const common_init = area_common.prototype.init.call(this, options);

	return common_init
}//end init



/**
* BUILD
*/
area_thesaurus.prototype.build = async function(options) {

	const self = this
	
	// call the generic commom tool build
		const common_build = await area_common.prototype.build.call(this, options);

	// filter
		if (!self.filter && self.permissions>0) {
			const current_filter = new search()
			current_filter.init({
				caller : self
			})
			current_filter.build()
			self.filter = current_filter
		}

		console.log("self.data:",self.data);


	return common_build
}//end build


/**
* GET_SECTIONS_SELECTOR_DATA
*/
area_thesaurus.prototype.get_sections_selector_data = function() {
	
	const self = this

	const sections_selector_data = self.data.find(item => item.tipo === self.tipo).value
	
	return sections_selector_data
}// end get_sections_selector_data