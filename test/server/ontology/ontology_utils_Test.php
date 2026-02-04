<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';

final class ontology_utils_test extends BaseTestCase {

    /**
     * TEST_GET_AR_TIPO_BY_MODEL
     */
    public function test_get_ar_tipo_by_model(): void {
        $model_name = 'section';
        $tipos = ontology_utils::get_ar_tipo_by_model($model_name);

        $this->assertIsArray($tipos);
        $this->assertNotEmpty($tipos);
        // activity2 matches 'section' model
        $this->assertContains('activity2', $tipos);
    }

    /**
     * TEST_GET_AR_ALL_MODELS
     */
    public function test_get_ar_all_models(): void {
        $models = ontology_utils::get_ar_all_models();

        $this->assertIsArray($models);
        $this->assertNotEmpty($models);
        $this->assertContains('dd6', $models);
    }

    /**
     * TEST_GET_AR_ALL_TIPO_OF_MODEL_TIPO
     */
    public function test_get_ar_all_tipo_of_model_tipo(): void {
        $model_tipo = 'dd6'; // section model
        $tipos = ontology_utils::get_ar_all_tipo_of_model_tipo($model_tipo);

        $this->assertIsArray($tipos);
        // activity2 should be a section (model_tipo dd6)
        $this->assertContains('activity2', $tipos);
    }

    /**
     * TEST_CHECK_TIPO_IS_VALID
     */
    public function test_check_tipo_is_valid(): void {
        // dd6 is a model definition, check_tipo_is_valid might return false if get_model() is null
        // But activity2 is a valid instance/model of section.
        $this->assertTrue(ontology_utils::check_tipo_is_valid('activity2'));
        $this->assertFalse(ontology_utils::check_tipo_is_valid('non_existent_tipo_123'));
    }

    /**
     * TEST_GET_ACTIVE_TLDS
     */
    public function test_get_active_tlds(): void {
        $tlds = ontology_utils::get_active_tlds();

        $this->assertIsArray($tlds);
        $this->assertContains('dd', $tlds);
        // activity is a TLD
        $this->assertContains('activity', $tlds);
    }

    /**
     * TEST_BACKUP_AND_RESTORE
     */
    public function test_backup_and_restore(): void {
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
        $tlds = ontology_utils::get_active_tlds();
        $this->assertNotContains($test_tld, $tlds, 'TLD should be deleted from active list');

        // 3. Restore from backup
        $res = ontology_utils::restore_from_bk_table([$test_tld]);
        $this->assertTrue($res, 'Restore from backup failed');

        // Verify it's back
        ontology_utils::$active_tlds_cache = null; // Clear cache to force reload
        $tlds = ontology_utils::get_active_tlds();
        $this->assertContains($test_tld, $tlds, 'TLD should be restored to active list');

        // 4. Cleanup backup table
        $res = ontology_utils::delete_bk_table();
        $this->assertTrue($res, 'Backup table deletion failed');

        // Final cleanup of the test record
        ontology_utils::delete_tld_nodes($test_tld);
    }

    /**
     * TEST_CHECK_ACTIVE_TLD
     */
    public function test_check_active_tld(): void {
        $this->assertTrue(ontology_utils::check_active_tld('dd6'));
        $this->assertTrue(ontology_utils::check_active_tld('activity2'));
        $this->assertTrue(ontology_utils::check_active_tld('section_id'));
    }
}
