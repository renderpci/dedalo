// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert */
/*eslint no-undef: "error"*/
'use strict';



import {when_in_dom} from '../../../core/common/js/events.js'



// vars
	// wait_for_delivery
	// MutationObserver callbacks are delivered as a MICROTASK after the mutation.
	// A single awaited macrotask (setTimeout 0) is guaranteed to run after every
	// microtask queued by the preceding DOM mutation, so this is deterministic —
	// not an arbitrary sleep.
	const wait_for_delivery = () => new Promise(resolve => setTimeout(resolve, 0))

	// append + cleanup helpers. Every appended node MUST be removed: a leaked
	// pending entry keeps the shared module-level observer connected and could
	// perturb a later test card.
	const appended_nodes = []
	const append_to_body = (node) => {
		document.body.appendChild(node)
		appended_nodes.push(node)
		return node
	}
	const cleanup = () => {
		while (appended_nodes.length) {
			const node = appended_nodes.pop()
			if (node.parentNode) {
				node.parentNode.removeChild(node)
			}
		}
	}



describe(`EVENTS when_in_dom`, () => {

	// fast path: node already in DOM fires synchronously and forwards the return value
	it(`already-in-DOM node fires synchronously and forwards the return value`, async () => {

		const node = append_to_body(document.createElement('div'))

		let fired = false
		const result = when_in_dom(node, () => {
			fired = true
			return 'sync_return_value'
		})

		// asserts (BEFORE any await: the fast path must be synchronous)
		assert.equal(fired, true, 'callback must have fired before the next statement')
		assert.equal(result, 'sync_return_value', 'callback return value must be forwarded')

		cleanup()
	});

	// deferred path: fires after insertion, exactly once
	it(`detached node fires after insertion, exactly once`, async () => {

		const node = document.createElement('div')

		let count = 0
		const result = when_in_dom(node, () => {
			count++
		})

		// asserts
		assert.equal(result, undefined, 'deferred registration must return undefined')
		assert.equal(count, 0, 'callback must not fire while the node is detached')

		// insert and await observer delivery
		append_to_body(node)
		await wait_for_delivery()
		assert.equal(count, 1, 'callback must fire once after insertion')

		// further DOM mutations must NOT re-fire the entry
		append_to_body(document.createElement('span'))
		await wait_for_delivery()
		assert.equal(count, 1, 'callback must fire exactly ONCE despite further mutations')

		cleanup()
	});

	// same node, two registrations: both fire, each once
	it(`two registrations on the same node both fire, each exactly once`, async () => {

		const node = document.createElement('div')

		let count_a = 0
		let count_b = 0
		when_in_dom(node, () => { count_a++ })
		when_in_dom(node, () => { count_b++ })

		append_to_body(node)
		await wait_for_delivery()

		// asserts
		assert.equal(count_a, 1, 'first callback must fire exactly once')
		assert.equal(count_b, 1, 'second callback must fire exactly once')

		// extra mutation: neither re-fires
		append_to_body(document.createElement('span'))
		await wait_for_delivery()
		assert.equal(count_a, 1, 'first callback must not re-fire')
		assert.equal(count_b, 1, 'second callback must not re-fire')

		cleanup()
	});

	// drain then re-arm: the disconnect/re-connect lifecycle
	it(`a fresh registration after the registry drains still fires (re-arm)`, async () => {

		// first cycle: register, insert, drain the registry (observer disconnects)
		const node_1 = document.createElement('div')
		let count_1 = 0
		when_in_dom(node_1, () => { count_1++ })
		append_to_body(node_1)
		await wait_for_delivery()
		assert.equal(count_1, 1, 'first cycle callback must have fired (registry drained)')

		// second cycle: a LATER registration on a new detached node must re-connect
		const node_2 = document.createElement('div')
		let count_2 = 0
		when_in_dom(node_2, () => { count_2++ })
		append_to_body(node_2)
		await wait_for_delivery()

		// asserts
		assert.equal(count_2, 1, 'post-drain registration must fire when its node is inserted')

		cleanup()
	});

	// fault isolation: a throwing callback must not block the others
	it(`a throwing deferred callback does not block other pending callbacks`, async () => {

		// (!) The thrown error is logged by events.js via console.error — that log
		// line in the run output is EXPECTED, not a failure of this card.
		const node_bad = document.createElement('div')
		const node_good = document.createElement('div')

		let bad_fired = false
		let sibling_fired = false
		let good_fired = false

		when_in_dom(node_bad, () => {
			bad_fired = true
			throw new Error('intentional when_in_dom test error (expected in console)')
		})
		// second callback on the SAME node, after the thrower
		when_in_dom(node_bad, () => { sibling_fired = true })
		// callback on a different pending node
		when_in_dom(node_good, () => { good_fired = true })

		append_to_body(node_bad)
		append_to_body(node_good)
		await wait_for_delivery()

		// asserts
		assert.equal(bad_fired, true, 'throwing callback must have run')
		assert.equal(sibling_fired, true, 'callback after the thrower on the same node must still fire')
		assert.equal(good_fired, true, 'callback on another pending node must still fire')

		cleanup()
	});

	// re-entrancy: a deferred callback registering another when_in_dom
	it(`a deferred callback registering a second detached node does not lose it`, async () => {

		const node_1 = document.createElement('div')
		const node_2 = document.createElement('div')

		let count_2 = 0
		when_in_dom(node_1, () => {
			// re-entrant registration on a node that is STILL detached
			when_in_dom(node_2, () => { count_2++ })
		})

		append_to_body(node_1)
		await wait_for_delivery()
		assert.equal(count_2, 0, 'second node callback must not fire while detached')

		// now insert the second node: the re-entrant registration must survive
		append_to_body(node_2)
		await wait_for_delivery()

		// asserts
		assert.equal(count_2, 1, 're-entrant registration must fire when its node is inserted')

		cleanup()
	});

});//end describe(`EVENTS when_in_dom`



// @license-end
