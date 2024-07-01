<?php
declare(strict_types=1);
// PHPUnit classes
use PHPUnit\Framework\TestCase;
use PHPUnit\Framework\Attributes\TestDox;
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class search_test extends TestCase {



	/**
	 * vars
	 */
	public $search;



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
	* test__construct
	* @return void
	*/
	public function test__construct(): void {

		$_ENV['DEDALO_LAST_ERROR'] = null; // reset

		$sqo = json_decode('{
			"section_tipo": [
				"oh1"
			],
			"limit": null,
			"offset": 0
		}');

		$search = search::get_instance(
			$sqo, // object sqo
		);

		// fix
			$this->search = $search;

		$this->assertTrue(
			empty($_ENV['DEDALO_LAST_ERROR']),
			'expected running without errors. DEDALO_LAST_ERROR: ' .$_ENV['DEDALO_LAST_ERROR']
		);

		$type	= gettype($search);
		$eq		= $type==='object';
		$this->assertTrue(
			$eq,
			'expected true (class===object) and received type: ' .$type
		);

		$class	= get_class($search);
		$eq		= $class==='search';
		$this->assertTrue(
			$eq,
			'expected true (class===search) and received class: ' .$class
		);
	}//end test__construct



	/**
	* TEST_search
	* @return void
	*/
	public function test_search(): void {

		$_ENV['DEDALO_LAST_ERROR'] = null; // reset

		$sqo = json_decode('{
			"section_tipo": [
				"oh1"
			],
			"limit": null,
			"offset": 0
		}');

		$search = search::get_instance(
			$sqo, // object sqo
		);
		$result = $search->search();
			// dump($result, ' result ++ '.to_string());

		$this->assertTrue(
			empty($_ENV['DEDALO_LAST_ERROR']),
			'expected running without errors. DEDALO_LAST_ERROR: ' .$_ENV['DEDALO_LAST_ERROR']
		);

		$type	= gettype($result);
		$eq		= $type==='object';
		$this->assertTrue(
			$eq,
			'expected true (class===object) and received type: ' .$type
		);

		$type	= gettype($result->ar_records);
		$eq		= $type==='array';
		$this->assertTrue(
			$eq,
			'expected true (class===array) and received type: ' .$type
		);
	}//end test_search



	/**
	* TEST_count
	* @return void
	*/
	public function test_count(): void {

		$_ENV['DEDALO_LAST_ERROR'] = null; // reset

		$sqo = json_decode('{
			"section_tipo": [
				"oh1"
			],
			"limit": null,
			"offset": 0
		}');

		$search = search::get_instance(
			$sqo, // object sqo
		);
		$result = $search->count();
			// dump($result, ' result ++ '.to_string());

		$this->assertTrue(
			empty($_ENV['DEDALO_LAST_ERROR']),
			'expected running without errors. DEDALO_LAST_ERROR: ' .$_ENV['DEDALO_LAST_ERROR']
		);

		$type	= gettype($result);
		$eq		= $type==='object';
		$this->assertTrue(
			$eq,
			'expected true (class===object) and received type: ' .$type
		);

		$type	= gettype($result->total);
		$eq		= $type==='integer';
		$this->assertTrue(
			$eq,
			'expected true (class===integer) and received type: ' .$type
		);
	}//end test_count



	/**
	* TEST_generate_children_recursive_search
	* @return void
	*/
	public function test_generate_children_recursive_search(): void {

		$_ENV['DEDALO_LAST_ERROR'] = null; // reset

		$sqo = json_decode('{
			"section_tipo": [
				"ts1"
			],
			"limit": 2,
			"offset": 0
		}');

		$search = search::get_instance(
			$sqo, // object sqo
		);
		$result_records = $search->search();
			// dump($result_records, ' result_records ++ '.to_string());

		$result = $search->generate_children_recursive_search(
			$result_records->ar_records
		);
		// dump($result, ' result ++ '.to_string());

		$this->assertTrue(
			empty($_ENV['DEDALO_LAST_ERROR']),
			'expected running without errors. DEDALO_LAST_ERROR: ' .$_ENV['DEDALO_LAST_ERROR']
		);

		$type	= gettype($result);
		$eq		= $type==='object';
		$this->assertTrue(
			$eq,
			'expected true (class===object) and received type: ' .$type
		);

		$eq		= gettype($result->filter)==='object';
		$this->assertTrue(
			$eq,
			'expected true (type===object) and received type: ' .$type
		);
	}//end test_generate_children_recursive_search




	/**
	* TEST_pre_parse_search_query_object
	* @return void
	*/
	public function test_pre_parse_search_query_object(): void {

		$_ENV['DEDALO_LAST_ERROR'] = null; // reset

		$sqo = json_decode('{
			"section_tipo": [
				"ts1"
			],
			"limit": 2,
			"offset": 0
		}');

		$search = search::get_instance(
			$sqo, // object sqo
		);
		$search->pre_parse_search_query_object();
			// dump($search, ' search ++ '.to_string());

		$result = $search;

		$this->assertTrue(
			empty($_ENV['DEDALO_LAST_ERROR']),
			'expected running without errors. DEDALO_LAST_ERROR: ' .$_ENV['DEDALO_LAST_ERROR']
		);

		$type	= gettype($result->search_query_object);
		$eq		= $type==='object';
		$this->assertTrue(
			$eq,
			'expected true (class===object) and received type: ' .$type
		);

		$eq		= $result->search_query_object->parsed===true;
		$this->assertTrue(
			$eq,
			'expected true ($result->search_query_object->parsed===true) and received: ' . json_encode($eq)
		);
	}//end test_pre_parse_search_query_object



	/**
	* TEST_component_parser_select
	* @return void
	*/
	public function test_component_parser_select(): void {

		$_ENV['DEDALO_LAST_ERROR'] = null; // reset

		$select_object = json_decode('{
			"direction": "ASC",
			"path": [
				{
					"name": "Order",
					"model": "component_number",
					"section_tipo": "hierarchy1",
					"component_tipo": "hierarchy48"
				}
			]
		}');

		$result = search::component_parser_select(
			$select_object
		);
			// dump($result, ' result ++ '.to_string());

		// sample expected:
			// {
			//     "direction": "ASC",
			//     "path": [
			//         {
			//             "name": "Order",
			//             "model": "component_number",
			//             "section_tipo": "hierarchy1",
			//             "component_tipo": "hierarchy48"
			//         }
			//     ],
			//     "component_path": [
			//         "components",
			//         "hierarchy48",
			//         "dato",
			//         "lg-nolan"
			//     ],
			//     "type": "string"
			// }

		$this->assertTrue(
			empty($_ENV['DEDALO_LAST_ERROR']),
			'expected running without errors. DEDALO_LAST_ERROR: ' .$_ENV['DEDALO_LAST_ERROR']
		);

		$type	= gettype($result);
		$eq		= $type==='object';
		$this->assertTrue(
			$eq,
			'expected true (type===object) and received type: ' .$type
		);

		$eq		= isset($result->component_path);
		$this->assertTrue(
			$eq,
			'expected true (isset($result->component_path)) and received: ' . json_encode($eq)
		);

		$eq		= gettype($result->component_path)==='array';
		$this->assertTrue(
			$eq,
			'expected true (type===array) and received type: ' .$type
		);

		$eq		= $result->type==='string';
		$this->assertTrue(
			$eq,
			'expected true ($result->type===string) and received : ' . json_encode($result->type)
		);
	}//end test_component_parser_select



	/**
	* TEST_conform_search_query_object
	* @return void
	*/
	public function test_conform_search_query_object(): void {

		$_ENV['DEDALO_LAST_ERROR'] = null; // reset

		$op			= '$and';
		$ar_value	= json_decode('[
			{
				"q": {
					"section_id": "1",
					"section_tipo": "dd64",
					"type": "dd151",
					"from_component_tipo": "dd1354"
				},
				"q_operator": null,
				"path": [
					{
						"section_tipo": "dd1324",
						"component_tipo": "dd1354",
						"model": "component_radio_button",
						"name": "Active"
					}
				]
			}
		]');

		$result = search::conform_search_query_object(
			$op,
			$ar_value
		);
			// dump($result, ' result ++ '.to_string());

		// sample expected:
			// {
			//     "$and": [
			//         {
			//             "q": {
			//                 "section_id": "1",
			//                 "section_tipo": "dd64",
			//                 "type": "dd151",
			//                 "from_component_tipo": "dd1354"
			//             },
			//             "q_operator": null,
			//             "path": [
			//                 {
			//                     "section_tipo": "dd1324",
			//                     "component_tipo": "dd1354",
			//                     "model": "component_radio_button",
			//                     "name": "Active"
			//                 }
			//             ],
			//             "component_path": [
			//                 "relations"
			//             ],
			//             "lang": "all",
			//             "type": "jsonb",
			//             "unaccent": false,
			//             "operator": "@>",
			//             "q_parsed": "'[{\"section_id\":\"1\",\"section_tipo\":\"dd64\",\"type\":\"dd151\",\"from_component_tipo\":\"dd1354\"}]'"
			//         }
			//     ]
			// }

		$this->assertTrue(
			empty($_ENV['DEDALO_LAST_ERROR']),
			'expected running without errors. DEDALO_LAST_ERROR: ' .$_ENV['DEDALO_LAST_ERROR']
		);

		$type	= gettype($result);
		$eq		= $type==='object';
		$this->assertTrue(
			$eq,
			'expected true (type===object) and received type: ' .$type
		);

		$type	= gettype($result->{$op});
		$eq		= $type==='array';
		$this->assertTrue(
			$eq,
			'expected true (type===array) and received type: ' .$type
		);
	}//end test_conform_search_query_object



	/**
	* TEST_parse_search_query_object
	* @return void
	*/
	public function test_parse_search_query_object(): void {

		$_ENV['DEDALO_LAST_ERROR'] = null; // reset

		$sqo = json_decode('{
			"section_tipo": [
				"ts1"
			],
			"limit": 2,
			"offset": 0
		}');

		$search = search::get_instance(
			$sqo, // object sqo
		);
		$result = $search->parse_search_query_object();
			// dump($result, ' result ++ '.to_string());

		// sample expected
			// 'SELECT DISTINCT ON (ts1.section_id) ts1.section_id,
			// ts1.section_tipo,
			// ts1.datos
			// FROM matrix_hierarchy AS ts1
			// WHERE ts1.id in (
			// SELECT DISTINCT ON(ts1.section_id,ts1.section_tipo) ts1.id FROM matrix_hierarchy AS ts1
			// WHERE (ts1.section_tipo=\'ts1\') AND ts1.section_id>0
			// ORDER BY ts1.section_id ASC
			// LIMIT 2
			// )
			// ORDER BY ts1.section_id ASC
			// LIMIT 2;
			// '

		$this->assertTrue(
			empty($_ENV['DEDALO_LAST_ERROR']),
			'expected running without errors. DEDALO_LAST_ERROR: ' .$_ENV['DEDALO_LAST_ERROR']
		);

		$type	= gettype($result);
		$eq		= $type==='string';
		$this->assertTrue(
			$eq,
			'expected true (type===string) and received type: ' .$type
		);

		$result = $search->parse_search_query_object(true);
			// dump($result, ' result ++ '.to_string());

		$type	= gettype($result);
		$eq		= $type==='string';
		$this->assertTrue(
			$eq,
			'expected true (type===string) and received type: ' .$type
		);
	}//end test_parse_search_query_object



	/**
	* TEST_build_sql_query_select
	* @return void
	*/
	public function test_build_sql_query_select(): void {

		$_ENV['DEDALO_LAST_ERROR'] = null; // reset

		// single
			$sqo = (object)[
				'section_tipo' => [
					'ts1'
				]
			];

			$search = search::get_instance(
				$sqo // object sqo
			);
			$result = $search->build_sql_query_select();
				// dump($result, ' result ++ '.to_string());

			// sample expected
				// DISTINCT ON (ts1.section_id) ts1.section_id,
				// ts1.section_tipo,
				// ts1.datos

			$this->assertTrue(
				empty($_ENV['DEDALO_LAST_ERROR']),
				'expected running without errors. DEDALO_LAST_ERROR: ' .$_ENV['DEDALO_LAST_ERROR']
			);

			$type	= gettype($result);
			$eq		= $type==='string';
			$this->assertTrue(
				$eq,
				'expected true (type===string) and received type: ' .$type
			);

			$eq		= strpos($result, 'ts1.section_tipo')!==false;
			$this->assertTrue(
				$eq,
				'expected true (strpos($result, ts1.section_tipo)!==false) and received: ' . json_encode($eq)
			);

		// multiple (mix)
			$sqo = (object)[
				'section_tipo' => [
					'ts1',
					'oh1'
				]
			];

			$search = search::get_instance(
				$sqo // object sqo
			);
			$result = $search->build_sql_query_select();
				// dump($result, ' result 2 ++ '.to_string());

			$eq		= strpos($result, 'mix.section_tipo')!==false;
			$this->assertTrue(
				$eq,
				'expected true (strpos($result, mix.section_tipo)!==false) and received: ' . json_encode($eq)
			);
	}//end test_build_sql_query_select



	/**
	* TEST_build_sql_projects_filter
	* @return void
	*/
	public function test_build_sql_projects_filter(): void {

		$_ENV['DEDALO_LAST_ERROR'] = null; // reset

		// single
			$sqo = json_decode('{
				"section_tipo" : [
					"rsc170"
				],
				"filter": {
					"$and": [
						{
							"q": [
								{
									"section_id": "1",
									"section_tipo": "dd64",
									"from_component_tipo": "rsc20"
								}
							],
							"q_operator": null,
							"path": [
								{
									"name": "Publicable",
									"model": "component_publication",
									"section_tipo": "rsc170",
									"component_tipo": "rsc20"
								}
							],
							"type": "jsonb"
						}
					]
				}
			}');

			$search = search::get_instance(
				$sqo // object sqo
			);
			$result = $search->build_sql_projects_filter(
				true // force_calculate
			);
			// dump($result, ' result ++ '.to_string());

			// sample expected
				// -- filter_by_projects --
				// AND rs170.datos#>>'{components}' = 'IMPOSSIBLE VALUE (User without projects)'

			$this->assertTrue(
				empty($_ENV['DEDALO_LAST_ERROR']),
				'expected running without errors. DEDALO_LAST_ERROR: ' .$_ENV['DEDALO_LAST_ERROR']
			);

			$type	= gettype($result);
			$eq		= $type==='string';
			$this->assertTrue(
				$eq,
				'expected true (type===string) and received type: ' .$type
			);

			$eq		= !empty($result) && strlen($result)>5;
			$this->assertTrue(
				$eq,
				'expected true (!empty($result) && strlen($result)>5) and received: ' . json_encode($result)
			);
	}//end test_build_sql_projects_filter



	/**
	* TEST_build_sql_query_order_default
	* @return void
	*/
	public function test_build_sql_query_order_default(): void {

		$_ENV['DEDALO_LAST_ERROR'] = null; // reset

		// single
			$sqo = json_decode('{
				"section_tipo" : [
					"rsc170"
				]
			}');

			$search = search::get_instance(
				$sqo // object sqo
			);
			$result = $search->build_sql_query_order_default();
				// dump($result, ' result ++ '.to_string());

			// sample expected
				// rs170.section_id ASC

			$this->assertTrue(
				empty($_ENV['DEDALO_LAST_ERROR']),
				'expected running without errors. DEDALO_LAST_ERROR: ' .$_ENV['DEDALO_LAST_ERROR']
			);

			$type	= gettype($result);
			$eq		= $type==='string';
			$this->assertTrue(
				$eq,
				'expected true (type===string) and received type: ' .$type
			);

			$eq		= $result==='rs170.section_id ASC';
			$this->assertTrue(
				$eq,
				'expected true ($result===\'rs170.section_id ASC\') and received: ' . json_encode($result)
			);

		// multiple
			$sqo = json_decode('{
				"section_tipo" : [
					"rsc170", "rsc167"
				]
			}');

			$search = search::get_instance(
				$sqo // object sqo
			);
			$result = $search->build_sql_query_order_default();

			$eq		= $result==='mix.section_id ASC';
			$this->assertTrue(
				$eq,
				'expected true ($result===\'mix.section_id ASC\') and received: ' . json_encode($result)
			);
	}//end test_build_sql_query_order_default



	/**
	* TEST_build_sql_query_order
	* @return void
	*/
	public function test_build_sql_query_order(): void {

		$_ENV['DEDALO_LAST_ERROR'] = null; // reset

		// single
			$sqo = json_decode('{
				"section_tipo": [
					"rsc167","rsc176"
				],
				"limit": 10,
				"offset": 0,
				"order": [
					{
						"direction": "DESC",
						"path": [
							{
								"name": "Publication",
								"model": "component_publication",
								"section_tipo": "rsc167",
								"component_tipo": "rsc20"
							},
							{
								"name": "Value",
								"model": "component_input_text",
								"section_tipo": "dd64",
								"component_tipo": "dd62"
							}
						],
						"component_path": [
							"components",
							"dd62",
							"dato",
							"lg-eng"
						],
						"type": "string"
					}
				],
				"select": [],
				"full_count": false,
				"parsed": true
			}');

			$search = search::get_instance(
				$sqo // object sqo
			);
			$result = $search->build_sql_query_order();
				// dump($result, ' result ++ '.to_string());

			// sample expected
				// dd62_order DESC NULLS LAST , section_id ASC

			$this->assertTrue(
				empty($_ENV['DEDALO_LAST_ERROR']),
				'expected running without errors. DEDALO_LAST_ERROR: ' .$_ENV['DEDALO_LAST_ERROR']
			);

			$type	= gettype($result);
			$eq		= $type==='string';
			$this->assertTrue(
				$eq,
				'expected true (type===string) and received type: ' .$type
			);

			$eq		= $result==='dd62_order DESC NULLS LAST , section_id ASC';
			$this->assertTrue(
				$eq,
				'expected true ($result===\'dd62_order DESC NULLS LAST , section_id ASC\') and received: ' . json_encode($result)
			);
	}//end test_build_sql_query_order



	/**
	* TEST_build_main_from_sql
	* @return void
	*/
	public function test_build_main_from_sql(): void {

		$_ENV['DEDALO_LAST_ERROR'] = null; // reset

		// single
			$sqo = json_decode('{
				"section_tipo": [
					"rsc167"
				]
			}');

			$search = search::get_instance(
				$sqo // object sqo
			);
			$result = $search->build_main_from_sql();
				// dump($result, ' result ++ '.to_string());

			// sample expected
				// 'matrix AS rs167'

			$this->assertTrue(
				empty($_ENV['DEDALO_LAST_ERROR']),
				'expected running without errors. DEDALO_LAST_ERROR: ' .$_ENV['DEDALO_LAST_ERROR']
			);

			$type	= gettype($result);
			$eq		= $type==='string';
			$this->assertTrue(
				$eq,
				'expected true (type===string) and received type: ' .$type
			);

			$eq		= $result==='matrix AS rs167';
			$this->assertTrue(
				$eq,
				'expected true ($result===\'matrix AS rs167\') and received: ' . json_encode($result)
			);

		// multiple
			$sqo = json_decode('{
				"section_tipo": [
					"rsc167",
					"rsc176"
				]
			}');

			$search = search::get_instance(
				$sqo // object sqo
			);
			$result = $search->build_main_from_sql();
				// dump($result, ' result ++ '.to_string());

			// sample expected
				// matrix AS mix

			$eq		= $result==='matrix AS mix';
			$this->assertTrue(
				$eq,
				'expected true ($result===\'matrix AS mix\') and received: ' . json_encode($result)
			);
	}//end test_build_main_from_sql



	/**
	* TEST_build_main_where_sql
	* @return void
	*/
	public function test_build_main_where_sql(): void {

		$_ENV['DEDALO_LAST_ERROR'] = null; // reset

		// single
			$sqo = json_decode('{
				"section_tipo": [
					"rsc167"
				]
			}');

			$search = search::get_instance(
				$sqo // object sqo
			);
			$result = $search->build_main_where_sql();
				// dump($result, ' result ++ '.to_string());

			// sample expected
				// (rs167.section_tipo='rsc167') AND rs167.section_id>0

			$this->assertTrue(
				empty($_ENV['DEDALO_LAST_ERROR']),
				'expected running without errors. DEDALO_LAST_ERROR: ' .$_ENV['DEDALO_LAST_ERROR']
			);

			$type	= gettype($result);
			$eq		= $type==='string';
			$this->assertTrue(
				$eq,
				'expected true (type===string) and received type: ' .$type
			);

			$eq		= $result==="(rs167.section_tipo='rsc167') AND rs167.section_id>0 ";
			$this->assertTrue(
				$eq,
				'expected true ($result===\'(rs167.section_tipo=\'rsc167\') AND rs167.section_id>0 \') and received: ' . json_encode($result)
			);

		// multiple
			$sqo = json_decode('{
				"section_tipo": [
					"rsc167",
					"rsc176"
				]
			}');

			$search = search::get_instance(
				$sqo // object sqo
			);
			$result = $search->build_main_where_sql();
				// dump($result, ' result ++ '.to_string());

			// sample expected
				// "(mix.section_tipo='rsc167' OR mix.section_tipo='rsc176') AND mix.section_id>0 "

			$eq		= $result==="(mix.section_tipo='rsc167' OR mix.section_tipo='rsc176') AND mix.section_id>0 ";
			$this->assertTrue(
				$eq,
				'expected true ($result===(mix.section_tipo=\'rsc167\' OR mix.section_tipo=\'rsc176\') AND mix.section_id>0 ) and received: ' . json_encode($result)
			);
	}//end test_build_main_where_sql



	/**
	* TEST_build_sql_filter
	* @return void
	*/
	public function test_build_sql_filter(): void {

		$_ENV['DEDALO_LAST_ERROR'] = null; // reset

		// single
			$sqo = json_decode('{
				"section_tipo": [
					"rsc170"
				],
				"limit": 10,
				"offset": 0,
				"filter": {
					"$and": [
						{
							"q": [
								{
									"section_id": "1",
									"section_tipo": "dd64",
									"from_component_tipo": "rsc20"
								}
							],
							"q_operator": null,
							"path": [
								{
									"section_tipo": "rsc170",
									"component_tipo": "rsc20",
									"model": "component_publication",
									"name": "Publication"
								}
							],
							"type": "jsonb"
						}
					]
				}
			}');

			$search = search::get_instance(
				$sqo // object sqo
			);
			$search->search(); // It's necessary to exec search before call the method !
			$result = $search->build_sql_filter();
				// dump($result, ' result ++ '.to_string());

			// sample expected
				// " AND (
				// rs170.datos#>'{relations}' @> '[{"section_id":"1","section_tipo":"dd64","from_component_tipo":"rsc20"}]')"

			$this->assertTrue(
				empty($_ENV['DEDALO_LAST_ERROR']),
				'expected running without errors. DEDALO_LAST_ERROR: ' .$_ENV['DEDALO_LAST_ERROR']
			);

			$type	= gettype($result);
			$eq		= $type==='string';
			$this->assertTrue(
				$eq,
				'expected true (type===string) and received type: ' .$type
			);

			$eq		= strpos($result, "rs170.datos#>'{relations}' @>")!==false;
			$this->assertTrue(
				$eq,
				'expected true (strpos($result, "rs170.datos#>\'{relations}\' @>")!==false) and received: ' . json_encode($result)
			);
	}//end test_build_sql_filter



	/**
	* TEST_build_sql_filter_by_locators
	* @return void
	*/
	public function test_build_sql_filter_by_locators(): void {

		$_ENV['DEDALO_LAST_ERROR'] = null; // reset

		// single
			$sqo = json_decode('{
				"section_tipo": [
					"oh1"
				],
				"limit": 10,
				"offset": 0,
				"filter_by_locators": [
					{
						"section_tipo": "oh1",
						"section_id": "2"
					}
				]
			}');

			$search = search::get_instance(
				$sqo // object sqo
			);
			$result = $search->build_sql_filter_by_locators();
				// dump($result, ' result ++ '.to_string());

			// sample expected
				// " -- filter_by_locators
				// (oh1.section_id=2 AND oh1.section_tipo='oh1')"

			$this->assertTrue(
				empty($_ENV['DEDALO_LAST_ERROR']),
				'expected running without errors. DEDALO_LAST_ERROR: ' .$_ENV['DEDALO_LAST_ERROR']
			);

			$type	= gettype($result);
			$eq		= $type==='string';
			$this->assertTrue(
				$eq,
				'expected true (type===string) and received type: ' .$type
			);

			$eq		= strpos($result, "(oh1.section_id=2 AND oh1.section_tipo='oh1')")!==false;
			$this->assertTrue(
				$eq,
				'expected true (strpos($result, "(oh1.section_id=2 AND oh1.section_tipo=\'oh1\')")!==false) and received: ' . json_encode($result)
			);
	}//end test_build_sql_filter_by_locators



	/**
	* TEST_build_sql_filter_by_locators_order
	* @return void
	*/
	public function test_build_sql_filter_by_locators_order(): void {

		$_ENV['DEDALO_LAST_ERROR'] = null; // reset

		// single
			$sqo = json_decode('{
				"section_tipo": [
					"oh1"
				],
				"limit": 10,
				"offset": 0,
				"filter_by_locators": [
					{
						"section_tipo": "oh1",
						"section_id": "2"
					}
				]
			}');

			$search = search::get_instance(
				$sqo // object sqo
			);
			$result = $search->build_sql_filter_by_locators_order();
				// dump($result, ' result ++ '.to_string());

			// sample expected
				// "LEFT JOIN (VALUES ('oh1',2,1)) as x(ordering_section, ordering_id, ordering) ON main_select.section_id=x.ordering_id AND main_select.section_tipo=x.ordering_section ORDER BY x.ordering ASC"

			$this->assertTrue(
				empty($_ENV['DEDALO_LAST_ERROR']),
				'expected running without errors. DEDALO_LAST_ERROR: ' .$_ENV['DEDALO_LAST_ERROR']
			);

			$type	= gettype($result);
			$eq		= $type==='string';
			$this->assertTrue(
				$eq,
				'expected true (type===string) and received type: ' .$type
			);

			$eq		= strpos($result, "main_select.section_tipo=x.ordering_section ORDER BY x.ordering ASC")!==false;
			$this->assertTrue(
				$eq,
				'expected true (strpos($result, "main_select.section_tipo=x.ordering_section ORDER BY x.ordering ASC")!==false) and received: ' . json_encode($result)
			);
	}//end test_build_sql_filter_by_locators_order



	/**
	* TEST_filter_parser
	* @return void
	*/
	public function test_filter_parser(): void {

		$_ENV['DEDALO_LAST_ERROR'] = null; // reset

		// single
			$sqo = json_decode('{
				"section_tipo": [
					"rsc170"
				],
				"limit": 10,
				"offset": 0,
				"filter": {
					"$and": [
						{
							"q": [
								{
									"section_id": "1",
									"section_tipo": "dd64",
									"from_component_tipo": "rsc20"
								}
							],
							"q_operator": null,
							"path": [
								{
									"section_tipo": "rsc170",
									"component_tipo": "rsc20",
									"model": "component_publication",
									"name": "Publication"
								}
							],
							"type": "jsonb"
						}
					]
				}
			}');

			$op			= '$and';
			$ar_value	= json_decode('[
				{
					"q": [
						{
							"section_id": "1",
							"section_tipo": "dd64",
							"from_component_tipo": "rsc20"
						}
					],
					"q_operator": null,
					"path": [
						{
							"section_tipo": "rsc170",
							"component_tipo": "rsc20",
							"model": "component_publication",
							"name": "Publication"
						}
					],
					"type": "jsonb",
					"component_path": [
						"relations"
					],
					"lang": "all",
					"unaccent": false,
					"operator": "@>",
					"q_parsed": "\'[{\"section_id\":\"1\",\"section_tipo\":\"dd64\",\"from_component_tipo\":\"rsc20\"}]\'"
				}
			]');

			$search = search::get_instance(
				$sqo // object sqo
			);
			// $search->search();
			$result = $search->filter_parser(
				$op,
				$ar_value
			);
				// dump($result, ' result ++ '.to_string());

			// sample expected
				// -- DIRECT FORMAT - table_alias:rs170 - rsc20 - Publication - relations - COMPONENT_PUBLICATION
				// "rs170.datos#>'{relations}' @> '[{"section_id":"1","section_tipo":"dd64","from_component_tipo":"rsc20"}]'"

			$this->assertTrue(
				empty($_ENV['DEDALO_LAST_ERROR']),
				'expected running without errors. DEDALO_LAST_ERROR: ' .$_ENV['DEDALO_LAST_ERROR']
			);

			$type	= gettype($result);
			$eq		= $type==='string';
			$this->assertTrue(
				$eq,
				'expected true (type===string) and received type: ' .$type
			);

			$expected = 'rs170.datos#>\'{relations}\' @> \'[{"section_id":"1","section_tipo":"dd64","from_component_tipo":"rsc20"}]\'';
			if(SHOW_DEBUG===true) {
				$expected = '-- DIRECT FORMAT - table_alias:rs170 - rsc20 - Publication - relations - COMPONENT_PUBLICATION' . PHP_EOL . $expected;
			}

			$eq		= trim($result)===$expected;
			$this->assertTrue(
				$eq,
				'expected true trim($result)==='.$expected.' and received: ' . json_encode($result)
			);
	}//end test_filter_parser



	/**
	* TEST_build_full_count_sql_query_select
	* @return void
	*/
	public function test_build_full_count_sql_query_select(): void {

		$_ENV['DEDALO_LAST_ERROR'] = null; // reset

		// single
			$sqo = json_decode('{
				"section_tipo": [
					"rsc170"
				],
				"limit": 10,
				"offset": 0
			}');

			$search = search::get_instance(
				$sqo // object sqo
			);
			// $search->search();
			$result = $search->build_full_count_sql_query_select();
				// dump($result, ' result ++ '.to_string());

			// sample expected
				// "count(DISTINCT rs170.section_id) as full_count"

			$this->assertTrue(
				empty($_ENV['DEDALO_LAST_ERROR']),
				'expected running without errors. DEDALO_LAST_ERROR: ' .$_ENV['DEDALO_LAST_ERROR']
			);

			$type	= gettype($result);
			$eq		= $type==='string';
			$this->assertTrue(
				$eq,
				'expected true (type===string) and received type: ' .$type
			);

			$eq		= trim($result)==='count(DISTINCT rs170.section_id) as full_count';
			$this->assertTrue(
				$eq,
				'expected true trim($result)===\'count(DISTINCT rs170.section_id) as full_count\' and received: ' . json_encode($result)
			);

		// multiple
			$sqo = json_decode('{
				"section_tipo": [
					"rsc170", "rsc167"
				],
				"limit": 10,
				"offset": 0
			}');

			$search = search::get_instance(
				$sqo // object sqo
			);
			// $search->search();
			$result = $search->build_full_count_sql_query_select();
				// dump($result, ' result ++ '.to_string());

			// sample expected
				// "count(DISTINCT mix.section_id) as full_count"

			$this->assertTrue(
				empty($_ENV['DEDALO_LAST_ERROR']),
				'expected running without errors. DEDALO_LAST_ERROR: ' .$_ENV['DEDALO_LAST_ERROR']
			);

			$eq		= trim($result)==='count(DISTINCT mix.section_id) as full_count';
			$this->assertTrue(
				$eq,
				'expected true trim($result)===\'count(DISTINCT mix.section_id) as full_count\' and received: ' . json_encode($result)
			);
	}//end test_build_full_count_sql_query_select



	/**
	* TEST_build_sql_join
	* @return void
	*/
	public function test_build_sql_join(): void {

		$_ENV['DEDALO_LAST_ERROR'] = null; // reset

		$sqo = json_decode('{
			"section_tipo": [
				"rsc167","rsc176"
			],
			"limit": 10,
			"offset": 0,
			"order": [
				{
					"direction": "DESC",
					"path": [
						{
							"name": "Publication",
							"model": "component_publication",
							"section_tipo": "rsc167",
							"component_tipo": "rsc20"
						},
						{
							"name": "Value",
							"model": "component_input_text",
							"section_tipo": "dd64",
							"component_tipo": "dd62"
						}
					],
					"component_path": [
						"components",
						"dd62",
						"dato",
						"lg-eng"
					],
					"type": "string"
				}
			],
			"select": [],
			"full_count": false,
			"parsed": true
		}');

		$path = json_decode('
			[
				{
					"name": "Publication",
					"model": "component_publication",
					"section_tipo": "rsc167",
					"component_tipo": "rsc20"
				},
				{
					"name": "Value",
					"model": "component_input_text",
					"section_tipo": "dd64",
					"component_tipo": "dd62"
				}
			]
		');

		$search = search::get_instance(
			$sqo // object sqo
		);
		// $search->search();
		$search->build_sql_join($path); // only returns bool
		$result = $search->ar_sql_joins; // value is added to property 'ar_sql_joins'
			// dump($search, ' search ++ '.to_string());
			// dump($result, ' result ++ '.to_string());

		// sample expected
			// '{rs167_rs20_dd64": "\n LEFT JOIN relations AS r_rs167_rs20_dd64 ON (mix.section_id=r_rs167_rs20_dd64.section_id AND mix.section_tipo=r_rs167_rs20_dd64.section_tipo AND r_rs167_rs20_dd64.from_component_tipo=\'rsc20\')\n LEFT JOIN matrix_dd AS rs167_rs20_dd64 ON (r_rs167_rs20_dd64.target_section_id=rs167_rs20_dd64.section_id AND r_rs167_rs20_dd64.target_section_tipo=rs167_rs20_dd64.section_tipo)}'

		$this->assertTrue(
			empty($_ENV['DEDALO_LAST_ERROR']),
			'expected running without errors. DEDALO_LAST_ERROR: ' .$_ENV['DEDALO_LAST_ERROR']
		);

		$type	= gettype($result);
		$eq		= $type==='array';
		$this->assertTrue(
			$eq,
			'expected true (type===array) and received type: ' .$type
		);

		$expected  = 'LEFT JOIN relations AS r_rs167_rs20_dd64 ON (mix.section_id=r_rs167_rs20_dd64.section_id AND mix.section_tipo=r_rs167_rs20_dd64.section_tipo AND r_rs167_rs20_dd64.from_component_tipo=\'rsc20\')';
		$expected .= PHP_EOL.' LEFT JOIN matrix_dd AS rs167_rs20_dd64 ON (r_rs167_rs20_dd64.target_section_id=rs167_rs20_dd64.section_id AND r_rs167_rs20_dd64.target_section_tipo=rs167_rs20_dd64.section_tipo)';

		if(SHOW_DEBUG===true) {
			$expected  = "-- JOIN GROUP matrix_dd - rs167_rs20_dd64 - Si/No" . PHP_EOL ." ". $expected;
		}

		// dump( trim($result['rs167_rs20_dd64']), ' $result[rs167_rs20_dd64] ++ '.to_string());
		$eq		= trim($result['rs167_rs20_dd64'])===$expected;
		$this->assertTrue(
			$eq,
			'expected true trim($result)==="LEFT JOIN relations AS r_rs167_rs20_dd64 ON ..." and received: ' . json_encode($result)
		);
	}//end test_build_sql_join



	/**
	* TEST_trim_tipo
	* @return void
	*/
	public function test_trim_tipo(): void {

		$_ENV['DEDALO_LAST_ERROR'] = null; // reset

		// tipo oh1
			$tipo = 'oh1';

			$result = search::trim_tipo(
				$tipo,
				2
			);
			// dump($result, ' result ++ '.to_string());

			$this->assertTrue(
				empty($_ENV['DEDALO_LAST_ERROR']),
				'expected running without errors. DEDALO_LAST_ERROR: ' .$_ENV['DEDALO_LAST_ERROR']
			);

			$type	= gettype($result);
			$eq		= $type==='string';
			$this->assertTrue(
				$eq,
				'expected true (type===string) and received type: ' .$type
			);

			$eq		= $result===$tipo;
			$this->assertTrue(
				$eq,
				'expected true $result===$tipo and received: ' . json_encode($result)
			);

		// tipo jkelmndksjdudjdjkdasdujy2
			$tipo = 'jkelmndksjdudjdjkdasdujy2';

			$result = search::trim_tipo(
				$tipo,
				2 // max
			);
			// dump($result, ' result ++ '.to_string());

			$this->assertTrue(
				empty($_ENV['DEDALO_LAST_ERROR']),
				'expected running without errors. DEDALO_LAST_ERROR: ' .$_ENV['DEDALO_LAST_ERROR']
			);

			$type	= gettype($result);
			$eq		= $type==='string';
			$this->assertTrue(
				$eq,
				'expected true (type===string) and received type: ' .$type
			);

			$eq		= $result==='jk2';
			$this->assertTrue(
				$eq,
				'expected true $result===\'jk2\' and received: ' . json_encode($result)
			);

			$result = search::trim_tipo(
				$tipo,
				4 // max
			);
			// dump($result, ' result ++ '.to_string());

			$this->assertTrue(
				empty($_ENV['DEDALO_LAST_ERROR']),
				'expected running without errors. DEDALO_LAST_ERROR: ' .$_ENV['DEDALO_LAST_ERROR']
			);

			$type	= gettype($result);
			$eq		= $type==='string';
			$this->assertTrue(
				$eq,
				'expected true (type===string) and received type: ' .$type
			);

			$eq		= $result==='jkel2';
			$this->assertTrue(
				$eq,
				'expected true $result===\'jkel2\' and received: ' . json_encode($result)
			);

		// tipo ''
			$tipo = '';

			$result = search::trim_tipo(
				$tipo,
				2 // max
			);
			// dump($result, ' result ++ '.to_string());

			$type	= gettype($result);
			$eq		= $type==='NULL';
			$this->assertTrue(
				$eq,
				'expected true (type===NULL) and received type: ' .$type
			);

			$eq		= $result===NULL;
			$this->assertTrue(
				$eq,
				'expected true $result===NULL and received: ' . json_encode($result)
			);

		// tipo 'all'
			$tipo = 'all';

			$result = search::trim_tipo(
				$tipo,
				2 // max
			);
			// dump($result, ' result ++ '.to_string());

			$eq		= $result===$tipo;
			$this->assertTrue(
				$eq,
				'expected true $result===all and received: ' . json_encode($result)
			);

		// tipo 'holaquetal'
			$tipo = 'holaquetal';

			$result = search::trim_tipo(
				$tipo,
				2 // max
			);
			// dump($result, ' result ++ '.to_string());

			$eq		= $result===NULL;
			$this->assertTrue(
				$eq,
				'expected true $result===NULL and received: ' . json_encode($result)
			);
	}//end test_trim_tipo



	/**
	* TEST_get_sql_where
	* @return void
	*/
	public function test_get_sql_where(): void {

		$_ENV['DEDALO_LAST_ERROR'] = null; // reset

		// single
			$sqo = json_decode('{
				"section_tipo": [
					"rsc170"
				],
				"limit": 10,
				"offset": 0,
				"filter": {
					"$and": [
						{
							"q": [
								{
									"section_id": "1",
									"section_tipo": "dd64",
									"from_component_tipo": "rsc20"
								}
							],
							"q_operator": null,
							"path": [
								{
									"section_tipo": "rsc170",
									"component_tipo": "rsc20",
									"model": "component_publication",
									"name": "Publication"
								}
							],
							"type": "jsonb"
						}
					]
				}
			}');

			$search = search::get_instance(
				$sqo // object sqo
			);
			$search->search();
				// dump($search, ' search ++ '.to_string());

			$search_object = $search->search_query_object->filter->{'$and'}[0];
				// dump($search_object, ' search_object ++ '.to_string());

			$result = $search->get_sql_where(
				$search_object
			);
			// dump($result, ' result ++ '.to_string());

			// sample expected
				// rs170.datos#>'{relations}' @> '[{"section_id":"1","section_tipo":"dd64","from_component_tipo":"rsc20"}]'

			$this->assertTrue(
				empty($_ENV['DEDALO_LAST_ERROR']),
				'expected running without errors. DEDALO_LAST_ERROR: ' .$_ENV['DEDALO_LAST_ERROR']
			);

			$type	= gettype($result);
			$eq		= $type==='string';
			$this->assertTrue(
				$eq,
				'expected true (type===string) and received type: ' .$type
			);

			$expected = 'rs170.datos#>\'{relations}\' @> \'[{"section_id":"1","section_tipo":"dd64","from_component_tipo":"rsc20"}]\'';
			if(SHOW_DEBUG===true) {
				$expected = '-- DIRECT FORMAT - table_alias:rs170 - rsc20 - Publication - relations - COMPONENT_PUBLICATION' .PHP_EOL. $expected;
			}

			$eq		= trim($result)===$expected;
			$this->assertTrue(
				$eq,
				'expected true '.$expected.' and received: ' . json_encode($result)
			);
	}//end test_get_sql_where



	/**
	* TEST_resolve_array_elements
	* @return void
	*/
	public function test_resolve_array_elements(): void {

		$_ENV['DEDALO_LAST_ERROR'] = null; // reset

		$array_elements = json_decode('{
			"$or": [
				{
					"$and": [
						{
							"component_path": [
								"start",
								"time"
							],
							"operator": "<=",
							"q_parsed": "\'64699430400\'",
							"type": "jsonb"
						},
						{
							"component_path": [
								"end",
								"time"
							],
							"operator": ">=",
							"q_parsed": "\'64699430400\'",
							"type": "jsonb"
						}
					]
				},
				{
					"$and": [
						{
							"component_path": [
								"start",
								"time"
							],
							"operator": ">=",
							"q_parsed": "\'64699430400\'",
							"type": "jsonb"
						},
						{
							"component_path": [
								"start",
								"time"
							],
							"operator": "<=",
							"q_parsed": "\'64731571199\'",
							"type": "jsonb"
						}
					]
				}
			]
		}');

		$component_tipo = 'rsc26';

		$result = search::resolve_array_elements(
			$array_elements,
			$component_tipo
		);
			// dump( null, ' result ++ '.to_string($result));

		// sample expected
			// ((rsc26_array_elements#>'{start,time}' <= '64699430400' AND rsc26_array_elements#>'{end,time}' >= '64699430400')  OR (rsc26_array_elements#>'{start,time}' >= '64699430400' AND rsc26_array_elements#>'{start,time}' <= '64731571199') )

		$this->assertTrue(
			empty($_ENV['DEDALO_LAST_ERROR']),
			'expected running without errors. DEDALO_LAST_ERROR: ' .$_ENV['DEDALO_LAST_ERROR']
		);

		$type	= gettype($result);
		$eq		= $type==='string';
		$this->assertTrue(
			$eq,
			'expected true (type===string) and received type: ' .$type
		);

		$value	= "((rsc26_array_elements#>'{start,time}' <= '64699430400' AND rsc26_array_elements#>'{end,time}' >= '64699430400')  OR (rsc26_array_elements#>'{start,time}' >= '64699430400' AND rsc26_array_elements#>'{start,time}' <= '64731571199') )";
		$eq		= trim($result)===$value;
		$this->assertTrue(
			$eq,
			'expected true '.$value.' and received: ' . json_encode($result)
		);
	}//end test_resolve_array_elements



	/**
	* TEST_is_search_operator
	* @return void
	*/
	public function test_is_search_operator(): void {

		$_ENV['DEDALO_LAST_ERROR'] = null; // reset

		// true
			$search_object = json_decode('{
				"$or": [
					{
						"$and": [
							{
								"component_path": [
									"start",
									"time"
								],
								"operator": "<=",
								"q_parsed": "\'64699430400\'",
								"type": "jsonb"
							},
							{
								"component_path": [
									"end",
									"time"
								],
								"operator": ">=",
								"q_parsed": "\'64699430400\'",
								"type": "jsonb"
							}
						]
					}
				]
			}');

			$result = search::is_search_operator(
				$search_object
			);
				// dump( null, ' result ++ '.to_string($result));

			// sample expected
				// ((rsc26_array_elements#>'{start,time}' <= '64699430400' AND rsc26_array_elements#>'{end,time}' >= '64699430400')  OR (rsc26_array_elements#>'{start,time}' >= '64699430400' AND rsc26_array_elements#>'{start,time}' <= '64731571199') )

			$this->assertTrue(
				empty($_ENV['DEDALO_LAST_ERROR']),
				'expected running without errors. DEDALO_LAST_ERROR: ' .$_ENV['DEDALO_LAST_ERROR']
			);

			$type	= gettype($result);
			$eq		= $type==='boolean';
			$this->assertTrue(
				$eq,
				'expected true (type===boolean) and received type: ' .$type
			);

			$value	= true;
			$eq		= $result===$value;
			$this->assertTrue(
				$eq,
				'expected true and received: ' . json_encode($result)
			);

		// false
			$search_object = json_decode('{
				"component_path": [
					"start",
					"time"
				],
				"operator": "<=",
				"q_parsed": "\'64699430400\'",
				"type": "jsonb"
			}');

			$result = search::is_search_operator(
				$search_object
			);

			$value	= false;
			$eq		= $result===$value;
			$this->assertTrue(
				$eq,
				'expected false and received: ' . json_encode($result)
			);
	}//end test_is_search_operator



	/**
	* TEST_get_table_alias_from_path
	* @return void
	*/
	public function test_get_table_alias_from_path(): void {

		$_ENV['DEDALO_LAST_ERROR'] = null; // reset

		// single
			$sqo = json_decode('{
				"section_tipo": [
					"rsc170"
				],
				"limit": 10,
				"offset": 0,
				"filter": {
					"$and": [
						{
							"q": [
								{
									"section_id": "1",
									"section_tipo": "dd64",
									"from_component_tipo": "rsc20"
								}
							],
							"q_operator": null,
							"path": [
								{
									"section_tipo": "rsc170",
									"component_tipo": "rsc20",
									"model": "component_publication",
									"name": "Publication"
								}
							],
							"type": "jsonb"
						}
					]
				}
			}');

			$search = search::get_instance(
				$sqo // object sqo
			);
			// $search->search();
				// dump($search, ' search ++ '.to_string());

			$path = json_decode('
				[
					{
						"section_tipo": "dd1244",
						"component_tipo": "dd1242",
						"model": "component_input_text",
						"name": "Tipo"
					}
				]
			');

			$result = $search->get_table_alias_from_path(
				$path
			);
			// dump($result, ' result ++ '.to_string($result));

			// sample expected
				// rs170

			$this->assertTrue(
				empty($_ENV['DEDALO_LAST_ERROR']),
				'expected running without errors. DEDALO_LAST_ERROR: ' .$_ENV['DEDALO_LAST_ERROR']
			);

			$type	= gettype($result);
			$eq		= $type==='string';
			$this->assertTrue(
				$eq,
				'expected true (type===string) and received type: ' .$type
			);

			$value = 'rs170';
			$eq		= $result===$value;
			$this->assertTrue(
				$eq,
				'expected true '.$value.' and received: ' . json_encode($result)
			);

		// multiple
			$path = json_decode('
				[
					{
						"section_tipo": "dd1244",
						"component_tipo": "dd1242",
						"model": "component_input_text",
						"name": "Tipo"
					},
					{
						"section_tipo": "dd1245",
						"component_tipo": "dd1243",
						"model": "component_input_text",
						"name": "Tipo2"
					}
				]
			');

			$result = $search->get_table_alias_from_path(
				$path
			);
			// dump($result, ' result 2  ++ '.to_string($result));

			// sample expected
				// dd1244_dd1242_dd1245

			$value = 'dd1244_dd1242_dd1245';
			$eq		= $result===$value;
			$this->assertTrue(
				$eq,
				'expected true '.$value.' and received: ' . json_encode($result)
			);
	}//end test_get_table_alias_from_path



	/**
	* TEST_get_query_path
	* @return void
	*/
	public function test_get_query_path(): void {

		$_ENV['DEDALO_LAST_ERROR'] = null; // reset


		$tipo			= 'rsc85';
		$section_tipo	= 'rsc194';

		$result = search::get_query_path(
			$tipo,
			$section_tipo
		);
		// dump($result, ' result ++ '.to_string());

		// sample expected
			// [
			// 	{
			// 		"name": "Name",
			// 		"model": "component_input_text",
			// 		"section_tipo": "rsc194",
			// 		"component_tipo": "rsc85"
			// 	}
			// ]

		$this->assertTrue(
			empty($_ENV['DEDALO_LAST_ERROR']),
			'expected running without errors. DEDALO_LAST_ERROR: ' .$_ENV['DEDALO_LAST_ERROR']
		);

		$type	= gettype($result);
		$eq		= $type==='array';
		$this->assertTrue(
			$eq,
			'expected true (type===array) and received type: ' .$type
		);

		switch (DEDALO_DATA_LANG) {
			case 'lg-spa':
				$value = json_decode('[
					{
						"name": "Nombre",
						"model": "component_input_text",
						"section_tipo": "rsc194",
						"component_tipo": "rsc85"
					}
				]');
				break;

			case 'lg-eng':
			default:
				$value = json_decode('[
					{
						"name": "Name",
						"model": "component_input_text",
						"section_tipo": "rsc194",
						"component_tipo": "rsc85"
					}
				]');
				break;
		}
		$eq		= $result==$value;
		$this->assertTrue(
			$eq,
			'expected true and received: ' . json_encode($result)
		);
	}//end test_get_query_path



	/**
	* TEST_get_sql_joins
	* @return void
	*/
	public function test_get_sql_joins(): void {

		$_ENV['DEDALO_LAST_ERROR'] = null; // reset

		$sqo = json_decode('{
			"section_tipo": [
				"rsc167","rsc176"
			],
			"limit": 10,
			"offset": 0,
			"order": [
				{
					"direction": "DESC",
					"path": [
						{
							"name": "Publication",
							"model": "component_publication",
							"section_tipo": "rsc167",
							"component_tipo": "rsc20"
						},
						{
							"name": "Value",
							"model": "component_input_text",
							"section_tipo": "dd64",
							"component_tipo": "dd62"
						}
					],
					"component_path": [
						"components",
						"dd62",
						"dato",
						"lg-eng"
					],
					"type": "string"
				}
			],
			"select": [],
			"full_count": false,
			"parsed": true
		}');

		$search = search::get_instance(
			$sqo // object sqo
		);
		$search->search();
		$result = $search->get_sql_joins(); // only returns bool
		// dump($result, ' result ++ '.to_string());

		// sample expected
			// '{rs167_rs20_dd64": "\n LEFT JOIN relations AS r_rs167_rs20_dd64 ON (mix.section_id=r_rs167_rs20_dd64.section_id AND mix.section_tipo=r_rs167_rs20_dd64.section_tipo AND r_rs167_rs20_dd64.from_component_tipo=\'rsc20\')\n LEFT JOIN matrix_dd AS rs167_rs20_dd64 ON (r_rs167_rs20_dd64.target_section_id=rs167_rs20_dd64.section_id AND r_rs167_rs20_dd64.target_section_tipo=rs167_rs20_dd64.section_tipo)}'

		$this->assertTrue(
			empty($_ENV['DEDALO_LAST_ERROR']),
			'expected running without errors. DEDALO_LAST_ERROR: ' .$_ENV['DEDALO_LAST_ERROR']
		);

		$type	= gettype($result);
		$eq		= $type==='string';
		$this->assertTrue(
			$eq,
			'expected true (type===string) and received type: ' .$type
		);

		$expected  = 'LEFT JOIN relations AS r_rs167_rs20_dd64 ON (mix.section_id=r_rs167_rs20_dd64.section_id AND mix.section_tipo=r_rs167_rs20_dd64.section_tipo AND r_rs167_rs20_dd64.from_component_tipo=\'rsc20\')';
		$expected .= PHP_EOL.' LEFT JOIN matrix_dd AS rs167_rs20_dd64 ON (r_rs167_rs20_dd64.target_section_id=rs167_rs20_dd64.section_id AND r_rs167_rs20_dd64.target_section_tipo=rs167_rs20_dd64.section_tipo)';

		if(SHOW_DEBUG===true) {
			$expected = '-- JOIN GROUP matrix_dd - rs167_rs20_dd64 - Si/No' .PHP_EOL . ' ' . $expected;
		}


		$eq		= trim($result)===$expected;
		$this->assertTrue(
			$eq,
			'expected true trim($result)==="LEFT JOIN relations AS r_rs167_rs20_dd64 ON ..." and received: ' . json_encode($result)
		);
	}//end test_get_sql_joins




}//end class
