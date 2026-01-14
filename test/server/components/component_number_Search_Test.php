<?php declare(strict_types=1);
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';

use PHPUnit\Framework\Attributes\DataProvider;

/**
 * Test generated from core/component_number/samples/search.md
 */
final class component_number_Search_Test extends BaseTestCase {
    public static $model = 'component_number';

    #[DataProvider('search_samples_provider')]
    public function test_resolve_query_object_sql(array $input, array $expected, string $msg) {
        $this->user_login();
        
        $query_object = json_decode(json_encode($input));

        $result = component_number::resolve_query_object_sql($query_object);

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
                ["q" => "only_operator", "q_operator" => "!*", "path" => [["name" => "number", "model" => "component_number", "section_tipo" => "test3", "component_tipo" => "test211"]], "table_alias" => "te3", "table" => "matrix_test"],
                ["sentence" => "(te3.number->'test211' IS NULL OR NOT te3.number @? (_Q1_)::jsonpath)", "params" => ["_Q1_" => "$.test211[*] ? (@.value != null)"]],
                'Case 1'
            ],
            '2. Operator * (Not Empty)' => [
                ["q" => "only_operator", "q_operator" => "*", "path" => [["name" => "number", "model" => "component_number", "section_tipo" => "test3", "component_tipo" => "test211"]], "table_alias" => "te3", "table" => "matrix_test"],
                ["sentence" => "te3.number @? (_Q1_)::jsonpath", "params" => ["_Q1_" => "$.test211[*].value ? (@ != null)"]],
                'Case 2'
            ],
            '3. Between (value1...value2)' => [
                ["q" => "10...20", "q_operator" => null, "path" => [["name" => "number", "model" => "component_number", "section_tipo" => "test3", "component_tipo" => "test211"]], "table_alias" => "te3", "table" => "matrix_test"],
                ["sentence" => "(te3.number @? '$.test211[*]') AND EXISTS ( SELECT 1 FROM jsonb_array_elements(te3.number->'test211') AS elem WHERE (elem->>'value')::numeric >= (_Q1_)::numeric AND (elem->>'value')::numeric <= (_Q2_)::numeric )", "params" => ["_Q1_" => "10", "_Q2_" => "20"]],
                'Case 3'
            ],
            '4. Operator >= (Bigger or Equal)' => [
                ["q" => "15", "q_operator" => ">=", "path" => [["name" => "number", "model" => "component_number", "section_tipo" => "test3", "component_tipo" => "test211"]], "table_alias" => "te3", "table" => "matrix_test"],
                ["sentence" => "(te3.number @? '$.test211[*]') AND EXISTS ( SELECT 1 FROM jsonb_array_elements(te3.number->'test211') AS elem WHERE (elem->>'value')::numeric >= (_Q1_)::numeric )", "params" => ["_Q1_" => "15"]],
                'Case 4'
            ],
            '5. Operator <= (Smaller or Equal)' => [
                ["q" => "15", "q_operator" => "<=", "path" => [["name" => "number", "model" => "component_number", "section_tipo" => "test3", "component_tipo" => "test211"]], "table_alias" => "te3", "table" => "matrix_test"],
                ["sentence" => "(te3.number @? '$.test211[*]') AND EXISTS ( SELECT 1 FROM jsonb_array_elements(te3.number->'test211') AS elem WHERE (elem->>'value')::numeric <= (_Q1_)::numeric )", "params" => ["_Q1_" => "15"]],
                'Case 5'
            ],
            '6. Operator > (Bigger Than)' => [
                ["q" => "15", "q_operator" => ">", "path" => [["name" => "number", "model" => "component_number", "section_tipo" => "test3", "component_tipo" => "test211"]], "table_alias" => "te3", "table" => "matrix_test"],
                ["sentence" => "(te3.number @? '$.test211[*]') AND EXISTS ( SELECT 1 FROM jsonb_array_elements(te3.number->'test211') AS elem WHERE (elem->>'value')::numeric > (_Q1_)::numeric )", "params" => ["_Q1_" => "15"]],
                'Case 6'
            ],
            '7. Operator < (Smaller Than)' => [
                ["q" => "15", "q_operator" => "<", "path" => [["name" => "number", "model" => "component_number", "section_tipo" => "test3", "component_tipo" => "test211"]], "table_alias" => "te3", "table" => "matrix_test"],
                ["sentence" => "(te3.number @? '$.test211[*]') AND EXISTS ( SELECT 1 FROM jsonb_array_elements(te3.number->'test211') AS elem WHERE (elem->>'value')::numeric < (_Q1_)::numeric )", "params" => ["_Q1_" => "15"]],
                'Case 7'
            ],
            '8. Equality (Default)' => [
                ["q" => "42", "q_operator" => null, "path" => [["name" => "number", "model" => "component_number", "section_tipo" => "test3", "component_tipo" => "test211"]], "table_alias" => "te3", "table" => "matrix_test"],
                ["sentence" => "(te3.number @? '$.test211[*]') AND EXISTS ( SELECT 1 FROM jsonb_array_elements(te3.number->'test211') AS elem WHERE (elem->>'value')::numeric = (_Q1_)::numeric )", "params" => ["_Q1_" => "42"]],
                'Case 8'
            ]
        ];
    }
}
