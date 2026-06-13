<?php declare(strict_types=1);
/**
* COMMON
* TRAIT request_config_ddo
*
* DDO (Data Description Object) map processing methods for request_config building.
* Handles validation, enrichment, and transformation of ddo_map arrays.
*
* RESPONSIBILITIES:
* - Process ddo_map arrays for show/search/choose/hide configurations
* - Validate ddo tipos (check valid and active)
* - Enrich ddo objects with labels, models, permissions
* - Resolve 'self' references to actual section_tipos
* - Handle fields_map for external API components
* - Check user permissions for ddo access
*
* DDO MAP TYPES:
* - show: columns to display in lists
* - search: fields available for searching
* - choose: fields shown in autocomplete selection
* - hide: fields to exclude from display
*
* USED BY: request_config_v6 trait
*/
trait request_config_ddo {



	/**
	* PROCESS_DDO_MAP
	* Processes an array of ddo objects with validation and enrichment
	*
	* FLOW:
	* 1. Iterate through each ddo in the map
	* 2. Validate and enrich each ddo
	* 3. Filter out invalid/inaccessible ddo items
	* 4. Return processed array
	*
	* @param array $ar_ddo_map Array of ddo objects to process
	* @param object $context {tipo, section_tipo, ar_section_tipo, model, mode}
	* @param string $map_type - 'show'|'search'|'choose'|'hide'
	* @return array Processed ddo array
	*/
	protected function process_ddo_map(array $ar_ddo_map, object $context, string $map_type='show') : array {

		$final_ddo_map = [];

		foreach ($ar_ddo_map as $current_ddo) {

			// Process and validate each ddo
			$processed = $this->process_single_ddo($current_ddo, $context, $map_type);
			if ($processed !== null) {
				$final_ddo_map[] = $processed;
			}
		}

		return $final_ddo_map;
	}//end process_ddo_map



	/**
	* PROCESS_SINGLE_DDO
	* Validates and enriches a single ddo object
	*
	* PROCESSING STEPS:
	* 1. Check tipo exists
	* 2. Validate tipo is valid and active (TLD installed)
	* 3. Get model from ontology
	* 4. Filter groupers in list mode
	* 5. Add label if missing
	* 6. Resolve 'self' references in section_tipo and parent
	* 7. Set mode if not defined
	* 8. Handle special cases (fields_map, dataframe in tm mode)
	* 9. Check permissions
	*
	* @param object $current_ddo
	* @param object $context
	* @param string $map_type
	* @return object|null Processed ddo or null if invalid
	*/
	protected function process_single_ddo(object $current_ddo, object $context, string $map_type) : ?object {

		// STEP 1: Verify tipo exists
		if (!isset($current_ddo->tipo) || empty($current_ddo->tipo)) {
			debug_log(__METHOD__
				.' ERROR. Ignored ddo: missing tipo'
				.' context tipo: ' . to_string($context->tipo) . PHP_EOL
				.' current_ddo: ' . to_string($current_ddo)
				, logger::ERROR
			);
			$this->add_request_config_warning('drop', "Ignored {$map_type} ddo: missing tipo", $current_ddo);
			return null;
		}

		// STEP 2: Validate tipo is valid and TLD is active
		if (!$this->validate_ddo_tipo($current_ddo->tipo, $context, $map_type)) {
			return null;
		}

		// STEP 3: Always calculate model to prevent errors
		$current_ddo->model = ontology_node::get_model_by_tipo($current_ddo->tipo, true);

		// STEP 4: Filter out section_group in list mode (not displayed)
		if ($map_type==='show' && $context->mode==='list' && strpos($current_ddo->model, 'section_group')!==false) {
			return null;
		}

		// STEP 5: Add label if not present
		$this->enrich_ddo_label($current_ddo);

		// STEP 6: Resolve 'self' references to actual values
		$this->resolve_ddo_self_references($current_ddo, $context);

		// STEP 7: Set mode based on context
		$this->resolve_ddo_mode($current_ddo, $context);

		// STEP 8: Mark as fixed_mode if mode was explicitly set in properties
		$this->resolve_ddo_fixed_mode($current_ddo);

		// STEP 9: Handle fields_map for external API components (e.g., Zenon)
		if ($map_type==='show' && isset($current_ddo->fields_map) && $current_ddo->fields_map===true) {
			$this->resolve_ddo_fields_map($current_ddo);
		}

		// STEP 10: Special handling for component_dataframe in tm mode
		if ($map_type==='show' && $context->mode==='tm' && $current_ddo->model==='component_dataframe') {
			$current_ddo->view = $this->view;
		}

		// STEP 11: Check user permissions for sections
		if ($context->model==='section') {
			if (!$this->check_ddo_permissions($current_ddo)) {
				$this->add_request_config_warning('drop', "Removed {$map_type} ddo '{$current_ddo->tipo}': user has no permissions");
				return null;
			}
		}

		return $current_ddo;
	}//end process_single_ddo



	/**
	* VALIDATE_DDO_TIPO
	* Validates ddo tipo is valid and active in ontology
	*
	* CHECKS:
	* 1. Tipo can be resolved to a model (ontology_utils::check_tipo_is_valid)
	* 2. TLD (Top Level Domain) is installed (ontology_utils::check_active_tld)
	*
	* Invalid tipos or inactive TLDs result in the ddo being filtered out.
	*
	* @param string $tipo
	* @param object $context
	* @param string $map_type
	* @return bool True if valid, false otherwise
	*/
	protected function validate_ddo_tipo(string $tipo, object $context, string $map_type) : bool {

		// Check tipo can be resolved to a model
		$tipo_is_valid = ontology_utils::check_tipo_is_valid($tipo);
		if ($tipo_is_valid === false) {
			debug_log(__METHOD__
				.' WARNING. Ignored ddo: invalid tipo'
				.' tipo: ' . to_string($tipo) . PHP_EOL
				.' context tipo: ' . to_string($context->tipo)
				, logger::WARNING
			);
			$this->add_request_config_warning('drop', "Ignored {$map_type} ddo '{$tipo}': invalid tipo (unresolvable model)");
			return false;
		}

		// Check TLD is installed (e.g., 'numisdata', 'rsc')
		$is_active = ontology_utils::check_active_tld($tipo);
		if ($is_active === false) {
			debug_log(__METHOD__
				. " Removed ddo from {$map_type} definition: tld not installed"
				. ' tipo: ' . to_string($tipo)
				, logger::WARNING
			);
			$this->add_request_config_warning('drop', "Removed {$map_type} ddo '{$tipo}': tld not installed");
			return false;
		}

		return true;
	}//end validate_ddo_tipo



	/**
	* ENRICH_DDO_LABEL
	* Adds label to ddo if not present
	*
	* Labels are retrieved from ontology in the application language.
	* Used for display in UI (e.g., autocomplete shows "es1: Spain")
	*
	* @param object $ddo
	* @return void
	*/
	protected function enrich_ddo_label(object $ddo) : void {

		if (!isset($ddo->label)) {
			$ddo->label = ontology_node::get_term_by_tipo($ddo->tipo, DEDALO_APPLICATION_LANG, true, true);
		}
	}//end enrich_ddo_label



	/**
	* RESOLVE_DDO_SELF_REFERENCES
	* Resolves 'self' values in section_tipo and parent
	*
	* 'self' is a placeholder in ontology properties that gets replaced:
	* - section_tipo='self' → current section_tipo or ar_section_tipo array
	* - parent='self' → current tipo (the calling element)
	*
	* Special case for component_dataframe: uses single section_tipo
	* instead of array because it targets its own section.
	*
	* @param object $ddo
	* @param object $context
	* @return void
	*/
	protected function resolve_ddo_self_references(object $ddo, object $context) : void {

		// Resolve section_tipo 'self' reference
		if (isset($ddo->section_tipo) && $ddo->section_tipo==='self') {
			// component_dataframe uses single section_tipo, others use array
			$ddo->section_tipo = ($ddo->model==='component_dataframe')
				? $context->section_tipo
				: $context->ar_section_tipo;
		}

		// Resolve parent 'self' reference
		if (isset($ddo->parent) && $ddo->parent==='self') {
			$ddo->parent = $context->tipo;
		}
	}//end resolve_ddo_self_references



	/**
	* RESOLVE_DDO_MODE
	* Sets mode based on context if not already defined
	*
	* MODE RULES:
	* - If mode is 'tm' (time machine), inherit tm mode
	* - If caller is not a section, use 'list' mode (for portal columns)
	* - Otherwise inherit caller's mode
	*
	* This preserves list column configuration when portals are rendered.
	*
	* @param object $ddo
	* @param object $context
	* @return void
	*/
	protected function resolve_ddo_mode(object $ddo, object $context) : void {

		if (!isset($ddo->mode)) {
			if ($context->mode==='tm') {
				// Time machine mode propagates to children
				$ddo->mode = $context->mode;
			} else {
				// Non-section callers (portals) use list mode
				$ddo->mode = ($context->model !== 'section')
					? 'list'
					: $context->mode;
			}
		}
	}//end resolve_ddo_mode



	/**
	* RESOLVE_DDO_FIXED_MODE
	* Sets fixed_mode flag when mode is explicitly set in properties
	*
	* When mode is defined in ontology properties, it should be preserved
	* across render process changes. The fixed_mode flag prevents
	* mode overrides during component rendering.
	*
	* @param object $ddo
	* @return void
	*/
	protected function resolve_ddo_fixed_mode(object $ddo) : void {

		if (isset($ddo->mode)) {
			$ddo->fixed_mode = true;
		}
	}//end resolve_ddo_fixed_mode



	/**
	* RESOLVE_DDO_FIELDS_MAP
	* Resolves fields_map property for external API components
	*
	* External components (e.g., Zenon API, ISAD(G)) may have custom
	* field mappings defined in their properties. This method:
	* 1. Gets the component's properties from ontology
	* 2. Copies fields_map configuration
	* 3. Sets language based on translatable status
	* 4. Sets permissions for the component
	*
	* EXAMPLE: Zenon search component maps Dédalo fields to Zenon API fields
	*
	* @param object $ddo
	* @return void
	*/
	protected function resolve_ddo_fields_map(object $ddo) : void {

		$ontology_node				= ontology_node::get_instance($ddo->tipo);
		$current_ddo_properties		= $ontology_node->get_properties();
		$ddo->properties			= $current_ddo_properties;
		$ddo->fields_map			= $current_ddo_properties->fields_map ?? [];
		$ddo->lang					= $ontology_node->get_is_translatable() ? DEDALO_DATA_LANG : DEDALO_DATA_NOLAN;
		$ddo->model					= $ontology_node->get_model();
		$ddo->permissions			= common::get_permissions($ddo->section_tipo, $ddo->tipo);
	}//end resolve_ddo_fields_map



	/**
	* CHECK_DDO_PERMISSIONS
	* Checks if user has permissions to access ddo
	*
	* Only applies when caller is a section. Components inherit
	* permissions from their parent section.
	*
	* Permission levels:
	* - 0: No access (filtered out)
	* - 1: Read only
	* - 2: Edit
	* - 3: Admin
	*
	* @param object $ddo
	* @return bool True if user has access (permissions >= 1)
	*/
	protected function check_ddo_permissions(object $ddo) : bool {

		// Handle array section_tipos (use first one for permission check)
		$check_section_tipo = is_array($ddo->section_tipo) ? reset($ddo->section_tipo) : $ddo->section_tipo;
		$permissions = common::get_permissions($check_section_tipo, $ddo->tipo);

		if ($permissions < 1) {
			return false;
		}

		return true;
	}//end check_ddo_permissions



	/**
	* RESOLVE_GET_DDO_MAP
	* Gets ddo_map dynamically generated from ontology by model reference
	* (e.g., from 'section_map' definitions).
	*
	* @param array $ar_section_tipo
	* @param object|bool $get_ddo_map Definition object or false
	* @return array $ar_ddo_calculated
	*/
	protected function resolve_get_ddo_map(array $ar_section_tipo, $get_ddo_map) : array {

		if ($get_ddo_map === false) {
			return [];
		}

		// Guard: get_ddo_map must be an object with model and columns
		// (ontology properties are user-edited JSON; malformed values must not fatal)
		if (!is_object($get_ddo_map) || !isset($get_ddo_map->model) || !is_array($get_ddo_map->columns ?? null)) {
			debug_log(__METHOD__
				." Ignored invalid get_ddo_map definition. Expected object with 'model' and 'columns'" . PHP_EOL
				.' get_ddo_map: ' . to_string($get_ddo_map) . PHP_EOL
				.' tipo: ' . to_string($this->get_tipo()) . PHP_EOL
				.' section_tipo: ' . to_string($this->get_section_tipo())
				, logger::ERROR
			);
			$this->add_request_config_warning('drop', "Ignored invalid get_ddo_map definition: expected object with 'model' and 'columns'", $get_ddo_map);
			return [];
		}

		$ar_ddo_calculated	= [];

		switch ($get_ddo_map->model) {

			case 'section_map':
				$procesed_component_tipo = [];
				foreach ($ar_section_tipo as $current_section_tipo) {

					$section_map = section::get_section_map( $current_section_tipo );
					if(empty($section_map)) {
						debug_log(__METHOD__
							." Ignored section_tipo without section_map (1) current_section_tipo: ".to_string($current_section_tipo) . PHP_EOL
							.' tipo: ' . $this->tipo . PHP_EOL
							.' section_tipo: ' . $this->section_tipo . PHP_EOL
							.' section_id: ' . $this->section_id
							, logger::WARNING
						);
						continue;
					}
					foreach ($get_ddo_map->columns as $original_column) {

						$current_column = is_array($original_column)
							? (object)[ // compatibility with previous version ontology of 10-08-2024
								'path' => $original_column
							  ]
							: $original_column;

						$current_column_path = $current_column->path;

						$section_map_value = get_object_property($section_map, $current_column_path);

						// Scope-fallback: when a [scope, key] path resolves empty, retry through
						// the section_map chain (e.g. a section defining only 'main' for a
						// 'thesaurus.term' path). Additive: only fires on a previously-empty value.
						if(	empty($section_map_value)
							&& is_array($current_column_path)
							&& count($current_column_path)===2
							&& in_array($current_column_path[0], section_map::SCOPE_FALLBACK, true)
						){
							$section_map_value = section_map::get_element_tipo(
								$current_section_tipo,
								$current_column_path[1],
								$current_column_path[0]
							);
						}

						// ignore value
						if(empty($section_map_value)){
							debug_log(__METHOD__
								." Ignored section_tipo without section_map (2) current_section_tipo: ".to_string($current_section_tipo) . PHP_EOL
								.' tipo: ' . $this->tipo . PHP_EOL
								.' section_tipo: ' . ($this->section_tipo ?? null) . PHP_EOL
								.' section_id: ' . $this->section_id
								, logger::WARNING
							);
							continue;
						}
						$ar_component_tipo = (array)$section_map_value;

						foreach ($ar_component_tipo as $current_component_tipo) {
							if(in_array($current_component_tipo, $procesed_component_tipo)){

								$to_change_ddo = array_find($ar_ddo_calculated, function($ddo) use($current_component_tipo){
									return $ddo->tipo === $current_component_tipo;
								});
								if (is_object($to_change_ddo)) {
									$to_change_ddo->section_tipo = [...(array)$to_change_ddo->section_tipo, $current_section_tipo];
								}

							}else{
								$ddo = new dd_object();
									$ddo->set_tipo($current_component_tipo);
									$ddo->set_section_tipo($current_section_tipo);
									$ddo->set_parent( $this->get_tipo() );

								foreach ($current_column as $current_column_key => $current_column_value) {

									if($current_column_key === 'path'){
										continue;
									}
									$set_ddo_key = 'set_'.$current_column_key;
									$ddo->{$set_ddo_key}($current_column_value);
								}

								$procesed_component_tipo[] = $current_component_tipo;
								$ar_ddo_calculated[] = $ddo;
							}
						}
					}
				}//end foreach ($ar_section_tipo as $current_section_tipo)
				break;

			default:
				// Nothing to do
				break;
		}//end switch ($get_ddo_map->model)

		return $ar_ddo_calculated;
	}//end resolve_get_ddo_map



}//end trait request_config_ddo
