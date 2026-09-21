// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0

/**
* CARD STATE — the page-side verdict of ONE suite, as a pure module.
*
* index.js listens to the test iframe and, on its `test_end`, decides what the
* suite's sidebar card says: its dot (pass/fail), the mocha counts it parks on
* the card for the headless runner (`data-test-count`, `data-pending-count`),
* and the failure detail. That decision used to be inline in the message
* handler, where nothing could exercise it but a browser run — and a one-line
* change there (`pending_count = 0`) reopened the all-pending hole (GATE-12)
* with every static gate still green. So the decision lives HERE, with no DOM
* and no imports, and test/unit/client_gate_inventory_tripwire.test.ts drives
* it in bun over the exact messages the frame posts, straight through the
* runner's own scrape and verdict. index.js applies what this returns and
* decides nothing itself.
*
* The counts are what frame_runner.js measured (`runner.stats.tests`,
* `runner.stats.pending`). A frame that did not send them — a stale
* frame_runner.js in the browser cache — reads as zero, deliberately: a suite
* whose counts are unknown ran nothing that can be vouched for.
*/

/**
* card_state_from_message
* The state of a card after the frame posted `data` (a `test_end` or a
* `test_error`), or after a watchdog fired (`{type: 'watchdog', ms}`).
* @param {object} data the postMessage payload from frame_runner.js
* @returns {{status: 'pass'|'fail', test_count: number|null, pending_count: number|null, failures: Array<{title: string, message: string, stack: string}>}}
*/
export function card_state_from_message(data) {
	const type = data && data.type

	if (type === 'test_end') {
		const stats = data.stats || {}
		const fail_count = Number.isInteger(stats.fail) ? stats.fail : 0
		// A suite that RAN ZERO TESTS is red, not green: mocha reports
		// `failures === 0` for a file that imports cleanly and registers nothing
		// (an `async describe` whose awaits float, an `it` behind a false `if`) —
		// and ALSO for a file whose every test is pending (it.skip, a
		// callback-less it(), this.skip()), because mocha counts a pending test
		// inside `stats.tests`. Either card could never go red (GATE-12).
		const test_count = Number.isInteger(stats.tests) ? stats.tests : 0
		const pending_count = Number.isInteger(stats.pending) ? stats.pending : 0
		const ran_count = test_count - pending_count
		const status = (fail_count > 0 || ran_count <= 0) ? 'fail' : 'pass'
		const reported = Array.isArray(data.failures) ? data.failures : []
		// The frame COUNTS failures and REPORTS their detail separately, so the
		// two can disagree. If it counted failures and sent no detail, SAY THAT:
		// "the suite did not run to completion" would be a different diagnosis
		// and, here, a false one. The live way to reach this is a stale
		// frame_runner.js in the browser cache — the client is served without
		// Cache-Control and `?v=` cannot bust an ES-module import.
		let failures
		if (fail_count > 0 && reported.length === 0) {
			failures = [{
				title	: '(the frame counted ' + fail_count + ' failure(s) but sent no detail)',
				message	: 'stale frame_runner.js in the browser cache? hard-reload and re-run',
				stack	: ''
			}]
		} else if (test_count === 0) {
			failures = [{
				title	: '(registered zero tests)',
				message	: 'mocha ran no it() for this suite — an async describe whose awaits float, or a guarded registration; a suite that runs nothing cannot pass',
				stack	: ''
			}]
		} else if (ran_count <= 0) {
			failures = [{
				title	: '(ran zero tests, ' + pending_count + ' pending)',
				message	: 'every mocha test in this suite is pending (it.skip, a callback-less it(), this.skip()); a suite that runs nothing cannot pass',
				stack	: ''
			}]
		} else {
			failures = reported
		}
		return { status, test_count, pending_count, failures }
	}

	if (type === 'test_error') {
		// setup failure: mocha never ran, so there is no failing test — say so
		// explicitly rather than leave the card reasonless (the distinction
		// between "an assertion failed" and "the suite never started" IS the
		// diagnosis). No counts: a suite that never reached mocha vouches for
		// nothing, and a stale count from an earlier run must not.
		return {
			status			: 'fail',
			test_count		: null,
			pending_count	: null,
			failures		: [{
				title	: '(suite setup error — mocha did not run)',
				message	: String(data.error || 'unknown error'),
				stack	: ''
			}]
		}
	}

	if (type === 'watchdog') {
		return {
			status			: 'fail',
			test_count		: null,
			pending_count	: null,
			failures		: [{
				title	: '(watchdog — suite never reported back)',
				message	: `no test_end within ${data.ms}ms`,
				stack	: ''
			}]
		}
	}

	// Anything else the frame could post is not a verdict.
	return null
}

/**
* apply_card_state
* Park a state on the card's dataset — the surface the headless runner scrapes
* (scripts/client_test_runner.ts reads `{...card.dataset}` verbatim and
* scripts/lib/client_gate_verdict.ts interprets it). The counts are written
* BOTH OR NEITHER: mocha counts a pending test inside `stats.tests`, so a test
* count without its pending count cannot tell a suite that ran from one
* converted wholesale to it.skip. Failures are parked as JSON plus a readable
* `title`, so the reason a suite is red survives out of the iframe.
* @param {{dataset: object, title?: string}} card the sidebar card (or any object with a dataset)
* @param {ReturnType<typeof card_state_from_message>} state
*/
export function apply_card_state(card, state) {
	if (!card || !card.dataset || !state) return
	const is_count = (n) => typeof n === 'number' && Number.isInteger(n) && n >= 0
	if (is_count(state.test_count) && is_count(state.pending_count)) {
		card.dataset.testCount = String(state.test_count)
		card.dataset.pendingCount = String(state.pending_count)
	} else {
		delete card.dataset.testCount
		delete card.dataset.pendingCount
	}
	const failures = Array.isArray(state.failures) ? state.failures : []
	if (failures.length === 0) {
		delete card.dataset.testFailures
		card.title = ''
	} else {
		card.dataset.testFailures = JSON.stringify(failures)
		card.title = failures.map(f => `${f.title}: ${f.message}`).join('\n')
	}
}

/**
* count_run
* Every frame load of a suite bumps the card's `data-run-count`. `run all`
* resets it (reset_run_count) on its cards before it starts, so after a run
* every card it queued reads exactly 1 — and a retry re-added under ANY name
* still has to load the frame again, which reads 2 and the headless runner
* reds (GATE-11).
* @param {{dataset: object}} card
*/
export function count_run(card) {
	if (!card || !card.dataset) return
	const previous = Number.parseInt(card.dataset.runCount || '0', 10)
	card.dataset.runCount = String((Number.isInteger(previous) ? previous : 0) + 1)
}

/**
* reset_run_count
* A fresh `run all` counts its own loads only.
* @param {{dataset: object}} card
*/
export function reset_run_count(card) {
	if (!card || !card.dataset) return
	delete card.dataset.runCount
}

// @license-end
