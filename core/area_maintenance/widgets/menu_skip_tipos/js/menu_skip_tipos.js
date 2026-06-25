// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global SHOW_DEBUG */
/*eslint no-undef: "error"*/



/**
* MENU_SKIP_TIPOS
* Controller half of the menu_skip_tipos maintenance widget. Lets an admin edit the list of
* "grouping" tipos hidden from the menu (DEDALO_ENTITY_MENU_SKIP_TIPOS); Save persists
* features.entity_menu_skip_tipos to ../private/config.local.php on the server.
*
* Server counterpart: core/area_maintenance/widgets/menu_skip_tipos/class.menu_skip_tipos.php
*   API_ACTIONS: 'save_menu_skip_tipos'
* DOM rendering delegated to render_menu_skip_tipos.js.
*/



// imports
	import {widget_common} from '../../../../widgets/widget_common/js/widget_common.js'
	import {area_maintenance} from '../../../../area_maintenance/js/area_maintenance.js'
	import {data_manager} from '../../../../common/js/data_manager.js'
	import {event_manager} from '../../../../common/js/event_manager.js'
	import {render_menu_skip_tipos} from './render_menu_skip_tipos.js'



/**
* MENU_SKIP_TIPOS
* Constructor. Properties populated by the standard widget lifecycle (init→build→render).
*/
export const menu_skip_tipos = function() {

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
}//end menu_skip_tipos



// prototypes assign
	// lifecycle
	menu_skip_tipos.prototype.init		= widget_common.prototype.init
	menu_skip_tipos.prototype.build		= widget_common.prototype.build
	menu_skip_tipos.prototype.render	= widget_common.prototype.render
	menu_skip_tipos.prototype.destroy	= widget_common.prototype.destroy
	menu_skip_tipos.prototype.get_value	= area_maintenance.prototype.get_value
	// render
	menu_skip_tipos.prototype.edit		= render_menu_skip_tipos.prototype.list
	menu_skip_tipos.prototype.list		= render_menu_skip_tipos.prototype.list



/**
* SAVE
* Persists the desired menu-skip tipo list to the server.
*
* @param {string[]} tipos
* @returns {Promise<Object>} api_response { result, msg, errors? }
*/
menu_skip_tipos.prototype.save = async function(tipos) {

	const api_response = await data_manager.request({
		use_worker	: true,
		body		: {
			dd_api			: 'dd_area_maintenance_api',
			action			: 'widget_request',
			prevent_lock	: true,
			source			: {
				type	: 'widget',
				model	: 'menu_skip_tipos',
				action	: 'save_menu_skip_tipos'
			},
			options			: {
				tipos	: tipos
			}
		},
		retries : 1
	})

	if (SHOW_DEBUG===true) {
		console.log('))) menu_skip_tipos save api_response:', api_response);
	}

	// On success, force the live menu to recalculate so the admin sees the
	// skip effect immediately, without a logout/reload.
	if (api_response && api_response.result) {
		event_manager.publish('menu_config_changed', { source: 'menu_skip_tipos' })
	}

	return api_response
}//end save



// @license-end
