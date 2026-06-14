<?php declare(strict_types=1);
/**
* CLASS EXPORT_VALUE
* Container for the structured export result of a single component call.
*
* Every call to component_common::get_export_value() returns one export_value
* instance holding a flat list of export_atom items. Each atom carries a
* full structured path (list of export_path_segment) describing precisely
* which section/component/relation-item chain produced the scalar value.
*
* Relation components (portals, relation_*, inverse, …) recursively call
* get_export_value() on each resolved child component and merge the returned
* export_value into their own via merge(). The child's atoms arrive with a
* path that already starts at the root (built up by export_context), so no
* re-wrapping is needed.
*
* Responsibilities:
* - Atom accumulation: add_atom() / merge() build the flat list.
* - Factory shortcut: from_scalar() wraps a single leaf value in one call.
* - Flat-string joining: to_flat_string() (and the static join() variant)
*   replicate the legacy dd_grid_cell_object::resolve_value() join semantics
*   so that the 'value' export format and parity tests agree with the grid.
*
* Join semantics (mirrored from resolve_value()):
* - Relation items (records) are joined with the relation segment's
*   records_separator, defaulting to ' | '.
* - Sibling fields within one record are joined with fields_separator,
*   defaulting to ', '.
* - Multiple data items produced by a single leaf component are joined with
*   the leaf segment's own fields_separator (also ', ' by default).
* - empty() field/leaf values are skipped; empty record strings are kept.
*   (!) This includes the PHP empty('0') === true quirk. Do not correct it
*   here — the goal is bug-for-bug parity with the legacy grid renderer.
*
* Data shape managed:
*   export_value { atoms: export_atom[], label: ?string, model: ?string }
*   export_atom  { path: export_path_segment[], value: scalar, … }
*
* Relationships:
* - Produced by component_common::get_export_value() (and every component override).
* - Consumed by the export tabulator (tool_export) and by
*   export_value_parity_Test.php parity tests.
* - Peer classes: export_atom, export_path_segment, export_context.
*
* @package Dédalo
* @subpackage Core
*/
class export_value implements JsonSerializable {



	/**
	 * Ordered flat list of export_atom instances produced by this component
	 * and any relation children it resolved. Atoms are appended in ddo child
	 * order, which the tabulator relies on for column ordering.
	 * @var array $atoms
	 */
	public array $atoms = [];

	/**
	 * Human-readable label of the root (outermost) producing component,
	 * resolved from the ontology term. Null when not needed (e.g. sub-results
	 * that will be merged into a parent export_value).
	 * @var ?string $label
	 */
	public ?string $label = null;

	/**
	 * PHP class name of the root producing component (e.g. 'component_input_text').
	 * Null when not needed. Used by the tabulator for cell-type decisions that
	 * cannot be derived from the atom path alone.
	 * @var ?string $model
	 */
	public ?string $model = null;



	/**
	* __CONSTRUCT
	* Initialises the export_value with an optional pre-built atom list and
	* root-component metadata. Most callers use from_scalar() for a single
	* leaf value or start with an empty instance and call add_atom()/merge().
	* @param array $atoms = [] - pre-built list of export_atom (default empty)
	* @param string|null $label = null - ontology label of the root component
	* @param string|null $model = null - PHP class name of the root component
	*/
	public function __construct( array $atoms=[], ?string $label=null, ?string $model=null ) {

		$this->atoms	= $atoms;
		$this->label	= $label;
		$this->model	= $model;
	}//end __construct



	/**
	* ADD_ATOM
	* Append one export_atom to the atom list. The insertion order must
	* match the ddo child order so that the tabulator can reconstruct
	* the original column sequence without extra sorting.
	* @param export_atom $atom - fully built atom (path + value)
	* @return void
	*/
	public function add_atom( export_atom $atom ) : void {

		$this->atoms[] = $atom;
	}//end add_atom



	/**
	* MERGE
	* Append all atoms from another export_value into this one, preserving
	* their order. Called by relation components after resolving each child
	* component: the child's export_value (already carrying the full path
	* from root to leaf, built via export_context) is merged here so the
	* parent accumulates a single flat atom list covering all fields across
	* all traversed relation records.
	* @param export_value $other - atoms to absorb (not modified)
	* @return void
	*/
	public function merge( export_value $other ) : void {

		foreach ($other->atoms as $atom) {
			$this->atoms[] = $atom;
		}
	}//end merge



	/**
	* FROM_SCALAR
	* Factory shortcut for leaf components that produce exactly one value.
	* Builds a single export_atom from the given path and value, wraps it in
	* a new export_value, and returns it in one call. Using this avoids the
	* repetitive new export_atom / new export_value / add_atom sequence.
	* Components that may produce multiple atoms (multi-lang, multi-value)
	* should build atoms individually and use add_atom() instead.
	* @param array $path - ordered list of export_path_segment, root first
	* @param string|int|float|null $value - the scalar leaf value
	* @param object|null $atom_options = null - optional atom metadata:
	*   cell_type, value_index, lang, is_fallback (see export_atom properties)
	* @param string|null $label = null - ontology label of the root component
	* @param string|null $model = null - PHP class name of the root component
	* @return export_value
	*/
	public static function from_scalar( array $path, string|int|float|null $value, ?object $atom_options=null, ?string $label=null, ?string $model=null ) : export_value {

		$atom = new export_atom($path, $value, $atom_options);

		return new export_value([$atom], $label, $model);
	}//end from_scalar



	/**
	* TO_FLAT_STRING
	* Flatten all atoms in this export_value into a single human-readable
	* string using the same join rules as the legacy grid renderer
	* dd_grid_cell_object::resolve_value().
	*
	* This is the reference implementation used by the 'value' export format
	* and by parity tests in export_value_parity_Test.php. The semantics are
	* intentionally identical to the legacy renderer — including the
	* empty('0') === true drop — so callers must not expect '0' in output.
	*
	* For joining an arbitrary atom subset (e.g. a single tabulator cell),
	* use the static join() method instead.
	* @return string - joined flat string, or '' when atoms is empty
	*/
	public function to_flat_string() : string {

		if (empty($this->atoms)) {
			return '';
		}

		return self::join_atoms($this->atoms, 0, null, false);
	}//end to_flat_string



	/**
	* JOIN
	* Flatten an arbitrary subset of export_atom instances into a single
	* string using the same join semantics as to_flat_string(). The static
	* form is used by the export tabulator (tool_export) which partitions the
	* full atom list into per-cell subsets (by base_key and/or index_vector)
	* before joining; it cannot call to_flat_string() because it works with
	* atom subsets rather than the full export_value.
	* @param array $atoms - list of export_atom to join
	* @return string - joined flat string, or '' when atoms is empty
	*/
	public static function join( array $atoms ) : string {

		if (empty($atoms)) {
			return '';
		}

		return self::join_atoms($atoms, 0, null, false);
	}//end join



	/**
	* JOIN_ATOMS
	* Recursive inner joiner implementing the two-dimensional grouping logic.
	* All atoms passed in share the same path prefix for positions [0..depth-1];
	* depth is the index of the next path segment to examine.
	*
	* At each recursion level the method performs two nested groupings:
	*   1. Record dimension — atoms are bucketed by item_index at this depth.
	*      item_index === null (no relation traversal) maps to a single virtual
	*      record (index_key -1). Buckets are sorted by item_index to preserve
	*      the original relation item order.
	*   2. Field dimension — within each record bucket, atoms are further bucketed
	*      by segment identity (section_tipo + component_tipo [+ sub_id]), keeping
	*      insertion order so ddo child order is respected.
	*
	* Termination: atoms whose path ends exactly at this depth are leaf values
	* and are joined directly with the leaf segment's fields_separator.
	* Atoms with deeper paths are sent back into a recursive call with depth+1.
	*
	* Legacy parity rule ($records_level_done):
	*   In the old dd_grid_cell_object::resolve_value() the FIRST indexed
	*   relation level used records_separator (' | ') to join its items (the
	*   visible grid rows); nested relation items had become sub-columns and
	*   were joined with fields_separator (', '). $records_level_done tracks
	*   whether an indexed level has already been encountered above the current
	*   recursion so the separator switch fires at the correct depth.
	* @param array $atoms - list of export_atom all sharing path[0..depth-1]
	* @param int $depth - path index to examine in this call
	* @param export_path_segment|null $parent_segment - segment at depth-1;
	*   provides the records_separator and fields_separator for THIS level.
	*   Null only at depth 0 (root call), in which case defaults apply.
	* @param bool $records_level_done - true when a relation-indexed level was
	*   already processed above; switches group glue from records_separator
	*   to fields_separator for all subsequent indexed levels
	* @return string
	*/
	private static function join_atoms( array $atoms, int $depth, ?export_path_segment $parent_segment, bool $records_level_done ) : string {

		// Separators come from the PARENT segment (the relation that surrounds
		// the current level), not from the atoms' own segment at this depth.
		// At depth 0 parent_segment is null and defaults apply.
		$records_separator	= $parent_segment->records_separator ?? ' | ';
		$fields_separator	= $parent_segment->fields_separator ?? ', ';

		// Record dimension: partition atoms by item_index at this depth.
		// item_index null (root components, or leaf atoms with no relation)
		// collapses into a single virtual record keyed as -1.
		// ksort() restores the original relation item order after array
		// accumulation may have interleaved atoms from different items.
			$record_groups	= [];
			$has_index		= false;
			foreach ($atoms as $atom) {
				$segment	= $atom->path[$depth] ?? null;
				$index_key	= ($segment!==null && $segment->item_index!==null)
					? $segment->item_index
					: -1;
				if ($index_key!==-1) {
					$has_index = true;
				}
				$record_groups[$index_key][] = $atom;
			}
			ksort($record_groups);

		// group glue (see $records_level_done doc)
		// If this is the first indexed level, items are 'rows' → records_separator.
		// If an indexed level was already processed above, items are 'sub-columns'
		// (sub_columns_division in the legacy grid) → fields_separator.
			$group_separator = ($has_index && $records_level_done)
				? $fields_separator
				: $records_separator;
			$next_records_level_done = $records_level_done || $has_index;

		$ar_records = [];
		foreach ($record_groups as $record_atoms) {

			// Field dimension: within this record bucket, group atoms by the
			// identity key of the segment at this depth (section_tipo +
			// component_tipo [+ sub_id]). PHP associative arrays preserve
			// insertion order, so ddo child order is naturally maintained.
			// An absent segment (atom path shorter than depth) uses '' as key,
			// keeping orphan atoms together.
				$field_groups = [];
				foreach ($record_atoms as $atom) {
					$segment	= $atom->path[$depth] ?? null;
					$field_key	= ($segment!==null)
						? $segment->get_identity_key()
						: '';
					if (!isset($field_groups[$field_key])) {
						$field_groups[$field_key] = [];
					}
					$field_groups[$field_key][] = $atom;
				}

			$ar_fields = [];
			foreach ($field_groups as $field_atoms) {

				// Split the field group into atoms that terminate at this depth
				// (leaf atoms: path length === depth+1) and atoms with deeper
				// paths (relation atoms that must recurse further).
				// A field group may theoretically contain both when a component
				// emits a value AND resolves children, but in practice leaf
				// components never have children and relation components never
				// emit their own scalar value.
					$leaf_values	= [];
					$deeper_atoms	= [];
					$leaf_segment	= null;
					foreach ($field_atoms as $atom) {
						if (sizeof($atom->path) === $depth+1) {
							$leaf_segment	= $atom->path[$depth];
							$leaf_values[]	= $atom->value;
						}else{
							$deeper_atoms[] = $atom;
						}
					}

				// Leaf case: join the leaf component's own multi-value items
				// (e.g. two input_text data items) with the leaf fields_separator.
				// (!) empty() values are skipped — including empty('0') === true.
				// This is intentional bug-for-bug parity with resolve_value().
					if (!empty($leaf_values)) {
						$leaf_separator = $leaf_segment->fields_separator ?? ', ';
						$ar_leaf_value	= [];
						foreach ($leaf_values as $current_value) {
							if (empty($current_value)) {
								continue;
							}
							$ar_leaf_value[] = is_string($current_value)
								? $current_value
								: (string)$current_value;
						}
						$leaf_string = implode($leaf_separator, $ar_leaf_value);
						if (!empty($leaf_string)) {
							$ar_fields[] = $leaf_string;
						}
					}

				// Relation case: recurse with depth+1, passing the current
				// depth's segment as the new parent_segment so the next level
				// reads the correct records_separator / fields_separator.
				// $next_records_level_done propagates whether an indexed
				// (relation item) level has already been seen.
					if (!empty($deeper_atoms)) {
						$current_segment	= $deeper_atoms[0]->path[$depth];
						$field_string		= self::join_atoms($deeper_atoms, $depth+1, $current_segment, $next_records_level_done);
						if (!empty($field_string)) {
							$ar_fields[] = $field_string;
						}
					}
			}//end foreach ($field_groups as $field_atoms)

			// Records (relation items) are always kept even when the joined
			// string is empty — this matches resolve_value() row parity where
			// an empty row still occupies a slot in the records_separator join,
			// so the count of ' | ' separators stays consistent with row count.
			$ar_records[] = implode($fields_separator, $ar_fields);
		}//end foreach ($record_groups as $record_atoms)

		// When there is only one record group the group_separator is never
		// inserted, so the records_separator / fields_separator distinction
		// has no visible effect at this level.
		return implode($group_separator, $ar_records);
	}//end join_atoms



	/**
	* JSONSERIALIZE
	* Wire shape for JSON encoding. Always emits all three properties so
	* consumers can rely on their presence without isset() guards.
	* The atoms array elements implement JsonSerializable themselves
	* (export_atom::jsonSerialize) and are encoded recursively by json_encode.
	* @return array
	*/
	public function jsonSerialize() : array {

		return [
			'atoms'	=> $this->atoms,
			'label'	=> $this->label,
			'model'	=> $this->model
		];
	}//end jsonSerialize



}//end class export_value
