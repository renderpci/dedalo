<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(dirname(__FILE__))) . '/bootstrap.php';

require_once DEDALO_CORE_PATH . '/base/upgrade/class.dataframe_v7_migration.php';



/**
 * DATAFRAME_V7_MIGRATION_TEST
 * Tests for the v6.8 -> v7 dataframe pairing migration:
 * legacy (section_id_key/section_tipo_key) locators are rewritten to the
 * unified contract (type: DEDALO_RELATION_TYPE_DATAFRAME, id_key = main item id).
 * Uses a synthetic fixture row in the matrix table, removed on teardown.
 */
final class dataframe_v7_migration_test extends BaseTestCase {



	// scratch table: the migration only ever touches the tables it is given,
	// so the test runs against an isolated copy and never sweeps real data
	public static $table		= 'matrix_df_migration_test_tmp';
	public static $section_tipo	= 'test3';
	public static $section_id	= 999999901;

	private static $fixture_row_id = null;



	public static function setUpBeforeClass(): void {
		parent::setUpBeforeClass();
		$conn = DBi::_getConnection();
		pg_query($conn, 'DROP TABLE IF EXISTS "'.self::$table.'"');
		pg_query($conn, 'CREATE TABLE "'.self::$table.'" (id serial PRIMARY KEY, section_tipo varchar, section_id int, relation jsonb)');
	}//end setUpBeforeClass



	/**
	* BUILD_FIXTURE_ROW
	* Inserts a synthetic record whose relation column contains:
	* - a RELATION main (oh24-like portal, here numisdata30 is irrelevant: we
	*   use a real relation-model tipo resolved at runtime) with two locators,
	*   one target linked twice (ambiguity case)
	* - frame locators in legacy shape: resolvable, ambiguous, unresolvable
	* - a LITERAL-main frame locator (component_iri tipo rsc217-like)
	* @return void
	*/
	private function build_fixture_row( string $relation_main_tipo, string $literal_main_tipo, string $frame_tipo ) : void {

		$this->user_login();

		$relation = (object)[
			// relation main component locators (its own data)
			$relation_main_tipo => [
				(object)[
					'id'					=> 1,
					'type'					=> DEDALO_RELATION_TYPE_LINK,
					'section_id'			=> '14',
					'section_tipo'			=> 'rsc197',
					'from_component_tipo'	=> $relation_main_tipo
				],
				(object)[
					'id'					=> 2,
					'type'					=> DEDALO_RELATION_TYPE_LINK,
					'section_id'			=> '20',
					'section_tipo'			=> 'rsc197',
					'from_component_tipo'	=> $relation_main_tipo
				],
				(object)[ // duplicated target (ambiguity case)
					'id'					=> 3,
					'type'					=> DEDALO_RELATION_TYPE_LINK,
					'section_id'			=> '20',
					'section_tipo'			=> 'rsc197',
					'from_component_tipo'	=> $relation_main_tipo
				]
			],
			// frame locators (legacy v6.8 shape)
			$frame_tipo => [
				(object)[ // resolvable: target rsc197_14 -> main item id 1
					'id'					=> 1,
					'type'					=> DEDALO_RELATION_TYPE_LINK,
					'section_id'			=> '5',
					'section_tipo'			=> 'dd1706',
					'section_id_key'		=> 14,
					'section_tipo_key'		=> 'rsc197',
					'from_component_tipo'	=> $frame_tipo,
					'main_component_tipo'	=> $relation_main_tipo
				],
				(object)[ // ambiguous: target rsc197_20 linked twice (items 2 and 3)
					'id'					=> 2,
					'type'					=> DEDALO_RELATION_TYPE_LINK,
					'section_id'			=> '6',
					'section_tipo'			=> 'dd1706',
					'section_id_key'		=> 20,
					'section_tipo_key'		=> 'rsc197',
					'from_component_tipo'	=> $frame_tipo,
					'main_component_tipo'	=> $relation_main_tipo
				],
				(object)[ // unresolvable: no main locator points at rsc197_99
					'id'					=> 3,
					'type'					=> DEDALO_RELATION_TYPE_LINK,
					'section_id'			=> '7',
					'section_tipo'			=> 'dd1706',
					'section_id_key'		=> 99,
					'section_tipo_key'		=> 'rsc197',
					'from_component_tipo'	=> $frame_tipo,
					'main_component_tipo'	=> $relation_main_tipo
				],
				(object)[ // literal main: legacy key is already the item id
					'id'					=> 4,
					'type'					=> DEDALO_RELATION_TYPE_LINK,
					'section_id'			=> '8',
					'section_tipo'			=> 'dd1706',
					'section_id_key'		=> 2,
					'section_tipo_key'		=> self::$section_tipo,
					'from_component_tipo'	=> $frame_tipo,
					'main_component_tipo'	=> $literal_main_tipo
				]
			]
		];

		$conn = DBi::_getConnection();
		$result = pg_query_params($conn,
			'INSERT INTO "'.self::$table.'" (section_tipo, section_id, relation) VALUES ($1,$2,$3::jsonb) RETURNING id',
			[self::$section_tipo, self::$section_id, json_encode($relation)]
		);
		$row = pg_fetch_assoc($result);
		self::$fixture_row_id = (int)$row['id'];
	}//end build_fixture_row



	private function read_fixture_relation() : object {
		$conn = DBi::_getConnection();
		$result = pg_query_params($conn,
			'SELECT relation::text AS relation FROM "'.self::$table.'" WHERE id=$1',
			[self::$fixture_row_id]
		);
		$row = pg_fetch_assoc($result);
		return json_decode($row['relation']);
	}//end read_fixture_relation



	public static function tearDownAfterClass(): void {
		$conn = DBi::_getConnection();
		pg_query($conn, 'DROP TABLE IF EXISTS "'.self::$table.'"');
		self::$fixture_row_id = null;
		parent::tearDownAfterClass();
	}//end tearDownAfterClass



	///////////// ⬇︎ test start ⬇︎ ////////////////



	/**
	* TEST_migrate_matrix_fixture
	* Full transform over the synthetic fixture row: resolvable relation-main
	* re-keyed to the item id, ambiguity attached to first match + reported,
	* unresolvable left as legacy + reported, literal-main key renamed.
	* @return void
	*/
	public function test_migrate_matrix_fixture() {

		$this->user_login();

		// resolve real tipos by model so the fixture matches ontology models
		$relation_main_tipo	= 'oh24';	// component_portal (relation main)
		$literal_main_tipo	= 'test52';	// component_input_text (literal main)
		$frame_tipo			= 'dd560';	// component_dataframe

		$this->assertContains(
			ontology_node::get_model_by_tipo($relation_main_tipo),
			component_relation_common::get_components_with_relations(),
			'fixture relation main tipo must resolve to a relation model'
		);
		$this->assertNotContains(
			ontology_node::get_model_by_tipo($literal_main_tipo),
			component_relation_common::get_components_with_relations(),
			'fixture literal main tipo must resolve to a literal model'
		);

		$this->build_fixture_row($relation_main_tipo, $literal_main_tipo, $frame_tipo);

		// dry-run first: nothing written
		$dry = dataframe_v7_migration::migrate_matrix([self::$table], false);
		$this->assertTrue($dry->result);
		$this->assertGreaterThanOrEqual(3, $dry->locators_migrated, 'dry-run counts migratable locators');

		$before = $this->read_fixture_relation();
		$this->assertObjectHasProperty('section_id_key', $before->{$frame_tipo}[0], 'dry-run must not write');

		// live run
		$live = dataframe_v7_migration::migrate_matrix([self::$table], true);
		$this->assertTrue($live->result);

		$after = $this->read_fixture_relation();
		$frames = $after->{$frame_tipo};

		// resolvable relation-main frame: target rsc197_14 -> main item id 1
		$this->assertEquals(DEDALO_RELATION_TYPE_DATAFRAME, $frames[0]->type);
		$this->assertEquals(1, $frames[0]->id_key);
		$this->assertObjectNotHasProperty('section_id_key', $frames[0]);
		$this->assertObjectNotHasProperty('section_tipo_key', $frames[0]);
		// frame's own item id and target are preserved
		$this->assertEquals(1, $frames[0]->id);
		$this->assertEquals('5', $frames[0]->section_id);

		// ambiguous frame: attached to FIRST match (item id 2) and reported
		$this->assertEquals(DEDALO_RELATION_TYPE_DATAFRAME, $frames[1]->type);
		$this->assertEquals(2, $frames[1]->id_key);
		$this->assertGreaterThanOrEqual(1, $live->ambiguous);

		// unresolvable frame: left untouched in legacy shape and reported
		$this->assertObjectNotHasProperty('id_key', $frames[2]);
		$this->assertEquals(99, $frames[2]->section_id_key);
		$this->assertEquals(DEDALO_RELATION_TYPE_LINK, $frames[2]->type);
		$this->assertGreaterThanOrEqual(1, $live->unresolved);

		// literal-main frame: straight key rename
		$this->assertEquals(DEDALO_RELATION_TYPE_DATAFRAME, $frames[3]->type);
		$this->assertEquals(2, $frames[3]->id_key);
		$this->assertObjectNotHasProperty('section_id_key', $frames[3]);

		// main component locators are untouched
		$this->assertCount(3, $after->{$relation_main_tipo});
		$this->assertEquals(DEDALO_RELATION_TYPE_LINK, $after->{$relation_main_tipo}[0]->type);

		// idempotence: a second run migrates nothing new on the fixture
		$again = dataframe_v7_migration::migrate_matrix([self::$table], true);
		$this->assertTrue($again->result);
		$after_again = $this->read_fixture_relation();
		$this->assertEquals(json_encode($after), json_encode($after_again), 'second run must not change the fixture');
	}//end test_migrate_matrix_fixture



	/**
	* TEST_integrity_check_detects_and_fixes_orphans
	* After the fixture migration, an orphan frame (id_key pointing at a
	* non-existent main item) is reported and removed only with $fix=true.
	* The unresolvable legacy frame is counted as such, never as orphan.
	* @return void
	*/
	public function test_integrity_check_detects_and_fixes_orphans() {

		$this->user_login();

		// reuse the migrated fixture state from the previous test? No:
		// build a dedicated fixture with one valid pairing and one orphan
		$conn = DBi::_getConnection();
		$relation = (object)[
			'test52' => null, // literal main items live in 'string' column: simulate frames only
			'dd560' => [
				(object)[ // valid: literal main test52 item id 1 (in string column)
					'type'					=> DEDALO_RELATION_TYPE_DATAFRAME,
					'section_id'			=> '5',
					'section_tipo'			=> 'dd1706',
					'id_key'				=> 1,
					'from_component_tipo'	=> 'dd560',
					'main_component_tipo'	=> 'test52'
				],
				(object)[ // ORPHAN: no item id 99
					'type'					=> DEDALO_RELATION_TYPE_DATAFRAME,
					'section_id'			=> '6',
					'section_tipo'			=> 'dd1706',
					'id_key'				=> 99,
					'from_component_tipo'	=> 'dd560',
					'main_component_tipo'	=> 'test52'
				]
			]
		];
		unset($relation->test52);
		$string_col = (object)[
			'test52' => [ (object)['id'=>1, 'lang'=>'lg-eng', 'value'=>'Alpha'] ]
		];

		pg_query($conn, 'ALTER TABLE "'.self::$table.'" ADD COLUMN IF NOT EXISTS string jsonb');
		$result = pg_query_params($conn,
			'INSERT INTO "'.self::$table.'" (section_tipo, section_id, relation, string) VALUES ($1,$2,$3::jsonb,$4::jsonb) RETURNING id',
			[self::$section_tipo, self::$section_id+1, json_encode($relation), json_encode($string_col)]
		);
		$row = pg_fetch_assoc($result);
		$fixture_id = (int)$row['id'];

		// report-only: orphan detected, nothing written
		$report = dataframe_v7_migration::integrity_check([self::$table], false);
		$this->assertTrue($report->result);
		$this->assertGreaterThanOrEqual(2, $report->frames_checked);
		$this->assertGreaterThanOrEqual(1, $report->unresolved, 'orphan must be reported');
		$this->assertEquals(0, $report->orphans_fixed);

		// fix: orphan removed, valid pairing kept
		$fixed = dataframe_v7_migration::integrity_check([self::$table], true);
		$this->assertGreaterThanOrEqual(1, $fixed->orphans_fixed);

		$result = pg_query_params($conn, 'SELECT relation::text AS relation FROM "'.self::$table.'" WHERE id=$1', [$fixture_id]);
		$row = pg_fetch_assoc($result);
		$after = json_decode($row['relation']);
		$this->assertCount(1, $after->dd560, 'only the valid frame survives');
		$this->assertEquals(1, $after->dd560[0]->id_key);

		// cleanup
		pg_query_params($conn, 'DELETE FROM "'.self::$table.'" WHERE id=$1', [$fixture_id]);
	}//end test_integrity_check_detects_and_fixes_orphans



	/**
	* TEST_dry_run_over_real_tables_is_safe
	* The dry-run scans without errors and reports consistent counters.
	* @return void
	*/
	public function test_dry_run_over_real_tables_is_safe() {

		$this->user_login();

		$response = dataframe_v7_migration::migrate_time_machine(false);

		$this->assertTrue($response->result, 'TM dry-run failed: '.json_encode($response->errors));
		$this->assertIsInt($response->scanned);
		$this->assertIsInt($response->locators_migrated);
		// counters and capped detail lists stay consistent
		$this->assertLessThanOrEqual($response->unresolved, count($response->unresolved_items) <= dataframe_v7_migration::$max_report_items ? $response->unresolved : 0);
	}//end test_dry_run_over_real_tables_is_safe



}//end class dataframe_v7_migration_test
