/**
 * ONE registry of deliberate client-module substitutions, consulted by every
 * gate that installs a `Bun.plugin` resolver over the browser tree.
 *
 * WHY THIS EXISTS. `Bun.plugin` is PROCESS-GLOBAL and first-match-wins, and it
 * cannot be unregistered. Two gates that each install an `onResolve` over the
 * client tree therefore do not merely coexist — the one whose file runs first
 * answers the other's imports for the rest of the process. That is not
 * hypothetical: `client_relation_move_native` claims every relative import
 * whose importer sits under `tools/` (it needs that: its graph reaches
 * `tools/tool_export/js/export_user_presets.js`), and it was answering
 * `tool_transcription`'s `core/common/js/ui.js` with the REAL client module in
 * place of that gate's own stub. `transcription_status_panel` then measured a
 * foreign element, dropped from 30 assertions to 13, and was red in every full
 * run while passing 12/12 alone — and, because the assertion floor reads the
 * same census, it blocked the whole ratchet from being re-frozen.
 *
 * NOT THE WHOLE STORY (2026-09-26): the registry settles PLUGIN order only. A
 * `mock.module` on the REAL ui.js path (four gates register one, never reverted)
 * still beat that gate's plugin redirect; it now re-masks the real path too
 * (see transcription_status_panel.test.ts).
 *
 * THE RULE. A gate that needs a specific module replaced REGISTERS THAT FACT
 * here, and every resolver plugin asks this registry BEFORE its own logic. The
 * answer is then the same whichever plugin got there first, so the outcome no
 * longer depends on file order.
 *
 * The registry is process-global on purpose — it mirrors the lifetime of the
 * plugins that read it — and each entry is removed in the registering file's
 * `afterAll`, so a leak here is a leak the registering gate can see and fix.
 */

/** One deliberate substitution: specifiers matching `match` resolve to `path`. */
interface ClientModuleOverride {
	match: RegExp;
	path: string;
	/** The gate that asked for it — named in the error when two gates collide. */
	owner: string;
}

const overrides: ClientModuleOverride[] = [];

/**
 * Declare that `match`ing specifiers resolve to `path` for as long as the
 * registering gate runs. Two live overrides whose patterns are identical are a
 * REFUSAL, not a silent last-wins: that is the collision this module exists to
 * make visible.
 */
export function registerClientModuleOverride(match: RegExp, path: string, owner: string): void {
	const clash = overrides.find((entry) => entry.match.source === match.source);
	if (clash !== undefined) {
		throw new Error(
			`client module override collision on /${match.source}/: '${clash.owner}' already owns it, '${owner}' asked for it too. Two gates cannot substitute the same client module concurrently — split the specifier or share one stub.`,
		);
	}
	overrides.push({ match, path, owner });
}

/** Drop an override. Call it in the registering file's `afterAll`. */
export function clearClientModuleOverride(match: RegExp): void {
	const index = overrides.findIndex((entry) => entry.match.source === match.source);
	if (index >= 0) overrides.splice(index, 1);
}

/**
 * The substitution for `specifier`, or null. EVERY resolver plugin over the
 * browser tree must consult this first — that is what makes the answer
 * independent of which plugin registered earliest.
 */
export function resolveClientModuleOverride(specifier: string): string | null {
	for (const entry of overrides) {
		if (entry.match.test(specifier)) return entry.path;
	}
	return null;
}

/** Live overrides, for a gate that wants to assert its own teardown. */
export function clientModuleOverrideCount(): number {
	return overrides.length;
}
