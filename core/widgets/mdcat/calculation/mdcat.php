<?php
/**
* Calculation formulas to mdcat
*/


// expressos



	/**
	* CALCULATE_PERIOD
	* @param object $options
	* @return array $period
	*   Array of objects
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
	* @return int
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
	* @return int
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
	* @return array
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
	* @param object $request_options
	* {
	* 	"start" : 98542135,
	* 	"end" : 98754235
	* }
	* @return array
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
	* @param object $request_options
	* {
	* 	"calculation_day" : [384],
	* 	"manual_day" : 87
	* }
	* @return array
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
	* @param object $request_options
	* {
	* 	"total_period" : [6010],
	* 	"total" : [6010]
	* }
	* @return array
	*/
	function subtract($request_options) : array {

		$options = is_string($request_options)
			? json_decode($request_options)
			: $request_options;

		$data = $options->data;

		$total_period	= reset($data->total_period);
		$total			= reset($data->total);

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
	* @param object $request_options
	* {
	* 	"total_minor" : [6010],
	* 	"total_major" : [6010],
	* 	"import_manual" : "96",
	* 	"paid" 			: "645"
	* }
	* @return array
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


