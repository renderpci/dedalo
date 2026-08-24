/**
 * tool_lang_multi server module (PHP tool_lang_multi::automatic_translation).
 * PHP delegates to tool_lang::automatic_translation after its own gate, so the
 * server behavior is identical — the "multi" is a client-side affordance (the JS
 * fires one call per target lang). Config is read from tool_lang (PHP
 * get_called_class resolves to tool_lang through the delegation).
 */

import type { ToolResponse, ToolServerModule } from '../../../src/core/tools/module.ts';
import { runAutomaticTranslation } from '../../../src/core/tools/translation.ts';

export const tool: ToolServerModule = {
	name: 'tool_lang_multi',
	apiActions: {
		automatic_translation: {
			permission: null,
			gatedInHandler:
				'assertTranslationPermissions(...) inside runAutomaticTranslation (src/core/tools/translation.ts) — the same tipo-PAIR level-2 check plus the `record` in-scope half as tool_lang, since PHP delegates here too (TOOLS-10).',
			handler: async (ctx) => (await runAutomaticTranslation(ctx, 'tool_lang')) as ToolResponse,
		},
	},
};
