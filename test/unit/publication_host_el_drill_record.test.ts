/**
 * THE EL DRILL RECORD RATCHET (engineering/PUBLICATION_HOST_SPEC.md §9.11). Everything SELinux,
 * fapolicyd and a real EL systemd do to the guided install is proven only by the EL drill
 * (`bun run test:pubhost:init:el`, scripts/publication_host_init_drill.ts) on a disposable
 * SELinux-enforcing RHEL/Rocky/Alma VM — no CI runner has an EL kernel. Its `--record`, after a
 * GREEN run, writes engineering/el_drill_record.json; this gate holds the tree to it:
 *
 *   - INPUTS: the record's `inputs_digest` is the digest of TODAY's EL-relevant sources
 *     (`EL_DRILL_INPUTS`, publication/host_agent/src/provision/selinux.ts, read in a child — this
 *     gate imports no agent module), recomputed with the drill's own elDrillInputsDigest. Any
 *     change to one of them is RED until the drill runs again on the VMs and re-records.
 *   - HOSTS: every recorded host was SELinux enforcing; each supported EL major (9, 10) is
 *     recorded, or named in PENDING_EL_HOSTS with its reason. A pending major that the record
 *     now names is a stale row (red): delete it.
 *   - LEGS: the recorded run passed every REQUIRED EL-family leg (legsFor) and skipped none.
 *   - MEASURED: the facts the spec says the drill measures are present (the two booleans, the
 *     home's traverse type, the v1 PHP floor, a systemd version's supported directives).
 *
 * HERMETIC: one file read, one `bun -e` child for the input list, the digest over tracked files.
 */
import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import {
	AGENT_DIR,
	EL_DRILL_RECORD,
	type ElDrillRecord,
	elDrillInputs,
	elDrillInputsDigest,
	legsFor,
	parseDrillArgs,
} from '../../scripts/publication_host_init_drill.ts';

/** Every EL major the guided install supports (owner decision 2026-10-08: the EL family is 9 and 10). */
const SUPPORTED_EL = ['el9', 'el10'] as const;

/**
 * A supported major the record does not name YET — each with why. Shrink-only: the day the drill
 * records that major, its row reddens and is deleted.
 */
const PENDING_EL_HOSTS: Readonly<Record<string, string>> = {
	el10: 'no EL 10 drill VM yet: the first EL drill (2026-10-09) ran on RHEL 9.8 only. Run `bun run test:pubhost:init:el --record` on a disposable SELinux-enforcing RHEL/Rocky/Alma 10 VM (same inputs digest: the host is merged into the record)',
};

const record = (): ElDrillRecord => {
	expect(existsSync(EL_DRILL_RECORD), `${EL_DRILL_RECORD} is missing`).toBe(true);
	return JSON.parse(readFileSync(EL_DRILL_RECORD, 'utf8')) as ElDrillRecord;
};

describe('the EL drill record holds the tree', () => {
	test("INPUTS: the record's digest is today's EL inputs' digest", async () => {
		const inputs = await elDrillInputs();
		expect(inputs.length).toBeGreaterThanOrEqual(10); // anti-vacuity: the spec's list, not an empty one
		expect(inputs).toContain('src/provision/selinux.ts');
		expect(inputs).toContain('deploy/install.sh');
		const today = elDrillInputsDigest(AGENT_DIR, inputs);
		expect(
			record().inputs_digest,
			`an EL drill input changed since the last recorded EL drill (${inputs.join(', ')}). ` +
				'Run `bun run test:pubhost:init:el -- --media-nfs <host:/export> --record` as root on the disposable ' +
				'SELinux-enforcing EL VMs (docs: engineering/PUBLICATION_HOST_SPEC.md §9.11) and commit the new record',
		).toBe(today);
	});

	test('the digest moves with an input (the ratchet is not vacuous)', async () => {
		const inputs = await elDrillInputs();
		expect(elDrillInputsDigest(AGENT_DIR, inputs.slice(1))).not.toBe(
			elDrillInputsDigest(AGENT_DIR, inputs),
		);
	});

	test('HOSTS: enforcing, every supported major recorded or pending — and no stale pending row', () => {
		const { hosts } = record();
		expect(hosts.length).toBeGreaterThan(0);
		for (const host of hosts) {
			expect(host.selinux).toBe('enforcing');
			expect(SUPPORTED_EL as readonly string[]).toContain(host.os);
			expect(host.kernel).toMatch(/\.el(9|10)[._]/);
		}
		const recorded = new Set<string>(hosts.map((host) => host.os));
		const missing = SUPPORTED_EL.filter(
			(os) => !recorded.has(os) && PENDING_EL_HOSTS[os] === undefined,
		);
		expect(missing, 'a supported EL major has no drill record and no pending reason').toEqual([]);
		const stale = Object.keys(PENDING_EL_HOSTS).filter((os) => recorded.has(os));
		expect(stale, 'PENDING_EL_HOSTS rows the record now names — delete them').toEqual([]);
		for (const os of Object.keys(PENDING_EL_HOSTS))
			expect(SUPPORTED_EL as readonly string[]).toContain(os);
	});

	test('LEGS: every required EL-family leg passed, none skipped', () => {
		const args = parseDrillArgs(['--family', 'el', '--in-place']);
		if ('error' in args) throw new Error(args.error);
		const required = legsFor(args)
			.filter((leg) => leg.required)
			.map((leg) => leg.name);
		expect(required).toContain('selinux-labels');
		expect(required).toContain('fapolicyd');
		const { legs, skipped } = record();
		expect(skipped).toEqual([]);
		expect(required.filter((name) => !legs.includes(name))).toEqual([]);
	});

	test('MEASURED: the booleans, the home traverse type, the v1 PHP floor, the supported directives', () => {
		const { measured, sha } = record();
		expect(sha).toMatch(/^[0-9a-f]{40}$/);
		expect(Object.keys(measured.booleans).sort()).toEqual([
			'httpd_can_network_relay',
			'httpd_enable_homedirs',
		]);
		expect(measured.home_traverse_type).toBe('home_root_t');
		expect(measured.v1_php_floor).toMatch(/^\d+\.\d+$/);
		expect(Object.keys(measured.supported_directives).length).toBeGreaterThan(0);
	});
});
