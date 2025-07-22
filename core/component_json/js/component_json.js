// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_ROOT_WEB */
/*eslint no-undef: "error"*/



// imports
	import {common} from '../../common/js/common.js'
	import {component_common} from '../../component_common/js/component_common.js'
	import {render_edit_component_json} from '../../component_json/js/render_edit_component_json.js'
	import {render_list_component_json} from '../../component_json/js/render_list_component_json.js'
	import {render_search_component_json} from '../../component_json/js/render_search_component_json.js'



export const component_json = function(){

	this.id					= null

	this.model				= null
	this.tipo				= null
	this.section_tipo		= null
	this.section_id			= null
	this.mode				= null
	this.lang				= null
	this.section_lang		= null

	this.context			= null
	this.data				= null

	this.parent				= null
	this.node				= null

	this.tools				= null

	this.editors			= []

	// save_on_deactivate. Prevent to auto-save value when component is deactivated
	this.save_on_deactivate	= false

	// search config
	this.q_split = true
}//end component_json



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	// lifecycle
	component_json.prototype.init				= component_common.prototype.init
	component_json.prototype.build				= component_common.prototype.build
	component_json.prototype.render				= common.prototype.render
	component_json.prototype.refresh			= common.prototype.refresh
	component_json.prototype.destroy			= common.prototype.destroy

	// change data
	component_json.prototype.save				= component_common.prototype.save
	component_json.prototype.update_data_value	= component_common.prototype.update_data_value
	component_json.prototype.update_datum		= component_common.prototype.update_datum
	component_json.prototype.change_value		= component_common.prototype.change_value
	component_json.prototype.set_changed_data	= component_common.prototype.set_changed_data
	component_json.prototype.build_rqo			= common.prototype.build_rqo

	// render
	component_json.prototype.list				= render_list_component_json.prototype.list
	component_json.prototype.tm					= render_edit_component_json.prototype.list
	component_json.prototype.edit				= render_edit_component_json.prototype.edit
	component_json.prototype.search				= render_search_component_json.prototype.search
	component_json.prototype.change_mode		= component_common.prototype.change_mode



/**
* SET_VALUE
* Overwrites component_common method
* @param mixed value
* @param int key = 0
* @return bool
*/
component_json.prototype.set_value = async function(value, key=0) {

	const self = this

	// change data
		const changed_data_item = Object.freeze({
			action	: 'update',
			key		: key,
			value	: value
		})

	// fix instance changed_data
		const changed = self.set_changed_data(changed_data_item)

	return changed
}//end set_value



/**
* SAVE_SEQUENCE
* Check if value is JSON valid and save it when true
* @param object editor
* @return object|bool
*/
component_json.prototype.save_sequence = async function(editor) {

	const self = this

	// short vars
		const data	= self.data || {}
		const value	= data.value || []


	// check if the editor validate the current value
		const validate = editor.validate()

		if(typeof validate!=='undefined'){
			return false;
		}

	// get the current value
		const current_value = editor.get();

	// current_value could be a text or a json { json: unknown } | { text: string }
	// and the text could be empty, check it before assign it as json value.
		const json_value = current_value.json !== undefined
			? current_value.json
			: current_value.text===''
				? null
				: JSON.parse( current_value.text )

	// check data has really changed. If not, stop save
		const db_value 	= typeof value[0]!=="undefined" ? value[0] : null
		const changed 	= JSON.stringify(db_value)!==JSON.stringify(json_value)
		if (!changed) {
			console.log('No changes are detected. Stop save');
			return false
		}

	// changed_data
		const changed_data = [Object.freeze({
			action	: 'update',
			key		: 0,
			value	: json_value
		})]

	// save_response
		const save_response = await self.change_value({
			changed_data	: changed_data,
			refresh			: false
		})


	return save_response
}//end save_sequence



// @license-end
