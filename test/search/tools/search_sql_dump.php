<?php declare(strict_types=1);
/**
* SEARCH_SQL_DUMP
* Prints the SQL that the live builder generates for one search query object.
* Development tool: it never writes, it only builds and prints.
*
* Usage:
*	php test/search/tools/search_sql_dump.php <entity> <file.json> [--count] [--filter]
*
*	<entity>	Host used to pick the entity/database, as 'mdcat:7070' (see config_db)
*	<file.json>	A corpus file, as test/search/corpus/*.json, or a bare search_query_object
*	--count		Print the count sql instead of the search sql
*	--filter	Print only the WHERE fragment (build_sql_filter)
*
* @package Dedalo
* @subpackage Test
*/

// entity. Must be set BEFORE config.php, it selects the database
	$entity = $argv[1] ?? '';
	$file	= $argv[2] ?? '';
	if ($entity==='' || $file==='') {
		fwrite(STDERR, "Usage: php search_sql_dump.php <entity_host> <file.json> [--count] [--filter]\n");
		exit(1);
	}
	$_SERVER['HTTP_HOST']	= $entity;
	$_SERVER['REQUEST_URI']	= '/dedalo/';

// bootstrap. (!) NOT test/bootstrap.php: that one requires login_Test.php and therefore
// PHPUnit, and this tool must stay usable on installs without the test dependencies
	define('SHOW_DEBUG', false);
	define('IS_UNIT_TEST', true);
	define('TEST_USER_ID', 1);
	require_once dirname(__FILE__, 4) . '/config/config.php';
	if (!defined('DEVELOPMENT_SERVER') || DEVELOPMENT_SERVER!==true) {
		fwrite(STDERR, "Error. Only development servers can use this tool.\n");
		exit(1);
	}
	require_once DEDALO_ROOT_PATH . '/core/base/dd_init_test.php';

// options
	$ar_options		= array_slice($argv, 3);
	$do_count		= in_array('--count', $ar_options, true);
	$only_filter	= in_array('--filter', $ar_options, true);

// query object. A corpus file wraps it in 'sqo'
	$raw = file_get_contents($file);
	if ($raw===false) {
		fwrite(STDERR, "Unable to read $file\n");
		exit(1);
	}
	$json = json_decode($raw);
	if ($json===null) {
		fwrite(STDERR, "Invalid json in $file\n");
		exit(1);
	}
	$sqo = $json->sqo ?? $json;

// build. pre_parse conforms the tree in place, so the builder gets what search() gets
	$search = search::get_instance($sqo);
	$search->pre_parse_search_query_object();

	if ($only_filter===true) {
		echo $search->build_sql_filter() . PHP_EOL;
		exit(0);
	}

	echo $search->parse_search_query_object($do_count) . PHP_EOL;
