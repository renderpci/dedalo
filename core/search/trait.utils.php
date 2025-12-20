<?php declare(strict_types=1);
/**
* CLASS SEARCH
* TRAIT utils
* Useful methods for search class
*/
trait utils {



    /**
	* GET_TABLE_ALIAS_FROM_PATH
	* @param array $path
	* @return string $table_alias
	*/
	public function get_table_alias_from_path( array $path ) : string {

		$total	= count($path);
		$ar_key = [];
		foreach ($path as $key => $step_object) {

			if ($total===1) {

				$ar_key[] = $this->main_section_tipo_alias; // mix

			}else{

				$ar_key[] = ($key === $total-1)
					? self::trim_tipo($step_object->section_tipo) // last
					: self::trim_tipo($step_object->section_tipo) .'_'. self::trim_tipo($step_object->component_tipo);
			}

		}//foreach ($path as  $step_object)

		$table_alias = implode('_', $ar_key);

		return $table_alias;
	}//end get_table_alias_from_path



    /**
	* TRIM_TIPO
	* Contract the tipo to prevent large names in SQL sentences
	* @see search_Test::test_trim_tipo
	* @param string $tipo
	* @param int $max = 2
	* @return string|null $trimmed_tipo
	*/
	public static function trim_tipo( string $tipo, int $max=2 ) : ?string {

		// empty case
			if (empty($tipo)) {
				debug_log(__METHOD__
					." Error empty tipo is received " .PHP_EOL
					.' tipo: ' . to_string($tipo)
					, logger::ERROR
				);
				if(SHOW_DEBUG===true) {
					$bt		= debug_backtrace();
					dump($bt, ' debug_backtrace ++ '.to_string());
				}
				return null;
			}

		// all case. Used by related search that don't know the section_tipo
			if($tipo==='all') {
				return $tipo;
			}

		// match regex
			preg_match("/^([a-z]+)([0-9]+)$/", $tipo, $matches);
			if (empty($matches) || empty($matches[1]) || (empty($matches[2]) && $matches[2]!=0) ) {
				debug_log(__METHOD__
					." Error on preg match tipo: $tipo ". PHP_EOL
					.'tipo: '.to_string($tipo)
					, logger::ERROR
				);
				return null;
			}

		$name	= $matches[1];
		$number	= $matches[2];

		$trimmed_tipo = substr($name, 0, $max) . $number;


		return $trimmed_tipo;
	}//end trim_tipo



    /**
	* GET_QUERY_PATH
	* Recursive function to obtain final complete path of each element in json query object
	* Used in component common and section to build components path for select
	* @param string $tipo
	* @param string $section_tipo
	* @param bool $resolve_related = true
	* @param bool|string $related_tipo = false
	* @return array $path
	*/
	public static function get_query_path(string $tipo, string $section_tipo, bool $resolve_related=true, bool|string $related_tipo=false) : array {

		$path = [];

		$term_model = ontology_node::get_model_by_tipo($tipo,true);

		// Add first level always
			$current_path = new stdClass();
				$current_path->name				= strip_tags(ontology_node::get_term_by_tipo($tipo, DEDALO_DATA_LANG, true, true));
				$current_path->model			= $term_model;
				$current_path->section_tipo		= $section_tipo;
				$current_path->component_tipo	= $tipo;
			$path[] = $current_path;

		if ($resolve_related===true) {
			$ar_related_components 	= component_relation_common::get_components_with_relations();
			if(in_array($term_model, $ar_related_components)===true) {

				$ar_related_terms	= ontology_node::get_relation_nodes($tipo,true,true);
				$ar_related_section	= common::get_ar_related_by_model('section', $tipo);

				if (!empty($ar_related_section)) {

					$related_section_tipo = reset($ar_related_section);

					if ($related_tipo!==false) {

						$current_tipo	= $related_tipo;
						$model_name		= ontology_node::get_model_by_tipo($current_tipo,true);
						if (strpos($model_name,'component')===0) {
							# Recursion
							$ar_path = self::get_query_path($current_tipo, $related_section_tipo);
							foreach ($ar_path as $value) {
								$path[] = $value;
							}
						}

					}else{

						foreach ($ar_related_terms as $current_tipo) {

							// Use only first related tipo
							$model_name = ontology_node::get_model_by_tipo($current_tipo,true);
							if (strpos($model_name,'component')!==0) continue;
							# Recursion
							$ar_path = self::get_query_path($current_tipo, $related_section_tipo);
							foreach ($ar_path as $value) {
								$path[] = $value;
							}
							break; // Avoid multiple components in path !
						}
					}
				}
			}
		}


		return $path;
	}//end get_query_path



	/**
	* SEARCH_OPTIONS_TITLE
	* Creates the search_operators_info of the components in search mode to draw the tool tip
	* @param array $search_operators_info
	*	Array of operator => label like: ... => between
	* @return string $search_options_title
	*/
	public static function search_options_title( array $search_operators_info ) : string {

		$search_options_title = '';

		if (!empty($search_operators_info)) {

			$search_options_title .= '<b>' . label::get_label('search_options') . ':</b>';
			foreach ($search_operators_info as $ikey => $ivalue) {

				$search_options_title .= '<div class="search_options_title_item">';
				$search_options_title .= '<span>' . $ikey .'</span>';
				$search_options_title .= '<span>'. label::get_label($ivalue).'</span>';
				$search_options_title .= '</div>';
			}
		}

		return $search_options_title;
	}//end search_options_title



	/**
	* IS_SEARCH_OPERATOR
	* @param object $search_object
	* @return bool
	*/
	public static function is_search_operator(object $search_object) : bool {

		foreach ($search_object as $key => $value) {
			if (strpos($key, '$')!==false) {
				return true;
			}
		}

		return false;
	}//end is_search_operator



	/**
	* IS_LITERAL
	* Check if given value is literal or not
	* A literal is identified by being enclosed in single quotes.
	* Used by components to identify literals
	* @param string $q The string to check.
	* @return bool True if the string is a literal, false otherwise.
	*/
	public static function is_literal(string $q) : bool {

		// Check if the string starts and ends with a single quote
    	return strlen($q) > 1 && $q[0] === "'" && $q[-1] === "'";
	}//end is_literal



	/**
	* GET_DATA_WITH_PATH
	* It is used by class state (component_info widget) to resolve path
	* @param array $path in this format:
	*	"path": [
	*	  {
	*		  "section_tipo": "oh1",
	*		  "component_tipo": "oh25",
	*		  "model": "component_portal",
	*		  "name": "Audiovisual"
	*	  },
	*	  {
	*		  "section_tipo": "rsc167",
	*		  "component_tipo": "rsc25",
	*		  "model": "component_select",
	*		  "name": "Collection \/ archive"
	*	  }
	*  ],
	* @param array $ar_locator
	* @return array $data
	*/
	public static function get_data_with_path(array $path, array $ar_locator) : array {

		$data = [];
		foreach ($path as $path_item) {

			// level data resolve
			$path_level_locators = search::resolve_path_level($path_item, $ar_locator);

			// object to store in this path level
			$data_item = new stdClass();
				$data_item->path	= $path_item;
				$data_item->value	= $path_level_locators;

			$data[] = $data_item;

			// overwrite var $ar_locator for the next iteration
			$ar_locator = $path_level_locators;
		}

		return $data;
	}//end get_data_with_path



	/**
	* RESOLVE_PATH_LEVEL
	* It is used by class state (component_info widget) to resolve path from search::get_data_with_path
	* @param object $path_item
	* @param array $ar_locator
	* @return array $result
	*/
	public static function resolve_path_level(object $path_item, array $ar_locator) : array {

		$result = [];
		foreach ($ar_locator as $locator) {

			$model_name	= ontology_node::get_model_by_tipo($path_item->component_tipo, true);
			$component	= component_common::get_instance(
				$model_name,
				$path_item->component_tipo,
				$locator->section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$locator->section_tipo
			);
			$component_dato = $component->get_dato_full();

			if (!empty($component_dato)) {
				$result = array_merge($result, $component_dato);
			}
		}

		return $result;
	}//end resolve_path_level



}//end utils