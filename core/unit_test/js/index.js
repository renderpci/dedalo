/**
* UNIT_TEST
* 	To check Dédalo elements basic functionalities
*/

import {url_vars_to_object} from '../../common/js/utils/index.js'
// check url vars
	const url_vars = url_vars_to_object(window.location.search)



// login check
	if (page_globals.is_logged!==true) {

		// user is not logged

		import ('../../common/js/instances.js')
		.then(async function(instances){

			// login instance add
				instances.get_instance({
					model	: 'login',
					tipo	: 'dd229',
					mode	: 'edit',
					lang	: page_globals.dedalo_application_lang
				})
				.then(instance => instance.build(true))
				.then(instance => instance.render())
				.then(wrapper => {
					document.body.appendChild(wrapper)
				})
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