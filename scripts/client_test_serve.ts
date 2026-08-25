/**
 * CLIENT TEST SERVER (interactive) — the browser page on the SUITE database.
 *
 * `bun run test:client:server [--port <n>]`
 *
 * The headless runner (scripts/client_test_runner.ts) starts its own verified
 * server, runs everything and exits. This is the human counterpart: the SAME
 * suite database, served for browsing `/dedalo/test/client/index.html` by hand
 * — running one area with DevTools open, stepping a failing suite in the UI.
 * Without it the only page a developer has is their dev server's, which serves
 * the APPLICATION database — where the test-TLD fixtures do not exist, so
 * fixture-bound suites die in request.invalid_tipo and read like engine bugs.
 *
 * Same door as the runner, every step:
 *   repoint to the suite db → set its login credential → verify /health answers
 *   this checkout's marker fingerprint → serve. Ctrl-C stops it cleanly.
 */

import {
	findFreePort,
	localSuiteFingerprint,
	repointProcessToSuiteDatabase,
	resolveSuiteDatabase,
	startClientTestServer,
} from './client_test_server.ts';

const args = Bun.argv.slice(2);
const portFlag = args.indexOf('--port');
const portValue = portFlag === -1 ? undefined : args[portFlag + 1];
const preferredPort = portValue === undefined ? 4390 : Number.parseInt(portValue, 10);

const { suiteDb } = resolveSuiteDatabase();
repointProcessToSuiteDatabase(suiteDb);

// The install seed ships root with NO password; set the suite credential so the
// page's own login form works, exactly as ensureSuiteLogin does for the runner.
const { ensureSuiteLoginPassword, SUITE_LOGIN_PASSWORD } = await import(
	'../src/core/test_data/suite_login.ts'
);
console.log(
	`suite login '${await ensureSuiteLoginPassword('root', SUITE_LOGIN_PASSWORD)}': root / ${SUITE_LOGIN_PASSWORD}`,
);

const port = await findFreePort(preferredPort);
const expected = await localSuiteFingerprint();
const server = await startClientTestServer({ suiteDb, expectedFingerprint: expected, port });

console.log(`\nClient tests on the SUITE database ('${suiteDb}'):`);
console.log(`  ${server.origin}/dedalo/test/client/index.html`);
console.log('\nCtrl-C stops the server.');

let stopping = false;
const stop = async (): Promise<void> => {
	if (stopping) return;
	stopping = true;
	await server.stop();
	process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
setInterval(() => {}, 1 << 30); // keep the event loop alive; stop() owns exit
