/**
 * media_control `set_media_access_mode` (src/core/area_maintenance/widgets/media_control.ts)
 * — the mode switch that can open the whole media tree to the world.
 *
 * TIER: pure + filesystem. NO DB. Every filesystem effect is redirected at a per-test
 * temp dir through the guarded `overrideMediaProtectionPathsForTests` seam, installed in
 * `beforeEach` and torn down in `afterEach`: this action WRITES the generated Apache and
 * nginx rule files into the media root and re-lays the auth markers, so an un-seamed run
 * would rewrite the developer's live media gate. The ts_state override it persists is
 * already scratch under `bun test` (bunfig preload points DEDALO_TS_STATE_PATH at a
 * per-run file), and it is reset to null around every test anyway.
 *
 * The branch inventory of the function under test:
 *   1. principal.userId !== -1                      → unauthorized (the whole gate)
 *   2. value ∉ {config,off,private,publication}      → invalid value
 *   3. !isStateWritable()                            → not exercised (see note below)
 *   4. mediaRoot() === null && value ∉ {off,config}  → not reachable under the seam
 *   5. override mapping config→null / off→false / mode→mode, persisted
 *   6. writeRuleFiles(EXPLICIT effective mode)       → throws → mismatch envelope
 *   7. effective !== false                           → reconcileAuthMarkers(live sessions)
 *   8. the three conditional notes + the mode label
 *
 * Branch 3 is not exercised: `isStateWritable()` reads DEDALO_TS_STATE_PATH through the
 * typed env layer, and making it unwritable would take the whole test process's state
 * file down with it. Branch 4 is deliberately NOT exercised — reaching it means clearing
 * the temp override, which aims the companion write at the real media tree.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { widget } from '../../src/core/area_maintenance/widgets/media_control.ts';
import type { WidgetModule } from '../../src/core/area_maintenance/widgets/support.ts';
import { DedaloError } from '../../src/core/errors/dedalo_error.ts';
import {
	getStateOverride,
	MEDIA_AUTH_COOKIE,
	overrideMediaProtectionPathsForTests,
	resolveModeSource,
} from '../../src/core/media/protection.ts';
import { setServerState } from '../../src/core/resolve/server_state.ts';
import type { Principal } from '../../src/core/security/permissions.ts';
import { endSession } from '../../src/core/security/session_media.ts';
import { createSession } from '../../src/core/security/session_store.ts';
import { markMediaRoot } from '../helpers/media_scratch_root.ts';

// Fail loud if the action is ever unregistered: a missing apiAction must break this
// file, never make it silently vacuous.
const setAccessMode = ((): NonNullable<WidgetModule['apiActions']>[string] => {
	const action = widget.apiActions?.set_media_access_mode;
	if (action === undefined) {
		throw new Error('media_control widget no longer registers the set_media_access_mode apiAction');
	}
	return action;
})();

const ROOT: Principal = { userId: -1, isGlobalAdmin: true, isDeveloper: true };
/** A profile admin: passes dispatchWidgetRequest's isGlobalAdmin gate, must NOT pass this one. */
const ADMIN: Principal = { userId: 5, isGlobalAdmin: true, isDeveloper: false };

const HEX = 'a'.repeat(128);

let scratch: string;
let mediaRoot: string;
let authStore: string;
let htaccess: string;
let nginxConf: string;
let nginxMap: string;

beforeEach(() => {
	scratch = mkdtempSync(join(tmpdir(), 'dedalo_media_control_'));
	mediaRoot = join(scratch, 'media');
	authStore = join(scratch, 'private', 'media_auth.json');
	htaccess = join(mediaRoot, '.htaccess');
	nginxConf = join(mediaRoot, 'dedalo_media_protection.nginx.conf');
	nginxMap = join(mediaRoot, 'dedalo_media_protection_map.nginx.conf');
	// DECLARE the scratch media root (src/core/media/test_media_root.ts).
	markMediaRoot(mediaRoot);
	overrideMediaProtectionPathsForTests({ mediaRoot, authStorePath: authStore });
	setServerState({ media_access_mode: null });
});

afterEach(() => {
	setServerState({ media_access_mode: null });
	overrideMediaProtectionPathsForTests(null);
	// The write-failure case leaves the dir read-only; restore before rm.
	try {
		chmodSync(mediaRoot, 0o700);
	} catch {
		// already gone / never created
	}
	rmSync(scratch, { recursive: true, force: true });
});

/** Apply a mode as root and assert it actually applied — the pre-seed used by the
 * refusal cases. A silent failure here would make "nothing changed" unfalsifiable. */
async function seedAsRoot(value: string): Promise<void> {
	const seeded = await setAccessMode({ value }, ROOT);
	expect(seeded.data).toBe(true);
}

/** The DedaloError a set-mode call rejected with (fails when it answered instead). */
async function refusedMode(
	options: Record<string, unknown>,
	principal: Principal,
): Promise<DedaloError> {
	try {
		await setAccessMode(options, principal);
	} catch (error) {
		expect(error).toBeInstanceOf(DedaloError);
		return error as DedaloError;
	}
	throw new Error('expected the mode change to be refused, it applied');
}

describe('authorization — the gate that is the point of the function', () => {
	test('a non-root global admin is refused, and the seeded state SURVIVES', async () => {
		await seedAsRoot('publication');
		const seededRules = readFileSync(htaccess, 'utf8');
		expect(getStateOverride()).toBe('publication');
		// The seed must be a state the refused call would visibly destroy.
		expect(seededRules).toContain('.publication/pub/$1_$2');

		const error = await refusedMode({ value: 'off' }, ADMIN);

		expect(error.code).toBe('perm.denied');
		expect(error.message).toBe('only the root user can change the media access mode');
		// Nothing moved: neither the persisted override nor the bytes on disk.
		expect(getStateOverride()).toBe('publication');
		expect(readFileSync(htaccess, 'utf8')).toBe(seededRules);
	});

	test('the gate is on userId === -1, not on isGlobalAdmin/isDeveloper', async () => {
		await seedAsRoot('private');
		const seededRules = readFileSync(htaccess, 'utf8');

		for (const principal of [
			{ userId: 1, isGlobalAdmin: true, isDeveloper: true },
			{ userId: 0, isGlobalAdmin: true, isDeveloper: true },
			{ userId: 424262, isGlobalAdmin: false, isDeveloper: false },
		] as Principal[]) {
			expect((await refusedMode({ value: 'off' }, principal)).code).toBe('perm.denied');
		}
		expect(getStateOverride()).toBe('private');
		expect(readFileSync(htaccess, 'utf8')).toBe(seededRules);
	});
});

describe('value validation', () => {
	test('an unknown token is refused verbatim, and the seeded state SURVIVES', async () => {
		await seedAsRoot('publication');
		const seededRules = readFileSync(htaccess, 'utf8');

		// 'public' is the plausible typo for 'publication' — and the one that would
		// otherwise fall through to a mode the resolver reads as OFF.
		const error = await refusedMode({ value: 'public' }, ROOT);

		expect(error.code).toBe('maintenance.action_refused');
		expect(error.publicMessage).toBe(
			'Error. Invalid value. Allowed: config | off | private | publication',
		);
		expect(getStateOverride()).toBe('publication');
		expect(readFileSync(htaccess, 'utf8')).toBe(seededRules);
	});

	test('missing / non-string values are refused too', async () => {
		await seedAsRoot('private');
		for (const value of [undefined, null, '', 0, false, true, ['off'], { value: 'off' }]) {
			expect((await refusedMode({ value }, ROOT)).code).toBe('maintenance.action_refused');
		}
		expect(getStateOverride()).toBe('private');
	});

	test('the authorization gate runs BEFORE validation — a non-root bad token is unauthorized', async () => {
		expect((await refusedMode({ value: 'nonsense' }, ADMIN)).code).toBe('perm.denied');
	});
});

describe('the override the widget persists', () => {
	test("'private' and 'publication' store themselves verbatim", async () => {
		await seedAsRoot('private');
		expect(getStateOverride()).toBe('private');
		await seedAsRoot('publication');
		expect(getStateOverride()).toBe('publication');
	});

	test("'off' stores explicit FALSE, not null — an OFF must not fall back to .env", async () => {
		await seedAsRoot('private');
		const response = await setAccessMode({ value: 'off' }, ROOT);

		expect(response.data).toBe(true);
		expect(response.errors).toBeUndefined();
		// false, not null: null would mean "no opinion" and re-derive the mode from .env.
		expect(getStateOverride()).toBe(false);
		expect(resolveModeSource()).toBe('ts_state.json (media_access_mode, set from this widget)');
	});

	test("'config' CLEARS the override and hands the decision back to the .env layer", async () => {
		await seedAsRoot('private');
		expect(getStateOverride()).toBe('private');

		const response = await setAccessMode({ value: 'config' }, ROOT);

		expect(response.data).toBe(true);
		expect(getStateOverride()).toBeNull();
		// The source string must no longer name the widget's own state file.
		expect(resolveModeSource()).not.toContain('ts_state.json');
	});
});

describe('the generated rule files — the artifact the web server actually enforces', () => {
	test("'off' WRITES the hardening-only template; it never unlinks the gate (SEC-088)", async () => {
		await seedAsRoot('private');
		const response = await setAccessMode({ value: 'off' }, ROOT);
		expect(response.data).toBe(true);

		expect(existsSync(htaccess)).toBe(true);
		const text = readFileSync(htaccess, 'utf8');
		// An .htaccess-less media dir is one where Apache executes an uploaded .php.
		expect(text).toContain('# SEC-088: block script execution inside the media root.');
		expect(text).toContain('Options -Indexes -ExecCGI');
		expect(text).toContain('RewriteRule (^|/)\\.publication(/|$) - [R=404,L]');
		// ...and the auth gate is gone: protection really is off.
		expect(text).not.toContain(`${MEDIA_AUTH_COOKIE}=([a-f0-9]{128})`);
		expect(text).not.toContain('.publication/pub/$1_$2');
	});

	test("'private' writes rule A only — no anonymous publication rule", async () => {
		await seedAsRoot('private');
		const text = readFileSync(htaccess, 'utf8');
		expect(text).toContain(
			`RewriteCond %{HTTP_COOKIE} (?:^|;\\s*)${MEDIA_AUTH_COOKIE}=([a-f0-9]{128}) [NC]`,
		);
		expect(text).toContain(`RewriteCond "${mediaRoot}/.publication/auth/%1" -f`);
		expect(text).not.toContain('.publication/pub/$1_$2');
		expect(text).toContain('# 3. Default deny: 404 hides the existence of unpublished media.');
	});

	test("'publication' adds rule B, and switching back to 'private' REMOVES it", async () => {
		// This is the case that pins the EXPLICIT mode threading into writeRuleFiles():
		// re-deriving the mode from the frozen `config` const would write the same file
		// twice and leave rule B in place after the operator narrowed the mode.
		await seedAsRoot('publication');
		expect(readFileSync(htaccess, 'utf8')).toContain(
			`RewriteCond "${mediaRoot}/.publication/pub/$1_$2" -f`,
		);

		await seedAsRoot('private');
		expect(readFileSync(htaccess, 'utf8')).not.toContain('.publication/pub/$1_$2');
	});

	test('both nginx artifacts are written alongside the .htaccess', async () => {
		await seedAsRoot('publication');
		expect(existsSync(nginxConf)).toBe(true);
		expect(existsSync(nginxMap)).toBe(true);
		expect(readFileSync(nginxMap, 'utf8')).toContain(
			`map $cookie_${MEDIA_AUTH_COOKIE} $dedalo_auth_key {`,
		);
	});
});

describe('auth markers', () => {
	test('re-enabling protection re-lays the markers for LIVE SESSIONS', async () => {
		// An editor who is ALREADY logged in holds the cookie but has no marker after the
		// media dir was wiped / protection was off: without this resync every one of
		// their media requests 404s until they log in again.
		//
		// The source of truth is the sessions table, not a persisted store — the media
		// credential became per-session on 2026-08-24, so "which cookies are valid" is
		// exactly "which sessions are live".
		const token = createSession(-1, 'root', true, HEX);

		await seedAsRoot('private');

		expect(existsSync(join(mediaRoot, '.publication', 'auth', HEX))).toBe(true);
		endSession(token);
	});

	test("'off' does NOT lay markers — there is nothing to authorize", async () => {
		const token = createSession(-1, 'root', true, HEX);

		await seedAsRoot('off');

		expect(existsSync(join(mediaRoot, '.publication', 'auth', HEX))).toBe(false);
		endSession(token);
	});

	test('a non-hex session value never reaches the disk as a filename (traversal guard)', async () => {
		// The marker filename IS the credential, so the hex grammar is the traversal
		// guard — and a session row is hand-editable state like any other.
		const token = createSession(-1, 'root', true, '../../../../etc/passwd');

		await seedAsRoot('private');

		expect(
			existsSync(join(mediaRoot, '.publication', 'auth', '..', '..', '..', '..', 'etc', 'passwd')),
		).toBe(false);
		endSession(token);
	});

	test('ending a session revokes ITS marker and no other', async () => {
		// The reason the per-session design exists: revocation that does not lock
		// everyone else out of the media tree.
		const other = 'b'.repeat(128); // NOT HEX — the point is that the two differ
		const keptToken = createSession(-1, 'root', true, other);
		const doomedToken = createSession(-1, 'root', true, HEX);
		await seedAsRoot('private');
		const authDir = join(mediaRoot, '.publication', 'auth');
		expect(existsSync(join(authDir, HEX))).toBe(true);
		expect(existsSync(join(authDir, other))).toBe(true);

		endSession(doomedToken);

		expect(existsSync(join(authDir, HEX))).toBe(false);
		expect(existsSync(join(authDir, other))).toBe(true);
		endSession(keptToken);
	});
});

describe('the notes and the mode label in the success message', () => {
	test("'publication' asks for one media-index rebuild and warns about the nginx reload", async () => {
		const response = await setAccessMode({ value: 'publication' }, ROOT);

		expect(response.data).toBe(true);
		expect(response.msg).toContain('OK. Media access mode applied: publication.');
		expect(response.msg).toContain(
			"If this instance has existing publications, run 'Rebuild media index' once.",
		);
		expect(response.msg).toContain(
			'Live sessions were re-keyed; anyone without a media auth cookie receives one on their next request.',
		);
		// The nginx conf was just written, so the operator must be told it is inert
		// until a reload (unlike the per-request .htaccess).
		expect(response.msg).toContain('nginx: RELOAD REQUIRED');
	});

	test("'private' carries the cookie note but NOT the rebuild note", async () => {
		const response = await setAccessMode({ value: 'private' }, ROOT);

		expect(response.msg).toContain('OK. Media access mode applied: private.');
		expect(response.msg).toContain(
			'Live sessions were re-keyed; anyone without a media auth cookie receives one on their next request.',
		);
		expect(response.msg).not.toContain('Rebuild media index');
	});

	test("'off' is labelled world-readable and carries NO cookie note", async () => {
		const response = await setAccessMode({ value: 'off' }, ROOT);

		expect(response.msg).toContain('OK. Media access mode applied: off (media is world-readable).');
		expect(response.msg).not.toContain('Users without the media auth cookie');
		expect(response.msg).not.toContain('Rebuild media index');
	});

	test('the nginx reload note is emitted in EVERY mode (the `exists` guard is always true here)', async () => {
		// `status.nginx.exists` is read AFTER writeRuleFiles(), which writes the nginx
		// conf in every mode including 'off' — so on a successful apply the guard can
		// never be false. Pinned as an observation, not a defect: the note is correct in
		// all three modes, and the guard still earns its keep on a media root the
		// operator has since emptied by hand.
		const response = await setAccessMode({ value: 'off' }, ROOT);
		expect(existsSync(nginxConf)).toBe(true);
		expect(response.msg).toContain(
			'nginx: RELOAD REQUIRED (nginx -t && nginx -s reload). The Apache .htaccess applies immediately.',
		);
	});
});

describe('the rule-file write failure — the mode/gate mismatch envelope', () => {
	test.skipIf(process.getuid?.() === 0)(
		'a mode is saved but the gate on disk is NOT, and the state is deliberately not rolled back',
		async () => {
			await seedAsRoot('private');
			// The config hash of 'publication' differs from 'private', so writeRuleFiles
			// really attempts a write instead of no-opping on the idempotency guard.
			// Read-only media root + read-only existing files => EACCES on the rewrite.
			chmodSync(htaccess, 0o400);
			chmodSync(nginxConf, 0o400);
			chmodSync(mediaRoot, 0o500);

			const error = await refusedMode({ value: 'publication' }, ROOT);

			expect(error.code).toBe('maintenance.action_failed');
			expect(error.publicMessage).toContain('the gate on disk still enforces the PREVIOUS mode');
			expect(error.publicMessage).toContain('The mode was saved');

			chmodSync(mediaRoot, 0o700);
			// The saved override is 'publication'; the bytes on disk are still 'private'.
			// NOT rolled back on purpose — a rollback would leave rules for a mode the
			// state no longer claims. This asymmetry is what the message announces.
			expect(getStateOverride()).toBe('publication');
			expect(readFileSync(htaccess, 'utf8')).not.toContain('.publication/pub/$1_$2');
		},
	);
});
