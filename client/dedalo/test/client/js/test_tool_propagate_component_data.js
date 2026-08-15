// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert */
/*eslint no-undef: "error"*/
'use strict';

/**
 * TEST_TOOL_TOOL_PROPAGATE_COMPONENT_DATA
 * Client-side coverage for the propagate-component-data tool.
 *
 * The tool's deeper init/build/render path needs the temporal clone component
 * built via get_instance, which is not guaranteed in the headless harness. This
 * suite therefore asserts the reliable, fixture-free contract that every tool
 * shares:
 *   - the module exports a constructor named exactly as its model,
 *   - construction seeds the documented instance properties,
 *   - the prototype is wired with the common + tool-specific lifecycle methods.
 *
 * This is the locked client template (layer 1: module-load + construct + wiring).
 *
 * LAYER 2 (below): resolve_propagate_section — the section resolution — is a PURE
 * function over the caller chain, so it IS drivable here with synthetic
 * instances. That matters: the fixed-depth walk it replaced is the exact reason
 * this tool was unusable from a section list, and the old suite could not see it.
 */

import {tool_propagate_component_data} from '../../../tools/tool_propagate_component_data/js/tool_propagate_component_data.js'
import {resolve_propagate_section, ALLOWED_SECTION_MODES} from '../../../tools/tool_propagate_component_data/js/render_tool_propagate_component_data.js'



describe('TOOL_PROPAGATE_COMPONENT_DATA CLIENT TEST', function() {

	this.timeout(10000)

	it('module exports the tool constructor', function() {
		assert.equal(typeof tool_propagate_component_data, 'function', 'expected tool_propagate_component_data to be a constructor function')
	})

	it('construct seeds the documented instance properties', function() {
		const instance = new tool_propagate_component_data()

		assert.equal(typeof instance, 'object', 'expected instance to be an object')
		// documented null-seeded common + tool-specific properties
		assert.equal(instance.id, null, 'expected id null')
		assert.equal(instance.model, null, 'expected model null')
		assert.equal(instance.mode, null, 'expected mode null')
		assert.equal(instance.node, null, 'expected node null')
		assert.equal(instance.ar_instances, null, 'expected ar_instances null')
		assert.equal(instance.events_tokens, null, 'expected events_tokens null')
		assert.equal(instance.status, null, 'expected status null')
		assert.equal(instance.main_element, null, 'expected main_element null')
		assert.equal(instance.caller, null, 'expected caller null')
		assert.equal(instance.component_list, null, 'expected component_list null')
	})

	it('prototype is wired with the lifecycle methods', function() {
		// common lifecycle delegated from tool_common / common
		assert.equal(typeof tool_propagate_component_data.prototype.render, 'function', 'expected render wired')
		assert.equal(typeof tool_propagate_component_data.prototype.destroy, 'function', 'expected destroy wired')
		assert.equal(typeof tool_propagate_component_data.prototype.refresh, 'function', 'expected refresh wired')
		// render mode delegated to render_tool_propagate_component_data
		assert.equal(typeof tool_propagate_component_data.prototype.edit, 'function', 'expected edit wired')
		// tool-specific overrides defined on the module
		assert.equal(typeof tool_propagate_component_data.prototype.init, 'function', 'expected init defined')
		assert.equal(typeof tool_propagate_component_data.prototype.build, 'function', 'expected build defined')
		assert.equal(typeof tool_propagate_component_data.prototype.get_component_to_propagate, 'function', 'expected get_component_to_propagate defined')
		assert.equal(typeof tool_propagate_component_data.prototype.propagate_component_data, 'function', 'expected propagate_component_data defined')
		assert.equal(typeof tool_propagate_component_data.prototype.on_close_actions, 'function', 'expected on_close_actions defined')
	})

})



describe('TOOL_PROPAGATE_COMPONENT_DATA — section resolution (layer 2)', function() {

	this.timeout(5000)

	// section ← (link) ← component ← tool
	const make = (section_overrides={}, link_model='section_group', component_overrides={}) => {
		const section = Object.assign({
			model	: 'section',
			tipo	: 'test3',
			mode	: 'edit',
			label	: 'Test section'
		}, section_overrides)
		const link = { model:link_model, caller:section }
		const component = Object.assign({
			model			: 'component_input_text',
			tipo			: 'test52',
			section_tipo	: 'test3',
			caller			: link
		}, component_overrides)
		return { section, tool:{ model:'tool_propagate_component_data', caller:component } }
	}

	it('resolves the section through a section_group (edit mode — no regression)', function() {
		const {section, tool} = make()
		assert.strictEqual(resolve_propagate_section(tool).section, section)
	})

	it('resolves the section through a section_record (list mode — the new capability)', function() {
		// The per-cell edit modal's chain. The old fixed-depth walk landed on the
		// section_record here and the tool refused to open.
		const {section, tool} = make({mode:'list'}, 'section_record')
		assert.strictEqual(resolve_propagate_section(tool).section, section)
	})

	it('REFUSES a section that does not own the component (the portal case)', function() {
		// A portal-embedded component reaches the OUTER section, whose sqo
		// describes a different record set — propagating against it would write
		// the wrong records.
		const {tool} = make({tipo:'test38'}, 'component_portal')
		const resolution = resolve_propagate_section(tool)
		assert.strictEqual(resolution.section, null)
		assert.ok(resolution.reason.length > 0, 'a refusal must carry a user-facing reason')
	})

	it('REFUSES a mode outside the allowlist (search)', function() {
		// 'tm' used to be the example here; the render mode is retired
		// (WC-2026-08-14-tm-ddo-mode-retired), so the case now uses a mode that
		// still exists but is still outside the propagate allowlist.
		const {tool} = make({mode:'search'})
		assert.strictEqual(resolve_propagate_section(tool).section, null)
	})

	it('accepts exactly edit and list', function() {
		assert.deepEqual(ALLOWED_SECTION_MODES.slice().sort(), ['edit','list'])
	})

	it('REFUSES (and RETURNS) on a circular caller chain', function() {
		// tool_common's new-window path sets caller.caller = self, so the chain is
		// genuinely circular. A hand-rolled walk would hang the tab; this must
		// return null AND return at all — the timeout above is the real assertion.
		const tool = { model:'tool_propagate_component_data' }
		const component = { model:'component_input_text', section_tipo:'test3', caller:tool }
		tool.caller = component
		assert.strictEqual(resolve_propagate_section(tool).section, null)
	})

	it('REFUSES when there is no caller at all', function() {
		assert.strictEqual(resolve_propagate_section({model:'tool_propagate_component_data'}).section, null)
	})
})

// @license-end
