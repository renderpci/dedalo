// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert, page_globals */
/*eslint no-undef: "error"*/



import {get_instance} from '../../../core/common/js/instances.js'
import {ApiError} from '../../../core/common/js/api_error.js'



describe("SECTION FORCED TEST_UNKNOWN_ERROR", async function() {

	const container = document.getElementById('content');

	const section_tipo = 'XXtest3'; // fake non existing section_tipo

	const section = await get_instance({
		model			: 'section',
		tipo			: section_tipo,
		section_tipo	: section_tipo,
		section_id		: null,
		mode			: 'list'
	});

	await section.build(true)

	page_globals.page_error = new ApiError({
		code	: 'internal.unexpected',
		message	: 'Unknown error'
	})

	const node = await section.render()
	container.appendChild(node)
});



// @license-end
