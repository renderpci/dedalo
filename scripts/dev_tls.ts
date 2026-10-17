/**
 * THE DEVELOPER ROUTE'S CERTIFICATE, BY HAND (TODO-055; design DEV_ROUTE_SERVE
 * §1.2) — `bun run tls:renew` and `bun run tls:untrust`.
 *
 *  - `tls:renew [--force]`: a new leaf from the SAME local authority in
 *    `<private>/tls` (deploy/dedalo-tls-rotate.sh `--mode renew`, the ONE
 *    generator; the browsers that trust the authority need nothing). Without
 *    --force it re-issues only inside the generator's 30-day window — the dev
 *    listener's boot warning names this command when that window opens
 *    (src/config/tcp_listener.ts). A developer machine has no renewal timer.
 *  - `tls:untrust`: take the authority back out of every trust store the
 *    installer put it in (dedalo-trust.json — the macOS login keychain, the
 *    Linux anchors, Firefox profiles). The way back for a FINISHED install,
 *    which `--abort` never undoes.
 *
 * Runs as the developer (never root in a user's tree — the same refusal as the
 * installer's steps). Exit 0 done, 1 refused (the sentence on stderr).
 */

import { DedaloError } from '../src/core/errors/index.ts';
import { renewDevCertificate } from '../src/core/install/dev_tls.ts';
import { untrustDevAuthorityOnMachine } from '../src/core/install/dev_trust.ts';
import { devTlsDir } from '../src/core/install/paths.ts';

const USAGE = 'usage: bun run scripts/dev_tls.ts renew [--force] | untrust';

type DevTlsRun = { code: number; out: string[]; err: string[] };

/** `renew [--force]`: the same authority, a new leaf. */
function renew(dir: string, flags: readonly string[]): DevTlsRun {
	const result = renewDevCertificate(dir, flags.includes('--force'));
	return { code: 0, out: [result.msg], err: [] };
}

/** `untrust`: every store the installer put the authority in. */
async function untrust(dir: string): Promise<DevTlsRun> {
	const result = await untrustDevAuthorityOnMachine(dir, undefined);
	return {
		code: result.failed.length === 0 ? 0 : 1,
		out: [
			result.removed.length === 0
				? 'nothing to remove: the installer trusted no development authority from this directory'
				: `removed: ${result.removed.join(', ')}`,
		],
		err: result.failed.map((line) => `NOT removed (do it by hand): ${line}`),
	};
}

/** The subcommand `argv` names, or null (usage). */
function subcommand(
	argv: readonly string[],
): ((dir: string) => DevTlsRun | Promise<DevTlsRun>) | null {
	const [command, ...rest] = argv;
	if (command === 'renew' && rest.every((arg) => arg === '--force'))
		return (dir) => renew(dir, rest);
	if (command === 'untrust' && rest.length === 0) return untrust;
	return null;
}

/** Run one subcommand; answers the exit code and the lines to print. */
export async function runDevTls(
	argv: readonly string[],
	dir: string = devTlsDir(),
): Promise<DevTlsRun> {
	const run = subcommand(argv);
	if (run === null) return { code: 1, out: [], err: [USAGE] };
	try {
		return await run(dir);
	} catch (error) {
		// An install refusal carries its own sentence; anything else is a bug and is rethrown.
		if (error instanceof DedaloError) return { code: 1, out: [], err: [error.message] };
		throw error;
	}
}

if (import.meta.main) {
	const { code, out, err } = await runDevTls(process.argv.slice(2));
	for (const line of out) console.log(line);
	for (const line of err) console.error(line);
	process.exit(code);
}
