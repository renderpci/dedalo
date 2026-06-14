<?php declare(strict_types=1);
/**
* CLASS EVENT_MANAGER_CLASS
* Server-side pub/sub event bus for decoupled intra-request communication.
*
* Implements a singleton observer pattern that lets any PHP component broadcast
* named events to an arbitrary number of registered listeners within a single
* HTTP request lifetime. Unlike the JavaScript counterpart (core/common/js/event_manager.js),
* this PHP class does not persist state between requests — the singleton is re-created
* on every PHP-FPM worker invocation.
*
* Responsibilities:
* - Accept callable subscriptions keyed by an application-defined event name string.
* - Issue opaque, monotonically-increasing tokens so callers can unsubscribe individually
*   without holding a reference to the original callback.
* - Publish events synchronously: all registered callbacks are called in subscription
*   order, and their return values are collected and returned to the publisher.
* - Detect accidental duplicate registrations of the same callback reference (debug mode).
* - Clean up empty event buckets automatically to keep memory usage proportional to
*   the number of active subscriptions.
*
* Internal data layout:
*   $eventMap  : [ event_name => [ token => callable, ... ], ... ]
*   $tokenMap  : [ token => [ 'event_name' => string, 'callback' => callable ], ... ]
*
* The dual-map design gives O(1) lookup for both directions: event→callbacks (publish)
* and token→event (unsubscribe), at the cost of storing each callback reference twice.
*
* @package Dédalo
* @subpackage Core
*/
class event_manager_class {

	/**
	* Primary event index: maps each event name to its active subscribers.
	* The inner array is keyed by subscription token so that unsubscription
	* requires a single unset() call with no linear scan.
	* @var array<string, array<string, callable>> $eventMap
	*/
	private array $eventMap = [];

	/**
	* Reverse index: maps each subscription token back to its event name and
	* callback. Required by unsubscribe() to locate the correct $eventMap bucket
	* without iterating over all events.
	* @var array<string, array{event_name: string, callback: callable}> $tokenMap
	*/
	private array $tokenMap = [];

	/**
	* Monotonically-increasing counter used to generate unique subscription tokens.
	* Tokens take the form "event_N" where N is the post-increment value.
	* Never reset within a request; guaranteed unique for the process lifetime.
	* @var int $last_token
	*/
	private int $last_token = 0;

	/**
	* Holds the single shared instance created by get_instance().
	* Null until the first call to get_instance().
	* @var ?event_manager_class $instance
	*/
	private static ?event_manager_class $instance = null;



	/**
	* __CONSTRUCT
	* Initializes the two lookup maps and the token counter to their empty defaults.
	* Called only once per process by get_instance(). Do not instantiate directly —
	* always obtain the shared instance via event_manager_class::get_instance().
	*/
	private function __construct() {
		$this->eventMap = [];
		$this->tokenMap = [];
		$this->last_token = 0;
	}



	/**
	* GET_INSTANCE
	* Returns the shared singleton, creating it on first call.
	* All Dédalo PHP code should use this accessor rather than constructing
	* a private instance, so that all publishers and subscribers share the
	* same event bus within a request.
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
	* Registers a callback to be invoked whenever the named event is published.
	*
	* Each call returns a unique opaque token (format: "event_N"). Callers must
	* retain this token if they ever need to cancel the subscription via
	* unsubscribe(). Tokens are never reused within a request.
	*
	* Callbacks are stored in $eventMap keyed by token so that
	* event_exists() can use strict identity comparison to detect duplicates.
	* When SHOW_DEBUG is true, re-registering an identical callable for the
	* same event logs an ERROR — this usually indicates a listener leaking
	* across re-renders without first calling unsubscribe().
	*
	* @param string $event_name - Arbitrary string naming the event channel (e.g. 'save', 'ts_add_child_tool_cataloging').
	* @param callable $callback - Function to invoke when the event fires. Receives the $data argument passed to publish().
	* @return string - Unique subscription token for use with unsubscribe().
	*/
	public function subscribe(string $event_name, callable $callback) : string {

		$token = 'event_' . (++$this->last_token);

		// Initialize event bucket on first subscriber
		if (!isset($this->eventMap[$event_name])) {
			$this->eventMap[$event_name] = [];
		}

		// Duplicate detection
		// Uses strict identity (===) so that two distinct closures with the same body
		// are not flagged. Only fires when SHOW_DEBUG is explicitly true to avoid the
		// overhead of in_array() on every subscription in production.
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
	* Removes the subscription identified by the given token.
	*
	* Looks up the token in $tokenMap (O(1)) to find the event bucket, then
	* removes the callback entry from both maps. If the event bucket becomes
	* empty after removal, it is deleted from $eventMap so that publish() and
	* event_name_exists() return consistent "no subscribers" results.
	*
	* Returns false without side effects if the token is unknown. This is a
	* safe no-op when, for example, a component's destroy method calls
	* unsubscribe() unconditionally regardless of whether it had subscribed.
	*
	* @param string $token - Subscription token previously returned by subscribe().
	* @return bool - true if the subscription was found and removed, false if the token was not recognized.
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

		// Remove callback from event bucket and prune empty bucket
		if (isset($this->eventMap[$event_name][$token])) {
			unset($this->eventMap[$event_name][$token]);

			// (!) Remove the bucket entirely so event_name_exists() correctly
			// reports that no listeners remain for this event name.
			if (empty($this->eventMap[$event_name])) {
				unset($this->eventMap[$event_name]);
			}
		}

		unset($this->tokenMap[$token]);
		return true;
	}//end unsubscribe



	/**
	* PUBLISH
	* Fires all callbacks registered for the named event, passing $data to each.
	*
	* Callbacks are invoked synchronously in the order they were subscribed.
	* Each callback's return value is appended to the result array so that
	* publishers can inspect handler outcomes if needed (e.g. for veto patterns).
	*
	* Returns false — not an empty array — when the event has no subscribers,
	* allowing callers to distinguish "no one is listening" from "listeners all
	* returned null/void".
	*
	* (!) Publishing an event does not remove subscriptions. Handlers remain
	* registered until unsubscribe() or clear_event() is called.
	*
	* @param string $event_name - Name of the event to fire.
	* @param mixed $data = [] - Payload passed verbatim to every subscriber callback.
	* @return array|false - Ordered array of callback return values, or false when no subscribers exist.
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
	* Returns a flat list of all currently active subscriptions across all events.
	*
	* Each entry in the returned array is an associative array with three keys:
	*   'event_name' (string)  — the event channel name
	*   'token'      (string)  — the subscription token
	*   'callback'   (callable) — the registered handler reference
	*
	* Intended for debugging and introspection only. Callers should not
	* manipulate subscriptions by interacting with the returned callbacks directly;
	* use subscribe()/unsubscribe() instead.
	*
	* @return array<int, array{event_name: string, token: string, callback: callable}>
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
	* Reports whether a specific callable is already subscribed to the named event.
	*
	* Uses strict identity comparison (===) so two closures with identical bodies
	* but different instances are treated as distinct. Useful to guard subscribe()
	* calls when the caller cannot retain the token from a previous registration.
	*
	* Prefer event_name_exists() when you only need to know if the event channel
	* has any subscribers at all; event_exists() carries the cost of in_array().
	*
	* @param string $event_name - The event channel name to inspect.
	* @param callable $callback - The callback reference to search for.
	* @return bool - true if $callback is already subscribed to $event_name.
	*/
	public function event_exists(string $event_name, callable $callback) : bool {

		if (!isset($this->eventMap[$event_name])) {
			return false;
		}

		return in_array($callback, $this->eventMap[$event_name], true);
	}//end event_exists



	/**
	* EVENT_NAME_EXISTS
	* Reports whether any callback is currently subscribed to the named event.
	*
	* Cheaper than event_exists() — O(1) hash lookup with no iteration.
	* Useful before setting up conditional subscriptions (e.g. in view_tool_cataloging_mosaic.js)
	* to avoid registering duplicate hover/mouseleave handlers.
	*
	* @param string $event_name - The event channel name to check.
	* @return bool - true if at least one subscriber is registered for $event_name.
	*/
	public function event_name_exists(string $event_name) : bool {

		return isset($this->eventMap[$event_name]);
	}//end event_name_exists



	/**
	* CLEAR_EVENT
	* Removes all subscriptions for a single named event in one pass.
	*
	* More efficient than calling unsubscribe() for each token when an entire
	* event channel should be torn down (e.g. when a UI panel is destroyed and
	* all its local subscriptions need to be released at once).
	*
	* Iterates $tokenMap once to remove reverse-index entries for this event,
	* then deletes the event bucket from $eventMap. After this call,
	* event_name_exists($event_name) returns false and publish() returns false.
	*
	* @param string $event_name - The event channel to clear.
	* @return bool - true if the event existed and its subscribers were removed, false if the event was not registered.
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
	* Resets the event bus to its initial empty state.
	*
	* Drops all subscriptions across every event channel. Equivalent to
	* constructing a fresh instance. Primarily used in test teardown or
	* when a long-running worker (persistent PHP) needs to flush all
	* registered listeners between logical request boundaries.
	*
	* (!) After this call, any previously issued token is invalid.
	* Callers that stored tokens for later unsubscription must re-subscribe.
	*
	* @return void
	*/
	public function clear_all() : void {

		$this->eventMap = [];
		$this->tokenMap = [];
	}//end clear_all



	/**
	* GET_EVENT_COUNT
	* Returns the number of callbacks currently subscribed to one named event.
	*
	* Returns 0 — not false — when the event has no subscribers, to allow
	* safe arithmetic comparisons without type juggling.
	*
	* @param string $event_name - The event channel name to inspect.
	* @return int - Subscriber count, or 0 if the event is unknown.
	*/
	public function get_event_count(string $event_name) : int {

		if (!isset($this->eventMap[$event_name])) {
			return 0;
		}

		return count($this->eventMap[$event_name]);
	}//end get_event_count



	/**
	* GET_TOTAL_EVENTS
	* Returns the total number of active subscriptions across all event channels.
	*
	* Reads the count from $tokenMap (one entry per subscription) rather than
	* summing the inner $eventMap arrays — both give the same result but
	* count($tokenMap) is a single O(1) operation.
	*
	* Useful for monitoring whether subscriptions are leaking across re-renders:
	* a continuously growing count in a persistent worker indicates that
	* listeners are being registered without a matching unsubscribe().
	*
	* @return int - Total number of active subscriptions.
	*/
	public function get_total_events() : int {

		return count($this->tokenMap);
	}//end get_total_events



}//end event_manager_class