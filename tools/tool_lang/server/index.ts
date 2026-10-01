/**
 * tool_lang server module (PHP tool_lang::automatic_translation) — translate one
 * component's source-lang value into a single target lang via the configured
 * server engine (Babel/Apertium). The browser engine (browser_transformer) runs
 * client-side and never reaches here. The full orchestration + external provider
 * seam live in src/core/tools/translation.ts (unit-tested with a stub provider).
 */

import type { ToolResponse, ToolServerModule } from '../../../src/core/tools/module.ts';
import { runAutomaticTranslation } from '../../../src/core/tools/translation.ts';

export const tool: ToolServerModule = {
	name: 'tool_lang',
	apiActions: {
		automatic_translation: {
			permission: null,
			gatedInHandler:
				'authorizeRecordAccess(...) inside runAutomaticTranslation (src/core/tools/translation.ts): THE WRITE DOOR on the (section_tipo, component_tipo, section_id) target at write level 2 — grammar, section floor 1, the dd128-aware pair, the write scope with the non-positive-id refusal ahead of the admin bypass (closure Step 3 req 10; TOOLS-10). It runs before any provider call; the grant it returns is what translateAndWrite writes through.',
			handler: async (ctx) => (await runAutomaticTranslation(ctx, 'tool_lang')) as ToolResponse,
		},
	},
};
