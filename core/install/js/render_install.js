// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG*/
/*eslint no-undef: "error"*/



// imports
	import {data_manager} from '../../common/js/data_manager.js'
	import {when_in_viewport} from '../../common/js/events.js'
	import {ui} from '../../common/js/ui.js'
	import {component_password} from '../../component_password/js/component_password.js'
	import {get_instance} from '../../common/js/instances.js'



/**
* RENDER_LOGIN
* Manages the component's logic and appearance in client side
*/
export const render_install = function() {

	return true
}//end render_install



/**
* RENDER
* Render node for use in install mode
* @param object options
* @return HTMLElement wrapper
*/
render_install.prototype.render = async function(options) {

	const self = this

	// options
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = get_content_data(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_edit returns wrapper
		const wrapper = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'wrapper install'
		})
		wrapper.appendChild(content_data)
		// set pointers
		wrapper.content_data = content_data

	return wrapper
}//end render



/**
* GET_CONTENT_DATA
* @param instance self
* @return HTMLElement content_data
*/
const get_content_data = function(self) {

	// add_hidden_block
		const add_hidden_block = (name) => {
			return ' hide'
		}

	// content_data
		const content_data = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_data'
		})

	// help block
		const help_block = ui.create_dom_element({
			element_type	: 'section',
			class_name		: 'help_block',
			parent			: content_data
		})
		// set pointers
		content_data.help_block = help_block
		// title
		ui.create_dom_element({
			element_type	: 'h1',
			inner_html		: get_label.installation_help || 'Installation help',
			parent			: help_block
		})
		// content
		const help_block_content = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content',
			parent			: help_block
		})
		help_block_content.appendChild(
			render_help_block(self)
		)

	// init_test_block
		const init_test_block = ui.create_dom_element({
			element_type	: 'section',
			class_name		: 'init_test_block',
			parent			: content_data
		})
		// set pointers
		content_data.init_test_block = init_test_block
		// title
		ui.create_dom_element({
			element_type	: 'h1',
			inner_html		: get_label.init_text || 'Init test',
			parent			: init_test_block
		})
		// content
		const init_test_block_content = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content',
			parent			: init_test_block
		})
		init_test_block_content.appendChild(
			render_init_test_block(self)
		)

	// config block
		const config_block = ui.create_dom_element({
			element_type	: 'section',
			class_name		: 'config_block' + add_hidden_block('config_block'),
			parent			: content_data
		})
		// set pointers
		content_data.config_block = config_block
		// title
		ui.create_dom_element({
			element_type	: 'h1',
			inner_html		: get_label.installation_config_test || 'Configuration',
			parent			: config_block
		})
		// content
		const config_block_status = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content',
			parent			: config_block
		})
		config_block_status.appendChild(
			render_config_block(self)
		)
		content_data.config_block.config_block_status = config_block_status

		// content
		const config_block_options = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content',
			parent			: config_block
		})
		config_block_options.appendChild(
			render_config_options(self)
		)
		content_data.config_block.config_block_options = config_block_options

	// install_db_block
		const install_db_block = ui.create_dom_element({
			element_type	: 'section',
			class_name		: 'install_db_block' + add_hidden_block('install_db_block'),
			parent			: content_data
		})
		// set pointers
		content_data.install_db_block = install_db_block
		// title
		ui.create_dom_element({
			element_type	: 'h1',
			inner_html		: get_label.install_db_label || '1. Install Dédalo DDBB',
			parent			: install_db_block
		})
		// content
		const install_db_block_content = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content',
			parent			: install_db_block
		})
		install_db_block_content.appendChild(
			render_install_db_block(self)
		)

	// set_root_password_block
		const set_root_password_block = ui.create_dom_element({
			element_type	: 'section',
			class_name		: 'set_root_password_block' + add_hidden_block('set_root_password_block'),
			parent			: content_data
		})
		// set pointers
		content_data.set_root_password_block = set_root_password_block
		// title
		ui.create_dom_element({
			element_type	: 'h1',
			inner_html		: get_label.set_root_pw_label || '2. Set root password',
			parent			: set_root_password_block
		})
		// content
		const set_root_password_block_content = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content',
			parent			: set_root_password_block
		})
		set_root_password_block_content.appendChild(
			render_set_root_password_block(self)
		)

	// login_block
		const login_block = ui.create_dom_element({
			element_type	: 'section',
			class_name		: 'login_block' + add_hidden_block('login_block'),
			parent			: content_data
		})
		// set pointers
		content_data.login_block = login_block
		// title
		ui.create_dom_element({
			element_type	: 'h1',
			inner_html		: get_label.set_root_pw_label || '3. Login',
			parent			: login_block
		})
		// content
		const login_block_content = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content',
			parent			: login_block
		})
		render_login_block(self)
		.then(function(response){
			login_block_content.appendChild(response)
		})

	// hierarchies_import_block
		const hierarchies_import_block = ui.create_dom_element({
			element_type	: 'section',
			class_name		: 'hierarchies_import_block' + add_hidden_block('hierarchies_import_block'),
			parent			: content_data
		})
		// set pointers
		content_data.hierarchies_import_block = hierarchies_import_block
		// title
		ui.create_dom_element({
			element_type	: 'h1',
			inner_html		: get_label.import_hierarchies_label || '4. Install/activate selected hierarchies',
			parent			: hierarchies_import_block
		})
		// content
		const hierarchies_import_block_content = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content',
			parent			: hierarchies_import_block
		})

		const hierarchies_import_options = {
			hierarchies				: self.context.properties.hierarchies,
			default_checked			: self.context.properties.install_checked_default,
			hierarchy_typologies	: self.context.properties.hierarchy_typologies,
			callback		: function() {
				// show next block
				self.node.content_data.install_finish_block.classList.remove('hide')
			}
		}
		hierarchies_import_block_content.appendChild(
			render_hierarchies_import_block(hierarchies_import_options)
		)

	// install_finish_block
		const install_finish_block = ui.create_dom_element({
			element_type	: 'section',
			class_name		: 'install_finish_block' + add_hidden_block('install_finish_block'),
			parent			: content_data
		})
		// set pointers
		content_data.install_finish_block = install_finish_block
		// title
		ui.create_dom_element({
			element_type	: 'h1',
			inner_html		: get_label.install_done || '5. Done!',
			parent			: install_finish_block
		})
		// content
		const install_finish_block_content = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content',
			parent			: install_finish_block
		})
		install_finish_block_content.appendChild(
			render_install_finish_block(self)
		)


	return content_data
}//end get_content_data



/**
* RENDER_HELP_BLOCK
* Creates contents nodes for current block
* @param object self
* @return DOM DocumentFragment
*/
const render_help_block = function(self) {

	const fragment = new DocumentFragment()

	// installation info
		const install_info_node = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'description install_info_node',
			inner_html		: get_label.installation_help_info || 'Installation info: ',
			parent			: fragment
		})
		ui.create_dom_element({
			element_type	: 'img',
			class_name		: 'info icon',
			src				: 'https://dedalo.dev/tpl/assets/img/logos/logo_dedalo.svg',
			parent			: install_info_node
		})
		// link
		const link_install = ui.create_dom_element({
			element_type	: 'a',
			class_name		: 'link',
			href			: 'https://dedalo.dev/docs/install/install/',
			inner_html		: 'https://dedalo.dev/docs/install/install/',
			parent			: install_info_node
		})
		link_install.target	= '_blank'
		// link_install.rel	= 'noopener noreferrer'

	// installation config
		const install_config_node = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'description install_config_node',
			inner_html		: get_label.installation_config || 'Installation config: ',
			parent			: fragment
		})
		ui.create_dom_element({
			element_type	: 'img',
			class_name		: 'info icon',
			src				: 'https://dedalo.dev/tpl/assets/img/logos/logo_dedalo.svg',
			parent			: install_config_node
		})
		const link_configuration = ui.create_dom_element({
			element_type	: 'a',
			class_name		: 'link',
			href			: 'https://dedalo.dev/docs/config/configuration/',
			inner_html		: 'https://dedalo.dev/docs/config/configuration/',
			target			: '_blank',
			parent			: install_config_node
		})
		link_configuration.target	= '_blank'


	return fragment
}//end render_help_block



/**
* RENDER_INIT_TEST_BLOCK
* Creates contents nodes for current block
* @param object self
* @return HTMLElement
*/
const render_init_test_block = function(self) {

	// short vars
		const properties	= self.context.properties
		const init_test		= properties.init_test || null

	const fragment = new DocumentFragment()

	// fail init_test case
		if (!init_test || init_test.result===false) {
			const msg = init_test && init_test.msg
				? init_test.msg.join('<br>')
				: 'Init test fails (unknown server error)'
			ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'msg error',
				inner_html		: msg,
				parent			: fragment
			})

			return fragment
		}//end if (!db_status)

	// config is OK message
		const msg = init_test.msg
			? init_test.msg.join('<br>')
			: 'Init test test passed!'
		const add_css = init_test.errors===true
			? 'warning'
			: 'ok'
		const msg_node = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'msg ' + add_css,
			inner_html		: msg,
			parent			: fragment
		})

	when_in_viewport(
		msg_node,
		() => {
			self.node.content_data.config_block.classList.remove('hide')
		}
	)


	return fragment;
}//end render_init_test_block



/**
* RENDER_CONFIG_BLOCK
* Creates contents nodes for current block
* @param object self
* @return HTMLElement
*/
const render_config_block = function(self) {

	// short vars
		const properties	= self.context.properties
		const db_status		= properties.db_status || null

	const fragment = new DocumentFragment()

	// fail db_status case
		if (!db_status) {
			// if the db_status is not set the installation process can not be start
			// some error was happen in the server.
			ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'msg error',
				inner_html		: get_label.failed_install_context || 'Server has failed to get context for db status',
				parent			: fragment
			})

			return fragment
		}//end if (!db_status)

	// fail global_status case
		if (db_status.global_status===false) {

			// warning errors message
				ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'msg error',
					inner_html		: get_label.config_has_errors || 'Configuration test contains errors!',
					parent			: fragment
				})

			// errors
				const db_status_container = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'container_errors',
					parent			: fragment
				})

			// db config_check (global)
				const db_config_check_label = db_status.config_check
					? get_label.db_config_check_ok || 'Database: db config ok'
					: get_label.db_config_check_invalid || 'Database: db config invalid!'
				const db_config_check_class = db_status.config_check
					? 'ok'
					: 'error'
				const db_config_check_node = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'msg ' + db_config_check_class,
					inner_html		: db_config_check_label,
					parent			: db_status_container
				})

			// config db name
				const db_name_label = db_status.config_db_name_check
					? get_label.db_name_ok || 'Database: db name config ok'
					: get_label.db_name_invalid || 'Database: db name config invalid!'
				const db_name_class = db_status.config_db_name_check
					? 'ok'
					: 'error'
				const db_name_check = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'msg ' + db_name_class,
					inner_html		: db_name_label,
					parent			: db_config_check_node
				})

			// config user_name_check
				const user_name_label = db_status.config_user_name_check
					? get_label.db_username_ok || 'Database: username config ok'
					: get_label.db_username_invalid || 'Database: username config invalid!'
				const db_username_class = db_status.config_user_name_check
					? 'ok'
					: 'error'
				const db_username_check = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'msg ' + db_username_class,
					inner_html		: user_name_label,
					parent			: db_config_check_node
				})

			// config pw_check
				const pw_label = db_status.config_pw_check
					? get_label.db_pw_ok || 'Database: pw config ok'
					: get_label.db_pw_invalid || 'Database: pw config invalid!'
				const db_pw_class = db_status.config_pw_check
					? 'ok'
					: 'error'
				const db_pw_check = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'msg ' + db_pw_class,
					inner_html		: pw_label,
					parent			: db_config_check_node
				})
			// config information_check
				const information_label = db_status.config_information_check
					? get_label.db_information_ok || 'Database: information config ok'
					: get_label.db_information_invalid || 'Database: information config invalid!'
				const db_information_class = db_status.config_information_check
					? 'ok'
					: 'error'
				const db_information_check = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'msg ' + db_information_class,
					inner_html		: information_label,
					parent			: db_config_check_node
				})
			// config info_key_check
				const info_key_label = db_status.config_info_key_check
					? get_label.db_info_key_ok || 'Database: information key config ok'
					: get_label.db_info_key_invalid || 'Database: information key config invalid!'
				const db_info_key_class = db_status.config_info_key_check
					? 'ok'
					: 'error'
				const db_info_key_check = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'msg ' + db_info_key_class,
					inner_html		: info_key_label,
					parent			: db_config_check_node
				})

			// db connection_check
				const db_connection_check_label = db_status.db_connection_check
					? get_label.db_connection_check_ok || 'Database: db connection ok'
					: get_label.db_connection_check_invalid || 'Database: db connection invalid!'
				const db_connection_check_class = db_status.db_connection_check
					? 'ok'
					: 'error'
				// db_connection_check_node
				ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'msg ' + db_connection_check_class,
					inner_html		: db_connection_check_label,
					parent			: fragment
				})

			return fragment
		}//end if (db_status.global_status===false)

	// config is OK message
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'msg ' + 'ok',
			inner_html		: get_label.config_has_passed || 'Configuration test passed!',
			parent			: fragment
		})
	return fragment;
}//end render_config_block



/**
* RENDER_CONFIG_OPTIONS
* Creates contents nodes with options of install
* @param object self
* @return HTMLElement
*/
const render_config_options = function(self) {

	const fragment = new DocumentFragment()

	// install_db_button
		const install_button = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'primary install_button',
			inner_html		: get_label.to_install || 'To install',
			parent			: fragment
		})
		install_button.addEventListener('mouseup', async function() {
			// show the install_db
			self.node.content_data.install_db_block.classList.remove('hide')
			self.node.content_data.config_block.config_block_options.remove();
		})//end mouse_up event

	// db_data_version. Update option
		const db_data_version = (self.context.properties && self.context.properties.db_data_version)
			? self.context.properties.db_data_version
			: null
		if (db_data_version && db_data_version[0] && parseInt(db_data_version[0])<6) {

			const update_button = ui.create_dom_element({
				element_type	: 'button',
				class_name		: 'primary update_button',
				inner_html		: get_label.to_update || 'To update',
				parent			: fragment
			})
			update_button.addEventListener('mouseup', async function() {

				// lock button
					update_button.classList.add('loading')

				// remove other options
					install_button.remove()

				// add spinner
				const spinner = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'spinner',
					parent			: to_update_status
				})

				// data_manager API call
					const api_response = await data_manager.request({
						body : {
							action	: 'install',
							dd_api	: 'dd_utils_api',
							options	: {
								action : 'to_update'
							}
						}
					})

				// manage result
					if (api_response.result===false) {

						// fail case

						console.error("to_update api_response:", api_response);

					}else{

						// all is OK case

						console.log("to_update api_response:", api_response);

						let counter = 5;
						const interval = setInterval(() => {
							to_update_status.innerHTML = 'Initializing in ' + counter
							counter--;
							if (counter < 0 ) {
								spinner.remove()
								clearInterval(interval);
								location.reload()
							}
						}, 1000);

						update_button.remove()
					}

				// unlock button
					self.node.content_data.config_block.config_block_options.remove();
			})//end mouse_up event

			const to_update_status = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'msg',
				parent			: fragment
			})
		}

	// to reset root pw
		const reset_root_button = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'primary install_button',
			inner_html		: get_label.to_change_pw || 'To change root',
			parent			: fragment
		})
		reset_root_button.addEventListener('mouseup', async function() {
			// show the install_db
			self.node.content_data.set_root_password_block.classList.remove('hide')
			self.node.content_data.config_block.config_block_options.remove();
		})//end mouse_up event


	return fragment;
}//end render_config_options



/**
* RENDER_INSTALL_DB_BLOCK
* Creates contents nodes for current block
* @param object self
* @return DOM DocumentFragment
*/
const render_install_db_block = function(self) {

	// short vars
		const properties = self.context.properties

	const fragment = new DocumentFragment()

	// check if the file exists in the correct path
		if (!properties.target_file_path_exists) {
			ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'msg error',
				inner_html		: get_label.installation_db_error_file_path || 'Database file not found! Please verify that the installation file exists in: '+ properties.target_file_path,
				parent			: fragment
			})

			return fragment
		}

	// target_file_path
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'description',
			inner_html		: get_label.installation_db || 'Install DDBB source file: '+ properties.target_file_path,
			parent			: fragment
		})

	// db_config properties
		const db_config_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'db_config_container',
			parent			: fragment
		})
		for(const config_item in properties.db_config){
			ui.create_dom_element({
				element_type 	: 'div',
				class_name		: 'db_config key',
				inner_html		: config_item,
				parent			: db_config_container
			})
			ui.create_dom_element({
				element_type 	: 'div',
				class_name		: 'db_config value',
				inner_html		: properties.db_config[config_item],
				parent			: db_config_container
			})
		}

	// install_db_button
		const install_db_button = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'primary install_db_button',
			inner_html		: get_label.installation_from_file || 'INSTALL DATABASE FROM FILE',
			parent			: fragment
		})
		install_db_button.addEventListener('mouseup', async function() {

			// lock button
				install_db_button.classList.add('loading')

			// reset messages
				install_db_status.classList.remove('ok')
				install_db_status.classList.remove('error')
				install_db_status.innerHTML = ''

			// add spinner
				const spinner = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'spinner',
					parent			: install_db_status
				})

			// data_manager API call
				const api_response = await data_manager.request({
					body : {
						action	: 'install',
						dd_api	: 'dd_utils_api',
						options	: {
							action : 'install_db_from_default_file'
						}
					}
				})
				// manage result
				if (api_response.result===true) {

					// all is OK case

					console.log('DBB installed:', api_response);

					install_db_status.classList.add('ok')
					install_db_status.innerHTML = api_response.msg

					// show set_root_password_block
					self.node.content_data.set_root_password_block.classList.remove('hide')

					install_db_button.remove();

				}else{

					// fail case

					console.error(api_response.msg);

					install_db_status.classList.add('error')
					install_db_status.innerHTML = api_response.msg
				}

			// unlock button
				install_db_button.classList.remove('loading')
				spinner.remove()
		})//end mouse_up event


	// install_db_status msg
		const install_db_status = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'msg',
			parent			: fragment
		})

	return fragment
}//end render_install_db_block



/**
* RENDER_SET_ROOT_PASSWORD_BLOCK
* @param object self
* @return HTMLElement content_value
*/
const render_set_root_password_block = function(self) {

	const fragment = new DocumentFragment()

	// password_validation_options
		const password_validation_options = {
			lower				: 1,
			upper				: 1,
			alpha				: 0, /* lower + upper */
			numeric				: 1,
			special				: 0,
			length				: [8, 32],
			custom				: [ /* regexes and/or functions  (?=.*\d)(?=.*[a-z])(?=.*[A-Z])\w{6,} */ ],
			badWords			: ['password','contraseña','clave','Mynew2Pass5K','dios','micontraseña'],
			badSequenceLength	: 4,
			noQwertySequences	: false,
			noSequential		: true
		}

	// description
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'description',
			inner_html		: get_label.type_root_password || `Type and retype your desired superuser password and keep it in a safe place.
							  Use a strong password from 8 to 32 characters containing, at least, an upper-case letter, a lower-case
							  letter, and a number. Identical characters in sequential order are not allowed ('aa', '11', 'BB', etc.).
							  Numerical ('123', '345', etc.) nor alphabetical ('aBC', 'hIjK', etc.) order are allowed.`,
			parent			: fragment
		})

	// input_new_pw field
		const input_new_pw = ui.create_dom_element({
			element_type	: 'input',
			type			: 'password',
			class_name		: 'password_value',
			value			: '', // default value
			placeholder		: get_label.password || 'Password',
			parent			: fragment
		})
		input_new_pw.autocomplete = 'new-password'
		input_new_pw.addEventListener('keyup', function(e) {
			e.preventDefault()

			// validated. Test password is acceptable string
				const validated_obj = component_password.prototype.validate_password_format(
					input_new_pw.value,
					password_validation_options
				)

			// message
				set_message(
					validated_obj,
					input_new_pw
				)
		})
		input_new_pw.addEventListener('change', function(e) {
			e.preventDefault()

			// validated. Test password is acceptable string
				const validated_obj = component_password.prototype.validate_password_format(
					input_new_pw.value,
					password_validation_options
				)

			// message
				set_message(
					validated_obj,
					input_new_pw
				)
		})

		function set_message(validated_obj, input_node) {

			// message reset
				set_pw_status.classList.remove('ok')
				set_pw_status.classList.remove('error')
				set_pw_status.innerHTML = ''

			if (validated_obj.result===false) {
				// decorate input_node as valid (green)
				input_node.classList.remove('valid')
				input_node.classList.add('invalid')
				// message
				set_pw_status.classList.add('error')
				set_pw_status.innerHTML = validated_obj.msg
				// button lock
				change_root_pw_button.classList.add('loading')
			}else{
				// decorate input_node as not valid (red)
				input_node.classList.remove('invalid')
				input_node.classList.add('valid')
				// button lock
				change_root_pw_button.classList.remove('loading')
			}

			return true
		}//end set_message

	// input_new_pw 2 field
		const input_new_pw_retype = ui.create_dom_element({
			element_type	: 'input',
			type			: 'password',
			class_name		: 'password_value',
			value			: '', // default value
			placeholder		: get_label.new_pw_retype || 'Retype Password',
			parent			: fragment
		})
		input_new_pw_retype.autocomplete = 'new-password'
		// prevent paste values here
		input_new_pw_retype.addEventListener('paste', function(e) {
			e.preventDefault();
			return false;
		})

		input_new_pw_retype.addEventListener('keyup', function(e) {
			e.preventDefault()

			// validated. Test password is acceptable string
				const validated_obj = component_password.prototype.validate_password_format(
					input_new_pw.value,
					password_validation_options
				)

			// message
				set_message(
					{
						result	: input_new_pw_retype.value===input_new_pw.value && validated_obj.result===true, // bool
						msg		: input_new_pw_retype.value!==input_new_pw.value ? 'Error. Password do not match!' : ''
					},
					input_new_pw_retype
				)
		})

	// checkbox show/hide
		const label_checkbox_show = ui.create_dom_element({
			element_type	: 'label',
			class_name		: 'password_show_label',
			inner_html		: get_label.show_pw || 'Show',
			parent			: fragment
		})
		const input_new_pw_show = ui.create_dom_element({
			element_type	: 'input',
			type			: 'checkbox',
			class_name		: 'password_show'
		})
		label_checkbox_show.prepend(input_new_pw_show)
		input_new_pw_show.addEventListener('click', function() {
			if(input_new_pw.type === 'password') {
				input_new_pw.type			= 'text'
				input_new_pw_retype.type	= 'text'
			}else{
				input_new_pw.type			= 'password'
				input_new_pw_retype.type	= 'password'
			}
		})

	// set_pw_status msg
		const set_pw_status = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'msg',
			parent			: fragment
		})

	// change_root_pw_button
		const change_root_pw_button = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'primary change_root_pw_button',
			inner_html		: get_label.save_root_pw || ' Save the root password ',
			parent			: fragment
		})
		change_root_pw_button.addEventListener('mouseup', async function() {

			// reset messages
				set_pw_status.classList.remove('ok')
				set_pw_status.classList.remove('error')
				set_pw_status.innerHTML = ''

			// validate again first password input
				const validated_obj = component_password.prototype.validate_password_format(
					input_new_pw.value,
					password_validation_options
				)
				// password_value_is_valid
				if (validated_obj.result!==true) {
					// message
						set_message(
							validated_obj,
							input_new_pw
						)
					return false
				}

			// check again mismatch retype
				if(input_new_pw_retype.value!==input_new_pw.value) {
					// message
						set_message(
							{
								result	: false, // bool
								msg		: 'Error. Password do not match!'
							},
							input_new_pw_retype
						)
					return false
				}

			// lock button
				change_root_pw_button.classList.add('loading')

			// add spinner
				const spinner = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'spinner',
					parent			: set_pw_status
				})

			// data_manager API call
				const api_response = await data_manager.request({
					body : {
						action	: 'install',
						dd_api	: 'dd_utils_api',
						options	: {
							action		: 'set_root_pw',
							password	: input_new_pw.value
						}
					}
				})
				// manage result
				if (api_response.result===true) {

					// all is OK case

					console.log('api_response:', api_response.msg)

					set_pw_status.classList.add('ok')
					set_pw_status.innerHTML = api_response.msg

					change_root_pw_button.remove();

					// show next block
					self.node.content_data.login_block.classList.remove('hide')

				}else{

					// fail case

					console.error(api_response.msg);

					set_pw_status.classList.add('error')
					set_pw_status.innerHTML = api_response.msg
				}

			// unlock button
				change_root_pw_button.classList.remove('loading')
				spinner.remove()
		})


	return fragment
}//end render_set_root_password_block



/**
* RENDER_LOGIN_BLOCK
* @param object self
* @return HTMLElement content_value
*/
const render_login_block = async function(self) {

	const fragment = new DocumentFragment()

	// login_container
		const login_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'login_container hide',
			parent			: fragment
		})

	// to_login_button
		const to_login_button = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'primary to_login_button',
			inner_html		: get_label.to_login || 'To login',
			parent			: fragment
		})
		to_login_button.addEventListener('mouseup', async function() {

			// login instance, build and render
				const login = await get_instance({
					model	: 'login',
					mode	: 'edit'
				})

			// custom_action_dispatch. Set before render to catch the on-login action
				const custom_action_dispatch = function(api_response){

					if (api_response.result===true) {

						// all is OK case

						// login_status
							login_status.classList.add('ok')
							login_status.classList.remove('hide')
						// login_node
							login_container.classList.add('hide')

						// remove button to prevent press again
							to_login_button.remove()

						// show next block hierarchies_import_block
							self.node.content_data.hierarchies_import_block.classList.remove('hide')

					}else{

						// fail case

						// login_status
							login_status.classList.add('error')
							login_status.innerHTML = api_response.msg || 'API response login fails'

						// debug
							console.warn('api_response:', api_response);
					}

					return api_response.result
				}
				login.custom_action_dispatch = custom_action_dispatch

			// build with autoload to get login context from API
				await login.build(true)

			// render and assign node
				const login_node = await login.render()
				login_container.appendChild(login_node)

			// show the login_container
				login_container.classList.remove('hide')
		})//end mouse_up event

	// login_status msg
		const login_status = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'msg logged hide',
			inner_html		: get_label.logged || 'Logged',
			parent			: fragment
		})


	return fragment
}//end render_login_block



/**
* RENDER_HIERARCHIES_IMPORT_BLOCK
* @param object self
* @return HTMLElement content_value
*/
export const render_hierarchies_import_block = function(options) {

	// options
		const hierarchies				= options.hierarchies || []

		const default_checked			= options.default_checked || []
		const active_hierarchies		= options.active_hierarchies || [] // already activated hierarchies
		const hierarchy_files_dir_path	= options.hierarchy_files_dir_path || '' // informative only
		const callback					= options.callback // executed on finish importation
		const hierarchy_typologies		= options.hierarchy_typologies || [] // array with typology definitions

	// DocumentFragment
		const fragment = new DocumentFragment();

		hierarchies.sort((a,b) => (a.label < b.label) ? 1 : ((b.label < a.label) ? -1 : 0))

		hierarchy_typologies.sort((a,b) => (a.label < b.label) ? 1 : ((b.label < a.label) ? -1 : 0))

	// info
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'description info',
			inner_html		: get_label.import_hierarchies_description || 'It will be displayed in the thesaurus. Keep in mind that large countries can consume a lot of resources. Don\'t load unnecessary countries. You can always load more countries later',
			parent			: fragment
		})

	// source_files
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'description source_files',
			inner_html		: get_label.import_hierarchies_directory_description || 'Source files directory: ' + hierarchy_files_dir_path,
			parent			: fragment
		})

		// hierarchies
		const hierarchy_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'hierarchy_container',
			parent			: fragment
		})

		const hierarchies_to_install = []
		const hierarchy_typologies_length = hierarchy_typologies.length
		for (let i = hierarchy_typologies_length - 1; i >= 0; i--) {

			const current_hierarchy_typology = hierarchy_typologies[i]

			const found_hierarchies = hierarchies.filter(el => el.typology === current_hierarchy_typology.typology)

			if(found_hierarchies.length < 1){
				continue
			}

			// typology_label
			ui.create_dom_element({
				element_type	: 'label',
				class_name		: 'typology_label',
				inner_html		: current_hierarchy_typology.label,
				parent			: hierarchy_container
			})

			// list of hierarchies
			const hierarchy_ul = ui.create_dom_element({
				element_type	: 'ul',
				class_name		: 'hierarchy_ul',
				parent			: hierarchy_container
			})

			const hierarchies_len = found_hierarchies.length
			for (let j = hierarchies_len - 1; j >= 0; j--) {

				// hierarchy object
					const current_hierarchy = found_hierarchies[j]
					if(current_hierarchy.type==='model'){
						continue
					}

				// is_default check
					const is_default_checked	= default_checked.find(el => el===current_hierarchy.tld)
					const checked				= is_default_checked
						? true
						: false

				// li element
					const hierarchy_li = ui.create_dom_element({
						element_type	: 'li',
						parent			: hierarchy_ul
					})

				// label
					const hierarchy_label = ui.create_dom_element({
						element_type	: 'label',
						class_name		: 'hierarchy_label',
						inner_html		: current_hierarchy.label + ' [' + current_hierarchy.tld + ']',
						parent			: hierarchy_li
					})
					if (active_hierarchies.includes( current_hierarchy.tld.toLowerCase() )) {
						ui.create_dom_element({
							element_type	: 'span',
							class_name		: 'active_hierarchy',
							inner_html		: ' [active]',
							parent			: hierarchy_label
						})
					}

				// checkbox
					const hierarchy_checkbox = ui.create_dom_element({
						element_type	: 'input',
						type			: 'checkbox',
						class_name		: 'hierarchy_checkbox'
					})
					hierarchy_label.prepend(hierarchy_checkbox)
					hierarchy_checkbox.checked = checked ? 'checked' : ''
					hierarchy_checkbox.addEventListener('change', function() {

						if(hierarchy_checkbox.checked){
							hierarchies_to_install.push(current_hierarchy.tld)
						}else{
							const index = hierarchies_to_install.indexOf(current_hierarchy.tld)
							if (index !== -1) hierarchies_to_install.splice(index, 1);
						}
					})

				// add checked to hierarchies_to_install
					if(checked){
						hierarchies_to_install.push(current_hierarchy.tld)
					}
			}//end for (let j = hierarchies_len - 1; j >= 0; j--)
		}//end for (let i = hierarchy_typologies_length - 1; i >= 0; i--)

		const import_hierarchies_button = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'primary import_hierarchies_button',
			inner_html		: get_label.import_hierarchies_button || ' Import hierarchies ',
			parent			: hierarchy_container
		})
		import_hierarchies_button.addEventListener('mouseup', fn_import_hierarchies)
		async function fn_import_hierarchies(){

			// empty selection warning
				if (hierarchies_to_install.length<1) {
					alert( get_label.select_a_file || 'Select one or more items' );
					return
				}

			// confirm action
				if (!confirm( hierarchies_to_install.length + ' ' + get_label.jerarquias +'. '+ get_label.sure )) {
					return false
				}

			// lock button
				import_hierarchies_button.classList.add('loading')
				hierarchy_container.classList.add('loading')

			// add spinner
				const spinner = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'spinner',
					parent			: import_hierarchies_status
				})

			// data_manager API call
				const api_response = await data_manager.request({
					body : {
						action	: 'install',
						dd_api	: 'dd_utils_api',
						options	: {
							action		: 'install_hierarchies',
							hierarchies	: hierarchies_to_install
						}
					}
				})
				console.log('install_hierarchies response: ', api_response);

			// manage result
				if (api_response.result===false) {

					// fail case

					console.error(api_response.msg);

					import_hierarchies_status.classList.add('error')
					import_hierarchies_status.innerHTML = api_response.msg

				}else{

					const false_check = api_response.result.find(el => el.result === false)
					if(false_check) {

						// some import file fail case

						import_hierarchies_status.classList.add('error')
						import_hierarchies_status.innerHTML = false_check.msg

					}else{

						// all is OK case

						import_hierarchies_status.classList.add('ok')
						import_hierarchies_status.innerHTML = api_response.msg

						import_hierarchies_button.remove()

						// callback on success
						if (typeof callback==='function') {
							callback(api_response)
						}
					}
				}

			// unlock button
				import_hierarchies_button.classList.remove('loading')
				hierarchy_container.classList.remove('loading')
				spinner.remove()
		}

	// import_hierarchies_status msg
		const import_hierarchies_status = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'msg',
			parent			: fragment
		})


	return fragment
}//end render_hierarchies_import_block



/**
* RENDER_INSTALL_FINISH_BLOCK
* @param object self
* @return HTMLElement content_value
*/
const render_install_finish_block = function(self) {

	const fragment = new DocumentFragment();

	// info
		const description_node = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'description msg ok',
			inner_html		: get_label.install_finished || 'Congrats! The installation process was successfully, Dédalo is ready.',
			parent			: fragment
		})

		const install_finish_button = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'success install_finish_button',
			inner_html		: get_label.install_finished || ' Let\'s go! ',
			parent			: fragment
		})
		install_finish_button.addEventListener('mouseup', async function(){

			// lock button
				install_finish_button.classList.add('loading')

			// add spinner
				const spinner = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'spinner',
					parent			: description_node
				})

			// data_manager API call
				const api_response = await data_manager.request({
					body : {
						action	: 'install',
						dd_api	: 'dd_utils_api',
						options	: {
							action	: 'install_finish'
						}
					}
				})

			// manage result
				if (api_response.result===false) {

					// fail case

					console.error("install_finish api_response:", api_response);

					install_finish_status.classList.add('error')
					install_finish_status.innerHTML = api_response.msg

					spinner.remove()

				}else{

					// all is OK case

					console.log("install_finish api_response:", api_response);

					install_finish_status.classList.add('ok')
					install_finish_status.innerHTML = api_response.msg + ' Setting up!'

					let counter = 5;
					const interval = setInterval(() => {
						install_finish_status.innerHTML = 'Initializing in ' + counter
						counter--;
						if (counter < 0 ) {
							spinner.remove()
							clearInterval(interval);
							location.reload()
						}
					}, 1000);

					install_finish_button.remove()
				}

			// unlock button
				install_finish_button.classList.remove('loading')

		})

	// install_finish_status msg
		const install_finish_status = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'msg',
			parent			: fragment
		})


	return fragment
}//end render_install_finish_block



// @license-end
