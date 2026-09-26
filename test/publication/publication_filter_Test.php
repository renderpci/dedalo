<?php declare(strict_types=1);
// PHPUnit classes
use PHPUnit\Framework\TestCase;
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



/**
* PUBLICATION_FILTER_TEST
* Locks the publication API sql_filter handling (web_data::build_sql_where) and the
* free_search words highlight (free_node).
* Tags masking of LIKE sentences (web_data::mask_tags_sql_filter) is opt-in: without the
* TAGGED_TEXT_FIELDS constant the sql_filter must be used exactly as before.
* No database is used: only the SQL string builders are tested.
*/
final class publication_filter_test extends TestCase {



	/**
	* LOAD_WEB_DATA
	* Publication classes are not autoloaded by Dédalo
	* @return void
	*/
	private static function load_web_data() : void {

		if (!defined('PUBLICATION_FILTER_SQL')) {
			define('PUBLICATION_FILTER_SQL', ' ');
		}
		require_once DEDALO_ROOT_PATH . '/publication/server_api/v1/common/class.web_data.php';
	}//end load_web_data



	/**
	* BUILD_SQL_WHERE
	* Calls private web_data::build_sql_where
	* @return string
	*/
	private static function build_sql_where($lang, $sql_filter, $ignore_tags=true) : string {

		self::load_web_data();
		$method = new ReflectionMethod('web_data', 'build_sql_where');

		return $method->invoke(null, $lang, $sql_filter, $ignore_tags);
	}//end build_sql_where



	/**
	* TEST_BUILD_SQL_WHERE_DEFAULT_NO_MASKING
	* Without TAGGED_TEXT_FIELDS the filter is used as is (MySQL safe, previous behavior)
	* @return void
	*/
	public function test_build_sql_where_default_no_masking() : void {

		if (defined('TAGGED_TEXT_FIELDS')) {
			$this->markTestSkipped('TAGGED_TEXT_FIELDS already defined in this process');
		}

		$this->assertSame(
			"WHERE (rsc36 LIKE '%a%' OR rsc36 LIKE '%b%') AND `lang`='lg-spa'",
			self::build_sql_where('lg-spa', "rsc36 LIKE '%a%' OR rsc36 LIKE '%b%'")
		);
		// already wrapped filter is kept as is (previous behavior)
		$this->assertSame(
			"WHERE (rsc36 LIKE '%a%') AND `lang`='lg-spa'",
			self::build_sql_where('spa', "(rsc36 LIKE '%a%')")
		);
	}//end test_build_sql_where_default_no_masking



	/**
	* TEST_BUILD_SQL_WHERE_INVALID_VALUES
	* Request values are not typed: empty arrays, null or numbers must not throw
	* @return void
	*/
	public function test_build_sql_where_invalid_values() : void {

		$this->assertSame('', self::build_sql_where([], [], []));
		$this->assertSame('', self::build_sql_where(null, null, null));
		$this->assertSame('WHERE (section_id=5)', self::build_sql_where(null, 'section_id=5', 'false'));
	}//end test_build_sql_where_invalid_values



	/**
	* TEST_FREE_NODE_Q_TO_WORDS
	* @return void
	*/
	public function test_free_node_q_to_words() : void {

		self::load_web_data();

		$this->assertSame(["l'home"], free_node::q_to_words("'l'home'"));
		$this->assertSame(['la casa'], free_node::q_to_words('"la casa"'));
		$this->assertSame(['la casa', 'poble'], free_node::q_to_words('"la casa" +poble -guerra'));
		$this->assertSame(["l'home", 'casa'], free_node::q_to_words("l'home casa"));
		$this->assertSame([], free_node::q_to_words('  '));
	}//end test_free_node_q_to_words



	/**
	* TEST_FREE_NODE_WORD_TO_PATTERN
	* Operators and FULLTEXT separator punctuation are removed, regex chars are literal
	* @return void
	*/
	public function test_free_node_word_to_pattern() : void {

		self::load_web_data();

		$casa = free_node::word_to_pattern('casa');
		foreach (['+casa', 'casa?', 'casa.', '¿casa?', '(casa)', '~casa', 'casa,'] as $word) {
			$this->assertSame($casa, free_node::word_to_pattern($word), $word);
		}
		$this->assertSame(1, preg_match(free_node::word_to_pattern('casa*'), 'casas'));
		$this->assertSame(1, preg_match(free_node::word_to_pattern('3.5'), '3.5'));
		$this->assertSame(0, preg_match(free_node::word_to_pattern('3.5'), '3x5'));
		$this->assertFalse(free_node::word_to_pattern('+'));
	}//end test_free_node_word_to_pattern



	/**
	* TEST_BUILD_SQL_WHERE_MASKING_OPT_IN
	* With TAGGED_TEXT_FIELDS, LIKE sentences on the tagged columns are masked keeping
	* the outer parentheses (lang condition must apply to the whole filter).
	* (!) Last test of the class: the constant can not be undefined once defined
	* @return void
	*/
	public function test_build_sql_where_masking_opt_in() : void {

		define('TAGGED_TEXT_FIELDS', ['rsc36']);

		// lang precedence: whole filter wrapped
		$sql = self::build_sql_where('lg-spa', "rsc36 LIKE '%a%' OR rsc36 LIKE '%b%'");
		$this->assertStringStartsWith('WHERE ((rsc36 LIKE ', $sql);
		$this->assertStringEndsWith(")) AND `lang`='lg-spa'", $sql);
		$this->assertSame(2, substr_count($sql, 'REGEXP_REPLACE(rsc36'));

		// not tagged columns and LIKE inside literals are untouched
		$this->assertSame(
			"WHERE (name LIKE '%a%' OR title = 'rsc36 LIKE x')",
			self::build_sql_where(null, "name LIKE '%a%' OR title = 'rsc36 LIKE x'")
		);

		// not rewritten: COLLATE, ESCAPE + COLLATE, adjacent literal
		foreach ([
			"rsc36 LIKE '%A%' COLLATE utf8mb4_bin",
			"rsc36 LIKE '%a|%' ESCAPE '|' COLLATE utf8mb4_bin",
			"rsc36 LIKE '%a' 'b%'"
		] as $filter) {
			$this->assertSame('WHERE ('.$filter.')', self::build_sql_where(null, $filter), $filter);
		}

		// ESCAPE clause kept attached, NOT LIKE without raw pre-filter
		$sql = self::build_sql_where(null, "rsc36 LIKE '%a|%' ESCAPE '|'");
		$this->assertStringContainsString("' ') LIKE '%a|%' ESCAPE '|')", $sql);
		$sql = self::build_sql_where(null, "rsc36 NOT LIKE '%index%'");
		$this->assertStringContainsString("' ') NOT LIKE '%index%')", $sql);
		$this->assertStringNotContainsString('rsc36 NOT LIKE', $sql);

		// per request opt-out
		foreach ([false, 'false', '0', 0] as $ignore_tags) {
			$this->assertSame(
				"WHERE (rsc36 LIKE '%a%')",
				self::build_sql_where(null, "rsc36 LIKE '%a%'", $ignore_tags),
				to_string($ignore_tags)
			);
		}
	}//end test_build_sql_where_masking_opt_in



}//end class publication_filter_test
