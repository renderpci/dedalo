// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {data_manager} from '../../../../common/js/data_manager.js'
	import {widget_common} from '../../../../widgets/widget_common/js/widget_common.js'
	import {render_move_locator} from './render_move_locator.js'



/**
* MOVE_locator
*/
export const move_locator = function() {

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
}//end move_locator



/**
* COMMON FUNCTIONS
* extend functions from common
*/
// prototypes assign
	// lifecycle
	move_locator.prototype.init		= widget_common.prototype.init
	move_locator.prototype.build	= widget_common.prototype.build
	move_locator.prototype.render	= widget_common.prototype.render
	move_locator.prototype.destroy	= widget_common.prototype.destroy
	// render
	move_locator.prototype.edit		= render_move_locator.prototype.list
	move_locator.prototype.list		= render_move_locator.prototype.list



/**
* EXEC_MOVE_locator
* Exec API request 'move_locator'
* @param array files_selected
* @return object response
*/
move_locator.prototype.exec_move_locator = async (files_selected) => {

	console.log('files_selected:', files_selected);

	if (!files_selected.length) {
		return
	}

	// move_locator process fire
	const response = await data_manager.request({
		body		: {
			dd_api	: 'dd_area_maintenance_api',
			action	: 'class_request',
			source	: {
				action	: 'move_locator',
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
}//end exec_move_locator



// @license-end
