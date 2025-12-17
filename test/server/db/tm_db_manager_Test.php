<?php declare(strict_types=1);
// PHPUnit classes
use PHPUnit\Framework\TestCase;
// bootstrap
require_once dirname(__FILE__, 2) . '/bootstrap.php';
require_once dirname(__FILE__, 2) . '/class.BaseTestCase.php';



final class tm_db_manager_test extends BaseTestCase {



	public $section_tipo = 'test65';
	public $section_id = 1;


    protected function setUp(): void   {
		// $this->markTestSkipped(
		// 	'Disabled !'
		// );
	}


    /**
	 * SET_UP_BEFORE_CLASS
	 * Create test table before running any tests
	 * @return void
	 */
	public static function setUpBeforeClass(): void
	{
		// Force to change the table to use to prevent touching the working table
		tm_db_manager::$table = 'matrix_time_machine_test';

		$conn = DBi::_getConnection();

		// Create the test table if it doesn't exist
		// Copy structure from dd_ontology table function
		$sql = "
			DROP TABLE IF EXISTS matrix_time_machine_test CASCADE;
			DROP SEQUENCE IF EXISTS matrix_time_machine_test_id_seq;
			SELECT duplicate_table_with_independent_sequences('matrix_time_machine', 'matrix_time_machine_test', true);
		";
		pg_query($conn, $sql);

        echo ". 🤞 Duplicated table matrix_time_machine => matrix_time_machine_test" . PHP_EOL . PHP_EOL;
	}//end setUpBeforeClass



	/**
	 * TEAR_DOWN_AFTER_CLASS
	 * Clean up test table after all tests complete
	 * @return void
	 */
	public static function tearDownAfterClass(): void
	{
		// $conn = DBi::_getConnection();
		
		// // Drop test table and sequence
		// $sql = "
		// 	DROP TABLE IF EXISTS matrix_time_machine_test CASCADE;
		// 	DROP SEQUENCE IF EXISTS matrix_time_machine_test_id_seq;
		// ";
		// pg_query($conn, $sql);

		// echo PHP_EOL . ". 🤞 Dropped table matrix_time_machine_test" . PHP_EOL;

		// Reset to original table
		tm_db_manager::$table = 'matrix_time_machine';
	}//end tearDownAfterClass



	/**
	 * GET_COUNTER_VALUE
	 * @return int $id
	 */
	protected function get_counter_value(): int
	{

		// counter
		$sql = 'SELECT id FROM matrix_time_machine_test ORDER BY id DESC LIMIT 1';
		$pg_result = pg_query(DBi::_getConnection(), $sql);
		$row = pg_fetch_assoc($pg_result);
		$id = (int)$row['id'];

		return $id;
	}//end get_counter_value




	/**
	 * TEST_vars
	 * @return void
	 */
	public function test_vars(): void
	{

		// table
		$table = tm_db_manager::$table;
		$eq = $table === 'matrix_time_machine_test';
		$this->assertTrue(
			$eq,
			'expected true' . PHP_EOL
				. 'table: ' . to_string($table)
		);

		//columns
		$columns = tm_db_manager::$columns;
		$eq = $columns === [
			'section_id'		=> true,
            'section_tipo'		=> true,
            'tipo'				=> true,
            'lang'				=> true,
            'timestamp'			=> true,
            'user_id'			=> true,
            'bulk_process_id'	=> true,
            'data'				=> true
		];
		$this->assertTrue(
			$eq,
			'expected true' . PHP_EOL
				. 'columns: ' . to_string($columns)
		);

		// json_columns
		$json_columns = tm_db_manager::$json_columns;
		$eq = $json_columns === [
			'data'				=> true
		];
		$this->assertTrue(
			$eq,
			'expected true' . PHP_EOL
				. 'json_columns: ' . to_string($json_columns)
		);

		// int_columns
		$int_columns = tm_db_manager::$int_columns;
		$eq = $int_columns === [
			'id'				=> true,		
			'section_id'		=> true,
			'user_id'			=> true,
			'bulk_process_id'	=> true
		];
		$this->assertTrue(
			$eq,
			'expected true' . PHP_EOL
				. 'int_columns: ' . to_string($int_columns)
		);

        // timestamp columns
		$timestamp_columns = tm_db_manager::$timestamp_columns;
		$eq = $timestamp_columns === [
			'timestamp'			=> true
		];
		$this->assertTrue(
			$eq,
			'expected true' . PHP_EOL
				. 'timestamp_columns: ' . to_string($timestamp_columns)
		);
	}//end test_vars



	/**
	 * TEST_create
	 * @return void
	 */
	public function test_create(): void
	{

		$table = tm_db_manager::$table;
		$section_tipo = 'test65';
		$values = null; // default values is NULL

		// 1 - Create basic record
		$start_time = start_time();
		$result = tm_db_manager::create(			
			$values
		);

		// Check the time consuming. Expected value is around 15 ms
		$total_time = exec_time_unit($start_time);
		// debug_log(__METHOD__. " total_time (1): " . $total_time, logger::ERROR);
		$eq = $total_time < 35;
		$this->assertTrue(
			$eq,
			'expected execution time (1) bellow 35 ms' . PHP_EOL
				. 'total_time ms: ' . $total_time
		);

		// Check result type
		$eq = gettype($result) === 'integer';
		$this->assertTrue(
			$eq,
			'expected true (integer)' . PHP_EOL
				. 'result type: ' . gettype($result) . PHP_EOL
				. 'result: ' . to_string($result)
		);

		$id = $result;

		echo " 🤞 Created record with id: $id" . PHP_EOL . PHP_EOL;

		// 2 - Using values
		$start_time = start_time();
		$values = (object)[
			'section_tipo' => $section_tipo
		];
		$result = tm_db_manager::create(			
			$values
		);

		// Check the time consuming. Expected value is around 1 ms
		$total_time = exec_time_unit($start_time);
		$eq = $total_time < 1;
		$this->assertTrue(
			$eq,
			'expected execution time (2) bellow 1 ms' . PHP_EOL
				. 'total_time ms: ' . $total_time
		);

		// Check result type
		$eq = gettype($result) === 'integer';
		$this->assertTrue(
			$eq,
			'expected true (integer)' . PHP_EOL
				. 'result type: ' . gettype($result) . PHP_EOL
				. 'result: ' . to_string($result)
		);

		// Check result type
		$eq = $result > $id;
		$this->assertTrue(
			$eq,
			'expected true ' . PHP_EOL
				. 'result: ' . to_string($result) . PHP_EOL
				. 'id (previous result): ' . to_string($id)
		);

		// 3 - massive creation
		$values = (object)[
			'section_id'      => $this->section_id,
			'section_tipo'    => $this->section_tipo,
			'tipo'            => $this->section_tipo,
			'lang'            => 'lg-eng',
			'timestamp'       => date('Y-m-d H:i:s'),
			'user_id'         => 1,
			'bulk_process_id' => 1,
			'data'            => [
				'test' => 'test'
			]
		];
		$this->execution_timing(
			'create',
			function ($i) use ($values) {
				return tm_db_manager::create(
					$values
				);
			},
			900, // estimated time ms
			1, // from section_id
			10000 // n records
		);
	}//end test_create



	/**
	 * TEST_read
	 * @return void
	 */
	public function test_read(): void
	{
		
		// create a record
		$values = (object)[
			'section_id'      => $this->section_id,
			'section_tipo'    => $this->section_tipo,
			'tipo'            => $this->section_tipo,
			'lang'            => 'lg-eng',
			'timestamp'       => date('Y-m-d H:i:s'),
			'user_id'         => 1,
			'bulk_process_id' => 1,
			'data'            => [
				'test' => 'test read'
			]
		];
		$id	= tm_db_manager::create(
			$values
		);

		// 1 - read the record basic
		$start_time = start_time();
		$result = tm_db_manager::read(
			$id
		);

		// Check the time consuming. Expected value is around 1 ms
		$total_time = exec_time_unit($start_time);
		// debug_log(__METHOD__. " total_time (1): " . $total_time, logger::ERROR);
		$eq = $total_time < 1;
		$this->assertTrue(
			$eq,
			'expected execution time (1): bellow 1 ms' . PHP_EOL
				. 'total_time ms: ' . $total_time
		);

		// Check result type
		$eq = gettype($result) === 'object';
		$this->assertTrue(
			$eq,
			'expected true (object)' . PHP_EOL
				. 'result type: ' . gettype($result) . PHP_EOL
				. 'result: ' . to_string($result)
		);

		// 2 - Read again A
		$start_time = start_time();
		$result = tm_db_manager::read(
			$id
		);

		// Check the time consuming. Expected value is around 0.2 ms
		$total_time = exec_time_unit($start_time);
		// debug_log(__METHOD__. " total_time (2: " . $total_time, logger::ERROR);
		$eq = $total_time < 0.2;
		$this->assertTrue(
			$eq,
			'expected execution time (2): bellow 0.2 ms' . PHP_EOL
				. 'total_time ms: ' . $total_time
		);

		// Check result type
		$eq = gettype($result) === 'object';
		$this->assertTrue(
			$eq,
			'expected true (object)' . PHP_EOL
				. 'result type: ' . gettype($result) . PHP_EOL
				. 'result: ' . to_string($result)
		);		

		// 3 - Reading non existing record
		$result = tm_db_manager::read(		
			$id = 999999999
		);
		$eq = $result === false;
		$this->assertTrue(
			$eq,
			'expected true equal' . PHP_EOL
				. 'result : ' . json_encode($result) . PHP_EOL
				. 'value : ' . json_encode([])
		);

		// 4 - massive read
		$counter_value = $this->get_counter_value();
		$this->execution_timing(
			'read',
			function ($i) use ($id) {
				return tm_db_manager::read(
					$id
				);
			},
			160, // estimated time ms
			$counter_value - 10000, // from id
			10000 // n records
		);
	}//end test_read



	/**
	 * TEST_update
	 * @return void
	 */
	public function test_update(): void
	{

		// create a record
		$id = tm_db_manager::create(
			null
		);
		
		// 1 - update the record basic
		$start_time = start_time();
 		$values = (object)[
			'section_id' => $this->section_id,
			'section_tipo' => $this->section_tipo,
			'tipo' => $this->section_tipo,
			'lang' => 'lg-eng',
			'data' => [
				(object)['test_property' => true, 'test_property2' => date('Y-m-d H:i:s')]
			],
			'timestamp' => date('Y-m-d H:i:s')
		];
		$result = tm_db_manager::update(			
			$id,
			$values
		);

		// Check the time consuming. Expected value is around 0.4 ms
		$total_time = exec_time_unit($start_time);
		// debug_log(__METHOD__. " total_time (1): " . $total_time, logger::ERROR);
		$eq = $total_time < 3;
		$this->assertTrue(
			$eq,
			'expected execution time (1): bellow 3 ms' . PHP_EOL
				. 'total_time ms: ' . $total_time
		);

		// Check result type
		$eq = gettype($result) === 'boolean';
		$this->assertTrue(
			$eq,
			'expected true (boolean)' . PHP_EOL
				. 'result type: ' . gettype($result) . PHP_EOL
				. 'result: ' . to_string($result)
		);

		// Check result
		$eq = $result === true;
		$this->assertTrue(
			$eq,
			'expected true ' . PHP_EOL
				. 'result: ' . to_string($result)
		);


		// 2 - Update the record again
		$values2 = (object)[
			'section_id' => $this->section_id,
			'section_tipo' => $this->section_tipo,
			'tipo' => $this->section_tipo,
			'lang' => 'lg-eng',
			'data' => [
				(object)['test_property' => true, 'more_test' => true, 'test_property2' => date('Y-m-d H:i:s')]
			],
			'timestamp' => date('Y-m-d H:i:s')
		];
		$start_time = start_time();
		$result = tm_db_manager::update(			
			$id,
			$values2
		);

		// Check the time consuming. Expected value is around 0.2 ms
		$total_time = exec_time_unit($start_time);
		// debug_log(__METHOD__. " total_time (2): " . $total_time, logger::ERROR);
		$eq = $total_time < 0.2;
		$this->assertTrue(
			$eq,
			'expected execution time (2): bellow 0.2 ms' . PHP_EOL
				. 'total_time ms: ' . $total_time
		);


		// 3 - Read
		$result = tm_db_manager::read(
			$id
		);// result_data
		// convert to array and sort to compare
		$result_data_array = (array)json_decode($result->data);
		ksort($result_data_array);	
		$values2_data_array = (array)$values2->data;
		ksort($values2_data_array);
		$eq = $result_data_array == $values2_data_array;
		$this->assertTrue(
			$eq,
			'expected true equal' . PHP_EOL
				. 'result data : ' . $result_data_array . PHP_EOL
				. 'values data : ' . $values2_data_array
		);


		// 4 - Updating non existing record
		$result = tm_db_manager::update(			
			$id = 999999999,
			$values
		);
		$eq = $result === true;
		$this->assertTrue(
			$eq,
			'expected true equal' . PHP_EOL
				. 'result : ' . json_encode($result) . PHP_EOL
				. 'value : ' . json_encode(true)
		);


		// 5 - massive update
		$counter_value = $this->get_counter_value();
		$this->execution_timing(
			'update',
			function ($i) use ($values) {
				return tm_db_manager::update(
					$i,
					$values
				);
			},
			970, // estimated time ms
			$counter_value - 10000, // from section_id
			10000 // n records
		);
	}//end test_update



	/**
	 * TEST_delete
	 * @return void
	 */
	public function test_delete(): void
	{

		$id	= tm_db_manager::create(
			null
		);

		// 1 - delete
		$start_time = start_time();
		$result = tm_db_manager::delete(
			$id
		);

		// Check the time consuming. Expected value is around 0.4 ms
		$total_time = exec_time_unit($start_time);
		// debug_log(__METHOD__. " total_time (1): " . $total_time, logger::ERROR);
		$eq = $total_time < 5;
		$this->assertTrue(
			$eq,
			'expected execution time  delete (1): bellow 5 ms' . PHP_EOL
				. 'total_time ms: ' . $total_time
		);

		// Check result type
		$eq = gettype($result) === 'boolean';
		$this->assertTrue(
			$eq,
			'expected true (boolean)' . PHP_EOL
				. 'result type: ' . gettype($result) . PHP_EOL
				. 'result: ' . to_string($result)
		);

		// Check result
		$eq = $result === true;
		$this->assertTrue(
			$eq,
			'expected true ' . PHP_EOL
				. 'result: ' . to_string($result)
		);

		
		// 2 - read and check all is written OK
		$result	= tm_db_manager::read(
			$id
		);
		$db_value = $result;
		$eq = $db_value == [];
		$this->assertTrue(
			$eq,
			'expected true ' . PHP_EOL
				. 'result: ' . json_encode($db_value) . PHP_EOL
				. 'value: ' . json_encode([])
		);


		// 3 - Delete non existing record
		$result = tm_db_manager::delete(
			$id = 999999999
		);
		// Check result
		$eq = $result === true;
		$this->assertTrue(
			$eq,
			'expected true ' . PHP_EOL
				. 'result: ' . to_string($result)
		);

		
		// 4 - massive delete
		$counter_value = $this->get_counter_value();
		$this->execution_timing(
			'delete',
			function ($i) {
				return tm_db_manager::delete(
					$i
				);
			},
			800, // estimated time ms
			$counter_value - 10000, // from section_id
			10000 // n records
		);
	}//end test_delete



	/**
	 * TEST_update_edge_cases
	 * @return void
	 */
	public function test_update_edge_cases(): void
	{
		$id	= tm_db_manager::create((object)[
			'section_tipo' => $this->section_tipo,
			'tipo' => $this->section_tipo,
			'lang' => 'lg-eng',
			'data' => [
				(object)['test_property' => true, 'more_test' => true, 'test_property2' => date('Y-m-d H:i:s')]
			],
			'timestamp' => date('Y-m-d H:i:s')
		]);
		
		// Test 2: Invalid column name (should fail)
		$result = tm_db_manager::update(
			$id,
			(object)['invalid_column' => 'test']
		);
		$this->assertFalse($result, 'expected false for invalid column');

		// Test 3: Empty values object
		$values = (object)[];
		$result = tm_db_manager::update(
			$id,
			$values
		);
		$this->assertFalse($result, 'expected false for empty values');

		// Test 4: Update with NULL to clear data
		$values = (object)[
			'data' => null,
			'lang' => null
		];
		$result = tm_db_manager::update(
			$id,
			$values
		);
		$this->assertTrue($result, 'expected true for NULL values update');

		// Verify NULL was set
		$read_result = tm_db_manager::read($id);
		$this->assertNull($read_result->data);
		$this->assertNull($read_result->relation);
	}//end test_update_edge_cases



	/**
	 * TEST_delete_edge_cases
	 * @return void
	 */
	public function test_delete_edge_cases(): void
	{	
		// Test 1: Delete non-existent record (should still return true)
		$result = tm_db_manager::delete(
			999999999
		);
		$this->assertTrue($result, 'expected true even for non-existent record');

		// Test 2: Delete already deleted record
		$id = tm_db_manager::create();
		$result1 = tm_db_manager::delete($id);
		$this->assertTrue($result1, 'first delete should succeed');
		
		$result2 = tm_db_manager::delete($id);
		$this->assertTrue($result2, 'second delete should also return true');
	}//end test_delete_edge_cases



	/**
	 * TEST_read_edge_cases
	 * @return void
	 */
	public function test_read_edge_cases(): void
	{
		// Test 1: Non-existent section_id
		$result = tm_db_manager::read(
			999999999
		);
		$this->assertFalse($result, 'expected false for non-existent section_id');

		// Test 2: Read record with NULL columns
		$id = tm_db_manager::create();
		$result = tm_db_manager::read($id);
		$this->assertIsObject($result, 'expected object for valid read');
		$this->assertObjectHasProperty('section_id', $result);
		$this->assertObjectHasProperty('section_tipo', $result);

		echo PHP_EOL . ". 🤞 test_read_edge_cases done" . PHP_EOL;
	}//end test_read_edge_cases



}//end class tm_db_manager_test
