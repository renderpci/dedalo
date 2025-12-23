<?php declare(strict_types=1);
// PHPUnit classes
use PHPUnit\Framework\TestCase;
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class event_manager_class_Test extends TestCase {



	/**
	* TEST_get_instance
	* @return void
	*/
	public function test_get_instance() {

		$result = event_manager_class::get_instance();

		$this->assertTrue(
			gettype($result)==='object',
			'expected type object : ' . PHP_EOL
				. gettype($result)
		);

		$this->assertInstanceOf(
			event_manager_class::class,
			$result,
			'expected instance of event_manager_class'
		);

		// Singleton test - should return same instance
		$result2 = event_manager_class::get_instance();
		$this->assertSame(
			$result,
			$result2,
			'expected same singleton instance'
		);
	}//end test_get_instance



	/**
	* TEST_subscribe
	* @return void
	*/
	public function test_subscribe() {

		$manager = event_manager_class::get_instance();
		$manager->clear_all(); // Clean state

		$callback = function($data) {
			return 'callback executed';
		};

		$result = $manager->subscribe('test-event', $callback);

		$this->assertTrue(
			gettype($result)==='string',
			'expected type string : ' . PHP_EOL
				. gettype($result)
		);

		$this->assertTrue(
			str_starts_with($result, 'event_'),
			'expected token to start with "event_" : ' . PHP_EOL
				. $result
		);
	}//end test_subscribe



	/**
	* TEST_unsubscribe
	* @return void
	*/
	public function test_unsubscribe() {

		$manager = event_manager_class::get_instance();
		$manager->clear_all(); // Clean state

		$callback = function($data) {
			return 'callback executed';
		};

		$token = $manager->subscribe('test-event', $callback);
		$result = $manager->unsubscribe($token);

		$this->assertTrue(
			$result===true,
			'expected true : ' . PHP_EOL
				. to_string($result)
		);

		// Unsubscribe non-existent token
		$result2 = $manager->unsubscribe('invalid_token');
		$this->assertFalse(
			$result2,
			'expected false for invalid token'
		);
	}//end test_unsubscribe



	/**
	* TEST_publish
	* @return void
	*/
	public function test_publish() {

		$manager = event_manager_class::get_instance();
		$manager->clear_all(); // Clean state

		$executed = false;
		$received_data = null;

		$callback = function($data) use (&$executed, &$received_data) {
			$executed = true;
			$received_data = $data;
			return 'success';
		};

		$manager->subscribe('test-event', $callback);

		$test_data = ['username' => 'john_doe', 'id' => 123];
		$result = $manager->publish('test-event', $test_data);

		$this->assertTrue(
			is_array($result),
			'expected array : ' . PHP_EOL
				. gettype($result)
		);

		$this->assertTrue(
			$executed,
			'expected callback to be executed'
		);

		$this->assertEquals(
			$test_data,
			$received_data,
			'expected data to match'
		);

		$this->assertEquals(
			['success'],
			$result,
			'expected result array to contain callback return values'
		);

		// Publish to non-existent event
		$result2 = $manager->publish('non-existent-event');
		$this->assertFalse(
			$result2,
			'expected false for non-existent event'
		);
	}//end test_publish



	/**
	* TEST_publish_multiple_subscribers
	* @return void
	*/
	public function test_publish_multiple_subscribers() {

		$manager = event_manager_class::get_instance();
		$manager->clear_all(); // Clean state

		$counter = 0;

		$callback1 = function($data) use (&$counter) {
			$counter++;
			return 'callback1';
		};

		$callback2 = function($data) use (&$counter) {
			$counter++;
			return 'callback2';
		};

		$manager->subscribe('multi-event', $callback1);
		$manager->subscribe('multi-event', $callback2);

		$result = $manager->publish('multi-event', []);

		$this->assertEquals(
			2,
			$counter,
			'expected both callbacks to execute'
		);

		$this->assertEquals(
			2,
			count($result),
			'expected 2 results'
		);

		$this->assertTrue(
			in_array('callback1', $result) && in_array('callback2', $result),
			'expected both callback results in array'
		);
	}//end test_publish_multiple_subscribers



	/**
	* TEST_get_events
	* @return void
	*/
	public function test_get_events() {

		$manager = event_manager_class::get_instance();
		$manager->clear_all(); // Clean state

		$callback1 = function($data) { return 'test1'; };
		$callback2 = function($data) { return 'test2'; };

		$token1 = $manager->subscribe('event1', $callback1);
		$token2 = $manager->subscribe('event2', $callback2);

		$result = $manager->get_events();

		$this->assertTrue(
			is_array($result),
			'expected array : ' . PHP_EOL
				. gettype($result)
		);

		$this->assertEquals(
			2,
			count($result),
			'expected 2 events'
		);

		// Check structure
		$this->assertArrayHasKey(
			'event_name',
			$result[0],
			'expected event_name key'
		);

		$this->assertArrayHasKey(
			'token',
			$result[0],
			'expected token key'
		);

		$this->assertArrayHasKey(
			'callback',
			$result[0],
			'expected callback key'
		);
	}//end test_get_events



	/**
	* TEST_event_exists
	* @return void
	*/
	public function test_event_exists() {

		$manager = event_manager_class::get_instance();
		$manager->clear_all(); // Clean state

		$callback = function($data) { return 'test'; };

		$manager->subscribe('test-event', $callback);

		$result = $manager->event_exists('test-event', $callback);

		$this->assertTrue(
			$result,
			'expected true for existing event'
		);

		$other_callback = function($data) { return 'other'; };
		$result2 = $manager->event_exists('test-event', $other_callback);

		$this->assertFalse(
			$result2,
			'expected false for non-subscribed callback'
		);

		$result3 = $manager->event_exists('non-existent', $callback);

		$this->assertFalse(
			$result3,
			'expected false for non-existent event'
		);
	}//end test_event_exists



	/**
	* TEST_event_name_exists
	* @return void
	*/
	public function test_event_name_exists() {

		$manager = event_manager_class::get_instance();
		$manager->clear_all(); // Clean state

		$callback = function($data) { return 'test'; };

		$manager->subscribe('test-event', $callback);

		$result = $manager->event_name_exists('test-event');

		$this->assertTrue(
			$result,
			'expected true for existing event name'
		);

		$result2 = $manager->event_name_exists('non-existent');

		$this->assertFalse(
			$result2,
			'expected false for non-existent event name'
		);
	}//end test_event_name_exists



	/**
	* TEST_clear_event
	* @return void
	*/
	public function test_clear_event() {

		$manager = event_manager_class::get_instance();
		$manager->clear_all(); // Clean state

		$callback1 = function($data) { return 'test1'; };
		$callback2 = function($data) { return 'test2'; };

		$manager->subscribe('event-to-clear', $callback1);
		$manager->subscribe('event-to-clear', $callback2);
		$manager->subscribe('event-to-keep', $callback1);

		$result = $manager->clear_event('event-to-clear');

		$this->assertTrue(
			$result,
			'expected true for cleared event'
		);

		$this->assertFalse(
			$manager->event_name_exists('event-to-clear'),
			'expected event to be removed'
		);

		$this->assertTrue(
			$manager->event_name_exists('event-to-keep'),
			'expected other event to remain'
		);

		// Clear non-existent event
		$result2 = $manager->clear_event('non-existent');

		$this->assertFalse(
			$result2,
			'expected false for non-existent event'
		);
	}//end test_clear_event



	/**
	* TEST_clear_all
	* @return void
	*/
	public function test_clear_all() {

		$manager = event_manager_class::get_instance();
		$manager->clear_all(); // Clean state

		$callback = function($data) { return 'test'; };

		$manager->subscribe('event1', $callback);
		$manager->subscribe('event2', $callback);
		$manager->subscribe('event3', $callback);

		$this->assertEquals(
			3,
			$manager->get_total_events(),
			'expected 3 events before clear'
		);

		$manager->clear_all();

		$this->assertEquals(
			0,
			$manager->get_total_events(),
			'expected 0 events after clear_all'
		);

		$this->assertEquals(
			[],
			$manager->get_events(),
			'expected empty events array'
		);
	}//end test_clear_all



	/**
	* TEST_get_event_count
	* @return void
	*/
	public function test_get_event_count() {

		$manager = event_manager_class::get_instance();
		$manager->clear_all(); // Clean state

		$callback1 = function($data) { return 'test1'; };
		$callback2 = function($data) { return 'test2'; };

		$manager->subscribe('counted-event', $callback1);
		$manager->subscribe('counted-event', $callback2);

		$result = $manager->get_event_count('counted-event');

		$this->assertEquals(
			2,
			$result,
			'expected 2 subscribers'
		);

		$result2 = $manager->get_event_count('non-existent');

		$this->assertEquals(
			0,
			$result2,
			'expected 0 for non-existent event'
		);
	}//end test_get_event_count



	/**
	* TEST_get_total_events
	* @return void
	*/
	public function test_get_total_events() {

		$manager = event_manager_class::get_instance();
		$manager->clear_all(); // Clean state

		$callback = function($data) { return 'test'; };

		$this->assertEquals(
			0,
			$manager->get_total_events(),
			'expected 0 initially'
		);

		$manager->subscribe('event1', $callback);
		$manager->subscribe('event2', $callback);
		$manager->subscribe('event3', $callback);

		$result = $manager->get_total_events();

		$this->assertEquals(
			3,
			$result,
			'expected 3 total subscriptions'
		);
	}//end test_get_total_events



	/**
	* TEST_subscription_lifecycle
	* @return void
	*/
	public function test_subscription_lifecycle() {

		$manager = event_manager_class::get_instance();
		$manager->clear_all(); // Clean state

		$executed_count = 0;

		$callback = function($data) use (&$executed_count) {
			$executed_count++;
			return $data['value'] ?? null;
		};

		// Subscribe
		$token = $manager->subscribe('lifecycle-event', $callback);

		// Publish - should execute
		$manager->publish('lifecycle-event', ['value' => 'first']);
		$this->assertEquals(1, $executed_count);

		// Publish again - should execute
		$manager->publish('lifecycle-event', ['value' => 'second']);
		$this->assertEquals(2, $executed_count);

		// Unsubscribe
		$manager->unsubscribe($token);

		// Publish - should NOT execute
		$manager->publish('lifecycle-event', ['value' => 'third']);
		$this->assertEquals(
			2,
			$executed_count,
			'expected callback not to execute after unsubscribe'
		);
	}//end test_subscription_lifecycle



}//end class event_manager_class_Test
