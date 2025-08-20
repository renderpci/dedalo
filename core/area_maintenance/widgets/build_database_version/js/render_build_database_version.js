// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../../common/js/ui.js'
	import {update_process_status} from '../../../../common/js/common.js'
	import {data_manager} from '../../../../common/js/data_manager.js'



/**
* RENDER_BUILD_DATABASE_VERSION
* Manages the widget logic and appearance in client side
*/
export const render_build_database_version = function() {

	return true
}//end render_build_database_version



/**
* LIST
* Creates the nodes of current widget.
* The created wrapper will be append to the widget body in area_maintenance
* @param object options
* 	Sample:
* 	{
*		render_level : "full"
		render_mode : "list"
*   }
* @return HTMLElement wrapper
* 	To append to the widget body node (area_maintenance)
*/
render_build_database_version.prototype.list = async function(options) {

	const self = this

	const render_level = options.render_level || 'full'

	// content_data
		const content_data = await get_content_data(self)
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
* GET_CONTENT_DATA
* @param object self
* @return HTMLElement content_data
*/
const get_content_data = async function(self) {

	// short vars
		const value = self.value || {}

	// content_data
		const content_data = ui.create_dom_element({
			element_type : 'div'
		})

	// build_install_version
		const build_install_version_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'group_container build_install_version_container',
			parent			: content_data
		})
		build_install_version_container.appendChild(
			render_build_install_version(self, value)
		)

	// build_recovery_version_file
		const build_recovery_version_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'group_container build_recovery_version_container',
			parent			: content_data
		})
		build_recovery_version_container.appendChild(
			render_build_recovery_version_file(self, value)
		)

	// restore_dd_ontology_recovery_from_file
		const restore_dd_ontology_recovery_from_file_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'group_container restore_dd_ontology_recovery_from_file_container',
			parent			: content_data
		})
		restore_dd_ontology_recovery_from_file_container.appendChild(
			render_restore_dd_ontology_recovery_from_file(self, value)
		)


	return content_data
}//end get_content_data



/**
* RENDER_BUILD_INSTALL_VERSION
* Creates the build install DOM nodes
* @param object self
* @param object value
* @return DocumentFragment
*/
const render_build_install_version = function (self, value) {

	const source_db		= value.source_db
	const target_db		= value.target_db
	const target_file	= value.target_file

	const fragment = new DocumentFragment()

	// info
		const text = `Clones the current database "${source_db}" to "${target_db}", cleans its data and exports it to file: ${target_file}`
		ui.create_dom_element({
			element_type	: 'div',
			inner_html		: text,
			class_name		: 'info_text',
			parent			: fragment
		})

		// check process status always
		const check_process_data = () => {
			data_manager.get_local_db_data(
				'process_build_install_version',
				'status'
			)
			.then(function(local_data){
				if (local_data && local_data.value) {
					update_process_status(
						local_data.value.pid,
						local_data.value.pfile,
						process_response
					)
				}
			})
		}
		check_process_data()

	// button_process build_install_version
		const button_process = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'light button_process',
			inner_html		: self.name,
			parent			: fragment
		})
		// event click
		const click_handler = async (e) => {
			e.stopPropagation()

			if (!confirm(get_label.sure || 'Sure?')) {
				return
			}

			// blur button
			document.activeElement.blur()

			// locks the button submit
			button_process.classList.add('loading')

			// build_install_version
			const api_response = await self.build_install_version()

			button_process.classList.remove('loading')

			update_process_status(
				api_response.pid,
				api_response.pfile,
				process_response
			)
		}
		button_process.addEventListener('click', click_handler)

	// process_response
		const process_response = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'process_response',
			parent			: fragment
		})


	return fragment
}//end render_build_install_version



/**
* RENDER_BUILD_RECOVERY_VERSION_FILE
* Creates the build install DOM nodes
* @param object self
* @param object value
* @return DocumentFragment
*/
const render_build_recovery_version_file = function (self, value) {

	const fragment = new DocumentFragment()

	// info
		const text = `Creates 'dd_ontology_recovery.sql' file with basic Ontology data`
		ui.create_dom_element({
			element_type	: 'div',
			inner_html		: text,
			class_name		: 'info_text',
			parent			: fragment
		})

	// button_process build_recovery_version
		const button_process = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'light button_process',
			inner_html		: 'Create \'dd_ontology_recovery.sql\' file',
			parent			: fragment
		})
		// event click
		const click_handler = async (e) => {
			e.stopPropagation()

			if (!confirm(get_label.sure || 'Sure?')) {
				return
			}

			// blur button
			document.activeElement.blur()

			// locks the button submit
			button_process.classList.add('loading')

			// build_recovery_version
			const api_response = await self.build_recovery_version_file()

			if(SHOW_DEBUG===true) {
				console.log('**** render_build_recovery_version_file api_response:', api_response);
			}

			// locks the button submit
			button_process.classList.remove('loading')

			// process_response print
			while (process_response.firstChild) {
				process_response.removeChild(process_response.firstChild);
			}
			ui.create_dom_element({
				element_type	: 'pre',
				class_name		: 'response',
				inner_html		: JSON.stringify(api_response, null, 2),
				parent			: process_response
			})
		}
		button_process.addEventListener('click', click_handler)

	// process_response
		const process_response = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'process_response',
			parent			: fragment
		})


	return fragment
}//end render_build_recovery_version_file



/**
* RENDER_RESTORE_DD_ONTOLOGY_RECOVERY_FROM_FILE
* Creates the build install DOM nodes
* @param object self
* @param object value
* @return DocumentFragment
*/
const render_restore_dd_ontology_recovery_from_file = function (self, value) {

	const fragment = new DocumentFragment()

	// info
		const text = `Restores table 'dd_ontology_recovery' from file`
		ui.create_dom_element({
			element_type	: 'div',
			inner_html		: text,
			class_name		: 'info_text',
			parent			: fragment
		})

	// button_process restore_dd_ontology_recovery_from_file
		const button_process = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'light button_process',
			inner_html		: 'Restore \'dd_ontology_recovery\' table from file',
			parent			: fragment
		})
		// event click
		const click_handler = async (e) => {
			e.stopPropagation()

			if (!confirm(get_label.sure || 'Sure?')) {
				return
			}

			// blur button
			document.activeElement.blur()

			// locks the button submit
			button_process.classList.add('loading')

			// restore_dd_ontology_recovery_from_file
			const api_response = await self.restore_dd_ontology_recovery_from_file()

			console.log('**** render_restore_dd_ontology_recovery_from_file api_response:', api_response);

			// locks the button submit
			button_process.classList.remove('loading')

			// process_response print
			while (process_response.firstChild) {
				process_response.removeChild(process_response.firstChild);
			}
			ui.create_dom_element({
				element_type	: 'pre',
				class_name		: 'response',
				inner_html		: JSON.stringify(api_response, null, 2),
				parent			: process_response
			})
		}
		button_process.addEventListener('click', click_handler)

	// process_response
		const process_response = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'process_response',
			parent			: fragment
		})


	return fragment
}//end render_restore_dd_ontology_recovery_from_file



// @license-end
