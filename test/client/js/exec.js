// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0



/**
 * EXEC MOCHA
 *
 */



// check logged user first
	if (page_globals.is_logged!==true) {

		// user is not logged

		import ('../../../core/common/js/instances.js')
		.then(async function(module){

			// login instance add
				module.get_instance({
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
		throw 'Login is required (2)';
	}


// let's go run
	mocha.checkLeaks(false)
	mocha.setup({globals: [
		'flatpickr' // library used by component_date
	]});

	mocha.run();



// @license-end
