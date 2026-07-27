<?php declare(strict_types=1);
/**
* CLASS TS_TERM_RESOLVER
* Resolves thesaurus (and broader scope) term strings and raw datos from locators.
*
* Extracted from ts_object to isolate term resolution — a concern needed widely by
* diffusion, exports, portals, section_map, and language resolution — from the tree
* node building logic that lives in ts_object proper. ts_object and section_map both
* keep thin static delegates so every existing call site is unaffected.
*
* Responsibilities:
* - get_term_by_locator()      : Returns the human-readable label for a locator as a
*   plain string, joining multi-component terms with the scope-defined separator.
* - get_term_data_by_locator() : Returns the raw merged dato array for all `term`
*   component tipos of the resolved scope; callers that need structured dato objects
*   (e.g. for re-encoding or lang-aware diffusion) use this instead of the string form.
* - invalidate_node()          : Evicts cache entries for one node (all langs/scopes)
*   after a tree write, preventing stale reads within the same worker request.
* - clear()                    : Full cache flush; registered in the worker cache_manager
*   (RoadRunner) so persistent workers never bleed cached terms across HTTP requests.
*
* Both resolution methods delegate scope lookup to section_map::get_term_tipos() and
* section_map::get_fields_separator(), which apply the scope fallback chain
* (main → thesaurus → relation_list) defined in section_map::SCOPE_FALLBACK.
* When $scope='thesaurus' (the default), historical single-scope behavior is preserved.
*
* The term string is built by instantiating each `term` component tipo via
* component_common::get_instance() and calling get_value() on the requested lang.
* If get_value() returns empty (no dato for that lang), a fallback is performed via
* component_string_common::get_value_with_fallback_from_data() using the section's
* main language as determined by hierarchy::get_main_lang().
*
* Cache contract:
* - The cache key is "{section_tipo}_{section_id}_{scope}_{lang}".
* - The cache is request-scoped (static array) and is bounded to 1 000 entries;
*   when the limit is reached the entire cache is dropped rather than using LRU,
*   making the flush cheap but potentially warm-up-heavy on extremely high fan-out
*   requests. See get_term_by_locator() for the eviction comment.
* - invalidate_node() matches entries by the "{tipo}_{id}_" prefix so all
*   lang × scope combinations for a node are evicted together.
*
* Extended by / delegates from:
* - ts_object::get_term_by_locator()      — thin delegate (backward compat)
* - ts_object::get_term_data_by_locator() — thin delegate (backward compat)
* - ts_object::invalidate_node()          — thin delegate
* - ts_object::clear()                    — calls ts_term_resolver::clear()
* - section_map::get_term()               — primary public-facing entry point
* - section_map::get_term_data()          — public-facing entry point
*
* @package Dédalo
* @subpackage Core
*/
class ts_term_resolver {



	/**
	* Request-scope term-string cache keyed by locator × scope × lang.
	*
	* Key format: "{section_tipo}_{section_id}_{scope}_{lang}"
	* where $scope is the empty string when the caller passed null (chain mode).
	*
	* Populated and read by get_term_by_locator(). Evicted selectively by
	* invalidate_node() (prefix match on "{tipo}_{id}_") or wholesale by clear().
	* The cache is never persisted beyond the current PHP process / worker request.
	* @var array $term_by_locator_data_cache
	*/
	public static array $term_by_locator_data_cache = [];



	/**
	* GET_TERM_DATA_BY_LOCATOR
	* Returns the merged raw dato array across all `term` component tipos for the
	* resolved scope. Intended for callers that need structured dato objects rather
	* than a ready-to-display string (e.g. diffusion lang encoding, re-export).
	*
	* Each `term` tipo is instantiated via component_common::get_instance() in 'list'
	* mode using DEDALO_DATA_LANG. All non-empty dato arrays are spread-merged in
	* declaration order; the result is a flat array of dato objects.
	*
	* Returns null when:
	* - $locator is not an object or lacks section_tipo.
	* - section_map resolves no term tipos for the scope.
	* - section_id or section_tipo are empty on the locator.
	*
	* Note: this method does NOT cache; call get_term_by_locator() when you only need
	* the display string and want the request-scope cache to apply.
	*
	* @param object $locator - locator with at minimum section_tipo and section_id
	* @param string|null $scope = 'thesaurus' - section_map scope to resolve; null
	*   activates the fallback chain (main → thesaurus → relation_list)
	* @return array|null - flat merged dato array, or null on failure
	*/
	public static function get_term_data_by_locator( object $locator, ?string $scope='thesaurus' ) : ?array {

		// check valid object
		// Guard against scalar/null callers that occasionally slip through in
		// diffusion paths before the locator is fully hydrated.
			if (!is_object($locator) || !property_exists($locator, 'section_tipo')) {
				if(SHOW_DEBUG===true) {
					debug_log(__METHOD__
						." ERROR on get term. locator is not of type object: ".gettype($locator)." FALSE VALUE IS RETURNED !"
						, logger::ERROR
					);
				}
				return null;
			}

		$section_id		= $locator->section_id;
		$section_tipo	= $locator->section_tipo;

		// term tipos from the resolved scope (null-safe; chain-aware)
		// section_map applies SCOPE_FALLBACK internally when $scope is null.
		$ar_tipo = section_map::get_term_tipos($section_tipo, $scope);

		if(empty($ar_tipo) || empty($section_id) || empty($section_tipo)) {
			debug_log(__METHOD__
				." ERROR on get term. ar_tipo is empty or section_id or section_tipo is empty. NULL VALUE IS RETURNED !"
				, logger::ERROR
			);
			return null;
		}

		$ar_value = [];
		foreach ($ar_tipo as $tipo) {

			// Instantiate in 'list' mode so get_data() returns the full dato array
			// without any view-layer filtering that 'edit' mode might apply.
			$model		= ontology_node::get_model_by_tipo($tipo,true);
			$component	= component_common::get_instance(
				$model,
				$tipo,
				$section_id,
				'list',
				DEDALO_DATA_LANG,
				$section_tipo
			);
			$data = $component->get_data();

			if (!empty($data)) {
				$ar_value = [...$ar_value, ...$data];
			}
		}//end foreach ($ar_tipo as $tipo)

		// final value
		// Assigned separately to make the return value explicit on a named variable,
		// consistent with the rest of the codebase's debugging convention.
			$final_value = $ar_value;


		return $final_value;
	}//end get_term_data_by_locator



	/**
	* GET_TERM_BY_LOCATOR
	* Returns the display string for a thesaurus (or scoped) term identified by
	* the given locator, with request-scope caching.
	*
	* Resolution steps:
	* 1. Validate that $locator carries section_tipo; return null on failure.
	* 2. Build the cache key and serve from cache when $from_cache=true and hit.
	* 3. Ask section_map::get_term_tipos() for the ordered list of `term` component
	*    tipos for the scope (applies the SCOPE_FALLBACK chain when $scope is null).
	* 4. If no tipos are found, build a fallback string from the locator fields
	*    (section_tipo_section_id[_component_tipo[_tag_id]]) — this handles orphaned
	*    locators that point to unmapped section types.
	* 5. For each tipo, call get_value() for $lang; if that is empty, call
	*    component_string_common::get_value_with_fallback_from_data() using the
	*    section's main lang so terms always render something even when the record
	*    has no dato in the requested language.
	* 6. Join all non-empty term fragments with the scope-defined fields_separator
	*    (defaults to section_map::DEFAULT_FIELDS_SEPARATOR = ', ').
	* 7. Write the result to cache (or null if nothing resolved). Cache is bounded at
	*    1 000 entries and fully cleared on overflow rather than using LRU eviction.
	*
	* @param object $locator - locator with section_tipo and section_id required
	* @param string $lang = DEDALO_DATA_LANG - target display language
	* @param bool $from_cache = false - when true, return cached result if available;
	*   always writes the result to cache regardless of this flag
	* @param string|null $scope = 'thesaurus' - section_map scope; null activates the
	*   fallback chain; 'thesaurus' preserves historical single-scope behavior
	* @return string|null - resolved term string, the locator-string fallback, or null
	*   when the locator is invalid
	*/
	public static function get_term_by_locator( object $locator, string $lang=DEDALO_DATA_LANG, bool $from_cache=false, ?string $scope='thesaurus' ) : ?string {

		$value = null;

		// check locator->section_tipo mandatory property
		// Typed hint is object but does not guarantee inner properties exist.
			if (!property_exists($locator, 'section_tipo')) {
				if(SHOW_DEBUG===true) {
					debug_log(__METHOD__
						." ERROR on get term. locator is not of type object: ".gettype($locator)." FALSE VALUE IS RETURNED !"
						, logger::ERROR
					);
				}
				return $value; // null
			}

		$section_tipo	= $locator->section_tipo;
		$section_id		= $locator->section_id;

		// Cache control (request scope). Scope-aware key avoids cross-scope pollution.
		// invalidate_node() still matches on the "{tipo}_{id}_" prefix.
		// $scope null → '' so that the cache key remains a string with no ambiguity.
			$scope_key = $scope ?? '';
			$cache_uid = $section_tipo.'_'.$section_id.'_'.$scope_key.'_'.$lang;
			if ($from_cache===true && isset(self::$term_by_locator_data_cache[$cache_uid])) {
				return self::$term_by_locator_data_cache[$cache_uid];
			}

		// term tipos from the resolved scope (null-safe; chain-aware)
		// A null $scope means "walk the chain"; 'thesaurus' restricts to that scope.
			$term_tipos = section_map::get_term_tipos($section_tipo, $scope);
			if (empty($term_tipos)) {

				// no usable map/term: legacy locator-string fallback
				// Produces a deterministic non-empty string so callers always receive
				// something renderable, even for sections without a section_map.
				$value = $section_tipo .'_'. $section_id;
				if(isset($locator->component_tipo))
					$value .= '_'. $locator->component_tipo;
				if(isset($locator->tag_id))
					$value .= '_'. $locator->tag_id;

			}else{

				$ar_value = [];
				foreach ($term_tipos as $tipo) {

					$model_name = ontology_node::get_model_by_tipo($tipo,true);

					// Instantiate in 'list' mode; we only need the value string,
					// not any edit-UI specific rendering.
					$component = component_common::get_instance(
						$model_name,
						$tipo,
						$section_id,
						'list',
						$lang,
						$section_tipo
					);
					$current_value = $component->get_value();

					if (empty($current_value)) {
						// lang fallback: if the record has no dato for $lang, try the
						// section's main language so the term is never silently empty.
						$main_lang = hierarchy::get_main_lang( $section_tipo );
						$data = $component->get_data();
						$current_value = component_string_common::get_value_with_fallback_from_data(
							$data,
							true,
							$main_lang,
							$lang
						);
					}

					if (!empty($current_value)) {
						$ar_value[] = $current_value;
					}
				}
				// separator travels with the scope that supplied the term
				// (e.g. thesaurus scope may use ' ' while relation_list uses ', ')
				$separator	= section_map::get_fields_separator($section_tipo, $scope);
				$value		= implode($separator, $ar_value);
			}

		// cache control
		// (!) Overflow eviction drops the entire cache rather than using LRU.
		// This keeps the eviction path O(1) and avoids per-entry housekeeping, but
		// means a single unusually large request can repeatedly warm and evict.
		// 1 000 entries covers virtually all normal request fan-outs comfortably.
			if (count(self::$term_by_locator_data_cache) >= 1000) {
				self::$term_by_locator_data_cache = [];
			}
			self::$term_by_locator_data_cache[$cache_uid] = $value;


		return $value;
	}//end get_term_by_locator



	/**
	* INVALIDATE_NODE
	* Evicts all cached term strings for a single node across every lang and scope.
	*
	* Called by ts_object::invalidate_node() immediately after any write that modifies
	* a thesaurus node's term components so that subsequent reads within the same
	* persistent-worker request do not serve the pre-mutation string.
	*
	* The eviction is a prefix scan: keys that start with "{section_tipo}_{section_id}_"
	* are removed. This covers every "{tipo}_{id}_{scope}_{lang}" combination cached
	* for that node without needing to enumerate scopes or langs explicitly.
	*
	* @param string $section_tipo - ontology tipo of the section (e.g. 'tch1')
	* @param int|string $section_id - record id of the mutated node
	* @return void
	*/
	public static function invalidate_node( string $section_tipo, int|string $section_id ) : void {

		$prefix = $section_tipo . '_' . $section_id . '_';
		foreach (array_keys(self::$term_by_locator_data_cache) as $key) {
			if (strpos($key, $prefix)===0) {
				unset(self::$term_by_locator_data_cache[$key]);
			}
		}
	}//end invalidate_node



	/**
	* CLEAR
	* Full reset of the request-scope term cache.
	*
	* Registered in the worker cache_manager (RoadRunner) so long-running PHP workers
	* never bleed term strings cached in one HTTP request into the next. Also called
	* transitively by ts_object::clear(), which is itself the primary cache_manager
	* registration point for the entire ts_object subsystem.
	*
	* Prefer invalidate_node() for targeted post-mutation eviction; only call clear()
	* when you need a guaranteed clean slate (e.g. test teardown, request boundary).
	* @return void
	*/
	public static function clear() : void {

		self::$term_by_locator_data_cache = [];
	}//end clear



}//end class ts_term_resolver
