/**
 * THE EXTERNAL-SERVICE REGISTRY — name → adapter, frozen at module load.
 *
 * An unknown name THROWS `ExternalServiceNotRegisteredError`. It never returns
 * null and never returns `[]`, and that is the whole design decision: the name
 * comes from `api_config.entity` / a `request_config[].api_engine`, both
 * EDITABLE ONTOLOGY DATA. A typo there must surface as a loud, named failure an
 * operator can act on, not as a component that silently shows nothing (which is
 * indistinguishable from "this record has no data").
 *
 * Adding a service: one file under `services/`, one line here, one row in
 * `services/README.md`. No engine edit — that constraint is what
 * external_registry_totality_tripwire keeps honest.
 */

import type { ExternalServiceCapabilities, ExternalServiceModel } from './descriptor_types.ts';
import { ExternalServiceNotRegisteredError } from './errors.ts';
import { zenon } from './services/zenon.ts';

/** ReadonlyMap: a frozen dispatch table, not a cache (module_state_tripwire). */
const EXTERNAL_SERVICES: ReadonlyMap<string, ExternalServiceModel> = new Map([
	[zenon.service, zenon],
]);

/** True when a name resolves to an adapter — for callers that must branch, not fail. */
export function hasExternalService(name: string): boolean {
	return EXTERNAL_SERVICES.has(name.toLowerCase());
}

/**
 * The adapter for a service name. Throws (never null) — see the header.
 * `context` only enriches the error message; it never changes the lookup.
 */
export function getExternalService(
	name: string,
	context: { sectionTipo?: string } = {},
): ExternalServiceModel {
	const model = EXTERNAL_SERVICES.get(name.toLowerCase());
	if (model === undefined) {
		throw new ExternalServiceNotRegisteredError({
			service: name,
			...(context.sectionTipo === undefined ? {} : { sectionTipo: context.sectionTipo }),
			detail: `no adapter under src/external/services/ implements it (registered: ${listExternalServiceNames().join(', ')})`,
		});
	}
	return model;
}

/**
 * What a service CAN do, for the callers that must negotiate before they narrow
 * a multi-engine request_config to one item
 * (core/relations/request_config/engine_select.ts). Throws for an unregistered
 * name, exactly like `getExternalService` — a caller that cannot find out what
 * a service supports must not proceed as if it supported everything.
 */
export function externalServiceCapabilities(
	name: string,
	context: { sectionTipo?: string } = {},
): ExternalServiceCapabilities {
	return getExternalService(name, context).capabilities;
}

/** Every registered adapter, for census gates and operator-facing listings. */
export function listExternalServices(): readonly ExternalServiceModel[] {
	return [...EXTERNAL_SERVICES.values()];
}

/** Every registered service NAME, sorted. */
export function listExternalServiceNames(): string[] {
	return [...EXTERNAL_SERVICES.keys()].sort();
}
