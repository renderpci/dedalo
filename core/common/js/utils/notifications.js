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
		const instance		= options.instance // object element instance (component, section, etc.)
		const api_response	= options.api_response // object|null
		const msg			= options.msg // string optional event message
		const container		= options.container // DOM node container

	// node_info. create temporal node info
		const node_info = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'node_info_save_msg'
		})

	// remove node on click
		node_info.addEventListener('click', function(){
			node_info.remove()
		})

	// msg. Based on API response result
		if(api_response) {

			if (api_response.result===false) {

				// error response

				node_info.classList.add('error')
				const text = `${get_label.fail_to_save || 'Failed to save'} <br>${instance.label}`
				node_info.insertAdjacentHTML('afterbegin', text)
				// error msg
					const msg = []
					if (api_response.error) {
						msg.push(api_response.error)
					}
					if (api_response.msg) {
						msg.push(api_response.msg)
					}
					if (msg.length>0) {
						node_info.insertAdjacentHTML('beforeend', '<br>' + msg.join('<br>') )
					}
			}else{

				// ok response

				node_info.classList.add('ok')
				const text = `${instance.label} ${get_label.guardado || 'Saved'}`
				node_info.insertAdjacentHTML('afterbegin', text)

				// remove node on timeout
					setTimeout(function(){
						// node_info.remove()
						node_info.onanimationend = (e) => {
							if (e.target.classList.contains('fade-out')) {
								node_info.parentNode.removeChild(node_info);
							}
						};
						// To fade away:
						node_info.classList.add('fade-out');
					}, 10000)
			}
		}else{

			// error on save (saved false case)

			node_info.classList.add('warning')
			const text = `${msg} <br>${instance.label}`
			node_info.insertAdjacentHTML('afterbegin', text)

			// remove node on timeout
				setTimeout(function(){
					node_info.remove()
				}, 30000)
		}

		// position node info based on last existing node_info



	return node_info
}//end render_node_info
