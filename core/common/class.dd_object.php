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
* - @property int|null          $permissions    Permission level. 0 = read only, 1 = read and write, 2 = read and write and delete, 3 = read and write and delete and create
* - @property object|array|null $properties     Custom, ontology‑driven configuration. Used to sent or overwrite the Ontology properties.
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
* - @property string|null $data_fn             DEPRECATED. Remove in favor of fn. Data function. e.g. "get_calculation_data" (It is used in "mdcat2431" for the function that retrieves DDO data.)
*
* Execution and parsing
* - @property string|null $fn                  Generic function name to be invoked in the execution context (e.g. custom callbacks)
* - @property string|null $diffusion_node_tipo Diffusion node tipo used to bind the DDO to a specific diffusion configuration/node
* - @property object|null $options			   Generic object options container tu pass custom vars across DDOs
* - @property object|null $parser_args		   Diffusion parser arguments (used by diffusion)
* - @property object|null $data_slice 		   Data slice definition. e.g. {"offset":0, "length":1}
* - @property array|null  $section_filter      Section filtering list used by relation_list to restrict inverse references by section tipo.
* - @property array|null  $component_filter    Component filtering list used by relation_list to restrict inverse references by component tipo.
*
* Runtime
* - @property array|null  $errors              Collected error messages
*/
class dd_object extends stdClass implements JsonSerializable {

	/**
	 * Literal marker that identifies any object carrying this property as a DDO.
	 * Consumers (JS and PHP) check `typo === 'ddo'` to distinguish DDOs from
	 * plain stdClass objects or other structured payloads.
	 * @var string $typo
	 */
	public string $typo = 'ddo';

	// Core identity

	/**
	 * Logical runtime type. One of the values in $ar_type_allowed
	 * (e.g. 'section', 'component', 'tool'). Set via set_type() which
	 * validates against the allowlist. Usually inferred from $model by the
	 * constructor via resolve_type_from_model().
	 * @var ?string $type
	 */
	protected ?string $type = null;

	/**
	 * Ontology tipo identifier (e.g. 'oh14', 'hierarchy25'). Every valid tipo
	 * has a known top-level domain (TLD) prefix verified by get_tld_from_tipo().
	 * Setting this also auto-resolves $model when $model is not already set.
	 * @var ?string $tipo
	 */
	protected ?string $tipo = null;

	/**
	 * Section tipo(s) that contextualize this DDO. May be a single tipo string
	 * (e.g. 'oh1') or an array of tipos when the DDO spans multiple sections.
	 * @var string|array|null $section_tipo
	 */
	protected string|array|null $section_tipo = null;

	/**
	 * Parent section or portal tipo (e.g. 'oh2'). Must pass get_tld_from_tipo()
	 * validation. Used to climb the containment hierarchy.
	 * @var ?string $parent
	 */
	protected ?string $parent = null;

	/**
	 * Ontology grouper tipo that owns this element within the ontology tree.
	 * Validated identically to $parent (must have a known TLD prefix).
	 * @var ?string $parent_grouper
	 */
	protected ?string $parent_grouper = null;

	/**
	 * Active data language for this DDO (e.g. 'lg-eng', 'lg-spa').
	 * Must start with the 'lg-' prefix; validated in set_lang().
	 * @var ?string $lang
	 */
	protected ?string $lang = null;

	/**
	 * UI and data operation mode. Common values: 'list', 'edit', 'search', 'choose'.
	 * Controls which rendering and data-retrieval paths are taken by the consumer.
	 * @var ?string $mode
	 */
	protected ?string $mode = null;

	/**
	 * PHP class / JS module name for this element (e.g. 'component_input_text',
	 * 'section', 'tool_export'). Used by the factory to instantiate the right class
	 * and by resolve_type_from_model() to derive $type.
	 * @var ?string $model
	 */
	protected ?string $model = null;

	/**
	 * Optional caller-assigned identifier. Distinguishes this DDO from sibling
	 * DDOs inside a DDO_MAP chain when the same tipo appears more than once.
	 * @var ?string $id
	 */
	protected ?string $id = null;

	/**
	 * Short human-readable annotation for debugging or logging
	 * (e.g. 'Find(spot) - component_portal'). Never used in data logic.
	 * @var ?string $info
	 */
	protected ?string $info = null;

	/**
	 * Custom, ontology-driven configuration object. Passed to the instantiated
	 * component/section to override or supplement ontology properties at runtime.
	 * Accepts either an object or an array depending on the caller.
	 * @var object|array|null $properties
	 */
	protected object|array|null $properties = null;

	/**
	 * Permission level granted to the current user for this element.
	 * 0 = read-only, 1 = read+write, 2 = read+write+delete, 3 = full (including create).
	 * @var ?int $permissions
	 */
	protected ?int $permissions = null;

	// Labels & translation

	/**
	 * Primary human-readable label for this element (e.g. 'Title').
	 * Used in UI headers, column captions, and export column names.
	 * @var ?string $label
	 */
	protected ?string $label = null;

	/**
	 * Alternative label variants (e.g. plural forms, short labels).
	 * Mostly used by tools that need multiple display strings.
	 * @var ?array $labels
	 */
	protected ?array $labels = null;

	/**
	 * Whether this element holds language-specific content that should be
	 * replicated per language. False for structural elements such as portals;
	 * true for text/value-bearing components.
	 * @var ?bool $translatable
	 */
	protected ?bool $translatable = null;

	// Composition / context

	/**
	 * Array of tool DDO definitions attached to this element. Each entry is a
	 * minimal DDO describing one tool (tipo, model, label, …). Read-only from
	 * nested context (see context-cache architecture note in MEMORY).
	 * @var ?array $tools
	 */
	protected ?array $tools = null;

	/**
	 * Array of button DDO definitions attached to this element. Structure mirrors
	 * $tools. Read-only from nested context.
	 * @var ?array $buttons
	 */
	protected ?array $buttons = null;

	/**
	 * Arbitrary CSS option object passed through to the client renderer.
	 * Shape is consumer-defined; no server-side validation is performed.
	 * @var ?object $css
	 */
	protected ?object $css = null;

	/**
	 * Target section definitions used by relation or portal components to know
	 * which sections they point to. Each entry is an object with at least
	 * 'tipo' and 'label' (e.g. [{'tipo':'dd125','label':'Projects'}]).
	 * @var ?array $target_sections
	 */
	protected ?array $target_sections = null;

	/**
	 * Request configuration metadata that governs how the section/component
	 * fetches and shapes its data. Passed to the request_config builder.
	 * See the request-config hardening memory entry for the 3-stage orchestrator.
	 * @var ?array $request_config
	 */
	protected ?array $request_config = null;

	/**
	 * Column definitions for tabular/grid views. Each entry describes one column
	 * (tipo, label, width, sortable, …) and maps to a component DDO.
	 * @var ?array $columns_map
	 */
	protected ?array $columns_map = null;

	// View

	/**
	 * Named rendering view for this element (e.g. 'list', 'edit', 'card').
	 * Determines which template or render path the client uses.
	 * @var ?string $view
	 */
	protected ?string $view = null;

	/**
	 * Named rendering view applied to child elements of this DDO (e.g. rows
	 * inside a list). Allows parent and child to use different render strategies.
	 * @var ?string $children_view
	 */
	protected ?string $children_view = null;

	// Tools specifics

	/**
	 * Human-readable name of the tool (e.g. 'Export', 'Import CSV').
	 * Displayed in the tools panel inspector.
	 * @var ?string $name
	 */
	protected ?string $name = null;

	/**
	 * Extended description of the tool shown in the inspector panel.
	 * @var ?string $description
	 */
	protected ?string $description = null;

	/**
	 * Icon identifier or path for the tool/button UI representation.
	 * @var ?string $icon
	 */
	protected ?string $icon = null;

	/**
	 * Developer attribution string for the tool (e.g. team name or author).
	 * Informational only; not used in data logic.
	 * @var ?string $developer
	 */
	protected ?string $developer = null;

	/**
	 * Whether the tool should appear in the inspector panel sidebar.
	 * When false the tool exists but is hidden from the UI tool list.
	 * @var ?bool $show_in_inspector
	 */
	protected ?bool $show_in_inspector = null;

	/**
	 * When true, the resolved value includes ancestor term labels in
	 * the display string (used by thesaurus hierarchy components).
	 * @var ?bool $value_with_parents
	 */
	protected ?bool $value_with_parents = null;

	/**
	 * Whether the tool should also appear embedded inside the component UI
	 * (as opposed to only appearing in the global tools panel).
	 * @var ?bool $show_in_component
	 */
	protected ?bool $show_in_component = null;

	/**
	 * Tool-specific configuration object. Shape is defined per tool;
	 * no validation is applied at the DDO level.
	 * @var ?object $config
	 */
	protected ?object $config = null;

	/**
	 * Whether this column/component can be used as a sort key in list views.
	 * @var ?bool $sortable
	 */
	protected ?bool $sortable = null;

	/**
	 * Separator string placed between field values when rendering multiple
	 * component values inline (e.g. ', ').
	 * @var ?string $fields_separator
	 */
	protected ?string $fields_separator = null;

	/**
	 * Separator string placed between multiple record blocks in a concatenated
	 * output (e.g. ' | '). Used alongside $fields_separator in export/diffusion.
	 * @var ?string $records_separator
	 */
	protected ?string $records_separator = null;

	/**
	 * When true, the consumer should load this element's data automatically
	 * on initialization without waiting for a user action.
	 * @var ?bool $autoload
	 */
	protected ?bool $autoload = null;

	/**
	 * Semantic role of this DDO within a tool's DDO_MAP chain
	 * (e.g. 'main_component'). Lets a tool locate a specific DDO by role
	 * rather than position.
	 * @var ?string $role
	 */
	protected ?string $role = null;

	/**
	 * Scope-to-component mapping for thesaurus/section contexts. Maps semantic
	 * role names ('term', 'parent', 'order', …) to concrete tipo strings so
	 * tools and search can operate on them uniformly across different sections.
	 * See the section_map resolver memory entry.
	 * @var ?object $section_map
	 */
	protected ?object $section_map = null;

	/**
	 * Accent color for the section UI (e.g. '#f1f1f1'). Used by the client
	 * to differentiate sections visually in the navigation tree.
	 * @var ?string $color
	 */
	protected ?string $color = null;

	/**
	 * PostgreSQL JSONB matrix table name used to store this section's component
	 * data (e.g. 'matrix_list'). Routes queries to the correct physical table.
	 * @var ?string $matrix_table
	 */
	protected ?string $matrix_table = null;

	/**
	 * DEPRECATED. Use $fn instead.
	 * Name of a custom PHP function called to retrieve calculation data for
	 * this DDO (e.g. 'get_calculation_data'). Kept for backward compatibility
	 * with legacy ontology entries (e.g. mdcat2431).
	 * @var ?string $data_fn
	 */
	protected ?string $data_fn = null;

	/**
	 * v6 model name preserved for migration lookup. Used to map old autocomplete
	 * or custom component models to their v7 equivalents during import/diffusion.
	 * @var ?string $legacy_model
	 */
	protected ?string $legacy_model = null;

	// Execution & Parsing

	/**
	 * Generic callback function name invoked in the execution context of this DDO
	 * (e.g. a custom data-retrieval or rendering hook). Replaces the deprecated $data_fn.
	 * @var ?string $fn
	 */
	protected ?string $fn = null;

	/**
	 * Diffusion node tipo that binds this DDO to a specific diffusion
	 * configuration/node in the diffusion pipeline.
	 * Note: the class header uses the public alias 'diffusion_node_tipo'; the
	 * actual stored property is 'diffusion_tipo'.
	 * @var ?string $diffusion_tipo
	 */
	protected ?string $diffusion_tipo = null;

	/**
	 * Generic options container for passing custom variables between DDOs or
	 * down to component implementations without polluting named properties.
	 * @var ?object $options
	 */
	protected ?object $options = null;

	/**
	 * Arguments forwarded to the diffusion parser when this DDO is processed
	 * through the diffusion chain (e.g. rendering templates or RDF mappings).
	 * @var ?object $parser_args
	 */
	protected ?object $parser_args = null;

	/**
	 * Windowing descriptor for partial data retrieval. Shape: {offset: int, length: int}.
	 * Consumers use this to fetch a slice of a component's data array rather than
	 * the full set (e.g. first image only).
	 * @var ?object $data_slice
	 */
	protected ?object $data_slice = null;

	/**
	 * Allowlist of section tipos used by relation_list to restrict which sections
	 * can appear as inverse references (e.g. ['oh1', 'oh2']).
	 * @var ?array $section_filter
	 */
	protected ?array $section_filter = null;

	/**
	 * Allowlist of component tipos used by relation_list to restrict inverse
	 * references to specific component columns (e.g. ['oh14', 'oh15']).
	 * @var ?array $component_filter
	 */
	protected ?array $component_filter = null;

	// Errors

	/**
	 * Accumulated error messages from the constructor and all set_* calls.
	 * Null when no errors have occurred. Inspect with has_errors() / get_errors().
	 * @var ?array $errors
	 */
	protected ?array $errors = null;



	/**
	 * Allowed values for the logical DDO type.
	 * This list is enforced by set_type() and is the canonical set of types
	 * used across Dédalo (areas, sections, components, tools, etc.).
	 *
	 * @var array<int,string>
	 */
	public static array $ar_type_allowed = [
		'area',
		'section',
		'relation_list',
		'component',
		'grouper',
		'button',
		'tm',
		'widget',
		'installer',
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
	* Sets the logical runtime type, validating it against the $ar_type_allowed allowlist.
	*
	* Rejects any value not present in the allowlist and records the rejection in
	* $this->errors. This is the only write path for $type; callers should never
	* assign $type directly.
	*
	* @param string $value - must be one of the values in dd_object::$ar_type_allowed
	* @return bool - false when $value is not in the allowlist
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
	* Returns the logical runtime type of this DDO (e.g. 'section', 'component', 'tool').
	* @return string|null - null when type has not been set or could not be inferred from the model
	*/
	public function get_type() : ?string {

		return $this->type ?? null;
	}//end get_type



	/**
	* SET_TIPO
	* Sets the ontology tipo identifier, validating that it has a known TLD prefix.
	*
	* Side effects:
	* - An empty/null value resets $tipo to null (clearing without error).
	* - A non-empty value that fails get_tld_from_tipo() is rejected and logged as an error.
	* - When $tipo is accepted and $model is not yet set, $model is auto-resolved via
	*   ontology_node::get_model_by_tipo() so callers do not have to supply both.
	*
	* @param string|null $value - ontology tipo such as 'oh14'; null clears the field
	* @return bool - false when $value is non-empty and fails TLD validation
	*/
	public function set_tipo( ?string $value ) : bool  {

		if(empty($value)) {
			$this->tipo = null;
			return true;
		}

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
	* Returns the ontology tipo identifier (e.g. 'oh14', 'hierarchy25').
	* @return string|null - null when tipo has not been set
	*/
	public function get_tipo() : ?string {

		return $this->tipo ?? null;
	}//end get_tipo



	/**
	* SET_SECTION_TIPO
	* Sets the section tipo context for this DDO.
	*
	* Accepts either a single tipo string or an array of tipos when the DDO spans
	* multiple sections. No TLD validation is performed here; validation is the
	* caller's responsibility.
	*
	* @param string|array|null $value - single tipo, array of tipos, or null to clear
	* @return bool - always true
	*/
	public function set_section_tipo(string|array|null $value) : bool  {

		$this->section_tipo = $value;

		return true;
	}//end set_section_tipo



	/**
	* GET_SECTION_TIPO
	* Returns the section tipo context: a single tipo string, an array of tipos,
	* or null when not set.
	* @return mixed - string|array|null depending on how it was set
	*/
	public function get_section_tipo() : mixed {

		return $this->section_tipo ?? null;
	}//end get_section_tipo



	/**
	* SET_PARENT
	* Sets the parent section or portal tipo, validating the TLD prefix.
	*
	* A null value is accepted without validation (clears the field).
	* A non-null value that fails get_tld_from_tipo() is rejected as an error.
	*
	* @param string|null $value - parent tipo (e.g. 'oh2') or null to clear
	* @return bool - false when $value is non-null and fails TLD validation
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
	* Returns the parent section or portal tipo (e.g. 'oh2').
	* @return string|null - null when parent has not been set
	*/
	public function get_parent() : ?string {

		return $this->parent ?? null;
	}//end get_parent



	/**
	* SET_PARENT_GROUPER
	* Sets the ontology grouper tipo, validating the TLD prefix.
	*
	* Validation mirrors set_parent(): null clears the field without error;
	* any non-null value must have a recognized TLD prefix.
	*
	* @param string|null $value - grouper tipo or null to clear
	* @return bool - false when $value is non-null and fails TLD validation
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
	* Returns the ontology grouper tipo that owns this element in the ontology tree.
	* @return string|null - null when parent_grouper has not been set
	*/
	public function get_parent_grouper() : ?string {

		return $this->parent_grouper ?? null;
	}//end get_parent_grouper



	/**
	* SET_LANG
	* Sets the active data language for this DDO.
	*
	* Validates that the value starts with the 'lg-' prefix (e.g. 'lg-eng', 'lg-spa').
	* A null value is accepted without validation. Any non-null value lacking the prefix
	* is rejected and added to $this->errors.
	*
	* @param string|null $value - language code prefixed with 'lg-', or null to clear
	* @return bool - false when $value is non-null and missing the 'lg-' prefix
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
	* Returns the active data language (e.g. 'lg-eng').
	* @return string|null - null when lang has not been set
	*/
	public function get_lang() : ?string {

		return $this->lang ?? null;
	}//end get_lang



	/**
	* SET_MODE
	* Sets the UI and data operation mode (e.g. 'list', 'edit', 'search', 'choose').
	* No validation is applied; any string (or null) is accepted.
	* @param string|null $value - mode name or null to clear
	* @return bool - always true
	*/
	public function set_mode(?string $value) : bool {

		$this->mode = $value;

		return true;
	}//end set_mode



	/**
	* GET_MODE
	* Returns the UI and data operation mode (e.g. 'list', 'edit', 'search').
	* @return string|null - null when mode has not been set
	*/
	public function get_mode() : ?string {

		return $this->mode ?? null;
	}//end get_mode



	/**
	* SET_MODEL
	* Sets the PHP class / JS module name for this DDO (e.g. 'component_input_text').
	* The constructor calls this before iterating other properties so that
	* type resolution via resolve_type_from_model() can rely on an already-set model.
	* @param string|null $value - class/module name or null to clear
	* @return bool - always true
	*/
	public function set_model(?string $value) : bool {

		$this->model = $value;

		return true;
	}//end set_model



	/**
	* GET_MODEL
	* Returns the class/module model name (e.g. 'component_input_text', 'section').
	* @return string|null - null when model has not been set
	*/
	public function get_model() : ?string {

		return $this->model ?? null;
	}//end get_model



	/**
	* SET_ID
	* Sets the optional caller-assigned identifier used to distinguish sibling DDOs
	* in a DDO_MAP chain when the same tipo appears more than once.
	* @param string|null $value - identifier string or null to clear
	* @return bool - always true
	*/
	public function set_id(?string $value) : bool {

		$this->id = $value;

		return true;
	}//end set_id



	/**
	* GET_ID
	* Returns the optional local identifier for this DDO within a DDO_MAP chain.
	* @return string|null - null when id has not been set
	*/
	public function get_id() : ?string {

		return $this->id ?? null;
	}//end get_id



	/**
	* SET_INFO
	* Sets the short annotation string used for debugging context
	* (e.g. 'Find(spot) - component_portal'). Never affects data logic.
	* @param string|null $value - annotation text or null to clear
	* @return bool - always true
	*/
	public function set_info(?string $value) : bool {

		$this->info = $value;

		return true;
	}//end set_info



	/**
	* GET_INFO
	* Returns the short annotation string (debugging context only).
	* @return string|null - null when info has not been set
	*/
	public function get_info() : ?string {

		return $this->info ?? null;
	}//end get_info



	/**
	* SET_LEGACY_MODEL
	* Sets the v6 model name preserved for migration lookup
	* (e.g. 'component_autocomplete_hi').
	* @param string|null $value - v6 model name or null to clear
	* @return bool - always true
	*/
	public function set_legacy_model(?string $value) : bool {

		$this->legacy_model = $value;

		return true;
	}//end set_legacy_model



	/**
	* GET_LEGACY_MODEL
	* Returns the v6 model name used for migration/import lookups.
	* @return string|null - null when legacy_model has not been set
	*/
	public function get_legacy_model() : ?string {

		return $this->legacy_model ?? null;
	}//end get_legacy_model



	/**
	* SET_PROPERTIES
	* Sets the ontology-driven configuration payload for this DDO.
	*
	* Accepts 'mixed' because the PHP 'object' type hint was not available before PHP 7.2
	* and callers may pass either an object or an array depending on context.
	*
	* (!) The 'mixed' signature is intentional — do not narrow it to 'object|array|null'
	* without auditing all callers. Narrowing would silently coerce or reject some payloads.
	*
	* @see https://php.net/manual/en/functions.arguments.php#functions.arguments.type-declaration
	* @param mixed $value - configuration object or array; null to clear
	* @return bool - always true
	*/
	public function set_properties(mixed $value) : bool {

		$this->properties = $value;

		return true;
	}//end set_properties



	/**
	* GET_PROPERTIES
	* Returns the ontology-driven configuration payload (object, array, or null).
	* @return mixed - object|array|null depending on what was set
	*/
	public function get_properties() : mixed {

		return $this->properties ?? null;
	}//end get_properties



	/**
	* SET_PERMISSIONS
	* Sets the permission level for the current user on this element.
	* 0 = read-only, 1 = read+write, 2 = read+write+delete, 3 = full (including create).
	* @param int|null $value - permission level or null when not specified
	* @return bool - always true
	*/
	public function set_permissions(?int $value) : bool {

		$this->permissions = $value;

		return true;
	}//end set_permissions



	/**
	* GET_PERMISSIONS
	* Returns the permission level (0–3) or null when not specified.
	* @return int|null - permission level, or null if not set
	*/
	public function get_permissions() : ?int {

		return $this->permissions ?? null;
	}//end get_permissions



	/**
	* SET_LABEL
	* Sets the primary human-readable label for this element (e.g. 'Title').
	* @param string|null $value - label text or null to clear
	* @return bool - always true
	*/
	public function set_label(?string $value) : bool {

		$this->label = $value;

		return true;
	}//end set_label



	/**
	* GET_LABEL
	* Returns the primary display label (e.g. 'Title').
	* @return string|null - null when label has not been set
	*/
	public function get_label() : ?string {

		return $this->label ?? null;
	}//end get_label



	/**
	* SET_LABELS
	* Sets the alternative label variants for this element (e.g. plural or short forms).
	* Primarily used by tools that need multiple display strings alongside $label.
	* @param array|null $value - array of label strings or null to clear
	* @return bool - always true
	*/
	public function set_labels(?array $value) : bool {

		$this->labels = $value;

		return true;
	}//end set_labels



	/**
	* GET_LABELS
	* Returns the alternative label variants array.
	* @return array|null - null when labels has not been set
	*/
	public function get_labels() : ?array {

		return $this->labels ?? null;
	}//end get_labels



	/**
	* SET_TRANSLATABLE
	* Sets whether this element holds language-specific content to be replicated
	* per language (true) or is language-agnostic (false).
	* Note the parameter is non-nullable bool (not ?bool) — callers must pass true/false.
	* @param bool $value - true for translatable elements, false for structural ones
	* @return bool - always true
	*/
	public function set_translatable(bool $value) : bool {

		$this->translatable = $value;

		return true;
	}//end set_translatable



	/**
	* GET_TRANSLATABLE
	* Returns whether this element is translatable (true/false) or unset (null).
	* @return bool|null - null when translatable has not been set
	*/
	public function get_translatable() : ?bool {

		return $this->translatable ?? null;
	}//end get_translatable



	/**
	* SET_TOOLS
	* Sets the array of tool DDO definitions attached to this element.
	* Each entry is a minimal DDO object describing one tool (tipo, model, label, …).
	*
	* Note: the validation block below was disabled (commented out) when the signature
	* was tightened to ?array, making the runtime check redundant.
	*
	* @param array|null $value - array of tool DDO objects or null to clear
	* @return bool - always true
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
	* Returns the array of tool DDO definitions attached to this element.
	* @return array|null - null when tools have not been set
	*/
	public function get_tools() : ?array {

		return $this->tools ?? null;
	}//end get_tools



	/**
	* SET_BUTTONS
	* Sets the array of button DDO definitions attached to this element.
	* Structure mirrors $tools: each entry is a minimal DDO for one button.
	*
	* Note: validation block disabled for the same reason as set_tools — the ?array
	* type hint makes the runtime type check superfluous.
	*
	* @param array|null $value - array of button DDO objects or null to clear
	* @return bool - always true
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
	* Returns the array of button DDO definitions attached to this element.
	* @return array|null - null when buttons have not been set
	*/
	public function get_buttons() : ?array {

		return $this->buttons ?? null;
	}//end get_buttons



	/**
	* SET_CSS
	* Sets the CSS options object passed through to the client renderer.
	* Shape is consumer-defined; no validation is performed at the DDO level.
	* @param object|null $value - CSS options object or null to clear
	* @return bool - always true
	*/
	public function set_css(?object $value) : bool {

		$this->css = $value;

		return true;
	}//end set_css



	/**
	* GET_CSS
	* Returns the CSS options object for the client renderer.
	* @return object|null - null when css has not been set
	*/
	public function get_css() : ?object {

		return $this->css ?? null;
	}//end get_css



	/**
	* SET_TARGET_SECTIONS
	* Sets the target section definitions used by relation/portal components.
	* Each entry describes one target section (at minimum 'tipo' and 'label').
	* @param array|null $value - array of section descriptor objects or null to clear
	* @return bool - always true
	*/
	public function set_target_sections(?array $value) : bool {

		$this->target_sections = $value;

		return true;
	}//end set_target_sections



	/**
	* GET_TARGET_SECTIONS
	* Returns the target section descriptor array for relation/portal components.
	* @return array|null - null when target_sections has not been set
	*/
	public function get_target_sections() : ?array {

		return $this->target_sections ?? null;
	}//end get_target_sections



	/**
	* SET_REQUEST_CONFIG
	* Sets the request configuration metadata that governs how the section/component
	* fetches and shapes its data. Passed to the 3-stage request_config orchestrator.
	* See the request-config hardening memory entry for the full builder contract.
	* @param array|null $value - request config array (e.g. [{'show': {'ddo_map': [...]}}]) or null
	* @return bool - always true
	*/
	public function set_request_config(?array $value) : bool {

		$this->request_config = $value;

		return true;
	}//end set_request_config



	/**
	* GET_REQUEST_CONFIG
	* Returns the request configuration metadata array.
	* @return array|null - null when request_config has not been set
	*/
	public function get_request_config() : ?array {

		return $this->request_config ?? null;
	}//end get_request_config



	/**
	* SET_COLUMNS_MAP
	* Sets the column definitions for tabular/grid views. Each entry maps a component
	* tipo to display metadata (label, width, sortable flag, …).
	* @param array|null $value - array of column definition objects or null to clear
	* @return bool - always true
	*/
	public function set_columns_map(?array $value) : bool {

		$this->columns_map = $value;

		return true;
	}//end set_columns_map



	/**
	* GET_COLUMNS_MAP
	* Returns the column definitions array for tabular/grid views.
	* @return array|null - null when columns_map has not been set
	*/
	public function get_columns_map() : ?array {

		return $this->columns_map ?? null;
	}//end get_columns_map



	/**
	* SET_VIEW
	* Sets the named rendering view for this element (e.g. 'list', 'edit', 'card').
	* Determines which template or render path the client uses for this DDO.
	* @param string|null $value - view name or null to clear
	* @return bool - always true
	*/
	public function set_view(?string $value) : bool {

		$this->view = $value;

		return true;
	}//end set_view



	/**
	* GET_VIEW
	* Returns the named rendering view for this element.
	* @return string|null - null when view has not been set
	*/
	public function get_view() : ?string {

		return $this->view ?? null;
	}//end get_view



	/**
	* SET_CHILDREN_VIEW
	* Sets the named rendering view applied to child elements of this DDO (e.g. rows
	* inside a list). Allows parent and child to use different render strategies.
	* @param string|null $value - child view name or null to clear
	* @return bool - always true
	*/
	public function set_children_view(?string $value) : bool {

		$this->children_view = $value;

		return true;
	}//end set_children_view



	/**
	* GET_CHILDREN_VIEW
	* Returns the named rendering view for child elements of this DDO.
	* @return string|null - null when children_view has not been set
	*/
	public function get_children_view() : ?string {

		return $this->children_view ?? null;
	}//end get_children_view



	/**
	* SET_NAME
	* Sets the human-readable name of the tool/element (e.g. 'Export', 'Import CSV').
	* Displayed in the tools panel inspector. Primarily used by tools.
	* @param string|null $value - name string or null to clear
	* @return bool - always true
	*/
	public function set_name(?string $value) : bool {

		$this->name = $value;

		return true;
	}//end set_name



	/**
	* GET_NAME
	* Returns the human-readable name of the tool/element.
	* @return string|null - null when name has not been set
	*/
	public function get_name() : ?string {

		return $this->name ?? null;
	}//end get_name



	/**
	* SET_DESCRIPTION
	* Sets the extended description displayed in the inspector panel for tools.
	* @param string|null $value - description text or null to clear
	* @return bool - always true
	*/
	public function set_description(?string $value) : bool {

		$this->description = $value;

		return true;
	}//end set_description



	/**
	* GET_DESCRIPTION
	* Returns the extended description text for the inspector panel.
	* @return string|null - null when description has not been set
	*/
	public function get_description() : ?string {

		return $this->description ?? null;
	}//end get_description



	/**
	* SET_ICON
	* Sets the icon identifier or path for the tool/button UI representation.
	* @param string|null $value - icon key/path or null to clear
	* @return bool - always true
	*/
	public function set_icon(?string $value) : bool {

		$this->icon = $value;

		return true;
	}//end set_icon



	/**
	* GET_ICON
	* Returns the icon identifier or path for this element.
	* @return string|null - null when icon has not been set
	*/
	public function get_icon() : ?string {

		return $this->icon ?? null;
	}//end get_icon



	/**
	* SET_DEVELOPER
	* Sets the developer attribution string for the tool (informational only).
	* @param string|null $value - developer name/team string or null to clear
	* @return bool - always true
	*/
	public function set_developer(?string $value) : bool {

		$this->developer = $value;

		return true;
	}//end set_developer



	/**
	* GET_DEVELOPER
	* Returns the developer attribution string for this tool.
	* @return string|null - null when developer has not been set
	*/
	public function get_developer() : ?string {

		return $this->developer ?? null;
	}//end get_developer



	/**
	* SET_SHOW_IN_INSPECTOR
	* Sets whether the tool should appear in the inspector panel sidebar.
	* When false the tool exists but is hidden from the UI tool list.
	* @param bool|null $value - true to show, false to hide, null when unspecified
	* @return bool - always true
	*/
	public function set_show_in_inspector(?bool $value) : bool {

		$this->show_in_inspector = $value;

		return true;
	}//end set_show_in_inspector



	/**
	* GET_SHOW_IN_INSPECTOR
	* Returns whether the tool is visible in the inspector panel.
	* @return bool|null - null when show_in_inspector has not been set
	*/
	public function get_show_in_inspector() : ?bool {

		return $this->show_in_inspector ?? null;
	}//end get_show_in_inspector



	/**
	* SET_VALUE_WITH_PARENTS
	* Sets whether resolved values should include ancestor term labels in their
	* display string (used by thesaurus hierarchy components to show the full path).
	* @param bool|null $value - true to include parents, false to show leaf only, null when unspecified
	* @return bool - always true
	*/
	public function set_value_with_parents(?bool $value) : bool {

		$this->value_with_parents = $value;

		return true;
	}//end set_value_with_parents



	/**
	* GET_VALUE_WITH_PARENTS
	* Returns whether ancestor labels should be included in the value display.
	* @return bool|null - null when value_with_parents has not been set
	*/
	public function get_value_with_parents() : ?bool {

		return $this->value_with_parents ?? null;
	}//end get_value_with_parents



	/**
	* SET_SHOW_IN_COMPONENT
	* Sets whether the tool should also appear embedded inside the component UI
	* (as opposed to only in the global tools panel).
	* @param bool|null $value - true to embed in component, false otherwise, null when unspecified
	* @return bool - always true
	*/
	public function set_show_in_component(?bool $value) : bool {

		$this->show_in_component = $value;

		return true;
	}//end set_show_in_component



	/**
	* GET_SHOW_IN_COMPONENT
	* Returns whether the tool should be embedded inside the component UI.
	* @return bool|null - null when show_in_component has not been set
	*/
	public function get_show_in_component() : ?bool {

		return $this->show_in_component ?? null;
	}//end get_show_in_component



	/**
	* SET_CONFIG
	* Sets the tool-specific configuration object. Shape and semantics are
	* defined per tool; no validation is performed at the DDO level.
	* @param object|null $value - configuration object or null to clear
	* @return bool - always true
	*/
	public function set_config(?object $value) : bool {

		$this->config = $value;

		return true;
	}//end set_config



	/**
	* GET_CONFIG
	* Returns the tool-specific configuration object.
	* @return object|null - null when config has not been set
	*/
	public function get_config() : ?object {

		return $this->config ?? null;
	}//end get_config



	/**
	* SET_SORTABLE
	* Sets whether this column/component can be used as a sort key in list views.
	* Used by component DDOs appearing inside a columns_map definition.
	* @param bool|null $value - true when sortable, false when not, null when unspecified
	* @return bool - always true
	*/
	public function set_sortable(?bool $value) : bool {

		$this->sortable = $value;

		return true;
	}//end set_sortable



	/**
	* GET_SORTABLE
	* Returns whether this column/component is sortable in list views.
	* @return bool|null - null when sortable has not been set
	*/
	public function get_sortable() : ?bool {

		return $this->sortable ?? null;
	}//end get_sortable



	/**
	* SET_FIELDS_SEPARATOR
	* Sets the separator string placed between field values when rendering multiple
	* component values inline (e.g. ', '). Used in export and diffusion output.
	* @param string|null $value - separator string or null to clear
	* @return bool - always true
	*/
	public function set_fields_separator(?string $value) : bool {

		$this->fields_separator = $value;

		return true;
	}//end set_fields_separator



	/**
	* GET_FIELDS_SEPARATOR
	* Returns the separator string for inline field values.
	* @return string|null - null when fields_separator has not been set
	*/
	public function get_fields_separator() : ?string {

		return $this->fields_separator ?? null;
	}//end get_fields_separator



	/**
	* SET_RECORDS_SEPARATOR
	* Sets the separator string placed between record blocks in concatenated output
	* (e.g. ' | '). Used alongside $fields_separator in export and diffusion.
	* @param string|null $value - separator string or null to clear
	* @return bool - always true
	*/
	public function set_records_separator(?string $value) : bool {

		$this->records_separator = $value;

		return true;
	}//end set_records_separator



	/**
	* GET_RECORDS_SEPARATOR
	* Returns the separator string for record blocks in concatenated output.
	* @return string|null - null when records_separator has not been set
	*/
	public function get_records_separator() : ?string {

		return $this->records_separator ?? null;
	}//end get_records_separator



	/**
	* SET_AUTOLOAD
	* Sets whether the consumer should load this element's data automatically on
	* initialization without waiting for a user action.
	* @param bool|null $value - true to autoload, false to defer, null when unspecified
	* @return bool - always true
	*/
	public function set_autoload(?bool $value) : bool {

		$this->autoload = $value;

		return true;
	}//end set_autoload



	/**
	* GET_AUTOLOAD
	* Returns whether this element auto-loads its data on initialization.
	* @return bool|null - null when autoload has not been set
	*/
	public function get_autoload() : ?bool {

		return $this->autoload ?? null;
	}//end get_autoload



	/**
	* SET_ROLE
	* Sets the semantic role of this DDO within a tool's DDO_MAP chain
	* (e.g. 'main_component'). Lets a tool locate a specific DDO by role name
	* rather than by position in the array.
	* @param string|null $value - role name string or null to clear
	* @return bool - always true
	*/
	public function set_role(?string $value) : bool {

		$this->role = $value;

		return true;
	}//end set_role



	/**
	* GET_ROLE
	* Returns the semantic role of this DDO within a tool's DDO_MAP chain.
	* @return string|null - null when role has not been set
	*/
	public function get_role() : ?string {

		return $this->role ?? null;
	}//end get_role



	/**
	* SET_SECTION_MAP
	* Sets the scope-to-component mapping that lets tools and search operate on
	* thesaurus or section components uniformly across different section types.
	*
	* The object maps named scope keys (e.g. 'thesaurus') to inner objects where
	* each key is a semantic role ('term', 'parent', 'order', 'model', …) and the
	* value is the concrete tipo for that section. This indirection means a single
	* tool can find "the term component" in any section without hardcoding tipos.
	*
	* Example:
	*   {
	*     "thesaurus": {
	*       "term": "hierarchy25",
	*       "model": "hierarchy27",
	*       "order": "hierarchy48",
	*       "parent": "hierarchy36",
	*       "is_indexable": "hierarchy24",
	*       "is_descriptor": "hierarchy23"
	*     }
	*   }
	*
	* Uses:
	* - Show the "children" option in the search panel
	* - Locate the term component in the thesaurus tree renderer
	* See also: the section_map resolver memory entry for the global scope/term resolver.
	*
	* @param object|null $value - scope map object or null to clear
	* @return bool - always true
	*/
	public function set_section_map(?object $value) : bool {

		$this->section_map = $value;

		return true;
	}//end set_section_map



	/**
	* GET_SECTION_MAP
	* Returns the scope-to-component mapping object for this DDO.
	* @return object|null - null when section_map has not been set
	*/
	public function get_section_map() : ?object {

		return $this->section_map ?? null;
	}//end get_section_map



	/**
	* SET_COLOR
	* Sets the accent color for the section UI (e.g. '#f1f1f1'). Used by the
	* client to differentiate sections visually in the navigation tree.
	* @param string|null $value - CSS color string or null to clear
	* @return bool - always true
	*/
	public function set_color(?string $value) : bool {

		$this->color = $value;

		return true;
	}//end set_color



	/**
	* GET_COLOR
	* Returns the accent color for the section UI.
	* @return string|null - null when color has not been set
	*/
	public function get_color() : ?string {

		return $this->color ?? null;
	}//end get_color



	/**
	* SET_MATRIX_TABLE
	* Sets the PostgreSQL JSONB matrix table name for this section's component data
	* (e.g. 'matrix_list'). Routes queries to the correct physical storage table.
	* @param string|null $value - table name or null to clear
	* @return bool - always true
	*/
	public function set_matrix_table(?string $value) : bool {

		$this->matrix_table = $value;

		return true;
	}//end set_matrix_table



	/**
	* GET_MATRIX_TABLE
	* Returns the JSONB matrix table name for this section.
	* @return string|null - null when matrix_table has not been set
	*/
	public function get_matrix_table() : ?string {

		return $this->matrix_table ?? null;
	}//end get_matrix_table



	/**
	* SET_DATA_FN
	* DEPRECATED — use set_fn() instead.
	* Sets the legacy function name used to retrieve calculation data for this DDO
	* (e.g. 'get_calculation_data'). Preserved for backward compatibility with
	* legacy ontology entries (e.g. mdcat2431).
	* @param string|null $value - function name or null to clear
	* @return bool - always true
	*/
	public function set_data_fn(?string $value) : bool {

		$this->data_fn = $value;

		return true;
	}//end set_data_fn



	/**
	* GET_DATA_FN
	* DEPRECATED — use get_fn() instead.
	* Returns the legacy function name for calculation data retrieval.
	* @return string|null - null when data_fn has not been set
	*/
	public function get_data_fn() : ?string {

		return $this->data_fn ?? null;
	}//end get_data_fn



	/**
	* SET_FN
	* Sets the generic callback function name invoked in the execution context of
	* this DDO (e.g. a custom data-retrieval or rendering hook).
	* Replaces the deprecated $data_fn.
	* @param string|null $value - function name or null to clear
	* @return bool - always true
	*/
	public function set_fn(?string $value) : bool {

		$this->fn = $value;

		return true;
	}//end set_fn



	/**
	* GET_FN
	* Returns the generic callback function name for this DDO's execution context.
	* @return string|null - null when fn has not been set
	*/
	public function get_fn() : ?string {

		return $this->fn ?? null;
	}//end get_fn



	/**
	* SET_DIFFUSION_TIPO
	* Sets the diffusion node tipo that binds this DDO to a specific diffusion
	* configuration/node in the diffusion pipeline.
	* Note: the class header uses the public alias 'diffusion_node_tipo'; the actual
	* stored property is 'diffusion_tipo'.
	* @param string|null $value - diffusion node tipo or null to clear
	* @return bool - always true
	*/
	public function set_diffusion_tipo(?string $value) : bool {

		$this->diffusion_tipo = $value;

		return true;
	}//end set_diffusion_tipo



	/**
	* GET_DIFFUSION_TIPO
	* Returns the diffusion node tipo binding for this DDO.
	* @return string|null - null when diffusion_tipo has not been set
	*/
	public function get_diffusion_tipo() : ?string {

		return $this->diffusion_tipo ?? null;
	}//end get_diffusion_tipo



	/**
	* SET_OPTIONS
	* Sets the generic options container for passing custom variables between DDOs
	* or down to component implementations without polluting named properties.
	* @param object|null $value - options object or null to clear
	* @return bool - always true
	*/
	public function set_options(?object $value) : bool {

		$this->options = $value;

		return true;
	}//end set_options



	/**
	* GET_OPTIONS
	* Returns the generic options container object.
	* @return object|null - null when options has not been set
	*/
	public function get_options() : ?object {

		return $this->options ?? null;
	}//end get_options



	/**
	* SET_PARSER_ARGS
	* Sets arguments forwarded to the diffusion parser when this DDO is processed
	* through the diffusion chain (e.g. rendering templates or RDF mappings).
	* @param object|null $value - parser argument object or null to clear
	* @return bool - always true
	*/
	public function set_parser_args(?object $value) : bool {

		$this->parser_args = $value;

		return true;
	}//end set_parser_args



	/**
	* GET_PARSER_ARGS
	* Returns the diffusion parser arguments object.
	* @return object|null - null when parser_args has not been set
	*/
	public function get_parser_args() : ?object {

		return $this->parser_args ?? null;
	}//end get_parser_args



	/**
	* SET_DATA_SLICE
	* Sets the data slice windowing descriptor for partial data retrieval.
	* Consumers use this to fetch a subset of a component's data array rather than
	* the full set (e.g. first image only).
	* @param object|null $value - object with 'offset' (int) and 'length' (int) properties, or null to clear
	* @return bool - always true
	*/
	public function set_data_slice(?object $value) : bool {

		$this->data_slice = $value;

		return true;
	}//end set_data_slice



	/**
	* GET_DATA_SLICE
	* Returns the data slice windowing descriptor for partial data retrieval,
	* or null when no slice has been configured.
	* @return object|null - object with 'offset' (int) and 'length' (int) properties, or null if not set
	*/
	public function get_data_slice() : ?object {

		return $this->data_slice ?? null;
	}//end get_data_slice



	/**
	* SET_SECTION_FILTER
	* Sets the allowlist of section tipos used by relation_list to restrict which
	* sections can appear as inverse references (e.g. ['oh1', 'oh2']).
	* @param array|null $value - array of section tipo strings or null to clear
	* @return bool - always true
	*/
	public function set_section_filter(?array $value) : bool {

		$this->section_filter = $value;

		return true;
	}//end set_section_filter



	/**
	* GET_SECTION_FILTER
	* Returns the section tipo allowlist for relation_list inverse reference filtering.
	* @return array|null - null when section_filter has not been set
	*/
	public function get_section_filter() : ?array {

		return $this->section_filter ?? null;
	}//end get_section_filter



	/**
	* SET_COMPONENT_FILTER
	* Sets the allowlist of component tipos used by relation_list to restrict inverse
	* references to specific component columns (e.g. ['oh14', 'oh15']).
	* @param array|null $value - array of component tipo strings or null to clear
	* @return bool - always true
	*/
	public function set_component_filter(?array $value) : bool {

		$this->component_filter = $value;

		return true;
	}//end set_component_filter



	/**
	* GET_COMPONENT_FILTER
	* Returns the component tipo allowlist for relation_list inverse reference filtering.
	* @return array|null - null when component_filter has not been set
	*/
	public function get_component_filter() : ?array {

		return $this->component_filter ?? null;
	}//end get_component_filter



	/**
	* HAS_ERRORS
	* Returns true if the constructor or any set_* call has registered an error.
	* Use this as a quick guard before consuming the DDO; then call get_errors()
	* for the full list of messages.
	* @return bool - true when at least one error is present
	*/
	public function has_errors() : bool {

		return !empty($this->errors);
	}//end has_errors



	/**
	* GET_ERRORS
	* Returns all error messages accumulated by the constructor and set_* calls
	* as a flat array of strings. Returns an empty array when there are no errors
	* (safe to iterate without a has_errors() check).
	* @return array - flat string array; empty when no errors have occurred
	*/
	public function get_errors() : array {

		return $this->errors ?? [];
	}//end get_errors



	/**
	* RESOLVE_TYPE_FROM_MODEL
	* Maps the model name to a logical type string from $ar_type_allowed.
	*
	* Called by the constructor after all properties are set. The switch uses
	* prefix tests (strpos === 0) rather than string equality so that the full
	* range of component_ and tool_ model names resolve without enumeration.
	* section::get_ar_grouper_models() is called once per construction to cover
	* all registered grouper models dynamically.
	*
	* Returns null (and logs an error) when the model is empty or unrecognized;
	* in that case the constructor skips set_type() rather than setting an invalid type.
	*
	* @param string|null $model - the model name to classify
	* @return string|null - one of the values in $ar_type_allowed, or null if unrecognized
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
			case $model==='installer' :
				return 'installer';
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



	/**
	* SET METHODS
	* Magic mutator used as a safe fallback for dynamic properties writting.
	*
	* Maps direct property assignments to their corresponding set_* methods if available,
	* otherwise falls back to creating a dynamic property (backward compatibility).
	*
	* @param string $name Property name
	* @param mixed $value Property value
	* @return mixed
	*/
	final public function __set(string $name, $value) {

		$method = 'set_' . $name;
		if (method_exists($this, $method)) {
			return $this->{$method}($value);
		}
		$this->$name = $value;
	}



	/**
	* ISSET METHODS
	* Magic accessor to support isset() and empty() on protected properties.
	*
	* @param string $name Property name
	* @return bool
	*/
	final public function __isset(string $name) : bool {

		return isset($this->$name);
	}



	/**
	* UNSET METHODS
	* Magic accessor to support unset() on protected properties.
	*
	* @param string $name Property name
	* @return void
	*/
	final public function __unset(string $name) : void {

		unset($this->$name);
	}



	/**
	* JSON_SERIALIZE
	* Implements JsonSerializable so that json_encode() produces a compact DDO payload.
	*
	* All object vars (including public dynamic properties added at runtime) are collected
	* and then filtered to exclude null values. This matches the historic behavior of
	* stdClass dynamic properties, which simply did not serialize absent keys, and keeps
	* the JSON payload small for API responses and context-cache storage.
	*
	* @return mixed - associative array of non-null DDO properties
	*/
	public function jsonSerialize() : mixed {

		$vars = get_object_vars($this);

		// filter out null values to keep payload small (as dynamic properties behaved before)
		return array_filter($vars, function($val) {
			return $val !== null;
		});
	}



} //end dd_object
