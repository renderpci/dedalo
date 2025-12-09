// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/

const t0 = performance.now()

// page instance imports
	import '../js/page.js'
	import '../../common/js/event_manager.js'
	import {events_init} from '../../common/js/events.js'
	import {get_instance} from '../../common/js/instances.js'

// page start
( async () => {

	try {

		// page_globals. Set basic properties
			window.page_globals = {
				// API response errors
				api_errors : [],
				// API response last message
				request_message : null
			}
			window.get_label = {}
			window.SHOW_DEBUG = false
			window.DEVELOPMENT_SERVER = false

		// main events init (visibility change, save,..)
			events_init()

		// main CSS add loading
			const main = document.getElementById('main')
			if (!main) {
				console.warn('Missing #main element. Aborting bootstrap.')
				return
			}
			const starting_node = document.createElement('div')
			starting_node.className = 'starting blink'
			starting_node.textContent = 'Starting.. Please wait.'
			main.appendChild(starting_node)

		// page instance init
			const page_instance = await get_instance({
				model : 'page'
			});

		// page instance build (exec a start request to API)
			await page_instance.build(true)

		// page instance render
			const wrapper_page = await page_instance.render()
			if (!wrapper_page) {
				console.error('page render returned no node')
				return
			}

			// main. Add wrapper page node and restore class
			while (main.firstChild) {
				main.removeChild(main.firstChild);
			}
			main.appendChild(wrapper_page)
			main.classList.remove('hide')

		// debug
			if (window.SHOW_DEBUG === true) {
				console.log("%c + Page instantiated, built and rendered total (ms): ", 'background: #000000; color: violet', performance.now()-t0 )
			}

	} catch (err) {
		const main = document.getElementById('main')
		if (main) {
			while (main.firstChild) main.removeChild(main.firstChild)
			const error_ode = document.createElement('div')
			error_ode.className = 'starting error'
			error_ode.textContent = 'Error starting page. See console.'
			main.appendChild(error_ode)
			main.classList.remove('hide')
		}
		console.error('Error bootstrapping page:', err)
	}

})()

// scroll window. Improve performance in browser scroll
	let lastScrollY, scheduledAnimationFrame
	const readAndUpdatePage = (e) => {
	}
	function onScroll (evt) {

		// Store the scroll value for use later.
		lastScrollY = window.scrollY;

		// Prevent multiple rAF callbacks.
		if (scheduledAnimationFrame) {
			return;
		}

		scheduledAnimationFrame = true;
		requestAnimationFrame(readAndUpdatePage);
	}
	window.addEventListener('scroll', onScroll, { passive: true });

// @license-end
