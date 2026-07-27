<?php declare(strict_types=1);
/**
* TRAIT REQUEST_CONFIG_V5
* V5 legacy fallback strategy for building a request_config from ontology
* relation nodes.
*
* When an ontology node does NOT define an explicit
* `properties->source->request_config` (the V6 approach), Dédalo falls back
* to this trait to derive which components to display by walking the
* ontology relation graph. The trait is mixed into class common and is
* selected by get_ar_request_config() when the V6 condition is false.
*
* Responsibilities:
* - Derive the list of component tipos to display (ar_related) by inspecting
*   ontology relation nodes for the caller's model and mode.
* - Remove sections, groupers, deprecated tipos, and items the current user
*   cannot access from that list.
* - Build a ddo_map array of dd_object instances, one per authorized component.
* - Wrap everything in a single request_config_object (api_engine=dedalo,
*   type=main) and return it as a one-element array — matching the shape that
*   V6 returns so callers need no branching.
* - Update $this->pagination->limit as a side effect (mirrors V6 behaviour;
*   sync_pagination_from_config replicates this on the cache-hit path).
*
* V5 vs V6 comparison:
* - V6: reads an explicit `properties->source->request_config` JSON array
*   stored on the ontology node — fast, deterministic, migration target.
* - V5: derives configuration implicitly by traversing ontology children and
*   relation_nodes — flexible but expensive; deprecated for new ontologies.
*
* Unsupported models:
*   component_relation_parent and component_relation_children are not
*   resolvable via V5 graph traversal; they throw immediately to force
*   their ontology nodes to be migrated to explicit V6 RQOs.
*
* Used by: common::get_ar_request_config() (class.common.php)
* Peer traits: request_config_utils, request_config_ddo, request_config_v6
*
* @package Dédalo
* @subpackage Core
*/
trait request_config_v5 {



	/**
	* BUILD_REQUEST_CONFIG_V5
	* Entry point for V5 legacy request_config resolution.
	*
	* Orchestrates the full V5 pipeline and returns a one-element array
	* containing a request_config_object, matching the shape produced by
	* build_request_config_v6 so that callers need no branching.
	*
	* Pipeline steps:
	* 1. Reject models that are incompatible with V5 graph traversal (throw).
	* 2. Resolve the raw list of related tipos via the ontology relation graph,
	*    using mode- and model-specific rules (resolve_ar_related).
	* 3. Strip sections (which become the target_section_tipo), deprecated
	*    markers, and inaccessible tipos (clean_and_extract_related).
	* 4. Build the default sqo_config object (limit, offset, operator, mode).
	* 5. Apply the instance pagination limit side effect expected by the
	*    *_json.php response controllers.
	* 6. Determine display mode — non-section callers (portals) always use
	*    'list'; section callers inherit $mode.
	* 7. Filter the clean list to items the current user can read (permissions>0).
	* 8. Build a dd_object for every authorized tipo (build_legacy_ddo_map).
	* 9. Wrap the result in a request_config_object and return it.
	*
	* Side effect: sets $this->pagination->limit (if the instance has a
	* pagination property) so downstream *_json.php controllers see the
	* resolved limit even when the config came from this build path.
	*
	* @param object $context {tipo: string, section_tipo: string, section_id: int, mode: string, model: string, use_cache: bool}
	* @param object $pagination {offset: int, limit: int}
	* @return array Single-element array containing a request_config_object
	* @throws Exception when $context->model is in the V5 unsupported list
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

		return [$request_config_object];
	}//end build_request_config_v5



	/**
	* RESOLVE_AR_RELATED
	* Dispatches to the correct mode-specific resolver to obtain the raw list
	* of related tipos for a caller node.
	*
	* Related tipos are the component/section tipos that should be displayed or
	* processed when the caller renders. The set varies by:
	* - Model: 'section' walks its own children; groupers return their direct
	*   children; component_filter has fixed project tipos; other components
	*   follow their relation_nodes.
	* - Mode: edit mode typically includes all editable children; list/tm modes
	*   look for a section_list sub-node first; related_list uses a
	*   relation_list sub-node.
	*
	* The raw list returned here is unfiltered — callers should subsequently
	* pass it through clean_and_extract_related and filter_authorized_related.
	*
	* @param string $model Caller's model class name (e.g. 'section', 'component_portal')
	* @param string $tipo Caller's ontology tipo (e.g. 'dd153')
	* @param string $mode Current render mode: 'edit'|'list'|'tm'|'search'|'related_list'
	* @return array Flat array of ontology tipo strings
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
	* Determines which tipos to display when the caller renders in edit mode.
	*
	* Rules by model:
	* - section: returns every component_, section_group, section_group_div,
	*   section_tab and tab child (recursively), explicitly excluding
	*   component_dataframe (it has special rendering treatment).
	* - groupers (section_group / section_group_div / section_tab / tab): returns
	*   direct children only (one level), so the grouper controls its own layout.
	* - component_filter: hardcodes the two project-section tipos
	*   (DEDALO_SECTION_PROJECTS_TIPO, DEDALO_PROJECTS_NAME_TIPO) because the
	*   filter component always operates on the projects matrix.
	* - all other components: returns their ontology relation_nodes (the
	*   sections and components they are linked to in the ontology graph).
	*
	* @param string $model Caller's model class name
	* @param string $tipo Caller's ontology tipo
	* @return array Flat array of ontology tipo strings
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
	* Determines which tipos to display when the caller renders in related_list
	* mode.
	*
	* related_list is a specialised view used to show records that are linked
	* to the current record via a relation_list child node. Only sections
	* have a meaningful related_list; all other models return an empty array.
	*
	* Resolution strategy:
	* 1. Look for a 'relation_list' child of the section using virtual-section
	*    resolution disabled (resolve_virtual=false) — fast path for sections
	*    that define their own relation_list.
	* 2. If nothing found, retry with virtual-section resolution enabled so
	*    that virtual sections (ontology aliases) fall through to their real
	*    section's relation_list.
	* 3. Return the relation_nodes of the first relation_list found, which are
	*    the section/component tipos the relation_list is configured to show.
	*
	* @param string $model Caller's model class name
	* @param string $tipo Caller's ontology tipo
	* @return array Flat array of ontology tipo strings; empty if model is not 'section'
	*/
	protected function resolve_ar_related_related_list(string $model, string $tipo) : array {

		$ar_related = [];

		if ($model !== 'section') {
			return $ar_related;
		}

		// Try to find relation_list child without virtual-section resolution
		$ar_terms = section::get_ar_children_tipo_by_model_name_in_section(
			$tipo,
			['relation_list'],
			true,		// from_cache
			false,		// resolve_virtual: direct lookup only
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
	* Dispatches to the correct sub-resolver when the caller renders in list,
	* tm, or search mode.
	*
	* Rules by model:
	* - section: delegates to resolve_ar_related_list_section which looks for a
	*   section_list child to define the visible columns.
	* - groupers: returns direct ontology children (same as edit mode).
	* - component_filter: hardcodes the project section tipos.
	* - all other components: delegates to resolve_ar_related_list_component
	*   which prefers a section_list child over relation_nodes.
	*
	* @param string $model Caller's model class name
	* @param string $tipo Caller's ontology tipo
	* @return array Flat array of ontology tipo strings
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
	* Resolves the list of related tipos for a section in list/tm/search mode.
	*
	* A section's list columns are defined by its 'section_list' child node in
	* the ontology. The relation_nodes of that section_list are the component
	* tipos that appear as columns.
	*
	* Fallback chain:
	* 1. Look for a section_list child under $tipo directly.
	* 2. If not found and $tipo is a virtual section (an alias), resolve it to
	*    its backing real section and look there.
	* 3. If still not found, return an empty array — the caller will produce no
	*    ddo_map, and V5 will effectively render no columns.
	*
	* @param string $tipo Section tipo to resolve
	* @return array Flat array of ontology tipo strings; empty if no section_list found
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
	* Resolves the list of related tipos for a non-section caller (e.g. a
	* portal component) in list mode.
	*
	* Strategy:
	* 1. Check whether the component has a section_list child. If so, use its
	*    relation_nodes as the column list.
	*    - Also ensure the target section itself is present in that list:
	*      portals link to one section but the section_list child may omit it.
	*      If no section tipo is found among the relation_nodes, the main
	*      related section (from the component's 'related' relation in the
	*      ontology) is prepended.
	* 2. If no section_list child exists, fall back to the component's own
	*    relation_nodes.
	*
	* @param string $tipo Component tipo
	* @return array Flat array of ontology tipo strings
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
	* Removes non-displayable tipos from the raw related list and identifies
	* the target section.
	*
	* The raw ar_related list may contain a mix of sections, components, and
	* meta-types. This method partitions and filters them:
	*
	* - 'section' model: the first one found becomes target_section_tipo (used
	*   as the section_tipo in all generated ddos). It is not added to the
	*   component list because sections are not rendered as data columns.
	* - 'exclude_elements' model: ontology marker nodes; skip silently.
	* - DEDALO_COMPONENT_SECURITY_AREAS_PROFILES_TIPO (dd249): deprecated
	*   security component removed in V6; skip to avoid rendering it.
	* - 'component_filter' in system tables (matrix_dd / matrix_list): the
	*   filter component is not meaningful in these internal tables; skip.
	*   (!) Note: $table is initialised to null and never reassigned in this
	*   method; the matrix_dd/matrix_list branch is therefore currently dead
	*   code — the guard never triggers.
	*
	* @param array $ar_related Raw flat list of ontology tipo strings from a resolver
	* @param string $section_tipo Fallback section_tipo if no 'section' model is found in the list
	* @return array{ar_related_clean: array, target_section_tipo: string}
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
	* Removes tipos that the current user cannot access.
	*
	* Calls common::get_permissions() for each tipo against the target section.
	* Permission level 0 means no access; levels 1–3 grant increasing rights.
	* Only tipos with permissions > 0 survive the filter.
	*
	* This is a second-pass filter after clean_and_extract_related removes
	* structural/deprecated items; together they produce the final authorized
	* component list that is turned into a ddo_map.
	*
	* @param array $ar_related_clean Component tipos after structural cleaning
	* @param string $target_section_tipo The resolved section tipo against which permissions are checked
	* @return array Subset of $ar_related_clean for which the user has at least read access
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
	* Converts the authorized list of component tipos into an array of
	* dd_object instances (the ddo_map) used by V5 request_config.
	*
	* Each dd_object carries the minimum information needed for the data layer
	* to fetch and render the component:
	* - tipo: component's ontology identifier.
	* - model: resolved from the ontology (e.g. 'component_input_text').
	* - section_tipo: the target section that holds this component's data.
	* - parent: the calling element's tipo (section or portal).
	* - mode: 'list' for non-section callers, or the caller's own mode.
	* - view: the component's configured view, with $children_view as an
	*   override when the caller's properties define `children_view`.
	* - label: human-readable term in DEDALO_APPLICATION_LANG for UI display.
	*
	* View resolution priority:
	* 1. $children_view (from caller's properties->children_view), if set.
	* 2. The component's own `properties->view`, if defined.
	* 3. common::resolve_view() default for the model.
	*
	* @param array $ar_related_clean_auth Authorized component tipos (post-filter)
	* @param string $parent_tipo Ontology tipo of the calling element (section or component)
	* @param string $target_section_tipo Section tipo that owns the data rows
	* @param string $current_mode Display mode for all generated ddos ('list', 'edit', etc.)
	* @param string|null $children_view View override from the caller's properties; null means use each component's own view
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
