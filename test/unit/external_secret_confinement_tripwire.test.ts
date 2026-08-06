/**
 * TRIPWIRE — a credential never comes from, and never returns to, the ontology.
 *
 * `api_config` is CATALOGUING DATA: anyone who can edit the ontology can write
 * it, and (through the ordinary section reads) many people can read it. So the
 * subsystem's rule is absolute — a credential VALUE comes only from the config
 * readers on a `scope:'secret'` catalog entry, and an adapter declares only the
 * KEY NAME. Three things are gated:
 *
 *  (a) no module under src/external/** pulls a credential-shaped field out of
 *      an api_config;
 *  (b) every credential an adapter names is a real catalog key with
 *      `scope:'secret'`, read through the readers;
 *  (c) a POSITIVE CONTROL: a hostile fixture api_config carrying a stray
 *      `api_key`, a `javascript:` ui_base_url and a non-allowlisted api_url is
 *      stripped or refused — so this file fails if the parser ever stops
 *      doing its job, not merely if someone deletes a line;
 *  (d) THE SAME POSITIVE CONTROL through BOTH PUBLICATION PATHS. api_config
 *      reaches a browser two ways — `request_config[].api_config` and the
 *      structure-context emitted-properties echo — and a control that drove
 *      only one of them would let the other rot. Both are driven here, plus a
 *      source scan proving no THIRD path exists.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Glob } from 'bun';
import { catalogEntry } from '../../src/config/catalog/index.ts';
import { resolveEmittedPropertiesAndCss } from '../../src/core/resolve/structure_context.ts';
import { parseApiConfig, publishApiConfig } from '../../src/external/config.ts';
import { ExternalServiceError } from '../../src/external/errors.ts';
import { listExternalServices } from '../../src/external/registry.ts';
import { overrideExternalSettingsForTests } from '../../src/external/settings.ts';

const EXTERNAL_DIR = join(import.meta.dir, '..', '..', 'src', 'external');
const ALLOWED_HOST = 'zenon.dainst.org';

function stripComments(source: string): string {
	return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

function externalSources(): { relative: string; code: string }[] {
	return [...new Glob('**/*.ts').scanSync({ cwd: EXTERNAL_DIR })].sort().map((relative) => ({
		relative,
		code: stripComments(readFileSync(join(EXTERNAL_DIR, relative), 'utf8')),
	}));
}

beforeEach(() => {
	overrideExternalSettingsForTests({ enabled: true, allowedHosts: [ALLOWED_HOST] });
});

afterEach(() => {
	overrideExternalSettingsForTests(null);
});

describe('(a) no credential is ever read out of an api_config', () => {
	const sources = externalSources();

	test('the subsystem is actually being scanned', () => {
		expect(sources.length).toBeGreaterThanOrEqual(9);
	});

	test('no module reads a credential-shaped field off a parsed api_config', () => {
		// Property reads like `apiConfig.api_key`, `config.token`, `source['secret']`.
		const forbidden =
			/\b(?:apiConfig|api_config|source|raw|properties)\s*(?:\.\s*|\[\s*['"])(?:api[_-]?key|apikey|token|secret|password|passwd|credential|authorization|bearer)\b/i;
		const violations = sources
			.filter((file) => forbidden.test(file.code))
			.map((file) => file.relative);
		expect(
			violations,
			'a credential-shaped api_config field is being read. Declare a credentialCatalogKey on the adapter instead — the ontology is editable data',
		).toEqual([]);
	});

	test('parseApiConfig STRIPS credential-shaped keys before anything can read them', () => {
		const code = sources.find((file) => file.relative === 'config.ts')?.code ?? '';
		expect(/CREDENTIAL_SHAPED_KEY/.test(code)).toBe(true);
		// Inside parseApiConfig the strip must come BEFORE any field is typed.
		const body = code.slice(code.indexOf('export function parseApiConfig'));
		expect(body.indexOf('CREDENTIAL_SHAPED_KEY.test')).toBeGreaterThan(-1);
		expect(body.indexOf('CREDENTIAL_SHAPED_KEY.test')).toBeLessThan(
			body.indexOf('validateUrlField('),
		);
	});

	test('the ONLY module that reads a credential value is the outbound door', () => {
		const readers = sources
			.filter((file) => /readOptionalString\s*\(|readEnv\s*\(|readString\s*\(/.test(file.code))
			.map((file) => file.relative);
		expect(readers).toEqual(['transport.ts']);
	});
});

describe('(b) every declared credential is a scope:secret catalog key', () => {
	for (const model of listExternalServices()) {
		test(`${model.service}`, () => {
			if (model.credentialCatalogKey === undefined) return;
			const entry = catalogEntry(model.credentialCatalogKey);
			expect(entry.scope, `${model.credentialCatalogKey} must be scope:'secret'`).toBe('secret');
			// A secret must never carry a default VALUE.
			expect(entry.default).toBeUndefined();
		});
	}
});

describe('(c) positive control — a hostile api_config is stripped or refused', () => {
	const hostile = {
		entity: 'zenon',
		api_url: `https://${ALLOWED_HOST}/api/v1/record`,
		api_key: 'SUPER-SECRET-VALUE',
		token: 'another-secret',
		ui_base_url: `https://${ALLOWED_HOST}/Record/`,
		response_map: [{ local: 'ar_records', remote: 'records' }],
	};

	test('a stray api_key / token never reaches the typed config', () => {
		const parsed = parseApiConfig(hostile, { sectionTipo: 'zzexternal1' });
		expect(JSON.stringify(parsed)).not.toContain('SUPER-SECRET-VALUE');
		expect(JSON.stringify(parsed)).not.toContain('another-secret');
		expect(Object.keys(parsed).sort()).toEqual([
			'apiUrl',
			'apiUrlSearch',
			'entity',
			'responseMap',
			'uiBaseUrl',
		]);
	});

	test("a 'javascript:' ui_base_url is REFUSED", () => {
		const error = (() => {
			try {
				parseApiConfig(
					{ ...hostile, ui_base_url: 'javascript:alert(document.cookie)' },
					{ sectionTipo: 'zzexternal1' },
				);
				return null;
			} catch (thrown) {
				return thrown as ExternalServiceError;
			}
		})();
		expect(error).toBeInstanceOf(ExternalServiceError);
		expect(error?.kind).toBe('bad_config');
		expect(error?.message).toContain('non-http(s) scheme');
	});

	test('a non-allowlisted api_url is REFUSED as blocked_host', () => {
		const error = (() => {
			try {
				parseApiConfig(
					{ ...hostile, api_url: 'https://attacker.example.net/api' },
					{ sectionTipo: 'zzexternal1' },
				);
				return null;
			} catch (thrown) {
				return thrown as ExternalServiceError;
			}
		})();
		expect(error?.kind).toBe('blocked_host');
		expect(error?.origin).toBe('https://attacker.example.net');
	});

	test('an api_url with embedded credentials is REFUSED', () => {
		expect(() =>
			parseApiConfig(
				{ ...hostile, api_url: `https://user:pw@${ALLOWED_HOST}/api/v1/record` },
				{ sectionTipo: 'zzexternal1' },
			),
		).toThrow(/embedded credentials/);
	});

	test('an error never carries the query string, the credential or the payload', () => {
		try {
			parseApiConfig(
				{ ...hostile, api_url: 'https://attacker.example.net/api?key=SUPER-SECRET-VALUE' },
				{ sectionTipo: 'zzexternal1' },
			);
			throw new Error('expected a refusal');
		} catch (thrown) {
			const message = (thrown as Error).message;
			expect(message).not.toContain('SUPER-SECRET-VALUE');
			expect(message).not.toContain('?key=');
		}
	});
});

describe('(d) the positive control drives BOTH publication paths', () => {
	/**
	 * The same hostile object as (c), plus the two shapes only a PUBLICATION
	 * path can be hurt by: an unknown key (which an allowlist, not a denylist,
	 * has to catch) and the cataloguer note rsc205 actually carries today.
	 */
	const hostile = {
		entity: 'zenon',
		api_url: `https://${ALLOWED_HOST}/api/v1/record`,
		api_url_search: `https://${ALLOWED_HOST}/api/v1/search`,
		ui_base_url: `https://${ALLOWED_HOST}/Record/`,
		response_map: [{ local: 'ar_records', remote: 'records' }],
		api_key: 'SUPER-SECRET-VALUE',
		bearer_token: 'another-secret',
		internal_admin_url: 'https://internal.example.net/admin',
		info: 'Added 24-06-2024 from reference in component_external->load_data_from_remote',
	};

	/** PATH 1 — request_config[].api_config (core/relations/request_config/external.ts). */
	test('path 1 (request_config): only the publishable keys survive', () => {
		const published = publishApiConfig(hostile, { sectionTipo: 'zzexternal1' });
		expect(Object.keys(published ?? {}).sort()).toEqual([
			'api_url',
			'api_url_search',
			'entity',
			'response_map',
			'ui_base_url',
		]);
		const serialized = JSON.stringify(published);
		expect(serialized).not.toContain('SUPER-SECRET-VALUE');
		expect(serialized).not.toContain('another-secret');
		expect(serialized).not.toContain('internal.example.net');
	});

	test("path 1: a 'javascript:' ui_base_url refuses the WHOLE binding", () => {
		// component_portal.js:2054 does `open_window({url: ui_base_url + section_id})`.
		expect(
			publishApiConfig(
				{ ...hostile, ui_base_url: 'javascript:alert(document.cookie)' },
				{ sectionTipo: 'zzexternal1' },
			),
		).toBeNull();
	});

	/** PATH 2 — the structure-context emitted-properties echo. */
	test('path 2 (structure context): the emitted properties carry no secret', () => {
		const { properties } = resolveEmittedPropertiesAndCss({
			model: 'section',
			mode: 'edit',
			tipo: 'zzexternal1',
			ownProperties: { color: '#6c72b6', api_config: hostile },
			sectionListChildProperties: null,
			sectionProperties: null,
		});
		const serialized = JSON.stringify(properties);
		expect(serialized).not.toContain('SUPER-SECRET-VALUE');
		expect(serialized).not.toContain('another-secret');
		expect(serialized).not.toContain('internal.example.net');
		// The echo keeps everything else verbatim.
		expect(properties.color).toBe('#6c72b6');
		expect(Object.keys(properties.api_config as object).sort()).toEqual([
			'api_url',
			'api_url_search',
			'entity',
			'response_map',
			'ui_base_url',
		]);
	});

	test('path 2: a refused api_config is DROPPED from the echo, never half-published', () => {
		const { properties } = resolveEmittedPropertiesAndCss({
			model: 'section',
			mode: 'edit',
			tipo: 'zzexternal1',
			ownProperties: {
				color: '#6c72b6',
				api_config: { ...hostile, ui_base_url: 'javascript:alert(1)' },
			},
			sectionListChildProperties: null,
			sectionProperties: null,
		});
		expect('api_config' in properties).toBe(false);
		expect(properties.color).toBe('#6c72b6');
	});

	/**
	 * The sanctioned files that mention api_config WITHOUT publishing one. Held
	 * to a stricter rule than the four real sites: any value they assign must be
	 * the literal `null` or a schema declaration.
	 */
	const INERT_EXEMPTIONS = new Set([
		'src/external/cache.ts',
		'src/external/search.ts',
		'src/core/api/handlers/dd_external_api.ts',
		'src/core/concepts/request_config.ts',
		'src/core/relations/request_config/implicit.ts',
	]);

	test('no THIRD publication path exists', () => {
		// Every site that puts an api_config on a wire-bound object must go
		// through publishApiConfig. A raw read like `properties.api_config` is
		// allowed ONLY where it is immediately handed to the shaper.
		const SANCTIONED = new Set([
			'src/external/config.ts', // the shaper itself
			'src/core/relations/request_config/external.ts', // path 1
			'src/core/relations/request_config/explicit.ts', // path 1: the typed field
			'src/core/resolve/structure_context.ts', // path 2
			// NAMED EXEMPTIONS — mention api_config without publishing a value.
			// Each is re-read whenever this list changes; none may grow into a site
			// that puts an ontology value on a wire object.
			'src/external/cache.ts', // the word appears only in a refusal message
			'src/external/search.ts', // likewise: 'the section api_config declares no api_url_search'
			'src/core/api/handlers/dd_external_api.ts', // likewise: 'carries no api_config'
			'src/core/concepts/request_config.ts', // the RQO SCHEMA field (inbound, never echoed)
			'src/core/relations/request_config/implicit.ts', // stamps the literal null
		]);
		const root = join(import.meta.dir, '..', '..', 'src');
		const offenders: string[] = [];
		const exemptionsThatGrew: string[] = [];
		for (const relative of new Glob('**/*.ts').scanSync({ cwd: root })) {
			const path = `src/${relative}`;
			const code = stripComments(readFileSync(join(root, relative), 'utf8'));
			if (!/\bapi_config\b/.test(code)) continue;
			if (!SANCTIONED.has(path)) {
				offenders.push(path);
				continue;
			}
			// The three EXEMPT files must stay inert: an `api_config` they assign may
			// only be the literal `null` or a schema declaration. This is what stops
			// an exemption from quietly becoming a publication site.
			if (INERT_EXEMPTIONS.has(path)) {
				for (const match of code.matchAll(/\bapi_config\b\s*[:=]\s*(\S+)/g)) {
					const value = match[1] ?? '';
					if (!/^null\b/.test(value) && !value.startsWith('z.')) {
						exemptionsThatGrew.push(`${path}: api_config = ${value}`);
					}
				}
			}
		}
		expect(
			offenders,
			'a new api_config site appeared — route it through publishApiConfig (src/external/config.ts) and add it to SANCTIONED',
		).toEqual([]);
		expect(
			exemptionsThatGrew,
			'an EXEMPT file started assigning a real api_config value — it is now a publication path',
		).toEqual([]);
	});
});
