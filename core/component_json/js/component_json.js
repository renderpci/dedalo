// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_ROOT_WEB */
/*eslint no-undef: "error"*/



// imports
	// import {data_manager} from '../../common/js/data_manager.js'
	// import {event_manager} from '../../common/js/event_manager.js'
	import {common} from '../../common/js/common.js'
	import {clone} from '../../common/js/utils/index.js'
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
* LOAD_EDITOR_FILES
* @return bool
*/
component_json.prototype.load_editor_files = async function() {

	// load JSONEditor files if not already loaded
		if(typeof JSONEditor==='undefined'){

			// load dependencies js/css
				const load_promises = []

			// css file load
				const lib_css_file = DEDALO_ROOT_WEB + '/lib/jsoneditor/dist/jsoneditor.min.css'
				load_promises.push( common.prototype.load_style(lib_css_file) )

			// js module import
				const load_promise = import('../../../lib/jsoneditor/dist/jsoneditor.min.js') // used minified version for now
				load_promises.push( load_promise )
				//self.JSONEditor = JSONEditor

			await Promise.all(load_promises)
		}


	return true
}//end load_editor_files



/**
* SET_VALUE
* Overwrites component_common method
* @param mixed value
* @param int key = 0
* @return bool
*/
component_json.prototype.set_value = async function(value, key=0) {

	const self = this

	const editor = self.editors[key]

	await editor.set(value)

	await editor.refresh({
		build_autoload	: false,
		render_level	: 'content'
	});

	change_handler(self, value, key)

	return true
}//end set_value



/**
* CHANGE_HANDLER
* Updates component changed_data value
* @param object self
* @param mixed value
* 	JSON editor content as JSON format
* @param int key
* @return bool changed
*/
export const change_handler = function(self, value, key) {

	// change data
		const changed_data_item = Object.freeze({
			action	: 'update',
			key		: key,
			value	: value
		})

	// fix instance changed_data
		const changed = self.set_changed_data(changed_data_item)

	return changed
}//end change_handler



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

	let validated = true

	const current_value = (()=>{
		try {
			return editor.get()
		} catch (error) {
			validated = false
			editor.focus()
			console.warn(error)
		}

		return null
	})();

	// check JSON format and validate
		if (validated!==true) {

			// manual check valid value
			let v = false
			try {
				v = clone(current_value)
			}catch(e) {
				console.warn('Error. JSON value is invalid!', current_value);
			}

			if (!v) {
				// styles as error
					self.node.classList.add('error')

				alert('Error: component_json. Trying so save non validated JSON value!');
				return false
			}
		}

	// check data has really changed. If not, stop save
		const db_value 	= typeof value[0]!=="undefined" ? value[0] : null
		const changed 	= JSON.stringify(db_value)!==JSON.stringify(current_value)
		if (!changed) {
			console.log('No changes are detected. Stop save');
			return false
		}

	// changed_data
		const changed_data = [Object.freeze({
			action	: 'update',
			key		: 0,
			value	: current_value
		})]

	// save_response
		const save_response = await self.change_value({
			changed_data	: changed_data,
			refresh			: false
		})


	return save_response
}//end save_sequence



// @license-end
