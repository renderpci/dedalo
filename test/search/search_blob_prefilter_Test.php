<?php declare(strict_types=1);
// PHPUnit classes
use PHPUnit\Framework\TestCase;
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



/**
* SEARCH_BLOB_PREFILTER_TEST
* Executes single-step text searches on a component that HAS a whole-blob trigram GIN index
* (rsc86 -> matrix_rsc86_gin), so component_common::resolve_query_object_langs_behavior ANDs
* its redundant whole-blob pre-filter (a same-pattern regex on datos#>>'{components,rsc86,dato}')
* in front of the per-language $or group.
*
* The pre-filter is only a planner hint: it must never change the result set. That claim rests
* on the blob being a strict superset of every per-language value, which is only true because
* jsonb renders the nested value the same way in both extractions (same quoting, same escaping).
* These tests exercise the cases where it could break:
* 	- a plain value
* 	- an accented value found through unaccent (the index expression is f_unaccent wrapped)
* 	- a value containing a double quote (escaped identically in both renderings)
* 	- a value in a non-default language
* and the opposite direction, that the pre-filter adds NO false positive: a term matching only
* the language KEYS of the blob ('lg-eng') must return nothing, because the per-language group
* it is ANDed with still runs against the values only.
*
* Fixtures live in matrix (section 'rsc197') in a dedicated high section_id range and are
* removed in tearDownAfterClass.
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
	}//end delete_fixtures



}//end search_blob_prefilter_test
