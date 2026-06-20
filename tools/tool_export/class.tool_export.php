<?php declare(strict_types=1);
require_once __DIR__ . '/class.export_tabulator.php';
/**
 * CLASS TOOL_EXPORT
 * Server-side export orchestrator: drives a full section export as a
 * streaming or in-memory NDJSON flat-table.
 *
 * Architecture overview:
 * The pipeline has three tiers:
 *   1. Record selection   — get_records() runs the sqo against sections::get_data()
 *                           and returns a db_result iterator.
 *   2. Atom extraction    — get_record_atoms() instantiates each component and
 *                           calls get_export_value() / get_raw_export_value() per
 *                           export ddo, collecting export_atom lists
 *                           (see core/dd_grid/class.export_value.php).
 *   3. Tabulation         — export_tabulator turns the per-record atom lists into
 *                           NDJSON protocol lines (col / row / end) which are either
 *                           streamed byte-by-byte (stream_export_grid) or drained
 *                           into a single response object (build_export_grid).
 *
 * Data formats (set via $data_format, validated against an allowlist in setup()):
 * - 'value'       — one column per ddo; all atoms joined into a flat string.
 * - 'grid_value'  — relation items exploded into extra rows and/or '|n'-suffixed
 *                   columns, according to the breakdown mode ('default' | 'rows' |
 *                   'columns'); see class export_tabulator for the exact semantics.
 * - 'dedalo_raw'  — pre-encoded {"dedalo_data":...} strings, byte-stable for the
 *                   tool_import_dedalo_csv round-trip.
 *
 * Key design properties:
 * - Single-pass streaming (NDJSON): columns can be discovered mid-stream because
 *   cells reference stable integer ordinals; misalignment is structurally impossible.
 *   The trailing 'end' line is the authoritative column display order.
 * - Memory-efficient chunked processing: instance caches are flushed and the PHP GC
 *   is triggered every 100 records so large exports do not exhaust memory.
 * - Time Machine (sqo->mode = 'tm'): rows come from matrix_time_machine; the TM
 *   record cache (tm_record) is populated before atom extraction so components read
 *   their data through the normal section_record path.
 *
 * Relationships:
 * - Extends tool_common (tools/tool_common/class.tool_common.php) which provides
 *   $section_tipo, $section_id, and the tool registry/config layer.
 * - Requires class.export_tabulator.php (same directory), loaded at file top.
 * - Delegates record selection to sections::get_data() via get_records().
 * - Delegates atom extraction to component_common::get_export_value() / get_raw_export_value().
 * - Called from the browser via dd_tools_api / API_ACTIONS gate (SEC-024).
 *
 * @package Dédalo
 * @subpackage Tools
 */
class tool_export extends tool_common {



	/**
	 * API_ACTIONS
	 * SEC-024 (§9.2): explicit allowlist of methods callable via the
	 * dd_tools_api::tool_request map-form dispatcher.
	 *
	 * Only 'get_export_grid' is exposed. The gate is intentionally implemented
	 * imperatively inside that method rather than declaratively here because:
	 *   a) It must tolerate legacy callers that send 'tipo' instead of
	 *      'section_tipo' (resolved via $options->section_tipo ?? $options->tipo).
	 *   b) It must assert read permission on EVERY section_tipo named in the sqo
	 *      (multi-section queries), which the declarative gate cannot express.
	 *
	 * @var array<string,null> Keyed by method name; value is always null (no extra config).
	 */
	public const API_ACTIONS = [
		'get_export_grid' => null
	];



	/**
	 * Maximum wall-clock time granted to a single export run (10 hours).
	 * Passed verbatim to set_time_limit() at the top of get_export_grid().
	 * Large section exports over slow connections can legitimately run for
	 * several hours; the default PHP limit (30 s) would abort them silently.
	 * @var int
	 */
	private const MAX_EXECUTION_TIME = 36000;

	/**
	 * Active data format for this export run.
	 * One of 'value' | 'grid_value' | 'dedalo_raw'; validated against the
	 * allowlist in setup() before being stored — any unknown value falls back
	 * to 'value'.
	 * @var string $data_format
	 */
	public string $data_format;

	/**
	 * Breakdown mode applied when $data_format === 'grid_value'.
	 * Controls how relation items (multiple records / multiple sub-fields)
	 * are laid out in the output:
	 * - 'default'  — first indexed level explodes into rows; deeper levels
	 *                become '|n'-suffixed columns.
	 * - 'rows'     — every indexed level explodes vertically.
	 * - 'columns'  — every indexed level generates '|n'-suffixed columns;
	 *                one output row per source record.
	 * Validated in setup(); unknown values fall back to 'default'.
	 * @var string $breakdown
	 */
	public string $breakdown = 'default';

	/**
	 * When true, static (non-indexed) field values are repeated on every
	 * exploded sub-row instead of appearing only on the first sub-row.
	 * Mirrors the legacy "fill the gaps" checkbox in the export UI.
	 * Only meaningful when $data_format === 'grid_value'.
	 * @var bool $fill_the_gaps
	 */
	public bool $fill_the_gaps = true;

	/**
	 * When true, every relation component column also emits an ancestor-chain
	 * sub-column (the 'parents' path from thesaurus/hierarchy targets).
	 * May also be overridden per-ddo via $current_ddo->value_with_parents.
	 * @var bool $value_with_parents
	 */
	public bool $value_with_parents = false;

	/**
	 * Ordered list of DDO (Data Definition Objects) describing which components
	 * to export and in what order. Each element is a ddo-like object with at
	 * least a 'path' array of step objects ({section_tipo, component_tipo, model,
	 * name}) and optional per-column flags (value_with_parents, label, …).
	 * Populated from $options->ar_ddo_to_export in get_export_grid() and stored
	 * by setup().
	 * @var array $ar_ddo_map
	 */
	public array $ar_ddo_map;

	/**
	 * Search Query Object that defines which records to export.
	 * Set by setup() after injecting the session filter (if any) and forcing
	 * limit='ALL' / offset=0 (the export always serialises the full filtered
	 * selection; subsetting is done via $sqo->filter, not via paging).
	 * Shape follows the standard SQO contract (see search_query_object /
	 * class.request_query_object.php).
	 * @var object $sqo
	 */
	public object $sqo;

	/**
	 * Model type string of the export target.
	 * Typically 'section'; used in get_records() to select the record-fetching
	 * strategy. The 'component_portal' branch is a planned extension (currently
	 * a stub).
	 * @var string $model
	 */
	public string $model;

	/**
	 * Pre-fetched record iterator, or null when records should be fetched on
	 * demand from the sqo.
	 * Callers may inject a db_result here (e.g. from tests) to bypass the
	 * sections::get_data() query path entirely.  When null, get_records()
	 * fetches and caches the result in this property.
	 * @var db_result|null $records
	 */
	public ?db_result $records = null;

	/**
	 * Class-static locator instance reused across every record in a single
	 * export run. Created on first use in get_record_atoms() and mutated (via
	 * set_section_tipo / set_section_id) for each row, avoiding repeated
	 * object allocation over potentially millions of rows.
	 * (!) Not thread-safe across concurrent PHP-FPM workers, but PHP's
	 * single-threaded request model makes that moot.
	 * @var locator|null $locator
	 */
	protected static ?locator $locator = null;

	/**
	 * Class-static cache mapping component tipo strings to their resolved
	 * ontology metadata (lang and model). Keyed by component tipo.
	 * Shape: [ tipo => {lang: string, model: string} ]
	 * Populated lazily in get_record_atoms() via ontology_node lookups;
	 * amortises repeated lookups for the same tipo across all exported rows.
	 * @var array $ontology_cache
	 */
	protected static array $ontology_cache = [];



	/**
	 * SETUP
	 * Validates and stores all runtime export parameters from the options object.
	 * Called by get_export_grid() immediately after constructing the tool instance,
	 * before either build_export_grid() or stream_export_grid() is invoked.
	 *
	 * Side effects:
	 * - Mutates $sqo in place: injects the saved session filter (if the caller did
	 *   not supply one) and forces limit='ALL' / offset=0 so the export always
	 *   serialises the entire filtered selection.
	 * - Resets $this->records to null so get_records() will re-query on the
	 *   first call; callers that pre-inject a db_result must do so AFTER setup().
	 *
	 * @param object $options {
	 *   data_format: string,       // 'value' | 'grid_value' | 'dedalo_raw'
	 *   breakdown: string,         // 'default' | 'rows' | 'columns'
	 *   fill_the_gaps: bool,
	 *   value_with_parents: bool,
	 *   ar_ddo_map: array,         // DDO objects — see $ar_ddo_map property
	 *   sqo: object,               // search query object
	 *   model: string,             // 'section' or 'component_portal'
	 *   section_tipo: string
	 * }
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
	 * Primary public entry point for all export operations.
	 * Validates permissions, configures the tool instance via setup(), then
	 * either streams the NDJSON protocol directly to the HTTP response
	 * (ndjson_stream=true) or returns the full flat table in the result object.
	 *
	 * This is a static factory: it constructs tool_export internally so callers
	 * need only invoke this single method.
	 *
	 * Streaming path (ndjson_stream=true):
	 *   Calls stream_export_grid() which writes NDJSON lines to stdout and
	 *   exits; the caller MUST NOT send any further output. The response object
	 *   returned here is never used (exit() short-circuits it).
	 *
	 * Non-streaming path (ndjson_stream=false, default):
	 *   Calls build_export_grid() which drains iterate_export_lines() into a
	 *   single stdClass { meta, columns, rows, end } stored in $response->result.
	 *   Suitable for small-to-medium datasets or test consumers.
	 *
	 * Security (SEC-024 §9.2):
	 *   Asserts read permission (level ≥ 1) on $section_tipo and on every
	 *   entry in $sqo->section_tipo (multi-section queries). Both checks happen
	 *   before any db query is issued.
	 *
	 * @see class.request_query_object.php   SQO contract.
	 * @see class.export_tabulator.php       NDJSON wire protocol.
	 *
	 * @param object $options {
	 *   section_tipo: string,       // REQUIRED; fallback: $options->tipo (legacy callers)
	 *   model: string,              // default 'section'
	 *   data_format: string,        // REQUIRED: 'value' | 'grid_value' | 'dedalo_raw'
	 *   breakdown: string,          // default 'default'
	 *   fill_the_gaps: bool,        // default true
	 *   value_with_parents: bool,   // default false
	 *   ar_ddo_to_export: array,    // REQUIRED: DDO map (see $ar_ddo_map property)
	 *   sqo: object,               // REQUIRED: search query object
	 *   ndjson_stream: bool         // default false
	 * }
	 * @return object {
	 *   result: object|false,   // flat table on success, false on error
	 *   msg: string             // human-readable status
	 * }
	 */
	public static function get_export_grid(object $options) : object {

		set_time_limit(self::MAX_EXECUTION_TIME);

		$is_stream = $options->ndjson_stream ?? false;

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';

		// options
			// Legacy callers sent 'tipo' before the field was renamed to 'section_tipo';
			// the ?? fallback preserves backwards compatibility without a migration.
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
	 * Single authoritative source of the NDJSON export protocol line objects.
	 * All three consumers — stream_export_grid(), build_export_grid(), and unit
	 * tests — pull from this generator:
	 *   - stream_export_grid() JSON-encodes and echoes each yielded object.
	 *   - build_export_grid() drains the generator and buckets lines by 't'.
	 *   - Tests consume the generator directly to assert individual lines.
	 *
	 * Yield sequence:
	 *   1. One 'meta' line (section_tipo, total record count, config flags).
	 *   2. For each record, zero or more 'col' lines (newly discovered columns)
	 *      followed by one or more 'row' lines (the record's cell data).
	 *      'col' lines may interleave with 'row' lines mid-stream (single pass).
	 *   3. One 'end' line (authoritative column display order, row count).
	 *
	 * Memory management:
	 *   Instance caches (section_record_instances_cache, component_instances_cache)
	 *   are flushed and PHP's cycle collector is triggered every 100 records.
	 *   Without this, a 50 000-record export can easily exhaust the PHP memory
	 *   limit, because each component_common instance holds ORM data.
	 *
	 * @return Generator Yields stdClass line objects; each has a 't' discriminator.
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
				// TM rows carry 'id' (the TM row primary key), not 'section_id'
				$rec_id		= $is_tm
					? (int)$row->id
					: $row->section_id;

				foreach ($tabulator->record_lines($ar_entries, $rec_id) as $line) {
					yield $line;
				}

				if ($row_index % 100 === 0) {
					// Clear internal caches and collect garbage to prevent growth
					// Modulo 100 rather than every row balances GC overhead vs
					// memory growth: each gc_collect_cycles() call has non-trivial
					// cost; clearing every row would dominate CPU on large exports.
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
	 * NDJSON streaming writer — sends the protocol lines from iterate_export_lines()
	 * directly to the HTTP response, one JSON object per line, without buffering.
	 * Called by get_export_grid() when ndjson_stream=true; that call then exits
	 * immediately so no further PHP output reaches the client.
	 *
	 * Header strategy:
	 * - application/x-ndjson prevents browsers from buffering the stream.
	 * - X-Accel-Buffering: no disables Nginx proxy buffering.
	 * - Content-Encoding: identity disables mod_deflate / gzip compression,
	 *   which would buffer chunks until a threshold is met, stalling the stream.
	 * - Cache-Control / Pragma / Expires prevent proxy and browser caching of
	 *   what could be a very large, one-time export response.
	 *
	 * 4 KB padding line:
	 * Apache mod_proxy_fcgi and some other reverse proxies hold the first chunk
	 * until their internal buffer fills (commonly 4–8 KB). The initial 4 096-byte
	 * space line is never parsed by the client (the JS reader skips whitespace-only
	 * lines); it only exists to flush that proxy buffer so the meta line arrives
	 * immediately and the progress bar can start.
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
	 * In-memory alternative to stream_export_grid(): drains iterate_export_lines()
	 * and buckets the protocol lines by their 't' discriminator into a single
	 * response object.
	 *
	 * The returned shape mirrors the NDJSON protocol in object form:
	 * - meta    — one object (first 'meta' line)
	 * - columns — ordered list of 'col' line objects (emit order from the stream)
	 * - rows    — list of 'row' line objects (sub-rows for breakdown modes included)
	 * - end     — one object with authoritative column display order + counts
	 *
	 * (!) For large sections this loads all rows into memory at once. Prefer
	 * stream_export_grid() (ndjson_stream=true) for production exports; use this
	 * path only for small datasets or programmatic callers that need a PHP object.
	 *
	 * @return object {
	 *   meta: object|null,
	 *   columns: array,
	 *   rows: array,
	 *   end: object|null
	 * }
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
	 * Fetches the db_result iterator of rows to export, either from a
	 * pre-injected $this->records value or by running the sqo against
	 * sections::get_data().
	 *
	 * Caching: the result is stored in $this->records after the first call
	 * so that callers (e.g. tests) can call get_records() more than once
	 * without re-querying. setup() resets $this->records to null, so a new
	 * setup() call invalidates the cache.
	 *
	 * Caller injection: external callers (unit tests, batch scripts) may
	 * assign a db_result directly to $this->records before calling
	 * iterate_export_lines(); this method will then return it unchanged,
	 * bypassing all sqo/DB logic.
	 *
	 * Model switch:
	 * - 'section' (default): standard sqo -> sections::get_data() path.
	 * - 'component_portal': stub — not yet implemented; the switch falls
	 *   through without setting $this->records, which causes a return of null
	 *   (!) and will produce a TypeError at the caller. Tracked as a known gap.
	 *
	 * @return db_result Iterator of row objects; each has at minimum
	 *   section_tipo and section_id (or id for TM rows).
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
	 * Extracts the export atoms for a single source row by iterating over every
	 * export ddo, instantiating the corresponding component, and calling
	 * get_export_value() (or get_raw_export_value() for 'dedalo_raw').
	 *
	 * Each returned entry is a plain object matching the shape expected by
	 * export_tabulator::record_lines():
	 *   { value: export_value, section_tipo: string, component_tipo: string,
	 *     path: export_path_segment[] }
	 *
	 * Replaces the legacy get_grid_value(): the descendant ddo chain and the
	 * absolute-URLs flag travel via export_context rather than being injected
	 * via request_config / column_obj / caller instance fields.
	 *
	 * Time Machine path (sqo->mode === 'tm'):
	 *   Standard db_result rows carry section_tipo/section_id pointing to the
	 *   source record. TM rows instead carry a bare 'id' (the matrix_time_machine
	 *   primary key) and their section_tipo in the row is the DATA section
	 *   (e.g. mdcat2949), not the TM section (dd15). Because all export DDO
	 *   paths are authored against dd15, the locator must be set to dd15 +
	 *   row->id. Before component instantiation, tm_record::get_section_record()
	 *   is called to populate the section_record cache for that TM row, so
	 *   components can read data through their normal path.
	 *
	 * Relation data injection (non-TM):
	 *   Search result rows carry a pre-fetched 'relation' map keyed by component
	 *   tipo. Injecting it via set_data() avoids an additional DB read per
	 *   relation component per row — critical for performance on large exports.
	 *
	 * Ontology cache:
	 *   The static $ontology_cache map amortises repeated ontology_node lookups
	 *   (get_translatable + get_model_by_tipo) across all rows for the same tipo.
	 *
	 * @param array  $ar_ddo  Ordered list of DDO objects (see $ar_ddo_map property).
	 * @param object $row     Row object from db_result. In standard mode: {section_tipo,
	 *                        section_id, relation: object}. In TM mode: {id, section_tipo, …}.
	 * @return array Ordered list of entry objects, one per successfully resolved ddo.
	 *               DDOs whose first path step does not match the current section_tipo
	 *               are silently skipped (with a one-time WARNING log).
	 */
	protected function get_record_atoms(array $ar_ddo, object $row) : array {

		$ar_entries = [];

		// time machine mode check
		// matrix_time_machine rows have section_tipo = data section (e.g. mdcat2949), not the TM section (dd15).
		// DDO paths reference dd15 as section_tipo, so matching against row->section_tipo always fails.
		$is_tm = ($this->sqo->mode ?? null) === 'tm';

		if (!isset(self::$locator)) {
			// Lazy-create the shared locator once per export run. It is mutated
			// (set_section_tipo / set_section_id) on every row rather than
			// re-instantiated, saving allocation overhead over large record sets.
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

			// Guard: skip DDOs that are not direct children of this row's section.
			// This can happen when a multi-section sqo returns rows from different
			// section_tipos and some DDOs only apply to a subset of them.
			if ($ddo === null) {
				// PHP static local variable: $ddo_null_logged is initialised once per
				// process (not per-request in persistent workers). Logs the first mismatch
				// only — repeated logging would generate megabytes on large exports.
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
					// Resolve once and cache: lang depends on translatability;
					// non-translatable components always use DEDALO_DATA_NOLAN.
					$is_translatable = ontology_node::get_translatable($component_tipo);
					self::$ontology_cache[$component_tipo] = (object)[
						'lang'  => $is_translatable ? DEDALO_DATA_LANG : DEDALO_DATA_NOLAN,
						'model' => ontology_node::get_model_by_tipo($component_tipo, true)
					];
				}
				$current_lang    = self::$ontology_cache[$component_tipo]->lang;
				$component_model = self::$ontology_cache[$component_tipo]->model;

				$component_mode = $is_tm ? 'tm' : 'edit';

				// cache=false: each row needs a fresh component instance so stale
				// data from a previous row does not bleed into the current row's atoms.
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
			// (otherwise the raw identity key would leak as the column header).
			// section_tipo may be an array for multi-section autocomplete fields
			// (toponymy); only the first entry is used as the segment's section label.
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
