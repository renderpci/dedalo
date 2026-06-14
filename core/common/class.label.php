<?php declare(strict_types=1);
/**
* CLASS LABEL
* Centralized UI-string registry for the Dédalo application.
*
* Resolves human-readable label strings that are stored in the ontology (terms
* whose model is 'label') for any requested language, then caches the resulting
* key→value map so subsequent requests pay no database cost.
*
* Responsibilities:
* - Build the full label map for a given language by iterating over every
*   ontology term whose model property is 'label', reading the term's
*   'properties.name' field as the PHP-side key and its localized title as
*   the translated string.
* - Maintain a two-level cache: a per-request class-static array (fastest) and
*   a persistent file cache via dd_cache so the map survives across requests
*   without re-querying the ontology.
* - Expose reverse lookups: given a translated string, return its key; given
*   a key, return its tipo identifier.
*
* Cache file naming is centralized through build_cache_file_name() so that
* area_maintenance (which rebuilds ontology data) can invalidate precisely the
* right file when labels change.
*
* The class is declared abstract because all methods are static; it is never
* instantiated directly.
*
* @package Dédalo
* @subpackage Core
*/
abstract class label {



	/**
	* Per-language label maps, keyed by normalized language code.
	* Populated lazily by get_ar_label() on first access for each language and
	* kept for the lifetime of the PHP process / worker to avoid repeated
	* file-cache or ontology reads.
	* Shape: [ 'lg-spa' => [ 'quit' => 'Salir', … ], … ]
	* @var array $ar_label
	*/
	public static array $ar_label = [];



	/**
	* GET_AR_LABEL
	* Returns the complete key→translated-string map for the requested language,
	* building and caching it on first access.
	*
	* Three-tier resolution order:
	*   1. Class static ($ar_label[$lang]) — cheapest; avoids any I/O.
	*   2. Persistent file cache (dd_cache) — survives PHP process restarts.
	*   3. Fresh ontology walk via set_static_label_vars() — writes both caches
	*      before returning so subsequent requests hit tier 1 or 2.
	*
	* Pass $use_file_cache=false only in maintenance contexts where the cache
	* is known to be stale (e.g. after an ontology update).
	*
	* @param string $lang = DEDALO_APPLICATION_LANG - BCP-47 language code; normalized
	*   internally via lang::get_label_lang() (e.g. 'lg-vlca' → 'lg-cat').
	* @param bool $use_file_cache = true - when false, skips both the static and
	*   file caches and forces a fresh ontology walk (cache is NOT written back).
	* @return array $ar_label - flat associative map of label-key → translated string.
	*/
	public static function get_ar_label( string $lang=DEDALO_APPLICATION_LANG, bool $use_file_cache=true ) : array {

		// get the lang to be used to get the labels
			$lang = lang::get_label_lang( $lang );

		// cache
			if ($use_file_cache===true) {

				// static cache
				if(isset(label::$ar_label[$lang])) {
					return label::$ar_label[$lang];
				}

				// cache file read
				$ar_label = dd_cache::cache_from_file((object)[
					'file_name'	=> label::build_cache_file_name($lang)
				]);
				if (!empty($ar_label)) {

					// static cache
					label::$ar_label[$lang] = $ar_label;

					return $ar_label;
				}
			}

		// Calculate label for current lang and store
			$ar_label = self::set_static_label_vars( $lang );

		// cache file write
			if ($use_file_cache===true) {

				// static cache
				label::$ar_label[$lang] = $ar_label;

				// cache file write
				dd_cache::cache_to_file((object)[
					'data'		=> $ar_label,
					'file_name'	=> label::build_cache_file_name($lang)
				]);
			}


		return $ar_label;
	}//end get_ar_label



	/**
	* GET_LABEL
	* Returns the translated string for a single label key in the requested language.
	*
	* Delegates to get_ar_label() so the full label map is built (and cached) the
	* first time any key is requested; subsequent calls within the same request are
	* served from the class-static cache at negligible cost.
	*
	* When the key is absent from the map the raw key is returned wrapped in a
	* <mark> element (via component_common::decorate_untranslated()) so missing
	* translations are visually obvious in the UI rather than silently empty.
	*
	* @param string $name - label key as defined in the ontology term's
	*   'properties.name' field (e.g. 'quit', 'save', 'section_id').
	* @param string $lang = DEDALO_APPLICATION_LANG - BCP-47 language code.
	* @return string $label - translated string, or the decorated key if not found.
	*/
	public static function get_label(string $name, string $lang=DEDALO_APPLICATION_LANG) : string {

		// get the lang to be used to get the labels
			$lang = lang::get_label_lang( $lang );

		// Calculate values (is calculated once)
		label::get_ar_label($lang);

		$label = (!isset(label::$ar_label[$lang][$name]))
			? component_common::decorate_untranslated($name)
			: label::$ar_label[$lang][$name];


		return $label;
	}//end get_label



	/**
	* GET_VAR_FROM_LABEL
	* Reverse-lookup: given a translated string, return its label key.
	*
	* Performs a case-insensitive linear scan of the label map for the requested
	* language. Intended for import/export pipelines and migration scripts where
	* a human-readable string must be mapped back to a stable programmatic key.
	*
	* Returns null if no matching translation is found or if the label map for
	* the language is unavailable.
	*
	* @param string $label - the translated string to look up (e.g. 'Salir').
	* @param string $lang = DEDALO_APPLICATION_LANG - BCP-47 language code.
	* @return string|null - the label key (e.g. 'quit'), or null if not found.
	*/
	public static function get_var_from_label($label, $lang=DEDALO_APPLICATION_LANG) : ?string {

		// get the lang to be used to get the labels
			$lang = lang::get_label_lang( $lang );

		// Calculate values (is calculated once)
		label::get_ar_label($lang);

		if(!isset(label::$ar_label[$lang])) {
			return null;
		}

		// Search in array to resolve
		foreach (label::$ar_label[$lang] as $key => $value) {
			if ( strtolower($value) === strtolower($label) ) {
				return $key;
			}
		}

		return null;
	}//end get_var_from_label



	/**
	* SET_STATIC_LABEL_VARS
	* Builds the label map from scratch by walking every ontology term whose
	* model is 'label' and resolving its localized title for the given language.
	*
	* This is the authoritative builder. It is called by get_ar_label() when
	* neither the static cache nor the file cache contains the requested language,
	* and is also invoked directly by area_maintenance when the ontology is
	* updated so that stale cache entries are replaced.
	*
	* For each qualifying term the method:
	*   1. Loads the ontology_node and reads its 'properties.name' field, which
	*      becomes the PHP-side label key.
	*   2. Resolves the term's localized title via ontology_node::get_term_by_tipo()
	*      with $fallback=true, so a missing translation falls back to the nearest
	*      available language rather than producing an empty entry.
	*   3. Skips — with an ERROR log — any term whose 'properties' or 'name' is
	*      absent, since such terms are misconfigured in the ontology.
	*
	* Visibility is protected so callers outside this class must go through
	* get_ar_label() and benefit from caching.
	*
	* @param string $lang = DEDALO_APPLICATION_LANG - BCP-47 language code; already
	*   normalized by the caller, but normalized again here defensively.
	* @return array $ar_label - flat map of label-key → translated string.
	*/
	protected static function set_static_label_vars( string $lang=DEDALO_APPLICATION_LANG ) : array {

		if(SHOW_DEBUG===true) $start_time = start_time();

		// get the lang to be used to get the labels
			$lang = lang::get_label_lang( $lang );

		$ar_label	= array();
		$cached		= false;
		$fallback	= true;

		$ar_term = ontology_utils::get_ar_tipo_by_model('label');
		foreach ($ar_term as $current_tipo) {

			$ontology_node	= ontology_node::get_instance($current_tipo);
			$properties		= $ontology_node->get_properties();

			// No data in field 'properties'
				if(empty($properties) || empty($properties->name)) {
					debug_log(__METHOD__
						." Ignored Term $current_tipo with model 'label' don't have properly configured 'properties'. Please solve this ASAP" . PHP_EOL
						.' properties: '. to_string($properties)
						, logger::ERROR
					);
					continue;
				}

			// get label value
				$label = ontology_node::get_term_by_tipo(
					$current_tipo,
					$lang,
					$cached,
					$fallback
				);
				if (empty($label)) {
					debug_log(__METHOD__
						. " Unable to resolve label for term: " . PHP_EOL
						. ' current_tipo: ' . to_string($current_tipo)
						, logger::ERROR
					);
					continue;
				}

			// add
				$ar_label[$properties->name] = $label;
		}

		if(SHOW_DEBUG===true) {
			debug_log(__METHOD__." for lang: $lang ".exec_time_unit($start_time,'ms').' ms', logger::WARNING);
		}


		return $ar_label;
	}//end set_static_label_vars



	/**
	* GET_TIPO_FROM_LABEL
	* Returns the ontology tipo identifier for the term whose 'properties.name'
	* matches the given label key.
	*
	* Useful when code needs to navigate to the ontology node for a label term
	* (e.g. to update its translation or inspect its configuration) given only
	* the programmatic key used in PHP code.
	*
	* Unlike get_label() this method works on the ontology term structure rather
	* than on translated strings, so it is language-independent.
	*
	* Returns null if no term with model 'label' carries the requested name in
	* its 'properties.name' field.
	*
	* @param string $label - the label key to find (e.g. 'quit'), NOT a
	*   translated string — use get_var_from_label() for the reverse of get_label().
	* @return string|null $tipo - ontology tipo of the matching term, or null.
	*/
	public static function get_tipo_from_label( string $label ) : ?string {

		if(SHOW_DEBUG===true) {
			$start_time = start_time();
		}

		$tipo = null;

		$ar_term_id_by_model_name = (array)ontology_utils::get_ar_tipo_by_model('label');
		foreach ($ar_term_id_by_model_name as $current_tipo) {

			$ontology_node	= ontology_node::get_instance($current_tipo);
			$properties		= $ontology_node->get_properties();

			// No data in field 'properties'
			if(empty($properties) || empty($properties->name)) {
				trigger_error("Term $current_tipo with model 'label' don't have properly configured 'properties'. Please solve this ASAP");
				continue;
			}

			if ($properties->name===$label) {
				$tipo = $current_tipo;
				break;
			}
		}

		if(SHOW_DEBUG===true) {
			debug_log(__METHOD__." Total  ".exec_time_unit($start_time,'ms').' ms');
		}


		return $tipo;
	}//end get_tipo_from_label



	/**
	* BUILD_CACHE_FILE_NAME
	* Returns the canonical file-cache filename for the label map of the given
	* language, used consistently by both readers and writers so there is never
	* a mismatch between the file that is written and the file that is read.
	*
	* The language code is embedded in the name so each language has its own
	* cache file and they cannot collide.
	*
	* @param string $lang - normalized BCP-47 language code (e.g. 'lg-spa').
	* @return string - filename passed to dd_cache (e.g. 'cache_labels_lg-spa.php').
	*/
	public static function build_cache_file_name( string $lang ) : string {

		return 'cache_labels_' . $lang . '.php';
	}//end build_cache_file_name



}//end class label
