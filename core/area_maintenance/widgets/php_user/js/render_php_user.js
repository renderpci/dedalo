// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../../common/js/ui.js'



/**
* RENDER_PHP_USER
* Client-side render module for the `php_user` area_maintenance widget.
*
* Displays diagnostic information about the OS-level user that PHP is running as,
* together with two key filesystem paths (PHP error log and session save path).
* The data is fetched once by the widget host (widget_common.load) and arrives
* pre-populated on `self.value`; this module only builds the DOM from that value.
*
* Exported as a constructor function so that php_user.js can assign its prototype
* methods (edit, list) via prototype delegation (see php_user.js).
*
* Expected shape of `self.value` (set by area_maintenance PHP, class.area_maintenance.php):
* {
*   info               : {Object} — result of system::get_php_user_info(); on POSIX systems
*                                   this is the posix_getpwuid() entry (name, uid, gid, dir,
*                                   shell, …); on non-POSIX systems it only contains
*                                   { name, current_user }. Can be null.
*   php_error_log_path : {string} — absolute path returned by system::get_error_log_path()
*   php_session_path   : {string} — PHP session save path (session_save_path())
* }
*/
export const render_php_user = function() {

	return true
}//end render_php_user



/**
* LIST
* Creates the nodes of current widget.
* The created wrapper will be append to the widget body in area_maintenance
* @param {Object} options
* 	Sample:
* 	{
*		render_level : "full"
		render_mode : "list"
*   }
* @returns {HTMLElement} wrapper
* 	To append to the widget body node (area_maintenance)
*/
render_php_user.prototype.list = async function(options) {

	const self = this

	const render_level = options.render_level || 'full'

	// content_data
		const content_data = await get_content_data_edit(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_edit returns widget wrapper
		const wrapper = ui.widget.build_wrapper_edit(self, {
			content_data : content_data
		})
		// set pointers
		wrapper.content_data = content_data


	return wrapper
}//end list



/**
* GET_CONTENT_DATA_EDIT
* Builds the read-only DOM panel that displays PHP-user diagnostics.
*
* Renders three sections inside a plain `<div>` container:
*  1. A headline showing the PHP process user name (from `value.info.name`).
*  2. A `<pre>` block with the full JSON dump of `value.info` — the complete
*     POSIX user-info object (uid, gid, home dir, shell, etc.) or the
*     lightweight {name, current_user} fallback on non-POSIX hosts.
*  3. Two labelled `<pre>` blocks for the PHP error-log path and the PHP
*     session save path, each preceded by a `<div>` label with a leading `<br>`.
*
* This function is module-private (not exported); it is only called by `list`.
*
* @param {Object} self - The php_user widget instance. Must expose `self.value`
*                        with the shape described in the module header.
* @returns {HTMLElement} content_data - A `<div>` element ready to be mounted
*                                       into the widget wrapper.
*/
const get_content_data_edit = async function(self) {

	// short vars
		const value					= self.value || {}
		const info					= value.info || {}
		const php_error_log_path	= value.php_error_log_path || ''
		const php_session_path		= value.php_session_path || ''
		const name					= info.name || ''

	// content_data
		const content_data = ui.create_dom_element({
			element_type : 'div'
		})

	// version
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: '',
			inner_html		: `PHP user ${name}`,
			parent			: content_data
		})

	// info
		// Renders the full posix_getpwuid() record (or fallback) as pretty-printed JSON
		// so the operator can see uid/gid/shell/home without needing a server terminal.
		ui.create_dom_element({
			element_type	: 'pre',
			class_name		: '',
			inner_html		: JSON.stringify(info, null, 2),
			parent			: content_data
		})

	// PHP error log path
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: '',
			inner_html		: `<br>PHP error log path:`,
			parent			: content_data
		})
		ui.create_dom_element({
			element_type	: 'pre',
			class_name		: '',
			inner_html		: php_error_log_path,
			parent			: content_data
		})

	// PHP session path
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: '',
			inner_html		: `<br>PHP session path:`,
			parent			: content_data
		})
		ui.create_dom_element({
			element_type	: 'pre',
			class_name		: '',
			inner_html		: php_session_path,
			parent			: content_data
		})


	return content_data
}//end get_content_data_edit


// @license-end
