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
*/
class section_map {



	/**
	* Scope priority for the fallback chain.
	* @var array SCOPE_FALLBACK
	*/
	public const SCOPE_FALLBACK = ['main', 'thesaurus', 'relation_list'];

	/**
	* Default join separator. Preserves the historical implode(', ', …) behavior.
	* @var string DEFAULT_FIELDS_SEPARATOR
	*/
	public const DEFAULT_FIELDS_SEPARATOR = ', ';



	/**
	* GET_MAP
	* Raw section_map object (thin delegate to section::get_section_map, which caches).
	* @param string $section_tipo
	* @return object|null
	*/
	public static function get_map( string $section_tipo ) : ?object {

		return section::get_section_map($section_tipo);
	}//end get_map



	/**
	* RESOLVE_SCOPE_NAME
	* Name of the scope that resolves for a request, applying the fallback chain.
	* @param string $section_tipo
	* @param string|null $scope	Requested scope. null starts the chain at 'main'.
	* @param bool $strict		When true, no chain: the requested scope or null.
	* @return string|null
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
	* @param string $section_tipo
	* @param string|null $scope
	* @param bool $strict
	* @return object|null
	*/
	public static function get_scope( string $section_tipo, ?string $scope=null, bool $strict=false ) : ?object {

		$name = self::resolve_scope_name($section_tipo, $scope, $strict);
		if ($name===null) {
			return null;
		}

		$map	= section::get_section_map($section_tipo);
		$node	= $map->{$name} ?? null;

		return is_object($node) ? $node : null;
	}//end get_scope



	/**
	* RESOLVE_KEY_SCOPE
	* Name of the first scope that PROVIDES $key (requested-first, then chain).
	* Differs from resolve_scope_name: a scope present but lacking $key is skipped.
	* @param string $section_tipo
	* @param string $key
	* @param string|null $scope
	* @param bool $strict
	* @return string|null
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
	* @param string $section_tipo
	* @param string $key
	* @param string|null $scope
	* @return mixed
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
	* For single-tipo consumers (term writing, order tipo, …).
	* @param string $section_tipo
	* @param string $key
	* @param string|null $scope
	* @return string|null
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
	* no scope provides `term`.
	* @param string $section_tipo
	* @param string|null $scope
	* @return array
	*/
	public static function get_term_tipos( string $section_tipo, ?string $scope=null ) : array {

		$value = self::get_element_tipo($section_tipo, 'term', $scope);
		if ($value===null) {
			return [];
		}

		return is_array($value) ? array_values($value) : [$value];
	}//end get_term_tipos



	/**
	* GET_FIELDS_SEPARATOR
	* Per-scope `fields_separator`, taken from the scope that supplied the `term`.
	* Defaults to DEFAULT_FIELDS_SEPARATOR.
	* @param string $section_tipo
	* @param string|null $scope
	* @return string
	*/
	public static function get_fields_separator( string $section_tipo, ?string $scope=null ) : string {

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
	* String label of a record (scope-aware). Public global entry; delegates to
	* ts_term_resolver (single term cache + invalidation).
	* @param object $locator		Needs section_tipo + section_id.
	* @param string|null $scope	null -> chain from 'main'.
	* @param string $lang
	* @param bool $from_cache
	* @return string|null
	*/
	public static function get_term( object $locator, ?string $scope=null, string $lang=DEDALO_DATA_LANG, bool $from_cache=false ) : ?string {

		return ts_term_resolver::get_term_by_locator($locator, $lang, $from_cache, $scope);
	}//end get_term



	/**
	* GET_TERM_DATA
	* Merged raw component data across all `term` tipos of the resolved scope.
	* @param object $locator
	* @param string|null $scope	null -> chain from 'main'.
	* @return array|null
	*/
	public static function get_term_data( object $locator, ?string $scope=null ) : ?array {

		return ts_term_resolver::get_term_data_by_locator($locator, $scope);
	}//end get_term_data



}//end class section_map
