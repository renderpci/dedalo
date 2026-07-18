/**
 * Install-wizard SMTP probe — hermetic contract: validation refuses without
 * touching the network, and a transport failure (loopback refused port — no
 * external network involved) reports {result:false} instead of throwing.
 */

import { describe, expect, test } from 'bun:test';
import { testMailerConnection } from '../../src/core/install/mailer_probe.ts';

describe('install mailer probe', () => {
	test('missing smtp_host → refused before any connection', async () => {
		const r = await testMailerConnection({});
		expect(r.result).toBe(false);
		expect(r.msg).toBe('SMTP host is required');
	});

	test('blank smtp_host → refused too', async () => {
		const r = await testMailerConnection({ smtp_host: '   ' });
		expect(r.result).toBe(false);
	});

	test('unreachable relay (loopback refused port) → {result:false}, never throws', async () => {
		const r = await testMailerConnection({
			smtp_host: '127.0.0.1',
			smtp_port: 1, // nothing listens here; connect is refused immediately
			smtp_secure: 'none',
		});
		expect(r.result).toBe(false);
		expect(r.msg).toStartWith('SMTP connection failed:');
	});
});
