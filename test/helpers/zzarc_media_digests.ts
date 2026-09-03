/**
 * FINGERPRINT OF A SCRATCH MEDIA TREE — the before/after digest map the archive
 * round-trip gate compares (`raw_roundtrip_native`): every file the zzarc
 * situation planted, keyed by root-relative path.
 *
 * Its own module, and NOT a corpus lister: the root is the gate's scratch tree
 * (never a repo directory), and only the gate that fingerprints media imports
 * it — `census_derivation_tripwire` classifies a gate as WALKING through every
 * shared module it imports, so a walk shared with the situation helper would
 * make every zzarc gate a walker owing a floor on a walk it never performs.
 */

import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { sha256File } from '../../src/core/archive/manifest.ts';

/** sha256 of every file under `root` (the test-media marker excluded), keyed by root-relative path. */
export function zzarcMediaDigests(root: string): Map<string, string> {
	const out = new Map<string, string>();
	const walk = (dir: string): void => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const path = join(dir, entry.name);
			if (entry.isDirectory()) walk(path);
			else if (entry.name !== '.dedalo_test_media')
				out.set(path.slice(root.length), sha256File(path));
		}
	};
	if (existsSync(root)) walk(root);
	return out;
}
