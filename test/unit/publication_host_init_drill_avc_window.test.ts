/**
 * THE INIT DRILL'S AVC WINDOWS ARE FLOORED (closure review cross-diffusion:r4,
 * S3 "init drill 'no-avc' leg has no floor: a window that reads nothing passes
 * green").
 *
 * 1. no-avc read `ausearch -ts <this machine's local time>` — a time with no
 *    date, on the DRIVER's clock — and passed when no foreign AVC line was in
 *    the window. A window that read nothing (another timezone, a wrong day, a
 *    dead auditd) passed exactly like a clean one. Now the window must hold the
 *    one denial the drill causes on purpose (system-layout-v2's control), and
 *    the start is the TARGET's clock, date and time (`date +'%F %T|%x %T'`).
 * 2. booleans-measured recorded httpd_can_network_relay OFF without checking
 *    that the proxy probe logged the AVC its `what` promises — a probe window
 *    that read nothing recorded `denied_without: false` as a measurement. Now
 *    OFF without an AVC fails the leg.
 * 3. (cross-diffusion:r5) no-avc excused EVERY name_connect AVC of the whole
 *    drill, not only the booleans leg's relay probe: a name_connect denial at
 *    any other moment passed green. Now a name_connect is excused only when its
 *    own audit time falls inside the booleans leg's span (target clock).
 * 4. (cross-diffusion:r5) no-apparmor-denial floored only the JOURNAL read; the
 *    auditd read (where the kernel's denials go with auditd running) was
 *    appended with 2>/dev/null, so a failed or empty audit read passed green.
 *    Now the audit half has its own floor and a failed read is red.
 *
 * HERMETIC: the verdicts are pure; no VM. The live half (ausearch accepting the
 * target's `%x %T`; the audit log's SERVICE_START/STOP naming our units) is
 * measured by the drill itself on an EL / Debian VM.
 */

import { describe, expect, test } from 'bun:test';
import {
	auditHalfVerdict,
	booleanProbeVerdict,
	noAvcVerdict,
	parseTargetStart,
	SELINUX_CONTROL_DIR,
	SELINUX_CONTROL_FILE,
} from '../../scripts/publication_host_init_drill.ts';

const CONTROL_AVC = `type=AVC msg=audit(1761040000.123:456): avc:  denied  { read } for  pid=1234 comm="httpd" name="${SELINUX_CONTROL_FILE}" dev="vda1" ino=42 scontext=system_u:system_r:httpd_t:s0 tcontext=system_u:object_r:dedalo_publication_v2_t:s0 tclass=file permissive=0`;
const CONTROL_GETATTR = `type=AVC msg=audit(1761040000.120:455): avc:  denied  { getattr } for  pid=1234 comm="httpd" path="${SELINUX_CONTROL_DIR}/${SELINUX_CONTROL_FILE}" scontext=system_u:system_r:httpd_t:s0 tcontext=system_u:object_r:dedalo_publication_v2_t:s0 tclass=file permissive=0`;
const RELAY_AVC =
	'type=AVC msg=audit(1761040001.000:460): avc:  denied  { name_connect } for  pid=1234 comm="httpd" dest=8080 scontext=system_u:system_r:httpd_t:s0 tcontext=system_u:object_r:http_cache_port_t:s0 tclass=tcp_socket permissive=0';
const FOREIGN_AVC =
	'type=AVC msg=audit(1761040002.000:470): avc:  denied  { write } for  pid=99 comm="php-fpm" name="sessions" scontext=system_u:system_r:httpd_t:s0 tcontext=unconfined_u:object_r:user_home_t:s0 tclass=dir permissive=0';
const SEPARATOR = '----';
/** The booleans leg's span, holding RELAY_AVC (1761040001). */
const BOOLEANS = { from: 1761040001, to: 1761040001 };
const STRAY_CONNECT =
	'type=AVC msg=audit(1761049999.000:900): avc:  denied  { name_connect } for  pid=77 comm="php-fpm" dest=5432 scontext=system_u:system_r:httpd_t:s0 tcontext=system_u:object_r:postgresql_port_t:s0 tclass=tcp_socket permissive=0';

describe('no-avc: the window is floored on the control denial', () => {
	test('a window holding only the control (and the booleans leg) is clean', () => {
		expect(
			noAvcVerdict([SEPARATOR, CONTROL_GETATTR, CONTROL_AVC, RELAY_AVC].join('\n'), true, BOOLEANS),
		).toBe(null);
	});

	test('a window that read NOTHING is refused, not green', () => {
		const verdict = noAvcVerdict('<no matches>\n', true, BOOLEANS);
		expect(verdict).not.toBe(null);
		expect(String(verdict)).toContain('the window read nothing');
	});

	test('a window with denials but WITHOUT the control read the wrong span: refused', () => {
		expect(String(noAvcVerdict(RELAY_AVC, true, BOOLEANS))).toContain('the window read nothing');
	});

	test('no measured control: no floor, so no green', () => {
		const verdict = noAvcVerdict([CONTROL_AVC].join('\n'), false, BOOLEANS);
		expect(String(verdict)).toContain('no floor');
	});

	test('a foreign denial beside the control is reported', () => {
		const verdict = noAvcVerdict([CONTROL_AVC, FOREIGN_AVC].join('\n'), true, BOOLEANS);
		expect(String(verdict)).toContain('AVC denials during the drill');
		expect(String(verdict)).toContain('php-fpm');
	});

	test('a name_connect OUTSIDE the booleans span is reported', () => {
		const verdict = noAvcVerdict(
			[CONTROL_AVC, RELAY_AVC, STRAY_CONNECT].join('\n'),
			true,
			BOOLEANS,
		);
		expect(String(verdict)).toContain('AVC denials during the drill');
		expect(String(verdict)).toContain('dest=5432');
		expect(String(verdict)).not.toContain('dest=8080');
	});

	test('no recorded booleans span: no name_connect is excused', () => {
		expect(String(noAvcVerdict([CONTROL_AVC, RELAY_AVC].join('\n'), true, null))).toContain(
			'dest=8080',
		);
	});

	test('a name_connect with no readable audit time is reported', () => {
		const untimed = RELAY_AVC.replace(/msg=audit\([^)]*\)/, 'msg=audit(10/21/26 12:00:01.000:460)');
		expect(String(noAvcVerdict([CONTROL_AVC, untimed].join('\n'), true, BOOLEANS))).toContain(
			'AVC denials during the drill',
		);
	});
});

describe('no-apparmor-denial: the audit half is floored on its own', () => {
	const FLOOR_OK = {
		code: 0,
		out: 'type=SERVICE_START msg=audit(1761040003.000:500): pid=1 uid=0 auid=4294967295 ses=4294967295 msg=\'unit=dedalo-publication-host-agent@pub comm="systemd" exe="/usr/lib/systemd/systemd" res=success\'\n',
	};
	const NO_MATCHES = { code: 1, out: '<no matches>\n' };

	test('our units in the audit log + no AVC records: measured clean', () => {
		expect(auditHalfVerdict(FLOOR_OK, NO_MATCHES)).toBe(null);
		expect(
			auditHalfVerdict(FLOOR_OK, { code: 0, out: 'type=AVC msg=audit(1:2): apparmor="DENIED"\n' }),
		).toBe(null);
	});

	test('an audit window without our units read nothing: refused', () => {
		expect(String(auditHalfVerdict(NO_MATCHES, NO_MATCHES))).toContain('its window read nothing');
		expect(
			String(
				auditHalfVerdict(
					{ code: 0, out: "type=SERVICE_START msg=audit(1:2): msg='unit=cron'\n" },
					NO_MATCHES,
				),
			),
		).toContain('its window read nothing');
	});

	test('a failed AVC read is red, never a clean one', () => {
		const verdict = auditHalfVerdict(FLOOR_OK, {
			code: 1,
			out: 'Error opening /var/log/audit/audit.log\n',
		});
		expect(String(verdict)).toContain('the audit half was not read');
		expect(String(auditHalfVerdict(FLOOR_OK, { code: 10, out: '' }))).toContain('not read');
	});
});

describe('booleans-measured: OFF must measure the relay denial', () => {
	const RELAY = 'httpd_can_network_relay';
	const HOMEDIRS = 'httpd_enable_homedirs';
	const V2 = '/dedalo/publication/server_api/v2/';
	const V1 = '/dedalo/publication/server_api/v1/probe.php';

	test('relay: ON clean, OFF denied — measured', () => {
		expect(booleanProbeVerdict(RELAY, V2, { status: 200, avcs: 0 }, { status: 503, avcs: 1 })).toBe(
			null,
		);
	});

	test('relay: OFF without an AVC measured nothing — refused', () => {
		const verdict = booleanProbeVerdict(
			RELAY,
			V2,
			{ status: 200, avcs: 0 },
			{ status: 200, avcs: 0 },
		);
		expect(String(verdict)).toContain('the measurement proves nothing');
	});

	test('ON still denied is refused (both booleans)', () => {
		for (const [name, probe] of [
			[RELAY, V2],
			[HOMEDIRS, V1],
		] as const) {
			expect(
				String(
					booleanProbeVerdict(name, probe, { status: 200, avcs: 2 }, { status: 200, avcs: 2 }),
				),
			).toContain('still logged 2 AVC');
		}
	});

	test('homedirs: ON must answer 200; OFF may stay 200 without an AVC (the H rule)', () => {
		expect(
			String(booleanProbeVerdict(HOMEDIRS, V1, { status: 404, avcs: 0 }, { status: 404, avcs: 0 })),
		).toContain('answered 404');
		expect(
			booleanProbeVerdict(HOMEDIRS, V1, { status: 200, avcs: 0 }, { status: 200, avcs: 0 }),
		).toBe(null);
	});
});

describe('the drill start is the TARGET clock, date and time', () => {
	test('both forms of one instant are parsed', () => {
		expect(parseTargetStart('2026-10-21 12:34:56|10/21/26 12:34:56\n')).toEqual({
			startedAt: '2026-10-21 12:34:56',
			auditStartedAt: '10/21/26 12:34:56',
		});
	});

	test('a time without a date, or a failed date call, is refused', () => {
		expect(() => parseTargetStart('12:34:56')).toThrow("the target's clock answered");
		expect(() => parseTargetStart('2026-10-21 12:34:56|12:34:56')).toThrow(
			"the target's clock answered",
		);
		expect(() => parseTargetStart('')).toThrow("the target's clock answered");
	});
});
