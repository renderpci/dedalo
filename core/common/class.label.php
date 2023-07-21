<?php
/**
* LABEL
* Manage all labels and messages of Dedalo
* Get all labels from file or data base and convert all variables to static vars
*/
abstract class label {



 	static $ar_label;



 	/**
 	* GET AR LABEL
 	* @return $ar_label
 	* Class static array
 	* Priority:
 	* 1 - Class static
 	* 2 - Session ['config']['ar_label']
 	* 3 - Calculate method 'set_static_label_vars'
 	*/
 	public static function get_ar_label( string $lang=DEDALO_APPLICATION_LANG ) : array {

 		if ($lang==='lg-vlca') {
			$lang = 'lg-cat';
		}

 		# DEBUG NOT STORE SESSION LABELS
 		#if(SHOW_DEBUG===true) unset($ar_label);

		// static cache case
	 		if(isset(label::$ar_label[$lang])) {
	 			return label::$ar_label[$lang];
	 		}

		// Using php session as cache
			if( isset($_SESSION['dedalo']['config']['ar_label'][$lang]) ) {
				// Get from session
				label::$ar_label[$lang] = $_SESSION['dedalo']['config']['ar_label'][$lang];
			}else{
				// Calculate label for current lang and store
				label::$ar_label[$lang] = self::set_static_label_vars( $lang );
				$_SESSION['dedalo']['config']['ar_label'][$lang] = label::$ar_label[$lang];

				debug_log(__METHOD__." Generating security access datalist in background ".to_string($lang), logger::DEBUG);
			}


		$ar_label = label::$ar_label[$lang];


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

		if ($lang==='lg-vlca') {
			$lang = 'lg-cat';
		}

		// Calculate values (is calculated once)
		self::get_ar_label($lang);

		$label = (!isset(label::$ar_label[$lang][$name]))
			? component_common::decore_untranslated($name)
			: label::$ar_label[$lang][$name];

		if(!isset(label::$ar_label[$lang][$name])) {
			return component_common::decore_untranslated($name);
		}

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

		if ($lang==='lg-vlca') {
			$lang = 'lg-cat';
		}

		// Calculate values (is calculated once)
		self::get_ar_label($lang);

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
	* @param string $lang = DEDALO_APPLICATION_LANG
	* @return array $ar_label
	*/
	protected static function set_static_label_vars( string $lang=DEDALO_APPLICATION_LANG ) : array {

		if(SHOW_DEBUG===true) $start_time = start_time();

		// lang valencian fallback to catalan to unify
			if ($lang==='lg-vlca') {
				$lang = 'lg-cat';
			}

		$ar_label	= array();
		$cached		= true;
		$fallback	= true;

		$ar_term = (array)RecordObj_dd::get_ar_terminoID_by_modelo_name('label');
		foreach ($ar_term as $current_terminoID) {

			$RecordObj_dd	= new RecordObj_dd($current_terminoID);
			$properties		= $RecordObj_dd->get_properties();

			// No data in field 'properties'
			if(empty($properties) || empty($properties->name)) {
				debug_log(__METHOD__." Ignored Term $current_terminoID with model 'label' don't have properly configured 'properties'. Please solve this ASAP ".to_string($properties), logger::ERROR);
				continue;
			}

			// Set value
			$ar_label[$properties->name] = RecordObj_dd::get_termino_by_tipo($current_terminoID, $lang, $cached, $fallback);
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

			$RecordObj_dd	= new RecordObj_dd($current_terminoID);
			$properties		= $RecordObj_dd->get_properties();

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



}//end class label
