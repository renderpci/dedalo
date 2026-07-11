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

async function buildPublicationApiValue(): Promise<Record<string, unknown>> {
	try {
		const { readEnv } = await import('../../../config/env.ts');
		const { getSectionDiffusionMap } = await import('../../diffusion_bridge/diffusion_map.ts');
		const levelsRaw = readEnv('DEDALO_DIFFUSION_RESOLVE_LEVELS');
		const langsRaw = readEnv('DEDALO_DIFFUSION_LANGS');
		const diffusionSections = [...(await getSectionDiffusionMap())];
		return {
			dedalo_diffusion_domain: readEnv('DEDALO_DIFFUSION_DOMAIN') ?? null,
			dedalo_diffusion_resolve_levels:
				levelsRaw !== undefined && levelsRaw !== '' ? Number(levelsRaw) : null,
			api_web_user_code_multiple: [],
			dedalo_diffusion_langs:
				langsRaw !== undefined && langsRaw !== ''
					? langsRaw
							.split(',')
							.map((lang) => lang.trim())
							.filter(Boolean)
					: [],
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
