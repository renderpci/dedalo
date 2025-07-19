// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert */
/*eslint no-undef: "error"*/
'use strict';



import {event_manager} from '../../common/js/event_manager.js'



// vars
	const callback = (e) => {
		console.log('callback e:', e);
		return 1;
	}
	const callback_b = (data) => {
		console.log('callback_b data:', data);
		return data;
	}



describe(`EVENT_MANAGER`, async () => {

	// event_manager
	it(`event_manager`, async function() {

		assert.equal(typeof event_manager, 'object', 'event_manager must be object');
		assert.deepEqual(window.event_manager, event_manager, 'token must be the same');

		const module = await import('../../common/js/event_manager.js');
		[
			'subscribe',
			'unsubscribe',
			'publish',
			'get_events',
			'event_exists'
		].map((el)=>{
			assert.equal(typeof module.event_manager[el], 'function', 'el must be function');
		})
	})

	// subscribe
	it(`subscribe`, async function() {

		// token
			const token = event_manager.subscribe(
				'subscribe_test',
				callback
			)

			// asserts
			assert.equal(typeof token, 'string', 'token must be string');
			assert.equal(token, 'event_0', 'token must be event_0');

		// token_b
			const token_b = event_manager.subscribe(
				'subscribe_test',
				callback_b
			)

			// asserts
			assert.equal(token_b, 'event_1', 'token_b must be event_1');
	});

	// unsubscribe
	it(`unsubscribe`, async () => {

		// existing token case
		const result = event_manager.unsubscribe(
			'event_0'
		)

		// asserts
		assert.equal(result, true, 'result must be true');

		// non existing token case
		const result2 = event_manager.unsubscribe(
			'event_0'
		)

		// asserts
		assert.equal(result2, false, 'result2 must be false');
	});


	// get_events
	it(`get_events`, async () => {

		// get all events
			const all_events = event_manager.get_events()

			// asserts
			assert.equal(
				all_events.length,
				1,
				'all_events must be 1.  - Total: ' + all_events.length
			);

		// add one event
			const callback_e = (e) => {}
			const token = event_manager.subscribe(
				'subscribe_test',
				callback_e
			);
			// asserts
			assert.equal(
				event_manager.get_events().length,
				2,
				'all_events must be 2'
			);

		// remove one event
			event_manager.unsubscribe(token)

			// asserts
			assert.equal(all_events.length, 1, 'all_events must be 1')
	});

	// publish
	it(`publish`, async () => {

		// get all events
			const result = event_manager.publish(
				'subscribe_test',
				{
					data : 152
				}
			)

			// asserts
			assert.equal(result.length, 1, 'result must be 1')
			assert.deepEqual(result, [{data:152}], 'result must be [{data:152}]')

			const result2 = event_manager.publish(
				'subscribe_test',
				{
					data : 875
				}
			)

			// asserts
			assert.deepEqual(result2, [{data:875}], 'result2 must be [{data:875}]')
	});

	// event_exists
	it(`event_exists`, async () => {

		// non exiting event
			const result = event_manager.event_exists(
				'subscribe_test', // event_name
				callback
			)

			// asserts
			assert.equal(result, false, 'result must be false')

		// exiting event
			const result2 = event_manager.event_exists(
				'subscribe_test', // event_name
				callback_b
			)

			// asserts
			assert.equal(result2, true, 'result2 must be true')

		// non exiting event
			const new_callback = () => {}
			const result3 = event_manager.event_exists(
				'subscribe_test', // event_name
				new_callback
			)

			// asserts
			assert.equal(result3, false, 'result3 must be false')
	});

	// duplicate event
	it(`duplicate event`, async () => {

		const count1 = event_manager.get_events().length

		const token_c = event_manager.subscribe(
			'subscribe_test',
			callback_b // already used callback for 'subscribe_test'
		)

		const count2 = event_manager.get_events().length

		// asserts
		assert.equal(
			token_c,
			'event_3',
			'token_b must be event_3'
		);
		assert.equal( (count1 + 1), count2, 'same length');

	});

});//end describe(`COMPONENTS LIFE-CYCLE`



// @license-end
