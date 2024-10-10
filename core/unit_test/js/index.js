// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0



/**
* UNIT_TEST
* 	To check Dédalo elements basic functionalities
*/



// imports
	import {data_manager} from '../../common/js/data_manager.js'
	import {set_environment} from '../../common/js/common.js'
	import {url_vars_to_object} from '../../common/js/utils/index.js'

// check url vars
	const url_vars = url_vars_to_object(window.location.search);


// page start
	await ( async () => {

		// page_globals. Set basic properties
			window.page_globals = {
				// API response errors
				api_errors : [],
				// API response last message
				request_message : null
			}
			window.get_label = {}
			window.SHOW_DEBUG = false
			window.DEVELOPMENT_SERVER = false

		const rqo = { // rqo (request query object)
			action			: 'get_environment',
			prevent_lock	: true
		}
		// request page context (usually menu and section context)
		const api_response = await data_manager.request({
			body : rqo
		});
		set_environment(api_response.result)
	})()



// login check
	if (page_globals.is_logged!==true) {

		// user is not logged

		import ('../../common/js/instances.js')
		.then(async function(module){

			const instance = await module.get_instance({
				model	: 'login',
				tipo	: 'dd229',
				mode	: 'edit',
				lang	: page_globals.dedalo_application_lang
			})
			await instance.build(true)
			const wrapper = await instance.render()
			document.body.appendChild(wrapper)
		})
		throw 'Login is required';
	}



// test
	// import './test_key_instances.js'
	// import './test_get_instance.js'
	// import './test_delete_instance.js'
	// import './test_components_lifecycle.js'
	// import './test_others_lifecycle.js'
	// import './test_components_data_changes.js'
	// import './test_components_activate.js'
	// import './test_components_render.js'

	const area = url_vars.area
	if (area) {
		try {

			// load test file
			await import(`./${area}.js`)
			// exec mocha
			import('./exec.js')

		} catch (error) {
			if (area!==undefined) {
				console.log(error)
			}

			// list
			import('./list.js')
		}
	}else{
		// list
		import('./list.js')
	}



// @license-end
