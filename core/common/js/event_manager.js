// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0



/**
* EVENTMANAGER_CLASS
* A high-performance event system for managing subscriptions and publications
*
* This class provides a robust event management system with O(1) operations for most methods.
* It uses Maps and Sets for optimal performance and supports duplicate detection, token-based
* unsubscription, and efficient event publishing.
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
	 * Creates a new event_manager_class instance
	 *
	 * Initializes internal data structures:
	 * - eventMap: Maps event names to Sets of callback functions
	 * - tokenMap: Maps subscription tokens to event metadata
	 * - last_token: Counter for generating unique subscription tokens
	 */
	constructor() {
		this.eventMap = new Map();  // event_name -> Set(callback)
		this.tokenMap = new Map();  // token -> {event_name, callback}
		this.last_token = 0;       // Start from 0, no need for negative
	}

	/**
	 * Subscribes a callback function to an event
	 *
	 * Creates a new subscription for the specified event. Each subscription receives
	 * a unique token that can be used for unsubscription. Duplicate callbacks for
	 * the same event are detected when debugging is enabled.
	 *
	 * @param {string} event_name - The name of the event to subscribe to
	 * @param {Function} callback - The callback function to execute when the event is published
	 * @returns {string} A unique token string for this subscription (format: "event_N")
	 *
	 * @example
	 * const token = manager.subscribe('data-updated', (data) => {
	 *   console.log('Received update:', data);
	 * });
	 *
	 * @throws {Error} Logs error if duplicate callback is detected (debug mode only)
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
			alert(`Found duplicated subscription ${event_name}`);
		}

		// Add callback and store token mapping
		callbacks.add(callback);
		this.tokenMap.set(token, { event_name, callback });

		return token;
	}

	/**
	 * Unsubscribes a callback using its subscription token
	 *
	 * Removes the subscription associated with the provided token. Automatically
	 * cleans up empty event entries to prevent memory leaks.
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
	 * Publishes an event to all subscribed callbacks
	 *
	 * Executes all callback functions subscribed to the specified event, passing
	 * the provided data to each callback. Returns an array of all callback return values.
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

		// Use forEach for better performance than for...of with array creation
		const results = [];
		callbacks.forEach(callback => {
			results.push(callback(data));
		});

		return results;
	}

	/**
	 * Retrieves all active event subscriptions
	 *
	 * Returns an array containing details of all current subscriptions including
	 * event names, tokens, and callback references. Useful for debugging and
	 * subscription management.
	 *
	 * @returns {Array<Object>} Array of subscription objects
	 * @returns {string} returns[].event_name - The event name
	 * @returns {string} returns[].token - The subscription token
	 * @returns {Function} returns[].callback - The callback function reference
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
	 * Checks if a specific callback is subscribed to an event
	 *
	 * Determines whether the given callback function is already subscribed
	 * to the specified event. Useful for preventing duplicate subscriptions
	 * programmatically.
	 *
	 * @param {string} event_name - The event name to check
	 * @param {Function} callback - The callback function to look for
	 * @returns {boolean} true if the callback is subscribed to the event
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
	 * Checks if a specific event name is already defined
	 *
	 * @param {string} event_name - The event name to check
	 * @returns {boolean} true if a event is subscribed whit given name.
	 *
	 * @example
	 *
	 * if (!event_manager.event_name_exists('user-login')) {
	 *   // Do something
	 * }
	 */
	event_name_exists(event_name, callback) {
		return this.eventMap.get(event_name);
	}


	/**
	 * Removes all subscriptions for a specific event
	 *
	 * Efficiently clears all callbacks associated with the given event name.
	 * This is more efficient than unsubscribing individual tokens when you
	 * need to clear an entire event.
	 *
	 * @param {string} event_name - The event name to clear
	 * @returns {boolean} true if the event existed and was cleared, false otherwise
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
	 * Clears all events and subscriptions
	 *
	 * Removes all event subscriptions and resets the event_manager_class to its
	 * initial state. This is useful for cleanup operations or testing.
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
	 * Gets the number of subscribers for a specific event
	 *
	 * Returns the count of callback functions subscribed to the given event.
	 * Useful for monitoring subscription levels and debugging.
	 *
	 * @param {string} event_name - The event name to count subscribers for
	 * @returns {number} The number of subscribers (0 if event doesn't exist)
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
	 * Gets the total number of active subscriptions
	 *
	 * Returns the total count of all active event subscriptions across
	 * all events. Useful for memory usage monitoring and performance analysis.
	 *
	 * @returns {number} Total number of active subscriptions
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
 * Global event_manager_class instance
 *
 * Pre-instantiated event_manager_class for immediate use throughout the application.
 * This singleton pattern ensures consistent event management across modules.
 *
 * @type {event_manager_class}
 * @example
 * import { event_manager } from './event-manager.js';
 *
 * event_manager.subscribe('app-ready', () => {
 *   console.log('Application is ready!');
 * });
 */
export const event_manager = new event_manager_class();

// Make available globally in browser environments
if (typeof window !== 'undefined') {
	/**
	 * Global window reference to event_manager_class instance
	 * Available as window.event_manager for direct browser console access
	 * included iframes calling as parent.window
	 */
	window.event_manager = event_manager;
}



// @license-end
