// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*eslint no-undef: "error"*/

/**
* SECTION_MAP (client)
* Pure-function mirror of the PHP `section_map` resolver, operating on a
* section_map object received in the datum/section context (config.section_map).
*
* A `section_map` object groups display-configuration nodes by *scope*. Each
* scope node (e.g. "main", "thesaurus", "relation_list") holds keys such as
* `term` (one tipo or array of tipos whose resolved label is shown), `element`
* (the component tipo used as the record id), and `fields_separator` (the glue
* string used when joining multiple term values).
*
* Scope fallback: the requested scope is tried first; if absent, the chain
* main -> thesaurus -> relation_list is walked, skipping the already-tried scope.
* A null scope starts the chain at `main`; `strict` disables the chain.
* Element/term lookup is per-KEY: a scope present but lacking the key does not
* stop the walk. The join separator travels with the scope that supplied `term`.
*
* Exports: resolve_scope_name, get_scope, get_element_tipo,
*          get_term_tipos, get_fields_separator,
*          SCOPE_FALLBACK, DEFAULT_FIELDS_SEPARATOR
*/



/**
* SCOPE_FALLBACK
* Ordered priority list of scope names used by the fallback chain.
* When the requested scope is absent or lacks a needed key, each candidate
* is tried in order until one is found. The first matching scope wins.
*/
export const SCOPE_FALLBACK = ['main', 'thesaurus', 'relation_list']

/**
* DEFAULT_FIELDS_SEPARATOR
* Fallback join separator applied when a scope node does not declare its own
* `fields_separator`. Preserves the historical ', ' behaviour from the PHP resolver.
*/
export const DEFAULT_FIELDS_SEPARATOR = ', '



/**
* RESOLVE_SCOPE_NAME
* Returns the name of the scope node that will be used for a given request,
* after applying the fallback chain.
*
* Resolution order:
*  1. The requested scope (or 'main' when scope is null) is checked first.
*  2. If not found (and strict is false), SCOPE_FALLBACK is walked in order,
*     skipping the already-tried scope.
*  3. Returns null when no usable scope exists or section_map is invalid.
*
* This function resolves at the *scope* level (the node must exist as an object).
* Use resolve_key_scope instead when you need the scope that contains a specific key.
*
* @param {Object|null} section_map - The section_map config object (config.section_map)
* @param {string|null} scope       - Requested scope name; null defaults to 'main'
* @param {boolean}     strict      - When true, disables the fallback chain
* @returns {string|null} The resolved scope name, or null if none is available
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
* Returns the resolved scope node (a plain object) for a request, applying
* the fallback chain via resolve_scope_name.
*
* Convenience wrapper: callers that only need the raw node (not its name)
* use this instead of resolve_scope_name + manual lookup.
*
* @param {Object|null} section_map - The section_map config object (config.section_map)
* @param {string|null} scope       - Requested scope name; null defaults to 'main'
* @param {boolean}     strict      - When true, disables the fallback chain
* @returns {Object|null} The resolved scope node object, or null if none is available
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
* Returns the name of the first scope that *owns the requested key* (via
* hasOwnProperty), applying the fallback chain.
*
* This is the per-key variant of resolve_scope_name: a scope node that exists
* but does NOT contain `key` is skipped rather than returned. This allows
* callers to pick up a key from a fallback scope even when the originally
* requested scope is present in section_map.
*
* Not exported — internal helper consumed by get_element_tipo and
* get_fields_separator.
*
* @param {Object|null} section_map - The section_map config object (config.section_map)
* @param {string}      key         - The property key to look for within each scope node
* @param {string|null} scope       - Requested scope name; null defaults to 'main'
* @param {boolean}     strict      - When true, disables the fallback chain
* @returns {string|null} The name of the first scope that owns `key`, or null
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
	// (!) hasOwnProperty is required: inherited keys (e.g. from Object.prototype)
	// must never be treated as valid section_map configuration entries.
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
* Returns the raw value of `key` from the first scope that provides it,
* using the per-key fallback chain (always non-strict).
*
* Typical keys: 'term' (tipo or array of tipos for the label),
* 'element' (tipo used as the record identifier), 'image', etc.
* The returned value shape depends on the key; callers should normalise
* arrays vs scalars themselves (see get_term_tipos for a normalised helper).
*
* @param {Object|null} section_map - The section_map config object (config.section_map)
* @param {string}      key         - The configuration key to retrieve
* @param {string|null} scope       - Requested scope name; null defaults to 'main'
* @returns {*} The raw key value (string, Array, boolean, …), or null when absent
*/
export const get_element_tipo = function(section_map, key, scope=null) {

	const name = resolve_key_scope(section_map, key, scope, false)
	if (name===null) {
		return null
	}

	const value = section_map[name][key]
	// Guard against an explicitly-stored undefined (edge case in malformed data).
	return (value===undefined) ? null : value
}//end get_element_tipo



/**
* GET_TERM_TIPOS
* Returns a normalised Array of `term` component tipos for the resolved scope.
*
* The `term` key in a scope node may be a single tipo string or an array of
* tipos when multiple term components are joined. This function always returns
* an Array so callers can iterate uniformly. An empty array is returned when
* no scope provides the `term` key.
*
* The returned array is a shallow copy (slice) so callers can mutate it safely.
*
* @param {Object|null} section_map - The section_map config object (config.section_map)
* @param {string|null} scope       - Requested scope name; null defaults to 'main'
* @returns {Array} Ordered list of term component tipos (may be empty)
*/
export const get_term_tipos = function(section_map, scope=null) {

	const value = get_element_tipo(section_map, 'term', scope)
	if (value===null || value===undefined) {
		return []
	}

	// Normalise: a scalar tipo is wrapped into a single-element array.
	return Array.isArray(value) ? value.slice() : [value]
}//end get_term_tipos



/**
* GET_FIELDS_SEPARATOR
* Returns the `fields_separator` string that should be used when joining
* multiple resolved term values.
*
* The separator is taken from the *same scope node that provided `term`*,
* not from the originally-requested scope. This keeps the join glue
* consistent with the term source: if the thesaurus scope supplies the term
* tipos, its own `fields_separator` is used (or the default if absent).
*
* Falls back to DEFAULT_FIELDS_SEPARATOR (', ') when:
*  - no scope provides a `term` key, or
*  - the scope's `fields_separator` is not a string.
*
* @param {Object|null} section_map - The section_map config object (config.section_map)
* @param {string|null} scope       - Requested scope name; null defaults to 'main'
* @returns {string} The join separator string (never null)
*/
export const get_fields_separator = function(section_map, scope=null) {

	// Find the scope that owns `term` — separator must come from the same scope
	// so that term rendering stays self-consistent even after a chain fallback.
	const term_scope = resolve_key_scope(section_map, 'term', scope, false)
	if (term_scope===null) {
		return DEFAULT_FIELDS_SEPARATOR
	}

	const sep = section_map[term_scope].fields_separator
	return (typeof sep === 'string') ? sep : DEFAULT_FIELDS_SEPARATOR
}//end get_fields_separator



// @license-end
