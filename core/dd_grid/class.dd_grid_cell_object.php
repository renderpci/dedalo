<?php
/**
*  DD_GRID_CELL_OBJECT
*
*  Used as standard object format to use in client to render tables with unspecific data or component.
*  The grid will process the object as simple table with heads, captions and rows, etc, but the object doesn't has type of the row, only the CSS that will used to render the data.
*  The format use flat data and add possibility to include buttons or links to the data.
*
*  Example:
*
*	[
*	  [
*	    {
*	      "class_list": "head grey",
*	      "column": "portal",
*	      "separator_fields": ", ",
*	      "separator_rows": "<br>",
*	      "total_rows":3,
*	      "data": [
*	        {
*	          "column": "id",
*	          "data": [
*	            5,
*	            8
*	          ]
*	        },
*	        {
*	          "column": "nombre",
*	          "data": [
*	            "paco",
*	            "Pepe"
*	          ]
*	        },
*	        {
*	          "column": "apellido",
*	          "data": [
*	            "otro",
*	            "mas"
*	          ]
*	        }
*	      ]
*	    },
*	    {
*	      "class_list": "head grey",
*	      "column": "input_x",
*	      "separator_fields": null,
*	      "separator_rows": "<br>",
*	      "data": [
*	        {
*	          "column": "my input",
*	          "data": [
*	            "raspa"
*	          ]
*	        }
*	      ]
*	    }
*	  ],
*	  [
*	    {
*	      "class_list": "head grey",
*	      "column": "portal",
*	      "separator_fields": ", ",
*	      "separator_rows": "<br>",
*	      "data": [
*	        {
*	          "column": "id",
*	          "data": [
*	            5,
*	            8
*	          ]
*	        },
*	        {
*	          "column": "nombre",
*	          "data": [
*	            "paco",
*	            "Pepe"
*	          ]
*	        },
*	        {
*	          "column": "apellido",
*	          "data": [
*	            "otro",
*	            "mas"
*	          ]
*	        }
*	      ]
*	    },
*	    {
*	      "class_list": "head grey",
*	      "column": "input_x",
*	      "separator_fields": null,
*	      "separator_rows": "<br>",
*	      "data": [
*	        {
*	          "column": "my input",
*	          "data": [
*	            "raspa"
*	          ]
*	        }
*	      ]
*	    }
*	  ]
*	]
*
*
*/
class dd_grid_cell_object {


	// Format
	//    	class_list  		: string - "caption bold"
	//    	column      		: strings - "name" - one column of the grid (every column is a object)
	// 		separator_fields 	: string -  ", " - with the glue of the fields
	//		separator_rows 		: string -  "<br>" - with the glue of the rows
	//    	type      			: string - type of the element to represent in the row
	//    	action    			: string -  name of the method will be used by the element
	//    	value       		: array of strings || array of objects - every object define one column of data and action - [{"type": "button","action": "hello","data": []}] - every item inside the array will be a row of the column of his position inside the array
	// 		fallback_value 		: array of strings - when a component doesn't has value in the current lang, use the fallback_value with one value in other languages


	// public $class_list;
	// public $column;
	// public $separator_fields;
	// public $separator_rows;
	// public $type;
	// public $action;
	// public $value;
	// public $fallback_value;

	private static $ar_value_type_allowed = [
		'text',
		'link',
		'button'
	];



	/**
	* __CONSTRUCT
	* @param object $data
	* optional . Default is null
	*/
	public function __construct( $data=null ) {

		if (is_null($data)) return;

		# Nothing to do on construct (for now)
		if (!is_object($data)) {
			trigger_error("wrong data format. Object expected. Given: ".gettype($data));
			return false;
		}

		// set all properties
			foreach ($data as $key => $value) {
				$method = 'set_'.$key;
				$this->{$method}($value);
			}

		return true;
	}//end __construct



	/**
	* SET_CLASS_LIST
	*/
	public function set_class_list(string $value) {
		$this->class_list = $value;
	}

	/**
	* SET_COLUMN
	*/
	public function set_column(string $value) {
		$this->column = $value;
	}

	/**
	* SET_SEPARATOR_FIELDS
	*/
	public function set_separator_fields(string $value) {
		$this->separator_fields = $value;
	}

	/**
	* SET_SEPARATOR_ROWS
	*/
	public function set_separator_rows(string $value) {
		$this->separator_rows = $value;
	}

	/**
	* SET_TYPE
	*/
	public function set_type(string $value) {
		$this->type = $value;
	}

	/**
	* SET_ACTION
	*/
	public function set_action(string $value) {
		$this->action = $value;
	}

	/**
	* SET_VALUE
	*/
	public function set_value(array $value) {
		$this->value = $value;
	}

	/**
	* SET_FALLBACK_VALUE
	*/
	public function set_fallback_value(array $value) {
		$this->fallback_value = $value;
	}




}//end class dd_grid_cell_object