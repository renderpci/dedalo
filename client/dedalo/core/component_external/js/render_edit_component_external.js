// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0



/**
* RENDER_EDIT_COMPONENT_EXTERNAL
* Client-side edit-mode renderer for `component_external`.
*
* `component_external` stores arbitrary external references — values whose
* meaning and formatting are dictated by an outside system (e.g. a thesaurus
* identifier or a third-party catalogue number). The component holds its data
* in `self.data.entries[]`, where each element is the raw external string
* value for a given position.
*
* This module provides:
*   - `render_edit_component_external` constructor — the prototype host whose
*     `edit` method is aliased onto `component_external.prototype.edit` in
*     component_external.js.
*   - `get_buttons` (named export) — shared toolbar builder consumed by
*     `view_default_edit_component_external.js`.
*
* View dispatch is handled by `prototype.edit`, which currently routes every
* view variant ('mini', 'line', 'print', 'default') to a single view:
*   - view_default_edit_component_external.render(self, options)
*
* Permissions model:
*   - `self.permissions > 1`  — full edit; `get_buttons` returns a populated
*                               toolbar including fullscreen and tool buttons.
*   - `self.permissions === 1` — read-only; `get_buttons` is not called
*                                (view_default_edit_component_external checks
*                                `self.permissions` to skip the buttons call).
*
* 'print' view forces `self.permissions = 1` before delegating so the default
* view renders read-only content without input fields.
*
* Data shape expected on `self.data`:
*   {
*     entries: [ <string|null>, ... ]
*   }
* An absent `entries` array is treated as empty; the view ensures at least one
* row is always rendered.
*
* Globals consumed (declared /*global*\/ in sibling files):
*   - `get_label`      — i18n label map (injected at page bootstrap).
*
* (!) `get_label` is not declared /*global*\/ in this file. It is safe because
* the only reference is inside `get_buttons`, which is always called from a
* context where the global is already defined — but any linter running this
* file in isolation will flag it as an undeclared identifier. Do not declare
* it here without also adding the standard `/*global*\/` header comment.
*
* Exports:
*   - `render_edit_component_external` (default constructor export)
*   - `get_buttons` (named utility export)
*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {view_default_edit_component_external} from './view_default_edit_component_external.js'



/**
* RENDER_EDIT_COMPONENT_EXTERNAL
* Constructor for the edit-mode renderer.
* Acts as a namespace for `prototype.edit`; all rendering helpers are
* module-level functions or named exports, not prototype methods, so only
* `edit` lives on the prototype.
*/
export const render_edit_component_external = function() {

	return true
}//end render_edit_component_external



/**
* EDIT
* Selects and delegates to the appropriate view for edit mode.
* Called via the `component_external.prototype.edit` prototype alias
* defined in component_external.js.
*
* Supported views (read from `self.context.view`, defaulting to 'default'):
*   - 'mini'    — falls through to 'default' (no separate mini-edit view).
*   - 'line'    — falls through to 'default' (no separate line-edit view).
*   - 'print'   — forces `self.permissions = 1` then falls through to
*                 'default' so inputs render as read-only text. CSS can
*                 target the `.view_print` wrapper class for print-specific
*                 styling applied by `ui.component.build_wrapper_edit`.
*   - 'default' — full edit form rendered by
*                 `view_default_edit_component_external.render`.
*
* (!) 'mini', 'line', and 'print' all fall through to 'default' via
* intentional switch fall-through. For 'print', `self.permissions` is
* mutated as a side effect before delegation; callers must not rely on the
* original `permissions` value after a 'print' render.
*
* @param {Object} options - Rendering options forwarded to the view.
*   `options.render_level` ('full' | 'content') controls whether a full
*   wrapper or just the inner `content_data` element is returned.
* @returns {Promise<HTMLElement>} Resolved wrapper element (render_level
*   'full') or content_data element (render_level 'content').
*/
render_edit_component_external.prototype.edit = async function(options) {

	const self = this

	// view
		const view = self.context.view || 'default'

	switch(view) {

		case 'mini':
		case 'line':

		case 'print':
			// for print we need to use read of the content_value and it's necessary force permissions to use read only element render
			self.permissions = 1

		case 'default':
		default:
			return view_default_edit_component_external.render(self, options)
	}
}//end edit



/**
* GET_BUTTONS
* Builds the toolbar (buttons container) for the component's edit wrapper.
* Called by `view_default_edit_component_external` only when
* `self.permissions > 1`; the view passes `self` directly.
*
* Two button families are conditionally rendered, gated by `self.show_interface`:
*
* `tools` (show_interface.tools === true):
*   Standard shared tool buttons appended via `ui.add_tools`. These include
*   component-level tools registered in the ontology (e.g. import/export
*   helpers). They are rendered before the fullscreen button so tool buttons
*   appear to the left of fullscreen in the toolbar.
*
* `button_fullscreen` (show_interface.button_fullscreen === true):
*   A `<span class="button full_screen">` that invokes `ui.enter_fullscreen`
*   on `self.node` (the component's root DOM element). Fullscreen mode
*   toggles the CSS class `fullscreen` on the node and hides the page menu.
*   The user exits fullscreen with the Escape key or by clicking the exit
*   button injected by `ui.enter_fullscreen`.
*
* Both button sets are first assembled into a `DocumentFragment` for a
* single DOM insertion, then moved into the `buttons_container` element
* created by `ui.component.build_buttons_container`.
*
* (!) `get_label` is used here but not declared /*global*\/ in this file.
* The reference is safe at runtime (the global is always present by the time
* any render occurs), but a strict linter pass on this file in isolation will
* report an `no-undef` error. See module header note.
*
* @param {Object} self - Component instance. Expected properties:
*   - `self.show_interface` {Object}  — feature-flag map (tools, button_fullscreen, …).
*   - `self.node`           {HTMLElement} — the component's root DOM node passed
*                                           to `ui.enter_fullscreen`.
* @returns {HTMLElement} The populated `buttons_container` div.
*/
export const get_buttons = (self) => {

	// short vars
		const show_interface = self.show_interface

	// fragment
		const fragment = new DocumentFragment()

	// buttons tools
		if(show_interface.tools === true){
			ui.add_tools(self, fragment)
		}

	// button_fullscreen
		if(show_interface.button_fullscreen === true){
			const button_fullscreen = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'button full_screen',
				title			: get_label.full_screen || 'Full screen',
				parent			: fragment
			})
			// click event
			const click_handler = (e) => {
				e.stopPropagation()
				ui.enter_fullscreen(self.node)
			}
			button_fullscreen.addEventListener('click', click_handler)
		}

	// buttons container
		const buttons_container = ui.component.build_buttons_container(self)
		buttons_container.appendChild(fragment)


	return buttons_container
}//end get_buttons



// @license-end
