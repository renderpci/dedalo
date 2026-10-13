/**
 * Host facts for the terminal installer's probe screen (probes.ts; DEC-19).
 * COSMETIC ONLY — the real progression gate is init_test.result. Only
 * TS-MEANINGFUL facts are emitted: the PHP/Apache-specific checkers
 * (php_version, apache_version, memory_limit, php_memory, max_execution_time,
 * php_user, gd, mbstring) were removed (WC-2026-07-09-installer-diagnostics-grid)
 * — the Bun server has no PHP.
 */

import { statfsSync } from 'node:fs';
import { arch, cpus, freemem, platform, totalmem } from 'node:os';
import { liveProcessEnv } from '../../config/env.ts';
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

/**
 * The processor in words: count × clock, the model when the clock is not
 * reported (aarch64 Linux reports speed 0 — campaign 3 C3-49: that read as an
 * "unknown" WARNING), else the count alone. Never null when a core is listed.
 */
export function processorText(cores: readonly { model: string; speed: number }[]): string | null {
	const first = cores[0];
	if (first === undefined) return null;
	const count = `${cores.length} core${cores.length === 1 ? '' : 's'}`;
	if (first.speed > 0) return `${cores.length} × ${(first.speed / 1000).toFixed(2)} GHz`;
	const model = first.model.trim();
	return model === '' || model === 'unknown'
		? `${count} (the clock is not reported on this architecture)`
		: `${count}, ${model}`;
}

/** Version string of a binary via `<bin> -version`/`--version`, or null. */
function binVersion(bin: string, flag: string): string | null {
	try {
		const proc = Bun.spawnSync([bin, flag], {
			stdout: 'pipe',
			stderr: 'pipe',
			// Explicit: Bun's default env is the ORIGINAL environ (config/env.ts liveProcessEnv).
			env: liveProcessEnv(),
		});
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

	const cpuMhz = processorText(cpus());

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
