<?php declare(strict_types=1);
/**
* CLASS INDEXATION_GRID
* Builds the dd_grid representation of all records that index a given thesaurus term.
*
* When a thesaurus term is opened in the area_thesaurus UI the system must show a
* structured table ("indexation grid") listing every record across the catalogue that
* tags this term.  This class orchestrates that process:
*
*  1. Accepts a Search Query Object (SQO) carrying the thesaurus locator to search
*     for and one or more target section tipos to restrict results.
*  2. Calls search_related::get_referenced_locators() (via get_ar_locators()) to find
*     all inverse locators — i.e., every catalogue record that contains a relation
*     pointing back to the current thesaurus term.
*  3. Groups the resulting locators by section_top_tipo → section_top_id, applies a
*     per-user project-visibility filter (non-global-admin users only see rows whose
*     component_filter matches a project they belong to), and passes the filtered map
*     to build_indexation_grid().
*  4. For each section group, resolves the Ontology 'indexation_list' child node for
*     that section, reads the head/row ddo_map stored there, and assembles a tree of
*     dd_grid_cell_object instances (rows and columns) that the client renders as a
*     dynamic table.
*
* Data flow summary:
*   SQO (section_tipo, filter_by_locators, limit, offset)
*     → get_ar_locators()      — raw inverse locators via search_related
*     → get_ar_section_top_tipo() — grouped + project-filtered map
*     → build_indexation_grid()   — dd_grid_cell_object tree (returned to caller)
*
* Relationships:
*  - Uses dd_grid_cell_object for the output cell/row objects.
*  - Uses search_related::get_referenced_locators() for inverse-relation lookup.
*  - Uses component_relation_index::parse_data() to normalise raw search rows into
*    locator objects.
*  - Uses ontology_node to resolve section labels, colours, and the indexation_list
*    component tipo for each section.
*  - Uses component_common::get_instance() to instantiate each grid column component
*    and call its get_grid_value() method.
*  - Used by ts_object and the dd_core_api indexation handler.
*
* @package Dédalo
* @subpackage Core
*/
class indexation_grid {



	/**
	* CLASS VARS
	*/
		/**
		* Ontology tipo (component identifier) whose inverse relations are indexed.
		* Typically a component_relation_index tipo (e.g. 'rsc860') that holds the
		* thesaurus tag links within the section being queried.
		* @var ?string $tipo
		*/
		protected ?string $tipo = null;

		/**
		* Section ID of the thesaurus term whose indexations are being displayed.
		* Identifies the specific thesaurus record (the "tagged" term).
		* @var int|string|null $section_id
		*/
		protected int|string|null $section_id = null;

		/**
		* Section tipo (ontology identifier) of the thesaurus term.
		* Identifies the thesaurus hierarchy this term belongs to (e.g. 'tchi1').
		* @var ?string $section_tipo
		*/
		protected ?string $section_tipo = null;

		/**
		* Optional filter array of section tipos used to restrict the locator lookup.
		* When present, only locators whose section_tipo matches an entry in this
		* array are returned by the search.  Passed directly to the constructor and
		* forwarded to the SQO as supplementary filter data.
		* Example: ['oh1'] restricts results to records in the 'oh1' section.
		* @var ?array $value
		*/
		protected ?array $value = null;

		/**
		* Pagination configuration for the indexation result set.
		* Initialised in __construct() with defaults (limit=500, offset=0, total=null)
		* and overwritten by the SQO values passed to build_indexation_grid().
		* @var ?object $pagination
		*/
		protected ?object $pagination = null;

		/**
		* Target section tipos used to scope the inverse-relation search.
		* Derived from $sqo->section_tipo in build_indexation_grid() and normalised
		* to an array (the SQO property may arrive as a single string or an array).
		* A null value or empty array causes build_indexation_grid() to return early
		* with an empty result.  Passed as-is to search_related::get_referenced_locators().
		* Example: ['rsc205', 'tchi1'] or ['all'] to include every section.
		* @var ?array $target_section
		*/
		protected ?array $target_section = null;

		/**
		* The Search Query Object for the current build pass.
		* Populated at the start of build_indexation_grid() and consumed by
		* get_ar_locators() to drive the inverse-relation search.
		* @var ?object $sqo
		*/
		protected ?object $sqo = null;



	/**
	* CONSTRUCT
	* Stores the identity of the thesaurus term to index and initialises pagination
	* defaults.  Does not perform any I/O; call build_indexation_grid() to produce
	* the grid.
	*
	* @param string         $section_tipo  Ontology tipo of the thesaurus section (e.g. 'tchi1').
	* @param int|string     $section_id    Record ID of the thesaurus term to index.
	* @param string         $tipo          Component tipo whose back-relations are queried (e.g. 'rsc860').
	* @param ?array         $value         [= null] Optional section-tipo filter forwarded to queries.
	* @return void
	*/
	public function __construct(string $section_tipo, int|string $section_id, string $tipo, ?array $value=null) {

		$this->tipo			= $tipo;
		$this->section_id	= $section_id;
		$this->section_tipo	= $section_tipo;
		$this->value		= $value; // ["oh1",] array of section_tipo \ used to filter the locator with specific section_tipo (like 'oh1')

		// set pagination
		if (!isset($this->pagination)) {

			$this->pagination = new stdClass();
				$this->pagination->limit	= 500;
				$this->pagination->offset	= 0;
				$this->pagination->total	= null;
		}

	}//end __construct



	/**
	* BUILD_INDEXATION_GRID
	* Main entry point.  Accepts the caller's SQO, resolves and filters all inverse
	* locators for the current thesaurus term, then assembles a tree of
	* dd_grid_cell_object instances that the client renders as the indexation table.
	*
	* Processing steps:
	*  1. Stores the SQO and extracts pagination + target section from it.
	*  2. Returns an empty array immediately if target_section is empty (nothing to
	*     show — typically means the user has not selected any section filter yet).
	*  3. Calls get_ar_section_top_tipo() to obtain the project-filtered locator map:
	*       { section_top_tipo: { section_top_id: [locator, ...], ... }, ... }
	*  4. For each section group:
	*     a. Creates a 'row'-type dd_grid_cell_object as the section container.
	*     b. Creates a 'column'-type dd_grid_cell_object labelled with the section
	*        name and optionally coloured via Ontology properties.
	*     c. Looks up the 'indexation_list' Ontology child for the section (falling
	*        back to the real section tipo if the given tipo is a virtual/alias one).
	*        Skips with an ERROR log entry if none is found (misconfigured Ontology).
	*     d. Processes head_ddo_map and row_ddo_map via process_ddo_map() to resolve
	*        'self' placeholders and populate labels/models.
	*     e. For every section_top_id within the group, calls get_grid_value() for the
	*        head (once) and for each locator (one per row), collecting the resulting
	*        dd_grid_cell_object cells and accumulating row counts.
	*  5. Returns the flat array of section container rows; one entry per section tipo.
	*
	* Output shape (array of dd_grid_cell_object):
	*   [
	*     // one entry per section_top_tipo
	*     dd_grid_cell_object { type:'row', row_count:<int>,
	*       value: [
	*         dd_grid_cell_object { type:'column', label:<section_name>,
	*           class_list:'caption section <tipo>[ <class_list>]',
	*           features:{ color:<hex> }?,     // only when Ontology defines a colour
	*           value: [
	*             dd_grid_cell_object { type:'row', ... },  // head (optional)
	*             dd_grid_cell_object { type:'row', ... },  // data rows …
	*           ]
	*         }
	*       ]
	*     },
	*     ...
	*   ]
	*
	* @param object $sqo  Search Query Object.  Required properties:
	*                       - section_tipo (string|string[]) — target section(s)
	*                       - filter_by_locators (array)     — source thesaurus locators
	*                       - limit (int)   [optional, default 500]
	*                       - offset (int)  [optional, default 0]
	*                       - total (mixed) [optional]
	* @return array $ar_indexation_grid  Flat array of section-level dd_grid_cell_object rows.
	*/
	public function build_indexation_grid( object $sqo ) : array {

		$ar_indexation_grid = [];

		// sqo
			$this->sqo = $sqo;

		// set pagination
			$this->pagination->limit	= $sqo->limit ?? 500;
			$this->pagination->offset	= $sqo->offset ?? 0;
			$this->pagination->total	= $sqo->total ?? null;

		// target section tipo(s). Normalized to array: the SQO section_tipo
		// can carry a single string or an array of sections (related mode)
			$target_section			= $sqo->section_tipo ?? null;
			$this->target_section	= empty($target_section)
				? null
				: (array)$target_section;

		// set filter section
			if( empty($this->target_section) ){
				return $ar_indexation_grid;
			}

		// ar_section_top_tipo
			$ar_section_top_tipo = $this->get_ar_section_top_tipo();
			// result sample
			// {
			//     "oh1": {
			//         "4": [
			//             {
			//                 "type": "dd96",
			//                 "section_tipo": "rsc167",
			//                 "section_id": "227",
			//                 "tag_id": "1",
			//                 "section_top_id": "4",
			//                 "section_top_tipo": "oh1",
			//                 "from_component_top_tipo": "rsc860",
			//                 "from_component_tipo": "hierarchy40"
			//             }
			//         ],
			//         "128": [
			//             {
			//                 "type": "dd96",
			//                 "section_tipo": "rsc167",
			//                 "section_id": "231",
			//                 "tag_id": "1",
			//                 "section_top_id": "128",
			//                 "section_top_tipo": "oh1",
			//                 "from_component_top_tipo": "rsc860",
			//                 "from_component_tipo": "hierarchy40"
			//             }
			//         ]
			//     }
			// }

		foreach ($ar_section_top_tipo as $current_section_tipo => $ar_values) {

			// section_grid_row: dd_grid_cell_object. Create the row of the section
				$section_grid_row = new dd_grid_cell_object();
					$section_grid_row->set_type('row');

			// label. Get the label of the current section
				$label = ontology_node::get_term_by_tipo($current_section_tipo, DEDALO_APPLICATION_LANG, true, true);

			// section_grid. Create the grid cell of the section
				$section_grid = new dd_grid_cell_object();
					$section_grid->set_type('column');
					$section_grid->set_label($label);
					$section_grid->set_render_label(true);
					$section_grid->set_class_list('caption section '.$current_section_tipo); // will be extended with indexation_list class_list
					// $section_grid->set_cell_type('text');

			// add the column to the row
				$section_grid_row->set_value([$section_grid]);

			// grid features. Used to pass the section color when is defined
				// section
				$ontology_node		= ontology_node::get_instance($current_section_tipo);
				$section_properties	= $ontology_node->get_properties();
				if (isset($section_properties->color)) {
					$section_grid->set_features((object)[
						'color' => $section_properties->color
					]);
				}

			// indexation_list. Get the term in the section that has the indexation_list information
				$ar_found = ontology_node::get_ar_tipo_by_model_and_relation(
					$current_section_tipo,
					'indexation_list', // string model
					'children' // string relation_type
				);
				$indexation_list = $ar_found[0] ?? null;
				if (empty($indexation_list)) {
					// try from real version indexation_list
					$real_tipo = section::get_section_real_tipo_static($current_section_tipo);
					if ($real_tipo!==$current_section_tipo) {
						$ar_found = ontology_node::get_ar_tipo_by_model_and_relation(
							$real_tipo,
							'indexation_list', // string model
							'children' // string relation_type
						);
						$indexation_list = $ar_found[0] ?? null;
					}
				}
				// check empty cases (misconfigured Ontology indexation_list children)
					if (empty($indexation_list)) {
						debug_log(__METHOD__
							. " Error. Ignored empty indexation_list. A config problem was detected. Fix ASAP. (misconfigured Ontology indexation_list children)". PHP_EOL
							. ' section_tipo: ' . to_string($current_section_tipo)
							, logger::ERROR
						);
						continue;
					}
					// if (!isset($indexation_list[0])) {
					// 	$msg  = "Error Processing Request build_indexation_grid:  section indexation_list is empty. Please configure structure for ($current_section_tipo) ";
					// 	$msg .= "Please check the consistency and model for 'relation_list'.";
					// 	debug_log(__METHOD__." $msg ".to_string(), logger::ERROR);
					// 	// throw new Exception($msg, 1);
					// 	continue;
					// }

			// get the properties of the indexation_list with all ddo_map
			// the ddo_map need to be processed to get a full ddo_map with all section_tipo resolved.
				$ontology_node	= ontology_node::get_instance($indexation_list);
				$properties		= $ontology_node->get_properties();

				// css selector add to section_grid if exists (like 'audiovisual')
				// normally is a CSS grouper selector with correspondence with a LESS file like view_indexation_audiovisual.less
				$class_list = $properties->class_list ?? null;
				if (!empty($class_list)) {
					$section_grid->set_class_list( $section_grid->class_list . ' '. $class_list);
				}

				$head_ddo_map = isset($properties->head)
					? $this->process_ddo_map($properties->head->show->ddo_map, $current_section_tipo)
					: null;

				$row_ddo_map = isset($properties->row)
					? $this->process_ddo_map($properties->row->show->ddo_map, $current_section_tipo)
					: null;

			// get the class_list that will used to render the head and row, it could be set in the preferences of the indexation_list
				$head_class_list	= $properties->head->class_list ?? null;
				$row_class_list		= $properties->row->class_list ?? null;

			// get the render label of the section rows
				$head_render_label	= $properties->head->render_label ?? false;
				$row_render_label	= $properties->row->render_label ?? false;

			// section_grid_values.Get the section values
			$section_grid_values	= [];
			// ar_section_rows_count. Store the rows count for every portal inside the section
			$ar_section_rows_count	= [];
			foreach ($ar_values as $current_section_id => $ar_locators) {

				$rows_max_count = [];

				// head
					if (isset($head_ddo_map)) {
						$ar_head_value = $this->get_grid_value($head_ddo_map, $ar_locators[0]);
						// take the maximum number of rows (the columns can has 1, 2, 55 rows and we need the highest value, 55)
						$head_row_count = max($ar_head_value->ar_row_count);

						$head_grid = new dd_grid_cell_object();
							$head_grid->set_type('row');
							$head_grid->set_row_count($head_row_count);
							$head_grid->set_class_list($head_class_list);
							$head_grid->set_render_label($head_render_label);
							$head_grid->set_value($ar_head_value->ar_cells);

						$section_grid_values[] = $head_grid;

						// store the head rows to sum up with the total rows
						$rows_max_count[] = $head_row_count;
					}

				// rows
					if (isset($row_ddo_map)) {
						foreach ($ar_locators as $current_locator) {

							// check tag_id
								if (!isset($current_locator->tag_id)) {
									debug_log(__METHOD__
										. " locator without tag_id " . PHP_EOL
										. ' locator: ' . json_encode($current_locator, JSON_PRETTY_PRINT)
										, logger::WARNING
									);
									// continue;
								}

							$ar_row_value = $this->get_grid_value($row_ddo_map, $current_locator);
							// take the maximum number of rows (the columns can has 1, 2, 55 rows and we need the highest value, 55)
							$row_count = max($ar_row_value->ar_row_count);
							// store the result to sum with the head rows
							$rows_max_count[] = $row_count;

							$row_grid = new dd_grid_cell_object();
								$row_grid->set_type('row');
								$row_grid->set_row_count($row_count);
								$row_grid->set_class_list($row_class_list);
								$row_grid->set_render_label($row_render_label);
								$row_grid->set_value($ar_row_value->ar_cells);

							$section_grid_values[] = $row_grid;
						}
					}else{
						debug_log(__METHOD__
							. " Undefined row_ddo_map" . PHP_EOL
							. " Configure Ontology properties for current section_tipo " .PHP_EOL
							. " current_section_tipo: " .$current_section_tipo . PHP_EOL
							. " Please, configure a indexation_list similar to 'oh6' "
							, logger::WARNING
						);
					}

				// sum the total rows for this locator
				$ar_section_rows_count[] = array_sum($rows_max_count);
			}//end foreach ($ar_values as $current_section_id => $ar_locators) {

			$section_grid->set_value($section_grid_values);

			// sum the total rows for the section and add the total rows to the section row
			$section_grid_row->set_row_count(array_sum($ar_section_rows_count));

			// add row
			$ar_indexation_grid[] = $section_grid_row;
		}//end foreach ($ar_section_top_tipo as $current_section_tipo => $ar_values)


		return $ar_indexation_grid;
	}//end build_indexation_grid



	/**
	* GET_GRID_VALUE
	* Resolves the display values for a single data row or head row in the grid.
	*
	* Given a processed ddo_map (from process_ddo_map()) and a single locator
	* representing the catalogue record to read from, this method:
	*  1. Normalises the locator: if section_top_tipo / section_top_id are absent
	*     (direct locators that have no "top" indirection), copies section_tipo /
	*     section_id to the top_* properties so all downstream code can rely on them.
	*  2. Filters the ddo_map to only the entries whose section_tipo matches the
	*     locator's section_top_tipo ("children_ddo").  Sub-component ddo entries
	*     whose section_tipo differs from the top tipo are handled as portal children
	*     — they are injected into the portal's request_config->show->ddo_map instead
	*     of being instantiated here as top-level columns.
	*  3. For each top-level ddo, determines the correct current_section_tipo and
	*     current_section_id to use (direct-match vs top-level fallback).
	*  4. Instantiates the component via component_common::get_instance() and calls
	*     its get_grid_value($ddo) method to obtain a dd_grid_cell_object.
	*  5. When the ddo has child entries (sub_ddo_map — identified by $child->parent
	*     matching the current $ddo->tipo), builds a minimal request_config carrying
	*     those child ddos and injects it into the component so that portals know
	*     which sub-fields to render.  If the child section_tipo matches the locator's
	*     own section_tipo (not the top), the locator itself is pre-set as the
	*     component's dato to resolve the correct portal row.
	*
	* Return shape:
	*   stdClass {
	*     ar_row_count : int[]   — one entry per column, value = number of rows that
	*                              column contributes (used by caller to compute
	*                              the maximum row span for the grid row).
	*     ar_cells     : dd_grid_cell_object[]  — one cell per top-level column ddo.
	*   }
	*
	* @param array  $ar_ddo   Processed ddo_map (output of process_ddo_map()).
	* @param object $locator  A single inverse locator from get_ar_section_top_tipo().
	* @return object $value   stdClass with ar_row_count (int[]) and ar_cells (dd_grid_cell_object[]).
	*/
	public function get_grid_value(array $ar_ddo, object $locator) : object {

		// top properties add
			$locator->section_top_tipo	= $locator->section_top_tipo ?? $locator->section_tipo;
			$locator->section_top_id	= $locator->section_top_id ?? $locator->section_id;

		// children_ddo. get only the ddo that are children of the section top_tipo
		// the other ddo are sub components that will be injected to the portal as request_config->show
			$ar_children_ddo = array_filter($ar_ddo, function($ddo) use($locator){
				return $ddo->section_tipo===$locator->section_top_tipo;
			});


		$ar_cells		= [];
		$ar_row_count	= [];
		foreach ($ar_children_ddo as $ddo) {

			// set the separator if the ddo has a specific separator, it will be used instead the component default separator
				// $fields_separator	= $ddo->fields_separator ?? null;
				// $records_separator	= $ddo->records_separator ?? null;
				// $format_columns		= $ddo->format_columns ?? null;
				// $class_list			= $ddo->class_list ?? null;

			// section_tipo. Check if the locator has section_top_tipo and set the section_tipo to be used
			// some locators has top_tipo and top_id because are indexation of the resources and the locator stored the inventory section that call the resource
			// but some indexation are direct to the resource or inventory section and doesn't has top_tipo and top_id
				$current_section_tipo = ($ddo->section_tipo===$locator->section_tipo)
					? $locator->section_tipo
					: (($ddo->section_tipo === $locator->section_top_tipo)
						? $locator->section_top_tipo
						: false);

			// section_id
				$current_section_id = ($ddo->section_tipo===$locator->section_tipo)
					? $locator->section_id
					: $locator->section_top_id;

			// component. Create the component to get the value of the column
				$current_lang 		= ontology_node::get_translatable($ddo->tipo) ? DEDALO_DATA_LANG : DEDALO_DATA_NOLAN;
				$component_model	= ontology_node::get_model_by_tipo($ddo->tipo,true);
				$current_component	= component_common::get_instance(
					$component_model,
					$ddo->tipo,
					$current_section_id,
					'indexation_list',
					$current_lang,
					$current_section_tipo,
					true // bool cache
				);
				$current_component->set_locator($locator);
				// set the first id of the column_obj, if the component is a related component it will used to create a path of the deeper components
				$column_obj = new stdClass();
					$column_obj->id = $ddo->section_tipo.'_'.$ddo->tipo;
				$current_component->column_obj = $column_obj;

			// check if the component has ddo children,
			// used by portals to define the path to the "text" component that has the value, it will be the last component in the chain of locators
				$sub_ddo_map		= [];
				$sub_section_tipo	= '';
				foreach ($ar_ddo as $child_ddo) {
					if($child_ddo->parent===$ddo->tipo){
						$sub_section_tipo = $child_ddo->section_tipo;
						$sub_ddo_map[] = $child_ddo;
					}
				}
				// if the component has sub_ddo, create the request_config to be injected to component
				// the request_config will be used instead the default request_config.
				if (!empty($sub_ddo_map)) {

					$show = new stdClass();
						$show->ddo_map = $sub_ddo_map;

					$request_config = new stdClass();
						$request_config->api_engine	= 'dedalo';
						$request_config->type		= 'main';
						// $rqo->set_sqo($sqo);
						$request_config->show		= $show;

					$current_component->request_config = [$request_config];

					// check section_tipo of the current locator are the same of the component are referred.
					// if the locator has the same section_tipo than component (IMPORTANT: NOT the section_top_tipo) the locator need to be injected to the component.
					// ex: oh1 has more than one audiovisual, the locator of the indexation locator has the reference to the row of the audiovisual portal to get the columns.
					if($sub_section_tipo === $locator->section_tipo){
						$ar_dato = [$locator];
						$current_component->set_dato($ar_dato);
					}
				}

			// component_value add
				$component_value	= $current_component->get_grid_value($ddo);
				$ar_row_count[]		= $component_value->row_count ?? 0;
				$ar_cells[]			= $component_value;
		}// end foreach ($ar_children_ddo as $ddo)


		// value final
			$value = new stdClass();
				$value->ar_row_count	= $ar_row_count;
				$value->ar_cells		= $ar_cells;


		return $value;
	}//end get_grid_value



	/**
	* PROCESS_DDO_MAP
	* Enriches a raw Ontology ddo_map array so it is ready for use in get_grid_value().
	*
	* The ddo_map entries stored in Ontology properties use sentinel values ('self')
	* for section_tipo and parent to keep them section-agnostic.  This method
	* resolves those sentinels to the concrete section_tipo of the current context
	* and also decorates every entry with its human-readable label and component model
	* so callers do not need to re-query the Ontology per row.
	*
	* Per-entry transformations applied:
	*  - Entries without a 'tipo' property are skipped and logged as ERROR
	*    (indicates an Ontology misconfiguration).
	*  - 'label'        — populated from ontology_node::get_term_by_tipo().
	*  - 'section_tipo' — 'self' sentinel replaced with the caller-supplied $section_tipo.
	*  - 'parent'       — 'self' sentinel replaced with $section_tipo.
	*  - 'mode'         — defaults to 'indexation_list' when not already set.
	*  - 'model'        — populated from ontology_node::get_model_by_tipo().
	*
	* Note: mutates the incoming ddo_map objects in-place before collecting them
	* into $final_ddo_map.  Callers must not re-use the original objects after
	* calling this method if they depend on the original sentinel values.
	*
	* @param array  $ar_ddo_map    Raw ddo_map from Ontology properties (head->show->ddo_map
	*                              or row->show->ddo_map).
	* @param string $section_tipo  Concrete section tipo used to replace 'self' sentinels.
	* @return array $final_ddo_map Enriched ddo_map ready for get_grid_value().
	*/
	public function process_ddo_map(array $ar_ddo_map, string $section_tipo) : array {

		$final_ddo_map = [];
		foreach ($ar_ddo_map as $current_ddo_map) {

			// check without tipo case
				if (!isset($current_ddo_map->tipo)) {
					debug_log(__METHOD__.  ' ERROR. Ignored current_ddo_map don\'t have tipo: ++ '.to_string($current_ddo_map), logger::ERROR);
					dump($current_ddo_map, ' ERROR. Ignored current_ddo_map don\'t have tipo: ++ '.to_string($section_tipo));
					continue;
				}

			// label. Add to all ddo_map items
				$current_ddo_map->label = ontology_node::get_term_by_tipo($current_ddo_map->tipo, DEDALO_APPLICATION_LANG, true, true);

			// section_tipo. Set the default "self" value to the current section_tipo (the section_tipo of the parent)
				$current_ddo_map->section_tipo = $current_ddo_map->section_tipo==='self'
					? $section_tipo
					: $current_ddo_map->section_tipo;

			// parent. Set the default "self" value to the current tipo (the parent)
				$current_ddo_map->parent = $current_ddo_map->parent==='self'
					? $section_tipo
					: $current_ddo_map->parent;

			// mode
				$current_ddo_map->mode = isset($current_ddo_map->mode)
					? $current_ddo_map->mode
					: 'indexation_list';

			// model
				$current_ddo_map->model = ontology_node::get_model_by_tipo($current_ddo_map->tipo,true);


			$final_ddo_map[] = $current_ddo_map;
		}//end foreach ($ar_ddo_map as $current_ddo_map)


		return $final_ddo_map;
	}//end process_ddo_map



	/**
	* GET_AR_SECTION_TOP_TIPO
	* Retrieves and groups all inverse locators for the current thesaurus term,
	* then applies a per-user project-visibility filter.
	*
	* Step 1 — collect and group:
	*   Calls get_ar_locators() to fetch every catalogue record that references the
	*   current thesaurus term.  Each raw locator is examined for section_top_tipo /
	*   section_top_id; when absent (direct locators with no indirection layer) the
	*   section_tipo / section_id values are copied to the top_* slots.  Locators are
	*   then accumulated in a 3-level map:
	*     $ar_section_top_tipo[section_top_tipo][section_top_id][] = $locator
	*   This groups rows first by section type and then by the top-level record ID,
	*   matching the nested display structure expected by build_indexation_grid().
	*
	* Step 2 — project filter (non-global-admin only):
	*   Global admins see all rows.  Other users are restricted to records whose
	*   component_filter value overlaps with the projects that user belongs to.  For
	*   each section_top_tipo a component_filter tipo is located via
	*   section::get_ar_children_tipo_by_model_name_in_section().  Then, for each
	*   section_top_id, the component_filter data is loaded and compared against the
	*   user's project locators (locator::in_array_locator on section_id + section_tipo).
	*   Rows with no matching project are removed from the map and logged at DEBUG level.
	*
	* Step 3 — performance guard:
	*   When SHOW_DEBUG is enabled, the total wall-clock nanosecond time is checked
	*   against 150 ms; methods that exceed this threshold are dumped to the log to
	*   help identify performance regressions.
	*
	* @return array $ar_section_top_tipo
	*   Shape: array<string, array<int|string, locator[]>>
	*   — top-level key: section_top_tipo string
	*   — second-level key: section_top_id (int or string)
	*   — value: array of locator objects for that record
	*/
	protected function get_ar_section_top_tipo() : array {
		$start_time=start_time();

		$ar_section_top_tipo	= array();
		$user_id				= logged_user_id();
		$ar_locators			= $this->get_ar_locators();

		foreach ($ar_locators as $current_locator) {
			// dump($current_locator,"current_locator");
			# ID SECTION

			$section_tipo	= $current_locator->section_tipo;
			$section_id		= $current_locator->section_id;

			// if the locator couldn't has section_top_tipo or section_top_id, because it's a direct locator, copy the section_tipo and section_id to the top_* properties
			$section_top_tipo	= $current_locator->section_top_tipo ?? $current_locator->section_tipo;
			$section_top_id		= $current_locator->section_top_id ?? $current_locator->section_id;
			$component_tipo		= $current_locator->component_tipo ?? null;
			$tag_id				= $current_locator->tag_id ?? null;


			# AR_SECTION_TOP_TIPO MAP
			$ar_section_top_tipo[$section_top_tipo][$section_top_id][] = $current_locator;
		}

		#
		# FILTER RESULT BY USER PROJECTS
		if( false===security::is_global_admin($user_id) ) {

			# USER PROJECTS : All projects that current user can view
			$ar_user_projects = (array)component_filter_master::get_user_projects( $user_id );
				#dump($ar_user_projects, ' ar_user_projects ++ '.to_string());

			# Filter
			foreach ($ar_section_top_tipo as $section_top_tipo => $ar_values) {

				// component filter by section tipo
					$section_real_tipo		= section::get_section_real_tipo_static($section_top_tipo);
					$component_filter_tipo	= section::get_ar_children_tipo_by_model_name_in_section($section_real_tipo, ['component_filter'])[0] ?? null;
					if (empty($component_filter_tipo)) {
						debug_log(__METHOD__
							. " Error: component_filter_tipo not found" . PHP_EOL
							. ' section_top_tipo: ' . $section_top_tipo
							, logger::ERROR
						);
						continue;	// Skip this
					}

				// ar_keys are section_id of current section tipo records
					$ar_keys = array_keys($ar_values);
					foreach ($ar_keys as $current_id_section) {
						// get the user projects
						$component_filter = component_common::get_instance(
							'component_filter',
							$component_filter_tipo,
							$current_id_section,
							'list',
							DEDALO_DATA_NOLAN,
							$section_top_tipo
						);
						$component_filter_data = $component_filter->get_data() ?? [];

						$in_user_projects = false;
						foreach ($ar_user_projects as $user_project_locator) {
							if (true===locator::in_array_locator($user_project_locator, $component_filter_data, $ar_properties=['section_id','section_tipo'])) {
								$in_user_projects = true;
								break;
							}
						}
						if ($in_user_projects===false) {
							debug_log(__METHOD__
								." Removed row from thesaurus index_ts list (project not match with user projects) ". PHP_EOL
								.' row: ' . to_string($ar_section_top_tipo[$section_top_tipo][$current_id_section])
								, logger::DEBUG
							);
							unset($ar_section_top_tipo[$section_top_tipo][$current_id_section]);
						}
					}
			}
		}//end if( ($is_global_admin = security::is_global_admin($user_id))!==true ) {

		// debug
			if(SHOW_DEBUG===true) {
				$total	= start_time()-$start_time; // nanoseconds
				$slow	= 150000000; // 150 ms (150 * 1000000)
				if ($total>$slow) {
					dump($total,"SLOW METHOD (>$slow): total secs $total");
				}
			}


		return $ar_section_top_tipo;
	}//end get_ar_section_top_tipo



	/**
	* GET_AR_LOCATORS
	* Fetches the flat array of inverse locators for the current thesaurus term.
	*
	* This method is the bridge between the high-level indexation_grid and the
	* low-level search_related infrastructure:
	*
	*  1. Reads the SQO's filter_by_locators array.  Each entry is a plain object
	*     (section_tipo + section_id) identifying the thesaurus term locator(s) whose
	*     back-relations should be found.  These are converted into typed locator
	*     instances with the relation_type obtained from the component itself.
	*
	*  2. Calls search_related::get_referenced_locators() passing the built filter
	*     locators, the current pagination limit/offset, and the target_section array.
	*     This executes a JSONB matrix scan across all relation tables and returns raw
	*     result rows.
	*
	*  3. Passes the raw rows through component_relation_index::parse_data(), which
	*     remaps the search_related row fields (section_tipo, section_id, section_top_tipo,
	*     section_top_id, tag_id, from_component_tipo, etc.) into proper locator
	*     objects ready for grouping in get_ar_section_top_tipo().
	*
	* The commented-out block at the bottom of the method preserves the previous
	* implementation that routed through component::get_data_paginated(); it is
	* intentionally retained for reference during the ongoing search architecture
	* consolidation and MUST NOT be removed or re-activated without verifying parity.
	*
	* (!) $sqo->filter_by_locators is accessed without a null guard (line 612).
	*     If the SQO arrives without filter_by_locators set, PHP will raise a warning
	*     and the foreach will be skipped silently, returning an empty locator array.
	*     Callers must ensure the SQO carries a non-null filter_by_locators.
	*
	* @return array $ar_locators  Flat array of locator objects representing all
	*                              catalogue records that tag the current thesaurus term.
	*/
	public function get_ar_locators() : array {

		// short vars
		$sqo				= $this->sqo;
		$limit				= $this->pagination->limit;
		$offset				= $this->pagination->offset;
		$target_section		= $this->target_section;
		$filter_by_locators	= $sqo->filter_by_locators;

		$model = ontology_node::get_model_by_tipo($this->tipo, true);

		// indexations
		$component = component_common::get_instance(
			$model, //'component_relation_index',
			$this->tipo,
			$this->section_id,
			'list',
			DEDALO_DATA_NOLAN,
			$this->section_tipo,
			true // bool cache
		);

		$relation_type = $component->get_relation_type();

		$filter_locators = [];
		foreach ($filter_by_locators as $current_locator) {

			// filter_locator
			$filter_locator = new locator();
				$filter_locator->set_type( $relation_type ); // as dd96
				$filter_locator->set_section_tipo($current_locator->section_tipo);
				$filter_locator->set_section_id($current_locator->section_id);

			$filter_locators[] = $filter_locator;
		}

		// ar_inverse_locators locators. Get calculated inverse locators for all matrix tables
		// referenced_locators from search_related
			$ar_inverse_locators = search_related::get_referenced_locators(
				$filter_locators,
				$limit,
				$offset,
				false,
				$target_section
			);

		// format result
			$ar_locators = component_relation_index::parse_data($ar_inverse_locators);



		// // set the pagination into the component
		// $component->pagination->limit	= $limit;
		// $component->pagination->offset	= $offset;

		// // set the filter section, is used to get specific sections
		// $component->target_section		= $target_section;

		// // use the data paginated instead the data, sometimes the data could be huge (thousands)
		// $ar_locators = $component->get_data_paginated();

		return $ar_locators;
	}//end get_ar_locators



}//end class indexation_grid
