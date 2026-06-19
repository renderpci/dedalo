// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global  */
/*eslint no-undef: "error"*/

// imports
	import {ui} from '../../../core/common/js/ui.js'



/**
* RENDER_ERROR
* Builds and returns the fallback error UI for a tool instance whose init or
* build phase set `self.error`. Called by `tool_common.prototype.render` when
* `typeof self.error !== 'undefined'`, so the caller never receives a blank or
* broken tool panel — instead the user sees a styled message with an info icon
* and instructions to close and re-open the tool.
*
* When `options.render_level` is `'content'` only the inner `content_data` div
* is returned (used when composing tool panels that already have their own
* wrapper). For any other render level — including the default `'full'` — the
* div is wrapped with `ui.tool.build_wrapper_edit`, which adds the standard
* tool chrome (title bar, close button, etc.).
*
* @param {Object} self - Tool instance; must have `self.error` set to a
*   non-empty string describing what went wrong.
* @param {Object} options - Render options forwarded from `tool_common.prototype.render`.
* @param {string} [options.render_level='full'] - Depth of the rendered output:
*   `'full'` returns a complete wrapper node; `'content'` returns the inner
*   content div only.
* @returns {Promise<HTMLElement>} The error wrapper (full render) or content div
*   (content render).
*/
export const render_error = async function(self, options) {

	// render level
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_data tool tool_error content_data_error',
			inner_html		: 'Error : ' + self.error + ' Try to close the tool and re-open it'
		})

	// icon_info
	// Prepend the info icon so it appears to the left of the error message text.
		const icon_info = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'button icon info'
		})
		content_data.prepend(icon_info)

	// Early return for content-only render (no outer tool wrapper needed).
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_edit returns tool wrapper
	// For the full render level, wrap content_data in the standard tool shell
	// (title bar, resize handles, close button) so the error panel is dockable.
		const wrapper = ui.tool.build_wrapper_edit(self, {
			content_data : content_data
		})


	return wrapper
}//end render_error



/**
* RENDER_FOOTER
* Creates the footer node for a tool panel, optionally rendering the tool's
* icon and developer attribution text when those fields are present in the
* tool's context object.
*
* The footer is appended to `content_data` by individual tool render functions
* (e.g. `render_tool_pdf_extractor`, `render_tool_update_cache`,
* `render_tool_qr`). It is intentionally lightweight — callers own the
* decision of when and where to place it.
*
* Both `context.icon` and `context.developer` are optional; the footer div is
* always returned so the caller can append it unconditionally. When the tool's
* context has not been loaded (e.g. on error paths) both optional-chain guards
* silently skip rendering those children.
*
* @param {Object} self - Tool instance; expected to carry `self.context` as
*   populated by `tool_common.prototype.build` from the `get_element_context`
*   API response. `self.context.icon` (URL string) and
*   `self.context.developer` (string) are both optional.
* @returns {HTMLElement} The footer div (`class="footer_node"`), possibly
*   containing an `<img class="icon">` and/or a `<span class="info">` child.
*/
export const render_footer = function (self) {

	const footer_node = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'footer_node'
	})

	// icon
	// Render the tool's icon image only when the context provides an icon URL.
	if (self.context?.icon) {
		ui.create_dom_element({
			element_type	: 'img',
			class_name		: 'icon',
			src				: self.context.icon,
			parent			: footer_node
		})
	}

	// developer
	// Render an attribution line only when the context provides a developer name.
	if (self.context?.developer) {
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'info',
			inner_html		: `Developed by ${self.context.developer}`,
			parent			: footer_node
		})
	}


	return footer_node
}//end render_footer



// @license-end
