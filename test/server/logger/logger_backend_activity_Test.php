<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



/**
* LOGGER_BACKEND_ACTIVITY_TEST
* Unit test for logger_backend_activity class
*/
final class logger_backend_activity_test extends BaseTestCase {



	/**
	* TEST___CONSTRUCT
	* Test constructor with valid array parameter
	* @return void
	*/
	public function test___construct() {

		// Test with null parameter (matches parent signature)
		$result = new logger_backend_activity(null);

		$this->assertTrue(
			gettype($result)==='object',
			'expected type object : ' . PHP_EOL
				. gettype($result)
		);

		// Test with array parameter
		$url_data = [
			'scheme' => 'activity',
			'host' => 'localhost',
			'port' => 5432,
			'user' => 'test',
			'pass' => 'test',
			'path' => '/log_data',
			'query' => 'table=matrix_activity'
		];
		$result = new logger_backend_activity($url_data);

		$this->assertTrue(
			gettype($result)==='object',
			'expected type object with array param : ' . PHP_EOL
				. gettype($result)
		);

		// Verify ar_elements_activity_tipo is set
		$this->assertNotEmpty(
			logger_backend_activity::$ar_elements_activity_tipo,
			'expected ar_elements_activity_tipo to be set'
		);
	}//end test___construct



	/**
	* TEST_STATIC_PROPERTIES
	* Test that static properties are properly defined
	* @return void
	*/
	public function test_static_properties() {

		// Test $what array
		$this->assertNotEmpty(
			logger_backend_activity::$what,
			'expected $what to be defined'
		);

		// Test specific activity types exist
		$this->assertArrayHasKey(
			'SAVE',
			logger_backend_activity::$what,
			'expected SAVE activity type'
		);

		$this->assertArrayHasKey(
			'LOG IN',
			logger_backend_activity::$what,
			'expected LOG IN activity type'
		);

		// Test $enable_log
		$this->assertTrue(
			logger_backend_activity::$enable_log,
			'expected $enable_log to be true by default'
		);
	}//end test_static_properties



	/**
	* TEST_COMPONENT_TIPOS
	* Test that component tipo definitions are correct
	* @return void
	*/
	public function test_component_tipos() {

		// Test section tipo
		$this->assertEquals(
			'dd542',
			logger_backend_activity::$_SECTION_TIPO['tipo'],
			'expected section tipo dd542'
		);

		// Test IP component
		$this->assertEquals(
			'dd544',
			logger_backend_activity::$_COMPONENT_IP['tipo'],
			'expected IP component tipo dd544'
		);

		// Test WHO component
		$this->assertEquals(
			'dd543',
			logger_backend_activity::$_COMPONENT_WHO['tipo'],
			'expected WHO component tipo dd543'
		);

		// Test WHAT component
		$this->assertEquals(
			'dd545',
			logger_backend_activity::$_COMPONENT_WHAT['tipo'],
			'expected WHAT component tipo dd545'
		);

		// Test WHERE component
		$this->assertEquals(
			'dd546',
			logger_backend_activity::$_COMPONENT_WHERE['tipo'],
			'expected WHERE component tipo dd546'
		);

		// Test WHEN component
		$this->assertEquals(
			'dd547',
			logger_backend_activity::$_COMPONENT_WHEN['tipo'],
			'expected WHEN component tipo dd547'
		);

		// Test DATA component
		$this->assertEquals(
			'dd551',
			logger_backend_activity::$_COMPONENT_DATA['tipo'],
			'expected DATA component tipo dd551'
		);
	}//end test_component_tipos



	/**
	* TEST_LOG_MESSAGE_SIGNATURE
	* Test that log_message method accepts correct parameters
	* @return void
	*/
	public function test_log_message_signature() {

		$logger = new logger_backend_activity(null);

		// Test that log_message can be called with minimal parameters
		// (actual logging is deferred via register_shutdown_function)
		try {
			$logger->log_message('SAVE');
			$this->assertTrue(true, 'log_message accepted minimal params');
		} catch (Exception $e) {
			$this->fail('log_message failed with minimal params: ' . $e->getMessage());
		}

		// Test with all parameters
		try {
			$logger->log_message(
				'SAVE',
				logger::INFO,
				'oh32',
				null,
				['msg' => 'Test save'],
				1
			);
			$this->assertTrue(true, 'log_message accepted all params');
		} catch (Exception $e) {
			$this->fail('log_message failed with all params: ' . $e->getMessage());
		}
	}//end test_log_message_signature



	/**
	* TEST_LOG_MESSAGE_DEFER_VALIDATION
	* Test log_message_defer validation logic
	* @return void
	*/
	public function test_log_message_defer_validation() {

		$logger = new logger_backend_activity(null);

		// Test with empty tipo_where (should return early)
		$options = (object)[
			'message' => 'SAVE',
			'tipo_where' => null,
			'log_data' => null,
			'user_id' => null
		];

		// Should not throw, should return early due to empty tipo_where
		try {
			$logger->log_message_defer($options);
			$this->assertTrue(true, 'log_message_defer handled empty tipo_where');
		} catch (Exception $e) {
			$this->fail('log_message_defer failed on empty tipo_where: ' . $e->getMessage());
		}

		// Test with empty message (should return early)
		$options = (object)[
			'message' => null,
			'tipo_where' => 'oh32',
			'log_data' => null,
			'user_id' => null
		];

		try {
			$logger->log_message_defer($options);
			$this->assertTrue(true, 'log_message_defer handled empty message');
		} catch (Exception $e) {
			$this->fail('log_message_defer failed on empty message: ' . $e->getMessage());
		}
	}//end test_log_message_defer_validation



	/**
	* TEST_INHERITANCE
	* Test that logger_backend_activity properly extends logger_backend
	* @return void
	*/
	public function test_inheritance() {

		$logger = new logger_backend_activity(null);

		// Test instance of parent
		$this->assertInstanceOf(
			logger_backend::class,
			$logger,
			'expected instance of logger_backend'
		);

		// Test that parent property exists
		$reflection = new ReflectionClass($logger);
		$parent_property = $reflection->getProperty('url_data');
		$this->assertTrue(
			$parent_property->isProtected(),
			'expected url_data to be protected'
		);
	}//end test_inheritance



	/**
	* TEST_EDGE_CASE_UNKNOWN_ACTIVITY_TYPE
	* Test handling of unknown activity message
	* @return void
	*/
	public function test_edge_case_unknown_activity_type() {

		$logger = new logger_backend_activity(null);

		// Test with unknown message that doesn't exist in $what map
		$options = (object)[
			'message' => 'UNKNOWN_ACTIVITY_TYPE_XYZ',
			'tipo_where' => 'oh32',
			'log_data' => null,
			'user_id' => null
		];

		// Should not throw - logs error but continues
		try {
			$logger->log_message_defer($options);
			$this->assertTrue(true, 'log_message_defer handled unknown activity type');
		} catch (Exception $e) {
			$this->fail('log_message_defer failed on unknown activity: ' . $e->getMessage());
		}
	}//end test_edge_case_unknown_activity_type



	/**
	* TEST_EDGE_CASE_MESSAGE_WITH_NEWLINES
	* Test message normalization with tabs and newlines
	* @return void
	*/
	public function test_edge_case_message_with_newlines() {

		$logger = new logger_backend_activity(null);

		// Message with tabs and newlines that should be normalized
		$options = (object)[
			'message' => "LOG\tIN\n",  // Should normalize to "LOG IN"
			'tipo_where' => 'oh32',
			'log_data' => null,
			'user_id' => null
		];

		// Should not throw
		try {
			$logger->log_message_defer($options);
			$this->assertTrue(true, 'log_message_defer handled message with special chars');
		} catch (Exception $e) {
			$this->fail('log_message_defer failed on message with newlines: ' . $e->getMessage());
		}
	}//end test_edge_case_message_with_newlines



	/**
	* TEST_EDGE_CASE_INFINITE_LOOP_PREVENTION
	* Test that activity component tipos trigger infinite loop prevention
	* @return void
	*/
	public function test_edge_case_infinite_loop_prevention() {

		$logger = new logger_backend_activity(null);

		// Test with a component tipo that is in ar_elements_activity_tipo
		// This should trigger the infinite loop prevention and return early
		$activity_tipo = logger_backend_activity::$_COMPONENT_IP['tipo']; // dd544

		$options = (object)[
			'message' => 'SAVE',
			'tipo_where' => $activity_tipo,
			'log_data' => null,
			'user_id' => null
		];

		// Should return early without throwing
		try {
			$logger->log_message_defer($options);
			$this->assertTrue(true, 'log_message_defer prevented infinite loop');
		} catch (Exception $e) {
			$this->fail('log_message_defer failed on loop prevention: ' . $e->getMessage());
		}
	}//end test_edge_case_infinite_loop_prevention



	/**
	* TEST_EDGE_CASE_EMPTY_LOG_DATA
	* Test with empty or null log_data
	* @return void
	*/
	public function test_edge_case_empty_log_data() {

		$logger = new logger_backend_activity(null);

		// Test with null log_data
		$options = (object)[
			'message' => 'SAVE',
			'tipo_where' => 'oh32',
			'log_data' => null,
			'user_id' => 1
		];

		try {
			$logger->log_message_defer($options);
			$this->assertTrue(true, 'log_message_defer handled null log_data');
		} catch (Exception $e) {
			$this->fail('log_message_defer failed on null log_data: ' . $e->getMessage());
		}

		// Test with empty array log_data
		$options->log_data = [];

		try {
			$logger->log_message_defer($options);
			$this->assertTrue(true, 'log_message_defer handled empty log_data array');
		} catch (Exception $e) {
			$this->fail('log_message_defer failed on empty log_data: ' . $e->getMessage());
		}
	}//end test_edge_case_empty_log_data



	/**
	* TEST_EDGE_CASE_LARGE_LOG_DATA
	* Test with large log_data payload
	* @return void
	*/
	public function test_edge_case_large_log_data() {

		$logger = new logger_backend_activity(null);

		// Create large log_data payload
		$large_data = [];
		for ($i = 0; $i < 1000; $i++) {
			$large_data[] = [
				'index' => $i,
				'data' => str_repeat('x', 100)
			];
		}

		$options = (object)[
			'message' => 'SAVE',
			'tipo_where' => 'oh32',
			'log_data' => $large_data,
			'user_id' => 1
		];

		try {
			$logger->log_message_defer($options);
			$this->assertTrue(true, 'log_message_defer handled large log_data');
		} catch (Exception $e) {
			$this->fail('log_message_defer failed on large log_data: ' . $e->getMessage());
		}
	}//end test_edge_case_large_log_data



	/**
	* TEST_PERFORMANCE_DEFERRED_LOGGING
	* Test performance of deferred logging setup
	* @return void
	*/
	public function test_performance_deferred_logging() {

		$logger = new logger_backend_activity(null);

		// Measure time for multiple log_message calls
		$iterations = 1000;
		$start_time = microtime(true);

		for ($i = 0; $i < $iterations; $i++) {
			$logger->log_message(
				'SAVE',
				logger::INFO,
				'oh32',
				null,
				['iteration' => $i],
				1
			);
		}

		$end_time = microtime(true);
		$elapsed_ms = ($end_time - $start_time) * 1000;
		$avg_ms = $elapsed_ms / $iterations;

		// Assert performance is reasonable (less than 1ms per call on average)
		$this->assertLessThan(
			1.0,
			$avg_ms,
			"expected avg < 1ms per deferred log call, got {$avg_ms}ms"
		);

		// Assert total time is reasonable (less than 300ms for 1000 calls with batching)
		$this->assertLessThan(
			300,
			$elapsed_ms,
			"expected < 300ms for {$iterations} calls, got {$elapsed_ms}ms"
		);
	}//end test_performance_deferred_logging



	/**
	* TEST_PERFORMANCE_CONSTRUCTOR
	* Test constructor performance
	* @return void
	*/
	public function test_performance_constructor() {

		$iterations = 100;
		$start_time = microtime(true);

		for ($i = 0; $i < $iterations; $i++) {
			$logger = new logger_backend_activity(null);
			unset($logger);
		}

		$end_time = microtime(true);
		$elapsed_ms = ($end_time - $start_time) * 1000;
		$avg_ms = $elapsed_ms / $iterations;

		// Assert constructor is fast (less than 5ms per call)
		$this->assertLessThan(
			2.5,
			$avg_ms,
			"expected avg < 2.5ms per constructor, got {$avg_ms}ms"
		);
	}//end test_performance_constructor



}//end class logger_backend_activity_test
