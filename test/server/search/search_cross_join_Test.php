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
}
