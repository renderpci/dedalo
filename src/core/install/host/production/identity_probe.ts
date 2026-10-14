/**
 * THE IDENTITY PROBE'S MEASUREMENT (owner decisions 2026-10-12) — the screen
 * that asks for the install folder and the service account checks them
 * against THIS host with the SAME read-only facts and the SAME verdict
 * host_preflight later freezes (identity_rules.ts): the service account, the
 * folder and its parents, the other instances, the roots the web server's
 * sites serve. Through the Review's machine (the scratch seam's when armed).
 * Config-free (it runs in the probe child, before any engine import).
 */

import type { InstallAnswers } from '../../install_plan.ts';
import { gatherIdentityFacts, webFacts, webKindOf } from '../facts.ts';
import type { OsRow } from '../os_support.ts';
import { reviewMachine } from '../review.ts';
import { type IdentityVerdict, identityVerdict } from './identity_rules.ts';

/**
 * The host's os-release, read through the SAME machine the verdict measures
 * (the scratch root's when the seam is armed — never this process's own
 * /etc/os-release beside a scratch account table).
 */
export function hostOsRelease(): string {
	return reviewMachine().fs.readText('/etc/os-release') ?? '';
}

/** The verdict of `answers` on this host (read-only). */
export async function measureIdentity(
	answers: InstallAnswers,
	row: OsRow,
): Promise<IdentityVerdict> {
	const { runner, fs } = reviewMachine();
	const kind = webKindOf(answers, fs);
	const identity = await gatherIdentityFacts(runner, fs, row, answers);
	const web = await webFacts(runner, fs, row, kind);
	return identityVerdict({
		answers,
		account: identity.account,
		instances: identity.instances,
		taken: identity.taken ?? [],
		webUser: row.web[kind].user,
		sites: web.sites,
	});
}
