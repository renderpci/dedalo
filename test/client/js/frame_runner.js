// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0

/**
* FRAME_RUNNER
* Runs inside the iframe. Loads test files and reports results to parent.
*/

import {data_manager} from '../../../core/common/js/data_manager.js'
import {set_environment} from '../../../core/common/js/common.js'
import {url_vars_to_object} from '../../../core/common/js/utils/index.js'

const url_vars = url_vars_to_object(window.location.search)
const area = url_vars.area

if (!area) {
	window.parent.postMessage({ type: 'test_error', error: 'No test area specified' }, '*')
	throw 'No test area specified'
}

// inherit theme from URL
if (url_vars.theme === 'light') {
	document.documentElement.classList.add('light')
}

await (async () => {
	window.page_globals = {
		api_errors: [],
		request_message: null
	}
	window.get_label = {}
	window.SHOW_DEBUG = false
	window.DEVELOPMENT_SERVER = false
	window.DEDALO_API_URL = '../../core/api/v1/json/'

	const rqo = {
		action: 'get_environment',
		prevent_lock: true
	}
	const api_response = await data_manager.request({ body: rqo })
	set_environment(api_response.result)
})()

if (page_globals.is_logged !== true) {
	import('../../../core/common/js/instances.js')
	.then(async function(module) {
		const instance = await module.get_instance({
			model: 'login',
			tipo: 'dd229',
			mode: 'edit',
			lang: page_globals.dedalo_application_lang
		})
		await instance.build(true)
		const wrapper = await instance.render()
		document.body.appendChild(wrapper)
	})
	throw 'Login is required'
}

// load test file
await import(`./${area}.js`)

// run mocha
mocha.checkLeaks(false)
mocha.setup({
	globals: ['flatpickr']
})

const runner = mocha.run()

runner.on('test', function(test) {
	window.parent.postMessage({ type: 'test_start', title: test.title }, '*')
})

runner.on('pass', function(test) {
	window.parent.postMessage({ type: 'test_pass', title: test.title }, '*')
})

runner.on('fail', function(test, err) {
	window.parent.postMessage({ type: 'test_fail', title: test.title, error: err.message }, '*')
})

runner.on('end', function() {
	window.parent.postMessage({ type: 'test_end', area: area }, '*')
})

// listen for theme changes from parent
window.addEventListener('message', function(e) {
	if (e.data && e.data.type === 'theme') {
		document.documentElement.classList.toggle('light', e.data.light)
	}
})

// inherit theme from parent on load
try {
	const parent_light = document.documentElement.classList.contains('light')
	if (parent_light) {
		document.documentElement.classList.add('light')
	}
} catch(e) {}

// @license-end
