<?php declare(strict_types=1);
require_once dirname(__FILE__, 2) . '/bootstrap.php';
require_once dirname(__FILE__, 2) . '/class.BaseTestCase.php';

class matrix_temp_manager_test extends BaseTestCase {

    public static $model = 'matrix_temp_manager';

    // The class defines $table='temp' by default, and allows passing it.
    // referencing class.matrix_temp_manager.php
    protected string $table = 'temp';
    protected string $section_tipo = 'oh1';
    protected string|int $section_id = 1;

    /**
     * Set up before each test
     */
    protected function setUp(): void {
        parent::setUp();
        // Clean up before test
        matrix_temp_manager::delete($this->table, $this->section_tipo, $this->section_id);
    }

    protected function tearDown(): void {
        // Clean up after test
        matrix_temp_manager::delete($this->table, $this->section_tipo, $this->section_id);
        parent::tearDown();
    }

    /**
     * TEST_get_uid
     * @return void
     */
    public function test_get_uid(): void {
        // Implementation: $section_tipo . logged_user_id()
        // Assuming user 1 from bootstrap/test env
        $uid = matrix_temp_manager::get_uid($this->section_tipo);
        $expected = $this->section_tipo . logged_user_id();
        $this->assertEquals($expected, $uid);
    }

    /**
     * TEST_create
     * @return void
     */
    public function test_create(): void {
        $values = (object)['section_id' => $this->section_id, 'data' => (object)['test'=>'creation']];

        // defined as create(string $section_tipo, string $table='temp', ?object $values = null)
        $result = matrix_temp_manager::create($this->section_tipo, $this->table, $values);

        $this->assertEquals(0, $result, "Create should return 0 as section_id");

        // Verify with read
        $read_data = matrix_temp_manager::read($this->table, $this->section_tipo, $this->section_id);
        $this->assertIsObject($read_data);
        $this->assertEquals(0, $read_data->section_id);

        $this->assertIsString($read_data->data);
        $this->assertStringContainsString('creation', $read_data->data);
    }

    /**
     * TEST_update
     * @return void
     */
    public function test_update(): void {
        // Initial create
        matrix_temp_manager::create($this->section_tipo, $this->table, (object)['section_id' => $this->section_id]);

        $values = (object)[
            'data' => (object)['foo' => 'bar'],
            'string' => 'some string value'
        ];

        // update(string $table, string $section_tipo, int|string $section_id, object $values)
        $result = matrix_temp_manager::update($this->table, $this->section_tipo, $this->section_id, $values);

        $this->assertTrue($result);

        $read_data = matrix_temp_manager::read($this->table, $this->section_tipo, $this->section_id);

        // Check data content
        $decoded_data = json_decode($read_data->data);
        $this->assertEquals('bar', $decoded_data->foo);

        // Check string content (if it was stored)
        $this->assertEquals('some string value', $read_data->string);
    }

    /**
     * TEST_read
     * @return void
     */
    public function test_read(): void {
        // Create with data
        $values = (object)['string' => 'hello world'];
        matrix_temp_manager::create($this->section_tipo, $this->table, $values);

        // read(string $table, string $section_tipo, int|string $section_id)
        $result = matrix_temp_manager::read($this->table, $this->section_tipo, $this->section_id);

        $this->assertInstanceOf('stdClass', $result);
        $this->assertEquals(0, $result->section_id);
        $this->assertEquals('hello world', $result->string);

        // Test non-existing
        $result_none = matrix_temp_manager::read($this->table, 'non_existent_type', 'x');
        $this->assertFalse($result_none);
    }

    /**
     * TEST_update_by_key
     * @return void
     */
    public function test_update_by_key(): void {
        // Setup
        matrix_temp_manager::create($this->section_tipo, $this->table);

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

        // update_by_key(string $table, string $section_tipo, int|string $section_id, array $data_to_save)
        $result = matrix_temp_manager::update_by_key($this->table, $this->section_tipo, $this->section_id, $data_to_save);
        $this->assertTrue($result);

        $read = matrix_temp_manager::read($this->table, $this->section_tipo, $this->section_id);

        $this->assertIsString($read->data);
        $decoded_data = json_decode($read->data);

        $this->assertEquals((object)['val1' => 123], $decoded_data->key1);
        $this->assertEquals('val2', $decoded_data->key2);

        // Test deletion (value = null)
        $delete_data = [
            (object)[
                'column' => 'data',
                'key'    => 'key1',
                'value'  => null
            ]
        ];
        matrix_temp_manager::update_by_key($this->table, $this->section_tipo, $this->section_id, $delete_data);

        $read_after_delete = matrix_temp_manager::read($this->table, $this->section_tipo, $this->section_id);
        $decoded_after_delete = json_decode($read_after_delete->data);

        $this->assertObjectNotHasProperty('key1', $decoded_after_delete);
        $this->assertEquals('val2', $decoded_after_delete->key2);
    }

    /**
     * TEST_delete
     * @return void
     */
    public function test_delete(): void {
        // Create
        matrix_temp_manager::create($this->section_tipo, $this->table);

        // Verify exists
        $read = matrix_temp_manager::read($this->table, $this->section_tipo, $this->section_id);
        $this->assertNotFalse($read);

        // Delete
        // delete(string $table, string $section_tipo, int|string $section_id)
        $result = matrix_temp_manager::delete($this->table, $this->section_tipo, $this->section_id);
        $this->assertTrue($result);

        // Verify gone
        $read_gone = matrix_temp_manager::read($this->table, $this->section_tipo, $this->section_id);
        $this->assertFalse($read_gone);
    }
}
