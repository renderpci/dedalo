// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, before, assert, page_globals */
/*eslint no-undef: "error"*/


import {get_instance} from '../../../core/common/js/instances.js'



/**
* PAGE TEST
* Builds and renders the page shell (the `page` instance with its menu) and
* asserts the rendered wrapper. Until 2026-09-02 this file was ONE `async
* describe` with no `it()`: Mocha never awaits a describe callback, so its
* awaits floated, the frame reported zero tests and the card was a PASS that
* could never go red (GATE-12). Registration happens synchronously here; the
* async work lives in `before`, where Mocha DOES await it.
*/
describe("PAGE TEST", function() {

	const container = document.getElementById('content')

	let page = null
	let node = null

	before(async function() {
		page = await get_instance({
			model	: 'page',
			menu	: true
		})
		await page.build(true)
		node = await page.render()
		container.appendChild(node)
	})

	it('builds a page instance with no page-level error', function() {
		assert.isObject(page, 'page instance')
		assert.equal(page.model, 'page')
		assert.isNull(page_globals.page_error, 'a page-level ApiError leaked into the shell build')
	})

	it('renders the wrapper into the content container', function() {
		assert.instanceOf(node, Element)
		assert.isTrue(node.classList.contains('wrapper'), 'div.wrapper is the page shell (render_page.edit)')
		assert.strictEqual(node.parentNode, container)
		assert.isTrue(node.childElementCount > 0, 'the wrapper holds content_data')
	})
})



// @license-end
