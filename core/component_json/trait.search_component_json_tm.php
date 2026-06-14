<?php declare(strict_types=1);
/**
 * TRAIT SEARCH_COMPONENT_JSON_TM
 * Time Machine SQL-builder variant for component_json searches against matrix_time_machine.
 *
 * This trait provides all search operator handlers that target the `matrix_time_machine`
 * PostgreSQL table when the searched component is of type `component_json`. It is the
 * temporal counterpart to the JSONB-path based `search_component_json` trait, and mirrors
 * the pattern established by `search_component_string_common_tm` for string components.
 *
 * WHY a separate TM trait?
 * The `matrix_time_machine` table stores snapshot rows with a flat scalar schema:
 *   id, section_tipo, section_id, tipo, lang, timestamp, user_id, bulk_process_id, data (JSONB)
 * Unlike the normal `matrix_*` tables where component data sits inside a JSONB column
 * keyed by component tipo (`column->>'dd1574'`), in the TM table the JSON snapshot is
 * stored in a top-level `data` column whose value is the raw datum array:
 *   [{"value": <any JSON>, "id": 1, ...}]
 * This means the JSONB-path expressions used by `search_component_json` (which navigate
 * `$.component_tipo[*].value`) cannot be applied; instead, simpler column-direct SQL
 * (IS NULL, IS NOT NULL, LIKE, =, CAST … AS text LIKE …) is emitted here.
 *
 * Column resolution:
 * - The only column from `matrix_time_machine` that this trait supports is `data`
 *   (constant DEDALO_TIME_MACHINE_COLUMN_DATA = 'dd1574'). Any other component tipo
 *   falls through the `match` in `dispatch_operator_sql_tm()` unchanged, leaving
 *   `$ctx->column` set to whatever the general search context resolved it to.
 * - Contrast with `search_component_string_common_tm`, which also maps `tipo` (dd577)
 *   and `section_tipo` (dd1772) columns; this trait is intentionally narrower because
 *   `component_json` values only ever occupy the `data` column.
 *
 * SQL parameter model:
 * - All user input is carried in named placeholders (`_Q1_`) stored in
 *   `$query_object->params`; the outer search WHERE-builder performs prepared-statement
 *   binding. No raw user input is ever interpolated directly into SQL strings.
 *
 * Operator dispatch chain (see dispatch_operator_sql_tm):
 *   !*   → IS NULL           (empty / no value)
 *   *    → IS NOT NULL       (not empty / has value)
 *   !=   → != or NOT LIKE    (different from, with optional wildcards)
 *   ==   → =                 (exactly equal)
 *   -    → NOT LIKE '%x%'    (does not contain)
 *   !!   → EXISTS subquery   (duplicated value across records)
 *   *x / x* / 'x' → LIKE patterns or exact = (wildcard / literal)
 *   default (data column)  → CAST(column AS text) LIKE '%x%'  (contains)
 *   default (other column) → =                                 (exactly equal)
 *
 * Relationship to other types:
 * - `search_component_json`            — sister trait for regular matrix tables (JSONB-path)
 * - `search_component_string_common_tm`— canonical TM trait this was cloned from
 * - `component_json`                   — the class that `use`s both TM and non-TM traits
 * - `search_tm`                        — the SQO-to-SQL builder that sets table='matrix_time_machine'
 *   and calls each component's resolve_query_object_sql_tm() path
 *
 * @package Dédalo
 * @subpackage Core
 */
trait search_component_json_tm {



    /**
    * DISPATCH_OPERATOR_SQL_TM
    * Entry point for all component_json Time Machine searches — resolves the physical column
    * name then routes to the appropriate operator handler based on the search operator prefix.
    *
    * Called by `dispatch_json_operator_sql()` in `search_component_json` when the target
    * table is `matrix_time_machine`. The method mutates `$ctx->column` in place before any
    * handler sees it, so all downstream resolvers always receive the final physical column name.
    *
    * Column remapping (applied before the switch):
    *   dd1574 (DEDALO_TIME_MACHINE_COLUMN_DATA) → physical column 'data'
    *   <any other tipo>                          → $ctx->column left unchanged
    *
    * Note: Unlike `search_component_string_common_tm`, this trait does NOT remap the
    * 'tipo' (dd577) or 'section_tipo' (dd1772) columns — component_json values can only
    * appear in the 'data' column of matrix_time_machine.
    *
    * Default-case behavior:
    *   When no prefix operator matches, the column determines the fallback strategy:
    *   - 'data' column → resolve_contains_sql_tm() (CAST to text, LIKE '%value%')
    *   - any other column → resolve_exactly_equal_sql_tm() (equality)
    *   The commented-out single-branch default above the conditional is intentionally
    *   preserved; it documents the original design before the column-conditional split.
    *
    * @param object $query_object SQO being built; ->sentence and ->params are written on return
    * @param string $q            Normalised search string, may carry an operator prefix (!=, ==, -, !!, !*, *)
    * @param object $ctx          Mutable search context; ->column is overwritten here before dispatch
    * @return object              The same $query_object with ->sentence and ->params populated
    */
    protected static function dispatch_operator_sql_tm(object $query_object, string $q, object $ctx) : object {

        // column resolve. time machine cases
        // Remap the ontology tipo to the physical column in matrix_time_machine.
        // Only the 'data' column (dd1574) is relevant for component_json snapshots.
        $ctx->column = match($ctx->component_tipo) {
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
                // (!) Intentional two-branch default: the 'data' column holds a JSONB value
                // that must be cast to text for LIKE to work; other columns (if ever added)
                // use exact equality since they are plain scalars in the TM schema.
                return $ctx->column==='data'
                    ? self::resolve_contains_sql_tm($query_object, $q, $ctx)
                    : self::resolve_exactly_equal_sql_tm($query_object, $q, $ctx);
        }
    }



    /**
    * RESOLVE_EMPTY_VALUE_SQL_TM (!*)
    * Operator: !* — "Is Empty / Has no data" (Time Machine version)
    *
    * Generates an IS NULL predicate against the physical column in matrix_time_machine.
    * Matches snapshot rows where the component data column has never been written or was
    * explicitly set to NULL.
    *
    * TM simplification vs. regular JSON:
    * - The non-TM variant (`resolve_json_empty_value_sql`) also tests for an empty JSONB
    *   array via a NOT EXISTS subquery, because the regular matrix stores the datum as a
    *   JSONB array that may be present but empty.
    * - In matrix_time_machine the `data` column is always NULL when absent, so a single
    *   IS NULL check is sufficient.
    *
    * (!) BUG — the SQL sentence opens a parenthesis `(` but never closes it.
    * The produced fragment is:  "({table_alias}.{column} IS NULL"
    * A conforming fragment should be: "({table_alias}.{column} IS NULL)"
    * This will cause a PostgreSQL syntax error if this fragment is the outermost clause.
    * Do NOT fix here (doc-only constraint) — flag to the owning developer.
    *
    * @param object $query_object SQO being built; ->sentence is set to the IS NULL predicate
    * @param object $ctx          Search context providing ->table_alias and ->column
    * @return object              $query_object with ->sentence set (no ->params needed)
    */
    protected static function resolve_empty_value_sql_tm(object $query_object, object $ctx) : object {

        $query_object->sentence = "({$ctx->table_alias}.{$ctx->column} IS NULL";
        return $query_object;
    }



    /**
    * RESOLVE_NOT_EMPTY_VALUE_SQL_TM (*)
    * Operator: * — "Not Empty / Has data" (Time Machine version)
    *
    * Generates an IS NOT NULL predicate against the physical column in matrix_time_machine.
    * Matches snapshot rows where the component data column has been written with any value,
    * including empty arrays or empty strings (only a SQL NULL causes exclusion).
    *
    * Simpler than the non-TM counterpart (`resolve_json_not_empty_value_sql`), which uses a
    * JSONB path existence check (`@?`) to detect at least one array element. In the TM table
    * the absence of data is represented by a NULL column, so IS NOT NULL is sufficient.
    *
    * @param object $query_object SQO being built; ->sentence is set to the IS NOT NULL predicate
    * @param object $ctx          Search context providing ->table_alias and ->column
    * @return object              $query_object with ->sentence set (no ->params needed)
    */
    protected static function resolve_not_empty_value_sql_tm(object $query_object, object $ctx) : object {

        $query_object->sentence = "{$ctx->table_alias}.{$ctx->column} IS NOT NULL";
        return $query_object;
    }



    /**
    * RESOLVE_DIFFERENT_SQL_TM (!=)
    * Operator: != — "Does not equal / Does not match pattern" (Time Machine version)
    *
    * Generates an inequality or NOT LIKE predicate depending on whether the search value
    * contains wildcard characters. The `!=` prefix is stripped before wildcard detection.
    *
    * Wildcard expansion table (applied to the cleaned value after stripping '!='):
    *   *text*  → column NOT LIKE '%text%'   (does not contain)
    *   *text   → column NOT LIKE '%text'    (does not end with)
    *   text*   → column NOT LIKE 'text%'    (does not start with)
    *   text    → column != 'text'           (strict inequality)
    *
    * Note: The `data` column in matrix_time_machine stores a JSONB value. Comparing a
    * JSONB column with LIKE or != performs a text-cast comparison internally in PostgreSQL.
    * For substring searches on JSONB data, prefer `resolve_contains_sql_tm` (which uses
    * an explicit CAST) or the regular JSONB-path operators in `search_component_json`.
    *
    * @param object $query_object SQO being built; ->sentence and ->params are written on return
    * @param string $q            Raw search string including the leading '!=' prefix
    * @param object $ctx          Search context providing ->table_alias and ->column
    * @return object              $query_object with ->sentence and ->params['_Q1_'] set
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
    * Operator: == — "Exactly Equal" (Time Machine version)
    *
    * Generates a column = _Q1_ equality predicate against matrix_time_machine. The '=='
    * prefix is stripped, then the remaining value is bound as a prepared parameter.
    *
    * For the `data` JSONB column this performs a JSONB equality comparison (PostgreSQL
    * compares the JSONB text representation). To match a plain text value against JSONB
    * use `resolve_contains_sql_tm` which casts to text first.
    *
    * This handler is also used as the default fallback in `dispatch_operator_sql_tm()`
    * for any column that is NOT the `data` column (i.e. hypothetical future scalar columns
    * that may be added to matrix_time_machine).
    *
    * @param object $query_object SQO being built; ->sentence and ->params are written on return
    * @param string $q            Raw search string including the leading '==' prefix
    * @param object $ctx          Search context providing ->table_alias and ->column
    * @return object              $query_object with ->sentence = "col = _Q1_" and ->params['_Q1_'] set
    */
    protected static function resolve_exactly_equal_sql_tm(object $query_object, string $q, object $ctx) : object {
        $q_clean = trim(str_replace('==', '', $q));
        $query_object->params = ['_Q1_' => $q_clean];

        $query_object->sentence = "{$ctx->table_alias}.{$ctx->column} = _Q1_";

        return $query_object;
    }



    /**
    * RESOLVE_NOT_CONTAIN_SQL_TM (-)
    * Operator: - — "Does Not Contain" (Time Machine version)
    *
    * Generates a `column NOT LIKE '%value%'` predicate, ensuring the search fragment
    * does not appear anywhere in the column value. The leading '-' operator prefix is
    * stripped and the remainder is wrapped in SQL '%' wildcards on both sides.
    *
    * Applied to the `data` JSONB column: PostgreSQL will implicitly cast JSONB to text
    * before applying LIKE, which means the match operates on the JSON serialisation string
    * (e.g. `[{"value":"foo","id":1}]`). For precise searches against the inner JSON value
    * use the JSONB-path operators in `search_component_json` (regular matrix table).
    *
    * @param object $query_object SQO being built; ->sentence and ->params are written on return
    * @param string $q            Raw search string including the leading '-' prefix
    * @param object $ctx          Search context providing ->table_alias and ->column
    * @return object              $query_object with ->sentence = "col NOT LIKE _Q1_" and
    *                             ->params['_Q1_'] = '%value%'
    */
    protected static function resolve_not_contain_sql_tm(object $query_object, string $q, object $ctx) : object {
        $q_clean = trim(str_replace('-', '', $q));
        $query_object->params = ['_Q1_' => '%'.$q_clean.'%'];

        $query_object->sentence = "{$ctx->table_alias}.{$ctx->column} NOT LIKE _Q1_";

        return $query_object;
    }



    /**
    * RESOLVE_DUPLICATED_SQL_TM (!!)
    * Operator: !! — "Duplicated value" (Time Machine version)
    *
    * Generates an EXISTS subquery that matches snapshot rows whose column value is also
    * present in at least one other row of the same section_tipo. This detects records
    * that share a component value, which is useful for data quality audits on historical
    * snapshots.
    *
    * Produced SQL structure:
    *   EXISTS (
    *     SELECT 1
    *     FROM matrix_time_machine AS m2
    *     WHERE m2.{column}       = {alias}.{column}      -- same value
    *       AND m2.section_id    != {alias}.section_id    -- different record
    *       AND m2.section_tipo   = {alias}.section_tipo  -- same section type
    *   )
    *
    * Flags written to $query_object:
    * - ->duplicated = true  — signals the outer WHERE builder that this is a duplicate check
    * - ->unaccent   = true  — requests accent-insensitive text comparison where the DB supports it
    *   (Note: For the JSONB `data` column the `unaccent` flag has no effect unless the
    *   outer builder explicitly wraps the column in `unaccent()`; behaviour depends on the
    *   search trait's upstream handling.)
    *
    * The `section_tipo` guard in the subquery limits duplication detection to snapshots of
    * the same section type, avoiding false positives across conceptually unrelated entities
    * (e.g. a JSON object in a 'Place' section matching an identical object in an 'Event').
    *
    * @param object $query_object SQO being built; ->sentence, ->duplicated, ->unaccent are set
    * @param object $ctx          Search context providing ->table_alias, ->table, and ->column
    * @return object              $query_object with ->sentence set to the EXISTS predicate
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
    * Operators: *text (ends-with), text* (begins-with), 'text' (literal exact) — Time Machine version
    *
    * Consolidates three related pattern-matching cases into a single handler for the
    * matrix_time_machine `data` column (or any resolved scalar column):
    *
    *   'text'  → column =      _Q1_    (exact literal match; single-quotes stripped)
    *   *text   → column LIKE  '%text'  (ends-with; leading * replaced by '%')
    *   text*   → column LIKE  'text%'  (begins-with; trailing * replaced by '%')
    *   default → column LIKE  '%text%' (contains; should not be reached in normal dispatch
    *             because the default path in dispatch_operator_sql_tm handles fallback
    *             via resolve_contains_sql_tm or resolve_exactly_equal_sql_tm)
    *
    * The literal case (`is_literal`) is detected by `search::is_literal($q)` before
    * this handler is called (and the case is re-evaluated here for correctness); a value
    * enclosed in single-quotes (`'text'`) requests an exact equality comparison rather
    * than a LIKE pattern.
    *
    * Note: The default branch inside this switch exists as a safety net but is unlikely
    * to be reached in practice — `dispatch_operator_sql_tm()` routes `*x`, `x*`, and
    * literal cases here but sends all other unrecognised patterns through the explicit
    * default branch in the outer switch.
    *
    * @param object $query_object SQO being built; ->sentence and ->params are written on return
    * @param string $q            Raw search string (may include '*' wildcards or wrapping single-quotes)
    * @param object $ctx          Search context providing ->table_alias and ->column
    * @return object              $query_object with ->sentence and ->params['_Q1_'] set
    */
    protected static function resolve_wildcard_literal_sql_tm(object $query_object, string $q, object $ctx) : object {

        $is_literal = search::is_literal($q);
        $q_clean    = trim(str_replace(["'", '*'], '', $q));

        $match_logic = '';
        switch (true) {
            case $is_literal:
                // Single-quoted input: treat as exact equality rather than a LIKE pattern.
                $query_object->params = ['_Q1_' => $q_clean];
                $match_logic = "= _Q1_";
                break;
            case substr($q, 0, 1)==='*':
                // Leading wildcard: match values ending with the search term.
                $query_object->params = ['_Q1_' => '%'.$q_clean];
                $match_logic = "LIKE _Q1_";
                break;
            case substr($q, -1)==='*':
                // Trailing wildcard: match values starting with the search term.
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
    * RESOLVE_CONTAINS_SQL_TM (Default for 'data' column)
    * Operator: (none / default) — "Contains substring X" (Time Machine version)
    *
    * Generates a `CAST(column AS text) LIKE '%value%'` predicate. This is the default
    * fallback handler for the `data` column in matrix_time_machine when no explicit
    * operator prefix is present in the search string.
    *
    * WHY CAST to text?
    * The `data` column is typed as JSONB in PostgreSQL. The standard LIKE operator does
    * not operate on JSONB directly; without the explicit cast PostgreSQL raises a type
    * error. The cast serialises the JSONB value to its text representation
    * (e.g. `[{"value":"foo","id":1}]`) and then applies the LIKE pattern on that string.
    * This means the match covers the full JSON serialisation, not just the inner `value`
    * field — callers who need precise field-level matching should use the JSONB-path
    * operators in `search_component_json` (regular matrix searches).
    *
    * The operator characters '+', '*', and '=' are stripped from the search value before
    * building the LIKE pattern. This is consistent with how the non-TM JSON handler
    * (`resolve_json_contains_sql`) cleans its input.
    *
    * Routing:
    * This method is NOT called for non-'data' columns (the default branch in
    * `dispatch_operator_sql_tm()` uses `resolve_exactly_equal_sql_tm()` for those).
    * For the 'data' column it is reached when none of the prefix operators match and
    * the value is a plain substring search.
    *
    * @param object $query_object SQO being built; ->sentence and ->params are written on return
    * @param string $q            Search string with operator characters (+, *, =) already cleaned out
    * @param object $ctx          Search context providing ->table_alias and ->column
    * @return object              $query_object with ->sentence = "CAST(col AS text) LIKE _Q1_"
    *                             and ->params['_Q1_'] = '%value%'
    */
    protected static function resolve_contains_sql_tm(object $query_object, string $q, object $ctx) : object {
        $q_clean = str_replace(['+', '*', '='], '', $q);
        $query_object->params = ['_Q1_' => '%'.$q_clean.'%'];

        $query_object->sentence = "CAST({$ctx->table_alias}.{$ctx->column} AS text) LIKE _Q1_";

        return $query_object;
    }



}//end search_component_json_tm