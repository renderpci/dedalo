/**
 * tool_import_rdf server module (PHP tool_import_rdf::get_rdf_data). Fetches each
 * RDF URI (SSRF-guarded) and parses it with the from-scratch RDF/XML parser
 * (rdf_xml.ts, no 3rd-party lib), returning the extracted subjects/properties.
 *
 * The subject→Dédalo ontology CLASS-MAP (properties.xmlns / class_map_to_dd) is
 * config-driven and ledgered; the fetch + graph parse are real.
 *
 * GATE: WRITE (level 2) on the LOCATOR's section — the target the resolved
 * values are destined for — matching PHP's assert_section_permission(…, 2).
 * The target rides inside `options.locator`, so the gate is declared as
 * 'section_list' (see rdfSectionTipos): a plain 'section' spec reads
 * `options.section_tipo`, which this tool's client never sends.
 */

import { getPermissions } from '../../../src/core/security/permissions.ts';
import type {
	ToolActionContext,
	ToolResponse,
	ToolServerModule,
} from '../../../src/core/tools/module.ts';
import { type RdfMapEntry, applyRdfMap, parseRdfXml } from '../../../src/core/tools/rdf_xml.ts';

function fail(message: string): ToolResponse {
	return { result: false, msg: `Error. ${message}`, errors: [message] };
}

/**
 * SSRF guard for outbound RDF fetches (PHP is_safe_remote_url, SEC-072).
 *
 * LITERAL-HOST half only, and deliberately over-broad: it rejects the whole
 * loopback/link-local/private/reserved space rather than the handful of
 * addresses the first port spelled out — `127.0.0.2`, `0.0.0.0`, `[::]`,
 * `10.x` written as a decimal integer and `anything.localhost` all resolved to
 * a local service and all passed the old checks.
 *
 * NOT COVERED (escalated in the tools audit report, PHP does both): DNS
 * resolution of a public NAME that points at a private address, and the
 * redirect hop — Bun's fetch follows 3xx, so a public URL may still land on an
 * internal one. PHP resolves once and pins CURLOPT_RESOLVE.
 */
export function isSafeRemoteUrl(uri: string): boolean {
	let url: URL;
	try {
		url = new URL(uri);
	} catch {
		return false;
	}
	if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
	// URL lowercases the host and strips the [] of an IPv6 literal.
	const host = url.hostname.replace(/^\[|]$/g, '');
	if (host === '') return false;
	if (host === 'localhost' || host.endsWith('.localhost') || host === 'localhost.localdomain') {
		return false;
	}

	// IPv4 dotted-quad (incl. the 0-padded forms) → check the numeric ranges.
	const quad = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
	if (quad !== null) {
		const [a, b] = [Number(quad[1]), Number(quad[2])];
		if (a === 0 || a === 10 || a === 127) return false; // this-network, private, loopback
		if (a === 169 && b === 254) return false; // link-local (cloud metadata)
		if (a === 172 && b >= 16 && b <= 31) return false; // private
		if (a === 192 && b === 168) return false; // private
		if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT
		if (a >= 224) return false; // multicast + reserved
		return true;
	}
	// A bare integer / hex host is an alternate IPv4 spelling ('2130706433' =
	// 127.0.0.1). Never legitimate for an RDF URI — refuse the whole shape.
	if (/^(\d+|0x[0-9a-f]+)$/i.test(host)) return false;

	// IPv6 literal: refuse loopback, unspecified, unique-local and link-local,
	// plus the IPv4-mapped forms of all of the above.
	if (host.includes(':')) {
		if (host === '::1' || host === '::') return false;
		if (/^f[cd][0-9a-f]{2}:/i.test(host)) return false; // fc00::/7
		if (/^fe[89ab][0-9a-f]:/i.test(host)) return false; // fe80::/10
		// IPv4-MAPPED (::ffff:a.b.c.d). URL normalizes the dotted tail to hextets
		// ('::ffff:127.0.0.1' → '::ffff:7f00:1'), so decode BOTH spellings and
		// re-run the IPv4 rules on the address they denote.
		const dotted = host.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i);
		if (dotted !== null) return isSafeRemoteUrl(`${url.protocol}//${dotted[1]}`);
		const hextets = host.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
		if (hextets !== null) {
			const high = Number.parseInt(hextets[1] as string, 16);
			const low = Number.parseInt(hextets[2] as string, 16);
			const quad = [high >> 8, high & 0xff, low >> 8, low & 0xff].join('.');
			return isSafeRemoteUrl(`${url.protocol}//${quad}`);
		}
		return true;
	}
	return true;
}

/**
 * The action's permission target (the 'section_list' gate reads this).
 *
 * The client posts the target section INSIDE `options.locator` and sends NO
 * top-level `section_tipo` (tool_import_rdf.js get_rdf_data :218-227). The
 * declarative 'section' gate reads `options.section_tipo`, so it saw nothing,
 * failed closed, and EVERY real request — even a global admin's — was denied
 * with "invalid section target": the action was unreachable from the UI.
 * 'section_list' exists precisely for a target that rides inside the payload,
 * and it still runs BEFORE the handler.
 */
function rdfSectionTipos(options: Record<string, unknown>): unknown[] {
	const locator = (options.locator ?? {}) as { section_tipo?: unknown };
	return locator.section_tipo === undefined ? [] : [locator.section_tipo];
}

async function getRdfData(ctx: ToolActionContext): Promise<ToolResponse> {
	try {
		const o = ctx.options;
		const arValues = (o.ar_values ?? []) as string[];
		const locator = (o.locator ?? {}) as { section_tipo?: string };
		if (locator.section_tipo) {
			// Defense in depth behind the declarative gate — same level, so a direct
			// call can never reach the fetch loop on a weaker check than the wire.
			if ((await getPermissions(ctx.principal, locator.section_tipo, locator.section_tipo)) < 2) {
				return fail('insufficient permissions on the target section');
			}
		}
		if (!Array.isArray(arValues) || arValues.length === 0)
			return fail('Missing ar_values (RDF URIs)');

		const rdfData: { uri: string; subjects: unknown[] }[] = [];
		const errors: string[] = [];
		for (const raw of arValues) {
			const uri = raw.endsWith('.rdf') ? raw : `${raw}.rdf`;
			if (!isSafeRemoteUrl(uri)) {
				errors.push(`SEC-072: refused unsafe RDF URI: ${uri}`);
				continue;
			}
			try {
				const res = await fetch(uri);
				if (!res.ok) {
					errors.push(`${uri}: HTTP ${res.status}`);
					continue;
				}
				const { subjects } = parseRdfXml(await res.text());
				// If a class-map is supplied, return the mapped fields (the dd_object
				// the client form consumes); else the raw subjects.
				const map = ((ctx.options.tool_config as { config?: { main?: unknown[] } })?.config?.main ??
					[]) as RdfMapEntry[];
				const mapped = Array.isArray(map) && map.length > 0 ? applyRdfMap(subjects, map) : null;
				rdfData.push({ uri, subjects: mapped ?? subjects });
			} catch (error) {
				errors.push(`${uri}: ${(error as Error).message}`);
			}
		}
		// The subject→dd_object class-map is config-driven (ledgered); the fetch +
		// parse are done and returned for the client/mapper to consume.
		return {
			result: rdfData,
			msg: 'OK. RDF fetched + parsed. (Ontology class-map to dd_object is ledgered.)',
			errors,
		};
	} catch (error) {
		return fail((error as Error).message);
	}
}

export const tool: ToolServerModule = {
	name: 'tool_import_rdf',
	apiActions: {
		// PHP asserts WRITE (level 2) on the LOCATOR's section (SEC-024 §9.2): the
		// action dereferences external URIs so the resolved values can be written
		// into that record. minLevel 1 let a read-only user drive the server's
		// outbound fetcher.
		get_rdf_data: {
			permission: 'section_list',
			minLevel: 2,
			sectionTipos: rdfSectionTipos,
			handler: getRdfData,
		},
	},
};
