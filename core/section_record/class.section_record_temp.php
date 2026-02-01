<?php declare(strict_types=1);
/**
* SECTION_RECORD_TEMP
* Specialized section_record for handling temporal records stored in the 'temp' table.
*/
class section_record_temp extends section_record {

	/**
	* __CONSTRUCT
	* Overrides the parent constructor to set the data handler to matrix_temp_manager.
	*/
	protected function __construct( string $section_tipo, int $section_id ) {
		// Call parent constructor
		parent::__construct($section_tipo, $section_id);

		// Force the data handler to matrix_temp_manager
		$this->data_handler = 'matrix_temp_manager';
	}

	/**
	* GET_COMPONENT_DATA
	* Temporal records always load data from the temp table handler.
	*/
	public function get_component_data( string $tipo, string $column ) : ?array {
		// Load the DB data once
		$this->load_data();
		return $this->data_instance->get_key_data( $column, $tipo );
	}

	/**
	* SAVE
	* Saves the record to the temporal table.
	*/
	public function save() : bool {
		$section_tipo = $this->section_tipo;
		$section_id = $this->section_id;

		$table = $this->get_table();
		$data = $this->data_instance->get_data();

		$result = matrix_temp_manager::update(
			$table,
			$section_tipo,
			$section_id,
			$data
		);

		return $result;
	}

	/**
	* DELETE
	* Removes the record from the temporal table.
	*/
	public function delete( bool $delete_diffusion_records=true ) : bool {
		$section_tipo = $this->section_tipo;
		$section_id = $this->section_id;

		$table = $this->get_table();
		$result = matrix_temp_manager::delete(
			$table,
			$section_tipo,
			$section_id
		);

		if ($result) {
			$this->record_in_the_database = false;
			$this->is_loaded_data = false;
			unset($this->data_instance);
			
			$cache_key = $section_tipo .'_' .$section_id . '_temp';
			section_record_instances_cache::delete($cache_key);
		}

		return $result;
	}


	/**
	* GET_TABLE
	* Returns the full table object
	* @return string $this->table
	*/
	public function get_table() : string {

		return 'temp';
	}//end get_table


}
