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
}
