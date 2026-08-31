/**
 * TRIPWIRE — no raw exception text on the wire, and no SILENT debug switch
 * (P2-8 / SEC-16, SEC-17, SEC-19).
 *
 * The disclosure ladder is a property of `toErrorBody` and NOTHING ELSE. Three
 * doors went around it:
 *
 *  - `rejectedUpload()` assigned `error.message` to `publicMessage` — a wire
 *    field — under a public-disclosure code, while its own header said the
 *    intent was "the validator's own sentence … never a raw exception string".
 *    The try it serves wraps untried mkdirSync / writeFileSync / renameSync,
 *    whose messages embed ABSOLUTE PATHS, and authorization at that door is
 *    session-only: a consultation-only account reaches it.
 *  - Two identify sites emitted `detail: error.message` inside `ok:true`
 *    payloads, where the ladder does not reach at all and the text is Postgres
 *    or filesystem output.
 *  - `DEDALO_DEBUG_API_ERRORS` collapses the WHOLE ladder — `{exception, stack,
 *    coordinates, cause_chain}` on every failure body, PRE-AUTH ones included —
 *    and had no tripwire, no boot warning and no dashboard row, while the
 *    directly comparable `MEDIA_DEV_ROUTE_ENABLED` gets a loud `[security]`
 *    line from the same function. Worse, `toFailureRecord` shares the builder,
 *    so debug blocks are PERSISTED into job rows and survive turning it off.
 *
 * THE RULE. A DedaloError is the engine speaking DELIBERATELY: its message was
 * written to be read by a curator. Anything else is an exception that merely
 * happened — it travels as `cause`, to the log, never to the caller.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dir, '..', '..');
const read = (rel: string): string => readFileSync(join(REPO_ROOT, rel), 'utf8');

describe('no raw exception text reaches the caller', () => {
	test('the upload refusal puts only a DELIBERATE sentence on the wire', () => {
		const source = read('src/core/media/ingest/upload_endpoint.ts');
		const fn = source.slice(source.indexOf('function rejectedUpload'));
		expect(fn.length).toBeGreaterThan(200);
		// The defect, verbatim: publicMessage taking whatever threw.
		expect(
			fn.slice(0, 1600),
			'publicMessage is a WIRE field — assigning error.message to it publishes ' +
				"mkdirSync/writeFileSync paths to a consultation-only account's browser",
		).not.toMatch(/publicMessage:\s*error instanceof Error \? error\.message/);
		// The rule: only a typed refusal speaks.
		expect(fn.slice(0, 1600)).toMatch(/error instanceof DedaloError/);
		// The original still travels for the log.
		expect(fn.slice(0, 1600)).toMatch(/cause: error/);
	});

	test('a failed identify source does not echo what threw', () => {
		const source = read('src/core/api/handlers/dd_identify_api.ts');
		// `detail` sits inside an ok:true payload, so no ladder applies to it.
		expect(
			source,
			'detail: error.message inside ok:true publishes Postgres/filesystem text with no ' +
				'disclosure control at all',
		).not.toMatch(/detail:\s*error instanceof Error \? error\.message/);
		expect(source).toContain('function declineDetail');
		const helper = source.slice(source.indexOf('function declineDetail'));
		expect(helper.slice(0, 400)).toMatch(/error instanceof DedaloError/);
	});

	test('the switch that collapses the ladder announces itself at boot', () => {
		const server = read('src/server.ts');
		expect(
			server,
			'DEDALO_DEBUG_API_ERRORS attaches exception+stack+cause_chain to EVERY failure body, ' +
				'pre-auth included, and job rows PERSIST it — it must be as loud as ' +
				'MEDIA_DEV_ROUTE_ENABLED, which has had a [security] line for a year',
		).toMatch(/DEDALO_DEBUG_API_ERRORS/);
		const block = server.slice(server.indexOf("readEnv('DEDALO_DEBUG_API_ERRORS')"));
		expect(block.slice(0, 900)).toContain('[security]');
		// It must warn when ON, not merely mention the key.
		expect(block.slice(0, 300)).toMatch(/===\s*'true'/);
	});

	test('the comparator it is measured against is still loud', () => {
		// Anti-vacuity of the precedent: if MEDIA_DEV_ROUTE_ENABLED ever stops
		// warning, the argument "as loud as its neighbour" is empty and this rule
		// should be re-argued rather than left resting on a habit nobody keeps.
		const server = read('src/server.ts');
		expect(server).toMatch(/\[security\] MEDIA_DEV_ROUTE_ENABLED=true/);
	});

	test('anti-vacuity: every slice found its target', () => {
		expect(read('src/core/media/ingest/upload_endpoint.ts')).toContain('function rejectedUpload');
		expect(read('src/core/api/handlers/dd_identify_api.ts')).toContain('declineDetail');
		expect(read('src/server.ts')).toContain("readEnv('DEDALO_DEBUG_API_ERRORS')");
	});
});
