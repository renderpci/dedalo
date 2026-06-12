// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {data_manager} from '../../../../common/js/data_manager.js'
	import {widget_common} from '../../../../widgets/widget_common/js/widget_common.js'
	import {area_maintenance} from '../../../../area_maintenance/js/area_maintenance.js'
	import {render_media_control} from './render_media_control.js'



/**
* MEDIA_CONTROL
* Media file access control: configuration, status and maintenance actions
*/
export const media_control = function() {

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
}//end media_control



/**
* COMMON FUNCTIONS
* extend functions from common
*/
// prototypes assign
	// lifecycle
	media_control.prototype.init		= widget_common.prototype.init
	media_control.prototype.render		= widget_common.prototype.render
	media_control.prototype.refresh		= widget_common.prototype.refresh
	media_control.prototype.destroy		= widget_common.prototype.destroy
	media_control.prototype.get_value	= area_maintenance.prototype.get_value
	// render
	media_control.prototype.edit		= render_media_control.prototype.list
	media_control.prototype.list		= render_media_control.prototype.list



/**
* BUILD
* Custom build overwrites common widget method: loads the widget value
* (configuration + runtime status) from the server.
* @param bool autoload = false
* @return bool
*/
media_control.prototype.build = async function(autoload=false) {

	const self = this

	// call generic common tool build
		const common_build = await widget_common.prototype.build.call(this, autoload);

	try {

		self.value = await self.get_value()

	} catch (error) {
		self.error = error
		console.error(error)
	}


	return common_build
}//end build



/**
* SET_MEDIA_ACCESS_MODE
* Applies a new media access mode (root user only).
* @param string value 'config'|'off'|'private'|'publication'
* @return promise - api_response
*/
media_control.prototype.set_media_access_mode = async function(value) {

	const api_response = await data_manager.request({
		use_worker	: true,
		body		: {
			dd_api			: 'dd_area_maintenance_api',
			action			: 'widget_request',
			prevent_lock	: true,
			source			: {
				type	: 'widget',
				model	: 'media_control',
				action	: 'set_media_access_mode'
			},
			options	: {
				value : value
			}
		},
		retries : 1, // one try only
		timeout : 60 * 1000 // 1 minute waiting response
	})
	if(SHOW_DEBUG===true) {
		console.log('set_media_access_mode api_response:', api_response);
	}

	return api_response
}//end set_media_access_mode



/**
* REBUILD_MEDIA_INDEX
* Full resync of the media publication markers from the publication
* databases (global admin). Can take a while on large instances.
* @return promise - api_response
*/
media_control.prototype.rebuild_media_index = async function() {

	const api_response = await data_manager.request({
		use_worker	: true,
		body		: {
			dd_api			: 'dd_area_maintenance_api',
			action			: 'widget_request',
			prevent_lock	: true,
			source			: {
				type	: 'widget',
				model	: 'media_control',
				action	: 'rebuild_media_index'
			},
			options	: {}
		},
		retries : 1, // one try only
		timeout : 3600 * 1000 // 1 hour waiting response
	})
	if(SHOW_DEBUG===true) {
		console.log('rebuild_media_index api_response:', api_response);
	}

	return api_response
}//end rebuild_media_index



// @license-end
