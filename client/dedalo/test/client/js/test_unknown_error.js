// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, before, after, assert, page_globals */
/*eslint no-undef: "error"*/



import {get_instance} from '../../../core/common/js/instances.js'
import {ApiError} from '../../../core/common/js/api_error.js'



/**
* SECTION FORCED TEST_UNKNOWN_ERROR
* With `page_globals.page_error` set to an ApiError, `common.render` must
* render the ERROR PANEL (render_api_error.render_error_panel) instead of the
* section — the one page-level failure slot. Until 2026-09-02 this file was an
* `async describe` with no `it()` and could never go red (GATE-12).
*/
describe("SECTION FORCED TEST_UNKNOWN_ERROR", function() {

	const container = document.getElementById('content')

	const section_tipo = 'XXtest3' // fake non existing section_tipo

	let section	= null
	let node	= null

	before(async function() {
		section = await get_instance({
			model			: 'section',
			tipo			: section_tipo,
			section_tipo	: section_tipo,
			section_id		: null,
			mode			: 'list'
		})
		await section.build(true)

		page_globals.page_error = new ApiError({
			code	: 'internal.unexpected',
			message	: 'Unknown error'
		})

		node = await section.render()
		container.appendChild(node)
	})

	after(function() {
		// the slot is page-global: leave it as we found it for the next suite
		page_globals.page_error = null
	})

	it('renders the error panel, not the section', function() {
		assert.instanceOf(node, Element)
		assert.isTrue(node.classList.contains('api_error_panel'), 'render_error_panel output expected, got: ' + node.className)
		assert.isFalse(node.classList.contains('section'), 'the section must not render over a page error')
	})

	it('the panel carries the error code and message', function() {
		assert.equal(node.dataset.code, 'internal.unexpected')
		const heading = node.querySelector('.server_response_error')
		assert.isNotNull(heading, 'h1.server_response_error')
		assert.isTrue(heading.textContent.length > 0, 'the panel says something')
	})
})



// @license-end
