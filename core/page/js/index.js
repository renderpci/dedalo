/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/

const t0 = performance.now()

	// page instance imports
	import '../js/page.js'
	import {events_init} from '../../common/js/events.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import {get_instance} from '../../common/js/instances.js'
	import {url_vars_to_object, JSON_parse_safely} from '../../common/js/utils/index.js'
	import {render_page} from '../js/render_page.js'
	// import {config_client} from '../../../config/config_client.js'


	( async () => {

		// environment from API
			// // config_client. Set vars as global
			// 	for (const [key, value] of Object.entries(config_client)) {
			// 		window[key] = value
			// 	}
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


		// main events init
			events_init()

		// main CSS add loading
			const main = document.getElementById('main')
				  main.classList.add('loading')

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
				search_obj		: url_vars_to_object(location.search),
				menu			: menu,
				prevent_lock	: true
			}

			// request page context (usually menu and section context)
			const api_response = await data_manager.request({
				body : rqo
			});
			// api_response.result = false
			console.log(`+++ API start: ${(performance.now()-t0).toFixed(3)} rqo:`, rqo, 'api_response', api_response);

		// error case
			if (!api_response || !api_response.result) {

				const wrapper_page = render_page.render_server_response_error(api_response.msg || 'Invalid result')
				main.appendChild(wrapper_page)
				main.classList.remove('loading','hide')

				return
			}

		// page instance init
			const page_instance = await get_instance({
				model	: 'page',
				context	: api_response.result // array page context items (usually menu, section )
			});

		// page instance build and render
			const build			= await page_instance.build()
			const wrapper_page	= await page_instance.render()

		// main. Add wrapper page node and restore class
			main.appendChild(wrapper_page)
			main.classList.remove('loading','hide')

		// page title update
			const section_info = api_response.result.find(el => el.model==='section' || el.model.indexOf('area')===0)
			if (section_info) {
				document.title =  'V6 ' + section_info.tipo + ' ' + section_info.label
			}

		// debug
			if(SHOW_DEBUG===true) {
				// console.log("%c + Page instantiated and rendered total (ms): ", 'background: #000000; color: violet', performance.now()-t0 )
				// dd_console(`__Time to Page init, build and render: ${Math.round(performance.now()-t0)} ms`)
			}
	})()
