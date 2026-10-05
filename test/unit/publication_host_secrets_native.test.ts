/**
 * PUBLICATION-HOST SECRETS — src/core/publication_host/secrets.ts (phase 3, E3).
 *
 * Pins: absence is null/false, never an error; writes land 0700/0600 and round-trip;
 * a unix-socket host stores its token ALONE (null bundle) and a stale bundle from an
 * earlier mTLS pairing is removed; the name is a validated path segment; token and bundle
 * are validated BEFORE anything is written (a bad replacement leaves the previous secrets
 * intact); a mixed-up bundle (order, stray text, foreign key, foreign CA) is refused by
 * name; a widened mode, an unopenable file or a symlink is REFUSED, not used; the panel's
 * presence read (secretPresenceOutcome) REPORTS a refusal instead of throwing it; and no
 * error message carries a byte of a secret.
 *
 * `bad_owner` needs no second uid: the engine's euid is stubbed (asForeignEngine), so a
 * test-owned root, host dir or file reads as foreign — each leg pinned by the path its
 * message names. A write never chmod-repairs an EXISTING widened or foreign dir: it refuses.
 *
 * Runs on a declared scratch base and a PKI minted in-test (no live <private>, no network).
 */

import { afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { createPrivateKey, X509Certificate } from 'node:crypto';
import {
	chmodSync,
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	statSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import {
	BUNDLE_FILE,
	hostSecretDir,
	readHostTls,
	readHostToken,
	removeHostSecrets,
	SECRET_MAX_BYTES,
	SecretError,
	type SecretErrorReason,
	secretPresence,
	secretPresenceOutcome,
	secretsRoot,
	splitEngineBundle,
	TOKEN_FILE,
	writeHostSecrets,
} from '../../src/core/publication_host/secrets.ts';
import {
	mintSelfSignedLeaf,
	mintTestPki,
	type TestPki,
	useScratchPublicationHostsBase,
} from '../helpers/publication_host_fixtures.ts';

/** Low-entropy and built at runtime: a fixture, never a credential-shaped literal (.gitleaks.toml). */
const TOKEN = `fixture_${'t'.repeat(40)}`;
let pki: TestPki;
let rogue: TestPki;

beforeAll(() => {
	pki = mintTestPki('dedalo-test-pubhost');
	rogue = mintTestPki('dedalo-test-rogue');
});

let scratch: { base: string; dispose: () => void };
beforeEach(() => {
	scratch = useScratchPublicationHostsBase();
});
afterEach(() => {
	scratch.dispose();
});

function failure(fn: () => unknown): {
	reason: SecretErrorReason | 'no throw' | 'other';
	message: string;
} {
	try {
		fn();
		return { reason: 'no throw', message: '' };
	} catch (error) {
		return error instanceof SecretError
			? { reason: error.reason, message: error.message }
			: { reason: 'other', message: String(error) };
	}
}

const mode = (path: string): number => statSync(path).mode & 0o777;

/** The base64 body of a PEM block (what a leak would carry), without its armour lines. */
const pemBody = (pem: string): string => pem.split('\n').slice(1, -2).join('\n');

describe('absence', () => {
	test('nothing stored → null, null, and presence false/false', () => {
		expect(readHostToken('pub_main')).toBeNull();
		expect(readHostTls('pub_main')).toBeNull();
		expect(secretPresence('pub_main')).toEqual({ token_present: false, bundle_present: false });
	});
});

describe('write → read', () => {
	test('lands 0700 dirs and 0600 files under <base>/publication_hosts/<name>', () => {
		writeHostSecrets('pub_main', TOKEN, pki.bundlePem);
		const dir = hostSecretDir('pub_main');
		expect(dir).toBe(join(scratch.base, 'publication_hosts', 'pub_main'));
		expect(mode(secretsRoot())).toBe(0o700);
		expect(mode(dir)).toBe(0o700);
		expect(mode(join(dir, TOKEN_FILE))).toBe(0o600);
		expect(mode(join(dir, BUNDLE_FILE))).toBe(0o600);
	});

	test('round-trips the token and the three PEM pieces', () => {
		writeHostSecrets('pub_main', TOKEN, pki.bundlePem);
		expect(readHostToken('pub_main')).toBe(TOKEN);
		expect(readHostTls('pub_main')).toEqual({
			cert: pki.clientCertPem,
			key: pki.clientKeyPem,
			ca: pki.caPem,
		});
		expect(secretPresence('pub_main')).toEqual({ token_present: true, bundle_present: true });
	});

	test('a unix-socket host (null bundle) stores the token alone; presence true/false', () => {
		writeHostSecrets('pub_local', TOKEN, null);
		const dir = hostSecretDir('pub_local');
		expect(mode(dir)).toBe(0o700);
		expect(mode(join(dir, TOKEN_FILE))).toBe(0o600);
		expect(existsSync(join(dir, BUNDLE_FILE))).toBe(false);
		expect(readHostToken('pub_local')).toBe(TOKEN);
		expect(readHostTls('pub_local')).toBeNull();
		expect(secretPresence('pub_local')).toEqual({ token_present: true, bundle_present: false });
	});

	test('re-pairing over a unix socket (null bundle) removes the stale mTLS bundle', () => {
		writeHostSecrets('pub_main', TOKEN, pki.bundlePem);
		writeHostSecrets('pub_main', `${TOKEN}x`, null);
		expect(existsSync(join(hostSecretDir('pub_main'), BUNDLE_FILE))).toBe(false);
		expect(readHostToken('pub_main')).toBe(`${TOKEN}x`);
	});

	test('removeHostSecrets removes the host dir and is idempotent', () => {
		writeHostSecrets('pub_main', TOKEN, pki.bundlePem);
		removeHostSecrets('pub_main');
		expect(existsSync(hostSecretDir('pub_main'))).toBe(false);
		removeHostSecrets('pub_main');
		expect(secretPresence('pub_main')).toEqual({ token_present: false, bundle_present: false });
	});
});

describe('the name is a path segment', () => {
	test.each(['../escape', 'Pub', 'p', '', 'pub/main'])('%p → bad_name', (name) => {
		expect(failure(() => hostSecretDir(name)).reason).toBe('bad_name');
		expect(failure(() => readHostToken(name)).reason).toBe('bad_name');
		expect(failure(() => writeHostSecrets(name, TOKEN, pki.bundlePem)).reason).toBe('bad_name');
	});
});

describe('validation before any write', () => {
	test.each([
		['31 chars', 'x'.repeat(31)],
		['a space', `${'x'.repeat(20)} ${'x'.repeat(20)}`],
		['a newline', `${'x'.repeat(40)}\n`],
	])('a token with %s → bad_token, nothing written', (_label, token) => {
		expect(failure(() => writeHostSecrets('pub_main', token, pki.bundlePem)).reason).toBe(
			'bad_token',
		);
		expect(failure(() => writeHostSecrets('pub_main', token, null)).reason).toBe('bad_token');
		expect(existsSync(secretsRoot())).toBe(false);
	});

	test.each([
		['the CA first', () => pki.caPem + pki.clientCertPem + pki.clientKeyPem],
		['the key missing', () => pki.clientCertPem + pki.caPem],
		['stray text', () => `${pki.bundlePem}# note\n`],
		['a foreign key', () => pki.clientCertPem + rogue.clientKeyPem + pki.caPem],
		['a foreign CA', () => pki.clientCertPem + pki.clientKeyPem + rogue.caPem],
		[
			'the server cert in place of the client cert',
			() => pki.serverCertPem + pki.clientKeyPem + pki.caPem,
		],
		["an empty string ('' is not 'no bundle' — that is null)", () => ''],
	])('a bundle with %s → bad_bundle, nothing written', (_label, bundle) => {
		expect(failure(() => writeHostSecrets('pub_main', TOKEN, bundle())).reason).toBe('bad_bundle');
		expect(existsSync(secretsRoot())).toBe(false);
	});

	test('a bad replacement leaves the previous secrets intact', () => {
		writeHostSecrets('pub_main', TOKEN, pki.bundlePem);
		expect(failure(() => writeHostSecrets('pub_main', 'short', pki.bundlePem)).reason).toBe(
			'bad_token',
		);
		expect(failure(() => writeHostSecrets('pub_main', 'short', null)).reason).toBe('bad_token');
		expect(failure(() => writeHostSecrets('pub_main', `${TOKEN}x`, rogue.caPem)).reason).toBe(
			'bad_bundle',
		);
		expect(readHostToken('pub_main')).toBe(TOKEN);
		expect(readHostTls('pub_main')?.ca).toBe(pki.caPem);
	});

	test('the third block must be a CA: a non-CA issuer that DOES verify the cert → bad_bundle', () => {
		const leaf = mintSelfSignedLeaf();
		// control: everything but `ca.ca` holds, so only that check can refuse it
		const cert = new X509Certificate(leaf.certPem);
		expect(cert.ca).toBe(false);
		expect(cert.verify(cert.publicKey)).toBe(true);
		expect(cert.checkPrivateKey(createPrivateKey(leaf.keyPem))).toBe(true);
		const bundle = leaf.certPem + leaf.keyPem + leaf.certPem;
		expect(failure(() => splitEngineBundle(bundle, 'x')).reason).toBe('bad_bundle');
		expect(failure(() => writeHostSecrets('pub_main', TOKEN, bundle)).reason).toBe('bad_bundle');
		expect(existsSync(secretsRoot())).toBe(false);
	});

	test('splitEngineBundle is the same check, pure', () => {
		expect(splitEngineBundle(pki.bundlePem, 'x')).toEqual({
			cert: pki.clientCertPem,
			key: pki.clientKeyPem,
			ca: pki.caPem,
		});
		expect(failure(() => splitEngineBundle(rogue.caPem, 'x')).reason).toBe('bad_bundle');
	});
});

describe('stored secrets are checked on every read', () => {
	test('a token file widened to 0644 is refused, not used', () => {
		writeHostSecrets('pub_main', TOKEN, pki.bundlePem);
		chmodSync(join(hostSecretDir('pub_main'), TOKEN_FILE), 0o644);
		expect(failure(() => readHostToken('pub_main')).reason).toBe('bad_mode');
		expect(failure(() => secretPresence('pub_main')).reason).toBe('bad_mode');
	});

	test('a host dir widened to 0755 is refused', () => {
		writeHostSecrets('pub_main', TOKEN, pki.bundlePem);
		chmodSync(hostSecretDir('pub_main'), 0o755);
		expect(failure(() => readHostTls('pub_main')).reason).toBe('bad_mode');
	});

	test('a token file the engine user cannot open (mode 000) is bad_mode, never a raw EACCES', () => {
		writeHostSecrets('pub_main', TOKEN, pki.bundlePem);
		chmodSync(join(hostSecretDir('pub_main'), TOKEN_FILE), 0o000);
		// as a normal user open(2) fails EACCES; as root (the CI container) it opens and the
		// mode check refuses it — bad_mode either way
		expect(failure(() => readHostToken('pub_main')).reason).toBe('bad_mode');
	});

	test('a symlinked token file is refused', () => {
		writeHostSecrets('pub_main', TOKEN, pki.bundlePem);
		const outside = join(scratch.base, 'elsewhere');
		writeFileSync(outside, TOKEN, { mode: 0o600 });
		const tokenPath = join(hostSecretDir('pub_main'), TOKEN_FILE);
		rmSync(tokenPath);
		symlinkSync(outside, tokenPath);
		expect(failure(() => readHostToken('pub_main')).reason).toBe('bad_mode');
	});

	test('a symlinked host dir is refused, even onto a private dir holding a valid token', () => {
		const outside = join(scratch.base, 'other_private');
		mkdirSync(outside, { mode: 0o700 });
		writeFileSync(join(outside, TOKEN_FILE), `${TOKEN}\n`, { mode: 0o600 });
		mkdirSync(secretsRoot(), { mode: 0o700 });
		symlinkSync(outside, hostSecretDir('pub_main'));
		expect(failure(() => readHostToken('pub_main')).reason).toBe('bad_mode');
		expect(secretPresenceOutcome('pub_main').refused).toBe('bad_mode');
	});

	test('a regular file where the host dir belongs is bad_mode, never absence', () => {
		mkdirSync(secretsRoot(), { mode: 0o700 });
		writeFileSync(hostSecretDir('pub_main'), 'not a dir', { mode: 0o600 });
		expect(failure(() => readHostToken('pub_main')).reason).toBe('bad_mode');
		expect(secretPresenceOutcome('pub_main')).toEqual({
			token_present: false,
			bundle_present: false,
			refused: 'bad_mode',
		});
	});

	test('a secrets root widened to 0777 is refused on read', () => {
		writeHostSecrets('pub_main', TOKEN, pki.bundlePem);
		chmodSync(secretsRoot(), 0o777);
		expect(failure(() => readHostToken('pub_main')).reason).toBe('bad_mode');
		expect(failure(() => readHostTls('pub_main')).reason).toBe('bad_mode');
	});

	test('a symlinked secrets root is refused on read and on write', () => {
		const outside = join(scratch.base, 'other_root');
		mkdirSync(outside, { mode: 0o700 });
		symlinkSync(outside, secretsRoot());
		expect(failure(() => readHostToken('pub_main')).reason).toBe('bad_mode');
		expect(failure(() => writeHostSecrets('pub_main', TOKEN, null)).reason).toBe('bad_mode');
		expect(existsSync(join(outside, 'pub_main'))).toBe(false);
	});

	test('a FIFO at the token path is bad_mode and never blocks the read', () => {
		writeHostSecrets('pub_main', TOKEN, pki.bundlePem);
		const tokenPath = join(hostSecretDir('pub_main'), TOKEN_FILE);
		rmSync(tokenPath);
		expect(Bun.spawnSync(['mkfifo', '-m', '600', tokenPath]).exitCode).toBe(0);
		expect(failure(() => readHostToken('pub_main')).reason).toBe('bad_mode');
	});

	test('the read is BOUNDED: a bundle padded past SECRET_MAX_BYTES is bad_bundle, at the cap it reads', () => {
		// trailing whitespace is otherwise accepted (trimmed outside the blocks), so only the cap refuses it
		writeHostSecrets('pub_main', TOKEN, pki.bundlePem);
		const path = join(hostSecretDir('pub_main'), BUNDLE_FILE);
		writeFileSync(path, pki.bundlePem.padEnd(SECRET_MAX_BYTES, '\n'), { mode: 0o600 });
		expect(readHostTls('pub_main')?.ca).toBe(pki.caPem);
		writeFileSync(path, pki.bundlePem.padEnd(SECRET_MAX_BYTES + 1, '\n'), { mode: 0o600 });
		expect(failure(() => readHostTls('pub_main')).reason).toBe('bad_bundle');
		writeFileSync(
			join(hostSecretDir('pub_main'), TOKEN_FILE),
			TOKEN.padEnd(SECRET_MAX_BYTES + 1, '\n'),
			{
				mode: 0o600,
			},
		);
		// the token leg is isolated by the MESSAGE: any over-cap token also fails TOKEN_SHAPE,
		// so only the cap's own refusal names the byte limit
		const oversize = failure(() => readHostToken('pub_main'));
		expect(oversize.reason).toBe('bad_token');
		expect(oversize.message).toContain(`exceeds ${SECRET_MAX_BYTES} bytes`);
	});

	test('a hand-edited token file with CRLF is bad_token', () => {
		writeHostSecrets('pub_main', TOKEN, pki.bundlePem);
		writeFileSync(join(hostSecretDir('pub_main'), TOKEN_FILE), `${TOKEN}\r\n`, { mode: 0o600 });
		expect(failure(() => readHostToken('pub_main')).reason).toBe('bad_token');
	});
});

/**
 * The engine's euid stubbed to a foreign uid for the first-matching call onward: calls before
 * `from` see the real euid, so one leg (root → host dir → file, the read order) at a time is
 * judged foreign.
 */
function asForeignEngine<T>(body: () => T, from = 0): T {
	const real = process.geteuid;
	let calls = 0;
	process.geteuid = () => (calls++ < from ? (real?.() ?? 0) : 4_242_424);
	try {
		return body();
	} finally {
		process.geteuid = real;
	}
}

describe('ownership: the engine euid owns the root, the host dir and each file', () => {
	test('foreign root → bad_owner naming the root', () => {
		writeHostSecrets('pub_main', TOKEN, pki.bundlePem);
		const f = asForeignEngine(() => failure(() => readHostToken('pub_main')));
		expect(f.reason).toBe('bad_owner');
		expect(f.message).toContain(`${secretsRoot()} must be owned`);
	});

	test('foreign host dir (root own) → bad_owner naming the host dir', () => {
		writeHostSecrets('pub_main', TOKEN, pki.bundlePem);
		const f = asForeignEngine(() => failure(() => readHostToken('pub_main')), 1);
		expect(f.reason).toBe('bad_owner');
		expect(f.message).toContain(`${hostSecretDir('pub_main')} must be owned`);
	});

	test('foreign 0600 file (root + dir own) → bad_owner naming the file; the panel reports it', () => {
		writeHostSecrets('pub_main', TOKEN, pki.bundlePem);
		const f = asForeignEngine(() => failure(() => readHostToken('pub_main')), 2);
		expect(f.reason).toBe('bad_owner');
		expect(f.message).toContain(`${join(hostSecretDir('pub_main'), TOKEN_FILE)} must be owned`);
		expect(asForeignEngine(() => secretPresenceOutcome('pub_main').refused, 2)).toBe('bad_owner');
		expect(readHostToken('pub_main')).toBe(TOKEN); // control: own euid reads it
	});

	test('a write never repairs an EXISTING root: widened → bad_mode, foreign → bad_owner, mode kept', () => {
		mkdirSync(secretsRoot(), { mode: 0o700 });
		chmodSync(secretsRoot(), 0o750);
		expect(failure(() => writeHostSecrets('pub_main', TOKEN, null)).reason).toBe('bad_mode');
		expect(mode(secretsRoot())).toBe(0o750);
		expect(existsSync(hostSecretDir('pub_main'))).toBe(false);
		chmodSync(secretsRoot(), 0o700);
		expect(
			asForeignEngine(() => failure(() => writeHostSecrets('pub_main', TOKEN, null))).reason,
		).toBe('bad_owner');
		expect(existsSync(hostSecretDir('pub_main'))).toBe(false);
	});

	test('a write never repairs an EXISTING widened host dir', () => {
		writeHostSecrets('pub_main', TOKEN, null);
		chmodSync(hostSecretDir('pub_main'), 0o755);
		expect(failure(() => writeHostSecrets('pub_main', TOKEN, null)).reason).toBe('bad_mode');
		expect(mode(hostSecretDir('pub_main'))).toBe(0o755);
	});
});

describe('secretPresenceOutcome — the panel read: a refusal is reported, never thrown', () => {
	test('absent → false/false, nothing refused', () => {
		expect(secretPresenceOutcome('pub_main')).toEqual({
			token_present: false,
			bundle_present: false,
			refused: null,
		});
	});

	test('an mTLS host → true/true; a unix host → true/false; nothing refused', () => {
		writeHostSecrets('pub_main', TOKEN, pki.bundlePem);
		writeHostSecrets('pub_local', TOKEN, null);
		expect(secretPresenceOutcome('pub_main')).toEqual({
			token_present: true,
			bundle_present: true,
			refused: null,
		});
		expect(secretPresenceOutcome('pub_local')).toEqual({
			token_present: true,
			bundle_present: false,
			refused: null,
		});
	});

	test('a widened token → refused bad_mode, token not usable, the bundle still read', () => {
		writeHostSecrets('pub_main', TOKEN, pki.bundlePem);
		chmodSync(join(hostSecretDir('pub_main'), TOKEN_FILE), 0o644);
		expect(secretPresenceOutcome('pub_main')).toEqual({
			token_present: false,
			bundle_present: true,
			refused: 'bad_mode',
		});
	});

	test('a mixed-up bundle on disk → refused bad_bundle, the token still present', () => {
		writeHostSecrets('pub_main', TOKEN, pki.bundlePem);
		writeFileSync(
			join(hostSecretDir('pub_main'), BUNDLE_FILE),
			pki.clientCertPem + rogue.clientKeyPem + pki.caPem,
			{ mode: 0o600 },
		);
		expect(secretPresenceOutcome('pub_main')).toEqual({
			token_present: true,
			bundle_present: false,
			refused: 'bad_bundle',
		});
	});

	test('two hosts, one broken: each outcome is its own (one dead host never blanks the panel)', () => {
		writeHostSecrets('pub_main', TOKEN, pki.bundlePem);
		writeHostSecrets('pub_two', TOKEN, pki.bundlePem);
		chmodSync(hostSecretDir('pub_main'), 0o755);
		const outcomes = ['pub_main', 'pub_two'].map((name) => secretPresenceOutcome(name));
		expect(outcomes).toEqual([
			{ token_present: false, bundle_present: false, refused: 'bad_mode' },
			{ token_present: true, bundle_present: true, refused: null },
		]);
	});

	test('a bad name is refused as bad_name, not thrown', () => {
		expect(secretPresenceOutcome('../escape')).toEqual({
			token_present: false,
			bundle_present: false,
			refused: 'bad_name',
		});
	});
});

describe('no error message carries a secret byte', () => {
	test('mode, token and bundle refusals name the file, never its contents', () => {
		writeHostSecrets('pub_main', TOKEN, pki.bundlePem);
		const tokenPath = join(hostSecretDir('pub_main'), TOKEN_FILE);
		const bundlePath = join(hostSecretDir('pub_main'), BUNDLE_FILE);
		chmodSync(tokenPath, 0o640);
		const modeFailure = failure(() => readHostToken('pub_main'));
		chmodSync(tokenPath, 0o600);
		writeFileSync(tokenPath, `${TOKEN} trailing\n`, { mode: 0o600 });
		const tokenFailure = failure(() => readHostToken('pub_main'));
		writeFileSync(bundlePath, pki.clientCertPem + rogue.clientKeyPem + pki.caPem, { mode: 0o600 });
		const bundleFailure = failure(() => readHostTls('pub_main'));
		const messages = [modeFailure, tokenFailure, bundleFailure].map((f) => f.message);
		expect([modeFailure.reason, tokenFailure.reason, bundleFailure.reason]).toEqual([
			'bad_mode',
			'bad_token',
			'bad_bundle',
		]);
		for (const message of messages) {
			expect(message).not.toContain(TOKEN);
			expect(message).not.toContain(pemBody(rogue.clientKeyPem));
			expect(message).not.toContain(pemBody(pki.clientCertPem));
			expect(message).not.toContain('PRIVATE KEY');
		}
		expect(readFileSync(bundlePath, 'utf8')).toContain('PRIVATE KEY'); // the probe can see a key
	});
});
