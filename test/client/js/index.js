// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0

/**
* UNIT_TEST
* To check Dédalo elements basic functionalities
*/

// imports
	import {data_manager} from '../../../core/common/js/data_manager.js'
	import {set_environment} from '../../../core/common/js/common.js'
	import {url_vars_to_object} from '../../../core/common/js/utils/index.js'

// check url vars
	const url_vars = url_vars_to_object(window.location.search);

// page start
	await ( async () => {

		window.page_globals = {
			api_errors : [],
			request_message : null
		}
		window.get_label = {}
		window.SHOW_DEBUG = false
		window.DEVELOPMENT_SERVER = false
		window.DEDALO_API_URL = '../../core/api/v1/json/'

		const rqo = {
			action			: 'get_environment',
			prevent_lock	: true
		}
		const api_response = await data_manager.request({
			body : rqo
		});
		set_environment(api_response.result)
	})()

// login check
	if (page_globals.is_logged!==true) {

		import ('../../../core/common/js/instances.js')
		.then(async function(module){
			const instance = await module.get_instance({
				model	: 'login',
				tipo	: 'dd229',
				mode	: 'edit',
				lang	: page_globals.dedalo_application_lang
			})
			await instance.build(true);
			const wrapper = await instance.render()
			document.body.appendChild(wrapper)
		})
		throw 'Login is required';
	}

// load sidebar
	const list_module = await import('./list.js')
	const { test_cards, mark_test_status } = list_module

// iframe management
	const test_frame = document.getElementById('test_frame')
	const placeholder = document.getElementById('main_placeholder')
	let run_all_queue = []
	let run_all_index = 0
	let run_all_active = false

// load_test: load a test in the iframe
window.load_test = function(area, model, test_name, on_complete) {
	// hide placeholder
	if (placeholder) placeholder.style.display = 'none'

	// show iframe
	test_frame.style.display = 'block'

	// mark as running
	mark_test_status(test_name, 'running')

	// update url
	const params = new URLSearchParams()
	params.set('area', area)
	if (model) params.set('model', model)
	window.history.replaceState({}, '', `./?${params.toString()}`)

	// set iframe src - fresh page load each time
	const is_light = document.documentElement.classList.contains('light')
	test_frame.src = `./frame.html?area=${area}${model ? '&model=' + model : ''}&theme=${is_light ? 'light' : 'dark'}`

	// listen for iframe messages
	const handler = function(e) {
		if (!e.data || !e.data.type) return

		if (e.data.type === 'test_start') {
			mark_test_status(test_name, 'running')
		}
		else if (e.data.type === 'test_pass') {
			mark_test_status(test_name, 'pass')
		}
		else if (e.data.type === 'test_fail') {
			mark_test_status(test_name, 'fail')
		}
		else if (e.data.type === 'test_end') {
			window.removeEventListener('message', handler)
			if (typeof on_complete === 'function') {
				on_complete()
			}
		}
		else if (e.data.type === 'test_error') {
			mark_test_status(test_name, 'fail')
			window.removeEventListener('message', handler)
			if (typeof on_complete === 'function') {
				on_complete()
			}
		}
	}

	window.addEventListener('message', handler)
}

// run all
	const run_all_btn = document.getElementById('test_run_all')
	if (run_all_btn) {
		run_all_btn.addEventListener('click', () => {
			if (run_all_btn.disabled) return
			const visible_cards = test_cards.filter(c => c.style.display !== 'none')
			if (visible_cards.length === 0) return

			run_all_btn.disabled = true
			run_all_btn.querySelector('.run_all_text').textContent = 'running…'
			run_all_queue = visible_cards
			run_all_index = 0
			run_all_active = true

			function run_next() {
				if (run_all_index >= run_all_queue.length) {
					run_all_btn.disabled = false
					run_all_btn.querySelector('.run_all_text').textContent = 'run all'
					run_all_active = false
					return
				}
				const card = run_all_queue[run_all_index]
				run_all_index++
				card.classList.add('test_card_active')
				const area = card.dataset.area
				const model = card.dataset.model || null
				const test_name = card.dataset.testName

				window.load_test(area, model, test_name, () => {
					card.classList.remove('test_card_active')
					setTimeout(run_next, 200)
				})
			}

			run_next()
		})
	}

// theme toggle
	const theme_toggle = document.getElementById('theme_toggle')
	const icon_moon = theme_toggle?.querySelector('.theme_icon_moon')
	const icon_sun = theme_toggle?.querySelector('.theme_icon_sun')

	function set_theme(light) {
		document.documentElement.classList.toggle('light', light)
		if (icon_moon) icon_moon.style.display = light ? 'none' : 'block'
		if (icon_sun) icon_sun.style.display = light ? 'block' : 'none'
		try { localStorage.setItem('dedalo_test_theme', light ? 'light' : 'dark') } catch(e) {}
		// sync iframe
		if (test_frame.contentWindow) {
			test_frame.contentWindow.postMessage({ type: 'theme', light: light }, '*')
		}
	}

	// restore saved theme
	const saved = localStorage.getItem('dedalo_test_theme')
	set_theme(saved === 'light')

	if (theme_toggle) {
		theme_toggle.addEventListener('click', () => {
			set_theme(!document.documentElement.classList.contains('light'))
		})
	}

// if url has area, auto-load it
	if (url_vars.area) {
		const area = url_vars.area
		const model = url_vars.model || null
		const test_name = model || area

		for (const card of test_cards) {
			if (card.dataset.testName === test_name.toLowerCase()) {
				card.classList.add('test_card_active')
				break
			}
		}

		setTimeout(() => {
			window.load_test(area, model, test_name)
		}, 100)
	}

// @license-end
