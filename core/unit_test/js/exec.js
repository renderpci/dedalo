/*global page_globals, mocha */
/*eslint no-undef: "error"*/



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
