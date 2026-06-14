<?php declare(strict_types=1);
/**
* MDCAT CALCULATION FORMULAS
* Domain-specific processing functions for the mdcat (Museu de les Cultures)
* calculation widget, covering pension/benefit-duration and monetary conversions.
*
* Responsibilities:
* - Compute human-readable time periods (years/months/days) from a raw day count.
* - Calculate major and minor pension import amounts based on duration brackets.
* - Convert pesetas to euros using the fixed 1999 exchange rate.
* - Compute the number of days between two Unix timestamps (date range → days).
* - Apply a manual override to a calculated day count.
* - Subtract one calculated total from another.
* - Determine the final payable amount after applying manual overrides and deductions.
*
* Invocation model (shared with core/widgets/calculation/):
* - Each function is referenced by an IPO "process" block in the ontology:
*     { "fn": "<name>", "file": "/mdcat/calculation/mdcat.php", "engine": "php" }
* - class.calculation::resolve_logic() (SEC-052) confines the include to
*   DEDALO_WIDGETS_PATH, validates the function name, then calls $fn($arg).
* - $arg carries:
*     $arg->data    — stdClass keyed by component var_name (values from resolve_data())
*     $arg->options — options object from the IPO process block
*     $arg->caller_section_tipo — tipo of the section that owns the widget (optional)
* - Each function MUST return an array of stdClass objects with at least 'id' and
*   'value' properties, matching the ids declared in the IPO "output" map, so that
*   render_calculation.js can hydrate the display.
*
* @package Dédalo
* @subpackage Widgets
*/


// expressos



	/**
	* CALCULATE_PERIOD
	* Decompose a total day count into a human-readable period of years, months,
	* and/or remaining days, controlled by the caller's options flags.
	*
	* The function accepts either a raw stdClass produced by resolve_logic() or a
	* JSON-encoded string of the same shape, so it can be called from both the PHP
	* widget engine and ad-hoc test contexts.
	*
	* Input shape ($request_options->data):
	*   total_days — array of int, summed to get the aggregate day count.
	*
	* Input shape ($request_options->options):
	*   years   bool  — include years segment in the result.
	*   months  bool  — include months segment (or total_months when total===true).
	*   days    bool  — include days segment (or total_days when total===true).
	*   total   bool  — when true, emit cumulative totals (total_months / total_days)
	*                   instead of the within-year remainder; changes the id key too.
	*
	* Month duration constant: 30.42 days (average of 365 / 12), applied uniformly
	* to avoid calendar ambiguity.
	*
	* Return shape: array of stdClass { id: string, value: int }.
	*   Each present segment becomes one element; absent segments are omitted entirely.
	*   Possible ids: 'years', 'months'|'total_months', 'days'|'total_days'.
	*   An empty array is returned when $total_days is non-numeric or all flags are
	*   false / segment values are zero.
	*
	* @param object|string $request_options - unified IPO arg object or its JSON encoding
	* @return array - array of stdClass period segments, possibly empty on invalid input
	*/
	function calculate_period($request_options) : array {

		$params = is_string($request_options)
			? json_decode($request_options)
			: $request_options;

		$data				= $params->data;
		$options			= $params->options;
		$data_total_days	= is_array($data->total_days) ? $data->total_days : [];
		$total_days			= array_sum($data_total_days); //$data->total_days;
		$month_days			= 30.42;

		// check value
		if (!is_numeric($total_days)) {
			debug_log(__METHOD__
				. " Invalid total days value (non numeric) " . PHP_EOL
				. ' total_days: ' . to_string($total_days) . PHP_EOL
				. ' request_options: ' . to_string($request_options)
				, logger::ERROR
			);
			return [];
		}

		$years         = floor($total_days / 365);
		$years_days    = $total_days - ($years * 365);
		$total_months  = floor($total_days / $month_days);

		$months        = floor($years_days / $month_days);
		$days          = floor($years_days - ($months * $month_days)); // error in the original calculation the * need to be floor also if not always count 1 day minus

		$period = [];

		// $years
			if($years > 0 && $options->years === true){

				$period[] = (object)[
					'id' => 'years',
					'value' => $years
				];
			}

		// $months
			if($months > 0 && $options->months === true){

				$current_id    = ($options->total === true) ? 'total_months' : 'months';
				$current_value = ($options->total === true) ? $total_months : $months;

				$period[] = (object)[
					'id' => $current_id,
					'value' => $current_value,
				];
			}

		// $days
		   if($days > 0 && $options->days === true){

				$current_id    = ($options->total === true) ? 'total_days' : 'days';
				$current_value = ($options->total === true) ? $total_days : $days;

				$period[] = (object)[
					'id' => $current_id,
					'value' => $current_value,
				];
			}


		return $period;
	}//end calculate_period



	/**
	* CALCULATE_IMPORT_MAJOR
	* Calculate the gross pension import for an "adult" (major) beneficiary based
	* on total exposure duration in days, using the mdcat fixed tariff schedule.
	*
	* Tariff rules (as of the original implementation):
	* - Duration ≤ 6 months → flat 150 000 pts.
	* - Duration > 6 months → 150 000 + (extra_months × 28 000) pts.
	* - Hard ceiling: 1 000 000 pts regardless of duration.
	* - A fractional residual day is rounded up to a full extra month before
	*   applying the bracket test ($total_months + 1 when $days > 0).
	*
	* The month length constant here uses 30.4 days (not 30.42 as in
	* calculate_period) for the residual-day check — this is intentional: the
	* two constants serve different purposes (period display vs. bracket rounding).
	*
	* (!) The declared return type is absent (no `: array` hint) but the function
	*     returns 0 (int) when $total_days === 0 and an array otherwise — the
	*     return type is therefore mixed (int|array). This inconsistency is a
	*     pre-existing issue; do not assume `array` from the doc-block alone.
	*
	* @param object $options - unified IPO arg (options->data->total_days: array of int)
	* @return int|array - 0 when total_days is zero; otherwise array of stdClass { id, value }
	*/
	function calculate_import_major(object $options) {

		$data = $options->data;
		$total_days = array_sum($data->total_days);
		if($total_days === 0){
			return 0;
		}

		$years            = floor($total_days / 365);
		$years_days       = $total_days - ($years * 365);
		$total_months     = floor($total_days / 30.42);

		$days             = floor($total_days - ($total_months * 30.4));

		$cal_import = 0;

		if($days > 0){
			$total_months = $total_months + 1;
		}

		if($total_months <= 6){
			$cal_import = 150000;
		}else{
			$cal_import = (($total_months - 6) * 28000) + 150000;
		}
		if ($cal_import > 1000000) {
			$cal_import = 1000000;
		}

		$result = [
			(object)[
				'id'	=> 'total',
				'value'	=> $cal_import
			]
		];

		return $result;
	}//end calculate_import_major



	/**
	* CALCULATE_IMPORT_MINOR
	* Calculate the gross pension import for a "minor" (child) beneficiary based
	* on total exposure duration in days, using the mdcat fixed tariff schedule.
	*
	* Tariff rules (as of the original implementation):
	* - Duration ≤ 6 months → flat 900 pts.
	* - Duration > 6 months → 900 + (extra_months × 170) pts.
	* - Hard ceiling: 6 010 pts regardless of duration.
	* - Fractional residual days round up to a full extra month (same as major).
	*
	* The month constant for the residual-day check is 30.4 (not 30.42 used in
	* calculate_period), mirroring the same convention as calculate_import_major.
	*
	* (!) The return type hint is `: array` but the function returns 0 (int) when
	*     $total_days === 0, making the real return type int|array. This is a
	*     pre-existing inconsistency with the declared hint and the `: array` on
	*     line 137; do not rely on the hint for the zero case.
	*
	* @param object $options - unified IPO arg (options->data->total_days: array of int)
	* @return int|array - 0 when total_days is zero; otherwise array of stdClass { id, value }
	*/
	function calculate_import_minor(object $options) : array {

		$data = $options->data;
		$total_days = array_sum($data->total_days);
		if($total_days === 0){
			return 0;
		}

		$years			= floor($total_days / 365);
		$years_days		= $total_days - ($years * 365);
		$total_months	= floor($total_days / 30.42);
		$days			= floor($total_days - ($total_months * 30.4));

		$cal_import = 0;

		if($days > 0){
			$total_months = $total_months + 1;
		}
		if($total_months <= 6){
			$cal_import = 900;
		}else{
			$cal_import = (($total_months - 6) * 170) +900;
		}
		if ($cal_import > 6010) {
			$cal_import = 6010;
		}

		// $result = $cal_import;
		$result = [
			(object)[
				'id'	=> 'total',
				'value'	=> $cal_import
			]
		];

		return $result;
	}//end calculate_import_minor



	/**
	* TO_EUROS
	* Convert a monetary amount from Spanish pesetas to euros using the official
	* fixed exchange rate (1 EUR = 166.386 ESP), rounded to 2 decimal places.
	*
	* This function is used to convert historical peseta values stored in the
	* mdcat dataset to their euro equivalent for display and reporting. The rate
	* is the irrevocable EU conversion rate established on 1 January 1999.
	*
	* The function accepts either the raw stdClass arg from resolve_logic() or a
	* JSON-encoded string, matching the same dual-input pattern as calculate_period().
	*
	* Input shape ($options->data):
	*   number — array of numeric values; summed before conversion. Empty or absent
	*            array produces a zero result without an error.
	*
	* @param object|string $request_options - unified IPO arg object or its JSON encoding
	* @return array - single-element array: [ stdClass { id: 'total', value: float } ]
	*                 Returns [] on invalid (non-numeric) number input.
	*/
	function to_euros($request_options) : array {

		$options = is_string($request_options)
			? json_decode($request_options)
			: $request_options;

		$data			= $options->data;
		$data_number	= $data->number ?? [];
		$number			= array_sum($data_number);

		// check value
		if (!is_numeric($number)) {
			debug_log(__METHOD__
				. " Invalid 'number' value (non numeric) " . PHP_EOL
				. ' number: ' . to_string($number) . PHP_EOL
				. ' request_options: ' . to_string($request_options)
				, logger::ERROR
			);
			return [];
		}

		$total = !empty($number)
			? round($number / 166.386, 2)
			: 0;

		$result = [
			(object)[
				'id'	=> 'total',
				'value'	=> $total
			]
		];


		return $result;
	}//end to_euros


	/**
	* RANGE_TO_DAYS
	* Get a range of start end dates to get the days between then
	* Example of use:
	* "widgets": [
	*	{
	*		"ipo": [
	*		{
	*			"input": {
	*				"filter": false,
	*				"components": [
	*					{
	*					"tipo": "mdcat1968",
	*					"options": {
	*						"select": "start"
	*					},
	*					"var_name": "start"
	*					},
	*					{
	*					"tipo": "mdcat1968",
	*					"options": {
	*						"select": "end"
	*					},
	*					"var_name": "end"
	*					}
	*				],
	*				"section_id": "current",
	*				"section_tipo": "current"
	*			},
	*			"output": [
	*				{
	*					"id": "total",
	*					"value": "int"
	*				}
	*			],
	*			"process": {
	*				"fn": "range_to_days",
	*				"file": "/mdcat/calculation/mdcat.php",
	*				"engine": "php"
	*			}
	*		}
	*		],
	*		"path": "/calculation",
	*		"widget_info": "sum calc.",
	*		"widget_name": "calculation"
	*	}
	* ]
	*
	* Converts a pair of Unix timestamps (seconds since epoch) stored in a single
	* date-range component (e.g. mdcat1968 with select:"start"/"end") to an integer
	* number of full days. When $end is absent or false the result is 0, but the
	* function then clamps $total to 1 so downstream calculations always have at
	* least a one-day duration to work with.
	*
	* Edge cases:
	* - $start false → treated as 0 (epoch origin) for the subtraction.
	* - $end absent / false → $time = 0, $total forced to 1.
	* - Negative $time (end before start) → also clamped to $total = 1.
	* - Division uses 60 * 60 * 24 (seconds per day); result is rounded, not floored,
	*   so a 12-hour partial day rounds to a full day.
	*
	* @param object|string $request_options - unified IPO arg object or its JSON encoding
	* @param object $request_options->data
	* @param int|false $request_options->data->start - Unix timestamp for range start, or false
	* @param int|false $request_options->data->end   - Unix timestamp for range end, or false/unset
	* @return array - single-element array: [ stdClass { id: 'total', value: int } ]
	*/
	function range_to_days($request_options) : array {


		$options = is_string($request_options)
			? json_decode($request_options)
			: $request_options;

		$data = $options->data;

		$start = ( $data->start === false )
			? 0
			: $data->start;

		$end =  $data->end;

		$time = ( !isset($end) || $end === false )
			? 0
			: round( $end - $start );

		if($time <= 0){
			$total = 1;
		}else{
			$total =round ( $time / ( 60 * 60 * 24) );
		}

		$result = [
			(object)[
				'id'	=> 'total',
				'value'	=> $total
			]
		];

		return $result;
	}//end range_to_days



	/**
	* DAYS_CORRECTION_MANUALLY
	* Get a range of start end dates to get the days between then
	* Example of use:
	*	"widgets": [
	*		{
	*			"ipo": [
	*			{
	*				"input": {
	*					"filter": false,
	*					"components": [
	*						{
	*						"tipo": "mdcat1969",
	*						"var_name": "calculation_day",
	*						"options": {"select": "value"}
	*						},
	*						{"tipo": "mdcat2918", "var_name": "manual_day"}
	*					],
	*					"section_id": "current",
	*					"section_tipo": "current"
	*					},
	*				"output": [
	*					{"id": "total", "value": "int"}
	*				],
	*				"process": {
	*					"fn"    : "days_correction_manually"    ,
	*					"file"  : "/mdcat/calculation/mdcat.php",
	*					"engine": "php"
	*				}
	*			}
	*			],
	*			"path": "/calculation",
	*			"widget_info": "sum calc.",
	*			"widget_name": "calculation"
	*		}
	*	]
	*
	* Allow an editor to override the system-calculated day count with a manual
	* value. When $manual_day is non-empty it takes precedence over the
	* $calculation_day derived from the date-range widget (typically the output of
	* range_to_days stored in mdcat1969). This is used when the automated count is
	* known to be inaccurate — for example when a record covers non-contiguous
	* periods or requires an administrative correction.
	*
	* (!) The doc-block title ("Get a range of start end dates…") is copied from
	*     range_to_days and describes the wrong function — the actual purpose is the
	*     manual override described above. The stale title is pre-existing; do not
	*     remove it as it may be relied on by external tooling that parses doc-blocks.
	*
	* @param object|string $request_options - unified IPO arg object or its JSON encoding
	* @param object $request_options->data
	* @param array  $request_options->data->calculation_day - auto-calculated day values (summed)
	* @param mixed  $request_options->data->manual_day      - editor override; empty → use auto
	* @return array - single-element array: [ stdClass { id: 'total', value: int|mixed } ]
	*/
	function days_correction_manually($request_options) : array {

		$options = is_string($request_options)
			? json_decode($request_options)
			: $request_options;

		$data = $options->data;

		$calculation_day	= array_sum($data->calculation_day);
		$manual_day			= $data->manual_day;

		$total = !empty( $manual_day )
			? $manual_day
			: $calculation_day;

		$result = [
			(object)[
				'id'	=> 'total',
				'value'	=> $total
			]
		];


		return $result;
	}//end days_correction_manually



	/**
	* SUBTRACT
	* Subtract between two components
	* Example of use:
	*	"widgets": [
	*		{
	*			"ipo": [
	*				{
	*					"input": {
	*						"filter": false,
	*						"components": [
	*							{
	*								"tipo": "mdcat2433",
	*								"var_name": "total_period"
	*							},
	*							{
	*								"tipo": "mdcat2440",
	*								"var_name": "total"
	*							}
	*						],
	*						"section_id": "current",
	*						"section_tipo": "current"
	*					},
	*					"output": [
	*						{
	*							"id": "total",
	*							"value": "int"
	*						}
	*					],
	*					"process": {
	*						"fn": "subtract",
	*						"file": "/mdcat/calculation/mdcat.php",
	*						"engine": "php"
	*					}
	*				}
	*			],
	*			"path": "/calculation",
	*			"widget_info": "subtract calc.",
	*			"widget_name": "calculation"
	*		}
	*	]
	*
	* Compute $total - $total_period, rounded to 2 decimal places, and return the
	* difference as a single result item. Used to derive the residual amount owed
	* after a portion has already been accounted for (e.g. deducting a calculated
	* period amount from a gross total).
	*
	* Both input data arrays may contain either plain scalar values or stdClass
	* objects with a 'value' property (as produced by other calculation functions
	* in this file). The first element of each array is used via reset(); remaining
	* elements are silently ignored.
	*
	* @param object|string $request_options - unified IPO arg object or its JSON encoding
	* @param object $request_options->data
	* @param array  $request_options->data->total_period - minuend array (first element used)
	* @param array  $request_options->data->total        - subtrahend array (first element used)
	* @return array - single-element array: [ stdClass { id: 'total', value: float } ]
	*/
	function subtract($request_options) : array {

		$options = is_string($request_options)
			? json_decode($request_options)
			: $request_options;

		$data = $options->data;

		$total_period_item	= reset($data->total_period);
		$total_item			= reset($data->total);

		$total_period	= is_object($total_period_item) ? $total_period_item->value : $total_period_item;
		$total			= is_object($total_item) ? $total_item->value : $total_item;

		$total = $total - $total_period;

		$result = [
			(object)[
				'id'	=> 'total',
				'value'	=> round($total, 2)
			]
		];

		return $result;
	}//end subtract




	/**
	* FINAL_TOTAL
	* Get the total of the specific totals
	* Example of use:
	*		"widgets": [
	*		{
	*			"ipo": [
	*			{
	*				"input": {
	*					"filter": false,
	*					"components": [
	*						{
	*							"tipo": "mdcat2579",
	*							"var_name": "total_minor"
	*						},
	*						{
	*							"tipo": "mdcat2585",
	*							"var_name": "import_manual"
	*						},
	*						{
	*							"tipo": "mdcat2443",
	*							"var_name": "total_major"
	*						},
	*						{
	*							"tipo": "mdcat2587",
	*							"var_name": "paid"
	*						}
	*					],
	*					"section_id": "current",
	*					"section_tipo": "current"
	*					},
	*				"output": [
	*					{
	*						"id": "total",
	*						"value": "int"
	*					}
	*				],
	*				"process": {
	*					"fn": "final_total",
	*					"file": "/mdcat/calculation/mdcat.php",
	*					"engine": "php"
	*				}
	*			}
	*			],
	*			"path": "/calculation",
	*			"widget_info": "sum calc.",
	*			"widget_name": "calculation"
	*		}
	*		]
	*
	* Compute the net amount still owed to a beneficiary, applying a three-level
	* priority cascade:
	*
	*   1. Manual override: if $import_manual is set and non-zero, the base is
	*      $import_manual (ignoring the auto-calculated major/minor totals).
	*   2. Section-type branch: if no manual override is active and the owning
	*      section is of tipo 'mdcat2605' (adult/major category) and $total_major
	*      is positive, the base is $total_major.
	*   3. Default: otherwise $total_minor is used.
	*   In all cases: result = base - $paid (amount already disbursed), rounded to
	*   2 decimal places.
	*
	* (!) The function returns `false` (bool) when $caller_section_tipo is not
	*     present in $request_options — the declared return type `: array` is
	*     therefore violated. This is a pre-existing inconsistency; callers must
	*     handle the false case.
	*
	* Note: $request_options is used directly (not $options) when reading
	* $caller_section_tipo, because that property is injected by class.calculation
	* at the top level of the arg object, not inside ->options.
	*
	* @param object|string $request_options - unified IPO arg object or its JSON encoding
	* @param object $request_options->data
	* @param array  $request_options->data->total_minor   - minor pension total (first element used)
	* @param array  $request_options->data->total_major   - major pension total (first element used)
	* @param mixed  $request_options->data->import_manual - manual override amount (scalar)
	* @param mixed  $request_options->data->paid          - amount already paid (scalar)
	* @param string|null $request_options->caller_section_tipo - tipo of the owning section
	* @return array|false - [ stdClass { id: 'total', value: float } ], or false when
	*                       caller_section_tipo is absent
	*/
	function final_total($request_options) : array {

		$options = is_string($request_options)
			? json_decode($request_options)
			: $request_options;

		$data = $options->data;

		$caller_section_tipo = $request_options->caller_section_tipo ?? null;
		if( !isset($caller_section_tipo) ){
			return false;
		}

		// $calculation_day	= array_sum($data->calculation_day);
		$total_minor	= (float)reset($data->total_minor);
		$total_major	= (float)reset($data->total_major);
		$import_manual	= (float)$data->import_manual;
		$paid			= (float)$data->paid;

		if( isset($import_manual) && $import_manual !== 0.0 ){
			$total = $import_manual - $paid;

		}else{
			$total = ( $caller_section_tipo === 'mdcat2605' && isset($total_major) && $total_major > 0.0 )
				? $total_major - $paid
				: $total_minor - $paid;
		}

		$result = [
			(object)[
				'id'	=> 'total',
				'value'	=> round($total, 2)
			]
		];

		return $result;
	}//end final_total
