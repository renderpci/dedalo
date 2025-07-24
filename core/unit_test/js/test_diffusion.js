// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert */
/*eslint no-undef: "error"*/

// import {ui} from '../../common/js/ui.js'
import {get_instance} from '../../common/js/instances.js'
import {pause} from '../../common/js/utils/util.js'



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

	it(`Open Tool transcription`, async function() {

		await pause(100)

		// button diffusion
		const button_diffusion = document.querySelector('button.diffusion')

		assert.equal(
			(button_diffusion instanceof Element),
			true,
			`node expected DOM for button_diffusion`
		);

		button_diffusion.dispatchEvent(new Event('mousedown'));
	});

	it(`Publish record`, async function() {

		await pause(400)

		// button diffusion
		const publication_button = document.querySelector('button.publication_button')

		assert.equal(
			(publication_button instanceof Element),
			true,
			`node expected DOM for publication_button`
		);

		publication_button.dispatchEvent(new Event('click'));
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

	it(`Open Tool transcription`, async function() {

		await pause(100)

		// button diffusion
		const button_diffusion = document.querySelector('button.diffusion')

		assert.equal(
			(button_diffusion instanceof Element),
			true,
			`node expected DOM for button_diffusion`
		);

		button_diffusion.dispatchEvent(new Event('mousedown'));
	});

	it(`Publish record`, async function() {

		await pause(400)

		// button diffusion
		const publication_button = document.querySelector('button.publication_button')

		assert.equal(
			(publication_button instanceof Element),
			true,
			`node expected DOM for publication_button`
		);

		publication_button.dispatchEvent(new Event('click'));
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

	it(`Open Tool transcription`, async function() {

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

	it(`Publish record`, async function() {

		await pause(400)

		// button diffusion
		const publication_button = document.querySelector('button.publication_button')

		assert.equal(
			(publication_button instanceof Element),
			true,
			`node expected DOM for publication_button`
		);

		publication_button.dispatchEvent(new Event('click'));
	});

});//end describe(`COMPONENT PORTAL PAGINATION TEST`



// @license-end
