// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports



/**
* VIEW_TEXT_LIST_FILTER_RECORDS
* Plain-text list view for component_filter_records.
*
* This module is the 'text' view variant dispatched by
* render_list_component_filter_records when `context.view === 'text'`.
* It produces the most stripped-down possible representation of the
* component's filter entries: a bare <span> whose content is the
* newline-joined JSON serialisation of every individual record-access
* restriction tuple.
*
* Unlike the 'default' and 'mini' views (which use ui.component
* wrapper builders and respect `context.fields_separator`), this view
* intentionally hard-codes '\n' as the separator and omits any Dédalo
* wrapper chrome — making it suitable for copy-paste, export previews,
* or embedding inside other text containers.
*
* Architecture note: the constructor returns `true` as a no-op; all
* behaviour lives on the static `render` method, which is called
* directly by the render_list dispatcher (never instantiated).
*
* Main export: view_text_list_filter_records (static .render method)
*/
export const view_text_list_filter_records = function() {

	return true
}//end view_text_list_filter_records



/**
* RENDER
* Builds a bare <span> element whose text content is the plain-text
* serialisation of all record-access filter entries stored in self.data.
*
* Data flow:
*   self.data.entries  — Array of entry rows. Each row may itself be an
*                        Array (the server groups entries into sub-arrays),
*                        so `.flat()` removes exactly one nesting level,
*                        yielding a flat list of entry objects of shape:
*                          { id: number|null, tipo: string, value: Array<number> }
*   entries_flat       — After flattening, each element is JSON-stringified.
*                        The resulting strings are joined with '\n' so each
*                        entry occupies its own line in the rendered output.
*   value_string       — The final newline-delimited text is inserted as
*                        raw HTML via insertAdjacentHTML. Because every entry
*                        value comes from JSON.stringify of server-controlled
*                        structured data (integers, tipo strings), there is no
*                        user-supplied free-text in this path that would be an
*                        XSS risk — however, if that ever changes, the caller
*                        must switch to textContent or escape the output. (!)
*
* Unlike view_default_list_filter_records and view_mini_list_filter_records,
* this view does NOT use `context.fields_separator`; it always uses '\n'.
* It also does not call any ui.component builder, so the returned element
* carries no Dédalo wrapper CSS classes.
*
* @param {Object} self    - component_filter_records instance; must have
*                           `self.data.entries` (Array, may be nested one level)
* @param {Object} options - render options forwarded from the list dispatcher
*                           (currently unused by this view, reserved for future use)
* @returns {Promise<HTMLElement>} a <span> element with the serialised entries
*                                 injected as its inner HTML
*/
view_text_list_filter_records.render = async function(self, options) {

	// short vars
		const data			= self.data
		const entries		= data.entries || []
		const entries_flat	= entries.flat() // remove first level
		const string_values	= entries_flat.map((el)=>{
			return JSON.stringify(el)
		})
		const value_string	= string_values.join('\n')

	const wrapper = document.createElement('span')
	wrapper.insertAdjacentHTML('afterbegin', value_string)


	return wrapper
}//end render



// @license-end
