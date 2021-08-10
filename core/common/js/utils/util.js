// util
'use strict';



/**
* CLONE
* Exec a deeep safe clone of object
*/
export function clone(item){
	return JSON.parse(JSON.stringify(item));
}//end clone



/**
* DD_CONSOLE
* Custom console log from Dédalo
*/
export function dd_console(msg, level, items){

	const type = level==='ERROR'
		? 'error'
		:	(level==='WARNING'
				? 'warn'
				: 'log')

	const style = 'background: #000000; color: violet; font-size: 1.2em; padding:2px; padding-left:4px; padding-right:4px;'
	
	if (items) {
		console[type]('%c' + msg, style, items);
	}else{
		console[type]('%c' + msg, style);
	}	
}//end clone



/**
* GROUP_OBJECTS_BY
* Group object inside an array by a given property
*/
export function group_objects_by(xs, key) {

	return xs.reduce(function(rv, x) {
		(rv[x[key]] = rv[x[key]] || []).push(x);
		return rv;
	}, {});
}//end group_objects_by




/**
* WAIT_FOR_GLOBAL
* Waits for global is available with timeuot
* @param string name
*	global name like 'titnymce'
* @param int timeout
*	time limit to wait in seconds
* @return promise
*/
export function wait_for_global(name, timeout=300) {
	return new Promise((resolve, reject) => {
		let waited = 0

		function wait(interval) {
			console.log("waiting interval...... :",interval);
			setTimeout(() => {
				waited += interval
				// some logic to check if script is loaded
				// usually it something global in window object
				if (window[name] !== undefined) {
					return resolve()
				}
				if (waited >= timeout * 1000) {
					return reject({ message: 'Timeout' })
				}
				wait(interval * 2)
			}, interval)
		}

		wait(30)
	})
}//end wait_for_global



/**
* OBSERVE_CHANGES
* Used by service_tinymce.js
*/
export async function observe_changes(element, config, once) {

	// config are the options for the observer (which mutations to observe)

	return new Promise((resolve, reject) => {
		// Callback function to execute when mutations are observed
		const callback = function(mutationsList, observer) {
				// Use traditional 'for loops' for IE 11
				for(let mutation of mutationsList) {
						if (mutation.type === 'childList') {
								console.log('A child node has been added or removed.');

								if (once===true) {
						observer.disconnect();
							}
							resolve( mutation.type )
						}
						else if (mutation.type === 'attributes') {
								console.log('The ' + mutation.attributeName + ' attribute was modified.');

							if (once===true) {
						observer.disconnect();
							}
							resolve( mutation.attributeName )
						}
				}
		};

		// Create an observer instance linked to the callback function
		const observer = new MutationObserver(callback);

		// Start observing the target node for configured mutations
		observer.observe(element, config);
	})
}//end observe_changes


