<?php declare(strict_types=1);
/**
* EXPORT_PATH_SEGMENT
*
* One hop in the structured path of an export_atom.
* A path is the ordered list of segments from the exported section's
* top component down to the leaf component that produced the value.
*
* Column identity is derived from the path segments WITHOUT item_index:
* (section_tipo, component_tipo[, sub_id]) tuples. The item_index only
* records which relation item (locator position) was traversed, so the
* export tabulator can decide row/column explosion without any
* per-component knowledge.
*
* Replaces the legacy string-encoded column ids like
* "oh1_oh62_rsc197_rsc92|1" that had to be parsed back with explode().
*/
class export_path_segment implements JsonSerializable {



	/**
	 * Section tipo of the component at this hop
	 * @var string $section_tipo
	 */
	public string $section_tipo;

	/**
	 * Component tipo at this hop
	 * @var string $component_tipo
	 */
	public string $component_tipo;

	/**
	 * Component model at this hop (e.g. 'component_portal')
	 * @var ?string $model
	 */
	public ?string $model = null;

	/**
	 * 0 based position of the data item (locator) in the PARENT relation
	 * component data that led to this hop. Null when the hop was not
	 * reached through a relation item (root components).
	 * @var ?int $item_index
	 */
	public ?int $item_index = null;

	/**
	 * Resolved target record of the traversed locator (null at root)
	 * @var ?int $section_id
	 */
	public ?int $section_id = null;

	/**
	 * Non-ontology discriminator used when one component produces
	 * several columns that are not components themselves:
	 * component_info widget output id, component_inverse from-component pair.
	 * When set, label resolution uses it verbatim (no ontology lookup).
	 * @var ?string $sub_id
	 */
	public ?string $sub_id = null;

	/**
	 * Glue used to join field values at this depth. Default ', '
	 * For leaf segments it joins the leaf own multiple data items.
	 * @var ?string $fields_separator
	 */
	public ?string $fields_separator = null;

	/**
	 * Glue used to join record (relation item) values at this depth. Default ' | '
	 * @var ?string $records_separator
	 */
	public ?string $records_separator = null;



	/**
	* __CONSTRUCT
	* @param string $section_tipo
	* @param string $component_tipo
	* @param object|null $options = null
	* 	Optional properties: model, item_index, section_id, sub_id,
	* 	fields_separator, records_separator
	*/
	public function __construct( string $section_tipo, string $component_tipo, ?object $options=null ) {

		$this->section_tipo		= $section_tipo;
		$this->component_tipo	= $component_tipo;

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
	* Identity of this segment without the item_index dimension.
	* Used to build column identity (base key) across rows.
	* @return string
	*/
	public function get_identity_key() : string {

		$identity_key = $this->section_tipo . '_' . $this->component_tipo;

		if (isset($this->sub_id)) {
			$identity_key .= '#' . $this->sub_id;
		}

		return $identity_key;
	}//end get_identity_key



	/**
	* JSONSERIALIZE
	* Compact wire shape: null properties are omitted
	* @return array
	*/
	public function jsonSerialize() : array {

		$ar_properties = [];
		foreach (get_object_vars($this) as $key => $value) {
			if ($value!==null) {
				$ar_properties[$key] = $value;
			}
		}

		return $ar_properties;
	}//end jsonSerialize



}//end class export_path_segment
