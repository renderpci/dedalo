// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/

/**
* RENDER_UPDATE_DATA_MAINTENANCE
* Entry-point rendered by render_page when the application's code version and
* stored data version diverge (dedalo_version !== data_version in page_globals).
*
* Responsibilities:
* - When the user is not yet authenticated, render the login widget (dd229)
*   directly on document.body so the admin can authenticate before running
*   the migration.
* - When the user is authenticated, render a restricted area_maintenance
*   instance containing only the 'check_config' and 'update_data_version'
*   widgets, bypassing the full maintenance dashboard.
*
* This module exports a single async factory function.
* It is imported and called exactly once by render_page.js.
*/

// imports
	import {ui} from '../../common/js/ui.js'
	import {get_instance} from  '../../../core/common/js/instances.js'




/**
* RENDER_UPDATE_DATA_MAINTENANCE
* Builds the update-gate container that intercepts normal page load when the
* stored data version does not match the running code version.
*
* Flow:
* 1. If page_globals.is_logged is not strictly true, the login component
*    (tipo dd229, model 'login') is instantiated, built, and appended to
*    document.body. The returned container is empty in this case; the login
*    widget takes over the viewport independently.
* 2. If the user is logged in, a restricted area_maintenance instance is
*    rendered inside the container with only the 'check_config' and
*    'update_data_version' widgets enabled.
*
* (!) The login branch appends directly to document.body rather than to the
*     returned container. This matches the login component's own rendering
*     contract (it manages its own overlay/modal node placement).
*
* @returns {Promise<HTMLElement>} The outer container div. Always returned,
*   but may be empty when the login gate is active.
*/
export const render_update_data_maintenance = async function () {

	const recovery_container = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'recovery_container_from_key'
	})
	if( page_globals.is_logged!==true ){

		// login instance add
		// (!) The login component (dd229) appends its own wrapper to document.body,
		//     not into recovery_container — the caller must still return recovery_container.
		const login_instace = await get_instance({
			model	: 'login',
			tipo	: 'dd229',
			mode	: 'edit',
			lang	: page_globals.dedalo_application_lang
		})
		await login_instace.build(true);
		const wrapper = await login_instace.render()
		document.body.appendChild(wrapper)
	}else{
		// User is authenticated: render the scoped maintenance area with only the
		// two migration widgets. value:null instructs each widget to autoload its
		// current status from the server on first open.
		const area_maintenance_node = await render_custom_area_maintenance(
			[{
				id		: 'check_config',
				type	: 'widget',
				label	: 'CHECK CONFIG',
				class 	: 'width_100',
				value 	: null// force to autoload the value -> the updates to apply
			},
			{
				id		: 'update_data_version',
				type	: 'widget',
				label	: 'UPDATE DATA VERSION',
				value 	: null// force to autoload the value -> the updates to apply
			}]
		)
		recovery_container.appendChild(area_maintenance_node)
	}


	return recovery_container
}//end render_update_data_maintenance



/**
* RENDER_CUSTOM_AREA_MAINTENANCE
* Instantiates an area_maintenance with an explicit, caller-supplied widget
* list, bypassing the server-driven datalist that the full maintenance area
* would normally load.
*
* The instance is built with autoload=false so that no API call is made to
* fetch the widget list; the caller-supplied `widgets` array is used directly.
*
* 'lg-nolan' is the language-neutral locale used for structural/admin areas
* that do not require translated content.
*
* dd88 is the ontology tipo for the area_maintenance section.
*
* @param {Array} widgets - Array of widget descriptor objects to render.
*   Each descriptor must include at least: { id {string}, type {string},
*   label {string}, value {*} }. value:null triggers server autoload per
*   widget when the widget panel is opened.
* @returns {Promise<HTMLElement>} The rendered area_maintenance wrapper node.
*/
const render_custom_area_maintenance = async function(widgets) {

	// Dynamic import avoids a circular dependency: area_maintenance itself
	// may eventually call back into render logic that lives in this module's
	// sibling files.
	const area_maintenance = await import('../../area_maintenance/js/area_maintenance.js')

	const area_maintenance_instance = new area_maintenance['area_maintenance']()

	// init with build(false) — skip autoload so the caller's widget array is used
	// instead of the server-returned datalist.
	await area_maintenance_instance.init({
		id				: 'area_maintenance',
		model			: 'area_maintenance',
		section_tipo	: 'dd88',
		tipo			: 'dd88',
		mode			:'list',
		lang			: 'lg-nolan',
		widgets			: widgets
	})
	await area_maintenance_instance.build(false)

	const area_maintenance_node = await area_maintenance_instance.render()


	return area_maintenance_node;
}//end render_custom_area_maintenance




// @license-end
