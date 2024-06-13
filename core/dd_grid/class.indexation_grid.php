<?php
/**
* CLASS INDEXATION_GRID
* Manage the indexations of the thesaurus term
* build the grid of the indexation to show in the thesaurus
*/
class indexation_grid {



	/**
	* @var
	*/
		protected $tipo;
		protected $section_id;
		protected $section_tipo;
		protected $value;
		protected $pagination;
		protected $filter_section;



	/**
	* CONSTRUCT
	*/
	public function __construct($section_tipo, $section_id, $tipo, $value=false) {

		$this->tipo			= $tipo;
		$this->section_id	= $section_id;
		$this->section_tipo	= $section_tipo;
		$this->value		= ($value!==false) ? $value : null; // ["oh1",] array of section_tipo \ used to filter the locator with specific section_tipo (like 'oh1')

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
	* @param int $limit
	* @param int $offset
	* @param int|null $total
	* @return array $ar_indexation_grid
	*/
	public function build_indexation_grid( ?int $limit=500, ?int $offset=0, ?int $total=null, array $filter_section=null) : array {

		$ar_indexation_grid = [];

		// set pagination
			$this->pagination->limit	= $limit;
			$this->pagination->offset	= $offset;
			$this->pagination->total	= $total;

		// set filter section
			if( empty($filter_section) ){
				return $ar_indexation_grid;
			}
			$this->filter_section = $filter_section;


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
				$label = RecordObj_dd::get_termino_by_tipo($current_section_tipo, DEDALO_APPLICATION_LANG, true, true);

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
				$RecordObj_dd		= new RecordObj_dd($current_section_tipo);
				$section_properties	= $RecordObj_dd->get_properties();
				if (isset($section_properties->color)) {
					$section_grid->set_features((object)[
						'color' => $section_properties->color
					]);
				}

			// indexation_list. Get the term in the section that has the indexation_list information
				$ar_found = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation(
					$current_section_tipo,
					'indexation_list', // string model
					'children' // string relation_type
				);
				$indexation_list = $ar_found[0] ?? null;
				if (empty($indexation_list)) {
					// try from real version indexation_list
					$real_tipo = section::get_section_real_tipo_static($current_section_tipo);
					if ($real_tipo!==$current_section_tipo) {
						$ar_found = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation(
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
				$RecordObj_dd	= new RecordObj_dd($indexation_list);
				$properties		= $RecordObj_dd->get_properties();

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
	*
	* @param array $ar_ddo
	* @param object $locator
	*
	* @return object $value
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
				$RecordObj_dd		= new RecordObj_dd($ddo->tipo);
				$current_lang		= $RecordObj_dd->get_traducible()==='si' ? DEDALO_DATA_LANG : DEDALO_DATA_NOLAN;
				$component_model	= RecordObj_dd::get_modelo_name_by_tipo($ddo->tipo,true);
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
	* @return array $final_ddo_map
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
				$current_ddo_map->label = RecordObj_dd::get_termino_by_tipo($current_ddo_map->tipo, DEDALO_APPLICATION_LANG, true, true);

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
				$current_ddo_map->model = RecordObj_dd::get_modelo_name_by_tipo($current_ddo_map->tipo,true);


			$final_ddo_map[] = $current_ddo_map;
		}//end foreach ($ar_ddo_map as $current_ddo_map)


		return $final_ddo_map;
	}//end process_ddo_map



	/**
	* GET_AR_SECTION_TOP_TIPO
	* Map/group ar_locators (indexations of current term) as formatted array section[id] = ar_data
	* Filter locators for current user (by project)
	* @return array $ar_section_top_tipo
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
			$ar_user_projects = (array)filter::get_user_projects( $user_id );
				#dump($ar_user_projects, ' ar_user_projects ++ '.to_string());

			# Filter
			foreach ($ar_section_top_tipo as $section_top_tipo => $ar_values) {

				// component filter by section tipo
					$section_real_tipo		= section::get_section_real_tipo_static($section_top_tipo);
					$component_filter_tipo	= section::get_ar_children_tipo_by_model_name_in_section($section_real_tipo, ['component_filter'])[0];
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
						$component_filter_dato = (array)$component_filter->get_dato();

						$in_user_projects = false;
						foreach ($ar_user_projects as $user_project_locator) {
							if (true===locator::in_array_locator($user_project_locator, $component_filter_dato, $ar_properties=['section_id','section_tipo'])) {
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
	* Get all indexations (locators) of current thesaurus term
	* @return array $ar_locators
	*/
	public function get_ar_locators() : array {

		// short vars
		$limit			= $this->pagination->limit;
		$offset			= $this->pagination->offset;
		$filter_section	= $this->filter_section;

		$model = RecordObj_dd::get_modelo_name_by_tipo($this->tipo, true);

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

		// set the pagination into the component
		$component->pagination->limit	= $limit;
		$component->pagination->offset	= $offset;

		// set the filter section, is used to get specific sections
		$component->filter_section		= $filter_section;

		// use the data paginated instead the data, sometimes the data could be huge (thousands)
		$ar_locators = $component->get_dato_paginated();

		return $ar_locators;
	}//end get_ar_locators



}//end class indexation_grid
