// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {get_fallback_value} from '../../common/js/common.js'



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
				setTimeout(async ()=>{

					// cache
						// cache create if not exists or reset if is too big
						if (!window.resolved_ip_data || Object.keys(window.resolved_ip_data).length>100) {
							window.resolved_ip_data = {}
						}
						// cache set function call
						if (!window.resolved_ip_data[ip]) {
							window.resolved_ip_data[ip] = resolve_ip_data(ip)
						}

					// exec function and white if is not already resolved
						const response = await window.resolved_ip_data[ip]
						if (!response) {
							return
						}

					// create the link with flag
						const link = ui.create_dom_element({
							element_type	: 'a',
							href			: response.href,
							class_name		: 'link',
							inner_html		: response.label,
							parent			: wrapper
						})
						link.target = '_blank'
				}, 250)
				break;
		}


	return wrapper
}//end list



/**
* RESOLVE_IP_DATA
* Create a font emoji from country code like 'ES'
* @param string ip
* @return object|null result
*/
const resolve_ip_data = async function(ip) {

	// end_point. From config IP_API
		if (!page_globals.ip_api) {
			return null
		}
		const url	= page_globals.ip_api.url.replace(/(\$ip)/, ip);
		const href	= page_globals.ip_api.href.replace(/(\$ip)/, ip);

	// fetch data
		const response		= await fetch(url);
		const parsed_data	= await response.json();

	// country_code from data, like 'AQ'
		const country_code = parsed_data[page_globals.ip_api.country_code]

		const label = country_code
			? get_flag_emoji(country_code)
			: 'unknown'

	// result object
		const result = {
			url		: url, // api url
			href	: href, // website to go on user click
			label	: label // text to show (emoji flag)
		}


	return result
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
