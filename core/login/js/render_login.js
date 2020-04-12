/*global get_label, page_globals, SHOW_DEBUG*/
/*eslint no-undef: "error"*/



// imports
	import {data_manager} from '../../common/js/data_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_LOGIN
* Manages the component's logic and apperance in client side
*/
export const render_login = function() {

	return true
}//end render_login



/**
* EDIT
* Render node for use in edit
* @return DOM node
*/
render_login.prototype.edit = async function(options={render_level:'full'}) {

	const self = this

	const render_level = options.render_level

	// content_data
		const content_data = await get_content_data(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: "wrapper_login"
		})
		wrapper.appendChild(content_data)

	// validate browser version
		validate_browser()

	// events delegated
		add_events(self, wrapper, content_data)

	// autofocus username
	setTimeout(()=>{
		const username = wrapper.querySelector("#username")
		username.focus()
	},600)

	return wrapper
}//end edit



/**
* ADD_EVENTS
*/
const add_events = function(self, wrapper, content_data) {

	// click event
		wrapper.addEventListener("click", e => {
			//e.stopPropagation()

			// submit form
				if (e.target.matches('#auth_submit')) {
					e.preventDefault()

					const username = e.target.parentNode.querySelector('#username').value
					if (username.length<2) {
						const message = `Invalid username ${username}!`
						ui.show_message(content_data, message, 'error', 'component_message', true)
						return false
					}

					const auth = e.target.parentNode.querySelector('#auth').value
					if (auth.length<2) {
						const message = `Invalid auth code!`
						ui.show_message(content_data, message, 'error', 'component_message', true)
						return false
					}

					//wrapper.classList.add("loading")
					//wrapper.classList.add("preload")

					const button 		= e.target
					const button_label 	= button.querySelector('.button_label')
					const preload 		= button.querySelector('.preload')

					// show spinner and hide button label
						button_label.classList.add("display_none")
						preload.classList.remove("display_none")

					// data_manager api call
					const api_response = data_manager.prototype.request({
						body : {
							action 	 : 'login',
							dd_api 	 : 'dd_utils_api',
							options  : {
								username : username,
								auth 	 : auth
							}
						}
					}).then((response)=>{

						const message  = response.msg
						const msg_type = response.result===true ? 'ok' : 'error'
						ui.show_message(content_data, message, msg_type, 'component_message', true)

						if (response.result===true) {

							window.location.reload(false);

						}else{
							// hide spinner and show button label
								button_label.classList.remove("display_none")
								preload.classList.add("display_none")
						}
					})

					return true
				}
		})

	return true
}//end add_events




/**
* GET_CONTENT_DATA
* @return DOM node content_data
*/
const get_content_data = async function(self) {

	const fragment = new DocumentFragment()

	// select lang
		const langs 		= self.data.dedalo_application_langs
		const select_lang 	= ui.build_select_lang({
			langs 	 : langs,
			selected : page_globals.dedalo_application_lang,
			action 	 : async (e) => {
				const lang = e.target.value || null
				if (lang) {
					// data_manager api call
					const api_response = await data_manager.prototype.request({
						body : {
							action 	 : 'change_lang',
							dd_api 	 : 'dd_utils_api',
							options  : {
								dedalo_data_lang 		: lang,
								dedalo_application_lang : lang
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
			//e.stopPropagation()
			e.target.querySelector('#auth_submit').click()
		})

	// login_items
		const login_items = self.context.properties.login_items

	// User name input
		const login_item_username = login_items.reduce((carry, item) => {return (item.tipo==='dd255') ? item : carry;})
		const user_input = ui.create_dom_element({
			id 				: 'username',
			element_type	: 'input',
			type 			: 'text',
			parent			: form
		})
		user_input.placeholder = login_item_username.label
		user_input.autocomplete= "username"

	// Authorization input
		const login_item_password = login_items.reduce((carry, item) => {return (item.tipo==='dd256') ? item : carry;})
		const auth_input = ui.create_dom_element({
			id 				: 'auth',
			element_type	: 'input',
			type 			: 'password',
			parent			: form
		})
		auth_input.placeholder = login_item_password.label
		auth_input.autocomplete= "current-password"

	// Button
		const login_item_enter = login_items.reduce((carry, item) => { return (item.tipo==='dd259') ? item : carry; })
		const button_enter = ui.create_dom_element({
			id 				: 'auth_submit',
			element_type	: 'button',
			type 			: 'submit',
			parent			: form
		})
		const button_loading = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'preload display_none',
			parent			: button_enter
		})
		const button_content = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'button_label',
			text_content 	: login_item_enter.label,
			parent			: button_enter
		})

		// button_enter.addEventListener("click", (e) => {
		// 	e.stopPropagation()
		// 	e.preventDefault()

		// 	console.log("e:",e);
		// })

	// info
		const info = ui.create_dom_element({
			element_type : 'div',
			class_name 	 : "info"
		})
		const info_data 		= self.context.properties.info || []
		const info_data_length 	= info_data.length
		for (let j = 0; j < info_data_length; j++) {

			const item = info_data[j]

			ui.create_dom_element({
				element_type : 'span',
				text_content : item.label,
				parent 		 : info
			})
			ui.create_dom_element({
				element_type : 'span',
				text_content : item.value,
				parent 		 : info
			})
		}
		fragment.appendChild(info)

	// content_data
		const content_data = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: "content_data"
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

	const target_div	= document.getElementById('login_ajax_response');
	if (target_div) {
		target_div.innerHTML = "Using " + M[0] + " " + M[1] + ""
	}

	return {
	  name: M[0],
	  version: M[1]
	};
}//end get_browser_info



/**
* VALIDATE_BROWSER
* @return bool
*/
const validate_browser = function() {

	const browser_info = get_browser_info()
	const min_version  = {
		Chrome  	: 76,
		Firefox 	: 65,
		AppleWebKit : 10
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
		}

	}catch (e) {
		console.log("error",e)
	}

	return true;
}//end validate_browser




// /**
// * BUTTONS
// * @return DOM node buttons
// */
// const buttons = async function(self) {

// 	const buttons = []

// 	// button register tools
// 		const button_register_tools = ui.button.build_button({
// 			class_name 	: "button_register",
// 			label 		: "Register tools"
// 		})
// 		button_register_tools.addEventListener('mouseup', async (e) => {
// 			e.stopPropagation()
// 			//alert("Click here! ")

// 			// data_manager
// 			const api_response = await data_manager.prototype.request({
// 				body : {
// 					action 		: 'trigger',
// 					class_name 	: 'ontology',
// 					method 		: 'import_tools',
// 					options 	: {}
// 				}
// 			})
// 			//console.log("+++ api_response:",api_response);
// 		})
// 		buttons.push(button_register_tools)

// 	return buttons
// }//end buttons
