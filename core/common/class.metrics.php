<?php declare(strict_types=1);
/**
* CLASS METRICS
* Centralizes lightweight performance counters across the application so developers
* can confirm the main processes run within reasonable timeframes and spot bottlenecks.
*
* All counters are public static properties (no instances), zero-initialized at class load.
* They are written by the recording API (see below) and read by get_summary() and reset().
*
* Naming convention (drives reset(), get_summary(), and the recording helpers):
*   <group>_total_time          float, accumulated wall-clock milliseconds across all calls
*   <group>_total_calls         int,   number of invocations
*   <group>_total_calls_cached  int,   invocations served from cache (a subset of _total_calls)
*   <group>_max_time            float, slowest single call (tail latency, NOT additive)
*   <group>_slow_calls          int,   calls that exceeded the SLOW_QUERY_MS threshold
*   <group>_table_time             float, set-semantics snapshot of last-known latency (NOT additive)
*   <group>_table_count / *_count  int,   set-semantics snapshot counters (last value wins)
*
* Recording API (prefer these over writing the statics directly):
*   metrics::add_metric('data_total_time', $start_time) // accumulate elapsed ms from start_time()
*   metrics::add_metric('data_total_calls')             // increment a call/cached counter
*   metrics::inc('search_total_calls')                  // increment any int counter
*   metrics::add_time_ms('search_total_time', $ms)      // accumulate a pre-computed ms value
*   metrics::observe_max('exec_search_max_time', $ms)   // keep slowest single call (tail latency)
*   metrics::set('security_permissions_table_count', n) // overwrite (set-semantics)
*
* (!) In persistent worker environments (e.g. RoadRunner) call metrics::reset() at the start of
*     each request to prevent counter bleed between requests sharing the same PHP process.
*
* @see metrics::get_summary() single source of truth for display (dd_manager) and the
*      performance_monitor file/dashboard bridge.
*
* @package Dédalo
* @subpackage Core
*/
final class metrics {


	// permissions — time and count for user permission table calculations
	/**
	* Wall-clock time spent on the most recent permission-table computation (set-semantics,
	* not additive — overwritten each time). Captures the last known latency snapshot.
	* @var float $security_permissions_table_time
	*/
	public static float $security_permissions_table_time = 0;
	/**
	* Number of permission-table entries resolved in the last computation (set-semantics).
	* @var int $security_permissions_table_count
	*/
	public static int $security_permissions_table_count = 0;
	/**
	* Accumulated milliseconds spent evaluating user permissions across all calls in this request.
	* @var float $security_permissions_total_time
	*/
	public static float $security_permissions_total_time = 0;
	/**
	* Total number of times permission resolution has been invoked in this request.
	* @var int $security_permissions_total_calls
	*/
	public static int $security_permissions_total_calls = 0;

	// search — high-level search subsystem (SQO execution path)
	/**
	* Accumulated milliseconds spent inside the search subsystem (from SQO creation to result
	* set return) across all searches in this request.
	* @var float $search_total_time
	*/
	public static float $search_total_time = 0;
	/**
	* Total number of search operations executed in this request.
	* @var int $search_total_calls
	*/
	public static int $search_total_calls = 0;
	/**
	* Slowest single search elapsed time (milliseconds). Updated by observe_max(); NOT additive —
	* excluded from the aggregate server-time calculation in get_summary().
	* @var float $search_max_time
	*/
	public static float $search_max_time = 0; // slowest single search (tail latency)

	// ontology — loading and resolving ontology terms
	/**
	* Accumulated milliseconds spent loading ontology definitions in this request.
	* @var float $ontology_total_time
	*/
	public static float $ontology_total_time = 0;
	/**
	* Total ontology load invocations; includes cache hits counted separately below.
	* @var int $ontology_total_calls
	*/
	public static int $ontology_total_calls = 0;
	/**
	* Subset of $ontology_total_calls that were served from the in-process static cache.
	* get_summary() derives the miss count as (total_calls - total_calls_cached).
	* @var int $ontology_total_calls_cached
	*/
	public static int $ontology_total_calls_cached = 0;

	// matrix — reading section/component data from the JSONB matrix tables
	/**
	* Accumulated milliseconds spent loading matrix (section/component) records in this request.
	* @var float $matrix_total_time
	*/
	public static float $matrix_total_time = 0;
	/**
	* Total number of matrix load invocations in this request.
	* @var int $matrix_total_calls
	*/
	public static int $matrix_total_calls = 0;

	// exec_search matrix_db_manager — raw PostgreSQL read queries executed by matrix_db_manager
	/**
	* Accumulated milliseconds spent in matrix_db_manager read queries in this request.
	* @var float $exec_search_total_time
	*/
	public static float $exec_search_total_time = 0;
	/**
	* Total number of read queries dispatched to matrix_db_manager in this request.
	* @var int $exec_search_total_calls
	*/
	public static int $exec_search_total_calls = 0;
	/**
	* Slowest single matrix read query (milliseconds). NOT additive; tail-latency sentinel.
	* @var float $exec_search_max_time
	*/
	public static float $exec_search_max_time = 0;  // slowest single read query
	/**
	* Number of matrix read queries that exceeded the SLOW_QUERY_MS threshold (config/config_db.php).
	* @var int $exec_search_slow_calls
	*/
	public static int $exec_search_slow_calls = 0;  // reads over SLOW_QUERY_MS

	// exec_search dd_ontology_db_manager — read queries executed against the ontology database
	/**
	* Accumulated milliseconds spent in dd_ontology_db_manager read queries in this request.
	* @var float $exec_dd_ontology_search_total_time
	*/
	public static float $exec_dd_ontology_search_total_time = 0;
	/**
	* Total number of read queries dispatched to dd_ontology_db_manager in this request.
	* @var int $exec_dd_ontology_search_total_calls
	*/
	public static int $exec_dd_ontology_search_total_calls = 0;
	/**
	* Slowest single ontology read query (milliseconds). NOT additive; tail-latency sentinel.
	* @var float $exec_dd_ontology_search_max_time
	*/
	public static float $exec_dd_ontology_search_max_time = 0;
	/**
	* Number of ontology read queries that exceeded the SLOW_QUERY_MS threshold.
	* @var int $exec_dd_ontology_search_slow_calls
	*/
	public static int $exec_dd_ontology_search_slow_calls = 0;

	// exec_write matrix_db_manager — INSERT/UPDATE/DELETE queries, split out from read (exec_search)
	/**
	* Accumulated milliseconds spent in matrix_db_manager write queries (INSERT/UPDATE/DELETE).
	* @var float $exec_write_total_time
	*/
	public static float $exec_write_total_time = 0;
	/**
	* Total number of write queries dispatched to matrix_db_manager in this request.
	* @var int $exec_write_total_calls
	*/
	public static int $exec_write_total_calls = 0;
	/**
	* Slowest single matrix write query (milliseconds). NOT additive; tail-latency sentinel.
	* @var float $exec_write_max_time
	*/
	public static float $exec_write_max_time = 0;   // slowest single write query
	/**
	* Number of matrix write queries that exceeded the SLOW_QUERY_MS threshold.
	* @var int $exec_write_slow_calls
	*/
	public static int $exec_write_slow_calls = 0;   // writes over SLOW_QUERY_MS

	// get_tools — element-context tool list resolution (common::get_tools)
	/**
	* Accumulated milliseconds spent resolving tool lists for UI elements in this request.
	* @var float $get_tools_total_time
	*/
	public static float $get_tools_total_time = 0;
	/**
	* Total get_tools invocations; includes cache hits counted separately below.
	* @var int $get_tools_total_calls
	*/
	public static int $get_tools_total_calls = 0;
	/**
	* Subset of $get_tools_total_calls served from the resolved-tools static cache.
	* @var int $get_tools_total_calls_cached
	*/
	public static int $get_tools_total_calls_cached = 0;
	/**
	* Accumulated milliseconds spent loading individual tool configuration objects.
	* Tracked separately from get_tools so bottlenecks within the config-load path are visible.
	* @var float $get_tool_config_total_time
	*/
	public static float $get_tool_config_total_time = 0;
	/**
	* Total number of individual tool-config loads in this request.
	* @var int $get_tool_config_total_calls
	*/
	public static int $get_tool_config_total_calls = 0;

	// section_save — top-level section persistence (full section save round-trip)
	/**
	* Accumulated milliseconds spent in top-level section save operations in this request.
	* @var float $section_save_total_time
	*/
	public static float $section_save_total_time = 0;
	/**
	* Total number of section save operations executed in this request.
	* @var int $section_save_total_calls
	*/
	public static int $section_save_total_calls = 0;

	// section_record save — per-component JSONB persist path (save_key_data)
	/**
	* Accumulated milliseconds spent persisting individual component values to the JSONB matrix.
	* @var float $section_record_save_total_time
	*/
	public static float $section_record_save_total_time = 0;
	/**
	* Total number of per-component JSONB key-data save operations in this request.
	* @var int $section_record_save_total_calls
	*/
	public static int $section_record_save_total_calls = 0;
	/**
	* Slowest single component save (milliseconds). NOT additive; tail-latency sentinel.
	* @var float $section_record_save_max_time
	*/
	public static float $section_record_save_max_time = 0; // slowest single component save

	// context — building the structure-context layer (core/stamp cache)
	/**
	* Accumulated milliseconds spent building structure context objects (section + components)
	* in this request.
	* @var float $structure_context_total_time
	*/
	public static float $structure_context_total_time = 0;
	/**
	* Total number of structure-context build operations in this request.
	* @var int $structure_context_total_calls
	*/
	public static int $structure_context_total_calls = 0;

	// data — resolving component dato values (get_dato / get_data path)
	/**
	* Accumulated milliseconds spent resolving component data (dato) values in this request.
	* @var float $data_total_time
	*/
	public static float $data_total_time = 0;
	/**
	* Total number of component data resolution invocations in this request.
	* @var int $data_total_calls
	*/
	public static int $data_total_calls = 0;

	// datalist — resolving component option lists (select/check_box/radio_button/relation datalists)
	/**
	* Accumulated milliseconds spent resolving component datalists (option lists) in this request.
	* @var float $datalist_total_time
	*/
	public static float $datalist_total_time = 0;
	/**
	* Total datalist resolution invocations; includes cache hits counted separately below.
	* @var int $datalist_total_calls
	*/
	public static int $datalist_total_calls = 0;
	/**
	* Subset of $datalist_total_calls served from the datalist static cache.
	* @var int $datalist_total_calls_cached
	*/
	public static int $datalist_total_calls_cached = 0;

	// presets — loading request-config preset definitions
	/**
	* Accumulated milliseconds spent loading preset definitions (source: request config presets)
	* in this request.
	* @var float $presets_total_time
	*/
	public static float $presets_total_time = 0;
	/**
	* Total number of preset load operations in this request.
	* @var int $presets_total_calls
	*/
	public static int $presets_total_calls = 0;

	// db_connection — acquiring PostgreSQL database connections
	/**
	* Accumulated milliseconds spent acquiring database connections in this request.
	* High values here indicate connection pool exhaustion or slow pg_connect() calls.
	* @var float $db_connection_total_time
	*/
	public static float $db_connection_total_time = 0;
	/**
	* Total number of database connection acquisition attempts in this request.
	* @var int $db_connection_total_calls
	*/
	public static int $db_connection_total_calls = 0;
	/**
	* Subset of $db_connection_total_calls served from the persistent-connection cache
	* (pg_connect with PGSQL_CONNECT_FORCE_NEW = false).
	* @var int $db_connection_total_calls_cached
	*/
	public static int $db_connection_total_calls_cached = 0;

	// request_config — build_request_config / get_ar_request_config orchestration
	/**
	* Accumulated milliseconds spent building or retrieving request config objects in this request.
	* @var float $request_config_total_time
	*/
	public static float $request_config_total_time = 0;
	/**
	* Total request-config resolution invocations; includes cache hits counted separately below.
	* @var int $request_config_total_calls
	*/
	public static int $request_config_total_calls = 0;
	/**
	* Subset of $request_config_total_calls served from the immutable config cache.
	* @var int $request_config_total_calls_cached
	*/
	public static int $request_config_total_calls_cached = 0;
	/**
	* Number of request configs whose source builder was 'rqo' (inline client RQO path).
	* @var int $request_config_source_rqo_total_calls
	*/
	public static int $request_config_source_rqo_total_calls = 0;
	/**
	* Number of request configs whose source builder was 'preset' (stored preset definition).
	* @var int $request_config_source_preset_total_calls
	*/
	public static int $request_config_source_preset_total_calls = 0;
	/**
	* Number of request configs built by the legacy v6 config builder.
	* High values here indicate sections not yet migrated to the v5/v7 builder.
	* @var int $request_config_source_v6_total_calls
	*/
	public static int $request_config_source_v6_total_calls = 0;
	/**
	* Number of request configs built by the v5 builder (the current default).
	* @var int $request_config_source_v5_total_calls
	*/
	public static int $request_config_source_v5_total_calls = 0;
	/**
	* Number of request-config entries dropped during the build (e.g. security filter drops).
	* @var int $request_config_drops_total_calls
	*/
	public static int $request_config_drops_total_calls = 0;

	/**
	* GROUPS
	* Ordered map of metric-name prefix => human readable group label.
	* Drives the grouping and display order in get_summary(). Several prefixes may
	* share a label (e.g. get_tools + get_tool_config). Order also defines display order.
	* @var array<string,string>
	*/
	private const GROUPS = [
		'security_permissions'		=> 'Permissions',
		'get_tools'					=> 'Tools',
		'get_tool_config'			=> 'Tools',
		'presets'					=> 'Presets (request config)',
		'request_config'			=> 'Request config',
		'search'					=> 'Search',
		'ontology'					=> 'Ontology load',
		'matrix'					=> 'Matrix load',
		'exec_search'				=> 'Search exec_search (matrix_db_manager)',
		'exec_dd_ontology_search'	=> 'Search exec_search (dd_ontology_db_manager)',
		'exec_write'				=> 'Write exec (matrix_db_manager)',
		'structure_context'			=> 'Context (all)',
		'data'						=> 'Data (components)',
		'datalist'					=> 'Datalist (option lists)',
		'section_save'				=> 'Section save',
		'section_record_save'		=> 'Section record save',
		'db_connection'				=> 'DB connection',
	];



	/**
	* ADD_METRIC
	* Generic recorder driven by the metric-name suffix. Dispatches to the correct
	* accumulation strategy based on the last '_'-delimited word of the metric name:
	*   - suffix 'time'   → calls exec_time_unit($start_time, 'ms') and adds the result
	*   - suffix 'calls'  → increments the counter by 1
	*   - suffix 'cached' → increments the cached counter by 1
	* Any other suffix (e.g. 'count', 'max') returns false; use set() or observe_max() instead.
	* Returns false when the property does not exist (typo guard) or the suffix is unsupported.
	* @param string $name - metric property name, e.g. 'data_total_time', 'ontology_total_calls_cached'
	* @param ?float $start_time = 0 - hrtime(true) nanosecond timestamp from start_time(); required
	*   for *_time metrics, ignored for *_calls / *_cached metrics
	* @return bool - false on unknown name or unsupported suffix, true on success
	*/
	public static function add_metric( string $name, ?float $start_time=0 ) : bool {

		if (!property_exists('metrics', $name)) {
			return false;
		}

		// suffix dispatch — extract the last word to determine the accumulation strategy
		$beats	= explode('_', $name);
		$type	= array_pop( $beats );

		switch ($type) {

			case 'time':
				metrics::$$name += exec_time_unit((float)$start_time, 'ms');
				break;

			case 'calls':
			case 'cached':
				metrics::$$name++;
				break;

			default:
				return false;
		}

		return true;
	}//end add_metric



	/**
	* INC
	* Increment an integer counter by an arbitrary amount. Use for _calls, _cached, _count,
	* _slow_calls, and similar additive int metrics. Prefer add_metric() when the amount is
	* always 1 and the name ends in '_calls' or '_cached'.
	* Returns false when the named property does not exist (typo guard).
	* @param string $name - metric property name, e.g. 'search_total_calls'
	* @param int $by = 1 - amount to add (defaults to 1)
	* @return bool - false on unknown name, true on success
	*/
	public static function inc( string $name, int $by=1 ) : bool {

		if (!property_exists('metrics', $name)) {
			return false;
		}

		metrics::$$name += $by;

		return true;
	}//end inc



	/**
	* ADD_TIME_MS
	* Accumulate a pre-computed elapsed time (in milliseconds) into a *_time metric.
	* Use this from call sites that already have a millisecond value (e.g. from a Bun API
	* response that returns its own elapsed time). For call sites with a raw start_time()
	* nanosecond timestamp, prefer add_metric() which calls exec_time_unit() internally.
	* Returns false when the named property does not exist (typo guard).
	* @param string $name - metric property name, e.g. 'search_total_time'
	* @param float $ms - elapsed time in milliseconds to add
	* @return bool - false on unknown name, true on success
	*/
	public static function add_time_ms( string $name, float $ms ) : bool {

		if (!property_exists('metrics', $name)) {
			return false;
		}

		metrics::$$name += $ms;

		return true;
	}//end add_time_ms



	/**
	* OBSERVE_MAX
	* Keep the maximum observed value in a *_max_time metric (tail latency: slowest single call).
	* Unlike *_total_time, the max metric is NOT additive — it represents the worst single
	* measurement in the current request, not a sum. Consequently get_summary() excludes
	* *_max_time values from the aggregate server-time total.
	* No-op when $value is not greater than the current stored maximum (monotonically increasing).
	* Returns false when the named property does not exist (typo guard).
	* @param string $name - metric property name, e.g. 'exec_search_max_time'
	* @param int|float $value - observed elapsed time (milliseconds)
	* @return bool - false on unknown name, true on success
	*/
	public static function observe_max( string $name, int|float $value ) : bool {

		if (!property_exists('metrics', $name)) {
			return false;
		}

		if ($value > metrics::$$name) {
			metrics::$$name = $value;
		}

		return true;
	}//end observe_max



	/**
	* SET
	* Overwrite a metric with an absolute value (set-semantics). Use for snapshot/last-value
	* counters such as *_table_count or *_table_time where the interesting data point is the
	* last known value, not a running total. Do not use for time or call-count accumulators
	* where add_metric() / add_time_ms() / inc() are the correct methods.
	* Returns false when the named property does not exist (typo guard).
	* @param string $name - metric property name, e.g. 'security_permissions_table_count'
	* @param int|float $value - absolute value to store
	* @return bool - false on unknown name, true on success
	*/
	public static function set( string $name, int|float $value ) : bool {

		if (!property_exists('metrics', $name)) {
			return false;
		}

		metrics::$$name = $value;

		return true;
	}//end set



	/**
	* GET_SUMMARY
	* Single source of truth for metric display. Builds a grouped, structured view of all
	* current static counters by reflecting over the class properties and bucketing each
	* property into its GROUPS label. Empty groups (all values still zero) are omitted
	* from the output, so the caller only sees subsystems that were actually exercised.
	*
	* A synthetic 'ontology_total_calls_different' entry is injected into the Ontology group
	* to surface cache misses without the caller needing to compute them.
	*
	* The returned 'summary.time_ms' is the sum of every *_total_time counter only — it
	* intentionally excludes *_max_time (tail latency, not additive) and *_table_time
	* (set-semantics snapshot, not additive).
	*
	* Consumed by dd_manager (debug log) and performance_monitor (file log / dashboard).
	*
	* @return array{groups: array<string, array<string, int|float>>, summary: array{time_ms: float}}
	*   - groups: map of human-readable label → [metric_name => value, …], omitting empty groups
	*   - summary.time_ms: total accumulated server time in milliseconds (3 decimal places)
	*/
	public static function get_summary() : array {

		$props = (new ReflectionClass(self::class))->getStaticProperties();

		// prefix disambiguation — sort longest-first so a more-specific prefix always wins.
		// Without this, 'exec_dd_ontology_search' would be incorrectly matched by 'search'
		// before the loop reached the correct prefix.
		$prefixes = array_keys(self::GROUPS);
		usort($prefixes, fn($a, $b) => strlen($b) - strlen($a));

		// initialize groups preserving GROUPS declaration order
		$groups		= [];
		$total_time	= 0.0;
		foreach (self::GROUPS as $label) {
			$groups[$label] = [];
		}

		foreach ($props as $name => $value) {

			if (!is_int($value) && !is_float($value)) {
				continue;
			}

			// aggregate server time across every cumulative *_total_time metric.
			// Excludes non-additive values: *_max_time (tail latency) and *_table_time
			// (set-semantics last value).
			if (str_ends_with($name, '_total_time')) {
				$total_time += (float)$value;
			}

			// assign to its group using the longest-matching prefix (first match wins)
			foreach ($prefixes as $prefix) {
				if (str_starts_with($name, $prefix . '_')) {
					$groups[self::GROUPS[$prefix]][$name] = $value;
					break;
				}
			}
		}

		// derived: ontology cache misses = total calls minus cached calls.
		// Injected here so callers never have to compute the subtraction themselves.
		if (isset($groups['Ontology load']['ontology_total_calls'])) {
			$groups['Ontology load']['ontology_total_calls_different'] =
				$groups['Ontology load']['ontology_total_calls']
				- ($groups['Ontology load']['ontology_total_calls_cached'] ?? 0);
		}

		// drop empty groups (no activity during this request)
		$groups = array_filter($groups, function(array $metrics) : bool {
			foreach ($metrics as $v) {
				if ($v != 0) {
					return true;
				}
			}
			return false;
		});

		return [
			'groups'	=> $groups,
			'summary'	=> [
				'time_ms' => round($total_time, 3)
			]
		];
	}//end get_summary



	/**
	* RESET
	* Reset every numeric static metric to zero by reflecting over the class properties.
	* Uses the same ReflectionClass snapshot as get_summary() so any newly added property
	* is reset automatically — there is no separate list to maintain.
	*
	* (!) Must be called at the start of each request in persistent PHP worker environments
	*     (e.g. RoadRunner, Swoole) where the same PHP process handles multiple requests and
	*     static properties survive between them. Failure to call reset() causes counter bleed:
	*     a slow request's numbers pollute the next request's report.
	*
	* @return void
	*/
	public static function reset() : void {

		$props = (new ReflectionClass(self::class))->getStaticProperties();
		foreach ($props as $name => $value) {
			if (is_int($value) || is_float($value)) {
				metrics::$$name = 0;
			}
		}
	}//end reset



}//end class metrics
