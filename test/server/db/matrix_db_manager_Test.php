<?php declare(strict_types=1);
// PHPUnit classes
use PHPUnit\Framework\TestCase;
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class matrix_db_manager_test extends TestCase {



	public static $last_section_id = 1;



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
	* TEST_vars
	* @return void
	*/
	public function test_vars(): void {

		// matrix_tables
		$matrix_tables = matrix_db_manager::$matrix_tables;
		$eq = $matrix_tables === [
			'matrix'				=> true,
			'matrix_activities'		=> true,
			'matrix_activity'		=> true,
			'matrix_dataframe'		=> true,
			'matrix_dd'				=> true,
			'matrix_hierarchy'		=> true,
			'matrix_hierarchy_main'	=> true,
			'matrix_indexations'	=> true,
			'matrix_langs'			=> true,
			'matrix_layout'			=> true,
			'matrix_layout_dd'		=> true,
			'matrix_list'			=> true,
			'matrix_nexus'			=> true,
			'matrix_nexus_main'		=> true,
			'matrix_notes'			=> true,
			'matrix_ontology'		=> true,
			'matrix_ontology_main'	=> true,
			'matrix_profiles'		=> true,
			'matrix_projects'		=> true,
			'matrix_stats'			=> true,
			'matrix_test'			=> true,
			'matrix_tools'			=> true,
			'matrix_users'			=> true
		];
		$this->assertTrue(
			$eq,
			'expected true' . PHP_EOL
				.'matrix_tables: ' . to_string($matrix_tables)
		);

		// matrix_columns
		$matrix_columns = matrix_db_manager::$matrix_columns;
		$eq = $matrix_columns === [
			'section_id'		=> true,
			'section_tipo'		=> true,
			'datos'				=> true,
			'data'				=> true,
			'relation'			=> true,
			'string'			=> true,
			'date'				=> true,
			'iri'				=> true,
			'geo'				=> true,
			'number'			=> true,
			'media'				=> true,
			'misc'				=> true,
			'relation_search'	=> true,
			'counters'			=> true
		];
		$this->assertTrue(
			$eq,
			'expected true' . PHP_EOL
				.'matrix_columns: ' . to_string($matrix_columns)
		);

		// matrix_json_columns
		$matrix_json_columns = matrix_db_manager::$matrix_json_columns;
		$eq = $matrix_json_columns === [
			'datos'				=> true,
			'data'				=> true,
			'relation'			=> true,
			'string'			=> true,
			'date'				=> true,
			'iri'				=> true,
			'geo'				=> true,
			'number'			=> true,
			'media'				=> true,
			'misc'				=> true,
			'relation_search'	=> true,
			'counters'			=> true
		];
		$this->assertTrue(
			$eq,
			'expected true' . PHP_EOL
				.'matrix_json_columns: ' . to_string($matrix_json_columns)
		);

		// matrix_int_columns
		$matrix_int_columns = matrix_db_manager::$matrix_int_columns;
		$eq = $matrix_int_columns === [
			'id'				=> true,
			'section_id'		=> true
		];
		$this->assertTrue(
			$eq,
			'expected true' . PHP_EOL
				.'matrix_int_columns: ' . to_string($matrix_int_columns)
		);
	}//end test_vars



	/**
	* TEST_create
	* @return void
	*/
	public function test_create(): void {

		// sample working tested:
		// WITH updated_counter AS (
		//  INSERT INTO "matrix_counter" (tipo, dato, parent, lang)
		//   VALUES ('test65', 1, 0, 'lg-nolan')
		//  ON CONFLICT ("tipo") DO UPDATE
		//   SET "dato" = matrix_counter.dato + 1
		//  RETURNING dato
		// )
		// INSERT INTO "matrix_test" ("section_tipo", "section_id")
		// SELECT 'test65', updated_counter.dato FROM updated_counter
		// RETURNING "section_id"

		$table = 'matrix_test';
		$section_tipo = 'test65';
		$values = []; // default values is an empty array

		$start_time=start_time();
		$result = matrix_db_manager::create(
			$table,
			$section_tipo,
			$values
		);

		// Check the time consuming. Expected value is around 15 ms
		$total_time = exec_time_unit($start_time);
			// debug_log(__METHOD__. " total_time (1): " . $total_time, logger::ERROR);
		$eq = $total_time < 25;
		$this->assertTrue(
			$eq,
			'expected execution time (1) bellow 25 ms' . PHP_EOL
				.'total_time ms: ' . $total_time
		);

		// Check result type
		$eq = gettype($result) === 'integer';
		$this->assertTrue(
			$eq,
			'expected true (integer)' . PHP_EOL
				.'result type: ' . gettype($result) . PHP_EOL
				.'result: ' . to_string($result)
		);

		$section_id = $result;

		// Using values
		$start_time=start_time();
		$values = [
			'data' => [
				'section_tipo' => $section_tipo
			]
		];
		$result = matrix_db_manager::create(
			$table,
			$section_tipo,
			$values
		);

		// Check the time consuming. Expected value is around 1.5 ms
		$total_time = exec_time_unit($start_time);
			// debug_log(__METHOD__. " total_time (2): " . $total_time, logger::ERROR);
		$eq = $total_time < 3;
		$this->assertTrue(
			$eq,
			'expected execution time (2) bellow 3 ms' . PHP_EOL
				.'total_time ms: ' . $total_time
		);

		// Check result type
		$eq = gettype($result) === 'integer';
		$this->assertTrue(
			$eq,
			'expected true (integer)' . PHP_EOL
				.'result type: ' . gettype($result) . PHP_EOL
				.'result: ' . to_string($result)
		);

		// Check result type
		$eq = $result > $section_id;
		$this->assertTrue(
			$eq,
			'expected true ' . PHP_EOL
				.'result: ' . to_string($result) . PHP_EOL
				.'section_id (previous result): ' . to_string($section_id)
		);

		// massive creation
		$this->execution_timing(
			'create',
			function($i) use($table, $section_tipo) {
				return matrix_db_manager::create(
					$table,
					$section_tipo
				);
			},
			2100, // estimated time ms
			1, // from section_id
			10000 // n records
		);
	}//end test_create



	/**
	* TEST_read
	* @return void
	*/
	public function test_read(): void {

		$table			= 'matrix_test';
		$section_tipo	= 'test65';
		$section_id		= matrix_db_manager::create(
			$table,
			$section_tipo
		);

		$start_time=start_time();
		$result = matrix_db_manager::read(
			$table,
			$section_tipo,
			$section_id
		);

		// Check the time consuming. Expected value is around 2 ms
		$total_time = exec_time_unit($start_time);
			// debug_log(__METHOD__. " total_time (1): " . $total_time, logger::ERROR);
		$eq = $total_time < 5;
		$this->assertTrue(
			$eq,
			'expected execution time (1): bellow 5 ms' . PHP_EOL
				.'total_time ms: ' . $total_time
		);

		// Check result type
		$eq = gettype($result) === 'array';
		$this->assertTrue(
			$eq,
			'expected true (array)' . PHP_EOL
				.'result type: ' . gettype($result) . PHP_EOL
				.'result: ' . to_string($result)
		);

		// Read again A
		$start_time=start_time();
		$result = matrix_db_manager::read(
			$table,
			$section_tipo,
			$section_id
		);

		// Check the time consuming. Expected value is around 0.25 ms
		$total_time = exec_time_unit($start_time);
			// debug_log(__METHOD__. " total_time (2: " . $total_time, logger::ERROR);
		$eq = $total_time < 1;
		$this->assertTrue(
			$eq,
			'expected execution time (1): bellow 1 ms' . PHP_EOL
				.'total_time ms: ' . $total_time
		);

		// Check result type
		$eq = gettype($result) === 'array';
		$this->assertTrue(
			$eq,
			'expected true (array)' . PHP_EOL
				.'result type: ' . gettype($result) . PHP_EOL
				.'result: ' . to_string($result)
		);

		// Read again B
		$start_time=start_time();
		$result = matrix_db_manager::read(
			$table,
			$section_tipo,
			$section_id
		);

		// Check the time consuming. Expected value is around 0.25 ms
		$total_time = exec_time_unit($start_time);
			// debug_log(__METHOD__. " total_time (3: " . $total_time, logger::ERROR);
		$eq = $total_time < 1;
		$this->assertTrue(
			$eq,
			'expected execution time (1): bellow 1 ms' . PHP_EOL
				.'total_time ms: ' . $total_time
		);

		// Reading non existing record
		$result = matrix_db_manager::read(
			$table,
			$section_tipo,
			$section_id = 999999999
		);
		$eq = $result === [];
		$this->assertTrue(
			$eq,
			'expected true equal' . PHP_EOL
				.'result : ' . json_encode($result) . PHP_EOL
				.'value : ' . json_encode([])
		);

		// massive read
		$counter_value = $this->get_counter_value($section_tipo);
		$this->execution_timing(
			'read',
			function($i) use($table, $section_tipo) {
				return matrix_db_manager::read(
					$table,
					$section_tipo,
					$i
				);
			},
			180, // estimated time ms
			$counter_value - 10000, // from section_id
			10000 // n records
		);
	}//end test_read



	/**
	* TEST_update
	* @return void
	*/
	public function test_update(): void {

		$table			= 'matrix_test';
		$section_tipo	= 'test65';
		$section_id		= matrix_db_manager::create(
			$table,
			$section_tipo
		);
		$values = [
			'data' => [
				'test_property' => true
			]
		];

		$start_time=start_time();
		$result = matrix_db_manager::update(
			$table,
			$section_tipo,
			$section_id,
			$values
		);

		// Check the time consuming. Expected value is around 0.4 ms
		$total_time = exec_time_unit($start_time);
			// debug_log(__METHOD__. " total_time (1): " . $total_time, logger::ERROR);
		$eq = $total_time < 3;
		$this->assertTrue(
			$eq,
			'expected execution time (1): bellow 3 ms' . PHP_EOL
				.'total_time ms: ' . $total_time
		);

		// Check result type
		$eq = gettype($result) === 'boolean';
		$this->assertTrue(
			$eq,
			'expected true (boolean)' . PHP_EOL
				.'result type: ' . gettype($result) . PHP_EOL
				.'result: ' . to_string($result)
		);

		// Check result
		$eq = $result === true;
		$this->assertTrue(
			$eq,
			'expected true ' . PHP_EOL
				.'result: ' . to_string($result)
		);

		// do it again
		$values2 = [
			// use the postgresql expected order for jsonb
			'relation' => json_decode('{"dd197":[{"type":"dd151","section_id":"-1","section_tipo":"dd128","from_component_tipo":"dd197"}],"dd200":[{"type":"dd151","section_id":"1","section_tipo":"dd128","from_component_tipo":"dd200"}],"rsc20":[{"type":"dd151","section_id":"1","section_tipo":"dd64","from_component_tipo":"rsc20"}],"rsc28":[{"type":"dd675","section_id":"1","section_tipo":"dd153","from_component_tipo":"rsc28"}],"dd1224":[{"type":"dd151","section_id":"1","section_tipo":"dd128","from_component_tipo":"dd1224"}],"dd1225":[{"type":"dd151","section_id":"-1","section_tipo":"dd128","from_component_tipo":"dd1225"}],"rsc322":[{"type":"dd151","section_id":"1","section_tipo":"dd460","from_component_tipo":"rsc322"}],"rsc732":[{"type":"dd151","section_id":"5","section_tipo":"dd889","from_component_tipo":"rsc732"}]}'),
			'string' => json_decode('{"rsc21":[{"id":1,"lang":"lg-nolan","value":"code 95"}]}'),
			'date' => json_decode('{"dd199":[{"id":1,"lang":"lg-nolan","start":{"day":8,"hour":13,"time":65053633711,"year":2024,"month":1,"minute":48,"second":31}}],"dd201":[{"id":1,"lang":"lg-nolan","start":{"day":26,"hour":10,"time":65103389560,"year":2025,"month":7,"minute":52,"second":40}}],"dd271":[{"id":1,"lang":"lg-nolan","start":{"day":18,"hour":13,"time":65062533172,"year":2024,"month":4,"minute":52,"second":52}}],"dd1223":[{"id":1,"lang":"lg-nolan","start":{"day":24,"hour":11,"time":65103220589,"year":2025,"month":7,"errors":[],"minute":56,"second":29}}]}'),
			'media' => json_decode('{"rsc29":[{"id":1,"lang":"lg-nolan","files_info":[{"quality":"original","extension":"jpg","file_name":"rsc29_rsc170_96.jpg","file_path":"/image/original/0/rsc29_rsc170_96.jpg","file_size":14237,"file_time":{"day":16,"hour":12,"time":65059676014,"year":2024,"month":3,"minute":13,"second":34,"timestamp":"2024-03-16 12:13:34"},"file_exist":true},{"quality":"original","extension":"png","file_name":"rsc29_rsc170_96.png","file_path":"/image/original/0/rsc29_rsc170_96.png","file_size":63600,"file_time":{"day":16,"hour":12,"time":65059676015,"year":2024,"month":3,"minute":13,"second":35,"timestamp":"2024-03-16 12:13:35"},"file_exist":true},{"quality":"original","extension":"avif","file_name":"rsc29_rsc170_96.avif","file_path":"/image/original/0/rsc29_rsc170_96.avif","file_size":25216,"file_time":{"day":18,"hour":10,"time":65105374207,"year":2025,"month":8,"minute":10,"second":7,"timestamp":"2025-08-18 10:10:07"},"file_exist":true},{"quality":"1.5MB","extension":"jpg","file_name":"rsc29_rsc170_96.jpg","file_path":"/image/1.5MB/0/rsc29_rsc170_96.jpg","file_size":14239,"file_time":{"day":18,"hour":10,"time":65105374207,"year":2025,"month":8,"minute":10,"second":7,"timestamp":"2025-08-18 10:10:07"},"file_exist":true},{"quality":"1.5MB","extension":"png","file_name":"rsc29_rsc170_96.png","file_path":"/image/1.5MB/0/rsc29_rsc170_96.png","file_size":63600,"file_time":{"day":16,"hour":12,"time":65059676015,"year":2024,"month":3,"minute":13,"second":35,"timestamp":"2024-03-16 12:13:35"},"file_exist":true},{"quality":"1.5MB","extension":"avif","file_name":"rsc29_rsc170_96.avif","file_path":"/image/1.5MB/0/rsc29_rsc170_96.avif","file_size":25219,"file_time":{"day":18,"hour":10,"time":65105374207,"year":2025,"month":8,"minute":10,"second":7,"timestamp":"2025-08-18 10:10:07"},"file_exist":true},{"quality":"thumb","extension":"jpg","file_name":"rsc29_rsc170_96.jpg","file_path":"/image/thumb/0/rsc29_rsc170_96.jpg","file_size":14835,"file_time":{"day":18,"hour":10,"time":65105374207,"year":2025,"month":8,"minute":10,"second":7,"timestamp":"2025-08-18 10:10:07"},"file_exist":true}],"original_file_name":"test99_test3_1.jpg","original_upload_date":{"day":16,"hour":12,"time":65059676014,"year":2024,"month":3,"minute":13,"second":34},"original_normalized_name":"rsc29_rsc170_96.jpg"}]}'),
			'misc' => json_decode('{"rsc19":[{"id":1,"lang":"lg-nolan","value":{"id":"digitization","key":0,"lang":"lg-nolan","type":"detail","value":0,"column":"situation","widget":"state","locator":null}},{"id":2,"lang":"lg-nolan","value":{"id":"digitization","key":0,"lang":"lg-nolan","type":"detail","value":0,"column":"state","widget":"state","locator":null}},{"id":3,"lang":"lg-nolan","value":{"id":"digitization","key":0,"lang":"lg-nolan","type":"total","value":0,"column":"situation","widget":"state"}},{"id":4,"lang":"lg-nolan","value":{"id":"digitization","key":0,"lang":"lg-nolan","type":"total","value":0,"column":"state","widget":"state"}},{"id":5,"lang":"lg-nolan","value":{"id":"transcription","key":0,"lang":"lg-nolan","type":"detail","value":0,"column":"situation","widget":"state","locator":null}},{"id":6,"lang":"lg-nolan","value":{"id":"transcription","key":0,"lang":"lg-nolan","type":"detail","value":0,"column":"state","widget":"state","locator":null}},{"id":7,"lang":"lg-nolan","value":{"id":"transcription","key":0,"lang":"lg-nolan","type":"total","value":0,"column":"situation","widget":"state"}},{"id":8,"lang":"lg-nolan","value":{"id":"transcription","key":0,"lang":"lg-nolan","type":"total","value":0,"column":"state","widget":"state"}},{"id":9,"lang":"lg-nolan","value":{"id":"indexation","key":0,"lang":"lg-nolan","type":"detail","value":0,"column":"situation","widget":"state","locator":null}},{"id":10,"lang":"lg-nolan","value":{"id":"indexation","key":0,"lang":"lg-nolan","type":"detail","value":0,"column":"state","widget":"state","locator":null}},{"id":11,"lang":"lg-nolan","value":{"id":"indexation","key":0,"lang":"lg-nolan","type":"total","value":0,"column":"situation","widget":"state"}},{"id":12,"lang":"lg-nolan","value":{"id":"indexation","key":0,"lang":"lg-nolan","type":"total","value":0,"column":"state","widget":"state"}},{"id":13,"lang":"lg-nolan","value":{"id":"translation","key":0,"lang":"lg-nolan","type":"detail","value":0,"column":"situation","widget":"state","locator":null}},{"id":14,"lang":"lg-nolan","value":{"id":"translation","key":0,"lang":"lg-nolan","type":"detail","value":0,"column":"state","widget":"state","locator":null}},{"id":15,"lang":"lg-nolan","value":{"id":"translation","key":0,"lang":"lg-nolan","type":"total","value":0,"column":"situation","widget":"state"}},{"id":16,"lang":"lg-nolan","value":{"id":"translation","key":0,"lang":"lg-nolan","type":"total","value":0,"column":"state","widget":"state"}}]}'),
			'counters' => json_decode('{"dd199":1,"dd201":1,"dd271":1,"rsc19":16,"rsc21":1,"dd1223":1}')
		];

		$start_time=start_time();
		$result = matrix_db_manager::update(
			$table,
			$section_tipo,
			$section_id,
			$values2
		);

		// Check the time consuming. Expected value is around 5 ms
		$total_time = exec_time_unit($start_time);
			// debug_log(__METHOD__. " total_time (2): " . $total_time, logger::ERROR);
		$eq = $total_time < 8;
		$this->assertTrue(
			$eq,
			'expected execution time (1): bellow 8 ms' . PHP_EOL
				.'total_time ms: ' . $total_time
		);

		// Read
		$result = matrix_db_manager::read(
			$table,
			$section_tipo,
			$section_id
		);
		// result_data
		$result_data = json_decode($result['data']);
		$eq = json_encode($result_data) === json_encode($values['data']);
		$this->assertTrue(
			$eq,
			'expected true equal' . PHP_EOL
				.'result data : ' . json_encode($result_data) . PHP_EOL
				.'values data : ' . json_encode($values['data'])
		);
		// result_relation
		$result_relation = json_decode($result['relation']);
		$eq = $result_relation == $values2['relation'];
		$this->assertTrue(
			$eq,
			'expected true equal' . PHP_EOL
				.'result relation : ' . json_encode($result_relation) . PHP_EOL
				.'values relation : ' . json_encode($values2['relation'])
		);

		// Updating non existing record
		$result = matrix_db_manager::update(
			$table,
			$section_tipo,
			$section_id = 999999999,
			$values
		);
		$eq = $result === true;
		$this->assertTrue(
			$eq,
			'expected true equal' . PHP_EOL
				.'result : ' . json_encode($result) . PHP_EOL
				.'value : ' . json_encode(true)
		);

		// massive update
		$counter_value = $this->get_counter_value($section_tipo);
		$this->execution_timing(
			'update',
			function($i) use($table, $section_tipo, $values) {
				return matrix_db_manager::update(
					$table,
					$section_tipo,
					$i,
					$values
				);
			},
			1100, // estimated time ms
			$counter_value - 10000, // from section_id
			10000 // n records
		);
	}//end test_update



	/**
	* TEST_update_by_key
	* @return void
	*/
	public function test_update_by_key(): void {

		$table			= 'matrix_test';
		$section_tipo	= 'test65';
		$section_id		= matrix_db_manager::create(
			$table,
			$section_tipo
		);
		$column	= 'date';
		$key	= 'dd199';
		$value	= json_decode('[{"id":1,"lang":"lg-nolan","start":{"day":8,"hour":13,"time":65053633711,"year":2024,"month":1,"minute":48,"second":31}}]');

		$start_time=start_time();
		$result = matrix_db_manager::update_by_key(
			$table,
			$section_tipo,
			$section_id,
			$column,
			$key,
			$value
		);

		// Check the time consuming. Expected value is around 0.4 ms
		$total_time = exec_time_unit($start_time);
			// debug_log(__METHOD__. " total_time (1): " . $total_time, logger::ERROR);
		$eq = $total_time < 5;
		$this->assertTrue(
			$eq,
			'expected execution time (1): bellow 5 ms' . PHP_EOL
				.'total_time ms: ' . $total_time
		);

		// Check result type
		$eq = gettype($result) === 'boolean';
		$this->assertTrue(
			$eq,
			'expected true (boolean)' . PHP_EOL
				.'result type: ' . gettype($result) . PHP_EOL
				.'result: ' . to_string($result)
		);

		// Check result
		$eq = $result === true;
		$this->assertTrue(
			$eq,
			'expected true ' . PHP_EOL
				.'result: ' . to_string($result)
		);

		// read and check all is written OK
		$result	= matrix_db_manager::read(
			$table,
			$section_tipo,
			$section_id
		);

		$db_value = json_decode($result[$column])->$key;
		$eq = $db_value == $value;
		$this->assertTrue(
			$eq,
			'expected true ' . PHP_EOL
				.'result: ' . json_encode($db_value) . PHP_EOL
				.'value: ' . json_encode($db_value)
		);

		// Write NULL
			$result = matrix_db_manager::update_by_key(
				$table,
				$section_tipo,
				$section_id,
				$column,
				$key,
				null
			);

			// read and check all is written OK
			$result	= matrix_db_manager::read(
				$table,
				$section_tipo,
				$section_id
			);
			// expected empty column (NULL)
			$db_value = $result[$column];
			$eq = $db_value === null;
			$this->assertTrue(
				$eq,
				'expected true ' . PHP_EOL
					.'result: ' . json_encode($db_value) . PHP_EOL
					.'value: ' . json_encode($db_value)
			);

		// New keys add
			$new_key = 'dd201';
			$value	= json_decode('[{"id":1,"lang":"lg-nolan","start":{"day":9,"hour":13,"time":65053633711,"year":2024,"month":1,"minute":48,"second":31}}]');
			$result = matrix_db_manager::update_by_key(
				$table,
				$section_tipo,
				$section_id,
				$column,
				$new_key,
				$value
			);
			$new_key2 = 'dd202';
			$value2	= json_decode('[{"id":2,"lang":"lg-nolan","start":{"day":10,"hour":13,"time":65053633711,"year":2024,"month":1,"minute":48,"second":31}}]');
			$result = matrix_db_manager::update_by_key(
				$table,
				$section_tipo,
				$section_id,
				$column,
				$new_key2,
				$value2
			);

			// Write NULL 2
			$result = matrix_db_manager::update_by_key(
				$table,
				$section_tipo,
				$section_id,
				$column,
				$new_key,
				null
			);

			// read and check all is written OK
			$result	= matrix_db_manager::read(
				$table,
				$section_tipo,
				$section_id
			);
			// expected non empty column (only $new_key is deleted, $new_key2 is untouched)
			$db_value = json_decode($result[$column])->$new_key2;
			$eq = $db_value == $value2	;
			$this->assertTrue(
				$eq,
				'expected true ' . PHP_EOL
					.'result: ' . json_encode($db_value) . PHP_EOL
					.'value: ' . json_encode($db_value)
			);

		// update non existing record
			$result = matrix_db_manager::update_by_key(
				$table,
				$section_tipo,
				$section_id = 999999999,
				$column,
				$new_key,
				null
			);
			// Check result
			$eq = $result === false;
			$this->assertTrue(
				$eq,
				'expected true ' . PHP_EOL
					.'result: ' . to_string($result)
			);

		// massive update
			// counter
			$counter_value = $this->get_counter_value($section_tipo);
			$this->execution_timing(
				'update_by_key',
				function($i) use($table, $section_tipo, $column, $new_key, $value) {
					return matrix_db_manager::update_by_key(
						$table,
						$section_tipo,
						$i,
						$column,
						$new_key,
						$value
					);
				},
				1000, // estimated time ms
				$counter_value - 10000, // from section_id
				10000 // n records
			);
	}//end test_update_by_key



	/**
	* TEST_delete
	* @return void
	*/
	public function test_delete(): void {

		$table			= 'matrix_test';
		$section_tipo	= 'test65';
		$section_id		= matrix_db_manager::create(
			$table,
			$section_tipo
		);

		$start_time=start_time();
		$result = matrix_db_manager::delete(
			$table,
			$section_tipo,
			$section_id
		);

		// Check the time consuming. Expected value is around 0.4 ms
		$total_time = exec_time_unit($start_time);
			// debug_log(__METHOD__. " total_time (1): " . $total_time, logger::ERROR);
		$eq = $total_time < 5;
		$this->assertTrue(
			$eq,
			'expected execution time  delete (1): bellow 5 ms' . PHP_EOL
				.'total_time ms: ' . $total_time
		);

		// Check result type
		$eq = gettype($result) === 'boolean';
		$this->assertTrue(
			$eq,
			'expected true (boolean)' . PHP_EOL
				.'result type: ' . gettype($result) . PHP_EOL
				.'result: ' . to_string($result)
		);

		// Check result
		$eq = $result === true;
		$this->assertTrue(
			$eq,
			'expected true ' . PHP_EOL
				.'result: ' . to_string($result)
		);

		// read and check all is written OK
		$result	= matrix_db_manager::read(
			$table,
			$section_tipo,
			$section_id
		);
		$db_value = $result;
		$eq = $db_value == [];
		$this->assertTrue(
			$eq,
			'expected true ' . PHP_EOL
				.'result: ' . json_encode($db_value) . PHP_EOL
				.'value: ' . json_encode([])
		);

		// Delete non existing record
		$result = matrix_db_manager::delete(
			$table,
			$section_tipo,
			$section_id = 999999999
		);
		// Check result
		$eq = $result === true;
		$this->assertTrue(
			$eq,
			'expected true ' . PHP_EOL
				.'result: ' . to_string($result)
		);

		// massive delete
		$counter_value = $this->get_counter_value($section_tipo);
		$this->execution_timing(
			'delete',
			function($i) use($table, $section_tipo) {
				return matrix_db_manager::delete(
					$table,
					$section_tipo,
					$i
				);
			},
			800, // estimated time ms
			$counter_value - 10000, // from section_id
			10000 // n records
		);
	}//end test_delete



}//end class matrix_db_manager_test
