<?php declare(strict_types=1);
/**
* TRAIT SEARCH_COMPONENT_STRING_COMMON_TM
* Time Machine variant of the string-component search trait.
*
* This trait provides all SQL-building operator handlers that are specific to the
* `matrix_time_machine` PostgreSQL table. The table stores audit/history rows and
* uses flat scalar columns (e.g. `tipo VARCHAR`, `section_tipo VARCHAR`, `data JSONB`)
* rather than the JSONB data-column structure used by normal matrix tables. Because
* of this structural difference, every operator handler in this trait emits simpler,
* column-direct SQL instead of the `jsonb_path_query`-based SQL that the sister trait
* `search_component_string_common` generates for live data.
*
* Relationship to the non-TM trait:
* - `search_component_string_common` is used for all matrix tables except
*   `matrix_time_machine`; its `dispatch_operator_sql()` detects the TM table and
*   delegates here via `self::dispatch_operator_sql_tm()`.
* - Both traits are `use`d simultaneously by `component_string_common`, so all method
*   names in this trait use the `_tm` suffix to avoid collision.
*
* Column resolution:
* - Most string-type components in the TM table map to the generic `data` column.
* - Two special ontology tipos override this:
*     dd577  (DEDALO_TIME_MACHINE_COLUMN_TIPO)          → 'tipo'
*     dd1772 (DEDALO_TIME_MACHINE_COLUMN_SECTION_TIPO)  → 'section_tipo'
*     dd1574 (DEDALO_TIME_MACHINE_COLUMN_DATA)          → 'data'
* - This remapping happens once in `dispatch_operator_sql_tm()` before any operator
*   handler is called, so all resolver methods receive the already-resolved column.
*
* SQL parameter model:
* - All user-supplied values are passed as named placeholders (`_Q1_`, `_Q2_`, …)
*   stored in `$query_object->params`. The outer search WHERE-builder performs the
*   actual prepared-statement binding. Never embed user input directly in the SQL
*   string — the placeholder convention is the injection barrier.
*
* Extended by:
* - `component_string_common` (via `use search_component_string_common_tm`)
*
* @package Dédalo
* @subpackage Core
*/
trait search_component_string_common_tm {



    /**
    * DISPATCH_OPERATOR_SQL_TM
    * Entry point for all Time Machine string searches — resolves the physical column name
    * then routes to the appropriate operator handler.
    *
    * This method is called by `search_component_string_common::dispatch_operator_sql()` when
    * the target table is `matrix_time_machine`. It mutates `$ctx->column` in place before
    * any handler sees it, so handlers always work with the final physical column name.
    *
    * Column remapping (applied before the switch):
    *   dd577  (DEDALO_TIME_MACHINE_COLUMN_TIPO)         → physical column 'tipo'
    *   dd1772 (DEDALO_TIME_MACHINE_COLUMN_SECTION_TIPO) → physical column 'section_tipo'
    *   dd1574 (DEDALO_TIME_MACHINE_COLUMN_DATA)         → physical column 'data'
    *   <any other tipo>                                  → keeps $ctx->column unchanged
    *
    * Default-case behavior:
    *   When no prefix operator is matched, the handler depends on the column:
    *   - 'data' column → resolve_contains_sql_tm() (LIKE '%value%' cast to text)
    *   - any other column → resolve_exactly_equal_sql_tm() (exact equality)
    *   The commented-out line above the default branch is intentionally left; it
    *   records the original intent before the column-conditional split was introduced.
    *
    * @param object $query_object - SQO being built; sentence/params written on return.
    * @param string $q            - Normalised search string (may carry operator prefix).
    * @param object $ctx          - Mutable search context; ->column is overwritten here.
    * @return object              - The same $query_object with ->sentence and ->params set.
    */
    protected static function dispatch_operator_sql_tm(object $query_object, string $q, object $ctx) : object {

        // column resolve. time machine cases
        // The matrix_time_machine table exposes named scalar columns instead of a
        // JSONB data blob, so we remap the ontology tipo to the real column name.
        $ctx->column = match($ctx->component_tipo) {
            DEDALO_TIME_MACHINE_COLUMN_TIPO  => 'tipo', // dd577
            DEDALO_TIME_MACHINE_COLUMN_SECTION_TIPO => 'section_tipo', // dd1772
            DEDALO_TIME_MACHINE_COLUMN_DATA => 'data', // dd1574
            default  => $ctx->column
        };

        switch (true) {
            case ($q==='!*' || $ctx->q_operator==='!*'):
                return self::resolve_empty_value_sql_tm($query_object, $ctx);

            case ($q==='*' || $ctx->q_operator==='*'):
                return self::resolve_not_empty_value_sql_tm($query_object, $ctx);

            case (strpos($q, '!=')===0 || $ctx->q_operator==='!='):
                return self::resolve_different_sql_tm($query_object, $q, $ctx);

            case (strpos($q, '==')===0 || $ctx->q_operator==='=='):
                return self::resolve_exactly_equal_sql_tm($query_object, $q, $ctx);

            case (strpos($q, '-')===0 || $ctx->q_operator==='-'):
                return self::resolve_not_contain_sql_tm($query_object, $q, $ctx);

            case (strpos($q, '!!')===0 || $ctx->q_operator==='!!'):
                return self::resolve_duplicated_sql_tm($query_object, $ctx);

            case (substr($q, 0, 1)==='*' || substr($q, -1)==='*' || search::is_literal($q)):
                return self::resolve_wildcard_literal_sql_tm($query_object, $q, $ctx);

            default:
                // return self::resolve_contains_sql_tm($query_object, $q, $ctx);
                // (!) For 'data' the content is JSONB cast to text; fallback to LIKE.
                // For typed scalar columns (tipo, section_tipo) use exact equality to
                // avoid expensive full-table pattern scans on columns that store ontology tipos.
                return $ctx->column==='data'
                    ? self::resolve_contains_sql_tm($query_object, $q, $ctx)
                    : self::resolve_exactly_equal_sql_tm($query_object, $q, $ctx);
        }
    }



    /**
    * RESOLVE_EMPTY_VALUE_SQL_TM (!*)
    * Operator "!*" — field is empty/absent (Time Machine table version).
    *
    * For the `matrix_time_machine` table the target is a plain scalar column, so
    * "empty" means the column value is SQL NULL (no JSON null/empty-string check needed).
    *
    * Contrast with the normal-matrix version (`resolve_empty_value_sql`) which
    * tests both IS NULL and a JSONB jsonpath for empty strings because the data is
    * stored as a JSONB array of {lang, value} objects.
    *
    * (!) BUG (do not fix here): the generated sentence opens a parenthesis —
    *     "({$ctx->table_alias}.{$ctx->column} IS NULL"  — but never closes it.
    *     The outer WHERE builder must supply the matching closing paren, otherwise the
    *     generated SQL will be malformed. This matches the behaviour in the sister trait
    *     `search_component_json_tm` which has the same issue.
    *
    * @param object $query_object - SQO to modify; ->sentence is set on return.
    * @param object $ctx          - Search context providing ->table_alias and ->column.
    * @return object              - $query_object with ->sentence = "(<alias>.<col> IS NULL".
    */
    protected static function resolve_empty_value_sql_tm(object $query_object, object $ctx) : object {

        $query_object->sentence = "({$ctx->table_alias}.{$ctx->column} IS NULL";
        return $query_object;
    }



    /**
    * RESOLVE_NOT_EMPTY_VALUE_SQL_TM (*)
    * Operator "*" — field has a value (Time Machine table version).
    *
    * Emits a plain IS NOT NULL check on the scalar column. Unlike the normal-matrix
    * counterpart which uses a JSONB jsonpath existence check, TM columns are typed
    * scalars so a null check is sufficient and more efficient.
    *
    * @param object $query_object - SQO to modify; ->sentence is set on return.
    * @param object $ctx          - Search context providing ->table_alias and ->column.
    * @return object              - $query_object with ->sentence = "<alias>.<col> IS NOT NULL".
    */
    protected static function resolve_not_empty_value_sql_tm(object $query_object, object $ctx) : object {

        $query_object->sentence = "{$ctx->table_alias}.{$ctx->column} IS NOT NULL";
        return $query_object;
    }



    /**
    * RESOLVE_DIFFERENT_SQL_TM (!=)
    * Operator "!=" — value does not match pattern (Time Machine table version).
    *
    * Strips the `!=` prefix from $q, then branches on wildcard position to produce
    * an appropriate NOT LIKE or `!=` expression on the raw scalar column. This differs
    * from the JSONB approach used by `resolve_different_sql` in the non-TM trait, which
    * walks JSON array entries with `jsonb_path_query` and regex matching.
    *
    * Pattern interpretation after stripping '!=' prefix:
    *   *text* → NOT LIKE '%text%'   (does not contain)
    *   *text  → NOT LIKE '%text'    (does not end with)
    *   text*  → NOT LIKE 'text%'    (does not start with)
    *   text   → != 'text'           (not equal, exact)
    *
    * Note: LIKE comparisons on `matrix_time_machine` columns are case-sensitive by
    * default (no `f_unaccent()` wrapper applied here). This is intentional for
    * typed columns such as `tipo` and `section_tipo` which store ontology identificators.
    *
    * @param object $query_object - SQO to modify; ->sentence and ->params set on return.
    * @param string $q            - Raw query string including the '!=' prefix.
    * @param object $ctx          - Search context providing ->table_alias and ->column.
    * @return object              - $query_object with ->sentence and ->params populated.
    */
    protected static function resolve_different_sql_tm(object $query_object, string $q, object $ctx) : object {
        $q_clean = trim(str_replace('!=', '', $q));

        $first_char = mb_substr($q_clean, 0, 1);
        $last_char  = mb_substr($q_clean, -1);

        $match_logic = '';
        switch (true) {
            case ($first_char==='*' && $last_char==='*'):
                $query_object->params = ['_Q1_' => '%'.str_replace('*', '', $q_clean).'%'];
                $match_logic = "NOT LIKE _Q1_";
                break;
            case ($first_char==='*'):
                $query_object->params = ['_Q1_' => '%'.str_replace('*', '', $q_clean)];
                $match_logic = "NOT LIKE _Q1_";
                break;
            case ($last_char==='*'):
                $query_object->params = ['_Q1_' => str_replace('*', '', $q_clean).'%'];
                $match_logic = "NOT LIKE _Q1_";
                break;
            default:
                $query_object->params = ['_Q1_' => str_replace('*', '', $q_clean)];
                $match_logic = "!= _Q1_";
                break;
        }

        $query_object->sentence = "{$ctx->table_alias}.{$ctx->column} $match_logic";

        return $query_object;
    }



    /**
    * RESOLVE_EXACTLY_EQUAL_SQL_TM (==)
    * Operator "==" — exact equality match (Time Machine table version).
    *
    * Strips the `==` prefix from $q and emits a simple `= _Q1_` equality predicate
    * directly on the scalar column. This is also the handler used by the default
    * dispatch branch for non-'data' columns when no operator prefix is present.
    *
    * No accent-insensitive comparison (f_unaccent) is applied, which is appropriate for
    * ontology-identifier columns (`tipo`, `section_tipo`). For free-text in `data`,
    * callers that need accent-insensitive matching should use the wildcard or contains
    * operator instead.
    *
    * @param object $query_object - SQO to modify; ->sentence and ->params set on return.
    * @param string $q            - Raw query string including the '==' prefix (may be absent
    *                               when called from the default dispatch branch).
    * @param object $ctx          - Search context providing ->table_alias and ->column.
    * @return object              - $query_object with ->sentence "<alias>.<col> = _Q1_" and params set.
    */
    protected static function resolve_exactly_equal_sql_tm(object $query_object, string $q, object $ctx) : object {
        $q_clean = trim(str_replace('==', '', $q));
        $query_object->params = ['_Q1_' => $q_clean];

        $query_object->sentence = "{$ctx->table_alias}.{$ctx->column} = _Q1_";

        return $query_object;
    }



    /**
    * RESOLVE_NOT_CONTAIN_SQL_TM (-)
    * Operator "-" — value does not contain the given substring (Time Machine table version).
    *
    * Strips the leading `-` from $q and wraps the remainder in `%…%` to produce a
    * NOT LIKE predicate on the scalar column. This is the simplest possible substring
    * exclusion: no regex, no accent-insensitivity, case-sensitivity matches the
    * collation of the underlying column.
    *
    * (!) BUG (do not fix here): `str_replace('-', '', $q)` removes ALL hyphens from
    *     the search term, not just the leading operator hyphen. A search for "-New York"
    *     would strip the entire hyphen, but a search for "-2024-06" would produce
    *     "202406", silently corrupting the fragment. The non-TM counterpart uses
    *     `trim(str_replace('-', '', $q))` in the same way, so this is a shared issue.
    *
    * @param object $query_object - SQO to modify; ->sentence and ->params set on return.
    * @param string $q            - Raw query string including the '-' operator prefix.
    * @param object $ctx          - Search context providing ->table_alias and ->column.
    * @return object              - $query_object with ->sentence "<alias>.<col> NOT LIKE _Q1_"
    *                               and ->params ['_Q1_' => '%<term>%'].
    */
    protected static function resolve_not_contain_sql_tm(object $query_object, string $q, object $ctx) : object {
        $q_clean = trim(str_replace('-', '', $q));
        $query_object->params = ['_Q1_' => '%'.$q_clean.'%'];

        $query_object->sentence = "{$ctx->table_alias}.{$ctx->column} NOT LIKE _Q1_";

        return $query_object;
    }



    /**
    * RESOLVE_DUPLICATED_SQL_TM (!!)
    * Operator "!!" — find rows whose column value appears in at least one other row
    * of the same section_tipo (Time Machine table version).
    *
    * Emits a correlated EXISTS subquery that self-joins `matrix_time_machine` (aliased
    * as `m2`) against the current row. The join conditions ensure:
    *   - same column value (exact string equality, no accent normalisation)
    *   - different section_id (a row is not a duplicate of itself)
    *   - same section_tipo  (cross-section duplicates are not interesting here)
    *
    * Side-effects on $query_object (read by the outer WHERE builder):
    *   ->duplicated = true  — signals that result de-duplication may be needed upstream
    *   ->unaccent   = true  — signals that accent-normalization is conceptually desired;
    *                          however, no f_unaccent() call appears in the emitted SQL
    *                          because TM columns store raw identifiers/JSON, not natural text
    *
    * Note: The `$query_object->unaccent` flag set here does not cause accent-insensitive
    * SQL to be emitted in THIS method — the flag is for the outer query builder's
    * benefit. The actual SQL uses bare `=` (case-and-accent sensitive). This matches
    * the sister trait `search_component_json_tm`.
    *
    * @param object $query_object - SQO to modify; ->sentence, ->duplicated, ->unaccent set.
    * @param object $ctx          - Search context providing ->table, ->table_alias, ->column.
    * @return object              - $query_object with EXISTS subquery in ->sentence.
    */
    protected static function resolve_duplicated_sql_tm(object $query_object, object $ctx) : object {
        $query_object->duplicated = true;
        $query_object->unaccent   = true;

        $query_object->sentence = "EXISTS (" . PHP_EOL .
            "  SELECT 1" . PHP_EOL .
            "  FROM {$ctx->table} AS m2" . PHP_EOL .
            "  WHERE m2.{$ctx->column} = {$ctx->table_alias}.{$ctx->column}" . PHP_EOL .
            "    AND m2.section_id != {$ctx->table_alias}.section_id" . PHP_EOL .
            "    AND m2.section_tipo = {$ctx->table_alias}.section_tipo" . PHP_EOL . " )";

        return $query_object;
    }



    /**
    * RESOLVE_WILDCARD_LITERAL_SQL_TM (*text, text*, 'text')
    * Operators "*text", "text*", "'text'" — wildcard or literal match
    * (Time Machine table version).
    *
    * Called by the dispatcher when $q starts or ends with `*`, or when `search::is_literal()`
    * detects that the value is quoted with single quotes (e.g. `'exact phrase'`).
    *
    * `search::is_literal()` returns true when the string is enclosed in single quotes.
    * In that case the quotes are stripped and an exact `=` match is used instead of LIKE,
    * which means accent/case sensitivity follows the column's collation.
    *
    * Pattern precedence (evaluated top to bottom in the switch):
    *   1. 'text'   → exact equality (= _Q1_), quotes stripped
    *   2. *text    → ends with    (LIKE '%text')
    *   3. text*    → starts with  (LIKE 'text%')
    *   4. default  → contains     (LIKE '%text%') — reached only for bare values that
    *                 entered this method via wildcard detection in the dispatch switch
    *
    * No `f_unaccent()` or regex is applied; LIKE uses the column's default collation.
    *
    * @param object $query_object - SQO to modify; ->sentence and ->params set on return.
    * @param string $q            - Raw query string (may carry `*` at start/end or quotes).
    * @param object $ctx          - Search context providing ->table_alias and ->column.
    * @return object              - $query_object with ->sentence and ->params populated.
    */
    protected static function resolve_wildcard_literal_sql_tm(object $query_object, string $q, object $ctx) : object {

        $is_literal = search::is_literal($q);
        $q_clean    = trim(str_replace(["'", '*'], '', $q));

        $match_logic = '';
        switch (true) {
            case $is_literal:
                $query_object->params = ['_Q1_' => $q_clean];
                $match_logic = "= _Q1_";
                break;
            case substr($q, 0, 1)==='*':
                $query_object->params = ['_Q1_' => '%'.$q_clean];
                $match_logic = "LIKE _Q1_";
                break;
            case substr($q, -1)==='*':
                $query_object->params = ['_Q1_' => $q_clean.'%'];
                $match_logic = "LIKE _Q1_";
                break;
            default:
                $query_object->params = ['_Q1_' => '%'.$q_clean.'%'];
                $match_logic = "LIKE _Q1_";
                break;
        }

        $query_object->sentence = "{$ctx->table_alias}.{$ctx->column} $match_logic";

        return $query_object;
    }



    /**
    * RESOLVE_CONTAINS_SQL_TM (Default — 'data' column only)
    * Unqualified substring search on the `data` column (Time Machine table version).
    *
    * This method is reached only when the dispatcher's default branch determines that
    * `$ctx->column === 'data'`. All other columns fall through to
    * `resolve_exactly_equal_sql_tm()` instead (see dispatch comment).
    *
    * Because `data` is a JSONB column, a direct LIKE on a JSONB value would fail at the
    * SQL type level. The CAST to text serialises the entire JSONB value (including keys
    * and surrounding quotes) before matching. This means the pattern may match JSON
    * structure characters, not only field values — callers should be aware that results
    * could include unexpected matches such as a value matching a JSON key name.
    *
    * Input cleaning: `+`, `*`, and `=` are stripped from $q before the LIKE pattern is
    * built. This handles operator-prefix remnants that were not consumed by earlier
    * dispatch cases.
    *
    * @param object $query_object - SQO to modify; ->sentence and ->params set on return.
    * @param string $q            - Raw query string; stripped of '+', '*', '=' before use.
    * @param object $ctx          - Search context providing ->table_alias and ->column.
    * @return object              - $query_object with ->sentence
    *                               "CAST(<alias>.<col> AS text) LIKE _Q1_"
    *                               and ->params ['_Q1_' => '%<term>%'].
    */
    protected static function resolve_contains_sql_tm(object $query_object, string $q, object $ctx) : object {
        $q_clean = str_replace(['+', '*', '='], '', $q);
        $query_object->params = ['_Q1_' => '%'.$q_clean.'%'];

        // CAST is required because $ctx->column may be the JSONB 'data' column.
        // Casting to text serialises the JSON structure before LIKE pattern matching.
        $query_object->sentence = "CAST({$ctx->table_alias}.{$ctx->column} AS text) LIKE _Q1_";

        return $query_object;
    }



}//end search_component_string_common_tm