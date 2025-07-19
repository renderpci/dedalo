// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEVELOPER, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/


// import
	import { ui } from '../../common/js/ui.js'
	import { is_filter_empty } from '../../search/js/search.js'
	import { data_manager } from '../../common/js/data_manager.js'
	import {
		open_records_in_window,
		printf
	} from '../../common/js/utils/index.js'



/**
* RENDER_OPEN_LIST_WITH_DIRECT_RELATIONS
* Builds the button nodes and events to get raw data of the target section selected by user
* It show a modal with all target section and 2 options:
* 	current: uses current record data of the component caller
* 	found : uses the all records found data of the component caller
* Open new window of the target section and the section_id data of
* all components that are pointing to selected target section.
* @param object options
* {
*	sqo : sqo // the sqo of the section
*	target_sections : array with all target section tipos // when the caller is the main section (fired in inspector) it will send all target sections that main section is pointed.
*	rqo_options : {
* 		type			: string, possible values: 'section' || 'component' || 'target_section',
*		section_tipo	: string or null, when the caller is a component, its own section_tipo, if caller is a main section it will null (will change by the user selection in modal)
*		tipo			: string or null, when the caller is a component, its own tipo, if caller is a main section it will null (will change by the user selection in modal)
*		model			: string with the model of the caller as 'section' or 'component_portal'
*	}
*	caller_label 	: string with the caller label as 'Images'
*	total_records 	: int with the total section_records of the main section tipo.
*	caller_tipo 	: string with the caller tipo as 'oh24' or 'oh1'
*	self_caller 	: object with the caller instance, it will set into the opened window list
* }
* @return HTMLElement modal
*/
export const render_open_list_with_direct_relations = ( options ) => {

	const sqo				= options.sqo
	const target_sections	= options.target_sections || []
	const rqo_options 		= options.rqo_options
	const caller_label		= options.label
	const total_records		= options.total
	const caller_tipo 		= options.caller_tipo
	const self_caller		= options.self

	if (!sqo) {
		console.error('Missing SQO in section in its request config object');
		return;
	}

	// open data selection, by default = current.
	// options: current | found
	const data_selection = {
		selected_value : 'current'
	};

	// Modal
	// Ask user if want this record or all records
	// by default only current record will used.
	// header
		const header = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'header'
		})

		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'label',
			text_node		: get_label.open_relationships || 'Open relationships',
			parent			: header
		})

	// body
		const body = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content body'
		})

		const bold_caller_label = `<strong>${caller_label}</strong>`
		const raw_body_label = get_label.open_relationships_of_field || 'Open relationships of {0} from the current record (1) or from all found records ({1})?'
		const body_label = printf(raw_body_label, bold_caller_label, total_records)

		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'label',
			text_node		: body_label,
			parent			: body
		})

		// target sections

			// target section selected
			const change_target_section_handler = (e)=> {
				rqo_options.section_tipo	= e.target.value
				rqo_options.tipo			= e.target.value
			}
			// if the caller is a component
			// or the main section is not connected with any target section
			// don't show the target sections.
			const target_sections_len = target_sections.length

			if(target_sections_len > 0){

				const target_sections_content = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'target_sections_content',
					parent			: body
				})
				for (let i = 0; i < target_sections_len; i++) {
					const target_section = target_sections[i]

					const target_section_label = ui.create_dom_element({
						element_type	: 'label',
						class_name		: 'target_section_label unselectable',
						text_node		: target_section.label || '',
						parent			: target_sections_content
					})

					const current_target_section_radio = ui.create_dom_element({
						element_type	: 'input',
						type			: 'radio',
						name			: 'target_section',
						value 			: target_section.tipo
					})
					current_target_section_radio.addEventListener('change', change_target_section_handler)
					target_section_label.prepend(current_target_section_radio)
				}
			}

		// current or found records
			const change_mode_handler = (e)=> {
				data_selection.selected_value = e.target.value
			}

			const radio_button_content = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'radio_button_content',
				parent			: body
			})

			// option current_record
				const current_record_label = ui.create_dom_element({
					element_type	: 'label',
					class_name		: 'current_record_label unselectable',
					text_node		: get_label.current_record || 'Current record',
					parent			: radio_button_content
				})

				const current_record_radio = ui.create_dom_element({
					element_type	: 'input',
					type			: 'radio',
					name			: 'data_selection',
					value 			: 'current'
				})
				current_record_radio.checked = true
				current_record_radio.addEventListener('change', change_mode_handler)
				current_record_label.prepend(current_record_radio)

			// option found_records
				const found_records_label = ui.create_dom_element({
					element_type	: 'label',
					class_name		: 'found_records_label unselectable',
					text_node		: get_label.found_records || 'All found records',
					parent			: radio_button_content
				})

				const found_records_radio = ui.create_dom_element({
					element_type	: 'input',
					type			: 'radio',
					name			: 'data_selection',
					value 			: 'found'
				})
				found_records_radio.addEventListener('change', change_mode_handler)
				found_records_label.prepend(found_records_radio)

		// button_open
			const button_open_container = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'button_open_container',
				parent			: body
			})

			const button_open = ui.create_dom_element({
				element_type	: 'button',
				class_name		: 'success',
				inner_html		: get_label.open || 'Open',
				parent			: button_open_container
			})

			const perform_open_related_data = function(){
				open_related_data({
					rqo_options		: rqo_options,
					sqo				: sqo,
					modal			: modal,
					data_selection	: data_selection,
					caller_label	: caller_label,
					self_caller		: self_caller
				})
			}
			button_open.addEventListener('mouseup', perform_open_related_data)

	// modal
		const modal = ui.attach_to_modal({
			header		: header,
			body		: body,
			size		: 'small', // string size big|normal|small
			minimizable	: false,
			callback	: (dd_modal) => {
				dd_modal.classList.add('open_relations_modal')
			}
		})

}// end render_open_list_with_direct_relations


/**
* OPEN_RELATED_DATA
* Performs a `read_raw` API call to get the locators of the components pointing to target sections
* It could get a specific component data or all locators from a specific target section
* And from current section_record or for all records found with specific filter.
* When user don't apply a filter it will alert that all relations will open.
* @see `read_raw` function in `class.dd_core_api.php`
* @param object options
* {
*	sqo : sqo // the sqo of the section
*	rqo_options : {
* 		type			: string, possible values: 'section' || 'component' || 'target_section',
*		section_tipo	: string  as 'oh1'
*		tipo			: string  as 'oh25'
*		model			: string with the model of the caller as 'section' or 'component_portal'
*	}
*	caller_label 	: string with the caller label as 'Images'
*	self_caller 	: object with the caller instance, it will set into the opened window list
*	data_selection	: {
*		selected_value : 'current' || 'found'
* 	}
* 	modal : HTMLElement
* }
* @return bool
*/
const open_related_data = async function( options ){

	const sqo				= options.sqo
	const rqo_options		= options.rqo_options
	const caller_label		= options.caller_label
	const self_caller		= options.self_caller
	const data_selection	= options.data_selection
	const modal				= options.modal

	if(!rqo_options.section_tipo){
		return
	}

	// check if the filter is empty
	// when the user don't find anything, the result can be huge
	// test the sqo filter
	const filter_empty = sqo.filter
		? is_filter_empty(sqo.filter)
		: true

	// close modal
	modal.close()

	// when the user select 'found', the API will get data from the selected component in all records found
	if( data_selection.selected_value === 'found' ){
		// warning user before execute when no filter is used
		// in this case it could be huge!
		if(filter_empty === true){

			const raw_label = get_label.will_open_all_related_records || 'This will open all related data of {0} of all records in a new window without filtering. Are you sure?'
			const label = printf(raw_label, caller_label)
			const warning_label =  get_label.warning.toUpperCase() || 'WARNING'
			const msg = warning_label
			+ '\n' + label
			if (!confirm(msg)){
				return false
			}
		}

		//remove the limit and offset when the found data is selected
		// Note: open windows will be paginated, but here is necessary all data of the component.
		sqo.limit = 0
		sqo.offset = 0
	}

	// read_raw from Dédalo API
	const rqo = {
		action			: 'read_raw',
		options			: rqo_options,
		sqo				: sqo
	}

	// perform the search and get the result
	const api_response = await data_manager.request({
		body : rqo
	})

	if (!api_response?.result) {
		console.error('Failed api response:', api_response);
		return false
	}
	//value is the result as an array of locators
	const value = api_response.result

	// section tipo
	// get the target section tipos in the data
		const ar_section_tipo			= value.map(el => el?.section_tipo).filter(tipo => tipo !== undefined)
		const unique_ar_section_tipo	= [...new Set(ar_section_tipo)];

	// open every target section in different windows
		const target_sections_len = unique_ar_section_tipo.length
		for (let i = target_sections_len - 1; i >= 0; i--) {
			const current_section_tipo = unique_ar_section_tipo[i]

			// section_id list
			const ar_section_id = value
				.filter(el => el.section_tipo === current_section_tipo && el.section_id)
				.map(el => el.section_id)

			const window_options = {
				caller			: self_caller,
				section_tipo	: current_section_tipo,
				ar_section_id	: ar_section_id,
				target_window	: current_section_tipo,
				left			: i*30,
				top				: (i*30)+25 // MacOs menu has 25 pixels
			}

			// open_records_in_window
			open_records_in_window( window_options );
			// open_records_in_window(self, current_section_tipo, ar_section_id, current_section_tipo);
		}
}



// @license-end