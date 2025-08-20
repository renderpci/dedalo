<?php declare(strict_types=1);
/**
* LABEL
* Manage all labels and messages of Dedalo
* Get all labels from file or data base and convert all variables to static vars
*/
abstract class label {



	static $ar_label;



	/**
	* GET AR LABEL
	* Class static array
	* Priority:
	* 1 - Class static
	* 2 - Session ['config']['ar_label']
	* 3 - Calculate method 'set_static_label_vars'
	* @param string $lang = DEDALO_APPLICATION_LANG
	* @param bool $use_file_cache = true
	* @return array $ar_label
	*/
	public static function get_ar_label( string $lang=DEDALO_APPLICATION_LANG, bool $use_file_cache=true ) : array {

		// get the lang to be used to get the labels
			$lang = lang::get_label_lang( $lang );

		// static cache case
			if(isset(label::$ar_label[$lang])) {
				return label::$ar_label[$lang];
			}

		// cache file
			if ($use_file_cache===true) {
				$file_cache = dd_cache::cache_from_file((object)[
					'file_name'	=> label::build_cache_file_name($lang)
				]);
				if (!empty($file_cache)) {

					// read from file encoded JSON
						$ar_label = json_handler::decode($file_cache, true);

					// cache static
						label::$ar_label[$lang] = $ar_label;

					return $ar_label;
				}
			}

		// Calculate label for current lang and store
			$ar_label = self::set_static_label_vars( $lang );

		// cache static
			label::$ar_label[$lang] = $ar_label;

		// cache file
			if ($use_file_cache===true) {
				dd_cache::cache_to_file((object)[
					'data'		=> $ar_label,
					'file_name'	=> label::build_cache_file_name($lang)
				]);
			}


		return $ar_label;
	}//end get_ar_label



	/**
	* GET LABEL
	* @param $name
	*	String var name like 'quit'
	* Get label data static
	* @param string $name
	* @param string $lang = DEDALO_APPLICATION_LANG
	* @return string $label
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
	* GET VAR FROM LABEL
	* @param string $label
	* @param string $lang = DEDALO_APPLICATION_LANG
	*	String label like 'Relaciones'
	* Resolve inverse label
	* @return string|null
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
	* SET STATIC VARS
	* Calculate an fix all labels values from structure (all terms with model 'label')
	* This method is called by area_maintenance when Ontology is updated
	* @param string $lang = DEDALO_APPLICATION_LANG
	* @return array $ar_label
	*/
	protected static function set_static_label_vars( string $lang=DEDALO_APPLICATION_LANG ) : array {

		if(SHOW_DEBUG===true) $start_time = start_time();

		// get the lang to be used to get the labels
			$lang = lang::get_label_lang( $lang );

		$ar_label	= array();
		$cached		= false;
		$fallback	= true;

		$ar_term = RecordObj_dd::get_ar_terminoID_by_modelo_name('label');
		foreach ($ar_term as $current_terminoID) {

			$ontology_node	= new ontology_node($current_terminoID);
			$properties		= $ontology_node->get_properties();

			// No data in field 'properties'
				if(empty($properties) || empty($properties->name)) {
					debug_log(__METHOD__
						." Ignored Term $current_terminoID with model 'label' don't have properly configured 'properties'. Please solve this ASAP" . PHP_EOL
						.' properties: '. to_string($properties)
						, logger::ERROR
					);
					continue;
				}

			// get label value
				$label = ontology_node::get_termino_by_tipo(
					$current_terminoID,
					$lang,
					$cached,
					$fallback
				);
				if (empty($label)) {
					debug_log(__METHOD__
						. " Unable to resolve label for term: " . PHP_EOL
						. ' current_terminoID: ' . to_string($current_terminoID)
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
	* GET_TERMINOID_FROM_LABEL
	* Resolve terminoID from label properties property 'label'
	* @param string $label
	* @return ?string $terminoID
	*/
	public static function get_terminoID_from_label( string $label ) : ?string {

		if(SHOW_DEBUG===true) {
			$start_time = start_time();
		}

		$terminoID = null;

		$ar_term_id_by_model_name = (array)RecordObj_dd::get_ar_terminoID_by_modelo_name('label');
		foreach ($ar_term_id_by_model_name as $current_terminoID) {

			$ontology_node	= new ontology_node($current_terminoID);
			$properties		= $ontology_node->get_properties();

			// No data in field 'properties'
			if(empty($properties) || empty($properties->name)) {
				trigger_error("Term $current_terminoID with model 'label' don't have properly configured 'properties'. Please solve this ASAP");
				continue;
			}

			if ($properties->name===$label) {
				$terminoID = $current_terminoID;
				break;
			}
		}

		if(SHOW_DEBUG===true) {
			debug_log(__METHOD__." Total  ".exec_time_unit($start_time,'ms').' ms');
		}


		return $terminoID;
	}//end get_terminoID_from_label



	/**
	* BUILD_CACHE_FILE_NAME
	* Unified method to build the lang file cache name
	* @param string $lang
	* @return string
	*/
	public static function build_cache_file_name( string $lang ) : string {

		return 'cache_labels_' . $lang . '.json';
	}//end build_cache_file_name



}//end class label
