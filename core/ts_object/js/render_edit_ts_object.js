// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*eslint no-undef: "error"*/



// imports
	import {view_default_edit_ts_object} from './view_default_edit_ts_object.js'



/**
* RENDER_EDIT_TS_OBJECT
* View-mode router for thesaurus-object edit rendering.
*
* This constructor acts as a prototype provider for the `ts_object` class.
* Its methods are mixed into every `ts_object` instance via prototype assignment
* in ts_object.js:
*
*   ts_object.prototype.edit   = render_edit_ts_object.prototype.edit
*   ts_object.prototype.search = render_edit_ts_object.prototype.edit
*
* The constructor itself is a no-op placeholder (returns true); no instances of
* this class are created directly — only its prototype methods are used.
*
* Supported views (controlled by `self.view` on the ts_object instance):
*   - 'default' — delegates to view_default_edit_ts_object.render()
*
* @see view_default_edit_ts_object for the full DOM build pipeline
* @see ts_object.js for prototype assignment and the ts_object constructor
*/
export const render_edit_ts_object = function() {

	return true
}//end render_edit_ts_object



/**
* EDIT
* Dispatch rendering to the appropriate view implementation for a ts_object node.
*
* Called as `ts_object.prototype.edit` (and also aliased to `.search`) so `this`
* is the live `ts_object` instance. The method reads `self.view` from the instance
* to select the correct view module — currently only 'default' is defined.
*
* The view module (`view_default_edit_ts_object`) builds the complete wrapper DOM
* hierarchy: content_data div, id_column, elements_container, ts_line, data_container,
* indexations_container, and (for descriptors) nd_container and children_container.
*
* When `options.render_level === 'content'` the view returns only the content_data
* sub-tree instead of the full wrapper (used by ts_object.refresh() for in-place
* content updates without rebuilding the outer wrapper).
*
* @param {Object} options - Render options forwarded unchanged to the view
* @param {string} [options.render_level='full'] - 'full' returns the outer wrapper;
*   'content' returns only the inner content_data element
* @returns {Promise<HTMLElement>} Resolves to the wrapper element ('full') or the
*   content_data element ('content') built by the selected view
*/
render_edit_ts_object.prototype.edit = async function(options) {

	const self = this

	// view
	// Reads self.view set during init(); falls back to 'default' when not specified.
	const view	= self.view || 'default'

	switch(view) {

		case 'default':
		default:
			return view_default_edit_ts_object.render(self, options)
	}
}//end edit



// @license-end
