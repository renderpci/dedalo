<?php declare(strict_types=1);
/**
* CLASS DD_OBJECT (ddo)
* Normalized definition for Dédalo runtime objects (DDO)
*
* Responsibilities:
* - Hold a standardized set of properties for sections, components, tools, buttons, etc.
* - Validate and normalize key fields (tipo, section_tipo, parent, lang, type, ...)
* - Provide a small helper API (getters/setters, comparison utilities)
*
* DDOs are intentionally flexible and behave as enriched stdClass objects:
* - Unknown properties are ignored on construction (and registered as errors)
* - All known properties are accessible both directly ($ddo->model) and via accessors ($ddo->get_model())
*
* Core identity
* - @property string|null       $type           Logical type: 'section' | 'component' | 'grouper' | 'button' | 'tool' | ...
* - @property string|null       $tipo           Ontology tipo (e.g. 'oh14')
* - @property string|array|null $section_tipo   Section tipo or list of tipos (e.g. 'oh1')
* - @property string|null       $parent         Parent section/portal tipo (e.g. 'oh2')
* - @property string|null       $parent_grouper Ontology parent tipo
* - @property string|null       $lang           Data language (e.g. 'lg-eng')
* - @property string|null       $mode           UI and data mode: 'list', 'edit', 'search', 'choose', ...
* - @property string|null       $model          Element model name (e.g. 'component_input_text', 'section')
* - @property string|null       $id             Optional local identifier. Used to identify the DDO inside a DDO_MAP chain.
* - @property string|null       $info           Optional short information about the DDO. e.g. 'Find(spot) - component_portal'
* - @property object|array|null $properties     Custom, ontology‑driven configuration. Used to sent or overwrite the Ontology properties.
* - @property int|null          $permissions    Permission level. 0 = read only, 1 = read and write, 2 = read and write and delete, 3 = read and write and delete and create
*
* Labels & translation
* - @property string|null $label               Main label. e.g. 'Title'
* - @property array|null  $labels              Alternative labels. e.g. ['Title']
* - @property bool|null   $translatable        Whether the element is translatable. e.g. component_portal is false, but component_input_text probably is true
*
* Composition / context
* - @property array|null  $tools               Array of tool DDOs (minimal context of the tool)
* - @property array|null  $buttons             Array of button DDOs (minimal context of the button)
* - @property object|null $css                 Arbitrary CSS options
* - @property array|null  $target_sections     Target section definitions (e.g. [{'tipo':'dd125','label':'Projects']
* - @property array|null  $request_config      Request configuration metadata (e.g. [{'show': {'ddo_map': [...]}}]
* - @property array|null  $columns_map         Column definitions for tabular views
* - @property string|null $fields_separator    Fields separator. e.g. ", "
* - @property string|null $records_separator   Records separator. e.g. " | "
* - @property string|null $legacy_model        Legacy model. e.g. "component_autocomplete_hi"
* - @property bool|null   $autoload            Autoload. e.g. true
* - @property string|null $role                Role. e.g. "main_component" (used by tools)
* - @property object|null $section_map         Section map. (used by tools) e.g. {"thesaurus": {"term": "hierarchy25", "model": "hierarchy27", "order": "hierarchy48", "parent": "hierarchy36", "is_indexable": "hierarchy24", "is_descriptor": "hierarchy23"}}
* - @property string|null $color               Color. e.g. "#f1f1f1" (used by sections)
* - @property string|null $matrix_table        Matrix table. e.g. "matrix_list"
* - @property string|null $data_fn             Data function. e.g. "get_calculation_data" (It is used in "mdcat2431" for the function that retrieves DDO data.)
*
* Execution and parsing
* - @property string|null $fn                  Generic function name to be invoked in the execution context (e.g. custom callbacks)
* - @property string|null $diffusion_node_tipo Diffusion node tipo used to bind the DDO to a specific diffusion configuration/node
* - @property object|null $options			   Generic object options container tu pass custom vars across DDOs
* - @property object|null $parser_args		   Diffusion parser arguments (used by diffusion)
*
* Runtime
* - @property array|null  $errors              Collected error messages
*/
class dd_object extends stdClass {

	/**
	 * Identifies this structure as a DDO.
	 * @var string
	 */
	public $typo = 'ddo';



	/**
	 * Allowed values for the logical DDO type.
	 * This list is enforced by set_type() and is the canonical set of types
	 * used across Dédalo (areas, sections, components, tools, etc.).
	 *
	 * @var array<int,string>
	 */
	public static $ar_type_allowed = [
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
	* Build a new DDO from an optional stdClass‑like data object.
	*
	* Behavior:
	* - When $data is null, an empty DDO is created.
	* - When $data is not an object, an error is logged and stored in $this->errors.
	* - Known properties are assigned through their corresponding set_* methods.
	* - Unknown properties are ignored and registered as errors.
	* - If a model is present, the logical type is inferred via resolve_type_from_model() and set_type().
	*
	* @param object|null $data Raw DDO data (typically decoded JSON/stdClass) or null for an empty DDO
	* @return void
	*/
	public function __construct( ?object $data=null ) {

		// null case: allow empty DDO construction
			if ($data === null) {
				return;
			}

		// enforce object input
			if (!is_object($data)) {

				$msg = " wrong data format. object expected. Given type: ".gettype($data);
				debug_log(
					__METHOD__ . $msg . ' data: ' . to_string($data),
					logger::ERROR
				);

				if (SHOW_DEBUG === true) {
					dump(debug_backtrace()[0], $msg);
				}

				$this->errors[] = $msg;
				return;
			}

		// set model first (some setters may rely on it)
			if (isset($data->model)) {
				$this->set_model($data->model);
			}

		// set all known properties via their setters
			foreach ($data as $key => $value) {
				$method = 'set_'.$key;

				if (method_exists($this, $method)) {
					$set_value = $this->{$method}($value);
					if ($set_value === false && empty($this->errors)) {
						$this->errors[] = 'Invalid value for: '.$key.' . value: '.to_string($value);
					}
				}else{
					debug_log(
						__METHOD__
						.' Ignored received property: '.$key.' not defined as set method.'. PHP_EOL
						.' data: ' . to_string($data),
						logger::ERROR
					);
					$this->errors[] = 'Ignored received property: '.$key.' not defined as set method. Data: '. json_encode($data, JSON_PRETTY_PRINT);
				}
			}

		// resolve and set type from model
			$type = $this->resolve_type_from_model($this->model ?? null);
			if ($type === null) {
				// type could not be inferred from model, constructor stops here
				return;
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
	* @return string|null $this->type
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
				$this->model = ontology_node::get_model_by_tipo($this->tipo,true);
			}

		return true;
	}//end set_tipo



	/**
	* GET_TIPO
	* Return property value
	* @return string|null $this->tipo
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
	public function set_section_tipo(string|array|null $value) : bool  {

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
	* @param string|null $value
	* @return bool
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
	* @return string|null $this->id
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
	* @return string|null $this->info
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
	* @return string|null $this->color
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
	* @return string|null $this->matrix_table
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
	* @return string|null $this->data_fn
	*/
	public function get_data_fn() : ?string {

		return $this->data_fn ?? null;
	}//end get_data_fn



	/**
	* SET_FN
	* @param string|null $value
	* @return bool
	*/
	public function set_fn(?string $value) : bool {

		$this->fn = $value;

		return true;
	}//end set_fn



	/**
	* SET_DIFFUSION_NODE_TIPO
	* @param string|null $value
	* @return bool
	*/
	public function set_diffusion_node_tipo(?string $value) : bool {

		$this->diffusion_node_tipo = $value;

		return true;
	}//end set_diffusion_node_tipo



	/**
	* GET_DIFFUSION_NODE_TIPO
	* Return property value
	* @return string|null $this->diffusion_node_tipo
	*/
	public function get_diffusion_node_tipo() : ?string {

		return $this->diffusion_node_tipo ?? null;
	}//end get_diffusion_node_tipo



	/**
	* GET_FN
	* @return string|null $this->fn
	*/
	public function get_fn() : ?string {

		return $this->fn ?? null;
	}//end get_fn



	/**
	* SET_OPTIONS
	* @param object|null $value
	* @return bool
	*/
	public function set_options(?object $value) : bool {

		$this->options = $value;

		return true;
	}//end set_options



	/**
	* GET_OPTIONS
	* @return object|null $this->options
	*/
	public function get_options() : ?object {

		return $this->options ?? null;
	}//end get_options



	/**
	* SET_PARSER_ARGS
	* @param object|null $value
	* @return bool
	*/
	public function set_parser_args(?object $value) : bool {

		$this->parser_args = $value;

		return true;
	}//end set_parser_args



	/**
	* GET_PARSER_ARGS
	* @return object|null $this->parser_args
	*/
	public function get_parser_args() : ?object {

		return $this->parser_args ?? null;
	}//end get_parser_args



	/**
	* HAS_ERRORS
	* Helper to know if constructor or setters have registered any error.
	* @return bool
	*/
	public function has_errors() : bool {

		return !empty($this->errors);
	}//end has_errors



	/**
	* GET_ERRORS
	* Returns collected error messages (if any) as a flat array of strings
	* @return array
	*/
	public function get_errors() : array {

		return $this->errors ?? [];
	}//end get_errors



	/**
	* RESOLVE_TYPE_FROM_MODEL
	* Internal helper to infer "type" from "model"
	* @param string|null $model
	* @return string|null
	*/
	private function resolve_type_from_model(?string $model) : ?string {

		$model = $model ?? '';

		switch (true) {
			case strpos($model, 'component_')===0 || strpos($model, 'field_')===0 :
				return 'component';
			case $model==='section' :
				return 'section';
			case $model==='relation_list' :
				return 'relation_list';
			case in_array($model, section::get_ar_grouper_models()) :
				return 'grouper';
			case strpos($model, 'button')===0 :
				return 'button';
			case strpos($model, 'area')===0 :
				return 'area';
			case $model==='login' :
				return 'login';
			case $model==='menu' :
				return 'menu';
			case $model==='install' :
				return 'install';
			case $model==='dd_grid' :
				return 'dd_grid';
			case strpos($model, 'tool_')===0 :
				return 'tool';
			default:
				debug_log(
					__METHOD__
					. " Error. Undefined type from model: " . PHP_EOL
					. ' model: ' . to_string($model),
					logger::ERROR
				);

				return null;
		}
	}//end resolve_type_from_model




	/**
	* COMPARE_DDO
	* Compare two DDO‑like objects property by property.
	*
	* When $ar_properties is empty, the method builds the comparison set automatically
	* from all properties present in either DDO, excluding any listed in $ar_exclude_properties.
	* For the special case 'section_id' comparison uses loose comparison (==), the rest uses strict (===).
	*
	* @param object $ddo1                 First DDO to compare
	* @param object $ddo2                 Second DDO to compare
	* @param array  $ar_properties        List of properties to compare (empty = auto‑detect)
	* @param array  $ar_exclude_properties Properties to exclude when auto‑detecting
	* @return bool                        TRUE when all compared properties match, FALSE otherwise
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
	* Search a DDO‑like object inside an array of DDOs using compare_ddo().
	*
	* @param object $ddo           DDO instance to search
	* @param array  $ar_ddo        Array of DDOs to inspect
	* @param array  $ar_properties Properties to use for comparison (passed to compare_ddo())
	* @return bool                 TRUE if a matching DDO is found, FALSE otherwise
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
	* Magic accessor used as a safe fallback for dynamic properties.
	*
	* When the requested property exists, its value is returned; otherwise null is returned.
	* This keeps DDO usage ergonomic even when properties are added dynamically.
	*
	* @param string $name Property name
	* @return mixed       Property value or null when undefined
	*/
	final public function __get(string $name) {

		return $this->$name ?? null;
	}



}//end dd_object
