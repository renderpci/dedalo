<?php declare(strict_types=1);
/**
* CLASS DD_OBJECT (ddo)
* Defines object with normalized properties and checks
*
*/
class dd_object extends stdClass {



	// properties
		// typo : "ddo"
		public $typo = 'ddo';
		/*
		// type					: string|null // e.g. "component"  (section | component | grouper | button | tool ..)
		// tipo					: string|null // e.g. 'oh14',
		// section_tipo			: string|null // e.g. 'oh1',
		// parent				: string|null // e.g. 'oh2', // caller section / portal  tipo
		// parent_grouper		: string|null // e.g. 'oh7', // structure parent
		// lang					: string|null // e.g. 'lg-eng',
		// mode					: string|null // e.g. "list",
		// model				: string|null // e.g. 'component_input_text',
		// id 					: string|null // optional parameter in order to identify current DDO inside a DDO_MAP chain. It is used to referent it in process as parser or widgets data.
		// info 				: string|null // optional short information about the ddo. e.g. 'Find(spot) - component_portal'
		// properties			: object // generic object to define custom properties of the DDO. Used to sent or overwrites the Ontology properties.
		// permissions			: int // e.g. 1
		// label				: string|null // e.g. 'Title'
		// labels				: array // e.g. ['Title']
		// translatable			: bool
		// tools				: array // array of tools dd_objects (context)
		// buttons				: array // array of buttons dd_objects (context)
		// css					: object
		// target_sections		: array // e.g. [{'tipo':'dd125','label':'Projects']
		// request_config		: array
		// columns_map			: array // array of objects as [{"id": "e", "label": "numisdata1530","width": "5rem"}]
		// column_id 			: string // id value that point to its column inside columns_map items e.g. 'e'
		// view					: string|null like 'table'
		// children_view		: string like "text"
		// name					: string like 'tool_lang' // Used by tools
		// description			: string like 'Description of tool x' // Used by tools
		// icon					: string like '/tools/tool_lang/img/icon.svg' // Used by tools
		// developer			: string like 'Dédalo team' // Used by tools
		// show_in_inspector	: bool // Used by tools
		// show_in_component	: bool // Used by tools
		// config				: object // Used by tools and services
		// sortable				: bool // Used by components (columns)
		// fields_separator		: string|null // e.g. ", " // used by portal to join different fields
		// records_separator	: string|null // e.g. " | " // used by portal to join different records (rows)
		// legacy_model			: string|null // e.g. "component_autocomplete_hi"
		// autoload 			: bool // Used by tools
		// role 				: string|null // 'main_component' // Used by tools
		// section_map 			: object // e.g. {
										"thesaurus": {
											"term": "hierarchy25",
											"model": "hierarchy27",
											"order": "hierarchy48",
											"parent": "hierarchy36",
											"is_indexable": "hierarchy24",
											"is_descriptor": "hierarchy23"
										}
									} Used by tools
		// color 				: string|null // e.g. "#f1f1f1"
		// matrix_table 		: string|null // e.g. 'matrix_dd'
		// data_fn 				: string|null // e.g. 'get_calculation_data' used in 'mdcat2431' set the function to be used to get data of the ddo


		// object features. Use this container to add custom properties like 'notes_publication_tipo' in text area
		// array toolbar_buttons
		// bool value_with_parents
		// array search_operators_info
		// string search_options_title
		// string target_section_tipo

		// debug				: object
		*/



	// ar_type_allowed
		static $ar_type_allowed = [
			'area',
			'section',
			'relation_list',
			'component',
			'grouper',
			'button',
			'tm',
			'widget',
			'install',
			'login',
			'menu',
			'tool',
			'detail', // used by time_machine_list, relation_list, component_history_list
			'dd_grid'
		];



	/**
	* __CONSTRUCT
	* @param object|null $data = null
	* @return void
	*/
	public function __construct( ?object $data=null ) {

		// null case
			if (is_null($data)) {
				return;
			}

		// Nothing to do on construct (for now)
			if (!is_object($data)) {

				$msg = " wrong data format. object expected. Given type: ".gettype($data);
				debug_log(__METHOD__
					. $msg
					.' data: ' . to_string($data)
					, logger::ERROR
				);
				if(SHOW_DEBUG===true) {
					dump(debug_backtrace()[0], $msg);
				}

				$this->errors[] = $msg;
				return;
			}

		// set properties

		// set typo always
			// $this->typo = 'ddo';

		// set model in first time
			if(isset($data->model)) {
				$this->set_model($data->model);
			}

		// set all properties
			foreach ($data as $key => $value) {
				$method = 'set_'.$key;
				if (method_exists($this, $method)) {

					$set_value = $this->{$method}($value);
					if($set_value===false && empty($this->errors)) {
						$this->errors[] = 'Invalid value for: '.$key.' . value: '.to_string($value);
					}

				}else{

					debug_log(__METHOD__
						.' Ignored received property: '.$key.' not defined as set method.'. PHP_EOL
						.' data: ' . to_string($data)
						, logger::ERROR
					);
					$this->errors[] = 'Ignored received property: '.$key.' not defined as set method. Data: '. json_encode($data, JSON_PRETTY_PRINT);
				}
			}

		// resolve and set type
			$model = $this->model ?? '';
			switch (true) {
				case strpos($model, 'component_')===0 :
					$type = 'component';
					break;
				case $model==='section' :
					$type = 'section';
					break;
				case $model==='relation_list' :
					$type = 'relation_list';
					break;
				case in_array($model, section::get_ar_grouper_models()) :
					$type = 'grouper';
					break;
				case strpos($model, 'button')===0 :
					$type = 'button';
					break;
				case strpos($model, 'area')===0 :
					$type = 'area';
					break;
				case $model==='login' :
					$type = 'login';
					break;
				case $model==='menu' :
					$type = 'menu';
					break;
				case $model==='install' :
					$type = 'install';
					break;
				case $model==='dd_grid' :
					$type = 'dd_grid';
					break;
				case strpos($model, 'tool_')===0 :
					$type = 'tool';
					break;
				default:
					debug_log(__METHOD__
						. " Error. Undefined type from model: " . PHP_EOL
						. ' model: ' . to_string($model)
						, logger::ERROR
					);
					return;
					break;
			}
			$this->set_type($type);
	}//end __construct



	/**
	* SET_TYPE
	* Only allow types defined in dd_object::$ar_type_allowed
	* @param string $value
	* @return bool
	*/
	public function set_type(string $value) : bool  {

		if( !in_array($value, dd_object::$ar_type_allowed) ) {

			$msg = 'Value is not allowed (invalid type) : '.to_string($value);

			debug_log(__METHOD__
				." Invalid type: " .PHP_EOL
				.' value: ' . to_string($value) .PHP_EOL
				.' Only are allowed: ' .PHP_EOL
				. json_encode(dd_object::$ar_type_allowed, JSON_PRETTY_PRINT)
				, logger::ERROR
			);
			$this->errors[] = 'Ignored set type. '. $msg;

			return false;
		}

		$this->type = $value;

		return true;
	}//end set_type



	/**
	* GET_TYPE
	* Return property value
	* @return int|null $this->type
	*/
	public function get_type() : ?string {

		return $this->type ?? null;
	}//end get_type



	/**
	* SET_TIPO
	* @param string $value
	* @return bool
	*/
	public function set_tipo(string $value) : bool  {

		if(!get_tld_from_tipo($value)) {

			$msg = 'Value is not allowed (invalid prefix) : '.to_string($value);

			debug_log(__METHOD__
				." Invalid tipo: " .PHP_EOL
				. to_string($value)
				, logger::ERROR
			);
			$this->errors[] = 'Ignored set tipo. '. $msg;

			return false;
		}

		$this->tipo = $value;

		// auto-resolve model if is not defined
			if (!isset($this->model) && isset($this->tipo)) {
				$this->model = RecordObj_dd::get_model_name_by_tipo($this->tipo,true);
			}

		return true;
	}//end set_tipo



	/**
	* GET_TIPO
	* Return property value
	* @return int|null $this->tipo
	*/
	public function get_tipo() : ?string {

		return $this->tipo ?? null;
	}//end get_tipo



	/**
	* SET_SECTION_TIPO
	* @param string|array $value
	* 	Could be array or string
	* @return bool
	*/
	public function set_section_tipo(string|array $value) : bool  {

		$this->section_tipo = $value;

		return true;
	}//end set_section_tipo



	/**
	* GET_SECTION_TIPO
	* Return property value
	* @return mixed $this->section_tipo
	* 	array|string|null
	*/
	public function get_section_tipo() : mixed {

		return $this->section_tipo ?? null;
	}//end get_section_tipo



	/**
	* SET_PARENT
	* @param string|null $value
	* @return bool
	*/
	public function set_parent(?string $value) : bool {

		if(!is_null($value) && !get_tld_from_tipo($value)) {

			$msg = 'Value is not allowed (invalid prefix) : '.to_string($value);

			debug_log(__METHOD__
				." Error Processing Request. Invalid parent: " .PHP_EOL
				.to_string($value)
				, logger::ERROR
			);
			$this->errors[] = 'Ignored set parent. '. $msg;

			return false;
		}

		$this->parent = $value;

		return true;
	}//end set_parent



	/**
	* GET_PARENT
	* Return property value
	* @return string|null $this->parent
	*/
	public function get_parent() : ?string {

		return $this->parent ?? null;
	}//end get_parent



	/**
	* SET_PARENT_GROUPER
	* @param string|null $value
	* @return bool
	*/
	public function set_parent_grouper(?string $value) : bool {

		if(!is_null($value) && !get_tld_from_tipo($value)) {

			$msg = 'Value is not allowed (invalid prefix) : '.to_string($value);

			debug_log(__METHOD__
				." Error Processing Request. Invalid parent_grouper: "
				.to_string($value)
				, logger::ERROR
			);
			$this->errors[] = 'Ignored set parent grouper. '. $msg;

			return false;
		}

		$this->parent_grouper = $value;

		return true;
	}//end set_parent_grouper



	/**
	* GET_PARENT_GROUPER
	* Return property value
	* @return string|null $this->parent_grouper
	*/
	public function get_parent_grouper() : ?string {

		return $this->parent_grouper ?? null;
	}//end get_parent_grouper



	/**
	* SET_LANG
	* @param string $value
	* @return bool|null
	*/
	public function set_lang(?string $value) : bool {

		if(!is_null($value) && strpos($value, 'lg-')!==0) {

			$msg = 'Value is not allowed (invalid prefix) : '.to_string($value);

			debug_log(__METHOD__
				." Error Processing Request. Invalid lang: "
				.to_string($value)
				, logger::ERROR
			);
			$this->errors[] = 'Ignored set lang. '. $msg;

			return false;
		}

		$this->lang = $value;

		return true;
	}//end set_lang



	/**
	* GET_LANG
	* Return property value
	* @return string|null $this->lang
	*/
	public function get_lang() : ?string {

		return $this->lang ?? null;
	}//end get_lang



	/**
	* SET_MODE
	* @param string|null $value
	* @return bool
	*/
	public function set_mode(?string $value) : bool {

		$this->mode = $value;

		return true;
	}//end set_mode



	/**
	* GET_MODE
	* Return property value
	* @return string|null $this->mode
	*/
	public function get_mode() : ?string {

		return $this->mode ?? null;
	}//end get_mode



	/**
	* SET_MODEL
	* @param string|null $value
	* @return bool
	*/
	public function set_model(?string $value) : bool {

		$this->model = $value;

		return true;
	}//end set_model



	/**
	* GET_MODEL
	* Return property value
	* @return string|null $this->model
	*/
	public function get_model() : ?string {

		return $this->model ?? null;
	}//end get_model



	/**
	* SET_ID
	* @param string|null $value
	* @return bool
	*/
	public function set_id(?string $value) : bool {

		$this->id = $value;

		return true;
	}//end set_id



	/**
	* GET_ID
	* Return property value
	* @return string|null $this->model
	*/
	public function get_id() : ?string {

		return $this->id ?? null;
	}//end get_id



	/**
	* SET_INFO
	* @param string|null $value
	* @return bool
	*/
	public function set_info(?string $value) : bool {

		$this->info = $value;

		return true;
	}//end set_info



	/**
	* GET_INFO
	* Return property value
	* @return string|null $this->model
	*/
	public function get_info() : ?string {

		return $this->info ?? null;
	}//end get_info



	/**
	* SET_LEGACY_MODEL
	* @param string|null $value
	* @return bool
	*/
	public function set_legacy_model(?string $value) : bool {

		$this->legacy_model = $value;

		return true;
	}//end set_legacy_model



	/**
	* GET_LEGACY_MODEL
	* Return property value
	* @return string|null $this->legacy_model
	*/
	public function get_legacy_model() : ?string {

		return $this->legacy_model ?? null;
	}//end get_legacy_model



	/**
	* SET_PROPERTIES
	* Note hint parameter 'object' is not supported bellow php 7.2
	* @see https://php.net/manual/en/functions.arguments.php#functions.arguments.type-declaration
	* @param mixed $value
	* @return bool
	*/
	public function set_properties(mixed $value) : bool {

		$this->properties = $value;

		return true;
	}//end set_properties



	/**
	* GET_PROPERTIES
	* Return property value
	* @return mixed $this->properties
	*/
	public function get_properties() : mixed {

		return $this->properties ?? null;
	}//end get_properties



	/**
	* SET_PERMISSIONS
	* @param int|null $value
	* @return bool
	*/
	public function set_permissions(?int $value) : bool {

		$this->permissions = $value;

		return true;
	}//end set_permissions



	/**
	* GET_PERMISSIONS
	* Return property value
	* @return int|null $this->permissions
	*/
	public function get_permissions() : ?int {

		return $this->permissions ?? null;
	}//end get_permissions



	/**
	* SET_LABEL
	* @param string|null $value
	* @return bool
	*/
	public function set_label(?string $value) : bool {

		$this->label = $value;

		return true;
	}//end set_label



	/**
	* GET_LABEL
	* Return property value
	* @return string|null $this->label
	*/
	public function get_label() : ?string {

		return $this->label ?? null;
	}//end get_label



	/**
	* SET_LABELS
	* Used by tools
	* @param array|null $value
	* @return bool
	*/
	public function set_labels(?array $value) : bool {

		$this->labels = $value;

		return true;
	}//end set_labels



	/**
	* GET_LABELS
	* Return property value
	* @return array|null $this->labels
	*/
	public function get_labels() : ?array {

		return $this->labels ?? null;
	}//end get_labels



	/**
	* SET_TRANSLATABLE
	* @param bool $value
	* @return bool
	*/
	public function set_translatable(bool $value) : bool {

		$this->translatable = $value;

		return true;
	}//end set_translatable



	/**
	* GET_TRANSLATABLE
	* Return property value
	* @return bool|null $this->translatable
	*/
	public function get_translatable() : ?bool {

		return $this->translatable ?? null;
	}//end get_translatable



	/**
	* SET_TOOLS
	* @param array|null $value
	* @return bool
	*/
	public function set_tools(?array $value) : bool {

		// des
			// if(!is_null($value) && !is_array($value)){

			// 	$msg = 'Value is not allowed : '.to_string($value);

			// 	debug_log(__METHOD__
			// 		." Tools only had allowed array or null values. ".gettype($value). " is received "
			// 		.to_string($value)
			// 		, logger::ERROR
			// 	);
			// 	$this->errors[] = 'Ignored set tools. '. $msg;

			// 	return false;
			// }

		$this->tools = $value;

		return true;
	}//end set_tools



	/**
	* GET_TOOLS
	* Return property value
	* @return array|null $this->tools
	*/
	public function get_tools() : ?array {

		return $this->tools ?? null;
	}//end get_tools



	/**
	* SET_BUTTONS
	* @param array|null $value
	* @return bool
	*/
	public function set_buttons(?array $value) : bool {

		// des
			// if(!is_null($value) && !is_array($value)){

			// 	$msg = 'Value is not allowed : '.to_string($value);

			// 	debug_log(__METHOD__
			// 		." Buttons only had allowed array or null values. ".gettype($value). " is received "
			// 		.to_string($value)
			// 		, logger::ERROR
			// 	);
			// 	$this->errors[] = 'Ignored set buttons. '. $msg;

			// 	return false;
			// }

		$this->buttons = $value;

		return true;
	}//end set_buttons



	/**
	* GET_BUTTONS
	* Return property value
	* @return array|null $this->buttons
	*/
	public function get_buttons() : ?array {

		return $this->buttons ?? null;
	}//end get_buttons



	/**
	* SET_CSS
	* @param object|null $value
	* @return bool
	*/
	public function set_css(?object $value) : bool {

		$this->css = $value;

		return true;
	}//end set_css



	/**
	* GET_CSS
	* Return property value
	* @return object|null $this->css
	*/
	public function get_css() : ?object {

		return $this->css ?? null;
	}//end get_css



	/**
	* SET_TARGET_SECTIONS
	* @param array|null $value
	* @return bool
	*/
	public function set_target_sections(?array $value) : bool {

		$this->target_sections = $value;

		return true;
	}//end set_target_sections



	/**
	* GET_TARGET_SECTIONS
	* Return property value
	* @return array|null $this->target_sections
	*/
	public function get_target_sections() : ?array {

		return $this->target_sections ?? null;
	}//end get_target_sections



	/**
	* SET_REQUEST_CONFIG
	* @param array|null $value
	* @return bool
	*/
	public function set_request_config(?array $value) : bool {

		$this->request_config = $value;

		return true;
	}//end set_request_config



	/**
	* GET_REQUEST_CONFIG
	* Return property value
	* @return array|null $this->request_config
	*/
	public function get_request_config() : ?array {

		return $this->request_config ?? null;
	}//end get_request_config



	/**
	* SET_COLUMNS_MAP
	* @param array|null $value
	* @return bool
	*/
	public function set_columns_map(?array $value) : bool {

		$this->columns_map = $value;

		return true;
	}//end set_columns_map



	/**
	* GET_COLUMNS_MAP
	* Return property value
	* @return array|null $this->columns_map
	*/
	public function get_columns_map() : ?array {

		return $this->columns_map ?? null;
	}//end get_columns_map



	/**
	* SET_VIEW
	* @param string|null $value
	* @return bool
	*/
	public function set_view(?string $value) : bool {

		$this->view = $value;

		return true;
	}//end set_view



	/**
	* GET_VIEW
	* Return property value
	* @return string|null $this->view
	*/
	public function get_view() : ?string {

		return $this->view ?? null;
	}//end get_view



	/**
	* SET_CHILDREN_VIEW
	* @param string|null $value
	* @return bool
	*/
	public function set_children_view(?string $value) : bool {

		$this->children_view = $value;

		return true;
	}//end set_view



	/**
	* GET_CHILDREN_VIEW
	* Return property value
	* @return string|null $this->children_view
	*/
	public function get_children_view() : ?string {

		return $this->children_view ?? null;
	}//end get_children_view



	/**
	* SET_NAME
	* Used by tools
	* @param string|null $value
	* @return bool
	*/
	public function set_name(?string $value) : bool {

		$this->name = $value;

		return true;
	}//end set_name



	/**
	* GET_NAME
	* Return property value
	* @return string|null $this->name
	*/
	public function get_name() : ?string {

		return $this->name ?? null;
	}//end get_name



	/**
	* SET_DESCRIPTION
	* Used by tools
	* @param string|null $value
	* @return bool
	*/
	public function set_description(?string $value) : bool {

		$this->description = $value;

		return true;
	}//end set_description



	/**
	* GET_DESCRIPTION
	* Return property value
	* @return string|null $this->description
	*/
	public function get_description() : ?string {

		return $this->description ?? null;
	}//end get_description



	/**
	* SET_ICON
	* Used by tools
	* @param string|null $value
	* @return bool
	*/
	public function set_icon(?string $value) : bool {

		$this->icon = $value;

		return true;
	}//end set_icon



	/**
	* GET_ICON
	* Return property value
	* @return string|null $this->icon
	*/
	public function get_icon() : ?string {

		return $this->icon ?? null;
	}//end get_icon



	/**
	* SET_DEVELOPER
	* Used by tools
	* @param string|null $value
	* @return bool
	*/
	public function set_developer(?string $value) : bool {

		$this->developer = $value;

		return true;
	}//end set_developer



	/**
	* GET_DEVELOPER
	* Return property value
	* @return string|null $this->developer
	*/
	public function get_developer() : ?string {

		return $this->developer ?? null;
	}//end get_developer



	/**
	* SET_SHOW_IN_INSPECTOR
	* Used by tools
	* @param bool|null $value
	* @return bool
	*/
	public function set_show_in_inspector(?bool $value) : bool {

		$this->show_in_inspector = $value;

		return true;
	}//end set_show_in_inspector



	/**
	* GET_SHOW_IN_INSPECTOR
	* Return property value
	* @return bool|null $this->show_in_inspector
	*/
	public function get_show_in_inspector() : ?bool {

		return $this->show_in_inspector ?? null;
	}//end get_show_in_inspector



	/**
	* SET_VALUE_WITH_PARENTS
	* Used by tools
	* @param bool|null $value
	* @return bool
	*/
	public function set_value_with_parents(?bool $value) : bool {

		$this->value_with_parents = $value;

		return true;
	}//end set_value_with_parents



	/**
	* GET_VALUE_WITH_PARENTS
	* Return property value
	* @return bool|null $this->value_with_parents
	*/
	public function get_value_with_parents() : ?bool {

		return $this->value_with_parents ?? null;
	}//end get_value_with_parents


	/**
	* SET_SHOW_IN_COMPONENT
	* Used by tools
	* @param bool|null $value
	* @return bool
	*/
	public function set_show_in_component(?bool $value) : bool {

		$this->show_in_component = $value;

		return true;
	}//end set_show_in_component



	/**
	* GET_SHOW_IN_COMPONENT
	* Return property value
	* @return bool|null $this->show_in_component
	*/
	public function get_show_in_component() : ?bool {

		return $this->show_in_component ?? null;
	}//end get_show_in_component



	/**
	* SET_CONFIG
	* Used by tools
	* @param object|null $value
	* @return bool
	*/
	public function set_config(?object $value) : bool {

		$this->config = $value;

		return true;
	}//end set_config



	/**
	* GET_CONFIG
	* Return property value
	* @return object|null $this->config
	*/
	public function get_config() : ?object {

		return $this->config ?? null;
	}//end get_config



	/**
	* SET_SORTABLE
	* Used by components (columns)
	* @param bool|null $value
	* @return bool
	*/
	public function set_sortable(?bool $value) : bool {

		$this->sortable = $value;

		return true;
	}//end set_sortable



	/**
	* GET_SORTABLE
	* Return property value
	* @return bool|null $this->sortable
	*/
	public function get_sortable() : ?bool {

		return $this->sortable ?? null;
	}//end get_sortable



	/**
	* SET_FIELDS_SEPARATOR
	* Used by tools
	* @param string|null $value
	* @return bool
	*/
	public function set_fields_separator(?string $value) : bool {

		$this->fields_separator = $value;

		return true;
	}//end set_fields_separator



	/**
	* GET_FIELDS_SEPARATOR
	* Return property value
	* @return string|null $this->fields_separator
	*/
	public function get_fields_separator() : ?string {

		return $this->fields_separator ?? null;
	}//end get_fields_separator



	/**
	* SET_RECORDS_SEPARATOR
	* Used by tools
	* @param string|null $value
	* @return bool
	*/
	public function set_records_separator(?string $value) : bool {

		$this->records_separator = $value;

		return true;
	}//end set_records_separator



	/**
	* GET_RECORDS_SEPARATOR
	* Return property value
	* @return string|null $this->records_separator
	*/
	public function get_records_separator() : ?string {

		return $this->records_separator ?? null;
	}//end get_records_separator



	/**
	* SET_AUTOLOAD
	* Used by tools
	* @param bool|null $value
	* @return bool
	*/
	public function set_autoload(?bool $value) : bool {

		$this->autoload = $value;

		return true;
	}//end set_autoload



	/**
	* GET_AUTOLOAD
	* Return property value
	* @return bool|null $this->autoload
	*/
	public function get_autoload() : ?bool {

		return $this->autoload ?? null;
	}//end get_autoload



	/**
	* SET_ROLE
	* Used by tools
	* @param string|null $value
	* @return bool
	*/
	public function set_role(?string $value) : bool {

		$this->role = $value;

		return true;
	}//end set_role



	/**
	* GET_ROLE
	* Return property value
	* @return string|null $this->role
	*/
	public function get_role() : ?string {

		return $this->role ?? null;
	}//end get_role



	/*
	* SET_SECTION_MAP
	* Used to point specific components into common definitions
	* ex:  "hierarchy25" in thesaurus or "tch152" components can be mapped to "term" to be searched in the same way
	* term will be "hierarchy25" in thesaurus or will be object name in tangible heritage.
	* Uses: 	to show children option in search panel
	* 			to show the term in the thesaurus tree
	* sample:
	* 	{
	* 		"thesaurus": {
	* 			"term": "hierarchy25",
	* 			"model": "hierarchy27",
	* 			"order": "hierarchy48",
	* 			"parent": "hierarchy36",
	* 			"is_indexable": "hierarchy24",
	* 			"is_descriptor": "hierarchy23"
	* 		}
	* 	}
	* Used by tools
	* @param object|null $value
	* @return bool
	*/
	public function set_section_map(?object $value) : bool {

		$this->section_map = $value;

		return true;
	}//end set_section_map



	/**
	* GET_SECTION_MAP
	* Return property value
	* @return object|null $this->section_map
	*/
	public function get_section_map() : ?object {

		return $this->section_map ?? null;
	}//end get_section_map



	/**
	* SET_COLOR
	* Used by sections
	* @param string|null $value
	* @return bool
	*/
	public function set_color(?string $value) : bool {

		$this->color = $value;

		return true;
	}//end set_color



	/**
	* GET_COLOR
	* Return property value
	* @return string|null $this->label
	*/
	public function get_color() : ?string {

		return $this->color ?? null;
	}//end get_color



	/**
	* SET_MATRIX_TABLE
	* @param string|null $value
	* @return bool
	*/
	public function set_matrix_table(?string $value) : bool {

		$this->matrix_table = $value;

		return true;
	}//end set_matrix_table



	/**
	* GET_MATRIX_TABLE
	* Return property value
	* @return string|null $this->label
	*/
	public function get_matrix_table() : ?string {

		return $this->matrix_table ?? null;
	}//end get_matrix_table



	/**
	* SET_DATA_FN
	* data_fn defines the function to be used to get data of the ddo
	* example:
	* "data_fn" : "get_calculation_data"
	* @param string|null $value
	* @return bool
	*/
	public function set_data_fn(?string $value) : bool {

		$this->data_fn = $value;

		return true;
	}//end set_data_fn



	/**
	* GET_DATA_FN
	* Return property value
	* @return string|null $this->label
	*/
	public function get_data_fn() : ?string {

		return $this->data_fn ?? null;
	}//end get_data_fn



	/**
	* COMPARE_DDO
	* @param object $ddo1
	* @param object $ddo2
	* @param array $ar_properties = ['model','typo','type','tipo','section_tipo','mode','lang','parent']
	* @param array $ar_exclude_properties = []
	* @return bool $equal
	*/
	public static function compare_ddo(object $ddo1, object $ddo2, array $ar_properties=['model','typo','type','tipo','section_tipo','mode','lang','parent'], array $ar_exclude_properties=[]) : bool {

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

			$property_exists_in_l1	= property_exists($ddo1, $current_property);
			$property_exists_in_l2	= property_exists($ddo2, $current_property);


			// Test property exists in all items
			// if (!property_exists($ddo1, $current_property) && !property_exists($ddo2, $current_property)) {
			if ($property_exists_in_l1===false && $property_exists_in_l2===false) {
				# Skip not existing properties
				#debug_log(__METHOD__." Skipped comparison property $current_property. Property not exits in any locator ", logger::DEBUG);
				continue;
			}

			// Test property exists only in one locator
			// if (property_exists($ddo1, $current_property) && !property_exists($ddo2, $current_property)) {
			if ($property_exists_in_l1===true && $property_exists_in_l2===false) {
				#debug_log(__METHOD__." Property $current_property exists in ddo1 but not exits in ddo2 (false is returned): ".to_string($ddo1).to_string($ddo2), logger::DEBUG);
				$equal = false;
				break;
			}
			// if (property_exists($ddo2, $current_property) && !property_exists($ddo1, $current_property)) {
			if ($property_exists_in_l2===true && $property_exists_in_l1===false) {
				#debug_log(__METHOD__." Property $current_property exists in ddo2 but not exits in ddo1 (false is returned): ".to_string($ddo1).to_string($ddo2), logger::DEBUG);
				$equal = false;
				break;
			}

			// Compare verified existing properties
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
	* @param object $ddo
	* @param array $ar_ddo
	* @param array $ar_properties = ['model','typo','type','tipo','section_tipo','mode','lang','parent']
	* @return bool $found
	*/
	public static function in_array_ddo(object $ddo, array $ar_ddo, array $ar_properties=['model','typo','type','tipo','section_tipo','mode','lang','parent']) : bool {

		$found = false;

		foreach ((array)$ar_ddo as $current_ddo) {
			$found = self::compare_ddo( $ddo, $current_ddo, $ar_properties );
			if($found===true) {
				// it is into the the array
				break;
			}
		}


		return $found;
	}//end in_array_ddo



	/**
	* GET METHODS
	* By accessors. When property exits, return property value,
	* else return null
	* @param string $name
	* @return mixed
	*/
	final public function __get(string $name) {

		return $this->$name ?? null;
	}



}//end dd_object
