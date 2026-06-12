<?php declare(strict_types=1);
/**
* COMMON
* TRAIT request_config_utils
*
* Utility methods for request_config building.
* Handles validation, caching, pagination, and common helper functions.
*
* RESPONSIBILITIES:
* - Section tipo validation (must be section or area model)
* - Cache key generation and management
* - Source properties resolution (handles section_list children)
* - Pagination defaults calculation
* - SQO section_tipo DDO building (with buttons and permissions)
* - SQO configuration defaults
*
* USED BY: get_ar_request_config() in class.common.php
*/
trait request_config_utils {



	/**
	* VALIDATE_SECTION_TIPO_MODEL
	* Checks if section_tipo is valid (section or area model)
	*
	* FLOW:
	* 1. Allow 'self' as special case (resolved later)
	* 2. Get model from ontology
	* 3. Verify model is 'section' or starts with 'area'
	* 4. Log errors for invalid/empty models
	*
	* @param string $section_tipo
	* @return bool True if valid, false otherwise
	*/
	protected function validate_section_tipo_model(string $section_tipo) : bool {

		// 'self' is a placeholder resolved later in ddo processing
		if ($section_tipo==='self') {
			return true;
		}

		// Get model from ontology (e.g., 'section', 'area_thesaurus')
		$section_model = ontology_node::get_model_by_tipo($section_tipo, true);
		if (empty($section_model)) {
			debug_log(__METHOD__
				. " Error. Empty section/area model " . PHP_EOL
				. ' section_tipo: '  . to_string($section_tipo) . PHP_EOL
				. ' section_model: ' . to_string($section_model) . PHP_EOL
				. ' current tipo: '  . to_string($this->get_tipo())
				, logger::ERROR
			);
			$this->add_request_config_warning('drop', "Empty request_config: section_tipo '{$section_tipo}' has no resolvable model");
			return false;
		}

		// Only 'section' and 'area*' models are valid section_tipos
		if ($section_model!=='section' && strpos($section_model, 'area')!==0) {
			debug_log(__METHOD__
				. " Error. Invalid section/area tipo " . PHP_EOL
				. ' section_tipo: '  . to_string($section_tipo) . PHP_EOL
				. ' section_model: ' . to_string($section_model) . PHP_EOL
				. ' current tipo: '  . to_string($this->get_tipo()) . PHP_EOL
				. ' dbt: ' . to_string(debug_backtrace()[1])
				, logger::ERROR
			);
			$this->add_request_config_warning('drop', "Empty request_config: section_tipo '{$section_tipo}' model '{$section_model}' is not a section/area");
			return false;
		}

		return true;
	}//end validate_section_tipo_model



	/**
	* BUILD_REQUEST_CONFIG_CACHE_KEY
	* Creates a unique cache key for resolved request properties
	*
	* The key combines all context variables that affect the result:
	* - tipo: the component/section being configured
	* - section_tipo: the parent section
	* - external: deprecated flag (always false now)
	* - mode: edit/list/tm/etc
	* - section_id: for fixed_filter cases
	*
	* Plus a suffix covering every request-scoped input the build bakes into
	* the result (the cached payload would otherwise be served across calls
	* that differ in these dimensions):
	* - user: permissions and buttons are embedded per user
	*   (build_sqo_section_tipo_ddo, check_ddo_permissions)
	* - instance pagination: resolve_pagination_defaults/override read it
	* - API rqo limit: applied when the rqo source targets this tipo
	* - session sqo limit: applied for sections (resolve_show_sqo_config)
	* - view in tm mode: baked into the dataframe ddo (process_single_ddo)
	* - user preset hash: set by build_request_config when a layout preset
	*   overrides properties (presets are per user and per mode)
	*
	* @param string $tipo
	* @param string $section_tipo
	* @param bool $external
	* @param string $mode
	* @param int $section_id
	* @return string Composite cache key
	*/
	protected function build_request_config_cache_key(
		string $tipo,
		string $section_tipo,
		bool $external,
		string $mode,
		int $section_id
	) : string {

		$key = $tipo .'_'. $section_tipo .'_'. (int)$external .'_'. $mode .'_'. $section_id;

		// user. Permissions/buttons embedded in the payload are user-specific
		$key .= '_u'. (logged_user_id() ?? '');

		// instance pagination. Baked into sqo->limit / sqo_config
		$key .= '_pg'. ($this->pagination->limit ?? 'n') .'-'. ($this->pagination->offset ?? 'n');

		// API rqo limit. Applied when the rqo source targets this tipo
		// (resolve_pagination_override, resolve_show_sqo_config)
		$requested_source	= dd_core_api::$rqo->source ?? null;
		$requested_sqo		= dd_core_api::$rqo->sqo ?? null;
		$rqo_limit = ($requested_source && ($requested_source->tipo ?? null)===$tipo && isset($requested_sqo->limit))
			? $requested_sqo->limit
			: 'n';
		$key .= '_rq'. $rqo_limit;

		// session sqo limit. Sections read it in resolve_show_sqo_config
		if (get_called_class()==='section') {
			$sqo_id			= section::build_sqo_id($tipo);
			$session_sqo	= section::get_session_sqo($sqo_id);
			$session_limit	= $session_sqo->limit ?? 'n';
			$key .= '_ss'. $session_limit;
		}

		// view. Baked into component_dataframe ddos in tm mode
		if ($mode==='tm') {
			$key .= '_v'. ($this->view ?? 'n');
		}

		// preset hash. Separates layout-preset builds from plain builds
		if (!empty($this->request_config_preset_hash)) {
			$key .= '_p'. $this->request_config_preset_hash;
		}

		return $key;
	}//end build_request_config_cache_key



	/**
	* GET_CACHED_REQUEST_CONFIG
	* Retrieves cached request config if available
	*
	* IMMUTABLE CACHE BOUNDARY: a deep clone is returned, never the live
	* cached objects. Callers mutate the result with request-scoped state
	* (the session/rqo sqo overlay in build_request_config; the children
	* ddo_map injection in get_section_elements_context) and a shared
	* reference would poison the pristine base config for every subsequent
	* caller with the same key.
	* unserialize(serialize()) is required (NOT a json round-trip): the
	* arrays contain request_config_object / dd_object / search_query_object
	* instances that must keep their classes.
	*
	* @param string $resolved_key
	* @return array|null Cloned cached config or null if not found
	*/
	protected function get_cached_request_config(string $resolved_key) : ?array {

		$cached = common::$resolved_request_properties_parsed[$resolved_key] ?? null;

		return ($cached !== null)
			? unserialize(serialize($cached))
			: null;
	}//end get_cached_request_config



	/**
	* CACHE_REQUEST_CONFIG
	* Stores resolved request config in static cache
	*
	* A pristine deep-cloned snapshot is stored (see get_cached_request_config):
	* the freshly built array returned to the miss-path caller is the same one
	* that gets mutated downstream, so storing it by reference would poison
	* the cache.
	*
	* @param string $resolved_key
	* @param array $ar_request_query_objects
	* @return void
	*/
	protected function cache_request_config(string $resolved_key, array $ar_request_query_objects) : void {

		// Safety: prevent memory bloat in long-running processes
		common::manage_cache_size(common::$resolved_request_properties_parsed);

		common::$resolved_request_properties_parsed[$resolved_key] = unserialize(serialize($ar_request_query_objects));
	}//end cache_request_config



	/**
	* RESOLVE_SOURCE_PROPERTIES
	* Gets properties based on mode (list uses section_list child if available)
	*
	* FLOW:
	* 1. Get properties from current element
	* 2. In list/tm modes, check for 'section_list' child term
	* 3. If section_list exists, use its properties instead
	* 4. This allows different configs for list vs edit views
	* 5. Clone properties to avoid modifying original
	*
	* EXAMPLE:
	* Section 'numisdata3' may have a child 'section_list' with different
	* ddo_map configuration for displaying columns in list view.
	*
	* @param string $tipo
	* @param string $mode
	* @param string $model
	* @param object|null $properties_override = null
	* 	Used in place of the instance properties (e.g. a user layout preset);
	* 	keeps preset application free of instance-properties mutation
	* @return object|null Cloned properties object
	*/
	protected function resolve_source_properties(string $tipo, string $mode, string $model, ?object $properties_override=null) : ?object {

		// Start with the override (preset) or own properties
		$source_properties = $properties_override ?? $this->get_properties();

		switch ($mode) {
			case 'list_thesaurus':
			case 'list':
			case 'tm':
				// Sections with direct request_config skip section_list lookup
				if ($model==='section' && isset($source_properties->source->request_config)) {
					break;
				}

				// Determine which list model to look for
				$list_model = $mode === 'list_thesaurus'
					? 'section_list_thesaurus'
					: 'section_list';

				// Find section_list child term
				$ar_terms = (array)ontology_node::get_ar_tipo_by_model_and_relation(
					$tipo,
					$list_model,
					'children',
					true
				);

				// Use section_list properties if found
				if (isset($ar_terms[0])) {
					$ontology_node		= ontology_node::get_instance($ar_terms[0]);
					$source_properties	= $ontology_node->get_properties();
				}
				break;

			default:
				// Edit mode uses own properties directly
				break;
		}

		// Deep clone using JSON round-trip to avoid reference issues
		if ($source_properties !== null) {
			return json_decode(json_encode($source_properties));
		}

		return null;
	}//end resolve_source_properties



	/**
	* RESOLVE_PAGINATION_DEFAULTS
	* Calculates default pagination values (offset and limit)
	*
	* PRIORITY (highest to lowest):
	* 1. Instance $this->pagination->limit (set by API request)
	* 2. Properties request_config->sqo->limit
	* 3. Mode/model defaults
	*
	* MODE/MODEL DEFAULTS:
	* - section + edit: limit 1
	* - section + other: limit 10
	* - component + edit: limit 10
	* - component + other: limit 1
	*
	* @param object|null $properties
	* @param string $model
	* @param string $mode
	* @return object {offset: int, limit: int}
	*/
	protected function resolve_pagination_defaults(?object $properties, string $model, string $mode) : object {

		// Offset comes from instance pagination (API request)
		$offset = $this->pagination->offset ?? 0;

		// Limit calculation with fallback chain
		$limit = $this->pagination->limit ?? $this->calculate_default_limit($properties, $model, $mode);

		return (object)[
			'offset' => $offset,
			'limit'  => $limit
		];
	}//end resolve_pagination_defaults



	/**
	* CALCULATE_DEFAULT_LIMIT
	* Determines default limit based on model, mode and properties
	*
	* @param object|null $properties
	* @param string $model
	* @param string $mode
	* @return int|null
	*/
	protected function calculate_default_limit(?object $properties, string $model, string $mode) : ?int {

		$limit = null;

		// Try to get limit from properties request_config
		// (is_array guard: properties are user-edited JSON and may be malformed;
		// the structural error contract is applied later in build_request_config_v6)
		if (isset($properties->source->request_config) && is_array($properties->source->request_config)) {
			$found = array_find($properties->source->request_config, function($el){
				return is_object($el) && isset($el->api_engine) && $el->api_engine==='dedalo';
			});
			if (is_object($found) && isset($found->sqo->limit)) {
				$limit = $found->sqo->limit;
			}
		}

		// Fall back to mode/model defaults
		if (empty($limit)) {
			if ($mode === 'edit') {
				// Edit mode: sections get 1 record, components get 10
				$limit = ($model === 'section') ? 1 : 10;
			} else {
				// Non-edit mode: sections get 10 records, components get 1
				$limit = ($model === 'section') ? 10 : 1;
			}
		}

		return $limit;
	}//end calculate_default_limit



	/**
	* BUILD_SQO_SECTION_TIPO_DDO
	* Builds dd_object instances for each section_tipo in the SQO
	*
	* Each section_tipo becomes a rich ddo object with:
	* - tipo: the section identifier
	* - label: human-readable name
	* - color: for UI display
	* - permissions: user access level (0-3)
	* - buttons: button_new and button_delete if user has permissions
	* - matrix_table: for determining editability
	*
	* @param array $ar_section_tipo Array of section tipo strings
	* @return array Array of dd_object instances
	*/
	protected function build_sqo_section_tipo_ddo(array $ar_section_tipo) : array {

		return array_map(function($current_section_tipo){
			$ddo = new dd_object();
				$ddo->set_tipo($current_section_tipo);
				$ddo->set_label(ontology_node::get_term_by_tipo($current_section_tipo, DEDALO_APPLICATION_LANG, true, true));
				$ddo->set_color(ontology_node::get_color($current_section_tipo));
				$ddo->set_permissions(common::get_permissions($current_section_tipo, $current_section_tipo));

			// Add action buttons if user has edit permissions (>1)
			$buttons = $this->build_section_buttons($current_section_tipo);
			$ddo->set_buttons($buttons);

			// Matrix table determines if section is editable or private
			$ddo->set_matrix_table(common::get_matrix_table_from_tipo($current_section_tipo));

			return $ddo;
		}, $ar_section_tipo);
	}//end build_sqo_section_tipo_ddo



	/**
	* BUILD_SECTION_BUTTONS
	* Gets button_new and button_delete for a section
	*
	* Buttons are only added if:
	* 1. User has edit permissions (>1) on the section
	* 2. The button exists in the ontology
	*
	* @param string $section_tipo
	* @return array Array of button objects with model and permissions
	*/
	protected function build_section_buttons(string $section_tipo) : array {

		$buttons = [];
		$permissions = common::get_permissions($section_tipo, $section_tipo);

		// Only users with edit permissions see buttons
		if ($permissions <= 1) {
			return $buttons;
		}

		// Find button_new in section children
		$ar_button_new = section::get_ar_children_tipo_by_model_name_in_section(
			$section_tipo,
			['button_new'],
			true,		// from_cache
			true,		// resolve_virtual
			false,		// recursive
			true,		// search_exact
			false		// ar_tipo_exclude_elements
		);
		if (isset($ar_button_new[0])) {
			$buttons[] = (object)[
				'model'			=> 'button_new',
				'permissions'	=> common::get_permissions($section_tipo, $ar_button_new[0])
			];
		}

		// Find button_delete in section children
		$ar_button_delete = section::get_ar_children_tipo_by_model_name_in_section(
			$section_tipo,
			['button_delete'],
			true,		// from_cache
			true,		// resolve_virtual
			false,		// recursive
			true,		// search_exact
			false		// ar_tipo_exclude_elements
		);
		if (isset($ar_button_delete[0])) {
			$buttons[] = (object)[
				'model'			=> 'button_delete',
				'permissions'	=> common::get_permissions($section_tipo, $ar_button_delete[0])
			];
		}

		return $buttons;
	}//end build_section_buttons



	/**
	* SYNC_PAGINATION_FROM_CONFIG
	* Replicates, on the cache-hit path, the instance pagination side effect
	* that the build (miss) path performs: parse_show_config (v6) and
	* build_request_config_v5 both update $this->pagination->limit while
	* building. Without this, instance pagination — consumed downstream by
	* the *_json.php response controllers — would depend on whether the
	* config came from cache or from a fresh build.
	*
	* Mirrors the per-item assignment order of the miss path (last item wins,
	* each falling back to the current limit).
	*
	* @param array $ar_request_config
	* @return void
	*/
	protected function sync_pagination_from_config(array $ar_request_config) : void {

		// Some instances don't have pagination (mirrors trait.request_config_v5 guard)
		if (!isset($this->pagination)) {
			return;
		}

		foreach ($ar_request_config as $item) {
			if (!is_object($item)) {
				continue;
			}
			$this->pagination->limit = $item->sqo->limit
				?? $item->show->sqo_config->limit
				?? $this->pagination->limit;
		}
	}//end sync_pagination_from_config



	/**
	* RESOLVE_PAGINATION_OVERRIDE
	* Applies pagination overrides from various sources
	*
	* PRIORITY (highest to lowest):
	* 1. API request via dd_core_api::$rqo->sqo->limit
	* 2. Instance $this->pagination->limit
	* 3. Calculated default limit (already in parsed_item->sqo->limit)
	*
	* @param object $parsed_item
	* @param object $pagination
	* @param object|null $requested_source
	* @param object|null $requested_sqo
	* @param string $tipo
	* @return void
	*/
	protected function resolve_pagination_override(
		object $parsed_item,
		object $pagination,
		?object $requested_source,
		?object $requested_sqo,
		string $tipo
	) : void {

		// Set default limit if not already set
		if (!isset($parsed_item->sqo->limit)) {
			$parsed_item->sqo->limit = $pagination->limit;
		}

		// Override with instance pagination (from API request)
		if (isset($this->pagination->limit)) {
			$parsed_item->sqo->limit = $this->pagination->limit;
		}

		// Override with explicit API request limit if tipo matches
		if ($requested_source && $requested_source->tipo===$tipo && isset($requested_sqo->limit)) {
			$parsed_item->sqo->limit = $requested_sqo->limit;
		}
	}//end resolve_pagination_override



	/**
	* BUILD_SQO_CONFIG_DEFAULT
	* Creates default sqo_config object
	*
	* Used when sqo_config is not defined in properties.
	* Provides sensible defaults for search query configuration.
	*
	* @param int $limit
	* @param int $offset
	* @param string $mode
	* @return object Default sqo_config
	*/
	protected function build_sqo_config_default(int $limit, int $offset, string $mode) : object {

		$sqo_config = new stdClass();
			$sqo_config->full_count	= false;		// Don't calculate total count by default
			$sqo_config->limit		= $limit;
			$sqo_config->offset		= $offset;
			$sqo_config->mode		= $mode;
			$sqo_config->operator	= '$or';		// Default OR operator for filters

		return $sqo_config;
	}//end build_sqo_config_default



}//end trait request_config_utils
