<?php declare(strict_types=1);
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';

use PHPUnit\Framework\Attributes\DataProvider;

/**
 * Test generated from core/component_relation_children/samples/search.md
 */
final class component_relation_children_Search_Test extends BaseTestCase {
    public static $model = 'component_relation_children';

    #[DataProvider('search_samples_provider')]
    public function test_resolve_query_object_sql(array $input, array $expected, string $msg) {
        $this->user_login();
        
        $query_object = json_decode(json_encode($input));

        $result = component_relation_children::resolve_query_object_sql($query_object);

        $this->assertNotFalse($result, "Case failed: $msg");
        
        if (isset($expected['sentence'])) {
            // Normalize spaces for comparison
            $expected_sentence = preg_replace('/\s+/', ' ', trim($expected['sentence']));
            $result_sentence   = preg_replace('/\s+/', ' ', trim($result->sentence));
            $this->assertEquals($expected_sentence, $result_sentence, "Sentence mismatch in case: $msg");
        }
        
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
        
        $full_sql = "SELECT 1 FROM \"{$table}\" AS {$table_alias} WHERE ({$sql}) LIMIT 1";
        
        $db_result = matrix_db_manager::exec_search($full_sql, $params);
        
        $this->assertNotFalse($db_result, "SQL Execution failed for: $full_sql \n Case: $msg");
    }

    public static function search_samples_provider() : array {
        return [
            '1. Operator !* (Is Empty)' => [
                [
                    "q" => "only_operator",
                    "q_operator" => "!*",
                    "path" => [
                        [
                            "name" => "relation_children",
                            "model" => "component_relation_children",
                            "section_tipo" => "test3",
                            "component_tipo" => "test201"
                        ]
                    ],
                    "table_alias" => "te3",
                    "table" => "matrix_test"
                ],
                [
                    "params" => ["_Q1_" => "test71"],
                    "sentence" => "NOT EXISTS ( SELECT 1 FROM \"matrix_test\" AS sub CROSS JOIN LATERAL jsonb_array_elements( CASE WHEN jsonb_typeof(sub.relation->_Q1_) = 'array' THEN sub.relation->_Q1_ ELSE jsonb_build_array(sub.relation->_Q1_) END ) AS elem WHERE sub.relation ? _Q1_ AND elem->>'section_id' = te3.section_id::text )"
                ],
                'Case 1'
            ],
            '2. Operator * (Not Empty)' => [
                [
                    "q" => "only_operator",
                    "q_operator" => "*",
                    "path" => [
                        [
                            "name" => "relation_children",
                            "model" => "component_relation_children",
                            "section_tipo" => "test3",
                            "component_tipo" => "test201"
                        ]
                    ],
                    "table_alias" => "te3",
                    "table" => "matrix_test"
                ],
                [
                    "params" => ["_Q1_" => "test71"],
                    "sentence" => "EXISTS ( SELECT 1 FROM \"matrix_test\" AS sub CROSS JOIN LATERAL jsonb_array_elements( CASE WHEN jsonb_typeof(sub.relation->_Q1_) = 'array' THEN sub.relation->_Q1_ ELSE jsonb_build_array(sub.relation->_Q1_) END ) AS elem WHERE sub.relation ? _Q1_ AND elem->>'section_id' = te3.section_id::text )"
                ],
                'Case 2'
            ],
            '3. Operator == (Contain / Default)' => [
                [
                    "q" => ["section_id" => "51", "section_tipo" => "test_parent"],
                    "q_operator" => "==",
                    "path" => [
                        [
                            "name" => "relation_children",
                            "model" => "component_relation_children",
                            "section_tipo" => "test3",
                            "component_tipo" => "test201"
                        ]
                    ],
                    "table_alias" => "te3",
                    "table" => "matrix_test"
                ],
                [
                    "params" => ["_Q1_" => "test71", "_Q2_" => "{\"section_id\":\"51\",\"section_tipo\":\"test_parent\"}"],
                    "sentence" => "EXISTS ( SELECT 1 FROM \"matrix_test\" AS sub CROSS JOIN LATERAL jsonb_array_elements( CASE WHEN jsonb_typeof(sub.relation->_Q1_) = 'array' THEN sub.relation->_Q1_ ELSE jsonb_build_array(sub.relation->_Q1_) END ) AS elem WHERE sub.relation ? _Q1_ AND elem->>'section_id' = te3.section_id::text AND sub.section_id::text = (_Q2_::jsonb->>'section_id') AND sub.section_tipo = (_Q2_::jsonb->>'section_tipo') )"
                ],
                'Case 3'
            ],
            '4. Operator !=' => [
                [
                    "q" => ["section_id" => "51", "section_tipo" => "test_parent"],
                    "q_operator" => "!=",
                    "path" => [
                        [
                            "name" => "relation_children",
                            "model" => "component_relation_children",
                            "section_tipo" => "test3",
                            "component_tipo" => "test201"
                        ]
                    ],
                    "table_alias" => "te3",
                    "table" => "matrix_test"
                ],
                [
                    "params" => ["_Q1_" => "test71", "_Q2_" => "{\"section_id\":\"51\",\"section_tipo\":\"test_parent\"}"],
                    "sentence" => "EXISTS ( SELECT 1 FROM \"matrix_test\" AS sub CROSS JOIN LATERAL jsonb_array_elements( CASE WHEN jsonb_typeof(sub.relation->_Q1_) = 'array' THEN sub.relation->_Q1_ ELSE jsonb_build_array(sub.relation->_Q1_) END ) AS elem WHERE sub.relation ? _Q1_ AND elem->>'section_id' = te3.section_id::text ) AND NOT EXISTS ( SELECT 1 FROM \"matrix_test\" AS sub CROSS JOIN LATERAL jsonb_array_elements( CASE WHEN jsonb_typeof(sub.relation->_Q1_) = 'array' THEN sub.relation->_Q1_ ELSE jsonb_build_array(sub.relation->_Q1_) END ) AS elem WHERE sub.relation ? _Q1_ AND elem->>'section_id' = te3.section_id::text AND sub.section_id::text = (_Q2_::jsonb->>'section_id') AND sub.section_tipo = (_Q2_::jsonb->>'section_tipo') )"
                ],
                'Case 4'
            ],
            '5. Operator !==' => [
                [
                    "q" => ["section_id" => "51", "section_tipo" => "test_parent"],
                    "q_operator" => "!==",
                    "path" => [
                        [
                            "name" => "relation_children",
                            "model" => "component_relation_children",
                            "section_tipo" => "test3",
                            "component_tipo" => "test201"
                        ]
                    ],
                    "table_alias" => "te3",
                    "table" => "matrix_test"
                ],
                [
                    "params" => ["_Q1_" => "test71", "_Q2_" => "{\"section_id\":\"51\",\"section_tipo\":\"test_parent\"}"],
                    "sentence" => "NOT EXISTS ( SELECT 1 FROM \"matrix_test\" AS sub CROSS JOIN LATERAL jsonb_array_elements( CASE WHEN jsonb_typeof(sub.relation->_Q1_) = 'array' THEN sub.relation->_Q1_ ELSE jsonb_build_array(sub.relation->_Q1_) END ) AS elem WHERE sub.relation ? _Q1_ AND elem->>'section_id' = te3.section_id::text AND sub.section_id::text = (_Q2_::jsonb->>'section_id') AND sub.section_tipo = (_Q2_::jsonb->>'section_tipo') )"
                ],
                'Case 5'
            ]
        ];
    }
}
