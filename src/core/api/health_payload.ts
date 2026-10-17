/**
 * THE /health BODY — pure, so the contract it carries can be gated without
 * booting a server (server.ts owns the status code and the DB probe).
 *
 * WHY IT IS ITS OWN MODULE (2026-08-24). This payload is not only a liveness
 * ping: it is the ONLY thing the code-update panel can still read across the
 * restart it just triggered — the job-frame stream dies with the process by
 * design. The panel's "updated vs rolled back" verdict is computed from these
 * bytes, so they are a client contract, and a client contract with no gate is
 * how `version` came to be the verdict for an install where the version cannot
 * change (the dev channel). `install_digest` is the token that does move.
 *
 * Leaf module: no config, no DB, no fs.
 */

import type { ReleaseKind } from '../update/release_identity.ts';

export interface HealthPayload {
	result: 'ok' | 'error';
	entity: string;
	/**
	 * The running engine's RELEASE IDENTITY (release_identity.ts): `X.Y.Z` for an
	 * exact stable tag, `X.Y.Z-(alpha|beta|rc).N` for an exact prerelease tag,
	 * `X.Y.Z.dev` for anything untagged (WC-2026-10-15-release-identity-from-tag).
	 * Opaque to a reader that orders: the data triple is never parsed out of it.
	 */
	version: string;
	/**
	 * Which of the three kinds `version` is — so a reader never infers it from
	 * the string's shape. OPTIONAL on the wire: a server predating the release
	 * identity omits it, and a mid-restart poll may still be talking to one.
	 */
	release_kind?: ReleaseKind;
	db: 'ok' | 'down';
	/**
	 * sha256 of the archive this tree was installed from (install_stamp.ts), or
	 * null on a dev checkout / an install predating stamps. ALWAYS present: a
	 * client that cannot tell "no digest" from "key absent" would read a missing
	 * key as a changed one. It names a public archive published next to its own
	 * `.sha256` sidecar, so it discloses nothing the release URL does not.
	 */
	install_digest: string | null;
	request_id: string;
	/** Dev-mode-only, opaque; present only when a fingerprint was computed. */
	test_database?: string | null;
}

export function buildHealthPayload(options: {
	dbOk: boolean;
	entity: string;
	version?: string;
	releaseKind?: ReleaseKind;
	installDigest: string | null;
	requestId: string;
	testDatabase?: string | null;
}): HealthPayload {
	return {
		result: options.dbOk ? 'ok' : 'error',
		entity: options.entity,
		version: options.version ?? '',
		...(options.releaseKind === undefined ? {} : { release_kind: options.releaseKind }),
		db: options.dbOk ? 'ok' : 'down',
		install_digest: options.installDigest,
		request_id: options.requestId,
		...(options.testDatabase === undefined ? {} : { test_database: options.testDatabase }),
	};
}
