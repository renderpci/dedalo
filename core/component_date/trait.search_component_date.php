<?php declare(strict_types=1);
/**
* TRAIT SEARCH_COMPONENT_DATE
* From class component_date
* Common search methods for date components
*/
trait search_component_date {



    /**
	* RESOLVE_QUERY_OBJECT_SQL
	* Parses the given $query_object to construct SQL sentences and parameters for database querying.
	* Handles various date modes: 'date', 'range', 'period', 'time', and 'date_time'.
	*
	* @param object $query_object The search query object containing parameters.
	* @return object|false The modified query_object with 'sentence' and 'params', or false if unresolvable.
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
    * Normalizes the search value (q) and parses string inputs into date objects.
    */
    protected static function extract_normalized_date_q(object $query_object) : object|null|false {
        
        // Ensure q is a single value
        $q = is_array($query_object->q) ? reset($query_object->q) : $query_object->q;
        
        if (empty($q) && empty($query_object->q_operator)) {
            return false;
        }

        if (is_object($q)) {
            return $q;
        }

        // q plain text case
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

            $dd_date = new dd_date($base_date);
            $time    = dd_date::convert_date_to_seconds($dd_date);
            $dd_date->set_time((int)$time);
            $dd_date->set_op($op);

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
    * Validates the path and collects necessary metadata for SQL generation.
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
        $ctx->date_mode      = $properties->date_mode ?? 'date';
        $ctx->operator       = !empty($query_object->q_operator) ? trim($query_object->q_operator) : '=';

        // Set defaults on query_object
        $query_object->type = 'jsonb';

        return $ctx;
    }



    /**
    * DISPATCH_DATE_MODE_SQL
    * Routes the search resolution to the correct date mode handler.
    */
    protected static function dispatch_date_mode_sql(object $query_object, ?object $q_object, object $ctx) : object {

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
    * Helper to extract dd_date and unix timestamp from the query object.
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
    * Handles searches for 'date' and 'range' modes.
	* Translation: Match specific date or date range.
	* Technical Logic: (column @? jsonpath) using @.start.time and @.end.time.
	* What it returns: Records where the provided date falls within the record's range or matches the record's date.
    */
    protected static function resolve_date_mode_date_range_sql(object $query_object, ?object $q_object, object $ctx) : object {
        
        if ($res = self::resolve_common_date_operators($query_object, $ctx)) return $res;

        [$dd_date, $time] = self::extract_time_from_q($q_object);

        switch ($ctx->operator) {
            case '<':
            case '>=':
                $query_object->sentence = "{$ctx->table_alias}.{$ctx->column} @? (_Q1_)::jsonpath";
                $query_object->params   = ['_Q1_' => "$.{$ctx->component_tipo}[*] ? (@.start.time {$ctx->operator} {$time})"];
                break;

            case '>':
            case '<=':
                $final_range = self::get_final_search_range_seconds($dd_date);
                $query_object->sentence = "{$ctx->table_alias}.{$ctx->column} @? (_Q1_)::jsonpath";
                $query_object->params   = ['_Q1_' => "$.{$ctx->component_tipo}[*] ? (@.start.time {$ctx->operator} {$final_range})"];
                break;

            case '=':
            default:
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
    * Handles searches for 'period' mode (e.g. centuries, decades).
	* Translation: Match specific period.
	* Technical Logic: (column @? jsonpath) using @.period.time.
	* What it returns: Records whose period matches the query.
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
    * Handles searches for 'time' mode.
	* Translation: Match specific time.
	* Technical Logic: (column @? jsonpath) using @.start.time.
	* What it returns: Records where the time matches or falls within the logic of the operator.
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
    * Handles searches for 'date_time' mode.
	* Translation: Match specific date and time.
	* Technical Logic: (column @? jsonpath) using @.start.time.
	* What it returns: Records where the full date and time match the query pattern.
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
    */
    protected static function resolve_date_mode_unknown_sql(object $query_object, ?object $q_object, object $ctx) : object {
        
        if ($res = self::resolve_common_date_operators($query_object, $ctx)) return $res;

        debug_log(__METHOD__ . " Unable to resolve query for unknown date_mode: {$ctx->date_mode}", logger::ERROR);
        return $query_object;
    }



    /**
    * RESOLVE_COMMON_DATE_OPERATORS
    * Handles !* (empty) and * (not empty) operators which are common to all modes.
	* Translation: "Is empty" / "Is not empty".
	* Technical Logic: EXISTS / NOT EXISTS using jsonpath (column @? '$.key[*]').
	* What it returns: Records with or without any data in the component.
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
	* Return valid operators for search in current component
	* @return array $ar_operators
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



}//end search_component_date