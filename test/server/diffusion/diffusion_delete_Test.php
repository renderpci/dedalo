<?php declare(strict_types=1);
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';
require_once __DIR__ . '/class.diffusion_test_helper.php';

/**
* DIFFUSION_DELETE_TEST
* Tests the v7 delete propagation, including the full HYBRID CYCLE:
* engine unreachable → pending dd1758 row → engine restored → retry heals.
*
* Safety: only FABRICATED section_ids are used (never real records), so the
* Bun delete — when it runs at all — is a no-op (0 affected rows) on the
* target tables. Activity rows are removed by baseline cleanup.
*/
final class diffusion_delete_Test extends BaseTestCase {

	public static $model = 'diffusion_delete';

	// fabricated record id: never exists in any published table
	private const FABRICATED_ID = 99900177;

	private static int $baseline = 0;

	protected function setUp(): void {
		parent::setUp();
		$this->user_login();
		diffusion_activity_logger::reset_cache();
		self::$baseline = diffusion_test_helper::activity_baseline();
	}

	protected function tearDown(): void {
		diffusion_api_client::$endpoint_override = null;
		diffusion_test_helper::cleanup_activity_rows(self::$baseline);
		diffusion_activity_logger::reset_cache();
		parent::tearDown();
	}



	/**
	* TEST_NO_DIFFUSION_SECTION_IS_NOOP
	* Deleting a record of a section without diffusion resolves to an empty
	* successful response (nothing to propagate).
	*/
	public function test_no_diffusion_section_is_noop(): void {

		$response = diffusion_delete::delete_record('dd1758', self::FABRICATED_ID);

		$this->assertTrue($response->result);
		$this->assertEmpty($response->ar_deleted);
		$this->assertEmpty($response->ar_pending);
	}//end test_no_diffusion_section_is_noop



	/**
	* TEST_HYBRID_CYCLE
	* 1. Engine unreachable (endpoint_override → dead socket):
	*    delete_record leaves a durable unpublish_pending dd1758 row.
	* 2. Engine restored: retry_pending() re-runs the deletion and flips the
	*    row in place to unpublished.
	* Step 2 requires the real Bun engine socket; it is skipped (with the
	* pending row cleaned) when the engine is not running.
	*/
	public function test_hybrid_cycle(): void {

		$config = diffusion_test_helper::require_diffusion_ontology($this);
		diffusion_test_helper::require_activity_action_ontology($this);

		// -------- 1. outage: engine unreachable --------
		// restricted to the guarded SQL element: other elements of the section
		// may be unconfigured (e.g. rdf without service_name) and would leave
		// permanently-pending rows that the heal phase cannot flip
		diffusion_api_client::$endpoint_override = '/tmp/no_such_diffusion_engine.sock';

		$response = diffusion_delete::delete_record(
			$config->section_tipo,
			self::FABRICATED_ID,
			(object)['only_element_tipos' => [$config->element_tipo]]
		);

		$this->assertFalse($response->result, 'Unreachable engine must yield result=false (pending)');
		$this->assertNotEmpty($response->ar_pending, 'No pending element recorded during outage');
		$this->assertEmpty(
			array_filter($response->ar_deleted, fn($d) => in_array($d->type, ['sql','socrata'])),
			'No SQL element can be deleted while the engine is down'
		);

		// the durable retry intent exists
		$pending_count = diffusion_delete::count_pending();
		$this->assertGreaterThanOrEqual(1, $pending_count, 'count_pending sees no pending rows');

		// search/parse the pending rows (private methods via reflection)
		$ar_row_id = PHPUnitUtil::callMethod(new diffusion_delete(), 'search_pending_rows', [100]);
		$this->assertNotEmpty($ar_row_id, 'search_pending_rows found nothing');

		$row = matrix_activity_diffusion_db_manager::read('matrix_activity_diffusion', 'dd1758', (int)end($ar_row_id));
		$this->assertIsObject($row);

		$row_data = PHPUnitUtil::callMethod(new diffusion_delete(), 'parse_pending_row', [$row]);
		$this->assertIsObject($row_data);
		$this->assertEquals(self::FABRICATED_ID, (int)$row_data->target_section_id, 'Pending row target id mismatch');
		$this->assertSame($config->section_tipo, $row_data->target_section_tipo, 'Pending row target tipo mismatch');

		// -------- 2. heal: engine restored --------
		diffusion_api_client::$endpoint_override = null;

		$socket_path = defined('DEDALO_DIFFUSION_SOCKET_PATH') ? DEDALO_DIFFUSION_SOCKET_PATH : null;
		if (empty($socket_path) || !file_exists($socket_path)) {
			$this->markTestIncomplete(
				'Outage/pending path verified. Heal path skipped: the Bun engine socket is not running on this machine.'
			);
		}

		// the heal needs server-to-server auth: a CLI test has no HTTP session,
		// so the internal token pair must be configured on both sides
		$auth_probe = diffusion_api_client::call((object)[
			'action'		=> 'check_database',
			'database_name'	=> 'web_default'
		]);
		if (empty($auth_probe->result) && empty($auth_probe->exists)) {
			$this->markTestIncomplete(
				'Outage/pending path verified. Heal path skipped: the engine rejects server-to-server auth from CLI. '
				. 'Configure the internal token pair (DEDALO_DIFFUSION_INTERNAL_TOKEN in config/config.php = '
				. 'DIFFUSION_INTERNAL_TOKEN in diffusion/api/v1/.env) to enable the full hybrid cycle test.'
			);
		}

		diffusion_activity_logger::reset_cache();
		$retry_response = diffusion_delete::retry_pending();

		$this->assertGreaterThanOrEqual(1, $retry_response->retried, 'Retry healed nothing with the engine up');

		// the row was flipped in place: no unpublish_pending rows remain above baseline
		$conn = DBi::_getConnection();
		$result = pg_query_params(
			$conn,
			'SELECT relation FROM matrix_activity_diffusion WHERE section_id > $1',
			[self::$baseline]
		);
		while ($r = pg_fetch_object($result)) {
			$relation = json_decode($r->relation);
			$action_tipo = diffusion_activity_logger::ACTION_TIPO;
			foreach ($relation->{$action_tipo} ?? [] as $locator) {
				$this->assertNotEquals(
					diffusion_activity_logger::ACTION_UNPUBLISH_PENDING,
					(int)$locator->section_id,
					'A pending row survived the retry (not flipped to unpublished)'
				);
			}
		}
	}//end test_hybrid_cycle



	/**
	* TEST_DELETE_RDF_IDEMPOTENT
	* RDF delete is idempotent: deleting a never-published record succeeds
	* with no files removed. With a staged file, the file is unlinked.
	*/
	public function test_delete_rdf_idempotent(): void {

		$config = diffusion_test_helper::require_rdf_ontology($this);

		// no file → idempotent success
		$response = diffusion_rdf::delete_record_file($config->element_tipo, $config->section_tipo, self::FABRICATED_ID);
		$this->assertTrue($response->result, 'Missing file must be idempotent success');
		$this->assertEmpty($response->deleted_files);

		// staged file → unlinked
		$file_info = diffusion_rdf::get_record_file_path($config->element_tipo, $config->section_tipo, self::FABRICATED_ID);
		if ($file_info===null) {
			$this->markTestSkipped('RDF element does not resolve a file path for the guarded section');
		}

		if (!is_dir(dirname($file_info->file_path))) {
			mkdir(dirname($file_info->file_path), 0777, true);
		}
		file_put_contents($file_info->file_path, '<?xml version="1.0"?><rdf:RDF xmlns:rdf="x"></rdf:RDF>');
		$this->assertFileExists($file_info->file_path);

		$response = diffusion_rdf::delete_record_file($config->element_tipo, $config->section_tipo, self::FABRICATED_ID);
		$this->assertTrue($response->result);
		$this->assertContains($file_info->file_path, $response->deleted_files);
		$this->assertFileDoesNotExist($file_info->file_path);
	}//end test_delete_rdf_idempotent



}//end class diffusion_delete_Test
