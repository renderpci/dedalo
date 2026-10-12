/**
 * INSTALL STATE — is this box installed, and if not, why does the server refuse to start?
 *
 * Since 2026-10-12 (terminal installer phase 5,
 * `engineering/wire_contract/WC-2026-10-12-install-surface-removed.md`) there is ONE
 * installer, in the terminal (`./install.sh` / `bun run dedalo:install`). A server never
 * serves an install surface: a box that is not installed REFUSES TO START, binds nothing,
 * and exits NOT_INSTALLED_EXIT_CODE — a code the supervisors are told never to restart.
 *
 * Lifted out of `config.ts` so the question can be asked WITHOUT importing the frozen
 * config: building that object throws on a half-configured box. Three readers need it on a
 * box with no `.env`: the catalog readers (sentinels, so `config:gen` in CI and the install
 * probe child can import `config`), and `server.ts` (the refusal below, asked before any
 * listener, DB work or file write). This module depends on `env.ts` and nothing else.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { privateDir, readEnv } from './env.ts';

/**
 * The four keys whose absence means "nothing has been configured yet".
 *
 * FROZEN at four by `config_docs_tripwire`: widening the unconfigured test changes which
 * boxes refuse to start and which boot on sentinels — a decision, never a drive-by edit.
 * The catalog marks the same four with `installGate: true`.
 */
export const REQUIRED_CONFIG_KEYS = ['ENTITY', 'DB_NAME', 'DB_HOST', 'DB_USER'] as const;

/**
 * The exit code of a server that refused to start because the box is not installed (or its
 * configuration is missing, or an install is unfinished). BSD sysexits `EX_CONFIG` (78):
 * "something was found in an unconfigured or misconfigured state". Distinct from 75
 * (`EX_TEMPFAIL`, the planned-restart code the supervisor loops respawn on), from 1 (a
 * crash) and from 0 (a clean stop). The systemd units carry `RestartPreventExitStatus=78`:
 * restarting a box that is not installed only fills the journal.
 */
export const NOT_INSTALLED_EXIT_CODE = 78;

/**
 * True when EVERY required key is unset or empty (environment plus `<private>/.env`).
 * Partial config (1–3 of the 4) is false: that box is MISCONFIGURED, and the normal
 * `requireEnv` path throws the precise "missing key" error at the `config` import. The
 * seal is deliberately NOT consulted (unlike the retired INSTALL_MODE): a sealed box whose
 * `.env` was lost must still reach `notInstalledRefusal`, not throw at import.
 */
export const UNCONFIGURED: boolean = REQUIRED_CONFIG_KEYS.every((key) => {
	const value = readEnv(key);
	return value === undefined || value === '';
});

/**
 * The raw `install_status` from the state file, read WITHOUT importing the core state
 * module (config is the lowest layer and must not depend on src/core). Mirrors
 * `core/resolve/server_state.ts` `statePath()`: the DEDALO_TS_STATE_PATH override (tests)
 * wins, else <private>/ts_state.json. A missing file, a missing key or a garbled file reads
 * as undefined — the same tolerance `getServerState` applies: the file also carries the
 * maintenance toggles, and a torn write there must not take a configured server down.
 */
function rawInstallStatus(): string | undefined {
	const statePath = readEnv('DEDALO_TS_STATE_PATH') ?? join(privateDir, 'ts_state.json');
	if (!existsSync(statePath)) return undefined;
	try {
		const parsed = JSON.parse(readFileSync(statePath, 'utf8')) as { install_status?: unknown };
		const status = parsed.install_status;
		return typeof status === 'string' ? status : undefined;
	} catch {
		return undefined;
	}
}

/** Does `<private>/.env` exist with any content at all? */
function envFileHasContent(envPath: string): boolean {
	try {
		return existsSync(envPath) && readFileSync(envPath, 'utf8').trim() !== '';
	} catch {
		return false;
	}
}

/**
 * Why this server must not start, or null when it may. Asked by `server.ts startServer()`
 * before any listener, DB work or file write; the caller prints the line and exits
 * NOT_INSTALLED_EXIT_CODE. One sentence, one journal line, naming the operator's next act:
 *
 *   - unconfigured, not sealed, no `.env`  → not installed: run the installer.
 *   - unconfigured, not sealed, `.env` has content → the configuration is incomplete: fix
 *     it, do not reinstall (a migrated box carries no seal, and live data may sit behind it).
 *   - unconfigured, sealed                 → configuration missing: restore `.env`.
 *   - any install_status other than sealed → install not finished: `--resume`. (A status
 *     a past wizard wrote — `configured`/`installing` — refuses too: its database is not
 *     the install's yet, and boot migrations must not run over it.)
 *   - otherwise                            → null.
 */
export function notInstalledRefusal(): string | null {
	const status = rawInstallStatus();
	const keys = REQUIRED_CONFIG_KEYS.join(', ');
	const envPath = join(privateDir, '.env');
	if (UNCONFIGURED) {
		if (status === 'sealed') {
			return `configuration missing: this instance is installed (sealed) but ${envPath} names none of ${keys}. Restore .env from backup — do not reinstall over it`;
		}
		if (envFileHasContent(envPath)) {
			return `configuration incomplete: ${envPath} exists but names none of ${keys}. Complete it or restore it from backup — do not reinstall over an existing configuration`;
		}
		return `not installed: ${keys} are unset (environment and ${envPath}). Run the installer: ./install.sh, or bun run dedalo:install`;
	}
	if (status !== undefined && status !== 'sealed') {
		return `install not finished (install_status '${status}'): re-run the installer to finish it (bun run dedalo:install --resume, or ./install.sh)`;
	}
	return null;
}
