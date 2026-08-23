/**
 * publication_api widget — display-only panel (no execute action); its eager
 * catalog value comes from diffusion config constants (PHP get_ar_widgets).
 * Best-effort on the TS engine: domain/resolve_levels/langs come from
 * DEDALO_DIFFUSION_* env, diffusion_map from the ontology diffusion scan.
 * api_web_user_code_multiple is a PHP install constant with NO TS source —
 * returned empty (documented gap; the client then renders no per-code API
 * buttons).
 */

import type { WidgetModule } from './support.ts';

/**
 * LEDGER — coverage plan §4.4 D7, KNOWN-OPEN AND UNGATED. NOT an exempt adapter
 * shell (the critics RESCUED it from the §5 exempt list): the whole-body catch
 * below is an ERROR-ENVELOPE CHOICE with a wrong-output consequence. A THROWN
 * diffusion-map scan (`getSectionDiffusionMap` reading a broken ontology
 * diffusion config) collapses into a panel BYTE-IDENTICAL to "diffusion is not
 * configured" — the operator is told nothing is published here, and no error is
 * logged, raised or surfaced anywhere. Closing it means either taking the map
 * reader as a parameter and gating the catch arm against an injected thrower, or
 * distinguishing the two panels — the latter is a behaviour change and needs an
 * engineering/wire_contract/ entry.
 */
async function buildPublicationApiValue(): Promise<Record<string, unknown>> {
	try {
		const { readEnv } = await import('../../../config/env.ts');
		const { config } = await import('../../../config/config.ts');
		const { getSectionDiffusionMap } = await import('../../diffusion_bridge/diffusion_map.ts');
		const levelsRaw = readEnv('DEDALO_DIFFUSION_RESOLVE_LEVELS');
		const diffusionSections = [...(await getSectionDiffusionMap())];
		return {
			dedalo_diffusion_domain: readEnv('DEDALO_DIFFUSION_DOMAIN') ?? null,
			dedalo_diffusion_resolve_levels:
				levelsRaw !== undefined && levelsRaw !== '' ? Number(levelsRaw) : null,
			api_web_user_code_multiple: [],
			// config.diffusion.langs, NOT a raw read: this panel used to comma-split the
			// key itself AND report [] when it was unset, while the engine derived the
			// project languages — so the panel said "no diffusion languages" about an
			// installation that was publishing several. The frozen oracle
			// (widgets_differential.json) shows the full derived set: the PANEL was wrong.
			dedalo_diffusion_langs: [...config.diffusion.langs],
			diffusion_map: { sections: diffusionSections, engine_reachable: null },
		};
	} catch {
		return {
			dedalo_diffusion_domain: null,
			dedalo_diffusion_resolve_levels: null,
			api_web_user_code_multiple: [],
			dedalo_diffusion_langs: [],
			diffusion_map: { sections: [], engine_reachable: null },
		};
	}
}

export const widget: WidgetModule = {
	spec: {
		id: 'publication_api',
		category: 'diffusion',
		label: { kind: 'literal', text: 'Publication server API' },
	},
	eagerValue: buildPublicationApiValue,
};
