<?php declare(strict_types=1);
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

	/**
	* CLASS VARS
	*/

		/**
		 * Unique identifier for the column. Format: "oh1_id".
		 * Used to identify data within the same column across rows.
		 * @var ?string $id
		 */
		public ?string $id = null;

		/**
		 * CSS class list for styling the cell. Example: "caption bold".
		 * Space-separated CSS selectors applied to the cell element.
		 * @var ?string $class_list
		 */
		public ?string $class_list = null;

		/**
		 * Type of grid element. Values: 'row', 'column'.
		 * Defines whether this cell represents a row header or data column.
		 * @var ?string $type
		 */
		public ?string $type = null;

		/**
		 * Human-readable label for the column. Example: "name".
		 * Displayed as column header in the grid.
		 * @var ?string $label
		 */
		public ?string $label = null;

		/**
		 * Total number of rows in the component.
		 * Used by portals to define separable row groups.
		 * @var ?int $row_count
		 */
		public ?int $row_count = null;

		/**
		 * Total number of columns in the component.
		 * Used by portals to define separable column groups.
		 * @var ?int $column_count
		 */
		public ?int $column_count = null;

		/**
		 * Array of column labels for portal sub-columns.
		 * Names used by portals to define nested column headers.
		 * @var ?array $column_labels
		 */
		public ?array $column_labels = null;

		/**
		 * Separator string between fields within a cell. Example: ", ".
		 * Glue used when concatenating multiple field values.
		 * @var ?string $fields_separator
		 */
		public ?string $fields_separator = null;

		/**
		 * Separator string between records/rows. Example: "<br>".
		 * HTML or string used to separate multiple records in the same cell.
		 * @var ?string $records_separator
		 */
		public ?string $records_separator = null;

		/**
		 * Type of element to render within the cell.
		 * Values: 'av', 'img', 'iri', 'button', 'json', 'section_id', 'text'.
		 * @var ?string $cell_type
		 */
		public ?string $cell_type = null;

		/**
		 * Action configuration for interactive elements (buttons).
		 * Object with method, options, and event properties defining user actions.
		 * Every object defines one column of data and action - [{"type": "button","action": "hello","data": []}] -
		 * every item inside the array will be a row of the column of his position inside the array
		 * @var object|string|null $action
		 */
		public object|string|null $action = null;

		/**
		 * Array of cell values. Array of strings or objects defining column data.
		 * Each item represents a row in its column position.
		 * @var array|null $value
		 */
		public array|null $value = null;

		/**
		 * Fallback values when current language has no data.
		 * When a component doesn't has value in the current lang, use the fallback_value with one value in another language.
		 * Array of strings with values from other languages.
		 * @var ?array $fallback_value
		 */
		public ?array $fallback_value = null;

		/**
		 * Raw component data in current language (optional).
		 * Used for special cases like COMPONENT_IRI.
		 * @var ?array $data
		 */
		public ?array $data = null;

		/**
		 * Whether to render the column label/heading.
		 * Controls visibility of the column header text.
		 * @var ?bool $render_label
		 */
		public ?bool $render_label = null;

		/**
		 * Column identifier for grouping and positioning.
		 * Defines which column group this cell belongs to.
		 * @var ?string $column
		 */
		public ?string $column = null;

		/**
		 * Array of column objects for nested column definitions.
		 * Used for complex grid layouts with sub-columns.
		 * @var array|object|null $ar_columns_obj
		 */
		public array|object|null $ar_columns_obj = null;

		/**
		 * Multipurpose container for additional cell features.
		 * Used to pass extra information like section color.
		 * @var ?object $features
		 */
		public ?object $features = null;

		/**
		 * Component model/type identifier.
		 * Specifies which component model this cell represents.
		 * @var ?string $model
		 */
		public ?string $model = null;

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
	* @param object|null $options
	* optional . Default is null
	*/
	public function __construct( ?object $options=null ) {

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
	public function set_column_count(?int $value) : void {
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
	* @param array|null $value
	* @return void
	*/
	public function set_value(?array $value) : void  {
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
	* SET_COLUMN
	* Set component model as 'component_av'
	* @param string|null $value
	* @return void
	*/
	public function set_model(?string $value) : void {
		$this->model = $value;
	}//end set_model



	/**
	* RESOLVE_VALUE
	* Get given dd_grid and flat his columns and rows join it as string value
	* @param dd_grid_cell_object $dd_grid
	* @return string $column_value|$row_value
	*/
	public static function resolve_value(dd_grid_cell_object $dd_grid) : string {

		$value_check = $dd_grid->value;
		if( isset($value_check[0]) && is_object($value_check[0]) &&
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
							$fallback = $value->fallback_value[$key] ?? null;
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
