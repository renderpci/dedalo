// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/

const t0 = performance.now()

// page instance imports
	import '../js/page.js'
	import {events_init} from '../../common/js/events.js'
	import {get_instance} from '../../common/js/instances.js'
	// import {data_manager} from '../../common/js/data_manager.js' (environment from API case)
	import {render_server_response_error} from '../../common/js/render_common.js'

// page start
	( async () => {

		// environment from API
			// config_client. Set vars as global
				// for (const [key, value] of Object.entries(config_client)) {
				// 	window[key] = value
				// }
			// dedalo_environment
				// const rqo_environment = { // rqo (request query object)
				// 	action			: 'get_environment',
				// 	prevent_lock	: true
				// }
				// const api_response_environment = await data_manager.request({
				// 	body : rqo_environment
				// });
				// console.log('api_response_environment:', api_response_environment.result);
				// // set vars as global
				// for (const [key, value] of Object.entries(api_response_environment.result)) {
				// 	switch (key) {
				// 		case 'plain_vars':
				// 			for (const property in value) {
				// 				window[property] = value[property]
				// 			}
				// 			break;

				// 		default:
				// 			window[key] = value
				// 			break;
				// 	}
				// }

		// check environment
			if (typeof page_globals==='undefined') {
				const error_node = render_server_response_error([{
					msg		: 'Error: the <a href="../common/js/environment.js.php?v=1">environment</a> is not available. Check that PHP server is running and configuration files are correct',
					error	: null
				}], false)
				document.getElementById('main').appendChild(error_node)
				return
			}

		// main events init (visibility change, save,..)
			events_init()

		// main CSS add loading
			const main = document.getElementById('main')
				  main.classList.add('loading')

		// page instance init
			const page_instance = await get_instance({
				model : 'page'
			});

		// page instance build and render
			const build			= await page_instance.build(true)
			const wrapper_page	= await page_instance.render()

		// main. Add wrapper page node and restore class
			main.appendChild(wrapper_page)
			main.classList.remove('loading','hide')

		// debug
			if(SHOW_DEBUG===true) {
				// console.log("%c + Page instantiated and rendered total (ms): ", 'background: #000000; color: violet', performance.now()-t0 )
				// dd_console(`__Time to Page init, build and render: ${Math.round(performance.now()-t0)} ms`)
			}
	})()



// scroll window. Improve performance in browser scroll
	let lastScrollY, scheduledAnimationFrame
	const readAndUpdatePage = (e) => {
	}
	function onScroll (evt) {

		// Store the scroll value for laterz.
		lastScrollY = window.scrollY;

		// Prevent multiple rAF callbacks.
		if (scheduledAnimationFrame)
		return;

		scheduledAnimationFrame = true;
		requestAnimationFrame(readAndUpdatePage);
	}
	window.addEventListener('scroll', onScroll);



// @license-end
