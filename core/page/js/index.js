// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/

const t0 = performance.now()

// page instance imports
	import '../js/page.js'
	import '../js/worker_cache.js'
	import {events_init} from '../../common/js/events.js'
	import {get_instance} from '../../common/js/instances.js'



// page start
	( async () => {

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
				  main.classList.add('loading')

		// page instance init
			const page_instance = await get_instance({
				model : 'page'
			});

		// page instance build (exec a start request to API)
			await page_instance.build(true)

		// page instance render
			const wrapper_page = await page_instance.render()
			// main. Add wrapper page node and restore class
			main.appendChild(wrapper_page)
			main.classList.remove('loading','hide')

		// debug
			if(typeof SHOW_DEBUG!=='undefined' && SHOW_DEBUG===true) {
				console.log("%c + Page instantiated, built and rendered total (ms): ", 'background: #000000; color: violet', performance.now()-t0 )
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
		if (scheduledAnimationFrame)
		return;

		scheduledAnimationFrame = true;
		requestAnimationFrame(readAndUpdatePage);
	}
	window.addEventListener('scroll', onScroll);



// @license-end
