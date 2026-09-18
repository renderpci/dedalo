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
* That is what makes "value A AND value B" match across DIFFERENT linked records. But N
* ANDed operands on the SAME path each added an identical LEFT JOIN pair to the main query,
* producing a K^N cartesian product plus a DISTINCT ON sort that hung Postgres. Multi-step
* operands under $and are therefore emitted as correlated EXISTS subqueries (joins live inside
* the subquery), keeping the cross-record AND semantics with no row multiplication. Under $or
* an independent traversal per operand changes nothing in the result set and only multiplies
* rows (the client autocomplete pushes the same q into one operand per leaf field under a single
* $or -> 10 identical join pairs -> cartesian explosion).
*
* Expected contract:
* 	- $or  : operands sharing the same path signature share ONE jN_ LEFT JOIN pair in the main query.
* 	- $and : every operand becomes its own correlated EXISTS subquery (no main-query joins).
* 	- nested groups: each $or group gets its own join namespace.
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
	* TEST_AND_OPERANDS_EMIT_EXISTS_SUBQUERIES
	* Same operands under $and: no relations joins are emitted to the main query; each $or
	* operand group (one per ANDed field, expanded per language by the conform step) becomes
	* correlated EXISTS subqueries (their joins live inside the subqueries). Preserves the
	* cross-record AND semantics (each clause may match a different linked record) without the
	* K^N cartesian product that N identical LEFT JOIN pairs produced.
	* @return void
	*/
	public function test_and_operands_emit_exists_subqueries() : void {

		$sqo	= self::build_sqo('$and', [
			self::operand('a', self::$tipo_string, 'component_input_text'),
			self::operand('b', self::$tipo_text,   'component_text_area'),
			self::operand('c', self::$tipo_string, 'component_input_text')
		]);
		$built	= self::build($sqo);
		$sig	= $built['signature'];

		$this->assertSame(0, self::count_relations_join_any($built['joins']),
			'$and: no relations joins must be emitted to the main query' . PHP_EOL . $built['joins']
		);
		$this->assertNotEmpty($built['where'], 'expected EXISTS subqueries in the WHERE');

		// at least one EXISTS subquery per ANDed operand (the conform step expands each field
		// into a per-language $or, and every language leaf is emitted as its own EXISTS)
		$this->assertGreaterThanOrEqual(3, substr_count($built['where'], 'EXISTS (SELECT 1'),
			'$and: expected at least three EXISTS subqueries (one per operand)' . PHP_EOL . $built['where']
		);
		$this->assertSame([1,2,3], self::join_ids_in($built['where'], $sig),
			'$and: the WHERE must reference j1_, j2_ and j3_ aliases' . PHP_EOL . $built['where']
		);
	}//end test_and_operands_emit_exists_subqueries



	/**
	* TEST_AND_MULTI_SECTION_UNION_PRESERVES_EXISTS_SUBQUERIES
	* Multi-section search (section_tipo across two matrix tables) triggers build_union_query,
	* which rewrites the main 'FROM <table> AS <alias>' per union member. It must NOT rewrite
	* the EXISTS subqueries' own 'FROM relations AS r_jN_...' (relations is a global table shared
	* by all members). Regression: the union regex replaced every 'FROM ... AS ...', mangling the
	* subquery alias -> "missing FROM-clause entry for table r_jN_...".
	* @return void
	*/
	public function test_and_multi_section_union_preserves_exists_subqueries() : void {

		$sqo	= self::build_sqo('$and', [
			self::operand('a', self::$tipo_string, 'component_input_text'),
			self::operand('b', self::$tipo_text,   'component_text_area')
		]);
		// 'test3' (matrix_test) + 'oh1' (matrix): two matrix tables -> UNION ALL
		$sqo->section_tipo = ['test3','oh1'];

		$search	= search::get_instance($sqo);
		$sql	= $search->parse_search_query_object();

		$this->assertIsString($sql);
		$this->assertStringContainsString('UNION ALL', $sql,
			'multi-section search must build a UNION' . PHP_EOL . $sql
		);
		// every union member must keep its own intact EXISTS subquery FROM (relations).
		// The conform step expands one EXISTS per language leaf, so the count is identical
		// per member; a union rewrite that mangles the subquery FROM zeroes it out for that member.
		$members			= explode('UNION ALL', $sql);
		$n_relations_from	= array_map(function(string $member){
			return substr_count($member, 'FROM relations AS r_j');
		}, $members);
		$this->assertNotEmpty($n_relations_from);
		$this->assertGreaterThan(0, $n_relations_from[0],
			'first union member must contain its EXISTS subqueries' . PHP_EOL . $sql
		);
		foreach ($n_relations_from as $key => $count) {
			$this->assertSame($n_relations_from[0], $count,
				'union member '.$key.' must keep the same number of FROM relations AS r_jN_ subqueries' . PHP_EOL . $sql
			);
		}
		// members 2+ must have every matrix FROM (main + inner window subselect) renamed to
		// 'mix_<table>' — an unrenamed 'AS mix ' alias would leave the renamed mix_<table>.*
		// references without a matching FROM.
		foreach (array_slice($members, 1) as $key => $member) {
			$this->assertDoesNotMatchRegularExpression('/AS mix\b/', $member,
				'union member '.($key+1).' must not keep an unrenamed mix alias' . PHP_EOL . $sql
			);
		}
	}//end test_and_multi_section_union_preserves_exists_subqueries



	/**
	* TEST_NESTED_GROUPS_EMIT_EXISTS_SUBQUERIES
	* {"$and":[{"$or":[op1,op2]}, {"$or":[op3]}]}
	* Every operand under the $and group is expanded per language by the conform step into its
	* own inner $or group, and each language leaf is emitted as a correlated EXISTS subquery:
	* no main-query joins, join ids j1_, j2_ and j3_ (one per operand).
	* @return void
	*/
	public function test_nested_groups_emit_exists_subqueries() : void {

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

		$this->assertSame(0, self::count_relations_join_any($built['joins']),
			'nested: no relations joins must be emitted to the main query' . PHP_EOL . $built['joins']
		);
		$this->assertGreaterThanOrEqual(3, substr_count($built['where'], 'EXISTS (SELECT 1'),
			'nested: expected at least three EXISTS subqueries (one per operand)' . PHP_EOL . $built['where']
		);
		$this->assertSame([1,2,3], self::join_ids_in($built['where'], $sig),
			'nested: the WHERE must reference j1_, j2_ and j3_ aliases only' . PHP_EOL . $built['where']
		);
	}//end test_nested_groups_emit_exists_subqueries



	/**
	* TEST_AND_LANG_LEAVES_MERGE_INTO_ONE_EXISTS
	* One operand on a translatable leaf through a portal expands (conform step) into one
	* $or group per language. Those language leaves share one join_id, so they must be merged
	* into a SINGLE correlated EXISTS: ∃r:P(r) ∨ ∃r:Q(r) ≡ ∃r:(P(r)∨Q(r)). Count/search
	* performance guard: without the merge each language leaf was evaluated as its own
	* correlated EXISTS subquery.
	* @return void
	*/
	public function test_and_lang_leaves_merge_into_one_exists() : void {

		$sqo	= self::build_sqo('$and', [
			self::operand('a', self::$tipo_string, 'component_input_text')
		]);
		$built	= self::build($sqo);

		$this->assertSame(1, substr_count($built['where'], 'EXISTS (SELECT 1'),
			'$and: all language leaves of one operand must merge into a single EXISTS' . PHP_EOL . $built['where']
		);
		$this->assertSame([1], self::join_ids_in($built['where'], $built['signature']),
			'$and: the merged EXISTS must reference the shared j1_ alias' . PHP_EOL . $built['where']
		);
	}//end test_and_lang_leaves_merge_into_one_exists



	/**
	* TEST_EMPTY_OPERATOR_MERGES_PER_LANG_CHECKS_INTO_ONE_EXISTS
	* The '!*' (empty) operator expands each lang into a $or of [IS NULL, = '[]'] leaves.
	* Every per-lang pair shares one join_id, so each lang must end up as ONE correlated EXISTS
	* (the two checks ORed inside): one EXISTS per lang, NOT two. Regression guard: previously
	* each leaf (IS NULL and = '[]') was emitted as its own EXISTS, doubling the subqueries.
	* @return void
	*/
	public function test_empty_operator_merges_per_lang_checks_into_one_exists() : void {

		$operand	= self::operand('', self::$tipo_string, 'component_input_text');
			$operand['q_operator']	= '!*';
			$operand['q']			= '';

		$sqo	= self::build_sqo('$and', [$operand]);
		$built	= self::build($sqo);

		$n_exists	= substr_count($built['where'], 'EXISTS (SELECT 1');
		$n_is_null	= substr_count($built['where'], ' IS NULL');
		$n_empty	= substr_count($built['where'], "= '[]'");

		// every lang has exactly one merged EXISTS holding BOTH the null and the empty-array check
		$this->assertGreaterThan(0, $n_exists, 'expected at least one EXISTS subquery' . PHP_EOL . $built['where']);
		$this->assertSame($n_is_null, $n_exists,
			'!*: the null check must be merged into the same EXISTS as the empty-array check (one per lang)' . PHP_EOL . $built['where']
		);
		$this->assertSame($n_empty, $n_exists,
			'!*: the empty-array check must be merged into the same EXISTS as the null check (one per lang)' . PHP_EOL . $built['where']
		);
	}//end test_empty_operator_merges_per_lang_checks_into_one_exists



	/**
	* TEST_SINGLE_STEP_POSITIVE_REGEX_ADDS_WHOLE_BLOB_PREFILTER
	* A single-step positive regex search (as 'contains') ANDs a redundant whole-blob regex
	* (datos#>>'{components,<tipo>,dato}') before the per-language $or group
	* (component_common::resolve_query_object_langs_behavior) ONLY when a whole-blob trigram
	* GIN index (matrix_<tipo>_gin) exists for the component, so the planner can use it
	* (matrix_rsc86_gin here). The pre-filter is a superset of the per-language OR (a lang
	* value that matches is contained in the blob), so it never removes a true match: results
	* are unchanged, only the count()/search() scan is cheaper. Components without such an
	* index must NOT get the extra predicate (no overhead).
	* @return void
	*/
	public function test_single_step_positive_regex_adds_whole_blob_prefilter() : void {

		// component with a whole-blob trigram index (matrix_rsc86_gin): pre-filter must appear
			$sqo = json_decode(json_encode([
				'section_tipo'	=> ['rsc197'],
				'filter'		=> ['$and' => [[
					'q'		=> 'garcia',
					'path'	=> [[
						'section_tipo'		=> 'rsc197',
						'component_tipo'	=> 'rsc86',
						'model'				=> 'component_input_text',
						'name'				=> 'Cognoms'
					]]
				]]],
				'limit'			=> 10,
				'offset'		=> 0,
				'full_count'	=> false
			]));
			$search = search::get_instance($sqo);
			$search->pre_parse_search_query_object();
			$where = $search->build_sql_filter();

			$this->assertStringContainsString(
				"datos#>>'{components,rsc86,dato}'",
				$where,
				'expected a whole-blob pre-filter regex (no lang)' . PHP_EOL . $where
			);
			$langs = component_common::get_search_langs('all', RecordObj_dd::get_translatable('rsc86'));
			$this->assertNotEmpty($langs);
			foreach ($langs as $lang) {
				$this->assertStringContainsString(
					"datos#>>'{components,rsc86,dato,".$lang."}'",
					$where,
					'expected per-lang regex for '.$lang . PHP_EOL . $where
				);
			}

		// component WITHOUT a whole-blob trigram index: no extra predicate
			$sqo2 = json_decode(json_encode([
				'section_tipo'	=> [self::$section_tipo],
				'filter'		=> ['$and' => [[
					'q'		=> 'garcia',
					'path'	=> [[
						'section_tipo'		=> self::$section_tipo,
						'component_tipo'	=> self::$tipo_string,
						'model'				=> 'component_input_text',
						'name'				=> 'leaf'
					]]
				]]],
				'limit'			=> 10,
				'offset'		=> 0,
				'full_count'	=> false
			]));
			$search2 = search::get_instance($sqo2);
			$search2->pre_parse_search_query_object();
			$where2 = $search2->build_sql_filter();

			$this->assertStringNotContainsString(
				"datos#>>'{components,".self::$tipo_string.",dato}'",
				$where2,
				'no whole-blob pre-filter without a matrix_<tipo>_gin index' . PHP_EOL . $where2
			);
	}//end test_single_step_positive_regex_adds_whole_blob_prefilter



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
