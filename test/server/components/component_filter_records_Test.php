<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class component_filter_records_test extends BaseTestCase {



	public static $model		= 'component_filter_records';
	public static $tipo			= 'test69';
	public static $section_tipo	= 'test3';



	/**
	* BUILD_COMPONENT_INSTANCE
	* @return object component_filter_records
	*/
	private function build_component_instance() : object {

		$this->user_login();

		$model			= self::$model;
		$tipo			= self::$tipo;
		$section_tipo	= self::$section_tipo;
		$section_id		= 1;
		$mode			= 'edit';
		$lang			= DEDALO_DATA_NOLAN;

		$component = component_common::get_instance(
			$model, // string model
			$tipo, // string tipo
			$section_id,
			$mode,
			$lang,
			$section_tipo
		);

		return $component;
	}//end build_component_instance



	/////////// ⬇︎ test start ⬇︎ ////////////////



	/**
	* TEST_get_data
	* @return void
	*/
	public function test_get_data() {

		$component = $this->build_component_instance();

		$result	= $component->get_data();

		$this->assertTrue(
			gettype($result)==='array' || gettype($result)==='NULL',
			'expected type array|null : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_data



	/**
	* TEST_set_data
	* @return void
	*/
	public function test_set_data() {

		$component = $this->build_component_instance();

		$old_dato = $component->get_data();

		// 1. Set null
		$dato	= null;
		$result	= $component->set_data($dato);

		$this->assertTrue(
			gettype($result)==='boolean',
			'expected type boolean : ' . PHP_EOL
				. gettype($result)
		);

		$this->assertTrue(
			$component->get_data()===NULL,
			'expected NULL : ' . PHP_EOL
				. to_string($component->get_data())
		);

		// 2. Set sample data (filter_records format: array of {id, tipo, value})
		$dample_data = json_decode('[
			{
				"id": 1,
				"tipo": "rsc167",
				"value": [1, 5, 8]
			},
			{
				"id": 2,
				"tipo": "rsc202",
				"value": [3, 7]
			}
		]');
		$result	= $component->set_data($dample_data);

		$this->assertTrue(
			gettype($result)==='boolean',
			'expected type boolean on set sample data : ' . PHP_EOL
				. gettype($result)
		);

		$data = $component->get_data();
		$this->assertTrue(
			is_array($data),
			'expected array after set sample data'
		);
		$this->assertTrue(
			count($data)===2,
			'expected 2 entries after set sample data : ' . PHP_EOL
				. count($data)
		);
		$this->assertTrue(
			property_exists($data[0], 'tipo') && property_exists($data[0], 'value'),
			'expected tipo and value properties in data entry'
		);

		// 3. Restore original data
		$result	= $component->set_data($old_dato);

		$this->assertTrue(
			json_encode($component->get_data())===json_encode($old_dato),
			'expected original data restored : ' . PHP_EOL
				. to_string($component->get_data())
		);
	}//end test_set_data



	/**
	* TEST_set_data_empty
	* @return void
	*/
	public function test_set_data_empty() {

		$component = $this->build_component_instance();

		$old_dato = $component->get_data();

		// set empty array
		$result	= $component->set_data([]);

		$this->assertTrue(
			gettype($result)==='boolean',
			'expected type boolean : ' . PHP_EOL
				. gettype($result)
		);

		$data = $component->get_data();
		$this->assertTrue(
			is_array($data) || is_null($data),
			'expected array|null after set empty data'
		);

		// restore
		$component->set_data($old_dato);
	}//end test_set_data_empty



	/**
	* TEST_save_and_reload
	* @return void
	*/
	public function test_save_and_reload() {

		$component = $this->build_component_instance();

		$old_dato = $component->get_data();

		// set new data
		$new_data = json_decode('[
			{
				"id": 1,
				"tipo": "rsc167",
				"value": [10, 20, 30]
			}
		]');
		$component->set_data($new_data);

		// save
		$save_result = $component->save();
		$this->assertTrue(
			$save_result===true,
			'expected true on save'
		);

		// reload fresh instance
		$fresh = $this->build_component_instance();
		$fresh_data = $fresh->get_data();

		$this->assertTrue(
			is_array($fresh_data),
			'expected array after reload'
		);
		$this->assertTrue(
			count($fresh_data)===1,
			'expected 1 entry after reload'
		);
		$this->assertTrue(
			$fresh_data[0]->tipo==='rsc167',
			'expected tipo rsc167 after reload'
		);

		// restore original
		$component->set_data($old_dato);
		$component->save();
	}//end test_save_and_reload



	/**
	* TEST_get_datalist
	* @return void
	*/
	public function test_get_datalist() {

		$component = $this->build_component_instance();

		$result = $component->get_datalist();

		$this->assertTrue(
			is_array($result),
			'expected array'
		);

		if (!empty($result)) {
			$this->assertTrue(
				is_object($result[0]),
				'expected object'
			);
			$this->assertTrue(
				property_exists($result[0], 'tipo') && property_exists($result[0], 'label'),
				'expected tipo and label properties'
			);
			$this->assertTrue(
				property_exists($result[0], 'permissions'),
				'expected permissions property'
			);
		}
	}//end test_get_datalist



	/**
	* TEST_get_grid_value
	* @return void
	*/
	public function test_get_grid_value() {

		$component = $this->build_component_instance();

		$result = $component->get_grid_value();

		$this->assertTrue(
			get_class($result)==='dd_grid_cell_object',
			'expected dd_grid_cell_object'
		);
	}//end test_get_grid_value



	/**
	* TEST_get_list_value
	* @return void
	*/
	public function test_get_list_value() {

		$component = $this->build_component_instance();

		$result = $component->get_list_value();

		$this->assertTrue(
			is_array($result) || is_null($result),
			'expected array or null'
		);
	}//end test_get_list_value



	/**
	* TEST_update_data_version
	* @return void
	*/
	public function test_update_data_version() {

		$request_options = (object)[
			'update_version' => [1,0,0]
		];

		$result = component_filter_records::update_data_version($request_options);

		$this->assertTrue(
			is_object($result),
			'expected object'
		);
	}//end test_update_data_version



	/**
	* TEST_save
	* @return void
	*/
	public function test_save() {

		$component = $this->build_component_instance();

		$result = $component->save();

		$this->assertTrue(
			$result,
			'expected true on save'
		);
	}//end test_save



	/**
	* TEST_component_instance_modes
	* Verify component can be instantiated in edit, list, and search modes
	* @return void
	*/
	public function test_component_instance_modes() {

		$modes = ['edit', 'list', 'search'];

		foreach ($modes as $mode) {

			$this->user_login();

			$component = component_common::get_instance(
				self::$model,
				self::$tipo,
				1,
				$mode,
				DEDALO_DATA_NOLAN,
				self::$section_tipo
			);

			$this->assertTrue(
				get_class($component)==='component_filter_records',
				"expected class component_filter_records in {$mode} mode"
			);
			$this->assertTrue(
				$component->get_mode()===$mode,
				"expected mode {$mode}"
			);
		}
	}//end test_component_instance_modes



	/**
	* TEST_is_empty
	* @return void
	*/
	public function test_is_empty() {

		$component = $this->build_component_instance();

		// is_empty_data checks array-level emptiness
		$data = $component->get_data();

		if (empty($data)) {
			$this->assertTrue(
				$component->is_empty_data($data)===true,
				'expected is_empty_data true for empty data'
			);
		} else {
			$this->assertTrue(
				$component->is_empty_data($data)===false,
				'expected is_empty_data false for non-empty data'
			);
		}

		// is_empty with null data_item
		$this->assertTrue(
			$component->is_empty(null)===true,
			'expected is_empty true for null data_item'
		);
	}//end test_is_empty



	/**
	* TEST_get_identifier
	* @return void
	*/
	public function test_get_identifier() {

		$component = $this->build_component_instance();

		$result = $component->get_identifier();

		$this->assertTrue(
			gettype($result)==='string',
			'expected string identifier : ' . PHP_EOL
				. gettype($result)
		);
		$this->assertTrue(
			str_contains($result, self::$tipo),
			'expected tipo in identifier : ' . PHP_EOL
				. $result
		);
	}//end test_get_identifier



	/**
	* TEST_supports_translation
	* Verify that filter_records does not support translation via reflection
	* (supports_translation is a protected property)
	* @return void
	*/
	public function test_supports_translation() {

		$component = $this->build_component_instance();

		$reflection = new ReflectionClass($component);
		$property = $reflection->getProperty('supports_translation');
		$property->setAccessible(true);
		$value = $property->getValue($component);

		$this->assertTrue(
			$value===false,
			'expected supports_translation false for filter_records'
		);
	}//end test_supports_translation



	/**
	* TEST_LIFECYCLE_CREATE_ADD_CHANGE_REMOVE_DESTROY
	* Full lifecycle: create → add data → change data → remove data → verify clean state
	* @return void
	*/
	public function test_lifecycle_create_add_change_remove_destroy() {

		// CREATE: instantiate the component
			$component = $this->build_component_instance();
			$original_data = $component->get_data();

			$this->assertTrue(
				get_class($component)==='component_filter_records',
				'CREATE: expected class component_filter_records'
			);
			$this->assertTrue(
				$component->get_tipo()===self::$tipo,
				'CREATE: expected tipo '.self::$tipo
			);
			$this->assertTrue(
				$component->get_section_tipo()===self::$section_tipo,
				'CREATE: expected section_tipo '.self::$section_tipo
			);
			$this->assertTrue(
				$component->get_lang()===DEDALO_DATA_NOLAN,
				'CREATE: expected lang DEDALO_DATA_NOLAN (filter_records is always nolan)'
			);

		// ADD DATA: set data with one entry
			$component->set_data([]);
			$component->save();

			$entry_1 = (object)[
				'tipo' => 'rsc167',
				'value' => [1, 5, 8]
			];
			$component->set_data([$entry_1]);
			$component->save();

			$data = $component->get_data();
			$this->assertTrue(
				count($data)===1,
				'ADD: expected 1 element after add'
			);
			$this->assertTrue(
				$data[0]->tipo==='rsc167',
				'ADD: expected tipo rsc167'
			);
			$this->assertTrue(
				$data[0]->value===[1, 5, 8] || json_encode($data[0]->value)===json_encode([1,5,8]),
				'ADD: expected value [1,5,8]'
			);

		// ADD MORE DATA: add a second entry
			$entry_2 = (object)[
				'tipo' => 'rsc202',
				'value' => [3, 7]
			];
			$component->set_data([$entry_1, $entry_2]);
			$component->save();

			$data = $component->get_data();
			$this->assertTrue(
				count($data)===2,
				'ADD MORE: expected 2 elements after second add'
			);

		// CHANGE DATA: replace with single entry
			$entry_3 = (object)[
				'tipo' => 'oh1',
				'value' => [10, 20]
			];
			$component->set_data([$entry_3]);
			$component->save();

			$data = $component->get_data();
			$this->assertTrue(
				count($data)===1,
				'CHANGE: expected 1 element after set_data'
			);
			$this->assertTrue(
				$data[0]->tipo==='oh1',
				'CHANGE: expected tipo oh1 after change'
			);

		// REMOVE DATA: set empty
			$component->set_data(null);
			$component->save();

			$data = $component->get_data();
			$this->assertTrue(
				empty($data),
				'REMOVE: expected empty data after set null'
			);

		// VERIFY CLEAN STATE: fresh instance should have no data
			$fresh = $this->build_component_instance();
			$fresh_data = $fresh->get_data();
			$this->assertTrue(
				empty($fresh_data),
				'DESTROY: expected empty data on fresh instance after cleanup'
			);

		// RESTORE original data
			$component->set_data($original_data);
			$component->save();
	}//end test_lifecycle_create_add_change_remove_destroy



}//end class component_filter_records_test
