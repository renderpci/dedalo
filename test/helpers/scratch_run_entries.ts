/**
 * THE SCRATCH RUN LISTING — the entry names a gate's OWN publication run left in
 * a scratch directory the gate itself created (a run directory, a files
 * target). Shared by the diffusion outcome gates (diffusion_resume_ledger_native:
 * the published tree hashed file by file, then its leftover temps;
 * diffusion_target_fence_native: the per-record files a fenced run published), and
 * publication_host_bundle_twin_tripwire (the files the agent's reader extracted from an
 * engine-written bundle into the gate's own mkdtemp dir).
 *
 * NOT a corpus: the CALLER hands its own scratch root, and this module never
 * names a repo tree — registered in census_derivation_tripwire SHARED_LISTERS
 * with no roots, like test/helpers/zzarc_media_digests.ts.
 */

import { readdirSync } from 'node:fs';

/** Every entry name directly under `dir`, sorted (a missing directory throws, as readdirSync does). */
export function scratchRunEntries(dir: string): string[] {
	return readdirSync(dir).sort();
}
