<?php declare(strict_types=1);
/**
* COMMON
* TRAIT request_config_v6
*
* V6 request_config parsing methods.
* Handles modern ontology-defined request configurations.
*
* RESPONSIBILITIES:
* - Parse V6 style request_config from properties->source->request_config
* - Build request_config_object instances with show/search/choose/hide configs
* - Process SQO (Search Query Object) section_tipos
* - Handle external API configurations
*
* V6 CONFIGURATION STRUCTURE:
* properties->source->request_config = [
*   {
*     "api_engine": "dedalo",
*     "type": "main",
*     "sqo": { "section_tipo": [...], "limit": 10 },
*     "show": { "ddo_map": [...] },
*     "search": { "ddo_map": [...] },
*     "choose": { "ddo_map": [...] },
*     "hide": { "ddo_map": [...] }
*   }
* ]
*
* USED BY: get_ar_request_config() in class.common.php
*/
trait request_config_v6 {



	/**
	* BUILD_REQUEST_CONFIG_V6
	* Parses V6 style request_config from properties
	*
	* FLOW:
	* 1. Check request_config exists in properties
	* 2. Get API request overrides from dd_core_api::$rqo
	* 3. Iterate through each request_config item
	* 4. Parse each item into request_config_object
	* 5. Return array of parsed objects
	*
	* @param object|null $properties Cloned properties object
	* @param object $context {tipo, section_tipo, section_id, mode, model}
	* @param object $pagination {offset, limit}
	* @return array Array of request_config_object instances
	*/
	protected function build_request_config_v6(?object $properties, object $context, object $pagination) : array {

		// Guard: V6 config must have request_config array
		if (!isset($properties->source->request_config)) {
			return [];
		}

		$ar_request_query_objects = [];

		// Get API request overrides (limit, offset, filters from client)
		$requested_source = dd_core_api::$rqo->source ?? null;
		$requested_sqo = dd_core_api::$rqo->sqo ?? null;

		// Process each request_config item
		// Multiple items allow different API engines or section sources
		foreach ($properties->source->request_config as $item_request_config) {

			$parsed_item = $this->parse_request_config_item(
				$item_request_config,
				$properties,
				$context,
				$pagination,
				$requested_source,
				$requested_sqo
			);

			if ($parsed_item !== null) {
				$ar_request_query_objects[] = $parsed_item;
			}
		}

		return $ar_request_query_objects;
	}//end build_request_config_v6



	/**
	* PARSE_REQUEST_CONFIG_ITEM
	* Parses a single request_config item into request_config_object
	*
	* PROCESSING STEPS:
	* 1. Create base request_config_object with api_engine and type
	* 2. Initialize SQO (Search Query Object)
	* 3. Resolve section_tipo (with validation and ddo building)
	* 4. Apply pagination overrides
	* 5. Parse show config (display columns)
	* 6. Parse search config (search fields)
	* 7. Parse choose config (autocomplete selection)
	* 8. Parse hide config (excluded fields)
	* 9. Resolve external API config if non-dedalo engine
	*
	* @param object $item_request_config Single config from properties
	* @param object|null $properties Full properties object
	* @param object $context
	* @param object $pagination
	* @param object|null $requested_source API request source
	* @param object|null $requested_sqo API request SQO
	* @return request_config_object|null
	*/
	protected function parse_request_config_item(
		object $item_request_config,
		?object $properties,
		object $context,
		object $pagination,
		?object $requested_source,
		?object $requested_sqo
	) : ?request_config_object {

		// STEP 1: Create base request_config_object
		$parsed_item = new request_config_object();

		// api_engine: 'dedalo' (internal) or external (zenon, isad, etc.)
		$parsed_item->set_api_engine($item_request_config->api_engine ?? 'dedalo');
		// type: 'main' (primary) or auxiliary configs
		$parsed_item->set_type($item_request_config->type ?? 'main');
		// SQO holds search parameters
		$parsed_item->set_sqo($item_request_config->sqo ?? new stdClass());

		// STEP 2: Resolve section_tipos with validation
		// Converts section_tipo to ddo objects with permissions
		$use_cache = $this->resolve_sqo_section_tipo(
			$parsed_item,
			$item_request_config,
			$context->section_tipo,
			$context->section_id
		);

		// STEP 3: Apply pagination overrides from API request
		$this->resolve_pagination_override(
			$parsed_item,
			$pagination,
			$requested_source,
			$requested_sqo,
			$context->tipo
		);

		// STEP 4-7: Parse configuration sections
		// show: what to display (columns in lists)
		$this->parse_show_config($parsed_item, $item_request_config, $context, $pagination);
		// search: what fields are searchable
		$this->parse_search_config($parsed_item, $item_request_config, $context, $pagination);
		// choose: what to show in autocomplete selection
		$this->parse_choose_config($parsed_item, $item_request_config, $context);
		// hide: what to exclude from display
		$this->parse_hide_config($parsed_item, $item_request_config, $context);

		// STEP 8: Handle external API configurations
		if ($parsed_item->api_engine !== 'dedalo') {
			$this->resolve_external_config($parsed_item);
		}

		return $parsed_item;
	}//end parse_request_config_item



	/**
	* RESOLVE_SQO_SECTION_TIPO
	* Resolves and validates sqo section_tipo
	*
	* FLOW:
	* 1. Extract section_tipos from sqo or use default
	* 2. Validate each tipo (must exist in ontology)
	* 3. Convert to ddo objects with permissions/buttons
	* 4. Handle filter_by_list (pre-filter dropdowns)
	* 5. Handle fixed_filter (context-based filters)
	*
	* FIXED_FILTER SPECIAL CASE:
	* When fixed_filter is used, result depends on section_id.
	* Caching is disabled to prevent incorrect cache hits.
	*
	* @param request_config_object $parsed_item
	* @param object $item_request_config
	* @param string $section_tipo
	* @param int|string|null $section_id
	* @return bool $use_cache False if result shouldn't be cached
	*/
	protected function resolve_sqo_section_tipo(
		request_config_object $parsed_item,
		object $item_request_config,
		string $section_tipo,
		int|string|null $section_id
	) : bool {

		$section_id = (int)$section_id;
		$use_cache = true;

		// Get section_tipos from sqo or fall back to current section_tipo
		$ar_section_tipo = isset($parsed_item->sqo->section_tipo)
			? component_relation_common::get_request_config_section_tipo($parsed_item->sqo->section_tipo, $section_tipo)
			: [$section_tipo];

		// Validate each section_tipo
		$safe_ar_section_tipo = [];
		foreach ($ar_section_tipo as $current_section_tipo) {
			$tipo_is_valid = ontology_utils::check_tipo_is_valid($current_section_tipo);
			if ($tipo_is_valid === false) {
				self::warning_invalid_tipo($current_section_tipo);
				continue;
			}
			$safe_ar_section_tipo[] = $current_section_tipo;
		}
		$ar_section_tipo = $safe_ar_section_tipo;

		// Convert to ddo objects with labels, colors, permissions, buttons
		$parsed_item->sqo->section_tipo = $this->build_sqo_section_tipo_ddo((array)$ar_section_tipo);

		// Handle filter_by_list (dropdown pre-filter)
		if (isset($item_request_config->sqo->filter_by_list)) {
			$parsed_item->sqo->filter_by_list = component_relation_common::get_filter_list_data($item_request_config->sqo->filter_by_list);
		}

		// Handle fixed_filter (context-based filtering)
		// IMPORTANT: fixed_filter results vary by section_id, so disable caching
		if (isset($item_request_config->sqo->fixed_filter)) {
			$parsed_item->sqo->fixed_filter = component_relation_common::get_fixed_filter(
				$item_request_config->sqo->fixed_filter,
				$section_tipo,
				$section_id
			);
			$use_cache = false;
		}

		return $use_cache;
	}//end resolve_sqo_section_tipo



	/**
	* PARSE_SHOW_CONFIG
	* Parses show configuration for request_config
	*
	* The 'show' section defines what columns/fields to display.
	*
	* FLOW:
	* 1. Get show object from config (create empty if missing)
	* 2. Extract section_tipos for ddo context
	* 3. Get ddo_map (direct or via get_ddo_map reference)
	* 4. Process ddo_map (validate, enrich, filter)
	* 5. Build sqo_config with pagination
	* 6. Update instance pagination limit
	*
	* @param request_config_object $parsed_item
	* @param object $item_request_config
	* @param object $context
	* @param object $pagination
	* @return void
	*/
	protected function parse_show_config(
		request_config_object $parsed_item,
		object $item_request_config,
		object $context,
		object $pagination
	) : void {

		// Get show config or create empty object
		$parsed_item->show = $item_request_config->show ?? null;

		if (empty($parsed_item->show)) {
			debug_log(__METHOD__
				. " Error. Expected request_config->show but is empty."
				. ' parsed_item: ' . json_encode($parsed_item, JSON_PRETTY_PRINT)
				, logger::ERROR
			);
			$parsed_item->show = new stdClass();
		}

		// Build context for ddo processing
		$ar_section_tipo = $this->extract_section_tipos_from_sqo($parsed_item);
		$ddo_context = $this->build_ddo_context($context, $ar_section_tipo);

		// Get ddo_map: direct definition or via get_ddo_map reference
		$get_ddo_map = $parsed_item->show->get_ddo_map ?? false;
		$ar_ddo_calculated = $this->resolve_get_ddo_map($ar_section_tipo, $get_ddo_map);

		// Process ddo_map (validate tipos, add labels, check permissions)
		$ar_ddo_map = $parsed_item->show->ddo_map ?? $ar_ddo_calculated;
		$parsed_item->show->ddo_map = $this->process_ddo_map((array)$ar_ddo_map, $ddo_context, 'show');

		// Build sqo_config (search query configuration)
		$this->resolve_show_sqo_config($parsed_item, $context, $pagination);

		// Update instance pagination limit for response
		$this->pagination->limit = $parsed_item->sqo->limit
			?? $parsed_item->show->sqo_config->limit
			?? $this->pagination->limit;
	}//end parse_show_config



	/**
	* RESOLVE_SHOW_SQO_CONFIG
	* Resolves sqo_config for show section
	*
	* SQO_CONFIG contains search behavior settings:
	* - operator: '$or' (any filter matches) or '$and' (all must match)
	* - limit: max records to return
	* - offset: pagination offset
	* - full_count: whether to calculate total matching records
	*
	* SECTION SPECIAL CASE:
	* Sections can have user-specific limits stored in session.
	* This allows users to change list page size preferences.
	*
	* @param request_config_object $parsed_item
	* @param object $context
	* @param object $pagination
	* @return void
	*/
	protected function resolve_show_sqo_config(
		request_config_object $parsed_item,
		object $context,
		object $pagination
	) : void {

		if (isset($parsed_item->show->sqo_config)) {
			// Set default operator if not specified
			if (!isset($parsed_item->show->sqo_config->operator)) {
				$parsed_item->show->sqo_config->operator = '$or';
			}

			// Handle limit with session override for sections
			if (isset($parsed_item->show->sqo_config->limit)) {
				if ($context->model === 'section') {
					// Sections: check session for user preference
					$sqo_id = section::build_sqo_id($context->tipo);
					$parsed_item->sqo->limit = $_SESSION['dedalo']['config']['sqo'][$sqo_id]->limit
						?? $parsed_item->show->sqo_config->limit;
				} else {
					// Components: use config limit with API override
					$parsed_item->sqo->limit = $parsed_item->show->sqo_config->limit;
					if (isset($this->pagination->limit)) {
						$parsed_item->sqo->limit = $this->pagination->limit;
					}
					$requested_sqo = dd_core_api::$rqo->sqo ?? null;
					$requested_source = dd_core_api::$rqo->source ?? null;
					if ($requested_source && $requested_source->tipo === $context->tipo && isset($requested_sqo->limit)) {
						$parsed_item->sqo->limit = $requested_sqo->limit;
					}
				}
			}
		} else {
			// No sqo_config: create default
			$parsed_item->show->sqo_config = $this->build_sqo_config_default(
				$pagination->limit,
				$pagination->offset,
				$context->mode
			);
		}
	}//end resolve_show_sqo_config



	/**
	* PARSE_SEARCH_CONFIG
	* Parses search configuration for request_config
	*
	* The 'search' section defines which fields are searchable.
	* Used by search components to build search forms.
	*
	* EXAMPLE: Autocomplete search on hierarchy terms
	*
	* @param request_config_object $parsed_item
	* @param object $item_request_config
	* @param object $context
	* @param object $pagination
	* @return void
	*/
	protected function parse_search_config(
		request_config_object $parsed_item,
		object $item_request_config,
		object $context,
		object $pagination
	) : void {

		// Search is optional
		if (!isset($item_request_config->search)) {
			return;
		}

		// Initialize search config
		$parsed_item->set_search($item_request_config->search);

		// Build context and process ddo_map
		$ar_section_tipo = $this->extract_section_tipos_from_sqo($parsed_item);
		$ddo_context = $this->build_ddo_context($context, $ar_section_tipo);

		// Get and process ddo_map
		$search_get_ddo_map = $item_request_config->search->get_ddo_map ?? false;
		$ar_search_ddo_calculated = $this->resolve_get_ddo_map($ar_section_tipo, $search_get_ddo_map);

		$ar_search_ddo_map = $parsed_item->search->ddo_map ?? $ar_search_ddo_calculated;
		if (!empty($ar_search_ddo_map)) {
			$parsed_item->search->ddo_map = $this->process_ddo_map((array)$ar_search_ddo_map, $ddo_context, 'search');
		}

		// Create default sqo_config if not defined
		if (!isset($parsed_item->search->sqo_config)) {
			$parsed_item->search->sqo_config = $this->build_sqo_config_default(
				$pagination->limit,
				$pagination->offset,
				$context->mode
			);
		}
	}//end parse_search_config



	/**
	* PARSE_CHOOSE_CONFIG
	* Parses choose configuration for request_config
	*
	* The 'choose' section defines what fields are shown when
	* selecting a record in autocomplete components.
	*
	* EXAMPLE: Selecting a thesaurus term shows term + parents
	*
	* @param request_config_object $parsed_item
	* @param object $item_request_config
	* @param object $context
	* @return void
	*/
	protected function parse_choose_config(
		request_config_object $parsed_item,
		object $item_request_config,
		object $context
	) : void {

		// Choose is optional
		if (!isset($item_request_config->choose)) {
			return;
		}

		// IMPORTANT: Initialize choose before accessing its properties
		$parsed_item->set_choose($item_request_config->choose);

		// Build context and process ddo_map
		$ar_section_tipo = $this->extract_section_tipos_from_sqo($parsed_item);
		$ddo_context = $this->build_ddo_context($context, $ar_section_tipo);

		// Get and process ddo_map
		$choose_get_ddo_map = $item_request_config->choose->get_ddo_map ?? false;
		$ar_choose_ddo_calculated = $this->resolve_get_ddo_map($ar_section_tipo, $choose_get_ddo_map);

		$choose_ddo_map = $item_request_config->choose->ddo_map ?? $ar_choose_ddo_calculated;
		$parsed_item->choose->ddo_map = $this->process_ddo_map((array)$choose_ddo_map, $ddo_context, 'choose');
	}//end parse_choose_config



	/**
	* PARSE_HIDE_CONFIG
	* Parses hide configuration for request_config
	*
	* The 'hide' section defines fields to exclude from display.
	* Useful for hiding internal fields or sensitive data.
	*
	* @param request_config_object $parsed_item
	* @param object $item_request_config
	* @param object $context
	* @return void
	*/
	protected function parse_hide_config(
		request_config_object $parsed_item,
		object $item_request_config,
		object $context
	) : void {

		// Hide is optional
		if (!isset($item_request_config->hide)) {
			return;
		}

		// IMPORTANT: Initialize hide before accessing its properties
		$parsed_item->set_hide($item_request_config->hide);

		// Build context and process ddo_map
		$ar_section_tipo = $this->extract_section_tipos_from_sqo($parsed_item);
		$ddo_context = $this->build_ddo_context($context, $ar_section_tipo);

		// Process ddo_map (default empty array)
		$hide_ddo_map = $item_request_config->hide->ddo_map ?? [];
		$parsed_item->hide->ddo_map = $this->process_ddo_map((array)$hide_ddo_map, $ddo_context, 'hide');
	}//end parse_hide_config



	/**
	* RESOLVE_EXTERNAL_CONFIG
	* Resolves api_config for external API engines
	*
	* External APIs (Zenon, ISAD(G), etc.) need configuration like:
	* - api_url: endpoint URL
	* - authentication: API keys
	* - field mappings: Dédalo to external field names
	*
	* This configuration comes from the target section's properties.
	*
	* @param request_config_object $parsed_item
	* @return void
	*/
	protected function resolve_external_config(request_config_object $parsed_item) : void {

		// Need at least one ddo in show to determine target section
		if (!isset($parsed_item->show->ddo_map[0])) {
			return;
		}

		// Get section_tipo from first ddo
		$engine_section_tipo = $parsed_item->show->ddo_map[0]->section_tipo ?? null;
		if (empty($engine_section_tipo)) {
			return;
		}

		// Get api_config from section properties
		$ontology_node = ontology_node::get_instance($engine_section_tipo);
		$engine_section_properties = $ontology_node->get_properties();

		// Set api_config if defined
		if (is_object($engine_section_properties) && property_exists($engine_section_properties, 'api_config')) {
			$parsed_item->set_api_config($engine_section_properties->api_config);
		}
	}//end resolve_external_config



	/**
	* EXTRACT_SECTION_TIPOS_FROM_SQO
	* Extracts section_tipo values from parsed_item sqo
	*
	* The sqo->section_tipo is an array of ddo objects.
	* This method extracts the tipo strings for context building.
	*
	* @param request_config_object $parsed_item
	* @return array Array of section tipo strings
	*/
	protected function extract_section_tipos_from_sqo(request_config_object $parsed_item) : array {

		$ar_section_tipo = [];

		if (isset($parsed_item->sqo->section_tipo)) {
			foreach ((array)$parsed_item->sqo->section_tipo as $ddo) {
				if (isset($ddo->tipo)) {
					$ar_section_tipo[] = $ddo->tipo;
				}
			}
		}

		return $ar_section_tipo;
	}//end extract_section_tipos_from_sqo



	/**
	* BUILD_DDO_CONTEXT
	* Creates context object for ddo processing
	*
	* DDO processing needs the resolved section_tipos array
	* (not just the original context section_tipo).
	*
	* @param object $context Original context
	* @param array $ar_section_tipo Resolved section tipos
	* @return object Extended context with ar_section_tipo
	*/
	protected function build_ddo_context(object $context, array $ar_section_tipo) : object {

		return (object)[
			'tipo'				=> $context->tipo,
			'section_tipo'		=> $context->section_tipo,
			'ar_section_tipo'	=> $ar_section_tipo,
			'model'				=> $context->model,
			'mode'				=> $context->mode
		];
	}//end build_ddo_context



}//end trait request_config_v6
