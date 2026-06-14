<?php declare(strict_types=1);
/**
* CLASS COMPONENT_INVERSE
* Read-only component that surfaces which other records point to the current record.
*
* component_inverse shows "backlinks": given a section record, it dynamically
* discovers every locator stored in any portal or relation component elsewhere
* in the database that targets this record, and presents them to the user
* without storing any data of its own.
*
* Example: a "Restoration Intervention" section (rsc550) contains a
* component_inverse configured to show all "Catalogue" records (rsc555) that
* hold a portal locator pointing to this intervention. The component never
* writes to the matrix; it reads live from the relation matrix on every request.
*
* Key characteristics:
* - No database write path: save() is a no-op (data is owned by the callers).
* - No database read path: get_data() bypasses the matrix and calls
*   section_record::get_inverse_references() instead, which delegates to
*   search_related::get_referenced_locators().
* - Each inverse locator carries three identifying fields:
*     from_section_tipo   : ontology tipo of the referencing section
*     from_section_id     : record id of the referencing section
*     from_component_tipo : ontology tipo of the component (portal/relation)
*                           inside the referencing section that holds the locator
* - In the grid / export model each (from_section_tipo, from_component_tipo)
*   pair becomes its own column; multiple records of the same pair accumulate
*   in the same column.
* - Configuration lives in the 'misc' column (ontology properties), not in
*   the matrix data column.
*
* Extends component_common for standard component lifecycle.
* Extended by nothing — this class is not designed for subclassing.
*
* @package Dédalo
* @subpackage Core
*/
class component_inverse extends component_common {



	/**
	* GET_DATA
	* Returns the live list of inverse-reference locators for the current record.
	*
	* Unlike most components this method does NOT read the matrix data column.
	* Instead it retrieves the parent section_record instance and asks it to
	* compute all locators (from any section/component in the system) that
	* point to the current record.  The result is an array of plain objects with
	* at minimum:
	*   ->from_section_tipo   (string)  — type of the section holding the reference
	*   ->from_section_id     (string)  — record id of the referencing section
	*   ->from_component_tipo (string)  — component inside that section storing the locator
	*
	* The resolved array is memoised in $this->data_resolved so repeated calls
	* within the same request are free.  $this->bl_loaded_matrix_data is set to
	* true to signal to the framework that data loading is complete even though
	* no matrix row was read.
	*
	* Returns null when the parent section record returns null (e.g. record does
	* not yet exist or section_id is 0).
	*
	* @return ?array $data - array of inverse locator objects, or null if none
	*/
	public function get_data() : ?array {

		// dato_resolved. Already resolved case
			if(isset($this->data_resolved)) {
				return $this->data_resolved;
			}

		// section search for inverse locators
			$section_record	= $this->get_my_section_record();
			$data = $section_record->get_inverse_references();

		// fix data
			$this->data_resolved = $data;

		// Set as loaded
		// (!) bl_loaded_matrix_data must be set manually here because we never
		// called load_component_data() / the normal matrix read path. Without it
		// the framework may attempt a redundant DB fetch.
			$this->bl_loaded_matrix_data = true;


		return $data;
	}//end get_data



	/**
	* SAVE
	* No-op override that silently absorbs any save command.
	*
	* component_inverse has no data of its own — all inverse references are
	* owned by the source components in other sections. A save attempt here
	* indicates a caller misconfiguration; it is logged as a WARNING so it
	* appears in the server log without disrupting the request.
	*
	* Always returns true so callers that check the return value do not treat
	* this as a failure.
	*
	* @return bool - always true
	*/
	public function save() : bool {

		debug_log(__METHOD__
			. " Ignored save command for component (" . get_called_class() . ")"
			, logger::WARNING
		);

		return true;
	}//end save



	/**
	* GET_GRID_VALUE
	* Builds the dd_grid_cell_object tree that the tabular/grid UI uses to render
	* the inverse references of the current record.
	*
	* Data model produced by this method
	* ------------------------------------
	* The overall shape follows the standard dd_grid_cell_object nesting:
	*
	*   column (component level)
	*   └── row  (one row per component instance — always exactly 1)
	*       └── column  (one per inverse locator)
	*             value : [from_section_id]
	*             label : human-readable term for from_section_tipo
	*
	* Column identity: columns are keyed by the tuple
	*   {section_tipo}_{from_section_tipo}_{component_tipo}_{from_component_tipo}
	* so that two locators from the same (from_section_tipo, from_component_tipo)
	* pair map to the same column object and the grid can align them correctly.
	*
	* Row count: always 1.  The component instance itself is the single row;
	* the data does not generate multiple rows (unlike portals).
	* Column count: one per distinct (from_section_tipo, from_component_tipo) pair.
	*
	* Separator precedence (both fields_separator and records_separator):
	*   1. $ddo->fields_separator / $ddo->records_separator  (caller override)
	*   2. $properties->fields_separator / records_separator  (ontology config)
	*   3. Hard-coded defaults: ', ' and ' | '
	*
	* @param object|null $ddo = null - optional DDO with display overrides
	*   (fields_separator, records_separator, format_columns, class_list)
	* @return dd_grid_cell_object $dd_grid_cell_object
	*/
	public function get_grid_value( ?object $ddo=null ) : dd_grid_cell_object {

		// ddo customs
			$fields_separator	= $ddo?->fields_separator ?? null;
			$records_separator	= $ddo?->records_separator ?? null;
			$format_columns		= $ddo?->format_columns ?? null;
			$class_list			= $ddo?->class_list ?? null;

		// short vars
			$data		= $this->get_data();
			$label		= $this->get_label();
			$properties	= $this->get_properties();

		// fields_separator
		// Three-level cascade: ddo override → ontology property → hard default
			$fields_separator = isset($fields_separator)
				? $fields_separator
				: (isset($properties->fields_separator)
					? $properties->fields_separator
					: ', ');

		// records_separator
		// Three-level cascade: ddo override → ontology property → hard default
			$records_separator = isset($records_separator)
				? $records_separator
				: (isset($properties->records_separator)
					? $properties->records_separator
					: ' | ');


		$ar_columns_obj = [];
		$ar_cells 		= [];
		foreach ($data as $current_locator) {
			// get the locator section_tipo and section_id of the section that call (from_section_tipo and from_section_id)
			$from_section_id		= $current_locator->from_section_id;
			$from_section_tipo		= $current_locator->from_section_tipo;
			$from_component_tipo	= $current_locator->from_component_tipo;

			// Resolve the human-readable label for the referencing section type
			$section_label 	= ontology_node::get_term_by_tipo($from_section_tipo,DEDALO_APPLICATION_LANG, true);

			// Column identity key: combines this component's section+tipo with the
			// caller's section+component to produce a unique, stable column id.
			$column_obj_id = $this->section_tipo.'_'.$from_section_tipo.'_'.$this->tipo.'_'.$from_component_tipo;

			// Reuse an existing column descriptor if we have already seen this pair;
			// otherwise create a new one and push it onto the column registry.
			// array_find is PHP 8.4+ (RFC#8500).
			$column_obj = array_find($ar_columns_obj, function($column)use ($column_obj_id){
				return $column->id === $column_obj_id;
			});

			if(empty($column_obj)){
				$column_obj = new stdClass();
					$column_obj->id		= $column_obj_id;
				$ar_columns_obj[] = $column_obj;
			}
			//create the column for every locator of every section_tipo and component_tipo with the section_id as value
			$grid_column = new dd_grid_cell_object();
				$grid_column->set_type('column');
				$grid_column->set_cell_type('text');
				$grid_column->set_label($section_label);
				$grid_column->set_value([$from_section_id]);
				$grid_column->set_ar_columns_obj([$column_obj]);
			// store the current column with all values
				$ar_cells[] = $grid_column;
		}

		//create the row of the component, every instance of the component has 1 unique row and multiple columns.
			$grid_row = new dd_grid_cell_object();
				$grid_row->set_type('row');
				$grid_row->set_value($ar_cells);
			// store the current column with all values
			// (!) $ar_cells now contains both the leaf columns AND the row object.
			// The row is appended last; callers must not assume the array is
			// homogeneous — only the final element is the row wrapper.
				$ar_cells[] = $grid_row;

		// always 1 data size it's not the rows
			$row_count = 1;

		// get the total of columns
			$column_count = sizeof($ar_columns_obj);

		// value
			$value = [$grid_row]; // array

		// dd_grid_cell_object, final columns that has the row and his columns
			$dd_grid_cell_object = new dd_grid_cell_object();
				$dd_grid_cell_object->set_type('column');
				$dd_grid_cell_object->set_label($label);
				// $dd_grid_cell_object->set_cell_type('text');
				$dd_grid_cell_object->set_ar_columns_obj($ar_columns_obj);
				$dd_grid_cell_object->set_row_count($row_count);
				$dd_grid_cell_object->set_column_count($column_count);
				if(isset($class_list)){
					$dd_grid_cell_object->set_class_list($class_list);
				}
				$dd_grid_cell_object->set_fields_separator($fields_separator);
				$dd_grid_cell_object->set_records_separator($records_separator);
				$dd_grid_cell_object->set_value($value);
				$dd_grid_cell_object->set_model(get_called_class());


		return $dd_grid_cell_object;
	}//end get_grid_value



	/**
	* GET_EXPORT_VALUE
	* Atoms-based export contract implementation for component_inverse.
	*
	* Each inverse locator becomes one export_atom whose path is:
	*   [...context->path_prefix, own_segment, sub_segment]
	* where:
	*   own_segment  — standard component path hop (section_tipo + this->tipo)
	*   sub_segment  — discriminates the calling pair (from_section_tipo +
	*                  from_component_tipo) so that each distinct caller pair
	*                  lands in its own export column.
	*
	* The atom value is from_section_id cast to int (the record id of the caller).
	*
	* Column deduplication: a running per-pair counter ($ar_value_index) tracks
	* how many atoms have been emitted for each sub_segment identity key
	* (section_tipo#component_tipo).  This counter is stored in the atom's
	* metadata as value_index so the export tabulator can expand multiple callers
	* of the same pair across rows rather than collapsing them.
	*
	* Locators that are missing from_section_tipo or from_component_tipo are
	* silently skipped (malformed locator guard).
	*
	* Returns an empty export_value (no atoms) when get_data() yields nothing.
	*
	* @param export_context|null $context = null - caller-supplied path context;
	*   a fresh default context is created when null.
	* @return export_value - bag of export_atom objects; never null
	*/
	public function get_export_value( ?export_context $context=null ) : export_value {

		$context = $context ?? new export_context();

		// own segment
			$own_segment	= $this->build_export_path_segment($context);
			$base_path		= [...$context->path_prefix, $own_segment];

		// export_value
			$export_value = new export_value([], $this->get_label(), get_called_class());

		// data. inverse locators
			$data = $this->get_data();
			if (empty($data)) {
				return $export_value;
			}

			$ar_value_index = []; // running index per pair column
			foreach ($data as $current_locator) {

				$from_section_tipo		= $current_locator->from_section_tipo ?? null;
				$from_component_tipo	= $current_locator->from_component_tipo ?? null;
				$from_section_id		= $current_locator->from_section_id ?? null;
				if (empty($from_section_tipo) || empty($from_component_tipo)) {
					// Malformed locator: skip rather than emit an atom with a
					// broken path that would corrupt column identity downstream.
					continue;
				}

				// from-pair sub segment (column identity per calling pair)
				// sub_segment differentiates callers: two portals in different
				// sections that both point here get distinct export columns.
					$sub_segment = new export_path_segment($from_section_tipo, $from_component_tipo);

				// Per-pair counter: tracks how many atoms share the same identity
				// key so each atom gets a unique value_index for row expansion.
				$pair_key = $sub_segment->get_identity_key();
				$ar_value_index[$pair_key] = isset($ar_value_index[$pair_key])
					? $ar_value_index[$pair_key] + 1
					: 0;

				$export_value->add_atom( new export_atom(
					[...$base_path, $sub_segment],
					isset($from_section_id) ? (int)$from_section_id : null,
					(object)['value_index' => $ar_value_index[$pair_key]]
				) );
			}


		return $export_value;
	}//end get_export_value



}//end class component_inverse
