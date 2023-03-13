/**
* UNIT_TEST
* 	To check Dédalo elements basic functionalities
*/


	import {url_vars_to_object} from '../../common/js/utils/index.js'

// check url vars
	const url_vars = url_vars_to_object(window.location.search)
	console.log('window.location.search:', url_vars);



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
		// load test
		await import(`./${area}.js`)
		// exec mocha
		import('./exec.js')
	} catch (error) {
		console.log(error)

		// list
		import('./list.js')
	}
