// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert, page_globals */
/*eslint no-undef: "error"*/



import {get_instance} from '../../../core/common/js/instances.js'
import {render_relogin} from '../../../core/login/js/render_login.js'



describe("SECTION TEST_NO_LOGGED_ERROR", async function() {

	const container = document.getElementById('content');

	const section = await get_instance({
		model			: 'section',
		tipo			: 'test3',
		section_tipo	: 'test3',
		section_id		: null,
		mode			: 'list'
	});

	await section.build(true)

	page_globals.api_errors = [
		{
			error	: 'no_logged', // type
			msg		: `User is not logged (fake message)`,
			trace	: 'test SECTION TEST_NO_LOGGED_ERROR'
		}
	]

	const node = await section.render()
	container.appendChild(node)

	// display login window
	await render_relogin({
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

});



// @license-end
