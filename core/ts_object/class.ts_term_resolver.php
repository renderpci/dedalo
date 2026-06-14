<?php declare(strict_types=1);
/**
* CLASS TS_TERM_RESOLVER
* Resolves thesaurus term values (string or raw dato) from locators.
*
* Extracted from ts_object to separate term resolution (used widely by
* diffusion, exports, portals, lang) from tree node building. ts_object keeps
* thin static delegates so existing callers are unaffected.
*
* Holds the request-scope term cache and its invalidation:
* - clear()            full reset (registered in worker cache_manager)
* - invalidate_node()  targeted eviction after tree mutations
*/
class ts_term_resolver {



	/**
	 * Static cache mapping locators to their term string per lang.
	 * Key format: "{section_tipo}_{section_id}_{lang}"
	 * @var array $term_by_locator_data_cache
	 */
	public static array $term_by_locator_data_cache = [];



	/**
	* GET_TERM_DATO_BY_LOCATOR
	* @param object $locator
	* @return array|null $final_value
	*/
	public static function get_term_dato_by_locator( object $locator ) : ?array {

		// check valid object
			if (!is_object($locator) || !property_exists($locator, 'section_tipo')) {
				if(SHOW_DEBUG===true) {
					debug_log(__METHOD__
						." ERROR on get term. locator is not of type object: ".gettype($locator)." FALSE VALUE IS RETURNED !"
						, logger::ERROR
					);
				}
				return null;
			}

		$section_map	= section::get_section_map($locator->section_tipo);
		$thesaurus_map	= isset($section_map->thesaurus) ? $section_map->thesaurus : false;

		$ar_tipo		= is_array($thesaurus_map->term) ? $thesaurus_map->term : [$thesaurus_map->term];
		$section_id		= $locator->section_id;
		$section_tipo	= $locator->section_tipo;

		if(empty($ar_tipo) || empty($section_id) || empty($section_tipo)) {
			debug_log(__METHOD__
				." ERROR on get term. ar_tipo is empty or section_id or section_tipo is empty. NULL VALUE IS RETURNED !"
				, logger::ERROR
			);
			return null;
		}

		$ar_value = [];
		foreach ($ar_tipo as $tipo) {

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
		}//end foreach ($ar_tipo as $tipo) {

		// final value
			$final_value = $ar_value;


		return $final_value;
	}//end get_term_dato_by_locator



	/**
	 * GET_TERM_BY_LOCATOR
	 * Retrieves the string representation of a term given its locator.
	 *
	 * @param object $locator
	 * @param string $lang
	 * @param bool $from_cache
	 * @return string|null
	 */
	public static function get_term_by_locator( object $locator, string $lang=DEDALO_DATA_LANG, bool $from_cache=false ) : ?string {

		$valor = null;

		// check locator->section_tipo mandatory property
			if (!property_exists($locator, 'section_tipo')) {
				if(SHOW_DEBUG===true) {
					debug_log(__METHOD__
						." ERROR on get term. locator is not of type object: ".gettype($locator)." FALSE VALUE IS RETURNED !"
						, logger::ERROR
					);
				}
				return $valor; // null
			}

		// Cache control (request scope)
			$cache_uid = $locator->section_tipo.'_'.$locator->section_id.'_'.$lang;
			if ($from_cache===true && isset(self::$term_by_locator_data_cache[$cache_uid])) {
				return self::$term_by_locator_data_cache[$cache_uid];
			}

		// thesaurus_map conditional value
			$section_map	= section::get_section_map($locator->section_tipo);
			$thesaurus_map	= isset($section_map->thesaurus) ? $section_map->thesaurus : false;
			if ($thesaurus_map===false) {

				$valor = $locator->section_tipo .'_'. $locator->section_id ;
				if(isset($locator->component_tipo))
					$valor .= '_'. $locator->component_tipo;
				if(isset($locator->tag_id))
					$valor .= '_'. $locator->tag_id;

			}else{

				$term		= is_array($thesaurus_map->term) ? $thesaurus_map->term : [$thesaurus_map->term]; // source could be an array or string
				$ar_valor	= [];
				foreach ($term as $tipo) {

					$parent			= $locator->section_id;
					$section_tipo	= $locator->section_tipo;
					$model_name		= ontology_node::get_model_by_tipo($tipo,true);

					$component = component_common::get_instance(
						$model_name,
						$tipo,
						$parent,
						'list',
						$lang,
						$section_tipo
					);
					$current_value = $component->get_value();

					if (empty($current_value)) {
						$main_lang = hierarchy::get_main_lang( $locator->section_tipo );
						$data = $component->get_data();
						$current_value = component_string_common::get_value_with_fallback_from_data(
							$data,
							true,
							$main_lang,
							$lang
						);
					}

					if (!empty($current_value)) {
						$ar_valor[] = $current_value;
					}
				}
				$valor = implode(', ', $ar_valor);
			}

		// cache control
			if (count(self::$term_by_locator_data_cache) >= 1000) {
				self::$term_by_locator_data_cache = [];
			}
			self::$term_by_locator_data_cache[$cache_uid] = $valor;


		return $valor;
	}//end get_term_by_locator



	/**
	* INVALIDATE_NODE
	* Evicts the cached term strings of one node (all langs).
	* Called after tree mutations so subsequent reads (worker mode) do not
	* serve stale terms.
	* @param string $section_tipo
	* @param int|string $section_id
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
	* Full cache reset. Registered in worker cache_manager (RoadRunner) so a
	* long-running worker never serves terms cached in a previous request.
	* @return void
	*/
	public static function clear() : void {

		self::$term_by_locator_data_cache = [];
	}//end clear



}//end class ts_term_resolver
