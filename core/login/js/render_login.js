// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/* global get_label, page_globals, SHOW_DEBUG */
/*eslint no-undef: "error"*/



// imports
	import {data_manager} from '../../common/js/data_manager.js'
	import {get_instance} from '../../common/js/instances.js'
	import {ui} from '../../common/js/ui.js'
	import {strip_tags, url_vars_to_object} from '../../../core/common/js/utils/index.js'



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
* @return HTMLElement wrapper
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
			if (username) {
				username.focus()
			}
		}, 600)


	return wrapper
}//end edit



/**
* GET_CONTENT_DATA
* @param instance self
* @return HTMLElement content_data
*/
const get_content_data = function(self) {

	const fragment	= new DocumentFragment()
	const info_data	= self.context.properties.info || []

	// top
		const top = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'top hide',
			parent			: fragment
		})

	// select_lang
		if (self.add_select_lang) {
			const langs			= page_globals.dedalo_application_langs
			const selected_lang = page_globals.dedalo_application_lang
			const select_lang	= ui.build_select_lang({
				langs 	 : langs,
				selected : selected_lang,
				action 	 : async (e) => {
					const lang = e.target.value || null
					if (lang) {
						// data_manager api call
						await data_manager.request({
							use_worker	: false,
							body		: {
								action	: 'change_lang',
								dd_api	: 'dd_utils_api',
								options	: {
									dedalo_application_lang	: lang
								}
							}
						})
						window.location.reload(false);
					}
				}
			})
			fragment.appendChild(select_lang)
			// fix
			self.select_lang = select_lang
		}

	// form
		const form = ui.create_dom_element({
			element_type	: 'form',
			class_name		: 'login_form',
			parent			: fragment
		})
		const submit_handler = (e) => {
			e.preventDefault()
			// fire button enter mousedown event
			button_enter.dispatchEvent(new Event('mousedown'));
		}
		form.addEventListener('submit', submit_handler)

	// login_items
		const login_items = self.context.properties.login_items

	// check login_items. If there were problems with type resolution, maybe the Ontology tables are not reachable
		if (!login_items || !login_items.find(el => el.tipo==='dd255')) {

			// URL vars. Check for 'recovery' GET param
			const url_vars = url_vars_to_object()
			if (url_vars.recovery) {
				// refresh the window to force read DEDALO_MAINTENANCE_MODE in server side
				setTimeout(function(){
					// Refresh the page and bypass the cache
					location.reload(true);
				}, 3000)
				return ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'content_data error_message warning',
					inner_html		: '🥵 Trying to recover from a serious problem in the Ontology. Please wait.. or reload the page',
					parent			: fragment
				})
			}

			return ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'content_data error_message error',
				inner_html		: 'Error on create login form. login_items are invalid. Check your database connection and integrity or reinstall Dédalo',
				parent			: fragment
			})
		}

	// User name input
		const login_item_username = login_items.find(el => el.tipo==='dd255')
		const user_input = ui.create_dom_element({
			id				: 'username',
			element_type	: 'input',
			type			: 'text',
			placeholder		: strip_tags(login_item_username.label),
			parent			: form
		})
		user_input.autocomplete	= 'username'

	// Authorization input
		const login_item_password = login_items.find(el => el.tipo==='dd256')
		const auth_input = ui.create_dom_element({
			id				: 'auth',
			element_type	: 'input',
			type			: 'password',
			placeholder		: strip_tags(login_item_password.label),
			parent			: form
		})
		auth_input.autocomplete= 'current-password'

	// development server. Value is set in environment as global var (set in server config file)
		if (DEVELOPMENT_SERVER) {

			// set self.use_service_worker as false by default
			self.use_service_worker = false;

			const dev_server_options = ui.create_dom_element({
				element_type	: 'h4',
				class_name		: 'dev_server_options',
				inner_html		: 'Developer server options',
				parent			: form
			})

			const use_service_worker_container = ui.create_dom_element({
				element_type	: 'label',
				class_name		: 'use_service_worker_container unselectable',
				inner_html		: 'Use service worker',
				title			: 'Disable by default in development servers (config DEVELOPMENT_SERVER)',
				parent			: form
			})
			ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'button icon gears',
				parent			: use_service_worker_container
			})
			const checkbox_use_service_worker = ui.create_dom_element({
				element_type	: 'input',
				type			: 'checkbox',
				parent			: use_service_worker_container
			})
			checkbox_use_service_worker.addEventListener('change', (e) => {
				self.use_service_worker = checkbox_use_service_worker.checked ?? false
			})
			use_service_worker_container.prepend(checkbox_use_service_worker)
		}

	// DEMO user
	// add demo user if the installation is the open public demo: demo.dedalo.dev
	// do not use this user pw and entity in production
		const dedalo_entity =  info_data.find(el => el.type === 'dedalo_entity')
		if(dedalo_entity && dedalo_entity.value === 'dedalo_demo'){
			const dedalo_demo_user = info_data.find(el => el.type === 'demo_user')
			user_input.value = dedalo_demo_user.value.user || ''
			auth_input.value = dedalo_demo_user.value.pw || ''
		}

	// button submit
		const login_item_enter = login_items.find(el => el.tipo==='dd259')
		const button_enter = ui.create_dom_element({
			element_type	: 'button',
			type			: 'submit',
			class_name		: 'button_enter warning',
			parent			: form
		})
		// button_enter_loading
			const button_enter_loading = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'spinner button_enter_loading hide',
				parent			: button_enter
			})
		// button_enter_label
			const button_enter_label = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'button_enter_label',
				inner_html		: strip_tags(login_item_enter.label || 'Enter'),
				parent			: button_enter
			})
		// event click
		const click_handler = async (e) => {
			e.stopPropagation()
			e.preventDefault()

			// username check
				const username = user_input.value
				if (username.length<2) {
					const message = `Invalid username ${username}!`
					ui.show_message(messages_container, message, 'error', 'component_message', true)
					return false
				}

			// auth check
				const auth = auth_input.value
				if (auth.length<2) {
					const message = `Invalid auth code!`
					ui.show_message(messages_container, message, 'error', 'component_message', true)
					return false
				}

			// check status
				if (self.status==='login') {
					return
				}

			// status update
				self.status = 'login'

			// show spinner and hide button label
				button_enter_label.classList.add('hide')
				button_enter_loading.classList.remove('hide')
				button_enter.classList.add('white')
				button_enter.blur()

			// login : data_manager API call
				const api_response = await self.login({
					username	: username,
					auth		: auth
				})

				if (api_response.result===false) {

					// errors found

					const message	= api_response.errors && api_response.errors.length>0
						? api_response.errors
						: api_response.msg || ['Unknown login error happen']
					const msg_type	= 'error'
					ui.show_message(messages_container, message, msg_type, 'component_message', true)

					// hide spinner and show button label
					button_enter_label.classList.remove('hide')
					button_enter_loading.classList.add('hide')
					button_enter.classList.remove('white')

				}else{

					// success case

					const message	= api_response.msg
					const msg_type	= 'ok';
					ui.show_message(messages_container, message, msg_type, 'component_message', true)

					// hide spinner and show button label

					// errors handle
					// If errors found in API response (many vars and directories are checked in 'dd_init.test' on login)
					// the login sequence is stopped to warn the user of problems
					if (api_response.errors && api_response.errors.length) {
						const msg = api_response.errors.join('<br>')
						console.error('msg:', msg);
						ui.show_message(
							messages_container,
							api_response.errors.join('<br>'),
							'error',
							'component_message',
							true
						)
						button_enter_loading.classList.add('hide')

						const button_continue = ui.create_dom_element({
							element_type	: 'button',
							class_name		: 'button_continue warning white',
							inner_html		: get_label.continue || 'Continue',
							parent			: messages_container
						})
						// click event
						const continue_click_handler = (e) => {
							e.stopPropagation()
							self.action_dispatch(api_response)
						}
						button_continue.addEventListener('click', continue_click_handler)

						return
					}

					// After API login call, it's possible to go to some different pages,
					// handled by self.custom_action_dispatch value set on build
					self.action_dispatch(api_response)
				}

				// status update
					self.status = 'rendered'
		}
		button_enter.addEventListener('mousedown', click_handler)

	// info
		// web version add
		const browser_info = get_browser_info()
		info_data.push({
			label	: 'Browser info',
			type	: 'version',
			value	: browser_info.name + ' ' + browser_info.version
		})
		const info_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'info_container',
			parent			: fragment
		})
		const info_data_length = info_data.length
		for (let j = 0; j < info_data_length; j++) {

			const item = info_data[j]

			// label
				ui.create_dom_element({
					element_type	: 'span',
					inner_html		: item.label,
					parent			: info_container
				})

			// class_name custom for value
				let class_name	= ''
				let value		= item.value
				switch(item.type){
					case 'data_version': {
						const is_outdated = item.value[0]<6
						if (is_outdated) {
							class_name	= 'error'
							value		= item.value.join('.') + ' - Outdated!'
							// if version is outdated, jump to area development to update
							const area_maintenance_tipo = 'dd88'
							if (window.location.search.indexOf(area_maintenance_tipo)===-1) {
								const base_url = window.location.origin + window.location.pathname
								const target_url = base_url + '?t=' + area_maintenance_tipo
								window.location.replace(target_url)
							}
						}
						break;
					}
					default:
						if (Array.isArray(value)) {
							value = value.join('<br>')
						}
						break;
				}

			// value
				ui.create_dom_element({
					element_type	: 'span',
					inner_html		: value,
					class_name		: class_name,
					parent			: info_container
				})
		}

	// saml
		if (self.saml) {
			const saml_container = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'saml_container',
				parent			: fragment
			})
			self.saml.render()
			.then(function(saml_wrapper){
				saml_container.appendChild(saml_wrapper)
			})
		}

	// powered by
		const powered_by = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'powered_by',
			parent			: fragment
		})
		ui.create_dom_element({
			element_type	: 'img',
			class_name		: 'dedalo_logo',
			src				: '../../core/themes/default/dedalo_logo.svg',
			parent			: powered_by
		})
		const link = ui.create_dom_element({
			element_type	: 'a',
			class_name		: 'dedalo_link',
			href			: 'https://dedalo.dev',
			text_content	: 'Dédalo Cultural Heritage Management System',
			parent			: powered_by
		})
		link.target = '_blank'

	// messages_container
		const messages_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'messages_container',
			parent			: fragment
		})

	// content_data
		const content_data = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_data'
		})
		content_data.appendChild(fragment)
		// set pointers
		content_data.top				= top
		content_data.select_lang		= self.select_lang
		content_data.form				= form
		content_data.info_container		= info_container
		content_data.messages_container	= messages_container


	return content_data
}//end get_content_data



/**
* GET_BROWSER_INFO
* @return object info
* {
* 	name : Chrome
* 	version : 106
* }
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

	const info = {
		name	: M[0],
		version	: M[1]
	}

	return info
}//end get_browser_info



/**
* VALIDATE_BROWSER
* @return bool
*/
const validate_browser = function() {

	const browser_info = get_browser_info()
	const min_version  = {
		Chrome		: 100,
		Firefox		: 100,
		AppleWebKit	: 14
	}

	// function msg
	const msg = (browser, version, min_version) => {
		return `Sorry, your browser ${browser} version is too old (${version}). \nPlease update your ${browser} version to ${min_version} or never`
	}

	try {
	   // Browser warning
		switch(true) {
			case (navigator.userAgent.indexOf('Chrome')!==-1) :

				if (browser_info && browser_info.version && parseInt(browser_info.version) < min_version.Chrome) {
					alert( msg('Chrome', browser_info.version, min_version.Chrome) );
					return false;
				}
				break;

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
	}catch (error) {
		console.error('error', error)
	}


	return true;
}//end validate_browser



/**
* RENDER_FILES_LOADER
* Creates the files loader nodes
* @see login.action_dispatch
* @return HTMLElement cont
*/
export const render_files_loader = function() {

	// cont
		const cont = ui.create_dom_element({
			element_type	: 'div',
			id				: 'cont',
			class_name		: 'cont',
			dataset			: {
				pct : 'Loading..'
			}
		})

	// svg circle
		const svg_string = `
		<svg id="svg" width="200" height="200" viewPort="0 0 100 100" version="1.1" xmlns="http://www.w3.org/2000/svg">
			<circle r="90" cx="100" cy="100" fill="transparent" stroke-dasharray="565.48" stroke-dashoffset="0"></circle>
			<circle id="bar" class="hide" r="90" cx="100" cy="100" fill="transparent" stroke-dasharray="565.48" stroke-dashoffset="0"></circle>
		</svg>`

		const parser	= new DOMParser();
		const svg		= parser.parseFromString(svg_string, 'image/svg+xml').firstChild;
		cont.appendChild( svg )

	// update. receive worker messages data
		let loaded = 0
		cont.update = function( data ) {

			const total_files	= data.total_files
			const rate			= data.status==='loading'
				? 100/total_files
				: 0

			// update loaded
			loaded = rate + loaded
			if (loaded>99) {
				loaded = 100
			}

			// animate
			requestAnimationFrame(()=>{
				animate_circle(loaded)
			})
		}

	// bar_circle animation
		const bar_circle		= svg.querySelector('#bar')
		const radio				= bar_circle.getAttribute('r');
		const cst				= Math.PI*(radio*2);
		const animate_circle	= (value) => {

			if (value>0 && bar_circle.classList.contains('hide')) {
				bar_circle.classList.remove('hide')
			}

			const val = (value > 100)
				? 100
				: Math.abs(parseInt(value))

			const offset = ((100-val)/100)*cst

			// change circle stroke offset
			bar_circle.style.strokeDashoffset = offset

			// updates number as 50%
			cont.dataset.pct = val + '%'
		}

	// loader_label
		ui.create_dom_element({
			element_type	: 'h2',
			class_name		: 'loader_label',
			inner_html		: get_label.loading_dedalo_files || 'Loading Dédalo files',
			parent			: cont
		})


	return cont
}//end render_files_loader



/**
* RENDER_RELOGIN
* Create a new login instance, and after rendering it, place the node in the body of the DOM.
* Used to allow user login after session with server is lost due to timeout or error
* @see component_common.save()
* @param object options
* {
* 	on_success : function|null,
* 	main_container : HTMLElement
* }
* @return object loggin_instance
*/
export const render_relogin = async function(options={}) {

	// options
		const on_success		= options.on_success || null
		const main_container	= options.main_container || document.querySelector('.wrapper.page')

	// lock main container (normally page)
		if (main_container) {
			main_container.classList.add('loading')
		}

	// loggin_instance
		const loggin_instance = await get_instance({
			model					: 'login',
			tipo					: 'dd229',
			mode					: 'edit',
			add_select_lang			: false,
			custom_action_dispatch	: function() {

				// work done! Destroy this login instance and DOM
				loggin_instance.destroy(true, true, true)

				// unlock main container (normally page)
				if (main_container) {
					main_container.classList.remove('loading')
				}

				// exec possible on_success callback function if exists
				if (on_success && typeof on_success==='function') {
					on_success(this)
				}
			}
		})
		await loggin_instance.build(true)
		const loggin_node = await loggin_instance.render()
		loggin_node.content_data.classList.add('overlay')

		// powered_by
		loggin_node.querySelector('.powered_by').classList.add('hide')

	// add to DOM
		document.body.appendChild(loggin_node)


	return loggin_instance
}//end render_relogin



// @license-end
