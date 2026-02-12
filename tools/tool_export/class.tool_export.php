<?php declare(strict_types=1);
/**
 * CLASS TOOL_EXPORT
 * Manages data export functionality for Dédalo sections
 *
 * This tool handles the export of section records to various formats (CSV, Excel, etc.)
 * by building a grid structure from section data. It supports:
 * - Multiple data formats (standard, dedalo_raw, grid_value)
 * - Portal and related component resolution
 * - High-performance streaming for large datasets
 * - Memory-efficient chunked processing
 * - Flexible column mapping via DDO (Data Definition Objects)
 *
 * Key features:
 * - Two-pass streaming for memory efficiency
 * - Dynamic column discovery for portals
 * - Caching for ontology lookups
 * - Support for nested portal structures
 * - Configurable data formatting
 *
 * @package Dedalo
 * @subpackage Tools
 */
class tool_export extends tool_common {

	/**
	 * @var int Maximum execution time in seconds (10 hours)
	 */
	private const MAX_EXECUTION_TIME = 36000;

	/**
	 * @var string Data format mode: 'standard', 'dedalo_raw', 'grid_value', 'value'
	 */
	public string $data_format;

	/**
	 * @var array Array of DDO (Data Definition Objects) defining columns to export
	 */
	public array $ar_ddo_map;

	/**
	 * @var object Search query object defining records to export
	 */
	public object $sqo;

	/**
	 * @var string Model type (typically 'section')
	 */
	public string $model;

	/**
	 * @var db_result|null Iterator of records to export (section_id) or null if using sqo
	 */
	public ?db_result $records = null;

	/**
	 * @var locator|null Static cache for locator object to avoid recreation
	 */
	protected static ?locator $locator = null;

	/**
	 * @var array Static cache for ontology data (model, lang) by tipo
	 */
	protected static array $ontology_cache = [];



	/**
	 * SETUP
	 * Initializes main class variables for export operation
	 *
	 * @param object $options Configuration object with:
	 *   - data_format: string Export format ('standard', 'dedalo_raw', 'grid_value', 'value')
	 *   - ar_ddo_map: array DDO map defining columns to export
	 *   - sqo: object Search query object
	 *   - model: string Model type (typically 'section')
	 *   - section_tipo: string Section tipo identifier
	 *
	 * @return void
	 */
	protected function setup(object $options) : void {

		// options
			$data_format	= $options->data_format;
			$ar_ddo_map		= $options->ar_ddo_map;
			$sqo			= $options->sqo;
			$model			= $options->model;
			$section_tipo	= $options->section_tipo;

		// fix data_format
			$this->data_format = $data_format;

		// fix ar_ddo_map
			$this->ar_ddo_map = $ar_ddo_map;

		// fix sqo
			// add filter from saved session if exists
			$sqo_id = section::build_sqo_id($section_tipo);
			if (!isset($sqo->filter)
				&& isset($_SESSION['dedalo']['config']['sqo'][$sqo_id])
				&& isset($_SESSION['dedalo']['config']['sqo'][$sqo_id]->filter)
				){
				// add current section filter
				$sqo->filter = $_SESSION['dedalo']['config']['sqo'][$sqo_id]->filter;
			}
			$this->sqo = $sqo;

		// fix model
			$this->model = $model;

		// fix records
			$this->records = null;
	}//end setup



	/**
	 * GET_EXPORT_GRID
	 * Builds the export grid ready to parse in export_tool (client)
	 * Main entry point for export operations
	 *
	 * @see class.request_query_object.php
	 *
	 * @param object $options Configuration object with:
	 *   - section_tipo: string Section tipo identifier - REQUIRED
	 *   - model: string Model type (default: 'section')
	 *   - data_format: string Export format - REQUIRED
	 *   - ar_ddo_to_export: array DDO map defining columns - REQUIRED
	 *   - sqo: object Search query object - REQUIRED
	 *   - ndjson_stream: bool Whether to use streaming mode (default: false)
	 *
	 * Sample options:
	 * {
	 *    "section_tipo": "oh1",
	 *    "model": "section",
	 *    "data_format": "standard",
	 *    "ar_ddo_to_export": [
	 *        {
	 *            "id": "oh1_oh62_list_lg-nolan",
	 *            "tipo": "oh62",
	 *            "section_tipo": "oh1",
	 *            "model": "component_section_id",
	 *            "parent": "oh1",
	 *            "lang": "lg-nolan",
	 *            "mode": "search",
	 *            "label": "Id",
	 *            "path": [{
	 *                "section_tipo": "oh1",
	 *                "component_tipo": "oh62",
	 *                "model": "component_section_id",
	 *                "name": "Id"
	 *            }]
	 *        }
	 *    ],
	 *    "sqo": {
	 *        "section_tipo": ["oh1"],
	 *        "limit": 0,
	 *        "offset": 0
	 *    }
	 * }
	 *
	 * @return object Response object with:
	 *   - result: array|false Export grid data or false on error
	 *   - msg: string Status message
	 *
	 * @throws Exception If setup or grid building fails
	 */
	public static function get_export_grid(object $options) : object {

		set_time_limit(self::MAX_EXECUTION_TIME);

		$is_stream = $options->ndjson_stream ?? false;

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';

		// options
			$section_tipo		= $options->section_tipo ?? $options->tipo;
			$model				= $options->model ?? 'section';
			$data_format		= $options->data_format;
			$ar_ddo_to_export	= $options->ar_ddo_to_export;
			$sqo				= $options->sqo;

		// export options
			$tool_export = new tool_export(null, $section_tipo);
			$tool_export->setup((object)[
				'data_format'	=> $data_format,
				'ar_ddo_map'	=> $ar_ddo_to_export,
				'sqo'			=> $sqo,
				'model'			=> $model,
				'section_tipo'	=> $section_tipo
			]);

		if ($is_stream) {
			if (SHOW_DEBUG) debug_log(__METHOD__ . " Stream started for section_tipo: " . $section_tipo, logger::DEBUG);
			$tool_export->stream_export_grid();
			if (SHOW_DEBUG) debug_log(__METHOD__ . " Stream finished", logger::DEBUG);
			exit();
		}

		$export_grid = $tool_export->build_export_grid();

		// response OK
			$response->msg		= 'OK. Request done';
			$response->result	= $export_grid;

		return $response;
	}//end get_export_grid



	/**
	 * STREAM_EXPORT_GRID
	 * High-performance, memory-efficient streaming of the export grid.
	 *
	 * Logic:
	 * 1. Pass 1 (Discovery): Iterates through records to identify all unique columns.
	 * 2. Seek(0): Resets the DB cursor without re-executing the query.
	 * 3. Pass 2 (Streaming): Streams rows line-by-line in NDJSON format.
	 *
	 * Optimizations:
	 * - Uses unbuffered output and explicit flushing.
	 * - Implements aggressive memory management: cache clearing and periodic GC.
	 * - Sets streaming-optimized headers (X-Accel-Buffering, Cache-Control, etc.).
	 * - Initial 4KB padding to bypass certain proxy/server buffer limits.
	 *
	 * @return void
	 */
	protected function stream_export_grid() : void {

		// Disable output buffering
		while (ob_get_level()) ob_end_flush();
		ob_implicit_flush(true);

		// Always set header as text/plain or application/x-ndjson to avoid browser buffering
		header('Content-Type: application/x-ndjson; charset=utf-8', true);
		header('X-Content-Type-Options: nosniff');
		header('X-Accel-Buffering: no'); // Nginx bypass buffering
		header('Cache-Control: no-cache, no-store, must-revalidate'); // Disable caching
		header('Pragma: no-cache'); // HTTP 1.0
		header('Expires: 0'); // Proxies
		header('Content-Encoding: identity'); // Disable compression / mod_deflate

		// 4KB Padding to bypass some Apache/Proxy buffer limits (like mod_proxy_fcgi or mod_deflate)
		// Small chunks might be held otherwise.
		echo str_repeat(" ", 4096) . "\n";
		if (ob_get_level() > 0) @ob_flush();
		flush();

		$ar_ddo_map	= $this->ar_ddo_map;
		$db_result	= $this->get_records();

		$start_pass1 = microtime(true);
		if (SHOW_DEBUG) debug_log(__METHOD__ . " Discovery Pass 1 started", logger::DEBUG);

		// First pass: Process records JUST to collect unique columns.
		// OPTIMIZATION: We only need to call get_grid_value when we suspect total columns might change (e.g. portals)
		$ar_columns_obj	= [];
		$ar_columns_index = [];
		$max_portal_counts = [];

		$total_count = $db_result->row_count();
		foreach ($db_result as $row_index => $row) {
			$needs_full_process = empty($ar_columns_obj); // Always process first row

			// Quick check for portal count increases without full instantiation
			if (!$needs_full_process) {
				foreach ($ar_ddo_map as $current_ddo) {
					$tipo = $current_ddo->path[0]->component_tipo;
					$data = $row->relation->{$tipo} ?? null;
					if (is_array($data)) {
						$count = count($data);
						if ($count > ($max_portal_counts[$tipo] ?? 0)) {
							$max_portal_counts[$tipo] = $count;
							$needs_full_process = true;
						}
					}
				}
			}

			if ($needs_full_process) {
				$ar_row_value = $this->get_grid_value($ar_ddo_map, $row);
				foreach ($ar_row_value->ar_columns_obj as $current_column_obj) {
					if (!isset($ar_columns_index[$current_column_obj->id])) {
						$ar_columns_obj[] = $current_column_obj;
						$ar_columns_index[$current_column_obj->id] = true;
					}
				}
				unset($ar_row_value);
			}

			if ($row_index % 100 === 0) {
				// Clear internal caches to prevent memory growth during discovery
				if (class_exists('section_record_instances_cache')) section_record_instances_cache::clear();
				if (class_exists('component_instances_cache')) component_instances_cache::clear();
				gc_collect_cycles();

				if (SHOW_DEBUG) {
					$mem = round(memory_get_usage() / 1024 / 1024, 2);
					debug_log(__METHOD__ . " Pass 1 progress: $row_index / $total_count | Mem: $mem MB", logger::DEBUG);
				}
			}
			unset($row);
		}

		if (SHOW_DEBUG) debug_log(__METHOD__ . " Discovery Pass 1 finished in " . round(microtime(true) - $start_pass1, 3) . "s", logger::DEBUG);

		// Reset database cursor to the beginning
		$db_result->seek(0);

		// Calculate header labels
		$ar_section_columns_count = sizeof($ar_columns_obj);
		$ar_head_columns = [];
		for ($i=0; $i < $ar_section_columns_count; $i++) {
			$column_obj			= $ar_columns_obj[$i];
			$column_path		= explode('|', $column_obj->id);
			$column_tipos		= explode('_', $column_path[0]);
			$column_labels		= [];
			$column_tipos_len	= sizeof($column_tipos)-1;
			foreach ($column_tipos as $column_key => $column_tipo) {
				if(safe_tipo($column_tipo)===false) {
					debug_log(__METHOD__
					  .' Ignored invalid tipo'
					  .' column_key: ' . to_string($column_key)
					  .' column_tipo: ' . to_string($column_tipo)
					  , logger::ERROR
					);
					continue;
				}
				if($this->data_format==='dedalo_raw'){
					$model_name = ontology_node::get_model_by_tipo($column_tipo);
					$column_labels[] = ($model_name === 'component_section_id') ? 'section_id' : $column_tipo;
				}else{
					$column_label = ontology_node::get_term_by_tipo($column_tipo, DEDALO_APPLICATION_LANG, true);
					if (empty($column_label)) $column_label = $column_tipo;
					$column_labels[] = (sizeof($column_path)>1 && ($column_key === $column_tipos_len))
						? $column_label.' '.($column_path[1] + 1)
						: $column_label;
				}
			}
			$column_obj->ar_labels	= $column_labels;
			$column_obj->label_tipo	= end($column_tipos);
			$column_obj->ar_tipos 	= $column_tipos;

			$section_grid = new dd_grid_cell_object();
			$section_grid->set_type('column');
			$section_grid->set_ar_columns_obj($column_obj);
			$section_grid->set_render_label(true);
			$section_grid->set_class_list('caption section');
			$section_grid->set_cell_type('header');
			$ar_head_columns[] = $section_grid;
		}

		// Stream Header
		$header_row = new dd_grid_cell_object();
		$header_row->set_type('row');
		$header_row->set_value($ar_head_columns);
		$header_row->set_row_count(1);
		$header_row->set_column_count($ar_section_columns_count);

		echo json_encode($header_row, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n";
		if (ob_get_level() > 0) @ob_flush();
		flush();

		// Second pass: Stream Rows
		foreach ($db_result as $row_index => $row) {
			$ar_row_value = $this->get_grid_value($ar_ddo_map, $row);

			$row_grid = new dd_grid_cell_object();
			$row_grid->set_type('row');
			$row_grid->set_row_count(!empty($ar_row_value->ar_row_count) ? max($ar_row_value->ar_row_count) : 0);
			$row_grid->set_column_count($ar_row_value->ar_column_count);
			$row_grid->set_ar_columns_obj($ar_row_value->ar_columns_obj);
			$row_grid->set_value($ar_row_value->ar_cells);

			echo json_encode($row_grid, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n";

			if ($row_index % 100 === 0) {
				// Clear internal caches and collect garbage to prevent growth
				if (class_exists('section_record_instances_cache')) section_record_instances_cache::clear();
				if (class_exists('component_instances_cache')) component_instances_cache::clear();
				gc_collect_cycles();

				if (SHOW_DEBUG) {
					$mem = round(memory_get_usage() / 1024 / 1024, 2);
					debug_log(__METHOD__ . " Pass 2 progress: $row_index / $total_count | Mem: $mem MB", logger::DEBUG);
				}
			}

			if (ob_get_level() > 0) @ob_flush();
			flush();

			unset($ar_row_value);
			unset($row_grid);
			unset($row);
		}
	}//end stream_export_grid



	/**
	 * BUILD_EXPORT_GRID
	 * Builds the complete export grid in memory (non-streaming mode)
	 *
	 * This method:
	 * - Retrieves all records via get_records()
	 * - Processes each row to build grid values
	 * - Dynamically discovers columns (important for portals)
	 * - Builds header row with column labels
	 * - Returns complete grid structure
	 *
	 * Note: For large datasets, use stream_export_grid() instead
	 *
	 * @return array Array of dd_grid_cell_object (header row + data rows)
	 *
	 * @throws Exception If record retrieval or grid building fails
	 */
	protected function build_export_grid() : array {

		$ar_ddo_map	= $this->ar_ddo_map;
		$db_result	= $this->get_records();

		// get the section values
		$section_grid_values = [];

		$ar_head_columns = [];

		// store the rows count for every portal inside the section
			$ar_section_rows_count = [];
		// store the head rows to sum up with the total rows
			$rows_max_count = [];
		// rows values
			$ar_row_values 	= [];
		// full unique columns for create the head
			$ar_columns_obj	= [];
		// columns index to avoid array_find inside the loop (performance)
			$ar_columns_index = [];

		foreach ($db_result as $row) {

			$ar_row_value = $this->get_grid_value($ar_ddo_map, $row);

			// take the maximum number of rows (the rows can has 1, 2, 55 rows and we need the highest value, 55)
			$row_count = !empty($ar_row_value->ar_row_count)
				? max($ar_row_value->ar_row_count)
				: 0;
			// store the result to sum with the head rows
			$rows_max_count[] = $row_count;

			// take the columns
			$columns_count = $ar_row_value->ar_column_count;

			// current_ar_columns_obj
			$current_ar_columns_obj = $ar_row_value->ar_columns_obj;

			$row_grid = new dd_grid_cell_object();
				$row_grid->set_type('row');
				$row_grid->set_row_count($row_count);
				$row_grid->set_column_count($columns_count);
				$row_grid->set_ar_columns_obj($current_ar_columns_obj);
				$row_grid->set_value($ar_row_value->ar_cells);

			$ar_row_values[] = $row_grid;

			// get the columns position to re-order the ar_columns_obj
			// it will join the columns see if the column is a column created by the locator
			// when the component is portal inside portal, like 'photograph' inside 'identifying image' inside 'interview'.
			// 'photograph' locators will be exploded in columns not in rows and the column is identify by the section_id of the photograph
			// the final format will be: name ; surname ; name|1 ; surname|1 ; name|2 etc of the photograph
			foreach ($ar_row_value->ar_columns_obj as $current_column_obj) {

				// check if the current column exists in the full column array
				if( !isset($ar_columns_index[$current_column_obj->id]) ){

					// if not exist we need add it, the columns are joined from the deep of the portals to the parents

					// check if the current column_id is a locator column, else add the column_object at the end
					$current_column_path = explode('|', $current_column_obj->id);

					if(sizeof($current_column_path)>1){
						// get the last position of the column group
						$position = false;
						foreach ($ar_columns_obj as $column_key => $column_value) {
							if(isset($column_value->group) &&  $column_value->group === $current_column_obj->group){
								$position = $column_key;
								break;
							}
						}
						// if the position is set, insert the columns after the last column_object found
						// if not add the current column_object at the end
						if($position !== false){
							array_splice($ar_columns_obj, $position+1, 0, [$current_column_obj]);
						}else{
							$ar_columns_obj[] = $current_column_obj;
						}
					}else{
						$ar_columns_obj[] = $current_column_obj;
					}

					// Update index
					$ar_columns_index[$current_column_obj->id] = true;
				}
			}//end foreach ($locator_column_obj as $column_pos => $current_column_obj)
		}//foreach (db_result as $row)

		// sum the total rows for this locator
		$ar_section_rows_count[] = array_sum($rows_max_count);
		// take the maximum number of columns (the columns can has 1, 2, 55 columns and we need the highest value, 55)
		$ar_section_columns_count = sizeof($ar_columns_obj) ?? 0;
		// build the header labels
			for ($i=0; $i < $ar_section_columns_count; $i++) {

				$column_obj			= $ar_columns_obj[$i];
				$column_path		= explode('|', $column_obj->id);
				$column_tipos		= explode('_', $column_path[0]);
				$column_labels		= [];
				$column_tipos_len	= sizeof($column_tipos)-1;
				foreach ($column_tipos as $column_key => $column_tipo) {
					// set the column name, if the format is Dédalo use the $tipo and section_id
					// for standard format use the name
					if($this->data_format==='dedalo_raw'){
						$model_name = ontology_node::get_model_by_tipo($column_tipo);
						$column_labels[] = ($model_name === 'component_section_id')
							? 'section_id'
							: $column_tipo;
					}else{
						$column_label = ontology_node::get_term_by_tipo($column_tipo, DEDALO_APPLICATION_LANG, true);
						if (empty($column_label)) {
							$column_label = $column_tipo;
						}
						$column_labels[] = (sizeof($column_path)>1 && ($column_key === $column_tipos_len))
							? $column_label .' '. ($column_path[1]+1)
							: $column_label;
					}
				}
				$column_obj->ar_labels	= $column_labels;
				$column_obj->label_tipo	= end($column_tipos);
				$column_obj->ar_tipos 	= $column_tipos;

				// create the grid cell of the section
					$section_grid = new dd_grid_cell_object();
						$section_grid->set_type('column');
						// $section_grid->set_label($ar_ddo_map[$i]->label);
						$section_grid->set_ar_columns_obj($column_obj); // note that only one column is expected here !
						// $section_grid->set_column_obj($column_obj);
						$section_grid->set_render_label(true);
						$section_grid->set_class_list('caption section');
						$section_grid->set_cell_type('header');

				$ar_head_columns[] = $section_grid;
			}

		// dd_grid_cell_object
			$section_grid_row = new dd_grid_cell_object();
				$section_grid_row->set_type('row');
				$section_grid_row->set_value($ar_head_columns);
				// sum the total rows for the section and add the total rows to the section row
				$section_grid_row->set_row_count(1);
				$section_grid_row->set_column_count($ar_section_columns_count);

		// section_grid_values
			$section_grid_values[] = $section_grid_row;
			$section_grid_values = array_merge($section_grid_values, $ar_row_values);


		return $section_grid_values;
	}//end build_export_grid



	/**
	 * GET_RECORDS
	 * Retrieves records to export based on sqo or cached records
	 *
	 * @return db_result Iterator of records with section data
	 *
	 * @throws Exception If sqo is empty or sections retrieval fails
	 */
	protected function get_records() : db_result {

		// empty records case
		if (!empty($this->records)) {
			return $this->records;
		}

		// search_options
		$section_tipo	= $this->section_tipo;
		$model			= $this->model; // section tipo like section

		switch ($model) {
			case 'component_portal':
				// To define
				break;

			default:
				// sqo
				$sqo = $this->sqo;
				if(empty($sqo)){
					debug_log(__METHOD__
						." section without sqo defined, please review the caller: $section_tipo"
						, logger::ERROR
					);
				}

	 			// sections
				$sections		= sections::get_instance(null, $sqo, $section_tipo);
				$this->records	= $sections->get_data(); // returns db_result format (Iterator)
				break;
		}

		return $this->records;
	}//end get_records



	/**
	 * GET_GRID_VALUE
	 * Builds dd_grid value object for a single row
	 * Processes DDO map to extract component values and build grid cells
	 *
	 * This method:
	 * - Iterates through DDO map for the row
	 * - Instantiates components with caching
	 * - Handles nested portals via sub_ddo_map
	 * - Builds column objects for dynamic grid
	 * - Returns structured value object
	 *
	 * @param array $ar_ddo Array of DDO objects defining columns
	 * @param object $row Row object from db_result with section_tipo, section_id, relation
	 *
	 * @return object Value object with:
	 *   - ar_row_count: array Row counts for each component
	 *   - ar_column_count: int Total number of columns
	 *   - ar_columns_obj: array Column definition objects
	 *   - ar_cells: array Cell values
	 *
	 * @throws Exception If component instantiation fails
	 */
	protected function get_grid_value(array $ar_ddo, object $row) : object {

		$ar_cells		= [];
		$ar_row_count	= [];
		$ar_columns_obj	= [];

		if (!isset(self::$locator)) {
			self::$locator = new locator();
		}
		self::$locator->set_section_tipo($row->section_tipo);
		self::$locator->set_section_id($row->section_id);

		foreach ($ar_ddo as $current_ddo) {
			// children_ddo. get only the ddo that are children of the section top_tipo
			// the other ddo are sub components that will be injected to the portal as request_config->show
			$first_path	= $current_ddo->path[0];
			$ddo		= ($first_path->section_tipo===self::$locator->section_tipo) ? $first_path : null;

			// component. Create the component to get the value of the column
				$component_tipo = $ddo->component_tipo;
				if (!isset(self::$ontology_cache[$component_tipo])) {
					$is_translatable = ontology_node::get_translatable($component_tipo);
					self::$ontology_cache[$component_tipo] = (object)[
						'lang'  => $is_translatable ? DEDALO_DATA_LANG : DEDALO_DATA_NOLAN,
						'model' => ontology_node::get_model_by_tipo($component_tipo, true)
					];
				}
				$current_lang    = self::$ontology_cache[$component_tipo]->lang;
				$component_model = self::$ontology_cache[$component_tipo]->model;

				$current_component	= component_common::get_instance(
					$component_model, // string model
					$ddo->component_tipo, // string tipo
					self::$locator->section_id, // string|int|null section_id
					'edit', // string mode
					$current_lang, // string lang
					self::$locator->section_tipo, // string section_tipo
					false // bool cache
				);
				// set the locator to the new component it will be used to know; who create me.
				$current_component->set_locator(self::$locator);
				// set the caller
				$current_component->set_caller('tool_export');
				// set the first id of the column_obj, if the component is a related component it will used to create a path of the deeper components
				$column_obj = new stdClass();
					$column_obj->id = $ddo->section_tipo.'_'.$ddo->component_tipo;
				$current_component->column_obj = $column_obj;

				// check if the component has ddo children in the path,
				// used by portals to define the path to the "text" component that has the value, it will be the last component in the chain of locators
				$sub_ddo_map = [];
				foreach ($current_ddo->path as $key => $child_ddo) {
					if($key === 0) continue;
					$new_ddo = new dd_object();
						$new_ddo->set_tipo($child_ddo->component_tipo);
						$new_ddo->set_section_tipo($child_ddo->section_tipo);
						$new_ddo->set_model($child_ddo->model);
						$new_ddo->set_parent($current_ddo->path[$key-1]->component_tipo);
						$new_ddo->set_label($child_ddo->name);
					// add ddo
					$sub_ddo_map[] = $new_ddo;
					$column_obj->id = $column_obj->id.'_'.$child_ddo->section_tipo.'_'.$child_ddo->component_tipo;
				}

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

					// inject the locator as data for the component
					$component_data = $row->relation->{$ddo->component_tipo} ?? null;
					$current_component->set_data($component_data);
				}

			// get component_value add
				switch ($this->data_format) {
					case 'dedalo_raw':
						$component_value =	$current_component->get_raw_value();
						break;

					case 'grid_value':
						$component_value = $current_component->get_grid_value($ddo);
						break;

					case 'value':
					default:
						$component_value = $current_component->get_grid_flat_value($ddo);
						break;
				}

			// get columns objects that the component had stored
				$sub_ar_columns_obj = $component_value->ar_columns_obj ?? [];
				$len_items = sizeof($sub_ar_columns_obj);
				for ($i=0; $i < $len_items; $i++) {
					$ar_columns_obj[] = $sub_ar_columns_obj[$i];
				}

			$ar_row_count[] = $component_value->row_count ?? 1;
			$ar_cells[] = $component_value;

		}// end foreach ($ar_children_ddo as $ddo)

		// value final object
			$value = new stdClass();
				$value->ar_row_count	= $ar_row_count;
				$value->ar_column_count	= sizeof($ar_columns_obj);
				$value->ar_columns_obj	= $ar_columns_obj;
				$value->ar_cells		= $ar_cells;


		return $value;
	}//end get_grid_value



}//end class tool_export
