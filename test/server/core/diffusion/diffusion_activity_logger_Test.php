<?php declare(strict_types=1);
require_once dirname(dirname(dirname(__FILE__))) . '/bootstrap.php';

final class diffusion_activity_logger_Test extends BaseTestCase {
    
    public static $model = 'diffusion_activity_logger';

    /**
     * TEST_LOG
     * Tests the regression and deduplication logic of diffusion_activity_logger::log
     */
    public function test_log(): void {
        
        // 1. Mock user login
        $this->user_login();
        
        // 2. Clean table before test
        $conn = DBi::_getConnection();
        pg_query($conn, "TRUNCATE matrix_activity_diffusion RESTART IDENTITY");

        // 3. Test Logger Regression
        $sections_to_log = [
            ['tipo' => 'rsc170', 'id' => 101],
            ['tipo' => 'rsc170', 'id' => 101], // Duplicate
            ['tipo' => 'rsc197', 'id' => 202],
            ['tipo' => 'rsc170', 'id' => 101], // Duplicate again
        ];

        foreach ($sections_to_log as $s) {
            // Pass 'oh63' as diffusion element tipo
            $res = diffusion_activity_logger::log($s['tipo'], $s['id'], 'oh63');
        }

        // 4. Check Database Records
        $result = pg_query($conn, "SELECT * FROM matrix_activity_diffusion ORDER BY id ASC");
        $rows = [];
        while ($row = pg_fetch_object($result)) {
            $rows[] = $row;
        }

        // Assert Total logs created (Expected: 2)
        $this->assertCount(2, $rows, "Deduplication failed: Expected 2 logs, found " . count($rows));

        // 5. Verify Content
        foreach ($rows as $i => $log) {
            // Check Section Tipo
            $this->assertEquals('dd1758', $log->section_tipo, "Log Entry #$i: Expected section_tipo 'dd1758'");

            // Check User (dd1762)
            $model_user = ontology_node::get_model_by_tipo('dd1762');
            $col_user 	= section_record_data::get_column_name($model_user);
            $user_data 	= json_decode($log->$col_user);
            $this->assertTrue(isset($user_data->dd1762), "User (dd1762) not found in $col_user");

            // Check Date (dd1761)
            $model_date = ontology_node::get_model_by_tipo('dd1761');
            $col_date 	= section_record_data::get_column_name($model_date);
            $date_data 	= json_decode($log->$col_date);
            $this->assertTrue(isset($date_data->dd1761), "Date (dd1761) not found in $col_date");

            // Check Processed Section ID (dd1764)
            $model_id = ontology_node::get_model_by_tipo('dd1764');
            $col_id   = section_record_data::get_column_name($model_id);
            $id_data  = json_decode($log->$col_id);
            $this->assertTrue(isset($id_data->dd1764), "Section ID (dd1764) not found in $col_id");
            
            // Check Processed Section Tipo (dd1765)
            $model_tipo = ontology_node::get_model_by_tipo('dd1765');
            $col_tipo   = section_record_data::get_column_name($model_tipo);
            $tipo_data  = json_decode($log->$col_tipo);
            $this->assertTrue(isset($tipo_data->dd1765), "Section Tipo (dd1765) not found in $col_tipo");

            // Check Diffusion Element (dd1766)
            $model_diff = ontology_node::get_model_by_tipo('dd1766');
            $col_diff   = section_record_data::get_column_name($model_diff);
            $diff_data  = json_decode($log->$col_diff);
            
            $this->assertTrue(isset($diff_data->dd1766), "Diffusion Element (dd1766) not found in $col_diff");
            
            $loc = $diff_data->dd1766[0];
            $this->assertEquals(63, $loc->section_id, "Diffusion Element ID: Expected 63");
            $this->assertEquals('oh0', $loc->section_tipo, "Diffusion Element Tipo: Expected oh0");
        }
    }


    /**
     * TEST_LOG_ACTIONS
     * The dd1767 action component (→ value list dd1774) records the action
     * of every activity row: published / unpublished / unpublish_pending.
     * The debounce key includes the action: the same (record, element) can
     * legitimately produce one row per distinct action.
     */
    public function test_log_actions(): void {

        require_once dirname(__DIR__, 2) . '/diffusion/class.diffusion_test_helper.php';

        $this->user_login();
        diffusion_test_helper::require_activity_action_ontology($this);

        $baseline = diffusion_test_helper::activity_baseline();
        diffusion_activity_logger::reset_cache();

        try {
            $section_tipo = 'rsc170';
            $section_id   = 990001; // fabricated: never a real record
            $element_tipo = 'oh63';

            $actions = [
                diffusion_activity_logger::ACTION_PUBLISHED,
                diffusion_activity_logger::ACTION_UNPUBLISHED,
                diffusion_activity_logger::ACTION_UNPUBLISH_PENDING,
            ];

            // 1. one row per distinct action for the same (record, element)
            foreach ($actions as $action) {
                $logged = diffusion_activity_logger::log($section_tipo, $section_id, $element_tipo, $action);
                $this->assertTrue($logged, "Action $action was debounced but is a distinct action");
            }

            // 2. debounce: repeating the same (record, element, action) returns false
            $repeat = diffusion_activity_logger::log(
                $section_tipo, $section_id, $element_tipo,
                diffusion_activity_logger::ACTION_PUBLISHED
            );
            $this->assertFalse($repeat, 'Same (record, element, action) must be debounced');

            // 3. reset_cache re-allows logging
            diffusion_activity_logger::reset_cache();
            $after_reset = diffusion_activity_logger::log(
                $section_tipo, $section_id, $element_tipo,
                diffusion_activity_logger::ACTION_PUBLISHED
            );
            $this->assertTrue($after_reset, 'reset_cache must clear the debounce');

            // 4. rows carry the dd1767 locator to the dd1774 value list
            $conn   = DBi::_getConnection();
            $result = pg_query_params(
                $conn,
                'SELECT relation FROM matrix_activity_diffusion WHERE section_id > $1 ORDER BY section_id ASC',
                [$baseline]
            );
            $found_actions = [];
            while ($row = pg_fetch_object($result)) {
                $relation    = json_decode($row->relation);
                $action_tipo = diffusion_activity_logger::ACTION_TIPO;
                $this->assertTrue(isset($relation->{$action_tipo}), "Action ($action_tipo) locator missing in relation column");
                $locator = $relation->{$action_tipo}[0];
                $this->assertEquals(
                    diffusion_activity_logger::ACTION_SECTION_TIPO,
                    $locator->section_tipo,
                    'Action locator must point to the value-list section'
                );
                $found_actions[] = (int)$locator->section_id;
            }

            foreach ($actions as $action) {
                $this->assertContains($action, $found_actions, "No row recorded action $action");
            }

        } finally {
            diffusion_test_helper::cleanup_activity_rows($baseline);
            diffusion_activity_logger::reset_cache();
        }
    }//end test_log_actions
}
