<?php declare(strict_types=1);
/**
* SEARCH_CORPUS_DIFF
* Result-set equivalence harness for the search SQL optimisations.
* For every corpus file it runs the SAME search_query_object twice, once with the kill switch
* OFF (legacy SQL) and once ON (optimised SQL), and diffs the RESULTS, not the SQL text:
* an optimisation that changes one returned section_id is a regression, whatever its speed.
* It also times both runs, because an optimisation that keeps the results and destroys the
* latency of the paginated first page is a regression too (that is the acceptance gate below).
*
* (!) This is a CLI tool on purpose: test/bootstrap.php pulls PHPUnit in, and the harness must
* stay runnable on any development install.
*
* Usage:
*	php test/search/tools/search_corpus_diff.php <entity> [feature] [--off=X] [--on=Y] [--dir=<path>] [--gate=1.2]
*
*	<entity>	Host used to pick the entity/database, as 'mdcat:7070'
*	<feature>	Test seam to flip, as 'blob_prefilter'
*	--off/--on	Values to compare (default false/true)
*	--dir		Corpus directory (default test/search/corpus)
*	--gate		Max accepted ON/OFF time ratio before a case is reported SLOW (default 1.2)
*
* Exit code 0 when every case is equivalent AND inside the latency gate, 1 otherwise.
*
* @package Dedalo
* @subpackage Test
*/

// args
	$entity		= $argv[1] ?? '';
	$feature	= $argv[2] ?? 'blob_prefilter';
	if ($entity==='') {
		fwrite(STDERR, "Usage: php search_corpus_diff.php <entity_host> [feature] [--dir=<path>] [--gate=1.2]\n");
		exit(1);
	}
	$ar_options	= array_slice($argv, 3);
	$dir		= dirname(__FILE__, 2) . '/corpus';
	$gate		= 1.2;
	$value_off	= false;
	$value_on	= true;
	foreach ($ar_options as $option) {
		if (strpos($option, '--dir=')===0)	$dir  = substr($option, 6);
		if (strpos($option, '--gate=')===0)	$gate = (float)substr($option, 7);
		if (strpos($option, '--off=')===0)	$value_off = substr($option, 6);
		if (strpos($option, '--on=')===0)	$value_on  = substr($option, 5);
	}

// bootstrap. (!) NOT test/bootstrap.php (it requires PHPUnit)
	$_SERVER['HTTP_HOST']	= $entity;
	$_SERVER['REQUEST_URI']	= '/dedalo/';
	define('SHOW_DEBUG', false);
	define('IS_UNIT_TEST', true);
	define('TEST_USER_ID', 1);
	require_once dirname(__FILE__, 4) . '/config/config.php';
	if (!defined('DEVELOPMENT_SERVER') || DEVELOPMENT_SERVER!==true) {
		fwrite(STDERR, "Error. Only development servers can use this tool.\n");
		exit(1);
	}
	require_once DEDALO_ROOT_PATH . '/core/base/dd_init_test.php';

// feature guard. A typo would compare a flag against itself and report everything green
	if (!property_exists('search', $feature)) {
		fwrite(STDERR, "Unknown feature '$feature' (no search::\$$feature)\n");
		exit(1);
	}



/**
* RUN_CASE
* Runs one search_query_object with the kill switch in the given state and returns
* the ordered section_id list, the count() total and both timings.
* (!) The sqo is re-decoded per run: pre_parse_search_query_object() conforms the tree IN PLACE
* (it sets parsed=true and rewrites the filter), so reusing one object would make the second
* run parse an already-optimised tree and silently compare it against itself.
* @param string $json_sqo
* @param string $feature
* @param bool|string $enabled
* @return object $result
*/
function run_case(string $json_sqo, string $feature, $enabled) : object {

	$result = new stdClass();
		$result->ar_section_id	= [];
		$result->total			= null;
		$result->error			= null;
		$result->ms_search		= 0.0;
		$result->ms_count		= 0.0;

	search::${$feature} = $enabled;

	try {
		// search
			$sqo			= json_decode($json_sqo);
			$search			= search::get_instance($sqo);
			$t0				= microtime(true);
			$records_data	= $search->search();
			$result->ms_search = round((microtime(true)-$t0)*1000, 1);

			if (isset($records_data->debug) && $records_data->debug==='Error on exec search') {
				$result->error = 'Error on exec search';
			}
			foreach (($records_data->ar_records ?? []) as $record) {
				if (isset($record->section_id)) {
					$result->ar_section_id[] = (int)$record->section_id;
				}
			}

		// count
			$sqo_count		= json_decode($json_sqo);
			$search_count	= search::get_instance($sqo_count);
			$t0				= microtime(true);
			$count_data		= $search_count->count();
			$result->ms_count	= round((microtime(true)-$t0)*1000, 1);
			$result->total		= $count_data->total ?? null;

	} catch (Exception $e) {
		$result->error = $e->getMessage();
	} finally {
		search::${$feature} = null;
	}


	return $result;
}//end run_case



// corpus
	$ar_files = glob(rtrim($dir,'/') . '/*.json');
	if (empty($ar_files)) {
		fwrite(STDERR, "No corpus files in $dir\n");
		exit(1);
	}

	echo 'entity: ' . $entity . ' | database: ' . DEDALO_DATABASE_CONN . ' | feature: ' . $feature
		. ' | off: ' . var_export($value_off, true) . ' | on: ' . var_export($value_on, true)
		. ' | user: ' . TEST_USER_ID . ' | gate: ' . $gate . 'x' . PHP_EOL;
	echo str_repeat('-', 118) . PHP_EOL;
	printf("%-44s %7s %7s %7s %7s  %-9s %s\n", 'case', 'rows', 'off_ms', 'on_ms', 'ratio', 'results', 'notes');
	echo str_repeat('-', 118) . PHP_EOL;

	$failures	= 0;
	$slow		= 0;
	$empty		= 0;

	foreach ($ar_files as $file) {

		$json = json_decode((string)file_get_contents($file));
		if ($json===null) {
			printf("%-44s %7s %7s %7s %7s  %-9s %s\n", basename($file,'.json'), '-','-','-','-', 'INVALID', 'unreadable json');
			$failures++;
			continue;
		}
		$name		= $json->name ?? basename($file, '.json');
		$json_sqo	= json_encode($json->sqo ?? $json);

		$off	= run_case($json_sqo, $feature, $value_off);
		$on		= run_case($json_sqo, $feature, $value_on);

		// errors are never equivalence
			if ($off->error!==null || $on->error!==null) {
				printf("%-44s %7s %7s %7s %7s  %-9s %s\n", $name, '-','-','-','-', 'ERROR',
					trim((string)$off->error . ' ' . (string)$on->error));
				$failures++;
				continue;
			}

		// (!) an empty baseline proves nothing: [] === [] would report every case green.
		// Most often the corpus belongs to another entity, or the test user has no projects
			$rows		= count($off->ar_section_id);
			$is_empty	= ($rows===0 && (int)$off->total===0);

		// results. Ordered list AND count, both must match
			$same_rows	= ($off->ar_section_id===$on->ar_section_id);
			$same_total	= ((string)$off->total===(string)$on->total);
			$same		= ($same_rows && $same_total);

		$ratio = ($off->ms_search>0) ? round(max($on->ms_search/$off->ms_search, $on->ms_count/max($off->ms_count,0.1)), 2) : 0;

		$ar_notes = [];
		// (!) an empty baseline invalidates the EQUIVALENCE check only. The timings stay valid,
		// and a search that legitimately returns nothing is one of the most frequent shapes a
		// user runs, so the latency gate is applied to it too
			if ($is_empty)		{ $ar_notes[] = 'empty baseline (equivalence unproven)'; $empty++; }
			if (!$same_rows)	{ $ar_notes[] = 'rows off=' . count($off->ar_section_id) . ' on=' . count($on->ar_section_id); }
			if (!$same_total)	{ $ar_notes[] = 'total off=' . $off->total . ' on=' . $on->total; }
			if ($same && $ratio>$gate) { $ar_notes[] = 'SLOW ' . $ratio . 'x'; $slow++; }

		if (!$same) {
			$failures++;
		}

		printf("%-44s %7d %7s %7s %7s  %-9s %s\n",
			$name,
			$rows,
			$off->ms_search,
			$on->ms_search,
			$ratio . 'x',
			$same ? 'same' : 'DIFFERENT',
			implode(' | ', $ar_notes)
		);
	}

	echo str_repeat('-', 118) . PHP_EOL;
	echo 'cases: ' . count($ar_files)
		. ' | different: ' . $failures
		. ' | slow (>' . $gate . 'x): ' . $slow
		. ' | empty baseline: ' . $empty . PHP_EOL;

	if ($empty>0) {
		echo '(!) Empty-baseline cases are NOT evidence. Run against the entity the corpus came from,'
			. ' with a user that has projects.' . PHP_EOL;
	}

	exit(($failures>0 || $slow>0) ? 1 : 0);
