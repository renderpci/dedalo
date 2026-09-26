// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert, page_globals */
/*eslint no-undef: "error"*/

import {
	elements
} from './elements.js'
import {get_instance} from '../../../core/common/js/instances.js'
import {ui} from '../../../core/common/js/ui.js'
import {pause} from '../../../core/common/js/utils/util.js'



// SAVE SETTLE — why every case waits for the save its own deactivate launched.
// ui.component.deactivate() saves pending changed_data FIRE-AND-FORGET: it calls
// component.change_value() without awaiting it (deliberate — a curator leaving a
// field must not block on the network). This suite sets changed_data on every
// component and then deactivates it, so each it() used to END with its save
// still in flight, and the NEXT it() paid for it: measured on the suite server,
// component_check_box's module GETs and its get_data were held until
// component_av's save answered (the whole check_box case lasted exactly as long
// as that save), and the same bleed shows after security_access (→ select) and
// select_lang (→ svg). On a loaded hosted runner a slow save landed inside the
// following case's 5000 ms budget: 'component_check_box. Activation — Timeout of
// 5000ms exceeded' (gh run 35843092386, instance tier), a red charged to a
// component that did nothing wrong. The server log of that run shows a test3/1
// save fired by this suite (select_lang, test89) taking 10.3 s.
//
// The real condition is polled, bounded: change_value() raises `changing`
// synchronously, before its first await, and clears it in its `finally`; save()
// holds `saving` for the request. Both false = the save settled (or was never
// started: test_save:false, save_on_deactivate:false, a no-change skip). A save
// that never settles is still a failure — named, with the component — just no
// longer someone else's. Same shape as test_additional_text_area's editor wait.
const SAVE_SETTLE_MS = 8000

const wait_for_save_settled = async function(instance, max_ms = SAVE_SETTLE_MS) {
	const started = Date.now()
	while (Date.now() - started < max_ms) {
		if (instance.changing!==true && instance.saving!==true) {
			return Date.now() - started
		}
		await pause(25)
	}
	throw new Error(`${instance.model} (${instance.tipo}) save launched by deactivate did not settle after ${max_ms} ms (changing: ${instance.changing}, saving: ${instance.saving})`)
}


describe("COMPONENTS ACTIVATE", async function() {

	this.timeout(5000);

	const container = document.getElementById('content');
	container.addEventListener('click', function(e) {
		e.preventDefault()

	})

	for (let i = 0; i < elements.length; i++) {

		// if (i!=0) continue

		const element = elements[i]
			  element.mode = 'edit'
			  element.view = 'default'

		describe(`component: ${element.model} ${element.mode} ${element.view} :`,  function() {

			// const component_instance = await get_instance(element)
			// await component_instance.build(true)
			// const node = await component_instance.render()
			// console.log('node:', node);

			// TEST activation
				it(`${element.model}. Activation`, async function() {

					const options = {
						id_variant		: Math.random() + '-' + Math.random(),
						lang			: element.lang,
						model			: element.model,
						section_id		: element.section_id,
						section_tipo	: element.section_tipo,
						tipo			: element.tipo,
						mode			: 'edit',
						view			: 'default'
					}

					const instance = await get_instance_rendered(options)

					// pointer content_data
					assert( instance.node, `wrapper DOES NOT exists`)

					// pointer content_data
					assert( instance.node.content_data, `wrapper pointer to content_data DOES NOT exists`)

					// pointer content_value
					// assert( instance.node.content_data[0], `wrapper pointer to content_data DOES NOT exists`)

					// check selection
					const wrapper = instance.node

					// activate by click event
					// wrapper.click()
					wrapper.dispatchEvent(new Event('mousedown'));
					assert( wrapper.classList.contains('active'), `wrapper activated styles are NOT found`)
					assert( instance.active===true, `instance property active is NOT set as true`)
					assert( page_globals.component_active===instance, `page_globals.component_active is NOT set correctly`)
					container.prepend(wrapper)

					// skip save compare test on some components like password
					if (element.test_save===false) {

						console.log(`* Skip non test save element ${elements[i].model}:`, elements[i]);

					}else{
						// console.log('instance.data:', instance.data);
						// const entries = instance.data.entries
						// 	? instance.data.entries[0]
						// 	: null
						// console.log(`${element.model} entries:`, entries);

						// new_value. Calculated as random proper data for current component
						const new_value = element.new_value(element.new_value_params)
						// console.log(`${element.model} new_value:`, new_value);

						// change data
							const changed_data_item = Object.freeze({
								action	: 'update',
								key		: 0,
								value	: (Array.isArray(new_value) ? new_value[0] : new_value)
							})

						// fix instance changed_data
							instance.set_changed_data(changed_data_item)

						// console.log('instance.data.changed_data:', instance.data.changed_data);
					}

					// deactivate current component
					await ui.component.deactivate(page_globals.component_active)
					assert( !wrapper.classList.contains('active'), `wrapper activated styles are NOT removed`)
					assert( instance.active===false, `instance property active is NOT set as false`)
					assert( page_globals.component_active===null, `page_globals.component_active is NOT reset (expected null)`)

					// the save deactivate launched belongs to THIS case (see SAVE
					// SETTLE above). It gets its own window: mocha's timer is
					// re-armed from now, so activation keeps its 5000 ms and the
					// save phase is bounded by SAVE_SETTLE_MS — the poll throws its
					// named error first, the extra second is only the margin.
					this.timeout(SAVE_SETTLE_MS + 1000)
					await wait_for_save_settled(instance)
				});

		})//end describe(element.model, function() {

	}//end for (let i = 0; i < elements.length; i++)
});


async function get_instance_rendered(options) {

	const component_instance =  await get_instance(options)
	await component_instance.build(true)
	await component_instance.render()
	// console.log('node:', node);

	return component_instance
}



// @license-end
