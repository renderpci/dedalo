/*global get_label, page_globals, SHOW_DEBUG*/
/*eslint no-undef: "error"*/



// imports
	import {data_manager} from '../../common/js/data_manager.js'
	import {ui} from '../../common/js/ui.js'
	import {strip_tags} from '../../../core/common/js/utils/index.js'



/**
* RENDER_LOGIN
* Manages the component's logic and appearance in client side
*/
export const render_login = function() {

	return true
}//end render_login



/**
* EDIT
* Render node for use in edit
* @param object options
* @return DOM node wrapper
*/
render_login.prototype.edit = async function(options) {

	const self = this

	// options
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = get_content_data(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'login'
		})
		wrapper.appendChild(content_data)
		// set pointers
		wrapper.content_data = content_data

	// validate browser version
		validate_browser()

	// auto-focus username
		setTimeout(()=>{
			const username = content_data.querySelector('#username')
			username.focus()
		}, 600)


	return wrapper
}//end edit



/**
* GET_CONTENT_DATA
* @param instance self
* @return DOM node content_data
*/
const get_content_data = function(self) {

	const fragment = new DocumentFragment()

	// select lang
		const langs			= self.context.properties.dedalo_application_langs
		const select_lang	= ui.build_select_lang({
			langs 	 : langs,
			selected : page_globals.dedalo_application_lang,
			action 	 : async (e) => {
				const lang = e.target.value || null
				if (lang) {
					// data_manager api call
					await data_manager.request({
						body : {
							action	: 'change_lang',
							dd_api	: 'dd_utils_api',
							options  : {
								dedalo_data_lang		: lang,
								dedalo_application_lang	: lang
							}
						}
					})
					window.location.reload(false);
				}
			}
		})
		fragment.appendChild(select_lang)

	// form
		const form = ui.create_dom_element({
			element_type	: 'form',
			parent			: fragment
		})
		form.addEventListener("submit", (e) => {
			e.preventDefault()
			button_enter.click()
		})

	// login_items
		const login_items = self.context.properties.login_items

	// User name input
		const login_item_username = login_items.find(el => el.tipo==='dd255')
		const user_input = ui.create_dom_element({
			id				: 'username',
			element_type	: 'input',
			type			: 'text',
			placeholder		: strip_tags(login_item_username.label),
			parent			: form
		})
		user_input.autocomplete	= "username"

	// Authorization input
		const login_item_password = login_items.find(el => el.tipo==='dd256')
		const auth_input = ui.create_dom_element({
			id				: 'auth',
			element_type	: 'input',
			type			: 'password',
			placeholder		: strip_tags(login_item_password.label),
			parent			: form
		})
		auth_input.autocomplete= "current-password"

	// Button
		const login_item_enter = login_items.find(el => el.tipo==='dd259')
		const button_enter = ui.create_dom_element({
			element_type	: 'button',
			type			: 'submit',
			class_name		: 'button_enter warning',
			parent			: form
		})
		button_enter.addEventListener('click', function(e) {
			e.preventDefault()

			const username = user_input.value
			if (username.length<2) {
				const message = `Invalid username ${username}!`
				ui.show_message(content_data, message, 'error', 'component_message', true)
				return false
			}

			const auth = auth_input.value
			if (auth.length<2) {
				const message = `Invalid auth code!`
				ui.show_message(content_data, message, 'error', 'component_message', true)
				return false
			}

			// show spinner and hide button label
				button_enter_label.classList.add('hide')
				button_enter_loading.classList.remove('hide')
				button_enter.classList.add('white')
				button_enter.blur()

			// data_manager API call
			data_manager.request({
				body : {
					action	: 'login',
					dd_api	: 'dd_utils_api',
					options	: {
						username	: username,
						auth		: auth
					}
				}
			})
			.then((api_response)=>{

				// hide spinner and show button label
					button_enter_label.classList.remove('hide')
					button_enter_loading.classList.add('hide')
					button_enter.classList.remove('white')

				const message	= api_response.msg
				const msg_type	= api_response.result===true ? 'ok' : 'error'
				ui.show_message(content_data, message, msg_type, 'component_message', true)

				self.action_dispatch(api_response)
			})
		})//end button_enter.addEventListener('click', function(e)

		const button_enter_loading = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'spinner button_enter_loading',
			parent			: button_enter
		})
		const button_enter_label = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'button_enter_label',
			inner_html		: strip_tags(login_item_enter.label),
			parent			: button_enter
		})

	// info
		const info = ui.create_dom_element({
			element_type : 'div',
			class_name 	 : "info"
		})
		const info_data			= self.context.properties.info || []
		const info_data_length	= info_data.length
		for (let j = 0; j < info_data_length; j++) {

			const item = info_data[j]

			// label
				ui.create_dom_element({
					element_type	: 'span',
					inner_html		: item.label,
					parent			: info
				})

			// class_name custom for value
				let class_name	= ''
				let value		= item.value
				switch(item.type){
					case 'data_version':
						class_name = (item.value[0]<6)
							? 'error'
							: ''
						value = item.value.join('.') + ' - Outdated!'
						break;
					default:
						break;
				}

			// value
				ui.create_dom_element({
					element_type	: 'span',
					inner_html		: value,
					class_name		: class_name,
					parent			: info
				})
		}
		fragment.appendChild(info)

	// content_data
		const content_data = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_data'
		})
		content_data.appendChild(fragment)


	return content_data
}//end get_content_data



/**
* GET_BROWSER_INFO
* @return object
*/
const get_browser_info = function() {

	let ua = navigator.userAgent,tem,M=ua.match(/(opera|chrome|safari|firefox|msie|trident(?=\/))\/?\s*(\d+)/i) || [];
	if(/trident/i.test(M[1])){
		tem=/\brv[ :]+(\d+)/g.exec(ua) || [];
		return {name:'IE',version:(tem[1]||'')};
		}
	if(M[1]==='Chrome'){
		tem=ua.match(/\bOPR|Edge\/(\d+)/)
		if(tem!=null)   {return {name:'Opera', version:tem[1]};}
		}
	M=M[2]? [M[1], M[2]]: [navigator.appName, navigator.appVersion, '-?'];
	if((tem=ua.match(/version\/(\d+)/i))!=null) {M.splice(1,1,tem[1]);}

	const target_div = document.getElementById('login_ajax_response');
	if (target_div) {
		target_div.innerHTML = "Using " + M[0] + " " + M[1] + ""
	}

	return {
		name	: M[0],
		version	: M[1]
	};
}//end get_browser_info



/**
* VALIDATE_BROWSER
* @return bool
*/
const validate_browser = function() {

	const browser_info = get_browser_info()
	const min_version  = {
		Chrome		: 76,
		Firefox		: 65,
		AppleWebKit	: 10
	}

	const msg = (browser, version, min_version) => {
		return `Sorry, your ${browser} browser version is too old (${version}). \nPlease update your ${browser} version to ${min_version} or never`
	}

	try {
	   // Browser warning
		switch(true) {
			case (navigator.userAgent.indexOf('Chrome')!==-1) :

				if (browser_info && browser_info.version && parseInt(browser_info.version) < min_version.Chrome) {
					alert( msg('Chrome', browser_info.version, min_version.Chrome) );
					return false;
				}

			case (navigator.userAgent.indexOf('AppleWebKit')!==-1) :
				if (browser_info && browser_info.version && parseInt(browser_info.version) < min_version.AppleWebKit) {
					alert( msg('AppleWebKit', browser_info.version, min_version.AppleWebKit) );
					return false;
				}
				break;

			case (navigator.userAgent.indexOf('Firefox')!==-1) :

				if (browser_info && browser_info.version && parseInt(browser_info.version) < min_version.Firefox) {
					alert( msg('Firefox', browser_info.version, min_version.Firefox) );
					return false;
				}
				break;

			default:
				alert("Sorry. Your browser is not verified to work with Dédalo. \n\nOnly Webkit browsers are tested by now. \n\nPlease download the last version of official Dédalo browser (Google Chrome - Safari) to sure a good experience.")
				break;
		}

	}catch (e) {
		console.log("error",e)
	}

	return true;
}//end validate_browser
