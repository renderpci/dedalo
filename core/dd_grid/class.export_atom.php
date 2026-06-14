<?php declare(strict_types=1);
/**
* CLASS EXPORT_ATOM
* One scalar leaf value of the export contract, together with the
* structured path that records exactly where the value came from.
*
* Atoms are the exclusive currency of get_export_value(): components
* never return nested trees or polymorphic shapes — every produced value
* becomes one or more export_atom instances collected inside an
* export_value. The export tabulator (tool_export / flat_table.js) can
* therefore consume atoms with zero per-component knowledge:
*
* - Column identity is derived from path segment identities (section_tipo
*   + component_tipo + optional sub_id), independent of the row dimension.
* - Breakdown explosion (rows / columns / default) is controlled by the
*   item_index chain in the path — the tabulator never inspects model names.
* - Cell type, value_index, lang, and is_fallback carry all the metadata
*   needed to render, join, and order values.
*
* Relation components do NOT emit atoms themselves; they descend into their
* resolved children (via export_context::descend()), prepend their own
* path segment with the traversed item_index, and merge the child
* export_value atoms. Only leaf components produce actual atom values.
*
* Implements JsonSerializable so atoms can be wire-serialized compactly:
* null properties that carry no information are omitted by jsonSerialize().
*
* Related classes:
* - export_path_segment — one hop in the path
* - export_value        — flat list of atoms + label/model metadata
* - export_context      — per-call traversal context passed to get_export_value()
*
* @package Dédalo
* @subpackage Core
*/
class export_atom implements JsonSerializable {



	/**
	 * Ordered list of export_path_segment objects, root first.
	 * The first segment is the top component of the exported section; the
	 * last segment is the leaf component that actually produced $value.
	 * Intermediate segments represent relation hops, each carrying the
	 * item_index of the locator traversed at that level.
	 * @var array $path
	 */
	public array $path = [];

	/**
	 * The exported leaf value. Always scalar (string, int, float, or null).
	 * Components that hold array/object data JSON-encode that data themselves
	 * before storing it here (using JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES).
	 * Null means the component had no value for this slot.
	 * @var string|int|float|null $value
	 */
	public string|int|float|null $value = null;

	/**
	 * Rendering hint, reusing the dd_grid cell vocabulary.
	 * Known values: 'text' | 'img' | 'av' | 'iri' | 'section_id' | 'json'
	 * The flat_table.js renderer and the NDJSON tabulator use this to decide
	 * how to display or serialize the value. Defaults to 'text'.
	 * @var string $cell_type
	 */
	public string $cell_type = 'text';

	/**
	 * 0-based index of the data item within the LEAF component when the
	 * leaf itself stores multiple data items (e.g. the second value of a
	 * multi-value component_input_text => 1). Null for single-value leaves.
	 * Distinct from item_index in path segments, which tracks relation hops
	 * rather than intra-component positions.
	 * @var ?int $value_index
	 */
	public ?int $value_index = null;

	/**
	 * Language code for the value (e.g. 'lg-spa', 'lg-cat').
	 * Null means the component is not language-sensitive (nolan), so the
	 * value applies regardless of the active language. Set by translatable
	 * components (component_input_text, component_text_area, etc.) when they
	 * produce one atom per stored language variant.
	 * @var ?string $lang
	 */
	public ?string $lang = null;

	/**
	 * True when $value was sourced from a secondary/fallback language because
	 * the requested primary language was empty for this component. The flat
	 * joiner (export_value::join_atoms) uses fallback values as-is without
	 * any special handling; this flag is preserved in serialized output so
	 * clients can optionally style or suppress fallback cells.
	 * @var bool $is_fallback
	 */
	public bool $is_fallback = false;



	/**
	* __CONSTRUCT
	* Builds an atom from its mandatory path + value pair and any optional
	* metadata supplied as a plain object. Only property names that exist on
	* the class are applied from $options — unknown keys are silently ignored,
	* so callers can pass a superset object without risk.
	* @param array $path - ordered list of export_path_segment, root first
	* @param string|int|float|null $value - the scalar leaf value
	* @param ?object $options = null - optional overrides: cell_type, value_index, lang, is_fallback
	*/
	public function __construct( array $path, string|int|float|null $value, ?object $options=null ) {

		$this->path		= $path;
		$this->value	= $value;

		if (is_object($options)) {
			foreach ($options as $key => $value) {
				if (property_exists($this, $key)) {
					$this->$key = $value;
				}
			}
		}
	}//end __construct



	/**
	* GET_BASE_KEY
	* Column identity of this atom: the identity key of every path segment
	* (section_tipo + component_tipo + optional sub_id), joined with '.'.
	* The item_index dimension is intentionally excluded so that atoms from
	* different relation items (rows) that share structural provenance yield
	* the same base_key and therefore land in the same base column.
	* Two atoms with equal base_key but different index vectors belong to
	* the same column header, and the tabulator assigns them to rows or
	* sub-columns based on the breakdown strategy.
	* @return string
	*/
	public function get_base_key() : string {

		$ar_identity = array_map(function($segment){
			return $segment->get_identity_key();
		}, $this->path);

		return implode('.', $ar_identity);
	}//end get_base_key



	/**
	* GET_INDEX_VECTOR
	* Returns the ordered list of item_index values present in the path,
	* root first (one entry per relation hop that carried a non-null
	* item_index). Each entry corresponds to the 0-based locator position
	* that was traversed at that depth.
	* Returns an empty array when the atom was produced by a root (non-
	* relation) component, i.e. the path contains no indexed hops.
	* The tabulator uses the index vector to decide whether to expand
	* relation items as rows or as sub-columns (breakdown strategy).
	* @return array - list of int, one entry per relation hop, root first
	*/
	public function get_index_vector() : array {

		$index_vector = [];
		foreach ($this->path as $segment) {
			if ($segment->item_index!==null) {
				$index_vector[] = $segment->item_index;
			}
		}

		return $index_vector;
	}//end get_index_vector



	/**
	* GET_LEAF_SEGMENT
	* Convenience accessor for the last segment in the path — the segment
	* of the component that actually produced $value. Returns null only when
	* the path is empty, which should not occur for a well-formed atom.
	* The leaf segment carries the fields_separator used by the flat joiner
	* to join multiple values from the same leaf component.
	* @return ?export_path_segment - last path segment, or null for an empty path
	*/
	public function get_leaf_segment() : ?export_path_segment {

		$len = sizeof($this->path);

		return $len > 0
			? $this->path[$len-1]
			: null;
	}//end get_leaf_segment



	/**
	* JSONSERIALIZE
	* Compact wire representation for JSON encoding. The three mandatory
	* fields (path, value, cell_type) are always present. Optional fields
	* (value_index, lang, is_fallback) are included only when they carry
	* information (non-null, or true for the bool), keeping the wire payload
	* small for the common case of simple leaf atoms.
	* @return array - associative array ready for json_encode()
	*/
	public function jsonSerialize() : array {

		$ar_properties = [
			'path'		=> $this->path,
			'value'		=> $this->value,
			'cell_type'	=> $this->cell_type
		];

		if ($this->value_index!==null)	$ar_properties['value_index']	= $this->value_index;
		if ($this->lang!==null)			$ar_properties['lang']			= $this->lang;
		if ($this->is_fallback===true)	$ar_properties['is_fallback']	= true;

		return $ar_properties;
	}//end jsonSerialize



}//end class export_atom
