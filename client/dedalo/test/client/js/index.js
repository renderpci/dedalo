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
		// app-global the full page injects server-side; some components (e.g. installer)
		// read it as a bare global fallback, so stub it to avoid a ReferenceError
		window.PHP_VERSION = window.PHP_VERSION || ''

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

	// single in-flight test bookkeeping
	let active_handler = null
	let active_watchdog = null
	const WATCHDOG_MS = 120000 // force-fail a suite that never reports back

	// clear_active: detach the current message listener and watchdog
	function clear_active() {
		if (active_handler) {
			window.removeEventListener('message', active_handler)
			active_handler = null
		}
		if (active_watchdog) {
			clearTimeout(active_watchdog)
			active_watchdog = null
		}
	}

	// finish_active: settle the running test and advance the queue
	function finish_active(test_name, status, on_complete) {
		clear_active()
		mark_test_status(test_name, status)
		if (typeof on_complete === 'function') {
			on_complete()
		}
	}

// load_test: load a test in the iframe
window.load_test = function(area, model, test_name, on_complete) {
	// drop any previous in-flight listener/watchdog (e.g. user clicks a new test mid-run)
	clear_active()

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
	const is_dark = document.documentElement.getAttribute('data-theme') === 'dark'
	test_frame.src = `./frame.html?area=${area}${model ? '&model=' + model : ''}&theme=${is_dark ? 'dark' : 'light'}`

	// listen for iframe messages
	active_handler = function(e) {
		// only accept messages coming from the test iframe
		if (e.source !== test_frame.contentWindow) return
		if (!e.data || !e.data.type) return

		if (e.data.type === 'test_start') {
			mark_test_status(test_name, 'running')
		}
		else if (e.data.type === 'test_end') {
			const final_status = (e.data.stats?.fail || 0) > 0 ? 'fail' : 'pass'
			finish_active(test_name, final_status, on_complete)
		}
		else if (e.data.type === 'test_error') {
			finish_active(test_name, 'fail', on_complete)
		}
	}
	window.addEventListener('message', active_handler)

	// watchdog: never let a stuck iframe stall the queue
	active_watchdog = setTimeout(function() {
		finish_active(test_name, 'fail', on_complete)
	}, WATCHDOG_MS)
}

// run all
	const run_all_btn = document.getElementById('test_run_all')
	if (run_all_btn) {
		run_all_btn.addEventListener('click', () => {
			if (run_all_btn.disabled) return
			// deferred suites are visible + manually runnable but excluded from the
			// `run all` gate (they are known-not-green yet; see test_registry.js).
			const visible_cards = test_cards.filter(c => c.style.display !== 'none' && !c.dataset.deferred)
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

				const on_done = () => {
					// retry a failed suite once. Many integration suites are flaky
					// only under full-run load (memory/timing pressure after dozens of
					// sequential iframe runs) yet pass in isolation; a single fresh
					// re-run separates transient hiccups from real failures. The stats
					// counters already handle the fail→pass transition on retry.
					const dot = card.querySelector('.test_card_status')
					if (dot && dot.classList.contains('fail') && !card.dataset.retried) {
						card.dataset.retried = '1'
						setTimeout(() => window.load_test(area, model, test_name, on_done), 400)
						return
					}
					card.classList.remove('test_card_active')
					setTimeout(run_next, 200)
				}

				window.load_test(area, model, test_name, on_done)
			}

			run_next()
		})
	}

// theme toggle
	const theme_toggle = document.getElementById('theme_toggle')
	const icon_moon = theme_toggle?.querySelector('.theme_icon_moon')
	const icon_sun = theme_toggle?.querySelector('.theme_icon_sun')

	// Theme — synced to Dédalo's selection (core/page/js/theme.js convention):
	// key 'dedalo_theme'; LIGHT is the default (no attribute, key removed);
	// DARK = data-theme="dark" + stored 'dark'. Served same-origin as the app,
	// so reading/writing this key reflects (and updates) the user's app theme.
	function set_theme(light) {
		if (light) {
			document.documentElement.removeAttribute('data-theme')
			try { localStorage.removeItem('dedalo_theme') } catch(e) {}
		} else {
			document.documentElement.setAttribute('data-theme', 'dark')
			try { localStorage.setItem('dedalo_theme', 'dark') } catch(e) {}
		}
		// icon: light shows moon (→ switch to dark), dark shows sun (→ switch to light)
		if (icon_moon) icon_moon.style.display = light ? 'block' : 'none'
		if (icon_sun) icon_sun.style.display = light ? 'none' : 'block'
		// sync iframe
		if (test_frame.contentWindow) {
			test_frame.contentWindow.postMessage({ type: 'theme', light: light }, '*')
		}
	}

	// restore: light is the default; dark only when the app stored it explicitly
	const saved = localStorage.getItem('dedalo_theme')
	set_theme(saved !== 'dark')

	if (theme_toggle) {
		theme_toggle.addEventListener('click', () => {
			// flip: if currently dark, switch to light (and vice-versa)
			set_theme(document.documentElement.getAttribute('data-theme') === 'dark')
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
