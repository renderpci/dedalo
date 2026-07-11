/**
 * ORACLE-PRESENCE CANARY (S2-40 / DEC-14a — the green-suite trap).
 *
 * Without the live PHP oracle, ~83% of parity assertions used to vanish while
 * bun reported PASS with zero skips. The differential files are now gated with
 * describe.if(hasPhpCredentials()) so they report explicit SKIPS — and this
 * canary makes an oracle-less run IMPOSSIBLE to mistake for a verified one:
 *
 *  - default: FAILS loudly when the oracle is not configured or not reachable;
 *  - ORACLE_OPTIONAL=1: acknowledges the oracle is absent for this run and
 *    skips (the differentials still report as skipped, never as green);
 *  - ORACLE_REQUIRED=1 (CI mode for the parity job): overrides ORACLE_OPTIONAL
 *    — absent creds hard-fail the job.
 */

import { describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import { FIXTURE_EXEMPT_GATES, fixtureStoreStats, oracleMode } from './oracle_fixtures.ts';
import { PhpApiClient, hasPhpCredentials, oracleOptional } from './php_client.ts';

// NOT gated on hasPhpCredentials() — the whole point is to run (and fail)
// when the oracle is absent. Do not add describe.if here.
describe('PHP oracle canary', () => {
	// ORACLE_MODE=fixtures (DEC-14b): the oracle for this run is the harvested
	// golden store — assert it is present and say EXACTLY what this run does
	// and does not verify (read-path parity vs frozen PHP; write-path gates
	// are skipped). engineering/ORACLE_HARVEST.md.
	test.if(oracleMode() === 'fixtures')(
		'ORACLE_MODE=fixtures — parity runs against the harvested golden store, not live PHP',
		() => {
			const stats = fixtureStoreStats();
			if (stats.interactions === 0) {
				throw new Error(
					'ORACLE_MODE=fixtures but test/parity/fixtures/oracle_harvest/ is empty or missing. ' +
						'Run `bun run scripts/oracle_harvest.ts` against the live oracle first (engineering/ORACLE_HARVEST.md).',
				);
			}
			console.warn(
				`[oracle_canary] ORACLE_MODE=fixtures: serving ${stats.interactions} frozen oracle responses ` +
					`from ${stats.files} harvested gate files. Read-path parity is verified against the FROZEN ` +
					`PHP capture; the ${FIXTURE_EXEMPT_GATES.length} live-only (fixture-exempt) gates are SKIPPED.`,
			);
		},
	);

	test.if(!oracleOptional() && oracleMode() !== 'fixtures')(
		'the live PHP oracle is configured, reachable and accepts the dev login',
		async () => {
			if (!hasPhpCredentials()) {
				throw new Error(
					'PHP oracle is NOT configured (PHP_API_BASE_URL / PHP_API_USERNAME / ' +
						'PHP_API_PASSWORD in ../private/.env). Every parity differential in this run ' +
						'is being SKIPPED. If that is intentional, re-run with ORACLE_OPTIONAL=1; ' +
						'CI parity jobs must set ORACLE_REQUIRED=1 instead.',
				);
			}
			const client = new PhpApiClient();
			const { status, body } = await client.call({
				action: 'get_environment',
				dd_api: 'dd_core_api',
			});
			expect(status).toBe(200);
			expect(body.result).toBeTruthy();
			const loggedIn = await client.login(
				config.phpReference.username as string,
				config.phpReference.password as string,
			);
			expect(loggedIn).toBe(true);
		},
		30000,
	);

	test.if(oracleOptional() && oracleMode() !== 'fixtures')(
		'ORACLE_OPTIONAL=1 — oracle-gated differentials are SKIPPED on this run (not verified)',
		() => {
			console.warn(
				'[oracle_canary] ORACLE_OPTIONAL=1: the PHP-oracle differentials are skipped. ' +
					'This run verifies NO cross-engine parity.',
			);
		},
	);
});
