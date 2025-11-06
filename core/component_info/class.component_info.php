<?php declare(strict_types=1);
/**
* CLASS COMPONENT_INFO
* Manages specific component info logic
* Common component properties and methods are inherited from the component_common class
* that are inherited from the common class.
*/
class component_info extends component_common {



	/**
	* properties
	* @var
	*/
	public $widget_lang;
	public $widget_mode;
	public $use_db_data = false;
	// data_column_name. DB column where to get the data.
	protected $data_column_name = 'misc';

	// Property to enable or disable the get and set data in different languages
	protected $supports_translation = false;

	/**
	* GET_DATO
	* @return array|null $dato
	*/
	public function get_dato() {

		// dato_resolved. Already resolved case
			if(isset($this->dato_resolved)) {
				return $this->dato_resolved;
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

		// the component info dato will be the all widgets data
			$dato = [];

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

				// Widget data
					$widget_value = $widget->get_dato();
					if (!empty($widget_value)) {
						$dato = array_merge($dato, $widget_value);
					}
			}//end foreach ($widgets as $widget)

		// set the component info dato with the result
			$this->dato				= $dato;
			$this->dato_resolved	= $dato;


		return $dato;
	}//end get_dato



	/**
	* GET_DATO_PARSED
	* @return array|null $dato_parsed
	*/
	public function get_dato_parsed() : ?array {

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

		// the component info dato will be the all widgets data
			$dato_parsed = [];

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

				// Widget data
					$widget_value = $widget->get_dato_parsed();
					if (!empty($widget_value)) {
						$dato_parsed = array_merge($dato_parsed, $widget_value);
					}
			}//end foreach ($widgets as $widget)


		return $dato_parsed;
	}//end get_dato_parsed



	/**
	* GET_DATO_FULL
	* @return object|null $dato_full
	* 	sample: [{"widget":"get_archive_weights","key":0,"id":"media_weight","value":2}]
	*/
	public function get_dato_full() {

		$dato_full = $this->get_dato();


		return $dato_full;
	}//end get_dato_full



	/**
	* GET_DB_DATA
	* @return mixed $data
	*/
	public function get_db_data() {

		$data = parent::get_dato();

		if(empty($data)){
			$data = $this->get_dato();
		}


		return $data;
	}//end get_db_data



	/**
	* GET_WIDGETS
	* Resolve list of widgets for current component_info
	* They are defined in properties
	* @return array|null $widgets
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
	* GET_VALOR
	* @param string $widget_lang = DEDALO_DATA_LANG
	* @return string $valor
	*/
	public function get_valor(string $widget_lang=DEDALO_DATA_LANG) : string {

		$this->widget_lang = $widget_lang;

		$valor = $this->get_value();
		$valor = !empty($valor)
			? strip_tags($valor)
			: to_string($valor);


		return $valor;
	}//end get_valor



	/**
	* GET_DIFFUSION_VALUE
	* Calculate current component diffusion value
	* @param string|null $lang = null
	* @param object|null $option_obj = null
	* @return string|null $diffusion_value
	*
	* @see class.diffusion_mysql.php
	*/
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



	/**
	* GET_VALOR_EXPORT
	* Return component value sent to export data
	* @return string $valor
	*/
	public function get_valor_export($valor=null, $lang=DEDALO_DATA_LANG, $quotes=null, $add_id=null) {

		$this->widget_lang = $lang;
		$this->widget_mode = 'export';

		$valor = $this->get_value();


		return to_string($valor);
	}//end get_valor_export



	/**
	* GET_DIFFUSION_DATO
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
	public function get_diffusion_dato( object $options ) : mixed {

		// options
			$widget_name	= $options->widget_name; // array
			$select			= $options->select ?? []; // array
			$value_format	= $options->value_format ?? null; // string|null

		// widgets
			$widgets = $this->get_widgets();
			if (empty($widgets)) {
				debug_log(__METHOD__
					." Error. widgets are not defined for this component - mode: $this->mode - [get_diffusion_dato]". PHP_EOL
					.' options:' . json_encode($options, JSON_PRETTY_PRINT)
					, logger::ERROR
				);
				return null;
			}

		// dato
			$dato = $this->get_dato();
			// sample value: →
				// [
				//     {
				//         "widget": "get_archive_weights",
				//         "key": 0,
				//         "id": "media_weight",
				//         "value": 4.47
				//     },
				//     {
				//         "widget": "get_archive_weights",
				//         "key": 0,
				//         "id": "max_weight",
				//         "value": 4.47
				//     },
				//     {
				//         "widget": "get_archive_weights",
				//         "key": 0,
				//         "id": "min_weight",
				//         "value": 4.47
				//     },
				//     {
				//         "widget": "get_archive_weights",
				//         "key": 0,
				//         "id": "total_elements_weights",
				//         "value": 1
				//     },
				//     {
				//         "widget": "get_archive_weights",
				//         "key": 0,
				//         "id": "media_diameter",
				//         "value": 15
				//     },
				//     {
				//         "widget": "get_archive_weights",
				//         "key": 0,
				//         "id": "max_diameter",
				//         "value": 15
				//     },
				//     {
				//         "widget": "get_archive_weights",
				//         "key": 0,
				//         "id": "min_diameter",
				//         "value": 15
				//     },
				//     {
				//         "widget": "get_archive_weights",
				//         "key": 0,
				//         "id": "total_elements_diameter",
				//         "value": 1
				//     }
				// ]

		// diffusion_dato
			$diffusion_dato = [];
			foreach ($widget_name as $key => $current_widget_name) {
				// current_widget_name like 'get_archive_weights'

				// select. Like 'media_diameter'
				$current_select = $select[$key] ?? null;

				// find current widget selected values
				$ar_values = array_filter($dato, function($el) use($current_widget_name, $current_select){
					return $el->widget===$current_widget_name // like 'get_archive_weights'
						&& $el->id===$current_select; // like 'media_diameter'
				});
				foreach ($ar_values as $item) {
					$diffusion_dato[] = $item->value;
				}
			}

		// value format
			switch ($value_format) {
				case 'first_value':
					$diffusion_dato = $diffusion_dato[0] ?? null;
					break;
				default:
					// Noting to do
					break;
			}


		return $diffusion_dato;
	}//end get_diffusion_dato



	/**
	* GET_DATA_LIST
	* Get and fix the ontology defined widgets data_list
	* @return array|null $data_list
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

		// the component info dato will be the all widgets data
		$data_list = [];

		// every widget will be created and calculate your own data
		foreach ($widgets as $widget_obj) {

			$widget_options = new stdClass();
				$widget_options->section_tipo		= $this->get_section_tipo();
				$widget_options->section_id			= $this->get_section_id();
				$widget_options->lang				= DEDALO_DATA_LANG;
				// $widget_options->component_info	= $this;
				$widget_options->widget_name		= $widget_obj->widget_name;
				$widget_options->path				= $widget_obj->path;
				$widget_options->ipo				= $widget_obj->ipo;

			// instance the current widget
			$widget = widget_common::get_instance($widget_options);

			// Widget data
			$widget_data_list = method_exists($widget, 'get_data_list')
				? $widget->get_data_list()
				: null;

			if($widget_data_list!==null){
				$data_list = array_merge($data_list, $widget_data_list);
			}
		}//end foreach ($widgets as $widget_obj)

		// set the component info dato with the result
		$this->data_list = $data_list;


		return $data_list;
	}//end get_data_list



	/**
	* GET_TOOLS
	* Overrides common method to prevent loading of default tools
	* This component don't have tools
	* @return array
	*/
	public function get_tools() : array {

		return [];
	}//end get_tools



	/**
	* GET_SORTABLE
	* @return bool
	* 	Default is true. Override when component is not sortable
	*/
	public function get_sortable() : bool {

		return false;
	}//end get_sortable



	/**
	* GET_LIST_VALUE
	* Unified value list output
	* By default, list value is equivalent to dato. Override in other cases.
	* Note that empty array or string are returned as null
	* @return array|null $list_value
	*/
	public function get_list_value() : ?array {

		$dato = $this->get_dato();
		if (empty($dato)) {
			return null;
		}

		$list_value = $dato;

		return $list_value;
	}//end get_list_value



	/**
	* GET_CALCULATION_DATA
	* Obtain the component data for a calculation
	* @param object|null $options = null
	* @return array $data
	*/
	public function get_calculation_data( ?object $options=null ) : array {

		$data = [];

		// options
			$select	= $options->select ?? 'value';

		$dato = $this->get_dato();
		if (!empty($dato)) {
			foreach ($dato as $current_dato) {
				if (isset($current_dato->{$select})){
					$data[] = $current_dato->{$select};
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
	* By default the widget will return his data, but is possible to overwrite it with get_dato_parsed() in the widget
	* @param object|null $ddo = null
	* @return dd_grid_cell_object $dd_grid_cell_object
	*/
	public function get_grid_value( ?object $ddo=null ) : dd_grid_cell_object {

		// set the separator if the ddo has a specific separator, it will be used instead the component default separator
			$fields_separator	= $ddo->fields_separator ?? null;
			$records_separator	= $ddo->records_separator ?? null;
			$format_columns		= $ddo->format_columns ?? null;
			$class_list			= $ddo->class_list ?? null;

		// column_obj
			$column_obj = $this->column_obj ?? (object)[
				'id' => $this->section_tipo.'_'.$this->tipo
			];

		// short vars
			$data		= $this->get_dato_parsed();// use data parsed to be processed by the widget if needed. see mdcat->sum_dates
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
						return $item->id===$current_id;
					});
					$value = is_object( $found )
						? $found->value
						: null;

					if( is_object( $value ) ){
						$value= json_encode($value);
					}

					$value = [$value];

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
				$value->set_value($ar_columns);


		return $value;
	}//end get_grid_value



	/**
	* GET_GRID_FLAT_VALUE
	* @param object|null $ddo = null
	* @return dd_grid_cell_object
	*/
	public function get_grid_flat_value( ?object $ddo=null ) : dd_grid_cell_object {

		return $this->get_grid_value($ddo);
	}//end get_grid_flat_value



}//end class component_info
