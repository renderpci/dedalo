// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {get_fallback_value} from '../../common/js/common.js'
	import {dd_request_idle_callback} from '../../common/js/events.js'



/**
* VIEW_IP_LIST_INPUT_TEXT
* Manages the component's logic and appearance in client side
*/
export const view_ip_list_input_text = function() {

	return true
}//end view_ip_list_input_text



/**
* RENDER
* Render component node to use in list
* @return HTMLElement wrapper
*/
view_ip_list_input_text.render = async function(self, options) {

	// self.resolved_ip
		if (!self.resolved_ip) {
			self.resolved_ip = []
		}

	// short vars
		const data				= self.data
		const value				= data.value || []
		const fallback_value	= data.fallback_value || []
		const fallback			= get_fallback_value(value, fallback_value)
		const value_string		= fallback.join(self.context.fields_separator)

	// wrapper
		const wrapper = ui.component.build_wrapper_list(self, {
			value_string : value_string
		})


	// link
		const ip = value_string
		switch (true) {
			case is_private_ip(ip):
				// nothing to do here
				break;

			default:
				// Executes the IP resolution with low priority
				dd_request_idle_callback(
					async () => {
						try {

							// cache create if not exists or reset if is too big
							if (!window.resolved_ip_data) {
								window.resolved_ip_data = new Map();
							}else if( window.resolved_ip_data.size > 300 ) {
								window.resolved_ip_data.clear()
							}

							// Helper function to render and append link
							const render_and_append_link = (ip_data) => {
								const link_node = render_link(ip_data.href, ip_data.label);
								requestAnimationFrame(() => {
									wrapper.appendChild(link_node);
								});
							};

							// Check cache first
							if( window.resolved_ip_data.has(ip) ) {
								// Already calculated case
								const ip_data = window.resolved_ip_data.get(ip)
								render_and_append_link(ip_data);
								return;
							}

							// Resolve new IP data
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
* Creates the link with flag
* @param string href
* @param string label
* @return HTMLElement link_node
*/
export const render_link = function (href, label) {

	const link_node = ui.create_dom_element({
		element_type	: 'a',
		href			: href,
		class_name		: 'link',
		inner_html		: label
	})
	link_node.target = '_blank'


	return link_node
}//end render_link



/**
* RESOLVE_IP_DATA
* Create a font emoji from country code like 'ES'
* @param string ip
* @return object|null result
* sample data: {
*	 href: "https://ip-api.com/#2c7c:5a84:a00b:4c30:3806:a0c2:e867:11a2"
*	 label: "🇪🇸"
*	 url: "https://api.country.is/2c7c:5a84:a00b:4c30:3806:a0c2:e867:11a2"
* }
*/
const resolve_ip_data = async function(ip) {

	// Validate input
    if (!ip || typeof ip !== 'string') {
        return null;
    }

	// Check config end_point. From config IP_API
	if (!page_globals.ip_api) {
		return null
	}

	try {

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
		const country_code = parsed_data?.[page_globals.ip_api.country_code];

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
* Create a font emoji from country code like 'ES'
* @param string country_code
* @return string result
* 	Like 🇦🇶
*/
const get_flag_emoji = function(country_code) {

	const result = [...country_code.toUpperCase()].map(char =>
		String.fromCodePoint(127397 + char.charCodeAt())
	).reduce((a, b) => `${a}${b}`);

	return result
}//end get_flag_emoji



/**
* IS_PRIVATE_IP
* Check if given IP is private
* @param string ip
* @return bool
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
