<?php declare(strict_types=1);
/**
* TRAIT SEARCH_COMPONENT_DATE
* From class component_date
* Common search methods for date components
*/
trait search_component_date {



    /**
	* RESOLVE_QUERY_OBJECT_SQL
	* @param object $request_query_object
	* @return object|false $query_object
	*/
	public static function resolve_query_object_sql(object $query_object) : object|false {

		// q array safe. Note that $query_object->q v6 is array (before was string) but only one element is expected. So select the first one
		$query_object->q = is_array($query_object->q) ? reset($query_object->q) : $query_object->q;
		if (empty($query_object->q) && empty($query_object->q_operator)) {
			return $query_object;
		}
		
		// column
		$column = section_record_data::get_column_name( get_called_class() );
		
		// table_alias
		$table_alias = $query_object->table_alias;

		// q_object
		$q_object = $query_object->q ?? null;

		// q plain text case
		if (!is_object($q_object)) {
			// Check for operators and date elements

			// Note that here the order is inverse: YY-MM-DD (in component is DD-MM-YY)
			#preg_match("/^(>=|<=|>|<)?([0-9]{1,10})(-(1[0-2]|[1-9]))?(-(3[01]|[12][0-9]|[1-9]))?$/", $query_object->q, $matches);
			preg_match("/^(\W{1,2})?([0-9]{1,10})-?([0-9]{1,2})?-?([0-9]{1,2})?$/", trim($query_object->q), $matches);
			if (isset($matches[0])) {

				$key_op		= 1;
				$key_year	= 2;
				$key_month	= 3;
				$key_day	= 4;

				$op = $matches[$key_op];

				$base_date = new stdClass();
					$base_date->year = $matches[$key_year];
					if(!empty($matches[$key_month]) && $matches[$key_month]<=12){
						$base_date->month = $matches[$key_month];
						if (!empty($matches[$key_day]) && $matches[$key_day]<=31) {
							$base_date->day = $matches[$key_day];
						}
					}

				$dd_date	= new dd_date($base_date);
				$time		= dd_date::convert_date_to_seconds($dd_date);
				$dd_date->set_time($time);
				$dd_date->set_op($op);

				// Encapsulate object in start property to follow new date format (2018-09-19)
				$date_default_obj = new stdClass();
					$date_default_obj->start = $dd_date;

				// Replace q_object
				$q_object = $date_default_obj;

			}else if (empty($query_object->q_operator)) {

				$query_object->operator = '=';
				$query_object->q_parsed	= "'INVALID VALUE!'";

				return $query_object;
			}
		}

		// short vars
		$q_operator					= isset($query_object->q_operator) ? $query_object->q_operator : null;
		$operator					= !empty($q_operator) ? trim($q_operator) : '=';
		$component_tipo				= end($query_object->path)->component_tipo;
		$ontology_node				= ontology_node::get_instance($component_tipo);
		$properties					= $ontology_node->get_properties();
		$date_mode					= isset($properties->date_mode) ? $properties->date_mode : 'date';
		$query_object->data_path	= ['components',$component_tipo,'dato',DEDALO_DATA_NOLAN];
		$query_object->type			= 'jsonb';


		// date_mode cases
		switch ($date_mode) {

			case 'date':
			case 'range':
				// DATE and RANGE modes
				// Handles both single dates and date ranges with start/end times.
				// Converts dates to Unix timestamps (seconds) for numeric comparison.
				// Date precision (day/month/year) is handled by calculating final_range.
				// Index optimization: Uses @? JSON Path operator for GIN index support.
				
				// search_object 1
				// Extract directly from calculated time in JAVASCRIPT
				$dd_date	= isset($q_object->start) ? new dd_date($q_object->start) : null;
				$q_clean	= !empty($q_object->start->time)
					? $q_object->start->time
					: (isset($dd_date) ? dd_date::convert_date_to_seconds($dd_date) : 0);

				// operator conditionals
				switch ($operator) {
					case '<':
					case '>=':
						// LESS THAN (<) and GREATER OR EQUAL (>=)
						// Direct numeric comparison using the start.time value.
						// Checks if any date element's start time matches the condition.
						// JSON Path: Filters array elements where start.time meets operator condition.
						$query_object->sentence = "{$table_alias}.{$column} @? (_Q1_)::jsonpath";
						$query_object->params = ['_Q1_' => "$.{$component_tipo}[*] ? (@.start.time {$operator} {$q_clean})" ];
						
						// set final_query_object
						$final_query_object = $query_object;
						break;

					case '>':
					case '<=':
						// GREATER THAN (>) and LESS OR EQUAL (<=)
						// Uses final_range to account for date precision (day, month, or year).
						// Example: "2024-03" searches through end of March (2024-03-31 23:59:59).
						// JSON Path: Compares start.time against the end of the precision range.
						$final_range = self::get_final_search_range_seconds($dd_date);

						$query_object->sentence = "{$table_alias}.{$column} @? (_Q1_)::jsonpath";
						$query_object->params = ['_Q1_' => "$.{$component_tipo}[*] ? (@.start.time {$operator} $final_range)" ];
						
						// set final_query_object
						$final_query_object = $query_object;
						break;

					case '!*': // IS NULL (Empty)
						// EMPTY VALUE (!*)
						// Matches records where no date elements exist for this component.
						// JSON Path: Checks for absence of any array elements.
						$query_object->sentence = "NOT ({$table_alias}.{$column} @? '$.{$component_tipo}[*]')";
						$final_query_object = $query_object;
						break;

					case '*': // IS NOT NULL (Not Empty)
						$query_object->sentence = "({$table_alias}.{$column} @? '$.{$component_tipo}[*]')";
						$final_query_object = $query_object;
						break;

					case '=':
					default:
						// EQUALS (=) - Default operator
						// Matches dates that overlap with or fall within the search date's precision range.
						// Logic handles both:
						//   1. Search date falls within a stored range (start <= search <= end)
						//   2. Stored date falls within search precision (start >= search && start <= final_range)
						// Example: Searching "2024-03" matches any date in March 2024.
						$final_range = self::get_final_search_range_seconds($dd_date);

					// SELECT section_id, section_tipo, date
					// FROM matrix
					// WHERE date @? '$.mdcat1968[*] ? (
					// (@.start.time <= 62322912000 && @.end.time >= 62322912000) ||
					// (@.start.time >= 62322912000 && @.start.time <= 62322912000 + 3600)
					// )';
					
					// params
					$Q1  = "$.{$component_tipo}[*] ? (";	
					$Q1 .= "(@.start.time <= {$q_clean} && @.end.time >= {$q_clean}) ||";
					$Q1 .= "(@.start.time >= {$q_clean} && @.start.time <= {$final_range})";
					$Q1 .= ")";
					$query_object->params = ['_Q1_' => $Q1];
					
					// sentence
					$query_object->sentence = "{$table_alias}.{$column} @? (_Q1_)::jsonpath";

					// set final_query_object
					$final_query_object = $query_object;
					break;
				}
				break;

			case 'period':
				// PERIOD mode
				// Represents historical periods (e.g., "Bronze Age", "Medieval Period").
				// Stores as a single calculated time value in period.time.
				// Index optimization: Uses @? for GIN index support.
				
				// Extract directly from calculated time in JAVASCRIPT
				$dd_date	= isset($q_object->period) ? new dd_date($q_object->period) : null;
				$q_clean	= !empty($q_object->period->time)
					? $q_object->period->time
					: (isset($dd_date) ? dd_date::convert_date_to_seconds($dd_date) : 0);

				switch ($operator) {
					case '!*': // IS NULL (Empty)
						$query_object->sentence = "NOT ({$table_alias}.{$column} @? '$.{$component_tipo}[*]')";
						$final_query_object = $query_object;
						break;

					case '*': // IS NOT NULL (Not Empty)
						$query_object->sentence = "({$table_alias}.{$column} @? '$.{$component_tipo}[*]')";
						$final_query_object = $query_object;
						break;

					case '=':
					default:
						// EQUALS (=) - Default operator
						// Exact period match by calculated time value.
						// JSON Path: Checks if period.time equals the search value.
						$query_object->sentence = "{$table_alias}.{$column} @? (_Q1_)::jsonpath";
						$query_object->params = ['_Q1_' => "$.{$component_tipo}[*] ? (@.period.time == {$q_clean})" ];
						$final_query_object = $query_object;
						break;
				}
				break;

			case 'time':
				// TIME mode
				// Handles time-of-day values (hours:minutes:seconds).
				// Stored as Unix timestamps representing time since epoch.
				// Precision range accounts for seconds if not specified.
				// Index optimization: Uses @? for GIN index support.
				
				// Extract directly from calculated time in JAVASCRIPT
				$dd_date	= isset($q_object->start) ? new dd_date($q_object->start) : null;
				$q_clean	= !empty($q_object->start->time)
					? $q_object->start->time
					: (isset($dd_date) ? dd_date::convert_date_to_seconds($dd_date) : 0);

				// operator conditionals
				switch ($operator) {
					case '=':
						// EQUALS (=)
						// Exact time match within precision range (e.g., 14:30 matches 14:30:00-14:30:59).
						// Uses final_range to include all seconds within the specified precision.
						// JSON Path: Range check ensures start.time falls within precision window.
						$final_range = $q_clean + self::get_final_search_range_seconds($dd_date);
						$query_object->sentence = "{$table_alias}.{$column} @? (_Q1_)::jsonpath";
						$query_object->params = ['_Q1_' => "$.{$component_tipo}[*] ? (@.start.time >= {$q_clean} && @.start.time <= {$final_range})" ];
						$final_query_object = $query_object;
						break;

					case '!*': // IS NULL (Empty)
						$query_object->sentence = "NOT ({$table_alias}.{$column} @? '$.{$component_tipo}[*]')";
						$final_query_object = $query_object;
						break;

					case '*': // IS NOT NULL (Not Empty)
						$query_object->sentence = "({$table_alias}.{$column} @? '$.{$component_tipo}[*]')";
						$final_query_object = $query_object;
						break;

					default:
						// COMPARISON OPERATORS (<, >, <=, >=)
						// Direct numeric comparison of time values.
						// JSON Path: Filters elements where start.time meets operator condition.
						$query_object->sentence = "{$table_alias}.{$column} @? (_Q1_)::jsonpath";
						$query_object->params = ['_Q1_' => "$.{$component_tipo}[*] ? (@.start.time {$operator} {$q_clean})"];
						$final_query_object = $query_object;
						break;
				}
				break;

			case 'datetime':
				// DEPRECATED: 'datetime' mode name
				// Log error for incorrect mode name and continue as 'date_time'.
				debug_log(__METHOD__
					. " Received wrong mode 'datetime'. Fix the date mode to 'date_time' " . PHP_EOL
					. to_string( debug_backtrace()[0] )
					, logger::ERROR
				);
				// don't break here !

			case 'date_time':
				// DATE_TIME mode
				// Combines date and time (e.g., "2024-03-15 14:30:00").
				// Handles both full datetime and partial specifications (date only, date+hour, etc.).
				// Precision range calculated based on what fields are specified.
				// Index optimization: Uses @? for GIN index support.
				
				// Extract directly from calculated time in JAVASCRIPT
				$dd_date		= isset($q_object->start) ? new dd_date($q_object->start) : null;
				$final_range	= self::get_final_search_range_seconds($dd_date);
				$q_clean		= !empty($q_object->start->time)
					? $q_object->start->time
					: (isset($dd_date) ? dd_date::convert_date_to_seconds($dd_date) : 0);

				// sample 'dd547' (Activity)
				switch ($operator) {
					case '!*': // IS NULL (Empty)
						$query_object->sentence = "NOT ({$table_alias}.{$column} @? '$.{$component_tipo}[*]')";
						$final_query_object = $query_object;
						break;

					case '*': // IS NOT NULL (Not Empty)
						// NOT EMPTY (*)
						// Matches records with at least one datetime element.
						$query_object->sentence = "({$table_alias}.{$column} @? '$.{$component_tipo}[*]')";
						$final_query_object = $query_object;
						break;

					case '<':
					case '>=':
						// LESS THAN (<) and GREATER OR EQUAL (>=)
						// Compares with the start of the datetime.
						// JSON Path: Direct start.time comparison.
						$query_object->sentence = "{$table_alias}.{$column} @? (_Q1_)::jsonpath";
						$query_object->params = ['_Q1_' => "$.{$component_tipo}[*] ? (@.start.time {$operator} {$q_clean})"];
						$final_query_object = $query_object;
						break;

					case '>':
					case '<=':
						// GREATER THAN (>) and LESS OR EQUAL (<=)
						// Compares with the end of the datetime precision range.
						// Example: "2024-03-15 14:00" compares through end of that minute.
						// JSON Path: Compares start.time against final_range.
						$query_object->sentence = "{$table_alias}.{$column} @? (_Q1_)::jsonpath";
						$query_object->params = ['_Q1_' => "$.{$component_tipo}[*] ? (@.start.time {$operator} {$final_range})"];
						$final_query_object = $query_object;
						break;

					case '=':
					default:
						// EQUALS (=) - Default operator
						// Matches datetimes within the specified precision range.
						// Example: "2024-03-15 14:00" matches all times in that minute (14:00:00-14:00:59).
						// JSON Path: Range check ensures start.time falls within precision window.
						$query_object->sentence = "{$table_alias}.{$column} @? (_Q1_)::jsonpath";
						$query_object->params = ['_Q1_' => "$.{$component_tipo}[*] ? (@.start.time >= {$q_clean} && @.start.time <= {$final_range})"];
						$final_query_object = $query_object;
						break;
				}
				break;

			default:
				// UNKNOWN date_mode
				// Fallback to basic empty/not-empty checks only.
				switch ($operator) {
					case '!*': // IS NULL (Empty)
						// EMPTY VALUE (!*)
						// Matches records with no date elements (unknown mode fallback).
						$query_object->sentence = "NOT ({$table_alias}.{$column} @? '$.{$component_tipo}[*]')";
						$final_query_object = $query_object;
						break;

					case '*': // IS NOT NULL (Not Empty)
						// NOT EMPTY (*)
						// Matches records with at least one date element (unknown mode fallback).
						$query_object->sentence = "({$table_alias}.{$column} @? '$.{$component_tipo}[*]')";
						$final_query_object = $query_object;
						break;
				}
				break;
		}//end switch ($date_mode)

		// catch non defined $final_query_object cases
		if (!isset($final_query_object)) {
			$final_query_object = $query_object;
			debug_log(__METHOD__
				. " Unable to resolve current query_object. Using original query_object to continue " . PHP_EOL
				.' date_mode: ' . $date_mode . PHP_EOL
				.' operator: '  . $operator . PHP_EOL
				.' query_object: ' . to_string($query_object)
				, logger::ERROR
			);
		}


		return $final_query_object;
	}//end resolve_query_object_sql



	/**
	* SEARCH_OPERATORS_INFO
	* Return valid operators for search in current component
	* @return array $ar_operators
	*/
	public function search_operators_info() : array {

		$ar_operators = [
			'>=' 	=> 'greater_than_or_equal',
			'<='	=> 'less_than_or_equal',
			'>' 	=> 'greater_than',
			'<'		=> 'less_than',
			'*' 	=> 'no_empty', // not null
			'!*' 	=> 'empty', // null
		];

		return $ar_operators;
	}//end search_operators_info



}//end search_component_date