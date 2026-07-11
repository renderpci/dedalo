/**
 * MIGRATE_V6_PASSWORDS (CLI) — bring v6 users' passwords into v7 WITHOUT asking
 * anyone to choose a new one.
 *
 * v6 stored passwords as reversible AES ciphertext (keyed by DEDALO_INFORMATION);
 * v7's login accepts ONLY Argon2id, and the PHP "upgrade lazily on next login"
 * path died with the PHP engine. So on a v6 → v7 upgrade every user who had not
 * recently logged into a PHP-v7 server is LOCKED OUT.
 *
 * Because the old storage is reversible, this is fixable with nobody resetting
 * anything: decrypt once, re-hash with Argon2id, write the hash back. The
 * plaintext is never logged, never printed, and never written anywhere.
 *
 * It is also a security UPGRADE: DEDALO_INFORMATION defaults to the published
 * string 'Dédalo install version' and the IV seed is the entity name, so on a
 * default install anyone with a copy of the database can already decrypt every
 * password. Argon2id ends that — which is exactly why the config migration DROPS
 * those keys instead of carrying them into the v7 .env.
 *
 * USAGE
 *   bun run dedalo:migrate-passwords --config-dir=<v6>/config            # DRY-RUN
 *   bun run dedalo:migrate-passwords --information='…' --info-key='…'    # keys by hand
 *   bun run dedalo:migrate-passwords --config-dir=<v6>/config --execute  # apply
 *
 * Run it ONCE, against the database the v7 engine will serve, before letting users in.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractDefines } from '../src/config/php_defines.ts';
import {
	DEFAULT_INFORMATION,
	type LegacyKeyMaterial,
	rehashLegacyPassword,
} from '../src/core/security/legacy_password.ts';
import { isArgon2Hash } from '../src/core/security/password_hash.ts';

const PASSWORD_TIPO = 'dd133';
const USERNAME_TIPO = 'dd132';

function fail(message: string): never {
	console.error(`\n✖ migrate_v6_passwords: ${message}`);
	process.exit(1);
}

function arg(name: string): string | undefined {
	const hit = Bun.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
	return hit?.slice(name.length + 3);
}

/**
 * DEDALO_INFORMATION / DEDALO_INFO_KEY out of the v6 config (never printed).
 *
 * `--config-file` exists because many installs keep their defines in an included
 * file (`../private/config.inc`) rather than in `config/`. The tool never goes
 * LOOKING outside the config dir — the operator names the file explicitly.
 */
function keyMaterialFromConfig(
	configDir: string | undefined,
	configFile: string | undefined,
): LegacyKeyMaterial | null {
	const paths =
		configFile !== undefined
			? [configFile]
			: ['config.php', 'config_db.php'].map((f) => join(configDir as string, f));
	const files = paths
		.filter((p) => existsSync(p))
		.map((p) => ({ path: p, content: readFileSync(p, 'utf8') }));
	if (files.length === 0) return null;

	const { records } = extractDefines(files);
	const literal = (name: string): string | null => {
		const record = records.get(name);
		return record?.kind === 'literal' && typeof record.value === 'string' ? record.value : null;
	};
	const information = literal('DEDALO_INFORMATION') ?? DEFAULT_INFORMATION;
	// PHP: define('DEDALO_INFO_KEY', DEDALO_ENTITY) — the entity is the usual seed.
	const infoKey = literal('DEDALO_INFO_KEY') ?? literal('DEDALO_ENTITY');
	if (infoKey === null) return null;
	return { information, infoKey };
}

async function main(): Promise<void> {
	const execute = Bun.argv.includes('--execute');
	const configDir = arg('config-dir');
	const configFile = arg('config-file');
	const information = arg('information');
	const infoKey = arg('info-key');

	let material: LegacyKeyMaterial | null = null;
	if (information !== undefined && infoKey !== undefined) {
		material = { information, infoKey };
	} else if (configDir !== undefined || configFile !== undefined) {
		material = keyMaterialFromConfig(configDir, configFile);
		if (material === null) {
			fail(
				`could not read DEDALO_INFORMATION / DEDALO_INFO_KEY from ${configFile ?? configDir}.
  If the defines live in an included file, name it directly:
  --config-file=/path/to/private/config.inc
  …or pass the values:  --information='…' --info-key='…'`,
			);
		}
	} else {
		fail(
			'need the v6 key material. One of:\n' +
				'  --config-dir=<v6>/config\n' +
				'  --config-file=/path/to/private/config.inc   (installs that include their defines)\n' +
				"  --information='<DEDALO_INFORMATION>' --info-key='<DEDALO_INFO_KEY>'",
		);
	}

	const { sql } = await import('../src/core/db/postgres.ts');

	const rows = (await sql`
		SELECT section_id,
		       "string"->${USERNAME_TIPO}->0->>'value' AS username,
		       "string"->${PASSWORD_TIPO}->0->>'value' AS password
		FROM matrix_users
		WHERE "string"->${PASSWORD_TIPO}->0->>'value' IS NOT NULL
		ORDER BY section_id
	`) as { section_id: number; username: string | null; password: string }[];

	const legacy = rows.filter((r) => !isArgon2Hash(r.password));
	const already = rows.length - legacy.length;

	console.log(`\n\x1b[1m▶ v6 → v7 password migration — ${execute ? 'EXECUTE' : 'DRY-RUN'}\x1b[0m`);
	console.log(`  users with a password : ${rows.length}`);
	console.log(`  already Argon2id      : ${already}`);
	console.log(`  legacy (v6 AES)       : ${legacy.length}\n`);

	if (legacy.length === 0) {
		console.log('✔ nothing to do — every user is already on Argon2id.');
		process.exit(0);
	}

	// Decrypt + re-hash. The plaintext lives only inside rehashLegacyPassword.
	const planned: { id: number; username: string; hash: string }[] = [];
	const failed: { id: number; username: string }[] = [];

	for (const row of legacy) {
		const username = row.username ?? `(no username, id ${row.section_id})`;
		const hash = await rehashLegacyPassword(row.password, material);
		if (hash === null) failed.push({ id: row.section_id, username });
		else planned.push({ id: row.section_id, username, hash });
	}

	console.log(
		`\x1b[1mRecoverable\x1b[0m (${planned.length}): ${planned.map((p) => p.username).join(', ')}\n`,
	);

	if (failed.length > 0) {
		console.log(
			`\x1b[31m!! NOT RECOVERABLE\x1b[0m (${failed.length}) — the key material does not decrypt these:`,
		);
		console.log(`   ${failed.map((f) => f.username).join(', ')}`);
		console.log(
			'   Either DEDALO_INFORMATION / DEDALO_INFO_KEY are wrong (check the v6 config that',
		);
		console.log(
			'   was in use when these passwords were LAST SET), or the values are not v6 blobs.',
		);
		console.log('   These users will have to have their password reset by an admin.\n');
	}

	if (!execute) {
		console.log(`Dry-run complete. ${planned.length} password(s) would be re-hashed to Argon2id.`);
		console.log('Re-run with --execute to apply. No plaintext is ever printed or stored.');
		process.exit(0);
	}

	if (planned.length === 0) fail('nothing recoverable — refusing to run');

	let written = 0;
	for (const item of planned) {
		await sql`
			UPDATE matrix_users
			   SET "string" = jsonb_set(
			         coalesce("string", '{}'::jsonb),
			         ${`{${PASSWORD_TIPO}}`}::text[],
			         jsonb_build_array(jsonb_build_object('id', 1, 'value', ${item.hash}::text, 'lang', 'lg-nolan'))
			       )
			 WHERE section_id = ${item.id}
		`;
		written++;
	}

	// Prove it: nothing legacy may remain among the rows we touched.
	const remaining = (await sql`
		SELECT COUNT(*)::int AS n FROM matrix_users
		 WHERE "string"->${PASSWORD_TIPO}->0->>'value' IS NOT NULL
		   AND "string"->${PASSWORD_TIPO}->0->>'value' NOT LIKE '$argon2%'
	`) as { n: number }[];

	console.log(`\n✔ re-hashed ${written} password(s) to Argon2id.`);
	console.log(`  legacy values still in the table: ${remaining[0]?.n ?? '?'}`);
	if ((remaining[0]?.n ?? 0) > 0) {
		console.log('  (those are the NOT RECOVERABLE ones above — reset them by hand.)');
	}
	console.log('  Users log in with their EXISTING passwords. Nothing to communicate to them.');
	process.exit(0);
}

main().catch((error) => fail(String(error)));
