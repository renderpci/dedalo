// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/

/**
* EVENTS
* Page-level event helpers for the Dédalo application shell.
*
* Responsibilities:
* - Bootstrap global DOM event listeners (visibilitychange, save) via events_init().
* - Derive the page-wide unsaved-data flag (window.unsaved_data) from the
*   unsaved-instances registry (register_unsaved_instance /
*   deregister_unsaved_instance / reset_unsaved_data) plus the coarse
*   instance-less set_before_unload() assertion.
* - Provide DOM-readiness utilities (when_in_dom, when_in_viewport) used by
*   components such as maps and media players that require the node to be in
*   layout before they can initialise.
* - Expose scheduling helpers (dd_request_idle_callback, yield_to_main) that
*   defer low-priority work so the browser stays responsive during heavy renders.
* - Attach keyboard shortcuts and other global event bindings defined in tool
*   configuration objects via set_tool_event().
*
* Exports: events_init, set_before_unload, register_unsaved_instance,
*          deregister_unsaved_instance, reset_unsaved_data, when_in_dom,
*          when_in_viewport, dd_request_idle_callback, set_tool_event.
*          yield_to_main is a module-private helper (not exported).
*/

// import
	import {event_manager} from './event_manager.js'



/**
* unsaved_data set default
* Initialise the global flag only once; avoids overwriting state if the module
* is evaluated more than once in a multi-frame context.
*/
if (typeof window!=='undefined' && typeof window.unsaved_data==='undefined') {
	window.unsaved_data = false
}



/**
* UNSAVED-DATA REGISTRY
* (!) window.unsaved_data is DERIVED state: after module init its ONLY writer
* is update_unsaved_data() below. It used to be a single page-wide boolean
* assigned directly by every component, so ANY component could set it to false
* purely because ITS OWN current value matched its db_data snapshot
* (set_changed_data's revert branch) — silently disarming the unsaved-work
* guard for every OTHER dirty component on the page. Concretely: edit a
* debounced component_text_area, type-and-delete one character in a second
* field, close the tab — the text_area edit was dropped with no save, no
* prompt and no log line. Now each component instance registers itself while
* it holds a genuine unsaved change and can only deregister ITSELF (on
* revert, save success or destroy); the boolean is recomputed from the
* registry plus the coarse instance-less assertion, so one component's revert
* cannot disarm another's guard.
*/

// unsaved_instances. Component instances currently holding a genuine unsaved
// change, keyed by instance identity and driven by the EQUALITY VERDICT in
// component_common.set_changed_data (NOT by changed_data.length). A plain Set
// — a WeakSet cannot be counted — with explicit removal on instance teardown
// (common.js do_delete_self), so a destroyed dirty instance cannot pin the
// flag forever.
	const unsaved_instances = new Set()

// unsaved_asserted. The coarse instance-less "something is dirty" assertion,
// kept for callers that guard raw keystrokes without a component registration
// (view_default_edit_filter_records, view_default_edit_security_access) via
// set_before_unload(true). Cleared by set_before_unload(false) — called on
// every component save completion — and by reset_unsaved_data().
	let unsaved_asserted = false



/**
* UPDATE_UNSAVED_DATA
* Recompute the derived window.unsaved_data boolean: true while at least one
* instance is registered as unsaved OR the coarse assertion is active.
* Every registry/assertion mutation funnels through here, so no code path can
* write the boolean behind the registry's back. Readers (page.js beforeunload,
* component_common check_unsaved_data, events_init) keep reading a plain
* boolean, unchanged.
*
* @returns {boolean} The recomputed window.unsaved_data value
*/
const update_unsaved_data = function() {

	window.unsaved_data = (unsaved_instances.size > 0 || unsaved_asserted===true)

	return window.unsaved_data
}//end update_unsaved_data



/**
* REGISTER_UNSAVED_INSTANCE
* Mark the given component instance as holding a genuine unsaved change (its
* current value differs from its db_data snapshot, per the is_equal verdict
* in component_common.set_changed_data) and re-derive window.unsaved_data.
* Registering an already registered instance is a no-op (Set semantics).
*
* @param {Object} instance - The component instance with unsaved data
* @returns {boolean} The recomputed window.unsaved_data value (true here)
*/
export const register_unsaved_instance = function(instance) {

	unsaved_instances.add(instance)

	return update_unsaved_data()
}//end register_unsaved_instance



/**
* DEREGISTER_UNSAVED_INSTANCE
* Retire the given instance's own unsaved registration — because its value is
* back to the db_data snapshot, its save succeeded, or it is being destroyed —
* and re-derive window.unsaved_data. (!) This only ever removes the CALLER'S
* entry: other registered instances keep the guard armed, which is the whole
* point of the registry (see the header above). An unregistered instance is a
* no-op.
*
* @param {Object} instance - The component instance to deregister
* @returns {boolean} The recomputed window.unsaved_data value
*/
export const deregister_unsaved_instance = function(instance) {

	unsaved_instances.delete(instance)

	return update_unsaved_data()
}//end deregister_unsaved_instance



/**
* RESET_UNSAVED_DATA
* Clear the WHOLE registry and the coarse assertion, then re-derive
* window.unsaved_data (false). This is the deliberate page-wide reset for
* check_unsaved_data's two resolutions ONLY: "every dirty component was just
* flushed by the auto-save sweep" and "the user explicitly accepted losing
* the remaining changes". Nothing else may clear state it does not own.
*
* @returns {boolean} The recomputed window.unsaved_data value (false here)
*/
export const reset_unsaved_data = function() {

	unsaved_instances.clear()
	unsaved_asserted = false

	return update_unsaved_data()
}//end reset_unsaved_data



/**
* EVENTS_INIT  (!) WORK IN PROGRESS
* Attach global document-level event listeners at application startup.
*
* Called once from the main page initialisation (/page/index.html). Registers:
* - A 'visibilitychange' listener to detect tab-switch with unsaved changes
*   (the await-save path is stubbed, pending full implementation).
* - A subscription to the 'save' event_manager channel so this module can react
*   when any component successfully persists its data.
*
* (!) This function is intentionally incomplete. The visibilitychange handler
* currently does nothing when unsaved_data is true — the real save-on-hide flow
* is deferred.
*
* @returns {boolean} Always returns true after listeners are attached.
*/
export const events_init = function() {

	// (!) WORK IN PROGRESS

	// add visibility change to control if the user change the tab without save
		const visibility_change = async () => {

			if (document.visibilityState==='hidden' && window.unsaved_data===true) {
				// await saving
			}
		}
		document.addEventListener('visibilitychange', visibility_change);

	// save
		const save_handler = (result) => {
			if(SHOW_DEBUG===true) {
				console.log('events_init save result:', result)
			}
			// saved = true
		}
		event_manager.subscribe('save', save_handler)


	return true
}//end events_init



/**
* SET_BEFORE_UNLOAD
* Toggle the coarse instance-less unsaved-data assertion and re-derive
* window.unsaved_data.
*
* (!) This no longer assigns window.unsaved_data directly: the flag is DERIVED
* (see the unsaved-data registry above), so set_before_unload(false) clears
* only the coarse assertion — it CANNOT disarm the guard while component
* instances are still registered as dirty. Components no longer call this for
* their own edit state (they register/deregister themselves via
* register_unsaved_instance / deregister_unsaved_instance); the remaining
* callers are keystroke guards with no component registration
* (view_default_edit_filter_records, view_default_edit_security_access) with
* true, and component_common.save() with false once a save completed. The flag
* stays on window.unsaved_data so other parts of the application (e.g.
* events_init's visibilitychange handler) can read it without importing this
* module.
*
* The beforeunload listener block is currently commented out (see dead code below);
* only the derived flag is maintained. When the listener is re-enabled it will
* show the browser's native "leave page?" dialog on navigation while unsaved
* data exists.
*
* @param {boolean} value - true to assert unsaved changes exist outside any
*   component registration; false to retract that assertion.
* @returns {boolean|undefined} The recomputed window.unsaved_data value when the
*   assertion changed; undefined when it already matched value (no-op fast path).
*/
export const set_before_unload = function(value) {
	if(SHOW_DEBUG===true) {
		console.warn("///////////////////// set_before_unload value:", value);
	}

	// already fixed current value (true/false)
		if (value===unsaved_asserted) {
			return
		}

	// fix value. The derived window.unsaved_data is recomputed at the return below
		unsaved_asserted = value

	// add/remove listener
		// if (value===true) {
		// 	// window dialog will be shown when user leaves the page
		// 	addEventListener('beforeunload', before_unload_listener, {capture: true});
		// 	// window.unsaved_data = true
		// }else if(value===false){
		// 	// restore the normal page exit status
		// 	removeEventListener('beforeunload', before_unload_listener, {capture: true});
		// 	// window.unsaved_data = false
		// }

	return update_unsaved_data()
}//end set_before_unload



/**
* BEFORE_UNLOAD_LISTENER  (dead code — disabled, kept for future re-activation)
* Intercept the browser's beforeunload event when unsaved changes are present.
*
* Sets event.returnValue to trigger the native "leave page?" confirmation dialog.
* Falls back to a hardcoded English string if the localised label is unavailable.
* Re-enable by restoring the listener registration inside set_before_unload above.
*
* @param {BeforeUnloadEvent} event - The native beforeunload event.
*/
	// const before_unload_listener = function(event) {
	// 	event.preventDefault();

	// 	// document.activeElement.blur()
	// 	if (window.unsaved_data===false) {
	// 		return
	// 	}

	// 	return event.returnValue = get_label.discard_changes || 'Discard unsaved changes?';
	// }//end before_unload_listener




/**
* WHEN_IN_DOM
* Execute a callback the first time the given node is attached to the document.
*
* Many third-party components (Leaflet maps, canvas renderers, media players)
* must query layout metrics that are only available once the element is part of
* the live DOM. This helper either fires the callback immediately (if the node
* is already present) or defers until a MutationObserver detects insertion.
*
* The observer watches the entire document subtree and disconnects itself after
* the first successful detection to avoid memory leaks.
*
* @param {HTMLElement} node - The element to watch for DOM insertion.
* @param {Function} callback - Called with no arguments once the node is in the DOM.
*   When the node is already present, the callback's own return value is forwarded.
* @returns {MutationObserver|*} The live MutationObserver when deferred, or the
*   callback's return value when the node was already in the DOM.
*/
export const when_in_dom = function(node, callback) {

	if (document.contains(node)) {
		return callback()
	}

	const observer = new MutationObserver(function(mutations) {
		if (document.contains(node)) {
			// console.log("It's in the DOM!");
			observer.disconnect();

			callback()
		}
	});

	observer.observe(document, {attributes: false, childList: true, characterData: false, subtree:true});

	return observer
}//end when_in_dom



/**
* WHEN_IN_VIEWPORT
* Execute a callback whenever the given node enters the visible viewport.
*
* Uses IntersectionObserver with a threshold of 0, meaning the callback fires
* as soon as even one pixel of the element becomes visible. The callback receives
* the matching IntersectionObserverEntry so callers can inspect intersection
* geometry (e.g. for analytics or progressive loading).
*
* By default (once=true) the observer disconnects after the first intersection,
* making this a one-shot "lazy init" trigger. Pass once=false to keep observing
* for repeated visibility changes (e.g. scroll-driven animations).
*
* The callback is deferred through requestAnimationFrame so the DOM has settled
* and layout properties are safe to read.
*
* @param {HTMLElement} node - The element to observe. Must be an HTMLElement instance.
* @param {Function} callback - Invoked with the IntersectionObserverEntry on visibility.
* @param {boolean} [once=true] - When true, disconnect after the first intersection.
* @param {object} [observer_options={}] - Extra IntersectionObserver options merged over
*   the defaults (e.g. `{ rootMargin: '200px' }` to preload before the node is visible).
* @throws {Error} When node is not an HTMLElement instance.
* @returns {IntersectionObserver|undefined} The active observer, or undefined when callback is invalid.
*/
export const when_in_viewport = function(node, callback, once=true, observer_options={}) {

	if (!(node instanceof HTMLElement)) {
		throw new Error("Invalid node passed to when_in_viewport");
	}

	if (typeof callback !== 'function') {
		console.warn("when_in_viewport: callback is not a function");
		return;
	}

	// observer. Exec the callback when element is in viewport
	const observer = new IntersectionObserver(
		function(entries, observer) {

			const entry = entries[0]
			if (entry.isIntersecting || entry.intersectionRatio > 0) {

				// default is true (executes the callback once)
				if (once) {
					observer.disconnect();
				}

				// Execute callback with proper context
				window.requestAnimationFrame(() => callback(entry));
			}
		},
		{
			rootMargin: '0px',
			threshold: [0],
			...observer_options
		}
	);
	observer.observe(node);


	return observer
}//end when_in_viewport



/**
* LAZY_IN_VIEWPORT
* Convenience wrapper over when_in_viewport with a uniform 200px preload margin,
* so heavy lazily-initialised content (media, json/leaflet/ckeditor editors)
* starts loading just before it becomes visible and feels instant on scroll.
* Shared by media and non-media components to keep the preload margin in one place.
*
* @param {HTMLElement} node - The element to observe.
* @param {Function} on_enter - Invoked once when the node nears the viewport.
* @returns {IntersectionObserver|undefined} The active observer.
*/
export const lazy_in_viewport = function(node, on_enter) {
	return when_in_viewport(node, on_enter, true, { rootMargin: '200px' })
}//end lazy_in_viewport



/**
* FADE_IN_ON_REVEAL
* Generic smooth fade-in for lazily-initialised content (media, json/leaflet/
* ckeditor editors, ...). Adds the `.lazy_fade` class (defined in layout.less) so
* the container starts invisible, and returns a `reveal` function the caller
* invokes once the content is ready (on load / ready / error) to fade it in.
* Centralises what used to be duplicated inline opacity/transition assignments.
*
* @param {HTMLElement} container - The element to fade in.
* @returns {Function} reveal - Call to fade the container in.
*/
export const fade_in_on_reveal = function(container) {
	container.classList.add('lazy_fade')
	return () => container.classList.add('is_loaded')
}//end fade_in_on_reveal



/**
* DD_REQUEST_IDLE_CALLBACK
* Schedule a callback for execution during the browser's idle periods.
*
* Wraps the native requestIdleCallback API with a cross-browser fallback:
* when requestIdleCallback is unavailable (Safari as of early 2024), the
* callback is queued via requestAnimationFrame so it runs at the next paint
* boundary rather than truly idle time. A timeout of 1000 ms is passed to
* requestIdleCallback to guarantee the callback runs even on a busy main thread.
*
* Use this for background, low-priority work that should not interfere with
* animations or user input — for example, pre-computing search indices or
* flushing non-critical log entries.
*
* @param {Function} callback - The function to invoke during an idle period.
*   When called via the native API it receives an IdleDeadline argument;
*   the requestAnimationFrame fallback passes a DOMHighResTimeStamp instead.
* @returns {void}
*/
export const dd_request_idle_callback = function (callback) {

	if (typeof window.requestIdleCallback === 'function') {
		// Use requestIdleCallback to schedule work if available
		requestIdleCallback(callback, { timeout: 1000 })
	} else {
		// Fallback for browsers without requestIdleCallback support (e.g. older Safari).
		// (!) Use setTimeout (a macrotask) instead of requestAnimationFrame so the work
		// is deferred OFF the animation frame: it then runs AFTER the rAF-batched CSS
		// flush (see css.js) instead of interleaving with it. Pass a minimal deadline
		// object to keep the requestIdleCallback contract for callbacks that read it.
		setTimeout(function () {
			callback({
				didTimeout		: false,
				timeRemaining	: function () { return 50 }
			})
		}, 1)
	}
}//end dd_request_idle_callback



/**
* YIELD_TO_MAIN
* Yield control back to the browser's main thread inside a long-running async task.
*
* Breaks up long-running work into smaller chunks so the browser can process user
* input and paint frames between chunks, keeping the UI responsive. Call with
* `await yield_to_main()` at natural breakpoints in loops or sequential operations.
*
* Uses the Prioritized Task Scheduling API (scheduler.yield) when available
* (Chromium 115+). Falls back to a zero-timeout Promise on Safari and Firefox,
* which achieves the same task-queue handoff at the cost of true priority hints.
*
* (!) This function is module-private. It is not exported because callers should
* await it inline; there is no need to pass it as a reference.
*
* @see https://developer.mozilla.org/en-US/docs/Web/API/Scheduler/yield#browser_compatibility
* @see https://web.dev/articles/optimize-long-tasks?utm_source=devtools
* @returns {Promise<void>} Resolves after the browser has had a chance to run
*   other queued tasks.
*/
function yield_to_main () {
	if (globalThis.scheduler?.yield) {
		return scheduler.yield()
	}

	// Fall back to yielding with setTimeout.
	return new Promise(resolve => {
		setTimeout(resolve, 0);
	})
}//end yield_to_main



/**
* SET_TOOL_EVENT
* Bind a keyboard (or other DOM) shortcut defined in a tool's configuration to
* its toolbar button, so the user can trigger the tool without clicking.
*
* The binding is declared in the tool's ontology JSON under a `tool_event` key:
*
*   {
*     "type": "keyup",
*     "validate": [
*       { "key": "ctrlKey", "value": true },
*       { "key": "key",     "value": "s"  }
*     ],
*     "action": "click"
*   }
*
* Each entry in `validate` checks that a named property on the KeyboardEvent (or
* other event type) matches the expected value. All conditions must pass for the
* action to fire. This makes multi-modifier shortcuts (Ctrl+Shift+S, etc.) easy
* to express without bespoke code per tool.
*
* The handler registers itself on the document and performs a self-cleanup check
* on every invocation: if tool_button is no longer connected to the DOM (e.g. the
* tool panel was closed), the listener is removed automatically, preventing leaks.
*
* Currently the only supported `action` is 'click', which programmatically clicks
* the button element. Unknown actions emit a console warning.
*
* @param {Object} options - Configuration object with the following shape:
*   @param {Object}      options.tool_event  - Event descriptor (type, validate, action).
*   @param {HTMLElement} options.tool_button  - The toolbar button to click on match.
* @returns {boolean} Always true after the document listener has been attached.
*/
export const set_tool_event = function (options) {

	// options
		const tool_event	= options.tool_event
		const tool_button	= options.tool_button

	// tool_event
		// tool_event sample:
		// {
		//   "type": "keyup",
		//   "validate": [
		// 	{
		// 	  "key": "ctrlKey",
		// 	  "value": true
		// 	},
		// 	{
		// 	  "key": "key",
		// 	  "value": "s"
		// 	}
		//   ]
		// }
		const type		= tool_event.type // as keyup
		const validate	= tool_event.validate || [] // array o validations
		const action	= tool_event.action

	// event_handler
		const event_handler = (e) => {
			e.preventDefault()

			// if button is not connected to the DOM, remove the event
			if (!tool_button.isConnected) {
				document.removeEventListener(type, event_handler)
				return
			}

			// validations
			const validate_length = validate.length
			for (let i = 0; i < validate_length; i++) {
				const item = validate[i]
				if (e[item.key]!==item.value) {
					// stop here
					return
				}
			}

			switch (action) {

				case 'click':
					tool_button.click()
					break;

				default:
					console.warn('Undefined action. options:', options);
					break;
			}
		}

	// listener
	document.addEventListener(type, event_handler)


	return true
}//end set_tool_event



// @license-end
