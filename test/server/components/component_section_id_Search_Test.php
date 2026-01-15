<?php declare(strict_types=1);
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';

use PHPUnit\Framework\Attributes\DataProvider;

/**
 * Test generated from core/component_section_id/samples/search.md
 */
final class component_section_id_Search_Test extends BaseTestCase {
    public static $model = 'component_section_id';

    #[DataProvider('search_samples_provider')]
    public function test_resolve_query_object_sql(array $input, array $expected, string $msg) {
        $this->user_login();
        
        $query_object = json_decode(json_encode($input));

        $result = component_section_id::resolve_query_object_sql($query_object);

        $this->assertNotFalse($result, "Case failed: $msg");
        
        if (isset($expected['$and'])) {
            $this->assertObjectHasProperty('$and', $result, "Expected $and grouping in case: $msg");
            foreach ($expected['$and'] as $i => $exp_sub) {
                $res_sub = $result->{'$and'}[$i];
                $this->assertEquals($exp_sub['sentence'], $res_sub->sentence, "Sub-sentence $i mismatch in case: $msg");
                $this->assertEquals($exp_sub['params'], (array)$res_sub->params, "Sub-params $i mismatch in case: $msg");
            }
        } else {
            if (isset($expected['sentence'])) {
                $this->assertEquals($expected['sentence'], $result->sentence, "Sentence mismatch in case: $msg");
            }
            if (isset($expected['params'])) {
                $this->assertEquals($expected['params'], (array)$result->params, "Params mismatch in case: $msg");
            }
        }

        // Verify SQL execution
        $this->verify_sql_executable($result, $msg);
    }

    private function verify_sql_executable(object $result, string $msg) {
        
        if (isset($result->{'$and'})) {
            foreach ($result->{'$and'} as $sub) {
                $this->verify_sql_executable($sub, $msg . " (sub)");
            }
            return;
        }

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
        
        $this->assertNotFalse($db_result, "SQL Execution failed for: $full_sql \n Case: $msg");
    }

    public static function search_samples_provider() : array {
        return [
            '1. Equality' => [
                ["q" => "123", "q_operator" => null, "path" => [["name" => "section_id", "model" => "component_section_id", "section_tipo" => "test3", "component_tipo" => "test102"]], "table_alias" => "te3", "table" => "matrix_test"],
                ["sentence" => "te3.section_id::integer = _Q1_", "params" => ["_Q1_" => "123"]],
                'Case 1'
            ],
            '2. Between' => [
                ["q" => "100...200", "q_operator" => null, "path" => [["name" => "section_id", "model" => "component_section_id", "section_tipo" => "test3", "component_tipo" => "test102"]], "table_alias" => "te3", "table" => "matrix_test"],
                ["$and" => [
                    ["sentence" => "te3.section_id::integer >= _Q1_", "params" => ["_Q1_" => 100]],
                    ["sentence" => "te3.section_id::integer <= _Q1_", "params" => ["_Q1_" => 200]]
                ]],
                'Case 2'
            ],
            '3. Sequence' => [
                ["q" => "1,2,3", "q_operator" => null, "path" => [["name" => "section_id", "model" => "component_section_id", "section_tipo" => "test3", "component_tipo" => "test102"]], "table_alias" => "te3", "table" => "matrix_test"],
                ["sentence" => "te3.section_id::integer = ANY(_Q1_::integer[])", "params" => ["_Q1_" => "{1,2,3}"]],
                'Case 3'
            ],
            '4. Operator !=' => [
                ["q" => "123", "q_operator" => "!=", "path" => [["name" => "section_id", "model" => "component_section_id", "section_tipo" => "test3", "component_tipo" => "test102"]], "table_alias" => "te3", "table" => "matrix_test"],
                ["sentence" => "te3.section_id::integer != _Q1_", "params" => ["_Q1_" => "123"]],
                'Case 4'
            ],
            '5. Operator >=' => [
                ["q" => "50", "q_operator" => ">=", "path" => [["name" => "section_id", "model" => "component_section_id", "section_tipo" => "test3", "component_tipo" => "test102"]], "table_alias" => "te3", "table" => "matrix_test"],
                ["sentence" => "te3.section_id::integer >= _Q1_", "params" => ["_Q1_" => "50"]],
                'Case 5'
            ]
        ];
    }
}
