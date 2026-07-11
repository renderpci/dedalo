/**
 * tool_import_rdf server module (PHP tool_import_rdf::get_rdf_data). Fetches each
 * RDF URI (SSRF-guarded) and parses it with the from-scratch RDF/XML parser
 * (rdf_xml.ts, no 3rd-party lib), returning the extracted subjects/properties.
 *
 * The subject→Dédalo ontology CLASS-MAP (properties.xmlns / class_map_to_dd) is
 * config-driven and ledgered; the fetch + graph parse are real. Read gate
 * (section level 1) on the locator's section, matching PHP.
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

/** SSRF guard for outbound RDF fetches (PHP is_safe_remote_url). */
function isSafeRemoteUrl(uri: string): boolean {
	let url: URL;
	try {
		url = new URL(uri);
	} catch {
		return false;
	}
	if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
	const host = url.hostname.toLowerCase();
	if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '169.254.169.254')
		return false;
	if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) return false;
	return true;
}

async function getRdfData(ctx: ToolActionContext): Promise<ToolResponse> {
	try {
		const o = ctx.options;
		const arValues = (o.ar_values ?? []) as string[];
		const locator = (o.locator ?? {}) as { section_tipo?: string };
		if (locator.section_tipo) {
			// Read gate on the target section (PHP assert_section_permission level 1... 2).
			if ((await getPermissions(ctx.principal, locator.section_tipo, locator.section_tipo)) < 1) {
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
		get_rdf_data: { permission: 'section', minLevel: 1, handler: getRdfData },
	},
};
