// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert */
/*eslint no-undef: "error"*/
'use strict';

/**
 * TEST_TOOL_TOOL_PDF_EXTRACTOR
 * Client-side coverage for the PDF content extractor tool.
 *
 * The tool's deeper render/open path needs a host component_pdf caller, a target
 * text-area component and the XPDF-backed server action (get_pdf_data), none of
 * which is guaranteed in the headless harness. This suite therefore asserts the
 * reliable, fixture-free contract that every tool shares:
 *   - the module exports a constructor named exactly as its model,
 *   - construction seeds the documented instance properties,
 *   - the prototype is wired with the common + tool-specific lifecycle methods.
 *
 * This is the locked client template (layer 1: module-load + construct + wiring).
 */

import {tool_pdf_extractor} from '../../../tools/tool_pdf_extractor/js/tool_pdf_extractor.js'



describe('TOOL_PDF_EXTRACTOR CLIENT TEST', function() {

	this.timeout(10000)

	it('module exports the tool constructor', function() {
		assert.equal(typeof tool_pdf_extractor, 'function', 'expected tool_pdf_extractor to be a constructor function')
	})

	it('construct seeds the documented instance properties', function() {
		const instance = new tool_pdf_extractor()

		assert.equal(typeof instance, 'object', 'expected instance to be an object')
		// documented null-seeded common + tool-specific properties
		assert.equal(instance.id, null, 'expected id null')
		assert.equal(instance.model, null, 'expected model null')
		assert.equal(instance.mode, null, 'expected mode null')
		assert.equal(instance.node, null, 'expected node null')
		assert.equal(instance.ar_instances, null, 'expected ar_instances null')
		assert.equal(instance.status, null, 'expected status null')
		assert.equal(instance.events_tokens, null, 'expected events_tokens null')
		assert.equal(instance.type, null, 'expected type null')
		assert.equal(instance.caller, null, 'expected caller null')
	})

	it('prototype is wired with the lifecycle methods', function() {
		// common lifecycle delegated from tool_common / common
		assert.equal(typeof tool_pdf_extractor.prototype.render, 'function', 'expected render wired')
		assert.equal(typeof tool_pdf_extractor.prototype.destroy, 'function', 'expected destroy wired')
		assert.equal(typeof tool_pdf_extractor.prototype.refresh, 'function', 'expected refresh wired')
		// render mode delegated to render_tool_pdf_extractor
		assert.equal(typeof tool_pdf_extractor.prototype.edit, 'function', 'expected edit wired')
		// tool-specific overrides defined on the module
		assert.equal(typeof tool_pdf_extractor.prototype.init, 'function', 'expected init defined')
		assert.equal(typeof tool_pdf_extractor.prototype.build, 'function', 'expected build defined')
		assert.equal(typeof tool_pdf_extractor.prototype.get_pdf_data, 'function', 'expected get_pdf_data defined')
		assert.equal(typeof tool_pdf_extractor.prototype.process_pdf_data, 'function', 'expected process_pdf_data defined')
	})

})

// @license-end
