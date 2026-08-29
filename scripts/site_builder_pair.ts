#!/usr/bin/env bun
/**
 * PAIR THIS ENGINE WITH ITS SITE-BUILDER DAEMON — the operator's half of the one manual
 * step in the whole arrangement.
 *
 * WHAT IT DOES. It reads the pairing fragment the site-builder provisioner rendered for
 * this museum (`<config dir>/engine.env.fragment`) and appends its `DEDALO_SITE_BUILDER_*`
 * lines to THIS install's `../private/.env`. Then the engine is restarted and the two are
 * paired: the engine dials the daemon's per-instance unix socket, proves the pairing
 * before it sends anything (src/core/site_builder/pairing.ts), and the site-builder tool
 * appears for the users who have been granted it.
 *
 *   bun run scripts/site_builder_pair.ts /etc/dedalo_sites/instances/<name>/engine.env.fragment
 *   bun run scripts/site_builder_pair.ts <fragment> --token-file /etc/…/secrets/SERVICE_TOKEN
 *   bun run scripts/site_builder_pair.ts <fragment> --dry-run
 *
 * WHY A SCRIPT AND NOT A `cat >>`. The fragment's own header suggests exactly that, and it
 * is right about the shape — but three of this repo's standing laws have to hold at the
 * same time, and a shell append honours none of them:
 *
 *   1. `../private/.env` IS APPEND-ONLY AND TAKES DOCUMENTED KEYS ONLY. So every key in a
 *      fragment is checked against the config catalog BEFORE a byte is written, and a key
 *      the engine has never heard of stops the run instead of becoming a line nobody can
 *      debug. A fragment from a NEWER daemon than this engine is exactly that case, and it
 *      is the one an operator would otherwise discover as "the feature silently does not
 *      work".
 *   2. APPENDING TWICE MUST BE HARMLESS, and appending a CONTRADICTION must not be. The
 *      engine's parser lets the last occurrence of a key win, so a second append with a
 *      different value would silently re-point this install — the very failure the pairing
 *      proof exists to catch — while looking like a successful re-run. So: a key already
 *      present with the same value is skipped, and a key already present with a DIFFERENT
 *      value is a refusal that names the key and writes nothing at all.
 *   3. THE TOKEN IS A SECRET, AND THE .env IS APPEND-ONLY. The fragment deliberately
 *      carries a PLACEHOLDER rather than the token's value (the daemon's renderer explains
 *      why: a generated, group-readable file must not be a second home for a credential).
 *      Its header then asks the operator to "replace the placeholder", which on an
 *      append-only file is not a thing one can do. This script closes that gap: it REFUSES
 *      to append a placeholder, and takes the real value from the root-owned credential
 *      file with `--token-file` — reading it, never echoing it. Nothing this script prints,
 *      on any path, contains a secret's value.
 *
 * WHAT IT NEVER DOES. It does not edit an existing line, it does not reorder the file, it
 * does not touch anything but `../private/.env`, and it does not talk to the daemon. The
 * pairing is PROVED at run time by the engine itself, on the first call; this script only
 * writes the address down.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG_CATALOG } from '../src/config/catalog/index.ts';
import { parseEnvFile, privateDir } from '../src/config/env.ts';

/**
 * THE KEYS THIS SCRIPT IS ALLOWED TO WRITE. It pairs a site builder; it is not a general
 * way to append to the installation's private configuration. A fragment that carried
 * anything else would be a fragment doing something other than pairing, and the honest
 * response to that is a refusal rather than a partial apply.
 */
const KEY_PREFIX = 'DEDALO_SITE_BUILDER_';

/**
 * The IMPOSSIBLE value the daemon's renderer writes where the token would go
 * (`publication/site_builder/src/provision/render/engine_fragment.ts` TOKEN_PLACEHOLDER).
 * Spelled here because the two are separate deployables that share no module; a gate reads
 * that file and asserts the two literals are identical
 * (test/unit/site_builder_pairing_tripwire.test.ts), so they cannot drift apart in silence.
 */
const TOKEN_PLACEHOLDER = 'PASTE_THE_SERVICE_TOKEN_VALUE_HERE';

function fail(message: string): never {
	console.error(`\n[site_builder_pair] REFUSED — ${message}\n`);
	process.exit(1);
}

/** Is this key's value a secret? Read from the catalog, never guessed from its name. */
function isSecret(key: string): boolean {
	return CONFIG_CATALOG[key]?.scope === 'secret';
}

/** A value as it may appear in a log line: the real thing, or a shape for a secret. */
function shown(key: string, value: string): string {
	return isSecret(key) ? `<${value.length} characters, not shown>` : value;
}

function main(): void {
	const args = process.argv.slice(2);
	const flags = new Set(args.filter((a) => a.startsWith('--')));
	const positional = args.filter((a) => !a.startsWith('--'));

	const tokenFileFlag = args.indexOf('--token-file');
	const tokenFile = tokenFileFlag === -1 ? undefined : args[tokenFileFlag + 1];
	const fragmentPath = positional.filter((a) => a !== tokenFile)[0];
	const dryRun = flags.has('--dry-run');

	if (fragmentPath === undefined) {
		fail(
			'no fragment given.\n' +
				'  Usage: bun run scripts/site_builder_pair.ts <engine.env.fragment> ' +
				'[--token-file <path>] [--dry-run]\n' +
				'  The fragment is rendered by the site-builder provisioner at ' +
				'<config dir>/engine.env.fragment.',
		);
	}
	if (tokenFileFlag !== -1 && (tokenFile === undefined || tokenFile.startsWith('--'))) {
		fail("--token-file needs a path (the daemon's root-owned SERVICE_TOKEN file).");
	}

	let fragment: string;
	try {
		fragment = readFileSync(fragmentPath, 'utf8');
	} catch (error) {
		fail(
			`the fragment '${fragmentPath}' could not be read (${(error as Error).message}).\n` +
				'  It is 0640 root:<engine group>, so this normally means running as the wrong ' +
				'user, or a path from another instance.',
		);
	}

	// The SAME parser the engine reads its .env with (src/config/env.ts). A second grammar
	// here is how a line that this script considered written would arrive at the engine as
	// something else.
	const declared = parseEnvFile(fragment);
	const keys = Object.keys(declared);
	if (keys.length === 0) {
		fail(`'${fragmentPath}' declares no KEY=value lines. Is it really a pairing fragment?`);
	}

	// ── Law 1: documented keys only, checked before anything is written ──────────────────
	for (const key of keys) {
		if (!key.startsWith(KEY_PREFIX)) {
			fail(
				`'${fragmentPath}' declares '${key}', which is not a site-builder key.\n` +
					`  This script appends ${KEY_PREFIX}* lines and nothing else — pairing is all it ` +
					'does. Nothing was written.',
			);
		}
		if (CONFIG_CATALOG[key] === undefined) {
			fail(
				`'${fragmentPath}' declares '${key}', which this engine's config catalog does not ` +
					'know.\n' +
					'  ../private/.env takes DOCUMENTED keys only, so appending it would add a line ' +
					'nothing reads and nobody can debug. The usual cause is a site-builder daemon ' +
					'newer than this engine: update the engine first. Nothing was written.',
			);
		}
	}

	// ── Law 3: the token placeholder is not a value ──────────────────────────────────────
	const values = new Map<string, string>(Object.entries(declared));
	for (const [key, value] of values) {
		if (value !== TOKEN_PLACEHOLDER) continue;
		if (tokenFile === undefined) {
			fail(
				`'${key}' in the fragment is the placeholder, not a token.\n` +
					'  The fragment never carries the secret itself (the daemon keeps it in a ' +
					'root-owned 0600 file, so it exists in exactly one place). Re-run with the ' +
					'credential file:\n' +
					`    sudo bun run scripts/site_builder_pair.ts ${fragmentPath} \\\n` +
					'         --token-file <the file the fragment names above the placeholder>\n' +
					'  Appending the placeholder would produce an install that fails ' +
					'authentication with a value that looks configured. Nothing was written.',
			);
		}
		let secret: string;
		try {
			secret = readFileSync(tokenFile, 'utf8').trim();
		} catch (error) {
			fail(
				`the credential file '${tokenFile}' could not be read ` +
					`(${(error as Error).message}). It is 0600 root:root by design — run this as ` +
					'root. Nothing was written.',
			);
		}
		if (secret.length === 0) {
			fail(`the credential file '${tokenFile}' is empty. Nothing was written.`);
		}
		values.set(key, secret);
	}

	// ── Law 2: idempotent, and a contradiction is a refusal ──────────────────────────────
	const envPath = join(privateDir, '.env');
	let existingText: string;
	try {
		existingText = readFileSync(envPath, 'utf8');
	} catch (error) {
		fail(
			`this install's private environment file '${envPath}' could not be read ` +
				`(${(error as Error).message}). Pairing appends to it; it must already exist.`,
		);
	}
	const existing = parseEnvFile(existingText);

	const toAppend: [string, string][] = [];
	const alreadyRight: string[] = [];
	const conflicts: string[] = [];
	for (const [key, value] of values) {
		const present = existing[key];
		if (present === undefined) toAppend.push([key, value]);
		else if (present === value) alreadyRight.push(key);
		else conflicts.push(key);
	}

	if (conflicts.length > 0) {
		fail(
			`${envPath} already sets ${conflicts.join(', ')} to a DIFFERENT value.\n` +
				'  Appending would leave two lines for one key, and the engine takes the LAST one — ' +
				'so a re-run would silently re-point this install at another daemon, which is ' +
				'exactly the mistake the pairing proof exists to catch. Nothing was written.\n' +
				'  If the pairing genuinely changed (a rebuilt instance, a rotated token), the ' +
				'operator decides that deliberately: remove the stale line by hand, then re-run.',
		);
	}

	if (toAppend.length === 0) {
		console.log(
			`[site_builder_pair] ${envPath} is already paired with this fragment ` +
				`(${alreadyRight.length} keys, unchanged). Nothing to do.`,
		);
		return;
	}

	const stamp = new Date().toISOString().slice(0, 10);
	const block =
		`\n# Site builder pairing, appended ${stamp} by scripts/site_builder_pair.ts from\n` +
		`#   ${fragmentPath}\n` +
		'# The engine proves this pairing before it sends anything (it recomputes the daemon\n' +
		'# fingerprint from these lines); a wrong instance or a wrong token refuses at the door.\n' +
		`${toAppend.map(([key, value]) => `${key}="${value}"`).join('\n')}\n`;

	for (const [key, value] of toAppend) {
		console.log(`[site_builder_pair] append ${key}=${shown(key, value)}`);
	}
	for (const key of alreadyRight) {
		console.log(`[site_builder_pair] keep   ${key} (already set to this value)`);
	}

	if (dryRun) {
		console.log(`[site_builder_pair] --dry-run: ${envPath} was NOT modified.`);
		return;
	}

	// APPEND, never rewrite: read + concatenate + write is the only way this file is ever
	// touched, and the newline guard means an existing file without a trailing newline does
	// not swallow the first appended key into its last line.
	const separator = existingText.length === 0 || existingText.endsWith('\n') ? '' : '\n';
	writeFileSync(envPath, `${existingText}${separator}${block}`);
	console.log(
		`[site_builder_pair] ${envPath}: ${toAppend.length} key(s) appended. ` +
			'Restart the engine, then open the site-builder tool — the first call proves the ' +
			'pairing and refuses if the daemon is not the one named here.',
	);
}

main();
