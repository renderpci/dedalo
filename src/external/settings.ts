/**
 * THE ONE SETTINGS DOOR of the external subsystem.
 *
 * Every operator knob src/external obeys is read through `externalSettings()`,
 * and `external_isolation_tripwire` fails on a `config.external` read anywhere
 * else under src/external/**. One door means the kill switches, the host
 * allowlist and the ceilings cannot be consulted inconsistently — and it gives
 * the test suite a single, guarded place to state a scenario.
 *
 * WHY A TEST OVERRIDE EXISTS. The frozen config is built at module import
 * (src/config/config.ts), and `bun test` shares one module graph across files —
 * so a test cannot set `DEDALO_EXTERNAL_ALLOWED_HOSTS` for its own case without
 * the whole suite's boot honouring it. The precedents in this codebase are
 * exactly this shape (`core/media/protection.ts:pathOverridesForTests`,
 * `diffusion/targets/mediastore/media_index.ts:baseOverrideForTests`): a single
 * module-level slot, null in production, set and cleared around one case.
 *
 * LIFECYCLE of that slot (its ALLOWLISTED_MODULE_LET justification): it holds
 * OPERATOR settings — install-wide values that carry no request identity
 * (no user, session, lang, section or record can ever land in it). Production
 * never writes it: nothing under src/ calls the setter, which the isolation
 * tripwire asserts.
 */

import type { ExternalServicesConfig } from '../config/config.ts';
import { config } from '../config/config.ts';

let overridesForTests: Partial<ExternalServicesConfig> | null = null;

/**
 * The effective operator settings. In production this IS `config.external`;
 * under a test that declared a scenario, the declared fields win.
 */
export function externalSettings(): ExternalServicesConfig {
	if (overridesForTests === null) return config.external;
	return { ...config.external, ...overridesForTests };
}

/**
 * TEST SEAM. Pass a partial to declare a scenario, `null` to restore the real
 * configuration. Every test that sets it must clear it (afterEach), or the next
 * file inherits a fiction.
 */
export function overrideExternalSettingsForTests(
	overrides: Partial<ExternalServicesConfig> | null,
): void {
	overridesForTests = overrides;
}
