// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*eslint no-undef: "error"*/



/**
* COOKIE_MANAGER
* Manages browser cookies access.
*
* Usage:
*   const session_id = cookie_manager.get('session_id');
*   cookie_manager.set('theme', 'dark', 30); // Set cookie for 30 days
*/
export class cookie_manager {

	/**
     * Get a cookie value by name
     * @param {string} name - The cookie name
     * @returns {string|null} The cookie value or null if not found
     */
	static get(name) {
		const value = `; ${document.cookie}`;
		const parts = value.split(`; ${name}=`);
		if (parts.length === 2) {
			return decodeURIComponent(parts.pop().split(';').shift());
		}
		return null;
	}

	static set(name, value, days = 365) {
		const date = new Date();
		date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
		const expires = `expires=${date.toUTCString()}`;
		document.cookie = `${name}=${encodeURIComponent(value)}; ${expires}; path=/`;
	}

	static delete(name) {
		document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
	}
}



// @license-end
