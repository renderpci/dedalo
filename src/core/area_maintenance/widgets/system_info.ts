/**
 * system_info widget — TS-NATIVE host/runtime snapshot; replaces the PHP Linfo
 * panel. Produces the EXACT shape the client renderer (render_system_info.js)
 * consumes: { requeriments_list:[{name,value,info}], system_list:[{name,value}],
 * errors:[] }. The client's health_list sub-panel is fired browser-side (no
 * server data). Fails soft: a probe failure becomes a requirement row / error
 * string, never a throw.
 */

import { sql } from '../../db/postgres.ts';
import type { WidgetModule, WidgetResponse } from './support.ts';

/** Human GB from a byte count (2 decimals), matching the PHP panel style. */
function bytesToGb(bytes: number): string {
	return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

/** Semver-ish compare (major.minor.patch); returns -1 | 0 | 1. */
function compareSemver(a: string, b: string): number {
	const pa = a.split('.').map(Number);
	const pb = b.split('.').map(Number);
	for (let i = 0; i < 3; i++) {
		const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
		if (diff !== 0) return diff > 0 ? 1 : -1;
	}
	return 0;
}

async function systemInfoGetValue(): Promise<WidgetResponse> {
	const os = await import('node:os');
	const errors: string[] = [];

	// --- system_list: OS / hardware overview (labels mirror the PHP Linfo panel) ---
	const system_list: { name: string; value: unknown }[] = [];
	system_list.push({ name: 'os', value: `${os.type()} ${os.release()} (${os.arch()})` });
	system_list.push({ name: 'hostname', value: os.hostname() });
	const cpus = os.cpus();
	system_list.push({
		name: 'cpu',
		value: cpus.length > 0 ? `${(cpus[0]?.model ?? '').trim()} × ${cpus.length}` : null,
	});
	system_list.push({
		name: 'ram',
		value: `${bytesToGb(os.totalmem() - os.freemem())} used / ${bytesToGb(os.totalmem())} total`,
	});
	// disk free on the server working directory (best-effort; statfs may be absent)
	try {
		const { statfsSync } = await import('node:fs');
		const stat = statfsSync(process.cwd());
		const total = Number(stat.blocks) * Number(stat.bsize);
		const free = Number(stat.bfree) * Number(stat.bsize);
		system_list.push({ name: 'hd', value: `${bytesToGb(free)} free / ${bytesToGb(total)} total` });
	} catch {
		system_list.push({ name: 'hd', value: null });
	}
	system_list.push({ name: 'uptime', value: `${Math.round(os.uptime() / 3600)} h` });
	system_list.push({
		name: 'load',
		value: os
			.loadavg()
			.map((n) => n.toFixed(2))
			.join(' '),
	});
	system_list.push({ name: 'engine', value: `bun ${Bun.version}` });

	// --- requeriments_list: Bun-native prerequisite checks ---
	const requeriments_list: { name: string; value: boolean | string | null; info: string }[] = [];

	// The actually-verified runtime floor (audit S2-36): postgres.ts, the Bun.sql
	// mariadb adapter and the jsonb param conventions are verified against 1.3.9.
	// Keep in lockstep with .bun-version + package.json engines.bun.
	const MIN_BUN = '1.3.9';
	requeriments_list.push({
		name: 'Bun supported version',
		value: compareSemver(Bun.version, MIN_BUN) >= 0,
		info: `Version: ${Bun.version} - minimum: ${MIN_BUN}`,
	});

	let dbOk = false;
	try {
		await sql.unsafe('SELECT 1', []);
		dbOk = true;
	} catch (error) {
		errors.push(`Database connection failed: ${(error as Error).message}`);
	}
	requeriments_list.push({
		name: 'Database reachable',
		value: dbOk,
		info: dbOk ? 'PostgreSQL responded to SELECT 1' : 'PostgreSQL did not respond',
	});

	try {
		const { getBackupDir } = await import('../backup.ts');
		const { accessSync, constants } = await import('node:fs');
		const dir = getBackupDir();
		accessSync(dir, constants.W_OK);
		requeriments_list.push({ name: 'Backup directory writable', value: true, info: dir });
	} catch (error) {
		requeriments_list.push({
			name: 'Backup directory writable',
			value: false,
			info: (error as Error).message,
		});
	}

	return {
		result: { requeriments_list, system_list, errors },
		msg: 'OK. Request done successfully',
		errors: [],
	};
}

export const widget: WidgetModule = {
	spec: {
		id: 'system_info',
		category: 'system',
		class: 'width_100',
		background: true,
		label: { kind: 'literal', text: 'System info' },
	},
	getValue: systemInfoGetValue,
};
