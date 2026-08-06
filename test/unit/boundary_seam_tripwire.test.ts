/**
 * BOUNDARY-SEAM FACADE RULE (S3-02 / DEC-12) — the core→diffusion seam is
 * allowed to grow only through the FACADE, never through internals.
 *
 * Background: diffusion_boundaries.test.ts enforces the dependency DIRECTION
 * (diffusion → core, one dynamic-import seam class). S3-02 documented its
 * erosion mode: the seam allowlist grew, and the new seam imported diffusion
 * INTERNALS (jobs/queue, jobs/scheduler, writers/registry) instead of the
 * src/diffusion/api/ facade — every internal import couples core to module
 * layout the diffusion subsystem is free to change.
 *
 * This gate freezes the seam at IMPORT-SPECIFIER granularity:
 *  - every reference from non-diffusion src/ into src/diffusion/** (static,
 *    type-only, and dynamic alike — type imports still couple core to the
 *    internal layout even if erased at runtime) must be a ledgered pair;
 *  - NEW pairs are legal only when they target the facade (src/diffusion/api/);
 *  - grandfathered internal pairs are listed below with their lifecycle:
 *    the list may only SHRINK.
 *
 * ALLOWLIST LIFECYCLE (DEC-12 refinement — who clears these and when):
 *  - server.ts scheduler/queue/schema wiring: cleared when the diffusion boot
 *    facade lands (WS-C S2-30 re-home — expose one start/stop/health surface
 *    from diffusion/api/).
 *  - widget_request.ts internals: cleared when the in-flight
 *    diffusion_server_control widget work (user WIP) lands and reads through
 *    diffusion/api/info.ts, or when WS-C re-homes the maintenance cluster.
 *  - dispatch.ts plan/compile.ts: cleared when validateElementPlan is
 *    re-exported through diffusion/api/actions.ts.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Glob } from 'bun';

const SRC_DIR = join(import.meta.dir, '..', '..', 'src');

/**
 * The facade subtrees: the only legal targets for NEW core→subsystem imports.
 * One entry per PEER subsystem of src/core (diffusion, external — src/ai is
 * still governed only by the direction gate). Adding a peer subsystem means
 * adding its facade prefix here, or the seam grows through its internals.
 */
const FACADE_PREFIX = new Set(['diffusion/api/', 'external/api/']);

/** The subsystem directories this gate governs, in specifier form. */
const GOVERNED_SUBSYSTEMS = ['diffusion', 'external'];

/**
 * Grandfathered NON-facade pairs (file → set of imported diffusion modules).
 * Shrink-only — see the lifecycle notes in the header. Facade imports
 * (diffusion/api/*) never need an entry.
 */
const GRANDFATHERED_INTERNAL: Record<string, readonly string[]> = {
	'core/area_maintenance/widgets/diffusion_server_control.ts': [
		'diffusion/jobs/queue.ts', // type DiffusionJobRow + dashboard reads
		'diffusion/jobs/scheduler.ts',
		'diffusion/writers/registry.ts',
	],
	// WS-C S2-25: the dd_diffusion_api handlers moved out of dispatch.ts into
	// their class file; the ONE grandfathered internal pair moved with them.
	'core/api/handlers/dd_diffusion_api.ts': [
		'diffusion/plan/compile.ts', // validateElementPlan (facade re-export pending)
	],
	'server.ts': [
		'diffusion/jobs/scheduler.ts', // boot/stop wiring (boot facade pending)
		'diffusion/jobs/schema.ts',
		'diffusion/jobs/queue.ts',
	],
};

/** Any import/export/import() specifier reaching into a governed subsystem. */
const SUBSYSTEM_SPECIFIER = new RegExp(
	`(?:from\\s*|import\\s*\\(\\s*)['"\`]([^'"\`]*\\/(?:${GOVERNED_SUBSYSTEMS.join('|')})\\/[^'"\`]+)['"\`]`,
	'g',
);

interface SeamEdge {
	file: string;
	line: number;
	target: string; // normalized 'diffusion/...' module path
}

function scanSeamEdges(): SeamEdge[] {
	const edges: SeamEdge[] = [];
	const glob = new Glob('**/*.ts');
	const insideSubsystem = new RegExp(`^(?:${GOVERNED_SUBSYSTEMS.join('|')})/`);
	const specifierRoot = new RegExp(`^.*?((?:${GOVERNED_SUBSYSTEMS.join('|')})/)`);
	for (const relativePath of glob.scanSync({ cwd: SRC_DIR })) {
		if (insideSubsystem.test(relativePath)) continue; // inside a governed subsystem
		const text = readFileSync(join(SRC_DIR, relativePath), 'utf8');
		const lines = text.split('\n');
		for (let index = 0; index < lines.length; index++) {
			const lineText = lines[index] as string;
			for (const match of lineText.matchAll(SUBSYSTEM_SPECIFIER)) {
				const specifier = match[1] as string;
				const normalized = specifier.replace(/^(?:\.\.?\/)+/, '').replace(specifierRoot, '$1');
				edges.push({ file: relativePath, line: index + 1, target: normalized });
			}
		}
	}
	return edges;
}

describe('core→subsystem seams are facade-only (S3-02 tripwire)', () => {
	const edges = scanSeamEdges();

	test('every non-facade seam edge is grandfathered (shrink-only list)', () => {
		const violations = edges.filter((edge) => {
			if ([...FACADE_PREFIX].some((prefix) => edge.target.startsWith(prefix))) return false;
			const allowed = GRANDFATHERED_INTERNAL[edge.file];
			return allowed === undefined || !allowed.includes(edge.target);
		});
		expect(
			violations.map((v) => `${v.file}:${v.line} → ${v.target}`),
			'NEW core→diffusion imports must target src/diffusion/api/ (the facade). Internal imports are frozen — route through the facade instead:',
		).toEqual([]);
	});

	test('the grandfather list carries no dead entries (shrink it when cleared)', () => {
		for (const [file, targets] of Object.entries(GRANDFATHERED_INTERNAL)) {
			for (const target of targets) {
				const alive = edges.some((edge) => edge.file === file && edge.target === target);
				expect(
					alive,
					`grandfathered pair no longer present — remove it from the list: ${file} → ${target}`,
				).toBe(true);
			}
		}
	});

	test('every governed facade exists (rule sanity)', () => {
		expect(() => readFileSync(join(SRC_DIR, 'diffusion/api/actions.ts'))).not.toThrow();
		expect(() => readFileSync(join(SRC_DIR, 'external/api/index.ts'))).not.toThrow();
	});
});
