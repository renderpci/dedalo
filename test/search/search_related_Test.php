<?php declare(strict_types=1);
// PHPUnit classes
use PHPUnit\Framework\TestCase;
use PHPUnit\Framework\Attributes\TestDox;
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class search_related_test extends TestCase {



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



	/////////// ⬇︎ test start ⬇︎ ////////////////



	/**
	* TEST_parse_search_query_object
	* @return void
	*/
	public function test_parse_search_query_object() {

		$sqo = json_decode('
			{
			    "id": null,
			    "section_tipo": [
			        "all"
			    ],
			    "mode": "related",
			    "filter": null,
			    "limit": "ALL",
			    "offset": false,
			    "full_count": false,
			    "order": null,
			    "order_custom": null,
			    "filter_by_locators": [
			        {
			            "section_tipo": "dd922",
			            "section_id": "1"
			        }
			    ],
			    "allow_sub_select_by_id": null,
			    "children_recursive": null,
			    "remove_distinct": null,
			    "skip_projects_filter": null,
			    "parsed": false,
			    "select": [],
			    "generated_time": null
			}
		');

		$search = search::get_instance(
			$sqo // object sqo
		);
		$result = $search->parse_search_query_object(
			false
		);

		$this->assertTrue(
			gettype($result)==='string',
			'expected type string : ' . PHP_EOL
				. gettype($result)
		);

		$reference = strpos($result, 'matrix_list')!==false;
		$this->assertTrue(
			$reference,
			'expected true for matrix_list exists in result : ' . PHP_EOL
				. 'reference: ' . to_string($reference) . PHP_EOL
				. 'result: ' . to_string($result) . PHP_EOL
				. 'sqo: ' . to_string($sqo)
		);
	}//end test_parse_search_query_object



	/**
	* TEST_get_referenced_locators
	* @return void
	*/
	public function test_get_referenced_locators() {

		$filter_locator = (object)[
			'section_tipo'	=> 'test3',
			'section_id'	=> '1'
		];

		$result = search_related::get_referenced_locators(
			[$filter_locator]
		);

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
	}//end test_get_referenced_locators



}//end class search_related_test
