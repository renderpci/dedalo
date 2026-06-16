<?php declare(strict_types=1);
include_once 'trait.search_component_relation_common.php';
include_once 'trait.search_component_relation_common_tm.php';
/**
* CLASS COMPONENT_RELATION_COMMON
* Abstract base for every Dédalo component whose dato is an array of locators
* (cross-section record links) rather than a scalar or text value.
*
* Responsibilities
* ----------------
* - Owns the locator lifecycle: validate, deduplicate, add, remove, normalize, import.
* - Resolves grid/export values by instantiating target-section child components per
*   locator and merging their output atoms (the ddo_map drives which child columns appear).
* - Propagates project (component_filter) data to newly created child records.
* - Provides a static registry of all relation component model names
*   (get_components_with_relations) used by section export, search, and grid rendering.
* - Feeds the diffusion pipeline (get_diffusion_data) and the import pipeline
*   (conform_import_data) with locator-shaped data.
* - Supports request-config section-tipo resolution from ontology properties
*   (get_request_config_section_tipo) covering 'self', 'hierarchy_types',
*   'field_value', 'hierarchy_terms', 'ontology_sections', and 'section' sources.
*
* Data shape
* ----------
* The component dato is stored in the 'relation' column of the matrix table as a
* JSON array of locator objects. Each locator object minimally has:
*   { section_tipo, section_id, type, from_component_tipo }
* Translatable relation components also carry a 'lang' key.
* 'id' is an optional stable item id used for dataframe pairing and ordering.
*
* Relation types (constants in core/base/dd_tipos.php)
* --------------------------
* DEDALO_RELATION_TYPE_LINK                     = 'dd151'  — generic portal link
* DEDALO_RELATION_TYPE_CHILDREN_TIPO            = 'dd48'   — hierarchy child
* DEDALO_RELATION_TYPE_PARENT_TIPO              = 'dd47'   — hierarchy parent
* DEDALO_RELATION_TYPE_RELATED_TIPO             = 'dd89'   — related record
* DEDALO_RELATION_TYPE_FILTER                   = 'dd675'  — project/access filter
* DEDALO_RELATION_TYPE_RELATED_UNIDIRECTIONAL_TIPO     = 'dd620' — one-way related
* DEDALO_RELATION_TYPE_RELATED_BIDIRECTIONAL_TIPO      = 'dd467' — bidirectional
* DEDALO_RELATION_TYPE_RELATED_MULTIDIRECTIONAL_TIPO   = 'dd621' — multidirectional
*
* Inheritance
* -----------
* Extends component_common.
* Extended by: component_autocomplete, component_autocomplete_hi,
*   component_check_box, component_filter, component_filter_master,
*   component_portal, component_publication, component_radio_button,
*   component_relation_children, component_relation_index,
*   component_relation_model, component_relation_parent,
*   component_relation_related, component_relation_struct,
*   component_select, component_select_lang, component_inverse,
*   component_dataframe.
*
* Uses traits: search_component_relation_common (SQL search over the
*   'relation' JSONB column), search_component_relation_common_tm
*   (thesaurus-matrix variant).
*
* @package Dédalo
* @subpackage Core
*/
class component_relation_common extends component_common {



	// traits. Files added to current class file to split the large code.
	use search_component_relation_common;
	use search_component_relation_common_tm;


	/**
	* CLASS VARS
	*/
		/**
		 * Whether to propagate component locators to the relation table on save.
		 * Set to false to skip relation persistence (e.g., bulk imports such as geonames
		 * that insert millions of records where the overhead is unacceptable).
		 * @var bool $save_to_database_relations
		 */
		public bool $save_to_database_relations = true;

		/**
		 * Tipo that identifies the kind of locator stored in this component's dato.
		 * Initialised in __construct from properties->config_relation->relation_type,
		 * falling back to $default_relation_type defined by each concrete subclass.
		 * Controls validate_data_element type assignment and remove_locator_from_data
		 * type-mismatch checks.
		 * Examples: DEDALO_RELATION_TYPE_LINK ('dd151'),
		 *           DEDALO_RELATION_TYPE_RELATED_TIPO ('dd89').
		 * @var ?string $relation_type
		 */
		protected ?string $relation_type = null;

		/**
		 * Directionality tipo stored inside every locator of the component dato.
		 * Only set by component_relation_related; other subclasses leave it null.
		 * Initialised from properties->config_relation->relation_type_rel or
		 * $default_relation_type_rel.
		 * Examples: DEDALO_RELATION_TYPE_RELATED_UNIDIRECTIONAL_TIPO ('dd620'),
		 *           DEDALO_RELATION_TYPE_RELATED_BIDIRECTIONAL_TIPO ('dd467'),
		 *           DEDALO_RELATION_TYPE_RELATED_MULTIDIRECTIONAL_TIPO ('dd621').
		 * @var ?string $relation_type_rel
		 */
		protected ?string $relation_type_rel = null;

		/**
		 * List of section tipos that this relation component may link to.
		 * Populated by get_ar_target_section_tipo (component_common) from the ontology
		 * request_config. Used by autocomplete / portal to restrict search results and
		 * by conform_import_data when the column name has no explicit target suffix.
		 * @var array $ar_target_section_tipo
		 */
		protected array $ar_target_section_tipo = [];

		/**
		 * When true, each locator stored in this component is rendered as a separate
		 * column group in tabular list/export layouts (portal-inside-portal case).
		 * Set dynamically in get_grid_value when a child component is itself a
		 * relation component, so its rows are exploded sideways rather than stacked.
		 * @var bool $sub_columns_division
		 */
		protected bool $sub_columns_division = false;

		/**
		 * Fallback $relation_type value used when the ontology properties do not
		 * specify config_relation->relation_type. Subclasses override this constant
		 * to establish their canonical locator type without requiring per-record
		 * ontology config.
		 * @var ?string $default_relation_type
		 */
		protected ?string $default_relation_type = null;

		/**
		 * Fallback $relation_type_rel value used when the ontology properties do not
		 * specify config_relation->relation_type_rel. Meaningful only for
		 * component_relation_related subclass.
		 * @var ?string $default_relation_type_rel
		 */
		protected ?string $default_relation_type_rel = null;

		/**
		 * Diffusion output format map (overrides parent default).
		 * Relation dato (an array of locators) is serialised as JSON when written to
		 * SQL diffusion targets, rather than the plain-text format text components use.
		 * @var array $diffusion_output_format
		 */
		public static array $diffusion_output_format = ['sql' => 'json'];

		/**
		 * O(1) duplicate guard for validate_data_element.
		 * Keys are hash strings produced by locator::build_locator_lookup_key()
		 * over the properties returned by get_locator_properties_to_check().
		 * Rebuilt at the start of each validate_data_element call when $init===true.
		 * @var array $locator_lookup_map
		 */
		protected array $locator_lookup_map = [];

		/**
		 * Class-static cache for get_hierarchy_sections_from_types().
		 * Key: implode('_', $hierarchy_types). Value: array of section tipos.
		 * Avoids repeated search/ontology traversal within a single request lifecycle.
		 * @var array $hierarchy_sections_from_types_cache
		 */
		public static array $hierarchy_sections_from_types_cache = [];



	/**
	* __CONSTRUCT
	* Initialises the relation component, enforcing language and loading relation
	* type configuration from the ontology before delegating to parent.
	*
	* Language normalisation:
	*   - Translatable components: blank lang → DEDALO_DATA_LANG; DEDALO_DATA_NOLAN → forced
	*     to DEDALO_DATA_LANG (with error log, as NOLAN is invalid for translatable types).
	*   - Non-translatable components: blank lang → DEDALO_DATA_NOLAN; any non-NOLAN
	*     value is silently coerced to DEDALO_DATA_NOLAN.
	*
	* Relation config is read from ontology_node::get_properties()->config_relation and
	* falls back to the subclass defaults ($default_relation_type, $default_relation_type_rel).
	*
	* @param string $tipo          Component tipo identifier (e.g. 'rsc92').
	* @param mixed $section_id = null  Record id in the host section matrix.
	* @param string $mode = 'list'     Rendering mode ('list', 'edit', …).
	* @param string $lang = DEDALO_DATA_LANG  Requested language code.
	* @param ?string $section_tipo = null  Host section tipo.
	* @param bool $cache = true     Pass through to parent instance cache.
	* @return void
	*/
	protected function __construct( string $tipo, mixed $section_id=null, string $mode='list', string $lang=DEDALO_DATA_LANG, ?string $section_tipo=null, bool $cache=true ) {

		// lang. translatable conditioned
			$translatable = ontology_node::get_translatable($tipo);
			if ($translatable===true) {
				if (empty($lang)) {
					$lang = DEDALO_DATA_LANG;
				}else{
					if ($lang===DEDALO_DATA_NOLAN) {
						debug_log(__METHOD__
							." Changed component wrong lang [TRANSLATABLE $section_tipo - $tipo] from $lang to ".DEDALO_DATA_LANG
							, logger::ERROR
						);
						$lang = DEDALO_DATA_LANG;
					}
				}
			}else{
				if (empty($lang)) {
					$lang = DEDALO_DATA_NOLAN;
				}else{
					if ($lang!==DEDALO_DATA_NOLAN) {
						// debug_log(__METHOD__." Changed component wrong lang [NON TRANSLATABLE $section_tipo - $tipo] from $lang to ".DEDALO_DATA_NOLAN, logger::ERROR);
						// $bt = debug_backtrace()[1]; dump($bt, ' bt ++ '.to_string());
						$lang = DEDALO_DATA_NOLAN;
					}
				}
			}

		// relation config . Set current component relation_type and relation_type_rel based on properties config
			$ontology_node	= ontology_node::get_instance($tipo);
			$properties		= $ontology_node->get_properties();

			// relation_type
				$this->relation_type = isset($properties->config_relation->relation_type)
					? $properties->config_relation->relation_type
					: $this->default_relation_type;

			// relation_type_rel
				$this->relation_type_rel = isset($properties->config_relation->relation_type_rel)
					? $properties->config_relation->relation_type_rel
					: $this->default_relation_type_rel;

		// Build the component normally
			parent::__construct($tipo, $section_id, $mode, $lang, $section_tipo, $cache);
	}//end __construct



	/**
	* GET_COMPONENTS_WITH_RELATIONS
	* Canonical registry of every component model that stores locator arrays as its dato.
	* All models in this list extend component_relation_common and write to the 'relation'
	* matrix column. Used by:
	*   - section export / flat-table to distinguish column types.
	*   - get_grid_value / get_export_value to decide whether a child component requires
	*     sub_columns_division (portal-inside-portal explosion).
	*   - sort_data_by_column to trigger build_request_config on child instances.
	*
	* (!) Keep this list in sync when adding a new relation component model.
	* @return array $components_with_relations
	*/
	public static function get_components_with_relations() : array {

		$components_with_relations = [
			'component_autocomplete',
			'component_autocomplete_hi',
			'component_check_box',
			'component_filter',
			'component_filter_master',
			'component_portal',
			'component_publication',
			'component_radio_button',
			'component_relation_children',
			'component_relation_index',
			'component_relation_model',
			'component_relation_parent',
			'component_relation_related',
			'component_relation_struct',
			'component_select',
			'component_select_lang',
			'component_inverse',
			'component_dataframe',
		];

		return $components_with_relations;
	}//end get_components_with_relations



	/**
	* GET_GRID_VALUE
	* Builds the dd_grid_cell_object for this relation component in list/grid contexts.
	*
	* The method iterates over the component's stored locator array and, for each
	* locator, resolves the ddo_direct_children from the ddo_map (the sub-columns
	* requested by the caller) by instantiating the corresponding child components
	* in the target section.  Child components are injected with a built request_config
	* when they have their own ddo descendants so that their own get_grid_value can
	* resolve the next level.
	*
	* Column identity / deduplication:
	*   The column_obj.id is composed by concatenating the parent component path with
	*   the target section_tipo and component_tipo of each ddo, and optionally appended
	*   with '|{current_key}' when sub_columns_division is active (portal-inside-portal
	*   explosion).  Columns are merged into ar_columns_obj without duplicate ids; new
	*   columns from inner portals are inserted after the last entry sharing the same
	*   column_obj.group.
	*
	* Caching:
	*   A child component whose ddo has no further descendants is cached (use_cache=true).
	*   A child that has its own ddo sub-chain receives an injected request_config and
	*   must NOT be cached because different locators mutate its instance's state.
	*
	* component_relation_index special case:
	*   If the caller class is component_relation_index AND ddo_direct_children is empty,
	*   the ddo_map is computed on the fly from the target section's own relation_list
	*   request_config, including a synthetic ddo_section_id element.
	*
	* @param object|null $ddo = null  The caller ddo with optional overrides
	*   (fields_separator, records_separator, format_columns, class_list).
	* @return dd_grid_cell_object  Typed column cell containing nested row/cell arrays.
	*/
	public function get_grid_value( ?object $ddo=null ) : dd_grid_cell_object {

		// ddo customs
			$fields_separator	= $ddo?->fields_separator ?? null;
			$records_separator	= $ddo?->records_separator ?? null;
			$format_columns		= $ddo?->format_columns ?? null;
			$class_list			= $ddo?->class_list ?? null;

		// data
			$data = $this->get_data() ?? [];

		// set the label of the component as column label
			$label = $this->get_label();

		// request_config. Get/build the request_config of the component
		// the caller can built a request_config that will used instead the default request_config
			$request_config = isset($this->request_config)
				? $this->request_config
				: $this->build_request_config();

		// get the correct rqo (use only the dedalo api_engine)
			$dedalo_request_config = array_find($request_config, function($el){
				return $el->api_engine==='dedalo';
			});

		// ddo_map. Get the ddo_map to be used to create the components related to the portal
			$ddo_map = is_object($dedalo_request_config) && isset($dedalo_request_config->show)
				? ($dedalo_request_config->show->ddo_map ?? [])
				: [];

		// short vars
			$ar_cells				= [];
			$ar_columns_obj			= [];
			$sub_row_count			= 0;
			// $sub_column_count	= null;
			// the column_object could be injected for the caller or build new one

		// column_obj
			$column_obj = $this->column_obj ?? (object)[
				'id' => $this->section_tipo.'_'.$this->tipo
			];

		// children_recursive function, get all ddo chain that depends of this component
		// Defined as a global function (guarded by function_exists) because it is called
		// recursively from within itself and cannot close over $this.  The export path
		// uses get_export_ddo_descendants() instead, which is a proper instance method.
			if (!function_exists('get_children_recursive')) {
				function get_children_recursive($ar_ddo, $dd_object) {
					$ar_children = [];

					foreach ($ar_ddo as $ddo) {
						if($ddo->parent===$dd_object->tipo) {
							$ar_children[] = $ddo;
							$result = get_children_recursive($ar_ddo, $ddo);
							if (!empty($result)) {
								$ar_children = [...$ar_children, ...$result];
							}
						}
					}
					return $ar_children;
				}
			}

		// ddo_direct_children. Only the ddo items whose parent matches this component's tipo.
		// Child ddos whose parent is another ddo are handled when that ddo is instantiated
		// and calls get_grid_value on the child portal/relation component.
			$ddo_direct_children = array_filter($ddo_map, function($el){
				return $el->parent === $this->tipo;
			});
			if (empty($ddo_direct_children)) {
				debug_log(__METHOD__
					. " WARNING! Empty ddo_direct_children for tipo: $this->tipo" .PHP_EOL
					. 'ddo: ' . to_string($ddo) .PHP_EOL
					. 'ddo_map: ' . to_string($ddo_map) .PHP_EOL
					. 'tipo: ' . to_string($this->tipo)
					, logger::WARNING
				);
			}

		$components_with_relations = component_relation_common::get_components_with_relations();

		foreach($data as $current_key => $locator) {

			if(empty($locator) || !isset($locator->section_tipo)) {
				debug_log(__METHOD__
					. ' Ignored empty or invalid locator' . PHP_EOL
					. ' locator: ' . json_encode($locator) . PHP_EOL
					. ' data:' . json_encode($data, JSON_PRETTY_PRINT)
					, logger::ERROR
				);
				continue;
			}

			// check locator target section is valid
			// Validates old data without active TLD
				$tipo_is_valid = ontology_utils::check_tipo_is_valid($locator->section_tipo);
				if (!$tipo_is_valid) {
					debug_log(__METHOD__
						. " Ignored locator with invalid target section. Install the missing TLD (".get_tld_from_tipo($locator->section_tipo).") or remove this locator from data " . PHP_EOL
						. ' section_tipo: ' . to_string($locator->section_tipo) . PHP_EOL
						. ' locator: ' . to_string($locator)
						, logger::ERROR
					);
					continue;
				}

			// component_relation_index case, it doesn't has request_config and it's necessary calculate it
			// get the locator to build pointed section and get his request config of relation_list.
			// if($this->model==='dd432' && empty($ddo_direct_children)) {
			if (get_called_class()==='component_relation_index' && empty($ddo_direct_children)) {

				$datum		= $this->get_section_datum_from_locator($locator);
				$context	= $datum->context ?? [];

				$section_context = array_find($context, function($el) use ($locator){
					return $el->section_tipo === $locator->section_tipo;
				}) ?? (object)['request_config'=>[]];

				// get the correct rqo (use only the dedalo api_engine)
				$dd_request_config = array_find($section_context->request_config ?? [], function($el){
					return $el->api_engine==='dedalo';
				});

				// section_id_tipo
				$ar_section_id_tipo	= section::get_ar_children_tipo_by_model_name_in_section(
					$locator->section_tipo,
					['component_section_id'],
					true, // bool from cache
					true, // bool resolve_virtual
					true, // bool recursive
					true // search_exact
				);
				$section_id_tipo = reset($ar_section_id_tipo);

				$ddo_section_id = new dd_object();
					$ddo_section_id->set_tipo($section_id_tipo);
					$ddo_section_id->set_section_tipo($locator->section_tipo);
					$ddo_section_id->set_parent($this->tipo);

				// ddo_map. Get the ddo_map to be used to create the components related to the portal
				$current_ddo_map = is_object($dd_request_config) && isset($dd_request_config->show)
					? ($dd_request_config->show->ddo_map ?? [])
					: [];
				$ddo_map = [$ddo_section_id, ...$current_ddo_map];
				$ddo_direct_children = array_filter($ddo_map, function($el){
					return $el->parent === $this->tipo;
				});
			}

			$locator_column_obj	= [];
			$ar_columns			= [];
			foreach ($ddo_direct_children as $ddo) {

				// model check
				if (!isset($ddo->model)) {
					$ddo->model = ontology_node::get_model_by_tipo($ddo->tipo,true);
					debug_log(__METHOD__
						. " ddo without model ! Added calculated model: $ddo->model" . PHP_EOL
						. ' ddo: ' . to_string($ddo) . PHP_EOL
						. ' bt[1]: ' . to_string( debug_backtrace()[1] )
						, logger::WARNING
					);
				}
				if (empty($ddo->model)) {
					debug_log(__METHOD__
						. " Ignored non existing ddo element (model is empty). Maybe the TLD is not installed " . PHP_EOL
						. ' tipo: ' . to_string($ddo->tipo) . PHP_EOL
						. ' ddo: ' . to_string($ddo) . PHP_EOL
						, logger::WARNING
					);
					continue;
				}

				// get the ddo path for inject to the next component level resolution.
				$sub_ddo_map = get_children_recursive($ddo_map, $ddo);

				// Cache eligibility.
				// A child that has its own ddo descendants receives an injected request_config
				// (set just below) which mutates the memoised instance on the fly. If that
				// instance were cached and later reused for a different locator row, the stale
				// injected request_config would produce wrong column output.
				// Rule: leaf ddos (no sub-chain) → use cache; non-leaf ddos → skip cache.
				//
				// Example — safe to cache (leaf portal):
				//   [{section_tipo:"rsc197", tipo:"rsc92", model:"component_portal"}]
				// Example — NOT safe to cache (portal has a sub-ddo for a child column):
				//   [{tipo:"rsc92"}, {tipo:"hierarchy26", parent:"rsc92"}]
				//   → rsc92's cache entry would contain the injected hierarchy26 request_config.
				$use_cache = empty($sub_ddo_map) ? true : false;

				// don't used need to be changed the way that components get its instances
				// will be used to add id_variant to the instance to improve the cache. 11-03-2025
				// if( !empty($sub_ddo_map) ){
				// 	// get ddo_map_id
				// 	$ddo_map_id = $this->get_ddo_map_id($ddo_map);
				// }

				// section_tipo normalisation.
				// Some autocomplete ddos carry an array of section tipos (toponymy search
				// spans multiple hierarchy sections). We take the first to build paths and
				// instantiate the component; the stored locator->section_tipo is always a
				// single string.
				$tmp_section_tipo 		= $ddo->section_tipo;
				$ddo_section_tipo		= is_array($tmp_section_tipo) ? reset($tmp_section_tipo) : $tmp_section_tipo;
				$locator->section_tipo	= $locator->section_tipo ?? $ddo_section_tipo;
				// set the path that will be used to create the column_obj id
				$current_path			= $locator->section_tipo.'_'.$ddo->tipo;
				$translatable			= ontology_node::get_translatable($ddo->tipo);
				// caller_dataframe. Dataframe columns live in the SAME section as the portal
				// (they annotate a locator, not a linked record), so they are keyed by the
				// locator id (the stable item id assigned at locator creation time).
				// The caller_dataframe object is passed to get_instance so that
				// component_dataframe can select the correct row from its json dato.
				// Unified pairing: the key is the main data item id (locator->id).
				$caller_dataframe 		= ($ddo->model === 'component_dataframe')
					? (object)[
						'section_tipo'			=> is_array($ddo->section_tipo) ? reset($ddo->section_tipo) : $ddo->section_tipo,
						'id_key'				=> $locator->id ?? null,
						'main_component_tipo'	=> $locator->main_component_tipo ?? $this->tipo
					  ]
					: null;
				$current_lang			= $translatable===true ? DEDALO_DATA_LANG : DEDALO_DATA_NOLAN;
				$component_model		= ontology_node::get_model_by_tipo($ddo->tipo,true);
				// create the component with the ddo definition
				// dataframe case: the data of the component_dataframe is inside the same section than the caller, so, his section_tipo and section_id need to be the same as the main component
				$current_component		= component_common::get_instance(
					$component_model,
					$ddo->tipo,
					($ddo->model === 'component_dataframe')
						? $this->section_id
						: $locator->section_id,
					$this->mode,
					$current_lang,
					($ddo->model === 'component_dataframe')
						? $this->section_tipo
						: $locator->section_tipo,
					$use_cache,
					$caller_dataframe
				);

				// set the locator to the new component, it will used in the next loop
				$current_component->set_locator($this->locator);

				// set the caller class name of the portal (who instantiate the portal) to the new component. as 'tool_export', 'tool_publication' etc.
				$current_component->set_caller($this->caller);

				// if the component has sub_ddo, create the request_config to be injected to component
				// the request_config will be used instead the default request_config.
				if (!empty($sub_ddo_map)) {

					$show = new stdClass();
						$show->ddo_map = $sub_ddo_map;

					$request_config = new stdClass();
						$request_config->api_engine	= 'dedalo';
						$request_config->type		= 'main';
						$request_config->show		= $show;

					$current_component->request_config = [$request_config];
				}

				// if the component it's a relation component, set the sub_columns_division to true, it will be test in the next loop
				if (in_array($component_model, $components_with_relations)) {
					$current_component->sub_columns_division = true;
				}
				//if the component it's a relation component check if the component has sub_columns_division (it could have been set by the previous loop)
				// if true, add the locator position to the column_path
				if(isset($this->sub_columns_division) && $this->sub_columns_division===true && $current_key>0){
					$current_path = $current_path.'|'.$current_key;
				}
				// create the new column obj id getting the previous id and add the new path
				// it will set to the column_obj for the next loop
				$current_column_obj = new stdClass();
					$current_column_obj->id		= $column_obj->id.'_'.$current_path;
					$current_column_obj->group	= $column_obj->id.'_'.$locator->section_tipo;
				$current_component->column_obj = $current_column_obj;

				// get the value and fallback_value of the component and stored to be joined
				$current_column		= $current_component->get_grid_value($ddo);
				$sub_row_count		= $current_column->row_count ?? 0;
				// if (in_array($component_model, $components_with_relations)) {
				// 	$current_column = get_last_column_recursive([$current_column]);
				// }
				// get the value and fallback_value of the component and stored to be joined
				$locator_column_obj	= [...$locator_column_obj, ...$current_column->ar_columns_obj];

				// store the columns into the full columns array
				$ar_columns[] = $current_column;
			}//end foreach ($ddo_direct_children as $ddo)

			// Row vs column layout decision.
			// When sub_columns_division is true (this component is a portal child of another
			// portal, set by the outer portal's loop above) or when section_id is null
			// (no specific record; column-header mode), multiple locators are placed side by
			// side as columns instead of stacked as rows.  Otherwise each locator gets a 'row'
			// wrapper, and they stack vertically in the grid.
			if(isset($this->sub_columns_division) && $this->sub_columns_division || $this->section_id === null){
				$ar_cells = [...$ar_cells, ...$ar_columns];
			}else{
				//create the row of the portal for the main locator only
				$grid_row = new dd_grid_cell_object();
					$grid_row->set_type('row');
					$grid_row->set_value($ar_columns);
				// store the current column with all values
					$ar_cells[] = $grid_row;
			}

			// Column header deduplication and ordering.
			// ar_columns_obj accumulates the unique column_obj descriptors across all
			// locators.  When a portal contains multiple locators that each introduce new
			// columns (portal-inside-portal, e.g., photograph→name, photograph→surname for
			// each photograph), new columns are inserted immediately AFTER the last column
			// sharing the same group id (the locator's section_tipo), so the output reads:
			//   name | surname | name|1 | surname|1 | name|2 | surname|2 …
			// New column ids contain a '|' separator with the locator key index.
			foreach ($locator_column_obj as $column_pos => $current_column_obj) {
				/** @var object $current_column_obj */
				if (!is_object($current_column_obj)) continue;

				// check if the current column exists in the full column array
				$id_obj = array_find($ar_columns_obj, function($el) use($current_column_obj){
					return (is_object($el) && $el->id===$current_column_obj->id);
				});

				// if not exist we need add it, the columns are joined from the deep of the portals to the parents
				if($id_obj===null){
					// check if the current column_id is a locator column, else add the column_object at the end
					$current_column_path = explode('|', (string)$current_column_obj->id);
					if(isset($this->sub_columns_division) && $this->sub_columns_division===true && $current_key>0 || sizeof($current_column_path)>1){
						// get the last position of the column group
						$position = false;
						foreach ($ar_columns_obj as $column_key => $column_value) {
							/** @var object $column_value */
							if(is_object($column_value) && $column_value->group === $current_column_obj->group){
								$position = $column_key;
							}
						}
						// if the position is set, insert the columns after the last column_object found
						// if not add the current column_object at the end
						if($position){
							array_splice($ar_columns_obj, $position+1, 0, [$current_column_obj]);
						}else{
							$ar_columns_obj[] = $current_column_obj;
						}
					}else{
						$ar_columns_obj[] = $current_column_obj;
					}
				}
			}//end foreach ($locator_column_obj as $column_pos => $current_column_obj)
		}//end foreach($data as $current_key => $locator)

		// get the total of locators of the data, it will be use to render the rows separated.
			$locator_count	= sizeof($data);
			$row_count		= max ($locator_count, $sub_row_count);
			if($row_count === 0){
				$row_count = 1;
			}
		// get the total of columns
			$column_count = sizeof($ar_columns_obj);

		// set the separator text that will be used to render the column
		// separator will be the "glue" to join data in the client and can be set by caller or could be defined in preferences of the component.
			$properties = $this->get_properties();

			$fields_separator = isset($fields_separator)
				? $fields_separator
				: (isset($dedalo_request_config->show->fields_separator)
					? $dedalo_request_config->show->fields_separator
					: (isset($properties->fields_separator)
						? $properties->fields_separator
						: ', '));

			$records_separator = isset($records_separator)
				? $records_separator
				: (isset($dedalo_request_config->show->records_separator)
					? $dedalo_request_config->show->records_separator
					: (isset($properties->records_separator)
						? $properties->records_separator
						: ' | '));

		// value object (dd_grid_cell_object)
			$dd_grid_cell_object = new dd_grid_cell_object();
				$dd_grid_cell_object->set_type('column');
				$dd_grid_cell_object->set_row_count($row_count);
				$dd_grid_cell_object->set_column_count($column_count);
				$dd_grid_cell_object->set_label($label);
				$dd_grid_cell_object->set_ar_columns_obj($ar_columns_obj);
				if(isset($class_list)){
					$dd_grid_cell_object->set_class_list($class_list);
				}
				$dd_grid_cell_object->set_fields_separator($fields_separator);
				$dd_grid_cell_object->set_records_separator($records_separator);
				$dd_grid_cell_object->set_value($ar_cells); // array
				$dd_grid_cell_object->set_model(get_called_class());


		return $dd_grid_cell_object;
	}//end get_grid_value



	/**
	* GET_EXPORT_VALUE
	* Atoms-based export contract — counterpart of get_grid_value for the export pipeline.
	*
	* For every locator in the dato and every direct ddo child of this component in the
	* ddo_map, a child component is instantiated in the target section and its atoms
	* (export_atom objects) are merged into the returned export_value.  The recursion
	* is driven by passing a descend()ed export_context down the chain.
	*
	* Key differences from get_grid_value:
	*   - sub_columns_division and column_obj injection are NOT applied; row/column
	*     explosion is the tabulator's responsibility at render time.
	*   - ddo_map travels through export_context rather than being injected as a
	*     request_config onto the component instance.
	*   - The value_with_parents flag on the context triggers an additional atom
	*     per locator containing the ancestor chain (' > ' joined), useful for
	*     export tools that need the full hierarchy path alongside the value.
	*
	* Locator validation mirrors get_grid_value: empty/invalid locators and locators
	* pointing to inactive TLDs are skipped with an ERROR log entry.
	*
	* component_relation_index hook: the protected resolve_export_ddo_children() method
	* is called per locator; the base implementation is a no-op pass-through, but
	* component_relation_index overrides it to compute its ddo_map dynamically from the
	* target section's relation_list config.
	*
	* @param export_context|null $context = null  Carries path_prefix, ddo_map,
	*   item_index, item_section_id, and value_with_parents from the caller.
	* @return export_value  Flat collection of export_atom objects.
	*/
	public function get_export_value( ?export_context $context=null ) : export_value {

		$context = $context ?? new export_context();

		// request_config. The component own default; the legacy injected
		// request_config is replaced by context->ddo_map
			$request_config = isset($this->request_config)
				? $this->request_config
				: $this->build_request_config();
			$dedalo_request_config = array_find($request_config, function($el){
				return $el->api_engine==='dedalo';
			});

		// ddo_map. Export injection (context) wins, else the component default
			$ddo_map = !empty($context->ddo_map)
				? $context->ddo_map
				: (is_object($dedalo_request_config) && isset($dedalo_request_config->show)
					? ($dedalo_request_config->show->ddo_map ?? [])
					: []);

		// separators. legacy precedence: ddo > request_config->show > properties > joiner defaults
			$properties			= $this->get_properties();
			$fields_separator	= $context->ddo?->fields_separator
				?? $dedalo_request_config?->show?->fields_separator
				?? $properties?->fields_separator
				?? null;
			$records_separator	= $context->ddo?->records_separator
				?? $dedalo_request_config?->show?->records_separator
				?? $properties?->records_separator
				?? null;

		// own segment
			$own_segment = new export_path_segment($this->section_tipo, $this->tipo, (object)[
				'model'				=> $this->get_model(),
				'fields_separator'	=> $fields_separator,
				'records_separator'	=> $records_separator,
				'item_index'		=> $context->item_index,
				'section_id'		=> $context->item_section_id
			]);
			$base_path = [...$context->path_prefix, $own_segment];

		// export_value
			$export_value = new export_value([], $this->get_label(), get_called_class());

		// data. locators
			$data = $this->get_data() ?? [];

		// direct children of this component in the ddo_map
		// (component_relation_index recomputes them per locator, see hook)
			$ddo_direct_children = array_filter($ddo_map, function($el){
				return $el->parent === $this->tipo;
			});
			if (empty($ddo_direct_children) && get_called_class()!=='component_relation_index') {
				debug_log(__METHOD__
					. " WARNING! Empty ddo_direct_children for tipo: $this->tipo" .PHP_EOL
					. 'ddo_map: ' . to_string($ddo_map) .PHP_EOL
					. 'tipo: ' . to_string($this->tipo)
					, logger::WARNING
				);
			}

		foreach ($data as $current_key => $locator) {

			// locator validations (as legacy get_grid_value)
				if (empty($locator) || !isset($locator->section_tipo)) {
					debug_log(__METHOD__
						. ' Ignored empty or invalid locator' . PHP_EOL
						. ' locator: ' . json_encode($locator)
						, logger::ERROR
					);
					continue;
				}
				$tipo_is_valid = ontology_utils::check_tipo_is_valid($locator->section_tipo);
				if (!$tipo_is_valid) {
					debug_log(__METHOD__
						. " Ignored locator with invalid target section. Install the missing TLD (".get_tld_from_tipo($locator->section_tipo).") or remove this locator from data " . PHP_EOL
						. ' section_tipo: ' . to_string($locator->section_tipo) . PHP_EOL
						. ' locator: ' . to_string($locator)
						, logger::ERROR
					);
					continue;
				}

			// per-locator children resolution (component_relation_index hook)
				$resolved				= $this->resolve_export_ddo_children($ddo_map, $ddo_direct_children, $locator);
				$current_ddo_map		= $resolved->ddo_map;
				$current_ddo_children	= $resolved->ddo_direct_children;
				if (empty($current_ddo_children)) {
					continue;
				}

			foreach ($current_ddo_children as $ddo) {

				// model check (as legacy)
					if (!isset($ddo->model)) {
						$ddo->model = ontology_node::get_model_by_tipo($ddo->tipo,true);
						debug_log(__METHOD__
							. " ddo without model ! Added calculated model: $ddo->model" . PHP_EOL
							. ' ddo: ' . to_string($ddo)
							, logger::WARNING
						);
					}
					if (empty($ddo->model)) {
						debug_log(__METHOD__
							. " Ignored non existing ddo element (model is empty). Maybe the TLD is not installed " . PHP_EOL
							. ' tipo: ' . to_string($ddo->tipo)
							, logger::WARNING
						);
						continue;
					}

				// sub_ddo_map. descendant chain of this child in the ddo_map
					$sub_ddo_map = $this->get_export_ddo_descendants($current_ddo_map, $ddo);

				// cache. Children resolved deeper carry an injected ddo_map context;
				// kept disabled for them as the legacy path did (parity / perf-neutral).
				// Leaf children are cacheable.
					$use_cache = empty($sub_ddo_map);

				// the ddo can have multiple section_tipo (such as toponymy component_autocomplete)
					$tmp_section_tipo		= $ddo->section_tipo;
					$ddo_section_tipo		= is_array($tmp_section_tipo) ? reset($tmp_section_tipo) : $tmp_section_tipo;
					$locator->section_tipo	= $locator->section_tipo ?? $ddo_section_tipo;

				// lang / model
					$translatable		= ontology_node::get_translatable($ddo->tipo);
					$current_lang		= $translatable===true ? DEDALO_DATA_LANG : DEDALO_DATA_NOLAN;
					$component_model	= ontology_node::get_model_by_tipo($ddo->tipo,true);

				// if the component has a dataframe component, create his caller_dataframe to relate with the locator
				// unified pairing: the key is the main data item id (locator->id)
					$caller_dataframe = ($ddo->model === 'component_dataframe')
						? (object)[
							'section_tipo'			=> $ddo_section_tipo,
							'id_key'				=> $locator->id ?? null,
							'main_component_tipo'	=> $locator->main_component_tipo ?? $this->tipo
						  ]
						: null;

				// create the child component with the ddo definition
				// dataframe case: the data of the component_dataframe is inside the same section
				// than the caller, so his section_tipo and section_id are the caller ones
					$current_component = component_common::get_instance(
						$component_model,
						$ddo->tipo,
						($ddo->model === 'component_dataframe')
							? $this->section_id
							: $locator->section_id,
						$this->mode,
						$current_lang,
						($ddo->model === 'component_dataframe')
							? $this->section_tipo
							: $locator->section_tipo,
						$use_cache,
						$caller_dataframe
					);
					// set the locator to the new component, it will be used to know who created it
					$current_component->set_locator($this->locator);

				// child context. ddo_map and traversal position travel as arguments
					$child_context = $context->descend(
						$base_path, // array path_prefix
						$sub_ddo_map, // array sub_ddo_map
						$ddo, // object ddo
						(int)$current_key, // int item_index
						isset($locator->section_id) ? (int)$locator->section_id : null // int item_section_id
					);

				// merge the child atoms
					$export_value->merge( $current_component->get_export_value($child_context) );
			}//end foreach ($current_ddo_children as $ddo)

			// parents. Optional ancestor chain of the locator target as a
			// sibling 'parents' sub-column (export tool checkbox; mirrors the
			// list-view ddinfo value_with_parents). One atom per ancestor,
			// joined in the cell with ' > '. Targets without hierarchy
			// (no component_relation_parent data) emit nothing.
				if ($context->value_with_parents===true) {
					$ar_parents_value = component_relation_common::get_locator_value(
						$locator, // object locator
						DEDALO_DATA_LANG, // string lang
						true, // bool show_parents
						null, // array|null ar_components_related
						false // bool include_self (the term is already the main child value)
					) ?? [];

					if (!empty($ar_parents_value)) {
						$parents_segment = new export_path_segment($locator->section_tipo, $this->tipo, (object)[
							'sub_id'			=> 'parents',
							'item_index'		=> (int)$current_key,
							'section_id'		=> isset($locator->section_id) ? (int)$locator->section_id : null,
							'fields_separator'	=> ' > '
						]);
						$parents_path = [...$base_path, $parents_segment];

						$value_index = 0;
						foreach ($ar_parents_value as $parent_value) {
							if (empty($parent_value)) {
								continue;
							}
							$export_value->add_atom( new export_atom($parents_path, $parent_value, (object)[
								'value_index' => $value_index++
							]) );
						}
					}
				}
		}//end foreach ($data as $current_key => $locator)


		return $export_value;
	}//end get_export_value



	/**
	* RESOLVE_EXPORT_DDO_CHILDREN
	* Per-locator hook called inside get_export_value() before iterating ddo children.
	* The base implementation is a transparent pass-through returning the unchanged map
	* and children.  component_relation_index overrides this to compute the ddo_map
	* dynamically from the target section's relation_list request_config because
	* component_relation_index records point at arbitrary section types and have no
	* static ddo path in the export tool config.
	* @param array $ddo_map              Full ddo_map active for this export call.
	* @param array $ddo_direct_children  Pre-filtered direct children of this component.
	* @param object $locator             The locator currently being resolved.
	* @return object {ddo_map: array, ddo_direct_children: array}
	*/
	protected function resolve_export_ddo_children( array $ddo_map, array $ddo_direct_children, object $locator ) : object {

		return (object)[
			'ddo_map'				=> $ddo_map,
			'ddo_direct_children'	=> $ddo_direct_children
		];
	}//end resolve_export_ddo_children



	/**
	* GET_EXPORT_DDO_DESCENDANTS
	* Collects the full recursive descendant chain of a given ddo in the ddo_map.
	* Used by get_export_value to determine whether a child ddo has its own sub-chain
	* (and therefore must skip instance caching) and to build the sub_ddo_map passed
	* into the child's export_context.
	* Mirrors the get_children_recursive() global function used by get_grid_value.
	* @param array $ddo_map    Full flat ddo_map for the current export pass.
	* @param object $dd_object The parent ddo whose descendants are sought.
	* @return array  All descendant ddo objects in breadth-first order.
	*/
	protected function get_export_ddo_descendants( array $ddo_map, object $dd_object ) : array {

		$ar_children = [];
		foreach ($ddo_map as $ddo) {
			if ($ddo->parent===$dd_object->tipo) {
				$ar_children[] = $ddo;
				$result = $this->get_export_ddo_descendants($ddo_map, $ddo);
				if (!empty($result)) {
					$ar_children = [...$ar_children, ...$result];
				}
			}
		}

		return $ar_children;
	}//end get_export_ddo_descendants



	/**
	* GET_DATA_WITH_REFERENCES
	* Returns the effective locator list for this component, including any computed
	* inverse references that are not literally stored in the dato.
	*
	* The base implementation simply delegates to get_data().  component_relation_related
	* overrides this method to merge stored locators with dynamically computed inverse
	* references (cross-section reverse links), which is needed for search and export.
	*
	* (!) Callers that need the full logical set (e.g. set_data_external's data_from_field
	* resolution) must use this method rather than get_data() directly.
	* @return array|null  Array of locator objects, or null when the dato is empty.
	*/
	public function get_data_with_references() : ?array {

		return $this->get_data();
	}//end get_data_with_references



	/**
	* VALIDATE_DATA_ELEMENT
	* Validates, normalises, and deduplicates a single incoming locator object before
	* it is added to the component dato.
	*
	* Steps performed:
	*   1. Rejects locators missing section_id or section_tipo.
	*   2. Rejects self-referencing locators (section_tipo + section_id match host section)
	*      to prevent infinite resolution loops.
	*   3. Clones the locator to isolate it from mutations by observer components (e.g.,
	*      a component observed by another will have from_component_tipo rewritten for the
	*      observer; without cloning the original locator stored on disk would be corrupted).
	*   4. Ensures 'type' is set (falls back to $this->relation_type).
	*   5. Sets 'type_rel' for component_relation_related when missing.
	*   6. Enforces correct 'from_component_tipo' (logs a warning if it was wrong).
	*   7. Enforces correct 'lang' for translatable components.
	*   8. Strips temporary 'paginated_key' marker that must never be persisted.
	*   9. Constructs a normalised locator instance.
	*  10. Checks the O(1) lookup map for a duplicate; rejects duplicates, otherwise
	*      registers the new key.
	*
	* The lookup map is reset when $init===true (the default), which is appropriate when
	* processing a single element.  Bulk callers (e.g., set_data_raw importing a full
	* array) should call with $init===false after the first element to accumulate the map
	* across the whole array.
	*
	* @param object $data_element  The incoming locator-shaped object to validate.
	* @param bool $init = true     True → reset the lookup map before this validation.
	* @return object|false  The normalised locator object, or false if rejected.
	*/
	public function validate_data_element( object $data_element, bool $init = true ) : object|false {

		// translatable
			$translatable	= $this->ontology_node->get_is_translatable();
			$lang			= $this->get_lang();

		// Ensure all locators are properly formatted.
			$relation_type			= $this->relation_type;
			$from_component_tipo	= $this->tipo;

		// check section_id and section_tipo
		// avoid bad formed locators
			if (!isset($data_element->section_id) || !isset($data_element->section_tipo)) {
				debug_log(__METHOD__
					." IGNORED bad formed locator (empty section_id or section_tipo) [$this->section_tipo, $this->section_id, $this->tipo] ". PHP_EOL
					. ' called_class: ' . get_called_class() .PHP_EOL
					. ' data_element: '.to_string($data_element)
					, logger::ERROR
				);
				return false;
			}

		// check autoreference
		// avoid infinite loop
			if ($data_element->section_tipo===$this->section_tipo && $data_element->section_id==$this->section_id) {
				debug_log(__METHOD__
					." IGNORED autoreference --- avoid infinite loop " . PHP_EOL
					.' locator: ' . to_string($data_element)
					, logger::DEBUG
				);
				return false;
			}

		// Clone locator to prevent issues with external data or observers (modification of the original locator).
		// When the component is observed by other component, the locator is saved into the observer changed the from_component_tipo (get the component_tipo as his own from_component_tipo)
		// if the locator is not cloned, the original locator of the original component will changed with the last from_component_tipo of the observers
		// the original component will save normally but the changed locator will send to client with incorrect from_component_tipo.
			$locator_copy = clone $data_element;

		// type
			if (!isset($locator_copy->type) || empty($locator_copy->type)) {
				$locator_copy->type = $relation_type;
			}

		// Add type_rel
			if ( $this->model === 'component_relation_related' && !isset($locator_copy->type_rel) ) {
				$locator_copy->type_rel = $this->relation_type_rel;
			}

		// from_component_tipo
			if (!isset($locator_copy->from_component_tipo)) {
				$locator_copy->from_component_tipo = $from_component_tipo;
			}else if ($locator_copy->from_component_tipo!==$from_component_tipo) {
				$locator_copy->from_component_tipo = $from_component_tipo;
				debug_log(__METHOD__
					. " Fixed bad formed locator (bad from_component_tipo $locator_copy->from_component_tipo)" . PHP_EOL
					. ' source_locator: ' . to_string($data_element) . PHP_EOL
					. ' result_locator: ' . to_string($locator_copy) . PHP_EOL
					. ' called_class: ' . get_called_class()
					, logger::WARNING
				);
			}

		// lang
			if ($translatable===true) {
				if (!isset($locator_copy->lang)) {
					$locator_copy->lang = $lang;
				}else if ($locator_copy->lang!==$lang) {
					$locator_copy->lang = $lang;
					debug_log(__METHOD__
						. " Fixed bad formed locator (bad lang in translatable locator. Lang: $locator_copy->lang) ". PHP_EOL
						. ' source_locator: ' . to_string($data_element) . PHP_EOL
						. ' result_locator: ' . to_string($locator_copy) . PHP_EOL
						. ' called_class: ' . get_called_class()
						, logger::WARNING
					);
				}// end if (!isset($locator_copy->lang))
			}// end if ($translatable===true)

		// paginated_key
			if (isset($locator_copy->paginated_key)) {
				// remove temporal property paginated_key
				unset($locator_copy->paginated_key);
			}

		// normalized locator
			$normalized_locator = new locator($locator_copy);

		// Add. Check if locator already exists
		// Optimized: Build a hash key from properties to check for O(1) lookup instead of O(n) iteration

			// Build or use existing lookup map
			if (!isset($this->locator_lookup_map) || $init===true) {
				// Initialize lookup map on first use from existing component data
				$this->locator_lookup_map = [];
			}

			// Check if current locator exists using hash lookup
			$locator_properties_to_check = $this->get_locator_properties_to_check();
			$lookup_key = locator::build_locator_lookup_key($locator_copy, $locator_properties_to_check);
			$found = isset($this->locator_lookup_map[$lookup_key]);

			// Add to lookup map for future checks within this validation session
			if ($found) {
				debug_log(__METHOD__
					.' Ignored set_data of already existing locator '. PHP_EOL
					.' locator_copy: ' . to_string($locator_copy)
					, logger::WARNING
				);
				return false;
			}

		// Add to lookup map for future checks within this validation session
		$this->locator_lookup_map[$lookup_key] = true;


		return $normalized_locator;
	}//end validate_data_element



	/**
	* GET_LOCATOR_PROPERTIES_TO_CHECK
	* Returns the set of locator properties that together uniquely identify a locator
	* for duplicate detection in validate_data_element.
	*
	* Translatable relation components (where lang is stored on each locator) include
	* 'lang' in the key set so that a Spanish and an English locator to the same record
	* are considered distinct.  Non-translatable components omit 'lang'.
	*
	* 'tag_id' is included to differentiate multiple references to different named tags
	* within the same target record (used by component_text_area tagging).
	*
	* @return array  Ordered list of property names to hash via locator::build_locator_lookup_key().
	*/
	public function get_locator_properties_to_check() {

		return (ontology_node::get_translatable($this->tipo))
			? ['section_id','section_tipo','type','tag_id','lang']
			: ['section_id','section_tipo','type','tag_id'];

	}//end get_locator_properties_to_check



	/**
	* ADD_LOCATOR_TO_DATA
	* Appends a single locator to the component's in-memory dato, checking first for
	* duplicates using locator::in_array_locator().
	*
	* The data array is re-indexed (array_values) before the check so that JSON encoding
	* always produces an array, not an object (non-sequential integer keys trigger the
	* latter in json_encode).
	*
	* (!) This method updates the in-memory dato via set_data() but does NOT persist.
	* The caller is responsible for calling save() afterward.
	*
	* (!) Throws an Exception in SHOW_DEBUG mode when 'type' is missing from the locator,
	* since type is mandatory for all relation locators.
	*
	* @param object $locator  The locator to append.  Must contain at minimum: type,
	*   section_tipo, section_id, from_component_tipo.
	* @return bool  True if the locator was appended; false if rejected (empty, invalid,
	*   or duplicate).
	*/
	public function add_locator_to_data( object $locator ) : bool {

		if(empty($locator)) {
			return false;
		}

		if (!is_object($locator) || !isset($locator->type)) {
			if(SHOW_DEBUG===true) {
				throw new Exception("Error Processing Request. var 'locator' do not contains property 'type'. Type is mandatory ", 1);
			}
			debug_log(__METHOD__
				." Invalid locator is received to add. Locator was ignored (type:".gettype($locator).") " . PHP_EOL
				.' locator: ' . to_string($locator) . PHP_EOL
				.' Type is mandatory : locator->type: ' . (isset($locator->type) ? $locator->type : 'undefined')
				, logger::ERROR
			);
			return false;
		}

		// short vars
		$data	= $this->get_data() ?? [];
		$added	= false;

		// maintain array index after unset value. ! Important for encode JSON as array later (if keys are not correlatives, undesired object is created)
		$data = array_values($data);

		$object_exists = locator::in_array_locator( $locator, $data );
		if ($object_exists===false) {

			// Add to data
			array_push($data, $locator);

			$added = true;
		}else{
			debug_log(__METHOD__
				." Ignored add locator action because already exists. Tested properties: " . PHP_EOL
				.' locator: ' . json_encode($locator)
				, logger::WARNING
			);
		}

		// Updates current data
		if ($added===true) {
			$this->set_data( $data );
		}


		return $added;
	}//end add_locator_to_data



	/**
	* REMOVE_LOCATOR_FROM_DATA
	* Removes every locator from the in-memory dato that matches the given locator
	* according to the supplied property equality list.
	*
	* Type validation:
	*   - If 'type' is missing from the incoming locator it is auto-assigned from
	*     $this->relation_type (with a WARNING log).
	*   - If 'type' is present but does not match $this->relation_type the method
	*     aborts immediately and returns false.  This guards against accidentally
	*     removing a locator from the wrong component type.
	*
	* Dataframe cascade:
	*   For each removed locator, the matching dataframe row is also removed:
	*   - If the locator has an 'id' property, removal is by id (new unified pairing).
	*   - Otherwise removal is by locator object (legacy, pre-migration items).
	*
	* The default $ar_properties ('section_tipo', 'section_id', 'from_component_tipo',
	* 'type') means all locators pointing to the same target record from the same
	* component are removed.  Pass a narrower or wider set as needed.
	*
	* 'paginated_key' is always excluded from comparisons via the $ar_exclude_properties
	* argument to locator::compare_locators() to avoid mismatches in data that was saved
	* with an accidentally persisted paginated_key.
	*
	* (!) This method mutates in-memory dato only.  Callers must call save() to persist.
	* @param object $locator_to_remove  The locator whose matching entries are removed.
	* @param array $ar_properties = ['section_tipo','section_id','from_component_tipo','type']
	*   Properties compared by locator::compare_locators() for equality.
	* @return bool  True if at least one locator was removed; false otherwise.
	*/
	public function remove_locator_from_data( object $locator_to_remove, array $ar_properties=['section_tipo','section_id','from_component_tipo','type'] ) : bool {

		// empty case
			if (empty($locator_to_remove)) {
				return false;
			}

		// clone for safe modification
			$locator = clone($locator_to_remove);

		// type issues check
			if (!isset($locator->type)) {

				// fix missing locator type property
				$locator->type = $this->relation_type;

				debug_log(__METHOD__
					.' Received locator to remove, don\'t have "type". Auto-set type:'. $this->relation_type . ' to locator: ' . PHP_EOL
					.to_string($locator)
					, logger::WARNING
				);
			}elseif ($locator->type!==$this->relation_type) {
				// trigger_error("Incorrect locator type ! Expected $this->relation_type and received $locator->type. tipo:$this->tipo, section_tipo:$this->section_tipo, parent:$this->parent");
				debug_log(__METHOD__
					." Error: Incorrect locator type property! Remove action was aborted" . PHP_EOL
					.' expected: ' . $this->relation_type . PHP_EOL
					.' received: ' . $locator->type . PHP_EOL
					.' locator_to_remove: ' . to_string($locator_to_remove) . PHP_EOL
					.' model: ' . get_called_class() . PHP_EOL
					.' tipo: ' . $this->tipo . PHP_EOL
					.' section_tipo: ' . $this->section_tipo . PHP_EOL
					.' section_id: ' . $this->section_id
					, logger::ERROR
				);
				return false;
			}

		// iterate and add to new_relations only different locators
			$removed		= false;
			$new_relations	= [];
			$data			= $this->get_data();
			if (!empty($data)) {
				foreach($data as $current_locator) {

					// Test if already exists
					$equal = locator::compare_locators(
						$current_locator,
						$locator,
						$ar_properties, // array check properties
						['paginated_key'] // $ar_exclude_properties (prevent errors in accidental saved paginated_key cases)
					);
					if ($equal===true) {

						$removed = true;
						// Remove dataframe — unified pairing: cascade by the removed item id.
						if (isset($current_locator->id)) {
							$this->remove_dataframe_data_by_id( (int)$current_locator->id );
						}
					}else{

						$new_relations[] = $current_locator;
					}
				}
			}

		// Updates current data relations with clean array of locators
			if ($removed===true) {
				$this->set_data( $new_relations );
			}


		return (bool)$removed;
	}//end remove_locator_from_data



	/**
	* GET_LOCATOR_VALUE
	* Resolves a locator to one or more display string values.
	*
	* Two resolution modes depending on $ar_components_related:
	*
	* 1. $ar_components_related is provided:
	*    Each component tipo in the array is instantiated against the locator's
	*    section_id/section_tipo and get_value() is called.  Empty, whitespace-only,
	*    or '<mark></mark>' values are skipped.
	*    Use case: custom multi-field display (e.g., First name + Surname).
	*
	* 2. $ar_components_related is null (default):
	*    The primary thesaurus term is resolved via ts_object::get_term_by_locator().
	*    If $show_parents===true, the full ancestor chain is walked with
	*    component_relation_parent::get_parents_recursive() and each parent term is
	*    appended to the result.  $include_self controls whether the self-term leads
	*    the array (default true).
	*    Use case: section_map hierarchical breadcrumbs, export value_with_parents.
	*
	* Return value is an array so callers can join with a separator of their choice.
	*
	* @param object $locator                    The locator to resolve (must have section_id, section_tipo).
	* @param string $lang = DEDALO_DATA_LANG    Language for term resolution.
	* @param bool $show_parents = false         When true, ancestor terms are appended.
	* @param array|null $ar_components_related  Component tipos to resolve; null → use thesaurus term.
	* @param bool $include_self = true          When show_parents is true, include the self-term first.
	* @return array|null  Array of display strings, e.g. ['Madrid', 'Spain', 'Europe'],
	*   or null on invalid/empty locator.
	*/
	public static function get_locator_value( object $locator, string $lang=DEDALO_DATA_LANG, bool $show_parents=false, ?array $ar_components_related=null,	bool $include_self=true	) : ?array {

		// locator
			if (empty($locator) || !is_object($locator)) {
				return null;
			}
			// parse as real locator class object if needed
			if (!($locator instanceof locator)) {
				$locator = new locator($locator);
			}

		$ar_value = [];
		if(!empty($ar_components_related)){

			foreach ($ar_components_related as $component_tipo) {

				$model_name			= ontology_node::get_model_by_tipo($component_tipo, true);
				$current_component	= component_common::get_instance(
					$model_name,
					$component_tipo,
					$locator->section_id,
					'list',
					$lang,
					$locator->section_tipo
				);

				$current_value = $current_component->get_value();

				if (empty($current_value) || $current_value==='<mark></mark>' || trim($current_value)==='') continue;

				$ar_value[] = $current_value;
			}//end foreach ($ar_components_related as $component_tipo)

		}else{

			if ($show_parents===true) {

				if ($include_self===true) {
					$ar_value[] = ts_object::get_term_by_locator( $locator, $lang, true );
				}

				// parents_recursive
				$ar_parents = component_relation_parent::get_parents_recursive(
					$locator->section_id,
					$locator->section_tipo
				);
				foreach ($ar_parents as $current_locator) {

					$current_value = ts_object::get_term_by_locator( $current_locator, $lang, true );
					if (!empty($current_value)) {
						$ar_value[]  = $current_value;
					}
				}

			}else{

				$locator_value = ts_object::get_term_by_locator( $locator, $lang, true );

				$ar_value[] = $locator_value;

			}//end if ($show_parents===true)
		}


		return $ar_value;
	}//end get_locator_value



	/**
	* REMOVE_PARENT_REFERENCES
	* Removes all references to the given section from its parent records' child lists.
	* Called during section deletion to clean up dangling hierarchy back-pointers.
	*
	* For each parent locator, the corresponding component_relation_children instance
	* (resolved via from_component_tipo) is loaded, remove_me_as_your_child() is
	* called to strip the reference, and the parent section is saved immediately.
	*
	* $parents is accepted as a pre-fetched argument to avoid a second read of a
	* section record that may already have been deleted by the time this method runs.
	*
	* $filter restricts removal to only the parents whose (section_tipo, section_id)
	* appears in the filter list, which is used when a partial deletion/unlink is
	* requested rather than a full purge.
	*
	* @param string $section_tipo  Section tipo of the record being deleted.
	* @param mixed $section_id     Section id of the record being deleted.
	* @param array|null $filter    Optional array of locator objects; only parent entries
	*   matching these (section_id + section_tipo) are removed.
	* @param array|null $parents   Pre-fetched result of component_relation_parent::get_parents();
	*   if null, the method fetches them itself.
	* @return object $response  {result: bool, msg: string, ar_removed?: array}
	*/
	public static function remove_parent_references( string $section_tipo, $section_id, ?array $filter=null, ?array $parents=null ) : object {

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= '';

		// short vars - use pre-fetched parents if provided
			$parents = $parents ?? component_relation_parent::get_parents(
				$section_id,
				$section_tipo
			);

		// parents to remove
			$ar_removed=array();
			foreach ((array)$parents as $current_parent) {

				$current_component_tipo	= $current_parent->from_component_tipo;
				$current_section_tipo	= $current_parent->section_tipo;
				$current_section_id		= $current_parent->section_id;

				if (!empty($filter)) {
					// compare current with filter
					$process=false;
					foreach ($filter as $current_locator) {
						if ($current_locator->section_id==$current_section_id && $current_locator->section_tipo===$current_section_tipo) {
							$process = true; break;
						}
					}
					if(!$process) continue; // Skip current section
				}

				// Target section data
				$model_name						= ontology_node::get_model_by_tipo($current_component_tipo,true); // 'component_relation_children';
				$mode							= 'edit';
				$lang							= DEDALO_DATA_NOLAN;
				$component_relation_children	= component_common::get_instance(
					$model_name,
					$current_component_tipo,
					$current_section_id,
					$mode,
					$lang,
					$current_section_tipo
				);

				// NOTE: remove_me_as_your_child deletes current section references from component_relation_children and section->relations container
				// $removed = (bool)$component_relation_children->remove_child_and_save($child_locator);
				$removed = (bool)$component_relation_children->remove_me_as_your_child( $section_tipo, $section_id );
				if ($removed===true) {
					$component_relation_children->save();
					debug_log(__METHOD__
						." Removed references in component_relation_children ($current_section_id, $current_section_tipo) to $section_id, $section_tipo "
						, logger::DEBUG
					);
					$ar_removed[] = array(
						'section_tipo'		=> $current_section_tipo,
						'section_id'		=> $current_section_id,
						'component_tipo'	=> $current_component_tipo
					);
				}
			}//end foreach ((array)$parents as $current_parent)

		// response
			if (!empty($ar_removed)) {
				$response->result		= true;
				$response->msg			= 'Removed references: '.count($ar_removed);
				$response->ar_removed	= $ar_removed;
			}


		return $response;
	}//end remove_parent_references


	/**
	* GET_DIFFUSION_DATA
	* Resolves the diffusion value for this relation component.
	*
	* Default flow (no ddo->fn):
	*   The component's stored locator array is returned as the diffusion value.
	*   If data is empty and the model is component_relation_parent, a fallback to
	*   get_possible_root_hierarchy() is attempted for v5 thesaurus compatibility.
	*   If ddo->data_slice is set, the array is sliced to the requested offset/length
	*   before being set as the value.
	*
	* Custom function flow (ddo->fn is set):
	*   The named method is called on $this.  Three dispatch cases:
	*   - fn === 'add_parents': sets raw data as value; method result goes into meta.
	*   - method_exists($this, $fn): sets method return value directly as diffusion value.
	*   - default (diffusion_fn via __call): the method returns a full array of
	*     diffusion_data_object items that replaces the default one.
	*   Errors during invocation are caught and logged; the stub diffusion_data_object
	*   (null value) is returned on failure.
	*
	* @param object $ddo                   DDO configuration driving this diffusion element.
	*   May contain: fn (string method name), data_slice ({offset, length}), id.
	* @param ?string $diffusion_element_tipo  The tipo of the parent diffusion element.
	* @return array  Array of diffusion_data_object instances.
	* @see diffusion_chain_processor (consumes the returned diffusion_data_object items)
	* @test false
	*/
	public function get_diffusion_data( object $ddo, ?string $diffusion_element_tipo = null ) : array {

		$diffusion_data = [];

		// Default diffusion data object
		$diffusion_data_object = new diffusion_data_object( (object)[
			'tipo'			=> $this->tipo,
			'lang'			=> null,
			'value'			=> null,
			'id'			=> $ddo->id ?? null
		]);

		$diffusion_data[] = $diffusion_data_object;

		// Resolve the data by default
		// If the ddo doesn't provide any specific function the component will use a get_url as default.
		$data = $this->get_data();

		// if the ddo provides a data_slice property, use it to slice the data
		if(isset($ddo->data_slice)){
			$data = array_slice($data, $ddo->data_slice->offset, $ddo->data_slice->length);
		}

		// Try hierarchy1 resolution (v5 thesaurus compatibility)
		if (empty($data) && $this->model==='component_relation_parent') {
			$hierarchy_parent = $this->get_possible_root_hierarchy();
			if (!empty($hierarchy_parent)) {
				$data = [$hierarchy_parent];
			}
		}

		// Custom function case
			// If ddo provide a specific function to get its diffusion data
			// check if it exists and can be used by diffusion environment
			// if all is ok, use this function and return the value returned by this function
			$fn = $ddo->fn ?? null;

			if( $fn ){
				// check if the function exist
				// if not, return a null value in diffusion data
				// and stop the resolution
				if( !is_callable([$this, $fn]) ){
					debug_log(__METHOD__
						. " function doesn't exist " . PHP_EOL
						. " function name: ". $fn
						, logger::ERROR
					);

					return $diffusion_data;
				}

				// execute the function directly since it's already validated
				try {
					$fn_data = $this->$fn( $ddo, $diffusion_element_tipo );

					switch (true) {
						// add parents
						case $fn==='add_parents':
							$diffusion_data_object->set_value( $data );
							$diffusion_data_object->meta = $fn_data;

							return $diffusion_data;
						// if the function is a method of the current component
						// it will return any kind of values.
						case method_exists($this, $fn):
							$diffusion_data_object->set_value( $fn_data );

							return $diffusion_data;
						// default, diffusion_fn method loaded by common __call
						// it will return an array of diffusion_data_object
						// and the default diffusion_data_object will be replaced
						default:
							// overwrite default diffusion data
							$diffusion_data = $fn_data;
							break;
					}
				} catch (Throwable $e) {
					// fallback when method does not expect $diffusion_data_object
					debug_log(__METHOD__
						. " error executing diffusion function " . PHP_EOL
						. " function name: ". $fn . PHP_EOL
						. " error: " . $e->getMessage()
						, logger::ERROR
						);
						$fn_data = null;
				}

				// set the diffusion value and return the diffusion data
				return $diffusion_data;
			}

			$diffusion_value = !empty($data)
				? $data
				: null;

			$diffusion_data_object->set_value( $diffusion_value );


		return $diffusion_data;
	}//end get_diffusion_data



	/**
	* SET_DATO_EXTERNAL
	* Compatibility alias for set_data_external().  'dato' was the v6 naming convention;
	* callers may still use 'dato' in legacy ontology config.
	* @param object $options  Same options object as set_data_external().
	* @return bool
	*/
	public function set_dato_external( object $options ) : bool {
		return $this->set_data_external( $options );
	}



	/**
	* SET_DATA_EXTERNAL
	* Synchronises this component's locator dato against records in an external
	* section that reference the current host section.  Callers are typically
	* component_autocomplete and component_portal in observer/observed patterns.
	*
	* Three special resolution paths (short-circuit and return early):
	*
	* 1. set_observed_data (properties->source->set_observed_data):
	*    The component's data is taken directly from another component on the same
	*    section (or a function on it), replacing the current dato.  Used for cases
	*    where component_text_area tags or SVG embed locators that must be mirrored.
	*    Saves immediately and returns true.
	*
	* 2. source_overwrite (properties->source->source_overwrite):
	*    Data is copied from a field on the section pointed to by component_to_search,
	*    overwriting the current dato.  Used in tool_cataloging workflows.
	*    Saves immediately and returns true.
	*
	* 3. Normal inverse-reference search (default path):
	*    Builds a search_query_object in 'related' mode scoped to
	*    $ar_section_to_search (from properties->source->section_to_search) that
	*    filters by a locator pointing at the current host record.
	*    Optionally enriches the search locator with data from
	*    properties->source->data_from_field components.
	*    The resulting rows are merged with the existing dato preserving user order:
	*    - Locators that still exist are kept in original order.
	*    - New locators from the search are appended.
	*    - Locators whose target has been deleted are removed.
	*    Performance guards: if total > 2000 results, order preservation is skipped;
	*    if both old and new are empty, no save is triggered ($changed stays false).
	*
	* @param object $options  Configuration bag:
	*   save (bool)                → persist after updating (default false).
	*   changed (bool)             → force-treat as changed (default false).
	*   current_data (array|false) → pre-loaded dato to diff against (else reads from DB).
	*   current_dato (array|false) → legacy alias for current_data.
	*   references_limit (int)     → max rows from the inverse search (default 10).
	* @return bool  Always true (even on no-change; changed flag controls actual save).
	*/
	public function set_data_external( object $options ) : bool {
		$start_time=start_time();

		// options
			$save				= $options->save ?? false;
			$changed			= $options->changed ?? false;
			$current_data		= $options->current_data ?? $options->current_dato ?? false;
			$references_limit	= $options->references_limit ?? 10;

		// data set
			$data = ($current_data!==false)
				? $current_data
				: $this->get_data();

		// properties . get the properties for get search section and component
			$properties				= $this->get_properties();
			$ar_section_to_search	= $properties->source->section_to_search ?? null;
			$ar_component_to_search	= $properties->source->component_to_search ?? false;
			$component_to_search	= is_array($ar_component_to_search)
				? reset($ar_component_to_search)
				: $ar_component_to_search;

		// current section tipo/id
			$section_id		= $this->get_section_id();
			$section_tipo	= $this->get_section_tipo();

		// data source is got and processed from the observer field, it could need to be processed to be saved.
		// in case as component_text_area, data is in the middle of the text as svg, or person tag see: numisdata575 and numisdata197
		// in cases when the component has locators data it will save directly.
			if (isset($properties->source->set_observed_data)){
				// get the observer_data properties
				$set_observed_data = $properties->source->set_observed_data;
				foreach ($set_observed_data as $current_ddo) {

					$current_component_tipo	= $current_ddo->tipo;
					$model_name				= ontology_node::get_model_by_tipo($current_component_tipo, true);
					$is_translatable		= ontology_node::get_translatable($current_component_tipo);
					$observer_component		= component_common::get_instance(
						$model_name,
						$current_component_tipo,
						$section_id,
						'list',
						$is_translatable ? DEDALO_DATA_LANG : DEDALO_DATA_NOLAN,
						$section_tipo,
						false
					);
					if(isset($current_ddo->perform)){
						// get the locators from components literals, as component_text_area
						$function			= $current_ddo->perform->function;
						$params_definition	= $current_ddo->perform->params ?? [];
						$params = is_array($params_definition)
							? $params_definition
							: [$params_definition];

						// check function exits
							if (!method_exists($observer_component, $function)) {
								debug_log(__METHOD__
									. " An error occurred calling function - Method do not exists !  " . PHP_EOL
									. ' function: ' . to_string($function) . PHP_EOL
									. ' component_name: ' . $model_name . PHP_EOL
									. ' component_tipo: ' . $current_component_tipo
									, logger::ERROR
								);
							}

						$final_data = call_user_func_array(array($observer_component, $function), $params);

					}else{
						// get the data from components with data locators
						$final_data = $observer_component->get_data();
					}
					$this->set_data($final_data);
					debug_log(__METHOD__
						."Set observed data ($model_name - $current_component_tipo - $section_tipo - $section_id)"
						, logger::DEBUG
					);
					$this->save();
				// task done. return
					return true;

				}//end foreach
			}//end if set_observed_data


		// data source overwrite (tool cataloging case)
			if (isset($properties->source->source_overwrite) && isset($properties->source->component_to_search)) {

				// overwrite source locator
					$component_to_search_tipo	= $component_to_search; // $ar_component_to_search[0] ?? null;
					$model_name					= ontology_node::get_model_by_tipo($component_to_search_tipo, true);
					$component_to_search		= component_common::get_instance(
						$model_name,
						$component_to_search_tipo,
						$section_id,
						'list',
						DEDALO_DATA_NOLAN,
						$section_tipo
					);
					$component_to_search_data = $component_to_search->get_data();
					foreach ($component_to_search_data as $current_locator) {
						$locator = new locator();
							$locator->set_section_id($current_locator->section_id);
							$locator->set_section_tipo($current_locator->section_tipo);
							// $locator->set_from_component_tipo($component_to_search_tipo);
						break; // Only first is allowed
					}

				// get overwrite source data when exists
					if (isset($locator)) {

						$data_from_field_tipo	= $properties->source->source_overwrite->data_from_field;
						$model_name				= ontology_node::get_model_by_tipo($data_from_field_tipo, true);
						$component_overwrite	= component_common::get_instance(
							$model_name,
							$data_from_field_tipo,
							$locator->section_id,
							'list',
							DEDALO_DATA_NOLAN,
							$locator->section_tipo
						);
						$overwrite_data = $component_overwrite->get_data();

						$this->set_data($overwrite_data);
						debug_log(__METHOD__." Overwritten data ($model_name - $data_from_field_tipo - $locator->section_tipo - $locator->section_id)".to_string(), logger::DEBUG);
						$this->save();
					}

				// task done. return
					return true;
			}

		// new data
			$new_relation_locators = [];

		// default normal case
		// locator . get the locator of the current section for search in the component that call this section
			$locator = new locator();
				$locator->set_section_id($section_id);
				$locator->set_section_tipo($section_tipo);
				if($ar_component_to_search !== false){
					$locator->set_from_component_tipo($component_to_search);
				}

			$new_relation_locators[] = $locator;


		// data_from_field. get if the search need add fields data:
			if( isset($properties->source->data_from_field) ) {
				$data_from_field  = $properties->source->data_from_field;

				foreach ($data_from_field as $current_component_tipo) {
					$model_name					= ontology_node::get_model_by_tipo($current_component_tipo, true);
					$component_data_for_search	= component_common::get_instance(
						$model_name,
						$current_component_tipo,
						$locator->section_id,
						'list',
						DEDALO_DATA_NOLAN,
						$locator->section_tipo,
						false
					);
					$component_data = $component_data_for_search->get_data_with_references();

					foreach ($component_data as $current_locator) {
						$locator_data = new locator();
							$locator_data->set_section_id($current_locator->section_id);
							$locator_data->set_section_tipo($current_locator->section_tipo);
							// from_component_tipo
							$locator_data->set_from_component_tipo($component_to_search);
						$new_relation_locators[] = $locator_data;
					}
				}
			}

		// Add locator at end
		// $new_relation_locators[] = $locator;

		// get the inverse references
			// sqo. new way done in relations field with standard sqo
				$start_time2=start_time();
				$target_section_to_search = $ar_section_to_search ?? ['all'];
				$sqo = new search_query_object();
					$sqo->set_section_tipo($target_section_to_search);
					$sqo->set_mode('related'); // force use of class.search_related.php
					$sqo->set_full_count(false);
					$sqo->set_limit($references_limit); // default 0 ('ALL')
					$sqo->set_filter_by_locators($new_relation_locators);

				$search		= search::get_instance($sqo);
				$db_result	= $search->search();
				if(SHOW_DEBUG===true) {
					$total = exec_time_unit($start_time2,'ms');
					if ($total>30) {
						debug_log(__METHOD__." Search external data: $total ms".PHP_EOL.to_string($sqo), logger::DEBUG);
					}
				}

			// locators. Create a custom locator for each record
				$component_tipo = $this->get_tipo();
				$ar_result = [];
				foreach ($db_result as $row) {

					$current_locator = new locator();
						$current_locator->set_section_tipo($row->section_tipo);
						$current_locator->set_section_id($row->section_id);
						// $current_locator->set_type($inverse_section->type);
						$current_locator->set_from_component_tipo($component_tipo);

					$ar_result[] = $current_locator;
				}

			$total_ar_result	= sizeof($ar_result);
			$total_ar_data		= sizeof((array)$data);
			$final_data			= [];

			// Change detection and order-preservation logic.
			// Four cases are handled in order of cheapest to most expensive:
			if ($total_ar_result===0 && $total_ar_data===0) {
				// Both empty: nothing to do, no save needed.
				$changed = false;

			}else if ($total_ar_result===0 && $total_ar_data > 0){
				// All previously linked records have disappeared (deleted externally).
				// Mark changed so the now-empty dato gets saved.
				$changed = true;

			}else if ($total_ar_result>2000) {
				// Large result set: preserving insertion order would require an O(n²)
				// scan. Accept the new list verbatim; flag as not changed so we avoid
				// an expensive save unless the count has actually changed.
				if ($total_ar_data!==$total_ar_result) {
					$changed = false; // avoid expensive save
					$this->set_data($ar_result);
					debug_log(__METHOD__
						." Saving big result with different data (data:$total_ar_data - result:$total_ar_result) "
						, logger::DEBUG
					);
				}
			}else{
				// Normal case: walk existing data in order, keeping only entries that
				// are still present in the search result.  Then append any new entries
				// that the search returned but were not yet in data.
				// This two-pass approach preserves user-defined ordering while
				// removing deleted and adding new cross-references.
					foreach ((array)$data as $key => $current_locator) {

						$found = array_find($ar_result, function($el) use($current_locator){
							return ($el->section_id===$current_locator->section_id && $el->section_tipo===$current_locator->section_tipo);
						});
						// if (empty($found)) {
						// 	unset($data[$key]);
						// 	$changed = true;
						// 	break;
						// }
						if(!empty($found)){
							$final_data[] = $current_locator;
							$changed = true;
						}
					}

				// add new locators than was not saved in data.
					foreach ($ar_result as $current_locator) {
						if(	locator::in_array_locator( $current_locator, $final_data, $ar_properties=['section_id','section_tipo'])===false ){
							array_push($final_data, $current_locator);
							$changed = true;
						}
					}
			}//end if ($total_ar_result>2000)


		// changed true
			if ($changed===true) {
				$data = array_values($final_data);
				// foreach ($new_relation_locators as $current_locator) {

					$component_to_update = component_common::get_instance(
						get_called_class(),
						$this->tipo,
						$this->section_id,
						'list',
						DEDALO_DATA_NOLAN,
						$this->section_tipo,
						false
					);

					// set the data in all instances, included the same instance that current.
					$component_to_update->set_data($data);
					if ($save===true) {
						$component_to_update->save();
						debug_log(__METHOD__
							." Saved modified data to preserve the order - Total: $total_ar_result locators in section_id: $section_id "
							, logger::DEBUG
						);
					}

				// current_locator check
					if (!isset($current_locator)) {
						debug_log(__METHOD__
							. " Warning. current_locator is not exists. If you are deleting, is normal " . PHP_EOL
							. ' options: ' . to_string($options) . PHP_EOL
							. ' section_tipo: ' . $this->section_tipo . PHP_EOL
							. ' section_id: ' . $this->section_id . PHP_EOL
							. ' model: ' .get_class($this) . PHP_EOL
							. ' label: ' . ontology_node::get_term_by_tipo($this->tipo, DEDALO_DATA_LANG, true, true) . PHP_EOL
							. ' data: ' . to_string($data)
							, logger::WARNING
						);
					}

					// if the current section_id is the same of the current instance update the data of the current
					// else update the data of the other instances (references with the same data)
					if(isset($current_locator) && $current_locator->section_id==$this->section_id){
						$this->set_data($data);
					}
				// }//end foreach ($new_relation_locators as $current_locator)
			}//end if ($changed===true)

		// debug
			if(SHOW_DEBUG===true) {
				$total = exec_time_unit($start_time,'ms')." ms";
				debug_log(__METHOD__
					." Total time $total - $total_ar_result locators [$this->section_tipo, $this->tipo, $this->section_id] ".get_class($this) .' : '. ontology_node::get_term_by_tipo($this->tipo, DEDALO_DATA_LANG, true, true)
					, logger::DEBUG
				);
			}


		return true;
	}//end set_data_external



	/**
	* ADD_PARENTS
	* Resolves the hierarchical ancestor chain for each locator in the component dato.
	* Called as a ddo->fn diffusion function (see get_diffusion_data) when the diffusion
	* config requests enriched parent metadata alongside the raw locator data.
	*
	* For each locator in the dato:
	*   1. Validates a thesaurus scope exists for the target section (skips if not).
	*   2. Calls resolve_map_node_data() to get the item's term and typology.
	*   3. If $resolve_parent_chain is true (i.e., not the root-hierarchy fallback case),
	*      walks up with component_relation_parent::get_parents_recursive() and appends
	*      each ancestor's node data to the chain.
	*
	* The root-hierarchy fallback applies to empty-data component_relation_parent
	* components whose get_possible_root_hierarchy() returns a virtual root locator;
	* in that case the parent chain walk is suppressed (there is nothing further up).
	*
	* @return array  Map keyed by "{section_tipo}_{section_id}" of the locator target.
	*   Each value is an ordered list (self first, then ancestors) of node-data arrays:
	*   [
	*     'section_id'           => int,
	*     'section_tipo'         => string,
	*     'term'                 => array|null,   raw term dato merged across all term tipos
	*     'typology'             => array|null,   raw term dato of the typology target node
	*     'typology_section_id'  => int|null,
	*     'typology_section_tipo'=> string|null
	*   ]
	*/
	protected function add_parents() : array {

		// Track execution time for debugging/optimization
		$start_time = start_time();

		// Flag to control whether to resolve the full ancestor chain
		$resolve_parent_chain = true;

		// Map to hold results: [locator_key => [current_item, parent1, parent2, ...]]
		$parents_map = [];

		// Get current component data (usually an array of locators)
		$data = $this->get_data();

		// Fallback for empty data in hierarchy components to find root node (compatibility)
		if ( empty($data) && $this->model==='component_relation_parent') {
			$hierarchy_parent = $this->get_possible_root_hierarchy();
			if (!empty($hierarchy_parent)) {
				$data[] = $hierarchy_parent;
			}
			// Skip parent chain resolution if dealing with root fallback
			$resolve_parent_chain = false;
		}

		if (empty($data)) return $parents_map;

		// Process each relation locator item
		foreach($data as $locator) {
			// 1. Resolve current item
			$section_tipo 	= $locator->section_tipo;
			$section_id 	= (int)$locator->section_id;

			// Generate unique map key based on target section type and ID (e.g., "es1_967")
			$parents_key = $section_tipo . '_' . $section_id;

			// Chain array holds the hierarchy list for this item (starts with self)
			$parents_chain = [];

			// Chain-aware guard: skip only sections with no resolvable thesaurus scope
			if (section_map::get_scope($section_tipo, 'thesaurus')===null) {
				debug_log(__METHOD__." section_map not found for section_tipo: $section_tipo", logger::WARNING);
				continue;
			}

			// Resolve current item's descriptive data (term, typology, etc.)
			$current_item_data = $this->resolve_map_node_data($section_id, $section_tipo);

			if($current_item_data) {
				$parents_chain[] = $current_item_data;
			}

			// 2. Resolve Parents Chain (Ancestors)
			if ($resolve_parent_chain===true) {
				// Fetch recursive list of parent locators going up the tree
				$parents_locators = component_relation_parent::get_parents_recursive( $section_id, $section_tipo );
				if (!empty($parents_locators)) {
					foreach($parents_locators as $parent_locator) {

						// Resolve parent item data
						$parent_data = $this->resolve_map_node_data((int)$parent_locator->section_id, $parent_locator->section_tipo);

						if($parent_data) {
							$parents_chain[] = $parent_data;
						}
					}
				}
			}

			// Save the resolved chain for this locator in the response map
			$parents_map[$parents_key] = $parents_chain;
		}

		if(SHOW_DEBUG===true) {
			$exec_time = exec_time_unit($start_time);
			// debug_log(__METHOD__." Time: $exec_time", logger::DEBUG);
		}

		return $parents_map;
	}



	/**
	* RESOLVE_MAP_NODE_DATA
	* Resolves the raw term and typology data for a single section record, used by
	* add_parents() to build each node entry in the ancestor chain.
	*
	* Term resolution:
	*   Uses section_map::get_term_data() in 'thesaurus' scope, which returns the
	*   raw multi-lang dato merged across all term component tipos defined for the
	*   section in section_map.
	*
	* Typology resolution:
	*   The 'model' element tipo from the section_map (e.g. hierarchy27 → a
	*   component_select pointing at a typology section) is instantiated and its
	*   first stored locator is followed to retrieve the typology node's own term.
	*   The guard against missing thesaurus scope on the typology target prevents a
	*   spurious warning when the typology section has no configured term.
	*
	* Returns null if no thesaurus term tipos are defined for the section (indicates
	* an unresolvable or non-thesaurus section).
	*
	* @param int $section_id      Numeric record id of the node to resolve.
	* @param string $section_tipo Section tipo of the node.
	* @return array|null  Node data pack or null if the section has no thesaurus term.
	*   Keys: section_id, section_tipo, term, typology, typology_section_id, typology_section_tipo.
	*/
	protected function resolve_map_node_data( int $section_id, string $section_tipo ) : ?array {

		// Ensure the section_map defines a term for the thesaurus scope
		if(empty(section_map::get_term_tipos($section_tipo, 'thesaurus'))){
			debug_log(__METHOD__." thesaurus->term not found for section_tipo: $section_tipo", logger::WARNING);
			return null;
		}

		// 1. Resolve Term (raw data, merged across ALL term tipos)
		$term_value = section_map::get_term_data(
			(object)[
				'section_tipo'	=> $section_tipo,
				'section_id'	=> $section_id
			],
			'thesaurus'
		);

		// 2. Resolve Typology (Relation -> value)
		// The model tipo (e.g. hierarchy27) is usually a relation (e.g., pointing from term node to typology definition).
		// We resolve the relation, go to the related entry, and pull THAT entry's Term label.
		$typology_value			= null;
		$typology_section_id	= null;
		$typology_section_tipo	= null;

		$model_tipo			= section_map::get_first_element_tipo($section_tipo, 'model', 'thesaurus');
		$model_model_name	= !empty($model_tipo) ? ontology_node::get_model_by_tipo($model_tipo, true) : null;
		if($model_model_name) {
			$typology_component = component_common::get_instance(
				$model_model_name,
				$model_tipo,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);

			// Typology component saves related items. Fetch its relation matrix references (locators)
			$typology_data = $typology_component->get_data();

			if(!empty($typology_data) && is_array($typology_data) && isset($typology_data[0])) {
				$typology_locator 		= $typology_data[0]; // Take first relation reference
				$typology_section_id 	= $typology_locator->section_id;
				$typology_section_tipo 	= $typology_locator->section_tipo;

				// Resolve descriptive Term of the Typology node target (raw data, all term tipos).
				// Guard avoids an error log when the typology target defines no thesaurus term.
				if(!empty(section_map::get_term_tipos($typology_section_tipo, 'thesaurus'))) {
					$typology_value = section_map::get_term_data($typology_locator, 'thesaurus');
				}
			}
		}

		// Return combined description pack
		return [
			"typology_section_id"  	=> $typology_section_id,
			"typology_section_tipo"	=> $typology_section_tipo,
			"typology"             	=> $typology_value,
			"term"                 	=> $term_value,
			"section_id"           	=> $section_id,
			"section_tipo"         	=> $section_tipo
		];
	}



	/**
	* GET_RELATIONS_SEARCH_VALUE
	* Returns locators for all thesaurus ancestors of the currently stored locators,
	* to enable hierarchical search (search for a node implicitly matches all descendants).
	*
	* Only applicable to component_autocomplete_hi components (legacy model check enforced).
	* For all other models the method logs an error and returns null.
	*
	* When a component_autocomplete_hi links to thesaurus node 'Madrid', the search index
	* should also match the component when searching for 'Spain' or 'Europe'.  This method
	* computes all parent locators for each stored locator and returns them tagged with
	* the current component tipo and relation_type so they can be inserted into the
	* 'relation_search' JSONB column during save.
	*
	* @return array|null  Array of locator objects (parent chain locators), or null when
	*   not applicable (wrong model, empty dato, or component is not component_autocomplete_hi).
	*/
	public function get_relations_search_value() : ?array {
		// only for component_autocomplete_hi
			$legacy_model = ontology_node::get_legacy_model_by_tipo($this->tipo);
			if ($legacy_model!=='component_autocomplete_hi') {
				debug_log(__METHOD__
					. " Invalid call received. Only components from legacy model 'component_autocomplete_hi' are allowed to use relation search." . PHP_EOL
					. 'legacy_model: ' . to_string($legacy_model)
					, logger::ERROR
				);
				return null;
			}

		// data
			$data = $this->get_data();
			if (empty($data)) {
				return null;
			}

		// relations_search_value
			$relations_search_value = [];
			foreach ( $data as $current_locator ) {

				$section_id		= $current_locator->section_id;
				$section_tipo	= $current_locator->section_tipo;

				$parents_recursive = component_relation_parent::get_parents_recursive(
					$section_id, // string section_id
					$section_tipo // string section_tipo
				);

				foreach ($parents_recursive as $parent_locator) {

					$locator = new locator();
						$locator->set_section_tipo($parent_locator->section_tipo);
						$locator->set_section_id($parent_locator->section_id);
						$locator->set_from_component_tipo($this->tipo);
						$locator->set_type($this->relation_type); // mandatory and equal as component data relation_type

					if (!in_array($locator, $relations_search_value)) {
						$relations_search_value[] = $locator;
					}
				}
			}


		return $relations_search_value;
	}//end get_relations_search_value



	/**
	* GET_FILTER_LIST_DATA
	* Builds the data payload required to render the autocomplete filter options UI.
	* For each filter field descriptor in $filter_by_list, instantiates the component
	* and collects its context (for rendering) and its list of available values
	* (from get_list_of_values), returned as an array of objects each with keys
	* 'context' and 'datalist'.
	*
	* @param array $filter_by_list  Array of objects, each with 'section_tipo' and
	*   'component_tipo' properties describing a filterable field.
	* @return array  Array of {context: object, datalist: array} objects, one per input.
	*/
	public static function get_filter_list_data( array $filter_by_list ) : array {

		$filter_list_data = [];
		foreach ($filter_by_list as $current_obj_value) {

			$f_section_tipo   	= $current_obj_value->section_tipo;
			$f_component_tipo 	= $current_obj_value->component_tipo;

			// Calculate list values of each element
				$c_model_name 		= ontology_node::get_model_by_tipo($f_component_tipo,true);
				$current_component  = component_common::get_instance(
					$c_model_name,
					$f_component_tipo,
					null,
					'edit',
					DEDALO_DATA_LANG,
					$f_section_tipo
				);

			// get section JSON
				$get_json_options = new stdClass();
					$get_json_options->get_context	= true;
					$get_json_options->context_type	= 'simple';
					$get_json_options->get_data		= false;

				$json_data = $current_component->get_json($get_json_options);

				$filter_list = new stdClass();
					$filter_list->context	= $json_data->context[0];
					$filter_list->datalist	= $current_component->get_list_of_values(DEDALO_DATA_LANG)->result ?? [];
				$filter_list_data[] = $filter_list;
		}


		return $filter_list_data;
	}//end get_filter_list_data



	/**
	* GET_HIERARCHY_TERMS_FILTER
	* Converts an array of hierarchy term descriptors into SQO filter clauses that
	* restrict a search to records whose section_id component matches one of the
	* given term nodes (or their children when recursive===true).
	*
	* Used by get_fixed_filter() (case 'hierarchy_terms') and transitively by
	* get_request_config to build the fixed filter portion of a request config SQO.
	*
	* Each input term:
	*   - Gets its children retrieved (flat or recursive).
	*   - Maps to a filter_item {q: "id1,id2,…", path: [section_id path]} using the
	*     section's component_section_id tipo, so the final SQL can use an IN clause.
	*
	* @param array $ar_terms  Array of objects: {section_id, section_tipo, recursive: bool}.
	* @return array  Array of filter_item objects suitable for embedding in an SQO filter.
	*/
	public static function get_hierarchy_terms_filter( array $ar_terms ) : array {

		$filter = [];

		foreach ($ar_terms as $current_item) {

			$recursive = (bool)$current_item->recursive;

			// Get children
			$ar_children = $recursive===true
				? component_relation_children::get_children_recursive(
					$current_item->section_id,
					$current_item->section_tipo,
					null // string|null component_tipo
				)
				: component_relation_children::get_children(
					$current_item->section_id,
					$current_item->section_tipo,
					null // string|null component_tipo
				);
			$component_section_id_tipo = section::get_ar_children_tipo_by_model_name_in_section(
				$current_item->section_tipo, // string section_tipo
				['component_section_id'], // ar_model_name _required
				true, // bool from_cache
				true, // bool resolve_virtual
				true, // bool recursive
				true, // bool search exact
				false // ar_tipo_exclude
			);

			$path = new stdClass();
				$path->section_tipo		= $current_item->section_tipo;
				$path->component_tipo	= reset($component_section_id_tipo);
				$path->model			= 'component_section_id';
				$path->name				= 'Id';

			$ar_section_id = array_map(function($children){
				return $children->section_id;
			}, $ar_children);

			$filter_item = new stdClass();
				$filter_item->q		= implode(',', $ar_section_id);
				$filter_item->path	= [$path];

			$filter[] = $filter_item;
		}//end foreach ($ar_terms as $current_item)


		return $filter;
	}//end get_hierarchy_terms_filter



	/**
	* GET_HIERARCHY_SECTIONS_FROM_TYPES
	* Resolves the target section tipos (e.g. 'es1', 'fr1', 'us1') registered in the
	* hierarchy system (DEDALO_HIERARCHY_SECTION_TIPO = 'hierarchy1') for the given
	* type codes (e.g. [2] for Toponymy).
	*
	* A hierarchy record in hierarchy1 carries:
	*   - hierarchy4  (component_radio_button 'Active') — must be 'yes' (NUMERICAL_MATRIX_VALUE_YES).
	*   - hierarchy9  (component_select 'Typology')     — must match one of $hierarchy_types.
	*   - hierarchy53 (component_select 'Target section') — the value is the section tipo string.
	*
	* The search is executed with skip_projects_filter=true because hierarchy records
	* are global installation config, not project-scoped content.
	*
	* Results are cached in the static $hierarchy_sections_from_types_cache array keyed
	* by implode('_', $hierarchy_types) for the request lifetime.
	*
	* @param array $hierarchy_types   Array of integer type ids (as strings) that identify
	*   a hierarchy class (e.g. ['2'] for Toponymy).
	* @param string $component_tipo   The component tipo holding the target section value;
	*   defaults to DEDALO_HIERARCHY_TARGET_SECTION_TIPO ('hierarchy53').
	* @return array  Array of target section tipo strings (e.g. ['es1', 'fr1', 'on1']).
	*/
	public static function get_hierarchy_sections_from_types( array $hierarchy_types, string $component_tipo=DEDALO_HIERARCHY_TARGET_SECTION_TIPO ) : array {

		// cache
			$use_cache = true;
			if ($use_cache===true) {
				$cache_key = implode('_', $hierarchy_types);
				if (isset(self::$hierarchy_sections_from_types_cache[$cache_key])) {
					return self::$hierarchy_sections_from_types_cache[$cache_key];
				}
			}

		// short vars
			$hierarchy_section_tipo	= DEDALO_HIERARCHY_SECTION_TIPO;

		// active_filter
			$active_locator = new locator();
				$active_locator->set_section_id(NUMERICAL_MATRIX_VALUE_YES);
				$active_locator->set_section_tipo(DEDALO_SECTION_SI_NO_TIPO);
				$active_locator->set_type(DEDALO_RELATION_TYPE_LINK);
				$active_locator->set_from_component_tipo(DEDALO_HIERARCHY_ACTIVE_TIPO);

			$active_filter = '{
				"q": '.json_encode($active_locator).',
				"path": [
					{
						"section_tipo": "'.$hierarchy_section_tipo.'",
						"component_tipo": "'.DEDALO_HIERARCHY_ACTIVE_TIPO.'",
						"model": "'.ontology_node::get_model_by_tipo(DEDALO_HIERARCHY_ACTIVE_TIPO,true).'",
						"name": "Active"
					}
				]
			}';

		// typology_filter
			$typology_filter = [];
			foreach ((array)$hierarchy_types as $value) {

				$typology_locator = new locator();
					$typology_locator->set_section_id($value);
					$typology_locator->set_section_tipo(DEDALO_HIERARCHY_TYPES_SECTION_TIPO);
					$typology_locator->set_type(DEDALO_RELATION_TYPE_LINK);
					$typology_locator->set_from_component_tipo(DEDALO_HIERARCHY_TYPOLOGY_TIPO);

				$typology_filter[] = '{
					"q": '.json_encode($typology_locator).',
					"path": [
						{
							"section_tipo": "hierarchy1",
							"component_tipo": "hierarchy9",
							"model": "component_select",
							"name": "Typology"
						}
					]
				}';
			}//end foreach ((array)$hierarchy_types as $key => $value)

		// search_query_object
			$search_query_object = json_decode('
				{
					"id": "get_hierarchy_sections_from_types",
					"section_tipo": "'.$hierarchy_section_tipo.'",
					"skip_projects_filter":"true",
					"limit":0,
					"filter": {
						"$and": [
							'.$active_filter.',
							{ "$or":[
									'.implode(',', $typology_filter).'
								]
							}
						]
					}
				}
			');

		// select columns
		// get directly the component data instead all section data to improve performance
			$model = ontology_node::get_model_by_tipo($component_tipo, true);
			$column = section_record_data::get_column_name($model);
			$select = new stdClass();
				$select->key 		= $component_tipo;
				$select->column 	= $column;
			$search_query_object->select = [$select];
		// search exec
			$search		= search::get_instance($search_query_object);
			$db_result	= $search->search();

		// iterate rows
			$hierarchy_sections_from_types = [];
			foreach ($db_result as $row) {

				$result_column = $row->{$component_tipo} === null
					? null
					: json_decode($row->{$component_tipo});

				if(empty($result_column)) {
					continue;
				}

				$target_section_tipo = $result_column[0]->value ?? null;

				if (empty($target_section_tipo)) {
					debug_log(__METHOD__
						." Skipped hierarchy without target section tipo.". PHP_EOL
						.' component_tipo: '.$component_tipo . PHP_EOL
						.' row: '. to_string($row) . PHP_EOL
						.' component data: '. to_string($row->{$component_tipo})
						, logger::ERROR
					);
					continue;
				}

				$hierarchy_sections_from_types[] = $target_section_tipo;
			}//end foreach ($db_result as $row)

		// cache
			if ($use_cache===true) {
				self::$hierarchy_sections_from_types_cache[$cache_key] = $hierarchy_sections_from_types;
			}


		return $hierarchy_sections_from_types;
	}//end get_hierarchy_sections_from_types



	/**
	* GET_REQUEST_CONFIG_SECTION_TIPO
	* Resolves the effective set of section tipos that a relation component's request_config
	* should target, given a declarative source descriptor from the ontology properties.
	*
	* Source types (property format: [{source: '…', value: […]}]):
	*
	*   'self'
	*     The section tipo of the calling section (passed as $caller_section_tipo).
	*     Used by portal or autocomplete components in re-usable virtual sections that
	*     must target whichever concrete section invoked them.  Example: a toponymy
	*     component in hierarchy1 targeting 'es1', 'fr1', etc. dynamically.
	*
	*   'hierarchy_types'
	*     Delegates to get_hierarchy_sections_from_types($source_item->value) to map
	*     a type code (e.g. [2] = Toponymy) to all registered target section tipos.
	*
	*   'ontology_sections'
	*     All section tipos defined in the ontology (ontology::get_all_ontology_sections()).
	*
	*   'field_value'
	*     Reads a component in every active record of $caller_section_tipo (hierarchy1)
	*     and collects the section tipo strings stored there.  Used by
	*     component_relation_children in hierarchy to dynamically resolve the set of
	*     sections a hierarchy type may target.  Filters by active status before
	*     iterating to keep the result set small.
	*
	*   'hierarchy_terms'
	*     Collects section tipos from explicit locator objects (with section_id,
	*     section_tipo, recursive) for use as fixed filter targets.
	*
	*   'section' (default)
	*     Plain literal section tipos from $source_item->value, validated against the
	*     active TLD list (inactive TLDs are silently dropped with a WARNING log).
	*
	* String source items (legacy flat format) are accepted with a WARNING log; they
	* bypass source-based dispatch and are pushed directly into $ar_section_tipo.
	* A string 'self' triggers an ERROR because it should be expressed as an object.
	*
	* Duplicates are removed before returning; result is re-indexed.
	*
	* @param array $ar_section_tipo_sources  Declarative source descriptors from properties.
	* @param string $caller_section_tipo     The section tipo that owns the component;
	*   used for 'self' and 'field_value' resolutions.
	* @return array  Flat unique array of resolved section tipo strings.
	*/
	public static function get_request_config_section_tipo( array $ar_section_tipo_sources, string $caller_section_tipo ) : array {
		if(SHOW_DEBUG===true) {
			$start_time=start_time();
		}

		$ar_section_tipo = [];
		foreach ($ar_section_tipo_sources as $source_item) {

			// check source_item
				if (is_string($source_item)) {

					// old self section tipo properties definitions
						// if ($source_item==='self') {
						// 	$source_item = is_array($caller_section_tipo) ? reset($caller_section_tipo) : $caller_section_tipo;
						// }
						if ($source_item==='self') {
							debug_log(__METHOD__
								." Exception ERROR Processing get_request_config_section_tipo (1) invalid section_tipo format. Use an object like \"section_tipo\": [{\"source\": \"self\"}]" . PHP_EOL
								.' source_item: ' . to_string($source_item)
								, logger::ERROR
							);
							if(SHOW_DEBUG===true) {
								throw new Exception("***** Error Processing get_request_config_section_tipo (1) invalid section_tipo format
									. Use an object like \"section_tipo\": [{\"source\": \"self\"}] . ".to_string($source_item), 1);
							}
						}

					$ar_section_tipo[] = $source_item;
					debug_log(__METHOD__
						." +++ Added string source item (but expected object). Format values as {'source':'section', 'value'='hierarchy1'} ". PHP_EOL
						.' source_item: '.to_string($source_item) . PHP_EOL
						.' ar_section_tipo_sources: '.to_string($ar_section_tipo_sources) . PHP_EOL
						.' caller_section_tipo: '.to_string($caller_section_tipo)
						,logger::WARNING
					);
					continue;
				}

			// check source
				if (empty($source_item->source)) {
					debug_log(__METHOD__
						. " ++++++++++++++++++++++++++++++++++++ Ignored item with empty source ". PHP_EOL
						. ' source_item: ' . to_string($source_item)
						, logger::ERROR
					);
					continue;
				}

			switch ($source_item->source) {

				case 'self':
					// $ar_section_tipo = is_array($caller_section_tipo) ? reset($caller_section_tipo) : $caller_section_tipo;
					$ar_section_tipo = is_array($caller_section_tipo) ? $caller_section_tipo : [$caller_section_tipo];
					break;

				case 'hierarchy_types':
					$hierarchy_types = component_relation_common::get_hierarchy_sections_from_types($source_item->value);
					$ar_section_tipo = [...$ar_section_tipo, ...$hierarchy_types];
					break;

				case 'ontology_sections':
					$ontology_sections = ontology::get_all_ontology_sections();
					$ar_section_tipo = [...$ar_section_tipo, ...$ontology_sections];
					break;

				case 'field_value':
					// This case is used in component_relation_children in the hierarchy section.
					// In these case the array of sections will get from the value of specific field
					$target_values = $source_item->value ?? []; // target thesaurus like ['hierarchy53']

					// sections (all hierarchy sections -hierarchy1- normally)
					// Use here a custom SQO search to prevent projects filter
					$sqo = new search_query_object();
					$sqo->set_select([]);
					$sqo->set_section_tipo([$caller_section_tipo]);
					$sqo->set_limit(0);
					$sqo->set_offset(0);
					$sqo->set_order([]);
					$sqo->set_skip_projects_filter(true);
					// filter active only to reduce the amount of sections where to search
					// improving speed and ignoring not used (inactive) sections
					$filter = json_decode('{
						"$and": [
							{
								"q": {
									"section_tipo": "dd64",
									"section_id": "1",
									"from_component_tipo": "hierarchy4"
								},
								"q_operator": null,
								"path": [
									{
										"section_tipo": "hierarchy1",
										"component_tipo": "hierarchy4",
										"model": "component_radio_button",
										"name": "Active"
									}
								],
								"q_split": false,
								"type": "jsonb",
								"component_path": [
									"relation"
								],
								"operator": "@>",
								"q_parsed": "\'{\"hierarchy4\":[{\"section_tipo\":\"dd64\",\"section_id\":\"1\",\"from_component_tipo\":\"hierarchy4\"}]}\'"
							}
						]
					}');
					$sqo->set_filter($filter);
					$sections = sections::get_instance(
						null,
						$sqo,
						$caller_section_tipo, // caller tipo
						'list',
						DEDALO_DATA_NOLAN
					);
					$db_result = $sections->get_data();

					$total = $db_result->row_count();
					if($total > 0){
						foreach ($target_values as $current_component_tipo) {

							// short vars
							$model_name		= ontology_node::get_model_by_tipo($current_component_tipo, true);
							$current_lang	= common::get_element_lang($current_component_tipo, DEDALO_DATA_LANG);

							// data
							foreach ($db_result as $current_record) {

								// (!) do not inject section data here anytime
								// because interferes with component_relation_cildren saving

								// component
								$component = component_common::get_instance(
									$model_name,
									$current_component_tipo,
									$current_record->section_id,
									'list', // string mode
									$current_lang,// $lang=DEDALO_DATA_LANG,
									$current_record->section_tipo
								);

								$component_data = $component->get_data();
								if ( empty($component_data) ) {
									continue;
								}

								foreach ($component_data as $current_data_item) {
									$current_section_tipo = $current_data_item->value ?? null;
									if ( empty($current_section_tipo) ) {
										continue;
									}
									$section_model_name = ontology_node::get_model_by_tipo($current_section_tipo, true);
									if ( $section_model_name==='section' ) {
										$ar_section_tipo[] = $current_section_tipo;
									}else{
										debug_log(__METHOD__
											. " Target section tipo definition is ignored because is not a section or the model is undefined " . PHP_EOL
											. ' section_tipo: '. to_string($current_section_tipo) . PHP_EOL
											. ' model: ' . json_encode($section_model_name). PHP_EOL
											. ' record section_tipo: ' . to_string($current_record->section_tipo). PHP_EOL
											. ' record section_id: ' . to_string($current_record->section_id)
											, logger::WARNING
										);
									}
								}
							}//end foreach ($db_result as $current_record)
						}//end foreach ($target_values as $current_component_tipo)
					}
					break;

				case 'hierarchy_terms':
					// sample data item:
						// {
						//     "value": [
						//         {
						//             "recursive": true,
						//             "section_id": "202",
						//             "section_tipo": "aa1"
						//         }
						//     ],
						//     "source": "hierarchy_terms"
						// }
					foreach ($source_item->value as $item) {
						$ar_section_tipo[] = $item->section_tipo;
					}
					break;

				case 'section':
				default:
					// verify the section tld, if its active in the installation.
					// Sometimes the definition is a string, sometimes is array, mix both into array
						$current_item_values = (array)$source_item->value;
						$valid_sections_tipo = [];
						foreach ($current_item_values as $current_section_tipo) {
							// get the tld from the current tipo to be checked with the active tlds
							$is_active= ontology_utils::check_active_tld($current_section_tipo);
							if($is_active === true){
								$valid_sections_tipo[] = $current_section_tipo;
							}else{
								debug_log(__METHOD__
									. " Removed tld from sqo section definition because the tld is not installed " . PHP_EOL
									. to_string($current_section_tipo)
									, logger::WARNING
								);
							}
						}

					$ar_section_tipo = [...$ar_section_tipo, ...$valid_sections_tipo];
					break;
			}
		}//end foreach($ar_section_tipo_sources as $source_item)

		// remove duplicates
		$ar_section_tipo = array_values(
			array_unique($ar_section_tipo)
		);

		// debug
			if(SHOW_DEBUG===true) {
				$ar_section_tipo_string = to_string($ar_section_tipo);
				debug_log(
					'--- resolve request_config_section_tipo ----------------- ' . number_format(exec_time_unit($start_time,'ms'),3).' ms - '. $ar_section_tipo_string,
					logger::DEBUG
				);
			}


		return $ar_section_tipo;
	}//end get_request_config_section_tipo



	/**
	* GET_FIXED_FILTER
	* Converts ontology fixed-filter property descriptors into SQO filter clause objects
	* that are pre-applied to every search executed by this component's request_config.
	*
	* Three source types are handled:
	*
	*   'fixed_dato'
	*     Direct SQO filter objects embedded in the property value.  Each is validated
	*     against the active TLD list (missing TLD → item silently skipped with WARNING).
	*     Use case: restrict a portal to records flagged with a specific attribute
	*     (e.g. "Usable in indexing" = yes).
	*
	*   'component_data'
	*     Dynamically resolves the search value from a component's dato in the calling
	*     section.  Supports a ddo_map chain for multi-hop resolution (calling section →
	*     linked record → value component).  Two sub-variants:
	*     - search_section_id===true: the resolved section_ids are joined as a comma
	*       string for an IN-style section_id lookup (optimised).
	*     - default: each locator from the resolved data becomes an individual q item
	*       in the filter, optionally stripping from_component_tipo when
	*       use_from_component_tipo===false.
	*     See the inline sample comment in the source for the full JSON shape.
	*
	*   'hierarchy_terms'
	*     Delegates to get_hierarchy_terms_filter() to build section_id range filters
	*     from a hierarchy subtree.
	*
	* Each group of items is wrapped in a {$operator: [...]} object (default '$or') and
	* only appended to the result if non-empty.
	*
	* @param array $ar_fixed      Fixed filter descriptors from properties->fixed (or equivalent).
	* @param string $section_tipo Caller section tipo; passed to resolve_component_data_recursively.
	* @param mixed $section_id    Caller section id; used for 'component_data' resolution.
	* @return array  Array of SQO filter clause objects, each with a boolean operator key.
	*/
	public static function get_fixed_filter( array $ar_fixed, string $section_tipo, mixed $section_id ) : array {

		$ar_fixed_filter = [];

		foreach ($ar_fixed as $search_item) {

			$operator	= $search_item->operator ?? '$or';
			$source		= $search_item->source;

			$filter = new stdClass();
				$filter->{$operator} = [];

			switch ($source) {

				case 'fixed_dato':
					// sample (qdp449)
					// {
					// 	"value": [
					// 		{
					// 		"q": {"section_id":"1","section_tipo":"dd64","type":"dd151","from_component_tipo":"hierarchy24"},
					// 		"path": [
					// 		{
					// 			"name": "Usable in indexing",
					// 			"model": "component_radio_button",
					// 			"section_tipo": "hierarchy20",
					// 			"component_tipo": "hierarchy24"
					// 		}
					// 	],
					// 		"q_operator": null
					// 	}
					// 	],
					// 	"source": "fixed_dato"
					// }
					foreach ($search_item->value as $object) {

						$last_path = end($object->path);

						// check if the ddo is active into the ontology
							$is_active = ontology_utils::check_active_tld($last_path->component_tipo);
							if( $is_active === false ){
								debug_log(__METHOD__
									. " Removed fixed filter value from sqo definition because the tld is not installed " . PHP_EOL
									. to_string($object)
									, logger::WARNING
								);
								continue;
							}

						$filter->{$operator}[] = $object;
					}
					break;

				case 'component_data':
					// Sample
					//	{
					//		"value": [
					//			{
					//				"q": "rsc423",
					//				"path": [
					//					{
					//						"name": "Id",
					//						"model": "component_section_id",
					//						"section_tipo": "rsc420",
					//						"component_tipo": "rsc414"
					//					}
					//				],
					//				"ddo_map": [
					//					{
					//						"tipo": "numisdata1379",
					//						"parent": "self",
					//						"section_tipo": "numisdata1374"
					//					},
					//					{
					//						"tipo": "rsc423",
					//						"parent": "numisdata1379",
					//						"section_tipo": "rsc197"
					//					}
					//				],
					//				"q_operator": null,
					//				"search_section_id": true
					//			}
					//		],
					//		"source": "component_data"
					//	}
					// Every value property has a object with:
					// q :							His value defines the target component_tipo that has the data to be used into the filter
					//								(in the example a portal point to biographic milestones)
					// path : 						To be used as final search path (the component to be searched),
					//								(in the example the section_id of the biographic milestone section)
					// ddo_map :					Defines the ddo path to the component that has the data, it could be in the same section or in other.
					//								(in the example the path from numismatic object to the biographic milestones portal in People under study)
					// 								when the ddo has a children, every child will be resolve with the data of his parent.
					//								If ddo is not set, the component to get his data to be search, need to be in the same section that the caller.
					// q_operator  					q_operator to be used
					// search_section_id : 			true | null. Defines if the component data will be used to search into a section_id component,
					//								in those cases, join the section_id to optimize the search
					// use_from_component_tipo : 	true | false. Defines if the locator to be search will remove the property "from_component_tipo"
					//								to be match with other related components, (data from a select search into a portal)
					//								used in mdcat3165 to get a short filtered list of items using the data of mdcat3047

					$value = $search_item->value;

					// for every value resolve the path and get the component_data
					foreach($value as $current_value){

						// create a ddo_map when is not defined
						// the case of the component to be searched is in the same section that the caller
						if( !isset($current_value->ddo_map) ){
							$ddo = new dd_object();
								$ddo->set_section_tipo($section_tipo);
								$ddo->set_parent($section_tipo);
								$ddo->set_tipo($current_value->q);
							$current_value->ddo_map = [$ddo];
						}

						// get the first ddo to be resolve the ddo chain
						$init_ddo = array_find($current_value->ddo_map ?? [], function($item) use ($section_tipo) {
							return $item->parent === 'self' || $item->parent === $section_tipo;
						});
						// get the ddo that match with the q definition
						$tipo_to_be_resolved = $current_value->q;

						$resolve_ddo = array_find($current_value->ddo_map ?? [], function($item) use ($tipo_to_be_resolved) {
							return $item->tipo === $tipo_to_be_resolved;
						});

						// set the ddo to be resolve as last, is used by the recursion to stop the resolution
						if (is_object($resolve_ddo)) {
							$resolve_ddo->last = true;
						}

						$ar_ddo = $current_value->ddo_map;

						// create the current_data with the section of the component that call.
						// it will use to resolve the ddo_chain
						$current_data = new stdClass();
							$current_data->section_tipo	= $section_tipo;
							$current_data->section_id	= $section_id;

						// resolve the ddo_chain recursively
						$component_data = is_object($init_ddo)
							? component_relation_common::resolve_component_data_recursively($ar_ddo, $init_ddo, $current_data)
							: [];

						// if the fixed_filter is used to search into a section_id, join the result of the locators into a flat string separated by commas.
						// this action optimize the search by using an IN SQL statement.
						if(isset($current_value->search_section_id) && $current_value->search_section_id === true){
							$current_section_id = [];

							foreach ($component_data as $search_data) {
								$current_section_id[] = $search_data->section_id;
							}
							// the joined data will be as: "1,5,83,54"
							$joined_search_data = implode(',', $current_section_id);

							// create the sqo filter with the data and specified path
							$filter_item = new stdClass();
								$filter_item->q		= $joined_search_data;
								$filter_item->path	= $current_value->path;

							$filter->{$operator}[] =  $filter_item;

						}else{
							// if the component is other than section_id, create a q and path with every component_data.
							foreach ($component_data as $search_data) {

								if( is_object( $search_data ) &&
									isset($current_value->use_from_component_tipo) &&
									$current_value->use_from_component_tipo === false ){
									unset($search_data->from_component_tipo);
								}
								$filter_item = new stdClass();
									$filter_item->q		= $search_data;
									$filter_item->path	= $current_value->path;
									//$filter_item->path	= search::get_query_path($tipo, $section_tipo,false,false)[0];
								$filter->{$operator}[] =  $filter_item;
							}
						}
					}
					break;

				case 'hierarchy_terms':
					$hierarchy_terms_filter = component_relation_common::get_hierarchy_terms_filter($search_item->value);
					if(empty($hierarchy_terms_filter)) break;
					$filter->{$operator} =  $hierarchy_terms_filter;
					break;
			}

			// finished group add
			if (!empty($filter->{$operator})) {
				$ar_fixed_filter[] =$filter;
			}
		}//end foreach ($ar_fixed as $search_item)


		return $ar_fixed_filter;
	}//end get_fixed_filter



	/**
	* RESOLVE_COMPONENT_DATA_RECURSIVELY
	* Walks a ddo_map chain depth-first, fetching each component's dato and passing the
	* result locators as context to the next level's component instantiation.
	*
	* Used by get_fixed_filter (case 'component_data') and get_calculation_data to
	* follow a multi-hop path from the calling section to a final leaf component whose
	* data is the actual filter/calculation value.
	*
	* Termination: a ddo marked $dd_object->last===true is the leaf — its component
	* dato is returned directly without further recursion.  Non-leaf ddos recurse into
	* their children (found by get_ddo_children_recursive), merging all child results.
	*
	* Special fn dispatch:
	*   ddo->fn (or legacy ddo->data_fn) === 'get_calculation_data' → calls the named
	*   method with ddo->options; otherwise get_data() is used.
	*
	* @param array $ar_ddo    Full flat ddo_map for the resolution pass.
	* @param object $dd_object The current ddo being processed (set to leaf via ->last).
	* @param object $data      Context object from the previous recursion level, carrying
	*   {section_tipo, section_id} used to instantiate the current component.
	* @return array  The resolved component dato (array of locators or plain values).
	*/
	private static function resolve_component_data_recursively(array $ar_ddo, object $dd_object, object $data) : array {

		$last			= $dd_object->last ?? null;
		$tipo			= $dd_object->tipo;
		$fn				= $dd_object->fn ?? $dd_object->data_fn ?? null; // data_fn is the old name for fn
		$section_tipo	= $data->section_tipo;
		$section_id		= $data->section_id;
		$model			= ontology_node::get_model_by_tipo($tipo,true);
		$translatable	= ontology_node::get_translatable($tipo);
		$component		= component_common::get_instance(
			$model,
			$tipo,
			$section_id,
			'list',
			$translatable===true ? DEDALO_DATA_LANG : DEDALO_DATA_NOLAN,
			$section_tipo
		);

		switch ($fn) {
			case 'get_calculation_data':
				$options = $dd_object->options ?? null;
				$component_data = $component->get_calculation_data($options);
				break;

			default:
				$component_data = $component->get_data();
				break;
		}
		if (empty($component_data)) {
			return [];
		}

		// if the ddo has a $last property, it will be the component to get his data
		// but if the ddo in not the $last ddo, do recursion to resolve the next level into the ddo chain.
		if (!isset($last)) {

			$current_component_data = [];

			$children = component_relation_common::get_ddo_children_recursive($ar_ddo, $dd_object);
			foreach($component_data as $element){
				foreach ($children as $current_ddo_child) {
					$result_component_data = component_relation_common::resolve_component_data_recursively($ar_ddo, $current_ddo_child, $element);
					// join the result data with the siblings resolution.
					if (!empty($result_component_data)) {
						$current_component_data = [...$current_component_data, ...$result_component_data];
					}
				}
			}
			return $current_component_data;
		}


		return $component_data;
	}//end resolve_component_data_recursively



	/**
	* GET_DDO_CHILDREN_RECURSIVE
	* Collects the full recursive descendant chain of a ddo in the ddo_map, used by
	* resolve_component_data_recursively() to fan out into siblings at each level.
	* This is the static private equivalent of get_export_ddo_descendants(), scoped to
	* the 'component_data' resolution context rather than the export context.
	* @param array $ar_ddo    Full flat ddo_map.
	* @param object $dd_object Parent ddo whose descendants are sought.
	* @return array  All descendant ddo objects in breadth-first order.
	*/
	private static function get_ddo_children_recursive(array $ar_ddo, object $dd_object) : array {
		$ar_children = [];
		foreach ($ar_ddo as $ddo) {
			if($ddo->parent===$dd_object->tipo) {
				$ar_children[] = $ddo;
				$result = component_relation_common::get_ddo_children_recursive($ar_ddo, $ddo);
				if (!empty($result)) {
					$ar_children = [...$ar_children, ...$result];
				}
			}
		}
		return $ar_children;
	}



	/**
	* GET_SORTABLE
	* Overrides component_common (which returns true) to disable the generic alphabetic
	* sort UI for all relation components.  Relation components expose their own
	* 'sort_by_column' mechanism via sort_data_by_column().
	* @return bool  Always false.
	*/
	public function get_sortable() : bool {

		return false;
	}//end get_sortable



	/**
	* SORT_DATA_BY_COLUMN
	* Reorders the in-memory locator array so that locators are sorted by the value
	* of a specific column component in the target section.
	*
	* Guards (all return false on failure):
	*   - properties->sort_by_column must be true or an array of allowed column tipos.
	*   - direction must be 'ASC' or 'DESC'.
	*   - component_tipo must appear in this component's request_config show ddo_map.
	*   - When sort_by_column is an array, component_tipo must be in the allowlist.
	*   - The ddo must resolve a non-empty target_section_tipo.
	*   - The model of component_tipo must be resolvable.
	*
	* Order resolution:
	*   A fresh target component instance (no section_id, list mode) is obtained to
	*   call get_order_path() without mixing in the portal caller's prefix.  Relation
	*   model components also receive a build_request_config() call so that overrides
	*   of get_order_path (portal, related) have access to their show ddo_map.
	*   A search over the target section restricted to the linked section_ids (via an
	*   IN filter on section_id) is executed with skip_projects_filter=true.
	*   A rank map {section_tipo_section_id → position} is built from the search rows.
	*
	* Stable sort:
	*   usort with <=> spaceship on rank positions.  Unmatched locators (e.g. targets
	*   that were deleted) receive PHP_INT_MAX as rank and fall to the end, preserving
	*   their relative order among themselves.
	*
	* paginated_key cleanup:
	*   Any paginated_key markers left by get_data_paginated on the memoised locators
	*   are stripped before the sort to avoid stale markers affecting comparison.
	*
	* (!) Does NOT save. The caller (dd_core_api::save via update_data_value 'sort_by_column')
	* persists the reordered dato.
	*
	* @param object $changed_data  Client action payload:
	*   action (string)        = 'sort_by_column'
	*   component_tipo (string) The column to sort by.
	*   direction (string)      'ASC' or 'DESC'.
	*   value (null)            Unused.
	* @param string $lang  Language passed through for data retrieval (get_data_lang).
	* @return bool  True on success, false when any guard check fails.
	*/
	public function sort_data_by_column( object $changed_data, string $lang ) : bool {

		// sort_by_column property. Mandatory gate: the portal ontology properties
		// must enable column sorting as boolean true or array of allowed column tipos
			$properties		= $this->get_properties();
			$sort_by_column	= $properties->sort_by_column ?? false;
			if ($sort_by_column!==true && !is_array($sort_by_column)) {
				debug_log(__METHOD__
					." Error on sort_by_column. Property 'sort_by_column' is not enabled in component properties"
					.' tipo: ' . $this->tipo . PHP_EOL
					.' section_tipo: ' . $this->section_tipo
					, logger::ERROR
				);
				return false;
			}

		// direction. Allowlist ASC|DESC
			$direction = strtoupper( (string)($changed_data->direction ?? '') );
			if (!in_array($direction, ['ASC','DESC'], true)) {
				debug_log(__METHOD__
					." Error on sort_by_column. Invalid direction: " . to_string($changed_data->direction ?? null)
					, logger::ERROR
				);
				return false;
			}

		// component_tipo. Must be one of the current component show ddo_map columns
		// (prevents ordering by arbitrary injected tipos)
			$component_tipo = (string)($changed_data->component_tipo ?? '');
			$request_config = $this->build_request_config(); // memoized; assigns $this->request_config
			$request_config_item = array_find($request_config, function($el){
				return isset($el->api_engine) && $el->api_engine==='dedalo';
			}) ?? reset($request_config);
			$show_ddo_map = $request_config_item->show->ddo_map ?? [];
			$ddo = array_find($show_ddo_map, function($el) use($component_tipo) {
				return isset($el->tipo) && $el->tipo===$component_tipo;
			});
			if (empty($ddo)) {
				debug_log(__METHOD__
					." Error on sort_by_column. component_tipo '$component_tipo' is not a show ddo_map column of component: " . $this->tipo
					, logger::ERROR
				);
				return false;
			}
			// allowlist case. When the property is an array, it restricts the sortable column tipos
			if (is_array($sort_by_column) && !in_array($component_tipo, $sort_by_column, true)) {
				debug_log(__METHOD__
					." Error on sort_by_column. component_tipo '$component_tipo' is not allowed by the 'sort_by_column' property of component: " . $this->tipo
					, logger::ERROR
				);
				return false;
			}

		// target_section_tipo. From the validated ddo ('self' resolves to current section_tipo)
			$target_section_tipo = array_map(function($el){
				return $el==='self' ? $this->section_tipo : $el;
			}, (array)($ddo->section_tipo ?? []));
			if (empty($target_section_tipo)) {
				debug_log(__METHOD__
					." Error on sort_by_column. Unable to resolve target section_tipo from ddo: " . to_string($ddo)
					, logger::ERROR
				);
				return false;
			}
			$first_target_section_tipo = reset($target_section_tipo);

		// data. Full stored locator array (never paginated server side)
			$data_lang = $this->get_data_lang($lang) ?? [];
			if (count($data_lang) < 2) {
				// nothing to reorder
				return true;
			}
			// remove possible client paginated_key marks (get_data_paginated mutates memoized objects)
			foreach ($data_lang as $current_locator) {
				if (is_object($current_locator)) {
					unset($current_locator->paginated_key);
				}
			}

		// ar_section_id. Unique linked ids to restrict the search
			$ar_section_id = array_values(array_unique(array_map(function($el){
				return (int)($el->section_id ?? 0);
			}, $data_lang)));

		// order path. Built from a fresh target component instance so subclass
		// get_order_path overrides apply (date/number column literals, relation ddo hop)
		// without the caller hop a portal child instance would prepend.
			$model = ontology_node::get_model_by_tipo($component_tipo, true);
			if (empty($model)) {
				debug_log(__METHOD__
					." Error on sort_by_column. Unable to resolve model of component_tipo: $component_tipo"
					, logger::ERROR
				);
				return false;
			}
			$target_component = component_common::get_instance(
				$model,
				$component_tipo,
				null, // section_id
				'list', // mode
				DEDALO_DATA_NOLAN, // lang
				$first_target_section_tipo // section_tipo
			);
			if (in_array($model, component_relation_common::get_components_with_relations(), true)) {
				// relation overrides of get_order_path (portal, related) require request_config
				$target_component->build_request_config();
			}
			$order_path = $target_component->get_order_path($component_tipo, $first_target_section_tipo);
			if (empty($order_path)) {
				debug_log(__METHOD__
					." Error on sort_by_column. Empty order path for component_tipo: $component_tipo - section_tipo: $first_target_section_tipo"
					, logger::ERROR
				);
				return false;
			}

		// order item
		// note that lang is intentionally not set: trait.order resolves it as
		// DEDALO_DATA_LANG for translatable columns (same as section list ordering,
		// whose client order items never carry lang). The save rqo lang would be
		// wrong here: relation components are always lg-nolan.
			$order_item = new stdClass();
				$order_item->direction	= $direction;
				$order_item->path		= $order_path;

		// filter. section_id = ANY(ar_section_id) over the target section
		// same shape as search::generate_children_recursive_search
			$path_item = new stdClass();
				$path_item->section_tipo	= $first_target_section_tipo;
				$path_item->component_tipo	= 'section_id';
				$path_item->model			= 'component_section_id';
				$path_item->name			= 'Id';
			$filter_item = new stdClass();
				$filter_item->q				= implode(',', $ar_section_id);
				$filter_item->q_operator	= null;
				$filter_item->path			= [$path_item];
			$filter = new stdClass();
				$filter->{'$or'} = [$filter_item];

		// search. Resolve the (section_tipo, section_id) pairs ordered by the column value
			$sqo = new search_query_object();
				$sqo->set_section_tipo( $target_section_tipo );
				$sqo->set_limit( 0 );
				$sqo->set_skip_projects_filter( true ); // portal display already grants min read (see get_subdatum)
				$sqo->set_filter( $filter );
				$sqo->set_order( [$order_item] );
			$search		= search::get_instance($sqo);
			$db_result	= $search->search();
			$ar_rows	= $db_result->fetch_all();

		// rank map. "{section_tipo}_{section_id}" => order position
			$rank = [];
			foreach ($ar_rows as $key => $row) {
				$rank[ $row->section_tipo.'_'.$row->section_id ] = $key;
			}

		// stable sort. Unmatched locators keep relative order at the end
			$max_rank = PHP_INT_MAX;
			usort($data_lang, function($a, $b) use($rank, $max_rank) {
				$rank_a = $rank[ ($a->section_tipo ?? '').'_'.(int)($a->section_id ?? 0) ] ?? $max_rank;
				$rank_b = $rank[ ($b->section_tipo ?? '').'_'.(int)($b->section_id ?? 0) ] ?? $max_rank;
				return $rank_a <=> $rank_b;
			});

		// set the reordered data (the caller flow saves it)
			$this->set_data_lang($data_lang, $lang);


		return true;
	}//end sort_data_by_column



	/**
	* GET_LIST_VALUE
	* Returns the display labels for all currently stored locators that appear in the
	* component's value list (get_list_of_values).
	*
	* This differs from get_data() in that it resolves each locator to its human-readable
	* label rather than returning the raw locator objects.  Locators not present in the
	* value list (e.g. records deleted since the data was saved) are silently omitted.
	*
	* Returns null rather than an empty array when the dato is empty.
	*
	* @return array|null  Array of label strings, or null when the dato is empty.
	*/
	public function get_list_value() : ?array {

		$data = $this->get_data();
		if (empty($data)) {
			return null;
		}

		$list_value = [];
		$list_of_values = $this->get_list_of_values(DEDALO_DATA_LANG);
		foreach ($list_of_values->result as $item) {

			$locator = $item->value;
			if ( true===locator::in_array_locator($locator, $data, array('section_id','section_tipo')) ) {
				$list_value[] = $item->label;
			}
		}

		return $list_value;
	}//end get_list_value



	/**
	* CONFORM_IMPORT_DATA
	* Parses and validates an import cell value for this relation component, returning
	* an array of locator objects or null (to clear the component dato).
	*
	* Accepted $import_value formats:
	*
	* 1. JSON-encoded array of full locator objects
	*    e.g. '[{"section_tipo":"ts1","section_id":"273","from_component_tipo":"hierarchy36"}]'
	*    Each locator is validated with locator::check_locator(); invalid ones abort with
	*    an error entry.  Missing 'type' and 'from_component_tipo' are filled from the
	*    component context.
	*
	* 2. Comma-separated integer section_ids (old format)
	*    e.g. '1' or '273,418'
	*    The target section tipo is taken from the column_name suffix (after the DELIMITER)
	*    or falls back to the first element of get_ar_target_section_tipo().  Invalid or
	*    ambiguous (multiple targets, no suffix) imports are rejected.
	*
	* $column_name format:
	*   '{component_tipo}' or '{component_tipo}{DELIMITER}{target_section_tipo}'
	*   e.g. 'hierarchy36' or 'hierarchy36_ts1'
	*   When the first segment does not match $this->tipo, from_component_tipo defaults
	*   to $this->tipo (user-friendly column names are tolerated).
	*
	* An empty $import_value is treated as a valid 'clear' operation; result is null
	* and msg is 'OK'.
	*
	* @param string $import_value  Raw cell content from the CSV/import source.
	* @param string $column_name   Import column identifier (used to derive target section tipo).
	* @return object $response  {result: array|null, errors: array, msg: string}
	*/
	public function conform_import_data( string $import_value, string $column_name ) : object {

		// Response
			$response = new stdClass();
				$response->result	= null;
				$response->errors	= [];
				$response->msg		= 'Error. Request failed';

		// Check if is a JSON string. Is yes, decode
			if(json_handler::is_json($import_value)){
				// try to JSON decode (null on not decode)
				$data_from_json	= json_handler::decode($import_value); // , false, 512, JSON_INVALID_UTF8_SUBSTITUTE
				$import_value	= $data_from_json;
			}

		// short vars
			$type			= $this->get_relation_type();
			$section_tipo	= $this->section_tipo;
			$value			= $import_value;

		// no value case
		// empty cell is valid: result null clears the existing component data
			if (empty($value)) {
				$response->msg = 'OK';
				return $response;
			}

		// return value
			$ar_locators = [];

		// column name could be only the tipo as "rsc85" or a identifier as "rsc85_rsc197"
		// the component tipo are always the first tipo in the column name
			$ar_tipos				= explode(locator::DELIMITER, $column_name);
			$from_component_tipo	= $ar_tipos[0];
			// check if the first part of the columns name has a user name or it has the current component_tipo
			// if not, set the from_component_tipo as current component tipo. Because the user can set something as 'residence_es1'
			// instead 'rsc92_es1'
			if($this->tipo !== $from_component_tipo){
				$from_component_tipo = $this->tipo;
			}
			$target_section_tipo	= $ar_tipos[1] ?? null;

		// check if the value is not a valid JSON or if it's a int,
		// cases: 1 || 4,5
		// 1 is an int and 4,5 is string
		// but not the locator [{"section_tipo":"oh1","section_id":"1"}] it's valid JSON
			if (is_string($value) || is_int($value)) {

				// target_section_tipo
					if( empty($target_section_tipo) ) {

						$ar_target_section_tipo = $this->get_ar_target_section_tipo();
						if(count($ar_target_section_tipo)>1) {

							debug_log(__METHOD__
								." Trying to import multiple section_tipo without clear target" .PHP_EOL
								.' ar_target_section_tipo: '. json_encode($ar_target_section_tipo, JSON_PRETTY_PRINT)
								, logger::ERROR
							);

							$failed = new stdClass();
								$failed->section_id		= $this->section_id;
								$failed->data			= stripslashes( $import_value );
								$failed->component_tipo	= $this->get_tipo();
								$failed->msg			= 'IGNORED: Trying to import multiple section_tipo without clear target ';
							$response->errors[] = $failed;

							return $response;
						}
						$target_section_tipo = $ar_target_section_tipo[0] ?? null;

						if (empty($target_section_tipo)) {
							$properties = $this->get_properties();
							debug_log(__METHOD__
								." Unable to resolve target_section_tipo for this component. Review the RQO configuration and ensure that target section exists." .PHP_EOL
								.' tipo: '. $this->tipo . PHP_EOL
								.' section_tipo: '. $this->section_tipo . PHP_EOL
								.' properties: '. json_encode($properties, JSON_PRETTY_PRINT)
								, logger::ERROR
							);
						}

						// check valid target_section_tipo
						if (!safe_tipo($target_section_tipo)) {

							debug_log(__METHOD__
								." Trying to import invalid target_section_tipo" .PHP_EOL
								.' target_section_tipo: '. to_string($target_section_tipo)
								, logger::ERROR
							);

							$failed = new stdClass();
								$failed->section_id		= $this->section_id;
								$failed->data			= to_string( $import_value );
								$failed->component_tipo	= $this->get_tipo();
								$failed->msg			= 'IGNORED: Trying to import invalid target_section_tipo';
							$response->errors[] = $failed;

							return $response;
						}
					}

				$ar_values = explode(',', (string)$value);
				foreach ($ar_values as $section_id) {

					// section_id. Check if section_id value is valid
					if (!safe_section_id($section_id)) {

						debug_log(__METHOD__
							." Trying to import invalid section_id" .PHP_EOL
							.' section_id: '. to_string($section_id)
							, logger::ERROR
						);

						$failed = new stdClass();
							$failed->section_id		= $this->section_id;
							$failed->data			= to_string( $import_value );
							$failed->component_tipo	= $this->get_tipo();
							$failed->msg			= 'IGNORED: Trying to import invalid section_id';
						$response->errors[] = $failed;

						return $response;
					}

					// old format (section_id)
					// is int. Builds complete locator and set section_id from value
					$locator = new locator();
						// ! type could be false (component_relation_parent)
						if (!empty($type)) {
							$locator->set_type($type);
						}
						$locator->set_section_tipo($target_section_tipo);
						$locator->set_from_component_tipo($from_component_tipo);
						$locator->set_section_id(trim($section_id));

					$ar_locators[] = $locator;
				}
			}else{

				// Locator case
				$value = !is_array($value) ? [$value] : $value;
				foreach ($value as $current_locator) {

				// is full locator. Inject safe fixed properties to avoid errors
					$locator = new locator($current_locator);

						// check_locator
						$check_response = $locator->check_locator();
						if ($check_response->result!==true) {

							debug_log(__METHOD__
								." Trying to import invalid locator" . PHP_EOL
								.' check_response->msg: ' . $check_response->msg . PHP_EOL
								.' section_id: '. to_string($this->section_id) . PHP_EOL
								.' locator: '. json_encode($locator, JSON_PRETTY_PRINT)
								, logger::ERROR
							);

							$failed = new stdClass();
								$failed->section_id		= $this->section_id;
								$failed->data			= to_string( $import_value );
								$failed->component_tipo	= $this->get_tipo();
								$failed->msg			= 'IGNORED: Trying to import invalid locator';
							$response->errors[] = $failed;

							return $response;
						}

						// ! type could be false (component_relation_parent)
						if (!empty($type) && !property_exists($current_locator, 'type')) {
							$locator->set_type($type);
						}
						if (!property_exists($current_locator, 'from_component_tipo')) {
							$locator->set_from_component_tipo($from_component_tipo);
						}

					$ar_locators[] = $locator;
				}
			}

		// response
			$response->result	= $ar_locators;
			$response->msg		= 'OK';


		return $response;
	}//end conform_import_data



	/**
	* ADD_NEW_ELEMENT
	* Creates a new record in the target section, copies the current host record's
	* project filter data into it, and appends a locator to this component's dato.
	*
	* Steps:
	*   1. PROJECTS: reads the current host section's component_filter data (projects).
	*      If the host is a temporary section ($this->is_temporal) or has no filter
	*      data, the installation default project (DEDALO_DEFAULT_PROJECT) is used as
	*      a fallback.  Locators are re-tagged with the target section's own
	*      component_filter tipo and given sequential id values.
	*   2. SECTION: calls section::create_record() with the prepared filter values
	*      object so that the new record inherits the correct project membership.
	*   3. PORTAL: builds a DEDALO_RELATION_TYPE_LINK locator pointing at the new
	*      record and appends it via add_locator_to_data().  If the append fails
	*      (duplicate prevention), the orphaned new section record is immediately
	*      deleted to avoid dangling records.
	*
	* (!) Does NOT call save() on this component.  The caller is responsible for
	* persisting the updated dato.
	*
	* @param object $options  Options bag.  Required: target_section_tipo (string)
	*   identifying the section in which to create the new record.
	* @return object $response  {
	*   result: bool,
	*   msg: string,
	*   section_id?: int,         — the new record's section_id (on success)
	*   added_locator?: locator   — the locator that was appended (on success)
	* }
	*/
	public function add_new_element( object $options ) : object {

		// options
			$target_section_tipo = $options->target_section_tipo ?? null;

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. Request failed';

		// target_section_tipo check
			if(empty($target_section_tipo)){
				$response->msg .= ' Is mandatory to specify target_section_tipo';
				debug_log(__METHOD__
					. " $response->msg " . PHP_EOL
					. ' options: ' . to_string($options)
					, logger::ERROR
				);
				return $response;
			}

		// 1 PROJECTS GET
			// We get current portal section filter data (projects) to heritage in the new portal record
			// This exclude non user projects from the list, only intersections are accepted.
			$section_id				= $this->get_section_id();
			$component_filter_data	= ($this->is_temporal===true)
				? null
				: $this->get_current_section_filter_data();
			if(empty($component_filter_data)) {

				debug_log(__METHOD__
					." Empty filter value in current section. Default project value will be used: "
					.' section_tipo: ' . $this->section_tipo . PHP_EOL
					.' section_id: ' . $section_id
					, logger::WARNING
				);

				// Default value is used
				// Temp section case Use default project here
				$default_locator = new locator();
					$default_locator->set_section_tipo(DEDALO_SECTION_PROJECTS_TIPO);
					$default_locator->set_section_id(DEDALO_DEFAULT_PROJECT);
					$default_locator->set_type(DEDALO_RELATION_TYPE_FILTER);
				$component_filter_data = [$default_locator];
			}

			// values
			$values = null;
			if(!empty($component_filter_data)) {

				// Resolve target section component_filter
				// This is where we store the inherit projects data
				$component_filter_model = 'component_filter';
				$component_filter_tipo = section::get_ar_children_tipo_by_model_name_in_section(
					$target_section_tipo, // section_tipo
					[$component_filter_model],
					true, // bool from_cache
					true, // bool resolve_virtual
					true, // bool recursive
					true, // bool search_exact
					false // array|bool ar_tipo_exclude_elements
				)[0] ?? null;

				if ($component_filter_tipo) {
					// Parse current inherited project data to be usable in target section component_filter
					$new_filter_data = [];
					$id = 1;
					foreach ($component_filter_data as $data_entry) {
						// Ensure locator instance (DB data is decoded as stdClass)
						$new_locator = new locator($data_entry);
						$new_locator->set_from_component_tipo($component_filter_tipo); // Replaces component tipo
						$new_locator->set_id($id++); // Set new value id starting with 1
						$new_filter_data[] = $new_locator;
					}
					// Build values to insert in the new section record
					$column_name = section_record_data::get_column_name($component_filter_model); // 'relation' expected
					$values = (object)[
						$column_name => (object)[
							$component_filter_tipo => $new_filter_data
						]
					];
				}
			}

		// 2 SECTION
			// Section record . create new empty section in target section tipo
			$section_new = section::get_instance($target_section_tipo);

			// create_record
			$new_section_id = $section_new->create_record((object)[
				'values' => $values
			]);

			if(!$new_section_id || $new_section_id<1) {
				$msg = "Error on create new section: new section_id is not valid ! ";
				$response->msg .= $msg;
				debug_log(__METHOD__
					." $response->msg " . PHP_EOL
					.' values: ' . to_string($values)
					, logger::ERROR
				);
				return $response;
			}

		// 3 PORTAL
			// Portal data. add current section id to component portal data array
			// Basic locator
			$locator = new locator();
				$locator->set_section_id($new_section_id);
				$locator->set_section_tipo($target_section_tipo);
				$locator->set_type(DEDALO_RELATION_TYPE_LINK);
				$locator->set_from_component_tipo($this->tipo);

			$added = $this->add_locator_to_data($locator);
			if ($added!==true) {

				// Rollback: delete the orphaned section record that was already created
				$section_record_data = section_record_data::get_instance($target_section_tipo, $new_section_id);
				$section_record = section_record::get_instance(
					$target_section_tipo,
					$new_section_id,
					false // bool cache
				);
				$section_record->delete();

				$response->msg .= 'Error add_locator_to_data. New locator is not added !';
				debug_log(__METHOD__
					." $response->msg " . PHP_EOL
					.' locator: ' . to_string($locator) . PHP_EOL
					.' target_section_tipo: ' . to_string($target_section_tipo) . PHP_EOL
					.' new_section_id: ' . to_string($new_section_id)
					, logger::ERROR
				);
				return $response;
			}

		// response OK
			$response->result			= true;
			$response->section_id		= $new_section_id;
			$response->added_locator	= $locator;
			$response->msg				= 'OK. Request done '.__METHOD__;


		return $response;
	}//end add_new_element



	/**
	* MAP_LOCATOR_TO_TERM_ID [diffusion — REMOVED v6 method]
	* v6-only diffusion helper that mapped a locator to its external term identifier.
	* Removed in v7: the Bun engine's diffusion parsers now handle this mapping
	* natively for all ontology configs.  Legacy ontology records that still reference
	* this method via process_dato config will reach this stub and receive a null value
	* with an ERROR log prompting migration.
	*
	* Migration: run diffusion/migration/migrate_diffusion_properties.php to convert
	* any remaining v6 process_dato references to v7 parser equivalents.
	*
	* @return string|null  Always null.
	*/
	public function map_locator_to_term_id() : ?string {

		debug_log(__METHOD__
			. " UNMIGRATED v6 process_dato config detected (map_locator_to_term_id). Value resolved as null." . PHP_EOL
			. " Migrate this ontology config to v7 parsers (see diffusion/migration/migrate_diffusion_properties.php)." . PHP_EOL
			. ' tipo: ' . to_string($this->tipo ?? null) . PHP_EOL
			. ' section_tipo: ' . to_string($this->section_tipo ?? null)
			, logger::ERROR
		);

		return null;
	}//end map_locator_to_term_id



	/**
	* GET_CALCULATION_DATA
	* Resolves a chain of ddo components starting from this component's locators and
	* returns the leaf-level dato array.  Used by get_fixed_filter (case 'component_data'
	* with fn='get_calculation_data') and by tool_export calculation columns.
	*
	* The ddo_map in $options describes the full hop chain.  The last ddo in the map
	* (end($ddo_map)) is marked as the leaf (->last=true) so that
	* resolve_component_data_recursively() terminates there.
	*
	* For each locator in this component's dato, resolve_component_data_recursively
	* is called with the locator as context, and all results are merged into a flat
	* output array.
	*
	* @param object|null $options = null  Options bag; expected key: ddo_map (array).
	* @return mixed  Flat array of resolved leaf-component dato items, or false when
	*   dato is empty or no valid last ddo exists.
	*/
	public function get_calculation_data( ?object $options=null ) : mixed {

		$ar_data		= [];
		$ddo_map		= $options->ddo_map ?? [];
		$data			= $this->get_data();
		$section_tipo	= $this->section_tipo;

		if(empty($data)){
			return false;
		}

		// get the first ddo to be resolve the ddo chain
		$init_ddo = array_find($ddo_map, function($item) use ($section_tipo) {
			return $item->parent === 'self' || $item->parent === $section_tipo;
		});
		// get the ddo that match with the q definition
		$last_ddo = end($ddo_map);
		if ($last_ddo === false) {
			return false;
		}
		$tipo_to_be_resolved = $last_ddo->tipo;

		$resolve_ddo = array_find($ddo_map, function($item) use ($tipo_to_be_resolved) {
			return $item->tipo === $tipo_to_be_resolved;
		});

		// set the ddo to be resolve as last, is used by the recursion to stop the resolution
		if (is_object($resolve_ddo)) {
			$resolve_ddo->last = true;
		}

		foreach ($data as $element) {

			// create the current_data with the section of the component that call.
			// it will use to resolve the ddo_chain
				$current_locator = new stdClass();
					$current_locator->section_tipo	= $element->section_tipo;
					$current_locator->section_id	= $element->section_id;

			$result_component_data = component_relation_common::resolve_component_data_recursively(
				$ddo_map,
				$init_ddo,
				$current_locator
			);

			$ar_data = [...$ar_data, ...$result_component_data];
		}


		return $ar_data;
	}//end get_calculation_data



	/**
	* GET_DDO_MAP_ID
	* Produces a compact string fingerprint of a ddo_map by joining each ddo's
	* '{section_tipo}_{tipo}' pair with underscores.
	*
	* Intended for use as a variant key to extend the component instance cache key when
	* the same component tipo is rendered with different ddo_maps (portal-inside-portal
	* scenario).  Currently prepared but not yet wired into the cache key (see the
	* commented block in get_grid_value for the planned use).
	*
	* Multi-value section_tipo arrays are normalised to their first element.
	*
	* Example: [{section_tipo:'rsc197', tipo:'rsc92'}, {section_tipo:'af1', tipo:'hierarchy26'}]
	* → 'rsc197_rsc92_af1_hierarchy26'
	*
	* @param array $ddo_map  Array of ddo objects, each with section_tipo and tipo.
	* @return string  Underscore-delimited fingerprint string.
	*/
	public function get_ddo_map_id( array $ddo_map ) : string {

		$ddo_map_flat = array_map( function($ddo){
			// reset multiple section_tipo
			$section_tipo = is_array( $ddo->section_tipo )
				? reset( $ddo->section_tipo )
				: $ddo->section_tipo;
			// get a flat version of the section_tipo and the component_tipo as `rsc197_rsc92`
			return $section_tipo .'_'. $ddo->tipo;
		}, $ddo_map );

		// get the final map_id join all parts as `rsc197_rsc92_af1_hierarchy36`
		$ddo_map_id = implode('_', $ddo_map_flat );


		return $ddo_map_id;
	}//end get_ddo_map_id



}//end class component_relation_common
