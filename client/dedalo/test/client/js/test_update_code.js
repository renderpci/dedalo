// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert, page_globals */
/*eslint no-undef: "error"*/

/**
* TEST_UPDATE_CODE
* First area_maintenance browser suite: the update_code widget panel and the
* shared server picker's cross-widget contract.
*
* The regression this suite exists for (2026-08-23): `render_servers_list` used
* to publish `ontology_server_select_change` on EVERY radio change. update_code
* reuses that picker on the same dashboard as update_ontology, so selecting a
* CODE server reset the ontology widget's reference row while its own radio
* stayed checked. The picker now publishes NOTHING itself — selection travels
* through the caller's `on_change` callback, which only update_ontology's own
* caller wires to the event.
*
* Backend-free: fake `value.servers` descriptors (a reachable server is
* `response_code:200` + a result whose `data` is truthy), test-only
* localStorage keys (cleaned up), no widget get_value round-trip.
*/

import {ui} from '../../../core/common/js/ui.js'
import {event_manager} from '../../../core/common/js/event_manager.js'
import {render_servers_list} from '../../../core/area_maintenance/widgets/update_ontology/js/render_update_ontology.js'
import {update_code} from '../../../core/area_maintenance/widgets/update_code/js/update_code.js'
import {
	UPDATE_PHASES,
	init_phase_state,
	apply_phase_frame
} from '../../../core/area_maintenance/widgets/update_code/js/update_code_phases.js'



// DOM container
	const container = document.getElementById('content');

// fixtures
	const CODE_STORAGE_KEY		= 'dedalo.test.update_code.server'
	const ONTOLOGY_STORAGE_KEY	= 'dedalo.test.update_ontology.server'

	const build_server = (name, url) => {
		return {
			name			: name,
			url				: url,
			code			: 'test_code',
			response_code	: 200,
			result			: { data : true } // response_data(result) truthy → reachable
		}
	}



describe('UPDATE_CODE WIDGET', function() {

	this.timeout(10000);

	after(function() {
		// test-only storage keys never leak into the app's remembered choices
		try {
			localStorage.removeItem(CODE_STORAGE_KEY)
			localStorage.removeItem(ONTOLOGY_STORAGE_KEY)
		} catch (_error) { /* private mode */ }
	})


	describe('panel render', function() {

		it('renders the version readout and the server picker (no staging path, no beta toggle)', async function() {

			const self = new update_code()
			self.id				= 'test_update_code'
			self.value			= {
				servers				: [build_server('code server A', 'https://a.example.test/api')],
				is_a_code_server	: false
			}
			self.caller			= null
			self.events_tokens	= []

			const content_data = await self.list({ render_level : 'content' })
			container.appendChild(content_data)

			// version/build readout (shared widget kit)
			const readout = content_data.querySelector('.dd_readout')
			assert.ok(readout, 'the panel renders a dd_readout')
			assert.strictEqual(readout.querySelectorAll('.dd_row').length, 2, 'current version + current build rows')

			// the shared server picker markup
			assert.ok(content_data.querySelector('.server_picker'), 'the panel renders the shared server picker')
			assert.ok(content_data.querySelector('.server_picker input[type="radio"]'), 'the picker renders a radio row')

			// dead surfaces stay dead
			assert.strictEqual(content_data.querySelector('.beta_updates_container'), null, 'no beta toggle')
			assert.notInclude(content_data.textContent, 'dedalo_source_version_local_dir', 'no staging path line')

			content_data.remove()
		})
	})


	describe('server picker cross-widget contract', function() {

		it('selecting a CODE server publishes nothing and leaves a co-mounted ontology row alone', function() {

			let published = 0
			let last_payload
			const token = event_manager.subscribe('ontology_server_select_change', (payload) => {
				published++
				last_payload = payload
			})

			// the ontology widget's reference row stand-in: the subscriber the
			// bleed used to reset (set_server(null) on every foreign click)
			let reference_server = { name : 'kept' }
			const reference_token = event_manager.subscribe('ontology_server_select_change', () => {
				reference_server = null
			})

			try {
				// CODE picker: update_code passes NO on_change
				const code_servers = [build_server('code server', 'https://code.example.test/api')]
				const code_picker = render_servers_list({ servers : code_servers }, 'CODE_SERVERS', CODE_STORAGE_KEY)
				container.appendChild(code_picker)

				const code_radio = code_picker.querySelector('input[type="radio"]')
				code_radio.checked = true
				code_radio.dispatchEvent(new Event('change'))

				assert.strictEqual(published, 0, 'a CODE selection publishes no ontology event')
				assert.ok(reference_server, 'the ontology reference row is untouched by a CODE selection')
				assert.strictEqual(code_servers[0].active, true, 'the CODE picker still marks its own selection')

				// ontology-style picker: its caller's on_change publishes, as before
				const onto_servers = [build_server('master', 'https://master.example.test/api')]
				onto_servers[0].tld = ['test']
				const onto_picker = render_servers_list(
					{ servers : onto_servers },
					'ONTOLOGY_SERVERS',
					ONTOLOGY_STORAGE_KEY,
					(server) => {
						event_manager.publish('ontology_server_select_change', server ? (server.tld || null) : null)
					}
				)
				container.appendChild(onto_picker)

				const onto_radio = onto_picker.querySelector('input[type="radio"]')
				onto_radio.checked = true
				onto_radio.dispatchEvent(new Event('change'))

				assert.strictEqual(published, 1, 'an ONTOLOGY selection still publishes exactly once')
				assert.deepEqual(last_payload, ['test'], 'the payload is still the tld list')

				code_picker.remove()
				onto_picker.remove()
			} finally {
				event_manager.unsubscribe(token)
				event_manager.unsubscribe(reference_token)
			}
		})
	})


	describe('phase reducer (served module)', function() {

		it('a restart-phase interruption switches to health polling; a pre-swap one is indeterminate', function() {

			assert.strictEqual(UPDATE_PHASES[UPDATE_PHASES.length-1], 'health')

			let state = init_phase_state('9.9.9')
			state = apply_phase_frame(state, { phase : 'restart', phases : [{ id : 'swap', status : 'done' }, { id : 'restart', status : 'running' }] })
			state = apply_phase_frame(state, { interrupted : true })
			assert.strictEqual(state.mode, 'polling')

			// pre-swap the stream's death says nothing about the job: the server
			// side may still be running → 'interrupted', never 'failed'
			let dead = init_phase_state('9.9.9')
			dead = apply_phase_frame(dead, { phase : 'extract', phases : [{ id : 'extract', status : 'running' }] })
			dead = apply_phase_frame(dead, { interrupted : true })
			assert.strictEqual(dead.mode, 'interrupted')

			// only a frame that actually reports a failed phase says failed
			let failed = init_phase_state('9.9.9')
			failed = apply_phase_frame(failed, { phase : 'verify', phases : [{ id : 'verify', status : 'failed' }], message : 'checksum mismatch' })
			assert.strictEqual(failed.mode, 'failed')
		})
	})

	// keep the ui import honest (build_wrapper_edit path is exercised elsewhere)
	void ui
})



// @license-end
