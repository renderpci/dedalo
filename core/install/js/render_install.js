// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG*/
/*eslint no-undef: "error"*/

// SEC-032: install runs WITHOUT authentication. All `*_status.innerHTML = api_response.msg`
// sites have been converted to `textContent` so that any reflection of attacker-controlled
// input (DB host, password validator, hierarchy import errors, etc.) cannot trigger
// pre-auth XSS. Counter tickers and reset-to-empty assignments were also converted for
// consistency.



// imports
	import {data_manager} from '../../common/js/data_manager.js'
	import {when_in_viewport} from '../../common/js/events.js'
	import {ui} from '../../common/js/ui.js'
	import {component_password} from '../../component_password/js/component_password.js'
	import {get_instance} from '../../common/js/instances.js'



/**
* RENDER_INSTALL
* Client-side renderer for the Dédalo first-run installation wizard.
*
* This module drives a sequential, multi-step installation UI that runs without
* any prior authentication (see SEC-032). The wizard walks the operator through:
*
*   1. Help/docs links
*   2. Server init-test results (PHP environment checks)
*   3. Database configuration status + action choice (fresh install vs. update vs. root-pw reset)
*   4. Database creation from the bundled SQL file
*   5. Root-password setup (strength-validated)
*   6. First login
*   7. Hierarchy (thesaurus tree) import
*   8. Finish / reload
*
* The constructor is a no-op stub; all logic lives on the prototype. `install.js`
* assigns `render_install.prototype.render` to `install.prototype.edit` and related
* render modes, so this prototype method is the single entry point invoked by the
* common render dispatcher.
*
* Exported symbols:
*   - render_install           (constructor, assigned to install.prototype)
*   - render_hierarchies_import_block  (also used standalone by activation screens)
*/



/**
* RENDER_INSTALL
* Constructor stub for the render_install prototype chain.
* All rendering logic is implemented as prototype methods; the constructor itself
* only returns true to signal successful instantiation.
* @returns {boolean} Always true
*/
export const render_install = function() {

	return true
}//end render_install



/**
* RENDER
* Render node for use in install mode
*
* Entry point called by the common render dispatcher (install.prototype.edit, .list, …).
* Builds the full install wizard DOM tree wrapped in a top-level div.wrapper.install
* element and returns it, or returns the inner content_data fragment directly when
* render_level is 'content'.
*
* Side effects: attaches content_data as a property on the returned wrapper so that
* inner sub-blocks can later unhide sibling sections via `self.node.content_data.*`.
*
* @param {Object} options - Render options passed by the common render dispatcher
* @param {string} [options.render_level='full'] - 'full' returns wrapper; 'content' returns inner fragment only
* @returns {Promise<HTMLElement>} The wrapper div (render_level 'full') or content_data div ('content')
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
* Builds and returns the full multi-section install wizard DOM tree.
*
* Creates one <section> per wizard step and attaches each as a named property on
* the returned content_data div so that sibling sections can be revealed later with
* `self.node.content_data.<section_name>.classList.remove('hide')`.
*
* All sections except help_block and init_test_block start with the CSS class 'hide'
* (injected by the inner add_hidden_block helper) and are progressively revealed as
* each step completes successfully.
*
* Section order and purpose:
*   help_block                – documentation links
*   init_test_block           – server environment pre-flight results
*   config_block              – database configuration check + action selector
*   install_db_block          – create DB from bundled SQL file
*   set_root_password_block   – set superuser password
*   login_block               – first login after password is set
*   hierarchies_import_block  – import thesaurus hierarchies
*   install_finish_block      – finalize and reload
*
* @param {Object} self - The install instance (provides self.context.properties and self.node)
* @returns {HTMLElement} content_data div containing all wizard sections
*/
const get_content_data = function(self) {

	// add_hidden_block
	// Helper that always returns ' hide'. Its `name` argument is accepted for readability
	// at call sites but is not used at runtime — all sections begin hidden and are revealed
	// progressively by their predecessor's success handler. (!) The name param is intentionally
	// unused; do not remove it — it documents which block is being hidden at each call site.
		const add_hidden_block = (name) => {
			return ' hide'
		}

	// content_data
		const content_data = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_data'
		})

	// help block
	// Always visible. Provides links to official install and configuration docs.
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
	// Always visible. Shows the outcome of the server-side environment pre-flight
	// test (PHP version, extension availability, file permissions, etc.).
	// On success, the config_block is revealed via when_in_viewport.
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
	// Hidden until init_test passes. Displays per-item DB config validation results
	// and a set of action buttons: fresh install, update, or root password change.
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
	// Hidden until the operator clicks "To install" in config_block_options.
	// Executes the SQL import that creates the Dédalo schema.
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
	// Hidden until DB installation succeeds (or when the operator chose password-reset path).
	// Renders the password strength form for the Dédalo superuser account.
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
	// Hidden until the root password has been saved. Embeds a live login form so the
	// operator can authenticate before proceeding to hierarchy import.
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
	// Hidden until login succeeds. Lets the operator choose which pre-bundled thesaurus
	// hierarchy files (countries, languages, etc.) to seed into the new database.
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

		// Collect hierarchy metadata from the install context that the server embedded at
		// page-load time (context.properties.*). The callback reveals install_finish_block
		// once at least one hierarchy batch completes successfully.
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
	// Hidden until hierarchy import callback fires. Calls 'install_finish' API action
	// which disables install mode, then triggers a 5-second countdown and page reload.
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
* Creates the help/documentation link section of the install wizard.
*
* Renders two rows: one linking to the official install guide and one linking to
* the configuration reference. Both links open in a new tab with rel="noopener noreferrer"
* to prevent tab-napping (SEC-033).
*
* @param {Object} self - The install instance (unused directly; retained for API consistency)
* @returns {DocumentFragment} Fragment containing the two documentation link rows
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
		link_install.rel	= 'noopener noreferrer' // SEC-033

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
		link_configuration.rel		= 'noopener noreferrer' // SEC-033


	return fragment
}//end render_help_block



/**
* RENDER_INIT_TEST_BLOCK
* Creates the server environment pre-flight result section.
*
* Reads `context.properties.init_test` (a server-populated object) and renders either
* an error message (when the test failed or the property is absent) or a success/warning
* message. On success it wires a when_in_viewport observer that reveals config_block once
* this message scrolls into view, creating the step-by-step wizard progression.
*
* init_test shape expected from the server:
*   {
*     result  : {boolean},   // false → pre-flight failed
*     errors  : {boolean},   // true → passed with warnings
*     msg     : {Array}      // array of human-readable result strings
*   }
*
* @param {Object} self - The install instance (provides self.context.properties and self.node)
* @returns {DocumentFragment} Fragment with one status message element
*/
const render_init_test_block = function(self) {

	// short vars
		const properties	= self.context.properties
		const init_test		= properties.init_test || null

	const fragment = new DocumentFragment()

	// fail init_test case
	// Guard against both missing property and explicit result:false.
	// When init_test is absent it usually means a PHP fatal prevented the context from
	// being built at all; show a generic error rather than crashing.
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
	// errors===true means non-fatal warnings were recorded; show 'warning' CSS class
	// instead of 'ok' so the operator is aware before proceeding.
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

	// Reveal config_block only after the success message is actually visible in the
	// viewport, giving the operator a chance to read the init-test outcome first.
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
* Creates the database configuration validation status section.
*
* Reads `context.properties.db_status` (a server-populated object) and renders a
* hierarchical summary of each configuration sub-check. When global_status is false the
* function renders per-item error/ok indicators (db name, username, password, information
* schema, info key, and connection) and returns early so the user sees exactly what to fix
* in dedalo_config.php. When global_status is true it renders a single "passed" message.
*
* db_status shape expected from the server:
*   {
*     global_status           : {boolean},
*     config_check            : {boolean},  // config file parsed successfully
*     config_db_name_check    : {boolean},
*     config_user_name_check  : {boolean},
*     config_pw_check         : {boolean},
*     config_information_check: {boolean},
*     config_info_key_check   : {boolean},
*     db_connection_check     : {boolean}   // actual TCP connection to PostgreSQL
*   }
*
* @param {Object} self - The install instance (provides self.context.properties)
* @returns {DocumentFragment} Fragment with status message(s) and optional error detail nodes
*/
const render_config_block = function(self) {

	// short vars
		const properties	= self.context.properties
		const db_status		= properties.db_status || null

	const fragment = new DocumentFragment()

	// fail db_status case
	// If the server could not even assemble db_status (e.g. config file unreadable),
	// there is nothing useful to display — show a generic context-failure message.
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
	// Render one indicator node per sub-check so the operator can identify precisely
	// which values in dedalo_config.php need correction before retrying.
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
			// Top-level check: could the config file be found and parsed at all?
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
			// The connection check is rendered outside db_config_check_node because it
			// tests a live TCP handshake rather than a config-value parse, so it is
			// logically a sibling of config_check rather than a child.
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
* Creates the action-selector section shown after configuration checks pass.
*
* Renders up to three mutually exclusive buttons:
*   - "To install"        – always present; reveals install_db_block and removes this options panel.
*   - "To update"         – only present when db_data_version[0] < 6 (migration from v5/v6);
*                           calls the 'to_update' API action and triggers a 5-second reload countdown.
*   - "To change root"    – always present; reveals set_root_password_block for a standalone
*                           password reset without re-running the full install.
*
* Each button removes the config_block_options panel on click to prevent double-submission.
*
* @param {Object} self - The install instance (provides self.context.properties and self.node)
* @returns {DocumentFragment} Fragment containing the action buttons and optional update-status div
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
	// Only show the "To update" button when an existing v5/v6 Dédalo database is detected.
	// db_data_version is an array; index [0] holds the major version number as a string.
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
				// (!) to_update performs potentially destructive schema migrations.
				// retries:1 ensures the operation is not retried automatically on network error.
					const api_response = await data_manager.request({
						body : {
							action	: 'install',
							dd_api	: 'dd_utils_api',
							options	: {
								action : 'to_update'
							}
						},
						retries : 1, // one try only
						timeout : 10 * 1000 // 10 secs waiting response
					})

				// manage result
					if (api_response.result===false) {

						// fail case

						console.error("to_update api_response:", api_response);

					}else{

						// all is OK case

						console.log("to_update api_response:", api_response);

						// 5-second countdown before reload, giving the operator time to read the result.
						let counter = 5;
						const interval = setInterval(() => {
							to_update_status.textContent = 'Initializing in ' + counter
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
	// A standalone path that skips DB creation and goes directly to the password-change
	// form; useful when the operator forgets the root password on an existing installation.
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
* Creates the database installation section.
*
* Verifies that the bundled SQL source file exists at the expected server path
* (via `properties.target_file_path_exists`); if not, renders an error and returns early.
* Otherwise displays the target file path, the active db_config key/value pairs (db name,
* host, port, user – no password), and an "INSTALL DATABASE FROM FILE" button.
*
* On button click the function calls the 'install_db_from_default_file' API action.
* On success it reveals set_root_password_block; on failure it shows the error message
* from the API response via textContent (SEC-032: never innerHTML for API output).
*
* @param {Object} self - The install instance (provides self.context.properties and self.node)
* @returns {DocumentFragment} Fragment with file path info, db config grid, action button, and status div
*/
const render_install_db_block = function(self) {

	// short vars
		const properties = self.context.properties

	const fragment = new DocumentFragment()

	// check if the file exists in the correct path
	// The SQL dump must be present before the install action is offered; without it
	// the server-side handler would fail immediately with an unhelpful I/O error.
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
	// Render a two-column grid of key/value config pairs so the operator can confirm
	// the target database before triggering the potentially destructive SQL import.
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
				install_db_status.textContent = ''

			// add spinner
				const spinner = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'spinner',
					parent			: install_db_status
				})

			// data_manager API call
			// (!) retries:1 prevents an accidental double-import if the first request times out
			// but the server actually completed the SQL load.
				const api_response = await data_manager.request({
					body : {
						action	: 'install',
						dd_api	: 'dd_utils_api',
						options	: {
							action : 'install_db_from_default_file'
						}
					},
					retries : 1, // one try only
					timeout : 10 * 1000 // 10 secs waiting response
				})
				// manage result
				if (api_response.result===true) {

					// all is OK case

					console.log('DBB installed:', api_response);

					install_db_status.classList.add('ok')
					install_db_status.textContent = api_response.msg

					// show set_root_password_block
					self.node.content_data.set_root_password_block.classList.remove('hide')

					install_db_button.remove();

				}else{

					// fail case

					console.error(api_response.msg);

					install_db_status.classList.add('error')
					install_db_status.textContent = api_response.msg
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
* Creates the root-password setup form for the Dédalo superuser account.
*
* Renders two password fields (new password + retype) backed by
* component_password.prototype.validate_password_format for real-time strength checking.
* Paste is disabled on the retype field to force manual retyping.
* A show/hide checkbox toggles both fields between 'password' and 'text' type.
*
* password_validation_options contract (passed to validate_password_format):
*   lower / upper / numeric : minimum required character counts (0 = not required)
*   alpha                   : combined lower+upper count (0 = not required separately)
*   special                 : minimum special character count
*   length                  : [min, max] character length
*   custom                  : array of additional regexes or functions
*   badWords                : forbidden substrings
*   badSequenceLength       : disallow sequential repeated chars of this length
*   noQwertySequences       : reject keyboard-row sequences
*   noSequential            : reject ascending/descending letter or digit runs
*
* On successful save (API result===true), set_root_password_block.change_root_pw_button is
* removed and login_block is revealed. API response messages are always set via textContent
* (SEC-032).
*
* @param {Object} self - The install instance (provides self.node for sibling-block revelation)
* @returns {DocumentFragment} Fragment with description, two password inputs, show-checkbox, status div, and save button
*/
const render_set_root_password_block = function(self) {

	const fragment = new DocumentFragment()

	// password_validation_options
	// These constraints define "strong enough" for a Dédalo superuser credential.
	// Adjust here to tighten/loosen policy; the validate_password_format call site
	// is in component_password and receives this object verbatim.
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
	// Both 'keyup' and 'change' fire set_message so that inline validation runs both
	// while typing and on programmatic value changes (e.g. autofill).
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

		/**
		* SET_MESSAGE
		* Updates the set_pw_status element and input decoration based on a validation result.
		*
		* Applies 'valid'/'invalid' CSS class to the input node and 'ok'/'error' to the status
		* div, and adds/removes the 'loading' class on the save button to prevent submission
		* when the password does not meet the configured policy.
		*
		* (!) set_pw_status and change_root_pw_button are referenced from the enclosing
		* render_set_root_password_block scope; they are defined later in that function and
		* accessed via closure. This is safe because set_message is only ever called from
		* user-event handlers that fire after the full fragment has been composed.
		*
		* @param {Object} validated_obj - Return value of component_password.validate_password_format
		* @param {boolean} validated_obj.result - true if password meets all policy requirements
		* @param {string}  validated_obj.msg    - human-readable failure reason (empty on success)
		* @param {HTMLElement} input_node - The password input to decorate
		* @returns {boolean} Always true
		*/
		function set_message(validated_obj, input_node) {

			// message reset
				set_pw_status.classList.remove('ok')
				set_pw_status.classList.remove('error')
				set_pw_status.textContent = ''

			if (validated_obj.result===false) {
				// decorate input_node as valid (green)
				input_node.classList.remove('valid')
				input_node.classList.add('invalid')
				// message
				set_pw_status.classList.add('error')
				set_pw_status.textContent = validated_obj.msg
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
	// The retype field validates that both entries are identical AND that the primary
	// field still passes the policy; catching copy-paste errors that could lock the operator out.
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
		// Paste is blocked on the retype field so the operator is forced to type the
		// password twice, reducing the risk of committing an accidentally wrong value.
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
			// The retype field's result is the logical AND of:
			//   (a) the primary field still passes the policy, AND
			//   (b) both field values are identical.
				set_message(
					{
						result	: input_new_pw_retype.value===input_new_pw.value && validated_obj.result===true, // bool
						msg		: input_new_pw_retype.value!==input_new_pw.value ? 'Error. Password do not match!' : ''
					},
					input_new_pw_retype
				)
		})

	// checkbox show/hide
	// Toggles both password inputs between 'password' and 'text' type simultaneously
	// so the operator can visually inspect what they have typed in both fields.
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
	// Performs a final re-validation of both fields before submitting, guarding against
	// edge cases where the button might be clicked before the keyup handler had a chance
	// to lock it (e.g. rapid keyboard→mouse transitions).
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
				set_pw_status.textContent = ''

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
			// The password value is sent in the request body (POST over HTTPS in production).
			// (!) retries:1 prevents re-sending a different password if the first attempt
			// partially succeeded on the server but the response was lost in transit.
				const api_response = await data_manager.request({
					body : {
						action	: 'install',
						dd_api	: 'dd_utils_api',
						options	: {
							action		: 'set_root_pw',
							password	: input_new_pw.value
						}
					},
					retries : 1, // one try only
					timeout : 10 * 1000 // 10 secs waiting response
				})
				// manage result
				if (api_response.result===true) {

					// all is OK case

					console.log('api_response:', api_response.msg)

					set_pw_status.classList.add('ok')
					set_pw_status.textContent = api_response.msg

					change_root_pw_button.remove();

					// show next block
					self.node.content_data.login_block.classList.remove('hide')

				}else{

					// fail case

					console.error(api_response.msg);

					set_pw_status.classList.add('error')
					set_pw_status.textContent = api_response.msg
				}

			// unlock button
				change_root_pw_button.classList.remove('loading')
				spinner.remove()
		})


	return fragment
}//end render_set_root_password_block



/**
* RENDER_LOGIN_BLOCK
* Creates the login section that appears after the root password is saved.
*
* Renders a "To login" button that, on click, lazily instantiates and renders a full
* login component (fetched via get_instance) and appends it inside login_container.
* A custom_action_dispatch hook is injected into the login instance before it builds so
* that a successful authentication immediately reveals hierarchies_import_block and
* removes the login button to prevent re-use.
*
* The login component context is loaded via login.build(true) (autoload=true), which
* calls the 'get_install_context' API action — no prior session is required.
*
* @param {Object} self - The install instance (provides self.node for sibling-block revelation)
* @returns {Promise<DocumentFragment>} Fragment with login_container, "To login" button, and logged-status div
*/
const render_login_block = async function(self) {

	const fragment = new DocumentFragment()

	// login_container
	// Starts hidden; revealed after the operator clicks "To login" and the login widget is built.
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
			// This function is called by the login component's submit handler in place of
			// the default session-redirect logic, so we can intercept the result inside
			// the install wizard without navigating away from the page.
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
							login_status.textContent = api_response.msg || 'API response login fails'

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
	// Hidden by default; revealed with class 'ok' on successful login, or 'error' on failure.
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
* Creates the hierarchy (thesaurus tree) selection and import section.
*
* This function is exported and reused by the hierarchy activation screen outside of
* the install wizard, so it accepts a plain options object rather than a self reference.
*
* Hierarchies are grouped by typology and sorted alphabetically (reversed, because the
* render loops iterate from last to first — the visual order is therefore A→Z top-to-bottom).
* Each hierarchy is rendered as a labelled checkbox. Pre-checked items come from
* options.default_checked (an array of TLD strings). Already-active hierarchies show an
* '[active]' badge but can still be selected for re-import.
*
* Hierarchy objects shape (element of options.hierarchies):
*   {
*     label    : {string},  // human-readable name
*     tld      : {string},  // top-level domain identifier, e.g. 'es', 'ca'
*     typology : {string},  // groups the entry under a typology header
*     type     : {string}   // 'model' entries are skipped (they are definition templates)
*   }
*
* On "Import hierarchies" click the function calls the 'install_hierarchies' API action with
* the collected TLD list. A partial failure (some items result===false) shows the first
* failing item's message; full success calls options.callback if provided.
*
* (!) alert() and confirm() are used here because this screen is part of the pre-auth
* install wizard where no Dédalo dialog component is available yet.
*
* @param {Object} options - Configuration object
* @param {Array}  options.hierarchies              - All available hierarchy descriptors
* @param {Array}  [options.default_checked=[]]     - TLD strings pre-checked by default
* @param {Array}  [options.active_hierarchies=[]]  - TLD strings already active in the DB
* @param {string} [options.hierarchy_files_dir_path=''] - Server path shown for informational purposes
* @param {Function} [options.callback]             - Called with api_response on successful import
* @param {Array}  [options.hierarchy_typologies=[]] - Typology group descriptors ({label, typology})
* @returns {DocumentFragment} Fragment with description, grouped hierarchy checkboxes, import button, and status div
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

		// Sort both arrays in descending alphabetical order. The rendering loops iterate
		// from last-to-first (i-- / j--), so the final on-screen order is ascending A→Z.
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

		// Accumulates the TLD strings for all checked checkboxes.
		// Pre-populated with default_checked items during the initial loop, then kept
		// in sync by checkbox change handlers (push on check, splice on uncheck).
		const hierarchies_to_install = []
		const hierarchy_typologies_length = hierarchy_typologies.length
		for (let i = hierarchy_typologies_length - 1; i >= 0; i--) {

			const current_hierarchy_typology = hierarchy_typologies[i]

			// Skip typology groups that have no matching hierarchies in the available list.
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
					// Skip model-type entries — they are definition templates, not importable data files.
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
				// The label text includes the TLD in brackets for disambiguation when
				// multiple hierarchies share similar display names.
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
				// Seed the array on initial render so that default-checked items are
				// included without requiring the user to interact with the checkbox.
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
		/**
		* FN_IMPORT_HIERARCHIES
		* Event handler for the "Import hierarchies" button.
		*
		* Guards against empty selection (alert) and prompts for confirmation (confirm)
		* before dispatching the 'install_hierarchies' API action with the collected TLD list.
		* On a partial failure the first failing item's message is shown. On full success the
		* import button is removed, and options.callback is called if provided.
		*
		* (!) Uses alert() and confirm() — acceptable here because no modal component is
		* available at install time. Flag: consider replacing with inline UI feedback once
		* the UI layer is fully initialized.
		*
		* @returns {Promise<void>}
		*/
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
					},
					retries : 1, // one try only
					timeout : 10 * 1000 // 10 secs waiting response
				})
				console.log('install_hierarchies response: ', api_response);

			// manage result
				if (api_response.result===false) {

					// fail case

					console.error(api_response.msg);

					import_hierarchies_status.classList.add('error')
					import_hierarchies_status.textContent = api_response.msg

				}else{

					// Partial failure: the API may return an array of per-hierarchy results.
					// Show the first failing item's message; the operator can adjust and retry.
					const false_check = api_response.result.find(el => el.result === false)
					if(false_check) {

						// some import file fail case

						import_hierarchies_status.classList.add('error')
						import_hierarchies_status.textContent = false_check.msg

					}else{

						// all is OK case

						import_hierarchies_status.classList.add('ok')
						import_hierarchies_status.textContent = api_response.msg

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
* Creates the final step section shown after hierarchy import completes.
*
* Renders a success description and a "Let's go!" button. On click the button calls the
* 'install_finish' API action which disables install mode server-side (removes/renames the
* install lock file). On success a 5-second countdown updates install_finish_status via
* textContent and then triggers location.reload() to boot into the normal Dédalo UI.
*
* On failure the spinner is removed but the button stays locked (class 'loading' is not
* removed on error) — this is intentional: if install_finish fails the operator should
* not retry without understanding the server error shown in install_finish_status.
*
* @param {Object} self - The install instance (provides self.node; unused in this function
*                        body but retained for API consistency with other render functions)
* @returns {DocumentFragment} Fragment with description, finish button, and status div
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
			// 'install_finish' disables install mode server-side. After this call the
			// server will stop serving the install wizard and redirect to the normal login.
				const api_response = await data_manager.request({
					body : {
						action	: 'install',
						dd_api	: 'dd_utils_api',
						options	: {
							action	: 'install_finish'
						}
					},
					retries : 1, // one try only
					timeout : 10 * 1000 // 10 secs waiting response
				})

			// manage result
				if (api_response.result===false) {

					// fail case
					// (!) The 'loading' class is NOT removed on error — intentional guard
					// to prevent a re-click without understanding the failure.

					console.error("install_finish api_response:", api_response);

					install_finish_status.classList.add('error')
					install_finish_status.textContent = api_response.msg

					spinner.remove()

				}else{

					// all is OK case

					console.log("install_finish api_response:", api_response);

					install_finish_status.classList.add('ok')
					install_finish_status.textContent = api_response.msg + ' Setting up!'

					// 5-second countdown before reload, giving the operator time to read the result.
					let counter = 5;
					const interval = setInterval(() => {
						install_finish_status.textContent = 'Initializing in ' + counter
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
