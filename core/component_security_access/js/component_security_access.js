// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



// imports
	import {common} from '../../common/js/common.js'
	import {component_common} from '../../component_common/js/component_common.js'
	import {event_manager} from '../../common/js/event_manager.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import {render_edit_component_security_access} from './render_edit_component_security_access.js'
	import {render_list_component_security_access} from './render_list_component_security_access.js'
	import {render_search_component_security_access} from './render_search_component_security_access.js'



export const component_security_access = function() {

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

	this.worker_path
}//end component_security_access



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
	component_security_access.prototype.set_changed_data	= component_common.prototype.set_changed_data
	component_security_access.prototype.build_dd_request	= common.prototype.build_dd_request

	// render
	component_security_access.prototype.list				= render_list_component_security_access.prototype.list
	component_security_access.prototype.tm					= render_list_component_security_access.prototype.list
	component_security_access.prototype.edit				= render_edit_component_security_access.prototype.edit
	component_security_access.prototype.search				= render_search_component_security_access.prototype.search

	component_security_access.prototype.change_mode			= component_common.prototype.change_mode



/**
* INIT
* @param object options
* @return bool common_init
*/
component_security_access.prototype.init = async function(options) {

	const self = this

	// call the generic common tool init
		const common_init = await component_common.prototype.init.call(self, options);

	// check worker support. Manages get_children and get_parents expensive recursive functions mainly
		if(!window.Worker) {
			console.error('Your browser does not support web workers..');
			// throw new Error('Unable to continue. workers are needed');
		}
		self.worker_path = '../component_security_access/js/worker_security_access.js'


	return common_init
}//end  init



/**
* BUILD
* @param object options
* @return promise bool
* 	Resolve bool
*/
component_security_access.prototype.build = async function(options) {
	const t0 = performance.now()

	const self = this

	// call the generic common method
		const common_build = await component_common.prototype.build.call(self, options);

	// fill value zero on data.
	// Note that items with value 0 will not be saved in DDBB, but they will need to be added to data
	// to be processed by client interface (to propagate values)
		// const filled_value		= []
		// const data				= self.data || {}
		// const value				= data.value || []
		// const datalist			= data.datalist || []
		// const datalist_length	= datalist.length
		// for (let i = datalist_length - 1; i >= 0; i--) {

		// 	const item	= data.datalist[i]
		// 	const found	= value.find(el =>
		// 		el.tipo===item.tipo &&
		// 		el.section_tipo===item.section_tipo
		// 	)
		// 	if (found) {
		// 		filled_value.push(found)
		// 	}else{
		// 		filled_value.push({
		// 			tipo			: item.tipo,
		// 			section_tipo	: item.section_tipo,
		// 			value			: 0
		// 		})
		// 	}
		// }
		// // replace value
		// self.filled_value = filled_value

		// optimized version using map
		const data		= self.data || {};
		const datalist	= data.datalist || [];
		const value_map	= new Map(data.value?.map(item => [`${item.tipo}-${item.section_tipo}`, item]) || []);

		self.filled_value = datalist.map(item => {
			const key = `${item.tipo}-${item.section_tipo}`;
			return value_map.has(key) ? value_map.get(key) : { tipo: item.tipo, section_tipo: item.section_tipo, value: 0 };
		});

	// debug
		console.log(`__Time to build ${self.model} ${Math.round(performance.now()-t0)} ms`);


	return common_build
}//end build



/**
* UPDATE_VALUE
* Update component var self.changed_value with received value
* Note that component property 'changed_value' begins as copy of
* DB self.data.value first element (key zero)
* Will be used to save component data in a compact block
* @param object item
* 	datalist item with info about tipo, model, value as
	{
		label: "Descripción"
		model: "section_group"
		parent: "mht39"
		tipo: "mht55"
		section_tipo: "mht5"
	}
* @param int input_value
* @return array value
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

	// item check
		if (!item) {
			console.error("Ignored undefined item:", input_value);
			return value
		}

	// value . Copy of current data.value
		const value = self.filled_value
			? [...self.filled_value]
			: []

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

	// fix updated changed_value
		self.filled_value = value

	// event. publish update_item_value_xx event on change data.value
		event_manager.publish(
			'update_item_value_' + self.id + '_' + item.tipo + '_' + item.section_tipo,
			input_value
		)


	return value
}//end update_value



/**
* GET_PARENTS
* Get parents recursively from given item
* @param object item
* 	datalist item with info about tipo, model, value as
	{
		label: "Descripción"
		model: "section_group"
		parent: "mht39"
		tipo: "mht55"
		section_tipo: "mht5"
	}
* @param array|undefined datalist
* @return array parents
*/
component_security_access.prototype.get_parents = function(item, datalist) {

	const self = this

	const current_datalist = datalist || self.data.datalist

	const parents = current_datalist.filter(el =>{
		const ar_parent_set = new Set(item.ar_parent);
		return ar_parent_set.has(el.tipo);
	})


	return parents;
}//end get_parents



/**
* GET_CHILDREN
* Get datalist children recursively from given item
* @param object item
* 	datalist item with info about tipo, model, value as
	{
		label: "Descripción"
		model: "section_group"
		parent: "mht39"
		tipo: "mht55"
		section_tipo: "mht5"
	}
* @param array|undefined datalist
* @return array children
*/
component_security_access.prototype.get_children = function(item, datalist) {

	const self = this

	const current_datalist = datalist || self.data.datalist

	const children = current_datalist.filter(el => {
		const ar_parent_set = new Set(el.ar_parent);
		return ar_parent_set.has(item.tipo);
	});


	return children
}//end get_children



/**
* UPDATE_PARENTS_RADIO_BUTONS
* Check all recursive parents and get children values of each one. If
* all of children have the same value, the parent is set with this value (ex. 2)
* @param object item
* 	datalist item with info about tipo, model, value as
	{
		label: "Descripción"
		model: "section_group"
		parent: "mht39"
		tipo: "mht55"
		section_tipo: "mht5"
	}
* @param integer input_value
* @return bool diff_value
*/
component_security_access.prototype.update_parents_radio_butons = function(item, input_value) {

	const self = this

	// parents (recursive)
	const parents = self.get_parents(item)

	let diff_value = false
	// set the data of the parents and change the DOM node with update_value event
	const parents_length = parents.length
	for (let i = 0; i < parents_length; i++) {

		const current_parent = parents[i]

		// different value case
			if(diff_value===false) {

				// check values of every child finding a different value from last value found
				const current_children			= self.get_children(current_parent)
				const current_children_length	= current_children.length
				for (let k = current_children_length - 1; k >= 0; k--) {

					const child = current_children[k]

					// exclude sections and areas
					if(child.tipo===child.section_tipo) {
						continue
					}

					const data_found = self.filled_value.find(el => el.tipo===child.tipo && el.section_tipo===child.section_tipo)
					if (!data_found) {
						diff_value = true
						break
					}
					if(data_found.value!==input_value) {
						diff_value = true
						break
					}
				}
			}//end if(diff_value===false)

		// value_to_propagete
			const value_to_propagete = (diff_value===false)
				? input_value
				: null

		// parent target value update
			event_manager.publish(
				'update_area_radio_' + self.id + '_' + current_parent.tipo + '_' + current_parent.section_tipo,
				value_to_propagete
			)
	}//end for (let i = 0; i < parents_length; i++)


	return diff_value
}//end update_parents_radio_butons



/**
* SAVE_CHANGES
* Rebuild self.data.value removing empty zero values and save result
* @return promise
* 	Resolve bool|object (API response) from change_value()
*/
component_security_access.prototype.save_changes = async function() {

	const self = this

	// rebuild value removing empty zero values
		const clean_changed_value	= []
		const value_length			= self.filled_value.length
		for (let i = 0; i < value_length; i++) {
			const value_item = self.filled_value[i]
			if (value_item.value>0) {
				clean_changed_value.push(value_item)
			}
		}

	// changed_data build
	// (!) Note that action is 'set_data' instead 'insert' or 'update', to save whole array data as raw value
		const changed_data = [Object.freeze({
			action	: 'set_data',
			value	: clean_changed_value
		})]

	// change_value to save
		const result = self.change_value({
			changed_data	: changed_data,
			refresh			: false
		})


	return result
}//end save_changes



/**
* GET_CHANGES_DATA
* Get changes of the specific file, parsed to be represented
* @param string filename
* @return promise
* 	Resolve bool|object (API response) from parse_simple_schema_changes_files()
*/
component_security_access.prototype.get_changes_data = async function(filename) {

	// data_manager
	const api_response = await data_manager.request({
		use_worker	: true,
		body		: {
			dd_api	: 'dd_area_maintenance_api',
			action	: 'parse_simple_schema_changes_files',
			options	: {
				filename : filename
			}
		}
	})
	if(SHOW_DEBUG===true) {
		console.log('get_changes_data api_response:', api_response);
	}


	return api_response.result
}//end get_changes_data



// @license-end
