/**
 * Parity replay v0 (plan A4.6).
 *
 * For each fixture pair (<name>.json request + <name>.response.json captured
 * response) this test:
 *   1. validates the request against the RQO zod schema and the captured
 *      response against the API-response schema (Phase 1 gate: schemas must
 *      parse REAL payloads — a rejection is a model bug, fix the model);
 *   2. replays the request LIVE against the PHP reference server and diffs the
 *      normalized response against the captured fixture (detects PHP-side
 *      drift and keeps the harness honest, plan A5.5).
 *
 * Authenticated fixtures are SKIPPED (loudly) when PHP_API_USERNAME/PASSWORD
 * are not configured — logged as uncovered scope, never silently narrowed.
 */

import { describe, expect, test } from 'bun:test';
import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { config } from '../../src/config/config.ts';
import { apiResponseSchema, rqoSchema } from '../../src/core/concepts/rqo.ts';
import { normalizeApiResponse } from './normalize.ts';
import { PhpApiClient, hasPhpCredentials } from './php_client.ts';

const fixturesDir = resolve(import.meta.dir, 'fixtures');

interface FixtureDefinition {
	comment?: string;
	requires_login?: boolean;
	rqo: Record<string, unknown>;
}

/** Discover request fixtures that have a captured response next to them. */
const fixtureNames = readdirSync(fixturesDir)
	.filter((fileName) => fileName.endsWith('.json') && !fileName.endsWith('.response.json'))
	.map((fileName) => fileName.replace(/\.json$/, ''))
	.filter((name) => {
		try {
			return readdirSync(fixturesDir).includes(`${name}.response.json`);
		} catch {
			return false;
		}
	});

describe.if(hasPhpCredentials())('parity replay against live PHP', () => {
	if (fixtureNames.length === 0) {
		test('at least one captured fixture exists', () => {
			throw new Error('No captured fixtures found. Run: bun run scripts/capture_fixture.ts <name>');
		});
		return;
	}

	for (const fixtureName of fixtureNames) {
		test(fixtureName, async () => {
			const definition = (await Bun.file(
				join(fixturesDir, `${fixtureName}.json`),
			).json()) as FixtureDefinition;
			const captured = (await Bun.file(
				join(fixturesDir, `${fixtureName}.response.json`),
			).json()) as { response: Record<string, unknown> };

			// 1. Schema gates: real payloads must parse.
			expect(() => rqoSchema.parse(definition.rqo)).not.toThrow();
			expect(() => apiResponseSchema.parse(captured.response)).not.toThrow();

			// 2. Live replay + diff (skip loudly if auth is needed but unavailable).
			if (definition.requires_login && !hasPhpCredentials()) {
				console.warn(
					`[UNCOVERED] '${fixtureName}' needs PHP credentials (private/.env) — live replay skipped.`,
				);
				return;
			}

			const client = new PhpApiClient();
			if (definition.requires_login) {
				const loggedIn = await client.login(
					config.phpReference.username as string,
					config.phpReference.password as string,
				);
				expect(loggedIn).toBe(true);
			}
			const { body } = await client.call(definition.rqo);
			expect(normalizeApiResponse(body)).toEqual(captured.response);
		});
	}
});
