/**
 * ONTOLOGY api_config → a typed, credential-stripped, allowlist-validated
 * binding.
 *
 * A section is "external" when its ontology node carries `properties.api_config`
 * (zenon1, test3 — plus rsc205, whose copy is a stale duplicate left by a 2024
 * edit). That property is CATALOGUING DATA: anyone who can edit the ontology can
 * change where the server points. Everything in this module follows from that
 * one fact:
 *
 *  - the api_url's HOST must be in the operator's allowlist, or the binding is
 *    refused outright — the ontology proposes, the operator disposes;
 *  - `ui_base_url` must be http(s), so an edit cannot turn a record link into
 *    `javascript:…` in every user's browser;
 *  - any CREDENTIAL-SHAPED key is STRIPPED before the value is typed, and the
 *    strip is reported. Credentials come from the config readers on a
 *    `scope:'secret'` catalog entry, never from here. Stripping rather than
 *    refusing is deliberate: a legacy install with a key pasted into the
 *    ontology must keep working (minus the key), not fail to boot a section.
 *
 * The resolved binding is cached through `createOntologyCache`, which IS the
 * right lifecycle here — the content is ontology-derived, so an ontology
 * write should drop it. (The circuit breaker deliberately does NOT use it; see
 * breaker.ts.)
 */

import { createOntologyCache } from '../core/ontology/cache_factory.ts';
import { getPropertiesByTipo } from '../core/ontology/resolver.ts';
import type {
	ExternalApiConfig,
	PublishedApiConfig,
	ResolvedExternalService,
} from './api/types.ts';
import type { ResponseMap } from './descriptor_types.ts';
import { ExternalServiceError, originOf } from './errors.ts';
import { getExternalService } from './registry.ts';
import { isAllowedExternalHost } from './transport.ts';

/**
 * Key names that may hold a secret. Matched case-insensitively against every
 * api_config key; a hit is dropped and warned about. Deliberately broad — a
 * false positive costs an unused ontology field, a false negative ships a
 * credential to anyone who can read the ontology.
 */
const CREDENTIAL_SHAPED_KEY =
	/(api[_-]?key|apikey|token|secret|password|passwd|credential|authorization|auth[_-]?header|bearer)/i;

/** Section tipo → its resolved external binding (null = not an external section). */
const resolvedBySection = createOntologyCache<string, ResolvedExternalService | null>();

function badConfig(sectionTipo: string, detail: string, service = 'unknown'): never {
	throw new ExternalServiceError({ service, kind: 'bad_config', sectionTipo, detail });
}

/** Validate one URL field: parseable, http(s), and (when fetched) allowlisted. */
function validateUrlField(
	sectionTipo: string,
	service: string,
	field: string,
	value: unknown,
	options: { readonly fetched: boolean },
): string {
	if (typeof value !== 'string' || value.trim().length === 0) {
		badConfig(sectionTipo, `api_config.${field} is not a non-empty string`, service);
	}
	let url: URL;
	try {
		url = new URL(value.trim());
	} catch {
		badConfig(sectionTipo, `api_config.${field} is not a URL`, service);
	}
	if (url.protocol !== 'http:' && url.protocol !== 'https:') {
		// This is the `javascript:` case for ui_base_url, and the `file:`/`gopher:`
		// case for an api_url. Refuse loudly — a silently dropped link is a
		// mystery, a refused one is a bug report.
		badConfig(sectionTipo, `api_config.${field} has a non-http(s) scheme`, service);
	}
	if (url.username !== '' || url.password !== '') {
		badConfig(sectionTipo, `api_config.${field} carries embedded credentials`, service);
	}
	if (options.fetched && !isAllowedExternalHost(url.hostname)) {
		throw new ExternalServiceError({
			service,
			kind: 'blocked_host',
			origin: originOf(url),
			sectionTipo,
			detail: `api_config.${field} host is not in DEDALO_EXTERNAL_ALLOWED_HOSTS`,
		});
	}
	return url.toString();
}

function parseResponseMap(sectionTipo: string, service: string, raw: unknown): ResponseMap {
	if (raw === undefined || raw === null) return [];
	if (!Array.isArray(raw))
		badConfig(sectionTipo, 'api_config.response_map is not an array', service);
	return raw.map((item, index) => {
		if (typeof item !== 'object' || item === null) {
			badConfig(sectionTipo, `api_config.response_map[${index}] is not an object`, service);
		}
		const pair = item as Record<string, unknown>;
		if (typeof pair.local !== 'string' || typeof pair.remote !== 'string') {
			badConfig(
				sectionTipo,
				`api_config.response_map[${index}] needs string local + remote`,
				service,
			);
		}
		return { local: pair.local, remote: pair.remote };
	});
}

/**
 * THE parser. Every api_config in the installation goes through it, and nothing
 * else may build an `ExternalApiConfig` — the constructor IS the validation.
 * Throws `bad_config` / `blocked_host`; never returns a partly-vetted object.
 */
export function parseApiConfig(raw: unknown, context: { sectionTipo: string }): ExternalApiConfig {
	const { sectionTipo } = context;
	if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
		badConfig(sectionTipo, 'api_config is not an object');
	}
	const source = raw as Record<string, unknown>;

	// Credential strip, FIRST — before anything downstream can read a value.
	const stripped = Object.keys(source).filter((key) => CREDENTIAL_SHAPED_KEY.test(key));
	if (stripped.length > 0) {
		console.warn(
			`[external:unknown] bad_config section=${sectionTipo} credential-shaped api_config key(s) ignored: ${stripped.join(', ')} — secrets belong in ../private/.env on a scope:'secret' catalog key, never in the ontology`,
		);
	}

	const entity = source.entity;
	if (typeof entity !== 'string' || !/^[a-z0-9_]+$/i.test(entity)) {
		badConfig(sectionTipo, 'api_config.entity is missing or not a bare name');
	}
	const service = entity.toLowerCase();

	const apiUrl = validateUrlField(sectionTipo, service, 'api_url', source.api_url, {
		fetched: true,
	});
	const apiUrlSearch =
		source.api_url_search === undefined || source.api_url_search === null
			? null
			: validateUrlField(sectionTipo, service, 'api_url_search', source.api_url_search, {
					fetched: true,
				});
	// ui_base_url is RENDERED, not fetched: its scheme is what matters, and the
	// host allowlist (which governs what this SERVER contacts) does not apply.
	const uiBaseUrl =
		source.ui_base_url === undefined || source.ui_base_url === null
			? null
			: validateUrlField(sectionTipo, service, 'ui_base_url', source.ui_base_url, {
					fetched: false,
				});

	return {
		entity: service,
		apiUrl,
		apiUrlSearch,
		uiBaseUrl,
		responseMap: parseResponseMap(sectionTipo, service, source.response_map),
	};
}

/**
 * The ONLY keys an api_config may put on the wire. An ALLOWLIST, not a
 * denylist: the credential regex catches a key called `api_token`, but only an
 * allowlist catches a future `internal_admin_url` or `debug_dump`. Everything
 * unlisted — including rsc205's cataloguer note `info` — is dropped.
 */
const PUBLISHABLE_API_CONFIG_KEYS: readonly string[] = [
	'entity',
	'api_url',
	'api_url_search',
	'ui_base_url',
	'response_map',
];

/**
 * THE PUBLICATION SHAPER — the one function that turns a raw ontology
 * `api_config` into something a browser may receive. Both publication paths go
 * through it: the parsed `request_config[].api_config`
 * (core/relations/request_config/external.ts) and the structure-context
 * emitted-properties echo (core/resolve/structure_context.ts).
 *
 * Guarantees, in the order they are enforced:
 *  1. CREDENTIAL-SHAPED keys are stripped (same regex as parseApiConfig);
 *  2. only PUBLISHABLE_API_CONFIG_KEYS survive;
 *  3. every URL is parseable, http(s) and free of embedded credentials.
 *     `ui_base_url` is the one that matters most: the portal concatenates it
 *     with a section_id and hands the result to open_window
 *     (client/dedalo/core/component_portal/js/component_portal.js:2054), so a
 *     `javascript:` value stored in the ontology would be stored XSS on a
 *     curator's click.
 *
 * WHY NO HOST ALLOWLIST HERE, unlike parseApiConfig. `DEDALO_EXTERNAL_ALLOWED_HOSTS`
 * governs what THIS SERVER contacts. These URLs are rendered by, and fetched
 * from, the CURATOR'S BROWSER — a different trust boundary — and gating them on
 * the server's egress list would silently break a working catalogue link on
 * every install that has not opted into server-side fetching yet.
 *
 * NEVER THROWS. Both call sites are read paths whose job is to render a form;
 * a mis-catalogued api_config must degrade to "no external binding published",
 * loudly logged, not 500 a section read. (Same posture as
 * component_external/value.ts deriveExternalValue.)
 */
export function publishApiConfig(
	raw: unknown,
	context: { sectionTipo: string },
): PublishedApiConfig | null {
	const { sectionTipo } = context;
	if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
		console.warn(
			`[external:unknown] bad_config section=${sectionTipo} api_config is not an object — not published`,
		);
		return null;
	}
	const source = raw as Record<string, unknown>;

	// (1) credential strip, FIRST — before any value is read.
	const credentialKeys = Object.keys(source).filter((key) => CREDENTIAL_SHAPED_KEY.test(key));
	if (credentialKeys.length > 0) {
		console.warn(
			`[external:unknown] bad_config section=${sectionTipo} credential-shaped api_config key(s) not published: ${credentialKeys.join(', ')} — secrets belong in ../private/.env on a scope:'secret' catalog key, never in the ontology`,
		);
	}
	// (2) unknown keys dropped.
	const droppedKeys = Object.keys(source).filter(
		(key) => !credentialKeys.includes(key) && !PUBLISHABLE_API_CONFIG_KEYS.includes(key),
	);
	if (droppedKeys.length > 0) {
		console.warn(
			`[external:unknown] section=${sectionTipo} api_config key(s) not on the publishable allowlist, dropped: ${droppedKeys.join(', ')}`,
		);
	}

	try {
		const entity = source.entity;
		if (typeof entity !== 'string' || !/^[a-z0-9_]+$/i.test(entity)) {
			badConfig(sectionTipo, 'api_config.entity is missing or not a bare name');
		}
		const service = entity.toLowerCase();
		// (3) URL vetting. `fetched:false` everywhere — see the header on why the
		// host allowlist is not this boundary's control.
		const published: PublishedApiConfig = {
			entity: service,
			api_url: validateUrlField(sectionTipo, service, 'api_url', source.api_url, {
				fetched: false,
			}),
			...(source.api_url_search === undefined || source.api_url_search === null
				? {}
				: {
						api_url_search: validateUrlField(
							sectionTipo,
							service,
							'api_url_search',
							source.api_url_search,
							{ fetched: false },
						),
					}),
			...(source.ui_base_url === undefined || source.ui_base_url === null
				? {}
				: {
						ui_base_url: validateUrlField(sectionTipo, service, 'ui_base_url', source.ui_base_url, {
							fetched: false,
						}),
					}),
			response_map: parseResponseMap(sectionTipo, service, source.response_map),
		};
		return published;
	} catch (error) {
		// A PARTLY vetted binding is a trap (the client would build a link from a
		// half-valid config), so a single bad field refuses the whole object.
		console.warn(
			`[external:unknown] section=${sectionTipo} api_config refused, not published: ${(error as Error).message}`,
		);
		return null;
	}
}

/**
 * The section's external binding, or null when the section is a normal one.
 *
 * An api_config naming an UNREGISTERED service throws
 * `ExternalServiceNotRegisteredError` — it is never quietly reported as "not an
 * external section", which would turn a typo into an empty component.
 */
export async function getExternalServiceForSection(
	sectionTipo: string,
): Promise<ResolvedExternalService | null> {
	const cached = resolvedBySection.get(sectionTipo);
	if (cached !== undefined) return cached;
	const properties = await getPropertiesByTipo(sectionTipo);
	const raw =
		typeof properties === 'object' && properties !== null
			? (properties as Record<string, unknown>).api_config
			: undefined;
	if (raw === undefined || raw === null) {
		resolvedBySection.set(sectionTipo, null);
		return null;
	}
	const apiConfig = parseApiConfig(raw, { sectionTipo });
	const model = getExternalService(apiConfig.entity, { sectionTipo });
	const resolved: ResolvedExternalService = { sectionTipo, model, apiConfig };
	resolvedBySection.set(sectionTipo, resolved);
	return resolved;
}

/**
 * True when the section's records live in an external service. A malformed or
 * refused api_config still THROWS — "is this external?" must not be the place a
 * configuration error becomes silence.
 */
export async function isExternalSectionTipo(sectionTipo: string): Promise<boolean> {
	return (await getExternalServiceForSection(sectionTipo)) !== null;
}
