// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {component_portal} from '../../component_portal/js/component_portal.js'
	import {data_manager} from '../../common/js/data_manager.js'



// alias of component_portal
	export const component_dataframe = component_portal



// extend modules
	// component_dataframe.prototype.list = render_list_component_dataframe.prototype.list



/**
* CREATE_NEW_SECTION
* Create new target section and return his locator
* @param object options
* {
* 	data: {
* 		section_id		: "1",
* 		section_tipo	: "numisdata4",
* 		section_id_key	: "66",
* 		tipo_key		: "numisdata161",
* 		value 			: [{locator}] \ null
* 	}
*
* }
* @return object api_response
*/
component_dataframe.prototype.create_new_section = async function(options) {

	const self = this

	const data = options.data || {}

	const target_section_tipo = self.request_config_object.sqo.section_tipo[0].tipo

	// data_manager. create new section
	const rqo = {
		action	: 'create',
		source	: {
			section_tipo : target_section_tipo
		}
	}
	const api_response = await data_manager.request({
		body : rqo
	})

	// if the server response is OK, it will send the new section_id
	if (api_response.result && api_response.result>0) {

		const section_id = api_response.result

		const locator = {
			section_tipo		: target_section_tipo,
			section_id			: section_id,
			section_id_key		: data.section_id_key,
			from_component_tipo	: self.tipo
		}

		const changed_data = [Object.freeze({
			action	: 'insert',
			key		: 0,
			value	: locator
		})]
		const response = await self.change_value({
			changed_data	: changed_data,
			refresh			: true
		})

		return response
	}

	return api_response
}// end  create_new_section


/**
* GET_RATING
* Get the component with the rating value of the dataframe section
* usually the rating value will be inside the hide ddo_map of the request_config (don't use to show it only to get information)
* the rating component is defined with a rating role in the ddo_map
* rating component is a component_radio_button, it will have a datalist with all rating values
* his data need to be match with the datalist to get the literal or the equivalent color of the rating
* data_rating will be the datalist item that match with the value.
* @return object data_rating|null
*/
component_dataframe.prototype.get_rating = function() {

	const self = this

	const ddo_map = self.request_config_object?.hide?.ddo_map || []

	const rating_ddo = ddo_map.find(el => el.role === 'rating')

	if(!rating_ddo){
		return null
	}

	const value = self.data.value || []

	if(value.length >= 1){

		const locator = value[0]

		const data_rating = self.datum.data.find(el =>
			el.tipo === rating_ddo.tipo
			&& el.from_component_tipo === self.tipo
			&& el.section_tipo === locator.section_tipo
			&& el.section_id === locator.section_id
		)
		return data_rating
	}

	return null
}//end get_rating



// @license-end
