// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert */
/*eslint no-undef: "error"*/

import {
	elements
} from './elements.js'
import {ui} from '../../common/js/ui.js'
import {get_instance} from '../../common/js/instances.js'
import {pause} from '../../common/js/utils/util.js'



// DOM containers
	const container = document.getElementById('content');

	const component_container = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'component_container',
		parent			: container
	})



// component_options
	const component_options = elements.find(el => el.model==='component_text_area')



describe(`COMPONENT_TEXT_AREA WITH COMPONENT_GEOLOCATION TEST`,  function() {

	this.timeout(4000);

	let component

	let pause_time = 300

	const section_tipo	= 'dmm480' // map of grapes
	const section_id	= 1;

	const options = Object.assign(component_options, {
		section_id		: section_id,
		mode			: 'edit',
		view			: 'default',
		tipo			: 'dmm507', // Site
		section_tipo	: section_tipo // map of grapes
	});

	it(`Create component`, async function() {

		component = await get_instance(options)
		await component.build(true)
		component.auto_init_editor = true
		const node = await component.render()

		component_container.appendChild(node)

		assert.equal(
			(node instanceof Element),
			true,
			`node expected DOM`
		);

		{
			// map
			const options = Object.assign(component_options, {
				section_id		: section_id,
				mode			: 'edit',
				view			: 'default',
				tipo			: 'dmm506',
				section_tipo	: section_tipo,
				model			: 'component_geolocation'
			});
			const component = await get_instance(options)
			await component.build(true)
			component.auto_init_editor = true
			const node = await component.render()
			component_container.appendChild(node)
		}
	});

	it(`Non active`, async function() {

		assert.equal(
			component.active,
			false,
			`active expected false`
		);
	});

	it(`Activated`, async function() {

		// await pause(pause_time)

		ui.component.activate(component)

		it(`Active 2`, async function() {
			assert.deepEqual(
				component.active,
				true,
				`active expected true`
			);
		});
	});

	it(`key F2`, async function() {

		const text_editor = component.text_editor

		await pause(pause_time)

		const service = text_editor[0]
		const editor = service.editor // ckeditor instance
		console.log('editor:', editor);

		editor.editing.view.document.fire(
			'keydown',
			{
				name : 'keydown',
				domEvent : {
					code			: "F2",
					key				: "F2",
					keyCode			: 113,
					altKey			: false,
					ctrlKey			: false,
					keystroke		: 113,
					metaKey			: false,
					shiftKey		: false,
					stopPropagation	: () => {},
					preventDefault	: () => {}
				}
			}
		);
	});

	it(`Deactivated`, async function() {

		await pause(pause_time)

		ui.component.deactivate(component)

		assert.deepEqual(
			component.active,
			false,
			`active expected true`
		);
	});

	it(`Activated again`, async function() {

		await pause(pause_time)

		ui.component.activate(component)

		assert.deepEqual(
			component.active,
			true,
			`active expected true`
		);
	});

	it(`Click first layer button`, async function() {

		await pause(pause_time)

		const first_layer_button = document.querySelector('.layer_selector >.layer_ul >li')
		if (first_layer_button) {
			first_layer_button.click()
		}

		assert.notEqual(
			first_layer_button,
			null,
			`close_button2 expected null`
		);
	});

	it(`key F2 again`, async function() {

		const text_editor = component.text_editor

		await pause(pause_time)

		const service = text_editor[0]
		const editor = service.editor // ckeditor instance

		editor.editing.view.document.fire(
			'keydown',
			{
				name : 'keydown',
				domEvent : {
					code			: "F2",
					key				: "F2",
					keyCode			: 113,
					altKey			: false,
					ctrlKey			: false,
					keystroke		: 113,
					metaKey			: false,
					shiftKey		: false,
					stopPropagation	: () => {},
					preventDefault	: () => {}
				}
			}
		);
	});

	it(`Close layer selector`, async function() {

		await pause(pause_time)

		const close_button = document.querySelector('.layer_selector_header > .button.close')
		if (close_button) {
			close_button.click()
		}

		const close_button2 = document.querySelector('.layer_selector_header > .button.close')
		assert.equal(
			close_button2,
			null,
			`close_button2 expected null`
		);
	});

	it(`Save component`, async function() {

		await pause(pause_time)

		assert.equal(
			typeof component.data.changed_data==='undefined',
			false,
			`changed_data expected not undefined`
		);

		await component.save()

		console.log('component:', component);

		assert.equal(
			typeof component.data.changed_data==='undefined',
			true,
			`changed_data expected undefined`
		);
	});



});//end describe(`COMPONENT PORTAL PAGINATION TEST`



// @license-end
