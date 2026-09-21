<?php declare(strict_types=1);
// PHPUnit classes
use PHPUnit\Framework\TestCase;
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



/**
* SEARCH_JOINS_EXECUTION_TEST
* Companion of search_joins_Test: that one locks the SHAPE of the generated SQL (which joins
* and EXISTS subqueries are emitted), this one EXECUTES the search against the database with
* controlled fixtures and locks the RESULT SET.
*
* Why: multi-step filter clauses under $and are emitted as correlated EXISTS subqueries
* (see search::filter_parser) instead of main-query LEFT JOIN pairs. The shape assertions
* cannot prove that
* 	- the SQL is valid (a mangled subquery alias only fails at execution time: the union
* 	  rewrite regression produced "missing FROM-clause entry for table r_jN_...")
* 	- the cross-record AND semantics are preserved (value A and value B matching two
* 	  DIFFERENT linked records must still match the parent record)
* 	- no row multiplication / duplicated records leak into the result
*
* Fixtures are inserted directly in matrix_test / relations (section 'test3', portal 'test80',
* leaf components 'test52' component_input_text and 'test17' component_text_area) and removed
* in tearDownAfterClass. Section ids are in a dedicated high range to never collide with the
* records of the test ontology.
*
* 	parent 1 (P1) --test80--> child A (test52: ['zetaalpha'])
* 	              --test80--> child B (test52: ['zetabeta'])
* 	parent 2 (P2) --test80--> child C (test52: ['zetaalpha'])
* 	parent 3 (P3) --test80--> child D (test52: ['zetaalpha','zetabeta'], test17: '<p>zetabeta</p>')
*
* So, through the portal, on test52:
* 	$and [zetaalpha, zetabeta] -> P1 (two DIFFERENT children) and P3 (one single child)
* 	$or  [zetaalpha, zetabeta] -> P1, P2, P3 (each exactly once)
* P1 is the case only an independent traversal per clause can match; P3 the control case that
* a single shared traversal would also match.
*
* Every fixture record also gets its 'test101' (project) relation, without which the section
* permissions filter of search() would exclude it.
*/
final class search_joins_execution_test extends TestCase {

	public static $section_tipo	= 'test3';	// main section (matrix_test)
	public static $tipo_portal	= 'test80';	// component_portal in test3 -> test3
	public static $tipo_string	= 'test52';	// component_input_text (target leaf)
	public static $tipo_text	= 'test17';	// component_text_area (target leaf)
	public static $tipo_project	= 'test101';	// component_filter_master (project relation)

	// fixture section ids. High dedicated range, removed in tearDownAfterClass
	public static $id_p1		= 990101;
	public static $id_p2		= 990102;
	public static $id_p3		= 990103;
	public static $id_child_a	= 990111;
	public static $id_child_b	= 990112;
	public static $id_child_c	= 990113;
	public static $id_child_d	= 990114;

	// unique-ish terms, to never match a real record of the test ontology
	const Q_ALPHA	= 'zetaalpha';
	const Q_BETA	= 'zetabeta';
	const Q_GAMMA	= 'zetagamma';	// present in no fixture



	/**
	* SET_UP_BEFORE_CLASS
	* Login and insert the fixtures
	* @return void
	*/
	public static function setUpBeforeClass() : void {

		if (login::is_logged()===false) {
			login_test::force_login(TEST_USER_ID);
		}

		self::delete_fixtures();	// in case a previous aborted run left them behind

		self::insert_record(self::$id_p1, []);
		self::insert_record(self::$id_p2, []);
		self::insert_record(self::$id_p3, []);
		self::insert_record(self::$id_child_a, [self::$tipo_string => [self::Q_ALPHA]]);
		self::insert_record(self::$id_child_b, [self::$tipo_string => [self::Q_BETA]]);
		self::insert_record(self::$id_child_c, [self::$tipo_string => [self::Q_ALPHA]]);
		self::insert_record(self::$id_child_d, [
			self::$tipo_string	=> [self::Q_ALPHA, self::Q_BETA],
			self::$tipo_text	=> ['<p>'.self::Q_BETA.'</p>']
		]);

		self::insert_relation(self::$id_p1, self::$id_child_a);
		self::insert_relation(self::$id_p1, self::$id_child_b);
		self::insert_relation(self::$id_p2, self::$id_child_c);
		self::insert_relation(self::$id_p3, self::$id_child_d);

		// project relations ('test101'), needed by the section permissions filter
		foreach ([self::$id_p1, self::$id_p2, self::$id_p3, self::$id_child_a, self::$id_child_b, self::$id_child_c, self::$id_child_d] as $section_id) {
			self::insert_project_relation($section_id);
		}
	}//end setUpBeforeClass



	/**
	* TEAR_DOWN_AFTER_CLASS
	* @return void
	*/
	public static function tearDownAfterClass() : void {

		self::delete_fixtures();
	}//end tearDownAfterClass



	/**
	* TEST_FIXTURES_ARE_IN_PLACE
	* Guard: every other assertion here is meaningless without the fixtures.
	* @return void
	*/
	public function test_fixtures_are_in_place() : void {

		$conn	= DBi::_getConnection();
		$sql	= 'SELECT count(*) FROM matrix_test WHERE section_tipo=$1 AND section_id >= 990101 AND section_id <= 990114';
		$result	= pg_query_params($conn, $sql, [self::$section_tipo]);
		$this->assertNotFalse($result);
		$this->assertSame(7, (int)pg_fetch_result($result, 0, 0), 'expected the 7 fixture records');

		$sql	= 'SELECT count(*) FROM relations WHERE from_component_tipo=$1 AND section_id >= 990101 AND section_id <= 990114';
		$result	= pg_query_params($conn, $sql, [self::$tipo_portal]);
		$this->assertSame(4, (int)pg_fetch_result($result, 0, 0), 'expected the 4 fixture portal relations');

		$sql	= 'SELECT count(*) FROM relations WHERE from_component_tipo=$1 AND section_id >= 990101 AND section_id <= 990114';
		$result	= pg_query_params($conn, $sql, [self::$tipo_project]);
		$this->assertSame(7, (int)pg_fetch_result($result, 0, 0), 'expected the 7 fixture project relations');
	}//end test_fixtures_are_in_place



	/**
	* TEST_AND_MULTI_STEP_IS_CROSS_RECORD
	* The contract the per-clause join_id (and now the per-clause EXISTS subquery) exists for:
	* "value A AND value B" through a portal matches when A and B live in DIFFERENT linked
	* records (P1), and also when they live in the same one (P3).
	* A single shared traversal would only return P3.
	* @return void
	*/
	public function test_and_multi_step_is_cross_record() : void {

		$ids = $this->run_search($this->sqo('$and', [
			self::operand(self::Q_ALPHA, self::$tipo_string, 'component_input_text'),
			self::operand(self::Q_BETA,  self::$tipo_string, 'component_input_text')
		]));

		$this->assertSame(
			[self::$id_p1, self::$id_p3],
			$ids,
			'$and through a portal must match across different linked records'
		);
	}//end test_and_multi_step_is_cross_record



	/**
	* TEST_AND_MULTI_STEP_NO_MATCH
	* A term present in no linked record must return nothing (the EXISTS subquery must really
	* constrain: an always-true correlated subquery would return every record of the section).
	* @return void
	*/
	public function test_and_multi_step_no_match() : void {

		$ids = $this->run_search($this->sqo('$and', [
			self::operand(self::Q_ALPHA, self::$tipo_string, 'component_input_text'),
			self::operand(self::Q_GAMMA, self::$tipo_string, 'component_input_text')
		]));

		$this->assertSame([], $ids, '$and with an unmatched term must return no record');
	}//end test_and_multi_step_no_match



	/**
	* TEST_AND_MULTI_STEP_ACROSS_COMPONENTS
	* Same cross-record AND, with the two clauses on DIFFERENT leaf components (input_text and
	* text_area): only P3 has both in its single linked record, P1 has neither pair.
	* @return void
	*/
	public function test_and_multi_step_across_components() : void {

		$ids = $this->run_search($this->sqo('$and', [
			self::operand(self::Q_ALPHA, self::$tipo_string, 'component_input_text'),
			self::operand(self::Q_BETA,  self::$tipo_text,   'component_text_area')
		]));

		$this->assertSame([self::$id_p3], $ids);
	}//end test_and_multi_step_across_components



	/**
	* TEST_OR_MULTI_STEP_RETURNS_EACH_RECORD_ONCE
	* $or operands share one LEFT JOIN relations/matrix pair in the main query. A record whose
	* two linked children match one operand each (P1) must still be returned ONCE: the row
	* multiplication of the join is collapsed by the DISTINCT ON of the main query.
	* @return void
	*/
	public function test_or_multi_step_returns_each_record_once() : void {

		$ids = $this->run_search($this->sqo('$or', [
			self::operand(self::Q_ALPHA, self::$tipo_string, 'component_input_text'),
			self::operand(self::Q_BETA,  self::$tipo_string, 'component_input_text')
		]));

		$this->assertSame(
			[self::$id_p1, self::$id_p2, self::$id_p3],
			$ids,
			'$or must return every matching record exactly once'
		);
	}//end test_or_multi_step_returns_each_record_once



	/**
	* TEST_SINGLE_OPERAND_AND_EQUALS_OR
	* With ONE multi-step operand the two emission strategies must agree: $and builds a
	* correlated EXISTS subquery, $or a main-query LEFT JOIN pair. Same operand, same records.
	* This is the direct equivalence check between the legacy join form and the new EXISTS form.
	* @return void
	*/
	public function test_single_operand_and_equals_or() : void {

		$operand = self::operand(self::Q_ALPHA, self::$tipo_string, 'component_input_text');

		$ids_and	= $this->run_search($this->sqo('$and', [$operand]));
		$ids_or		= $this->run_search($this->sqo('$or',  [$operand]));

		$this->assertSame(
			[self::$id_p1, self::$id_p2, self::$id_p3],
			$ids_and,
			'$and (EXISTS form) must match the three parents'
		);
		$this->assertSame(
			$ids_and,
			$ids_or,
			'the EXISTS form ($and) and the LEFT JOIN form ($or) must return the same records'
		);
	}//end test_single_operand_and_equals_or



	/**
	* TEST_NESTED_OR_INSIDE_AND
	* {"$and":[ {"$or":[alpha, gamma]}, {"$or":[beta]} ]}
	* The nested $or groups inherit the subquery context (their leaves become EXISTS), and the
	* result must be the same as the flat $and of the matching terms.
	* @return void
	*/
	public function test_nested_or_inside_and() : void {

		$sqo = json_decode(json_encode([
			'section_tipo'	=> [self::$section_tipo],
			'filter'		=> [
				'$and' => [
					['$or' => [
						self::operand(self::Q_ALPHA, self::$tipo_string, 'component_input_text'),
						self::operand(self::Q_GAMMA, self::$tipo_string, 'component_input_text')
					]],
					['$or' => [
						self::operand(self::Q_BETA, self::$tipo_string, 'component_input_text')
					]]
				]
			],
			'limit'			=> 100,
			'offset'		=> 0,
			'full_count'	=> false
		]));

		$this->assertSame(
			[self::$id_p1, self::$id_p3],
			$this->run_search($sqo)
		);
	}//end test_nested_or_inside_and



	/**
	* TEST_MULTI_SECTION_UNION_EXECUTES
	* Multi-section search (two matrix tables -> UNION ALL) with multi-step $and clauses.
	* build_union_query rewrites the main 'FROM <table> AS <alias>' of every union member; it
	* must leave the EXISTS subqueries' own 'FROM relations AS r_jN_...' untouched, otherwise
	* Postgres fails with "missing FROM-clause entry for table r_jN_...". Only executing the
	* query can catch it.
	* @return void
	*/
	public function test_multi_section_union_executes() : void {

		$sqo = $this->sqo('$and', [
			self::operand(self::Q_ALPHA, self::$tipo_string, 'component_input_text'),
			self::operand(self::Q_BETA,  self::$tipo_string, 'component_input_text')
		]);
		$sqo->section_tipo = [self::$section_tipo, 'oh1'];	// matrix_test + matrix

		$ids = $this->run_search($sqo);

		$this->assertSame(
			[self::$id_p1, self::$id_p3],
			$ids,
			'the union members must keep their own EXISTS subqueries intact'
		);
	}//end test_multi_section_union_executes



	/**
	* TEST_COUNT_MATCHES_SEARCH
	* count() builds the same filter as search() (with its own column list). The number of
	* records it reports must match the records actually returned; a cartesian product in the
	* count query would inflate it.
	* @return void
	*/
	public function test_count_matches_search() : void {

		$sqo = $this->sqo('$or', [
			self::operand(self::Q_ALPHA, self::$tipo_string, 'component_input_text'),
			self::operand(self::Q_BETA,  self::$tipo_string, 'component_input_text')
		]);
		$_ENV['DEDALO_LAST_ERROR'] = null;

		$count_result	= search::get_instance($sqo)->count();
		$search_ids		= $this->run_search($sqo);

		$this->assertTrue(
			empty($_ENV['DEDALO_LAST_ERROR']),
			'expected running without errors. DEDALO_LAST_ERROR: ' . to_string($_ENV['DEDALO_LAST_ERROR'] ?? '')
		);
		$this->assertSame(
			count($search_ids),
			(int)$count_result->total,
			'count() must report the matching records, not the multiplied join rows'
		);
	}//end test_count_matches_search



	/**
	* TEST_UNRESOLVABLE_PATH_UNDER_AND_RETURNS_NO_RECORD
	* A path step whose section_tipo has no matrix table cannot be joined, so the clause has no
	* table alias to filter on. It must NOT be dropped: under $and a dropped clause relaxes the
	* filter and the search returns records that do not match it. search::filter_parser emits a
	* never-matching predicate instead (search::UNRESOLVABLE_PATH_SQL).
	* @return void
	*/
	public function test_unresolvable_path_under_and_returns_no_record() : void {

		$sqo = $this->sqo('$and', [
			self::operand(self::Q_ALPHA, self::$tipo_string, 'component_input_text'),
			self::broken_operand(self::Q_ALPHA)
		]);

		$this->assertSame(
			[],
			$this->run_search($sqo, true),
			'an unresolvable path must not be silently dropped from an $and filter'
		);

		// control: the same filter without the broken clause does match
		$this->assertSame(
			[self::$id_p1, self::$id_p2, self::$id_p3],
			$this->run_search($this->sqo('$and', [
				self::operand(self::Q_ALPHA, self::$tipo_string, 'component_input_text')
			]))
		);
	}//end test_unresolvable_path_under_and_returns_no_record



	/**
	* TEST_UNRESOLVABLE_PATH_UNDER_OR_RETURNS_NO_RECORD
	* Same for the main-query $or branch, where the clause's WHERE would otherwise reference an
	* alias that was never joined ("missing FROM-clause entry for table ..."): the query must
	* still be valid SQL and simply match nothing.
	* @return void
	*/
	public function test_unresolvable_path_under_or_returns_no_record() : void {

		$sqo = $this->sqo('$or', [self::broken_operand(self::Q_ALPHA)]);

		// the WHERE must carry the never-matching predicate and must NOT reference the alias
		// of the step that could never be joined
		$search = search::get_instance($sqo);
		$search->pre_parse_search_query_object();
		$where = $search->build_sql_filter();

		$this->assertStringContainsString(trim(search::UNRESOLVABLE_PATH_SQL), $where, $where);
		$this->assertStringNotContainsString('zz9', $where,
			'the WHERE must not reference an alias that was never joined' . PHP_EOL . $where
		);

		$this->assertSame(
			[],
			$this->run_search($sqo, true),
			'an unresolvable path under $or must build valid SQL and match nothing'
		);
	}//end test_unresolvable_path_under_or_returns_no_record



	/**
	* TEST_UNRESOLVABLE_SELECT_PATH_RETURNS_A_NULL_COLUMN
	* A select column whose path cannot be joined would reference an alias that is not in the
	* FROM clause and break the WHOLE query. build_sql_query_select emits a NULL placeholder
	* with the same alias instead, so the query runs and the row keeps its shape: the other
	* columns are still there and the broken one is simply empty.
	* @return void
	*/
	public function test_unresolvable_select_path_returns_a_null_column() : void {

		$sqo = $this->sqo('$and', [
			self::operand(self::Q_ALPHA, self::$tipo_string, 'component_input_text')
		]);
		$sqo->select = json_decode(json_encode([
			// valid single-step column
			[
				'path'				=> [[
					'section_tipo'		=> self::$section_tipo,
					'component_tipo'	=> self::$tipo_string,
					'model'				=> 'component_input_text',
					'name'				=> 'leaf'
				]],
				'component_path'	=> ['components', self::$tipo_string, 'dato'],
				'type'				=> 'string'
			],
			// unresolvable two-step column
			[
				'path'				=> [
					[
						'section_tipo'		=> self::$section_tipo,
						'component_tipo'	=> self::$tipo_portal,
						'model'				=> 'component_portal',
						'name'				=> 'portal'
					],
					[
						'section_tipo'		=> 'zz999',	// not a section: no matrix table
						'component_tipo'	=> self::$tipo_text,
						'model'				=> 'component_text_area',
						'name'				=> 'leaf'
					]
				],
				'component_path'	=> ['components', self::$tipo_text, 'dato'],
				'type'				=> 'string'
			]
		]));

		$_ENV['DEDALO_LAST_ERROR'] = null;

		$search	= search::get_instance($sqo);
		$result	= $search->search();

		$ar_records = array_values(array_filter($result->ar_records ?? [], function($record){
			return (int)$record->section_id>=990101 && (int)$record->section_id<=990114;
		}));

		$this->assertCount(3, $ar_records, 'the query must run and return the matching records');
		foreach ($ar_records as $record) {
			$this->assertTrue(
				property_exists($record, self::$tipo_text),
				'the unresolvable column must still be present in the row'
			);
			$this->assertNull(
				$record->{self::$tipo_text},
				'the unresolvable column must be NULL'
			);
			$this->assertTrue(
				property_exists($record, self::$tipo_string),
				'the valid column must not be lost'
			);
		}
	}//end test_unresolvable_select_path_returns_a_null_column



	/**
	* TEST_UNRESOLVABLE_ORDER_PATH_IS_IGNORED
	* An ORDER BY on a path that cannot be joined would break the query too. The order item is
	* dropped (ordering is presentational) and the search still returns its records.
	* @return void
	*/
	public function test_unresolvable_order_path_is_ignored() : void {

		$sqo = $this->sqo('$and', [
			self::operand(self::Q_ALPHA, self::$tipo_string, 'component_input_text')
		]);
		$sqo->order = json_decode(json_encode([[
			'direction'			=> 'ASC',
			'path'				=> [
				[
					'section_tipo'		=> self::$section_tipo,
					'component_tipo'	=> self::$tipo_portal,
					'model'				=> 'component_portal',
					'name'				=> 'portal'
				],
				[
					'section_tipo'		=> 'zz999',	// not a section: no matrix table
					'component_tipo'	=> self::$tipo_string,
					'model'				=> 'component_input_text',
					'name'				=> 'leaf'
				]
			],
			'component_path'	=> ['components', self::$tipo_string, 'dato'],
			'type'				=> 'string'
		]]));

		$this->assertSame(
			[self::$id_p1, self::$id_p2, self::$id_p3],
			$this->run_search($sqo, true),
			'an unresolvable order path must be ignored, not break the query'
		);
	}//end test_unresolvable_order_path_is_ignored



	/////////// ⬇︎ helpers ⬇︎ ////////////////



	/**
	* RUN_SEARCH
	* Executes the search and returns the sorted list of matched section_id of the fixture
	* range (other records of the test ontology, if any matched, would be noise).
	* Fails the test on any SQL error.
	* @param object $sqo
	* @return array $ar_section_id
	*/
	private function run_search(object $sqo, bool $allow_logged_error=false) : array {

		$_ENV['DEDALO_LAST_ERROR'] = null;

		$search	= search::get_instance($sqo);
		$result	= $search->search();

		// the unresolvable path cases log an ERROR on purpose (invalid ontology path), so only
		// the SQL execution itself is required to be clean there
		$this->assertTrue(
			$allow_logged_error===true || empty($_ENV['DEDALO_LAST_ERROR']),
			'expected running without errors. DEDALO_LAST_ERROR: ' . to_string($_ENV['DEDALO_LAST_ERROR'] ?? '')
		);
		$this->assertIsObject($result);
		$this->assertIsArray($result->ar_records ?? null);

		$ar_section_id = [];
		foreach ($result->ar_records as $record) {
			$section_id = (int)$record->section_id;
			if ($section_id>=990101 && $section_id<=990114) {
				$ar_section_id[] = $section_id;
			}
		}
		sort($ar_section_id);


		return $ar_section_id;
	}//end run_search



	/**
	* BROKEN_OPERAND
	* Two-step leaf operand whose target section_tipo has no matrix table, so build_sql_join
	* cannot emit the joins nor the alias the clause's WHERE needs.
	* @param string $q
	* @return array
	*/
	private static function broken_operand(string $q) : array {

		$operand = self::operand($q, self::$tipo_string, 'component_input_text');
		$operand['path'][1]['section_tipo'] = 'zz999';	// not a section: no matrix table


		return $operand;
	}//end broken_operand



	/**
	* SQO
	* @param string $op ('$or'|'$and')
	* @param array $operands
	* @return object
	*/
	private function sqo(string $op, array $operands) : object {

		return json_decode(json_encode([
			'section_tipo'	=> [self::$section_tipo],
			'filter'		=> [$op => $operands],
			'limit'			=> 100,
			'offset'		=> 0,
			'full_count'	=> false
		]));
	}//end sqo



	/**
	* OPERAND
	* Two-step leaf operand: main.portal -> target.leaf
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
	* INSERT_RECORD
	* @param int $section_id
	* @param array $ar_components as [component_tipo => array of values]
	* @return void
	*/
	private static function insert_record(int $section_id, array $ar_components) : void {

		$components = new stdClass();
		foreach ($ar_components as $component_tipo => $ar_value) {
			$components->{$component_tipo} = (object)[
				'dato' => (object)[
					DEDALO_DATA_LANG_DEFAULT => $ar_value
				]
			];
		}
		$datos = json_encode((object)['components' => $components], JSON_UNESCAPED_UNICODE);

		$conn	= DBi::_getConnection();
		$sql	= 'INSERT INTO matrix_test (section_id, section_tipo, datos) VALUES ($1, $2, $3::jsonb)';
		$result	= pg_query_params($conn, $sql, [$section_id, self::$section_tipo, $datos]);
		if ($result===false) {
			throw new RuntimeException('Error inserting fixture record '.$section_id.': '.pg_last_error($conn));
		}
	}//end insert_record



	/**
	* INSERT_RELATION
	* @param int $section_id
	* @param int $target_section_id
	* @return void
	*/
	private static function insert_relation(int $section_id, int $target_section_id) : void {

		$conn	= DBi::_getConnection();
		$sql	= 'INSERT INTO relations (section_tipo, section_id, target_section_tipo, target_section_id, from_component_tipo)
					VALUES ($1, $2, $3, $4, $5)';
		$result	= pg_query_params($conn, $sql, [
			self::$section_tipo,
			$section_id,
			self::$section_tipo,
			$target_section_id,
			self::$tipo_portal
		]);
		if ($result===false) {
			throw new RuntimeException('Error inserting fixture relation '.$section_id.': '.pg_last_error($conn));
		}
	}//end insert_relation



	/**
	* INSERT_PROJECT_RELATION
	* The section permissions filter of search() restricts the records to the projects of the
	* user ('test101' relations). A fixture without it is never returned.
	* @param int $section_id
	* @return void
	*/
	private static function insert_project_relation(int $section_id) : void {

		$conn	= DBi::_getConnection();
		$sql	= 'INSERT INTO relations (section_tipo, section_id, target_section_tipo, target_section_id, from_component_tipo)
					VALUES ($1, $2, $3, $4, $5)';
		$result	= pg_query_params($conn, $sql, [
			self::$section_tipo,
			$section_id,
			'dd153',
			1,
			self::$tipo_project
		]);
		if ($result===false) {
			throw new RuntimeException('Error inserting fixture project relation '.$section_id.': '.pg_last_error($conn));
		}
	}//end insert_project_relation



	/**
	* DELETE_FIXTURES
	* @return void
	*/
	private static function delete_fixtures() : void {

		$conn = DBi::_getConnection();
		pg_query_params(
			$conn,
			'DELETE FROM relations WHERE section_tipo=$1 AND section_id >= 990101 AND section_id <= 990114',
			[self::$section_tipo]
		);
		pg_query_params(
			$conn,
			'DELETE FROM matrix_test WHERE section_tipo=$1 AND section_id >= 990101 AND section_id <= 990114',
			[self::$section_tipo]
		);
	}//end delete_fixtures



}//end search_joins_execution_test
