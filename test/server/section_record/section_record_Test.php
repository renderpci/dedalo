<?php declare(strict_types=1);
// bootstrap
require_once dirname(__FILE__, 2) . '/bootstrap.php';



final class section_record_test extends BaseTestCase {


	// static $last_section_id;

	public $table = 'matrix_test';
	public $section_tipo = 'test65';
	public $section_id = 1;

	private static int $baseline_section_id = 0;

	/**
	* SETUP_BEFORE_CLASS
	* Store baseline max section_id to allow cleanup after all tests.
	*/
	public static function setUpBeforeClass(): void {
		parent::setUpBeforeClass();
		$conn = DBi::_getConnection();
		$result = pg_query_params(
			$conn,
			'SELECT COALESCE(MAX(section_id), 0) FROM matrix_test WHERE section_tipo = $1',
			['test65']
		);
		self::$baseline_section_id = (int) pg_fetch_result($result, 0, 0);
	}

	/**
	* TEARDOWN_AFTER_CLASS
	* Delete all records created during these tests.
	*/
	public static function tearDownAfterClass(): void {
		$conn = DBi::_getConnection();
		pg_query_params(
			$conn,
			'DELETE FROM matrix_test WHERE section_tipo = $1 AND section_id > $2',
			['test65', self::$baseline_section_id]
		);
		parent::tearDownAfterClass();
	}

	/**
	* GET_COUNTER_VALUE
	* @param string $section_tipo
	* @return int $count_value
	*/
	protected function get_counter_value( string $section_tipo ) : int {

		// counter
		$sql = 'SELECT * FROM matrix_counter WHERE tipo = $1';
		$pg_result = pg_query_params(DBi::_getConnection(), $sql, [$section_tipo]);
		$row = pg_fetch_assoc($pg_result);
		$count_value = (int)$row['value'];

		return $count_value;
	}//end get_counter_value



	/**
	* TEST_USER_LOGIN
	* @return void
	*/
	public function test_user_login() {

		$user_id = TEST_USER_ID; // Defined in bootstrap

		if (login::is_logged()===false) {
			login_test::force_login($user_id);
		}

		$this->assertTrue(
			login::is_logged()===true ,
			'expected login true'
		);
	}//end test_user_login



	/**
	* TEST_GET_INSTANCE
	* @return void
	*/
	public function test_get_instance() {

		// Create a new record in database
		$result = matrix_db_manager::create(
			$this->table,
			$this->section_tipo
		);
		$section_id = (int)$result;


		// 1 - Get instance
		$instance = section_record::get_instance(
			$this->section_tipo,
			$section_id
		);

		// the instance is an object
		$eq = gettype($instance) === 'object';
		$this->assertTrue(
			$eq,
			'expected true (object)' . PHP_EOL
				.'result type: ' . gettype($instance) . PHP_EOL
				.'result: ' . to_string($instance)
		);
		// the isntances is from class section_record
		$this->assertInstanceOf(section_record::class, $instance);


		// 2 - Get instance again to check if it is the same object (cached)
		$instance2 = section_record::get_instance(
			$this->section_tipo,
			$section_id
		);

		// the isntances are the same object
		$this->assertSame($instance, $instance2);


		// 3 - Invalidate cache
		$cache_key = "{$this->section_tipo}_{$section_id}";
		section_record_instances_cache::delete(
			$cache_key
		);


		// 4 - Get instance again to check if it is the same object (cached)
		$instance3 = section_record::get_instance(
			$this->section_tipo,
			$section_id
		);

		// the isntances are the same object
		$this->assertNotSame($instance, $instance3);


		// 5 - Get instance again to check if it is the same object (cached)
		$instance4 = section_record::get_instance(
			$this->section_tipo,
			$section_id
		);


		// the isntances are the same object
		$this->assertSame($instance3, $instance4);

	}//end test_get_instance



	/**
	* TEST_GET_DATA
	* @return void
	*/
	public function test_get_data() {

		// Create a new record in database
		$section = section::get_instance(
			$this->section_tipo
		);
		$result = $section->create_record((object)[
			'values' => (object)[
				'relation' => (object)[
					'test37' => [(object)[
						'section_tipo' => 'test65',
						'section_id' => 1,
						'type' => 'dd151',
						'id' => 1
					]]
				]
			]
		]);
		$section_id = (int)$result;


		// 1 - Get data
		$instance = section_record::get_instance(
			$this->section_tipo,
			$section_id
		);

		$data = $instance->get_data();

		// the data is an object
		$eq = gettype($data) === 'object';
		$this->assertTrue(
			$eq,
			'expected true (object)' . PHP_EOL
				.'result type: ' . gettype($data) . PHP_EOL
				.'result: ' . to_string($data)
		);

		// the data is from class stdClass
		$this->assertInstanceOf(stdClass::class, $data);

		// check data value
		$eq = $data->relation->test37[0]->section_tipo === 'test65';
		$this->assertTrue(
			$eq,
			'expected $data->relation->test37[0]->section_tipo = test65' . PHP_EOL
				.'result: ' . to_string($data)
		);

		// check data value
		$eq = $data->relation->test37[0]->section_id === 1;
		$this->assertTrue(
			$eq,
			'expected $data->relation->test37[0]->section_id = 1' . PHP_EOL
				.'result: ' . to_string($data)
		);

		// check data value
		$eq = $data->relation->test37[0]->type === 'dd151';
		$this->assertTrue(
			$eq,
			'expected $data->relation->test37[0]->type = dd151' . PHP_EOL
				.'result: ' . to_string($data)
		);

		// check data value
		$eq = $data->relation->test37[0]->id === 1;
		$this->assertTrue(
			$eq,
			'expected $data->relation->test37[0]->id = 1' . PHP_EOL
				.'result: ' . to_string($data)
		);


		// 2 - Change data
		$instance->set_component_data('test37', 'relation', [
			(object)[
				'section_tipo' => 'test65',
				'section_id' => 2,
				'type' => 'dd151',
				'id' => 1
			]
		]);

		$data = $instance->get_data();

		// check data value after the change
		$eq = $data->relation->test37[0]->section_id === 2;
		$this->assertTrue(
			$eq,
			'expected $data->relation->test37[0]->section_id = 2' . PHP_EOL
				.'result: ' . to_string($data)
		);
	}//end test_get_data



	/**
	* TEST_save
	* @return void
	*/
	public function test_save() {

		// Create a new record in database
		$section = section::get_instance(
			$this->section_tipo
		);
		$result = $section->create_record((object)[
			'values' => (object)[
				'relation' => (object)[
					'test37' => [(object)[
						'section_tipo' => 'test65',
						'section_id' => 1,
						'type' => 'dd151',
						'id' => 1
					]]
				]
			]
		]);
		$section_id = (int)$result;

		// get data
		$instance = section_record::get_instance(
			$this->section_tipo,
			$section_id
		);
		$data = $instance->get_data();

		// change data
		$instance->set_component_data('test37', 'relation', [
			(object)[
				'section_tipo' => 'test65',
				'section_id' => 999,
				'type' => 'dd151',
				'id' => 1
			]
		]);

		$data = $instance->get_data();

		// save
		$result = $instance->save();

		// check result
		$eq = $result === true;
		$this->assertTrue(
			$eq,
			'expected $result = true' . PHP_EOL
				.'result: ' . to_string($result)
		);

		// check data value after the change
		$eq = $data->relation->test37[0]->section_id === 999;
		$this->assertTrue(
			$eq,
			'expected $data->relation->test37[0]->section_id = 999' . PHP_EOL
				.'result: ' . to_string($data)
		);

		// remove the instance (this calls __destruct too)
		unset($instance);

		// new fresh instance forces to db load again
		$instance2 = section_record::get_instance(
			$this->section_tipo,
			$section_id
		);
		$data2 = $instance2->get_data();

		// check data value after the change
		$eq = $data2->relation->test37[0]->section_id === 999;
		$this->assertTrue(
			$eq,
			'expected $data2->relation->test37[0]->section_id = 999' . PHP_EOL
				.'result: ' . to_string($data2)
		);

		// remove the instance (this calls __destruct too)
		unset($instance2);

	}//end test_save



	/**
	* TEST_save_column
	* @return void
	*/
	public function test_save_column() {

		// Create a new record in database
		$section = section::get_instance(
			$this->section_tipo
		);
		$result = $section->create_record((object)[
			'values' => (object)[
				'relation' => (object)[
					'test37' => [(object)[
						'section_tipo' => 'test65',
						'section_id' => 1,
						'type' => 'dd151',
						'id' => 1
					]]
				]
			]
		]);
		$section_id = (int)$result;

		// get data
		$instance = section_record::get_instance(
			$this->section_tipo,
			$section_id
		);
		$data = $instance->get_data();

		// save column
		$value = (object)[
			'test37' => [(object)[
				'section_tipo' => 'test65',
				'section_id' => 777,
				'type' => 'dd151',
				'id' => 1
			]]
		];
		$result = $instance->save_column('relation', $value);

		// check result
		$eq = $result === true;
		$this->assertTrue(
			$eq,
			'expected $result = true' . PHP_EOL
				.'result: ' . to_string($result)
		);

		// check data value after the change
		$eq = $data->relation->test37[0]->section_id === 777;
		$this->assertTrue(
			$eq,
			'expected $data->relation->test37[0]->section_id = 777' . PHP_EOL
				.'result: ' . to_string($data)
		);

		// remove the instance (this calls __destruct too)
		unset($instance);

		// new fresh instance forces to db load again
		$instance2 = section_record::get_instance(
			$this->section_tipo,
			$section_id
		);
		$data2 = $instance2->get_data();

		// check data value after the change
		$eq = $data2->relation->test37[0]->section_id === 777;
		$this->assertTrue(
			$eq,
			'expected $data2->relation->test37[0]->section_id = 777' . PHP_EOL
				.'result: ' . to_string($data2)
		);

		// remove the instance (this calls __destruct too)
		unset($instance2);

	}//end test_save_column



	/**
	* TEST_create
	* Tests the static create method for creating new section records
	* @return void
	*/
	public function test_create() {

		// TEST 1: Create record without initial values
		$section = section::get_instance(
			$this->section_tipo
		);
		$result = $section->create_record();
		$section_id = (int)$result;

		$section_record = section_record::get_instance(
			$this->section_tipo,
			$section_id
		);

		// Verify instance is returned
		$this->assertInstanceOf(section_record::class, $section_record);

		// Verify record exists in database
		$this->assertTrue(
			$section_record->exists_in_the_database(),
			'expected record to exist in database after creation'
		);

		// Get section_id for further tests
		$section_id = $section_record->section_id;
		$this->assertGreaterThan(0, $section_id);


		// TEST 2: Create record with initial values
		$initial_values = (object)[
			'relation' => (object)[
				'test37' => [(object)[
					'section_tipo' => 'test65',
					'section_id' => 1,
					'type' => 'dd151',
					'id' => 1
				]]
			],
			'string' => (object)[
				'test159' => [(object)[
					'value' => 'test value',
					'lang' => 'lg-nolan',
					'id' => 1
				]]
			]
		];

		$section2 = section::get_instance(
			$this->section_tipo
		);
		$result = $section2->create_record(
			(object)[
				'values' => $initial_values
			]
		);
		$section_id = (int)$result;

		$section_record2 = section_record::get_instance(
			$this->section_tipo,
			$section_id
		);

		$this->assertInstanceOf(section_record::class, $section_record2);

		// Verify initial values were set
		$data = $section_record2->get_data();
		$this->assertEquals('test65', $data->relation->test37[0]->section_tipo);
		$this->assertEquals('test value', $data->string->test159[0]->value);

		// Clean up
		unset($section_record, $section_record2);

	}//end test_create



	/**
	* TEST_exists_in_the_database
	* Tests the exists_in_the_database method
	* @return void
	*/
	public function test_exists_in_the_database() {

		// TEST 1: Existing record
		$section = section::get_instance(
			$this->section_tipo
		);
		$result = $section->create_record();
		$section_id = (int)$result;

		$instance = section_record::get_instance(
			$this->section_tipo,
			$section_id
		);

		$this->assertTrue(
			$instance->exists_in_the_database(),
			'expected existing record to return true'
		);


		// TEST 2: Non-existing record (high section_id)
		$instance2 = section_record::get_instance(
			$this->section_tipo,
			999999
		);

		$this->assertFalse(
			$instance2->exists_in_the_database(),
			'expected non-existing record to return false'
		);

		// Clean up
		unset($instance, $instance2);

	}//end test_exists_in_the_database



	/**
	* TEST_set_data
	* Tests the set_data method for assigning complete record data
	* @return void
	*/
	public function test_set_data() {

		// Create a new record
		$section = section::get_instance(
			$this->section_tipo
		);
		$result = $section->create_record((object)[
			'values' => (object)[
				'relation' => (object)[
					'test37' => [(object)[
						'section_tipo' => 'test65',
						'section_id' => 1,
						'type' => 'dd151',
						'id' => 1
					]]
				]
			]
		]);
		$section_id = (int)$result;

		$instance = section_record::get_instance(
			$this->section_tipo,
			$section_id
		);

		// TEST 1: Set new data
		$new_data = (object)[
			'relation' => (object)[
				'test37' => [(object)[
					'section_tipo' => 'test65',
					'section_id' => 999,
					'type' => 'dd151',
					'id' => 1
				]],
				'test81' => [(object)[
					'section_tipo' => 'test65',
					'section_id' => 888,
					'type' => 'dd151',
					'id' => 1
				]]
			],
			'string' => (object)[
				'test159' => [(object)[
					'value' => 'new value',
					'lang' => 'lg-nolan',
					'id' => 1
				]]
			]
		];

		$result = $instance->set_data($new_data);
		$this->assertTrue($result, 'expected set_data to return true');

		// Verify data was set in memory
		$data = $instance->get_data();
		$this->assertEquals(999, $data->relation->test37[0]->section_id);
		$this->assertEquals(888, $data->relation->test81[0]->section_id);
		$this->assertEquals('new value', $data->string->test159[0]->value);

		// TEST 2: Save and verify persistence
		$instance->save();
		unset($instance);

		$instance2 = section_record::get_instance(
			$this->section_tipo,
			$section_id
		);
		$data2 = $instance2->get_data();

		$this->assertEquals(999, $data2->relation->test37[0]->section_id);
		$this->assertEquals('new value', $data2->string->test159[0]->value);

		// Clean up
		unset($instance2);

	}//end test_set_data



	/**
	* TEST_get_component_data
	* Tests retrieving component-specific data
	* @return void
	*/
	public function test_get_component_data() {

		// Create record with component data
		$section = section::get_instance(
			$this->section_tipo
		);
		$result = $section->create_record((object)[
			'values' => (object)[
				'relation' => (object)[
					'test37' => [(object)[
						'section_tipo' => 'test65',
						'section_id' => 123,
						'type' => 'dd151',
						'id' => 1
					]]
				],
				'string' => (object)[
					'test159' => [(object)[
						'value' => 'component value',
						'lang' => 'lg-nolan',
						'id' => 1
					]]
				]
			]
		]);
		$section_id = (int)$result;

		$instance = section_record::get_instance(
			$this->section_tipo,
			$section_id
		);

		// TEST 1: Get existing component data
		$component_data = $instance->get_component_data('test37', 'relation');

		$this->assertIsArray($component_data);
		$this->assertCount(1, $component_data);
		$this->assertEquals('test65', $component_data[0]->section_tipo);
		$this->assertEquals(123, $component_data[0]->section_id);

		// TEST 2: Get component from different column
		$string_data = $instance->get_component_data('test159', 'string');

		$this->assertIsArray($string_data);
		$this->assertEquals('component value', $string_data[0]->value);

		// TEST 3: Get non-existing component
		$empty_data = $instance->get_component_data('test99', 'relation');

		$this->assertNull($empty_data);

		// Clean up
		unset($instance);

	}//end test_get_component_data



	/**
	* TEST_save_component_data
	* Tests saving component data with automatic metadata updates
	* @return void
	*/
	public function test_save_component_data() {

		// Create record
		$section = section::get_instance(
			$this->section_tipo
		);
		$result = $section->create_record((object)[
			'values' => (object)[
				'relation' => (object)[
					'test37' => [(object)[
						'section_tipo' => 'test65',
						'section_id' => 1,
						'type' => 'dd151',
						'id' => 1
					]]
				]
			]
		]);
		$section_id = (int)$result;

		$instance = section_record::get_instance(
			$this->section_tipo,
			$section_id
		);

		// TEST 1: Save component data
		$instance->set_component_data('test37', 'relation', [
			(object)[
				'section_tipo' => 'test65',
				'section_id' => 456,
				'type' => 'dd151',
				'id' => 1
			]
		]);

		$data_to_save = [
			(object)[
				'column' => 'relation',
				'key' => 'test37'
			]
		];

		$result = $instance->save_component_data($data_to_save);

		$this->assertTrue($result, 'expected save_component_data to return true');

		// Verify data was saved
		$data = $instance->get_data();
		$this->assertEquals(456, $data->relation->test37[0]->section_id);

		// TEST 2: Verify persistence
		unset($instance);

		$instance2 = section_record::get_instance(
			$this->section_tipo,
			$section_id
		);
		$data2 = $instance2->get_data();

		$this->assertEquals(456, $data2->relation->test37[0]->section_id);

		// Clean up
		unset($instance2);

	}//end test_save_component_data



	/**
	* TEST_delete_data
	* Tests emptying all component data while keeping the record
	* @return void
	*/
	public function test_delete_data() {

		// Create record with multiple components
		$section = section::get_instance(
			$this->section_tipo
		);
		$result = $section->create_record((object)[
			'values' => (object)[
				'relation' => (object)[
					'test37' => [(object)[
						'section_tipo' => 'test65',
						'section_id' => '1',
						'type' => 'dd151',
						'id' => 1
					]]
				],
				'string' => (object)[
					'test159' => [(object)[
						'value' => 'test value',
						'lang' => 'lg-nolan',
						'id' => 1
					]]
				]
			]
		]);
		$section_id = (int)$result;

		$instance = section_record::get_instance(
			$this->section_tipo,
			$section_id
		);

		// Verify data exists
		$data_before = $instance->get_data();
		$this->assertObjectHasProperty('relation', $data_before);
		$this->assertObjectHasProperty('string', $data_before);

		// TEST 1: Delete all data
		$result = $instance->delete_data();

		$this->assertTrue($result, 'expected delete_data to return true');

		// TEST 2: Verify record still exists but data is empty
		$this->assertTrue(
			$instance->exists_in_the_database(),
			'expected record to still exist after delete_data'
		);

		// Reload instance to get fresh data
		unset($instance);
		$instance2 = section_record::get_instance(
			$this->section_tipo,
			$section_id
		);

		$data_after = $instance2->get_data();

		// Components should be empty or not set
		$test37_data = $instance2->get_component_data('test37', 'relation');
		$test159_data = $instance2->get_component_data('test159', 'string');

		$this->assertTrue(
			empty($test37_data) || $test37_data === null,
			'expected test37 to be empty after delete_data'
		);
		$this->assertTrue(
			empty($test159_data) || $test159_data === null,
			'expected test159 to be empty after delete_data'
		);

		// Clean up
		unset($instance2);

	}//end test_delete_data



	/**
	* TEST_component_counters
	* Tests getting and setting component counters
	* @return void
	*/
	public function test_component_counters() {

		// Create record
		$section = section::get_instance(
			$this->section_tipo
		);
		$result = $section->create_record();
		$section_id = (int)$result;

		$instance = section_record::get_instance(
			$this->section_tipo,
			$section_id
		);

		$test_tipo = 'test37';

		// TEST 1: Get initial counter (should be 0)
		$counter = $instance->get_component_counter($test_tipo);

		$this->assertEquals(0, $counter, 'expected initial counter to be 0');

		// TEST 2: Set counter to a value
		$new_counter = $instance->set_component_counter($test_tipo, 5);

		$this->assertEquals(5, $new_counter, 'expected counter to be set to 5');

		// TEST 3: Get counter again to verify
		$counter2 = $instance->get_component_counter($test_tipo);

		$this->assertEquals(5, $counter2, 'expected counter to remain 5');

		// TEST 4: Increment counter
		$incremented = $instance->set_component_counter($test_tipo, 10);

		$this->assertEquals(10, $incremented);

		// TEST 5: Verify persistence (reload from database)
		unset($instance);

		$instance2 = section_record::get_instance(
			$this->section_tipo,
			$section_id
		);

		$counter3 = $instance2->get_component_counter($test_tipo);

		$this->assertEquals(10, $counter3, 'expected counter to persist after reload');

		// Clean up
		unset($instance2);

	}//end test_component_counters



	/**
	* TEST_save_key_data
	* Tests the save_key_data method which saves one or more component keys
	* using the matrix_db_manager::update_by_key mechanism
	* @return void
	*/
	public function test_save_key_data() {

		// Create a new record in database with initial data
		$section = section::get_instance(
			$this->section_tipo
		);
		$result = $section->create_record((object)[
			'values' => (object)[
				'relation' => (object)[
					'test37' => [(object)[
						'section_tipo' => 'test65',
						'section_id' => 1,
						'type' => 'dd151',
						'id' => 1
					]],
					'test81' => [(object)[
						'section_tipo' => 'test65',
						'section_id' => 10,
						'type' => 'dd151',
						'id' => 1
					]]
				],
				'string' => (object)[
					'test159' => [(object)[
						'value' => 'initial value',
						'lang' => 'lg-nolan',
						'id' => 1
					]]
				]
			]
		]);
		$section_id = (int)$result;

		// Get instance
		$instance = section_record::get_instance(
			$this->section_tipo,
			$section_id
		);

		// TEST 1: Save a single key in a column
		// Update test37 in relation column
		$data_to_save = [
			(object)[
				'column' => 'relation',
				'key' => 'test37'
			]
		];

		// First set the data in memory
		$instance->set_component_data('test37', 'relation', [
			(object)[
				'section_tipo' => 'test65',
				'section_id' => 555,
				'type' => 'dd151',
				'id' => 1
			]
		]);

		// Save using save_key_data
		$result = $instance->save_key_data($data_to_save);

		// Check result is true
		$this->assertTrue(
			$result,
			'expected save_key_data to return true' . PHP_EOL
				.'result: ' . to_string($result)
		);

		// Verify data was saved correctly
		$data = $instance->get_data();
		$eq = $data->relation->test37[0]->section_id === 555;
		$this->assertTrue(
			$eq,
			'expected $data->relation->test37[0]->section_id = 555' . PHP_EOL
				.'result: ' . to_string($data->relation->test37[0]->section_id)
		);

		// Verify test81 was not affected
		$eq = $data->relation->test81[0]->section_id === 10;
		$this->assertTrue(
			$eq,
			'expected $data->relation->test81[0]->section_id = 10 (unchanged)' . PHP_EOL
				.'result: ' . to_string($data->relation->test81[0]->section_id)
		);


		// TEST 2: Save multiple keys in the same column
		// Update both test37 and test81 in relation column
		$instance->set_component_data('test37', 'relation', [
			(object)[
				'section_tipo' => 'test65',
				'section_id' => 111,
				'type' => 'dd151',
				'id' => 1
			]
		]);

		$instance->set_component_data('test81', 'relation', [
			(object)[
				'section_tipo' => 'test65',
				'section_id' => 222,
				'type' => 'dd151',
				'id' => 1
			]
		]);

		$data_to_save = [
			(object)[
				'column' => 'relation',
				'key' => 'test37'
			],
			(object)[
				'column' => 'relation',
				'key' => 'test81'
			]
		];

		$result = $instance->save_key_data($data_to_save);

		$this->assertTrue($result, 'expected save_key_data to return true for multiple keys');

		// Verify both were saved
		$data = $instance->get_data();
		$this->assertEquals(111, $data->relation->test37[0]->section_id);
		$this->assertEquals(222, $data->relation->test81[0]->section_id);


		// TEST 3: Save keys across multiple columns
		// Update relation and string columns
		$instance->set_component_data('test37', 'relation', [
			(object)[
				'section_tipo' => 'test65',
				'section_id' => 333,
				'type' => 'dd151',
				'id' => 1
			]
		]);

		$instance->set_component_data('test159', 'string', [
			(object)[
				'value' => 'updated value',
				'lang' => 'lg-nolan',
				'id' => 1
			]
		]);

		$data_to_save = [
			(object)[
				'column' => 'relation',
				'key' => 'test37'
			],
			(object)[
				'column' => 'string',
				'key' => 'test159'
			]
		];

		$result = $instance->save_key_data($data_to_save);

		$this->assertTrue($result, 'expected save_key_data to return true for multiple columns');

		// Verify both columns were saved
		$data = $instance->get_data();
		$this->assertEquals(333, $data->relation->test37[0]->section_id);
		$this->assertEquals('updated value', $data->string->test159[0]->value);


		// TEST 4: Handle null values (column deletion)
		// Set test159 to null to trigger column deletion logic
		$instance->set_component_data('test159', 'string', null);

		$data_to_save = [
			(object)[
				'column' => 'string',
				'key' => 'test159'
			]
		];

		$result = $instance->save_key_data($data_to_save);

		$this->assertTrue($result, 'expected save_key_data to return true for null value');

		// Verify the key was removed
		$data = $instance->get_data();
		$this->assertFalse(
			isset($data->string->test159),
			'expected test159 to be removed from string column'
		);


		// TEST 5: Verify data persistence (reload from database)
		// Destroy instance and reload from database
		unset($instance);

		$instance2 = section_record::get_instance(
			$this->section_tipo,
			$section_id
		);
		$data2 = $instance2->get_data();

		// Verify persisted data
		$this->assertEquals(333, $data2->relation->test37[0]->section_id);
		$this->assertEquals(222, $data2->relation->test81[0]->section_id);
		$this->assertFalse(
			isset($data2->string->test159),
			'expected test159 to remain deleted after reload'
		);

		// Clean up
		unset($instance2);

	}//end test_save_key_data



	/**
	* TEST_METADATA_CREATED_BY_USER
	* Tests set_created_by_user_id / get_created_by_user_id roundtrip
	* @return void
	*/
	public function test_metadata_created_by_user() : void {

		if (login::is_logged()===false) {
			login_test::force_login(TEST_USER_ID);
		}

		$section = section::get_instance(
			$this->section_tipo
		);
		$section_id = (int)$section->create_record();

		$instance = section_record::get_instance(
			$this->section_tipo,
			$section_id
		);

		// Override with a different user ID and verify in memory
		$result = $instance->set_created_by_user_id(TEST_USER_ID);
		$this->assertTrue($result);
		$this->assertEquals(TEST_USER_ID, $instance->get_created_by_user_id());

		// Persist and reload
		$instance->save();
		unset($instance);

		$instance2 = section_record::get_instance(
			$this->section_tipo,
			$section_id
		);
		$this->assertEquals(TEST_USER_ID, $instance2->get_created_by_user_id());

		unset($instance2);
	}//end test_metadata_created_by_user



	/**
	* TEST_METADATA_MODIFIED_BY_USER
	* Tests set_modified_by_user_id / get_modified_by_user_id roundtrip
	* @return void
	*/
	public function test_metadata_modified_by_user() : void {

		if (login::is_logged()===false) {
			login_test::force_login(TEST_USER_ID);
		}

		$section = section::get_instance(
			$this->section_tipo
		);
		$section_id = (int)$section->create_record();

		$instance = section_record::get_instance(
			$this->section_tipo,
			$section_id
		);

		// Initially null
		$this->assertNull($instance->get_modified_by_user_id());

		// Set and verify in memory
		$result = $instance->set_modified_by_user_id(TEST_USER_ID);
		$this->assertTrue($result);
		$this->assertEquals(TEST_USER_ID, $instance->get_modified_by_user_id());

		// Persist and reload
		$instance->save();
		unset($instance);

		$instance2 = section_record::get_instance(
			$this->section_tipo,
			$section_id
		);
		$this->assertEquals(TEST_USER_ID, $instance2->get_modified_by_user_id());

		unset($instance2);
	}//end test_metadata_modified_by_user



	/**
	* TEST_METADATA_CREATED_DATE
	* Tests set_created_date / get_created_date roundtrip
	* @return void
	*/
	public function test_metadata_created_date() : void {

		if (login::is_logged()===false) {
			login_test::force_login(TEST_USER_ID);
		}

		$section = section::get_instance(
			$this->section_tipo
		);
		$section_id = (int)$section->create_record();

		$instance = section_record::get_instance(
			$this->section_tipo,
			$section_id
		);

		// Override with a known timestamp
		$timestamp	= '2024-01-15 10:30:00';
		$expected	= '15-01-2024 10:30:00';
		$instance->set_created_date($timestamp);

		// Verify in memory
		$this->assertEquals($expected, $instance->get_created_date());

		// Persist and reload
		$instance->save();
		unset($instance);

		$instance2 = section_record::get_instance(
			$this->section_tipo,
			$section_id
		);
		$this->assertEquals($expected, $instance2->get_created_date());

		unset($instance2);
	}//end test_metadata_created_date



	/**
	* TEST_METADATA_MODIFIED_DATE
	* Tests set_modified_date / get_modified_date roundtrip
	* @return void
	*/
	public function test_metadata_modified_date() : void {

		if (login::is_logged()===false) {
			login_test::force_login(TEST_USER_ID);
		}

		$section = section::get_instance(
			$this->section_tipo
		);
		$section_id = (int)$section->create_record();

		$instance = section_record::get_instance(
			$this->section_tipo,
			$section_id
		);

		// Initially null
		$this->assertNull($instance->get_modified_date());

		// Set a known timestamp
		$timestamp	= '2025-06-20 14:45:30';
		$expected	= '20-06-2025 14:45:30';
		$instance->set_modified_date($timestamp);

		// Verify in memory
		$this->assertEquals($expected, $instance->get_modified_date());

		// Persist and reload
		$instance->save();
		unset($instance);

		$instance2 = section_record::get_instance(
			$this->section_tipo,
			$section_id
		);
		$this->assertEquals($expected, $instance2->get_modified_date());

		unset($instance2);
	}//end test_metadata_modified_date



	/**
	* TEST_BUILD_MODIFICATION_DATA
	* Tests the static pure function build_modification_data
	* @return void
	*/
	public function test_build_modification_data() : void {

		$user_id = TEST_USER_ID;

		// new_record mode
		$data = section_record::build_modification_data(
			$this->section_tipo,
			'new_record',
			$user_id
		);

		$this->assertIsObject($data);
		$this->assertTrue(
			isset($data->relation->{DEDALO_SECTION_INFO_CREATED_BY_USER}),
			'expected created_by_user in relation'
		);
		$this->assertTrue(
			isset($data->date->{DEDALO_SECTION_INFO_CREATED_DATE}),
			'expected created_date in date'
		);
		$this->assertEquals(
			$user_id,
			$data->relation->{DEDALO_SECTION_INFO_CREATED_BY_USER}[0]->section_id
		);

		// update_record mode
		$data2 = section_record::build_modification_data(
			$this->section_tipo,
			'update_record',
			$user_id
		);

		$this->assertIsObject($data2);
		$this->assertTrue(
			isset($data2->relation->{DEDALO_SECTION_INFO_MODIFIED_BY_USER}),
			'expected modified_by_user in relation'
		);
		$this->assertTrue(
			isset($data2->date->{DEDALO_SECTION_INFO_MODIFIED_DATE}),
			'expected modified_date in date'
		);
		$this->assertEquals(
			$user_id,
			$data2->relation->{DEDALO_SECTION_INFO_MODIFIED_BY_USER}[0]->section_id
		);

		// activity section returns empty
		$empty = section_record::build_modification_data(
			DEDALO_ACTIVITY_SECTION_TIPO,
			'new_record',
			$user_id
		);
		$this->assertEmpty((array)$empty);

		// empty user_id returns empty
		$empty2 = section_record::build_modification_data(
			$this->section_tipo,
			'new_record',
			0
		);
		$this->assertEmpty((array)$empty2);
	}//end test_build_modification_data



	/**
	* TEST_UPDATE_MODIFIED_SECTION_DATA
	* Tests update_modified_section_data with update_record mode
	* @return void
	*/
	public function test_update_modified_section_data() : void {

		if (login::is_logged()===false) {
			login_test::force_login(TEST_USER_ID);
		}

		$section = section::get_instance(
			$this->section_tipo
		);
		$section_id = (int)$section->create_record();

		$instance = section_record::get_instance(
			$this->section_tipo,
			$section_id
		);

		// Update modification metadata
		$result = $instance->update_modified_section_data((object)[
			'mode' => 'update_record'
		]);

		$this->assertTrue($result);

		// Verify in memory
		$this->assertEquals(
			TEST_USER_ID,
			$instance->get_modified_by_user_id()
		);
		$this->assertNotNull($instance->get_modified_date());

		// Persist and reload
		// save() flushes all data_instance values to DB
		$instance->save();
		unset($instance);

		$instance2 = section_record::get_instance(
			$this->section_tipo,
			$section_id
		);

		$this->assertEquals(
			TEST_USER_ID,
			$instance2->get_modified_by_user_id()
		);
		$this->assertNotNull($instance2->get_modified_date());

		unset($instance2);
	}//end test_update_modified_section_data



	/**
	* TEST_GET_PERMISSIONS
	* Tests get_permissions basic behavior
	* @return void
	*/
	public function test_get_permissions() : void {

		if (login::is_logged()===false) {
			login_test::force_login(TEST_USER_ID);
		}

		$section = section::get_instance(
			$this->section_tipo
		);
		$section_id = (int)$section->create_record();

		$instance = section_record::get_instance(
			$this->section_tipo,
			$section_id
		);

		$permissions = $instance->get_permissions();

		// Permissions should be an integer >= 0
		$this->assertIsInt($permissions);
		$this->assertGreaterThanOrEqual(0, $permissions);

		unset($instance);
	}//end test_get_permissions



	/**
	* TEST_GET_TABLE
	* Tests get_table returns a non-empty string
	* @return void
	*/
	public function test_get_table() : void {

		$section = section::get_instance(
			$this->section_tipo
		);
		$section_id = (int)$section->create_record();

		$instance = section_record::get_instance(
			$this->section_tipo,
			$section_id
		);

		$table = $instance->get_table();

		$this->assertIsString($table);
		$this->assertNotEmpty($table);

		unset($instance);
	}//end test_get_table



}//end class section_record_test
