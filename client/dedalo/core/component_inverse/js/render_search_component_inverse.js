// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global SHOW_DEBUG*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_SEARCH_COMPONENT_INVERSE
* Search-mode render mixin for component_inverse.
*
* component_inverse is a read-only, COMPUTED component: it owns no stored value.
* Its content is resolved on read from the relations that point AT the current
* record ("who references me?"), so there is nothing in the matrix to match a
* search argument against. The engine says the same thing mechanically: the model
* declares matrix column `misc`, is absent from the relation-resolver registry and
* declares no `searchBuilder` family, so `search/conform.ts` throws
* `engine.uncovered_scope` for ANY leaf carrying a component_inverse tipo — and
* `search_operators.ts` classifies it in MODELS_WITHOUT_SEARCH_OPERATORS (empty
* operator tooltip). Accordingly this view is a READ-ONLY presentation and emits
* NO search criterion.
*
* Two guarantees, one per collector door (`search.js` serialize_filter_model):
*   1. no input element ever calls `update_data_value` / publishes
*      `change_search_element`, so the filter model is never fed from the DOM, and
*   2. `get_search_value()` returns `[]` — the collector prefers that hook over
*      `data.entries`, so even a payload that arrives carrying computed backlink
*      entries cannot leak into the SQO and 500 the search.
*
* Note component_inverse is also listed in `search.js` `ar_components_exclude`, so
* it is not offered in the search left list; this view covers the paths that reach
* search mode anyway (saved presets, a portal rendering its children in `search`).
*
* Prototype assignment (see component_inverse.js):
*   component_inverse.prototype.search           = render_search_component_inverse.prototype.search
*   component_inverse.prototype.get_search_value = render_search_component_inverse.prototype.get_search_value
*
* Data shape expected on self.data:
*   entries {Array<{from_section_id, from_section_tipo, from_component_tipo}>}
*
* @module render_search_component_inverse
* @see render_edit_component_inverse.js  the edit renderer this used to alias
* @see docs/core/components/component_inverse.md
*/
export const render_search_component_inverse = function() {

	return true
}//end render_search_component_inverse



/**
* SEARCH
* Entry point for the search-mode render lifecycle (called by
* common.prototype.render when self.mode === 'search').
*
* Two-level render contract, mirrored by every Dédalo search renderer:
*   - render_level 'content' : return only the content_data element (partial refresh).
*   - any other value ('full', the default) : return the whole wrapper_component
*     built by ui.component.build_wrapper_search.
*
* The wrapper gets the 'read_only' and 'disabled_component' classes so the
* stylesheet renders it as a non-interactive, informational cell — the search bar
* must not look like it accepts a value here.
*
* Side effects:
*   - wrapper.content_data pointer is set for callers that patch the inner node.
*
* @param {Object} options
*   @param {string} [options.render_level='full']
* @returns {Promise<HTMLElement>} wrapper (full) or content_data ('content')
*/
render_search_component_inverse.prototype.search = async function(options) {

	const self = this

	// options
		const render_level = options?.render_level || 'full'

	// content_data
		const content_data = get_content_data(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_wrapper_search returns component wrapper
		const wrapper = ui.component.build_wrapper_search(self, {
			content_data : content_data
		})
		wrapper.classList.add('read_only','disabled_component')
		// set pointers
		wrapper.content_data = content_data


	return wrapper
}//end search



/**
* GET_SEARCH_VALUE
* The collector hook read by search.js serialize_filter_model. Returning an empty
* array is the load-bearing half of this view: component_inverse is unsearchable
* server-side, so it must never contribute a `q` to the query. Do NOT "fix" this to
* return self.data.entries — that ships the computed backlink locators as a search
* argument on a tipo that conform.ts refuses.
*
* @returns {Array} always empty
*/
render_search_component_inverse.prototype.get_search_value = function() {

	return []
}//end get_search_value



/**
* GET_CONTENT_DATA
* Build the content_data container: one read-only content_value per resolved
* inverse locator, showing the section_id of the referencing record. When there are
* no entries a single empty slot is rendered so the search row does not collapse —
* the same convention the edit view follows.
*
* Each node is also stored under its numeric index on content_data (content_data[i])
* so callers can reach a value node without a DOM query.
*
* @param {Object} self - component_inverse instance
* @returns {HTMLElement} content_data
*/
const get_content_data = function(self) {

	// short vars
		const entries = self.data?.entries || []

	// content_data
		const content_data = ui.component.build_content_data(self)

	// values. Always at least one (empty) slot
		const values_length = entries.length || 1
		for (let i = 0; i < values_length; i++) {

			const content_value_node = get_content_value(entries[i] || {})
			content_data.appendChild(content_value_node)
			// set the pointer
			content_data[i] = content_value_node
		}


	return content_data
}//end get_content_data



/**
* GET_CONTENT_VALUE
* Build one read-only row for an inverse-reference locator. The entry is the flat
* locator itself (from_section_id / from_section_tipo / from_component_tipo) — the
* same access pattern as view_default_edit_inverse, NOT the `.locator` wrapper the
* list/mini views use. Do not add a `.locator` hop here without verifying what the
* server delivers in this mode.
*
* @param {Object} locator - one inverse-reference entry (may be {})
* @returns {HTMLElement} content_value
*/
const get_content_value = (locator) => {

	// content_value. read_only always: this view never accepts input
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value read_only'
		})

	// span. section_id of the referencing record
		if (locator.from_section_id!==undefined && locator.from_section_id!==null) {
			ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'inverse_show_section_id',
				text_node		: locator.from_section_id,
				parent			: content_value
			})
		}


	return content_value
}//end get_content_value



// @license-end
