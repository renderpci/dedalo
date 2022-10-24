#!/usr/bin/env php
<?php
/**
* This file is for test purposes only
* and its called from dd_init test sequence
* cache_test_file.php
*/

// data
	$data = json_decode($argv[1], true);

// server environment. Restore from command arguments
	$_SERVER = $data['server'];

// user_id
	$user_id = $data['user_id'];

// actions to run
	$test_data = [];
	for ($i = 1; $i <= 100; $i++) {
	    $test_data[] = $i;
	}
	shuffle($test_data);

	// error_log('test_data:' . json_encode($test_data));

// write result to file as text
	echo json_encode($test_data);
