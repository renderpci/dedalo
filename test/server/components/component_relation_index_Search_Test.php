<?php declare(strict_types=1);
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';

use PHPUnit\Framework\Attributes\DataProvider;

/**
 * Test generated from core/component_relation_index/samples/search.md
 */
final class component_relation_index_Search_Test extends BaseTestCase {
    public static $model = 'component_relation_index';

    #[DataProvider('search_samples_provider')]
    public function test_resolve_query_object_sql(array $input, array $expected, string $msg) {
        $this->user_login();
        
        $query_object = json_decode(json_encode($input));

        $result = component_relation_index::resolve_query_object_sql($query_object);

        $this->assertNotFalse($result, "Case failed: $msg");
        
        // Result should always have a sentence
        $this->assertNotEmpty($result->sentence, "Expected sentence in result for case: $msg");

        if ($input['q_operator'] === '*') {
            // "Not empty" search
            $this->assertTrue(
                $result->sentence === "1=0" || str_contains($result->sentence, "section_id IN ("),
                "Sentence format mismatch for '*' case: {$result->sentence}"
            );
        } else if ($input['q_operator'] === '!*') {
            // "Empty" search
            $this->assertTrue(
                $result->sentence === "1=1" || str_contains($result->sentence, "section_id NOT IN ("),
                "Sentence format mismatch for '!*' case: {$result->sentence}"
            );
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
                ["q" => "only_operator", "q_operator" => "!*", "path" => [["name" => "relation_index", "model" => "component_relation_index", "section_tipo" => "test3", "component_tipo" => "test25"]], "table_alias" => "te3", "table" => "matrix_test"],
                [], // expected is now handled in test logic
                'Case 1'
            ],
            '2. Operator * (Not Empty)' => [
                ["q" => "only_operator", "q_operator" => "*", "path" => [["name" => "relation_index", "model" => "component_relation_index", "section_tipo" => "test3", "component_tipo" => "test25"]], "table_alias" => "te3", "table" => "matrix_test"],
                [], // expected is now handled in test logic
                'Case 2'
            ]
        ];
    }
}
