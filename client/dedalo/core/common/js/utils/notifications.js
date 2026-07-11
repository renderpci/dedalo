// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



/**
* NOTIFICATIONS
* Transient UI notification bubbles surfaced after server interactions.
*
* Exports `render_node_info`, which creates a self-contained "bubble" DOM
* element colour-coded by outcome type ('save', 'success', 'warning', 'error').
* Callers append the returned node to the document; the module handles
* auto-dismissal via a CSS fade-out animation and click-to-dismiss.
*
* The helper `append_text_with_breaks` (module-private) is the only safe way
* to inject user-visible messages into the DOM — it prevents XSS by never
* calling innerHTML or insertAdjacentHTML.
*/

//import
	import {ui} from '../ui.js'



/**
* APPEND_TEXT_WITH_BREAKS
* SEC-029: safe alternative to insertAdjacentHTML for messages that may contain
* attacker-controlled fragments (component labels, api_response.msg, error messages).
* Splits the input on `<br>` literals (the only HTML token the previous code relied on)
* and emits text nodes + <br> elements so that any other HTML/script payload is rendered
* as text rather than parsed.
*
* Only `<br>` / `<br/>` / `<br />` (case-insensitive) are treated as markup;
* every other character — including `<script>`, attribute injections, etc. — is
* emitted as an inert text node.
*
* @param {HTMLElement} target - the container element to receive content
* @param {string} text - message string, may contain `<br>` separators
* @param {string} position - insertion point: 'afterbegin' (prepend) or 'beforeend' (append)
* @returns {void}
*/
function append_text_with_breaks(target, text, position = 'beforeend') {
	const frag = document.createDocumentFragment()
	const parts = String(text ?? '').split(/<br\s*\/?>/i)
	parts.forEach((part, i) => {
		if (i > 0) frag.appendChild(document.createElement('br'))
		if (part.length) frag.appendChild(document.createTextNode(part))
	})
	if (position === 'afterbegin') {
		target.insertBefore(frag, target.firstChild)
	} else {
		target.appendChild(frag)
	}
}



/**
* RENDER_NODE_INFO
* Builds and returns a transient notification bubble DOM element that reflects
* the outcome of a server operation (typically a component save).
*
* The returned `<div class="bubble">` is unstyled at this point — callers are
* responsible for appending it to the document at the appropriate position (e.g.
* alongside the component or in a global toast container). Once in the DOM the
* element self-manages: it auto-dismisses after `remove_time` milliseconds via a
* CSS 'fade-out' animation, and it removes itself immediately on click.
*
* Type dispatch:
*   'save'    (default) — colour and text derived from `api_response.result`.
*                         Green ('ok' class) on success; red ('error' class) on failure.
*                         Error details from api_response.error + api_response.msg are
*                         appended as additional lines. Falls back to 'warning' when
*                         api_response is absent (e.g. the save short-circuited client-side).
*   'success' — green bubble; caller supplies `msg` and optionally `remove_time`.
*   'warning' — yellow bubble; caller supplies `msg` and optionally `remove_time`.
*   'error'   — red bubble; caller supplies `msg` and optionally `remove_time`.
*
* @param {Object} options - configuration bag
* @param {Object} [options.instance] - component or section instance; used for label/model fallback
* @param {Object|null} [options.api_response] - server API response object (result, msg, error fields)
* @param {string} [options.msg] - message text for non-save types, or fallback text
* @param {string} [options.type='save'] - bubble variant: 'save' | 'success' | 'warning' | 'error'
* @param {number} [options.remove_time] - auto-dismiss delay; values >1000 are treated as
*   milliseconds, smaller positive values are treated as seconds (multiplied by 1000).
*   Omit or pass 0/null to suppress auto-dismissal for that type.
* @returns {HTMLElement} the populated bubble element (not yet attached to the document)
*/
export function render_node_info(options) {

	// options
		const instance		= options.instance // optional object element instance (component, section, etc.)
		const api_response	= options.api_response // optional object|null
		const msg			= options.msg // string optional event message
		const type			= options.type || 'save'
		// remove_time normalisation: values >1000 are already in ms; smaller positive
		// values are interpreted as whole seconds and converted to ms.
		const remove_time	= options.remove_time > 1000
			? options.remove_time // passed milliseconds as 15000
			: options.remove_time
				? (options.remove_time * 1000)  // passed seconds case as 15
				: null;

	// node_info. create temporal node info
		const node_info = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'bubble'
		})

	// fade_away
	// Schedules the bubble for removal after `delay` ms by appending the
	// 'fade-out' CSS class (which triggers a CSS animation). The node is
	// actually removed in the animationend handler to avoid a visible pop.
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
	// stopPropagation prevents the click from bubbling to parent listeners
	// (e.g. row-selection handlers in list views).
		const click_handler = (e) => {
			e.stopPropagation()
			node_info.remove()
		}
		node_info.addEventListener('click', click_handler)

	switch (type) {

		case 'warning' : {
			node_info.classList.add('warning')
			append_text_with_breaks(node_info, msg, 'afterbegin')
			// remove node on timeout
			if (remove_time) {
				fade_away(node_info, remove_time || 30000)
			}
			break;
		}

		case 'error' : {
			node_info.classList.add('error')
			append_text_with_breaks(node_info, msg, 'afterbegin')
			// remove node on timeout
			if (remove_time) {
				fade_away(node_info, remove_time || 3000)
			}
			break;
		}

		case 'success' : {
			node_info.classList.add('ok')
			append_text_with_breaks(node_info, msg, 'afterbegin')
			// remove node on timeout
			if (remove_time) {
				fade_away(node_info, remove_time || 3000)
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
					append_text_with_breaks(node_info, text, 'afterbegin')
					// error msg
					// Collect error detail lines, deduplicating api_response.msg
					// against the error object's own message to avoid repetition.
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
							append_text_with_breaks(node_info, '<br>' + ar_msg.join('<br>'), 'beforeend')
						}
				}else{

					// OK response

					node_info.classList.add('ok')
					// instance.model is used as a label fallback when the component
					// has not yet resolved a human-readable label.
					const text = `${instance.label || instance.model} ${get_label.saved || 'Saved'}`
					append_text_with_breaks(node_info, text, 'afterbegin')

					// remove node on timeout
					fade_away(node_info, 10000)
				}
			}else{

				// error on save (saved false case)
				// api_response is null/undefined — the save was rejected before reaching
				// the server or was short-circuited by client-side validation.

				node_info.classList.add('warning')
				const text = `${msg} <br>${instance.label}`
				append_text_with_breaks(node_info, text, 'afterbegin')

				// remove node on timeout
				fade_away(node_info, 30000)
			}
			break;
	}


	return node_info
}//end render_node_info



// @license-end
