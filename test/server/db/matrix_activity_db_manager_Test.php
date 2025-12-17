<?php declare(strict_types=1);
// PHPUnit classes
use PHPUnit\Framework\TestCase;
// bootstrap
require_once dirname(__FILE__, 2) . '/bootstrap.php';
require_once dirname(__FILE__, 2) . '/class.BaseTestCase.php';



class matrix_activity_db_manager_Test extends BaseTestCase {


    public $table = 'matrix_activity_test';
    public $section_tipo = 'dd542';
    
    public $last_section_id = 1;



    /**
	 * SET_UP_BEFORE_CLASS
	 * Create test table before running any tests
	 * @return void
	 */
	public static function setUpBeforeClass(): void
	{
		// Force to change the table to use to prevent touching the working table
		matrix_activity_db_manager::$tables = [
            'matrix_activity_test' => true
        ];

		$conn = DBi::_getConnection();

		// Create the test table if it doesn't exist
		// Copy structure from dd_ontology table function
		$sql = "			
			DROP TABLE IF EXISTS matrix_activity_test CASCADE;
            DROP SEQUENCE IF EXISTS matrix_activity_test_id_seq;
			DROP SEQUENCE IF EXISTS matrix_activity_test_section_id_seq;
			SELECT duplicate_table_with_independent_sequences('matrix_activity', 'matrix_activity_test', true);
           -- Fix issue with search_string autocolumn
            ALTER TABLE \"matrix_activity_test\"
            ALTER \"id\" TYPE integer,
            ALTER \"id\" SET DEFAULT nextval('matrix_activity_test_id_seq'),
            ALTER \"id\" SET NOT NULL,
            ALTER \"search_string\" TYPE text,
            ALTER \"search_string\" DROP DEFAULT,
            ALTER \"search_string\" DROP NOT NULL;
            COMMENT ON COLUMN \"matrix_activity_test\".\"id\" IS '';
            COMMENT ON COLUMN \"matrix_activity_test\".\"search_string\" IS '';
		";
		pg_query($conn, $sql);

        echo ". 🤞 Duplicated table matrix_activity => matrix_activity_test" . PHP_EOL . PHP_EOL;
	}//end setUpBeforeClass



	/**
	 * TEAR_DOWN_AFTER_CLASS
	 * Clean up test table after all tests complete
	 * @return void
	 */
	public static function tearDownAfterClass(): void
	{
		// $conn = DBi::_getConnection();
		
		// // Drop test table and sequence
		// $sql = "
		// 	DROP TABLE IF EXISTS matrix_time_machine_test CASCADE;
		// 	DROP SEQUENCE IF EXISTS matrix_time_machine_test_id_seq;
		// ";
		// pg_query($conn, $sql);

		// echo PHP_EOL . ". 🤞 Dropped table matrix_time_machine_test" . PHP_EOL;

		// Reset to original table
		matrix_activity_db_manager::$tables = [
            'matrix_activity' => true
        ];
	}//end tearDownAfterClass



	/**
	 * TEST_create
	 * @return void
	 */
	public function test_create(): void
	{
		$table = $this->table;
		$section_tipo = $this->section_tipo;
		$values = null; // default values is NULL
       
        // 1 - Create basic record
		$start_time = start_time();
		$result = matrix_activity_db_manager::create(
			$table,
			$section_tipo,
			$values
		);

		// Check the time consuming. Expected value is around 15 ms
		$total_time = exec_time_unit($start_time);
		// debug_log(__METHOD__. " total_time (1): " . $total_time, logger::ERROR);
		$eq = $total_time < 35;
		$this->assertTrue(
			$eq,
			'expected execution time (1) bellow 35 ms' . PHP_EOL
				. 'total_time ms: ' . $total_time
		);

		// Check result type
		$eq = gettype($result) === 'integer';
		$this->assertTrue(
			$eq,
			'expected true (integer)' . PHP_EOL
				. 'result type: ' . gettype($result) . PHP_EOL
				. 'result: ' . to_string($result)
		);

		$section_id = $result;
		
        // 2 - Create record using values
		$start_time = start_time();
		// $values = (object)[
		// 	'data' => [
		// 		'section_tipo' => $section_tipo
		// 	]
		// ];
        $values = (object)[
            'section_tipo' => $section_tipo,
            'string' => (object)[
                'rsc168' => [ (object)['value' => 'test', 'id' => 1] ]
            ],
            'date' => (object)[
                'rsc168' => [ (object)['value' => '2025-12-10', 'id' => 1] ]
            ]
        ];
		$result = matrix_activity_db_manager::create(
			$table,
			$section_tipo,
			$values
		);

        $section_id2 = $result;
      
		// Check the time consuming. Expected value is around 1.5 ms
		$total_time = exec_time_unit($start_time);
		// debug_log(__METHOD__. " total_time (2): " . $total_time, logger::ERROR);
		$eq = $total_time < 3;
		$this->assertTrue(
			$eq,
			'expected execution time (2) bellow 3 ms' . PHP_EOL
				. 'total_time ms: ' . $total_time
		);

		// Check result type
		$eq = gettype($result) === 'integer';
		$this->assertTrue(
			$eq,
			'expected true (integer)' . PHP_EOL
				. 'result type: ' . gettype($result) . PHP_EOL
				. 'result: ' . to_string($result)
		);

		// Check result type
		$eq = $section_id2 >= $section_id;
		$this->assertTrue(
			$eq,
			'expected true ' . PHP_EOL
				. 'section_id2 (new result): ' . to_string($section_id2) . PHP_EOL
				. 'section_id (previous result): ' . to_string($section_id)
		);

		// massive creation
		$this->execution_timing(
			'create',
			function ($i) use ($table, $section_tipo) {
				return matrix_activity_db_manager::create(
					$table,
					$section_tipo,
                    (object)[
                        'section_tipo' => $section_tipo,
                        'string' => (object)[
                            'rsc168' => [ (object)['value' => 'test', 'id' => 1] ]
                        ],
                        'date' => (object)[
                            'rsc168' => [ (object)['value' => '2025-12-10', 'id' => 1] ]
                        ],
                        'number' => (object)[
                            'rsc168' => [ (object)['value' => 123, 'id' => 1] ]
                        ]
                    ]
				);
			},
			2100, // estimated time ms
			1, // from section_id
			10000 // n records
		);
	}//end test_create



}//end class matrix_activity_db_manager_Test
