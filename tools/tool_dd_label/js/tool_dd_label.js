// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// import
	import {common} from '../../../core/common/js/common.js'
	import {tool_common} from '../../tool_common/js/tool_common.js'
	import {render_tool_dd_label} from './render_tool_dd_label.js'



/**
* TOOL_DD_LABEL
* Tool to easy create labels in different languages for tools
* (!) It's only used in section 'dd1340' component 'dd1372' (Tool labels)
*/
export const tool_dd_label = function () {

	this.id
	this.model
	this.mode
	this.node
	this.ar_instances
	this.status
	this.events_tokens
	this.type
	this.caller

	// string last value. Stringified JSON value stored to check new values before save
	this.last_value

	return true
}//end page



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	tool_dd_label.prototype.render	= tool_common.prototype.render
	tool_dd_label.prototype.destroy	= common.prototype.destroy
	tool_dd_label.prototype.refresh	= common.prototype.refresh
	tool_dd_label.prototype.build	= tool_common.prototype.build
	tool_dd_label.prototype.edit	= render_tool_dd_label.prototype.edit



/**
* INIT
* @param object options
* @return bool common_init
*/
tool_dd_label.prototype.init = async function(options) {

	const self = this

	// call the generic common tool init
		const common_init = await tool_common.prototype.init.call(this, options);

	try {

		// languages
			self.loaded_langs = page_globals.dedalo_projects_default_langs

		// editor
			const editor = self.caller?.editors?.[0];
			if (!editor) {
				throw new Error("Editor not found.");
			}

		// data.
			// Get directly from editor instead from component. This allow get the current
			// edited version even when user has not saved
			const editor_data = (function(){

				const data = editor.get()
				// editor can get json object or stringify json (it depends of process status and it can not controlled)
				const json_data	= data.json !== undefined
					? data.json
					: data.text===''
						? null
						: JSON.parse( data.text )

				return json_data
			})()

			// Ensure ar_data is always an array
			const ar_data = Array.isArray(editor_data)
				? editor_data
				: editor_data
					? [editor_data]
					: []

		// fix ar_data
			self.ar_data = ar_data

		// ar_names. Column names: Extract unique 'name' values from ar_data
			self.ar_names = [...new Set(self.ar_data.map(item => item.name))];

	} catch (error) {
		self.error = error
		console.error(error)
	}


	return common_init
}//end init



/**
* UPDATE_DATA
* Set new JSON data to JSON editor
* @return bool
*/
tool_dd_label.prototype.update_data = function() {

	const self = this

	// inmutable_value. JSON editor prefers immutable
		const inmutable_value = JSON.parse(JSON.stringify(self.ar_data))

	// not changed value case
		if (self.last_value===JSON.stringify(inmutable_value)) {
			return
		}

	// editor
		const editor = self.caller.editors[0]
		editor.set({
			json : inmutable_value
		})

	// update caller (component_json) value
		self.caller.set_value(inmutable_value, 0)

	// last value. Set to compare with new calls
		self.last_value = JSON.stringify(inmutable_value)


	return true
}//end update_data



/**
* ON_CLOSE_ACTIONS
* Executes specific action on close the tool
* @param string open_as
* 	modal|window
* @return bool
*/
tool_dd_label.prototype.on_close_actions = async function(open_as) {

	const self = this

	if (open_as==='modal') {
		// self.caller.refresh() // never refresh caller (component_json)
		self.destroy(true, true, true)
	}

	return true
}//end on_close_actions



/**
* SAVE_LABEL_LANG_SEQUENCE
* Manages the update and save values process en every content editable change
* @param string value
* 	as 'Hello'
* @param int key
* 	as 0
* @param string lang
* 	as 'lg-spa'
* @return void
*/
tool_dd_label.prototype.save_label_lang_sequence = function (value, key, lang) {

	const self = this

	// key name
	const name = self.ar_names[key]

	// data
	const data = self.ar_data.find(item => item.name===name && item.lang===lang )

	// empty value and has not previous data set
	if( !value && typeof data==='undefined' ){
		return
	}

	// empty value with previous data set
	if( !value && typeof data!=='undefined' ){

		const index = self.ar_data.findIndex( item => item.name===name && item.lang===lang )

		if(index === -1){
			return
		}

		self.ar_data.splice(index, 1)

		// update_data. Updates caller data
		// update the data into the instance, prepared to save
		// (but is not saved directly, the user need click in the save button)
		self.update_data()
		return
	}

	if(typeof data!=='undefined'){

		// update data value
		data.value = value

	}else{

		const new_data = {
			lang	: lang,
			name	: name,
			value	: value
		}
		self.ar_data.push(new_data)
	}

	// update_data. Updates caller data
	// update the data into the instance, prepared to save
	// (but is not saved directly, the user needs click the save button)
	self.update_data()
}//end save_label_lang_sequence



// @license-end
