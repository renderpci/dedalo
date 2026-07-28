/**
 * PROFILE PARSING + VALIDATION.
 *
 * A profile is curatorial data, so it arrives as records a curator edited, not
 * as code someone reviewed. It therefore gets the same treatment as any other
 * authored descriptor in this engine: parsed strictly, and REFUSED LOUDLY when
 * it is wrong.
 *
 * The one rule worth stating plainly: a criterion path is validated against the
 * live ontology, hop by hop, and a dangling hop throws. It must never be
 * "skipped because it didn't resolve". A silently dropped criterion does not
 * announce itself — it just quietly stops contributing, and the engine goes on
 * producing confident scores computed from fewer features than the curator
 * configured. Ranked output makes that invisible: everything still looks
 * plausible. A loud failure at parse time is the only version of this a curator
 * can act on.
 */

import { getComponentModel } from '../components/registry.ts';
import { mediaTypeOf } from '../concepts/media.ts';
import { getModelByTipo, getNode, getRecursiveChildrenTipos } from '../ontology/resolver.ts';
import { MAX_PATH_HOPS } from './path_read.ts';
import type {
	Criterion,
	CriterionPathStep,
	CriterionRole,
	IdentificationProfile,
	MatchMode,
	ProfileThresholds,
} from './types.ts';

const ROLES: ReadonlySet<string> = new Set<CriterionRole>([
	'identifying',
	'descriptive',
	'ignored',
]);

const MODES: ReadonlySet<string> = new Set<MatchMode>([
	'same_locator',
	'same_term',
	'normalized_text',
	'numeric_tolerance',
	'date_overlap',
	'image_similarity',
]);

/** Modes whose comparison is meaningless without a tolerance. */
const MODES_NEEDING_TOLERANCE: ReadonlySet<string> = new Set<MatchMode>([
	'numeric_tolerance',
	'image_similarity',
]);

// The hop limit belongs to the walker (path_read.ts), which is what enforces it
// at run time. Re-exported here so a profile can be rejected at PARSE time for
// exceeding a depth the reader would refuse anyway — one definition, two gates.
export { MAX_PATH_HOPS } from './path_read.ts';

export class ProfileError extends Error {
	constructor(message: string) {
		super(`identification profile: ${message}`);
		this.name = 'ProfileError';
	}
}

function asString(value: unknown, field: string): string {
	if (typeof value !== 'string' || value.trim() === '') {
		throw new ProfileError(`${field} must be a non-empty string`);
	}
	return value.trim();
}

function asNumber(value: unknown, field: string, fallback?: number): number {
	if (value === undefined || value === null) {
		if (fallback !== undefined) return fallback;
		throw new ProfileError(`${field} is required`);
	}
	const parsed = typeof value === 'number' ? value : Number(value);
	if (!Number.isFinite(parsed)) throw new ProfileError(`${field} must be a number`);
	return parsed;
}

/** Parse the picked field path. Shape only — ontology truth is checked later. */
function parsePath(raw: unknown, criterionId: string): CriterionPathStep[] {
	if (!Array.isArray(raw) || raw.length === 0) {
		throw new ProfileError(`criterion '${criterionId}' has no field path`);
	}
	// HOPS, not steps: a path of N steps performs N-1 hops, which is the unit
	// path_read.ts caps at run time. Counting steps here made this gate one
	// stricter than the walker, so a 9-step path the reader would have walked
	// was refused at parse time — two gates, two definitions.
	const hops = raw.length - 1;
	if (hops > MAX_PATH_HOPS) {
		throw new ProfileError(
			`criterion '${criterionId}' path is ${hops} hops (max ${MAX_PATH_HOPS})`,
		);
	}
	return raw.map((step, index) => {
		if (step === null || typeof step !== 'object') {
			throw new ProfileError(`criterion '${criterionId}' path step ${index} is not an object`);
		}
		const record = step as Record<string, unknown>;
		return {
			section_tipo: asString(record.section_tipo, `criterion '${criterionId}' step ${index}`),
			component_tipo: asString(record.component_tipo, `criterion '${criterionId}' step ${index}`),
		};
	});
}

function parseCriterion(raw: unknown, index: number): Criterion {
	if (raw === null || typeof raw !== 'object') {
		throw new ProfileError(`criterion ${index} is not an object`);
	}
	const record = raw as Record<string, unknown>;
	const id = asString(record.id ?? `c${index}`, `criterion ${index} id`);

	const role = asString(record.role ?? 'identifying', `criterion '${id}' role`);
	if (!ROLES.has(role)) {
		throw new ProfileError(`criterion '${id}' has unknown role '${role}'`);
	}
	const mode = asString(record.mode ?? 'same_locator', `criterion '${id}' mode`);
	if (!MODES.has(mode)) {
		throw new ProfileError(`criterion '${id}' has unknown match mode '${mode}'`);
	}

	const tolerance =
		record.tolerance === undefined ? undefined : asNumber(record.tolerance, 'tolerance');
	if (MODES_NEEDING_TOLERANCE.has(mode) && tolerance === undefined) {
		throw new ProfileError(`criterion '${id}' uses '${mode}' but sets no tolerance`);
	}

	const weight = asNumber(record.weight, `criterion '${id}' weight`, 1);
	if (weight < 0) throw new ProfileError(`criterion '${id}' weight must not be negative`);

	return {
		id,
		label: asString(record.label ?? id, `criterion '${id}' label`),
		path: parsePath(record.path, id),
		role: role as CriterionRole,
		weight,
		mode: mode as MatchMode,
		required: record.required === true,
		...(tolerance === undefined ? {} : { tolerance }),
	};
}

function parseThresholds(raw: unknown): ProfileThresholds {
	const record = (raw ?? {}) as Record<string, unknown>;
	const sameType = asNumber(record.sameType, 'thresholds.sameType', 0.85);
	const candidate = asNumber(record.candidate, 'thresholds.candidate', 0.5);
	for (const [name, value] of [
		['sameType', sameType],
		['candidate', candidate],
	] as const) {
		if (value < 0 || value > 1) {
			throw new ProfileError(`thresholds.${name} must be within 0..1 (got ${value})`);
		}
	}
	if (candidate > sameType) {
		throw new ProfileError(
			`thresholds.candidate (${candidate}) is above thresholds.sameType (${sameType}) — nothing could ever be a candidate without already being the same type`,
		);
	}
	return { sameType, candidate };
}

/** Parse a raw profile (a record's data, or a test fixture) into the typed shape. */
export function parseProfile(raw: unknown): IdentificationProfile {
	if (raw === null || typeof raw !== 'object') throw new ProfileError('profile is not an object');
	const record = raw as Record<string, unknown>;

	const sectionTipos = Array.isArray(record.sectionTipos)
		? record.sectionTipos.map((tipo, index) => asString(tipo, `sectionTipos[${index}]`))
		: [];
	if (sectionTipos.length === 0) {
		throw new ProfileError('profile applies to no section');
	}

	const rawCriteria = Array.isArray(record.criteria) ? record.criteria : [];
	const criteria = rawCriteria.map(parseCriterion);
	const seen = new Set<string>();
	for (const criterion of criteria) {
		if (seen.has(criterion.id)) {
			throw new ProfileError(`duplicate criterion id '${criterion.id}'`);
		}
		seen.add(criterion.id);
	}
	if (!criteria.some((criterion) => criterion.role === 'identifying')) {
		// Without one, every candidate scores identically and the profile can
		// only ever say "everything matches equally".
		throw new ProfileError('profile has no identifying criterion');
	}

	return {
		id: asString(record.id, 'profile id'),
		label: asString(record.label ?? record.id, 'profile label'),
		sectionTipos,
		typeSectionTipo:
			record.typeSectionTipo === undefined || record.typeSectionTipo === null
				? null
				: asString(record.typeSectionTipo, 'typeSectionTipo'),
		previewComponent:
			record.previewComponent === undefined || record.previewComponent === null
				? null
				: asString(record.previewComponent, 'previewComponent'),
		criteria,
		thresholds: parseThresholds(record.thresholds),
		exactSetIdentity: record.exactSetIdentity === true,
	};
}

/**
 * Check every criterion path against the LIVE ontology and throw on the first
 * hop that does not exist. Separate from {@link parseProfile} because it needs
 * the database, and because shape errors should be reportable without one.
 *
 * What is verified per hop: the component exists and belongs to the section it
 * is declared under, and — for every hop but the last — that it is a relation
 * that can actually be walked into the next section.
 */
export async function validateProfilePaths(profile: IdentificationProfile): Promise<void> {
	/** section_tipo → its component tipos. One walk per section, per call. */
	const sectionComponents = new Map<string, Set<string>>();
	for (const criterion of profile.criteria) {
		for (let index = 0; index < criterion.path.length; index++) {
			const step = criterion.path[index] as CriterionPathStep;
			const node = await getNode(step.component_tipo);
			if (node === null) {
				throw new ProfileError(
					`criterion '${criterion.id}' hop ${index} names component '${step.component_tipo}', which does not exist`,
				);
			}
			const model = await getModelByTipo(step.component_tipo);
			if (model === null) {
				throw new ProfileError(
					`criterion '${criterion.id}' hop ${index} component '${step.component_tipo}' has no model`,
				);
			}
			// A component that exists but lives in ANOTHER section is the mistake a
			// hand-edited (or stale) path actually makes — and it fails INVISIBLY:
			// path_read looks the tipo up in the step's matrix table, finds nothing,
			// and the criterion reads as "not recorded" forever. The membership
			// question is the same containment walk the search picker uses.
			if (
				!(await sectionHoldsComponent(step.section_tipo, step.component_tipo, sectionComponents))
			) {
				throw new ProfileError(
					`criterion '${criterion.id}' hop ${index} declares component '${step.component_tipo}' under section '${step.section_tipo}', which does not contain it`,
				);
			}
			// Every hop but the last must be walkable: a literal in the middle of
			// a path means the curator picked a field, not a route to one.
			const isLastHop = index === criterion.path.length - 1;
			if (!isLastHop && !(await isWalkable(step.component_tipo))) {
				throw new ProfileError(
					`criterion '${criterion.id}' hop ${index} ('${step.component_tipo}', ${model}) is not a relation, so the path cannot continue through it`,
				);
			}
		}
	}
}

/**
 * Check the profile's `previewComponent` against the LIVE ontology.
 *
 * Same posture as the path validation above, for the same reason: the failure
 * mode is INVISIBLE. A misspelled or non-media tipo does not error at read
 * time — it simply produces no thumbnail, forever, on a panel whose whole job
 * is visual comparison, and "no photo on this record" is indistinguishable from
 * "the descriptor is wrong". So it is refused at parse time instead.
 *
 * What is required: the component exists, has a model, that model is a media
 * model whose type builds a THUMB tier (`component_svg` does not, so it can
 * never stand for the object in a list), and the component belongs to at least
 * ONE of the profile's sections. "At least one" rather than all: a profile may
 * legitimately span sections, and media components are per-section, so demanding
 * membership everywhere would forbid a configuration that works.
 */
export async function validateProfilePreviewComponent(
	profile: IdentificationProfile,
): Promise<void> {
	const tipo = profile.previewComponent;
	if (tipo === null) return;

	if ((await getNode(tipo)) === null) {
		throw new ProfileError(`previewComponent '${tipo}' does not exist`);
	}
	const model = await getModelByTipo(tipo);
	if (model === null) {
		throw new ProfileError(`previewComponent '${tipo}' has no model`);
	}
	const spec = mediaTypeOf(model);
	if (spec === null) {
		throw new ProfileError(
			`previewComponent '${tipo}' is ${model}, which is not a media component — it cannot supply a thumbnail`,
		);
	}
	if (!spec.hasThumb) {
		throw new ProfileError(
			`previewComponent '${tipo}' is ${model}, whose media type builds no thumb derivative`,
		);
	}

	const sectionComponents = new Map<string, Set<string>>();
	for (const sectionTipo of profile.sectionTipos) {
		if (await sectionHoldsComponent(sectionTipo, tipo, sectionComponents)) return;
	}
	throw new ProfileError(
		`previewComponent '${tipo}' is not held by any of the profile's sections [${profile.sectionTipos.join(', ')}]`,
	);
}

/**
 * Whether `sectionTipo` contains `componentTipo`, memoized per call.
 *
 * The walk is `getRecursiveChildrenTipos` — the shared containment rule (it does
 * not descend into nested sections/areas), so this agrees with the field picker
 * that produced the path. VIRTUAL SECTIONS fall through to their real section:
 * a virtual section carries only list/config children, never components (see
 * resolver.ts getComponentFilterTipo), so a strict own-subtree answer would
 * reject every legitimate path declared under one.
 */
async function sectionHoldsComponent(
	sectionTipo: string,
	componentTipo: string,
	cache: Map<string, Set<string>>,
): Promise<boolean> {
	let components = cache.get(sectionTipo);
	if (components === undefined) {
		components = new Set(await getRecursiveChildrenTipos(sectionTipo));
		if (components.size === 0) {
			const relations = (await getNode(sectionTipo))?.relations;
			const realTipo = Array.isArray(relations)
				? (relations[0] as { tipo?: unknown } | undefined)?.tipo
				: undefined;
			if (typeof realTipo === 'string' && realTipo !== sectionTipo) {
				components = new Set(await getRecursiveChildrenTipos(realTipo));
			}
		}
		cache.set(sectionTipo, components);
	}
	return components.has(componentTipo);
}

/**
 * Whether a component links to other records — i.e. whether a path can continue
 * through it. Asked of the component registry rather than a model name list, so
 * a newly added relation model is walkable without editing this file.
 */
async function isWalkable(componentTipo: string): Promise<boolean> {
	const model = await getModelByTipo(componentTipo);
	if (model === null) return false;
	return getComponentModel(model)?.column === 'relation';
}
