<?php declare(strict_types=1);
include_once 'trait.search_component_section_id.php';
/**
* CLASS COMPONENT_SECTION_ID
* Virtual, read-only component that exposes a section's integer primary key.
*
* Unlike normal components, component_section_id does not own a JSONB datum
* column: the value it displays and exports is the 'section_id' INTEGER column
* that the section class writes directly to every matrix table row. This class
* only reads that column; it never writes anything.
*
* Responsibilities:
* - Render the row's section_id for display in edit and list views.
* - Participate in the standard export pipeline (get_export_value / tool_export)
*   so a user can include the numeric ID as a spreadsheet/CSV column. Each atom
*   carries cell_type 'section_id' so downstream formatters can distinguish it
*   from free-form integer fields.
* - Provide ORDER BY support for sorted list views via get_order_path(), pointing
*   at the 'section_id' column (or 'id' when the component tipo is the special
*   time-machine constant DEDALO_TIME_MACHINE_COLUMN_ID / dd1573).
* - Delegate all SQO search handling to trait search_component_section_id, which
*   supports numeric equality, comparison, range (between '...'), and sequence
*   (',') operators directly against the integer column without JSONB casting.
*
* What it does NOT do:
* - set_data() is a no-op; set the section_id via the section class only.
* - save() logs an error and returns true (no database write ever happens).
* - get_tools() returns [] to suppress tool buttons that make no sense here.
*
* Data shape: get_data() always returns a single-element array: [(int)section_id]
* or [null] when section_id is not set on the instance.
*
* Extends: component_common
* Uses trait: search_component_section_id
*
* @package Dédalo
* @subpackage Core
*/
class component_section_id extends component_common {



	// traits. Files added to current class file to split the large code.
	use search_component_section_id;



	/**
	* GET_DATA
	* Returns the section's primary key as a single-element array.
	*
	* The value is cast to int to guarantee a numeric type in the returned array.
	* The wrapping array is required by the component_common data contract: every
	* get_data() return must be an array (or null) so callers can iterate uniformly
	* over single-valued and multi-valued components with the same loop.
	*
	* Returns [null] when $this->section_id is empty (e.g. the instance was built
	* without loading a record) rather than an empty array, so downstream code
	* checking is_array() still finds a valid array rather than null.
	*
	* @return array|null - [(int)section_id] or [null] when section_id is absent
	*/
	public function get_data() : ?array {

		$data = !empty($this->section_id)
			? (int)$this->section_id
			: null;

		return [$data];
	}//end get_data



	/**
	* GET_DATA_LANG
	* Language-aware data accessor — proxies get_data() directly.
	*
	* component_section_id is language-neutral: the section primary key has the
	* same value regardless of the active language (equivalent to DEDALO_DATA_NOLAN
	* storage). The $lang parameter is accepted to satisfy the component_common
	* interface but is intentionally ignored.
	*
	* @param string|null $lang [= null] - Ignored; kept for interface compatibility
	* @return array|null - Same as get_data()
	*/
	public function get_data_lang( ?string $lang=null ) : ?array {

		$data = $this->get_data();

		return $data;
	}//end get_data_lang



	/**
	* SET_DATA
	* No-op override that silently discards any attempt to set data.
	*
	* component_section_id is strictly read-only. The section_id column is managed
	* exclusively by the section class and is never writable through a component.
	* This override prevents accidental writes when generic code iterates all
	* components of a section and calls set_data() on each.
	*
	* @override component_common::set_data()
	* @param array|null $data - Ignored
	* @return bool - Always true (treated as a successful no-op)
	*/
	public function set_data( ?array $data ) : bool {

		return true;
	}//end set_data



	/**
	* SAVE
	* No-op override that logs an error and returns true without writing anything.
	*
	* If save() is called on this component it means the calling code has a logic
	* error (e.g. iterating all section components and calling save() on each).
	* The ERROR-level log entry makes this visible in diagnostics without aborting
	* the request. Returning true keeps the caller from treating the call as a
	* failure.
	*
	* @override component_common::save()
	* @return bool - Always true
	*/
	public function save() : bool {

		debug_log(__METHOD__
			. " Ignored save command for component (component_section_id) "
			, logger::ERROR
		);

		return true;
	}//end save



	/**
	* GET_EXPORT_VALUE
	* Atoms-based export contract implementation (see component_common::get_export_value).
	*
	* Produces one export_atom per element returned by get_data() (normally exactly
	* one). Each atom carries:
	*   - path   : the component's position in the export column hierarchy,
	*              built via build_export_path_segment() so tool_export can place
	*              the value in the correct spreadsheet/NDJSON column.
	*   - value  : (int) the section_id cast to integer.
	*   - meta   : {cell_type: 'section_id', value_index: (int)key}
	*              cell_type 'section_id' is consumed by export_value_to_grid_cell()
	*              to apply ID-appropriate formatting rather than generic number
	*              formatting.
	*
	* Returns an empty export_value (no atoms) when get_data() returns an empty or
	* non-array result.
	*
	* @param export_context|null $context [= null] - Export context carrying path prefix,
	*        ddo overrides, and item_index. A default context is created when null.
	* @return export_value - Atom container for the tool_export pipeline
	*/
	public function get_export_value( ?export_context $context=null ) : export_value {

		$context = $context ?? new export_context();

		// own segment
			$segment	= $this->build_export_path_segment($context);
			$path		= [...$context->path_prefix, $segment];

		// export_value
			$export_value = new export_value([], $this->get_label(), get_called_class());

		// data. One int atom per item (usually one)
			$data = $this->get_data();
			if (empty($data) || !is_array($data)) {
				return $export_value;
			}
			foreach ($data as $key => $item) {
				$export_value->add_atom( new export_atom($path, (int)$item, (object)[
					'cell_type'		=> 'section_id',
					'value_index'	=> (int)$key
				]) );
			}


		return $export_value;
	}//end get_export_value



	/**
	* GET_TOOLS
	* Returns an empty tools array, suppressing all tool buttons for this component.
	*
	* Tool buttons (edit history, version control, media tools, etc.) are defined
	* per-component in the ontology and loaded by component_common::get_tools().
	* For component_section_id there are no meaningful tools — the value is
	* system-managed and immutable — so this override short-circuits that loading.
	* Avoids unnecessary ontology lookups on every list-view render.
	*
	* @override component_common::get_tools()
	* @return array - Always []
	*/
	public function get_tools() : array {

		return [];
	}//end get_tools



	/**
	* GET_ORDER_PATH
	* Builds the ORDER BY path descriptor for sorted list and grid views.
	*
	* Delegates to parent::get_order_path() to obtain the standard path array
	* (which includes section_tipo, component_tipo, model name, etc.), then
	* overrides the 'column' property on the first path element to point at the
	* correct physical database column:
	*
	*   - Normal case: 'section_id' — the named integer column present in every
	*     matrix table, used for ordering records by their primary key.
	*   - Time-machine case: when $this->tipo === DEDALO_TIME_MACHINE_COLUMN_ID
	*     (dd1573), the column must be 'id' instead. The time-machine table stores
	*     its sequential row identifier in the 'id' column, not 'section_id'.
	*
	* Setting the 'column' property prevents the query builder from interpreting
	* the path as a JSONB accessor; it instead uses the column name literally in
	* the ORDER BY clause.
	*
	* @see https://habr.com/en/company/postgrespro/blog/500440/
	* @see https://www.postgresql.org/docs/current/functions-json.html
	* @see https://www.postgresql.org/docs/current/datatype-json.html#TYPE-JSONPATH-ACCESSORS
	*
	* @param string $component_tipo - Ontology tipo identifier of the component
	* @param string $section_tipo   - Ontology tipo identifier of the owning section
	* @return array - Path descriptor array; $path[0]->column is set to 'section_id'
	*                 or 'id' (time-machine case)
	*/
	public function get_order_path(string $component_tipo, string $section_tipo) : array {

		// self path
		$path = parent::get_order_path($component_tipo, $section_tipo);

		// When `column` property is set, it will be used literally instead of parsing the path.
		// time machine case: tipo 'dd1573' is column `id`
		$path[0]->column = $this->tipo===DEDALO_TIME_MACHINE_COLUMN_ID ? 'id' : 'section_id';


		return $path;
	}//end get_order_path




}//end class component_section_id
