/*global get_label, page_globals, SHOW_DEBUG*/
/*eslint no-undef: "error"*/



// imports
	import {data_manager} from '../../common/js/data_manager.js'
	import {ui} from '../../common/js/ui.js'
	// import {strip_tags} from '../../../core/common/js/utils/index.js'
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
* INSTALL
* Render node for use in install mode
* @param object options
* @return DOM node wrapper
*/
render_install.prototype.install = async function(options) {

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
}//end install



/**
* GET_CONTENT_DATA
* @param instance self
* @return DOM node content_data
*/
const get_content_data = function(self) {

	// short vars
		// const properties	= self.context.properties
		// const db_status		= properties.db_status || null

	// hidden_block
		const add_hidden_block = (name) => {
			return ''
			const result = [
				'hierarchies_import_block'
			]
			.find(el => el===name)
				? ' hide'
				: '';

			return result
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
			inner_html		: get_label.instalation_help || 'Installation help',
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

	// config block
		const config_block = ui.create_dom_element({
			element_type	: 'section',
			class_name		: 'config_block',
			parent			: content_data
		})
		// set pointers
		content_data.config_block = config_block
		// title
		ui.create_dom_element({
			element_type	: 'h1',
			inner_html		: get_label.instalation_config_test || 'Configuration',
			parent			: config_block
		})
		// content
		const config_block_content = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content',
			parent			: config_block
		})
		config_block_content.appendChild(
			render_config_block(self)
		)

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
		hierarchies_import_block_content.appendChild(
			render_hierarchies_import_block(self)
		)


	return content_data
}//end get_content_data



/**
* RENDER_HELP_BLOCK
* Create contents nodes for current block
* @param object self
* @return DOM DocumentFragment
*/
const render_help_block = function(self) {

	const fragment = new DocumentFragment()

	// installation info
		const install_info_node = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'description install_info_node',
			inner_html		: get_label.Instalation_help_info || 'Installation info: ',
			parent			: fragment
		})
		ui.create_dom_element({
			element_type	: 'img',
			class_name		: 'info icon',
			src				: 'https://dedalo.dev/tpl/assets/img/logos/logo_dedalo.svg',
			parent			: install_info_node
		})
		// link
		ui.create_dom_element({
			element_type	: 'a',
			class_name		: 'link',
			href			: 'https://dedalo.dev/v5',
			inner_html		: 'dedalo.dev/v5',
			parent			: install_info_node
		})

	// installation config
		const install_config_node = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'description install_config_node',
			inner_html		: get_label.Instalation_config || 'Installation config: ',
			parent			: fragment
		})
		ui.create_dom_element({
			element_type	: 'img',
			class_name		: 'info icon',
			src				: 'https://dedalo.dev/tpl/assets/img/logos/logo_dedalo.svg',
			parent			: install_config_node
		})
		ui.create_dom_element({
			element_type	: 'a',
			class_name		: 'link',
			href			: 'https://dedalo.dev/v5_config',
			inner_html		: 'dedalo.dev/v5',
			parent			: install_config_node
		})

	return fragment
}//end render_help_block



/**
* RENDER_CONFIG_BLOCK
* Create contents nodes for current block
* @param object self
* @return DOM node
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
					class_name		: 'msg warning',
					inner_html		: get_label.config_has_errors || 'Configuration test contains errors!',
					parent			: fragment
				})

			// errors
				const db_status_container_node = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'container_errors',
					parent			: fragment
				})

			// db config_check
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
					parent			: db_status_container_node
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
			this.remove();
		})//end mouse_up event


	return fragment;
}//end render_config_block



/**
* RENDER_INSTALL_DB_BLOCK
* Create contents nodes for current block
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
				element_type 	: 'div',
				class_name		: 'error',
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
				inner_html		: config_item ,
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

			install_db_button.classList.add('loading')

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

					console.log('DBB installed:', api_response);

					// const root_pasword_form = render_set_root_pasword_form();
					// instalation_pw_container.appendChild(root_pasword_form)
					self.content_data.set_root_password_block.classList.remove('hide')

					install_db_button.remove();

				}else{

					console.error(api_response.msg);
				}
			install_db_button.classList.remove('loading')
		})//end mouse_up event

	// const instalation_pw_container = ui.create_dom_element({
	// 	element_type	: 'section',
	// 	class_name		: 'instalation_pw_container',
	// 	parent			: fragment
	// })
	// // temporal (ONLY TO SEE THE CONTENT)
	// const root_pasword_form = render_set_root_pasword_form(self);
	// instalation_pw_container.appendChild(root_pasword_form)


	return fragment
}//end render_install_db_block



/**
* RENDER_SET_ROOT_PASSWORD_BLOCK
* @param object self
* @return DOM node content_value
*/
const render_set_root_password_block = function(self) {

	const fragment = new DocumentFragment()

	// input_new_pw label
		// ui.create_dom_element({
		// 	element_type	: 'span',
		// 	class_name		: 'label',
		// 	inner_html		: get_label.password || 'Password',
		// 	parent			: fragment
		// })

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
				const validated = component_password.prototype.validate_password_format(input_new_pw.value)

				if (validated.result === false) {
					input_new_pw.classList.remove('valid')
					input_new_pw.classList.add('invalid')
				}else{
					input_new_pw.classList.remove('invalid')
					input_new_pw.classList.add('valid')
				}
		})
		input_new_pw.addEventListener('change', function(e) {
			e.preventDefault()

			// validated. Test password is acceptable string
				const validated = component_password.prototype.validate_password_format(
					input_new_pw.value
				)
				if (!validated.result) {
					return false
				}
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
			if(input_new_pw.type === 'password'){
				input_new_pw.type	= 'text'
				input_new_pw_retype	= 'text'
			}else{
				input_new_pw.type	= 'password'
				input_new_pw_retype	= 'password'
			}
		})

	// input_new_pw 2 field
		// ui.create_dom_element({
		// 	element_type 	: 'span',
		// 	class_name		: 'label',
		// 	inner_html		: get_label.new_pw_retype || 'Retype Password',
		// 	parent			: fragment
		// })
		const input_new_pw_retype = ui.create_dom_element({
			element_type	: 'input',
			type			: 'password',
			class_name		: 'password_value',
			value			: '', // default value
			placeholder 	: get_label.new_pw_retype || 'Retype Password',
			parent			: fragment
		})
		input_new_pw_retype.autocomplete = 'new-password'
		input_new_pw_retype.addEventListener('keyup', function(e) {
			e.preventDefault()
			// validated. Test password is acceptable string
				const validated = input_new_pw_retype.value === input_new_pw.value
					? true
					: false
				if (validated === false) {
					input_new_pw_retype.classList.remove('valid')
					input_new_pw_retype.classList.add('invalid')
				}else{
					input_new_pw_retype.classList.remove('invalid')
					input_new_pw_retype.classList.add('valid')
				}
		})

		// const input_new_pw_show_retype = ui.create_dom_element({
		// 	element_type	: 'input',
		// 	type			: 'checkbox',
		// 	class_name		: 'password_show',
		// 	value			: '', // default value
		// 	parent			: fragment
		// })
		// input_new_pw_show_retype.addEventListener('click', function() {
		// 	if(input_new_pw_retype.type === 'password'){
		// 		input_new_pw_retype.type = 'text'
		// 	}else{
		// 		input_new_pw_retype.type = 'password'
		// 	}
		// })

		const change_root_pw_button = ui.create_dom_element({
			element_type 	: 'button',
			class_name		: 'primary change_root_pw_button',
			inner_html		: get_label.save_root_pw || ' Save the root password ',
			parent			: fragment
		})
		change_root_pw_button.addEventListener('mouseup', async function() {

			const validated = input_new_pw_retype.value===input_new_pw.value
				? true
				: false

			if(!validated){
				return false
			}

			// data_manager API call
				const api_response = await data_manager.request({
					body : {
						action	: 'install',
						dd_api	: 'dd_utils_api',
						options	: {
							action : 'set_root_pw',
							password : input_new_pw.value
						}
					}
				})
			// manage result
				if (api_response.result===true) {

					console.log('api_response:', api_response.msg)
					change_root_pw_button.remove();

				}else{

					console.error(api_response.msg);
				}
		})

		// const hierarchies_import_container = ui.create_dom_element({
		// 	element_type	: 'section',
		// 	class_name		: 'hierarchies_import_container',
		// 	parent			: fragment
		// })
		// const hierarchies_import = render_hierarchies_import(self);
		// hierarchies_import_container.appendChild(hierarchies_import)



	return fragment
}//end render_set_root_password_block



/**
* RENDER_LOGIN_BLOCK
* @param object self
* @return DOM node content_value
*/
const render_login_block = async function(self) {

	const fragment = new DocumentFragment()

	// login_container
		const login_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'hide',
			parent			: fragment
		})

	// login instance, build and render
		const login = await get_instance({
			model	: 'login',
			mode	: 'edit'
		})
		// custom_action_dispatch
			const custom_action_dispatch = function(api_response){
				if (api_response.result===true) {
					// login_status
						login_status.classList.add('ok')
						login_status.classList.remove('hide')
					// login_node
						login_node.classList.add('hide')
					// show hierarchies_import_block
						self.node.content_data.hierarchies_import_block.classList.remove('hide')
				}else{
					// login_status
						login_status.classList.add('error')
						login_status.innerHTML = api_response.msg || 'API response login fails'
					// debug
						console.warn('api_response.result:', api_response.result);
				}
				return api_response.result
			}
			login.custom_action_dispatch = custom_action_dispatch
		// build with autoload to get login context from API
			await login.build(true)
		// render and assign node
			const login_node = await login.render()
			login_container.appendChild(login_node)

	// to_login_button
		const to_login_button = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'primary to_login_button',
			inner_html		: get_label.to_login || 'To login',
			parent			: fragment
		})
		to_login_button.addEventListener('mouseup', async function() {
			// show the install_db
			login_container.classList.remove('hide')
			// this.remove();
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
* @return DOM node content_value
*/
const render_hierarchies_import_block = function(self) {

	// short vars
		const properties = self.context.properties

	const fragment = new DocumentFragment();

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
			inner_html		: get_label.import_hierarchies_directory_description || 'Source files directory: '+ properties.hierarchy_files_dir_path,
			parent			: fragment
		})

	// list of hierarchies
		const default_checked	= properties.install_checked_default || []
		const hierarchies		= properties.hierarchies
		const hierarchies_len	= hierarchies.length

		const hierachy_ul = ui.create_dom_element({
				element_type	: 'ul',
				class_name		: 'hierachy_ul',
				parent			: fragment
			})
		const hierarchies_to_install = []
		for (let i = hierarchies_len - 1; i >= 0; i--) {

			// hierarchy object
				const current_hierarchy = hierarchies[i]
				if(current_hierarchy.type==='model'){
					continue
				}

			// is_default check
				const is_default_checked	= default_checked.find(el => el === current_hierarchy.tld)
				const checked				= is_default_checked
					? true
					: false

			// li element
				const hierachy_li = ui.create_dom_element({
					element_type	: 'li',
					parent			: hierachy_ul
				})

			// label
				const hierachy_label = ui.create_dom_element({
					element_type	: 'label',
					class_name		: 'hierarchy_label',
					inner_html		: current_hierarchy.label,
					parent			: hierachy_li
				})

			// checkbox
				const hierarchy_checkbox = ui.create_dom_element({
					element_type	: 'input',
					type			: 'checkbox',
					class_name		: 'hierarchy_checkbox'
				})
				hierachy_label.prepend(hierarchy_checkbox)
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
		}//end for (let i = hierarchies_len - 1; i >= 0; i--)

		const import_hierarchies_button = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'primary import_hierarchies_button',
			inner_html		: get_label.import_hierarchies_button || ' Import hierarchies ',
			parent			: fragment
		})
		import_hierarchies_button.addEventListener('mouseup', async function(){
			console.log('hierarchies_to_install:', hierarchies_to_install);

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
			// manage result
				if (api_response.result===true) {

					console.log('api_response:', api_response.msg)
					// change_root_pw_button.remove();

				}else{

					console.error(api_response.msg);
				}
		})


	return fragment
}//end render_hierarchies_import_block
