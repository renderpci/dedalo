/**
 * Diagnostics grid cards for the install wizard (DEC-19, TS-native installer).
 * COSMETIC ONLY — the real progression gate is init_test.result. Only
 * TS-MEANINGFUL facts are emitted: the PHP/Apache-specific checkers
 * (php_version, apache_version, memory_limit, php_memory, max_execution_time,
 * php_user, gd, mbstring) were REMOVED from both this payload and the installer
 * client's grid (WC-006) — the Bun server has no PHP, so they were always '—'.
 */

import { statfsSync } from 'node:fs';
import { arch, cpus, freemem, platform, totalmem } from 'node:os';
import { resolvePgBinary } from './pg_bin.ts';

export interface InstallServerInfo {
	server_software: string;
	platform: string;
	ram: string | null;
	cpu_mhz: string | null;
	disk_free_space: string | null;
	pg_version: string | null;
	imagemagick: string | null;
	imagemagick_supported: boolean;
	ffmpeg: string | null;
	ffmpeg_supported: boolean;
	curl: boolean;
	openssl: boolean;
}

function humanBytes(bytes: number): string {
	if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
	if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
	return `${bytes} bytes`;
}

/** Version string of a binary via `<bin> -version`/`--version`, or null. */
function binVersion(bin: string, flag: string): string | null {
	try {
		const proc = Bun.spawnSync([bin, flag], { stdout: 'pipe', stderr: 'pipe' });
		if (proc.exitCode !== 0) return null;
		const out = (proc.stdout.toString() || proc.stderr.toString()).split('\n')[0]?.trim();
		return out && out.length > 0 ? out : null;
	} catch {
		return null;
	}
}

/** Build the diagnostics grid for the install context (all best-effort). */
export function buildInstallServerInfo(): InstallServerInfo {
	let diskFree: string | null = null;
	try {
		const stat = statfsSync('/');
		diskFree = humanBytes(stat.bavail * stat.bsize);
	} catch {
		diskFree = null;
	}

	const psql = resolvePgBinary('psql');
	const pgVersion = binVersion(psql, '--version');
	const magick = binVersion('magick', '--version') ?? binVersion('convert', '--version');
	const ffmpeg = binVersion('ffmpeg', '-version');

	const cores = cpus();
	const cpuMhz =
		cores.length > 0 && cores[0]?.speed
			? `${cores.length} × ${(cores[0].speed / 1000).toFixed(2)} GHz`
			: null;

	return {
		server_software: `Bun ${Bun.version} (${platform()}/${arch()})`,
		platform: `${platform()} ${arch()}`,
		ram: `${humanBytes(freemem())} free / ${humanBytes(totalmem())} total`,
		cpu_mhz: cpuMhz,
		disk_free_space: diskFree,
		pg_version: pgVersion,
		imagemagick: magick,
		imagemagick_supported: magick !== null,
		ffmpeg,
		ffmpeg_supported: ffmpeg !== null,
		curl: true, // Bun ships fetch; curl-equivalent always available
		openssl: true, // Bun ships WebCrypto + node:crypto
	};
}
