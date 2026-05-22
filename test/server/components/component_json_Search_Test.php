<?php declare(strict_types=1);
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';

use PHPUnit\Framework\Attributes\DataProvider;

/**
 * Test generated from core/component_json/samples/search.md
 */
final class component_json_Search_Test extends BaseTestCase {
    public static $model = 'component_json';

    #[DataProvider('search_samples_provider')]
    public function test_resolve_query_object_sql(array $input, array $expected, string $msg) {
        $this->user_login();

        $query_object = json_decode(json_encode($input));

        $result = component_json::resolve_query_object_sql($query_object);

        $this->assertNotFalse($result, "Case failed: $msg");

        $expected_sentence = preg_replace('/\s+/', ' ', trim($expected['sentence']));
        $result_sentence   = preg_replace('/\s+/', ' ', trim($result->sentence));

        $this->assertEquals($expected_sentence, $result_sentence, "Sentence mismatch in case: $msg");

        if (isset($expected['params'])) {
            $this->assertEquals($expected['params'], (array)$result->params, "Params mismatch in case: $msg");
        }

        // Verify SQL execution
        $this->verify_sql_executable($result, $msg);
    }

    private function verify_sql_executable(object $result, string $msg) {
        $sql    = $result->sentence;
        $params = [];
        $params_counter = 1;

        foreach ($result->params ?? [] as $key => $value) {
            $placeholder = '$' . $params_counter++;
            $sql = str_replace($key, $placeholder, $sql);
            $params[] = $value;
        }

        $table       = $result->table;
        $table_alias = $result->table_alias;

        $full_sql = "SELECT 1 FROM {$table} AS {$table_alias} WHERE ({$sql}) LIMIT 1";

        $db_result = matrix_db_manager::exec_search($full_sql, $params);

        $this->assertNotFalse($db_result, "SQL Execution failed for: $full_sql \n Error: " . pg_last_error(DBi::_getConnection()) . "\n Case: $msg");
    }

    public static function search_samples_provider() : array {
        return [
            '1. Operator !* (Is Empty)' => [
                ["q" => "only_operator", "q_operator" => "!*", "path" => [["name" => "json", "model" => "component_json", "section_tipo" => "test3", "component_tipo" => "test18"]], "table_alias" => "te3", "table" => "matrix_test"],
                ["sentence" => "(te3.misc IS NULL OR NOT EXISTS ( SELECT 1 FROM jsonb_array_elements(te3.misc->'test18') AS elem WHERE elem->>'value' IS NOT NULL AND elem->>'value' != '' ) )"],
                'Case 1'
            ],
            '2. Operator * (Not Empty)' => [
                ["q" => "only_operator", "q_operator" => "*", "path" => [["name" => "json", "model" => "component_json", "section_tipo" => "test3", "component_tipo" => "test18"]], "table_alias" => "te3", "table" => "matrix_test"],
                ["sentence" => "(te3.misc @? (_Q1_)::jsonpath)", "params" => ["_Q1_" => "$.test18[*]"]],
                'Case 2'
            ],
            '3. Operator != (Different)' => [
                ["q" => "!=value1", "q_operator" => "!=", "path" => [["name" => "json", "model" => "component_json", "section_tipo" => "test3", "component_tipo" => "test18"]], "table_alias" => "te3", "table" => "matrix_test"],
                ["sentence" => "NOT (te3.misc @? (_Q1_)::jsonpath)", "params" => ["_Q1_" => "$.test18[*].value.** ? (@ like_regex \"value1\" flag \"i\")"]],
                'Case 3'
            ],
            '4. Operator == (Exactly Equal)' => [
                ["q" => "==value1", "q_operator" => "==", "path" => [["name" => "json", "model" => "component_json", "section_tipo" => "test3", "component_tipo" => "test18"]], "table_alias" => "te3", "table" => "matrix_test"],
                ["sentence" => "te3.misc @? (_Q1_)::jsonpath", "params" => ["_Q1_" => "$.test18[*].value ? (@ == \"value1\")"]],
                'Case 4'
            ],
            '5. Operator - (Not Contain)' => [
                ["q" => "-value1", "q_operator" => "-", "path" => [["name" => "json", "model" => "component_json", "section_tipo" => "test3", "component_tipo" => "test18"]], "table_alias" => "te3", "table" => "matrix_test"],
                ["sentence" => "NOT (te3.misc @? (_Q1_)::jsonpath)", "params" => ["_Q1_" => "$.test18[*].value.** ? (@ like_regex \"value1\" flag \"i\")"]],
                'Case 5'
            ],
            '6. Ends With (*text)' => [
                ["q" => "*value1", "q_operator" => null, "path" => [["name" => "json", "model" => "component_json", "section_tipo" => "test3", "component_tipo" => "test18"]], "table_alias" => "te3", "table" => "matrix_test"],
                ["sentence" => "te3.misc @? (_Q1_)::jsonpath", "params" => ["_Q1_" => "$.test18[*].value.** ? (@ like_regex \"value1$\" flag \"i\")"]],
                'Case 6'
            ],
            '7. Begins With (text*)' => [
                ["q" => "value1*", "q_operator" => null, "path" => [["name" => "json", "model" => "component_json", "section_tipo" => "test3", "component_tipo" => "test18"]], "table_alias" => "te3", "table" => "matrix_test"],
                ["sentence" => "te3.misc @? (_Q1_)::jsonpath", "params" => ["_Q1_" => "$.test18[*].value.** ? (@ like_regex \"^value1\" flag \"i\")"]],
                'Case 7'
            ],
            '8. Literal (\'text\')' => [
                ["q" => "'value1'", "q_operator" => null, "path" => [["name" => "json", "model" => "component_json", "section_tipo" => "test3", "component_tipo" => "test18"]], "table_alias" => "te3", "table" => "matrix_test"],
                ["sentence" => "te3.misc @? (_Q1_)::jsonpath", "params" => ["_Q1_" => "$.test18[*].value ? (@ == \"value1\")"]],
                'Case 8'
            ],
            '9. Duplicated (!!)' => [
                ["q" => "!!", "q_operator" => "!!", "path" => [["name" => "json", "model" => "component_json", "section_tipo" => "test3", "component_tipo" => "test18"]], "table_alias" => "te3", "table" => "matrix_test"],
                ["sentence" => "(te3.misc @? '$.test18[*]') AND EXISTS ( SELECT 1 FROM matrix_test AS m2, jsonb_path_query(m2.misc, '$.test18[*]') AS m2_elem, jsonb_path_query(te3.misc, '$.test18[*]') AS m1_elem WHERE m2.misc @? '$.test18[*]' AND m2.id != te3.id AND m2_elem->>'value' = m1_elem->>'value' )"],
                'Case 9'
            ],
            '10. Default (Contains)' => [
                ["q" => "value1", "q_operator" => null, "path" => [["name" => "json", "model" => "component_json", "section_tipo" => "test3", "component_tipo" => "test18"]], "table_alias" => "te3", "table" => "matrix_test"],
                ["sentence" => "te3.misc @? (_Q1_)::jsonpath", "params" => ["_Q1_" => "$.test18[*].value.** ? (@ like_regex \"value1\" flag \"i\")"]],
                'Case 10'
            ]
        ];
    }

    /**
     * TM column dd1574 is modeled as component_json but must resolve search SQL like component_input_text.
     */
    public function test_matrix_time_machine_dd1574_delegates_to_input_text_resolver() : void {
        $this->user_login();

        $alias = 'dd623_tm';
        $base    = [
            'q'          => 'needle',
            'q_operator' => null,
            'path'       => [[
                'name'            => 'value',
                'model'           => 'component_json',
                'section_tipo'    => 'dd623',
                'component_tipo'   => DEDALO_TIME_MACHINE_COLUMN_DATA,
            ]],
            'table_alias'=> $alias,
            'table'      => 'matrix_time_machine',
        ];

        $query_json = json_decode(json_encode($base));
        $query_text = json_decode(json_encode($base));

        $from_json = component_json::resolve_query_object_sql($query_json);
        $from_text = component_input_text::resolve_query_object_sql($query_text);

        $this->assertNotFalse($from_json);

        $this->assertSame('string', $from_json->type ?? null, 'TM dd1574 search should use string query type');

        $normalize_sentence = static function (string $s) : string {
            return preg_replace('/\s+/', ' ', trim($s));
        };

        $this->assertSame(
            $normalize_sentence((string)$from_text->sentence),
            $normalize_sentence((string)$from_json->sentence),
            'SQL sentence must match component_input_text resolver for TM data column'
        );
        $this->assertSame(
            (array)($from_text->params ?? []),
            (array)($from_json->params ?? [])
        );

        $this->assertStringContainsString("{$alias}.data", (string)$from_json->sentence);
    }
}
