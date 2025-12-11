<?php declare(strict_types=1);
// PHPUnit classes
use PHPUnit\Framework\TestCase;
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';
require_once dirname(__FILE__, 2) . '/class.BaseTestCase.php';



final class dd_ontology_db_manager_test extends BaseTestCase {



	/**
	 * SET_UP_BEFORE_CLASS
	 * Create test table before running any tests
	 * @return void
	 */
	public static function setUpBeforeClass(): void
	{
		// Force to change the table to use to prevent touching the working table
		dd_ontology_db_manager::$table = 'dd_ontology_test';

		$conn = DBi::_getConnection();

		// Create the test table if it doesn't exist
		// Copy structure from dd_ontology table function
		$sql = "
			DROP TABLE IF EXISTS dd_ontology_test CASCADE;
			DROP SEQUENCE IF EXISTS dd_ontology_test_id_seq;
			SELECT duplicate_table_with_independent_sequences('dd_ontology', 'dd_ontology_test', true);
		";
		pg_query($conn, $sql);

		echo " 🤞 Duplicated table dd_ontology => dd_ontology_test" . PHP_EOL . PHP_EOL;
	}//end setUpBeforeClass



	/**
	 * TEAR_DOWN_AFTER_CLASS
	 * Clean up test table after all tests complete
	 * @return void
	 */
	public static function tearDownAfterClass(): void
	{
		$conn = DBi::_getConnection();
		
		// Drop test table and sequence
		$sql = "
			DROP TABLE IF EXISTS dd_ontology_test CASCADE;
			DROP SEQUENCE IF EXISTS dd_ontology_test_id_seq;
		";
		pg_query($conn, $sql);

		echo PHP_EOL. ". 🤞 Dropped table dd_ontology_test" . PHP_EOL . PHP_EOL;

		// Reset to original table
		dd_ontology_db_manager::$table = 'dd_ontology';
	}//end tearDownAfterClass



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
	* TEST_vars
	* @return void
	*/
	public function test_vars(): void {

		// table (should be test table after setUpBeforeClass)
		$table = dd_ontology_db_manager::$table;
		$eq = $table === 'dd_ontology_test';
		$this->assertTrue(
			$eq,
			'expected true' . PHP_EOL
				.'table: ' . to_string($table)
		);

		// columns
		$columns = dd_ontology_db_manager::$columns;
		$eq = $columns === [
			'tipo'				=> true,
			'parent'			=> true,
			'term'				=> true,
			'model'				=> true,
			'order_number'		=> true,
			'relations'			=> true,
			'tld'				=> true,
			'properties'		=> true,
			'model_tipo'		=> true,
			'is_model'			=> true,
			'is_translatable'	=> true,
			'propiedades'		=> true
		];
		$this->assertTrue(
			$eq,
			'expected true' . PHP_EOL
				.'columns: ' . to_string($columns)
		);

		// json_columns
		$json_columns = dd_ontology_db_manager::$json_columns;
		$eq = $json_columns === [
			'term'				=> true,
			'relations'			=> true,
			'properties'		=> true
		];
		$this->assertTrue(
			$eq,
			'expected true' . PHP_EOL
				.'json_columns: ' . to_string($json_columns)
		);

		// int_columns
		$int_columns = dd_ontology_db_manager::$int_columns;
		$eq = $int_columns === [
			'order_number'		=> true
		];
		$this->assertTrue(
			$eq,
			'expected true' . PHP_EOL
				.'int_columns: ' . to_string($int_columns)
		);

		// boolean_columns
		$boolean_columns = dd_ontology_db_manager::$boolean_columns;
		$eq = $boolean_columns === [
			'is_model'			=> true,
			'is_translatable'	=> true
		];
		$this->assertTrue(
			$eq,
			'expected true' . PHP_EOL
				.'boolean_columns: ' . to_string($boolean_columns)
		);

		// load_cache
		$load_cache = dd_ontology_db_manager::$load_cache;
		$eq = $load_cache === [];
		$this->assertTrue(
			$eq,
			'expected true' . PHP_EOL
				.'load_cache: ' . to_string($load_cache)
		);
	}//end test_vars



	/**
	 * TEST_table_setup
	 * Verify test table was created correctly
	 * @return void
	 */
	public function test_table_setup(): void
	{
		$table = dd_ontology_db_manager::$table;
		$this->assertEquals(
			'dd_ontology_test',
			$table,
			'Expected test table to be set'
		);
	}//end test_table_setup



	/**
	* TEST_create
	* @return void
	*/
	public function test_create(): void {

		$tipo = 'test13';
		$values = []; // default values is an empty array

		$start_time=start_time();
		$result = dd_ontology_db_manager::create(
			$tipo,
			$values
		);

		// Check the time consuming. Expected value is around 1.6 ms
		$total_time = exec_time_unit($start_time);
			// debug_log(__METHOD__. " total_time (1): " . $total_time, logger::ERROR);
		$eq = $total_time < 2.2;
		$this->assertTrue(
			$eq,
			'expected execution time (1) bellow 2.2 ms' . PHP_EOL
				.'total_time ms: ' . $total_time
		);

		// Check result type
		$eq = gettype($result) === 'integer';
		$this->assertTrue(
			$eq,
			'expected true (integer)' . PHP_EOL
				.'result type: ' . gettype($result) . PHP_EOL
				.'result: ' . to_string($result)
		);

		// Using values
		$start_time=start_time();
		$values = [
			'order_number' => 99,
			'properties' => (object)['test'=>true]

		];
		$result = dd_ontology_db_manager::create(
			$tipo,
			$values
		);

		// Check the time consuming. Expected value is around 0.22 ms
		$total_time = exec_time_unit($start_time);
			// debug_log(__METHOD__. " total_time (2) " . $total_time, logger::ERROR);
		$eq = $total_time < 0.5;
		$this->assertTrue(
			$eq,
			'expected execution time (2) bellow 0.5 ms' . PHP_EOL
				.'total_time ms: ' . $total_time
		);

		$id = $result;

		// Check result type
		$eq = gettype($result) === 'integer';
		$this->assertTrue(
			$eq,
			'expected true (integer)' . PHP_EOL
				.'result type: ' . gettype($result) . PHP_EOL
				.'result: ' . to_string($result)
		);

		// Check result type
		$eq = $result === $id;
		$this->assertTrue(
			$eq,
			'expected true ' . PHP_EOL
				.'result: ' . to_string($result) . PHP_EOL
				.'id (previous result): ' . to_string($id)
		);

		// Test create with boolean values
		$tipo_bool = 'test_bool_14';
		$values_bool = [
			'is_model' => true,
			'is_translatable' => false
		];
		$result_bool = dd_ontology_db_manager::create(
			$tipo_bool,
			$values_bool
		);
		$this->assertIsInt($result_bool, 'Expected integer ID for boolean test');

		// Verify boolean values were saved correctly
		$read_result = dd_ontology_db_manager::read($tipo_bool);
		$this->assertTrue($read_result['is_model'], 'Expected is_model to be true');
		$this->assertFalse($read_result['is_translatable'], 'Expected is_translatable to be false');

		// Test create with null values
		$tipo_null = 'test_null_15';
		$values_null = [
			'parent' => null,
			'properties' => null
		];
		$result_null = dd_ontology_db_manager::create(
			$tipo_null,
			$values_null
		);
		$this->assertIsInt($result_null, 'Expected integer ID for null values test');

		// massive creation
		$this->execution_timing(
			'create',
			function($i) use($tipo) {
				return dd_ontology_db_manager::create(
					$tipo
				);
			},
			780, // estimated time ms
			1, // from section_id
			10000 // n records
		);
	}//end test_create



	/**
	* TEST_read
	* @return void
	*/
	public function test_read(): void {

		$tipo	= 'test65';
		$id		= dd_ontology_db_manager::create(
			$tipo
		);

		$start_time=start_time();
		$result = dd_ontology_db_manager::read(
			$tipo
		);

		// Check the time consuming. Expected value is around 0.25 ms
		$total_time = exec_time_unit($start_time);
			// debug_log(__METHOD__. " total_time (1): " . $total_time, logger::ERROR);
		$eq = $total_time < 0.4;
		$this->assertTrue(
			$eq,
			'expected execution time (1): bellow 0.4 ms' . PHP_EOL
				.'total_time ms: ' . $total_time
		);

		// Check result type
		$eq = gettype($result) === 'array';
		$this->assertTrue(
			$eq,
			'expected true (array)' . PHP_EOL
				.'result type: ' . gettype($result) . PHP_EOL
				.'result: ' . to_string($result)
		);

		// Read again A
		$start_time=start_time();
		$result = dd_ontology_db_manager::read(
			$tipo
		);

		// Check the time consuming. Expected value is around 0.001 ms (CACHED)
		$total_time = exec_time_unit($start_time);
			// debug_log(__METHOD__. " total_time (2): " . $total_time, logger::ERROR);
		$eq = $total_time < 0.002;
		$this->assertTrue(
			$eq,
			'expected execution time (2): bellow 0.002 ms' . PHP_EOL
				.'total_time ms: ' . $total_time
		);

		// Check result type
		$eq = gettype($result) === 'array';
		$this->assertTrue(
			$eq,
			'expected true (array)' . PHP_EOL
				.'result type: ' . gettype($result) . PHP_EOL
				.'result: ' . to_string($result)
		);

		// Read again B
		$start_time=start_time();
		$result = dd_ontology_db_manager::read(
			$tipo
		);

		// Check the time consuming. Expected value is around 0.001 ms (CACHED)
		$total_time = exec_time_unit($start_time);
			// debug_log(__METHOD__. " total_time (3): " . $total_time, logger::ERROR);
		$eq = $total_time < 0.003;
		$this->assertTrue(
			$eq,
			'expected execution time (3): bellow 0.003 ms' . PHP_EOL
				.'total_time ms: ' . $total_time
		);

		// Reading non existing record
		$result = dd_ontology_db_manager::read(
			'nonexistingtipo_1'
		);
		$eq = $result === [];
		$this->assertTrue(
			$eq,
			'expected true equal' . PHP_EOL
				.'result : ' . json_encode($result) . PHP_EOL
				.'value : ' . json_encode([])
		);

		// Test reading record with JSON columns
		$tipo_json = 'test_json_66';
		$json_values = [
			'term' => (object)['lg-eng' => 'Test Term', 'lg-spa' => 'Término de Prueba'],
			'properties' => (object)['prop1' => 'value1', 'prop2' => 123]
		];
		dd_ontology_db_manager::create($tipo_json, $json_values);
		$result_json = dd_ontology_db_manager::read($tipo_json);
		
		$this->assertIsObject($result_json['term'], 'Expected term to be decoded as object');
		$this->assertIsObject($result_json['properties'], 'Expected properties to be decoded as object');
		$this->assertEquals('Test Term', $result_json['term']->{'lg-eng'}, 'Expected correct term value');

		// Test reading record with integer columns
		$tipo_int = 'test_int_67';
		dd_ontology_db_manager::create($tipo_int, ['order_number' => 42]);
		$result_int = dd_ontology_db_manager::read($tipo_int);
		
		$this->assertIsInt($result_int['order_number'], 'Expected order_number to be integer');
		$this->assertEquals(42, $result_int['order_number'], 'Expected correct order_number value');

		// massive read
		$counter_value = $this->get_counter_value($tipo);
		$this->execution_timing(
			'read',
			function($i) use($tipo) {
				return dd_ontology_db_manager::read(
					$tipo,
					$i
				);
			},
			0.7, // estimated time ms
			$counter_value - 10000, // from section_id
			10000 // n records
		);
	}//end test_read



	/**
	* TEST_update
	* @return void
	*/
	public function test_update(): void {

		$tipo		= 'test65';
		$section_id	= dd_ontology_db_manager::create(
			$tipo
		);


		$values = [
			'order_number' => 99,
			'properties' => (object)['test'=>true]
		];
		$start_time=start_time();
		$result = dd_ontology_db_manager::update(
			$tipo,
			$values
		);

		// Check the time consuming. Expected value is around 0.4 ms
		$total_time = exec_time_unit($start_time);
			// debug_log(__METHOD__. " update total_time (1): " . $total_time, logger::ERROR);
		$eq = $total_time < 3;
		$this->assertTrue(
			$eq,
			'expected execution time (1): bellow 3 ms' . PHP_EOL
				.'total_time ms: ' . $total_time
		);

		// Check result type
		$eq = gettype($result) === 'boolean';
		$this->assertTrue(
			$eq,
			'expected true (boolean)' . PHP_EOL
				.'result type: ' . gettype($result) . PHP_EOL
				.'result: ' . to_string($result)
		);

		// Check result
		$eq = $result === true;
		$this->assertTrue(
			$eq,
			'expected true ' . PHP_EOL
				.'result: ' . to_string($result)
		);

		$result = false;
		try {
			// Bad column case
			$values2 = [
				'data' => [
					'test_property' => true
				]
			];
			$result = dd_ontology_db_manager::update(
				$tipo,
				$values2
			);

		} catch (Exception $e) {
			// Check result
			$eq = $result === false;
			$this->assertTrue(
				$eq,
				'expected true ' . PHP_EOL
					.'result: ' . to_string($result)
			);
		}

		// do it again
		$values3 = [
			'parent' => 'dd1',
			'term' => json_decode('{"lg-ara":"العمليات","lg-cat":"Processos","lg-deu":"Prozesse","lg-ell":"Διεργασίες","lg-eng":"Processes","lg-eus":"Prozesuak","lg-fra":"Procédures","lg-ita":"Processi","lg-nep":"प्रक्रियाहरू","lg-por":"Processos","lg-spa":"Procesos"}'),
			'model' => 'area_tool',
			'order_number' => 8,
			'relations' => null,
			'tld' => 'dd',
			'properties' => json_decode('{"dd199":1,"dd201":1,"dd271":1,"rsc19":16,"rsc21":1,"dd1223":1}'),
			'model_tipo' => 'dd124',
			'is_model' => false,
			'is_translatable' => true,
			'propiedades' => "I'm a string"
		];

		$start_time=start_time();
		$result = dd_ontology_db_manager::update(
			$tipo,
			$values3
		);

		// Check the time consuming. Expected value is around 5 ms
		$total_time = exec_time_unit($start_time);
			// debug_log(__METHOD__. " total_time (2): " . $total_time, logger::ERROR);
		$eq = $total_time < 8;
		$this->assertTrue(
			$eq,
			'expected execution time (2): bellow 8 ms' . PHP_EOL
				.'total_time ms: ' . $total_time
		);

		// Read
		$result = dd_ontology_db_manager::read(
			$tipo
		);
		// result_properties
		$result_properties = $result['properties'];
		$eq = json_encode($result_properties) === json_encode($values3['properties']);
		$this->assertTrue(
			$eq,
			'expected true equal' . PHP_EOL
				.'result properties : ' . json_encode($result_properties) . PHP_EOL
				.'values properties : ' . json_encode($values3['properties'])
		);
		// result_is_translatable
		$result_is_translatable = $result['is_translatable'];
		$eq = $result_is_translatable == $values3['is_translatable'];
		$this->assertTrue(
			$eq,
			'expected true equal' . PHP_EOL
				.'result is_translatable : ' . json_encode($result_is_translatable) . PHP_EOL
				.'values is_translatable : ' . json_encode($values3['is_translatable'])
		);

		// Updating non existing record
		$result = dd_ontology_db_manager::update(
			'nonexistingtipo_1',
			$values
		);
		$eq = $result === true;
		$this->assertTrue(
			$eq,
			'expected true equal' . PHP_EOL
				.'result : ' . json_encode($result) . PHP_EOL
				.'value : ' . json_encode(true)
		);

		// Test update with empty values (should fail)
		$result_empty = dd_ontology_db_manager::update($tipo, []);
		$this->assertFalse($result_empty, 'Expected false when updating with empty values');

		// Test cache invalidation after update
		dd_ontology_db_manager::read($tipo); // Cache the record
		dd_ontology_db_manager::update($tipo, ['parent' => 'dd999']);
		$result_after_update = dd_ontology_db_manager::read($tipo);
		$this->assertEquals('dd999', $result_after_update['parent'], 'Expected cache to be invalidated after update');

		// massive update
		$counter_value = $this->get_counter_value($tipo);
		$this->execution_timing(
			'update',
			function($i) use($tipo, $values) {
				return dd_ontology_db_manager::update(
					$tipo,
					$values
				);
			},
			720, // estimated time ms
			$counter_value - 10000, // from section_id
			10000 // n records
		);
	}//end test_update



	/**
	* TEST_delete
	* @return void
	*/
	public function test_delete(): void {

		$tipo	= 'test65';
		$id		= dd_ontology_db_manager::create(
			$tipo
		);

		$start_time=start_time();
		$result = dd_ontology_db_manager::delete(
			$tipo
		);

		// Check the time consuming. Expected value is around 0.11 ms
		$total_time = exec_time_unit($start_time);
			// debug_log(__METHOD__. " total_time (1): " . $total_time, logger::ERROR);
		$eq = $total_time < 0.2;
		$this->assertTrue(
			$eq,
			'expected execution time  delete (1): bellow 0.2 ms' . PHP_EOL
				.'total_time ms: ' . $total_time
		);

		// Check result type
		$eq = gettype($result) === 'boolean';
		$this->assertTrue(
			$eq,
			'expected true (boolean)' . PHP_EOL
				.'result type: ' . gettype($result) . PHP_EOL
				.'result: ' . to_string($result)
		);

		// Check result
		$eq = $result === true;
		$this->assertTrue(
			$eq,
			'expected true ' . PHP_EOL
				.'result: ' . to_string($result)
		);

		// read and check all is written OK
		$result	= dd_ontology_db_manager::read(
			$tipo
		);
		$db_value = $result;
		$eq = $db_value == [];
		$this->assertTrue(
			$eq,
			'expected true ' . PHP_EOL
				.'result: ' . json_encode($db_value) . PHP_EOL
				.'value: ' . json_encode([])
		);

		// Delete non existing record
		$result = dd_ontology_db_manager::delete(
			'nonexitingtipo_854'
		);
		// Check result
		$eq = $result === true;
		$this->assertTrue(
			$eq,
			'expected true ' . PHP_EOL
				.'result: ' . to_string($result)
		);

		// Test cache invalidation after delete
		$tipo_cache = 'test_cache_68';
		dd_ontology_db_manager::create($tipo_cache);
		dd_ontology_db_manager::read($tipo_cache); // Cache the record
		dd_ontology_db_manager::delete($tipo_cache);
		$result_after_delete = dd_ontology_db_manager::read($tipo_cache);
		$this->assertEquals([], $result_after_delete, 'Expected cache to be invalidated after delete');

		// massive delete
		$counter_value = $this->get_counter_value($tipo);
		$this->execution_timing(
			'delete',
			function($i) use($tipo) {
				return dd_ontology_db_manager::delete(
					$tipo,
					$i
				);
			},
			145, // estimated time ms
			$counter_value - 10000, // from sid
			10000 // n records
		);
	}//end test_delete



	/**
	* TEST_search
	* @return void
	*/
	public function test_search(): void {

		// Create test records
		$tipo1 = 'test_search_1';
		$tipo2 = 'test_search_2';
		$tipo3 = 'test_search_3';

		dd_ontology_db_manager::create($tipo1, [
			'parent' => 'dd1',
			'model' => 'component_input_text',
			'order_number' => 1,
			'tld' => 'dd'
		]);

		dd_ontology_db_manager::create($tipo2, [
			'parent' => 'dd1',
			'model' => 'component_select',
			'order_number' => 2,
			'tld' => 'dd'
		]);

		dd_ontology_db_manager::create($tipo3, [
			'parent' => 'dd2',
			'model' => 'component_input_text',
			'order_number' => 3,
			'tld' => 'test'
		]);

		// Test basic search by single column
		$start_time = start_time();
		$result = dd_ontology_db_manager::search([
			'parent' => 'dd1'
		]);

		// Check the time consuming
		$total_time = exec_time_unit($start_time);
		$eq = $total_time < 1.5;
		$this->assertTrue(
			$eq,
			'expected execution time (1): bellow 1.5 ms' . PHP_EOL
				.'total_time ms: ' . $total_time
		);

		// Check result type
		$this->assertIsArray($result, 'Expected array result');
		$this->assertGreaterThanOrEqual(2, count($result), 'Expected at least 2 results');
		$this->assertContains($tipo1, $result, 'Expected tipo1 in results');
		$this->assertContains($tipo2, $result, 'Expected tipo2 in results');

		// Test search by multiple columns
		$result_multi = dd_ontology_db_manager::search([
			'parent' => 'dd1',
			'model' => 'component_input_text'
		]);

		$this->assertIsArray($result_multi, 'Expected array result for multi-column search');
		$this->assertContains($tipo1, $result_multi, 'Expected tipo1 in multi-column search results');
		$this->assertNotContains($tipo2, $result_multi, 'Expected tipo2 NOT in multi-column search results');

		// Test search with order
		$result_ordered = dd_ontology_db_manager::search([
			'parent' => 'dd1'
		], true);

		$this->assertIsArray($result_ordered, 'Expected array result for ordered search');
		$this->assertEquals($tipo1, $result_ordered[0], 'Expected tipo1 to be first (order_number=1)');

		// Test search with limit
		$result_limited = dd_ontology_db_manager::search([
			'parent' => 'dd1'
		], false, 1);

		$this->assertIsArray($result_limited, 'Expected array result for limited search');
		$this->assertEquals(1, count($result_limited), 'Expected exactly 1 result with limit=1');

		// Test search with order and limit
		$result_ordered_limited = dd_ontology_db_manager::search([
			'tld' => 'dd'
		], true, 2);

		$this->assertIsArray($result_ordered_limited, 'Expected array result for ordered+limited search');
		$this->assertLessThanOrEqual(2, count($result_ordered_limited), 'Expected at most 2 results');

		// Test search with operator (object value)
		$result_operator = dd_ontology_db_manager::search([
			'order_number' => (object)[
				'operator' => '>',
				'value' => 1
			]
		]);

		$this->assertIsArray($result_operator, 'Expected array result for operator search');
		$this->assertContains($tipo2, $result_operator, 'Expected tipo2 in operator search results');
		$this->assertContains($tipo3, $result_operator, 'Expected tipo3 in operator search results');
		$this->assertNotContains($tipo1, $result_operator, 'Expected tipo1 NOT in operator search results');

		// Test search with no results
		$result_empty = dd_ontology_db_manager::search([
			'parent' => 'nonexistent_parent_999'
		]);

		$this->assertIsArray($result_empty, 'Expected array result for empty search');
		$this->assertEmpty($result_empty, 'Expected empty array for non-matching search');

		// Test search with empty values (should fail)
		$result_invalid = dd_ontology_db_manager::search([]);
		$this->assertFalse($result_invalid, 'Expected false when searching with empty values');

		// Test search with invalid column (should fail)		
		$result = dd_ontology_db_manager::search([
			'invalid_column_name' => 'value'
		]);
		$this->assertFalse($result, 'Expected false when searching with invalid column name');

		
		// massive seaech
		$this->execution_timing(
			'search',
			function($i) {
				return dd_ontology_db_manager::search(
					[
						'parent' => 'dd' . $i
					],
					true
				);
			},
			35, // estimated time ms
			1, // from sid
			10000 // n records
		);


		// Clean up test records
		dd_ontology_db_manager::delete($tipo1);
		dd_ontology_db_manager::delete($tipo2);
		dd_ontology_db_manager::delete($tipo3);
	}//end test_search



	/**
	 * TEST_create_edge_cases
	 * @return void
	 */
	public function test_create_edge_cases(): void
	{
		// Test 1: Upsert behavior (create same tipo twice)
		$tipo_upsert = 'test_upsert_99';
		$id1 = dd_ontology_db_manager::create($tipo_upsert, ['parent' => 'dd1']);
		$id2 = dd_ontology_db_manager::create($tipo_upsert, ['parent' => 'dd2']);
		
		// Should return same ID (upsert)
		$this->assertEquals($id1, $id2, 'Expected same ID for upsert');
		
		// Verify parent was updated
		$result = dd_ontology_db_manager::read($tipo_upsert);
		$this->assertEquals('dd2', $result['parent'], 'Expected parent to be updated');

		// Test 2: Create with all NULL values
		$tipo_nulls = 'test_nulls_100';
		$id_nulls = dd_ontology_db_manager::create($tipo_nulls, [
			'parent' => null,
			'term' => null,
			'properties' => null
		]);
		$this->assertIsInt($id_nulls, 'Expected integer ID for NULL values');
	}//end test_create_edge_cases



	/**
	 * TEST_read_edge_cases
	 * @return void
	 */
	public function test_read_edge_cases(): void
	{
		// Test 1: Read non-existent tipo
		$result_nonexistent = dd_ontology_db_manager::read('nonexistent_tipo_999');
		$this->assertEquals([], $result_nonexistent, 'Expected empty array for non-existent tipo');

		// Test 2: Cache behavior - verify cache is used
		$tipo_cache = 'test_cache_101';
		dd_ontology_db_manager::create($tipo_cache, ['parent' => 'dd1']);
		
		// First read (not cached)
		$result1 = dd_ontology_db_manager::read($tipo_cache);
		
		// Second read (should be cached)
		$start_time = start_time();
		$result2 = dd_ontology_db_manager::read($tipo_cache);
		$total_time = exec_time_unit($start_time);
		
		$this->assertEquals($result1, $result2, 'Expected same result from cache');
		$this->assertLessThan(0.01, $total_time, 'Expected cached read to be very fast');

		// Test 3: Read with complex JSON data
		$tipo_json = 'test_json_102';
		$complex_term = (object)[
			'lg-eng' => 'English Term',
			'lg-spa' => 'Término Español',
			'lg-fra' => 'Terme Français'
		];
		dd_ontology_db_manager::create($tipo_json, ['term' => $complex_term]);
		
		$result_json = dd_ontology_db_manager::read($tipo_json);
		$this->assertIsObject($result_json['term'], 'Expected term to be object');
		$this->assertEquals('English Term', $result_json['term']->{'lg-eng'});
	}//end test_read_edge_cases



	/**
	 * TEST_update_edge_cases
	 * @return void
	 */
	public function test_update_edge_cases(): void
	{
		$tipo = 'test_update_edge_103';
		dd_ontology_db_manager::create($tipo, ['parent' => 'dd1']);

		// Test 1: Update with empty values (should fail)
		$result_empty = dd_ontology_db_manager::update($tipo, []);
		$this->assertFalse($result_empty, 'Expected false for empty values');

		// Test 2: Update with invalid column (should fail)		
		$result = dd_ontology_db_manager::update($tipo, [
			'invalid_column' => 'value'
		]);
		$this->assertFalse($result, 'Expected false for invalid column');

		// Test 3: Update with NULL to clear values
		dd_ontology_db_manager::update($tipo, [
			'parent' => null,
			'properties' => null
		]);
		
		$result = dd_ontology_db_manager::read($tipo);
		$this->assertNull($result['parent'], 'Expected parent to be NULL');
		$this->assertNull($result['properties'], 'Expected properties to be NULL');

		// Test 4: Update boolean values
		dd_ontology_db_manager::update($tipo, [
			'is_model' => true,
			'is_translatable' => false
		]);
		
		$result_bool = dd_ontology_db_manager::read($tipo);
		$this->assertTrue($result_bool['is_model'], 'Expected is_model to be true');
		$this->assertFalse($result_bool['is_translatable'], 'Expected is_translatable to be false');
	}//end test_update_edge_cases



	/**
	 * TEST_delete_edge_cases
	 * @return void
	 */
	public function test_delete_edge_cases(): void
	{
		// Test 1: Delete non-existent tipo (should still return true)
		$result_nonexistent = dd_ontology_db_manager::delete('nonexistent_tipo_999');
		$this->assertTrue($result_nonexistent, 'Expected true even for non-existent tipo');

		// Test 2: Delete and verify cache is cleared
		$tipo_cache = 'test_delete_cache_104';
		dd_ontology_db_manager::create($tipo_cache);
		dd_ontology_db_manager::read($tipo_cache); // Cache it
		
		dd_ontology_db_manager::delete($tipo_cache);
		
		$result_after_delete = dd_ontology_db_manager::read($tipo_cache);
		$this->assertEquals([], $result_after_delete, 'Expected empty array after delete');

		// Test 3: Double delete (delete already deleted record)
		$tipo_double = 'test_double_delete_105';
		dd_ontology_db_manager::create($tipo_double);
		
		$result1 = dd_ontology_db_manager::delete($tipo_double);
		$this->assertTrue($result1, 'First delete should succeed');
		
		$result2 = dd_ontology_db_manager::delete($tipo_double);
		$this->assertTrue($result2, 'Second delete should also return true');
	}//end test_delete_edge_cases



	/**
	 * TEST_search_edge_cases
	 * @return void
	 */
	public function test_search_edge_cases(): void
	{
		// Test 1: Search with empty values (should fail)
		$result_empty = dd_ontology_db_manager::search([]);
		$this->assertFalse($result_empty, 'Expected false for empty search values');

		// Test 2: Search with invalid column (should fail)
		$result = dd_ontology_db_manager::search([
			'invalid_column' => 'value'
		]);
		$this->assertFalse($result, 'Expected false for invalid column');

		// Test 3: Search with no results
		$result_no_match = dd_ontology_db_manager::search([
			'parent' => 'nonexistent_parent_999'
		]);
		$this->assertIsArray($result_no_match, 'Expected array for no results');
		$this->assertEmpty($result_no_match, 'Expected empty array for no matches');

		// Test 4: Search with operator and limit
		$tipo1 = 'test_search_edge_106';
		$tipo2 = 'test_search_edge_107';
		$tipo3 = 'test_search_edge_108';
		
		dd_ontology_db_manager::create($tipo1, ['order_number' => 10]);
		dd_ontology_db_manager::create($tipo2, ['order_number' => 20]);
		dd_ontology_db_manager::create($tipo3, ['order_number' => 30]);
		
		$result_operator = dd_ontology_db_manager::search([
			'order_number' => (object)['operator' => '>', 'value' => 15]
		], true, 1);
		
		$this->assertIsArray($result_operator, 'Expected array result');
		$this->assertEquals(1, count($result_operator), 'Expected exactly 1 result with limit');
		$this->assertEquals($tipo2, $result_operator[0], 'Expected tipo2 (order_number=20) to be first');
		
		// Cleanup
		dd_ontology_db_manager::delete($tipo1);
		dd_ontology_db_manager::delete($tipo2);
		dd_ontology_db_manager::delete($tipo3);
	}//end test_search_edge_cases



}//end class dd_ontology_db_manager_test
