// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert */
/*eslint no-undef: "error"*/

// import {ui} from '../../../core/common/js/ui.js'
import {get_instance} from '../../../core/common/js/instances.js'
import {pause} from '../../../core/common/js/utils/util.js'



// DOM containers
	const section_container = document.getElementById('content');

	section_container.classList.add('section_container')



describe(`SECTION PUBLICATION IMAGE TEST`,  function() {

	this.timeout(20000);

	const section_tipo	= 'rsc170' // images rsc170
	const section_id	= 1;

	const options = {
		tipo			: section_tipo,
		section_tipo	: section_tipo,
		mode			: 'edit',
		model			: 'section',
		section_id		: section_id,
		id_variant		: 'image_1_test'
	};

	let section

	it(`Create section`, async function() {

		section = await get_instance(options)

		await section.build(true)

		const node = await section.render()

		// clean container
		while (section_container.firstChild) {
			section_container.removeChild(section_container.firstChild);
		}

		section_container.appendChild(node)

		assert.equal(
			(node instanceof Element),
			true,
			`node expected DOM`
		);
	});

	it(`Open Tool diffusion`, async function() {

		await pause(100)

		// The inspector's diffusion opener is a SPAN with class
		// "button block_icon light diffusion" (render_inspector.js), not a <button>
		// — the old `button.diffusion` selector matched nothing, which is the whole
		// of this suite's deferral. Select on the class, tag-agnostic.
		const button_diffusion = document.querySelector('.button.diffusion')

		assert.equal(
			(button_diffusion instanceof Element),
			true,
			`node expected DOM for button_diffusion`
		);

		button_diffusion.dispatchEvent(new Event('mousedown'));
	});

	it(`Publish button renders and is confirm-gated`, async function() {

		await pause(400)

		const publication_button = document.querySelector('button.publication_button')

		assert.equal(
			(publication_button instanceof Element),
			true,
			`node expected DOM for publication_button`
		);

		// DELIBERATELY NOT PUBLISHED. A click that is confirmed fires a real
		// diffusion publish of this record to the configured target and returns
		// before the SSE stream finishes, so the old case asserted nothing while
		// writing to a live target on every run. Answer the confirm with NO: that
		// proves the button is gated (the gate is the contract here) and leaves
		// the target untouched.
		const native_confirm = window.confirm
		let confirm_asked = false
		window.confirm = function() {
			confirm_asked = true
			return false
		}
		try {
			publication_button.dispatchEvent(new Event('click'));
		} finally {
			window.confirm = native_confirm
		}

		assert.equal(confirm_asked, true, 'the publish button must ask before publishing')
		assert.equal(
			publication_button.classList.contains('loading'),
			false,
			'a cancelled confirm must not start the publication'
		);
	});

});//end describe(`COMPONENT PORTAL PAGINATION TEST`



describe(`SECTION PUBLICATION IMAGE 2 TEST`,  function() {

	this.timeout(20000);

	const section_tipo	= 'rsc170' // images rsc170
	const section_id	= 2;

	const options = {
		tipo			: section_tipo,
		section_tipo	: section_tipo,
		mode			: 'edit',
		model			: 'section',
		section_id		: section_id,
		id_variant		: 'image_2_test'
	};

	let section

	it(`Create section`, async function() {

		section = await get_instance(options)

		await section.build(true)

		const node = await section.render()

		// clean container
		while (section_container.firstChild) {
			section_container.removeChild(section_container.firstChild);
		}

		section_container.appendChild(node)

		assert.equal(
			(node instanceof Element),
			true,
			`node expected DOM`
		);
	});

	it(`Open Tool diffusion`, async function() {

		await pause(100)

		// The inspector's diffusion opener is a SPAN with class
		// "button block_icon light diffusion" (render_inspector.js), not a <button>
		// — the old `button.diffusion` selector matched nothing, which is the whole
		// of this suite's deferral. Select on the class, tag-agnostic.
		const button_diffusion = document.querySelector('.button.diffusion')

		assert.equal(
			(button_diffusion instanceof Element),
			true,
			`node expected DOM for button_diffusion`
		);

		button_diffusion.dispatchEvent(new Event('mousedown'));
	});

	it(`Publish button renders and is confirm-gated`, async function() {

		await pause(400)

		const publication_button = document.querySelector('button.publication_button')

		assert.equal(
			(publication_button instanceof Element),
			true,
			`node expected DOM for publication_button`
		);

		// DELIBERATELY NOT PUBLISHED. A click that is confirmed fires a real
		// diffusion publish of this record to the configured target and returns
		// before the SSE stream finishes, so the old case asserted nothing while
		// writing to a live target on every run. Answer the confirm with NO: that
		// proves the button is gated (the gate is the contract here) and leaves
		// the target untouched.
		const native_confirm = window.confirm
		let confirm_asked = false
		window.confirm = function() {
			confirm_asked = true
			return false
		}
		try {
			publication_button.dispatchEvent(new Event('click'));
		} finally {
			window.confirm = native_confirm
		}

		assert.equal(confirm_asked, true, 'the publish button must ask before publishing')
		assert.equal(
			publication_button.classList.contains('loading'),
			false,
			'a cancelled confirm must not start the publication'
		);
	});

});//end describe(`COMPONENT PORTAL PAGINATION TEST`



describe(`SECTION PUBLICATION IMAGE LIST TEST`,  function() {

	this.timeout(20000);

	const section_tipo	= 'rsc170' // images rsc170
	const section_id	= null;

	const request_config = [
		{
			"api_engine": "dedalo",
			"type": "main",
			"sqo": {
				"section_tipo": [
					"rsc170"
				],
				"limit": 10,
				"offset": 0,
				"filter": {
					"$and": [
						{
							"q": "<100",
							"q_operator": null,
							"path": [
								{
									"name": "Id",
									"model": "component_section_id",
									"section_tipo": "rsc170",
									"component_tipo": "rsc175"
								}
							],
							"q_split": false,
							"type": "number",
							"component_path": [
								"section_id"
							],
							"lang": "all",
							"unaccent": false,
							"format": "column",
							"column_name": "section_id",
							"operator": "<",
							"q_parsed": 100
						}
					]
				},
				"order": []
			},
			"search": null,
			"choose": null,
			"api_config": null
		}
	]

	const options = {
		tipo			: section_tipo,
		section_tipo	: section_tipo,
		mode			: 'list',
		model			: 'section',
		id_variant		: 'list_mode_test'
	};

	let section

	it(`Create section`, async function() {

		section = await get_instance(options)

		console.log('section:', section);

		await section.build(true)

		const node = await section.render()

		// clean container
		while (section_container.firstChild) {
			section_container.removeChild(section_container.firstChild);
		}

		section_container.appendChild(node)

		assert.equal(
			(node instanceof Element),
			true,
			`node expected DOM`
		);
	});

	it(`Open Tool diffusion`, async function() {

		await pause(100)

		// button tool_diffusion
		const button_diffusion = document.querySelector('button.tool_diffusion')

		assert.equal(
			(button_diffusion instanceof Element),
			true,
			`node expected DOM for button_diffusion`
		);

		button_diffusion.dispatchEvent(new Event('mousedown'));
	});

	it(`Publish button renders and is confirm-gated`, async function() {

		await pause(400)

		const publication_button = document.querySelector('button.publication_button')

		assert.equal(
			(publication_button instanceof Element),
			true,
			`node expected DOM for publication_button`
		);

		// DELIBERATELY NOT PUBLISHED. A click that is confirmed fires a real
		// diffusion publish of this record to the configured target and returns
		// before the SSE stream finishes, so the old case asserted nothing while
		// writing to a live target on every run. Answer the confirm with NO: that
		// proves the button is gated (the gate is the contract here) and leaves
		// the target untouched.
		const native_confirm = window.confirm
		let confirm_asked = false
		window.confirm = function() {
			confirm_asked = true
			return false
		}
		try {
			publication_button.dispatchEvent(new Event('click'));
		} finally {
			window.confirm = native_confirm
		}

		assert.equal(confirm_asked, true, 'the publish button must ask before publishing')
		assert.equal(
			publication_button.classList.contains('loading'),
			false,
			'a cancelled confirm must not start the publication'
		);
	});

});//end describe(`COMPONENT PORTAL PAGINATION TEST`



// @license-end
