/**
 * TRIPWIRE — a typed config field nobody reads is a lie about how config works
 * (P2-27 / DEAD-09).
 *
 * `config_docs_tripwire` already asserts "every catalog key is READ by the
 * engine". It cannot fire: it derives the read-set from a glob INCLUDING
 * `src/config/`, where every catalog key is read BY CONSTRUCTION to build the
 * typed object. So the assertion is true by definition and says nothing.
 *
 * This gate asks the question one layer up — which PROPERTIES of the frozen
 * `config` object does anything actually read? — and found two:
 *
 *   - `config.tools.registryCacheTtlMs`, materialized from a key the catalog
 *     itself documents as "*no longer consulted*" since the registry TTL was
 *     deleted at the cutover: a typed field built out of a value declared inert.
 *   - `config.external.zenonApiKey`, A SECRET. The live credential path is
 *     `transport.ts::attachCredential`, which reads the env key BY NAME through
 *     the catalog. So a security-relevant value had TWO readers, and the one an
 *     auditor finds first — the typed catalog, which this project's own hard
 *     rule says config is read through — was the DEAD one. That is the shape
 *     that gets a credential "fixed" in the place that does nothing.
 *
 * Both fields are gone. This keeps them gone.
 *
 * PREFIX-TOLERANT, deliberately: `const { maxBytes } = config.external` reads a
 * leaf without naming it, so a read of any ANCESTOR counts. The strict form
 * reported 65 false positives and would have been deleted within a week.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Glob } from 'bun';
import { config } from '../../src/config/config.ts';

const REPO_ROOT = join(import.meta.dir, '..', '..');

/**
 * Names the config object is bound to at a call site. `config` is the import;
 * the others are aliases in real files — missing `dedaloConfig` alone invented
 * a dead `features.maxRowsPerPage` that `section/read.ts` reads four times.
 */
const CONFIG_BINDINGS = /\b(?:config|dedaloConfig|cfg)\.([A-Za-z_][\w.]*)/g;

/**
 * Leaves that legitimately have no reader in this tree, each with the reason.
 * ENUMERATED: "nothing reads it" is a finding, not a category.
 */
const NO_READER_BY_DESIGN: Record<string, string> = {};

/** Every leaf path of the frozen config object. */
function configLeaves(): string[] {
	const paths: string[] = [];
	const walk = (node: unknown, path: string): void => {
		if (node === null || typeof node !== 'object' || Array.isArray(node)) {
			if (path !== '') paths.push(path);
			return;
		}
		for (const key of Object.keys(node as Record<string, unknown>)) {
			walk((node as Record<string, unknown>)[key], path === '' ? key : `${path}.${key}`);
		}
	};
	walk(config, '');
	return paths.sort();
}

/** Every `config.a.b` read OUTSIDE src/config/ (where reads are by construction). */
function configReads(): Set<string> {
	const read = new Set<string>();
	for (const dir of ['src', 'tools', 'scripts'] as const) {
		for (const rel of new Glob('**/*.ts').scanSync({ cwd: join(REPO_ROOT, dir) })) {
			const file = `${dir}/${rel}`;
			if (file.startsWith('src/config/')) continue;
			for (const match of readFileSync(join(REPO_ROOT, file), 'utf8').matchAll(CONFIG_BINDINGS)) {
				read.add(match[1] as string);
			}
		}
	}
	return read;
}

describe('no dead typed config field', () => {
	const leaves = configLeaves();
	const read = configReads();

	test('the census sees both sides (anti-vacuity)', () => {
		// Either side coming back empty would make the rule below vacuous.
		expect(leaves.length).toBeGreaterThan(100);
		expect(read.size).toBeGreaterThan(100);
		expect(read.has('media.rootPath') || read.has('media')).toBe(true);
	});

	test('every config property has a reader', () => {
		const dead = leaves
			.filter((leaf) => NO_READER_BY_DESIGN[leaf] === undefined)
			.filter((leaf) => {
				const parts = leaf.split('.');
				for (let i = parts.length; i > 0; i--) {
					if (read.has(parts.slice(0, i).join('.'))) return false;
				}
				return true;
			});
		expect(
			dead,
			'These typed config fields are read by NOTHING outside src/config/. A field built ' +
				'from a value nobody consults is a lie about how this engine is configured — and ' +
				'when it is a SECRET, it is the place an auditor will "fix" a credential with no ' +
				`effect. Delete the field, or record why it has no reader.\n  ${dead.join('\n  ')}`,
		).toEqual([]);
	});

	test('the two fields this gate was written for stay deleted', () => {
		// Named explicitly: a regression here is not a generic dead field, it is
		// the return of a duplicate reader for a credential.
		expect(leaves).not.toContain('tools.registryCacheTtlMs');
		expect(leaves).not.toContain('external.zenonApiKey');
		// ...and the ONE live credential reader is still the catalog-validated one.
		const transport = readFileSync(join(REPO_ROOT, 'src/external/transport.ts'), 'utf8');
		expect(transport).toContain('credentialCatalogKey');
		expect(transport).toContain('readOptionalString(key)');
	});

	test('each no-reader exemption is real and reasoned', () => {
		for (const [leaf, reason] of Object.entries(NO_READER_BY_DESIGN)) {
			expect(reason.length, `${leaf}: an exemption needs a real reason`).toBeGreaterThan(60);
			expect(leaves, `${leaf} is no longer a config field — DELETE its exemption`).toContain(leaf);
		}
	});
});
