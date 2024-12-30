// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {data_manager} from '../../../../common/js/data_manager.js'
	import {widget_common} from '../../../../widgets/widget_common/js/widget_common.js'
	import {render_move_tld} from './render_move_tld.js'



/**
* MOVE_TLD
*/
export const move_tld = function() {

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
}//end move_tld



/**
* COMMON FUNCTIONS
* extend functions from common
*/
// prototypes assign
	// lifecycle
	move_tld.prototype.init		= widget_common.prototype.init
	move_tld.prototype.build	= widget_common.prototype.build
	move_tld.prototype.render	= widget_common.prototype.render
	move_tld.prototype.destroy	= widget_common.prototype.destroy
	// render
	move_tld.prototype.edit		= render_move_tld.prototype.list
	move_tld.prototype.list		= render_move_tld.prototype.list



/**
* EXEC_MOVE_TLD
* Exec API request 'move_tld'
* @param array files_selected
* @return object response
*/
move_tld.prototype.exec_move_tld = async (files_selected) => {

	console.log('files_selected:', files_selected);

	if (!files_selected.length) {
		return
	}

	// move_tld process fire
	const response = await data_manager.request({
		body		: {
			dd_api	: 'dd_area_maintenance_api',
			action	: 'class_request',
			source	: {
				action	: 'move_tld',
			},
			options : {
				background_running	: true, // set run in background CLI
				files_selected		: files_selected // array e.g. ['finds_numisdata279_to_tchi1.json']
			}
		}
	})

	return response
}//end exec_move_tld



// @license-end
