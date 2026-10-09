/**
 * The install's PRIOR configuration — the values an existing `../private/.env`
 * (the installer's private dir) already holds, read before a re-run decides
 * what to write. ONE reader for both front ends: persist_config uses it for
 * preserve-or-generate (secrets) and the update-server preserve rule, and the
 * CLI uses it so its printed plan (--plan, --list-ontologies) honours the same
 * preserved custom server list the write will keep.
 *
 * CONFIG-FREE: parseEnvFile + the install paths only, so the CLI may call it
 * before it seeds the environment config.ts freezes.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnvFile } from '../../config/env.ts';
import { installPrivateDir } from './paths.ts';

/** The existing .env's values; {} when it is absent or unreadable. */
export function readPriorEnv(): Record<string, string> {
	const path = join(installPrivateDir(), '.env');
	if (!existsSync(path)) return {};
	try {
		return parseEnvFile(readFileSync(path, 'utf8'));
	} catch {
		return {};
	}
}
