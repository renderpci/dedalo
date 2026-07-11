/**
 * TZ-independence gate for the dashboard date window (WS-F item 5).
 *
 * bun test forces TZ=UTC while PHP runs DEDALO_TIMEZONE wall-clock; the old
 * host-local date derivation made the area_dashboard differential red between
 * 00:00 and 02:00 CEST. The window must now derive from config.timezone via
 * Intl: two subprocesses pinned to OPPOSITE-extreme host timezones (UTC+14 /
 * UTC-11 — always different host calendar dates) must produce the IDENTICAL
 * window, equal to the DEDALO_TIMEZONE calendar date.
 */

import { describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';

const PROBE = `
const { metricActivity } = await import('${import.meta.dir}/../../src/core/area/dashboard.ts');
const payload = await metricActivity(['rsc167'], 30);
console.log(JSON.stringify({ date_from: payload?.date_from, date_to: payload?.date_to }));
process.exit(0);
`;

async function windowUnderTz(tz: string): Promise<{ date_from: string; date_to: string }> {
	const probe = Bun.spawn(['bun', '-e', PROBE], {
		env: { ...process.env, TZ: tz },
		stdout: 'pipe',
		stderr: 'pipe',
	});
	const exitCode = await probe.exited;
	const out = await new Response(probe.stdout).text();
	if (exitCode !== 0) {
		throw new Error(`probe under TZ=${tz} failed: ${await new Response(probe.stderr).text()}`);
	}
	const lastLine = out.trim().split('\n').at(-1) ?? '';
	return JSON.parse(lastLine) as { date_from: string; date_to: string };
}

describe('dashboard date window is DEDALO_TIMEZONE-derived (runner-TZ immune)', () => {
	test('UTC+14 and UTC-11 runners produce the identical DEDALO_TIMEZONE window', async () => {
		const [east, west] = await Promise.all([
			windowUnderTz('Pacific/Kiritimati'), // UTC+14
			windowUnderTz('Pacific/Midway'), // UTC-11
		]);
		expect(east).toEqual(west);

		// And it is the DEDALO_TIMEZONE calendar date, not any host date.
		const expectedToday = new Intl.DateTimeFormat('en-CA', {
			timeZone: config.timezone,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
		}).format(new Date());
		expect(east.date_to).toBe(expectedToday);
		expect(east.date_from < east.date_to).toBe(true);
	}, 60000);
});
