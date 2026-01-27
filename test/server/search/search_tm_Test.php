<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class search_tm_test extends BaseTestCase {



	/**
	* GET_SQO_BASE
	* @return object $sqo_base
	*/
	private function get_sqo_base() {

		$sqo_base = json_decode('
			{
				"id": "tmp",
				"mode": "tm",
				"section_tipo": [
					"dd623"
				],
				"order": [
					{
						"direction": "DESC",
						"path": [
							{
								"component_tipo": "id"
							}
						]
					}
				],
				"filter_by_locators": [
					{
						"section_tipo": "dd623",
						"section_id": "23",
						"tipo": "dd641",
						"lang": "lg-nolan"
					}
				]
			}
		');

		return $sqo_base;
	}//end get_sqo_base



	/**
	* TEST_USER_LOGIN
	* @return void
	*/
	private function test_user_login() {

		$user_id = TEST_USER_ID; // Defined in bootstrap

		if (login::is_logged()===false) {
			login_test::force_login($user_id);
		}

		$this->assertTrue(
			login::is_logged()===true ,
			'expected login true'
		);
	}//end test_user_login



	/////////// ⬇︎ test start ⬇︎ ////////////////



	/**
	* TEST_build_full_count_sql_query_select
	* @return void
	*/
	public function test_build_full_count_sql_query_select() {

		$sqo = $this->get_sqo_base();

		$search_tm = search::get_instance(
			$sqo, // object sqo
		);
		$result = $search_tm->build_full_count_sql_query_select();

		$this->assertTrue(
			gettype($result)==='string',
			'expected type string : ' . PHP_EOL
				. gettype($result) . PHP_EOL
				. to_string($result)
		);

		$expected = 'count(dd623.section_id) as full_count';
		$this->assertTrue(
			$result===$expected,
			'expected / result : ' . PHP_EOL
			. to_string($expected). PHP_EOL
			. to_string($result)
		);
	}//end test_build_full_count_sql_query_select



	/**
	* TEST_build_sql_filter_by_locators_order
	* @return void
	*/
	public function test_build_sql_filter_by_locators_order() {

		$sqo = $this->get_sqo_base();

		$search_tm = search::get_instance(
			$sqo, // object sqo
		);
		$search_tm->build_sql_filter_by_locators_order();

		// Use reflection to access protected sql_obj property
		$reflection = new ReflectionClass($search_tm);
		$property = $reflection->getProperty('sql_obj');
		$property->setAccessible(true);
		$sql_obj = $property->getValue($search_tm);

		// Verify sql_obj->order is set
		$this->assertTrue(
			!empty($sql_obj->order),
			'expected sql_obj->order to be set'
		);

		// Verify order contains expected string
		$this->assertTrue(
			in_array('id DESC', $sql_obj->order),
			'expected sql_obj->order to contain "id DESC"'
		);

		// Execute search and verify SQL query contains ORDER BY
		$search_tm->search();
		$sql_query = $search_tm->get_sql_query();

		$expected = 'ORDER BY id DESC';
		$this->assertTrue(
			strpos($sql_query, $expected) !== false,
				'expected: ' .  to_string($expected). PHP_EOL
				.'sql_query: '.to_string($sql_query)
		);
	}//end test_build_sql_filter_by_locators_order



	/**
	* TEST_build_sql_query_order
	* @return void
	*/
	public function test_build_sql_query_order() {

		$sqo = $this->get_sqo_base();

		$search_tm = search::get_instance(
			$sqo, // object sqo
		);
		$search_tm->build_sql_query_order();

		// Use reflection to access protected sql_obj property
		$reflection = new ReflectionClass($search_tm);
		$property = $reflection->getProperty('sql_obj');
		$property->setAccessible(true);
		$sql_obj = $property->getValue($search_tm);

		// Verify sql_obj->order is set
		$this->assertTrue(
			!empty($sql_obj->order),
			'expected sql_obj->order to be set'
		);

		// Verify order contains expected string
		$this->assertTrue(
			in_array('id DESC', $sql_obj->order),
			'expected sql_obj->order to contain "id DESC"'
		);

		// Verify order_default is set
		$this->assertTrue(
			!empty($sql_obj->order_default),
			'expected sql_obj->order_default to be set'
		);

		// Verify order_default contains expected string
		$this->assertTrue(
			in_array('id DESC', $sql_obj->order_default),
			'expected sql_obj->order_default to contain "id DESC"'
		);

		// Execute search and verify SQL query contains ORDER BY
		$search_tm->search();
		$sql_query = $search_tm->get_sql_query();

		$expected = 'ORDER BY id DESC';
		$this->assertTrue(
			strpos($sql_query, $expected) !== false,
			'expected SQL query to contain: ' . to_string($expected) . PHP_EOL
			. 'sql_query: ' . to_string($sql_query)
		);
	}//end test_build_sql_query_order



	/**
	* TEST_build_sql_query_select
	* @return void
	*/
	public function test_build_sql_query_select() {

		$sqo = $this->get_sqo_base();

		$search_tm = search::get_instance(
			$sqo, // object sqo
		);
		$search_tm->build_sql_query_select();

		// Use reflection to access protected sql_obj property
		$reflection = new ReflectionClass($search_tm);
		$property = $reflection->getProperty('sql_obj');
		$property->setAccessible(true);
		$sql_obj = $property->getValue($search_tm);

		// Verify sql_obj->select is set
		$this->assertTrue(
			!empty($sql_obj->select),
			'expected sql_obj->select to be set'
		);

		// Verify select contains wildcard
		$select_string = implode('', $sql_obj->select);
		$this->assertTrue(
			strpos($select_string, '*') !== false,
			'expected sql_obj->select to contain "*"'
		);

		// Execute search and verify SQL query contains SELECT *
		$search_tm->search();
		$sql_query = $search_tm->get_sql_query();

		$this->assertTrue(
			strpos($sql_query, 'SELECT') !== false,
			'expected SQL query to contain SELECT'
		);

		$this->assertTrue(
			strpos($sql_query, '*') !== false,
			'expected SQL query to contain "*" : ' . PHP_EOL
			. 'sql_query: ' . to_string($sql_query)
		);
	}//end test_build_sql_query_select



	/**
	* TEST_build_sql_query_select_with_full_count
	* @return void
	*/
	public function test_build_sql_query_select_with_full_count() {

		$sqo = $this->get_sqo_base();
		$sqo->full_count = true; // Enable full count

		$search_tm = search::get_instance(
			$sqo, // object sqo
		);
		$search_tm->build_sql_query_select();

		// When full_count is true, build_sql_query_select should return early
		// and not populate sql_obj->select with standard columns
		// Instead, build_full_count_sql_query_select is called

		// Execute search and verify SQL query
		$search_tm->search();
		$sql_query = $search_tm->get_sql_query();

		$this->assertTrue(
			strpos($sql_query, 'SELECT') !== false,
			'expected SQL query to contain SELECT'
		);
	}//end test_build_sql_query_select_with_full_count



	/**
	* TEST_matrix_table
	* @return void
	*/
	public function test_matrix_table() {

		$sqo = $this->get_sqo_base();

		$search_tm = search::get_instance(
			$sqo, // object sqo
		);

		// Verify matrix_table is set to 'matrix_time_machine'
		$reflection = new ReflectionClass($search_tm);
		$property = $reflection->getProperty('matrix_table');
		$property->setAccessible(true);
		$matrix_table = $property->getValue($search_tm);

		$this->assertTrue(
			$matrix_table === 'matrix_time_machine',
			'expected matrix_table to be "matrix_time_machine", got: ' . to_string($matrix_table)
		);

		// Execute search and verify SQL query uses correct table
		$search_tm->search();
		$sql_query = $search_tm->get_sql_query();

		$this->assertTrue(
			strpos($sql_query, 'matrix_time_machine') !== false,
			'expected SQL query to contain "matrix_time_machine" : ' . PHP_EOL
			. 'sql_query: ' . to_string($sql_query)
		);
	}//end test_matrix_table



}//end class search_tm_test
