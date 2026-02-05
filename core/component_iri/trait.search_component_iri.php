<?php declare(strict_types=1);
/**
* TRAIT SEARCH_COMPONENT_IRI
* From class component_iri
* Search methods for IRI component
*/
trait search_component_iri {



	/**
	* RESOLVE_QUERY_OBJECT_SQL
	* @param object $query_object
	* @return object|false $query_object
	*	Edited/parsed version of received object
	*/
	public static function resolve_query_object_sql(object $query_object) : object|false {

        // 1. Extract and Normalize search value (q)
        $q = self::extract_normalized_iri_q($query_object);
        if ($q === false) {
            return false;
        }

        // 2. Handle Query Splitting (if applicable)
        if (($query_object->q_split ?? false) === true && !search::is_literal($q)) {

            // Pre-process q for splitting (join operators and wildcards)
            $q_proc = preg_replace('/(\!=|==|!!|!*|=|-)\s+/', '$1', $q);
            $q_proc = preg_replace('/\s+(\*)/', '$1', $q_proc);

            $q_items = preg_split('/\s/', $q_proc, -1, PREG_SPLIT_NO_EMPTY);
            if (count($q_items) > 1) {
                return self::handle_query_splitting($query_object, $q_items, '$and');
            }
        }

        // 3. Gather Search Context (metadata, column, table, etc.)
        $ctx = self::get_iri_search_context($query_object);
        if (!$ctx) {
            return false;
        }

        // 4. Dispatch to Specific Operator Handler
        return self::dispatch_iri_operator_sql($query_object, $q, $ctx);
    }



    /**
    * EXTRACT_NORMALIZED_IRI_Q
    * Extracts and normalizes the search query value (q) from the input object.
    */
    protected static function extract_normalized_iri_q(object $query_object) : string|false {

        $q_raw = isset($query_object->q) && is_array($query_object->q)
            ? $query_object->q[0]
            : ($query_object->q ?? null);

        if ((empty($q_raw) || (is_object($q_raw) && empty($q_raw->value))) && empty($query_object->q_operator)) {
            return false;
        }

        $q = (is_object($q_raw) ? $q_raw->value : $q_raw) ?? '';
        return stripslashes($q);
    }



    /**
    * GET_IRI_SEARCH_CONTEXT
    * Validates the path and collects necessary metadata for SQL generation.
    */
    protected static function get_iri_search_context(object $query_object) : object|false {

        if (empty($query_object->path) || !is_array($query_object->path)) {
            debug_log(__METHOD__ . " Invalid component path", logger::ERROR);
            return false;
        }

        $path_end       = end($query_object->path);
        $component_tipo = $path_end->component_tipo;

        $ctx = new stdClass();
        $ctx->component_tipo = $component_tipo;
        $ctx->translatable   = ontology_node::get_translatable($component_tipo);
        $ctx->column         = section_record_data::get_column_name(get_called_class());
        $ctx->table_alias    = $query_object->table_alias;
        $ctx->table          = $query_object->table;
        $ctx->q_operator     = $query_object->q_operator ?? null;

        // Set defaults on query_object
        $query_object->type = 'string';
        $query_object->lang = $query_object->lang ?? DEDALO_DATA_LANG;

        return $ctx;
    }



    /**
    * DISPATCH_IRI_OPERATOR_SQL
    * Routes the search resolution to the correct operator handler.
    */
    protected static function dispatch_iri_operator_sql(object $query_object, string $q, object $ctx) : object {

        switch (true) {
            case ($q==='!*' || $ctx->q_operator==='!*'):
                return self::resolve_iri_empty_value_sql($query_object, $ctx);

            case ($q==='*' || $ctx->q_operator==='*'):
                return self::resolve_iri_not_empty_value_sql($query_object, $ctx);

            case (strpos($q, '!=')===0 || $ctx->q_operator==='!='):
                return self::resolve_iri_different_sql($query_object, $q, $ctx);

            case (strpos($q, '==')===0 || $ctx->q_operator==='=='):
                return self::resolve_iri_exactly_equal_sql($query_object, $q, $ctx);

            case (strpos($q, '-')===0 || $ctx->q_operator==='-'):
                return self::resolve_iri_not_contain_sql($query_object, $q, $ctx);

            case (strpos($q, '!!')===0 || $ctx->q_operator==='!!'):
                return self::resolve_iri_duplicated_sql($query_object, $ctx);

            case (substr($q, 0, 1)==='*' || substr($q, -1)==='*' || search::is_literal($q)):
                return self::resolve_iri_wildcard_literal_sql($query_object, $q, $ctx);

            default:
                return self::resolve_iri_contains_sql($query_object, $q, $ctx);
        }
    }



    /**
    * RESOLVE_IRI_EMPTY_VALUE_SQL (!*)
    * !* Is Empty
	* Translation: "Is empty" / "Does not have data"
	* Technical Logic: NOT (column @? jsonpath)
	* What it returns: Records that have no IRI defined (or null/empty) for the current language.
	* When to use: To find items with no assigned IRIs.
	* Example: "Show me all objects with no IRI reference."
    */
    protected static function resolve_iri_empty_value_sql(object $query_object, object $ctx) : object {
        $query_object->params = [
            '_Q1_' => ($query_object->lang === 'all')
                ? "$.{$ctx->component_tipo}[*].iri ? (@ != \"\" && @ != null)"
                : "$.{$ctx->component_tipo}[*] ? (@.lang == \"{$query_object->lang}\" && @.iri != \"\" && @.iri != null)"
        ];
        $query_object->sentence = "({$ctx->table_alias}.{$ctx->column} IS NULL OR NOT ({$ctx->table_alias}.{$ctx->column} @? (_Q1_)::jsonpath))";
        return $query_object;
    }



    /**
    * RESOLVE_IRI_NOT_EMPTY_VALUE_SQL (*)
    * * Not Empty
	* Translation: "Not empty" / "Has data"
	* Technical Logic: (column @? jsonpath)
	* What it returns: Records that have at least one valid IRI defined.
	* When to use: To find items that have some assigned IRIs.
	* Example: "Show me all objects that have an IRI assigned."
    */
    protected static function resolve_iri_not_empty_value_sql(object $query_object, object $ctx) : object {
        $query_object->params = [
            '_Q1_' => ($query_object->lang === 'all')
                ? "$.{$ctx->component_tipo}[*].iri ? (@ != \"\" && @ != null)"
                : "$.{$ctx->component_tipo}[*] ? (@.lang == \"{$query_object->lang}\" && @.iri != \"\" && @.iri != null)"
        ];
        $query_object->sentence = "{$ctx->table_alias}.{$ctx->column} @? (_Q1_)::jsonpath";
        return $query_object;
    }



    /**
    * RESOLVE_IRI_DIFFERENT_SQL (!=)
    * != Different
	* Translation: "Has data AND does not contain X."
	* Technical Logic: (EXISTS any data) AND NOT (EXISTS specific item X)
	* What it returns: Records that have IRIs, but the specific target IRI is not among them.
	* When to use: To find items categorized differently than the target.
	* Example: "Show me objects with an IRI, but not with IRI 'http://example.org/1'."
    */
    protected static function resolve_iri_different_sql(object $query_object, string $q, object $ctx) : object {
        $q_clean = trim(str_replace('!=', '', $q));
        $query_object->params = ['_Q1_' => str_replace('*', '', $q_clean)];

        $json_path = ($query_object->lang === 'all')
            ? "$.{$ctx->component_tipo}[*]"
            : "$.{$ctx->component_tipo}[*] ? (@.lang == \"{$query_object->lang}\")";

        $first_char = mb_substr($q_clean, 0, 1);
        $last_char  = mb_substr($q_clean, -1);

        $match_logic = '';
        switch (true) {
            case ($first_char==='*' && $last_char==='*'):
                $match_logic = "f_unaccent(elem->>'iri') ~* f_unaccent(_Q1_)";
                break;
            case ($first_char==='*'):
                $match_logic = "f_unaccent(elem->>'iri') ~* (f_unaccent(_Q1_) || '$')";
                break;
            case ($last_char==='*'):
                $match_logic = "f_unaccent(elem->>'iri') ~* ('^' || f_unaccent(_Q1_))";
                break;
            default:
                $match_logic = "f_unaccent(elem->>'iri') = f_unaccent(_Q1_)";
                break;
        }

        $query_object->sentence = "({$ctx->table_alias}.{$ctx->column} @? '{$json_path}') AND NOT EXISTS (" . PHP_EOL .
            "  SELECT 1" . PHP_EOL .
            "  FROM jsonb_path_query({$ctx->table_alias}.{$ctx->column}, '{$json_path}') AS elem" . PHP_EOL .
            "  WHERE {$match_logic}" . PHP_EOL . " )";

        return $query_object;
    }



    /**
    * RESOLVE_IRI_EXACTLY_EQUAL_SQL (==)
    * == Exactly Equal
	* Translation: "Contains exactly X."
	* Technical Logic: (column @? jsonpath) AND (EXISTS matches exact unaccented string)
	* What it returns: Records that contain the specific IRI as a full string match.
	* When to use: For precise matching of full IRI strings.
	* Example: "Show me the object with IRI 'http://example.org/iri_case_exactly'."
    */
    protected static function resolve_iri_exactly_equal_sql(object $query_object, string $q, object $ctx) : object {
        $q_clean = trim(str_replace('==', '', $q));
        $query_object->params = ['_Q1_' => $q_clean];

        $json_path = ($query_object->lang === 'all')
            ? "$.{$ctx->component_tipo}[*]"
            : "$.{$ctx->component_tipo}[*] ? (@.lang == \"{$query_object->lang}\")";

        $query_object->sentence = "({$ctx->table_alias}.{$ctx->column} @? '{$json_path}') AND EXISTS (" . PHP_EOL .
            "  SELECT 1" . PHP_EOL .
            "  FROM jsonb_path_query({$ctx->table_alias}.{$ctx->column}, '{$json_path}') AS elem" . PHP_EOL .
            "  WHERE f_unaccent(elem->>'iri') = f_unaccent(_Q1_)" . PHP_EOL . " )";

        return $query_object;
    }



    /**
    * RESOLVE_IRI_NOT_CONTAIN_SQL (-)
    * - Does Not Contain
	* Translation: "Does not contain X anywhere."
	* Technical Logic: NOT EXISTS (item contains X)
	* What it returns: Records that do not have the target string in any of their IRIs.
	* When to use: Exclusion filtering based on string fragments.
	* Example: "Show me objects that do not mention 'wikipedia' in their IRIs."
    */
    protected static function resolve_iri_not_contain_sql(object $query_object, string $q, object $ctx) : object {
        $q_clean = trim(str_replace('-', '', $q));
        $query_object->params = ['_Q1_' => $q_clean];

        $json_path = "$.{$ctx->component_tipo}[*]";
        $lang_filter = ($query_object->lang === 'all') ? '' : " AND elem->>'lang' = '{$query_object->lang}'";

        $query_object->sentence  = "NOT EXISTS (" . PHP_EOL .
            "  SELECT 1" . PHP_EOL .
            "  FROM jsonb_path_query({$ctx->table_alias}.{$ctx->column}, '{$json_path}') AS elem" . PHP_EOL .
            "  WHERE elem->>'iri' IS NOT NULL AND f_unaccent(elem->>'iri') ~* f_unaccent(_Q1_)" . $lang_filter . PHP_EOL . " )";

        return $query_object;
    }



    /**
    * RESOLVE_IRI_DUPLICATED_SQL (!!)
    * !! Duplicated
	* Translation: "Has the same data as another record."
	* Technical Logic: EXISTS (another record with same IRI value)
	* What it returns: Records whose IRI is also present in at least one other record of the same type.
	* When to use: Quality control to find duplicate entries.
    */
    protected static function resolve_iri_duplicated_sql(object $query_object, object $ctx) : object {
        $query_object->duplicated = true;
        $query_object->unaccent   = true;

        if ($query_object->lang !== 'all' && $ctx->translatable === false) {
            $query_object->lang = DEDALO_DATA_NOLAN;
        }

        $json_path = ($query_object->lang === 'all')
            ? "$.{$ctx->component_tipo}[*]"
            : "$.{$ctx->component_tipo}[*] ? (@.lang == \"{$query_object->lang}\")";

        $query_object->sentence = "({$ctx->table_alias}.{$ctx->column} @? '{$json_path}') AND EXISTS (" . PHP_EOL .
            "  SELECT 1" . PHP_EOL .
            "  FROM {$ctx->table} AS m2," . PHP_EOL .
            "       jsonb_path_query(m2.{$ctx->column}, '{$json_path}') AS m2_elem," . PHP_EOL .
            "       jsonb_path_query({$ctx->table_alias}.{$ctx->column}, '{$json_path}') AS m1_elem" . PHP_EOL .
            "  WHERE m2.{$ctx->column} @? '{$json_path}'" . PHP_EOL .
            "    AND m2.section_id != {$ctx->table_alias}.section_id" . PHP_EOL .
            "    AND m2.section_tipo = {$ctx->table_alias}.section_tipo" . PHP_EOL .
            "    AND f_unaccent(m2_elem->>'iri') = f_unaccent(m1_elem->>'iri')" . PHP_EOL . " )";

        return $query_object;
    }



    /**
    * RESOLVE_IRI_WILDCARD_LITERAL_SQL (*text, text*, 'text')
    * Wildcard / Literal
	* Translation: "Matches pattern X."
	* Technical Logic: REGEX or Exact match based on wildcards.
	* What it returns: Records matching the pattern (begins with, ends with, or literal).
    */
    protected static function resolve_iri_wildcard_literal_sql(object $query_object, string $q, object $ctx) : object {

        $is_literal = search::is_literal($q);
        $q_clean    = trim(str_replace(["'", '*'], '', $q));
        $query_object->params = ['_Q1_' => $q_clean];

        $json_path = ($query_object->lang === 'all')
            ? "$.{$ctx->component_tipo}[*]"
            : "$.{$ctx->component_tipo}[*] ? (@.lang == \"{$query_object->lang}\")";

        $match_logic = '';
        switch (true) {
            case $is_literal:
                $match_logic = "f_unaccent(elem->>'iri') = f_unaccent(_Q1_)";
                break;
            case substr($q, 0, 1)==='*':
                $match_logic = "f_unaccent(elem->>'iri') ~* (f_unaccent(_Q1_) || '$')";
                break;
            case substr($q, -1)==='*':
                $match_logic = "f_unaccent(elem->>'iri') ~* ('^' || f_unaccent(_Q1_))";
                break;
            default:
                $match_logic = "f_unaccent(elem->>'iri') ~* f_unaccent(_Q1_)";
                break;
        }

        $query_object->sentence = "({$ctx->table_alias}.{$ctx->column} @? '{$json_path}') AND EXISTS (" . PHP_EOL .
            "  SELECT 1" . PHP_EOL .
            "  FROM jsonb_path_query({$ctx->table_alias}.{$ctx->column}, '{$json_path}') AS elem" . PHP_EOL .
            "  WHERE {$match_logic}" . PHP_EOL . " )";

        return $query_object;
    }



    /**
    * RESOLVE_IRI_CONTAINS_SQL (Default)
    * Contains
	* Translation: "Contains string X."
	* Technical Logic: (EXISTS unaccented ILIKE match)
	* What it returns: Records that contain the string fragment in any of their IRIs.
    */
    protected static function resolve_iri_contains_sql(object $query_object, string $q, object $ctx) : object {
        $q_clean = str_replace(['+', '*', '='], '', $q);
        $query_object->params = ['_Q1_' => $q_clean];

        $json_path = ($query_object->lang === 'all')
            ? "$.{$ctx->component_tipo}[*]"
            : "$.{$ctx->component_tipo}[*] ? (@.lang == \"{$query_object->lang}\")";

        $query_object->sentence = "({$ctx->table_alias}.{$ctx->column} @? '{$json_path}') AND EXISTS (" . PHP_EOL .
            "  SELECT 1" . PHP_EOL .
            "  FROM jsonb_path_query({$ctx->table_alias}.{$ctx->column}, '{$json_path}') AS elem" . PHP_EOL .
            "  WHERE f_unaccent(elem->>'iri') ~* f_unaccent(_Q1_)" . PHP_EOL . " )";

        return $query_object;
    }




	/**
	* SEARCH_OPERATORS_INFO
	* Return valid operators for search in current component
	* @return array $ar_operators
	*/
	public function search_operators_info() : array {

		$ar_operators = [
			'!*'		=> 'empty', // Checked 13-01-2026
			'*'			=> 'no_empty', // Checked 13-01-2026
			'=='		=> 'exactly', // Checked 13-01-2026
			'!='		=> 'different_from', // Checked 13-01-2026
			'='			=> 'similar_to', // Checked 13-01-2026
			'-'			=> 'does_not_contain', // Checked 13-01-2026
			'!!'		=> 'duplicated', // Checked 13-01-2026
			'text*'		=> 'begins_with', // Checked 13-01-2026
			'*text'		=> 'end_with', // Checked 13-01-2026
			'\'text\''	=> 'literal', // Checked 13-01-2026
		];

		return $ar_operators;
	}//end search_operators_info



}//end search_component_iri
