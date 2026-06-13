// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*eslint no-undef: "error"*/

/**
* SECTION_MAP (client)
* Pure-function mirror of the PHP `section_map` resolver, operating on a
* section_map object received in the datum/section context (config.section_map).
*
* Scope fallback: the requested scope is tried first; if absent, the chain
* main -> thesaurus -> relation_list is walked, skipping the already-tried scope.
* A null scope starts the chain at `main`; `strict` disables the chain.
* Element/term lookup is per-KEY: a scope present but lacking the key does not
* stop the walk. The join separator travels with the scope that supplied `term`.
*/



/**
* SCOPE_FALLBACK
* Scope priority for the fallback chain.
*/
export const SCOPE_FALLBACK = ['main', 'thesaurus', 'relation_list']

/**
* DEFAULT_FIELDS_SEPARATOR
* Default join separator (preserves the historical ', ' behavior).
*/
export const DEFAULT_FIELDS_SEPARATOR = ', '



/**
* RESOLVE_SCOPE_NAME
* Name of the scope that resolves for a request, applying the fallback chain.
* @param object|null section_map
* @param string|null scope
* @param bool strict
* @return string|null
*/
export const resolve_scope_name = function(section_map, scope=null, strict=false) {

	if (!section_map || typeof section_map !== 'object') {
		return null
	}

	// requested scope first (null -> 'main')
	const requested = scope ?? 'main'
	if (section_map[requested] && typeof section_map[requested] === 'object') {
		return requested
	}

	if (strict===true) {
		return null
	}

	// walk the fallback chain, skipping the already-tried scope
	for (let i = 0; i < SCOPE_FALLBACK.length; i++) {
		const candidate = SCOPE_FALLBACK[i]
		if (candidate===requested) {
			continue
		}
		if (section_map[candidate] && typeof section_map[candidate] === 'object') {
			return candidate
		}
	}

	return null
}//end resolve_scope_name



/**
* GET_SCOPE
* Resolved scope node (object) for a request, applying the fallback chain.
* @param object|null section_map
* @param string|null scope
* @param bool strict
* @return object|null
*/
export const get_scope = function(section_map, scope=null, strict=false) {

	const name = resolve_scope_name(section_map, scope, strict)
	if (name===null) {
		return null
	}

	const node = section_map[name]
	return (node && typeof node === 'object') ? node : null
}//end get_scope



/**
* RESOLVE_KEY_SCOPE
* Name of the first scope that PROVIDES key (requested-first, then chain).
* @param object|null section_map
* @param string key
* @param string|null scope
* @param bool strict
* @return string|null
*/
const resolve_key_scope = function(section_map, key, scope=null, strict=false) {

	if (!section_map || typeof section_map !== 'object') {
		return null
	}

	// requested scope first (null -> 'main')
	const requested	= scope ?? 'main'
	const req_node	= section_map[requested]
	if (req_node && typeof req_node === 'object' && Object.prototype.hasOwnProperty.call(req_node, key)) {
		return requested
	}

	if (strict===true) {
		return null
	}

	// walk the fallback chain, skipping the already-tried scope
	for (let i = 0; i < SCOPE_FALLBACK.length; i++) {
		const candidate = SCOPE_FALLBACK[i]
		if (candidate===requested) {
			continue
		}
		const node = section_map[candidate]
		if (node && typeof node === 'object' && Object.prototype.hasOwnProperty.call(node, key)) {
			return candidate
		}
	}

	return null
}//end resolve_key_scope



/**
* GET_ELEMENT_TIPO
* Value of key from the first scope that provides it (per-key chain walk).
* Returns the raw value (string|array|bool); null when no scope provides it.
* @param object|null section_map
* @param string key
* @param string|null scope
* @return mixed
*/
export const get_element_tipo = function(section_map, key, scope=null) {

	const name = resolve_key_scope(section_map, key, scope, false)
	if (name===null) {
		return null
	}

	const value = section_map[name][key]
	return (value===undefined) ? null : value
}//end get_element_tipo



/**
* GET_TERM_TIPOS
* Normalized list of `term` component tipos for the resolved scope.
* @param object|null section_map
* @param string|null scope
* @return array
*/
export const get_term_tipos = function(section_map, scope=null) {

	const value = get_element_tipo(section_map, 'term', scope)
	if (value===null || value===undefined) {
		return []
	}

	return Array.isArray(value) ? value.slice() : [value]
}//end get_term_tipos



/**
* GET_FIELDS_SEPARATOR
* Per-scope `fields_separator`, taken from the scope that supplied `term`.
* @param object|null section_map
* @param string|null scope
* @return string
*/
export const get_fields_separator = function(section_map, scope=null) {

	const term_scope = resolve_key_scope(section_map, 'term', scope, false)
	if (term_scope===null) {
		return DEFAULT_FIELDS_SEPARATOR
	}

	const sep = section_map[term_scope].fields_separator
	return (typeof sep === 'string') ? sep : DEFAULT_FIELDS_SEPARATOR
}//end get_fields_separator



// @license-end
