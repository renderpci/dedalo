<?php declare(strict_types=1);
// PHPUnit classes
use PHPUnit\Framework\TestCase;
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class dd_ontology_db_manager_test extends TestCase {



	public static $last_id = 1;



	/**
	* EXECUTION_TIMING
	* @return
	*/
	protected function execution_timing( string $action, callable $callback, int|float $estimated_time, int $from=1, int $n=10000 ) {

		$start_time=start_time();

		// $from = 1;
		// $n = 1000000;
		// return

		$to = $from + $n;
		for ($i=$from; $i < $to; $i++) {
			$callback($i);
			self::$last_id = $i;
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

		// ontology_table
		$ontology_table = dd_ontology_db_manager::$ontology_table;
		$eq = $ontology_table === 'dd_ontology';
		$this->assertTrue(
			$eq,
			'expected true' . PHP_EOL
				.'ontology_table: ' . to_string($ontology_table)
		);

		// ontology_columns
		$ontology_columns = dd_ontology_db_manager::$ontology_columns;
		$eq = $ontology_columns === [
			'tipo'				=> true,
			'parent'			=> true,
			'term'				=> true,
			'model'				=> true,
			'order_number'		=> true,
			'relations'			=> true,
			'tld'				=> true,
			'properties'		=> true,
			'model_tipo'		=> true,
			'is_model'			=> true,
			'is_translatable'	=> true,
			'propiedades'		=> true
		];
		$this->assertTrue(
			$eq,
			'expected true' . PHP_EOL
				.'ontology_columns: ' . to_string($ontology_columns)
		);

		// ontology_json_columns
		$ontology_json_columns = dd_ontology_db_manager::$ontology_json_columns;
		$eq = $ontology_json_columns === [
			'term'				=> true,
			'relations'			=> true,
			'properties'		=> true
		];
		$this->assertTrue(
			$eq,
			'expected true' . PHP_EOL
				.'ontology_json_columns: ' . to_string($ontology_json_columns)
		);

		// ontology_int_columns
		$ontology_int_columns = dd_ontology_db_manager::$ontology_int_columns;
		$eq = $ontology_int_columns === [
			'order_number'		=> true
		];
		$this->assertTrue(
			$eq,
			'expected true' . PHP_EOL
				.'ontology_int_columns: ' . to_string($ontology_int_columns)
		);

		// ontology_boolean_columns
		$ontology_boolean_columns = dd_ontology_db_manager::$ontology_boolean_columns;
		$eq = $ontology_boolean_columns === [
			'is_model'			=> true,
			'is_translatable'	=> true
		];
		$this->assertTrue(
			$eq,
			'expected true' . PHP_EOL
				.'ontology_boolean_columns: ' . to_string($ontology_boolean_columns)
		);

		// load_cache
		$load_cache = dd_ontology_db_manager::$load_cache;
		$eq = $load_cache === [];
		$this->assertTrue(
			$eq,
			'expected true' . PHP_EOL
				.'load_cache: ' . to_string($load_cache)
		);
	}//end test_vars



	/**
	* TEST_SET_TABLE
	* @return
	*/
	public function test_set_table() {

		// ontology_table
		$ontology_table = dd_ontology_db_manager::$ontology_table;
		$eq = $ontology_table === 'dd_ontology';
		$this->assertTrue(
			$eq,
			'expected true' . PHP_EOL
				.'ontology_table: ' . to_string($ontology_table)
		);

		// (!) Force to change the table to use to prevent touch the working table !
		dd_ontology_db_manager::$ontology_table = 'dd_ontology_test';
		$ontology_table = dd_ontology_db_manager::$ontology_table;

		$conn = DBi::_getConnection();

		// Create the test table if do not exists

		// Copy structure from dd_ontology table function
		$sql = "
			CREATE OR REPLACE FUNCTION duplicate_table_with_independent_sequences(
			    source_table TEXT,
			    target_table TEXT,
			    reset_sequence BOOLEAN DEFAULT FALSE,
			    start_value BIGINT DEFAULT 1
			) RETURNS void AS $$
			DECLARE
			    col_record RECORD;
			    max_val BIGINT;
			    seq_name TEXT;
			    new_seq_name TEXT;
			    sequence_start BIGINT;
			BEGIN
			    -- Create the table structure without defaults
			    EXECUTE format('CREATE TABLE %I (LIKE %I INCLUDING CONSTRAINTS INCLUDING INDEXES EXCLUDING DEFAULTS)',
			                  target_table, source_table);

			    -- Handle sequences for SERIAL columns
			    FOR col_record IN
			        SELECT
			            column_name,
			            column_default,
			            REPLACE(SPLIT_PART(column_default, '''', 2), source_table || '_', '') as base_seq_name
			        FROM information_schema.columns
			        WHERE table_name = source_table
			        AND column_default LIKE 'nextval%'
			    LOOP
			        -- Create new sequence name
			        new_seq_name := target_table || '_' || col_record.base_seq_name;

			        -- Determine sequence start value
			        IF reset_sequence THEN
			            sequence_start := start_value;
			        ELSE
			            -- Get current maximum value from source table
			            EXECUTE format('SELECT COALESCE(MAX(%I), 0) FROM %I',
			                          col_record.column_name, source_table) INTO max_val;
			            sequence_start := max_val + 1;
			        END IF;

			        -- Create new sequence
			        EXECUTE format('CREATE SEQUENCE %I START WITH %s', new_seq_name, sequence_start);

			        -- Set new default
			        EXECUTE format('ALTER TABLE %I ALTER COLUMN %I SET DEFAULT nextval(''%I''::regclass)',
			                      target_table, col_record.column_name, new_seq_name);
			    END LOOP;

			    RAISE NOTICE 'Table % duplicated successfully with independent sequences', target_table;
			END;
			$$ LANGUAGE plpgsql;
		";
		$result = pg_query($conn, $sql);

		$eq = $result !== false;
		$this->assertTrue(
			$eq,
			'expected true on create function' . PHP_EOL
				.'sql: ' . to_string($sql)
		);

		$sql = "
			DROP TABLE IF EXISTS dd_ontology_test;
			DROP SEQUENCE IF EXISTS dd_ontology_test_id_seq;
			SELECT duplicate_table_with_independent_sequences('dd_ontology', 'dd_ontology_test',true);
		";
		$result = pg_query($conn, $sql);

		$eq = $result !== false;
		$this->assertTrue(
			$eq,
			'expected true on duplicate table' . PHP_EOL
				.'target ontology_table: ' . to_string($ontology_table) . PHP_EOL
				.'sql: ' . $sql
		);
	}//end test_set_table



	/**
	* TEST_create
	* @return void
	*/
	public function test_create(): void {

		$tipo = 'test13';
		$values = []; // default values is an empty array

		$start_time=start_time();
		$result = dd_ontology_db_manager::create(
			$tipo,
			$values
		);

		// Check the time consuming. Expected value is around 1.6 ms
		$total_time = exec_time_unit($start_time);
			// debug_log(__METHOD__. " total_time (1): " . $total_time, logger::ERROR);
		$eq = $total_time < 2.2;
		$this->assertTrue(
			$eq,
			'expected execution time (1) bellow 2.2 ms' . PHP_EOL
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

		// Using values
		$start_time=start_time();
		$values = [
			'order_number' => 99,
			'properties' => (object)['test'=>true]

		];
		$result = dd_ontology_db_manager::create(
			$tipo,
			$values
		);

		// Check the time consuming. Expected value is around 0.22 ms
		$total_time = exec_time_unit($start_time);
			// debug_log(__METHOD__. " total_time (2) " . $total_time, logger::ERROR);
		$eq = $total_time < 0.5;
		$this->assertTrue(
			$eq,
			'expected execution time (2) bellow 0.5 ms' . PHP_EOL
				.'total_time ms: ' . $total_time
		);

		$id = $result;

		// Check result type
		$eq = gettype($result) === 'integer';
		$this->assertTrue(
			$eq,
			'expected true (integer)' . PHP_EOL
				.'result type: ' . gettype($result) . PHP_EOL
				.'result: ' . to_string($result)
		);

		// Check result type
		$eq = $result === $id;
		$this->assertTrue(
			$eq,
			'expected true ' . PHP_EOL
				.'result: ' . to_string($result) . PHP_EOL
				.'id (previous result): ' . to_string($id)
		);

		// massive creation
		$this->execution_timing(
			'create',
			function($i) use($tipo) {
				return dd_ontology_db_manager::create(
					$tipo
				);
			},
			780, // estimated time ms
			1, // from section_id
			10000 // n records
		);
	}//end test_create



	/**
	* TEST_read
	* @return void
	*/
	public function test_read(): void {

		$tipo	= 'test65';
		$id		= dd_ontology_db_manager::create(
			$tipo
		);

		$start_time=start_time();
		$result = dd_ontology_db_manager::read(
			$tipo
		);

		// Check the time consuming. Expected value is around 0.25 ms
		$total_time = exec_time_unit($start_time);
			// debug_log(__METHOD__. " total_time (1): " . $total_time, logger::ERROR);
		$eq = $total_time < 0.4;
		$this->assertTrue(
			$eq,
			'expected execution time (1): bellow 0.4 ms' . PHP_EOL
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
		$result = dd_ontology_db_manager::read(
			$tipo
		);

		// Check the time consuming. Expected value is around 0.001 ms (CACHED)
		$total_time = exec_time_unit($start_time);
			// debug_log(__METHOD__. " total_time (2): " . $total_time, logger::ERROR);
		$eq = $total_time < 0.002;
		$this->assertTrue(
			$eq,
			'expected execution time (2): bellow 0.002 ms' . PHP_EOL
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
		$result = dd_ontology_db_manager::read(
			$tipo
		);

		// Check the time consuming. Expected value is around 0.001 ms (CACHED)
		$total_time = exec_time_unit($start_time);
			// debug_log(__METHOD__. " total_time (3): " . $total_time, logger::ERROR);
		$eq = $total_time < 0.0015;
		$this->assertTrue(
			$eq,
			'expected execution time (3): bellow 0.0015 ms' . PHP_EOL
				.'total_time ms: ' . $total_time
		);

		// Reading non existing record
		$result = dd_ontology_db_manager::read(
			'nonexistingtipo_1'
		);
		$eq = $result === [];
		$this->assertTrue(
			$eq,
			'expected true equal' . PHP_EOL
				.'result : ' . json_encode($result) . PHP_EOL
				.'value : ' . json_encode([])
		);

		// massive read
		$counter_value = $this->get_counter_value($tipo);
		$this->execution_timing(
			'read',
			function($i) use($tipo) {
				return dd_ontology_db_manager::read(
					$tipo,
					$i
				);
			},
			0.7, // estimated time ms
			$counter_value - 10000, // from section_id
			10000 // n records
		);
	}//end test_read



	/**
	* TEST_update
	* @return void
	*/
	public function test_update(): void {

		$tipo		= 'test65';
		$section_id	= dd_ontology_db_manager::create(
			$tipo
		);


		$values = [
			'order_number' => 99,
			'properties' => (object)['test'=>true]
		];
		$start_time=start_time();
		$result = dd_ontology_db_manager::update(
			$tipo,
			$values
		);

		// Check the time consuming. Expected value is around 0.4 ms
		$total_time = exec_time_unit($start_time);
			// debug_log(__METHOD__. " update total_time (1): " . $total_time, logger::ERROR);
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

		$result = false;
		try {
			// Bad column case
			$values2 = [
				'data' => [
					'test_property' => true
				]
			];
			$result = dd_ontology_db_manager::update(
				$tipo,
				$values2
			);

		} catch (Exception $e) {
			// Check result
			$eq = $result === false;
			$this->assertTrue(
				$eq,
				'expected true ' . PHP_EOL
					.'result: ' . to_string($result)
			);
		}

		// do it again
		$values3 = [
			'parent' => 'dd1',
			'term' => json_decode('{"lg-ara":"العمليات","lg-cat":"Processos","lg-deu":"Prozesse","lg-ell":"Διεργασίες","lg-eng":"Processes","lg-eus":"Prozesuak","lg-fra":"Procédures","lg-ita":"Processi","lg-nep":"प्रक्रियाहरू","lg-por":"Processos","lg-spa":"Procesos"}'),
			'model' => 'area_tool',
			'order_number' => 8,
			'relations' => null,
			'tld' => 'dd',
			'properties' => json_decode('{"dd199":1,"dd201":1,"dd271":1,"rsc19":16,"rsc21":1,"dd1223":1}'),
			'model_tipo' => 'dd124',
			'is_model' => false,
			'is_translatable' => true,
			'propiedades' => "I'm a string"
		];

		$start_time=start_time();
		$result = dd_ontology_db_manager::update(
			$tipo,
			$values3
		);

		// Check the time consuming. Expected value is around 5 ms
		$total_time = exec_time_unit($start_time);
			// debug_log(__METHOD__. " total_time (2): " . $total_time, logger::ERROR);
		$eq = $total_time < 8;
		$this->assertTrue(
			$eq,
			'expected execution time (2): bellow 8 ms' . PHP_EOL
				.'total_time ms: ' . $total_time
		);

		// Read
		$result = dd_ontology_db_manager::read(
			$tipo
		);
		// result_properties
		$result_properties = $result['properties'];
		$eq = json_encode($result_properties) === json_encode($values3['properties']);
		$this->assertTrue(
			$eq,
			'expected true equal' . PHP_EOL
				.'result properties : ' . json_encode($result_properties) . PHP_EOL
				.'values properties : ' . json_encode($values3['properties'])
		);
		// result_is_translatable
		$result_is_translatable = $result['is_translatable'];
		$eq = $result_is_translatable == $values3['is_translatable'];
		$this->assertTrue(
			$eq,
			'expected true equal' . PHP_EOL
				.'result is_translatable : ' . json_encode($result_is_translatable) . PHP_EOL
				.'values is_translatable : ' . json_encode($values3['is_translatable'])
		);

		// Updating non existing record
		$result = dd_ontology_db_manager::update(
			'nonexistingtipo_1',
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
		$counter_value = $this->get_counter_value($tipo);
		$this->execution_timing(
			'update',
			function($i) use($tipo, $values) {
				return dd_ontology_db_manager::update(
					$tipo,
					$values
				);
			},
			720, // estimated time ms
			$counter_value - 10000, // from section_id
			10000 // n records
		);
	}//end test_update



	/**
	* TEST_delete
	* @return void
	*/
	public function test_delete(): void {

		$tipo	= 'test65';
		$id		= dd_ontology_db_manager::create(
			$tipo
		);

		$start_time=start_time();
		$result = dd_ontology_db_manager::delete(
			$tipo
		);

		// Check the time consuming. Expected value is around 0.11 ms
		$total_time = exec_time_unit($start_time);
			// debug_log(__METHOD__. " total_time (1): " . $total_time, logger::ERROR);
		$eq = $total_time < 0.2;
		$this->assertTrue(
			$eq,
			'expected execution time  delete (1): bellow 0.2 ms' . PHP_EOL
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
		$result	= dd_ontology_db_manager::read(
			$tipo
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
		$result = dd_ontology_db_manager::delete(
			'nonexitingtipo_854'
		);
		// Check result
		$eq = $result === true;
		$this->assertTrue(
			$eq,
			'expected true ' . PHP_EOL
				.'result: ' . to_string($result)
		);

		// massive delete
		$counter_value = $this->get_counter_value($tipo);
		$this->execution_timing(
			'delete',
			function($i) use($tipo) {
				return dd_ontology_db_manager::delete(
					$tipo,
					$i
				);
			},
			145, // estimated time ms
			$counter_value - 10000, // from sid
			10000 // n records
		);
	}//end test_delete



}//end class dd_ontology_db_manager_test
