// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert */
/*eslint no-undef: "error"*/

// import {ui} from '../../../core/common/js/ui.js'
import {get_instance} from '../../../core/common/js/instances.js'
import {pause} from '../../../core/common/js/utils/util.js'



// DOM containers
	const section_container = document.getElementById('content');

	section_container.classList.add('section_container')


// wait_for_selector
// The tool builds ITSELF from the server (engine advisory + get_diffusion_info)
// after the opener's mousedown, so the publish button appears on a network
// round-trip, not on a timer. A fixed `pause()` encoded one machine's warm-cache
// timing: the FIRST block pays the cold section build (measured 6s here) and
// missed a 400ms window, while blocks 2 and 3 passed on warm caches — and a
// fixed wait long enough for the slow case makes every fast case slow. Poll
// instead, and let the assertion (not the timeout) state the contract. The cap
// is well above the slow case (and under each block's own 20s mocha timeout):
// polling makes a generous cap free, and a cap that merely clears the measured
// case turns the next slow machine into a mystery failure.
	const wait_for_selector = async function(selector, timeout_ms=15000) {
		const deadline = Date.now() + timeout_ms
		while (Date.now() < deadline) {
			const node = document.querySelector(selector)
			if (node) {
				return node
			}
			await pause(50)
		}
		return null
	}



// GENERIC `test` TLD ONLY (2026-08-22). This suite used to render the `rsc`
// install's images section (rsc170/1, /2 and its list), and tool_diffusion was
// available only because the developer's own database happened to carry a
// diffusion domain covering it — on the suite database the map is empty, no
// opener renders and every case fails. The situation is now BUILT:
// src/core/test_data/situations/client_diffusion.ts provisions a domain named
// after DEDALO_DIFFUSION_DOMAIN with one sql element whose table targets test3,
// which is what makes tool_diffusion::is_available answer true here.
describe(`SECTION PUBLICATION TEST`,  function() {

	this.timeout(20000);

	const section_tipo	= 'test3' // the generic playground section
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

		// The inspector's diffusion opener is a SPAN with class
		// "button block_icon light diffusion" (render_inspector.js), not a <button>
		// — the old `button.diffusion` selector matched nothing, which is the whole
		// of this suite's deferral. Select on the class, tag-agnostic.
		const button_diffusion = await wait_for_selector('.button.diffusion')

		assert.equal(
			(button_diffusion instanceof Element),
			true,
			`node expected DOM for button_diffusion`
		);

		button_diffusion.dispatchEvent(new Event('mousedown'));
	});

	it(`Publish button renders and is confirm-gated`, async function() {

		const publication_button = await wait_for_selector('button.publication_button')

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



describe(`SECTION PUBLICATION RECORD 2 TEST`,  function() {

	this.timeout(20000);

	const section_tipo	= 'test3' // the generic playground section
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

		// The inspector's diffusion opener is a SPAN with class
		// "button block_icon light diffusion" (render_inspector.js), not a <button>
		// — the old `button.diffusion` selector matched nothing, which is the whole
		// of this suite's deferral. Select on the class, tag-agnostic.
		const button_diffusion = await wait_for_selector('.button.diffusion')

		assert.equal(
			(button_diffusion instanceof Element),
			true,
			`node expected DOM for button_diffusion`
		);

		button_diffusion.dispatchEvent(new Event('mousedown'));
	});

	it(`Publish button renders and is confirm-gated`, async function() {

		const publication_button = await wait_for_selector('button.publication_button')

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



describe(`SECTION PUBLICATION LIST TEST`,  function() {

	this.timeout(20000);

	const section_tipo	= 'test3' // the generic playground section
	const section_id	= null;

	const request_config = [
		{
			"api_engine": "dedalo",
			"type": "main",
			"sqo": {
				"section_tipo": [
					"test3"
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
									"section_tipo": "test3",
									"component_tipo": "test142"
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

		// button tool_diffusion
		const button_diffusion = await wait_for_selector('button.tool_diffusion')

		assert.equal(
			(button_diffusion instanceof Element),
			true,
			`node expected DOM for button_diffusion`
		);

		button_diffusion.dispatchEvent(new Event('mousedown'));
	});

	it(`Publish button renders and is confirm-gated`, async function() {

		const publication_button = await wait_for_selector('button.publication_button')

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
