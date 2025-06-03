// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {common} from '../../common/js/common.js'
	import {component_common} from '../../component_common/js/component_common.js'
	import {dd_request_idle_callback} from '../../common/js/events.js'
	import {render_edit_component_iri} from '../../component_iri/js/render_edit_component_iri.js'
	import {render_list_component_iri} from '../../component_iri/js/render_list_component_iri.js'
	import {render_search_component_iri} from '../../component_iri/js/render_search_component_iri.js'



export const component_iri = function() {

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

	// ui
	this.minimum_width_px = 135 // integer pixels

	// search config
	this.q_split = true
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
	component_iri.prototype.tm					= render_list_component_iri.prototype.list
	component_iri.prototype.edit				= render_edit_component_iri.prototype.edit
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



/**
* CHANGE_HANDLER
* Store current value in self.data.changed_data
* deactivate() event is listen to the changed data of the instance
* If key pressed is 'Enter', deactivate will force to save the value
* @param int key
* @param object self
* @return bool
*/
component_iri.prototype.change_handler = function(key, current_value) {

	const self = this

	// change data
		const changed_data_item = Object.freeze({
			action	: 'update',
			key		: key,
			value	: current_value // full object value as {title: xx, uri: xxx}
		})

	// fix instance changed_data
		self.set_changed_data(changed_data_item)


	return true
}//end change_handler



/**
* FOCUS_FIRST_INPUT
* Overwrites default behavior set in ui.component.activate
* @return bool
*/
component_iri.prototype.focus_first_input = function() {

	const self = this

	// title_input
		const title_input = self.node.content_data && self.node.content_data[0]
			? self.node.content_data[0].querySelector('.input_value.title')
			: null;
		if (title_input && document.activeElement === title_input) {
			return false
		}

	// url_input
		const url_input = self.node.content_data && self.node.content_data[0]
			? self.node.content_data[0].querySelector('.input_value.url')
			: null;
		if (url_input) {
			dd_request_idle_callback(
				() => {
					if (self.active && url_input !== document.activeElement) {

						// check another focus elements like q_operator
						if (document.activeElement && document.activeElement.classList.contains('q_operator')) {
							return
						}

						url_input.focus()
					}
				}
			)
		}


	return true
}//end focus_first_input



/**
* CHECK_IRI_VALUE
* Verifies if the given URI is valid
* @param string input_iri_value
* @return bool
*/
component_iri.prototype.check_iri_value = function( input_iri_value ) {

	// First check the input string with a strict regex before passing to URL
	const strict_pattern = /^https?:\/\/([a-zA-Z0-9\-._~%]+)(:[0-9]+)?(\/.*)?$/i;
	if (!strict_pattern.test(input_iri_value)) {
		return false;
	}

	try {
		const uri = new URL(input_iri_value);

		// Must use http or https
		if (!['http:', 'https:'].includes(uri.protocol)) {
			return false;
		}

		// Hostname sanity: prevent multiple dots in a row
		if (!/^[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)*$/.test(uri.hostname)) {
			return false;
		}

		return true;
	} catch (err) {
		return false;
	}
}//end check_iri_value



// @license-end
