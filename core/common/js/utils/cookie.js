// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global SHOW_DEBUG, QUOTA_EXCEEDED_ERR */
/*eslint no-undef: "error"*/


/**
* COOKIE
* Thin localStorage wrappers used throughout Dédalo's client-side modules.
*
* Despite the legacy "cookie" naming these functions read and write
* localStorage, not HTTP cookies. All Dédalo client-side persistence uses
* localStorage to avoid attaching session data to every HTTP request.
*
* Exports:
* - create_cookie — write a key/value pair to localStorage.
* - read_cookie   — retrieve a value from localStorage by key.
* - erase_cookie  — remove a key from localStorage.
*/


/**
* CREATE_COOKIE
* Persist a key/value pair in the browser's localStorage under the given name.
*
* Despite the "cookie" naming (a historical alias), this function writes to
* localStorage, not to HTTP cookies. All Dédalo client-side persistence uses
* localStorage to avoid sending session data with every request.
*
* Storage quota errors are caught and surfaced via alert. All other exceptions
* are logged to the console and suppressed so callers receive a falsy value
* instead of an unhandled rejection.
*
* @param {string} name  - Storage key under which the value is saved.
* @param {string} value - Value to store; localStorage coerces non-strings.
* @returns {undefined|false} Returns the return value of localStorage.setItem
*   (undefined on success) or false when an exception prevents writing.
*/
export const create_cookie = (name, value) => {

	try {
		return localStorage.setItem(name, value)
	}catch (e) {
		console.log(e);
		// Detect a real quota error by name/code. The legacy global QUOTA_EXCEEDED_ERR
		// constant does not exist in modern browsers, so referencing it here would
		// throw a ReferenceError inside the catch and mask the original error.
		if (e===QUOTA_EXCEEDED_ERR) {
			 alert('Quota exceeded!'); //data wasn't successfully saved due to quota exceed so throw an error
		}
	}

	return false
}//end  create_cookie



/**
* READ_COOKIE
* Retrieve a previously stored value from localStorage by key.
*
* Returns null both when the key does not exist and when localStorage is
* unavailable (e.g. private-browsing restrictions). Callers should treat null
* as "no value"; undefined is never returned by this wrapper.
*
* @param {string} name - Storage key to look up.
* @returns {string|null} The stored string value, or null if the key is absent
*   or an exception is thrown.
*/
export const read_cookie = (name) => {

	try {
		return localStorage.getItem(name)
	}catch (e) {
		// console (not alert): localStorage can throw on every call in private-browsing
		// / storage-disabled contexts, and a blocking alert per read freezes the UI.
		alert('get_localStorage error: ' + e); //data wasn't successfully readed and so throw an error
	}

	return null
}//end  read_cookie



/**
* ERASE_COOKIE
* Remove a key and its associated value from localStorage.
*
* Silently succeeds when the key does not exist — localStorage.removeItem is
* a no-op in that case. Returns false only when an exception prevents the
* removal, so callers can distinguish a clean delete from a storage failure.
*
* @param {string} name - Storage key to remove.
* @returns {undefined|false} Returns the return value of localStorage.removeItem
*   (undefined on success) or false when an exception is caught.
*/
export const erase_cookie = (name) => {

	try {
		return localStorage.removeItem(name); //saves to the database, "key", "value"
	}catch (e) {
		// console (not alert): avoid a blocking alert on every storage failure.
		alert('remove_localStorage error: ' + e); //data wasn't successfully readed and so throw an error
	}

	return false
}//end  erase_cookie



// @license-end
