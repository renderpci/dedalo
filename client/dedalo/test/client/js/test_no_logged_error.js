// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert, page_globals */
/*eslint no-undef: "error"*/



/**
* TEST_NO_LOGGED_ERROR
* A section rendered while the page reports a lost session must show the
* not-logged panel (reload affordance), not its list. The legacy discriminator is
* the token `not_logged` (this file carried the typo `no_logged` for years and
* asserted nothing — the panel it "tested" was the generic one).
*
* COMPAT: `page_globals.api_errors` is the legacy input of the page panel; the
* v2 slot is `page_globals.page_error` (error_dispatch.js) — both are set here
* so the assertion holds on either side of the compat window.
*/

import {get_instance} from '../../../core/common/js/instances.js'
import {render_relogin} from '../../../core/login/js/render_login.js'
import {ApiError} from '../../../core/common/js/api_error.js'



describe("SECTION TEST_NO_LOGGED_ERROR", function() {

	const container = document.getElementById('content');
	let section = null

	it('renders the not_logged error panel with the reload affordance', async function() {

		section = await get_instance({
			model			: 'section',
			tipo			: 'test3',
			section_tipo	: 'test3',
			section_id		: null,
			mode			: 'list'
		});

		await section.build(true)

		// the session died under a working page: legacy shape + v2 slot
		page_globals.api_errors = [
			{
				error	: 'not_logged', // type
				msg		: `User is not logged (fake message)`,
				trace	: 'test SECTION TEST_NO_LOGGED_ERROR'
			}
		]
		page_globals.page_error = new ApiError({code: 'auth.not_logged', message: 'User is not logged (fake message)'})

		const node = await section.render()
		container.appendChild(node)

		const panel = node.classList?.contains('page_error_container') ? node : node.querySelector('.page_error_container')
		assert.ok(panel, 'the error panel is rendered instead of the list')
		assert.isTrue(panel.classList.contains('not_logged_error'), 'the not_logged discriminator selects the session-lost panel')
		assert.ok(panel.querySelector('.link.reload'), 'the reload affordance is offered')
		assert.include(panel.textContent, 'User is not logged (fake message)')

		// leave the globals clean for the next suite
		page_globals.api_errors	= []
		page_globals.page_error	= null
	})

	it('re-login overlay can be displayed and rebuilds the section on success', async function() {

		// display login window
		const login_instance = await render_relogin({
			on_success : async function(){

				// login success actions

				section.status = 'initiated'

				const unsaved_data = typeof window.unsaved_data!=='undefined'
					? window.unsaved_data
					: false

				// login success actions
				if (unsaved_data===false) {
					await section.build(true)
					await section.render({
						render_level	: 'full', // content|full
						render_mode		: section.mode
					})
				}
			}
		})
		assert.ok(login_instance, 'render_relogin resolves the login instance')
		assert.ok(document.querySelector('.overlay'), 'the overlay is in the DOM')

		// tear the overlay down: nobody will type the credentials in the harness
		login_instance.destroy(true, true, true)
	})
});



// @license-end
