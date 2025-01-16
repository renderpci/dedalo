// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// import
	import {event_manager} from './event_manager.js'



/**
* unsaved_data set default
*/
if (typeof window!=='undefined' && typeof window.unsaved_data==='undefined') {
	window.unsaved_data = false
}



/**
* INIT  (!) WORK IN PROGRESS
* set the main events to the document
* event as visibilityState or beforeunload are init at load of the page
* this events are global and use to control the unsaved data of the page
* see the main page initialization in /page/index.html
* @return bool
*/
export const events_init = function() {

	// add visibility change to control if the user change the tab without save
		document.addEventListener('visibilitychange', visibility_change);
		async function visibility_change(){

			if (document.visibilityState==='hidden' && window.unsaved_data===true) {

				await saving
			}
		}

	// save
		const save_handler = (result) => {
			if(SHOW_DEBUG===true) {
				console.log('events_init save result:', result)
			}
			// saved = true
		}
		const saving = event_manager.subscribe('save', save_handler)


	return true
}//end events_init



/**
* SET_BEFORE_UNLOAD
* On true, attach a event listener to the window to prevent that user loose changed data on reload
* On false, the listener is removed to allow reload the page normally
* Note that this function is triggered as true when component input or editor data changes and
* with false when the component saves the data
* @param bool value
* @return bool
*/
export const set_before_unload = function(value) {
	if(SHOW_DEBUG===true) {
		console.warn("///////////////////// set_before_unload value:", value);
	}

	// already fixed current value (true/false)
		if (value===window.unsaved_data) {
			return
		}

	// fix value
		window.unsaved_data = value

	// add/remove listener
		// if (value===true) {
		// 	// window dialog will be shown when user leaves the page
		// 	addEventListener('beforeunload', before_unload_listener, {capture: true});
		// 	// window.unsaved_data = true
		// }else if(value===false){
		// 	// restore the normal page exit status
		// 	removeEventListener('beforeunload', before_unload_listener, {capture: true});
		// 	// window.unsaved_data = false
		// }

	return true
}//end set_before_unload



/**
* BEFOREUNLOADLISTENER
* Prevent to accidentally user leaves the page with unsaved changes
* @param object event
*/
	// const before_unload_listener = function(event) {
	// 	event.preventDefault();

	// 	// document.activeElement.blur()
	// 	if (window.unsaved_data===false) {
	// 		return
	// 	}

	// 	return event.returnValue = get_label.discard_changes || 'Discard unsaved changes?';
	// }//end before_unload_listener




/**
* WHEN_IN_DOM
* Exec a callback when node element is placed in the DOM (then is possible to know their size, etc.)
* Useful to render leaflet maps and so forth
* @param DOM node 'node'
* @param function callback
*
* @return mutation observer
*/
export const when_in_dom = function(node, callback) {

	if (document.contains(node)) {
		return callback()
	}

	const observer = new MutationObserver(function(mutations) {
		if (document.contains(node)) {
			// console.log("It's in the DOM!");
			observer.disconnect();

			callback()
		}
	});

	observer.observe(document, {attributes: false, childList: true, characterData: false, subtree:true});

	return observer
}//end when_in_dom



/**
* WHEN_IN_VIEWPORT
* Exec a callback when node element is visible in document viewport
* @param DOM node 'node'
* @param function callback
* @param bool once
*
* @return mutation observer
*/
export const when_in_viewport = function(node, callback, once=true) {

	// observer. Exec the callback when element is in viewport
	const observer = new IntersectionObserver(
		function(entries, observer) {

			const entry = entries[1] || entries[0]
			if (entry.isIntersecting===true || entry.intersectionRatio > 0) {

				// default is true (executes the callback once)
				if (once===true) {
					observer.disconnect();
				}

				// callback()
				window.requestAnimationFrame(callback)
			}
		},
		{
			rootMargin: "0px",
			threshold: [0]
		}
	);
	observer.observe(node);


	return observer
}//end when_in_viewport



/**
* DD_REQUEST_IDLE_CALLBACK
* Queues a function to be called during a browser's idle periods.
* This enables to perform background and low priority work on the main event loop,
* without impacting latency-critical events such as animation and input response
* @param function callback
* @return void
*/
export const dd_request_idle_callback = function (callback) {

	if (typeof window.requestIdleCallback === 'function') {
		// Use requestIdleCallback to schedule work if available
		requestIdleCallback(callback, { timeout: 1000 })
	} else {
		// Fallback for browsers without requestIdleCallback support like Safari
		window.requestAnimationFrame(callback)
		// setTimeout(callback, 1);
	}
}//end dd_request_idle_callback



/**
* SET_TOOL_EVENT
* Apply a tool event configuration to current tool button
* It is used in tool_ontology for example, to attach a keyup event
* to the document and allow to use keyboard keys as Control + s
* to open the tool easily.
* @param object options
* {
* 	tool_event: object,
* 	tool_button: HTMLElement
* }
* @return bool
*/
export const set_tool_event = function (options) {

	// options
		const tool_event	= options.tool_event
		const tool_button	= options.tool_button

	// tool_event
		// tool_event sample:
		// {
		//   "type": "keyup",
		//   "validate": [
		// 	{
		// 	  "key": "ctrlKey",
		// 	  "value": true
		// 	},
		// 	{
		// 	  "key": "key",
		// 	  "value": "s"
		// 	}
		//   ]
		// }
		const type		= tool_event.type // as keyup
		const validate	= tool_event.validate || [] // array o validations
		const action	= tool_event.action

	// event_handler
		const event_handler = (e) => {
			e.preventDefault()

			// if button is not connected to the DOM, remove the event
			if (!tool_button.isConnected) {
				document.removeEventListener(type, event_handler)
				return
			}

			// validations
			const validate_length = validate.length
			for (let i = 0; i < validate_length; i++) {
				const item = validate[i]
				if (e[item.key]!==item.value) {
					// stop here
					return
				}
			}

			switch (action) {

				case 'click':
					tool_button.click()
					break;

				default:
					console.warn('Undefined action. options:', options);
					break;
			}
		}

	// listener
	document.addEventListener(type, event_handler)


	return true
}//end set_tool_event



// @license-end
