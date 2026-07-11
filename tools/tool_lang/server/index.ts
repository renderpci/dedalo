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
		// PHP asserts write level 2 on the (section_tipo, component_tipo) pair +
		// record scope; the shared handler gates imperatively (permission: null).
		automatic_translation: {
			permission: null,
			handler: async (ctx) => (await runAutomaticTranslation(ctx, 'tool_lang')) as ToolResponse,
		},
	},
};
