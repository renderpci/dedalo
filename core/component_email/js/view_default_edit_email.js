// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {
		get_content_data,
		get_buttons
	} from './render_edit_component_email.js'



/**
* VIEW_DEFAULT_EDIT_EMAIL
* Namespace for the default edit view of component_email.
* This is the primary editing view used for both 'default' and 'print' render modes
* (the caller in render_edit_component_email.js sets self.permissions = 1 for print,
* which causes get_content_data to render read-only input elements instead of
* editable ones).
*
* Delegates all DOM construction to helpers imported from render_edit_component_email.js:
* - get_content_data  builds the input row(s) for each stored email address entry.
* - get_buttons       builds the action toolbar (add entry, bulk-email, tools).
*
* The constructor itself is a no-op stub; all functionality lives on the static
* render method assigned below.
*/
export const view_default_edit_email = function() {

	return true
}//end view_default_edit_email



/**
* RENDER
* Builds and returns the full component DOM node for the default edit view.
*
* Two render levels are supported via options.render_level:
*   'content' — returns only the content_data subtree (used when refreshing inner
*               content without rebuilding the outer wrapper, e.g. after a field change).
*   'full'    — returns the complete wrapper including the buttons toolbar.
*               This is the default when render_level is absent.
*
* Permissions gate: buttons are only built when self.permissions > 1 (edit/admin).
* Read-only users (permissions === 1) receive the wrapper without a buttons bar;
* the input elements themselves are also rendered as plain read-only divs via the
* get_content_data helper.
*
* Side effect: sets wrapper.content_data pointer so callers (and the component's
* self.node.content_data chain) can reach individual input rows by numeric index.
*
* @param {Object} self - component_email instance; must expose .permissions,
*                        .data.entries, .context, .lang, and .show_interface.
* @param {Object} options - render options.
* @param {string} [options.render_level='full'] - 'content' or 'full'.
* @returns {Promise<HTMLElement>} Resolves to either content_data (render_level='content')
*                                 or the full component wrapper element.
*/
view_default_edit_email.render = async function(self, options) {

	// render_level
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = get_content_data(self)
		if (render_level==='content') {
			return content_data
		}

	// buttons
		// Only built for users with edit permissions (permissions > 1).
		// Read-only users (permissions === 1) skip the toolbar entirely.
		const buttons = (self.permissions > 1)
			? get_buttons(self)
			: null

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_edit(self, {
			content_data	: content_data,
			buttons			: buttons
		})
		// set pointers
		// (!) wrapper.content_data mirrors self.node.content_data so other code
		// can reach individual input rows by index after this render returns.
		wrapper.content_data = content_data


	return wrapper
}//end render



// @license-end
