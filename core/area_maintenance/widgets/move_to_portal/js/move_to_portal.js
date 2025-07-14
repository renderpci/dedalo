// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {data_manager} from '../../../../common/js/data_manager.js'
	import {widget_common} from '../../../../widgets/widget_common/js/widget_common.js'
	import {render_move_to_portal} from './render_move_to_portal.js'



/**
* MOVE_to_portal
*/
export const move_to_portal = function() {

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
}//end move_to_portal



/**
* COMMON FUNCTIONS
* extend functions from common
*/
// prototypes assign
	// lifecycle
	move_to_portal.prototype.init		= widget_common.prototype.init
	move_to_portal.prototype.build	= widget_common.prototype.build
	move_to_portal.prototype.render	= widget_common.prototype.render
	move_to_portal.prototype.destroy	= widget_common.prototype.destroy
	// render
	move_to_portal.prototype.edit		= render_move_to_portal.prototype.list
	move_to_portal.prototype.list		= render_move_to_portal.prototype.list



/**
* EXEC_MOVE_to_portal
* Exec API request 'move_to_portal'
* @param array files_selected
* @return object response
*/
move_to_portal.prototype.exec_move_to_portal = async (files_selected) => {

	if (!files_selected.length) {
		return
	}

	// move_to_portal process fire
	const response = await data_manager.request({
		body : {
			dd_api			: 'dd_area_maintenance_api',
			action			: 'class_request',
			prevent_lock	: true,
			source			: {
				action	: 'move_to_portal',
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
}//end exec_move_to_portal



// @license-end
