// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {get_instance} from  '../../../core/common/js/instances.js'




/**
* RENDER_UPDATE_DATA_MAINTENANCE
* Creates the DOM nodes necessaries to display a
* temporal area_maintenance
* @return HTMLElement recovery_container
* 	API response value
*/
export const render_update_data_maintenance = async function () {

	const recovery_container = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'recovery_container_from_key'
	})
	if( page_globals.is_logged!==true ){

		// login instance add
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
* Creates a area_maintenance node with custom widgets:
* Only the 'update_data_version' widget is loaded.
* @return HTMLElement area_maintenance_node
*/
const render_custom_area_maintenance = async function(widgets) {

	const area_maintenance = await import('../../area_maintenance/js/area_maintenance.js')

	const area_maintenance_instance = new area_maintenance['area_maintenance']()

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
