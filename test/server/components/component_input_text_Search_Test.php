<?php declare(strict_types=1);
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';

use PHPUnit\Framework\Attributes\DataProvider;

/**
 * Test generated from core/component_string_common/samples/search.md
 */
final class component_input_text_Search_Test extends BaseTestCase {
    public static $model = 'component_input_text';

    #[DataProvider('search_samples_provider')]
    public function test_resolve_query_object_sql(array $input, array $expected, string $msg) {
        $this->user_login();
        
        // Convert input array to object for the method
        $query_object = json_decode(json_encode($input));

        $result = component_input_text::resolve_query_object_sql($query_object);

        $this->assertNotFalse($result, "Case failed: $msg");
        
        // Normalize line breaks and spaces for comparison
        $expected_sentence = preg_replace('/\s+/', ' ', trim($expected['sentence']));
        $result_sentence   = preg_replace('/\s+/', ' ', trim($result->sentence));
        
        $this->assertEquals($expected_sentence, $result_sentence, "Sentence mismatch in case: $msg");
        
        if (isset($expected['params'])) {
            $this->assertEquals($expected['params'], (array)$result->params, "Params mismatch in case: $msg");
        }
        
        if (isset($expected['duplicated'])) {
            $this->assertEquals($expected['duplicated'], $result->duplicated, "Duplicated mismatch in case: $msg");
        }
        if (isset($expected['unaccent'])) {
            $this->assertEquals($expected['unaccent'], $result->unaccent, "Unaccent mismatch in case: $msg");
        }

        // Verify SQL execution
        $this->verify_sql_executable($result, $msg);
    }

    private function verify_sql_executable(object $result, string $msg) {
        $sql    = $result->sentence;
        $params = [];
        $params_counter = 1;
        
        // Ensure params are sorted or handled as in the trait
        // The trait uses foreach over the params array.
        foreach ($result->params ?? [] as $key => $value) {
            $placeholder = '$' . $params_counter++;
            $sql = str_replace($key, $placeholder, $sql);
            $params[] = $value;
        }
        
        $table       = $result->table;
        $table_alias = $result->table_alias;
        
        // In search, we usually have a section_tipo filter too.
        // For the dummy execution, we'll just check if the sentence is valid.
        $full_sql = "SELECT 1 FROM {$table} AS {$table_alias} WHERE ({$sql}) LIMIT 1";
        
        $db_result = matrix_db_manager::exec_search($full_sql, $params);
        
        $this->assertNotFalse($db_result, "SQL Execution failed for: $full_sql \n Error: " . pg_last_error(DBi::_getConnection()) . "\n Case: $msg");
    }

    public static function search_samples_provider() : array {
        return [
            '1. Operator !* (lang = all)' => [
                ["q" => [["value" => "!*"]], "q_operator" => null, "path" => [["name" => "input_text", "model" => "component_input_text", "section_tipo" => "test3", "component_tipo" => "test52"]], "q_split" => true, "type" => "jsonb", "table_alias" => "te3", "table" => "matrix_test", "component_path" => ["test52"], "lang" => "all"],
                ["params" => ["_Q1_" => "$.test52[*].value ? (@ != \"\" && @ != null)"], "sentence" => "(te3.string IS NULL OR NOT (te3.string @? (_Q1_)::jsonpath))"],
                'Case 1'
            ],
            '1b. Operator !* (lang = lg-eng)' => [
                ["q" => [["value" => "!*"]], "q_operator" => null, "path" => [["name" => "input_text", "model" => "component_input_text", "section_tipo" => "test3", "component_tipo" => "test52"]], "q_split" => true, "type" => "jsonb", "lang" => "lg-eng", "table_alias" => "te3", "table" => "matrix_test", "component_path" => ["test52"]],
                ["params" => ["_Q1_" => "$.test52[*] ? (@.lang == \"lg-eng\" && @.value != \"\" && @.value != null)"], "sentence" => "(te3.string IS NULL OR NOT (te3.string @? (_Q1_)::jsonpath))"],
                'Case 1b'
            ],
            '2. Operator * (lang = all)' => [
                ["q" => [["value" => "*"]], "q_operator" => null, "path" => [["name" => "input_text", "model" => "component_input_text", "section_tipo" => "test3", "component_tipo" => "test52"]], "q_split" => true, "type" => "jsonb", "table_alias" => "te3", "table" => "matrix_test", "component_path" => ["test52"], "lang" => "all"],
                ["params" => ["_Q1_" => "$.test52[*].value ? (@ != \"\" && @ != null)"], "sentence" => "te3.string @? (_Q1_)::jsonpath"],
                'Case 2'
            ],
            '2b. Operator * (lang = lg-eng)' => [
                ["q" => [["value" => "*"]], "q_operator" => null, "path" => [["name" => "input_text", "model" => "component_input_text", "section_tipo" => "test3", "component_tipo" => "test52"]], "q_split" => true, "type" => "jsonb", "lang" => "lg-eng", "table_alias" => "te3", "table" => "matrix_test", "component_path" => ["test52"]],
                ["params" => ["_Q1_" => "$.test52[*] ? (@.lang == \"lg-eng\" && @.value != \"\" && @.value != null)"], "sentence" => "te3.string @? (_Q1_)::jsonpath"],
                'Case 2b'
            ],
            '3. Operator != (lang = all)' => [
                ["q" => [["value" => "!=cat"]], "q_operator" => null, "path" => [["name" => "input_text", "model" => "component_input_text", "section_tipo" => "test3", "component_tipo" => "test52"]], "q_split" => true, "type" => "jsonb", "table_alias" => "te3", "table" => "matrix_test", "component_path" => ["test52"], "lang" => "all"],
                ["params" => ["_Q1_" => "cat"], "sentence" => "(te3.string @? '$.test52[*]') AND NOT EXISTS ( SELECT 1 FROM jsonb_path_query(te3.string, '$.test52[*]') AS elem WHERE f_unaccent(elem->>'value') = f_unaccent(_Q1_) )"],
                'Case 3'
            ],
            '3b. Operator != (lang = lg-eng)' => [
                ["q" => [["value" => "!=cat"]], "q_operator" => null, "path" => [["name" => "input_text", "model" => "component_input_text", "section_tipo" => "test3", "component_tipo" => "test52"]], "q_split" => true, "type" => "jsonb", "lang" => "lg-eng", "table_alias" => "te3", "table" => "matrix_test", "component_path" => ["test52"]],
                ["params" => ["_Q1_" => "cat"], "sentence" => "(te3.string @? '$.test52[*] ? (@.lang == \"lg-eng\")') AND NOT EXISTS ( SELECT 1 FROM jsonb_path_query(te3.string, '$.test52[*] ? (@.lang == \"lg-eng\")') AS elem WHERE f_unaccent(elem->>'value') = f_unaccent(_Q1_) )"],
                'Case 3b'
            ],
            '4. Operator == (lang = all)' => [
                ["q" => [["value" => "==cat"]], "q_operator" => null, "path" => [["name" => "input_text", "model" => "component_input_text", "section_tipo" => "test3", "component_tipo" => "test52"]], "q_split" => true, "type" => "jsonb", "table_alias" => "te3", "table" => "matrix_test", "component_path" => ["test52"], "lang" => "all"],
                ["params" => ["_Q1_" => "cat"], "sentence" => "(te3.string @? '$.test52[*]') AND EXISTS ( SELECT 1 FROM jsonb_path_query(te3.string, '$.test52[*]') AS elem WHERE f_unaccent(elem->>'value') = f_unaccent(_Q1_) )"],
                'Case 4'
            ],
            '4b. Operator == (lang = lg-eng)' => [
                ["q" => [["value" => "==cat"]], "q_operator" => null, "path" => [["name" => "input_text", "model" => "component_input_text", "section_tipo" => "test3", "component_tipo" => "test52"]], "q_split" => true, "type" => "jsonb", "lang" => "lg-eng", "table_alias" => "te3", "table" => "matrix_test", "component_path" => ["test52"]],
                ["params" => ["_Q1_" => "cat"], "sentence" => "(te3.string @? '$.test52[*] ? (@.lang == \"lg-eng\")') AND EXISTS ( SELECT 1 FROM jsonb_path_query(te3.string, '$.test52[*] ? (@.lang == \"lg-eng\")') AS elem WHERE f_unaccent(elem->>'value') = f_unaccent(_Q1_) )"],
                'Case 4b'
            ],
            '5. Operator - (lang = all)' => [
                ["q" => [["value" => "-cat"]], "q_operator" => null, "path" => [["name" => "input_text", "model" => "component_input_text", "section_tipo" => "test3", "component_tipo" => "test52"]], "q_split" => true, "type" => "jsonb", "table_alias" => "te3", "table" => "matrix_test", "component_path" => ["test52"], "lang" => "all"],
                ["params" => ["_Q1_" => "cat"], "sentence" => "NOT EXISTS ( SELECT 1 FROM jsonb_path_query(te3.string, '$.test52[*]') AS elem WHERE elem->>'value' IS NOT NULL AND f_unaccent(elem->>'value') ~* f_unaccent(_Q1_) )"],
                'Case 5'
            ],
            '5b. Operator - (lang = lg-eng)' => [
                ["q" => [["value" => "-cat"]], "q_operator" => null, "path" => [["name" => "input_text", "model" => "component_input_text", "section_tipo" => "test3", "component_tipo" => "test52"]], "q_split" => true, "type" => "jsonb", "lang" => "lg-eng", "table_alias" => "te3", "table" => "matrix_test", "component_path" => ["test52"]],
                ["params" => ["_Q1_" => "cat"], "sentence" => "NOT EXISTS ( SELECT 1 FROM jsonb_path_query(te3.string, '$.test52[*]') AS elem WHERE elem->>'value' IS NOT NULL AND f_unaccent(elem->>'value') ~* f_unaccent(_Q1_) AND elem->>'lang' = 'lg-eng' )"],
                'Case 5b'
            ],
            '6. Ends With (*cat) (lang = all)' => [
                ["q" => [["value" => "*cat"]], "q_operator" => null, "path" => [["name" => "input_text", "model" => "component_input_text", "section_tipo" => "test3", "component_tipo" => "test52"]], "q_split" => true, "type" => "jsonb", "table_alias" => "te3", "table" => "matrix_test", "component_path" => ["test52"], "lang" => "all"],
                ["params" => ["_Q1_" => "cat"], "sentence" => "(te3.string @? '$.test52[*]') AND EXISTS ( SELECT 1 FROM jsonb_path_query(te3.string, '$.test52[*]') AS elem WHERE f_unaccent(elem->>'value') ~* (f_unaccent(_Q1_) || '$') )"],
                'Case 6'
            ],
            '6b. Ends With (*cat) (lang = lg-eng)' => [
                ["q" => [["value" => "*cat"]], "q_operator" => null, "path" => [["name" => "input_text", "model" => "component_input_text", "section_tipo" => "test3", "component_tipo" => "test52"]], "q_split" => true, "type" => "jsonb", "lang" => "lg-eng", "table_alias" => "te3", "table" => "matrix_test", "component_path" => ["test52"]],
                ["params" => ["_Q1_" => "cat"], "sentence" => "(te3.string @? '$.test52[*] ? (@.lang == \"lg-eng\")') AND EXISTS ( SELECT 1 FROM jsonb_path_query(te3.string, '$.test52[*] ? (@.lang == \"lg-eng\")') AS elem WHERE f_unaccent(elem->>'value') ~* (f_unaccent(_Q1_) || '$') )"],
                'Case 6b'
            ],
            '7. Begins With (cat*) (lang = all)' => [
                ["q" => [["value" => "cat*"]], "q_operator" => null, "path" => [["name" => "input_text", "model" => "component_input_text", "section_tipo" => "test3", "component_tipo" => "test52"]], "q_split" => true, "type" => "jsonb", "table_alias" => "te3", "table" => "matrix_test", "component_path" => ["test52"], "lang" => "all"],
                ["params" => ["_Q1_" => "cat"], "sentence" => "(te3.string @? '$.test52[*]') AND EXISTS ( SELECT 1 FROM jsonb_path_query(te3.string, '$.test52[*]') AS elem WHERE f_unaccent(elem->>'value') ~* ('^' || f_unaccent(_Q1_)) )"],
                'Case 7'
            ],
            '7b. Begins With (cat*) (lang = lg-eng)' => [
                ["q" => [["value" => "cat*"]], "q_operator" => null, "path" => [["name" => "input_text", "model" => "component_input_text", "section_tipo" => "test3", "component_tipo" => "test52"]], "q_split" => true, "type" => "jsonb", "lang" => "lg-eng", "table_alias" => "te3", "table" => "matrix_test", "component_path" => ["test52"]],
                ["params" => ["_Q1_" => "cat"], "sentence" => "(te3.string @? '$.test52[*] ? (@.lang == \"lg-eng\")') AND EXISTS ( SELECT 1 FROM jsonb_path_query(te3.string, '$.test52[*] ? (@.lang == \"lg-eng\")') AS elem WHERE f_unaccent(elem->>'value') ~* ('^' || f_unaccent(_Q1_)) )"],
                'Case 7b'
            ],
            '8. Literal (\'cat\') (lang = all)' => [
                ["q" => [["value" => "'cat'"]], "q_operator" => null, "path" => [["name" => "input_text", "model" => "component_input_text", "section_tipo" => "test3", "component_tipo" => "test52"]], "q_split" => true, "type" => "jsonb", "table_alias" => "te3", "table" => "matrix_test", "component_path" => ["test52"], "lang" => "all"],
                ["params" => ["_Q1_" => "cat"], "sentence" => "(te3.string @? '$.test52[*]') AND EXISTS ( SELECT 1 FROM jsonb_path_query(te3.string, '$.test52[*]') AS elem WHERE f_unaccent(elem->>'value') = f_unaccent(_Q1_) )"],
                'Case 8'
            ],
            '8b. Literal (\'cat\') (lang = lg-eng)' => [
                ["q" => [["value" => "'cat'"]], "q_operator" => null, "path" => [["name" => "input_text", "model" => "component_input_text", "section_tipo" => "test3", "component_tipo" => "test52"]], "q_split" => true, "type" => "jsonb", "lang" => "lg-eng", "table_alias" => "te3", "table" => "matrix_test", "component_path" => ["test52"]],
                ["params" => ["_Q1_" => "cat"], "sentence" => "(te3.string @? '$.test52[*] ? (@.lang == \"lg-eng\")') AND EXISTS ( SELECT 1 FROM jsonb_path_query(te3.string, '$.test52[*] ? (@.lang == \"lg-eng\")') AS elem WHERE f_unaccent(elem->>'value') = f_unaccent(_Q1_) )"],
                'Case 8b'
            ],
            '9. Duplicated (!!) (lang = all)' => [
                ["q" => [["value" => "!!"]], "q_operator" => null, "path" => [["name" => "input_text", "model" => "component_input_text", "section_tipo" => "test3", "component_tipo" => "test52"]], "q_split" => true, "type" => "jsonb", "table_alias" => "te3", "table" => "matrix_test", "component_path" => ["test52"], "lang" => "all"],
                ["duplicated" => true, "unaccent" => true, "sentence" => "(te3.string @? '$.test52[*]') AND EXISTS ( SELECT 1 FROM matrix_test AS m2, jsonb_path_query(m2.string, '$.test52[*]') AS m2_elem, jsonb_path_query(te3.string, '$.test52[*]') AS m1_elem WHERE m2.string @? '$.test52[*]' AND m2.section_id != te3.section_id AND m2.section_tipo = te3.section_tipo AND f_unaccent(m2_elem->>'value') = f_unaccent(m1_elem->>'value') )"],
                'Case 9'
            ],
            '9b. Duplicated (!!) (lang = lg-eng)' => [
                ["q" => [["value" => "!!"]], "q_operator" => null, "path" => [["name" => "input_text", "model" => "component_input_text", "section_tipo" => "test3", "component_tipo" => "test52"]], "q_split" => true, "type" => "jsonb", "lang" => "lg-eng", "table_alias" => "te3", "table" => "matrix_test", "component_path" => ["test52"]],
                ["duplicated" => true, "unaccent" => true, "sentence" => "(te3.string @? '$.test52[*] ? (@.lang == \"lg-eng\")') AND EXISTS ( SELECT 1 FROM matrix_test AS m2, jsonb_path_query(m2.string, '$.test52[*] ? (@.lang == \"lg-eng\")') AS m2_elem, jsonb_path_query(te3.string, '$.test52[*] ? (@.lang == \"lg-eng\")') AS m1_elem WHERE m2.string @? '$.test52[*] ? (@.lang == \"lg-eng\")' AND m2.section_id != te3.section_id AND m2.section_tipo = te3.section_tipo AND f_unaccent(m2_elem->>'value') = f_unaccent(m1_elem->>'value') )"],
                'Case 9b'
            ],
            '10. Default (Contains) (lang = all)' => [
                ["q" => [["value" => "cat"]], "q_operator" => null, "path" => [["name" => "input_text", "model" => "component_input_text", "section_tipo" => "test3", "component_tipo" => "test52"]], "q_split" => true, "type" => "jsonb", "table_alias" => "te3", "table" => "matrix_test", "component_path" => ["test52"], "lang" => "all"],
                ["params" => ["_Q1_" => "cat"], "sentence" => "(te3.string @? '$.test52[*]') AND EXISTS ( SELECT 1 FROM jsonb_path_query(te3.string, '$.test52[*]') AS elem WHERE f_unaccent(elem->>'value') ~* f_unaccent(_Q1_) )"],
                'Case 10'
            ],
            '10b. Default (Contains) (lang = lg-eng)' => [
                ["q" => [["value" => "cat"]], "q_operator" => null, "path" => [["name" => "input_text", "model" => "component_input_text", "section_tipo" => "test3", "component_tipo" => "test52"]], "q_split" => true, "type" => "jsonb", "lang" => "lg-eng", "table_alias" => "te3", "table" => "matrix_test", "component_path" => ["test52"]],
                ["params" => ["_Q1_" => "cat"], "sentence" => "(te3.string @? '$.test52[*] ? (@.lang == \"lg-eng\")') AND EXISTS ( SELECT 1 FROM jsonb_path_query(te3.string, '$.test52[*] ? (@.lang == \"lg-eng\")') AS elem WHERE f_unaccent(elem->>'value') ~* f_unaccent(_Q1_) )"],
                'Case 10b'
            ]
        ];
    }
}
