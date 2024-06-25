<?php
declare(strict_types=1);
/**
* CLASS COMPONENT_INFO
*
*
*/
class component_info extends component_common {



	/**
	* properties
	* @var
	*/
	public $widget_lang;
	public $widget_mode;
	public $use_db_data = false;



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
	* GET_DB_DATA
	* @return
	*/
	public function get_db_data() {

		$data = parent::get_dato();

		if(empty($data)){
			$data = $this->get_dato();
			// if(!empty($data)){
			// 	$this->set_dato($data);
			// 	$this->Save();
			// }
		}

		return $data;
	}//end get_db_data



	/**
	* GET_WIDGETS
	* Resolve list of widgets for current component_info
	* They are defined in properties
	* @return array|null
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
			: $valor;


		return $valor;
	}//end get_valor



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
	* @return mixed $diffusion_dato
	*/
	public function get_diffusion_dato( object $options ) : mixed {

		// options
			$widget_name	= $options->widget_name; // array
			$select			= $options->select; // array
			$value_format	= $options->value_format ?? null; // string|null
			$lang			= $options->lang ?? DEDALO_DATA_LANG; // string

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
				$current_select = $select[$key];

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
	* 	Default is true. Override when component is sortable
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
	*  Get the data of the component for do a calculation
	* @param object|null $options = null
	* @return mixed $data
	*/
	public function get_calculation_data($options=null) : array {

		$data = [];

		// options
			$select	= $options->select ?? 'value';

		$dato = $this->get_dato();
		if (!empty($dato)) {
			foreach ($dato as $current_dato) {

				if (isset($current_dato->{$select})){
					$data[] = $current_dato->{$select};
				}else{
					continue;
				}
			}
		}

		return $data;
	}//end get_calculation_data



}//end class component_info
