// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global SHOW_DEBUG */
/*eslint no-undef: "error"*/


/**
* EVENT_MANAGER
* Pub/sub event bus used throughout Dédalo v7 for decoupled inter-module communication.
*
* Exports a single pre-instantiated singleton (`event_manager`) and additionally registers
* it on `window.event_manager` for cross-iframe access (e.g. tool iframes calling
* `parent.window.event_manager`). All sections, components, tools, and search modules
* communicate by subscribing to and publishing named events through this singleton rather
* than holding direct references to each other.
*
* Main export: {event_manager_class} event_manager
*/


/**
* EVENT_MANAGER_CLASS
* ES6 class implementing a high-performance named-event publish/subscribe system.
*
* Uses a Map<string, Set<Function>> (eventMap) keyed by event name for O(1) lookup
* and a Map<string, {event_name, callback}> (tokenMap) keyed by token for O(1)
* unsubscription without scanning subscriber lists.
*
* Callers receive an opaque string token from subscribe() and pass it back to
* unsubscribe(). The token format is "event_N" where N is an ever-increasing integer.
* Empty event entries are cleaned up automatically to prevent memory leaks.
*
* @example
* // Basic usage
* const manager = new event_manager_class();
* const token = manager.subscribe('user-login', (data) => {
*   console.log('User logged in:', data.username);
* });
*
* manager.publish('user-login', { username: 'john_doe' });
* manager.unsubscribe(token);
*/
class event_manager_class {

	/**
	 * CONSTRUCTOR
	 * Initializes the three internal data structures that power the event bus.
	 *
	 * - eventMap: primary subscription registry — event_name → Set of callback functions.
	 *   Allows O(1) callback lookup and automatic deduplication via Set semantics.
	 * - tokenMap: reverse index — token → {event_name, callback}.
	 *   Enables O(1) unsubscription without scanning eventMap.
	 * - last_token: monotonically increasing counter for generating unique token strings.
	 */
	constructor() {
		this.eventMap = new Map();  // event_name -> Set(callback)
		this.tokenMap = new Map();  // token -> {event_name, callback}
		this.last_token = 0;       // Start from 0, no need for negative
	}

	/**
	 * SUBSCRIBE
	 * Registers a callback function to be called every time the named event is published.
	 *
	 * A new entry is created in eventMap for the event name on first subscription.
	 * Each call produces a unique opaque token (format "event_N") that the caller must
	 * retain to unsubscribe later. When SHOW_DEBUG is true, registering the same callback
	 * function reference more than once for the same event emits a console error and an
	 * alert — this is a developer-mode guard, not a thrown exception.
	 *
	 * (!) The token identifies the subscription, not the callback. Passing the same
	 * callback function to subscribe() twice produces two independent subscriptions,
	 * each with its own token, and the callback will fire twice per publish.
	 *
	 * @param {string} event_name - The name of the event to subscribe to
	 * @param {Function} callback - The callback function to execute when the event is published
	 * @returns {string} A unique token string for this subscription (format: "event_N")
	 *
	 * @example
	 * const token = manager.subscribe('data-updated', (data) => {
	 *   console.log('Received update:', data);
	 * });
	 */
	subscribe(event_name, callback) {
		const token = `event_${++this.last_token}`;

		// Get or create callbacks set
		let callbacks = this.eventMap.get(event_name);
		if (!callbacks) {
			callbacks = new Set();
			this.eventMap.set(event_name, callbacks);
		}

		// Check for duplicates (only if debugging is enabled)
		if (SHOW_DEBUG === true && callbacks.has(callback)) {
			console.error(`)))) Found duplicated subscription: ${event_name}`);
			// alert(`Found duplicated subscription ${event_name}`);
		}

		// Add callback and store token mapping
		callbacks.add(callback);
		this.tokenMap.set(token, { event_name, callback });

		return token;
	}

	/**
	 * SUBSCRIBE_ONCE
	 * Subscribes a callback to an event that fires exactly once and then self-removes.
	 *
	 * Internally wraps `callback` in a closure that calls unsubscribe(token) before
	 * invoking the original callback, guaranteeing a single execution even if publish()
	 * is called multiple times. The returned token is for the wrapper closure, not for
	 * the original `callback`.
	 *
	 * (!) Because the wrapper is subscribed (not the original callback), calling
	 * event_exists(event_name, callback) after subscribe_once() will return false —
	 * use the returned token to cancel early if needed.
	 *
	 * @param {string} event_name - The name of the event to subscribe to
	 * @param {Function} callback - The callback function to execute once
	 * @returns {string} Subscription token for the internal wrapper (use to cancel before first fire)
	 */
	subscribe_once(event_name, callback) {
		const token = this.subscribe(event_name, (data) => {
			this.unsubscribe(token);
			return callback(data);
		});
		return token;
	}

	/**
	 * UNSUBSCRIBE
	 * Removes the subscription identified by the given token.
	 *
	 * Uses tokenMap for O(1) lookup of the event name and callback reference, then
	 * removes the callback from eventMap. If the event's callback Set becomes empty
	 * after removal, the event entry is deleted from eventMap to reclaim memory.
	 * Returns false silently when the token is unknown or already removed; in debug
	 * mode the commented-out console.error line can be enabled for tracing stale tokens.
	 *
	 * @param {string} token - The subscription token returned by subscribe()
	 * @returns {boolean} true if the subscription was found and removed, false otherwise
	 *
	 * @example
	 * const token = manager.subscribe('user-action', callback);
	 * const success = manager.unsubscribe(token); // Returns true if successful
	 */
	unsubscribe(token) {
		const entry = this.tokenMap.get(token);
		if (!entry) {
			if (SHOW_DEBUG === true) {
				// console.error('Ignored empty or unknown event_token from unsubscribe:', token);
			}
			return false;
		}

		const { event_name, callback } = entry;
		const callbacks = this.eventMap.get(event_name);

		// Remove callback and cleanup if empty
		if (callbacks) {
			callbacks.delete(callback);
			if (callbacks.size === 0) {
				this.eventMap.delete(event_name);
			}
		}

		this.tokenMap.delete(token);
		return true;
	}

	/**
	 * PUBLISH
	 * Fires the named event, invoking every subscribed callback in insertion order.
	 *
	 * All callbacks receive the same `data` argument. Callbacks are called synchronously
	 * in the order they were subscribed. The method collects each callback's return value
	 * into a results array, which is returned to the caller — useful when a subscriber
	 * signals cancellation or provides a transformed value.
	 *
	 * Returns false (not an empty array) when there are no subscribers, allowing callers
	 * to distinguish "no listeners" from "listeners returned nothing".
	 *
	 * (!) Callbacks are not wrapped in try/catch. A throwing callback will abort the
	 * remaining subscribers in the Set iteration.
	 *
	 * @param {string} event_name - The name of the event to publish
	 * @param {*} data - Data to pass to each callback function (defaults to empty object)
	 * @returns {Array|boolean} Array of callback return values, or false if no subscribers
	 *
	 * @example
	 * // Publish with data
	 * const results = manager.publish('user-updated', {
	 *   id: 123,
	 *   name: 'John Doe'
	 * });
	 *
	 * // Publish without data
	 * manager.publish('app-ready');
	 */
	publish(event_name, data = {}) {
		const callbacks = this.eventMap.get(event_name);
		if (!callbacks || callbacks.size === 0) return false;

		// Snapshot the subscriber set before dispatch so that subscribers added or
		// removed during this publish (e.g. subscribe_once self-unsubscribing, or a
		// handler re-arming itself) do not change which callbacks fire in this pass.
		// Use forEach for better performance than for...of with array creation
		const results = [];
		callbacks.forEach(callback => {
			results.push(callback(data));
		});

		return results;
	}

	/**
	 * GET_EVENTS
	 * Returns a snapshot array of all active subscriptions for debugging and introspection.
	 *
	 * Each element describes one subscription: the event name, the opaque token, and the
	 * callback function reference. The array is pre-allocated to tokenMap.size for
	 * efficiency. The returned snapshot is not live — it reflects the state at call time.
	 *
	 * @returns {Array<{event_name: string, token: string, callback: Function}>}
	 *   One object per active subscription.
	 *
	 * @example
	 * const events = manager.get_events();
	 * console.log(`Active subscriptions: ${events.length}`);
	 * events.forEach(event => {
	 *   console.log(`${event.event_name}: ${event.token}`);
	 * });
	 */
	get_events() {
		// Pre-allocate array for better performance
		const events = new Array(this.tokenMap.size);
		let i = 0;

		for (const [token, { event_name, callback }] of this.tokenMap) {
			events[i++] = { event_name, token, callback };
		}

		return events;
	}

	/**
	 * EVENT_EXISTS
	 * Checks whether a specific callback function reference is subscribed to an event.
	 *
	 * Uses Set.has() for O(1) identity comparison. Note that this checks reference
	 * equality — two different function objects with the same body are not considered
	 * the same callback. Always returns false for callbacks registered via subscribe_once(),
	 * which wraps the original callback in an internal closure.
	 *
	 * @param {string} event_name - The event name to check
	 * @param {Function} callback - The callback function reference to look for
	 * @returns {boolean} true if the exact callback reference is subscribed to the event
	 *
	 * @example
	 * const myCallback = (data) => console.log(data);
	 *
	 * if (!event_manager.event_exists('user-login', myCallback)) {
	 *   event_manager.subscribe('user-login', myCallback);
	 * }
	 */
	event_exists(event_name, callback) {
		const callbacks = this.eventMap.get(event_name);
		return callbacks ? callbacks.has(callback) : false;
	}


	/**
	 * EVENT_NAME_EXISTS
	 * Checks whether any callback is subscribed to the given event name.
	 *
	 * Returns the callback Set for the event, or undefined when no subscription
	 * exists. Callers use this in a truthy/falsy context to guard against
	 * re-subscribing to events that already have listeners (e.g. mosaic hover
	 * events in tool_cataloging and tool_numisdata_order_coins).
	 *
	 * (!) Despite the intuitive name, the return value is NOT a boolean — it is
	 * the raw Set<Function> (truthy when subscriptions exist) or undefined (falsy).
	 * Do not compare the return value with === true/false.
	 *
	 * The `callback` parameter is declared in the signature but not used; it exists
	 * only for API symmetry with event_exists() and is safe to omit.
	 *
	 * @param {string} event_name - The event name to check
	 * @param {Function} [callback] - Unused; kept for API symmetry with event_exists()
	 * @returns {Set|undefined} The Set of callbacks when the event exists, undefined otherwise
	 *
	 * @example
	 * if (!event_manager.event_name_exists('user-login')) {
	 *   event_manager.subscribe('user-login', myCallback);
	 * }
	 */
	event_name_exists(event_name, callback) {
		return this.eventMap.get(event_name);
	}


	/**
	 * CLEAR_EVENT
	 * Removes all subscriptions for a specific event name in one operation.
	 *
	 * More convenient than calling unsubscribe() for each token individually.
	 * Walks the entire tokenMap (O(n) in total subscription count) to remove all
	 * token entries belonging to the given event, then deletes the event's Set from
	 * eventMap. For high-volume events with many tokens this is still cheaper than
	 * individual token lookups, but be aware of the linear scan cost.
	 *
	 * @param {string} event_name - The event name to clear
	 * @returns {boolean} true if the event existed and was cleared, false if it did not exist
	 *
	 * @example
	 * event_manager.clear_event('temporary-notifications');
	 */
	clear_event(event_name) {
		const callbacks = this.eventMap.get(event_name);
		if (!callbacks) return false;

		// Remove all tokens for this event
		for (const [token, entry] of this.tokenMap) {
			if (entry.event_name === event_name) {
				this.tokenMap.delete(token);
			}
		}

		this.eventMap.delete(event_name);
		return true;
	}

	/**
	 * CLEAR_ALL
	 * Removes every event subscription and resets the manager to a clean initial state.
	 *
	 * Useful for teardown in tests or before full application reinitialization.
	 * All outstanding tokens become invalid after this call — any subsequent
	 * unsubscribe() call with a previously issued token will return false silently.
	 *
	 * @returns {void}
	 *
	 * @example
	 * // Clean up before page unload
	 * window.addEventListener('beforeunload', () => {
	 *   manager.clear_all();
	 * });
	 */
	clear_all() {
		this.eventMap.clear();
		this.tokenMap.clear();
	}

	/**
	 * GET_EVENT_COUNT
	 * Returns the number of callbacks subscribed to a specific event.
	 *
	 * Reads the Set.size directly from eventMap — O(1). Returns 0 when no
	 * subscription exists for the given event name (event not yet seen or already
	 * cleared). Useful for monitoring and conditional publish guards.
	 *
	 * @param {string} event_name - The event name to count subscribers for
	 * @returns {number} The number of active subscriber callbacks (0 if event doesn't exist)
	 *
	 * @example
	 * const count = manager.get_event_count('user-activity');
	 * console.log(`${count} handlers listening for user activity`);
	 */
	get_event_count(event_name) {
		const callbacks = this.eventMap.get(event_name);
		return callbacks ? callbacks.size : 0;
	}

	/**
	 * GET_TOTAL_EVENTS
	 * Returns the total count of active subscriptions across all event names.
	 *
	 * Reads tokenMap.size directly — O(1). Each call to subscribe() increments
	 * this count; each successful unsubscribe() decrements it. The count reflects
	 * individual subscriptions, not unique event names — one event with three
	 * subscribers contributes 3 to the total.
	 *
	 * @returns {number} Total number of active subscriptions across all events
	 *
	 * @example
	 * const total = manager.get_total_events();
	 * console.log(`Total active subscriptions: ${total}`);
	 *
	 * // Monitor subscription growth
	 * setInterval(() => {
	 *   if (manager.get_total_events() > 1000) {
	 *     console.warn('High number of subscriptions detected');
	 *   }
	 * }, 5000);
	 */
	get_total_events() {
		return this.tokenMap.size;
	}
}

/**
 * EVENT_MANAGER
 * Module-level singleton — the single shared event bus for the entire Dédalo v7 frontend.
 *
 * All modules import this instance rather than constructing their own, ensuring that a
 * subscription made in one module (e.g. a section component) is always visible to a
 * publisher in another (e.g. a search tool). Do not instantiate event_manager_class
 * directly in application code; always import and use this export.
 *
 * @type {event_manager_class}
 * @example
 * import { event_manager } from '../../common/js/event_manager.js';
 *
 * event_manager.subscribe('app-ready', () => {
 *   console.log('Application is ready!');
 * });
 */
export const event_manager = new event_manager_class();

// Make available globally in browser environments
if (typeof window !== 'undefined') {
	/**
	 * Expose the singleton on the window object so that tool iframes can reach it via
	 * `parent.window.event_manager` without needing an ES module import across frame
	 * boundaries. Only set in browser contexts (guards against SSR / Node workers).
	 */
	window.event_manager = event_manager;
}



// @license-end
