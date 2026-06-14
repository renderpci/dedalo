<?php declare(strict_types=1);
/**
* EXPORT_ATOM
*
* One scalar leaf value of the export contract, together with the
* structured path describing exactly where it came from.
*
* Atoms are the only thing components return from get_export_value():
* there is no nesting and no polymorphic value (string vs row vs column).
* The export tabulator consumes atoms with zero per-model knowledge:
* column identity, breakdown explosion (rows/columns/default), joining
* and labels are all derivable from the path.
*/
class export_atom implements JsonSerializable {



	/**
	 * Ordered list of export_path_segment, root first.
	 * The last segment is the leaf component that produced the value.
	 * @var array $path
	 */
	public array $path = [];

	/**
	 * SCALAR ONLY. Components json_encode arrays/objects themselves
	 * (JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)
	 * @var string|int|float|null $value
	 */
	public string|int|float|null $value = null;

	/**
	 * Rendering type, reusing the dd_grid vocabulary:
	 * 'text' | 'img' | 'av' | 'iri' | 'section_id' | 'json'
	 * @var string $cell_type
	 */
	public string $cell_type = 'text';

	/**
	 * Index of the data item inside the LEAF component when the leaf
	 * itself is multi-value (e.g. second input_text value => 1)
	 * @var ?int $value_index
	 */
	public ?int $value_index = null;

	/**
	 * Lang of the value. Null = nolan
	 * @var ?string $lang
	 */
	public ?string $lang = null;

	/**
	 * True when the value was taken from a fallback lang because the
	 * main lang was empty. The flat joiner uses fallback values as-is.
	 * @var bool $is_fallback
	 */
	public bool $is_fallback = false;



	/**
	* __CONSTRUCT
	* @param array $path
	* 	list of export_path_segment, root first
	* @param string|int|float|null $value
	* @param object|null $options = null
	* 	Optional properties: cell_type, value_index, lang, is_fallback
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
	* Column identity of this atom: the path identities without any
	* item_index dimension, joined with '.'
	* Two atoms with the same base_key belong to the same base column.
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
	* Ordered list of the item_index values present in the path
	* (one entry per traversed relation item, root first).
	* Empty array when the atom was not reached through any relation.
	* @return array
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
	* @return export_path_segment|null
	*/
	public function get_leaf_segment() : ?export_path_segment {

		$len = sizeof($this->path);

		return $len > 0
			? $this->path[$len-1]
			: null;
	}//end get_leaf_segment



	/**
	* JSONSERIALIZE
	* @return array
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
