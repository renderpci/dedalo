/**
 * THE ISOLATION A DEVELOPER-ROUTE INSTALL RUN BY A TEST GIVES ITS SERVE CHECK.
 *
 * A developer install's last step (verify_dev_server — src/core/install/dev_serve.ts)
 * boots the REAL server once through `bun run dev`, from the install's own
 * written `.env` (DEDALO_PRIVATE_DIR = the scratch private dir), and inherits
 * every other key from the installer's environment — exactly as the
 * operator's shell would hand it. In a test that environment is the SUITE's,
 * so a gate that runs the real CLI must give the install's server what a
 * second server on this machine needs, or it collides with the suite (and a
 * developer's running `bun run dev`):
 *
 *  - its own unix socket (the default /tmp/dedalo_ts.sock may be a running
 *    `bun run dev` here: the double-start guard would refuse the boot);
 *  - its own marked media root + export store: the suite's would be claimed by
 *    this server's boot sweep for ANOTHER database, and every later export
 *    gate refused as a foreign install;
 *  - its own marked processes dir; no diffusion scheduler, no GeoIP download;
 *  - DEDALO_TEST_DB_DISABLE=true: the scratch .env names the disposable
 *    scratch install database as THE application database, which the suite
 *    guard's rule 2 (src/config/suite_database.ts) would refuse — the same
 *    explicit opt-out install_tld_provenance_native gives its booted server,
 *    for the same disposable `<prefix><pid>` database. The installer process
 *    itself targets that database by its own --db-name already.
 *
 * Everything lives in a scratch dir of its own — OUTSIDE the install's private
 * dir, whose listing the install gates compare — removed when the test
 * process exits. Writes only the declared markers (the media helpers' doors).
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { markExportArtifactsRoot, markMediaRoot } from './media_scratch_root.ts';
import { markProcessesDir } from './test_media_root.ts';

/** This process's scratch dirs, removed by ONE exit hook (a drill asks for many). */
const made: string[] = [];

/** The env a test hands a developer-route install CLI (see the header); one scratch dir per call. */
export function devServeIsolationEnv(): Record<string, string> {
	// Short: macOS caps a unix socket path at 104 bytes.
	const dir = mkdtempSync(join(tmpdir(), 'zzserve_'));
	if (made.length === 0) {
		process.once('exit', () => {
			for (const path of made) rmSync(path, { recursive: true, force: true });
		});
	}
	made.push(dir);
	const media = markMediaRoot(join(dir, 'media'));
	markExportArtifactsRoot(`${media}.export_artifacts`);
	return {
		SERVER_UNIX_SOCKET: join(dir, 's.sock'),
		DEDALO_TEST_MEDIA_ROOT: media,
		DEDALO_MEDIA_PROCESSES_DIR: markProcessesDir(join(dir, 'processes')),
		DEDALO_DIFFUSION_SCHEDULER_ENABLED: 'false',
		DEDALO_GEOIP_ENABLED: 'false',
		DEDALO_TEST_DB_DISABLE: 'true',
	};
}
