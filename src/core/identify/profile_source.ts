/**
 * WHERE A PROFILE COMES FROM — the ontology descriptor source.
 *
 * `profile.ts` knows how to parse and validate a profile; nothing produced one.
 * This module is the first source: a section's ontology node declares its
 * identification rules under `properties.identify`, exactly where and how
 * `properties.rag.context` declares the multimodal image layer (ai/rag/config.ts
 * — same place, same posture: strict parse, loud refusal, virtual-aware read).
 *
 * ── THE DESCRIPTOR ────────────────────────────────────────────────────────────
 *
 * On the SECTION node (e.g. `numisdata4`, Coins):
 *
 *   properties.identify = {
 *     "id": "coin_types",                       // optional, defaults to the section tipo
 *     "label": "Coin identification",           // optional, defaults to the id
 *     "sectionTipos": ["numisdata4"],           // optional, defaults to [this section]
 *     "typeSectionTipo": "numisdata3",          // optional; null when there is no typology
 *     "previewComponent": "numisdata21",        // optional; the media component whose
 *                                               // thumb illustrates a candidate
 *     "exactSetIdentity": false,                // optional; the die-study gate
 *     "thresholds": { "sameType": 0.85, "candidate": 0.5 },
 *     "criteria": [
 *       {
 *         "id": "obverse_legend",
 *         "label": "Type › Obverse legend",
 *         "path": [                             // an SQO path, outward from the object
 *           { "section_tipo": "numisdata4", "component_tipo": "numisdata161" },  // Coin → Type
 *           { "section_tipo": "numisdata3", "component_tipo": "numisdata40"  }   // Type → Legend
 *         ],
 *         "role": "identifying",                // identifying | descriptive | ignored
 *         "mode": "same_locator",               // see types.ts MatchMode
 *         "weight": 3,
 *         "required": true                      // builds the pool; the rest only rank it
 *       },
 *       {
 *         "id": "weight_g",
 *         "label": "Weight (g)",
 *         "path": [{ "section_tipo": "numisdata4", "component_tipo": "numisdata22" }],
 *         "role": "descriptive",
 *         "mode": "numeric_tolerance",
 *         "tolerance": 0.15
 *       }
 *     ]
 *   }
 *
 * The dialect is `parseProfile`'s (camelCase at the top level; the path STEPS
 * are snake_case because they are literally SQO path steps and are handed to the
 * search engine unmodified). It is not translated here — one dialect, one
 * parser. Misspellings are refused rather than defaulted, see below.
 *
 * ── WHY EVERY FAILURE IS LOUD ────────────────────────────────────────────────
 *
 * RagConfig drops a malformed embed group and logs: an unindexed facet is
 * recoverable and visible as "no results". Identification cannot afford that
 * posture. A criterion that quietly stops contributing still produces a score —
 * computed from fewer features than the curator configured — and ranked output
 * hides the difference completely: everything still looks plausible. So a
 * malformed descriptor THROWS (`ProfileError`) rather than degrading, and an
 * UNKNOWN key throws too: `weigth: 5` silently becoming `weight: 1` is the same
 * defect wearing a typo.
 *
 * Absence is different from malformation and is NOT an error: a section with no
 * `properties.identify` returns `null` ("this section does not do
 * identification"), which the API turns into a clean decline.
 *
 * ── THE SEAM: RECORD-BACKED PROFILES ─────────────────────────────────────────
 *
 * The long-term design (types.ts, "WHY PROFILES ARE RECORDS, NOT CONFIG") is
 * that a curator edits profiles as ordinary records — one object section holds
 * ceramics, iron and wood, and what identifies each is curatorial knowledge that
 * changes as a collection is studied. The ontology descriptor is the FIRST step,
 * not the destination, because a dd_ontology write needs the operator.
 *
 * The seam is {@link ProfileSourcePort}: `loadProfileForSection` never reads the
 * ontology itself, it asks a port for the raw descriptor. A record-backed source
 * is a second port implementation (read the profile section, select by what the
 * object IS, hand back the same raw object) plus a resolution order in
 * {@link defaultProfileSourcePort}. TWO things must move with it:
 *   1. INVALIDATION. The cache here is `createOntologyCache` because the
 *      descriptor is ontology-derived. A record-backed profile is RECORD-derived
 *      and additionally needs `createDataCache` / `registerSectionDataListener`
 *      on the profile section (the relations/datalist.ts both-axes pattern), or
 *      an edited profile keeps serving until the process restarts.
 *   2. IDENTITY. Reading a profile record is a record read; if profiles are ever
 *      per-project, the port grows a principal PARAMETER and the cache key grows
 *      that dimension with it (isolation rule 4). It must not reach for
 *      `currentPrincipal()` — this module also runs from background jobs.
 */

import { createOntologyCache } from '../ontology/cache_factory.ts';
import { registerOntologyCacheClearer } from '../ontology/cache_invalidation.ts';
import { getNode } from '../ontology/resolver.ts';
import {
	ProfileError,
	parseProfile,
	validateProfilePaths,
	validateProfilePreviewComponent,
} from './profile.ts';
import type { IdentificationProfile } from './types.ts';

/** The ontology key a section declares its identification rules under. */
export const IDENTIFY_PROPERTY = 'identify';

/**
 * Where a raw profile descriptor comes from. The production implementation reads
 * the section's ontology node; tests inject a fake so no test ever needs to write
 * to dd_ontology, and the record-backed source (see the module header) will be a
 * second implementation rather than an edit to the loader.
 */
export interface ProfileSourcePort {
	/**
	 * The raw `properties.identify` object for a section, or null when the
	 * section declares none. Implementations resolve virtual sections themselves.
	 */
	getIdentifyDescriptor(sectionTipo: string): Promise<unknown>;
}

/**
 * What one section's descriptor resolved to. Cached as a VALUE — including the
 * failure — so a malformed descriptor is not re-parsed (and re-path-validated,
 * which costs ontology reads) on every request, while still throwing every time
 * it is asked for. The cache is dropped on any dd_ontology write, which is
 * exactly when a curator's fix lands.
 */
type ProfileOutcome =
	| { kind: 'none' }
	| { kind: 'profile'; profile: IdentificationProfile }
	/**
	 * The refusal is cached as the ERROR ITSELF, not as a message re-wrapped on
	 * every read: ProfileError prefixes what it is given, so rebuilding one from a
	 * stored message would grow a prefix per call ("identification profile:
	 * identification profile: …"). The instance is read-only to consumers.
	 */
	| { kind: 'invalid'; error: ProfileError };

const profileCache = createOntologyCache<string, ProfileOutcome>();

/**
 * Drop the resolved-profile cache. Registered with the hub twice over (the
 * factory registers it by construction; this is the module's public
 * invalidation API and the completion gate's anchor — clearing twice is free).
 */
export function clearIdentifyProfileCache(): void {
	profileCache.clear();
}
registerOntologyCacheClearer(clearIdentifyProfileCache);

/**
 * The production port: the section node's `properties.identify`.
 *
 * VIRTUAL-AWARE, like every other per-section descriptor read in this engine
 * (getSectionMap, RagConfig.getSectionMapRag): the virtual section's OWN node
 * wins, and only when it declares nothing does the real section's node answer
 * (`relations[0].tipo`). Without the fallback every virtual view of a section
 * would silently have no identification; with it, a virtual section can still
 * override with its own descriptor.
 */
export function defaultProfileSourcePort(): ProfileSourcePort {
	return buildOntologyProfileSourcePort(getNode);
}

/** The node fields the ontology port reads (the ResolvedNode slice it needs). */
export interface ProfileSourceNode {
	properties: unknown;
	relations: unknown;
}

/**
 * The ontology port over an injectable node reader. Production passes
 * `getNode`; the virtual-section fallback is testable through a fake reader
 * rather than by writing to dd_ontology.
 */
export function buildOntologyProfileSourcePort(
	readNode: (tipo: string) => Promise<ProfileSourceNode | null>,
): ProfileSourcePort {
	return {
		async getIdentifyDescriptor(sectionTipo: string): Promise<unknown> {
			const node = await readNode(sectionTipo);
			if (node === null) return null;
			const own = readIdentify(node.properties);
			if (own !== null) return own;

			const relations = node.relations;
			const realTipo = Array.isArray(relations)
				? (relations[0] as { tipo?: unknown } | undefined)?.tipo
				: undefined;
			if (typeof realTipo !== 'string' || realTipo === sectionTipo) return null;
			return readIdentify((await readNode(realTipo))?.properties);
		},
	};
}

/**
 * The section's identification profile, or null when it declares none.
 *
 * @throws {ProfileError} when the descriptor exists but is malformed, names an
 * unknown key, or contains a path hop the live ontology does not have. Never a
 * silent skip — see the module header.
 *
 * Results are cached per section (dropped on every dd_ontology write). An
 * INJECTED port bypasses the cache entirely in both directions: a fake must not
 * poison what the server serves, and the server's cache must not answer a test's
 * fake. That asymmetry is deliberate, not an oversight.
 */
export async function loadProfileForSection(
	sectionTipo: string,
	port?: ProfileSourcePort,
): Promise<IdentificationProfile | null> {
	if (port !== undefined) return unwrap(await resolveProfile(sectionTipo, port));

	const cached = profileCache.get(sectionTipo);
	if (cached !== undefined) return unwrap(cached);
	const outcome = await resolveProfile(sectionTipo, defaultProfileSourcePort());
	profileCache.set(sectionTipo, outcome);
	return unwrap(outcome);
}

/** A cached outcome, re-raised as the same loud failure it was the first time. */
function unwrap(outcome: ProfileOutcome): IdentificationProfile | null {
	if (outcome.kind === 'invalid') throw outcome.error;
	return outcome.kind === 'profile' ? outcome.profile : null;
}

/** Read one descriptor and turn it into a cacheable outcome. */
async function resolveProfile(
	sectionTipo: string,
	port: ProfileSourcePort,
): Promise<ProfileOutcome> {
	let raw: unknown;
	try {
		raw = await port.getIdentifyDescriptor(sectionTipo);
	} catch (error) {
		// An ontology read that FAILED is not a section without a profile: saying
		// "no profile" here would turn a transient DB error into a permanent,
		// cached "this section cannot be identified". Fail loudly and cache
		// nothing — resolveProfile's caller only caches what it returns, and this
		// path throws past it.
		throw new ProfileError(
			`could not read the '${IDENTIFY_PROPERTY}' descriptor of section '${sectionTipo}': ${
				error instanceof Error ? error.message : String(error)
			}`,
		);
	}
	if (raw === null || raw === undefined) return { kind: 'none' };

	try {
		if (!isPlainObject(raw)) {
			throw new ProfileError(
				`section '${sectionTipo}' properties.${IDENTIFY_PROPERTY} must be an object`,
			);
		}
		refuseUnknownKeys(raw, PROFILE_KEYS, `section '${sectionTipo}' properties.identify`);
		for (const [index, criterion] of enumerateCriteria(raw.criteria)) {
			refuseUnknownKeys(criterion, CRITERION_KEYS, `criterion ${index}`);
		}
		if (isPlainObject(raw.thresholds)) {
			refuseUnknownKeys(raw.thresholds, THRESHOLD_KEYS, 'thresholds');
		}

		const profile = parseProfile(withSectionDefaults(raw, sectionTipo));
		if (!profile.sectionTipos.includes(sectionTipo)) {
			// A profile attached to a section it declares it does not apply to is a
			// curator error with a silent consequence: the pool query would search
			// OTHER sections while the seed lives here.
			throw new ProfileError(
				`profile '${profile.id}' is declared on section '${sectionTipo}' but its sectionTipos are [${profile.sectionTipos.join(', ')}]`,
			);
		}
		await validateProfilePaths(profile);
		await validateProfilePreviewComponent(profile);
		return { kind: 'profile', profile };
	} catch (error) {
		if (error instanceof ProfileError) return { kind: 'invalid', error };
		throw error;
	}
}

/**
 * The raw `identify` block of a node's properties; null means ABSENT.
 *
 * A present-but-wrong value (`identify: "yes"`) is returned as-is rather than
 * flattened to null: it must reach the parser and be refused loudly, because
 * "this section declares nothing" and "this section declares nonsense" are the
 * two answers a curator most needs told apart.
 */
function readIdentify(properties: unknown): unknown {
	if (!isPlainObject(properties)) return null;
	const identify = properties[IDENTIFY_PROPERTY];
	return identify === undefined ? null : identify;
}

/**
 * The descriptor is LOCATED by section, so the two fields that merely repeat
 * that location are optional: `sectionTipos` defaults to this section and `id`
 * to its tipo. Everything else the curator states explicitly.
 */
function withSectionDefaults(raw: Record<string, unknown>, sectionTipo: string): unknown {
	return {
		...raw,
		id: raw.id ?? sectionTipo,
		sectionTipos: raw.sectionTipos ?? [sectionTipo],
	};
}

const PROFILE_KEYS: ReadonlySet<string> = new Set([
	'id',
	'label',
	'sectionTipos',
	'typeSectionTipo',
	'previewComponent',
	'criteria',
	'thresholds',
	'exactSetIdentity',
]);

const CRITERION_KEYS: ReadonlySet<string> = new Set([
	'id',
	'label',
	'path',
	'role',
	'weight',
	'mode',
	'required',
	'tolerance',
]);

const THRESHOLD_KEYS: ReadonlySet<string> = new Set(['sameType', 'candidate']);

/**
 * Refuse a key the parser would ignore.
 *
 * Everything in this file exists so a criterion cannot quietly contribute less
 * than the curator asked for, and an ignored key is precisely that failure:
 * `weigth: 5` parses fine and weighs 1. The message names the nearest known key
 * when the spelling differs only in case/underscores, which covers the whole
 * snake_case-vs-camelCase mistake in one line ("section_tipos" → "sectionTipos").
 */
function refuseUnknownKeys(
	raw: Record<string, unknown>,
	known: ReadonlySet<string>,
	where: string,
): void {
	for (const key of Object.keys(raw)) {
		if (known.has(key)) continue;
		const flat = key.toLowerCase().replace(/[_-]/g, '');
		const nearest = [...known].find((candidate) => candidate.toLowerCase() === flat);
		throw new ProfileError(
			nearest === undefined
				? `${where}: unknown key '${key}'`
				: `${where}: unknown key '${key}' — did you mean '${nearest}'?`,
		);
	}
}

/** The criteria entries worth key-checking (shape errors are the parser's job). */
function enumerateCriteria(raw: unknown): Array<[number, Record<string, unknown>]> {
	if (!Array.isArray(raw)) return [];
	const out: Array<[number, Record<string, unknown>]> = [];
	raw.forEach((entry, index) => {
		if (isPlainObject(entry)) out.push([index, entry]);
	});
	return out;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
