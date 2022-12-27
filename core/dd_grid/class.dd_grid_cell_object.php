<?php
/*
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
	// string class_list. As "caption bold"
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
	// object action . Used but buttons to define the action will done by the user
	//		method 	: string - name of the method will be used by the element
	//		options : object - parameters to configure the method
	// 		event 	: string - name of the user event
	public $action;
	// array value. array of strings || array of objects - every object define one column of data and action - [{"type": "button","action": "hello","data": []}] - every item inside the array will be a row of the column of his position inside the array
	public $value;
	// array fallback_value. array of strings - when a component doesn't has value in the current lang, use the fallback_value with one value in other languages
	public $fallback_value;

	// render_label
	public $render_label;
	// column.
	public $column;
	// array ar_columns_obj
	public $ar_columns_obj;

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
	* @param object $data
	* optional . Default is null
	*/
	public function __construct( $data=null ) {

		if (is_null($data)) {
			return;
		}

		# Nothing to do on construct (for now)
		if (!is_object($data)) {
			// trigger_error("wrong data format. Object expected. Given: ".gettype($data));
			debug_log("ERROR: wrong data format. Object expected. Given: ".gettype($data), logger::ERROR);
		}else{
			// set all properties
			foreach ($data as $key => $value) {
				$method = 'set_'.$key;
				$this->{$method}($value);
			}
		}
	}//end __construct



	/**
	* SET_CLASS_LIST
	* @param string $value
	* @return void
	*/
	public function set_class_list(string $value) : void {
		$this->class_list = $value;
	}//end set_class_list



	/**
	* SET_TYPE
	* @param string $value
	* @return void
	*/
	public function set_type(string $value) : void {
		$this->type = $value;
	}//end set_class_list



	/**
	* SET_LABEL
	* @param string $value
	* @return void
	*/
	public function set_label(string $value) : void {
		$this->label = $value;
	}//end set_label



	/**
	* SET_ROW_COUNT
	* @param int $value
	* @return void
	*/
	public function set_row_count(int $value) : void {
		$this->row_count = $value;
	}//end set_row_count



	/**
	* SET_COLUMN_COUNT
	* @param int $value
	* @return void
	*/
	public function set_column_count(int $value) {
		$this->column_count = $value;
	}//end set_column_count



	/**
	* SET_AR_COLUMNS_OBJ
	* @param array $value
	* @return void
	*/
	public function set_ar_columns_obj(array $value) : void {
		$this->ar_columns_obj = $value;
	}//end set_ar_columns_obj



	/**
	* SET_COLUMN_LABELS
	* @param array $value
	* @return void
	*/
	public function set_column_labels(array $value) : void  {
		$this->column_labels = $value;
	}//end set_column_labels



	/**
	* SET_FIELDS_SEPARATOR
	* @param string $value
	* @return void
	*/
	public function set_fields_separator(string $value) : void  {
		$this->fields_separator = $value;
	}//end set_fields_separator



	/**
	* SET_RECORDS_SEPARATOR
	* @param string $value
	* @return void
	*/
	public function set_records_separator(string $value) : void  {
		$this->records_separator = $value;
	}//end set_records_separator



	/**
	* SET_CELL_TYPE
	* @param string $value
	* @return void
	*/
	public function set_cell_type(string $value) : void {
		$this->cell_type = $value;
	}//end set_cell_type



	/**
	* SET_ACTION
	* @param string $value
	* @return void
	*/
	public function set_action(string $value) : void {
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
	* @param array $value
	* @return void
	*/
	public function set_fallback_value(array $value) : void {
		$this->fallback_value = $value;
	}//end set_fallback_value



	/**
	* SET_RENDER_LABEL
	* @param bool $value
	* @return void
	*/
	public function set_render_label(bool $value) : void {
		$this->render_label = $value;
	}//end set_render_label



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




}//end class dd_grid_cell_object