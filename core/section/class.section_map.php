<?php declare(strict_types=1);
/**
* CLASS SECTION_MAP
* Global resolver for the ontology-defined `section_map` property of a section.
*
* A section_map maps semantic roles (term, model, order, parent, is_indexable,
* is_descriptor, …) to component tipos, grouped by *scope*. Historically only the
* `thesaurus` scope existed; this class generalizes resolution to any scope
* (`main`, `thesaurus`, `relation_list`, …) with a fallback chain so a single
* mechanism serves the thesaurus tree, relation lists, graph views, search and
* client visualizations.
*
* Map shape (per-scope `fields_separator` is optional, defaults to ', '):
* {
*   "main":          { "term": ["tch22"] },
*   "thesaurus":     { "term": ["tch22","tch25"], "fields_separator": " ", "model": "tch27", "order": "tch276", "parent": "tch38", "is_indexable": "tch68", "is_descriptor": "tch67" },
*   "relation_list": { "term": ["tch21","tch25","tch32"] }
* }
*
* Resolution rules:
* - The raw map comes from section::get_section_map() (already cached there); this
*   class never duplicates the raw-map cache.
* - Scope fallback: the requested scope is tried first; if it is absent the chain
*   main -> thesaurus -> relation_list is walked, skipping the already-tried scope.
*   A null scope starts the chain at `main`. `strict` disables the chain.
* - Element/term lookup is per-KEY: a scope that exists but lacks the requested key
*   does not stop the walk; resolution continues until a scope HAS the key.
* - The join separator travels with the scope that supplied the `term`.
*
* Term string/raw resolution (get_term / get_term_data) delegates to
* ts_term_resolver, which owns the request-scope term cache and its invalidation
* (worker cache_manager + tree-mutation eviction). This keeps a single term cache
* instead of a parallel one here.
*
* All methods are static; this class is a pure stateless service — no instance
* state, no constructor, and no instance cache of its own.
*
* @package Dédalo
* @subpackage Core
*/
class section_map {



	/**
	* Ordered priority list of scope names used by the fallback chain.
	* When the caller's requested scope is absent from the map, resolution walks
	* this list (skipping the already-tried scope) and returns the first hit.
	* Callers that need strict single-scope resolution should pass $strict=true.
	* @var array SCOPE_FALLBACK
	*/
	public const SCOPE_FALLBACK = ['main', 'thesaurus', 'relation_list'];

	/**
	* Fallback glue string used to join multiple term component values.
	* Preserves the historical implode(', ', …) behavior when no
	* per-scope `fields_separator` is defined in the section_map.
	* @var string DEFAULT_FIELDS_SEPARATOR
	*/
	public const DEFAULT_FIELDS_SEPARATOR = ', ';



	/**
	* GET_MAP
	* Raw section_map object decoded from the ontology node's `properties` JSON.
	* Thin delegate to section::get_section_map(), which owns the static cache; this
	* method never caches independently. Useful when callers need the full map object
	* rather than a resolved key or scope node.
	* @param string $section_tipo - ontology tipo of the section (e.g. 'tch1')
	* @return object|null - the decoded section_map object, or null when the section
	*   has no section_map child in the ontology
	*/
	public static function get_map( string $section_tipo ) : ?object {

		return section::get_section_map($section_tipo);
	}//end get_map



	/**
	* RESOLVE_SCOPE_NAME
	* Name of the scope that resolves for a request, applying the fallback chain.
	* Returns the name of the first scope object present in the map, starting with
	* $scope (defaulting to 'main' when null) and then walking SCOPE_FALLBACK in
	* order. Use this when you need to know *which* scope won, not just its content.
	* @param string $section_tipo - ontology tipo of the section
	* @param string|null $scope = null - requested scope; null defaults to 'main'
	* @param bool $strict = false - when true, the chain is disabled; returns null
	*   if the exact requested scope is absent from the map
	* @return string|null - resolved scope name, or null when nothing matched
	*/
	public static function resolve_scope_name( string $section_tipo, ?string $scope=null, bool $strict=false ) : ?string {

		$map = section::get_section_map($section_tipo);
		if (!is_object($map)) {
			return null;
		}

		// requested scope first (null -> 'main')
		$requested = $scope ?? 'main';
		if (isset($map->{$requested}) && is_object($map->{$requested})) {
			return $requested;
		}

		if ($strict===true) {
			return null;
		}

		// walk the fallback chain, skipping the already-tried scope
		// (!) The scope must be an object, not a scalar, to qualify — this guards
		// against malformed ontology JSON where a scope key maps to null or a string.
		foreach (self::SCOPE_FALLBACK as $candidate) {
			if ($candidate===$requested) {
				continue;
			}
			if (isset($map->{$candidate}) && is_object($map->{$candidate})) {
				return $candidate;
			}
		}

		return null;
	}//end resolve_scope_name



	/**
	* GET_SCOPE
	* Resolved scope node (object) for a request, applying the fallback chain.
	* Returns the raw scope data object (e.g. { "term": ["tch22"], "fields_separator": " " })
	* after running resolve_scope_name to pick the best available scope. Prefer the
	* more specific helpers (get_element_tipo, get_term_tipos) unless the whole scope
	* object is needed for iteration or debugging.
	* @param string $section_tipo - ontology tipo of the section
	* @param string|null $scope = null - requested scope; null defaults to 'main'
	* @param bool $strict = false - when true, disables the fallback chain
	* @return object|null - the scope data object, or null when no scope resolved
	*/
	public static function get_scope( string $section_tipo, ?string $scope=null, bool $strict=false ) : ?object {

		$name = self::resolve_scope_name($section_tipo, $scope, $strict);
		if ($name===null) {
			return null;
		}

		$map	= section::get_section_map($section_tipo);
		$node	= $map->{$name} ?? null;

		// Re-check is_object because the map may have been mutated concurrently
		// between resolve_scope_name and this retrieval (rare but theoretically possible
		// in long-lived worker processes).
		return is_object($node) ? $node : null;
	}//end get_scope



	/**
	* RESOLVE_KEY_SCOPE
	* Name of the first scope that PROVIDES $key (requested-first, then chain).
	* Differs from resolve_scope_name: a scope present but lacking $key is skipped.
	* This is the core of per-key resolution: e.g. a section might define `term`
	* only in `thesaurus` but not in `main`; calling with scope=null and key='term'
	* will walk past the present-but-key-less `main` scope and return 'thesaurus'.
	* @param string $section_tipo - ontology tipo of the section
	* @param string $key - the ontology key to look for (e.g. 'term', 'order', 'parent')
	* @param string|null $scope = null - preferred scope; null defaults to 'main'
	* @param bool $strict = false - when true, no chain; returns null if $key is absent
	*   in the requested scope
	* @return string|null - name of the winning scope, or null when $key was not found
	*   in any scope
	*/
	public static function resolve_key_scope( string $section_tipo, string $key, ?string $scope=null, bool $strict=false ) : ?string {

		$map = section::get_section_map($section_tipo);
		if (!is_object($map)) {
			return null;
		}

		// requested scope first (null -> 'main')
		$requested	= $scope ?? 'main';
		$node		= $map->{$requested} ?? null;
		if (is_object($node) && property_exists($node, $key)) {
			return $requested;
		}

		if ($strict===true) {
			return null;
		}

		// walk the fallback chain, skipping the already-tried scope
		// A scope that exists but lacks $key is intentionally bypassed here —
		// that is the key distinction from resolve_scope_name.
		foreach (self::SCOPE_FALLBACK as $candidate) {
			if ($candidate===$requested) {
				continue;
			}
			$node = $map->{$candidate} ?? null;
			if (is_object($node) && property_exists($node, $key)) {
				return $candidate;
			}
		}

		return null;
	}//end resolve_key_scope



	/**
	* GET_ELEMENT_TIPO
	* Value of $key from the first scope that provides it (per-key chain walk).
	* Returns mixed: values may be string (single tipo), array (term list) or bool
	* (e.g. thesaurus->is_indexable can be `false`, which must pass through unchanged).
	* (!) Do not coerce the return to a string — boolean `false` is a valid ontology
	* value for `is_indexable` and must not be collapsed to null or empty string.
	* Callers needing only a string tipo should use get_first_element_tipo instead.
	* @param string $section_tipo - ontology tipo of the section
	* @param string $key - the ontology key to retrieve (e.g. 'term', 'model', 'is_indexable')
	* @param string|null $scope = null - preferred scope; null defaults to 'main'
	* @return mixed - raw ontology value (string|array|bool|null); null when $key
	*   was not found in any scope
	*/
	public static function get_element_tipo( string $section_tipo, string $key, ?string $scope=null ) : mixed {

		$name = self::resolve_key_scope($section_tipo, $key, $scope, false);
		if ($name===null) {
			return null;
		}

		$map = section::get_section_map($section_tipo);

		return $map->{$name}->{$key} ?? null;
	}//end get_element_tipo



	/**
	* GET_FIRST_ELEMENT_TIPO
	* First tipo of $key as a string (array values collapse to their first element).
	* For single-tipo consumers (term writing, order tipo, parent tipo, …) that only
	* ever write to or read from one component. When an array value is stored in the
	* ontology, reset() picks the first element so the caller always gets a plain string.
	* Returns null when $key is absent, when its value is an empty array, or when the
	* value is neither a string nor an array (e.g. a boolean `is_indexable` flag).
	* @param string $section_tipo - ontology tipo of the section
	* @param string $key - the ontology key (e.g. 'model', 'order', 'parent')
	* @param string|null $scope = null - preferred scope; null defaults to 'main'
	* @return string|null - the first (or only) tipo string, or null when unavailable
	*/
	public static function get_first_element_tipo( string $section_tipo, string $key, ?string $scope=null ) : ?string {

		$value = self::get_element_tipo($section_tipo, $key, $scope);
		if (is_array($value)) {
			$value = reset($value);
		}

		return is_string($value) ? $value : null;
	}//end get_first_element_tipo



	/**
	* GET_TERM_TIPOS
	* Normalized list of `term` component tipos for the resolved scope.
	* A string or an array in the ontology both become an array here; empty when
	* no scope provides `term`. Callers iterate the result to fetch component data
	* from all term components and merge their datos into a single label string.
	* ts_term_resolver::get_term_by_locator() uses this as its source of tipos.
	* @param string $section_tipo - ontology tipo of the section
	* @param string|null $scope = null - preferred scope; null defaults to 'main'
	* @return array - zero-indexed array of tipo strings; empty array when the map
	*   has no `term` key in any scope
	*/
	public static function get_term_tipos( string $section_tipo, ?string $scope=null ) : array {

		$value = self::get_element_tipo($section_tipo, 'term', $scope);
		if ($value===null) {
			return [];
		}

		// Normalize: ontology may store term as a single string or as an array.
		// array_values re-indexes in case the ontology JSON has non-sequential keys.
		return is_array($value) ? array_values($value) : [$value];
	}//end get_term_tipos



	/**
	* GET_FIELDS_SEPARATOR
	* Per-scope `fields_separator`, taken from the scope that supplied the `term`.
	* The separator is intentionally fetched from the *same scope as `term`*: a
	* section that overrides `term` in `relation_list` but not in `thesaurus` may
	* also define a different separator for that override scope. Using a different
	* scope for the separator would produce wrong output. Falls back to
	* DEFAULT_FIELDS_SEPARATOR (', ') when the winning term-scope defines no separator.
	* @param string $section_tipo - ontology tipo of the section
	* @param string|null $scope = null - preferred scope; null defaults to 'main'
	* @return string - the separator string; never null
	*/
	public static function get_fields_separator( string $section_tipo, ?string $scope=null ) : string {

		// Resolve the scope that owns `term` — the separator must come from the
		// same scope so the two values are always consistent.
		$term_scope = self::resolve_key_scope($section_tipo, 'term', $scope, false);
		if ($term_scope===null) {
			return self::DEFAULT_FIELDS_SEPARATOR;
		}

		$map	= section::get_section_map($section_tipo);
		$sep	= $map->{$term_scope}->fields_separator ?? null;

		return is_string($sep) ? $sep : self::DEFAULT_FIELDS_SEPARATOR;
	}//end get_fields_separator



	/**
	* GET_TERM
	* String label of a record (scope-aware). Public global entry point for callers
	* that need a human-readable term string from a locator (e.g. diffusion, portals,
	* relation-list labels). Delegates to ts_term_resolver::get_term_by_locator(),
	* which owns the request-scope term cache and its invalidation. This class does
	* NOT maintain a separate cache; call ts_term_resolver::clear() or
	* ts_term_resolver::invalidate_node() to evict stale entries.
	* @param object $locator - must have `section_tipo` and `section_id` properties
	* @param string|null $scope = null - preferred scope; null walks the chain from 'main'
	* @param string $lang = DEDALO_DATA_LANG - language code for the term lookup
	* @param bool $from_cache = false - when true, returns the cached value if present
	*   without re-reading component data; pass false to force a fresh read
	* @return string|null - the joined term string, or null when no term tipos were found
	*/
	public static function get_term( object $locator, ?string $scope=null, string $lang=DEDALO_DATA_LANG, bool $from_cache=false ) : ?string {

		return ts_term_resolver::get_term_by_locator($locator, $lang, $from_cache, $scope);
	}//end get_term



	/**
	* GET_TERM_DATA
	* Merged raw component data across all `term` tipos of the resolved scope.
	* Returns the concatenated dato arrays from each term component instance for the
	* given locator, suitable for callers that need structured data (e.g. JSON export
	* or multi-language processing) rather than a display string. Delegates to
	* ts_term_resolver::get_term_data_by_locator(); see that method for the merge
	* strategy and the language-independent behavior (no $lang parameter here).
	* @param object $locator - must have `section_tipo` and `section_id` properties
	* @param string|null $scope = null - preferred scope; null walks the chain from 'main'
	* @return array|null - merged dato array from all term component instances, or null
	*   when no term tipos were found or when $locator lacks required properties
	*/
	public static function get_term_data( object $locator, ?string $scope=null ) : ?array {

		return ts_term_resolver::get_term_data_by_locator($locator, $scope);
	}//end get_term_data



}//end class section_map
