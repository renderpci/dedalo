// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*eslint no-undef: "error"*/



/**
* COOKIE_MANAGER
* Thin static utility class for reading, writing, and deleting browser cookies.
*
* Wraps document.cookie with URI encoding/decoding so callers never need to
* deal with raw percent-encoded strings or date arithmetic.
*
* All methods set path=/ so cookies are visible to every page of the application,
* regardless of the current URL path.
*
* Usage:
*   const session_id = cookie_manager.get('session_id');
*   cookie_manager.set('theme', 'dark', 30); // Set cookie for 30 days
*/
export class cookie_manager {

	/**
	* GET
	* Retrieve the decoded value of a named cookie from document.cookie.
	*
	* Splits the raw cookie string on the sentinel "; name=" pattern to isolate
	* the target value without a regex, then strips any trailing attributes
	* (e.g. "; path=/") by taking only the segment before the next ";".
	* The value is URI-decoded before being returned so the caller receives the
	* original string that was passed to set().
	*
	* @param {string} name - Cookie name to look up (case-sensitive).
	* @returns {string|null} Decoded cookie value, or null when the cookie is absent.
	*/
	static get(name) {
		const value = `; ${document.cookie}`;
		const parts = value.split(`; ${name}=`);
		if (parts.length === 2) {
			// Take the segment after "; name=" and stop at the next ";" to
			// exclude any cookie attributes (Path, Expires, etc.).
			return decodeURIComponent(parts.pop().split(';').shift());
		}
		return null;
	}

	/**
	* SET
	* Write a URI-encoded cookie that expires after the given number of days.
	*
	* The value is passed through encodeURIComponent so that arbitrary strings
	* (spaces, special characters, JSON) are stored safely. Complementary to
	* get(), which decodes on read.
	*
	* The cookie is always set with path=/ so it is accessible application-wide.
	* Callers who need domain-scoping or Secure/SameSite attributes should set
	* document.cookie directly rather than using this helper.
	*
	* @param {string} name  - Cookie name.
	* @param {string} value - Cookie value (will be URI-encoded).
	* @param {number} [days=365] - Lifetime in days from now; defaults to one year.
	* @returns {void}
	*/
	static set(name, value, days = 365) {
		const date = new Date();
		date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
		const expires = `expires=${date.toUTCString()}`;
		document.cookie = `${name}=${encodeURIComponent(value)}; ${expires}; path=/`;
	}

	/**
	* DELETE
	* Remove a cookie by immediately expiring it.
	*
	* Sets the named cookie's expiry to a date in the past (Unix epoch),
	* which instructs the browser to purge it. The path must match the one
	* used when the cookie was created; since set() always uses path=/, this
	* method uses the same.
	*
	* @param {string} name - Name of the cookie to remove.
	* @returns {void}
	*/
	static delete(name) {
		document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
	}
}



// @license-end
