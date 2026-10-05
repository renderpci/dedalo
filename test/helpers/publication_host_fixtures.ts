/**
 * PUBLICATION-HOST TEST FIXTURES — THE ONE helper every phase-3 gate uses for the two things
 * they all need: a declared scratch base for the registry + secrets stores, and a throwaway
 * PKI shaped exactly like the agent provisioner's output (phase 2, D2: CA, server cert with
 * SAN 127.0.0.1/localhost, engine client cert + key, and the engine bundle = client cert,
 * client key (PKCS#8), CA — in that order). Tasks 3 (transport gate), 4 (mock agent) and 5
 * (pair CLI) import it; a second PKI helper or a second base seam is a fork.
 *
 * The PKI is minted by the `openssl` CLI in a mkdtemp dir that is removed before the
 * function returns; only PEM TEXT leaves it. Every key is checked to be ONE PKCS#8
 * `PRIVATE KEY` block before it leaves (the engine bundle refuses any other form), so an
 * openssl that writes SEC1 fails HERE, by name, not as a mysterious bad_bundle later.
 * No openssl on PATH is RED, never a skip: the CI image ships it (ci/Dockerfile) and a
 * skipped secrets gate asserts nothing. A rogue-CA case is a second mintTestPki(cn) call:
 * its server cert names 127.0.0.1 too, but chains to another CA.
 *
 * Nothing here touches a database or the live <private>: the scratch base lives under
 * the OS temp dir and carries PUBLICATION_HOSTS_TEST_MARKER, the only kind of directory
 * `overridePublicationHostsBaseForTests` accepts.
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	overridePublicationHostsBaseForTests,
	PUBLICATION_HOSTS_TEST_MARKER,
} from '../../src/core/publication_host/registry.ts';

/** A fresh declared scratch base, already installed as the stores' base. dispose() restores. */
export function useScratchPublicationHostsBase(): { base: string; dispose: () => void } {
	const base = mkdtempSync(join(tmpdir(), 'dedalo_pubhosts_'));
	writeFileSync(
		join(base, PUBLICATION_HOSTS_TEST_MARKER),
		'scratch publication-hosts base — a test created this\n',
	);
	overridePublicationHostsBaseForTests(base);
	return {
		base,
		dispose: () => {
			overridePublicationHostsBaseForTests(null);
			rmSync(base, { recursive: true, force: true });
		},
	};
}

export interface TestPki {
	caPem: string;
	serverCertPem: string;
	serverKeyPem: string;
	clientCertPem: string;
	clientKeyPem: string;
	/** client cert + client key + CA: the agent provisioner's engine_bundle.pem layout. */
	bundlePem: string;
}

function openssl(dir: string, args: string[]): void {
	const binary = Bun.which('openssl');
	if (binary === null) {
		throw new Error(
			'publication_host_fixtures: openssl is not on PATH — the PKI fixture cannot be minted (install openssl; CI ships it)',
		);
	}
	const run = Bun.spawnSync([binary, ...args], { cwd: dir, stdout: 'pipe', stderr: 'pipe' });
	if (run.exitCode !== 0) {
		throw new Error(
			`publication_host_fixtures: openssl ${args[0]} failed: ${run.stderr.toString().trim()}`,
		);
	}
}

const EC_KEY = ['-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:P-256', '-nodes'];
const PKCS8_KEY = /^-----BEGIN PRIVATE KEY-----\n[A-Za-z0-9+/=\n]+-----END PRIVATE KEY-----\n$/;

function issue(dir: string, name: string, cn: string, extensions: string): void {
	openssl(dir, [
		'req',
		'-new',
		...EC_KEY,
		'-keyout',
		`${name}.key`,
		'-out',
		`${name}.csr`,
		'-subj',
		`/CN=${cn}`,
	]);
	writeFileSync(join(dir, `${name}.ext`), extensions);
	openssl(dir, [
		'x509',
		'-req',
		'-in',
		`${name}.csr`,
		'-CA',
		'ca.pem',
		'-CAkey',
		'ca.key',
		'-set_serial',
		name === 'server' ? '2' : '3',
		'-days',
		'2',
		'-out',
		`${name}.pem`,
		'-extfile',
		`${name}.ext`,
	]);
}

/** A key as it left openssl, refused unless it is one PKCS#8 block (the bundle's form). */
function pkcs8(dir: string, file: string): string {
	const pem = readFileSync(join(dir, file), 'utf8');
	if (!PKCS8_KEY.test(pem)) {
		throw new Error(
			`publication_host_fixtures: ${file} is not one PKCS#8 'PRIVATE KEY' block — this openssl writes another key form; the engine bundle needs PKCS#8`,
		);
	}
	return pem;
}

/**
 * Mint a CA + server + client set. `cn` lets two calls produce two unrelated PKIs
 * (a rogue-CA case). `serverSan` is the server leaf's subjectAltName: the default names
 * 127.0.0.1 and localhost; a channel gate that must prove the certificate is checked
 * against the REGISTRY host passes 'IP:127.0.0.1' and dials 'localhost'. Takes ~100 ms;
 * mint once per test file.
 */
export function mintTestPki(
	cn = 'dedalo-test-publication-host',
	serverSan = 'IP:127.0.0.1,DNS:localhost',
): TestPki {
	const dir = mkdtempSync(join(tmpdir(), 'dedalo_pubhost_pki_'));
	try {
		openssl(dir, [
			'req',
			'-x509',
			...EC_KEY,
			'-keyout',
			'ca.key',
			'-out',
			'ca.pem',
			'-days',
			'2',
			'-subj',
			`/CN=${cn}-ca`,
			'-addext',
			'basicConstraints=critical,CA:TRUE',
			'-addext',
			'keyUsage=critical,keyCertSign,cRLSign',
		]);
		issue(
			dir,
			'server',
			`${cn}-agent`,
			`basicConstraints=CA:FALSE\nextendedKeyUsage=serverAuth\nsubjectAltName=${serverSan}\n`,
		);
		issue(
			dir,
			'client',
			`${cn}-engine`,
			'basicConstraints=CA:FALSE\nextendedKeyUsage=clientAuth\n',
		);
		const read = (file: string) => readFileSync(join(dir, file), 'utf8');
		const clientKeyPem = pkcs8(dir, 'client.key');
		return {
			caPem: read('ca.pem'),
			serverCertPem: read('server.pem'),
			serverKeyPem: pkcs8(dir, 'server.key'),
			clientCertPem: read('client.pem'),
			clientKeyPem,
			bundlePem: read('client.pem') + clientKeyPem + read('ca.pem'),
		};
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

/**
 * A self-signed LEAF (basicConstraints CA:FALSE) and its PKCS#8 key. It verifies its own
 * signature and matches its key, so `cert + key + cert` passes every bundle check EXCEPT
 * "the third block is a CA" — the one case that isolates that check. The extensions come
 * from a config written here, never openssl's default (which may add CA:TRUE to -x509).
 */
export function mintSelfSignedLeaf(cn = 'dedalo-test-leaf'): { certPem: string; keyPem: string } {
	const dir = mkdtempSync(join(tmpdir(), 'dedalo_pubhost_leaf_'));
	try {
		writeFileSync(
			join(dir, 'leaf.cnf'),
			`[req]\ndistinguished_name=dn\nx509_extensions=leaf\nprompt=no\n[dn]\nCN=${cn}\n[leaf]\nbasicConstraints=critical,CA:FALSE\n`,
		);
		openssl(dir, [
			'req',
			'-x509',
			...EC_KEY,
			'-config',
			'leaf.cnf',
			'-keyout',
			'leaf.key',
			'-out',
			'leaf.pem',
			'-days',
			'2',
		]);
		return { certPem: readFileSync(join(dir, 'leaf.pem'), 'utf8'), keyPem: pkcs8(dir, 'leaf.key') };
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}
