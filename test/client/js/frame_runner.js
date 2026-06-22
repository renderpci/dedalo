// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0

/**
* FRAME_RUNNER
* Runs inside the iframe. Loads test files and reports results to parent.
* Any setup failure (bad area, missing login, import/runtime error) is reported
* to the parent as `test_error` so a suite never silently hangs the queue.
*/

import {data_manager} from '../../../core/common/js/data_manager.js'
import {set_environment} from '../../../core/common/js/common.js'
import {url_vars_to_object} from '../../../core/common/js/utils/index.js'

const url_vars = url_vars_to_object(window.location.search)
const area = url_vars.area

// report_error: notify the parent so the card fails instead of hanging
function report_error(err) {
	window.parent.postMessage({
		type	: 'test_error',
		area	: area || null,
		error	: String((err && err.message) || err)
	}, '*')
}

if (!area) {
	report_error('No test area specified')
	throw 'No test area specified'
}

// inherit theme from URL — keep the chrome and the embedded Dédalo
// components (styled by main.css via data-theme) in the same theme.
// Dédalo convention: light = no attribute; dark = data-theme="dark".
if (url_vars.theme === 'dark') document.documentElement.setAttribute('data-theme', 'dark')
else document.documentElement.removeAttribute('data-theme')

let ready = false
try {
	await (async () => {
		window.page_globals = {
			api_errors: [],
			request_message: null
		}
		window.get_label = {}
		window.SHOW_DEBUG = false
		window.DEVELOPMENT_SERVER = false
		window.DEDALO_API_URL = '../../core/api/v1/json/'
		// app-global the full page injects server-side; some components (e.g. install)
		// read it as a bare global fallback, so stub it to avoid a ReferenceError
		window.PHP_VERSION = window.PHP_VERSION || ''

		const rqo = {
			action: 'get_environment',
			prevent_lock: true
		}
		const api_response = await data_manager.request({ body: rqo })
		set_environment(api_response.result)
	})()

	if (page_globals.is_logged !== true) {
		// render the login form and report so the parent does not wait forever
		const module = await import('../../../core/common/js/instances.js')
		const instance = await module.get_instance({
			model: 'login',
			tipo: 'dd229',
			mode: 'edit',
			lang: page_globals.dedalo_application_lang
		})
		await instance.build(true)
		const wrapper = await instance.render()
		document.body.appendChild(wrapper)
		report_error('Login is required')
	} else {
		// load test file
		await import(`./${area}.js`)
		ready = true
	}
} catch (err) {
	report_error(err)
}

if (ready) {
	// run mocha
	mocha.checkLeaks(false)
	mocha.setup({
		globals: ['flatpickr']
	})

	const runner = mocha.run()

	runner.on('test', function(test) {
		window.parent.postMessage({ type: 'test_start', title: test.title }, '*')
	})

	runner.on('end', function() {
		window.parent.postMessage({
			type	: 'test_end',
			area	: area,
			stats	: {
				pass	: runner.stats.passes,
				fail	: runner.stats.failures,
				pending	: runner.stats.pending
			}
		}, '*')
	})
}

// listen for theme changes from parent
window.addEventListener('message', function(e) {
	if (e.data && e.data.type === 'theme') {
		if (e.data.light) document.documentElement.removeAttribute('data-theme')
		else document.documentElement.setAttribute('data-theme', 'dark')
	}
})

// @license-end
