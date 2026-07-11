/**
 * Capture a parity fixture from the LIVE PHP reference server.
 *
 * Usage:
 *   bun run scripts/capture_fixture.ts <fixture-name>
 *
 * Reads test/parity/fixtures/<fixture-name>.json ({comment, requires_login, rqo}),
 * POSTs the rqo to the PHP API (logging in first when requires_login and
 * credentials are configured), normalizes the response (normalize.ts), and
 * writes test/parity/fixtures/<fixture-name>.response.json with capture
 * metadata (plan A5.5: fixtures must carry their provenance).
 */

import { join, resolve } from 'node:path';
import { config } from '../src/config/config.ts';
import { normalizeApiResponse } from '../test/parity/normalize.ts';
import { PhpApiClient, hasPhpCredentials } from '../test/parity/php_client.ts';

const fixturesDir = resolve(import.meta.dir, '../test/parity/fixtures');

const fixtureName = Bun.argv[2];
if (!fixtureName) {
	console.error('Usage: bun run scripts/capture_fixture.ts <fixture-name>');
	process.exit(1);
}

const requestFile = Bun.file(join(fixturesDir, `${fixtureName}.json`));
if (!(await requestFile.exists())) {
	console.error(`No such fixture request file: ${fixtureName}.json in ${fixturesDir}`);
	process.exit(1);
}

const fixtureDefinition = (await requestFile.json()) as {
	comment?: string;
	requires_login?: boolean;
	rqo: Record<string, unknown>;
};

const client = new PhpApiClient();

if (fixtureDefinition.requires_login) {
	if (!hasPhpCredentials()) {
		console.error(
			'This fixture requires login but PHP_API_USERNAME/PHP_API_PASSWORD are not set in private/.env.',
		);
		process.exit(1);
	}
	const loggedIn = await client.login(
		config.phpReference.username as string,
		config.phpReference.password as string,
	);
	if (!loggedIn) {
		console.error('Login to the PHP reference server failed.');
		process.exit(1);
	}
}

const { status, body } = await client.call(fixtureDefinition.rqo);

// Capture-commit provenance (S2-43 channel 1): full-response fixtures pin
// LIVE, mutable shared-DB records, so every capture records the repo commit
// and the drift policy that governs re-capture.
let captureCommit = 'unknown';
try {
	captureCommit = (await Bun.$`git rev-parse --short HEAD`.text()).trim();
} catch {
	// git unavailable (exported tree) — keep 'unknown' rather than fail.
}

const capturedFixture = {
	meta: {
		captured_at: new Date().toISOString(),
		capture_commit: captureCommit,
		php_api_base_url: config.phpReference.apiBaseUrl,
		entity: config.entity,
		http_status: status,
		requires_login: fixtureDefinition.requires_login ?? false,
		comment: fixtureDefinition.comment ?? null,
		drift_policy:
			'This fixture pins a live shared-DB record. If the replay gate reds with NO engine change, ' +
			'the record was edited on the shared DB: verify the diff is data-side only, then re-capture with ' +
			'`bun run scripts/capture_fixture.ts <name>` in the same change that adjudicates the red.',
	},
	response: normalizeApiResponse(body),
};

const outputPath = join(fixturesDir, `${fixtureName}.response.json`);
await Bun.write(outputPath, `${JSON.stringify(capturedFixture, null, '\t')}\n`);
console.log(`Captured ${fixtureName} (HTTP ${status}) → ${outputPath}`);
