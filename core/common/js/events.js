/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/

	


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
	const observer = new IntersectionObserver(function(entries) {
		// if(entries[0].isIntersecting === true) {}
		const entry = entries[1] || entries[0]
		if (entry.isIntersecting===true || entry.intersectionRatio > 0) {

			// default is true (executes the callback once)
			if (once===true) {
				observer.disconnect();
			}

			callback()
		}
	}, { threshold: [0] });
	observer.observe(node);

	return observer
}//end when_in_viewport



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
		console.log("///////////////////// set_before_unload value:",value);
	}

	if (value===true) {
		// window dialog will be shown when user leaves the page
		addEventListener('beforeunload', beforeUnloadListener, {capture: true});
		window.unsaved_data = true
	}else{
		// restore the normal page exit status
		removeEventListener('beforeunload', beforeUnloadListener, {capture: true});
		window.unsaved_data = false
	}

	return true
}//end set_before_unload



/**
* BEFOREUNLOADLISTENER
* Prevent to accidentally user leaves the page with unsaved changes
* @param object event
*/
const beforeUnloadListener = function(event) {
	event.preventDefault();

	document.activeElement.blur()

	return event.returnValue = get_label.discard_changes || 'Discard unsaved changes?';
}//end beforeUnloadListener



/**
* unsaved_data set default
*/
if (typeof window.unsaved_data==='undefined') {
	window.unsaved_data = false
}