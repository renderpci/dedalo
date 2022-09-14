/* global Promise, SHOW_DEBUG, structuredClone */
/*eslint no-undef: "error"*/



/**
* CLONE
* Exec a deep safe clone of object
* @param mixed item
* @return mixed item
*/
export function clone(item) {

	// return JSON.parse(JSON.stringify(item));
	return structuredClone(item)
}//end clone



/**
* DD_CONSOLE
* Custom console log from Dédalo
* @param string msg
* @param string level
* @param mixed items
* @return void
*/
export function dd_console(msg, level='WARNING', items){

	const type = level==='ERROR'
		? 'error'
		: (level==='WARNING'
			? 'warn'
			: 'warn')

	const style = 'background: #000000; color: violet; font-size: 1.2em; padding:2px; padding-left:4px; padding-right:4px;'

	if (items) {
		console[type]('%c' + msg, style, items);
	}else{
		console[type]('%c' + msg, style);
	}
}//end dd_console



/**
* JSON_parse_safely
* Custom console log from Dédalo
* @param string str
* @param string error_value = null
*/
export function JSON_parse_safely(str, error_value=null) {
	try {
		return JSON.parse(str);
	}
	catch (e) {
		console.error(e);
		// Return a default object, or null based on use case.
		return error_value
	}
}//end JSON_parse_safely



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
* Waits for global is available with timeout
* @param string name
*	global name like 'tinymce'
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

	return new Promise((resolve) => {
		// Callback function to execute when mutations are observed
		const callback = function(mutationsList, observer) {
			// Use traditional 'for loops' for IE 11
			for(let mutation of mutationsList) {
					if (mutation.type==='childList') {
						console.log('A child node has been added or removed.');

						if (once===true) {
							observer.disconnect();
						}
						resolve( mutation.type )
					}
					else if (mutation.type==='attributes') {
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



/**
* OBJECT_TO_URL_VARS
* @param object vars_obj
* @return string url_vars
*/
export function object_to_url_vars( vars_obj ) {

	const pairs = []
	for (const key in vars_obj) {
		const current_value = vars_obj[key]
		pairs.push( key+'='+ encodeURIComponent(current_value) )
	}

	const url_vars = pairs.join("&")

	return url_vars
}//end object_to_url_vars



/**
* URL_VARS_TO_OBJECT
* @param string query_string
* @return object vars_obj
*/
export function url_vars_to_object(query_string) {

	// parse query string
	const params = new URLSearchParams(query_string);

	const vars_obj = {};

	// iterate over all keys
	for (const key of params.keys()) {
		if (params.getAll(key).length > 1) {
			vars_obj[key] = params.getAll(key);
		} else {
			vars_obj[key] = params.get(key);
		}
	}

	return vars_obj;
}//end url_vars_to_object



/**
* OPEN_WINDOW_WITH_POST
* @return bool false
*/
export function open_window_with_post(url, data) {

	const form = document.createElement("form");
	form.target			= "_blank";
	form.method			= "POST";
	form.action			= url;
	form.style.display	= "none";

	for (const key in data) {

		const input	= document.createElement("input");
		input.type	= "hidden";
		input.name	= key;
		input.value	= data[key];
		form.appendChild(input);
	}

	document.body.appendChild(form);
	form.submit();
	document.body.removeChild(form);

	return false;
}//end open_window_with_post



/**
* BYTES_FORMAT
* Convert bytes to human readable text like '152 kB'
* @param integer bytes
* @return bool string | bool false
*/
export function bytes_format(bytes) {

	if (!bytes || bytes<1) {
		return false
	}

	const kb		= (bytes/1024)
	const _locale	= 'en-US'

	let result
	switch (true) {

		case (kb >= 1048576):
			// Giga Bytes
			const gb = (kb / 1048576).toLocaleString(_locale, {
				minimumFractionDigits: 0,
				maximumFractionDigits: 2
			})
			result = `${gb} GB`
			break;

		case (kb >= 1024):
			// Mega Bytes
			const mb = (kb / 1024).toLocaleString(_locale, {
				minimumFractionDigits: 0,
				maximumFractionDigits: 2
			})
			result = `${mb} MB`
			break;

		default:
			// KBytes
			const kb_round = Math.round(kb)
			result = `${kb_round} KB`
	}

	return result
}//end bytes_format



/**
* PRINTF
* JavaScript equivalent to printf/String.Format
* Tokens '{0}', '{1}', etc. will be replaced by arguments preserving order
* Example: 'The content of {0} records from {1}' => 'The content of 25 records from 12'
* @param mixed format
* 	Like: 'The content of {0} records from {1}', 25, 12
* @return string
*/
export function printf(format) {

	const args = Array.prototype.slice.call(arguments, 1);

	return format.replace(/{(\d+)}/g, function(match, number) {
		return typeof args[number] != 'undefined'
			? args[number]
			: match
	})
}//end printf



/**
* STRIP_TAGS
* @param string value
* @return string text_clean
*/
export function strip_tags(value) {

	const aux_node = document.createElement("div")
	aux_node.insertAdjacentHTML('afterbegin', value)
	const text_clean = aux_node.textContent || aux_node.innerText || "";

	return text_clean;
}//end strip_tags



/**
* ARRAY_EQUALS
* Compares two arrays for equality
* @param array source
* @param array array
* @return bool
*/
export function array_equals(source, array) {
	// if the other array is a false value, return
	if (!array)
		return false;

	// compare lengths - can save a lot of time
	if (source.length !== array.length)
		return false;

	for (let i = 0, l=source.length; i < l; i++) {
		// Check if we have nested arrays
		if (source[i] instanceof Array && array[i] instanceof Array) {
			// recurse into the nested arrays
			if (!source[i].equals(array[i]))
				return false;
		}
		else if (source[i] != array[i]) {
			// Warning - two different object instances will never be equal: {x:20} != {x:20}
			return false;
		}
	}

	return true;
}//end array_equals



/**
* OBJECT_EQUALS
* Deep Equality comparison example
*
* This is an example of how to implement an object-comparison function in
* JavaScript (ES5+). A few points of interest here:
*
* * You can get an array of all an object's properties in ES5+ by calling
*   the class method Object.keys(obj).
* * The function recursively calls itself in the for / in loop when it
*   compares the contents of each property
* * You can hide a "private" function inside a function of this kind by
*   placing one function declaration inside of another. The inner function
*   is not hoisted out into the global scope, so it is only visible inside
*   of the parent function.
* * The reason this nested helper function is necessary is that
*   `typeof null` is still "object" in JS, a major "gotcha" to watch out for.
*/
	// export function object_equals_DES(obj1, obj2) {

	// 	if (obj1 === obj2) {
	// 		return true;
	// 	}else if (isObject(obj1) && isObject(obj2)) {
	// 		if (Object.keys(obj1).length !== Object.keys(obj2).length) {
	// 			return false
	// 		}
	// 		for (const prop in obj1) {
	// 			if (!object_equals(obj1[prop], obj2[prop])) {
	// 				return false;
	// 			}
	// 		}
	// 		return true;
	// 	}
	// 	return false;

	// 	// Private
	// 	function isObject(obj) {
	// 		if (typeof obj === "object" && obj != null) {
	// 			return true;
	// 		} else {
	// 			return false;
	// 		}
	// 	}
	// }//end object_equals
export function  object_equals (o1, o2){

	const equal = typeof o1 === 'object' && Object.keys(o1).length > 0
		? Object.keys(o1).length === Object.keys(o2).length
			&& Object.keys(o1).every(p => object_equals(o1[p], o2[p]))
		: o1 === o2;

	return equal
}//end object_equals



/**
* IS_EQUAL
* Check elements equality deeply
* 	Could compare strings, arrays and objects
* @return bool
*/
export function is_equal(el1, el2) {

	// direct check
	if (el1===el2) {
		return true
	}
	// check the typo of elements object != string
	// Note: this check could fail when check objects because null === object in js
	if (typeof el1!==typeof el2) {
		return false
	}

	// check null or undefined case
	const chek_null_obj = o => o === null || o === undefined;
	if(chek_null_obj(el1) !== chek_null_obj(el2)){
		return false
	}
	// check if new element is array
	if (Array.isArray(el1)) {
		return array_equals(el1, el2)
	}
	// check if new element is object
	if (typeof el1==="object" && el1!==null) {
		return object_equals(el1, el2)
	}


	return false
}//end is_equal



/**
* OPEN_WINDOW
* Unified open window function
* @return object new_window
*/
export function open_window(options) {

	// defaults
		const default_width		= 1280
		const default_height	= 740

	// options
		const url		= options.url
		const name		= options.name || 'New window'
		const features	= options.features || null
		const width	= options.width && options.width < window.screen.width
			? options.width
			: (default_width < window.screen.width ? default_width : window.screen.width)
		const height = options.height && options.height < window.screen.height
			? options.height
			: (default_height < window.screen.height ? default_height : window.screen.height)

		const final_features = `width=${width},height=${height}` + (features ? ','+features : '')

		const new_window = window.open(
			url,
			name,
			final_features
		)
		new_window.focus()


	return new_window
}//end open_window
