<?php declare(strict_types=1);
// PHPUnit classes
use PHPUnit\Framework\TestCase;
// bootstrap
require_once dirname(__FILE__, 2) . '/bootstrap.php';



final class section_record_test extends TestCase {



	/**
	* EXECUTION_TIMING
	* @return
	*/
	protected function execution_timing( string $action, callable $callback, int $estimated_time, int $from=1, int $n=10000 ) {

		$start_time=start_time();

		$to = $from + $n;
		for ($i=$from; $i < $to; $i++) {
			$callback($i);
			self::$last_section_id = $i;
		}
		// Check the time consuming. Expected value is around 2100 ms
		$total_time = exec_time_unit($start_time);
		$max_time = $estimated_time * 1.6;
			debug_log(__METHOD__
				. " [". strtoupper($action) ."] total_time ms: " . $total_time . " - average ms $total_time/$n = " . $total_time/$n
				, logger::WARNING
		);
		$eq = $total_time < $max_time;
		$this->assertTrue(
			$eq,
			"massive ($action) expected execution time rows bellow $max_time ms" . PHP_EOL
				.'total_time ms: ' . $total_time . PHP_EOL
				.'estimated_time ms: ' . $estimated_time
		);
	}//end execution_timing



	/**
	* GET_COUNTER_VALUE
	* @param string $section_tipo
	* @return int $count_value
	*/
	protected function get_counter_value( string $section_tipo ) : int {

		// counter
		$sql = 'SELECT * FROM matrix_counter WHERE tipo = $1';
		$pg_result = pg_query_params(DBi::_getConnection(), $sql, [$section_tipo]);
		$row = pg_fetch_assoc($pg_result);
		$count_value = (int)$row['value'];

		return $count_value;
	}//end get_counter_value



	/**
	* TEST_USER_LOGIN
	* @return void
	*/
	public function test_user_login() {

		$user_id = TEST_USER_ID; // Defined in bootstrap

		if (login::is_logged()===false) {
			login_test::force_login($user_id);
		}

		$this->assertTrue(
			login::is_logged()===true ,
			'expected login true'
		);
	}//end test_user_login




	// /**
	// * TEST_vars
	// * @return void
	// */
	// public function test_vars(): void {

	// 	// matrix_tables
	// 	$matrix_tables = section_record::$matrix_tables;
	// 	$eq = $matrix_tables === [
	// 		'matrix'				=> true,
	// 		'matrix_activities'		=> true,
	// 		'matrix_activity'		=> true,
	// 		'matrix_dataframe'		=> true,
	// 		'matrix_dd'				=> true,
	// 		'matrix_hierarchy'		=> true,
	// 		'matrix_hierarchy_main'	=> true,
	// 		'matrix_indexations'	=> true,
	// 		'matrix_langs'			=> true,
	// 		'matrix_layout'			=> true,
	// 		'matrix_layout_dd'		=> true,
	// 		'matrix_list'			=> true,
	// 		'matrix_nexus'			=> true,
	// 		'matrix_nexus_main'		=> true,
	// 		'matrix_notes'			=> true,
	// 		'matrix_ontology'		=> true,
	// 		'matrix_ontology_main'	=> true,
	// 		'matrix_profiles'		=> true,
	// 		'matrix_projects'		=> true,
	// 		'matrix_stats'			=> true,
	// 		'matrix_test'			=> true,
	// 		'matrix_tools'			=> true,
	// 		'matrix_users'			=> true
	// 	];
	// 	$this->assertTrue(
	// 		$eq,
	// 		'expected true' . PHP_EOL
	// 			.'matrix_tables: ' . to_string($matrix_tables)
	// 	);

	// 	// matrix_columns
	// 	$matrix_columns = section_record::$matrix_columns;
	// 	$eq = $matrix_columns === [
	// 		'section_id'		=> true,
	// 		'section_tipo'		=> true,
	// 		'datos'				=> true,
	// 		'data'				=> true,
	// 		'relation'			=> true,
	// 		'string'			=> true,
	// 		'date'				=> true,
	// 		'iri'				=> true,
	// 		'geo'				=> true,
	// 		'number'			=> true,
	// 		'media'				=> true,
	// 		'misc'				=> true,
	// 		'relation_search'	=> true,
	// 		'counters'			=> true
	// 	];
	// 	$this->assertTrue(
	// 		$eq,
	// 		'expected true' . PHP_EOL
	// 			.'matrix_columns: ' . to_string($matrix_columns)
	// 	);

	// 	// matrix_json_columns
	// 	$matrix_json_columns = section_record::$matrix_json_columns;
	// 	$eq = $matrix_json_columns === [
	// 		'datos'				=> true,
	// 		'data'				=> true,
	// 		'relation'			=> true,
	// 		'string'			=> true,
	// 		'date'				=> true,
	// 		'iri'				=> true,
	// 		'geo'				=> true,
	// 		'number'			=> true,
	// 		'media'				=> true,
	// 		'misc'				=> true,
	// 		'relation_search'	=> true,
	// 		'counters'			=> true
	// 	];
	// 	$this->assertTrue(
	// 		$eq,
	// 		'expected true' . PHP_EOL
	// 			.'matrix_json_columns: ' . to_string($matrix_json_columns)
	// 	);

	// 	// matrix_int_columns
	// 	$matrix_int_columns = section_record::$matrix_int_columns;
	// 	$eq = $matrix_int_columns === [
	// 		'id'				=> true,
	// 		'section_id'		=> true
	// 	];
	// 	$this->assertTrue(
	// 		$eq,
	// 		'expected true' . PHP_EOL
	// 			.'matrix_int_columns: ' . to_string($matrix_int_columns)
	// 	);
	// }//end test_vars



	// /**
	// * TEST_create
	// * @return void
	// */
	// public function test_create(): void {

	// 	// sample working tested:
	// 	// WITH updated_counter AS (
	// 	//  INSERT INTO "matrix_counter" (tipo, dato, parent, lang)
	// 	//   VALUES ('test65', 1, 0, 'lg-nolan')
	// 	//  ON CONFLICT ("tipo") DO UPDATE
	// 	//   SET "dato" = matrix_counter.dato + 1
	// 	//  RETURNING dato
	// 	// )
	// 	// INSERT INTO "matrix_test" ("section_tipo", "section_id")
	// 	// SELECT 'test65', updated_counter.dato FROM updated_counter
	// 	// RETURNING "section_id"

	// 	$table = 'matrix_test';
	// 	$section_tipo = 'test65';
	// 	$values = []; // default values is an empty array

	// 	$start_time=start_time();
	// 	$result = section_record::create(
	// 		$table,
	// 		$section_tipo,
	// 		$values
	// 	);

	// 	// Check the time consuming. Expected value is around 15 ms
	// 	$total_time = exec_time_unit($start_time);
	// 		// debug_log(__METHOD__. " total_time (1): " . $total_time, logger::ERROR);
	// 	$eq = $total_time < 25;
	// 	$this->assertTrue(
	// 		$eq,
	// 		'expected execution time (1) bellow 25 ms' . PHP_EOL
	// 			.'total_time ms: ' . $total_time
	// 	);

	// 	// Check result type
	// 	$eq = gettype($result) === 'integer';
	// 	$this->assertTrue(
	// 		$eq,
	// 		'expected true (integer)' . PHP_EOL
	// 			.'result type: ' . gettype($result) . PHP_EOL
	// 			.'result: ' . to_string($result)
	// 	);

	// 	$section_id = $result;

	// 	// Using values
	// 	$start_time=start_time();
	// 	$values = [
	// 		'data' => [
	// 			'section_tipo' => $section_tipo
	// 		]
	// 	];
	// 	$result = section_record::create(
	// 		$table,
	// 		$section_tipo,
	// 		$values
	// 	);

	// 	// Check the time consuming. Expected value is around 1.5 ms
	// 	$total_time = exec_time_unit($start_time);
	// 		// debug_log(__METHOD__. " total_time (2): " . $total_time, logger::ERROR);
	// 	$eq = $total_time < 3;
	// 	$this->assertTrue(
	// 		$eq,
	// 		'expected execution time (2) bellow 3 ms' . PHP_EOL
	// 			.'total_time ms: ' . $total_time
	// 	);

	// 	// Check result type
	// 	$eq = gettype($result) === 'integer';
	// 	$this->assertTrue(
	// 		$eq,
	// 		'expected true (integer)' . PHP_EOL
	// 			.'result type: ' . gettype($result) . PHP_EOL
	// 			.'result: ' . to_string($result)
	// 	);

	// 	// Check result type
	// 	$eq = $result > $section_id;
	// 	$this->assertTrue(
	// 		$eq,
	// 		'expected true ' . PHP_EOL
	// 			.'result: ' . to_string($result) . PHP_EOL
	// 			.'section_id (previous result): ' . to_string($section_id)
	// 	);

	// 	// massive creation
	// 	$this->execution_timing(
	// 		'create',
	// 		function($i) use($table, $section_tipo) {
	// 			return section_record::create(
	// 				$table,
	// 				$section_tipo
	// 			);
	// 		},
	// 		2100, // estimated time ms
	// 		1, // from section_id
	// 		10000 // n records
	// 	);
	// }//end test_create



	/**
	* TEST_duplicate
	* @return void
	*/
	public function test_duplicate(): void {

		$table			= 'matrix_test';
		$section_tipo	= 'test65';
		$section_id		= 1;

		$section_record = section_record::get_instance(
			$section_tipo,
			$section_id
		);
			dump($section_record, ' section_record ++ '.to_string());


		$start_time=start_time();
		$result = $section_record->duplicate();
			dump($result, ' result ++ '.to_string());

		// // Check the time consuming. Expected value is around 2 ms
		// $total_time = exec_time_unit($start_time);
		// 	// debug_log(__METHOD__. " total_time (1): " . $total_time, logger::ERROR);
		// $eq = $total_time < 5;
		// $this->assertTrue(
		// 	$eq,
		// 	'expected execution time (1): bellow 5 ms' . PHP_EOL
		// 		.'total_time ms: ' . $total_time
		// );

		// // Check result type
		// $eq = gettype($result) === 'array';
		// $this->assertTrue(
		// 	$eq,
		// 	'expected true (array)' . PHP_EOL
		// 		.'result type: ' . gettype($result) . PHP_EOL
		// 		.'result: ' . to_string($result)
		// );

		// // duplicate again A
		// $start_time=start_time();
		// $result = section_record::duplicate();

		// // Check the time consuming. Expected value is around 0.25 ms
		// $total_time = exec_time_unit($start_time);
		// 	// debug_log(__METHOD__. " total_time (2: " . $total_time, logger::ERROR);
		// $eq = $total_time < 1;
		// $this->assertTrue(
		// 	$eq,
		// 	'expected execution time (1): bellow 1 ms' . PHP_EOL
		// 		.'total_time ms: ' . $total_time
		// );

		// // Check result type
		// $eq = gettype($result) === 'array';
		// $this->assertTrue(
		// 	$eq,
		// 	'expected true (array)' . PHP_EOL
		// 		.'result type: ' . gettype($result) . PHP_EOL
		// 		.'result: ' . to_string($result)
		// );

		// // duplicate again B
		// $start_time=start_time();
		// $result = section_record::duplicate();

		// // Check the time consuming. Expected value is around 0.25 ms
		// $total_time = exec_time_unit($start_time);
		// 	// debug_log(__METHOD__. " total_time (3: " . $total_time, logger::ERROR);
		// $eq = $total_time < 1;
		// $this->assertTrue(
		// 	$eq,
		// 	'expected execution time (1): bellow 1 ms' . PHP_EOL
		// 		.'total_time ms: ' . $total_time
		// );

		// // duplicateing non existing record
		// $result = section_record::duplicate();
		// $eq = $result === [];
		// $this->assertTrue(
		// 	$eq,
		// 	'expected true equal' . PHP_EOL
		// 		.'result : ' . json_encode($result) . PHP_EOL
		// 		.'value : ' . json_encode([])
		// );

		// // massive duplicate
		// $counter_value = $this->get_counter_value($section_tipo);
		// $this->execution_timing(
		// 	'duplicate',
		// 	function($i) use($table, $section_tipo) {
		// 		return section_record::duplicate();
		// 	},
		// 	180, // estimated time ms
		// 	$counter_value - 10000, // from section_id
		// 	10000 // n records
		// );
	}//end test_duplicate






}//end class section_record_test
