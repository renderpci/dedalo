<?php declare(strict_types=1);
/**
* AREA_COMMON
*
*/
class area_common extends common  {



	/**
	* CLASS VARS
	*/



	/**
	* GET_INSTANCE
	* Singleton pattern
	* @param string $model
	* @param string $tipo
	* @param string $mode = 'list'
	* @return object $area_instance
	*/
	public static function get_instance( string $model, string $tipo, string $mode='list' ) : object {

		$area_instance = new $model($tipo, $mode);

		return $area_instance;
	}//end get_instance



	/**
	* __CONSTRUCT
	* @param string $tipo
	* @param string $mode
	* @return void
	*/
	protected function __construct( string $tipo, string $mode ) {

		// fix main vars
		$this->set_tipo($tipo);
		$this->set_mode($mode);
		$this->set_lang(DEDALO_DATA_LANG);

		// common load thesaurus data of current obj
		parent::load_structure_data();
	}//end __construct



	/**
	* GET_SECTION_TIPO
	* Only to preserve compatibility with sections in some scenarios like building
	* request_config
	* @return string $tipo
	*/
	public function get_section_tipo() : string {

		return $this->tipo;
	}//end get_section_tipo



	/**
	* GET SECTION ID
	* Overwrites common method
	* @return null
	*/
	public function get_section_id() : string|int|null {

		return null;
	}//end get_section_id



	/**
	* GET_JSON
	* Overrides common::get_json to fall back to area_common_json.php when the
	* concrete area subclass does not define its own JSON controller.
	* This allows every area_* subclass (area, area_resource, area_admin, ...)
	* to inherit the generic dashboard payload without per-class boilerplate.
	* Subclasses that ship their own <class>_json.php (area_thesaurus, area_graph, ...)
	* keep their custom behaviour untouched.
	* @param object|null $request_options
	* @return object $json
	*/
	public function get_json( ?object $request_options=null ) : object {

		$called_model	= get_class($this);
		$path			= DEDALO_CORE_PATH .'/'. $called_model .'/'. $called_model .'_json.php';

		// If the subclass has its own controller, defer to the parent implementation
		if (file_exists($path)) {
			return parent::get_json($request_options);
		}

		// Generic fallback: build options like common::get_json does and include
		// the shared controller area_common_json.php in the current object scope.
		$options = new stdClass();
			$options->get_context		= $request_options->get_context ?? true;
			$options->get_data			= $request_options->get_data ?? true;
			$options->get_request_config= $request_options->get_request_config ?? false;

		$fallback_path = DEDALO_CORE_PATH . '/area_common/area_common_json.php';

		try {
			$json = include( $fallback_path );
		} catch (Exception $e) {
			debug_log(__METHOD__
				. " Error loading area_common_json.php fallback " . PHP_EOL
				. ' Caught exception: ' . $e->getMessage() . PHP_EOL
				. ' path: ' . $fallback_path
				, logger::ERROR
			);
			$json = common::build_element_json_output([], []);
		}


		return $json;
	}//end get_json



	/**
	* GET_DASHBOARD_CHILD_SECTIONS
	* Walks ontology children recursively under this area and returns the tipos of
	* all descendant sections. Nested sub-areas are traversed so their sections are
	* included in the parent area dashboard (e.g. 'resources' aggregates audiovisual,
	* image, document, etc.).
	* Excludes section_tool and any explicitly excluded models, plus virtual or
	* untabled sections (no matrix_table → not countable).
	* @return array<string> $ar_section_tipo
	*/
	public function get_dashboard_child_sections() : array {

		$ar_result		= [];
		$ar_visited		= [];
		$accept_models	= ['section'];
		$descend_models	= ['area', 'section'];
		$exclude_models	= ['login', 'tools', 'section_list', 'filter', 'section_tool'];

		$walker = function(string $tipo) use (&$walker, &$ar_result, &$ar_visited, $accept_models, $descend_models, $exclude_models) : void {

			if (isset($ar_visited[$tipo])) {
				return; // protect against ontology cycles
			}
			$ar_visited[$tipo] = true;

			$ontology_node	= ontology_node::get_instance($tipo);
			$ar_children	= $ontology_node->get_ar_children_of_this();

			foreach ($ar_children as $child_tipo) {

				$model = ontology_node::get_model_by_tipo($child_tipo, true);

				if (in_array($model, $exclude_models, true)) {
					continue;
				}

				if (in_array($model, $accept_models, true)) {
					$ar_result[] = $child_tipo;
				}

				if (in_array($model, $descend_models, true)) {
					$walker($child_tipo);
				}
			}
		};

		$walker($this->get_tipo());

		// dedup preserving order
		$ar_result = array_values(array_unique($ar_result));


		return $ar_result;
	}//end get_dashboard_child_sections



	/**
	* COUNT_SECTION_RECORDS
	* Returns total number of records for a section_tipo.
	* Uses search::count() so it respects user permissions and project filters
	* defined at SQO level (same behaviour as `dd_core_api::count`).
	* Returns null when the section is not countable (no matrix_table) or when
	* the current user has no read permission.
	* @param string $section_tipo
	* @return int|null $total
	*/
	public function count_section_records(string $section_tipo) : ?int {

		// permission check (read = 1)
		$permissions = common::get_permissions($section_tipo, $section_tipo);
		if ($permissions < 1) {
			return null;
		}

		// not all section tipos are backed by a matrix_table (virtual sections etc.)
		$matrix_table = common::get_matrix_table_from_tipo($section_tipo);
		if (empty($matrix_table)) {
			return null;
		}

		try {
			$sqo = new search_query_object();
				$sqo->set_section_tipo([$section_tipo]);
				$sqo->set_limit(0);
				$sqo->set_full_count(true);

			$search			= search::get_instance($sqo);
			$result			= $search->count();
			$total			= (int)($result->total ?? 0);
		} catch (\Throwable $e) {
			debug_log(__METHOD__
				. ' Failed to count records' . PHP_EOL
				. ' section_tipo: ' . $section_tipo . PHP_EOL
				. ' error: ' . $e->getMessage()
				, logger::ERROR
			);
			return null;
		}


		return $total;
	}//end count_section_records



	/**
	* GET_DASHBOARD_DATA
	* Build the dashboard payload for the current area: a list of descendant
	* sections with basic metrics. Designed to be extended by subclasses or by
	* adding more `metric_*` methods.
	*
	* Returned structure:
	* {
	*   "area_tipo"   : "dd14",
	*   "area_label"  : "Resources",
	*   "generated_at": 1731768000,
	*   "metrics"     : ["total"],
	*   "sections"    : [
	*     {
	*       "section_tipo": "rsc167",
	*       "label"       : "Audiovisual",
	*       "model"       : "section",
	*       "color"       : "#3b82f6",
	*       "total"       : 4321
	*     },
	*     ...
	*   ]
	* }
	*
	* @param array<string>|null $ar_metric_names Optional list of metric names.
	*   Default ['total']. Each name N must have a matching method `metric_<N>`.
	* @return object $dashboard
	*/
	public function get_dashboard_data(?array $ar_metric_names=null) : object {

		$ar_metric_names = $ar_metric_names ?? ['total'];

		$lang			= defined('DEDALO_APPLICATION_LANG') ? DEDALO_APPLICATION_LANG : DEDALO_DATA_LANG;
		$area_tipo		= $this->get_tipo();
		$ar_section_tipo= $this->get_dashboard_child_sections();

		$ar_sections = [];
		foreach ($ar_section_tipo as $section_tipo) {

			$model = ontology_node::get_model_by_tipo($section_tipo, true);

			$item = new stdClass();
				$item->section_tipo	= $section_tipo;
				$item->label		= ontology_node::get_term_by_tipo($section_tipo, $lang, false, true) ?? $section_tipo;
				$item->model		= $model;
				$item->color		= self::get_dashboard_color($section_tipo);

			// run each requested metric
			foreach ($ar_metric_names as $metric_name) {
				$method = 'metric_' . $metric_name;
				if (method_exists($this, $method)) {
					$item->{$metric_name} = $this->{$method}($section_tipo);
				}
			}

			$ar_sections[] = $item;
		}

		$dashboard = new stdClass();
			$dashboard->area_tipo		= $area_tipo;
			$dashboard->area_label		= ontology_node::get_term_by_tipo($area_tipo, $lang, false, true) ?? $area_tipo;
			$dashboard->generated_at	= time();
			$dashboard->metrics			= $ar_metric_names;
			$dashboard->sections		= $ar_sections;

		// Area-level metrics (not per-section). Default: 1 month only.
		// Larger ranges are fetched on-demand via API action `get_activity_metric`.
		$dashboard->activity_30d = $this->metric_activity_30d(30);

		return $dashboard;
	}//end get_dashboard_data



	/**
	* METRIC_TOTAL
	* Basic metric: total number of records for a section.
	* Subclasses or future metrics should follow the same signature
	* `metric_<name>(string $section_tipo) : mixed`.
	* @param string $section_tipo
	* @return int|null
	*/
	protected function metric_total(string $section_tipo) : ?int {

		return $this->count_section_records($section_tipo);
	}//end metric_total



	/**
	* METRIC_ACTIVITY_30D
	* Area-level metric: user activity grouped by day and section.
	* Queries matrix_activity directly using JSONB operators (no component instances)
	* for performance. Only counts activities where the WHERE value (dd546) directly
	* matches one of the area's child section tipos.
	*
	* Default range is 30 days (1 month). Larger ranges are fetched on-demand
	* via the API action `get_activity_metric` to avoid loading millions of rows
	* on the initial dashboard render.
	*
	* Return structure:
	* {
	*   date_from: "2025-04-17",
	*   date_to:   "2025-05-17",
	*   days: [
	*     { date: "2025-05-01", by_section: {rsc167: 12}, by_user: {"1": 15} },
	*     ...
	*   ],
	*   users: [ {id: "1", label: "Admin"}, ... ],
	*   available_ranges: [...]
	* }
	*
	* @param int $range_days Number of days to query (default 30)
	* @return object|null
	*/
	protected function metric_activity_30d(int $range_days=30) : ?object {

		$ar_section_tipo = $this->get_dashboard_child_sections();
		if (empty($ar_section_tipo)) {
			return null;
		}

		// Query the requested range only
		$date_to	= new DateTime();
		$date_from	= (clone $date_to)->modify('-' . $range_days . ' days');
		$date_to_str	= $date_to->format('Y-m-d');
		$date_from_str	= $date_from->format('Y-m-d');

		// Component tipos for JSONB extraction
		$where_tipo	= logger_backend_activity::$_COMPONENT_WHERE['tipo']; // dd546
		$who_tipo	= logger_backend_activity::$_COMPONENT_WHO['tipo'];	// dd543

		// Direct SQL with JSONB operators — avoids instantiating components per row
		$sql	= 'SELECT' . PHP_EOL;
		$sql	.= '  date_trunc(\'day\', "timestamp")::date AS day,' . PHP_EOL;
		$sql	.= '  relation->\'' . $who_tipo . '\'->0->>\'section_id\' AS user_id,' . PHP_EOL;
		$sql	.= '  string->\'' . $where_tipo . '\'->0->>\'value\' AS where_tipo' . PHP_EOL;
		$sql	.= 'FROM "matrix_activity"' . PHP_EOL;
		$sql	.= 'WHERE section_tipo = $1' . PHP_EOL;
		$sql	.= '  AND "timestamp" >= date($2)' . PHP_EOL;
		$sql	.= '  AND "timestamp" <  date($3)';

		$result = matrix_db_manager::exec_search($sql, [
			DEDALO_ACTIVITY_SECTION_TIPO,
			$date_from_str,
			$date_to_str
		]);

		if ($result === false) {
			debug_log(__METHOD__
				. ' Error querying matrix_activity'
				, logger::ERROR
			);
			return null;
		}

		// Build section lookup set (O(1) containment check)
		$section_set = array_flip($ar_section_tipo);

		// Aggregate rows
		$days		= []; // [date => ['by_section' => [...], 'by_user' => [...]]]
		$user_ids	= []; // track unique user IDs for name resolution

		while ($row = pg_fetch_object($result)) {

			$where_val = $row->where_tipo;

			// Handle legacy array-encoded values (e.g. "[\"oh32\"]")
			if (is_string($where_val) && str_starts_with($where_val, '[')) {
				$decoded = json_decode($where_val);
				if (is_array($decoded) && !empty($decoded)) {
					$where_val = $decoded[0];
				}
			}

			// Only count activities on this area's sections
			if (empty($where_val) || !is_string($where_val) || !isset($section_set[$where_val])) {
				continue;
			}

			$day		= $row->day;
			$user_id	= $row->user_id;

			// Init day bucket
			if (!isset($days[$day])) {
				$days[$day] = ['by_section' => [], 'by_user' => []];
			}

			// by_section
			$days[$day]['by_section'][$where_val] = ($days[$day]['by_section'][$where_val] ?? 0) + 1;

			// by_user
			if (!empty($user_id)) {
				$days[$day]['by_user'][$user_id] = ($days[$day]['by_user'][$user_id] ?? 0) + 1;
				$user_ids[$user_id] = true;
			}
		}
		pg_free_result($result);

		// Resolve user names (batch)
		$users = [];
		foreach (array_keys($user_ids) as $uid) {
			$label = login::logged_user_username((int)$uid);
			$users[] = (object)[
				'id'	=> $uid,
				'label'	=> !empty($label) ? $label : ('User #' . $uid)
			];
		}

		// Fill all days (including empty ones) for continuous chart rendering
		$ar_days = [];
		for ($i = clone $date_from; $i < $date_to; $i->modify('+1 day')) {
			$d = $i->format('Y-m-d');
			$bucket = $days[$d] ?? null;
			$ar_days[] = (object)[
				'date'		=> $d,
				'by_section'	=> $bucket ? (object)$bucket['by_section'] : new stdClass(),
				'by_user'	=> $bucket ? (object)$bucket['by_user'] : new stdClass()
			];
		}

		// Available ranges for client-side selector (days from now)
		$ar_ranges = [
			(object)['key' => '1m', 'label' => '1 month',  'days' => 30],
			(object)['key' => '3m', 'label' => '3 months', 'days' => 90],
			(object)['key' => '6m', 'label' => '6 months', 'days' => 180],
			(object)['key' => '1y', 'label' => '1 year',   'days' => 365]
		];

		return (object)[
			'date_from'		=> $date_from_str,
			'date_to'		=> $date_to_str,
			'days'			=> $ar_days,
			'users'			=> $users,
			'available_ranges'	=> $ar_ranges
		];
	}//end metric_activity_30d



	/**
	* GET_ACTIVITY_METRIC
	* Public static entry point for the API action `get_activity_metric`.
	* Creates a temporary area instance from the given area_tipo and delegates
	* to `metric_activity_30d` with the requested range.
	*
	* @param string $area_tipo The area tipo to query (required)
	* @param int $range_days Number of days to query (default 30)
	* @return object|null
	*/
	public static function get_activity_metric(string $area_tipo, int $range_days=30) : ?object {

		if (empty($area_tipo)) {
			return null;
		}

		// Instantiate the area model for the given tipo
		$model = ontology_node::get_model_by_tipo($area_tipo, true);
		if (empty($model)) {
			return null;
		}

		$element = area_common::get_instance(
			$model,
			$area_tipo,
			'list'
		);

		if (!method_exists($element, 'metric_activity_30d')) {
			return null;
		}

		return $element->metric_activity_30d($range_days);
	}//end get_activity_metric



	/**
	* GET_DASHBOARD_COLOR
	* Deterministic color from a section tipo. Uses a fixed HSL hue derived
	* from the tipo hash so the same section always renders with the same
	* color across reloads and sessions.
	* @param string $tipo
	* @return string $hex Color in #RRGGBB form
	*/
	public static function get_dashboard_color(string $tipo) : string {

		// stable hue 0-359 from tipo
		$hash	= crc32($tipo);
		$hue	= $hash % 360;
		$sat	= 65;	// %
		$light	= 52;	// %

		// HSL → RGB
		$h = $hue / 360.0;
		$s = $sat / 100.0;
		$l = $light / 100.0;

		$c = (1 - abs(2 * $l - 1)) * $s;
		$x = $c * (1 - abs(fmod($h * 6, 2) - 1));
		$m = $l - $c / 2;

		if     ($h < 1/6) { [$r,$g,$b] = [$c,$x,0]; }
		elseif ($h < 2/6) { [$r,$g,$b] = [$x,$c,0]; }
		elseif ($h < 3/6) { [$r,$g,$b] = [0,$c,$x]; }
		elseif ($h < 4/6) { [$r,$g,$b] = [0,$x,$c]; }
		elseif ($h < 5/6) { [$r,$g,$b] = [$x,0,$c]; }
		else              { [$r,$g,$b] = [$c,0,$x]; }

		$r = (int)round(($r + $m) * 255);
		$g = (int)round(($g + $m) * 255);
		$b = (int)round(($b + $m) * 255);


		return sprintf('#%02x%02x%02x', $r, $g, $b);
	}//end get_dashboard_color



}//end area_common
