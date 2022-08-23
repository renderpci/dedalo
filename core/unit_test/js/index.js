/*global page_globals, mocha */
/*eslint no-undef: "error"*/



/**
* UNIT_TEST
* 	To check basic functionalities of Dédalo elements
*/



// test
	// import './test_key_instances.js'
	// import './test_get_instance.js'
	// import './test_delete_instance.js'
	// import './test_components_lifecycle.js'
	import './test_components_data_changes.js'


// exec mocha
	if (page_globals.is_logged!==true) {

		// user is not logged
		const container = document.getElementById('mocha')
		if (container) {
			container.innerHTML = `Please, login`
		}

	}else{

		mocha.checkLeaks(false)
		mocha.setup({globals: [
			'flatpickr' // library used by component_date
		]});

		mocha.run();
	}
