<?php declare(strict_types=1);
include_once dirname(__DIR__).'/component_common/trait.search_component_sql_builder.php';
/**
* TRAIT SEARCH_COMPONENT_IRI
* SQL search implementation for the component_iri family (IRI / URL fields).
*
* Responsibilities:
* - Implements resolve_query_object_sql(), the single entry point called by the
*   search engine when it processes a Search Query Object (SQO) targeting a
*   component_iri column.
* - Translates operator prefixes in the user-supplied query value ($q) into
*   PostgreSQL JSONB path expressions and, where needed, correlated sub-selects
*   that operate on the 'iri' matrix column.
* - Exposes search_operators_info() for the client UI, listing every operator
*   that this component type supports.
*
* Data shape stored in the matrix 'iri' column (one JSONB array per row):
* ```json
* [
*   { "id": 1, "iri": "https://dedalo.dev", "lang": "nolan" },
*   { "id": 2, "iri": "https://wikidata.org/entity/Q…", "lang": "nolan" }
* ]
* ```
* Because IRI values are language-neutral in practice ($this->translatable is
* false), most JSON-path queries set @.lang == "nolan". The 'lang === all' code
* path is still supported for consistency with the broader search framework.
*
* Shared scaffolding (extract_normalized_q, split_search_terms, get_search_context,
* handle_query_splitting) is provided by the search_component_sql_builder trait
* that is use'd at the top of this trait. Each helper is documented in that file.
*
* Operator dispatch matrix (handled by dispatch_iri_operator_sql):
* | Operator | Prefix / shape    | Resolver method                        |
* |----------|-------------------|----------------------------------------|
* | !*       | empty             | resolve_iri_empty_value_sql            |
* | *        | not-empty         | resolve_iri_not_empty_value_sql        |
* | !=       | not equal         | resolve_iri_different_sql              |
* | ==       | exactly equal     | resolve_iri_exactly_equal_sql          |
* | -        | does not contain  | resolve_iri_not_contain_sql            |
* | !!       | duplicated        | resolve_iri_duplicated_sql             |
* | text*    | begins with       | resolve_iri_wildcard_literal_sql       |
* | *text    | ends with         | resolve_iri_wildcard_literal_sql       |
* | 'text'   | literal exact     | resolve_iri_wildcard_literal_sql       |
* | (default)| contains          | resolve_iri_contains_sql               |
*
* All resolver methods populate $query_object->sentence (a parameterised SQL
* fragment) and $query_object->params (a name→value map). Named placeholders use
* the form _Q1_, _Q2_, … and are substituted by the outer WHERE builder.
*
* Used by:  component_iri (via `use search_component_iri;`)
* Extends:  search_component_sql_builder (shared scaffolding trait)
*
* @package Dédalo
* @subpackage Core
*/
trait search_component_iri {

	// Shared search scaffolding: extract_normalized_q, split_search_terms, get_search_context
	use search_component_sql_builder;



	/**
	* RESOLVE_QUERY_OBJECT_SQL
	* Entry point for the search engine when processing an SQO that targets a
	* component_iri column. Orchestrates the three-stage pipeline:
	*   1. Extract and normalise the query value ($q) from the SQO.
	*   2. Optionally fan out into a boolean conjunction/disjunction of sub-SQOs
	*      when the caller enabled q_split and $q contains multiple whitespace-
	*      separated terms.
	*   3. Gather the search context ($ctx: table alias, JSONB column, etc.) and
	*      dispatch to the correct per-operator SQL builder.
	*
	* Returns false (instead of an object) to signal the caller to skip this
	* predicate — for example when $q and $q_operator are both absent/empty, which
	* would produce a no-op SQL clause.
	*
	* @param object $query_object - Incoming SQO with at least ->path, ->q (or
	*                               ->q_operator), ->table_alias, and ->table.
	* @return object|false        - Mutated $query_object with ->sentence and
	*                               ->params set, or false to skip.
	*/
	public static function resolve_query_object_sql(object $query_object) : object|false {

        // 1. Extract and Normalize search value (q)
        $q = self::extract_normalized_q($query_object);
        if ($q === false) {
            return false;
        }

        // 2. Handle Query Splitting (if applicable)
        if (($query_object->q_split ?? false) === true && !search::is_literal($q)) {
            $q_items = self::split_search_terms($q);
            if (count($q_items) > 1) {
                return self::handle_query_splitting($query_object, $q_items, '$and');
            }
        }

        // 3. Gather Search Context (metadata, column, table, etc.)
        $ctx = self::get_search_context($query_object);
        if (!$ctx) {
            return false;
        }

        // 4. Dispatch to Specific Operator Handler
        return self::dispatch_iri_operator_sql($query_object, $q, $ctx);
    }



    // extract_normalized_q(), split_search_terms() and get_search_context() are provided by
    // the shared search_component_sql_builder trait (use'd above).



    /**
    * DISPATCH_IRI_OPERATOR_SQL
    * Routes the search resolution to the correct operator handler based on the
    * operator embedded in $q (via prefix characters) or declared explicitly in
    * $ctx->q_operator.
    *
    * Evaluation order matters: the more specific prefixes ('!*', '!=', '==', '!!')
    * must be checked before the single-character '-' and '*' cases so that
    * two-character operators are not accidentally split by an earlier single-char
    * match (e.g. '!*' must not fall through to '*').
    *
    * The wildcard/literal branch groups three user-visible shapes together:
    *   - Trailing wildcard  text*  → starts-with regex.
    *   - Leading wildcard   *text  → ends-with regex.
    *   - Literal            'text' → exact case-insensitive match (no regex).
    * All three resolve through resolve_iri_wildcard_literal_sql which internally
    * re-inspects the pattern to pick the correct match expression.
    *
    * @param object $query_object - The SQO, passed through to each resolver.
    * @param string $q            - Normalised query string (operator prefix may be
    *                               embedded as leading characters).
    * @param object $ctx          - Context from get_search_context: table_alias,
    *                               column, component_tipo, translatable, etc.
    * @return object              - Mutated $query_object with ->sentence and ->params.
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
    *
    * The IS NULL guard is needed because the whole 'iri' column can be NULL in the
    * matrix row when a record has never had an IRI saved; a NULL column fails the
    * @? operator and would otherwise be excluded from the empty-set.
    *
    * JSON-path shape (lang='all'):
    *   $.{tipo}[*].iri ? (@ != "" && @ != null)
    * JSON-path shape (specific lang):
    *   $.{tipo}[*] ? (@.lang == "lg-spa" && @.iri != "" && @.iri != null)
    *
    * @param object $query_object - SQO; reads ->lang and mutates ->params, ->sentence.
    * @param object $ctx          - Search context (component_tipo, table_alias, column).
    * @return object              - Mutated $query_object.
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
    *
    * The jsonpath checks both non-null and non-empty-string to avoid treating
    * records where the iri field was explicitly set to "" as having content.
    *
    * @param object $query_object - SQO; reads ->lang and mutates ->params, ->sentence.
    * @param object $ctx          - Search context.
    * @return object              - Mutated $query_object.
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
    *
    * The two-part predicate is intentional:
    *   - Part 1 (@? json_path) ensures the record has at least one IRI entry for
    *     the requested language, so that truly empty records are excluded.
    *   - Part 2 (NOT EXISTS …) excludes records that contain the target string.
    * This combination returns "has content, but not this specific one" — distinct
    * from the !* (empty) operator.
    *
    * The inner wildcard logic mirrors resolve_iri_wildcard_literal_sql: '*' at
    * start → ends-with regex, '*' at end → starts-with regex, both → free regex,
    * none → exact unaccented equality.
    *
    * The query value $q arrives with '!=' stripped via str_replace and then any
    * remaining '*' stripped from the clean value for the regex anchor detection.
    * The anchor '*' characters in the original $q_clean are then used to pick the
    * correct match_logic branch before they are stripped from _Q1_.
    *
    * @param object $query_object - SQO; mutates ->params, ->sentence.
    * @param string $q            - Normalised query, prefix '!=' included.
    * @param object $ctx          - Search context.
    * @return object              - Mutated $query_object.
    */
    protected static function resolve_iri_different_sql(object $query_object, string $q, object $ctx) : object {
        $q_clean = trim(str_replace('!=', '', $q));
        $query_object->params = ['_Q1_' => str_replace('*', '', $q_clean)];

        $json_path = ($query_object->lang === 'all')
            ? "$.{$ctx->component_tipo}[*]"
            : "$.{$ctx->component_tipo}[*] ? (@.lang == \"{$query_object->lang}\")";

        $first_char = mb_substr($q_clean, 0, 1);
        $last_char  = mb_substr($q_clean, -1);

        // Determine regex anchoring from the wildcard position in the cleaned value.
        // f_unaccent normalises diacritics on both sides before the regex comparison.
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
    *
    * Uses PostgreSQL's f_unaccent() on both sides of the equality so that
    * diacritic differences in the stored IRI (rare but possible in IRIs) do not
    * cause spurious misses. For a strict byte-level comparison the user can rely
    * on the fact that IRI values are typically ASCII-safe; the unaccent call is
    * a safety measure rather than a performance concern.
    *
    * Unlike the default contains operator this does NOT wrap the value in a regex:
    * it uses '=' (equality) against the unaccented strings, so the full IRI must
    * match character-for-character (after diacritic stripping).
    *
    * @param object $query_object - SQO; mutates ->params, ->sentence.
    * @param string $q            - Normalised query, prefix '==' included.
    * @param object $ctx          - Search context.
    * @return object              - Mutated $query_object.
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
    *
    * The language filter uses a second named parameter _Q2_ (bound to the lang
    * string) rather than inlining the lang into the SQL string literal. This is
    * the only operator in the suite that parameterises the language value this way;
    * the others inline the lang directly into the jsonpath literal because
    * jsonb_path_query does not accept placeholders inside its jsonpath argument.
    * For this operator the lang comparison is part of the WHERE clause of the
    * correlated sub-select, where parameterised values are safe.
    *
    * (!) NOT EXISTS without an @? pre-check means the operator also matches records
    * that have no IRI at all. This is intentional: if a record has no IRIs it
    * certainly does not contain the target fragment.
    *
    * @param object $query_object - SQO; mutates ->params, ->sentence.
    * @param string $q            - Normalised query, prefix '-' included.
    * @param object $ctx          - Search context.
    * @return object              - Mutated $query_object.
    */
    protected static function resolve_iri_not_contain_sql(object $query_object, string $q, object $ctx) : object {
        $q_clean = trim(str_replace('-', '', $q));
        $query_object->params = ['_Q1_' => $q_clean];

        $json_path = "$.{$ctx->component_tipo}[*]";
        // lang parameterized (_Q2_) instead of inlined into the SQL string literal
        $lang_filter = '';
        if ($query_object->lang !== 'all') {
            $query_object->params['_Q2_'] = $query_object->lang;
            $lang_filter = " AND elem->>'lang' = _Q2_";
        }

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
    *
    * The method sets two flags on $query_object in addition to ->sentence:
    *   ->duplicated = true   Signals the outer WHERE builder that this is a
    *                         self-join query; the builder may apply additional
    *                         de-duplication or ordering.
    *   ->unaccent   = true   Signals that result post-processing should apply
    *                         unaccent normalisation when comparing values.
    *
    * Language handling: component_iri declares $translatable = false, so when
    * the caller requests a specific language the SQO lang is overridden to
    * DEDALO_DATA_NOLAN (the language-neutral slot). Without this override the
    * jsonpath lang filter would find no items (all IRI items carry 'nolan').
    *
    * The self-join compares m2.section_id != m1.section_id (same section_tipo to
    * scope within the correct table) so a record is only flagged as duplicated
    * when another distinct record in the same section type shares its IRI.
    *
    * @param object $query_object - SQO; mutates ->duplicated, ->unaccent, ->sentence.
    * @param object $ctx          - Search context (table, table_alias, column, component_tipo,
    *                               translatable).
    * @return object              - Mutated $query_object.
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
    *
    * Handles three related shapes in one method to avoid near-duplicate SQL:
    *
    *   'text'  (literal, enclosed in single quotes as detected by search::is_literal)
    *           → exact equality after f_unaccent() on both sides.
    *           The quotes and '*' are stripped from $q_clean via str_replace.
    *
    *   text*   (trailing wildcard)
    *           → case-insensitive regex anchored at the START: '^' || f_unaccent(_Q1_)
    *
    *   *text   (leading wildcard)
    *           → case-insensitive regex anchored at the END: f_unaccent(_Q1_) || '$'
    *
    * The '$' and '^' anchors are appended in SQL rather than PHP so that the
    * regex anchor is applied after f_unaccent() processes the stored value; this
    * avoids a double-unaccent mismatch if the value were anchored before unaccent.
    *
    * An outer @? pre-check guards against NULL/empty columns before the correlated
    * sub-select; this avoids the sub-select being evaluated for rows that provably
    * cannot match, which PostgreSQL may not optimise away automatically.
    *
    * @param object $query_object - SQO; mutates ->params, ->sentence.
    * @param string $q            - Normalised query, may carry leading/trailing '*'
    *                               or enclosing single quotes.
    * @param object $ctx          - Search context.
    * @return object              - Mutated $query_object.
    */
    protected static function resolve_iri_wildcard_literal_sql(object $query_object, string $q, object $ctx) : object {

        $is_literal = search::is_literal($q);
        $q_clean    = trim(str_replace(["'", '*'], '', $q));
        $query_object->params = ['_Q1_' => $q_clean];

        $json_path = ($query_object->lang === 'all')
            ? "$.{$ctx->component_tipo}[*]"
            : "$.{$ctx->component_tipo}[*] ? (@.lang == \"{$query_object->lang}\")";

        // Select match expression based on wildcard position or literal flag.
        // substr() on $q (the original, before stripping) preserves anchoring intent.
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
    *
    * This is the fallback operator when no recognised operator prefix is found in $q.
    * It is equivalent to a case-insensitive substring search using PostgreSQL's ~*
    * (case-insensitive regex match) operator combined with f_unaccent() normalisation.
    *
    * Pre-processing strips operator-like characters (+, *, =) that may be present in
    * a raw query value passed without an explicit operator. Literal dots '.' are
    * escaped to '\.' so they match a literal dot in the IRI (e.g. 'dedalo.dev')
    * rather than any character in the POSIX regex. This is critical for URL matching
    * since dots are common in domain names.
    *
    * (!) The '.' escape here ('\.') produces a single backslash before the dot in the
    * PHP string, which is what PostgreSQL's ~* operator expects for a literal dot.
    * If a caller passes a value that already contains escaped dots this method would
    * double-escape them. The assumption is that $q at this stage is a raw user string.
    *
    * @param object $query_object - SQO; mutates ->params, ->sentence.
    * @param string $q            - Normalised query with no operator prefix.
    * @param object $ctx          - Search context.
    * @return object              - Mutated $query_object.
    */
    protected static function resolve_iri_contains_sql(object $query_object, string $q, object $ctx) : object {
        $q_clean = str_replace(['+', '*', '='], '', $q);
        // escape point '.'
        $q_clean = str_replace('.', '\.', $q_clean);
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
	* Returns the full operator map for the component_iri search UI.
	*
	* Each key is the operator token (or a representative example such as 'text*')
	* and the value is a translation key that the client resolves into a localised
	* label for the operator drop-down. The list is used by both the search widget
	* to populate its operator selector and by the API to validate incoming SQOs.
	*
	* All operators listed here correspond 1-to-1 with branches in
	* dispatch_iri_operator_sql(). Dates in comments mark when each operator was
	* verified against the full test suite.
	*
	* @return array $ar_operators - Map of operator_token => translation_key.
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
