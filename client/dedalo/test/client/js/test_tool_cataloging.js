// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert */
/*eslint no-undef: "error"*/
'use strict';

/**
 * TEST_TOOL_CATALOGING
 * Client-side coverage for the hierarchical cataloging tool.
 *
 * The tool's deeper render/open path needs a host section with a configured
 * section_to_cataloging ddo plus a live thesaurus area, none of which is
 * guaranteed in the headless harness. This suite therefore asserts the reliable,
 * fixture-free contract that every tool shares:
 *   - the module exports a constructor named exactly as its model,
 *   - construction seeds the documented instance properties,
 *   - the prototype is wired with the common + tool-specific lifecycle methods.
 *
 * This is the locked client template (layer 1: module-load + construct + wiring).
 */

import {tool_cataloging} from '../../../tools/tool_cataloging/js/tool_cataloging.js'



describe('TOOL_CATALOGING CLIENT TEST', function() {

	this.timeout(10000)

	it('module exports the tool constructor', function() {
		assert.equal(typeof tool_cataloging, 'function', 'expected tool_cataloging to be a constructor function')
	})

	it('construct seeds the documented instance properties', function() {
		const instance = new tool_cataloging()

		assert.equal(typeof instance, 'object', 'expected instance to be an object')
		// documented null-seeded common + tool-specific properties
		assert.equal(instance.id, null, 'expected id null')
		assert.equal(instance.model, null, 'expected model null')
		assert.equal(instance.mode, null, 'expected mode null')
		assert.equal(instance.node, null, 'expected node null')
		assert.equal(instance.ar_instances, null, 'expected ar_instances null')
		assert.equal(instance.status, null, 'expected status null')
		assert.equal(instance.type, null, 'expected type null')
		assert.equal(instance.source_lang, null, 'expected source_lang null')
		assert.equal(instance.target_lang, null, 'expected target_lang null')
		assert.equal(instance.langs, null, 'expected langs null')
		assert.equal(instance.caller, null, 'expected caller null')
		assert.equal(instance.section_to_cataloging, null, 'expected section_to_cataloging null')
		assert.equal(instance.area_thesaurus, null, 'expected area_thesaurus null')
	})

	it('prototype is wired with the lifecycle methods', function() {
		// common lifecycle delegated from tool_common / common
		assert.equal(typeof tool_cataloging.prototype.render, 'function', 'expected render wired')
		assert.equal(typeof tool_cataloging.prototype.destroy, 'function', 'expected destroy wired')
		assert.equal(typeof tool_cataloging.prototype.refresh, 'function', 'expected refresh wired')
		// render mode delegated to render_tool_cataloging
		assert.equal(typeof tool_cataloging.prototype.edit, 'function', 'expected edit wired')
		// tool-specific overrides defined on the module
		assert.equal(typeof tool_cataloging.prototype.init, 'function', 'expected init defined')
		assert.equal(typeof tool_cataloging.prototype.build, 'function', 'expected build defined')
		assert.equal(typeof tool_cataloging.prototype.load_section, 'function', 'expected load_section defined')
	})

})

// @license-end
