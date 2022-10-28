<?php
/**
* CLASS DD_OBJECT (ddo)
* Defines object with normalized properties and checks
*
*/
class dd_object {



	// Format
		# typo				: "ddo"  (ddo | sqo)
		# type				: "component"  (section | component | grouper | button | tool ..)
		# tipo				: 'oh14',
		# section_tipo		: 'oh1',
		# parent			: 'oh2', // caller section / portal  tipo
		# parent_grouper	: 'oh7', // structure parent
		# lang				: 'lg-eng',
		# mode				: "list",
		# model				: 'component_input_text',
		# properties		: {}
		# permissions		: 1
		# label				: 'Title'
		# labels			: ['Title']
		# translatable		: true
		# tools				: [] // array of tools dd_objects (context)
		# buttons			: [] // array of buttons dd_objects (context)
		# css				: {}
		# target_sections	: [{'tipo':'dd125','label':'Projects']
		# request_config	: [],
		# ar_sections_tipo	: ['oh1']
		# columns_map		: array
		# view				: string|null like 'table'
		# children_view		: string like "text"
		# fixed_mode		: string like 'edit'
		# section_id		: int like 1 // Used by tools
		# name				: string like 'tool_lang' // Used by tools
		# description		: string like 'Description of tool x' // Used by tools
		# icon				: string like '/tools/tool_lang/img/icon.svg' // Used by tools
		# show_in_inspector	: bool // Used by tools
		# show_in_component	: bool // Used by tools
		# config			: object // Used by tools
		# sortable			: bool // Used by components (columns)
		# fields_separator	: string like ", " // used by portal to join different fields
		# records_separator	: string like " | " // used by portal to join different records (rows)



	static $ar_type_allowed = [
		'section',
		'component',
		'grouper',
		'button',
		'area',
		'tm',
		'widget',
		'install',
		'login',
		'menu',
		'tool',
		'detail' // used by time_machine_list, relation_list, component_history_list
	];



	/**
	* __CONSTRUCT
	* @param object $data =null
	*/
	public function __construct( object $data=null ) {

		if (is_null($data)) return;

		# Nothing to do on construct (for now)
		if (!is_object($data)) {
			trigger_error("wrong data format. Object expected. Given: ".gettype($data));
			return false;
		}

		// set model in first time
			if(isset($data->model)) {
				$this->set_model($data->model);
			}

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
			}elseif ($model==='install') {
				$type = 'install';
			}elseif (strpos($model, 'tool_')===0) {
				$type = 'tool';
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
	* SET_TYPO
	*/
	public function set_typo(string $value) : void {
		if($value!=='ddo') {
			debug_log(__METHOD__." Error. Fixed invalid typo ".to_string($value), logger::DEBUG);
			$value = 'ddo';
		}
		$this->typo = $value;
	}//end set_typo



	/**
	* SET_TYPE
	* Only allow 'section','component','groupper','button'
	*/
	public function set_type(string $value) : void  {
		$ar_type_allowed = self::$ar_type_allowed;
		if( !in_array($value, $ar_type_allowed) ) {
			throw new Exception("Error Processing Request. Invalid locator type: $value. Only are allowed: ".to_string($ar_type_allowed), 1);
		}
		$this->type = $value;
	}//end set_type



	/**
	* SET_TIPO
	* @param string $value
	*/
	public function set_tipo(string $value) : void  {
		if(!RecordObj_dd::get_prefix_from_tipo($value)) {
			throw new Exception("Error Processing Request. Invalid tipo: $value", 1);
		}
		$this->tipo = $value;
	}//end set_tipo



	/**
	* SET_SECTION_TIPO
	* @param string|array $value
	* 	Could be array or string
	*/
	public function set_section_tipo($value) : void  { // string|array
		if (!isset($this->model) && isset($this->tipo)) {
			$this->model = RecordObj_dd::get_modelo_name_by_tipo($this->tipo,true);
		}
		// if(strpos($this->model, 'area')!==0 && !RecordObj_dd::get_prefix_from_tipo($value)) {
		// 	throw new Exception("Error Processing Request. Invalid section_tipo: $value", 1);
		// }
		$this->section_tipo = $value;
	}//end set_section_tipo



	/**
	* SET_PARENT
	*/
	public function set_parent(string $value) : void {
		if(!RecordObj_dd::get_prefix_from_tipo($value)) {
			throw new Exception("Error Processing Request. Invalid parent: $value", 1);
		}
		$this->parent = $value;
	}//end set_parent



	/**
	* SET_PARENT_GROUPER
	*/
	public function set_parent_grouper(string $value) : void {
		if(!RecordObj_dd::get_prefix_from_tipo($value)) {
			throw new Exception("Error Processing Request. Invalid parent_grouper: $value", 1);
		}
		$this->parent_grouper = $value;
	}//end set_parent_grouper



	/**
	* SET_LANG
	*/
	public function set_lang(string $value) : void {
		if(strpos($value, 'lg-')!==0) {
			throw new Exception("Error Processing Request. Invalid lang: $value", 1);
		}
		$this->lang = $value;
	}//end set_lang



	/**
	* SET_MODE
	*/
	public function set_mode(string $value) : void {

		$this->mode = $value;
	}//end set_mode



	/**
	* SET_MODEL
	*/
	public function set_model(string $value) : void {

		$this->model = $value;
	}//end set_model



	/**
	* SET_PROPERTIES
	* Note hint parameter 'object' is not supported bellow php 7.2
	* @see https://php.net/manual/en/functions.arguments.php#functions.arguments.type-declaration
	* @param object|array|null
	*/
	public function set_properties($value) : void {

		$this->properties = $value;
	}//end set_properties



	/**
	* SET_PERMISSIONS
	*/
	public function set_permissions(int $value) : void {

		$this->permissions = $value;
	}//end set_permissions



	/**
	* SET_LABEL
	*/
	public function set_label(string $value) : void {

		$this->label = $value;
	}//end set_label



	/**
	* SET_LABELS
	* Used by tools
	* @param array|null $value
	*/
	public function set_labels(?array $value) : void {

		$this->labels = $value;
	}//end set_labels



	/**
	* SET_TRANSLATABLE
	*/
	public function set_translatable(bool $value) : void {

		$this->translatable = $value;
	}//end set_translatable



	/**
	* SET_TOOLS
	* @param array|null $value
	*/
	public function set_tools(?array $value) : void {

		if(!is_null($value) && !is_array($value)){
			throw new Exception("Error Processing Request, Tools only had allowed array or null values. ".gettype($value). " is received" , 1);
		}

		$this->tools = $value;
	}//end set_tools



	/**
	* SET_BUTTONS
	* @param array|null $value
	*/
	public function set_buttons(?array $value) : void {

		if(!is_null($value) && !is_array($value)){
			throw new Exception("Error Processing Request, Buttons only had allowed array or null values. ".gettype($value). " is received" , 1);
		}

		$this->buttons = $value;
	}//end set_buttons



	/**
	* SET_CSS
	* @param object|null $value
	*/
	public function set_css(?object $value) : void {

		$this->css = $value;
	}//end set_css



	/**
	* SET_TARGET_SECTIONS
	*/
	public function set_target_sections(array $value) : void {

		$this->target_sections = $value;
	}//end set_target_sections



	/**
	* SET_REQUEST_CONFIG
	*/
	public function set_request_config(?array $value) : void {

		$this->request_config = $value;
	}//end set_request_config



	/**
	* SET_AR_SECTIONS_TIPO
	*/
	public function set_ar_sections_tipo(array $value) : void {

		$this->ar_sections_tipo = $value;
	}//end set_ar_sections_tipo



	/**
	* SET_COLUMNS_MAP
	*/
	public function set_columns_map(?array $value) : void {

		$this->columns_map = $value;
	}//end set_columns_map



	/**
	* SET_VIEW
	*/
	public function set_view(?string $value) : void {

		$this->view = $value;
	}//end set_view



	/**
	* SET_CHILDREN_VIEW
	*/
	public function set_children_view(?string $value) : void {

		$this->children_view = $value;
	}//end set_view



	/**
	* SET_FIXED_MODE
	*/
	public function set_fixed_mode(string $value) : void {

		$this->fixed_mode = $value;
	}//end set_fixed_mode



	/**
	* SET_SECTION_ID
	* Used by tools
	* @param int|null $value
	*/
	public function set_section_id(?int $value) : void {

		$this->section_id = $value;
	}//end set_section_id



	/**
	* SET_NAME
	* Used by tools
	*/
	public function set_name(string $value) : void {

		$this->name = $value;
	}//end set_name



	/**
	* SET_DESCRIPTION
	* Used by tools
	*/
	public function set_description(string $value) : void {

		$this->description = $value;
	}//end set_description



	/**
	* SET_ICON
	* Used by tools
	*/
	public function set_icon(string $value) : void {

		$this->icon = $value;
	}//end set_icon


	/**
	* SET_show_in_inspector
	* Used by tools
	*/
	public function set_show_in_inspector(bool $value) : void {

		$this->show_in_inspector = $value;
	}//end set_show_in_inspector



	/**
	* SET_show_in_component
	* Used by tools
	*/
	public function set_show_in_component(bool $value) : void {

		$this->show_in_component = $value;
	}//end set_show_in_component



	/**
	* SET_CONFIG
	* Used by tools
	*/
	public function set_config(?object $value) : void {

		$this->config = $value;
	}//end set_config



	/**
	* SET_SORTABLE
	* Used by components (columns)
	*/
	public function set_sortable(bool $value) : void {

		$this->sortable = $value;
	}//end set_sortable



	/**
	* SET_FIELDS_SEPARATOR
	* Used by tools
	*/
	public function set_fields_separator(string $value) : void {

		$this->fields_separator = $value;
	}//end set_fields_separator



	/**
	* SET_RECORDS_SEPARATOR
	* Used by tools
	*/
	public function set_records_separator(string $value) : void {

		$this->records_separator = $value;
	}//end set_records_separator



	/**
	* COMPARE_DDO
	* @return bool $equal
	*/
	public static function compare_ddo(object $ddo1, object $ddo2, array $ar_properties=['model','tipo','section_tipo','mode','lang', 'parent','typo','type']) : bool {

		// if (!is_object($ddo1) || !is_object($ddo2)) {
		// 	return false;
		// }

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
	* @return bool $found
	*/
	public static function in_array_ddo(object $ddo, array $ar_ddo, array $ar_properties=['model','tipo','section_tipo','mode','lang', 'parent','typo','type']) : bool {

		$found = false;

		foreach ((array)$ar_ddo as $current_ddo) {
			$found = self::compare_ddo( $ddo, $current_ddo, $ar_properties );
			if($found===true) break;
		}

		#$ar = array_filter(
		#		$ar_ddo,
		#		function($current_ddo) use($ddo, $ar_properties){
		#			return self::compare_ddos( $ddo, $current_ddo, $ar_properties );
		#		}
		#); return $ar;


		return $found;
	}//end in_array_ddo



}//end dd_object
