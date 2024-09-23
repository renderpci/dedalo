<?php
declare(strict_types=1);
/**
*  DD_GRID_CELL_OBJECT
*
*  Used as standard object format to use in client to render tables with unspecific data or component.
*  The grid will process the object as simple table with heads, captions and rows, etc, but the object doesn't has type of the row, only the CSS that will used to render the data.
*  The format use flat data and add possibility to include buttons or links to the data.
*
*  Sample:

	[
	  [
	    {
	      "class_list": "head grey",
	      "column": "portal",
	      "fields_separator": ", ",
	      "records_separator": "<br>",
	      "total_rows":3,
	      "data": [
	        {
	          "column": "id",
	          "data": [
	            5,
	            8
	          ]
	        },
	        {
	          "column": "nombre",
	          "data": [
	            "paco",
	            "Pepe"
	          ]
	        },
	        {
	          "column": "apellido",
	          "data": [
	            "otro",
	            "mas"
	          ]
	        }
	      ]
	    },
	    {
	      "class_list": "head grey",
	      "column": "input_x",
	      "fields_separator": null,
	      "records_separator": "<br>",
	      "data": [
	        {
	          "column": "my input",
	          "data": [
	            "raspa"
	          ]
	        }
	      ]
	    }
	  ],
	  [
	    {
	      "class_list": "head grey",
	      "column": "portal",
	      "fields_separator": ", ",
	      "records_separator": "<br>",
	      "data": [
	        {
	          "column": "id",
	          "data": [
	            5,
	            8
	          ]
	        },
	        {
	          "column": "nombre",
	          "data": [
	            "paco",
	            "Pepe"
	          ]
	        },
	        {
	          "column": "apellido",
	          "data": [
	            "otro",
	            "mas"
	          ]
	        }
	      ]
	    },
	    {
	      "class_list": "head grey",
	      "column": "input_x",
	      "fields_separator": null,
	      "records_separator": "<br>",
	      "data": [
	        {
	          "column": "my input",
	          "data": [
	            "raspa"
	          ]
	        }
	      ]
	    }
	  ]
	]
*/
class dd_grid_cell_object {



	// string id. As "oh1_id" - the unique id of the column to identify data inside the same column
	public $id;
	// string class_list. CSS selector As "caption bold"
	public $class_list;
	// string type. row column - type of the element
	public $type;
	// string label. As "name" - one column of the grid (every column is a object)
	public $label;
	// int row_count. Total rows of the component, used by portals to define the rows that could be separated individually.
	public $row_count;
	// int column_count. Total columns of the component, used by portals to define the columns that could be separated individually.
	public $column_count;
	// array column_labels. Names of the columns that will use the portal to define sub columns names
	public $column_labels;
	// string $fields_separator. AS ", " with the glue of the fields
	public $fields_separator;
	// string records_separator. As "<br>" - with the glue of the rows
	public $records_separator;
	// string cell_type. Type of the element to represent in the cell
	public $cell_type;
	// object action . Used by buttons to define the action will done by the user
	//		method 	: string - name of the method will be used by the element
	//		options : object - parameters to configure the method
	// 		event 	: string - name of the user event
	public $action;
	// array value. array of strings || array of objects - every object define one column of data and action - [{"type": "button","action": "hello","data": []}] - every item inside the array will be a row of the column of his position inside the array
	public $value;
	// array fallback_value. array of strings - when a component doesn't has value in the current lang, use the fallback_value with one value in other languages
	public $fallback_value;
	// array data. component raw data in current lang. optional (!). See COMPONENT_IRI case
	public $data;

	// render_label
	public $render_label;
	// string|null column
	public $column;
	// array ar_columns_obj
	public $ar_columns_obj;
	// object features
	// Multipurpose container used to pass useful information, for example the section color
	public $features;

	// ar_value_type_allowed
		// private static $ar_value_type_allowed = [
		// 	'text',
		// 	'link',
		// 	'button'
		// ];

	// ar_cell_type_allowed. (!) Consider to implement this limitation (not used now)
		// private static $ar_cell_type_allowed = [
		// 	'av',
		// 	'img',
		// 	'iri',
		// 	'button',
		// 	'json',
		// 	'section_id',
		// 	'text'
		// ];



	/**
	* __CONSTRUCT
	* @param object $options
	* optional . Default is null
	*/
	public function __construct( $options=null ) {

		if (is_null($options)) {
			return;
		}

		// Nothing to do on construct (for now)
		if (!is_object($options)) {
			debug_log( __METHOD__
				. " ERROR: wrong data format. Object expected. Given type: " . PHP_EOL
				. ' options type: ' . gettype($options)
				, logger::ERROR
			);
		}else{
			// set all properties
			foreach ($options as $key => $value) {
				$method = 'set_'.$key;
				$this->{$method}($value);
			}
		}
	}//end __construct



	/**
	* GET METHODS
	* By accessors. When property exits, return property value, else return null
	*/
	final public function __get($name) {

		if (isset($this->$name)) {
			return $this->$name;
		}

		$trace = debug_backtrace();
		debug_log(
			__METHOD__
			.' Undefined property via __get(): '.$name .
			' in ' . $trace[0]['file'] .
			' on line ' . $trace[0]['line'],
			logger::DEBUG);
		return null;
	}//end __get



	/**
	* SET_ID
	* @param string|null $value
	* @return void
	*/
	public function set_id(?string $value) : void {
		$this->id = $value;
	}//end set_id



	/**
	* SET_CLASS_LIST
	* @param string|null $value
	* @return void
	*/
	public function set_class_list(?string $value) : void {
		$this->class_list = $value;
	}//end set_class_list



	/**
	* SET_TYPE
	* @param string|null $value
	* @return void
	*/
	public function set_type(?string $value) : void {
		$this->type = $value;
	}//end set_class_list



	/**
	* SET_LABEL
	* @param string|null $value
	* @return void
	*/
	public function set_label(?string $value) : void {
		$this->label = $value;
	}//end set_label



	/**
	* SET_ROW_COUNT
	* @param int|null $value
	* @return void
	*/
	public function set_row_count(?int $value) : void {
		$this->row_count = $value;
	}//end set_row_count



	/**
	* SET_COLUMN_COUNT
	* @param int|null $value
	* @return void
	*/
	public function set_column_count(?int $value) {
		$this->column_count = $value;
	}//end set_column_count



	/**
	* SET_AR_COLUMNS_OBJ
	* (!) Note that despite the name, could contain one or various items
	* Usually is array, but in some cases (like tool_export use) not
	* @param array|object $value
	* @return void
	*/
	public function set_ar_columns_obj(array|object $value) : void {
		$this->ar_columns_obj = $value;
	}//end set_ar_columns_obj



	/**
	* SET_COLUMN_LABELS
	* @param array|null $value
	* @return void
	*/
	public function set_column_labels(?array $value) : void  {
		$this->column_labels = $value;
	}//end set_column_labels



	/**
	* SET_FIELDS_SEPARATOR
	* @param string|null $value
	* @return void
	*/
	public function set_fields_separator(?string $value) : void  {
		$this->fields_separator = $value;
	}//end set_fields_separator



	/**
	* SET_RECORDS_SEPARATOR
	* @param string|null $value
	* @return void
	*/
	public function set_records_separator(?string $value) : void  {
		$this->records_separator = $value;
	}//end set_records_separator



	/**
	* SET_CELL_TYPE
	* @param string|null $value
	* @return void
	*/
	public function set_cell_type(?string $value) : void {
		$this->cell_type = $value;
	}//end set_cell_type



	/**
	* SET_ACTION
	* @param string|null $value
	* @return void
	*/
	public function set_action(?string $value) : void {
		$this->action = $value;
	}//end set_action



	/**
	* SET_VALUE
	* @param mixed $value
	* @return void
	*/
	public function set_value($value) : void  {
		$this->value = $value;
	}//end set_value



	/**
	* SET_FALLBACK_VALUE
	* @param array|null $value
	* @return void
	*/
	public function set_fallback_value(?array $value) : void {
		$this->fallback_value = $value;
	}//end set_fallback_value



	/**
	* SET_DATA
	* Optional raw data used by component_iri
	* @param array|null $value
	* @return void
	*/
	public function set_data(?array $value) : void {
		$this->data = $value;
	}//end set_data



	/**
	* SET_RENDER_LABEL
	* @param bool|null $value
	* @return void
	*/
	public function set_render_label(?bool $value) : void {
		$this->render_label = $value;
	}//end set_render_label



	/**
	* SET_COLUMN
	* @param string|null $value
	* @return void
	*/
	public function set_column(?string $value) : void {
		$this->column = $value;
	}//end set_column



	/**
	* SET_FEATURES
	* Multipurpose container used to pass useful information, for example the section color
	* @param object|null $value
	* @return void
	*/
	public function set_features(?object $value) : void {
		$this->features = $value;
	}//end set_features



	/**
	* RESOLVE_VALUE
	* get dd_grid and flat his columns and rows join it as string value
	* @param dd_grid_cell_object $dd_grid
	* @return string $column_value
	*/
	public static function resolve_value(dd_grid_cell_object $dd_grid) : string {

		$value_check = $dd_grid->value;
		if(isset($value_check[0]) && is_object($value_check[0]) &&
			isset($value_check[0]->type) && $value_check[0]->type==='row') {

			// rows case

			$ar_row_values = $dd_grid->value;

			$records_separator	= $dd_grid->records_separator ?? ' | ';
			$fields_separator	= $dd_grid->fields_separator ?? ', ';

			$rows = [];
			foreach ($ar_row_values as $row) {

				$row_values = $row->value;

				$row_columns_values = [];
				foreach ($row_values as $dd_grid_column) {
					$current_value = dd_grid_cell_object::resolve_value($dd_grid_column);
					if (!empty($current_value)) {
						$row_columns_values[] = $current_value;
					}
				}
				$rows[] = implode($fields_separator, $row_columns_values);
			}

			$row_value = implode($records_separator, $rows);

			return $row_value;

		}else{

			// columns case

			$ar_column_values	= (array)$dd_grid->value;
			$ar_fallback_values	= (array)$dd_grid->fallback_value;

			$fields_separator 	= $dd_grid->fields_separator ?? ', ';

			$ar_column_value = [];
			foreach ($ar_column_values as $key => $value) {

				// not resolved string case
					if(is_object($value)){
						if (!empty($value->value)) {
							$current_value = dd_grid_cell_object::resolve_value($value);
							if (!empty($current_value)) {
								$ar_column_value[] = $current_value;
							}
						}else{
							// when the value is empty []
							// check if it has a fallback value
							// if they have, use it.
							$fallback = $value->fallback_value[$key];
							if(!empty($fallback)){
								$ar_column_value[] = $fallback;
							}
						}
						continue;
					}

				$fallback = ( !empty($value) )
					? $value
					: ($dd_grid->fallback_value[$key] ?? null);

				if ( empty($fallback) ) {
					continue;
				}

				$ar_column_value[] = is_string($fallback)
					? $fallback
					: to_string($fallback);
			}
			// in the case of empty value, try to get information from fallback
			$ar_column_value = empty($ar_column_value)
				? $ar_fallback_values
				: $ar_column_value;

			$column_value = implode($fields_separator, $ar_column_value);

			return $column_value;
		}
	}//end resolve_value



}//end class dd_grid_cell_object
