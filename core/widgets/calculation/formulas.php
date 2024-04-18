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

	$data		= $options->data;
	$options	= $options->options;
	$type		= $options->type;



			case 'float':
				$precision = $opt->precision ?? 2;
				$total = round($total, $precision);
				break;

			// sample data:
			//	{
			//		"au": "1",
			//		"ag": "2.1",
			//		"cu": "8.4",
			//		"pb": "",
			//		"sn": "0.34"
			//	}

			$ar_values = [];
			foreach ($data as $key => $value) {
				if (empty($value)) {
					continue;
				}
				$ar_values[] = $value;
			}
			$total_sum = array_sum($ar_values);


			$precision = $options->precision ?? 2;
			$total = round($total_sum, $precision);

			break;
		case 'int':
		default:

			$ar_values = [];
			foreach ($data as $key => $value) {
				if (empty($value)) {
					continue;
				}
				$ar_values[] = $value;
			}
			$total_sum = array_sum($ar_values);

			$total = round($total_sum, 0);

			break;
	}


	$result[] = (object)[
		'id'	=> 'total',
		'value'	=> $total
	];


	return $result;
}//end summarize
