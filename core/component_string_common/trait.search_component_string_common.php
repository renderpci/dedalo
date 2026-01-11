<?php declare(strict_types=1);
/**
* TRAIT SEARCH_COMPONENT_STRING_COMMON
* From class component_string_common
* Common search methods for string components
*/
trait search_component_string_common {


    
    /**
    * RESOLVE_QUERY_OBJECT_SQL
    * @param object $query_object
    * sample:
    * {
    *    "q": [
    *        "Raurich Pérez"
    *    ],
    *    "q_operator": null,
    *    "path": [
    *        {
    *            "name": "Surname",
    *            "model": "component_input_text",
    *            "section_tipo": "rsc197",
    *            "component_tipo": "rsc86"
    *        }
    *    ],
    *    "q_split": true,
    *    "type": "jsonb",
    *    "component_path": ["rsc86"],
    *    "lang": "all"
    * }
    * @return object|false $query_object
    * Edited/parsed version of received object
    */
    public static function resolve_query_object_sql(object $query_object) : object|false {

        // $q
        // Note that $query_object->q v6 is array (before was string) but only one element is expected. So select the first one
        $q = isset($query_object->q) && is_array($query_object->q) 
            ? $query_object->q[0] 
            : $query_object->q;
        if ( (empty($q) || empty($q->value) ) && empty($query_object->q_operator)) {
            return false;
        }

        // fallback to emprty string in case of invalid or null q
        $q = (is_object($q) ? $q->value : $q) ?? '';

        // split q case
        $q_split = $query_object->q_split ?? false;
        if ($q_split===true && !search::is_literal($q)) {

            // Join operators with next word (remove space)
            // Operators: !=, ==, =, -, !!, !*
            $q = preg_replace('/(\!=|==|!!|!*|=|-)\s+/', '$1', $q);
            // Join wildcard at the end (remove space before wildcard)
            $q = preg_replace('/\s+(\*)/', '$1', $q);

            $q_items = preg_split('/\s/', $q);
            if (count($q_items)>1) {
                return self::handle_query_splitting($query_object, $q_items, '$and');
            }
        }

        // normalize q (remove slashes if any)
        $q = stripslashes($q);

        // Validate path and calculate translatable
        if (empty($query_object->path) || !is_array($query_object->path)) {
            debug_log(__METHOD__
                . " Invalid component path " . PHP_EOL
                . ' $query_object->path: ' . to_string($query_object->path)
                , logger::ERROR
            );
            return false;
        }
        $path_end = end($query_object->path);
        $component_tipo = $path_end->component_tipo;
        $translatable = ontology_node::get_translatable($component_tipo);

        // column
        $column = section_record_data::get_column_name( get_called_class() );

        // table_alias
        $table_alias = $query_object->table_alias;

        // table
        $table = $query_object->table;

        // q_operator. Search component do not use a 'q_operator' but for compatibility with
        // any search call, it is added here and is accepted too.
        $q_operator = $query_object->q_operator ?? null;

        // type. Always set fixed values
        $query_object->type = 'string';

        // lang
        $query_object->lang = $query_object->lang ?? DEDALO_DATA_LANG;

        switch (true) {

            // EMPTY VALUE (!*)
            // Matches records where the component key is missing or all its values are empty/null.
            // Scoped by the requested language if not 'all'.
            case ($q==='!*'):
                $query_object->params = [
                    '_Q1_' => $query_object->lang==='all'
                        ? "$.{$component_tipo}[*].value ? (@ != \"\" && @ != null)"
                        : "$.{$component_tipo}[*] ? (@.lang == \"{$query_object->lang}\" && @.value != \"\" && @.value != null)"
                ];
                $query_object->sentence = "NOT ({$table_alias}.{$column} @? (_Q1_)::jsonpath)";
                break;

            // NOT EMPTY (*)
            // Matches records where the component key exists and has at least one non-empty/non-null value.
            // Scoped by the requested language if not 'all'.
            case ($q==='*'):
                $query_object->params = [
                    '_Q1_' => $query_object->lang==='all'
                        ? "$.{$component_tipo}[*].value ? (@ != \"\" && @ != null)"
                        : "$.{$component_tipo}[*] ? (@.lang == \"{$query_object->lang}\" && @.value != \"\" && @.value != null)"
                ];
                $query_object->sentence = "{$table_alias}.{$column} @? (_Q1_)::jsonpath";
                break;

            // IS DIFFERENT (!=)
            // Matches records where NO value matches the given term (case and accent insensitive).
            // Supports wildcards: *text* (contains), text* (begins with), *text (ends with).
            case (strpos($q, '!=')===0 || $q_operator==='!='):
                $q_clean = trim(str_replace('!=', '', $q));
                $query_object->params = ['_Q1_' => str_replace('*', '', $q_clean)];

                $json_path = ($query_object->lang === 'all')
                    ? "$.{$component_tipo}[*]"
                    : "$.{$component_tipo}[*] ? (@.lang == \"{$query_object->lang}\")";

                $first_char = mb_substr($q_clean, 0, 1);
                $last_char  = mb_substr($q_clean, -1);

                // Determine matching logic based on wildcards
                $match_logic = '';
                switch (true) {
                    case ($first_char==='*' && $last_char==='*'):
                        $match_logic = 'f_unaccent(elem->>\'value\') ~* f_unaccent(_Q1_)';
                        break;
                    case ($first_char==='*'):
                        $match_logic = 'f_unaccent(elem->>\'value\') ~* (f_unaccent(_Q1_) || \'$\')';
                        break;
                    case ($last_char==='*'):
                        $match_logic = 'f_unaccent(elem->>\'value\') ~* (\'^\' || f_unaccent(_Q1_))';
                        break;
                    default:
                        $match_logic = 'f_unaccent(elem->>\'value\') = f_unaccent(_Q1_)';
                        break;
                }

                // Sentence: Ensure NO element matches the specified criteria
                $query_object->sentence = "({$table_alias}.{$column} @? '{$json_path}') AND NOT EXISTS (".PHP_EOL;
                $query_object->sentence .= '  SELECT 1'.PHP_EOL;
                $query_object->sentence .= "  FROM jsonb_path_query({$table_alias}.{$column}, '{$json_path}') AS elem".PHP_EOL;
                $query_object->sentence .= "  WHERE {$match_logic}".PHP_EOL;
                $query_object->sentence .= ' )';
                break;

            // IS EXACTLY EQUAL (==)
            // Matches records where a value is exactly equal to the search term (case and accent insensitive).
            // Uses a structural pre-filter (@?) to leverage GIN indexes and an EXISTS subquery for f_unaccent comparison.
            case (strpos($q, '==')===0 || $q_operator==='=='):
                $q_clean = trim(str_replace('==', '', $q));
                $query_object->params = ['_Q1_' => $q_clean];

                $json_path = ($query_object->lang === 'all')
                    ? "$.{$component_tipo}[*]"
                    : "$.{$component_tipo}[*] ? (@.lang == \"{$query_object->lang}\")";

                $query_object->sentence = "({$table_alias}.{$column} @? '{$json_path}') AND EXISTS (".PHP_EOL;
                $query_object->sentence .= '  SELECT 1'.PHP_EOL;
                $query_object->sentence .= "  FROM jsonb_path_query({$table_alias}.{$column}, '{$json_path}') AS elem".PHP_EOL;
                $query_object->sentence .= '  WHERE f_unaccent(elem->>\'value\') = f_unaccent(_Q1_)'.PHP_EOL;
                $query_object->sentence .= ' )';
                break;

            // IS SIMILAR (=)
            // Matches records where a value contains the search term (case and accent insensitive).
            // Uses a structural pre-filter to help the GIN index discard rows without this component/lang.
            case (strpos($q, '=')===0 || $q_operator==='='):
                $q_clean = trim(str_replace('=', '', $q));
                $query_object->params = ['_Q1_' => $q_clean];

                $json_path = ($query_object->lang === 'all')
                    ? "$.{$component_tipo}[*]"
                    : "$.{$component_tipo}[*] ? (@.lang == \"{$query_object->lang}\")";

                $query_object->sentence = "({$table_alias}.{$column} @? '{$json_path}') AND EXISTS (".PHP_EOL;
                $query_object->sentence .= '  SELECT 1'.PHP_EOL;
                $query_object->sentence .= "  FROM jsonb_path_query({$table_alias}.{$column}, '{$json_path}') AS elem".PHP_EOL;
                $query_object->sentence .= '  WHERE f_unaccent(elem->>\'value\') ~* f_unaccent(_Q1_)'.PHP_EOL;
                $query_object->sentence .= ' )';
                break;

            // NOT CONTAIN (-)
            // Matches records where NO value contains the search term (negated contains).
            // Scoped by language; uses NOT EXISTS to ensure exclusion.
            case (strpos($q, '-')===0 || $q_operator==='-'):
                $q_clean = trim(str_replace('-', '', $q));
                $query_object->params = ['_Q1_' => $q_clean];

                $json_path = ($query_object->lang === 'all')
                    ? "$.{$component_tipo}[*]"
                    : "$.{$component_tipo}[*] ? (@.lang == \"{$query_object->lang}\")";

                $query_object->sentence = "({$table_alias}.{$column} @? '{$json_path}') AND NOT EXISTS (".PHP_EOL;
                $query_object->sentence .= '  SELECT 1'.PHP_EOL;
                $query_object->sentence .= "  FROM jsonb_path_query({$table_alias}.{$column}, '{$json_path}') AS elem".PHP_EOL;
                $query_object->sentence .= '  WHERE f_unaccent(elem->>\'value\') ~* f_unaccent(_Q1_)'.PHP_EOL;
                $query_object->sentence .= ' )';
                break;

            // CONTAIN EXPLICIT (*text*)
            // Standard contains search explicitly requested with asterisks. Scoped by language.
            case (substr($q, 0, 1)==='*' && substr($q, -1)==='*'):
                $q_clean = trim(str_replace('*', '', $q));
                $query_object->params = ['_Q1_' => $q_clean];

                $json_path = ($query_object->lang === 'all')
                    ? "$.{$component_tipo}[*]"
                    : "$.{$component_tipo}[*] ? (@.lang == \"{$query_object->lang}\")";

                $query_object->sentence = "({$table_alias}.{$column} @? '{$json_path}') AND EXISTS (".PHP_EOL;
                $query_object->sentence .= '  SELECT 1'.PHP_EOL;
                $query_object->sentence .= "  FROM jsonb_path_query({$table_alias}.{$column}, '{$json_path}') AS elem".PHP_EOL;
                $query_object->sentence .= '  WHERE f_unaccent(elem->>\'value\') ~* f_unaccent(_Q1_)'.PHP_EOL;
                $query_object->sentence .= ' )';
                break;

            // ENDS WITH (*text)
            // Searches for values ending with the search term. Uses regex anchoring ($).
            case (substr($q, 0, 1)==='*'):
                $q_clean = trim(str_replace('*', '', $q));
                $query_object->params = ['_Q1_' => $q_clean];

                $json_path = ($query_object->lang === 'all')
                    ? "$.{$component_tipo}[*]"
                    : "$.{$component_tipo}[*] ? (@.lang == \"{$query_object->lang}\")";

                $query_object->sentence = "({$table_alias}.{$column} @? '{$json_path}') AND EXISTS (".PHP_EOL;
                $query_object->sentence .= '  SELECT 1'.PHP_EOL;
                $query_object->sentence .= "  FROM jsonb_path_query({$table_alias}.{$column}, '{$json_path}') AS elem".PHP_EOL;
                $query_object->sentence .= '  WHERE f_unaccent(elem->>\'value\') ~* (f_unaccent(_Q1_) || \'$\')'.PHP_EOL;
                $query_object->sentence .= ' )';
                break;

            // BEGINS WITH (text*)
            // Searches for values beginning with the search term. Uses regex anchoring (^).
            case (substr($q, -1)==='*'):
                $q_clean = trim(str_replace('*', '', $q));
                $query_object->params = ['_Q1_' => $q_clean];

                $json_path = ($query_object->lang === 'all')
                    ? "$.{$component_tipo}[*]"
                    : "$.{$component_tipo}[*] ? (@.lang == \"{$query_object->lang}\")";

                $query_object->sentence = "({$table_alias}.{$column} @? '{$json_path}') AND EXISTS (".PHP_EOL;
                $query_object->sentence .= '  SELECT 1'.PHP_EOL;
                $query_object->sentence .= "  FROM jsonb_path_query({$table_alias}.{$column}, '{$json_path}') AS elem".PHP_EOL;
                $query_object->sentence .= '  WHERE f_unaccent(elem->>\'value\') ~* (\'^\' || f_unaccent(_Q1_))'.PHP_EOL;
                $query_object->sentence .= ' )';
                break;

            // LITERAL ('text')
            // Case-sensitive but accent-insensitive search for an exact full-string match.
            case (search::is_literal($q)===true):
                $q_clean = trim(str_replace("'", '', $q));
                $query_object->params = ['_Q1_' => $q_clean];

                $json_path = ($query_object->lang === 'all')
                    ? "$.{$component_tipo}[*]"
                    : "$.{$component_tipo}[*] ? (@.lang == \"{$query_object->lang}\")";

                $query_object->sentence = "({$table_alias}.{$column} @? '{$json_path}') AND EXISTS (".PHP_EOL;
                $query_object->sentence .= '  SELECT 1'.PHP_EOL;
                $query_object->sentence .= "  FROM jsonb_path_query({$table_alias}.{$column}, '{$json_path}') AS elem".PHP_EOL;
                $query_object->sentence .= '  WHERE f_unaccent(elem->>\'value\') = f_unaccent(_Q1_)'.PHP_EOL;
                $query_object->sentence .= ' )';
                break;

            // DUPLICATED (!!)
            // Finds records with duplicate values within the same section type and language.
            // Uses a structural pre-filter and compares elements explicitly for robustness.
            case (strpos($q, '!!')===0 || $q_operator==='!!'):
                $query_object->duplicated	= true;
                $query_object->unaccent		= true;
                // Resolve lang based on if is translatable
                if ($query_object->lang !== 'all' && $translatable === false) {
                    $query_object->lang = DEDALO_DATA_NOLAN;
                }

                // jsonpath version
                $json_path = ($query_object->lang === 'all')
                    ? "$.{$component_tipo}[*]"
                    : "$.{$component_tipo}[*] ? (@.lang == \"{$query_object->lang}\")";

                // Use EXISTS to find records that have at least one counterpart with the same value (unaccented)
                // We add a structural pre-filter to help the GIN index discard rows without this component/lang.
                $query_object->sentence = "({$table_alias}.{$column} @? '{$json_path}') AND EXISTS (".PHP_EOL;
                $query_object->sentence .= '  SELECT 1'.PHP_EOL;
                $query_object->sentence .= "  FROM {$table} AS m2,".PHP_EOL;
                $query_object->sentence .= "       jsonb_path_query(m2.{$column}, '{$json_path}') AS m2_elem,".PHP_EOL;
                $query_object->sentence .= "       jsonb_path_query({$table_alias}.{$column}, '{$json_path}') AS m1_elem".PHP_EOL;
                $query_object->sentence .= "  WHERE m2.{$column} @? '{$json_path}'".PHP_EOL;
                $query_object->sentence .= "    AND m2.section_id != {$table_alias}.section_id".PHP_EOL;
                $query_object->sentence .= "    AND m2.section_tipo = {$table_alias}.section_tipo".PHP_EOL;
                $query_object->sentence .= "    AND f_unaccent(m2_elem->>'value') = f_unaccent(m1_elem->>'value')".PHP_EOL;
                $query_object->sentence .= ' )';
                break;

            // default (Contains)
            // Standard fallback search: case-insensitive and accent-insensitive contains.
            default:
                $q_clean = str_replace(['+', '*'], '', $q);
                $query_object->params = ['_Q1_' => $q_clean];

                // Build the JSON Path based on the language requirement
                // If lang is 'all', we search all array elements without a predicate.
                $json_path = ($query_object->lang === 'all')
                    ? "$.{$component_tipo}[*]"
                    : "$.{$component_tipo}[*] ? (@.lang == \"{$query_object->lang}\")";

                // Use jsonb_path_query in an EXISTS subquery to allow calling f_unaccent() on the results.
                // We add a structural pre-filter (@?) to help the GIN index discard rows without this component/lang.
                $query_object->sentence = "({$table_alias}.{$column} @? '{$json_path}') AND EXISTS (".PHP_EOL;
                $query_object->sentence .= '  SELECT 1'.PHP_EOL;
                $query_object->sentence .= "  FROM jsonb_path_query({$table_alias}.{$column}, '{$json_path}') AS elem".PHP_EOL;
                $query_object->sentence .= '  WHERE f_unaccent(elem->>\'value\') ~* f_unaccent(_Q1_)'.PHP_EOL;
                $query_object->sentence .= ' )';
                break;
        }//end switch (true)


        return $query_object;
    }//end resolve_query_object_sql



    /**
    * SEARCH_OPERATORS_INFO
    * Return valid operators for search in current component
    * @return array $ar_operators
    */
    public function search_operators_info() : array {

        $ar_operators = [
            '*'			=> 'no_empty', // not null
            '!*'		=> 'empty', // null
            '=='		=> 'exactly',
            '='			=> 'similar_to',
            '!='		=> 'different_from',
            '-'			=> 'does_not_contain',
            '!!'		=> 'duplicated',
            '*text*'	=> 'contains',
            'text*'		=> 'begins_with',
            '*text'		=> 'end_with',
            '\'text\''	=> 'literal'
        ];

        return $ar_operators;
    }//end search_operators_info



}//end search_component_string_common