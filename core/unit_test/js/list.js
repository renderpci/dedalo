// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global page_globals, mocha */
/*eslint no-undef: "error"*/
import {ui} from '../../common/js/ui.js'
import {elements} from './elements.js'


// list
	export const list_of_test = [
		'test_key_instances',
		'test_get_instance',
		'test_delete_instance',
		'test_components_lifecycle',
		'test_others_lifecycle',
		'test_instances_lifecycle',
		'test_event_manager',
		'test_components_data_changes',
		'test_components_activate',
		'test_components_render',
		'test_component_text_area',
		'test_no_logged_error',
		'test_unknown_error',
		'test_page',
		'test_diffusion',
		// 'test_component_portal_pagination'
	]

	// content: (!) Note that content value is automatically set by mocha selecting page #content
	// const content = document.getElementById('content')
	if (typeof content!=='undefined') {

		// container
			const container	= ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'list_of_test_container',
				parent			: content
			})

		// title Test list
			ui.create_dom_element({
				element_type	: 'h1',
				class_name		: '',
				inner_html		: 'Test generic list',
				parent			: container
			})

		// links list
			const list_of_test_length = list_of_test.length
			for (let i = 0; i < list_of_test_length; i++) {

				const test_name = list_of_test[i]

				// link
				ui.create_dom_element({
					element_type	: 'a',
					href			: `./?area=${test_name}`,
					class_name		: 'list_of_test_item link',
					inner_html		: test_name,
					parent			: container
				})
			}

		// title Test list
			ui.create_dom_element({
				element_type	: 'h1',
				class_name		: '',
				inner_html		: 'Test full component list',
				parent			: container
			})
			const elements_length = elements.length
			for (let i = 0; i < elements_length; i++) {

				const element = elements[i]

				// link
				ui.create_dom_element({
					element_type	: 'a',
					href			: `./?area=test_component_full&model=${element.model}`,
					class_name		: 'list_of_test_element link',
					inner_html		: element.model + ` [${element.tipo}]`,
					parent			: container
				})
			}
	}//end if (content)



// @license-end
