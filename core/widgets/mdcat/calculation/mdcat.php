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

		$data          = $params->data;
		$options       = $params->options;
		$total_days    = $data->total_days;
		$month_days    = 30.42;

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
		$days          = floor($years_days - ($months * $month_days));

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
	function calculate_import_major(object $options) : int {

		$data = $options->data;
		$total_days = $data->total_days;
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

		$result = $cal_import;


		return $result;
	}//end calculate_import_major



	/**
	* CALCULATE_IMPORT_MINOR
	* @return int
	*/
	function calculate_import_minor(object $options) : int {

		$data = $options->data;
		$total_days = $data->total_days;
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

		$result = $cal_import;


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

		$data = $options->data;

		$numero = $data->numero;
		// error_log('------ to_euros numero: '.json_encode($options));

		// check value
		if (!is_numeric($numero)) {
			debug_log(__METHOD__
				. " Invalid 'numero' value (non numeric) " . PHP_EOL
				. ' numero: ' . to_string($numero) . PHP_EOL
				. ' request_options: ' . to_string($request_options)
				, logger::ERROR
			);
			return [];
		}

		$total = !empty($numero)
			? ($numero / 166.386)
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

		$start	= $data->start;
		$end	= $data->end;
		// error_log('------ range_to_days numero: '.json_encode($options));

		// check value
		if (!is_numeric($start) || !is_numeric($end)) {
			debug_log(__METHOD__
				. " Invalid 'number' value (non numeric) " . PHP_EOL
				. ' start: ' . to_string($start) . PHP_EOL
				. ' end: ' . to_string($end) . PHP_EOL
				. ' request_options: ' . to_string($request_options)
				, logger::ERROR
			);
			return [];
		}

		$time = round( $end - $start );

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
