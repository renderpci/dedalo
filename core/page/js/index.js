// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/

const t0 = performance.now()

	// page instance imports
	import '../js/page.js'
	import {events_init} from '../../common/js/events.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import {get_instance} from '../../common/js/instances.js'
	// import {url_vars_to_object, JSON_parse_safely} from '../../common/js/utils/index.js'
	import {render_server_response_error} from '../../common/js/render_common.js'
	import {render_page} from '../js/render_page.js'
	// import {config_client} from '../../../config/config_client.js' // working here !


	( async () => {

		// environment from API
			// // config_client. Set vars as global
			// 	// for (const [key, value] of Object.entries(config_client)) {
			// 	// 	window[key] = value
			// 	// }
			// // dedalo_environment
			// 	const rqo_environment = { // rqo (request query object)
			// 		action			: 'get_environment',
			// 		prevent_lock	: true
			// 	}
			// 	const api_response_environment = await data_manager.request({
			// 		body : rqo_environment
			// 	});
			// 	console.log('api_response_environment:', api_response_environment);
			// 	// set vars as global
			// 	for (const [key, value] of Object.entries(api_response_environment.result)) {
			// 		window[key] = value
			// 	}

		// check environment
			if (typeof page_globals==='undefined') {
				const error_node = render_server_response_error([{
					msg		: 'Error: the environment is not available. Check your server configuration files',
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

		/* DES (moved to page build method)
			// searchParams
				const searchParams = new URLSearchParams(window.location.href);

			// menu
				const menu = searchParams.has('menu')
					? JSON_parse_safely(
						searchParams.get('menu'), // string from url
						true // fallback on exception parsing string
					  )
					: true

			// start bootstrap
				const rqo = { // rqo (request query object)
					action			: 'start',
					prevent_lock	: true,
					options : {
						search_obj	: url_vars_to_object(location.search),
						menu		: menu //  bool
					}
				}

				// request page context (usually menu and section context)
				const api_response = await data_manager.request({
					body : rqo
				});
				// api_response.result = false
				console.log(`+++ API start: ${(performance.now()-t0).toFixed(3)} rqo:`, rqo, 'api_response', api_response);

			// error case
				if (!api_response || !api_response.result) {

					// running_with_errors
						const running_with_errors = [
							{
								msg		: api_response.msg || 'Invalid API result',
								error	: api_response.error || 'unknown'
							}
						]
					const wrapper_page = render_server_response_error(
						running_with_errors
					)
					main.appendChild(wrapper_page)
					main.classList.remove('loading','hide')

					return
				}
				// server_errors check (page and environment)
				if (api_response.dedalo_last_error) {
					console.error('Page running with server errors. dedalo_last_error: ', api_response.dedalo_last_error);
				}
				if (page_globals.dedalo_last_error) {
					console.error('Environment running with server errors. dedalo_last_error: ', page_globals.dedalo_last_error);
				}

			// page instance init
				const page_instance = await get_instance({
					model	: 'page',
					context	: api_response.result.context // array page context items (usually menu, section )
				});
		*/

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
