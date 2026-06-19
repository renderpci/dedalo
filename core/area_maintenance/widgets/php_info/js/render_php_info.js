// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



/**
* RENDER_PHP_INFO
* Client-side renderer for the php_info area-maintenance widget.
*
* This module provides the DOM-building logic that surfaces the PHP server's
* `phpinfo()` output inside the Dédalo UI.  The output is embedded in a
* sandboxed `<iframe>` whose `src` is deliberately not set at construction time;
* instead, loading is deferred until `php_info.prototype.load()` is called by
* area_maintenance when the user first opens the widget panel.  This avoids
* fetching the heavy phpinfo page on every page load.
*
* Deferred-load contract:
*   1. `list()` calls `get_content_data_edit()`, which creates the `<iframe>`
*      element and attaches an `activate()` closure on `self`.
*   2. `activate()` sets `content_data.src = src` exactly once (guarded by
*      `self._activated`), triggering the browser to load the phpinfo endpoint.
*   3. `php_info.prototype.load()` sets `self._open = true` and calls
*      `self.activate()`.  If `load()` fires before `list()` has run (rare
*      race condition), the `activate` function will not yet exist, so
*      `php_info.prototype.load()` guards with `typeof this.activate==='function'`.
*   4. If, conversely, the panel is already open when `list()` runs (e.g. after
*      a re-render triggered by a data refresh), `self._open` is truthy and
*      `activate()` is called immediately at the end of `get_content_data_edit`.
*
* The server peer (`php_info.php`) protects the endpoint with `login::is_logged()`
* and injects a small inline `<script>` that auto-resizes the iframe to match
* the phpinfo document height via `window.parent.document.querySelector`.
*
* The CSS class `php_info_iframe` is defined in
* `core/area_maintenance/widgets/php_info/css/php_info.less`.
*
* Peers:
*   php_info.js               — widget constructor + lifecycle wiring
*   php_info.php              — server endpoint (phpinfo + auth guard)
*   ui.js (ui.widget)         — `build_wrapper_edit`, `create_dom_element`
*
* Exports:
*   render_php_info — constructor (function); used exclusively via prototype
*                     assignment in php_info.js.
*/



// imports
	import {ui} from '../../../../common/js/ui.js'


/**
* RENDER_PHP_INFO
* No-op constructor for the render prototype carrier.
*
* All render logic is attached to `render_php_info.prototype` and then
* assigned onto `php_info.prototype` in `php_info.js`.  The constructor
* itself is never instantiated directly — it exists only to hold the
* prototype methods that the widget mixes in.
*
* @returns {boolean} true — always (has no other meaningful return value).
*/
export const render_php_info = function() {

	return true
}//end render_php_info



/**
* LIST
* Creates the nodes of current widget.
* The created wrapper will be append to the widget body in area_maintenance
* @param {Object} options
* 	Sample:
* 	{
*		render_level : "full"
*		render_mode : "list"
*   }
* @returns {HTMLElement} wrapper
* 	To append to the widget body node (area_maintenance)
*/
render_php_info.prototype.list = async function(options) {

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
* Builds the `<iframe>` element that will host the phpinfo output and wires
* up the deferred-load mechanism on `self`.
*
* The `src` attribute is intentionally NOT set here.  Instead an `activate()`
* closure is attached to `self`.  When area_maintenance opens the panel it
* calls `php_info.prototype.load()`, which in turn calls `self.activate()`.
* `activate()` guards against double-execution with `self._activated` so that
* repeated calls (e.g. panel close/reopen) do not reload the heavy phpinfo
* page.
*
* The iframe's CSS class `php_info_iframe` is used by the inline script in
* `php_info.php` to locate the element from `window.parent` and auto-resize
* its height to match the phpinfo document's scroll height.
*
* Data shape of `self.value`:
*   {
*     src : {string} — absolute URL to `php_info.php`; supplied by the
*                       server via `widget_common.prototype.build()`.
*   }
*
* @param {Object} self - The `php_info` widget instance.
* @param {Object} [self.value] - Widget value object supplied by the server.
* @param {string} [self.value.src] - URL of the phpinfo endpoint to load.
* @param {boolean} [self._open] - Set to `true` by `php_info.prototype.load()`
*   when the panel is opened; checked here to handle the rare case where the
*   widget is re-rendered while the panel is already open.
* @returns {HTMLElement} content_data - The `<iframe>` element (src not yet set).
*/
const get_content_data_edit = async function(self) {

	// short vars
		const value	= self.value || {}
		const src	= value.src || ''

	// content_data
		const content_data = ui.create_dom_element({
			element_type	: 'iframe',
			class_name		: 'php_info_iframe'
		})

	// defer the heavy iframe load until the widget is opened (host calls load())
		self._activated = false
		self.activate = () => {
			if (self._activated) { return }
			self._activated = true
			content_data.src = src
		}
		// if the widget is already open (e.g. after a refresh), load now
		if (self._open) {
			self.activate()
		}


	return content_data
}//end get_content_data_edit


// @license-end
