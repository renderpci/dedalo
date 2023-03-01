<?php
/**
* Calculation generic formulas
*/


function sumarize($request_options) : array {

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

	$result[] = (object)[
		'id' => 'total',
		'value' => $total,
	];

	return $result;
}
