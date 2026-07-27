<?php declare(strict_types=1);
/**
* CLASS COMPONENT_INFO
* Read-only, display-only component that aggregates one or more widget outputs
* into a single component slot in a Dédalo section.
*
* Unlike ordinary data components, component_info never stores user-entered values
* in the database matrix tables. Its "data" is computed on-demand by delegating
* to a set of widgets whose definitions are stored in the component's ontology
* properties under the 'widgets' key. Because no row-level data is persisted,
* `use_db_data` is false by default.
*
* Widget lifecycle (per request):
*  1. get_widgets()        — reads the 'widgets' array from ontology properties.
*  2. For each widget entry, widget_common::get_instance() instantiates the
*     concrete widget class identified by widget_obj->widget_name.
*  3. The widget receives section_tipo, section_id, lang, mode, path, and ipo
*     (Input-Process-Output configuration object) via a stdClass $widget_options
*     bag passed to the factory.
*  4. Async widgets (those whose is_async() returns true) are skipped; they
*     fetch their own data client-side via the API.
*  5. The widget's get_data() (or get_data_parsed() / get_data_list()) result
*     is merged into the component-level result using the spread operator.
*
* IPO (Input-Process-Output):
*  Each widget carries an 'ipo' array that declares its expected inputs, the
*  computation steps, and the output map. Each output entry has at minimum an
*  'id' string key that names the computed scalar (e.g. 'media_weight'). The
*  output map is used by get_grid_value() and get_export_value() to generate
*  one grid column / one export atom per declared output, keyed by that id.
*
* Widget options shape (stdClass):
*  {
*    section_tipo : string,   // e.g. 'mdcat1'
*    section_id   : int|string,
*    lang         : string,   // DEDALO_DATA_LANG
*    widget_name  : string,   // PHP class name e.g. 'get_archive_weights'
*    path         : mixed,    // ontology path passed through from properties
*    ipo          : array,    // Input-Process-Output config
*    mode         : string    // 'edit' | 'list' | …
*  }
*
* Data shape returned by get_data() / get_data_parsed():
*  A flat array of stdClass objects, each produced by a widget. A widget
*  typically emits objects with at least 'widget', 'id', and 'value' keys:
*  [
*    { "widget": "get_archive_weights", "key": 0, "id": "media_weight",  "value": 4.47 },
*    { "widget": "get_archive_weights", "key": 0, "id": "max_weight",    "value": 4.47 },
*    …
*  ]
*  (The exact shape is widget-specific; the 'id' field is the stable contract
*  used by get_grid_value() and get_export_value() to match output columns.)
*
* Extends component_common for standard component lifecycle (permissions, context,
* JSON API controller, label resolution, etc.). Does NOT use the search trait
* because the component holds no matrix-stored data.
*
* @package Dédalo
* @subpackage Core
*/
class component_info extends component_common {



	/**
	* CLASS VARS
	*/
		/**
		 * Language code used when passing lang context to instantiated widgets.
		 * Typically set by the caller before rendering to select the language
		 * in which widget labels or resolved terms are displayed.
		 * Example values: 'lg-spa', 'lg-cat', 'lg-eng'.
		 * @var ?string $widget_lang
		 */
		public ?string $widget_lang = null;

		/**
		 * Display mode forwarded to each instantiated widget.
		 * Mirrors the component's own mode ('edit', 'list', etc.) so that
		 * individual widgets can adjust their output accordingly.
		 * When null the widget falls back to its own default.
		 * @var ?string $widget_mode
		 */
		public ?string $widget_mode = null;

		/**
		 * Whether this component should read its value from database matrix rows.
		 * Always false for component_info: data is computed by widgets, not stored.
		 * The JSON controller (component_info_json.php) branches on this flag to
		 * decide between get_db_data() (parent matrix read) and get_data() / get_list_value().
		 * @var bool $use_db_data
		 */
		public bool $use_db_data = false;



	/**
	* GET_DATA
	* Computes and returns the aggregated output of all configured widgets for
	* the current section record. On subsequent calls within the same request,
	* the memoised $data_resolved value is returned directly.
	*
	* Each widget is instantiated via widget_common::get_instance(). Async widgets
	* (those that declare is_async() === true) are excluded because they deliver
	* their data independently to the client via a dedicated API call.
	*
	* The result is the ordered union of every non-async widget's get_data() array,
	* merged with the PHP spread operator so all widget items appear in a single
	* flat array (no sub-keys per widget).
	*
	* The computed result is stored in $this->data_resolved to avoid redundant
	* widget instantiation and computation within a single request.
	* @return array|null - Flat array of widget output objects, or null if no
	*                      widgets are configured / all widgets return empty data.
	*/
	public function get_data() : ?array {

		// data_resolved. Already resolved case
			if(isset($this->data_resolved)) {
				return $this->data_resolved;
			}

		// widgets check
			$widgets = $this->get_widgets();
			if (empty($widgets) || !is_array($widgets)) {
				debug_log(__METHOD__
					." Empty defined widgets for ".get_called_class()." : ". PHP_EOL
					.' label: ' .$this->label . PHP_EOL
					.' tipo: ' .$this->tipo . PHP_EOL
					.' widgets:' . to_string($widgets)
					, logger::ERROR
				);

				return null;
			}

		// the component info data will be the all widgets data
			$data = [];

		// each widget will be created and compute its own data
			foreach ($widgets as $widget_obj) {

				$widget_options = new stdClass();
					$widget_options->section_tipo		= $this->get_section_tipo();
					$widget_options->section_id			= $this->get_section_id();
					$widget_options->lang				= DEDALO_DATA_LANG;
					// $widget_options->component_info	= $this;
					$widget_options->widget_name		= $widget_obj->widget_name;
					$widget_options->path				= $widget_obj->path;
					$widget_options->ipo				= $widget_obj->ipo;
					$widget_options->mode				= $this->get_mode();

				// instance the current widget
					$widget = widget_common::get_instance($widget_options);

				// skip async widgets (they load their data via API on the client)
					if (method_exists($widget, 'is_async') && $widget->is_async()) {
						continue;
					}

				// Widget data
					$widget_value = $widget->get_data();
					if (!empty($widget_value)) {
						$data = [...$data, ...$widget_value];
					}
			}//end foreach ($widgets as $widget)

		// set the component info data with the result
			$this->data_resolved = $data;


		return $data;
	}//end get_data



	/**
	* GET_DATA_PARSED
	* Returns the aggregated "parsed" output of all configured widgets.
	* Parallel to get_data() but calls each widget's get_data_parsed() instead,
	* allowing widgets to apply post-processing (e.g. sum_dates in mdcat
	* converts raw timestamps into human-readable aggregated strings).
	*
	* Unlike get_data(), the result is NOT cached in $data_resolved, so calling
	* both get_data() and get_data_parsed() within a request will instantiate
	* the widgets twice.
	*
	* Async widgets are skipped for the same reason as in get_data().
	* @return array|null - Flat array of parsed widget output objects, or null
	*                      if no widgets are configured / all outputs are empty.
	*/
	public function get_data_parsed() : ?array {

		// widgets check
			$widgets = $this->get_widgets();
			if (empty($widgets) || !is_array($widgets)) {
				debug_log(__METHOD__
					." Empty defined widgets for ".get_called_class()." : ". PHP_EOL
					.' label: ' .$this->label . PHP_EOL
					.' tipo: ' .$this->tipo . PHP_EOL
					.' widgets:' . to_string($widgets)
					, logger::ERROR
				);

				return null;
			}

		// the component info data will be the all widgets data
			$data_parsed = [];

		// each widget will be created and compute its own data
			foreach ($widgets as $widget_obj) {

				$widget_options = new stdClass();
					$widget_options->section_tipo		= $this->get_section_tipo();
					$widget_options->section_id			= $this->get_section_id();
					$widget_options->lang				= DEDALO_DATA_LANG;
					// $widget_options->component_info	= $this;
					$widget_options->widget_name		= $widget_obj->widget_name;
					$widget_options->path				= $widget_obj->path;
					$widget_options->ipo				= $widget_obj->ipo;
					$widget_options->mode				= $this->get_mode();

				// instance the current widget
					$widget = widget_common::get_instance($widget_options);

				// skip async widgets (they load their data via API on the client)
					if (method_exists($widget, 'is_async') && $widget->is_async()) {
						continue;
					}

				// Widget data
					$widget_value = $widget->get_data_parsed();
					if (!empty($widget_value)) {
						$data_parsed = [...$data_parsed, ...$widget_value];
					}
			}//end foreach ($widgets as $widget)


		return $data_parsed;
	}//end get_data_parsed



	/**
	* GET_DB_DATA
	* Attempts to return data from the parent (matrix) storage first; falls back
	* to the widget-computed get_data() when the parent returns empty.
	*
	* This method exists to support the (rare) case where component_info has been
	* configured with use_db_data = true and something was previously persisted to
	* the misc column of the matrix. In the normal (use_db_data = false) workflow
	* this path is not taken — the JSON controller selects get_data() directly.
	* @return mixed - Parent-stored data when present; widget-computed data otherwise.
	*/
	public function get_db_data() {

		$data = parent::get_data();

		if(empty($data)){
			$data = $this->get_data();
		}


		return $data;
	}//end get_db_data



	/**
	* GET_WIDGETS
	* Resolve list of widgets for current component_info
	* They are defined in properties
	*
	* Reads the 'widgets' array from the ontology properties object of this
	* component instance. Each entry in the array is an object describing one
	* widget:
	*  {
	*    widget_name : string,  // PHP class name to instantiate
	*    path        : mixed,   // optional ontology path hint for the widget
	*    ipo         : array    // Input-Process-Output configuration
	*  }
	*
	* Returns null (and logs an ERROR) when the property is absent or the
	* component has not been set up in the ontology with any widget definitions.
	* @return array|null $widgets - Array of widget configuration objects, or null.
	*/
	public function get_widgets() : ?array {

		$properties = $this->get_properties();

		// get the widgets defined in the ontology
		$widgets = $properties->widgets ?? null;
		if (empty($widgets) || !is_array($widgets)) {
			debug_log(__METHOD__
				." Empty defined widgets for ".get_called_class()." : $this->label [$this->tipo] ". PHP_EOL
				.' widgets:' . json_encode($widgets, JSON_PRETTY_PRINT)
				, logger::ERROR
			);

			return null;
		}


		return $widgets;
	}//end get_widgets



	/**
	* GET_DIFFUSION_DATO
	* (!) This entire method body is commented out. It was the previous diffusion
	* extraction path for component_info, superseded by get_diffusion_value().
	* Kept for reference; the commented sample shows the expected dato shape and
	* the options contract used by diffusion_sql::resolve_component_value callers.
	*
	* Original contract (when active):
	* @param object $options
	* Sample:
		* {
		*	"widget_name": [
		*		"get_archive_weights"
		*	],
		*	"select": [
		*		"media_diameter"
		*	],
		*	"value_format": "first_value",
		*	"lang": "lg-spa"
		* }
	* @see example of use in numisdata786
	* @return mixed $diffusion_dato
	*/
	// public function get_diffusion_dato( object $options ) : mixed {

	// 	// options
	// 		$widget_name	= $options->widget_name; // array
	// 		$select			= $options->select ?? []; // array
	// 		$value_format	= $options->value_format ?? null; // string|null

	// 	// widgets
	// 		$widgets = $this->get_widgets();
	// 		if (empty($widgets)) {
	// 			debug_log(__METHOD__
	// 				." Error. widgets are not defined for this component - mode: $this->mode - [get_diffusion_dato]". PHP_EOL
	// 				.' options:' . json_encode($options, JSON_PRETTY_PRINT)
	// 				, logger::ERROR
	// 			);
	// 			return null;
	// 		}

	// 	// dato
	// 		$dato = $this->get_dato();
	// 		// sample value: →
	// 			// [
	// 			//     {
	// 			//         "widget": "get_archive_weights",
	// 			//         "key": 0,
	// 			//         "id": "media_weight",
	// 			//         "value": 4.47
	// 			//     },
	// 			//     {
	// 			//         "widget": "get_archive_weights",
	// 			//         "key": 0,
	// 			//         "id": "max_weight",
	// 			//         "value": 4.47
	// 			//     },
	// 			//     {
	// 			//         "widget": "get_archive_weights",
	// 			//         "key": 0,
	// 			//         "id": "min_weight",
	// 			//         "value": 4.47
	// 			//     },
	// 			//     {
	// 			//         "widget": "get_archive_weights",
	// 			//         "key": 0,
	// 			//         "id": "total_elements_weights",
	// 			//         "value": 1
	// 			//     },
	// 			//     {
	// 			//         "widget": "get_archive_weights",
	// 			//         "key": 0,
	// 			//         "id": "media_diameter",
	// 			//         "value": 15
	// 			//     },
	// 			//     {
	// 			//         "widget": "get_archive_weights",
	// 			//         "key": 0,
	// 			//         "id": "max_diameter",
	// 			//         "value": 15
	// 			//     },
	// 			//     {
	// 			//         "widget": "get_archive_weights",
	// 			//         "key": 0,
	// 			//         "id": "min_diameter",
	// 			//         "value": 15
	// 			//     },
	// 			//     {
	// 			//         "widget": "get_archive_weights",
	// 			//         "key": 0,
	// 			//         "id": "total_elements_diameter",
	// 			//         "value": 1
	// 			//     }
	// 			// ]

	// 	// diffusion_dato
	// 		$diffusion_dato = [];
	// 		foreach ($widget_name as $key => $current_widget_name) {
	// 			// current_widget_name like 'get_archive_weights'

	// 			// select. Like 'media_diameter'
	// 			$current_select = $select[$key] ?? null;

	// 			// find current widget selected values
	// 			$ar_values = array_filter($dato, function($el) use($current_widget_name, $current_select){
	// 				return $el->widget===$current_widget_name // like 'get_archive_weights'
	// 					&& $el->id===$current_select; // like 'media_diameter'
	// 			});
	// 			foreach ($ar_values as $item) {
	// 				$diffusion_dato[] = $item->value;
	// 			}
	// 		}

	// 	// value format
	// 		switch ($value_format) {
	// 			case 'first_value':
	// 				$diffusion_dato = $diffusion_dato[0] ?? null;
	// 				break;
	// 			default:
	// 				// Noting to do
	// 				break;
	// 		}


	// 	return $diffusion_dato;
	// }//end get_diffusion_dato



	/**
	* GET_DATA_LIST
	* Get and fix the ontology defined widgets data_list
	*
	* Collects the 'data_list' (auxiliary list of selectable items) from every
	* configured widget that implements a get_data_list() method. Widgets that do
	* not implement get_data_list() are silently skipped (method_exists guard).
	*
	* Note: unlike get_data(), this method does NOT pass the 'mode' key to the
	* widget options stdClass. If a widget requires mode to build its data_list,
	* it will receive null for that property.
	*
	* Returns null when no widgets are configured or all widgets return null from
	* get_data_list().
	* @return array|null $data_list - Flat merged array of widget data_list items,
	*                                 or null if none exist.
	*/
	public function get_data_list() : ?array {

		// get the widgets defined in the ontology
		$widgets = $this->get_widgets();
		if (empty($widgets) || !is_array($widgets)) {
			debug_log(__METHOD__
				." Empty or invalid defined widgets for ".get_called_class()." : $this->label [$this->tipo]" . PHP_EOL
				.' widgets: ' . to_string($widgets)
				, logger::ERROR
			);

			return null;
		}

		// the component info data will be the all widgets data
		$data_list = [];

		// every widget will be created and calculate your own data
		foreach ($widgets as $widget_obj) {

			$widget_options = new stdClass();
				$widget_options->section_tipo	= $this->get_section_tipo();
				$widget_options->section_id		= $this->get_section_id();
				$widget_options->lang			= DEDALO_DATA_LANG;
				$widget_options->widget_name	= $widget_obj->widget_name;
				$widget_options->path			= $widget_obj->path;
				$widget_options->ipo			= $widget_obj->ipo;

			// instance the current widget
			$widget = widget_common::get_instance($widget_options);

			// Widget data
			$widget_data_list = method_exists($widget, 'get_data_list')
				? $widget->get_data_list()
				: null;

			if($widget_data_list!==null){
				$data_list = [...$data_list, ...$widget_data_list];
			}
		}//end foreach ($widgets as $widget_obj)


		return $data_list;
	}//end get_data_list



	/**
	* GET_TOOLS
	* Overrides common method to prevent loading of default tools
	* This component don't have tools
	*
	* component_info has no editable data and therefore offers no toolbar actions
	* to the user. Returning an empty array suppresses the standard tools bar in
	* the edit UI and avoids unnecessary tool registration overhead.
	* @return array - Always an empty array.
	*/
	public function get_tools() : array {

		return [];
	}//end get_tools



	/**
	* GET_SORTABLE
	* Reports that this component cannot be used as a sort column in list views.
	*
	* Overrides the parent default (true) because component_info data is computed
	* dynamically at read time — there is no indexed database column to ORDER BY,
	* making sort support meaningless.
	* @return bool - Always false.
	*/
	public function get_sortable() : bool {

		return false;
	}//end get_sortable



	/**
	* GET_LIST_VALUE
	* Unified value list output
	* By default, list value is equivalent to data. Override in other cases.
	* Note that empty array or string are returned as null
	*
	* For component_info, the list representation is the same flat widget output
	* array produced by get_data(). Returning null for empty results keeps the
	* JSON API response consistent with other component types.
	* @return array|null $list_value - Widget output array, or null when empty.
	*/
	public function get_list_value() : ?array {

		$data = $this->get_data();
		if (empty($data)) {
			return null;
		}

		$list_value = $data;

		return $list_value;
	}//end get_list_value



	/**
	* GET_CALCULATION_DATA
	* Obtain the component data for a calculation
	*
	* Returns the raw widget output array augmented with individual scalar values
	* extracted from each item matching the $options->select key (defaults to
	* 'value'). This allows numeric widgets (e.g. sum_weights) to supply their
	* aggregated scalar to an outer calculation component.
	*
	* (!) Known issue: $data is initialised to [] (line 1), immediately overwritten
	* by get_data() (line 2), and then new scalar items are appended to it inside
	* the foreach. Because foreach in PHP iterates a copy of the array at the time
	* the loop starts, new items appended during iteration are NOT visited again,
	* so the loop is safe in practice — but the returned array is a mix of the
	* original widget objects AND the extracted scalars, which may surprise callers.
	*
	* @param object|null $options = null - Optional configuration object.
	*   $options->select (string) — property name to extract from each widget item.
	*   Defaults to 'value'.
	* @return array $data - Widget output items merged with extracted scalar values.
	*/
	public function get_calculation_data( ?object $options=null ) : array {

		$data = [];

		// options
			$select	= $options->select ?? 'value';

		$data = $this->get_data();
		if (!empty($data)) {
			foreach ($data as $current_data) {
				if (isset($current_data->{$select})){
					$data[] = $current_data->{$select};
				}
			}
		}

		return $data;
	}//end get_calculation_data



	/**
	* GET_GRID_VALUE
	* Get the data parsed of the widgets.
	* Component info only process breakdown situation because the widget could process multiple data output!
	* Widget use the ipo (input, process, output) object to define how process the data
	* grid value use the `output` definition to create columns for every value
	* The column will named as the output id as label (TODO, add tipo for the label of the column)
	* By default the widget will return his data, but is possible to overwrite it with get_data_parsed() in the widget
	*
	* Implementation notes:
	* - The outer dd_grid_cell_object (returned as $value) has type 'column',
	*   row_count = 1, column_count = N (where N is the total IPO output entries
	*   across all widgets), and its value is the $ar_columns array of per-output
	*   dd_grid_cell_object instances.
	* - Each per-output cell is looked up against get_data_parsed() using array_find()
	*   on the 'id' field, then wrapped as a single-element array for the cell value
	*   contract (the grid expects arrays, not scalars).
	* - Object values are json_encode()d to strings before wrapping so the grid
	*   renderer always receives a scalar or null.
	* - Column ids are built as <section_tipo>_<tipo>_widget_<output_id_with_spaces>.
	*   The str_replace('_', ' ', ...) in the id is intentional (spaces in id).
	* - (!) $ar_cells is declared and initialised but never populated or used.
	*   It is a leftover from an earlier implementation iteration.
	* - (!) $format_columns is extracted from $ddo but never referenced afterwards.
	* @param object|null $ddo = null - DDO configuration object. Recognised keys:
	*   fields_separator, records_separator, format_columns, class_list.
	* @return dd_grid_cell_object $dd_grid_cell_object - Outer wrapper cell containing
	*   one inner cell per widget IPO output entry.
	*/
	public function get_grid_value( ?object $ddo=null ) : dd_grid_cell_object {

		// ddo customs
			$fields_separator	= $ddo?->fields_separator ?? null;
			$records_separator	= $ddo?->records_separator ?? null;
			$format_columns		= $ddo?->format_columns ?? null;
			$class_list			= $ddo?->class_list ?? null;

		// column_obj
			$column_obj = $this->column_obj ?? (object)[
				'id' => $this->section_tipo.'_'.$this->tipo
			];

		// short vars
			$data		= $this->get_data_parsed();// use data parsed to be processed by the widget if needed. see mdcat->sum_dates
			$label		= $this->get_label();
			$properties	= $this->get_properties();
			$widgets 	= $this->get_widgets();

		$ar_cells		= [];
		$ar_columns_obj	= [];
		$ar_columns		= [];
		$column_count	= 0;

		// get the widget to use his IPO definition and use the output map to create the columns
		// every output object will create a column
		foreach ($widgets as $item) {
			foreach ($item->ipo as $current_ipo) {
				// get output
				foreach ($current_ipo->output as $data_map) {

					$column_count++;
					$current_id	= $data_map->id;
					// get the data of the widget to match with the column
					$found = array_find($data ?? [], function($item) use($current_id){
						return isset($item->id) && $item->id===$current_id;
					});
					$value = is_object( $found )
						? $found->value
						: null;

					if( is_object( $value ) ){
						$value= json_encode($value);
					}

					$value = [$value]; // array

					// create the new column obj id getting the previous id and add the new path
					// it will set to the column_obj for the next loop
					// note that id will use to calculate the column label
					// (TODO: add ontology labels into output definition for translation)
					$current_column_obj = new stdClass();
						$current_column_obj->id		= $column_obj->id.'_widget_'. str_replace('_', ' ', $current_id);
						$current_column_obj->group	= $column_obj->id.'_widget_'.$this->tipo;

					$ar_columns_obj[] = $current_column_obj;

					// records_separator
						$records_separator = isset($records_separator)
							? $records_separator
							: (isset($properties->records_separator)
								? $properties->records_separator
								: ' | ');

					// fallback value. Overwrite in translatable components like input_text or text_area
						$fallback_value = $value ?? null;

					// dd_grid_cell_object
						$dd_grid_cell_object = new dd_grid_cell_object();
							// $dd_grid_cell_object->set_id( $column_obj->id.'_'.$current_id );
							$dd_grid_cell_object->set_type('column');
							$dd_grid_cell_object->set_label($current_id);
							$dd_grid_cell_object->set_cell_type('text');
							$dd_grid_cell_object->set_ar_columns_obj( [$current_column_obj] );
							if(isset($class_list)){
								$dd_grid_cell_object->set_class_list($class_list);
							}
							$dd_grid_cell_object->set_records_separator($records_separator);
							$dd_grid_cell_object->set_value($value);
							$dd_grid_cell_object->set_fallback_value($fallback_value);
							$dd_grid_cell_object->set_model(get_called_class());


					// store the columns into the full columns array
					$ar_columns[] = $dd_grid_cell_object;
				}
			}
		}

		// fields_separator
			$fields_separator = isset($fields_separator)
				? $fields_separator
				: (isset($properties->fields_separator)
					? $properties->fields_separator
					: ', ');

		// records_separator
			$records_separator = isset($records_separator)
				? $records_separator
				: (isset($properties->records_separator)
					? $properties->records_separator
					: ' | ');

		// fallback value. Overwrite in translatable components like input_text or text_area
			$fallback_value = $data ?? null;

		// dd_grid_cell_object
			$value = new dd_grid_cell_object();
				$value->set_type('column');
				$value->set_row_count(1);
				$value->set_column_count($column_count);
				$value->set_label($label);
				$value->set_ar_columns_obj( $ar_columns_obj );
				if(isset($class_list)){
					$value->set_class_list($class_list);
				}
				$value->set_fields_separator($fields_separator);
				$value->set_records_separator($records_separator);
				$value->set_value($ar_columns); // array


		return $value;
	}//end get_grid_value



	/**
	* GET_EXPORT_VALUE
	* Atoms based export contract (see component_common::get_export_value).
	* One atom per widget IPO output: the output id travels as the segment
	* sub_id (own column per output, label = output id verbatim).
	* Replaces the legacy '_widget_' string-suffixed column ids.
	*
	* The export path for each output is:
	*   [...$context->path_prefix, $own_segment, $sub_segment]
	* where $sub_segment carries sub_id = $data_map->id.
	*
	* Object and array values are json_encode()d to strings so every atom carries
	* a scalar or null — matching the flat-table export contract.
	*
	* Unlike get_grid_value(), this method uses get_data_parsed() so that widget
	* post-processing (e.g. mdcat sum_dates) is applied before serialisation.
	* @param export_context|null $context = null - Caller-supplied export context.
	*   A default context is created when null.
	* @return export_value - Container with one export_atom per widget output entry.
	*/
	public function get_export_value( ?export_context $context=null ) : export_value {

		$context = $context ?? new export_context();

		// own segment
			$own_segment	= $this->build_export_path_segment($context);
			$base_path		= [...$context->path_prefix, $own_segment];

		// export_value
			$export_value = new export_value([], $this->get_label(), get_called_class());

		// short vars
			$data		= $this->get_data_parsed(); // data parsed to be processed by the widget if needed. see mdcat->sum_dates
			$widgets	= $this->get_widgets();

		// every widget IPO output object creates one atom (one column per output)
			foreach ($widgets as $item) {
				foreach ($item->ipo as $current_ipo) {
					foreach ($current_ipo->output as $data_map) {

						$current_id = $data_map->id;

						// get the data of the widget to match with the column
							$found = array_find($data ?? [], function($item) use($current_id){
								return isset($item->id) && $item->id===$current_id;
							});
							$value = is_object($found)
								? $found->value
								: null;
							if (is_object($value) || is_array($value)) {
								$value = json_encode($value);
							}

						// output sub segment. sub_id discriminates the column
							$sub_segment = new export_path_segment($this->section_tipo, $this->tipo, (object)[
								'sub_id' => $current_id
							]);

						$export_value->add_atom( new export_atom([...$base_path, $sub_segment], $value) );
					}
				}
			}


		return $export_value;
	}//end get_export_value



	/**
	* GET_DIFFUSION_VALUE
	* Calculate current component diffusion value
	*
	* Produces a flat string representation of the component's value for use
	* by the diffusion subsystem (SQL/RDF/XML publishing targets).
	*
	* (!) This method calls $this->get_valor($diffusion_lang), which is a v6-era
	* method that has no definition in the v7 core. If no widget or parent class
	* provides this method, PHP will throw a fatal error at runtime. The call is
	* most likely a copy-paste from v6 component classes and should be reviewed
	* and replaced with get_data() / get_list_value() or a dedicated widget-aware
	* diffusion path.
	*
	* When $option_obj->key_values is provided (array of integer positions), the
	* method splits the string on $option_obj->separator (default ', '), selects
	* only the elements at the specified positions, and rejoins with the same
	* separator. This allows diffusion mappings to cherry-pick individual widget
	* output fields from a concatenated string value.
	*
	* Example diffusion property using key_values selection
	* (see mdcat1181 for a real-world case):
	* {
	*   "process_dato": "diffusion_sql::resolve_component_value",
	*   "process_dato_arguments": {
	*     "component_method": "get_diffusion_value",
	*     "custom_arguments": [
	*       {
	*         "key_values": [0],
	*         "separator": ", "
	*       }
	*     ]
	*   }
	* }
	*
	* @param string|null $lang = null - Target diffusion language code.
	*   Defaults to DEDALO_DATA_LANG when null.
	* @param object|null $option_obj = null - Optional post-processing options.
	*   Recognised key: key_values (int[]), separator (string).
	* @return string|null $diffusion_value - Serialised value string, or null when empty.
	*
	*/
	/**
	* GET_DIFFUSION_DATA
	* Emits the widget output objects ({widget, id, value}) verbatim as the diffusion
	* value so parser_info::widget can select a specific stat by widget_name + id
	* (e.g. get_archive_weights / media_diameter). The default component_common path
	* flattens each item to its scalar value, losing the widget/id needed to select.
	* Stats are language-independent → emitted as NOLAN (the lang expansion fills all langs).
	* @param object $ddo
	* @param ?string $diffusion_element_tipo
	* @return array
	*/
	public function get_diffusion_data( object $ddo, ?string $diffusion_element_tipo=null ) : array {

		$data = $this->get_data(); // [{widget, key, id, value}, ...]
		if (empty($data)) {
			return [];
		}

		$result = [];
		foreach ($data as $item) {
			$ddo_obj = new diffusion_data_object();
			$ddo_obj->set_tipo($this->tipo);
			$ddo_obj->set_lang(DEDALO_DATA_NOLAN);
			$ddo_obj->set_value($item); // full {widget, id, value} object
			$result[] = $ddo_obj;
		}

		return $result;
	}//end get_diffusion_data



	public function get_diffusion_value( ?string $lang=null, ?object $option_obj=null ) : ?string {

		// Default behavior is get value
			$diffusion_lang		= $lang ?? DEDALO_DATA_LANG;
			$diffusion_value	= $this->get_valor(
				$diffusion_lang
			);

		// null empty values
			if (empty($diffusion_value)) {
				return null;
			}

		// strip_tags all values (remove untranslated mark elements)
			$diffusion_value = preg_replace("/<\/?mark>/", "", to_string($diffusion_value));

		// options
			if (is_object($option_obj)) {
				switch (true) {

					// key values selection
					// Splits and select any slices from value
					// use : @see mdcat1181 for a sample like:
					// {
					//   "process_dato": "diffusion_sql::resolve_component_value",
					//   "process_dato_arguments": {
					//     "component_method": "get_diffusion_value",
					//     "custom_arguments": [
					//       {
					//         "key_values": [0],
					//         "separator": ", "
					//       }
					//     ]
					//   }
					// }
					case isset($option_obj->key_values) && is_array($option_obj->key_values):

						$separator	= $option_obj->separator ?? ', ';
						$beats		= explode($separator, $diffusion_value);

						$ar_selection = [];
						foreach ($beats as $key => $value) {
							if (in_array($key, $option_obj->key_values)) {
								$ar_selection[] = $value;
							}
						}
						// overwrite value
						$diffusion_value = implode($separator, $ar_selection);
						break;

					default:
						// nothing to do
						break;
				}
			}


		return $diffusion_value;
	}//end get_diffusion_value



}//end class component_info
