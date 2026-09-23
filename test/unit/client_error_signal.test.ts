/**
 * THE PAGE-WIDE ERROR SIGNAL has one name and one consumer contract
 * (DEC-12 gate for client/dedalo/core/common/js/error_signal.js).
 *
 * WHY THIS GATE EXISTS: the signal is a window CustomEvent, which is a
 * string-matched channel with no compiler behind it — and one of its two
 * producers, error_capture.js, CANNOT import the constant. That module is
 * side-effect-only and import-free on purpose (it installs its listeners before
 * any other application module evaluates), so it repeats the event name as a
 * literal. Rename ERROR_SIGNAL and the JS-error half of the feature goes
 * silently dead: the launcher tab would keep listening on the old name, no
 * error would be thrown, and nothing would look broken until someone needed to
 * report a crash.
 *
 * ASSERTIONS:
 *   1. the literal in error_capture.js is exactly ERROR_SIGNAL's value;
 *   2. error_dispatch.js raises the signal from an ALLOWLIST of policy actions,
 *      and the actions that are not defects stay out of it: a validation
 *      message about the user's own typing ('inline'), a routine permission
 *      refusal ('no_access_page'), a record another editor holds ('modal'), an
 *      invisible retry ('silent'/'csrf_retry') and a session expiry
 *      ('relogin'). A tab that unfolds for those is noise by the time a real
 *      crash raises it;
 *   3. the launcher listens through the imported constant and toggles the
 *      `alerted` class, whose look lives in error_report_tab.less (geometry and
 *      state in CSS, never inline — the floating-dock law).
 *
 * Honest limit: source-level, like its sibling client_floating_dock.test.ts —
 * it proves the channel cannot drift apart, not that the tab visibly unfolds
 * (no browser here; the client suite owns rendered behaviour).
 *
 * DB-less, network-less → hermetic tier.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dir, '..', '..');
const read = (rel: string) => readFileSync(join(REPO_ROOT, rel), 'utf8');

const COMMON = 'client/dedalo/core/common/js/';
const SIGNAL = `${COMMON}error_signal.js`;
const CAPTURE = `${COMMON}error_capture.js`;
const DISPATCH = `${COMMON}error_dispatch.js`;
const LAUNCHER = `${COMMON}error_report_launcher.js`;
const TAB_LESS = 'client/dedalo/core/page/css/layout/error_report_tab.less';

/** The one declared name: `export const ERROR_SIGNAL = '<name>'`. */
function declaredSignalName(): string {
	const match = read(SIGNAL).match(/export const ERROR_SIGNAL\s*=\s*'([^']+)'/);
	expect(match, `${SIGNAL}: ERROR_SIGNAL must be declared as a single-quoted literal`).not.toBe(
		null,
	);
	return (match as RegExpMatchArray)[1] as string;
}

describe('page-wide error signal', () => {
	test('the import-free capturer repeats the EXACT event name', () => {
		const name = declaredSignalName();
		expect(
			read(CAPTURE),
			`${CAPTURE}: it cannot import ERROR_SIGNAL ('${name}'), so it must repeat the ` +
				'literal — rename one side and the JS-error half of the launcher alert goes silently dead',
		).toContain(`'${name}'`);
	});

	test('the dispatcher raises the signal only for DEFECT-shaped failures', () => {
		const src = read(DISPATCH);
		expect(src, `${DISPATCH}: must import the signal raiser`).toContain(
			"import {signal_error} from './error_signal.js'",
		);
		expect(src, `${DISPATCH}: must raise the signal`).toContain("signal_error({origin:'api'");

		// an ALLOWLIST, so a policy action added later is silent by default rather
		// than unfolding the tab on somebody's validation message
		const allow = src.match(/REPORTABLE_ACTIONS = new Set\(\[([^\]]*)\]\)/);
		expect(allow, `${DISPATCH}: REPORTABLE_ACTIONS must be a literal Set of actions`).not.toBe(
			null,
		);
		const actions = ((allow as RegExpMatchArray)[1] as string)
			.split(',')
			.map((a) => a.trim().replace(/^'|'$/g, ''))
			.filter(Boolean);
		expect(src, `${DISPATCH}: the signal must be gated on the allowlist`).toContain(
			'REPORTABLE_ACTIONS.has(action)',
		);
		// the actions that are NOT a defect the user could report
		for (const action of ['silent', 'csrf_retry', 'relogin', 'inline', 'no_access_page', 'modal']) {
			expect(
				actions,
				`${DISPATCH}: '${action}' is not a defect worth unfolding the launcher for`,
			).not.toContain(action);
		}
		expect(actions.length, `${DISPATCH}: the allowlist must not be empty`).toBeGreaterThan(0);
		// a transient (a dropped network) is not a defect either
		expect(src, `${DISPATCH}: 'warning' severity must not raise the signal`).toContain(
			"entry.severity!=='warning'",
		);
	});

	test('the launcher listens through the constant and alerts through CSS', () => {
		const src = read(LAUNCHER);
		expect(src, `${LAUNCHER}: must import the signal name, never repeat it`).toContain(
			"import {ERROR_SIGNAL} from './error_signal.js'",
		);
		expect(src, `${LAUNCHER}: must listen for the signal`).toContain(
			'window.addEventListener(ERROR_SIGNAL',
		);
		expect(src, `${LAUNCHER}: the alerted state is a class`).toContain("classList.add('alerted')");
		expect(src, `${LAUNCHER}: opening the tool must clear the alerted state`).toContain(
			"classList.remove('alerted')",
		);
		// the unfolded tab overlaps the inspector rail's scrollbar gutter, so the
		// cue must be DISMISSIBLE: it folds on the first hover/focus. Without this
		// the alert is a click trap until the user opens the tool.
		for (const dismiss of ['mouseenter', 'focus']) {
			expect(
				src,
				`${LAUNCHER}: the alerted tab must fold on '${dismiss}' — an undismissable ` +
					'unfolded tab sits over the inspector scrollbar',
			).toContain(`addEventListener('${dismiss}', fold_alert)`);
		}
		// the launcher installs at the END of page build while error_capture.js is
		// listening from the first byte: a boot-time crash — the case the feature
		// exists for — raises the signal into a void unless the state is SEEDED
		// from the buffer that already holds it.
		expect(
			src,
			`${LAUNCHER}: the alerted state must be seeded from window.dedalo_js_errors at ` +
				'install, or every boot-time failure alerts nobody',
		).toContain('window.dedalo_js_errors');

		expect(
			read(TAB_LESS),
			`${TAB_LESS}: the alerted look must live in the stylesheet, like the tab's geometry`,
		).toContain('.error_report_edge_tab.alerted {');
	});
});
