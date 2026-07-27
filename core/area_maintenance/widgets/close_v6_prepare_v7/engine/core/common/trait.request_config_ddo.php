<?php declare(strict_types=1);
/**
* TRAIT REQUEST_CONFIG_DDO
* DDO (Data Description Object) map processing methods for request_config building.
*
* A DDO is a small configuration object — essentially a resolved column descriptor —
* that tells the UI which component to render, how to render it (mode, label,
* permissions), and where to fetch its data (section_tipo, parent).  This trait
* owns every step between a raw ddo_map array from the ontology properties and
* the fully-enriched array that the request_config_object carries to the client.
*
* RESPONSIBILITIES:
* - Iterate and validate ddo_map arrays for show / search / choose / hide slots.
* - Reject ddos whose tipo is unresolvable or whose TLD is not installed.
* - Enrich each surviving ddo: model, label, resolved 'self' placeholders, mode,
*   fixed_mode flag, fields_map content, and user-permission gate.
* - Dynamically generate ddo_maps from section_map definitions when the ontology
*   uses a 'get_ddo_map' directive instead of a literal array.
*
* DDO MAP SLOT SEMANTICS:
* - show   : component columns rendered in list / edit views.
* - search : fields exposed in the search panel.
* - choose : fields shown inside autocomplete / picker results.
* - hide   : components explicitly excluded from display.
*
* Used by: trait request_config_v6 (and through it, class common).
* Composed into class common alongside request_config_utils and request_config_v5/v6.
*
* @package Dédalo
* @subpackage Core
*/
trait request_config_ddo {



	/**
	* PROCESS_DDO_MAP
	* Iterates a raw ddo_map array, validates every entry, and returns the
	* fully-enriched subset that passed all checks.
	*
	* The method is the outer loop: it delegates per-item work to
	* process_single_ddo() and compacts the result by discarding null returns
	* (failed validation or permission denied).  Ordering is preserved.
	*
	* @param array  $ar_ddo_map Array of raw ddo objects from ontology properties.
	* @param object $context    Shape: {tipo, section_tipo, ar_section_tipo, model, mode}.
	* @param string $map_type   = 'show' - Slot being built: 'show'|'search'|'choose'|'hide'.
	* @return array             Enriched ddo objects in the original order.
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
	* Validates and enriches a single ddo object, returning null on any failure.
	*
	* This is the inner pipeline that transforms one raw ontology-defined ddo into
	* a client-ready descriptor.  Steps run in strict order because each step may
	* depend on properties set by the previous one (e.g., model is needed before
	* the section_group filter in step 4, and section_tipo must be resolved before
	* the permission check in step 11).
	*
	* PROCESSING STEPS:
	* 1.  Verify tipo field is present and non-empty.
	* 2.  Validate tipo is resolvable in the ontology and its TLD is installed.
	* 3.  Resolve and attach the component model name (e.g. 'component_input_text').
	* 4.  Drop section_group components from list-mode show maps (groupers are not
	*     column-renderable in list context).
	* 5.  Inject label from ontology if not already supplied in the ddo.
	* 6.  Replace 'self' placeholders in section_tipo and parent.
	* 7.  Set mode from context when the ddo does not declare its own.
	* 8.  Mark fixed_mode=true when mode was explicitly set (prevents render overrides).
	* 9.  Expand fields_map from ontology properties for external API components.
	* 10. Propagate the current view to component_dataframe ddos in tm mode.
	* 11. Gate on user permissions when the caller is a section.
	*
	* @param object $current_ddo Raw ddo from ontology properties.
	* @param object $context     Shape: {tipo, section_tipo, ar_section_tipo, model, mode}.
	* @param string $map_type    Slot name used in warning messages and mode logic.
	* @return object|null        Fully enriched ddo, or null when it must be dropped.
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
	* Validates that a ddo tipo is both ontologically resolvable and belongs to an
	* installed TLD (Top-Level Domain, e.g. 'numisdata', 'rsc').
	*
	* Ontology properties are user-authored JSON: they can reference tipos from
	* optional domain modules that may not be installed on every Dédalo instance.
	* Both checks must pass for the ddo to survive into the enrichment pipeline;
	* either failure emits a warning and returns false so the caller can drop it.
	*
	* @param string $tipo     The ontology tipo to check (e.g. 'dd1234').
	* @param object $context  Shape: {tipo, ...} — used only for diagnostic logging.
	* @param string $map_type Slot name ('show', 'search', ...) for warning messages.
	* @return bool            True when the tipo is valid and its TLD is active.
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
	* Injects an ontology-derived label into the ddo when none was supplied.
	*
	* The label is the human-readable column heading shown in list views and
	* autocomplete panels (e.g. "Country" for a component_select_lang column).
	* It is retrieved from the ontology term in the current application language
	* (DEDALO_APPLICATION_LANG) so the UI needs no separate lookup.
	* The ddo object is mutated in place; no return value.
	*
	* @param object $ddo The ddo being enriched; receives a $ddo->label string.
	* @return void
	*/
	protected function enrich_ddo_label(object $ddo) : void {

		if (!isset($ddo->label)) {
			$ddo->label = ontology_node::get_term_by_tipo($ddo->tipo, DEDALO_APPLICATION_LANG, true, true);
		}
	}//end enrich_ddo_label



	/**
	* RESOLVE_DDO_SELF_REFERENCES
	* Replaces the 'self' placeholder strings in section_tipo and parent with
	* real runtime values from the calling context.
	*
	* 'self' is a generic ontology shorthand that defers binding to build time:
	* - section_tipo = 'self'  →  the context's ar_section_tipo array (or the
	*   single context->section_tipo string for component_dataframe, which always
	*   targets its own host section rather than a foreign one).
	* - parent = 'self'       →  the context's tipo (i.e., the portal or section
	*   that owns this ddo).
	*
	* The ddo is mutated in place; no return value.
	*
	* @param object $ddo     The ddo being resolved; may have section_tipo='self'
	*                        and/or parent='self'.
	* @param object $context Shape: {tipo, section_tipo, ar_section_tipo, model}.
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
	* Sets the ddo's render mode when it was not explicitly declared in the
	* ontology properties.
	*
	* Mode drives which component template the client selects:
	* - 'tm'   : time-machine diff view — always propagates to children so every
	*            column in a TM list renders the historical comparison UI.
	* - 'list' : forced when the calling element is not a section (e.g. a portal),
	*            because portal columns always display in compact list form regardless
	*            of the outer page mode.
	* - other  : inherited from the context (edit / read / ...).
	*
	* The ddo is mutated in place; no return value.
	*
	* @param object $ddo     The ddo being configured; receives $ddo->mode.
	* @param object $context Shape: {mode, model}.
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
	* Marks a ddo as fixed_mode when it already carries an explicit mode value.
	*
	* The fixed_mode flag signals downstream render code that the mode was
	* intentionally authored in the ontology properties and must not be overridden
	* by the outer context (e.g. the page switching from 'edit' to 'read' should
	* not affect a column that was pinned to 'list' mode).
	*
	* (!) This method runs after resolve_ddo_mode(), so it covers both ontology-set
	* modes and context-inherited modes.  That is intentional: once a mode is
	* committed to the ddo object, it is considered fixed for the rest of the render.
	*
	* @param object $ddo The ddo being configured; receives $ddo->fixed_mode = true
	*                    when $ddo->mode is already set.
	* @return void
	*/
	protected function resolve_ddo_fixed_mode(object $ddo) : void {

		if (isset($ddo->mode)) {
			$ddo->fixed_mode = true;
		}
	}//end resolve_ddo_fixed_mode



	/**
	* RESOLVE_DDO_FIELDS_MAP
	* Expands the fields_map descriptor for components that back an external API
	* (e.g. a Zenon library-catalogue search or an ISAD(G) archival component).
	*
	* When a show-slot ddo carries fields_map=true the field-map configuration is
	* not yet materialised — it is a lazy flag signalling that the real mapping
	* lives in the component's own ontology properties.  This method:
	* 1. Loads the component's ontology_node and its properties object.
	* 2. Replaces the boolean flag with the actual fields_map array from properties.
	* 3. Attaches the full properties object so the client can read auxiliary keys.
	* 4. Sets the lang to DEDALO_DATA_LANG (translatable) or DEDALO_DATA_NOLAN
	*    (non-translatable) — external components need to know which language
	*    axis their data lives on.
	* 5. Refreshes model (avoids mismatch if it was already set elsewhere).
	* 6. Resolves permissions for the component's own section_tipo/tipo pair.
	*
	* The ddo is mutated in place; no return value.
	*
	* @param object $ddo The ddo being enriched; must have tipo and section_tipo set
	*                    before this method is called.
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
	* Returns false when the current user has no access to the ddo's component.
	*
	* Permission levels returned by common::get_permissions():
	* - 0  : no access — ddo is dropped from the map.
	* - 1  : read-only.
	* - 2  : edit.
	* - 3  : admin.
	*
	* When section_tipo is an array (multiple host sections after 'self' resolution),
	* the first element is used for the check.  This is conservative: a user who
	* has access to at least one section in the set can see the column; the
	* per-record permission system handles finer-grained control at data fetch time.
	*
	* @param object $ddo Must have section_tipo (string|array) and tipo set.
	* @return bool       True if permissions >= 1, false if access is denied.
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
	* Dynamically builds a ddo_map by reading section_map definitions from the
	* ontology, as an alternative to a literal ddo_map array in the properties.
	*
	* Instead of listing every ddo explicitly, an ontology author can set a
	* get_ddo_map directive with a model ('section_map') and a columns array.
	* Each column entry declares a 'path' — a [scope, key] pair used to look up
	* the component tipo(s) from the section's section_map — plus optional extra
	* properties (mode, label, etc.) that are applied to the generated ddo.
	*
	* SUPPORTED MODELS:
	* - 'section_map' : reads columns from section::get_section_map() and resolves
	*                   each path via get_object_property().  Falls back through the
	*                   SCOPE_FALLBACK chain (main → thesaurus → relation_list) when
	*                   the exact scope produces no value.  When the same component
	*                   tipo appears in multiple section_tipos it is merged into a
	*                   single ddo with an array section_tipo.
	*
	* Returns an empty array (never null) when get_ddo_map is false, malformed, or
	* produces no results — callers can safely merge the return value into the
	* surrounding ddo_map without a null guard.
	*
	* @param array        $ar_section_tipo Resolved section tipos for the current request.
	* @param object|bool  $get_ddo_map     The get_ddo_map directive object, or false when absent.
	* @return array                         Fully constructed dd_object instances ready for
	*                                       further enrichment by process_ddo_map().
	*/
	protected function resolve_get_ddo_map(array $ar_section_tipo, $get_ddo_map) : array {

		// Fast-exit: false means the directive was absent in the properties; return
		// empty so the caller falls through to a literal ddo_map (if any).
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
				// Tracks every component tipo already added to avoid duplicating ddos
				// when the same tipo appears under multiple section_tipos.
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

						// Compatibility normalisation: before 2024-08-10 columns were stored
						// as bare arrays (the path itself).  Wrap legacy arrays in the
						// expected object shape so the rest of the loop is uniform.
						$current_column = is_array($original_column)
							? (object)[ // compatibility with previous version ontology of 10-08-2024
								'path' => $original_column
							  ]
							: $original_column;

						$current_column_path = $current_column->path;

						$section_map_value = get_object_property($section_map, $current_column_path);

						// Scope-fallback
						// When a [scope, key] path resolves empty on the raw section_map object,
						// retry through the SCOPE_FALLBACK chain (main → thesaurus → relation_list)
						// via section_map::get_element_tipo().  This covers sections that define
						// only a 'main' scope when the column path asked for 'thesaurus.term' —
						// the fallback finds 'main.term' instead.  Only fires on an empty value;
						// a non-empty result from the primary lookup is never replaced.
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

						// Skip if neither the direct path nor the fallback chain resolved a tipo.
						// This is normal when a section simply does not define a given column key.
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
						// Normalise: section_map values can be a string or an array of tipos;
						// cast to array so the loop below handles both shapes uniformly.
						$ar_component_tipo = (array)$section_map_value;

						foreach ($ar_component_tipo as $current_component_tipo) {
							if(in_array($current_component_tipo, $procesed_component_tipo)){

								// Deduplication merge: the same component tipo was already seen
								// for an earlier section_tipo in $ar_section_tipo.  Rather than
								// creating a duplicate ddo, extend the existing ddo's section_tipo
								// array so it covers both sections.  dd_object::section_tipo may
								// already be an array (from a previous merge) or a string (from
								// the initial set_section_tipo call), so spread-after-cast is safe.
								$to_change_ddo = array_find($ar_ddo_calculated, function($ddo) use($current_component_tipo){
									return $ddo->tipo === $current_component_tipo;
								});
								if (is_object($to_change_ddo)) {
									$to_change_ddo->section_tipo = [...(array)$to_change_ddo->section_tipo, $current_section_tipo];
								}

							}else{
								// First encounter: build a fresh ddo with the component's tipo,
								// its host section, and the parent (this element's tipo).
								$ddo = new dd_object();
									$ddo->set_tipo($current_component_tipo);
									$ddo->set_section_tipo($current_section_tipo);
									$ddo->set_parent( $this->get_tipo() );

								// Apply any extra column properties (mode, label, …) via the
								// corresponding dd_object setters.  'path' is skipped because it
								// is a build-time directive, not a ddo field.
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
