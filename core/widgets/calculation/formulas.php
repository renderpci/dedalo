<?php
/**
* Formulas used by Calculation
*/

/**
* SUMMARIZE
* @param object $request_options
* 	{
* 		data: object with var and value as { "number": 23.5}
* 		options: object with some other params
* 	}
*/
function summarize($request_options) : array {

	$options = is_string($request_options)
		? json_decode($request_options)
		: $request_options;

	$data   = $options->data;
	$opt    = $options->options;

	$ar_values = [];
	foreach ($data as $key => $value) {
		$ar_values[] = $value;
	}
	$total = array_sum($ar_values);

	if(isset($opt->type)){
		switch ($opt->type) {

			case 'float':
				$precision = $opt->precision ?? 2;
				$total = round($total, $precision);
				break;

			case 'int':
			default:
				$total = round($total, 0);
				break;
		}
	}

	$result[] = (object)[
		'id' => 'total',
		'value' => $total,
	];

	return $result;
}