<?php
/**
* Formulas used by the Calculation widget
*/



/**
* SUMMARIZE
* Collect data given (array of values) and summarize values
* in the number format defined as type
* @param object $request_options
* 	{
* 		data: object with var and value as { "number": 23.5}
* 		options: object with some other params
* 	}
* @return array $result
* {
* 	id : total,
* 	value: 65
* }
*/
function summarize( string|object $request_options) : array {

	$options = is_string($request_options)
		? json_decode($request_options)
		: $request_options;

	$data   = $options->data;
	$opt    = $options->options;

	// sample data:
		// {
		//     "au": "",
		//     "ag": "",
		//     "cu": "",
		//     "pb": "",
		//     "sn": ""
		// }

	$ar_values = [];
	foreach ($data as $key => $value) {
		if (empty($value)) {
			continue;
		}
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
		'id'	=> 'total',
		'value'	=> $total
	];


	return $result;
}//end summarize
