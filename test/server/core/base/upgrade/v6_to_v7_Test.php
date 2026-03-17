<?php declare(strict_types=1);
require_once dirname(dirname(dirname(dirname(__FILE__)))) . '/bootstrap.php';
require_once dirname(dirname(dirname(dirname(dirname(dirname(__FILE__)))))) . '/core/base/upgrade/class.v6_to_v7.php';
require_once dirname(dirname(dirname(dirname(dirname(dirname(__FILE__)))))) . '/core/base/update/class.update.php';

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
     * @var string Test table for time machine history
     */
    private static $test_tm_table     = 'matrix_time_machine_test';

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

    protected function setUp(): void
    {
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
            ],
            'created_date' => '2023-01-01 10:00:00',
            'created_by_userID' => 1
        ];
        pg_query_params($conn,
            "INSERT INTO " . self::$test_matrix_table . " (section_tipo, section_id, datos) VALUES ($1, $2, $3)",
            ['dd123', 1, json_encode($datos)]
        );

        // 2. Setup Jer_dd Test Table (PURE v6 schema)
        pg_query($conn, "DROP TABLE IF EXISTS " . self::$test_jer_dd_table . " CASCADE");
        $sql = "CREATE TABLE " . self::$test_jer_dd_table . " (
            id SERIAL PRIMARY KEY,
            \"terminoID\" character varying(32),
            modelo character varying(32),
            esmodelo character varying(2),
            traducible character varying(2),
            norden numeric(4,0),
            relaciones jsonb,
            parent character varying(32),
            term jsonb,
            model character varying(32),
            tld character varying(32),
            properties jsonb,
            propiedades jsonb
        )";
        pg_query($conn, $sql);

        // 2.1 Drop Ontology Test Table if exists
        pg_query($conn, "DROP TABLE IF EXISTS " . self::$test_ontology_table . " CASCADE");

        // Insert sample jer_dd data
        pg_query_params($conn,
            "INSERT INTO " . self::$test_jer_dd_table . " (\"terminoID\", modelo, esmodelo, traducible, norden, relaciones) VALUES ($1, $2, $3, $4, $5, $6)",
            ['dd1', 'section', 'si', 'no', 1, json_encode([['model_x' => 'dd64']])]
        );

        // 3. Setup Time Machine Test Table (v6 schema)
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
            section_id_key integer
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
        pg_query($conn, "DROP TABLE IF EXISTS " . self::$test_tm_table . " CASCADE");
        pg_query($conn, "DROP TABLE IF EXISTS " . self::$test_ontology_table . " CASCADE");
        pg_query($conn, "DROP SEQUENCE IF EXISTS " . self::$test_ontology_table . "_id_seq CASCADE");

        // Restore original table names
        v6_to_v7::$table_jer_dd = self::$original_table_jer_dd;
        v6_to_v7::$table_dd_ontology = self::$original_table_dd_ontology;
        v6_to_v7::$table_matrix_time_machine = self::$original_table_matrix_time_machine;
    }

    /**
     * test_expand_jer_dd_with_new_schema
     * Verifies that new columns are successfully added to the jer_dd test table.
     */
    public function test_expand_jer_dd_with_new_schema() : void {
        $result = v6_to_v7::expand_jer_dd_with_new_schema();
        $this->assertTrue($result, "JER DD schema expansion should succeed");

        $columns = ['tipo', 'model_tipo', 'is_model', 'is_translatable', 'order_number', 'relations'];
        foreach ($columns as $column) {
            $this->assertTrue(DBi::check_column_exists(self::$test_jer_dd_table, $column), "Column $column should exist");
        }
    }

    /**
     * test_fill_new_columns_in_jer_dd
     * Verifies that legacy string values ('si'/'no') are correctly converted to booleans in new columns.
     * @depends test_expand_jer_dd_with_new_schema
     */
    public function test_fill_new_columns_in_jer_dd() : void {
        $result = v6_to_v7::fill_new_columns_in_jer_dd();
        $this->assertTrue($result, "Filling new columns in JER DD should succeed");

        $conn = DBi::_getConnection();
        $res  = pg_query($conn, "SELECT tipo, is_model, is_translatable FROM " . self::$test_jer_dd_table . " WHERE \"terminoID\" = 'dd1'");
        $row  = pg_fetch_assoc($res);

        $this->assertEquals('dd1', $row['tipo']);
        $this->assertEquals('t', $row['is_model'], "V6 'si' should become boolean TRUE (t)");
        $this->assertEquals('f', $row['is_translatable'], "V6 'no' should become boolean FALSE (f)");
    }

    /**
     * test_refactor_jer_dd_relations
     * Verifies that relation objects are correctly transformed to the new 'tipo'-based format.
     * @depends test_fill_new_columns_in_jer_dd
     */
    public function test_refactor_jer_dd_relations() : void {
        $result = v6_to_v7::refactor_jer_dd_relations();
        $this->assertTrue($result, "Refactoring JER DD relations should succeed");

        $conn = DBi::_getConnection();
        $res  = pg_query($conn, "SELECT relations FROM " . self::$test_jer_dd_table . " WHERE tipo = 'dd1'");
        $row  = pg_fetch_assoc($res);

        $relations = json_decode($row['relations']);
        $this->assertIsArray($relations);
        $this->assertEquals('dd64', $relations[0]->tipo, "Legacy relation key 'model_x' should be renamed to 'tipo'");
    }

    /**
     * test_create_dd_ontology_table
     * Verifies that the final dd_ontology table is created with correct structure and data.
     * @depends test_refactor_jer_dd_relations
     */
    public function test_create_dd_ontology_table() : void {
        $result = v6_to_v7::create_dd_ontology_table();
        $this->assertTrue($result, "Creation of dd_ontology table should succeed");
        $this->assertTrue(DBi::check_table_exists(self::$test_ontology_table), "Ontology table should exist");

        $conn = DBi::_getConnection();
        $res  = pg_query($conn, "SELECT tipo, is_model, relations FROM " . self::$test_ontology_table . " WHERE id = 1");
        $row  = pg_fetch_assoc($res);

        $this->assertEquals('dd1', $row['tipo']);
        $this->assertEquals('t', $row['is_model']);
        $this->assertEquals('dd64', json_decode($row['relations'])[0]->tipo);
    }

    /**
     * test_pre_update
     * Full integration test for the pre_update flow.
     */
    public function test_pre_update() : void {
        $conn = DBi::_getConnection();
        // Reset tables to pure v6 state for this integration test
        pg_query($conn, "DROP TABLE IF EXISTS " . self::$test_jer_dd_table . " CASCADE");
        pg_query($conn, "DROP TABLE IF EXISTS " . self::$test_ontology_table . " CASCADE");
        $sql = "CREATE TABLE " . self::$test_jer_dd_table . " (
            id SERIAL PRIMARY KEY,
            \"terminoID\" character varying(32),
            modelo character varying(32),
            esmodelo character varying(2),
            traducible character varying(2),
            norden numeric(4,0),
            relaciones jsonb,
            parent character varying(32),
            term jsonb,
            model character varying(32),
            tld character varying(32),
            properties jsonb,
            propiedades jsonb
        )";
        pg_query($conn, $sql);
        pg_query_params($conn,
            "INSERT INTO " . self::$test_jer_dd_table . " (\"terminoID\", modelo, esmodelo, traducible, norden, relaciones) VALUES ($1, $2, $3, $4, $5, $6)",
            ['dd1', 'section', 'si', 'no', 1, json_encode([['model_x' => 'dd64']])]
        );

        $response = v6_to_v7::pre_update();
        $this->assertTrue($response->result, "Full pre-update flow should succeed. Errors: " . json_encode($response->errors));
        $this->assertTrue(DBi::check_table_exists(self::$test_ontology_table), "Ontology table should be created");
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
                'dd1' => (object)[
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
        $this->assertEquals('Test Value', $result->misc->dd1[0]->value);
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
                (object)['from_component_tipo' => 'dd999', 'section_id' => 2, 'section_tipo' => 'dd124']
            ]
        ];

        $result = v6_to_v7::process_matrix_row_data($datos, $table, $section_tipo, $section_id, $value_type_map, $response);

        $this->assertIsObject($result);
        $this->assertObjectHasProperty('dd999', $result->relation);
        $this->assertEquals(2, $result->relation->dd999[0]->section_id);
    }

    /**
     * test_convert_table_data
     * Verifies the wrapper method that triggers table data conversion.
     */
    public function test_convert_table_data() : void {
        $ar_tables = [self::$test_matrix_table];
        $save = true;
        $response = v6_to_v7::reformat_matrix_data($ar_tables, $save);
        $this->assertTrue($response->result, "reformat_matrix_data should return true in result");
    }

    /**
     * test_reformat_matrix_data_save
     * Verifies that matrix data is correctly reformatted from v6 'datos' JSON to v7 columns.
     */
    public function test_reformat_matrix_data_save() {
        $ar_tables = [self::$test_matrix_table];
        $response = v6_to_v7::reformat_matrix_data($ar_tables, true);

        $this->assertTrue($response->result);
        $this->assertEmpty($response->errors);

        $conn = DBi::_getConnection();
        $result = pg_query($conn, "SELECT data, string FROM " . self::$test_matrix_table . " WHERE id = 1");
        $row = pg_fetch_assoc($result);

        $this->assertNotNull($row['data']);
        $this->assertNotNull($row['string']);

        $string_data = json_decode($row['string']);
        $this->assertEquals('Sample Text Value', $string_data->dd544[0]->value);
    }

     /**
     * test_reformat_matrix_time_machine_data_save
     * Verifies that matrix data is correctly reformatted from v6 'datos' JSON to v7 columns.
     */
    public function test_reformat_matrix_time_machine_data_save() {
        $ar_tables = [self::$test_tm_table];
        $response = v6_to_v7::reformat_matrix_time_machine_data($ar_tables, true);

        $this->assertTrue($response->result);
        $this->assertEmpty($response->errors);

        $conn = DBi::_getConnection();
        $result = pg_query($conn, "SELECT data FROM " . self::$test_tm_table . " WHERE id = 1");
        $row = pg_fetch_assoc($result);

        $this->assertNotNull($row['data']);
    }

    public function test_get_value_type_map() {
        $map = v6_to_v7::get_value_type_map();
        $this->assertIsObject($map);
    }

    /**
     * test_remove_tm_created_sections
     * Verifies that temporary section-level records are removed from the Time Machine table.
     */
    public function test_remove_tm_created_sections() : void {
        $conn = DBi::_getConnection();
        // Insert a record that should be deleted (state != 'deleted')
        pg_query($conn, "INSERT INTO " . self::$test_tm_table . " (section_tipo, tipo, state) VALUES ('dd123', 'dd123', 'updated')");

        $result = v6_to_v7::remove_tm_created_sections();
        $this->assertTrue($result, "Removal of TM created sections should succeed");

        $res = pg_query($conn, "SELECT count(*) FROM " . self::$test_tm_table . " WHERE section_tipo = 'dd123' AND state = 'updated'");
        $this->assertEquals(0, pg_fetch_result($res, 0, 0), "Section-level 'updated' record should be removed");
    }

    /**
     * test_recreate_tm_table
     * Verifies that the Time Machine table is successfully extended with new v7 columns.
     * @depends test_remove_tm_created_sections
     */
    public function test_recreate_tm_table() : void {
        $result = v6_to_v7::recreate_tm_table();
        $this->assertTrue($result, "Recreation of TM table should succeed");

        $this->assertTrue(DBi::check_column_exists(self::$test_tm_table, 'user_id'), "Column user_id should exist");
        $this->assertTrue(DBi::check_column_exists(self::$test_tm_table, 'data'), "Column data should exist");
        $this->assertTrue(DBi::check_column_exists(self::$test_tm_table, 'bulk_process'), "Column bulk_process should exist");
    }

    /**
     * test_fill_new_columns_in_tm
     * Verifies that data is correctly backfilled into the new TM columns.
     * @depends test_recreate_tm_table
     */
    public function test_fill_new_columns_in_tm() : void {
        $conn = DBi::_getConnection();
        // Insert sample record in old format
        pg_query($conn, "INSERT INTO " . self::$test_tm_table . " (\"userID\", bulk_process_id, dato) VALUES ('99', 88, '{\"key\":\"val\"}')");

        $result = v6_to_v7::fill_new_columns_in_tm();
        $this->assertTrue($result, "Filling new columns in TM should succeed");

        $res = pg_query($conn, "SELECT user_id, data, bulk_process FROM " . self::$test_tm_table . " WHERE bulk_process_id = 88");
        $row = pg_fetch_assoc($res);

        $this->assertEquals('99', $row['user_id']);
        $this->assertEquals('{"key": "val"}', $row['data']);
        $this->assertEquals(88, $row['bulk_process']);
    }

    /**
     * test_delete_tm_columns
     * Verifies that obsolete columns are removed and others renamed correctly in the TM table.
     * @depends test_fill_new_columns_in_tm
     */
    public function test_delete_tm_columns() : void {
        $result = v6_to_v7::delete_tm_columns();
        $this->assertTrue($result, "Deletion of obsolete TM columns should succeed");

        $this->assertFalse(DBi::check_column_exists(self::$test_tm_table, 'userID'), "Obsolete userID column should be removed");
        $this->assertFalse(DBi::check_column_exists(self::$test_tm_table, 'dato'), "Obsolete dato column should be removed");
        $this->assertTrue(DBi::check_column_exists(self::$test_tm_table, 'bulk_process_id'), "bulk_process should be renamed to bulk_process_id");
    }

    /**
     * test_delete_v6_db_indexes
     * Verifies that legacy database indexes and functions are successfully removed.
     */
    public function test_delete_v6_db_indexes() {
        $result = v6_to_v7::delete_v6_db_indexes();
        $this->assertTrue($result, "Deletion of v6 DB indexes should succeed");
    }

    /**
     * test_rename_constraint
     * Verifies that primary key constraints are renamed to the new v7 naming convention.
     */
    public function test_rename_constraint() : void {
        $result = v6_to_v7::rename_constraint();
        $this->assertTrue($result, "Renaming of constraints should succeed");
    }

    /**
     * test_recreate_db_assets
     * Verifies that database assets (indexes, constraints, functions) are recreated without errors.
     */
    public function test_recreate_db_assets() {
        $response = v6_to_v7::recreate_db_assets();
        $this->assertIsObject($response, "recreate_db_assets should return an object");
        // Access constraints through result property
        $this->assertTrue($response->result->constraints, "recreate_db_assets constraints should be true");
    }



    public function test_reformat_matrix_time_machine_data_temporal() {

        $ar_tables = ['matrix_time_machine'];
        $response = v6_to_v7::reformat_matrix_time_machine_data($ar_tables, true);

       dump($response, ' response +++++++++++++++++++++++ // +++++++++++++++++++++++++ '.to_string());
    }

}
