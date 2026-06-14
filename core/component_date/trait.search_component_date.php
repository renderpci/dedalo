<?php declare(strict_types=1);
/**
* TRAIT SEARCH_COMPONENT_DATE
* From class component_date.
* Provides the SQO → SQL resolution pipeline for date components against standard JSONB matrix tables.
*
* Each date value stored in the matrix is an array of dd_date container objects keyed by the
* component's ontology tipo. For example, a component of tipo 'dd199' stored in column 'string'
* has the JSONB shape:
*   { "dd199": [ { "start": { "year":2012, "month":11, "day":7, "time":64638475292 }, "end": {...} } ] }
*
* The trait resolves a search_query_object (SQO) into PostgreSQL JSONB path expressions of the form:
*   table_alias.column @? ('$.tipo[*] ? (predicate)')::jsonpath
*
* where the predicate compares the stored absolute-seconds 'time' value against the client's
* requested date, using an integer range computed by get_final_search_range_seconds() to expand
* a partial date (year-only, year+month, etc.) to its full end-of-period boundary.
*
* Resolution is split into a six-step pipeline:
*   1. extract_normalized_date_q()   — normalises the raw client q into a dd_date object tree
*   2. get_date_search_context()     — reads ontology properties and builds a $ctx value object
*   3. sanitize_date_q_operator()    — allowlists the operator (SEARCH-01 security gate)
*   4. dispatch_date_mode_sql()      — branches to the per-mode handler (or TM delegate)
*   5. resolve_common_date_operators() — short-circuits !* / * operators before mode dispatch
*   6. per-mode handlers             — build the final sentence + params on $query_object
*
* Supported date modes (set via ontology node property 'date_mode'):
*   - 'date'      : single start container; range query via start.time ∩ [time, final_range]
*   - 'range'     : same as 'date' but records may have both start + end containers
*   - 'period'    : duration stored in a 'period' container; equality on period.time
*   - 'time'      : clock-only start container; range for '=', direct comparison for others
*   - 'date_time' : full datetime start container; same logic as 'range' per-operator
*   - unknown     : logs an ERROR and returns the unmodified $query_object
*
* For time-machine tables (matrix_time_machine / matrix_activity), dispatch_date_mode_sql()
* delegates to dispatch_date_mode_sql_tm() provided by trait search_component_date_tm, which
* issues SQL against the dedicated 'timestamp' column rather than JSONB.
*
* Used by: component_date (via 'use search_component_date').
* Companion trait: search_component_date_tm (Time Machine variant, same host class).
*
* @package Dédalo
* @subpackage Core
*/
trait search_component_date {



	/**
	* RESOLVE_QUERY_OBJECT_SQL
	* Entry point for the SQO → SQL pipeline. Mutates $query_object in place, populating
	* 'sentence', 'params', and 'type' so the calling search engine can bind and execute the query.
	*
	* Returns false in two early-exit cases:
	*   - The client sent no search value and no operator (nothing to search for).
	*   - The path is malformed (no component_tipo can be resolved).
	*
	* A null return from extract_normalized_date_q() signals an unparseable plain-text q with no
	* operator; in that case the sentence is set to a literal 'INVALID VALUE!' equality so the
	* query produces zero results rather than a PHP warning or an unguarded SQL fragment.
	*
	* @param object $query_object - The search_query_object instance carrying q, q_operator, path,
	*                               table, table_alias and all other search parameters.
	* @return object|false - The mutated $query_object with sentence/params set, or false if the
	*                        SQO cannot be resolved to a valid SQL expression.
	*/
	public static function resolve_query_object_sql(object $query_object) : object|false {

		// 1. Extract and Normalize search value (q)
		$q_object = self::extract_normalized_date_q($query_object);
		if ($q_object === false) {
			return false;
		}

		// Handle string-based "INVALID VALUE!" case from original logic
		if ($q_object === null) {
			$query_object->operator = '=';
			$query_object->q_parsed  = "'INVALID VALUE!'";
			return $query_object;
		}

		// 2. Gather Search Context (metadata, column, table, etc.)
		$ctx = self::get_date_search_context($query_object);
		if (!$ctx) {
			return false;
		}

		// 3. Dispatch to Specific Mode Handler
		return self::dispatch_date_mode_sql($query_object, $q_object, $ctx);
	}



	/**
	* EXTRACT_NORMALIZED_DATE_Q
	* Normalizes the raw client search value ($query_object->q) into a structured stdClass that
	* the per-mode handlers can consume, or signals that resolution should be aborted.
	*
	* Return value contract:
	*   - false  → q is empty and no q_operator is set; caller must return false immediately.
	*   - null   → q is a non-empty string but does not match the date regex, and no q_operator
	*              is set; caller should produce an 'INVALID VALUE!' literal to yield zero results.
	*   - object → a stdClass with at minimum a 'start' property holding a dd_date-like object
	*              (may also carry 'end' or 'period'). When q was already an object it is returned
	*              as-is (minus the 'id' property stripped when present); when q was a plain string
	*              it is parsed via the date regex and wrapped in a synthetic start container.
	*   - (object)[] → empty stdClass fallback when q_operator is set but q is not parseable;
	*              lets the common-operator handlers (!*, *) fire without a date value.
	*
	* The date regex captures an optional operator prefix (1–2 non-digit characters), a mandatory
	* year (1–10 digits, supporting negative BCE years via the leading sign), an optional month,
	* and an optional day. Only months ≤ 12 and days ≤ 31 are accepted; values outside those
	* ranges leave the corresponding field unset on the resulting dd_date, making the partial-date
	* range calculation in get_final_search_range_seconds() fall back to the next coarser unit.
	*
	* @param object $query_object - The SQO with q and q_operator fields.
	* @return object|null|false   - Structured date object, null (invalid string), or false (empty).
	*/
	protected static function extract_normalized_date_q(object $query_object) : object|null|false {

		// Flatten q array
		// The SQO may carry q as a single-element array; pull the first item so all
		// downstream code works with a scalar or object, never an array.
		$q = is_array($query_object->q) ? reset($query_object->q) : $query_object->q;

		// Strip the synthetic 'id' key that the client dataframe pairing may inject.
		// The id is a UI-only label reference and must not influence the SQL predicate.
		if (is_object($q) && isset($q->id)) {
			unset($q->id);
		}

		if (empty($q) && empty($query_object->q_operator)) {
			return false;
		}

		// Object q — already structured (e.g. sent by a date picker widget).
		// Pass through directly; the per-mode handlers know how to read start/end/period.
		if (is_object($q)) {
			return $q;
		}

		// q plain text case
		// Attempt to parse a free-text date string of the form [op]YYYY[-MM[-DD]].
		// Group 1: optional operator prefix (e.g. '>', '<=', '>=').
		// Group 2: mandatory year (supports up to 10 digits to allow ancient/BCE values).
		// Groups 3/4: optional month and day, validated by range after capture.
		preg_match("/^(\W{1,2})?([0-9]{1,10})-?([0-9]{1,2})?-?([0-9]{1,2})?$/", trim((string)$q), $matches);
		if (isset($matches[0])) {
			$key_op    = 1;
			$key_year  = 2;
			$key_month = 3;
			$key_day   = 4;

			$op = $matches[$key_op] ?? '';

			$base_date = new stdClass();
			$base_date->year = $matches[$key_year];
			if(!empty($matches[$key_month]) && $matches[$key_month] <= 12){
				$base_date->month = $matches[$key_month];
				if (!empty($matches[$key_day]) && $matches[$key_day] <= 31) {
					$base_date->day = $matches[$key_day];
				}
			}

			// Build a dd_date and compute its absolute-seconds time so the mode handlers
			// can pass $time directly into the JSONPath predicate without re-computing it.
			$dd_date = new dd_date($base_date);
			$time    = dd_date::convert_date_to_seconds($dd_date);
			$dd_date->set_time((int)$time);
			$dd_date->set_op($op);

			// Wrap in the same envelope shape that a structured client q would have,
			// so the per-mode handlers can always read $q_object->start.
			$date_default_obj = new stdClass();
			$date_default_obj->start = $dd_date;

			return $date_default_obj;
		}

		// If not a parseable string and no operator, it's considered invalid
		if (empty($query_object->q_operator)) {
			return null;
		}

		// Return empty object as fallback if operator exists but q is weird
		return (object)[];
	}



	/**
	* GET_DATE_SEARCH_CONTEXT
	* Builds a lightweight value object ($ctx) that consolidates all metadata needed by the
	* per-mode SQL handlers so they do not have to repeat ontology/path lookups.
	*
	* The returned $ctx carries:
	*   ->component_tipo : the leaf tipo string from $query_object->path (e.g. 'dd199')
	*   ->column         : JSONB matrix column for this component class (e.g. 'string', 'text')
	*                      resolved via section_record_data::get_column_name(get_called_class())
	*   ->table_alias    : table alias used in the FROM clause (forwarded from SQO)
	*   ->table          : actual table name (forwarded from SQO; checked by dispatch_date_mode_sql
	*                      to detect time-machine tables)
	*   ->date_mode      : one of 'date'|'range'|'period'|'time'|'date_time', falling back to
	*                      'date' when the ontology node carries no date_mode property
	*   ->operator       : sanitized q_operator string (allowlisted by sanitize_date_q_operator)
	*
	* Also sets $query_object->type = 'jsonb' so the search engine uses the correct binding path.
	*
	* Returns false (and logs ERROR) when $query_object->path is absent or not an array, since
	* the component_tipo cannot be determined without a valid path.
	*
	* @param object $query_object - The SQO with path, table, table_alias, and q_operator.
	* @return object|false        - The $ctx value object, or false on invalid path.
	*/
	protected static function get_date_search_context(object $query_object) : object|false {

		if (empty($query_object->path) || !is_array($query_object->path)) {
			debug_log(__METHOD__ . " Invalid component path", logger::ERROR);
			return false;
		}

		$component_tipo = end($query_object->path)->component_tipo;
		$ontology_node  = ontology_node::get_instance($component_tipo);
		$properties     = $ontology_node->get_properties();

		$ctx = new stdClass();
		$ctx->component_tipo = $component_tipo;
		$ctx->column         = section_record_data::get_column_name(get_called_class());
		$ctx->table_alias    = $query_object->table_alias;
		$ctx->table          = $query_object->table;
		$ctx->date_mode      = $properties->date_mode ?? 'date';
		// SEARCH-01: allowlist the client operator. The per-mode switches below
		// interpolate $ctx->operator into the JSONPath expression and have no
		// default case, so an unrecognized operator silently produced no SQL (an
		// empty result set with no error). Coerce unknown operators to '='.
		$ctx->operator       = self::sanitize_date_q_operator($query_object->q_operator ?? null);

		// Set defaults on query_object
		$query_object->type = 'jsonb';

		return $ctx;
	}



	/**
	* SANITIZE_DATE_Q_OPERATOR
	* Allowlist the client-supplied search operator for date components. Unknown
	* values are coerced to '=' (and logged) so a malformed operator cannot
	* silently empty the whole search. The allowlist is the union of operators the
	* per-date-mode switches handle. (SEARCH-01)
	* @param string|null $q_operator
	* @return string
	*/
	private static function sanitize_date_q_operator(?string $q_operator) : string {

		$op = is_string($q_operator) ? trim($q_operator) : '';
		if ($op === '') {
			return '=';
		}

		$allowed = ['=', '<', '>', '<=', '>=', '!*', '*'];
		if (!in_array($op, $allowed, true)) {
			debug_log(__METHOD__
				. " Ignored unknown date q_operator (coerced to '='): " . to_string($op)
				, logger::WARNING
			);
			return '=';
		}

		return $op;
	}//end sanitize_date_q_operator



	/**
	* DISPATCH_DATE_MODE_SQL
	* Routes the SQO to the correct per-mode handler based on $ctx->date_mode, or delegates
	* to the Time Machine trait when the target table is a time-machine/activity table.
	*
	* Time-machine detection happens before the mode switch: if $ctx->table is
	* 'matrix_time_machine' or 'matrix_activity', all date modes are handled by
	* dispatch_date_mode_sql_tm() (from trait search_component_date_tm), which queries
	* the dedicated 'timestamp' column via DATE() / EXTRACT() rather than JSONB paths.
	*
	* The 'datetime' alias logs an ERROR and falls through to 'date_time' to maintain
	* backward compatibility with any client that sends the wrong mode string.
	*
	* Unknown modes call resolve_date_mode_unknown_sql() which logs an ERROR and returns
	* the unmodified $query_object (no sentence/params set), resulting in an empty result set.
	*
	* @param object  $query_object - The SQO to mutate.
	* @param ?object $q_object     - Normalised date value object (from extract_normalized_date_q).
	* @param object  $ctx          - Search context (from get_date_search_context).
	* @return object               - The mutated $query_object with sentence and params set.
	*/
	protected static function dispatch_date_mode_sql(object $query_object, ?object $q_object, object $ctx) : object {

		if($ctx->table === 'matrix_time_machine' || $ctx->table === 'matrix_activity'){
            // Use time machine specific dispatcher from trait search_component_relation_common_tm
            return self::dispatch_date_mode_sql_tm($query_object, $q_object, $ctx);
        }

		switch ($ctx->date_mode) {
			case 'date':
			case 'range':
				return self::resolve_date_mode_date_range_sql($query_object, $q_object, $ctx);

			case 'period':
				return self::resolve_date_mode_period_sql($query_object, $q_object, $ctx);

			case 'time':
				return self::resolve_date_mode_time_sql($query_object, $q_object, $ctx);

			case 'datetime':
				debug_log(__METHOD__ . " Received wrong mode 'datetime'. Fix to 'date_time'", logger::ERROR);
				// fallthrough
			case 'date_time':
				return self::resolve_date_mode_date_time_sql($query_object, $q_object, $ctx);

			default:
				return self::resolve_date_mode_unknown_sql($query_object, $q_object, $ctx);
		}
	}



	/**
	* EXTRACT_TIME_FROM_Q
	* Extracts a dd_date instance and its absolute-seconds integer from $q_object->{$field}.
	*
	* Returns a two-element array [$dd_date, $time]:
	*   - $dd_date : a new dd_date built from $q_object->{$field}, or null if the field is absent.
	*   - $time    : the pre-computed absolute seconds stored in $q_object->{$field}->time when
	*                available (integer cast); otherwise recomputed via dd_date::convert_date_to_seconds().
	*                Falls back to 0 if $dd_date is also null (should not happen in normal flow).
	*
	* $field defaults to 'start' for the common date/range/time/date_time modes. Pass 'period'
	* for the period mode handler which reads the 'period' container instead of 'start'.
	*
	* (!) $time is the raw start-of-period boundary. Callers that need the end-of-period boundary
	* for '=' / '<=' / '>' operators must also call get_final_search_range_seconds($dd_date).
	*
	* @param ?object $q_object - Normalised date value object (may be null for operator-only queries).
	* @param string  $field    = 'start' - The container field to read ('start', 'end', 'period').
	* @return array            - Two-element array: [?dd_date $dd_date, int $time].
	*/
	protected static function extract_time_from_q(?object $q_object, string $field = 'start') : array {
		$dd_date = isset($q_object->{$field}) ? new dd_date($q_object->{$field}) : null;
		$time = !empty($q_object->{$field}->time)
			? (int)$q_object->{$field}->time
			: (isset($dd_date) ? (int)dd_date::convert_date_to_seconds($dd_date) : 0);
		return [$dd_date, $time];
	}



	/**
	* RESOLVE_DATE_MODE_DATE_RANGE_SQL
	* Builds the JSONB @? predicate for 'date' and 'range' date modes.
	*
	* Operator semantics against start.time (all times are absolute seconds since epoch):
	*
	*   '<'  / '>='  — simple threshold on start.time. The client supplies an exact $time boundary;
	*                  no end-of-period expansion is needed because the query asks "starts before /
	*                  not before this moment".
	*
	*   '>'  / '<='  — threshold using the end-of-period $final_range so that a partial date such
	*                  as '1930' expands to the last second of 1930. This ensures "records that
	*                  start after 1930" correctly excludes records that started during 1930.
	*
	*   '='  (default) — range intersection: records where the stored [start.time, end.time]
	*                  interval overlaps the client's [time, final_range] window. The OR branch
	*                  catches records whose start falls inside [time, final_range] even when
	*                  end.time is absent (i.e. mode='date', single-start-only records).
	*
	* Resolves !* / * to a common handler first; those operators do not need a $time value at all.
	*
	* @param object  $query_object - The SQO to mutate; receives 'sentence' and 'params'.
	* @param ?object $q_object     - Normalised date value object.
	* @param object  $ctx          - Search context (component_tipo, column, table_alias, operator).
	* @return object               - The mutated $query_object.
	*/
	protected static function resolve_date_mode_date_range_sql(object $query_object, ?object $q_object, object $ctx) : object {

		if ($res = self::resolve_common_date_operators($query_object, $ctx)) return $res;

		[$dd_date, $time] = self::extract_time_from_q($q_object);

		switch ($ctx->operator) {
			case '<':
			case '>=':
				// Directional threshold: compare directly against start.time using the
				// exact $time value (start of the client's partial-date period).
				$query_object->sentence = "{$ctx->table_alias}.{$ctx->column} @? (_Q1_)::jsonpath";
				$query_object->params   = ['_Q1_' => "$.{$ctx->component_tipo}[*] ? (@.start.time {$ctx->operator} {$time})"];
				break;

			case '>':
			case '<=':
				// Use the end-of-period boundary ($final_range) so a partial date like '1930'
				// is treated as the last second of 1930, not its first second.
				$final_range = self::get_final_search_range_seconds($dd_date);
				$query_object->sentence = "{$ctx->table_alias}.{$ctx->column} @? (_Q1_)::jsonpath";
				$query_object->params   = ['_Q1_' => "$.{$ctx->component_tipo}[*] ? (@.start.time {$ctx->operator} {$final_range})"];
				break;

			case '=':
			default:
				// Equality/overlap: match records whose [start, end] interval intersects the
				// client's [time, final_range] window. The OR clause handles records that have no
				// 'end' sub-object (e.g. pure 'date' mode) by testing whether their start falls
				// anywhere inside the client's partial-date window.
				$final_range = self::get_final_search_range_seconds($dd_date);
				$Q1  = "$.{$ctx->component_tipo}[*] ? (";
				$Q1 .= "(@.start.time <= {$time} && @.end.time >= {$time}) || ";
				$Q1 .= "(@.start.time >= {$time} && @.start.time <= {$final_range})";
				$Q1 .= ")";
				$query_object->params   = ['_Q1_' => $Q1];
				$query_object->sentence = "{$ctx->table_alias}.{$ctx->column} @? (_Q1_)::jsonpath";
				break;
		}

		return $query_object;
	}



	/**
	* RESOLVE_DATE_MODE_PERIOD_SQL
	* Builds the JSONB @? predicate for 'period' date mode (durations such as centuries or decades).
	*
	* Period mode stores its value in a 'period' container (not 'start'/'end'), so extract_time_from_q()
	* is called with $field = 'period'. Only the '=' operator (exact period match) is currently
	* supported; all other operators fall through to the default '=' branch. This means directional
	* operators (>, <, <=, >=) silently behave as equality in this mode — a known limitation.
	*
	* Resolves !* / * to the common handler first.
	*
	* @param object  $query_object - The SQO to mutate; receives 'sentence' and 'params'.
	* @param ?object $q_object     - Normalised date value object.
	* @param object  $ctx          - Search context (component_tipo, column, table_alias, operator).
	* @return object               - The mutated $query_object.
	*/
	protected static function resolve_date_mode_period_sql(object $query_object, ?object $q_object, object $ctx) : object {

		if ($res = self::resolve_common_date_operators($query_object, $ctx)) return $res;

		[$dd_date, $time] = self::extract_time_from_q($q_object, 'period');

		switch ($ctx->operator) {
			case '=':
			default:
				$query_object->sentence = "{$ctx->table_alias}.{$ctx->column} @? (_Q1_)::jsonpath";
				$query_object->params   = ['_Q1_' => "$.{$ctx->component_tipo}[*] ? (@.period.time == {$time})"];
				break;
		}

		return $query_object;
	}



	/**
	* RESOLVE_DATE_MODE_TIME_SQL
	* Builds the JSONB @? predicate for 'time' date mode (clock-only values: HH:MM:SS).
	*
	* Operator semantics against start.time:
	*   '='  — range query using [time, final_range] to account for partial time inputs
	*           (e.g. '14' expands to 14:00:00–14:59:59).
	*   other — direct comparison against the exact $time value (start of the partial window).
	*
	* Resolves !* / * to the common handler first.
	*
	* @param object  $query_object - The SQO to mutate; receives 'sentence' and 'params'.
	* @param ?object $q_object     - Normalised date value object.
	* @param object  $ctx          - Search context (component_tipo, column, table_alias, operator).
	* @return object               - The mutated $query_object.
	*/
	protected static function resolve_date_mode_time_sql(object $query_object, ?object $q_object, object $ctx) : object {

		if ($res = self::resolve_common_date_operators($query_object, $ctx)) return $res;

		[$dd_date, $time] = self::extract_time_from_q($q_object);

		switch ($ctx->operator) {
			case '=':
				$final_range = self::get_final_search_range_seconds($dd_date);
				$query_object->sentence = "{$ctx->table_alias}.{$ctx->column} @? (_Q1_)::jsonpath";
				$query_object->params   = ['_Q1_' => "$.{$ctx->component_tipo}[*] ? (@.start.time >= {$time} && @.start.time <= {$final_range})"];
				break;

			default:
				$query_object->sentence = "{$ctx->table_alias}.{$ctx->column} @? (_Q1_)::jsonpath";
				$query_object->params   = ['_Q1_' => "$.{$ctx->component_tipo}[*] ? (@.start.time {$ctx->operator} {$time})"];
				break;
		}

		return $query_object;
	}



	/**
	* RESOLVE_DATE_MODE_DATE_TIME_SQL
	* Builds the JSONB @? predicate for 'date_time' mode (full date + clock fields in start).
	*
	* Operator semantics mirror the 'range' mode (the stored value is a single start container):
	*   '<'  / '>='  — threshold on start.time using the exact $time (start of partial period).
	*   '>'  / '<='  — threshold using $final_range (end-of-period boundary).
	*   '='  (default) — range window [time, final_range] on start.time only (no end container
	*                    in date_time mode, so no overlap check against end.time is needed).
	*
	* Resolves !* / * to the common handler first.
	*
	* @param object  $query_object - The SQO to mutate; receives 'sentence' and 'params'.
	* @param ?object $q_object     - Normalised date value object.
	* @param object  $ctx          - Search context (component_tipo, column, table_alias, operator).
	* @return object               - The mutated $query_object.
	*/
	protected static function resolve_date_mode_date_time_sql(object $query_object, ?object $q_object, object $ctx) : object {

		if ($res = self::resolve_common_date_operators($query_object, $ctx)) return $res;

		[$dd_date, $time] = self::extract_time_from_q($q_object);
		$final_range = self::get_final_search_range_seconds($dd_date);

		switch ($ctx->operator) {
			case '<':
			case '>=':
				$query_object->sentence = "{$ctx->table_alias}.{$ctx->column} @? (_Q1_)::jsonpath";
				$query_object->params   = ['_Q1_' => "$.{$ctx->component_tipo}[*] ? (@.start.time {$ctx->operator} {$time})"];
				break;

			case '>':
			case '<=':
				$query_object->sentence = "{$ctx->table_alias}.{$ctx->column} @? (_Q1_)::jsonpath";
				$query_object->params   = ['_Q1_' => "$.{$ctx->component_tipo}[*] ? (@.start.time {$ctx->operator} {$final_range})"];
				break;

			case '=':
			default:
				$query_object->sentence = "{$ctx->table_alias}.{$ctx->column} @? (_Q1_)::jsonpath";
				$query_object->params   = ['_Q1_' => "$.{$ctx->component_tipo}[*] ? (@.start.time >= {$time} && @.start.time <= {$final_range})"];
				break;
		}

		return $query_object;
	}



	/**
	* RESOLVE_DATE_MODE_UNKNOWN_SQL
	* Fallback handler for unrecognised date_mode values.
	*
	* Resolves !* / * to the common handler first (empty/not-empty checks are mode-agnostic).
	* For all other operators, logs an ERROR and returns $query_object unmodified — no 'sentence'
	* or 'params' will be set, which causes the search engine to produce an empty result set.
	*
	* This is a safety net; callers should validate date_mode at setup time via the ontology.
	*
	* @param object  $query_object - The SQO (returned unmodified unless the !* or * operator matches).
	* @param ?object $q_object     - Normalised date value object (not used in this handler).
	* @param object  $ctx          - Search context; $ctx->date_mode is included in the log message.
	* @return object               - The (possibly unmodified) $query_object.
	*/
	protected static function resolve_date_mode_unknown_sql(object $query_object, ?object $q_object, object $ctx) : object {

		if ($res = self::resolve_common_date_operators($query_object, $ctx)) return $res;

		debug_log(__METHOD__ . " Unable to resolve query for unknown date_mode: {$ctx->date_mode}", logger::ERROR);
		return $query_object;
	}



	/**
	* RESOLVE_COMMON_DATE_OPERATORS
	* Short-circuits the per-mode handlers for the two mode-agnostic existence operators.
	*
	*   '!*' — "is empty": matches records where the component's tipo key is absent from the JSONB
	*           column or has no array elements. Uses NOT (@? '$.tipo[*]').
	*   '*'  — "is not empty": matches records that have at least one element. Uses (@? '$.tipo[*]').
	*
	* Called at the top of every per-mode handler before any date-value extraction. Returns the
	* populated $query_object so the caller can return it immediately, or null when the operator
	* is not one of the two existence operators (indicating the caller should continue to its
	* own operator switch).
	*
	* @param object $query_object - The SQO; receives 'sentence' when an existence operator matches.
	* @param object $ctx          - Search context; provides component_tipo, table_alias, column.
	* @return object|null         - Populated $query_object for !* / * operators, or null otherwise.
	*/
	protected static function resolve_common_date_operators(object $query_object, object $ctx) : object|null {
		switch ($ctx->operator) {
			case '!*':
				$query_object->sentence = "NOT ({$ctx->table_alias}.{$ctx->column} @? '$.{$ctx->component_tipo}[*]')";
				return $query_object;
			case '*':
				$query_object->sentence = "({$ctx->table_alias}.{$ctx->column} @? '$.{$ctx->component_tipo}[*]')";
				return $query_object;
		}
		return null;
	}



	/**
	* SEARCH_OPERATORS_INFO
	* Returns the set of operators available for searching a date component, keyed by operator
	* symbol and valued by a UI-facing label key.
	*
	* This list drives the operator selector in the search UI. It is intentionally a subset of
	* all possible SQL operators: note that '=' (exact / partial-date window) is absent from the
	* returned array because the UI treats it as the implicit default when no operator is chosen.
	*
	* All operators listed here are also in the sanitize_date_q_operator() allowlist (SEARCH-01).
	*
	* @return array<string,string> - Map of operator symbol → label key (e.g. ['!*' => 'empty']).
	*/
	public function search_operators_info() : array {

		$ar_operators = [
			'!*' 	=> 'empty', // Checked 13-01-2026
			'*' 	=> 'no_empty', // Checked 13-01-2026
			'>=' 	=> 'greater_than_or_equal', // Checked 13-01-2026
			'<='	=> 'less_than_or_equal', // Checked 13-01-2026
			'>' 	=> 'greater_than', // Checked 13-01-2026
			'<'		=> 'less_than' // Checked 13-01-2026
		];

		return $ar_operators;
	}//end search_operators_info



	/**
	* BUILD_ORDER_SELECT
	* Builds the SQL SELECT expression that extracts the sort key for ORDER BY on a date component.
	*
	* Uses jsonb_path_query_first() to pull the first 'start.time' integer from the component's
	* JSONB array, casts it to bigint, and aliases it as $options->alias. Callers include this
	* expression in the SELECT list and then ORDER BY the alias.
	*
	* The ::bigint cast is critical: without it the extracted value is a text string and ordering
	* would be lexicographic rather than numeric (e.g. '10' < '2' as text, 2 < 10 as integer).
	*
	* Currently always reads 'start.time'. The @TODO inside the method notes a future need to
	* support sorting by 'end.time' as well (e.g. for range mode where end defines the record
	* boundary). Until then, all date components sort by the start of their first date entry.
	*
	* @param object $options - Configuration object with the following properties:
	*   @var string $table_name    - Table name or alias (e.g. 'mix', 'rs197_rs279_dd64').
	*   @var string $column        - JSONB data column name (e.g. 'string', 'text').
	*   @var string $component_tipo - Ontology tipo for the component (e.g. 'dd199').
	*   @var string $alias         - SQL alias for the ORDER BY column (e.g. 'date_order').
	* @return string               - A complete SQL SELECT expression ending with "AS $alias".
	*/
	public static function build_order_select(object $options) : string {

		$table_name		= $options->table_name;
		$column			= $options->column;
		$component_tipo	= $options->component_tipo;
		$alias			= $options->alias;

		/*
		* SQL Example:
		* (jsonb_path_query_first(
		* 	your_table.string->'dd199',
		* 	'$[*].start.time'
		* ) #>> '{}')::bigint AS date_order  -- cast to bigint for numeric sort
		*
		* Note: why ::bigint matters
		* 	Without it, the result is a string, and sorting would be lexicographic (e.g., '10' < '2').
		* 	With ::bigint, the result is a number, and sorting is numeric (e.g., 2 < 10).
		*/

		// entry point. Default is 'start'
		// @TODO: Dynamically change to use `end` time for sort records.
		$entry_point = 'start';

		// select sentence add as order column
		$select_sentence  = "(jsonb_path_query_first(";
		$select_sentence .= "{$table_name}.{$column}->'{$component_tipo}',";
		$select_sentence .= "'$[*].{$entry_point}.time'";
		$select_sentence .= ") #>> '{}')::bigint AS $alias";


		return $select_sentence;
	}//end build_order_select



}//end search_component_date