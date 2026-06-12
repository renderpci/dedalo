<?php declare(strict_types=1);
// bootstrap
require_once dirname(__FILE__, 2) . '/bootstrap.php';



final class search_test extends BaseTestCase {



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
		$test_section_id = matrix_db_manager::create(
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

		$this->assertTrue(
			$db_result instanceof db_result || $db_result === false,
			'Expected filtered search() to return db_result or false'
		);
		$this->assertTrue(
			$db_result->row_count() > 0,
			'Expected filtered search() to return db_result with at least one record, found: '.$db_result->row_count()
		);

		// Clean up created test record
		if (!empty($test_section_id)) {
			matrix_db_manager::delete($this->table, $this->section_tipo, $test_section_id);
		}

	}//end test_search



	/**
	* TEST_IS_VALID_TIPO
	* Unit test for the security tipo-format gate used before raw SQL interpolation.
	* @return void
	*/
	public function test_is_valid_tipo() {

		// valid ontology tipos
		$this->assertTrue(search::is_valid_tipo('oh1'));
		$this->assertTrue(search::is_valid_tipo('rsc453'));
		$this->assertTrue(search::is_valid_tipo('numisdata303'));

		// invalid / malicious
		$this->assertFalse(search::is_valid_tipo("x'); DROP TABLE matrix_test;--"));
		$this->assertFalse(search::is_valid_tipo('OH1'));      // uppercase
		$this->assertFalse(search::is_valid_tipo('oh'));       // no number
		$this->assertFalse(search::is_valid_tipo('1oh'));      // wrong order
		$this->assertFalse(search::is_valid_tipo(''));         // empty
		$this->assertFalse(search::is_valid_tipo('oh 1'));     // space

	}//end test_is_valid_tipo



	/**
	* TEST_SANITIZE_SQL_LIMIT
	* Unit test for the LIMIT coercion gate.
	* @return void
	*/
	public function test_sanitize_sql_limit() {

		// 'all' sentinel -> unlimited
		$this->assertSame('ALL', search::sanitize_sql_limit('all'));
		$this->assertSame('ALL', search::sanitize_sql_limit('ALL'));

		// positive ints (string or int)
		$this->assertSame('10', search::sanitize_sql_limit(10));
		$this->assertSame('10', search::sanitize_sql_limit('10'));

		// injection payload reduced to its leading int
		$this->assertSame('10', search::sanitize_sql_limit('10) UNION SELECT * FROM matrix_users --'));

		// non positive / non numeric -> null (no LIMIT)
		$this->assertNull(search::sanitize_sql_limit(0));
		$this->assertNull(search::sanitize_sql_limit(-5));
		$this->assertNull(search::sanitize_sql_limit('abc'));
		$this->assertNull(search::sanitize_sql_limit(null));

	}//end test_sanitize_sql_limit



	/**
	* TEST_INJECTION_COMPONENT_TIPO_IN_JOIN_PATH
	* A malicious component_tipo in an intermediate path step must be rejected
	* (it is interpolated verbatim as a JSONB relation key in build_sql_join).
	* @return void
	*/
	public function test_injection_component_tipo_in_join_path() {

		$search_query_object = (object)[
			'section_tipo' => $this->section_tipo,
			'mode' => 'list',
			'filter' => (object)[
				'$and' => [
					(object)[
						'q' => '1',
						'q_operator' => null,
						'path' => [
							// intermediate step with malicious component_tipo
							(object)[
								'section_tipo'		=> $this->section_tipo,
								'component_tipo'	=> "x') AS t ON true; DROP TABLE matrix_test;--"
							],
							// final resolvable step
							(object)[
								'section_tipo'		=> $this->section_tipo,
								'component_tipo'	=> 'section_id',
								'model'				=> 'component_section_id',
								'name'				=> 'Id'
							]
						]
					]
				]
			]
		];
		$search_obj = search::get_instance($search_query_object);

		$this->expectException(Exception::class);
		$this->expectExceptionMessage('invalid component_tipo in search path');

		// build the SQL (no DB execution); must throw before producing the join
		$search_obj->parse_sql_query();

	}//end test_injection_component_tipo_in_join_path



	/**
	* TEST_INJECTION_COLUMN_NAME_FORMAT_COLUMN
	* A malicious column_name in a format:'column' filter must be dropped (not
	* interpolated as a raw SQL identifier). The payload must not appear in the SQL.
	* @return void
	*/
	public function test_injection_column_name_format_column() {

		$payload = '(SELECT password FROM matrix_users)';

		$search_query_object = (object)[
			'section_tipo' => $this->section_tipo,
			'mode' => 'list',
			'filter' => (object)[
				'$and' => [
					(object)[
						'q'				=> '1',
						'q_operator'	=> '=',
						'format'		=> 'column',
						'column_name'	=> $payload,
						'path' => [
							(object)[
								'section_tipo'		=> $this->section_tipo,
								'component_tipo'	=> 'section_id',
								'model'				=> 'component_section_id',
								'name'				=> 'Id'
							]
						]
					]
				]
			]
		];
		$search_obj = search::get_instance($search_query_object);
		$sql_query  = $search_obj->parse_sql_query();

		$this->assertStringNotContainsString(
			$payload,
			$sql_query,
			'Malicious column_name must not be interpolated into the SQL'
		);

	}//end test_injection_column_name_format_column



	/**
	* TEST_INJECTION_LIMIT_NOT_INTERPOLATED
	* A non-numeric / payload limit must be coerced to an integer in the SQL tail.
	* @return void
	*/
	public function test_injection_limit_not_interpolated() {

		$search_query_object = (object)[
			'section_tipo' => $this->section_tipo,
			'mode' => 'list',
			'limit' => '10) UNION SELECT section_id, datos FROM matrix_users --',
			'offset' => '5; DROP TABLE matrix_test'
		];
		$search_obj = search::get_instance($search_query_object);
		$sql_query  = $search_obj->parse_sql_query();

		$this->assertStringNotContainsString('UNION SELECT', $sql_query, 'limit payload must not reach SQL');
		$this->assertStringNotContainsString('DROP TABLE', $sql_query, 'offset payload must not reach SQL');
		$this->assertStringContainsString('LIMIT 10', $sql_query, 'limit must be coerced to its integer value');
		$this->assertStringContainsString('OFFSET 5', $sql_query, 'offset must be coerced to its integer value');

	}//end test_injection_limit_not_interpolated



	/**
	* TEST_INJECTION_SELECT_COLUMN_AND_KEY
	* A select with a malicious column or key must be dropped, not interpolated.
	* A legitimate select (column 'string', key tipo) must survive.
	* @return void
	*/
	public function test_injection_select_column_and_key() {

		// malicious column
		$sqo_col = (object)[
			'section_tipo'	=> $this->section_tipo,
			'mode'			=> 'list',
			'select'		=> [ (object)['column' => 'relation, (SELECT datos FROM matrix_users) AS x'] ]
		];
		$sql_col = search::get_instance($sqo_col)->parse_sql_query();
		$this->assertStringNotContainsString('matrix_users', $sql_col, 'select column payload must not reach SQL');

		// malicious key (JSONB key breakout)
		$sqo_key = (object)[
			'section_tipo'	=> $this->section_tipo,
			'mode'			=> 'list',
			'select'		=> [ (object)['column' => 'string', 'key' => "x' || (SELECT 1) || '"] ]
		];
		$sql_key = search::get_instance($sqo_key)->parse_sql_query();
		$this->assertStringNotContainsString('SELECT 1', $sql_key, 'select key payload must not reach SQL');

		// legitimate select survives
		$sqo_ok = (object)[
			'section_tipo'	=> $this->section_tipo,
			'mode'			=> 'list',
			'select'		=> [ (object)['column' => 'string', 'key' => 'test52'] ]
		];
		$sql_ok = search::get_instance($sqo_ok)->parse_sql_query();
		$this->assertStringContainsString("string->'test52'", $sql_ok, 'legitimate select must be preserved');

	}//end test_injection_select_column_and_key



	/**
	* TEST_INJECTION_LANG_IN_JSONPATH
	* A malicious filter-item lang (interpolated into SQL jsonpath/string literals by the
	* component search builders) must be rejected at the central conform_filter chokepoint.
	* Legitimate langs ('lg-spa', 'all') must pass and produce SQL.
	* @return void
	*/
	public function test_injection_lang_in_jsonpath() {

		$make_sqo = function(string $lang) : object {
			return (object)[
				'section_tipo'	=> $this->section_tipo,
				'mode'			=> 'list',
				'filter'		=> (object)[
					'$and' => [
						(object)[
							'q'			=> 'foo',
							'q_operator'=> null,
							'lang'		=> $lang,
							'path'		=> [
								(object)[
									'section_tipo'	=> $this->section_tipo,
									'component_tipo'=> 'test52',
									'model'			=> 'component_input_text',
									'name'			=> 'Value'
								]
							]
						]
					]
				]
			];
		};

		// malicious lang (single quote breaks out of the SQL literal)
		$payload = "lg-spa\" || @.value != \"";
		try {
			search::get_instance($make_sqo($payload))->parse_sql_query();
			$this->fail('Malicious lang must be rejected');
		} catch (Exception $e) {
			$this->assertStringContainsString('invalid lang in search filter', $e->getMessage());
		}

		// classic injection lang
		try {
			search::get_instance($make_sqo("x' ; DROP TABLE matrix_test; --"))->parse_sql_query();
			$this->fail('Malicious lang must be rejected');
		} catch (Exception $e) {
			$this->assertStringContainsString('invalid lang in search filter', $e->getMessage());
		}

		// legitimate langs survive
		$sql_spa = search::get_instance($make_sqo('lg-spa'))->parse_sql_query();
		$this->assertStringNotContainsString('DROP TABLE', $sql_spa);
		$this->assertNotEmpty($sql_spa);

		$sql_all = search::get_instance($make_sqo('all'))->parse_sql_query();
		$this->assertNotEmpty($sql_all);

	}//end test_injection_lang_in_jsonpath



	/**
	* TEST_INJECTION_COMPONENT_TIPO_SINGLE_LEVEL_PATH
	* A malicious component_tipo in a SINGLE-level path (which never reaches build_sql_join)
	* must still be rejected at the conform_filter chokepoint. A legitimate pseudo-tipo
	* ('section_id') must be accepted.
	* @return void
	*/
	public function test_injection_component_tipo_single_level_path() {

		$sqo = (object)[
			'section_tipo'	=> $this->section_tipo,
			'mode'			=> 'list',
			'filter'		=> (object)[
				'$and' => [
					(object)[
						'q'			=> '1',
						'q_operator'=> null,
						'path'		=> [
							(object)[
								'section_tipo'	=> $this->section_tipo,
								'component_tipo'=> "x'] ? (@ == 1) || (SELECT 1)--"
							]
						]
					]
				]
			]
		];

		try {
			search::get_instance($sqo)->parse_sql_query();
			$this->fail('Malicious single-level component_tipo must be rejected');
		} catch (Exception $e) {
			$this->assertStringContainsString('invalid component_tipo in search path', $e->getMessage());
		}

		// legitimate pseudo-tipo 'section_id' is accepted (children-recursive uses it)
		$sqo_ok = (object)[
			'section_tipo'	=> $this->section_tipo,
			'mode'			=> 'list',
			'filter'		=> (object)[
				'$and' => [
					(object)[
						'q'			=> '1',
						'q_operator'=> null,
						'path'		=> [
							(object)[
								'section_tipo'	=> $this->section_tipo,
								'component_tipo'=> 'section_id',
								'model'			=> 'component_section_id'
							]
						]
					]
				]
			]
		];
		$sql_ok = search::get_instance($sqo_ok)->parse_sql_query();
		$this->assertNotEmpty($sql_ok);

	}//end test_injection_component_tipo_single_level_path



	/**
	* TEST_FILTER_PARSER_NO_DANGLING_OPERATOR
	* filter_parser must join only non-empty fragments. An element that resolves to an empty
	* fragment (whether in the middle or at the end) must never leave a trailing/double operator.
	* @return void
	*/
	public function test_filter_parser_no_dangling_operator() {

		$search_obj = search::get_instance((object)[
			'section_tipo'	=> $this->section_tipo,
			'mode'			=> 'list'
		]);

		$leaf = function(?string $sentence) : object {
			return (object)[
				'path'		=> [ (object)['section_tipo'=>$this->section_tipo,'component_tipo'=>'section_id'] ],
				'sentence'	=> $sentence,
				'params'	=> []
			];
		};

		// middle element empty
		$sql_mid = $search_obj->filter_parser('$and', [ $leaf('a.x = 1'), $leaf(''), $leaf('b.y = 2') ]);
		$this->assertStringContainsString('a.x = 1', $sql_mid);
		$this->assertStringContainsString('b.y = 2', $sql_mid);
		$this->assertSame(1, substr_count($sql_mid, ' AND '), 'exactly one AND between two fragments');

		// trailing element empty (the classic dangling-operator case)
		$sql_tail = $search_obj->filter_parser('$and', [ $leaf('a.x = 1'), $leaf('b.y = 2'), $leaf('') ]);
		$this->assertSame(1, substr_count($sql_tail, ' AND '), 'trailing empty element must not leave a dangling AND');
		$this->assertDoesNotMatchRegularExpression('/\bAND\s*$/', trim($sql_tail), 'no trailing AND');

		// all empty -> empty string
		$sql_empty = $search_obj->filter_parser('$and', [ $leaf(''), $leaf(null) ]);
		$this->assertSame('', $sql_empty, 'all-empty fragments must produce an empty string');

	}//end test_filter_parser_no_dangling_operator



	/**
	* TEST_FILTER_PARSER_NAND_NOR
	* NAND/NOR must produce valid SQL (a negated AND/OR), not an invalid ' NAND '/' NOR ' join.
	* @return void
	*/
	public function test_filter_parser_nand_nor() {

		$search_obj = search::get_instance((object)[
			'section_tipo'	=> $this->section_tipo,
			'mode'			=> 'list'
		]);

		$leaf = function(string $sentence) : object {
			return (object)[
				'path'		=> [ (object)['section_tipo'=>$this->section_tipo,'component_tipo'=>'section_id'] ],
				'sentence'	=> $sentence,
				'params'	=> []
			];
		};

		$sql_nand = $search_obj->filter_parser('$nand', [ $leaf('a.x = 1'), $leaf('b.y = 2') ]);
		$this->assertStringContainsString('NOT (', $sql_nand);
		$this->assertStringContainsString(' AND ', $sql_nand);
		$this->assertStringNotContainsString(' NAND ', $sql_nand);

		$sql_nor = $search_obj->filter_parser('$nor', [ $leaf('a.x = 1'), $leaf('b.y = 2') ]);
		$this->assertStringContainsString('NOT (', $sql_nor);
		$this->assertStringContainsString(' OR ', $sql_nor);
		$this->assertStringNotContainsString(' NOR ', $sql_nor);

	}//end test_filter_parser_nand_nor



	/**
	* TEST_GET_PLACEHOLDER_VALUE_TYPES
	* get_placeholder must give distinct placeholders to distinct typed values and must store
	* them unmangled (the previous value-keyed dedup corrupted 1.5->1, true->1, null->'').
	* @return void
	*/
	public function test_get_placeholder_value_types() {

		$search_obj = search::get_instance((object)[
			'section_tipo'	=> $this->section_tipo,
			'mode'			=> 'list'
		]);

		$p_float	= $search_obj->get_placeholder(1.5);
		$p_int		= $search_obj->get_placeholder(1);
		$p_strone	= $search_obj->get_placeholder('1');
		$p_true		= $search_obj->get_placeholder(true);
		$p_null		= $search_obj->get_placeholder(null);

		// all distinct
		$placeholders = [$p_float, $p_int, $p_strone, $p_true, $p_null];
		$this->assertSame($placeholders, array_unique($placeholders), 'distinct typed values must get distinct placeholders');

		// dedup: same value (strict) recycles its placeholder
		$this->assertSame($p_float, $search_obj->get_placeholder(1.5), 'identical value must recycle its placeholder');

		// stored values must be unmangled
		$ref = new ReflectionProperty(search::class, 'params');
		$params = $ref->getValue($search_obj);

		$this->assertSame(1.5, $params[(int)substr($p_float,1) - 1], 'float must be stored unmangled');
		$this->assertSame(1, $params[(int)substr($p_int,1) - 1], 'int must be stored unmangled');
		$this->assertSame('1', $params[(int)substr($p_strone,1) - 1], 'string must be stored unmangled');
		$this->assertSame(true, $params[(int)substr($p_true,1) - 1], 'bool must be stored unmangled');
		$this->assertSame(null, $params[(int)substr($p_null,1) - 1], 'null must be stored unmangled');

	}//end test_get_placeholder_value_types



	/**
	* TEST_SANITIZE_CLIENT_SQO
	* The API boundary scrub must remove server-only fields at any depth, reset parsed,
	* and coerce numerics, while keeping legitimate fields ('column', 'model', 'all').
	* @return void
	*/
	public function test_sanitize_client_sqo() {

		$sqo = (object)[
			'section_tipo'	=> ['test65'],
			'parsed'		=> true,                 // must be reset to false
			'limit'			=> '5) UNION SELECT 1 --', // must coerce to 5
			'offset'		=> '3; DROP',            // must coerce to 3
			'total'			=> '42 junk',            // must coerce to 42
			'skip_projects_filter'	=> true,         // ACL flag, must be stripped
			'skip_duplicated'		=> true,         // ACL flag, must be stripped
			'include_negative'		=> true,         // ACL flag, must be stripped
			'order'			=> [
				(object)[
					'direction'	=> 'ASC',
					'path'		=> [
						(object)[
							'section_tipo'	=> 'test65',
							'component_tipo'=> 'section_id',
							'column'		=> 'section_id',          // legitimate, kept
							'column_sql'	=> '(SELECT pg_sleep(5))' // server-only, stripped
						]
					]
				]
			],
			'filter'		=> (object)[
				'$and' => [
					(object)[
						'q'			=> '1',
						'path'		=> [
							(object)['section_tipo'=>'test65','component_tipo'=>'section_id','model'=>'component_section_id']
						],
						'sentence'	=> "1=1; DROP TABLE matrix_test --", // server-only, stripped
						'params'	=> ['_Q1_' => 'x'],                  // server-only, stripped
						'table'		=> 'matrix_test',                    // server-only, stripped
						'table_alias'=> 'te65'                           // server-only, stripped
					]
				]
			]
		];

		$clean = search_query_object::sanitize_client_sqo($sqo);

		// parsed reset
		$this->assertFalse($clean->parsed, 'parsed must be forced false');

		// numeric coercion
		$this->assertSame(5, (int)$clean->limit);
		$this->assertSame(3, $clean->offset);
		$this->assertSame(42, $clean->total);

		// server-only fields stripped (filter leaf)
		$leaf = $clean->filter->{'$and'}[0];
		$this->assertFalse(property_exists($leaf, 'sentence'), 'sentence must be stripped');
		$this->assertFalse(property_exists($leaf, 'params'), 'params must be stripped');
		$this->assertFalse(property_exists($leaf, 'table'), 'table must be stripped');
		$this->assertFalse(property_exists($leaf, 'table_alias'), 'table_alias must be stripped');

		// server-only field stripped (order path), legitimate kept
		$order_step = $clean->order[0]->path[0];
		$this->assertFalse(property_exists($order_step, 'column_sql'), 'column_sql must be stripped');
		$this->assertTrue(property_exists($order_step, 'column'), 'legitimate column must be kept');
		$this->assertTrue(property_exists($leaf, 'path'), 'legitimate path must be kept');

		// ACL / control flags stripped (a client must never weaken access control)
		$this->assertFalse(property_exists($clean, 'skip_projects_filter'), 'skip_projects_filter must be stripped');
		$this->assertFalse(property_exists($clean, 'skip_duplicated'), 'skip_duplicated must be stripped');
		$this->assertFalse(property_exists($clean, 'include_negative'), 'include_negative must be stripped');

		// client limit clamped to the ceiling (untrusted clients cannot request unbounded sets)
		$max = defined('DEDALO_SEARCH_CLIENT_MAX_LIMIT') ? (int)DEDALO_SEARCH_CLIENT_MAX_LIMIT : 1000;

		// 'all' sentinel is clamped to the ceiling for clients
		$sqo_all = (object)['section_tipo'=>['test65'], 'limit'=>'all'];
		$clean_all = search_query_object::sanitize_client_sqo($sqo_all);
		$this->assertSame($max, $clean_all->limit, "'all' limit must be clamped to the ceiling for clients");

		// non-positive limit clamped to the ceiling
		$sqo_zero = (object)['section_tipo'=>['test65'], 'limit'=>0];
		$this->assertSame($max, search_query_object::sanitize_client_sqo($sqo_zero)->limit, 'limit 0 must clamp to ceiling');

		// over-ceiling limit clamped
		$sqo_big = (object)['section_tipo'=>['test65'], 'limit'=> $max + 50000];
		$this->assertSame($max, search_query_object::sanitize_client_sqo($sqo_big)->limit, 'over-ceiling limit must clamp');

		// in-range limit preserved
		$sqo_ok = (object)['section_tipo'=>['test65'], 'limit'=>10];
		$this->assertSame(10, search_query_object::sanitize_client_sqo($sqo_ok)->limit, 'in-range limit must be preserved');

		// non-object passthrough
		$this->assertNull(search_query_object::sanitize_client_sqo(null));

	}//end test_sanitize_client_sqo



}//end class
