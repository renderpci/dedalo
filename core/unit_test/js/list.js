/*global page_globals, mocha */
/*eslint no-undef: "error"*/
import {ui} from '../../common/js/ui.js'
import {elements} from './elements.js'


// list
	const list_of_test = [
		'test_key_instances',
		'test_get_instance',
		'test_delete_instance',
		'test_components_lifecycle',
		'test_others_lifecycle',
		'test_components_data_changes',
		'test_components_activate',
		'test_components_render'
	]

	// container
		const content	= document.getElementById('content')
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
			const item = elements[i]
			console.log('item:', item);

			// link
			ui.create_dom_element({
				element_type	: 'a',
				href			: `./?area=component_full_test&model=${item.model}`,
				class_name		: 'list_of_test_item link',
				inner_html		: item.model + ` [${item.tipo}]`,
				parent			: container
			})
		}