// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



/**
* VIEW_MINI_IRI
* Compact read-only render for component_iri in 'mini' list/tm mode.
*
* This view is selected by render_list_component_iri when self.context.view === 'mini'.
* Typical callers: autocomplete dropdowns, datalist service rows, portal thumbnail cells,
* and the thesaurus-mini (tm) render path (which aliases list in component_iri).
*
* The rendered output is a <span class="mini component_iri_mini"> element containing one
* anchor (<a class="link_iri">) per IRI entry with valid URLs, or a plain text span
* (<span class="text_iri">) for entries that carry only a title. Adjacent entries are
* separated by a configurable fields_separator span.  No edit affordance is attached:
* the mini view is intentionally read-only.
*
* Exported symbols:
*   view_mini_iri         — constructor (namespace host for the static render method)
*   view_mini_iri.render  — async factory; returns the populated wrapper element
*/

// imports
	import {ui} from '../../common/js/ui.js'
	import {
		render_links_list
	} from './render_list_component_iri.js'



/**
* VIEW_MINI_IRI
* Constructor / namespace host.  No instance state is kept here; all logic lives on the
* static render method below.  The constructor returns true so that callers can treat it
* as a plain factory guard when needed.
*/
export const view_mini_iri = function() {

	return true
}//end view_mini_iri



/**
* RENDER
* Builds and returns the mini-mode wrapper element for a component_iri instance.
*
* Workflow:
*   1. Read self.data (server-provided data layer) and inject fields_separator from
*      self.context so the shared render_links_list helper uses the per-component
*      separator configured in the server context rather than its own default (', ').
*   2. Call render_links_list(data) to build a DocumentFragment of <a>/<span> nodes,
*      one per entry in data.entries.
*   3. Wrap the fragment in a <span class="mini component_iri_mini"> produced by
*      ui.component.build_wrapper_mini, which applies the standard Dédalo mini-mode
*      CSS classes expected by the surrounding layout (portal cells, datalists, etc.).
*
* Note: data.fields_separator is written directly on the data object returned by
* self.data.  The original object is mutated (not cloned) before being passed to
* render_links_list.  This is intentional: self.data is a short-lived per-render value
* and the mutation is immediately consumed by render_links_list in the same call.
*
* @param {Object} self    - The component_iri instance being rendered.
*   @param {Object} self.data              - Server data layer; may be empty ({}).
*   @param {Array}  [self.data.entries]    - IRI entry objects ({id, iri, title}).
*   @param {Object} self.context           - Server context layer for this component.
*   @param {string} [self.context.fields_separator] - Separator string between entries;
*     forwarded to render_links_list.  Falls back to ', ' inside render_links_list if absent.
* @param {Object} options  - Render options (currently unused; reserved for future use).
* @returns {Promise<HTMLElement>} The populated <span class="mini component_iri_mini"> wrapper.
*/
view_mini_iri.render = async function(self, options) {

	// short vars
		const data	= self.data || {}

		// Inject the context-level separator so render_links_list uses the value
		// configured per-component on the server rather than its built-in default.
		data.fields_separator = self.context.fields_separator

	// DOM fragment. Use common function render_links_list
		const fragment = render_links_list(data)

	// wrapper
		const wrapper = ui.component.build_wrapper_mini(self, {})
		wrapper.appendChild(fragment)


	return wrapper
}//end render



// @license-end
