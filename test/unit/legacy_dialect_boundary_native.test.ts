/**
 * The PRE-7 DIALECT STOPS AT THE PROXY — this engine never learns a second one.
 *
 * The official master must keep answering every pre-7 installation in the world
 * (engineering/MASTER_SERVER.md). The tempting way to do that is inside the
 * engine: accept a form-encoded `rqo=` body, mirror a top-level `result` key,
 * add a `str_manager` route. Each would be a wire fork at one url, and one of
 * them — the `result` mirror — was already built once and deliberately REMOVED
 * (ERRORS_SPEC §3.0, 2026-08-16).
 *
 * So the split lives at the web server, and this gate is the reason it can stay
 * there: it drives the REAL request path and pins that the engine refuses the
 * legacy dialect. Every assertion here is a load-bearing premise of a rule in
 * deploy/apache.master_legacy_v6.conf. If someone "helpfully" teaches the engine
 * the old dialect, this turns red — and the overlay's rules become a silent
 * double-serving of the same url by two engines.
 *
 * Note what is NOT asserted: that the legacy shapes FAIL for a museum. They
 * succeed — at the pre-7 engine, one hop earlier. This gate only proves who
 * does not answer them.
 */

import { describe, expect, test } from 'bun:test';
import { handleRequest } from '../../src/server.ts';

const context = { requestId: 'legacy-dialect-boundary', startedAt: 0 };

/** The two API doors of src/server.ts API_PATHS that a pre-7 install could hit. */
const API_DOORS = [
	'/api/v1/json',
	'/dedalo/core/api/v1/json',
	'/dedalo/core/api/v1/json/',
] as const;

/** The readiness probe a pre-7 install sends, in its own dialect: form-encoded `rqo=`. */
function legacyProbe(path: string): Request {
	const rqo = JSON.stringify({
		dd_api: 'dd_utils_api',
		action: 'get_server_ready_status',
		prevent_lock: true,
		options: { check: 'ontology_server' },
	});
	return new Request(`http://localhost${path}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: `rqo=${encodeURIComponent(rqo)}`,
	});
}

describe('legacy dialect boundary', () => {
	test('a form-encoded `rqo=` body is REFUSED on every API door', async () => {
		// The premise of overlay rule 3. Both doors, because the overlay diverts
		// only the legacy path — if `/api/v1/json` quietly accepted the old dialect,
		// a pre-7 install pointed at the door would be served by the wrong engine.
		for (const door of API_DOORS) {
			const response = await handleRequest(legacyProbe(door), context);
			expect(response.status, `${door} refuses the pre-7 body`).toBeGreaterThanOrEqual(400);
			const body = (await response.json()) as Record<string, unknown>;
			// Envelope v2, even in refusal — and never the pre-7 shape. The code is
			// pinned because it is the SIGNAL: the body never parsed, so no handler
			// ran, which is what makes the control below meaningful.
			expect(body.ok, `${door} answers envelope v2`).toBe(false);
			expect((body.error as { code?: string } | undefined)?.code).toBe('request.malformed_body');
			expect(body, `${door} emits no pre-7 \`result\` key`).not.toHaveProperty('result');
		}
	});

	test('the same request as JSON is PARSED — so the refusal above is the DIALECT, not the route', async () => {
		// Without this, the test above would pass just as well on a broken route,
		// and rule 3 would be diverting requests the engine could have served.
		// This install is not a master, so the action refuses with a TYPED code —
		// which is the proof it ran at all: a body that never parsed cannot reach a
		// handler and cannot produce `update_server.refused`.
		const response = await handleRequest(
			new Request(`http://localhost/api/v1/json`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					dd_api: 'dd_utils_api',
					action: 'get_server_ready_status',
					prevent_lock: true,
					options: { check: 'ontology_server' },
				}),
			}),
			context,
		);
		const body = (await response.json()) as { ok: boolean; error?: { code?: string } };
		// Deliberately NOT asserting a verdict: whether this box is a master is
		// ambient configuration (IS_AN_ONTOLOGY_SERVER), and a gate that depended on
		// it would be red on one developer's machine and green on the next. What
		// must hold everywhere is that the request got PAST the body reader — so the
		// one forbidden answer is the dialect refusal itself.
		expect(body.error?.code, 'the JSON body was parsed and a handler ran').not.toBe(
			'request.malformed_body',
		);
		// Whatever the verdict, the shape is envelope v2 and never the pre-7 one.
		expect(body).not.toHaveProperty('result');
		if (body.ok === false) {
			// A policy refusal is a decision, which only a handler can make.
			expect(body.error?.code).toMatch(/^update_server\./);
		}
	});

	test('the pre-7 legacy routes do not exist here', async () => {
		// The premises of overlay rules 1 and 5. `/dedalo/code/` is v6's archive
		// prefix; this engine serves its own releases from /dedalo/install/code/,
		// and the two must never converge (master_legacy_routing_tripwire pins it).
		const absent = [
			'/dedalo/core/extras/str_manager/index.php',
			'/dedalo/code/6/6.9/6.9.6_dedalo.zip',
			'/dedalo/code/dedalo6_code.zip',
		];
		for (const path of absent) {
			const response = await handleRequest(
				new Request(`http://localhost${path}`, { method: 'GET' }),
				context,
			);
			expect(response.status, `${path} is not an engine route`).toBe(404);
		}
	});

	test('the `result` key stays forbidden by construction, not by habit', async () => {
		// The one shape that would make a pre-7 browser panel believe this engine is
		// its master. It was mirrored once and removed on purpose; the registry-level
		// ban is what keeps a future handler from reintroducing it per-action.
		const spec = await Bun.file(
			new URL('../../engineering/ERRORS_SPEC.md', import.meta.url),
		).text();
		expect(spec).toContain('ENVELOPE_FORBIDDEN_KEYS');
		const { ENVELOPE_FORBIDDEN_KEYS } = await import('../../src/core/errors/schema.ts');
		expect(ENVELOPE_FORBIDDEN_KEYS).toContain('result');
	});
});
