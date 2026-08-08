/**
 * The TWO update-manifest doors (CRAP Tier 3 item 3.7).
 *
 * `get_ontology_update_info` and `get_code_update_info` were two near-identical
 * 40-line blocks whose ONLY differences were invisible: the ontology door adds
 * the 'localhost' pseudo-code and reads TWO version parts; the code door does
 * neither and demands THREE. Both are now rewired onto the single parameterised
 * `authorizeUpdateManifest`, so the asymmetry is an argument, not a diff.
 *
 * What these tests defend:
 *   1. ORDER IS SECURITY — a non-master answers 'not a … server' BEFORE any
 *      code is examined. Answering 'Invalid code' first would confirm to an
 *      unauthenticated prober that this host IS a master.
 *   2. The `Number('') === 0` trap — an empty/short version must be refused.
 *   3. The refusal bytes are PHP parity, typo included ('is not an code
 *      server'): they are the wire, not prose.
 *   4. The rewire itself (source assertions): a revert that re-inlines the old
 *      blocks must go red, not silently pass.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../../src/config/config.ts';
import type { ApiRequestContext } from '../../src/core/api/dispatch.ts';
import {
	authorizeUpdateManifest,
	utilsApiActions,
} from '../../src/core/api/handlers/dd_utils_api.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { getOntologyIoPath } from '../../src/core/ontology/data_io_import.ts';

const HANDLER_SOURCE_PATH = join(import.meta.dir, '../../src/core/api/handlers/dd_utils_api.ts');

/** Base input: an authorized ontology-door call. Each test perturbs ONE field. */
function ontologyInput(overrides: Record<string, unknown> = {}) {
	return {
		isServer: true,
		configuredCodes: ['s1', undefined, '', 'alpha'] as readonly (string | undefined)[],
		allowLocalhost: true,
		presentedCode: 's1' as unknown,
		versionRaw: '7.0' as unknown,
		requiredParts: 2 as 2 | 3,
		...overrides,
	} as Parameters<typeof authorizeUpdateManifest>[0];
}

/** Base input: an authorized code-door call. */
function codeInput(overrides: Record<string, unknown> = {}) {
	return {
		isServer: true,
		configuredCodes: ['c1'] as readonly (string | undefined)[],
		allowLocalhost: false,
		presentedCode: 'c1' as unknown,
		versionRaw: '7.0.0' as unknown,
		requiredParts: 3 as 2 | 3,
		serverKind: 'code' as const,
		...overrides,
	} as Parameters<typeof authorizeUpdateManifest>[0];
}

describe('authorizeUpdateManifest — gate 1: am I even a master?', () => {
	test('a non-master refuses with the ontology bytes by default', () => {
		const out = authorizeUpdateManifest(ontologyInput({ isServer: false }));
		expect(out).toEqual({ ok: false, msg: 'Error. Server is not an ontology server' });
	});

	test("serverKind 'code' keeps the PHP 'an code server' typo VERBATIM", () => {
		// Wire parity, not prose: correcting this needs a WIRE_CONTRACT entry.
		const out = authorizeUpdateManifest(codeInput({ isServer: false }));
		expect(out).toEqual({ ok: false, msg: 'Error. Server is not an code server' });
	});

	test('ORDERING: a non-master never answers "Invalid code" (no master confirmation)', () => {
		// Both the code AND the version are garbage here. If the server check
		// were not first, the prober would learn which one the host cares about.
		const out = authorizeUpdateManifest(
			ontologyInput({ isServer: false, presentedCode: 'nope', versionRaw: 'garbage' }),
		);
		expect(out).toEqual({ ok: false, msg: 'Error. Server is not an ontology server' });
	});
});

describe('authorizeUpdateManifest — gate 2: the version', () => {
	test.each([
		['', 'empty string — the Number("") === 0 trap: major is 0, minor is NaN'],
		['7', 'one part only'],
		['7.x', 'non-numeric minor'],
		['v7.0', 'a "v" prefix is not stripped'],
		[null, 'null is not a string → coerced to ""'],
		[7, 'a NUMBER is not a string → coerced to ""'],
		[undefined, 'absent'],
		[{ major: 7 }, 'an object'],
	])('requiredParts 2 refuses %p (%s)', (versionRaw) => {
		const out = authorizeUpdateManifest(ontologyInput({ versionRaw }));
		expect(out).toEqual({ ok: false, msg: 'Error. Invalid version number' });
	});

	test('requiredParts 2 accepts "7.0" → [7,0]', () => {
		expect(authorizeUpdateManifest(ontologyInput({ versionRaw: '7.0' }))).toEqual({
			ok: true,
			version: [7, 0],
		});
	});

	test('requiredParts 2 truncates "7.0.3" to the major.minor pair [7,0]', () => {
		// The ontology IO dir is major.minor — patch releases share one dir.
		expect(authorizeUpdateManifest(ontologyInput({ versionRaw: '7.0.3' }))).toEqual({
			ok: true,
			version: [7, 0],
		});
	});

	test('requiredParts 3 REFUSES "7.0" — the asymmetry the extraction makes explicit', () => {
		expect(authorizeUpdateManifest(codeInput({ versionRaw: '7.0' }))).toEqual({
			ok: false,
			msg: 'Error. Invalid version number',
		});
	});

	test.each([
		['7.0.0', [7, 0, 0]],
		['7.0.0.dev', [7, 0, 0]], // parseVersionString strips the prerelease tail
		['7.0.0.1', [7, 0, 0, 1]], // extra parts are PRESERVED, not truncated
	])('requiredParts 3 accepts %p → %p', (versionRaw, expected) => {
		expect(authorizeUpdateManifest(codeInput({ versionRaw }))).toEqual({
			ok: true,
			version: expected as number[],
		});
	});

	test.each([['7.0.x'], ['7.0.0.dev.1']])('requiredParts 3 refuses %p', (versionRaw) => {
		expect(authorizeUpdateManifest(codeInput({ versionRaw }))).toEqual({
			ok: false,
			msg: 'Error. Invalid version number',
		});
	});

	test('MOVED FAITHFULLY, NOT FIXED: ".0" is accepted as version [0,0]', () => {
		// Number('') === 0 makes a leading-dot string a valid "major". This is the
		// pre-existing behaviour of the inline block, pinned here on purpose — a
		// behaviour fix hidden inside a refactor is unreviewable. Downstream the
		// path 0.0 simply does not exist, so getOntologyIoPath answers false.
		expect(authorizeUpdateManifest(ontologyInput({ versionRaw: '.0' }))).toEqual({
			ok: true,
			version: [0, 0],
		});
		expect(getOntologyIoPath(config.ops.ontologyDataIoDir, [0, 0])).toBe(false);
	});

	test('MOVED FAITHFULLY, NOT FIXED: an empty segment counts as 0 ("7..0")', () => {
		// Same Number('') === 0 trap, one segment in: '7..0' passes BOTH doors.
		// Pinned, not corrected — see the note on '.0' above.
		expect(authorizeUpdateManifest(codeInput({ versionRaw: '7..0' }))).toEqual({
			ok: true,
			version: [7, 0, 0],
		});
		expect(authorizeUpdateManifest(ontologyInput({ versionRaw: '7..0' }))).toEqual({
			ok: true,
			version: [7, 0],
		});
	});

	test('the version is judged BEFORE the code', () => {
		// Both invalid → the version message wins (the inline order, preserved).
		const out = authorizeUpdateManifest(
			ontologyInput({ versionRaw: 'nope', presentedCode: 'also-nope' }),
		);
		expect(out).toEqual({ ok: false, msg: 'Error. Invalid version number' });
	});
});

describe('authorizeUpdateManifest — gate 3: the code', () => {
	test.each([['s1'], ['alpha']])('a configured code (%p) is accepted', (presentedCode) => {
		expect(authorizeUpdateManifest(ontologyInput({ presentedCode }))).toEqual({
			ok: true,
			version: [7, 0],
		});
	});

	test.each([
		['', 'the empty configured entry must NOT become a usable code'],
		[undefined, 'the undefined configured entry must NOT become a usable code'],
		['nope', 'an unconfigured code'],
		[42, 'a non-string'],
		[null, 'null'],
		[['s1'], 'an array wrapping a valid code'],
	])('%p is refused (%s)', (presentedCode) => {
		expect(authorizeUpdateManifest(ontologyInput({ presentedCode }))).toEqual({
			ok: false,
			msg: 'Error. Invalid code',
		});
	});

	test("allowLocalhost:true honors the 'localhost' pseudo-code (ontology door)", () => {
		expect(authorizeUpdateManifest(ontologyInput({ presentedCode: 'localhost' }))).toEqual({
			ok: true,
			version: [7, 0],
		});
	});

	test("allowLocalhost:false REFUSES 'localhost' (code door) — the second asymmetry", () => {
		expect(authorizeUpdateManifest(codeInput({ presentedCode: 'localhost' }))).toEqual({
			ok: false,
			msg: 'Error. Invalid code',
		});
	});

	test('an empty configured-code list authorizes nobody but localhost when allowed', () => {
		expect(
			authorizeUpdateManifest(ontologyInput({ configuredCodes: [], presentedCode: 's1' })),
		).toEqual({ ok: false, msg: 'Error. Invalid code' });
		expect(
			authorizeUpdateManifest(ontologyInput({ configuredCodes: [], presentedCode: 'localhost' })),
		).toEqual({ ok: true, version: [7, 0] });
		expect(
			authorizeUpdateManifest(codeInput({ configuredCodes: [], presentedCode: 'localhost' })),
		).toEqual({ ok: false, msg: 'Error. Invalid code' });
	});
});

describe('the two doors as wired (this install is neither master)', () => {
	const context = {
		requestId: 'test',
		clientIp: '127.0.0.1',
		session: null,
		sessionToken: null,
		csrfCandidate: null,
	} as unknown as ApiRequestContext;

	/** The registered handler, asserted present (a missing action must FAIL loud). */
	function handlerFor(action: string) {
		const handler = utilsApiActions[action];
		if (handler === undefined) throw new Error(`utilsApiActions.${action} is not registered`);
		return handler;
	}

	function rqo(options: Record<string, unknown>): Rqo {
		return { dd_api: 'dd_utils_api', action: 'x', options } as unknown as Rqo;
	}

	test('the test env really is neither an ontology nor a code master', () => {
		// Names the precondition these two cases rest on, so a config change
		// turns them RED instead of quietly making them vacuous.
		expect(config.ontologyIo.isOntologyServer).toBe(false);
		expect(config.update.isCodeServer).toBe(false);
	});

	test('get_ontology_update_info refuses a non-master before any code check', async () => {
		const out = await handlerFor('get_ontology_update_info')(
			rqo({ version: '7.0', code: 'localhost' }),
			context,
		);
		expect(out.status).toBe(200);
		expect(out.body).toEqual({
			result: false,
			msg: 'Error. Server is not an ontology server',
			errors: ['Error. Server is not an ontology server'],
		});
	});

	test("get_code_update_info answers the PHP typo 'is not an code server' VERBATIM", async () => {
		const out = await handlerFor('get_code_update_info')(
			rqo({ version: '7.0.0', code: 'localhost' }),
			context,
		);
		expect(out.status).toBe(200);
		expect(out.body).toEqual({
			result: false,
			msg: 'Error. Server is not an code server',
			errors: ['Error. Server is not an code server'],
		});
	});
});

describe('getOntologyIoPath (the ontology door s downstream step)', () => {
	test('an existing major.minor dir resolves', () => {
		const resolved = getOntologyIoPath(config.ops.ontologyDataIoDir, [7, 0]);
		expect(typeof resolved).toBe('string');
		expect(String(resolved).endsWith('/7.0')).toBe(true);
	});

	test('a version with no shipped ontology files answers false', () => {
		expect(getOntologyIoPath(config.ops.ontologyDataIoDir, [99, 9])).toBe(false);
	});

	test('a non-integer part answers false before touching the filesystem', () => {
		expect(getOntologyIoPath(config.ops.ontologyDataIoDir, [7, Number.NaN])).toBe(false);
	});
});

describe('the rewire is real (source assertions — a revert must go red)', () => {
	const source = readFileSync(HANDLER_SOURCE_PATH, 'utf8');

	test('BOTH doors call authorizeUpdateManifest', () => {
		const calls = source.split('authorizeUpdateManifest({').length - 1;
		expect(calls).toBe(2);
	});

	test.each([
		["validCodes.add('localhost');", 'the inline localhost pseudo-code'],
		['const minor = Number(parts[1]);', 'the inline two-part version parse'],
		['clientVersion.length < 3', 'the inline three-part version check'],
		['config.ontologyIo.isOntologyServer !== true', 'the inline ontology master check'],
		['config.update.isCodeServer !== true', 'the inline code master check'],
		['const validCodes = new Set(', 'the inline code sets'],
	])('the inline block %p is GONE (%s)', (marker) => {
		expect(source.includes(marker as string)).toBe(false);
	});

	test('each door passes ITS OWN asymmetry (this env cannot execute past gate 1)', () => {
		// Both doors short-circuit at 'not a master' here, so the arguments they
		// pass are only observable in the source. Without this, swapping
		// requiredParts between the doors would be invisible to the whole suite.
		const ontologyDoor = source.slice(
			source.indexOf('get_ontology_update_info: async'),
			source.indexOf('get_code_update_info: async'),
		);
		const codeDoor = source.slice(source.indexOf('get_code_update_info: async'));
		expect(ontologyDoor.length).toBeGreaterThan(200);
		expect(codeDoor.length).toBeGreaterThan(200);
		for (const marker of ['allowLocalhost: true', 'requiredParts: 2', "serverKind: 'ontology'"]) {
			expect(ontologyDoor.includes(marker)).toBe(true);
			expect(codeDoor.includes(marker)).toBe(false);
		}
		for (const marker of ['allowLocalhost: false', 'requiredParts: 3', "serverKind: 'code'"]) {
			expect(codeDoor.includes(marker)).toBe(true);
			expect(ontologyDoor.includes(marker)).toBe(false);
		}
	});

	test('the refusal bytes live in exactly one place now', () => {
		expect(source.split("'Error. Invalid code'").length - 1).toBe(1);
		expect(source.split("'Error. Invalid version number'").length - 1).toBe(1);
	});
});
