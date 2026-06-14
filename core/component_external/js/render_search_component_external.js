// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



/**
* RENDER_SEARCH_COMPONENT_EXTERNAL
* Client-side search renderer for component_external.
*
* Provides the search-mode DOM for external-API components inside Dédalo's
* search bar / filter builder. Because component_external resolves its display
* value from a remote HTTP endpoint on the server side (via `api_config` and
* `fields_map`), the search form only needs two simple controls:
*
*   1. A `q_operator` text input — the comparison operator token forwarded to
*      the server (e.g. "=" / "LIKE" / "~"). The user types it freehand; the
*      value is stored directly on `self.data.q_operator`.
*
*   2. A single `value` text input bound to the first element of
*      `data.entries`. User input is written back to `self.data.entries[0]`
*      and the global `change_search_element` event is published so the
*      surrounding search bar redraws.
*
* When `render_level === 'content'` (partial-refresh path) only the
* `content_data` subtree is returned without the outer `wrapper_component`
* shell, consistent with the convention used by all Dédalo search renderers.
*
* Mounted by `component_external.js` via prototype assignment:
*   `component_external.prototype.search = render_search_component_external.prototype.search`
*
* Compared with search renderers for richer components (e.g.
* `render_search_component_email.js`), this renderer is intentionally minimal:
* external data is read-only and the SQO filter is a plain string match, so no
* per-entry addition/removal or format validation is needed.
*
* Data shape consumed (`self.data` in search mode):
*   `{ q_operator: string|null, entries: [string|null] }`
*
* Exports: `render_search_component_external` (constructor / prototype carrier).
*
* @module render_search_component_external
* @see component_external.js          Prototype assignment and component descriptor.
* @see class.component_external.php   Server-side API fetch, fields_map, SQO handling.
* @see event_manager                  Pub/sub bus; `change_search_element` triggers
*                                     search-bar refresh for all subscribers.
* @see ui.component.build_wrapper_search  Outer wrapper builder used by `search()`.
*/

// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_SEARCH_COMPONENT_EXTERNAL
* Constructor function (no-op body; methods live on the prototype).
* Mixed into `component_external` via prototype assignment in `component_external.js`.
* @returns {boolean} true — satisfies the call-as-constructor contract.
*/
export const render_search_component_external = function() {

	return true
}//end render_search_component_external



/**
* SEARCH
* Render node for use in search.
*
* Entry point called by the component lifecycle when `mode === 'search'`.
* Builds the `content_data` subtree (q_operator input + value input via
* `get_content_data`), then wraps it in `ui.component.build_wrapper_search`
* unless `render_level` is `'content'`, in which case only `content_data` is
* returned (used when the caller needs to replace the inner DOM without
* rebuilding the full wrapper — e.g. after a preset is applied).
*
* The returned `wrapper` exposes `wrapper.content_data` as a direct property
* so callers can access the inner node without an additional DOM query.
*
* @param {Object} options - Render configuration object.
* @param {string} [options.render_level='full'] - Pass `'content'` to return
*   only the `content_data` node (partial refresh); omit or pass `'full'` for
*   the complete component wrapper.
* @returns {Promise<HTMLElement>} `wrapper_component` element (full render) or
*   `content_data` element (content-only render).
*/
render_search_component_external.prototype.search = async function(options) {

	const self = this

	// render_level
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = get_content_data(self)
		if (render_level==='content') {
			return content_data
		}

	// ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_search(self, {
			content_data : content_data
		})
		// set pointers
		wrapper.content_data = content_data

	return wrapper
}//end search



/**
* GET_CONTENT_DATA
* Build the search content area: a `q_operator` input followed by a single
* free-text `value` input bound to `data.entries[0]`.
*
* Unlike multi-entry search renderers (e.g. `render_search_component_email`),
* this function renders exactly one value input because component_external
* supports only a single search term — the remote API is queried with a plain
* string filter and does not support multi-value OR queries from the client.
*
* Operator input behaviour:
*   - Bound to the `change` DOM event.
*   - On change: writes `self.data.q_operator` (null when the field is
*     cleared) then publishes `change_search_element` so the search bar
*     header and any other subscribers redraw.
*
* Value input behaviour:
*   - Pre-populated from `data.entries[0]`; falls back to `''` when no entry
*     exists yet (e.g. a freshly added search filter).
*   - On change: writes `self.data.entries` as a new single-element array
*     (`[value]` or `[null]` when cleared), then publishes
*     `change_search_element`.
*   - (!) The handler replaces the entire `entries` array rather than updating
*     the element in place. This is safe here because the component only ever
*     holds one entry, but callers must not assume the previous array reference
*     remains valid after a user edit.
*
* Note: `self.data.q_operator` is read directly (not via the `data` alias
* produced at the top of this function). Both point to the same object, so
* there is no functional difference, but this is a minor inconsistency worth
* noting when tracing the data-flow.
*
* @param {Object} self - The component instance (`component_external`).
* @returns {HTMLElement} `content_data` div populated with the two inputs.
*/
const get_content_data = function(self) {

	// short vars
		const data = self.data || {}

	// content_data
		const content_data = ui.component.build_content_data(self)

	// q operator (search only)
		// (!) reads self.data.q_operator directly rather than the `data` alias above
		const q_operator = self.data.q_operator
		const input_q_operator = ui.create_dom_element({
			element_type	: 'input',
			type			: 'text',
			value			: q_operator,
			class_name		: 'q_operator',
			parent			: content_data
		})
		input_q_operator.addEventListener('change',function () {
			// value
				const value = (input_q_operator.value.length>0) ? input_q_operator.value : null
			// q_operator. Fix the data in the instance previous to save
				self.data.q_operator = value
			// publish search. Event to update the DOM elements of the instance
				event_manager.publish('change_search_element', self)
		})

	// value — first (and only) entry in the entries array
		const value = data.entries[0] || ''
		const input_value = ui.create_dom_element({
			element_type	: 'input',
			type			: 'text',
			value			: value,
			class_name		: 'value',
			parent			: content_data
		})
		input_value.addEventListener('change',function () {
			// value
				const value = (input_value.value.length>0) ? input_value.value : null
			// value. Fix the data in the instance previous to save
				// (!) replaces the full entries array; the previous array reference is no longer valid
				self.data.entries = [value]
			// publish search. Event to update the DOM elements of the instance
				event_manager.publish('change_search_element', self)
		})


	return content_data
}//end get_content_data



// @license-end
