// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {get_fallback_value} from '../../common/js/common.js'
	// (!) get_fallback_value is imported but not referenced in any method of this file.
	// It may be reserved for a future transliterate-fallback variant of get_raw_string,
	// or it may be a leftover from an earlier iteration. Do not remove — see HARD RULE 3.



/**
* OUTPUT_COMPONENT_IRI
* Headless output counterpart for component_iri.
*
* Provides prototype methods that extract component_iri data as plain text or other
* serialisable forms, with no DOM construction or HTMLElement rendering involved.
* The consumer (e.g. export pipelines, clipboard helpers, flat-table renderers) mixes
* these methods onto a live component_iri instance via prototype assignment before calling
* them, so `this` always refers to a fully built component_iri instance that carries
* `self.data` (with the `entries` array) and `self.context` (with `fields_separator`).
*
* Data shape expected on `self.data`:
*   {
*     entries: Array<{id?: number, iri?: string, title?: string, lang?: string}>
*   }
*
* Context property consumed:
*   self.context.fields_separator {string} — delimiter between successive IRI values
*     when the component holds more than one entry (e.g. ", " or " | ").
*
* Exported symbols:
*   output_component_iri  — constructor (no-op; only exists to host prototype methods)
*/
export const output_component_iri = function() {

	return true
}//end output_component_iri



/**
* GET_RAW_STRING
* Serialises every IRI entry to a single plain-text string for use in export,
* clipboard, and flat-table contexts where HTML rendering is not available.
*
* For each entry the title and IRI URL are joined with " | " (if both are present);
* if only one is present, only that part is used. Entries that have neither title nor
* IRI are silently skipped. The resulting per-entry strings are then joined by
* `self.context.fields_separator` (configured on the ontology node, defaults to ", ").
*
* Example output for two entries with title + IRI each:
*   "Dédalo website | https://dedalo.dev, GeoNames | https://www.geonames.org"
*
* (!) The separator " | " used inside each entry is hard-coded here, while the
* separator *between* entries is taken from context.fields_separator. This matches
* the legacy flat-export format; do not change the inner " | " without verifying
* that the CSV import parser (`conform_import_data`) is updated to match.
*
* (!) `get_fallback_value` is imported at the top of this module but is not called
* here. A future multilingual variant would use it to substitute missing-language
* entries with the value from another language (marked with <mark> tags). Currently
* only the primary-language entries that already exist in `data.entries` are used.
*
* @returns {Promise<string>} Flat text representation of all IRI entries,
*   or an empty string when `data.entries` is absent or every entry is empty.
*/
output_component_iri.prototype.get_raw_string = async function() {

	const self = this

	// short vars
		const data		= self.data || {}
		const entries	= data.entries || []

	// Value as string
		const ar_value_string	= [];
		const entries_length		= entries.length
		for (let i = 0; i < entries_length; i++) {

			// Build the per-entry fragment: [title, iri] as available.
			// An entry with neither title nor iri produces an empty ar_line and is excluded.
			const ar_line = []

			if (entries[i].title) {
				ar_line.push(entries[i].title)
			}
			if (entries[i].iri) {
				ar_line.push(entries[i].iri)
			}

			if (ar_line.length>0) {
				// Inner separator is always " | " regardless of context.fields_separator.
				ar_value_string.push(ar_line.join(' | '))
			}
		}

		// Join multiple values with the context-level separator (e.g. ", " or " | ").
		// Falls back to '' when no valid entries were found.
		const value_string = (ar_value_string && ar_value_string.length)
			? ar_value_string.join(self.context.fields_separator)
			: ''

	return value_string
}//end get_raw_string



// @license-end
