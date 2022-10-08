/*global page_globals, mocha */
/*eslint no-undef: "error"*/
// import {get_instance} from '../../common/js/instances.js'


// exec mocha
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

	}else{

		// let's go run

		mocha.checkLeaks(false)
		mocha.setup({globals: [
			'flatpickr' // library used by component_date
		]});

		mocha.run();
	}
