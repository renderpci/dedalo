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
 *   - LEGS: EACH host's recorded run passed every REQUIRED EL-family leg (legsFor), skipped none.
 *   - MEASURED: EACH host carries the facts the spec says the drill measures (the two booleans,
 *     the home's traverse type, the v1 PHP floor, its systemd's supported directives) — its own:
 *     a host is one run on one VM (its sha, its time), and recording one major never rewrites
 *     another's (mergeRecord, judged here on synthetic records).
 *
 * HERMETIC: one file read, one `bun -e` child for the input list, the digest over tracked files.
 */
import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import {
	AGENT_DIR,
	EL_DRILL_RECORD,
	type ElDrillRecord,
	type ElHost,
	elDrillInputs,
	elDrillInputsDigest,
	legsFor,
	mergeRecord,
	parseDrillArgs,
} from '../../scripts/publication_host_init_drill.ts';

/** Every EL major the guided install supports (owner decision 2026-10-08: the EL family is 9 and 10). */
const SUPPORTED_EL = ['el9', 'el10'] as const;

/**
 * A supported major the record does not name YET — each with why. Shrink-only: the day the drill
 * records that major, its row reddens and is deleted.
 */
const PENDING_EL_HOSTS: Readonly<Record<string, string>> = {};

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

	test('LEGS: every host passed every required EL-family leg, none skipped', () => {
		const args = parseDrillArgs(['--family', 'el', '--in-place']);
		if ('error' in args) throw new Error(args.error);
		const required = legsFor(args)
			.filter((leg) => leg.required)
			.map((leg) => leg.name);
		expect(required).toContain('selinux-labels');
		expect(required).toContain('fapolicyd');
		for (const host of record().hosts) {
			expect(host.skipped, `${host.os} skipped legs`).toEqual([]);
			expect(
				required.filter((name) => !host.legs.includes(name)),
				`${host.os} did not pass`,
			).toEqual([]);
		}
	});

	test('MEASURED: per host, the booleans, the home traverse type, the v1 PHP floor, the supported directives', () => {
		for (const host of record().hosts) {
			const { measured, sha, at } = host;
			expect(sha, `${host.os} sha`).toMatch(/^[0-9a-f]{40}$/);
			expect(Number.isNaN(Date.parse(at)), `${host.os} at`).toBe(false);
			expect(Object.keys(measured.booleans).sort()).toEqual([
				'httpd_can_network_relay',
				'httpd_enable_homedirs',
			]);
			expect(measured.home_traverse_type, `${host.os} home traverse type`).toBe('home_root_t');
			expect(measured.v1_php_floor, `${host.os} v1 PHP floor`).toMatch(/^\d+\.\d+$/);
			expect(Object.keys(measured.supported_directives).length).toBeGreaterThan(0);
		}
		const majors = record().hosts.map((host) => host.os);
		expect(new Set(majors).size, 'one entry per EL major').toBe(majors.length);
	});
});

/** A synthetic host entry (mergeRecord is pure: no VM, no file). */
const host = (os: ElHost['os'], sha: string, php: string): ElHost => ({
	os,
	id: 'rhel',
	version: os === 'el9' ? '9.8' : '10.2',
	kernel: os === 'el9' ? '5.14.0-1.el9_8.aarch64' : '6.12.0-1.el10_2.aarch64',
	selinux: 'enforcing',
	sha: sha.repeat(40),
	at: '2026-10-09T00:00:00.000Z',
	measured: {
		booleans: {},
		supported_directives: { [os]: [] },
		home_traverse_type: 'home_root_t',
		system_default_readable: null,
		v1_php_floor: php,
		nginx_floor: null,
	},
	legs: ['fresh-converge'],
	skipped: [],
});

describe('mergeRecord: one major recorded never rewrites another', () => {
	const el9 = host('el9', 'a', '8.1');
	const el10 = host('el10', 'b', '8.3');

	test('same digest: the new major is added, the other entry kept byte for byte', () => {
		const merged = mergeRecord(
			{ inputs_digest: 'd', hosts: [el9] },
			{ inputs_digest: 'd', hosts: [el10] },
		);
		expect(merged.hosts.map((h) => h.os)).toEqual(['el10', 'el9']);
		expect(merged.hosts.find((h) => h.os === 'el9')).toEqual(el9);
		expect(merged.hosts.find((h) => h.os === 'el10')).toEqual(el10);
	});

	test('same digest, same major: the run replaces that entry only', () => {
		const again = host('el10', 'c', '8.3');
		const merged = mergeRecord(
			{ inputs_digest: 'd', hosts: [el9, el10] },
			{ inputs_digest: 'd', hosts: [again] },
		);
		expect(merged.hosts.find((h) => h.os === 'el10')?.sha).toBe('c'.repeat(40));
		expect(merged.hosts.find((h) => h.os === 'el9')).toEqual(el9);
	});

	test('another digest: a fresh record — every host must be measured again', () => {
		const merged = mergeRecord(
			{ inputs_digest: 'old', hosts: [el9] },
			{ inputs_digest: 'new', hosts: [el10] },
		);
		expect(merged).toEqual({ inputs_digest: 'new', hosts: [el10] });
	});
});
