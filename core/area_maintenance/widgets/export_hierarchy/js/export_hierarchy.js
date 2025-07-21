// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {widget_common} from '../../../../widgets/widget_common/js/widget_common.js'
	import {data_manager} from '../../../../common/js/data_manager.js'
	import {render_export_hierarchy} from './render_export_hierarchy.js'



/**
* EXPORT_HIERARCHY
*/
export const export_hierarchy = function() {

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
}//end export_hierarchy



/**
* COMMON FUNCTIONS
* extend functions from common
*/
// prototypes assign
	// lifecycle
	export_hierarchy.prototype.init		= widget_common.prototype.init
	export_hierarchy.prototype.build	= widget_common.prototype.build
	export_hierarchy.prototype.render	= widget_common.prototype.render
	export_hierarchy.prototype.destroy	= widget_common.prototype.destroy
	// render
	export_hierarchy.prototype.edit		= render_export_hierarchy.prototype.list
	export_hierarchy.prototype.list		= render_export_hierarchy.prototype.list



/**
* EXEC_EXPORT_HIERARCHY
* Call working API to exec the  export_hierarchy action.
* @param string section_tipo
* @return object result
*/
export_hierarchy.prototype.exec_export_hierarchy = async (section_tipo) => {

	// get value from API
	const api_response = await data_manager.request({
		use_worker	: true,
		body		: {
			dd_api			: 'dd_area_maintenance_api',
			action			: 'widget_request',
			prevent_lock	: true,
			source			: {
				type	: 'widget',
				model	: 'export_hierarchy',
				action	: 'export_hierarchy'
			},
			options : {
				section_tipo : section_tipo // string like '*' or 'es1,es2'
			}
		},
		retries : 1, // one try only
		timeout : 3600 * 1000 // 1 hour waiting response
	})
	if(SHOW_DEBUG===true) {
		console.log('))) exec_export_hierarchy export_hierarchy api_response:', api_response);
	}


	return api_response
}//end exec_export_hierarchy



/**
* sync_hierarchy_active_status
* Call working API to exec the  sync_hierarchy_active_status action.
* @return object result
*/
export_hierarchy.prototype.sync_hierarchy_active_status = async () => {

	// get value from API
	const api_response = await data_manager.request({
		use_worker	: true,
		body		: {
			dd_api			: 'dd_area_maintenance_api',
			action			: 'widget_request',
			prevent_lock	: true,
			source			: {
				type	: 'widget',
				model	: 'export_hierarchy',
				action	: 'sync_hierarchy_active_status',
			},
			options : {}
		},
		retries : 1, // one try only
		timeout : 3600 * 1000 // 1 hour waiting response
	})
	if(SHOW_DEBUG===true) {
		console.log('))) sync_hierarchy_active_status sync_hierarchy_active_status api_response:', api_response);
	}


	return api_response
}//end sync_hierarchy_active_status




// @license-end
