// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {get_fallback_value} from '../../common/js/common.js'
	import {dd_request_idle_callback} from '../../common/js/events.js'



/**
* VIEW_IP_LIST_INPUT_TEXT
* List-view renderer for component_input_text fields configured with view = 'ip'.
*
* This module renders a stored IP address string in list mode and, for non-private
* IPs, asynchronously enriches the wrapper with a clickable country-flag link by
* querying the configured external geolocation API (`page_globals.ip_api`).
*
* Responsibilities:
*   - Build the synchronous wrapper via `ui.component.build_wrapper_list` so the
*     list row is never blocked by a network call.
*   - Skip resolution entirely for private / loopback / RFC-1918 addresses — those
*     cannot be geolocated and should not generate outbound requests.
*   - Defer the network fetch to an idle callback (`dd_request_idle_callback`) so
*     the browser remains responsive during heavy list renders.
*   - Maintain a module-level LRU-style cache (`window.resolved_ip_data`, a Map)
*     capped at 300 entries to avoid resolving the same IP more than once per
*     page load without unbounded memory growth.
*   - On resolution, inject an `<a>` link carrying the country-flag emoji label
*     into the already-rendered wrapper via `requestAnimationFrame`.
*
* Configuration:
*   `page_globals.ip_api` is populated server-side from the `IP_API` PHP constant
*   (core/api/v1/common/class.dd_core_api.php). It must be an object with:
*     - `url`          {string} — fetch endpoint with the literal `$ip` placeholder
*     - `href`         {string} — user-facing link target with the `$ip` placeholder
*     - `country_code` {string} — property name to read from the API JSON response
*
*   If `page_globals.ip_api` is absent (not configured), geolocation is silently
*   skipped and the wrapper shows only the raw IP text.
*
* Exports: view_ip_list_input_text (namespace), render_link (utility)
*
* @see render_list_component_input_text — dispatcher that selects this module for
*      view = 'ip'
* @see view_default_list_input_text    — default list view (no geolocation)
* @see config/sample.config.php        — IP_API constant documentation and examples
*/
export const view_ip_list_input_text = function() {

	return true
}//end view_ip_list_input_text



/**
* RENDER
* Build the list-mode DOM node for an IP-address component and schedule an
* asynchronous geolocation enrichment for non-private addresses.
*
* Phase 1 (synchronous):
*   Resolves the display value from `data.entries` / `data.fallback_value` and
*   builds the wrapper immediately via `ui.component.build_wrapper_list`, which
*   stamps the IP string as a child `<span>` when `value_string` is supplied.
*   The wrapper is returned to the caller right away so the list row can paint
*   without waiting for the network.
*
* Phase 2 (deferred, non-blocking):
*   For public IPs, schedules work in an idle callback:
*     1. Creates or reuses `window.resolved_ip_data` (a Map). Clears the Map when
*        it exceeds 300 entries to bound memory use (simple LRU approximation).
*     2. On a cache hit, appends the cached `<a>` node via `requestAnimationFrame`.
*     3. On a cache miss, calls `resolve_ip_data(ip)` and, on success, stores the
*        result and appends the link node.
*
* The `self.resolved_ip` instance guard (initialized to `[]`) is set up but not
* read back in this file — it is reserved for future per-instance deduplication.
*
* @param {Object} self    - component_input_text instance. Relevant properties:
*   - `self.data.entries`          {Array}  current-language value objects
*   - `self.data.fallback_value`   {Array}  fallback-language value objects
*   - `self.context.fields_separator` {string} separator joining multiple values
* @param {Object} options - render options (currently unused; forwarded for API
*   parity with other view renderers)
* @returns {Promise<HTMLElement>} the synchronously built wrapper `<div>` node;
*   a country-flag `<a>` may be appended asynchronously after return
*/
view_ip_list_input_text.render = async function(self, options) {

	// self.resolved_ip
		if (!self.resolved_ip) {
			self.resolved_ip = []
		}

	// short vars
		const data				= self.data
		const entries			= data.entries || []
		const fallback_value	= data.fallback_value || []
		const fallback			= get_fallback_value(entries, fallback_value)
		// Join multiple value strings with the ontology-defined separator (e.g. ', ').
		// In practice, IP fields store a single entry; the separator handles edge cases.
		const value_string		= fallback.join(self.context.fields_separator)

	// wrapper
		// Builds a <div> with standard Dédalo list CSS classes and inserts a <span>
		// for value_string. Returns immediately — no network work happens here.
		const wrapper = ui.component.build_wrapper_list(self, {
			value_string : value_string
		})


	// link
		// Reuse `value_string` as the IP address key for lookup and cache indexing.
		const ip = value_string
		switch (true) {
			case is_private_ip(ip):
				// Private / loopback / RFC-1918 addresses cannot be geolocated.
				// Nothing to append — leave the wrapper with just the IP text.
				// nothing to do here
				break;

			default:
				// Executes the IP resolution with low priority
				// Defer geolocation work until the browser is idle so heavy list
				// renders are not stalled by network calls or DOM mutations.
				dd_request_idle_callback(
					async () => {
						try {

							// cache create if not exists or reset if is too big
							// `window.resolved_ip_data` is shared across all component
							// instances on the page. Clearing at > 300 entries keeps
							// memory bounded without a true LRU eviction policy.
							if (!window.resolved_ip_data) {
								window.resolved_ip_data = new Map();
							}else if( window.resolved_ip_data.size > 300 ) {
								window.resolved_ip_data.clear()
							}

							// Helper function to render and append link
							// Wraps the two-step pattern (build node → rAF-insert) so
							// both the cache-hit and cache-miss paths share the same
							// DOM mutation logic.
							const render_and_append_link = (ip_data) => {
								const link_node = render_link(ip_data.href, ip_data.label);
								// Use requestAnimationFrame to batch the DOM write into
								// the next paint cycle, avoiding forced reflows.
								requestAnimationFrame(() => {
									wrapper.appendChild(link_node);
								});
							};

							// Check cache first
							if( window.resolved_ip_data.has(ip) ) {
								// Already calculated case
								// Re-use a previously resolved ip_data object; avoids
								// redundant fetch calls for the same IP within a session.
								const ip_data = window.resolved_ip_data.get(ip)
								render_and_append_link(ip_data);
								return;
							}

							// Resolve new IP data
							// Fetch geolocation from the external API. The promise is
							// not awaited with a top-level await here so that the idle
							// callback returns quickly; resolution continues in .then().
							resolve_ip_data(ip)
							.then(function(ip_data){

								if (!ip_data) {
									console.warn(`Failed to resolve IP data for: ${ip}`);
									return
								}

								// Cache the result and render
								window.resolved_ip_data.set(ip, ip_data);
								render_and_append_link(ip_data);
							})
						} catch (error) {
							console.error('Error in IP resolution:', error);
						}
					}
				)
				break;
		}


	return wrapper
}//end list



/**
* RENDER_LINK
* Build and return an `<a>` element that links to the IP geolocation page.
*
* The anchor opens in a new tab with `rel="noopener noreferrer"` (SEC-033) to
* prevent the opened page from accessing `window.opener` and to avoid sending
* the Referer header to the third-party geolocation service.
*
* The `label` is inserted as `innerHTML` to support emoji flag characters
* (which are Unicode code-point sequences, not HTML entities). Callers must
* ensure `label` is trusted content — in practice it is always a flag emoji
* produced by `get_flag_emoji` or the string `'unknown'`.
*
* @param {string} href  - URL of the geolocation website to open on click
*   (e.g. `"https://ip-api.com/#1.2.3.4"`)
* @param {string} label - Display text / emoji to show inside the anchor
*   (e.g. `"🇪🇸"` for Spain, or `"unknown"` when no country was resolved)
* @returns {HTMLElement} the constructed `<a>` DOM node (not yet in the document)
*/
export const render_link = function (href, label) {

	const link_node = ui.create_dom_element({
		element_type	: 'a',
		href			: href,
		class_name		: 'link',
		inner_html		: label
	})
	link_node.target = '_blank'
	link_node.rel    = 'noopener noreferrer' // SEC-033


	return link_node
}//end render_link



/**
* RESOLVE_IP_DATA
* Fetch geolocation information for an IP address from the configured external API
* and return a normalized result object ready for `render_link`.
*
* Configuration is read from `page_globals.ip_api`, which is populated server-side
* from the `IP_API` PHP constant. If the constant is not defined, `ip_api` is null
* and this function returns null immediately (geolocation is optional).
*
* The `$ip` placeholder in both `url` and `href` template strings is replaced with
* the actual IP value at call time.
*
* Country code extraction uses optional chaining (`parsed_data?.[key]`) to tolerate
* API responses that omit the property. When absent, `label` falls back to the
* literal string `'unknown'`.
*
* The function returns null (rather than throwing) in all error conditions so that
* callers can safely ignore failures without crashing the list render.
*
* @param {string} ip - The IP address string to resolve (IPv4 or IPv6)
* @returns {Promise<Object|null>} Resolves to an ip_data object on success:
*   ```
*   {
*     url   : string,  // the API endpoint that was fetched
*     href  : string,  // user-facing geolocation page URL (for <a href>)
*     label : string   // country-flag emoji (e.g. "🇪🇸") or "unknown"
*   }
*   ```
*   Returns null when: `ip` is invalid, `page_globals.ip_api` is not configured,
*   the fetch response is not OK, or an exception is caught.
*/
const resolve_ip_data = async function(ip) {

	// Validate input
    if (!ip || typeof ip !== 'string') {
        return null;
    }

	// Check config end_point. From config IP_API
	// page_globals.ip_api is null when the PHP constant IP_API is not defined;
	// geolocation is optional so we fail silently here.
	if (!page_globals.ip_api) {
		return null
	}

	try {

		// Replace the `$ip` token in both the API URL and the destination href.
		// The regex captures `$ip` in a group — the replace target is the whole
		// match, so the result is equivalent to a simple string replace.
		const url	= page_globals.ip_api.url.replace(/(\$ip)/, ip);
		const href	= page_globals.ip_api.href.replace(/(\$ip)/, ip);

		// fetch data
		const response = await fetch(url);

		if (!response.ok) {
            console.error(`API request failed: ${response.status}`);
            return null;
        }

		const parsed_data = await response.json();

		// Safely get country code. like 'AQ'
		// `country_code` is a dynamic property name from config (e.g. 'countryCode'
		// for ip-api.com, 'country_code' for ipapi.co, 'country' for api.country.is).
		const country_code = parsed_data?.[page_globals.ip_api.country_code];

		// Convert the two-letter ISO 3166-1 alpha-2 code to a regional-indicator
		// emoji sequence; fall back to the string 'unknown' if absent.
		const label = country_code
			? get_flag_emoji(country_code)
			: 'unknown'

		// result object
		return {
			url		: url, // api url
			href	: href, // website to go on user click
			label	: label // text to show (emoji flag)
		}

	} catch (error) {
        console.error('Error resolving IP data:', error);
        return null;
    }
}//end resolve_ip_data



/**
* GET_FLAG_EMOJI
* Convert a two-letter ISO 3166-1 alpha-2 country code to its Unicode flag emoji.
*
* Unicode regional-indicator symbols occupy the range U+1F1E6 (🇦) to U+1F1FF (🇿).
* The base offset 127397 = 0x1F1E6 - 0x41 = 127462 - 65 maps each ASCII uppercase
* letter (code point 65–90) to the corresponding regional-indicator symbol.
* Concatenating the two regional-indicator code points produces the flag emoji that
* modern fonts render as a country flag (e.g. 'E'+'S' → 🇪🇸).
*
* The function upper-cases the input before mapping, so 'es' and 'ES' both work.
* The spread operator `[...country_code]` iterates code points rather than code
* units, which is safe here because ASCII letters are all in the BMP.
*
* @param {string} country_code - ISO 3166-1 alpha-2 code, e.g. `'ES'` or `'AQ'`
* @returns {string} the two-character regional-indicator emoji, e.g. `'🇦🇶'`
*/
const get_flag_emoji = function(country_code) {

	const result = [...country_code.toUpperCase()].map(char =>
		String.fromCodePoint(127397 + char.charCodeAt())
	).reduce((a, b) => `${a}${b}`);

	return result
}//end get_flag_emoji



/**
* IS_PRIVATE_IP
* Return true when the given IP string represents a non-routable or loopback
* address that cannot be sent to an external geolocation service.
*
* Recognized private ranges:
*   - 'localhost'       — the loopback hostname
*   - '127.0.0.1'      — IPv4 loopback (RFC 5735)
*   - 'unknown'        — sentinel value used when the IP could not be captured
*   - 10.0.0.0/8       — RFC-1918 Class A private range
*   - 172.16.0.0/12    — RFC-1918 Class B private range (172.16.x.x – 172.31.x.x)
*   - 192.168.0.0/16   — RFC-1918 Class C private range
*
* (!) IPv6 private ranges (::1, fc00::/7, fe80::/10, etc.) are NOT checked. An
* IPv6 loopback or link-local address passes through to the resolution path and
* will fail at the API call. This is a known gap in the current implementation.
*
* (!) The function splits on '.' and compares string segments, so a malformed
* or empty `ip` will yield `parts[0] === '10'` as false without throwing.
*
* @param {string} ip - IP address or hostname string to test
* @returns {boolean} true if the address is private / non-routable; false otherwise
*/
const is_private_ip = function(ip) {

	if (ip==='localhost' || ip==='127.0.0.1' || ip==='unknown') {
		return true
	}

	const parts = ip.split('.');
	return parts[0] === '10' ||
		(parts[0] === '172' && (parseInt(parts[1], 10) >= 16 && parseInt(parts[1], 10) <= 31)) ||
		(parts[0] === '192' && parts[1] === '168');
}//end is_private_ip



// @license-end
