// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert */
/*eslint no-undef: "error"*/
'use strict';

/**
 * TEST_TOOL_SITEBUILDER
 * THE STREAM DOOR, CLIENT HALF (WIRE-MAP, WC-2026-10-11-site-builder-turn-error-frames).
 *
 * A turn's relayed error record carries the ONE converter's body (`body.error`: code, label_key,
 * message, retryable) and no daemon prose; `render_event('error')` renders the code's text
 * (`error_text(body.error)`) — never `body.message`, which the relayed frames no longer carry
 * (a revert prints "✖ undefined" for every turn error). An agent that exited non-zero adds its
 * own words (`agent_output`) as their own `sb_agent_output` line, never as the error.
 *
 * The controller is driven on a bare chat log: render_event and append_line need nothing else.
 */

import {sitebuilder_controller} from '../../../tools/tool_sitebuilder/js/sitebuilder_controller.js'
import {error_text} from '../../../core/common/js/render_api_error.js'



describe('TOOL_SITEBUILDER CLIENT TEST', function() {

	/** A controller over a detached chat log, and the lines it rendered. */
	const controller = () => {
		const self		= Object.create(sitebuilder_controller.prototype)
		self.chat_log	= document.createElement('div')
		const lines		= () => [...self.chat_log.children].map(node => ({
			cls		: [...node.classList].filter(name => name!=='sb_line').join(' '),
			text	: node.textContent
		}))
		return {self, lines}
	}

	/** The converter's body as the relay sends it (toErrorBody's keys). */
	const converted = (code) => ({
		code,
		category	: 'unavailable',
		label_key	: code.replace('.', '_'),
		message		: 'ZZ the registry message of ' + code,
		retryable	: true
	})

	it('render_event is wired on the controller prototype', function() {
		assert.equal(typeof sitebuilder_controller.prototype.render_event, 'function')
	})

	it('an error record renders error_text(body.error) — the code’s text, never body.message', function() {
		const {self, lines} = controller()
		const error = converted('site_builder.turn_timeout')
		self.render_event({type: 'error', error})
		const rendered = lines()
		assert.deepEqual(rendered, [{cls: 'sb_error', text: '✖ ' + error_text(error)}])
		assert.notInclude(rendered[0].text, 'undefined', 'the relayed frame carries no message: a body.message read prints undefined')
		assert.isAbove(error_text(error).length, 0)
	})

	it('a daemon message that rides along is never what renders (the code is the message)', function() {
		const {self, lines} = controller()
		const error = converted('site_builder.failed')
		self.render_event({type: 'error', error, message: 'ZZ_DAEMON_PROSE_c41 /srv/secret'})
		assert.notInclude(lines()[0].text, 'ZZ_DAEMON_PROSE')
	})

	it('agent_output renders as its OWN sb_agent_output line; an error without it renders one line', function() {
		const {self, lines} = controller()
		const error = converted('site_builder.agent_failed')
		self.render_event({type: 'error', error, agent_output: 'ZZ the agent said this on stderr'})
		assert.deepEqual(lines(), [
			{cls: 'sb_error', text: '✖ ' + error_text(error)},
			{cls: 'sb_agent_output', text: 'ZZ the agent said this on stderr'}
		])
		const bare = controller()
		bare.self.render_event({type: 'error', error})
		assert.equal(bare.lines().length, 1)
	})
})

// @license-end
