<?php
declare(strict_types=1);
// PHPUnit classes
use PHPUnit\Framework\TestCase;
use PHPUnit\Framework\Attributes\TestDox;
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class search_tm_test extends TestCase {



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
		$result = $search_tm->build_sql_filter_by_locators_order();

		$this->assertTrue(
			gettype($result)==='string',
			'expected type string : ' . PHP_EOL
				. gettype($result) . PHP_EOL
				. to_string($result)
		);

		$expected = 'ORDER BY id DESC';
		$this->assertTrue(
			$result===$expected,
			'expected / result : ' . PHP_EOL
			. to_string($expected). PHP_EOL
			. to_string($result)
		);
	}//end test_build_sql_filter_by_locators_order



	/**
	* TEST_build_sql_query_select
	* @return void
	*/
	public function test_build_sql_query_select() {

		$sqo = $this->get_sqo_base();

		$search_tm = search::get_instance(
			$sqo, // object sqo
		);
		$result = $search_tm->build_sql_query_select(false);

		$this->assertTrue(
			gettype($result)==='string',
			'expected type string : ' . PHP_EOL
				. gettype($result) . PHP_EOL
				. to_string($result)
		);

		$expected = '*';
		$this->assertTrue(
			$result===$expected,
			'expected / result : ' . PHP_EOL
			. to_string($expected). PHP_EOL
			. to_string($result)
		);
	}//end test_build_sql_query_select



}//end class search_tm_test
