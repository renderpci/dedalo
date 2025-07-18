// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/* global Promise, structuredClone, SHOW_DEBUG, SHOW_DEVELOPER */
/*eslint no-undef: "error"*/



import {data_manager} from '../../js/data_manager.js'
import {get_instance} from '../../js/instances.js'



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

	if ( level==='DEBUG' && (SHOW_DEBUG!==true && SHOW_DEVELOPER!==true) ) {
		return
	}

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
* JSON_PARSE_SAFELY
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
* @param array xs
* @param string|int key
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
*	global name like 'Leaftlet L.'
* @param int timeout
*	time limit to wait in seconds
* @return promise
*/
export function wait_for_global(name, timeout=300) {

	return new Promise((resolve, reject) => {
		let waited = 0

		function wait(interval) {
			console.log("waiting interval...... :", interval);
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
* sample:
* {
* 	tipo: 'rsc197',
* 	menu: false
* }
* @return string url_vars
*/
export function object_to_url_vars(vars_obj) {

	const pairs = []
	for (const key in vars_obj) {
		if (key==='t') {
			console.error('url key "t" is not valid for tipo');
		}
		const current_value = encodeURIComponent( vars_obj[key] )

		pairs.push( key +'='+ current_value )
	}

	const url_vars = pairs.join('&')


	return url_vars
}//end object_to_url_vars



/**
* URL_VARS_TO_OBJECT
* @param string query_string
* @return object vars_obj
*/
export function url_vars_to_object(query_string) {

	// default from window.location
		if (!query_string) {
			query_string = window.location.search
		}

	// parse query string
		const params = new URLSearchParams(query_string);

	// iterate over all keys
		const vars_obj = {};
		for (const key of params.keys()) {
			if (params.getAll(key).length > 1) {
				vars_obj[key] = params.getAll(key);
			}else{
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

		case (kb >= 1048576): {
			// Giga Bytes
			const gb = (kb / 1048576).toLocaleString(_locale, {
				minimumFractionDigits: 0,
				maximumFractionDigits: 2
			})
			result = `${gb} GB`
			break;
		}

		case (kb >= 1024): {
			// Mega Bytes
			const mb = (kb / 1024).toLocaleString(_locale, {
				minimumFractionDigits: 0,
				maximumFractionDigits: 2
			})
			result = `${mb} MB`
			break;
		}

		default: {
			// KBytes
			const kb_round = Math.round(kb)
			result = `${kb_round} KB`
		}
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

	// fix old %s vars from labels like dd340
	let counter = 0
	format = format.replace(/%s/g, function(match, number) {
		const current_value = '{'+counter+'}'
		counter++
		return current_value
	})

	const output = format.replace(/{([\d]+)}/g, function(match, number) {
		return typeof args[number] != 'undefined'
			? args[number]
			: match
	})

	return output
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
			// if (!source[i].equals(array[i]))
			if (!is_equal(source[i], array[i]))
				return false;
		}
		// else if (source[i] != array[i]) {
		else if (!is_equal(source[i], array[i])) {
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
export function object_equals(o1, o2) {

	// check if the o1 is object
	// null is a object but it's not possible check his keys, so use the ===
	// check if the object keys has length, has any property
	const equal = (o1 !== null && o2 !== null) && typeof o1 === 'object' && Object.keys(o1).length > 0
		? Object.keys(o1).length === Object.keys(o2).length
		  && Object.keys(o1).every(p => is_equal(o1[p], o2[p]))
		: o1 === o2;

	// debug
		// console.log('o1:', o1);
		// console.log('o2:', o2);
		// console.log('equal:', equal);

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
* @param object options
* {
* 	url : /dedalo/core/page/?tipo=oh1,
* 	target : My new window name,
* 	width : 1280,
* 	height : 900,
* 	features : null
* }
* @return object new_window
*/
export function open_window(options) {

	// defaults
		const default_width		= 1280
		const default_height	= 905

	// options
		const url		= options.url
		const target	= options.target || options.name || 'new_window'
		const features	= options.features || null
		const width		= options.width && (options.width < window.screen.width)
			? options.width
			: ((default_width < window.screen.width) ? default_width : window.screen.width)
		const height	= options.height && (options.height < window.screen.height)
			? options.height
			: ((default_height < window.screen.height) ? default_height : window.screen.height)
		const top		= options.top || 0
		const left		= options.left || 0
		const on_blur	= options.on_blur || null

	// window_features
		const window_features = (()=>{

			if (features==='new_tab') {
				return  null
			}

			const features_string = `width=${width},height=${height},top=${top},left=${left}` + (features ? (','+features) : '')

			return features_string
		})()

	// window
		if (prevent_open_new_window()===true && url.indexOf('tool=')!==-1) {

			// Prevent Safari logout problems on open new tabs for tools (!)
			window.location = url

			return window

		}else{
			const new_window = window.open(
				url,
				target,
				window_features
			)
			new_window.resizeTo(width, height); // needed for Firefox
			new_window.focus()

			// on_blur optional action callback
				if (typeof on_blur==='function') {

					// direct
						// const fn_on_blur = function(e) {
						// 	// remove self instance to prevent duplicity
						// 	new_window.removeEventListener('blur', fn_on_blur)
						// 	// exec callback function
						// 	on_blur(e)
						// }
						// new_window.addEventListener('blur', fn_on_blur)

					// inverse
						const fn_on_focus = function(e) {
							// remove self instance to prevent duplicity
							window.removeEventListener('focus', fn_on_focus)
							// exec callback function
							on_blur(e)
						}
						window.addEventListener('focus', fn_on_focus)
				}

			return new_window
		}
}//end open_window



/**
* PREVENT_OPEN_NEW_WINDOW
* Check browser navigator.userAgent for detect Safari
* @return bool
*/
export function prevent_open_new_window() {
	return false
	// return (navigator.userAgent.indexOf('Safari')!==-1 && navigator.userAgent.indexOf('Chrome')===-1)
}//end prevent_open_new_window



/**
* OPEN_RECORDS_IN_WINDOW
* Target section filter is calculated and fixed in server.
* Then, opens a new window to navigate the results
* @param object caller (caller instance)
* @param string section_tipo
* @param array ar_section_id
* @param string|null target_window
* @return bool true
*/
export const open_records_in_window = async function( options ) {

	// create a dummy section with calculated section_id array as filter

	// ! NOTE: This session server solution is adopted because passing the whole list of section_id
	// using the URL is not feasible for large arrays (e.g., for person relationships),
	// and events between windows is very unstable depending on whether the window is new or recycled, etc.

	const caller		= options.caller
	const section_tipo	= options.section_tipo
	const ar_section_id	= options.ar_section_id
	const target_window	= options.target_window
	const width			= options.width 	|| 1280
	const height		= options.height 	|| 900
	const left			= options.left 		|| 0
	const top			= options.top 		|| 0

	// request_config
		const request_config = [{
			api_engine	: 'dedalo',
			type		: 'main',
			show		: { ddo_map : [] },
			sqo : {
				section_tipo	: [section_tipo],
				limit			: 10,
				offset			: 0,
				filter			: {
					'$and' : [
						{
							q : [ ar_section_id.join(',') ],
							path : [{
								section_tipo	:  section_tipo,
								component_tipo	: 'section_id',
								model			: 'component_section_id',
								name			: 'Id'
							}]
						}
					]
				}
			}
		}]

	// instance_options (context)
		const instance_options = {
			type			: 'section',
			typo			: 'ddo',
			tipo			: section_tipo,
			section_tipo	: section_tipo,
			section_id		: null,
			lang			: page_globals.dedalo_data_nolan,
			mode			: 'edit',
			model			: 'section',
			add_show		: true, // force to use request_config 'show' value
			caller			: caller,
			request_config	: request_config,
			id_variant		: 'relation_list_' + (new Date()).getTime()
		}

	// dummy section init and build
		const section = await get_instance(instance_options)
		// build. Forces to load section data and fix filter in server session
		await section.build(true)
		// destroy after use it (only affects client side)
		section.destroy()

		const features = `width=${width},height=${height},left=${left},top=${top}`;

	// open a new window without additional params.
		// Note that the new window will be use the session value fixed in server
		// for this section tipo by the previous dummy section build
		open_window({
			url			: `${DEDALO_CORE_URL}/page/?tipo=${section_tipo}&menu=false`,
			target		: target_window,
			features	: features
		})


	return true
}//end open_records_in_window



/**
* DOWNLOAD_FILE
* Unified download files function
* @return object new_window
*/
export function download_file(options) {

	// options
		const url		= options.url
		const file_name	= options.file_name || url.substring(url.lastIndexOf('/')+1)

	// anchor pseudo-link
		const anchor	= document.createElement('a');
		anchor.href		= url
		anchor.target	= '_blank'
		anchor.download	= file_name
		anchor.click();
		anchor.remove()

	return true
}//end download_file



/**
* FIND_UP_NODE
* Search parent node recursively until reach the target
* @param HTMLElement el
* @param string target_tag
* 	Sample: 'div'
* @param function compare
* @return HTMLElement|null
*/
export function find_up_node(el, target_tag, compare) {

	let r = el
	while (r.parentNode) {
		r = r.parentNode;
		if (compare) {
			if (compare(r)===true) {
				return r
			}
		}else{
			if (r.tagName===target_tag) {
				return r;
			}
		}
	}

	return null;
}//end find_up_node



/**
* PAUSE
* Creates a pause in the async execution
* using a promise over a timeout
* @param int milliseconds
* @return promise
*/
export function pause(milliseconds) {
	return new Promise(function(resolve){
		setTimeout(function(){
			resolve(true)
		}, milliseconds)
	})
}//end pause



/**
* GET_FONT_FIT_SIZE
* Calculate the convenient font size based on text length
* and threshold. Usually vw units are used.
* The idea is to apply a reduction factor to size when the string
* size exceed the desired font base size
* Used mainly by section_id column font size fit
* @param string text
* @param float base_size = 1.07
* @param int threshold = 4
* @return float font_size
*/
export function get_font_fit_size(text, base_size=1.7, threshold=4) {

	const text_length = String(text).length

	const font_size = (text_length > Math.floor(base_size + threshold) )
		? base_size - (text_length * 0.037)
		: base_size

	return font_size
}//end get_font_fit_size



/**
 * TIME_UNIT_AUTO
 * @param {number} total_ms - time expressed in milliseconds from function start_time()
 * @returns {string} result
 */
export function time_unit_auto(total_ms) {

	const round = 3;

	// calculation is always in milliseconds
	// const total_ms = Date.now() - start;;

	if (total_ms > 1000) {
		const total_sec = total_ms / 1000;
		if (total_sec > 60) {
			const total_min = total_sec / 60;
			if (total_min > 60) {
				const total_hours = total_min / 60;
				if (total_hours > 24) {
					const total_days = total_hours / 24;
					return `${total_days.toFixed(round)} day`;
				}
				return `${total_hours.toFixed(round)} hour`;
			}
			return `${total_min.toFixed(round)} min`;
		}
		return `${total_sec.toFixed(0)} sec`;
	}
	return `${total_ms.toFixed(0)} ms`;
}//end time_unit_auto



/**
* GET_JSON_LANGS
* Reads '../common/js/lang.json' JSON file and store value in window['json_langs']
* It's used by service_ckeditor and component_geolocation
* Sample data:
* [{"section_id":34,"dd_lang":"lg-aar","tld4":"aar","tld2":"aa","glotocode":"afar1241","walls":"qaf","lat":12.0,"long":42.0,"locale":"aa"},...]
* @return array|null json_langs
*/
export const get_json_langs = async function () {

	// return from page global value
		if (window['json_langs']) {
			return window['json_langs']
		}

	// calculate from server
		const json_langs = await data_manager.request({
			url		: DEDALO_CORE_URL + '/common/js/lang.json',
			method	: 'GET',
			cache	: 'force-cache' // force use cache because the file do not changes
		})
		// fix as page global
		window['json_langs'] = json_langs


	return json_langs
}//end get_json_langs



/**
* GET_TLD_FROM_TIPO
* Extract the tld from given tipo
* like 'rsc' from 'rsc1'
* @param string $tipo
* @return string|false
*/
export const get_tld_from_tipo = function (tipo) {

	const match = tipo.match(/^[a-z]{2,}/);

	if (!match || !match[0]) {
		console.error(`Error: Invalid tipo received. Impossible get_tld_from_tipo this tipo: ${tipo}`);
		return false;
	}

  return match[0];
}//end get_tld_from_tipo



/**
* GET_SECTION_ID_FROM_TIPO
* Extract the section_id from given tipo
* like '1' from 'rsc1'
* @param string tipo
* @returns string|false
*/
export const get_section_id_from_tipo = function (tipo) {

	const match = tipo.match(/[0-9]+/);

	if (!match || (match[0] === '' && match[0] !== 0)) {
		console.error(`Error: Invalid tipo received. Impossible get_section_id_from_tipo this tipo: ${tipo}`);
		return false;
	}

  return match[0];
}//end get_section_id_from_tipo



// @license-end
