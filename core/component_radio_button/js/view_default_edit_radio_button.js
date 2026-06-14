// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {
		get_content_data_edit,
		get_buttons
	} from './render_edit_component_radio_button.js'



/**
* VIEW_DEFAULT_EDIT_RADIO_BUTTON
* Default edit-mode view for component_radio_button.
*
* Renders the standard radio-button editor: a content_data region that lists
* every datalist option as an <input type="radio"> element (or, for read-only
* sessions, plain text nodes), plus an optional button bar when permissions > 1.
*
* This namespace object acts as a static factory — all logic lives in its
* `render` static method; the constructor itself is a no-op that simply returns
* true so that the symbol can be imported and its static methods called without
* instantiation.
*
* Used by render_edit_component_radio_button.prototype.edit for the 'default'
* and 'print' context.view values.  The 'print' case forces permissions to 1
* upstream (in render_edit), so this view automatically renders read-only output
* when invoked from that path without needing to branch here.
*
* Exports:
*   view_default_edit_radio_button        — static namespace (constructor is no-op)
*   view_default_edit_radio_button.render — async factory that returns the wrapper HTMLElement
*/
export const view_default_edit_radio_button = function() {

	return true
}//end view_default_edit_radio_button



/**
* RENDER
* Build and return the full edit-mode DOM subtree for this view.
*
* Two render levels are supported, controlled by options.render_level:
*   'content' — return only the content_data element (used for lightweight
*               partial refreshes, e.g. after a programmatic value change).
*   'full'    — (default) return the complete wrapper element that includes
*               content_data and, when permissions > 1, the button bar.
*
* The returned wrapper carries a `content_data` property pointer so callers
* can locate the inner content node without querying the DOM by class name.
*
* Button bar is omitted entirely (null) for read-only instances (permissions ≤ 1),
* which prevents non-editors from seeing the list-open and reset buttons.
*
* @param {Object} self    - Component instance (component_radio_button); must have
*                           self.data, self.context, self.permissions, self.show_interface.
* @param {Object} options - Render options.
*   @param {string} [options.render_level='full'] - 'content' | 'full'
* @returns {Promise<HTMLElement>} Resolves to the wrapper element (render_level 'full')
*   or the content_data element (render_level 'content').
*/
view_default_edit_radio_button.render = async function(self, options) {

	// render_level
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = get_content_data_edit(self)
		if (render_level==='content') {
			return content_data
		}

	// buttons
		const buttons = (self.permissions > 1)
			? get_buttons(self)
			: null

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_edit(self, {
			content_data	: content_data,
			buttons			: buttons
		})
		// set pointers
		wrapper.content_data = content_data


	return wrapper
}//end render



// @license-end
