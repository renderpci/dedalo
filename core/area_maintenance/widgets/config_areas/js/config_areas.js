// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global SHOW_DEBUG */
/*eslint no-undef: "error"*/



/**
* CONFIG_AREAS
* Controller half of the config_areas maintenance widget. Lets an admin toggle each
* area/section allowed or denied; Save persists areas.deny/areas.allow to
* ../private/config.local.php on the server.
*
* Server counterpart: core/area_maintenance/widgets/config_areas/class.config_areas.php
*   API_ACTIONS: 'save_config_areas'
* DOM rendering delegated to render_config_areas.js.
*/



// imports
	import {widget_common} from '../../../../widgets/widget_common/js/widget_common.js'
	import {area_maintenance} from '../../../../area_maintenance/js/area_maintenance.js'
	import {data_manager} from '../../../../common/js/data_manager.js'
	import {event_manager} from '../../../../common/js/event_manager.js'
	import {render_config_areas} from './render_config_areas.js'



/**
* CONFIG_AREAS
* Constructor. Properties populated by the standard widget lifecycle (init→build→render).
*/
export const config_areas = function() {

	this.id				= null

	this.section_tipo	= null
	this.section_id		= null
	this.lang			= null
	this.mode			= null

	this.value			= null

	this.node			= null

	this.events_tokens	= []
	this.ar_instances	= []

	this.status			= null
}//end config_areas



// prototypes assign
	// lifecycle
	config_areas.prototype.init		= widget_common.prototype.init
	config_areas.prototype.build	= widget_common.prototype.build
	config_areas.prototype.render	= widget_common.prototype.render
	config_areas.prototype.destroy	= widget_common.prototype.destroy
	config_areas.prototype.get_value = area_maintenance.prototype.get_value
	// render
	config_areas.prototype.edit		= render_config_areas.prototype.list
	config_areas.prototype.list		= render_config_areas.prototype.list



/**
* SAVE
* Persists the desired deny/allow lists to the server.
*
* @param {string[]} areas_deny
* @param {string[]} areas_allow
* @returns {Promise<Object>} api_response { result, msg, errors? }
*/
config_areas.prototype.save = async function(areas_deny, areas_allow) {

	const api_response = await data_manager.request({
		use_worker	: true,
		body		: {
			dd_api			: 'dd_area_maintenance_api',
			action			: 'widget_request',
			prevent_lock	: true,
			source			: {
				type	: 'widget',
				model	: 'config_areas',
				action	: 'save_config_areas'
			},
			options			: {
				areas_deny	: areas_deny,
				areas_allow	: areas_allow
			}
		},
		retries : 1
	})

	if (SHOW_DEBUG===true) {
		console.log('))) config_areas save api_response:', api_response);
	}

	// On success, force the live menu to recalculate so the admin sees the
	// allow/deny effect immediately, without a logout/reload.
	if (api_response && api_response.result) {
		event_manager.publish('menu_config_changed', { source: 'config_areas' })
	}

	return api_response
}//end save



// @license-end
