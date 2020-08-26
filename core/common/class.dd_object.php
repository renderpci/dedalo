<?php
/**
* CLASS DD_OBJECT
* Defines object with normalized properties and checks
*
*/
class dd_object extends stdClass {

	// Format
		# typo				: "ddo"  (ddo | sqo)
		# type				: "component"  (section | component | groupper | button)
		# tipo 				: 'oh14',
		# section_tipo 		: 'oh1',
		# parent 			: 'oh2', // caller section / portal  tipo
		# parent_grouper	: 'oh7', // structure parent
		# lang 				: 'lg-eng',
		# label 			: 'Title'
		# mode 				: "list",
		# model				: 'component_input_text',
		# properties 		: {}
		# permissions 		: 1
		# translatable 		: true
		# search 			: true
		# pagination 		: true
		# tools 			: []
		# css 				: {}

	static $ar_type_allowed = ['section','component','grouper','button','area','widget','login','menu'];



	/**
	* __CONSTRUCT
	* @param object $data
	*	optional . Default is null
	*/
	public function __construct( $data=null ) {

		if (is_null($data)) return;

		# Nothing to do on construct (for now)
		if (!is_object($data)) {
			trigger_error("wrong data format. Object expected. Given: ".gettype($data));
			return false;
		}

		// set model in first time
			$this->set_model($data->model);

		// set all properties
			foreach ($data as $key => $value) {
				$method = 'set_'.$key;
				$this->{$method}($value);
			}

		// set typo always
			$this->set_typo('ddo');

		// resolve type
			$model = $this->model;
			if (strpos($model, 'component_')===0) {
				$type = 'component';
			}elseif ($model==='section') {
				$type = 'section';
			}elseif (in_array($model, section::get_ar_grouper_models())) {
				$type = 'grouper';
			}elseif (strpos($model, 'button_')===0) {
				$type = 'button';
			}elseif (strpos($model, 'area')===0) {
				$type = 'area';
			}elseif ($model==='login') {
				$type = 'login';
			}elseif ($model==='menu') {
				$type = 'menu';
			}else{
				$msg = __METHOD__." UNDEFINED model: $model - ".$this->tipo;
				debug_log($msg, logger::ERROR);
				trigger_error($msg);
				return false;
			}
			$this->set_type($type);

		return true;
	}//end __construct



	/**
	* SET  METHODDS
	* Verify values and set property to current object
	*/



	/**
	* SET_TIPO
	*/
	public function set_tipo(string $value) {
		if(!RecordObj_dd::get_prefix_from_tipo($value)) {
			throw new Exception("Error Processing Request. Invalid tipo: $value", 1);
		}
		$this->tipo = $value;
	}



	/**
	* SET_SECTION_TIPO
	*/
	public function set_section_tipo(string $value) {
		if(strpos($this->model, 'area')!==0 && !RecordObj_dd::get_prefix_from_tipo($value)) {
			throw new Exception("Error Processing Request. Invalid section_tipo: $value", 1);
		}
		$this->section_tipo = $value;
	}



	/**
	* SET_PARENT
	*/
	public function set_parent(string $value) {
		if(!RecordObj_dd::get_prefix_from_tipo($value)) {
			throw new Exception("Error Processing Request. Invalid parent: $value", 1);
		}
		$this->parent = $value;
	}



	/**
	* SET_PARENT_GROUPER
	*/
	public function set_parent_grouper(string $value) {
		if(!RecordObj_dd::get_prefix_from_tipo($value)) {
			throw new Exception("Error Processing Request. Invalid parent_grouper: $value", 1);
		}
		$this->parent_grouper = $value;
	}



	/**
	* SET_LANG
	*/
	public function set_lang(string $value) {
		if(strpos($value, 'lg-')!==0) {
			throw new Exception("Error Processing Request. Invalid lang: $value", 1);
		}
		$this->lang = $value;
	}



	/**
	* SET_MODE
	*/
	public function set_mode(string $value) {

		$this->mode = $value;
	}



	/**
	* SET_MODEL
	*/
	public function set_model(string $value) {

		$this->model = $value;
	}



	/**
	* SET_TYPO
	*/
	public function set_typo(string $value) {
		if($value!=='ddo') {
			debug_log(__METHOD__." Error. Fixed invalid typo ".to_string($value), logger::DEBUG);
			$value = 'ddo';
		}
		$this->typo = $value;
	}



	/**
	* SET_TYPE
	* Only allow 'section','component','groupper','button'
	*/
	public function set_type(string $value) {
		$ar_type_allowed = self::$ar_type_allowed;
		if( !in_array($value, $ar_type_allowed) ) {
			throw new Exception("Error Processing Request. Invalid locator type: $value. Only are allowed: ".to_string($ar_type_allowed), 1);
		}
		$this->type = $value;
	}



	/**
	* SET_PROPERTIES
	* Note hint parameter 'object' is not supported bellow php 7.2
	* @see https://php.net/manual/en/functions.arguments.php#functions.arguments.type-declaration
	*/
	public function set_properties($value) {

		$this->properties = $value;
	}



	/**
	* SET_PERMISSIONS
	*/
	public function set_permissions(int $value) {

		$this->permissions = $value;
	}



	/**
	* SET_LABEL
	*/
	public function set_label(string $value) {

		$this->label = $value;
	}



	/**
	* SET_TRANSLATABLE
	*/
	public function set_translatable(bool $value) {

		$this->translatable = $value;
	}



	/**
	* SET_TOOLS
	*/
	public function set_tools(array $value) {

		$this->tools = $value;
	}



	/**
	* SET_CSS
	*/
	public function set_css($value) {

		$this->css = $value;
	}



	/**
	* SET_TARGET_SECTIONS
	*/
	public function set_target_sections($value) {

		$this->target_sections = $value;
	}


	/**
	* SET_REQUEST_CONFIG
	*/
	public function set_request_config($value) {

		$this->request_config = $value;
	}


	/**
	* SET_AR_SECTIONS_TIPO
	*/
	public function set_ar_sections_tipo($value) {

		$this->ar_sections_tipo = $value;
	}


	/**
	* SET_CONFIG_TYPE
	*/
	public function set_config_type($value) {

		$this->config_type = $value;
	}




	/**
	* COMPARE_DDO
	* @return bool $equal
	*/
	public static function compare_ddo($ddo1, $ddo2, $ar_properties=['model','tipo','section_tipo','mode','lang', 'parent','typo','type']) {

		if (!is_object($ddo1) || !is_object($ddo2)) {
			return false;
		}

		if (empty($ar_properties)){
			foreach ($ddo1 as $property => $value) {
				if (!in_array($property, $ar_exclude_properties)) {
					$ar_properties[] = $property;
				}
			}

			foreach ($ddo2 as $property => $value) {
				if (!in_array($property, $ar_exclude_properties)) {
					$ar_properties[] = $property;
				}
			}

			$ar_properties = array_unique($ar_properties);
		}


		$equal = true;

		foreach ((array)$ar_properties as $current_property) { // 'section_tipo','section_id','type','from_component_tipo','component_tipo','tag_id'

			#if (!is_object($ddo1) || !is_object($ddo2)) {
			#	$equal = false;
			#	break;
			#}

			$property_exists_in_l1 = property_exists($ddo1, $current_property);
			$property_exists_in_l2 = property_exists($ddo2, $current_property);


			# Test property exists in all items
			#if (!property_exists($ddo1, $current_property) && !property_exists($ddo2, $current_property)) {
			if ($property_exists_in_l1===false && $property_exists_in_l2===false) {
				# Skip not existing properties
				#debug_log(__METHOD__." Skipped comparison property $current_property. Property not exits in any locator ", logger::DEBUG);
				continue;
			}

			# Test property exists only in one locator
			#if (property_exists($ddo1, $current_property) && !property_exists($ddo2, $current_property)) {
			if ($property_exists_in_l1===true && $property_exists_in_l2===false) {
				#debug_log(__METHOD__." Property $current_property exists in ddo1 but not exits in ddo2 (false is returned): ".to_string($ddo1).to_string($ddo2), logger::DEBUG);
				$equal = false;
				break;
			}
			#if (property_exists($ddo2, $current_property) && !property_exists($ddo1, $current_property)) {
			if ($property_exists_in_l2===true && $property_exists_in_l1===false) {
				#debug_log(__METHOD__." Property $current_property exists in ddo2 but not exits in ddo1 (false is returned): ".to_string($ddo1).to_string($ddo2), logger::DEBUG);
				$equal = false;
				break;
			}

			# Compare verified existing properties
			if ($current_property==='section_id') {
				if( $ddo1->$current_property != $ddo2->$current_property ) {
					$equal = false;
					break;
				}
			}else{
				if( $ddo1->$current_property !== $ddo2->$current_property ) {
					$equal = false;
					break;
				}
			}
		}

		return (bool)$equal;
	}//end compare_ddo



	/**
	* IN_ARRAY_DDO
	* @return bool $founded
	*/
	public static function in_array_ddo($ddo, $ar_ddo, $ar_properties=['model','tipo','section_tipo','mode','lang', 'parent','typo','type']) {
		$founded = false;

		foreach ((array)$ar_ddo as $current_ddo) {
			$founded = self::compare_ddo( $ddo, $current_ddo, $ar_properties );
			if($founded===true) break;
		}

		#$ar = array_filter(
		#		$ar_ddo,
		#		function($current_ddo) use($ddo, $ar_properties){
		#			return self::compare_ddos( $ddo, $current_ddo, $ar_properties );
		#		}
		#); return $ar;


		return $founded;
	}//end in_array_ddo


}//end dd_object
