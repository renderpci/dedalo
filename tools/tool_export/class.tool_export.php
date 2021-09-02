<?php
/*
* CLASS tool_export
*
*
*/
class tool_export { // extends tool_common

	public $section_tipo;
	public $section_obj;	# received section
	public $ar_records;		# Array of records to export (section_id) or null
	public $data_format;  	# string 'standard', 'dedalo'

	// public static $quotes 	 		  = '"';
	// public static $delimiter 		  = ';';
	// public static $internal_separator = PHP_EOL;

	// public $section_list_custom;



	/**
	* __CONSTRUCT
	*/
	public function __construct($section_tipo, $model, $data_format='standard',  $ar_ddo_map=[], $sqo=null) {

		// Fix mode
		$this->mode = 'tool_export';

		// fix section_tipo
		$this->section_tipo = $section_tipo;

		// fix model
		$this->model = $model;

		// Fix data_format
		$this->data_format = $data_format;

		// fix ar_ddo_map
		$this->ar_ddo_map = $ar_ddo_map;

		// Fix sqo
		$this->sqo = $sqo;

		// Fix records
		$this->ar_records = null;

		return true;
	}//end __construct



	/**
	* GET_EXPORT_GRID
	* @see class.request_query_object.php
	* @return dd_grid object $result
	*/
	public static function get_export_grid($arguments){

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';

		// // validate input data
		// 	if (empty($arguments->source->section_tipo) || empty($arguments->source->arguments->export_format) || empty($arguments->source->arguments->ar_ddo_to_export)) {
		// 		$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty properties';
		// 		return $response;
		// 	}

		// ddo_source
			// $options = $arguments->source->arguments;

		// source vars
			$section_tipo		= $arguments->section_tipo ?? $ddo_source->tipo;
			$model				= $arguments->model ?? 'section';
			$export_format		= $arguments->export_format;
			$ar_ddo_to_export	= $arguments->ar_ddo_to_export;
			$sqo				= $arguments->sqo;

		// export options
			$tool_export	= new tool_export($section_tipo, $model, $export_format, $ar_ddo_to_export, $sqo);
			$export_grid	= $tool_export->build_export_grid();


			$response->msg		= 'Ok. Request done';
			$response->result	= $export_grid;

		return $response;
	}//end get_export_grid



	/**
	* BUILD_EXPORT_GRID
	* @return
	*/
	public function build_export_grid() {

		$ar_ddo_map	= $this->ar_ddo_map;
		$records	= $this->get_records();

		// get the section values
		$section_grid_values	= [];

		$ar_head_columns = [];
		// $column_count = sizeof($ar_ddo_map) ?? 0;
		// foreach ($ar_ddo_map as $current_ddo) {

		// 	// create the grid cell of the section
		// 		$section_grid = new dd_grid_cell_object();
		// 			$section_grid->set_type('column');
		// 			$section_grid->set_label($current_ddo->label);
		// 			$section_grid->set_render_label(true);
		// 			$section_grid->set_class_list('caption section');
		// 			// $section_grid->set_cell_type('text');

		// 			$ar_head_columns[] = $section_grid;
		// }
		// dd_grid_cell_object. Create the row of the section


		// store the rows count for every portal inside the section
			$ar_section_rows_count		= [];
		// store the head rows to sum up with the total rows
			$rows_max_count = [];
		// store the column names
			$ar_column_labels = [];
		// rows values
			$ar_row_values = [];

		foreach ($records as $key => $current_locator) {

			$ar_row_value = $this->get_value($ar_ddo_map, $current_locator);

			if($key === 0){
				$ar_column_labels = $ar_row_value->ar_column_labels;
			}

			// take the maximum number of rows (the rows can has 1, 2, 55 rows and we need the highest value, 55)
			$row_count = max($ar_row_value->ar_row_count);
			// store the result to sum with the head rows
			$rows_max_count[] = $row_count;

			// take the columns
			$columns_count = $ar_row_value->ar_column_count;

			$row_grid = new dd_grid_cell_object();
				$row_grid->set_type('row');
				$row_grid->set_row_count($row_count);
				$row_grid->set_column_count($columns_count);
				$row_grid->set_column_labels($ar_row_value->ar_column_labels);
				// $row_grid->set_class_list($row_class_list);
				// $row_grid->set_render_label($row_render_label);
				$row_grid->set_value($ar_row_value->ar_cells);

			$ar_row_values[] = $row_grid;
		}
		// sum the total rows for this locator
		$ar_section_rows_count[] = array_sum($rows_max_count);
		// take the maximum number of columns (the columns can has 1, 2, 55 columns and we need the highest value, 55)
		$ar_section_columns_count = sizeof($ar_column_labels);

		for ($i=0; $i < $ar_section_columns_count; $i++) {
			// create the grid cell of the section
				$section_grid = new dd_grid_cell_object();
					$section_grid->set_type('column');
					$section_grid->set_label($ar_column_labels[$i]);
					$section_grid->set_render_label(true);
					$section_grid->set_class_list('caption section');
					// $section_grid->set_cell_type('text');

			$ar_head_columns[] = $section_grid;
		}
		$section_grid_row = new dd_grid_cell_object();
			$section_grid_row->set_type('row');
			$section_grid_row->set_value($ar_head_columns);
			// sum the total rows for the section and add the total rows to the section row
			$section_grid_row->set_row_count(1);
			$section_grid_row->set_column_count($ar_section_columns_count);


		$section_grid_values[] = $section_grid_row;
		$section_grid_values = array_merge($section_grid_values, $ar_row_values);

		return $section_grid_values;
	}//end build_export_grid


	/**
	* GET_RECORDS
	* @return array|null
	*/
	public function get_records() {

		if (!empty($this->ar_records)) {
			return $this->ar_records;
		}

		#
		# SEARCH_OPTIONS
		$section_tipo	= $this->section_tipo;
		$model			= $this->model; // section tipo like section

		switch ($model) {
			case 'component_portal':
				// To define
				break;

			default:
				$sqo = $this->sqo;

				if(empty($sqo)){
					debug_log(__METHOD__." section without sqo defined, please review the caller: $section_tipo ".to_string(), logger::WARNING);
				}

	 			// sections
				$sections = sections::get_instance(null, $sqo, $section_tipo);
				$this->ar_records = $sections->get_dato();

				break;
		}

		return $this->ar_records;
	}//end get_records



	/**
	* GET_VALUE
	*
	* @param array $ar_ddo
	* @param object $locator
	*
	* @return object $value
	*/
	public function get_value($ar_ddo, $locator) {

		$ar_cells			= [];
		$ar_row_count		= [];
		$ar_column_labels	= [];

		foreach ($ar_ddo as $current_ddo) {

			// children_ddo. get only the ddo that are children of the section top_tipo
			// the other ddo are sub components that will be injected to the portal as request_config->show
			$first_path	= $current_ddo->path[0];
			$ddo		= ($first_path->section_tipo===$locator->section_tipo) ? $first_path : null;

			// set the separator if the ddo has a specific separator, it will be used instead the component default separator
				$separator_fields	= $ddo->separator_fields ?? null;
				$separator_rows		= $ddo->separator_rows ?? null;
				$format_columns		= $ddo->format_columns ?? null;
				$class_list			= $ddo->class_list ?? null;

			// component. Create the component to get the value of the column
				$RecordObj_dd		= new RecordObj_dd($ddo->component_tipo);
				$current_lang		= $RecordObj_dd->get_traducible()==='si' ? DEDALO_DATA_LANG : DEDALO_DATA_NOLAN;
				$component_model	= RecordObj_dd::get_modelo_name_by_tipo($ddo->component_tipo, true);

				$current_component	= component_common::get_instance($component_model,
																	 $ddo->component_tipo,
																	 $locator->section_id,
																	 'edit',
																	 $current_lang,
																	 $locator->section_tipo);
				$current_component->set_locator($locator);

			// check if the component has ddo children in the path,
			// used by portals to define the path to the "text" component that has the value, it will be the last component in the chain of locators
				$sub_ddo_map		= [];
				foreach ($current_ddo->path as $key => $child_ddo) {
					if($key === 0) continue;
					$new_ddo = new dd_object();
						$new_ddo->set_tipo($child_ddo->component_tipo);
						$new_ddo->set_section_tipo($child_ddo->section_tipo);
						$new_ddo->set_model($child_ddo->modelo);
						$new_ddo->set_parent($current_ddo->path[$key-1]->component_tipo);
						$new_ddo->set_label($child_ddo->name);
						$sub_ddo_map[] = $new_ddo;
				}

				// if the component has sub_ddo, create the request_config to be injected to component
				// the request_config will be used instead the default request_config.
				if (!empty($sub_ddo_map)) {

					$show = new stdClass();
						$show->ddo_map = $sub_ddo_map;

					$request_config = new stdClass();
						$request_config->api_engine	= 'dedalo';
						$request_config->show		= $show;

					$current_component->request_config = [$request_config];

					// inject the locator as dato for the component
						$component_dato = array_filter($locator->datos->relations, function($el) use($ddo){
							return $el->from_component_tipo === $ddo->component_tipo;
						});

						// $ar_dato = [$locator];
						$current_component->set_dato($component_dato);
				}

			// get component_value add
				$component_value = ($this->data_format==='dedalo')
					? $current_component->get_raw_value()
					: $current_component->get_value($current_lang, $ddo);
				}

			// get component label


			$sub_component_labels	= $component_value->column_labels ?? [];
			$len = sizeof($sub_component_labels);
			if($len === 0){
				$ar_column_labels[]		= $current_component->get_label();
			}
			for ($i=0; $i < $len; $i++) {
				$ar_column_labels[] = $sub_component_labels[$i];
			}
			$ar_row_count[]		= $component_value->row_count ?? 1;
			$ar_cells[]			= $component_value;

		}// end foreach ($ar_children_ddo as $ddo)


		// value final
			$value = new stdClass();
				$value->ar_row_count		= $ar_row_count;
				$value->ar_column_count		= sizeof($ar_column_labels);
				$value->ar_column_labels	= $ar_column_labels;
				$value->ar_cells			= $ar_cells;


		return $value;
	}//end get_value





	

}//end class tool_export
