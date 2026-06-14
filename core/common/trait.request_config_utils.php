<?php declare(strict_types=1);
/**
* TRAIT REQUEST_CONFIG_UTILS
* From class common
* Shared utility methods for all request_config build paths.
*
* This trait is mixed into class common and carries the cross-cutting helpers
* that both the V6 (properties->source->request_config) and V5 (ontology
* relation-node) build strategies rely on. It is never used on its own.
*
* Responsibilities:
* - Section tipo validation: guards that a given tipo resolves to a 'section'
*   or 'area*' ontology model before it is used in a request config.
* - Cache key generation and read/write: computes a composite cache key that
*   encodes every dimension that can produce a different config result (tipo,
*   mode, user, pagination, API rqo, session sqo, TM view, preset hash) and
*   manages the common::$resolved_request_properties_parsed static store.
* - Source-properties resolution: selects the correct ontology properties object
*   for the build (own properties, a user-layout preset, or the section_list /
*   section_list_thesaurus child node for list/tm modes).
* - Pagination defaults: computes the initial {offset, limit} pair from the
*   instance pagination, the ontology properties, and mode/model fallbacks.
* - SQO section_tipo DDO building: constructs the rich dd_object array that
*   the SQO section_tipo field carries (label, color, permissions, buttons).
* - SQO config defaults: produces the base sqo_config stdClass when no explicit
*   sqo_config is present in the ontology properties.
*
* Host class: common (abstract).
* Sibling traits also used by common: request_config_ddo, request_config_v6,
* request_config_v5.
*
* @package Dédalo
* @subpackage Core
*/
trait request_config_utils {



	/**
	* VALIDATE_SECTION_TIPO_MODEL
	* Guards that $section_tipo refers to a section or area model before use in
	* a request config build. Logs and records a 'drop' config warning on failure.
	*
	* Called early in the build pipeline to prevent downstream errors that would
	* occur if a component tipo or an unknown node were passed where a section is
	* expected. The warning is consumed by the client to decide whether to drop
	* the whole config item silently.
	*
	* The literal string 'self' is accepted without an ontology lookup: it is a
	* deferred placeholder that the DDO processing stage later resolves to the
	* actual containing section tipo.
	*
	* @param string $section_tipo - Ontology tipo to validate (e.g. 'dd1' or 'self')
	* @return bool - True if valid (model is 'section' or starts with 'area'), false otherwise
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
	* Constructs the composite cache key used to store and retrieve a resolved
	* request config in common::$resolved_request_properties_parsed.
	*
	* The key must encode every input dimension that can produce a different
	* config result. Dimensions fall into two groups:
	*
	* Structural (same for all callers in this request cycle):
	* - $tipo         : the component or section being configured
	* - $section_tipo : the owning section context
	* - $external     : deprecated flag (always false in v7; kept for key stability)
	* - $mode         : edit / list / tm / list_thesaurus / …
	* - $section_id   : for fixed_filter cases where the config differs per record
	*
	* Request-scoped (vary per caller even for the same structural dimensions):
	* - user          : permissions and buttons are embedded per user
	*                   (build_sqo_section_tipo_ddo, check_ddo_permissions)
	* - instance pagination : resolve_pagination_defaults / override read it
	* - API rqo limit : applied when the rqo source targets this tipo
	* - session sqo limit  : applied for sections (resolve_show_sqo_config)
	* - view (tm mode only): baked into dataframe ddos by process_single_ddo
	* - preset hash   : set by build_request_config when a user layout preset
	*                   overrides the base properties (presets are per-user per-mode)
	*
	* @param string $tipo         - Component or section tipo being configured
	* @param string $section_tipo - Parent section tipo providing the context
	* @param bool   $external     - Deprecated external flag (always false in v7)
	* @param string $mode         - Display mode ('edit', 'list', 'tm', …)
	* @param int    $section_id   - Record id; 0 when not record-specific
	* @return string - Composite cache key string
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
	* Returns a deep clone of the cached request config for the given key,
	* or null if no entry exists.
	*
	* (!) IMMUTABLE CACHE BOUNDARY — never return the cached object directly.
	* Callers mutate the result with request-scoped state: build_request_config
	* overlays session/rqo sqo values, and get_section_elements_context injects
	* children ddo_map entries. Sharing a reference would corrupt the pristine
	* base config for every subsequent caller using the same cache key.
	*
	* unserialize(serialize()) is the required deep-clone technique here — a
	* JSON round-trip would destroy class information, because the payload
	* contains request_config_object, dd_object, and search_query_object
	* instances that must keep their PHP classes intact.
	*
	* @param string $resolved_key - Cache key produced by build_request_config_cache_key()
	* @return array|null - Deep-cloned config array, or null on cache miss
	*/
	protected function get_cached_request_config(string $resolved_key) : ?array {

		$cached = common::$resolved_request_properties_parsed[$resolved_key] ?? null;

		return ($cached !== null)
			? unserialize(serialize($cached))
			: null;
	}//end get_cached_request_config



	/**
	* CACHE_REQUEST_CONFIG
	* Stores a deep-cloned snapshot of the resolved request config in the static
	* per-request cache (common::$resolved_request_properties_parsed).
	*
	* (!) A deep clone is stored, not the live array. The freshly built array
	* returned to the miss-path caller will be mutated downstream (session sqo
	* overlay, ddo_map injection); storing a reference would corrupt the cache
	* entry used by all subsequent hits for the same key.
	*
	* Calls manage_cache_size() first to prevent unbounded memory growth in
	* long-running persistent-worker processes.
	*
	* @param string $resolved_key             - Key from build_request_config_cache_key()
	* @param array  $ar_request_query_objects - Freshly built config array to cache
	* @return void
	*/
	protected function cache_request_config(string $resolved_key, array $ar_request_query_objects) : void {

		// Safety: prevent memory bloat in long-running processes
		common::manage_cache_size(common::$resolved_request_properties_parsed);

		common::$resolved_request_properties_parsed[$resolved_key] = unserialize(serialize($ar_request_query_objects));
	}//end cache_request_config



	/**
	* RESOLVE_SOURCE_PROPERTIES
	* Selects and returns the properties object that the request_config build
	* should read from, applying the section_list child-node substitution for
	* list and tm modes, then returning a JSON deep-clone so the build can
	* mutate the result freely.
	*
	* Selection order (first match wins):
	* 1. $properties_override — a user layout preset injected by build_request_config;
	*    avoids mutating the instance's own properties when a preset is active.
	* 2. $this->get_properties() — the instance's own ontology properties object.
	*
	* For 'list', 'list_thesaurus', and 'tm' modes the method then looks for a
	* child term of the given $tipo that carries the corresponding list model
	* ('section_list' or 'section_list_thesaurus'). If found, the child node's
	* properties replace the selection above. This lets ontology designers define
	* separate column configurations for list views without touching the edit-mode
	* node, e.g. a 'numisdata3' section may expose different ddos in list mode via
	* its 'section_list' child.
	*
	* The JSON round-trip clone (json_decode(json_encode())) is intentional here:
	* the properties object contains only plain data (no class instances), so a
	* JSON round-trip is safe and cheap. It prevents the build from mutating the
	* shared ontology properties cached in ontology_node.
	*
	* @param string      $tipo                - Ontology tipo whose properties to resolve
	* @param string      $mode                - Display mode ('edit', 'list', 'tm', 'list_thesaurus', …)
	* @param string      $model               - Ontology model of $tipo (e.g. 'section', 'area_thesaurus')
	* @param object|null $properties_override = null - Preset properties to use instead of instance properties
	* @return object|null - Cloned properties object, or null if none are available
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
	* Computes the initial {offset, limit} pagination object for the request
	* config build from the available sources in priority order.
	*
	* Priority (highest to lowest):
	* 1. $this->pagination->limit set by the incoming API request (rqo). When the
	*    client sends an explicit limit this always wins.
	* 2. properties->source->request_config[api_engine=dedalo]->sqo->limit — the
	*    ontology-configured default for this node.
	* 3. Mode/model heuristic fallback via calculate_default_limit():
	*    - section  + edit  → 1   (one record at a time in the editor)
	*    - section  + other → 10  (list views show ten by default)
	*    - component + edit  → 10
	*    - component + other → 1
	*
	* Offset always comes from $this->pagination->offset (0 when absent).
	*
	* @param object|null $properties - Resolved source properties (may be null for v5 paths)
	* @param string      $model      - Ontology model of the element ('section', 'area_*', or component model)
	* @param string      $mode       - Display mode ('edit', 'list', 'tm', …)
	* @return object - Plain object with integer properties {offset, limit}
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
	* Determines the pagination limit to use when no API rqo limit is present.
	*
	* Checks the properties->source->request_config array first: if an entry with
	* api_engine 'dedalo' carries an sqo->limit value, that value is used as the
	* ontology-defined default for this node. Falls back to mode/model heuristics
	* when the properties are absent or do not define a limit.
	*
	* The is_array() guard on properties->source->request_config is deliberate:
	* properties come from user-edited ontology JSON and may be malformed; the
	* structural error contract is applied later in build_request_config_v6 where
	* a full validation pass runs.
	*
	* @param object|null $properties - Resolved source properties object
	* @param string      $model      - Ontology model ('section', 'area_*', or component model)
	* @param string      $mode       - Display mode ('edit', 'list', 'tm', …)
	* @return int|null - Limit integer, or null if no default could be determined (callers treat null as 'use heuristic')
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
	* Maps an array of section tipo strings to an array of rich dd_object instances
	* suitable for embedding in an SQO's section_tipo field.
	*
	* Each dd_object in the result carries:
	* - tipo        : the section identifier (e.g. 'dd1')
	* - label       : human-readable term in the application language
	* - color       : UI colour string from the ontology node
	* - permissions : the logged-in user's access level on this section (0–3)
	* - buttons     : button_new and/or button_delete objects (only when user
	*                 has edit permissions; see build_section_buttons())
	* - matrix_table: the DB matrix table name, used by the client to determine
	*                 whether the section is editable or restricted to a private table
	*
	* Called during the request_config build to enrich the SQO so the client
	* does not need separate ontology lookups for section metadata.
	*
	* @param array $ar_section_tipo - Ordered list of section tipo strings to enrich
	* @return array - Array of dd_object instances, one per entry in $ar_section_tipo
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
	* Discovers and returns the button_new and button_delete action descriptors
	* for a section, respecting the current user's permissions.
	*
	* Returns an empty array immediately when the user's permission level on
	* $section_tipo is 0 or 1 (read-only). For permission level 2 or 3, the
	* method searches the section's direct children for button_new and
	* button_delete nodes via section::get_ar_children_tipo_by_model_name_in_section().
	* Only buttons that exist in the ontology are included; missing buttons are
	* silently skipped.
	*
	* Each returned descriptor is a plain object:
	*   { model: string, permissions: int }
	* where `model` is 'button_new' or 'button_delete' and `permissions` is the
	* user's access level on the specific button tipo (may differ from the section
	* level when button-level ACL is configured in the ontology).
	*
	* @param string $section_tipo - Section tipo whose buttons to discover
	* @return array - Array of button descriptor objects (may be empty)
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
	* Replicates, on the cache-hit path, the $this->pagination->limit side
	* effect that the build (cache-miss) path produces as a by-product of
	* parse_show_config (v6) and build_request_config_v5.
	*
	* Without this call, $this->pagination->limit would reflect the API rqo
	* value (or the initial default) on a cache hit, but the limit baked into
	* the config on a cache miss. Response controllers in *_json.php read
	* $this->pagination->limit directly, so the two paths must produce the
	* same instance state regardless of whether the config was built fresh or
	* served from cache.
	*
	* Mirrors the miss-path assignment order: iterates items in array order,
	* last item wins, each falling back to the current limit when the config
	* item does not carry one.
	*
	* Silently returns when $this->pagination is not set (not all host classes
	* carry pagination; mirrors the guard in trait.request_config_v5).
	*
	* @param array $ar_request_config - The cached config array just returned by get_cached_request_config()
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
	* Applies per-item pagination limit overrides to a parsed request_config
	* item's sqo object, in increasing priority order so the highest-priority
	* source always wins.
	*
	* Priority (lowest to highest — each level overwrites the previous):
	* 1. Calculated default (already stored in $parsed_item->sqo->limit by the
	*    build path; this method sets it only if missing).
	* 2. $this->pagination->limit — the instance-level limit from the incoming
	*    API request, applied to every item regardless of tipo.
	* 3. dd_core_api::$rqo->sqo->limit — the explicit sqo limit sent by the
	*    client for the specific source tipo, applied only when $requested_source
	*    matches $tipo.
	*
	* Mutates $parsed_item->sqo->limit in place; callers read this field after
	* this method returns.
	*
	* @param object      $parsed_item      - The request_config_object item whose sqo->limit to set
	* @param object      $pagination       - Resolved defaults from resolve_pagination_defaults()
	* @param object|null $requested_source - dd_core_api::$rqo->source (null when rqo has no source)
	* @param object|null $requested_sqo    - dd_core_api::$rqo->sqo (null when rqo has no sqo)
	* @param string      $tipo             - The tipo this parsed_item applies to
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
	* Constructs the default sqo_config stdClass used when the ontology
	* properties do not define an explicit sqo_config block.
	*
	* The returned object is used by both the V5 legacy path
	* (build_request_config_v5) and the V6 path when no sqo_config is present
	* in properties->source->request_config. It seeds the show->sqo_config field
	* of the resulting request_config_object.
	*
	* Default values:
	* - full_count : false — total count query is not executed by default
	*   (expensive; enabled explicitly when needed by the client or ontology)
	* - limit      : $limit (from resolve_pagination_defaults())
	* - offset     : $offset (from resolve_pagination_defaults())
	* - mode       : $mode (echoed through so the client knows the build context)
	* - operator   : '$or' — filter clauses are combined with OR by default
	*
	* @param int    $limit  - Record limit for the SQO
	* @param int    $offset - Record offset for the SQO
	* @param string $mode   - Display mode string echoed into sqo_config->mode
	* @return object - Populated stdClass sqo_config object
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
