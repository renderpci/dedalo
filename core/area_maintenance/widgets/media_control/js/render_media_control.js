// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../../common/js/ui.js'
	import {dd_request_idle_callback} from '../../../../common/js/events.js'



/**
* RENDER_MEDIA_CONTROL
* Manages the widget's logic and appearance in client side
*/
export const render_media_control = function() {

	return true
}//end render_media_control



/**
* LIST
* Creates the nodes of current widget.
* The created wrapper will be append to the widget body in area_maintenance
* @param object options
* Sample:
* {
*	render_level : "full"
*	render_mode : "list"
* }
* @return HTMLElement wrapper
* 	To append to the widget body node (area_maintenance)
*/
render_media_control.prototype.list = async function(options) {

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
* @param object self
* @return HTMLElement content_data
*/
const get_content_data_edit = async function(self) {

	// short vars
		const value = self.value || {}

	// content_data
		const content_data = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'media_control_content'
		})

	// status block
		build_status_block(value, content_data)

	// mode selector (root user only)
		build_mode_selector(self, value, content_data)

	// rebuild media index
		build_rebuild_block(self, value, content_data)

	// refresh button
		const button_refresh = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'light button_refresh',
			inner_html		: get_label.refresh || 'Refresh',
			parent			: content_data
		})
		button_refresh.addEventListener('click', async (e) => {
			e.stopPropagation()
			content_data.classList.add('lock')
			try {
				self.value = await self.get_value()
			} catch (error) {
				console.error(error)
			}
			dd_request_idle_callback(
				() => {
					self.refresh({
						build_autoload	: false, // value is already updated
						destroy			: true
					})
				}
			)
		})

	// body_response (action results)
		ui.create_dom_element({
			element_type	: 'pre',
			class_name		: 'body_response',
			parent			: content_data
		})


	return content_data
}//end get_content_data_edit



/**
* BUILD_STATUS_BLOCK
* Configuration and runtime status rows
* @param object value
* @param HTMLElement parent
* @return HTMLElement status_block
*/
const build_status_block = function(value, parent) {

	const status_block = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'media_control_status',
		parent			: parent
	})

	// row helper. label is fixed widget text; row_value goes in as
	// textContent (SEC-XSS: server strings are never parsed as HTML)
	const add_row = (label, row_value, class_name='') => {
		const row = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'media_control_row',
			parent			: status_block
		})
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'media_control_label',
			inner_html		: label,
			parent			: row
		})
		const value_node = ui.create_dom_element({
			element_type	: 'span',
			class_name		: ('media_control_value ' + class_name).trim(),
			parent			: row
		})
		value_node.textContent = row_value
		return row
	}

	// mode
		const mode			= value.mode===false ? 'off' : (value.mode || 'unknown')
		const mode_class	= value.mode===false
			? 'mode_off'
			: (value.mode==='publication' ? 'mode_publication' : 'mode_private')
		add_row('Mode', mode, mode_class)
		add_row('Mode source', value.mode_source || 'unknown')
		if (value.mode===false) {
			add_row('Warning', 'Media files are world-readable (no access control)', 'warning_text')
		}

	// auth cookie
		add_row('Auth cookie', value.cookie_name || 'dedalo_media_auth')

	// media path + marker store
		add_row('Media path', value.media_path || 'unknown')
		const markers = value.markers || {}
		add_row('Marker store', markers.base_exists
			? `OK (${markers.pub_count ?? 0} published record markers, ${markers.auth_count ?? 0} auth markers)`
			: 'Not created yet (created at first login / publication)',
			markers.base_exists ? '' : 'warning_text'
		)

	// .htaccess (Apache gate)
		const htaccess = value.htaccess || {}
		const htaccess_status = !htaccess.exists
			? 'Missing (generated at next login)'
			: (htaccess.up_to_date===false
				? 'Outdated (regenerated at next login)'
				: 'OK')
		add_row('Apache .htaccess', htaccess_status, htaccess.exists && htaccess.up_to_date!==false ? '' : 'warning_text')

	// public qualities (publication mode)
		if (value.mode==='publication') {
			const qualities = value.public_qualities || []
			add_row('Public qualities', qualities.length
				? qualities.join(', ')
				: 'None (anonymous users cannot read any media)',
				qualities.length ? '' : 'warning_text'
			)
		}

	// diffusion engine (markers writer)
		const engine = value.engine || {}
		const engine_status = !engine.reachable
			? 'Unreachable — publication markers are frozen until it is back'
			: (engine.media_index_enabled!==true
				? 'Reachable, but DEDALO_MEDIA_PATH is NOT set in its .env — markers are not maintained'
				: `OK (${engine.pub_markers ?? 0} markers, ${(engine.databases || []).length} publication database dir(s))`)
		add_row('Diffusion engine', engine_status, engine.reachable && engine.media_index_enabled===true ? '' : 'warning_text')


	return status_block
}//end build_status_block



/**
* BUILD_MODE_SELECTOR
* Mode change control (root user only)
* @param object self
* @param object value
* @param HTMLElement parent
* @return HTMLElement|null
*/
const build_mode_selector = function(self, value, parent) {

	if (value.is_root!==true) {
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'media_control_note',
			inner_html		: 'Only the root user can change the media access mode.',
			parent			: parent
		})
		return null
	}

	const selector_block = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'media_control_selector',
		parent			: parent
	})

	ui.create_dom_element({
		element_type	: 'span',
		class_name		: 'media_control_label',
		inner_html		: 'Change mode',
		parent			: selector_block
	})

	// select options. 'config' removes the override and falls back to the
	// config.php value
	const current = value.custom_override===null
		? 'config'
		: (value.custom_override===false ? 'off' : value.custom_override)
	const select = ui.create_dom_element({
		element_type	: 'select',
		class_name		: 'media_control_mode_select',
		parent			: selector_block
	})
	const config_mode_label = value.config_mode===false || value.config_mode===null
		? (value.legacy_protect===true ? 'private (legacy constant)' : 'off')
		: value.config_mode
	const ar_options = [
		{ value: 'config',		label: `Use config file value (${config_mode_label})` },
		{ value: 'off',			label: 'Off — no protection (media is world-readable)' },
		{ value: 'private',		label: 'Private — only logged-in users' },
		{ value: 'publication',	label: 'Publication — anonymous users read published media only' }
	]
	for (const option of ar_options) {
		const option_node = ui.create_dom_element({
			element_type	: 'option',
			inner_html		: option.label,
			parent			: select
		})
		option_node.value = option.value
		if (option.value===current) {
			option_node.selected = true
		}
	}

	// apply button
	const button_apply = ui.create_dom_element({
		element_type	: 'button',
		class_name		: 'light button_apply',
		inner_html		: get_label.apply || 'Apply',
		parent			: selector_block
	})
	button_apply.addEventListener('click', async (e) => {
		e.stopPropagation()

		const new_value = select.value
		if (!confirm(`Change media access mode to '${new_value}'?\nThe media .htaccess is regenerated immediately.`)) {
			return
		}

		const body_response = parent.querySelector('.body_response')
		parent.classList.add('lock')
		const spinner = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'spinner'
		})
		selector_block.appendChild(spinner)

		const api_response = await self.set_media_access_mode(new_value)

		spinner.remove()
		parent.classList.remove('lock')

		// SEC-XSS: textContent prevents any HTML parsing of api_response.msg
		if (body_response) {
			body_response.textContent = api_response.msg || (api_response.result ? 'Done' : 'Unknown error')
		}

		if (api_response.result===true) {
			// reload value and re-render the widget body
			try {
				self.value = await self.get_value()
			} catch (error) {
				console.error(error)
			}
			dd_request_idle_callback(
				() => {
					self.refresh({
						build_autoload	: false,
						destroy			: true
					})
				}
			)
			alert(api_response.msg)
		}else{
			alert('Error! \n' + (api_response.msg || 'Unknown error'))
		}
	})


	return selector_block
}//end build_mode_selector



/**
* BUILD_REBUILD_BLOCK
* Full resync of the publication markers from the publication databases
* @param object self
* @param object value
* @param HTMLElement parent
* @return HTMLElement rebuild_block
*/
const build_rebuild_block = function(self, value, parent) {

	const rebuild_block = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'media_control_rebuild',
		parent			: parent
	})

	const button_rebuild = ui.create_dom_element({
		element_type	: 'button',
		class_name		: 'light button_rebuild',
		inner_html		: 'Rebuild media index',
		parent			: rebuild_block
	})
	ui.create_dom_element({
		element_type	: 'span',
		class_name		: 'media_control_note',
		inner_html		: 'Resyncs the publication markers from the publication databases (run once when enabling publication mode, or to repair drift). It can take a while on large instances.',
		parent			: rebuild_block
	})

	button_rebuild.addEventListener('click', async (e) => {
		e.stopPropagation()

		if (!confirm((get_label.sure || 'Sure?') + '\nRebuild the media publication markers from the publication databases?')) {
			return
		}

		const body_response = parent.querySelector('.body_response')
		parent.classList.add('lock')
		const spinner = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'spinner'
		})
		rebuild_block.appendChild(spinner)

		const api_response = await self.rebuild_media_index()

		spinner.remove()
		parent.classList.remove('lock')

		// SEC-XSS: textContent prevents any HTML parsing of server strings
		if (body_response) {
			const summary = {
				result	: api_response.result===true,
				msg		: api_response.msg || null,
				markers	: api_response.markers ?? null,
				targets	: api_response.targets ?? null,
				errors	: api_response.errors || []
			}
			body_response.textContent = JSON.stringify(summary, null, 2)
		}

		if (api_response.result===true) {
			// reload value (marker counts changed)
			try {
				self.value = await self.get_value()
			} catch (error) {
				console.error(error)
			}
			dd_request_idle_callback(
				() => {
					self.refresh({
						build_autoload	: false,
						destroy			: true
					})
				}
			)
		}else{
			alert('Error! \n' + (api_response.msg || 'Unknown error'))
		}
	})


	return rebuild_block
}//end build_rebuild_block



// @license-end
