<?php declare(strict_types=1);
// PHPUnit classes
use PHPUnit\Framework\TestCase;
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



/**
* SEARCH_BLOB_PREFILTER_TEST
* Executes text searches on a component that HAS a whole-blob trigram GIN index
* (rsc86 -> matrix_rsc86_gin), so component_common::resolve_query_object_langs_behavior ANDs
* its redundant whole-blob pre-filter (a TERM-ONLY regex on datos#>>'{components,rsc86,dato}')
* in front of the per-language $or group.
*
* The pre-filter is only a planner hint: it must never change the result set. The claim it rests
* on is narrow, and this is where it would break. The blob is NOT a rendering-identical superset
* of every per-language value: '#>>' unquotes and unescapes a json STRING scalar, while the blob
* keeps it quoted and escaped, so the per-language text is not always a substring of the blob
* text. What IS always true is that the bare search term appears in both renderings, which is
* why the pre-filter carries the term alone and never the json anchors of the per-language
* patterns, and why a term holding '"' or '\' gets no pre-filter at all.
*
* These tests exercise the cases where it could break:
* 	- a plain value
* 	- an accented value found through unaccent (the index expression is f_unaccent wrapped)
* 	- a value containing a double quote (which json-escapes)
* 	- a value in a non-default language
* 	- every positive operator shape: contains, begins with, ends with
* 	- the same component reached THROUGH a relation, where the pre-filter has to travel inside
* 	  the correlated EXISTS instead of becoming a sibling condition
* and the opposite direction, that the pre-filter adds NO false positive: a term matching only
* the language KEYS of the blob ('lg-eng') must return nothing, because the per-language group
* it is ANDed with still runs against the values only.
*
* Every equivalence assertion runs the SAME query object twice, with search::$blob_prefilter
* false and then true, so a difference can only come from the pre-filter.
*
* Fixtures live in matrix (sections 'rsc197' and 'rsc167', linked by a portal relation) in a
* dedicated high section_id range and are removed in tearDownAfterClass.
*/
final class search_blob_prefilter_test extends TestCase {

	public static $section_tipo	= 'rsc197';	// section in the 'matrix' table
	public static $component	= 'rsc86';	// component_input_text with matrix_rsc86_gin
	public static $tipo_project	= 'rsc98';	// project relation of rsc197 (section permissions filter)

	const ID_PLAIN		= 990201;	// 'Zetagarcia'
	const ID_ACCENT		= 990202;	// 'Zétagarcía'
	const ID_QUOTE		= 990203;	// 'Zeta"garcia'
	const ID_OTHER_LANG	= 990204;	// 'Zetagarcia' only in lg-spa
	const ID_NO_MATCH	= 990205;	// 'Nothing here'

	// multi-step fixtures. A parent section linked to the records above through a portal, to
	// exercise the pre-filter when the searched component is reached THROUGH a relation
	public static $parent_section_tipo	= 'rsc167';	// section in the 'matrix' table
	public static $parent_portal		= 'rsc860';	// component_portal rsc167 -> rsc197

	const ID_PARENT_PLAIN	= 990211;	// -> ID_PLAIN
	const ID_PARENT_QUOTE	= 990212;	// -> ID_QUOTE
	const ID_PARENT_NONE	= 990213;	// -> ID_NO_MATCH



	/**
	* SET_UP_BEFORE_CLASS
	* @return void
	*/
	public static function setUpBeforeClass() : void {

		if (login::is_logged()===false) {
			login_test::force_login(TEST_USER_ID);
		}

		self::delete_fixtures();

		self::insert_record(self::ID_PLAIN,			['lg-eng' => ['Zetagarcia']]);
		self::insert_record(self::ID_ACCENT,		['lg-eng' => ['Zétagarcía']]);
		self::insert_record(self::ID_QUOTE,			['lg-eng' => ['Zeta"garcia']]);
		self::insert_record(self::ID_OTHER_LANG,	['lg-spa' => ['Zetagarcia']]);
		self::insert_record(self::ID_NO_MATCH,		['lg-eng' => ['Nothing here']]);

		// project relations, without which the section permissions filter excludes the fixtures
		foreach ([self::ID_PLAIN, self::ID_ACCENT, self::ID_QUOTE, self::ID_OTHER_LANG, self::ID_NO_MATCH] as $section_id) {
			self::insert_project_relation($section_id);
		}

		// multi-step fixtures: a parent record per child, linked through the portal
		self::insert_parent_record(self::ID_PARENT_PLAIN,	self::ID_PLAIN);
		self::insert_parent_record(self::ID_PARENT_QUOTE,	self::ID_QUOTE);
		self::insert_parent_record(self::ID_PARENT_NONE,	self::ID_NO_MATCH);
	}//end setUpBeforeClass



	/**
	* TEAR_DOWN_AFTER_CLASS
	* @return void
	*/
	public static function tearDownAfterClass() : void {

		self::delete_fixtures();
	}//end tearDownAfterClass



	/**
	* TEST_PREFILTER_IS_ACTIVE
	* Guard: without the pre-filter in the WHERE the other tests would prove nothing.
	* @return void
	*/
	public function test_prefilter_is_active() : void {

		$search = search::get_instance($this->sqo('zetagarcia'));
		$search->pre_parse_search_query_object();
		$where = $search->build_sql_filter();

		$this->assertStringContainsString(
			"datos#>>'{components,".self::$component.",dato}'",
			$where,
			'expected the whole-blob pre-filter regex (no lang)' . PHP_EOL . $where
		);
		$this->assertStringContainsString(
			"datos#>>'{components,".self::$component.",dato,lg-eng}'",
			$where,
			'expected the per-language regexes too' . PHP_EOL . $where
		);
	}//end test_prefilter_is_active



	/**
	* TEST_PREFILTER_PATTERN_IS_TERM_ONLY
	* The pre-filter regex must carry the BARE term, never the json anchors of the per-language
	* patterns ('\["', '"', '[,[] ?"', '["<]').
	* Those anchors do not survive in the blob when the per-language value is a json STRING
	* SCALAR: '#>>' unquotes and unescapes the scalar, while the blob keeps it quoted and
	* escaped, so an anchored pre-filter ANDs to false on a record that genuinely matches and
	* the record is silently lost. Reproduced on entity 'inm' (component dmm534, 'ends with'):
	* per-language matched, anchored blob did not.
	* @return void
	*/
	public function test_prefilter_pattern_is_term_only() : void {

		// 'ends with': the per-language pattern anchors a closing quote right after the term
			$search = search::get_instance($this->sqo('*zetagarcia'));
			$search->pre_parse_search_query_object();
			$where = $search->build_sql_filter();

			// (!) no table alias in the needles: the alias is the TRIMMED tipo (rsc197 -> rs197)
			$blob_path = "datos#>>'{components,".self::$component.",dato}')";

			$this->assertStringContainsString(
				$blob_path . " ~* f_unaccent('.*zetagarcia.*')",
				$where,
				'the whole-blob pre-filter must use the bare term' . PHP_EOL . $where
			);
			$this->assertStringNotContainsString(
				$blob_path . " ~* f_unaccent('.*\\[\".*",
				$where,
				'the whole-blob pre-filter must NOT carry the json array anchor' . PHP_EOL . $where
			);
			$this->assertStringContainsString(
				"dato,lg-eng}') ~* f_unaccent('.*\\[\".*zetagarcia\".*')",
				$where,
				'the per-language pattern must keep its anchors' . PHP_EOL . $where
			);
	}//end test_prefilter_pattern_is_term_only



	/**
	* TEST_PREFILTER_IS_SKIPPED_FOR_UNSAFE_TERMS
	* A term holding '"' or '\' is re-escaped by json inside the blob, so no pre-filter built
	* from it can be proven to be implied by the per-language match: it must be omitted.
	* @return void
	*/
	public function test_prefilter_is_skipped_for_unsafe_terms() : void {

		$search = search::get_instance($this->sqo('zeta"garcia'));
		$search->pre_parse_search_query_object();
		$where = $search->build_sql_filter();

		$this->assertStringNotContainsString(
			"datos#>>'{components,".self::$component.",dato}'",
			$where,
			'a term holding a double quote must not produce a whole-blob pre-filter' . PHP_EOL . $where
		);
		// without pre-filter the langs are tested with the single extraction leaf
		// (see component_common::resolve_query_object_langs_behavior)
		$this->assertStringContainsString(
			"jsonb_each_text(CASE WHEN jsonb_typeof(",
			$where,
			'the per-language test must still be emitted' . PHP_EOL . $where
		);
		$this->assertStringContainsString("'lg-eng'", $where, 'lg-eng must be tested' . PHP_EOL . $where);
	}//end test_prefilter_is_skipped_for_unsafe_terms



	/**
	* TEST_PREFILTER_TEST_SEAM_RESTORES_LEGACY_SQL
	* search::$blob_prefilter=false must remove the added predicate entirely. That seam is what
	* makes the equivalence test below meaningful: it builds the very same query object with and
	* without the redundant predicate, so a difference in the results can only come from it.
	* @return void
	*/
	public function test_prefilter_test_seam_restores_legacy_sql() : void {

		try {
			search::$blob_prefilter = false;

			$search = search::get_instance($this->sqo('zetagarcia'));
			$search->pre_parse_search_query_object();
			$where = $search->build_sql_filter();

			$this->assertStringNotContainsString(
				"datos#>>'{components,".self::$component.",dato}'",
				$where,
				'the test seam must remove the whole-blob pre-filter' . PHP_EOL . $where
			);
		} finally {
			search::$blob_prefilter = null;
		}
	}//end test_prefilter_test_seam_restores_legacy_sql



	/**
	* TEST_RESULTS_ARE_IDENTICAL_WITH_AND_WITHOUT_THE_PREFILTER
	* The pre-filter is a redundant predicate: it may only move latency, never results.
	* @return void
	*/
	public function test_results_are_identical_with_and_without_the_prefilter() : void {

		$ar_terms = ['zetagarcia', '*zetagarcia', 'zetagarcia*', 'zéta', 'zeta"garcia', 'nothing'];

		foreach ($ar_terms as $term) {

			try {
				// baseline: the legacy sql, without the redundant predicate anywhere
					search::$blob_prefilter = false;
					$expected = $this->run_search($this->sqo($term));

				search::$blob_prefilter = true;

				$this->assertSame(
					$expected,
					$this->run_search($this->sqo($term)),
					'the pre-filter changed the result set of the search "' . $term . '"'
				);
			} finally {
				search::$blob_prefilter = null;
			}
		}
	}//end test_results_are_identical_with_and_without_the_prefilter



	/**
	* TEST_PLAIN_ACCENTED_AND_OTHER_LANG_VALUES_ARE_FOUND
	* The pre-filter must not drop any of them: the blob rendering of the value is identical
	* to the per-language rendering, so a per-language match is always a blob match.
	* @return void
	*/
	public function test_plain_accented_and_other_lang_values_are_found() : void {

		$this->assertSame(
			[self::ID_PLAIN, self::ID_ACCENT, self::ID_OTHER_LANG],
			$this->run_search($this->sqo('zetagarcia')),
			'the whole-blob pre-filter must not drop plain, accented nor other-language matches'
		);
	}//end test_plain_accented_and_other_lang_values_are_found



	/**
	* TEST_VALUE_WITH_A_DOUBLE_QUOTE_IS_FOUND
	* jsonb escapes the double quote as \" in BOTH the per-language value and the whole blob,
	* so the two renderings stay identical and the pre-filter cannot drop the record.
	* Regression guard for the superset claim on values that json-escape.
	* @return void
	*/
	public function test_value_with_a_double_quote_is_found() : void {

		$this->assertSame(
			[self::ID_PLAIN, self::ID_ACCENT, self::ID_QUOTE, self::ID_OTHER_LANG],
			$this->run_search($this->sqo('zeta')),
			'a value containing a double quote must not be dropped by the whole-blob pre-filter'
		);

		// the two renderings of the value are byte identical, which is what the pre-filter relies on
		$conn	= DBi::_getConnection();
		$sql	= "SELECT datos#>>'{components,".self::$component.",dato}' AS blob,
					datos#>>'{components,".self::$component.",dato,lg-eng}' AS per_lang
					FROM matrix WHERE section_tipo=$1 AND section_id=$2";
		$result	= pg_query_params($conn, $sql, [self::$section_tipo, self::ID_QUOTE]);
		$this->assertNotFalse($result);
		$row = pg_fetch_assoc($result);
		$this->assertStringContainsString(
			$row['per_lang'],
			$row['blob'],
			'the per-language rendering must be a substring of the whole-blob rendering'
		);
	}//end test_value_with_a_double_quote_is_found



	/**
	* TEST_PREFILTER_ADDS_NO_FALSE_POSITIVE
	* 'lg-eng' is present in the whole blob of EVERY record (it is a key of the dato object)
	* but in no value. The pre-filter alone would match them all; ANDed with the per-language
	* group (which runs against the values only) it must return nothing.
	* @return void
	*/
	public function test_prefilter_adds_no_false_positive() : void {

		$this->assertSame(
			[],
			$this->run_search($this->sqo('lg-eng')),
			'a term matching only the language keys of the blob must return no record'
		);
	}//end test_prefilter_adds_no_false_positive



	/**
	* TEST_UNMATCHED_TERM_RETURNS_NOTHING
	* @return void
	*/
	public function test_unmatched_term_returns_nothing() : void {

		$this->assertSame(
			[],
			$this->run_search($this->sqo('zetaunmatchedterm'))
		);
	}//end test_unmatched_term_returns_nothing



	/**
	* TEST_MULTI_STEP_PREFILTER_IS_ACTIVE_AND_CORRELATED
	* Guard for the multi-step execution test: the pre-filter must be emitted, and it must live
	* INSIDE the single correlated EXISTS of the clause, on the same alias as the per-language
	* group. As a sibling condition it would be satisfied by a DIFFERENT linked record.
	* @return void
	*/
	public function test_multi_step_prefilter_is_active_and_correlated() : void {

		$search = search::get_instance($this->multi_step_sqo('zetagarcia'));
		$search->pre_parse_search_query_object();
		$where = $search->build_sql_filter();

		$this->assertSame(
			1,
			substr_count($where, 'EXISTS (SELECT 1'),
			'the pre-filter must not add a second EXISTS' . PHP_EOL . $where
		);
		$this->assertStringContainsString(
			"datos#>>'{components,".self::$component.",dato}') ~* f_unaccent('.*zetagarcia.*')",
			$where,
			'expected the whole-blob pre-filter with the bare term' . PHP_EOL . $where
		);

		preg_match("/f_unaccent\((j\d+_[a-z0-9_]+)\.datos#>>'\{components,".self::$component.",dato\}'\)/", $where, $ar_match);
		$this->assertNotEmpty($ar_match, 'the pre-filter must run on the joined alias' . PHP_EOL . $where);
		$this->assertStringContainsString(
			$ar_match[1] . ".datos#>>'{components,".self::$component.",dato,",
			$where,
			'the pre-filter must use the alias of the per-language group' . PHP_EOL . $where
		);
	}//end test_multi_step_prefilter_is_active_and_correlated



	/**
	* TEST_MULTI_STEP_RESULTS_ARE_IDENTICAL_WITH_AND_WITHOUT_THE_PREFILTER
	* Executes the search through the relation: the redundant predicate may only move latency,
	* never the returned records. Covers the value that json-escapes and the term that matches
	* nothing, which are the two cases where a wrong pre-filter would silently lose records.
	* @return void
	*/
	public function test_multi_step_results_are_identical_with_and_without_the_prefilter() : void {

		$ar_terms = ['zetagarcia', '*zetagarcia', 'zetagarcia*', 'zéta', 'zeta', 'zeta"garcia', 'nothing'];

		foreach ($ar_terms as $term) {

			try {
				search::$blob_prefilter = false;
				$expected = $this->run_multi_step_search($this->multi_step_sqo($term));

				search::$blob_prefilter = true;
				$actual = $this->run_multi_step_search($this->multi_step_sqo($term));
			} finally {
				search::$blob_prefilter = null;
			}

			$this->assertSame(
				$expected,
				$actual,
				'the pre-filter changed the result set of the multi-step search "' . $term . '"'
			);
		}
	}//end test_multi_step_results_are_identical_with_and_without_the_prefilter



	/**
	* TEST_MULTI_STEP_FINDS_THE_LINKED_RECORD
	* Sanity check on the fixtures: without it the equivalence test above could pass on two
	* empty result sets and prove nothing.
	* @return void
	*/
	public function test_multi_step_finds_the_linked_record() : void {

		$this->assertSame(
			[self::ID_PARENT_PLAIN],
			$this->run_multi_step_search($this->multi_step_sqo('zetagarcia')),
			'expected the parent of the matching linked record'
		);
		$this->assertSame(
			[self::ID_PARENT_PLAIN, self::ID_PARENT_QUOTE],
			$this->run_multi_step_search($this->multi_step_sqo('zeta')),
			'expected both parents, including the one whose linked value json-escapes'
		);
		$this->assertSame(
			[],
			$this->run_multi_step_search($this->multi_step_sqo('zetaunmatchedterm'))
		);
	}//end test_multi_step_finds_the_linked_record



	/////////// ⬇︎ helpers ⬇︎ ////////////////



	/**
	* SQO
	* Single-step search on the main section component
	* @param string $q
	* @return object
	*/
	private function sqo(string $q) : object {

		return json_decode(json_encode([
			'section_tipo'	=> [self::$section_tipo],
			'filter'		=> ['$and' => [[
				'q'		=> $q,
				'path'	=> [[
					'section_tipo'		=> self::$section_tipo,
					'component_tipo'	=> self::$component,
					'model'				=> 'component_input_text',
					'name'				=> 'leaf'
				]]
			]]],
			'limit'			=> 100,
			'offset'		=> 0,
			'full_count'	=> false
		]));
	}//end sqo



	/**
	* RUN_SEARCH
	* @param object $sqo
	* @return array $ar_section_id (fixture range only, sorted)
	*/
	private function run_search(object $sqo) : array {

		$_ENV['DEDALO_LAST_ERROR'] = null;

		$search	= search::get_instance($sqo);
		$result	= $search->search();

		$this->assertTrue(
			empty($_ENV['DEDALO_LAST_ERROR']),
			'expected running without errors. DEDALO_LAST_ERROR: ' . to_string($_ENV['DEDALO_LAST_ERROR'] ?? '')
		);

		$ar_section_id = [];
		foreach (($result->ar_records ?? []) as $record) {
			$section_id = (int)$record->section_id;
			if ($section_id>=990201 && $section_id<=990205) {
				$ar_section_id[] = $section_id;
			}
		}
		sort($ar_section_id);


		return $ar_section_id;
	}//end run_search



	/**
	* INSERT_RECORD
	* @param int $section_id
	* @param array $ar_lang_values as [lang => array of values]
	* @return void
	*/
	private static function insert_record(int $section_id, array $ar_lang_values) : void {

		$dato = new stdClass();
		foreach ($ar_lang_values as $lang => $ar_value) {
			$dato->{$lang} = $ar_value;
		}
		$datos = json_encode((object)[
			'components' => (object)[
				self::$component => (object)['dato' => $dato]
			]
		], JSON_UNESCAPED_UNICODE);

		$conn	= DBi::_getConnection();
		$sql	= 'INSERT INTO matrix (section_id, section_tipo, datos) VALUES ($1, $2, $3::jsonb)';
		$result	= pg_query_params($conn, $sql, [$section_id, self::$section_tipo, $datos]);
		if ($result===false) {
			throw new RuntimeException('Error inserting fixture record '.$section_id.': '.pg_last_error($conn));
		}
	}//end insert_record



	/**
	* INSERT_PROJECT_RELATION
	* @param int $section_id
	* @return void
	*/
	private static function insert_project_relation(int $section_id) : void {

		$conn	= DBi::_getConnection();
		$sql	= 'INSERT INTO relations (section_tipo, section_id, target_section_tipo, target_section_id, from_component_tipo)
					VALUES ($1, $2, $3, $4, $5)';
		$result	= pg_query_params($conn, $sql, [self::$section_tipo, $section_id, 'dd153', 1, self::$tipo_project]);
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
			'DELETE FROM relations WHERE section_tipo=$1 AND section_id >= 990201 AND section_id <= 990205',
			[self::$section_tipo]
		);
		pg_query_params(
			$conn,
			'DELETE FROM matrix WHERE section_tipo=$1 AND section_id >= 990201 AND section_id <= 990205',
			[self::$section_tipo]
		);
		pg_query_params(
			$conn,
			'DELETE FROM relations WHERE section_tipo=$1 AND section_id >= 990211 AND section_id <= 990213',
			[self::$parent_section_tipo]
		);
		pg_query_params(
			$conn,
			'DELETE FROM matrix WHERE section_tipo=$1 AND section_id >= 990211 AND section_id <= 990213',
			[self::$parent_section_tipo]
		);
	}//end delete_fixtures



	/**
	* INSERT_PARENT_RECORD
	* Creates a record of the parent section and links it to one of the records above through
	* the portal, so the searched component is reachable with a 2-step path.
	* @param int $section_id
	* @param int $target_section_id
	* @return void
	*/
	private static function insert_parent_record(int $section_id, int $target_section_id) : void {

		$conn = DBi::_getConnection();

		$result = pg_query_params(
			$conn,
			'INSERT INTO matrix (section_id, section_tipo, datos) VALUES ($1, $2, $3::jsonb)',
			[$section_id, self::$parent_section_tipo, json_encode((object)['components' => (object)[]])]
		);
		if ($result===false) {
			throw new RuntimeException('Error inserting parent fixture '.$section_id.': '.pg_last_error($conn));
		}

		$result = pg_query_params(
			$conn,
			'INSERT INTO relations (section_tipo, section_id, target_section_tipo, target_section_id, from_component_tipo)
				VALUES ($1, $2, $3, $4, $5)',
			[self::$parent_section_tipo, $section_id, self::$section_tipo, $target_section_id, self::$parent_portal]
		);
		if ($result===false) {
			throw new RuntimeException('Error inserting portal relation '.$section_id.': '.pg_last_error($conn));
		}
	}//end insert_parent_record



	/**
	* MULTI_STEP_SQO
	* Search on the parent section, filtering by the component of the linked record.
	* (!) skip_projects_filter: the parent fixtures carry no project relation, and the
	* permissions filter is not what these tests are about.
	* @param string $q
	* @return object
	*/
	private function multi_step_sqo(string $q) : object {

		return json_decode(json_encode([
			'section_tipo'	=> [self::$parent_section_tipo],
			'filter'		=> ['$and' => [[
				'q'		=> $q,
				'path'	=> [
					[
						'section_tipo'		=> self::$parent_section_tipo,
						'component_tipo'	=> self::$parent_portal,
						'model'				=> 'component_portal',
						'name'				=> 'portal'
					],
					[
						'section_tipo'		=> self::$section_tipo,
						'component_tipo'	=> self::$component,
						'model'				=> 'component_input_text',
						'name'				=> 'leaf'
					]
				]
			]]],
			'limit'					=> 100,
			'offset'				=> 0,
			'full_count'			=> false,
			'skip_projects_filter'	=> true
		]));
	}//end multi_step_sqo



	/**
	* RUN_MULTI_STEP_SEARCH
	* @param object $sqo
	* @return array $ar_section_id (parent fixture range only, sorted)
	*/
	private function run_multi_step_search(object $sqo) : array {

		$_ENV['DEDALO_LAST_ERROR'] = null;

		$search	= search::get_instance($sqo);
		$result	= $search->search();

		$this->assertTrue(
			empty($_ENV['DEDALO_LAST_ERROR']),
			'expected running without errors. DEDALO_LAST_ERROR: ' . to_string($_ENV['DEDALO_LAST_ERROR'] ?? '')
		);

		$ar_section_id = [];
		foreach (($result->ar_records ?? []) as $record) {
			$section_id = (int)$record->section_id;
			if ($section_id>=990211 && $section_id<=990213) {
				$ar_section_id[] = $section_id;
			}
		}
		sort($ar_section_id);


		return $ar_section_id;
	}//end run_multi_step_search



}//end search_blob_prefilter_test
