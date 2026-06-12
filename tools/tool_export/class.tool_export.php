<?php declare(strict_types=1);
require_once __DIR__ . '/class.export_tabulator.php';
/**
 * CLASS TOOL_EXPORT
 * Manages data export functionality for Dédalo sections
 *
 * The export pipeline is atoms based (see core/dd_grid/class.export_value.php):
 * per record and per export ddo, components return a flat list of scalar
 * atoms whose structured paths carry column identity and relation item
 * indexes. The export_tabulator (class.export_tabulator.php) converts the
 * atoms into a flat table — column manifest + sparse ordinal-keyed cell
 * rows — emitted as NDJSON protocol lines the client renders verbatim
 * (CSV/TSV/preview share the same flat data: WYSIWYG).
 *
 * Data formats:
 * - 'value' (default): one column per ddo, flat joined strings
 * - 'grid_value' (breakdown): relation items exploded into extra rows
 *   and/or '|n' suffixed columns, per the user selected breakdown mode
 *   ('default' | 'rows' | 'columns', see export_tabulator)
 * - 'dedalo_raw': pre-encoded {"dedalo_data":...} strings, byte-stable
 *   for the tool_import_dedalo_csv round-trip
 *
 * Key features:
 * - Single pass streaming (NDJSON): columns can be discovered mid-stream;
 *   cells reference column ordinals so misalignment is impossible; the
 *   trailing 'end' line carries the authoritative column display order
 * - Memory-efficient chunked processing (periodic cache clear + GC)
 * - Time machine rows support (sqo mode 'tm')
 *
 * @package Dedalo
 * @subpackage Tools
 */
class tool_export extends tool_common {



	/**
	* SEC-024 (§9.2): explicit allowlist of methods callable via
	* `dd_tools_api::tool_request` (map form).
	* get_export_grid gates imperatively inside the method: it must accept
	* legacy 'tipo' callers (section_tipo ?? tipo) and additionally assert
	* read permission on every section_tipo named in the sqo, which the
	* declarative gate cannot express.
	*/
	public const API_ACTIONS = [
		'get_export_grid' => null
	];



	/**
	 * @var int Maximum execution time in seconds (10 hours)
	 */
	private const MAX_EXECUTION_TIME = 36000;

	/**
	 * @var string Data format mode: 'value', 'grid_value', 'dedalo_raw'
	 */
	public string $data_format;

	/**
	 * @var string Breakdown mode for 'grid_value': 'default', 'rows', 'columns'
	 */
	public string $breakdown = 'default';

	/**
	 * @var bool Repeat spanning values on every exploded row (server-side fill)
	 */
	public bool $fill_the_gaps = true;

	/**
	 * @var bool Export the ancestor chain of relation targets as sibling
	 * 'parents' sub-columns (thesaurus/hierarchy targets). Default false.
	 */
	public bool $value_with_parents = false;

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
	 *   - data_format: string Export format ('value', 'grid_value', 'dedalo_raw')
	 *   - breakdown: string Breakdown mode ('default', 'rows', 'columns')
	 *   - fill_the_gaps: bool Repeat spanning values on exploded rows
	 *   - ar_ddo_map: array DDO map defining columns to export
	 *   - sqo: object Search query object
	 *   - model: string Model type (typically 'section')
	 *   - section_tipo: string Section tipo identifier
	 *
	 * @return void
	 */
	protected function setup(object $options) : void {

		// options
			$data_format		= $options->data_format ?? 'value';
			$breakdown			= $options->breakdown ?? 'default';
			$fill_the_gaps		= $options->fill_the_gaps ?? true;
			$value_with_parents	= $options->value_with_parents ?? false;
			$ar_ddo_map			= $options->ar_ddo_map;
			$sqo				= $options->sqo;
			$model				= $options->model;
			$section_tipo		= $options->section_tipo;

		// fix data_format (allowlist; anything unknown falls back to flat 'value')
			$this->data_format = in_array($data_format, ['value','grid_value','dedalo_raw'], true)
				? $data_format
				: 'value';

		// fix breakdown (allowlist)
			$this->breakdown = in_array($breakdown, ['default','rows','columns'], true)
				? $breakdown
				: 'default';

		// fix fill_the_gaps
			$this->fill_the_gaps = (bool)$fill_the_gaps;

		// fix value_with_parents
			$this->value_with_parents = (bool)$value_with_parents;

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
			// limit/offset: the export serialises the WHOLE filtered selection by design
			// (subsetting is done via the sqo filter above). The API client gate
			// (search_query_object::sanitize_client_sqo) clamps every client-sent
			// limit — 0, 'all' or any value above DEDALO_SEARCH_CLIENT_MAX_LIMIT —
			// to the ceiling, which silently truncated exports of larger sections.
			// Forcing the internal 'ALL' sentinel here is safe, not a gate bypass:
			// get_export_grid already asserted read permission on the requested
			// section_tipo and on every section_tipo named in the sqo (SEC-024),
			// and the stream path clears caches + GCs every 100 records.
			$sqo->limit		= 'ALL';
			$sqo->offset	= 0;
			$this->sqo = $sqo;

		// fix model
			$this->model = $model;

		// fix records
			$this->records = null;
	}//end setup



	/**
	 * GET_EXPORT_GRID
	 * Builds the export flat table ready to parse in export_tool (client)
	 * Main entry point for export operations
	 *
	 * @see class.request_query_object.php
	 *
	 * @param object $options Configuration object with:
	 *   - section_tipo: string Section tipo identifier - REQUIRED
	 *   - model: string Model type (default: 'section')
	 *   - data_format: string Export format - REQUIRED
	 *   - breakdown: string Breakdown mode (default 'default')
	 *   - fill_the_gaps: bool (default true)
	 *   - ar_ddo_to_export: array DDO map defining columns - REQUIRED
	 *   - sqo: object Search query object - REQUIRED
	 *   - ndjson_stream: bool Whether to use streaming mode (default: false)
	 *
	 * @return object Response object with:
	 *   - result: object|false Flat table {meta, columns, rows, end} or false on error
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
			$breakdown			= $options->breakdown ?? 'default';
			$fill_the_gaps		= $options->fill_the_gaps ?? true;
			$value_with_parents	= $options->value_with_parents ?? false;
			$ar_ddo_to_export	= $options->ar_ddo_to_export;
			$sqo				= $options->sqo;

		// SEC-024 (§9.2): READ gate. get_export_grid serialises the entire
		// records selection via the supplied sqo. Caller must have read (>=1)
		// on the requested section_tipo, plus on every section_tipo named in
		// the sqo (to mirror the dd_core_api::search/read gate).
			if (empty($section_tipo)) {
				$response->msg = 'Error. Missing section_tipo';
				return $response;
			}
			security::assert_section_permission($section_tipo, 1, __METHOD__);
			if (isset($sqo->section_tipo) && is_array($sqo->section_tipo)) {
				security::assert_section_array_permission($sqo->section_tipo, 1, __METHOD__);
			}

		// export options
			$tool_export = new tool_export(null, $section_tipo);
			$tool_export->setup((object)[
				'data_format'		=> $data_format,
				'breakdown'			=> $breakdown,
				'fill_the_gaps'		=> $fill_the_gaps,
				'value_with_parents'=> $value_with_parents,
				'ar_ddo_map'		=> $ar_ddo_to_export,
				'sqo'				=> $sqo,
				'model'				=> $model,
				'section_tipo'		=> $section_tipo
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
	 * ITERATE_EXPORT_LINES
	 * Single source of the export protocol lines (meta, col*, row*, end).
	 * stream_export_grid echoes them as NDJSON; build_export_grid drains
	 * them into one response body; tests consume the generator directly.
	 *
	 * Memory: clears component/section_record instance caches and runs GC
	 * every 100 records (large exports grow unbounded otherwise).
	 *
	 * @return Generator yields line objects
	 */
	public function iterate_export_lines() : Generator {

		$ar_ddo_map	= $this->ar_ddo_map;
		$db_result	= $this->get_records();

		// tabulator. atoms -> flat table protocol lines
			$tabulator = new export_tabulator((object)[
				'data_format'	=> $this->data_format,
				'breakdown'		=> $this->breakdown,
				'fill_the_gaps'	=> $this->fill_the_gaps
			]);

		// meta line
			$total = $db_result->row_count();
			yield $tabulator->meta_line($this->section_tipo, $total);

		// time machine mode check (see get_record_atoms)
			$is_tm = ($this->sqo->mode ?? null) === 'tm';

		// record lines
			foreach ($db_result as $row_index => $row) {

				$ar_entries	= $this->get_record_atoms($ar_ddo_map, $row);
				$rec_id		= $is_tm
					? (int)$row->id
					: $row->section_id;

				foreach ($tabulator->record_lines($ar_entries, $rec_id) as $line) {
					yield $line;
				}

				if ($row_index % 100 === 0) {
					// Clear internal caches and collect garbage to prevent growth
					if (class_exists('section_record_instances_cache')) section_record_instances_cache::clear();
					if (class_exists('component_instances_cache')) component_instances_cache::clear();
					gc_collect_cycles();

					if (SHOW_DEBUG) {
						$mem = round(memory_get_usage() / 1024 / 1024, 2);
						debug_log(__METHOD__ . " progress: $row_index / $total | Mem: $mem MB", logger::DEBUG);
					}
				}
			}

		// end line (authoritative column display order)
			yield $tabulator->end_line();
	}//end iterate_export_lines



	/**
	 * STREAM_EXPORT_GRID
	 * High-performance, memory-efficient streaming of the export flat table.
	 * Thin NDJSON writer over iterate_export_lines().
	 *
	 * Optimizations:
	 * - Uses unbuffered output and explicit flushing.
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

		foreach ($this->iterate_export_lines() as $line) {

			echo json_encode($line, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n";

			if (ob_get_level() > 0) @ob_flush();
			flush();
		}
	}//end stream_export_grid



	/**
	 * BUILD_EXPORT_GRID
	 * Builds the complete export flat table in memory (non-streaming mode)
	 * by draining iterate_export_lines().
	 *
	 * Note: For large datasets, use stream_export_grid() instead
	 *
	 * @return object {meta: object, columns: array, rows: array, end: object}
	 */
	protected function build_export_grid() : object {

		$export_grid = new stdClass();
			$export_grid->meta		= null;
			$export_grid->columns	= [];
			$export_grid->rows		= [];
			$export_grid->end		= null;

		foreach ($this->iterate_export_lines() as $line) {
			switch ($line->t) {
				case 'meta':
					$export_grid->meta = $line;
					break;
				case 'col':
					$export_grid->columns[] = $line;
					break;
				case 'row':
					$export_grid->rows[] = $line;
					break;
				case 'end':
					$export_grid->end = $line;
					break;
				default:
					// reserved line types pass through untouched
					break;
			}
		}

		return $export_grid;
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
	 * GET_RECORD_ATOMS
	 * Resolves the export atoms of a single record: one entry per export
	 * ddo, each holding the component export_value (atoms based contract).
	 *
	 * Replaces the legacy get_grid_value(): the descendant ddo chain and
	 * the absolute-URLs flag travel in an export_context argument instead
	 * of the request_config / column_obj / caller instance injections.
	 *
	 * @param array $ar_ddo Array of DDO objects defining columns
	 * @param object $row Row object from db_result with section_tipo, section_id, relation
	 *
	 * @return array list of {value: export_value, section_tipo: string, component_tipo: string}
	 *
	 * @throws Exception If component instantiation fails
	 */
	protected function get_record_atoms(array $ar_ddo, object $row) : array {

		$ar_entries = [];

		// time machine mode check
		// matrix_time_machine rows have section_tipo = data section (e.g. mdcat2949), not the TM section (dd15).
		// DDO paths reference dd15 as section_tipo, so matching against row->section_tipo always fails.
		$is_tm = ($this->sqo->mode ?? null) === 'tm';

		if (!isset(self::$locator)) {
			self::$locator = new locator();
		}

		if ($is_tm) {
			// TM: use the export section_tipo (dd15) and the TM row id as section_id
			self::$locator->set_section_tipo($this->section_tipo);
			self::$locator->set_section_id((int)$row->id);

			// Populate the section_record cache for dd15 + row->id.
			// tm_record::get_section_record() transforms TM flat columns into component-formatted data
			// and stores it in the section_record cache, so components can read their data normally.
			$tm_record = tm_record::get_instance((int)$row->id);
			$tm_record->get_section_record();
		}else{
			self::$locator->set_section_tipo($row->section_tipo);
			self::$locator->set_section_id($row->section_id);
		}

		foreach ($ar_ddo as $current_ddo) {
			// children_ddo. get only the ddo that are children of the section top_tipo
			// the other ddo are sub components that will be passed to the component as export_context->ddo_map
			$first_path	= $current_ddo->path[0];
			$ddo		= ($first_path->section_tipo===self::$locator->section_tipo) ? $first_path : null;

			// skip if ddo is not a direct child of the row's section_tipo.
			if ($ddo === null) {
				// Notify once.
				static $ddo_null_logged = false;
				if (!$ddo_null_logged) {
					debug_log(__METHOD__
					   .' Ignored empty ddo from first path' . PHP_EOL
					   .' first_path: ' . to_string($first_path) . PHP_EOL
					   .' row: ' . to_string($row) . PHP_EOL
					   .' current_ddo: ' . to_string($current_ddo)
					   , logger::WARNING
					);
					$ddo_null_logged = true;
				}
				continue;
			}

			// component. Create the component to get the atoms of the column
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

				$component_mode = $is_tm ? 'tm' : 'edit';

				$current_component	= component_common::get_instance(
					$component_model, // string model
					$ddo->component_tipo, // string tipo
					self::$locator->section_id, // string|int|null section_id
					$component_mode, // string mode
					$current_lang, // string lang
					self::$locator->section_tipo, // string section_tipo
					false // bool cache
				);
				// set the locator to the new component it will be used to know who created it
				$current_component->set_locator(self::$locator);

			// sub ddo_map. The descendant ddo chain of the column path,
			// used by relation components to resolve down to the value leaf
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
				}

			// inject the row relation data to relation components: the
			// search row already carries the locators, avoiding a re-read
				if (!empty($sub_ddo_map) && !$is_tm) {
					// TM rows don't have a 'relation' property; data is already
					// in the section_record cache populated above.
					$component_data = $row->relation->{$ddo->component_tipo} ?? null;
					$current_component->set_data($component_data);
				}

			// export_context. Replaces the legacy request_config/column_obj/caller injections
			// value_with_parents: the global export checkbox enables the ancestor
			// chain for every relation column; the per-column checkbox sets the
			// flag on the single export ddo (current_ddo->value_with_parents)
				$context = new export_context((object)[
					'ddo'				=> $ddo,
					'ddo_map'			=> $sub_ddo_map,
					'absolute_urls'		=> true, // tool_export media URLs are absolute
					'caller'			=> 'tool_export',
					'value_with_parents'=> $this->value_with_parents || (bool)($current_ddo->value_with_parents ?? false)
				]);

			// get the component atoms per data_format
				$export_value = ($this->data_format==='dedalo_raw')
					? $current_component->get_raw_export_value($context)
					: $current_component->get_export_value($context);

			// path. The declared ddo path as segments: used by the tabulator to
			// resolve the header label when the minting record has no atoms
			// (otherwise the raw identity key would leak as the column header)
				$ddo_path_segments = array_map(function($path_item){
					// multi section_tipo case (toponymy autocomplete): use the first
					$path_section_tipo = is_array($path_item->section_tipo)
						? reset($path_item->section_tipo)
						: $path_item->section_tipo;
					return new export_path_segment(
						(string)$path_section_tipo,
						$path_item->component_tipo,
						(object)['model' => $path_item->model ?? null]
					);
				}, $current_ddo->path);

			$ar_entries[] = (object)[
				'value'			=> $export_value,
				'section_tipo'	=> $ddo->section_tipo,
				'component_tipo'=> $ddo->component_tipo,
				'path'			=> $ddo_path_segments
			];
		}// end foreach ($ar_ddo as $current_ddo)


		return $ar_entries;
	}//end get_record_atoms



}//end class tool_export
