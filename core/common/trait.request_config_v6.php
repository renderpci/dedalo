<?php declare(strict_types=1);
/**
* TRAIT REQUEST_CONFIG_V6
* V6 request_config parsing strategy for class.common.php.
*
* Implements the modern, ontology-driven approach to building request_config_object
* instances from the JSON array stored at properties->source->request_config.
* This is the preferred strategy introduced in Dédalo v6; the legacy v5 path
* (trait request_config_v5) is kept as a fallback for ontology nodes that have
* not yet been migrated.
*
* Responsibilities:
* - Parse each item of the properties->source->request_config array into a
*   request_config_object (api_engine, type, sqo, show, search, choose, hide).
* - Resolve sqo->section_tipo: validate tipos against the ontology, convert to
*   enriched ddo objects (labels, permissions, buttons).
* - Expand filter_by_list and fixed_filter entries; disable caching when the
*   result depends on live record data.
* - Delegate ddo_map processing (validation, enrichment, self-resolution) to
*   the sibling trait request_config_ddo.
* - Attach external api_config for non-dedalo api_engine entries.
*
* V6 configuration shape (stored in the ontology node's properties):
*   properties->source->request_config = [
*     {
*       "api_engine": "dedalo",
*       "type": "main",
*       "sqo": { "section_tipo": [...], "limit": 10 },
*       "show":   { "ddo_map": [...], "sqo_config": { "operator": "$or" } },
*       "search": { "ddo_map": [...] },
*       "choose": { "ddo_map": [...] },
*       "hide":   { "ddo_map": [...] }
*     }
*   ]
*
* Used by: get_ar_request_config() in class.common.php (via `use request_config_v6`).
* Sibling traits: request_config_utils, request_config_ddo, request_config_v5.
*
* @package Dédalo
* @subpackage Core
*/
trait request_config_v6 {



	/**
	* BUILD_REQUEST_CONFIG_V6
	* Entry point for the V6 parsing strategy.
	*
	* Iterates over the properties->source->request_config array and delegates
	* each item to parse_request_config_item(). Returns an array of fully
	* resolved request_config_object instances ready to be cached and returned
	* by get_ar_request_config().
	*
	* Error contract (applied to both the top-level array and each item):
	* - If the caller's tipo matches the API request source (i.e. this component
	*   is the direct target of the current request), structural errors throw an
	*   Exception so the client receives a clear error response.
	* - Otherwise the bad entry is silently dropped with a collected warning so
	*   one malformed ontology node cannot break an unrelated render.
	*
	* @param object|null $properties - Cloned properties object from the ontology node.
	* @param object $context - {tipo, section_tipo, section_id, mode, model, use_cache}.
	* @param object $pagination - {offset, limit} resolved by resolve_pagination_defaults().
	* @return array - Array of request_config_object instances (may be empty on error).
	* @throws Exception When request_config is structurally invalid and this tipo is
	*                   the direct target of the current API request.
	*/
	protected function build_request_config_v6(?object $properties, object $context, object $pagination) : array {

		// Guard: V6 config must have request_config array
		if (!isset($properties->source->request_config)) {
			return [];
		}

		// Structural validation. Ontology properties are user-edited JSON:
		// a request_config that is not an array of objects is a structural
		// misconfiguration. ERROR CONTRACT: when this element is the direct
		// target of the API request, fail loudly (the exception reaches the
		// client through the API response 'errors' channel); otherwise drop
		// with a collected warning so the context self-explains in debug.
		$raw_request_config = $properties->source->request_config;
		if (!is_array($raw_request_config)) {
			$msg = "Invalid request_config in properties of '{$context->tipo}': expected array, got " . gettype($raw_request_config);
			debug_log(__METHOD__ .' '. $msg, logger::ERROR);
			$requested_source_tipo = dd_core_api::$rqo->source->tipo ?? null;
			if ($requested_source_tipo===$context->tipo) {
				throw new Exception($msg, 1);
			}
			$this->add_request_config_warning('drop', $msg);
			return [];
		}

		$ar_request_query_objects = [];

		// Get API request overrides (limit, offset, filters from client)
		$requested_source = dd_core_api::$rqo->source ?? null;
		$requested_sqo = dd_core_api::$rqo->sqo ?? null;

		// Process each request_config item
		// Multiple items allow different API engines or section sources
		foreach ($raw_request_config as $item_request_config) {

			// Structural validation per item (same error contract as above)
			if (!is_object($item_request_config)) {
				$msg = "Invalid request_config item in properties of '{$context->tipo}': expected object, got " . gettype($item_request_config);
				debug_log(__METHOD__ .' '. $msg, logger::ERROR);
				if (($requested_source->tipo ?? null)===$context->tipo) {
					throw new Exception($msg, 1);
				}
				$this->add_request_config_warning('drop', $msg, $item_request_config);
				continue;
			}

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
	* Parses a single properties->source->request_config item into a request_config_object.
	*
	* Orchestrates the full resolution pipeline for one config entry:
	* 1. Instantiate a request_config_object and populate api_engine, type, sqo.
	* 2. Validate and enrich sqo->section_tipo (ontology check → ddo objects).
	* 3. Apply pagination overrides from the inbound API request (rqo).
	* 4. Parse show, search, choose, and hide sub-configs (ddo_map enrichment).
	* 5. For non-dedalo api_engine entries, attach the external api_config from the
	*    target section's ontology properties.
	*
	* Side-effect: may set $context->use_cache = false when resolve_sqo_section_tipo
	* determines the result depends on live record data (fixed_filter, filter_by_list).
	*
	* @param object $item_request_config - A single element of the request_config array.
	* @param object|null $properties - Full properties object (passed through for context).
	* @param object $context - {tipo, section_tipo, section_id, mode, model, use_cache}.
	* @param object $pagination - {offset, limit}.
	* @param object|null $requested_source - dd_core_api::$rqo->source (may be null).
	* @param object|null $requested_sqo - dd_core_api::$rqo->sqo (may be null).
	* @return request_config_object|null - Null is never actually returned by the current
	*   implementation but is kept in the signature to allow future guard returns.
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
		// Converts section_tipo to ddo objects with permissions.
		// use_cache: false when the sqo resolves record data (fixed_filter,
		// filter_by_list) — propagated to get_ar_request_config, which then
		// skips caching the whole result.
		$use_cache = $this->resolve_sqo_section_tipo(
			$parsed_item,
			$item_request_config,
			$context->section_tipo,
			$context->section_id
		);
		$context->use_cache = ($context->use_cache ?? true) && $use_cache;

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
	* Validates and enriches the sqo->section_tipo list, then resolves any
	* filter_by_list and fixed_filter entries on the same sqo.
	*
	* The raw section_tipo value from the ontology JSON is an array of source
	* descriptors (handled by component_relation_common::get_request_config_section_tipo).
	* Each resolved tipo is validated against the ontology; invalid tipos are
	* skipped with a warning rather than aborting the whole config. The validated
	* list is then converted to enriched ddo objects via build_sqo_section_tipo_ddo,
	* which embeds labels, colors, user permissions, and available buttons.
	*
	* Caching implications:
	* - filter_by_list: values come from live DB queries (list of selectable options).
	*   The result cannot be cached because the underlying data can change without
	*   any invalidation signal.
	* - fixed_filter: the resolved filter depends on section_id (record context).
	*   Each record may yield a different filter, so caching is also disabled.
	* Returns true (use_cache) unless either of the above is present.
	*
	* @param request_config_object $parsed_item - The item being built; sqo is mutated in place.
	* @param object $item_request_config - Raw ontology item (source of filter_by_list/fixed_filter).
	* @param string $section_tipo - The caller's section tipo (fallback when sqo has no section_tipo).
	* @param int|string|null $section_id - Current record id, needed for fixed_filter resolution.
	* @return bool - False when the resolved config must not be stored in the request_config cache.
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
		// IMPORTANT: get_filter_list_data resolves live record data (list of
		// values from the DB) with no invalidation path, so disable caching
		if (isset($item_request_config->sqo->filter_by_list)) {
			$parsed_item->sqo->filter_by_list = component_relation_common::get_filter_list_data($item_request_config->sqo->filter_by_list);
			$use_cache = false;
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
	* Resolves the 'show' sub-config of a request_config item.
	*
	* The show config controls which columns/fields are rendered in list and grid
	* views. It is the only mandatory sub-config; if it is absent or empty a
	* warning is recorded and an empty stdClass is used so downstream code does
	* not have to null-check.
	*
	* ddo_map resolution order:
	* 1. Use show->ddo_map if explicitly defined.
	* 2. Fall back to the result of resolve_get_ddo_map (via show->get_ddo_map
	*    reference or auto-discovery from the section's ontology).
	*
	* After processing the ddo_map, resolve_show_sqo_config is called to
	* determine sqo_config (operator, limit, offset). The method also propagates
	* the resolved limit back to $this->pagination->limit so the JSON controller
	* can use it for response envelope metadata.
	*
	* @param request_config_object $parsed_item - The item being built; show is set in place.
	* @param object $item_request_config - Raw ontology item.
	* @param object $context - {tipo, section_tipo, ar_section_tipo, mode, model}.
	* @param object $pagination - {offset, limit} — limit may be updated as a side-effect.
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
			$this->add_request_config_warning('default', "Missing request_config->show in '{$context->tipo}': empty show applied");
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
	* Fills or creates the show->sqo_config on the item being built.
	*
	* sqo_config governs search-execution behaviour for the show view:
	*   operator   : '$or' (any filter clause matches) or '$and' (all must match).
	*   limit      : maximum records to return per page.
	*   offset     : first-record offset for pagination.
	*   full_count : whether the search layer should also return the total count.
	*
	* Limit resolution follows a deliberate priority chain:
	* - Sections: the user may have changed the per-page size from the UI; that
	*   preference is persisted in the session (section::get_session_sqo). The
	*   session value wins over the ontology-defined limit so the user's choice
	*   is respected across page reloads.
	* - Components: the ontology limit is used, but the inbound API request
	*   (dd_core_api::$rqo->sqo->limit) can override it when the request
	*   explicitly targets this tipo, allowing the client to page through results.
	*
	* When no sqo_config is present in the raw item, a safe default is built via
	* build_sqo_config_default using the resolved pagination values.
	*
	* @param request_config_object $parsed_item - show->sqo_config is set/mutated in place.
	* @param object $context - {tipo, model, mode, …}.
	* @param object $pagination - {offset, limit} from resolve_pagination_defaults().
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
					$parsed_item->sqo->limit = section::get_session_sqo($sqo_id)->limit
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
	* Resolves the optional 'search' sub-config of a request_config item.
	*
	* The search config declares which component fields are presented in the
	* search form and how they map to SQO clauses. It is entirely optional;
	* when absent, the returned request_config_object has search = null and
	* the UI omits search controls.
	*
	* The ddo_map is resolved with the same get_ddo_map / explicit ddo_map
	* fallback as parse_show_config. A default sqo_config is created when
	* the raw item does not define one, ensuring downstream code can always
	* read search->sqo_config without null-checks.
	*
	* @param request_config_object $parsed_item - The item being built; search is set in place.
	* @param object $item_request_config - Raw ontology item.
	* @param object $context - {tipo, section_tipo, ar_section_tipo, mode, model}.
	* @param object $pagination - {offset, limit}.
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
	* Resolves the optional 'choose' sub-config of a request_config item.
	*
	* The choose config defines the columns shown in the autocomplete result
	* dropdown when a user picks a related record. It is independent of the
	* show config so that list columns and selection columns can differ — e.g.
	* selecting a thesaurus term may display the term label and its parent path,
	* while the list view shows additional metadata columns.
	*
	* sqo_config->limit resolution for choose:
	* When the raw item does not specify choose->sqo_config->limit, the method
	* falls back to search->sqo_config->limit, then show->sqo_config->limit,
	* then 25 (the default autocomplete page size). This mirrors the client-side
	* fallback chain in common.js build_rqo_search so that both sides agree on
	* the maximum number of results presented during selection.
	*
	* (!) 0 is a valid explicit limit (means "no results" / disable autocomplete).
	*     The isset+empty check must treat 0 as set; the code uses isset() with an
	*     explicit `=== 0` guard to avoid treating zero as absent.
	*
	* @param request_config_object $parsed_item - The item being built; choose is set in place.
	* @param object $item_request_config - Raw ontology item.
	* @param object $context - {tipo, section_tipo, ar_section_tipo, mode, model}.
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

		// sqo_config limit. Resolve the autocomplete selection limit server-side
		// (single source of truth). Mirrors the client fallback chain in
		// common.js build_rqo_search: choose.sqo_config.limit → (search.sqo_config
		// || show.sqo_config).limit → 25. The client keeps its own fallback for
		// configs without a choose section.
		if (!isset($parsed_item->choose->sqo_config)) {
			$parsed_item->choose->sqo_config = new stdClass();
		}
		if (!isset($parsed_item->choose->sqo_config->limit)) {
			$fallback_sqo_config = $parsed_item->search->sqo_config ?? $parsed_item->show->sqo_config ?? null;
			// 0 is a valid explicit limit (client checks `limit || limit==0`)
			$parsed_item->choose->sqo_config->limit = (isset($fallback_sqo_config->limit) && ($fallback_sqo_config->limit===0 || !empty($fallback_sqo_config->limit)))
				? $fallback_sqo_config->limit
				: 25; // default autocomplete selection size
		}
	}//end parse_choose_config



	/**
	* PARSE_HIDE_CONFIG
	* Resolves the optional 'hide' sub-config of a request_config item.
	*
	* The hide config lists ddo entries that should be excluded from the rendered
	* output even if they would otherwise appear in the show config. Common uses
	* are suppressing internal-only fields, private metadata, or components whose
	* values are already surfaced through a different display mechanism.
	*
	* The ddo_map defaults to an empty array when not specified; process_ddo_map
	* is still called so that enrichment and permission checks are applied
	* consistently with the other sub-configs.
	*
	* @param request_config_object $parsed_item - The item being built; hide is set in place.
	* @param object $item_request_config - Raw ontology item.
	* @param object $context - {tipo, section_tipo, ar_section_tipo, mode, model}.
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
	* Attaches the api_config block for non-dedalo api_engine entries.
	*
	* When api_engine is something other than 'dedalo' (e.g. a third-party
	* adapter like Zenon or an ISAD(G) endpoint), the adapter needs its own
	* connection settings: base URL, authentication tokens, field mappings, etc.
	* That configuration is not embedded in the component's properties; instead
	* it lives in the target section's ontology properties under 'api_config'.
	*
	* The target section is identified from the first ddo in show->ddo_map. If
	* show->ddo_map is empty or the ddo has no section_tipo, this method is a
	* no-op — there is no safe way to guess which section's api_config to use.
	*
	* @param request_config_object $parsed_item - api_config is set in place when found.
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
	* Extracts plain tipo strings from the enriched ddo objects in sqo->section_tipo.
	*
	* After resolve_sqo_section_tipo runs, sqo->section_tipo contains an array of
	* enriched ddo objects (with labels, permissions, buttons). The ddo_map processing
	* helpers (process_ddo_map, build_ddo_context) need a flat array of tipo strings,
	* not ddo objects. This method performs that projection.
	*
	* @param request_config_object $parsed_item - Must have sqo->section_tipo populated by
	*   resolve_sqo_section_tipo before this is called.
	* @return array - Flat array of section tipo strings; empty if sqo has no section_tipo.
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
	* Builds the context object required by process_ddo_map and related helpers.
	*
	* The ddo processing layer (trait request_config_ddo) expects a context that
	* includes both the original section_tipo and the resolved ar_section_tipo list.
	* The two can differ: section_tipo is the caller's own section, while
	* ar_section_tipo comes from sqo->section_tipo and may point to different
	* (possibly multiple) target sections. Both are needed so that 'self' ddos
	* in a ddo_map can be correctly resolved to the appropriate target section.
	*
	* @param object $context - Original context from get_ar_request_config.
	* @param array $ar_section_tipo - Resolved section tipo strings from extract_section_tipos_from_sqo().
	* @return object - New context stdClass with tipo, section_tipo, ar_section_tipo, model, mode.
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
