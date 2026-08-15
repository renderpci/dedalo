/**
 * Thin DedaloError families — constructor sugar that FORCES a code from one
 * domain. A family never adds behaviour; it exists so a call site cannot
 * throw a section_id refusal under the wrong domain, and so catch sites can
 * say `isErrorInDomain(e, 'section_id')` instead of `instanceof TypeError`.
 *
 * ExternalServiceError (src/external/errors.ts) is NOT re-homed here yet:
 * that fold-in is P2 (engineering/ERRORS_SPEC.md §5). Until then the
 * `external.<kind>` codes exist in the registry and the value.ts state map
 * stays the one state authority (agreement is asserted by
 * test/unit/error_registry_native.test.ts).
 */

import { DedaloError, type DedaloErrorFields } from './dedalo_error.ts';
import type { ErrorCode } from './registry.ts';

export type SectionIdCode = Extract<ErrorCode, `section_id.${string}`>;

/** A caller-data refusal from src/core/concepts/section_id.ts (category caller). */
export class SectionIdRefused extends DedaloError {
	constructor(code: SectionIdCode, fields: DedaloErrorFields = {}) {
		super(code, fields);
		this.name = 'SectionIdRefused';
	}
}
