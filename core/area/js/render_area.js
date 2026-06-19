// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {set_element_css} from '../../page/js/css.js'
	import {build_dashboard} from '../../area_common/js/dashboard.js'



/**
* RENDER_AREA
* Client-side render factory for the `area` model.
*
* This module is the visual counterpart of `class.area.php` and `area.js`:
* it provides the `edit` and `list` render methods that `area.js` mixes into
* the `area` prototype via direct prototype assignment
* (`area.prototype.edit = render_area.prototype.edit`).
*
* Responsibilities:
* - Build the top-level wrapper element via `ui.area.build_wrapper_edit`.
* - Inject dashboard KPI/chart widgets when the server payload includes
*   `data.dashboard` (provided by `area_common::get_dashboard_data()`).
* - Apply ontology-defined CSS rules (`context.css`) and optional extra
*   classes (`context.css.add_class`) to wrapper and content_data nodes.
*
* The constructor is a no-op (returns true); all behaviour lives on the prototype.
*
* Exported symbols:
*   render_area — constructor; prototype carries `edit` and `list`.
*/
export const render_area = function() {

	return true
}//end render_area



/**
* EDIT
* Render node for use in edit mode.
*
* Builds the full area wrapper including label, content_data, and any
* ontology-configured CSS. When `render_level` is `'content'` only the
* inner `content_data` node is returned (used by partial refreshes that
* reuse an existing wrapper).
*
* CSS application order:
*   1. `set_element_css` injects rules for the scoped selector
*      `<section_tipo>_<tipo>.edit` into the shared dynamic stylesheet.
*   2. `context.css.add_class` iterates its keys ('wrapper' | 'content_data')
*      and pushes the corresponding class names onto the DOM element — this is
*      handled here as well as inside `ui.area.build_wrapper_edit` (both paths
*      coexist for historical reasons; neither causes harm when duplicated).
*
* @param {Object} options
* @param {string} [options.render_level='full'] - Depth of render:
*   'full'    → return the complete wrapper element (default).
*   'content' → return only the content_data node (for partial refresh).
* @returns {Promise<HTMLElement>} The wrapper element (full) or content_data node (content).
*/
render_area.prototype.edit = async function(options) {

	const self = this

	const render_level = options.render_level || 'full'

	// content_data
		const content_data = get_content_data(self)
		if (render_level==='content') {
			return content_data
		}

	// buttons
		// const current_buttons = await buttons(self);

	// wrapper. ui build_edit returns component wrapper
		const wrapper =	ui.area.build_wrapper_edit(self, {
			content_data : content_data
			// buttons 	 : current_buttons
		})

	// css v6
		// Apply ontology-defined CSS when context.css is present.
		// set_element_css handles stylesheet injection; the add_class block below
		// handles class mutations on the actual DOM nodes (a different mechanism).
		if (self.context.css) {
			const selector = `${self.section_tipo}_${self.tipo}.edit`
			set_element_css(selector, self.context.css)
			// add_class
				// Ontology may specify extra CSS classes to apply directly to
				// named child elements. Supported targets: 'wrapper', 'content_data'.
				// Any unknown key is logged as a warning and skipped.
				// sample
				// "add_class": {
				// "wrapper": [
				// 	"bg_warning"
				// ]
				// }
				if (self.context.css.add_class) {

					for(const selector in self.context.css.add_class) {
						const values = self.context.css.add_class[selector]
						// Resolve the logical selector name to the matching live DOM element.
						const element = selector==='wrapper'
							? wrapper
							: selector==='content_data'
								? content_data
								: null

						if (element) {
							element.classList.add(values)
						}else{
							console.warn("Invalid css class selector was ignored:", selector);
						}
					}
				}
		}


	return wrapper
}//end edit



/**
* LIST
* Alias of edit.
*
* Area list views use the same layout as the edit view. This method exists
* so that callers following the standard `render_level` pattern (which always
* calls `instance[mode]()`) receive the correct render without special-casing
* the `area` model.
*
* @param {Object} [options={render_level:'full'}]
* @param {string} [options.render_level='full'] - Passed through to `edit`.
* @returns {Promise<HTMLElement>}
*/
render_area.prototype.list = async function(options={render_level:'full'}) {

	return this.edit(options)
}//end list



/**
* GET_CONTENT_DATA
* Build and return the content_data container node for an area instance.
*
* When the server JSON controller appended a `dashboard` key to
* `self.data` (via `area_common::get_dashboard_data()`), the shared
* dashboard renderer (`build_dashboard`) is called and its output is
* appended inside the container. Otherwise the container is returned
* empty, preserving space for future widget injection.
*
* This function is module-private (not exported). It is called exclusively
* from `render_area.prototype.edit`.
*
* The `content_data` element receives two CSS classes:
*   - `'content_data'`  — shared layout hook used across all Dédalo instances.
*   - `self.type`       — the model family name (always `'area'` for this module),
*                         enabling per-type LESS overrides.
*
* @param {Object} self - The area instance. Expected properties:
*   - `{string} self.type`              — model family (e.g. `'area'`).
*   - `{Object|undefined} self.data`    — server data payload.
*   - `{Object|undefined} self.data.dashboard` — optional dashboard blob from
*       `area_common::get_dashboard_data()`.
* @returns {HTMLElement} content_data - The populated (or empty) container div.
*/
const get_content_data = function(self) {

	// content_data
	const content_data = document.createElement('div')
		  content_data.classList.add('content_data', self.type)

	// dashboard. Injected when the area JSON controller returned dashboard data.
	const dashboard_data = self.data && self.data.dashboard
	if (dashboard_data) {
		const dashboard_node = build_dashboard(self, dashboard_data)
		content_data.appendChild(dashboard_node)
	}


	return content_data
}//end get_content_data



// @license-end
