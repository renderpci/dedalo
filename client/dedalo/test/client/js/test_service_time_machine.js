// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert */
/*eslint no-undef: "error"*/
'use strict';

import {data_manager} from '../../../core/common/js/data_manager.js'
import {service_time_machine} from '../../../core/services/service_time_machine/js/service_time_machine.js'



describe("SERVICE_TIME_MACHINE", function() {

	this.timeout(30000)



	// minimal instance usable by get_total() without a full init
	const make_min_instance = () => {
		const self = new service_time_machine()
		self.model			= 'service_time_machine'
		self.tipo			= 'dd15'
		self.section_tipo	= 'dd15'
		self.section_id		= null
		self.mode			= 'list'
		self.type			= 'tm'
		self.view			= 'default'
		self.lang			= 'lg-eng'
		self.data_source	= 'tm'
		self.rqo			= { sqo: { limit: 10, offset: 0 } }
		return self
	}



	// ───────────────────────────────────────────────────────────
	// HIGH #1 — get_total must not get stuck in 'resolving' on a count error
	// (otherwise all future callers busy-poll forever and the paginator hangs).
	// ───────────────────────────────────────────────────────────

	describe("get_total recovers from a count-API error", function() {

		it("does not stay locked in 'resolving' and a later count succeeds", async function() {

			const self = make_min_instance()

			const real_request = data_manager.request
			try {
				// 1) simulate a failed count
				data_manager.request = async () => ({ result: false })
				const r1 = await self.get_total()

				assert.equal(r1, undefined, 'count error returns undefined')
				assert.notEqual(self.loading_total_status, 'resolving',
					'must not stay locked in "resolving" after a count error')

				// 2) a subsequent count must now succeed (not poll forever)
				data_manager.request = async () => ({ result: { total: 7 } })
				const r2 = await self.get_total()

				assert.equal(r2, 7, 'a later count succeeds after a prior error')
			} finally {
				data_manager.request = real_request
			}
		})
	})//end describe get_total recovery



	// ───────────────────────────────────────────────────────────
	// MEDIUM #2/#3 — build() must fail gracefully (no throw) when the API
	// response has no context, and must not leave the instance stuck in 'building'.
	// ───────────────────────────────────────────────────────────

	describe("build handles a context-less API response", function() {

		it("returns false and resets status instead of throwing", async function() {

			const self = new service_time_machine()
			await self.init({
				model			: 'dd_grid',
				section_tipo	: 'test3',
				section_id		: 1,
				lang			: 'lg-eng',
				caller			: { caller: { tipo: 'test3' } },
				config			: { model: 'dd_grid', tipo: 'dd15', section_tipo: 'test3', section_id: 1, lang: 'lg-eng' }
			})

			const real_request = data_manager.request
			try {
				// result present but no context array
				data_manager.request = async () => ({ result: { data: [] } })

				const ok = await self.build(true)

				assert.equal(ok, false, 'build must return false on a context-less response')
				assert.notEqual(self.status, 'building', 'status must not be left stuck in "building"')
			} finally {
				data_manager.request = real_request
			}
		})
	})//end describe build context guard

})//end describe SERVICE_TIME_MACHINE



// @license-end
