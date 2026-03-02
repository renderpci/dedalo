<?php declare(strict_types=1);
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';

/**
 * ONTOLOGY_UTILS TEST
 */
final class ontology_utils_test extends BaseTestCase {

	public static $model = 'ontology_utils';

	public function test_get_ar_tipo_by_model(): void {
		$this->user_login();
		$model_name = 'section';
		$tipos = ontology_utils::get_ar_tipo_by_model($model_name);

		$this->assertIsArray($tipos);
		$this->assertNotEmpty($tipos);
		// activity2 matches 'section' model
		$this->assertContains('activity2', $tipos);
	}

	public function test_get_ar_all_models(): void {
		$this->user_login();
		$models = ontology_utils::get_ar_all_models();

		$this->assertIsArray($models);
		$this->assertNotEmpty($models);
		$this->assertContains('dd6', $models); // dd6 = section model
	}

	public function test_get_ar_all_tipo_of_model_tipo(): void {
		$this->user_login();
		$model_tipo = 'dd6'; // section model
		$tipos = ontology_utils::get_ar_all_tipo_of_model_tipo($model_tipo);

		$this->assertIsArray($tipos);
		// activity2 should be a section (model_tipo dd6)
		$this->assertContains('activity2', $tipos);
	}

	public function test_check_tipo_is_valid(): void {
		$this->user_login();
		// dd6 is a model definition. activity2 is a valid instance of section.
		$this->assertTrue(ontology_utils::check_tipo_is_valid('activity2'));

		// invalid scenarios
		$this->assertFalse(ontology_utils::check_tipo_is_valid('non_existent_tipo_123'));
		$this->assertFalse(ontology_utils::check_tipo_is_valid(null));
		$this->assertFalse(ontology_utils::check_tipo_is_valid('invalid-tipo!!!')); // not safe_tipo
	}

	public function test_get_active_tlds(): void {
		$this->user_login();

		// Ensure cache array returns true regardless of DDBB read
		ontology_utils::$active_tlds_cache = null;

		$tlds = ontology_utils::get_active_tlds();

		$this->assertIsArray($tlds);
		$this->assertContains('dd', $tlds);
		// activity is a TLD
		$this->assertContains('activity', $tlds);

		// second call assertions check the cache
		$tlds_cached = ontology_utils::get_active_tlds();
		$this->assertIsArray($tlds_cached);
		$this->assertContains('dd', $tlds_cached);
	}

	public function test_check_active_tld(): void {
		$this->user_login();
		$this->assertTrue(ontology_utils::check_active_tld('dd6'));
		$this->assertTrue(ontology_utils::check_active_tld('activity2'));
		$this->assertTrue(ontology_utils::check_active_tld('section_id')); // exception case

		$this->assertFalse(ontology_utils::check_active_tld('invalidtld999'));
	}

	public function test_delete_tld_nodes_unsafe_tld(): void {
		$this->user_login();
		// Test defensive mechanism
		$result = ontology_utils::delete_tld_nodes('unsafe_*_tld; DROP TABLE dd_ontology;');
		$this->assertFalse($result, 'Deletion of unsafe TLD should abort and return false.');
	}

	public function test_backup_and_restore_empty_inputs(): void {
		$this->user_login();
		// Test new edge cases
		$res1 = ontology_utils::create_bk_table([]);
		$this->assertFalse($res1, 'create_bk_table should return false for empty tlds array');

		$res2 = ontology_utils::restore_from_bk_table([]);
		$this->assertFalse($res2, 'restore_from_bk_table should return false for empty tlds array');
	}

	public function test_backup_and_restore(): void {
		$this->user_login();
		$test_tld = 'testtld';
		$conn     = DBi::_getConnection();
		$table    = ontology_node::$table;

		// 0. Ensure test record exists
		$sql_insert = "INSERT INTO \"{$table}\" (tipo, tld, term) VALUES ('testtld1', 'testtld', '{\"lg-spa\": \"test\"}') ON CONFLICT DO NOTHING;";
		pg_query($conn, $sql_insert);

		// 1. Create backup
		$res = ontology_utils::create_bk_table([$test_tld]);
		$this->assertTrue($res, 'Backup table creation failed');

		// 2. Modify original (delete)
		$res = ontology_utils::delete_tld_nodes($test_tld);
		$this->assertTrue($res, 'Deletion of TLD nodes failed');

		// Verify it's gone
		ontology_utils::$active_tlds_cache = null; // Clear cache to force reload
		dd_cache::delete_cache_files([ontology_utils::$active_tlds_cache_file_name]);

		$tlds = ontology_utils::get_active_tlds();
		$this->assertNotContains($test_tld, $tlds, 'TLD should be deleted from active list');

		// 3. Restore from backup
		$res = ontology_utils::restore_from_bk_table([$test_tld]);
		$this->assertTrue($res, 'Restore from backup failed');

		// Verify it's back
		ontology_utils::$active_tlds_cache = null; // Clear cache to force reload
		dd_cache::delete_cache_files([ontology_utils::$active_tlds_cache_file_name]);

		$tlds = ontology_utils::get_active_tlds();
		$this->assertContains($test_tld, $tlds, 'TLD should be restored to active list');

		// 4. Cleanup backup table
		$res = ontology_utils::delete_bk_table();
		$this->assertTrue($res, 'Backup table deletion failed');

		// Final cleanup of the test record
		ontology_utils::delete_tld_nodes($test_tld);
	}
}
