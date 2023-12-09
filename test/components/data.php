<?php
declare(strict_types=1);



function random_string($length = 128) {

	$result = '';

	$names = array('El raspa', 'Isis', 'Monstruo', 'Osi', 'Mini', 'Pitu', 'Ojitos', 'Turbina', 'Susto');
	$randomElement = $names[rand(0, count($names) - 1)];
	$result .= $randomElement . ' - ';

	$characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'; // àü\'ñç
	$charactersLength = mb_strlen($characters);
	for ($i = 0; $i < $length; $i++) {
		$result .= $characters[rand(0, $charactersLength - 1)];
		if ($i > 2) {
			break;
		}
	}
	return $result;
}



function ar_random_string() {
	$result = random_string(func_get_args());

	return array($result);
}



function random_number($length = 10000000) {
	return rand(1, $length-1);
}



function ar_random_number() {
	$result = random_number();

	return array($result);
}



function random_json() {
	$value = (object)[
		'text' => random_string(64),
		'number' => random_number()
	];
	return [$value];
}



function random_locator($arguments) {

	$section_tipo			= $arguments[0];
	$from_component_tipo	= $arguments[1];
	$max 					= $arguments[2] ?? 50;
	$section_id				= (random_number($max) ?? 1);

	// $value = (object)[
	// 	'type'					=> 'dd151',
	// 	'section_id'			=> to_string( $section_id ),
	// 	'section_tipo'			=> $section_tipo,
	// 	'from_component_tipo'	=> $from_component_tipo
	// ];

	$locator = new locator();
		$locator->set_section_tipo($section_tipo);
		$locator->set_section_id($section_id);
		$locator->set_type('dd151');
		$locator->set_from_component_tipo($from_component_tipo);

	$value = $locator;

	// if (isset($arguments[2])) {
	//     $value['paginated_key'] = $arguments[2];
	// }

	return $value;
}



function ar_random_locator() {
	$result = random_locator(func_get_args());

	return array($result);
}



function custom_locator($arguments) {

	$section_tipo			= $arguments[0];
	$section_id				= $arguments[1] ?? 1;
	$from_component_tipo	= $arguments[2];

	$value = (object)[
		'type'					=> 'dd151',
		'section_id'			=> (string)$section_id,
		'section_tipo'			=> $section_tipo,
		'from_component_tipo'	=> $from_component_tipo
	];
	// if (isset($arguments[2])) {
	//     $value['paginated_key'] = $arguments[2];
	// }

	return [$value];
}



function random_date() {
	$day = random_number(30) ?: 1;
	$month = random_number(12) ?: 1;
	$year = random_number(2022) ?: 1;
	$time = convert_date_to_seconds(array(
		'day' => $day,
		'month' => $month,
		'year' => $year
	), 'date');

	$value = (object)[
		'start' => (object)[
			'year'	=> $year,
			'month'	=> $month,
			'day'	=> $day,
			'time'	=> $time
		]
	];
	return [$value];
}



function convert_date_to_seconds($dd_date, $mode) {
	$time = 0;

	$year	= isset($dd_date['year']) ? intval($dd_date['year']) : 0;
	$month	= isset($dd_date['month']) ? intval($dd_date['month']) : 0;
	$day	= isset($dd_date['day']) ? intval($dd_date['day']) : 0;
	$hour	= isset($dd_date['hour']) ? intval($dd_date['hour']) : 0;
	$minute	= isset($dd_date['minute']) ? intval($dd_date['minute']) : 0;
	$second	= isset($dd_date['second']) ? intval($dd_date['second']) : 0;

	if ($mode === 'period') {
		// Nothing to do here
	} else {
		// Normal cases
		if ($month && $month > 0) {
			$month = $month - 1;
		}
		if ($day && $day > 0) {
			$day = $day - 1;
		}
	}

	// Set to zero on no value (preserve negatives always)
	if (is_nan($year)) {
		$year = 0;
	}
	if (is_nan($month)) {
		$month = 0;
	}
	if (is_nan($day)) {
		$day = 0;
	}
	if (is_nan($hour)) {
		$hour = 0;
	}
	if (is_nan($minute)) {
		$minute = 0;
	}
	if (is_nan($second)) {
		$second = 0;
	}

	// Add years (using virtual years of 372 days (31*12)
	$time += $year * 372 * 24 * 60 * 60;

	// Add months (using virtual months of 31 days)
	$time += $month * 31 * 24 * 60 * 60;

	// Add days
	$time += $day * 24 * 60 * 60;

	// Add hours
	$time += $hour * 60 * 60;

	// Add minutes
	$time += $minute * 60;

	// Add seconds
	$time += $second;

	$time = intval($time);

	if (is_nan($time)) {
		$time = false;
	}

	return $time;
}



function random_email() {
	$result = '';
	$length = 40;
	$characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	$charactersLength = strlen($characters);
	for ($i = 0; $i < $length; $i++) {
		$result .= $characters[rand(0, $charactersLength - 1)];
	}
	$result .= '@mydomain.net';

	return [$result];
}



function random_filter_records() {

	// randomly generated N = 40 length array 0 <= A[N] <= 39
	$value = array_map(function () {
		return mt_rand(0, 39);
	}, array_fill(0, 40, null));

	$item = (object)[
		'tipo' => 'rsc167',
		'value' => $value
	];

	$result = [$item];

	return $result;
}



function random_geolocation() {
	$alt = random_number(100); // expected int from 1 to 100
	$lat = mt_rand() / mt_getrandmax(); // expected output: a float number from 0 to <1
	$lon = mt_rand() / mt_getrandmax();
	$zoom = random_number(15); // expected int from 1 to 15

	$result = (object)[
		'alt'   => $alt,
		'lat'   => $lat,
		'lon'   => $lon,
		'zoom'  => $zoom
	];

	return [$result];
}



function random_iri_data() {
	$result = (object)[
		"iri"	=> "https://www." . random_string(64) . '-' . random_string(50) .  '.' . random_string(3),
		"title"	=> random_string(128)
	];
	return [$result];
}



function random_security_access() {
	$result = (object)[
		"tipo"			=> "oh25",
		"value"			=> random_int(1, 10000),
		"section_tipo"	=> "oh1"
	];

	return [$result];
}



function random_3d_data() {

	$file_name = random_string(64) . '_' . random_number(99);

	$value = (object)[
		'lib_data' 	 => null,
		'files_info' => [
			(object)[
				'quality' => 'web',
				'file_url' => '/dedalo/media/3d/web/' . $file_name . '.glb',
				'file_name' => $file_name . '.glb',
				'file_path' => '/home/www/dedalo/media/av/web/' . $file_name . '.glb',
				'file_size' => 22126087,
				'file_time' => (object)[
					'day' => 11,
					'hour' => 11,
					'time' => 64992281681,
					'year' => 2022,
					'month' => 2,
					'minute' => 34,
					'second' => 41,
					'timestamp' => '2022-02-11 11:34:41'
				],
				'upload_info' => (object)[
					'date' => (object)[
						'day' => 11,
						'hour' => 11,
						'time' => 64992281681,
						'year' => 2022,
						'month' => 2,
						'minute' => 34,
						'second' => 41,
						'timestamp' => '2022-02-11 11:34:41'
					],
					'user' => null,
					'file_name' => $file_name . '.glb'
					]
				]
		]
	];

	$value_object = json_decode(json_encode($value));

	return [$value_object];
}



function random_av_data() {

	// $file_name = substr(str_shuffle(str_repeat($x='0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ', (int)ceil(128/strlen($x)) )),1,128) . '_' . rand(0, 99);
	$file_name = random_string(64) . '_' . random_number(99) . '';

	$value = (object)[
		"lib_data" => null,
		"files_info" => [
		  [
			"quality" => "original",
			"file_url" => "/dedalo/media/av/original/{$file_name}.avi",
			"file_name" => "{$file_name}.avi",
			"file_path" => "/home/www/dedalo/media/av/original/{$file_name}.avi",
			"file_size" => 22126087,
			"file_time" => [
			  "day" => 11,
			  "hour" => 11,
			  "time" => 64992281681,
			  "year" => 2022,
			  "month" => 2,
			  "minute" => 34,
			  "second" => 41,
			  "timestamp" => "2022-02-11 11:34:41"
			],
			"upload_info" => [
			  "date" => [
				"day" => 11,
				"hour" => 11,
				"time" => 64992281681,
				"year" => 2022,
				"month" => 2,
				"minute" => 34,
				"second" => 41,
				"timestamp" => "2022-02-11 11:34:41"
			  ],
			  "user" => null,
			  "file_name" => "{$file_name}.avi"
			]
		  ],
		  [
			"quality" => "404",
			"file_url" => "/dedalo/media/av/404/{$file_name}.mp4",
			"file_name" => "{$file_name}.mp4",
			"file_path" => "/home/www/dedalo/media/av/404/{$file_name}.mp4",
			"file_size" => 22126087,
			"file_time" => [
			  "day" => 11,
			  "hour" => 11,
			  "time" => 64992281681,
			  "year" => 2022,
			  "month" => 2,
			  "minute" => 34,
			  "second" => 41,
			  "timestamp" => "2022-02-11 11:34:41"
			]
		  ]
		]
	];

	$value_object = json_decode(json_encode($value));

	return [$value_object];
}



function random_image_data() {

	$file_name = random_string(64) . '_' . random_number(99) . '';

	$value = (object)[
		"lib_data" => null,
		"files_info" => [
			(object)[
				"quality" => "original",
				"file_url" => "/dedalo/media/image/original/0/{$file_name}.jpg",
				"file_name" => "{$file_name}.jpg",
				"file_path" => "/home/www/dedalo/media/image/original/0/{$file_name}.jpg",
				"file_size" => 14355433,
				"file_time" => (object)[
					"day" => 13,
					"hour" => 11,
					"time" => 64997809695,
					"year" => 2022,
					"month" => 4,
					"minute" => 8,
					"second" => 15,
					"timestamp" => "2022-04-13 11:08:15"
				],
				"upload_info" => (object)[
					"date" => (object)[
						"day" => 13,
						"hour" => 11,
						"time" => 64997809695,
						"year" => 2022,
						"month" => 4,
						"minute" => 8,
						"second" => 15,
						"timestamp" => "2022-04-13 11:08:15"
					],
					"user" => null,
					"file_name" => "{$file_name}_deleted_2022-02-11_1347.jpg"
				]
			],
			(object)[
				"quality" => "1.5MB",
				"file_url" => "/dedalo/media/image/1.5MB/0/{$file_name}.jpg",
				"file_name" => "{$file_name}.jpg",
				"file_path" => "/home/www/dedalo/media/image/1.5MB/0/{$file_name}.jpg",
				"file_size" => 344574,
				"file_time" => (object)[
					"day" => 13,
					"hour" => 11,
					"time" => 64997809699,
					"year" => 2022,
					"month" => 4,
					"minute" => 8,
					"second" => 19,
					"timestamp" => "2022-04-13 11:08:19"
				]
			]
		]
	];

	$value_object = json_decode(json_encode($value));

	return [$value_object];
}



function random_pdf_data() {

	$file_name = random_string(64) . '_' . random_number(32);

	$value = (object)[
		"lib_data" => null,
		"files_info" => [
		  (object)[
			"quality" => "web",
			"file_url" => "/dedalo/media/pdf/web/0/$file_name.pdf",
			"file_name" => "$file_name.pdf",
			"file_path" => "/home/www/dedalo/media/pdf/web/0/$file_name.pdf",
			"file_size" => 255969,
			"file_time" => (object)[
				"day" => 25,
				"hour" => 9,
				"time" => 64980091880,
				"year" => 2021,
				"month" => 9,
				"minute" => 31,
				"second" => 20,
				"timestamp" => "2021-09-25 09:31:20"
			],
			"upload_info" => (object)[
			  "date" => (object)[
				"day" => 25,
				"hour" => 9,
				"time" => 64980091880,
				"year" => 2021,
				"month" => 9,
				"minute" => 31,
				"second" => 20,
				"timestamp" => "2021-09-25 09:31:20"
			  ],
			  "user" => null,
			  "file_name" => "$file_name.pdf"
			]
		  ]
		]
	];

	$value_object = json_decode(json_encode($value));

	return [$value_object];
}



function random_svg_data() {

	$file_name = random_string(64) . '_' . random_number(99);

	$value = (object)[
		"lib_data" => null,
		"files_info" => [
			(object)[
				"quality" => "web",
				"file_url" => "/dedalo/media/svg/web/{$file_name}.svg",
				"file_name" => "{$file_name}.svg",
				"file_path" => "/home/www/dedalo/media/svg/web/{$file_name}.svg",
				"file_size" => 1180,
				"file_time" => (object)[
					"day" => 19,
					"hour" => 10,
					"time" => 65009038764,
					"year" => 2022,
					"month" => 8,
					"minute" => 19,
					"second" => 24,
					"timestamp" => "2022-08-19 10:19:24"
				],
				"upload_info" => (object)[
					"date" => (object)[
						"day" => 19,
						"hour" => 10,
						"time" => 65009038764,
						"year" => 2022,
						"month" => 8,
						"minute" => 19,
						"second" => 24,
						"timestamp" => "2022-08-19 10:19:24"
					],
					"user" => null,
					"file_name" => "{$file_name}.svg"
				]
			]
		]
	];

	$value_object = json_decode(json_encode($value));

	return [$value_object];
}
