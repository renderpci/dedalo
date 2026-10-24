/**
 * TWIN GATE — the installer's terminal sanitizer and the publication agent's
 * are ONE function in two deployables (cross-ops:r0 S3: "sanitizeLine is
 * declared a COPY of the host_agent sanitizer, but no twin gate holds the two
 * copies equal").
 *
 * src/core/install/display_text.ts says its sanitizeLine is COPIED from
 * publication/host_agent/src/provision/init/report.ts (the agent never imports
 * the engine, nor the engine the agent). A copy nothing compares drifts: a
 * fix to one (a new escape family, the C1 range) silently leaves the other
 * printing attacker-controlled terminal sequences. OUTCOME, not spelling: both
 * functions run over one hostile corpus and must answer identically — and the
 * corpus is non-vacuous (each case is CHANGED by the sanitizer, so two
 * identity functions could not pass).
 */

import { describe, expect, test } from 'bun:test';
import { sanitizeLine as agentSanitize } from '../../publication/host_agent/src/provision/init/report.ts';
import { sanitizeLine as installerSanitize } from '../../src/core/install/display_text.ts';

const ESC = '\x1b';
const HOSTILE: readonly string[] = [
	`${ESC}[31mred${ESC}[0m`, // CSI SGR
	`${ESC}[2J${ESC}[H`, // CSI clear + home
	`${ESC}[?1049h alt screen`, // CSI private mode
	`${ESC}]0;title\x07after`, // OSC terminated by BEL
	`${ESC}]8;;https://evil.example${ESC}\\link${ESC}]8;;${ESC}\\`, // OSC 8 hyperlink, ST
	`${ESC}Pq#0;2;0;0;0${ESC}\\dcs`, // DCS
	`${ESC}_apc payload${ESC}\\apc`, // APC
	`${ESC}^pm payload${ESC}\\pm`, // PM
	`${ESC}Xsos payload${ESC}\\sos`, // SOS
	`${ESC}7saved${ESC}8`, // two-byte ESC (save/restore cursor)
	`${ESC}(0line drawing${ESC}(B`, // charset designation (intermediate + final)
	'tab\there', // tab → one space
	'bell\x07 null\x00 bs\x08 vt\x0b ff\x0c cr\r', // C0
	'del\x7f', // DEL
	'c1 csi \x9b31m and osc \x9d0;x\x9c st', // C1 8-bit introducers
	`trailing unterminated ${ESC}]0;never ends`, // OSC to end of line
	`lone escape at end ${ESC}`,
];

describe('installer ↔ publication agent sanitizer twin', () => {
	test('the corpus is non-vacuous: every case is changed by the sanitizer', () => {
		for (const line of HOSTILE)
			expect(installerSanitize(line), JSON.stringify(line)).not.toBe(line);
	});

	test('both copies answer identically over the hostile corpus', () => {
		for (const line of HOSTILE) {
			expect(installerSanitize(line), JSON.stringify(line)).toBe(agentSanitize(line));
		}
	});

	test('both copies leave a plain line (newline included) untouched', () => {
		const plain = 'Ontología «oh» — 12 files\nnext line';
		expect(installerSanitize(plain)).toBe(plain);
		expect(agentSanitize(plain)).toBe(plain);
	});
});
