<?php declare(strict_types=1);
/**
* AREA_COMMON
* Abstract base for all Dédalo area classes; provides dashboard infrastructure and
* the generic JSON controller fallback.
*
* An "area" in Dédalo is a top-level navigational node in the ontology tree
* (e.g. area_resource, area_thesaurus, area_admin). `area_common` is not
* instantiated directly; concrete subclasses (area, area_resource, area_admin,
* area_thesaurus, area_graph, area_maintenance, area_development, area_ontology,
* area_tool, area_publication, area_root, area_activities, area_activity) each
* extend it and may override or augment the methods here.
*
* Responsibilities:
* - Construction: sets tipo, mode, and lang, then loads structure data from the
*   ontology via parent::load_structure_data().
* - JSON controller dispatch: get_json() checks whether the concrete subclass
*   ships its own <class>_json.php; if not it falls back to area_common_json.php,
*   which builds the generic dashboard payload (context + metrics).
* - Dashboard generation: get_dashboard_data() collects descendant section tipos,
*   runs one or more named metric_* callbacks per section, and appends area-level
*   activity data from matrix_activity (dd542).
* - Record counting: count_section_records() queries PostgreSQL via the SQO search
*   layer, respecting permissions and only targeting sections that have a real
*   matrix_table backing them.
* - Activity metrics: metric_activity_30d() issues a direct parameterised SQL query
*   against matrix_activity, aggregating by day and section, and fills a continuous
*   date series for the client activity chart.
*
* Extends: common (core/common/class.common.php)
* Extended by: area, area_resource, area_admin, area_thesaurus, area_graph,
*              area_maintenance, area_development, area_ontology, area_tool,
*              area_publication, area_root, area_activities, area_activity
*
* @package Dédalo
* @subpackage Core
*/
class area_common extends common  {



	/**
	* CLASS VARS
	* area_common inherits all instance properties from common (tipo, mode, lang,
	* from_parent, properties, etc.). No additional static or instance properties
	* are declared here; all state is accessed through the inherited getters/setters.
	*/



	/**
	* GET_INSTANCE
	* Factory method that instantiates an area subclass by its model name.
	* Despite the "Singleton pattern" label this is NOT a singleton; it always
	* creates a new instance.  The name mirrors the component convention so that
	* callers can use area_common::get_instance() the same way they would call
	* component_common::get_instance().
	*
	* Callers should resolve $model first via ontology_node::get_model_by_tipo()
	* before invoking this factory, so that the concrete subclass (e.g. area_resource)
	* is instantiated rather than the generic area.
	*
	* @param string $model     PHP class name of the concrete subclass (e.g. 'area_resource')
	* @param string $tipo      Ontology tipo identifier for the area node (e.g. 'dd14')
	* @param string $mode      Render mode passed to __construct; typically 'list'
	* @return object           New instance of the concrete area subclass
	*/
	public static function get_instance( string $model, string $tipo, string $mode='list' ) : object {

		$area_instance = new $model($tipo, $mode);

		return $area_instance;
	}//end get_instance



	/**
	* __CONSTRUCT
	* Initialises the area instance with its ontology tipo and render mode, then
	* triggers the parent structure-data load so that properties, labels, and
	* children node lists are available immediately after construction.
	*
	* The constructor is protected so callers MUST use get_instance(); direct
	* `new area_common(...)` is intentionally blocked.
	*
	* Side effects:
	* - Calls parent::load_structure_data(), which populates $this->properties from
	*   the ontology cache and sets up the context cache key for this node.
	*
	* @param string $tipo  Ontology tipo identifier for this area node
	* @param string $mode  Render mode (typically 'list')
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
	* Returns the area's own tipo as its "section tipo".
	* Areas are not sections but several infrastructure paths (request_config builders,
	* context serialisers, the generic JSON controller) call get_section_tipo() on any
	* element they receive. For areas, tipo === section_tipo by convention, so this
	* shim returns $this->tipo directly, making area instances duck-type-compatible
	* with section instances in those paths.
	* @return string  The ontology tipo of this area (e.g. 'dd14')
	*/
	public function get_section_tipo() : string {

		return $this->tipo;
	}//end get_section_tipo



	/**
	* GET_SECTION_ID
	* Always returns null for area instances.
	* Areas are structural/navigational nodes in the ontology, not data-bearing
	* section records. They have no row in any matrix_* table and therefore have
	* no section_id. This override prevents the inherited common::get_section_id()
	* from returning a stale or misleading value in contexts that call get_section_id()
	* on any common-descended object.
	* @return string|int|null  Always null
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
	*
	* Dispatch logic:
	* 1. Derive the expected controller path for the concrete class (e.g.
	*    core/area_resource/area_resource_json.php).
	* 2. If that file exists, delegate to parent::get_json() (common's standard flow).
	* 3. Otherwise, build $options manually and include area_common_json.php in $this
	*    scope so the generic controller runs with full access to the area instance.
	*
	* Note: $options is explicitly constructed here (not forwarded from $request_options)
	* because the fallback include runs in this scope where $options is expected, mirroring
	* what common::get_json() does before its own include.
	*
	* @param object|null $request_options  Optional flags: get_context, get_data,
	*                                       get_request_config (all bool, same as common)
	* @return object  JSON payload built by the applicable controller
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
	* Walks the ontology tree recursively downward from this area's tipo and collects
	* the tipos of all descendant nodes whose model is 'section'. Sub-areas are
	* transparently traversed so that a compound area (e.g. area_resource, which
	* groups audiovisual, image, document sub-areas) exposes ALL of their sections
	* in one flat list.
	*
	* Model filtering rules:
	* - 'section' nodes are accepted and added to $ar_result.
	* - 'area' nodes are descended into but not themselves added.
	* - 'login', 'tools', 'section_list', 'filter', 'section_tool' are skipped
	*   entirely (not descended and not added).
	* - Any other model (components, portals, etc.) is silently skipped.
	*
	* A visited-set ($ar_visited) guards against cycles that might exist in a
	* malformed ontology, preventing infinite recursion.
	*
	* Note: this method does NOT filter out untabled/virtual sections — callers
	* such as count_section_records() must check matrix_table existence themselves.
	*
	* @return array<string>  Flat, deduplicated list of section tipos in ontology order
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
	* Returns the total number of live records for a given section tipo.
	*
	* Uses the SQO/search layer (search_query_object + search::count()) so that
	* the count respects project filters, access control, and any search extensions
	* wired at the search level — the same behaviour as `dd_core_api::count`.
	*
	* Early-return conditions (both return null):
	* - The current user has no read permission (< 1) for the section.
	* - The section tipo has no backing matrix_table (virtual/pseudo sections
	*   that exist in the ontology but store no rows in PostgreSQL).
	*
	* @param string $section_tipo  Ontology tipo of the section to count
	* @return int|null             Record count, or null when not countable/accessible
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
	* Metric extensibility: each name N in $ar_metric_names must correspond to a
	* method `metric_<N>(string $section_tipo) : mixed` on this class or a subclass.
	* Missing methods are silently skipped. To add a new per-section metric, define
	* `metric_mymetric()` and pass 'mymetric' in the array (or configure it in the
	* area ontology properties as `{ "dashboard": { "metrics": ["total","mymetric"] } }`).
	*
	* The activity_30d area-level metric is always computed and appended to the
	* dashboard (not driven by $ar_metric_names). The per-section recent_7d badge
	* is then derived from the last 7 days of that payload without a second SQL query.
	*
	* Returned structure:
	* {
	*   "area_tipo"    : "dd14",
	*   "area_label"   : "Resources",
	*   "generated_at" : 1731768000,
	*   "metrics"      : ["total"],
	*   "sections"     : [
	*     {
	*       "section_tipo" : "rsc167",
	*       "label"        : "Audiovisual",
	*       "model"        : "section",
	*       "color"        : "#3b82f6",
	*       "total"        : 4321,
	*       "recent_7d"    : 12
	*     },
	*     ...
	*   ],
	*   "activity_30d" : { "date_from": "...", "date_to": "...", "days": [...], ... }
	* }
	*
	* @param array<string>|null $ar_metric_names  Named metrics to run per section;
	*                                              defaults to ['total'].
	* @return object  Fully populated dashboard payload
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

		// Per-section `recent_7d` badge: count of activity events in the last 7 days,
		// derived from the already-computed activity_30d payload (no extra SQL).
		// Attaches `recent_7d` to each section item for client-side rendering.
		if (!empty($dashboard->activity_30d) && !empty($dashboard->activity_30d->days)) {

			$ar_days			= $dashboard->activity_30d->days;
			$recent_window_size	= 7;
			$recent_days		= array_slice($ar_days, -$recent_window_size);

			// Accumulate per-section event counts across the last 7 days
			$recent_by_section = [];
			foreach ($recent_days as $day) {
				$by_section = (array)($day->by_section ?? []);
				foreach ($by_section as $tipo => $count) {
					$recent_by_section[$tipo] = ($recent_by_section[$tipo] ?? 0) + (int)$count;
				}
			}

			// Attach badge count; 0 when the section had no activity in the window
			foreach ($dashboard->sections as $section_item) {
				$section_item->recent_7d = $recent_by_section[$section_item->section_tipo] ?? 0;
			}
		}

		return $dashboard;
	}//end get_dashboard_data



	/**
	* METRIC_TOTAL
	* Built-in per-section metric: total live record count.
	* Delegates to count_section_records(), which handles permissions and
	* virtual-section guards. Returns null when the count is not available so
	* that the client can distinguish "zero records" from "not countable/accessible".
	*
	* Naming convention: all per-section metric methods must follow the signature
	* `metric_<name>(string $section_tipo) : mixed` so that get_dashboard_data()
	* can discover and invoke them by name via method_exists() + dynamic dispatch.
	*
	* @param string $section_tipo  Ontology tipo of the target section
	* @return int|null             Record count, or null when unavailable
	*/
	protected function metric_total(string $section_tipo) : ?int {

		return $this->count_section_records($section_tipo);
	}//end metric_total



	/**
	* METRIC_ACTIVITY_30D
	* Area-level metric: user activity aggregated by day and section over a rolling
	* window (default: last 30 days).
	*
	* Implementation notes:
	* - Queries the matrix_activity PostgreSQL table (section tipo dd542) DIRECTLY
	*   with parameterised SQL using JSONB operators, rather than instantiating
	*   individual component objects per row.  This is intentional for performance:
	*   activity tables can hold hundreds of thousands of rows.
	* - The WHO field (dd543, component_portal) stores the user as a relation JSONB
	*   column; the WHERE field (dd546, component_input_text) stores the target
	*   section tipo as a string JSONB column.  The component tipo keys are read
	*   from logger_backend_activity::$_COMPONENT_WHO / $_COMPONENT_WHERE so they
	*   stay in sync if those ever change.
	* - Only rows whose WHERE value matches one of this area's child section tipos
	*   are counted; global system activity on other areas is excluded.
	* - Empty days are filled in the output for continuous chart rendering on the
	*   client; the chart must not infer a missing day as zero.
	* - The initial dashboard load always fetches exactly 30 days. Larger ranges
	*   (3 m / 6 m / 1 y) are retrieved on-demand via the `get_activity_metric` API
	*   action to avoid over-fetching on every page load.
	*
	* Legacy compat: older activity records stored the WHERE value as a JSON-encoded
	* array string (e.g. "[\"rsc167\"]"). The inner loop decodes these on the fly.
	*
	* Return structure:
	* {
	*   "date_from"       : "2025-04-17",
	*   "date_to"         : "2025-05-17",
	*   "days"            : [
	*     { "date": "2025-04-17", "by_section": {"rsc167": 4}, "by_user": {"1": 4} },
	*     ...
	*   ],
	*   "users"           : [ {"id": "1", "label": "Admin"}, ... ],
	*   "available_ranges": [
	*     {"key": "1m", "label": "1 month",  "days": 30},
	*     {"key": "3m", "label": "3 months", "days": 90},
	*     {"key": "6m", "label": "6 months", "days": 180},
	*     {"key": "1y", "label": "1 year",   "days": 365}
	*   ]
	* }
	*
	* @param int $range_days  Number of past days to include (default 30)
	* @return object|null     Aggregated activity payload, or null on error / no sections
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
		// dd546 = component_input_text storing the WHERE (target section tipo)
		// dd543 = component_portal storing the WHO (logged-in user)
		$where_tipo	= logger_backend_activity::$_COMPONENT_WHERE['tipo']; // dd546
		$who_tipo	= logger_backend_activity::$_COMPONENT_WHO['tipo'];	// dd543

		// Direct SQL with JSONB operators — avoids instantiating components per row.
		// 'relation' and 'string' are JSONB columns in matrix_activity keyed by
		// component tipo.  ->0 selects the first element of the JSONB array;
		// ->> returns the value as text.
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
			// Older logger versions serialised the value inside a JSON array string
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
		// login::logged_user_username() reads from the login section; a fallback
		// label "User #N" ensures the chart is still usable if the user record
		// has been deleted or is inaccessible.
		$users = [];
		foreach (array_keys($user_ids) as $uid) {
			$label = login::logged_user_username((int)$uid);
			$users[] = (object)[
				'id'	=> $uid,
				'label'	=> !empty($label) ? $label : ('User #' . $uid)
			];
		}

		// Fill all days (including empty ones) for continuous chart rendering.
		// Gaps would misalign chart x-axis labels; every calendar day in the
		// range must appear even when activity count is zero.
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
	* Static entry point for the API action `get_activity_metric`.
	* Resolves the concrete area subclass from the ontology, instantiates it, and
	* delegates to metric_activity_30d() with the requested date range.
	*
	* This method exists so that the API handler (dd_core_api or equivalent) can
	* call a single static method without needing to know the concrete area subclass.
	* Lazy instantiation via get_instance() ensures that the correct subclass
	* (e.g. area_resource) is used, which may override metric_activity_30d() in the
	* future.
	*
	* The method_exists() guard is a safety net: currently all area_* subclasses
	* inherit metric_activity_30d() from this class, but a subclass could override
	* it to remove the method (unlikely).
	*
	* @param string $area_tipo  Ontology tipo of the area to query (e.g. 'dd14')
	* @param int $range_days    Number of past days to cover (default 30)
	* @return object|null       Activity payload from metric_activity_30d(), or null
	*                           when area_tipo is empty, model is unresolvable, or the
	*                           metric method is not available on the instance
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
	* Returns a deterministic #RRGGBB hex color for a section tipo, derived from
	* a CRC32 hash of the tipo string.
	*
	* The algorithm:
	* 1. crc32($tipo) produces a signed 32-bit integer; % 360 maps it to a hue
	*    in [0, 359].  The modulo result can be negative on some platforms when
	*    crc32 returns a negative value, but fmod() and the HSL formula still
	*    produce a valid color in that case (PHP's % preserves sign).
	* 2. Saturation is fixed at 65 % and lightness at 52 % to keep all generated
	*    colors vivid and readable on both light and dark backgrounds.
	* 3. Standard HSL-to-RGB conversion: chroma C, intermediate X, achromatic
	*    offset m.  The six if/elseif branches correspond to the six sextants of
	*    the color wheel.
	*
	* The color is stable: the same tipo always produces the same color across
	* PHP versions (crc32 is deterministic) and across reloads / sessions.
	*
	* @param string $tipo  Section ontology tipo (e.g. 'rsc167')
	* @return string       Hex color in lowercase #rrggbb format (e.g. '#3b82f6')
	*/
	public static function get_dashboard_color(string $tipo) : string {

		// stable hue 0-359 from tipo
		$hash	= crc32($tipo);
		// crc32() can return a negative int on 32-bit PHP; abs() keeps the hue in 0-359.
		$hue	= abs($hash % 360);
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
