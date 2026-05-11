<?php declare(strict_types=1);
/**
 * @noinspection PhpUndefinedFunctionInspection
 * @noinspection PhpVoidFunctionResultUsedInspection
 * @noinspection PhpTooManyArgumentsInspection
 */

require_once dirname(dirname(dirname(__FILE__))) . '/bootstrap.php';
require_once dirname(dirname(dirname(dirname(dirname(__FILE__))))) . '/core/base/upgrade/class.v6_to_v7.php';
require_once dirname(dirname(dirname(dirname(dirname(__FILE__))))) . '/core/base/update/class.update.php';

final class v6_to_v7_Test extends BaseTestCase {

    /**
     * @var string Test table for matrix data
     */
    private static $test_matrix_table = 'matrix_test_v6_to_v7';

    /**
     * @var string Test table for legacy jer_dd ontology
     */
    private static $test_jer_dd_table = 'jer_dd_test';

    /**
     * @var string Test table for new v7 ontology
     */
    private static $test_ontology_table = 'dd_ontology_test';

    /**
     * @var string Original jer_dd table name
     */
    private static $original_table_jer_dd;

    /**
     * @var string Original dd_ontology table name
     */
    private static $original_table_dd_ontology;

    /**
     * @var string Original matrix_time_machine table name
     */
    private static $original_table_matrix_time_machine;

    /**
     * @var string Test table for time machine history
     */
    private static $test_tm_table = 'matrix_time_machine_test';

    protected function setUp(): void {
        // Remove the skip to enable tests
        $this->markTestSkipped('This entire class is currently disabled.');
    }

    /**
     * setUpBeforeClass
     * Initializes test environment, redirects v6_to_v7 table names, and creates test tables.
     */
    public static function setUpBeforeClass(): void {
        $conn = DBi::_getConnection();

        // Store original table names
        self::$original_table_jer_dd = v6_to_v7::$table_jer_dd;
        self::$original_table_dd_ontology = v6_to_v7::$table_dd_ontology;
        self::$original_table_matrix_time_machine = v6_to_v7::$table_matrix_time_machine;

        // Redirect v6_to_v7 to use our test tables
        v6_to_v7::$table_jer_dd = self::$test_jer_dd_table;
        v6_to_v7::$table_dd_ontology = self::$test_ontology_table;
        v6_to_v7::$table_matrix_time_machine = self::$test_tm_table;

        // 1. Setup Matrix Test Table
        pg_query($conn, "DROP TABLE IF EXISTS " . self::$test_matrix_table . " CASCADE");
        $sql = "CREATE TABLE " . self::$test_matrix_table . " (
            id SERIAL PRIMARY KEY,
            section_tipo character varying(32),
            section_id integer,
            datos jsonb,
            data jsonb,
            relation jsonb,
            string jsonb,
            date jsonb,
            iri jsonb,
            geo jsonb,
            number jsonb,
            media jsonb,
            misc jsonb,
            relation_search jsonb,
            meta jsonb
        )";
        pg_query($conn, $sql);

        // Insert sample v6 data into matrix
        $datos = [
            'components' => (object)[
                'dd544' => (object)[
                    'dato' => (object)[
                        'lg-spa' => ['Sample Text Value']
                    ]
                ]
            ]
        ];

        pg_query_params($conn,
            "INSERT INTO " . self::$test_matrix_table . " (section_tipo, section_id, datos) VALUES ($1, $2, $3)",
            ['dd123', 1, json_encode($datos)]
        );

        // 2. Setup Legacy jer_dd Test Table (v6 format)
        pg_query($conn, "DROP TABLE IF EXISTS " . self::$test_jer_dd_table . " CASCADE");
        $sql = "CREATE TABLE " . self::$test_jer_dd_table . " (
            id SERIAL PRIMARY KEY,
            dominio character varying(32),
            tipo character varying(32),
            parent integer,
            traducible character varying(1),
            indexable character varying(1),
            publicable character varying(1),
            datos jsonb,
            propiedades jsonb
        )";
        pg_query($conn, $sql);

        // Insert sample legacy jer_dd data
        $jer_dd_data = [
            'obj_name' => 'Test Component',
            'model' => 'component_text_area',
            'properties' => (object)[
                'type' => 'text'
            ]
        ];

        pg_query_params($conn,
            "INSERT INTO " . self::$test_jer_dd_table . " (dominio, tipo, datos) VALUES ($1, $2, $3)",
            ['dd', 'dd544', json_encode($jer_dd_data)]
        );

        // 3. Setup New dd_ontology Test Table (v7 format)
        pg_query($conn, "DROP TABLE IF EXISTS " . self::$test_ontology_table . " CASCADE");
        $sql = "CREATE TABLE " . self::$test_ontology_table . " (
            id SERIAL PRIMARY KEY,
            tipo character varying(32),
            modelo character varying(64),
            label character varying(64),
            properties jsonb
        )";
        pg_query($conn, $sql);

        // Insert sample v7 ontology data
        $ontology_data = [
            'label' => 'Test Component',
            'type' => 'text'
        ];

        pg_query_params($conn,
            "INSERT INTO " . self::$test_ontology_table . " (tipo, modelo, properties) VALUES ($1, $2, $3)",
            ['dd544', 'component_text_area', json_encode($ontology_data)]
        );

        // 4. Setup Time Machine Test Table (v6 schema with data column for v7)
        pg_query($conn, "DROP TABLE IF EXISTS " . self::$test_tm_table . " CASCADE");
        $sql = "CREATE TABLE " . self::$test_tm_table . " (
            id SERIAL PRIMARY KEY,
            section_tipo character varying(32),
            section_id integer,
            tipo character varying(32),
            \"userID\" character varying(32),
            bulk_process_id integer,
            dato jsonb,
            state character varying(32),
            lang character varying(8),
            timestamp timestamp without time zone,
            section_id_key integer,
            data jsonb
        )";
        pg_query($conn, $sql);
    }

    /**
     * tearDownAfterClass
     * Cleans up test tables and restores original v6_to_v7 table configurations.
     */
    public static function tearDownAfterClass(): void {
        $conn = DBi::_getConnection();
        pg_query($conn, "DROP TABLE IF EXISTS " . self::$test_matrix_table . " CASCADE");
        pg_query($conn, "DROP TABLE IF EXISTS " . self::$test_jer_dd_table . " CASCADE");
        pg_query($conn, "DROP TABLE IF EXISTS " . self::$test_ontology_table . " CASCADE");
        pg_query($conn, "DROP TABLE IF EXISTS " . self::$test_tm_table . " CASCADE");

        // Restore original table names
        v6_to_v7::$table_jer_dd = self::$original_table_jer_dd;
        v6_to_v7::$table_dd_ontology = self::$original_table_dd_ontology;
        v6_to_v7::$table_matrix_time_machine = self::$original_table_matrix_time_machine;
    }

    /**
     * test_get_value_type_map
     */
    public function test_get_value_type_map() {
        $map = v6_to_v7::get_value_type_map();
        $this->assertIsObject($map);
    }

    /**
     * test_process_matrix_row_data_misc_fallback
     */
    public function test_process_matrix_row_data_misc_fallback() {
        $table = 'matrix_test';
        $section_tipo = 'dd123';
        $section_id = 1;
        $value_type_map = (object)[];
        $response = new stdClass();
        $response->errors = [];

        $datos = [
            'components' => (object)[
                'dd544' => (object)[
                    'dato' => (object)[
                        'lg-spa' => ['Test Value']
                    ]
                ]
            ],
            'created_date' => '2023-01-01 00:00:00',
            'created_by_userID' => 1
        ];

        $result = v6_to_v7::process_matrix_row_data($datos, $table, $section_tipo, $section_id, $value_type_map, $response);

        $this->assertIsObject($result);
        $this->assertEquals(1, $result->data->created_by_user_id);
        // dd544 falls back to misc when not found in ontology/value_type_map
        $this->assertEquals('Test Value', $result->misc->dd544[0]->value);
    }

    /**
     * test_process_matrix_row_data_relations
     */
    public function test_process_matrix_row_data_relations() {
        $table = 'matrix_test';
        $section_tipo = 'dd123';
        $section_id = 1;
        $value_type_map = (object)[];
        $response = new stdClass();
        $response->errors = [];

        $datos = [
            'relations' => [
                (object)[
                    'from_component_tipo' => 'dd123',
                    'section_tipo' => 'dd456',
                    'section_id' => 2
                ]
            ]
        ];

        $result = v6_to_v7::process_matrix_row_data($datos, $table, $section_tipo, $section_id, $value_type_map, $response);

        $this->assertIsObject($result);
        $this->assertObjectHasProperty('relation', $result);
        $this->assertObjectHasProperty('dd123', $result->relation);
        $this->assertCount(1, $result->relation->dd123);
    }

    /**
     * test_transform_search_preset_adds_id_to_top_level
     */
    public function test_transform_search_preset_adds_id_to_top_level() {
        $preset_data = [
            (object)[
                'value' => (object)[
                    '$and' => []
                ]
            ]
        ];

        // Use reflection to access private method
        $reflection = new ReflectionClass('v6_to_v7');
        $method = $reflection->getMethod('transform_search_preset');
        $method->setAccessible(true);

        $result = $method->invoke(null, $preset_data);

        $this->assertNotNull($result);
        $this->assertIsArray($result);
        $this->assertCount(1, $result);
        $this->assertEquals(1, $result[0]->id);
    }

    /**
     * test_transform_search_preset_adds_id_to_q_array_items
     */
    public function test_transform_search_preset_adds_id_to_q_array_items() {
        $preset_data = [
            (object)[
                'value' => (object)[
                    '$and' => [
                        (object)[
                            'q' => [
                                (object)['value' => 'numisdata']
                            ],
                            'path' => [
                                (object)['name' => 'TLD']
                            ],
                            'type' => 'jsonb'
                        ]
                    ]
                ]
            ]
        ];

        $reflection = new ReflectionClass('v6_to_v7');
        $method = $reflection->getMethod('transform_search_preset');
        $method->setAccessible(true);

        $result = $method->invoke(null, $preset_data);

        $this->assertNotNull($result);
        $this->assertEquals(1, $result[0]->id);
        $this->assertEquals(1, $result[0]->value->{'$and'}[0]->q[0]->id);
    }

    /**
     * test_transform_search_preset_removes_id_when_q_is_null
     */
    public function test_transform_search_preset_removes_id_when_q_is_null() {
        $preset_data = [
            (object)[
                'value' => (object)[
                    '$and' => [
                        (object)[
                            'q' => null,
                            'id' => 1, // Should be removed
                            'path' => [
                                (object)['name' => 'Id']
                            ],
                            'type' => 'jsonb'
                        ]
                    ]
                ]
            ]
        ];

        $reflection = new ReflectionClass('v6_to_v7');
        $method = $reflection->getMethod('transform_search_preset');
        $method->setAccessible(true);

        $result = $method->invoke(null, $preset_data);

        $this->assertNotNull($result);
        $this->assertEquals(1, $result[0]->id); // top-level id added
        $this->assertObjectNotHasProperty('id', $result[0]->value->{'$and'}[0]); // id removed
    }

    /**
     * test_transform_search_preset_is_idempotent
     */
    public function test_transform_search_preset_is_idempotent() {
        // Already has id - should return null (no changes)
        $preset_data = [
            (object)[
                'id' => 1,
                'value' => (object)[
                    '$and' => []
                ]
            ]
        ];

        $reflection = new ReflectionClass('v6_to_v7');
        $method = $reflection->getMethod('transform_search_preset');
        $method->setAccessible(true);

        $result = $method->invoke(null, $preset_data);

        $this->assertNull($result); // No changes needed
    }

    /**
     * test_transform_search_preset_handles_or_array
     */
    public function test_transform_search_preset_handles_or_array() {
        $preset_data = [
            (object)[
                'value' => (object)[
                    '$or' => [
                        (object)[
                            'q' => [
                                (object)['value' => 'test']
                            ],
                            'path' => []
                        ]
                    ]
                ]
            ]
        ];

        $reflection = new ReflectionClass('v6_to_v7');
        $method = $reflection->getMethod('transform_search_preset');
        $method->setAccessible(true);

        $result = $method->invoke(null, $preset_data);

        $this->assertNotNull($result);
        $this->assertEquals(1, $result[0]->value->{'$or'}[0]->q[0]->id);
    }

    /**
     * test_transform_search_preset_handles_nested_and_operator
     */
    public function test_transform_search_preset_handles_nested_and_operator() {
        $preset_data = [
            (object)[
                'value' => (object)[
                    '$and' => [
                        (object)[
                            'q' => [
                                (object)['value' => 'numisdata']
                            ],
                            'path' => []
                        ],
                        (object)[
                            'q' => null,
                            'path' => []
                        ],
                        (object)[
                            '$and' => [
                                (object)[
                                    'q' => [
                                        (object)['value' => 'test']
                                    ],
                                    'path' => []
                                ]
                            ]
                        ]
                    ]
                ]
            ]
        ];

        $reflection = new ReflectionClass('v6_to_v7');
        $method = $reflection->getMethod('transform_search_preset');
        $method->setAccessible(true);

        $result = $method->invoke(null, $preset_data);

        $this->assertNotNull($result);
        $this->assertEquals(1, $result[0]->id);
        // First filter item
        $this->assertEquals(1, $result[0]->value->{'$and'}[0]->q[0]->id);
        // Second filter item (q is null - no id property)
        $this->assertObjectNotHasProperty('id', $result[0]->value->{'$and'}[1]);
        // Third filter item is nested $and
        $nested_and = $result[0]->value->{'$and'}[2]->{'$and'}[0];
        $this->assertEquals(1, $nested_and->q[0]->id);
    }

    /**
     * test_transform_search_preset_handles_deeply_nested_operators
     */
    public function test_transform_search_preset_handles_deeply_nested_operators() {
        $preset_data = [
            (object)[
                'value' => (object)[
                    '$and' => [
                        (object)[
                            '$or' => [
                                (object)[
                                    '$and' => [
                                        (object)[
                                            'q' => [
                                                (object)['value' => 'deep']
                                            ],
                                            'path' => []
                                        ]
                                    ]
                                ]
                            ]
                        ]
                    ]
                ]
            ]
        ];

        $reflection = new ReflectionClass('v6_to_v7');
        $method = $reflection->getMethod('transform_search_preset');
        $method->setAccessible(true);

        $result = $method->invoke(null, $preset_data);

        $this->assertNotNull($result);
        $this->assertEquals(1, $result[0]->id);
        // Navigate deep nesting: $and -> $or -> $and -> q
        $deep_q = $result[0]->value->{'$and'}[0]->{'$or'}[0]->{'$and'}[0]->q[0];
        $this->assertEquals(1, $deep_q->id);
    }

}
