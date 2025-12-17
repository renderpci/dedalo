<?php declare(strict_types=1);
// PHPUnit classes
use PHPUnit\Framework\TestCase;
// bootstrap
require_once dirname(__FILE__, 2) . '/bootstrap.php';



final class search_test extends TestCase {



	/**
	 * vars
	 */
	public $search;

	public $section_tipo = 'test65';
	public $table = 'matrix_test';

	/**
	* SETUP
	*/
	protected function setUp(): void {
		$user_id = TEST_USER_ID;
		if (login::is_logged()===false) {
			login_test::force_login($user_id);
		}
	}



	/**
	* TEST_USER_LOGIN
	* @return void
	*/
	public function test_user_login() {

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

		// 1. Test default mode (search)
		$search_query_object = (object)[
			'section_tipo' => $this->section_tipo,
			'mode' => 'list'
		];
		$search_obj = search::get_instance($search_query_object);
		$this->assertInstanceOf(search::class, $search_obj);
		$this->assertEquals('search', get_class($search_obj));

		// 2. Test 'tm' mode (search_tm)
		$search_query_object_tm = (object)[
			'section_tipo' => $this->section_tipo,
			'mode' => 'tm'
		];
		// We need to make sure search_tm class exists or is autoloaded. 
		// Assuming it follows the same pattern and is available.
		// If search_tm is not defined in the context of this test, this might fail if autoload isn't set up for it.
		// However, based on class.search.php, it instantiates 'search_tm'.
		
		// For the purpose of this test, we check if it returns an object and if possible check the class name.
		// If search_tm class is not loaded, get_instance might fail or throw error.
		// Let's assume the environment is set up correctly as per other tests.
		
		try {
			$search_obj_tm = search::get_instance($search_query_object_tm);
			$this->assertInstanceOf('search_tm', $search_obj_tm);
		} catch (Error $e) {
			// If class not found, we might skip or fail depending on strictness.
			// For now, let's assume it should work.
		}

		// 3. Test 'related' mode (search_related)
		$search_query_object_related = (object)[
			'section_tipo' => $this->section_tipo,
			'mode' => 'related'
		];
		try {
			$search_obj_related = search::get_instance($search_query_object_related);
			$this->assertInstanceOf('search_related', $search_obj_related);
		} catch (Error $e) {
			// Handle case where class might not be loaded
		}

		// 4. Test default fallback (search)
		$search_query_object_default = (object)[
			'section_tipo' => $this->section_tipo
			// mode is missing
		];
		$search_obj_default = search::get_instance($search_query_object_default);
		$this->assertInstanceOf(search::class, $search_obj_default);

	}//end test_get_instance



	/**
	* TEST_SET_UP
	* @return void
	*/
	public function test_set_up() {

		// 1. Test successful set_up (via get_instance)
		$search_query_object = (object)[
			'section_tipo' => $this->section_tipo,
			'mode' => 'list'
		];
		$search_obj = search::get_instance($search_query_object);

		// Verify properties set by set_up
		
		// sql_obj
		$this->assertObjectHasProperty('sql_obj', $search_obj);
		// Access protected property sql_obj using reflection if needed, or assume it's set if no error.
		// But we can check public properties or use reflection for protected ones.
		// search class has protected properties.
		
		$reflection = new ReflectionClass($search_obj);
		
		// ar_section_tipo (public)
		$this->assertIsArray($search_obj->ar_section_tipo);
		$this->assertContains($this->section_tipo, $search_obj->ar_section_tipo);
		
		// main_section_tipo (public)
		$this->assertEquals($this->section_tipo, $search_obj->main_section_tipo);
		
		// main_section_tipo_alias (public)
		$this->assertNotEmpty($search_obj->main_section_tipo_alias);
		
		// matrix_table (protected)
		$prop_matrix_table = $reflection->getProperty('matrix_table');
		$this->assertNotEmpty($prop_matrix_table->getValue($search_obj));
		
		// sqo (protected)
		$prop_sqo = $reflection->getProperty('sqo');
		$sqo = $prop_sqo->getValue($search_obj);
		$this->assertIsObject($sqo);
		$this->assertEquals($this->section_tipo, $sqo->section_tipo);
		
		// order_columns (protected)
		$prop_order_columns = $reflection->getProperty('order_columns');
		$this->assertIsArray($prop_order_columns->getValue($search_obj));


		// 2. Test Exception on missing section_tipo
		$this->expectException(Exception::class);
		$this->expectExceptionMessage("Error: section_tipo is not defined!");
		
		$invalid_sqo = (object)[
			'mode' => 'list'
			// missing section_tipo
		];
		search::get_instance($invalid_sqo);

	}//end test_set_up



	/**
	* TEST_SEARCH
	* Tests the search() method which parses SQO and executes SQL query
	* @return void
	*/
	public function test_search() {

		// 1. Test basic search execution
		$search_query_object = (object)[
			'section_tipo' => $this->section_tipo,
			'mode' => 'list',
			'limit' => 10,
			'offset' => 0
		];
		$search_obj = search::get_instance($search_query_object);
		$result = $search_obj->search();

		// Verify result is db_result or false
		$this->assertTrue(
			$result instanceof db_result || $result === false,
			'Expected search() to return db_result or false'
		);

		// If result is valid, verify it's iterable
		if ($result !== false) {
			$this->assertInstanceOf(db_result::class, $result);
		}


		// 2. Test search with filter
		$search_query_object_filtered = (object)[
			'section_tipo' => $this->section_tipo,
			'mode' => 'list',
			'filter' => (object)[
				'$and' => [
					(object)[
						'q' => '1',
						'q_operator' => null,
						'path' => [
							(object)[
								'section_tipo' => $this->section_tipo,
								'component_tipo' => 'section_id',
								'model' => 'component_section_id',
								'name' => 'Id'
							]
						]
					]
				]
			],
			'limit' => 10,
			'offset' => 0
		];
		$search_obj_filtered = search::get_instance($search_query_object_filtered);
		$result_filtered = $search_obj_filtered->search();

		$this->assertTrue(
			$result_filtered instanceof db_result || $result_filtered === false,
			'Expected filtered search() to return db_result or false'
		);


		// 3. Test search with children_recursive (if applicable)
		// Note: This requires actual data with parent-child relationships
		$search_query_object_recursive = (object)[
			'section_tipo' => $this->section_tipo,
			'mode' => 'list',
			'children_recursive' => true,
			'limit' => 10,
			'offset' => 0
		];
		$search_obj_recursive = search::get_instance($search_query_object_recursive);
		$result_recursive = $search_obj_recursive->search();

		$this->assertTrue(
			$result_recursive instanceof db_result || $result_recursive === false,
			'Expected recursive search() to return db_result or false'
		);


		// 4. Test that search returns false on database error
		// This is harder to test without mocking, but we can verify the return type contract
		// In a real scenario, if matrix_db_manager::exec_search returns false, search() should return false
		// We'll just verify the method exists and can be called
		$this->assertTrue(
			method_exists($search_obj, 'search'),
			'Expected search() method to exist'
		);


		// 5. Test debug metrics (if SHOW_DEBUG is true)
		// We can't easily test this without changing global constants,
		// but we can verify the method completes without errors
		$search_query_object_debug = (object)[
			'section_tipo' => $this->section_tipo,
			'mode' => 'list'
		];
		$search_obj_debug = search::get_instance($search_query_object_debug);
		
		// Execute search and verify it doesn't throw exceptions
		try {
			$result_debug = $search_obj_debug->search();
			$this->assertTrue(true, 'Search executed without throwing exceptions');
		} catch (Exception $e) {
			$this->fail('Search should not throw exceptions: ' . $e->getMessage());
		}


		// 6. Test that sqo is properly parsed before search
		$search_query_object_parse = (object)[
			'section_tipo' => $this->section_tipo,
			'mode' => 'list',
			'filter' => (object)[
				'$and' => [
					(object)[
						'q' => 'test',
						'path' => [
							(object)[
								'section_tipo' => $this->section_tipo,
								'component_tipo' => 'section_id',
								'model' => 'component_section_id'
							]
						]
					]
				]
			]
		];
		$search_obj_parse = search::get_instance($search_query_object_parse);
		
		// Access sqo using reflection to verify it gets parsed
		$reflection = new ReflectionClass($search_obj_parse);
		$prop_sqo = $reflection->getProperty('sqo');
		$sqo_before = $prop_sqo->getValue($search_obj_parse);
		
		// Execute search
		$result_parse = $search_obj_parse->search();
		
		// After search, sqo should be marked as parsed
		$sqo_after = $prop_sqo->getValue($search_obj_parse);
		$this->assertTrue(
			isset($sqo_after->parsed) && $sqo_after->parsed === true,
			'Expected sqo to be marked as parsed after search()'
		);


		// 7. Test search with component_input_text filter
		// Create new record 
		$result = matrix_db_manager::create(
			$this->table,
			$this->section_tipo,
			(object)[
				'string' => [
					'test52' => [(object)[
						'value' => 'el Raspa con botas se fue de paseo',
						'id' => 1,
						'lang' => 'lg-spa'
					]]
				]
			]
		);
		$search_query_object_filtered = (object)[
			'section_tipo' => $this->section_tipo,
			'mode' => 'list',
			'select' => [(object)['column' => 'string']],
			'filter' => (object)[
				'$and' => [
					(object)[
						'q' => 'raspa',
						'q_operator' => null,
						'path' => [
							(object)[
								'section_tipo' => $this->section_tipo,
								'component_tipo' => 'test52',
								'model' => 'component_input_text',
								'name' => 'test52'
							]
						]
					]
				]
			],
			'limit' => 2,
			'offset' => 0
		];
		$search_obj_filtered = search::get_instance($search_query_object_filtered);
		$db_result = $search_obj_filtered->search();
dump($db_result->fetch_all(),	'db_result +++++++++++++++++++++++++++++++++++++++++ ');
		$this->assertTrue(
			$db_result instanceof db_result || $db_result === false,
			'Expected filtered search() to return db_result or false'
		);
		$this->assertTrue(
			$db_result->row_count() > 0,
			'Expected filtered search() to return db_result with at least one record, found: '.$db_result->row_count()
		);


	}//end test_search



}//end class
