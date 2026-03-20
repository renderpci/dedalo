<?php declare(strict_types=1);
/**
* COMMON
* TRAIT request_config_v5
*
* V5 legacy fallback methods for request_config building.
* Handles backward compatibility for ontologies without V6 request_config.
*
* RESPONSIBILITIES:
* - Build request_config from ontology relation nodes (V5 style)
* - Resolve related terms based on model and mode
* - Create ddo_map from related components
* - Maintain backward compatibility with older ontologies
*
* V5 VS V6 DIFFERENCES:
* - V6: Uses properties->source->request_config (explicit configuration)
* - V5: Uses ontology relation_nodes (implicit configuration from hierarchy)
*
* WHEN V5 IS USED:
* - properties->source->request_config is NOT defined
* - Legacy ontologies that haven't been migrated to V6 style
*
* USED BY: get_ar_request_config() in class.common.php
*/
trait request_config_v5 {



	/**
	* BUILD_REQUEST_CONFIG_V5
	* Builds request_config using V5 legacy logic
	*
	* FLOW:
	* 1. Check for unsupported V5 components (throw error)
	* 2. Resolve related terms based on model/mode
	* 3. Clean related list (remove sections, excluded elements)
	* 4. Build ddo_map from related components
	* 5. Create request_config_object with show and sqo
	* 6. Store ddo_map in dd_core_api for legacy access
	*
	* @param object $context {tipo, section_tipo, section_id, mode, model}
	* @param object $pagination {offset, limit}
	* @return array Array with single request_config_object
	*/
	protected function build_request_config_v5(object $context, object $pagination) : array {

		$model = $context->model;
		$tipo = $context->tipo;
		$mode = $context->mode;
		$section_tipo = $context->section_tipo;

		// STEP 1: Check for unsupported V5 components
		// These components require V6 style configuration
		$v5_unsupported = ['component_relation_parent', 'component_relation_children'];
		if (in_array($model, $v5_unsupported)) {
			$msg = "Error. Invalid component [$model] configuration. v5 resolution fallback is no longer supported. Configure an RQO for the node $tipo";
			debug_log(__METHOD__ . $msg, logger::ERROR);
			throw new Exception($msg, 1);
		}

		// STEP 2: Resolve related terms (components to display)
		// Returns array of tipos based on model and mode
		$ar_related = $this->resolve_ar_related($model, $tipo, $mode);

		// STEP 3: Clean and extract target section_tipo
		// Removes sections, excluded elements, special components
		$related_data = $this->clean_and_extract_related($ar_related, $section_tipo);
		$ar_related_clean = $related_data['ar_related_clean'];
		$target_section_tipo = $related_data['target_section_tipo'];

		// STEP 4: Build default sqo_config
		$sqo_config = $this->build_sqo_config_default(
			$pagination->limit,
			$pagination->offset,
			$mode
		);

		// Fix pagination limit in instance (some instances don't have pagination)
		if (isset($this->pagination)) {
			$this->pagination->limit = $pagination->limit;
		}

		// Determine display mode
		$current_mode = ($model !== 'section') ? 'list' : $mode;

		// Get children_view from properties for view resolution
		$tipo_properties = $this->properties ?? $this->get_properties();
		$children_view = $tipo_properties->children_view ?? null;

		// STEP 5: Filter by permissions
		$ar_related_clean_auth = $this->filter_authorized_related(
			$ar_related_clean,
			$target_section_tipo
		);

		// STEP 6: Build ddo_map from related components
		$ddo_map = $this->build_legacy_ddo_map(
			$ar_related_clean_auth,
			$tipo,
			$target_section_tipo,
			$current_mode,
			$children_view
		);

		// Build show object
		$show = new stdClass();
			$show->ddo_map = $ddo_map;
			$show->sqo_config = $sqo_config;

		// Build SQO with section_tipos as ddo
		$ar_section_tipo = is_array($target_section_tipo) ? $target_section_tipo : [$target_section_tipo];
		$ddo_section_tipo = $this->build_sqo_section_tipo_ddo($ar_section_tipo);

		$sqo = new search_query_object();
			$sqo->set_section_tipo(
				is_array($ddo_section_tipo) ? $ddo_section_tipo : [$ddo_section_tipo]
			);

		// STEP 7: Create request_config_object
		$request_config_object = new request_config_object();
			$request_config_object->set_api_engine('dedalo');
			$request_config_object->set_type('main');
			$request_config_object->set_show($show);
			$request_config_object->set_sqo($sqo);

		// LEGACY: Store ddo_map in dd_core_api for backward compatibility
		// Some legacy code accesses this directly
		dd_core_api::$context_dd_objects = $ddo_map;

		return [$request_config_object];
	}//end build_request_config_v5



	/**
	* RESOLVE_AR_RELATED
	* Resolves related terms based on model and mode
	*
	* Related terms are components that should be displayed/processed.
	* The resolution varies by:
	* - Model: section, grouper, component_filter, etc.
	* - Mode: edit, list, related_list, tm, search
	*
	* @param string $model Caller model name
	* @param string $tipo Caller tipo
	* @param string $mode Current mode
	* @return array Array of related tipo strings
	*/
	protected function resolve_ar_related(string $model, string $tipo, string $mode) : array {

		$ar_related = [];

		switch ($mode) {
			case 'edit':
				$ar_related = $this->resolve_ar_related_edit($model, $tipo);
				break;

			case 'related_list':
				$ar_related = $this->resolve_ar_related_related_list($model, $tipo);
				break;

			case 'list':
			case 'tm':
			case 'search':
			default:
				$ar_related = $this->resolve_ar_related_list($model, $tipo);
				break;
		}

		return $ar_related;
	}//end resolve_ar_related



	/**
	* RESOLVE_AR_RELATED_EDIT
	* Resolves related terms for edit mode
	*
	* EDIT MODE RULES:
	* - section: Get all components, groups, tabs from section
	* - groupers: Get direct children
	* - component_filter: Special handling for projects
	* - other components: Get relation_nodes (linked components)
	*
	* @param string $model
	* @param string $tipo
	* @return array
	*/
	protected function resolve_ar_related_edit(string $model, string $tipo) : array {

		if ($model === 'section') {
			// Sections: get all editable children
			$table = common::get_matrix_table_from_tipo($tipo);
			$ar_model_name_required = [
				'component_',			// All components
				'section_group',		// Group containers
				'section_group_div',	// Div containers
				'section_tab',			// Tab containers
				'tab'					// Tab elements
			];
			return section::get_ar_children_tipo_by_model_name_in_section(
				$tipo,
				$ar_model_name_required,
				true,		// from_cache
				true,		// resolve_virtual
				true,		// recursive (get all nested)
				false,		// search_exact
				false,		// ar_tipo_exclude_elements
				['component_dataframe']	// exclude: dataframe has special handling
			);
		}

		if (in_array($model, common::$groupers)) {
			// Groupers: get direct children only
			return (array)ontology_node::get_ar_children($tipo);
		}

		if ($model === 'component_filter') {
			// component_filter: special handling for projects
			return [DEDALO_SECTION_PROJECTS_TIPO, DEDALO_PROJECTS_NAME_TIPO];
		}

		// Other components: get related nodes
		return (array)ontology_node::get_relation_nodes($tipo, true, true);
	}//end resolve_ar_related_edit



	/**
	* RESOLVE_AR_RELATED_RELATED_LIST
	* Resolves related terms for related_list mode
	*
	* RELATED_LIST is used for showing relations in a special view.
	* Only sections have related_list handling.
	*
	* @param string $model
	* @param string $tipo
	* @return array
	*/
	protected function resolve_ar_related_related_list(string $model, string $tipo) : array {

		$ar_related = [];

		if ($model !== 'section') {
			return $ar_related;
		}

		// Try to find relation_list child (virtual section first)
		$ar_terms = section::get_ar_children_tipo_by_model_name_in_section(
			$tipo,
			['relation_list'],
			true,		// from_cache
			false,		// resolve_virtual (try virtual first)
			false,		// recursive
			true		// search_exact
		);

		// If not found, try resolving to real section
		if (empty($ar_terms)) {
			$ar_terms = section::get_ar_children_tipo_by_model_name_in_section(
				$tipo,
				['relation_list'],
				true,		// from_cache
				true,		// resolve_virtual
				false,		// recursive
				true		// search_exact
			);
		}

		// Use relation_list's related terms
		if (isset($ar_terms[0])) {
			$ar_related = ontology_node::get_relation_nodes($ar_terms[0], true, true);
		}

		return $ar_related;
	}//end resolve_ar_related_related_list



	/**
	* RESOLVE_AR_RELATED_LIST
	* Resolves related terms for list mode
	*
	* LIST MODE RULES:
	* - section: Look for section_list child, use its components
	* - groupers: Get direct children
	* - component_filter: Special handling for projects
	* - other components: Try section_list, fallback to relation_nodes
	*
	* @param string $model
	* @param string $tipo
	* @return array
	*/
	protected function resolve_ar_related_list(string $model, string $tipo) : array {

		if ($model === 'section') {
			return $this->resolve_ar_related_list_section($tipo);
		}

		if (in_array($model, common::$groupers)) {
			return (array)ontology_node::get_ar_children($tipo);
		}

		if ($model === 'component_filter') {
			return [DEDALO_SECTION_PROJECTS_TIPO, DEDALO_PROJECTS_NAME_TIPO];
		}

		return $this->resolve_ar_related_list_component($tipo);
	}//end resolve_ar_related_list



	/**
	* RESOLVE_AR_RELATED_LIST_SECTION
	* Resolves related terms for section in list mode
	*
	* Looks for section_list child term which defines list columns.
	* Falls back to real section if virtual section has no section_list.
	*
	* @param string $tipo Section tipo
	* @return array
	*/
	protected function resolve_ar_related_list_section(string $tipo) : array {

		// Try to find section_list child
		$ar_terms = (array)ontology_node::get_ar_tipo_by_model_and_relation(
			$tipo,
			'section_list',
			'children',
			true
		);

		if (isset($ar_terms[0])) {
			return ontology_node::get_relation_nodes($ar_terms[0], true, true);
		}

		// Try resolving virtual section to real section
		$real_section_tipo = section::get_section_real_tipo_static($tipo);
		if ($real_section_tipo !== $tipo) {
			$ar_terms = (array)ontology_node::get_ar_tipo_by_model_and_relation(
				$real_section_tipo,
				'section_list',
				'children',
				true
			);
			if (isset($ar_terms[0])) {
				return ontology_node::get_relation_nodes($ar_terms[0], true, true);
			}
		}

		return [];
	}//end resolve_ar_related_list_section



	/**
	* RESOLVE_AR_RELATED_LIST_COMPONENT
	* Resolves related terms for component in list mode
	*
	* Components (like portals) may have section_list defining columns.
	* Also ensures target section is included in related terms.
	*
	* @param string $tipo Component tipo
	* @return array
	*/
	protected function resolve_ar_related_list_component(string $tipo) : array {

		// Try section_list child first
		$ar_terms = ontology_node::get_ar_tipo_by_model_and_relation(
			$tipo,
			'section_list',
			'children',
			true
		);

		if (isset($ar_terms[0])) {
			$ar_related = ontology_node::get_relation_nodes($ar_terms[0], true, true);

			// Check if section is in related terms
			$section_isset = false;
			foreach ((array)$ar_related as $current_tipo) {
				$current_model = ontology_node::get_model_by_tipo($current_tipo, true);
				if ($current_model === 'section') {
					$section_isset = true;
					break;
				}
			}

			// Add main section if not present
			if (!$section_isset) {
				$ar_main_section = ontology_node::get_ar_tipo_by_model_and_relation(
					$tipo,
					'section',
					'related',
					true
				);
				$ar_related = array_merge($ar_main_section, $ar_related);
			}

			return $ar_related;
		}

		// Fallback: use relation_nodes
		return ontology_node::get_relation_nodes($tipo, true, true);
	}//end resolve_ar_related_list_component



	/**
	* CLEAN_AND_EXTRACT_RELATED
	* Cleans related array and extracts target section_tipo
	*
	* CLEANING RULES:
	* - Remove sections (they become target_section_tipo)
	* - Remove 'exclude_elements' model
	* - Remove deprecated component_security_areas_profiles
	* - Remove component_filter from system tables
	*
	* @param array $ar_related Raw related terms
	* @param string $section_tipo Default section_tipo
	* @return array {ar_related_clean: array, target_section_tipo: string}
	*/
	protected function clean_and_extract_related(array $ar_related, string $section_tipo) : array {

		$ar_related_clean = [];
		$target_section_tipo = $section_tipo;
		$table = null;

		if (empty($ar_related)) {
			return [
				'ar_related_clean'		=> $ar_related_clean,
				'target_section_tipo'	=> $target_section_tipo
			];
		}

		foreach ($ar_related as $current_tipo) {
			$current_model = ontology_node::get_model_by_tipo($current_tipo, true);

			// Sections become target_section_tipo (not included in list)
			if ($current_model === 'section') {
				$target_section_tipo = $current_tipo;
				continue;
			}

			// Skip exclude_elements markers
			if ($current_model === 'exclude_elements') {
				continue;
			}

			// Skip deprecated component (v6 compatibility)
			if ($current_tipo === DEDALO_COMPONENT_SECURITY_AREAS_PROFILES_TIPO) {
				continue;
			}

			// Skip component_filter in system tables
			if ($current_model === 'component_filter') {
				if (isset($table) && ($table === 'matrix_dd' || $table === 'matrix_list')) {
					continue;
				}
			}

			$ar_related_clean[] = $current_tipo;
		}

		return [
			'ar_related_clean'		=> $ar_related_clean,
			'target_section_tipo'	=> $target_section_tipo
		];
	}//end clean_and_extract_related



	/**
	* FILTER_AUTHORIZED_RELATED
	* Filters related items by user permissions
	*
	* Only includes items where user has at least read permission (1).
	*
	* @param array $ar_related_clean Cleaned related terms
	* @param string $target_section_tipo Section for permission check
	* @return array Authorized related terms
	*/
	protected function filter_authorized_related(array $ar_related_clean, string $target_section_tipo) : array {

		$result = [];

		foreach ($ar_related_clean as $item_tipo) {
			$permissions = common::get_permissions($target_section_tipo, $item_tipo);
			if ($permissions > 0) {
				$result[] = $item_tipo;
			}
		}

		return $result;
	}//end filter_authorized_related



	/**
	* BUILD_LEGACY_DDO_MAP
	* Builds ddo_map for V5 legacy mode
	*
	* Creates dd_object for each related component with:
	* - tipo: component identifier
	* - model: component model name
	* - section_tipo: target section
	* - parent: calling element
	* - mode: display mode
	* - view: view configuration
	* - label: human-readable name
	*
	* @param array $ar_related_clean_auth Authorized related terms
	* @param string $parent_tipo Calling element tipo
	* @param string $target_section_tipo Target section
	* @param string $current_mode Display mode
	* @param string|null $children_view View override from properties
	* @return array Array of dd_object instances
	*/
	protected function build_legacy_ddo_map(
		array $ar_related_clean_auth,
		string $parent_tipo,
		string $target_section_tipo,
		string $current_mode,
		?string $children_view
	) : array {

		return array_map(function($current_tipo) use($parent_tipo, $target_section_tipo, $current_mode, $children_view) {

			// Get model and properties
			$model = ontology_node::get_model_by_tipo($current_tipo, true);
			$current_tipo_ontology_node = ontology_node::get_instance($current_tipo);
			$current_tipo_properties = $current_tipo_ontology_node->get_properties();

			// Resolve view: children_view override or component's own view
			$own_view = $current_tipo_properties->view ?? common::resolve_view((object)[
				'model' => $model,
				'tipo'	=> $current_tipo
			]);

			$view = $children_view ?? $own_view;

			// Build ddo
			$ddo = new dd_object();
				$ddo->set_tipo($current_tipo);
				$ddo->set_model($model);
				$ddo->set_section_tipo($target_section_tipo);
				$ddo->set_parent($parent_tipo);
				$ddo->set_mode($current_mode);
				$ddo->set_view($view);
				$ddo->set_label(ontology_node::get_term_by_tipo($current_tipo, DEDALO_APPLICATION_LANG, true, true));

			return $ddo;
		}, $ar_related_clean_auth);
	}//end build_legacy_ddo_map



}//end trait request_config_v5
