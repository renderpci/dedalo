<?php declare(strict_types=1);
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';

use PHPUnit\Framework\Attributes\DataProvider;

/**
 * Test generated from core/component_iri/samples/search.md
 */
final class component_iri_Search_Test extends BaseTestCase {
    public static $model = 'component_iri';

    #[DataProvider('search_samples_provider')]
    public function test_resolve_query_object_sql(array $input, array $expected, string $msg) {
        $this->user_login();
        
        $query_object = json_decode(json_encode($input));

        $result = component_iri::resolve_query_object_sql($query_object);

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
            '1. Operator !* (Is Empty) (lang = all)' => [
                ["q" => [["value" => "!*"]], "q_operator" => null, "path" => [["name" => "iri", "model" => "component_iri", "section_tipo" => "test3", "component_tipo" => "test140"]], "table_alias" => "te3", "table" => "matrix_test", "lang" => "all"],
                ["params" => ["_Q1_" => "$.test140[*].iri ? (@ != \"\" && @ != null)"], "sentence" => "(te3.iri IS NULL OR NOT (te3.iri @? (_Q1_)::jsonpath))"],
                'Case 1'
            ],
            '1b. Operator !* (Is Empty) (lang = lg-eng)' => [
                ["q" => [["value" => "!*"]], "q_operator" => null, "path" => [["name" => "iri", "model" => "component_iri", "section_tipo" => "test3", "component_tipo" => "test140"]], "table_alias" => "te3", "table" => "matrix_test", "lang" => "lg-eng"],
                ["params" => ["_Q1_" => "$.test140[*] ? (@.lang == \"lg-eng\" && @.iri != \"\" && @.iri != null)"], "sentence" => "(te3.iri IS NULL OR NOT (te3.iri @? (_Q1_)::jsonpath))"],
                'Case 1b'
            ],
            '2. Operator * (Not Empty) (lang = all)' => [
                ["q" => [["value" => "*"]], "q_operator" => null, "path" => [["name" => "iri", "model" => "component_iri", "section_tipo" => "test3", "component_tipo" => "test140"]], "table_alias" => "te3", "table" => "matrix_test", "lang" => "all"],
                ["params" => ["_Q1_" => "$.test140[*].iri ? (@ != \"\" && @ != null)"], "sentence" => "te3.iri @? (_Q1_)::jsonpath"],
                'Case 2'
            ],
            '3. Operator != (Is Different) (lang = all)' => [
                ["q" => [["value" => "!=http://example.org"]], "q_operator" => null, "path" => [["name" => "iri", "model" => "component_iri", "section_tipo" => "test3", "component_tipo" => "test140"]], "table_alias" => "te3", "table" => "matrix_test", "lang" => "all"],
                ["params" => ["_Q1_" => "http://example.org"], "sentence" => "(te3.iri @? '$.test140[*]') AND NOT EXISTS ( SELECT 1 FROM jsonb_path_query(te3.iri, '$.test140[*]') AS elem WHERE f_unaccent(elem->>'iri') = f_unaccent(_Q1_) )"],
                'Case 3'
            ],
            '4. Operator - (Does Not Contain) (lang = all)' => [
                ["q" => [["value" => "-example"]], "q_operator" => null, "path" => [["name" => "iri", "model" => "component_iri", "section_tipo" => "test3", "component_tipo" => "test140"]], "table_alias" => "te3", "table" => "matrix_test", "lang" => "all"],
                ["params" => ["_Q1_" => "example"], "sentence" => "NOT EXISTS ( SELECT 1 FROM jsonb_path_query(te3.iri, '$.test140[*]') AS elem WHERE elem->>'iri' IS NOT NULL AND f_unaccent(elem->>'iri') ~* f_unaccent(_Q1_) )"],
                'Case 4'
            ],
            '5. Operator = (Similar To) (lang = all)' => [
                ["q" => [["value" => "=example"]], "q_operator" => null, "path" => [["name" => "iri", "model" => "component_iri", "section_tipo" => "test3", "component_tipo" => "test140"]], "table_alias" => "te3", "table" => "matrix_test", "lang" => "all"],
                ["params" => ["_Q1_" => "example"], "sentence" => "(te3.iri @? '$.test140[*]') AND EXISTS ( SELECT 1 FROM jsonb_path_query(te3.iri, '$.test140[*]') AS elem WHERE f_unaccent(elem->>'iri') ~* f_unaccent(_Q1_) )"],
                'Case 5'
            ],
            '6. Begins With (text*) (lang = all)' => [
                ["q" => [["value" => "http*"]], "q_operator" => null, "path" => [["name" => "iri", "model" => "component_iri", "section_tipo" => "test3", "component_tipo" => "test140"]], "table_alias" => "te3", "table" => "matrix_test", "lang" => "all"],
                ["params" => ["_Q1_" => "http"], "sentence" => "(te3.iri @? '$.test140[*]') AND EXISTS ( SELECT 1 FROM jsonb_path_query(te3.iri, '$.test140[*]') AS elem WHERE f_unaccent(elem->>'iri') ~* ('^' || f_unaccent(_Q1_)) )"],
                'Case 6'
            ],
            '7. Ends With (*text) (lang = all)' => [
                ["q" => [["value" => "*.org"]], "q_operator" => null, "path" => [["name" => "iri", "model" => "component_iri", "section_tipo" => "test3", "component_tipo" => "test140"]], "table_alias" => "te3", "table" => "matrix_test", "lang" => "all"],
                ["params" => ["_Q1_" => ".org"], "sentence" => "(te3.iri @? '$.test140[*]') AND EXISTS ( SELECT 1 FROM jsonb_path_query(te3.iri, '$.test140[*]') AS elem WHERE f_unaccent(elem->>'iri') ~* (f_unaccent(_Q1_) || '$') )"],
                'Case 7'
            ],
            '8. Literal (\'text\') (lang = all)' => [
                ["q" => [["value" => "'http://example.org'"]], "q_operator" => null, "path" => [["name" => "iri", "model" => "component_iri", "section_tipo" => "test3", "component_tipo" => "test140"]], "table_alias" => "te3", "table" => "matrix_test", "lang" => "all"],
                ["params" => ["_Q1_" => "http://example.org"], "sentence" => "(te3.iri @? '$.test140[*]') AND EXISTS ( SELECT 1 FROM jsonb_path_query(te3.iri, '$.test140[*]') AS elem WHERE f_unaccent(elem->>'iri') = f_unaccent(_Q1_) )"],
                'Case 8'
            ],
            '9. Default (Contains) (lang = all)' => [
                ["q" => [["value" => "example"]], "q_operator" => null, "path" => [["name" => "iri", "model" => "component_iri", "section_tipo" => "test3", "component_tipo" => "test140"]], "table_alias" => "te3", "table" => "matrix_test", "lang" => "all"],
                ["params" => ["_Q1_" => "example"], "sentence" => "(te3.iri @? '$.test140[*]') AND EXISTS ( SELECT 1 FROM jsonb_path_query(te3.iri, '$.test140[*]') AS elem WHERE f_unaccent(elem->>'iri') ~* f_unaccent(_Q1_) )"],
                'Case 9'
            ]
        ];
    }
}
