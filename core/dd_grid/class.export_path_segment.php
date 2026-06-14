<?php declare(strict_types=1);
/**
* CLASS EXPORT_PATH_SEGMENT
* One hop in the structured path of an export_atom.
*
* A path is the ordered list of segments from the exported section's
* top component down to the leaf component that produced the value.
* The root segment represents the first selected component (e.g. a relation
* portal), and each deeper segment represents a traversed child component.
*
* Responsibilities:
* - Carry the ontology identity (section_tipo + component_tipo) of one hop.
* - Record the model name so callers can render or label the hop without
*   rebuilding the component.
* - Carry sub_id for components that emit several virtual columns from a
*   single component instance (component_info widget output id,
*   component_inverse from-component pair). When sub_id is set, label
*   resolution uses it verbatim; no ontology lookup is done.
* - Record the item_index (0-based locator position in the PARENT relation
*   data) and section_id of the traversed locator, so the export tabulator
*   can explode relation items into rows or columns without any per-model
*   knowledge.
* - Carry optional separator overrides (fields_separator, records_separator)
*   that let individual ddo entries override the default join glue at this
*   depth.
*
* Column identity is derived from the path segments WITHOUT item_index:
* (section_tipo, component_tipo[, sub_id]) tuples — see get_identity_key().
* The item_index dimension is intentionally excluded from the column key so
* that atoms belonging to the same column but different relation items share
* one base_key and can be exploded by the tabulator into rows or columns.
*
* Replaces the legacy string-encoded column ids like
* "oh1_oh62_rsc197_rsc92|1" that had to be parsed back with explode().
*
* Used by: export_atom::$path (ordered list of segments, root first),
*           export_context (path_prefix propagation during recursion),
*           export_tabulator (column identity + breakdown explosion).
*
* @package Dédalo
* @subpackage Core
*/
class export_path_segment implements JsonSerializable {



	/**
	 * Ontology tipo of the section that owns the component at this hop.
	 * Together with $component_tipo it uniquely locates the component in the
	 * ontology tree and drives label resolution.
	 * @var string $section_tipo
	 */
	public string $section_tipo;

	/**
	 * Ontology tipo of the component at this hop.
	 * Paired with $section_tipo to form the column identity key (see get_identity_key()).
	 * @var string $component_tipo
	 */
	public string $component_tipo;

	/**
	 * PHP class name (model) of the component at this hop, e.g. 'component_portal'.
	 * Stored so the tabulator and label resolver can branch on component type
	 * without rebuilding the component instance.
	 * @var ?string $model
	 */
	public ?string $model = null;

	/**
	 * 0-based position of the data item (locator) in the PARENT relation
	 * component data that led to this hop. Null when the hop was not
	 * reached through a relation item (root components).
	 * Intentionally excluded from get_identity_key() — the export tabulator
	 * uses the index vector to explode sibling atoms into rows or suffixed columns.
	 * @var ?int $item_index
	 */
	public ?int $item_index = null;

	/**
	 * section_id (record id) of the target record reached via the traversed locator.
	 * Null at the root level (no locator was traversed).
	 * Informational: it ends up in the segment for provenance tracking but does
	 * not affect column identity.
	 * @var ?int $section_id
	 */
	public ?int $section_id = null;

	/**
	 * Non-ontology discriminator used when one component produces several virtual
	 * columns that are not themselves distinct components:
	 * - component_info: widget output id (e.g. 'dates', 'duration')
	 * - component_inverse: the from-component tipo that generated the back-reference
	 * When set, label resolution uses sub_id verbatim (no ontology lookup).
	 * Included in get_identity_key() with a '#' separator to keep virtual columns
	 * distinct from each other.
	 * @var ?string $sub_id
	 */
	public ?string $sub_id = null;

	/**
	 * Glue used to join multiple field values (data items) at this depth.
	 * Null means "use the tabulator default" (', ').
	 * For leaf segments this joins the leaf's own multi-value items.
	 * Sourced from the ddo entry for this component in the export configuration.
	 * @var ?string $fields_separator
	 */
	public ?string $fields_separator = null;

	/**
	 * Glue used to join values coming from different relation items (records)
	 * at this depth when breakdown=default collapses them.
	 * Null means "use the tabulator default" (' | ').
	 * Sourced from the ddo entry for this component in the export configuration.
	 * @var ?string $records_separator
	 */
	public ?string $records_separator = null;



	/**
	* __CONSTRUCT
	* Creates one path segment for a component hop in an export atom path.
	*
	* The two mandatory arguments identify the ontology position of the component.
	* All other fields (model, item_index, section_id, sub_id, separators) are
	* passed via the $options object so callers only supply what is relevant.
	* Unknown keys in $options are silently ignored via property_exists() guard,
	* keeping the API forward-compatible as new fields are added.
	* @param string $section_tipo - ontology tipo of the section owning this component
	* @param string $component_tipo - ontology tipo of the component at this hop
	* @param ?object $options = null - optional property bag; recognized keys:
	*   model (string), item_index (int), section_id (int), sub_id (string),
	*   fields_separator (string), records_separator (string)
	*/
	public function __construct( string $section_tipo, string $component_tipo, ?object $options=null ) {

		$this->section_tipo		= $section_tipo;
		$this->component_tipo	= $component_tipo;

		// Apply optional overrides
		// property_exists() guard prevents injection of arbitrary properties
		// from untrusted callers while remaining forward-compatible with new fields.
		if (is_object($options)) {
			foreach ($options as $key => $value) {
				if (property_exists($this, $key)) {
					$this->$key = $value;
				}
			}
		}
	}//end __construct



	/**
	* GET_IDENTITY_KEY
	* Returns the stable column identity of this hop, excluding item_index.
	*
	* The key is built as: "{section_tipo}_{component_tipo}" and, when a sub_id
	* is present, "#sub_id" is appended to distinguish virtual sub-columns
	* produced by a single component instance (e.g. component_info widget outputs,
	* component_inverse back-references).
	*
	* The '#' separator was chosen because it cannot appear in ontology tipos,
	* making it unambiguous. The item_index (relation locator position) is
	* deliberately excluded: atoms sharing this key but carrying different
	* item_index values all belong to the same export column — the tabulator
	* collects them and decides whether to explode into rows or suffixed columns
	* based on the breakdown mode and the full index vector.
	*
	* Called by export_atom::get_base_key() to build the atom's full column key
	* (all segment identity keys joined with '.').
	* @return string - e.g. "oh1_oh62", "oh1_oh62#dates"
	*/
	public function get_identity_key() : string {

		$identity_key = $this->section_tipo . '_' . $this->component_tipo;

		// Append sub_id with '#' separator when one component emits multiple
		// virtual columns (component_info, component_inverse).
		// isset() rather than !==null is used here; both are equivalent for
		// non-nullable string, but isset() reads as intent-to-check presence.
		if (isset($this->sub_id)) {
			$identity_key .= '#' . $this->sub_id;
		}

		return $identity_key;
	}//end get_identity_key



	/**
	* JSONSERIALIZE
	* Produces the compact wire representation of this segment for json_encode().
	*
	* Null properties are omitted to minimise payload size; only the two
	* mandatory fields (section_tipo, component_tipo) are always present.
	* The consumer (export_tabulator, flat_table.js) must treat all optional
	* keys as absent when not present in the JSON object.
	*
	* Wire shape (all keys optional except the first two):
	*   { section_tipo, component_tipo [, model] [, item_index] [, section_id]
	*     [, sub_id] [, fields_separator] [, records_separator] }
	*
	* (!) This method is part of the JsonSerializable contract. It is called
	* automatically by json_encode() when export_atom::$path is serialized;
	* do not call it directly.
	* @return array - associative array of non-null properties
	*/
	public function jsonSerialize() : array {

		$ar_properties = [];
		// Omit null values to keep the wire payload compact.
		// get_object_vars() returns only declared properties in declaration order,
		// which matches the logical reading order (tipo identity first).
		foreach (get_object_vars($this) as $key => $value) {
			if ($value!==null) {
				$ar_properties[$key] = $value;
			}
		}

		return $ar_properties;
	}//end jsonSerialize



}//end class export_path_segment
