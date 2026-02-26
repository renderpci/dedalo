<?php declare(strict_types=1);
// PHPUnit classes
use PHPUnit\Framework\TestCase;
// bootstrap
require_once dirname(__FILE__, 2) . '/bootstrap.php';
require_once dirname(__FILE__, 2) . '/class.BaseTestCase.php';

/**
 * Class matrix_activity_diffusion_db_manager_Test
 *
 * Unit tests for matrix_activity_diffusion_db_manager
 */
final class matrix_activity_diffusion_db_manager_Test extends BaseTestCase {

    public $table = 'matrix_activity_diffusion_test';
    public $section_tipo = 'dd542'; // Sample section_tipo

    /**
     * SET_UP_BEFORE_CLASS
     * Create test table before running any tests
     * @return void
     */
    public static function setUpBeforeClass(): void
    {
        // Force to change the table to use to prevent touching the working table
        matrix_activity_diffusion_db_manager::$tables = [
            'matrix_activity_diffusion_test' => true
        ];

        $conn = DBi::_getConnection();

        $sql = "
            DROP TABLE IF EXISTS matrix_activity_diffusion_test CASCADE;
            DROP SEQUENCE IF EXISTS matrix_activity_diffusion_test_id_seq;
            DROP SEQUENCE IF EXISTS matrix_activity_diffusion_test_section_id_seq;
            SELECT duplicate_table_with_independent_sequences('matrix_activity_diffusion', 'matrix_activity_diffusion_test', true);
        ";
        $result = pg_query($conn, $sql);
        if (!$result) {
            $error = pg_last_error($conn);
            echo "!!! Error creating test table: " . $error . PHP_EOL;
            throw new Exception("Error creating test table: " . $error);
        }

        echo ". 🤞 Duplicated table matrix_activity_diffusion => matrix_activity_diffusion_test" . PHP_EOL . PHP_EOL;
    }

    /**
     * TEAR_DOWN_AFTER_CLASS
     * Clean up test table after all tests complete
     * @return void
     */
    public static function tearDownAfterClass(): void
    {
        // Reset to original table
        matrix_activity_diffusion_db_manager::$tables = [
            'matrix_activity_diffusion' => true
        ];
    }

    /**
     * TEST_create
     * @return void
     */
    public function test_create(): void
    {
        $table = $this->table;
        $section_tipo = $this->section_tipo;
        $values = null;

        // 1 - Create basic record
        $result = matrix_activity_diffusion_db_manager::create(
            $table,
            $section_tipo,
            $values
        );

        $this->assertEquals(1, $result, "Expected 1 on successful creation (compatibility mode)");

        // 2 - Create record using values
        $values = (object)[
            'section_tipo' => $section_tipo,
            'string' => (object)[
                'rsc168' => [ (object)['value' => 'test value', 'id' => 1] ]
            ],
            'date' => (object)[
                'rsc168' => [ (object)['value' => '2026-02-26', 'id' => 1] ]
            ]
        ];
        $result = matrix_activity_diffusion_db_manager::create(
            $table,
            $section_tipo,
            $values
        );

        $this->assertEquals(1, $result, "Expected 1 on successful creation with values");
    }

    /**
     * TEST_read
     * @return void
     */
    public function test_read(): void
    {
        $table = $this->table;
        $section_tipo = $this->section_tipo;

        // Ensure a record exists
        matrix_activity_diffusion_db_manager::create($table, $section_tipo);

        // In this class, create returns 1, so we need to know what section_id it created
        // Since it's a new table, it should be 1, but let's check the max section_id
        $conn = DBi::_getConnection();
        $res = pg_query($conn, "SELECT MAX(section_id) as sid FROM $table WHERE section_tipo = '$section_tipo'");
        $row = pg_fetch_assoc($res);
        $section_id = (int)$row['sid'];

        $result = matrix_activity_diffusion_db_manager::read(
            $table,
            $section_tipo,
            $section_id
        );

        $this->assertIsObject($result, "Expected an object result from read");
        $this->assertEquals($section_id, $result->section_id, "Section ID mismatch");
    }

    /**
     * TEST_update
     * @return void
     */
    public function test_update(): void
    {
        $table = $this->table;
        $section_tipo = $this->section_tipo;

        matrix_activity_diffusion_db_manager::create($table, $section_tipo);

        $conn = DBi::_getConnection();
        $res = pg_query($conn, "SELECT MAX(section_id) as sid FROM $table WHERE section_tipo = '$section_tipo'");
        $row = pg_fetch_assoc($res);
        $section_id = (int)$row['sid'];

        $values = (object)[
            'string' => (object)[
                'rsc168' => [ (object)['value' => 'updated value', 'id' => 1] ]
            ]
        ];

        $result = matrix_activity_diffusion_db_manager::update(
            $table,
            $section_tipo,
            $section_id,
            $values
        );

        $this->assertTrue($result, "Expected true on successful update");

        $read_result = matrix_activity_diffusion_db_manager::read($table, $section_tipo, $section_id);
        $this->assertStringContainsString('updated value', $read_result->string, "Value was not updated");
    }

    /**
     * TEST_update_by_key
     * @return void
     */
    public function test_update_by_key(): void
    {
        $table = $this->table;
        $section_tipo = $this->section_tipo;

        matrix_activity_diffusion_db_manager::create($table, $section_tipo);

        $conn = DBi::_getConnection();
        $res = pg_query($conn, "SELECT MAX(section_id) as sid FROM $table WHERE section_tipo = '$section_tipo'");
        $row = pg_fetch_assoc($res);
        $section_id = (int)$row['sid'];

        $data_to_save = [(object)[
            'column' => 'string',
            'key'    => 'rsc168',
            'value'  => [ (object)['value' => 'key updated value', 'id' => 1] ]
        ]];

        $result = matrix_activity_diffusion_db_manager::update_by_key(
            $table,
            $section_tipo,
            $section_id,
            $data_to_save
        );

        $this->assertTrue($result, "Expected true on update_by_key");

        $read_result = matrix_activity_diffusion_db_manager::read($table, $section_tipo, $section_id);
        $this->assertStringContainsString('key updated value', $read_result->string, "Key value was not updated");
    }

    /**
     * TEST_delete
     * @return void
     */
    public function test_delete(): void
    {
        $table = $this->table;
        $section_tipo = $this->section_tipo;

        matrix_activity_diffusion_db_manager::create($table, $section_tipo);

        $conn = DBi::_getConnection();
        $res = pg_query($conn, "SELECT MAX(section_id) as sid FROM $table WHERE section_tipo = '$section_tipo'");
        $row = pg_fetch_assoc($res);
        $section_id = (int)$row['sid'];

        $result = matrix_activity_diffusion_db_manager::delete(
            $table,
            $section_tipo,
            $section_id
        );

        $this->assertTrue($result, "Expected true on successful delete");

        $read_result = matrix_activity_diffusion_db_manager::read($table, $section_tipo, $section_id);
        $this->assertFalse($read_result, "Record should not exist after delete");
    }
}
