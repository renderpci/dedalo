// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



/**
* EXTERNAL_RENDER
* The two rendering rules every component_external view obeys, in ONE place so
* the four views cannot drift apart.
*
*
* 1. AN ENTRY IS TEXT, AND TEXT IS NEVER PARSED AS HTML.
*
* An entry is a string a THIRD-PARTY service put in this record — a title, an
* author list, a physical description. Until 2026-08-06 all four views injected
* it with `inner_html` / `insertAdjacentHTML`, on a documented contract that
* said "the server is responsible for sanitising"; the server sanitised
* nothing, so any operator of a catalogued remote source (and anyone who could
* edit a record in it) could run script in a curator's session here. That is a
* live stored-XSS surface, not a theoretical one.
*
* This is an INTENTIONAL BEHAVIOUR CHANGE against that contract, not a bugfix:
* an entry that used to render as markup now renders as the characters it
* actually contains. The contract moved rather than disappeared — the server
* now declares, per entry, which ones it sanitised:
*
*   data.entries      string[]                    the values
*   data.entries_kind ('text'|'markup')[]|absent  parallel; absent = all text
*
* `markup` is emitted only for a value the external subsystem ran through its
* allowlist sanitizer (src/external/fields_map.ts sanitizeMarkup: bare <b>, <i>,
* <em>, <strong>, <sub>, <sup>, <br>, <p>, <ul>, <ol>, <li>, no attributes at
* all), so parsing it is safe AND necessary — a formatted citation would
* otherwise show its own tags. Everything else goes through textContent.
* The default when the field is absent is `text`: the field can only ever
* WIDEN rendering, never enable it by omission.
*
*
* 2. A DEGRADED SOURCE IS VISIBLE.
*
* The server never emits a silent blank (src/core/components/component_external/
* value.ts): when it cannot derive the values it emits `entries: []` plus a
* `source_status` naming the state. Rendering the empty array and dropping the
* status would put the blank back — and "the source did not answer" is
* indistinguishable on screen from "this work has no author", which is a
* difference a cataloguer acts on. Every view therefore appends the marker.
*
*   data.source_status { service, state, label_key, retryable, stale_since?,
*                        dropped_over_count?, dropped_over_length?,
*                        dropped_unrenderable? }
*
* `label_key` is a key into the labels catalog, never prose — the server does
* not know the reader's application language.
*
* @see view_default_edit_component_external
* @see view_default_list_component_external
* @see view_text_list_component_external
* @see view_mini_list_external
* @see render_search_component_external
* @see component_external.less  — one visual state per `state_*` class
*/

// imports
	import {ui} from '../../common/js/ui.js'



/** Separator between joined entries, shared by the three list views. */
export const ENTRIES_SEPARATOR = ' | '



/**
* ENTRY_KIND
* How the server says entry `i` may be rendered.
*
* Anything that is not the exact string 'markup' is text — an unreadable or
* malformed `entries_kind` must fail CLOSED, because the failure mode of the
* other default is executing a remote service's script.
*
* @param {Object} data - the component's data object (`self.data`).
* @param {number} i - zero-based entry index.
* @returns {string} 'markup' | 'text'
*/
export const entry_kind = function(data, i) {

	const kinds = (data && Array.isArray(data.entries_kind))
		? data.entries_kind
		: null

	return (kinds && kinds[i]==='markup')
		? 'markup'
		: 'text'
}//end entry_kind



/**
* BUILD_ENTRY_NODE
* Build the node for one entry, honouring rule 1.
*
* @param {Object} data - the component's data object (`self.data`).
* @param {number} i - zero-based entry index.
* @param {Object} [options={}]
*   options.element_type {string} - defaults to 'span'.
*   options.class_name   {string} - defaults to 'external_entry'.
* @returns {HTMLElement} the entry node.
*/
export const build_entry_node = function(data, i, options={}) {

	// short vars
		const entries	= (data && Array.isArray(data.entries)) ? data.entries : []
		const raw		= entries[i]
		// null is the empty-slot placeholder some views inject; '' keeps the node
		// present (and empty) so the component holds its layout position.
		const value		= (raw===null || raw===undefined) ? '' : String(raw)
		const kind		= entry_kind(data, i)

	// (!) the ONE branch: 'markup' is server-sanitised, everything else is text.
		return ui.create_dom_element({
			element_type	: options.element_type || 'span',
			class_name		: options.class_name || 'external_entry',
			...(kind==='markup'
				? {inner_html : value}
				: {text_content : value})
		})
}//end build_entry_node



/**
* APPEND_ENTRIES
* Append every entry to `parent`, separated by ENTRIES_SEPARATOR.
*
* Replaces the old `entries.join(' | ')` + inner_html of the three list views.
* The separator is a TEXT node between entry nodes rather than part of a joined
* string, so an entry can never smuggle markup into a neighbour's node.
*
* @param {HTMLElement} parent - node to append into.
* @param {Object} data - the component's data object (`self.data`).
* @returns {HTMLElement} parent, for chaining.
*/
export const append_entries = function(parent, data) {

	const entries = (data && Array.isArray(data.entries)) ? data.entries : []

	for (let i = 0; i < entries.length; i++) {
		if (i > 0) {
			parent.appendChild(document.createTextNode(ENTRIES_SEPARATOR))
		}
		parent.appendChild(build_entry_node(data, i))
	}

	return parent
}//end append_entries



/**
* SOURCE_STATUS_LABEL
* Localised text for a source_status, honouring rule 2.
*
* Falls back to the raw `state` (a short English token like 'unavailable')
* rather than to an empty string: a marker with no text is the empty box this
* whole mechanism exists to remove.
*
* @param {Object} status - `data.source_status`.
* @returns {string} the text to show.
*/
export const source_status_label = function(status) {

	// (!) dynamic dictionary access — the key is chosen by the server, so the
	// labels gate cannot scan this site. Every key the server can emit is
	// asserted to exist in master.json by external_degradation_tripwire.
	const label = (typeof get_label!=='undefined' && get_label)
		? get_label[status.label_key]
		: null

	return label || status.state || ''
}//end source_status_label



/**
* BUILD_SOURCE_STATUS_NODE
* Build the degradation marker for a component, or null when the values are a
* plain fresh success (the server omits `source_status` entirely in that case).
*
* The `state_<state>` class is what makes the states distinguishable — a
* cataloguer must be able to tell 'stale' (data shown, possibly out of date)
* from 'unavailable' (no data at all) at a glance, so the two must never share
* a look. The `title` carries the service name, the fetch time when the row is
* stale, and the drop counters when values were withheld.
*
* @param {Object} data - the component's data object (`self.data`).
* @returns {HTMLElement|null} the marker node, or null when there is nothing to say.
*/
export const build_source_status_node = function(data, options) {

	// status
		const status = data ? data.source_status : null
		if (!status || typeof status!=='object') {
			return null
		}

	// compact. DENSE INLINE VIEWS (text/line/mini) concatenate SEVERAL
	// component_external fields of the same record on one line, so each one
	// would repeat the full sentence mid-value ("ANE<marker> | 1967"). There the
	// marker is a glyph and the sentence moves to the title, which stays
	// readable at four fields per row. It is never HIDDEN — a degradation the
	// curator cannot see is the silent blank this whole subsystem exists to
	// prevent — only made compact.
		const compact = !!(options && options.compact)

	// state. Closed set server-side; an unknown one still renders (with its own
	// class), because refusing to render it would be the silent blank again.
		const state = status.state || 'unknown'

	// title. Detail for the curator, assembled as plain text. In compact form
	// the label itself leads, so the glyph is never the only explanation.
		const title_parts = []
		if (compact) {
			title_parts.push(source_status_label(status))
		}
		if (status.service) {
			title_parts.push(status.service)
		}
		if (typeof status.stale_since==='number') {
			title_parts.push(new Date(status.stale_since).toLocaleString())
		}
		const dropped = (status.dropped_over_count || 0)
			+ (status.dropped_over_length || 0)
			+ (status.dropped_unrenderable || 0)
		if (dropped > 0) {
			title_parts.push(dropped + ' ×')
		}

	// node
		return ui.create_dom_element({
			element_type	: 'span',
			class_name		: `external_source_status state_${state}`
								+ (status.retryable ? ' retryable' : '')
								+ (compact ? ' compact' : ''),
			// textContent (never innerHTML): this is server-supplied text.
			text_content	: compact ? '◍' : source_status_label(status),
			title			: title_parts.join(' · ')
		})
}//end build_source_status_node



/**
* APPEND_SOURCE_STATUS
* Append the degradation marker to `parent` when there is one.
*
* @param {HTMLElement} parent - node to append into.
* @param {Object} data - the component's data object (`self.data`).
* @returns {HTMLElement|null} the appended marker, or null when there was none.
*/
export const append_source_status = function(parent, data, options) {

	const node = build_source_status_node(data, options)
	if (node) {
		parent.appendChild(node)
	}

	return node
}//end append_source_status



// @license-end
