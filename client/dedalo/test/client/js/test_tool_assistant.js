// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert */
/*eslint no-undef: "error"*/
'use strict';

/**
 * TEST_TOOL_ASSISTANT
 * Client-side coverage for the AI Assistant tool.
 *
 * The tool's deeper render/open path needs a host section, the tool context
 * API and a live dd_mcp_api (agent_models capabilities), none of which are
 * guaranteed in the headless harness. This suite therefore asserts the
 * reliable, fixture-free contract that every tool shares:
 *   - the module exports a constructor named exactly as its model,
 *   - construction seeds the documented instance properties,
 *   - the prototype is wired with the common + tool-specific lifecycle methods,
 * plus the WC-013 module surface: the server-driven controller
 * (assistant_controller) and the SSE wire client (agent_stream) exist with
 * their documented exports (the in-browser engine modules are GONE).
 *
 * This is the locked client template (layer 1: module-load + construct + wiring).
 */

import {tool_assistant} from '../../../tools/tool_assistant/js/tool_assistant.js'



describe('TOOL_ASSISTANT CLIENT TEST', function() {

	this.timeout(10000)

	it('module exports the tool constructor', function() {
		assert.equal(typeof tool_assistant, 'function', 'expected tool_assistant to be a constructor function')
	})

	it('construct seeds the documented instance properties', function() {
		const instance = new tool_assistant()

		assert.equal(typeof instance, 'object', 'expected instance to be an object')
		// documented null-seeded common properties
		assert.equal(instance.id, null, 'expected id null')
		assert.equal(instance.model, null, 'expected model null')
		assert.equal(instance.mode, null, 'expected mode null')
		assert.equal(instance.node, null, 'expected node null')
		assert.equal(instance.ar_instances, null, 'expected ar_instances null')
		assert.equal(instance.status, null, 'expected status null')
		assert.equal(instance.type, null, 'expected type null')
		assert.equal(instance.caller, null, 'expected caller null')
		// events_tokens seeded as an empty array (cleanup token registry)
		assert.equal(Array.isArray(instance.events_tokens), true, 'expected events_tokens array')
	})

	it('prototype is wired with the lifecycle methods', function() {
		// common lifecycle delegated from tool_common / common
		assert.equal(typeof tool_assistant.prototype.render, 'function', 'expected render wired')
		assert.equal(typeof tool_assistant.prototype.destroy, 'function', 'expected destroy wired')
		assert.equal(typeof tool_assistant.prototype.refresh, 'function', 'expected refresh wired')
		// render mode delegated to render_tool_assistant
		assert.equal(typeof tool_assistant.prototype.edit, 'function', 'expected edit wired')
		// tool-specific overrides defined on the module
		assert.equal(typeof tool_assistant.prototype.init, 'function', 'expected init defined')
		assert.equal(typeof tool_assistant.prototype.build, 'function', 'expected build defined')
	})

	it('WC-013 module surface: server-driven controller + SSE wire client', async function() {
		const controller_module = await import('../../../tools/tool_assistant/js/assistant_controller.js')
		assert.equal(typeof controller_module.assistant_controller, 'function', 'expected assistant_controller constructor')
		assert.equal(typeof controller_module.assistant_controller.prototype.build_chat_ui, 'function', 'expected build_chat_ui')
		assert.equal(typeof controller_module.assistant_controller.prototype.destroy, 'function', 'expected destroy')

		const stream_module = await import('../../../tools/tool_assistant/js/agent_stream.js')
		assert.equal(typeof stream_module.agent_stream, 'function', 'expected agent_stream function')
	})

})

// @license-end
