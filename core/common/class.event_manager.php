<?php declare(strict_types=1);
/**
 * EVENT_MANAGER_CLASS
 * A high-performance event system for managing subscriptions and publications
 *
 * This class provides a robust event management system with O(1) operations for most methods.
 * It uses arrays for optimal performance and supports duplicate detection,
 * token-based unsubscription, and efficient event publishing.
 *
 * @example
 * // Basic usage
 * $manager = event_manager_class::get_instance();
 * $token = $manager->subscribe('user-login', function($data) {
 *   error_log('User logged in: ' . $data['username']);
 * });
 *
 * $manager->publish('user-login', ['username' => 'john_doe']);
 * $manager->unsubscribe($token);
 */
class event_manager_class {

	/**
	 * Maps event names to arrays of callbacks
	 * @var array<string, array<string, callable>>
	 */
	private array $eventMap = [];

	/**
	 * Maps subscription tokens to event metadata
	 * @var array<string, array{event_name: string, callback: callable}>
	 */
	private array $tokenMap = [];

	/**
	 * Counter for generating unique subscription tokens
	 * @var int
	 */
	private int $last_token = 0;

	/**
	 * Singleton instance
	 * @var event_manager_class|null
	 */
	private static ?event_manager_class $instance = null;



	/**
	 * Private constructor for singleton pattern
	 *
	 * Initializes internal data structures:
	 * - eventMap: Maps event names to arrays of callback functions
	 * - tokenMap: Maps subscription tokens to event metadata
	 * - last_token: Counter for generating unique subscription tokens
	 */
	private function __construct() {
		$this->eventMap = [];
		$this->tokenMap = [];
		$this->last_token = 0;
	}



	/**
	 * GET_INSTANCE
	 * Get singleton instance
	 * @return event_manager_class
	 */
	public static function get_instance() : event_manager_class {

		if (self::$instance === null) {
			self::$instance = new self();
		}

		return self::$instance;
	}//end get_instance



	/**
	 * SUBSCRIBE
	 * Subscribes a callback function to an event
	 *
	 * Creates a new subscription for the specified event. Each subscription receives
	 * a unique token that can be used for unsubscription. Duplicate callbacks for
	 * the same event are detected when debugging is enabled.
	 *
	 * @param string $event_name - The name of the event to subscribe to
	 * @param callable $callback - The callback function to execute when the event is published
	 * @return string A unique token string for this subscription (format: "event_N")
	 *
	 * @example
	 * $token = $manager->subscribe('data-updated', function($data) {
	 *   error_log('Received update: ' . json_encode($data));
	 * });
	 */
	public function subscribe(string $event_name, callable $callback) : string {

		$token = 'event_' . (++$this->last_token);

		// Get or create callbacks array
		if (!isset($this->eventMap[$event_name])) {
			$this->eventMap[$event_name] = [];
		}

		// Check for duplicates (only if debugging is enabled)
		if (defined('SHOW_DEBUG') && SHOW_DEBUG === true && in_array($callback, $this->eventMap[$event_name], true)) {
			debug_log(__METHOD__
				. " Found duplicated subscription: $event_name"
				, logger::ERROR
			);
		}

		// Add callback with token as key for O(1) removal
		$this->eventMap[$event_name][$token] = $callback;
		
		// Store token mapping
		$this->tokenMap[$token] = [
			'event_name' => $event_name,
			'callback' => $callback
		];

		return $token;
	}//end subscribe



	/**
	 * UNSUBSCRIBE
	 * Unsubscribes a callback using its subscription token
	 *
	 * Removes the subscription associated with the provided token. Automatically
	 * cleans up empty event entries to prevent memory leaks.
	 *
	 * @param string $token - The subscription token returned by subscribe()
	 * @return bool true if the subscription was found and removed, false otherwise
	 *
	 * @example
	 * $token = $manager->subscribe('user-action', $callback);
	 * $success = $manager->unsubscribe($token); // Returns true if successful
	 */
	public function unsubscribe(string $token) : bool {

		if (!isset($this->tokenMap[$token])) {
			if (defined('SHOW_DEBUG') && SHOW_DEBUG === true) {
				// Uncomment for verbose debugging
				// debug_log(__METHOD__ . " Ignored empty or unknown event_token from unsubscribe: $token", logger::DEBUG);
			}
			return false;
		}

		$entry = $this->tokenMap[$token];
		$event_name = $entry['event_name'];

		// Remove callback and cleanup if empty
		if (isset($this->eventMap[$event_name][$token])) {
			unset($this->eventMap[$event_name][$token]);
			
			if (empty($this->eventMap[$event_name])) {
				unset($this->eventMap[$event_name]);
			}
		}

		unset($this->tokenMap[$token]);
		return true;
	}//end unsubscribe



	/**
	 * PUBLISH
	 * Publishes an event to all subscribed callbacks
	 *
	 * Executes all callback functions subscribed to the specified event, passing
	 * the provided data to each callback. Returns an array of all callback return values.
	 *
	 * @param string $event_name - The name of the event to publish
	 * @param mixed $data - Data to pass to each callback function (defaults to empty array)
	 * @return array|false Array of callback return values, or false if no subscribers
	 *
	 * @example
	 * // Publish with data
	 * $results = $manager->publish('user-updated', [
	 *   'id' => 123,
	 *   'name' => 'John Doe'
	 * ]);
	 *
	 * // Publish without data
	 * $manager->publish('app-ready');
	 */
	public function publish(string $event_name, mixed $data = []) : array|false {

		if (!isset($this->eventMap[$event_name]) || empty($this->eventMap[$event_name])) {
			return false;
		}

		$results = [];
		foreach ($this->eventMap[$event_name] as $callback) {
			$results[] = $callback($data);
		}

		return $results;
	}//end publish



	/**
	 * GET_EVENTS
	 * Retrieves all active event subscriptions
	 *
	 * Returns an array containing details of all current subscriptions including
	 * event names, tokens, and callback references. Useful for debugging and
	 * subscription management.
	 *
	 * @return array Array of subscription objects
	 *
	 * @example
	 * $events = $manager->get_events();
	 * error_log('Active subscriptions: ' . count($events));
	 * foreach ($events as $event) {
	 *   error_log($event['event_name'] . ': ' . $event['token']);
	 * }
	 */
	public function get_events() : array {

		$events = [];
		foreach ($this->tokenMap as $token => $entry) {
			$events[] = [
				'event_name' => $entry['event_name'],
				'token' => $token,
				'callback' => $entry['callback']
			];
		}

		return $events;
	}//end get_events



	/**
	 * EVENT_EXISTS
	 * Checks if a specific callback is subscribed to an event
	 *
	 * Determines whether the given callback function is already subscribed
	 * to the specified event. Useful for preventing duplicate subscriptions
	 * programmatically.
	 *
	 * @param string $event_name - The event name to check
	 * @param callable $callback - The callback function to look for
	 * @return bool true if the callback is subscribed to the event
	 *
	 * @example
	 * $myCallback = function($data) { error_log(json_encode($data)); };
	 *
	 * if (!$event_manager->event_exists('user-login', $myCallback)) {
	 *   $event_manager->subscribe('user-login', $myCallback);
	 * }
	 */
	public function event_exists(string $event_name, callable $callback) : bool {

		if (!isset($this->eventMap[$event_name])) {
			return false;
		}

		return in_array($callback, $this->eventMap[$event_name], true);
	}//end event_exists



	/**
	 * EVENT_NAME_EXISTS
	 * Checks if a specific event name is already defined
	 *
	 * @param string $event_name - The event name to check
	 * @return bool true if an event is subscribed with given name
	 *
	 * @example
	 * if (!$event_manager->event_name_exists('user-login')) {
	 *   // Do something
	 * }
	 */
	public function event_name_exists(string $event_name) : bool {

		return isset($this->eventMap[$event_name]);
	}//end event_name_exists



	/**
	 * CLEAR_EVENT
	 * Removes all subscriptions for a specific event
	 *
	 * Efficiently clears all callbacks associated with the given event name.
	 * This is more efficient than unsubscribing individual tokens when you
	 * need to clear an entire event.
	 *
	 * @param string $event_name - The event name to clear
	 * @return bool true if the event existed and was cleared, false otherwise
	 *
	 * @example
	 * $event_manager->clear_event('temporary-notifications');
	 */
	public function clear_event(string $event_name) : bool {

		if (!isset($this->eventMap[$event_name])) {
			return false;
		}

		// Remove all tokens for this event
		foreach ($this->tokenMap as $token => $entry) {
			if ($entry['event_name'] === $event_name) {
				unset($this->tokenMap[$token]);
			}
		}

		unset($this->eventMap[$event_name]);
		return true;
	}//end clear_event



	/**
	 * CLEAR_ALL
	 * Clears all events and subscriptions
	 *
	 * Removes all event subscriptions and resets the event_manager_class to its
	 * initial state. This is useful for cleanup operations or testing.
	 *
	 * @return void
	 *
	 * @example
	 * // Clean up
	 * $manager->clear_all();
	 */
	public function clear_all() : void {

		$this->eventMap = [];
		$this->tokenMap = [];
	}//end clear_all



	/**
	 * GET_EVENT_COUNT
	 * Gets the number of subscribers for a specific event
	 *
	 * Returns the count of callback functions subscribed to the given event.
	 * Useful for monitoring subscription levels and debugging.
	 *
	 * @param string $event_name - The event name to count subscribers for
	 * @return int The number of subscribers (0 if event doesn't exist)
	 *
	 * @example
	 * $count = $manager->get_event_count('user-activity');
	 * error_log("$count handlers listening for user activity");
	 */
	public function get_event_count(string $event_name) : int {

		if (!isset($this->eventMap[$event_name])) {
			return 0;
		}

		return count($this->eventMap[$event_name]);
	}//end get_event_count



	/**
	 * GET_TOTAL_EVENTS
	 * Gets the total number of active subscriptions
	 *
	 * Returns the total count of all active event subscriptions across
	 * all events. Useful for memory usage monitoring and performance analysis.
	 *
	 * @return int Total number of active subscriptions
	 *
	 * @example
	 * $total = $manager->get_total_events();
	 * error_log("Total active subscriptions: $total");
	 *
	 * // Monitor subscription growth
	 * if ($manager->get_total_events() > 1000) {
	 *   error_log('High number of subscriptions detected');
	 * }
	 */
	public function get_total_events() : int {

		return count($this->tokenMap);
	}//end get_total_events



}//end event_manager_class