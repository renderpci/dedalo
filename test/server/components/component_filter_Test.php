<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class component_filter_test extends BaseTestCase {



	public static $model		= 'component_filter';
	public static $tipo			= 'test101';
	public static $section_tipo	= 'test3';



	/**
	* BUILD_COMPONENT_INSTANCE
	* @return object
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



	/**
	* TEST_set_data
	* @return void
	*/
	public function test_set_data() {

		$component = $this->build_component_instance();

		$old_data = $component->get_data();

		// 1. Set null data
		$data	= null;
		$result	= $component->set_data($data);

		$this->assertTrue(
			gettype($result)==='boolean',
			'expected type boolean : ' . PHP_EOL
				. gettype($result)
		);

		if (security::is_global_admin(TEST_USER_ID)) {
			$this->assertTrue(
				$component->get_data()===null,
				'expected null : ' . PHP_EOL
					. to_string($component->get_data())
			);
		}else{
			$this->assertTrue(
				count($component->get_data())>0,
				'expected > 0 : ' . PHP_EOL
					. to_string($component->get_data()) . PHP_EOL
					. count($component->get_data())
			);
		}

		// 2. Restore old data
		$result	= $component->set_data($old_data);

		$this->assertTrue(
			json_encode($component->get_data())===json_encode($old_data),
			'expected old data : ' . PHP_EOL
				. to_string($component->get_data())
		);
	}//end test_set_data



	/**
	* TEST_get_data
	* @return void
	*/
	public function test_get_data() {

		$component = $this->build_component_instance();

		// 1. Set data

		$dample_data = json_decode('[
			{
				"id": 1,
				"type": "dd675",
				"section_id": "1",
				"section_tipo": "dd153",
				"from_component_tipo": "rsc338"
			},
			{
				"id": 2,
				"section_id": "7",
				"section_tipo": "dd153",
				"from_component_tipo": "rsc338"
			}
		]');
		// Set sample data
		$component->set_data($dample_data);

		$result	= $component->get_data();

		$this->assertTrue(
			gettype($result)==='array' || gettype($result)==='NULL',
			'expected type array|null : ' . PHP_EOL
				. gettype($result)
		);

		// 2 . Set null
		$data	= null;
		$result	= $component->set_data($data);

		$this->assertTrue(
			gettype($result)==='boolean',
			'expected type boolean : ' . PHP_EOL
				. gettype($result)
		);

		if (security::is_global_admin(TEST_USER_ID)) {
			$this->assertTrue(
				$component->get_data()===null,
				'expected null : ' . PHP_EOL
					. to_string($component->get_data())
			);
		}else{
			$this->assertTrue(
				count($component->get_data())>0,
				'expected > 0 : ' . PHP_EOL
					. to_string($component->get_data()) . PHP_EOL
					. count($component->get_data())
			);
		}
	}//end test_get_data



	/**
	* TEST_set_data_default
	* @return void
	*/
	public function test_set_data_default() {

		$this->user_login();

		// $component = $this->build_component_instance();
		$model			= self::$model;
		$tipo			= 'rsc98';
		$section_tipo	= 'rsc197';
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

		// empty data
		$component->set_data(null);

		// Using reflection to call protected method
		// $result	= $component->set_data_default();
		$reflection = new ReflectionClass($component);
		$method = $reflection->getMethod('set_data_default');
		$result	= $method->invoke($component);

		if (security::is_global_admin(TEST_USER_ID)) {
			$this->assertTrue(
				$result===true,
				'expected true : ' . PHP_EOL
					. $result
			);
		}else{
			$this->assertTrue(
				$result===false,
				'expected false (data not cleared) : ' . PHP_EOL
					. $result
			);
			// If false, we can't test the rest of this method effectively for default set
			return;
		}
		$this->assertTrue(
			gettype($component->get_data())==='array',
			'expected type array : ' . PHP_EOL
				. gettype($component->get_data())
		);
		$this->assertTrue(
			$component->get_data()[0]->section_tipo==='dd153',
			'expected section_tipo dd153 : ' . PHP_EOL
				. $component->get_data()[0]->section_tipo
		);
	}//end test_set_data_default



	/**
	* TEST_get_default_data_for_user
	* @return void
	*/
	public function test_get_default_data_for_user() {

		$this->user_login();

		// $component = $this->build_component_instance();
		$model			= self::$model;
		$tipo			= 'rsc98';
		$section_tipo	= 'rsc197';
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

		$result	= $component->get_default_data_for_user(
			1
		);

		$this->assertTrue(
			gettype($result)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($result)
		);

		$this->assertTrue(
			$result[0]->section_tipo==='dd153',
			'expected section_tipo dd153 : ' . PHP_EOL
				. $result[0]->section_tipo
		);
	}//end test_get_default_data_for_user



	/**
	* TEST_save
	* @return void
	*/
	public function test_save() {

		$this->user_login();

		$component = $this->build_component_instance();

		$result	= $component->save();

		$this->assertTrue(
			gettype($result)==='boolean',
			'expected type boolean : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_save



	/**
	* TEST_propagate_filter
	* @return void
	*/
	public function test_propagate_filter() {

		$component = $this->build_component_instance();

		$dample_data = json_decode('[
			{
				"id": 1,
				"type": "dd675",
				"section_id": "1",
				"section_tipo": "dd153",
				"from_component_tipo": "rsc338"
			},
			{
				"id": 2,
				"section_id": "7",
				"section_tipo": "dd153",
				"from_component_tipo": "rsc338"
			}
		]');
		// Set sample data
		$component->set_data($dample_data);

		$result	= $component->propagate_filter();

		$this->assertTrue(
			gettype($result)==='boolean',
			'expected type boolean : ' . PHP_EOL
				. gettype($result)
		);
		$this->assertTrue(
			$result===true,
			'expected true : ' . PHP_EOL
				. $result
		);
	}//end test_propagate_filter



	/**
	* TEST_get_grid_value
	* @return void
	*/
	public function test_get_grid_value() {

		$component = $this->build_component_instance();

		// 1. Get grid value
		$result	= $component->get_grid_value();

		$this->assertTrue(
			gettype($result)==='object',
			'expected type object : ' . PHP_EOL
				. gettype($result)
		);

		// 2. Get grid value with data
		$dample_data = json_decode('[
			{
				"id": 1,
				"type": "dd675",
				"section_id": "1",
				"section_tipo": "dd153",
				"from_component_tipo": "rsc338"
			},
			{
				"id": 2,
				"section_id": "7",
				"section_tipo": "dd153",
				"from_component_tipo": "rsc338"
			}
		]');
		// Set sample data
		$component->set_data($dample_data);
		$result	= $component->get_grid_value();

		$this->assertTrue(
			gettype($result)==='object',
			'expected type object : ' . PHP_EOL
				. gettype($result)
		);
		if (security::is_global_admin(TEST_USER_ID)) {
			$this->assertTrue(
				$result->row_count===2,
				'expected row_count 2 : ' . PHP_EOL
					. $result->row_count
			);
		}else{
			$this->assertTrue(
				$result->row_count>=2,
				'expected row_count >= 2 : ' . PHP_EOL
					. $result->row_count
			);
		}
		if (security::is_global_admin(TEST_USER_ID)) {
			$this->assertTrue(
				$result->column_count >= 0,
				'column_count: ' . $result->column_count . ' is less than 0'
			);
		}else{
			$this->assertTrue(
				$result->column_count===0 || $result->column_count===1,
				'expected column_count 0|1 : ' . PHP_EOL
					. $result->column_count
			);
		}
	}//end test_get_grid_value



	/**
	* TEST_get_datalist
	* @return void
	*/
	public function test_get_datalist() {

		$component = $this->build_component_instance();

		$result = $component->get_datalist();

		$this->assertTrue(
			gettype($result)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($result)
		);
		$this->assertTrue(
			gettype($result)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($result)
		);
		$this->assertTrue(
			gettype($result[0])==='object',
			'expected type object : ' . PHP_EOL
				. gettype($result[0])
		);
		$this->assertTrue(
			$result[0]->section_tipo==='dd153',
			'expected section_tipo dd153 : ' . PHP_EOL
				. $result[0]->section_tipo
		);
	}//end test_get_datalist



	/**
	* TEST_regenerate_component
	* @return void
	*/
	public function test_regenerate_component() {

		$component = $this->build_component_instance();

		$result = $component->regenerate_component();

		$this->assertTrue(
			gettype($result)==='boolean',
			'expected type boolean : ' . PHP_EOL
				. gettype($result)
		);
		$this->assertTrue(
			$result===true,
			'expected true : ' . PHP_EOL
				. to_string($result)
		);
	}//end test_regenerate_component



	/**
	* TEST_get_ar_target_section_tipo
	* @return void
	*/
	public function test_get_ar_target_section_tipo() {

		$component = $this->build_component_instance();

		$result = $component->get_ar_target_section_tipo();

		$this->assertTrue(
			gettype($result)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($result)
		);
		$this->assertTrue(
			$result===["dd153"],
			'expected ["dd153"] : ' . PHP_EOL
				. $result
		);
	}//end test_get_ar_target_section_tipo



	/**
	* TEST_get_sortable
	* @return void
	*/
	public function test_get_sortable() {

		$component = $this->build_component_instance();

		$result = $component->get_sortable();

		$this->assertTrue(
			$result===true,
			'expected true : ' . PHP_EOL
				. to_string($result)
		);
	}//end test_get_sortable



	/**
	* TEST_get_order_path
	* @return void
	*/
	public function test_get_order_path() {

		$component = $this->build_component_instance();

		$component_tipo	= self::$tipo;
		$section_tipo	= self::$section_tipo;

		$result = $component->get_order_path(
			$component_tipo,
			$section_tipo
		);

		// sample result
			// [
			//     {
			//         "component_tipo": "test101",
			//         "model": "component_filter",
			//         "name": "filter",
			//         "section_tipo": "test3"
			//     },
			//     {
			//         "component_tipo": "dd156",
			//         "model": "component_input_text",
			//         "name": "Proyecto (nombre)",
			//         "section_tipo": "dd153"
			//     }
			// ]

		$this->assertTrue(
			gettype($result)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($result)
		);

		if (!empty($result)) {
			$this->assertTrue(
				gettype($result[0])==='object',
				'expected type object : ' . PHP_EOL
					. gettype($result[0])
			);
		}
	}//end test_get_order_path



	/**
	* TEST_get_list_value
	* @return void
	*/
	public function test_get_list_value() {

		$component = $this->build_component_instance();

		$component_tipo	= self::$tipo;
		$section_tipo	= self::$section_tipo;

		$dample_data = json_decode('[
			{
				"id": 1,
				"type": "dd675",
				"section_id": "1",
				"section_tipo": "dd153",
				"from_component_tipo": "rsc338"
			},
			{
				"id": 2,
				"section_id": "7",
				"section_tipo": "dd153",
				"from_component_tipo": "rsc338"
			}
		]');
		// Set sample data
		$component->set_data($dample_data);

		$result = $component->get_list_value(
			$component_tipo,
			$section_tipo
		);

		// sample result:
			// [
			//     "Eleven",
			//     "Fourteen"
			// ]

		$this->assertTrue(
			gettype($result)==='array' || gettype($result)==='NULL',
			'expected type array|null : ' . PHP_EOL
				. gettype($result)
		);

		if (!empty($result)) {
			$this->assertTrue(
				gettype($result[0])==='string',
				'expected type string : ' . PHP_EOL
					. gettype($result[0])
			);
		}
	}//end test_get_list_value



	/**
	* TEST_update_data_version
	* @return void
	*/
	public function test_update_data_version() {

		$request_options = (object)[
			'update_version' => [1,0,0]
		];

		$result = component_filter::update_data_version($request_options);

		$this->assertTrue(
			is_object($result),
			'expected object'
		);
	}//end test_update_data_version



	/**
	* TEST_convert_dato_pre_490
	* @return void
	*/
	public function test_convert_dato_pre_490() {

		// 1. Old format
		$dato = (object)['1' => '2'];
		$from_component_tipo = 'test101';
		$result = component_filter::convert_dato_pre_490($dato, $from_component_tipo);

		$this->assertTrue(
			is_array($result),
			'expected array'
		);
		$this->assertTrue(
			$result[0]->section_id === "1",
			'expected section_id "1"'
		);

		// 2. New format
		$locator = new locator();
			$locator->set_section_tipo('dd153');
			$locator->set_section_id(1);
		$dato = [$locator];
		$result = component_filter::convert_dato_pre_490($dato, $from_component_tipo);

		$this->assertTrue(
			$result === $dato,
			'expected same dato'
		);
	}//end test_convert_dato_pre_490



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
				get_class($component)==='component_filter',
				'CREATE: expected class component_filter'
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
				'CREATE: expected lang DEDALO_DATA_NOLAN (filter is always nolan)'
			);

		// ADD DATA: add a filter locator (project 1)
			$component->set_data([]);
			$component->save();

			$locator_1 = new locator();
				$locator_1->set_section_tipo('dd153');
				$locator_1->set_section_id('1');
				$locator_1->set_type(DEDALO_RELATION_TYPE_FILTER);
				$locator_1->set_from_component_tipo(self::$tipo);

			$add_result = $component->add_locator_to_data($locator_1);
			$this->assertTrue(
				$add_result===true,
				'ADD: expected true on add_locator_to_data'
			);
			$component->save();

			$data = $component->get_data();
			$this->assertTrue(
				count($data)===1,
				'ADD: expected 1 element after add'
			);
			$this->assertTrue(
				$data[0]->section_id==='1',
				'ADD: expected section_id 1'
			);
			$this->assertTrue(
				$data[0]->section_tipo==='dd153',
				'ADD: expected section_tipo dd153'
			);

		// ADD MORE DATA: add a second filter locator (project 7)
			$locator_2 = new locator();
				$locator_2->set_section_tipo('dd153');
				$locator_2->set_section_id('7');
				$locator_2->set_type(DEDALO_RELATION_TYPE_FILTER);
				$locator_2->set_from_component_tipo(self::$tipo);

			$add_result_2 = $component->add_locator_to_data($locator_2);
			$this->assertTrue(
				$add_result_2===true,
				'ADD MORE: expected true on second add_locator_to_data'
			);
			$component->save();

			$data = $component->get_data();
			$this->assertTrue(
				count($data)===2,
				'ADD MORE: expected 2 elements after second add'
			);

		// CHANGE DATA: replace with single locator
			$locator_3 = new locator();
				$locator_3->set_section_tipo('dd153');
				$locator_3->set_section_id('2');
				$locator_3->set_type(DEDALO_RELATION_TYPE_FILTER);
				$locator_3->set_from_component_tipo(self::$tipo);

			$component->set_data([$locator_3]);
			$component->save();

			$data = $component->get_data();
			$this->assertTrue(
				count($data)===1,
				'CHANGE: expected 1 element after set_data'
			);
			$this->assertTrue(
				$data[0]->section_id==='2',
				'CHANGE: expected section_id 2 after change'
			);

		// REMOVE DATA: remove the locator
			$remove_result = $component->remove_locator_from_data($locator_3);
			$this->assertTrue(
				$remove_result===true,
				'REMOVE: expected true on remove_locator_from_data'
			);

			$data = $component->get_data();
			$this->assertTrue(
				empty($data),
				'REMOVE: expected empty data after remove'
			);
			$component->save();

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



}//end class component_filter_test
