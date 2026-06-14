<?php declare(strict_types=1);
/**
* EXPORT_VALUE
*
* Result of component_common::get_export_value(): a flat list of
* export_atom items. Relation components merge the export_value of
* their resolved children, extending the atom paths with the
* traversed locator segment (item_index).
*
* to_flat_string() is the reference joiner used by the 'value' export
* format and by parity tests. It replicates the semantics of
* dd_grid_cell_object::resolve_value():
* - relation items (records) joined with the relation segment records_separator (' | ')
* - sibling fields inside one record joined with the relation segment fields_separator (', ')
* - leaf multi-values joined with the leaf segment fields_separator
* - empty() field/leaf values are skipped, empty record strings are kept
*   (bug-for-bug parity, including the empty('0') drop; do not "fix" here)
*/
class export_value implements JsonSerializable {



	/**
	 * List of export_atom
	 * @var array $atoms
	 */
	public array $atoms = [];

	/**
	 * Label of the producing component (root)
	 * @var ?string $label
	 */
	public ?string $label = null;

	/**
	 * Model of the producing component (e.g. 'component_input_text')
	 * @var ?string $model
	 */
	public ?string $model = null;



	/**
	* __CONSTRUCT
	* @param array $atoms = []
	* @param string|null $label = null
	* @param string|null $model = null
	*/
	public function __construct( array $atoms=[], ?string $label=null, ?string $model=null ) {

		$this->atoms	= $atoms;
		$this->label	= $label;
		$this->model	= $model;
	}//end __construct



	/**
	* ADD_ATOM
	* @param export_atom $atom
	* @return void
	*/
	public function add_atom( export_atom $atom ) : void {

		$this->atoms[] = $atom;
	}//end add_atom



	/**
	* MERGE
	* Append the atoms of another export_value (relation children)
	* @param export_value $other
	* @return void
	*/
	public function merge( export_value $other ) : void {

		foreach ($other->atoms as $atom) {
			$this->atoms[] = $atom;
		}
	}//end merge



	/**
	* FROM_SCALAR
	* Convenience factory for leaf components with a single value
	* @param array $path
	* 	list of export_path_segment
	* @param string|int|float|null $value
	* @param object|null $atom_options = null
	* 	Optional atom properties: cell_type, value_index, lang, is_fallback
	* @param string|null $label = null
	* @param string|null $model = null
	* @return export_value
	*/
	public static function from_scalar( array $path, string|int|float|null $value, ?object $atom_options=null, ?string $label=null, ?string $model=null ) : export_value {

		$atom = new export_atom($path, $value, $atom_options);

		return new export_value([$atom], $label, $model);
	}//end from_scalar



	/**
	* TO_FLAT_STRING
	* Flatten all atoms into a single string. Reference implementation
	* of the legacy dd_grid_cell_object::resolve_value() join semantics.
	* @return string
	*/
	public function to_flat_string() : string {

		if (empty($this->atoms)) {
			return '';
		}

		return self::join_atoms($this->atoms, 0, null, false);
	}//end to_flat_string



	/**
	* JOIN
	* Flatten an arbitrary atoms subset into a single string with the same
	* semantics as to_flat_string(). Used by the export tabulator to join
	* the atoms that land in one output cell.
	* @param array $atoms
	* 	list of export_atom
	* @return string
	*/
	public static function join( array $atoms ) : string {

		if (empty($atoms)) {
			return '';
		}

		return self::join_atoms($atoms, 0, null, false);
	}//end join



	/**
	* JOIN_ATOMS
	* Recursive joiner. All given atoms share the same path prefix [0..depth-1].
	* @param array $atoms
	* 	list of export_atom
	* @param int $depth
	* 	current path position to inspect
	* @param export_path_segment|null $parent_segment
	* 	the segment at depth-1 (the relation that contains the current level).
	* 	Its separators glue records and fields at this level.
	* @param bool $records_level_done
	* 	true once an indexed (relation item) level was already joined above.
	* 	Legacy parity: only the FIRST relation level joins its items with
	* 	records_separator (grid rows); deeper relation items became columns
	* 	(sub_columns_division) and joined with fields_separator.
	* @return string
	*/
	private static function join_atoms( array $atoms, int $depth, ?export_path_segment $parent_segment, bool $records_level_done ) : string {

		$records_separator	= $parent_segment->records_separator ?? ' | ';
		$fields_separator	= $parent_segment->fields_separator ?? ', ';

		// partition atoms by the item_index at this depth (record dimension).
		// null item_index (no relation traversed) collapses to a single record.
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
			$group_separator = ($has_index && $records_level_done)
				? $fields_separator
				: $records_separator;
			$next_records_level_done = $records_level_done || $has_index;

		$ar_records = [];
		foreach ($record_groups as $record_atoms) {

			// partition the record atoms by segment identity (field dimension)
			// preserving arrival order (ddo child order)
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

				// leaf values terminate at this depth, deeper atoms recurse
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

				// leaf case. Join the leaf own multi-values with the leaf fields_separator
				// skipping empty() values (resolve_value parity)
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

				// relation case. Recurse using the segment at this depth as parent
					if (!empty($deeper_atoms)) {
						$current_segment	= $deeper_atoms[0]->path[$depth];
						$field_string		= self::join_atoms($deeper_atoms, $depth+1, $current_segment, $next_records_level_done);
						if (!empty($field_string)) {
							$ar_fields[] = $field_string;
						}
					}
			}//end foreach ($field_groups as $field_atoms)

			// records are kept even when empty (resolve_value rows parity)
			$ar_records[] = implode($fields_separator, $ar_fields);
		}//end foreach ($record_groups as $record_atoms)

		// single record case does not add records glue
		return implode($group_separator, $ar_records);
	}//end join_atoms



	/**
	* JSONSERIALIZE
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
