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
				'assertTranslationPermissions(...) inside runAutomaticTranslation (src/core/tools/translation.ts): getPermissions on the (section_tipo, component_tipo) PAIR at level 2 — which a section-level check does not imply — followed by assertActionPermission with the `record` kind for the record-in-scope half (TOOLS-10). Both run before any provider call or write.',
			handler: async (ctx) => (await runAutomaticTranslation(ctx, 'tool_lang')) as ToolResponse,
		},
	},
};
