/**
 * TOOL GRANTS for identity fixtures — the ONE derivation of "profile P
 * authorizes tool T" (a dd1067 locator on the dd234 profile → the tool's dd1324
 * registry row), shared by every gate that needs a granted/ungranted contrast
 * on a tool (the agent door `tool_assistant`, the generative RAG `tool_rag`,
 * the vision spend `tool_identify`).
 *
 * The registry id is DERIVED by name through the registry's own door
 * (`getActiveToolMetaBySectionId`), never pinned — a pinned id is a bet on one
 * database's seed order (acl_identity_fixture lost that bet once). Refused
 * when the name does not resolve uniquely, and refused when the tool is
 * `always_active`: `getUserTools` hands an always-active tool to EVERY profile,
 * so a "granted vs ungranted" contrast on it is vacuous by construction.
 *
 * Pure reads: this module writes nothing (the identity fixtures that consume it
 * write the profile row, behind their own `assertTestDatabase`).
 */

/** The dd1324 registry id of a RESTRICTED tool, by name. */
export async function resolveRestrictedToolRegistryId(toolName: string): Promise<number> {
	const { getActiveToolMetaBySectionId } = await import('../../src/core/tools/registry.ts');
	const registry = await getActiveToolMetaBySectionId();
	const matches = [...registry.entries()].filter(([, meta]) => meta.name === toolName);
	if (matches.length !== 1) {
		throw new Error(
			`tool_grant_fixture: the active tool registry holds ${matches.length} rows named '${toolName}' (expected 1 of ${registry.size}) — build the suite DB with 'bun run test:db:setup'.`,
		);
	}
	const [sectionId, meta] = matches[0] as [number, { always_active: boolean }];
	if (meta.always_active) {
		throw new Error(
			`tool_grant_fixture: '${toolName}' is always_active — every profile authorizes it, so a granted/ungranted contrast on it is vacuous.`,
		);
	}
	return sectionId;
}

/** The dd1067 locator a profile's `relation` column carries to authorize `toolName`. */
export async function toolGrantLocator(toolName: string, id = 1) {
	return {
		id,
		type: 'dd151',
		section_id: await resolveRestrictedToolRegistryId(toolName),
		section_tipo: 'dd1324',
		from_component_tipo: 'dd1067',
	};
}
