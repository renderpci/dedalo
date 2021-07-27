<?php
/**
*  DD_GRID_OBJECT
*
*  Used as standard object format to use in client to render tables with unspecific data or component.
*  The grid will process the object as simple table with heads, captions and rows, etc, but the object doesn't has type of the row, only the CSS that will used to render the data.
*  The format use flat data and add possibility to include buttons or links to the data.
*
*  Example:
*
*   [
*    {
*      "class_list": "caption bold",
*      "label": [
*        "name"
*      ],
*      "value": [
*        "oral history"
*      ]
*    },
*    {
*      "class_list": "head grey",
*      "label": [
*        "name",
*        "surname"
*      ],
*      "value": [
*       "Paco",
*       "Pepe"
*      ]
*    },
*    {
*      "class_list": "body white",
*      "value": [
*        "Paco",
*        "Pepe",
*        [{
*          "type": "button",
*          "class_list": "body white",
*          "action": "hello_world",
*          "data": {}
*          "label": "open"
*        }]
*      ]
*    }
*  ]
*
*
*/
class dd_grid_object {


	// Format
	//    class_list  : string - "caption bold"
	//    label       : array of strings - ["name"] - every item inside the array will be a column of the grid
	//    value       : array of strings || array of objects - every object define one type of data and action - ["name", [{"type": "button","action": "hello","data": {}}]] - every item inside the array will be part of the column of his position inside the array
	//      type      : string - type of the element to represent in the row
	//      action    : string -  name of the method will be used by the element
	//      data      : objects - dataset of the element



	public $class_list;
	public $label;
	public $value;

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
	* SET_LABEL
	*/
	public function set_label(array $value) {
		$this->label = $value;
	}



	/**
	* SET_VALUE
	*/
	public function set_value(array $value) {
		$this->value = $value;
	}



}//end class dd_grid_object