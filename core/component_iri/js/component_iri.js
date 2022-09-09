/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {common} from '../../common/js/common.js'
	import {component_common} from '../../component_common/js/component_common.js'
	import {render_edit_component_iri} from '../../component_iri/js/render_edit_component_iri.js'
	import {render_list_component_iri} from '../../component_iri/js/render_list_component_iri.js'
	import {render_search_component_iri} from '../../component_iri/js/render_search_component_iri.js'
	import {output_component_iri} from '../../component_iri/js/output_component_iri.js'


export const component_iri = function(){


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

	return true
}//end component_iri



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	// lifecycle
	component_iri.prototype.init				= component_common.prototype.init
	component_iri.prototype.build				= component_common.prototype.build
	component_iri.prototype.render				= common.prototype.render
	component_iri.prototype.refresh				= common.prototype.refresh
	component_iri.prototype.destroy				= common.prototype.destroy

	// change data
	component_iri.prototype.save				= component_common.prototype.save
	component_iri.prototype.update_data_value	= component_common.prototype.update_data_value
	component_iri.prototype.update_datum		= component_common.prototype.update_datum
	component_iri.prototype.change_value		= component_common.prototype.change_value
	component_iri.prototype.set_changed_data	= component_common.prototype.set_changed_data
	component_iri.prototype.build_rqo			= common.prototype.build_rqo

	// render
	component_iri.prototype.list				= render_list_component_iri.prototype.list
	component_iri.prototype.edit				= render_edit_component_iri.prototype.edit
	component_iri.prototype.edit_in_list		= render_edit_component_iri.prototype.edit
	component_iri.prototype.search				= render_search_component_iri.prototype.search
	component_iri.prototype.change_mode			= component_common.prototype.change_mode



/**
* BUILD_VALUE
* Create a full object value from only title text or url partial values
* @param int key
* 	Key of content_value element inside content_data
* @return object|null value
*/
component_iri.prototype.build_value = function(key) {

	const self = this

	const title_value	= self.node.content_data[key].querySelector('input[type="text"]').value
	const iri_value		= self.node.content_data[key].querySelector('input[type="url"]').value

	const value = (title_value.length > 0 || iri_value.length > 0)
		? {
			iri		: iri_value,
			title	: title_value
		  }
		: null

	return value
}//end build_value
