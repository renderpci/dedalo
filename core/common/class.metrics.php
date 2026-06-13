<?php declare(strict_types=1);
/**
* METRICS CLASS
* Centralizes lightweight performance counters across the application so developers
* can confirm the main processes run within reasonable timeframes and spot bottlenecks.
*
* Naming convention (drives reset(), get_summary() and the recording helpers):
*   <group>_total_time     float, accumulated milliseconds
*   <group>_total_calls    int,   number of invocations
*   <group>_total_calls_cached  int, invocations served from cache
*   <group>_table_count / *_count  int, set-semantics counters
*
* Recording API (prefer these over writing the statics directly):
*   metrics::add_metric('data_total_time', $start_time) // accumulate elapsed ms from start_time()
*   metrics::add_metric('data_total_calls')             // increment a call/cached counter
*   metrics::inc('search_total_calls')                  // increment any int counter
*   metrics::add_time_ms('search_total_time', $ms)      // accumulate a pre-computed ms value
*   metrics::observe_max('exec_search_max_time', $ms)   // keep slowest single call (tail latency)
*   metrics::set('security_permissions_table_count', n) // overwrite (set-semantics)
*
* @see metrics::get_summary() single source of truth for display (dd_manager) and the
*      performance_monitor file/dashboard bridge.
*/
final class metrics {


	// permissions. Time to calculate user permissions
	public static float $security_permissions_table_time = 0;
	public static int $security_permissions_table_count = 0;
	public static float $security_permissions_total_time = 0;
	public static int $security_permissions_total_calls = 0;

	// search
	public static float $search_total_time = 0;
	public static int $search_total_calls = 0;
	public static float $search_max_time = 0; // slowest single search (tail latency)

	// ontology
	public static float $ontology_total_time = 0;
	public static int $ontology_total_calls = 0;
	public static int $ontology_total_calls_cached = 0;

	// matrix
	public static float $matrix_total_time = 0;
	public static int $matrix_total_calls = 0;

	// exec_search matrix_db_manager
	public static float $exec_search_total_time = 0;
	public static int $exec_search_total_calls = 0;
	public static float $exec_search_max_time = 0;  // slowest single read query
	public static int $exec_search_slow_calls = 0;  // reads over SLOW_QUERY_MS

	// exec_search dd_ontology_db_manager
	public static float $exec_dd_ontology_search_total_time = 0;
	public static int $exec_dd_ontology_search_total_calls = 0;
	public static float $exec_dd_ontology_search_max_time = 0;
	public static int $exec_dd_ontology_search_slow_calls = 0;

	// exec_write matrix_db_manager (INSERT/UPDATE/DELETE, split out from exec_search reads)
	public static float $exec_write_total_time = 0;
	public static int $exec_write_total_calls = 0;
	public static float $exec_write_max_time = 0;   // slowest single write query
	public static int $exec_write_slow_calls = 0;   // writes over SLOW_QUERY_MS

	// get_tools (current element context tools calculations)
	public static float $get_tools_total_time = 0;
	public static int $get_tools_total_calls = 0;
	public static int $get_tools_total_calls_cached = 0;
	public static float $get_tool_config_total_time = 0;
	public static int $get_tool_config_total_calls = 0;

	// section_save
	public static float $section_save_total_time = 0;
	public static int $section_save_total_calls = 0;

	// section_record save (per-component JSONB persist path: save_key_data)
	public static float $section_record_save_total_time = 0;
	public static int $section_record_save_total_calls = 0;
	public static float $section_record_save_max_time = 0; // slowest single component save

	// context
	public static float $structure_context_total_time = 0;
	public static int $structure_context_total_calls = 0;

	// data
	public static float $data_total_time = 0;
	public static int $data_total_calls = 0;

	// datalist (component option lists: select/check_box/radio_button/relation)
	public static float $datalist_total_time = 0;
	public static int $datalist_total_calls = 0;
	public static int $datalist_total_calls_cached = 0;

	// presets
	public static float $presets_total_time = 0;
	public static int $presets_total_calls = 0;

	// db_connection
	public static float $db_connection_total_time = 0;
	public static int $db_connection_total_calls = 0;
	public static int $db_connection_total_calls_cached = 0;

	// request_config (build_request_config / get_ar_request_config)
	public static float $request_config_total_time = 0;
	public static int $request_config_total_calls = 0;
	public static int $request_config_total_calls_cached = 0;
	public static int $request_config_source_rqo_total_calls = 0;
	public static int $request_config_source_preset_total_calls = 0;
	public static int $request_config_source_v6_total_calls = 0;
	public static int $request_config_source_v5_total_calls = 0;
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
	* Generic recorder driven by the metric-name suffix.
	* @param string $name
	* 	e.g. data_total_time, data_total_calls, ontology_total_calls_cached
	* @param float|null $start_time
	* 	only used for *_time metrics (value from start_time())
	* @return bool
	*/
	public static function add_metric( string $name, ?float $start_time=0 ) : bool {

		if (!property_exists('metrics', $name)) {
			return false;
		}

		// get last word (e.g. 'time' for 'data_total_time')
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
	* Increment an integer counter (calls, cached, count, …).
	* @param string $name
	* @param int $by = 1
	* @return bool
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
	* Accumulate a pre-computed elapsed time, in milliseconds, into a *_time metric.
	* Use this from call sites that already computed the elapsed ms themselves.
	* @param string $name
	* @param float $ms
	* @return bool
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
	* Keep the maximum observed value in a *_max_time metric (tail latency: the
	* slowest single call). Unlike *_total_time it is NOT additive, so get_summary()
	* excludes *_max_time from the aggregate server time.
	* @param string $name
	* @param int|float $value
	* @return bool
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
	* Overwrite a metric with an absolute value (set-semantics, e.g. table_count).
	* @param string $name
	* @param int|float $value
	* @return bool
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
	* Single source of truth for metric display. Builds a grouped, structured view of
	* the current static counters by reflecting over the class properties and bucketing
	* them with GROUPS. Empty groups (all values zero) are omitted. A computed 'summary'
	* group adds the aggregate server time (sum of every *_time metric, in ms).
	* Consumed by dd_manager (debug log) and performance_monitor (file log / dashboard).
	* @return array
	* 	['groups' => [label => [name => value, ...], ...], 'summary' => ['time_ms' => float]]
	*/
	public static function get_summary() : array {

		$props = (new ReflectionClass(self::class))->getStaticProperties();

		// prefixes sorted longest-first so e.g. 'exec_dd_ontology_search' wins over 'search'
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

			// assign to its group (longest matching prefix)
			foreach ($prefixes as $prefix) {
				if (str_starts_with($name, $prefix . '_')) {
					$groups[self::GROUPS[$prefix]][$name] = $value;
					break;
				}
			}
		}

		// derived: ontology cache misses
		if (isset($groups['Ontology load']['ontology_total_calls'])) {
			$groups['Ontology load']['ontology_total_calls_different'] =
				$groups['Ontology load']['ontology_total_calls']
				- ($groups['Ontology load']['ontology_total_calls_cached'] ?? 0);
		}

		// drop empty groups (no activity)
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
	* Reset all numeric static metrics to zero by reflecting over the class properties.
	* Self-describing: new metrics are reset automatically, no second list to maintain.
	* Required for persistent environments like RoadRunner to avoid cross-request bleed.
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
