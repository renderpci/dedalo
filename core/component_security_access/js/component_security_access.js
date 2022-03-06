/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {common} from '../../common/js/common.js'
	import {component_common} from '../../component_common/js/component_common.js'
	import {event_manager} from '../../common/js/event_manager.js'
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

	const value = self.data.value
			? [...self.data.value]
			: []

	if (!item) {
		console.warn("Ignored undefined item:", input_value);
		return changed_value
	}

	// find if already exists
	const found = value.find(el => el.tipo===item.tipo && el.section_tipo===item.section_tipo)
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
		value.push(object_value)
	}

	// fix changed_value
		self.data.value = value

		event_manager.publish('update_value_' + self.id + '_' + item.tipo + '_' + item.section_tipo, input_value)

	// console.log("changed_value:", item.tipo, item.section_tipo, changed_value);

	return value
}//end update_value



component_security_access.prototype.get_parents = function(item) {

	const self = this

	const ar_parents = []
	const parents = (item.model==='section' || item.model.indexOf('area')===0)
		? self.data.datalist.filter(el => el.tipo === item.parent)
		: self.data.datalist.filter(el => el.tipo === item.parent && el.section_tipo === item.section_tipo)

	if(parents){
		ar_parents.push(...parents)
		const parents_length = parents.length
		for (let i = 0; i < parents_length; i++) {
			const current_parent = parents[i]
			const recursive_parents = self.get_parents(current_parent)
			ar_parents.push(...recursive_parents)
		}
	}
	return ar_parents
}

component_security_access.prototype.get_children = function(item) {

	const self = this

	const ar_children = []
	const children = (item.model==='section' || item.model.indexOf('area')===0)
		? self.data.datalist.filter(el => el.parent === item.tipo)
		: self.data.datalist.filter(el => el.parent === item.tipo && el.section_tipo === item.section_tipo)

	if(children){
		ar_children.push(...children)
		const children_length = children.length
		for (let i = 0; i < children_length; i++) {
			const current_parent = children[i]
			const recursive_parents = self.get_children(current_parent)
			ar_children.push(...recursive_parents)
		}
	}
	return ar_children
}

component_security_access.prototype.update_parents_radio_butons = async function(item, input_value){

	const self = this

	const parents = self.get_parents(item)

	let diff_value = false
	// set the data of the parents and change the DOM node with update_value event
	const parents_length = parents.length
	for (let i = 0; i < parents_length; i++) {

		const current_parent = parents[i]

		if(diff_value===false) {
			const current_children = self.get_children(current_parent)
			const current_children_length = current_children.length
			for (let k = current_children_length - 1; k >= 0; k--) {

				const child = current_children[k]

				// exclude sections and areas
				if(child.tipo===child.section_tipo) continue

				const data_found = self.data.value.find(el => el.tipo===child.tipo && el.section_tipo===child.section_tipo)
				if (!data_found) {
					diff_value = true
					break
				}
				if(data_found.value !== input_value) {
					diff_value = true
					break
				}
			}
		}//end if(diff_value===false)

		const value_to_propagete = (diff_value===false)
			? input_value
			: null
		// parent target value update
		event_manager.publish('update_area_radio_' + self.id + '_' + current_parent.tipo + '_' + current_parent.section_tipo, value_to_propagete)
	}//end for
}


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
			const value_length = self.data.value.length
			for (let i = 0; i < value_length; i++) {
				const value_item = self.data.value[i]
				if (value_item.value>0) {
					clean_changed_value.push(value_item)
				}
			}

		const changed_data = Object.freeze({
			action	: 'set_data',
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
