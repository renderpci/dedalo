// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../../common/js/ui.js'
	import {dd_request_idle_callback} from '../../../../common/js/events.js'



/**
* RENDER_MEDIA_CONTROL
* Client-side view layer for the media_control area_maintenance widget.
*
* This module builds all DOM for the widget from the `value` snapshot that the
* PHP class (class.media_control.php) returns via `get_value`. It is the
* companion of media_control.js, which owns the constructor, prototype wiring,
* and the two API-request methods (`set_media_access_mode`, `rebuild_media_index`).
*
* Widget value shape (set on `self.value` by area_maintenance::get_value):
*   {
*     mode             : string|false|null  // effective access mode: 'private'|'publication'|false(=off)|null(=unknown)
*     mode_source      : string             // human-readable origin of the effective mode (config.php constant name)
*     custom_override  : string|false|null  // DEDALO_MEDIA_ACCESS_MODE_CUSTOM; null = no override written yet
*     config_mode      : string|false|null  // DEDALO_MEDIA_ACCESS_MODE constant (may be absent)
*     legacy_protect   : boolean|null       // DEDALO_PROTECT_MEDIA_FILES (old constant, deprecated)
*     cookie_name      : string             // media auth cookie name (default: 'dedalo_media_auth')
*     public_qualities : Array<string>      // quality tokens visible to anonymous users in publication mode
*     media_path       : string             // absolute filesystem path to the media directory
*     htaccess         : { exists: boolean, up_to_date: boolean }  // Apache gate status
*     markers          : { base_exists: boolean, pub_count: number|null, auth_count: number|null }
*     engine           : { reachable: boolean, media_index_enabled: boolean|null,
*                          pub_markers: number|null, databases: Array<string>, msg: string|null }
*     is_root          : boolean            // true when the logged user is DEDALO_SUPERUSER
*   }
*
* All private helpers (get_content_data_edit, build_status_block,
* build_mode_selector, build_rebuild_block) are module-scope constants —
* not exported, not prototype members.
*
* Entry point: render_media_control.prototype.list (assigned to both `.edit`
* and `.list` on the media_control instance by media_control.js).
*/



/**
* RENDER_MEDIA_CONTROL
* Constructor stub for the render module. Exists solely to anchor the
* prototype method `list`, which media_control.js assigns to both `.edit`
* and `.list` on the main media_control instance (prototype-mixin pattern
* used throughout Dédalo area_maintenance widgets).
* The constructor itself performs no work.
*/
export const render_media_control = function() {

	return true
}//end render_media_control



/**
* LIST
* Entry point for both 'edit' and 'list' render modes (media_control.js
* assigns this prototype method to both `.edit` and `.list`). Builds the
* full widget DOM from the pre-loaded `self.value` snapshot.
*
* When `options.render_level` is 'content' the function returns the inner
* content_data node directly, bypassing the outer wrapper shell. This is the
* fast-path used when reloading only the widget body (e.g. after a mode change
* or index rebuild).
*
* @param {Object} options - render options forwarded by widget_common
* @param {string} [options.render_level='full'] - 'full' = wrapper+content; 'content' = content only
* @returns {Promise<HTMLElement>} wrapper (render_level 'full') or content_data (render_level 'content')
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
* Assembles the full widget content node from the current `self.value` snapshot.
* Delegates each visual region to a dedicated build_* helper so this function
* stays a structural overview.
*
* Layout order (top to bottom):
*   1. Status block      — effective mode, cookie name, media path, .htaccess and
*                          marker store health, diffusion engine reachability.
*   2. Mode selector     — <select> + Apply button (root user only; non-root sees a note).
*   3. Rebuild block     — "Rebuild media index" button + explanatory note.
*   4. Refresh button    — re-fetches value from the server without a full page reload.
*   5. body_response     — <pre> element updated after each API call with a JSON summary.
*
* The returned node is detached from the document; the caller (list) attaches
* it inside the wrapper produced by ui.widget.build_wrapper_edit.
*
* @param {Object} self - the media_control widget instance (carries self.value)
* @returns {Promise<HTMLElement>} the populated content_data div
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

	// refresh button (footer action: re-reads status from the server)
		const footer = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'media_control_footer',
			parent			: content_data
		})
		const button_refresh = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'light button_refresh',
			inner_html		: get_label.refresh || 'Refresh',
			parent			: footer
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
* Renders a two-column key/value panel showing the complete runtime status of
* the media access control system.
*
* Source: the top-level fields of the `value` snapshot (mode, markers, htaccess,
* engine). PHP populates these in class.media_control.php::get_value().
*
* Rows rendered (in order):
*   - Mode            — effective access mode string or 'off'/'unknown', with a
*                       CSS class (`mode_off`, `mode_private`, `mode_publication`)
*                       for colour coding.
*   - Mode source     — which config constant determines the effective mode.
*   - Warning         — shown only when mode===false (world-readable); flagged as a
*                       `state_danger` chip (real security exposure).
*   - Auth cookie     — cookie name used by media_protection (default: 'dedalo_media_auth').
*   - Media path      — absolute filesystem path to the media directory.
*   - Marker store    — whether the `.publication/` directory tree exists and how many
*                       pub/auth marker files are present (created at first login /
*                       first publication if absent).
*   - Apache .htaccess — presence and freshness of the media gate file
*                        (auto-generated / auto-updated at next login when stale or missing).
*   - Public qualities — comma-separated quality tokens visible to anonymous users
*                        (shown only in 'publication' mode).
*   - Diffusion engine — Bun engine reachability + DEDALO_MEDIA_PATH configuration check.
*                        Stale markers are flagged when the engine is unreachable or has
*                        DEDALO_MEDIA_PATH unset.
*
* The inner `add_row` closure uses `inner_html` for the trusted label and `.textContent`
* for the server-sourced value — this prevents XSS if a path or mode string ever
* contains HTML-significant characters (SEC-XSS guard).
*
* @param {Object}      value  - the full widget value snapshot (see module header)
* @param {HTMLElement} parent - container to append the status block to
* @returns {HTMLElement} the populated status_block div
*/
const build_status_block = function(value, parent) {

	const status_block = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'dd_readout',
		parent			: parent
	})

	// row helper. label is fixed widget text; row_value goes in as
	// textContent (SEC-XSS: server strings are never parsed as HTML).
	// class_name is a state token applied to the inner badge (.mc_v) so the
	// status chip hugs its own text instead of stretching the grid cell:
	//   'mono'                            machine string (path, cookie, constant)
	//   'mode_off'|'mode_private'|'mode_publication'   effective-mode pill
	//   'state_ok'|'state_warning'|'state_danger'      health chip
	const add_row = (label, row_value, class_name='') => {
		const row = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'dd_row',
			parent			: status_block
		})
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'dd_k',
			inner_html		: label,
			parent			: row
		})
		const value_node = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'dd_v',
			parent			: row
		})
		const value_badge = ui.create_dom_element({
			element_type	: 'span',
			class_name		: ('dd_badge ' + class_name).trim(),
			parent			: value_node
		})
		value_badge.textContent = row_value
		return row
	}

	// mode
		const mode			= value.mode===false ? 'off' : (value.mode || 'unknown')
		const mode_class	= value.mode===false
			? 'mode_off'
			: (value.mode==='publication' ? 'mode_publication' : 'mode_private')
		add_row('Mode', mode, mode_class)
		add_row('Mode source', value.mode_source || 'unknown', 'mono')
		if (value.mode===false) {
			// world-readable is a real security exposure, not a will-self-heal notice
			add_row('Warning', 'Media files are world-readable (no access control)', 'state_danger')
		}

	// auth cookie
		add_row('Auth cookie', value.cookie_name || 'dedalo_media_auth', 'mono')

	// media path + marker store
		add_row('Media path', value.media_path || 'unknown', 'mono')
		const markers = value.markers || {}
		add_row('Marker store', markers.base_exists
			? `OK (${markers.pub_count ?? 0} published record markers, ${markers.auth_count ?? 0} auth markers)`
			: 'Not created yet (created at first login / publication)',
			markers.base_exists ? 'state_ok' : 'state_warning'
		)

	// .htaccess (Apache gate)
		const htaccess = value.htaccess || {}
		const htaccess_status = !htaccess.exists
			? 'Missing (generated at next login)'
			: (htaccess.up_to_date===false
				? 'Outdated (regenerated at next login)'
				: 'OK')
		add_row('Apache .htaccess', htaccess_status, htaccess.exists && htaccess.up_to_date!==false ? 'state_ok' : 'state_warning')

	// public qualities (publication mode)
		if (value.mode==='publication') {
			const qualities = value.public_qualities || []
			add_row('Public qualities', qualities.length
				? qualities.join(', ')
				: 'None (anonymous users cannot read any media)',
				qualities.length ? 'state_ok' : 'state_warning'
			)
		}

	// diffusion engine (markers writer). unreachable freezes markers (danger);
	// reachable-but-misconfigured is a recoverable warning
		const engine = value.engine || {}
		const engine_status = !engine.reachable
			? 'Unreachable — publication markers are frozen until it is back'
			: (engine.media_index_enabled!==true
				? 'Reachable, but DEDALO_MEDIA_PATH is NOT set in its .env — markers are not maintained'
				: `OK (${engine.pub_markers ?? 0} markers, ${(engine.databases || []).length} publication database dir(s))`)
		const engine_class = !engine.reachable
			? 'state_danger'
			: (engine.media_index_enabled!==true ? 'state_warning' : 'state_ok')
		add_row('Diffusion engine', engine_status, engine_class)


	return status_block
}//end build_status_block



/**
* BUILD_MODE_SELECTOR
* Renders the mode-change control: a <select> listing the four available access
* modes plus an Apply button. Only the root user (DEDALO_SUPERUSER) can change
* the mode; all other users see an explanatory note and the function returns null.
*
* Available modes (mapped to DEDALO_MEDIA_ACCESS_MODE_CUSTOM by set_media_access_mode):
*   - 'config'      — remove the custom override; fall back to the config.php constant.
*   - 'off'         — no protection; media files are world-readable.
*   - 'private'     — only authenticated (logged-in) users can read media.
*   - 'publication' — anonymous users can read media in published qualities only.
*
* The selector is pre-selected to reflect the *current* custom override
* (`value.custom_override`): null maps to 'config', false maps to 'off',
* and a string value maps to itself.
*
* On Apply:
*   1. A `confirm()` dialog asks the operator to confirm the change.
*   2. `self.set_media_access_mode(new_value)` is called (media_control.js prototype).
*   3. On success the widget value is reloaded and the body re-rendered.
*   4. On failure an alert shows the error message from the API.
*
* The `body_response` <pre> element (sibling of this block in content_data) is
* updated via `.textContent` after every apply (SEC-XSS guard — api_response.msg
* is server-sourced).
*
* (!) alert() is used here for operator feedback — this is intentional in
* area_maintenance widgets and must not be changed to console.warn.
*
* @param {Object}      self   - the media_control widget instance
* @param {Object}      value  - the full widget value snapshot (see module header)
* @param {HTMLElement} parent - content_data node (also contains .body_response)
* @returns {HTMLElement|null} the selector_block div, or null for non-root users
*/
const build_mode_selector = function(self, value, parent) {

	if (value.is_root!==true) {
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'dd_note',
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
		class_name		: 'dd_eyebrow',
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
* Renders the "Rebuild media index" control: a button and an explanatory note.
*
* Purpose: triggers a full resync of the publication marker files from the
* publication databases by calling `self.rebuild_media_index()` (media_control.js
* prototype → PHP class.media_control.php::rebuild_media_index →
* dd_diffusion_api::rebuild_media_index). The operation walks all publication
* database records in PHP and instructs the Bun engine to write a marker file
* for each published media item. It can take several minutes on large instances
* (media_control.js sets a 1-hour timeout on the API call).
*
* Typical use cases for triggering a rebuild:
*   - Switching to 'publication' mode for the first time on an existing instance
*     that already has published records.
*   - Repairing marker drift caused by a period of diffusion engine downtime.
*
* On success the widget value is reloaded (marker counts in the status block
* are updated). On failure an alert shows the server error message.
*
* The `body_response` <pre> element (sibling of this block in content_data) is
* updated with a structured JSON summary after every call:
*   { result, msg, markers, targets, errors }
* All output is written via `.textContent` (SEC-XSS guard).
*
* @param {Object}      self   - the media_control widget instance
* @param {Object}      value  - the full widget value snapshot (see module header, unused here)
* @param {HTMLElement} parent - content_data node (also contains .body_response)
* @returns {HTMLElement} the rebuild_block div
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
		class_name		: 'dd_note',
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
