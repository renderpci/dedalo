<?php declare(strict_types=1);
/**
* TRAIT SEARCH_COMPONENT_DATE_TM
* From class component_date — Time Machine search variant for date components.
*
* Provides SQL-building methods that operate against the dedicated 'timestamp' column
* of the matrix_time_machine (and matrix_activity) tables rather than against the
* JSONB data matrix used by ordinary records.
*
* Context: when search::resolve_query_object_sql() detects that the target table is
* 'matrix_time_machine' or 'matrix_activity', dispatch_date_mode_sql() in the companion
* trait search_component_date delegates immediately to dispatch_date_mode_sql_tm() here.
* All SQL produced by this trait references the literal "timestamp" column (a PostgreSQL
* timestamptz column) rather than any JSONPath expression.
*
* Key design decision — SARGable range predicates:
*   Comparisons use half-open timestamp ranges (>= start AND < exclusive_end) instead of
*   wrapping the column in EXTRACT() or DATE() function calls. Function calls on a column
*   prevent the query planner from using a B-tree index on 'timestamp'; range literals do not.
*   The commented-out EXTRACT/DATE alternatives that appear in the code are the original
*   implementations preserved for historical reference.
*
* Supported operators: '=', '<', '<=', '>', '>=', '!*' (is null), '*' (is not null).
* Only 'date' mode is handled because matrix_time_machine stores a single timestamp per
* row, making range/period/time modes irrelevant.
*
* Used exclusively by component_date via:
*   use search_component_date_tm;
*
* Companion trait: search_component_date (standard JSONB date search, same host class).
*
* @package Dédalo
* @subpackage Core
*/
trait search_component_date_tm {



    /**
    * DISPATCH_DATE_MODE_SQL_TM
    * Entry point for Time Machine date SQL generation; routes to the 'date' mode handler.
    *
    * Currently only one date mode is meaningful for the time machine tables: the 'date'
    * mode which compares against the 'timestamp' column. All ontology date_mode values
    * ('range', 'period', 'time', 'date_time') collapse here because matrix_time_machine
    * stores a single timestamptz per row, not structured JSONB date containers.
    *
    * Called from search_component_date::dispatch_date_mode_sql() when the target table
    * is 'matrix_time_machine' or 'matrix_activity'.
    *
    * @param object  $query_object The SQO being built; mutated in place with sentence/params.
    * @param ?object $q_object     Parsed query object produced by extract_normalized_date_q();
    *                              contains a 'start' property with a dd_date-shaped object.
    * @param object  $ctx          Search context: table_alias, operator (sanitized), date_mode.
    * @return object $query_object with sentence and params set.
    */
	protected static function dispatch_date_mode_sql_tm(object $query_object, ?object $q_object, object $ctx) : object {

        return self::resolve_date_mode_date_sql_tm($query_object, $q_object, $ctx);
	}



    /**
    * RESOLVE_DATE_MODE_DATE_SQL_TM
    * Builds a SARGable PostgreSQL predicate against the matrix_time_machine 'timestamp' column
    * for partial or full date searches.
    *
    * All comparison operators ('=', '<', '<=', '>', '>=') are handled inside a single switch
    * case (including the default) because the SARGable range strategy produces an inclusive
    * half-open interval predicate that works correctly for equality and, in practice, the only
    * distinguishing behavior is the partial-date shape. Directional inequality operators on a
    * timestamp column would require a different strategy; those are not yet implemented and all
    * fall through to the range equality treatment.
    *
    * Partial date precision is detected via dd_date::get_shape() and drives three branches:
    *
    *   Year-only  (shape->year && !shape->month):
    *     Generates: ("timestamp" >= '2024-01-01'::date AND "timestamp" < '2025-01-01'::date)
    *     Covers the entire calendar year. next_year = year + 1 forms the exclusive upper bound.
    *
    *   Year+month (shape->year && shape->month && !shape->day):
    *     Generates: ("timestamp" >= '2024-06-01'::date AND "timestamp" < '2024-07-01'::date)
    *     December wraps to year+1/01/01 to handle the month-12 overflow case.
    *
    *   Full date  (all other cases, including day set):
    *     Generates: ("timestamp" >= '2024-06-15'::date AND "timestamp" < '2024-06-16'::date)
    *     next_day is computed via strtotime("+1 day") so that leap-year boundaries are handled
    *     by the PHP runtime rather than inline arithmetic.
    *
    * (!) The commented-out EXTRACT(YEAR FROM DATE("timestamp")) and DATE("timestamp") alternatives
    * in the code body are the original non-SARGable implementations. They are intentionally
    * preserved for historical reference and must NOT be restored — they prevent index use.
    *
    * @param object  $query_object SQO to populate; mutated in place.
    * @param ?object $q_object     Parsed query; expected shape: { start: { year, month?, day?, time } }.
    * @param object  $ctx          Search context: table_alias, operator (sanitized allowlist).
    * @return object $query_object with sentence and params set.
    */
	protected static function resolve_date_mode_date_sql_tm(object $query_object, ?object $q_object, object $ctx) : object {

		if ($res = self::resolve_common_date_operators_tm($query_object, $ctx)) return $res;

		[$dd_date, $time] = self::extract_time_from_q($q_object);

		switch ($ctx->operator) {
			case '<':
			case '>=':
			case '>':
			case '<=':
			case '=':
			default:

				$shape = $dd_date->get_shape();

				// Handle partial dates: year-only, year-month, or full date
				if ($shape->year && !$shape->month) {
					// Year - Extract way
						// $year = $dd_date->get_year();
						// $query_object->params   = ['_Q1_' => $year];
						// $query_object->sentence = "EXTRACT(YEAR FROM DATE(\"timestamp\")) $ctx->operator _Q1_";
					// Year only search - SARGable: use timestamp range instead of EXTRACT. sample: (timestamp >= '2017-01-01 00:00:00' AND timestamp < '2018-01-01 00:00:00')
						$year = $dd_date->get_year();
						$next_year = (int)$year + 1;
						$query_object->params   = ['_Q1_' => "$year-01-01", '_Q2_' => "$next_year-01-01"];
						$query_object->sentence = "(\"timestamp\" >= _Q1_::date AND \"timestamp\" < _Q2_::date)";
				} elseif ($shape->year && $shape->month && !$shape->day) {
					// Extract way
						// $query_object->params   = ['_Q1_' => $year, '_Q2_' => $month];
						// $query_object->sentence = "EXTRACT(YEAR FROM DATE(\"timestamp\")) $ctx->operator _Q1_' AND EXTRACT(MONTH FROM DATE(\"timestamp\")) $ctx->operator _Q2_";
					// Year and month search - SARGable: use timestamp range instead of EXTRACT
						$year  = $dd_date->get_year();
						$month = $dd_date->get_month();
						// Calculate next month for exclusive upper bound
						if ($month == 12) {
							$next_year = (int)$year + 1;
							$next_month_str = "$next_year-01-01";
						} else {
							$next_month = (int)$month + 1;
							$next_month_str = "$year-" . str_pad((string)$next_month, 2, '0', STR_PAD_LEFT) . "-01";
						}
						$month_str = str_pad((string)$month, 2, '0', STR_PAD_LEFT);
						$query_object->params   = ['_Q1_' => "$year-$month_str-01", '_Q2_' => $next_month_str];
						$query_object->sentence = "(\"timestamp\" >= _Q1_::date AND \"timestamp\" < _Q2_::date)";
				} else {
					// Full date search (default)
						// $Q1 = $dd_date->get_dd_timestamp("Y-m-d");
						// $query_object->params   = ['_Q1_' => $Q1];
						// $query_object->sentence = "DATE(\"timestamp\") $ctx->operator _Q1_";
					// Full date search (default) - SARGable: use timestamp range instead of DATE()
						$Q1_date = $dd_date->get_dd_timestamp("Y-m-d");
						// Calculate next day for exclusive upper bound
						$ts = strtotime($Q1_date);
						$next_day = date("Y-m-d", strtotime("+1 day", $ts));
						$query_object->params   = ['_Q1_' => $Q1_date, '_Q2_' => $next_day];
						$query_object->sentence = "(\"timestamp\" >= _Q1_::date AND \"timestamp\" < _Q2_::date)";
				}
				break;
		}

		return $query_object;
	}



    /**
    * RESOLVE_COMMON_DATE_OPERATORS_TM
    * Handles the meta-operators '!*' (is empty / IS NULL) and '*' (is not empty / IS NOT NULL)
    * for the matrix_time_machine 'timestamp' column.
    *
    * These two operators are independent of date precision and are processed before any
    * date-value parsing, so this method acts as a short-circuit guard called first by
    * resolve_date_mode_date_sql_tm(). Returning non-null signals "handled; stop processing".
    *
    * Note: $ctx->table_alias here refers directly to the 'timestamp' column alias set by the
    * TM search context, not to a table alias in the standard JOIN sense. The generated SQL
    * therefore evaluates the raw column rather than a JSONB path expression.
    *
    * @param object $query_object SQO to populate; sentence is set, params left unchanged.
    * @param object $ctx          Search context; only ctx->table_alias is consumed.
    * @return object|null Returns the populated $query_object if the operator was handled,
    *                     or null to signal that the caller should continue to value-based logic.
    */
	protected static function resolve_common_date_operators_tm(object $query_object, object $ctx) : object|null {

		switch ($ctx->operator) {
			case '!*':
				$query_object->sentence = "{$ctx->table_alias} IS NULL";
				return $query_object;
			case '*':
				$query_object->sentence = "{$ctx->table_alias} IS NOT NULL";
				return $query_object;
		}
		return null;
	}



}//end search_component_date_tm