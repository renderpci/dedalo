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
	component_json.prototype.tm					= render_list_component_json.prototype.list
	component_json.prototype.edit				= render_edit_component_json.prototype.edit
	component_json.prototype.search				= render_search_component_json.prototype.search
	component_json.prototype.change_mode		= component_common.prototype.change_mode



/**
* PARSE_EDITOR_CONTENT
* Extracts JSON value from JSONEditor content format {json, text}
* @param object content - Editor content {json: unknown} | {text: string}
* @return mixed|null - Parsed JSON value or null
*/
export const parse_editor_content = function(content) {

	const json_value = content.json !== undefined
		? content.json
		: content.text === ''
			? null
			: JSON.parse(content.text)

	return json_value
}//end parse_editor_content



/**
* BUILD_CHANGED_DATA_ITEM
* Builds a frozen changed_data_item object for component_json.
* Used by edit views (via handle_json_change) and search view (directly).
* @param mixed value - The parsed JSON value
* @param int|null id - Entry id from data
* @return object changed_data_item
*/
export const build_changed_data_item = function(value, id=null) {

	const changed_data_item = Object.freeze({
		action	: 'update',
		id		: id,
		value	: { value : value }
	})

	return changed_data_item
}//end build_changed_data_item



/**
* HANDLE_JSON_CHANGE
* Common change handler for component_json across edit views.
* Parses the editor content, builds changed_data_item, and sets changed_data.
* Note: Does NOT auto-save. Use save_sequence for explicit save.
* @param object self - Component instance
* @param object content - Editor content {json, text}
* @param int key - Entry index
* @return bool - Result from set_changed_data
*/
export const handle_json_change = function(self, content, key=0) {

	// parse editor content to JSON value
		const json_value = parse_editor_content(content)

	// deep clone to make immutable
		const immutable_value = JSON.parse(JSON.stringify(json_value))

	// resolve id dynamically from self.data
		const id = self.data.entries?.[key]?.id || null

	// build changed_data_item
		const changed_data_item = build_changed_data_item(immutable_value, id)

	// fix instance changed_data
		return self.set_changed_data(changed_data_item)
}//end handle_json_change



/**
* SET_VALUE
* Overwrites component_common method
* @param mixed value
* @param int key = 0
* @return bool
*/
component_json.prototype.set_value = async function(value, key=0) {

	const self = this

	// resolve id dynamically from self.data
		const id = self.data.entries?.[key]?.id || null

	// build changed_data_item
		const changed_data_item = build_changed_data_item(value, id)

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
		const data		= self.data || {}
		const entries	= data.entries || []

	// check if the editor validate the current value
		const validate = editor.validate()

		if(typeof validate!=='undefined'){
			return false;
		}

	// get the current value and parse it using shared function
		const current_value = editor.get();
		const json_value = parse_editor_content(current_value)

	// check data has really changed. If not, stop save
		const db_value 	= typeof entries[0]!=="undefined" ? entries[0] : null
		const changed 	= JSON.stringify(db_value)!==JSON.stringify(json_value)
		if (!changed) {
			console.log('No changes are detected. Stop save');
			return false
		}

	// changed_data
		const changed_data = [build_changed_data_item(json_value, entries[0]?.id || null)]

	// save_response
		const save_response = await self.change_value({
			changed_data : changed_data,
			refresh		 : false
		})


	return save_response
}//end save_sequence



// @license-end
