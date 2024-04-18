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



	switch ($type) {

		case 'date':
			$shape		= null;
			$ar_values	= [];
			foreach ($data as $key => $value) {
				if (empty($value)) {
					continue;
				}
				//check his format to determinate the behavior
				$format = $value->format;

				// period format are using to add the period to dates
				// a period is a relative date that doesn't define any specific dates
				// it could be a 1 year or 5 moths or 452 day
				switch ($format) {
					case 'period':
						// periods only can sum when a date is set
						// if ar_values is empty, is not possible add any period
						if(empty($ar_values)) continue 2;
						$current_time = array_sum($ar_values);
						// create a new dateTime and set with the stored dates
						// set the DateTime to the sum
						$DateTime = new DateTime();
						$new_date = $DateTime->setTimestamp( $current_time );
						// add interval of every property of the period
						if(isset($value->day)){
							$day_string = 'P'.$value->day.'D';
							$day_interval = new DateInterval($day_string);
							$new_date->add($day_interval);
						}
						if(isset($value->month)){
							$month_string = 'P'.$value->month.'M';
							$month_interval = new DateInterval($month_string);
							$new_date->add($month_interval);
						}
						if(isset($value->year)){
							$year_string = 'P'.$value->year.'Y';
							$year_interval = new DateInterval($year_string);
							$new_date->add($year_interval);
						}
						$ar_values = [$new_date->getTimestamp()];
						break;

					// date format defines specific dates as 31/03/2024
					// date could define as partial, only year or only month and year.
					// in those cases use the shape to check every property
					// as the calculation could add more than one date to be summarize,
					// shape will be the most complete date, the date with more properties.
					// if the date is partial to be coherent the unix_timestamp will add the forget parameters as 1
					// using 0 instead is not correct because the unix_timestamp can't interpreted correctly.
					// final result will remove the properties unset in original dates shapes.
					// for ex: if a date is set with year the result will be a sum date with only year property.
					case 'date':
					default:
						$dd_date		= new dd_date($value);
						$current_shape	= $dd_date->get_shape();
						// get dd_date shape and compare with the previous dates
						// set the most define shape for the final sum date
						if(isset($shape)){
							foreach ($current_shape as $key => $value) {
								$shape->$key = ($value === true)
									? true
									: ( ($shape->$key === true)
										? true
										: false);
							}
						}else{
							$shape = $current_shape;
						}
						// get the unix_timestamp and add to the array
						// Note: if date is partial will be set the forget properties as 1
						$unix_timestamp	= $dd_date->get_unix_timestamp();
						$ar_values[]	= $unix_timestamp;
						break;
				}

			}

			$total_sum	= array_sum($ar_values);
			$total_full	= (!empty($ar_values))
				? dd_date::get_dd_date_from_unix_timestamp( $total_sum )
				: null;
			// total full is the result of the sum
			// but, it always has all date properties set,
			// unix_timestamp defines unset properties as 1 instead 0
			// final date will be the same shape of the original date
			// (if only year is set only year will return)
			if(isset($total_full)){
				$total = new dd_date();
				foreach ($shape as $key => $value) {
					if($value === true){
						$total->$key = $total_full->$key;
					}
				}
			}else{
				$total = $total_full;
			}

			break;
		case 'float':

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
