/**
 * THE HOST STEPS' TEST SEAMS (terminal installer phase 4, 2026-10-12) — read
 * from the PROCESS environment only (never ../private/.env: a stray line there
 * must never repoint a real install), each one ARMED only by a marker, like
 * DEDALO_TEST_MEDIA_ROOT:
 *
 *  - DEDALO_INSTALL_HOST_ROOT: the HostFs root becomes this directory AND the
 *    runner becomes the RECORDING runner (responses from, and every argv logged
 *    to, `<root>/.dedalo_install_scratch/`) — in the SAME move, so a run can
 *    never write a scratch tree while executing real commands, nor run against
 *    `/` with a fake runner. A root without the marker directory is refused.
 *    What the resume drill drives a subprocess with.
 *  - DEDALO_INSTALL_PROBE_CA_FILE: the trust anchor of the public https probe
 *    — the drill's own CA. Accepted only inside a directory marked
 *    `.dedalo_install_drill` (critique A13): an operator's stray value never
 *    makes the probe trust a certificate the system does not.
 */

import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { processEnvValue } from '../../../config/env.ts';
import { hostRefuse } from './refuse.ts';

export const SCRATCH_MARKER = '.dedalo_install_scratch';
export const DRILL_MARKER = '.dedalo_install_drill';

/** The scratch root seam: null on a real run; the root and its marker dir otherwise. */
export function readHostRootSeam(): { root: string; markerDir: string } | null {
	const raw = processEnvValue('DEDALO_INSTALL_HOST_ROOT') ?? '';
	if (raw === '') return null;
	const root = resolve(raw);
	const markerDir = join(root, SCRATCH_MARKER);
	if (!existsSync(markerDir)) {
		hostRefuse(
			'install.invalid_input',
			`DEDALO_INSTALL_HOST_ROOT=${root} carries no ${SCRATCH_MARKER} marker — the scratch seam refuses an unmarked root`,
		);
	}
	return { root, markerDir };
}

/** Is `path` inside a directory that carries the drill marker? */
function underDrillMarker(path: string): boolean {
	for (let dir = dirname(resolve(path)); ; dir = dirname(dir)) {
		if (existsSync(join(dir, DRILL_MARKER))) return true;
		if (dirname(dir) === dir) return false;
	}
}

/** The drill CA seam: null on a real run; refused outside a marked drill directory. */
export function readProbeCaSeam(): string | null {
	const raw = processEnvValue('DEDALO_INSTALL_PROBE_CA_FILE') ?? '';
	if (raw === '') return null;
	if (!underDrillMarker(raw)) {
		hostRefuse(
			'install.invalid_input',
			`DEDALO_INSTALL_PROBE_CA_FILE=${raw} is not inside a ${DRILL_MARKER}-marked directory — the probe trusts the system CAs only`,
		);
	}
	return resolve(raw);
}
