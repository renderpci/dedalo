<?php declare(strict_types=1);
/**
* TRAIT SEARCH_COMPONENT_DATE_TM
* From class component_date
* Common search methods for date components
*/
trait search_component_date_tm {



    /**
    * DISPATCH_DATE_MODE_SQL_TM
    * Routes the search resolution to the correct date mode handler for time machine queries.
    * Currently only supports 'date' mode resolution.
    *
    * @param object $query_object The query object containing search parameters and SQL building state
    * @param ?object $q_object The parsed query object with date information
    * @param object $ctx The search context containing table_alias, operator, and metadata
    * @return object The modified query object with SQL sentence and params set
    */
	protected static function dispatch_date_mode_sql_tm(object $query_object, ?object $q_object, object $ctx) : object {

        return self::resolve_date_mode_date_sql_tm($query_object, $q_object, $ctx);
	}



    /**
    * RESOLVE_DATE_MODE_DATE_SQL_TM
    * Handles date searches for time machine records with partial/full date support.
    * Translation: Match specific date or date range.
    * Technical Logic: Uses EXTRACT(YEAR/MONTH) or DATE() functions on timestamp column
    * What it returns: Records where the provided date matches or falls within the record's range.
    * When to use: To find time machine records by specific dates, years, or year-month combinations.
    * Example: "Show me all records from 2024" or "Find records before 2023-06-15".
    *
    * Partial Date Support:
    *   - Year only (2024): Uses EXTRACT(YEAR FROM DATE(timestamp))
    *   - Year-month (2024-06): Uses EXTRACT(YEAR) and EXTRACT(MONTH)
    *   - Full date (2024-06-15): Uses DATE(timestamp) comparison
    *
    * @param object $query_object The query object to modify with SQL and params
    * @param ?object $q_object The parsed query object containing dd_date and time info
    * @param object $ctx The search context with table_alias, operator, and date shape info
    * @return object The query object with SQL sentence and params set based on date precision
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
					// Year only search
					$year = $dd_date->get_year();
					$query_object->params   = ['_Q1_' => $year];
					$query_object->sentence = "EXTRACT(YEAR FROM DATE(\"timestamp\")) $ctx->operator _Q1_";
				} elseif ($shape->year && $shape->month && !$shape->day) {
					// Year and month search
					$year  = $dd_date->get_year();
					$month = $dd_date->get_month();
					$query_object->params   = ['_Q1_' => $year, '_Q2_' => $month];
					$query_object->sentence = "EXTRACT(YEAR FROM DATE(\"timestamp\")) $ctx->operator _Q1_' AND EXTRACT(MONTH FROM DATE(\"timestamp\")) $ctx->operator _Q2_";
				} else {
					// Full date search (default)
					$Q1 = $dd_date->get_dd_timestamp("Y-m-d");
					$query_object->params   = ['_Q1_' => $Q1];
					$query_object->sentence = "DATE(\"timestamp\") $ctx->operator _Q1_";
				}
				break;
		}

		return $query_object;
	}



    /**
    * RESOLVE_COMMON_DATE_OPERATORS_TM
    * Handles empty (!*) and not-empty (*) operators for time machine date searches.
    * Translation: "Is empty" / "Is not empty" for timestamp field.
    * Technical Logic: Direct IS NULL / IS NOT NULL check on table_alias for matrix_time_machine
    * What it returns: Records with or without timestamp data in the time machine table.
    * When to use: To find time machine records that have or lack timestamp values.
    * Example: "Show me all records with no timestamp" or "Show records that have timestamp data".
    *
    * @param object $query_object The query object to modify with SQL
    * @param object $ctx The search context with table_alias and operator
    * @return object|null The query object with SQL sentence set, or null if operator not handled
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