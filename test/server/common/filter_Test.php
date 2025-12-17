<?php declare(strict_types=1);
// PHPUnit classes
use PHPUnit\Framework\TestCase;
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class filter_test extends TestCase {


	/**
	* TEST_get_user_projects
	* @return void
	*/
	public function test_get_user_projects() {

		$user_id = 1;

		$result = filter::get_user_projects(
			$user_id
		);

		$this->assertTrue(
			gettype($result)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_user_projects



	/**
	* TEST_get_user_authorized_projects_cache_key
	* @return void
	*/
	public function test_get_user_authorized_projects_cache_key() {

		$user_id = 1;

		$result = filter::get_user_authorized_projects_cache_key(
			$user_id,
			'test52'
		);

		$this->assertTrue(
			gettype($result)==='string',
			'expected type string : ' . PHP_EOL
				. gettype($result)
		);

		$eq = 'user_authorized_projects_1_test52';
		$this->assertTrue(
			$result===$eq,
			'expected equal : ' . PHP_EOL
				. to_string($result) . PHP_EOL
				. to_string($eq)
		);
	}//end test_get_user_authorized_projects_cache_key



	/**
	* TEST_clean_cache
	* @return void
	*/
	public function test_clean_cache() {

		$user_id = 1;

		$result = filter::clean_cache(
			$user_id,
			'test52'
		);

		$this->assertTrue(
			gettype($result)==='boolean',
			'expected type boolean : ' . PHP_EOL
				. gettype($result)
		);

		$eq = true;
		$this->assertTrue(
			$result===$eq,
			'expected equal : ' . PHP_EOL
				. to_string($result) . PHP_EOL
				. to_string($eq)
		);
	}//end test_clean_cache



	/**
	* TEST_get_user_authorized_projects
	* @return void
	*/
	public function test_get_user_authorized_projects() {

		$user_id = 1;

		$result = filter::get_user_authorized_projects(
			$user_id,
			'test52'
		);

		$this->assertTrue(
			gettype($result)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_user_authorized_projects



	/**
	* TEST_get_filter_user_records_by_id
	* @return void
	*/
	public function test_get_filter_user_records_by_id() {

		$user_id = 1;

		$result = filter::get_filter_user_records_by_id(
			$user_id
		);

		$this->assertTrue(
			gettype($result)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_filter_user_records_by_id



}//end class filter_test
