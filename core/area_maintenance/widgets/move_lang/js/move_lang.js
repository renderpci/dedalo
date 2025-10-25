// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {data_manager} from '../../../../common/js/data_manager.js'
	import {widget_common} from '../../../../widgets/widget_common/js/widget_common.js'
	import {render_move_lang} from './render_move_lang.js'



/**
* move_lang
*/
export const move_lang = function() {

	this.id

	this.section_tipo
	this.section_id
	this.lang
	this.mode

	this.value

	this.node

	this.events_tokens	= []
	this.ar_instances	= []

	this.status
}//end move_lang



/**
* COMMON FUNCTIONS
* extend functions from common
*/
// prototypes assign
	// lifecycle
	move_lang.prototype.init	= widget_common.prototype.init
	move_lang.prototype.build	= widget_common.prototype.build
	move_lang.prototype.render	= widget_common.prototype.render
	move_lang.prototype.destroy	= widget_common.prototype.destroy
	// render
	move_lang.prototype.edit		= render_move_lang.prototype.list
	move_lang.prototype.list		= render_move_lang.prototype.list



/**
* EXEC_move_lang
* Exec API request 'move_lang'
* @param array files_selected
* @return object response
*/
move_lang.prototype.exec_move_lang = async (files_selected) => {

	if (!files_selected.length) {
		return
	}

	// move_lang process fire
	const response = await data_manager.request({
		body : {
			dd_api			: 'dd_area_maintenance_api',
			action			: 'class_request',
			prevent_lock	: true,
			source			: {
				action	: 'move_lang',
			},
			options : {
				background_running	: true, // set run in background CLI
				files_selected		: files_selected // array e.g. ['finds_numisdata279_to_tchi1.json']
			}
		},
		retries : 1, // one try only
		timeout : 3600 * 1000 // 1 hour waiting response
	})

	return response
}//end exec_move_lang



// @license-end
