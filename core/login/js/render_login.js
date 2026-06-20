// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/* global get_label, page_globals, SHOW_DEBUG, DEVELOPMENT_SERVER */
/*eslint no-undef: "error"*/



/**
* RENDER_LOGIN
* Client-side rendering layer for the Dédalo login screen.
*
* This module is responsible for building every DOM node that the login UI
* requires. It is intentionally kept separate from the business logic that
* lives in login.js so that the rendering contract (what nodes are created,
* which class names they carry, and which DOM pointers are exposed) can be
* understood and maintained in isolation.
*
* Main exports:
*  - render_login         — prototype-assignment constructor; its sole
*                           prototype method `edit` is mixed into the login
*                           instance by login.js.
*  - render_files_loader  — standalone factory for the circular SVG progress
*                           indicator shown while the service worker loads
*                           Dédalo's JS/CSS asset cache after a successful
*                           authentication.
*  - render_relogin       — async factory that creates a full overlay login
*                           form inside an already-running Dédalo page session,
*                           used to re-authenticate after a server timeout
*                           without a full page reload.
*
* Internal (module-private) helpers:
*  - get_content_data     — builds the login form fragment (language selector,
*                           username/password inputs, browser info panel,
*                           SAML container, and powered-by footer).
*  - get_browser_info     — parses navigator.userAgent and returns browser
*                           name + major version.
*  - validate_browser     — compares the detected browser version against
*                           minimum requirements and calls alert() when the
*                           browser is unsupported.
*
* Data shape expected on the login instance (self):
*  - self.context.properties.login_items  {Array}   Ontology-resolved form
*      fields; each item has `tipo` (ontology id) and `label` (translated
*      string). Required tipos: dd255 (username), dd256 (password), dd259
*      (submit button label).
*  - self.context.properties.info         {Array}   Installation metadata
*      items, each with `{ type, label, value }`. Displayed in the info
*      panel below the form. The `data_version` type triggers an auto-
*      redirect to the maintenance area when the DB schema is outdated.
*  - self.add_select_lang                 {boolean} Whether to render the
*      language switcher above the form.
*  - self.saml                            {Object|null} Optional SAML
*      instance (built by login.build()). When present its render() method
*      is called and the resulting node is placed in the saml_container.
*  - self.use_service_worker              {boolean} Toggled by a developer-
*      mode checkbox; controls whether login.action_dispatch() uses the
*      service worker or the plain worker_cache fallback.
*  - self.status                          {string}  Guards against double-
*      submission ('login' sentinel blocks concurrent clicks).
*  - self.login(options)                  {Function} Async method (from
*      login.js) that POSTs credentials to dd_utils_api action 'login'.
*  - self.action_dispatch(api_response)   {Function} Post-login routing hook
*      (from login.js) that handles redirect/reload after authentication.
*/

// imports
	import {data_manager} from '../../common/js/data_manager.js'
	import {get_instance} from '../../common/js/instances.js'
	import {ui} from '../../common/js/ui.js'
	import {strip_tags, url_vars_to_object} from '../../../core/common/js/utils/index.js'



/**
* RENDER_LOGIN
* Constructor for the login render prototype.
*
* Acts as a mixin host: login.js assigns render_login.prototype.edit to
* login.prototype.edit so that login instances acquire the edit() rendering
* method without inheriting from render_login directly. The constructor
* itself performs no work — it simply returns true as a truthy initialiser
* signal consistent with other Dédalo render constructors.
*/
export const render_login = function() {

	return true
}//end render_login



/**
* EDIT
* Builds and returns the top-level login wrapper node.
*
* Called by common.prototype.render() and assigned to login.prototype.edit
* by login.js. Two modes are supported via `options.render_level`:
*  - 'full' (default) — wraps content_data in an outer `.login` div, runs
*    browser validation, and schedules auto-focus on the username input.
*  - 'content' — returns only the inner content_data element (used when the
*    caller needs to embed the form without the outer wrapper, e.g. for the
*    re-login overlay).
*
* Side effects:
*  - Calls validate_browser(), which may call alert() for unsupported browsers.
*  - Schedules a 600 ms setTimeout to focus the #username input so the user
*    can start typing immediately without a manual click.
*
* The returned wrapper exposes a `content_data` pointer for callers that need
* to manipulate individual child regions after render (e.g. login.action_dispatch
* references wrapper.content_data.top and wrapper.content_data.form).
*
* @param {Object} options - Render options passed from common.prototype.render()
* @param {string} [options.render_level='full'] - 'full' returns the outer wrapper;
*        'content' returns only the inner content_data element
* @returns {Promise<HTMLElement>} The `.login` wrapper div (render_level='full') or
*          the inner content_data div (render_level='content')
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
		// (!) 600 ms delay ensures the DOM is fully painted and any CSS
		// transitions have begun before focus is applied.
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
* Builds the complete login form fragment and returns it wrapped in a
* content_data div.
*
* Constructs all visible regions of the login page in document order:
*  1. `.top`              — initially hidden; revealed by login.action_dispatch
*                           after successful authentication to host the circular
*                           files-loader progress indicator.
*  2. Language selector   — present only when self.add_select_lang is truthy.
*                           Persists the choice via dd_utils_api 'change_lang'
*                           then forces a full page reload so ontology labels
*                           are regenerated in the new language.
*  3. `.login_form`       — HTML <form> with username + password inputs and
*                           submit button; native <form> submit is intercepted
*                           and forwarded to the button's mousedown handler.
*  4. Developer options   — service-worker toggle rendered only when the
*                           DEVELOPMENT_SERVER global is truthy. The service
*                           worker is disabled by default in dev environments
*                           to prevent stale-cache issues.
*  5. Demo user           — auto-fills credentials for the public demo
*                           installation (entity 'dedalo_demo'). The check is
*                           intentionally harmless on production, where the
*                           'dedalo_demo' entity value will never match.
*  6. `.info_container`   — installation metadata panel built from
*                           self.context.properties.info items (DB version,
*                           Dédalo version, browser info, etc.). The
*                           'data_version' item triggers an immediate redirect
*                           to the maintenance area (dd88) when the major
*                           version is below 6 (pre-v7 DB schema).
*  7. `.saml_container`   — placeholder for the optional SAML SSO login button.
*                           Revealed asynchronously if self.saml.render()
*                           resolves successfully.
*  8. `.powered_by`       — Dédalo logo + external link.
*  9. `.messages_container` — target for ui.show_message() error/success banners.
*
* Guard clause: if login_items is absent or missing the username tipo (dd255),
* the ontology tables are likely unreachable. The 'recovery' URL param triggers
* a 3 s auto-reload (server may be finishing recovery); otherwise a fatal error
* element is returned.
*
* DOM pointers set on the returned content_data element:
*  .top                — div for files-loader injection post-login
*  .select_lang        — the language <select> node (or undefined when not rendered)
*  .form               — the <form> element
*  .info_container     — the info panel div
*  .messages_container — the banner-target div
*
* @param {Object} self - The login instance (see module-level data-shape notes)
* @returns {HTMLElement} The assembled content_data div containing all login regions
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
						window.location.reload();
					}
				}
			})
			fragment.appendChild(select_lang)
			// fix
			// Store reference on self so login.action_dispatch() can hide
			// the selector after a successful login.
			self.select_lang = select_lang
		}

	// form
		const form = ui.create_dom_element({
			element_type	: 'form',
			class_name		: 'login_form',
			parent			: fragment
		})
		// Intercept the native <form> submit (Enter key press) and delegate
		// to the button_enter mousedown handler so a single code path handles
		// all submission triggers.
		// (!) button_enter is declared later in this function; the submit_handler
		// closure captures it via the shared lexical scope — it is not a TDZ
		// problem here because submit_handler is only ever called after button_enter
		// is assigned.
		const submit_handler = (e) => {
			e.preventDefault()
			// fire button enter mousedown event
			button_enter.dispatchEvent(new Event('mousedown'));
		}
		form.addEventListener('submit', submit_handler)

	// login_items
		// Ontology-resolved field descriptors. Each item: { tipo: string, label: string }.
		// Absence signals the ontology tables are unreachable (DB down, first install, etc.).
		const login_items = self.context?.properties?.login_items

	// check login_items. If there were problems with type resolution, maybe the Ontology tables are not reachable
		if (!login_items || !login_items.find(el => el.tipo==='dd255')) {

			// URL vars. Check for 'recovery' GET param
			const url_vars = url_vars_to_object()
			if (url_vars.recovery) {
				// refresh the window to force read DEDALO_MAINTENANCE_MODE in server side
				setTimeout(function(){
					// Refresh the page and bypass the cache
					location.reload();
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
		// dd255 — ontology tipo for the username field label
		const login_item_username = login_items.find(el => el.tipo==='dd255')
		const user_input = ui.create_dom_element({
			id				: 'username',
			element_type	: 'input',
			type			: 'text',
			placeholder		: strip_tags(login_item_username.label),
			parent			: form
		})
		// Hint to password managers / browser autofill to fill the username slot
		user_input.autocomplete	= 'username'

	// Authorization input
		// dd256 — ontology tipo for the password field label
		const login_item_password = login_items.find(el => el.tipo==='dd256')
		const auth_input = ui.create_dom_element({
			id				: 'auth',
			element_type	: 'input',
			type			: 'password',
			placeholder		: strip_tags(login_item_password.label),
			parent			: form
		})
		// Hint to password managers / browser autofill to fill the password slot
		auth_input.autocomplete= 'current-password'

	// development server. Value is set in environment as global var (set in server config file)
		// (!) Only rendered when DEVELOPMENT_SERVER===true (injected via PHP config).
		// Sets self.use_service_worker=false by default so developer reloads never
		// serve stale service-worker–cached assets. The checkbox re-enables it.
		if (typeof DEVELOPMENT_SERVER !== 'undefined' && DEVELOPMENT_SERVER) {

			// set self.use_service_worker as false by default
			self.use_service_worker = false;

			ui.create_dom_element({
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
	// (!) The 'dedalo_demo' entity value is only present on the public demo server.
	// On any other installation, dedalo_entity will be absent or have a different
	// value, so this block is a no-op in production.
		const dedalo_entity =  info_data.find(el => el.type === 'dedalo_entity')
		if(dedalo_entity && dedalo_entity.value === 'dedalo_demo'){
			const dedalo_demo_user = info_data.find(el => el.type === 'demo_user')
			if (dedalo_demo_user && dedalo_demo_user.value) {
				user_input.value = dedalo_demo_user.value.user || ''
				auth_input.value = dedalo_demo_user.value.pw || ''
			}
		}

	// button submit
		// dd259 — ontology tipo for the submit button label ('Enter' / translated)
		const login_item_enter = login_items.find(el => el.tipo==='dd259')
		const button_enter = ui.create_dom_element({
			element_type	: 'button',
			type			: 'submit',
			class_name		: 'button_enter warning',
			parent			: form
		})
		// button_enter_loading
		// Spinner visible only while the API call is in flight (class 'hide' toggled)
			const button_enter_loading = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'spinner button_enter_loading hide',
				parent			: button_enter
			})
		// button_enter_label
		// Ontology-resolved label; hidden while the spinner is active
			const button_enter_label = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'button_enter_label',
				inner_html		: strip_tags(login_item_enter.label || 'Enter'),
				parent			: button_enter
			})
		// event click
		// Bound to 'mousedown' (not 'click') so the handler fires before the
		// form's native 'submit' can re-trigger; the submit_handler above
		// also delegates here via dispatchEvent.
		const click_handler = async (e) => {
			e.stopPropagation()
			e.preventDefault()

			// username check
			// Minimum 2 characters — prevents accidental empty-string submissions
				const username = user_input.value
				if (username.length<2) {
					const message = `Invalid username ${username}!`
					ui.show_message(messages_container, message, 'error', 'component_message', true)
					return false
				}

			// auth check
			// Minimum 2 characters — same guard as username
				const auth = auth_input.value
				if (auth.length<2) {
					const message = `Invalid auth code!`
					ui.show_message(messages_container, message, 'error', 'component_message', true)
					return false
				}

			// check status
			// Guard against concurrent submissions: if an API call is already
			// in flight ('login' sentinel), silently return to prevent double-login.
				if (self.status==='login') {
					return
				}

			// status update
				self.status = 'login'

			// show spinner and hide button label
			// Visual feedback: replace button text with spinner and hide SAML
			// options while waiting for the API response.
				button_enter_label.classList.add('hide')
				button_enter_loading.classList.remove('hide')
				button_enter.classList.add('white')
				button_enter.blur()
				saml_container.classList.add('hide')

			// login : data_manager API call
			// Calls login.prototype.login (defined in login.js) which POSTs to
			// dd_utils_api action 'login' and returns the raw API response object.
				const api_response = await self.login({
					username	: username,
					auth		: auth
				})

				if (api_response.result===false) {

					// errors found
					// Prefer api_response.errors array; fall back to api_response.msg string;
					// final fallback to a generic message.
					const message	= api_response.errors && api_response.errors.length>0
						? api_response.errors
						: api_response.msg || ['Unknown login error happen']
					const msg_type	= 'error'
					ui.show_message(messages_container, message, msg_type, 'component_message', true)

					// hide spinner and show button label
					// Reset UI so the user can correct credentials and retry.
					button_enter_label.classList.remove('hide')
					button_enter_loading.classList.add('hide')
					button_enter.classList.remove('white')
					saml_container.classList.remove('hide')

				}else{

					// success case
					// Even on result!==false, the API may include soft errors
					// (e.g. dd_init.test warnings about dirs/vars). These do NOT
					// prevent login but pause the flow to let the user acknowledge.
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

						// Render a 'Continue' button so the user can acknowledge soft errors
						// and proceed to action_dispatch manually (instead of auto-redirecting).
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
				// Reset status so future submissions (e.g. session timeout re-login)
				// are not blocked by the 'login' sentinel.
					self.status = 'rendered'
		}
		button_enter.addEventListener('mousedown', click_handler)

	// password recovery (forgot password)
	// Self-service flow rendered alongside the login form. Three views toggled via
	// the 'hide' class (same idiom as saml_container): login → request code →
	// enter code + new password. State A/B call login.js request/confirm methods.

		// "Forgot your password?" link, shown under the login form.
		const forgot_link = ui.create_dom_element({
			element_type	: 'a',
			class_name		: 'forgot_password_link',
			inner_html		: (get_label.recover_password || 'Forgot your password?'),
			parent			: fragment
		})
		forgot_link.href = '#'

		// State A — request a recovery code by username or email.
		const reset_request_form = ui.create_dom_element({
			element_type	: 'form',
			class_name		: 'reset_request_form hide',
			parent			: fragment
		})
		// header: icon + title + short instruction
		const reset_request_header = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'reset_header',
			parent			: reset_request_form
		})
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'reset_icon lock',
			parent			: reset_request_header
		})
		ui.create_dom_element({
			element_type	: 'h3',
			class_name		: 'reset_title',
			inner_html		: (get_label.recover_password_title || 'Recover your password'),
			parent			: reset_request_header
		})
		ui.create_dom_element({
			element_type	: 'p',
			class_name		: 'reset_description',
			inner_html		: (get_label.recover_password_help || 'Enter your username or email address and we will send you an 8-digit recovery code.'),
			parent			: reset_request_header
		})
		const reset_identifier = ui.create_dom_element({
			id				: 'reset_identifier',
			element_type	: 'input',
			type			: 'text',
			placeholder		: (get_label.username_or_email || 'Username or email'),
			parent			: reset_request_form
		})
		reset_identifier.autocomplete = 'username'
		const reset_request_button = ui.create_dom_element({
			element_type	: 'button',
			type			: 'submit',
			class_name		: 'button_enter warning',
			inner_html		: (get_label.send_code || 'Send recovery code'),
			parent			: reset_request_form
		})
		const reset_request_back = ui.create_dom_element({
			element_type	: 'a',
			class_name		: 'reset_back_link',
			inner_html		: (get_label.back_to_login || 'Back to login'),
			parent			: reset_request_form
		})
		reset_request_back.href = '#'

		// State B — enter the emailed code and the new password.
		const reset_confirm_form = ui.create_dom_element({
			element_type	: 'form',
			class_name		: 'reset_confirm_form hide',
			parent			: fragment
		})
		// header: icon + title + short instruction
		const reset_confirm_header = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'reset_header',
			parent			: reset_confirm_form
		})
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'reset_icon email',
			parent			: reset_confirm_header
		})
		ui.create_dom_element({
			element_type	: 'h3',
			class_name		: 'reset_title',
			inner_html		: (get_label.recovery_code_title || 'Check your email'),
			parent			: reset_confirm_header
		})
		ui.create_dom_element({
			element_type	: 'p',
			class_name		: 'reset_description',
			inner_html		: (get_label.recovery_code_help || 'We sent an 8-digit code to your email. Enter it below with your new password.'),
			parent			: reset_confirm_header
		})
		const reset_code = ui.create_dom_element({
			id				: 'reset_code',
			element_type	: 'input',
			type			: 'text',
			class_name		: 'reset_code_input',
			placeholder		: (get_label.recovery_code || '••••••••'),
			parent			: reset_confirm_form
		})
		reset_code.setAttribute('inputmode', 'numeric')
		reset_code.setAttribute('maxlength', '8')
		reset_code.autocomplete = 'one-time-code'
		const reset_new_password = ui.create_dom_element({
			id				: 'reset_new_password',
			element_type	: 'input',
			type			: 'password',
			placeholder		: (get_label.new_password || 'New password'),
			parent			: reset_confirm_form
		})
		reset_new_password.autocomplete = 'new-password'
		const reset_new_password_confirm = ui.create_dom_element({
			id				: 'reset_new_password_confirm',
			element_type	: 'input',
			type			: 'password',
			placeholder		: (get_label.repeat_password || 'Repeat new password'),
			parent			: reset_confirm_form
		})
		reset_new_password_confirm.autocomplete = 'new-password'
		const reset_confirm_button = ui.create_dom_element({
			element_type	: 'button',
			type			: 'submit',
			class_name		: 'button_enter warning',
			inner_html		: (get_label.reset_password || 'Reset password'),
			parent			: reset_confirm_form
		})
		const reset_confirm_back = ui.create_dom_element({
			element_type	: 'a',
			class_name		: 'reset_back_link',
			inner_html		: (get_label.back_to_login || 'Back to login'),
			parent			: reset_confirm_form
		})
		reset_confirm_back.href = '#'

		// view toggles. saml_container / messages_container are declared later in
		// this function; these closures only run post-render so the references are safe.
		const show_login_view = () => {
			form.classList.remove('hide')
			forgot_link.classList.remove('hide')
			if (self.saml) { saml_container.classList.remove('hide') }
			reset_request_form.classList.add('hide')
			reset_confirm_form.classList.add('hide')
		}
		const show_request_view = () => {
			form.classList.add('hide')
			forgot_link.classList.add('hide')
			saml_container.classList.add('hide')
			reset_confirm_form.classList.add('hide')
			reset_request_form.classList.remove('hide')
			reset_identifier.focus()
		}
		const show_confirm_view = () => {
			reset_request_form.classList.add('hide')
			reset_confirm_form.classList.remove('hide')
			reset_code.focus()
		}

		// open / back links
		forgot_link.addEventListener('click', (e) => {
			e.preventDefault()
			show_request_view()
		})
		reset_request_back.addEventListener('click', (e) => {
			e.preventDefault()
			show_login_view()
		})
		reset_confirm_back.addEventListener('click', (e) => {
			e.preventDefault()
			show_login_view()
		})

		// State A submit — request the code
		const reset_request_handler = async (e) => {
			e.preventDefault()
			e.stopPropagation()

			const identifier = reset_identifier.value.trim()
			if (identifier.length<2) {
				ui.show_message(messages_container, 'Please enter your username or email', 'error', 'component_message', true)
				return false
			}
			if (self.status==='reset') {
				return
			}
			self.status = 'reset'
			reset_request_button.classList.add('white')

			const api_response = await self.request_password_reset({ identifier })

			self.status = 'rendered'
			reset_request_button.classList.remove('white')

			// store the opaque reset_id for State B (response is always generic)
			self.reset_id = (api_response && api_response.reset_id) ? api_response.reset_id : null
			ui.show_message(
				messages_container,
				(api_response && api_response.msg) || 'If an account matches, a recovery code has been sent.',
				'ok',
				'component_message',
				true
			)
			show_confirm_view()
		}
		reset_request_form.addEventListener('submit', reset_request_handler)

		// State B submit — confirm the code + set new password
		const reset_confirm_handler = async (e) => {
			e.preventDefault()
			e.stopPropagation()

			const code					= reset_code.value.trim()
			const new_password			= reset_new_password.value
			const new_password_confirm	= reset_new_password_confirm.value

			if (!/^\d{8}$/.test(code)) {
				ui.show_message(messages_container, 'Enter the 8-digit recovery code', 'error', 'component_message', true)
				return false
			}
			if (new_password.length<8) {
				ui.show_message(messages_container, 'Password too short. Use at least 8 characters', 'error', 'component_message', true)
				return false
			}
			if (new_password!==new_password_confirm) {
				ui.show_message(messages_container, 'Passwords do not match', 'error', 'component_message', true)
				return false
			}
			if (!self.reset_id) {
				ui.show_message(messages_container, 'Please request a recovery code first', 'error', 'component_message', true)
				show_request_view()
				return false
			}
			if (self.status==='reset') {
				return
			}
			self.status = 'reset'
			reset_confirm_button.classList.add('white')

			const api_response = await self.confirm_password_reset({
				reset_id		: self.reset_id,
				code			: code,
				new_password	: new_password
			})

			self.status = 'rendered'
			reset_confirm_button.classList.remove('white')

			if (api_response && api_response.result===true) {
				ui.show_message(messages_container, api_response.msg || 'Your password has been updated. You can now log in.', 'ok', 'component_message', true)
				// clear sensitive fields and return to login
				reset_code.value					= ''
				reset_new_password.value			= ''
				reset_new_password_confirm.value	= ''
				self.reset_id						= null
				show_login_view()
			} else {
				const message = (api_response && api_response.errors && api_response.errors.length>0)
					? api_response.errors
					: (api_response && api_response.msg) || 'Invalid or expired code'
				ui.show_message(messages_container, message, 'error', 'component_message', true)
				// on lockout, force a fresh request
				if (api_response && api_response.errors && api_response.errors.indexOf('too_many_attempts')!==-1) {
					self.reset_id = null
					show_request_view()
				}
			}
		}
		reset_confirm_form.addEventListener('submit', reset_confirm_handler)

	// info
		// Append the detected browser name + version to the server-supplied info_data
		// array so it is displayed alongside the Dédalo and DB version entries.
		// This is done client-side because the server cannot know the UA at context-
		// build time.
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
		// Apply type-specific display logic: 'data_version' gets outdated detection
		// and auto-redirect; other array values are joined for HTML rendering.
				let class_name	= ''
				let value		= item.value
				switch(item.type){
					case 'data_version': {
						// item.value is a semver array e.g. [6, 2, 1]. Major version
						// below 6 means the database is on the pre-v7 schema.
						const is_outdated = item.value[0]<6
						if (is_outdated) {
							class_name	= 'error'
							value		= item.value.join('.') + ' - Outdated!'
							// if version is outdated, jump to area development to update
							// dd88 is the ontology tipo for the maintenance/development area
							const area_maintenance_tipo = 'dd88'
							// Guard: only redirect if not already on the maintenance area URL
							// to prevent an infinite redirect loop.
							if (window.location.search.indexOf(area_maintenance_tipo)===-1) {
								const base_url = window.location.origin + window.location.pathname
								const target_url = base_url + '?t=' + area_maintenance_tipo
								window.location.replace(target_url)
							}
						}
						break;
					}
					default:
						// Array values (e.g. list of warnings) are joined with <br>
						// so they render as separate lines inside the info panel span.
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
	// Container starts hidden; revealed asynchronously when saml.render()
	// resolves successfully. The click_handler hides it again during login.
		const saml_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'saml_container hide',
			parent			: fragment
		})
		// saml render
		// self.saml is built by login.build() when context.properties.saml_config
		// is present. The .then() pattern is intentional: the SAML node loads
		// asynchronously so it does not block the rest of the login UI.
		if (self.saml) {
			self.saml.render()
			.then(function(saml_wrapper){
				saml_container.appendChild(saml_wrapper)
				saml_container.classList.remove('hide')
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
		link.rel    = 'noopener noreferrer' // SEC-033

	// messages_container
	const messages_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'messages_container',
			parent			: fragment
		})

	// content_data
	// Wrap the assembled fragment. Explicit DOM pointers are set as properties
	// so login.action_dispatch() and render_relogin() can reach individual
	// regions without querying the DOM (no querySelector needed post-render).
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
* Parses the current browser name and major version from navigator.userAgent.
*
* Uses a series of regex matches to distinguish between Chrome, Opera/OPR,
* Edge, Trident (IE), Safari, and Firefox. The detection logic follows a
* well-known UA-sniffing pattern: Chrome UA strings contain 'Chrome' but
* Opera/Edge UA strings also contain 'Chrome', so OPR/Edge detection runs
* first inside the Chrome branch.
*
* Note: UA sniffing is inherently fragile. Dédalo uses this only for the
* minimum-version gate in validate_browser() and for the info panel display;
* it is not used for capability detection.
*
* @returns {Object} Browser descriptor
* @returns {string} .name    - Browser name e.g. 'Chrome', 'Firefox', 'Safari',
*                              'Opera', 'IE'
* @returns {string} .version - Major version string e.g. '106'
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
* Checks the detected browser version against Dédalo's minimum requirements
* and shows a blocking alert() when the browser is too old or unrecognised.
*
* Minimum supported versions (as of this file):
*  - Chrome:      100
*  - Firefox:     100
*  - AppleWebKit: 14  (Safari engine major version)
*
* Any browser not matching one of those UA strings falls into the default case
* and receives a generic "browser not verified" alert.
*
* (!) Uses alert() for user notification. This is intentional — the login page
* has no toast/message UI until the form has rendered, and the severity of an
* unsupported browser warrants a blocking modal. Do not silently swallow this.
*
* Side effects: may call alert() and returns false on version mismatch.
*
* @returns {boolean} true when the browser meets the minimum requirements (or
*          when no version mismatch was detected); false when an outdated version
*          was found and the user was warned
*/
const validate_browser = function() {

	const browser_info = get_browser_info()
	const min_version  = {
		Chrome		: 100,
		Firefox		: 100,
		AppleWebKit	: 14
	}

	// function msg
	// Builds the localised warning string displayed in the alert() call
	const msg = (browser, version, min_version) => {
		return `Sorry, your browser ${browser} version is too old (${version}). \nPlease update your ${browser} version to ${min_version} or newer.`
	}

	try {
	   // Browser warning
	   // switch(true) pattern lets each case be an arbitrary boolean expression;
	   // UA string order matters — 'Chrome' must be checked before 'AppleWebKit'
	   // because Chrome UA strings contain both substrings.
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
				// Unknown / unverified browser — alert and let the user continue
				// at their own risk (no hard block beyond the modal).
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
* Creates the files-loader widget: a circular SVG progress indicator with
* a percentage data attribute and a status label.
*
* Called by login.action_dispatch() immediately after a successful server-side
* authentication, before the service worker or worker_cache starts loading the
* Dédalo JS/CSS asset bundle. The returned container is injected into
* content_data.top (which is hidden until the 'ready' worker message fires).
*
* The progress circle uses CSS stroke-dashoffset animation:
*  - stroke-dasharray is set to the full circumference (2πr ≈ 565.49 px).
*  - stroke-dashoffset is reduced proportionally as the percentage increases.
*  - CSS handles the smooth transition; the JS only updates the offset value.
*
* The exposed `update(data)` method is called by the worker message handler
* on each 'loading' event. It accumulates the per-file increment (100 /
* total_files) and schedules a requestAnimationFrame to avoid redundant DOM
* writes within a single frame.
*
* Data shape expected by cont.update(data):
*  { status: 'loading'|string, total_files: number }
*
* @see login.action_dispatch — wires worker messages to cont.update()
* @returns {HTMLElement} The `.cont.files_loader` div with an `update(data)`
*          method attached directly on the element
*/
export const render_files_loader = function() {

	const SVG_NS	= 'http://www.w3.org/2000/svg';
	const RADIUS	= 90;
	const CST		= Math.PI * (RADIUS * 2); // circumference ≈ 565.49

	// cont
		const cont = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'cont files_loader',
			dataset			: {
				pct : 'Loading..'
			}
		})

	// svg circle — built with createElementNS to avoid DOMParser overhead
	// and silent XML parse-error risk
		const svg = document.createElementNS(SVG_NS, 'svg');
		svg.setAttribute('width', '200');
		svg.setAttribute('height', '200');
		svg.setAttribute('viewBox', '0 0 200 200');

		const circle_attrs = {
			r	: String(RADIUS),
			cx	: '100',
			cy	: '100',
			fill				: 'transparent',
			'stroke-dasharray'	: String(CST),
			'stroke-dashoffset'	: '0'
		};

		// background circle
		const bg_circle = document.createElementNS(SVG_NS, 'circle');
		for (const [k, v] of Object.entries(circle_attrs)) {
			bg_circle.setAttribute(k, v);
		}
		svg.appendChild(bg_circle);

		// progress bar circle
		const bar_circle = document.createElementNS(SVG_NS, 'circle');
		for (const [k, v] of Object.entries(circle_attrs)) {
			bar_circle.setAttribute(k, v);
		}
		bar_circle.classList.add('bar', 'hide');
		svg.appendChild(bar_circle);

		cont.appendChild(svg);

	// bar_circle animation
	// animate_circle updates the SVG stroke-dashoffset and the percentage label.
	// bar_revealed ensures the bar element stays hidden (via class 'hide') until
	// the first non-zero value arrives, so there is no visual flash at 0 %.
		let bar_revealed = false
		let current_val = null
		const animate_circle = (value) => {

			// reveal bar on first positive value
			if (!bar_revealed && value > 0) {
				bar_circle.classList.remove('hide')
				bar_revealed = true
			}

			const val = Math.min(Math.round(value), 100)

			// skip DOM updates if percentage hasn't changed
			// (prevents unnecessary repaints when two rapid rAF calls resolve to the same integer)
			if (val === current_val) return

			// stroke-dashoffset at 100 % = 0 (full circle drawn);
			// at 0 % = CST (circle fully hidden by the gap).
			const offset = ((100 - val) / 100) * CST

			// change circle stroke offset
			bar_circle.style.strokeDashoffset = offset

			// updates number as 50%
			// CSS ::before/::after reads data-pct to render the percentage label
			cont.dataset.pct = val + '%'

			current_val = val
		}

	// update. receive worker messages data
	// This method is called on each worker 'loading' message by the handler
	// in login.action_dispatch(). Each call represents one file completing load.
		let loaded = 0
		let raf_id = null
		cont.update = function( data ) {

			const total_files	= data.total_files
			// Increment is 100/total_files per file; non-'loading' statuses
			// contribute 0 so the counter does not advance spuriously.
			const rate			= data.status==='loading'
				? 100 / total_files
				: 0

			// update loaded (clamp to 100)
			loaded = Math.min(rate + loaded, 100)

			// animate - prevent rAF queuing
			// Cancel any pending frame before scheduling a new one to coalesce
			// rapid successive calls into a single paint.
			if (raf_id) cancelAnimationFrame(raf_id)
			raf_id = requestAnimationFrame(() => {
				animate_circle(loaded)
			})
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
* Creates a full-screen overlay login form inside an already-running Dédalo
* page session and appends it to document.body.
*
* Used when the PHP session has expired (or been invalidated) mid-session
* and a subsequent API call returns an authentication error. Rather than
* redirecting the user to the login page and losing unsaved state, this
* function injects a login overlay so the user can re-authenticate in place.
*
* @see component_common.save() — primary caller; detects auth failure and
*      calls render_relogin() so the pending save can be retried after login.
*
* Lifecycle of the overlay:
*  1. The page's main container receives class 'loading' (dims the UI).
*  2. A fresh login instance is created via get_instance() with:
*     - add_select_lang: false (no language switcher in the overlay)
*     - custom_action_dispatch: destroys the overlay and unlocks the page
*       after successful re-authentication, then calls on_success if provided.
*  3. build(true) loads the login context from the server (autoload mode).
*  4. render() produces the login_node. The '.overlay' class is added to
*     content_data so CSS positions it over the existing page content.
*  5. The '.powered_by' footer is hidden — it is redundant in overlay context.
*  6. The node is appended to document.body and the instance is returned.
*
* @param {Object} [options={}] - Configuration options
* @param {Function|null} [options.on_success=null] - Callback fired after
*        successful re-authentication. Receives the login instance as its
*        first argument. Use to retry the operation that triggered the error.
* @param {HTMLElement|null} [options.main_container=null] - The container to
*        lock with class 'loading' while the overlay is active. Defaults to
*        the first '.wrapper.page' element in the document.
* @returns {Promise<Object>} The login instance (already built and rendered)
*/
export const render_relogin = async function(options={}) {

	// options
		const on_success		= options.on_success || null
		const main_container	= options.main_container || document.querySelector('.wrapper.page')

	// lock main container (normally page)
	// Adding 'loading' typically applies a CSS overlay/dim via the page stylesheet.
		if (main_container) {
			main_container.classList.add('loading')
		}

	// login_instance
	// dd229 is the ontology tipo for the login section/component.
	// autoload=false is the default for login; build(true) is passed here
	// because the re-login overlay must fetch its own context from the server.
		const login_instance = await get_instance({
			model					: 'login',
			tipo					: 'dd229',
			mode					: 'edit',
			add_select_lang			: false,
			custom_action_dispatch	: function() {

				// work done! Destroy this login instance and DOM
				login_instance.destroy(true, true, true)

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
		await login_instance.build(true)
		const login_node = await login_instance.render()
		// 'overlay' class positions the login form over the dimmed page content
		login_node.content_data.classList.add('overlay')

		// powered_by
		// Hide the Dédalo branding footer — it is redundant in the overlay context
		// since the main page already identifies the application.
		login_node.querySelector('.powered_by').classList.add('hide')

	// add to DOM
		document.body.appendChild(login_node)


	return login_instance
}//end render_relogin



// @license-end
