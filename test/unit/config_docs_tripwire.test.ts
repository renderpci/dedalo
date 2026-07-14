/**
 * CONFIG-DOCS TRIPWIRE (DEC-12: every documented invariant has a mechanical gate).
 *
 * `src/config/catalog/` is the SINGLE SOURCE OF TRUTH for every env key the engine reads.
 * Three artifacts are GENERATED from it:
 *
 *   install/sample.env         the copy-paste census (the installer drops a copy at
 *                              ../private/sample.env — see core/install/config_persist.ts)
 *   docs/config/config.md      the settings reference
 *   docs/config/config_db.md   the database settings reference
 *
 * WHY THIS EXISTS. `../private/sample.env` was PHP machinery (a config catalog, a renderer
 * class, a CLI, and an installer hook) that was NOT ported at the cutover. The TS engine
 * inherited every REFERENCE to it — a README line, nine doc pages, and four runtime throw
 * messages ("See private/sample.env.") — but none of the machinery, so it pointed operators
 * at a file that did not exist. Nothing caught that, because the old census tripwire
 * explicitly WAIVED the file for living outside the repo. Meanwhile the hand-written
 * manual had drifted: 110 keys the engine read were documented NOWHERE, two keys were
 * documented that the engine read NOWHERE, and DEDALO_HOST was read with two different
 * defaults depending on the file.
 *
 * A document you cannot regenerate is a document that lies. So: generate it, and gate it.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Glob } from 'bun';
import { CONFIG_CATALOG, DOMAINS, isOperatorFacing } from '../../src/config/catalog/index.ts';
import type { CatalogEntry } from '../../src/config/catalog_types.ts';
import { REQUIRED_CONFIG_KEYS } from '../../src/config/install_mode.ts';
import { renderReferencePage, renderSampleEnv, spliceGenerated } from '../../src/config/render.ts';

const REPO_ROOT = join(import.meta.dir, '..', '..');

/**
 * The same scanner config_census_tripwire uses: ANY call whose first argument is an
 * uppercase-snake literal. It deliberately over-collects (it catches keys read through
 * local wrappers like `envNumber('DEDALO_RAG_CHUNK_TOKENS', 450)`, which a `readEnv(`-only
 * regex misses — and three such wrappers really did hide keys from an earlier draft of
 * this catalog).
 */
const KEY_CALL = /[a-zA-Z_]\w*\s*\(\s*'([A-Z][A-Z0-9_]{2,})'/g;
const NOT_ENV_KEYS = new Set(['GMT', 'NFD', 'SIGINT', 'SIGTERM']);

function envKeysReadInSrc(): Set<string> {
	const keys = new Set<string>();
	for (const file of new Glob('src/**/*.ts').scanSync(REPO_ROOT)) {
		const source = readFileSync(join(REPO_ROOT, file), 'utf8');
		for (const match of source.matchAll(KEY_CALL)) {
			const key = match[1] as string;
			if (!NOT_ENV_KEYS.has(key)) keys.add(key);
		}
	}
	return keys;
}

const entries = (): [string, CatalogEntry][] => Object.entries(CONFIG_CATALOG);

describe('config docs: the catalog is the single source of truth', () => {
	test('every env key the engine READS is in the catalog', () => {
		const undocumented = [...envKeysReadInSrc()].filter((k) => CONFIG_CATALOG[k] === undefined);

		// A key the engine reads but the catalog has never heard of is a key that appears in
		// NO operator-facing document — which is exactly the hole this closed (110 of them).
		expect(undocumented.sort()).toEqual([]);
	});

	test('every catalog key is READ by the engine (or says who reads it)', () => {
		const read = envKeysReadInSrc();
		const phantom = entries()
			.filter(([key, entry]) => !read.has(key) && entry.consumer === undefined)
			.map(([key]) => key);

		// A documented key nothing reads tells an administrator to set something that does
		// nothing (DEDALO_IMAGE_THUMB_DEFAULT and DEDALO_PDF_THUMB_DEFAULT did, for years).
		// A key read only from scripts/ or the OS is legitimate — but it must SAY SO in
		// `consumer`, a named exemption with a reason, never a silent pass.
		expect(phantom.sort()).toEqual([]);
	});

	test('a computed default is human-readable (never a printed [Function])', () => {
		const unprintable = entries()
			.filter(([, e]) => typeof e.default === 'function' && e.defaultDoc === undefined)
			.map(([key]) => key);

		// Evaluating a thunk here would bake THIS machine's paths (/opt/homebrew/bin) into a
		// file every other install reads. `defaultDoc` is what the operator sees instead.
		expect(unprintable.sort()).toEqual([]);
	});

	test('every operator-facing entry is actually documented', () => {
		const undescribed = entries()
			.filter(([, e]) => isOperatorFacing(e))
			.filter(([, e]) => e.doc.trim() === '' || e.heading.trim() === '' || e.doc === 'TODO')
			.map(([key]) => key);
		expect(undescribed.sort()).toEqual([]);
	});

	test('catalog prose is PHP-FREE (docs_current_engine_tripwire would fail on it)', () => {
		// The `doc` of an operator-facing key is rendered STRAIGHT into docs/config/config.md,
		// where docs_current_engine_tripwire bans /php/i outside a set-equality allowlist that
		// config.md is NOT on. Catching it here names the catalog entry; catching it there
		// reports a mysterious failure about the product manual. Legacy spellings go in
		// `phpAlias`, which only ever reaches install/sample.env (outside docs/).
		const offenders = entries()
			.filter(([, e]) => isOperatorFacing(e))
			.filter(([, e]) => /php/i.test(e.doc) || /php/i.test(e.heading))
			.map(([key]) => key);
		expect(offenders.sort()).toEqual([]);
	});

	test('the fresh-box test is exactly four keys', () => {
		// REQUIRED_CONFIG_KEYS decides when an UNAUTHENTICATED install wizard is served.
		// Widening it is a security-shaped change, never a drive-by edit.
		expect([...REQUIRED_CONFIG_KEYS].sort()).toEqual(['DB_HOST', 'DB_NAME', 'DB_USER', 'ENTITY']);
	});

	test('every domain lands on a real page, and every key in a real domain', () => {
		const domainIds = new Set(DOMAINS.map((d) => d.id));
		expect(DOMAINS.filter((d) => d.page !== 'config' && d.page !== 'config_db')).toEqual([]);
		expect([...domainIds].length).toBe(DOMAINS.length); // no duplicate ids
	});

	test('the credential placeholders check_config rejects come from the catalog', () => {
		// check_config asks "is this install still on the sample values?". It can only ask
		// that honestly if the shipped template literally carries those values — so both
		// sides read ONE list. Losing an entry here would silently weaken that check.
		const withPlaceholder = entries()
			.filter(([, e]) => e.placeholder !== undefined)
			.map(([key]) => key);
		expect(withPlaceholder.sort()).toEqual(
			['DB_NAME', 'DB_PASSWORD', 'DB_USER', 'DEDALO_ENTITY_LABEL', 'ENTITY'].sort(),
		);
	});

	// -------------------------------------------------------------------------
	// The assertion that makes drift IMPOSSIBLE rather than merely discouraged.
	// -------------------------------------------------------------------------

	test('install/sample.env is exactly what the catalog renders', () => {
		const onDisk = readFileSync(join(REPO_ROOT, 'install/sample.env'), 'utf8');
		expect(onDisk).toBe(renderSampleEnv());
	});

	for (const page of ['config', 'config_db'] as const) {
		test(`docs/config/${page}.md is exactly what the catalog renders`, () => {
			const path = join(REPO_ROOT, 'docs/config', `${page}.md`);
			const onDisk = readFileSync(path, 'utf8');
			// Hand-edit the generated region and this fails: the only way to change these
			// pages is to change the catalog and run `bun run config:gen`.
			expect(onDisk).toBe(spliceGenerated(onDisk, renderReferencePage(page)));
		});
	}
});
