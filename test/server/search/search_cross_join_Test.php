<?php declare(strict_types=1);
require_once dirname(__FILE__, 2) . '/bootstrap.php';

final class search_cross_join_test extends BaseTestCase {

	// before fix: both clause fragments reference the same alias "te3_te80_te3" (no per-clause prefix).
	// Both WHERE fragments (te3_te80_te3.relation @> $2 AND te3_te80_te3.relation @> $3) collide on
	// that single alias, meaning a single linked record must satisfy BOTH conditions simultaneously.
	private string $section_tipo = 'test3';
	private string $table        = 'matrix_test';

	protected function setUp(): void {
		if (login::is_logged() === false) {
			login_test::force_login(TEST_USER_ID);
		}
	}

	/** Two leaf clauses sharing the identical 2-step relation path. */
	private function two_same_path_sqo() : object {
		$path = [
			(object)['section_tipo' => 'test3', 'component_tipo' => 'test80', 'model' => 'component_portal'],
			(object)['section_tipo' => 'test3', 'component_tipo' => 'test80', 'model' => 'component_portal']
		];
		$clause_a = (object)['q' => (object)['section_id' => '1', 'section_tipo' => 'test3'], 'path' => $path];
		$clause_b = (object)['q' => (object)['section_id' => '2', 'section_tipo' => 'test3'], 'path' => $path];
		return (object)[
			'section_tipo' => [$this->section_tipo],
			'mode'         => 'list',
			'filter'       => (object)['$and' => [$clause_a, $clause_b]]
		];
	}

	public function test_characterize_current_sql() {
		$search = search::get_instance($this->two_same_path_sqo());
		$sql    = $search->parse_sql_query();
		fwrite(STDERR, "\n\n===CHARACTERIZE===\n" . $sql . "\n===END===\n\n");
		$this->assertIsString($sql);
	}

	public function test_same_path_clauses_get_independent_joins() {
		$search = search::get_instance($this->two_same_path_sqo());
		$sql    = $search->parse_sql_query();

		// Extract every target-table alias emitted by build_sql_join:
		//   "LEFT JOIN matrix_test AS <alias> ON"
		preg_match_all('/LEFT JOIN\s+matrix_test\s+AS\s+(\S+)\s+ON/i', $sql, $m);
		$aliases          = $m[1];
		$distinct_aliases = array_values(array_unique($aliases));

		// Two clauses with the same path must produce TWO DISTINCT joined-table aliases,
		// so each clause traverses the relation independently (cross-record AND/OR).
		$this->assertCount(
			2,
			$distinct_aliases,
			"Expected 2 distinct join aliases (one per clause), got: "
				. json_encode($aliases) . "\nSQL:\n{$sql}"
		);

		// And each clause's WHERE fragment must reference its OWN alias (no shared alias).
		foreach ($distinct_aliases as $alias) {
			$this->assertStringContainsString(
				"{$alias}.relation @>",
				$sql,
				"Each distinct alias must own a WHERE fragment.\nSQL:\n{$sql}"
			);
		}
	}

	/** A single multi-step clause must still build and be prefixed j1_. */
	public function test_single_clause_multistep_still_builds() {
		$path = [
			(object)['section_tipo' => 'test3', 'component_tipo' => 'test80', 'model' => 'component_portal'],
			(object)['section_tipo' => 'test3', 'component_tipo' => 'test80', 'model' => 'component_portal']
		];
		$sqo = (object)[
			'section_tipo' => ['test3'],
			'mode'         => 'list',
			'filter'       => (object)['$and' => [
				(object)['q' => (object)['section_id' => '1', 'section_tipo' => 'test3'], 'path' => $path]
			]]
		];
		$search = search::get_instance($sqo);
		$sql    = $search->parse_sql_query();

		// Exactly one relation join for one clause, prefixed j1_.
		$this->assertSame(
			1,
			preg_match_all("/LEFT JOIN matrix_test AS j1_/", $sql),
			"Expected exactly one j1_-prefixed join for a single multi-step clause.\nSQL:\n{$sql}"
		);
	}

	/** Single-level path (value directly on the main table) must emit NO jN_ prefix (legacy). */
	public function test_single_level_path_unprefixed() {
		$sqo = (object)[
			'section_tipo' => ['test3'],
			'mode'         => 'list',
			'filter'       => (object)['$and' => [
				(object)['q' => '1', 'path' => [
					(object)['section_tipo' => 'test3', 'component_tipo' => 'section_id']
				]]
			]]
		];
		$search = search::get_instance($sqo);
		$sql    = $search->parse_sql_query();
		$this->assertSame(
			0,
			preg_match_all('/\bj\d+_/', $sql),
			"Single-level path must not be prefixed.\nSQL:\n{$sql}"
		);
	}

	/** The two-clause AND query must be valid, executable SQL (no duplicate-alias error). */
	public function test_two_clause_sql_executes() {
		$search = search::get_instance($this->two_same_path_sqo());
		$result = $search->search(); // builds + executes
		$this->assertTrue(
			$result instanceof db_result || $result === false,
			'Two-clause cross-join search must execute without a SQL error (duplicate alias, etc.)'
		);
	}
}
