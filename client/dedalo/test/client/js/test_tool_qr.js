// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, before, after, assert */
/*eslint no-undef: "error"*/
'use strict';

/**
 * TEST_TOOL_QR
 * Client-side coverage for the QR label-sheet tool.
 *
 * Two layers:
 *   1. The locked tool template: module export + constructor seed + prototype wiring.
 *   2. THE RECORD-LIST CONTRACT, against the suite server's real test3 section.
 *      tool_qr reads the section's record list off the built section's data
 *      item. The server names it `entries`. The tool used to read the retired
 *      `value` key, so it always counted 0 records: the sheet held no tiles and
 *      the truncation guard reported "Limit = 0 / <total>" for every
 *      selection. This layer drives the real load_section → render path over
 *      the wire, so a key drift on either side turns it red.
 *
 * load_section needs only the caller identity and tool_config.ddo_map (the
 * button_trigger's config), so no ontology button is materialized: the ddo_map
 * is the tool_config a button would carry, with test52 (input_text) as label.
 */

import {tool_qr} from '../../../tools/tool_qr/js/tool_qr.js'
import {section_tipo} from './elements.js'



describe('TOOL_QR CLIENT TEST', function() {

	this.timeout(30000)

	it('module exports the tool constructor', function() {
		assert.equal(typeof tool_qr, 'function', 'expected tool_qr to be a constructor function')
	})

	it('construct seeds the documented instance properties', function() {
		const instance = new tool_qr()

		assert.equal(typeof instance, 'object', 'expected instance to be an object')
		assert.equal(instance.id, null, 'expected id null')
		assert.equal(instance.model, null, 'expected model null')
		assert.equal(instance.mode, null, 'expected mode null')
		assert.equal(instance.node, null, 'expected node null')
		assert.equal(instance.caller, null, 'expected caller null')
		assert.equal(instance.section, null, 'expected section null')
		assert.equal(instance.qr_canvas, null, 'expected qr_canvas null')
	})

	it('prototype is wired with the lifecycle methods', function() {
		assert.equal(typeof tool_qr.prototype.render, 'function', 'expected render wired')
		assert.equal(typeof tool_qr.prototype.destroy, 'function', 'expected destroy wired')
		assert.equal(typeof tool_qr.prototype.refresh, 'function', 'expected refresh wired')
		assert.equal(typeof tool_qr.prototype.edit, 'function', 'expected edit wired')
		assert.equal(typeof tool_qr.prototype.init, 'function', 'expected init defined')
		assert.equal(typeof tool_qr.prototype.build, 'function', 'expected build defined')
		assert.equal(typeof tool_qr.prototype.load_section, 'function', 'expected load_section defined')
	})

	describe('record list contract (test3, real server)', function() {

		// a tool instance carrying exactly what load_section/edit read
		const self = new tool_qr()
		self.model			= 'tool_qr'
		self.section_tipo	= section_tipo
		self.caller			= {
			tipo			: section_tipo,
			section_tipo	: section_tipo,
			model			: 'section',
			lang			: 'lg-eng'
		}
		self.tool_config	= {
			ddo_map : [{
				typo			: 'ddo',
				tipo			: 'test52',
				section_tipo	: section_tipo,
				parent			: section_tipo,
				model			: 'component_input_text',
				mode			: 'list',
				view			: 'line',
				role			: 'label'
			}]
		}

		before(async function() {
			// the UMD bundle binds QRCode on globalThis, as tool_qr.init does
			await import('/dedalo/lib/qrcode/dist/easy.qrcode.min.js')
			self.section = await self.load_section()
		})

		after(async function() {
			if (self.section && typeof self.section.destroy==='function') {
				await self.section.destroy(true, true, true)
			}
		})

		it('load_section counts the records it fetched', function() {
			const entries = self.section?.data?.entries
			assert.isTrue(Array.isArray(entries), 'expected the section data item to carry an entries array')
			assert.isAbove(entries.length, 0, 'expected test3 to hold records (is the suite DB reseeded?)')
			assert.equal(self.section.total, entries.length,
				'expected the server total to equal the fetched rows (test3 is far below the page ceiling)')
			assert.isFalse(self.section.truncated,
				'expected no truncation: a "Limit = 0 / N" sheet means the record list was read under the wrong key')
		})

		it('renders one QR tile per record and no truncation notice', async function() {
			const content_data = await self.edit({render_level : 'content'})
			const entries = self.section.data.entries

			const tiles = content_data.querySelectorAll('.qr_canvas > .qr_wrapper')
			assert.equal(tiles.length, entries.length, 'expected one .qr_wrapper per record')

			const ids = [...content_data.querySelectorAll('.qr_section_id')].map(el => String(el.textContent))
			assert.deepEqual(ids, entries.map(el => String(el.section_id)),
				'expected tiles in record order, labelled with their section_id')

			assert.isNull(content_data.querySelector('.qr_truncated'), 'expected no truncation notice')
		})
	})

})

// @license-end
