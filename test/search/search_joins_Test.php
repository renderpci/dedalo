<?php declare(strict_types=1);
// PHPUnit classes
use PHPUnit\Framework\TestCase;
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



/**
* SEARCH_JOINS_TEST
* Locks the join-alias behaviour of multi-step filter paths (value reached through a
* relation/portal) in search::filter_parser() / build_sql_join() / get_table_alias_from_path().
*
* Background: since d4124b0005 (v6.9.1) every multi-step LEAF operand gets its own
* join_id (++join_counter) and thus its own 'jN_' aliased LEFT JOIN pair on relations/matrix.
* That is what makes "value A AND value B" match across DIFFERENT linked records and must be
* kept under $and. Under $or an independent traversal per operand changes nothing in the
* result set and only multiplies rows (the client autocomplete pushes the same q into one
* operand per leaf field under a single $or -> 10 identical join pairs -> cartesian explosion).
*
* Expected contract:
* 	- $or  : operands sharing the same path signature share ONE jN_ join.
* 	- $and : every operand keeps its own jN_ join (d4124b0005 semantics).
* 	- nested groups: each group gets its own join namespace.
*
* The SQL is only BUILT here, never executed. What matters is that the tipos resolve to
* models: the 'test' ontology section 'test3' (matrix_test) contains the component_portal
* 'test80' whose target section is 'test3' itself, with string components 'test52'
* (component_input_text) and 'test17' (component_text_area).
*/
final class search_joins_test extends TestCase {

	public static $section_tipo	= 'test3';	// main section (matrix_test)
	public static $tipo_portal	= 'test80';	// component_portal in test3 -> test3
	public static $tipo_string	= 'test52';	// component_input_text (target leaf)
	public static $tipo_text	= 'test17';	// component_text_area (target leaf)



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
	* TEST_ONTOLOGY_PRECONDITIONS
	* The tipos used to build the paths must resolve to the expected models,
	* otherwise every other assertion here would be meaningless.
	* @return void
	*/
	public function test_ontology_preconditions() : void {

		$this->assertSame('section', RecordObj_dd::get_modelo_name_by_tipo(self::$section_tipo, true));
		$this->assertSame('component_portal', RecordObj_dd::get_modelo_name_by_tipo(self::$tipo_portal, true));
		$this->assertSame('component_input_text', RecordObj_dd::get_modelo_name_by_tipo(self::$tipo_string, true));
		$this->assertSame('component_text_area', RecordObj_dd::get_modelo_name_by_tipo(self::$tipo_text, true));
		$this->assertNotEmpty(common::get_matrix_table_from_tipo(self::$section_tipo));
	}//end test_ontology_preconditions



	/**
	* TEST_OR_OPERANDS_SHARE_ONE_JOIN
	* $or of three leaf operands (c1, c2, c1) through the same portal:
	* exactly ONE relations join (r_j1_) and no r_j2_ / r_j3_.
	* The WHERE must reference only j1_ aliases.
	* @return void
	*/
	public function test_or_operands_share_one_join() : void {

		$sqo	= self::build_sqo('$or', [
			self::operand('a', self::$tipo_string, 'component_input_text'),
			self::operand('b', self::$tipo_text,   'component_text_area'),
			self::operand('c', self::$tipo_string, 'component_input_text')
		]);
		$built	= self::build($sqo);
		$sig	= $built['signature'];

		$this->assertNotEmpty($built['joins'], 'expected joins for a multi-step path');
		$this->assertNotEmpty($built['where'], 'expected a WHERE string');

		$this->assertSame(1, self::count_relations_join($built['joins'], 1, $sig),
			'$or: expected exactly one LEFT JOIN relations AS r_j1_'.$sig . PHP_EOL . $built['joins']
		);
		$this->assertSame(0, self::count_relations_join($built['joins'], 2, $sig),
			'$or: r_j2_ must not exist' . PHP_EOL . $built['joins']
		);
		$this->assertSame(0, self::count_relations_join($built['joins'], 3, $sig),
			'$or: r_j3_ must not exist' . PHP_EOL . $built['joins']
		);
		$this->assertSame(1, self::count_relations_join_any($built['joins']),
			'$or: expected a single relations join overall' . PHP_EOL . $built['joins']
		);

		// WHERE references only j1_ aliases
		$join_ids = self::join_ids_in($built['where'], $sig);
		$this->assertSame([1], $join_ids,
			'$or: the WHERE must reference only j1_ aliases' . PHP_EOL . $built['where']
		);
		// and it references the alias at all
		$this->assertStringContainsString('j1_'.$sig.'.datos', $built['where']);
	}//end test_or_operands_share_one_join



	/**
	* TEST_OR_FULL_SQL_SINGLE_JOIN_PAIR
	* Same $or case through the full SQL builder (parse_search_query_object): the final
	* query must contain a single relations/matrix join pair.
	* @return void
	*/
	public function test_or_full_sql_single_join_pair() : void {

		$sqo = self::build_sqo('$or', [
			self::operand('a', self::$tipo_string, 'component_input_text'),
			self::operand('b', self::$tipo_text,   'component_text_area'),
			self::operand('c', self::$tipo_string, 'component_input_text')
		]);
		$search	= search::get_instance($sqo);
		// signature BEFORE parsing: parse_search_query_object() replaces $sqo->filter
		// (same object instance) with the component-conformed version
		$sig	= $search->get_table_alias_from_path((array)$sqo->filter->{'$or'}[0]->path);
		$sql	= $search->parse_search_query_object();

		$this->assertIsString($sql);
		$this->assertSame(1, self::count_relations_join_any($sql),
			'$or: full SQL must contain exactly one LEFT JOIN relations' . PHP_EOL . $sql
		);
		$this->assertSame(1, self::count_relations_join($sql, 1, $sig));
		$this->assertSame(0, self::count_relations_join($sql, 2, $sig));
		$this->assertSame([1], self::join_ids_in($sql, $sig));
	}//end test_or_full_sql_single_join_pair



	/**
	* TEST_AND_OPERANDS_KEEP_INDEPENDENT_JOINS
	* Same operands under $and: r_j1_, r_j2_ and r_j3_ each present exactly once.
	* Protects the d4124b0005 semantics (value A AND value B may live in different
	* linked records).
	* @return void
	*/
	public function test_and_operands_keep_independent_joins() : void {

		$sqo	= self::build_sqo('$and', [
			self::operand('a', self::$tipo_string, 'component_input_text'),
			self::operand('b', self::$tipo_text,   'component_text_area'),
			self::operand('c', self::$tipo_string, 'component_input_text')
		]);
		$built	= self::build($sqo);
		$sig	= $built['signature'];

		foreach ([1,2,3] as $id) {
			$this->assertSame(1, self::count_relations_join($built['joins'], $id, $sig),
				'$and: expected exactly one LEFT JOIN relations AS r_j'.$id.'_'.$sig . PHP_EOL . $built['joins']
			);
		}
		$this->assertSame(0, self::count_relations_join($built['joins'], 4, $sig),
			'$and: r_j4_ must not exist' . PHP_EOL . $built['joins']
		);
		$this->assertSame(3, self::count_relations_join_any($built['joins']),
			'$and: expected three relations joins overall' . PHP_EOL . $built['joins']
		);

		// WHERE references j1_, j2_ and j3_ (one per operand)
		$this->assertSame([1,2,3], self::join_ids_in($built['where'], $sig),
			'$and: the WHERE must reference j1_, j2_ and j3_ aliases' . PHP_EOL . $built['where']
		);
	}//end test_and_operands_keep_independent_joins



	/**
	* TEST_NESTED_GROUPS_GET_OWN_NAMESPACE
	* {"$and":[{"$or":[op1,op2]}, {"$or":[op3]}]}
	* The inner $or shares one join (j1), the second group gets j2, and no j3 exists.
	* @return void
	*/
	public function test_nested_groups_get_own_namespace() : void {

		$sqo = json_decode(json_encode([
			'section_tipo'	=> [self::$section_tipo],
			'filter'		=> [
				'$and' => [
					['$or' => [
						self::operand('a', self::$tipo_string, 'component_input_text'),
						self::operand('b', self::$tipo_text,   'component_text_area')
					]],
					['$or' => [
						self::operand('c', self::$tipo_string, 'component_input_text')
					]]
				]
			],
			'limit'			=> 10,
			'offset'		=> 0,
			'full_count'	=> false
		]));
		$built	= self::build($sqo);
		$sig	= $built['signature'];

		$this->assertSame(1, self::count_relations_join($built['joins'], 1, $sig),
			'nested: expected exactly one LEFT JOIN relations AS r_j1_'.$sig . PHP_EOL . $built['joins']
		);
		$this->assertSame(1, self::count_relations_join($built['joins'], 2, $sig),
			'nested: expected exactly one LEFT JOIN relations AS r_j2_'.$sig . PHP_EOL . $built['joins']
		);
		$this->assertSame(0, self::count_relations_join($built['joins'], 3, $sig),
			'nested: r_j3_ must not exist' . PHP_EOL . $built['joins']
		);
		$this->assertSame(2, self::count_relations_join_any($built['joins']),
			'nested: expected two relations joins overall' . PHP_EOL . $built['joins']
		);
		$this->assertSame([1,2], self::join_ids_in($built['where'], $sig),
			'nested: the WHERE must reference j1_ and j2_ only' . PHP_EOL . $built['where']
		);
	}//end test_nested_groups_get_own_namespace



	/**
	* TEST_SINGLE_STEP_PATH_IS_NEVER_PREFIXED
	* A leaf operand on the main section (1-step path) must not create joins nor jN_ aliases.
	* @return void
	*/
	public function test_single_step_path_is_never_prefixed() : void {

		$sqo = json_decode(json_encode([
			'section_tipo'	=> [self::$section_tipo],
			'filter'		=> [
				'$or' => [
					[
						'q'		=> 'a',
						'path'	=> [[
							'section_tipo'		=> self::$section_tipo,
							'component_tipo'	=> self::$tipo_string,
							'model'				=> 'component_input_text',
							'name'				=> 'leaf'
						]]
					],
					[
						'q'		=> 'b',
						'path'	=> [[
							'section_tipo'		=> self::$section_tipo,
							'component_tipo'	=> self::$tipo_text,
							'model'				=> 'component_text_area',
							'name'				=> 'leaf'
						]]
					]
				]
			],
			'limit'			=> 10,
			'offset'		=> 0,
			'full_count'	=> false
		]));
		$search = search::get_instance($sqo);
		$search->pre_parse_search_query_object();
		$where = $search->build_sql_filter();
		$joins = $search->get_sql_joins();

		$this->assertSame('', $joins, 'single-step paths must not build joins');
		$this->assertSame(0, self::count_relations_join_any($joins));
		$this->assertNotEmpty($where);
		$this->assertDoesNotMatchRegularExpression('/\bj\d+_/', $where,
			'single-step paths must never get a jN_ alias prefix' . PHP_EOL . $where
		);
	}//end test_single_step_path_is_never_prefixed



	/////////// ⬇︎ helpers ⬇︎ ////////////////



	/**
	* OPERAND
	* Builds a two-step leaf operand: main.portal -> target.leaf
	* @param string $q
	* @param string $leaf_tipo
	* @param string $leaf_model
	* @return array
	*/
	private static function operand(string $q, string $leaf_tipo, string $leaf_model) : array {

		return [
			'q'		=> $q,
			'path'	=> [
				[
					'section_tipo'		=> self::$section_tipo,
					'component_tipo'	=> self::$tipo_portal,
					'model'				=> 'component_portal',
					'name'				=> 'portal'
				],
				[
					'section_tipo'		=> self::$section_tipo, // portal test80 targets test3 itself
					'component_tipo'	=> $leaf_tipo,
					'model'				=> $leaf_model,
					'name'				=> 'leaf'
				]
			]
		];
	}//end operand



	/**
	* BUILD_SQO
	* @param string $op ('$or'|'$and')
	* @param array $operands
	* @return object
	*/
	private static function build_sqo(string $op, array $operands) : object {

		return json_decode(json_encode([
			'section_tipo'	=> [self::$section_tipo],
			'filter'		=> [$op => $operands],
			'limit'			=> 10,
			'offset'		=> 0,
			'full_count'	=> false
		]));
	}//end build_sqo



	/**
	* BUILD
	* Fresh search instance per call: pre-parse with the components (q -> q_parsed etc.),
	* build the filter (this is what calls filter_parser and resets join_counter) and
	* collect the joins.
	* @param object $sqo
	* @return array { where: string, joins: string, signature: string }
	*/
	private static function build(object $sqo) : array {

		$search = search::get_instance($sqo);

		// unprefixed path signature (e.g. 'te3_te80_te3') computed the same way the class does
		$op			= array_key_first(get_object_vars($sqo->filter));
		$first		= self::first_leaf($sqo->filter->{$op});
		$signature	= $search->get_table_alias_from_path((array)$first->path);

		$search->pre_parse_search_query_object();
		$where = $search->build_sql_filter();
		$joins = $search->get_sql_joins();

		return [
			'where'		=> $where,
			'joins'		=> $joins,
			'signature'	=> $signature
		];
	}//end build



	/**
	* FIRST_LEAF
	* Finds the first leaf operand (object with 'path') in a (possibly nested) operand list.
	* @param array $ar_value
	* @return object
	*/
	private static function first_leaf(array $ar_value) : object {

		foreach ($ar_value as $item) {
			if (property_exists($item, 'path')) {
				return $item;
			}
			$op = array_key_first(get_object_vars($item));
			return self::first_leaf((array)$item->{$op});
		}
		throw new RuntimeException('no leaf operand found');
	}//end first_leaf



	/**
	* COUNT_RELATIONS_JOIN
	* Number of 'LEFT JOIN relations AS r_j<id>_<sig>' occurrences
	* @param string $sql
	* @param int $join_id
	* @param string $sig
	* @return int
	*/
	private static function count_relations_join(string $sql, int $join_id, string $sig) : int {

		$pattern = '/LEFT JOIN relations AS r_j' . $join_id . '_' . preg_quote($sig, '/') . '\b/';

		return preg_match_all($pattern, $sql);
	}//end count_relations_join



	/**
	* COUNT_RELATIONS_JOIN_ANY
	* Number of 'LEFT JOIN relations AS r_' occurrences whatever the alias
	* @param string $sql
	* @return int
	*/
	private static function count_relations_join_any(string $sql) : int {

		$pattern = '/LEFT JOIN relations AS r_/';

		return preg_match_all($pattern, $sql);
	}//end count_relations_join_any



	/**
	* JOIN_IDS_IN
	* Sorted unique list of jN_ ids referenced by the given path signature in a SQL fragment
	* @param string $sql
	* @param string $sig
	* @return array
	*/
	private static function join_ids_in(string $sql, string $sig) : array {

		preg_match_all('/\bj(\d+)_' . preg_quote($sig, '/') . '\b/', $sql, $matches);

		$ids = array_map('intval', $matches[1]);
		$ids = array_values(array_unique($ids));
		sort($ids);

		return $ids;
	}//end join_ids_in



}//end class
