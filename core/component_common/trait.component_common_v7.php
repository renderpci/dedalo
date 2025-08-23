<?php declare(strict_types=1);
/**
* CLASS COMPONENT_COMMON
* TRAIT component_common_v7
*
*/
trait component_common_v7 {



	// @V7 PROPERTIES //

	// array|null full_data. Component data value from DB column 'data->literals|relations->tipo'
	protected $full_data;

	// string data column name. E.g. 'relation'
	protected $data_column; // Override in each component



	/**
	* GET_DATA_COLUMN @v7
	* Reads the component class property 'data_column' value.
	* @return string
	*/
	public function get_data_column() : string {
		return $this->data_column;
	}//end get_data_column



	/**
	* GET_FULL_DATA @v7
	* It gets all the data from the component as the database is stored,
	* with all languages from the whole section data object.
	* E.g.
	* [{
	*    "key": 1,
	*    "lang": "lg-eng",
	*    "type": "dd750",
	*    "value": "Hello"
	* }]
	* @return array|null $this->data
	*/
	public function get_full_data() : ?array {

		$section = $this->get_my_section();
		$this->full_data = $this->full_data ?? $section->get_component_full_data( $this->tipo, $this->data_column );

		// dump($this->full_data, ' this->full_data ++ '.to_string("$this->tipo - $this->model - $this->data_column"));

		return $this->full_data;
	}//end get_full_data



	/**
	* GET_COMPONENT_DATA @v7
	* Load component full data from the section and gets only
	* the current lang portion of the data.
	* @param string $lang Language code to filter by
	* @return array|null $result Array of matching elements or null if none found
	*/
	public function get_component_data( string $lang ) : ?array {

		$this->full_data = $this->get_full_data();

		$result = [];
		foreach ($this->full_data ?? [] as $el) {
			if ($el->lang === $lang) {
				$result[] = $el->value;
			}
		}

		// It returns the result array if it is not empty. Otherwise, it returns null.
		return $result ?: null;
	}//end get_component_data



	/**
	* SET_COMPONENT_DATA @v7
	* Set the current lang portion of the data.
	* @param string $lang Language code to filter by
	* @return array|null $result Array of matching elements or null if none found
	*/
	public function set_component_data( string $lang, ?array $data ) : ?array {

		$this->full_data = $this->get_full_data();

		$clean_data = [];
		// Clean current lang from the current full data
		foreach ($this->full_data ?? [] as $el) {
			if ($el->lang !== $lang) {
				$clean_data[] = $el->value;
			}
		}

		// Add the new one if not empty
		if (!empty($data)) {
			foreach ($data as $value) {

				$item = (object)[
					'id'	=> 1,
					'lang'	=> $lang,
					'value' => $value
				];

				$clean_data[] = $item;
			}
		}

		// update $this->full_data. It sets the result array if it is not empty. Otherwise, it sets null.
		$this->full_data = $clean_data ?: null;


		return $this->full_data;
	}//end set_component_data



}//end component_common_v7