<?php declare(strict_types=1);
/**
* CLASS DD_GRID_CELL_OBJECT
* Polymorphic value-cell descriptor used by the client grid renderer.
*
* dd_grid_cell_object is the canonical transfer object that PHP components
* place inside their get_grid_value() return value so that the JavaScript
* grid can render tabular data without knowing the component model.
*
* Structural roles — one instance can represent any of these:
* - A 'column' cell: a leaf data field. Carries $value (flat array of
*   scalars), $label, $cell_type, $fields_separator, and the companion
*   $ar_columns_obj (column-definition metadata the JS header row reads).
* - A 'row' cell: a logical record inside a relation component. $value
*   is an array of column dd_grid_cell_object instances, one per resolved
*   child component. $row_count and $column_count describe the overall
*   relation grid dimensions.
* - A head/caption cell: same shape as 'column', with $class_list set to
*   a CSS modifier ('head grey', etc.) to drive header styling.
*
* Wire format — the outer grid is a PHP array of arrays of these objects.
* Each row is an array; each element of that array is one dd_grid_cell_object.
* JSON-encoding is implicit (PHP object → JSON object).
*
* Key callers:
* - component_common::get_grid_value() and export_value_to_grid_cell()
*   (base implementation for leaf components)
* - component_relation_common::get_grid_value() (relation / nested rows)
* - class.indexation_grid.php (section-level grid assembly)
*
* Note: the atoms-based export path (get_export_value / export_value /
* export_atom) supersedes this object for the export tabulator but is not
* a drop-in replacement for the visual grid layer. Both coexist.
*
* @package Dédalo
* @subpackage Core
*/
class dd_grid_cell_object {

	/**
	* CLASS VARS
	*/

		/**
		 * Unique column identifier, e.g. "oh1_id".
		 * Typically the component tipo. Used to correlate data across rows.
		 * @var ?string $id
		 */
		public ?string $id = null;

		/**
		 * Space-separated CSS class tokens applied to the rendered cell element.
		 * Example: "caption bold", "head grey".
		 * @var ?string $class_list
		 */
		public ?string $class_list = null;

		/**
		 * Structural type of this cell in the grid.
		 * 'row'    — the cell's $value is an array of column dd_grid_cell_objects.
		 * 'column' — the cell's $value is an array of scalar data values.
		 * @var ?string $type
		 */
		public ?string $type = null;

		/**
		 * Human-readable column header, displayed above data values.
		 * Sourced from the component's own label (ontology term label).
		 * @var ?string $label
		 */
		public ?string $label = null;

		/**
		 * Number of relation records that produced this cell.
		 * Set on the outer 'column' wrapper by relation components so that the
		 * client can allocate the correct grid row spans.
		 * @var ?int $row_count
		 */
		public ?int $row_count = null;

		/**
		 * Number of child columns inside a relation component.
		 * Together with $row_count, defines the two-dimensional extent of the
		 * rendered sub-grid for portal / relation components.
		 * @var ?int $column_count
		 */
		public ?int $column_count = null;

		/**
		 * Ordered list of column-header labels for a portal or relation component.
		 * Each entry corresponds to one resolved child component column.
		 * @var ?array $column_labels
		 */
		public ?array $column_labels = null;

		/**
		 * Separator inserted between field values within a single cell.
		 * Null falls back to the client default (typically ", ").
		 * Used by resolve_value() and the client renderer alike.
		 * @var ?string $fields_separator
		 */
		public ?string $fields_separator = null;

		/**
		 * Separator inserted between records (rows) in a multi-record cell.
		 * Typically "<br>" for HTML output or " | " for plain text.
		 * @var ?string $records_separator
		 */
		public ?string $records_separator = null;

		/**
		 * Rendering hint for the cell's data values.
		 * Drives which client sub-renderer is chosen. Recognized values:
		 * 'av', 'img', 'iri', 'button', 'json', 'section_id', 'text'.
		 * @var ?string $cell_type
		 */
		public ?string $cell_type = null;

		/**
		 * Action descriptor for interactive cells (buttons, links).
		 * When set, the client attaches the described event handler to each value.
		 * Shape example: {"method":"open_record","options":{},"event":"click"}.
		 * The property is typed object|string|null to accommodate both a
		 * pre-encoded JSON string and a decoded stdClass from round-trip deserialization.
		 * (!) The setter set_action() only accepts ?string — callers that need to pass
		 * an object must set the property directly or cast first.
		 * @var object|string|null $action
		 */
		public object|string|null $action = null;

		/**
		 * Flat array of scalar data values for this column, one entry per record.
		 * For 'row' cells, each entry is itself a dd_grid_cell_object (column).
		 * Null until explicitly set.
		 * @var array|null $value
		 */
		public array|null $value = null;

		/**
		 * Fallback values used when the current-language data in $value is empty.
		 * Indexed in parallel with $value so that $fallback_value[$key] is the
		 * substitute for an empty $value[$key].
		 * @var ?array $fallback_value
		 */
		public ?array $fallback_value = null;

		/**
		 * Raw component data in the current language, for special renderers.
		 * Currently used only by component_iri (which embeds its label/IRI pair
		 * here so the client can render a hyperlink without a second request).
		 * @var ?array $data
		 */
		public ?array $data = null;

		/**
		 * Whether the client should render the $label above the column values.
		 * False or null suppresses the header; true renders it.
		 * @var ?bool $render_label
		 */
		public ?bool $render_label = null;

		/**
		 * Column group identifier, matching the component tipo or a named group key.
		 * The client uses this to align cells that belong to the same logical column
		 * across multiple rows.
		 * @var ?string $column
		 */
		public ?string $column = null;

		/**
		 * Column-definition metadata objects, one per child component.
		 * The JS grid header row reads these to render column titles and widths.
		 * Usually an array, but tool_export may pass a single object; see set_ar_columns_obj().
		 * @var array|object|null $ar_columns_obj
		 */
		public array|object|null $ar_columns_obj = null;

		/**
		 * Arbitrary extra metadata attached to the cell.
		 * Open-ended container for features that do not fit the fixed properties.
		 * Current use: carries the section color code so the client can highlight rows.
		 * @var ?object $features
		 */
		public ?object $features = null;

		/**
		 * PHP class name of the component model that produced this cell.
		 * Example: 'component_av', 'component_input_text'.
		 * Lets the client pick a model-specific sub-renderer when $cell_type alone
		 * is insufficient.
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
	* Builds the object either as an empty shell (no arguments) or from an
	* existing plain-object representation (e.g. decoded from JSON or a
	* persisted cache). When $options is provided each of its properties is
	* applied through the corresponding set_*() accessor.
	* @param object|null $options = null
	*   Optional property bag. Each key must match a declared set_*() method.
	* @return void
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
	* (!) Type narrowing mismatch: the $action property declares object|string|null
	* but this setter only accepts ?string. Callers that need to assign a decoded
	* action object must bypass the setter and write $cell->action = $obj directly.
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
	* Get given dd_grid and flat his columns and rows join it as string value.
	*
	* LEGACY REFERENCE ONLY (atoms convergence): production value resolution
	* runs on the atoms contract (component_common::get_value ->
	* export_value::to_flat_string, which replicates these join semantics).
	* This method has ZERO production callers and is kept as the legacy-join
	* reference for the parity gates of the remaining structural
	* get_grid_value overrides (relation/info/inverse) — see
	* test/server/components/export_value_parity_Test.php. Do not call it
	* from new code; delete it when those overrides converge.
	*
	* Algorithm overview:
	* - 'row' cells: iterate records, recurse into each row's columns,
	*   join fields with $fields_separator, join records with $records_separator.
	* - 'column' cells: iterate values; recurse when a value is itself an
	*   object (nested cell); use $fallback_value when a value is empty.
	*   Scalar values are cast to string via to_string() if needed.
	*
	* (!) empty() semantics drop the string '0' — this is a known bug-for-bug
	* parity with export_value::to_flat_string() and must NOT be fixed here.
	*
	* @param dd_grid_cell_object $dd_grid
	*   The cell to flatten. Typically the outer 'column' wrapper returned by
	*   a component's get_grid_value().
	* @return string
	*   Fully joined, human-readable string representation of all cell values.
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
