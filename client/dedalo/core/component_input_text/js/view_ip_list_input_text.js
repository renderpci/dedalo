// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {get_fallback_value} from '../../common/js/common.js'
	import {dd_request_idle_callback} from '../../common/js/events.js'
	import {data_manager} from '../../common/js/data_manager.js'



/**
* VIEW_IP_LIST_INPUT_TEXT
* List-view renderer for component_input_text fields configured with view = 'ip'.
*
* This module renders a stored IP address string in list mode and, for non-private
* IPs, asynchronously enriches the wrapper with a clickable country-flag link by
* asking the SAME-ORIGIN server action `dd_core_api::get_ip_country` to resolve
* the country.
*
* Responsibilities:
*   - Build the synchronous wrapper via `ui.component.build_wrapper_list` so the
*     list row is never blocked by a network call.
*   - Skip resolution entirely for private / loopback / reserved addresses (IPv4
*     and IPv6) — those cannot be geolocated and should not generate a round-trip.
*   - Defer the resolution to an idle callback (`dd_request_idle_callback`) so the
*     browser remains responsive during heavy list renders.
*   - Maintain a module-level LRU-style cache (`window.resolved_ip_data`, a Map)
*     capped at 300 entries to avoid resolving the same IP more than once per
*     page load without unbounded memory growth.
*   - On resolution, inject an `<a>` link carrying the country-flag emoji label
*     into the already-rendered wrapper via `requestAnimationFrame`.
*
* Resolution (server-side, free/open/reliable):
*   Country lookup runs on the server (src/core/geoip) against the openly-licensed
*   DB-IP IP-to-Country Lite database (CC-BY-4.0), loaded once at boot. The browser
*   makes NO third-party request — only a same-origin call via `data_manager`. The
*   server returns `country_code: null` for private/reserved/unresolved IPs and
*   when GeoIP is disabled, in which case the row shows only the raw IP text.
*
* Exports: view_ip_list_input_text (namespace), render_link (utility)
*
* @see render_list_component_input_text — dispatcher that selects this module for
*      view = 'ip'
* @see view_default_list_input_text    — default list view (no geolocation)
* @see src/core/geoip/                  — server-side resolution subsystem
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
							// DOM mutation logic. A null label means the IP resolved to
							// no country (private/reserved/unknown, or GeoIP disabled) —
							// nothing to append, the row keeps just the IP text.
							const render_and_append_link = (ip_data) => {
								if (!ip_data || !ip_data.label) {
									return;
								}
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
							// Ask the server (same-origin) to resolve the country. The
							// promise is not awaited with a top-level await here so that
							// the idle callback returns quickly; resolution continues in
							// .then(). A null result means the request failed — degrade
							// silently (the row keeps just the IP text).
							resolve_ip_data(ip)
							.then(function(ip_data){

								if (!ip_data) {
									return
								}

								// Cache the result (even when it resolved to no country,
								// so the same IP is not queried again) and render.
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
* Resolve the country for an IP address via the SAME-ORIGIN server action
* `dd_core_api::get_ip_country` and return a normalized object ready for
* `render_link`.
*
* Resolution is done server-side and OFFLINE against the openly-licensed DB-IP
* IP-to-Country Lite database (src/core/geoip) — the browser no longer calls any
* third-party geolocation service, so there is no CORS, no rate limit, and no
* per-visitor dependency on an external API being reachable. `data_manager.request`
* posts to `../api/v1/json/` (same origin) and attaches the CSRF token.
*
* The server returns `country_code: null` for private/reserved/unresolved IPs and
* when GeoIP is disabled or its database is not loaded; in that case `label` is
* null and no flag link is appended (the row keeps just the IP text).
*
* The click-through `href` points at the DB-IP page for the IP
* (`https://db-ip.com/<ip>`) — this both gives the user a details view AND
* discharges the CC-BY-4.0 attribution obligation (a link back to DB-IP.com on
* pages that display results from the database).
*
* Returns null (rather than throwing) on any request error so the list render is
* never blocked.
*
* @param {string} ip - The IP address string to resolve (IPv4 or IPv6)
* @returns {Promise<Object|null>} On a successful request:
*   ```
*   {
*     href  : string,        // DB-IP page for the IP (for <a href>, also attribution)
*     label : string|null    // country-flag emoji (e.g. "🇪🇸"), or null when unresolved
*   }
*   ```
*   Returns null only when the request itself fails or `ip` is invalid.
*/
const resolve_ip_data = async function(ip) {

	// Validate input
    if (!ip || typeof ip !== 'string') {
        return null;
    }

	try {

		// Same-origin resolution. data_manager.request handles CSRF + JSON.
		const api_response = await data_manager.request({
			body : {
				dd_api	: 'dd_core_api',
				action	: 'get_ip_country',
				options	: { ip : ip }
			}
		})

		// ISO 3166-1 alpha-2 code (e.g. 'ES') or null when unresolved / disabled.
		const country_code = api_response?.data?.country_code ?? null;

		// DB-IP details page for this IP. Doubles as the required CC-BY-4.0
		// attribution link back to DB-IP.com.
		const href = `https://db-ip.com/${encodeURIComponent(ip)}`;

		// Flag emoji when a country resolved; null means "no flag to show".
		const label = country_code
			? get_flag_emoji(country_code)
			: null

		// result object
		return {
			href	: href,  // website to go on user click (+ attribution)
			label	: label  // text to show (emoji flag) or null
		}

	} catch (error) {
        console.warn('Error resolving IP data:', error);
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
* Return true when the given IP string is a non-routable / reserved / local
* address that cannot be geolocated. Used here only as a cheap CLIENT-SIDE
* pre-filter to skip a needless round-trip — the server (src/core/geoip) applies
* the authoritative check and also returns no country for these.
*
* Recognized (IPv4 AND IPv6, mirroring src/core/geoip/ip_ranges.ts):
*   - sentinels: '' , 'local', 'localhost', 'unknown'
*   - IPv4: 10/8, 127/8, 169.254/16, 172.16-31/12, 192.168/16
*   - IPv6: ::1 (loopback), :: (unspecified), fe80::/10 (link-local),
*           fc00::/7 (unique-local), and IPv4-mapped ::ffff:<v4> (unwrapped)
*
* `'local'` is the value the server stores for a request with no X-Forwarded-For
* header; `::1` is the IPv6 loopback seen in local/dev — both previously slipped
* through the IPv4-only check and caused a failed lookup.
*
* @param {string} ip - IP address or hostname string to test
* @returns {boolean} true if the address is private / non-routable; false otherwise
*/
const is_private_ip = function(ip) {

	if (!ip || typeof ip !== 'string') {
		return true
	}

	// Normalize: trim, lowercase, drop an IPv6 zone id, strip brackets.
	let s = ip.trim().toLowerCase()
	const zone = s.indexOf('%')
	if (zone !== -1) {
		s = s.slice(0, zone)
	}
	if (s.startsWith('[') && s.endsWith(']')) {
		s = s.slice(1, -1)
	}

	if (s==='' || s==='local' || s==='localhost' || s==='unknown') {
		return true
	}

	// IPv4-mapped IPv6 in dotted form (::ffff:127.0.0.1) → unwrap and re-test.
	if (s.startsWith('::ffff:') && s.includes('.')) {
		return is_private_ip(s.slice('::ffff:'.length))
	}

	// IPv6
	if (s.includes(':')) {
		if (s==='::' || s==='::1') {
			return true
		}
		const first = s.split(':')[0]
		if (first.startsWith('fc') || first.startsWith('fd')) {
			return true // unique-local fc00::/7
		}
		if (first.length >= 3 && first.startsWith('fe') && '89ab'.includes(first[2])) {
			return true // link-local fe80::/10
		}
		return false
	}

	// IPv4
	const parts = s.split('.');
	return parts[0] === '10' ||
		parts[0] === '127' ||
		(parts[0] === '169' && parts[1] === '254') ||
		(parts[0] === '172' && (parseInt(parts[1], 10) >= 16 && parseInt(parts[1], 10) <= 31)) ||
		(parts[0] === '192' && parts[1] === '168');
}//end is_private_ip



// @license-end
