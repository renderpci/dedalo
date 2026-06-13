<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



/**
* CLASS SECTION_MAP_TEST
* Unit tests for the generalized section_map resolver.
* Structural tests inject synthetic multi-scope maps directly into the public
* section::$section_map_cache (restored in tearDown). Term-resolution parity
* tests use the real 'ts1' thesaurus fixture also exercised by ts_object_Test.
*/
final class section_map_test extends BaseTestCase {


	// fake section_tipos seeded into section::$section_map_cache
	private array $fake_tipos = ['fake_sm_full', 'fake_sm_no_main', 'fake_sm_str', 'fake_sm_empty'];



	/**
	* SETUP
	* Seed synthetic section_map definitions into the cache.
	* @return void
	*/
	protected function setUp(): void {

		parent::setUp();

		// full map: all three scopes, thesaurus carries a custom separator and is_indexable:false
		section::$section_map_cache['fake_sm_full'] = json_decode('{
			"main":          { "term": ["c_main"] },
			"thesaurus":     { "term": ["c_t1","c_t2"], "fields_separator": " ", "model": "c_model", "order": "c_order", "is_indexable": false },
			"relation_list": { "term": ["c_rl1","c_rl2","c_rl3"] }
		}');

		// no main scope (forces chain / strict differences)
		section::$section_map_cache['fake_sm_no_main'] = json_decode('{
			"thesaurus":     { "term": ["c_t1"] },
			"relation_list": { "term": ["c_rl1"] }
		}');

		// term as plain string (normalization)
		section::$section_map_cache['fake_sm_str'] = json_decode('{
			"thesaurus": { "term": "c_single" }
		}');

		// empty map (no scopes)
		section::$section_map_cache['fake_sm_empty'] = json_decode('{}');
	}//end setUp



	/**
	* TEARDOWN
	* Remove seeded cache entries.
	* @return void
	*/
	protected function tearDown(): void {

		foreach ($this->fake_tipos as $tipo) {
			unset(section::$section_map_cache[$tipo]);
		}

		parent::tearDown();
	}//end tearDown



	/**
	* TEST_GET_MAP
	* @return void
	*/
	public function test_get_map(): void {

		$result = section_map::get_map('fake_sm_full');

		$this->assertTrue(
			is_object($result) && isset($result->thesaurus),
			'expected object with thesaurus scope'
		);
	}//end test_get_map



	/**
	* TEST_RESOLVE_SCOPE_NAME
	* Requested-first, then chain main -> thesaurus -> relation_list; strict disables chain.
	* @return void
	*/
	public function test_resolve_scope_name(): void {

		// direct hit
		$this->assertSame('thesaurus', section_map::resolve_scope_name('fake_sm_full', 'thesaurus'));
		$this->assertSame('relation_list', section_map::resolve_scope_name('fake_sm_full', 'relation_list'));

		// null scope starts the chain at main
		$this->assertSame('main', section_map::resolve_scope_name('fake_sm_full', null));

		// chain fallback when main absent (skip already-tried main)
		$this->assertSame('thesaurus', section_map::resolve_scope_name('fake_sm_no_main', null));
		$this->assertSame('thesaurus', section_map::resolve_scope_name('fake_sm_no_main', 'main'));

		// strict: no chain
		$this->assertNull(section_map::resolve_scope_name('fake_sm_no_main', null, true));
		$this->assertNull(section_map::resolve_scope_name('fake_sm_no_main', 'main', true));
		$this->assertSame('thesaurus', section_map::resolve_scope_name('fake_sm_no_main', 'thesaurus', true));

		// no map at all
		$this->assertNull(section_map::resolve_scope_name('fake_sm_empty', null));
	}//end test_resolve_scope_name



	/**
	* TEST_GET_TERM_TIPOS
	* Array + string normalization; empty when nothing provides term.
	* @return void
	*/
	public function test_get_term_tipos(): void {

		$this->assertSame(['c_t1','c_t2'], section_map::get_term_tipos('fake_sm_full', 'thesaurus'));

		// null scope -> main first
		$this->assertSame(['c_main'], section_map::get_term_tipos('fake_sm_full', null));

		// string normalized to array
		$this->assertSame(['c_single'], section_map::get_term_tipos('fake_sm_str', 'thesaurus'));

		// empty map
		$this->assertSame([], section_map::get_term_tipos('fake_sm_empty', 'thesaurus'));
	}//end test_get_term_tipos



	/**
	* TEST_GET_FIELDS_SEPARATOR
	* Per-scope override + default; separator follows the scope that supplied the term.
	* @return void
	*/
	public function test_get_fields_separator(): void {

		// thesaurus declares a custom separator
		$this->assertSame(' ', section_map::get_fields_separator('fake_sm_full', 'thesaurus'));

		// main has term but no separator -> default
		$this->assertSame(section_map::DEFAULT_FIELDS_SEPARATOR, section_map::get_fields_separator('fake_sm_full', 'main'));

		// relation_list has term but no separator -> default (follows resolved term scope)
		$this->assertSame(section_map::DEFAULT_FIELDS_SEPARATOR, section_map::get_fields_separator('fake_sm_full', 'relation_list'));

		// no term anywhere -> default
		$this->assertSame(section_map::DEFAULT_FIELDS_SEPARATOR, section_map::get_fields_separator('fake_sm_empty', null));
	}//end test_get_fields_separator



	/**
	* TEST_GET_ELEMENT_TIPO
	* Per-key chain walk; bool false passthrough; first-element collapse.
	* @return void
	*/
	public function test_get_element_tipo(): void {

		// 'model' lives only in thesaurus: requesting main must walk to thesaurus
		$this->assertSame('c_model', section_map::get_element_tipo('fake_sm_full', 'model', 'main'));

		// is_indexable:false must pass through unchanged (not coerced to null)
		$this->assertFalse(section_map::get_element_tipo('fake_sm_full', 'is_indexable', 'thesaurus'));

		// missing key everywhere -> null
		$this->assertNull(section_map::get_element_tipo('fake_sm_full', 'does_not_exist', 'thesaurus'));

		// get_first_element_tipo collapses an array term to its first element
		$this->assertSame('c_t1', section_map::get_first_element_tipo('fake_sm_full', 'term', 'thesaurus'));
		$this->assertSame('c_order', section_map::get_first_element_tipo('fake_sm_full', 'order', 'thesaurus'));
		$this->assertNull(section_map::get_first_element_tipo('fake_sm_full', 'does_not_exist', 'thesaurus'));
	}//end test_get_element_tipo



	/**
	* TEST_GET_SCOPE_STRICT
	* relation_list strict lookup (used by relation_list refactor).
	* @return void
	*/
	public function test_get_scope_strict(): void {

		$rl = section_map::get_scope('fake_sm_full', 'relation_list', true);
		$this->assertTrue(
			is_object($rl) && !empty($rl->term),
			'expected relation_list scope object with term'
		);

		// strict relation_list on a map lacking it -> null
		$this->assertNull(section_map::get_scope('fake_sm_str', 'relation_list', true));
	}//end test_get_scope_strict



	/**
	* TEST_GET_TERM_NO_MAP_FALLBACK
	* No usable term -> legacy locator-string fallback with optional suffixes.
	* @return void
	*/
	public function test_get_term_no_map_fallback(): void {

		$locator = (object)[
			'section_tipo'		=> 'fake_sm_empty',
			'section_id'		=> 7,
			'component_tipo'	=> 'cc',
			'tag_id'			=> 3
		];

		$result = section_map::get_term($locator, 'thesaurus');

		$this->assertSame('fake_sm_empty_7_cc_3', $result);
	}//end test_get_term_no_map_fallback



	/**
	* TEST_GET_TERM_PARITY
	* Parity with ts_object::get_term_by_locator on the real 'ts1' fixture, and
	* scope-aware cache key.
	* @return void
	*/
	public function test_get_term_parity(): void {

		$_ENV['DEDALO_LAST_ERROR'] = null; // reset

		$locator = (object)[
			'section_tipo'	=> 'ts1',
			'section_id'	=> 1
		];

		$via_map		= section_map::get_term($locator, 'thesaurus', DEDALO_DATA_LANG, true);
		$via_ts_object	= ts_object::get_term_by_locator($locator, DEDALO_DATA_LANG, false);

		$this->assertSame(
			$via_ts_object,
			$via_map,
			'expected section_map::get_term to match ts_object::get_term_by_locator'
		);

		// scope-aware cache key present
		$cache_key = 'ts1_1_thesaurus_' . DEDALO_DATA_LANG;
		$this->assertArrayHasKey(
			$cache_key,
			ts_term_resolver::$term_by_locator_data_cache,
			'expected scope-aware term cache key'
		);

		$this->assertTrue(
			empty($_ENV['DEDALO_LAST_ERROR']),
			'expected running without errors. DEDALO_LAST_ERROR: ' . $_ENV['DEDALO_LAST_ERROR']
		);
	}//end test_get_term_parity



	/**
	* TEST_GET_TERM_DATA_PARITY
	* Parity with ts_object::get_term_data_by_locator on the real 'ts1' fixture.
	* @return void
	*/
	public function test_get_term_data_parity(): void {

		$_ENV['DEDALO_LAST_ERROR'] = null; // reset

		$locator = (object)[
			'section_tipo'	=> 'ts1',
			'section_id'	=> 1
		];

		$via_map		= section_map::get_term_data($locator, 'thesaurus');
		$via_ts_object	= ts_object::get_term_data_by_locator($locator);

		$this->assertSame(
			json_encode($via_ts_object),
			json_encode($via_map),
			'expected section_map::get_term_data to match ts_object::get_term_data_by_locator'
		);

		$this->assertTrue(
			empty($_ENV['DEDALO_LAST_ERROR']),
			'expected running without errors. DEDALO_LAST_ERROR: ' . $_ENV['DEDALO_LAST_ERROR']
		);
	}//end test_get_term_data_parity



	/**
	* TEST_API_GET_SECTION_TERMS
	* Batch term resolver endpoint: keyed result map, parity with section_map::get_term,
	* and dedup of repeated locators.
	* @return void
	*/
	public function test_api_get_section_terms(): void {

		$_ENV['DEDALO_LAST_ERROR'] = null; // reset

		// duplicate locator to exercise dedup
		$rqo = (object)[
			'action'	=> 'get_section_terms',
			'locators'	=> [
				(object)[ 'section_tipo' => 'ts1', 'section_id' => 1 ],
				(object)[ 'section_tipo' => 'ts1', 'section_id' => 1 ]
			]
		];

		$response = dd_core_api::get_section_terms($rqo);

		$this->assertTrue(
			is_object($response->result),
			'expected result object'
		);

		// key matches the graph node id format "{section_tipo}_{section_id}"
		$this->assertTrue(
			isset($response->result->{'ts1_1'}),
			'expected ts1_1 key in result'
		);

		// parity with the direct resolver (scope null = main -> thesaurus -> relation_list chain)
		$expected = section_map::get_term(
			(object)[ 'section_tipo' => 'ts1', 'section_id' => 1 ],
			null,
			DEDALO_DATA_LANG,
			true
		);
		$this->assertSame(
			$expected,
			$response->result->{'ts1_1'},
			'expected endpoint term to match section_map::get_term'
		);

		// dedup: a single key despite the repeated locator
		$this->assertSame(
			1,
			count((array)$response->result),
			'expected deduped single result entry'
		);

		$this->assertTrue(
			empty($_ENV['DEDALO_LAST_ERROR']),
			'expected running without errors. DEDALO_LAST_ERROR: ' . $_ENV['DEDALO_LAST_ERROR']
		);
	}//end test_api_get_section_terms



	/**
	* TEST_API_GET_SECTION_TERMS_EMPTY
	* Empty / invalid locators must fail safe (result false), no fatal.
	* @return void
	*/
	public function test_api_get_section_terms_empty(): void {

		$_ENV['DEDALO_LAST_ERROR'] = null; // reset

		$response = dd_core_api::get_section_terms( (object)[ 'action' => 'get_section_terms', 'locators' => [] ] );

		$this->assertFalse(
			$response->result,
			'expected result false for empty locators'
		);

		$this->assertTrue(
			empty($_ENV['DEDALO_LAST_ERROR']),
			'expected running without errors. DEDALO_LAST_ERROR: ' . $_ENV['DEDALO_LAST_ERROR']
		);
	}//end test_api_get_section_terms_empty



}//end class section_map_test
