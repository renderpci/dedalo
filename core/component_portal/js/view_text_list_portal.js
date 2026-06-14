// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, Promise, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {get_section_records} from '../../section/js/section.js'
	import {
		render_column_component_info
	} from './render_edit_component_portal.js'



/**
* VIEW_TEXT_LIST_PORTAL
* Flat-text list view for `component_portal` — renders each linked record as a plain
* inline text node separated by a configurable character sequence.
*
* This view is the lightest-weight portal rendering mode.  Unlike `view_default_edit_portal`
* or `view_line_edit_portal` it produces no table, no drag handles, and no edit toolbar.
* Its primary use cases are:
*
* - Read-only display contexts (e.g. print, preview, or diffusion-facing portals where only
*   the textual value of each linked record matters).
* - Inline composite labels where multiple portal values must appear side-by-side in a
*   sentence, separated by a comma, semicolon, or custom glyph.
*
* The view is activated by setting `context.view = 'text'` in the request config for
* the portal component.  `render_edit_component_portal.prototype.edit` dispatches here
* via the `case 'text':` branch of its view switch.
*
* Exported symbols:
* - `view_text_list_portal`          — namespace/constructor stub (never instantiated).
* - `view_text_list_portal.render`   — static async render method; the sole entry point.
*
* Key data consumed from the component instance (`self`):
* - `self.columns_map`                — ordered column descriptor array built during init.
* - `self.add_component_info`         — boolean flag; when true an extra `ddinfo` column
*                                       descriptor is appended (populated from `self.datum.data`).
* - `self.ar_instances`               — Array accumulator; built section_record instances are
*                                       pushed here so the component's `destroy()` can clean up.
* - `self.context.view`               — view name resolved at build time (should be `'text'`).
* - `self.context.records_separator`  — optional string injected between consecutive record
*                                       nodes (e.g. `', '`, `' | '`).  Defaults to `''`
*                                       (no separator).
* - `self.model`                      — CSS class for the wrapper (e.g. `'component_portal'`).
* - `self.mode`                       — render mode (e.g. `'list'`, `'edit'`).
* - `self.view`                       — runtime view override; takes precedence over
*                                       `self.context.view` in the wrapper CSS class.
*/
export const view_text_list_portal = function() {

	return true
}//end view_text_list_portal



/**
* RENDER
* Build and return the flat-text list wrapper for all linked records.
*
* Execution flow:
* 1. Shallow-copy `self.columns_map` so the optional `ddinfo` column can be appended
*    without mutating the shared instance property.
* 2. Call `get_section_records` to build (or retrieve from cache) one `section_record`
*    instance per locator in `self.data.entries`.  Each instance is built in `'list'`
*    mode so inner components render in their read-only / compact form.
* 3. Push the built instances onto `self.ar_instances` so the host component's
*    `destroy()` lifecycle method can call their individual `destroy()` methods later.
* 4. Create a `<span>` wrapper with CSS classes derived from the component model, mode,
*    and active view name.
* 5. Render all instances in parallel with `Promise.all`, then append their child nodes
*    directly into the wrapper (not the `section_record` node itself — only its children
*    are extracted) so the flat-text appearance is preserved.
* 6. Between consecutive record nodes, inject a plain text node for `records_separator`
*    when a non-empty separator is configured on `self.context.records_separator`.
*    No separator is appended after the last record.
*
* (!) `render_level` is extracted from `options` but is never checked further in this
* function — unlike other portal views (`view_line_edit_portal`, `view_default_edit_portal`)
* that return `content_data` early when `render_level === 'content'`.  In this view the
* wrapper is always rebuilt in full.  Callers that pass `render_level: 'content_data'`
* will receive the full wrapper, not a partial node.
*
* @param {Object} self - The `component_portal` instance acting as the render target.
*   Must have: `columns_map`, `add_component_info`, `ar_instances`, `context`, `model`,
*   `mode`, `view`, and `data.entries` populated before this function is called.
* @param {Object} options - Render options bag forwarded from `render_edit_component_portal.prototype.edit`.
* @param {string} [options.render_level='full'] - Render depth hint.  Currently unused
*   inside this view (always performs a full rebuild).
* @returns {Promise<HTMLElement>} A `<span.wrapper_component>` node whose children are
*   the rendered text output of every linked record, interleaved with optional separators.
*/
view_text_list_portal.render = async function(self, options) {

	// options
		const render_level = options.render_level || 'full'

	// columns_map
		const columns_map = [...self.columns_map]
		if (self.add_component_info === true) {
			columns_map.push({
				id       : 'ddinfo',
				label    : 'Info',
				callback : render_column_component_info
			})
		}

	// ar_section_record
		const ar_section_record = await get_section_records({
			caller      : self,
			mode        : 'list',
			view        : self.context.view,
			columns_map : columns_map
		})
		// store to allow destroy later
		self.ar_instances.push(...ar_section_record)

	// wrapper
		const wrapper = ui.create_dom_element({
			element_type : 'span',
			class_name   : `wrapper_component ${self.model} ${self.mode} portal view_${self.view || self.context.view || 'default'}`
		})

	// add all nodes
		const ar_section_record_length = ar_section_record.length
		if (ar_section_record_length > 0) {
			const fragment = new DocumentFragment()
			const rendered_nodes = await Promise.all(ar_section_record.map(rec => rec.render()))

			for (let i = 0; i < ar_section_record_length; i++) {
				const rendered_node = rendered_nodes[i]
				if (rendered_node) {
					// Splice only the child nodes out of each section_record wrapper so
					// the outer element is not included — keeps the output flat/inline.
					fragment.append(...rendered_node.childNodes)
				}

				// records_separator
				// Inject the separator text node between records but never after the last one.
				if (i < ar_section_record_length - 1) {
					const separator = self.context.records_separator || ''
					if (separator) {
						const node_records_separator = document.createTextNode(separator)
						fragment.appendChild(node_records_separator)
					}
				}
			}
			wrapper.appendChild(fragment)
		}


	return wrapper
}//end render



// @license-end
