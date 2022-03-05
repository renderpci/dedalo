/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {common} from '../../common/js/common.js'
	import {component_common} from '../../component_common/js/component_common.js'
	// import {clone} from '../../common/js/utils/index.js'
	import {render_edit_component_security_access} from '../../component_security_access/js/render_edit_component_security_access.js'
	import {render_list_component_security_access} from '../../component_security_access/js/render_list_component_security_access.js'
	import {render_mini_component_security_access} from '../../component_security_access/js/render_mini_component_security_access.js'
	import {render_search_component_security_access} from '../../component_security_access/js/render_search_component_security_access.js'



export const component_security_access = function(){

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

	return true
};//end component_security_access



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	// lifecycle
	component_security_access.prototype.init				= component_common.prototype.init
	component_security_access.prototype.build				= component_common.prototype.build
	component_security_access.prototype.render				= common.prototype.render
	component_security_access.prototype.refresh				= common.prototype.refresh
	component_security_access.prototype.destroy				= common.prototype.destroy

	// change data
	component_security_access.prototype.save				= component_common.prototype.save
	component_security_access.prototype.update_data_value	= component_common.prototype.update_data_value
	component_security_access.prototype.update_datum		= component_common.prototype.update_datum
	component_security_access.prototype.change_value		= component_common.prototype.change_value
	component_security_access.prototype.build_dd_request	= common.prototype.build_dd_request

	// render
	component_security_access.prototype.mini				= render_mini_component_security_access.prototype.mini
	component_security_access.prototype.list				= render_list_component_security_access.prototype.list
	component_security_access.prototype.edit				= render_edit_component_security_access.prototype.edit
	component_security_access.prototype.edit_in_list		= render_edit_component_security_access.prototype.edit
	component_security_access.prototype.search				= render_search_component_security_access.prototype.search
	component_security_access.prototype.change_mode			= component_common.prototype.change_mode



/**
* UPDATE_VALUE
* Update component var self.changed_value with received value
* Note that component property 'changed_value' begins as copy of
* DB self.data.value first element (key zero)
* Will be used to save component data in a compact block
*
* @param object item
* 	datalist item with info about tipo, model, value as
	{
		label: "Descripción"
		model: "section_group"
		parent: "mht39"
		tipo: "mht55"
		section_tipo: "mht5"
		value: "2"
	}
* @param int input_value
*
* @return array changed_value
*  array of objects like:
	[
		{
			tipo: "oh1"
			section_tipo: "mht5"
			value: 3
		}
	]
*/
component_security_access.prototype.update_value = function(item, input_value) {

	const self = this

	const changed_value = self.changed_value
		? self.changed_value
		: self.data.value[0]
			? [...self.data.value[0]]
			: []

	if (!item) {
		console.warn("Ignored undefined item:", input_value);
		return changed_value
	}

	// find if already exists
	const found = changed_value.find(el => el.tipo===item.tipo && el.section_tipo===item.section_tipo)
	if (found) {
		// update
		found.value = parseInt(input_value)
	}else{
		// add
		const object_value = {
			tipo			: item.tipo,
			section_tipo	: item.section_tipo,
			// parent		: item.parent,
			value			: parseInt(input_value)
		}
		changed_value.push(object_value)
	}

	// fix changed_value
		self.changed_value = changed_value

	// console.log("changed_value:", item.tipo, item.section_tipo, changed_value);

	return changed_value
}//end update_value



/**
* SAVE_CHANGES
* @return bool true
*/
// save timer vars
// let save_timer;			// Timer identifier
// const wait_time = 600;	// Wait time in milliseconds before save
component_security_access.prototype.save_changes = async function() {

	const self = this

	// clear timer on each call to prevent multiple actions by user
	// in sort time, generating multiple saves
	// clearTimeout(save_timer);

	// wait for X ms and, if no new call is received, then process the request
	// save_timer = setTimeout(() => {

		// rebuild value removing empty zero values
			const clean_changed_value = []
			const changed_value_length = self.changed_value.length
			for (let i = 0; i < changed_value_length; i++) {
				const value_item = self.changed_value[i]
				if (value_item.value>0) {
					clean_changed_value.push(value_item)
				}
			}

		const action = typeof self.data.value[0]!=='undefined' ? 'update' : 'insert'
		const changed_data = Object.freeze({
			action	: action,
			key		: 0,
			value	: clean_changed_value
		})
		// console.log("changed_data:",changed_data);
		await self.change_value({
			changed_data	: changed_data,
			refresh			: false
		})
		.then((save_response)=>{
			console.log("save_response:",save_response);
		})

	// }, wait_time);

	return true
}//end save_changes
