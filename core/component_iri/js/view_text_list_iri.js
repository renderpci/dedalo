// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {get_dataframe} from '../../component_common/js/component_common.js'



/**
* VIEW_TEXT_LIST_IRI
* Plain-text list-mode view for `component_iri`.
*
* Renders all IRI entries belonging to a single component_iri record as a
* flat text string with no anchor (`<a>`) elements, making it safe to embed
* inside contexts that cannot host interactive or structured HTML — for example,
* export templates, print previews, or tooltip labels.
*
* Contrast with:
*   - `view_default_list_iri` — standard list row that does include anchor links
*     and an "edit in modal" click handler.
*   - `view_mini_iri`         — compact anchor-based view for autocomplete /
*     datalist service rows.
*
* This view is selected when `self.context.view === 'text'` from the
* `render_list_component_iri.list` dispatcher.
*
* Per-entry output format (joined with ' | '):
*   <dataframe textContent> | <entry.title> | <entry.iri>
* Only non-empty fields contribute to the pipe-separated line.
* All entry lines are joined with ', ' into a single output string.
*
* Exports: {Function} view_text_list_iri — namespace/constructor (no instances)
*/
export const view_text_list_iri = function() {

	return true
}//end view_text_list_iri



/**
* RENDER
* Builds a `<span>` wrapper containing all IRI entries serialised to plain text.
*
* For each entry in `self.data.entries` the function:
*  1. Calls `get_dataframe` to resolve the paired label dataframe instance using
*     the entry's server-minted `id` as the pairing key (`section_id_key`).
*     The dataframe is built in 'list'/'line' mode and appended to
*     `self.ar_instances` so the parent component can destroy it on teardown.
*  2. Extracts `dataframe_node.textContent` (strips any HTML the dataframe may
*     have rendered) as the human-readable label.
*  3. Appends `entry.title` (legacy literal label, kept for fallback) and
*     `entry.iri` (the raw URL string).
*  4. Joins the non-empty fields for this entry with ' | '.
* All entry lines are collected and joined with ', ' into `value_string`.
*
* The rendered DOM tree is a single `<span>` carrying the full concatenated
* string as a `Text` node — no child elements, no markup.
*
* Data shape assumed on `self`:
*   self.data = {
*     entries: [
*       {
*         id:    {number}  server-minted item counter; pairing key for dataframe
*         iri:   {string}  the URL (may be absent/null on partially-saved rows)
*         title: {string}  legacy literal label (may be absent)
*         lang:  {string}  language marker e.g. 'lg-nolan'
*       },
*       …
*     ]
*   }
*
* Note: `entry.title` is a legacy field from pre-dataframe data. It is still
* included here so that records migrated from v6 display a label even if no
* paired dataframe has been created yet.
*
* @param {Object} self    - `component_iri` instance; must expose `.data`,
*                           `.section_id`, `.section_tipo`, `.tipo`,
*                           `.ar_instances`, `.model`, `.mode`, `.view`.
* @param {Object} options - render options forwarded from `render_list_component_iri.list`;
*                           currently not consumed by this view but kept for
*                           interface parity with other view renderers.
* @returns {Promise<HTMLElement>} A `<span>` element whose `textContent` is the
*   plain-text representation of all IRI entries, or an empty span when there
*   are no entries.
*/
view_text_list_iri.render = async function(self, options) {

	// short vars
		const data		= self.data || {}
		const entries	= data.entries || []

	// Value as string
		const ar_value_string	= [];
		const entries_length		= entries.length
		for (let i = 0; i < entries_length; i++) {

			const ar_line = []

			// dataframe
			// Resolve the label dataframe paired to this entry via its server-minted id.
			// `section_id_key` is the pairing key (the item's `id`), NOT the array index.
			// (!) Using the array index `i` here would cause wrong frame resolution on any
			// record where entries have been reordered or deleted on the server side.
			const component_dataframe = await get_dataframe({
				self				: self,
				section_id			: self.section_id,
				section_id_key		: entries[i].id,
				section_tipo_key	: self.section_tipo,
				main_component_tipo	: self.tipo,
				view				: 'line',
				mode				: 'list'
			})
			// Add dataframe instance to component dependencies array
			// so that the parent component_iri teardown can destroy it.
			self.ar_instances.push(component_dataframe)
			// Render the dataframe wrapper
			const dataframe_node = await component_dataframe.render()
			// Get only the text content discarding HTML nodes
			// `textContent` collapses all descendant text into a flat string;
			// any anchor links, spans, or bold text in the dataframe are stripped.
			const text_node = dataframe_node.textContent
			if (text_node) {
				ar_line.push(text_node)
			}

			// title
			// Legacy literal label — populated before per-value dataframe support
			// was introduced. Still read so that v6-migrated records display correctly.
			if (entries[i].title) {
				ar_line.push(entries[i].title)
			}

			// IRI
			// Raw URL string; included after the human-readable label so the output
			// reads "Label | https://example.org" when both are present.
			if (entries[i].iri) {
				ar_line.push(entries[i].iri)
			}

			// Line add
			// Only push to the outer array when at least one field produced output,
			// preventing empty ' | ' separators for blank or partially-saved entries.
			if (ar_line.length>0) {
				ar_value_string.push(ar_line.join(' | '))
			}
		}

		const value_string = (ar_value_string.length)
			? ar_value_string.join(', ')
			: ''

	// wrapper. Set as span
	// A <span> (inline element) is used so this view composes cleanly inside
	// table cells, tooltip content, and other block-controlled containers.
		const wrapper = ui.create_dom_element({
			element_type	: 'span',
			class_name		: `wrapper_component ${self.model} ${self.mode} view_${self.view}`
		})

	// Append text_node
	// A DOM Text node (not innerHTML) is used deliberately so that any special
	// characters in IRIs or titles (e.g. '&', '<') are not interpreted as HTML.
		const text_node = document.createTextNode(value_string);
		wrapper.appendChild(text_node)


	return wrapper
}//end render



// @license-end
