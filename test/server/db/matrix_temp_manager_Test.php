<?php declare(strict_types=1);
require_once dirname(__FILE__, 2) . '/bootstrap.php';
require_once dirname(__FILE__, 2) . '/class.BaseTestCase.php';

class matrix_temp_manager_test extends BaseTestCase {

    public static $model = 'matrix_temp_manager';

    /**
     * Set up before each test
     */
    protected function setUp(): void {
        parent::setUp();
        // Ensure session structure exists
        if (!isset($_SESSION)) {
            $_SESSION = [];
        }
        if (!isset($_SESSION['dedalo'])) {
            $_SESSION['dedalo'] = [];
        }
        if (!isset($_SESSION['dedalo']['section_temp_data'])) {
            $_SESSION['dedalo']['section_temp_data'] = [];
        }
    }

    /**
     * TEST_get_uid
     * @return void
     */
    public function test_get_uid(): void {
        $table = 'matrix';
        $section_tipo = 'oh1';
        $section_id = 'tmp';

        $uid = matrix_temp_manager::get_uid($section_tipo);
        $this->assertEquals("matrix_oh1_tmp", $uid);
    }

    /**
     * TEST_create
     * @return void
     */
    public function test_create(): void {
        $table = 'matrix';
        $section_tipo = 'oh1';
        $section_id = 'tmp';
        $values = (object)['section_id' => $section_id];

        $result = matrix_temp_manager::create($table, $section_tipo, $values);

        $this->assertEquals((int)$section_id, $result);
        $temp_data_uid = matrix_temp_manager::get_uid($section_tipo);
        $this->assertArrayHasKey($temp_data_uid, $_SESSION['dedalo']['section_temp_data']);
        $this->assertInstanceOf('stdClass', $_SESSION['dedalo']['section_temp_data'][$temp_data_uid]);
    }

    /**
     * TEST_update
     * @return void
     */
    public function test_update(): void {
        $table = 'matrix';
        $section_tipo = 'oh1';
        $section_id = 'tmp';

        // Initial create
        matrix_temp_manager::create($table, $section_tipo, (object)['section_id' => $section_id]);

        $values = (object)[
            'data' => (object)['foo' => 'bar'],
            'string' => [(object)['lang' => 'lg-spa', 'value' => 'some string']]
        ];

        $result = matrix_temp_manager::update($table, $section_tipo, $section_id, $values);

        $this->assertTrue($result);
        $temp_data_uid = matrix_temp_manager::get_uid($section_tipo);

        // Check if data was encoded (since 'data' is a JSON column)
        $this->assertEquals(json_handler::encode((object)['foo' => 'bar']), $_SESSION['dedalo']['section_temp_data'][$temp_data_uid]->data);
        // Check if string was encoded too (since 'string' is a JSON column in v7)
        $this->assertEquals(json_handler::encode([(object)['lang' => 'lg-spa', 'value' => 'some string']]), $_SESSION['dedalo']['section_temp_data'][$temp_data_uid]->string);
    }

    /**
     * TEST_read
     * @return void
     */
    public function test_read(): void {
        $table = 'matrix';
        $section_tipo = 'oh1';
        $section_id = 'tmp';

        matrix_temp_manager::create($table, $section_tipo, (object)['section_id' => $section_id]);

        $values = (object)['string' => [(object)['lang' => 'lg-spa', 'value' => 'hello']]];
        matrix_temp_manager::update($table, $section_tipo, $section_id, $values);

        $result = matrix_temp_manager::read($table, $section_tipo, $section_id);

        $this->assertInstanceOf('stdClass', $result);
        $this->assertEquals(json_handler::encode([(object)['lang' => 'lg-spa', 'value' => 'hello']]), $result->string);

        // Test non-existing
        $result_none = matrix_temp_manager::read($table, $section_tipo, 'non_existent');
        $this->assertFalse($result_none);
    }

    /**
     * TEST_update_by_key
     * @return void
     */
    public function test_update_by_key(): void {
        $table = 'matrix';
        $section_tipo = 'oh1';
        $section_id = 'tmp';

        matrix_temp_manager::create($table, $section_tipo, (object)['section_id' => $section_id]);

        $data_to_save = [
            (object)[
                'column' => 'data',
                'key'    => 'key1',
                'value'  => ['val1' => 123]
            ],
            (object)[
                'column' => 'data',
                'key'    => 'key2',
                'value'  => 'val2'
            ]
        ];

        $result = matrix_temp_manager::update_by_key($table, $section_tipo, $section_id, $data_to_save);
        $this->assertTrue($result);

        $read = matrix_temp_manager::read($table, $section_tipo, $section_id);

        // Column 'data' should be a JSON string
        $this->assertIsString($read->data);
        $decoded_data = json_decode($read->data);

        $this->assertEquals((object)['val1' => 123], $decoded_data->key1);
        $this->assertEquals('val2', $decoded_data->key2);

        // Test deletion
        $delete_data = [
            (object)[
                'column' => 'data',
                'key'    => 'key1',
                'value'  => null
            ]
        ];
        matrix_temp_manager::update_by_key($table, $section_tipo, $section_id, $delete_data);
        $read_after_delete = matrix_temp_manager::read($table, $section_tipo, $section_id);
        $decoded_after_delete = json_decode($read_after_delete->data);
        $this->assertObjectNotHasProperty('key1', $decoded_after_delete);
        $this->assertEquals('val2', $decoded_after_delete->key2);
    }

    /**
     * TEST_delete
     * @return void
     */
    public function test_delete(): void {
        $table = 'matrix';
        $section_tipo = 'oh1';
        $section_id = 'tmp';

        matrix_temp_manager::create($table, $section_tipo, (object)['section_id' => $section_id]);
        $temp_data_uid = matrix_temp_manager::get_uid($section_tipo);
        $this->assertArrayHasKey($temp_data_uid, $_SESSION['dedalo']['section_temp_data']);

        $result = matrix_temp_manager::delete($table, $section_tipo, $section_id);
        $this->assertTrue($result);
        $this->assertArrayNotHasKey($temp_data_uid, $_SESSION['dedalo']['section_temp_data']);
    }
}
