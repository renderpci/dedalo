// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*eslint no-undef: "error"*/



/**
* ONTOLOGIES_FILTER
*
* Pure (DOM-free) matching layer for the tool_ontology_parser TLD picker.
*
* The census is ~200 ontologies, most of them two-letter country codes, so the
* only practical way to reach one is to type part of its NAME ('spain') or its
* typology ('countries'). This module answers the one question the render layer
* asks — "which tlds are visible right now?" — and nothing else: no DOM, no tool
* instance, no storage. That keeps it testable in the client suite, where the
* render path (live caller + get_ontologies API + localStorage) is not available.
*
* Filtering is VISUAL ONLY. Nothing here reads or writes self.selected_ontologies;
* the caller passes the current selection in and gets a visibility set back.
*/



/**
* NORMALIZE_TEXT
* Folds a value to its comparable form: NFD-decomposed, combining marks stripped,
* lowercased. So 'España' and 'ESPANA' both fold to 'espana' and a user typing
* either one finds the record.
* @param {*} value
* @returns {string}
*/
export const normalize_text = function(value) {

	return String(value ?? '')
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '') // combining marks left by the NFD decomposition
		.toLowerCase()
}//end normalize_text



/**
* PARSE_QUERY
* Splits the raw search box value into normalized tokens. An empty / whitespace-only
* query yields an empty token list, which matches everything.
* @param {*} query
* @returns {string[]}
*/
export const parse_query = function(query) {

	return normalize_text(query).split(/\s+/).filter(Boolean)
}//end parse_query



/**
* ONTOLOGY_MATCHES
* True when EVERY token appears somewhere in the ontology's searchable text, so
* 'es spain' and 'spain es' both find the same record.
*
* Searchable text = tld + name + typology_name:
*   - name is matched in FULL (the server stores pipe-separated variants and the
*     UI only displays the first segment; a user who remembers a later segment
*     should still find the row).
*   - name is nullable in the census (data_io.ts maps '' to null), hence the
*     normalize_text null-guard rather than a direct .split / .includes.
*   - typology_name on the descriptor is what makes typing a group name ('countries')
*     reveal that whole group: every child carries it.
*
* @param {Object} ontology - census descriptor {tld, name, typology_name, …}
* @param {string[]} tokens - output of parse_query
* @returns {boolean}
*/
export const ontology_matches = function(ontology, tokens) {

	if (!tokens || tokens.length===0) {
		return true
	}

	const haystack = normalize_text(ontology?.tld)
		+ ' ' + normalize_text(ontology?.name)
		+ ' ' + normalize_text(ontology?.typology_name)

	return tokens.every(token => haystack.includes(token))
}//end ontology_matches



/**
* FILTER_ONTOLOGIES
* Resolves the current visibility of the whole census.
*
* The text query and the 'selected only' toggle COMPOSE (logical AND): with both
* active you see the checked ontologies whose text also matches.
*
* @param {Array} ontologies - the flat census (self.ontologies)
* @param {Object} [options]
* @param {string} [options.query] - raw search box value
* @param {boolean} [options.selected_only] - restrict to currently checked tlds
* @param {Array<string>} [options.selected] - the checked tlds (self.selected_ontologies)
* @returns {Object} {visible_tlds:Set<string>, match_count:number}
*   Typology-group visibility is NOT returned: the render layer derives it from whether the
*   group has any visible row left, which is the same answer with one source of truth.
*/
export const filter_ontologies = function(ontologies, options) {

	const opts				= options || {}
	const tokens			= parse_query(opts.query)
	const selected_only		= opts.selected_only===true
	const selected			= new Set(opts.selected || [])

	const visible_tlds = new Set()

	const list = Array.isArray(ontologies) ? ontologies : []
	for (let i = 0; i < list.length; i++) {
		const ontology = list[i]
		if (selected_only && !selected.has(ontology?.tld)) {
			continue
		}
		if (!ontology_matches(ontology, tokens)) {
			continue
		}
		visible_tlds.add(ontology?.tld)
	}

	return {
		visible_tlds	: visible_tlds,
		match_count		: visible_tlds.size
	}
}//end filter_ontologies



// @license-end
