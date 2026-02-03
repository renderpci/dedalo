<?php declare(strict_types=1);
include 'trait.search_component_section_id.php';
/**
* CLASS COMPONENT_SECTION_ID
* @note This component is read only dont't save or set data,
* is used only to show the id of the section, and perform queries into the database
* or export as a column in csv or spreadsheet files
*
* data_column_name : 'section_id'
*/
class component_section_id extends component_common {



	// traits. Files added to current class file to split the large code.
	use search_component_section_id;

	// Property to enable or disable the get and set data in different languages
	protected $supports_translation = false;



	/**
	* GET_DATA
	* @return array|null $data
	*/
	public function get_data() : ?array {

		$data = !empty($this->section_id)
			? (int)$this->section_id
			: null;

		return [$data];
	}//end get_data



	/**
	* GET_DATA_LANG
	* @return array|null $data
	*/
	public function get_data_lang( ?string $lang=null ) : ?array {

		$data = $this->get_data();

		return $data;
	}//end get_data_lang



	/**
	* SET_DATA
	* @override component_common set_data()
	* @note This component is read only dont't save or set data,
	* is used only to show the id of the section, and perform queries into the database
	* or export as a column in csv or spreadsheet files
	* @param int|null $data
	* @return bool
	*/
	public function set_data( ?array $data ) : bool {

		return true;
	}//end get_data



	/**
	* SAVE
	* @override component_common save()
	* Only used to catch common method here
	* @return bool
	*/
	public function save() : bool {

		debug_log(__METHOD__
			. " Ignored save command for component (component_section_id) "
			, logger::ERROR
		);

		return true;
	}//end save



	/**
	* GET_GRID_VALUE
	* Get the value of the components. By default will be get_data().
	* overwrite in every different specific component
	* The direct components can set the value with the dato directly
	* The relation components will separate the locator in rows
	* @param object|null $ddo = null
	* @return dd_grid_cell_object $value
	*/
	public function get_grid_value( ?object $ddo=null ) : dd_grid_cell_object {

		// column_obj
			$column_obj = $this->column_obj ?? (object)[
				'id' => $this->section_tipo.'_'.$this->tipo
			];

		$data	= $this->get_data();
		$label	= $this->get_label();

		// value
			$dd_grid_cell_object = new dd_grid_cell_object();
				$dd_grid_cell_object->set_type('column');
				$dd_grid_cell_object->set_label($label);
				$dd_grid_cell_object->set_cell_type('section_id');
				$dd_grid_cell_object->set_ar_columns_obj([$column_obj]);
				$dd_grid_cell_object->set_row_count(1);
				$dd_grid_cell_object->set_value($data[0]);
				$dd_grid_cell_object->set_model(get_called_class());


		return $dd_grid_cell_object;
	}//end get_grid_value



	/**
	* GET_TOOLS
	* @override component_common get_tools()
	* Catch get_tools call to prevent load tools sections
	* @return array $tools
	*/
	public function get_tools() : array {

		return [];
	}//end get_tools



	/**
	* GET_DIFFUSION_DATA
	* Resolve the default diffusion data
	* is used by the `diffusion_data`
	* for component_section_id the default is its own data
	* @param object $ddo
	* @return array $diffusion_data
	*
	* @see class.diffusion_data.php
	* @test false
	*/
	public function get_diffusion_data( object $ddo ) : array {

		$diffusion_data = [];

		$diffusion_data_object = new diffusion_data_object( (object)[
			'tipo'	=> $this->tipo,
			'lang'	=> null,
			'value'	=> $this->get_data(),
			'id'	=> $ddo->id ?? null
		]);

		$diffusion_data[] = $diffusion_data_object;

		return $diffusion_data;
	}//end get_diffusion_data



}//end class component_section_id
