/**
 * install_finish (PHP installer::set_install_status('installed')). SEALS the
 * install: sets install_status='sealed' in the TS state file, after which the
 * dispatch gate makes the whole install surface 404 and `start` serves the app.
 *
 * Seal guard (PHP parity): refuse unless the DB actually has a root user WITH a
 * password set — a forged install_finish must never seal a half-built instance.
 */

import { setServerState } from '../resolve/server_state.ts';
import { type DbConnDescriptor, connFromConfig, runPsql } from './pg_exec.ts';

export interface InstallFinishResult {
	result: boolean;
	msg: string;
}

const ROOT_SECTION_ID = -1;
const USERS_SECTION_TIPO = 'dd128';
const PASSWORD_COMPONENT = 'dd133';

/** Seal the install once the root user + password exist. */
export async function installFinish(conn?: DbConnDescriptor): Promise<InstallFinishResult> {
	const connection = conn ?? connFromConfig();
	const probe = await runPsql(connection, [
		'-tAc',
		`SELECT coalesce(jsonb_array_length(string->'${PASSWORD_COMPONENT}'), 0) FROM matrix_users WHERE section_id = ${ROOT_SECTION_ID} AND section_tipo = '${USERS_SECTION_TIPO}'`,
	]);
	if (probe.exitCode !== 0 || probe.stdout.trim() === '') {
		return {
			result: false,
			msg: 'Cannot seal: root user not found (run the database install step)',
		};
	}
	if (Number(probe.stdout.trim()) < 1) {
		return { result: false, msg: 'Cannot seal: root password is not set' };
	}
	setServerState({ install_status: 'sealed' });
	return { result: true, msg: 'Installation complete' };
}
