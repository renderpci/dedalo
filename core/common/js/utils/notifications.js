// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



//import
	import {ui} from '../ui.js'



/**
* RENDER_NODE_INFO
* render a node with the information sent by the server when the components save, if all go ok it will be green with the msg from server if no it will be red.
* @param options object
* 	Has the instance and the api_response from the 'save' event sent by the components
* @return node node_info
* with the message and the node css class of the server response.
*/
export function render_node_info(options) {

	// options
		const instance		= options.instance // optional object element instance (component, section, etc.)
		const api_response	= options.api_response // optional object|null
		const msg			= options.msg // string optional event message
		const type			= options.type || 'save'
		const remove_time	= options.remove_time

	// node_info. create temporal node info
		const node_info = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'bubble'
		})

	// fade_away
		const fade_away = (bubble, delay = 10000) => {
			// remove node on timeout
			setTimeout(()=>{
				// node_info.remove()
				bubble.onanimationend = (e) => {
					if (e.target.classList.contains('fade-out')) {
						bubble.parentNode.removeChild(bubble);
					}
				};
				// To fade away:
				bubble.classList.add('fade-out');
			}, delay)
		}

	// remove node on click
		const click_handler = (e) => {
			e.stopPropagation()
			node_info.remove()
		}
		node_info.addEventListener('click', click_handler)

	switch (type) {

		case 'warning' : {
			node_info.classList.add('warning')
			const text = msg
			node_info.insertAdjacentHTML('afterbegin', text)
			// remove node on timeout
			if (remove_time) {
				fade_away(node_info, remove_time)
			}
			break;
		}

		case 'error' : {
			node_info.classList.add('error')
			const text = msg
			node_info.insertAdjacentHTML('afterbegin', text)
			// remove node on timeout
			if (remove_time) {
				fade_away(node_info, remove_time)
			}
			break;
		}

		case 'save':
		default:
			// msg. Based on API response result
			if(api_response) {

				if (api_response.result===false) {

					// error response

					node_info.classList.add('error')
					const text = `${get_label.fail_to_save || 'Failed to save'} <br>${instance.label}`
					node_info.insertAdjacentHTML('afterbegin', text)
					// error msg
						const ar_msg = []
						if (api_response.error) {
							// Typically, api_response.error is an Error object. Extract the message if it exists.
							const message = api_response.error.message || JSON.stringify(api_response.error)
							ar_msg.push(message)
						}
						// Add the message to the error array only if it is different from the error message already added.
						if (api_response.msg && !ar_msg.includes(api_response.msg)) {
							ar_msg.push(api_response.msg)
						}
						if (ar_msg.length>0) {
							node_info.insertAdjacentHTML('beforeend', '<br>' + ar_msg.join('<br>') )
						}
				}else{

					// OK response

					node_info.classList.add('ok')
					const text = `${instance.label} ${get_label.saved || 'Saved'}`
					node_info.insertAdjacentHTML('afterbegin', text)

					// remove node on timeout
					fade_away(node_info, 10000)
				}
			}else{

				// error on save (saved false case)

				node_info.classList.add('warning')
				const text = `${msg} <br>${instance.label}`
				node_info.insertAdjacentHTML('afterbegin', text)

				// remove node on timeout
				fade_away(node_info, 30000)
			}
			break;
	}


	return node_info
}//end render_node_info



// @license-end
