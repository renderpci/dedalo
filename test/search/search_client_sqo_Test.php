<?php declare(strict_types=1);
// PHPUnit classes
use PHPUnit\Framework\TestCase;
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



/**
* SEARCH_CLIENT_SQO_TEST
* Locks the hardening of the SQL builder against client provided search query objects
* (API rqo->sqo) and the multi-section count / pagination fixes.
*
* Several SQO properties are SQL fragments computed by the server (q_parsed, operator,
* component_path, use_function, order direction, limit...) and written as is into the query.
* search::sanitize_client_sqo removes or validates them at the API boundary (dd_manager) and
* the builder sinks validate the pass-through formats ('column', 'in_column', 'function'),
* locators and order values themselves.
*/
final class search_client_sqo_test extends TestCase {

	public static $section_tipo	= 'test3';	// section in matrix_test
	public static $tipo_string	= 'test52';	// component_input_text
	public static $section_tipo_matrix = 'rsc197'; // section in matrix (other table)



	/**
	* SET_UP_BEFORE_CLASS
	* @return void
	*/
	public static function setUpBeforeClass() : void {

		if (login::is_logged()===false) {
			login_test::force_login(TEST_USER_ID);
		}
	}//end setUpBeforeClass



	/**
	* TEST_SANITIZE_REMOVES_SERVER_SQL_FRAGMENTS
	* @return void
	*/
	public function test_sanitize_removes_server_sql_fragments() : void {

		$sqo = json_decode('{
			"section_tipo": ["'.self::$section_tipo.'"],
			"parsed": true,
			"filter": {"$and":[{
				"q": "zeta",
				"q_parsed": "\'x\' OR 1=1",
				"operator": "=",
				"component_path": ["components","x\' OR 1=1"],
				"use_function": "pg_sleep",
				"join_id": 7,
				"path": [{"section_tipo":"'.self::$section_tipo.'","component_tipo":"'.self::$tipo_string.'","model":"../../fake"}]
			}]},
			"order": [{"direction":"ASC; SELECT 1","path":[{"section_tipo":"'.self::$section_tipo.'","component_tipo":"section_id","column":"1; SELECT 1"}]}]
		}');

		$safe = search::sanitize_client_sqo($sqo, $errors);

		$this->assertIsObject($safe, 'expected sanitized sqo. errors: ' . json_encode($errors));
		$this->assertFalse($safe->parsed);

		$leaf = $safe->filter->{'$and'}[0];
		foreach (['q_parsed','operator','component_path','use_function','join_id'] as $name) {
			$this->assertFalse(property_exists($leaf, $name), "expected removed leaf property $name");
		}
		$this->assertSame('zeta', $leaf->q);
		// model resolved from ontology, never the client class name
		$this->assertSame(
			RecordObj_dd::get_modelo_name_by_tipo(self::$tipo_string, true),
			$leaf->path[0]->model
		);

		$order = $safe->order[0];
		$this->assertSame('ASC', $order->direction);
		$this->assertFalse(property_exists($order->path[0], 'column'));

		// received object is untouched (deep copy)
		$this->assertTrue($sqo->parsed);
		$this->assertTrue(property_exists($sqo->filter->{'$and'}[0], 'q_parsed'));
	}//end test_sanitize_removes_server_sql_fragments



	/**
	* TEST_SANITIZE_REJECTS_INVALID_SHAPES
	* @return void
	*/
	public function test_sanitize_rejects_invalid_shapes() : void {

		$st = self::$section_tipo;
		$ct = self::$tipo_string;
		$cases = [
			'section_tipo'	=> '{"section_tipo":["'.$st.'\' OR 1=1"]}',
			'group op'		=> '{"section_tipo":["'.$st.'"],"filter":{"$and) OR (1=1":[{"q":"x","path":[{"section_tipo":"'.$st.'","component_tipo":"'.$ct.'"}]}]}}',
			'lang'			=> '{"section_tipo":["'.$st.'"],"filter":{"$and":[{"q":"x","lang":"lg-spa}\' OR 1=1--","path":[{"section_tipo":"'.$st.'","component_tipo":"'.$ct.'"}]}]}}',
			'path tipo'		=> '{"section_tipo":["'.$st.'"],"filter":{"$and":[{"q":"x","path":[{"section_tipo":"'.$st.'","component_tipo":"x\'y"}]}]}}',
			'order path'	=> '{"section_tipo":["'.$st.'"],"order":[{"direction":"ASC","path":[{"section_tipo":"1=1","component_tipo":"'.$ct.'"}]}]}'
		];
		foreach ($cases as $name => $json) {
			$safe = search::sanitize_client_sqo(json_decode($json), $errors);
			$this->assertNull($safe, "expected rejected sqo ($name)");
			$this->assertNotEmpty($errors, "expected rejection reason ($name)");
		}
	}//end test_sanitize_rejects_invalid_shapes



	/**
	* TEST_SANITIZE_KEEPS_COLUMN_PASS_THROUGH
	* Time machine lists deleted records sending a pre-built 'column' leaf (state = 'deleted')
	* @return void
	*/
	public function test_sanitize_keeps_column_pass_through() : void {

		$sqo = json_decode('{
			"section_tipo": ["'.self::$section_tipo.'"],
			"parsed": true,
			"filter": {"and":[{"q_parsed":"\'deleted\'","operator":"=","format":"column","column_name":"state","path":[{"section_tipo":"'.self::$section_tipo.'"}]}]}
		}');

		$safe = search::sanitize_client_sqo($sqo, $errors);
		$this->assertIsObject($safe, 'errors: ' . json_encode($errors));

		$leaf = $safe->filter->and[0];
		$this->assertSame('column', $leaf->format);
		$this->assertSame('state', $leaf->column_name);
		$this->assertSame("'deleted'", $leaf->q_parsed);
	}//end test_sanitize_keeps_column_pass_through



	/**
	* TEST_UNSAFE_COLUMN_LEAVES_MATCH_NOTHING
	* get_sql_where writes column, operator and value as is: anything that is not a plain
	* identifier / known operator / single literal becomes FALSE
	* @return void
	*/
	public function test_unsafe_column_leaves_match_nothing() : void {

		$search = search::get_instance(json_decode('{"section_tipo":["'.self::$section_tipo.'"]}'));
		$path	= [(object)['section_tipo' => self::$section_tipo, 'component_tipo' => 'section_id']];

		$unsafe = [
			['section_id', '=', '1 OR 1=1'],
			['section_id=1 OR 1', '=', '1'],
			['section_id', '= 1 OR 1 =', '1'],
			['state', '=', "'x' OR 'a'='a'"]
		];
		foreach ($unsafe as [$column, $operator, $value]) {
			$sql = $search->get_sql_where((object)[
				'format'		=> 'column',
				'column_name'	=> $column,
				'operator'		=> $operator,
				'q_parsed'		=> $value,
				'path'			=> $path
			]);
			$this->assertSame('FALSE', trim(preg_replace('/--[^\n]*\n/', '', $sql)), 'expected FALSE for ' . json_encode([$column, $operator, $value]));
		}

		// safe values are kept
		$sql = $search->get_sql_where((object)[
			'format'		=> 'column',
			'column_name'	=> 'state',
			'operator'		=> '=',
			'q_parsed'		=> "'it''s deleted'",
			'path'			=> $path
		]);
		$this->assertStringContainsString("state = 'it''s deleted'", $sql);

		// in_column only accepts integer lists
		$sql = $search->get_sql_where((object)[
			'format'			=> 'in_column',
			'component_path'	=> ['section_id'],
			'operator'			=> 'IN',
			'q_parsed'			=> '1) OR (1=1',
			'path'				=> $path
		]);
		$this->assertSame('FALSE', trim(preg_replace('/--[^\n]*\n/', '', $sql)));

		// function names must be identifiers
		$sql = $search->get_sql_where((object)[
			'format'		=> 'function',
			'use_function'	=> 'pg_sleep(1);--',
			'operator'		=> '@>',
			'q_parsed'		=> "'[]'",
			'path'			=> $path
		]);
		$this->assertSame('FALSE', trim(preg_replace('/--[^\n]*\n/', '', $sql)));
	}//end test_unsafe_column_leaves_match_nothing



	/**
	* TEST_FILTER_BY_LOCATORS_IS_CAST_AND_GROUPED
	* The locators OR list is appended after other conditions ('WHERE main AND ' . list):
	* it must be parenthesized, and every value cast or quoted
	* @return void
	*/
	public function test_filter_by_locators_is_cast_and_grouped() : void {

		$search = search::get_instance(json_decode('{
			"section_tipo": ["'.self::$section_tipo.'"],
			"filter_by_locators": [
				{"section_tipo":"'.self::$section_tipo.'","section_id":"1 OR 1=1"},
				{"section_tipo":"x\' OR \'1\'=\'1","section_id":2}
			]
		}'));

		$sql = trim(preg_replace('/--[^\n]*\n/', '', $search->build_sql_filter_by_locators()));
		$this->assertStringStartsWith('(', $sql);
		$this->assertStringEndsWith(')', $sql);
		$this->assertStringContainsString('.section_id=1 AND', $sql);
		$this->assertStringContainsString("section_tipo='x'' OR ''1''=''1'", $sql);
		$this->assertStringNotContainsString('1=1', str_replace("''1''=''1'", '', $sql));

		$order = $search->build_sql_filter_by_locators_order();
		$this->assertStringContainsString("('x'' OR ''1''=''1',2,2)", $order);
	}//end test_filter_by_locators_is_cast_and_grouped



	/**
	* TEST_ORDER_AND_LIMITS_ARE_NORMALIZED
	* @return void
	*/
	public function test_order_and_limits_are_normalized() : void {

		$this->assertSame('DESC', search::safe_order_direction('desc'));
		$this->assertSame('ASC NULLS LAST', search::safe_order_direction(' asc  nulls last '));
		$this->assertSame('ASC', search::safe_order_direction('ASC; SELECT pg_sleep(1)--'));
		$this->assertSame('ASC', search::safe_order_direction(null));

		$search = search::get_instance(json_decode('{"section_tipo":["'.self::$section_tipo.'"],"limit":"5; SELECT 1","offset":"3 OR 1"}'));
		$sql	= $search->parse_search_query_object();
		$this->assertStringNotContainsString('SELECT 1', $sql);
		$this->assertStringNotContainsString('OR 1', $sql);
	}//end test_order_and_limits_are_normalized



	/**
	* TEST_MULTI_SECTION_COUNT_KEEPS_SECTION_TIPO
	* section_id is unique only per section_tipo: a multi-section count must not merge records
	* of different sections that share a section_id
	* @return void
	*/
	public function test_multi_section_count_keeps_section_tipo() : void {

		$search	= search::get_instance(json_decode('{"section_tipo":["'.self::$section_tipo.'","'.self::$section_tipo_matrix.'"]}'));
		$sql	= $search->parse_search_query_object(true);

		$this->assertMatchesRegularExpression('/SELECT DISTINCT \w+\.section_id, \w+\.section_tipo/', $sql);
		$this->assertDoesNotMatchRegularExpression('/SELECT DISTINCT \w+\.section_id\s*\n/', $sql);
	}//end test_multi_section_count_keeps_section_tipo



	/**
	* TEST_UNION_PAGINATION_OFFSET_IS_APPLIED_ONCE
	* Every table branch of the UNION must select limit+offset rows and the outer query applies
	* the offset once over the merged rows (else page 2+ skip and repeat records)
	* @return void
	*/
	public function test_union_pagination_offset_is_applied_once() : void {

		$search = search::get_instance(json_decode('{
			"section_tipo": ["'.self::$section_tipo.'","'.self::$section_tipo_matrix.'"],
			"limit": 10,
			"offset": 20,
			"allow_sub_select_by_id": true
		}'));
		$sql = preg_replace('/--[^\n]*\n/', "\n", $search->parse_search_query_object());

		$this->assertStringContainsString('UNION ALL', $sql);
		$this->assertSame(2, preg_match_all('/LIMIT 30\b/', $sql), 'expected LIMIT limit+offset in every branch');
		$this->assertMatchesRegularExpression('/\)\s*ORDER BY section_id ASC, section_tipo\s*LIMIT 10\s*OFFSET 20;?\s*$/', trim($sql));
	}//end test_union_pagination_offset_is_applied_once



	/**
	* TEST_UNION_REWRITE_KEEPS_STRING_LITERALS
	* The per table branch rewrite (FROM x AS y / mix.) must not touch the user search text
	* @return void
	*/
	public function test_union_rewrite_keeps_string_literals() : void {

		$sql = search::replace_outside_sql_literals(
			"-- label l'obra\nSELECT mix.a FROM matrix AS mix WHERE mix.b ~* '.*from Roma as capital mix.q.*' /* O'x */ AND mix.c=1",
			function(string $chunk) : string {
				$chunk = preg_replace('/(FROM (?!relations)[a-zA-Z_]+ AS [a-zA-Z_]+)/i', 'FROM matrix_test AS mix_matrix_test', $chunk);
				return str_replace('mix.', 'mix_matrix_test.', $chunk);
			}
		);

		$this->assertStringContainsString("'.*from Roma as capital mix.q.*'", $sql);
		$this->assertStringContainsString('FROM matrix_test AS mix_matrix_test WHERE mix_matrix_test.b', $sql);
		$this->assertStringContainsString('AND mix_matrix_test.c=1', $sql);
	}//end test_union_rewrite_keeps_string_literals



	/**
	* TEST_NUMBER_SEARCH_VALUES_ARE_NUMERIC
	* @return void
	*/
	public function test_number_search_values_are_numeric() : void {

		$this->assertSame('1.5', component_number::safe_search_number('1,5'));
		$this->assertSame('-3', component_number::safe_search_number(' -3 '));
		$this->assertSame('0.5', component_number::safe_search_number('.5'));
		$this->assertNull(component_number::safe_search_number("1' OR 1=1--"));
		$this->assertNull(component_number::safe_search_number('abc'));
	}//end test_number_search_values_are_numeric



	/**
	* TEST_API_REJECTS_INVALID_CLIENT_SQO
	* @return void
	*/
	public function test_api_rejects_invalid_client_sqo() : void {

		$rqo = json_decode('{
			"action": "count",
			"sqo": {"section_tipo":["'.self::$section_tipo.'\' OR 1=1"]}
		}');
		$response = (new dd_manager())->manage_request($rqo);

		$this->assertFalse($response->result);
		$this->assertNotEmpty($response->errors);
	}//end test_api_rejects_invalid_client_sqo



	/**
	* TEST_FUNCTION_FORMAT_ACCEPTS_CLIENT_FLAT_KEY
	* service_autocomplete 'filter by list' sends the flat locator key JSON quoted and with
	* negative section_id ('"dd543_dd128_-1"'): it must reach the SQL as a JSON array item
	* @return void
	*/
	public function test_function_format_accepts_client_flat_key() : void {

		$query_object = (object)[
			'q'				=> '"test80_test3_-1"',
			'format'		=> 'function',
			'use_function'	=> 'relations_flat_fct_st_si',
			'path'			=> [(object)['section_tipo' => self::$section_tipo, 'component_tipo' => 'test80']]
		];
		$result = component_relation_common::resolve_query_object_sql($query_object);
		$this->assertSame("'[\"test80_test3_-1\"]'", $result->q_parsed);

		// unquoted form too
		$query_object->q = 'test80_test3_5';
		$result = component_relation_common::resolve_query_object_sql($query_object);
		$this->assertSame("'[\"test80_test3_5\"]'", $result->q_parsed);

		// unsafe value never matches everything and never breaks the literal
		$query_object->q = "x' OR '1'='1";
		$result = component_relation_common::resolve_query_object_sql($query_object);
		$this->assertStringStartsWith("'[\"invalid_", $result->q_parsed);
		$this->assertStringNotContainsString("' OR", $result->q_parsed);
	}//end test_function_format_accepts_client_flat_key



	/**
	* TEST_LIMIT_FALSE_MEANS_NO_LIMIT
	* Server SQOs (relation_list inverse references, diffusion_rdf) use limit:false for 'all'
	* @return void
	*/
	public function test_limit_false_means_no_limit() : void {

		$sql = search::get_instance(json_decode('{"section_tipo":["'.self::$section_tipo.'"],"limit":false}'))->parse_search_query_object();
		$this->assertDoesNotMatchRegularExpression('/\bLIMIT\b/', $sql);

		// negative limit falls back to the default
		$sql = search::get_instance(json_decode('{"section_tipo":["'.self::$section_tipo.'"],"limit":-1}'))->parse_search_query_object();
		$this->assertMatchesRegularExpression('/\bLIMIT 10\b/', $sql);
	}//end test_limit_false_means_no_limit



	/**
	* TEST_TOOLS_API_REJECTS_INVALID_CLIENT_SQO
	* Tools search with the client options->sqo (tool_export...): sanitized as rqo->sqo
	* @return void
	*/
	public function test_tools_api_rejects_invalid_client_sqo() : void {

		$rqo = json_decode('{
			"dd_api": "dd_tools_api",
			"action": "tool_request",
			"source": {"model":"tool_export","action":"export_grid"},
			"options": {"sqo": {"section_tipo":["'.self::$section_tipo.'\' OR 1=1"]}}
		}');
		$response = dd_tools_api::tool_request($rqo);

		$this->assertFalse($response->result);
		$this->assertNotEmpty($response->errors);
	}//end test_tools_api_rejects_invalid_client_sqo



}//end class search_client_sqo_test
