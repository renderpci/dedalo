<?php declare(strict_types=1);
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';

use PHPUnit\Framework\Attributes\DataProvider;

/**
 * Test generated from core/component_date/samples/search.md
 */
final class component_date_Search_Test extends BaseTestCase {
    public static $model = 'component_date';

    #[DataProvider('search_samples_provider')]
    public function test_resolve_query_object_sql(array $input, array $expected, string $msg) {
        $this->user_login();
        
        $query_object = json_decode(json_encode($input));

        $result = component_date::resolve_query_object_sql($query_object);

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
                ["q" => "only_operator", "q_operator" => "!*", "path" => [["name" => "date", "model" => "component_date", "section_tipo" => "test3", "component_tipo" => "test145"]], "table_alias" => "te3", "table" => "matrix_test"],
                ["sentence" => "NOT (te3.date @? '$.test145[*]')"],
                'Case 1'
            ],
            '2. Operator * (Not Empty)' => [
                ["q" => "only_operator", "q_operator" => "*", "path" => [["name" => "date", "model" => "component_date", "section_tipo" => "test3", "component_tipo" => "test145"]], "table_alias" => "te3", "table" => "matrix_test"],
                ["sentence" => "(te3.date @? '$.test145[*]')"],
                'Case 2'
            ],
            '3. Operator >= (Greater or equal)' => [
                ["q" => "2024-01-01", "q_operator" => ">=", "path" => [["name" => "date", "model" => "component_date", "section_tipo" => "test3", "component_tipo" => "test145"]], "table_alias" => "te3", "table" => "matrix_test"],
                ["params" => ["_Q1_" => "$.test145[*] ? (@.start.time >= 65052979200)"], "sentence" => "te3.date @? (_Q1_)::jsonpath"],
                'Case 3'
            ],
            '4. Operator <= (Less or equal)' => [
                ["q" => "2024-01-01", "q_operator" => "<=", "path" => [["name" => "date", "model" => "component_date", "section_tipo" => "test3", "component_tipo" => "test145"]], "table_alias" => "te3", "table" => "matrix_test"],
                ["params" => ["_Q1_" => "$.test145[*] ? (@.start.time <= 65053065599)"], "sentence" => "te3.date @? (_Q1_)::jsonpath"],
                'Case 4'
            ],
            '5. Operator > (Greater than)' => [
                ["q" => "2024-01-01", "q_operator" => ">", "path" => [["name" => "date", "model" => "component_date", "section_tipo" => "test3", "component_tipo" => "test145"]], "table_alias" => "te3", "table" => "matrix_test"],
                ["params" => ["_Q1_" => "$.test145[*] ? (@.start.time > 65053065599)"], "sentence" => "te3.date @? (_Q1_)::jsonpath"],
                'Case 5'
            ],
            '6. Operator < (Less than)' => [
                ["q" => "2024-01-01", "q_operator" => "<", "path" => [["name" => "date", "model" => "component_date", "section_tipo" => "test3", "component_tipo" => "test145"]], "table_alias" => "te3", "table" => "matrix_test"],
                ["params" => ["_Q1_" => "$.test145[*] ? (@.start.time < 65052979200)"], "sentence" => "te3.date @? (_Q1_)::jsonpath"],
                'Case 6'
            ],
            '7. Default (Equals)' => [
                ["q" => "2024", "q_operator" => null, "path" => [["name" => "date", "model" => "component_date", "section_tipo" => "test3", "component_tipo" => "test145"]], "table_alias" => "te3", "table" => "matrix_test"],
                ["params" => ["_Q1_" => "$.test145[*] ? ((@.start.time <= 65052979200 && @.end.time >= 65052979200) || (@.start.time >= 65052979200 && @.start.time <= 65085119999))"], "sentence" => "te3.date @? (_Q1_)::jsonpath"],
                'Case 7'
            ]
        ];
    }
}
