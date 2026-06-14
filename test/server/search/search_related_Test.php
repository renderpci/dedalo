<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class search_related_test extends BaseTestCase {



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
	* TEST_parse_sql_query
	* @return void
	*/
	public function test_parse_sql_query() {

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
		$result = $search->parse_sql_query(
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
	}//end test_parse_sql_query



	/**
	* TEST_get_referenced_locators
	* @return void
	*/
	public function test_get_referenced_locators() {

		$_ENV['DEDALO_LAST_ERROR'] = null; // reset

		$filter_locator = (object)[
			'section_tipo'	=> 'rsc1242',
			'section_id'	=> '51'
		];

		$filter_locators	= [$filter_locator];
		$limit				= null;
		$offset				= null;
		$count				= false;
		$target_section		= ['all'];

		$result = search_related::get_referenced_locators(
			$filter_locators,
			$limit,
			$offset,
			$count,
			$target_section
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



	/**
	* TEST_injection_limit_not_interpolated_related
	* A payload limit/offset on a 'related' search must be coerced, not interpolated.
	* @return void
	*/
	public function test_injection_limit_not_interpolated_related() {

		$sqo = (object)[
			'section_tipo'			=> ['all'],
			'mode'					=> 'related',
			'limit'					=> '10) UNION SELECT section_id, datos, relation FROM matrix_users --',
			'offset'				=> '5; DROP TABLE matrix_list',
			'full_count'			=> false,
			'filter_by_locators'	=> [
				(object)['section_tipo'=>'dd922', 'section_id'=>'1']
			]
		];

		$search    = search::get_instance($sqo);
		$sql_query = $search->parse_sql_query();

		$this->assertStringNotContainsString('UNION SELECT', $sql_query, 'related limit payload must not reach SQL');
		$this->assertStringNotContainsString('DROP TABLE', $sql_query, 'related offset payload must not reach SQL');
		$this->assertStringContainsString('LIMIT 10', $sql_query, 'related limit must be coerced to its integer value');
		$this->assertStringContainsString('OFFSET 5', $sql_query, 'related offset must be coerced to its integer value');

	}//end test_injection_limit_not_interpolated_related



	/**
	* TEST_injection_group_by_not_interpolated_related
	* A malicious group_by entry must be dropped, not interpolated as a SQL column.
	* A legitimate entry (section_tipo) must survive.
	* @return void
	*/
	public function test_injection_group_by_not_interpolated_related() {

		// malicious group_by: must be dropped
		$sqo_bad = (object)[
			'section_tipo'			=> ['all'],
			'mode'					=> 'related',
			'group_by'				=> ['section_id, (SELECT datos FROM matrix_users LIMIT 1) AS x'],
			'filter_by_locators'	=> [ (object)['section_tipo'=>'dd922', 'section_id'=>'1'] ]
		];
		$sql_bad = search::get_instance($sqo_bad)->parse_sql_query();
		$this->assertStringNotContainsString('SELECT datos FROM matrix_users', $sql_bad, 'group_by payload must not reach SQL');
		$this->assertStringNotContainsString('AS x', $sql_bad, 'group_by payload must not reach SQL');

		// legitimate group_by: must survive into GROUP BY
		$sqo_ok = (object)[
			'section_tipo'			=> ['all'],
			'mode'					=> 'related',
			'group_by'				=> ['section_tipo'],
			'filter_by_locators'	=> [ (object)['section_tipo'=>'dd922', 'section_id'=>'1'] ]
		];
		$sql_ok = search::get_instance($sqo_ok)->parse_sql_query();
		$this->assertStringContainsString('GROUP BY section_tipo', $sql_ok, 'legitimate group_by must be preserved');

	}//end test_injection_group_by_not_interpolated_related



	/**
	* TEST_injection_tables_and_op_related
	* Malicious 'tables' and 'filter_by_locators_op' must not be interpolated.
	* @return void
	*/
	public function test_injection_tables_and_op_related() {

		$sqo = (object)[
			'section_tipo'			=> ['all'],
			'mode'					=> 'related',
			'tables'				=> ['matrix_list"; DROP TABLE matrix_users; --'],
			'filter_by_locators_op'	=> 'OR 1=1 OR',
			'filter_by_locators'	=> [
				(object)['section_tipo'=>'dd922', 'section_id'=>'1'],
				(object)['section_tipo'=>'dd922', 'section_id'=>'2']
			]
		];

		$sql_query = search::get_instance($sqo)->parse_sql_query();

		// injected table name dropped (not a known matrix table) -> empty result query
		$this->assertStringNotContainsString('DROP TABLE', $sql_query, 'tables payload must not reach SQL');
		// injected operator must not appear; only AND/OR allowed
		$this->assertStringNotContainsString('1=1', $sql_query, 'filter_by_locators_op payload must not reach SQL');

	}//end test_injection_tables_and_op_related



}//end class search_related_test
